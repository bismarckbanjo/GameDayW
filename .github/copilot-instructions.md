# Copilot Instructions for Easy Lay

## Build, Test, and Lint Commands
- **Install dependencies:** `npm install`
- **Run locally:** `npm run dev` (starts Express backend, serves static frontend)
- **Start server:** `npm start`
- **No build, test, or lint scripts are currently defined.**

## High-Level Architecture
- **Frontend:** Vanilla JS, HTML5, CSS3 (served statically from `public/`)
- **Backend:** Node.js with Express (`api/index.js`)
- **API:** Proxies requests to SportRadar WNBA API
- **Deployment:** Vercel

## Key Conventions
- All backend endpoints are prefixed with `/api/`
- API key for SportRadar is hardcoded in `api/index.js` (replace with env var for production)
- No TypeScript or build step; code is plain JS
- No test or linting setup by default

## Main API Endpoints (from backend)
- `GET /api/schedule` — 2026 season schedule
- `GET /api/teams` — All teams
- `GET /api/team/:teamId` — Team profile
- `GET /api/player/:playerId` — Player profile
- `GET /api/standings` — League standings

## AI Configuration Checks
- If adding tests, use a script named `test` in `package.json`
- If adding linting, use a script named `lint` in `package.json`
- Ensure API keys are not committed in production

## Setup (from README)
1. Open project in VS Code: `code ~/Projects/Easy\ Lay`
2. Install dependencies: `npm install`
3. Run locally: `npm run dev` and visit http://localhost:3000

---
Keep instructions concise and update this file if build, test, or lint scripts are added.
