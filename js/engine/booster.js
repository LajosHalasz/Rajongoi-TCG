// Booster packs (15 cards):
//   6 Commons · 5 Uncommons · 1 Rune of the set (template Runes cover colors without artwork yet)
//   3 Rares — Rare cards, Legends and (non-full-art) Champions included; the last one is an
//     Epic in ~1 of 4 packs (Signatures, EPIC: The Musical, full-art cards, full-art Runes)
// God pack (~1 in 300 packs): no Commons, every slot upgraded (see PACK_RULES.god).
import { allCards, rarityOf } from './cards.js';

export const PACK_RULES = {
  commons: 6, uncommons: 5, rares: 3, epicChance: 1 / 4,
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
    runes: allCards().filter(c => c.type === 'rune' && !c.fullArtRune && String(c.setInfo || '').toUpperCase().startsWith(set)),
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
  for (let i = 0; i < PACK_RULES.uncommons; i++) out.push(god ? upgraded(PACK_RULES.god.uncommon) : slot('uncommon'));
  out.push({ def: pick(P.runes, P.commons), slot: 'rune' });
  for (let i = 0; i < PACK_RULES.rares - 1; i++) out.push(god ? upgraded(PACK_RULES.god.rare) : slot('rare'));
  // the last Rare may be an Epic (always in a god pack)
  out.push(god || rand() < PACK_RULES.epicChance ? slot('epic') : slot('rare'));
  const res = out.filter(e => e.def);
  if (god) {
    // reveal order: worst first, best last
    const rank = (e) => (e.slot === 'rune' ? -1 : ['common', 'uncommon', 'rare', 'epic'].indexOf(rarityOf(e.def)));
    res.sort((a, b) => rank(a) - rank(b));
    res.god = true;
  }
  return res;
}
