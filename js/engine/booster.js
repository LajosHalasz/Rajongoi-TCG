// Booster packs (15 cards):
//   10 Commons · 1 Rune or Token (may fall back to a Common) · 3 Uncommons
//   1 Champion, Signature or full-art (foil) Rune in ~1 of 8 packs, otherwise a Rare
//     (Legends are Rares and share that slot)
// God pack (~1 in 300 packs): every slot is upgraded — no Commons, and much better odds
// for Rares and Epics; the last slot is always a Champion / Signature / full-art Rune.
import { allCards, rarityOf } from './cards.js';

export const PACK_RULES = {
  commons: 10, uncommons: 3, hitChance: 1 / 8,
  godChance: 1 / 300,
  // per-slot odds inside a god pack
  god: { common: { uncommon: 0.55, rare: 0.3, epic: 0.15 }, uncommon: { rare: 0.6, epic: 0.4 } },
};

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
    rares: cards.filter(c => (playable(c) || c.type === 'legend') && ['rare', 'epic'].includes(rarityOf(c))),
    epics: cards.filter(c => playable(c) && rarityOf(c) === 'epic'),
    hits: [...cards.filter(c => c.type === 'champion' || c.type === 'signature'),
      ...allCards().filter(c => c.type === 'rune' && c.fullArtRune && String(c.setInfo || '').toUpperCase().startsWith(set))],
    legends: cards.filter(c => c.type === 'legend'), // part of the Rare pool, listed for the odds text
    extras: allCards().filter(c => (c.type === 'rune' && !c.fullArtRune) || c.type === 'token'),
  };
}

/** Returns 15 { def, slot } entries in reveal order (best card last); the array has .god = true for a god pack. */
export function openPack(set, rand = Math.random) {
  const P = setPools(set);
  const pick = (...pools) => {
    const pool = pools.find(p => p && p.length) || [];
    return pool[Math.floor(rand() * pool.length)];
  };
  const god = rand() < PACK_RULES.godChance;
  // god pack: roll the upgraded rarity of a slot
  const upgraded = (odds) => {
    let r = rand();
    for (const [rar, p] of Object.entries(odds)) {
      if ((r -= p) < 0) { const def = pick(P[rar + 's'], P.rares, P.uncommons, P.commons); return { def, slot: def ? rarityOf(def) : rar }; }
    }
    return { def: pick(P.rares, P.uncommons), slot: 'rare' };
  };
  const out = [];
  for (let i = 0; i < PACK_RULES.commons; i++) out.push(god ? upgraded(PACK_RULES.god.common) : { def: pick(P.commons, P.uncommons), slot: 'common' });
  out.push({ def: pick(P.extras, P.commons), slot: 'extra' });
  for (let i = 0; i < PACK_RULES.uncommons; i++) out.push(god ? upgraded(PACK_RULES.god.uncommon) : { def: pick(P.uncommons, P.commons), slot: 'uncommon' });
  const hit = P.hits.length && (god || rand() < PACK_RULES.hitChance);
  out.push(hit ? { def: pick(P.hits), slot: 'hit' } : { def: pick(P.rares, P.uncommons, P.commons), slot: 'rare' });
  const res = out.filter(e => e.def);
  if (god) {
    // reveal order: worst first, best last
    const rank = (e) => (e.slot === 'hit' ? 9 : e.slot === 'extra' ? -1 : ['common', 'uncommon', 'rare', 'epic'].indexOf(rarityOf(e.def)));
    res.sort((a, b) => rank(a) - rank(b));
    res.god = true;
  }
  return res;
}
