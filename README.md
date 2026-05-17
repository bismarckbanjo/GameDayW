# Game Day W 🏀

A sleek, easy-to-use WNBA lookup app. Built for fans who are tired of sifting through ESPN and the WNBA app just to find out who's playing tonight.

## Features

- **Tonight's Games** — sticky strip with live scores and what's on tonight
- **Live Now** — modal with everything happening today (in progress, upcoming, finished). Game cards open the ESPN boxscore.
- **Favorites** — star your teams; they surface first on Rosters and default-filter Schedule + Injuries
- **Rosters** — browse every WNBA team and player
- **Schedule** — full season, bucketed by Today / Tomorrow / month; cards link to ESPN
- **Player Stats** — lands on league leaders (PPG / RPG / APG / FG%); search any player to see season averages, totals, height, and college
- **Coaches** — head coach by team
- **Injuries** — grouped by team, sorted by date
- **Team Skins** — recolor the UI in your favorite team's palette

## Tech Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 (no build step, no framework)
- **Backend:** Express.js (Node.js 22.x)
- **Data:** ESPN public APIs (no API key required)
- **Deployment:** Vercel (serverless function for the API, static for the frontend)

## Setup

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## Deployment

Pushed to `main` deploys automatically via Vercel. Backend runs as a serverless function; `public/` is served statically.

## Project Structure

```
GameDayW/
├── api/
│   └── index.js              # Express server + ESPN proxy with in-memory cache
├── public/
│   ├── index.html            # SPA shell with tabbed sections
│   ├── app.js                # Frontend logic (tabs, fetch, render, favorites)
│   ├── styles.css            # Design system, layout, theming
│   ├── light.svg / dark.svg  # Brand marks (swap by team skin)
│   ├── icon.png              # Apple touch icon
│   └── manifest.webmanifest  # PWA manifest
├── package.json
├── vercel.json               # Build + routing config
└── FUTURE.md                 # Deferred improvements
```

## API Endpoints

All endpoints proxy ESPN with server-side caching (TTL in parentheses):

- `GET /api/teams` — every team with roster + head coach (6h)
- `GET /api/team/:teamId` — single team detail (6h, shared cache)
- `GET /api/schedule` — full season schedule, May–Oct (60s)
- `GET /api/live` — today's scoreboard, polled by the client every 30s (30s)
- `GET /api/player/:playerId` — profile + season stats (no cache)
- `GET /api/players/search?q=` — name search across every roster (no cache)
- `GET /api/injuries` — grouped injury report (10m)
- `GET /api/leaders` — league leaders in PPG / RPG / APG / FG% (1h), powers the Player Stats landing
- `GET /api/transactions` — headline filter of league news (15m) — endpoint kept but UI tab is hidden
- `GET /api/standings` — raw ESPN standings (5m) — not yet wired into the UI

## Notes

- ESPN APIs are public and unkeyed. There are no secrets to manage.
- The "current season" auto-rolls based on the calendar: May–Oct uses the current year, Nov–Apr uses the prior year (so the offseason still shows the most recent season).
- See `FUTURE.md` for known limitations and planned improvements.

---

**Made for WNBA fans.**
