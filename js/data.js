// Browser data loading: placeholders + imported (real) cards + logic overrides.
import { setCardDb, allCards, mergeSources } from './engine/cards.js';
import { validateDeck } from './engine/deck.js';

const LS_KEY = 'riftmasters.decks.v1'; // kept so decks saved before the rename still load
let premade = [];
let guides = {};

async function getJson(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

export async function loadData() {
  // data/data.js (classic script) works everywhere, including file://
  const pre = typeof window !== 'undefined' && window.RM_DATA;
  const [placeholders, imported, overrides, decks, deckGuides] = pre
    ? [[...pre.cards, ...(pre.tokens || [])], pre.imported, pre.effects, pre.decks, pre.guides || {}]
    : await Promise.all([
      Promise.all([getJson('data/cards.json', []), getJson('data/tokens.json', [])]).then(([a, b]) => [...a, ...b]), getJson('data/imported.json', []),
      getJson('data/effects.json', {}), getJson('data/decks.json', []), getJson('data/deck-guides.json', {}),
    ]);
  setCardDb(mergeSources(placeholders, imported), overrides);
  premade = decks;
  guides = deckGuides || {};
  return allCards();
}

export function customDecks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
export function saveCustomDecks(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
export function allDecks() { return [...premade, ...customDecks()]; }
export function playableDecks() { return allDecks().filter(d => !d.comingSoon && !validateDeck(d).errors.length); }
export function comingSoonDecks() { return allDecks().filter(d => d.comingSoon); }
/** Hand-written strategy notes for a premade deck (data/deck-guides.json), if any. */
export function deckGuide(id, lang = 'hu') { const g = guides[id]; return g ? (g[lang] || g.en || g.hu || g) : null; }
export function findDeck(id) { return allDecks().find(d => d.id === id); }
