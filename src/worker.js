/**
 * Cloudflare Worker Entrypoint (Workers + Static Assets)
 *
 * Serves:
 *   - Public Read-Only Catalogue API (CORS enabled, edge-cached, zero auth):
 *       GET /api/catalog
 *       GET /api/catalog.json
 *       GET /api/medicine/{id_or_slug}
 *       GET /api/search?q={query}
 *   - Private Patient Availability Enquiry Endpoint:
 *       POST /api/enquiry (rate-limited, honeypot + input validated, server-side Telegram + optional KV)
 *   - Static assets fallback via env.ASSETS for /, /medicine/*, /medicines*, /sitemap.xml, /llms*.txt
 */

import ophthalmicCatalogData from '../public/assets/data/ophthalmic-products.json' with { type: 'json' };
import { createOphthalmicSearchEngine } from '../public/search-engine.js';
import {
  STORE_INFO,
  AVAILABILITY_SEMANTICS,
  buildCatalogIndex
} from '../public/catalog-core.js';

const ENQUIRY_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PUBLIC_API_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PUBLIC_STORE_META = {
  name: STORE_INFO.name,
  hindi_name: STORE_INFO.hindiName,
  short_name: STORE_INFO.shortName,
  url: `${STORE_INFO.siteUrl}/`,
  address: STORE_INFO.address,
  hours: STORE_INFO.hours,
  maps_url: STORE_INFO.mapsUrl,
};

const PRICING_POLICY = {
  currency: 'INR',
  online_pricing: false,
  note: 'Selling prices are confirmed by phone callback or at counter pickup; null indicates confirmation required.',
};

// Lazy module-level singleton per Worker isolate (single source of truth from JSON asset)
let cachedRuntime = null;
function getCatalogRuntime() {
  if (cachedRuntime) return cachedRuntime;
  const rawItems = Array.isArray(ophthalmicCatalogData?.items) ? ophthalmicCatalogData.items : [];
  const index = buildCatalogIndex(rawItems);
  const engine = createOphthalmicSearchEngine(rawItems);
  cachedRuntime = { rawItems, index, engine };
  return cachedRuntime;
}

// Per-isolate sliding window IP rate limiter (bounded cleanly at <= 2,000 IPs)
const ENQUIRY_RATE_WINDOW_MS = 10 * 60 * 1000;
const ENQUIRY_RATE_MAX = 8;
const enquiryHitsByIp = new Map();

export function checkEnquiryRateLimit(ipKey, now = Date.now(), limit = ENQUIRY_RATE_MAX, windowMs = ENQUIRY_RATE_WINDOW_MS) {
  const key = String(ipKey || 'unknown').slice(0, 64);
  if (enquiryHitsByIp.size > 2000) {
    enquiryHitsByIp.clear();
  }
  const cutoff = now - windowMs;
  const prev = (enquiryHitsByIp.get(key) || []).filter((ts) => ts > cutoff);
  if (prev.length >= limit) {
    enquiryHitsByIp.set(key, prev);
    const oldest = prev[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }
  prev.push(now);
  enquiryHitsByIp.set(key, prev);
  return { allowed: true, remaining: limit - prev.length, retryAfter: 0 };
}

function publicApiJson(body, status = 200, extraHeaders = {}, method = 'GET') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status >= 400
      ? 'public, max-age=60'
      : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    ...PUBLIC_API_CORS_HEADERS,
    ...extraHeaders,
  };
  return new Response(method === 'HEAD' ? null : JSON.stringify(body), { status, headers });
}

function enquiryJsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...ENQUIRY_CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function cleanText(value, maxLen = 160) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

function parsePositiveInt(raw, fallback, min, max) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function generateEnquiryId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `ENQ-${suffix}`;
}

function formatIstTimestamp(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function buildTelegramMessage({
  enquiryId,
  customerName,
  mobile,
  selectedItems,
  unmatchedQueries,
  submittedAt,
}) {
  const lines = [
    'NEW MEDICINE AVAILABILITY ENQUIRY',
    '',
    `Customer: ${customerName}`,
    `Mobile: ${mobile}`,
    '',
  ];

  if (selectedItems.length > 0) {
    lines.push('Requested Medicines:');
    selectedItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name}`);
      if (item.manufacturer || item.brand) {
        lines.push(`   Manufacturer: ${item.manufacturer || item.brand}`);
      }
      if (item.composition) {
        lines.push(`   Composition: ${item.composition}`);
      }
      if (item.strength) {
        lines.push(`   Strength / Variant: ${item.strength}`);
      }
      if (item.id) {
        lines.push(`   Product ID: ${item.id}`);
      }
    });
    lines.push('');
  }

  if (unmatchedQueries.length > 0) {
    lines.push('Unmatched Search (Customer search without database match):');
    unmatchedQueries.forEach((query) => {
      lines.push(`Customer entered: "${query}"`);
    });
    lines.push('');
  }

  lines.push(`Enquiry ID: ${enquiryId}`);
  lines.push('Status: Pending Callback');
  lines.push(`Submitted: ${submittedAt} (IST)`);

  return lines.join('\n');
}

function handleCatalogGet(request, url) {
  const { index } = getCatalogRuntime();
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 1, 10000);
  const limit = parsePositiveInt(url.searchParams.get('limit'), 50, 1, 200);

  const categoryFilter = cleanText(url.searchParams.get('category'), 80).toLowerCase();
  const formFilter = cleanText(url.searchParams.get('form'), 80).toLowerCase();
  const mfrFilter = cleanText(url.searchParams.get('manufacturer'), 100).toLowerCase();
  const brandFilter = cleanText(url.searchParams.get('brand'), 100).toLowerCase();
  const compFilter = cleanText(url.searchParams.get('composition'), 120).toLowerCase();

  let filtered = index.records;
  if (categoryFilter) {
    filtered = filtered.filter(
      (r) => r.category_slug === categoryFilter || r.category.toLowerCase().includes(categoryFilter)
    );
  }
  if (formFilter) {
    filtered = filtered.filter((r) => (r.form || '').toLowerCase().includes(formFilter));
  }
  if (mfrFilter) {
    filtered = filtered.filter((r) => (r.manufacturer || '').toLowerCase().includes(mfrFilter));
  }
  if (brandFilter) {
    filtered = filtered.filter((r) => (r.brand || '').toLowerCase().includes(brandFilter));
  }
  if (compFilter) {
    filtered = filtered.filter((r) => (r.composition || '').toLowerCase().includes(compFilter));
  }

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const slice = totalFiltered === 0 ? [] : filtered.slice(start, start + limit);

  let nextPageUrl = null;
  if (safePage < totalPages) {
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.set('page', String(safePage + 1));
    nextParams.set('limit', String(limit));
    nextPageUrl = `${STORE_INFO.siteUrl}/api/catalog?${nextParams.toString()}`;
  }

  return publicApiJson(
    {
      ok: true,
      store: PUBLIC_STORE_META,
      total_records: index.records.length,
      filtered_records: totalFiltered,
      page: safePage,
      limit,
      total_pages: totalFiltered === 0 ? 0 : totalPages,
      has_next: safePage < totalPages,
      next_page_url: nextPageUrl,
      availability_semantics: AVAILABILITY_SEMANTICS,
      pricing_policy: PRICING_POLICY,
      categories: index.categories,
      items: slice,
    },
    200,
    {},
    request.method
  );
}

function handleMedicineDetailGet(request, url) {
  const { index, engine } = getCatalogRuntime();
  const rawSegment = url.pathname.replace(/^\/api\/medicine\//, '').replace(/\/+$/, '');
  let lookupKey = '';
  try {
    lookupKey = decodeURIComponent(rawSegment).trim().toLowerCase();
  } catch {
    lookupKey = rawSegment.trim().toLowerCase();
  }

  if (!lookupKey) {
    return publicApiJson(
      { ok: false, error: 'Missing medicine identifier or slug.' },
      400,
      {},
      request.method
    );
  }

  const rec = index.byId.get(lookupKey) || index.bySlug.get(lookupKey);
  if (!rec) {
    return publicApiJson(
      { ok: false, error: 'Medicine not found in Drishti Medical Store catalogue.' },
      404,
      {},
      request.method
    );
  }

  const rawRec = engine.getById(rec.id);
  const equiv = rawRec ? engine.getEquivalents(rawRec) : { alternatives: [] };
  const alternatives = (equiv.alternatives || [])
    .slice(0, 6)
    .map((alt) => index.byId.get(String(alt.id || '').toLowerCase()))
    .filter(Boolean);

  return publicApiJson(
    {
      ok: true,
      ...rec,
      store: PUBLIC_STORE_META,
      availability_semantics: AVAILABILITY_SEMANTICS,
      pricing_policy: PRICING_POLICY,
      alternatives,
    },
    200,
    {},
    request.method
  );
}

function handleSearchGet(request, url) {
  const { index, engine } = getCatalogRuntime();
  const query = cleanText(url.searchParams.get('q'), 140);
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 1, 500);
  const limit = parsePositiveInt(url.searchParams.get('limit'), 20, 1, 100);
  const formFilter = cleanText(url.searchParams.get('form'), 80).toLowerCase();
  const categoryFilter = cleanText(url.searchParams.get('category'), 80).toLowerCase();

  if (query.length < 2) {
    return publicApiJson(
      {
        ok: true,
        store: PUBLIC_STORE_META,
        query,
        total_records: index.records.length,
        total_matches: 0,
        page: 1,
        limit,
        total_pages: 0,
        has_next: false,
        availability_semantics: AVAILABILITY_SEMANTICS,
        pricing_policy: PRICING_POLICY,
        results: [],
        alternatives: [],
        related: [],
      },
      200,
      {},
      request.method
    );
  }

  const searchRes = engine.search(query, 200);
  let matchedFormatted = (searchRes.allScored || [])
    .map((entry) => {
      const rec = index.byId.get(String(entry.rec.id || '').toLowerCase());
      if (!rec) return null;
      return entry.matchReason ? { ...rec, match_reason: entry.matchReason } : rec;
    })
    .filter(Boolean);

  if (formFilter) {
    matchedFormatted = matchedFormatted.filter((r) => (r.form || '').toLowerCase().includes(formFilter));
  }
  if (categoryFilter) {
    matchedFormatted = matchedFormatted.filter(
      (r) => r.category_slug === categoryFilter || r.category.toLowerCase().includes(categoryFilter)
    );
  }

  const totalMatches = matchedFormatted.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const pageResults = totalMatches === 0 ? [] : matchedFormatted.slice(start, start + limit);

  const alternatives = (searchRes.alternatives || [])
    .slice(0, 6)
    .map((r) => index.byId.get(String(r.id || '').toLowerCase()))
    .filter(Boolean);

  const related = (searchRes.related || [])
    .slice(0, 4)
    .map((r) => index.byId.get(String(r.id || '').toLowerCase()))
    .filter(Boolean);

  return publicApiJson(
    {
      ok: true,
      store: PUBLIC_STORE_META,
      query,
      interpretation: searchRes.interpretation,
      total_records: index.records.length,
      total_matches: totalMatches,
      page: safePage,
      limit,
      total_pages: totalMatches === 0 ? 0 : totalPages,
      has_next: totalMatches > 0 && safePage < totalPages,
      availability_semantics: AVAILABILITY_SEMANTICS,
      pricing_policy: PRICING_POLICY,
      results: pageResults,
      alternatives,
      related,
    },
    200,
    {},
    request.method
  );
}

async function handleEnquiryPost(request, env) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > 16384) {
    return enquiryJsonResponse({ ok: false, error: 'Enquiry payload too large.' }, 413);
  }

  const clientIp =
    cleanText(request.headers.get('CF-Connecting-IP'), 64) ||
    cleanText(request.headers.get('X-Forwarded-For'), 64).split(',')[0].trim() ||
    'local';
  const rateCheck = checkEnquiryRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return enquiryJsonResponse(
      { ok: false, error: 'Too many enquiries from this connection. Please wait a few minutes and try again.' },
      429,
      { 'Retry-After': String(rateCheck.retryAfter) }
    );
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return enquiryJsonResponse({ ok: false, error: 'Unable to read request body.' }, 400);
  }
  if (rawBody.length > 16384) {
    return enquiryJsonResponse({ ok: false, error: 'Enquiry payload too large.' }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return enquiryJsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
  }

  // Basic honeypot spam rejection
  if (cleanText(payload?.hp_field, 40).length > 0) {
    return enquiryJsonResponse({ ok: false, error: 'Invalid enquiry submission.' }, 400);
  }

  const customerName = cleanText(payload?.customerName, 80);
  const mobileDigits = normalizePhone(payload?.mobile);

  if (customerName.length < 2 || /https?:\/\//i.test(customerName)) {
    return enquiryJsonResponse({ ok: false, error: 'Please enter a valid patient / customer name.' }, 400);
  }

  if (mobileDigits.length < 10 || mobileDigits.length > 15) {
    return enquiryJsonResponse({ ok: false, error: 'Please enter a valid 10-digit mobile number.' }, 400);
  }

  const rawItems = Array.isArray(payload?.selectedItems) ? payload.selectedItems : [];
  const selectedItems = rawItems
    .slice(0, 25)
    .map((item) => ({
      id: cleanText(item?.id, 40),
      name: cleanText(item?.name, 140),
      brand: cleanText(item?.brand, 100),
      manufacturer: cleanText(item?.manufacturer, 120),
      composition: cleanText(item?.composition, 180),
      strength: cleanText(item?.strength, 80),
    }))
    .filter((item) => item.name.length > 0);

  const rawUnmatched = Array.isArray(payload?.unmatchedQueries) ? payload.unmatchedQueries : [];
  const unmatchedQueries = rawUnmatched
    .slice(0, 10)
    .map((q) => cleanText(q, 140))
    .filter((q) => q.length >= 2 && !/https?:\/\//i.test(q));

  if (selectedItems.length === 0 && unmatchedQueries.length === 0) {
    return enquiryJsonResponse(
      { ok: false, error: 'Please select at least one medicine or add your search query before submitting.' },
      400
    );
  }

  const enquiryId = generateEnquiryId();
  const submittedAt = formatIstTimestamp(new Date());

  const record = {
    enquiryId,
    customerName,
    mobile: mobileDigits,
    selectedItems,
    unmatchedQueries,
    status: 'Pending Callback',
    submittedAt,
    createdAtIso: new Date().toISOString(),
  };

  if (env?.ENQUIRIES_KV) {
    try {
      await env.ENQUIRIES_KV.put(`enquiry:${enquiryId}`, JSON.stringify(record), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch {
      // Optional KV persistence failure must not block enquiry alert delivery.
    }
  }

  const messageText = buildTelegramMessage(record);
  const botToken = cleanText(env?.TELEGRAM_BOT_TOKEN, 160);
  const chatId = cleanText(env?.TELEGRAM_CHAT_ID, 64);

  if (!botToken || !chatId) {
    return enquiryJsonResponse(
      {
        ok: true,
        enquiryId,
        submittedAt,
        deliveredViaTelegram: false,
        telegramConfigured: false,
        formattedMessage: messageText,
        notice: 'Counter notification delivery is not configured in this environment.',
      },
      202
    );
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok || !tgData.ok) {
      return enquiryJsonResponse(
        {
          ok: false,
          enquiryId,
          submittedAt,
          deliveredViaTelegram: false,
          telegramConfigured: true,
          formattedMessage: messageText,
          error: 'Telegram Bot API rejected the notification.',
        },
        502
      );
    }

    return enquiryJsonResponse({
      ok: true,
      enquiryId,
      submittedAt,
      deliveredViaTelegram: true,
      telegramConfigured: true,
    });
  } catch {
    return enquiryJsonResponse(
      {
        ok: false,
        enquiryId,
        submittedAt,
        deliveredViaTelegram: false,
        telegramConfigured: true,
        formattedMessage: messageText,
        error: 'Unable to reach Telegram Bot API.',
      },
      502
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // 1. Private patient availability enquiry endpoint
    if (pathname === '/api/enquiry') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: ENQUIRY_CORS_HEADERS });
      }
      if (request.method === 'POST') {
        return handleEnquiryPost(request, env);
      }
      return enquiryJsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
    }

    // 2. Public read-only catalogue endpoints (no API key required)
    if (
      pathname === '/api/catalog' ||
      pathname === '/api/catalog.json' ||
      pathname === '/api/search' ||
      pathname.startsWith('/api/medicine/')
    ) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: PUBLIC_API_CORS_HEADERS });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return publicApiJson({ ok: false, error: 'Method not allowed. Use GET.' }, 405, {}, request.method);
      }

      if (pathname === '/api/catalog') {
        return handleCatalogGet(request, url);
      }

      if (pathname === '/api/catalog.json') {
        // Serve full pre-generated static export when no query filters/pagination are requested
        if ([...url.searchParams.keys()].length === 0 && env?.ASSETS) {
          const assetRes = await env.ASSETS.fetch(request);
          if (assetRes.ok) {
            const headers = new Headers(assetRes.headers);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
            return new Response(request.method === 'HEAD' ? null : assetRes.body, {
              status: assetRes.status,
              headers,
            });
          }
        }
        return handleCatalogGet(request, url);
      }

      if (pathname === '/api/search') {
        return handleSearchGet(request, url);
      }

      if (pathname.startsWith('/api/medicine/')) {
        return handleMedicineDetailGet(request, url);
      }
    }

    // 3. Static asset serving (HTML pages, sitemaps, llms docs, images, CSS/JS)
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
