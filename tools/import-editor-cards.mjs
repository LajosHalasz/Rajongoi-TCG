#!/usr/bin/env node
// Make cards from the in-game Card Editor permanent (for every player).
//
//   node tools/import-editor-cards.mjs exported.json [more.json ...]
//
// Takes the files from the editor's "Download card file" / "Export all" buttons
// ({ format: 'rajongoi-cards', cards: [...] }):
// - the artwork (inline data: URL) goes to data/img/<id>.jpg
// - the card goes into data/imported.json (replacing a card with the same id)
// - its keywords, tags and abilities go into data/effects.json, so the editor's game logic wins
// then data/data.js and the thumbnails are rebuilt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDataJs } from './build-data.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/import-editor-cards.mjs cards.json [more.json ...]');
  process.exit(1);
}

const impFile = path.join(root, 'data', 'imported.json');
const effFile = path.join(root, 'data', 'effects.json');
const imgDir = path.join(root, 'data', 'img');
const imported = JSON.parse(fs.readFileSync(impFile, 'utf8'));
const effects = JSON.parse(fs.readFileSync(effFile, 'utf8'));
const byId = new Map(imported.map(c => [c.id, c]));
const ID_RE = /^[A-Z]{3}-(?:\d{3}|L-[a-z0-9-]+)$/;

let n = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const cards = j.format === 'rajongoi-cards' ? j.cards : j.format === 'rajongoi-card' ? [j.card] : null;
  if (!cards) { console.error(`${f}: not a Card Editor export`); process.exitCode = 1; continue; }
  for (const raw of cards) {
    if (!ID_RE.test(raw.id || '')) { console.error(`  skipped: bad card id ${JSON.stringify(raw.id)}`); continue; }
    const card = { ...raw };
    delete card.custom; delete card.updatedAt;
    card.source = 'editor';
    const m = String(card.image || '').match(/^data:image\/(\w+);base64,(.*)$/s);
    if (m) {
      const tmp = path.join(imgDir, `${card.id}.upload.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      const out = path.join(imgDir, `${card.id}.jpg`);
      fs.writeFileSync(tmp, Buffer.from(m[2], 'base64'));
      try { execFileSync('convert', [tmp, '-auto-orient', '-resize', '900x900>', '-quality', '85', out]); fs.unlinkSync(tmp); }
      catch { fs.renameSync(tmp, out); }
      const thumb = path.join(imgDir, 'thumb', `${card.id}.webp`);
      if (fs.existsSync(thumb)) fs.unlinkSync(thumb); // rebuilt from the new picture
      card.image = `data/img/${card.id}.jpg`;
    }
    byId.set(card.id, card);
    // the editor's keywords / tags / abilities replace any hand-written logic for this card
    effects[card.id] = { ...(effects[card.id] || {}), keywords: card.keywords || [], tribes: card.tribes || [], effects: card.effects || [] };
    if (card.activateCost) effects[card.id].activateCost = card.activateCost; else delete effects[card.id].activateCost;
    if (card.uses) effects[card.id].uses = card.uses; else delete effects[card.id].uses;
    console.log(`imported ${card.id}  ${card.name}  [${card.type}${card.colors?.length ? ' ' + card.colors.join('/') : ''}]`);
    n++;
  }
}

const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(impFile, JSON.stringify(list, null, 2) + '\n');
fs.writeFileSync(effFile, JSON.stringify(effects, null, 1) + '\n');
console.log(`\n${n} card(s) imported.`);
buildDataJs();
