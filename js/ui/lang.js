// HU / EN switch for the explanatory pages (Rules, deck tips). Hungarian is the default.
const LS = 'rajongoi.lang';
export function getLang() {
  try { return localStorage.getItem(LS) === 'en' ? 'en' : 'hu'; } catch { return 'hu'; }
}
export function setLang(l) { try { localStorage.setItem(LS, l); } catch { /* ignore */ } }

/** Pick the current language from a { hu, en } pair (falls back to the other one, or a plain string). */
export function tr(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return v;
  const l = getLang();
  return v[l] ?? v.en ?? v.hu;
}

export function langToggleHtml() {
  const l = getLang();
  return `<div class="lang-toggle" role="group" aria-label="Language">
    <button type="button" data-lang="hu" class="${l === 'hu' ? 'on' : ''}">Magyar</button>
    <button type="button" data-lang="en" class="${l === 'en' ? 'on' : ''}">English</button></div>`;
}

/** Wire the toggle buttons inside `root`; `rerender` redraws the page in the new language. */
export function bindLangToggle(root, rerender) {
  root.querySelectorAll('.lang-toggle [data-lang]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    if (b.dataset.lang === getLang()) return;
    setLang(b.dataset.lang);
    rerender();
  });
}
