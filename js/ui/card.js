// Card rendering — layout modelled on the riftcardmaker frame:
// cost (top-left), might (top-right), art (top), type badge + tribe,
// name bar in the card's color, rules text box, flavor box, set footer.
import { COLORS, TYPE_INFO } from '../engine/rules.js';
import { kindOf } from '../engine/cards.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  T: '<span class="ico ico-tap" title="Tap">↷</span>',
  M: '<span class="ico ico-might" title="Might">⛨</span>',
  R: '<span class="ico ico-rune" title="Rune of this card\'s color">◆</span>',
};

/** riftcardmaker markup -> HTML: {Kw#HEX[#TEXT]}  __italic__  [n] [T] [M] [R] */
export function markup(text) {
  let h = esc(text);
  h = h.replace(/\{([^#}]+)#([0-9a-fA-F]{6})(?:#([0-9a-fA-F]{6}))?\}/g,
    (_, label, bg, fg) => `<span class="kw" style="background:#${bg};color:#${fg || 'fff'}">${label.trim()}</span>`);
  h = h.replace(/__(.+?)__/gs, '<i>$1</i>');
  h = h.replace(/\[([TMR])\]/g, (_, k) => ICONS[k]);
  h = h.replace(/\[(\d+)\]/g, '<span class="ico ico-num">$1</span>');
  return h.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
}

const GLYPH = { unit: '⚔', champion: '★', spell: '✦', gear: '⚙', legend: '♛', signature: '✪', token: '♟' };

export function colorHex(def) {
  return def.colors.length ? COLORS[def.colors[0]]?.hex || '#777' : '#6d6e6b';
}

function artHtml(def) {
  if (def.image) {
    let pos = 'center';
    if (def.imageCrop) {
      const cx = def.imageCrop.x + def.imageCrop.width / 2;
      pos = `${Math.max(0, Math.min(100, cx)).toFixed(0)}% center`;
    }
    return `<img class="art-img" src="${esc(def.image)}" alt="" loading="lazy" style="object-position:${pos}">`;
  }
  const c1 = colorHex(def);
  const c2 = def.colors[1] ? COLORS[def.colors[1]].hex : '#1d1a16';
  const initials = def.name.replace(/[^A-Za-zÀ-ž ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="art-ph" style="--c1:${c1};--c2:${c2}">
    <span class="ph-glyph">${GLYPH[def.type] || '✦'}</span>
    <span class="ph-initials">${esc(initials)}</span>
    <span class="ph-label">artwork coming soon</span>
  </div>`;
}

function typeLabel(def) {
  if (def.type === 'signature') return `Signature ${def.sigType === 'unit' ? 'Unit' : def.sigType === 'gear' ? 'Gear' : 'Spell'}`;
  if (def.type === 'token') return 'Token Unit';
  return TYPE_INFO[def.type]?.label || def.type;
}

/**
 * Full card face.
 * opts: size ('xs'|'sm'|'md'|'lg'), power (current might, overrides printed),
 *       tapped, classes, uid, mini (hide text box — for the battlefield)
 */
export function cardHtml(def, opts = {}) {
  const k = kindOf(def);
  const showMight = k === 'unit';
  const might = opts.power ?? def.power;
  const mightCls = opts.power != null && opts.power !== def.power ? (opts.power > def.power ? 'up' : 'down') : '';
  const typeHex = TYPE_INFO[def.type]?.hex || '#555';
  const cls = ['card', `size-${opts.size || 'md'}`, opts.mini ? 'mini' : '', opts.tapped ? 'tapped' : '', opts.classes || ''].join(' ');
  const data = `data-cid="${esc(def.id)}"${opts.uid ? ` data-uid="${esc(opts.uid)}"` : ''}`;
  const tribes = (def.tribes || []).slice(0, 2).map(t => `<span class="tribe">${esc(t)}</span>`).join('');
  const domains = def.colors.map(c => `<span class="domain" style="background:${COLORS[c]?.hex}" title="${c}"></span>`).join('');
  const badges = opts.badges || '';
  return `<div class="${cls}" ${data} style="--domain:${colorHex(def)};--type:${typeHex}">
    <div class="art">${artHtml(def)}</div>
    <div class="frame"></div>
    ${def.type === 'legend' ? '' : `<div class="cost"><span>${def.cost}</span></div>`}
    ${showMight ? `<div class="might ${mightCls}"><span class="might-ico">⛨</span><span class="might-val">${might}</span></div>` : ''}
    <div class="typeline"><span class="domains">${domains}</span><span class="type-badge">${esc(typeLabel(def))}</span>${tribes}</div>
    <div class="namebar"><span style="${nameSize(def.name, opts.mini)}">${esc(def.name)}</span></div>
    <div class="textbox">${markup(def.text)}${def.flavor ? `<div class="flavor">${esc(def.flavor)}</div>` : ''}</div>
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || (def.placeholder ? 'placeholder' : ''))}</span></div>
    ${badges}
  </div>`;
}

function nameSize(name, mini) {
  if (mini) return '';
  const n = name.length;
  return n > 20 ? `font-size:${Math.max(3.6, 6.2 * 20 / n).toFixed(2)}cqw` : '';
}

export function cardBackHtml(opts = {}) {
  return `<div class="card card-back size-${opts.size || 'sm'} ${opts.classes || ''}" ${opts.attrs || ''}><div class="back-inner"><span>RIFT<br>MASTERS</span></div>${opts.label ? `<div class="back-label">${opts.label}</div>` : ''}</div>`;
}
