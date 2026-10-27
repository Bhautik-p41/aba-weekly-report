(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const app = $('.p41');
  const rootEl = document.getElementById('dash-root') || document.body;
  const fmtIntRaw = d3.format(',');
  const fmtInt = (v) => fmtIntRaw(Math.round(Number(v) || 0));
  const fmtPct = d3.format('.1%');
  const fmtPct0 = d3.format('.0%');
  const fmtSigned = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtInt(Math.abs(v));
  const fmtPts = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + (Math.abs(v) * 100).toFixed(1) + ' pts';
  const parseDay = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const fmtDayLong = d3.utcFormat('%A %-d %B %Y');
  const fmtDay = d3.utcFormat('%a %-d %b');
  const fmtShort = d3.utcFormat('%-d %b');
  const fmtWeekTick = d3.utcFormat('%-d %b');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DUR = reduceMotion ? 0 : 700;
  const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const nn = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const byWeek = (a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0);
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const css = (name) => getComputedStyle(app).getPropertyValue(name).trim();
  $('#yr').textContent = String(new Date().getUTCFullYear());

  // ---------- theme (light / dark follows the dashboard) ----------
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
  app.appendChild(probe);
  let cvs = null, canvasOk = true;
  function toRgb(str) {
    // Any CSS color (rgb, lab, oklch, color()…) → [r, g, b] through a 1×1 canvas; regex fallback.
    if (canvasOk) {
      try {
        if (!cvs) { cvs = document.createElement('canvas'); cvs.width = cvs.height = 1; }
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no 2d context');
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = str; ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        if (d[3] > 0) return [d[0], d[1], d[2]];
      } catch (e) { canvasOk = false; }
    }
    const m = String(str).match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] === 0) return null;
    return [p[0], p[1], p[2]];
  }
  function resolveColor(value) {
    probe.style.background = value;
    return toRgb(getComputedStyle(probe).backgroundColor);
  }
  const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  function applyTheme() {
    const bg = resolveColor('var(--color-bg)');
    const fgStr = getComputedStyle(rootEl).color;
    const fg = toRgb(fgStr);
    let dark = null;
    if (bg && fg) dark = lum(fg) > lum(bg);        // light text on a dark page
    else if (bg) dark = lum(bg) < 0.5;
    else if (window.matchMedia) dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark !== null) app.classList.toggle('is-dark', dark);
  }
  try {
    const mo = new MutationObserver(() => { applyTheme(); scheduleRedraw(); });
    const opts = { attributes: true, attributeFilter: ['class', 'data-mode', 'style', 'data-theme'] };
    mo.observe(document.documentElement, opts);
    if (document.body) mo.observe(document.body, opts);
    const cds = document.querySelector('.cds-root');
    if (cds) mo.observe(cds, opts);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); scheduleRedraw(); });
  } catch (e) { /* observers are a nicety */ }
  applyTheme();

  // ---------- calculations readers can inspect ----------
  dash.calc('week_kpis', {
    inputs: ['weeks'],
    title: 'Weekly KPIs',
    description: 'Success rate = successful ÷ requested. Overall success = (successful + data issues) ÷ requested: filings the bot completed or correctly stopped because of an input problem; capped at 100%.',
    fn: (weeks) => {
      const n = (v) => Number(v) || 0;
      const rows = [...weeks].sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
      return rows.map((w) => {
        const req = n(w.requested);
        const handled = n(w.successful) + n(w.data_issue);
        return {
          week_start: w.week_start, week_end: w.week_end, label: w.label,
          requested: req, attempted: n(w.attempted), successful: n(w.successful), failed: n(w.failed),
          data_issue: n(w.data_issue), actual_failure: n(w.actual_failure), active_days: n(w.active_days),
          success_rate: req ? n(w.successful) / req : 0,
          data_issue_rate: req ? Math.min(1, n(w.data_issue) / req) : 0,
          handled: handled,
          overall_success: req ? Math.min(1, handled / req) : 0,
        };
      });
    },
  });
  dash.calc('breakdown_rates', {
    inputs: ['weekly_breakdown'],
    title: 'Success rate per state and service',
    description: 'For each state-and-service row: success rate = successful ÷ requested, share = requested ÷ the week’s total requested.',
    fn: (weekly_breakdown) => {
      const n = (v) => Number(v) || 0;
      const totals = {};
      for (const r of weekly_breakdown) totals[r.week_start] = (totals[r.week_start] || 0) + n(r.requested);
      return weekly_breakdown.map((r) => ({
        key: r.key, week_start: r.week_start, state: r.state, service: r.service,
        success_rate: n(r.requested) ? n(r.successful) / n(r.requested) : 0,
        share: totals[r.week_start] ? n(r.requested) / totals[r.week_start] : 0,
      }));
    },
  });
  dash.calc('service_rates', {
    inputs: ['weekly_breakdown'],
    title: 'Totals per service',
    description: 'Each week’s rows summed per service across states; success rate = successful ÷ requested.',
    fn: (weekly_breakdown) => {
      const n = (v) => Number(v) || 0;
      const g = new Map();
      for (const r of weekly_breakdown) {
        const key = r.week_start + '|' + r.service;
        const s = g.get(key) || { key, week_start: r.week_start, service: r.service, requested: 0, attempted: 0, successful: 0, failed: 0, data_issue: 0, actual_failure: 0, states: 0 };
        s.requested += n(r.requested); s.attempted += n(r.attempted); s.successful += n(r.successful); s.failed += n(r.failed);
        s.data_issue += n(r.data_issue); s.actual_failure += n(r.actual_failure); s.states += 1;
        g.set(key, s);
      }
      return [...g.values()].map((s) => ({ ...s, success_rate: s.requested ? s.successful / s.requested : 0 }));
    },
  });
  dash.calc('reasons_by_week', {
    inputs: ['failure_reasons'],
    title: 'Failure reasons per week',
    description: 'Failed bot runs per week grouped by the failure message in the bot log, summed over states and services.',
    fn: (failure_reasons) => {
      const n = (v) => Number(v) || 0;
      const g = new Map();
      for (const r of failure_reasons) {
        const key = r.week_start + '|' + r.reason;
        const s = g.get(key) || { key, week_start: r.week_start, reason: r.reason, count: 0, lines: [] };
        s.count += n(r.count);
        const line = r.state + ' · ' + r.service;
        if (!s.lines.includes(line)) s.lines.push(line);
        g.set(key, s);
      }
      return [...g.values()].map((s) => ({ key: s.key, week_start: s.week_start, reason: s.reason, count: s.count, services: s.lines.join(', ') }));
    },
  });

  // ---------- helpers ----------
  const state = { week: null, lastWeek: null, firstDraw: true, sort: { col: 'requested', dir: -1 }, search: '', prev: {}, cache: {}, redrawTimer: 0 };
  let redrawFn = null;
  function scheduleRedraw() { if (!redrawFn) return; clearTimeout(state.redrawTimer); state.redrawTimer = setTimeout(() => redrawFn(false), 60); }

  function tooltipFor(box) {
    let tip = box.querySelector(':scope > .tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; box.appendChild(tip); }
    return {
      show(evt, html) { tip.innerHTML = html; tip.style.display = 'block'; this.move(evt); },
      move(evt) {
        const r = box.getBoundingClientRect();
        const x = evt.clientX - r.left, y = evt.clientY - r.top;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = x + 14, top = y - h - 10;
        if (left + w > r.width) left = Math.max(0, x - w - 14);
        if (top < 0) top = y + 14;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      },
      hide() { tip.style.display = 'none'; },
    };
  }
  const tipRow = (color, name, value) => `<div class="r"><span>${color ? `<i style="background:${color}"></i>` : ''}${esc(name)}</span><b>${esc(value)}</b></div>`;
  function textWidth(svg, str, size, weight) {
    const t = svg.append('text').attr('font-size', size).attr('font-weight', weight || 400).attr('visibility', 'hidden').text(str);
    const w = t.node().getComputedTextLength(); t.remove(); return w;
  }
  function cleanAxis(g) { g.attr('font-size', null).attr('font-family', null); g.select('.domain').remove(); }
  function stateBox(box, d, minHeight) {
    box.querySelectorAll('svg, .failed-line').forEach((n) => n.remove());
    if (d.status === 'loading' || d.status === 'missing') { box.classList.add('dash-skeleton'); return; }
    box.classList.remove('dash-skeleton');
    if (d.status === 'error' || d.status === 'connect' || d.status === 'declined') {
      const line = document.createElement('div'); line.className = 'failed-line'; line.style.minHeight = (minHeight || 240) + 'px'; line.textContent = 'Failed to load'; box.appendChild(line);
    }
  }
  function setWhere(el, k, v) { el.setAttribute('data-where', `${k}=${enc(v)}`); }
  function countTo(el, key, value, fmt, animate) {
    const prev = state.prev[key] ?? 0;
    state.prev[key] = value;
    if (!animate || DUR === 0 || !Number.isFinite(value) || prev === value) { el.textContent = fmt(value); return; }
    const i = d3.interpolateNumber(prev, value);
    d3.select(el).interrupt('count').transition('count').duration(DUR).ease(d3.easeCubicOut)
      .tween('text', () => (t) => { el.textContent = fmt(t >= 1 ? value : i(t)); })
      .on('end interrupt', () => { el.textContent = fmt(value); });
  }
  const weekWindow = (W, week, size) => {
    const i = Math.max(0, W.findIndex((w) => w.week_start === week));
    const end = Math.min(W.length, Math.max(i + 1, size));
    const start = Math.max(0, end - size);
    return W.slice(start, end);
  };
  const colorOf = { successful: () => css('--p-blue'), data_issue: () => css('--p-amber'), actual_failure: () => css('--p-ruby') };
  const KEYS = ['successful', 'data_issue', 'actual_failure'];
  const NAMES = { successful: 'Successful', data_issue: 'Data issues', actual_failure: 'Actual bot failures' };

  // ---------- records in the source sheet (opens the matching rows of "Bot Processing Data" in a new tab) ----------
  const SHEET = { id: '1MYS5uFP98sC8SKEyWMx2gqQgsGJTbV4cogqcWTJj4cY', gid: '1124596553' };
  const qs = (v) => '"' + String(v ?? '').replace(/["\\]/g, '').slice(0, 120) + '"';
  const endpoint = () => (window.ABA_CONFIG && window.ABA_CONFIG.recordsEndpoint) || '';
  const weekP = (w) => (w ? { from: w.week_start, to: w.week_end } : {});
  // p: { day | from + to, state, service, status: all|success|failed, reason }
  function recordsUrl(p, json) {
    const ep = endpoint();
    if (ep) {
      const u = new URL(ep);
      for (const [k, v] of Object.entries(p || {})) { if (!v || (k === 'status' && v === 'all')) continue; u.searchParams.set(k, v); }
      if (!json) u.searchParams.set('redirect', '1');
      return u.toString();
    }
    const parts = [];
    if (p.day) parts.push(`X = date '${String(p.day).slice(0, 10)}'`); else if (p.from && p.to) parts.push(`X >= date '${p.from}' and X <= date '${p.to}'`);
    if (p.state) parts.push(`B = ${qs(p.state)}`);
    if (p.service) parts.push(`C = ${qs(p.service)}`);
    if (p.status === 'success') parts.push('Y = 1');
    if (p.status === 'failed') parts.push('Z = 1');
    if (p.reason) parts.push(`K contains ${qs(p.reason)}`);
    const tq = `select * where ${parts.join(' and ') || 'X is not null'} order by X, B, C`;
    return `https://docs.google.com/spreadsheets/d/${SHEET.id}/gviz/tq?tqx=out:html&gid=${SHEET.gid}&headers=1&tq=${encodeURIComponent(tq)}`;
  }
  function openRecords(p) {
    const navigate = (url) => {
      let w = null;
      try { w = window.open(url, '_blank', 'noopener'); } catch (e) { w = null; }
      if (!w) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    };
    if (!endpoint()) { navigate(recordsUrl(p)); return; }
    // Open the tab now (inside the click, so it is not blocked), ask the endpoint for the sheet tab, then send the tab there.
    let w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) {
      try { w.document.write('<!doctype html><title>Opening records…</title><body style="font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#14161D"><p>Preparing the records in Google Sheets…</p></body>'); } catch (e) { /* ignore */ }
    }
    const fallback = recordsUrl(p);
    fetch(recordsUrl(p, true), { redirect: 'follow' }).then((r) => r.json())
      .then((j) => { if (!j || !j.ok || !j.url) throw new Error((j && j.error) || 'no url'); if (w) w.location.href = j.url; else navigate(j.url); })
      .catch(() => { if (w) w.location.href = fallback; else navigate(fallback); });
  }
  const curWeek = () => (state.cache.k || null);
  const TITLE_RECORDS = 'Open the matching records from the sheet in a new tab';
  $('#kpis').addEventListener('click', (e) => {
    const tile = e.target.closest('.kpi'); if (!tile) return;
    const metric = (tile.querySelector('.val') || {}).dataset?.metric; const w = curWeek(); if (!w) return;
    const status = metric === 'successful' ? 'success' : (metric === 'data_issue' || metric === 'actual_failure') ? 'failed' : 'all';
    openRecords({ ...weekP(w), status });
  });
  $('#bd-table tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const r = (state.cache.bdMap || new Map()).get(tr.dataset.key); const w = curWeek(); if (!r || !w) return;
    const cell = e.target.closest('td'); const idx = cell ? Array.prototype.indexOf.call(tr.children, cell) : -1;
    const status = idx === 4 ? 'success' : (idx >= 5 && idx <= 7) ? 'failed' : 'all';
    openRecords({ ...weekP(w), state: r.state, service: r.service, status });
  });
  $('#dd-table tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const r = (state.cache.ddMap || new Map()).get(tr.dataset.key); if (!r) return;
    const cell = e.target.closest('td'); const idx = cell ? Array.prototype.indexOf.call(tr.children, cell) : -1;
    const status = idx === 4 ? 'success' : (idx >= 5 && idx <= 7) ? 'failed' : 'all';
    openRecords({ day: String(r.date).slice(0, 10), state: r.state, service: r.service, status });
  });

  // ---------- week navigation ----------
  const nav = $('#week-nav');
  const sel = $('.wsel', nav);
  sel.addEventListener('change', () => dash.setParams({ week: sel.value || null, day: null }));
  $('.prev', nav).addEventListener('click', () => stepWeek(-1));
  $('.next', nav).addEventListener('click', () => stepWeek(1));
  $('.latest', nav).addEventListener('click', () => { const W = state.cache.W || []; if (W.length) dash.setParams({ week: W[W.length - 1].week_start, day: null }); });
  function stepWeek(d) {
    const W = state.cache.W || [];
    const i = W.findIndex((w) => w.week_start === state.week);
    const j = i + d;
    if (i >= 0 && j >= 0 && j < W.length) dash.setParams({ week: W[j].week_start, day: null });
  }
  $('#dd-close').addEventListener('click', () => dash.setParams({ day: null }));
  $('#bd-search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderBreakdownTable(); });
  $('#bd-table thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]'); if (!b) return;
    const col = b.dataset.sort;
    if (state.sort.col === col) state.sort.dir = -state.sort.dir; else state.sort = { col, dir: col === 'state' || col === 'service' ? 1 : -1 };
    renderBreakdownTable();
  });

  // ---------- renderers ----------
  function renderNav(W, week) {
    const cur = sel.value;
    sel.replaceChildren(...W.slice().reverse().map((w) => new Option(w.label, w.week_start)));
    sel.value = week || cur;
    const i = W.findIndex((w) => w.week_start === week);
    $('.prev', nav).disabled = i <= 0;
    $('.next', nav).disabled = i < 0 || i >= W.length - 1;
    $('.latest', nav).disabled = i === W.length - 1;
    const w = W[i];
    $('#week-range-label').textContent = w ? `${fmtDay(parseDay(w.week_start))} – ${fmtDay(parseDay(w.week_end))}` : '';
    const wl = $('#week-records-link');
    if (wl) { if (w) { wl.href = recordsUrl(weekP(w)); wl.hidden = false; } else wl.hidden = true; }
  }

  function renderTakeaway(k, animate) {
    const el = $('#takeaway');
    if (!el) return;
    if (!k) { el.innerHTML = '<span class="dash-skeleton">Loading the week’s figures…</span>'; return; }
    const m = (field, text, cls) => `<span class="${cls || ''}" data-source="week_kpis" data-field="${field}" data-where="week_start=${enc(k.week_start)}">${esc(text)}</span>`;
    const rateDelta = k.delta_success_rate === null ? '' : ` ${m('delta_success_rate', fmtPts(k.delta_success_rate))} vs ${esc(k.prev_label)}`;
    el.innerHTML = `<b class="wk">${esc(k.label)}</b>: ${m('requested', fmtInt(k.requested), 'b')} filings requested, ${m('successful', fmtInt(k.successful))} completed (${m('success_rate', fmtPct(k.success_rate))} success rate${rateDelta}). ${m('failed', fmtInt(k.failed))} failed — ${m('data_issue', fmtInt(k.data_issue))} data issues, ${m('actual_failure', fmtInt(k.actual_failure))} actual bot failures.`;
    if (animate && DUR) { el.classList.remove('reveal'); void el.offsetWidth; el.classList.add('reveal'); }
  }

  function renderKpis(k, W, K, animate) {
    for (const tile of $$('#kpis .kpi')) { tile.style.cursor = 'pointer'; tile.title = TITLE_RECORDS; }
    for (const el of $$('#kpis .val')) {
      const metric = el.dataset.metric;
      if (!k) { el.textContent = '—'; el.classList.add('dash-skeleton'); continue; }
      el.classList.remove('dash-skeleton');
      setWhere(el, 'week_start', k.week_start);
      const v = k[metric];
      countTo(el, metric, v, metric === 'success_rate' || metric === 'overall_success' ? fmtPct : fmtInt, animate);
    }
    const ov = $('#kpi-overall-sub');
    if (ov) { if (k) { const dr = k.requested ? Math.min(1, k.data_issue / k.requested) : 0; ov.innerHTML = `<span data-source="week_kpis" data-field="handled" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(k.handled))}</span> of <span data-source="week_kpis" data-field="requested" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(k.requested))}</span> handled correctly<br><span class="formula">= success rate <span data-source="week_kpis" data-field="success_rate" data-where="week_start=${enc(k.week_start)}">${esc(fmtPct(k.success_rate))}</span> + data issues <span data-source="week_kpis" data-field="data_issue_rate" data-where="week_start=${enc(k.week_start)}">${esc(fmtPct(dr))}</span></span>`; } else ov.textContent = ''; }
    for (const box of $$('#kpis .spark')) {
      const metric = box.dataset.spark;
      const rows = metric === 'success_rate' ? K : W;
      box.replaceChildren();
      if (!k || !rows.length) continue;
      const win = weekWindow(rows, k.week_start, 12);
      const w = Math.max(60, box.clientWidth), h = 30;
      const x = d3.scalePoint(win.map((r) => r.week_start), [2, w - 2]);
      const vals = win.map((r) => n0(r[metric]));
      const y = d3.scaleLinear([Math.min(0, d3.min(vals)), Math.max(1, d3.max(vals))], [h - 3, 3]);
      const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%').attr('height', h);
      const line = d3.line().x((r) => x(r.week_start)).y((r) => y(n0(r[metric])));
      const col = box.closest('.kpi').style.getPropertyValue('--kc') || 'var(--p-blue)';
      const path = svg.append('path').attr('d', line(win)).attr('fill', 'none').style('stroke', col).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('opacity', .85);
      if (animate && DUR) { const L = path.node().getTotalLength(); path.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(DUR).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', () => path.attr('stroke-dasharray', null)); }
      const cur = win.find((r) => r.week_start === k.week_start);
      if (cur) svg.append('circle').attr('cx', x(cur.week_start)).attr('cy', y(n0(cur[metric]))).attr('r', 3.2).style('fill', col).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    }
  }

  function renderHighlights(k, bd, rates, dailyRows) {
    const box = $('#highlights');
    box.replaceChildren();
    if (!k) return;
    const items = [];
    const w = (src, field, whereK, whereV, text, cls) => `<span class="${cls || ''}" data-source="${src}" data-field="${field}" data-where="${whereK}=${enc(whereV)}">${esc(text)}</span>`;
    const link = (r, status) => `<a class="rl" href="${esc(recordsUrl({ ...weekP(k), state: r.state, service: r.service, status: status || 'all' }))}" target="_blank" rel="noopener" title="${TITLE_RECORDS}">${esc(r.state)} · ${esc(r.service)}</a>`;
    const wk = (field, text) => w('week_kpis', field, 'week_start', k.week_start, text);
    items.push({ c: 'var(--p-green)', html: `<b>Overall success ${wk('overall_success', fmtPct(k.overall_success))}</b>: the bots completed ${wk('successful', fmtInt(k.successful))} filings and correctly flagged ${wk('data_issue', fmtInt(k.data_issue))} with data issues, out of ${wk('requested', fmtInt(k.requested))} requested.` });
    const top = bd.slice().sort((a, b) => n0(b.requested) - n0(a.requested))[0];
    if (top) {
      const rt = rates.get(top.key);
      items.push({ c: 'var(--p-blue)', html: `<b>${link(top)}</b> led the week: ${w('weekly_breakdown', 'requested', 'key', top.key, fmtInt(top.requested))} requested${rt ? ` (${w('breakdown_rates', 'share', 'key', top.key, fmtPct0(rt.share))} of all filings)` : ''}, ${w('weekly_breakdown', 'successful', 'key', top.key, fmtInt(top.successful))} completed${rt ? ` (${w('breakdown_rates', 'success_rate', 'key', top.key, fmtPct0(rt.success_rate))})` : ''}.` });
    }
    const busy = dailyRows.slice().sort((a, b) => n0(b.requested) - n0(a.requested))[0];
    if (busy) items.push({ c: 'var(--p-navy)', html: `Busiest day: <b><a class="rl" href="${esc(recordsUrl({ day: String(busy.date).slice(0, 10) }))}" target="_blank" rel="noopener" title="${TITLE_RECORDS}">${esc(fmtDay(parseDay(busy.date)))}</a></b> with ${w('daily', 'requested', 'date', busy.date, fmtInt(busy.requested))} requested, over ${wk('active_days', fmtInt(k.active_days))} active days.` });
    const di = bd.slice().sort((a, b) => n0(b.data_issue) - n0(a.data_issue))[0];
    if (di && n0(di.data_issue) > 0) {
      items.push({ c: 'var(--p-amber)', html: `Data issues (input or external, not the bot): mostly <b>${link(di, 'failed')}</b> — ${w('weekly_breakdown', 'data_issue', 'key', di.key, fmtInt(di.data_issue))}.${di.note_data_issue ? ' ' + w('weekly_breakdown', 'note_data_issue', 'key', di.key, di.note_data_issue, 'q') : ''}` });
    }
    const act = bd.slice().sort((a, b) => n0(b.actual_failure) - n0(a.actual_failure))[0];
    if (act && n0(act.actual_failure) > 0) {
      items.push({ c: 'var(--p-gray)', html: `Bot attention: <b>${link(act, 'failed')}</b> — ${w('weekly_breakdown', 'actual_failure', 'key', act.key, fmtInt(act.actual_failure))}.${act.note_actual ? ' ' + w('weekly_breakdown', 'note_actual', 'key', act.key, act.note_actual, 'q') : ''}` });
    } else if (k.actual_failure === 0) {
      items.push({ c: 'var(--p-green)', html: 'No bot failures this week.' });
    }
    for (const it of items) {
      const div = document.createElement('div'); div.className = 'item reveal'; div.style.setProperty('--hc', it.c);
      div.innerHTML = `<span class="dot"></span><span>${it.html}</span>`;
      box.appendChild(div);
    }
  }

  function renderDaily(dailyD, week, k, animate) {
    const box = $('#daily-chart'), legend = $('#daily-legend');
    if (dailyD.status !== 'ok' || !week) { stateBox(box, dailyD, 260); legend.replaceChildren(); return []; }
    box.classList.remove('dash-skeleton');
    const start = parseDay(week);
    const byD = new Map(dailyD.data.map((r) => [String(r.date).slice(0, 10), r]));
    const rows = d3.range(7).map((i) => {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
      const key = isoDay(d), r = byD.get(key);
      return { date: key, d, has: !!r, requested: r ? n0(r.requested) : 0, successful: r ? n0(r.successful) : 0, failed: r ? n0(r.failed) : 0, data_issue: r ? n0(r.data_issue) : 0, actual_failure: r ? n0(r.actual_failure) : 0 };
    });
    const day = dash.params().day;
    const W = Math.max(280, box.clientWidth), H = 260, tipc = tooltipFor(box);
    box.querySelectorAll('svg, .failed-line').forEach((n) => n.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const maxTotal = Math.max(1, d3.max(rows, (r) => KEYS.reduce((s, kk) => s + Math.max(0, r[kk]), 0)));
    const y = d3.scaleLinear([0, maxTotal], [H - 34, 12]).nice();
    const ticks = y.ticks(4);
    const ml = Math.ceil(d3.max(ticks, (t) => textWidth(svg, fmtInt(t), 11))) + 10;
    const x = d3.scaleBand(rows.map((r) => r.date), [ml, W - 6]).paddingInner(0.32).paddingOuter(0.12);
    svg.append('g').attr('transform', `translate(${ml - 6},0)`).call(d3.axisLeft(y).tickValues(ticks).tickSize(-(W - ml)).tickFormat(fmtInt)).call(cleanAxis)
      .call((g) => g.selectAll('line').style('stroke', 'var(--cds-chart-grid)')).call((g) => g.selectAll('text').style('fill', 'var(--color-fg-muted)').attr('font-size', 11));
    svg.append('g').attr('transform', `translate(0,${H - 34})`).call(d3.axisBottom(x).tickSize(0).tickFormat((v) => fmtDay(parseDay(v)))).call(cleanAxis)
      .call((g) => g.selectAll('text').style('fill', (v) => (byD.has(v) ? 'var(--color-fg)' : 'var(--color-fg-muted)')).attr('font-size', 11).attr('dy', '1.3em'));
    const bw = x.bandwidth();
    for (const r of rows) {
      let acc = 0;
      const g = svg.append('g').attr('class', 'bar').style('cursor', r.has ? 'pointer' : 'default');
      for (const kk of KEYS) {
        const v = Math.max(0, r[kk]); if (!v) continue;
        const y1 = y(acc + v), y0 = y(acc);
        const rect = g.append('rect').attr('x', x(r.date)).attr('width', bw).style('fill', colorOf[kk]()).attr('rx', 3);
        if (animate && DUR) rect.attr('y', y(0)).attr('height', 0).transition().duration(DUR).ease(d3.easeCubicOut).attr('y', y1).attr('height', y0 - y1);
        else rect.attr('y', y1).attr('height', y0 - y1);
        acc += v;
      }
      if (!r.has) g.append('text').attr('x', x(r.date) + bw / 2).attr('y', y(0) - 6).attr('text-anchor', 'middle').attr('font-size', 10).style('fill', 'var(--color-fg-muted)').text('no runs');
      if (r.has && r.date === day) g.append('rect').attr('x', x(r.date) - 3).attr('y', y(acc) - 3).attr('width', bw + 6).attr('height', y(0) - y(acc) + 6).attr('fill', 'none').style('stroke', 'var(--p-ruby)').attr('stroke-width', 2).attr('rx', 5);
      g.append('rect').attr('x', x(r.date)).attr('y', 12).attr('width', bw).attr('height', H - 46).attr('fill', 'transparent')
        .on('mousemove', (evt) => { if (!r.has) { tipc.hide(); return; } tipc.show(evt, `<div class="t">${esc(fmtDayLong(r.d))}</div>${tipRow(null, 'Requested', fmtInt(r.requested))}${KEYS.map((kk) => tipRow(colorOf[kk](), NAMES[kk], fmtInt(r[kk]))).join('')}${tipRow(null, 'Failed', fmtInt(r.failed))}`); })
        .on('mouseleave', () => tipc.hide())
        .on('click', () => { if (!r.has) return; dash.setParams({ day: r.date }); openRecords({ day: r.date }); });
    }
    legend.innerHTML = KEYS.map((kk) => `<span><i style="background:${colorOf[kk]()}"></i>${NAMES[kk]}</span>`).join('') + `<span style="margin-left:auto">${day ? 'Selected: <b>' + esc(fmtDay(parseDay(day))) + '</b>' : 'Click a bar: breakdown below + records in the sheet'}</span>`;
    return rows.filter((r) => r.has).map((r) => ({ date: r.date, requested: r.requested }));
  }

  function renderDonut(k, animate) {
    const box = $('#donut-chart'), legend = $('#donut-legend');
    if (!k) { box.classList.add('dash-skeleton'); box.querySelectorAll('svg, .donut-center').forEach((n) => n.remove()); legend.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const W = Math.max(200, Math.min(300, box.clientWidth)), R = W / 2;
    box.querySelectorAll('svg, .donut-center').forEach((n) => n.remove());
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${W}`).attr('width', '100%').style('max-width', W + 'px').style('margin', '0 auto');
    const data = KEYS.map((kk) => ({ key: kk, value: Math.max(0, n0(k[kk])) }));
    const total = d3.sum(data, (d) => d.value);
    const arc = d3.arc().innerRadius(R * 0.68).outerRadius(R - 4).cornerRadius(4).padAngle(0.02);
    const pie = d3.pie().value((d) => d.value).sort(null);
    const g = svg.append('g').attr('transform', `translate(${R},${R})`);
    const tipc = tooltipFor(box);
    const paths = g.selectAll('path').data(pie(total ? data : data.map((d) => ({ ...d, value: 0 })))).join('path').style('fill', (d) => colorOf[d.data.key]())
      .on('mousemove', (evt, d) => tipc.show(evt, `<div class="t">${esc(k.label)}</div>${tipRow(colorOf[d.data.key](), NAMES[d.data.key], fmtInt(d.data.value) + (total ? ' · ' + fmtPct(d.data.value / total) : ''))}`))
      .on('mouseleave', () => tipc.hide())
      .style('cursor', 'pointer')
      .on('click', (evt, d) => openRecords({ ...weekP(k), status: d.data.key === 'successful' ? 'success' : 'failed' }));
    if (!total) g.append('circle').attr('r', R - 4).attr('fill', 'none').style('stroke', 'var(--p-bar-muted)').attr('stroke-width', R * 0.3);
    if (animate && DUR) paths.transition().duration(DUR).ease(d3.easeCubicOut).attrTween('d', (d) => { const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d); return (t) => arc(i(t)); });
    else paths.attr('d', arc);
    const center = document.createElement('div'); center.className = 'donut-center'; center.style.height = box.clientHeight ? box.clientHeight + 'px' : W + 'px';
    center.innerHTML = `<div class="big good" data-source="week_kpis" data-field="overall_success" data-where="week_start=${enc(k.week_start)}">${esc(fmtPct(k.overall_success))}</div><div class="small">overall success</div>`;
    box.appendChild(center);
    const LEG = { successful: 'Successful', data_issue: 'Data issues <span class="tag tag-red">Not the bot</span>', actual_failure: 'Bot failures' };
    legend.innerHTML = KEYS.map((kk) => `<span><i class="sw" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colorOf[kk]()};margin-right:6px;vertical-align:-1px"></i>${LEG[kk]}</span><span class="n" data-source="weeks" data-field="${kk}" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(n0(k[kk])))}</span><span class="p">${total ? esc(fmtPct(Math.max(0, n0(k[kk])) / total)) : ''}</span>`).join('')
      + `<span class="tot" title="Successful + data issues"><i class="sw" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${css('--p-green')};margin-right:6px;vertical-align:-1px"></i>Handled correctly</span><span class="n tot" data-source="week_kpis" data-field="handled" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(k.handled))}</span><span class="p tot good" data-source="week_kpis" data-field="overall_success" data-where="week_start=${enc(k.week_start)}">${esc(fmtPct(k.overall_success))}</span>`;
  }

  function renderBreakdownTable() {
    const { bd, rates, k } = state.cache;
    const tbody = $('#bd-table tbody'), cnt = $('#bd-count');
    if (!bd) { tbody.replaceChildren(); cnt.textContent = ''; return; }
    let rows = bd.map((r) => ({ ...r, success_rate: rates.get(r.key)?.success_rate ?? 0 }));
    if (state.search) rows = rows.filter((r) => (r.state + ' ' + r.service + ' ' + r.notes).toLowerCase().includes(state.search));
    const { col, dir } = state.sort;
    rows.sort((a, b) => { const va = a[col], vb = b[col]; if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir || byKey(a, b); return (n0(va) - n0(vb)) * dir || byKey(a, b); });
    function byKey(a, b) { return a.state.localeCompare(b.state) || a.service.localeCompare(b.service); }
    for (const th of $$('#bd-table th')) { const b = th.querySelector('button'); if (!b) continue; if (b.dataset.sort === col) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort'); }
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr'); tr.dataset.key = r.key; tr.style.cursor = 'pointer'; tr.title = TITLE_RECORDS;
      const num = (v, cls) => { const td = document.createElement('td'); td.className = 'n' + (cls ? ' ' + cls : '') + (n0(v) === 0 ? ' zero' : ''); td.textContent = fmtInt(n0(v)); return td; };
      const txt = (v, cls) => { const td = document.createElement('td'); td.className = cls || ''; td.textContent = v ?? ''; return td; };
      tr.append(txt(r.state, 'state'), txt(r.service, 'svc'), num(r.requested), num(r.attempted, 'narrow-hide'), num(r.successful, 'ok'), num(r.failed), num(r.data_issue), num(r.actual_failure));
      const rate = document.createElement('td'); rate.className = 'rate';
      rate.innerHTML = `<div class="ratebar ${r.success_rate >= 0.8 ? 'hi' : ''}"><div class="bar"><i></i></div><span>${esc(fmtPct(r.success_rate))}</span></div>`;
      tr.appendChild(rate);
      tr.appendChild(txt(r.notes, 'notes'));
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
    requestAnimationFrame(() => { for (const tr of tbody.children) { const i = tr.querySelector('.ratebar i'); const r = rows[Array.prototype.indexOf.call(tbody.children, tr)]; if (i && r) i.style.width = (r.success_rate * 100).toFixed(1) + '%'; } });
    let tfoot = $('#bd-table tfoot');
    if (!tfoot) { tfoot = document.createElement('tfoot'); $('#bd-table').appendChild(tfoot); }
    if (k && !state.search) {
      const m = (f, v) => `<td class="n" data-source="weeks" data-field="${f}" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(n0(v)))}</td>`;
      tfoot.innerHTML = `<tr class="total"><td>Total</td><td class="svc">All services</td>${m('requested', k.requested)}<td class="n narrow-hide" data-source="weeks" data-field="attempted" data-where="week_start=${enc(k.week_start)}">${esc(fmtInt(k.attempted))}</td>${m('successful', k.successful)}${m('failed', k.failed)}${m('data_issue', k.data_issue)}${m('actual_failure', k.actual_failure)}<td class="rate"><div class="ratebar ${k.success_rate >= 0.8 ? 'hi' : ''}"><div class="bar"><i style="width:${(k.success_rate * 100).toFixed(1)}%"></i></div><span data-source="week_kpis" data-field="success_rate" data-where="week_start=${enc(k.week_start)}">${esc(fmtPct(k.success_rate))}</span></div></td><td></td></tr>`;
    } else tfoot.replaceChildren();
    cnt.textContent = `${rows.length} of ${bd.length} lines` + (state.search ? ' match' : '');
  }

  function renderHBars(box, rows, opts) {
    box.replaceChildren();
    if (!rows) { box.classList.add('dash-skeleton'); box.style.minHeight = '200px'; return; }
    box.classList.remove('dash-skeleton'); box.style.minHeight = '';
    if (!rows.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = opts.empty; box.appendChild(p); return; }
    const max = Math.max(1, d3.max(rows, opts.value));
    for (const r of rows) {
      const div = document.createElement('div'); div.className = 'hbar'; div.style.setProperty('--bc', opts.color(r));
      const name = document.createElement('span'); name.className = 'name'; name.textContent = opts.name(r); name.title = opts.name(r);
      const v = document.createElement('span'); v.className = 'v';
      v.setAttribute('data-source', opts.source); v.setAttribute('data-field', opts.field); v.setAttribute('data-where', `key=${enc(r.key)}`);
      v.textContent = opts.label(r);
      const track = document.createElement('div'); track.className = 'track'; const fill = document.createElement('i'); track.appendChild(fill);
      div.append(name, v);
      if (opts.sub) { const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = opts.sub(r); sub.title = opts.sub(r); div.appendChild(sub); }
      div.appendChild(track);
      if (opts.onClick) { div.style.cursor = 'pointer'; div.title = TITLE_RECORDS; div.addEventListener('click', () => opts.onClick(r)); }
      box.appendChild(div);
      const pct = opts.scale === 'rate' ? opts.value(r) * 100 : (opts.value(r) / max) * 100;
      requestAnimationFrame(() => { fill.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; });
    }
  }

  function renderTrend(K, week, animate) {
    const box = $('#trend-chart'), legend = $('#trend-legend');
    if (!K.length || !week) { box.classList.add('dash-skeleton'); box.querySelectorAll('svg').forEach((n) => n.remove()); legend.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const win = weekWindow(K, week, 12);
    $('#trend-sub').textContent = win.length ? `${fmtShort(parseDay(win[0].week_start))} – ${fmtShort(parseDay(win[win.length - 1].week_end))} (${win.length} weeks)` : '';
    const W = Math.max(300, box.clientWidth), H = 300, tipc = tooltipFor(box);
    box.querySelectorAll('svg').forEach((n) => n.remove());
    const svg = d3.select(box).insert('svg', ':first-child').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const maxTotal = Math.max(1, d3.max(win, (r) => KEYS.reduce((s, kk) => s + Math.max(0, r[kk]), 0)));
    const y = d3.scaleLinear([0, maxTotal], [H - 40, 14]).nice();
    const y2 = d3.scaleLinear([0, 1], [H - 40, 14]);
    const ticks = y.ticks(4);
    const ml = Math.ceil(d3.max(ticks, (t) => textWidth(svg, fmtInt(t), 11))) + 10;
    const mr = Math.ceil(textWidth(svg, '100%', 11)) + 10;
    const x = d3.scaleBand(win.map((r) => r.week_start), [ml, W - mr]).paddingInner(0.34).paddingOuter(0.15);
    svg.append('g').attr('transform', `translate(${ml - 6},0)`).call(d3.axisLeft(y).tickValues(ticks).tickSize(-(W - ml - mr + 6)).tickFormat(fmtInt)).call(cleanAxis)
      .call((g) => g.selectAll('line').style('stroke', 'var(--cds-chart-grid)')).call((g) => g.selectAll('text').style('fill', 'var(--color-fg-muted)').attr('font-size', 11));
    svg.append('g').attr('transform', `translate(${W - mr + 6},0)`).call(d3.axisRight(y2).tickValues([0, .25, .5, .75, 1]).tickSize(0).tickFormat(fmtPct0)).call(cleanAxis)
      .call((g) => g.selectAll('text').style('fill', 'var(--color-fg-muted)').attr('font-size', 11));
    const every = win.length > 8 ? 2 : 1;
    svg.append('g').attr('transform', `translate(0,${H - 40})`).call(d3.axisBottom(x).tickSize(0).tickFormat((v, i) => (i % every === 0 || v === week ? fmtWeekTick(parseDay(v)) : ''))).call(cleanAxis)
      .call((g) => g.selectAll('text').style('fill', (v) => (v === week ? 'var(--color-fg)' : 'var(--color-fg-muted)')).attr('font-weight', (v) => (v === week ? 700 : 400)).attr('font-size', 11).attr('dy', '1.3em'));
    const bw = x.bandwidth();
    for (const r of win) {
      let acc = 0; const g = svg.append('g');
      for (const kk of KEYS) {
        const v = Math.max(0, r[kk]); if (!v) continue;
        const y1 = y(acc + v), y0 = y(acc);
        const rect = g.append('rect').attr('x', x(r.week_start)).attr('width', bw).style('fill', colorOf[kk]()).attr('rx', 3).attr('opacity', r.week_start === week ? 1 : .55);
        if (animate && DUR) rect.attr('y', y(0)).attr('height', 0).transition().duration(DUR).ease(d3.easeCubicOut).attr('y', y1).attr('height', y0 - y1);
        else rect.attr('y', y1).attr('height', y0 - y1);
        acc += v;
      }
      if (r.week_start === week) g.append('rect').attr('x', x(r.week_start) - 3).attr('y', y(acc) - 3).attr('width', bw + 6).attr('height', y(0) - y(acc) + 6).attr('fill', 'none').style('stroke', 'var(--p-navy)').attr('stroke-width', 1.5).attr('stroke-dasharray', '3 3').attr('rx', 5);
      g.append('rect').attr('x', x(r.week_start)).attr('y', 14).attr('width', bw).attr('height', H - 54).attr('fill', 'transparent').style('cursor', 'pointer')
        .on('mousemove', (evt) => tipc.show(evt, `<div class="t">${esc(r.label)}</div>${tipRow(null, 'Requested', fmtInt(r.requested))}${KEYS.map((kk) => tipRow(colorOf[kk](), NAMES[kk], fmtInt(r[kk]))).join('')}${tipRow(css('--p-green'), 'Overall success', fmtPct(r.overall_success))}${tipRow(css('--p-cerulean'), 'Success rate', fmtPct(r.success_rate))}`))
        .on('mouseleave', () => tipc.hide())
        .on('click', () => dash.setParams({ week: r.week_start, day: null }));
    }
    const lineCol = css('--p-cerulean'), okCol = css('--p-green');
    const rateLine = d3.line().x((r) => x(r.week_start) + bw / 2).y((r) => y2(r.success_rate));
    const okLine = d3.line().x((r) => x(r.week_start) + bw / 2).y((r) => y2(r.overall_success));
    svg.append('path').attr('d', rateLine(win)).attr('fill', 'none').style('stroke', lineCol).attr('stroke-width', 2).attr('stroke-dasharray', '5 4').attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('opacity', .9);
    const path = svg.append('path').attr('d', okLine(win)).attr('fill', 'none').style('stroke', okCol).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    if (animate && DUR) { const L = path.node().getTotalLength(); path.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(DUR).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', () => path.attr('stroke-dasharray', null)); }
    svg.selectAll('circle.pt').data(win).join('circle').attr('class', 'pt').attr('cx', (r) => x(r.week_start) + bw / 2).attr('cy', (r) => y2(r.overall_success)).attr('r', (r) => (r.week_start === week ? 4.5 : 3)).style('fill', okCol).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    const last = win[win.length - 1];
    const anchor = x(last.week_start) > W - mr - 60 ? 'end' : 'start';
    svg.append('text').attr('x', x(last.week_start) + bw / 2 + 8).attr('y', y2(last.overall_success) - 8).attr('font-size', 11).attr('font-weight', 700).style('fill', okCol).attr('text-anchor', anchor).text(fmtPct(last.overall_success));
    legend.innerHTML = KEYS.map((kk) => `<span><i style="background:${colorOf[kk]()}"></i>${NAMES[kk]}</span>`).join('') + `<span><i style="background:${okCol};border-radius:50%"></i>Overall success (right axis)</span><span><i style="background:${lineCol};border-radius:50%"></i>Success rate</span><span style="margin-left:auto">Click a week to open it</span>`;
  }

  function renderHeat(dailyD, W, week) {
    const box = $('#heat');
    if (dailyD.status !== 'ok' || !W.length || !week) { stateBox(box, dailyD, 120); return; }
    box.classList.remove('dash-skeleton');
    const win = weekWindow(W, week, 12);
    const byD = new Map(dailyD.data.map((r) => [String(r.date).slice(0, 10), n0(r.requested)]));
    const max = Math.max(1, d3.max(win, (w) => d3.max(d3.range(7), (i) => { const d = parseDay(w.week_start); d.setUTCDate(d.getUTCDate() + i); return byD.get(isoDay(d)) || 0; })));
    const base = resolveColor('var(--color-panel)') || [255, 255, 255], top = resolveColor('var(--p-blue)') || [0, 146, 188];
    const ramp = d3.interpolateRgb(`rgb(${base.join(',')})`, `rgb(${top.join(',')})`);
    const day = dash.params().day;
    const frag = document.createDocumentFragment();
    const corner = document.createElement('div'); corner.className = 'h'; frag.appendChild(corner);
    for (const n of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) { const h = document.createElement('div'); h.className = 'h'; h.textContent = n; frag.appendChild(h); }
    for (const w of win) {
      const wl = document.createElement('div'); wl.className = 'wl'; wl.textContent = fmtShort(parseDay(w.week_start)); wl.style.fontWeight = w.week_start === week ? '700' : '400'; frag.appendChild(wl);
      for (let i = 0; i < 7; i++) {
        const d = parseDay(w.week_start); d.setUTCDate(d.getUTCDate() + i); const key = isoDay(d);
        const c = document.createElement('div'); c.className = 'c';
        if (!byD.has(key)) { c.classList.add('empty'); c.textContent = '·'; }
        else {
          const v = byD.get(key); const t = Math.sqrt(v / max);
          c.style.background = ramp(0.08 + 0.92 * t); c.style.color = t > 0.55 ? '#fff' : 'var(--color-fg)';
          c.textContent = fmtInt(v); c.title = `${fmtDayLong(d)}: ${fmtInt(v)} requested`;
          if (key === day) c.classList.add('sel');
          c.title = `${fmtDayLong(d)}: ${fmtInt(v)} requested — click to open the records`;
          c.addEventListener('click', () => { dash.setParams({ week: w.week_start, day: key }); openRecords({ day: key }); });
        }
        frag.appendChild(c);
      }
    }
    box.replaceChildren(frag);
  }

  function renderDrill(ddD, dailyD, day) {
    const card = $('#dd-card');
    if (!day) { card.hidden = true; return; }
    card.hidden = false;
    $('#dd-title').textContent = fmtDayLong(parseDay(day));
    const dr = dailyD.status === 'ok' ? dailyD.data.find((r) => String(r.date).slice(0, 10) === day) : null;
    const sub = $('#dd-sub');
    if (dr) {
      const m = (f, v) => `<span data-source="daily" data-field="${f}" data-where="date=${enc(day)}">${esc(fmtInt(n0(v)))}</span>`;
      sub.innerHTML = `${m('requested', dr.requested)} requested · ${m('successful', dr.successful)} successful · ${m('failed', dr.failed)} failed (${m('data_issue', dr.data_issue)} data issues, ${m('actual_failure', dr.actual_failure)} actual bot failures)`;
    } else sub.textContent = '';
    const tbody = $('#dd-table tbody');
    if (ddD.status !== 'ok') { tbody.replaceChildren(); return; }
    const rows = ddD.data.filter((r) => String(r.date).slice(0, 10) === day).sort((a, b) => n0(b.requested) - n0(a.requested) || a.state.localeCompare(b.state));
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr'); tr.dataset.key = r.key; tr.style.cursor = 'pointer'; tr.title = TITLE_RECORDS;
      const num = (v, cls) => { const td = document.createElement('td'); td.className = 'n' + (cls ? ' ' + cls : '') + (n0(v) === 0 ? ' zero' : ''); td.textContent = fmtInt(n0(v)); return td; };
      const txt = (v, cls) => { const td = document.createElement('td'); td.className = cls || ''; td.textContent = v ?? ''; return td; };
      tr.append(txt(r.state, 'state'), txt(r.service, 'svc'), num(r.requested), num(r.attempted, 'narrow-hide'), num(r.successful, 'ok'), num(r.failed), num(r.data_issue), num(r.actual_failure), txt(r.notes, 'notes'));
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
    if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 9; td.className = 'zero'; td.textContent = 'No daily tab for this date in the sheet.'; tr.appendChild(td); tbody.appendChild(tr); }
  }

  function renderNotes(notesD, week) {
    const sec = $('#notes-sec'), p = $('#notes-text');
    const row = notesD.status === 'ok' ? notesD.data.find((r) => String(r.week_start).slice(0, 10) === week) : null;
    if (!row || !String(row.note || '').trim()) { sec.hidden = true; return; }
    sec.hidden = false; setWhere(p, 'week_start', week); p.textContent = row.note;
  }

  function renderMeta(metaD) {
    const el = $('#meta-line span[data-source="meta"]'), pill = $('#status-pill');
    if (metaD.status !== 'ok' || !metaD.data.length) { el.textContent = '—'; if (pill) pill.classList.remove('live'); return; }
    const at = metaD.data[0].generated_at;
    const d = new Date(at);
    el.textContent = isNaN(d) ? String(at) : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    if (pill) pill.classList.toggle('live', !isNaN(d) && Date.now() - d.getTime() < 9 * 86400000);
  }
  // section navigation (no hash changes: the hash carries the week/day)
  const subnav = $('#subnav');
  if (subnav) {
    subnav.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-go]'); if (!b) return;
      const el = document.getElementById(b.dataset.go); if (!el) return;
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    const setOn = (id) => { for (const b of subnav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.go === id); };
    try {
      const targets = Array.from(subnav.querySelectorAll('button')).map((b) => document.getElementById(b.dataset.go)).filter(Boolean);
      let current = targets[0] && targets[0].id;
      const io = new IntersectionObserver((entries) => {
        const vis = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis.length) { current = vis[0].target.id; setOn(current); }
      }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
      targets.forEach((t) => io.observe(t));
    } catch (e) { /* older browsers: the buttons still scroll */ }
  }

  // ---------- main ----------
  function draw(fromData) {
    applyTheme();
    const weeksD = dash.data('weeks'), kpisD = dash.data('week_kpis'), dailyD = dash.data('daily'), bdD = dash.data('weekly_breakdown');
    const ratesD = dash.data('breakdown_rates'), svcD = dash.data('service_rates'), reasD = dash.data('reasons_by_week');
    const ddD = dash.data('daily_breakdown'), notesD = dash.data('notes'), metaD = dash.data('meta');
    const W = weeksD.status === 'ok' ? weeksD.data.slice().sort(byWeek) : [];
    const K = kpisD.status === 'ok' ? kpisD.data.slice().sort(byWeek) : [];
    let week = dash.params().week || null;
    if (W.length && (!week || !W.some((w) => w.week_start === week))) { week = W[W.length - 1].week_start; dash.setParams({ week, day: null }); }
    const day = dash.params().day || null;
    const weekChanged = week !== state.lastWeek;
    const animate = fromData && (state.firstDraw || weekChanged);
    state.week = week; state.cache.W = W;
    const k = K.find((r) => r.week_start === week) || null;
    const bd = bdD.status === 'ok' && week ? bdD.data.filter((r) => r.week_start === week) : [];
    const rates = new Map(ratesD.status === 'ok' ? ratesD.data.filter((r) => r.week_start === week).map((r) => [r.key, r]) : []);
    state.cache.bd = bdD.status === 'ok' && week ? bd : null; state.cache.rates = rates; state.cache.k = k;
    state.cache.bdMap = new Map(bd.map((r) => [r.key, r]));
    state.cache.ddMap = new Map(ddD.status === 'ok' && day ? ddD.data.filter((r) => String(r.date).slice(0, 10) === day).map((r) => [r.key, r]) : []);

    renderNav(W, week);
    renderMeta(metaD);
    renderTakeaway(k, animate);
    renderKpis(k, W, K, animate);
    const dailyRows = renderDaily(dailyD, week, k, animate);
    renderDonut(k, animate);
    renderHighlights(k, bd, rates, dailyRows);
    renderBreakdownTable();
    renderHBars($('#svc-bars'), svcD.status === 'ok' && week ? svcD.data.filter((r) => r.week_start === week).sort((a, b) => n0(b.requested) - n0(a.requested)).slice(0, 10) : null,
      { source: 'service_rates', field: 'success_rate', value: (r) => n0(r.success_rate), scale: 'rate', name: (r) => r.service, label: (r) => fmtPct(n0(r.success_rate)), sub: (r) => `${fmtInt(r.successful)} of ${fmtInt(r.requested)} completed · ${fmtInt(r.failed)} failed`, color: (r) => (n0(r.success_rate) >= 0.8 ? css('--p-green') : n0(r.success_rate) >= 0.5 ? css('--p-blue') : css('--p-amber')), empty: 'No services this week.',
        onClick: (r) => openRecords({ ...weekP(k), service: r.service }) });
    renderHBars($('#reason-bars'), reasD.status === 'ok' && week ? reasD.data.filter((r) => r.week_start === week).sort((a, b) => n0(b.count) - n0(a.count)).slice(0, 8) : null,
      { source: 'reasons_by_week', field: 'count', value: (r) => n0(r.count), scale: 'max', name: (r) => r.reason, label: (r) => fmtInt(r.count), sub: (r) => r.services, color: () => css('--p-navy'), empty: 'No failed bot runs recorded this week.',
        onClick: (r) => { const needle = String(r.reason).replace(/…$/, '').split(' - Please')[0].slice(0, 70); openRecords({ ...weekP(k), status: 'failed', reason: /^(Unspecified|No failure)/.test(needle) ? '' : needle }); } });
    renderTrend(K, week, animate);
    renderHeat(dailyD, W, week);
    renderDrill(ddD, dailyD, day);
    renderNotes(notesD, week);
    if (W.length) { state.lastWeek = week; state.firstDraw = false; }
  }
  redrawFn = draw;
  dash.onData(() => draw(true));
})();
