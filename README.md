# Snapture — snap it, done

Point your camera at anything with text — a poster, a receipt, a business card,
a menu — and get it back as a **calendar event**, a **contact**, or **clean,
copyable text**. Runs **100% in the browser**: no account, no upload, no server,
works offline after the first scan.

One codebase → **every platform** (iOS, Android, desktop, web) as a PWA.

## Why this exists

"Works everywhere + costs nothing to run" forces a specific, good architecture:
a client-side Progressive Web App. No backend, no paid APIs, no app-store fees.
Recognition happens on the device (Tesseract.js), so it's private by default and
free to operate.

## How it works

1. **Capture** — native camera via `<input capture>` (works on every device),
   with a gallery fallback.
2. **Recognize** — Tesseract.js runs OCR in the browser (English + Russian).
3. **Understand** — `extract.js` classifies the text (event / contact / receipt /
   text) and pulls out dates, phones, emails, totals.
4. **Act** — one tap exports a `.ics` (calendar), `.vcf` (contact), copies a
   receipt total, or shares/saves the text. Edit the recognized text and the
   action updates live.

## Project layout

| File | Role |
|------|------|
| `index.html` | App shell + UI |
| `styles.css` | Design system (light/dark, mobile-first) |
| `app.js` | UI wiring + OCR orchestration |
| `extract.js` | **Pure logic** — parsing & file builders (unit-tested) |
| `tests/extract.test.mjs` | 21 unit tests, zero dependencies |
| `sw.js` | Service worker — offline cache |
| `manifest.webmanifest` | PWA install metadata |
| `server.mjs` | Zero-dep static server for local dev / self-host |

## Run locally

```bash
node server.mjs
# open http://localhost:4599
```

## Test

```bash
node --test
```

Uses Node's built-in test runner — no `npm install`, no dependencies.

## Deploy (zero cost)

Any static host works. Cloudflare Pages or GitHub Pages both have a free tier and
serve HTTPS (required for camera + service worker / installable PWA):

- **Cloudflare Pages:** connect the repo, build command *none*, output dir `/`.
- **GitHub Pages:** push to a repo, enable Pages on the branch root.

No environment variables, no secrets, no runtime cost.

## Monetization (planned)

Free forever: unlimited scans, copy/share, `.txt`/`.ics`/`.vcf` export.
**Pro** (batch scanning, scan history, multi-page PDF export) via a payment link
(Gumroad / Lemon Squeezy) — no fixed cost, global payouts. Hook lives in the
footer (`#proLink`).

## Known limits

- OCR targets **printed** text. Handwriting is out of scope for v1.
- First scan downloads the recognizer once (~a few MB), then caches for offline.
