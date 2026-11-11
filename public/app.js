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

// 5. Hybrid Amazon-Quality Inverted-Index Ophthalmic Search Engine
function createOphthalmicSearchEngine(seedItems = []) {
  const ABBREVIATIONS = {
    cmc: ['carboxymethylcellulose', 'carmellose'],
    hpmc: ['hydroxypropylmethylcellulose', 'hypromellose'],
    peg: ['polyethyleneglycol', 'polyethylene'],
    pg: ['propyleneglycol'],
    sh: ['sodiumhyaluronate', 'hyaluronate'],
    ha: ['sodiumhyaluronate', 'hyaluronate'],
    moxi: ['moxifloxacin'],
    tobra: ['tobramycin'],
    oflox: ['ofloxacin'],
    cipro: ['ciprofloxacin'],
    gati: ['gatifloxacin'],
    olo: ['olopatadine'],
    brim: ['brimonidine'],
    brimo: ['brimonidine'],
    latan: ['latanoprost'],
    trav: ['travoprost'],
    bimat: ['bimatoprost'],
    bimato: ['bimatoprost'],
    lote: ['loteprednol'],
    pred: ['prednisolone'],
    dexa: ['dexamethasone'],
    fml: ['fluorometholone'],
    fluro: ['fluorometholone'],
    fluoro: ['fluorometholone'],
    nepa: ['nepafenac'],
    brom: ['bromfenac'],
    keto: ['ketorolac', 'ketotifen'],
    cyclo: ['cyclosporine', 'cyclopentolate'],
    tim: ['timolol'],
    dorzo: ['dorzolamide'],
    brinz: ['brinzolamide'],
    nata: ['natamycin'],
    atro: ['atropine'],
    tropic: ['tropicamide'],
    pilo: ['pilocarpine']
  };

  // Concept expansion hints keyed to active chemical classes / keywords
  const CONCEPT_MAP = [
    {
      re: /\b(?:artificial\s+tears?|lubricat(?:ing|e)?\s+(?:eye\s+)?drops?|ocular\s+lubricant|eye\s+lubricant|dry\s+eyes?(?:\s+drops?)?)\b/gi,
      kw: 'lubricant',
      label: 'Dry Eye / Lubricant'
    },
    {
      re: /\b(?:anti[- ]?glaucoma|glaucoma|eye\s+pressure|ocular\s+hypertension|iop|kala\s+motiya)\b/gi,
      kw: 'antiglaucoma',
      label: 'Glaucoma'
    },
    {
      re: /\b(?:anti[- ]?allergic|eye\s+allergy|allergic\s+conjunctivitis)\b/gi,
      kw: 'antiallergic',
      label: 'Eye Allergy'
    },
    {
      re: /\b(?:anti[- ]?biotic|bacterial\s+(?:eye\s+)?infection)\b/gi,
      kw: 'antibiotic',
      label: 'Antibiotic'
    },
    {
      re: /\b(?:anti[- ]?fungal|fungal\s+keratitis)\b/gi,
      kw: 'antifungal',
      label: 'Antifungal'
    },
    {
      re: /\b(?:corticosteroids?|steroids?)\b/gi,
      kw: 'steroid',
      label: 'Steroid'
    },
    {
      re: /\b(?:nsaids?)\b/gi,
      kw: 'nsaid',
      label: 'NSAID'
    },
    {
      re: /\b(?:mydriatics?|cycloplegics?|pupil\s+dilation)\b/gi,
      kw: 'mydriatic',
      label: 'Mydriatic / Cycloplegic'
    },
    {
      re: /\b(?:jan\s*aushadhi|janaushadhi|pmbjp)\b/gi,
      kw: 'pmbjp',
      label: 'Jan Aushadhi Generic'
    }
  ];

  const FORM_PATTERNS = [
    { re: /\b(?:eye\s*\/?\s*ear|eye\/ear)\s*drops?\b/gi, key: 'eyeeardrops', label: 'Eye/Ear Drops' },
    { re: /\b(?:ophthalmic|opthalmic)\s+suspensions?\b|\beye\s+suspensions?\b/gi, key: 'ophthalmicsuspension', label: 'Ophthalmic Suspension' },
    { re: /\b(?:ophthalmic|opthalmic)\s+solutions?\b|\beye\s+solutions?\b/gi, key: 'ophthalmicsolution', label: 'Ophthalmic Solution' },
    { re: /\b(?:eye|ophthalmic|opthalmic)\s+ointments?\b|\bointments?\b/gi, key: 'eyeointment', label: 'Eye Ointment' },
    { re: /\b(?:eye|ophthalmic|opthalmic)\s+gels?\b/gi, key: 'eyegel', label: 'Eye Gel' },
    { re: /\beye\s+wash(?:es)?\b/gi, key: 'eyewash', label: 'Eye Wash' },
    { re: /\b(?:eye|ophthalmic|opthalmic|lubricating)\s+drops?\b/gi, key: 'eyedrops', label: 'Eye Drops' }
  ];

  const BRAND_ALIASES = {
    tobradex: ['tobramycin', 'dexamethasone'],
    predforte: ['prednisolone'],
    xalatan: ['latanoprost'],
    lumigan: ['bimatoprost'],
    travatan: ['travoprost'],
    alphagan: ['brimonidine'],
    vigamox: ['moxifloxacin'],
    trusopt: ['dorzolamide'],
    cosopt: ['dorzolamide', 'timolol'],
    patanol: ['olopatadine']
  };

  const MFR_ALIASES = {
    allergan: ['allergan', 'abbvie'],
    abbvie: ['allergan', 'abbvie'],
    sunpharma: ['sun', 'pharmaceutical'],
    microlabs: ['micro', 'labs'],
    bausch: ['bausch', 'lomb'],
    pmbjp: ['pmbjp', 'janaushadhi', 'aushadhi'],
    janaushadhi: ['pmbjp', 'janaushadhi', 'aushadhi']
  };

  const HINDI_PHRASE_MAP = [
    [/रिफ्रेश\s*लिक्वि\s*जेल|रिफ्रेश\s*लिक्विड\s*जेल/g, 'refresh liquigel'],
    [/रिफ्रेश\s*टियर्स/g, 'refresh tears'],
    [/सिस्टेन\s*अल्ट्रा/g, 'systane ultra'],
    [/सिस्टेन\s*जेल/g, 'systane gel'],
    [/सिस्टेन/g, 'systane'],
    [/जेंटियल|जेंटील|जेंटेल/g, 'genteal'],
    [/टीयर्स\s*नेचुरल/g, 'tears naturale'],
    [/सिपला|सिप्ला/g, 'cipla'],
    [/एलकॉन|एल्कॉन|अलकॉन/g, 'alcon'],
    [/एलर्गन|एलरगन/g, 'allergan'],
    [/सन\s*फार्मा/g, 'sun pharma'],
    [/मोक्सीसिप|मोक्सिसिप/g, 'moxicip'],
    [/सिप्लॉक्स|सिपलोक्स/g, 'ciplox'],
    [/ल्यूब्रेक्स|लुब्रेक्स/g, 'lubrex'],
    [/लैक्रिजेल|लैक्रीजेल/g, 'lacrigel'],
    [/ऑप्टिव|ओप्टिव/g, 'optive'],
    [/मोक्सीफ्लोक्सासिन|मोक्सिफ्लोक्सासिन/g, 'moxifloxacin'],
    [/सिप्रोफ्लोक्सासिन/g, 'ciprofloxacin'],
    [/ऑफ्लोक्सासिन|ओफ्लोक्सासिन/g, 'ofloxacin'],
    [/टोब्रामाइसिन/g, 'tobramycin'],
    [/कार्बोक्सीमिथाइलसेलुलोज|कार्बोक्सीमिथाइल/g, 'carboxymethylcellulose'],
    [/सोडियम\s*हायल्यूरोनेट|सोडियम\s*हायलुरोनेट/g, 'sodium hyaluronate'],
    [/टिमोलोल/g, 'timolol'],
    [/ब्रिमोनिडाइन/g, 'brimonidine'],
    [/लैटेनोप्रोस्ट/g, 'latanoprost'],
    [/ओलोपैटाडाइन|ओलोपाटाडिन/g, 'olopatadine'],
    [/नेपाफेनाक/g, 'nepafenac'],
    [/आई\s*ड्रॉप्स?|आँख(?:ों)?\s*की\s*दवा|आंख(?:ों)?\s*की\s*दवा/g, 'eye drops'],
    [/आई\s*ऑइंटमेंट|आँख\s*का\s*मल्हम|आंख\s*का\s*मल्हम/g, 'eye ointment'],
    [/आई\s*जेल/g, 'eye gel'],
    [/सूखी\s*आँख|सूखी\s*आंख|ड्राई\s*आई/g, 'dry eye'],
    [/काला\s*मोतिया|ग्लूकोमा/g, 'glaucoma'],
    [/जन\s*औषधि/g, 'jan aushadhi']
  ];

  const DEV_CONSONANTS = {
    क: 'k', ख़: 'kh', ख: 'kh', ग: 'g', ग़: 'g', घ: 'gh', ङ: 'n',
    च: 'ch', छ: 'chh', ज: 'j', ज़: 'z', झ: 'jh', ञ: 'n',
    ट: 't', ठ: 'th', ड: 'd', ड़: 'd', ढ: 'dh', ढ़: 'dh', ण: 'n',
    त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
    प: 'p', फ: 'ph', फ़: 'f', ब: 'b', भ: 'bh', म: 'm',
    य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h'
  };
  const DEV_VOWELS = {
    अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri',
    ए: 'e', ऐ: 'e', ओ: 'o', औ: 'o', ऑ: 'o',
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'e', 'ो': 'o', 'ौ': 'o', 'ॉ': 'o'
  };

  const devanagariToLatin = (text) => {
    if (!/[\u0900-\u097F]/.test(text)) return text;
    let out = String(text);
    for (let i = 0; i < HINDI_PHRASE_MAP.length; i += 1) {
      const [pat, rep] = HINDI_PHRASE_MAP[i];
      out = out.replace(pat, ` ${rep} `);
    }
    if (!/[\u0900-\u097F]/.test(out)) {
      return out.replace(/\s+/g, ' ').trim();
    }
    // Transliterate remaining Devanagari words character-by-syllable
    let translit = '';
    for (let i = 0; i < out.length; i += 1) {
      const ch = out[i];
      const next = out[i + 1] || '';
      if (ch === 'क' && next === '्' && out[i + 2] === 'ष') {
        translit += 'ksh';
        i += 2;
        continue;
      }
      if (ch === 'त' && next === '्' && out[i + 2] === 'र') {
        translit += 'tr';
        i += 2;
        continue;
      }
      if (ch === 'ज' && next === '्' && out[i + 2] === 'ञ') {
        translit += 'gy';
        i += 2;
        continue;
      }
      const conKey = next === '़' ? ch + next : ch;
      if (DEV_CONSONANTS[conKey]) {
        if (next === '़') i += 1;
        const after = out[i + 1] || '';
        translit += DEV_CONSONANTS[conKey];
        if (after === '्') {
          i += 1; // Halant suppresses schwa
        } else if (DEV_VOWELS[after]) {
          translit += DEV_VOWELS[after];
          i += 1;
        } else if (after && /[\u0900-\u097F]/.test(after) && after !== 'ं' && after !== 'ँ') {
          translit += 'a';
        }
        continue;
      }
      if (DEV_VOWELS[ch]) {
        translit += DEV_VOWELS[ch];
      } else if (ch === 'ं' || ch === 'ँ') {
        translit += 'n';
      } else if (ch === '्' || ch === '़') {
        // skip
      } else {
        translit += ch;
      }
    }
    return translit.replace(/\s+/g, ' ').trim();
  };

  const GENERIC_FORM_WORDS = new Set([
    'eye', 'eyes', 'drop', 'drops', 'ophthalmic', 'opthalmic',
    'solution', 'soln', 'suspension', 'susp', 'liquid',
    'ltd', 'pvt', 'limited', 'private', 'india',
    'pharma', 'pharmaceuticals', 'pharmaceutical', 'laboratories', 'labs', 'lab',
    'and', 'with', 'for', 'of', 'the', 'ip', 'bp', 'usp',
    'bak', 'bkc', 'free', 'care', 'plus'
  ]);

  const SALT_STRIP_WORDS = new Set([
    'sodium', 'hydrochloride', 'hcl', 'maleate', 'tartrate', 'etabonate',
    'phosphate', 'acetate', 'sulfate', 'sulphate', 'monohydrate', 'dihydrate',
    'hemihydrate', 'mesylate', 'besylate', 'bromide', 'chloride', 'nitrate',
    'ip', 'bp', 'usp', 'na', 'wv', 'ww', 'vv'
  ]);

  const normalizeText = (raw) => {
    let s = String(raw || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    s = s
      .replace(/carboxy\s*methyl\s*cellulose/g, 'carboxymethylcellulose')
      .replace(/carboxy\s*methyl/g, 'carboxymethyl')
      .replace(/hydroxy\s*propyl\s*methyl\s*cellulose/g, 'hydroxypropylmethylcellulose')
      .replace(/hydroxy\s*propyl/g, 'hydroxypropyl')
      .replace(/poly\s*ethylene\s*glycol/g, 'polyethyleneglycol')
      .replace(/propylene\s*glycol/g, 'propyleneglycol')
      .replace(/sodium\s*hyaluronate/g, 'sodiumhyaluronate')
      .replace(/\bopthalmic\b/g, 'ophthalmic');

    return s
      .replace(/[^a-z0-9.%+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizeStrengthToken = (numStr, unitStr) => {
    const val = Number.parseFloat(numStr);
    if (!Number.isFinite(val) || val <= 0) return '';
    const u = String(unitStr || '').toLowerCase().replace(/\s+/g, '');
    return `${val}${u}`;
  };

  const extractStrengthsFromString = (raw) => {
    const found = new Set();
    const s = String(raw || '').toLowerCase();
    let m;
    const pctRe = /(\d+(?:\.\d+)?|\.\d+)\s*%/g;
    while ((m = pctRe.exec(s)) !== null) {
      const tok = normalizeStrengthToken(m[1], '%');
      if (tok) found.add(tok);
    }
    const unitRe = /(\d+(?:\.\d+)?|\.\d+)\s*(mg\/ml|mg|mcg|iu)\b/g;
    while ((m = unitRe.exec(s)) !== null) {
      const tok = normalizeStrengthToken(m[1], m[2]);
      if (tok) found.add(tok);
    }
    return [...found];
  };

  const extractPacksFromString = (raw) => {
    const found = new Set();
    const s = String(raw || '').toLowerCase();
    let m;
    const packRe = /(\d+(?:\.\d+)?)\s*(ml|gm|g)\b/g;
    while ((m = packRe.exec(s)) !== null) {
      const val = Number.parseFloat(m[1]);
      if (!Number.isFinite(val)) continue;
      const u = m[2] === 'g' ? 'gm' : m[2];
      found.add(`${val}${u}`);
    }
    return [...found];
  };

  const canonicalFormKey = (rawForm) => {
    const f = normalizeText(rawForm).replace(/[^a-z]/g, '');
    if (!f) return '';
    if (f.includes('eyeear')) return 'eyeeardrops';
    if (f.includes('ointment')) return 'eyeointment';
    if (f.includes('eyegel') || f === 'gel') return 'eyegel';
    if (f.includes('suspension')) return 'ophthalmicsuspension';
    if (f.includes('solution')) return 'ophthalmicsolution';
    if (f.includes('wash')) return 'eyewash';
    if (f.includes('oral')) return 'oralophthalmic';
    if (f.includes('eyedrop') || f === 'drops') return 'eyedrops';
    return f;
  };

  const parseCanonicalSalts = (compStr) => {
    const raw = String(compStr || '').trim();
    if (!raw || /^(sterile|purified|multi-purpose|ventilated|surgical)\b/i.test(raw)) {
      return { baseSaltsKey: '', exactSaltStrengthKey: '', baseTokens: [] };
    }
    const parts = raw.split(/\s*\+\s*/).filter(Boolean);
    const baseSalts = [];
    const exactPairs = [];
    const allBaseTokens = [];

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const partStrengths = extractStrengthsFromString(part);
      const cleaned = normalizeText(
        part
          .replace(/\([^)]*\)/g, ' ')
          .replace(/(\d+(?:\.\d+)?|\.\d+)\s*(?:%|mg\/ml|mg|mcg|iu|w\/v|w\/w|v\/v)/gi, ' ')
      );
      const words = cleaned
        .split(' ')
        .map((w) => w.replace(/[^a-z]/g, ''))
        .filter((w) => w.length >= 2 && !SALT_STRIP_WORDS.has(w) && !GENERIC_FORM_WORDS.has(w));
      if (!words.length) continue;

      const base = words.join('');
      baseSalts.push(base);
      words.forEach((w) => allBaseTokens.push(w));
      const strengthKey = partStrengths[0] || '';
      exactPairs.push(strengthKey ? `${base}@${strengthKey}` : base);
    }

    if (!baseSalts.length) {
      return { baseSaltsKey: '', exactSaltStrengthKey: '', baseTokens: [] };
    }

    baseSalts.sort();
    exactPairs.sort();
    return {
      baseSaltsKey: baseSalts.join('+'),
      exactSaltStrengthKey: exactPairs.join('+'),
      baseTokens: [...new Set(allBaseTokens)]
    };
  };

  const phoneticCode = (word) => {
    let w = normalizeText(word).replace(/[^a-z0-9]/g, '');
    if (!w) return '';
    w = w
      .replace(/ph/g, 'f')
      .replace(/c(?=[iey])/g, 's')
      .replace(/ck/g, 'k')
      .replace(/q/g, 'k')
      .replace(/c/g, 'k')
      .replace(/z/g, 's')
      .replace(/x/g, 'ks')
      .replace(/y/g, 'i')
      .replace(/(ai|ae|ay|ey|ei)/g, 'e')
      .replace(/oo/g, 'u')
      .replace(/ee/g, 'i')
      .replace(/([a-z])\1+/g, '$1');
    if (w.length > 4 && w.endsWith('e')) {
      w = w.slice(0, -1);
    }
    return w;
  };

  const boundedEditDistance = (a, b, maxDist = 2) => {
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;
    if (m === 0) return n;
    if (n === 0) return m;

    const prev = new Array(n + 1);
    const curr = new Array(n + 1);
    for (let j = 0; j <= n; j += 1) prev[j] = j;

    for (let i = 1; i <= m; i += 1) {
      curr[0] = i;
      let rowMin = curr[0];
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j += 1) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        let val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          val = Math.min(val, prev[j - 1]);
        }
        curr[j] = val;
        if (val < rowMin) rowMin = val;
      }
      if (rowMin > maxDist) return maxDist + 1;
      for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
    }
    return prev[n];
  };

  // Precomputed Inverted Index Structures
  let records = [];
  const recordById = new Map();
  let fullDatasetLoaded = false;

  const index = {
    name: new Map(),
    brand: new Map(),
    comp: new Map(),
    mfr: new Map(),
    kw: new Map(),
    strength: new Map(),
    pack: new Map(),
    form: new Map(),
    phonBrand: new Map(),
    phonComp: new Map(),
    phonMfr: new Map(),
    compactName: new Map(),
    compactBrand: new Map(),
    equiv: new Map(),
    salt: new Map(),
    vocabName: [],
    vocabBrand: [],
    vocabComp: [],
    vocabMfr: []
  };

  const addPosting = (map, key, idx) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [idx];
      map.set(key, arr);
    } else if (arr[arr.length - 1] !== idx) {
      arr.push(idx);
    }
  };

  const tokenizeField = (normStr) =>
    normStr
      .split(' ')
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 2 && !GENERIC_FORM_WORDS.has(w));

  const compileRecord = (raw) => {
    const n = String(raw.n || raw.name || '').trim();
    const b = String(raw.b || raw.brand || '').trim();
    const m = String(raw.m || raw.manufacturer || '').trim();
    const c = String(raw.c || raw.composition || '').trim();
    const s = String(raw.s || raw.strength || '').trim();
    const p = String(raw.p || raw.pack || '').trim();
    const f = String(raw.f || raw.form || '').trim();
    const k = String(raw.k || raw.keywords || '').trim();
    const src = String(raw.src || '').trim();
    const i = raw.i || raw.image || null;

    const nNorm = normalizeText(n);
    const bNorm = normalizeText(b);
    const mNorm = normalizeText(m);
    const cNorm = normalizeText(c);
    const kNorm = normalizeText(k);
    const formKey = canonicalFormKey(f);

    const nTokens = tokenizeField(nNorm);
    const bTokens = tokenizeField(bNorm);
    const mTokens = tokenizeField(mNorm);
    const cTokens = tokenizeField(cNorm);
    const kTokens = kNorm ? kNorm.split(' ').filter((w) => w.length >= 2) : [];

    const strengths = [...new Set([...extractStrengthsFromString(s), ...extractStrengthsFromString(c)])];
    const packs = [...new Set([...extractPacksFromString(p), ...extractPacksFromString(s)])];

    const { baseSaltsKey, exactSaltStrengthKey, baseTokens } = parseCanonicalSalts(c);
    baseTokens.forEach((bt) => {
      if (!cTokens.includes(bt)) cTokens.push(bt);
    });

    // Display variant string cleanly without redundant duplicates
    const strengthDisplay = [s, p].filter(Boolean).join(' • ');

    return {
      id: raw.id,
      n,
      b,
      m,
      c,
      s: strengthDisplay || s,
      _rawStrength: s,
      p,
      f,
      k,
      src,
      i,
      _nNorm: nNorm,
      _bNorm: bNorm,
      _mNorm: mNorm,
      _cNorm: cNorm,
      _nCompact: nTokens.join(''),
      _bCompact: bTokens.join(''),
      _nTokens: nTokens,
      _bTokens: bTokens,
      _mTokens: mTokens,
      _cTokens: cTokens,
      _kTokens: kTokens,
      _nSet: new Set(nTokens),
      _bSet: new Set(bTokens),
      _mSet: new Set(mTokens),
      _cSet: new Set(cTokens),
      _kSet: new Set(kTokens),
      _nPhons: new Set(nTokens.map(phoneticCode).filter((x) => x.length >= 3)),
      _bPhons: new Set(bTokens.map(phoneticCode).filter((x) => x.length >= 3)),
      _mPhons: new Set(mTokens.map(phoneticCode).filter((x) => x.length >= 3)),
      _cPhons: new Set(cTokens.map(phoneticCode).filter((x) => x.length >= 3)),
      _strengthSet: new Set(strengths),
      _packSet: new Set(packs),
      _formKey: formKey,
      _baseSaltsKey: baseSaltsKey,
      _exactSaltStrengthKey: exactSaltStrengthKey,
      _equivSig: exactSaltStrengthKey && formKey ? `${exactSaltStrengthKey}::${formKey}` : '',
      _brandStem: bTokens[0] || ''
    };
  };

  const buildVocab = (postingsMap) => {
    const vocab = [];
    for (const [term, ids] of postingsMap.entries()) {
      if (term.length >= 3) {
        vocab.push({ term, phon: phoneticCode(term), ids });
      }
    }
    return vocab;
  };

  const setItems = (list, isFull = false) => {
    const seen = new Set();
    const compiled = [];
    recordById.clear();

    Object.values(index).forEach((col) => {
      if (col instanceof Map) col.clear();
    });

    list.forEach((raw) => {
      const name = String(raw.n || raw.name || '').trim();
      if (!name) return;
      const mfr = String(raw.m || raw.manufacturer || '').trim();
      const comp = String(raw.c || raw.composition || '').trim();
      const pack = String(raw.p || raw.pack || '').trim();
      const dedupKey = raw.id || `${name}|${mfr}|${comp}|${pack}`.toLowerCase();
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const rec = compileRecord(raw);
      const idx = compiled.length;
      compiled.push(rec);
      if (rec.id) recordById.set(rec.id, rec);

      rec._nTokens.forEach((t) => addPosting(index.name, t, idx));
      rec._bTokens.forEach((t) => addPosting(index.brand, t, idx));
      rec._cTokens.forEach((t) => addPosting(index.comp, t, idx));
      rec._mTokens.forEach((t) => addPosting(index.mfr, t, idx));
      rec._kTokens.forEach((t) => addPosting(index.kw, t, idx));

      rec._bPhons.forEach((ph) => addPosting(index.phonBrand, ph, idx));
      rec._nPhons.forEach((ph) => addPosting(index.phonBrand, ph, idx));
      rec._cPhons.forEach((ph) => addPosting(index.phonComp, ph, idx));
      rec._mPhons.forEach((ph) => addPosting(index.phonMfr, ph, idx));

      if (rec._nCompact) addPosting(index.compactName, rec._nCompact, idx);
      if (rec._bCompact) addPosting(index.compactBrand, rec._bCompact, idx);

      rec._strengthSet.forEach((st) => addPosting(index.strength, st, idx));
      rec._packSet.forEach((pk) => addPosting(index.pack, pk, idx));
      if (rec._formKey) addPosting(index.form, rec._formKey, idx);
      if (rec._equivSig) addPosting(index.equiv, rec._equivSig, idx);
      if (rec._baseSaltsKey) addPosting(index.salt, rec._baseSaltsKey, idx);
    });

    records = compiled;
    index.vocabName = buildVocab(index.name);
    index.vocabBrand = buildVocab(index.brand);
    index.vocabComp = buildVocab(index.comp);
    index.vocabMfr = buildVocab(index.mfr);

    if (isFull) fullDatasetLoaded = true;
  };

  setItems(seedItems, false);

  const parseQuery = (rawQuery) => {
    const original = String(rawQuery || '').trim();
    const hasDevanagari = /[\u0900-\u097F]/.test(original);
    let working = hasDevanagari ? devanagariToLatin(original) : original;

    // 1. Extract strengths (strict numeric precision so 0.5% !== 5%)
    const strengths = [];
    working = working.replace(/(\d+(?:\.\d+)?|\.\d+)\s*%/gi, (_, num) => {
      const tok = normalizeStrengthToken(num, '%');
      if (tok && !strengths.includes(tok)) strengths.push(tok);
      return ' ';
    });
    working = working.replace(/(\d+(?:\.\d+)?|\.\d+)\s*(mg\/ml|mg|mcg|iu)\b/gi, (_, num, unit) => {
      const tok = normalizeStrengthToken(num, unit);
      if (tok && !strengths.includes(tok)) strengths.push(tok);
      return ' ';
    });

    // 2. Extract pack volumes (10ml, 5gm)
    const packs = [];
    working = working.replace(/(\d+(?:\.\d+)?)\s*(ml|gm|g)\b/gi, (_, num, unit) => {
      const val = Number.parseFloat(num);
      if (Number.isFinite(val)) {
        const pk = `${val}${unit.toLowerCase() === 'g' ? 'gm' : unit.toLowerCase()}`;
        if (!packs.includes(pk)) packs.push(pk);
      }
      return ' ';
    });

    // 3. Extract dosage forms
    const forms = [];
    const formLabels = [];
    for (let i = 0; i < FORM_PATTERNS.length; i += 1) {
      const fp = FORM_PATTERNS[i];
      if (fp.re.test(working)) {
        fp.re.lastIndex = 0;
        if (!forms.includes(fp.key)) {
          forms.push(fp.key);
          formLabels.push(fp.label);
        }
        working = working.replace(fp.re, ' ');
      }
    }

    // 4. Semantic concepts (artificial tears, dry eye, glaucoma, etc.)
    const semanticKws = [];
    const conceptLabels = [];
    for (let i = 0; i < CONCEPT_MAP.length; i += 1) {
      const cm = CONCEPT_MAP[i];
      if (cm.re.test(working)) {
        cm.re.lastIndex = 0;
        if (!semanticKws.includes(cm.kw)) {
          semanticKws.push(cm.kw);
          conceptLabels.push(cm.label);
        }
        // Only strip long multi-word concepts like "artificial tears" / "dry eye", keep standalone clinical words
        working = working.replace(cm.re, ' ');
      }
    }

    const textNorm = normalizeText(working);
    const rawTokens = textNorm
      .split(' ')
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= 2 && !GENERIC_FORM_WORDS.has(t));

    // Also inspect merged neighbor pairs for broken chemical names ("Moxi floxacin" -> "moxifloxacin")
    const joinedPairHints = [];
    for (let i = 0; i < rawTokens.length - 1; i += 1) {
      const joined = `${rawTokens[i]}${rawTokens[i + 1]}`;
      if (index.comp.has(joined) || index.brand.has(joined)) {
        joinedPairHints.push(joined);
      }
    }

    const textTokens = joinedPairHints.length > 0 ? joinedPairHints : rawTokens;
    const textCompact = textTokens.join('');

    const tokenPlans = textTokens.map((tok) => {
      const compSyns = new Set();
      const brandAliases = new Set();
      const mfrAliases = new Set();

      if (ABBREVIATIONS[tok]) {
        ABBREVIATIONS[tok].forEach((a) => compSyns.add(a));
      }
      if (BRAND_ALIASES[tok]) {
        BRAND_ALIASES[tok].forEach((a) => brandAliases.add(a));
      }
      if (MFR_ALIASES[tok]) {
        MFR_ALIASES[tok].forEach((a) => mfrAliases.add(a));
      }

      return {
        raw: tok,
        phon: phoneticCode(tok),
        compSyns: [...compSyns],
        brandAliases: [...brandAliases],
        mfrAliases: [...mfrAliases]
      };
    });

    if (BRAND_ALIASES[textCompact]) {
      BRAND_ALIASES[textCompact].forEach((a) => {
        if (tokenPlans[0] && !tokenPlans[0].compSyns.includes(a)) {
          tokenPlans[0].compSyns.push(a);
        }
      });
    }

    return {
      original,
      hasDevanagari,
      transliteratedLatin: hasDevanagari ? normalizeText(devanagariToLatin(original)) : '',
      textNorm,
      textCore: textTokens.join(' '),
      textCompact,
      textPhon: phoneticCode(textTokens.join(' ')),
      tokenPlans,
      strengths,
      packs,
      forms,
      formLabels,
      semanticKws,
      conceptLabels
    };
  };

  // Retrieve inverted candidates + run field-scoped prefix/typo lookup without full-corpus Levenshtein scans
  const retrieveCandidates = (parsed) => {
    const candidates = new Set();
    const addList = (arr) => {
      if (!arr) return;
      for (let i = 0; i < arr.length; i += 1) candidates.add(arr[i]);
    };

    const tokenFieldMaps = new Map(); // tok -> { typoComp: Set, typoBrand: Set, typoMfr: Set, correction: string }
    const corrections = [];

    // 1. Direct compact lookup ("refreshtears", "lubrexds")
    if (parsed.textCompact.length >= 4) {
      addList(index.compactBrand.get(parsed.textCompact));
      addList(index.compactName.get(parsed.textCompact));
      for (const [ckey, cids] of index.compactBrand.entries()) {
        if (ckey.startsWith(parsed.textCompact)) addList(cids);
      }
      for (const [ckey, cids] of index.compactName.entries()) {
        if (ckey.startsWith(parsed.textCompact)) addList(cids);
      }
    }

    // 2. Per-token exact, prefix, phonetic & conditional typo lookup
    for (let t = 0; t < parsed.tokenPlans.length; t += 1) {
      const tp = parsed.tokenPlans[t];
      const exactCountBefore = candidates.size;

      // Exact postings across independent fields
      addList(index.name.get(tp.raw));
      addList(index.brand.get(tp.raw));
      addList(index.comp.get(tp.raw));
      addList(index.mfr.get(tp.raw));

      // Prefix lookups (length >= 3) over compact vocabularies
      if (tp.raw.length >= 3) {
        for (let v = 0; v < index.vocabName.length; v += 1) {
          if (index.vocabName[v].term.startsWith(tp.raw)) addList(index.vocabName[v].ids);
        }
        for (let v = 0; v < index.vocabBrand.length; v += 1) {
          if (index.vocabBrand[v].term.startsWith(tp.raw)) addList(index.vocabBrand[v].ids);
        }
        for (let v = 0; v < index.vocabComp.length; v += 1) {
          if (index.vocabComp[v].term.startsWith(tp.raw)) addList(index.vocabComp[v].ids);
        }
        for (let v = 0; v < index.vocabMfr.length; v += 1) {
          if (index.vocabMfr[v].term.startsWith(tp.raw)) addList(index.vocabMfr[v].ids);
        }
      }

      // Context-aware abbreviations & aliases (scoped cleanly!)
      tp.compSyns.forEach((syn) => {
        addList(index.comp.get(syn));
        for (let v = 0; v < index.vocabComp.length; v += 1) {
          if (index.vocabComp[v].term.startsWith(syn)) addList(index.vocabComp[v].ids);
        }
      });
      tp.brandAliases.forEach((ba) => addList(index.brand.get(ba)));
      tp.mfrAliases.forEach((ma) => addList(index.mfr.get(ma)));

      const directFoundForToken = candidates.size - exactCountBefore;

      // Exact phonetic matches (e.g. Sipla -> Cipla, Syptane -> Systane)
      if (tp.phon.length >= 3) {
        const beforePhon = candidates.size;
        addList(index.phonBrand.get(tp.phon));
        addList(index.phonComp.get(tp.phon));
        addList(index.phonMfr.get(tp.phon));
        if (directFoundForToken === 0 && candidates.size > beforePhon) {
          // Record transparent phonetic suggestion if matched manufacturer or brand
          const mHit = index.phonMfr.get(tp.phon);
          const bHit = index.phonBrand.get(tp.phon);
          if (mHit?.length) {
            const firstMfrTok = records[mHit[0]]._mTokens[0];
            if (firstMfrTok && firstMfrTok !== tp.raw) {
              corrections.push({ from: tp.raw, to: records[mHit[0]].m.split(' ')[0], kind: 'manufacturer' });
            }
          } else if (bHit?.length) {
            const firstB = records[bHit[0]].b;
            if (firstB && normalizeText(firstB) !== tp.raw) {
              corrections.push({ from: tp.raw, to: firstB, kind: 'brand' });
            }
          }
        }
      }

      // Guarded Typo Recovery: ONLY run bounded edit-distance if direct + prefix + exact phonetic yielded < 2 hits for this token!
      const typoInfo = { brandTerms: new Set(), compTerms: new Set(), mfrTerms: new Set() };
      if (tp.raw.length >= 4 && candidates.size - exactCountBefore < 2) {
        const maxD = tp.raw.length >= 8 ? 2 : 1;
        let bestDist = maxD + 1;
        let bestWord = '';

        const scanVocabForTypo = (vocab, targetSet, maxAllowed) => {
          for (let v = 0; v < vocab.length; v += 1) {
            const entry = vocab[v];
            if (Math.abs(entry.term.length - tp.raw.length) <= maxAllowed) {
              const d = boundedEditDistance(tp.raw, entry.term, maxAllowed);
              if (d <= maxAllowed) {
                addList(entry.ids);
                targetSet.add(entry.term);
                if (d < bestDist) {
                  bestDist = d;
                  bestWord = entry.term;
                }
                continue;
              }
            }
            if (tp.phon.length >= 5 && entry.phon.length >= 5 && Math.abs(entry.phon.length - tp.phon.length) <= 1) {
              const pd = boundedEditDistance(tp.phon, entry.phon, 1);
              if (pd <= 1) {
                addList(entry.ids);
                targetSet.add(entry.term);
                if (bestDist > 1) {
                  bestDist = 1;
                  bestWord = entry.term;
                }
              }
            }
          }
        };

        scanVocabForTypo(index.vocabBrand, typoInfo.brandTerms, maxD);
        scanVocabForTypo(index.vocabComp, typoInfo.compTerms, maxD);
        // Manufacturer typo tolerance applies strictly to raw spelling (prevents unrelated mfr phonetic bleed!)
        scanVocabForTypo(index.vocabMfr, typoInfo.mfrTerms, Math.min(1, maxD));

        if (bestWord && bestWord !== tp.raw) {
          corrections.push({ from: tp.raw, to: bestWord, kind: 'spelling' });
        }
      }

      // Multi-char inner substring match for long domain words (e.g. "hyaluronate") if still sparse
      if (tp.raw.length >= 6 && candidates.size - exactCountBefore === 0) {
        for (let v = 0; v < index.vocabComp.length; v += 1) {
          if (index.vocabComp[v].term.includes(tp.raw)) addList(index.vocabComp[v].ids);
        }
        for (let v = 0; v < index.vocabBrand.length; v += 1) {
          if (index.vocabBrand[v].term.includes(tp.raw)) addList(index.vocabBrand[v].ids);
        }
      }

      tokenFieldMaps.set(tp.raw, typoInfo);
    }

    // 3. Semantic concept keywords (artificial tears -> lubricant, etc.)
    for (let s = 0; s < parsed.semanticKws.length; s += 1) {
      addList(index.kw.get(parsed.semanticKws[s]));
    }

    // 4. Pure strength or dosage-form queries without brand/comp text
    if (parsed.tokenPlans.length === 0 && parsed.semanticKws.length === 0) {
      parsed.strengths.forEach((st) => addList(index.strength.get(st)));
      parsed.forms.forEach((fk) => addList(index.form.get(fk)));
      parsed.packs.forEach((pk) => addList(index.pack.get(pk)));
    }

    return { candidates, tokenFieldMaps, corrections };
  };

  // Evaluate candidate against a single query token independently per field
  const matchTokenInFields = (tp, rec, typoInfo) => {
    const hit = {
      name: 0,
      brand: 0,
      comp: 0,
      mfr: 0,
      isTypoOnly: false
    };

    // Name / Brand exact & prefix & phonetic
    if (rec._nSet.has(tp.raw)) hit.name = 1.0;
    else if (rec._nPhons.has(tp.phon)) hit.name = 0.92;
    else if (tp.raw.length >= 3) {
      for (const nt of rec._nSet) {
        if (nt.startsWith(tp.raw)) { hit.name = Math.max(hit.name, 0.86); break; }
      }
    }

    if (rec._bSet.has(tp.raw) || rec._bCompact === tp.raw) hit.brand = 1.0;
    else if (rec._bPhons.has(tp.phon)) hit.brand = 0.94;
    else if (tp.raw.length >= 3) {
      for (const bt of rec._bSet) {
        if (bt.startsWith(tp.raw)) { hit.brand = Math.max(hit.brand, 0.88); break; }
      }
      if (hit.brand === 0 && rec._bCompact.startsWith(tp.raw)) {
        hit.brand = 0.84;
      }
    }

    // Composition exact, prefix, synonym (e.g. CMC -> Carboxymethylcellulose), phonetic
    if (rec._cSet.has(tp.raw)) hit.comp = 1.0;
    else if (tp.compSyns.some((syn) => rec._cSet.has(syn) || [...rec._cSet].some((ct) => ct.startsWith(syn)))) {
      hit.comp = 0.98;
    } else if (rec._cPhons.has(tp.phon)) {
      hit.comp = 0.90;
    } else if (tp.raw.length >= 3) {
      for (const ct of rec._cSet) {
        if (ct.startsWith(tp.raw)) { hit.comp = Math.max(hit.comp, 0.84); break; }
        if (tp.raw.length >= 5 && ct.includes(tp.raw)) { hit.comp = Math.max(hit.comp, 0.68); }
      }
    }

    // Brand aliases mapped to salt composition (e.g. Combigan, Tobradex)
    if (tp.brandAliases.length > 0 && tp.brandAliases.every((sal) => rec._cSet.has(sal))) {
      hit.brand = Math.max(hit.brand, 0.95);
    }

    // Manufacturer exact, alias, phonetic (Sipla -> Cipla), prefix
    if (rec._mSet.has(tp.raw) || tp.mfrAliases.some((ma) => rec._mSet.has(ma))) {
      hit.mfr = 1.0;
    } else if (rec._mPhons.has(tp.phon)) {
      hit.mfr = 0.94;
    } else if (tp.raw.length >= 3) {
      for (const mt of rec._mSet) {
        if (mt.startsWith(tp.raw)) { hit.mfr = Math.max(hit.mfr, 0.84); break; }
      }
    }

    // Fallback to guarded field typos if strong hits missed
    if (Math.max(hit.name, hit.brand, hit.comp, hit.mfr) === 0 && typoInfo) {
      for (const t of typoInfo.brandTerms) {
        if (rec._bSet.has(t) || rec._nSet.has(t)) {
          hit.brand = 0.64;
          hit.isTypoOnly = true;
          break;
        }
      }
      for (const t of typoInfo.compTerms) {
        if (rec._cSet.has(t)) {
          hit.comp = Math.max(hit.comp, 0.62);
          hit.isTypoOnly = true;
          break;
        }
      }
      for (const t of typoInfo.mfrTerms) {
        if (rec._mSet.has(t)) {
          hit.mfr = Math.max(hit.mfr, 0.58);
          hit.isTypoOnly = true;
          break;
        }
      }
    }

    return hit;
  };

  const buildEquivalenceDiscovery = (anchor, directIdsSet) => {
    const alternatives = [];
    const related = [];
    if (!anchor) return { alternatives, related };

    const anchorBrandStem = anchor._brandStem;

    if (anchor._equivSig) {
      const equivIds = index.equiv.get(anchor._equivSig) || [];
      for (let i = 0; i < equivIds.length; i += 1) {
        const rec = records[equivIds[i]];
        if (!rec || directIdsSet.has(rec.id)) continue;
        // Skip variants of the exact same brand family (e.g. Moxicip D / Moxicip KT / Moxicip Singules)
        if (anchorBrandStem && (rec._brandStem === anchorBrandStem || rec._bNorm.startsWith(anchorBrandStem))) {
          continue;
        }
        alternatives.push(rec);
      }

      alternatives.sort((a, b) => {
        const scoreA = (a.src === 'PMBJP Jan Aushadhi' ? 40 : 0) + (a.i ? 30 : 0) - a.n.length * 0.1;
        const scoreB = (b.src === 'PMBJP Jan Aushadhi' ? 40 : 0) + (b.i ? 30 : 0) - b.n.length * 0.1;
        return scoreB - scoreA;
      });
    }

    if (anchor._baseSaltsKey) {
      const saltIds = index.salt.get(anchor._baseSaltsKey) || [];
      for (let i = 0; i < saltIds.length; i += 1) {
        const rec = records[saltIds[i]];
        if (!rec || rec._equivSig === anchor._equivSig || directIdsSet.has(rec.id)) continue;
        if (anchorBrandStem && rec._brandStem === anchorBrandStem) continue;
        related.push(rec);
        if (related.length >= 12) break;
      }
    }

    return { alternatives: alternatives.slice(0, 12), related };
  };

  const search = (rawQuery, limit = 60) => {
    const parsed = parseQuery(rawQuery);
    if (
      parsed.textNorm.length < 2 &&
      parsed.strengths.length === 0 &&
      parsed.forms.length === 0 &&
      parsed.semanticKws.length === 0
    ) {
      return { results: [], alternatives: [], related: [], totalMatches: 0, hasExactMatch: false, interpretation: null, highlightTerms: [] };
    }

    const { candidates, tokenFieldMaps, corrections } = retrieveCandidates(parsed);
    const scoredAll = [];
    let hasExactMatch = false;

    const totalAttrExpected =
      parsed.tokenPlans.length +
      parsed.strengths.length +
      parsed.forms.length +
      parsed.packs.length +
      parsed.semanticKws.length;

    for (const idx of candidates) {
      const rec = records[idx];

      // 1. Evaluate strength filter / boost
      let strengthMatched = 0;
      let strengthMismatch = false;
      if (parsed.strengths.length > 0) {
        for (const st of parsed.strengths) {
          if (rec._strengthSet.has(st)) strengthMatched += 1;
          else strengthMismatch = true;
        }
        // Pure strength query ("0.5%", "1%", "0.3%") strictly rejects non-matching strengths
        if (parsed.tokenPlans.length === 0 && parsed.semanticKws.length === 0 && strengthMatched === 0) {
          continue;
        }
      }

      // 2. Evaluate pack & dosage form
      let packMatched = 0;
      for (const pk of parsed.packs) {
        if (rec._packSet.has(pk)) packMatched += 1;
      }
      let formMatched = 0;
      let formMismatch = false;
      if (parsed.forms.length > 0) {
        if (parsed.forms.includes(rec._formKey)) formMatched = 1;
        else formMismatch = true;
      }

      // 3. Evaluate semantic concepts
      let semanticMatched = 0;
      for (const kw of parsed.semanticKws) {
        if (rec._kSet.has(kw)) semanticMatched += 1;
      }

      // 4. Evaluate text tokens across separated fields
      let tokensMatched = 0;
      let tokenScoreSum = 0;
      let matchedBrand = false;
      let matchedComp = false;
      let matchedMfr = false;
      let typoOnlyCount = 0;

      for (let t = 0; t < parsed.tokenPlans.length; t += 1) {
        const tp = parsed.tokenPlans[t];
        const hit = matchTokenInFields(tp, rec, tokenFieldMaps.get(tp.raw));
        const best = Math.max(hit.name, hit.brand, hit.comp, hit.mfr);
        if (best >= 0.5) {
          tokensMatched += 1;
          tokenScoreSum += best;
          if (hit.isTypoOnly) typoOnlyCount += 1;
          if (hit.brand >= 0.6 || hit.name >= 0.8) matchedBrand = true;
          if (hit.comp >= 0.6) matchedComp = true;
          if (hit.mfr >= 0.6) matchedMfr = true;
        }
      }

      const matchedTotal = tokensMatched + strengthMatched + formMatched + packMatched + semanticMatched;
      if (matchedTotal === 0) continue;

      // Multi-token text gate: prevent weak 1-token noise on multi-word brand/comp searches unless semantic fallback applies
      const textCount = parsed.tokenPlans.length;
      if (textCount >= 2 && tokensMatched === 0) continue;

      // Assign Section 6 12-Tier Priority Score
      let baseScore = 0;
      let reasonLabel = '';
      const qCompact = parsed.textCompact;

      // Tier 1: Exact product name
      if (rec._nNorm === parsed.textNorm || (qCompact.length >= 4 && rec._nCompact === qCompact)) {
        baseScore = 12000;
        reasonLabel = 'Exact Product Match';
        hasExactMatch = true;
      }
      // Tier 2: Exact brand / compact brand match ("Refreshtears", "LubrexDS")
      else if (
        (parsed.textCore && rec._bNorm === parsed.textCore) ||
        (qCompact.length >= 4 && rec._bCompact === qCompact) ||
        (parsed.textPhon.length >= 4 && phoneticCode(rec._bNorm) === parsed.textPhon)
      ) {
        baseScore = 11000;
        reasonLabel = 'Exact Brand';
        hasExactMatch = true;
      }
      // Tier 3: Exact brand alias
      else if (parsed.tokenPlans.some((tp) => tp.brandAliases.length > 0 && tp.brandAliases.every((a) => rec._cSet.has(a)))) {
        baseScore = 10200;
        reasonLabel = 'Brand Composition Match';
        hasExactMatch = true;
      }
      // Tier 4: Near-exact brand (e.g. "Systane" matching "Systane Ultra", "Systane Gel Drop", "Lubrex" matching "Lubrex-DS")
      else if (
        textCount > 0 &&
        tokensMatched === textCount &&
        matchedBrand &&
        ((qCompact.length >= 4 && rec._bCompact.startsWith(qCompact)) ||
          (parsed.textCore.length >= 3 && rec._bNorm.startsWith(`${parsed.textCore} `)) ||
          (textCount === 1 && rec._bTokens[0]?.startsWith(parsed.tokenPlans[0].raw) && typoOnlyCount === 0))
      ) {
        baseScore = 9400;
        reasonLabel = 'Brand Match';
        hasExactMatch = true;
      }
      // Tier 5: Exact composition (or expanded CMC/HPMC/Moxi)
      else if (
        tokensMatched === textCount &&
        matchedComp &&
        !matchedMfr &&
        !matchedBrand &&
        (textCount === 1 || rec._cNorm.startsWith(parsed.textCore))
      ) {
        baseScore = 8400;
        reasonLabel = 'Composition Match';
      }
      // Tier 6: Manufacturer + Composition
      else if (tokensMatched === textCount && matchedMfr && matchedComp) {
        baseScore = 7600;
        reasonLabel = 'Manufacturer + Composition';
      }
      // Tier 7: Brand + Composition
      else if (tokensMatched === textCount && matchedBrand && matchedComp) {
        baseScore = 7000;
        reasonLabel = 'Brand + Composition';
      }
      // Tier 8/9: Composition + Strength (+ Form / Pack)
      else if (matchedComp && strengthMatched > 0) {
        baseScore = formMatched > 0 || packMatched > 0 ? 6900 : 6400;
        reasonLabel = formMatched > 0 ? 'Composition + Strength + Form' : 'Composition + Strength';
      }
      // Manufacturer match (clean non-typo exact/phonetic, e.g. Cipla, Sipla, Alcon, Allergan)
      else if (tokensMatched === textCount && matchedMfr && typoOnlyCount === 0) {
        baseScore = 5400;
        reasonLabel = 'Manufacturer Match';
      }
      // Prefix / Full-token partial match
      else if (tokensMatched === textCount && textCount > 0 && typoOnlyCount === 0) {
        baseScore = 4000;
        reasonLabel = 'Prefix / Multi-Term Match';
      }
      // Pure strength / form / semantic concept query ("Artificial tears", "0.5%", "Eye ointment")
      else if (textCount === 0 && (strengthMatched > 0 || formMatched > 0 || semanticMatched > 0)) {
        baseScore = 3600 + (semanticMatched * 600) + (formMatched * 400) + (strengthMatched * 500);
        if (semanticMatched > 0 && parsed.conceptLabels[0]) reasonLabel = parsed.conceptLabels[0];
        else if (formMatched > 0 && parsed.formLabels[0]) reasonLabel = parsed.formLabels[0];
        else if (strengthMatched > 0) reasonLabel = `Strength ${parsed.strengths[0]}`;
      }
      // Phonetic & Typo matches
      else if (tokensMatched === textCount && typoOnlyCount > 0) {
        baseScore = 2400;
        reasonLabel = 'Spelling Correction Match';
      }
      // Multi-term partial fallback (e.g. "Alcon CMC" -> exact Alcon lubricants or exact CMC drops, no weak typos!)
      else if (textCount >= 2 && tokensMatched >= 1 && typoOnlyCount === 0) {
        baseScore = 1100;
        if (matchedMfr) reasonLabel = `Manufacturer: ${rec.m.split(' ')[0]}`;
        else if (matchedComp) reasonLabel = 'Matching Composition';
        else reasonLabel = 'Partial Brand Match';
      } else {
        continue;
      }

      // Multi-attribute accuracy & mismatch adjustments
      let score = baseScore + tokenScoreSum * 160;
      if (strengthMatched > 0) score += 1200 * strengthMatched;
      if (strengthMismatch) score -= 4500; // Prevent 5% from posing as 0.5% match
      if (packMatched > 0) score += 900;
      if (formMatched > 0) score += 700;
      if (formMismatch) score -= 900;
      if (semanticMatched > 0) score += 500 * semanticMatched;

      // Cross-concept overlap boost (e.g. for "Alcon CMC", Alcon lubricants get boosted cleanly above non-lubricant Alcon drugs!)
      if (textCount >= 2 && tokensMatched < textCount && parsed.tokenPlans.some((tp) => tp.compSyns.includes('carboxymethylcellulose')) && rec._kSet.has('lubricant')) {
        score += 950;
      }

      if (totalAttrExpected > 1 && matchedTotal === totalAttrExpected) {
        score += 1800; // Full multi-attribute satisfaction bonus
      }

      // Gentle intra-tier tie-breakers (verified packshot -> cleaner mono formulations)
      if (rec.i) score += 32;
      if (rec.src === 'PMBJP Jan Aushadhi') score += 12;
      score -= Math.min(24, rec.n.length * 0.14);

      if (score <= 0) continue;

      const badgeParts = [];
      if (reasonLabel) badgeParts.push(reasonLabel);
      if (strengthMatched > 0 && !reasonLabel.includes('Strength')) badgeParts.push(parsed.strengths[0]);
      if (packMatched > 0) badgeParts.push(parsed.packs[0]);

      scoredAll.push({ rec, score, matchReason: badgeParts.join(' • ') });
    }

    scoredAll.sort((a, b) => b.score - a.score);

    // Filter out mismatched-strength noise when strong exact-strength hits exist
    let filtered = scoredAll;
    if (parsed.strengths.length > 0 && scoredAll.some((x) => x.rec._strengthSet.has(parsed.strengths[0]))) {
      const exactStrengthOnly = scoredAll.filter((x) => parsed.strengths.every((st) => x.rec._strengthSet.has(st)));
      if (exactStrengthOnly.length >= 3) {
        filtered = exactStrengthOnly;
      }
    }

    // Strict negative relevance guard: when exact/near-exact Brand hits exist on a single-token query,
    // drop weak typo/substring noise (< 3000) while preserving genuine manufacturer hits if token is also a manufacturer
    if (parsed.tokenPlans.length === 1 && hasExactMatch) {
      const tp0 = parsed.tokenPlans[0];
      const topScore = filtered[0]?.score || 0;
      const isAlsoMfr = index.mfr.has(tp0.raw) || index.phonMfr.has(tp0.phon);
      if (topScore >= 9000) {
        filtered = filtered.filter(
          (x) =>
            x.score >= (isAlsoMfr ? 5000 : 8500) ||
            (x.rec._brandStem && x.rec._brandStem === filtered[0].rec._brandStem)
        );
      }
    }

    const totalMatches = filtered.length;
    const sliced = filtered.slice(0, limit);
    const results = sliced.map((x) => ({ ...x.rec, _matchReason: x.matchReason }));

    // Alternative Brands & Related Formulations Discovery (Section 8)
    const directIds = new Set(results.map((r) => r.id));
    let alternatives = [];
    let related = [];
    if (results.length > 0 && (hasExactMatch || parsed.tokenPlans.length <= 2)) {
      const equiv = buildEquivalenceDiscovery(results[0], directIds);
      alternatives = equiv.alternatives;
      related = equiv.related;
    }

    // Collect terms for UI match highlighting
    const highlightSet = new Set();
    parsed.tokenPlans.forEach((tp) => {
      if (tp.raw.length >= 2) highlightSet.add(tp.raw);
      tp.compSyns.forEach((s) => highlightSet.add(s));
      tp.mfrAliases.forEach((m) => highlightSet.add(m));
    });
    parsed.strengths.forEach((s) => highlightSet.add(s));
    parsed.packs.forEach((p) => highlightSet.add(p));
    corrections.forEach((c) => highlightSet.add(c.to.toLowerCase()));

    const interpretation = {
      hasDevanagari: parsed.hasDevanagari,
      transliteratedLatin: parsed.transliteratedLatin,
      corrections,
      extractedStrengths: parsed.strengths,
      extractedForms: parsed.formLabels,
      extractedPacks: parsed.packs,
      conceptLabels: parsed.conceptLabels
    };

    return {
      results,
      allScored: filtered,
      alternatives,
      related,
      totalMatches,
      hasExactMatch,
      interpretation,
      highlightTerms: [...highlightSet]
    };
  };

  return {
    search,
    parseQuery,
    setItems,
    getById: (id) => recordById.get(id),
    isFullLoaded: () => fullDatasetLoaded,
    getCount: () => records.length
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

  // Lazy-fetch full Indian ophthalmic index (4,185+ verified Indian market records)
  let datasetPromise = null;
  const ensureFullDataset = () => {
    if (datasetPromise) return datasetPromise;
    datasetPromise = fetch('/assets/data/ophthalmic-products.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          searchEngine.setItems(data.items, true);
          if (searchSourceBadge) {
            searchSourceBadge.textContent = `${data.items.length.toLocaleString('en-IN')} indexed`;
          }
          if (medSearchInput && medSearchInput.value.trim().length >= 2) {
            renderSearchResults(medSearchInput.value);
          }
        }
      })
      .catch(() => {
        // Keep seeded items cleanly if offline
      });
    return datasetPromise;
  };

  // Preload dataset idle-time right after initial paint without blocking first frame
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => ensureFullDataset(), { timeout: 1500 });
  } else {
    setTimeout(() => ensureFullDataset(), 450);
  }

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
    appendHighlightedText(titleEl, rec.n, highlightTerms);
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
        const res = await fetch('/api/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName, mobile, selectedItems, unmatchedQueries })
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
        ? 'Telegram bot environment variables (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) are not yet configured on Cloudflare Pages. A backup reference is saved below.'
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
document.addEventListener('DOMContentLoaded', () => {
  const announcer = createPoliteAnnouncer();
  initNavigation();
  initCatalogueAndEnquiry(announcer);
  initStoreContactActions(announcer);
  initLanguageSwitch(announcer);
  initThemeToggle(announcer);
});
