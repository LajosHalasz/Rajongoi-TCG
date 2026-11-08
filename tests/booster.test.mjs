// Pack composition check over many simulated packs.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { openPack, boosterSets, setPools } from '../js/engine/booster.js';
import { rarityOf } from '../js/engine/cards.js';

loadData();
for (const set of boosterSets()) {
  let legends = 0, gods = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const p = openPack(set);
    assert.equal(p.length, 15, `${set} pack has ${p.length} cards`);
    for (const e of p) {
      if (e.slot === 'rare' || e.slot === 'epic') assert.equal(rarityOf(e.def), e.slot === 'epic' && !setPools(set).epics.length ? rarityOf(e.def) : e.slot, `${e.def.name} in the ${e.slot} slot`);
      if (e.def.type === 'legend') { legends++; assert.equal(e.slot, 'rare', 'Legends come from the Rare slot'); }
    }
    if (p.god) { gods++; assert(!p.some(e => e.slot === 'common'), 'god pack: no Common slots'); }
    else assert.deepEqual(p.slice(-2).map(e => e.slot), ['rare', 'epic'], 'Rare then Epic last');
  }
  const P = setPools(set);
  const sample = openPack(set).map(e => `${e.slot}:${rarityOf(e.def)}`).join(' ');
  console.log(`${set}: ${P.rares.length} rares, ${P.epics.length} epics, legend in 1 of ${legends ? (N / legends).toFixed(1) : '-'} packs, god pack ${gods}/${N} | ${sample}`);
}
console.log('OK');
