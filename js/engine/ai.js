// Heuristic AI: one-ply look-ahead. Each candidate action is simulated on a
// cloned state (opponent responses use quick heuristics), then scored.
import { legalActions, step, whoActs, power, other, hasKeyword } from './game.js';
import { getDef, kindOf } from './cards.js';

const WIN = 10000;

export function score(s, pi) {
  if (s.winner === pi) return WIN;
  if (s.winner === other(pi)) return -WIN;
  return side(s, pi) - side(s, other(pi));
}

function side(s, pi) {
  const p = s.players[pi], op = s.players[other(pi)];
  let v = 0;
  v += p.shields.length * 4 + (p.shields.length === 0 ? -6 : 0);
  v += p.hand.length * 1.2;
  v += p.mana.length * 0.4;
  v += p.gear.reduce((a, g) => a + 2 + (g.uses ?? 2) * 0.3, 0);
  if (p.championSlot) v += 1.5;
  if (p.signatureSlot) v += 1.5;
  const oppBest = Math.max(0, ...op.battle.map(u => power(s, u, { ignoreTemp: true })));
  for (const u of p.battle) {
    const pw = Math.max(0, power(s, u, { ignoreTemp: true }));
    v += 1 + pw * 1.1;
    if (hasKeyword(s, u, 'Defensive') && !u.tapped) v += 0.8;
    // tapped units can be attacked on the opponent's turn
    if (u.tapped && oppBest >= pw) v -= pw * (s.active === pi ? 0.6 : 0.9);
  }
  return v;
}

/** Pick a response quickly without look-ahead (used inside simulations). */
function quickResponse(s, pi) {
  const acts = legalActions(s, pi);
  const pd = s.pending;
  if (!pd) return { type: 'endPhase' };
  if (pd.kind === 'block') return heuristicBlock(s, pi, acts);
  if (pd.kind === 'priority') return { type: 'pass' };
  if (pd.kind === 'shieldTrigger') return acts.find(a => a.use) || acts[0];
  if (pd.kind === 'shieldify') return cheapestHand(s, pi, acts);
  if (pd.kind === 'mulligan') return { type: 'mulligan', uids: [] };
  return acts[0];
}

function heuristicBlock(s, pi, acts) {
  const c = s.combat;
  const att = s.players[c.attackerOwner].battle.find(u => u.uid === c.attacker);
  const ap = att ? power(s, att) : 0;
  const me = s.players[pi];
  const options = acts.filter(a => a.type === 'block').map(a => ({ a, u: me.battle.find(u => u.uid === a.uid) }));
  if (!options.length) return { type: 'noBlock' };
  options.sort((x, y) => power(s, x.u) - power(s, y.u));
  const lethal = c.target.kind === 'player' && me.shields.length === 0;
  const winner = options.find(o => power(s, o.u) > ap);
  if (winner) return winner.a;
  if (lethal) return options[options.length - 1].a;
  const trade = options.find(o => power(s, o.u) === ap);
  if (trade && me.shields.length <= 2) return trade.a;
  return { type: 'noBlock' };
}

function cheapestHand(s, pi, acts) {
  const p = s.players[pi];
  let best = acts[0], bv = Infinity;
  for (const a of acts) {
    const c = p.hand.find(x => x.uid === a.uid);
    const d = getDef(c.id);
    const v = (d.keywords.includes('Shield Trigger') ? -5 : 0) + d.cost;
    if (v < bv) { bv = v; best = a; }
  }
  return best;
}

/** Apply `a`, then let quick responses play out until it is pi's free turn again. */
export function simulate(s, pi, a) {
  const c = structuredClone(s);
  try {
    if (a) step(c, a);
    for (let g = 0; g < 40 && c.winner == null && c.pending; g++) {
      const who = whoActs(c);
      if (who === pi && c.pending.kind === 'priority') { step(c, { type: 'pass' }); continue; }
      step(c, quickResponse(c, who));
    }
  } catch (e) {
    return null;
  }
  return c;
}

function cardValuePenalty(s, pi, a) {
  // playing a card spends it; spells cost a bit of "card value"
  if (a.type !== 'play') return 0;
  const p = s.players[pi];
  const inst = [...p.hand, p.championSlot, p.signatureSlot].find(c => c && c.uid === a.uid);
  if (!inst) return 0;
  const d = getDef(inst.id);
  if (kindOf(d) === 'spell') return 0.3;
  return 0;
}

export function chooseAction(s, pi) {
  const acts = legalActions(s, pi);
  if (!acts.length) return null;
  const pd = s.pending;
  if (pd && pd.kind === 'mulligan') {
    const hand = s.players[pi].hand.map(c => ({ uid: c.uid, cost: getDef(c.id).cost })).sort((a, b) => b.cost - a.cost);
    return { type: 'mulligan', uids: hand.filter(h => h.cost >= 5).slice(0, 2).map(h => h.uid) };
  }
  if (pd && pd.kind === 'shieldify') return cheapestHand(s, pi, acts);

  // Baseline = doing nothing (pass / no block / skip / end phase).
  const baseline = pd ? (pd.kind === 'priority' ? { type: 'pass' } : pd.kind === 'block' ? { type: 'noBlock' } : acts[0]) : null;
  const baseState = baseline ? simulate(s, pi, baseline) : s;
  let bestA = baseline || { type: 'endPhase' };
  let bestV = baseState ? score(baseState, pi) : -Infinity;
  const margin = pd ? 0.2 : 0.35;

  for (const a of acts) {
    if (a === baseline || a.type === 'endPhase' || a.type === 'pass' || a.type === 'noBlock') continue;
    if (a.type === 'shieldTrigger' && !a.use) continue;
    const ns = simulate(s, pi, a);
    if (!ns) continue;
    const v = score(ns, pi) - cardValuePenalty(s, pi, a);
    if (v > bestV + margin) { bestV = v; bestA = a; }
  }
  // Shield triggers are free: use them unless clearly bad.
  if (pd && pd.kind === 'shieldTrigger' && bestA.use === false) {
    const use = acts.find(a => a.use);
    if (use) {
      const ns = simulate(s, pi, use);
      if (ns && score(ns, pi) >= score(baseState, pi) - 0.5) return use;
    }
  }
  return bestA;
}
