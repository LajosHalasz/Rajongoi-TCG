// Pack composition check over many simulated packs.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { openPack, boosterSets } from '../js/engine/booster.js';
import { rarityOf } from '../js/engine/cards.js';

loadData();
for (const set of boosterSets()) {
  let hits = 0, legends = 0, gods = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const p = openPack(set);
    assert.equal(p.length, 15, `${set} pack has ${p.length} cards`);
    assert(!p.some(e => e.slot === 'legend'), 'no separate Legend slot');
    hits += p.filter(e => e.slot === 'hit').length;
    legends += p.filter(e => e.def.type === 'legend').length;
    if (p.god) {
      gods++;
      assert(!p.some(e => e.slot === 'common'), 'god pack: no Common slots');
      assert.equal(p.slice(-1)[0].slot, 'hit', 'god pack ends with a Champion / Signature');
    } else assert(p.slice(-1)[0].slot === 'hit' || p.slice(-1)[0].slot === 'rare');
    for (const e of p) if (e.def.type === 'legend') assert.equal(rarityOf(e.def), 'rare', 'Legends are Rares');
    for (const e of p) if (e.def.type === 'legend' && !p.god) assert.equal(e.slot, 'rare', 'Legends come from the Rare slot');
  }
  // a forced god pack
  const g = openPack(set, (() => { let first = true; return () => (first ? (first = false, 0) : Math.random()); })());
  assert(g.god);
  const sample = openPack(set).map(e => `${e.slot}:${rarityOf(e.def)}`).join(' ');
  console.log(`${set}: champion/signature in 1 of ${(N / hits).toFixed(1)} packs, legend in 1 of ${legends ? (N / legends).toFixed(1) : '-'}, god pack ${gods}/${N} | god: ${g.map(e => rarityOf(e.def)[0]).join('')} | ${sample}`);
}
console.log('OK');
