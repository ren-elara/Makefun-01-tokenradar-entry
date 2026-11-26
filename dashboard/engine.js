/* Shared deterministic valuation, classification and farm-planning engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ORBIT = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const VERSION = 'orbit-1.1';
  const DEFAULTS = { deposit: 10000, days: 30, gas: 1, opportunity: 5, eligibility: 50, allocation: 10 };
  const LIMITS = { deposit: [1, 1e6], days: [1, 365], gas: [0, 1000], opportunity: [0, 100], eligibility: [0, 100], allocation: [0, 100] };
  const FAMILIES = ['Lending', 'Dexs', 'Risk Curators', 'Yield', 'RWA', 'Derivatives', 'Liquid Staking', 'CDP', 'Onchain Capital Allocator', 'Bridge', 'Canonical Bridge'];
  const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const VERSION_SUFFIX = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
  const PRODUCT_WORD = /\b(?:wrapped|staked|staking)\b/i;
  const HARMFUL = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Stablecoin Wrapper', 'Payments', 'Crypto Card Issuer', 'Launchpad']);
  const DAY = 86400000;
  const round = (n, k) => Math.round(n * 10 ** k) / 10 ** k;
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const median = (values) => {
    if (!values.length) return 0;
    const a = values.slice().sort((x, y) => x - y), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const quantile = (values, q) => {
    if (!values.length) return 0;
    const a = values.slice().sort((x, y) => x - y), x = (a.length - 1) * q;
    const lo = Math.floor(x), hi = Math.ceil(x);
    return a[lo] + (a[hi] - a[lo]) * (x - lo);
  };
  const fmt = (n) => {
    if (!finite(n)) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(1) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  };

  const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  function ageDays(asOf, listedAt) {
    if (!validDate(asOf) || !validDate(listedAt)) return null;
    const to = Date.parse(asOf + 'T00:00:00Z'), from = Date.parse(listedAt + 'T00:00:00Z');
    if (!Number.isFinite(to) || !Number.isFinite(from)) return null;
    return Math.max(0, Math.floor((to - from) / DAY));
  }
  function preToken(p) {
    return !p.gecko_id && !p.symbol && !(finite(p.mcap_usd) && p.mcap_usd > 0);
  }
  function excluded(p) {
    return HARMFUL.has(p.category) || VERSION_SUFFIX.test(p.name) || PRODUCT_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name);
  }
  function reason(p, watch) {
    if (watch.has(p.slug)) return 'Watchlist floor';
    if (!preToken(p)) return 'Token recorded';
    if (HARMFUL.has(p.category)) return 'Product category excluded by policy';
    if (VERSION_SUFFIX.test(p.name)) return 'Versioned product';
    if (PRODUCT_WORD.test(p.name)) return 'Wrapped or staked product';
    if (EXCHANGE_PREFIX.test(p.name)) return 'Exchange-branded product';
    return 'Below floor, eligible';
  }
  function pooledSolve(X, y, weights, ridge) {
    const n = X[0].length;
    const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      X.reduce((s, x, k) => s + weights[k] * x[i] * x[j], 0) + (i === j && i > 0 ? ridge : 0)));
    const b = Array.from({ length: n }, (_, i) => X.reduce((s, x, k) => s + weights[k] * x[i] * y[k], 0));
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[pivot][i])) pivot = j;
      if (Math.abs(A[pivot][i]) < 1e-12) continue;
      [A[i], A[pivot]] = [A[pivot], A[i]]; [b[i], b[pivot]] = [b[pivot], b[i]];
      const div = A[i][i];
      for (let k = i; k < n; k++) A[i][k] /= div;
      b[i] /= div;
      for (let j = 0; j < n; j++) if (j !== i) {
        const f = A[j][i];
        for (let k = i; k < n; k++) A[j][k] -= f * A[i][k];
        b[j] -= f * b[i];
      }
    }
    return b;
  }
  function fitRegression(rows) {
    const valid = rows.filter((p) => finite(p.tvl_usd) && p.tvl_usd > 0 && finite(p.mcap_usd) && p.mcap_usd > 0);
    if (valid.length < 8) throw new Error('Model requires at least eight positive TVL/market-cap comparables.');
    const X = valid.map((p) => [1, Math.log(p.tvl_usd / 1e8)]);
    const y = valid.map((p) => Math.log(p.mcap_usd));
    let weights = Array(valid.length).fill(1), beta = [0, 0];
    for (let iter = 0; iter < 40; iter++) {
      beta = pooledSolve(X, y, weights, 0.01);
      const residuals = y.map((v, i) => v - X[i].reduce((s, z, j) => s + z * beta[j], 0));
      const center = median(residuals);
      const scale = Math.max(0.2, 1.4826 * median(residuals.map((v) => Math.abs(v - center))));
      const next = residuals.map((v) => Math.min(1, 1.345 * scale / Math.max(Math.abs(v), 1e-9)));
      if (Math.max(...next.map((v, i) => Math.abs(v - weights[i]))) < 1e-6) { weights = next; break; }
      weights = next;
    }
    const residuals = valid.map((p) => Math.log(p.mcap_usd) - beta[0] - beta[1] * Math.log(p.tvl_usd / 1e8));
    return { n: valid.length, intercept: beta[0], elasticity: clamp(beta[1], 0.15, 1.25), residuals };
  }
  function metrics(records, predict) {
    const errors = records.filter((p) => finite(p.mcap_usd) && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p) => Math.log(Math.max(1, predict(p)) / p.mcap_usd));
    if (!errors.length) return { n: 0, median_multiple: 0, mean_abs_log: 0, within_3x_pct: 0, rank_r: 0 };
    const abs = errors.map(Math.abs);
    const a = records.filter((p) => finite(p.mcap_usd) && p.mcap_usd > 0 && p.tvl_usd > 0);
    const ranks = (xs) => {
      const order = xs.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), out = Array(xs.length);
      for (let i = 0; i < order.length;) { let j = i + 1; while (j < order.length && order[j][0] === order[i][0]) j++; for (let k = i; k < j; k++) out[order[k][1]] = (i + j + 1) / 2; i = j; }
      return out;
    };
    const rx = ranks(a.map((p) => Math.log(Math.max(1, predict(p))))), ry = ranks(a.map((p) => Math.log(p.mcap_usd)));
    const mx = rx.reduce((s, v) => s + v, 0) / rx.length, my = ry.reduce((s, v) => s + v, 0) / ry.length;
    const den = Math.sqrt(rx.reduce((s, v) => s + (v - mx) ** 2, 0) * ry.reduce((s, v) => s + (v - my) ** 2, 0));
    const corr = den ? rx.reduce((s, v, i) => s + (v - mx) * (ry[i] - my), 0) / den : 0;
    return { n: errors.length, median_multiple: round(Math.exp(median(abs)), 2), mean_abs_log: round(abs.reduce((s, v) => s + v, 0) / abs.length, 3), within_3x_pct: Math.round(100 * abs.filter((v) => v <= Math.log(3)).length / abs.length), rank_r: round(corr, 2) };
  }
  function adjustments(p, asOf) {
    const age = ageDays(asOf, p.listed_at);
    return { growth: 1 + 0.15 * clamp(finite(p.change_7d) ? p.change_7d : 0, -50, 100) / 100,
      seasoning: 0.85 + 0.15 * Math.min(age ?? 365, 730) / 730 };
  }
  function valuation(model, p, asOf) {
    const a = adjustments(p, asOf);
    return clamp(Math.round(predict(model, p.tvl_usd) * a.growth * a.seasoning), 1, 1e14);
  }
  function outOfFold(records, asOf) {
    const folds = 5;
    const held = Array.from({ length: folds }, () => []);
    for (const p of records) {
      const id = String(p.gecko_id || p.symbol || p.slug);
      let h = 2166136261;
      for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
      held[(h >>> 0) % folds].push(p);
    }
    const predictions = [];
    for (let i = 0; i < folds; i++) {
      const train = records.filter((p) => !held[i].includes(p));
      if (held[i].length && train.length >= 8) {
        const fit = fitRegression(train);
        for (const p of held[i]) predictions.push({ p, value: valuation(fit, p, asOf) });
      }
    }
    return predictions;
  }
  function comparableModel(protocols, asOf) {
    const identities = new Map();
    for (const p of protocols.filter((p) => finite(p.mcap_usd) && p.mcap_usd > 0 && finite(p.tvl_usd) && p.tvl_usd > 0 && p.category !== 'CEX')) {
      const id = String(p.gecko_id || p.symbol || p.slug).toLowerCase();
      if (!identities.has(id) || identities.get(id).tvl_usd < p.tvl_usd) identities.set(id, p);
    }
    const trained = [...identities.values()];
    const fit = fitRegression(trained);
    const folds = outOfFold(trained, asOf);
    const cv = metrics(folds.map((x) => ({ ...x.p, _actual: x.p.mcap_usd, _pred: x.value })), (p) => p._pred);
    const residuals = folds.map((x) => Math.log(x.p.mcap_usd / x.value));
    const q10 = quantile(residuals, 0.10), q90 = quantile(residuals, 0.90);
    const dateCut = '2026-01-01';
    const cohort = trained.filter((p) => typeof p.listed_at === 'string' && p.listed_at >= dateCut);
    const prior = trained.filter((p) => !cohort.includes(p));
    const dateFit = prior.length >= 8 ? fitRegression(prior) : fit;
    const datePred = (p) => valuation(dateFit, p, asOf);
    const starter = (p) => p.tvl_usd * 0.25 * (1 + clamp(p.change_7d || 0, -60, 120) / 200) * (0.6 + Math.min(ageDays(asOf, p.listed_at) ?? 365, 1095) / 1095 * 0.4);
    return {
      n: fit.n, intercept: fit.intercept, elasticity: fit.elasticity,
      log_base: Math.exp(fit.intercept), q10, q90,
      cv, starter_cv: metrics(folds.map((x) => ({ ...x.p, _pred: starter(x.p) })), (p) => p._pred),
      recent: { since: dateCut, n: cohort.length, metrics: metrics(cohort.map((p) => ({ ...p, _pred: datePred(p) })), (p) => p._pred) },
      residuals,
      formula: `exp(${round(fit.intercept, 4)} + ${round(fit.elasticity, 4)} × ln(TVL / $100M)) × growth × seasoning`,
    };
  }
  function predict(model, tvl) {
    return clamp(Math.round(Math.exp(model.intercept + model.elasticity * Math.log(Math.max(1, tvl) / 1e8))), 1, 1e14);
  }
  function familyFor(category) {
    const c = String(category || 'Other');
    return FAMILIES.includes(c) ? c : 'Other';
  }
  function plan(p, implied, band, age, settings) {
    settings = { ...DEFAULTS, ...settings };
    for (const [k, [min, max]] of Object.entries(LIMITS)) if (!finite(settings[k]) || settings[k] < min || settings[k] > max) throw new Error(`Invalid scenario setting: ${k}`);
    const tvl = Math.max(0, p.tvl_usd), deposit = settings.deposit, days = settings.days;
    const gas = settings.gas, apr = settings.opportunity / 100;
    const family = familyFor(p.category);
    const eligibility = settings.eligibility / 100, allocation = settings.allocation / 100;
    const safeTvl = Math.max(tvl, 1);
    const gross = implied * allocation * Math.min(1, deposit / safeTvl) * eligibility;
    const low = band[0] * allocation * Math.min(1, deposit / safeTvl) * eligibility;
    const slippage = deposit * 0.001;
    const cost = gas * 4 + slippage + deposit * apr * days / 365;
    const net = gross - cost, netLow = low - cost;
    const threshold = implied * allocation * Math.min(1, deposit / safeTvl);
    const breakeven = threshold > 0 ? (cost / threshold) * 100 : null;
    let verdict = 'Observe';
    if (tvl <= 0 || (p.change_7d ?? 0) <= -15 || net < 0) verdict = 'Skip';
    else if (netLow >= 0 && breakeven <= 33 && age !== null && age >= 90) verdict = 'Pilot';
    const chain = Array.isArray(p.chains) && p.chains.length ? p.chains[0] : 'the listed chain';
    const verb = family === 'Lending' || family === 'CDP' ? `Test a tiny reversible supply or collateral position on ${chain}`
      : family === 'Dexs' || family === 'Yield' ? `Check pool depth, then test a balanced LP position on ${chain}`
      : family === 'Risk Curators' || family === 'Onchain Capital Allocator' ? `Inspect vault assets and curator controls before a small vault deposit on ${chain}`
      : family === 'RWA' ? `Check jurisdiction and redemption eligibility before considering the ${chain} product`
      : family === 'Derivatives' ? `Avoid leverage; only test a minimal hedged position if it is eligible on ${chain}`
      : family === 'Liquid Staking' ? `Verify contract and redemption terms before a small staking test on ${chain}`
      : family.includes('Bridge') ? `Verify the official bridge route and withdrawal path before a minimal transfer to ${chain}`
      : `Verify the live product and access requirements before a minimal, reversible test on ${chain}`;
    return {
      gross, low, cost, net, netLow, breakeven, verdict, family, slippage, hours: 0.75 + Math.ceil(days / 7) / 12,
      steps: [
        `Verify ${p.name}'s official app independently; confirm the chain, contract and current product before connecting. Cost: $0. Time: 10 minutes.`,
        `Check wallet, geography and product eligibility; token status in this DefiLlama snapshot is not a reward promise. Cost: $0. Time: 5 minutes.`,
        ` ${verb}. Estimate about $${gas} per transaction; begin below the $${deposit.toLocaleString('en-US')} scenario deposit. Time: 15 minutes.`,
        `Record deposit, TVL and one useful interaction; avoid repeat volume, wash trading, leverage and transactions done only for an unverified allocation. Cost: gas shown above. Time: ${days} days maximum.`,
        `Recheck TVL, withdrawals, permission changes and official announcements weekly; the value band is a traded-token cross-section, not launch odds. Cost: $0. Time: 5 minutes weekly.`,
        `Withdraw or revoke approvals when expected net economics turn negative; never pay a claim fee, and verify any distribution through official channels. Cost: about $${gas} gas. Time: 10 minutes.`,
      ],
      assumptions: `Scenario only: $${deposit} for ${days}d, ${settings.eligibility}% assumed eligibility, ${settings.allocation}% hypothetical TVL-pro-rata allocation; four gas transactions, 0.1% execution allowance and capital cost deducted. Principal loss and labor are not included. No allocation or launch probability is observed.`,
    };
  }
  function derive(snapshot, settings) {
    if (!snapshot || !Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) throw new Error('Snapshot requires protocols[] and watchlist[].');
    if (!validDate(snapshot.as_of)) throw new Error('Snapshot requires a valid as_of date.');
    if (snapshot.watchlist.some((s) => typeof s !== 'string' || !s || /\s/.test(s)) || new Set(snapshot.watchlist).size !== snapshot.watchlist.length) throw new Error('Malformed or duplicate watchlist slug.');
    settings = { ...DEFAULTS, ...settings };
    for (const p of snapshot.protocols) if (!p || typeof p !== 'object') throw new Error('Malformed protocol row.');
    const watch = new Set(snapshot.watchlist), bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
    for (const slug of watch) if (!bySlug.has(slug)) throw new Error(`Watchlist protocol missing from snapshot: ${slug}`);
    const unique = new Set();
    for (const p of snapshot.protocols) {
      if (!p || typeof p.slug !== 'string' || !p.slug || /\s/.test(p.slug) || p.slug.length > 128 || unique.has(p.slug)) throw new Error('Snapshot has a missing or duplicate protocol slug.');
      unique.add(p.slug);
      if (typeof p.name !== 'string' || !p.name.trim() || !finite(p.tvl_usd) || p.tvl_usd < 0) throw new Error(`Malformed protocol row: ${p.slug}`);
      if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string' || !c.trim()) ||
          ['category', 'gecko_id', 'symbol'].some((k) => p[k] != null && typeof p[k] !== 'string') ||
          ['change_7d', 'mcap_usd'].some((k) => p[k] != null && !finite(p[k])) ||
          (p.listed_at != null && !validDate(p.listed_at))) throw new Error(`Malformed protocol context: ${p.slug}`);
    }
    const allRankable = snapshot.protocols.filter((p) => preToken(p) && (watch.has(p.slug) || !excluded(p)));
    const comps = comparableModel(snapshot.protocols, snapshot.as_of);
    const scored = allRankable.map((p) => {
      const value = valuation(comps, p, snapshot.as_of);
      const band = [clamp(Math.round(value * Math.exp(comps.q10)), 1, 1e14), clamp(Math.round(value * Math.exp(comps.q90)), 1, 1e14)];
      const age = ageDays(snapshot.as_of, p.listed_at);
      const farm = plan(p, value, band, age, settings);
      return {
        ...p, age_days: age, implied_value_usd: value, band_low_usd: band[0], band_high_usd: band[1],
        value_per_tvl: p.tvl_usd > 0 ? value / p.tvl_usd : 0,
        watchlist: watch.has(p.slug), model: VERSION, factors: adjustments(p, snapshot.as_of), classification_reason: reason(p, watch), farm,
      };
    }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug, 'en'));
    scored.forEach((p, i) => { p.rank = i + 1; });
    const ranked = new Set(scored.map((p) => p.slug));
    if (snapshot.watchlist.some((slug) => !ranked.has(slug))) throw new Error('Internal classification failed full watchlist coverage.');
    const traded = snapshot.protocols.filter((p) => !preToken(p));
    const rankedTrade = traded.filter((p) => finite(p.mcap_usd) && p.mcap_usd > 0).map((p) => ({ ...p, predicted_mcap_usd: predict(comps, p.tvl_usd) })).sort((a,b)=>b.mcap_usd-a.mcap_usd);
    const universe = snapshot.protocols.map((p) => ({ ...p, status: !preToken(p) ? 'Traded' : (ranked.has(p.slug) ? 'Ranked' : 'Set aside'), reason: reason(p, watch), rank: scored.find((q) => q.slug === p.slug)?.rank ?? null }));
    return { version: VERSION, as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, settings, model: comps, rows: scored, traded: rankedTrade, universe, watchlist_size: watch.size, trained_size: comps.n, traded_size: traded.length, excluded_size: snapshot.protocols.length - scored.length - traded.length };
  }
  return { VERSION, DEFAULTS, LIMITS, FAMILIES, fmt, median, quantile, ageDays, preToken, excluded, fitRegression, metrics, comparableModel, adjustments, valuation, predict, plan, derive };
});
