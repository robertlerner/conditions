# Conditions Watch - Project Context

## Overview
Weather tracking application that monitors temperature at specified GPS coordinates and logs data to Google Sheets.

## Architecture
- **Runtime**: Node.js
- **Deployment**: GitHub Actions (scheduled workflow, 4x daily)
- **Weather API**: yr.no (free, no API key required)
- **Storage**: Google Sheets API
- **Repository**: Public GitHub repo (free Actions)

## Project Structure
- `config/locations.json` - GPS coordinates to monitor
- `src/index.js` - Main script that fetches weather and writes to Sheets
- `.github/workflows/weather-check.yml` - Scheduled GitHub Actions workflow

## Key Design Decisions
- Using GitHub Actions for free scheduled job execution
- yr.no chosen for reliable, free weather data (Norwegian Meteorological Institute)
- Google Sheets for simple, visual data storage without database complexity
- Config file approach for managing GPS coordinates (simple, no UI needed)

## Data Flow
1. GitHub Actions triggers on schedule (4x daily)
2. Script reads GPS coordinates from config
3. Fetches current temperature from yr.no for each location
4. Appends timestamp + location + temperature to Google Sheets
