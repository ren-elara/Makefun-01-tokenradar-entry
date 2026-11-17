// Cross-sectional model comparisons on the same deterministic token identity folds.
const { readFileSync } = require('node:fs');
const O = require('../dashboard/engine.js');
const path = process.argv[2];
if (!path) throw new Error('Usage: node tools/research.cjs <snapshot.json>');
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const ids = new Map();
for (const p of snapshot.protocols) {
  if (!(p.mcap_usd > 0 && p.tvl_usd > 0) || p.category === 'CEX') continue;
  const id = String(p.gecko_id || p.symbol || p.slug).toLowerCase();
  if (!ids.has(id) || ids.get(id).tvl_usd < p.tvl_usd) ids.set(id, p);
}
const rows = [...ids.values()];
const fold = (p) => {
  let h = 2166136261;
  for (const c of String(p.gecko_id || p.symbol || p.slug)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 5;
};
const experiments = {
  'fitted median market-cap/TVL': (train) => {
    const ratio = O.median(train.map((p) => p.mcap_usd / p.tvl_usd));
    return (p) => p.tvl_usd * ratio;
  },
  'ordinary log-size regression': (train) => {
    const x = train.map((p) => Math.log(p.tvl_usd / 1e8)), y = train.map((p) => Math.log(p.mcap_usd));
    const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
    const beta = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.reduce((s, v) => s + (v - mx) ** 2, 0);
    return (p) => Math.exp(my + beta * (Math.log(p.tvl_usd / 1e8) - mx));
  },
  'robust log-size curve': (train) => {
    const fit = O.fitRegression(train);
    return (p) => O.predict(fit, p.tvl_usd);
  },
  'ORBIT exact ranked value': (train) => {
    const fit = O.fitRegression(train);
    return (p) => O.valuation(fit, p, snapshot.as_of);
  },
};
const results = {};
for (const [name, fit] of Object.entries(experiments)) {
  const held = [];
  for (let i = 0; i < 5; i++) {
    const predict = fit(rows.filter((p) => fold(p) !== i));
    for (const p of rows.filter((p) => fold(p) === i)) held.push({ ...p, prediction: predict(p) });
  }
  results[name] = O.metrics(held, (p) => p.prediction);
}
const model = O.comparableModel(snapshot.protocols, snapshot.as_of);
results['official starter'] = model.starter_cv;
console.log(JSON.stringify({ as_of: snapshot.as_of, identity_groups: rows.length, diagnostics: results, recent_cohort: model.recent }, null, 2));