# Game Day W 🏀

A sleek, easy-to-use WNBA lookup app. Current rosters, schedules, stats, trades, injury reports, and more.

## Features

- **Current Rosters** - Browse WNBA team rosters and player info
- **2026 Schedule** - Full season schedule with venues
- **Trades & Waivers** - Latest player transactions (announcements)
- **Player Stats** - Quick lookup for player statistics
- **Coach Directory** - Find coaches by team
- **Injury Report** - Stay updated on player injuries
- **Dashboard Design** - Clean, minimal card-based interface

## Tech Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 (no build step)
- **Backend:** Express.js (Node.js)
- **API:** SportRadar WNBA API
- **Deployment:** Vercel

## Setup

1. **Open the folder in VS Code:**
   ```bash
   code ~/Projects/GameDayW
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000`

## Deployment to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Deploy (automatic)

Vercel will automatically handle the Express backend and serve the static frontend.

## Project Structure

```
Game Day W/
├── api/
│   └── index.js              # Express server & SportRadar proxy
├── public/
│   ├── index.html            # Main page
│   ├── styles.css            # Dashboard styling
│   └── app.js                # Frontend logic
├── package.json              # Dependencies
├── vercel.json              # Vercel deployment config
└── .gitignore
```

## API Endpoints

Your Express backend provides:

- `GET /api/schedule` - Full 2026 season schedule
- `GET /api/teams` - All WNBA teams with rosters
- `GET /api/team/:teamId` - Specific team profile
- `GET /api/player/:playerId` - Player profile & stats
- `GET /api/standings` - League standings

## Notes

- API key is embedded in `api/index.js` (fine for trial/development)
- For production, move to environment variables
- Some features (trades, injuries) may need additional SportRadar endpoints
- Placeholder sections ready for expanded features

## TODO

- [ ] Real-time trades/waivers banner
- [ ] Player stats search integration
- [ ] Injury report data fetching
- [ ] Team detail views
- [ ] Schedule filtering by date/team
- [ ] Mobile optimization

---

**Made with ❤️ for WNBA fans**
