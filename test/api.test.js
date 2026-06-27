'use strict';
// Smoke/unit tests for the pure helpers in api/index.js. No network — these guard the
// most likely breakages (ESPN/Spotrac shape changes, season-boundary logic). Run: `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../api/index.js');
const { getSeason, parseSpotracDate, parseTradesHtml, normalizeEvent, normalizeStandings, isValidId } = __test;

test('getSeason: Jan–Apr maps to previous calendar year', () => {
  assert.equal(getSeason(new Date('2026-02-15T12:00:00Z')), 2025);
  assert.equal(getSeason(new Date('2026-04-30T12:00:00Z')), 2025);
});

test('getSeason: May–Dec maps to current calendar year', () => {
  assert.equal(getSeason(new Date('2026-05-01T12:00:00Z')), 2026);
  assert.equal(getSeason(new Date('2026-10-15T12:00:00Z')), 2026);
});

test('isValidId accepts numeric ESPN ids, rejects junk', () => {
  assert.equal(isValidId('4433403'), true);
  assert.equal(isValidId('1'), true);
  assert.equal(isValidId('abc'), false);
  assert.equal(isValidId('12; DROP TABLE'), false);
  assert.equal(isValidId(''), false);
});

test('parseSpotracDate parses a valid date and rejects garbage', () => {
  const d = parseSpotracDate('May 06, 2026');
  assert.ok(d instanceof Date && !isNaN(d));
  assert.equal(d.toISOString().slice(0, 10), '2026-05-06');
  assert.equal(parseSpotracDate('not a date'), null);
});

test('parseTradesHtml extracts teams, players and picks', () => {
  const html = `
    <div class="trade-card">
      <div class="card-header bg-dark bg-gradient text-white">May 06, 2026</div>
      <div class="tradebody">
        <div>
          <header><h2>Phoenix Mercury</h2><img src="/logo-phx.png"></header>
          <div class="border-bottom">Receives</div>
          <div class="tradeinfo"><a class="fw-bold">Jane Smith</a><span class="text-muted">Age: 27 | Pos: G</span><span class="fs-xs">$120,000</span></div>
          <div class="tradeinfo"><a class="fw-bold">2027 Round 1</a></div>
        </div>
        <div>
          <header><h2>Seattle Storm</h2><img src="/logo-sea.png"></header>
          <div class="border-bottom">Receives</div>
          <div class="tradeinfo"><a class="fw-bold">Mary Jones</a><span class="text-muted">Age: 31 | Pos: F</span><span class="fs-xs">$95,000</span></div>
        </div>
      </div>
    </div>`;
  const trades = parseTradesHtml(html);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].date, '2026-05-06');
  assert.equal(trades[0].teams.length, 2);

  const phx = trades[0].teams[0];
  assert.equal(phx.name, 'Phoenix Mercury');
  assert.equal(phx.items.length, 2);
  const player = phx.items.find(i => i.kind === 'player');
  assert.equal(player.name, 'Jane Smith');
  assert.equal(player.age, '27');
  assert.equal(player.position, 'G');
  const pick = phx.items.find(i => i.kind === 'pick');
  assert.equal(pick.label, '2027 Round 1');
});

test('normalizeEvent pulls home/away, status and broadcasts', () => {
  const raw = {
    id: '401',
    date: '2026-06-01T23:00Z',
    name: 'Aces at Liberty',
    shortName: 'LV @ NY',
    status: { type: { description: 'Scheduled', state: 'pre', completed: false } },
    competitions: [{
      broadcasts: [{ names: ['ESPN'] }],
      geoBroadcasts: [{ media: { shortName: 'ION' } }],
      competitors: [
        { homeAway: 'home', team: { id: '9', displayName: 'New York Liberty', abbreviation: 'NY' }, score: '0' },
        { homeAway: 'away', team: { id: '17', displayName: 'Las Vegas Aces', abbreviation: 'LV' }, score: '0' },
      ],
    }],
  };
  const e = normalizeEvent(raw);
  assert.equal(e.id, '401');
  assert.equal(e.home_team.abbreviation, 'NY');
  assert.equal(e.away_team.abbreviation, 'LV');
  assert.deepEqual(e.watch_on, ['ESPN', 'ION']);
  assert.equal(e.state, 'pre');
});

test('normalizeStandings flattens groups, entries and the overall record', () => {
  const raw = {
    children: [{
      name: 'Eastern',
      standings: { entries: [{
        team: { id: '5', displayName: 'Indiana Fever', abbreviation: 'IND' },
        stats: [
          { name: 'overall', displayValue: '20-10' },
          { name: 'wins', displayValue: '20' },
          { name: 'losses', displayValue: '10' },
        ],
      }] },
    }],
  };
  const groups = normalizeStandings(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Eastern');
  assert.equal(groups[0].entries[0].team.abbreviation, 'IND');
  assert.equal(groups[0].entries[0].record, '20-10');
  assert.equal(groups[0].entries[0].wins, '20');
});
