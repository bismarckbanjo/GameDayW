const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.static('public'));

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba';
const SITE_WEB = 'https://site.web.api.espn.com/apis/v2/sports/basketball/wnba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba';
// WNBA season runs May–Oct. Before May, the "current" season is the previous calendar year
// (Jan–Apr is offseason after that season's playoffs have wrapped).
const _now = new Date();
const SEASON = _now.getMonth() < 4 ? _now.getFullYear() - 1 : _now.getFullYear();

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function fetchTeamsList() {
  const data = await getJson(`${SITE}/teams`);
  const teams = data.sports[0].leagues[0].teams.map(({ team }) => ({
    id: team.id,
    name: team.displayName,
    abbreviation: team.abbreviation,
    location: team.location,
    color: team.color,
    logo: team.logos?.[0]?.href,
  }));
  return teams;
}

async function fetchRoster(teamId) {
  const data = await getJson(`${SITE}/teams/${teamId}/roster`);
  return (data.athletes || []).map(a => ({
    id: a.id,
    name: a.fullName,
    jersey: a.jersey,
    position: a.position?.abbreviation,
    height: a.displayHeight,
    weight: a.displayWeight,
    age: a.age,
    college: a.college?.name,
    headshot: a.headshot?.href,
  }));
}

async function fetchHeadCoach(teamId) {
  try {
    const list = await getJson(`${CORE}/seasons/${SEASON}/teams/${teamId}/coaches`);
    const ref = list.items?.[0]?.$ref;
    if (!ref) return null;
    const coach = await getJson(ref.replace(/^http:/, 'https:'));
    return [coach.firstName, coach.lastName].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

async function fetchTeamsWithRosters() {
  return cached('teams_full', 6 * 60 * 60 * 1000, async () => {
    const teams = await fetchTeamsList();
    await Promise.all(teams.map(async t => {
      const [players, head_coach] = await Promise.all([
        fetchRoster(t.id).catch(() => []),
        fetchHeadCoach(t.id),
      ]);
      t.players = players;
      t.head_coach = head_coach;
    }));
    return teams;
  });
}

function normalizeEvent(e) {
  const comp = e.competitions?.[0] || {};
  const home = comp.competitors?.find(c => c.homeAway === 'home');
  const away = comp.competitors?.find(c => c.homeAway === 'away');
  const broadcasts = (comp.broadcasts || []).flatMap(b => b.names || []);
  const geoBroadcasts = (comp.geoBroadcasts || []).map(g => g.media?.shortName).filter(Boolean);
  const watch_on = [...new Set([...broadcasts, ...geoBroadcasts])];
  return {
    id: e.id,
    scheduled: e.date,
    name: e.name,
    short_name: e.shortName,
    status: e.status?.type?.description,
    short_detail: e.status?.type?.shortDetail,
    state: e.status?.type?.state,
    completed: e.status?.type?.completed,
    period: comp.status?.period,
    display_clock: comp.status?.displayClock,
    venue: comp.venue ? { name: comp.venue.fullName, city: comp.venue.address?.city } : null,
    watch_on,
    home_team: home && {
      id: home.team.id,
      name: home.team.displayName,
      abbreviation: home.team.abbreviation,
      logo: home.team.logo,
      score: home.score,
      record: home.records?.[0]?.summary,
    },
    away_team: away && {
      id: away.team.id,
      name: away.team.displayName,
      abbreviation: away.team.abbreviation,
      logo: away.team.logo,
      score: away.score,
      record: away.records?.[0]?.summary,
    },
  };
}

async function fetchLive() {
  return cached('live', 30 * 1000, async () => {
    const raw = await getJson(`${SITE}/scoreboard`);
    return (raw.events || []).map(normalizeEvent);
  });
}

async function fetchSchedule() {
  return cached('schedule', 60 * 1000, async () => {
    // WNBA season runs roughly May–Oct. Fetch each month and merge.
    const months = ['05', '06', '07', '08', '09', '10'];
    const results = await Promise.all(months.map(m =>
      getJson(`${SITE}/scoreboard?dates=${SEASON}${m}&limit=200`).catch(() => ({ events: [] }))
    ));
    const seen = new Set();
    const games = [];
    for (const r of results) {
      for (const e of r.events || []) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        games.push(normalizeEvent(e));
      }
    }
    games.sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
    return games;
  });
}

async function fetchStandings() {
  return cached('standings', 5 * 60 * 1000, async () => {
    return getJson(`${SITE_WEB}/standings?season=${SEASON}`);
  });
}

// teamId -> "W-L" (e.g. "30-14"). Pulled from the standings "overall" stat.
async function fetchTeamRecords() {
  return cached('team_records', 5 * 60 * 1000, async () => {
    const map = new Map();
    try {
      const data = await fetchStandings();
      for (const child of data.children || []) {
        for (const entry of child.standings?.entries || []) {
          const id = entry.team?.id;
          if (!id) continue;
          const overall = (entry.stats || []).find(s => s.name === 'overall');
          if (overall?.displayValue) map.set(String(id), overall.displayValue);
        }
      }
    } catch {
      // Offseason / standings endpoint hiccup — return whatever we collected (possibly empty).
    }
    return map;
  });
}

// Stat categories surfaced on the Player Stats landing screen.
// Display order is the array order.
const LEADER_CATS = [
  { name: 'pointsPerGame',    label: 'Points / Game' },
  { name: 'reboundsPerGame',  label: 'Rebounds / Game' },
  { name: 'assistsPerGame',   label: 'Assists / Game' },
  { name: 'fieldGoalPercentage', label: 'Field Goal %' },
];

async function fetchLeadersForSeason(season, rosterIndex) {
  const url = `${CORE}/seasons/${season}/types/2/leaders?limit=10`;
  const raw = await getJson(url);
  const cats = raw.categories || [];
  const byName = new Map(cats.map(c => [c.name, c]));
  const out = [];
  for (const want of LEADER_CATS) {
    const c = byName.get(want.name);
    if (!c) continue;
    const leaders = [];
    for (const l of (c.leaders || []).slice(0, 5)) {
      const refUrl = l.athlete?.$ref || '';
      const m = refUrl.match(/\/athletes\/(\d+)/);
      const id = m ? m[1] : null;
      const hint = id ? rosterIndex.get(id) : null;
      leaders.push({
        id,
        name: hint?.name || null,
        headshot: hint?.headshot || null,
        team_id: hint?.team_id || null,
        team_name: hint?.team_name || null,
        value: l.displayValue ?? (l.value != null ? String(l.value) : ''),
      });
    }
    if (leaders.length) out.push({ name: want.name, label: want.label, leaders });
  }
  return out;
}

async function fetchLeaders() {
  return cached('leaders', 60 * 60 * 1000, async () => {
    const teams = await fetchTeamsWithRosters();
    // Build an id→player map so we can resolve athlete refs without follow-up fetches.
    const rosterIndex = new Map();
    for (const t of teams) {
      for (const p of t.players || []) {
        if (p.id) rosterIndex.set(String(p.id), { name: p.name, headshot: p.headshot, team_id: t.id, team_name: t.name });
      }
    }
    let out = await fetchLeadersForSeason(SEASON, rosterIndex).catch(() => []);
    // In deep offseason or right at the start of a season the current-season feed can be empty.
    // Fall back to the prior season so the page never blanks out.
    if (!out.length && SEASON > 2020) {
      out = await fetchLeadersForSeason(SEASON - 1, rosterIndex).catch(() => []);
      if (out.length) out.unshift({ name: '_season_note', label: `${SEASON - 1} Season`, leaders: [] });
    }
    return out;
  });
}

app.get('/api/teams', async (_req, res) => {
  try {
    const [teams, records] = await Promise.all([fetchTeamsWithRosters(), fetchTeamRecords()]);
    res.json({ teams: teams.map(t => ({ ...t, record: records.get(String(t.id)) || null })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/team/:teamId', async (req, res) => {
  try {
    const [teams, records] = await Promise.all([fetchTeamsWithRosters(), fetchTeamRecords()]);
    const team = teams.find(t => t.id === req.params.teamId);
    if (!team) return res.status(404).json({ error: 'team not found' });
    res.json({ team: { ...team, record: records.get(String(team.id)) || null } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/schedule', async (_req, res) => {
  try {
    const games = await fetchSchedule();
    res.json({ games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/live', async (_req, res) => {
  try {
    const games = await fetchLive();
    res.json({ games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/standings', async (_req, res) => {
  try {
    res.json(await fetchStandings());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leaders', async (_req, res) => {
  try {
    const categories = await fetchLeaders();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/player/:playerId', async (req, res) => {
  try {
    const id = req.params.playerId;
    const [profile, stats] = await Promise.all([
      getJson(`${CORE}/athletes/${id}`).catch(() => null),
      getJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba/athletes/${id}/stats`).catch(() => null),
    ]);
    res.json({ profile, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/players/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ players: [] });
    const teams = await fetchTeamsWithRosters();
    const matches = [];
    for (const t of teams) {
      for (const p of t.players || []) {
        if (p.name && p.name.toLowerCase().includes(q)) {
          matches.push({ ...p, team_id: t.id, team_name: t.name, team_logo: t.logo });
        }
      }
    }
    res.json({ players: matches.slice(0, 25) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/injuries', async (_req, res) => {
  try {
    const data = await cached('injuries', 10 * 60 * 1000, async () => {
      const raw = await getJson(`${SITE}/injuries`);
      const list = [];
      for (const team of raw.injuries || []) {
        for (const inj of team.injuries || []) {
          list.push({
            id: inj.id,
            team: { id: team.id, name: team.displayName, abbreviation: team.abbreviation },
            player: inj.athlete && {
              id: inj.athlete.id,
              name: inj.athlete.displayName,
              position: inj.athlete.position?.abbreviation,
              headshot: inj.athlete.headshot?.href,
            },
            status: inj.status,
            type: inj.type?.description,
            detail: inj.details?.detail,
            side: inj.details?.side,
            date: inj.date,
            short_comment: inj.shortComment,
            long_comment: inj.longComment,
          });
        }
      }
      list.sort((a, b) => new Date(b.date) - new Date(a.date));
      return list;
    });
    res.json({ injuries: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Spotrac scraper for WNBA trades. They block bare requests, so we send a real
// browser UA. The HTML structure is server-rendered: each trade is a card with a
// "card-header bg-dark bg-gradient text-white" date row followed by a
// .tradebody div containing one .flex-fill block per team in the trade.
const TRADES_URL = 'https://www.spotrac.com/wnba/transactions/trade';
const TRADES_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TRADES_WINDOW_DAYS = 30;

function parseSpotracDate(s) {
  // "May 06, 2026" → Date (UTC noon to avoid TZ rounding when we ISO-stringify).
  const d = new Date(`${s} 12:00:00Z`);
  return isNaN(d) ? null : d;
}

function parseTradesHtml(html) {
  const $ = cheerio.load(html);
  const trades = [];
  $('.card-header.bg-dark.bg-gradient.text-white').each((_, el) => {
    const dateText = $(el).text().trim();
    const date = parseSpotracDate(dateText);
    if (!date) return;
    // The .tradebody is the next sibling card; teams are the .flex-fill blocks inside.
    const body = $(el).nextAll('.tradebody').first();
    if (!body.length) return;
    const teams = [];
    body.children('div').each((_, teamEl) => {
      const $t = $(teamEl);
      const name = $t.find('header h2').first().text().trim();
      if (!name) return;
      const logo = $t.find('header img').first().attr('src') || null;
      const label = $t.find('.border-bottom').first().text().trim();
      const items = [];
      $t.find('.tradeinfo').each((_, infoEl) => {
        const $i = $(infoEl);
        const itemName = $i.find('a.fw-bold').first().text().trim();
        const detail = $i.find('.text-muted').first().text().trim();
        const salary = $i.find('.fs-xs').last().text().trim();
        if (!itemName) return;
        // Picks have a "YYYY Round N" name and no age/pos detail; players have detail.
        if (/^\d{4}\s+Round/.test(itemName)) {
          items.push({ kind: 'pick', label: itemName });
        } else {
          // detail looks like "Age: 27 | Pos: G"
          const ageMatch = detail.match(/Age:\s*(\d+)/);
          const posMatch = detail.match(/Pos:\s*([A-Z/-]+)/i);
          items.push({
            kind: 'player',
            name: itemName,
            age: ageMatch ? ageMatch[1] : null,
            position: posMatch ? posMatch[1] : null,
            salary: salary || null,
          });
        }
      });
      teams.push({ name, logo, label, items });
    });
    if (teams.length >= 2) {
      trades.push({
        date: date.toISOString().slice(0, 10),
        date_display: dateText,
        teams,
      });
    }
  });
  return trades;
}

async function fetchTrades() {
  return cached('trades', 60 * 60 * 1000, async () => {
    const r = await fetch(TRADES_URL, { headers: { 'User-Agent': TRADES_UA, 'Accept': 'text/html' } });
    if (!r.ok) throw new Error(`${r.status} ${TRADES_URL}`);
    const html = await r.text();
    const all = parseTradesHtml(html);
    const cutoff = Date.now() - TRADES_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return all.filter(t => new Date(t.date).getTime() >= cutoff);
  });
}

app.get('/api/trades', async (_req, res) => {
  try {
    const trades = await fetchTrades();
    res.json({ trades });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Game Day W backend running on port ${PORT}`);
  });
}

module.exports = app;
