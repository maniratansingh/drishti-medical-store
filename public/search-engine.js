/**
 * Shared Ophthalmic Catalogue Search Engine (Browser + Cloudflare Worker + Node)
 */

// 5. Hybrid Amazon-Quality Inverted-Index Ophthalmic Search Engine
export function createOphthalmicSearchEngine(seedItems = []) {
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
    getAll: () => records,
    getEquivalents: (anchor) => buildEquivalenceDiscovery(anchor, new Set(anchor?.id ? [anchor.id] : [])),
    isFullLoaded: () => fullDatasetLoaded,
    getCount: () => records.length
  };
}
