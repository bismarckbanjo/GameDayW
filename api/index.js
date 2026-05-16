const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba';
const SITE_WEB = 'https://site.web.api.espn.com/apis/v2/sports/basketball/wnba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba';
const SEASON = new Date().getFullYear();

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

app.get('/api/teams', async (_req, res) => {
  try {
    const teams = await fetchTeamsWithRosters();
    res.json({ teams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/team/:teamId', async (req, res) => {
  try {
    const teams = await fetchTeamsWithRosters();
    const team = teams.find(t => t.id === req.params.teamId);
    if (!team) return res.status(404).json({ error: 'team not found' });
    res.json({ team });
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

const TRANSACTION_KEYWORDS = /\b(sign(ed|ing|s)?|trade(d|s)?|waive(d|s)?|release(d|s)?|claim(ed|s)?|acquire(d|s)?|cut|contract|agree(d|ment|s)?|hardship|free agent|exhibit 10|lands|joins|added|promote(d|s)?|sale|relocat(e|ion)|expansion|extension|deal)\b/i;
const GAME_TYPES = new Set(['Preview', 'Recap', 'Media']);

app.get('/api/transactions', async (_req, res) => {
  try {
    const data = await cached('transactions', 15 * 60 * 1000, async () => {
      const raw = await getJson(`${SITE}/news?limit=50`);
      return (raw.articles || [])
        .filter(a => !GAME_TYPES.has(a.type) && TRANSACTION_KEYWORDS.test(a.headline || ''))
        .map(a => ({
          headline: a.headline,
          description: a.description,
          published: a.published,
          link: a.links?.web?.href,
          image: a.images?.[0]?.url,
          source: a.byline || 'ESPN',
        }));
    });
    res.json({ transactions: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Easy Lay backend running on port ${PORT}`);
  });
}

module.exports = app;
