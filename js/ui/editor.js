// Card Editor: design a card in the game's own card schema with a live preview, drag/zoom the
// artwork, build working abilities from the engine's effect primitives, then save it (this
// browser), add it to a deck, or export it so it can be committed to the game for everyone.
import { allCards, getDef, hasDef, normalize, describeEffect } from '../engine/cards.js';
import { COLORS, KEYWORDS } from '../engine/rules.js';
import { cardHtml, esc, markup } from './card.js';
import { customCards, isCustomCard, saveCustomCard, deleteCustomCard, customDecks, saveCustomDecks } from '../data.js';

const CARD_ASPECT = 5 / 7; // .card { aspect-ratio: 5 / 7 } — imageCrop is relative to the whole card
const SETS = ['OGN', 'DND', 'TKN'];
const TYPES = [['unit', 'Unit'], ['champion', 'Champion Unit'], ['spell', 'Spell'], ['gear', 'Gear'], ['signature', 'Signature'], ['legend', 'Legend'], ['token', 'Token Unit']];
const RARITIES = ['common', 'uncommon', 'rare', 'epic'];
const KW_LIST = Object.keys(KEYWORDS).filter(k => k !== 'Shieldify');
const TRIGGERS = [
  ['play', 'When played'], ['attack', 'When this attacks'], ['destroyed', 'When this is destroyed'],
  ['turnStart', 'At the start of your turn'], ['unitPlayed', 'Whenever you play a Unit'], ['spellCast', 'Whenever you cast a Spell'],
  ['activate', '[T] Tap ability'], ['static', 'Always (static)'],
];
const TARGETS = [
  ['enemyUnit', 'target enemy Unit'], ['friendlyUnit', 'target friendly Unit'], ['anyUnit', 'target Unit'],
  ['enemyTappedUnit', 'target tapped enemy Unit'], ['enemyGear', 'target enemy Gear'], ['allEnemyUnits', 'all enemy Units'],
  ['allFriendlyUnits', 'all your Units'], ['allUnits', 'all Units'], ['self', 'this Unit'],
];
const ACTIONS = {
  draw: { label: 'Draw cards', p: ['amount', 'who'] },
  destroy: { label: 'Destroy', p: ['target', 'maxPower'] },
  buff: { label: '+/- Might', p: ['target', 'amount', 'duration'] },
  grantKeyword: { label: 'Give a keyword', p: ['target', 'keyword', 'duration'] },
  tap: { label: 'Tap', p: ['target', 'maxPower'] },
  untap: { label: 'Ready (untap)', p: ['target'] },
  bounce: { label: 'Return to hand', p: ['target', 'maxPower'] },
  copyUnit: { label: 'Copy a Unit (Haste, dies at end of turn)', p: ['target', 'maxPower'] },
  token: { label: 'Create a token', p: ['tokenId', 'amount'] },
  breakShield: { label: "Break opponent's Shields", p: ['amount'] },
  addShield: { label: 'Add Shields from your deck', p: ['amount'] },
  channel: { label: 'Channel extra runes', p: ['amount'] },
  discard: { label: 'Opponent discards (random)', p: ['amount'] },
  recover: { label: 'Unit from Graveyard to hand', p: [] },
  cantLose: { label: "You can't lose this turn", p: [] },
};
const DRAFT_LS = 'rajongoi.editorDraft.v1';

const slug = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad3 = (n) => String(n).padStart(3, '0');

function nextNumber(set) {
  const nums = allCards().filter(c => c.set === set && /^\d+$/.test(String(c.number))).map(c => +c.number);
  return pad3((nums.length ? Math.max(...nums) : 0) + 1);
}

function blankState() {
  return {
    editing: null, set: 'OGN', number: nextNumber('OGN'), name: '', subname: '', type: 'unit', sigType: 'spell', legend: '',
    colors: ['Fury'], cost: 2, power: 2, recycle: 0, rarity: 'common', tribes: '', keywords: [], shieldify: 0, uses: 0,
    activateCost: 0, autoText: true, text: '', flavor: '', illustrator: '',
    image: null, iw: 0, ih: 0, zoom: 1, cx: 50, cy: 50, effects: [],
  };
}

/** Editor state from an existing card definition (to edit it). */
function stateFromDef(d) {
  const st = blankState();
  Object.assign(st, {
    editing: d.id, set: d.set || 'OGN', number: String(d.number || ''), name: d.name || '', subname: d.subname || '',
    type: d.type, sigType: d.sigType || 'spell', legend: d.legend || '', colors: [...(d.colors || [])],
    cost: d.cost || 0, power: d.power || 0, recycle: d.recycle || 0, rarity: ['epic', 'legendary', 'showcase'].includes(d.rarity) ? 'epic' : (d.rarity || 'common'),
    tribes: (d.tribes || []).join(', '), keywords: (d.keywords || []).filter(k => k !== 'Shieldify'),
    shieldify: (d.effects || []).find(e => e.do === 'shieldify')?.amount || 0, uses: d.uses || 0, activateCost: d.activateCost || 0,
    effects: (d.effects || []).filter(e => e.do !== 'shieldify').map(e => ({ ...e })),
    flavor: d.flavor || '', illustrator: d.illustrator || '', image: d.image || null,
  });
  const generated = normalize({ ...d, text: '' }).text;
  st.autoText = !d.text || d.text === generated;
  st.text = st.autoText ? '' : d.text;
  if (d.imageCrop?.width) {
    st.cropFromDef = d.imageCrop; // turned into zoom/centre once the image size is known
  }
  return st;
}

// ------------------------------------------------------------------ crop maths --
function cropOf(st) {
  if (!st.iw || !st.ih) return { x: 0, y: 0, width: 100, height: 100 };
  const r = st.iw / st.ih;
  let w, h;
  if (r > CARD_ASPECT) { h = 100 / st.zoom; w = h * CARD_ASPECT / r; } else { w = 100 / st.zoom; h = w * r / CARD_ASPECT; }
  return { x: st.cx - w / 2, y: st.cy - h / 2, width: w, height: h };
}
function zoomFromCrop(st, c) {
  const r = st.iw / st.ih;
  st.zoom = r > CARD_ASPECT ? 100 / c.height : 100 / c.width;
  const k = cropOf({ ...st, cx: 0, cy: 0 });
  st.cx = c.x + k.width / 2; st.cy = c.y + k.height / 2;
}
function imgStyle(c) {
  return { width: `${(10000 / c.width).toFixed(2)}%`, height: `${(10000 / c.height).toFixed(2)}%`,
    left: `${(-c.x / c.width * 100).toFixed(2)}%`, top: `${(-c.y / c.height * 100).toFixed(2)}%` };
}

// --------------------------------------------------------------- state -> card --
function cardId(st) {
  if (st.type === 'legend') return `${st.set}-L-${slug(st.subname || st.name) || 'new'}`;
  return `${st.type === 'token' ? 'TKN' : st.set}-${pad3(st.number || '0')}`;
}

export function buildDef(st) {
  const id = cardId(st);
  const set = st.type === 'token' ? 'TKN' : st.set;
  const effects = st.effects.map(e => {
    const o = { ...e };
    if (o.do === 'token') o.tokenName = hasDef(o.tokenId) ? getDef(o.tokenId).name : 'token';
    for (const k of Object.keys(o)) if (o[k] === '' || o[k] == null) delete o[k];
    return o;
  });
  if (st.shieldify > 0) effects.unshift({ on: 'play', do: 'shieldify', amount: +st.shieldify });
  const keywords = [...st.keywords, ...(st.shieldify > 0 ? ['Shieldify'] : [])];
  const def = {
    id, set, number: st.type === 'legend' ? id.split('-').slice(1).join('-') : pad3(st.number || '0'),
    name: st.name.trim() || 'Untitled card', type: st.type, colors: [...st.colors],
    cost: +st.cost || 0, power: +st.power || 0, recycle: +st.recycle || 0, rarity: st.rarity,
    keywords, effects, tribes: st.tribes.split(',').map(t => t.trim()).filter(Boolean),
    text: st.autoText ? '' : st.text, flavor: st.flavor, illustrator: st.illustrator,
    setInfo: st.type === 'legend' ? `${set} Legend` : `${set} ${pad3(st.number || '0')}/300`,
    source: 'editor', custom: true,
  };
  if (st.subname.trim()) def.subname = st.subname.trim();
  if (st.type === 'signature') { def.sigType = st.sigType; if (st.legend) def.legend = st.legend; }
  if (st.type === 'legend') { def.owners = [st.subname.trim() || st.name.trim()]; def.rarity = 'rare'; } // every Legend is Rare
  if (st.type === 'token') def.token = true;
  if (+st.uses > 0) def.uses = +st.uses;
  if (effects.some(e => e.on === 'activate') && +st.activateCost > 0) def.activateCost = +st.activateCost;
  if (st.image) { def.image = st.image; def.imageCrop = cropOf(st); }
  if (st.rarity === 'epic' && !['legend', 'rune'].includes(st.type)) def.fullArt = true; // Epic = full-art frame (as in riftcardmaker)
  return def;
}

// --------------------------------------------------------------- images --
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
/** Uploaded picture -> JPEG data URL, longest side 1000px (orientation is baked in by the browser). */
async function fileToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    const k = Math.min(1, 1000 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return { src: cv.toDataURL('image/jpeg', 0.86), iw: cv.width, ih: cv.height };
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------ riftcardmaker JSON import --
const RC_TYPES = { 1: 'legend', 2: 'champion', 3: 'unit', 4: 'spell', 5: 'gear', 6: 'rune', 7: 'token' };
const RC_COLORS = { 1: 'Fury', 2: 'Calm', 3: 'Mind', 4: 'Body', 5: 'Chaos', 6: 'Order' };
const RC_RARITY = { 1: 'common', 2: 'common', 3: 'common', 4: 'uncommon', 5: 'rare', 6: 'epic', 7: 'epic' };
const dec = (v, m) => (v != null && /^\d+$/.test(String(v)) ? m[+v] : v);

async function stateFromRiftcardmaker(j) {
  const st = blankState();
  const info = String(j.setInfo || '').trim().match(/^([A-Za-z]+)[\s-]*(\d+)/);
  let set = info ? info[1].toUpperCase() : 'OGN';
  if (set === 'TOKEN') set = 'TKN';
  let type = String(dec(j.type, RC_TYPES) || 'unit').toLowerCase();
  if (type.includes('champion')) type = 'champion';
  if (set === 'TKN') type = 'token';
  if (type === 'rune') throw new Error('Runes are not supported in the editor.');
  const colors = [dec(j.color, RC_COLORS), dec(j.secondColor, RC_COLORS)]
    .map(c => String(c || '').trim()).filter(c => c && c.toLowerCase() !== 'neutral')
    .map(c => c[0].toUpperCase() + c.slice(1).toLowerCase()).filter(c => COLORS[c]);
  const kws = [];
  let shieldify = 0;
  for (const m of String(j.description || '').matchAll(/\{([^#}]+)#[^}]*\}/g)) {
    const raw = m[1].trim(), num = raw.match(/^(.*?)\s+(\d+)$/);
    if (raw === 'Double Breaker') kws.push('Breaker');
    else if (num && num[1] === 'Shieldify') shieldify = +num[2];
    else if (KEYWORDS[raw]) kws.push(raw);
  }
  Object.assign(st, {
    set: SETS.includes(set) ? set : 'OGN', number: info ? pad3(info[2]) : st.number, type, colors: colors.length ? colors : ['Fury'],
    name: (j.name || '').trim(), subname: (j.subname || '').trim(), cost: j.energy ?? 0, power: j.might ?? 0,
    recycle: j.power > 0 ? j.power : 0, rarity: dec(j.rarity, RC_RARITY) || 'common',
    tribes: (j.tribes || j.tags || []).map(t => t.text || t).filter(Boolean).join(', '),
    keywords: [...new Set(kws)], shieldify, text: j.description || '', autoText: !j.description,
    flavor: j.flavorText || '', illustrator: j.illustrator || '',
  });
  const layers = (j.images || []).filter(im => /^data:image\//.test(im.src || '')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (layers.length === 1) {
    const im = await loadImage(layers[0].src);
    Object.assign(st, { image: layers[0].src, iw: im.naturalWidth, ih: im.naturalHeight });
    if (layers[0].croppedArea) zoomFromCrop(st, layers[0].croppedArea);
  } else if (layers.length > 1) {
    // composite the layers onto one card-sized picture, as riftcardmaker shows them
    const W = 900, H = Math.round(W / CARD_ASPECT);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const L of layers) {
      const im = await loadImage(L.src);
      const c = L.croppedArea || { x: 0, y: 0, width: 100, height: 100 };
      const sx = W / (im.naturalWidth * c.width / 100), sy = H / (im.naturalHeight * c.height / 100);
      g.globalAlpha = L.opacity ?? 1;
      g.drawImage(im, -c.x / 100 * im.naturalWidth * sx, -c.y / 100 * im.naturalHeight * sy, im.naturalWidth * sx, im.naturalHeight * sy);
    }
    Object.assign(st, { image: cv.toDataURL('image/jpeg', 0.86), iw: W, ih: H, zoom: 1, cx: 50, cy: 50 });
  }
  return st;
}

// --------------------------------------------------------------- page --
let st = null;

function saveDraft() { try { localStorage.setItem(DRAFT_LS, JSON.stringify(st)); } catch { /* full or blocked */ } }
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_LS)); } catch { return null; } }

function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const bundle = (cards) => ({ format: 'rajongoi-cards', version: 1, exported: new Date().toISOString(), cards });

function flash(app, msg, bad = false) {
  const el = app.querySelector('#ed-msg');
  if (!el) return;
  el.textContent = msg; el.className = 'ed-msg ' + (bad ? 'bad' : 'good');
  clearTimeout(flash.t); flash.t = setTimeout(() => (el.textContent = ''), 5000);
}

const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
const num = (k, label, min = 0, max = 20) => `<label class="ed-f"><span>${label}</span><input type="number" data-k="${k}" min="${min}" max="${max}" value="${esc(st[k])}"></label>`;

function effectRow(e, i) {
  if (!ACTIONS[e.do]) { // hand-written logic the builder has no controls for: kept as it is
    let txt = '';
    try { txt = describeEffect(e, buildDef(st)) || e.do; } catch { txt = e.do; }
    return `<div class="ed-eff ed-eff-special"><div class="ed-eff-row"><span class="ed-special">Special</span>
      <span>${esc((TRIGGERS.find(t => t[0] === (e.on || 'play')) || [, e.on])[1])}: <code>${esc(e.do)}</code></span>
      <button class="ghost ed-x" data-del-eff="${i}" title="Remove">✕</button></div>
      <div class="ed-eff-text muted">${markup(txt)} <i>(existing game logic — kept as it is)</i></div></div>`;
  }
  const a = ACTIONS[e.do];
  const tokens = allCards().filter(c => c.type === 'token' || c.token);
  const params = a.p.map(p => {
    if (p === 'target') return `<select data-e="${i}" data-ek="target">${TARGETS.map(([v, l]) => opt(v, l, e.target)).join('')}</select>`;
    if (p === 'amount') return `<label class="ed-inline">×<input type="number" data-e="${i}" data-ek="amount" value="${esc(e.amount ?? 1)}" min="-10" max="10"></label>`;
    if (p === 'maxPower') return `<label class="ed-inline">max Might<input type="number" data-e="${i}" data-ek="maxPower" value="${esc(e.maxPower ?? '')}" min="0" max="20" placeholder="any"></label>`;
    if (p === 'duration') return `<select data-e="${i}" data-ek="duration">${opt('turn', 'this turn', e.duration || 'turn')}${opt('permanent', 'permanently', e.duration)}</select>`;
    if (p === 'keyword') return `<select data-e="${i}" data-ek="keyword">${KW_LIST.map(k => opt(k, k, e.keyword)).join('')}</select>`;
    if (p === 'who') return `<select data-e="${i}" data-ek="who">${opt('', 'you', e.who || '')}${opt('opponent', 'your opponent', e.who)}</select>`;
    if (p === 'tokenId') return `<select data-e="${i}" data-ek="tokenId">${tokens.map(t => opt(t.id, `${t.name} (${t.power} Might)`, e.tokenId)).join('')}</select>`;
    return '';
  }).join('');
  let preview = '';
  try { preview = describeEffect(e, buildDef(st)); } catch { /* incomplete */ }
  return `<div class="ed-eff">
    <div class="ed-eff-row">
      <select data-e="${i}" data-ek="on">${TRIGGERS.map(([v, l]) => opt(v, l, e.on || 'play')).join('')}</select>
      <select data-e="${i}" data-ek="do">${Object.entries(ACTIONS).map(([v, x]) => opt(v, x.label, e.do)).join('')}</select>
      ${params}
      <button class="ghost ed-x" data-del-eff="${i}" title="Remove">✕</button>
    </div>
    <div class="ed-eff-text muted">${markup(preview)}</div></div>`;
}

function formHtml() {
  const legends = allCards().filter(c => c.type === 'legend').sort((a, b) => a.name.localeCompare(b.name));
  const unit = ['unit', 'champion', 'token'].includes(st.type) || (st.type === 'signature' && st.sigType === 'unit');
  const hasActivate = st.effects.some(e => e.on === 'activate');
  const def = buildDef(st);
  const exists = hasDef(def.id) && !isCustomCard(def.id) && st.editing !== def.id;
  const decks = customDecks();
  return `
  <section class="ed-sec"><h3>Basics</h3>
    <div class="ed-grid">
      <label class="ed-f ed-wide"><span>Name</span><input data-k="name" value="${esc(st.name)}" placeholder="Card name" maxlength="60"></label>
      <label class="ed-f"><span>Subname / owner</span><input data-k="subname" value="${esc(st.subname)}" placeholder="e.g. Lui"></label>
      <label class="ed-f"><span>Type</span><select data-k="type">${TYPES.map(([v, l]) => opt(v, l, st.type)).join('')}</select></label>
      ${st.type === 'signature' ? `<label class="ed-f"><span>Signature kind</span><select data-k="sigType">${opt('spell', 'Spell', st.sigType)}${opt('unit', 'Unit', st.sigType)}${opt('gear', 'Gear', st.sigType)}</select></label>
        <label class="ed-f"><span>Belongs to Legend</span><select data-k="legend">${opt('', '— choose —', st.legend)}${legends.map(l => opt(l.id, `${l.name}${l.owners?.[0] ? ' (' + l.owners[0] + ')' : ''}`, st.legend)).join('')}</select></label>` : ''}
      ${st.type !== 'token' ? `<label class="ed-f"><span>Set</span><select data-k="set">${SETS.filter(x => x !== 'TKN').map(x => opt(x, x, st.set)).join('')}</select></label>` : ''}
      ${st.type !== 'legend' ? `<label class="ed-f"><span>Number</span><input data-k="number" value="${esc(st.number)}" inputmode="numeric" maxlength="3"></label>` : ''}
      <label class="ed-f"><span>Rarity</span><select data-k="rarity">${RARITIES.map(r => opt(r, r[0].toUpperCase() + r.slice(1), st.rarity)).join('')}</select></label>
    </div>
    <div class="ed-id">Card id: <code>${esc(def.id)}</code>${exists ? ` <span class="warn">⚠ replaces the existing card “${esc(getDef(def.id).name)}” in this browser</span>` : ''}
      ${st.type === 'champion' ? '<div class="muted">A Champion belongs to a Legend through its name or subname (e.g. subname “Lui”).</div>' : ''}</div>
  </section>

  <section class="ed-sec"><h3>Colors &amp; stats</h3>
    <div class="ed-colors">${Object.keys(COLORS).map(c => `<button type="button" class="ed-color ${st.colors.includes(c) ? 'on' : ''}" data-color="${c}" style="--c:${COLORS[c].hex}">${c}</button>`).join('')}
      <span class="muted">max. 2</span></div>
    <div class="ed-grid">
      ${st.type !== 'legend' && st.type !== 'token' ? num('cost', 'Mana cost', 0, 15) : ''}
      ${unit ? num('power', 'Might', 0, 20) : ''}
      ${st.type !== 'legend' && st.type !== 'token' ? num('recycle', 'Recycle', 0, 6) : ''}
      <label class="ed-f ed-wide"><span>Tags (comma separated)</span><input data-k="tribes" value="${esc(st.tribes)}" placeholder="e.g. Art, Movie"></label>
    </div>
  </section>

  <section class="ed-sec"><h3>Artwork</h3>
    <div class="ed-art">
      <label class="ed-drop" id="ed-drop"><input type="file" id="ed-file" accept="image/*" hidden>
        <b>${st.image ? 'Change picture' : 'Upload picture'}</b><span class="muted">click or drop an image here</span></label>
      ${st.image ? `<label class="ed-f ed-wide"><span>Zoom</span><input type="range" id="ed-zoom" min="0.4" max="4" step="0.01" value="${st.zoom}"></label>
        <div class="row"><button type="button" class="ghost" id="ed-center">Center</button><button type="button" class="ghost" id="ed-noimg">Remove picture</button>
        <span class="muted">Drag the picture on the preview to move it, scroll to zoom.</span></div>` : ''}
    </div>
  </section>

  <section class="ed-sec"><h3>Keywords</h3>
    <div class="ed-kws">${KW_LIST.map(k => `<button type="button" class="ed-kw ${st.keywords.includes(k) ? 'on' : ''}" data-kw="${esc(k)}" style="--c:${KEYWORDS[k].hex}" title="${esc(KEYWORDS[k].reminder)}">${esc(k)}</button>`).join('')}</div>
    <div class="ed-grid">${num('shieldify', 'Shieldify N (0 = none)', 0, 3)}${st.type === 'gear' ? num('uses', 'Saga: expires after N uses (0 = never)', 0, 9) : ''}</div>
  </section>

  <section class="ed-sec"><h3>Abilities <span class="muted">(these actually work in the game)</span></h3>
    ${st.effects.map(effectRow).join('') || '<p class="muted">No abilities yet — vanilla card, or keywords only.</p>'}
    <div class="row"><button type="button" class="ghost" id="ed-add-eff">+ Add ability</button>
      ${hasActivate ? num('activateCost', 'Extra mana for [T] abilities', 0, 9) : ''}</div>
  </section>

  <section class="ed-sec"><h3>Card text</h3>
    <label class="ed-check"><input type="checkbox" data-k="autoText" ${st.autoText ? 'checked' : ''}> Write the text automatically from keywords and abilities</label>
    ${st.autoText ? `<div class="ed-autotext muted">${esc(normalize(def).text) || '—'}</div><button type="button" class="ghost" id="ed-edit-text">Edit this text by hand</button>`
      : `<div class="ed-tools">${['[T]', '[M]', '[1]', '[2]', '[U]', '__(reminder)__'].map(t => `<button type="button" class="ghost" data-ins="${esc(t)}">${esc(t)}</button>`).join('')}
          <select id="ed-ins-kw"><option value="">+ keyword badge…</option>${Object.keys(KEYWORDS).map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
        <textarea data-k="text" rows="6" placeholder="Rules text. {Keyword#HEX} = colored badge, __text__ = italic, [T] tap, [M] might, [2] mana">${esc(st.text)}</textarea>
        <div class="muted ed-hint">The text is only what is printed — the game logic comes from Keywords and Abilities above.</div>`}
    <div class="ed-grid">
      <label class="ed-f ed-wide"><span>Flavor text</span><input data-k="flavor" value="${esc(st.flavor)}" maxlength="140"></label>
      <label class="ed-f"><span>Illustrator</span><input data-k="illustrator" value="${esc(st.illustrator)}"></label>
    </div>
  </section>

  <section class="ed-sec ed-actions">
    <div class="row"><button class="primary" id="ed-save">💾 Save card</button><button class="ghost" id="ed-new">New card</button>
      <button class="ghost" id="ed-export">⬇ Download card file</button><span id="ed-msg" class="ed-msg"></span></div>
    ${isCustomCard(def.id) ? `<div class="row ed-deckrow"><span>Add to deck:</span>
      ${decks.length ? `<select id="ed-deck">${decks.map(d => opt(d.id, d.name, '')).join('')}</select><button class="ghost" id="ed-add-deck">Add</button>`
        : '<span class="muted">No own deck yet — in <a href="#/decks">Decks</a> make a copy of a deck (e.g. Lui\'s) first.</span>'}</div>` : ''}
  </section>`;
}

function listHtml() {
  const mine = customCards().slice().sort((a, b) => a.id.localeCompare(b.id));
  return `<div class="ed-list-head"><b>My cards</b> <span class="muted">${mine.length}</span><span class="spacer"></span>
      <label class="ghost ed-btn-sm">Import<input type="file" id="ed-import" accept=".json,application/json" multiple hidden></label>
      ${mine.length ? '<button class="ghost ed-btn-sm" id="ed-export-all">Export all</button>' : ''}</div>
    ${mine.length ? `<div class="ed-list">${mine.map(c => `<div class="ed-item ${st.editing === c.id ? 'on' : ''}" data-edit="${esc(c.id)}">
        ${cardHtml(getDef(c.id), { size: 'xs' })}<div><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}</div></div>
        <button class="ghost ed-x" data-del="${esc(c.id)}" title="Delete">✕</button></div>`).join('')}</div>`
      : '<p class="muted">Saved cards show up here. They are stored in this browser and can be used in your decks right away.</p>'}`;
}

function drawPreview(app) {
  const box = app.querySelector('#ed-preview');
  if (!box) return;
  let def;
  try { def = normalize(buildDef(st)); } catch { return; }
  box.innerHTML = cardHtml(def, { size: 'lg', classes: st.image ? 'ed-pannable' : '' });
  const auto = app.querySelector('.ed-autotext');
  if (auto) auto.textContent = def.text || '—';
}

function draw(app) {
  const y = app.querySelector('.ed-form')?.scrollTop || 0;
  app.querySelector('.ed-form').innerHTML = formHtml();
  app.querySelector('.ed-side').innerHTML = listHtml();
  app.querySelector('.ed-form').scrollTop = y;
  drawPreview(app);
  saveDraft();
}

async function setImageFromFile(app, file) {
  if (!file || !file.type.startsWith('image/')) return flash(app, 'That is not an image file.', true);
  const { src, iw, ih } = await fileToDataUrl(file);
  Object.assign(st, { image: src, iw, ih, zoom: 1, cx: 50, cy: 50 });
  draw(app);
}

async function ensureImageSize() {
  if (st.image && (!st.iw || !st.ih)) {
    try { const im = await loadImage(st.image); st.iw = im.naturalWidth; st.ih = im.naturalHeight; } catch { st.image = null; }
  }
  if (st.cropFromDef && st.iw) { zoomFromCrop(st, st.cropFromDef); delete st.cropFromDef; }
}

async function importFiles(app, files) {
  let n = 0, last = null;
  for (const f of files) {
    let j;
    try { j = JSON.parse(await f.text()); } catch { flash(app, `${f.name}: not a JSON file.`, true); continue; }
    try {
      if (j.format === 'rajongoi-cards') {
        for (const c of j.cards || []) { await saveCustomCard(c); n++; last = c; }
      } else if (j.card && j.format === 'rajongoi-card') {
        await saveCustomCard(j.card); n++; last = j.card;
      } else {
        // riftcardmaker export: open it in the editor so abilities can be added before saving
        st = await stateFromRiftcardmaker(j);
        const id = cardId(st);
        if (hasDef(id)) { // re-export of a card already in the game: keep its game logic
          const old = getDef(id);
          st.editing = id;
          if (!st.effects.length) st.effects = (old.effects || []).filter(e => e.do !== 'shieldify').map(e => ({ ...e }));
          st.keywords = [...new Set([...st.keywords, ...(old.keywords || []).filter(k => k !== 'Shieldify')])];
          if (old.type === 'signature') { st.type = 'signature'; st.sigType = old.sigType || 'spell'; st.legend = old.legend || ''; }
          if (old.activateCost) st.activateCost = old.activateCost;
          if (old.uses) st.uses = old.uses;
        }
        draw(app);
        flash(app, `Loaded “${st.name}” from riftcardmaker — add abilities if needed, then Save.`);
        continue;
      }
    } catch (e) { flash(app, `${f.name}: ${e.message}`, true); }
  }
  if (n) {
    if (last) { st = stateFromDef(getDef(last.id)); await ensureImageSize(); }
    draw(app);
    flash(app, `Imported ${n} card${n > 1 ? 's' : ''}.`);
  }
}

export async function renderEditor(app, arg) {
  if (arg && hasDef(arg)) st = stateFromDef(getDef(arg));
  else if (!st) st = loadDraft() || blankState();
  await ensureImageSize();
  app.innerHTML = `<div class="page editor-page">
    <div class="row"><h2 style="margin:0">Card Editor</h2><span class="spacer"></span>
      <span class="muted">Riftcardmaker JSON files can be imported too (My cards → Import).</span></div>
    <div class="ed-layout">
      <div class="ed-form"></div>
      <div class="ed-preview-col"><div id="ed-preview" class="ed-preview"></div>
        <p class="muted ed-prev-hint">Live preview — exactly as the card looks in the game.</p></div>
      <aside class="ed-side"></aside>
    </div></div>`;
  draw(app);

  const form = app.querySelector('.ed-form');
  const set = (k, v) => {
    if (k === 'type' && v === 'token') st.set = 'TKN';
    if (k === 'type' && st.type === 'token' && v !== 'token') st.set = 'OGN';
    if (k === 'set' || (k === 'type' && v === 'token')) st.number = st.editing ? st.number : nextNumber(k === 'set' ? v : 'TKN');
    st[k] = v;
  };
  const structural = new Set(['type', 'sigType', 'autoText', 'set']);
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.k) {
      const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? 0 : +t.value) : t.value;
      set(t.dataset.k, v);
      if (structural.has(t.dataset.k) || t.dataset.k === 'shieldify' || t.dataset.k === 'number' || t.dataset.k === 'name' || t.dataset.k === 'subname') {
        // update dependent bits (card id, warnings) without losing focus on text inputs
        if (t.tagName === 'SELECT' || t.type === 'checkbox') return draw(app);
        const idEl = app.querySelector('.ed-id code'); if (idEl) idEl.textContent = buildDef(st).id;
      }
      drawPreview(app); saveDraft();
    } else if (t.dataset.e != null) {
      const e = st.effects[+t.dataset.e];
      const k = t.dataset.ek;
      e[k] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value;
      if (k === 'do') { // sensible defaults for the new action
        const p = ACTIONS[e.do].p;
        for (const x of ['target', 'amount', 'maxPower', 'duration', 'keyword', 'who', 'tokenId']) if (!p.includes(x)) delete e[x];
        if (p.includes('target') && !e.target) e.target = e.do === 'buff' || e.do === 'untap' ? 'friendlyUnit' : 'enemyUnit';
        if (p.includes('amount') && e.amount == null) e.amount = 1;
        if (p.includes('keyword') && !e.keyword) e.keyword = 'Haste';
        if (p.includes('tokenId') && !e.tokenId) e.tokenId = allCards().find(c => c.type === 'token')?.id;
        if (p.includes('duration') && !e.duration) e.duration = 'turn';
      }
      if (t.tagName === 'SELECT') return draw(app);
      const row = t.closest('.ed-eff')?.querySelector('.ed-eff-text');
      if (row) { try { row.innerHTML = markup(describeEffect(e, buildDef(st))); } catch { /* ignore */ } }
      drawPreview(app); saveDraft();
    } else if (t.id === 'ed-zoom') {
      st.zoom = +t.value; drawPreview(app); saveDraft();
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.id === 'ed-file') return setImageFromFile(app, e.target.files[0]);
    if (e.target.id === 'ed-ins-kw' && e.target.value) {
      const k = e.target.value;
      insertText(app, `{${k}#${KEYWORDS[k].hex.replace('#', '')}}`);
      e.target.value = '';
    }
  });
  form.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.color) {
      const c = b.dataset.color;
      st.colors = st.colors.includes(c) ? st.colors.filter(x => x !== c) : [...st.colors, c].slice(-2);
      return draw(app);
    }
    if (b.dataset.kw) { const k = b.dataset.kw; st.keywords = st.keywords.includes(k) ? st.keywords.filter(x => x !== k) : [...st.keywords, k]; return draw(app); }
    if (b.dataset.delEff != null) { st.effects.splice(+b.dataset.delEff, 1); return draw(app); }
    if (b.dataset.ins) return insertText(app, b.dataset.ins);
    switch (b.id) {
      case 'ed-add-eff': st.effects.push({ on: st.type === 'gear' ? 'activate' : 'play', do: 'draw', amount: 1 }); return draw(app);
      case 'ed-center': Object.assign(st, { zoom: 1, cx: 50, cy: 50 }); return draw(app);
      case 'ed-noimg': st.image = null; st.iw = st.ih = 0; return draw(app);
      case 'ed-edit-text': st.text = normalize(buildDef(st)).text; st.autoText = false; return draw(app);
      case 'ed-new': st = blankState(); return draw(app);
      case 'ed-export': { const d = buildDef(st); return download(`${d.id}.rajongoi-card.json`, bundle([d])); }
      case 'ed-save': return save(app);
      case 'ed-add-deck': {
        const id = buildDef(st).id, decks = customDecks(), d = decks.find(x => x.id === app.querySelector('#ed-deck').value);
        if (!d) return;
        if (d.cards[id]) return flash(app, `Already in “${d.name}”.`);
        d.cards[id] = 1; saveCustomDecks(decks);
        const L = hasDef(d.legend) ? getDef(d.legend) : null;
        const off = L && getDef(id).colors.some(c => !L.colors.includes(c));
        return flash(app, `Added to “${d.name}”.${off ? ' ⚠ Its color is outside that Legend’s colors, so the deck is not legal with it.' : ''}`, off);
      }
    }
  });
  // drag & drop a picture (or JSON files) anywhere on the page
  const page = app.querySelector('.editor-page');
  page.addEventListener('dragover', (e) => { e.preventDefault(); app.querySelector('#ed-drop')?.classList.add('over'); });
  page.addEventListener('dragleave', () => app.querySelector('#ed-drop')?.classList.remove('over'));
  page.addEventListener('drop', (e) => {
    e.preventDefault(); app.querySelector('#ed-drop')?.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])];
    const img = files.find(f => f.type.startsWith('image/'));
    const json = files.filter(f => /json/.test(f.type) || f.name.endsWith('.json'));
    if (img) setImageFromFile(app, img);
    if (json.length) importFiles(app, json);
  });

  // side list: edit / delete / import / export all
  const side = app.querySelector('.ed-side');
  side.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      if (!confirm(`Delete “${getDef(id).name}” from this browser?`)) return;
      await deleteCustomCard(id);
      if (st.editing === id) st.editing = null;
      return draw(app);
    }
    const it = e.target.closest('[data-edit]');
    if (it) { st = stateFromDef(getDef(it.dataset.edit)); await ensureImageSize(); return draw(app); }
    if (e.target.id === 'ed-export-all') download(`rajongoi-cards-${new Date().toISOString().slice(0, 10)}.json`, bundle(customCards()));
  });
  side.addEventListener('change', (e) => { if (e.target.id === 'ed-import') importFiles(app, [...e.target.files]); });

  // pan / zoom the artwork directly on the preview
  const prev = app.querySelector('#ed-preview');
  let drag = null;
  prev.addEventListener('pointerdown', (e) => {
    if (!st.image) return;
    const card = prev.querySelector('.card');
    drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy, w: card.offsetWidth, h: card.offsetHeight };
    prev.setPointerCapture(e.pointerId); prev.classList.add('dragging');
  });
  prev.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const c = cropOf(st);
    st.cx = drag.cx - (e.clientX - drag.x) / drag.w * c.width;
    st.cy = drag.cy - (e.clientY - drag.y) / drag.h * c.height;
    const img = prev.querySelector('.card-img');
    if (img) Object.assign(img.style, imgStyle(cropOf(st)));
  });
  const end = () => { if (drag) { drag = null; prev.classList.remove('dragging'); saveDraft(); } };
  prev.addEventListener('pointerup', end); prev.addEventListener('pointercancel', end);
  prev.addEventListener('wheel', (e) => {
    if (!st.image) return;
    e.preventDefault();
    st.zoom = Math.min(4, Math.max(0.4, st.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    const z = app.querySelector('#ed-zoom'); if (z) z.value = st.zoom;
    const img = prev.querySelector('.card-img');
    if (img) Object.assign(img.style, imgStyle(cropOf(st)));
    saveDraft();
  }, { passive: false });
}

function insertText(app, s) {
  const ta = app.querySelector('textarea[data-k=text]');
  if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd;
  ta.value = ta.value.slice(0, a) + s + ta.value.slice(b);
  ta.focus(); ta.selectionStart = ta.selectionEnd = a + s.length;
  st.text = ta.value; drawPreview(app); saveDraft();
}

async function save(app) {
  const def = buildDef(st);
  if (!st.name.trim()) return flash(app, 'Give the card a name first.', true);
  if (!st.colors.length && st.type !== 'token') return flash(app, 'Pick at least one color.', true);
  if (st.type === 'legend' && st.colors.length !== 2) return flash(app, 'A Legend needs exactly 2 colors.', true);
  if (st.type === 'signature' && !st.legend) return flash(app, 'Choose which Legend this Signature belongs to.', true);
  if (hasDef(def.id) && !isCustomCard(def.id) && st.editing !== def.id
      && !confirm(`${def.id} is already “${getDef(def.id).name}”. Replace it in this browser?`)) return;
  // renamed/renumbered: drop the old saved copy
  if (st.editing && st.editing !== def.id && isCustomCard(st.editing)) await deleteCustomCard(st.editing);
  def.updatedAt = Date.now();
  try {
    await saveCustomCard(def);
  } catch (e) {
    return flash(app, `Could not save (${e.message || 'storage full?'}).`, true);
  }
  st.editing = def.id;
  draw(app);
  flash(app, `Saved ${def.id}. It is now in the Collection and the deck builder.`);
}
