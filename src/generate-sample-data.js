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

// Generate realistic temperature data for a location
function generateTemperature(location, date, hour) {
  // Base temperature varies by location (using latitude as a rough indicator)
  const baseTemp = 15 - (location.latitude - 60) * 2; // Colder in the north

  // Seasonal variation (simple sine wave over the year)
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const seasonalVariation = Math.sin((dayOfYear - 80) * (2 * Math.PI / 365)) * 10;

  // Daily variation (colder at night, warmer during day)
  const dailyVariation = Math.sin((hour - 6) * Math.PI / 12) * 3;

  // Random noise
  const noise = (Math.random() - 0.5) * 2;

  return baseTemp + seasonalVariation + dailyVariation + noise;
}

// Generate sample data
async function generateSampleData() {
  const locations = await loadLocations();
  const rows = [];

  // Generate data for last 66 days, 4 times per day
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 66);

  console.log(`Generating sample data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log(`Locations: ${locations.map(l => l.name).join(', ')}`);

  const hours = ['00', '06', '12', '18'];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (const hour of hours) {
      for (const location of locations) {
        const temp = generateTemperature(location, d, parseInt(hour));
        rows.push([
          dateStr,
          hour,
          location.name,
          temp.toFixed(1)
        ]);
      }
    }
  }

  console.log(`Generated ${rows.length} data points`);
  return rows;
}

// Append to Google Sheet
async function appendToSheet(auth, rows) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  // Check if headers exist
  const headerRange = 'Sheet1!A1:D1';
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange
  });

  const existingHeaders = headerResponse.data.values?.[0] || [];

  if (existingHeaders.length === 0) {
    console.log('Creating headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource: { values: [['Date', 'Hour', 'Location', 'Temperature']] }
    });
  }

  // Append data in batches (Google Sheets API limit)
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:D',
      valueInputOption: 'RAW',
      resource: { values: batch }
    });
  }
}

// Main
async function main() {
  try {
    console.log('Starting sample data generation...');

    // Authenticate with Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    // Generate sample data
    const rows = await generateSampleData();

    // Upload to sheet
    console.log('Uploading to Google Sheets...');
    await appendToSheet(auth, rows);

    console.log('Done! Sample data has been added to your sheet.');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
