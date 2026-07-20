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
