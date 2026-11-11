import { createOphthalmicSearchEngine } from '/search-engine.js';
import { buildCatalogIndex } from '/catalog-core.js';

/**
 * Drishti Medical Store (DMS) — Interactive Catalogue & Search-First Availability Enquiry
 * Progressive-enhancement frontend + Cloudflare Pages Function (/api/enquiry).
 */

// Verified Store Configuration (populate whatsappNumber / storeEmail only with verified details)
const STORE_CONFIG = {
  name: 'Drishti Medical Store',
  hindiName: 'दृष्टि मेडिकल स्टोर',
  shortName: 'DMS',
  website: 'https://dms.piecs.org/',
  address:
    'Drishti Medical Store, Sant Kabir Eye Hospital, Bansi Road, Near Pindari Hospital, Katra, Basti, Uttar Pradesh – 272001, India',
  whatsappNumber: '', // Example when verified: '9198XXXXXXXX'
  storeEmail: '' // Example when verified: 'contact@dms.piecs.org'
};

// 1. Conditional Popover API Polyfill for older browsers
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@0.7.0/dist/popover.min.js').catch(() => {
    // Graceful no-op offline or if blocked
  });
}

// 2. Responsive Navbar Layout Switcher & Scrollspy
function initNavigation() {
  const header = document.querySelector('.site-header');
  const inner = header?.querySelector('.header-inner');
  const menu = document.getElementById('site-menu');
  const menuButton = header?.querySelector('.menu-button');

  if (!header || !inner || !menu || !menuButton) return;

  let lastCollapsedWidth = 0;

  const measureAndSync = () => {
    const wasWide = header.classList.contains('is-wide');
    const wasOpen = !wasWide && menu.matches(':popover-open, .\\:popover-open');

    if (!wasWide && lastCollapsedWidth > 0 && header.clientWidth <= lastCollapsedWidth) {
      return;
    }

    header.classList.add('is-measuring');
    header.classList.add('is-wide');
    menu.removeAttribute('popover');

    const fitsInline = inner.scrollWidth <= inner.clientWidth + 1;

    if (fitsInline) {
      lastCollapsedWidth = 0;
    } else {
      header.classList.remove('is-wide');
      menu.setAttribute('popover', 'auto');
      lastCollapsedWidth = header.clientWidth;
      if (wasOpen && typeof menu.showPopover === 'function') {
        try {
          menu.showPopover();
        } catch {
          // Ignore if polyfill still loading
        }
      }
    }

    requestAnimationFrame(() => {
      header.classList.remove('is-measuring');
    });
  };

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => measureAndSync());
    ro.observe(header);
    ro.observe(menu);
  }
  window.addEventListener('resize', measureAndSync);

  measureAndSync();
  if (document.fonts?.ready) {
    document.fonts.ready.then(measureAndSync);
  }

  menu.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    if (!header.classList.contains('is-wide') && menu.matches(':popover-open, .\\:popover-open')) {
      menu.hidePopover?.();
    }
  });

  const navLinks = [...menu.querySelectorAll('a[href^="#"]')];
  const mobileNavLinks = [...document.querySelectorAll('#mobile-bottom-nav a[data-section]')];
  const allSectionLinks = [...navLinks, ...mobileNavLinks];
  const sectionIds = [...new Set(
    navLinks
      .map((a) => a.getAttribute('href')?.slice(1))
      .filter(Boolean)
  )];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

  // Smooth jump + focus directly on search input from hero / mobile quick-search buttons
  document.querySelectorAll('a[href="#medicine-search"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const target = document.getElementById('medicine-search');
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => target.focus({ preventScroll: true }), 260);
    });
  });

  if (sections.length) {
    const setCurrent = (id) => {
      navLinks.forEach((link) => {
        if (link.getAttribute('href') === `#${id}`) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
      mobileNavLinks.forEach((link) => {
        const target = link.dataset.section;
        const active = target === id || (id === 'overview' && target === 'enquiry');
        if (active) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    };

    const supportsScrollState =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('container-type', 'scroll-state');
    let lastScrollY = window.scrollY;

    const syncActiveSection = () => {
      const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
      header.classList.toggle('scrolled', y > 24);

      if (!supportsScrollState) {
        const menuOpen = menu.matches(':popover-open, .\\:popover-open');
        if (menuOpen || y <= header.offsetHeight) {
          header.classList.remove('is-hidden');
        } else if (y !== lastScrollY) {
          header.classList.toggle('is-hidden', y > lastScrollY);
        }
      }
      lastScrollY = y;

      const markerY = Math.min(220, window.innerHeight * 0.35);
      let activeId = sections[0]?.id;
      for (const sec of sections) {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= markerY && rect.bottom > markerY) {
          activeId = sec.id;
          break;
        }
        if (rect.top <= markerY) {
          activeId = sec.id;
        }
      }
      if (activeId) setCurrent(activeId);
    };

    let rafPending = false;
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        syncActiveSection();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    syncActiveSection();
  }
  void allSectionLinks;
}

// 3. Single Polite Screen-Reader Announcer
function createPoliteAnnouncer() {
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);
  return announcer;
}

function announcePolite(announcer, text) {
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer.textContent = text;
  });
}

// 4. Read Product Metadata Directly From DOM Cards (Single Source of Truth)
function readCardMetadata(card) {
  const id = card.dataset.productId || '';
  const category = card.dataset.category || '';
  const badgeEl = card.querySelector('.product-category-label, .badge');
  const titleEl = card.querySelector('h4');
  const descEl = card.querySelector('.product-desc');
  const addBtn = card.querySelector('.js-add-enquiry');
  const imgEl = card.querySelector('.product-media img, .product-thumb img');

  const meta = {};
  card.querySelectorAll('.product-meta-row').forEach((row) => {
    const key = row.querySelector('dt')?.textContent?.trim() || '';
    const val = row.querySelector('dd')?.textContent?.trim() || '';
    if (key) meta[key] = val;
  });

  const groupTitle =
    card.closest('.catalog-section-group')?.querySelector('.catalog-subhead h3')?.textContent?.trim() ||
    'Ophthalmic Catalogue';

  return {
    id,
    category,
    groupTitle,
    badgeText: badgeEl?.textContent?.trim() || 'Ophthalmic Catalogue',
    badgeClass:
      category === 'gels-ointments'
        ? 'badge badge-ointment'
        : category === 'other-eyecare'
          ? 'badge badge-supply'
          : 'badge badge-drop',
    title: titleEl?.textContent?.trim() || addBtn?.dataset.productName || 'Ophthalmic Product',
    enquiryName: addBtn?.dataset.productName || titleEl?.textContent?.trim() || 'Ophthalmic Product',
    description: descEl?.textContent?.trim() || '',
    brand: meta.Brand || '',
    manufacturer: meta.Manufacturer || '',
    generic: meta.Generic || '',
    strength: meta.Strength || '',
    pack: meta['Pack Size'] || '',
    image: imgEl?.getAttribute('src') || null
  };
}

// 6. Accessible Validation + Shared Selected Medicines + Catalogue Bridge + Search-First Enquiry
function initCatalogueAndEnquiry(announcer) {
  // Featured showcase DOM (#catalog)
  const catSearchForm = document.getElementById('catalog-filter-form');
  const catSearchInput = document.getElementById('catalog-search');
  const filterButtons = [...document.querySelectorAll('button.filter-pill[data-category]')];
  const sectionGroups = [...document.querySelectorAll('.catalog-section-group')];
  const productCards = [...document.querySelectorAll('.product-card')];
  const countEl = document.getElementById('catalog-count');
  const emptyEl = document.getElementById('catalog-empty');
  const resetBtn = document.getElementById('reset-catalog-btn');
  const showAllBtn = document.getElementById('show-all-categories-btn');
  const requestMissingBtn = document.getElementById('request-missing-btn');
  const otherBanner = document.getElementById('other-items-banner');
  const quickChips = [...document.querySelectorAll('.quick-chip')];

  // Dialog DOM
  const dialog = document.getElementById('product-dialog');
  const dialogBadge = document.getElementById('dialog-badge');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogDesc = document.getElementById('dialog-description');
  const specCategory = document.getElementById('spec-category');
  const specBrand = document.getElementById('spec-brand');
  const specManufacturer = document.getElementById('spec-manufacturer');
  const specGeneric = document.getElementById('spec-generic');
  const specStrength = document.getElementById('spec-strength');
  const specPack = document.getElementById('spec-pack');
  const dialogAddBtn = document.getElementById('dialog-add-btn');

  // Floating bar DOM & Mobile nav counter
  const floatingBar = document.getElementById('floating-enquiry-bar');
  const floatingCountEl = document.getElementById('floating-enquiry-count');
  const mobileNavCountEl = document.getElementById('mobile-nav-count');
  const enquirySection = document.getElementById('enquiry');

  // Search-First Enquiry DOM (#enquiry)
  const form = document.getElementById('availability-enquiry-form');
  const nameInput = document.getElementById('customer-name');
  const phoneInput = document.getElementById('customer-phone');
  const medSearchInput = document.getElementById('medicine-search');
  const clearMedSearchBtn = document.getElementById('clear-medicine-search-btn');
  const searchPanel = document.getElementById('medicine-search-panel');
  const searchStatusEl = document.getElementById('search-results-status');
  const searchSourceBadge = document.getElementById('search-source-badge');
  const interpBar = document.getElementById('search-interpretation-bar');
  const searchResultsList = document.getElementById('medicine-search-results');
  const loadMoreWrap = document.getElementById('search-load-more-wrap');
  const loadMoreBtn = document.getElementById('search-load-more-btn');
  const altSection = document.getElementById('search-alternatives-section');
  const altCountEl = document.getElementById('search-alt-count');
  const altList = document.getElementById('search-alternatives-list');
  const relSection = document.getElementById('search-related-section');
  const relCountEl = document.getElementById('search-related-count');
  const relList = document.getElementById('search-related-list');
  const fallbackBox = document.getElementById('search-fallback-box');
  const addUnmatchedBtn = document.getElementById('add-unmatched-query-btn');
  const selectedPanel = document.getElementById('selected-medicines-panel');
  const selectedListEl = document.getElementById('selected-medicines-list');
  const noSelectedHint = document.getElementById('no-selected-hint');
  const selectedCountBadge = document.getElementById('selected-count-badge');
  const selectionErrorEl = document.getElementById('selection-error');
  const submitBtn = document.getElementById('enquiry-submit-btn');
  const clearFormBtn = document.getElementById('clear-enquiry-btn');

  // Confirmation DOM
  const confirmationBox = document.getElementById('enquiry-confirmation');
  const enquiryRefLine = document.getElementById('enquiry-ref-line');
  const fallbackActionsBox = document.getElementById('enquiry-fallback-actions');
  const deliveryNoteEl = document.getElementById('enquiry-delivery-note');
  const whatsappLink = document.getElementById('whatsapp-send-link');
  const emailLink = document.getElementById('email-send-link');
  const copySlipBtn = document.getElementById('copy-slip-btn');
  const downloadSlipBtn = document.getElementById('download-slip-btn');
  const copyFeedback = document.getElementById('copy-feedback');
  const newEnquiryBtn = document.getElementById('new-enquiry-btn');

  // Build seed catalog metadata & filter non-placeholder items into initial search seed
  const catalogCardMetaMap = new Map();
  const seedSearchRecords = [];

  const isUsefulMeta = (val) =>
    Boolean(val) && !/^confirm\b/i.test(val) && !/specify (prescription|item)/i.test(val);

  productCards.forEach((card) => {
    const data = readCardMetadata(card);
    if (!data.id) return;
    catalogCardMetaMap.set(data.id, data);

    card.querySelectorAll('.product-meta-row').forEach((row) => {
      const k = row.querySelector('dt')?.textContent?.trim();
      const v = row.querySelector('dd')?.textContent?.trim();
      if (k === 'Brand' && v && v === data.title) {
        row.hidden = true;
      }
    });

    if (!data.id.startsWith('cat-')) {
      seedSearchRecords.push({
        id: data.id,
        n: data.enquiryName,
        b: isUsefulMeta(data.brand) ? data.brand : data.title,
        m: isUsefulMeta(data.manufacturer) ? data.manufacturer : '',
        c: isUsefulMeta(data.generic) ? data.generic : '',
        s: isUsefulMeta(data.strength) ? data.strength : '',
        f: data.groupTitle,
        i: data.image
      });
    }
  });

  const searchEngine = createOphthalmicSearchEngine(seedSearchRecords);
  const slugById = new Map();
  let fullCatalogIndex = null;

  const urlParams = new URLSearchParams(window.location.search);
  const requestedMedicine = (urlParams.get('medicine') || '').trim();
  const requestedQuery = (urlParams.get('q') || '').trim();
  let appliedRequestedMedicine = false;

  // Lazy-fetch full Indian ophthalmic index (verified Indian ophthalmic market records)
  let datasetPromise = null;
  const ensureFullDataset = () => {
    if (datasetPromise) return datasetPromise;
    datasetPromise = fetch('/assets/data/ophthalmic-products.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          searchEngine.setItems(data.items, true);
          fullCatalogIndex = buildCatalogIndex(data.items);
          slugById.clear();
          fullCatalogIndex.records.forEach((r) => {
            if (r.id && r.slug) slugById.set(r.id.toLowerCase(), r.slug);
          });

          if (searchSourceBadge) {
            searchSourceBadge.textContent = `${data.items.length.toLocaleString('en-IN')} indexed`;
          }
          if (medSearchInput && medSearchInput.value.trim().length >= 2) {
            renderSearchResults(medSearchInput.value);
          }

          if (requestedMedicine && !appliedRequestedMedicine && fullCatalogIndex) {
            const keyLower = requestedMedicine.toLowerCase();
            const match = fullCatalogIndex.byId.get(keyLower) || fullCatalogIndex.bySlug.get(keyLower);
            if (match) {
              appliedRequestedMedicine = true;
              const selectKey = match.id || `item:${match.name.toLowerCase()}`;
              if (!selectedMap.has(selectKey)) {
                toggleProductSelection({
                  key: selectKey,
                  id: match.id,
                  name: match.name,
                  brand: match.brand || '',
                  manufacturer: match.manufacturer || '',
                  composition: match.composition || '',
                  strength: match.strength || '',
                  isUnmatched: false
                });
              }
              if (nameInput && window.location.hash === '#enquiry') {
                nameInput.focus({ preventScroll: true });
              }
            }
          }
        }
      })
      .catch(() => {
        // Keep seeded items cleanly if offline
      });
    return datasetPromise;
  };

  // Dataset loader triggered right after UI state initialization below or on idle

  // Unified Selected Medicines Map (key -> item)
  const selectedMap = new Map();
  let activeCategory = 'popular-drops';
  let activeDialogProductId = null;
  let isEnquiryInView = false;
  let enquirySubmitted = false;
  let lastSearchResults = [];
  let latestSummaryText = '';
  let latestSummaryFilename = 'drishti-medical-enquiry.txt';

  const updateFloatingBar = () => {
    const count = selectedMap.size;
    if (mobileNavCountEl) {
      mobileNavCountEl.hidden = count === 0;
      mobileNavCountEl.textContent = String(count);
    }
    if (!floatingBar) return;
    if (count === 0 || isEnquiryInView || enquirySubmitted) {
      floatingBar.hidden = true;
      return;
    }
    if (floatingCountEl) {
      floatingCountEl.textContent = count === 1 ? '1 medicine selected' : `${count} medicines selected`;
    }
    floatingBar.hidden = false;
  };

  if ('IntersectionObserver' in window && enquirySection && floatingBar) {
    const enquiryObserver = new IntersectionObserver(
      (entries) => {
        isEnquiryInView = entries.some((entry) => entry.isIntersecting);
        updateFloatingBar();
      },
      { threshold: 0.05 }
    );
    enquiryObserver.observe(enquirySection);
  }

  const syncCatalogButtons = () => {
    productCards.forEach((card) => {
      const btn = card.querySelector('.js-add-enquiry');
      if (!btn) return;
      const isSelected = selectedMap.has(btn.dataset.productId);
      btn.setAttribute('aria-pressed', String(isSelected));
      btn.textContent = isSelected ? 'Selected ✓' : 'Check Availability';
    });
    if (dialogAddBtn && activeDialogProductId) {
      const inList = selectedMap.has(activeDialogProductId);
      dialogAddBtn.textContent = inList ? 'Remove from Enquiry' : 'Add to Availability Enquiry';
    }
  };

  const renderSelectedMedicines = () => {
    if (!selectedListEl) return;
    selectedListEl.textContent = '';

    const items = [...selectedMap.values()];
    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${items.length} selected`;
    }
    if (noSelectedHint) {
      noSelectedHint.hidden = items.length > 0;
    }

    if (items.length > 0) {
      clearSelectionError();
      if (selectedPanel) selectedPanel.hidden = false;
    } else if (selectedPanel && !selectedPanel.classList.contains('has-error')) {
      selectedPanel.hidden = true;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'selected-item-row';
      li.dataset.selectedKey = item.key;

      const info = document.createElement('div');
      info.className = 'selected-item-info';

      const title = document.createElement('strong');
      title.textContent = item.name;
      info.append(title);

      if (item.isUnmatched) {
        const tag = document.createElement('span');
        tag.className = 'unmatched-badge';
        tag.textContent = 'Custom Search Query (Staff will verify inventory)';
        info.append(tag);
      } else {
        const metaParts = [];
        if (item.manufacturer) metaParts.push(item.manufacturer);
        if (item.composition) metaParts.push(item.composition);
        if (item.strength) metaParts.push(item.strength);
        if (metaParts.length > 0) {
          const sub = document.createElement('span');
          sub.textContent = metaParts.join(' • ');
          info.append(sub);
        }
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-item-btn js-remove-selected';
      removeBtn.dataset.selectedKey = item.key;
      removeBtn.setAttribute('aria-label', `Remove ${item.name} from selected medicines`);
      removeBtn.textContent = 'Remove';

      li.append(info, removeBtn);
      selectedListEl.append(li);
    });

    syncCatalogButtons();
    updateSearchResultButtons();
    updateFloatingBar();
  };

  const toggleProductSelection = (record) => {
    if (!record || !record.key) return false;
    enquirySubmitted = false;

    if (selectedMap.has(record.key)) {
      selectedMap.delete(record.key);
      renderSelectedMedicines();
      announcePolite(announcer, `Removed ${record.name} from selected medicines.`);
      return false;
    }

    selectedMap.set(record.key, record);
    renderSelectedMedicines();
    announcePolite(announcer, `${record.name} added to selected medicines.`);
    return true;
  };

  const updateSearchResultButtons = () => {
    [searchResultsList, altList, relList].forEach((listEl) => {
      if (!listEl) return;
      listEl.querySelectorAll('.js-select-search-item').forEach((btn) => {
        const key = btn.dataset.selectedKey;
        const isSelected = selectedMap.has(key);
        btn.setAttribute('aria-pressed', String(isSelected));
        btn.className = isSelected
          ? 'btn btn-secondary btn-sm result-action-btn js-select-search-item'
          : 'btn btn-primary btn-sm result-action-btn js-select-search-item';
        btn.textContent = isSelected ? 'Added ✓' : '+ Add';
        btn.closest('.search-result-card')?.classList.toggle('is-selected', isSelected);
      });
    });
  };

  // XSS-safe text highlighting via DOM Text nodes + <mark>
  const appendHighlightedText = (container, text, highlightTerms = []) => {
    const str = String(text || '');
    const cleanTerms = highlightTerms
      .filter((t) => typeof t === 'string' && t.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (!cleanTerms.length) {
      container.append(document.createTextNode(str));
      return;
    }
    const escaped = cleanTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = str.split(re);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!part) continue;
      if (i % 2 === 1) {
        const mark = document.createElement('mark');
        mark.className = 'match-hi';
        mark.textContent = part;
        container.append(mark);
      } else {
        container.append(document.createTextNode(part));
      }
    }
  };

  const buildResultCard = (rec, highlightTerms = []) => {
    const key = rec.id || `item:${rec.n.toLowerCase()}`;
    const isSelected = selectedMap.has(key);

    const li = document.createElement('li');
    li.className = `search-result-card${isSelected ? ' is-selected' : ''}${rec.i ? '' : ' has-no-thumb'}`;

    if (rec.i) {
      const thumb = document.createElement('div');
      thumb.className = 'result-thumb';
      const img = document.createElement('img');
      img.src = rec.i;
      img.alt = rec.n;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 64;
      img.height = 64;
      img.addEventListener('error', () => {
        thumb.remove();
        li.classList.add('has-no-thumb');
      });
      thumb.append(img);
      li.append(thumb);
    }

    const body = document.createElement('div');
    body.className = 'result-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'result-title-row';
    const titleEl = document.createElement('h4');
    titleEl.className = 'result-name';
    const detailSlug = rec.id ? slugById.get(String(rec.id).toLowerCase()) : '';
    if (detailSlug) {
      const detailLink = document.createElement('a');
      detailLink.className = 'result-name-link';
      detailLink.href = `/medicine/${encodeURIComponent(detailSlug)}`;
      appendHighlightedText(detailLink, rec.n, highlightTerms);
      titleEl.append(detailLink);
    } else {
      appendHighlightedText(titleEl, rec.n, highlightTerms);
    }
    titleRow.append(titleEl);

    // Only surface non-obvious match badges (typo/synonym/alternative), never generic "Exact Match" spam
    if (
      rec._matchReason &&
      !/^exact\s+(product|brand)/i.test(rec._matchReason) &&
      !/^partial\s+brand/i.test(rec._matchReason)
    ) {
      const reasonPill = document.createElement('span');
      reasonPill.className = 'match-reason-pill';
      reasonPill.textContent = rec._matchReason;
      titleRow.append(reasonPill);
    }
    body.append(titleRow);

    const subParts = [rec.m, rec.f, rec.p].filter(Boolean);
    if (subParts.length > 0) {
      const subEl = document.createElement('div');
      subEl.className = 'result-meta result-meta-sub';
      appendHighlightedText(subEl, subParts.join(' • '), highlightTerms);
      body.append(subEl);
    }

    const saltParts = [];
    if (rec.c) saltParts.push(rec.c);
    if (rec.s) {
      const existingLower = `${rec.n || ''} ${rec.c || ''} ${rec.p || ''}`.toLowerCase();
      const extraStrengthParts = rec.s
        .split(/\s*•\s*/)
        .map((x) => x.trim())
        .filter((x) => x && !existingLower.includes(x.toLowerCase()));
      if (extraStrengthParts.length > 0) {
        saltParts.push(extraStrengthParts.join(' • '));
      }
    }
    if (saltParts.length > 0) {
      const saltEl = document.createElement('div');
      saltEl.className = 'result-meta result-meta-comp';
      appendHighlightedText(saltEl, saltParts.join(' • '), highlightTerms);
      body.append(saltEl);
    }

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = isSelected
      ? 'btn btn-secondary btn-sm result-action-btn js-select-search-item'
      : 'btn btn-primary btn-sm result-action-btn js-select-search-item';
    selectBtn.dataset.selectedKey = key;
    selectBtn.dataset.recordId = rec.id || '';
    selectBtn.setAttribute('aria-pressed', String(isSelected));
    selectBtn.textContent = isSelected ? 'Added ✓' : '+ Add';

    li.append(body, selectBtn);
    return li;
  };

  const PAGE_SIZE = 6;
  let currentScoredCache = [];
  let currentShownCount = 0;
  let currentHighlightTerms = [];

  const renderPageSlice = (append = false) => {
    if (!searchResultsList) return;
    if (!append) searchResultsList.textContent = '';

    const nextSlice = currentScoredCache.slice(currentShownCount, currentShownCount + PAGE_SIZE);
    const frag = document.createDocumentFragment();
    nextSlice.forEach(({ rec, matchReason }) => {
      frag.append(buildResultCard({ ...rec, _matchReason: matchReason }, currentHighlightTerms));
    });
    searchResultsList.append(frag);
    currentShownCount += nextSlice.length;

    const remaining = currentScoredCache.length - currentShownCount;
    if (loadMoreWrap && loadMoreBtn) {
      loadMoreWrap.hidden = remaining <= 0;
      if (remaining > 0) {
        loadMoreBtn.textContent = `Show more matches (${remaining} more)`;
      }
    }
  };

  function renderSearchResults(rawQuery) {
    if (!searchPanel || !searchResultsList) return;
    const trimmed = String(rawQuery || '').trim();

    if (clearMedSearchBtn) {
      clearMedSearchBtn.hidden = trimmed.length === 0;
    }

    if (trimmed.length < 2) {
      searchPanel.hidden = true;
      searchResultsList.textContent = '';
      if (interpBar) interpBar.hidden = true;
      if (loadMoreWrap) loadMoreWrap.hidden = true;
      if (altSection) altSection.hidden = true;
      if (relSection) relSection.hidden = true;
      lastSearchResults = [];
      currentScoredCache = [];
      return;
    }

    ensureFullDataset();
    const res = searchEngine.search(trimmed, 150);
    const { results, allScored = [], alternatives = [], related = [], totalMatches, hasExactMatch, interpretation, highlightTerms = [] } = res;
    lastSearchResults = [...results, ...alternatives, ...related];
    currentScoredCache = allScored.length ? allScored : results.map((rec) => ({ rec, matchReason: rec._matchReason || '' }));
    currentShownCount = 0;
    currentHighlightTerms = highlightTerms;

    searchPanel.hidden = false;

    if (searchStatusEl) {
      if (totalMatches === 0) {
        searchStatusEl.textContent = `No exact match for "${trimmed}"`;
      } else {
        searchStatusEl.textContent = `${totalMatches} result${totalMatches === 1 ? '' : 's'}`;
      }
    }

    // Query understanding & correction chips
    if (interpBar) {
      interpBar.textContent = '';
      const chips = [];
      if (interpretation?.hasDevanagari && interpretation.transliteratedLatin) {
        chips.push(`Hindi → ${interpretation.transliteratedLatin}`);
      }
      if (interpretation?.corrections?.length) {
        interpretation.corrections.forEach((c) => chips.push(`Matched "${c.to}" for "${c.from}"`));
      }
      interpretation?.conceptLabels?.forEach((lbl) => chips.push(lbl));
      interpretation?.extractedStrengths?.forEach((st) => chips.push(`Strength: ${st}`));
      interpretation?.extractedForms?.forEach((fm) => chips.push(`Form: ${fm}`));
      interpretation?.extractedPacks?.forEach((pk) => chips.push(`Pack: ${pk}`));

      if (chips.length > 0) {
        chips.forEach((txt) => {
          const pill = document.createElement('span');
          pill.className = 'interp-pill';
          pill.textContent = txt;
          interpBar.append(pill);
        });
        interpBar.hidden = false;
      } else {
        interpBar.hidden = true;
      }
    }

    searchResultsList.hidden = currentScoredCache.length === 0;
    if (currentScoredCache.length > 0) {
      renderPageSlice(false);
    } else {
      searchResultsList.textContent = '';
      if (loadMoreWrap) loadMoreWrap.hidden = true;
    }

    // Verified Alternative Brands (Collapsed native <details> disclosure)
    if (altSection && altList) {
      altList.textContent = '';
      altSection.open = false;
      const altSlice = alternatives.slice(0, 6);
      if (altCountEl) altCountEl.textContent = String(altSlice.length);
      if (altSlice.length > 0) {
        const frag = document.createDocumentFragment();
        altSlice.forEach((rec) => {
          frag.append(buildResultCard(rec, highlightTerms));
        });
        altList.append(frag);
        altSection.hidden = false;
      } else {
        altSection.hidden = true;
      }
    }

    // Related Formulations (Collapsed native <details> disclosure)
    if (relSection && relList) {
      relList.textContent = '';
      relSection.open = false;
      const relSlice = related.slice(0, 4);
      if (relCountEl) relCountEl.textContent = String(relSlice.length);
      if (relSlice.length > 0) {
        const frag = document.createDocumentFragment();
        relSlice.forEach((rec) => {
          frag.append(buildResultCard(rec, highlightTerms));
        });
        relList.append(frag);
        relSection.hidden = false;
      } else {
        relSection.hidden = true;
      }
    }

    // Always preserve fallback submission path cleanly (Section 5 & 10)
    if (fallbackBox && addUnmatchedBtn) {
      const showFallback = !hasExactMatch || results.length === 0;
      fallbackBox.hidden = !showFallback;
      if (showFallback) {
        addUnmatchedBtn.textContent = `Add "${trimmed}" to enquiry`;
      }
    }
  }

  loadMoreBtn?.addEventListener('click', () => {
    renderPageSlice(true);
  });

  const handleSearchResultSelect = (event) => {
    const btn = event.target.closest('.js-select-search-item');
    if (!btn) return;
    const key = btn.dataset.selectedKey;
    const rec =
      searchEngine.getById(btn.dataset.recordId) ||
      lastSearchResults.find((r) => (r.id || `item:${r.n.toLowerCase()}`) === key);
    if (!rec) return;

    toggleProductSelection({
      key,
      id: rec.id,
      name: rec.n,
      brand: rec.b,
      manufacturer: rec.m,
      composition: rec.c,
      strength: rec.s,
      isUnmatched: false
    });
  };

  altList?.addEventListener('click', handleSearchResultSelect);
  relList?.addEventListener('click', handleSearchResultSelect);

  let searchDebounceTimer;
  medSearchInput?.addEventListener('focus', () => ensureFullDataset(), { once: true });
  medSearchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderSearchResults(medSearchInput.value);
    }, 110);
  });

  // IME-safe Enter handling on search box: prevent accidental form submit; jump to first result or fallback
  medSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.isComposing || event.keyCode === 229) return;
    renderSearchResults(medSearchInput.value);
    const firstBtn =
      searchResultsList?.querySelector('.js-select-search-item') ||
      (!fallbackBox?.hidden ? addUnmatchedBtn : null);
    firstBtn?.focus();
  });

  clearMedSearchBtn?.addEventListener('click', () => {
    if (!medSearchInput) return;
    medSearchInput.value = '';
    renderSearchResults('');
    medSearchInput.focus();
  });

  searchResultsList?.addEventListener('click', handleSearchResultSelect);

  addUnmatchedBtn?.addEventListener('click', () => {
    const query = (medSearchInput?.value || '').trim();
    if (query.length < 2) return;
    const key = `unmatched:${query.toLowerCase()}`;
    if (!selectedMap.has(key)) {
      toggleProductSelection({
        key,
        id: '',
        name: query,
        brand: '',
        manufacturer: '',
        composition: '',
        strength: '',
        isUnmatched: true
      });
    }
    if (medSearchInput) {
      medSearchInput.value = '';
      renderSearchResults('');
      medSearchInput.focus();
    }
  });

  selectedListEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('.js-remove-selected');
    if (!btn) return;
    const key = btn.dataset.selectedKey;
    const existing = selectedMap.get(key);
    if (!existing) return;
    selectedMap.delete(key);
    renderSelectedMedicines();
    announcePolite(announcer, `Removed ${existing.name} from selected medicines.`);
  });

  // Top Catalog Filters & Showcase Behaviour
  const updateCatalogue = () => {
    const rawQuery = (catSearchInput?.value || '').trim().toLowerCase();
    const tokens = rawQuery.split(/\s+/).filter(Boolean);
    let visibleCount = 0;

    for (const card of productCards) {
      const cat = card.dataset.category || '';
      const haystack = `${card.textContent} ${card.dataset.keywords || ''}`.toLowerCase();
      const matchesCat = tokens.length > 0 || activeCategory === 'all' || cat === activeCategory;
      const matchesQuery = tokens.length === 0 || tokens.every((tok) => haystack.includes(tok));
      const show = matchesCat && matchesQuery;
      card.hidden = !show;
      if (show) visibleCount += 1;
    }

    for (const group of sectionGroups) {
      const anyVisible = group.querySelector('.product-card:not([hidden])') !== null;
      group.hidden = !anyVisible;
    }

    if (otherBanner) {
      otherBanner.hidden = visibleCount === 0;
    }

    if (countEl) {
      if (tokens.length === 0 && activeCategory === 'popular-drops') {
        countEl.textContent =
          'Showing popular homepage eye drop examples — use Find Your Eye Medicine above for 4,291+ items';
      } else if (visibleCount === 1) {
        countEl.textContent =
          'Showing 1 listed example — use Find Your Eye Medicine above to search thousands more';
      } else {
        countEl.textContent =
          `Showing ${visibleCount} listed examples — search any medicine, brand or composition above`;
      }
    }
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }
  };

  catSearchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    updateCatalogue();
  });
  catSearchInput?.addEventListener('input', updateCatalogue);

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category || 'popular-drops';
      if (catSearchInput && catSearchInput.value.trim()) {
        catSearchInput.value = '';
      }
      filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      updateCatalogue();
    });
  });

  showAllBtn?.addEventListener('click', () => {
    const allBtn = filterButtons.find((b) => b.dataset.category === 'all');
    if (allBtn) {
      allBtn.click();
      document.getElementById('catalog-filter-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  resetBtn?.addEventListener('click', () => {
    activeCategory = 'popular-drops';
    if (catSearchInput) catSearchInput.value = '';
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === 'popular-drops')));
    updateCatalogue();
    catSearchInput?.focus();
  });

  requestMissingBtn?.addEventListener('click', () => {
    const missingTerm = (catSearchInput?.value || '').trim();
    if (confirmationBox) confirmationBox.hidden = true;
    enquirySubmitted = false;
    if (medSearchInput) {
      medSearchInput.value = missingTerm;
      renderSearchResults(missingTerm);
      medSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      medSearchInput.focus();
    } else {
      enquirySection?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const query = chip.dataset.query || chip.textContent?.trim() || '';
      if (medSearchInput) {
        ensureFullDataset();
        medSearchInput.value = query;
        renderSearchResults(query);
        medSearchInput.focus();
      } else if (catSearchInput) {
        activeCategory = 'all';
        filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === 'all')));
        catSearchInput.value = query;
        updateCatalogue();
      }
      announcePolite(announcer, `Showing search results for ${query}.`);
    });
  });

  // Catalog Check Availability & Spec Dialog clicks
  document.addEventListener('click', (event) => {
    const detailBtn = event.target.closest('.js-open-detail');
    if (detailBtn && dialog) {
      const id = detailBtn.dataset.productId;
      const spec = catalogCardMetaMap.get(id);
      if (!spec) return;

      activeDialogProductId = id;
      dialogBadge.className = spec.badgeClass;
      dialogBadge.textContent = spec.badgeText;
      dialogTitle.textContent = spec.title;
      dialogDesc.textContent = spec.description;

      const setSpec = (el, value) => {
        const row = el?.closest('.spec-row');
        if (el) el.textContent = value;
        if (row) row.hidden = !value;
      };

      setSpec(specCategory, spec.groupTitle);
      setSpec(specBrand, spec.brand);
      setSpec(specManufacturer, spec.manufacturer);
      setSpec(specGeneric, spec.generic);
      setSpec(specStrength, spec.strength);
      setSpec(specPack, spec.pack);
      syncCatalogButtons();

      dialog.showModal();
      return;
    }

    const addBtn = event.target.closest('.js-add-enquiry');
    if (addBtn) {
      const id = addBtn.dataset.productId;
      const info = catalogCardMetaMap.get(id);
      if (!info) return;
      toggleProductSelection({
        key: id,
        id,
        name: info.enquiryName,
        brand: isUsefulMeta(info.brand) ? info.brand : info.title,
        manufacturer: isUsefulMeta(info.manufacturer) ? info.manufacturer : '',
        composition: isUsefulMeta(info.generic) ? info.generic : '',
        strength: isUsefulMeta(info.strength) ? info.strength : '',
        isUnmatched: false
      });
    }
  });

  if (dialog) {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e)) dialog.close();
      });
    }

    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
    });

    dialogAddBtn?.addEventListener('click', () => {
      if (activeDialogProductId) {
        const info = catalogCardMetaMap.get(activeDialogProductId);
        if (info) {
          toggleProductSelection({
            key: activeDialogProductId,
            id: activeDialogProductId,
            name: info.enquiryName,
            brand: isUsefulMeta(info.brand) ? info.brand : info.title,
            manufacturer: isUsefulMeta(info.manufacturer) ? info.manufacturer : '',
            composition: isUsefulMeta(info.generic) ? info.generic : '',
            strength: isUsefulMeta(info.strength) ? info.strength : '',
            isUnmatched: false
          });
        }
      }
      dialog.close();
    });
  }

  // Accessible Error Announcement & Validation Helpers (modern-web-guidance)
  let announceTimer;
  let announcedField;

  const linkError = (el, shown) => {
    const errorId = el?.dataset?.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const spokenText = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    copy
      .querySelectorAll('[role="img"][aria-label]')
      .forEach((n) => n.replaceWith(`${n.getAttribute('aria-label')}: `));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };

  const announceError = (el) => {
    const error = document.getElementById(el.dataset.error);
    if (!error) return;
    const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      announcer.textContent = label + spokenText(error);
    }, 500);
  };

  const isFieldValidCustom = (el) => {
    if (el === nameInput) {
      return (nameInput.value || '').trim().length >= 2 && el.checkValidity();
    }
    if (el === phoneInput) {
      const digits = (phoneInput.value || '').replace(/\D+/g, '');
      return digits.length >= 10 && digits.length <= 15 && el.checkValidity();
    }
    return el.checkValidity();
  };

  const supportsUserInvalid = (() => {
    try {
      document.createElement('input').matches(':user-invalid');
      return true;
    } catch {
      return false;
    }
  })();

  const flagged = new WeakSet();
  const announced = new WeakSet();
  const interacted = new WeakSet();

  const syncAria = (el, announce = false, forceMarkInteracted = false) => {
    if (!el || !el.matches?.('input')) return;
    if (forceMarkInteracted) interacted.add(el);

    if (el === phoneInput && interacted.has(el)) {
      const digits = (phoneInput.value || '').replace(/\D+/g, '');
      if (phoneInput.value.trim() && (digits.length < 10 || digits.length > 15)) {
        phoneInput.setCustomValidity('Please enter a valid 10-digit mobile number.');
      } else {
        phoneInput.setCustomValidity('');
      }
    }

    const userInvalidMatch =
      (supportsUserInvalid && el.matches(':user-invalid')) ||
      (interacted.has(el) && !isFieldValidCustom(el));

    el.classList.toggle('user-invalid-fallback', userInvalidMatch);
    el.classList.toggle('user-valid-fallback', interacted.has(el) && isFieldValidCustom(el));

    if (userInvalidMatch) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  function showSelectionError() {
    if (selectedPanel) {
      selectedPanel.hidden = false;
      selectedPanel.classList.add('has-error');
    }
    if (selectionErrorEl) {
      selectionErrorEl.hidden = false;
      selectionErrorEl.classList.add('is-visible');
    }
  }

  function clearSelectionError() {
    if (selectedPanel) {
      selectedPanel.classList.remove('has-error');
      if (selectedMap.size === 0) selectedPanel.hidden = true;
    }
    if (selectionErrorEl) {
      selectionErrorEl.hidden = true;
      selectionErrorEl.classList.remove('is-visible');
    }
  }

  if (form) {
    [nameInput, phoneInput].forEach((el) => {
      if (el) el.setAttribute('aria-invalid', 'false');
    });

    form.addEventListener(
      'blur',
      (e) => {
        if (e.target === nameInput || e.target === phoneInput) {
          syncAria(e.target, true, true);
        }
      },
      true
    );

    form.addEventListener('input', (e) => {
      if (e.target === nameInput || e.target === phoneInput) {
        syncAria(e.target, false);
      }
    });

    const buildLocalSummary = ({ enquiryId, customerName, mobile, selectedItems, unmatchedQueries }) => {
      const lines = [
        'NEW MEDICINE AVAILABILITY ENQUIRY',
        `Store: ${STORE_CONFIG.name} (Sant Kabir Eye Hospital, Basti)`,
        `Enquiry ID: ${enquiryId}`,
        '',
        `Customer: ${customerName}`,
        `Mobile: ${mobile}`,
        ''
      ];
      if (selectedItems.length > 0) {
        lines.push('Requested Medicines:');
        selectedItems.forEach((item, idx) => {
          lines.push(`${idx + 1}. ${item.name}`);
          if (item.manufacturer || item.brand) {
            lines.push(`   Manufacturer: ${item.manufacturer || item.brand}`);
          }
          if (item.composition) lines.push(`   Composition: ${item.composition}`);
          if (item.id) lines.push(`   Product ID: ${item.id}`);
        });
        lines.push('');
      }
      if (unmatchedQueries.length > 0) {
        lines.push('Unmatched Search Queries:');
        unmatchedQueries.forEach((q) => lines.push(`Customer entered: "${q}"`));
        lines.push('');
      }
      lines.push('Status: Pending Callback');
      return lines.join('\n');
    };

    const generateLocalRefId = () => {
      const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
      return `ENQ-${rnd}`;
    };

    const showConfirmation = ({ enquiryId, summaryText, deliveredViaTelegram, deliveryNotice }) => {
      enquirySubmitted = true;
      updateFloatingBar();
      latestSummaryText = summaryText;
      latestSummaryFilename = `${enquiryId.toLowerCase()}-drishti-medical.txt`;

      if (enquiryRefLine) {
        enquiryRefLine.textContent = `Enquiry ID: ${enquiryId} • Status: Pending Callback`;
      }

      if (fallbackActionsBox) {
        if (deliveredViaTelegram) {
          fallbackActionsBox.hidden = true;
        } else {
          fallbackActionsBox.hidden = false;
          if (deliveryNoteEl) {
            deliveryNoteEl.textContent = deliveryNotice;
          }
          const waDigits = (STORE_CONFIG.whatsappNumber || '').replace(/\D+/g, '');
          const storeEmail = (STORE_CONFIG.storeEmail || '').trim();
          if (whatsappLink) {
            if (waDigits.length >= 10) {
              whatsappLink.href = `https://wa.me/${waDigits}?text=${encodeURIComponent(summaryText)}`;
              whatsappLink.hidden = false;
            } else {
              whatsappLink.hidden = true;
            }
          }
          if (emailLink) {
            if (storeEmail) {
              emailLink.href = `mailto:${storeEmail}?subject=${encodeURIComponent(`Availability Enquiry ${enquiryId} - ${STORE_CONFIG.name}`)}&body=${encodeURIComponent(summaryText)}`;
              emailLink.hidden = false;
            } else {
              emailLink.hidden = true;
            }
          }
        }
      }

      if (copyFeedback) copyFeedback.textContent = '';
      if (confirmationBox) {
        confirmationBox.hidden = false;
        confirmationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      announcePolite(announcer, 'Your availability enquiry has been received. Our team will call you shortly.');
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (selectedMap.size === 0) {
        showSelectionError();
        announcePolite(
          announcer,
          'Please search and select at least one medicine, or add your typed medicine search before submitting.'
        );
        medSearchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        medSearchInput?.focus();
        return;
      }

      syncAria(nameInput, false, true);
      syncAria(phoneInput, false, true);

      const nameValid = isFieldValidCustom(nameInput);
      const phoneValid = isFieldValidCustom(phoneInput);

      if (!nameValid) {
        announced.add(nameInput);
        nameInput.focus();
        return;
      }
      if (!phoneValid) {
        announced.add(phoneInput);
        phoneInput.focus();
        return;
      }

      const customerName = nameInput.value.trim();
      const mobile = phoneInput.value.replace(/\D+/g, '');
      const selectedList = [...selectedMap.values()];
      const selectedItems = selectedList
        .filter((x) => !x.isUnmatched)
        .map(({ id, name, brand, manufacturer, composition, strength }) => ({
          id,
          name,
          brand,
          manufacturer,
          composition,
          strength
        }));
      const unmatchedQueries = selectedList.filter((x) => x.isUnmatched).map((x) => x.name);

      if (submitBtn) {
        submitBtn.disabled = true;
        const lbl = submitBtn.querySelector('.btn-label');
        if (lbl) lbl.textContent = 'Submitting Enquiry...';
      }

      let resultData = null;
      try {
        const hpValue = document.getElementById('enquiry-hp')?.value || '';
        const res = await fetch('/api/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName, mobile, selectedItems, unmatchedQueries, hp_field: hpValue })
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          resultData = await res.json();
        }
      } catch {
        resultData = null;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          const lbl = submitBtn.querySelector('.btn-label');
          if (lbl) lbl.textContent = 'Submit Availability Enquiry';
        }
      }

      const enquiryId = resultData?.enquiryId || generateLocalRefId();
      const deliveredViaTelegram = Boolean(resultData?.ok && resultData?.deliveredViaTelegram);
      const summaryText =
        resultData?.formattedMessage ||
        buildLocalSummary({ enquiryId, customerName, mobile, selectedItems, unmatchedQueries });

      // Always persist a safe local copy so no customer enquiry is lost if offline/unconfigured
      try {
        const stored = JSON.parse(localStorage.getItem('dms_enquiries_v1') || '[]');
        stored.unshift({
          enquiryId,
          customerName,
          mobile,
          selectedItems,
          unmatchedQueries,
          deliveredViaTelegram,
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('dms_enquiries_v1', JSON.stringify(stored.slice(0, 20)));
      } catch {
        // Ignore storage quota or private-mode restrictions
      }

      const deliveryNotice = resultData && resultData.telegramConfigured === false
        ? 'Live staff notification is temporarily offline in this environment; your enquiry reference is saved below for Copy or Download.'
        : 'Saved locally on this device (backend notification endpoint unavailable in preview). Use Copy or Download below if needed.';

      showConfirmation({
        enquiryId,
        summaryText,
        deliveredViaTelegram,
        deliveryNotice
      });
    });

    const resetEnquiryWorkspace = () => {
      form.reset();
      selectedMap.clear();
      enquirySubmitted = false;
      clearSelectionError();
      [nameInput, phoneInput].forEach((el) => {
        if (!el) return;
        interacted.delete(el);
        flagged.delete(el);
        announced.delete(el);
        el.setCustomValidity('');
        el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        el.setAttribute('aria-invalid', 'false');
        linkError(el, false);
      });
      if (medSearchInput) medSearchInput.value = '';
      renderSearchResults('');
      renderSelectedMedicines();
      if (confirmationBox) confirmationBox.hidden = true;
    };

    clearFormBtn?.addEventListener('click', () => {
      resetEnquiryWorkspace();
      announcePolite(announcer, 'Availability enquiry cleared.');
    });

    newEnquiryBtn?.addEventListener('click', () => {
      resetEnquiryWorkspace();
      medSearchInput?.focus();
    });

    copySlipBtn?.addEventListener('click', async () => {
      if (!latestSummaryText) return;
      try {
        await navigator.clipboard.writeText(latestSummaryText);
        if (copyFeedback) copyFeedback.textContent = 'Enquiry details copied to clipboard.';
      } catch {
        if (copyFeedback) copyFeedback.textContent = 'Clipboard permission unavailable — please use Download (.txt).';
      }
    });

    downloadSlipBtn?.addEventListener('click', () => {
      if (!latestSummaryText) return;
      const blob = new Blob([latestSummaryText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = latestSummaryFilename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // Initial UI render
  updateCatalogue();
  renderSelectedMedicines();

  if (requestedMedicine || requestedQuery) {
    ensureFullDataset();
    if (requestedQuery && medSearchInput) {
      medSearchInput.value = requestedQuery;
      renderSearchResults(requestedQuery);
    }
  } else if ('requestIdleCallback' in window) {
    requestIdleCallback(() => ensureFullDataset(), { timeout: 1500 });
  } else {
    setTimeout(() => ensureFullDataset(), 450);
  }
}

// 7. Store Address Copy & Verified Contact Display
function initStoreContactActions(announcer) {
  const copyAddrBtn = document.getElementById('copy-address-btn');
  const addrFeedback = document.getElementById('address-copy-feedback');
  const contactBlock = document.getElementById('verified-contact-block');

  copyAddrBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(STORE_CONFIG.address);
      const msg = 'Store address copied to clipboard.';
      if (addrFeedback) addrFeedback.textContent = msg;
      announcePolite(announcer, msg);
    } catch {
      if (addrFeedback) {
        addrFeedback.textContent = `Copy manually: ${STORE_CONFIG.address}`;
      }
    }
  });

  if (contactBlock) {
    const waDigits = (STORE_CONFIG.whatsappNumber || '').replace(/\D/g, '');
    const emailAddr = (STORE_CONFIG.storeEmail || '').trim();
    if (waDigits.length >= 10 || emailAddr) {
      contactBlock.hidden = false;
      contactBlock.textContent = '';
      const heading = document.createElement('strong');
      heading.textContent = 'Verified Store Contact Channels: ';
      contactBlock.append(heading);
      if (waDigits.length >= 10) {
        const wa = document.createElement('a');
        wa.href = `https://wa.me/${waDigits}`;
        wa.target = '_blank';
        wa.rel = 'noopener noreferrer';
        wa.textContent = `WhatsApp (+${waDigits})`;
        contactBlock.append(wa);
      }
      if (waDigits.length >= 10 && emailAddr) {
        contactBlock.append(document.createTextNode(' • '));
      }
      if (emailAddr) {
        const mail = document.createElement('a');
        mail.href = `mailto:${emailAddr}`;
        mail.textContent = emailAddr;
        contactBlock.append(mail);
      }
    }
  }
}

// 8. Bilingual EN / Hindi UI Switcher (Aligned with Sant Kabir Eye Hospital)
function initLanguageSwitch(announcer) {
  const btnEn = document.getElementById('btnLangEn');
  const btnHi = document.getElementById('btnLangHi');
  if (!btnEn || !btnHi) return;

  const enTexts = new Map();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    enTexts.set(el.dataset.i18n, el.textContent);
  });

  const hiMap = {
    'nav-overview': 'मुख्य पृष्ठ',
    'nav-search': 'दवा खोजें',
    'nav-products': 'उत्पाद सूची',
    'nav-how': 'समय व पिकअप',
    'nav-location': 'नक्शा',
    'nav-cta': 'मेरी सूची',
    'hero-badge-hospital': 'संत कबीर नेत्र चिकित्सालय, बस्ती के अंदर',
    'hero-badge-eye': 'केवल नेत्र देखभाल फ़ार्मेसी',
    'hero-desc':
      'संत कबीर नेत्र चिकित्सालय, बांसी रोड, कटरा (272001) के अंदर। यहाँ दैनिक, ऑपरेशन-पूर्व और ऑपरेशन-पश्चात केवल आँखों की दवाइयाँ मिलती हैं, काउंटर पिकअप पर वैध पर्चे के साथ।',
    'hero-disclaimer':
      'केवल स्थानीय उपलब्धता पूछताछ — कोई ऑनलाइन ऑर्डर या होम डिलीवरी नहीं। हम किसी भी रूप में दवा प्रिस्क्राइब नहीं करते; पिकअप के समय वैध डॉक्टर / नेत्र रोग विशेषज्ञ का पर्चा अनिवार्य है।',
    'cta-explore': 'नेत्र दवा खोजें',
    'cta-browse': 'लोकप्रिय ड्रॉप्स',
    'cta-location': 'नक्शा व समय',
    'stat-cat': '9:00 AM – 6:00 PM OPD समय',
    'stat-loc': 'बांसी रोड, कटरा • 272001',
    'stat-pickup': 'वैध डॉक्टर पर्चा आवश्यक',
    'cat-title': 'लोकप्रिय आई ड्रॉप्स और सामान्य नेत्र श्रेणियाँ',
    'cat-lead':
      'नीचे श्रेणियाँ स्वाइप या फ़िल्टर करें — या ऊपर "अपनी नेत्र दवा खोजें" में 4,291+ दवाइयाँ खोजें।',
    'how-title': 'नेत्र देखभाल व विश्वसनीय उपलब्धता',
    'how-lead':
      'बांसी रोड स्थित संत कबीर नेत्र चिकित्सालय के अंदर हमारा काउंटर केवल नेत्र दवाइयाँ उपलब्ध कराता है और आपके आने से पहले फ़ोन कॉल द्वारा स्टॉक की पुष्टि करता है।',
    'step1-title': 'सरल खोज-आधारित नेत्र दवा पूछताछ',
    'step1-desc':
      'दवा का नाम, ब्रांड, कंपनी या कंपोज़िशन लिखकर तुरंत खोजें, मनचाही दवाएँ चुनें (Select) और उपलब्धता पूछताछ भेजें।',
    'step2-title': 'स्वयं दवा नहीं लिखते • फ़ोन कॉल द्वारा पुष्टि',
    'step2-desc':
      'हम कोई दवा प्रिस्क्राइब नहीं करते; पिकअप के समय वैध डॉक्टर / नेत्र विशेषज्ञ का पर्चा लाएँ। हमारी टीम फ़ोन कॉल करके उपलब्धता और कीमत की पुष्टि करेगी।',
    'step3-title': 'सुविधा के लिए कॉल द्वारा पुष्टि',
    'step4-title': 'वैध पर्चे के साथ पिकअप',
    'step4-desc':
      'कॉल द्वारा पुष्टि के बाद संत कबीर नेत्र चिकित्सालय, बांसी रोड, कटरा, बस्ती – 272001 स्थित दृष्टि मेडिकल स्टोर पर अपना वैध डॉक्टर / नेत्र विशेषज्ञ का पर्चा दिखाकर दवा लें; बिना पर्चे के दवा नहीं दी जाती।',
    'enq-title': 'अपनी नेत्र दवा खोजें',
    'enq-lead':
      'दवा का नाम, ब्रांड, कंपनी या कंपोज़िशन से खोजें। दवा चुनें और हमें उपलब्धता पूछताछ भेजें।',
    'enq-step1': 'आपका संपर्क विवरण',
    'enq-label-name': 'रोगी / ग्राहक का नाम',
    'enq-label-phone': 'मोबाइल नंबर',
    'enq-step2': 'नेत्र दवा खोजें',
    'enq-step3': 'चुनी गई दवाइयाँ',
    'enq-submit-btn': 'उपलब्धता पूछताछ भेजें',
    'enq-safeguard':
      'यह केवल उपलब्धता पूछताछ के लिए है — ऑनलाइन ऑर्डर या होम डिलीवरी नहीं। हम दवा प्रिस्क्राइब नहीं करते। प्रिस्क्रिप्शन दवाइयाँ केवल पंजीकृत डॉक्टर / नेत्र विशेषज्ञ के वैध पर्चे पर ही दी जाती हैं। अंतिम उपलब्धता व मूल्य हमारे कर्मचारी कॉल पर बताएँगे।',
    'enq-confirm-title': 'उपलब्धता पूछताछ प्राप्त हुई',
    'enq-confirm-msg':
      'आपकी पूछताछ प्राप्त हो गई है! हमारी टीम शीघ्र ही आपको कॉल करके दवा की उपलब्धता और कीमत की पुष्टि करेगी। कृपया भौतिक पिकअप के लिए स्टोर पर पधारें।',
    'loc-title': 'बस्ती में दृष्टि मेडिकल स्टोर खोजें',
    'loc-lead': 'संत कबीर नेत्र चिकित्सालय, बांसी रोड, पिंडारी अस्पताल के पास, कटरा, बस्ती के अंदर स्थित।'
  };

  const heroTitleEl = document.querySelector('[data-i18n="hero-title"]');

  const setLanguage = (lang) => {
    const isHi = lang === 'hi';
    btnEn.classList.toggle('active', !isHi);
    btnHi.classList.toggle('active', isHi);
    btnEn.setAttribute('aria-pressed', String(!isHi));
    btnHi.setAttribute('aria-pressed', String(isHi));
    document.documentElement.lang = isHi ? 'hi' : 'en';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (key === 'hero-title') {
        el.textContent = isHi
          ? 'दृष्टि मेडिकल स्टोर — बस्ती में नेत्र देखभाल फ़ार्मेसी'
          : 'Drishti Medical Store — Eye-Care Pharmacy in Basti';
        return;
      }

      if (isHi && hiMap[key]) {
        el.textContent = hiMap[key];
      } else if (!isHi && enTexts.has(key)) {
        el.textContent = enTexts.get(key);
      }
    });

    if (heroTitleEl) heroTitleEl.setAttribute('lang', isHi ? 'hi' : 'en');
    announcePolite(announcer, isHi ? 'भाषा हिन्दी में बदली गई।' : 'Language switched to English.');
  };

  btnEn.addEventListener('click', () => setLanguage('en'));
  btnHi.addEventListener('click', () => setLanguage('hi'));
}

// 8b. Light / Dark Mode Switch (Light default; overrides via <meta name="color-scheme"> + data-theme)
function initThemeToggle(announcer) {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  const themeColorMeta = document.getElementById('theme-color-meta');
  const storageKey = 'dms_theme';

  const getCurrentTheme = () => {
    if (document.documentElement.dataset.theme === 'dark') return 'dark';
    if (colorSchemeMeta?.content === 'dark') return 'dark';
    return 'light';
  };

  const applyTheme = (nextTheme, { persist = false, announce = false } = {}) => {
    const resolved = nextTheme === 'dark' ? 'dark' : 'light';
    const isDark = resolved === 'dark';

    document.documentElement.dataset.theme = resolved;
    if (colorSchemeMeta) colorSchemeMeta.content = resolved;
    if (themeColorMeta) themeColorMeta.content = isDark ? '#091322' : '#f8fafc';

    if (toggleBtn) {
      const nextLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      toggleBtn.setAttribute('aria-pressed', String(isDark));
      toggleBtn.setAttribute('aria-label', nextLabel);
      toggleBtn.setAttribute('title', nextLabel);
    }

    if (persist) {
      try {
        localStorage.setItem(storageKey, resolved);
      } catch {}
    }

    if (announce) {
      const isHi = document.documentElement.lang === 'hi';
      const msg = isHi
        ? isDark
          ? 'डार्क मोड चालू किया गया।'
          : 'लाइट मोड चालू किया गया।'
        : isDark
          ? 'Dark mode enabled.'
          : 'Light mode enabled.';
      announcePolite(announcer, msg);
    }
  };

  applyTheme(getCurrentTheme());

  toggleBtn?.addEventListener('click', () => {
    const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, { persist: true, announce: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return;
    applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });
}

// 9. Boot
function bootApp() {
  const announcer = createPoliteAnnouncer();
  initNavigation();
  initCatalogueAndEnquiry(announcer);
  initStoreContactActions(announcer);
  initLanguageSwitch(announcer);
  initThemeToggle(announcer);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
