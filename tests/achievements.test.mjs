// Each obtainable achievement is unlocked by a scripted, real game situation.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { createGame, step, legalActions, setClock } from '../js/engine/game.js';
import { getDef } from '../js/engine/cards.js';
import { checkAchievements, ACHIEVEMENTS } from '../js/engine/achievements.js';

const { decks } = loadData();
setClock(() => 10);
let n = 0;
function fresh() {
  const s = createGame({ decks: [decks[0], decks[0]], ai: [false, false], seed: 3, firstPlayer: 0 });
  step(s, { type: 'mulligan', uids: [] }); step(s, { type: 'mulligan', uids: [] });
  for (const p of s.players) {
    p.hand = []; p.battle = []; p.gear = [];
    p.mana = Array.from({ length: 14 }, (_, i) => ({ uid: `r${p.idx}-${i}`, color: ['Fury', 'Order', 'Order', 'Fury', 'Mind', 'Order', 'Chaos'][i % 7], tapped: false }));
  }
  return s;
}
const card = (s, pi, id, zone = 'hand', extra = {}) => {
  const c = { uid: `a${++n}`, id, owner: pi, tapped: false, sick: false, mods: [], uses: getDef(id).uses ?? null, fast: false, ...extra };
  s.players[pi][zone].push(c);
  return c;
};
const got = (s) => checkAchievements(s, 0, 0);
const passAll = (s) => { for (let i = 0; i < 20 && s.pending && ['priority', 'block'].includes(s.pending.kind); i++) step(s, { type: s.pending.kind === 'block' ? 'noBlock' : 'pass' }); };
/** player `atk` attacks the other player's shields with `u` */
function attackShield(s, atk, u) {
  s.active = atk; s.phase = 'combat';
  step(s, { type: 'attack', uid: u.uid, target: { kind: 'shield' } });
  passAll(s);
}

const tests = {
  'Funniest shit I have ever seen'() {
    const s = fresh();
    const pa = card(s, 0, 'OGN-180', 'battle'); const tok = card(s, 1, 'TKN-003', 'battle');
    s.players[1].shields = [];
    step(s, { type: 'activate', uid: pa.uid, target: tok.uid });
    const copy = s.players[0].battle.find(u => u.temp);
    step(s, { type: 'endPhase' });
    step(s, { type: 'attack', uid: copy.uid, target: { kind: 'player' } }); passAll(s);
    assert.equal(s.winner, 0);
    assert(got(s).includes('funniest'));
  },
  'Unexpected FLEX'() {
    const s = fresh();
    const atk = card(s, 1, 'OGN-016', 'battle'); s.players[1].battle[0].id = 'OGN-181'; // an attacker that can attack
    s.players[0].shields.unshift({ uid: 'flex', id: 'OGN-186', owner: 0, tapped: false, sick: false, mods: [], uses: null });
    attackShield(s, 1, atk);
    assert.equal(s.pending?.kind, 'shieldTrigger');
    step(s, legalActions(s, 0).find(a => a.use));
    assert(got(s).includes('unexpected-flex'));
  },
  'Join the Strawberry Club'() {
    const s = fresh();
    const atk = card(s, 0, 'OGN-181', 'battle');
    s.players[1].shields.unshift({ uid: 'straw', id: 'OGN-012', owner: 1, tapped: false, sick: false, mods: [], uses: null });
    attackShield(s, 0, atk);
    step(s, legalActions(s, 1).find(a => a.use));
    assert(got(s).includes('strawberry'));
  },
  'Speed Painting (3 accelerated Miniatures in a turn)'() {
    const s = fresh();
    card(s, 0, 'OGN-188', 'battle'); const g = card(s, 0, 'OGN-179', 'gear');
    for (let i = 0; i < 3; i++) { g.tapped = false; step(s, { type: 'activate', uid: g.uid }); }
    assert(got(s).includes('painter'));
  },
  'Manyika can rest finally'() {
    const s = fresh();
    const m = card(s, 0, 'OGN-176', 'battle'); const pouch = card(s, 1, 'TKN-005', 'battle', { tapped: true });
    s.phase = 'combat';
    step(s, { type: 'attack', uid: m.uid, target: { kind: 'unit', uid: pouch.uid } }); passAll(s);
    assert(!s.players[0].battle.includes(m), 'Manyika died to Deathtouch');
    assert(got(s).includes('manyika-rest'));
  },
  'Art of Destruction (banish 5 in a turn)'() {
    const s = fresh();
    s.players[0].mana.forEach((r, i) => (r.color = i % 2 ? 'Order' : 'Fury'));
    const ch = card(s, 0, 'OGN-178'); step(s, { type: 'play', uid: ch.uid });
    for (const id of ['OGN-184', 'OGN-180', 'OGN-188', 'OGN-185', 'OGN-186']) {
      const c = card(s, 0, id); s.players[0].mana.forEach(r => (r.tapped = false));
      const a = legalActions(s, 0).find(x => x.uid === c.uid); assert(a, 'can play ' + id); step(s, a);
      while (s.pending?.kind === 'pick') step(s, { type: 'pick', uids: [] });
    }
    step(s, { type: 'endPhase' }); step(s, { type: 'endPhase' });
    assert(got(s).includes('art-destruction'));
  },
  'Came Prepared (Shieldify a Shield Trigger card)'() {
    const s = fresh();
    const boat = card(s, 0, 'OGN-182'); const st = card(s, 0, 'OGN-012');
    step(s, { type: 'play', uid: boat.uid });
    step(s, { type: 'shieldify', uid: st.uid });
    assert(got(s).includes('came-prepared'));
  },
  'Quality Movie Night'() {
    const s = fresh();
    const u = card(s, 0, 'OGN-016', 'battle'); const law = card(s, 0, 'OGN-171'); const mn = card(s, 0, 'OGN-173');
    step(s, { type: 'play', uid: law.uid, target: u.uid });
    step(s, { type: 'play', uid: mn.uid }); step(s, { type: 'pick', uids: [] });
    assert(got(s).includes('movie-night'));
  },
  'Finale (Cowtrix + GOLDEN)'() {
    const s = fresh();
    const c = card(s, 0, 'OGN-172'); const g = card(s, 0, 'OGN-177');
    step(s, legalActions(s, 0).find(a => a.uid === c.uid));
    step(s, legalActions(s, 0).find(a => a.uid === g.uid));
    assert(got(s).includes('finale'));
  },
  'Printer Upgrade'() {
    const s = fresh();
    const lf = card(s, 0, 'OGN-179', 'gear'); card(s, 0, 'OGN-185', 'gear'); const xf = card(s, 0, 'OGN-189');
    step(s, { type: 'play', uid: xf.uid, replace: lf.uid });
    assert(got(s).includes('printer-upgrade'));
  },
  'Dungeon Survivors'() {
    const s = fresh();
    const dd = card(s, 0, 'OGN-045', 'battle'); s.players[1].shields = [];
    s.phase = 'combat';
    step(s, { type: 'attack', uid: dd.uid, target: { kind: 'player' } }); passAll(s);
    assert.equal(s.winner, 0);
    assert(got(s).includes('dungeon-survivors'));
  },
  'All 12 achievements are defined'() {
    assert.equal(ACHIEVEMENTS.length, 12);
  },
};
let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n     ', e.message); }
}
if (fail) process.exit(1);
