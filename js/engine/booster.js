// Booster packs (15 cards):
//   10 Commons · 1 Rune or Token (may fall back to a Common) · 2 Uncommons
//   1 Rare slot — Rare cards, Legends and (non-full-art) Champions included
//   1 Epic slot (last) — Epic cards: Signatures, EPIC: The Musical, full-art cards, full-art Runes
// God pack (~1 in 300 packs): no Commons, every slot upgraded (see PACK_RULES.god).
import { allCards, rarityOf } from './cards.js';

export const PACK_RULES = {
  commons: 10, uncommons: 2,
  godChance: 1 / 300,
  // per-slot odds inside a god pack
  god: { common: { uncommon: 0.55, rare: 0.3, epic: 0.15 }, uncommon: { rare: 0.6, epic: 0.4 }, rare: { rare: 0.5, epic: 0.5 } },
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
  const collectible = (c) => playable(c) || ['legend', 'champion', 'signature'].includes(c.type);
  const of = (r) => cards.filter(c => collectible(c) && rarityOf(c) === r);
  const fullArtRunes = allCards().filter(c => c.type === 'rune' && c.fullArtRune && String(c.setInfo || '').toUpperCase().startsWith(set));
  return {
    commons: of('common'),
    uncommons: of('uncommon'),
    rares: of('rare'),
    epics: [...of('epic'), ...fullArtRunes],
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
  const fallback = { common: [P.commons, P.uncommons], uncommon: [P.uncommons, P.commons], rare: [P.rares, P.uncommons, P.commons], epic: [P.epics, P.rares, P.uncommons] };
  const slot = (rar) => { const def = pick(...fallback[rar]); return { def, slot: rar }; };
  // god pack: roll the upgraded rarity of a slot
  const upgraded = (odds) => {
    let r = rand();
    for (const [rar, p] of Object.entries(odds)) if ((r -= p) < 0) return slot(rar);
    return slot(Object.keys(odds).pop());
  };
  const out = [];
  for (let i = 0; i < PACK_RULES.commons; i++) out.push(god ? upgraded(PACK_RULES.god.common) : slot('common'));
  out.push({ def: pick(P.extras, P.commons), slot: 'extra' });
  for (let i = 0; i < PACK_RULES.uncommons; i++) out.push(god ? upgraded(PACK_RULES.god.uncommon) : slot('uncommon'));
  out.push(god ? upgraded(PACK_RULES.god.rare) : slot('rare'));
  out.push(slot('epic'));
  const res = out.filter(e => e.def);
  if (god) {
    // reveal order: worst first, best last
    const rank = (e) => (e.slot === 'extra' ? -1 : ['common', 'uncommon', 'rare', 'epic'].indexOf(rarityOf(e.def)));
    res.sort((a, b) => rank(a) - rank(b));
    res.god = true;
  }
  return res;
}
