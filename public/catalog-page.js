/**
 * Lightweight progressive enhancement for static /medicine/* and /medicines* pages.
 * Keeps theme switching (Light default / Dark toggle), mobile nav drawer fallback,
 * and key EN/Hindi UI chrome synchronized with the main storefront.
 */

if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@0.7.0/dist/popover.min.js').catch(() => {});
}

function initSubpageChrome() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  const themeColorMeta = document.getElementById('theme-color-meta');
  const storageKey = 'dms_theme';

  const getCurrentTheme = () => {
    if (document.documentElement.dataset.theme === 'dark') return 'dark';
    if (colorSchemeMeta?.content === 'dark') return 'dark';
    return 'light';
  };

  const applyTheme = (nextTheme, { persist = false } = {}) => {
    const resolved = nextTheme === 'dark' ? 'dark' : 'light';
    const isDark = resolved === 'dark';
    document.documentElement.dataset.theme = resolved;
    if (colorSchemeMeta) colorSchemeMeta.content = resolved;
    if (themeColorMeta) themeColorMeta.content = isDark ? '#091322' : '#f8fafc';
    if (toggleBtn) {
      const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      toggleBtn.setAttribute('aria-pressed', String(isDark));
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.setAttribute('title', label);
    }
    if (persist) {
      try {
        localStorage.setItem(storageKey, resolved);
      } catch {}
    }
  };

  applyTheme(getCurrentTheme());
  toggleBtn?.addEventListener('click', () => {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark', { persist: true });
  });
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) applyTheme(e.newValue === 'dark' ? 'dark' : 'light');
  });

  // Bilingual chrome switcher on medicine/directory pages
  const btnEn = document.getElementById('btnLangEn');
  const btnHi = document.getElementById('btnLangHi');
  if (!btnEn || !btnHi) return;

  const enTexts = new Map();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    enTexts.set(el.dataset.i18n, el.textContent);
  });

  const hiMap = {
    'nav-home': 'मुख्य पृष्ठ',
    'nav-directory': 'दवा निर्देशिका',
    'nav-search': 'खोज व पूछताछ',
    'bc-home': 'मुख्य पृष्ठ',
    'bc-medicines': 'नेत्र दवाइयाँ',
    'detail-status-title': 'काउंटर उपलब्धता व मूल्य नीति',
    'detail-status-copy':
      'यह नेत्र दवा दृष्टि मेडिकल स्टोर की संदर्भ सूची में दर्ज है। काउंटर पर आने से पहले फ़ोन कॉल द्वारा वर्तमान उपलब्धता और सटीक मूल्य की पुष्टि करें।',
    'detail-cta': 'उपलब्धता और मूल्य की पूछताछ करें',
    'detail-browse-all': 'सभी नेत्र दवाइयाँ देखें',
    'detail-specs-heading': 'सत्यापित उत्पाद विवरण',
    'detail-store-heading': 'स्टोर स्थान व पिकअप नीति',
    'detail-alt-heading': 'समान कंपोज़िशन वाले अन्य विकल्प'
  };

  const setLanguage = (lang) => {
    const isHi = lang === 'hi';
    btnEn.classList.toggle('active', !isHi);
    btnHi.classList.toggle('active', isHi);
    btnEn.setAttribute('aria-pressed', String(!isHi));
    btnHi.setAttribute('aria-pressed', String(isHi));
    document.documentElement.lang = isHi ? 'hi' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      if (isHi && hiMap[k]) el.textContent = hiMap[k];
      else if (!isHi && enTexts.has(k)) el.textContent = enTexts.get(k);
    });
  };

  btnEn.addEventListener('click', () => setLanguage('en'));
  btnHi.addEventListener('click', () => setLanguage('hi'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubpageChrome);
} else {
  initSubpageChrome();
}
