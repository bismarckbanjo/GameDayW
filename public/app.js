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
// Name of the user's first favorite team, or '' if none. Used to pre-filter
// the Schedule and Injuries tabs so the app opens on the team the fan cares about.
function firstFavoriteTeamName() {
  const favs = getFavorites();
  if (!favs.size) return '';
  for (const t of teamsData) if (favs.has(String(t.id))) return t.name;
  return '';
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

function switchTab(tabName, opts = {}) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
  // openPlayer drives its own fetch — it passes { noLoad: true } so we don't race the leaders fetch
  // against the player-detail render.
  if (!opts.noLoad) loadTabData(tabName);
}

async function loadTabData(tabName) {
  try {
    switch (tabName) {
      case 'rosters': await loadRosters(); break;
      case 'schedule': await loadSchedule(); break;
      case 'stats': await loadStatsLanding(); break;
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
      <div class="player-row"
        data-player-id="${esc(p.id)}"
        data-team-id="${esc(t.id)}"
        data-team-name="${esc(t.name)}"
        data-player-name="${esc(p.name || '')}"
        data-jersey="${esc(p.jersey || '')}"
        data-position="${esc(p.position || '')}"
        data-height="${esc(p.height || '')}"
        data-college="${esc(p.college || '')}">
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
      row.addEventListener('click', () => openPlayer(row.dataset.playerId,
        { id: row.dataset.teamId, name: row.dataset.teamName },
        {
          name: row.dataset.playerName,
          jersey: row.dataset.jersey,
          position: row.dataset.position,
          height: row.dataset.height,
          college: row.dataset.college,
        }));
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
let scheduleTeamName = '';
let scheduleSortOrder = 'soonest'; // 'soonest' | 'latest'
let scheduleFavApplied = false;
let injuriesFavApplied = false;

// Real WNBA teams come from /api/teams. Anything else in the schedule (e.g., a national
// team like NIGERIA in a preseason exhibition) gets a "Special" tag. TBD is its own case.
function isWnbaTeam(team) {
  if (!team?.id) return false;
  return teamsData.some(t => String(t.id) === String(team.id));
}
function isTbdTeam(team) {
  return (team?.name || '').toUpperCase() === 'TBD';
}
function specialTagHtml(team) {
  if (!team || isTbdTeam(team) || isWnbaTeam(team)) return '';
  return ` <span class="special-tag" title="Non-WNBA opponent (exhibition / international)">Special</span>`;
}

async function loadSchedule() {
  try {
    // Always re-fetch — the API has a 60s server cache, so this is cheap and the user always
    // sees current state (scores, status changes, postponements) instead of a page-lifetime stale copy.
    const [res] = await Promise.all([fetch(`${API_BASE}/schedule`), ensureTeams()]);
    const data = await res.json();
    scheduleData = data.games || [];
    populateScheduleTeamFilter();
    displaySchedule();
  } catch (err) {
    document.getElementById('scheduleGrid').innerHTML = '<p>Error loading schedule.</p>';
    console.error('Schedule Error:', err);
  }
}

function populateScheduleTeamFilter() {
  const sel = document.getElementById('scheduleTeamFilter');
  if (!sel || sel.dataset.populated === '1') return;
  // First visit with a favorite: open on that team's slate.
  if (!scheduleFavApplied) {
    const fav = firstFavoriteTeamName();
    if (fav) scheduleTeamName = fav;
    scheduleFavApplied = true;
  }
  // Dedupe by name — ESPN ships TBD with multiple IDs (-1, -2), and the dropdown values
  // become names so the filter naturally matches every variant.
  const byName = new Map();
  for (const g of scheduleData) {
    for (const t of [g.home_team, g.away_team]) {
      if (!t?.name || byName.has(t.name)) continue;
      byName.set(t.name, {
        isTbd: isTbdTeam(t),
        isWnba: isWnbaTeam(t),
      });
    }
  }
  // Rank: real WNBA teams, then specials, then TBD; alphabetical within each group.
  const rank = (info) => info.isTbd ? 2 : (info.isWnba ? 0 : 1);
  [...byName.entries()]
    .sort((a, b) => (rank(a[1]) - rank(b[1])) || a[0].localeCompare(b[0]))
    .forEach(([name, info]) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = !info.isWnba && !info.isTbd ? `${name} — Special` : name;
      sel.appendChild(opt);
    });
  sel.value = scheduleTeamName;
  sel.addEventListener('change', (e) => {
    scheduleTeamName = e.target.value;
    displaySchedule();
  });
  const sortSel = document.getElementById('scheduleSort');
  if (sortSel && sortSel.dataset.wired !== '1') {
    sortSel.value = scheduleSortOrder;
    sortSel.addEventListener('change', (e) => {
      scheduleSortOrder = e.target.value;
      displaySchedule();
    });
    sortSel.dataset.wired = '1';
  }
  sel.dataset.populated = '1';
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
  // Whole card links to ESPN's per-game page. Watch-pill anchors inside stop propagation
  // (see wireGameCardLinks) so users can still tap a broadcaster directly.
  const espnUrl = g.id ? `https://www.espn.com/wnba/game/_/gameId/${esc(g.id)}` : '';
  const linkAttr = espnUrl ? `data-game-url="${espnUrl}" role="link" tabindex="0"` : '';
  const linkClass = espnUrl ? ' is-link' : '';
  return `
    <div class="card game${linkClass}" ${linkAttr}>
      <h3>
        ${g.away_team?.logo ? `<img src="${esc(g.away_team.logo)}" class="team-logo-sm">` : ''}
        ${esc(g.away_team?.name)}${specialTagHtml(g.away_team)} @
        ${g.home_team?.logo ? `<img src="${esc(g.home_team.logo)}" class="team-logo-sm">` : ''}
        ${esc(g.home_team?.name)}${specialTagHtml(g.home_team)}
      </h3>
      <p><strong>${date.toLocaleDateString()}</strong> ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <p>${esc(g.venue?.name || '')}</p>
      ${score}
      <p class="status">${esc(g.status || '')}${liveDetail}</p>
      ${watchPillsHtml(g.watch_on)}
    </div>
  `;
}

function wireGameCardLinks(root) {
  root.querySelectorAll('.card.game.is-link').forEach(card => {
    const open = () => {
      const url = card.dataset.gameUrl;
      if (url) window.open(url, '_blank', 'noopener');
    };
    card.addEventListener('click', (e) => {
      // Let the inner watch-pill anchors handle their own clicks.
      if (e.target.closest('a')) return;
      open();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function displaySchedule() {
  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = '';

  const games = scheduleTeamName
    ? scheduleData.filter(g => g.home_team?.name === scheduleTeamName || g.away_team?.name === scheduleTeamName)
    : scheduleData;

  if (!games.length) {
    grid.innerHTML = scheduleTeamName
      ? '<p>No games found for this team.</p>'
      : '<p>No games found.</p>';
    return;
  }

  const now = new Date();
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86400000));
  const nowMs = now.getTime();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
  const monthLabel = (d) =>
    d.getFullYear() === curYear
      ? d.toLocaleString([], { month: 'long' })
      : d.toLocaleString([], { month: 'long', year: 'numeric' });

  const previous = [];
  const todayGames = [];
  const tomorrowGames = [];
  // Order-preserving map so months render in calendar order (games arrive sorted by date).
  const futureByMonth = new Map();

  for (const g of games) {
    const d = new Date(g.scheduled);
    const k = dayKey(d);
    if (d.getTime() < nowMs && k !== today) {
      previous.push(g);
      continue;
    }
    if (k === today) { todayGames.push(g); continue; }
    if (k === tomorrow) { tomorrowGames.push(g); continue; }
    const mk = monthKey(d);
    if (!futureByMonth.has(mk)) futureByMonth.set(mk, { label: '', games: [] });
    const bucket = futureByMonth.get(mk);
    bucket.label = d.getFullYear() === curYear && d.getMonth() === curMonth
      ? `Rest of ${monthLabel(d)}`
      : monthLabel(d);
    bucket.games.push(g);
  }

  const asc = (a, b) => new Date(a.scheduled) - new Date(b.scheduled);
  const desc = (a, b) => new Date(b.scheduled) - new Date(a.scheduled);
  const futureSort = scheduleSortOrder === 'latest' ? desc : asc;

  previous.sort(desc);
  todayGames.sort(asc);
  tomorrowGames.sort(asc);
  for (const b of futureByMonth.values()) b.games.sort(futureSort);

  const futureEntries = [...futureByMonth.entries()];
  if (scheduleSortOrder === 'latest') futureEntries.reverse();

  let html = '';

  if (showPreviousGames && previous.length) {
    html += `<button class="schedule-toggle" data-action="toggle-previous">Hide Previous Games</button>`;
    html += `<h3 class="schedule-section">Previous Games</h3>`;
    for (const g of previous) html += gameCardHtml(g);
  } else if (previous.length) {
    html += `<button class="schedule-toggle" data-action="toggle-previous">Show Previous Games (${previous.length})</button>`;
  }

  if (todayGames.length) {
    html += `<h3 class="schedule-section">Today</h3>`;
    for (const g of todayGames) html += gameCardHtml(g);
  }
  if (tomorrowGames.length) {
    html += `<h3 class="schedule-section">Tomorrow</h3>`;
    for (const g of tomorrowGames) html += gameCardHtml(g);
  }
  for (const [, bucket] of futureEntries) {
    html += `<h3 class="schedule-section">${esc(bucket.label)}</h3>`;
    for (const g of bucket.games) html += gameCardHtml(g);
  }

  if (!todayGames.length && !tomorrowGames.length && !futureEntries.length && !showPreviousGames) {
    html += `<p>No upcoming games scheduled.</p>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('.schedule-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      showPreviousGames = !showPreviousGames;
      displaySchedule();
    });
  });
  wireGameCardLinks(grid);
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
let injuriesData = [];
let injuriesTeamName = '';

async function loadInjuries() {
  const grid = document.getElementById('injuriesGrid');
  grid.innerHTML = '<p>Loading injury report…</p>';
  try {
    const [res] = await Promise.all([fetch(`${API_BASE}/injuries`), ensureTeams()]);
    const data = await res.json();
    injuriesData = data.injuries || [];
    populateInjuriesTeamFilter();
    displayInjuries();
  } catch (err) {
    grid.innerHTML = '<p>Error loading injuries.</p>';
    console.error('Injuries Error:', err);
  }
}

function populateInjuriesTeamFilter() {
  const sel = document.getElementById('injuriesTeamFilter');
  if (!sel || sel.dataset.populated === '1') return;
  if (!injuriesFavApplied) {
    const fav = firstFavoriteTeamName();
    if (fav) injuriesTeamName = fav;
    injuriesFavApplied = true;
  }
  // Source from teamsData so the dropdown only lists real WNBA teams, even if a team
  // currently has zero reported injuries.
  [...teamsData]
    .map(t => t.name)
    .sort((a, b) => a.localeCompare(b))
    .forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  sel.value = injuriesTeamName;
  sel.addEventListener('change', (e) => {
    injuriesTeamName = e.target.value;
    displayInjuries();
  });
  sel.dataset.populated = '1';
}

function displayInjuries() {
  const grid = document.getElementById('injuriesGrid');
  const items = injuriesTeamName
    ? injuriesData.filter(i => i.team?.name === injuriesTeamName)
    : injuriesData;
  if (!items.length) {
    grid.innerHTML = injuriesTeamName
      ? '<p>No injuries reported for this team.</p>'
      : '<p>No injuries reported.</p>';
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
}

// Player stats search
let searchTimer;
document.getElementById('playerSearch')?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) {
    // Empty search returns the fan to the league-leaders board rather than a blank prompt.
    loadStatsLanding();
    return;
  }
  searchTimer = setTimeout(() => searchPlayers(q), 250);
});

// League leaders board — what the Player Stats tab opens to before any search.
let leadersData = null;
async function loadStatsLanding() {
  const grid = document.getElementById('statsGrid');
  const search = document.getElementById('playerSearch');
  if (search && search.value.trim().length >= 2) return; // user is mid-search; don't clobber
  grid.innerHTML = '<p>Loading league leaders…</p>';
  try {
    if (!leadersData) {
      // ensureTeams runs in parallel — we need it cached so the meta chips (Ht/From) can fill
      // in when a fan opens a leader directly.
      const [res] = await Promise.all([fetch(`${API_BASE}/leaders`), ensureTeams()]);
      const data = await res.json();
      leadersData = data.categories || [];
    }
    renderStatsLanding(leadersData);
  } catch (err) {
    grid.innerHTML = '<p>Search for a player to view stats…</p>';
    console.error('Leaders Error:', err);
  }
}

function renderStatsLanding(categories) {
  const grid = document.getElementById('statsGrid');
  const real = categories.filter(c => c.name !== '_season_note');
  if (!real.length) {
    grid.innerHTML = '<p>Search for a player to view stats…</p>';
    return;
  }
  const note = categories.find(c => c.name === '_season_note');
  const noteHtml = note ? `<p class="leaders-note">Showing ${esc(note.label)} (current season not started).</p>` : '';
  const cols = real.map(cat => {
    const rows = cat.leaders.map((l, i) => {
      const clickable = !!l.id;
      const nameHtml = l.name ? esc(l.name) : 'Player';
      const team = l.team_name ? `<span class="ldr-team">${esc(l.team_name)}</span>` : '';
      const head = l.headshot
        ? `<img src="${esc(l.headshot)}" alt="" class="ldr-head">`
        : `<span class="ldr-head ldr-head-init">${esc(initials(l.name || ''))}</span>`;
      return `
        <li class="ldr-row${clickable ? ' is-link' : ''}"
            ${clickable ? `data-player-id="${esc(l.id)}" data-team-id="${esc(l.team_id || '')}" data-team-name="${esc(l.team_name || '')}" data-player-name="${esc(l.name || '')}"` : ''}>
          <span class="ldr-rank">${i + 1}</span>
          ${head}
          <span class="ldr-name">${nameHtml}${team}</span>
          <strong class="ldr-val">${esc(l.value)}</strong>
        </li>
      `;
    }).join('');
    return `
      <div class="card leaders-card">
        <h3>${esc(cat.label)}</h3>
        <ol class="ldr-list">${rows}</ol>
      </div>
    `;
  }).join('');
  grid.innerHTML = `
    ${noteHtml}
    <div class="leaders-grid">${cols}</div>
  `;
  grid.querySelectorAll('.ldr-row.is-link').forEach(row => {
    row.addEventListener('click', () => openPlayer(row.dataset.playerId,
      { id: row.dataset.teamId, name: row.dataset.teamName },
      { name: row.dataset.playerName }));
  });
}

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
        <button
          data-player-id="${esc(p.id)}"
          data-team-id="${esc(p.team_id)}"
          data-team-name="${esc(p.team_name || '')}"
          data-player-name="${esc(p.name || '')}"
          data-jersey="${esc(p.jersey || '')}"
          data-position="${esc(p.position || '')}"
          data-height="${esc(p.height || '')}"
          data-college="${esc(p.college || '')}">View Stats</button>
      </div>
    `).join('');
    grid.querySelectorAll('button[data-player-id]').forEach(b =>
      b.addEventListener('click', () => openPlayer(b.dataset.playerId,
        { id: b.dataset.teamId, name: b.dataset.teamName },
        {
          name: b.dataset.playerName,
          jersey: b.dataset.jersey,
          position: b.dataset.position,
          height: b.dataset.height,
          college: b.dataset.college,
        }))
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

// Pull a single value out of a stats category by stat key (e.g. 'avgPoints').
function statByName(cat, name) {
  if (!cat) return null;
  const i = (cat.names || []).indexOf(name);
  if (i < 0) return null;
  const v = cat.totals?.[i];
  return v == null || v === '' ? null : v;
}

function metaChipHtml(label, value) {
  if (!value) return '';
  return `<span class="meta-chip"><em>${esc(label)}</em><strong>${esc(value)}</strong></span>`;
}

function headlineStatHtml(label, value) {
  if (value == null || value === '') return '';
  return `<div class="headline-stat"><span class="hs-label">${esc(label)}</span><strong class="hs-value">${esc(value)}</strong></div>`;
}

// Look up height/college/jersey/position from the cached rosters when hints are sparse
// (e.g. opening a player from the leaders board).
function enrichHintsFromRoster(playerId, hints) {
  const out = { ...(hints || {}) };
  if (out.height && out.college && out.jersey && out.position) return out;
  if (!teamsData.length) return out;
  const id = String(playerId);
  for (const t of teamsData) {
    const p = (t.players || []).find(x => String(x.id) === id);
    if (!p) continue;
    out.name ||= p.name;
    out.height ||= p.height;
    out.college ||= p.college;
    out.jersey ||= p.jersey;
    out.position ||= p.position;
    return out;
  }
  return out;
}

async function openPlayer(playerId, team, hints) {
  switchTab('stats', { noLoad: true });
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<p>Loading player stats…</p>';
  hints = enrichHintsFromRoster(playerId, hints);

  const teamName = team?.name || '';
  const showTeamBack = team?.id && team?.name && team.name !== 'undefined';
  const breadcrumb = showTeamBack
    ? `<button class="back-btn" id="backToTeam">Back to ${esc(teamName)}</button>`
    : `<button class="back-btn" id="backToSearch">Back to Stats</button>`;

  const wireBack = () => {
    document.getElementById('backToTeam')?.addEventListener('click', () => {
      switchTab('rosters');
      const filter = document.getElementById('teamFilter');
      filter.value = team.id;
      displayRosters(team.id);
    });
    document.getElementById('backToSearch')?.addEventListener('click', () => {
      const input = document.getElementById('playerSearch');
      if (input && input.value.length >= 2) searchPlayers(input.value);
      else loadStatsLanding();
    });
  };

  try {
    const res = await fetch(`${API_BASE}/player/${encodeURIComponent(playerId)}`);
    const { profile, stats } = await res.json();
    const ath = profile?.athlete || profile;
    const cats = stats?.categories || [];

    // ESPN sometimes returns null for either profile or stats. Render what we have, and fall back
    // to a friendly message if there's nothing usable at all.
    if (!ath && !cats.length && !hints?.name) {
      grid.innerHTML = `
        ${breadcrumb}
        <div class="card player-detail">
          <h2>Player</h2>
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

    const fullName = ath?.displayName || ath?.fullName || hints?.name || 'Player';
    const displayTeam = teamName || ath?.team?.displayName || '';
    const headshotHref = ath?.headshot?.href;
    const headshot = headshotHref
      ? `<img src="${esc(headshotHref)}" class="headshot-lg" alt="">`
      : `<span class="headshot-lg" style="display:grid;place-items:center;font-weight:950;color:var(--on-primary);background:linear-gradient(135deg,var(--secondary),var(--primary));">${esc(initials(fullName))}</span>`;

    // Meta row — what fans actually want to see at a glance.
    // Height is non-negotiable per design intent; college comes from roster hints
    // (ESPN's athlete profile returns college as a $ref so we lean on the cached roster).
    const position = ath?.position?.abbreviation || hints?.position || '';
    const positionLong = ath?.position?.displayName || '';
    const jersey = ath?.jersey || hints?.jersey || '';
    const height = ath?.displayHeight || hints?.height || '';
    const college = hints?.college || '';
    const meta = [
      metaChipHtml('Pos', position || positionLong),
      jersey ? metaChipHtml('#', String(jersey).replace(/^#/, '')) : '',
      metaChipHtml('Ht', height),
      metaChipHtml('From', college),
    ].filter(Boolean).join('');
    const metaRow = meta ? `<div class="meta-chips">${meta}</div>` : '';

    // Headline stat chips. Prefer per-game from "averages"; fall back to totals for FG%.
    const ppg = statByName(avg, 'avgPoints');
    const rpg = statByName(avg, 'avgRebounds');
    const apg = statByName(avg, 'avgAssists');
    const fgPct = statByName(avg, 'fieldGoalPct') || statByName(totals, 'fieldGoalPct');
    const headline = [
      headlineStatHtml('PPG', ppg),
      headlineStatHtml('RPG', rpg),
      headlineStatHtml('APG', apg),
      headlineStatHtml('FG%', fgPct),
    ].filter(Boolean).join('');
    const headlineRow = headline ? `<div class="headline-stats">${headline}</div>` : '';

    const tables = (table(avg) || '') + (table(totals) || '');
    const detailsBlock = tables
      ? `<details class="full-stats"><summary>Full stat lines</summary>${tables}</details>`
      : (headlineRow ? '' : '<p class="muted">No stat lines available for this player yet.</p>');

    grid.innerHTML = `
      ${breadcrumb}
      <div class="card player-detail">
        ${headshot}
        <h2>${esc(fullName)}</h2>
        <p class="player-sub">${esc(positionLong || position || '')}${displayTeam ? ' · ' + esc(displayTeam) : ''}</p>
        ${metaRow}
        ${headlineRow}
        ${detailsBlock}
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

  // ESPN's scoreboard returns the next set of games — which on a day with no games means
  // tomorrow's slate. Filter by actual local date before claiming anything is "today".
  const now = new Date();
  const todayK = dayKey(now);
  const tomorrowK = dayKey(new Date(now.getTime() + 86400000));
  const isToday = (g) => dayKey(new Date(g.scheduled)) === todayK;

  const liveToday = games.filter(g => g.state === 'in' && isToday(g));
  const upcomingToday = games.filter(g => g.state === 'pre' && isToday(g))
    .sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
  const finishedToday = games.filter(g => g.state === 'post' && isToday(g))
    .sort((a, b) => new Date(b.scheduled) - new Date(a.scheduled));

  const teamLabel = (t) => esc(t?.abbreviation || t?.name || '');

  if (liveToday.length) {
    strip.dataset.state = 'live';
    strip.innerHTML = liveToday.slice(0, 3).map(g => `
      <span class="today-chip is-live">
        <span class="td-live-dot" aria-hidden="true"></span>
        ${teamLabel(g.away_team)} <strong>${esc(g.away_team?.score)}</strong>
        <span class="td-sep">–</span>
        <strong>${esc(g.home_team?.score)}</strong> ${teamLabel(g.home_team)}
        <em>Q${esc(g.period || '')} ${esc(g.display_clock || '')}</em>
      </span>
    `).join('');
    return;
  }

  if (upcomingToday.length) {
    const next = upcomingToday[0];
    const t = new Date(next.scheduled).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    strip.dataset.state = 'next';
    strip.innerHTML = `
      <span class="today-chip is-next">
        Next today · <strong>${esc(t)}</strong> · ${teamLabel(next.away_team)} @ ${teamLabel(next.home_team)}
      </span>
    `;
    return;
  }

  if (finishedToday.length) {
    const last = finishedToday[0];
    strip.dataset.state = 'final';
    strip.innerHTML = `
      <span class="today-chip is-final">
        Final · ${teamLabel(last.away_team)} <strong>${esc(last.away_team?.score)}</strong>
        <span class="td-sep">–</span>
        <strong>${esc(last.home_team?.score)}</strong> ${teamLabel(last.home_team)}
      </span>
    `;
    return;
  }

  // No games today. Fall back to the next scheduled game, with an honest day label.
  const future = games.filter(g => g.state === 'pre' && new Date(g.scheduled).getTime() > now.getTime())
    .sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
  if (future.length) {
    const next = future[0];
    const d = new Date(next.scheduled);
    const dayLabel = dayKey(d) === tomorrowK
      ? 'Tomorrow'
      : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    strip.dataset.state = 'next';
    strip.innerHTML = `
      <span class="today-chip is-next">
        Next up · <strong>${esc(dayLabel)} ${esc(t)}</strong> · ${teamLabel(next.away_team)} @ ${teamLabel(next.home_team)}
      </span>
    `;
    return;
  }

  strip.dataset.state = 'empty';
  strip.innerHTML = `<span class="today-empty">No WNBA games today</span>`;
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
  if (document.hidden) return;
  pollLive();
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = setInterval(pollLive, 30000);
}

function stopLivePolling() {
  if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}

function showLiveModal() {
  const modal = document.getElementById('liveModal');
  const body = document.getElementById('liveModalBody');

  // ESPN's scoreboard returns the next slate when today is empty — filter by actual local date
  // before labelling anything as "Today".
  const now = new Date();
  const todayK = dayKey(now);
  const tomorrowK = dayKey(new Date(now.getTime() + 86400000));
  const isToday = (g) => dayKey(new Date(g.scheduled)) === todayK;

  const live = liveGamesCache.filter(g => g.state === 'in' && isToday(g));
  const upcomingToday = liveGamesCache.filter(g => g.state === 'pre' && isToday(g))
    .sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
  const finishedToday = liveGamesCache.filter(g => g.state === 'post' && isToday(g))
    .sort((a, b) => new Date(b.scheduled) - new Date(a.scheduled));

  let html = '';
  if (live.length) {
    html += `<h3 class="schedule-section">In Progress</h3>`;
    html += `<div class="grid">${live.map(gameCardHtml).join('')}</div>`;
  } else {
    html += `<p style="padding:1rem 0;color:var(--muted);font-weight:800;">No games are live right now.</p>`;
  }
  if (upcomingToday.length) {
    html += `<h3 class="schedule-section">Starting Today</h3>`;
    html += `<div class="grid">${upcomingToday.map(gameCardHtml).join('')}</div>`;
  }
  if (finishedToday.length) {
    html += `<h3 class="schedule-section">Finished Today</h3>`;
    html += `<div class="grid">${finishedToday.map(gameCardHtml).join('')}</div>`;
  }

  // If today has nothing, surface the next scheduled day (often tomorrow) under its own header.
  if (!live.length && !upcomingToday.length && !finishedToday.length) {
    const future = liveGamesCache
      .filter(g => g.state === 'pre' && new Date(g.scheduled).getTime() > now.getTime())
      .sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
    if (future.length) {
      const firstK = dayKey(new Date(future[0].scheduled));
      const nextDay = future.filter(g => dayKey(new Date(g.scheduled)) === firstK);
      const d = new Date(future[0].scheduled);
      const label = firstK === tomorrowK
        ? 'Tomorrow'
        : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      html += `<h3 class="schedule-section">Next Up · ${esc(label)}</h3>`;
      html += `<div class="grid">${nextDay.map(gameCardHtml).join('')}</div>`;
    } else {
      html += `<p style="padding:1rem 0;color:var(--muted);font-weight:800;">No WNBA games on the schedule today.</p>`;
    }
  }

  body.innerHTML = html;
  wireGameCardLinks(body);
  modal.classList.remove('hidden');
  // Always land at the top when (re)opening, so the close button is in reach.
  modal.querySelector('.modal-content')?.scrollTo({ top: 0 });
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
  // Stop the 30s scoreboard poll while the tab is backgrounded — saves battery and data on mobile.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLivePolling();
    else startLivePolling();
  });
});
