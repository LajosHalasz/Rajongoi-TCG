// Card rendering — layout modelled on the riftcardmaker frame:
// cost (top-left), might (top-right), art (top), type badge + tribe,
// name bar in the card's color, rules text box, flavor box, set footer.
import { COLORS, TYPE_INFO } from '../engine/rules.js';
import { kindOf, artPool } from '../engine/cards.js';

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
  h = h.replace(/\[([A-Za-z])#([0-9a-fA-F]{6})\]/g, (_, k, c) => `<span class="ico" style="background:#${c}">${k.toUpperCase()}</span>`);
  h = h.replace(/\[([TMR])\]/g, (_, k) => ICONS[k]);
  h = h.replace(/\[P\]/g, '<span class="ico" title="Power rune">P</span>');
  h = h.replace(/\[\+(\d+)M\]/g, '+$1 ' + ICONS.M);
  h = h.replace(/\[(\d+\+?)\]/g, '<span class="ico ico-num">$1</span>');
  return h.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
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
  const pool = artPool();
  if (pool.length) {
    // borrow finished artwork: same colour if possible, varied crop, tinted to this card's colour
    const same = pool.filter(c => c.colors.some(x => def.colors.includes(x)));
    const src = same.length ? same : pool;
    const h = hash(def.id);
    const pick = src[h % src.length];
    const zoom = 1.25 + ((h >> 4) % 50) / 100;
    const px = (h >> 8) % 100, py = (h >> 12) % 100;
    return `<div class="art-ph borrowed" style="--c1:${c1};--c2:${c2}">
      <img class="art-img" src="${esc(pick.image)}" alt="" loading="lazy" style="object-position:${px}% ${py}%;transform:scale(${zoom.toFixed(2)})${h & 1 ? ' scaleX(-1)' : ''}">
      <span class="ph-label">placeholder art</span></div>`;
  }
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
  const prov = def.provisional || [];
  return `<div class="${cls}" ${data} style="--domain:${colorHex(def)};--type:${typeHex}">
    <div class="art">${artHtml(def)}</div>
    <div class="frame"></div>
    ${def.type === 'legend' || def.type === 'rune' ? '' : `<div class="cost ${prov.includes('cost') ? 'prov' : ''}" title="${prov.includes('cost') ? 'Provisional cost' : 'Cost'}"><span>${opts.cost ?? def.cost}</span></div>`}
    ${def.recycle ? `<div class="recycle" title="Recycle ${def.recycle} rune(s) of this color"><i>↻</i>${def.recycle}</div>` : ''}
    ${showMight ? `<div class="might ${mightCls} ${prov.includes('might') ? 'prov' : ''}"><span class="might-ico">⛨</span><span class="might-val">${might}</span></div>` : ''}
    ${def.wip || def.placeholder ? `<div class="wip-tag">${def.filler ? 'FILLER' : def.placeholder ? 'PLACEHOLDER' : 'WIP'}</div>` : ''}
    <div class="typeline"><span class="domains">${domains}</span><span class="type-badge">${esc(typeLabel(def))}</span>${tribes}</div>
    <div class="namebar"><span style="${nameSize(def.name, opts.mini)}">${esc(def.name)}</span>${def.subname && !opts.mini ? `<small>${esc(def.subname)}</small>` : ''}</div>
    <div class="textbox">${def.text ? markup(def.text) : `<p class="wip-text">Design in progress${def.purpose ? ` — ${esc(def.purpose)}` : ''}.</p>`}${def.flavor ? `<div class="flavor">${esc(def.flavor)}</div>` : ''}</div>
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || (def.owners || []).join(' / '))}</span></div>
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
