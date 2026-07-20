# MK9 Training — Website

A modern, patriotic, veteran-owned dog training website. Single-page, fully responsive,
zero build tools, zero external dependencies (just Google Fonts). Built to convert visitors
into free-assessment bookings.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All page content & structure |
| `styles.css` | Design system, layout, animations |
| `script.js` | Nav, mobile menu, scroll reveals, stat counters, FAQ, form |

## View it

Just double-click `index.html`, or for live-reload while editing:

```bash
# from this folder, any one of:
python -m http.server 8000      # then open http://localhost:8000
npx serve .
```

## Make it yours — quick checklist

Search `index.html` / `styles.css` for these and replace:

1. **Phone number** — `(000) 000-0000` and the `tel:+10000000000` links.
2. **Email** — `cali@trainwithmk9.com`.
3. **Location** — `Your Town, USA`.
4. **Photos** — there are two image slots:
   - **Hero photo** (`.hero__photo`) — a strong shot of you + a dog.
   - **About photo** (`.about__photo`) — training in action.
   - To add a photo, drop the file in this folder and in `styles.css` set, e.g.:
     ```css
     .hero__photo {
       background-image: url('hero-dog.jpg');
       background-size: cover;
       background-position: center;
     }
     ```
     (then remove the `.hero__photo-label` text in the HTML)
5. **Pricing** — currently "priced by assessment" / "case by case" on purpose. Add real
   numbers if/when you want them public.

## The contact form

Right now the form validates and shows a friendly confirmation, but does **not** send email
yet. To make it actually deliver leads, pick one (all free to start):

- **Formspree** — easiest. Sign up, then change the `<form>` tag in `index.html` to:
  `<form action="https://formspree.io/f/YOUR_ID" method="POST">` and remove the
  `e.preventDefault()` handling in `script.js`.
- **Netlify Forms** — if you host on Netlify, add `netlify` to the `<form>` tag.
- Your own CRM / booking tool (Calendly, etc.) — link the buttons straight to it.

## Brand colors (in `styles.css` `:root`)

- Navy `#0a1626` · Old Glory Blue `#0a3161`
- Old Glory Red `#c8102e`
- Gold accent `#d4af37` (the "premium" touch)

## Going live

Drag-and-drop the folder onto **Netlify Drop** (netlify.com/drop) or **Vercel**, or use
**GitHub Pages**. All free, all support a custom domain like `trainwithmk9.com`.

## Shipping changes to CSS or JS

`index.html` loads the stylesheet and script with a version tag:

```html
<link rel="stylesheet" href="styles.css?v=2" />
<script src="script.js?v=2"></script>
```

**Bump both numbers together whenever you edit `styles.css` or `script.js`.** The
changed URL is a different file as far as the browser is concerned, so it fetches
instead of reusing what it has.

This matters because GitHub Pages serves everything with `Cache-Control: max-age=600`.
Without the bump, a returning visitor can spend ten minutes running old CSS or JS
against new HTML — which is exactly how a contact form once appeared to work while
posting to an endpoint that had already been replaced.

Worth being clear about what this does not fix: `index.html` is cached for ten
minutes too, so a returning visitor may not see the new version tag straight away.
What the bump guarantees is that HTML and assets always move together, rather than
the page ending up with a mismatched pair. To confirm a deploy yourself, hard-refresh
with `Ctrl+Shift+R` (`Cmd+Shift+R` on a Mac), which bypasses the cache entirely.
