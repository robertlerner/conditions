# Conditions Watch

Automatically track weather conditions at specified GPS coordinates and log them to Google Sheets.

## Features

- Monitors temperature at multiple GPS locations
- Runs 4 times daily via GitHub Actions (00:00, 06:00, 12:00, 18:00 UTC)
- Uses yr.no (Norwegian Meteorological Institute) for weather data
- Logs data to Google Sheets with timestamp, location, and temperature

## Setup

### 1. Configure Locations

Edit `config/locations.json` to add your GPS coordinates:

```json
{
  "locations": [
    {
      "name": "My Location",
      "latitude": 59.9139,
      "longitude": 10.7522
    }
  ]
}
```

### 2. Create Google Sheet

1. Create a new Google Sheet (headers will be auto-generated on first run)
2. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 3. Set Up Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the Google Sheets API
4. Create a Service Account:
   - Go to IAM & Admin > Service Accounts
   - Create Service Account
   - Grant it no roles (we'll use sheet-level permissions)
   - Create a JSON key and download it
5. Share your Google Sheet with the service account email (found in the JSON)

### 4. Configure GitHub Secrets

In your GitHub repository settings, add these secrets:

- `GOOGLE_CREDENTIALS`: Paste the entire contents of your service account JSON key
- `SHEET_ID`: Your Google Sheet ID

### 5. Install Dependencies

```bash
npm install
```

### 6. Test Locally (Optional)

```bash
export GOOGLE_CREDENTIALS='{"type":"service_account",...}'
export SHEET_ID='your-sheet-id'
npm start
```

## Usage

Once set up, the GitHub Action will run automatically 4 times per day. You can also:

- Trigger manually: Go to Actions tab > Weather Check > Run workflow
- Add/remove locations: Edit `config/locations.json` and commit

## Data Format

The sheet uses a columnar format:
- **Date**: YYYY-MM-DD format
- **Hour**: HH format (00-23 UTC)
- **Location columns**: Each location from config gets its own column with temperature in Celsius

Example:
```
Date       | Hour | Oslo, Norway | New York, USA
2025-12-03 | 00   | 5.2         | 12.3
2025-12-03 | 06   | 4.8         | 11.9
```

## API Credits

Weather data provided by [yr.no](https://yr.no), courtesy of the Norwegian Meteorological Institute.
