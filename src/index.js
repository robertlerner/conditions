import fetch from 'node-fetch';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load locations from config
async function loadLocations() {
  const configPath = path.join(__dirname, '../config/locations.json');
  const data = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(data).locations;
}

// Fetch weather from yr.no APIs
async function fetchWeather(latitude, longitude) {
  // Fetch from Nowcast for temp and precipitation
  const nowcastUrl = `https://api.met.no/weatherapi/nowcast/2.0/complete?lat=${latitude}&lon=${longitude}`;
  const nowcastResponse = await fetch(nowcastUrl, {
    headers: {
      'User-Agent': 'conditions-watch/1.0 github.com/robertlerner/conditions'
    }
  });

  if (!nowcastResponse.ok) {
    throw new Error(`Nowcast API error: ${nowcastResponse.status}`);
  }

  const nowcastData = await nowcastResponse.json();
  const nowcastTimeseries = nowcastData.properties.timeseries;

  // Get current temperature
  const current = nowcastTimeseries[0];
  const temperature = current.data.instant.details.air_temperature;

  // Sum precipitation over next 6 hours
  let precipitationSum = 0;
  for (let i = 0; i < Math.min(6, nowcastTimeseries.length); i++) {
    const entry = nowcastTimeseries[i];
    if (entry.data.next_1_hours?.details?.precipitation_amount !== undefined) {
      precipitationSum += entry.data.next_1_hours.details.precipitation_amount;
    }
  }

  // Fetch from Locationforecast for cloud cover
  const forecastUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
  const forecastResponse = await fetch(forecastUrl, {
    headers: {
      'User-Agent': 'conditions-watch/1.0 github.com/robertlerner/conditions'
    }
  });

  let cloudCover = null;
  if (forecastResponse.ok) {
    const forecastData = await forecastResponse.json();
    const forecastCurrent = forecastData.properties.timeseries[0];
    cloudCover = forecastCurrent.data.instant.details.cloud_area_fraction || 0;
  }

  return {
    temperature,
    precipitation: precipitationSum,
    cloudCover,
    timestamp: current.time
  };
}

// Append data to Google Sheets (long format)
async function appendToSheet(auth, locations, weatherData) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = now.getUTCHours().toString().padStart(2, '0'); // HH

  // Check if headers exist, create if not
  const headerRange = 'Sheet1!A1:G1';
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange
  });

  const existingHeaders = headerResponse.data.values?.[0] || [];

  if (existingHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource: { values: [['Date', 'Hour', 'Area', 'Location', 'Temperature', 'Precipitation', 'CloudCover']] }
    });
  }

  // Build rows: one row per location
  const rows = weatherData.map(weather => [
    date,
    hour,
    weather.area,
    weather.location,
    weather.temperature,
    weather.precipitation,
    weather.cloudCover
  ]);

  // Append all rows at once
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:G',
    valueInputOption: 'RAW',
    resource: { values: rows }
  });
}

// Main execution
async function main() {
  try {
    const dryRun = process.argv.includes('--dry-run');

    console.log('Starting weather check (using Nowcast API)...');
    if (dryRun) console.log('🔍 DRY RUN MODE - Will not write to Google Sheets');

    // Load locations
    const locations = await loadLocations();
    console.log(`Loaded ${locations.length} locations`);

    // Group locations by area
    const locationsByArea = locations.reduce((acc, location) => {
      const area = location.area || 'Other';
      if (!acc[area]) acc[area] = [];
      acc[area].push(location);
      return acc;
    }, {});

    // Fetch weather for all locations, grouped by area
    const weatherData = [];
    for (const [area, areaLocations] of Object.entries(locationsByArea)) {
      console.log(`\n📍 ${area}:`);
      for (const location of areaLocations) {
        console.log(`  Fetching weather for ${location.name}...`);
        const weather = await fetchWeather(location.latitude, location.longitude);
        weatherData.push({
          area: location.area || 'Other',
          location: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          temperature: weather.temperature,
          precipitation: weather.precipitation,
          cloudCover: weather.cloudCover
        });
        console.log(`    Temperature: ${weather.temperature}°C, Precipitation (6h): ${weather.precipitation}mm, Cloud cover: ${weather.cloudCover}% (timestamp: ${weather.timestamp})`);

        // Be nice to yr.no API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (dryRun) {
      console.log('\n✅ Dry run complete! Data fetched successfully but not written to sheet.');
      return;
    }

    // Authenticate with Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    // Append to sheet
    console.log('Writing to Google Sheets...');
    await appendToSheet(auth, locations, weatherData);
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
