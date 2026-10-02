# MK9 Training — trainwithmk9.com

Static site. No build step, no dependencies beyond Google Fonts.

| File | Purpose |
|------|---------|
| `index.html` | Page content and structure |
| `styles.css` | Design system and layout |
| `script.js` | Navigation, scroll reveals, FAQ, contact form, analytics |
| `card/` | Digital business card |
| `automation/` | Apps Script lead tracker |

## Local preview

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploying

Pushing to `main` publishes to trainwithmk9.com via GitHub Pages.

`index.html` loads `styles.css?v=N` and `script.js?v=N`. **Bump both numbers together
whenever either file changes** — GitHub Pages serves with `max-age=600`, so without it a
returning visitor can run stale CSS or JS against fresh HTML.

## Analytics

`script.js` sets `GA4_MEASUREMENT_ID` and `META_PIXEL_ID` at the top. Both are empty by
default and nothing loads until they are filled in. Adding a tag also means adding its host
to the Content-Security-Policy in `index.html`.
