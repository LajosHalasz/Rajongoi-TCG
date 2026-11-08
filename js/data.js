// Browser data loading: placeholders + imported (real) cards + logic overrides.
import { setCardDb, allCards, mergeSources, getDef, hasDef } from './engine/cards.js';
import { validateDeck } from './engine/deck.js';
import { loadCustomCards, putCustomCard, removeCustomCard } from './cardstore.js';

const LS_KEY = 'riftmasters.decks.v1'; // kept so decks saved before the rename still load
let premade = [];
let guides = {};
let sources = null; // kept so the card database can be rebuilt after the Card Editor saves
let custom = [];

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
  custom = await loadCustomCards().catch(() => []);
  sources = { placeholders, imported, overrides };
  rebuild();
  premade = decks;
  guides = deckGuides || {};
  return allCards();
}

function rebuild() {
  const { placeholders, imported, overrides } = sources;
  // editor cards win over everything with the same id (that's how existing cards get edited)
  const over = { ...overrides };
  for (const c of custom) delete over[c.id];
  setCardDb([...mergeSources(placeholders, imported).filter(c => !custom.some(x => x.id === c.id)), ...custom], over);
}

/** Cards made or edited in the Card Editor (this browser only). */
export function customCards() { return custom; }
export const isCustomCard = (id) => custom.some(c => c.id === id);
export async function saveCustomCard(card) {
  await putCustomCard(card);
  custom = [...custom.filter(c => c.id !== card.id), card];
  rebuild();
}
export async function deleteCustomCard(id) {
  await removeCustomCard(id);
  custom = custom.filter(c => c.id !== id);
  rebuild();
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
/** Premade decks are shown as "Owner | Legend name" once their Legend is a real (non-placeholder) card. */
export function deckName(d) {
  if (!d) return '';
  if (!d.premade || !d.owner || !hasDef(d.legend)) return d.name;
  const L = getDef(d.legend);
  if (L.placeholder) return d.name;
  // older Legends already carry the owner: "Matyi | Always on time"
  return L.name.split('|')[0].trim().toLowerCase() === d.owner.toLowerCase() ? L.name : `${d.owner} | ${L.name}`;
}
// ---- Rune art per deck (this browser) ------------------------------------------
// Preset decks default to their owner's own Runes (deck.runeArt); every deck can switch a color to
// the standard (template) Rune or to another Rune the player may use. Full-art Runes must be pulled first.
const RUNE_LS = 'rajongoi.runeArt.v1', PULLS_LS = 'rajongoi.pulls.v1';
const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
export function setRuneChoice(deckId, color, value) {
  const all = readLS(RUNE_LS);
  all[deckId] = { ...(all[deckId] || {}), [color]: value };
  try { localStorage.setItem(RUNE_LS, JSON.stringify(all)); } catch { /* ignore */ }
}
/** color -> Rune card id used for this deck's Runes in game (missing = the standard template Rune). */
export function deckRuneArt(d) {
  const art = { ...(d?.runeArt || {}) };
  const own = readLS(RUNE_LS)[d?.id] || {};
  for (const [c, v] of Object.entries(own)) {
    if (v === 'standard') delete art[c];
    else if (hasDef(v)) art[c] = v;
  }
  return art;
}
/** The Rune cards a deck may use for a color: its owner's (preset decks) or all of them (custom decks). */
export function runeOptions(d, color) {
  const pulled = readLS(PULLS_LS);
  return allCards().filter(c => c.type === 'rune' && c.colors[0] === color && !c.templateRune
    && (!c.fullArtRune || pulled[c.id])
    && (!d.premade || (c.owners || []).some(o => o.toLowerCase() === String(d.owner || '').toLowerCase())));
}
export function findDeck(id) { return allDecks().find(d => d.id === id); }
