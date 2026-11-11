/**
 * Static Catalogue Generator for AI & Search Discovery
 *
 * Reads public/assets/data/ophthalmic-products.json as the single source of truth
 * and generates:
 *   - public/medicine/{slug}.html (one crawlable HTML page per unique medicine)
 *   - public/medicines.html & public/medicines/page/{N}.html (paginated directory)
 *   - public/medicines/{category-slug}.html (+ paginated subpages)
 *   - public/sitemap.xml (all core pages + category pages + every medicine URL)
 *   - public/api/catalog.json (public machine-readable catalogue export)
 *   - public/llms.txt & public/llms-full.txt (dynamically synced counts & schema)
 *
 * Usage: node scripts/build-catalog.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORE_INFO,
  AVAILABILITY_SEMANTICS,
  buildCatalogIndex
} from '../public/catalog-core.js';
import { createOphthalmicSearchEngine } from '../public/search-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dataPath = path.join(publicDir, 'assets', 'data', 'ophthalmic-products.json');

const PAGE_SIZE = 100;
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const BUILD_ISO = new Date().toISOString();

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeCleanFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function renderSharedHead({
  title,
  description,
  canonicalUrl,
  ogType = 'website',
  ogImage = STORE_INFO.defaultImage,
  prevUrl = null,
  nextUrl = null,
  jsonAlternateUrl = null,
  jsonLdGraph = null
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f8fafc" id="theme-color-meta">
  <script>
    try {
      var savedTheme = localStorage.getItem('dms_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        document.documentElement.dataset.theme = savedTheme;
        document.querySelector('meta[name="color-scheme"]').content = savedTheme;
        document.getElementById('theme-color-meta').content = savedTheme === 'dark' ? '#091322' : '#f8fafc';
      }
    } catch {}
  </script>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
${prevUrl ? `  <link rel="prev" href="${escapeHtml(prevUrl)}">\n` : ''}${nextUrl ? `  <link rel="next" href="${escapeHtml(nextUrl)}">\n` : ''}${jsonAlternateUrl ? `  <link rel="alternate" type="application/json" href="${escapeHtml(jsonAlternateUrl)}" title="Structured Medicine JSON">\n` : ''}  <link rel="alternate" type="text/plain" href="/llms.txt" title="AI &amp; Store Documentation">
  <meta property="og:site_name" content="${escapeHtml(`${STORE_INFO.name} (${STORE_INFO.shortName})`)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:locale" content="en_IN">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="${ogImage === STORE_INFO.defaultImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script type="module" src="/catalog-page.js"></script>
${jsonLdGraph ? `  <script type="application/ld+json">${safeJsonLd(jsonLdGraph)}</script>\n` : ''}</head>`;
}

function renderSharedHeader() {
  return `<a href="#main-heading" class="skip-link visually-hidden">Skip to main content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="site-logo" href="/">
        <svg class="logo-mark" width="38" height="38" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect width="64" height="64" rx="16" fill="currentColor" fill-opacity="0.12"/>
          <path d="M10 32C15.5 21.5 23.3 16 32 16C40.7 16 48.5 21.5 54 32C48.5 42.5 40.7 48 32 48C23.3 48 15.5 42.5 10 32Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
          <path d="M32 20.5C32 20.5 39.5 28.4 39.5 33.8C39.5 38 36.14 41.5 32 41.5C27.86 41.5 24.5 38 24.5 33.8C24.5 28.4 32 20.5 32 20.5Z" fill="var(--color-accent)"/>
        </svg>
        <span class="logo-text">
          <strong>Drishti Medical Store</strong>
          <span><span lang="hi">दृष्टि मेडिकल स्टोर</span> &bull; Basti</span>
        </span>
      </a>
      <div class="header-actions-group">
        <nav class="site-nav" aria-label="Primary">
          <button class="menu-button" type="button" popovertarget="site-menu" popovertargetaction="toggle" aria-controls="site-menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="17" x2="20" y2="17"/>
            </svg>
            <span>Menu</span>
          </button>
          <ul id="site-menu" class="site-menu" popover="auto">
            <li><a href="/" data-i18n="nav-home">Home</a></li>
            <li><a href="/medicines" data-i18n="nav-directory">Medicine Directory</a></li>
            <li><a href="/#enquiry" data-i18n="nav-search">Search &amp; Enquire</a></li>
            <li><a href="/#location">Map &amp; Hours</a></li>
          </ul>
        </nav>
        <button type="button" class="theme-toggle-btn" id="theme-toggle-btn" aria-label="Switch to dark mode" aria-pressed="false" title="Switch Light / Dark mode">
          <svg class="theme-icon theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          </svg>
          <svg class="theme-icon theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
          </svg>
        </button>
        <div class="lang-switch-wrapper" role="group" aria-label="Display language">
          <button type="button" class="lang-switch-btn active" id="btnLangEn" aria-pressed="true">EN</button>
          <button type="button" class="lang-switch-btn" id="btnLangHi" aria-pressed="false" lang="hi">हिन्दी</button>
        </div>
      </div>
    </div>
  </header>`;
}

function renderSharedFooter(totalCount) {
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="site-logo footer-brand-logo" href="/">
            <svg class="logo-mark" width="32" height="32" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect width="64" height="64" rx="16" fill="#2dd4bf" fill-opacity="0.16"/>
              <path d="M10 32C15.5 21.5 23.3 16 32 16C40.7 16 48.5 21.5 54 32C48.5 42.5 40.7 48 32 48C23.3 48 15.5 42.5 10 32Z" stroke="#eef4fb" stroke-width="3.5" stroke-linejoin="round"/>
              <path d="M32 20.5C32 20.5 39.5 28.4 39.5 33.8C39.5 38 36.14 41.5 32 41.5C27.86 41.5 24.5 38 24.5 33.8C24.5 28.4 32 20.5 32 20.5Z" fill="#2dd4bf"/>
            </svg>
            <span class="logo-text">
              <strong>Drishti Medical Store</strong>
              <span><span lang="hi">दृष्टि मेडिकल स्टोर</span> &bull; Basti <span class="mono">272001</span></span>
            </span>
          </a>
          <p class="footer-about">
            Dedicated ophthalmic pharmacy inside Sant Kabir Eye Hospital, Bansi Road, Katra, Basti &ndash; 272001 (${totalCount.toLocaleString('en-IN')} indexed catalogue records).
          </p>
        </div>
        <div>
          <h3>Catalogue &amp; Store Particulars</h3>
          <ul class="footer-links">
            <li>Inside Sant Kabir Eye Hospital, Bansi Road, Katra, Basti &ndash; <span class="mono">272001</span></li>
            <li>Hours: Monday&ndash;Saturday, 9:00 AM &ndash; 6:00 PM (OPD schedule)</li>
            <li><a href="/medicines">Full Eye Medicine Directory (${totalCount.toLocaleString('en-IN')})</a> &middot; <a href="/#enquiry">Search &amp; Enquire</a></li>
            <li>Open Data: <a href="/api/catalog">JSON API</a> &middot; <a href="/sitemap.xml">Sitemap</a> &middot; <a href="/llms.txt">llms.txt</a> &middot; <a href="/llms-full.txt">llms-full.txt</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; 2026 Drishti Medical Store (<span lang="hi">दृष्टि मेडिकल स्टोर</span>) &bull; Basti, UP.</span>
        <span><strong>Medical Disclaimer:</strong> Informational ophthalmic catalogue and local counter availability enquiry only &mdash; no online ordering or home delivery. We do not prescribe medicine. Prescription medicines are dispensed strictly against a valid written prescription from a licensed doctor or ophthalmologist brought in person at counter pickup.</span>
      </div>
    </div>
  </footer>`;
}

function buildPharmacyEntity(withId = true) {
  const entity = {
    '@type': ['Pharmacy', 'LocalBusiness'],
    ...(withId ? { '@id': `${STORE_INFO.siteUrl}/#store` } : {}),
    name: STORE_INFO.name,
    alternateName: [STORE_INFO.hindiName, STORE_INFO.shortName],
    url: `${STORE_INFO.siteUrl}/`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: STORE_INFO.streetAddress,
      addressLocality: STORE_INFO.city,
      addressRegion: STORE_INFO.region,
      postalCode: STORE_INFO.postalCode,
      addressCountry: STORE_INFO.country
    },
    areaServed: ['Basti', 'Siddharthnagar', 'Sant Kabir Nagar', 'Purvanchal, Uttar Pradesh'],
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        ...STORE_INFO.openingHoursSpecification
      }
    ],
    hasMap: STORE_INFO.mapsUrl
  };
  return entity;
}

function renderMedicinePage(rec, alternatives, totalCount) {
  const titleParts = [rec.name];
  if (rec.strength && !rec.name.toLowerCase().includes(rec.strength.toLowerCase())) {
    titleParts.push(rec.strength);
  }
  const pageTitle = `${titleParts.join(' ')} — ${rec.form || 'Eye Medicine'} | ${STORE_INFO.name}, Basti`;
  const canonicalUrl = rec.product_url;
  const ogImage = rec.image_url || STORE_INFO.defaultImage;

  const additionalProperty = [
    { '@type': 'PropertyValue', name: 'Availability Status', value: rec.availability_status }
  ];
  if (rec.generic_name) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Generic Name', value: rec.generic_name });
  }
  if (rec.composition) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Composition', value: rec.composition });
  }
  if (rec.strength) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Strength', value: rec.strength });
  }
  if (rec.form) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Dosage Form', value: rec.form });
  }
  if (rec.pack_size) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Pack Size', value: rec.pack_size });
  }
  additionalProperty.push({
    '@type': 'PropertyValue',
    name: 'Pricing Policy',
    value: 'Price confirmed with store staff on enquiry; no online checkout'
  });

  // Intentionally omit Offer / AggregateRating / Review because live selling price & reviews are unverified.
  const productEntity = {
    '@type': 'Product',
    '@id': `${canonicalUrl}#product`,
    name: rec.name,
    url: canonicalUrl,
    sku: rec.id,
    productID: rec.id,
    category: rec.category,
    description: rec.description,
    ...(rec.brand ? { brand: { '@type': 'Brand', name: rec.brand } } : {}),
    ...(rec.manufacturer ? { manufacturer: { '@type': 'Organization', name: rec.manufacturer } } : {}),
    ...(rec.image_url ? { image: rec.image_url } : {}),
    isRelatedTo: { '@id': `${STORE_INFO.siteUrl}/#store` },
    additionalProperty
  };

  const breadcrumbEntity = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${STORE_INFO.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Eye Medicines', item: `${STORE_INFO.siteUrl}/medicines` },
      {
        '@type': 'ListItem',
        position: 3,
        name: rec.category,
        item: `${STORE_INFO.siteUrl}/medicines/${rec.category_slug}`
      },
      { '@type': 'ListItem', position: 4, name: rec.name, item: canonicalUrl }
    ]
  };

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbEntity, productEntity, buildPharmacyEntity(true)]
  };

  const specRows = [
    ['Product Name', rec.name],
    rec.brand ? ['Brand Name', rec.brand] : null,
    rec.generic_name ? ['Generic Name', rec.generic_name] : null,
    rec.composition ? ['Composition / Active Ingredients', rec.composition] : null,
    rec.strength ? ['Strength', rec.strength] : null,
    rec.form ? ['Dosage Form', rec.form] : null,
    rec.pack_size ? ['Pack Size', rec.pack_size] : null,
    rec.manufacturer ? ['Manufacturer', rec.manufacturer] : null,
    ['Ophthalmic Category', rec.category],
    ['Catalogue Reference ID', rec.id, true],
    rec.source ? ['Catalogue Source', rec.source] : null,
    ['Availability Status', 'Confirm with store (contact_store)'],
    ['Selling Price (INR)', 'Confirmed on enquiry callback (not fixed online)'],
    ['Prescription Requirement', rec.prescription_note]
  ].filter(Boolean);

  return `${renderSharedHead({
    title: pageTitle,
    description: rec.description.slice(0, 295),
    canonicalUrl,
    ogType: 'product',
    ogImage,
    jsonAlternateUrl: `/api/medicine/${encodeURIComponent(rec.id)}`,
    jsonLdGraph
  })}
<body>
  ${renderSharedHeader()}
  <main class="subpage-main">
    <div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumbs">
        <ol>
          <li><a href="/" data-i18n="bc-home">Home</a></li>
          <li><a href="/medicines" data-i18n="bc-medicines">Eye Medicines</a></li>
          <li><a href="/medicines/${escapeHtml(rec.category_slug)}">${escapeHtml(rec.category)}</a></li>
          <li><a href="/medicine/${escapeHtml(rec.slug)}" aria-current="page">${escapeHtml(rec.name)}</a></li>
        </ol>
      </nav>

      <article class="detail-hero-card liquid-glass" aria-labelledby="main-heading">
        <div class="detail-hero-grid${rec.image_path ? '' : ' detail-hero-grid--no-img'}">
          ${rec.image_path ? `<figure class="detail-media"><img src="${escapeHtml(rec.image_path)}" alt="${escapeHtml(rec.name)}" width="320" height="320" decoding="async"></figure>` : ''}
          <div class="detail-header-copy">
            <div class="detail-badges">
              ${rec.form ? `<span class="badge badge-drop">${escapeHtml(rec.form)}</span>` : ''}
              <a class="badge" href="/medicines/${escapeHtml(rec.category_slug)}">${escapeHtml(rec.category)}</a>
            </div>
            <h1 id="main-heading" tabindex="-1">${escapeHtml(rec.name)}</h1>
            <p class="detail-subtitle">${escapeHtml(rec.description)}</p>
            <div class="detail-status-banner" role="note">
              <strong data-i18n="detail-status-title">Counter Availability &amp; Pricing Notice</strong>
              <p data-i18n="detail-status-copy">${escapeHtml(rec.availability_note)}</p>
            </div>
            <div class="detail-cta-row">
              <a class="btn btn-primary btn-lg" href="/?medicine=${encodeURIComponent(rec.id)}#enquiry" data-i18n="detail-cta">Enquire about availability and price</a>
              <a class="btn btn-secondary btn-lg" href="/medicines/${escapeHtml(rec.category_slug)}">More in ${escapeHtml(rec.category)}</a>
              <a class="btn-text" href="/api/medicine/${encodeURIComponent(rec.id)}">Medicine JSON &rarr;</a>
            </div>
          </div>
        </div>
      </article>

      <div class="detail-two-col">
        <section class="detail-card liquid-glass" aria-labelledby="specs-title">
          <h2 id="specs-title" data-i18n="detail-specs-heading">Verified Medicine Specifications</h2>
          <dl class="detail-spec-dl">
            ${specRows
              .map(
                ([dt, dd, isMono]) => `
            <div class="detail-spec-row">
              <dt>${escapeHtml(dt)}</dt>
              <dd${isMono ? ' class="mono"' : ''}>${escapeHtml(dd)}</dd>
            </div>`
              )
              .join('')}
          </dl>
        </section>

        <aside class="detail-card liquid-glass" aria-labelledby="store-card-title">
          <h2 id="store-card-title" data-i18n="detail-store-heading">Store Identity &amp; Counter Pickup</h2>
          <p><strong>${escapeHtml(STORE_INFO.name)}</strong> (<span lang="hi">${escapeHtml(STORE_INFO.hindiName)}</span>)</p>
          <p>${escapeHtml(STORE_INFO.address)}</p>
          <dl class="detail-spec-dl detail-spec-dl--compact">
            <div class="detail-spec-row"><dt>OPD Counter Hours</dt><dd>${escapeHtml(STORE_INFO.hours)}</dd></div>
            <div class="detail-spec-row"><dt>Fulfilment Mode</dt><dd>In-person counter pickup after callback confirmation (no online ordering or delivery)</dd></div>
            <div class="detail-spec-row"><dt>Hospital Campus Line</dt><dd><a href="tel:${escapeHtml(STORE_INFO.campusInquiryPhone)}">${escapeHtml(STORE_INFO.campusInquiryPhone)}</a></dd></div>
            <div class="detail-spec-row"><dt>Location Map</dt><dd><a href="${escapeHtml(STORE_INFO.mapsUrl)}" target="_blank" rel="noopener noreferrer">Open Google Maps Pin &rarr;</a></dd></div>
          </dl>
          <p class="detail-disclaimer-note">
            We do not prescribe medicine or advise dosage. Prescription ophthalmic medicines require a valid doctor or ophthalmologist prescription at pickup.
          </p>
        </aside>
      </div>

      ${alternatives.length > 0 ? `<section class="detail-alternatives" aria-labelledby="alt-title">
        <h2 id="alt-title" data-i18n="detail-alt-heading">Same Composition &amp; Dosage Form Formulations</h2>
        <p class="section-sub">Other brands in our catalogue with verified matching active composition &amp; dosage form:</p>
        <ul class="directory-grid">
          ${alternatives
            .map(
              (alt) => `
          <li class="directory-card">
            <a class="directory-card-title" href="/medicine/${escapeHtml(alt.slug)}">${escapeHtml(alt.name)}</a>
            <div class="directory-card-meta">${escapeHtml([alt.manufacturer, alt.pack_size].filter(Boolean).join(' • '))}</div>
            <div class="directory-card-comp">${escapeHtml(alt.composition || '')}</div>
          </li>`
            )
            .join('')}
        </ul>
      </section>` : ''}
    </div>
  </main>
  ${renderSharedFooter(totalCount)}
</body>
</html>
`;
}

function renderDirectoryPage({
  title,
  heading,
  lead,
  description,
  canonicalUrl,
  basePath,
  pageNum,
  totalPages,
  items,
  categories,
  activeCategorySlug = null,
  totalAllCount,
  breadcrumbItems
}) {
  const prevUrl = pageNum > 1 ? (pageNum === 2 ? `${STORE_INFO.siteUrl}${basePath}` : `${STORE_INFO.siteUrl}${basePath}/page/${pageNum - 1}`) : null;
  const nextUrl = pageNum < totalPages ? `${STORE_INFO.siteUrl}${basePath}/page/${pageNum + 1}` : null;

  const pageHref = (p) => (p === 1 ? basePath : `${basePath}/page/${p}`);

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems.map((bc, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: bc.name,
          item: `${STORE_INFO.siteUrl}${bc.href}`
        }))
      },
      {
        '@type': 'CollectionPage',
        name: heading,
        url: canonicalUrl,
        description,
        isPartOf: { '@id': `${STORE_INFO.siteUrl}/#store` },
        numberOfItems: items.length
      },
      buildPharmacyEntity(true)
    ]
  };

  // Compact numeric window around current page
  const pageNumbers = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - pageNum) <= 2) {
      pageNumbers.push(p);
    } else if (pageNumbers[pageNumbers.length - 1] !== '...') {
      pageNumbers.push('...');
    }
  }

  return `${renderSharedHead({
    title,
    description,
    canonicalUrl,
    prevUrl,
    nextUrl,
    jsonAlternateUrl: '/api/catalog',
    jsonLdGraph
  })}
<body>
  ${renderSharedHeader()}
  <main class="subpage-main">
    <div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumbs">
        <ol>
          ${breadcrumbItems
            .map((bc, i) => {
              const isLast = i === breadcrumbItems.length - 1;
              return `<li><a href="${escapeHtml(bc.href)}"${isLast ? ' aria-current="page"' : ''}>${escapeHtml(bc.name)}</a></li>`;
            })
            .join('\n          ')}
        </ol>
      </nav>

      <header class="directory-head liquid-glass">
        <h1 id="main-heading" tabindex="-1">${escapeHtml(heading)}</h1>
        <p class="lead">${escapeHtml(lead)}</p>
        <div class="detail-cta-row">
          <a class="btn btn-primary btn-sm" href="/#medicine-search">Instant Medicine Search &amp; Enquiry</a>
          <a class="btn btn-secondary btn-sm" href="/api/catalog">Public Catalog JSON API</a>
        </div>
        <nav class="directory-cats" aria-label="Ophthalmic categories">
          <a class="filter-pill${activeCategorySlug === null ? ' is-current' : ''}" href="/medicines"${activeCategorySlug === null ? ' aria-current="true"' : ''}>All (${totalAllCount.toLocaleString('en-IN')})</a>
          ${categories
            .map(
              (c) =>
                `<a class="filter-pill${activeCategorySlug === c.slug ? ' is-current' : ''}" href="/medicines/${escapeHtml(c.slug)}"${activeCategorySlug === c.slug ? ' aria-current="true"' : ''}>${escapeHtml(c.label)} (${c.count.toLocaleString('en-IN')})</a>`
            )
            .join('\n          ')}
        </nav>
      </header>

      <p class="directory-page-status">Page <strong>${pageNum}</strong> of <strong>${totalPages}</strong> &bull; Availability confirmed by store staff via callback (<code>contact_store</code>)</p>

      <ul class="directory-grid">
        ${items
          .map(
            (rec) => `
        <li class="directory-card">
          <a class="directory-card-title" href="/medicine/${escapeHtml(rec.slug)}">${escapeHtml(rec.name)}</a>
          <div class="directory-card-meta">${escapeHtml([rec.manufacturer, rec.form, rec.pack_size].filter(Boolean).join(' • '))}</div>
          <div class="directory-card-comp">${escapeHtml(rec.composition || rec.generic_name || '')}</div>
          <div class="directory-card-actions">
            <a class="btn-text" href="/medicine/${escapeHtml(rec.slug)}">Details &rarr;</a>
            <a class="btn-text" href="/?medicine=${encodeURIComponent(rec.id)}#enquiry">Enquire</a>
          </div>
        </li>`
          )
          .join('')}
      </ul>

      ${totalPages > 1 ? `<nav class="pagination-nav" aria-label="Pagination">
        ${pageNum > 1 ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(pageHref(pageNum - 1))}" rel="prev">&larr; Previous</a>` : `<span class="pagination-disabled" aria-disabled="true">&larr; Previous</span>`}
        <ol class="pagination-list">
          ${pageNumbers
            .map((item) =>
              item === '...'
                ? `<li class="pagination-ellipsis" aria-hidden="true">&hellip;</li>`
                : `<li><a class="pagination-link${item === pageNum ? ' is-current' : ''}" href="${escapeHtml(pageHref(item))}"${item === pageNum ? ' aria-current="page"' : ''}>${item}</a></li>`
            )
            .join('')}
        </ol>
        ${pageNum < totalPages ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(pageHref(pageNum + 1))}" rel="next">Next &rarr;</a>` : `<span class="pagination-disabled" aria-disabled="true">Next &rarr;</span>`}
      </nav>` : ''}
    </div>
  </main>
  ${renderSharedFooter(totalAllCount)}
</body>
</html>
`;
}

function buildLlmsTxt(records, categories) {
  const catSummary = categories
    .slice(0, 8)
    .map((c) => `${c.label} (${c.count})`)
    .join(', ');
  return `# ${STORE_INFO.name} (${STORE_INFO.hindiName}) — ${STORE_INFO.shortName}

> Open, machine-readable ophthalmic medicine catalogue and counter availability enquiry portal at ${STORE_INFO.siteUrl}/

${STORE_INFO.name} (${STORE_INFO.shortName}) is an **eye-only ophthalmic medical store** physically located inside **Sant Kabir Eye Hospital, Bansi Road, Near Pindari Hospital, Katra, Basti, Moor Ghat, Uttar Pradesh – 272001, India** ([santkabireyehospital.piecs.org](${STORE_INFO.hospitalUrl}) | Google Maps: ${STORE_INFO.mapsUrl} | OPD Hours: ${STORE_INFO.hours} | Campus Hospital Inquiry: ${STORE_INFO.campusInquiryPhone}).

- **Catalogue Size:** ${records.length.toLocaleString('en-IN')} indexed ophthalmic formulations, eye drops, gels, ointments, and surgical eye-care supplies (dynamically built from our verified dataset).
- **Main Categories:** ${catSummary}.
- **Availability Semantics (\`availability_status\`):** All records currently report \`"contact_store"\` — appearing in our reference catalogue does NOT claim guaranteed immediate physical stock. Staff confirm live shelf availability and selling price (INR) by phone callback before pickup.
- **Pricing Policy:** Selling prices are omitted (\`price: null\`, \`currency: "INR"\`, \`price_status: "confirm_with_store"\`) rather than invented or estimated.

## Public Discovery URLs & Read-Only Catalogue API (No Auth Required)

- **Medicine Detail Pages:** \`${STORE_INFO.siteUrl}/medicine/{medicine-slug}\` (crawlable static HTML with Schema.org \`Product\` & \`BreadcrumbList\` JSON-LD, e.g. \`/medicine/moxicip-eye-drop\`, \`/medicine/refresh-tears-eye-drop\`)
- **Browseable HTML Directory:** \`${STORE_INFO.siteUrl}/medicines\` (paginated directory + category hubs)
- **Full Sitemap:** \`${STORE_INFO.siteUrl}/sitemap.xml\` (every public medicine URL)
- **Paginated Catalogue API:** \`GET ${STORE_INFO.siteUrl}/api/catalog?page=1&limit=50\`
- **Full Catalogue JSON Export:** \`GET ${STORE_INFO.siteUrl}/api/catalog.json\`
- **Single Medicine Lookup:** \`GET ${STORE_INFO.siteUrl}/api/medicine/{id-or-slug}\`
- **Search API (Brand / Generic / Composition / Manufacturer / Typos / Hindi):** \`GET ${STORE_INFO.siteUrl}/api/search?q={query}\`
- **Extended AI Agent Documentation:** \`${STORE_INFO.siteUrl}/llms-full.txt\`

## Enquiry & Prescription Policy

- **Enquiry-Only Counter Pickup (No Online Orders or Delivery):** Patients check items via \`${STORE_INFO.siteUrl}/#enquiry\` or follow \`enquiry_url\` from any medicine record (\`POST /api/enquiry\`), after which store staff call back to confirm live stock and INR price.
- **Prescription Policy:** We do NOT prescribe medicine or provide medical advice. Prescription ophthalmic medicines require an original valid written prescription from a licensed doctor or ophthalmologist at physical pickup.
`;
}

function buildLlmsFullTxt(records, categories, exampleRecord) {
  const catLines = categories
    .map(
      (c) =>
        `- **${c.label}** (\`${c.count}\` records): \`${STORE_INFO.siteUrl}/medicines/${c.slug}\` (filter: \`/api/catalog?category=${c.slug}\`)`
    )
    .join('\n');

  return `# ${STORE_INFO.name} (${STORE_INFO.hindiName}) — Complete Catalogue & API Reference for AI Search & Agents

> Full machine-readable integration guide for ${STORE_INFO.siteUrl}/

## 1. Verified Business Identity & Physical Location

- **Business Name:** ${STORE_INFO.name} (${STORE_INFO.hindiName} / ${STORE_INFO.shortName})
- **Specialization:** Strictly eyes and ophthalmic care only (everyday eye drops, pre-operative medicines, post-operative recovery medicines, lubricating eye drops & gels, eye ointments, sterile eye-care supplies).
- **Physical Address:** ${STORE_INFO.address}
- **Surrounding Service Region:** Basti, Siddharthnagar, Sant Kabir Nagar, and nearby Purvanchal districts in Uttar Pradesh, India.
- **Counter Operating Hours:** ${STORE_INFO.hours} (aligned with Sant Kabir Eye Hospital OPD; Sunday emergencies confirm by call).
- **Google Maps Pin:** ${STORE_INFO.mapsUrl}
- **Campus Hospital Website:** ${STORE_INFO.hospitalUrl}
- **Campus Hospital Inquiry Phone:** ${STORE_INFO.campusInquiryPhone}

## 2. Catalogue Overview (${records.length.toLocaleString('en-IN')} Total Records)

Every item in \`ophthalmic-products.json\` is published as an independent, canonical HTML page plus structured JSON record. Do NOT hallucinate unverified items inside \`/llms.txt\` — query the public endpoints below to retrieve real catalogue records.

### Ophthalmic Categories
${catLines}

## 3. Public Medicine URL Structure

- **Individual Medicine Page:** \`${STORE_INFO.siteUrl}/medicine/{medicine-slug}\`
  - Returns \`200 OK\` static crawlable HTML with Schema.org \`Product\`, \`Brand\`, \`Organization\`, \`BreadcrumbList\`, and \`Pharmacy\` JSON-LD, Open Graph metadata, canonical URL, and verified specifications.
  - Nonexistent slugs return HTTP \`404\`.
  - Direct conversion path: each page links \`"Enquire about availability and price"\` to \`/?medicine={id}#enquiry\`, pre-selecting the medicine in the storefront enquiry list.
- **Catalogue Directory:** \`${STORE_INFO.siteUrl}/medicines\` (paginated at \`/medicines/page/{n}\`, 100 records per page).
- **XML Sitemap:** \`${STORE_INFO.siteUrl}/sitemap.xml\` lists every core page, category hub, directory page, and all ${records.length.toLocaleString('en-IN')} individual medicine URLs.

## 4. Public Read-Only Catalogue JSON API (CORS Enabled, No API Key Required)

All \`GET\` catalogue endpoints allow cross-origin read access (\`Access-Control-Allow-Origin: *\`) with edge caching headers.

### Endpoints

1. \`GET ${STORE_INFO.siteUrl}/api/catalog\`
   - Paginated JSON listing.
   - Query parameters:
     - \`page\` (1-indexed integer, default \`1\`)
     - \`limit\` (integer, default \`50\`, max \`200\`)
     - \`category\` (optional category slug, e.g. \`glaucoma-and-eye-pressure\`)
     - \`form\` (optional dosage form, e.g. \`Eye Drops\`, \`Eye Ointment\`)
     - \`manufacturer\` (optional manufacturer filter substring)
     - \`brand\` (optional brand filter substring)
     - \`composition\` (optional ingredient filter substring)
2. \`GET ${STORE_INFO.siteUrl}/api/catalog.json\`
   - Without query parameters: serves the full static catalogue export (${records.length.toLocaleString('en-IN')} normalized items + store metadata).
   - With \`page\` / \`limit\` / filter params: returns paginated filtered JSON identically to \`/api/catalog\`.
3. \`GET ${STORE_INFO.siteUrl}/api/medicine/{id-or-slug}\`
   - Retrieves one verified medicine record by \`id\` (e.g. \`${exampleRecord.id}\`) or \`slug\` (e.g. \`${exampleRecord.slug}\`), plus matching generic equivalents. Returns HTTP \`404\` JSON if nonexistent.
4. \`GET ${STORE_INFO.siteUrl}/api/search?q={query}\`
   - Searches by brand, generic ingredient, composition, manufacturer, strength (e.g. \`0.5%\`), dosage form (\`eye ointment\`), abbreviations (\`CMC\`, \`HPMC\`, \`SH\`), common spelling mistakes (\`Sipla\` -> \`Cipla\`, \`Moxisipp\` -> \`Moxicip\`), and Hindi Devanagari terms (\`रिफ्रेश टियर्स\`, \`सिपला\`).
   - Supports \`page\` and \`limit\` (default \`20\`, max \`100\`), optional \`form\` filter, and returns \`results\`, \`alternatives\`, \`related\`, and \`total_matches\`.

### Example Medicine Record JSON

\`\`\`json
${JSON.stringify(exampleRecord, null, 2)}
\`\`\`

### Fields Reference

- \`id\`: Verified stable product identifier in our dataset.
- \`slug\`: Canonical URL slug used under \`/medicine/{slug}\`.
- \`name\`: Full listed medicine/product title.
- \`brand\`: Manufacturer brand label (kept distinct from \`generic_name\`).
- \`generic_name\` / \`active_ingredients\`: Active clinical substance names extracted strictly from \`composition\`.
- \`composition\`: Exact verified composition and concentration string.
- \`strength\`: Verified strength string when specified in dataset, else \`null\`.
- \`form\`: Dosage form (e.g. \`Eye Drops\`, \`Ophthalmic Solution\`, \`Eye Ointment\`, \`Eye Gel\`).
- \`pack_size\`: Verified pack/volume string when specified in dataset, else \`null\`.
- \`manufacturer\`: Pharmaceutical manufacturer/marketer.
- \`category\` / \`category_slug\`: Derived ophthalmic classification.
- \`product_url\` / \`api_url\` / \`enquiry_url\`: Direct canonical links.

## 5. Availability Semantics & Pricing Policy (Critical for Accurate AI Answers)

- \`"catalogued"\`: Product exists in the catalogue; live stock is unverified.
- \`"in_stock"\`: Physical stock has been reliably confirmed.
- \`"out_of_stock"\`: Product has been confirmed unavailable.
- \`"contact_store"\`: **Current default across all ${records.length.toLocaleString('en-IN')} records.** Customer must contact the store to confirm physical stock before traveling. Never state that a listed medicine is guaranteed in stock right now unless confirmed by store staff.
- **Pricing:** Accurate selling prices (\`INR\`) are confirmed by staff during callback because real-time MRP/batch pricing is not maintained online (\`price: null\`, \`currency: "INR"\`, \`price_status: "confirm_with_store"\`). Never invent prices or fake discounts.

## 6. Patient Enquiry & Safety Workflow

- Patients visit \`enquiry_url\` (\`/?medicine={id}#enquiry\`) or use the enquiry form on \`/\` with their name and 10-digit mobile number (\`POST /api/enquiry\`).
- \`POST /api/enquiry\` validates inputs, enforces rate limiting, notifies counter staff privately via server-side Telegram Bot integration, and does NOT publicly expose patient phone numbers or names.
- Medical Safety: ${STORE_INFO.medicalPolicy}
`;
}

function main() {
  const tStart = Date.now();
  const rawDb = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const rawItems = Array.isArray(rawDb.items) ? rawDb.items : [];
  if (rawItems.length === 0) {
    throw new Error('Catalogue dataset has 0 items.');
  }

  const { records, byId, bySlug, categories } = buildCatalogIndex(rawItems);
  const engine = createOphthalmicSearchEngine(rawItems);

  // Clean generated HTML directories so removed medicines are pruned automatically
  fs.rmSync(path.join(publicDir, 'medicine'), { recursive: true, force: true });
  fs.rmSync(path.join(publicDir, 'medicines'), { recursive: true, force: true });

  // 1. Write static medicine detail pages: public/medicine/{slug}.html
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    const equivRaw = engine.getEquivalents(engine.getById(rec.id) || rawItems[i]);
    const alternatives = (equivRaw?.alternatives || [])
      .slice(0, 6)
      .map((a) => byId.get(String(a.id || '').toLowerCase()))
      .filter(Boolean);

    const html = renderMedicinePage(rec, alternatives, records.length);
    writeCleanFile(path.join(publicDir, 'medicine', `${rec.slug}.html`), html);
  }

  // 2. Write paginated directory: /medicines & /medicines/page/{2..N}
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const directoryUrls = [];
  for (let p = 1; p <= totalPages; p += 1) {
    const start = (p - 1) * PAGE_SIZE;
    const slice = records.slice(start, start + PAGE_SIZE);
    const pageUrl = p === 1 ? `${STORE_INFO.siteUrl}/medicines` : `${STORE_INFO.siteUrl}/medicines/page/${p}`;
    const filePath = p === 1
      ? path.join(publicDir, 'medicines.html')
      : path.join(publicDir, 'medicines', 'page', `${p}.html`);

    const breadcrumbs =
      p === 1
        ? [
            { name: 'Home', href: '/' },
            { name: 'Eye Medicines', href: '/medicines' }
          ]
        : [
            { name: 'Home', href: '/' },
            { name: 'Eye Medicines', href: '/medicines' },
            { name: `Page ${p}`, href: `/medicines/page/${p}` }
          ];

    const html = renderDirectoryPage({
      title:
        p === 1
          ? `Ophthalmic Medicine Directory (${records.length.toLocaleString('en-IN')} Items) | ${STORE_INFO.name}`
          : `Ophthalmic Medicine Directory — Page ${p} of ${totalPages} | ${STORE_INFO.name}`,
      heading: `Ophthalmic Medicine Directory (${records.length.toLocaleString('en-IN')} Eye Medicines)`,
      lead: `Browse all ${records.length.toLocaleString('en-IN')} indexed eye drops, gels, ointments, and ophthalmic care items available for counter enquiry at Drishti Medical Store inside Sant Kabir Eye Hospital, Basti.`,
      description: `Browse page ${p} of ${totalPages} across ${records.length.toLocaleString('en-IN')} ophthalmic eye medicines at Drishti Medical Store, Basti (UP 272001). Check compositions and enquire about counter availability.`,
      canonicalUrl: pageUrl,
      basePath: '/medicines',
      pageNum: p,
      totalPages,
      items: slice,
      categories,
      activeCategorySlug: null,
      totalAllCount: records.length,
      breadcrumbItems: breadcrumbs
    });

    writeCleanFile(filePath, html);
    directoryUrls.push({ loc: pageUrl, priority: p === 1 ? '0.9' : '0.5', changefreq: 'weekly' });
  }

  // 3. Write category directory pages: /medicines/{category-slug} (+ paginated subpages)
  for (const cat of categories) {
    const catRecords = records.filter((r) => r.category_slug === cat.slug);
    const catPages = Math.ceil(catRecords.length / PAGE_SIZE);
    for (let p = 1; p <= catPages; p += 1) {
      const start = (p - 1) * PAGE_SIZE;
      const slice = catRecords.slice(start, start + PAGE_SIZE);
      const basePath = `/medicines/${cat.slug}`;
      const pageUrl = p === 1 ? `${STORE_INFO.siteUrl}${basePath}` : `${STORE_INFO.siteUrl}${basePath}/page/${p}`;
      const filePath = p === 1
        ? path.join(publicDir, 'medicines', `${cat.slug}.html`)
        : path.join(publicDir, 'medicines', cat.slug, 'page', `${p}.html`);

      const breadcrumbs = [
        { name: 'Home', href: '/' },
        { name: 'Eye Medicines', href: '/medicines' },
        { name: cat.label, href: basePath },
        ...(p > 1 ? [{ name: `Page ${p}`, href: `${basePath}/page/${p}` }] : [])
      ];

      const html = renderDirectoryPage({
        title:
          p === 1
            ? `${cat.label} (${cat.count.toLocaleString('en-IN')} Items) | ${STORE_INFO.name}`
            : `${cat.label} — Page ${p} of ${catPages} | ${STORE_INFO.name}`,
        heading: `${cat.label} (${cat.count.toLocaleString('en-IN')} Items)`,
        lead: `Explore verified ${cat.label.toLowerCase()} listings in the Drishti Medical Store ophthalmic catalogue. Select any item to check composition and enquire about counter availability in Basti.`,
        description: `${cat.label} ophthalmic products (${cat.count} items) at Drishti Medical Store, Sant Kabir Eye Hospital, Basti. View brands, generics, strengths, and enquire for counter pickup.`,
        canonicalUrl: pageUrl,
        basePath,
        pageNum: p,
        totalPages: catPages,
        items: slice,
        categories,
        activeCategorySlug: cat.slug,
        totalAllCount: records.length,
        breadcrumbItems: breadcrumbs
      });

      writeCleanFile(filePath, html);
      directoryUrls.push({ loc: pageUrl, priority: p === 1 ? '0.8' : '0.4', changefreq: 'weekly' });
    }
  }

  // 4. Write public/sitemap.xml (homepage + AI docs + directory/category URLs + EVERY medicine URL)
  const sitemapEntries = [
    { loc: `${STORE_INFO.siteUrl}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${STORE_INFO.siteUrl}/llms.txt`, priority: '0.6', changefreq: 'monthly' },
    { loc: `${STORE_INFO.siteUrl}/llms-full.txt`, priority: '0.6', changefreq: 'monthly' },
    ...directoryUrls,
    ...records.map((r) => ({
      loc: r.product_url,
      priority: r.image_path ? '0.85' : '0.7',
      changefreq: 'monthly'
    }))
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  writeCleanFile(path.join(publicDir, 'sitemap.xml'), sitemapXml);

  // 5. Write public/api/catalog.json (public static machine-readable JSON export)
  const catalogExport = {
    ok: true,
    store: {
      name: STORE_INFO.name,
      hindi_name: STORE_INFO.hindiName,
      short_name: STORE_INFO.shortName,
      url: `${STORE_INFO.siteUrl}/`,
      address: STORE_INFO.address,
      hours: STORE_INFO.hours,
      maps_url: STORE_INFO.mapsUrl
    },
    generated_at: BUILD_ISO,
    total_records: records.length,
    availability_semantics: AVAILABILITY_SEMANTICS,
    pricing_policy: {
      currency: 'INR',
      online_pricing: false,
      note: 'Selling prices are confirmed by phone callback or at counter pickup; null indicates confirmation required.'
    },
    endpoints: {
      paginated_catalog: `${STORE_INFO.siteUrl}/api/catalog?page=1&limit=50`,
      full_catalog_json: `${STORE_INFO.siteUrl}/api/catalog.json`,
      single_medicine: `${STORE_INFO.siteUrl}/api/medicine/{id_or_slug}`,
      search: `${STORE_INFO.siteUrl}/api/search?q={query}`
    },
    categories,
    items: records
  };
  writeCleanFile(path.join(publicDir, 'api', 'catalog.json'), JSON.stringify(catalogExport));

  // 6. Write public/llms.txt and public/llms-full.txt
  const exampleRec = bySlug.get('moxicip-eye-drop') || records[0];
  writeCleanFile(path.join(publicDir, 'llms.txt'), buildLlmsTxt(records, categories));
  writeCleanFile(path.join(publicDir, 'llms-full.txt'), buildLlmsFullTxt(records, categories, exampleRec));

  const elapsedMs = Date.now() - tStart;
  console.log(
    JSON.stringify(
      {
        total_records: records.length,
        unique_slugs: bySlug.size,
        medicine_pages_generated: records.length,
        directory_pages_generated: directoryUrls.length,
        sitemap_urls: sitemapEntries.length,
        elapsed_ms: elapsedMs
      },
      null,
      2
    )
  );
}

main();
