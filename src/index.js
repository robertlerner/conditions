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

// Fetch weather from yr.no
async function fetchWeather(latitude, longitude) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'conditions-watch/1.0 github.com/yourusername/conditions-watch'
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

// Append data to Google Sheets
async function appendToSheet(auth, locations, weatherData) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = now.getUTCHours().toString().padStart(2, '0'); // HH

  // Get existing headers
  const headerRange = 'Sheet1!A1:ZZ1';
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange
  });

  let existingHeaders = headerResponse.data.values?.[0] || [];

  // Initialize headers if sheet is empty
  if (existingHeaders.length === 0) {
    existingHeaders = ['Date', 'Hour'];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource: { values: [existingHeaders] }
    });
  }

  // Check for new location names and add them as columns
  const currentLocationNames = existingHeaders.slice(2); // Skip Date and Hour
  const newLocationNames = locations
    .map(l => l.name)
    .filter(name => !currentLocationNames.includes(name));

  if (newLocationNames.length > 0) {
    console.log(`Adding new location columns: ${newLocationNames.join(', ')}`);
    existingHeaders.push(...newLocationNames);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource: { values: [existingHeaders] }
    });
  }

  // Build row with temperatures in correct column order
  const row = [date, hour];

  // Add temperature for each column (skip Date and Hour)
  for (let i = 2; i < existingHeaders.length; i++) {
    const locationName = existingHeaders[i];
    const weather = weatherData.find(w => w.location === locationName);
    row.push(weather ? weather.temperature : '');
  }

  // Append the data row
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:ZZ',
    valueInputOption: 'RAW',
    resource: { values: [row] }
  });
}

// Main execution
async function main() {
  try {
    console.log('Starting weather check...');

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
      console.log(`  Temperature: ${weather.temperature}°C`);

      // Be nice to yr.no API
      await new Promise(resolve => setTimeout(resolve, 1000));
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
