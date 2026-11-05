import { createGame, step, legalActions, whoActs, power, canAttackNow, findInst } from '../engine/game.js';
import { chooseAction } from '../engine/ai.js';
import { getDef, kindOf } from '../engine/cards.js';
import { COLORS, RULES } from '../engine/rules.js';
import { validateDeck } from '../engine/deck.js';
import { playableDecks, findDeck } from '../data.js';
import { cardHtml, cardBackHtml, esc } from './card.js';
import { showCardModal } from './collection.js';

const HUMAN = 0, AI = 1;
const AI_DELAY = 750;
let G = null; // { s, app, ui, timer, decks }

export function stopGame() {
  if (G?.timer) clearTimeout(G.timer);
  G = null;
}

// ================================================================= setup ==
const pick = { me: null, ai: 'random' };

export function renderSetup(app) {
  const decks = playableDecks();
  if (!decks.length) {
    app.innerHTML = `<div class="page"><h2>No legal decks</h2><p>Build one in <a href="#/decks">Decks</a>.</p></div>`;
    return;
  }
  if (!decks.some(d => d.id === pick.me)) pick.me = decks[0].id;
  const hour = new Date().getHours();
  const entry = (d, who) => {
    const L = getDef(d.legend);
    const v = validateDeck(d);
    return `<div class="deck-pick ${pick[who] === d.id ? 'on' : ''}" data-who="${who}" data-id="${d.id}">
      ${cardHtml(L, { size: 'xs' })}
      <div><b>${esc(d.name)}</b><div class="muted">${L.colors.join(' / ')} · avg cost ${v.stats.avgCost.toFixed(1)} · ${d.premade ? 'premade' : 'custom'}</div></div></div>`;
  };
  app.innerHTML = `<div class="page">
    <h2>Play against AI</h2>
    <div class="setup">
      <div class="col"><h3>Your deck</h3>${decks.map(d => entry(d, 'me')).join('')}</div>
      <div class="col"><h3>Opponent (AI) deck</h3>
        <div class="deck-pick ${pick.ai === 'random' ? 'on' : ''}" data-who="ai" data-id="random">
          ${cardBackHtml({ size: 'xs', classes: '' }).replace('size-xs', 'size-xs" style="--w:62px')}
          <div><b>Random deck</b><div class="muted">Surprise me</div></div></div>
        ${decks.map(d => entry(d, 'ai')).join('')}</div>
    </div>
    <div class="start-row">
      <button class="primary" id="start" style="font-size:22px;padding:12px 40px">Start</button>
      <span class="muted">Nostalgia Line is ${hour >= 16 && hour < 22 ? '<b style="color:var(--good)">active</b>' : 'inactive'} right now (16.00 – 22.00).</span>
    </div></div>`;
  app.querySelectorAll('.deck-pick').forEach(el => el.onclick = () => { pick[el.dataset.who] = el.dataset.id; renderSetup(app); });
  app.querySelector('#start').onclick = () => {
    const me = findDeck(pick.me);
    const ai = pick.ai === 'random' ? decks[Math.floor(Math.random() * decks.length)] : findDeck(pick.ai);
    startGame(app, me, ai);
  };
}

function startGame(app, me, ai) {
  stopGame();
  const s = createGame({ decks: [me, ai], names: ['Player', 'AI'], ai: [false, true], seed: Date.now() });
  G = { s, app, decks: [me, ai], timer: null, ui: { sel: null, mull: new Set() } };
  app.onclick = onClick;
  app.onmouseover = onHover;
  app.oncontextmenu = (e) => {
    const el = e.target.closest('[data-cid]');
    if (el && G) { e.preventDefault(); showCardModal(getDef(el.dataset.cid)); }
  };
  render();
}

// ================================================================ render ==
const PHASES = [['start', 'Start'], ['draw', 'Draw'], ['mana', 'Mana'], ['play', 'Play'], ['combat', 'Combat'], ['end', 'End']];

function render() {
  if (!G) return;
  const { s, app, ui } = G;
  const legal = whoActs(s) === HUMAN && s.winner == null ? legalActions(s, HUMAN) : [];
  const hl = highlights(s, legal, ui);
  const me = s.players[HUMAN], op = s.players[AI];
  const prev = app.querySelector('.log');
  const keepScroll = prev ? prev.scrollHeight - prev.scrollTop - prev.clientHeight < 30 : true;

  app.innerHTML = `<div class="game">
    <section class="table">
      <div class="hand-row opp">${op.hand.map(() => cardBackHtml({ size: 'sm' })).join('')}</div>
      ${playerRow(s, op, false, hl)}
      ${battleRow(s, op, hl)}
      ${midbar(s, legal, ui)}
      ${battleRow(s, me, hl)}
      ${playerRow(s, me, true, hl)}
      <div class="hand-row mine">${me.hand.map(c => unitCard(s, c, hl, { inHand: true })).join('') || '<span class="muted">Empty hand</span>'}</div>
    </section>
    <aside class="side-panel">
      <div class="preview" id="preview"><span class="muted" style="align-self:center">Hover a card to inspect it · right-click for details</span></div>
      <div class="log">${s.log.map(l => `<div class="${l.startsWith('—') ? 'turn' : ''}">${esc(l)}</div>`).join('')}</div>
    </aside>
  </div>
  ${triggerOverlay(s, legal, ui)}
  ${winnerOverlay(s)}`;

  const log = app.querySelector('.log');
  if (keepScroll) log.scrollTop = log.scrollHeight;
  scheduleAI();
}

function highlights(s, legal, ui) {
  const h = { playable: new Set(), attackers: new Set(), targets: new Set(), zoneTargets: new Set(), selected: ui.sel?.uid, mull: ui.mull };
  const pd = s.pending;
  if (ui.sel) {
    for (const a of ui.sel.options) {
      if (a.type === 'attack') {
        if (a.target.kind === 'unit') h.targets.add(a.target.uid);
        else h.zoneTargets.add(a.target.kind);
      } else if (a.target) h.targets.add(a.target);
    }
    return h;
  }
  if (pd?.kind === 'block') legal.filter(a => a.type === 'block').forEach(a => h.targets.add(a.uid));
  else if (pd?.kind === 'shieldify') legal.forEach(a => h.targets.add(a.uid));
  else if (pd?.kind !== 'mulligan') {
    for (const a of legal) {
      if (a.type === 'play' || a.type === 'activate') h.playable.add(a.uid);
      if (a.type === 'attack') h.attackers.add(a.uid);
    }
  }
  if (s.combat) { h.attacking = s.combat.attacker; h.defending = s.combat.target.uid; }
  return h;
}

function unitCard(s, inst, hl, opts = {}) {
  const d = getDef(inst.id);
  const onBoard = !opts.inHand && kindOf(d) === 'unit' && !opts.slot;
  const cls = [];
  if (hl.playable.has(inst.uid)) cls.push('playable');
  if (hl.attackers.has(inst.uid)) cls.push('can-attack');
  if (hl.targets.has(inst.uid)) cls.push('targetable');
  if (hl.selected === inst.uid) cls.push('selected');
  if (hl.mull?.has(inst.uid)) cls.push('mull-sel');
  if (hl.attacking === inst.uid || hl.defending === inst.uid) cls.push('attacking');
  const pw = onBoard ? power(s, inst) : undefined;
  const sick = onBoard && !canAttackNow(s, inst) && !inst.tapped && s.active === inst.owner ? '<div class="badge-sick">zZ</div>' : '';
  const uses = inst.uses != null && !opts.inHand ? `<div class="badge-sick" style="top:auto;bottom:30%">${inst.uses} left</div>` : '';
  return cardHtml(d, { size: 'sm', mini: true, uid: inst.uid, tapped: inst.tapped && !opts.inHand, power: pw, classes: cls.join(' '), badges: sick + uses });
}

function playerRow(s, p, mine, hl) {
  const zone = (label, inner, attrs = '', empty = '') => `<div class="zone ${!inner && empty ? 'empty-slot' : ''}" ${attrs} data-empty="${empty}"><span class="lbl">${label}</span>${inner}</div>`;
  const runes = p.mana.map(r => `<span class="rune ${r.tapped ? 'tapped' : ''}" style="background:${COLORS[r.color]?.hex}" title="${r.color}${r.tapped ? ' (tapped)' : ''}"></span>`).join('');
  const free = p.mana.filter(r => !r.tapped).length;
  const shieldsTarget = !mine && hl.zoneTargets.has('shield');
  const directTarget = !mine && hl.zoneTargets.has('player');
  const shields = p.shields.length
    ? `<div class="shields">${p.shields.map(() => cardBackHtml({ size: 'sm' })).join('')}</div><div class="stack-pile"><span class="count" style="position:static">${p.shields.length}</span></div>`
    : '<span class="muted" style="padding:0 8px">No shields!</span>';
  const gy = p.graveyard[p.graveyard.length - 1];
  return `<div class="zone-row">
    <div class="pinfo player-target zone-target ${s.active === p.idx ? 'active' : ''} ${directTarget ? 'targetable' : ''}" ${!mine ? 'data-zone="player"' : ''}>
      <span class="pname">${mine ? 'You' : 'AI'}${s.active === p.idx ? ' ◆' : ''}</span>
      <span class="muted">${esc(p.deckName)}</span>
      <span>Runes <b>${free}</b>/${p.mana.length} · Mana deck ${p.manaDeck.length}</span>
      <div class="runes">${runes}</div>
    </div>
    ${zone('Legend', unitCard(s, p.legend, hl, { slot: true }))}
    ${zone('Champion', p.championSlot ? unitCard(s, p.championSlot, hl, { slot: true, inHand: true }) : '', '', 'played')}
    ${zone('Signature', p.signatureSlot ? unitCard(s, p.signatureSlot, hl, { slot: true, inHand: true }) : '', '', 'played')}
    ${zone(`Gear ${p.gear.length}/${RULES.GEAR_SLOTS}`, p.gear.map(g => unitCard(s, g, hl, { slot: true })).join(''), '', 'empty')}
    ${zone('Shields', shields, `data-zone="${mine ? '' : 'shield'}"`, '').replace('class="zone', `class="zone zone-target ${shieldsTarget ? 'targetable' : ''}`)}
    ${zone('Deck', `<div class="stack-pile">${p.deck.length ? cardBackHtml({ size: 'sm' }) : ''}<span class="count">${p.deck.length}</span></div>`)}
    ${zone('Graveyard', `<div class="stack-pile" data-grave="${p.idx}" style="cursor:pointer">${gy ? cardHtml(getDef(gy.id), { size: 'sm', mini: true }) : `<div style="width:var(--cw)"></div>`}<span class="count">${p.graveyard.length}</span></div>`)}
  </div>`;
}

function battleRow(s, p, hl) {
  return `<div class="battle">${p.battle.map(u => unitCard(s, u, hl)).join('') || `<span class="empty">${p.idx === HUMAN ? 'Your' : "AI's"} Battle Zone</span>`}</div>`;
}

function midbar(s, legal, ui) {
  const pd = s.pending;
  const human = whoActs(s) === HUMAN && s.winner == null;
  const phases = PHASES.map(([k, l]) => `<span class="phase ${s.phase === k ? 'on' : ''}">${l}</span>`).join('');
  let prompt = '', buttons = '';
  const btn = (id, label, cls = '') => `<button class="${cls}" data-btn="${id}">${label}</button>`;
  const stack = s.stack.length ? `<div class="stackview"><span class="muted">Stack:</span>${s.stack.map(it => cardHtml(getDef(it.inst.id), { size: 'xs', mini: true })).join('')}</div>` : '';
  const combat = s.combat ? (() => {
    const A = findInst(s, s.combat.attacker)?.inst;
    const t = s.combat.target;
    const tname = t.kind === 'unit' ? getDef(findInst(s, t.uid)?.inst.id ?? '').name : t.kind === 'shield' ? 'a shield' : 'the player';
    return A ? `<b>${esc(getDef(A.id).name)}</b> (${power(s, A)}) → ${esc(tname)}. ` : '';
  })() : '';

  if (s.winner != null) prompt = 'Game over.';
  else if (!human) prompt = `<span class="who">AI</span> is thinking…`;
  else if (ui.sel) {
    const d = getDef(findInst(s, ui.sel.uid)?.inst.id ?? ui.sel.cid);
    if (ui.sel.kind === 'attack') {
      prompt = `Choose what <b>${esc(d.name)}</b> attacks: the glowing shields, a tapped enemy unit${ui.sel.options.some(a => a.target.kind === 'player') ? ', or the opponent directly' : ''}.`;
      const sh = ui.sel.options.find(a => a.target.kind === 'shield');
      const pl = ui.sel.options.find(a => a.target.kind === 'player');
      if (sh) buttons += btn('atk-shield', 'Attack shields', 'primary');
      if (pl) buttons += btn('atk-player', 'Direct attack!', 'primary');
    } else prompt = `Choose a target for <b>${esc(d.name)}</b>.`;
    if (ui.sel.options.some(a => !a.target && a.type !== 'attack')) buttons += btn('no-target', 'Play without target');
    buttons += btn('cancel', 'Cancel', 'ghost');
  } else if (pd?.kind === 'mulligan') {
    prompt = `Mulligan: click up to ${RULES.MULLIGAN_MAX} cards to put on the bottom of your deck.`;
    buttons = btn('mull', ui.mull.size ? `Mulligan ${ui.mull.size}` : 'Keep hand', 'primary');
  } else if (pd?.kind === 'block') {
    prompt = `${combat}Tap a glowing <b>Defensive</b> unit to redirect the attack, or let it through.`;
    buttons = btn('noBlock', 'No block', 'primary');
  } else if (pd?.kind === 'priority') {
    prompt = `${combat}${s.stack.length ? 'Respond with a <b>Reaction</b>?' : 'You may cast <b>Action</b> / <b>Reaction</b> spells.'}`;
    buttons = btn('pass', s.stack.length ? 'Pass (resolve)' : 'Pass', 'primary');
  } else if (pd?.kind === 'shieldify') {
    prompt = `<b>Shieldify</b>: choose a card from your hand to put into your Shield Zone (${pd.remaining} left).`;
  } else if (pd?.kind === 'shieldTrigger') {
    prompt = 'Shield Trigger!';
  } else if (s.phase === 'play') {
    prompt = 'Play phase — click a glowing card to play it (at least 1 rune must match its color).';
    buttons = btn('end', 'To Combat →', 'primary');
  } else if (s.phase === 'combat') {
    prompt = 'Combat — click a ready unit (orange) to attack.';
    buttons = btn('end', 'End turn', 'primary');
  }
  return `<div class="midbar"><div class="phases">${phases}</div><span class="muted">Turn ${s.turn}</span>
    <div class="prompt">${prompt}</div>${stack}<div class="row">${buttons}</div></div>`;
}

function triggerOverlay(s, legal, ui) {
  const pd = s.pending;
  if (!pd || pd.kind !== 'shieldTrigger' || pd.player !== HUMAN || ui.sel || s.winner != null) return '';
  const f = findInst(s, pd.uid);
  if (!f) return '';
  const canUse = legal.some(a => a.use);
  return `<div class="overlay"><div class="box">
    <h2>Shield Trigger!</h2>
    <p>Your broken shield was <b>${esc(getDef(f.inst.id).name)}</b>. Play it now for free?</p>
    <div style="display:flex;justify-content:center;margin:12px 0">${cardHtml(getDef(f.inst.id), { size: 'md' })}</div>
    <div class="row" style="justify-content:center">
      ${canUse ? '<button class="primary" data-btn="trig-use">Use it</button>' : '<span class="muted">No legal target.</span>'}
      <button data-btn="trig-skip">Keep in hand</button></div></div></div>`;
}

function winnerOverlay(s) {
  if (s.winner == null) return '';
  const title = s.winner === HUMAN ? 'Victory!' : s.winner === -1 ? 'Draw' : 'Defeat';
  return `<div class="overlay"><div class="box">
    <h2>${title}</h2><p>${esc(s.winReason)}</p><p class="muted">${s.turn} turns played.</p>
    <div class="row" style="justify-content:center">
      <button class="primary" data-btn="rematch">Rematch</button>
      <button data-btn="newgame">Choose decks</button>
      <button class="ghost" data-btn="menu">Main menu</button></div></div></div>`;
}

// ============================================================== input =====
function act(a) {
  try {
    step(G.s, a);
  } catch (e) {
    toast(e.message);
  }
  G.ui.sel = null;
  render();
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function onHover(e) {
  if (!G) return;
  const el = e.target.closest('[data-cid]');
  const pv = G.app.querySelector('#preview');
  if (!el || !pv || el.closest('#preview')) return;
  const f = el.dataset.uid ? findInst(G.s, el.dataset.uid) : null;
  const d = getDef(el.dataset.cid);
  const pw = f && f.zone === 'battle' ? power(G.s, f.inst) : undefined;
  pv.innerHTML = cardHtml(d, { size: 'lg', power: pw });
}

function onClick(e) {
  if (!G) return;
  const { s, ui } = G;
  const b = e.target.closest('[data-btn]');
  if (b) return onButton(b.dataset.btn);
  const gy = e.target.closest('[data-grave]');
  if (gy) return showGrave(+gy.dataset.grave);
  if (s.winner != null || whoActs(s) !== HUMAN) return;
  const legal = legalActions(s, HUMAN);
  const zoneEl = e.target.closest('[data-zone]');
  const uidEl = e.target.closest('[data-uid]');
  const uid = uidEl?.dataset.uid;

  // --- choosing a target
  if (ui.sel) {
    let a = null;
    if (uid) a = ui.sel.options.find(o => (o.type === 'attack' ? o.target.uid === uid : o.target === uid));
    if (!a && zoneEl?.dataset.zone) a = ui.sel.options.find(o => o.type === 'attack' && o.target.kind === zoneEl.dataset.zone);
    if (a) return act(a);
    ui.sel = null; // clicked elsewhere: cancel and fall through to reselect
    if (!uid) return render();
  }
  if (!uid) return;
  const pd = s.pending;
  if (pd?.kind === 'mulligan') {
    if (!s.players[HUMAN].hand.some(c => c.uid === uid)) return;
    ui.mull.has(uid) ? ui.mull.delete(uid) : ui.mull.size < RULES.MULLIGAN_MAX && ui.mull.add(uid);
    return render();
  }
  if (pd?.kind === 'block') { const a = legal.find(x => x.type === 'block' && x.uid === uid); return a ? act(a) : null; }
  if (pd?.kind === 'shieldify') { const a = legal.find(x => x.uid === uid); return a ? act(a) : null; }

  const plays = legal.filter(a => (a.type === 'play' || a.type === 'activate') && a.uid === uid);
  if (plays.length) {
    if (plays.length === 1 && !plays[0].target) return act(plays[0]);
    ui.sel = { kind: 'play', uid, options: plays };
    return render();
  }
  const attacks = legal.filter(a => a.type === 'attack' && a.uid === uid);
  if (attacks.length) { ui.sel = { kind: 'attack', uid, options: attacks }; return render(); }
}

function onButton(id) {
  const { s, ui } = G;
  const legal = whoActs(s) === HUMAN ? legalActions(s, HUMAN) : [];
  switch (id) {
    case 'end': return act({ type: 'endPhase' });
    case 'pass': return act({ type: 'pass' });
    case 'noBlock': return act({ type: 'noBlock' });
    case 'mull': { const uids = [...ui.mull]; ui.mull = new Set(); return act({ type: 'mulligan', uids }); }
    case 'cancel': ui.sel = null; return render();
    case 'atk-shield': return act(ui.sel.options.find(a => a.target.kind === 'shield'));
    case 'atk-player': return act(ui.sel.options.find(a => a.target.kind === 'player'));
    case 'no-target': return act(ui.sel.options.find(a => !a.target));
    case 'trig-skip': return act({ type: 'shieldTrigger', use: false });
    case 'trig-use': {
      const uses = legal.filter(a => a.type === 'shieldTrigger' && a.use);
      if (uses.length === 1 && !uses[0].target) return act(uses[0]);
      ui.sel = { kind: 'trigger', uid: s.pending.uid, options: uses };
      return render();
    }
    case 'rematch': return startGame(G.app, G.decks[0], G.decks[1]);
    case 'newgame': stopGame(); location.hash = '#/play'; return;
    case 'menu': stopGame(); location.hash = '#/'; return;
  }
}

function showGrave(pi) {
  const p = G.s.players[pi];
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="modal-box"><h3>${p.idx === HUMAN ? 'Your' : "AI's"} Graveyard (${p.graveyard.length})</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${p.graveyard.map(c => cardHtml(getDef(c.id), { size: 'md' })).join('') || '<p class="muted">Empty</p>'}</div>
    <div style="margin-top:12px"><button class="close">Close</button></div></div>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.close')) m.remove(); });
  document.body.appendChild(m);
}

// ================================================================= AI =====
function scheduleAI() {
  if (!G || G.timer || G.s.winner != null || whoActs(G.s) !== AI) return;
  const g = G;
  g.timer = setTimeout(() => {
    g.timer = null;
    if (G !== g) return;
    const a = chooseAction(g.s, AI);
    if (a) {
      try { step(g.s, a); } catch (e) { console.error(e); step(g.s, legalActions(g.s, AI).at(-1)); }
    }
    render();
  }, g.s.pending?.kind === 'mulligan' ? 250 : AI_DELAY);
}
