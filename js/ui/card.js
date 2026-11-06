// Card rendering, modelled on the riftcardmaker frames:
//   common   - copper frame, art window on top, white rules box
//   uncommon - silver frame, same layout
//   rare     - gold frame, art fills the whole card, text over the art
//   epic     - full-art frame (gold lines, name band fading out, text over art)
// Rules text is auto-fitted to its box by fitCards() (see bottom).
import { COLORS, TYPE_INFO, KEYWORDS } from '../engine/rules.js';
import { kindOf, rarityOf } from '../engine/cards.js';
export { rarityOf };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  T: '<span class="ico ico-tap" title="Tap">↷</span>',
  M: '<span class="ico ico-might" title="Might"><i class="mi"></i></span>',
  R: '<span class="ico ico-rune" title="Rune of this card\'s color">◆</span>',
};

/** riftcardmaker markup -> HTML: {Kw#HEX[#TEXT]}  __italic__  [n] [T] [M] [R] [x#hex] [+1M] */
export function markup(text) {
  let h = esc(text);
  h = h.replace(/\{([^#}]+)#([0-9a-fA-F]{6})(?:#([0-9a-fA-F]{6}))?\}/g,
    (_, label, bg, fg) => `<span class="kw" style="background:#${bg};color:#${fg || 'fff'}">${label.trim()}</span>`);
  h = h.replace(/__(.+?)__/gs, '<i>$1</i>');
  h = h.replace(/\[([A-Za-z])#([0-9a-fA-F]{6})\]/g, (_, k, c) => `<span class="ico" style="background:#${c}">${k.toUpperCase()}</span>`);
  h = h.replace(/\[([TMR])\]/g, (_, k) => ICONS[k]);
  h = h.replace(/\[P\]/g, '<span class="ico" title="Power rune">P</span>');
  h = h.replace(/\[\+(\d+)M\]/g, '+$1 ' + ICONS.M);
  h = h.replace(/\[(\d+)M\]/g, '$1' + ICONS.M);
  h = h.replace(/\[(\d+)P\]/g, '$1<span class="ico" title="Power rune">P</span>');
  h = h.replace(/\[(\d+\+?)\]/g, '<span class="ico ico-num">$1</span>');
  return h.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
}

const GLYPH = { unit: '⚔', champion: '★', spell: '✦', gear: '⚙', legend: '♛', signature: '✪', token: '♟', rune: '◆' };

export function colorHex(def) {
  return def.colors.length ? COLORS[def.colors[0]]?.hex || '#777' : '#6d6e6b';
}
const color2 = (def) => (def.colors[1] ? COLORS[def.colors[1]].hex : colorHex(def));

/** Full-art gold frame: Signatures, Legends and EPIC cards (with artwork). */
export function isFullArt(def) {
  return !!def.image && def.type !== 'rune' && (rarityOf(def) === 'epic' || def.type === 'signature' || def.type === 'legend');
}
/** Foil finish: Champions, Legends and EPIC cards (Signatures are EPIC). */
export const isFoil = (def) => ['champion', 'legend'].includes(def.type) || rarityOf(def) === 'epic' || !!def.fullArtRune;
const isRareArt = (def) => !!def.image && rarityOf(def) === 'rare';

/** Image placed exactly as riftcardmaker crops it onto the whole card. */
function cardImg(def) {
  const c = def.imageCrop;
  if (!c || !c.width || !c.height) return `<img class="card-img" src="${esc(def.image)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
  const w = 10000 / c.width, h = 10000 / c.height;
  const l = -c.x / c.width * 100, t = -c.y / c.height * 100;
  return `<img class="card-img" src="${esc(def.image)}" alt="" loading="lazy" style="width:${w.toFixed(2)}%;height:${h.toFixed(2)}%;left:${l.toFixed(2)}%;top:${t.toFixed(2)}%">`;
}

function placeholderArt(def) {
  const initials = def.name.replace(/[^A-Za-zÀ-ž ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="art-ph" style="--c1:${colorHex(def)};--c2:${def.colors[1] ? COLORS[def.colors[1]].hex : '#1d1a16'}">
    <span class="ph-glyph">${GLYPH[def.type] || '✦'}</span>
    <span class="ph-initials">${esc(initials)}</span>
    <span class="ph-label">artwork coming soon</span>
  </div>`;
}

export function typeLabel(def) {
  if (def.type === 'signature') return `Signature ${def.sigType === 'unit' ? 'Unit' : def.sigType === 'gear' ? 'Gear' : 'Spell'}`;
  if (def.type === 'token') return 'Token Unit';
  if (def.type === 'champion') return 'Champion Unit';
  return TYPE_INFO[def.type]?.label || def.type;
}

const recyclePill = (def) => (def.recycle
  ? `<div class="rpill" title="Recycle ${def.recycle} rune(s) of this color">${Array.from({ length: def.recycle }, () => '<span></span>').join('')}</div>`
  : '');

function rulesHtml(def) {
  const rules = def.text ? markup(def.text) : `<p class="wip-text">Design in progress${def.purpose ? ` — ${esc(def.purpose)}` : ''}.</p>`;
  return `<div class="textbox"><div class="rules">${rules}</div>${def.flavor ? `<div class="flavor">${esc(def.flavor)}</div>` : ''}</div>`;
}

/**
 * Full card face.
 * opts: size ('xs'|'sm'|'md'|'lg'), power (current might), cost (current cost), style (extra inline CSS),
 *       tapped, classes, uid, mini (battlefield version: no text), badges
 */
function runeHtml(def, opts) {
  const cls = ['card', 'rune-card', def.name && !/^\s*$/.test(def.name) && !def.fullArtRune ? '' : 'rune-bare', isFoil(def) ? 'foil' : '',
    `size-${opts.size || 'md'}`, opts.mini ? 'mini' : '', opts.classes || ''].join(' ');
  return `<div class="${cls}" data-cid="${esc(def.id)}" style="--c1:${colorHex(def)};--c2:${colorHex(def)}">
    <div class="art art-full">${def.image ? cardImg(def) : placeholderArt(def)}</div>
    <div class="frame"></div>
    <div class="typeline"><span class="domains"><span class="domain" style="background:${colorHex(def)}"></span></span><span class="type-badge">Rune</span></div>
    <div class="rune-name">${esc(def.name)}</div>
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || '')}</span></div>
    ${isFoil(def) ? '<div class="foil-layer"></div>' : ''}
  </div>`;
}

export function cardHtml(def, opts = {}) {
  if (def.type === 'rune') return runeHtml(def, opts);
  const k = kindOf(def);
  const rarity = rarityOf(def);
  const full = isFullArt(def), rare = isRareArt(def);
  const legend = def.type === 'legend';
  const showMight = k === 'unit';
  const might = opts.power ?? def.power;
  const mightCls = opts.power != null && opts.power !== def.power ? (opts.power > def.power ? 'up' : 'down') : '';
  const prov = def.provisional || [];
  const cls = ['card', `r-${rarity}`, full ? 'fullart' : rare ? 'rareart' : 'standard', legend ? 'is-legend' : '', k === 'gear' ? 'is-gear' : '',
    isFoil(def) ? 'foil' : '', `size-${opts.size || 'md'}`, opts.mini ? 'mini' : '', opts.tapped ? 'tapped' : '', opts.classes || ''].join(' ');
  const data = `data-cid="${esc(def.id)}"${opts.uid ? ` data-uid="${esc(opts.uid)}"` : ''}`;
  const style = `--domain:${colorHex(def)};--c1:${colorHex(def)};--c2:${color2(def)};--type:${TYPE_INFO[def.type]?.hex || '#555'}`;
  const tribes = (def.tribes || []).slice(0, 2);

  const art = def.image
    ? `<div class="art ${full || rare ? 'art-full' : 'art-window'}">${cardImg(def)}</div>`
    : `<div class="art art-window">${placeholderArt(def)}</div>`;
  const cost = legend || def.type === 'rune' ? ''
    : `<div class="cost ${prov.includes('cost') ? 'prov' : ''}" title="${prov.includes('cost') ? 'Provisional cost' : 'Cost'}"><span>${opts.cost ?? def.cost}</span></div>`;
  const domainsTopLeft = full && legend
    ? `<div class="fa-domains">${def.colors.map(c => `<span style="background:${COLORS[c]?.hex}" title="${c}"></span>`).join('')}</div>` : '';
  const mightHtml = showMight
    ? `<div class="might ${mightCls} ${prov.includes('might') ? 'prov' : ''}"><span class="might-ico"><i></i></span><span class="might-val">${might}</span></div>` : '';
  const typeline = full
    ? `<div class="typeline gold"><span>${[typeLabel(def), ...tribes].map(esc).join(' <i>◆</i> ')}</span></div>`
    : `<div class="typeline"><span class="domains">${def.colors.map(c => `<span class="domain" style="background:${COLORS[c]?.hex}" title="${c}"></span>`).join('')}</span><span class="type-badge">${esc(typeLabel(def))}</span>${tribes.map(t => `<span class="tribe">${esc(t)}</span>`).join('')}</div>`;

  return `<div class="${cls}" ${data} style="${style};${opts.style || ''}">
    ${art}
    ${full || rare ? '<div class="art-shade"></div>' : ''}
    <div class="frame"></div>
    ${cost}${domainsTopLeft}${recyclePill(def)}${mightHtml}
    ${def.wip || def.placeholder ? `<div class="wip-tag">${def.filler ? 'FILLER' : def.placeholder ? 'PLACEHOLDER' : 'WIP'}</div>` : ''}
    ${typeline}
    <div class="namebar"><span class="name">${esc(def.name)}</span>${def.subname && !opts.mini ? `<small>${esc(def.subname)}</small>` : ''}</div>
    ${rulesHtml(def)}
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || (def.owners || []).join(' / '))}</span></div>
    ${isFoil(def) ? '<div class="foil-layer"></div>' : ''}
    ${opts.badges || ''}
  </div>`;
}

/** Plain, always-readable version of a card's text (preview panel, details popup). */
export function cardDetailsHtml(def, opts = {}) {
  const k = kindOf(def);
  const stats = [];
  if (def.type !== 'legend' && def.type !== 'rune') stats.push(`Cost <b>${opts.cost ?? def.cost}</b>`);
  if (def.recycle) stats.push(`Recycle <b>${def.recycle}</b>`);
  if (k === 'unit') stats.push(`Might <b>${opts.power ?? def.power}</b>${opts.power != null && opts.power !== def.power ? ` <span class="muted">(printed ${def.power})</span>` : ''}`);
  const kwHelp = (def.keywords || []).filter(kw => KEYWORDS[kw] && !(def.text || '').includes(kw))
    .map(kw => `<p><span class="kw" style="background:${KEYWORDS[kw].hex}">${esc(kw)}</span> <i>${esc(KEYWORDS[kw].reminder.replace('[N]', ''))}</i></p>`).join('');
  return `<div class="card-details" style="--domain:${colorHex(def)}">
    <div class="cd-name">${esc(def.name)}${def.subname ? ` <span class="muted">— ${esc(def.subname)}</span>` : ''}</div>
    <div class="cd-type">${esc(typeLabel(def))}${(def.tribes || []).length ? ' · ' + def.tribes.map(esc).join(', ') : ''} · ${def.colors.join(' / ') || 'Neutral'}</div>
    ${stats.length ? `<div class="cd-stats">${stats.join(' · ')}</div>` : ''}
    <div class="cd-text">${def.text ? markup(def.text) : '<p class="muted">No rules text yet.</p>'}${kwHelp}</div>
    ${def.flavor ? `<div class="cd-flavor">${esc(def.flavor)}</div>` : ''}
  </div>`;
}

export function cardBackHtml(opts = {}) {
  return `<div class="card card-back size-${opts.size || 'sm'} ${opts.classes || ''}" ${opts.attrs || ''}><div class="back-inner"><span>RAJONGOI<br>TCG</span></div>${opts.label ? `<div class="back-label">${opts.label}</div>` : ''}</div>`;
}

// ------------------------------------------------------------------ fitting --
// Shrinks rules text (and long names) until they fit their box. Runs for every
// card that appears in the DOM; re-runs once web fonts have loaded.
function fitCard(card) {
  if (card.classList.contains('mini') || card.classList.contains('card-back')) return;
  const box = card.querySelector('.textbox');
  const name = card.querySelector('.namebar .name');
  if (!box || box.offsetParent === null || box.clientHeight === 0) return;
  box.style.fontSize = '';
  let size = parseFloat(getComputedStyle(box).fontSize);
  const min = size * 0.45;
  for (let i = 0; i < 30 && box.scrollHeight > box.clientHeight + 1 && size > min; i++) {
    size *= 0.94;
    box.style.fontSize = size + 'px';
  }
  if (name) {
    name.style.fontSize = '';
    let ns = parseFloat(getComputedStyle(name).fontSize);
    const nmin = ns * 0.5;
    for (let i = 0; i < 20 && name.scrollWidth > name.clientWidth + 1 && ns > nmin; i++) {
      ns *= 0.94;
      name.style.fontSize = ns + 'px';
    }
  }
  card.dataset.fitted = card.getBoundingClientRect().width.toFixed(0);
}

export function fitCards(root = document, force = false) {
  for (const card of root.querySelectorAll('.card')) {
    const w = card.getBoundingClientRect().width.toFixed(0);
    if (!force && card.dataset.fitted === w) continue;
    fitCard(card);
  }
}

let scheduled = false;
export function installAutoFit() {
  const run = () => { scheduled = false; fitCards(); };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(run); } };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true); // images load -> layout settles
  if (document.fonts?.ready) document.fonts.ready.then(() => fitCards(document, true));
  schedule();
}
