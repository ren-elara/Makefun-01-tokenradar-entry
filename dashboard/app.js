/* The page renders the same engine output as board.json. All data remains local. */
(() => {
  'use strict';
  const D = window.ORBIT_DATA, O = window.ORBIT, $ = (s) => document.querySelector(s);
  if (!D || !O) { document.body.textContent = 'Run main.ts first, then open output/dashboard/index.html.'; return; }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const money = (n) => n === null || !Number.isFinite(n) ? 'n/a' : (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const delta = (n) => n === null || !Number.isFinite(n) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  const age = (n) => n === null ? 'unknown' : n < 365 ? n + 'd' : (n / 365).toFixed(1) + 'y';
  const params = new URLSearchParams(location.search);
  const state = { view: params.get('view') || 'board', status: 'Ranked', quick: params.get('quick') || '', category: params.get('category') || '', chain: '', search: '', sort: 'rank', direction: 1, selected: params.get('protocol') || '', settings: { ...D.settings } };
  const model = D.model;
  const rowsBySlug = new Map(D.rows.map((p) => [p.slug, p]));
  let currentRows = [], fullDetail = !!params.get('protocol');
  const farmFor = (p) => O.plan(p, p.implied_value_usd, [p.band_low_usd, p.band_high_usd], p.age_days, state.settings);

  const tools = document.createElement('div'); tools.className = 'board-tools';
  tools.innerHTML = '<button id="csv-export">↓ Export current view CSV</button><button id="reset-filters">Reset filters</button><span id="match-indicator"></span>';
  $('#board-view').before(tools);
  const notice = document.createElement('div'); notice.className = 'scenario-notice'; notice.id = 'scenario-notice';
  tools.before(notice);
  const renderCounts = () => {
    put('asof-date', D.as_of); put('watch-count', D.watchlist_size + '/' + D.watchlist_size);
    put('rank-count', D.rows.length); put('rank-sub', D.rows.filter((p) => !p.watchlist && p.tvl_usd < D.floor_usd).length + ' below $50M · official floor is not ceiling');
    put('trade-count', model.n); put('trade-sub', 'Unique positive-cap tokens · CEX excluded');
    put('excluded-count', D.universe.filter((p) => p.status === 'Set aside').length);
    put('elasticity', model.elasticity.toFixed(2)); put('formula', model.formula);
    put('fit-sample', model.n + ' unique positive-cap anchors · CEX excluded');
    put('cv-error', model.cv.median_multiple.toFixed(2) + '×'); put('cv-within', model.cv.within_3x_pct + '%'); put('cv-rank', model.cv.rank_r.toFixed(2));
    put('baseline-error', model.starter_cv.median_multiple.toFixed(2) + '×');
    put('recent-note', model.recent.n + ' newer tracked tokens: ' + model.recent.metrics.median_multiple + '× error. Small cohort, not a future backtest.');
    put('pre-tab-count', D.rows.length); put('traded-tab-count', D.universe.filter((p) => p.status === 'Traded').length); put('aside-tab-count', D.universe.filter((p) => p.status === 'Set aside').length); put('watch-filter-count', D.watchlist_size);
    put('fit-alpha', model.intercept.toFixed(4)); put('fit-beta', model.elasticity.toFixed(4)); put('fit-n', model.n); put('fit-band', Math.exp(model.q10).toFixed(2) + '× / ' + Math.exp(model.q90).toFixed(2) + '×');
    put('lab-error', model.cv.median_multiple + '×'); put('lab-within', model.cv.within_3x_pct + '%'); put('lab-rank', model.cv.rank_r.toFixed(2));
    put('orbit-bar-label', model.cv.median_multiple + '×'); put('starter-bar-label', model.starter_cv.median_multiple + '×');
    $('#orbit-bar').style.width = (100 * model.cv.median_multiple / Math.max(model.cv.median_multiple, model.starter_cv.median_multiple)) + '%'; $('#starter-bar').style.width = '100%';
    put('cohort-title', 'Tracked since ' + model.recent.since); put('cohort-n', model.recent.n); put('cohort-error', model.recent.metrics.median_multiple + '×'); put('cohort-within', model.recent.metrics.within_3x_pct + '%'); put('cohort-rank', model.recent.metrics.rank_r.toFixed(2));
  };
  function drawChart() {
    const canvas = $('#model-chart'), ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, left = 64, right = W - 16, top = 12, bottom = H - 30;
    const peers = D.universe.filter((p) => p.category !== 'CEX' && p.mcap_usd > 0 && p.tvl_usd > 0);
    const minX = 6.5, maxX = 10.4, minY = 4, maxY = 11;
    const px = (v) => left + (Math.log10(Math.max(1, v)) - minX) / (maxX - minX) * (right - left);
    const py = (v) => bottom - (Math.log10(Math.max(1, v)) - minY) / (maxY - minY) * (bottom - top);
    ctx.clearRect(0, 0, W, H); ctx.font = '14px sans-serif'; ctx.fillStyle = '#8c998b'; ctx.strokeStyle = '#e0e4d7';
    for (const x of [1e7, 1e8, 1e9, 1e10]) { const at = px(x); ctx.beginPath(); ctx.moveTo(at, top); ctx.lineTo(at, bottom); ctx.stroke(); ctx.fillText(O.fmt(x), at - 15, H - 6); }
    for (const y of [1e4, 1e6, 1e8, 1e10]) { const at = py(y); ctx.beginPath(); ctx.moveTo(left, at); ctx.lineTo(right, at); ctx.stroke(); ctx.fillText(O.fmt(y), 0, at + 4); }
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    ctx.fillStyle = '#dfe9d8'; ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const tvl = 10 ** (minX + (maxX - minX) * i / 60); const x = px(tvl), y = py(O.predict(model, tvl) * Math.exp(model.q90)); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let i = 60; i >= 0; i--) { const tvl = 10 ** (minX + (maxX - minX) * i / 60); ctx.lineTo(px(tvl), py(O.predict(model, tvl) * Math.exp(model.q10))); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#89968a'; ctx.globalAlpha = .55;
    for (const p of peers) { ctx.beginPath(); ctx.arc(px(p.tvl_usd), py(p.mcap_usd), 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = '#276845'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const tvl = 10 ** (minX + (maxX - minX) * i / 60); if (!i) ctx.moveTo(px(tvl), py(O.predict(model, tvl))); else ctx.lineTo(px(tvl), py(O.predict(model, tvl))); } ctx.stroke(); ctx.restore();
  }
  function matches(p) {
    return (!state.search || (p.name + ' ' + p.slug + ' ' + (p.category || '') + ' ' + (p.chains || []).join(' ')).toLowerCase().includes(state.search)) &&
      (!state.category || (p.category || 'Uncategorized') === state.category) && (!state.chain || (p.chains || []).includes(state.chain));
  }
  function renderBoard() {
    const source = state.status === 'Ranked' ? D.rows : D.universe.filter((p) => p.status === state.status);
    let rows = source.filter(matches).map((p) => ({ ...p, farm: state.status === 'Ranked' ? farmFor(p) : null }));
    if (state.quick === 'watch') rows = rows.filter((p) => p.watchlist);
    if (state.quick === 'worth') rows = rows.filter((p) => p.farm && p.farm.net > 0);
    if (state.quick === 'pilot') rows = rows.filter((p) => p.farm && p.farm.verdict === 'Pilot');
    const key = state.sort === 'implied_value_usd' && state.status === 'Traded' ? 'mcap_usd' : state.sort;
    const sortValue = (p) => key === 'net' ? p.farm?.net ?? 0 : p[key] ?? 0;
    rows.sort((a, b) => { const av = sortValue(a), bv = sortValue(b); return state.direction * (typeof av === 'string' ? av.localeCompare(bv, 'en') : av - bv) || a.slug.localeCompare(b.slug, 'en'); });
    put('value-label', state.status === 'Traded' ? 'Recorded cap' : 'Implied value');
    currentRows = rows;
    $('#protocol-rows').innerHTML = rows.map((p) => {
      const isRanked = !!p.farm, a = isRanked ? p.age_days : O.ageDays(D.as_of, p.listed_at);
      return `<tr tabindex="0" data-slug="${esc(p.slug)}" class="${p.slug === state.selected ? 'selected' : ''}" aria-label="Open ${esc(p.name)}"><td class="neutral">${isRanked ? p.rank : '·'}</td><td><div class="protocol-name">${esc(p.name)}${isRanked ? `<span class="tiny-tag ${p.watchlist ? '' : 'early'}">${p.watchlist ? 'WATCH' : p.tvl_usd < D.floor_usd ? 'EARLY' : 'OFF FLOOR'}</span>` : ''}</div><div class="protocol-sub">${esc(p.category || 'Uncategorized')} · ${esc((p.chains || []).slice(0, 2).join(', '))}${(p.chains || []).length > 2 ? ' +' + (p.chains.length - 2) : ''}</div></td><td class="value">${isRanked ? O.fmt(p.implied_value_usd) : p.mcap_usd > 0 ? O.fmt(p.mcap_usd) : 'not recorded'}</td><td class="band">${isRanked ? O.fmt(p.band_low_usd) + ' – ' + O.fmt(p.band_high_usd) : '—'}</td><td>${O.fmt(p.tvl_usd)}</td><td class="${p.change_7d >= 0 ? 'positive' : 'negative'}">${delta(p.change_7d)}</td><td class="neutral">${age(a)}</td><td class="${isRanked && p.farm.net >= 0 ? 'positive' : 'negative'}">${isRanked ? money(p.farm.net) : '—'}</td><td>${isRanked ? `<span class="pill ${p.farm.verdict}">${p.farm.verdict}</span>` : `<span class="neutral">${esc(p.status)}</span>`}</td></tr>`;
    }).join('');
    $('#empty-state').hidden = rows.length > 0;
    put('result-count', rows.length + ' of ' + source.length + ' shown');
    put('worth-count', D.rows.filter((p) => farmFor(p).net > 0).length);
    put('match-indicator', 'board.json ↔ page · ' + D.rows.length + ' ranks & values from the same engine');
    const s = state.settings;
    put('scenario-notice', `FARM SCENARIO  ·  $${s.deposit.toLocaleString('en-US')} capital · ${s.days}d · ${s.allocation}% hypothetical allocation · ${s.eligibility}% assumed eligible share · $${s.gas}/tx · ${s.opportunity}% capital APR. Net is conditional on launch; principal loss and labor excluded.`);
    document.querySelectorAll('[data-status]').forEach((e) => e.classList.toggle('active', e.dataset.status === state.status));
    document.querySelectorAll('[data-quick]').forEach((e) => e.classList.toggle('active', e.dataset.quick === state.quick));
  }
  function detail(slug) {
    const p = rowsBySlug.get(slug), el = $('#detail-panel');
    $('#board-view').classList.toggle('detail-full', !!p && fullDetail);
    document.body.classList.toggle('focus-detail', !!p && fullDetail && state.view === 'board');
    if (!p) { const u = D.universe.find((r) => r.slug === slug); if (u) el.innerHTML = `<span class="eyebrow">UNIVERSE AUDIT</span><h2>${esc(u.name)}</h2><div class="detail-meta">${esc(u.category)} · ${esc(u.status)}</div><p>${esc(u.reason)}. This protocol is kept out of the pre-token ranking.</p><div class="fact-line"><span>TVL</span><b>${O.fmt(u.tvl_usd)}</b></div><div class="fact-line"><span>Token record</span><b>${esc(u.symbol || u.gecko_id || 'none')}</b></div>`; return; }
    const f = farmFor(p), factor = p.factors || O.adjustments(p, D.as_of);
    const peers = D.traded.filter((q) => q.category === p.category).sort((a, b) => Math.abs(Math.log(a.tvl_usd / Math.max(1, p.tvl_usd))) - Math.abs(Math.log(b.tvl_usd / Math.max(1, p.tvl_usd)))).slice(0, 3);
    const inputs = [['deposit', 'Capital $'], ['days', 'Horizon days'], ['allocation', 'Hyp. allocation %'], ['eligibility', 'Assumed share %'], ['gas', 'Gas per tx $'], ['opportunity', 'Capital APR %']].map(([k, label]) => [k, label, ...O.LIMITS[k]]);
    const fact = (key, value) => `<div class="fact-line"><span>${esc(key)}</span><b>${value}</b></div>`;
    el.innerHTML = `<div class="detail-top"><span class="eyebrow">PROTOCOL BRIEF · #${p.rank}</span><button id="expand-detail" class="text-button">${fullDetail ? 'Compact ↙' : 'Expand ↗'}</button></div><h2>${esc(p.name)}</h2><div class="detail-meta">${esc(p.category)} · ${esc((p.chains || []).join(', '))}</div><div class="detail-value">${O.fmt(p.implied_value_usd)}</div><div class="detail-band">P10 ${O.fmt(p.band_low_usd)} — P90 ${O.fmt(p.band_high_usd)} · conditional cap</div><div class="detail-block"><h3>How this value is built</h3>${fact('Base fitted cap', O.fmt(O.predict(model, p.tvl_usd)))}${fact('7-day growth adjustment', factor.growth.toFixed(3) + '×')}${fact('Tracking seasoning', factor.seasoning.toFixed(3) + '×')}${fact('TVL · 7D change', O.fmt(p.tvl_usd) + ' · ' + delta(p.change_7d))}${fact('Tracking start', esc(p.listed_at || 'unknown') + ' · ' + age(p.age_days))}<p class="fine-print">Growth = 1 + 0.15 × capped change / 100. Seasoning = 0.85 + 0.15 × min(days,730)/730; unknown uses 365d. Both are stated, modest heuristics; regression is fitted only to TVL. Neither estimates launch odds.</p></div><div class="detail-block"><h3>Farm economics <span class="pill ${f.verdict}">${f.verdict}</span></h3><div class="scenario-grid">${inputs.map(([k, label, min, max]) => `<label>${label}<input data-setting="${k}" type="number" required min="${min}" max="${max}" step="any" value="${state.settings[k]}"></label>`).join('')}</div>${fact('Gross, conditional on launch', money(f.gross))}${fact('Four gas tx + execution + capital', money(f.cost))}${fact('Net / P10 downside net', money(f.net) + ' / ' + money(f.netLow))}${fact('Break-even eligibility at launch', f.breakeven === null ? 'Unavailable' : f.breakeven > 100 ? '>100%' : f.breakeven.toFixed(1) + '%')}${fact('Time · net per hour', f.hours.toFixed(1) + 'h · ' + money(f.net / f.hours))}<p class="fine-print">${esc(f.assumptions)}</p></div><div class="detail-block"><h3>Concrete interaction plan</h3><ol class="detail-plan">${f.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></div><div class="detail-block"><h3>Nearest category comparables</h3>${peers.length ? peers.map((q) => fact(q.name, O.fmt(q.mcap_usd) + ' cap · ' + O.fmt(q.tvl_usd) + ' TVL')).join('') : '<p class="fine-print">No same-category traded anchors. The global curve is used; no category value premium is inferred.</p>'}<p class="fine-print">${esc(p.classification_reason)}. No token is recorded in the snapshot; this does not prove one does not exist. TVL is not audited capital and is not platform revenue.</p></div>`;
  }
  function renderUniverse() {
    $('#audit-summary').innerHTML = [['Ranked', D.rows.length], ['Token recorded', D.universe.filter((p) => p.status === 'Traded').length], ['Set aside', D.universe.filter((p) => p.status === 'Set aside').length], ['Total snapshot', D.universe.length]].map(([a, b]) => `<div><b>${b}</b><span>${a}</span></div>`).join('');
    $('#universe-rows').innerHTML = D.universe.map((p) => `<tr data-slug="${esc(p.slug)}"><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc((p.chains || []).slice(0, 2).join(', '))}</td><td>${O.fmt(p.tvl_usd)}</td><td>${esc(p.status)}</td><td>${esc(p.reason)}</td></tr>`).join('');
  }
  function view(name) {
    state.view = ['board', 'model', 'universe'].includes(name) ? name : 'board';
    document.body.classList.toggle('focus-detail', state.view === 'board' && fullDetail && rowsBySlug.has(state.selected));
    for (const id of ['board', 'model', 'universe']) $('#' + id + '-view').hidden = state.view !== id;
    $('#controls').hidden = tools.hidden = notice.hidden = state.view !== 'board';
    document.querySelectorAll('.nav-button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  }
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-view],[data-status],[data-quick],[data-sort],[data-slug],#expand-detail,#reset-filters,#csv-export');
    if (!target) return;
    if (target.dataset.view) view(target.dataset.view);
    else if (target.dataset.status) { state.status = target.dataset.status; state.quick = ''; state.sort = state.status === 'Traded' ? 'mcap_usd' : 'rank'; state.direction = state.status === 'Traded' ? -1 : 1; renderBoard(); }
    else if (target.dataset.quick) { if (state.status !== 'Ranked') { state.sort = 'rank'; state.direction = 1; } state.status = 'Ranked'; state.quick = state.quick === target.dataset.quick ? '' : target.dataset.quick; renderBoard(); }
    else if (target.dataset.sort) { state.direction = state.sort === target.dataset.sort ? -state.direction : target.dataset.sort === 'name' ? 1 : -1; state.sort = target.dataset.sort; renderBoard(); }
    else if (target.dataset.slug) { state.selected = target.dataset.slug; detail(state.selected); renderBoard(); }
    else if (target.id === 'expand-detail') { fullDetail = !fullDetail; detail(state.selected); }
    else if (target.id === 'reset-filters') { state.search = state.category = state.chain = state.quick = ''; $('#search').value = $('#category-filter').value = $('#chain-filter').value = ''; renderBoard(); }
    else if (target.id === 'csv-export') {
      const fields = ['rank', 'slug', 'name', 'status', 'mcap_usd', 'implied_value_usd', 'band_low_usd', 'band_high_usd', 'tvl_usd', 'change_7d', 'age_days', 'net_usd'];
      const cell = (v) => '"' + String(typeof v === 'string' && /^[=+\-@\t\r\n]/.test(v) ? "'" + v : v ?? '').replace(/"/g, '""') + '"';
      const csv = [fields.join(','), ...currentRows.map((p) => { const row = {...p, status: state.status, age_days: O.ageDays(D.as_of, p.listed_at), net_usd: p.farm?.net}; return fields.map((k) => cell(row[k])).join(','); })].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'orbit-' + D.as_of + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });
  document.addEventListener('keydown', (e) => { const row = e.target.closest('tr[data-slug]'); if (row && e.key === 'Enter') { state.selected = row.dataset.slug; detail(state.selected); renderBoard(); } });
  $('#search').addEventListener('input', (e) => { state.search = e.target.value.toLowerCase().trim(); renderBoard(); });
  for (const [id, key] of [['category-filter', 'category'], ['chain-filter', 'chain']]) {
    const items = [...new Set(D.universe.flatMap((p) => key === 'chain' ? p.chains || [] : [p.category || 'Uncategorized']))].sort();
    $(('#' + id)).insertAdjacentHTML('beforeend', items.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(''));
    $('#' + id).value = state[key]; $('#' + id).addEventListener('change', (e) => { state[key] = e.target.value; renderBoard(); });
  }
  $('#detail-panel').addEventListener('change', (e) => { const input = e.target.closest('[data-setting]'); if (!input) return; const value = input.valueAsNumber; if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) { input.reportValidity(); return; } state.settings[input.dataset.setting] = value; renderBoard(); detail(state.selected); });
  $('.brand').addEventListener('click', () => view('board'));
  renderCounts(); renderBoard(); renderUniverse(); drawChart(); view(state.view);
  if (state.selected) detail(state.selected); else { state.selected = D.rows[0].slug; detail(state.selected); }
  window.ORBIT_READY = true;
})();
