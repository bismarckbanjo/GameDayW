# GameDay W — Code Audit & Monetization Plan
*June 12, 2026 · reviewed: `api/index.js`, `public/app.js`, `index.html`, `sw.js`, `vercel.json`, manifest*

**Overall:** This is a clean, well-commented build. XSS escaping is consistent, the SW caching strategy is thoughtful, URL routing/deep links work, and failure modes degrade gracefully. The issues below are mostly about surviving real traffic and real revenue — not code quality.

---

## Part 1 — Code Audit

### 🔴 Critical (fix before launch)

**1. No CDN caching — every user request invokes your serverless function.**
There are zero `Cache-Control` headers in `api/index.js` or `vercel.json`. Your in-memory `cache` Map lives per-lambda-instance; Vercel spins up many instances and recycles them, so hit rates will be poor under load. Worst case: `teams_full` rebuilds (13+ teams × roster + coach + coach-detail ≈ 40 upstream fetches) on each cold start — slow first paints and a real timeout risk on Vercel's default function limits.
*Fix (cheap, big win):* add `res.set('Cache-Control', 's-maxage=N, stale-while-revalidate')` per endpoint (e.g. live=15s, schedule=60s, teams=6h). Vercel's edge CDN then absorbs almost all traffic, your function cost drops to near zero, and global latency improves. This single change makes free-tier hosting viable at 10–100× current traffic.

**2. Open CORS + no rate limiting = you're a free public ESPN/Spotrac proxy.**
`app.use(cors())` lets any site call your API; nothing throttles abuse. Once monetized, others can leech your endpoints (and your Spotrac scrape) at your expense.
*Fix:* restrict CORS to your domain(s); add basic per-IP rate limiting (Vercel WAF rules, or `express-rate-limit` keyed on `x-forwarded-for`).

**3. Unvalidated path params flow into upstream URLs.**
`/api/player/:playerId` and `/api/team/:teamId` interpolate `req.params` directly into ESPN URLs. Impact is contained to espn.com paths, but it enables cache-poisoning and junk upstream traffic.
*Fix:* `if (!/^\d+$/.test(id)) return res.status(400)...` on both.

**4. Data-source legality blocks monetization as-is.**
ESPN's APIs are unofficial/unkeyed (no license, can change or be cut off without notice), and the Spotrac scrape spoofs a browser UA specifically to bypass their blocking — defensible for a hobby project, not for a revenue-generating product. Ad networks (AdSense/AdMob) also require content/data you have rights to. Before taking money: either license data (SportsDataIO/Sportradar are ~$500–1,000+/mo B2B; API-Sports and similar indie tiers are far cheaper) or keep ESPN as an interim source while revenue is trivial — but treat it as a known business risk, budget for licensed data at the point real revenue appears, and drop the Spotrac scrape (replace with a manually-curated or licensed transactions feed).

### 🟠 High value (correctness & robustness)

**5. `cached()` has no in-flight dedupe (thundering herd).** Ten concurrent requests on an expired key trigger ten upstream rebuilds. Memoize the pending promise: store `{ promise, expiresAt }` and return the same promise to concurrent callers.

**6. `SEASON` is computed once at cold start.** A lambda that stays warm across the April→May (or Dec 31) boundary serves the wrong season. Make it a function `getSeason()` called per request.

**7. No request timeout on upstream fetches.** A hung ESPN/Spotrac response holds your function open to its max duration. Add `AbortSignal.timeout(8000)` to `getJson`/`fetchTrades`.

**8. `trades` and `leaders` are cached for the whole page lifetime client-side** (`if (!tradesData)` / `if (!leadersData)`), while schedule refetches every tab visit. A fan who keeps the PWA open all day never sees new trades. Add a simple TTL or refetch on tab activation.

**9. SW `staleWhileRevalidate` on `/api/*` shows stale data with no refresh.** The cached response renders, the fresh one lands in cache, and the user never sees it until the *next* visit. Acceptable for rosters; misleading for schedule scores. Options: post a message from the SW to trigger re-render, or exclude `/api/schedule` from SWR.

**10. API cache in the SW grows unbounded.** Every player page visited is cached forever in `api-v4`. Add a max-entries trim on `cache.put`.

**11. Live poll never backs off.** 30s polling continues all offseason / overnight. Read the response: if no games today and none live, drop to 5–10 min.

**12. Drop `node-fetch`.** Node 22 has native `fetch`; one less dependency (and v2 is legacy). Also consider Express → plain Vercel functions later; `vercel.json` uses the legacy `builds`/`routes` v2 config — modern `rewrites` + `headers` config would also let you set long-lived cache headers on static assets.

### 🟡 Polish / UX / a11y

13. **Search results aren't keyboard-navigable** — `role="listbox"` contains `<button>`s, no arrow-key support, no `aria-activedescendant`. Tabs likewise don't follow the ARIA tabs pattern (`role="tablist"`, arrow keys).
14. **No Open Graph / Twitter meta tags** — deep links (a player page, tonight's matchup) shared to socials render bare. Cheap viral-growth fix, especially for a fanbase that lives on social.
15. **Manifest has one 512px icon** — add a 192×192 and a `purpose: maskable` icon so Android install prompts and home-screen icons render properly.
16. **No 404 handler on unknown `/api/*` routes** — Express returns default HTML; return JSON 404.
17. **No error tracking or analytics** — you can't monetize what you can't measure. Add Sentry (free tier) + a privacy-friendly analytics tool (Plausible/Umami) or GA4. You'll need DAU/retention numbers for any ad or sponsorship conversation.
18. **No tests/CI** — even one smoke test (`GET /api/teams` returns 13 teams, parser handles a saved Spotrac HTML fixture) wired to GitHub Actions would catch the most likely breakage (ESPN/Spotrac shape changes) before users do.

### Feature adds (ranked by fan value)

1. **Standings tab** — `/api/standings` already exists and is unwired (your README notes it). Highest value-to-effort ratio in the repo.
2. **Game notifications** — "your favorite team tips off in 30 min" via Web Push. This is *the* companion-app feature, the #1 reason fans keep an app installed, and the natural premium hook. Needs a tiny backend store for push subscriptions (Vercel KV / Supabase — you already have Supabase available).
3. **Box scores on the H2H view** — ESPN's `summary` endpoint per gameId gives live box scores; your matchup screen is the perfect host (your FUTURE.md #6 already points here).
4. **News feed** — ESPN has a WNBA news endpoint; a simple headlines tab raises daily-open frequency.
5. **Schedule → calendar export** (.ics per team) — cheap, delightful, shareable.
6. **Player comparison** (pick 2 players, side-by-side) — same pattern as H2H, fans love it.
7. **Fantasy/award trackers** (MVP race, rookie ladder) — differentiator vs. ESPN's generic app.

---

## Part 2 — Monetization

### Web/PWA vs. native — honest comparison

| | Stay web/PWA | Native (wrap with Capacitor) |
|---|---|---|
| Payments cut | ~3% (Stripe) | 15% (both stores' small-business tiers: Apple requires enrollment under $1M/yr; Google is automatic on first $1M) |
| Ads | AdSense (web CPMs are low for sports utility content) | AdMob (better fill/eCPM, esp. interstitial/rewarded) |
| Push notifications | Web Push — works on Android & desktop; works on iOS only after user installs to home screen | First-class on both platforms |
| Discovery | SEO + social links only | App Store search ("WNBA") — meaningful, low-competition niche |
| Iteration speed | Deploy anytime | Review queues, two store accounts (~$25 Google once + $99/yr Apple) |
| Effort from current code | Zero | Low-moderate — your no-framework SPA wraps cleanly in Capacitor |

**Recommendation: web-first now, native shell later.** Your stack (vanilla JS PWA) is unusually cheap to wrap in Capacitor when you want store presence — nothing you do now is wasted. iOS Web Push limitation is the main argument for eventually shipping native, since notifications are your premium hook.

### Freemium vs. ads

For a niche-but-passionate audience (exactly the WNBA fanbase), **freemium beats ads**. Napkin math: 5,000 MAU × ~3 pageviews × low sports-utility CPMs ≈ tens of dollars/month from ads — while 2% of 5,000 users at $20/yr ≈ $2,000/yr, and conversion in passion niches typically beats 2%. Ads also degrade the "faster than ESPN" experience that *is* your product.

Suggested split:

- **Free:** everything that exists today (scores, schedule, rosters, injuries, trades, leaders). The free tier is your growth engine — don't paywall the lookup core.
- **Premium ($1.99–2.99/mo or $14.99–19.99/yr):** game-start + final-score push for favorite teams, close-game alerts, multiple favorites, player comparison, advanced stats, calendar sync, themes beyond default. Sell "never miss your team" not "more data."
- **Optional later:** a single tasteful sponsorship slot ("Tonight's slate presented by ___") — local sports bars, women's-sports brands, and team-adjacent businesses pay better than programmatic ads in niche communities.

### Next steps (in order)

1. **This week — harden the free product:** edge cache headers (#1), CORS/rate-limit (#2), param validation (#3), upstream timeouts (#7). ~Half a day of work; makes the app survive a viral moment, which in a growing fanbase is your real launch event.
2. **Add measurement:** Plausible/Umami + Sentry. Two weeks of real DAU/retention data tells you whether to invest further and is your evidence for any sponsor conversation.
3. **Wire the standings tab + OG tags**, then soft-launch: r/wnba, WNBA Twitter/Bluesky, team subreddits. Shareable deep links are your distribution.
4. **Build push notifications for favorites** (Web Push + Vercel KV/Supabase). Launch it free for a month to prove the hook, then move it behind Premium via Stripe Checkout + Customer Portal (no backend billing code to write).
5. **At ~5–10K MAU:** wrap in Capacitor for the App Store ("WNBA" search is an underserved keyword), enroll in Apple's Small Business Program (15%), keep web Stripe pricing slightly lower to steer subscriptions there.
6. **Before meaningful revenue:** resolve data licensing (#4) — get a quote from SportsDataIO and price API-Sports-class indie providers; drop the Spotrac scrape.

### Sources

- [Apple App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [RevenueCat — 15% App Store fee guide (2026)](https://www.revenuecat.com/blog/engineering/small-business-program/)
- [Appbot — Apple & Google small business programs](https://appbot.co/blog/app-developers-apple-google-small-business-programs/)
- [SportsDataIO — WNBA API docs](https://sportsdata.io/developers/api-documentation/wnba) · [free trial terms](https://sportsdata.io/free-trial)
- [Sportradar — Sports Data API](https://sportradar.com/media-tech/data-content/sports-data-api/)
- [isportsapi — sports data API comparison 2026](https://www.isportsapi.com/en/blog/others-2200-best-sports-data-apis-for-developers-and-startups-in-2026.html)
