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

## Configuring Telegram Counter Alerts & Rate Limiting (Cloudflare Workers)

Enquiries submitted from **Find Your Eye Medicine** post JSON to `/api/enquiry` (`src/worker.js`). Never place Telegram credentials in frontend code. Configure these environment secrets in **Cloudflare Dashboard → Workers & Pages → Project Settings → Variables and Secrets** (or `npx wrangler secret put`):

- `TELEGRAM_BOT_TOKEN`: Bot token from `@BotFather`
- `TELEGRAM_CHAT_ID`: Staff Telegram user or group chat ID receiving enquiries
- *(Optional)* `ENQUIRIES_KV` KV namespace binding for 30-day enquiry log retention

## Public Discovery & Machine-Readable Catalogue Endpoints

All `4,291` records in `public/assets/data/ophthalmic-products.json` are exposed automatically by `npm run build` (`scripts/build-catalog.mjs`) and `src/worker.js`:

- `/medicine/{medicine-slug}` — Static crawlable HTML medicine detail pages with Schema.org `Product`, `BreadcrumbList`, and `Pharmacy` JSON-LD
- `/medicines` & `/medicines/{category-slug}` — Paginated crawlable directory linking all records
- `/sitemap.xml` — Complete XML sitemap containing all core, directory, and medicine URLs
- `/robots.txt` — Explicit crawler rules separating AI Search/Discovery (`Googlebot`, `Bingbot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`, `ClaudeBot`) from model-training bots (`GPTBot`, `Google-Extended`) while excluding `/api/enquiry`
- `/llms.txt` & `/llms-full.txt` — Concise & full machine-readable catalogue documentation
- `GET /api/catalog`, `GET /api/catalog.json`, `GET /api/medicine/{id-or-slug}`, `GET /api/search?q={query}` — Public, read-only, CORS-enabled JSON endpoints (`availability_status: "contact_store"`, no API key required)

## Configuring Optional Store WhatsApp / Email Backup

In `public/app.js`, update `STORE_CONFIG` if you also want optional local fallback links exposed when `/api/enquiry` is offline or unconfigured:

```js
const STORE_CONFIG = {
  ...
  whatsappNumber: '9198XXXXXXXX', // 10+ digits with country code
  storeEmail: 'contact@dms.piecs.org'
};
```

Until Telegram secrets (or fallback contact channels) are configured, unconfigured environments generate an Enquiry Reference (`ENQ-...`), save a local copy on the customer's device, and offer **Copy Enquiry** / **Download (.txt)** backup so no search is lost.

## Cloudflare Workers + Static Assets Deployment (`npx wrangler deploy`)

This project is pre-configured via `wrangler.jsonc` (`main: "src/worker.js"`, `build.command: "node scripts/build-catalog.mjs"`, `assets.directory: "./public"`, `run_worker_first: ["/api/*"]`) so both **Cloudflare Git Integration** (`npx wrangler deploy`) and **Wrangler CLI** build all static medicine pages + sitemap + JSON export and deploy cleanly:

```sh
npm run build
npm test
npx wrangler deploy
```

### Cloudflare Git Integration Settings
- **Build command:** *(empty — handled by `wrangler.jsonc` `build.command`)*
- **Deploy command:** `npx wrangler deploy` (Cloudflare default)

## Included Files

- `wrangler.jsonc` — Cloudflare Workers + Static Assets configuration (`main`, `build.command`, `assets`, `run_worker_first`).
- `scripts/build-catalog.mjs` — Static generator producing `public/medicine/*`, `public/medicines/*`, `public/sitemap.xml`, `public/api/catalog.json`, `public/llms.txt`, and `public/llms-full.txt`.
- `src/worker.js` — Cloudflare Worker handling public read-only `/api/catalog*`, `/api/medicine/*`, `/api/search` JSON endpoints and rate-limited `POST /api/enquiry` Telegram alerts.
- `public/search-engine.js` & `public/catalog-core.js` — Shared search index, slugifier, and category/generic normalizer.
- `public/index.html`, `public/styles.css`, `public/app.js`, `public/catalog-page.js` — Main storefront, Light/Dark mode, bilingual EN/हिन्दी switcher, and medicine subpage chrome.
- `public/assets/data/ophthalmic-products.json` — Single source of truth catalogue (`4,291` ophthalmic records).
- `tests/search-regression.mjs` & `tests/discovery-regression.mjs` — Search accuracy, SEO/sitemap/JSON-LD, API, CORS, security isolation, rate limiting, and Telegram payload tests (`npm test`).
