/**
 * End-to-End Discovery, SEO, API, Security & Telegram Enquiry Regression Suite
 * Validates all 4,291+ medicine HTML pages, directory coverage, sitemap, robots,
 * llms docs, Worker JSON API endpoints, CORS/cache headers, security isolation,
 * rate limiting, and Telegram enquiry payload formatting.
 *
 * Usage: node tests/discovery-regression.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { buildCatalogIndex } from '../public/catalog-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const rawDb = JSON.parse(
  fs.readFileSync(path.join(publicDir, 'assets', 'data', 'ophthalmic-products.json'), 'utf8')
);
const { records, byId, bySlug, categories } = buildCatalogIndex(rawDb.items);

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}:`, err?.message || err);
  }
}

await check('A1. Dataset & unique deterministic slugs match actual record count', () => {
  assert.equal(records.length, rawDb.items.length);
  assert.equal(bySlug.size, records.length, 'Every record must have a unique slug');
  assert.equal(byId.size, records.length, 'Every record must have a unique ID');
});

await check('A2. All medicine HTML files exist, contain Schema.org JSON-LD, canonical, CTA & no invented Offer/GST', () => {
  const missingFiles = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    const filePath = path.join(publicDir, 'medicine', `${rec.slug}.html`);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(filePath);
    }
  }
  assert.equal(missingFiles.length, 0, `Missing medicine HTML pages: ${missingFiles.slice(0, 5).join(', ')}`);

  // Deep check representative subset (curated, IMD, PMBJP, duplicate-slug, missing strength/pack)
  const samples = [
    bySlug.get('moxicip-eye-drop'),
    bySlug.get('refresh-tears-plus-lubricating-eye-drops'),
    bySlug.get('latanoprost-eye-drops-ip-0-005-percent-w-v-50mcg-per-ml'),
    records.find((r) => !r.strength),
    records.find((r) => !r.pack_size),
    records.find((r) => r.slug.includes('homatropine-eye-drop'))
  ].filter(Boolean);

  for (const sample of samples) {
    const html = fs.readFileSync(path.join(publicDir, 'medicine', `${sample.slug}.html`), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://dms.piecs.org/medicine/${sample.slug}">`), 'Canonical missing');
    assert.ok(html.includes('aria-label="Breadcrumbs"'), 'Breadcrumbs missing');
    assert.ok(html.includes('aria-current="page"'), 'aria-current="page" missing');
    assert.ok(html.includes(`/?medicine=${encodeURIComponent(sample.id)}#enquiry`), 'Enquiry deep-link missing');
    assert.ok(html.includes('Enquire about availability and price'), 'Primary CTA wording missing');
    assert.ok(!html.includes('"@type":"Offer"'), 'Must not fabricate Schema.org Offer without verified price');
    assert.ok(!html.includes('AggregateRating'), 'Must not fabricate AggregateRating');
    assert.ok(!/09bdsps|gstin/i.test(html), 'Must not contain GSTIN');

    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(ldMatch, 'JSON-LD script missing');
    const parsedLd = JSON.parse(ldMatch[1]);
    const types = (parsedLd['@graph'] || []).flatMap((n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]));
    assert.ok(types.includes('Product'), 'JSON-LD missing Product');
    assert.ok(types.includes('BreadcrumbList'), 'JSON-LD missing BreadcrumbList');
    assert.ok(types.includes('Pharmacy'), 'JSON-LD missing Pharmacy');

    if (sample.image_path) {
      assert.ok(html.includes(sample.image_path), 'Verified product image missing');
      assert.ok(fs.existsSync(path.join(publicDir, sample.image_path.replace(/^\//, ''))), 'Image asset missing on disk');
    }
  }
});

await check('A3. Every single medicine URL is reachable via static HTML directory pages', () => {
  const dirFiles = [path.join(publicDir, 'medicines.html')];
  const pageDir = path.join(publicDir, 'medicines', 'page');
  if (fs.existsSync(pageDir)) {
    fs.readdirSync(pageDir).forEach((f) => {
      if (f.endsWith('.html')) dirFiles.push(path.join(pageDir, f));
    });
  }
  const linkedSlugs = new Set();
  const hrefRe = /href="\/medicine\/([^"]+)"/g;
  for (const df of dirFiles) {
    const content = fs.readFileSync(df, 'utf8');
    let m;
    while ((m = hrefRe.exec(content)) !== null) {
      linkedSlugs.add(m[1]);
    }
  }
  assert.equal(linkedSlugs.size, records.length, `Directory links (${linkedSlugs.size}) must cover all ${records.length} medicines`);
  assert.ok(categories.length >= 8);
});

await check('B1. Public Worker API: GET /api/catalog pagination & filters (zero auth, CORS, cache)', async () => {
  const req1 = new Request('https://dms.piecs.org/api/catalog?page=1&limit=25');
  const res1 = await worker.fetch(req1, {});
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('access-control-allow-origin'), '*');
  assert.ok(res1.headers.get('cache-control')?.includes('public'));
  const json1 = await res1.json();
  assert.equal(json1.ok, true);
  assert.equal(json1.total_records, records.length);
  assert.equal(json1.items.length, 25);
  assert.equal(json1.page, 1);
  assert.equal(json1.has_next, true);
  assert.equal(json1.items[0].availability_status, 'contact_store');
  assert.equal(json1.items[0].currency, 'INR');
  assert.equal(json1.items[0].price, null);

  const req2 = new Request('https://dms.piecs.org/api/catalog?page=2&limit=25&category=glaucoma-and-eye-pressure');
  const res2 = await worker.fetch(req2, {});
  const json2 = await res2.json();
  assert.equal(json2.page, 2);
  assert.ok(json2.items.every((x) => x.category_slug === 'glaucoma-and-eye-pressure'));

  const optRes = await worker.fetch(new Request('https://dms.piecs.org/api/catalog', { method: 'OPTIONS' }), {});
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('access-control-allow-origin'), '*');
});

await check('B2. Static /api/catalog.json & Worker /api/catalog.json fallback valid', async () => {
  const rawJson = fs.readFileSync(path.join(publicDir, 'api', 'catalog.json'), 'utf8');
  const parsed = JSON.parse(rawJson);
  assert.equal(parsed.total_records, records.length);
  assert.equal(parsed.items.length, records.length);

  const res = await worker.fetch(new Request('https://dms.piecs.org/api/catalog.json?page=1&limit=5'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 5);
});

await check('B3. Public Worker API: GET /api/medicine/{id_or_slug} & 404 on unknown', async () => {
  const resId = await worker.fetch(new Request('https://dms.piecs.org/api/medicine/IMD-133413'), {});
  assert.equal(resId.status, 200);
  const byIdData = await resId.json();
  assert.equal(byIdData.slug, 'moxicip-eye-drop');
  assert.equal(byIdData.brand, 'Moxicip');
  assert.equal(byIdData.generic_name, 'Moxifloxacin');
  assert.equal(byIdData.availability_status, 'contact_store');
  assert.ok(byIdData.product_url.endsWith('/medicine/moxicip-eye-drop'));
  assert.ok(Array.isArray(byIdData.alternatives) && byIdData.alternatives.length > 0);

  const resSlug = await worker.fetch(new Request('https://dms.piecs.org/api/medicine/moxicip-eye-drop'), {});
  assert.equal(resSlug.status, 200);
  const bySlugData = await resSlug.json();
  assert.equal(bySlugData.id, 'IMD-133413');

  const res404 = await worker.fetch(new Request('https://dms.piecs.org/api/medicine/does-not-exist-xyz'), {});
  assert.equal(res404.status, 404);
});

await check('B4. Public Worker API: GET /api/search supports brand, generic, mfr, typos & Hindi', async () => {
  for (const [q, checkFn] of [
    ['Moxicip', (d) => d.results[0]?.brand === 'Moxicip'],
    ['Latanoprost', (d) => d.total_matches >= 10 && d.results.some((r) => (r.composition || '').includes('Latanoprost'))],
    ['Sipla', (d) => d.results.slice(0, 5).every((r) => (r.manufacturer || '').includes('Cipla'))],
    ['CMC', (d) => d.results[0]?.composition.toLowerCase().includes('carboxymethyl')],
    ['रिफ्रेश टियर्स', (d) => d.results[0]?.name.toLowerCase().includes('refresh tears')]
  ]) {
    const res = await worker.fetch(new Request(`https://dms.piecs.org/api/search?q=${encodeURIComponent(q)}&limit=10`), {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const data = await res.json();
    assert.ok(checkFn(data), `Search assertion failed for query: ${q}`);
    assert.ok(data.results.every((r) => r.availability_status === 'contact_store' && r.product_url.startsWith('https://dms.piecs.org/medicine/')));
  }
});

await check('C1. Sitemap XML covers every medicine URL and excludes private routes', () => {
  const xml = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
  assert.ok(xml.startsWith('<?xml version="1.0"'));
  assert.ok(!xml.includes('/api/enquiry'), 'Sitemap must exclude /api/enquiry');
  assert.ok(xml.includes('<loc>https://dms.piecs.org/</loc>'));
  assert.ok(xml.includes('<loc>https://dms.piecs.org/medicines</loc>'));
  const locs = [...xml.matchAll(/<loc>https:\/\/dms\.piecs\.org\/medicine\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, records.length, `Sitemap medicine count (${locs.length}) must equal ${records.length}`);
});

await check('C2. robots.txt separates AI search vs GPTBot, allows discovery, blocks /api/enquiry', () => {
  const robots = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
  for (const ua of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'ClaudeBot', 'GPTBot']) {
    assert.ok(robots.includes(`User-agent: ${ua}`), `Missing robots.txt section for ${ua}`);
  }
  assert.ok(robots.includes('Disallow: /api/enquiry'));
  assert.ok(robots.includes('Sitemap: https://dms.piecs.org/sitemap.xml'));
});

await check('C3. llms.txt and llms-full.txt reflect live count cleanly without full dump bloat', () => {
  const llms = fs.readFileSync(path.join(publicDir, 'llms.txt'), 'utf8');
  const llmsFull = fs.readFileSync(path.join(publicDir, 'llms-full.txt'), 'utf8');
  assert.ok(llms.includes(records.length.toLocaleString('en-IN')));
  assert.ok(llmsFull.includes(records.length.toLocaleString('en-IN')));
  assert.ok(llms.length < 6000, 'llms.txt must stay concise');
  assert.ok(llmsFull.length < 18000, 'llms-full.txt must document API rather than dumping 4,291 rows');
  assert.ok(llmsFull.includes('/api/catalog'));
  assert.ok(llmsFull.includes('contact_store'));
  assert.ok(!/09bdsps|gstin/i.test(llms + llmsFull));
});

await check('D1. Security: Zero Telegram credentials or KV leaks in frontend JS/HTML', () => {
  const files = ['app.js', 'search-engine.js', 'catalog-core.js', 'catalog-page.js', 'index.html', '404.html'];
  for (const fn of files) {
    const content = fs.readFileSync(path.join(publicDir, fn), 'utf8');
    assert.ok(!content.includes('TELEGRAM_BOT_TOKEN'), `Leak check failed in ${fn}`);
    assert.ok(!content.includes('TELEGRAM_CHAT_ID'), `Leak check failed in ${fn}`);
    assert.ok(!content.includes('api.telegram.org/bot'), `Leak check failed in ${fn}`);
    assert.ok(!/09bdsps|gstin/i.test(content), `GST check failed in ${fn}`);
  }
});

await check('D2. Enquiry POST validation, honeypot, Telegram server-side dispatch, and per-IP rate limiting', async () => {
  // Invalid empty payload -> 400
  const badRes = await worker.fetch(
    new Request('https://dms.piecs.org/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.10' },
      body: JSON.stringify({ customerName: 'A', mobile: '123', selectedItems: [] })
    }),
    {}
  );
  assert.equal(badRes.status, 400);

  // Honeypot spam -> 400
  const hpRes = await worker.fetch(
    new Request('https://dms.piecs.org/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.10' },
      body: JSON.stringify({
        customerName: 'Test Bot',
        mobile: '9876543210',
        selectedItems: [{ id: 'IMD-133413', name: 'Moxicip Eye Drop' }],
        hp_field: 'http://spam.example'
      })
    }),
    {}
  );
  assert.equal(hpRes.status, 400);

  // Verified server-side Telegram Bot dispatch using local fetch observer
  let capturedTelegramCall = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.telegram.org/bot')) {
      capturedTelegramCall = { url: String(url), body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    return origFetch(url, init);
  };
  try {
    const okRes = await worker.fetch(
      new Request('https://dms.piecs.org/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.11' },
        body: JSON.stringify({
          customerName: 'Ramesh Kumar',
          mobile: '9876543210',
          selectedItems: [{ id: 'IMD-133413', name: 'Moxicip Eye Drop', brand: 'Moxicip', manufacturer: 'Cipla Ltd', composition: 'Moxifloxacin (0.5% w/v)', strength: '0.5% w/v' }],
          unmatchedQueries: []
        })
      }),
      { TELEGRAM_BOT_TOKEN: 'TEST_PRIVATE_SECRET_DO_NOT_LEAK', TELEGRAM_CHAT_ID: '123456' }
    );
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.ok, true);
    assert.equal(okJson.deliveredViaTelegram, true);
    assert.ok(!JSON.stringify(okJson).includes('TEST_PRIVATE_SECRET_DO_NOT_LEAK'), 'Token leaked in response');
    assert.ok(capturedTelegramCall?.url.includes('TEST_PRIVATE_SECRET_DO_NOT_LEAK'));
    assert.ok(capturedTelegramCall?.body?.text.includes('Ramesh Kumar'));
    assert.ok(capturedTelegramCall?.body?.text.includes('Moxicip Eye Drop'));
  } finally {
    globalThis.fetch = origFetch;
  }

  // Rate limit check (exceed 8 requests on dedicated IP)
  let hit429 = false;
  for (let i = 0; i < 10; i += 1) {
    const r = await worker.fetch(
      new Request('https://dms.piecs.org/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.77' },
        body: JSON.stringify({
          customerName: 'Rate Check',
          mobile: '9876543210',
          selectedItems: [{ id: 'IMD-133413', name: 'Moxicip Eye Drop' }]
        })
      }),
      {}
    );
    if (r.status === 429) {
      hit429 = true;
      assert.ok(Number(r.headers.get('retry-after')) > 0);
      break;
    }
  }
  assert.equal(hit429, true, 'Rate limiter must enforce 429 on rapid bursts');
});

console.log(`\n=== DISCOVERY & SECURITY SUMMARY ===\nPassed: ${passed}/${passed + failed}, Failed: ${failed}`);
if (failed > 0) process.exitCode = 1;
