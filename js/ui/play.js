import { createGame, step, legalActions, whoActs, power, canAttackNow, findInst, effectiveCost, hasKeyword } from '../engine/game.js';
import { chooseAction } from '../engine/ai.js';
import { getDef, hasDef, kindOf, allCards } from '../engine/cards.js';
import { COLORS, RULES } from '../engine/rules.js';
import { validateDeck } from '../engine/deck.js';
import { playableDecks, comingSoonDecks, findDeck } from '../data.js';
import { cardHtml, cardBackHtml, cardDetailsHtml, esc, isFoil } from './card.js';
import { showCardModal } from './collection.js';
import { sfx, soundForLog } from './sfx.js';
import { checkAchievements } from '../engine/achievements.js';
import { unlock, unlockedMap } from './achievements.js';
import { deckInfoHtml } from './deckinfo.js';
import { langToggleHtml, bindLangToggle } from './lang.js';

const HUMAN = 0, AI = 1;
const ICON = {
  skull: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.1 4.6 2.9 5.9V19c0 .8.7 1.5 1.5 1.5H9v-2h1.5v2h3v-2H15v2h1.1c.8 0 1.5-.7 1.5-1.5v-2.9c1.8-1.3 2.9-3.3 2.9-5.9C20.5 5.6 17 2 12 2zM8.6 13.6a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm6.8 0a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM12 14.2l1.3 2.3h-2.6z"/></svg>',
  hammer: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.5 7.3 9.8 1l3.6 3.6-1.5 1.5 1.2 1.2 1.5-1.5 2.5 2.5-4.2 4.2-2.5-2.5 1.4-1.4-1.2-1.2-1.5 1.5zM12.6 13.1l2.8-2.8 7.4 7.4a2 2 0 0 1-2.8 2.8z"/></svg>',
};
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
  if (pick.ai !== 'random' && !decks.some(d => d.id === pick.ai)) pick.ai = 'random';
  const hour = new Date().getHours();
  const soon = comingSoonDecks();

  const thumb = (d) => (d ? cardHtml(getDef(d.legend), { size: 'xs' }) : cardBackHtml({ size: 'xs' }));
  const meta = (d) => {
    if (!d) return 'Surprise me';
    const L = getDef(d.legend);
    const v = validateDeck(d);
    return `${L.colors.join(' / ')} · avg cost ${v.stats.avgCost.toFixed(1)} · ${d.premade ? 'premade' : 'custom'}${d.fillers ? ` · ${d.fillers} filler` : ''}`;
  };
  const option = (who, d, locked = false) => {
    const id = d ? d.id : 'random';
    return `<div class="dd-opt ${pick[who] === id ? 'on' : ''} ${locked ? 'locked' : ''}" ${locked ? '' : `data-who="${who}" data-id="${id}"`}>
      ${thumb(d)}<div class="dd-text"><b>${esc(d ? d.name : 'Random deck')}</b><div class="muted">${locked ? getDef(d.legend).colors.join(' / ') : meta(d)}</div></div>
      ${locked ? '<span class="soon-tag">COMING SOON</span>' : ''}</div>`;
  };
  const dropdown = (who, label) => {
    const cur = pick[who] === 'random' ? null : findDeck(pick[who]);
    return `<div class="dd" data-dd="${who}">
      <div class="dd-label">${label}</div>
      <button class="dd-btn" type="button">${thumb(cur)}<div class="dd-text"><b>${esc(cur ? cur.name : 'Random deck')}</b><div class="muted">${meta(cur)}</div></div><span class="dd-caret">▾</span></button>
      <div class="dd-list" hidden>
        ${who === 'ai' ? option(who, null) : ''}
        ${decks.map(d => option(who, d)).join('')}
        ${soon.length ? `<div class="locked-head">Coming soon</div>${soon.map(d => option(who, d, true)).join('')}` : ''}
      </div>
    </div>`;
  };

  app.innerHTML = `<div class="page setup-page">
    <div class="row setup-top">
      <h2 style="margin:0">Play against AI</h2><span class="spacer"></span>
      <span class="muted">Nostalgia Line is ${hour >= 16 && hour < 22 ? '<b style="color:var(--good)">active</b>' : 'inactive'} (16.00 – 22.00)</span>
      <button class="primary" id="start" style="font-size:22px;padding:10px 44px">Start</button>
    </div>
    <div class="versus">
      ${dropdown('me', 'Your deck')}
      <div class="vs">VS</div>
      ${dropdown('ai', 'Opponent (AI) deck')}
    </div>
    <div class="row di-langrow"><span class="spacer"></span>${langToggleHtml()}</div>
    <div class="versus deck-infos">
      ${deckInfoHtml(findDeck(pick.me), pick.ai === 'random' ? null : findDeck(pick.ai), 'me')}
      <div></div>
      ${deckInfoHtml(pick.ai === 'random' ? null : findDeck(pick.ai), findDeck(pick.me), 'ai')}
    </div>
  </div>`;
  bindLangToggle(app, () => renderSetup(app));
  app.querySelectorAll('[data-di-cid]').forEach(el => el.onclick = (e) => { e.stopPropagation(); showCardModal(getDef(el.dataset.diCid)); });

  const closeAll = () => app.querySelectorAll('.dd-list').forEach(l => (l.hidden = true));
  app.querySelectorAll('.dd').forEach(dd => {
    dd.querySelector('.dd-btn').onclick = (e) => {
      e.stopPropagation();
      const list = dd.querySelector('.dd-list');
      const open = list.hidden;
      closeAll();
      list.hidden = !open;
      if (open) list.querySelector('.dd-opt.on')?.scrollIntoView({ block: 'nearest' });
    };
  });
  app.querySelectorAll('.dd-opt[data-id]').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    pick[el.dataset.who] = el.dataset.id;
    renderSetup(app);
  });
  app.onclick = (e) => { if (!e.target.closest('.dd')) closeAll(); };
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

  const oppPlays = (s.plays || []).filter(x => x.player === AI).slice(-4).reverse();
  // The panel is kept between renders (only rebuilt when the AI plays something new),
  // so the newest card's entry animation plays once instead of on every re-render.
  const ppKey = oppPlays.map(x => x.n).join(',');
  const oldPanel = app.querySelector('.played-panel');
  const keepPanel = oldPanel && oldPanel.dataset.key === ppKey ? oldPanel : null;
  const played = `<aside class="played-panel" data-key="${ppKey}"><div class="pp-title">AI played</div>
    ${oppPlays.map((x, i) => `<div class="pp-card ${i === 0 ? 'newest' : ''} ${i === 0 && x.n !== G.ppAnimated ? 'enter' : ''} ${x.via === 'shieldTrigger' ? 'via-trigger' : ''}" data-cid="${x.id}">
      ${x.via === 'shieldTrigger' ? '<div class="pp-tag">SHIELD TRIGGER</div>' : ''}${cardHtml(getDef(x.id), { size: 'md' })}
      <div class="pp-turn">Turn ${x.turn}</div></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</aside>`;
  app.innerHTML = `<div class="game">
    ${played}
    <section class="table">
      <div class="hand-row opp">${op.hand.map(() => cardBackHtml({ size: 'sm' })).join('')}</div>
      ${playerRow(s, op, false, hl)}
      ${battleRow(s, op, hl)}
      ${midbar(s, legal, ui)}
      ${battleRow(s, me, hl)}
      ${playerRow(s, me, true, hl)}
      <div class="hand-row mine" style="--n:${me.hand.length}">${me.hand.map((c, i) => `<div class="hand-slot" style="${fanStyle(i, me.hand.length)}">${unitCard(s, c, hl, { inHand: true })}</div>`).join('') || '<span class="muted">Empty hand</span>'}</div>
    </section>
    <aside class="side-panel">
      <div class="preview" id="preview"><span class="muted" style="align-self:center">Hover a card to inspect it · right-click for details</span></div>
      <div class="log">${s.log.map(l => `<div class="${l.startsWith('—') ? 'turn' : ''}">${esc(l)}</div>`).join('')}</div>
    </aside>
  </div>
  ${triggerOverlay(s, legal, ui)}
  ${pickOverlay(s, legal, ui)}
  ${winnerOverlay(s)}`;

  if (keepPanel) { // re-inserting a node restarts CSS animations, so drop the entry one first
    keepPanel.querySelectorAll('.pp-card.enter').forEach(e => e.classList.remove('enter'));
    app.querySelector('.played-panel').replaceWith(keepPanel);
  }
  if (oppPlays[0]) G.ppAnimated = oppPlays[0].n;
  const log = app.querySelector('.log');
  if (keepScroll) log.scrollTop = log.scrollHeight;
  animateArrivals(s, app);
  placeCracks(app);
  // game sounds from new log lines
  // logTotal counts every line ever logged (the visible log is capped)
  if (G.logLen == null) G.logLen = s.logTotal || 0;
  const n = Math.min((s.logTotal || 0) - G.logLen, s.log.length);
  const fresh = n > 0 ? s.log.slice(-n) : [];
  G.logLen = s.logTotal || 0;
  fresh.slice(-4).forEach((l, i) => setTimeout(() => soundForLog(l, s.players[HUMAN].name), i * 90));
  // achievements from the engine's events
  const ach = checkAchievements(s, HUMAN, G.evSeen || 0, new Set(Object.keys(unlockedMap())));
  G.evSeen = s.evCount || 0;
  if (ach.length) unlock(ach);
  // shield breaks shatter; enemy Shield Triggers get their own burst
  let breaks = 0;
  for (const l of fresh) {
    const b = l.match(/^(.+?)'s shield breaks/);
    if (b) {
      const who = s.players.find(p => p.name === b[1]);
      if (who) setTimeout(() => shieldShatter(app, who.idx), 60 + breaks++ * 260);
    }
    const t = l.match(/^Shield Trigger! (.+?) plays (.+?) for free\./);
    if (t) {
      const who = s.players.find(p => p.name === t[1]);
      if (who) setTimeout(() => shieldTriggerFx(app, who.idx, t[2]), 200 + breaks * 260);
    }
  }
  // nothing to respond with: don't make the player press Pass
  if (whoActs(s) === HUMAN && s.pending?.kind === 'priority' && legal.length === 1 && legal[0].type === 'pass' && !G.autoPass) {
    G.autoPass = setTimeout(() => { G.autoPass = null; if (G && s.pending?.kind === 'priority' && whoActs(s) === HUMAN) act({ type: 'pass' }); }, 450);
  }
  // 10+ mana spells and gear: lightning on play (units get it in animateArrivals)
  for (const l of fresh) {
    const m = l.match(/^(.+?) (casts|equips) (.+?)(?: →| \(on the stack\)|\.)/);
    if (!m) continue;
    const who = s.players.find(p => p.name === m[1]);
    const def = who && allCards().find(c => c.name === m[3]);
    if (!def || (def.cost || 0) < 10) continue;
    const zone = app.querySelectorAll('.battle')[who.idx === HUMAN ? 1 : 0];
    if (zone) setTimeout(() => {
      const z = zone.getBoundingClientRect(), w = Math.min(z.height * 0.7, 90);
      lightning({ rect: { left: z.left + z.width / 2 - w / 2, top: z.top + z.height / 2 - w * 0.7, width: w, height: w * 1.4 } }, def.colors);
      sfx.lightning();
    }, 120);
  }
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
      if (a.replace) h.targets.add(a.replace);
    }
    return h;
  }
  if (pd?.kind === 'block') legal.filter(a => a.type === 'block').forEach(a => h.targets.add(a.uid));
  else if (pd?.kind === 'shieldify') legal.forEach(a => h.targets.add(a.uid));
  else if (pd?.kind !== 'mulligan') {
    for (const a of legal) {
      if (a.type === 'play' || a.type === 'activate') h.playable.add(a.uid);
      if (a.type === 'activate') (h.taps ||= new Set()).add(a.uid);
      if (a.type === 'attack') h.attackers.add(a.uid);
    }
  }
  if (s.combat) { h.attacking = s.combat.attacker; h.defending = s.combat.target.uid; }
  return h;
}

/** Hearthstone-like fan: each card rotated and dropped along an arc. */
function fanStyle(i, n) {
  const mid = (n - 1) / 2;
  const step = Math.min(7, 44 / Math.max(n, 1));
  const off = i - mid;
  const k = Math.min(4.5, 26 / n);
  // the outermost cards sit at the bottom of the row, the middle ones arc upwards
  return `--fr:${(off * step).toFixed(2)}deg;--fy:${(off * off * k - mid * mid * k).toFixed(1)}px;--fz:${i + 1}`;
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
  const cost = opts.inHand && inst.owner === HUMAN ? effectiveCost(s, inst.owner, d) : undefined;
  // status icons stacked under the Might box (top right)
  const icons = [];
  if (onBoard) {
    if (hasKeyword(s, inst, 'Deathtouch')) icons.push(`<i class="ui-ico ico-death" title="Deathtouch">${ICON.skull}</i>`);
    if (hasKeyword(s, inst, 'Party Breaker')) icons.push(`<i class="ui-ico ico-party" title="Party Breaker: can attack untapped Units">${ICON.hammer}</i>`);
    if (!canAttackNow(s, inst) && !inst.tapped && s.active === inst.owner) icons.push('<i class="ui-ico ico-sick" title="Summoning sickness">zZz</i>');
    if (hasKeyword(s, inst, 'Defensive')) cls.push('is-def');
  }
  const iconCol = icons.length ? `<div class="ui-icons">${icons.join('')}</div>` : '';
  const tapHint = hl.taps?.has(inst.uid) ? '<div class="tap-hint" title="Tap ability ready">↻ TAP</div>' : '';
  const uses = inst.uses != null && !opts.inHand ? `<div class="badge-uses">${inst.uses} left</div>` : '';
  return cardHtml(d, { size: 'sm', mini: !(opts.inHand && !opts.slot), uid: inst.uid, tapped: inst.tapped && !opts.inHand, power: pw, cost,
    classes: cls.join(' '), badges: iconCol + tapHint + uses });
}

function playerRow(s, p, mine, hl) {
  const zone = (label, inner, attrs = '', empty = '') => `<div class="zone ${!inner && empty ? 'empty-slot' : ''}" ${attrs} data-empty="${empty}"><span class="lbl">${label}</span>${inner}</div>`;
  const runeArt = G.decks[p.idx].runeArt || {};
  const runeBg = (c) => (runeArt[c] && hasDef(runeArt[c]) && getDef(runeArt[c]).image ? `url('${getDef(runeArt[c]).image}') ${COLORS[c]?.hex}` : COLORS[c]?.hex);
  const runes = p.mana.map(r => `<span class="rune ${r.tapped ? 'tapped' : ''} ${runeArt[r.color] ? 'art' : ''}" style="background:${runeBg(r.color)}" title="${r.color}${r.tapped ? ' (tapped)' : ''}"></span>`).join('');
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
    ${zone('Shields', shields, `data-zone="${mine ? '' : 'shield'}" data-shields="${p.idx}"`, '').replace('class="zone', `class="zone zone-target ${shieldsTarget ? 'targetable' : ''}`)}
    ${zone('Deck', `${p.deck.length ? cardBackHtml({ size: 'sm' }) : ''}<div class="stack-pile"><span class="count" style="position:static">${p.deck.length}</span></div>`)}
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
    } else if (ui.sel.kind === 'mode') {
      prompt = `<b>${esc(d.name)}</b> — choose ${d.chooseModes > 1 ? d.chooseModes : 'one'}:`;
      const seen = new Set();
      for (const a of ui.sel.options) {
        const key = (a.modes || []).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        buttons += `<button class="primary" data-mode="${key}">${esc(a.modes.map(i => d.modes[i].name).join(' + '))}</button>`;
      }
    } else if (ui.sel.options.some(a => a.replace)) {
      prompt = `Both Gear slots are full: click the Gear that <b>${esc(d.name)}</b> replaces (it goes to the Graveyard).`;
    } else prompt = `Choose a target for <b>${esc(d.name)}</b>.`;
    if (ui.sel.kind !== 'mode' && ui.sel.options.some(a => !a.target && !a.replace && a.type !== 'attack')) buttons += btn('no-target', 'Play without target');
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
  } else if (pd?.kind === 'pick') {
    prompt = 'Make your choice.';
  } else if (s.phase === 'play') {
    prompt = 'Play phase — click a glowing card to play it (at least 1 rune must match its color).';
    buttons = btn('end', 'To Combat →', 'primary');
  } else if (s.phase === 'combat') {
    const canEnd = legal.some(a => a.type === 'endPhase');
    prompt = canEnd ? 'Combat — click a ready unit (orange) to attack.' : 'A <b>Furious</b> unit must attack this turn — click it.';
    if (canEnd) buttons = btn('end', 'End turn', 'primary');
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

function pickOverlay(s, legal, ui) {
  const pd = s.pending;
  if (!pd || pd.kind !== 'pick' || pd.player !== HUMAN || s.winner != null) return '';
  const me = s.players[HUMAN];
  if (!ui.pick || ui.pick.key !== pd.uids.join()) {
    // a single possible choice is preselected, but still has to be confirmed
    ui.pick = { key: pd.uids.join(), sel: new Set(pd.min === 1 && pd.choosable.length === 1 ? pd.choosable : []) };
  }
  const zoneCards = pd.mode === 'keep' ? me.reveal : me.graveyard;
  const cards = pd.uids.map(uid => zoneCards.find(c => c.uid === uid)).filter(Boolean);
  const ok = ui.pick.sel.size >= pd.min && ui.pick.sel.size <= pd.max;
  const src = pd.source ? getDef(pd.source).name : '';
  const hint = pd.mode === 'keep'
    ? (pd.choosable.length ? `Click the <b>${esc(pd.tribe)}</b> cards you want to keep. The rest are shuffled back into your deck.` : `No ${esc(pd.tribe)} card among them; all go back into your deck.`)
    : 'Choose the card to return to your hand.';
  return `<div class="overlay"><div class="box pick-box">
    <h2>${esc(src || pd.title)}</h2><p>${hint}</p>
    <div class="pick-row">${cards.map(c => {
      const can = pd.choosable.includes(c.uid);
      return `<div class="pick-card ${can ? 'can' : 'cannot'} ${ui.pick.sel.has(c.uid) ? 'on' : ''}" ${can ? `data-pick="${c.uid}"` : ''}>${cardHtml(getDef(c.id), { size: 'md' })}</div>`;
    }).join('')}</div>
    <div class="row" style="justify-content:center;margin-top:12px">
      <button class="primary" data-btn="pick-ok" ${ok ? '' : 'disabled'}>${pd.mode === 'keep' ? `Keep ${ui.pick.sel.size} card${ui.pick.sel.size === 1 ? '' : 's'}` : 'Confirm choice'}</button></div>
  </div></div>`;
}

/** Shield break: shards, red flash and a hit on that player's shield zone. */
function shieldShatter(app, pi) {
  const zone = app.querySelector(`[data-shields="${pi}"]`);
  if (!zone) return;
  const r = zone.getBoundingClientRect();
  const fx = document.createElement('div');
  fx.className = 'shatter-fx';
  fx.style.left = r.left + r.width * 0.45 + 'px';
  fx.style.top = r.top + r.height / 2 + 'px';
  let shards = '';
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 120;
    const w = 6 + Math.random() * 14, h = 8 + Math.random() * 20;
    shards += `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 30).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;clip-path:polygon(${[0, 1, 2].map(() => `${(Math.random() * 100).toFixed(0)}% ${(Math.random() * 100).toFixed(0)}%`).join(',')})"></i>`;
  }
  fx.innerHTML = `<div class="sh-flash"></div><div class="sh-crack"></div>${shards}<div class="sh-text">SHIELD BROKEN</div>`;
  document.body.appendChild(fx);
  zone.classList.add('shield-hit');
  setTimeout(() => zone.classList.remove('shield-hit'), 600);
  const table = app.querySelector('.table');
  table?.classList.add('quake'); setTimeout(() => table?.classList.remove('quake'), 420);
  setTimeout(() => fx.remove(), 1300);
}

/** Shield Trigger: a magenta burst over the shield zone with the card's name. */
function shieldTriggerFx(app, pi, name) {
  const zone = app.querySelector(`[data-shields="${pi}"]`);
  if (!zone) return;
  const r = zone.getBoundingClientRect();
  const fx = document.createElement('div');
  fx.className = 'trigger-fx';
  fx.style.left = r.left + r.width * 0.45 + 'px';
  fx.style.top = r.top + r.height / 2 + 'px';
  fx.innerHTML = `<div class="tr-ring"></div><div class="tr-ring r2"></div><div class="tr-text">SHIELD TRIGGER!<small>${esc(name)}</small></div>`;
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 1800);
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

// ========================================================= arrivals =====
// Units that just entered the battlefield get a landing animation:
// foil cards drop in from above the board, Mighty units (5+) crack the field.
function animateArrivals(s, app) {
  const now = new Set(s.players.flatMap(p => p.battle.map(u => u.uid)));
  if (!G.seen) { G.seen = now; return; }
  const fresh = [...now].filter(uid => !G.seen.has(uid));
  G.seen = now;
  if (!fresh.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const uid of fresh) {
    const el = app.querySelector(`.battle [data-uid="${uid}"]`);
    if (!el) continue;
    const inst = findInst(s, uid)?.inst;
    const d = getDef(inst.id);
    const foil = isFoil(d);
    const mighty = power(s, inst) >= 5;
    const titanic = (d.cost || 0) >= 10;
    el.classList.add(foil ? 'arrive-foil' : 'arrive');
    const land = foil ? 620 : 280;
    if (foil) sfx.foilLand(0.55); else if (!mighty) sfx.play();
    if (mighty && !foil) sfx.play();
    if (foil) setTimeout(() => shockwave(el), land - 60);
    if (titanic) setTimeout(() => { lightning(el, d.colors); sfx.lightning(); }, Math.max(0, land - 140));
    if (mighty) setTimeout(() => { crackField(el, app); sfx.crack(); }, land - 40);
  }
}

// debug hook: window.RajongoiFX.crack(el) / .land(el) replays the effects on any element
if (typeof window !== 'undefined') window.RajongoiFX = { crack: (el) => crackField(el, G ? G.app : document), land: (el) => shockwave(el), bolt: (el, colors, opts) => { lightning(el, colors, opts); if (!opts) sfx.lightning(); },
  // demo(cardId): drop a card onto your battle zone with the real arrival effects
  demo: (id) => {
    const d = getDef(id);
    const zone = document.querySelectorAll('.battle')[1];
    zone.querySelectorAll(':scope > .card, :scope > .empty').forEach(n => n.remove());
    zone.insertAdjacentHTML('beforeend', cardHtml(d, { size: 'sm', mini: true, uid: 'demo-' + id }));
    const el = zone.querySelector(':scope > .card:last-child');
    const foil = isFoil(d), pw = d.power || 0, land = foil ? 620 : 280;
    el.classList.add(foil ? 'arrive-foil' : 'arrive');
    if (foil) { sfx.foilLand(0.55); setTimeout(() => shockwave(el), land - 60); }
    if ((d.cost || 0) >= 10) setTimeout(() => { lightning(el, d.colors); sfx.lightning(); }, Math.max(0, land - 140));
    if (pw >= 5) setTimeout(() => { crackField(el, G.app); sfx.crack(); }, land - 40);
  }, cracks: () => (G?.cracks || []).map(k => k.uid) };

/** On-screen rect of an element's final (untransformed) layout position. */
function layoutRect(el) {
  const parent = el.offsetParent;
  if (!parent) return el.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const left = pr.left + parent.clientLeft + el.offsetLeft, top = pr.top + parent.clientTop + el.offsetTop;
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

function shockwave(el) {
  const r = layoutRect(el);
  const fx = document.createElement('div');
  fx.className = 'land-fx';
  fx.style.left = r.left + r.width / 2 + 'px';
  fx.style.top = r.top + r.height / 2 + 'px';
  fx.style.setProperty('--w', r.width + 'px');
  let sparks = '';
  for (let i = 0; i < 18; i++) {
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const dist = r.width * (0.9 + Math.random() * 0.9);
    sparks += `<i style="--x:${(Math.cos(a) * dist).toFixed(0)}px;--y:${(Math.sin(a) * dist * 0.6).toFixed(0)}px;animation-delay:${(Math.random() * 60).toFixed(0)}ms"></i>`;
  }
  fx.innerHTML = `<div class="ring"></div><div class="ring r2"></div>${sparks}`;
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 1200);
}

/** 10+ mana cards on play: lightning in the card's rune colour(s) strikes from the top of the screen.
 *  Canvas renderer: fractal (midpoint-displacement) bolts with recursive branches, a
 *  stepped leader that grows down, a blinding return stroke, re-strike flicker,
 *  additive multi-layer glow, sky flash, ground glow and gravity sparks. */
function lightning(el, colors, opts = {}) {
  const r = el.rect || layoutRect(el);
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.className = 'bolt-canvas';
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const tx = r.left + r.width / 2, ty = r.top + r.height * 0.32;
  const hexes = (colors && colors.length ? colors : ['Mind']).map(c => COLORS[c]?.hex || '#6be3ff');
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

  // midpoint displacement between two points -> polyline
  function fractal(x0, y0, x1, y1, disp, depth) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
        const off = (Math.random() - 0.5) * disp;
        next.push([(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off], pts[i + 1]);
      }
      pts = next;
      disp *= 0.55;
    }
    return pts;
  }
  // a bolt = main channel + recursive branches; every segment knows how far down the leader must be to show it
  function makeBolt(sx, ex, ey) {
    const main = fractal(sx, -30, ex, ey, Math.max(140, ey * 0.32), 7);
    const segs = [];
    const add = (pts, width, alpha, t0, t1, level) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const t = t0 + (t1 - t0) * (i / (pts.length - 1));
        segs.push({ a: pts[i], b: pts[i + 1], w: width, al: alpha, t });
        if (level < 2 && Math.random() < (level ? 0.03 : 0.045) && i > 4 && i < pts.length - 8) {
          const [bx, by] = pts[i];
          const ang = Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.65);
          const L = (ey - by) * (0.25 + Math.random() * 0.35) / (level + 1);
          const br = fractal(bx, by, bx + Math.cos(ang) * L, by + Math.sin(ang) * L, L * 0.45, 5);
          add(br, width * 0.55, alpha * 0.6, t, Math.min(1, t + 0.25), level + 1);
        }
      }
    };
    add(main, 1, 1, 0, 1, 0);
    return segs;
  }
  let bolts = [];
  const spawn = () => {
    bolts = hexes.map((hex, i) => ({
      col: rgb(hex),
      segs: makeBolt(tx + (Math.random() - 0.5) * W * 0.25 + (hexes.length > 1 ? (i ? 1 : -1) * 60 : 0), tx + (hexes.length > 1 ? (i ? 1 : -1) * 6 : 0), ty),
    }));
  };
  spawn();

  // sparks
  const sparks = [];
  const burst = (n) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.05 + Math.random() * 0.9);
      const v = 2 + Math.random() * 7;
      const c = bolts[i % bolts.length].col;
      sparks.push({ x: tx, y: ty + r.height * 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c });
    }
  };

  // timeline (ms): leader 0-150, return stroke 150, re-strikes, fade by 950
  const LEADER = 150, END = 1150;
  const flicker = (t) => {
    if (t < LEADER) return 0.35;
    const k = t - LEADER;
    const keys = [[0, 1], [95, 1], [125, 0.25], [150, 1], [230, 0.9], [260, 0.3], [290, 0.85], [420, 0.55], [END - LEADER, 0]];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
      if (k >= t0 && k <= t1) return v0 + (v1 - v0) * ((k - t0) / (t1 - t0));
    }
    return 0;
  };
  const start = performance.now();
  let struck = false, restruck = false;

  function drawBolt(bolt, progress, intensity) {
    const [cr, cg, cb] = bolt.col;
    // group visible segments by width level -> one path per level (fast)
    const groups = new Map();
    for (const s of bolt.segs) {
      if (s.t > progress) continue;
      let p = groups.get(s.w);
      if (!p) { p = { path: new Path2D(), al: s.al }; groups.set(s.w, p); }
      p.path.moveTo(s.a[0], s.a[1]); p.path.lineTo(s.b[0], s.b[1]);
    }
    const light = `${Math.min(255, cr + 90)},${Math.min(255, cg + 90)},${Math.min(255, cb + 90)}`;
    const passes = [
      { w: 54, a: 0.10, c: `${cr},${cg},${cb}`, blur: 0 },
      { w: 24, a: 0.30, c: `${cr},${cg},${cb}`, blur: 28 },
      { w: 9, a: 0.95, c: `${cr},${cg},${cb}`, blur: 10 },
      { w: 4, a: 0.9, c: light, blur: 0 },
      { w: 2.2, a: 1, c: '255,255,255', blur: 0 },
    ];
    for (const [w, grp] of groups) {
      for (const p of passes) {
        g.shadowBlur = p.blur; g.shadowColor = `rgb(${cr},${cg},${cb})`;
        g.strokeStyle = `rgba(${p.c},${p.a * grp.al * intensity})`;
        g.lineWidth = p.w * w;
        g.stroke(grp.path);
      }
    }
    g.shadowBlur = 0;
  }

  function frame(now) {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const inten = flicker(t);
    if (!struck && t >= LEADER) { struck = true; burst(42); }
    if (!restruck && t >= LEADER + 125) { restruck = true; spawn(); burst(18); }
    const progress = Math.min(1, t / LEADER);
    // sky flash
    if (t >= LEADER) {
      const [cr, cg, cb] = bolts[0].col;
      g.fillStyle = `rgba(${cr},${cg},${cb},${0.3 * inten})`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(255,255,255,${0.12 * inten})`;
      g.fillRect(0, 0, W, H);
    }
    for (const bolt of bolts) drawBolt(bolt, progress, t < LEADER ? 0.55 : inten);
    // ground glow at the impact
    if (t >= LEADER) {
      const [cr, cg, cb] = bolts[bolts.length - 1].col;
      const rad = r.width * (1.6 + inten);
      const gr = g.createRadialGradient(tx, ty + r.height * 0.2, 0, tx, ty + r.height * 0.2, rad);
      gr.addColorStop(0, `rgba(255,255,255,${0.75 * inten})`);
      gr.addColorStop(0.25, `rgba(${cr},${cg},${cb},${0.55 * inten})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(tx, ty + r.height * 0.2, rad, rad * 0.55, 0, 0, Math.PI * 2); g.fill();
    }
    // sparks with gravity
    for (const p of sparks) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.vx *= 0.985; p.life -= 0.022;
      if (p.life <= 0) continue;
      g.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.life})`;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); g.stroke();
      g.fillStyle = `rgba(255,255,255,${p.life})`;
      g.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    if (opts.freezeAt != null) return;
    if (t < END || sparks.some(p => p.life > 0)) requestAnimationFrame(frame);
    else cv.remove();
  }
  if (opts.freezeAt != null) { // debug: render the state at a fixed time and keep it on screen
    for (let ft = 0; ft <= opts.freezeAt; ft += 16) frame(start + ft);
    setTimeout(() => cv.remove(), opts.hold || 1500);
    return;
  }
  requestAnimationFrame(frame);
}

const CRACK_MS = 2600;

/** Mighty landing: the battlefield cracks underneath the unit. The crack lives inside
 *  the battle zone (under every card, clipped to the field) and is re-anchored to its
 *  unit on every render, so it stays put when the other units shift around. */
function crackField(el, app) {
  const w = el.offsetWidth, h = el.offsetHeight;
  const size = w * 3.6;
  const c = size / 2;
  let paths = '';
  const rays = 8 + Math.floor(Math.random() * 3);
  for (let i = 0; i < rays; i++) {
    const a = (Math.PI * 2 * i) / rays + (Math.random() - 0.5) * 0.5;
    const len = c * (0.55 + Math.random() * 0.45);
    let x = c, y = c, pts = `M${c} ${c}`;
    for (let k = 1; k <= 5; k++) {
      const t = (len * k) / 5;
      x = c + Math.cos(a) * t + (Math.random() - 0.5) * size * 0.06;
      y = c + Math.sin(a) * t * 0.55 + (Math.random() - 0.5) * size * 0.035;
      pts += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (k === 2 || k === 3) {
        const br = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
        const bl = len * 0.22;
        paths += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + Math.cos(br) * bl).toFixed(1)} ${(y + Math.sin(br) * bl * 0.55).toFixed(1)}" stroke-width="${(size * 0.008).toFixed(1)}"/>`;
      }
    }
    paths += `<path d="${pts}" stroke-width="${(size * 0.016).toFixed(1)}"/>`;
  }
  const html = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <defs><radialGradient id="cg"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${c}" cy="${c}" rx="${c * 0.85}" ry="${c * 0.42}" fill="url(#cg)"/>
    <g class="glow" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <g class="dark" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>
    ${Array.from({ length: 10 }, () => `<b style="--x:${((Math.random() - 0.5) * size * 0.7).toFixed(0)}px;--y:${(-Math.random() * size * 0.3).toFixed(0)}px"></b>`).join('')}`;
  const uid = el.dataset.uid;
  if (G) {
    G.cracks = (G.cracks || []).filter(k => k.uid !== uid);
    G.cracks.push({ uid, html, size, start: performance.now() });
    placeCracks(app);
  }
  const table = (app.querySelector ? app : document).querySelector('.table');
  table?.classList.add('quake');
  setTimeout(() => table?.classList.remove('quake'), 450);
  setTimeout(() => G && placeCracks(G.app), CRACK_MS + 50); // clean up when finished
}

/** (Re)draw live cracks under their units. Called after every render. */
function placeCracks(app) {
  if (!G || !G.cracks?.length) return;
  const now = performance.now();
  G.cracks = G.cracks.filter(k => now - k.start < CRACK_MS);
  app.querySelectorAll('.crack-layer').forEach(l => l.replaceChildren());
  for (const k of G.cracks) {
    const card = app.querySelector(`.battle [data-uid="${k.uid}"]`);
    let battle = card?.closest('.battle');
    if (card) { k.x = card.offsetLeft + card.offsetWidth / 2; k.y = card.offsetTop + card.offsetHeight / 2; k.side = [...app.querySelectorAll('.battle')].indexOf(battle); }
    else battle = app.querySelectorAll('.battle')[k.side ?? -1]; // unit gone: keep the crack where it was
    if (!battle || k.x == null) continue;
    let layer = battle.querySelector(':scope > .crack-layer');
    if (!layer) { layer = document.createElement('div'); layer.className = 'crack-layer'; battle.prepend(layer); }
    const fx = document.createElement('div');
    fx.className = 'crack-fx';
    fx.style.cssText = `left:${k.x - k.size / 2}px;top:${k.y - k.size / 2}px;width:${k.size}px;height:${k.size}px;--t:${Math.round(now - k.start)}ms`;
    fx.innerHTML = k.html;
    layer.appendChild(fx);
  }
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
  pv.innerHTML = `<div>${cardHtml(d, { size: 'lg', power: pw })}${cardDetailsHtml(d, { power: pw })}</div>`;
}

function onClick(e) {
  if (!G) return;
  const { s, ui } = G;
  const b = e.target.closest('[data-btn]');
  if (b) return onButton(b.dataset.btn);
  const mb = e.target.closest('[data-mode]');
  if (mb && ui.sel?.kind === 'mode') {
    const opts = ui.sel.options.filter(a => (a.modes || []).join(',') === mb.dataset.mode);
    if (opts.length === 1 && !opts[0].target) return act(opts[0]);
    ui.sel = { ...ui.sel, kind: ui.sel.after || 'play', options: opts };
    return render();
  }
  const pk = e.target.closest('[data-pick]');
  if (pk && ui.pick && s.pending?.kind === 'pick') {
    const uid = pk.dataset.pick, sel = ui.pick.sel;
    if (sel.has(uid)) sel.delete(uid);
    else { if (sel.size >= s.pending.max) sel.delete([...sel][0]); sel.add(uid); }
    return render();
  }
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
    if (uid) a = ui.sel.options.find(o => (o.type === 'attack' ? o.target.uid === uid : o.target === uid || o.replace === uid));
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
    const modeKeys = new Set(plays.map(a => (a.modes || []).join(',')));
    ui.sel = { kind: modeKeys.size > 1 ? 'mode' : 'play', uid, options: plays };
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
    case 'pick-ok': {
      const uids = [...(ui.pick?.sel || [])];
      ui.pick = null;
      return act({ type: 'pick', uids });
    }
    case 'trig-skip': return act({ type: 'shieldTrigger', use: false });
    case 'trig-use': {
      const uses = legal.filter(a => a.type === 'shieldTrigger' && a.use);
      if (uses.length === 1 && !uses[0].target) return act(uses[0]);
      const modeKeys = new Set(uses.map(a => (a.modes || []).join(',')));
      ui.sel = { kind: modeKeys.size > 1 ? 'mode' : 'trigger', after: 'trigger', uid: s.pending.uid, options: uses };
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
