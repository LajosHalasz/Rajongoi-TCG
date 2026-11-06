// Turn finished riftcardmaker cards into Access row updates (JSON) for tools/access-writer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const imported = JSON.parse(fs.readFileSync(root + 'data/imported.json', 'utf8'));
const dbCards = new Map(JSON.parse(fs.readFileSync(root + 'data/cards.json', 'utf8')).map(c => [c.id, c]));
// usage: node tools/cards-to-access.mjs out.json OGN 171 173 ...   (set code + numbers of finished cards)
const SET = process.argv[3] || 'OGN';
const IDS = process.argv.slice(4).map(Number);

// riftcardmaker markup -> readable plain text (Access "Description" is Text(255))
const plain = (t) => String(t || '')
  .replace(/\{([^#}]+)#[^}]*\}/g, '$1')
  .replace(/__/g, '').replace(/\)(?=\S)/g, ') ')
  .replace(/\[T\]\s*\[(\d+)\]/g, 'Tap + $1').replace(/\[T\]/g, 'Tap').replace(/\[U\]/g, '')
  .replace(/\[\+(\d+)M\]/g, '+$1 Might').replace(/(\d+)\s*\[M\]/g, '$1 Might').replace(/\[(\d+)\]\[M\]/g, '$1 Might').replace(/\[M\]/g, 'Might')
  .replace(/\[([a-z])#[0-9a-f]{6}\]/gi, '[$1]').replace(/\[(\d+)\]/g, '$1')
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, ' / ').replace(/ \/ $/, '').trim();
const cut = (t, n = 255) => (t.length <= n ? t : t.slice(0, n - 1) + '…');
const typeName = (c, db) => {
  if (db && db.type === 'signature') return 'Signature ' + ({ unit: 'Unit', gear: 'Gear' }[db.sigType] || 'Spell');
  return { unit: 'Unit', champion: 'Champion Unit', spell: 'Spell', gear: 'Gear', legend: 'Legend' }[c.type] || 'Unit';
};

const out = [];
for (const n of IDS) {
  const id = `${SET}-${String(n).padStart(3, '0')}`;
  const c = imported.find(x => x.id === id);
  if (!c) { console.error('missing finished card', id); continue; }
  const db = dbCards.get(id);
  const isUnit = ['unit', 'champion'].includes(c.type) || (db && db.type === 'signature' && db.sigType === 'unit');
  out.push({
    ID: n,
    Name: c.subname ? `${c.subname} | ${c.name}` : c.name,
    Type: typeName(c, db),
    'Color 1': c.colors[0] || '',
    'Color 2': c.colors[1] || null,
    Tag: [...new Set(c.tribes.map(t => t[0].toUpperCase() + t.slice(1).toLowerCase()))].join(', '),
    'Shield Trigger': c.keywords.includes('Shield Trigger'),
    FLAG: false,
    Mana: c.cost,
    Might: isUnit ? c.power : 0,
    Recycle: c.recycle || 0,
    Description: cut(plain(c.text)),
    'Flavour Text': cut(plain(c.flavor)),
  });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
for (const r of out) console.log(String(r.ID).padStart(3), r.Type.padEnd(16), (r['Color 1'] + (r['Color 2'] ? '/' + r['Color 2'] : '')).padEnd(11), `M${r.Mana} P${r.Might} R${r.Recycle}`.padEnd(10), r['Shield Trigger'] ? 'ST' : '  ', r.Name, '|', r.Tag);
