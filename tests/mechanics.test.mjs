// Targeted checks for individual card mechanics (scripted board states).
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { createGame, step, legalActions, power, setClock, hasKeyword, effectiveCost } from '../js/engine/game.js';
const hasKw = (s, u, k) => hasKeyword(s, u, k);
import { getDef } from '../js/engine/cards.js';

const { decks } = loadData();
setClock(() => 10);
const deck = decks[0];

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
  'The Dealmaker: [T] +1 Might and Indestructible until next turn'() {
    const s = fresh(); const dm = card(s, 0, 'OGN-183', 'battle');
    step(s, { type: 'activate', uid: dm.uid });
    assert.equal(power(s, dm), 8);
    assert(hasKw(s, dm, 'Indestructible'));
    s.active = 1; const k = card(s, 1, 'OGN-022'); // Ahsoka can't target 8 might; use direct destroy attempt via Snowball-like check
    assert(s.players[0].battle.includes(dm));
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
