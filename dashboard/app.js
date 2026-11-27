/* Local UI state and rendering; every calculation comes from the shared engine. */
(() => {
  'use strict';

  const data = window.ORBIT_DATA;
  const engine = window.ORBIT;
  const byId = id => document.getElementById(id);
  const put = (id, value) => { const element = byId(id); if (element) element.textContent = value; };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const money = value => !Number.isFinite(value) ? 'n/a' : (value < 0 ? '−' : '') + '$' +
    Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const delta = value => !Number.isFinite(value) ? 'n/a' : (value > 0 ? '+' : '') + value.toFixed(1) + '%';
  const ageLabel = value => value === null ? 'unknown' : value < 365 ? value + 'd' : (value / 365).toFixed(1) + 'y';
  const choices = (value, allowed, fallback = '') => allowed.includes(value) ? value : fallback;
  const views = ['board', 'model', 'universe'];
  const statuses = ['Ranked', 'Traded', 'Set aside'];
  const sortKeys = ['rank', 'name', 'implied_value_usd', 'mcap_usd', 'tvl_usd', 'change_7d', 'net'];
  const media = window.matchMedia('(max-width: 850px)');

  function showError(message) {
    const element = byId('app-error');
    if (element) { element.textContent = message; element.hidden = false; }
    put('result-count', 'Dashboard unavailable');
  }

  if (!engine || !data || !Array.isArray(data.rows) || !Array.isArray(data.universe) || !data.model) {
    showError('Snapshot data is unavailable. Run main.ts, then open the generated output/dashboard/index.html.');
    return;
  }

  const rankedBySlug = new Map(data.rows.map(row => [row.slug, row]));
  const universeBySlug = new Map(data.universe.map(row => [row.slug, row]));
  const parameters = new URLSearchParams(window.location.search);
  const requestedSlug = parameters.get('protocol') || '';
  const validSlug = rankedBySlug.has(requestedSlug) || universeBySlug.has(requestedSlug);
  const initialStatus = choices(parameters.get('status'), statuses, 'Ranked');
  const baseSettings = { ...engine.DEFAULTS, ...data.settings };
  const initialSettings = { ...baseSettings };
  for (const [key, [min, max]] of Object.entries(engine.LIMITS)) {
    const raw = parameters.get(key), value = Number(raw);
    if (raw !== null && raw.trim() && Number.isFinite(value) && value >= min && value <= max) initialSettings[key] = value;
  }
  const state = {
    view: choices(parameters.get('view'), views, 'board'),
    status: initialStatus,
    quick: choices(parameters.get('quick'), ['watch', 'worth', 'pilot']),
    category: parameters.get('category') || '',
    chain: parameters.get('chain') || '',
    momentum: choices(parameters.get('momentum'), ['Growing', 'Steady', 'Fading', 'Unknown']),
    risk: choices(parameters.get('risk'), ['Elevated', 'Caution', 'Unassessed']),
    search: parameters.get('search') || '',
    sort: choices(parameters.get('sort'), sortKeys, initialStatus === 'Traded' ? 'mcap_usd' : 'rank'),
    direction: parameters.has('direction') ? (parameters.get('direction') === '-1' ? -1 : 1) : initialStatus === 'Traded' ? -1 : 1,
    selected: validSlug ? requestedSlug : data.rows[0]?.slug || '',
    inspected: validSlug,
    expanded: validSlug && parameters.get('detail') !== 'compact',
    drawerOpen: validSlug,
    settings: initialSettings,
  };
  if (state.quick) state.status = 'Ranked';
  let currentRows = [];
  let previousFocus = null;

  function farmFor(row) {
    return engine.plan(row, row.implied_value_usd, [row.band_low_usd, row.band_high_usd], row.age_days, state.settings);
  }

  function writeLocation() {
    const query = new URLSearchParams();
    for (const key of ['view', 'quick', 'category', 'chain', 'momentum', 'risk', 'search']) {
      if (state[key] && !(key === 'view' && state[key] === 'board')) query.set(key, state[key]);
    }
    if (state.status !== 'Ranked') query.set('status', state.status);
    for (const key of Object.keys(engine.LIMITS)) {
      if (state.settings[key] !== baseSettings[key]) query.set(key, state.settings[key]);
    }
    if (state.sort !== 'rank' || state.direction !== 1) {
      query.set('sort', state.sort);
      query.set('direction', state.direction);
    }
    if (state.inspected && state.selected) {
      query.set('protocol', state.selected);
      if (!state.expanded) query.set('detail', 'compact');
    }
    const url = new URL(window.location.href);
    url.search = query.toString();
    // Some file:// hosts disallow replaceState; local interaction still works.
    try { window.history.replaceState(null, '', url.href); } catch { /* Host restriction. */ }
  }

  function syncLayout() {
    const hasRankedDetail = rankedBySlug.has(state.selected);
    const focused = state.view === 'board' && state.expanded && hasRankedDetail;
    const modal = state.view === 'board' && state.drawerOpen && media.matches && !!state.selected;
    document.body.classList.toggle('focus-detail', focused);
    document.body.classList.toggle('drawer-open', modal);
    byId('board-view').classList.toggle('detail-full', focused);
    byId('drawer-backdrop').hidden = !modal;
    const panel = byId('detail-panel');
    if (modal) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }
    for (const id of ['main-content', '']) {
      const container = id ? byId(id) : document.querySelector('.topbar');
      // The drawer is inside main, so only its sibling sections become inert.
      if (id) {
        [...container.children].forEach(child => {
          if (child.id !== 'board-view') child.inert = modal;
        });
      } else container.inert = modal;
    }
    byId('protocol-table').closest('.table-wrap').inert = modal;
    document.querySelector('.skip-link').inert = modal;
    document.querySelector('footer').inert = modal;
  }

  function renderCounts() {
    const model = data.model;
    const countStatus = status => data.universe.filter(row => row.status === status).length;
    put('asof-date', data.as_of);
    put('watch-count', data.rows.filter(row => row.watchlist).length + '/' + data.watchlist_size);
    put('rank-count', data.rows.length);
    put('rank-sub', data.rows.filter(row => !row.watchlist && row.tvl_usd < data.floor_usd).length + ' below ' + engine.fmt(data.floor_usd) + ' · floor is not ceiling');
    put('trade-count', model.n);
    put('trade-sub', 'Unique positive-cap tokens · CEX excluded');
    put('excluded-count', countStatus('Set aside'));
    put('elasticity', model.elasticity.toFixed(2));
    put('formula', model.formula);
    put('fit-sample', model.n + ' unique positive-cap anchors · CEX excluded');
    put('cv-error', model.cv.median_multiple.toFixed(2) + '×');
    put('cv-within', model.cv.within_3x_pct + '%');
    put('cv-rank', model.cv.rank_r.toFixed(2));
    put('baseline-error', model.starter_cv.median_multiple.toFixed(2) + '×');
    put('recent-note', model.recent.n + ' newer tracked tokens: ' + model.recent.metrics.median_multiple + '× error. Small cohort; see Model lab.');
    put('pre-tab-count', data.rows.length);
    put('traded-tab-count', countStatus('Traded'));
    put('aside-tab-count', countStatus('Set aside'));
    put('watch-filter-count', data.watchlist_size);
    put('fit-alpha', model.intercept.toFixed(4));
    put('fit-beta', model.elasticity.toFixed(4));
    put('fit-n', model.n);
    put('fit-band', Math.exp(model.q10).toFixed(2) + '× / ' + Math.exp(model.q90).toFixed(2) + '×');
    for (const [prefix, metrics] of [['lab', model.cv], ['cohort', model.recent.metrics]]) {
      put(prefix + '-error', metrics.median_multiple + '×');
      put(prefix + '-within', metrics.within_3x_pct + '%');
      put(prefix + '-rank', metrics.rank_r.toFixed(2));
    }
    const maximumError = Math.max(model.cv.median_multiple, model.starter_cv.median_multiple, 1);
    for (const [name, value] of [['orbit', model.cv.median_multiple], ['starter', model.starter_cv.median_multiple]]) {
      put(name + '-bar-label', value + '×');
      byId(name + '-bar').style.width = (100 * value / maximumError) + '%';
    }
    put('cohort-title', 'Tracked since ' + model.recent.since);
    put('cohort-n', model.recent.n);
    put('universe-source', 'DEFILLAMA · ' + data.as_of);
  }

  function drawChart() {
    const canvas = byId('model-chart');
    const context = canvas.getContext('2d');
    if (!context) return;
    const style = getComputedStyle(document.documentElement);
    const color = name => style.getPropertyValue(name).trim();
    const { width, height } = canvas;
    const left = 72, right = width - 18, top = 16, bottom = height - 36;
    const minimumX = 6.5, maximumX = 10.4, minimumY = 4, maximumY = 11;
    const x = value => left + (Math.log10(Math.max(1, value)) - minimumX) / (maximumX - minimumX) * (right - left);
    const y = value => bottom - (Math.log10(Math.max(1, value)) - minimumY) / (maximumY - minimumY) * (bottom - top);
    const tvlAt = index => 10 ** (minimumX + (maximumX - minimumX) * index / 60);
    context.clearRect(0, 0, width, height);
    context.font = '14px sans-serif';
    context.fillStyle = color('--muted');
    context.strokeStyle = color('--line');
    for (const value of [1e7, 1e8, 1e9, 1e10]) {
      context.beginPath(); context.moveTo(x(value), top); context.lineTo(x(value), bottom); context.stroke();
      context.fillText(engine.fmt(value), x(value) - 18, height - 10);
    }
    for (const value of [1e4, 1e6, 1e8, 1e10]) {
      context.beginPath(); context.moveTo(left, y(value)); context.lineTo(right, y(value)); context.stroke();
      context.fillText(engine.fmt(value), 0, y(value) + 4);
    }
    context.save();
    context.beginPath(); context.rect(left, top, right - left, bottom - top); context.clip();
    context.fillStyle = color('--mint');
    context.beginPath();
    for (let index = 0; index <= 60; index++) {
      const tvl = tvlAt(index), cap = engine.predict(data.model, tvl) * Math.exp(data.model.q90);
      if (index === 0) context.moveTo(x(tvl), y(cap)); else context.lineTo(x(tvl), y(cap));
    }
    for (let index = 60; index >= 0; index--) {
      const tvl = tvlAt(index);
      context.lineTo(x(tvl), y(engine.predict(data.model, tvl) * Math.exp(data.model.q10)));
    }
    context.closePath(); context.fill();
    context.fillStyle = color('--muted');
    context.globalAlpha = 0.6;
    for (const row of data.universe) {
      if (row.category === 'CEX' || !(row.mcap_usd > 0) || !(row.tvl_usd > 0)) continue;
      context.beginPath(); context.arc(x(row.tvl_usd), y(row.mcap_usd), 3, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    context.strokeStyle = color('--green'); context.lineWidth = 2.5; context.beginPath();
    for (let index = 0; index <= 60; index++) {
      const tvl = tvlAt(index), cap = engine.predict(data.model, tvl);
      if (index === 0) context.moveTo(x(tvl), y(cap)); else context.lineTo(x(tvl), y(cap));
    }
    context.stroke(); context.restore();
  }

  function badge(signal, title) {
    return `<span class="signal-badge ${signal.tone}" title="${escape(title)}">${escape(signal.label)}</span>`;
  }

  function renderRow(row) {
    const ranked = !!row.farm;
    const signals = engine.launchSignals(row, data.as_of);
    const age = ranked ? row.age_days : engine.ageDays(data.as_of, row.listed_at);
    const tag = ranked ? `<span class="tiny-tag ${row.watchlist ? '' : 'early'}">${row.watchlist ? 'WATCH' : row.tvl_usd < data.floor_usd ? 'EARLY' : 'OFF FLOOR'}</span>` : '';
    const chains = (row.chains || []).slice(0, 2).join(', ') || 'Chain unknown';
    const chainOverflow = (row.chains || []).length > 2 ? ' +' + (row.chains.length - 2) : '';
    const value = ranked ? engine.fmt(row.implied_value_usd) : row.mcap_usd > 0 ? engine.fmt(row.mcap_usd) : 'not recorded';
    return `<tr tabindex="0" data-slug="${escape(row.slug)}" class="${row.slug === state.selected ? 'selected' : ''}" aria-label="Inspect ${escape(row.name)}" aria-controls="detail-panel">
      <td data-label="Rank" class="neutral">${ranked ? row.rank : '·'}</td>
      <td data-label="Protocol"><div class="protocol-name">${escape(row.name)}${tag}</div><div class="protocol-sub">${escape(row.category || 'Uncategorized')} · ${escape(chains + chainOverflow)}</div></td>
      <td data-label="${state.status === 'Traded' ? 'Recorded cap' : 'Implied value'}" class="value">${value}</td>
      <td data-label="P10 — P90" class="band">${ranked ? engine.fmt(row.band_low_usd) + ' – ' + engine.fmt(row.band_high_usd) : '—'}</td>
      <td data-label="TVL">${engine.fmt(row.tvl_usd)}</td>
      <td data-label="7D TVL change" class="${!Number.isFinite(row.change_7d) ? 'neutral' : row.change_7d >= 0 ? 'positive' : 'negative'}">${delta(row.change_7d)}</td>
      <td data-label="Tracked" class="neutral age-cell">${ageLabel(age)}</td>
      <td data-label="Net / scenario" class="${ranked ? row.farm.net >= 0 ? 'positive' : 'negative' : 'neutral'}">${ranked ? money(row.farm.net) : '—'}</td>
      <td data-label="Farm">${ranked ? `<span class="pill ${row.farm.verdict}">${row.farm.verdict}</span>` : `<span class="neutral">${escape(row.status)}</span>`}</td>
      <td data-label="Snapshot signals"><div class="signal-stack">${badge(signals.momentum, 'Seven-day TVL momentum')}${badge(signals.risk, signals.risk.flags.join('; ') || 'Contract safety and launch intent are unobserved')}</div></td>
    </tr>`;
  }

  function renderBoard() {
    const source = state.status === 'Ranked' ? data.rows : data.universe.filter(row => row.status === state.status);
    const scenarioRows = source.map(row => ({ ...row, farm: state.status === 'Ranked' ? farmFor(row) : null }));
    currentRows = engine.sortRows(engine.filterRows(scenarioRows, { ...state, asOf: data.as_of }), {
      key: state.sort, direction: state.direction, status: state.status,
    });
    byId('protocol-rows').innerHTML = currentRows.map(renderRow).join('');
    byId('empty-state').hidden = currentRows.length > 0;
    put('value-label', state.status === 'Traded' ? 'Recorded cap' : 'Implied value');
    put('result-count', currentRows.length + ' of ' + source.length + ' shown');
    put('worth-count', data.rows.filter(row => farmFor(row).net > 0).length);
    put('match-indicator', 'board.json ↔ page · ' + data.rows.length + ' shared engine ranks & values');
    const scenario = state.settings;
    put('scenario-notice', `FARM SCENARIO · $${scenario.deposit.toLocaleString('en-US')} capital · ${scenario.days}d · ${scenario.allocation}% hypothetical allocation · ${scenario.eligibility}% assumed eligible share · $${scenario.gas}/tx · ${scenario.opportunity}% capital APR. Net is conditional on launch; principal loss and labor excluded.`);
    for (const attribute of ['status', 'quick']) {
      document.querySelectorAll('[data-' + attribute + ']').forEach(button => {
        const active = button.dataset[attribute] === state[attribute];
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    document.querySelectorAll('[data-sort]').forEach(button => {
      const active = button.dataset.sort === state.sort || (state.sort === 'mcap_usd' && button.dataset.sort === 'implied_value_usd');
      if (active) button.closest('th').setAttribute('aria-sort', state.direction === 1 ? 'ascending' : 'descending');
      else button.closest('th').removeAttribute('aria-sort');
    });
    const mobileKey = state.sort === 'mcap_usd' ? 'implied_value_usd' : state.sort;
    byId('mobile-sort').value = mobileKey + ':' + state.direction;
    syncLayout();
  }

  function detailHeader(label) {
    return `<div class="detail-top"><span class="eyebrow">${escape(label)}</span><div class="detail-actions">${rankedBySlug.has(state.selected) ? `<button type="button" id="expand-detail" class="text-button" aria-expanded="${state.expanded}">${state.expanded ? 'Compact ↙' : 'Expand ↗'}</button>` : ''}<button type="button" id="close-detail" class="close-detail" aria-label="Close protocol details">×</button></div></div>`;
  }

  const fact = (label, value) => `<div class="fact-line"><span>${escape(label)}</span><b>${escape(value)}</b></div>`;

  function renderDetail() {
    const panel = byId('detail-panel');
    const row = rankedBySlug.get(state.selected) || universeBySlug.get(state.selected);
    if (!row) {
      panel.innerHTML = '<div class="detail-empty"><span class="eyebrow">PROTOCOL BRIEF</span><h2>Select a protocol</h2><p>Inspect its value construction, snapshot signals and scenario economics.</p></div>';
      syncLayout();
      return;
    }
    const signals = engine.launchSignals(row, data.as_of);
    const signalBlock = `<div class="detail-block"><h3>Snapshot launch context</h3><div class="signal-stack">${badge(signals.momentum, 'Seven-day TVL momentum')}${badge(signals.risk, signals.risk.label)}</div>${fact('Token record', signals.token_status)}${fact('7D TVL change', delta(row.change_7d))}${signals.risk.flags.length ? `<ul class="fine-print">${signals.risk.flags.map(flag => `<li>${escape(flag)}</li>`).join('')}</ul>` : ''}<p class="fine-print">${escape(signals.note)} Unassessed is not a safety rating.</p></div>`;
    if (!rankedBySlug.has(state.selected)) {
      panel.innerHTML = `${detailHeader('UNIVERSE AUDIT')}<h2>${escape(row.name)}</h2><div class="detail-meta">${escape(row.category || 'Uncategorized')} · ${escape(row.status)}</div><p class="fine-print">${escape(row.reason)}. This protocol is kept out of the pre-token ranking.</p>${fact('TVL', engine.fmt(row.tvl_usd))}${fact('Recorded market cap', row.mcap_usd > 0 ? engine.fmt(row.mcap_usd) : 'not recorded')}${fact('Token identity', row.symbol || row.gecko_id || 'none')}${signalBlock}`;
      syncLayout();
      return;
    }
    const farm = farmFor(row);
    const factors = row.factors || engine.adjustments(row, data.as_of);
    const settings = [
      ['deposit', 'Capital $'], ['days', 'Horizon days'], ['allocation', 'Hyp. allocation %'],
      ['eligibility', 'Assumed share %'], ['gas', 'Gas per tx $'], ['opportunity', 'Capital APR %'],
    ];
    const peers = (data.traded || []).filter(peer => peer.category === row.category && peer.tvl_usd > 0)
      .sort((a, b) => Math.abs(Math.log(a.tvl_usd / Math.max(1, row.tvl_usd))) - Math.abs(Math.log(b.tvl_usd / Math.max(1, row.tvl_usd))))
      .slice(0, 3);
    panel.innerHTML = `${detailHeader('PROTOCOL BRIEF · #' + row.rank)}
      <h2>${escape(row.name)}</h2>
      <div class="detail-meta">${escape(row.category || 'Uncategorized')} · ${escape((row.chains || []).join(', ') || 'Chain unknown')}</div>
      <div class="detail-value">${engine.fmt(row.implied_value_usd)}</div>
      <div class="detail-band">P10 ${engine.fmt(row.band_low_usd)} — P90 ${engine.fmt(row.band_high_usd)} · conditional cap</div>
      <div class="detail-block"><h3>How this value is built</h3>
        ${fact('Base fitted cap', engine.fmt(engine.predict(data.model, row.tvl_usd)))}
        ${fact('7-day growth adjustment', factors.growth.toFixed(3) + '×')}
        ${fact('Tracking seasoning', factors.seasoning.toFixed(3) + '×')}
        ${fact('TVL · 7D change', engine.fmt(row.tvl_usd) + ' · ' + delta(row.change_7d))}
        ${fact('Tracking start', (row.listed_at || 'unknown') + ' · ' + ageLabel(row.age_days))}
        <p class="fine-print">Growth = 1 + 0.15 × capped change / 100. Seasoning = 0.85 + 0.15 × min(days,730)/730; unknown uses 365d. Regression is fitted only to TVL. Neither adjustment estimates launch odds.</p>
      </div>
      <div class="detail-block"><h3>Farm economics <span class="pill ${farm.verdict}">${farm.verdict}</span></h3>
        <div class="scenario-grid">${settings.map(([key, label]) => `<label>${label}<input data-setting="${key}" type="number" required min="${engine.LIMITS[key][0]}" max="${engine.LIMITS[key][1]}" step="any" value="${state.settings[key]}"></label>`).join('')}</div>
        ${fact('Gross, conditional on launch', money(farm.gross))}
        ${fact('Four gas tx + execution + capital', money(farm.cost))}
        ${fact('Net / P10 downside net', money(farm.net) + ' / ' + money(farm.netLow))}
        ${fact('Break-even eligibility at launch', farm.breakeven === null ? 'Unavailable' : farm.breakeven > 100 ? '>100%' : farm.breakeven.toFixed(1) + '%')}
        ${fact('Time · net per hour', farm.hours.toFixed(1) + 'h · ' + money(farm.net / farm.hours))}
        <p class="fine-print">${escape(farm.assumptions)}</p>
      </div>
      ${signalBlock}
      <div class="detail-block"><h3>Concrete interaction plan</h3><ol class="detail-plan">${farm.steps.map(step => `<li>${escape(step.trim())}</li>`).join('')}</ol></div>
      <div class="detail-block"><h3>Nearby traded comparables</h3>${peers.length ? `<ul class="detail-peers">${peers.map(peer => `<li><b>${escape(peer.name)}</b><span>${engine.fmt(peer.tvl_usd)} TVL · ${engine.fmt(peer.mcap_usd)} recorded cap</span></li>`).join('')}</ul>` : '<p class="fine-print">No positive-TVL comparables in this category.</p>'}<p class="fine-print">Nearest by log TVL within the category. The pooled fit uses every eligible comparable.</p></div>`;
    syncLayout();
  }

  function renderUniverse() {
    const summary = [
      ['Ranked', data.rows.length],
      ['Token recorded', data.universe.filter(row => row.status === 'Traded').length],
      ['Set aside', data.universe.filter(row => row.status === 'Set aside').length],
      ['Total snapshot', data.universe.length],
    ];
    byId('audit-summary').innerHTML = summary.map(([label, count]) => `<div><b>${count}</b><span>${label}</span></div>`).join('');
    byId('universe-rows').innerHTML = data.universe.map(row => `<tr tabindex="0" data-slug="${escape(row.slug)}" aria-label="Inspect ${escape(row.name)}"><td>${escape(row.name)}</td><td>${escape(row.category || 'Uncategorized')}</td><td>${escape((row.chains || []).slice(0, 2).join(', '))}</td><td>${engine.fmt(row.tvl_usd)}</td><td>${escape(row.status)}</td><td>${escape(row.reason)}</td></tr>`).join('');
  }

  function setView(name) {
    state.view = choices(name, views, 'board');
    if (state.view !== 'board') state.drawerOpen = false;
    for (const view of views) byId(view + '-view').hidden = state.view !== view;
    for (const id of ['controls', 'board-tools', 'scenario-notice']) byId(id).hidden = state.view !== 'board';
    document.querySelectorAll('.nav-button').forEach(button => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncLayout();
    if (state.view === 'board') drawChart();
    writeLocation();
  }

  function inspect(slug, trigger) {
    if (!universeBySlug.has(slug) && !rankedBySlug.has(slug)) return;
    previousFocus = trigger || document.activeElement;
    state.selected = slug;
    state.inspected = true;
    state.drawerOpen = true;
    if (state.view !== 'board') setView('board');
    renderBoard(); renderDetail(); writeLocation();
    byId('detail-panel').focus({ preventScroll: !media.matches });
  }

  function closeDetail() {
    const slug = state.selected;
    state.drawerOpen = false;
    state.expanded = false;
    state.inspected = false;
    state.selected = '';
    renderBoard(); renderDetail(); writeLocation();
    const fallback = [...document.querySelectorAll('#protocol-rows [data-slug]')].find(row => row.dataset.slug === slug);
    const target = previousFocus?.isConnected && !previousFocus.closest('[hidden]') ? previousFocus : fallback || byId('search');
    target.focus({ preventScroll: true });
  }

  function exportCsv() {
    const fields = ['rank', 'slug', 'name', 'status', 'mcap_usd', 'implied_value_usd', 'band_low_usd', 'band_high_usd', 'tvl_usd', 'change_7d', 'age_days', 'net_usd'];
    const cell = value => {
      const text = typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r\n])/.test(value) ? "'" + value : value ?? '';
      return '"' + String(text).replace(/"/g, '""') + '"';
    };
    const lines = currentRows.map(row => {
      const record = { ...row, status: state.status, age_days: engine.ageDays(data.as_of, row.listed_at), net_usd: row.farm?.net };
      return fields.map(key => cell(record[key])).join(',');
    });
    const url = URL.createObjectURL(new Blob([[fields.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'orbit-' + data.as_of + '.csv';
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function resetFilters() {
    for (const key of ['search', 'category', 'chain', 'quick', 'momentum', 'risk']) state[key] = '';
    for (const id of ['search', 'category-filter', 'chain-filter', 'momentum-filter', 'risk-filter']) byId(id).value = '';
    renderBoard(); writeLocation();
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-view],[data-status],[data-quick],[data-sort],[data-slug],#expand-detail,#close-detail,#drawer-backdrop,#reset-filters,#csv-export,.brand');
      if (!target) return;
      if (target.matches('.brand')) { event.preventDefault(); setView('board'); }
      else if (target.dataset.view) setView(target.dataset.view);
      else if (target.dataset.status) {
        state.status = target.dataset.status; state.quick = '';
        state.sort = state.status === 'Traded' ? 'mcap_usd' : 'rank';
        state.direction = state.status === 'Traded' ? -1 : 1;
        renderBoard(); writeLocation();
      } else if (target.dataset.quick) {
        if (state.status !== 'Ranked') { state.sort = 'rank'; state.direction = 1; }
        state.status = 'Ranked'; state.quick = state.quick === target.dataset.quick ? '' : target.dataset.quick;
        renderBoard(); writeLocation();
      } else if (target.dataset.sort) {
        const key = target.dataset.sort;
        state.direction = state.sort === key ? -state.direction : key === 'name' ? 1 : -1;
        state.sort = key; renderBoard(); writeLocation();
      } else if (target.dataset.slug) inspect(target.dataset.slug, target);
      else if (target.id === 'expand-detail') {
        state.expanded = !state.expanded; renderDetail(); writeLocation(); byId('expand-detail').focus();
      } else if (target.id === 'close-detail' || target.id === 'drawer-backdrop') closeDetail();
      else if (target.id === 'reset-filters') resetFilters();
      else if (target.id === 'csv-export') exportCsv();
    });
    document.addEventListener('keydown', event => {
      const row = event.target.closest('tr[data-slug]');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); inspect(row.dataset.slug, row);
      } else if (event.key === 'Escape' && state.selected && state.view === 'board') closeDetail();
      else if (event.key === 'Tab' && state.drawerOpen && media.matches && state.view === 'board') {
        const focusable = [...byId('detail-panel').querySelectorAll('button,input,select,a[href]')].filter(element => !element.disabled);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === byId('detail-panel'))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !byId('detail-panel').contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    });
    byId('search').value = state.search;
    byId('search').addEventListener('input', event => { state.search = event.target.value; renderBoard(); writeLocation(); });
    for (const key of ['category', 'chain', 'momentum', 'risk']) {
      const select = byId(key + '-filter');
      if (key === 'category' || key === 'chain') {
        const values = [...new Set(data.universe.flatMap(row => key === 'chain' ? row.chains || [] : [row.category || 'Uncategorized']))].sort();
        for (const value of values) select.add(new Option(value, value));
        if (!values.includes(state[key])) state[key] = '';
      }
      select.value = state[key];
      select.addEventListener('change', event => { state[key] = event.target.value; renderBoard(); writeLocation(); });
    }
    byId('mobile-sort').addEventListener('change', event => {
      const [key, direction] = event.target.value.split(':');
      state.sort = key; state.direction = Number(direction); renderBoard(); writeLocation();
    });
    byId('detail-panel').addEventListener('change', event => {
      const input = event.target.closest('[data-setting]');
      if (!input || !Object.hasOwn(engine.LIMITS, input.dataset.setting)) return;
      if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) { input.reportValidity(); return; }
      const key = input.dataset.setting;
      state.settings[key] = input.valueAsNumber;
      renderBoard(); renderDetail(); writeLocation();
      byId('detail-panel').querySelector('[data-setting="' + key + '"]')?.focus({ preventScroll: true });
    });
    media.addEventListener('change', () => {
      syncLayout();
      if (state.drawerOpen && media.matches) byId('detail-panel').focus();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawChart);
  }

  try {
    bindEvents(); renderCounts(); renderBoard(); renderDetail(); renderUniverse(); setView(state.view);
    if (state.drawerOpen && media.matches && state.view === 'board') byId('detail-panel').focus();
    window.ORBIT_READY = true;
  } catch (error) {
    showError('The local dashboard could not be rendered. ' + error.message);
    console.error(error);
  }
})();
