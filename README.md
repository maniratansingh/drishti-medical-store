# Drishti Medical Store (दृष्टि मेडिकल स्टोर) — DMS

Static ophthalmic discovery and availability enquiry website for **Drishti Medical Store** (`https://dms.piecs.org/`), hosted on **Cloudflare Pages + Pages Functions** with zero build tooling.

## Business Identity & Store Policy

- **Business Name:** Drishti Medical Store
- **Hindi Name:** दृष्टि मेडिकल स्टोर
- **Abbreviation:** DMS
- **Pickup Billing:** Official itemized bill provided on every counter pickup
- **Website:** `https://dms.piecs.org/` (`llms.txt` available at `/llms.txt`)
- **Address:** Sant Kabir Eye Hospital, Bansi Road, Near Pindari Hospital, Katra, Basti, Uttar Pradesh – 272001, India
- **Enquiry-Only Counter Pickup:** No online ordering, no online payments, and no home delivery. This site helps local patients and hospital visitors check product availability before physical counter pickup.
- **No Prescribing & Prescription Requirement:** The store does not prescribe any medicine in any form; listings are strictly informational examples of ophthalmic products. No prescription medicine is provided without a valid written prescription from a licensed doctor / legal practitioner (ophthalmologist prescription recommended), which must also be brought at pickup.

## Configuring Telegram Counter Alerts (Cloudflare Pages Functions)

Enquiries submitted from **Find Your Eye Medicine** post JSON to `/api/enquiry` (`functions/api/enquiry.js`). Never place Telegram credentials in frontend code. Configure these environment secrets in **Cloudflare Dashboard → Workers & Pages → Project Settings → Variables and Secrets**:

- `TELEGRAM_BOT_TOKEN`: Bot token from `@BotFather`
- `TELEGRAM_CHAT_ID`: Staff Telegram user or group chat ID receiving enquiries
- *(Optional)* `ENQUIRIES_KV` KV namespace binding for 30-day enquiry log retention

## Configuring Optional Store WhatsApp / Email Backup

In `app.js`, update `STORE_CONFIG` if you also want optional local fallback links exposed when `/api/enquiry` is offline or unconfigured:

```js
const STORE_CONFIG = {
  ...
  whatsappNumber: '9198XXXXXXXX', // 10+ digits with country code
  storeEmail: 'contact@dms.piecs.org'
};
```

Until Telegram secrets (or fallback contact channels) are configured, unconfigured environments generate an Enquiry Reference (`ENQ-...`), save a local copy on the customer's device, and offer **Copy Enquiry** / **Download (.txt)** backup so no search is lost.

## Cloudflare Workers + Static Assets Deployment (Default `npx wrangler deploy`)

This project is pre-configured via `wrangler.jsonc` (`main: "src/worker.js"`, `assets.directory: "./public"`) so both **Cloudflare Git Integration** (`npx wrangler deploy`) and **Wrangler CLI** deploy static files and `/api/enquiry` cleanly with zero manual build flags:

```sh
npx wrangler deploy
```

### Cloudflare Git Integration Settings
- **Build command:** *(empty)*
- **Deploy command:** `npx wrangler deploy` (Cloudflare default)

### Classic Cloudflare Pages Only (If explicitly deploying Static Assets without `wrangler.jsonc`)
- **Build output directory:** `public`

## Included Files

- `wrangler.jsonc` — Cloudflare Workers + Static Assets configuration (`main: "src/worker.js"`, `assets.directory: "./public"`).
- `src/worker.js` — Cloudflare Worker handling `POST /api/enquiry` Telegram alerts (plus static asset fallback via `env.ASSETS`).
- `public/index.html` — Landing page, search-first **Find Your Eye Medicine** availability enquiry system, featured ophthalmic catalogue showcase, store pickup details, and `LocalBusiness`/`Pharmacy` JSON-LD.
- `public/assets/data/ophthalmic-products.json` — Locally indexed Indian ophthalmic product catalogue (`4,291` active items) compiled from MIT-licensed [`junioralive/Indian-Medicine-Dataset`](https://github.com/junioralive/Indian-Medicine-Dataset) and [`indiser/Rxcheck`](https://github.com/indiser/Rxcheck).
- `public/styles.css` & `public/app.js` — Light/dark responsive stylesheet and client-side hybrid inverted-index ophthalmic search engine.
- `tests/search-regression.mjs` — Repeatable 38-case automated search accuracy, relevance, and latency regression suite (`node tests/search-regression.mjs`).
- `public/sitemap.xml`, `public/robots.txt`, `public/_headers`, `public/_redirects`, `public/404.html`, `public/favicon.svg`, `public/manifest.webmanifest`, and `public/assets/images/`.
