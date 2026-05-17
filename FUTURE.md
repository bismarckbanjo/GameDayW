# Future Fixes

Things noted during the May 2026 code review that we agreed to defer.

## #5 — Filter the Schedule by team

The Schedule tab currently lists every game in the season. A team filter (matching the one on Rosters) would let a fan see only their team's schedule in one tap. The pattern is already in `displayRosters` — reuse the `teamFilter` styling and bind a `<select>` above `#scheduleGrid` that filters `scheduleData` by `g.home_team.id === id || g.away_team.id === id`. Once team favorites are well-loved, default the filter to the user's first favorite.

## #6 — Game card → in-app Head-to-Head screen

Right now Schedule and Live Now game cards are intentionally non-tappable (we tried an ESPN deeplink and pulled it back — sending fans off-site defeats the point of the app). The replacement: tapping a card opens an in-app **Head-to-Head** page that shows both teams side by side with their season stats compared (record, PPG, OPP PPG, RPG, APG, FG%, 3P%, pace, streak). Data source: ESPN's `summary` endpoint per gameId plus `/api/teams` records and team season stats. Render as a two-column card with the better number on each row highlighted in the team's color.

## #11 — Trades & Waivers tab is noisy

`/api/transactions` filters ESPN news headlines with a broad regex (`sign|trade|waive|...|deal|lands|joins`). The signal-to-noise ratio is poor: sponsorship announcements and opinion pieces sneak through, real transactions sometimes don't.

Options, roughly in order of effort:

1. **Drop the tab** until we find a real transactions feed. Honest about the limitation.
2. **Tighten the regex** — require multiple keywords, or `(signed|waived|traded|claimed)\s+(by|to|from|a)` patterns that look like transaction grammar.
3. **Use a different ESPN endpoint** — there may be a `transactions` feed on `sports.core.api.espn.com`; worth investigating.
4. **Source from elsewhere** — Her Hoop Stats, The Next, or league press releases would be higher-quality but require scraping or a different fetch path.

The current tab is the weakest in the app; #1 (drop it) is the most fan-respecting choice if no better source materializes.
