# Website tests

Browser tests for trainwithmk9.com. They open the site in your installed Chrome and check
that it loads cleanly, that private files stay private, the SEO tags, every in-page link,
the hero and corner dogs (cursor, scroll, blink bubble, click-through), phone layouts,
reduced motion, the no-WebGL fallback, and the contact form.

The contact form tests intercept every request, so they never send a real lead or email.

This folder starts with `_`, so GitHub Pages does not publish it.

## Run against the live site

```powershell
uv run --no-project --with pytest --with playwright --with pillow pytest _tests -q
```

Run it from the `mk9` folder. It takes about 4 minutes.

## Run against your local copy before deploying

In one terminal, serve the site:

```powershell
uv run python -m http.server 8767 --bind 127.0.0.1
```

In another, point the tests at it:

```powershell
$env:MK9_SITE = "http://127.0.0.1:8767/"
uv run --no-project --with pytest --with playwright --with pillow pytest _tests -q
Remove-Item Env:MK9_SITE
```

The private-files test is skipped locally, because only GitHub Pages applies the publish rules.
