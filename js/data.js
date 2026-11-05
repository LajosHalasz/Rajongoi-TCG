// Browser data loading: placeholders + imported (real) cards + logic overrides.
import { setCardDb, allCards } from './engine/cards.js';
import { validateDeck } from './engine/deck.js';

const LS_KEY = 'riftmasters.decks.v1';
let premade = [];

async function getJson(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

export async function loadData() {
  const [placeholders, imported, overrides, decks] = await Promise.all([
    getJson('data/cards.json', []), getJson('data/imported.json', []),
    getJson('data/effects.json', {}), getJson('data/decks.json', []),
  ]);
  const byId = new Map(placeholders.map(c => [c.id, c]));
  for (const c of imported) byId.set(c.id, c); // real cards replace placeholders
  setCardDb([...byId.values()], overrides);
  premade = decks;
  return allCards();
}

export function customDecks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
export function saveCustomDecks(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
export function allDecks() { return [...premade, ...customDecks()]; }
export function playableDecks() { return allDecks().filter(d => !validateDeck(d).errors.length); }
export function findDeck(id) { return allDecks().find(d => d.id === id); }
