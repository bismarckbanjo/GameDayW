# Copilot Instructions for Game Day W — Version 1

Version: 1
Date: 2026-05-13

## Build, Test, and Lint Commands
- Install dependencies: `npm install`
- Run locally (dev): `npm run dev` — starts Express backend and serves static frontend at http://localhost:3000
- Start server: `npm start`
- Note: No build, test, or lint scripts are currently defined in package.json. Add `test` / `lint` scripts when introducing tests/linting.

## High-Level Architecture
- Frontend: Vanilla JS, HTML5, CSS3 (served statically from `public/`)
- Backend: Node.js with Express (entry: `api/index.js`)
- API: Backend proxies to SportRadar WNBA API (BASE_URL in `api/index.js`)
- Deployment: Vercel (server + static assets)

## Key Conventions
- Backend endpoints are prefixed with `/api/` and implemented in `api/index.js`.
- API key currently hardcoded in `api/index.js` (development); move to environment variables for production (process.env.SPORTRADAR_KEY).
- No transpilation or bundling step — files served as-is.
- Keep frontend and backend simple and colocated; `api/index.js` serves `public/` static files.

## Main API Endpoints
- GET /api/schedule — 2026 season schedule
- GET /api/teams — All teams
- GET /api/team/:teamId — Team profile
- GET /api/player/:playerId — Player profile
- GET /api/standings — League standings

## AI / Copilot Hints
- Inspect `api/index.js` first to find endpoints and API_KEY usage.
- Check `public/` for UI expectations and unimplemented placeholders (trades, injuries, player search).
- If adding tests, create an npm `test` script and point Copilot to tests/ or __tests__.
- If adding linting, add `lint` script and include a configuration file (.eslintrc.json).

## Integration with other AI assistant configs
- No CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, or AIDER_CONVENTIONS.md found — nothing to merge.

---
Keep this file updated when adding build/test/lint scripts or moving secrets to env vars.
