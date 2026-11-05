#!/usr/bin/env node
// Import card JSON files exported from riftcardmaker.net into the game.
//
//   node tools/import-riftcardmaker.mjs path/to/*.json [more.json ...]
//
// - Writes/merges data/imported.json (cards keyed by id, e.g. "OGN-001", "TKN-001")
// - Extracts the embedded image to data/img/<id>.jpg (resized if ImageMagick exists)
// - Keywords written as {Keyword#HEX} in the description are detected automatically.
//   Free-text effects ("Tap target Unit.") need game logic in data/effects.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outFile = path.join(root, 'data', 'imported.json');
const imgDir = path.join(root, 'data', 'img');
fs.mkdirSync(imgDir, { recursive: true });

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/import-riftcardmaker.mjs card1.json [card2.json ...]');
  process.exit(1);
}

const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
const byId = new Map(existing.map(c => [c.id, c]));

const KNOWN = new Set(['Shield Trigger', 'Defensive', 'Deathtouch', 'Nostalgia Line', 'Haste', 'Breaker', 'Action', 'Reaction', 'Being Áron']);

function parseSetInfo(info = '') {
  const m = info.trim().match(/^(\S+)\s+(\d+)/);
  if (!m) return { set: 'MISC', number: '000' };
  let set = m[1].toUpperCase();
  if (set === 'TOKEN') set = 'TKN';
  return { set, number: m[2] };
}

function convert(j) {
  const { set, number } = parseSetInfo(j.setInfo);
  const id = `${set}-${number}`;
  let type = String(j.type || 'unit').toLowerCase();
  if (set === 'TKN') type = 'token';
  if (type.includes('champion')) type = 'champion';
  const colors = String(j.color || '').split(/[^a-zA-Z]+/).filter(c => c && c.toLowerCase() !== 'neutral')
    .map(c => c[0].toUpperCase() + c.slice(1).toLowerCase());

  const keywords = [];
  const effects = [];
  for (const m of String(j.description || '').matchAll(/\{([^#}]+)#[^}]*\}/g)) {
    const raw = m[1].trim();
    const num = raw.match(/^(.*?)\s+(\d+)$/);
    if (num && num[1] === 'Shieldify') {
      keywords.push('Shieldify');
      effects.push({ on: 'play', do: 'shieldify', amount: +num[2] });
    } else if (KNOWN.has(raw)) keywords.push(raw);
    else keywords.push(raw); // unknown keyword: shown on the card, no game logic
  }

  const card = {
    id, set, number, name: j.name.trim(), type,
    colors, cost: j.energy ?? 0, power: j.might ?? 0,
    keywords, effects,
    tribes: (j.tribes || []).map(t => t.text).filter(Boolean),
    text: j.description || '',
    flavor: j.flavorText || '',
    rarity: j.rarity || 'common',
    illustrator: j.illustrator || '',
    setInfo: j.setInfo || '',
    source: 'riftcardmaker',
  };
  if (type === 'token') card.token = true;
  if (j.power != null && j.power > 0) card.powerCost = j.power;

  const img = (j.images || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (img && /^data:image\//.test(img.src || '')) {
    const [, ext, b64] = img.src.match(/^data:image\/(\w+);base64,(.*)$/s) || [];
    if (b64) {
      const file = path.join(imgDir, `${id}.jpg`);
      const tmp = path.join(imgDir, `${id}.src.${ext === 'jpeg' ? 'jpg' : ext}`);
      fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
      try {
        execFileSync('convert', [tmp, '-resize', '900x900>', '-quality', '82', file]);
        fs.unlinkSync(tmp);
      } catch {
        fs.renameSync(tmp, file);
      }
      card.image = `data/img/${id}.jpg`;
      if (img.croppedArea) card.imageCrop = img.croppedArea;
    }
  }
  return card;
}

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const card = convert(j);
  byId.set(card.id, card);
  console.log(`imported ${card.id}  ${card.name}  [${card.type}${card.colors.length ? ' ' + card.colors.join('/') : ''}]  kw: ${card.keywords.join(', ') || '-'}`);
}

const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(outFile, JSON.stringify(list, null, 2) + '\n');
console.log(`\n${list.length} cards in ${path.relative(root, outFile)}`);
