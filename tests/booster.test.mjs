// Pack composition check over many simulated packs.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { openPack, boosterSets, setPools } from '../js/engine/booster.js';
import { rarityOf } from '../js/engine/cards.js';

loadData();
for (const set of boosterSets()) {
  let legends = 0, gods = 0, epics = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const p = openPack(set);
    assert.equal(p.length, 15, `${set} pack has ${p.length} cards`);
    const r = p.find(e => e.slot === 'rune');
    assert(r && r.def.type === 'rune' && !r.def.fullArtRune && String(r.def.setInfo).toUpperCase().startsWith(set), `${set} pack has a Rune of the set`);
    for (const e of p) {
      if (e.slot === 'rare' || e.slot === 'epic') assert.equal(rarityOf(e.def), e.slot === 'epic' && !setPools(set).epics.length ? rarityOf(e.def) : e.slot, `${e.def.name} in the ${e.slot} slot`);
      if (e.def.type === 'legend') { legends++; assert.equal(e.slot, 'rare', 'Legends come from the Rare slot'); }
    }
    if (p.god) { gods++; assert(!p.some(e => e.slot === 'common'), 'god pack: no Common slots'); }
    else {
      const count = (k) => p.filter(e => e.slot === k).length;
      assert.deepEqual([count('common'), count('uncommon'), count('rune'), count('rare') + count('epic')], [6, 5, 1, 3], 'pack layout');
      assert(count('epic') <= 1 && (!count('epic') || p.slice(-1)[0].slot === 'epic'), 'only the last Rare may be an Epic');
      if (count('epic')) epics++;
    }
  }
  const P = setPools(set);
  const runes = setPools(set).runes.map(c => c.colors[0]).sort().join('/');
  const sample = openPack(set).map(e => `${e.slot}:${rarityOf(e.def)}`).join(' ');
  console.log(`${set}: runes ${runes} | ${P.rares.length} rares, ${P.epics.length} epics, legend in 1 of ${legends ? (N / legends).toFixed(1) : '-'} packs, epic in 1 of ${(N / epics).toFixed(1)}, god pack ${gods}/${N} | ${sample}`);
}
console.log('OK');
