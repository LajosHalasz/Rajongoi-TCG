// Loads the card data the same way the browser does (for Node tests).
import fs from 'node:fs';
import { setCardDb, mergeSources } from '../js/engine/cards.js';
const rd = (f, fb) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fb;
export function loadData(root = new URL('..', import.meta.url).pathname) {
  const placeholders = [...rd(root + 'data/cards.json', []), ...rd(root + 'data/tokens.json', [])];
  const imported = rd(root + 'data/imported.json', []);
  const overrides = rd(root + 'data/effects.json', {});
  setCardDb(mergeSources(placeholders, imported), overrides);
  return { decks: rd(root + 'data/decks.json', []) };
}
