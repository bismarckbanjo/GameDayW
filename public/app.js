const API_BASE = '/api';

let teamsData = [];
let scheduleData = [];

// Escape any string before interpolating into innerHTML. ESPN data is generally clean,
// but a stray `<` would otherwise break the layout and a malicious field could inject script.
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Favorites — team IDs the user has starred. Stored in localStorage so they persist across visits.
const FAVORITES_KEY = 'gameDayWFavorites';
function getFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function isFavorite(teamId) {
  return getFavorites().has(String(teamId));
}
function toggleFavorite(teamId) {
  const favs = getFavorites();
  const id = String(teamId);
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}
function favStarHtml(teamId) {
  const fav = isFavorite(teamId);
  const label = fav ? 'Remove from favorites' : 'Add to favorites';
  return `<button class="fav-star ${fav ? 'is-fav' : ''}" data-fav-team="${esc(teamId)}" aria-label="${label}" title="${label}" type="button">${fav ? '★' : '☆'}</button>`;
}
function wireFavStars(root) {
  root.querySelectorAll('.fav-star').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favTeam);
      // Re-render so the favorited team moves to the top and the star fills in.
      const filter = document.getElementById('teamFilter');
      displayRosters(filter?.value || '');
    });
  });
}

// Theme palettes — { primary, secondary, accent, onPrimary }
const THEMES = {
  wnba: { name: 'WNBA (default)', primary: '#F26B30', secondary: '#002B5C', accent: '#FFFFFF', onPrimary: '#FFFFFF' },
  atlanta:    { name: 'Atlanta Dream',           primary: '#C8102E', secondary: '#373A36', accent: '#418FDE', onPrimary: '#FFFFFF' },
  chicago:    { name: 'Chicago Sky',             primary: '#418FDE', secondary: '#010101', accent: '#FFCD00', onPrimary: '#FFFFFF' },
  connecticut:{ name: 'Connecticut Sun',         primary: '#FC4C02', secondary: '#0C2340', accent: '#FFFFFF', onPrimary: '#FFFFFF' },
  dallas:     { name: 'Dallas Wings',            primary: '#0C2340', secondary: '#0050B5', accent: '#C4D600', onPrimary: '#FFFFFF' },
  goldenstate:{ name: 'Golden State Valkyries',  primary: '#010101', secondary: '#AD96DC', accent: '#B9975B', onPrimary: '#FFFFFF' },
  indiana:    { name: 'Indiana Fever',           primary: '#041E42', secondary: '#C8102E', accent: '#FFCD00', onPrimary: '#FFFFFF' },
  lasvegas:   { name: 'Las Vegas Aces',          primary: '#010101', secondary: '#8D9093', accent: '#A7A8A9', onPrimary: '#FFFFFF' },
  losangeles: { name: 'Los Angeles Sparks',      primary: '#702F8A', secondary: '#010101', accent: '#FFC72C', onPrimary: '#FFFFFF' },
  minnesota:  { name: 'Minnesota Lynx',          primary: '#236192', secondary: '#0C2340', accent: '#78BE21', onPrimary: '#FFFFFF' },
  newyork:    { name: 'New York Liberty',        primary: '#010101', secondary: '#6ECEB2', accent: '#C07D59', onPrimary: '#FFFFFF' },
  phoenix:    { name: 'Phoenix Mercury',         primary: '#582C83', secondary: '#753BBD', accent: '#FC4C02', onPrimary: '#FFFFFF' },
  portland:   { name: 'Portland Fire',           primary: '#E93CAC', secondary: '#C8102E', accent: '#BBDDE6', onPrimary: '#FFFFFF' },
  seattle:    { name: 'Seattle Storm',           primary: '#2C5234', secondary: '#78BE21', accent: '#FBE122', onPrimary: '#FFFFFF' },
  toronto:    { name: 'Toronto Tempo',           primary: '#612C51', secondary: '#010101', accent: '#B8CCEA', onPrimary: '#FFFFFF' },
  washington: { name: 'Washington Mystics',      primary: '#C8102E', secondary: '#0C2340', accent: '#8D9093', onPrimary: '#FFFFFF' },
};

const DARK_LOGO_THEMES = new Set(['dallas', 'goldenstate', 'indiana', 'lasvegas']);

function applyTheme(key) {
  const t = THEMES[key] || THEMES.wnba;
  const root = document.documentElement.style;
  root.setProperty('--primary', t.primary);
  root.setProperty('--secondary', t.secondary);
  root.setProperty('--accent', t.accent);
  root.setProperty('--on-primary', t.onPrimary);
  const logo = document.querySelector('.brand-mark img');
  if (logo) logo.src = DARK_LOGO_THEMES.has(key) ? '/dark.svg' : '/light.svg';
  localStorage.setItem('gameDayWTheme', key);
}

function initThemePicker() {
  const sel = document.getElementById('themeSelect');
  if (!sel) return;
  for (const [key, t] of Object.entries(THEMES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  const saved = localStorage.getItem('gameDayWTheme') || 'wnba';
  sel.value = saved;
  applyTheme(saved);
  sel.addEventListener('change', (e) => applyTheme(e.target.value));
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab));
});

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
  loadTabData(tabName);
}

async function loadTabData(tabName) {
  try {
    switch (tabName) {
      case 'rosters': await loadRosters(); break;
      case 'schedule': await loadSchedule(); break;
      case 'trades': await loadTrades(); break;
      case 'coaches': await loadCoaches(); break;
      case 'injuries': await loadInjuries(); break;
    }
  } catch (err) {
    console.error(`Error loading ${tabName}:`, err);
  }
}

async function ensureTeams() {
  if (teamsData.length) return teamsData;
  const res = await fetch(`${API_BASE}/teams`);
  const data = await res.json();
  teamsData = data.teams || [];
  return teamsData;
}

function initials(name) {
  if (!name) return '';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

function headshotEl(player) {
  const init = esc(initials(player.name));
  if (player.headshot) {
    return `<img src="${esc(player.headshot)}" alt="" class="headshot" onerror="this.outerHTML='<span class=&quot;headshot&quot;>${init}</span>'">`;
  }
  return `<span class="headshot">${init}</span>`;
}

// Rosters
async function loadRosters() {
  try {
    await ensureTeams();
    const filter = document.getElementById('teamFilter');
    if (filter.options.length <= 1) {
      teamsData.forEach(team => {
        const opt = document.createElement('option');
        opt.value = team.id;
        opt.textContent = team.name;
        filter.appendChild(opt);
      });
      filter.addEventListener('change', (e) => displayRosters(e.target.value));
    }
    displayRosters(filter.value);
  } catch (err) {
    document.getElementById('rostersGrid').innerHTML = '<p>Error loading rosters.</p>';
    console.error('Roster Error:', err);
  }
}

function displayRosters(teamId) {
  const grid = document.getElementById('rostersGrid');
  grid.innerHTML = '';
  const teams = teamId ? teamsData.filter(t => t.id === teamId) : teamsData;

  if (teamId) {
    const t = teams[0];
    const playerRows = (t.players || []).map(p => `
      <div class="player-row" data-player-id="${esc(p.id)}" data-team-id="${esc(t.id)}" data-team-name="${esc(t.name)}">
        ${headshotEl(p)}
        <span class="jersey">${esc(p.jersey || '-')}</span>
        <span class="name">${esc(p.name)}</span>
        <span class="pos">${esc(p.position || '')}</span>
        <span class="ht">${esc(p.height || '')}</span>
      </div>
    `).join('');
    grid.innerHTML = `
      <button class="back-btn" id="backToTeams">← All Teams</button>
      <div class="card team-detail">
        <div class="team-header">
          ${t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.name)}" class="team-logo">` : ''}
          <div>
            <h3>${esc(t.name)} ${favStarHtml(t.id)}</h3>
            <p><strong>Coach:</strong> ${esc(t.head_coach || 'N/A')}</p>
            <p><strong>Players:</strong> ${t.players?.length || 0}</p>
          </div>
        </div>
        <div class="players">${playerRows}</div>
      </div>
    `;
    document.getElementById('backToTeams').addEventListener('click', () => {
      document.getElementById('teamFilter').value = '';
      displayRosters('');
    });
    grid.querySelectorAll('.player-row').forEach(row => {
      row.addEventListener('click', () => openPlayer(row.dataset.playerId, { id: row.dataset.teamId, name: row.dataset.teamName }));
    });
    wireFavStars(grid);
    return;
  }

  // Favorited teams render first.
  const ordered = [
    ...teams.filter(t => isFavorite(t.id)),
    ...teams.filter(t => !isFavorite(t.id)),
  ];
  ordered.forEach(team => {
    const card = document.createElement('div');
    card.className = 'card team-card' + (isFavorite(team.id) ? ' favorited' : '');
    card.innerHTML = `
      ${favStarHtml(team.id)}
      ${team.logo ? `<img src="${esc(team.logo)}" alt="${esc(team.name)}" class="team-logo">` : ''}
      <h3>${esc(team.name)}</h3>
      <p><strong>Coach:</strong> ${esc(team.head_coach || 'N/A')}</p>
      <p><strong>Players:</strong> ${team.players?.length || 0}</p>
    `;
    card.addEventListener('click', (e) => {
      // Don't navigate when the star is clicked.
      if (e.target.closest('.fav-star')) return;
      document.getElementById('teamFilter').value = team.id;
      displayRosters(team.id);
    });
    grid.appendChild(card);
  });
  wireFavStars(grid);
}

// Schedule
let showPreviousGames = false;

async function loadSchedule() {
  try {
    // Always re-fetch — the API has a 60s server cache, so this is cheap and the user always
    // sees current state (scores, status changes, postponements) instead of a page-lifetime stale copy.
    const res = await fetch(`${API_BASE}/schedule`);
    const data = await res.json();
    scheduleData = data.games || [];
    displaySchedule(scheduleData);
  } catch (err) {
    document.getElementById('scheduleGrid').innerHTML = '<p>Error loading schedule.</p>';
    console.error('Schedule Error:', err);
  }
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Map ESPN broadcast names → user-facing label + watch URL
const WATCH_MAP = {
  'ABC':                 { label: 'ABC / ESPN App',   url: 'https://www.espn.com/watch/' },
  'ESPN':                { label: 'ESPN',             url: 'https://www.espn.com/watch/' },
  'ESPN2':               { label: 'ESPN2',            url: 'https://www.espn.com/watch/' },
  'ESPN3':               { label: 'ESPN3',            url: 'https://www.espn.com/watch/' },
  'ESPN+':               { label: 'ESPN+',            url: 'https://plus.espn.com/' },
  'Prime Video':         { label: 'Prime Video',      url: 'https://www.amazon.com/gp/video/storefront' },
  'Peacock':             { label: 'Peacock',          url: 'https://www.peacocktv.com/sports' },
  'NBC':                 { label: 'NBC / Peacock',    url: 'https://www.peacocktv.com/sports' },
  'NBCSN':               { label: 'NBCSN',            url: 'https://www.peacocktv.com/sports' },
  'USA':                 { label: 'USA Network',      url: 'https://www.usanetwork.com/' },
  'USA Network':         { label: 'USA Network',      url: 'https://www.usanetwork.com/' },
  'CBS':                 { label: 'CBS / Paramount+', url: 'https://www.paramountplus.com/' },
  'Paramount+':          { label: 'Paramount+',       url: 'https://www.paramountplus.com/' },
  'ION':                 { label: 'ION',              url: 'https://www.ionwnba.com/' },
  'NBA TV':              { label: 'NBA TV',           url: 'https://www.nba.com/watch/league-pass-stream' },
  'WNBA League Pass':    { label: 'League Pass',      url: 'https://www.wnba.com/leaguepass' },
  'WNBA':                { label: 'WNBA',             url: 'https://www.wnba.com/watch' },
};

function resolveWatchLinks(watchOn = []) {
  return watchOn.map(name => WATCH_MAP[name] || { label: name, url: null });
}

function watchPillsHtml(watchOn = []) {
  const links = resolveWatchLinks(watchOn);
  if (!links.length) return '';
  return `<div class="watch-pills">` + links.map(l =>
    l.url
      ? `<a class="watch-pill" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
      : `<span class="watch-pill">${esc(l.label)}</span>`
  ).join('') + `</div>`;
}

function gameCardHtml(g) {
  const date = new Date(g.scheduled);
  const score = g.state === 'in' || g.state === 'post'
    ? `<p class="score"><strong>${esc(g.away_team?.abbreviation)} ${esc(g.away_team?.score)} – ${esc(g.home_team?.score)} ${esc(g.home_team?.abbreviation)}</strong></p>`
    : '';
  const liveDetail = g.state === 'in' && g.display_clock
    ? ` · Q${esc(g.period || '')} ${esc(g.display_clock)}`
    : '';
  return `
    <div class="card game">
      <h3>
        ${g.away_team?.logo ? `<img src="${esc(g.away_team.logo)}" class="team-logo-sm">` : ''}
        ${esc(g.away_team?.name)} @
        ${g.home_team?.logo ? `<img src="${esc(g.home_team.logo)}" class="team-logo-sm">` : ''}
        ${esc(g.home_team?.name)}
      </h3>
      <p><strong>${date.toLocaleDateString()}</strong> ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <p>${esc(g.venue?.name || '')}</p>
      ${score}
      <p class="status">${esc(g.status || '')}${liveDetail}</p>
      ${watchPillsHtml(g.watch_on)}
    </div>
  `;
}

function displaySchedule(games) {
  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = '';
  if (!games.length) {
    grid.innerHTML = '<p>No games found.</p>';
    return;
  }

  const now = new Date();
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86400000));
  const nowMs = now.getTime();

  const buckets = { previous: [], today: [], tomorrow: [], upcoming: [] };
  for (const g of games) {
    const d = new Date(g.scheduled);
    const k = dayKey(d);
    if (k === today) buckets.today.push(g);
    else if (k === tomorrow) buckets.tomorrow.push(g);
    else if (d.getTime() > nowMs) buckets.upcoming.push(g);
    else buckets.previous.push(g);
  }
  buckets.previous.sort((a, b) => new Date(b.scheduled) - new Date(a.scheduled));

  let html = '';

  if (showPreviousGames && buckets.previous.length) {
    html += `<button class="schedule-toggle" data-action="hide-previous">Hide Previous Games</button>`;
    html += `<h3 class="schedule-section">Previous Games</h3>`;
    for (const g of buckets.previous) html += gameCardHtml(g);
  } else if (buckets.previous.length) {
    html += `<button class="schedule-toggle" data-action="show-previous">Show Previous Games (${buckets.previous.length})</button>`;
  }

  if (buckets.today.length) {
    html += `<h3 class="schedule-section">Today</h3>`;
    for (const g of buckets.today) html += gameCardHtml(g);
  }
  if (buckets.tomorrow.length) {
    html += `<h3 class="schedule-section">Tomorrow</h3>`;
    for (const g of buckets.tomorrow) html += gameCardHtml(g);
  }
  if (buckets.upcoming.length) {
    html += `<h3 class="schedule-section">Upcoming</h3>`;
    for (const g of buckets.upcoming) html += gameCardHtml(g);
  }
  if (!buckets.today.length && !buckets.tomorrow.length && !buckets.upcoming.length && !showPreviousGames) {
    html += `<p>No upcoming games scheduled.</p>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('.schedule-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      showPreviousGames = !showPreviousGames;
      displaySchedule(scheduleData);
    });
  });
}

// Trades / transactions
async function loadTrades() {
  const grid = document.getElementById('tradesGrid');
  grid.innerHTML = '<p>Loading transactions…</p>';
  try {
    const res = await fetch(`${API_BASE}/transactions`);
    const data = await res.json();
    const items = data.transactions || [];
    if (!items.length) {
      grid.innerHTML = '<p>No recent transaction headlines.</p>';
      return;
    }
    grid.innerHTML = items.map(t => `
      <div class="card trade">
        ${t.image ? `<img src="${esc(t.image)}" class="news-img" alt="">` : ''}
        <h3><a href="${esc(t.link)}" target="_blank" rel="noopener">${esc(t.headline)}</a></h3>
        ${t.description ? `<p>${esc(t.description)}</p>` : ''}
        <p class="meta"><small>${t.published ? new Date(t.published).toLocaleDateString() : ''} · ${esc(t.source || 'ESPN')}</small></p>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p>Error loading transactions.</p>';
    console.error('Transactions Error:', err);
  }
}

// Coaches
async function loadCoaches() {
  const grid = document.getElementById('coachesGrid');
  grid.innerHTML = '<p>Loading coaches…</p>';
  try {
    await ensureTeams();
    grid.innerHTML = '';
    teamsData.forEach(team => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        ${team.logo ? `<img src="${esc(team.logo)}" alt="${esc(team.name)}" class="team-logo">` : ''}
        <h3>${esc(team.head_coach || 'Coach TBA')}</h3>
        <p><strong>Team:</strong> ${esc(team.name)}</p>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = '<p>Error loading coaches.</p>';
    console.error('Coaches Error:', err);
  }
}

// Injuries — grouped by team
async function loadInjuries() {
  const grid = document.getElementById('injuriesGrid');
  grid.innerHTML = '<p>Loading injury report…</p>';
  try {
    const res = await fetch(`${API_BASE}/injuries`);
    const data = await res.json();
    const items = data.injuries || [];
    if (!items.length) {
      grid.innerHTML = '<p>No injuries reported.</p>';
      return;
    }
    const byTeam = new Map();
    for (const i of items) {
      const key = i.team?.name || 'Unknown';
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key).push(i);
    }
    const teamNames = [...byTeam.keys()].sort();
    let html = '';
    for (const tn of teamNames) {
      const list = byTeam.get(tn).sort((a, b) => new Date(b.date) - new Date(a.date));
      html += `<h3 class="schedule-section">${esc(tn)} (${list.length})</h3>`;
      for (const i of list) {
        const detail = i.detail
          ? ` · ${i.side ? esc(i.side) + ' ' : ''}${esc(i.detail)}`
          : '';
        html += `
          <div class="card injury">
            ${headshotEl({ headshot: i.player?.headshot, name: i.player?.name })}
            <h3>${esc(i.player?.name || 'Unknown')} <small>(${esc(i.player?.position || '')})</small></h3>
            <p><strong>${esc(i.status)}</strong>${detail}</p>
            ${i.short_comment ? `<p>${esc(i.short_comment)}</p>` : ''}
            <p class="meta"><small>${i.date ? new Date(i.date).toLocaleDateString() : ''}</small></p>
          </div>
        `;
      }
    }
    grid.innerHTML = html;
  } catch (err) {
    grid.innerHTML = '<p>Error loading injuries.</p>';
    console.error('Injuries Error:', err);
  }
}

// Player stats search
let searchTimer;
document.getElementById('playerSearch')?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) {
    document.getElementById('statsGrid').innerHTML = '<p>Search for a player to view stats…</p>';
    return;
  }
  searchTimer = setTimeout(() => searchPlayers(q), 250);
});

async function searchPlayers(q) {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<p>Searching…</p>';
  try {
    const res = await fetch(`${API_BASE}/players/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const players = data.players || [];
    if (!players.length) {
      grid.innerHTML = '<p>No players matched.</p>';
      return;
    }
    grid.innerHTML = players.map(p => `
      <div class="card player" data-player-id="${esc(p.id)}">
        ${headshotEl(p)}
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.team_name)} · ${esc(p.position || '')} · #${esc(p.jersey || '-')}</p>
        <button data-player-id="${esc(p.id)}" data-team-id="${esc(p.team_id)}" data-team-name="${esc(p.team_name || '')}">View Stats</button>
      </div>
    `).join('');
    grid.querySelectorAll('button[data-player-id]').forEach(b =>
      b.addEventListener('click', () => openPlayer(b.dataset.playerId, { id: b.dataset.teamId, name: b.dataset.teamName }))
    );
  } catch (err) {
    grid.innerHTML = '<p>Search error.</p>';
    console.error(err);
  }
}

const STAT_LABELS = {
  gamesPlayed: 'Games Played',
  gamesStarted: 'Games Started',
  minutes: 'Total Minutes',
  avgMinutes: 'Minutes per Game',
  points: 'Total Points',
  avgPoints: 'Points per Game',
  rebounds: 'Total Rebounds',
  avgRebounds: 'Rebounds per Game',
  offensiveRebounds: 'Total Offensive Rebounds',
  avgOffensiveRebounds: 'Offensive Rebounds per Game',
  defensiveRebounds: 'Total Defensive Rebounds',
  avgDefensiveRebounds: 'Defensive Rebounds per Game',
  assists: 'Total Assists',
  avgAssists: 'Assists per Game',
  steals: 'Total Steals',
  avgSteals: 'Steals per Game',
  blocks: 'Total Blocks',
  avgBlocks: 'Blocks per Game',
  turnovers: 'Total Turnovers',
  avgTurnovers: 'Turnovers per Game',
  fouls: 'Total Personal Fouls',
  avgFouls: 'Personal Fouls per Game',
  'fieldGoalsMade-fieldGoalsAttempted': 'Field Goals (Made–Attempted)',
  'avgFieldGoalsMade-avgFieldGoalsAttempted': 'Field Goals per Game (Made–Attempted)',
  fieldGoalsMade: 'Field Goals Made',
  fieldGoalsAttempted: 'Field Goals Attempted',
  fieldGoalPct: 'Field Goal %',
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted': '3-Pointers (Made–Attempted)',
  'avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted': '3-Pointers per Game (Made–Attempted)',
  threePointFieldGoalsMade: '3-Pointers Made',
  threePointFieldGoalsAttempted: '3-Pointers Attempted',
  threePointFieldGoalPct: '3-Point %',
  'freeThrowsMade-freeThrowsAttempted': 'Free Throws (Made–Attempted)',
  'avgFreeThrowsMade-avgFreeThrowsAttempted': 'Free Throws per Game (Made–Attempted)',
  freeThrowsMade: 'Free Throws Made',
  freeThrowsAttempted: 'Free Throws Attempted',
  freeThrowPct: 'Free Throw %',
  doubleDouble: 'Double-Doubles',
  tripleDouble: 'Triple-Doubles',
};

function humanizeStat(key) {
  if (STAT_LABELS[key]) return STAT_LABELS[key];
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' / ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return spaced;
}

async function openPlayer(playerId, team) {
  switchTab('stats');
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<p>Loading player stats…</p>';

  const teamName = team?.name || '';
  const showTeamBack = team?.id && team?.name && team.name !== 'undefined';
  const breadcrumb = showTeamBack
    ? `<button class="back-btn" id="backToTeam">Back to ${esc(teamName)}</button>`
    : `<button class="back-btn" id="backToSearch">Back to Search</button>`;

  const wireBack = () => {
    document.getElementById('backToTeam')?.addEventListener('click', () => {
      switchTab('rosters');
      const filter = document.getElementById('teamFilter');
      filter.value = team.id;
      displayRosters(team.id);
    });
    document.getElementById('backToSearch')?.addEventListener('click', () => {
      const input = document.getElementById('playerSearch');
      if (input.value.length >= 2) searchPlayers(input.value);
      else grid.innerHTML = '<p>Search for a player to view stats…</p>';
    });
  };

  try {
    const res = await fetch(`${API_BASE}/player/${encodeURIComponent(playerId)}`);
    const { profile, stats } = await res.json();
    const ath = profile?.athlete || profile;
    const cats = stats?.categories || [];

    // ESPN sometimes returns null for either profile or stats. Render what we have, and fall back
    // to a friendly message if there's nothing usable at all.
    if (!ath && !cats.length) {
      grid.innerHTML = `
        ${breadcrumb}
        <div class="card player-detail">
          <h2>${esc(team?.playerName || 'Player')}</h2>
          <p>We couldn't load this player's profile right now. ESPN's data may be missing or temporarily unavailable.</p>
        </div>
      `;
      wireBack();
      return;
    }

    const avg = cats.find(c => /averages/i.test(c.displayName || ''));
    const totals = cats.find(c => /^regular season totals/i.test(c.displayName || ''));
    const table = (cat) => {
      if (!cat?.totals?.length) return '';
      const labels = cat.names || [];
      const vals = cat.totals || [];
      const rows = labels.map((n, i) => `<tr><td title="${esc(n)}">${esc(humanizeStat(n))}</td><td>${esc(vals[i] ?? '')}</td></tr>`).join('');
      return `<h4>${esc(cat.displayName)}</h4><table class="stats">${rows}</table>`;
    };

    const fullName = ath?.displayName || ath?.fullName || 'Player';
    const displayTeam = teamName || ath?.team?.displayName || '';
    const headshotHref = ath?.headshot?.href;
    const headshot = headshotHref
      ? `<img src="${esc(headshotHref)}" class="headshot-lg" alt="">`
      : `<span class="headshot-lg" style="display:grid;place-items:center;font-weight:950;color:var(--on-primary);background:linear-gradient(135deg,var(--secondary),var(--primary));">${esc(initials(fullName))}</span>`;

    const tables = (table(avg) || '') + (table(totals) || '');
    const statsBlock = tables || '<p class="muted">No stat lines available for this player yet.</p>';

    grid.innerHTML = `
      ${breadcrumb}
      <div class="card player-detail">
        ${headshot}
        <h2>${esc(fullName)}</h2>
        <p>${esc(ath?.position?.displayName || '')}${displayTeam ? ' · ' + esc(displayTeam) : ''}</p>
        ${statsBlock}
      </div>
    `;
    wireBack();
  } catch (err) {
    grid.innerHTML = `
      ${breadcrumb}
      <div class="card player-detail">
        <p>Error loading player. Try again in a moment.</p>
      </div>
    `;
    wireBack();
    console.error(err);
  }
}

// Banner
function closeBanner() {
  document.getElementById('banner').classList.add('hidden');
}
function showBanner(msg) {
  document.getElementById('bannerText').textContent = msg;
  document.getElementById('banner').classList.remove('hidden');
}

// Live Now
let liveGamesCache = [];
let livePollTimer = null;

function renderTodayStrip(games) {
  const strip = document.getElementById('todayStrip');
  if (!strip) return;
  const live = games.filter(g => g.state === 'in');
  const upcoming = games.filter(g => g.state === 'pre').sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
  const finished = games.filter(g => g.state === 'post').sort((a, b) => new Date(b.scheduled) - new Date(a.scheduled));

  const teamLabel = (t) => esc(t?.abbreviation || t?.name || '');

  if (live.length) {
    strip.dataset.state = 'live';
    strip.innerHTML = live.slice(0, 3).map(g => `
      <span class="today-chip is-live">
        <span class="td-live-dot" aria-hidden="true"></span>
        ${teamLabel(g.away_team)} <strong>${esc(g.away_team?.score)}</strong>
        <span class="td-sep">–</span>
        <strong>${esc(g.home_team?.score)}</strong> ${teamLabel(g.home_team)}
        <em>Q${esc(g.period || '')} ${esc(g.display_clock || '')}</em>
      </span>
    `).join('');
  } else if (upcoming.length) {
    const next = upcoming[0];
    const t = new Date(next.scheduled).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    strip.dataset.state = 'next';
    strip.innerHTML = `
      <span class="today-chip is-next">
        Next today · <strong>${esc(t)}</strong> · ${teamLabel(next.away_team)} @ ${teamLabel(next.home_team)}
      </span>
    `;
  } else if (finished.length) {
    const last = finished[0];
    strip.dataset.state = 'final';
    strip.innerHTML = `
      <span class="today-chip is-final">
        Final · ${teamLabel(last.away_team)} <strong>${esc(last.away_team?.score)}</strong>
        <span class="td-sep">–</span>
        <strong>${esc(last.home_team?.score)}</strong> ${teamLabel(last.home_team)}
      </span>
    `;
  } else {
    strip.dataset.state = 'empty';
    strip.innerHTML = `<span class="today-empty">No WNBA games today</span>`;
  }
}

async function pollLive() {
  try {
    const res = await fetch(`${API_BASE}/live`);
    const data = await res.json();
    const games = data.games || [];
    liveGamesCache = games;
    renderTodayStrip(games);
    const live = games.filter(g => g.state === 'in');
    const btn = document.getElementById('liveNowBtn');
    const count = document.getElementById('liveCount');
    if (live.length) {
      btn.dataset.live = 'true';
      count.textContent = live.length;
    } else {
      btn.dataset.live = 'false';
      count.textContent = '0';
    }
  } catch (err) {
    console.error('Live poll error:', err);
  }
}

function startLivePolling() {
  pollLive();
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = setInterval(pollLive, 30000);
}

function showLiveModal() {
  const modal = document.getElementById('liveModal');
  const body = document.getElementById('liveModalBody');
  const live = liveGamesCache.filter(g => g.state === 'in');
  const upcoming = liveGamesCache.filter(g => g.state === 'pre').sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
  const finished = liveGamesCache.filter(g => g.state === 'post').sort((a, b) => new Date(b.scheduled) - new Date(a.scheduled));

  let html = '';
  if (live.length) {
    html += `<h3 class="schedule-section">In Progress</h3>`;
    html += `<div class="grid">${live.map(gameCardHtml).join('')}</div>`;
  } else {
    html += `<p style="padding:1rem 0;color:var(--muted);font-weight:800;">No games are live right now.</p>`;
  }
  if (upcoming.length) {
    html += `<h3 class="schedule-section">Starting Today</h3>`;
    html += `<div class="grid">${upcoming.map(gameCardHtml).join('')}</div>`;
  }
  if (finished.length) {
    html += `<h3 class="schedule-section">Finished Today</h3>`;
    html += `<div class="grid">${finished.map(gameCardHtml).join('')}</div>`;
  }
  if (!live.length && !upcoming.length && !finished.length) {
    html += `<p style="padding:1rem 0;color:var(--muted);font-weight:800;">No WNBA games on the schedule today.</p>`;
  }

  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function hideLiveModal() {
  document.getElementById('liveModal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  initThemePicker();
  loadRosters();
  startLivePolling();

  document.getElementById('liveNowBtn')?.addEventListener('click', showLiveModal);
  document.getElementById('todayStrip')?.addEventListener('click', showLiveModal);
  document.getElementById('liveModalClose')?.addEventListener('click', hideLiveModal);
  document.getElementById('liveModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'liveModal') hideLiveModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideLiveModal();
  });
});
