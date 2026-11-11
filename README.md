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

## Cloudflare Pages Deployment (Static + `/functions`)

### Option 1: Direct Upload / Git Integration
- **Framework preset:** `None`
- **Build command:** *(empty)*
- **Build output directory:** `.` (`functions/api/enquiry.js` deploys automatically alongside static files)

### Option 2: Wrangler CLI
```sh
npx wrangler pages deploy . --project-name=drishti-medical-store
```

## Included Files

- `index.html` — Landing page, featured ophthalmic catalogue showcase, mobile-first **Find Your Eye Medicine** availability enquiry system, store pickup details, and `LocalBusiness`/`Pharmacy` JSON-LD.
- `functions/api/enquiry.js` — Cloudflare Pages Function validating customer enquiries and forwarding formatted alerts to Telegram.
- `assets/data/ophthalmic-products.json` — Locally indexed Indian ophthalmic product catalogue (`4,291` active eye drops, ophthalmic solutions, gels, ointments, oral ophthalmic tablets, Jan Aushadhi PMBJP generics, and curated eye-care supplies) compiled from MIT-licensed [`junioralive/Indian-Medicine-Dataset`](https://github.com/junioralive/Indian-Medicine-Dataset) and [`indiser/Rxcheck`](https://github.com/indiser/Rxcheck).
- `styles.css` — Light/dark responsive stylesheet.
- `app.js` — Client-side hybrid inverted-index ophthalmic search engine (12-tier field-aware ranking, phonetic & typo tolerance, Hindi/Devanagari transliteration, strength/pack/form decomposition, verified same-composition alternative brand discovery, highlighted progressive results), product specification `<dialog>`, multi-select enquiry state, form validation, and `/api/enquiry` submission controller.
- `tests/search-regression.mjs` — Repeatable 38-case automated search accuracy, relevance, and latency regression suite (`node tests/search-regression.mjs`).
- `sitemap.xml` & `robots.txt` — Search indexing files pointing to `https://dms.piecs.org/`.
- `_headers`, `_redirects`, `404.html`, `favicon.svg`, `manifest.webmanifest`, and `assets/images/`.
