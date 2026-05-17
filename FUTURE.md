# Future Fixes

Things noted during the May 2026 code review that we agreed to defer.

## #5 — Filter the Schedule by team

The Schedule tab currently lists every game in the season. A team filter (matching the one on Rosters) would let a fan see only their team's schedule in one tap. The pattern is already in `displayRosters` — reuse the `teamFilter` styling and bind a `<select>` above `#scheduleGrid` that filters `scheduleData` by `g.home_team.id === id || g.away_team.id === id`. Once team favorites are well-loved, default the filter to the user's first favorite.

## #6 — Game card → in-app Head-to-Head screen

Right now Schedule and Live Now game cards are intentionally non-tappable (we tried an ESPN deeplink and pulled it back — sending fans off-site defeats the point of the app). The replacement: tapping a card opens an in-app **Head-to-Head** page that shows both teams side by side with their season stats compared (record, PPG, OPP PPG, RPG, APG, FG%, 3P%, pace, streak). Data source: ESPN's `summary` endpoint per gameId plus `/api/teams` records and team season stats. Render as a two-column card with the better number on each row highlighted in the team's color.

## #11 — Trades tab (resolved May 2026)

Replaced the noisy ESPN-news regex with a server-side scrape of `spotrac.com/wnba/transactions/trade`. The page is server-rendered with stable class names (`card-header bg-dark bg-gradient text-white` for the date, `.tradebody > .flex-fill` blocks per team, `.tradeinfo` per player or pick). Parsed with cheerio, filtered to the last 30 days, cached 1 hour. Spotrac's `robots.txt` allows `/wnba/transactions/trade` (5s crawl-delay for `*`).

If the scrape breaks: parser returns an empty list and the UI shows "No trades in the past 30 days" rather than erroring — the rest of the app keeps working. Class-name changes on spotrac are the most likely failure mode.
