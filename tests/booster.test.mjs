// Pack composition check over many simulated packs.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { openPack, boosterSets } from '../js/engine/booster.js';
import { rarityOf } from '../js/engine/cards.js';

loadData();
for (const set of boosterSets()) {
  let hits = 0, legends = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const p = openPack(set);
    assert.equal(p.length, 15, `${set} pack has ${p.length} cards`);
    hits += p.filter(e => e.slot === 'hit').length;
    legends += p.filter(e => e.slot === 'legend').length;
    assert(p.slice(-1)[0].slot === 'hit' || p.slice(-1)[0].slot === 'rare');
  }
  const sample = openPack(set).map(e => `${e.slot}:${rarityOf(e.def)}`).join(' ');
  console.log(`${set}: champion/signature in 1 of ${(N / hits).toFixed(1)} packs, legend in 1 of ${legends ? (N / legends).toFixed(1) : '-'} | ${sample}`);
}
console.log('OK');
