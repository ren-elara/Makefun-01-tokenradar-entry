const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const O = require('../dashboard/engine.js');
const input = process.env.ORBIT_INPUT || resolve(__dirname, '../.makefun-kit/token-radar-01-kit/input/snapshot.json');
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