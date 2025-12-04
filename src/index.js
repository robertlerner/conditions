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

// Fetch weather from yr.no Nowcast API
async function fetchWeather(latitude, longitude) {
  const url = `https://api.met.no/weatherapi/nowcast/2.0/complete?lat=${latitude}&lon=${longitude}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'conditions-watch/1.0 github.com/robertlerner/conditions'
    }
  });

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  const current = data.properties.timeseries[0];

  return {
    temperature: current.data.instant.details.air_temperature,
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
  const headerRange = 'Sheet1!A1:D1';
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
      resource: { values: [['Date', 'Hour', 'Location', 'Temperature']] }
    });
  }

  // Build rows: one row per location
  const rows = weatherData.map(weather => [
    date,
    hour,
    weather.location,
    weather.temperature
  ]);

  // Append all rows at once
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:D',
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

    // Fetch weather for all locations
    const weatherData = [];
    for (const location of locations) {
      console.log(`Fetching weather for ${location.name}...`);
      const weather = await fetchWeather(location.latitude, location.longitude);
      weatherData.push({
        location: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        temperature: weather.temperature
      });
      console.log(`  Temperature: ${weather.temperature}°C (timestamp: ${weather.timestamp})`);

      // Be nice to yr.no API
      await new Promise(resolve => setTimeout(resolve, 1000));
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
