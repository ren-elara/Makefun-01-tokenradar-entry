/* Deterministic, offline analytics shared by the entrypoint and browser. */
(function expose(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ORBIT = api;
})(typeof globalThis === 'object' ? globalThis : this, function createEngine() {
  'use strict';

  const VERSION = 'orbit-1.1';
  const DEFAULTS = { deposit: 10000, days: 30, gas: 1, opportunity: 5, eligibility: 50, allocation: 10 };
  const LIMITS = {
    deposit: [1, 1e6], days: [1, 365], gas: [0, 1000],
    opportunity: [0, 100], eligibility: [0, 100], allocation: [0, 100],
  };
  const FAMILIES = [
    'Lending', 'Dexs', 'Risk Curators', 'Yield', 'RWA', 'Derivatives',
    'Liquid Staking', 'CDP', 'Onchain Capital Allocator', 'Bridge', 'Canonical Bridge',
  ];
  const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const VERSION_SUFFIX = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
  const PRODUCT_WORD = /\b(?:wrapped|staked|staking)\b/i;
  const HARMFUL = new Set([
    'CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking',
    'Liquid Restaking', 'Restaked BTC', 'Stablecoin Wrapper', 'Payments',
    'Crypto Card Issuer', 'Launchpad',
  ]);
  const SORT_KEYS = new Set([
    'rank', 'name', 'slug', 'implied_value_usd', 'mcap_usd', 'tvl_usd',
    'change_7d', 'age_days', 'net', 'value_per_tvl',
  ]);
  const DAY = 86400000;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  const sum = values => values.reduce((total, value) => total + value, 0);

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function quantile(values, fraction) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const position = (sorted.length - 1) * fraction;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  }

  function fmt(value) {
    if (!finite(value)) return 'n/a';
    const absolute = Math.abs(value);
    if (absolute >= 1e12) return '$' + (value / 1e12).toFixed(1) + 'T';
    if (absolute >= 1e9) return '$' + (value / 1e9).toFixed(absolute >= 1e10 ? 0 : 1) + 'B';
    if (absolute >= 1e6) return '$' + (value / 1e6).toFixed(absolute >= 1e8 ? 0 : 1) + 'M';
    if (absolute >= 1e3) return '$' + (value / 1e3).toFixed(absolute >= 1e5 ? 0 : 1) + 'K';
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }

  function ageDays(asOf, listedAt) {
    if (!validDate(asOf) || !validDate(listedAt)) return null;
    return Math.max(0, Math.floor((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / DAY));
  }

  function preToken(protocol) {
    return !protocol.gecko_id && !protocol.symbol && !(finite(protocol.mcap_usd) && protocol.mcap_usd > 0);
  }

  function excluded(protocol) {
    return HARMFUL.has(protocol.category) || VERSION_SUFFIX.test(protocol.name) ||
      PRODUCT_WORD.test(protocol.name) || EXCHANGE_PREFIX.test(protocol.name);
  }

  function classificationReason(protocol, watchlist) {
    if (watchlist.has(protocol.slug)) return 'Watchlist floor';
    if (!preToken(protocol)) return 'Token recorded';
    if (HARMFUL.has(protocol.category)) return 'Product category excluded by policy';
    if (VERSION_SUFFIX.test(protocol.name)) return 'Versioned product';
    if (PRODUCT_WORD.test(protocol.name)) return 'Wrapped or staked product';
    if (EXCHANGE_PREFIX.test(protocol.name)) return 'Exchange-branded product';
    return 'Below floor, eligible';
  }

  function scenarioSettings(settings) {
    const result = { ...DEFAULTS, ...settings };
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (!finite(result[key]) || result[key] < min || result[key] > max) {
        throw new Error(`Invalid scenario setting: ${key}`);
      }
    }
    return result;
  }

  // Weighted normal equations, with pivoting and an unpenalized intercept.
  function pooledSolve(features, targets, weights, ridge) {
    const count = features[0].length;
    const matrix = Array.from({ length: count }, (_, i) => Array.from({ length: count }, (_, j) =>
      features.reduce((total, row, k) => total + weights[k] * row[i] * row[j], 0) +
      (i === j && i > 0 ? ridge : 0)));
    const result = Array.from({ length: count }, (_, i) =>
      features.reduce((total, row, k) => total + weights[k] * row[i] * targets[k], 0));
    for (let i = 0; i < count; i++) {
      let pivot = i;
      for (let j = i + 1; j < count; j++) {
        if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j;
      }
      if (Math.abs(matrix[pivot][i]) < 1e-12) continue;
      [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
      [result[i], result[pivot]] = [result[pivot], result[i]];
      const divisor = matrix[i][i];
      for (let k = i; k < count; k++) matrix[i][k] /= divisor;
      result[i] /= divisor;
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const factor = matrix[j][i];
        for (let k = i; k < count; k++) matrix[j][k] -= factor * matrix[i][k];
        result[j] -= factor * result[i];
      }
    }
    return result;
  }

  function fitRegression(rows) {
    const valid = rows.filter(row => finite(row.tvl_usd) && row.tvl_usd > 0 && finite(row.mcap_usd) && row.mcap_usd > 0);
    if (valid.length < 8) throw new Error('Model requires at least eight positive TVL/market-cap comparables.');
    const features = valid.map(row => [1, Math.log(row.tvl_usd / 1e8)]);
    const targets = valid.map(row => Math.log(row.mcap_usd));
    let weights = Array(valid.length).fill(1);
    let coefficients = [0, 0];
    for (let iteration = 0; iteration < 40; iteration++) {
      coefficients = pooledSolve(features, targets, weights, 0.01);
      const errors = targets.map((value, i) => value - features[i].reduce((total, feature, j) => total + feature * coefficients[j], 0));
      const center = median(errors);
      const scale = Math.max(0.2, 1.4826 * median(errors.map(value => Math.abs(value - center))));
      const next = errors.map(value => Math.min(1, 1.345 * scale / Math.max(Math.abs(value), 1e-9)));
      const converged = Math.max(...next.map((value, i) => Math.abs(value - weights[i]))) < 1e-6;
      weights = next;
      if (converged) break;
    }
    return {
      n: valid.length,
      intercept: coefficients[0],
      elasticity: clamp(coefficients[1], 0.15, 1.25),
      residuals: valid.map(row => Math.log(row.mcap_usd) - coefficients[0] - coefficients[1] * Math.log(row.tvl_usd / 1e8)),
    };
  }

  function averageRanks(values) {
    const ordered = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
    const ranks = Array(values.length);
    for (let i = 0; i < ordered.length;) {
      let end = i + 1;
      while (end < ordered.length && ordered[end][0] === ordered[i][0]) end++;
      for (let k = i; k < end; k++) ranks[ordered[k][1]] = (i + end + 1) / 2;
      i = end;
    }
    return ranks;
  }

  function metrics(records, predictor) {
    const valid = records.filter(row => finite(row.mcap_usd) && row.mcap_usd > 0 && row.tvl_usd > 0);
    const errors = valid.map(row => Math.log(Math.max(1, predictor(row)) / row.mcap_usd));
    if (!errors.length) return { n: 0, median_multiple: 0, mean_abs_log: 0, within_3x_pct: 0, rank_r: 0 };
    const absolute = errors.map(Math.abs);
    const predictedRanks = averageRanks(valid.map(row => Math.log(Math.max(1, predictor(row)))));
    const observedRanks = averageRanks(valid.map(row => Math.log(row.mcap_usd)));
    const meanPredicted = sum(predictedRanks) / predictedRanks.length;
    const meanObserved = sum(observedRanks) / observedRanks.length;
    const denominator = Math.sqrt(
      sum(predictedRanks.map(value => (value - meanPredicted) ** 2)) *
      sum(observedRanks.map(value => (value - meanObserved) ** 2)));
    const correlation = denominator ? predictedRanks.reduce((total, value, i) =>
      total + (value - meanPredicted) * (observedRanks[i] - meanObserved), 0) / denominator : 0;
    return {
      n: errors.length,
      median_multiple: round(Math.exp(median(absolute)), 2),
      mean_abs_log: round(sum(absolute) / absolute.length, 3),
      within_3x_pct: Math.round(100 * absolute.filter(value => value <= Math.log(3)).length / absolute.length),
      rank_r: round(correlation, 2),
    };
  }

  function adjustments(protocol, asOf) {
    const age = ageDays(asOf, protocol.listed_at);
    return {
      growth: 1 + 0.15 * clamp(finite(protocol.change_7d) ? protocol.change_7d : 0, -50, 100) / 100,
      seasoning: 0.85 + 0.15 * Math.min(age ?? 365, 730) / 730,
    };
  }

  function predict(model, tvl) {
    return clamp(Math.round(Math.exp(model.intercept + model.elasticity * Math.log(Math.max(1, tvl) / 1e8))), 1, 1e14);
  }

  function valuation(model, protocol, asOf) {
    const factors = adjustments(protocol, asOf);
    return clamp(Math.round(predict(model, protocol.tvl_usd) * factors.growth * factors.seasoning), 1, 1e14);
  }

  function outOfFold(records, asOf) {
    const folds = Array.from({ length: 5 }, () => []);
    for (const row of records) {
      const identity = String(row.gecko_id || row.symbol || row.slug);
      let hash = 2166136261;
      for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
      folds[(hash >>> 0) % folds.length].push(row);
    }
    const predictions = [];
    for (let i = 0; i < folds.length; i++) {
      const training = records.filter(row => !folds[i].includes(row));
      if (!folds[i].length || training.length < 8) continue;
      const model = fitRegression(training);
      for (const row of folds[i]) predictions.push({ p: row, value: valuation(model, row, asOf) });
    }
    return predictions;
  }

  function comparableModel(protocols, asOf) {
    const identities = new Map();
    for (const row of protocols) {
      if (!finite(row.mcap_usd) || row.mcap_usd <= 0 || !finite(row.tvl_usd) || row.tvl_usd <= 0 || row.category === 'CEX') continue;
      const identity = String(row.gecko_id || row.symbol || row.slug).toLowerCase();
      if (!identities.has(identity) || identities.get(identity).tvl_usd < row.tvl_usd) identities.set(identity, row);
    }
    const training = [...identities.values()];
    const fit = fitRegression(training);
    const folds = outOfFold(training, asOf);
    const cv = metrics(folds.map(item => ({ ...item.p, _pred: item.value })), row => row._pred);
    const residuals = folds.map(item => Math.log(item.p.mcap_usd / item.value));
    const since = '2026-01-01';
    const cohort = training.filter(row => typeof row.listed_at === 'string' && row.listed_at >= since);
    const prior = training.filter(row => !cohort.includes(row));
    const dateFit = prior.length >= 8 ? fitRegression(prior) : fit;
    const starter = row => row.tvl_usd * 0.25 * (1 + clamp(row.change_7d || 0, -60, 120) / 200) *
      (0.6 + Math.min(ageDays(asOf, row.listed_at) ?? 365, 1095) / 1095 * 0.4);
    return {
      n: fit.n, intercept: fit.intercept, elasticity: fit.elasticity,
      log_base: Math.exp(fit.intercept), q10: quantile(residuals, 0.10), q90: quantile(residuals, 0.90),
      cv,
      starter_cv: metrics(folds.map(item => ({ ...item.p, _pred: starter(item.p) })), row => row._pred),
      recent: { since, n: cohort.length, metrics: metrics(cohort.map(row => ({ ...row, _pred: valuation(dateFit, row, asOf) })), row => row._pred) },
      residuals,
      formula: `exp(${round(fit.intercept, 4)} + ${round(fit.elasticity, 4)} × ln(TVL / $100M)) × growth × seasoning`,
    };
  }

  function familyFor(category) {
    if (['Yield Aggregator', 'Farm', 'Liquidity Manager', 'CDP Manager', 'Indexes'].includes(category)) return 'Yield';
    if (['Uncollateralized Lending', 'Collateral Markets'].includes(category)) return 'Lending';
    if (category === 'Dual-Token Stablecoin') return 'CDP';
    if (category === 'CeDeFi') return 'RWA';
    if (['Restaking', 'Staking Pool', 'Anchor BTC', 'Decentralized BTC', 'Stablecoin Wrapper'].includes(category)) return 'Liquid Staking';
    if (['Basis Trading', 'Leveraged Farming', 'Interest Rate Derivatives'].includes(category)) return 'Derivatives';
    return FAMILIES.includes(String(category || 'Other')) ? String(category) : 'Other';
  }

  function interactionFor(family) {
    if (family === 'Lending') return ['Supply an asset without borrowing; check withdrawal liquidity', 'Withdraw supplied assets'];
    if (family === 'CDP') return ['Deposit supported collateral without minting debt', 'Redeem collateral with no debt outstanding'];
    if (family === 'Dexs') return ['Add balanced owned assets to a liquid pool; check fees, range and LP receipt', 'Remove liquidity into both assets'];
    if (['Yield', 'Risk Curators', 'Onchain Capital Allocator'].includes(family)) return ['Deposit in an unlevered vault; check assets, manager controls and share price', 'Redeem vault shares via its withdrawal queue'];
    if (family === 'RWA') return ['Complete eligibility checks; verify dealing dates before subscribing', 'Request redemption before the cutoff'];
    if (family === 'Derivatives') return ['Use eligible collateral-only deposits; stop if trading exposure is required', 'Withdraw collateral with no open position'];
    if (family === 'Liquid Staking') return ['Deposit base assets for receipts only if unbonding fits the horizon', 'Redeem receipts and complete unbonding'];
    if (family.includes('Bridge')) return ['Check destination gas and return liquidity before bridging', 'Bridge assets back via the verified route'];
    return ['Find a documented reversible deposit route; stop if none exists', 'Use the documented redemption route'];
  }

  function plan(protocol, implied, band, age, settings) {
    const scenario = scenarioSettings(settings);
    const { deposit, days, gas } = scenario;
    const tvl = Math.max(0, protocol.tvl_usd);
    const family = familyFor(protocol.category);
    const allocation = scenario.allocation / 100;
    const eligibility = scenario.eligibility / 100;
    const share = Math.min(1, deposit / Math.max(tvl, 1));
    const gross = implied * allocation * share * eligibility;
    const low = band[0] * allocation * share * eligibility;
    const pilot = Math.min(deposit, 100);
    const remaining = deposit - pilot;
    const approvals = family === 'Dexs' ? 2 : 1;
    const transactions = approvals * 2 + 2 + Number(remaining > 0);
    const reviews = Math.max(0, Math.ceil(days / 7) - 1);
    const slippage = deposit * 0.001;
    const gasCost = gas * transactions;
    const capitalCost = deposit * (scenario.opportunity / 100) * days / 365;
    const cost = gasCost + slippage + capitalCost;
    const net = gross - cost;
    const netLow = low - cost;
    const threshold = implied * allocation * share;
    const breakeven = threshold > 0 ? (cost / threshold) * 100 : null;
    let verdict = 'Observe';
    if (tvl <= 0 || (protocol.change_7d ?? 0) <= -15 || net < 0) verdict = 'Skip';
    else if (netLow >= 0 && breakeven <= 33 && age !== null && age >= 90) verdict = 'Pilot';
    const chain = Array.isArray(protocol.chains) && protocol.chains.length ? protocol.chains[0] : 'the listed chain';
    const [enter, exit] = interactionFor(family);
    const stage = (title, action, transactions, minutes, cost) => ({ title, action, transactions, minutes, cost });
    const stages = [
      stage('Verify route', `Verify ${protocol.name}'s official app, ${chain} contracts and withdrawal preview; stop if route or lock period is unverified.`, 0, 10, 0),
      stage('Eligibility', 'Check wallet/geography eligibility and official reward rules. The snapshot confirms no rewards.', 0, 5, 0),
      stage('Pilot', `${enter} on ${chain} with $${pilot}. Cap combined approvals at $${deposit}; confirm receipt and withdrawal preview.`, approvals + 1, 15, gas * (approvals + 1) + pilot * 0.001),
      stage('Allocate', remaining > 0 ? `After pilot receipt and withdrawal checks, add $${remaining} to reach $${deposit}. Save hash, shares and entry TVL $${tvl}; avoid loops and borrowing.` : `The $${pilot} pilot is fully allocated; add nothing and save its hash.`, Number(remaining > 0), remaining > 0 ? 10 : 0, Number(remaining > 0) * gas + remaining * 0.001),
      stage('Monitor', `Check withdrawal access, TVL, permissions and rules ${reviews} times at 7-day intervals before day ${days}. Exit earlier if access or net worsens. Cost is capital allowance.`, 0, reviews * 5, capitalCost),
      stage('Exit', `${exit} by day ${days}; revoke allowances, verify returned principal and save withdrawal hash.`, approvals + 1, 10, gas * (approvals + 1)),
    ];
    stages.forEach((item, index) => {
      item.capital_usd = [0, 0, pilot, remaining, deposit, deposit][index];
      item.gas_usd = item.transactions * gas;
      item.execution_usd = index === 2 ? pilot * 0.001 : index === 3 ? remaining * 0.001 : 0;
      item.hold_days = index === 4 ? days : 0;
      item.opportunity_usd = index === 4 ? capitalCost : 0;
      const capital = ['None', 'None', 'Deposit', 'Add', 'Hold', 'Return target'][index];
      item.budget = `Capital: ${capital} $${item.capital_usd.toFixed(2)}. Gas estimate: $${item.gas_usd.toFixed(2)} (${item.transactions} tx). Execution: $${item.execution_usd.toFixed(2)}. Hold: ${item.hold_days} days. Opportunity cost: $${item.opportunity_usd.toFixed(2)}${index === 4 ? ` ($${deposit} × ${scenario.opportunity}% APR × ${days}/365)` : ''}.`;
    });
    return {
      gross, low, cost, net, netLow, breakeven, verdict, family, slippage,
      pilot, remaining, reviews, transactions, gasCost, capitalCost, stages,
      hours: sum(stages.map(item => item.minutes)) / 60,
      steps: stages.map(item => `${item.title}: ${item.action} ${item.budget} Cost: $${item.cost.toFixed(2)}. Time: ${item.minutes} minutes.`),
      assumptions: `Category recipe, not verified eligibility. Assumed ${scenario.eligibility}% eligible share, ${scenario.allocation}% TVL-pro-rata allocation; ${transactions} gas tx at $${gas}, 0.1% execution, ${scenario.opportunity}% capital APR. Principal loss and labor excluded.`,
    };
  }

  // Signals describe snapshot evidence, never a probability of launching or safety.
  function launchSignals(protocol = {}, asOf) {
    const change = finite(protocol.change_7d) ? protocol.change_7d : null;
    const trackingDays = ageDays(asOf, protocol.listed_at);
    const flags = [];
    if (!finite(protocol.tvl_usd) || protocol.tvl_usd <= 0) flags.push('No positive TVL recorded');
    if (change === null) flags.push('Seven-day change unavailable');
    else if (change <= -15) flags.push('Seven-day TVL drawdown of at least 15%');
    if (trackingDays === null) flags.push('Tracking date unavailable');
    else if (trackingDays < 90) flags.push('Less than 90 days of tracking');
    if (excluded(protocol)) flags.push('Product or category exclusion');
    const elevated = !finite(protocol.tvl_usd) || protocol.tvl_usd <= 0 || (change !== null && change <= -15) || excluded(protocol);
    const momentum = change === null ? 'Unknown' : change >= 5 ? 'Growing' : change <= -5 ? 'Fading' : 'Steady';
    return {
      momentum: { label: momentum, tone: momentum === 'Growing' ? 'positive' : momentum === 'Fading' ? 'negative' : 'neutral', change_7d: change },
      risk: { label: elevated ? 'Elevated' : flags.length ? 'Caution' : 'Unassessed', tone: elevated ? 'negative' : flags.length ? 'warning' : 'neutral', flags },
      tracking_days: trackingDays,
      token_status: preToken(protocol) ? 'Token not recorded' : 'Token recorded',
      launch_probability: null,
      note: 'TVL momentum and tracking context only; launch intent, contract safety and rewards are unobserved.',
    };
  }

  function filterRows(rows, filters = {}) {
    const search = String(filters.search ?? '').trim().toLowerCase();
    return rows.filter(row => {
      const category = row.category || 'Uncategorized';
      const chains = Array.isArray(row.chains) ? row.chains : [];
      const status = row.status || (finite(row.implied_value_usd) ? 'Ranked' : preToken(row) ? 'Set aside' : 'Traded');
      if (filters.status && status !== filters.status) return false;
      if (search && ![row.name, row.slug, category, ...chains].join(' ').toLowerCase().includes(search)) return false;
      if (filters.category && filters.category !== category) return false;
      if (filters.chain && !chains.includes(filters.chain)) return false;
      if (filters.quick === 'watch' && !row.watchlist) return false;
      if (filters.quick === 'worth' && !(row.farm && row.farm.net > 0)) return false;
      if (filters.quick === 'pilot' && row.farm?.verdict !== 'Pilot') return false;
      if (filters.risk || filters.momentum) {
        const signals = launchSignals(row, filters.asOf);
        if (filters.risk && filters.risk !== signals.risk.label) return false;
        if (filters.momentum && filters.momentum !== signals.momentum.label) return false;
      }
      return true;
    });
  }

  function sortRows(rows, options = {}) {
    let key = SORT_KEYS.has(options.key) ? options.key : 'rank';
    if (key === 'implied_value_usd' && options.status === 'Traded') key = 'mcap_usd';
    const direction = options.direction === -1 ? -1 : 1;
    const valueFor = row => {
      if (key === 'name' || key === 'slug') return String(row[key] ?? '');
      const value = key === 'net' ? row.farm?.net : row[key];
      return finite(value) ? value : 0;
    };
    return rows.slice().sort((a, b) => {
      const left = valueFor(a);
      const right = valueFor(b);
      const difference = typeof left === 'string' ? left.localeCompare(right, 'en') : left - right;
      return direction * difference || String(a.slug ?? '').localeCompare(String(b.slug ?? ''), 'en');
    });
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) throw new Error('Snapshot requires protocols[] and watchlist[].');
    if (!validDate(snapshot.as_of)) throw new Error('Snapshot requires a valid as_of date.');
    if (snapshot.watchlist.some(slug => typeof slug !== 'string' || !slug || /\s/.test(slug)) || new Set(snapshot.watchlist).size !== snapshot.watchlist.length) throw new Error('Malformed or duplicate watchlist slug.');
    const unique = new Set();
    for (const row of snapshot.protocols) {
      if (!row || typeof row !== 'object') throw new Error('Malformed protocol row.');
      if (typeof row.slug !== 'string' || !row.slug || /\s/.test(row.slug) || row.slug.length > 128 || unique.has(row.slug)) throw new Error('Snapshot has a missing or duplicate protocol slug.');
      unique.add(row.slug);
      if (typeof row.name !== 'string' || !row.name.trim() || !finite(row.tvl_usd) || row.tvl_usd < 0) throw new Error(`Malformed protocol row: ${row.slug}`);
      if (!Array.isArray(row.chains) || row.chains.some(chain => typeof chain !== 'string' || !chain.trim()) ||
          ['category', 'gecko_id', 'symbol'].some(key => row[key] != null && typeof row[key] !== 'string') ||
          ['change_7d', 'mcap_usd'].some(key => row[key] != null && !finite(row[key])) ||
          (row.listed_at != null && !validDate(row.listed_at))) throw new Error(`Malformed protocol context: ${row.slug}`);
    }
    for (const slug of snapshot.watchlist) {
      if (!unique.has(slug)) throw new Error(`Watchlist protocol missing from snapshot: ${slug}`);
    }
  }

  function derive(snapshot, settings) {
    validateSnapshot(snapshot);
    const scenario = scenarioSettings(settings);
    const watchlist = new Set(snapshot.watchlist);
    const model = comparableModel(snapshot.protocols, snapshot.as_of);
    const candidates = snapshot.protocols.filter(row => preToken(row) && (watchlist.has(row.slug) || !excluded(row)));
    const rows = candidates.map(protocol => {
      const value = valuation(model, protocol, snapshot.as_of);
      const band = [model.q10, model.q90].map(quantileValue => clamp(Math.round(value * Math.exp(quantileValue)), 1, 1e14));
      const age = ageDays(snapshot.as_of, protocol.listed_at);
      return {
        ...protocol, age_days: age, implied_value_usd: value, band_low_usd: band[0], band_high_usd: band[1],
        value_per_tvl: protocol.tvl_usd > 0 ? value / protocol.tvl_usd : 0,
        watchlist: watchlist.has(protocol.slug), model: VERSION, factors: adjustments(protocol, snapshot.as_of),
        classification_reason: classificationReason(protocol, watchlist), farm: plan(protocol, value, band, age, scenario),
      };
    }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug, 'en'));
    rows.forEach((row, index) => { row.rank = index + 1; });
    const rankBySlug = new Map(rows.map(row => [row.slug, row.rank]));
    if (snapshot.watchlist.some(slug => !rankBySlug.has(slug))) throw new Error('Internal classification failed full watchlist coverage.');
    const tokenRecorded = snapshot.protocols.filter(row => !preToken(row));
    const traded = tokenRecorded.filter(row => finite(row.mcap_usd) && row.mcap_usd > 0)
      .map(row => ({ ...row, predicted_mcap_usd: predict(model, row.tvl_usd) }))
      .sort((a, b) => b.mcap_usd - a.mcap_usd);
    const universe = snapshot.protocols.map(row => ({
      ...row,
      status: !preToken(row) ? 'Traded' : rankBySlug.has(row.slug) ? 'Ranked' : 'Set aside',
      reason: classificationReason(row, watchlist), rank: rankBySlug.get(row.slug) ?? null,
    }));
    return {
      version: VERSION, as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
      settings: scenario, model, rows, traded, universe, watchlist_size: watchlist.size,
      trained_size: model.n, traded_size: tokenRecorded.length,
      excluded_size: snapshot.protocols.length - rows.length - tokenRecorded.length,
    };
  }

  return {
    VERSION, DEFAULTS, LIMITS, FAMILIES, fmt, median, quantile, ageDays, preToken, excluded,
    fitRegression, metrics, comparableModel, adjustments, valuation, predict, plan, derive,
    launchSignals, filterRows, sortRows,
  };
});
