import { allCards, getDef, hasDef, kindOf, rarityOf, championMatchesLegend, signatureMatchesLegend } from '../engine/cards.js';
import { COLORS, TYPE_INFO, GUIDE, RULES } from '../engine/rules.js';
import { validateDeck } from '../engine/deck.js';
import { cardHtml, cardDetailsHtml, esc } from './card.js';
import { allDecks, customDecks, saveCustomDecks, findDeck, deckName } from '../data.js';

const SET_NAMES = { OGN: 'OGN 2026-01', DND: 'DND — DLC', BAS: 'Fillers', TKN: 'Tokens', RUN: 'Runes' };
const TYPE_ORDER = ['legend', 'champion', 'unit', 'spell', 'gear', 'signature', 'token', 'rune'];
const sortCards = (a, b) => a.set.localeCompare(b.set) || String(a.number).localeCompare(String(b.number));

// ------------------------------------------------------------ card modal --
export function showCardModal(def) {
  const m = document.createElement('div');
  m.className = 'modal';
  const kws = (def.keywords || []).join(', ') || '—';
  m.innerHTML = `<div class="modal-box"><div class="modal-card">
    ${cardHtml(def, { size: 'lg' })}
    <dl class="info">
      <dd>${cardDetailsHtml(def)}</dd>
      <dt>Type</dt><dd>${esc(TYPE_INFO[def.type]?.label || def.type)}${def.sigType ? ' (' + def.sigType + ')' : ''}</dd>
      <dt>Colors</dt><dd>${def.colors.join(' / ') || 'Neutral'}</dd>
      <dt>Cost / Might / Recycle</dt><dd>${def.cost} / ${kindOf(def) === 'unit' ? def.power : '—'} / ${def.recycle || 0}${def.provisional ? ` <span class="muted">(provisional: ${def.provisional.join(', ')})</span>` : ''}</dd>
      ${def.owners?.length ? `<dt>Deck of</dt><dd>${esc(def.owners.join(' / '))}</dd>` : ''}
      ${def.purpose ? `<dt>Purpose</dt><dd>${esc(def.purpose)}</dd>` : ''}
      <dt>Status</dt><dd>${def.image ? 'Finished (with artwork)' : def.filler ? 'Filler card (completes short decks)' : def.placeholder ? 'Placeholder' : def.wip ? 'Work in progress (FLAG)' : 'Designed'}${def.provisionalEffect ? ' · provisional effect' : ''}</dd>
      <dt>Keywords</dt><dd>${esc(kws)}</dd>
      <dt>Card id</dt><dd><code>${esc(def.id)}</code></dd>
      <dt>Game logic</dt><dd><code style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(def.effects || []))}</code></dd>
      <dd style="margin-top:14px"><button class="close">Close</button> <a class="btn ghost" href="#/editor/${encodeURIComponent(def.id)}">✎ Edit in Card Editor</a></dd>
    </dl></div></div>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.close')) m.remove(); });
  document.body.appendChild(m);
}

// ------------------------------------------------------------ collection --
const filt = { types: new Set(), colors: new Set(), owner: '', status: '', q: '', sort: 'auto' };

// ---- sorting
const COLOR_ORDER = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'];
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];
const DECK_TYPE_ORDER = { legend: 0, champion: 1, signature: 2 };
const byNumber = (a, b) => sortCards(a, b);
const colorKey = (c) => (c.colors.length ? COLOR_ORDER.indexOf(c.colors[0]) * 10 + (c.colors[1] ? 1 + COLOR_ORDER.indexOf(c.colors[1]) : 0) : 99);
const SORTS = {
  number: { label: 'Card number', fn: byNumber },
  mana: { label: 'Mana', fn: (a, b) => (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
  color: { label: 'Color', fn: (a, b) => colorKey(a) - colorKey(b) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
  rarity: { label: 'Rarity', fn: (a, b) => RARITY_ORDER.indexOf(rarityOf(b)) - RARITY_ORDER.indexOf(rarityOf(a)) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
  // a deck reads best as Legend, Champions, Signatures, then everything by mana
  deck: { label: 'Deck order', fn: (a, b) => (DECK_TYPE_ORDER[a.type] ?? 3) - (DECK_TYPE_ORDER[b.type] ?? 3) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
};

export function renderCollection(app, set) {
  const cards = allCards();
  const ORDER = ['OGN', 'DND', 'TKN', 'RUN', 'BAS'];
  const rank = (x) => (ORDER.indexOf(x) + 1 || 50);
  const sets = [...new Set(cards.map(c => c.set))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (!sets.includes(set)) set = sets[0];
  const inSet = cards.filter(c => c.set === set).sort(sortCards);
  const types = TYPE_ORDER.filter(t => inSet.some(c => c.type === t));
  const owners = [...new Set(inSet.flatMap(c => c.owners || []))].sort((a, b) => a.localeCompare(b));
  if (filt.owner && !owners.includes(filt.owner)) filt.owner = '';
  const status = (c) => (c.image ? 'art' : c.wip || c.placeholder ? 'wip' : 'designed');

  const draw = () => {
    const sortKey = filt.sort === 'auto' ? (filt.owner ? 'deck' : 'number') : filt.sort;
    const shown = inSet.filter(c =>
      (!filt.types.size || filt.types.has(c.type)) &&
      (!filt.colors.size || c.colors.some(x => filt.colors.has(x))) &&
      (!filt.owner || (c.owners || []).includes(filt.owner)) &&
      (!filt.status || status(c) === filt.status) &&
      (!filt.q || (c.name + ' ' + c.text).toLowerCase().includes(filt.q.toLowerCase())))
      .sort(SORTS[sortKey].fn);
    const nArt = inSet.filter(c => status(c) === 'art').length;
    const nWip = inSet.filter(c => status(c) === 'wip').length;
    app.innerHTML = `<div class="page">
      <div class="tabs">${sets.map(s => `<button class="${s === set ? 'active' : ''}" data-set="${s}">${esc(SET_NAMES[s] || s)} <span class="muted">(${cards.filter(c => c.set === s).length})</span></button>`).join('')}</div>
      <div class="filters">
        ${types.map(t => `<span class="chip ${filt.types.has(t) ? 'on' : ''}" data-type="${t}"><span class="dot" style="background:${TYPE_INFO[t]?.hex || '#777'}"></span>${TYPE_INFO[t]?.label || 'Token'}</span>`).join('')}
        <span style="width:10px"></span>
        ${Object.entries(COLORS).map(([k, v]) => `<span class="chip ${filt.colors.has(k) ? 'on' : ''}" data-color="${k}"><span class="dot" style="background:${v.hex}"></span>${k}</span>`).join('')}
        ${owners.length ? `<select id="owner"><option value="">Every deck</option>${owners.map(o => `<option ${o === filt.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
        <select id="status"><option value="">Any status</option>
          <option value="art" ${filt.status === 'art' ? 'selected' : ''}>With artwork</option>
          <option value="designed" ${filt.status === 'designed' ? 'selected' : ''}>Designed (FLAG off)</option>
          <option value="wip" ${filt.status === 'wip' ? 'selected' : ''}>Work in progress</option></select>
        <label class="sortby">Sort <select id="sort">
          <option value="auto" ${filt.sort === 'auto' ? 'selected' : ''}>Auto (${filt.owner ? 'deck order' : 'card number'})</option>
          ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${filt.sort === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <input type="search" placeholder="Search…" value="${esc(filt.q)}" id="q">
        <span class="muted">${shown.length} shown · ${nArt} with art · ${nWip} WIP</span>
      </div>
      <div class="grid">${shown.map(c => cardHtml(c, { size: 'md' })).join('') || '<p class="muted">No cards match.</p>'}</div>
    </div>`;
    app.querySelectorAll('[data-set]').forEach(b => b.onclick = () => (location.hash = '#/collection/' + b.dataset.set));
    app.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { toggle(filt.types, b.dataset.type); draw(); });
    app.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { toggle(filt.colors, b.dataset.color); draw(); });
    if (app.querySelector('#owner')) app.querySelector('#owner').onchange = (e) => { filt.owner = e.target.value; draw(); };
    app.querySelector('#status').onchange = (e) => { filt.status = e.target.value; draw(); };
    app.querySelector('#sort').onchange = (e) => { filt.sort = e.target.value; draw(); };
    const q = app.querySelector('#q');
    q.oninput = () => { filt.q = q.value; draw(); const nq = app.querySelector('#q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); };
    app.querySelectorAll('.grid .card').forEach(el => el.onclick = () => showCardModal(getDef(el.dataset.cid)));
  };
  draw();
}
const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

// ----------------------------------------------------------------- decks --
export function renderDecks(app, arg) {
  if (arg && findDeck(arg)) return renderDeckView(app, findDeck(arg));
  const decks = allDecks();
  const tile = (d) => {
    const v = validateDeck(d);
    const legend = hasDef(d.legend) ? getDef(d.legend) : null;
    return `<div class="deck-tile clickable" data-view="${esc(d.id)}" title="Show the cards in this deck">
      ${legend ? cardHtml(legend, { size: 'xs' }) : ''}
      <div style="flex:1;min-width:0">
        <h3>${esc(deckName(d))}</h3>
        <div class="meta">${legend ? esc(legend.colors.join(' / ')) : 'No legend'} · ${v.stats.total} cards · avg ${v.stats.avgCost.toFixed(1)}</div>
        <div class="meta">${d.comingSoon ? '<span class="soon-tag">COMING SOON</span> ' : ''}${d.premade ? 'Premade' : 'Custom'} · ${v.errors.length ? `<span class="msg err">${v.errors.length} problem(s)</span>` : '<span class="msg ok">Legal</span>'}</div>
        <div class="row" style="margin-top:8px">
          ${d.comingSoon ? '' : d.premade ? `<button data-copy="${d.id}">Copy &amp; edit</button>` : `<button data-edit="${d.id}">Edit</button><button class="danger" data-del="${d.id}">Delete</button>`}
          <button class="ghost" data-export="${d.id}" title="Copy deck JSON">Export</button>
        </div>
      </div></div>`;
  };
  app.innerHTML = `<div class="page">
    <div class="row" style="margin-bottom:14px"><h2 style="margin:0">Decks</h2><span class="spacer"></span>
      <button class="ghost" id="imp">Import JSON</button><button class="primary" id="new">New deck</button></div>
    <p class="muted" style="margin-top:0">${RULES.DECK_SIZE} cards, 1 copy each, ${RULES.MIN_CHAMPIONS}-${RULES.MAX_CHAMPIONS} Champions (one sharing the Legend's name), max ${RULES.MAX_SIGNATURES} Signatures, ${RULES.RUNE_DECK_SIZE}-rune Mana Deck. The Legend isn't counted.</p>
    <div class="decks">${decks.map(tile).join('')}</div></div>`;
  app.querySelector('#new').onclick = () => (location.hash = '#/deck/new');
  app.querySelectorAll('[data-view]').forEach(t => t.onclick = (e) => {
    if (e.target.closest('button')) return; // the tile's own buttons keep working
    location.hash = '#/decks/' + encodeURIComponent(t.dataset.view);
  });
  app.querySelector('#imp').onclick = () => {
    const txt = prompt('Paste deck JSON:');
    if (!txt) return;
    try {
      const d = JSON.parse(txt);
      d.id = 'custom-' + Date.now(); d.premade = false;
      saveCustomDecks([...customDecks(), d]);
      renderDecks(app);
    } catch (e) { alert('Invalid JSON: ' + e.message); }
  };
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => (location.hash = '#/deck/' + b.dataset.edit));
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => (location.hash = '#/deck/copy:' + b.dataset.copy));
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!confirm('Delete this deck?')) return;
    saveCustomDecks(customDecks().filter(d => d.id !== b.dataset.del));
    renderDecks(app);
  });
  app.querySelectorAll('[data-export]').forEach(b => b.onclick = async () => {
    const d = findDeck(b.dataset.export);
    const json = JSON.stringify({ ...d, premade: undefined }, null, 2);
    try { await navigator.clipboard.writeText(json); b.textContent = 'Copied!'; } catch { prompt('Deck JSON:', json); }
  });
}

// ------------------------------------------------------------- deck view --
const RARITY_GROUPS = [['epic', 'Epic'], ['rare', 'Rare'], ['uncommon', 'Uncommon'], ['common', 'Common']];

/** One deck: its cards by rarity on the left, the hovered card in the middle, what it does on the right. */
function renderDeckView(app, d) {
  const v = validateDeck(d);
  const legend = hasDef(d.legend) ? getDef(d.legend) : null;
  const ids = Object.keys(d.cards || {}).filter(hasDef);
  const defs = ids.map(getDef);
  const row = (c, extra = '') => `<li class="dv-row r-${rarityOf(c)}" data-cid="${esc(c.id)}" tabindex="0">
      <span class="dv-cost">${c.type === 'legend' ? '♛' : c.cost}</span>
      <span class="dv-dot" style="background:${(c.colors || []).map(x => COLORS[x]?.hex).filter(Boolean).length > 1
        ? `linear-gradient(90deg, ${COLORS[c.colors[0]].hex} 50%, ${COLORS[c.colors[1]].hex} 50%)` : COLORS[c.colors?.[0]]?.hex || '#777'}"></span>
      <span class="dv-name">${esc(c.name)}</span>
      <span class="dv-type">${esc(TYPE_INFO[c.type]?.label || c.type)}${extra}</span></li>`;
  const slotTag = (c) => (c.id === d.champion ? ' · start' : c.id === d.signature ? ' · start' : '');
  const groups = RARITY_GROUPS.map(([r, label]) => [label, defs.filter(c => rarityOf(c) === r)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))]).filter(([, l]) => l.length);
  const first = legend || defs[0];
  app.innerHTML = `<div class="page deck-view">
    <div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#/decks">← Decks</a>
      <h2 style="margin:0 0 0 6px">${esc(deckName(d))}</h2><span class="spacer"></span>
      <span class="muted">${legend ? esc(legend.colors.join(' / ')) + ' · ' : ''}${v.stats.total} cards · avg ${v.stats.avgCost.toFixed(1)}${d.comingSoon ? ' · <span class="soon-tag">COMING SOON</span>' : ''}</span>
      ${d.comingSoon ? '' : d.premade ? `<a class="btn" href="#/deck/copy:${esc(d.id)}">Copy &amp; edit</a>` : `<a class="btn" href="#/deck/${esc(d.id)}">Edit</a>`}</div>
    <div class="dv-layout">
      <div class="dv-list">
        ${legend ? `<h4>Legend</h4><ul>${row(legend)}</ul>` : ''}
        ${groups.map(([label, list]) => `<h4>${label} <span class="muted">${list.length}</span></h4><ul>${list.map(c => row(c, slotTag(c))).join('')}</ul>`).join('')}
        ${d.runes ? `<h4>Mana Deck</h4><div class="dv-runes">${Object.entries(d.runes).map(([c, n]) => `<span><i style="background:${COLORS[c]?.hex}"></i>${n} ${esc(c)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="dv-card" id="dv-card"></div>
      <div class="dv-info" id="dv-info"></div>
    </div></div>`;
  const show = (id) => {
    if (!hasDef(id)) return;
    const c = getDef(id);
    app.querySelector('#dv-card').innerHTML = cardHtml(c, { size: 'lg' });
    app.querySelector('#dv-info').innerHTML = `<h4>What it does</h4>${cardDetailsHtml(c)}
      ${c.id === d.champion ? '<p class="muted">Starts in the Champion Slot.</p>' : c.id === d.signature ? '<p class="muted">Starts in the Signature Slot.</p>' : ''}`;
    app.querySelectorAll('.dv-row').forEach(r => r.classList.toggle('on', r.dataset.cid === id));
  };
  app.querySelectorAll('.dv-row').forEach(r => {
    r.onmouseenter = () => show(r.dataset.cid);
    r.onfocus = () => show(r.dataset.cid);
    r.onclick = () => show(r.dataset.cid); // touch screens
  });
  if (first) show(first.id);
}

// --------------------------------------------------------------- builder --
export function renderBuilder(app, arg) {
  let draft;
  if (arg === 'new') draft = { id: 'custom-' + Date.now(), name: 'New deck', legend: null, champion: null, signature: null, cards: {}, runes: {} };
  else if (arg.startsWith('copy:')) {
    const src = findDeck(arg.slice(5));
    draft = structuredClone(src); draft.id = 'custom-' + Date.now(); draft.name = deckName(src) + ' (copy)'; draft.premade = false;
  } else draft = structuredClone(findDeck(arg) || {});
  if (!draft.cards) { location.hash = '#/decks'; return; }

  const legends = allCards().filter(c => c.type === 'legend').sort(sortCards);
  const bf = { set: 'ALL', type: 'ALL', q: '' };

  const pool = () => {
    if (!draft.legend) return [];
    const L = getDef(draft.legend);
    return allCards().filter(c => {
      if (c.type === 'legend' || c.type === 'token' || c.type === 'rune') return false;
      if (c.type === 'signature' && !signatureMatchesLegend(c, L)) return false;
      return c.colors.every(x => L.colors.includes(x));
    }).sort((a, b) => a.cost - b.cost || sortCards(a, b));
  };

  const setLegend = (id) => {
    draft.legend = id || null;
    if (!id) return;
    const L = getDef(id);
    // drop now-illegal cards, default rune split
    const ok = new Set(pool().map(c => c.id));
    for (const k of Object.keys(draft.cards)) if (!ok.has(k)) delete draft.cards[k];
    const half = RULES.RUNE_DECK_SIZE / 2;
    draft.runes = L.colors.length > 1 ? { [L.colors[0]]: half, [L.colors[1]]: RULES.RUNE_DECK_SIZE - half } : { [L.colors[0]]: RULES.RUNE_DECK_SIZE };
    fixSlots();
  };

  const fixSlots = () => {
    const L = draft.legend ? getDef(draft.legend) : null;
    const ids = Object.keys(draft.cards);
    const champs = ids.map(getDef).filter(d => d.type === 'champion' && championMatchesLegend(d, L));
    if (!ids.includes(draft.champion) || !champs.some(c => c.id === draft.champion)) draft.champion = champs[0]?.id || null;
    const sigs = ids.map(getDef).filter(d => d.type === 'signature');
    if (!ids.includes(draft.signature)) draft.signature = sigs[0]?.id || null;
  };

  const draw = () => {
    const L = draft.legend ? getDef(draft.legend) : null;
    const v = validateDeck(draft);
    const st = v.stats;
    const shown = pool().filter(c =>
      (bf.set === 'ALL' || c.set === bf.set) && (bf.type === 'ALL' || c.type === bf.type) &&
      (!bf.q || (c.name + ' ' + c.text).toLowerCase().includes(bf.q.toLowerCase())));
    const inDeck = Object.keys(draft.cards).map(getDef).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.cost - b.cost);
    const groups = TYPE_ORDER.map(t => [t, inDeck.filter(d => d.type === t)]).filter(([, l]) => l.length);
    const champs = inDeck.filter(d => d.type === 'champion' && championMatchesLegend(d, L));
    const sigs = inDeck.filter(d => d.type === 'signature');
    const maxBar = Math.max(4, ...Object.values(st.curve), ...Object.values(GUIDE.curve));
    const sets = [...new Set(pool().map(c => c.set))].sort();
    const runeA = L?.colors[0], runeB = L?.colors[1];

    app.innerHTML = `<div class="page"><div class="builder">
      <div>
        <div class="row" style="margin-bottom:10px"><button class="ghost" id="back">← Decks</button><h2 style="margin:0">Deck builder</h2></div>
        ${!L ? '<p class="muted">Pick a Legend on the right to see the cards you can use.</p>' : `
        <div class="filters">
          ${['ALL', ...sets].map(s => `<span class="chip ${bf.set === s ? 'on' : ''}" data-bset="${s}">${s === 'ALL' ? 'All sets' : s}</span>`).join('')}
          <span style="width:8px"></span>
          ${['ALL', 'champion', 'unit', 'spell', 'gear', 'signature'].map(t => `<span class="chip ${bf.type === t ? 'on' : ''}" data-btype="${t}">${t === 'ALL' ? 'All types' : TYPE_INFO[t].label}</span>`).join('')}
          <input type="search" id="bq" placeholder="Search…" value="${esc(bf.q)}">
        </div>
        <p class="muted" style="margin-top:0">Click a card to add or remove it (singleton).</p>
        <div class="grid">${shown.map(c => cardHtml(c, { size: 'md', classes: draft.cards[c.id] ? 'in-deck' : '' })).join('')}</div>`}
      </div>
      <aside class="side">
        <div class="field"><label>Deck name</label><input type="text" id="dname" value="${esc(draft.name)}"></div>
        <div class="field"><label>Legend</label><select id="legend"><option value="">— choose —</option>
          ${legends.map(l => `<option value="${l.id}" ${l.id === draft.legend ? 'selected' : ''}>${esc(l.name)} (${l.colors.join('/')})</option>`).join('')}</select></div>
        ${L ? `
        <div class="field"><label>Champion Slot (starts on the table)</label><select id="champ">
          ${champs.length ? champs.map(c => `<option value="${c.id}" ${c.id === draft.champion ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">add a matching Champion</option>'}</select></div>
        <div class="field"><label>Signature Slot (starts on the table)</label><select id="sig">
          ${sigs.length ? sigs.map(c => `<option value="${c.id}" ${c.id === draft.signature ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">none</option>'}</select></div>
        <div class="field"><label>Mana Deck: ${runeB ? `${runeA} ${draft.runes[runeA] || 0} · ${runeB} ${draft.runes[runeB] || 0}` : `${runeA} ${RULES.RUNE_DECK_SIZE}`}</label>
          ${runeB ? `<input type="range" id="runes" min="0" max="${RULES.RUNE_DECK_SIZE}" value="${draft.runes[runeA] || 0}" style="width:100%">` : ''}</div>
        <div class="row"><b>${st.total}/${RULES.DECK_SIZE}</b><span class="muted">U ${st.units} · C ${st.champions} · S ${st.spells} · G ${st.gears} · Sig ${st.signatures} · avg ${st.avgCost.toFixed(1)}</span></div>
        <div class="curve">${Array.from({ length: 10 }, (_, i) => i + 1).map(c => `<div class="bar" title="cost ${c}: ${st.curve[c] || 0} (guide ${GUIDE.curve[c] || 0})">
          <div class="fill" style="height:${((st.curve[c] || 0) / maxBar) * 100}%"></div>
          <div class="target" style="bottom:${((GUIDE.curve[c] || 0) / maxBar) * 100}%"></div></div>`).join('')}</div>
        <div class="curve-labels">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}${i === 9 ? '+' : ''}</span>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:2px 0 8px">Bars = your curve, dashed = Assembly Guide.</p>
        ${v.errors.map(e => `<div class="msg err">✗ ${esc(e)}</div>`).join('')}
        ${v.warnings.map(e => `<div class="msg warn">! ${esc(e)}</div>`).join('')}
        ${!v.errors.length ? '<div class="msg ok">✓ Deck is legal</div>' : ''}
        <ul class="decklist">${groups.map(([t, l]) => `<li class="grp">${TYPE_INFO[t]?.label || t} (${l.length})</li>` +
          l.map(d => `<li data-rm="${d.id}" data-cid="${d.id}"><span class="c">${d.cost}</span>${esc(d.name)}</li>`).join('')).join('')}</ul>` : ''}
        <div class="row"><button class="primary" id="save">Save deck</button><button class="ghost" id="cancel">Cancel</button></div>
      </aside></div></div>`;

    const $ = (s) => app.querySelector(s);
    $('#back').onclick = $('#cancel').onclick = () => (location.hash = '#/decks');
    $('#dname').oninput = (e) => (draft.name = e.target.value);
    $('#legend').onchange = (e) => { setLegend(e.target.value); draw(); };
    if (L) {
      $('#champ').onchange = (e) => { draft.champion = e.target.value; draw(); };
      $('#sig').onchange = (e) => { draft.signature = e.target.value; draw(); };
      if ($('#runes')) $('#runes').oninput = (e) => { draft.runes = { [runeA]: +e.target.value, [runeB]: RULES.RUNE_DECK_SIZE - e.target.value }; draw(); };
      app.querySelectorAll('[data-bset]').forEach(b => b.onclick = () => { bf.set = b.dataset.bset; draw(); });
      app.querySelectorAll('[data-btype]').forEach(b => b.onclick = () => { bf.type = b.dataset.btype; draw(); });
      $('#bq').oninput = (e) => { bf.q = e.target.value; draw(); const n = $('#bq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
      app.querySelectorAll('.grid .card').forEach(el => {
        el.onclick = () => { const id = el.dataset.cid; draft.cards[id] ? delete draft.cards[id] : (draft.cards[id] = 1); fixSlots(); draw(); };
        el.oncontextmenu = (e) => { e.preventDefault(); showCardModal(getDef(el.dataset.cid)); };
      });
      app.querySelectorAll('[data-rm]').forEach(li => li.onclick = () => { delete draft.cards[li.dataset.rm]; fixSlots(); draw(); });
    }
    $('#save').onclick = () => {
      const list = customDecks().filter(d => d.id !== draft.id);
      saveCustomDecks([...list, { ...draft, premade: false }]);
      location.hash = '#/decks';
    };
  };
  draw();
}
