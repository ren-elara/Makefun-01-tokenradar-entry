const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const O = require('../dashboard/engine.js');
const input = process.env.ORBIT_INPUT || ['../token-radar-01-kit/input/snapshot.json', '../.makefun-kit/token-radar-01-kit/input/snapshot.json'].map(p => resolve(__dirname, p)).find(existsSync);
if (!input) throw new Error('Unpack the official token-radar-01 kit or set ORBIT_INPUT to snapshot.json.');
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const settings = { deposit: 10000, days: 30, gas: 1, opportunity: 5, eligibility: 50, allocation: 10 };

test('sealed universe is fully partitioned, with a valid board and complete watchlist', () => {
  const d = O.derive(snapshot, settings);
  assert.equal(d.universe.length, snapshot.protocols.length);
  assert.equal(d.rows.length + d.traded_size + d.excluded_size, snapshot.protocols.length);
  assert.ok(d.rows.length >= 100);
  assert.equal(new Set(d.rows.map(p => p.slug)).size, d.rows.length);
  for (const slug of snapshot.watchlist) assert.ok(d.rows.some(p => p.slug === slug));
  for (const [i, p] of d.rows.entries()) {
    assert.equal(p.rank, i + 1);
    assert.equal(O.preToken(p), true);
    assert.equal(p.implied_value_usd, O.valuation(d.model, p, snapshot.as_of));
    assert.ok(Number.isSafeInteger(p.implied_value_usd) && p.implied_value_usd > 0 && p.implied_value_usd <= 1e14);
    if (i) assert.ok(p.implied_value_usd <= d.rows[i-1].implied_value_usd);
    assert.ok(p.farm.steps.length >= 3 && p.farm.steps.length <= 12);
    for (const step of p.farm.steps) assert.ok(step.trim().length >= 20 && step.trim().length <= 600);
  }
  assert.ok(d.model.cv.median_multiple < d.model.starter_cv.median_multiple);
});
test('growth, age and scenario economics respond consistently without altering the value model', () => {
  const d = O.derive(snapshot, settings), p = d.rows[0];
  const bigger = O.plan(p, p.implied_value_usd, [p.band_low_usd,p.band_high_usd], p.age_days, {...settings,deposit:20000});
  assert.ok(bigger.gross > p.farm.gross);
  assert.equal(O.valuation(d.model, {...p, change_7d: Infinity}, snapshot.as_of), O.valuation(d.model, {...p, change_7d:null}, snapshot.as_of));
  assert.ok(O.valuation(d.model, {...p, change_7d:100}, snapshot.as_of) > O.valuation(d.model, {...p, change_7d:-50}, snapshot.as_of));
  assert.equal(O.ageDays(snapshot.as_of, null), null);
  assert.equal(O.ageDays(snapshot.as_of, '2027-01-01'), 0);
});
test('malformed rows, duplicate identities and watchlist inconsistencies fail before outputs', () => {
  assert.throws(() => O.derive({...snapshot, protocols:[null]}, settings), /Malformed/);
  assert.throws(() => O.derive({...snapshot, protocols:[...snapshot.protocols,snapshot.protocols[0]]}, settings), /duplicate/);
  assert.throws(() => O.derive({...snapshot, watchlist:['invented']}, settings), /missing/);
  assert.throws(() => O.derive({...snapshot, as_of:'2026-02-30'}, settings), /date/);
  const clone = structuredClone(snapshot); clone.protocols[0].tvl_usd = -1;
  assert.throws(() => O.derive(clone, settings), /Malformed/);
});
test('zero TVL, missing context and extreme inputs remain finite and deterministic', () => {
  const clone = structuredClone(snapshot), row = clone.protocols.find(p => snapshot.watchlist.includes(p.slug));
  Object.assign(row, {tvl_usd:0, change_7d:null, listed_at:null, chains:[], category:null});
  const a = O.derive(clone, settings), b = O.derive(clone, settings), p = a.rows.find(p => p.slug === row.slug);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.ok(Number.isFinite(p.implied_value_usd));
  assert.ok(Number.isFinite(p.farm.net));
  assert.equal(p.farm.verdict,'Skip');
});

test('optional snapshot context and watchlist identities are validated explicitly', () => {
  for (const patch of [{chains: null}, {chains: [123]}, {category: {}}, {symbol: 12}, {gecko_id: []}, {mcap_usd: '12'}, {change_7d: Infinity}, {listed_at: '2026-02-30'}]) {
    const clone = structuredClone(snapshot);
    Object.assign(clone.protocols[0], patch);
    assert.throws(() => O.derive(clone, settings), /Malformed protocol context/);
  }
  assert.throws(() => O.derive({...snapshot, watchlist: [...snapshot.watchlist, snapshot.watchlist[0]]}, settings), /duplicate watchlist/);
  assert.throws(() => O.derive({...snapshot, watchlist: [null]}, settings), /watchlist slug/);
  assert.equal(O.ageDays(snapshot.as_of, '2026-02-30'), null);
  assert.equal(O.ageDays('invalid', '2026-01-01'), null);
});

test('scenario defaults, zero allocations and invalid controls have defined behavior', () => {
  const d = O.derive(snapshot), p = d.rows[0];
  assert.deepEqual(d.settings, settings);
  const scenario = (patch) => O.plan(p, p.implied_value_usd, [p.band_low_usd, p.band_high_usd], p.age_days, {...settings, ...patch});
  const zero = scenario({allocation: 0});
  assert.equal(zero.gross, 0);
  assert.equal(zero.breakeven, null);
  assert.equal(zero.verdict, 'Skip');
  assert.equal(scenario({eligibility: 0}).gross, 0);
  assert.ok(scenario({gas: 0}).cost < p.farm.cost);
  for (const patch of [{deposit: -1}, {deposit: 1e7}, {days: 0}, {days: NaN}, {gas: -1}, {gas: Infinity}, {eligibility: 101}, {allocation: '10'}, {opportunity: null}]) {
    assert.throws(() => scenario(patch), /Invalid scenario setting/);
  }
});

test('Spearman diagnostics use average ranks for ties and zero for a constant prediction', () => {
  const rows = [1, 2, 3, 4].map(mcap_usd => ({mcap_usd, tvl_usd: 1}));
  assert.equal(O.metrics(rows, () => 1).rank_r, 0);
  assert.equal(O.metrics(rows, p => p.mcap_usd <= 2 ? 1 : 2).rank_r, 0.89);
  assert.equal(O.metrics(rows.slice().reverse(), p => p.mcap_usd <= 2 ? 1 : 2).rank_r, 0.89);
});
