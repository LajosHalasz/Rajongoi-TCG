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
import { buildDataJs } from './build-data.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outFile = path.join(root, 'data', 'imported.json');
const imgDir = path.join(root, 'data', 'img');
fs.mkdirSync(imgDir, { recursive: true });

const fresh = process.argv.includes('--fresh'); // rebuild imported.json from the given files only
const files = process.argv.slice(2).filter(a => a !== '--fresh');
if (!files.length) {
  console.error('usage: node tools/import-riftcardmaker.mjs card1.json [card2.json ...]');
  process.exit(1);
}

const existing = !fresh && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
const byId = new Map(existing.map(c => [c.id, c]));

// ---- reconcile with the Access database (data/cards.json) by name -------------
const dbFile = path.join(root, 'data', 'cards.json');
const dbCards = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')).filter(c => !c.placeholder && !c.filler) : [];
const norm = (n) => String(n || '').split(/[|,(]/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const similar1 = (a, b) => !!a && !!b && (a === b || 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.75);
// renamed with a suffix ("Manyika" -> "Manyika Dreadnought"), compared on base names only
const prefixed = (a, b) => { a = norm(a.name ?? a); b = norm(b.name ?? b); return Math.min(a.length, b.length) >= 6 && (a.startsWith(b) || b.startsWith(a)); };
const flat = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const variants = (c) => {
  const v = new Set([norm(c.name), flat(c.name)]);
  for (const part of String(c.name || '').split('|')) v.add(flat(part));
  if (c.subname) { v.add(flat(c.subname + c.name)); v.add(flat(c.name + c.subname)); }
  v.delete('');
  return [...v];
};
const similar = (a, b) => {
  const A = typeof a === 'string' ? [norm(a), flat(a)] : variants(a), B = typeof b === 'string' ? [norm(b), flat(b)] : variants(b);
  return A.some(x => B.some(y => similar1(x, y)));
};
const family = (t) => (['unit', 'champion', 'token'].includes(t) ? 'unit' : t);
const sameFamily = (a, b) => family(a.type) === family(b.type) || a.type === 'signature' || b.type === 'signature';
function reconcile(card) {
  if (card.set === 'TKN' || card.set === 'RUN') return card;
  const atId = dbCards.find(c => c.id === card.id);
  // same printed number + similar name: same card, even if it was redesigned to another type
  if (atId && (similar(atId, card) || prefixed(atId, card))) return card;
  // same number, same kind of card, same colours and cost: a renamed redesign of that row
  if (atId && family(atId.type) === family(card.type) && atId.cost === card.cost
      && [...atId.colors].sort().join() === [...card.colors].sort().join()) {
    console.log(`  note: ${card.id} "${card.name}" replaces database card "${atId.name}" (same number, type, colour and cost)`);
    return card;
  }
  const byName = dbCards.find(c => c.set === card.set && similar(c, card) && sameFamily(c, card));
  if (byName) {
    console.log(`  note: ${card.id} "${card.name}" matches database card ${byName.id} "${byName.name}" -> using ${byName.id}`);
    if (card.image) {
      const to = `data/img/${byName.id}.jpg`;
      fs.renameSync(path.join(root, card.image), path.join(root, to));
      card.image = to;
    }
    card.id = byName.id; card.number = byName.number;
  } else if (atId) {
    console.log(`  note: ${card.id} "${card.name}" is new; database row ${atId.id} "${atId.name}" gets renumbered by the next database import`);
  }
  return card;
}

const KNOWN = new Set(['Shield Trigger', 'Defensive', 'Deathtouch', 'Nostalgia Line', 'Haste', 'Breaker', 'Action', 'Reaction', 'Being Áron']);

function parseSetInfo(info = '') {
  const m = info.trim().match(/^([A-Za-z]+)[\s-]*(\d+)/);
  if (!m) return { set: 'MISC', number: '000' };
  let set = m[1].toUpperCase();
  if (set === 'TOKEN') set = 'TKN';
  return { set, number: m[2] };
}

const slug = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const baseName = (n) => String(n || '').split(/[|,]/)[0].trim();

function writeLayer(im, base) {
  const [, ext, b64] = im.src.match(/^data:image\/(\w+);base64,(.*)$/s) || [];
  const tmp = path.join(imgDir, `${base}.${ext === 'jpeg' ? 'jpg' : ext || 'png'}`);
  fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
  return tmp;
}

// riftcardmaker export v9+ stores type / colour / rarity as numeric codes
const TYPE_CODES = { 1: 'legend', 2: 'champion', 3: 'unit', 4: 'spell', 5: 'gear', 6: 'rune', 7: 'token' };
const COLOR_CODES = { 1: 'fury', 2: 'calm', 3: 'mind', 4: 'body', 5: 'chaos', 6: 'order' };
const RARITY_CODES = { 1: 'common', 2: 'common', 3: 'common', 4: 'uncommon', 5: 'rare', 6: 'epic', 7: 'epic' };
const decode = (v, map) => (v != null && /^\d+$/.test(String(v)) ? map[+v] : v);

function convert(j) {
  j = { ...j, type: decode(j.type, TYPE_CODES), color: decode(j.color, COLOR_CODES), secondColor: decode(j.secondColor, COLOR_CODES),
    rarity: decode(j.rarity, RARITY_CODES), tribes: j.tribes || j.tags };
  let { set, number } = parseSetInfo(j.setInfo);
  let type = String(j.type || 'unit').toLowerCase();
  if (set === 'TKN') type = 'token';
  if (type.includes('champion')) type = 'champion';
  const colors = [j.color, j.secondColor].flatMap(c => String(c || '').split(/[^a-zA-Z]+/))
    .filter(c => c && c.toLowerCase() !== 'neutral')
    .map(c => c[0].toUpperCase() + c.slice(1).toLowerCase());
  let owners = [];
  let id = `${set}-${number}`;
  if (type === 'legend') {
    // Legends are keyed by their owner so they replace that deck's placeholder Legend
    // the deck owner is in the name ("Matyi | Always on time") or, on newer exports, in the subname ("Lui")
    const knownOwners = new Set(dbCards.flatMap(c => c.owners || []).map(o => o.toLowerCase()));
    const sub = (j.subname || '').trim();
    const owner = (sub && knownOwners.has(sub.toLowerCase()) ? sub : '') || baseName(j.name) || j.illustrator;
    owners = [owner];
    // "OGN L02/300" or "L02 OGN": the set is the letters-only part
    set = (String(j.setInfo || '').match(/\b([A-Za-z]{3})\b/)?.[1] || 'OGN').toUpperCase();
    number = 'L-' + slug(owner);
    id = `${set}-${number}`;
  } else if (type === 'rune') {
    const owner = (String(j.setInfo || '').split('-')[1] || j.illustrator || 'basic').trim();
    owners = [owner];
    set = 'RUN';
    number = `${colors[0] || 'Rune'}-${slug(owner)}${(j.name || '').trim() ? '' : '-fullart'}`;
    id = `${set}-${number}`;
  }

  const keywords = [];
  const effects = [];
  for (const m of String(j.description || '').matchAll(/\{([^#}]+)#[^}]*\}/g)) {
    const raw = m[1].trim();
    const num = raw.match(/^(.*?)\s+(\d+)$/);
    if (raw === 'Double Breaker') keywords.push('Breaker');
    else if (num && num[1] === 'Shieldify') {
      keywords.push('Shieldify');
      effects.push({ on: 'play', do: 'shieldify', amount: +num[2] });
    } else if (KNOWN.has(raw)) keywords.push(raw);
    else keywords.push(raw); // unknown keyword: shown on the card, no game logic
  }

  const card = {
    id, set, number, name: (j.name || '').trim() || `${colors[0] || ''} Rune`.trim(), type,
    ...(type === 'rune' && !(j.name || '').trim() ? { fullArtRune: true } : {}), ...(j.subname ? { subname: j.subname.trim() } : {}),
    ...(owners.length ? { owners } : {}),
    colors, cost: j.energy ?? 0, power: j.might ?? 0,
    keywords, effects,
    tribes: (j.tribes || []).map(t => t.text).filter(Boolean),
    text: j.description || '',
    flavor: j.flavorText || '',
    rarity: j.rarity || (['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(j.rarityIcon) ? j.rarityIcon : 'common'),
    illustrator: j.illustrator || '',
    setInfo: j.setInfo || '',
    source: 'riftcardmaker',
  };
  if (type === 'token') card.token = true;
  card.recycle = j.power != null && j.power > 0 ? j.power : 0; // riftcardmaker 'power' = runes to recycle

  const layers = (j.images || []).filter(im => /^data:image\//.test(im.src || ''))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (layers.length === 1) {
    const img = layers[0];
    const tmp = writeLayer(img, `${id}.src`);
    const file = path.join(imgDir, `${id}.jpg`);
    try {
      execFileSync('convert', [tmp, '-auto-orient', '-resize', '900x900>', '-quality', '82', file]);
      fs.unlinkSync(tmp);
    } catch {
      fs.renameSync(tmp, file);
    }
    card.image = `data/img/${id}.jpg`;
    if (img.croppedArea) card.imageCrop = img.croppedArea;
  } else if (layers.length > 1) {
    // Several image layers (e.g. full-art runes): composite them the way riftcardmaker
    // places them onto the card, so the game shows exactly what the editor shows.
    const W = 900, H = Math.round(900 * 2000 / 1433);
    const args = ['-size', `${W}x${H}`, 'xc:#000'];
    const tmps = [];
    layers.forEach((im, i) => {
      const tmp = writeLayer(im, `${id}.layer${i}`);
      tmps.push(tmp);
      const [iw, ih] = execFileSync('identify', ['-format', '%w %h', tmp]).toString().split(' ').map(Number);
      const c = im.croppedArea || { x: 0, y: 0, width: 100, height: 100 };
      const sx = W / (iw * c.width / 100), sy = H / (ih * c.height / 100);
      const ox = Math.round(-c.x / 100 * iw * sx), oy = Math.round(-c.y / 100 * ih * sy);
      const op = im.opacity ?? 1;
      args.push('(', tmp, '-auto-orient', '-resize', `${Math.round(iw * sx)}x${Math.round(ih * sy)}!`, '-alpha', 'set',
        '-channel', 'A', '-evaluate', 'multiply', String(op), '+channel', ')',
        '-geometry', `${ox >= 0 ? '+' : ''}${ox}${oy >= 0 ? '+' : ''}${oy}`, '-composite');
    });
    const file = path.join(imgDir, `${id}.jpg`);
    execFileSync('convert', [...args, '-quality', '85', file]);
    tmps.forEach(t => fs.unlinkSync(t));
    card.image = `data/img/${id}.jpg`;
    card.imageCrop = { x: 0, y: 0, width: 100, height: 100 };
    console.log(`  note: ${id} has ${layers.length} image layers - composited into one picture`);
  }
  return card;
}

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const card = reconcile(convert(j));
  byId.set(card.id, card);
  console.log(`imported ${card.id}  ${card.name}  [${card.type}${card.colors.length ? ' ' + card.colors.join('/') : ''}]  kw: ${card.keywords.join(', ') || '-'}`);
}

const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(outFile, JSON.stringify(list, null, 2) + '\n');
console.log(`\n${list.length} cards in ${path.relative(root, outFile)}`);
buildDataJs();
