// Game engine: pure state machine. No DOM, no timers.
//   const s = createGame({ decks:[d0,d1], ... })
//   legalActions(s, player) -> Action[]
//   step(s, action)          (mutates s)
// The whole state is plain JSON, so structuredClone() works for AI look-ahead.
import { RULES } from './rules.js';
import { getDef, kindOf } from './cards.js';

// ---------------------------------------------------------------- clock ----
// Used by the "Nostalgia Line" keyword (real local time).
let clockHour = () => new Date().getHours();
export function setClock(fn) { clockHour = fn; }

// ------------------------------------------------------------------ rng ----
function rand(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------- setup ----
export function createGame({ decks, names = ['You', 'AI'], ai = [false, true], seed = Date.now(), firstPlayer = null }) {
  const s = {
    seed: seed | 0, uid: 0, turn: 0, active: 0, first: 0, phase: 'setup',
    pending: null, suspended: null, queue: [], combat: null, stack: [],
    winner: null, winReason: '', log: [], players: [], firstOverride: firstPlayer,
  };
  decks.forEach((d, i) => s.players.push(buildPlayer(s, d, i, names[i], ai[i])));
  log(s, `${s.players[0].name} (${decks[0].name}) vs ${s.players[1].name} (${decks[1].name})`);
  s.pending = { kind: 'mulligan', player: 0 };
  return s;
}

function mk(s, id, owner) {
  const d = getDef(id);
  return { uid: 'c' + (++s.uid), id, owner, tapped: false, sick: false, mods: [], uses: d.uses ?? null, fast: false };
}

function buildPlayer(s, deck, idx, name, isAI) {
  const ids = [];
  for (const [id, n] of Object.entries(deck.cards)) for (let k = 0; k < n; k++) ids.push(id);
  const take = (id) => {
    const i = ids.indexOf(id);
    if (i < 0) return null;
    ids.splice(i, 1);
    return mk(s, id, idx);
  };
  const p = {
    idx, name, isAI: !!isAI, deckName: deck.name,
    legend: mk(s, deck.legend, idx),
    championSlot: deck.champion ? take(deck.champion) : null,
    signatureSlot: deck.signature ? take(deck.signature) : null,
    deck: shuffle(s, ids.map(id => mk(s, id, idx))),
    hand: [], shields: [], battle: [], graveyard: [], mana: [], gear: [],
    manaDeck: [], turnsTaken: 0,
  };
  for (const [color, n] of Object.entries(deck.runes || {}))
    for (let k = 0; k < n; k++) p.manaDeck.push({ uid: 'r' + (++s.uid), color, tapped: false });
  shuffle(s, p.manaDeck);
  p.shields = p.deck.splice(0, RULES.SHIELDS);
  p.hand = p.deck.splice(0, RULES.OPENING_HAND);
  return p;
}

// -------------------------------------------------------------- helpers ----
export function log(s, msg) {
  s.log.push(msg);
  if (s.log.length > 150) s.log.splice(0, s.log.length - 150);
}
export const other = (i) => 1 - i;
export const whoActs = (s) => (s.pending ? s.pending.player : s.active);
const nm = (inst) => getDef(inst.id).name;

export function findInst(s, uid) {
  for (const p of s.players) {
    for (const zone of ['hand', 'battle', 'gear', 'graveyard', 'shields', 'deck']) {
      const inst = p[zone].find(c => c.uid === uid);
      if (inst) return { inst, zone, player: p.idx };
    }
    if (p.championSlot?.uid === uid) return { inst: p.championSlot, zone: 'championSlot', player: p.idx };
    if (p.signatureSlot?.uid === uid) return { inst: p.signatureSlot, zone: 'signatureSlot', player: p.idx };
    if (p.legend.uid === uid) return { inst: p.legend, zone: 'legend', player: p.idx };
  }
  for (const it of s.stack) if (it.inst.uid === uid) return { inst: it.inst, zone: 'stack', player: it.controller };
  return null;
}

export function hasKeyword(s, inst, kw) {
  const d = getDef(inst.id);
  if ((d.keywords || []).includes(kw)) return true;
  if (kw === 'Unstoppable' && d.unstoppableIfTribe) {
    const p = s.players[inst.owner];
    if ([...p.battle, ...p.gear].some(c => (getDef(c.id).tribes || []).includes(d.unstoppableIfTribe))) return true;
  }
  return inst.mods.some(m => m.keyword === kw);
}

const isMighty = (s, u) => power(s, u) >= 5;

/** Current Might of a unit. opts.ignoreTemp drops "this turn" modifiers (AI eval). */
export function power(s, inst, opts = {}) {
  const d = getDef(inst.id);
  let p = inst.morph ?? (d.power || 0);
  for (const m of inst.mods) if (m.power && !(opts.ignoreTemp && m.until)) p += m.power;
  const owner = s.players[inst.owner];
  if (inst.morph == null) for (const e of d.effects || []) {
    if (e.on === 'static' && e.do === 'mightPerRune') p += owner.mana.filter(r => r.color === e.color).length * (e.amount ?? 1);
    if (e.on === 'static' && e.do === 'mightPerShield') p += owner.shields.length * (e.amount ?? 1);
  }
  for (const src of staticSources(owner)) {
    for (const e of getDef(src.id).effects || []) {
      if (e.on !== 'static' || e.do !== 'buff') continue;
      const f = e.filter || {};
      if (f.color && !d.colors.includes(f.color)) continue;
      if (f.keyword && !hasKeyword(s, inst, f.keyword)) continue;
      if (e.target === 'self' && src.uid !== inst.uid) continue;
      p += e.amount || 0;
    }
  }
  return p;
}
function staticSources(p) { return [p.legend, ...p.gear, ...p.battle]; }

export function canAttackNow(s, inst) {
  return !inst.tapped && (!inst.sick || inst.fast || hasKeyword(s, inst, 'Haste'));
}
const canAttackWith = (s, u) => canAttackNow(s, u) && !hasKeyword(s, u, 'Immobile');

// ---------------------------------------------------------- cost ----
/** Printed cost minus reductions (Flood, Whiskey…). */
export function effectiveCost(s, pi, d) {
  const r = d.costReduction;
  if (!r) return d.cost;
  const p = s.players[pi];
  let n = 0;
  if (r.perRunePair) n += Math.min(...r.perRunePair.map(c => p.mana.filter(x => x.color === c).length));
  if (r.perGraveTribe) n += p.graveyard.filter(c => (getDef(c.id).tribes || []).includes(r.perGraveTribe)).length;
  return Math.max(0, d.cost - n);
}

// ----------------------------------------------------------------- mana ----
function untappedRunes(p) { return p.mana.filter(r => !r.tapped); }

const matches = (colors) => (r) => !colors || !colors.length || colors.includes(r.color);

/** cost = runes to tap; recycle = runes of the card's color to put on the bottom of the Mana Deck. */
export function canAfford(p, cost, colors, recycle = 0) {
  if (recycle > 0 && p.mana.filter(matches(colors)).length < recycle) return false;
  if (!cost) return true;
  const free = untappedRunes(p);
  if (free.length < cost) return false;
  if (colors && colors.length) return free.some(r => colors.includes(r.color));
  return true;
}
const affordDef = (s, p, d) => canAfford(p, effectiveCost(s, p.idx, d), d.colors, d.recycle || 0);

function payCost(s, p, cost, colors, recycle = 0) {
  if (!canAfford(p, cost, colors, recycle)) return false;
  if (cost) tapRunes(p, cost, colors);
  if (recycle > 0) {
    // recycle matching runes, tapped ones first
    const pool = p.mana.filter(matches(colors)).sort((a, b) => b.tapped - a.tapped).slice(0, recycle);
    for (const r of pool) { p.mana.splice(p.mana.indexOf(r), 1); r.tapped = false; p.manaDeck.push(r); }
    log(s, `${p.name} recycles ${recycle} rune${recycle > 1 ? 's' : ''}.`);
  }
  return true;
}
function tapRunes(p, cost, colors) {
  const free = untappedRunes(p);
  const chosen = [];
  if (colors && colors.length) chosen.push(free.find(r => colors.includes(r.color)));
  // spend off-colour runes first, keep matching ones for later
  const rest = free.filter(r => !chosen.includes(r))
    .sort((a, b) => (colors?.includes(a.color) ? 1 : 0) - (colors?.includes(b.color) ? 1 : 0));
  while (chosen.length < cost) chosen.push(rest.shift());
  chosen.forEach(r => (r.tapped = true));
}

function channel(s, p, n, tapped = false) {
  let got = 0;
  for (let i = 0; i < n && p.manaDeck.length; i++) {
    const r = p.manaDeck.shift();
    r.tapped = tapped;
    p.mana.push(r);
    got++;
  }
  if (got) log(s, `${p.name} channels ${got} rune${got > 1 ? 's' : ''}.`);
}

// -------------------------------------------------------------- targets ----
const SINGLE_TARGETS = new Set(['enemyUnit', 'friendlyUnit', 'anyUnit', 'enemyTappedUnit', 'enemyGear']);

/** The first single-target effect of a given trigger (cards pick at most one target). */
export function targetSpec(def, trigger = 'play') {
  return (def.effects || []).find(e => (e.on || 'play') === trigger && SINGLE_TARGETS.has(e.target)) || null;
}

export function listTargets(s, pi, spec) {
  if (!spec) return [];
  const me = s.players[pi], op = s.players[other(pi)];
  let pool;
  switch (spec.target) {
    case 'enemyUnit': pool = op.battle; break;
    case 'friendlyUnit': pool = me.battle; break;
    case 'anyUnit': pool = [...me.battle, ...op.battle]; break;
    case 'enemyTappedUnit': pool = op.battle.filter(u => u.tapped); break;
    case 'enemyGear': return op.gear.map(g => g.uid);
    default: return [];
  }
  if (spec.maxPower != null) pool = pool.filter(u => power(s, u) <= spec.maxPower);
  if (spec.minPower != null) pool = pool.filter(u => power(s, u) >= spec.minPower);
  if (spec.filter) pool = pool.filter(u => matchFilter(u, spec.filter));
  pool = pool.filter(u => u.owner === pi || !hasKeyword(s, u, 'Elusive'));
  return pool.map(u => u.uid);
}

/** filter: { color, notColor, type, notType } */
export function matchFilter(u, f) {
  if (!f) return true;
  const d = getDef(u.id);
  if (f.color && !d.colors.includes(f.color)) return false;
  if (f.notColor && d.colors.includes(f.notColor)) return false;
  if (f.type && d.type !== f.type) return false;
  if (f.notType && d.type === f.notType) return false;
  return true;
}

function resolveTargets(s, pi, source, e, targetUid, subject) {
  const me = s.players[pi], op = s.players[other(pi)];
  switch (e.target) {
    case 'allEnemyUnits': return [...op.battle];
    case 'allFriendlyUnits': return [...me.battle];
    case 'allUnits': return [...me.battle, ...op.battle];
    case 'self': return source && me.battle.includes(source) ? [source] : [];
    case 'played': return subject ? [subject] : [];
    case undefined: case null: case 'none': return [];
  }
  if (!targetUid) return [];
  // still a legal target at resolution?
  if (!listTargets(s, pi, { ...e, maxPower: null, filter: null }).includes(targetUid)) return [];
  const f = findInst(s, targetUid);
  return f ? [f.inst] : [];
}

// ----------------------------------------------------------- legal acts ----
function sourcesFor(p) {
  const out = p.hand.map(inst => ({ inst, from: 'hand' }));
  if (p.championSlot) out.push({ inst: p.championSlot, from: 'championSlot' });
  if (p.signatureSlot) out.push({ inst: p.signatureSlot, from: 'signatureSlot' });
  return out;
}

/** All legal mode choices for a card: [null] when it has no modes. */
function modeChoices(d) {
  if (!d.modes || !d.modes.length || d.opponentChooses) return [null];
  const k = Math.min(d.chooseModes || 1, d.modes.length);
  const idx = d.modes.map((_, i) => i);
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc); return; }
    for (let i = start; i < idx.length; i++) rec(i + 1, [...acc, i]);
  };
  rec(0, []);
  return out;
}
/** Effects a card runs when it is played, with the chosen modes. */
export function playEffects(d, modes) {
  const base = effectsOn(d, 'play');
  if (!modes || !d.modes) return base;
  return [...base, ...modes.flatMap(i => (d.modes[i].effects || []).map(e => ({ on: 'play', ...e })))];
}

function playOptions(s, pi, mode) {
  const p = s.players[pi];
  const acts = [];
  const seen = new Set();
  for (const { inst } of sourcesFor(p)) {
    const d = getDef(inst.id);
    const k = kindOf(d);
    if (k === 'legend') continue;
    if (mode === 'priority') {
      if (k !== 'spell') continue;
      const kws = d.keywords || [];
      if (!(kws.includes('Reaction') || (kws.includes('Action') && s.stack.length === 0))) continue;
    }
    if (d.requiresStack && !s.stack.some(it => it.controller !== pi)) continue;
    if (!affordDef(s, p, d)) continue;
    const dupKey = inst.id + (p.hand.includes(inst) ? 'h' : 's');
    if (seen.has(dupKey)) continue; // identical copies in hand -> one option
    seen.add(dupKey);
    for (const m of modeChoices(d)) {
      acts.push(...withTargets(s, pi, d, { type: 'play', uid: inst.uid, ...(m ? { modes: m } : {}) }, k === 'spell', 'play', m));
    }
  }
  return acts;
}

function withTargets(s, pi, d, base, required, trigger = 'play', modes = null) {
  const effs = trigger === 'play' ? playEffects(d, modes) : effectsOn(d, trigger);
  const spec = effs.find(e => SINGLE_TARGETS.has(e.target)) || null;
  if (!spec) return [base];
  const ts = listTargets(s, pi, spec);
  if (!ts.length) return required ? [] : [base];
  return ts.map(t => ({ ...base, target: t }));
}

function activateOptions(s, pi) {
  const p = s.players[pi];
  const acts = [];
  for (const g of [...p.gear, ...p.battle]) {
    const d = getDef(g.id);
    if (!(d.effects || []).some(e => e.on === 'activate')) continue;
    if (d.activateNoTap) { if (g.activatedTurn === s.turn) continue; }
    else if (g.tapped || (p.battle.includes(g) && !canAttackNow(s, g))) continue;
    if (!canAfford(p, d.activateCost || 0, null)) continue;
    acts.push(...withTargets(s, pi, d, { type: 'activate', uid: g.uid }, true, 'activate'));
  }
  return acts;
}

function attackOptions(s, pi) {
  const me = s.players[pi], op = s.players[other(pi)];
  const acts = [];
  for (const u of me.battle) {
    if (!canAttackWith(s, u)) continue;
    acts.push({ type: 'attack', uid: u.uid, target: { kind: op.shields.length ? 'shield' : 'player' } });
    const party = hasKeyword(s, u, 'Party Breaker');
    for (const t of op.battle) if (t.tapped || party) acts.push({ type: 'attack', uid: u.uid, target: { kind: 'unit', uid: t.uid } });
  }
  return acts;
}

function subsets(arr, max) {
  const out = [[]];
  for (const x of arr) {
    const n = out.length;
    for (let i = 0; i < n; i++) if (out[i].length < max) out.push([...out[i], x]);
  }
  return out;
}

export function legalActions(s, pi) {
  if (s.winner != null || whoActs(s) !== pi) return [];
  const pd = s.pending;
  const me = s.players[pi];
  if (pd) {
    switch (pd.kind) {
      case 'mulligan':
        return subsets(me.hand.map(c => c.uid), RULES.MULLIGAN_MAX).map(uids => ({ type: 'mulligan', uids }));
      case 'block': {
        const acts = [{ type: 'noBlock' }];
        for (const b of blockers(s, pi)) acts.push({ type: 'block', uid: b.uid });
        return acts;
      }
      case 'priority':
        return [{ type: 'pass' }, ...playOptions(s, pi, 'priority')];
      case 'shieldTrigger': {
        const acts = [{ type: 'shieldTrigger', use: false }];
        const f = findInst(s, pd.uid);
        if (f && f.zone === 'hand') {
          const d = getDef(f.inst.id);
          for (const m of modeChoices(d)) acts.push(...withTargets(s, pi, d, { type: 'shieldTrigger', use: true, ...(m ? { modes: m } : {}) }, kindOf(d) === 'spell', 'play', m));
        }
        return acts;
      }
      case 'shieldify':
        return me.hand.map(c => ({ type: 'shieldify', uid: c.uid }));
    }
    return [];
  }
  const acts = [];
  if (s.phase === 'play') acts.push(...playOptions(s, pi, 'main'), ...activateOptions(s, pi));
  let mustAttack = false;
  if (s.phase === 'combat' && !s.combat) {
    const atk = attackOptions(s, pi);
    acts.push(...atk, ...activateOptions(s, pi));
    mustAttack = atk.some(a => hasKeyword(s, findInst(s, a.uid).inst, 'Furious'));
  }
  if (!mustAttack) acts.push({ type: 'endPhase' });
  return acts;
}

function blockers(s, defIdx) {
  const c = s.combat;
  const att = findInst(s, c.attacker)?.inst;
  if (att && hasKeyword(s, att, 'Unstoppable')) return [];
  return s.players[defIdx].battle.filter(u =>
    !u.tapped && hasKeyword(s, u, 'Defensive') && !(c.target.kind === 'unit' && c.target.uid === u.uid));
}

const keyOf = (a) => JSON.stringify(a, Object.keys(a).sort()) + JSON.stringify(a.target ?? null) + JSON.stringify(a.uids ?? null) + JSON.stringify(a.modes ?? null);
export function isLegal(s, pi, a) {
  const k = keyOf(normalizeAction(a));
  return legalActions(s, pi).some(x => keyOf(normalizeAction(x)) === k);
}
function normalizeAction(a) {
  const n = { ...a };
  if (n.uids) n.uids = [...n.uids].sort();
  return n;
}

// ------------------------------------------------------------------ step ----
export function step(s, a) {
  const pi = whoActs(s);
  if (!isLegal(s, pi, a)) throw new Error('Illegal action: ' + JSON.stringify(a));
  const pd = s.pending;
  switch (a.type) {
    case 'mulligan': doMulligan(s, pi, a.uids); break;
    case 'play': doPlay(s, pi, a); break;
    case 'activate': doActivate(s, pi, a); break;
    case 'attack': doAttack(s, pi, a); break;
    case 'block': case 'noBlock': doBlock(s, pi, a); break;
    case 'pass': doPass(s, pd); break;
    case 'shieldTrigger': doShieldTrigger(s, pi, a); break;
    case 'shieldify': doShieldify(s, pi, a); break;
    case 'endPhase': doEndPhase(s); break;
  }
  settle(s);
  return s;
}

function settle(s) {
  for (let guard = 0; guard < 100; guard++) {
    if (s.winner != null) { s.pending = null; return; }
    checkDeaths(s);
    if (s.winner != null) continue;
    // auto-skip shieldify when hand is empty
    if (s.queue.length && s.queue[0].kind === 'shieldify' && !s.players[s.queue[0].player].hand.length) {
      s.queue.shift();
      if (s.pending && s.pending.kind === 'shieldify') s.pending = s.queue[0] || takeSuspended(s);
      continue;
    }
    if (s.queue.length && (!s.pending || !isQueueKind(s.pending))) {
      s.suspended = s.pending;
      s.pending = s.queue[0];
      continue;
    }
    if (!s.pending && s.turn > RULES.MAX_TURNS) {
      const [a, b] = s.players.map(p => p.shields.length);
      setWinner(s, a === b ? -1 : a > b ? 0 : 1, 'Turn limit reached');
      continue;
    }
    return;
  }
}
const isQueueKind = (pd) => pd.kind === 'shieldTrigger' || pd.kind === 'shieldify';
function takeSuspended(s) { const x = s.suspended; s.suspended = null; return x; }
function nextFromQueue(s) { s.pending = s.queue.length ? s.queue[0] : takeSuspended(s); }

function setWinner(s, pi, reason) {
  if (s.winner != null) return;
  s.winner = pi;
  s.winReason = reason;
  log(s, pi === -1 ? `Draw — ${reason}.` : `${s.players[pi].name} wins! ${reason}`);
}

// Units with 0 or less Might are destroyed.
function checkDeaths(s) {
  for (const p of s.players) {
    for (const u of [...p.battle]) if (p.battle.includes(u) && power(s, u) <= 0) {
      log(s, `${nm(u)} has 0 Might and is destroyed.`);
      destroyUnit(s, u);
    }
  }
}

// ---------------------------------------------------------- turn flow ----
function doMulligan(s, pi, uids) {
  const p = s.players[pi];
  for (const uid of uids) {
    const i = p.hand.findIndex(c => c.uid === uid);
    p.deck.push(...p.hand.splice(i, 1));
  }
  for (let i = 0; i < uids.length; i++) p.hand.push(p.deck.shift());
  log(s, uids.length ? `${p.name} mulligans ${uids.length} card${uids.length > 1 ? 's' : ''}.` : `${p.name} keeps their hand.`);
  if (pi === 0) { s.pending = { kind: 'mulligan', player: 1 }; return; }
  s.pending = null;
  s.first = s.firstOverride ?? (rand(s) < 0.5 ? 0 : 1);
  s.active = s.first;
  log(s, `Coin flip: ${s.players[s.first].name} goes first.`);
  beginTurn(s);
}

function beginTurn(s) {
  s.turn++;
  const p = s.players[s.active];
  s.phase = 'start';
  log(s, `— Turn ${s.turn}: ${p.name} —`);
  for (const u of p.battle) { u.tapped = false; u.sick = false; u.fast = false; }
  for (const r of p.mana) r.tapped = false;
  for (const g of p.gear) g.tapped = false;
  p.legend.tapped = false;
  for (const src of [p.legend, ...p.gear, ...p.battle]) fire(s, p.idx, src, 'turnStart');
  if (s.winner != null) return;
  s.phase = 'draw';
  drawCard(s, p.idx);
  if (s.winner != null) return;
  s.phase = 'mana';
  const n = (p.idx !== s.first && p.turnsTaken === 0) ? RULES.CHANNEL_SECOND_PLAYER_FIRST_TURN : RULES.CHANNEL_PER_TURN;
  channel(s, p, n);
  s.phase = 'play';
}

function doEndPhase(s) {
  if (s.phase === 'play') { s.phase = 'combat'; return; }
  // end phase
  s.phase = 'end';
  const ap = s.players[s.active];
  for (const c of [...ap.battle, ...ap.gear]) if (hasKeyword(s, c, 'Vigilance') && c.tapped) {
    c.tapped = false;
    log(s, `${nm(c)} untaps (Vigilance).`);
  }
  ap.doubleNext = false;
  for (const p of s.players) for (const u of p.battle) {
    u.mods = u.mods.filter(m => !(m.until === 'eot' || (m.untilTurn != null && m.untilTurn <= s.turn)));
  }
  s.players[s.active].turnsTaken++;
  s.active = other(s.active);
  beginTurn(s);
}

function drawCard(s, pi) {
  const p = s.players[pi];
  if (p.deck.length) { p.hand.push(p.deck.shift()); return; }
  // Empty deck: take a shield instead; with no shields left you lose.
  if (p.shields.length) {
    p.hand.push(p.shields.shift());
    log(s, `${p.name}'s deck is empty — a shield is taken into hand instead.`);
  } else setWinner(s, other(pi), `${p.name} could not draw.`);
}

// ------------------------------------------------------------- playing ----
function removeFromSource(p, uid) {
  let i = p.hand.findIndex(c => c.uid === uid);
  if (i >= 0) return p.hand.splice(i, 1)[0];
  if (p.championSlot?.uid === uid) { const c = p.championSlot; p.championSlot = null; return c; }
  if (p.signatureSlot?.uid === uid) { const c = p.signatureSlot; p.signatureSlot = null; return c; }
  return null;
}

function doPlay(s, pi, a) {
  const p = s.players[pi];
  const inst = [...p.hand, p.championSlot, p.signatureSlot].find(c => c && c.uid === a.uid);
  const d = getDef(inst.id);
  payCost(s, p, effectiveCost(s, pi, d), d.colors, d.recycle || 0);
  removeFromSource(p, a.uid);
  const k = kindOf(d);
  if (k === 'spell' && s.pending && s.pending.kind === 'priority') {
    s.stack.push({ inst, controller: pi, target: a.target ?? null, modes: a.modes ?? null });
    log(s, `${p.name} casts ${d.name}${a.target ? ' → ' + nm(findInst(s, a.target).inst) : ''} (on the stack).`);
    fireAll(s, pi, 'spellCast');
    s.pending.player = other(pi);
    s.pending.passes = 0;
    return;
  }
  putIntoPlay(s, pi, inst, a.target, a.modes);
}

function resolveModes(s, pi, d, modes) {
  if (d.opponentChooses && d.modes?.length) {
    const i = Math.floor(rand(s) * d.modes.length);
    log(s, `${s.players[other(pi)].name} chooses "${d.modes[i].name}" for ${d.name}.`);
    return [i];
  }
  if (modes && d.modes) log(s, `${d.name}: ${modes.map(i => d.modes[i].name).join(' + ')}.`);
  return modes;
}

/** Run a spell's / ability's effects; Hellyeah makes the next one happen twice. */
function runTwiceIfDoubled(s, pi, src, effects, target) {
  const p = s.players[pi];
  const times = p.doubleNext ? 2 : 1;
  if (p.doubleNext) { p.doubleNext = false; log(s, 'Hellyeah! It triggers twice.'); }
  for (let i = 0; i < times; i++) runEffects(s, pi, src, effects, target);
}

/** Resolve a card entering play (normal play, or a free Shield Trigger). */
function putIntoPlay(s, pi, inst, target, modes = null) {
  const p = s.players[pi];
  const d = getDef(inst.id);
  const k = kindOf(d);
  modes = resolveModes(s, pi, d, modes);
  inst.tapped = false; inst.mods = [];
  if (k === 'unit') {
    inst.sick = true;
    const h = clockHour();
    inst.fast = (d.keywords || []).includes('Nostalgia Line') && h >= 16 && h < 22;
    if ((d.keywords || []).includes('Slow Start')) inst.tapped = true;
    p.battle.push(inst);
    log(s, `${p.name} plays ${d.name}${inst.fast ? ' (Nostalgia Line active!)' : ''}.`);
    runEffects(s, pi, inst, playEffects(d, modes), target);
    for (const src of [p.legend, ...p.gear, ...p.battle]) if (src !== inst) fire(s, pi, src, 'unitPlayed', inst);
  } else if (k === 'gear') {
    if (p.gear.length >= RULES.GEAR_SLOTS) {
      const old = p.gear.shift();
      p.graveyard.push(old);
      log(s, `${nm(old)} expires (no free Gear slot).`);
    }
    p.gear.push(inst);
    log(s, `${p.name} equips ${d.name}.`);
    runEffects(s, pi, inst, playEffects(d, modes), target);
  } else {
    log(s, `${p.name} casts ${d.name}${target && findInst(s, target) ? ' → ' + nm(findInst(s, target).inst) : ''}.`);
    fireAll(s, pi, 'spellCast');
    runTwiceIfDoubled(s, pi, inst, playEffects(d, modes), target);
    finishSpell(p, inst, modes);
  }
}

function finishSpell(p, inst, modes) {
  const d = getDef(inst.id);
  const after = (modes || []).map(i => d.modes?.[i]?.afterCast).find(Boolean) || d.afterCast;
  if (after === 'deckTop') p.deck.unshift(inst);
  else if (after === 'banish') { /* removed from the game */ }
  else p.graveyard.push(inst);
}

function effectsOn(d, trigger) { return (d.effects || []).filter(e => (e.on || 'play') === trigger); }

function fire(s, pi, src, trigger, subject) {
  const d = getDef(src.id);
  let effs = effectsOn(d, trigger).filter(e => !SINGLE_TARGETS.has(e.target));
  effs = effs.filter(e => !(e.ifSubjectMighty && !(subject && isMighty(s, subject))));
  if (effs.some(e => e.tapSource)) {
    if (src.tapped) return;
    src.tapped = true; // "you may exhaust me"
  }
  if (!effs.length) return;
  runEffects(s, pi, src, effs, null, subject);
  consumeUse(s, pi, src);
}
function fireAll(s, pi, trigger) {
  const p = s.players[pi];
  for (const src of [p.legend, ...p.gear, ...p.battle]) fire(s, pi, src, trigger);
}

function consumeUse(s, pi, src) {
  if (src.uses == null) return;
  const p = s.players[pi];
  if (!p.gear.includes(src)) return;
  src.uses--;
  if (src.uses <= 0) {
    p.gear.splice(p.gear.indexOf(src), 1);
    p.graveyard.push(src);
    log(s, `${nm(src)} is used up.`);
  }
}

function doActivate(s, pi, a) {
  const p = s.players[pi];
  const g = p.gear.find(x => x.uid === a.uid) || p.battle.find(x => x.uid === a.uid);
  const d = getDef(g.id);
  payCost(s, p, d.activateCost || 0, null);
  if (d.activateNoTap) g.activatedTurn = s.turn; else g.tapped = true;
  log(s, `${p.name} activates ${d.name}.`);
  runTwiceIfDoubled(s, pi, g, effectsOn(d, 'activate'), a.target);
  consumeUse(s, pi, g);
}

// -------------------------------------------------------------- effects ----
function runEffects(s, pi, source, effects, targetUid, subject) {
  for (const e of effects) {
    if (s.winner != null) return;
    applyEffect(s, pi, source, e, targetUid, subject);
  }
}

function applyEffect(s, pi, source, e, targetUid, subject) {
  const me = s.players[pi], op = s.players[other(pi)];
  const n = e.amount ?? 1;
  if (e.ifInPlay && !me.battle.some(u => getDef(u.id).name.toLowerCase().includes(e.ifInPlay.toLowerCase()))) return;
  let targets = resolveTargets(s, pi, source, e, targetUid, subject).filter(u => matchFilter(u, e.filter));
  const okPower = (u) => (e.maxPower == null || power(s, u) <= e.maxPower) && (e.minPower == null || power(s, u) >= e.minPower);
  if (e.limit) targets = targets.filter(okPower).sort((a, b) => power(s, b) - power(s, a)).slice(0, e.limit);
  const until = (u) => (e.duration === 'permanent' ? {} : e.duration === 'nextTurn' ? { untilTurn: s.turn + 2 } : { until: 'eot' });
  switch (e.do) {
    case 'draw': for (let i = 0; i < n; i++) drawCard(s, e.who === 'opponent' ? op.idx : pi); break;
    case 'destroy':
      if (e.target === 'enemyGear') { for (const g of targets) destroyGear(s, g); break; }
      for (const u of targets) if (okPower(u)) destroyUnit(s, u);
      break;
    case 'buff':
      for (const u of targets) if (okPower(u)) u.mods.push({ power: n, ...until(u) });
      break;
    case 'grantKeyword':
      for (const u of targets) u.mods.push({ keyword: e.keyword, ...until(u) });
      break;
    case 'ready':
      for (const u of targets) if (okPower(u)) { u.tapped = false; u.sick = false; }
      break;
    case 'morph':
      for (const u of targets) { u.morph = e.power ?? 1; u.mods = u.mods.filter(m => !m.power); log(s, `${nm(u)} turns into a Sheep (${u.morph} Might).`); }
      break;
    case 'sacrificeSelf':
      if (source && me.gear.includes(source)) destroyGear(s, source);
      else if (source && me.battle.includes(source)) destroyUnit(s, source);
      break;
    case 'breakOwnShield':
      for (let i = 0; i < n && me.shields.length; i++) me.hand.push(me.shields.shift());
      log(s, `${me.name} breaks their own shield.`);
      break;
    case 'lockShields':
      me.shieldLockUntil = s.turn + 2;
      log(s, `${me.name}'s shields are unbreakable until their next turn.`);
      break;
    case 'sealTriggers':
      op.triggersSealedUntil = s.turn + 2;
      log(s, `${op.name}'s Shield Triggers are sealed until ${me.name}'s next turn.`);
      break;
    case 'doubleNext':
      me.doubleNext = true;
      break;
    case 'counter': {
      for (let i = s.stack.length - 1; i >= 0; i--) {
        const it = s.stack[i];
        const cd = getDef(it.inst.id);
        if (it.controller === pi || cd.cost > (e.maxCost ?? 99)) continue;
        s.stack.splice(i, 1);
        s.players[it.controller].graveyard.push(it.inst);
        log(s, `${cd.name} is countered.`);
        break;
      }
      break;
    }
    case 'splitDestroy': {
      let budget = n;
      for (const u of [...op.battle].sort((a, b) => power(s, b) - power(s, a))) {
        const pw = Math.max(0, power(s, u));
        if (pw <= budget) { budget -= pw; destroyUnit(s, u); }
      }
      break;
    }
    case 'summonNamed': {
      const zones = e.from || ['hand', 'deck', 'graveyard'];
      let found = null, zone = null;
      for (const z of zones) {
        found = me[z].find(c => getDef(c.id).name.toLowerCase().includes(e.name.toLowerCase()));
        if (found) { zone = z; break; }
      }
      if (!found) { log(s, `No ${e.name} to summon.`); break; }
      me[zone].splice(me[zone].indexOf(found), 1);
      putIntoPlay(s, pi, found, null);
      if (e.ready) { found.sick = false; found.tapped = false; }
      break;
    }
    case 'tap': for (const u of targets) if (okPower(u)) u.tapped = true; break;
    case 'untap': for (const u of targets) u.tapped = false; break;
    case 'bounce':
      for (const u of targets) if (okPower(u)) {
        const owner = s.players[u.owner];
        owner.battle.splice(owner.battle.indexOf(u), 1);
        resetInst(u);
        if (!getDef(u.id).token) owner.hand.push(u);
        log(s, `${nm(u)} returns to ${owner.name}'s hand.`);
      }
      break;
    case 'breakShield': breakShields(s, op.idx, n); break;
    case 'addShield':
      for (let i = 0; i < n && me.deck.length; i++) me.shields.push(me.deck.shift());
      log(s, `${me.name} adds ${n} shield${n > 1 ? 's' : ''}.`);
      break;
    case 'shieldify': s.queue.push({ kind: 'shieldify', player: pi, remaining: n }); break;
    case 'channel': channel(s, me, n, !!e.tapped); break;
    case 'discard':
      for (let i = 0; i < n && op.hand.length; i++) {
        const c = op.hand.splice(Math.floor(rand(s) * op.hand.length), 1)[0];
        op.graveyard.push(c);
        log(s, `${op.name} discards ${nm(c)}.`);
      }
      break;
    case 'recover': {
      const i = me.graveyard.map(c => kindOf(getDef(c.id))).lastIndexOf('unit');
      if (i >= 0) { const c = me.graveyard.splice(i, 1)[0]; me.hand.push(c); log(s, `${me.name} recovers ${nm(c)}.`); }
      break;
    }
    case 'tutor': {
      const kind = e.kind || 'unit';
      const ok = (c) => kindOf(getDef(c.id)) === kind && (!e.name || getDef(c.id).name.toLowerCase().includes(e.name.toLowerCase()));
      const zone = (e.from || ['deck']).find(z => me[z].some(ok));
      if (!zone) { log(s, `${me.name} searches but finds nothing.`); break; }
      const pool = me[zone].filter(ok).sort((a, b) => getDef(b.id).cost - getDef(a.id).cost);
      const c = pool[0];
      me[zone].splice(me[zone].indexOf(c), 1);
      me.hand.push(c);
      shuffle(s, me.deck);
      log(s, `${me.name} searches their deck and takes ${nm(c)}.`);
      break;
    }
    case 'token':
      for (let i = 0; i < n; i++) {
        const t = mk(s, e.tokenId, pi);
        t.sick = true;
        me.battle.push(t);
        log(s, `${me.name} creates ${nm(t)}.`);
      }
      break;
  }
}

function resetInst(u) { u.tapped = false; u.sick = false; u.mods = []; u.fast = false; delete u.morph; delete u.escaped; }

function destroyUnit(s, u) {
  const owner = s.players[u.owner];
  const i = owner.battle.indexOf(u);
  if (i < 0) return;
  if (getDef(u.id).escapeOnce && !u.escaped) {
    u.escaped = true;
    u.mods.push({ power: 1 });
    log(s, `${nm(u)} escapes from hell and gains +1 Might!`);
    return;
  }
  owner.battle.splice(i, 1);
  resetInst(u);
  const d = getDef(u.id);
  if (!d.token) owner.graveyard.push(u);
  log(s, `${d.name} is destroyed.`);
  runEffects(s, owner.idx, u, effectsOn(d, 'destroyed').filter(e => !SINGLE_TARGETS.has(e.target)));
}

function destroyGear(s, g) {
  const owner = s.players[g.owner];
  const i = owner.gear.indexOf(g);
  if (i < 0) return;
  owner.gear.splice(i, 1);
  owner.graveyard.push(g);
  log(s, `${nm(g)} is destroyed.`);
}

function breakShields(s, defIdx, n) {
  const p = s.players[defIdx];
  if (p.shieldLockUntil > s.turn) { log(s, `${p.name}'s shields are unbreakable!`); return; }
  for (let i = 0; i < n && p.shields.length; i++) {
    const sh = p.shields.shift();
    p.hand.push(sh);
    const d = getDef(sh.id);
    log(s, `${p.name}'s shield breaks (${p.shields.length} left).`);
    if (p.triggersSealedUntil > s.turn) continue;
    if ((d.keywords || []).includes('Shield Trigger')) s.queue.push({ kind: 'shieldTrigger', player: defIdx, uid: sh.uid });
  }
}

function doShieldTrigger(s, pi, a) {
  const q = s.queue.shift();
  if (a.use) {
    const p = s.players[pi];
    const inst = p.hand.find(c => c.uid === q.uid);
    if (inst) {
      p.hand.splice(p.hand.indexOf(inst), 1);
      log(s, `Shield Trigger! ${p.name} plays ${nm(inst)} for free.`);
      putIntoPlay(s, pi, inst, a.target, a.modes);
    }
  }
  nextFromQueue(s);
}

function doShieldify(s, pi, a) {
  const q = s.queue[0];
  const p = s.players[pi];
  const i = p.hand.findIndex(c => c.uid === a.uid);
  p.shields.push(p.hand.splice(i, 1)[0]);
  log(s, `${p.name} puts a card from hand into their Shield Zone.`);
  q.remaining--;
  if (q.remaining <= 0 || !p.hand.length) { s.queue.shift(); nextFromQueue(s); }
}

// --------------------------------------------------------------- combat ----
function doAttack(s, pi, a) {
  const me = s.players[pi], op = s.players[other(pi)];
  const att = me.battle.find(u => u.uid === a.uid);
  att.tapped = true;
  const tName = a.target.kind === 'unit' ? nm(op.battle.find(u => u.uid === a.target.uid))
    : a.target.kind === 'shield' ? 'a shield' : `${op.name} directly`;
  log(s, `${nm(att)} attacks ${tName}!`);
  s.combat = { attacker: att.uid, attackerOwner: pi, target: { ...a.target }, blockedBy: null };
  fire(s, pi, att, 'attack');
  for (const u of [...op.battle]) fire(s, op.idx, u, 'enemyAttack');
  if (s.winner != null) return;
  s.pending = blockers(s, op.idx).length ? { kind: 'block', player: op.idx } : { kind: 'priority', player: op.idx, passes: 0 };
}

function doBlock(s, pi, a) {
  if (a.type === 'block') {
    const b = s.players[pi].battle.find(u => u.uid === a.uid);
    b.tapped = true;
    s.combat.target = { kind: 'unit', uid: b.uid };
    s.combat.blockedBy = b.uid;
    log(s, `${nm(b)} defends!`);
  }
  s.pending = { kind: 'priority', player: pi, passes: 0 };
}

function doPass(s, pd) {
  pd.passes++;
  if (pd.passes < 2) { pd.player = other(pd.player); return; }
  if (s.stack.length) {
    const it = s.stack.pop();
    const d = getDef(it.inst.id);
    log(s, `${d.name} resolves.`);
    const modes = resolveModes(s, it.controller, d, it.modes);
    runTwiceIfDoubled(s, it.controller, it.inst, playEffects(d, modes), it.target);
    finishSpell(s.players[it.controller], it.inst, modes);
    pd.passes = 0;
    pd.player = s.combat ? other(s.combat.attackerOwner) : other(s.active);
    return;
  }
  s.pending = null;
  resolveCombat(s);
}

function resolveCombat(s) {
  const c = s.combat;
  s.combat = null;
  if (!c) return;
  const A = s.players[c.attackerOwner], D = s.players[other(c.attackerOwner)];
  const att = A.battle.find(u => u.uid === c.attacker);
  if (!att) { log(s, 'The attack fizzles.'); return; }
  if (c.target.kind === 'unit') {
    const def = D.battle.find(u => u.uid === c.target.uid);
    if (!def) { log(s, 'The attack fizzles (target gone).'); return; }
    const ap = power(s, att) + (getDef(att.id).attackBonus || 0);
    const dp = power(s, def) + (getDef(def.id).defendBonus || 0);
    log(s, `Fight: ${nm(att)} (${ap}) vs ${nm(def)} (${dp}).`);
    const kill = new Set();
    if (ap >= dp) kill.add(def);
    if (dp >= ap) kill.add(att);
    // Deathtouch: losing unit takes the winner with it
    if (ap > dp && hasKeyword(s, def, 'Deathtouch')) kill.add(att);
    if (dp > ap && hasKeyword(s, att, 'Deathtouch')) kill.add(def);
    for (const u of kill) {
      const roll = getDef(u.id).surviveRoll;
      if (roll) {
        const d6 = 1 + Math.floor(rand(s) * 6);
        log(s, `${nm(u)} rolls a D6: ${d6}${d6 >= roll ? ' — survives!' : '.'}`);
        if (d6 >= roll) continue;
      }
      destroyUnit(s, u);
    }
    return;
  }
  if (c.target.kind === 'player' && D.shields.length === 0) {
    setWinner(s, A.idx, `${nm(att)} lands the direct attack.`);
    return;
  }
  if (D.shields.length) breakShields(s, D.idx, hasKeyword(s, att, 'Breaker') ? 2 : 1);
}
