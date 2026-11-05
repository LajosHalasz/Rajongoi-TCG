// Targeted checks for individual card mechanics (scripted board states).
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { createGame, step, legalActions, power, setClock } from '../js/engine/game.js';
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
};
let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n     ', e.message); }
}
if (fail) process.exit(1);
