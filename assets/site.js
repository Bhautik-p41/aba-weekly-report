/* Standalone runtime for the ABA Entity Pilot Bots weekly report.
   Loads data/*.json, keeps the selected week/day in the URL hash, and exposes the small
   `dash` API the report code (app.js) was written against. No external services. */
(function () {
  'use strict';
  const DATASETS = ['daily', 'weeks', 'weekly_breakdown', 'daily_breakdown', 'failure_reasons', 'notes', 'meta'];
  const store = {};
  const calcs = {};
  const listeners = [];
  let params = { week: null, day: null };
  let loadedOnce = false;

  // ---- theme: light / dark, remembered per browser ----
  const root = document.documentElement;
  function preferred() {
    try { const saved = localStorage.getItem('aba-theme'); if (saved === 'light' || saved === 'dark') return saved; } catch (e) { /* ignore */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyThemeAttr(mode, remember) {
    root.setAttribute('data-theme', mode);
    if (remember) { try { localStorage.setItem('aba-theme', mode); } catch (e) { /* ignore */ } }
    const btn = document.getElementById('theme-toggle');
    if (btn) { btn.textContent = mode === 'dark' ? '☀ Light' : '☾ Dark'; btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); }

    const app = document.querySelector('.p41');
    if (app) app.classList.toggle('is-dark', mode === 'dark');
  }
  applyThemeAttr(preferred(), false);
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => applyThemeAttr(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));
    applyThemeAttr(root.getAttribute('data-theme') || preferred(), false);
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { try { if (!localStorage.getItem('aba-theme')) applyThemeAttr(preferred(), false); } catch (e) { /* ignore */ } });

  // ---- URL hash <-> params ----
  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const w = h.get('week'), d = h.get('day');
    params = { week: /^\d{4}-\d{2}-\d{2}$/.test(w || '') ? w : null, day: /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null };
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (params.week) h.set('week', params.week);
    if (params.day) h.set('day', params.day);
    const s = h.toString();
    const url = location.pathname + location.search + (s ? '#' + s : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }
  readHash();
  window.addEventListener('hashchange', () => { readHash(); notify(); });

  // ---- data ----
  const columnsOf = (rows) => (Array.isArray(rows) && rows.length ? Object.keys(rows[0]) : []);
  function safe(fn) { try { fn(); } catch (e) { console.error('report draw failed:', e); } }
  function notify() { for (const c of Object.values(calcs)) c.dirty = true; for (const fn of listeners) safe(fn); }
  function calcValue(id) {
    const c = calcs[id];
    const inputs = c.spec.inputs.map((i) => dash.data(i));
    if (inputs.some((d) => d.status !== 'ok')) return { status: inputs.some((d) => d.status === 'error') ? 'error' : 'loading', data: [], columns: [] };
    if (c.dirty || !c.cache) {
      try { const out = c.spec.fn(...inputs.map((d) => d.data)); c.cache = { status: 'ok', data: out, columns: columnsOf(out) }; }
      catch (e) { c.cache = { status: 'error', data: [], columns: [], message: String(e) }; }
      c.dirty = false;
    }
    return c.cache;
  }
  const dash = {
    colors: ['#0092BC', '#0D3C72', '#05ACC8', '#E8A317', '#DB3063', '#1F9D6B', '#808285', '#0BE0E9'],
    data(id) {
      if (calcs[id]) return calcValue(id);
      return store[id] || { status: 'missing', data: [], columns: [] };
    },
    calc(id, spec) { calcs[id] = { spec, cache: null, dirty: true }; },
    loader() {},
    onData(fn) { listeners.push(fn); if (loadedOnce) safe(fn); },
    params() { return { ...params }; },
    setParams(p) { Object.assign(params, p || {}); writeHash(); notify(); },
    resetParams() { params = { week: null, day: null }; writeHash(); notify(); },
    setLink() {},
    refresh() {},
  };
  window.dash = dash;

  async function loadAll() {
    try { const r = await fetch('data/config.json', { cache: 'no-cache' }); if (r.ok) window.ABA_CONFIG = await r.json(); } catch (e) { window.ABA_CONFIG = window.ABA_CONFIG || {}; }
    for (const id of DATASETS) store[id] = { status: 'loading', data: [], columns: [] };
    await Promise.all(DATASETS.map(async (id) => {
      try {
        const r = await fetch(`data/${id}.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = await r.json();
        store[id] = { status: 'ok', data: Array.isArray(rows) ? rows : [], columns: columnsOf(rows) };
      } catch (e) {
        store[id] = { status: 'error', data: [], columns: [], message: String(e) };
      }
      loadedOnce = true;
      notify();
    }));
    loadedOnce = true;
    notify();
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { for (const fn of listeners) safe(fn); }, 120); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll); else loadAll();
})();
