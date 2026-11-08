// Targeted checks for individual card mechanics (scripted board states).
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { createGame, step, legalActions, power, setClock, hasKeyword, effectiveCost } from '../js/engine/game.js';
const hasKw = (s, u, k) => hasKeyword(s, u, k);
import { getDef } from '../js/engine/cards.js';

const { decks } = loadData();
setClock(() => 10);
// Lui's deck: its Legend has no automatic triggers that would interfere with scripted states
const deck = decks.find(d => d.id === 'ogn-lui');

function fresh() {
  const s = createGame({ decks: [deck, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
  step(s, { type: 'mulligan', uids: [] });
  step(s, { type: 'mulligan', uids: [] });
  for (const p of s.players) {
    p.hand = []; p.battle = []; p.gear = [];
    p.mana = Array.from({ length: 12 }, (_, i) => ({ uid: `r${p.idx}-${i}`, color: ['Fury', 'Calm', 'Mind', 'Order', 'Chaos', 'Body'][i % 6], tapped: false }));
  }
  return s;
}
let n = 0;
const card = (s, pi, id, zone = 'hand') => {
  const c = { uid: `t${++n}`, id, owner: pi, tapped: false, sick: false, mods: [], uses: getDef(id).uses ?? null, fast: false };
  s.players[pi][zone].push(c);
  return c;
};
const play = (s, uid, extra = {}) => step(s, { type: 'play', uid, ...extra });
const tests = {
  'Limits: at most 12 cards in hand (a broken Shield is burned) and 12 Units on the Battlefield'() {
    const s = fresh(); const p = s.players[0];
    for (let i = 0; i < 12; i++) card(s, 0, 'OGN-016');          // full hand
    for (let i = 0; i < 12; i++) card(s, 0, 'OGN-016', 'battle'); // full Battlefield
    s.active = 0; s.phase = 'play';
    assert(!legalActions(s, 0).some(a => a.type === 'play' && p.hand.some(h => h.uid === a.uid)), 'no Unit can be played onto a full Battlefield');
    // the opponent breaks a Shield while the hand is full: it goes to the Graveyard
    s.active = 1; s.phase = 'combat';
    const att = card(s, 1, 'OGN-181', 'battle');
    const sh = p.shields[0];
    step(s, { type: 'attack', uid: att.uid, target: { kind: 'shield' } });
    for (let i = 0; i < 20 && s.pending && ['priority', 'block'].includes(s.pending.kind); i++) step(s, { type: s.pending.kind === 'block' ? 'noBlock' : 'pass' });
    assert.equal(p.hand.length, 12, 'hand stays at 12');
    assert(p.graveyard.some(c => c.uid === sh.uid), 'the broken Shield is burned');
  },

  'The Dealmaker: opponent draws 1; next turn, if they hold more cards, their strongest Unit is destroyed'() {
    const s = fresh();
    const p = s.players[0], op = s.players[1];
    const dm = card(s, 0, 'OGN-183', 'battle');
    const big = card(s, 1, 'OGN-181', 'battle'), small = card(s, 1, 'OGN-016', 'battle');
    const before = op.hand.length;
    step(s, legalActions(s, 0).find(a => a.type === 'activate' && a.uid === dm.uid));
    assert.equal(op.hand.length, before + 1, 'opponent draws');
    assert.equal(p.contracts.length, 1);
    p.hand = []; op.hand = []; card(s, 1, 'OGN-016'); card(s, 1, 'OGN-016'); // they hold 2, I hold 0
    // the opponent's turn ends -> the start of my next turn: the bill comes due
    s.active = 1; s.phase = 'end'; s.pending = null;
    step(s, legalActions(s, 1).find(a => a.type === 'endPhase') || { type: 'endPhase' });
    assert(!op.battle.includes(big), 'strongest Unit collected');
    assert(op.battle.includes(small));
    assert.equal(p.contracts.length, 0);
    assert(s.events.some(e => e.type === 'contractCollected' && e.player === 0));
  },
  'Aspect of REDACTED: Side Channel turns a Shield face up, Exploit swaps it with a hand card (stolen Shield Trigger plays free)'() {
    const laci = decks.find(d => d.id === 'ogn-laci');
    const s = createGame({ decks: [laci, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const p = s.players[0], op = s.players[1]; p.hand = []; p.battle = []; op.battle = [];
    p.mana = Array.from({ length: 6 }, (_, i) => ({ uid: 'h' + i, color: i % 2 ? 'Fury' : 'Chaos', tapped: false }));
    op.shields[0] = { uid: 'st', id: 'OGN-179', owner: 1, tapped: false, sick: false, mods: [], uses: null }; // Lui's Forge: Shield Trigger
    const legendActs = () => legalActions(s, 0).filter(a => a.type === 'activate' && a.uid === p.legend.uid);
    assert(!legendActs().some(a => a.modes[0] === 1), 'no Exploit without a face-up Shield / hand card');
    step(s, legendActs().find(a => a.modes[0] === 0 && a.target === 'st'));       // Side Channel
    assert(op.shields[0].faceUp, 'turned face up');
    assert(p.legend.tapped);
    p.legend.tapped = false;
    const mine = card(s, 0, 'OGN-016');
    const runes = p.mana.filter(r => !r.tapped).length;
    step(s, legendActs().find(a => a.modes[0] === 1 && a.target === 'st'));       // Exploit (2)
    assert.equal(p.mana.filter(r => !r.tapped).length, runes - 2, 'Exploit costs 2');
    assert.equal(s.pending.kind, 'exploitSwap');
    step(s, { type: 'exploitSwap', uid: mine.uid });
    assert.equal(op.shields[0].uid, mine.uid, 'my card is planted');
    assert.equal(op.shields[0].owner, 1); assert(!op.shields[0].faceUp, 'planted face down');
    assert.equal(s.pending.kind, 'shieldTrigger', 'stolen Shield Trigger may be played');
    step(s, legalActions(s, 0).find(a => a.use));
    assert(p.gear.some(g => g.uid === 'st'), 'Lui\'s Forge played for free by Laci');
    assert.equal(p.gear.find(g => g.uid === 'st').owner, 0);
  },
  'Aspect of Foundation: [1][T] creates a Pawn, then promotes Pawn -> Knight/Bishop/Rook -> Queen/King'() {
    const kozi = decks.find(d => d.id === 'ogn-kozi');
    const s = createGame({ decks: [kozi, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const p = s.players[0]; p.hand = []; p.battle = [];
    p.mana = Array.from({ length: 6 }, (_, i) => ({ uid: 'k' + i, color: i % 2 ? 'Mind' : 'Chaos', tapped: false }));
    const legendActs = () => legalActions(s, 0).filter(a => a.type === 'activate' && a.uid === p.legend.uid);
    const L = getDef(p.legend.id);
    // no Chess token: create a 1-Might Pawn
    assert.equal(legendActs().length, 1); step(s, legendActs()[0]);
    assert.equal(p.battle.length, 1); assert.equal(getDef(p.battle[0].id).name, 'Pawn'); assert(p.battle[0].sick);
    assert(p.legend.tapped);
    // next turn: Pawn -> Knight / Bishop / Rook
    p.legend.tapped = false;
    const opts = legendActs().map(a => L.modes[a.modes[0]].to);
    assert.deepEqual(opts.sort(), ['TKN-008', 'TKN-009', 'TKN-010']);
    step(s, legendActs().find(a => L.modes[a.modes[0]].to === 'TKN-010'));
    assert.equal(getDef(p.battle[0].id).name, 'Rook'); assert(p.battle[0].sick, 'summoning sickness applied');
    // Rook -> Queen / King; royals can't promote further
    p.legend.tapped = false;
    step(s, legendActs().find(a => L.modes[a.modes[0]].to === 'TKN-011'));
    assert.equal(getDef(p.battle[0].id).name, 'Queen');
    p.legend.tapped = false;
    assert.equal(legendActs().length, 0, 'a Queen cannot be promoted, and a Chess token exists so no new Pawn');
    // the Pawns from "Make the first move" are Chess tokens too
    const wp = card(s, 0, 'TKN-002', 'battle');
    assert(legendActs().some(a => a.target === wp.uid));
  },
  'Aspect of Excessive Detail: Lazy Evaluation stores spells as Thunks, Force resolves them (+1 card for exactly 3)'() {
    const domi = decks.find(d => d.id === 'ogn-domi');
    const s = createGame({ decks: [domi, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const p = s.players[0], op = s.players[1]; p.hand = []; p.battle = []; op.battle = [];
    p.mana = Array.from({ length: 12 }, (_, i) => ({ uid: 'd' + i, color: i % 2 ? 'Mind' : 'Calm', tapped: false }));
    const cast = (id, extra = {}) => { const c = card(s, 0, id); step(s, legalActions(s, 0).find(a => a.type === 'play' && a.uid === c.uid && (!extra.target || a.target === extra.target))); return c; };
    for (const id of ['OGN-145', 'OGN-151', 'OGN-137']) cast(id);       // three Draw 1 spells
    assert.equal(p.hand.length, 0, 'nothing resolved yet');
    assert.equal(p.thunks.length, 3);
    cast('OGN-057');                                                       // 4th spell: no room, resolves now
    assert.equal(p.thunks.length, 3);
    const enemy = card(s, 1, 'OGN-016', 'battle');
    cast('OGN-060', { target: enemy.uid });                                // Reaction: never a Thunk
    assert(!op.battle.includes(enemy), 'Reaction resolved at once');
    const before = p.hand.length;
    step(s, legalActions(s, 0).find(a => a.type === 'activate' && a.uid === p.legend.uid)); // Force
    assert.equal(p.thunks.length, 0);
    assert.equal(p.hand.length, before + 3 + 1, '3 draws + memoization');
    assert(p.graveyard.some(c => c.id === 'OGN-145'), 'forced spells go to the Graveyard');
    assert(!legalActions(s, 0).some(a => a.type === 'activate' && a.uid === p.legend.uid), 'no Force without Thunks');
  },
  'Aspect of Lore: Movie + Game played this turn channels 2 runes, once per turn'() {
    const chris = decks.find(d => d.id === 'ogn-chris');
    const s = createGame({ decks: [chris, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const p = s.players[0]; p.hand = []; p.battle = [];
    p.mana = Array.from({ length: 10 }, (_, i) => ({ uid: 'c' + i, color: 'Order', tapped: false }));
    card(s, 0, 'OGN-016', 'battle'); // a Unit for The Law to target
    // mana after a play = before - its Recycle (+2 when the combo fires)
    const playAndDelta = (id) => {
      const m = p.mana.length;
      const c = card(s, 0, id);
      step(s, legalActions(s, 0).find(a => a.type === 'play' && a.uid === c.uid));
      while (s.pending?.kind === 'pick') step(s, { type: 'pick', uids: [] });
      return p.mana.length - m + (getDef(id).recycle || 0);
    };
    assert.equal(playAndDelta('OGN-174'), 0, 'Game alone: nothing');      // Amateur Dungeon Master
    assert.equal(playAndDelta('OGN-173'), 2, 'Movie + Game: channel 2');  // Movie Night at Chris
    assert.equal(playAndDelta('OGN-171'), 0, 'only once per turn');       // The Law
  },
  'Aspect of Kindness: [T] next Cat or Train card this turn costs 1 less'() {
    const bea = decks.find(d => d.id === 'ogn-bea');
    const s = createGame({ decks: [bea, deck], ai: [false, false], seed: 7, firstPlayer: 0 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const p = s.players[0]; p.hand = []; p.battle = [];
    p.mana = Array.from({ length: 6 }, (_, i) => ({ uid: 'b' + i, color: i % 2 ? 'Calm' : 'Chaos', tapped: false }));
    const def = getDef('OGN-108'), keep = def.tribes; // Disappointed Cat (no Cat tag yet)
    try {
      def.tribes = ['Cat'];
      const c = card(s, 0, 'OGN-108'), other = getDef('OGN-001');
      const before = effectiveCost(s, 0, def);
      step(s, legalActions(s, 0).find(a => a.type === 'activate' && a.uid === p.legend.uid));
      assert.equal(effectiveCost(s, 0, def), Math.max(0, before - 1), 'Cat card is 1 cheaper');
      assert.equal(effectiveCost(s, 0, other), other.cost, 'other cards are not');
      s.turn++;
      assert.equal(effectiveCost(s, 0, def), before, 'only this turn');
      s.turn--;
      play(s, c.uid);
      assert.equal(p.nextDiscount, null, 'used up by the first Cat card');
    } finally { def.tribes = keep; }
  },
  'Aspect of Science: Seizure at 1 shield banishes the Field, then [T] Shieldify 1'() {
    const anna = decks.find(d => d.id === 'ogn-anna');
    const s = createGame({ decks: [anna, deck], ai: [false, false], seed: 7, firstPlayer: 1 });
    step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
    const A = s.players[0], B = s.players[1];
    A.hand = []; A.battle = []; B.battle = []; B.hand = [];
    A.shields = A.shields.slice(0, 2);
    const mine = card(s, 0, 'OGN-016', 'battle');
    const att = card(s, 1, 'OGN-181', 'battle');
    assert(!legalActions(s, 0).length || !legalActions(s, 0).some(a => a.type === 'activate'), 'no Seizure yet');
    s.active = 1; s.phase = 'combat';
    step(s, { type: 'attack', uid: att.uid, target: { kind: 'shield' } });
    for (let i = 0; i < 20 && s.pending && ['priority', 'block'].includes(s.pending.kind); i++) step(s, { type: s.pending.kind === 'block' ? 'noBlock' : 'pass' });
    while (s.pending?.kind === 'shieldTrigger') step(s, legalActions(s, 0).find(a => !a.use) || legalActions(s, 0)[0]);
    assert.equal(A.shields.length, 1);
    assert(A.seizure, 'in Seizure');
    assert.equal(A.battle.length + B.battle.length, 0, 'the Field is banished');
    assert(!A.graveyard.some(c => c.uid === mine.uid), 'banished, not destroyed');
    // Anna's turn: tap the Legend to Shieldify 1
    s.active = 0; s.phase = 'play'; s.pending = null; A.legend.tapped = false;
    const c = card(s, 0, 'OGN-016');
    const act = legalActions(s, 0).find(a => a.type === 'activate' && a.uid === A.legend.uid);
    assert(act, 'Legend ability offered in Seizure');
    step(s, act);
    step(s, legalActions(s, 0).find(a => a.type === 'shieldify' && a.uid === c.uid));
    assert.equal(A.shields.length, 2);
    assert(A.legend.tapped);
  },
  "The ULTIMATE FLEX: you can't lose the game this turn"() {
    const s = fresh();
    const a1 = card(s, 1, 'OGN-181', 'battle'); const a2 = card(s, 1, 'OGN-181', 'battle');
    s.players[0].shields = [{ uid: 'flex', id: 'OGN-186', owner: 0, tapped: false, sick: false, mods: [], uses: null }];
    const passAll = () => { for (let i = 0; i < 20 && s.pending && ['priority', 'block'].includes(s.pending.kind); i++) step(s, { type: s.pending.kind === 'block' ? 'noBlock' : 'pass' }); };
    s.active = 1; s.phase = 'combat';
    step(s, { type: 'attack', uid: a1.uid, target: { kind: 'shield' } }); passAll();
    assert.equal(s.pending?.kind, 'shieldTrigger');
    step(s, legalActions(s, 0).find(a => a.use)); passAll();
    assert.equal(s.players[0].shields.length, 0);
    step(s, { type: 'attack', uid: a2.uid, target: { kind: 'player' } }); passAll();
    assert.equal(s.winner, null, 'the direct attack must not win this turn');
    assert(s.log.some(l => l.includes("can't lose the game this turn")));
  },
  'Recycle puts runes on the bottom of the Mana Deck'() {
    const s = fresh(); const c = card(s, 0, 'OGN-002'); // Villamos, recycle 1
    const before = s.players[0].mana.length;
    play(s, c.uid);
    assert.equal(s.players[0].mana.length, before - 1);
  },
  'Zselmó escapes death once'() {
    const s = fresh(); const z = card(s, 0, 'OGN-009', 'battle');
    const f = card(s, 1, 'OGN-022'); // Ahsoka: destroy might<=2
    s.active = 1;
    play(s, f.uid, { target: z.uid });
    assert(s.players[0].battle.includes(z), 'survived');
    assert.equal(power(s, z), 3);
  },
  'Make the first move offers both pawns'() {
    const s = fresh(); const c = card(s, 0, 'OGN-007');
    const opts = legalActions(s, 0).filter(a => a.uid === c.uid);
    assert.equal(opts.length, 2);
    play(s, c.uid, { modes: [1] });
    assert.equal(getDef(s.players[0].battle[0].id).name, 'Black Pawn');
  },
  'Cowtrix chooses 2 of 3 modes'() {
    const s = fresh(); const c = card(s, 0, 'OGN-172');
    assert.equal(legalActions(s, 0).filter(a => a.uid === c.uid).length, 3);
    const m = s.players[0].mana.length;
    play(s, c.uid, { modes: [1, 2] });
    assert.equal(s.players[0].mana.length, m - 3 + 3); // recycled 3, channeled 3
  },
  'Promoting Agent II: Crescent morphs enemies into 1-Might sheep'() {
    const s = fresh(); card(s, 1, 'OGN-070', 'battle'); const c = card(s, 0, 'OGN-029');
    play(s, c.uid, { modes: [0] });
    assert.equal(power(s, s.players[1].battle[0]), 1);
  },
  'Promoting Agent II: Full locks shields and banishes itself'() {
    const s = fresh(); const c = card(s, 0, 'OGN-029');
    play(s, c.uid, { modes: [2] });
    assert(!s.players[0].graveyard.includes(c));
    assert(s.players[0].shieldLockUntil > s.turn);
  },
  'Furious unit must attack'() {
    const s = fresh(); card(s, 0, 'OGN-025', 'battle');
    step(s, { type: 'endPhase' }); // to combat
    assert(!legalActions(s, 0).some(a => a.type === 'endPhase'));
  },
  'Immobile unit cannot attack'() {
    const s = fresh(); card(s, 0, 'OGN-016', 'battle');
    step(s, { type: 'endPhase' });
    assert(!legalActions(s, 0).some(a => a.type === 'attack'));
  },
  'Zsiráfluci gets +1 per shield'() {
    const s = fresh(); const z = card(s, 0, 'OGN-010', 'battle');
    assert.equal(power(s, z), 1 + s.players[0].shields.length);
  },
  'Magyar Péter costs 1 less per Fury+Calm pair'() {
    const s = fresh();
    const c = card(s, 0, 'OGN-020');
    // 12 runes, 2 Fury + 2 Calm -> 2 pairs -> 7 - 2 = 5 (+1 recycle)
    const before = s.players[0].mana.filter(r => !r.tapped).length;
    play(s, c.uid);
    const tapped = s.players[0].mana.filter(r => r.tapped).length;
    assert.equal(s.players[0].mana.length, 11);           // 1 rune recycled
    assert.equal(tapped + 1, 5);                          // 5 tapped, one of them then recycled
  },
  'GOLDEN seals Shield Triggers'() {
    const s = fresh(); const g = card(s, 0, 'OGN-177');
    play(s, g.uid);
    assert(s.players[1].triggersSealedUntil > s.turn);
  },
  'Hellyeah doubles the next spell'() {
    const s = fresh(); const h = card(s, 0, 'OGN-018'); const p = card(s, 0, 'OGN-187');
    play(s, h.uid);
    const hand = s.players[0].hand.length;
    play(s, p.uid);
    assert.equal(s.players[0].hand.length, hand - 1 + 4);
  },
  'Matyi Legend accepts Zsófi as Champion'() {
    const d = decks.find(x => x.owner === 'Matyi');
    assert.equal(getDef(d.champion).name, 'Zsófi');
  },
  'Captain Tingus buffs other units'() {
    const s = fresh(); const u = card(s, 0, 'TKN-002', 'battle'); card(s, 0, 'OGN-120', 'battle');
    assert.equal(power(s, u), 2);
  },
  '3D Printer X Forge 2: [T][3] summons a 5 Might Miniature token'() {
    const s = fresh(); const g = card(s, 0, 'OGN-189', 'gear');
    const runes = s.players[0].mana.filter(r => !r.tapped).length;
    step(s, { type: 'activate', uid: g.uid });
    const t = s.players[0].battle.find(u => u.id === 'TKN-004');
    assert(t && power(s, t) === 5 && t.sick);
    assert.equal(s.players[0].mana.filter(r => !r.tapped).length, runes - 3);
  },
  'Miniature Painter: Miniature tokens enter ready for 1 more rune'() {
    const s = fresh(); card(s, 0, 'OGN-188', 'battle'); const g = card(s, 0, 'OGN-189', 'gear');
    const runes = s.players[0].mana.filter(r => !r.tapped).length;
    step(s, { type: 'activate', uid: g.uid });
    const t = s.players[0].battle.find(u => u.id === 'TKN-004');
    assert(t && !t.sick, 'ready');
    assert.equal(s.players[0].mana.filter(r => !r.tapped).length, runes - 4);
  },
  'Manyika Dreadnought: Defensive, [T][2] Pouch token with Deathtouch'() {
    const s = fresh(); const m = card(s, 0, 'OGN-176', 'battle');
    assert(hasKw(s, m, 'Defensive') && !hasKw(s, m, 'Deathtouch'));
    step(s, { type: 'activate', uid: m.uid });
    const t = s.players[0].battle.find(u => u.id === 'TKN-005');
    assert(t && hasKw(s, t, 'Deathtouch'));
  },
  'Parody Alchemist: copies a non-Mighty enemy unit with Haste, copy dies at end of turn'() {
    const s = fresh(); const pa = card(s, 0, 'OGN-180', 'battle'); const big = card(s, 1, 'OGN-181', 'battle'); const small = card(s, 1, 'OGN-016', 'battle');
    const opts = legalActions(s, 0).filter(a => a.type === 'activate' && a.uid === pa.uid);
    assert(opts.some(a => a.target === small.uid) && !opts.some(a => a.target === big.uid), 'only non-Mighty targets');
    step(s, { type: 'activate', uid: pa.uid, target: small.uid });
    const copy = s.players[0].battle.find(u => u.id === 'OGN-016' && u.temp);
    assert(copy);
    step(s, { type: 'endPhase' }); step(s, { type: 'endPhase' });
    assert(!s.players[0].battle.includes(copy) && !s.players[0].graveyard.includes(copy));
  },
  'The Chronicler: other Art cards cost 1 this turn and are banished at end of turn'() {
    const s = fresh(); s.players[0].mana.forEach((r, i) => (r.color = i % 2 ? 'Order' : 'Fury'));
    const ch = card(s, 0, 'OGN-178'); const ar = card(s, 0, 'OGN-184');
    play(s, ch.uid);
    assert.equal(effectiveCost(s, 0, getDef('OGN-184')), 1, 'Aronverse costs 1');
    play(s, ar.uid);
    assert(s.log.some(l => l.includes('played for 1')));
    step(s, { type: 'endPhase' }); step(s, { type: 'endPhase' });
    assert(!s.players[0].battle.includes(ar) && !s.players[0].graveyard.includes(ar), 'banished');
    assert(s.players[0].battle.includes(ch), 'Chronicler itself stays');
  },

  'Aronverse of Madness: Defensive and can attack untapped units'() {
    const s = fresh(); const a = card(s, 0, 'OGN-184', 'battle'); const e = card(s, 1, 'OGN-016', 'battle');
    step(s, { type: 'endPhase' });
    assert(legalActions(s, 0).some(x => x.type === 'attack' && x.uid === a.uid && x.target.uid === e.uid));
    assert(hasKw(s, a, 'Defensive'));
  },
  'EPIC The Ithaca Saga: [T] your units get Vigilance this turn'() {
    const s = fresh(); const g = card(s, 0, 'OGN-185', 'gear'); const u = card(s, 0, 'OGN-016', 'battle');
    step(s, { type: 'activate', uid: g.uid });
    assert(hasKw(s, u, 'Vigilance'));
  },
  'Welcome to the Strawberry Club: taps enemies, next Fury card costs 3 less'() {
    const s = fresh(); const sc = card(s, 0, 'OGN-012'); const e = card(s, 1, 'OGN-016', 'battle'); const f = card(s, 0, 'OGN-181');
    play(s, sc.uid);
    assert(e.tapped);
    assert.equal(effectiveCost(s, 0, getDef('OGN-181')), 5);
    play(s, f.uid);
    assert.equal(effectiveCost(s, 0, getDef('OGN-181')), 8, 'discount used up');
  },
  "3D Printer - Lui's Forge: [T][1] summons a 1 Might Miniature; Army Box gives Miniatures +1"() {
    const s = fresh(); const g = card(s, 0, 'OGN-179', 'gear');
    step(s, { type: 'activate', uid: g.uid });
    const t = s.players[0].battle.find(u => u.id === 'TKN-003');
    assert(t && power(s, t) === 1);
    const box = card(s, 0, 'OGN-175'); const hand = s.players[0].hand.length;
    play(s, box.uid);
    assert.equal(s.players[0].hand.length, hand - 1 + 1, 'Army Box draws 1');
    assert.equal(power(s, t), 2);
  },
  'Amateur Dungeon Master: draw 1 when a Miniature dies'() {
    const s = fresh(); card(s, 0, 'OGN-174', 'battle'); const g = card(s, 0, 'OGN-179', 'gear');
    step(s, { type: 'activate', uid: g.uid });
    const t = s.players[0].battle.find(u => u.id === 'TKN-003');
    const hand = s.players[0].hand.length;
    s.active = 1; const k = card(s, 1, 'OGN-022'); play(s, k.uid, { target: t.uid });
    assert(!s.players[0].battle.includes(t));
    assert.equal(s.players[0].hand.length, hand + 1);
  },
  'The Law: +2 Might and Defensive only if it was the last card played'() {
    const s = fresh(); const u = card(s, 0, 'OGN-016', 'battle'); const law = card(s, 0, 'OGN-171');
    play(s, law.uid, { target: u.uid });
    step(s, { type: 'endPhase' }); step(s, { type: 'endPhase' });
    assert.equal(power(s, u), 5); assert(hasKw(s, u, 'Defensive'));
    const s2 = fresh(); const u2 = card(s2, 0, 'OGN-016', 'battle'); const law2 = card(s2, 0, 'OGN-171'); const other = card(s2, 0, 'TKN-002', 'hand');
    play(s2, law2.uid, { target: u2.uid });
    const sp = card(s2, 0, 'OGN-187'); play(s2, sp.uid);
    step(s2, { type: 'endPhase' }); step(s2, { type: 'endPhase' });
    assert.equal(power(s2, u2), 3, 'fizzled because another card was played after');
  },
  'Movie Night at Chris: draw 4, keep only Movie cards'() {
    const s = fresh(); const mn = card(s, 0, 'OGN-173');
    const p = s.players[0];
    p.deck = ['OGN-184', 'OGN-016', 'OGN-180', 'OGN-022', 'OGN-003'].map((id, i) => ({ uid: 'd' + i, id, owner: 0, tapped: false, sick: false, mods: [], uses: null }));
    play(s, mn.uid);
    assert.equal(s.pending.kind, 'pick', 'shows the 4 cards');
    assert.deepEqual(s.pending.uids.length, 4);
    const choosable = s.pending.choosable.map(uid => p.reveal.find(c => c.uid === uid).id).sort();
    assert.deepEqual(choosable, ['OGN-180', 'OGN-184'], 'only Movie cards can be picked');
    step(s, { type: 'pick', uids: [p.reveal.find(c => c.id === 'OGN-184').uid] }); // keep just one of them
    assert.deepEqual(p.hand.map(c => c.id), ['OGN-184']);
    assert.equal(p.deck.length, 4);
    assert.equal(p.reveal.length, 0);
  },
  'The Ultimate Flex: your units are Indestructible this turn and it cannot be countered'() {
    const s = fresh(); const u = card(s, 0, 'OGN-016', 'battle'); const f = card(s, 0, 'OGN-186');
    play(s, f.uid);
    assert(hasKw(s, u, 'Indestructible'));
    assert(getDef('OGN-186').uncounterable);
  },
  'Solar Boat Team: Defensive + Shieldify'() {
    const s = fresh(); const b = card(s, 0, 'OGN-182'); card(s, 0, 'OGN-016');
    const shields = s.players[0].shields.length;
    play(s, b.uid);
    const sh = legalActions(s, 0).find(a => a.type === 'shieldify'); step(s, sh);
    assert.equal(s.players[0].shields.length, shields + 1);
    assert(hasKw(s, s.players[0].battle.find(x => x.id === 'OGN-182'), 'Defensive'));
  },
  'Aspect of Entertainment (Lui Legend): [T][2] returns a Movie/Art card from the Grave'() {
    const s = fresh(); const p = s.players[0];
    p.legend = { uid: 'leg', id: 'OGN-L-lui', owner: 0, tapped: false, sick: false, mods: [], uses: null };
    assert(!legalActions(s, 0).some(a => a.uid === 'leg'), 'nothing to return yet');
    p.graveyard.push({ uid: 'gy1', id: 'OGN-184', owner: 0, tapped: false, sick: false, mods: [], uses: null });
    p.graveyard.push({ uid: 'gy2', id: 'OGN-016', owner: 0, tapped: false, sick: false, mods: [], uses: null }); // not Art/Movie
    step(s, { type: 'activate', uid: 'leg' });
    assert.equal(s.pending.kind, 'pick', 'confirm popup even with a single choice');
    assert.deepEqual(s.pending.choosable, ['gy1']);
    step(s, { type: 'pick', uids: ['gy1'] });
    assert(p.hand.some(c => c.uid === 'gy1') && p.legend.tapped);
  },
  'Lui deck: real Legend, Miniature Painter in the Champion Slot, legal'() {
    const d = decks.find(x => x.owner === 'Lui');
    assert.equal(getDef(d.legend).name, 'Aspect of Entertainment');
    assert.equal(getDef(d.champion).name, 'Miniature Painter');
  },
  'Gear: with both slots full you choose which Gear is replaced'() {
    const s = fresh(); const g1 = card(s, 0, 'OGN-185', 'gear'); const g2 = card(s, 0, 'OGN-189', 'gear'); const g3 = card(s, 0, 'OGN-175');
    const opts = legalActions(s, 0).filter(a => a.uid === g3.uid);
    assert.deepEqual(opts.map(a => a.replace).sort(), [g1.uid, g2.uid].sort());
    play(s, g3.uid, { replace: g2.uid });
    assert(s.players[0].gear.includes(g1) && !s.players[0].gear.includes(g2) && s.players[0].graveyard.includes(g2));
  },
  'Plays are recorded (with Shield Trigger marks) for the opponent sidebar'() {
    const s = fresh(); const c = card(s, 0, 'OGN-016');
    play(s, c.uid);
    assert.deepEqual(s.plays.at(-1), { player: 0, id: 'OGN-016', via: 'play', turn: s.turn, n: s.plays.at(-1).n });
  },
};
let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n     ', e.message); }
}
if (fail) process.exit(1);
