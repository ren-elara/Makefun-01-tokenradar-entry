'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const vm = require('node:vm');
const engine = require('../dashboard/engine.js');

const input = process.env.ORBIT_INPUT || [
  '../token-radar-01-kit/input/snapshot.json',
  '../.makefun-kit/token-radar-01-kit/input/snapshot.json',
].map(path => resolve(__dirname, path)).find(existsSync);
if (!input) throw new Error('Unpack the official token-radar-01 kit or set ORBIT_INPUT to snapshot.json.');
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const settings = { deposit: 10000, days: 30, gas: 1, opportunity: 5, eligibility: 50, allocation: 10 };
const board = engine.derive(snapshot, settings);
const fixture = {
  slug: 'example', name: 'Example', category: 'Lending', chains: ['Ethereum'],
  tvl_usd: 1e6, mcap_usd: null, symbol: null, gecko_id: null,
  listed_at: '2025-01-01', change_7d: 10,
};
const scenario = patch => engine.plan(fixture, 1e8, [5e7, 2e8], 365, { ...settings, ...patch });
const slugs = rows => rows.map(row => row.slug);
const patchSnapshot = patch => {
  const copy = structuredClone(snapshot);
  Object.assign(copy.protocols[0], patch);
  return copy;
};
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('all historical exports remain available in CommonJS and the browser', () => {
  const names = [
    'VERSION', 'DEFAULTS', 'LIMITS', 'FAMILIES', 'fmt', 'median', 'quantile', 'ageDays',
    'preToken', 'excluded', 'fitRegression', 'metrics', 'comparableModel',
    'adjustments', 'valuation', 'predict', 'plan', 'derive',
  ];
  const context = vm.createContext({});
  vm.runInContext(readFileSync(resolve(__dirname, '../dashboard/engine.js'), 'utf8'), context);
  for (const name of [...names, 'filterRows', 'sortRows', 'launchSignals']) {
    assert.ok(Object.hasOwn(engine, name), name);
    assert.equal(typeof context.ORBIT[name], typeof engine[name], name);
  }
  assert.equal(engine.VERSION, 'orbit-1.1');
  assert.deepEqual(engine.DEFAULTS, settings);
});

test('the complete snapshot is partitioned and the official watchlist is ranked', () => {
  assert.equal(board.rows.length, 195);
  assert.equal(board.traded_size, 416);
  assert.equal(board.excluded_size, 147);
  assert.equal(board.model.n, 119);
  assert.equal(board.model.formula, 'exp(16.5371 + 0.4928 × ln(TVL / $100M)) × growth × seasoning');
  assert.equal(board.model.cv.median_multiple, 3.39);
  assert.equal(board.model.cv.rank_r, 0.34);
  for (const name of ['WBTC', 'Coinbase Bridge', 'Binance staked ETH', 'USDT0']) {
    assert.ok(snapshot.protocols.some(row => row.name.toLowerCase() === name.toLowerCase()), name);
    assert.ok(!board.rows.some(row => row.name.toLowerCase() === name.toLowerCase()), name);
  }
  assert.equal(board.universe.length, snapshot.protocols.length);
  assert.equal(board.rows.length + board.traded_size + board.excluded_size, snapshot.protocols.length);
  assert.ok(board.rows.length >= 100);
  assert.equal(new Set(slugs(board.rows)).size, board.rows.length);
  assert.equal(board.watchlist_size, snapshot.watchlist.length);
  for (const slug of snapshot.watchlist) assert.ok(board.rows.some(row => row.slug === slug), slug);
  for (const row of board.universe) {
    const ranked = board.rows.find(candidate => candidate.slug === row.slug);
    assert.equal(row.rank, ranked?.rank ?? null);
    assert.equal(row.status, !engine.preToken(row) ? 'Traded' : ranked ? 'Ranked' : 'Set aside');
    assert.ok(row.reason.length > 0);
  }
});

test('ranked scoring is deterministic, positive, bounded and sorted by value', () => {
  for (const [index, row] of board.rows.entries()) {
    assert.equal(row.rank, index + 1);
    assert.equal(engine.preToken(row), true);
    assert.equal(row.implied_value_usd, engine.valuation(board.model, row, snapshot.as_of));
    assert.ok(Number.isSafeInteger(row.implied_value_usd));
    assert.ok(row.implied_value_usd > 0 && row.implied_value_usd <= 1e14);
    assert.ok(row.band_low_usd > 0 && row.band_low_usd <= row.band_high_usd);
    if (index) assert.ok(row.implied_value_usd <= board.rows[index - 1].implied_value_usd);
    assert.ok(row.farm.steps.length >= 3 && row.farm.steps.length <= 12);
    for (const step of row.farm.steps) assert.ok(step.trim().length >= 20 && step.trim().length <= 600);
  }
  assert.deepEqual(engine.derive(snapshot, settings), board);
  assert.ok(board.model.cv.median_multiple < board.model.starter_cv.median_multiple);
});

test('derivation and scenario changes do not mutate snapshot input or valuations', () => {
  const before = JSON.stringify(snapshot);
  const altered = engine.derive(snapshot, { deposit: 20000 });
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(altered.rows.map(row => row.implied_value_usd), board.rows.map(row => row.implied_value_usd));
  assert.notEqual(altered.rows[0].farm.gross, board.rows[0].farm.gross);
  assert.deepEqual(engine.DEFAULTS, settings);
});

test('token classification respects every recorded identity channel', () => {
  assert.equal(engine.preToken(fixture), true);
  for (const patch of [{ gecko_id: 'example' }, { symbol: 'EX' }, { mcap_usd: 1 }]) {
    assert.equal(engine.preToken({ ...fixture, ...patch }), false);
  }
  for (const mcap_usd of [0, -1, null, NaN, Infinity]) {
    assert.equal(engine.preToken({ ...fixture, mcap_usd }), true);
  }
});

test('independent launch policy identifies categories, versions and product brands', () => {
  for (const patch of [
    { category: 'Bridge' }, { category: 'CEX' }, { category: 'Liquid Staking' },
    { name: 'Example V2' }, { name: 'Example v2.1' }, { name: 'Example 2.0' },
    { name: 'Wrapped Example' }, { name: 'Staked Example' }, { name: 'Kraken Vault' },
  ]) assert.equal(engine.excluded({ ...fixture, ...patch }), true, JSON.stringify(patch));
  assert.equal(engine.excluded(fixture), false);
  assert.equal(engine.excluded({ ...fixture, name: 'Krakenish' }), false);
});

test('the authoritative watchlist overrides product exclusions', () => {
  const copy = structuredClone(snapshot);
  const row = copy.protocols.find(protocol => copy.watchlist.includes(protocol.slug));
  Object.assign(row, { category: 'Bridge', name: 'Wrapped Watchlist V2' });
  const result = engine.derive(copy).rows.find(candidate => candidate.slug === row.slug);
  assert.ok(result);
  assert.equal(result.classification_reason, 'Watchlist floor');
});

test('median, interpolated quantiles and dollar formatting cover boundary inputs', () => {
  const values = [9, 1, 5, 3];
  assert.equal(engine.median(values), 4);
  assert.equal(engine.median([9, 1, 5]), 5);
  assert.equal(engine.median([]), 0);
  assert.equal(engine.quantile(values, 0), 1);
  assert.equal(engine.quantile(values, 0.5), 4);
  assert.equal(engine.quantile(values, 1), 9);
  assert.equal(engine.quantile([], 0.9), 0);
  assert.deepEqual(values, [9, 1, 5, 3]);
  for (const [number, text] of [[0, '$0'], [1234, '$1.2K'], [1e6, '$1.0M'], [1e9, '$1.0B'], [1e12, '$1.0T'], [NaN, 'n/a'], [null, 'n/a']]) {
    assert.equal(engine.fmt(number), text);
  }
});

test('tracking age validates real UTC calendar dates and clamps future dates', () => {
  assert.equal(engine.ageDays('2026-03-01', '2026-02-28'), 1);
  assert.equal(engine.ageDays('2024-03-01', '2024-02-29'), 1);
  assert.equal(engine.ageDays('2026-01-01', '2027-01-01'), 0);
  for (const invalid of [null, '', 'invalid', '2026-02-30', '2026-02-29', '2026-1-01', '2026-01-01T00:00:00Z']) {
    assert.equal(engine.ageDays(snapshot.as_of, invalid), null);
    assert.equal(engine.ageDays(invalid, '2026-01-01'), null);
  }
});

test('growth and seasoning caps retain neutral behavior for missing context', () => {
  const adjust = patch => engine.adjustments({ ...fixture, ...patch }, snapshot.as_of);
  assert.equal(adjust({ change_7d: null }).growth, 1);
  assert.equal(adjust({ change_7d: Infinity }).growth, 1);
  assert.equal(adjust({ change_7d: 1000 }).growth, 1.15);
  assert.equal(adjust({ change_7d: -1000 }).growth, 0.925);
  closeTo(adjust({ listed_at: null }).seasoning, 0.925);
  assert.equal(adjust({ listed_at: '2027-01-01' }).seasoning, 0.85);
  assert.equal(adjust({ listed_at: '2020-01-01' }).seasoning, 1);
  const low = engine.valuation(board.model, { ...fixture, change_7d: -50 }, snapshot.as_of);
  const high = engine.valuation(board.model, { ...fixture, change_7d: 100 }, snapshot.as_of);
  assert.ok(high > low);
});

test('the robust regression rejects insufficient anchors and yields bounded predictions', () => {
  const anchors = Array.from({ length: 12 }, (_, index) => ({ tvl_usd: 1e6 * (index + 1), mcap_usd: 2e6 * (index + 1) }));
  assert.throws(() => engine.fitRegression(anchors.slice(0, 7)), /at least eight/);
  assert.throws(() => engine.fitRegression(anchors.map(row => ({ ...row, tvl_usd: 0 }))), /at least eight/);
  const fit = engine.fitRegression(anchors);
  assert.equal(fit.n, 12);
  assert.ok(fit.elasticity >= 0.15 && fit.elasticity <= 1.25);
  assert.ok(fit.residuals.every(Number.isFinite));
  assert.ok(engine.predict(fit, 2e6) > engine.predict(fit, 1e6));
  assert.equal(engine.predict({ intercept: 1000, elasticity: 1 }, 1e100), 1e14);
  assert.equal(engine.predict({ intercept: -1000, elasticity: 1 }, 0), 1);
});

test('comparable identities are deduplicated case-insensitively using greatest TVL', () => {
  const eligible = snapshot.protocols.find(row => row.gecko_id && row.mcap_usd > 0 && row.tvl_usd > 0 && row.category !== 'CEX');
  const duplicate = { ...eligible, slug: 'duplicate-anchor', gecko_id: eligible.gecko_id.toUpperCase(), tvl_usd: eligible.tvl_usd / 2 };
  const cex = { ...eligible, slug: 'cex-anchor', gecko_id: 'separate-cex-token', category: 'CEX' };
  assert.deepEqual(engine.comparableModel([...snapshot.protocols, duplicate, cex], snapshot.as_of), board.model);
});

test('diagnostics support empty data, perfect fits, inverse ranks and ties', () => {
  assert.deepEqual(engine.metrics([], () => 1), { n: 0, median_multiple: 0, mean_abs_log: 0, within_3x_pct: 0, rank_r: 0 });
  const rows = [1, 2, 3, 4].map(mcap_usd => ({ mcap_usd, tvl_usd: 1 }));
  const perfect = engine.metrics(rows, row => row.mcap_usd);
  assert.equal(perfect.rank_r, 1);
  assert.equal(perfect.median_multiple, 1);
  assert.equal(perfect.within_3x_pct, 100);
  assert.equal(engine.metrics(rows, () => 1).rank_r, 0);
  assert.equal(engine.metrics(rows, row => 1 / row.mcap_usd).rank_r, 0); // Predictions have a $1 floor.
  assert.equal(engine.metrics(rows, row => 5 - row.mcap_usd).rank_r, -1);
  assert.equal(engine.metrics(rows, row => row.mcap_usd <= 2 ? 1 : 2).rank_r, 0.89);
  assert.equal(engine.metrics(rows.slice().reverse(), row => row.mcap_usd <= 2 ? 1 : 2).rank_r, 0.89);
});

test('scenario gross, costs, downside and breakeven match the stated formula', () => {
  const farm = scenario({});
  const cost = settings.gas * 5 + settings.deposit * 0.001 + settings.deposit * 0.05 * settings.days / 365;
  closeTo(farm.gross, 50000);
  closeTo(farm.low, 25000);
  closeTo(farm.cost, cost);
  closeTo(farm.net, 50000 - cost);
  closeTo(farm.netLow, 25000 - cost);
  closeTo(farm.breakeven, cost / 100000 * 100);
  assert.equal(farm.verdict, 'Pilot');
  assert.ok(scenario({ deposit: 20000 }).gross > farm.gross);
  assert.ok(scenario({ gas: 0 }).cost < farm.cost);
  assert.ok(scenario({ days: 365 }).cost > farm.cost);
});

test('every ranked plan reconciles its six stages to the total cost, gas and time', () => {
  for (const row of board.rows) {
    const farm = row.farm;
    assert.equal(farm.stages.length, 6, row.slug);
    closeTo(farm.stages.reduce((total, stage) => total + stage.cost, 0), farm.cost);
    closeTo(farm.stages.reduce((total, stage) => total + stage.minutes, 0) / 60, farm.hours);
    assert.equal(farm.stages.reduce((total, stage) => total + stage.transactions, 0), farm.transactions);
    closeTo(farm.gasCost + farm.slippage + farm.capitalCost, farm.cost);
    closeTo(farm.pilot + farm.remaining, settings.deposit);
    assert.equal(farm.pilot, 100);
    assert.equal(farm.reviews, 4);
    for (const [index, stage] of farm.stages.entries()) {
      assert.ok(Number.isInteger(stage.transactions) && stage.transactions >= 0);
      assert.ok(Number.isFinite(stage.cost) && stage.cost >= 0);
      assert.ok(farm.steps[index].includes(`Cost: $${stage.cost.toFixed(2)}`));
      assert.ok(farm.steps[index].includes(`Time: ${stage.minutes} minutes.`));
      assert.ok(farm.steps[index].includes('Capital:'));
      assert.ok(farm.steps[index].includes('Gas estimate:'));
      assert.ok(farm.steps[index].includes(`Hold: ${index === 4 ? settings.days : 0} days.`));
      assert.ok(farm.steps[index].includes('Opportunity cost:'));
      closeTo(stage.gas_usd + stage.execution_usd + stage.opportunity_usd, stage.cost);
      closeTo(stage.gas_usd, stage.transactions * settings.gas);
      assert.ok(farm.steps[index].includes(stage.budget));
    }
    closeTo(farm.stages[2].capital_usd + farm.stages[3].capital_usd, settings.deposit);
    closeTo(farm.stages[4].opportunity_usd, settings.deposit * settings.opportunity / 100 * settings.days / 365);
    assert.equal(farm.stages[4].hold_days, settings.days);
    closeTo(farm.stages.reduce((total, stage) => total + stage.gas_usd, 0), farm.gasCost);
    closeTo(farm.stages.reduce((total, stage) => total + stage.execution_usd, 0), farm.slippage);
  }
});

test('pilot caps, allocation fees and paired-asset approvals change the transaction budget', () => {
  const small = scenario({ deposit: 50 }), fullPilot = scenario({ deposit: 100 });
  const larger = scenario({ deposit: 101 });
  assert.equal(small.pilot, 50);
  assert.equal(small.remaining, 0);
  assert.equal(small.stages[3].transactions, 0);
  assert.equal(small.stages[3].cost, 0);
  assert.equal(small.stages[3].minutes, 0);
  assert.equal(fullPilot.transactions, 4);
  assert.equal(larger.transactions, 5);
  closeTo(larger.cost - fullPilot.cost, settings.gas + 0.001 + 0.05 * settings.days / 365);
  const dex = engine.plan({ ...fixture, category: 'Dexs' }, 1e8, [5e7, 2e8], 365, settings);
  assert.equal(dex.transactions, 7);
  assert.equal(dex.stages[2].transactions, 3);
  assert.equal(dex.stages[5].transactions, 3);
  assert.ok(dex.steps[2].includes('balanced owned assets'));
  assert.ok(dex.steps[5].includes('both assets'));
  closeTo(dex.cost - scenario({}).cost, settings.gas * 2);
});

test('maintenance counts only reviews before exit, including fractional horizons', () => {
  for (const [days, reviews] of [[1, 0], [7, 0], [7.5, 1], [14, 1], [15, 2], [30, 4], [365, 52]]) {
    const farm = scenario({ days });
    assert.equal(farm.reviews, reviews);
    assert.equal(farm.stages[4].minutes, reviews * 5);
    closeTo(farm.hours, (50 + reviews * 5) / 60);
    assert.ok(farm.steps[5].includes(`by day ${days}`));
  }
});

test('category recipes distinguish vault, receipt, collateral and unsupported routes', () => {
  const recipe = category => engine.plan({ ...fixture, category }, 1e8, [5e7, 2e8], 365, settings);
  for (const category of ['Yield Aggregator', 'Liquidity Manager', 'Farm', 'CDP Manager', 'Indexes']) {
    assert.equal(recipe(category).family, 'Yield');
    assert.ok(recipe(category).steps[2].includes('unlevered vault'));
    assert.ok(recipe(category).steps[5].includes('withdrawal queue'));
  }
  for (const category of ['Restaking', 'Staking Pool', 'Anchor BTC', 'Decentralized BTC']) {
    assert.equal(recipe(category).family, 'Liquid Staking');
    assert.ok(recipe(category).steps[2].includes('unbonding fits the horizon'));
  }
  for (const category of ['Basis Trading', 'Leveraged Farming', 'Interest Rate Derivatives']) {
    assert.equal(recipe(category).family, 'Derivatives');
    assert.ok(recipe(category).steps[2].includes('stop if trading exposure is required'));
  }
  assert.ok(recipe('CDP').steps[2].includes('without minting debt'));
  assert.equal(recipe('Collateral Markets').family, 'Lending');
  assert.equal(recipe('CeDeFi').family, 'RWA');
  assert.equal(recipe('Unknown future category').family, 'Other');
  assert.ok(recipe('Unknown future category').steps[2].includes('stop if none exists'));
});

test('zero allocation, zero eligibility, share caps and verdict boundaries are defined', () => {
  const zero = scenario({ allocation: 0 });
  assert.equal(zero.gross, 0);
  assert.equal(zero.breakeven, null);
  assert.equal(zero.verdict, 'Skip');
  assert.equal(scenario({ eligibility: 0 }).gross, 0);
  const tiny = engine.plan({ ...fixture, tvl_usd: 1 }, 1e8, [5e7, 2e8], 365, settings);
  closeTo(tiny.gross, 1e8 * 0.1 * 0.5);
  assert.equal(engine.plan({ ...fixture, tvl_usd: 0 }, 1e8, [5e7, 2e8], 365, settings).verdict, 'Skip');
  assert.equal(engine.plan({ ...fixture, change_7d: -15 }, 1e8, [5e7, 2e8], 365, settings).verdict, 'Skip');
  assert.equal(engine.plan(fixture, 1e8, [5e7, 2e8], 89, settings).verdict, 'Observe');
  assert.equal(engine.plan(fixture, 1e8, [5e7, 2e8], 90, settings).verdict, 'Pilot');
  assert.equal(engine.plan(fixture, 1e8, [5e7, 2e8], null, settings).verdict, 'Observe');
});

test('all scenario controls reject out-of-range, non-finite and nonnumeric values', () => {
  for (const [key, [min, max]] of Object.entries(engine.LIMITS)) {
    for (const value of [min - 1, max + 1, NaN, Infinity, null, '10', undefined]) {
      assert.throws(() => scenario({ [key]: value }), /Invalid scenario setting/, key);
    }
    assert.doesNotThrow(() => scenario({ [key]: min }));
    assert.doesNotThrow(() => scenario({ [key]: max }));
  }
  assert.throws(() => engine.derive(snapshot, { days: 0 }), /Invalid scenario setting: days/);
});

test('malformed snapshot roots, dates, watchlists and slugs fail explicitly', () => {
  for (const value of [null, {}, { protocols: [] }, { watchlist: [] }]) assert.throws(() => engine.derive(value), /Snapshot requires/);
  assert.throws(() => engine.derive({ ...snapshot, as_of: '2026-02-30' }), /valid as_of date/);
  assert.throws(() => engine.derive({ ...snapshot, protocols: [null] }), /Malformed protocol row/);
  assert.throws(() => engine.derive({ ...snapshot, protocols: [...snapshot.protocols, snapshot.protocols[0]] }), /duplicate protocol slug/);
  assert.throws(() => engine.derive({ ...snapshot, watchlist: ['invented'] }), /missing from snapshot/);
  assert.throws(() => engine.derive({ ...snapshot, watchlist: [...snapshot.watchlist, snapshot.watchlist[0]] }), /duplicate watchlist/);
  for (const slug of [null, '', 'has space', 'x'.repeat(129)]) assert.throws(() => engine.derive(patchSnapshot({ slug })), /protocol slug/);
  for (const watchlist of [[null], ['has space']]) assert.throws(() => engine.derive({ ...snapshot, watchlist }), /watchlist slug/);
});

test('invalid protocol fields and optional context are rejected before scoring', () => {
  for (const patch of [{ name: '' }, { name: 123 }, { tvl_usd: -1 }, { tvl_usd: NaN }, { tvl_usd: Infinity }]) {
    assert.throws(() => engine.derive(patchSnapshot(patch)), /Malformed protocol row/);
  }
  for (const patch of [
    { chains: null }, { chains: [123] }, { chains: [' '] }, { category: {} },
    { symbol: 12 }, { gecko_id: [] }, { mcap_usd: '12' }, { change_7d: Infinity }, { listed_at: '2026-02-30' },
  ]) assert.throws(() => engine.derive(patchSnapshot(patch)), /Malformed protocol context/);
});

test('zero TVL and missing optional context stay finite and deterministic', () => {
  const copy = structuredClone(snapshot);
  const row = copy.protocols.find(protocol => copy.watchlist.includes(protocol.slug));
  Object.assign(row, { tvl_usd: 0, change_7d: null, listed_at: null, chains: [], category: null });
  const result = engine.derive(copy);
  assert.deepEqual(result, engine.derive(copy));
  const scored = result.rows.find(candidate => candidate.slug === row.slug);
  assert.ok(Number.isFinite(scored.implied_value_usd));
  assert.ok(Number.isFinite(scored.farm.net));
  assert.equal(scored.value_per_tvl, 0);
  assert.equal(scored.farm.verdict, 'Skip');
});

test('search is trimmed and case-insensitive across names, slugs, chains and categories', () => {
  const rows = [{ ...fixture, name: 'Alpha Vault' }, { ...fixture, slug: 'second', name: 'Beta', category: 'Dexs', chains: ['Base'] }];
  for (const search of [' ALPHA ', 'example', 'ethereum', 'lending']) assert.deepEqual(slugs(engine.filterRows(rows, { search })), ['example']);
  assert.deepEqual(slugs(engine.filterRows(rows, { search: 'base' })), ['second']);
  assert.deepEqual(engine.filterRows(rows, { search: '<script>' }), []);
  assert.equal(engine.filterRows(rows).length, 2);
});

test('category, chain, status and quick filters compose without mutating rows', () => {
  const rows = [
    { ...fixture, watchlist: true, implied_value_usd: 100, farm: { net: 10, verdict: 'Pilot' } },
    { ...fixture, slug: 'second', category: null, chains: [], status: 'Traded', farm: null },
    { ...fixture, slug: 'third', watchlist: true, implied_value_usd: 50, farm: { net: 0, verdict: 'Observe' } },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(slugs(engine.filterRows(rows, { quick: 'watch', chain: 'Ethereum', category: 'Lending', status: 'Ranked' })), ['example', 'third']);
  assert.deepEqual(slugs(engine.filterRows(rows, { quick: 'worth' })), ['example']);
  assert.deepEqual(slugs(engine.filterRows(rows, { quick: 'pilot' })), ['example']);
  assert.deepEqual(slugs(engine.filterRows(rows, { category: 'Uncategorized' })), ['second']);
  assert.deepEqual(slugs(engine.filterRows(rows, { status: 'Traded' })), ['second']);
  assert.deepEqual(engine.filterRows(rows, { chain: 'Eth' }), []);
  assert.deepEqual(rows, before);
});

test('numeric and text sorting support both directions and deterministic slug ties', () => {
  const rows = [
    { slug: 'z', name: 'Beta', tvl_usd: 10, farm: { net: -1 } },
    { slug: 'a', name: 'Alpha', tvl_usd: 10, farm: { net: 100 } },
    { slug: 'm', name: 'Gamma', tvl_usd: 2, farm: { net: 5 } },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'tvl_usd', direction: -1 })), ['a', 'z', 'm']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'tvl_usd', direction: 1 })), ['m', 'a', 'z']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'net', direction: -1 })), ['a', 'm', 'z']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'name', direction: 1 })), ['a', 'z', 'm']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'name', direction: -1 })), ['m', 'z', 'a']);
  assert.deepEqual(rows, before);
});

test('traded value sorting uses recorded market cap and missing numerics use zero', () => {
  const rows = [
    { slug: 'a', mcap_usd: null, implied_value_usd: 100 },
    { slug: 'b', mcap_usd: 20, implied_value_usd: 2 },
    { slug: 'c', mcap_usd: 5, implied_value_usd: 3 },
  ];
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'implied_value_usd', status: 'Traded', direction: -1 })), ['b', 'c', 'a']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: 'mcap_usd' })), ['a', 'c', 'b']);
  assert.deepEqual(slugs(engine.sortRows(rows, { key: '__proto__' })), ['a', 'b', 'c']);
  assert.deepEqual(engine.filterRows([], { quick: 'watch' }), []);
  assert.deepEqual(engine.sortRows([], { key: 'net' }), []);
});

test('momentum thresholds preserve missing change as Unknown', () => {
  for (const [change_7d, expected] of [[5, 'Growing'], [4.9, 'Steady'], [-4.9, 'Steady'], [-5, 'Fading'], [null, 'Unknown'], [Infinity, 'Unknown']]) {
    const signals = engine.launchSignals({ ...fixture, change_7d }, snapshot.as_of);
    assert.equal(signals.momentum.label, expected);
    assert.equal(signals.launch_probability, null);
  }
});

test('risk context exposes drawdowns, zero TVL, product exclusions and missing dates', () => {
  assert.equal(engine.launchSignals(fixture, snapshot.as_of).risk.label, 'Unassessed');
  for (const patch of [{ tvl_usd: 0 }, { change_7d: -15 }, { category: 'Bridge' }]) {
    const risk = engine.launchSignals({ ...fixture, ...patch }, snapshot.as_of).risk;
    assert.equal(risk.label, 'Elevated');
    assert.ok(risk.flags.length > 0);
  }
  for (const patch of [{ change_7d: null }, { listed_at: null }, { listed_at: snapshot.as_of }]) {
    assert.equal(engine.launchSignals({ ...fixture, ...patch }, snapshot.as_of).risk.label, 'Caution');
  }
  assert.equal(engine.launchSignals().momentum.label, 'Unknown');
  assert.equal(engine.launchSignals({ ...fixture, symbol: 'EX' }, snapshot.as_of).token_status, 'Token recorded');
});

test('momentum and risk filters use the same snapshot analytics as detail badges', () => {
  const rows = [fixture, { ...fixture, slug: 'fading', change_7d: -20 }, { ...fixture, slug: 'unknown', change_7d: null }];
  assert.deepEqual(slugs(engine.filterRows(rows, { momentum: 'Growing', asOf: snapshot.as_of })), ['example']);
  assert.deepEqual(slugs(engine.filterRows(rows, { momentum: 'Fading', risk: 'Elevated', asOf: snapshot.as_of })), ['fading']);
  assert.deepEqual(slugs(engine.filterRows(rows, { risk: 'Caution', asOf: snapshot.as_of })), ['unknown']);
});

test('dashboard assets exist and semantic markup loads app.css, focus.css and ordered local scripts', () => {
  const directory = resolve(__dirname, '../dashboard');
  const html = readFileSync(resolve(directory, 'index.html'), 'utf8');
  const cssPath = resolve(directory, 'app.css');
  assert.ok(existsSync(cssPath), 'dashboard/app.css must be present');
  const css = readFileSync(cssPath, 'utf8');
  assert.ok(css.length > 10000, 'Dashboard styling must be complete');
  for (const file of ['app.css', 'focus.css']) {
    assert.match(html, new RegExp('<link\\b[^>]*rel="stylesheet"[^>]*href="' + file.replace('.', '\\.') + '"'));
    assert.ok(existsSync(resolve(directory, file)));
  }
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['../data.js', 'engine.js', 'app.js']);
  for (const file of scripts.slice(1)) assert.ok(existsSync(resolve(directory, file)));
  assert.match(html, /<main\b/);
  assert.match(html, /<nav\b[^>]*aria-label=/);
  assert.match(html, /<aside\b[^>]*id="detail-panel"/);
  assert.match(html, /name="color-scheme" content="light dark"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'DOM ids must be unique');
  for (const id of ['risk-filter', 'momentum-filter', 'mobile-sort', 'protocol-rows', 'drawer-backdrop']) assert.ok(ids.includes(id), id);
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /max-width:\s*600px/);
  assert.match(css, /\.signal-badge/);
  assert.match(css, /\.drawer-open/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(html + css, /(?:src|href)="https?:|@import\s|url\(\s*https?:/);
  assert.equal(dirname(cssPath), directory);
});
