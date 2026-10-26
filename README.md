# ABA Entity Pilot Bots — Weekly Report

Static weekly report site, hosted on GitHub Pages.

- `index.html` — the report page (never changes week to week)
- `assets/` — styles, fonts, report code (`app.js`), runtime (`site.js`), d3 v7 (BSD licence: `assets/d3.LICENSE`)
- `data/` — the report data, refreshed automatically every Monday from the Bot Weekly Report sheet:
  `daily.json`, `weeks.json`, `weekly_breakdown.json`, `daily_breakdown.json`, `failure_reasons.json`, `notes.json`, `meta.json`
- `data/config.json` — the records endpoint used when someone clicks a number, bar or row (opens the matching
  records in the "ABA Bot Records" Google Sheet, same columns as the source sheet)

## Hosting

Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
The site is then served at `https://<owner>.github.io/<repo>/`. Any custom domain works via a CNAME.

## Links

- Latest week: `https://<owner>.github.io/<repo>/`
- A specific week: `…/#week=2026-10-19` (Monday date)
- A specific day's breakdown: `…/#week=2026-10-19&day=2026-10-22`
