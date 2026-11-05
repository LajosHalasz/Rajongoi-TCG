// Deck validation (hard rules = errors, Assembly Guide = warnings).
import { RULES, GUIDE } from './rules.js';
import { getDef, hasDef, kindOf, championMatchesLegend, signatureMatchesLegend } from './cards.js';

export function deckStats(deck) {
  const ids = Object.entries(deck.cards || {}).flatMap(([id, n]) => Array(n).fill(id)).filter(hasDef);
  const defs = ids.map(getDef);
  const count = (f) => defs.filter(f).length;
  const curve = {};
  for (const d of defs) curve[Math.min(d.cost, 10)] = (curve[Math.min(d.cost, 10)] || 0) + 1;
  const totalCost = defs.reduce((a, d) => a + (d.cost || 0), 0);
  return {
    total: ids.length,
    units: count(d => d.type === 'unit'),
    champions: count(d => d.type === 'champion'),
    spells: count(d => d.type === 'spell'),
    gears: count(d => d.type === 'gear'),
    signatures: count(d => d.type === 'signature'),
    curve,
    totalCost,
    avgCost: ids.length ? totalCost / ids.length : 0,
    runes: Object.values(deck.runes || {}).reduce((a, b) => a + b, 0),
  };
}

export function validateDeck(deck) {
  const errors = [], warnings = [];
  if (!deck.legend || !hasDef(deck.legend)) { errors.push('Choose a Legend.'); return { errors, warnings, stats: deckStats(deck) }; }
  const legend = getDef(deck.legend);
  const st = deckStats(deck);

  for (const id of Object.keys(deck.cards || {})) if (!hasDef(id)) errors.push(`Unknown card ${id}.`);
  if (st.total !== RULES.DECK_SIZE) errors.push(`Deck must have exactly ${RULES.DECK_SIZE} cards (has ${st.total}).`);
  for (const [id, n] of Object.entries(deck.cards || {})) if (n > RULES.MAX_COPIES && hasDef(id)) errors.push(`Only ${RULES.MAX_COPIES} copy allowed: ${getDef(id).name}.`);

  const ids = Object.keys(deck.cards || {}).filter(hasDef);
  const defs = ids.map(getDef);
  for (const d of defs) {
    if (d.type === 'legend' || d.type === 'token' || d.type === 'rune') errors.push(`${d.name} can't be in the main deck.`);
    if (d.type === 'signature' && !signatureMatchesLegend(d, legend)) {
      errors.push(`${d.name} is a Signature card of another Legend.`);
    } else if (d.colors.some(c => !legend.colors.includes(c))) {
      errors.push(`${d.name} is outside your Legend's colors (${legend.colors.join('/')}).`);
    }
  }
  if (st.champions < RULES.MIN_CHAMPIONS || st.champions > RULES.MAX_CHAMPIONS)
    errors.push(`Deck needs ${RULES.MIN_CHAMPIONS}-${RULES.MAX_CHAMPIONS} Champion Units (has ${st.champions}).`);
  if (!defs.some(d => d.type === 'champion' && championMatchesLegend(d, legend)))
    errors.push(`At least one Champion must share the Legend's name (${legend.name.split(',')[0]}).`);
  if (st.signatures > RULES.MAX_SIGNATURES) errors.push(`Max ${RULES.MAX_SIGNATURES} Signature cards.`);

  if (!deck.champion || !ids.includes(deck.champion)) errors.push('Choose the Champion that starts in the Champion Slot.');
  else if (!championMatchesLegend(getDef(deck.champion), legend)) errors.push('The Champion Slot card must share the Legend\'s name.');
  if (st.signatures > 0 && (!deck.signature || !ids.includes(deck.signature))) errors.push('Choose the Signature card that starts in the Signature Slot.');

  if (st.runes !== RULES.RUNE_DECK_SIZE) errors.push(`Mana Deck must have ${RULES.RUNE_DECK_SIZE} runes (has ${st.runes}).`);
  for (const c of Object.keys(deck.runes || {})) if (deck.runes[c] > 0 && !legend.colors.includes(c)) errors.push(`${c} runes don't match your Legend.`);

  const range = (k, label) => {
    const [lo, hi] = GUIDE[k];
    if (st[k] < lo || st[k] > hi) warnings.push(`Guide: ${lo}-${hi} ${label} (has ${st[k]}).`);
  };
  range('units', 'Units'); range('spells', 'Spells'); range('gears', 'Gears');
  if (Math.abs(st.avgCost - GUIDE.avgCost) > 0.6) warnings.push(`Guide: average cost ~${GUIDE.avgCost} (is ${st.avgCost.toFixed(1)}).`);
  return { errors, warnings, stats: st };
}
