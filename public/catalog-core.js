/**
 * Shared Catalogue Normalization, Deterministic Slugifier & Verified Store Metadata.
 * Used identically by static site generation (scripts/build-catalog.mjs),
 * Cloudflare Worker API (src/worker.js), and frontend search/detail views.
 */

export const STORE_INFO = {
  name: 'Drishti Medical Store',
  hindiName: 'दृष्टि मेडिकल स्टोर',
  shortName: 'DMS',
  siteUrl: 'https://dms.piecs.org',
  tagline: 'Dedicated eye-care pharmacy inside Sant Kabir Eye Hospital, Basti',
  streetAddress: 'Sant Kabir Eye Hospital, Bansi Road, Near Pindari Hospital, Katra',
  city: 'Basti',
  region: 'Uttar Pradesh',
  postalCode: '272001',
  country: 'IN',
  address:
    'Inside Sant Kabir Eye Hospital, Bansi Road, Near Pindari Hospital, Katra, Basti, Moor Ghat, Uttar Pradesh – 272001, India',
  hours: 'Monday–Saturday 9:00 AM – 6:00 PM',
  openingHoursSpecification: {
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '09:00',
    closes: '18:00'
  },
  mapsUrl: 'https://maps.app.goo.gl/5BYvRvsRoLVSubBW9',
  hospitalUrl: 'https://santkabireyehospital.piecs.org/',
  campusInquiryPhone: '+91-9336466677',
  defaultImage: 'https://dms.piecs.org/assets/images/skeh-bg-hero.jpg',
  medicalPolicy:
    'Informational ophthalmic catalogue and counter availability enquiry only. We do not prescribe medicine, accept online orders, process online payments, or provide home delivery. Valid written prescription from a licensed doctor / ophthalmologist is required at physical counter pickup for prescription medicines.'
};

export const AVAILABILITY_SEMANTICS = {
  catalogued: 'Product exists in the catalogue; live counter stock is unverified.',
  in_stock: 'Physical stock has been reliably confirmed.',
  out_of_stock: 'Product has been confirmed unavailable.',
  contact_store: 'Customer must contact the store to confirm current availability and price.'
};

export const PRESCRIPTION_NOTE =
  'Valid written prescription from a licensed doctor or ophthalmologist is required at physical counter pickup for prescription ophthalmic medicines. Over-the-counter eye washes, lubricants, and surgical accessories are confirmed at the counter.';

export function slugifyText(raw, maxLen = 88) {
  let s = String(raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Keep decimal numbers readable (e.g. 0.5% -> 0-5-percent)
  s = s
    .replace(/(\d)\.(\d)/g, '$1-$2')
    .replace(/%/g, '-percent')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen).replace(/-[^-]*$/, '');
    s = (cut || s.slice(0, maxLen)).replace(/-+$/g, '');
  }
  return s || 'ophthalmic-medicine';
}

export function deriveCategory(raw) {
  const kw = String(raw?.k ?? raw?.keywords ?? '').toLowerCase();
  const form = String(raw?.f ?? raw?.form ?? '').toLowerCase();

  if (kw.includes('lubricant') || kw.includes('artificial tears') || kw.includes('dry eye')) {
    return { label: 'Lubricants & Artificial Tears', slug: 'lubricants-and-artificial-tears' };
  }
  if (kw.includes('antiglaucoma') || kw.includes('glaucoma')) {
    return { label: 'Glaucoma & Eye Pressure', slug: 'glaucoma-and-eye-pressure' };
  }
  if (kw.includes('antibiotic') || kw.includes('antibacterial')) {
    return { label: 'Antibiotic Eye Care', slug: 'antibiotic-eye-care' };
  }
  if (kw.includes('antiallergic') || kw.includes('allergy')) {
    return { label: 'Anti-Allergic Eye Drops', slug: 'anti-allergic-eye-drops' };
  }
  if (kw.includes('antifungal')) {
    return { label: 'Antifungal Eye Drops', slug: 'antifungal-eye-drops' };
  }
  if (kw.includes('steroid')) {
    return { label: 'Anti-Inflammatory & Steroids', slug: 'anti-inflammatory-and-steroids' };
  }
  if (kw.includes('nsaid')) {
    return { label: 'Ophthalmic NSAIDs', slug: 'ophthalmic-nsaids' };
  }
  if (kw.includes('mydriatic') || kw.includes('cycloplegic')) {
    return { label: 'Mydriatic & Cycloplegic', slug: 'mydriatic-and-cycloplegic' };
  }
  if (form.includes('ointment') || form.includes('gel')) {
    return { label: 'Eye Gels & Ointments', slug: 'eye-gels-and-ointments' };
  }
  if (form.includes('supply') || form.includes('optical') || form.includes('wash')) {
    return { label: 'Eye-Care Supplies & Lens Care', slug: 'eye-care-supplies-and-lens-care' };
  }
  return { label: 'Ophthalmic Formulations', slug: 'ophthalmic-formulations' };
}

export function deriveGenericInfo(composition) {
  const raw = String(composition || '').trim();
  if (!raw) {
    return { genericName: '', activeIngredients: [] };
  }

  const parts = raw
    .split(/\s*\+\s*/)
    .map((part) => {
      const stripped = part
        .replace(/\([^)]*\)/g, ' ')
        .replace(/(\d+(?:\.\d+)?|\.\d+)\s*(?:%|mg\/ml|mg|mcg|iu|w\/v|w\/w|v\/v)/gi, ' ')
        .replace(/\b(?:ip|bp|usp)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped || part.trim();
    })
    .filter(Boolean);

  return {
    genericName: parts.join(' + ') || raw,
    activeIngredients: parts
  };
}

/**
 * Generates deterministic, permanent, collision-free slugs for every medicine record.
 * Unique medicine names keep a clean readable slug (/medicine/refresh-tears-eye-drop).
 * Duplicate names disambiguate using intrinsic manufacturer or catalogue ID tokens
 * so deleting/adding other records never shifts an existing medicine's URL.
 */
export function buildCatalogIndex(items = []) {
  const validItems = items.filter((raw) => raw && String(raw.n || raw.name || '').trim());
  const baseCounts = new Map();

  for (const raw of validItems) {
    const base = slugifyText(raw.n || raw.name, 78);
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  }

  const usedSlugs = new Set();
  const publicRecords = [];
  const byId = new Map();
  const bySlug = new Map();
  const categoriesMap = new Map();

  for (const raw of validItems) {
    const base = slugifyText(raw.n || raw.name, 78);
    const idSlug = slugifyText(raw.id || '', 28);
    let slug = (baseCounts.get(base) || 0) > 1 && idSlug ? `${base}-${idSlug}` : base;

    let counter = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }

    usedSlugs.add(slug);

    const formatted = formatPublicRecord(raw, slug);
    publicRecords.push(formatted);
    byId.set(formatted.id.toLowerCase(), formatted);
    bySlug.set(formatted.slug.toLowerCase(), formatted);

    const catEntry = categoriesMap.get(formatted.category_slug);
    if (!catEntry) {
      categoriesMap.set(formatted.category_slug, {
        label: formatted.category,
        slug: formatted.category_slug,
        count: 1
      });
    } else {
      catEntry.count += 1;
    }
  }

  return {
    records: publicRecords,
    byId,
    bySlug,
    categories: [...categoriesMap.values()].sort((a, b) => b.count - a.count)
  };
}

export function formatPublicRecord(raw, slug) {
  const id = String(raw.id || '').trim();
  const name = String(raw.n || raw.name || '').trim();
  const brand = String(raw.b || raw.brand || '').trim();
  const manufacturer = String(raw.m || raw.manufacturer || '').trim();
  const composition = String(raw.c || raw.composition || '').trim();
  const strengthRaw = String(raw._rawStrength ?? raw.s ?? raw.strength ?? '').trim();
  const packRaw = String(raw.p || raw.pack || '').trim();
  const form = String(raw.f || raw.form || '').trim();
  const keywordsRaw = String(raw.k || raw.keywords || '').trim();
  const source = String(raw.src || raw.source || '').trim();
  const imageRel = raw.i || raw.image || null;

  const { genericName, activeIngredients } = deriveGenericInfo(composition);
  const category = deriveCategory({ k: keywordsRaw, f: form });
  const description = buildVerifiedDescription({
    name,
    brand,
    composition,
    strength: strengthRaw || null,
    form,
    packSize: packRaw || null,
    manufacturer
  });

  return {
    id,
    slug,
    name,
    brand: brand || null,
    generic_name: genericName || null,
    active_ingredients: activeIngredients,
    composition: composition || null,
    strength: strengthRaw || null,
    form: form || null,
    pack_size: packRaw || null,
    manufacturer: manufacturer || null,
    category: category.label,
    category_slug: category.slug,
    keywords: keywordsRaw ? keywordsRaw.split(/\s+/).filter(Boolean) : [],
    description,
    source: source || null,
    image_path: imageRel || null,
    image_url: imageRel ? `${STORE_INFO.siteUrl}${imageRel}` : null,
    product_url: `${STORE_INFO.siteUrl}/medicine/${slug}`,
    api_url: `${STORE_INFO.siteUrl}/api/medicine/${encodeURIComponent(id || slug)}`,
    enquiry_url: `${STORE_INFO.siteUrl}/?medicine=${encodeURIComponent(id || slug)}#enquiry`,
    availability_status: 'contact_store',
    availability_note:
      'Listed in the Drishti Medical Store reference catalogue. Confirm current counter stock by enquiry callback before pickup.',
    price: null,
    currency: 'INR',
    price_status: 'confirm_with_store',
    prescription_note: PRESCRIPTION_NOTE
  };
}

export function buildVerifiedDescription({
  name,
  brand,
  composition,
  strength,
  form,
  packSize,
  manufacturer
}) {
  const bracketParts = [form, packSize].filter(Boolean);
  const titlePart = bracketParts.length > 0 ? `${name} (${bracketParts.join(', ')})` : name;
  const details = [];
  if (brand && brand.toLowerCase() !== name.toLowerCase() && !name.toLowerCase().startsWith(brand.toLowerCase())) {
    details.push(`brand ${brand}`);
  }
  if (composition) {
    const extraStrength =
      strength && !composition.toLowerCase().includes(strength.toLowerCase()) ? ` (${strength})` : '';
    details.push(`containing ${composition}${extraStrength}`);
  }
  if (manufacturer) {
    details.push(`by ${manufacturer}`);
  }
  const summary = details.length > 0 ? `${titlePart} — ${details.join(', ')}.` : `${titlePart}.`;
  return `${summary} Listed in the ophthalmic catalogue at ${STORE_INFO.name}, Sant Kabir Eye Hospital, Bansi Road, Katra, Basti (UP 272001). Confirm availability and price with the store before pickup.`;
}
