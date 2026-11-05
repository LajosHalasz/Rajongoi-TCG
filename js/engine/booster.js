// Booster packs (15 cards):
//   1 Champion or Signature in ~1 of 8 packs (otherwise a Rare, or an Uncommon if the set has no Rares)
//   3 Uncommons
//   10 Commons (a Legend may replace one of them)
//   1 Rune or Token (may fall back to a Common)
import { allCards, rarityOf } from './cards.js';

export const PACK_RULES = { commons: 10, uncommons: 3, hitChance: 1 / 8, legendChance: 1 / 6 };

const playable = (c) => ['unit', 'spell', 'gear'].includes(c.type);

/** Sets that have enough cards to open packs from. */
export function boosterSets() {
  const sets = [...new Set(allCards().filter(c => playable(c) && !c.filler).map(c => c.set))];
  const order = ['OGN', 'DND'];
  const rank = (x) => (order.indexOf(x) + 1 || 50);
  return sets.filter(s => !['BAS', 'TKN', 'RUN'].includes(s)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function setPools(set) {
  const cards = allCards().filter(c => c.set === set && !c.filler && !(c.type === 'legend' && c.placeholder));
  const of = (r) => cards.filter(c => playable(c) && rarityOf(c) === r);
  return {
    commons: of('common'),
    uncommons: of('uncommon'),
    rares: cards.filter(c => playable(c) && ['rare', 'epic'].includes(rarityOf(c))),
    hits: cards.filter(c => c.type === 'champion' || c.type === 'signature'),
    legends: cards.filter(c => c.type === 'legend'),
    extras: allCards().filter(c => c.type === 'rune' || c.type === 'token'),
  };
}

/** Returns 15 { def, slot } entries in reveal order (best card last). */
export function openPack(set, rand = Math.random) {
  const P = setPools(set);
  const pick = (...pools) => {
    const pool = pools.find(p => p && p.length) || [];
    return pool[Math.floor(rand() * pool.length)];
  };
  const out = [];
  const legendAt = P.legends.length && rand() < PACK_RULES.legendChance ? Math.floor(rand() * PACK_RULES.commons) : -1;
  for (let i = 0; i < PACK_RULES.commons; i++) {
    if (i === legendAt) out.push({ def: pick(P.legends), slot: 'legend' });
    else out.push({ def: pick(P.commons, P.uncommons), slot: 'common' });
  }
  out.push({ def: pick(P.extras, P.commons), slot: 'extra' });
  for (let i = 0; i < PACK_RULES.uncommons; i++) out.push({ def: pick(P.uncommons, P.commons), slot: 'uncommon' });
  const hit = P.hits.length && rand() < PACK_RULES.hitChance;
  out.push(hit ? { def: pick(P.hits), slot: 'hit' } : { def: pick(P.rares, P.uncommons, P.commons), slot: 'rare' });
  // legends are "big" pulls: move them next to the last card
  const li = out.findIndex(e => e.slot === 'legend');
  if (li >= 0) { const [leg] = out.splice(li, 1); out.splice(out.length - 1, 0, leg); }
  return out.filter(e => e.def);
}
