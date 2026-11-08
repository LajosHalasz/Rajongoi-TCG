// Card database + helpers. Pure JS (no DOM) so it runs in Node tests too.
import { KEYWORDS } from './rules.js';

let DB = new Map();

/** Register card definitions. `overrides` (id -> partial def) is merged on top. */
export function setCardDb(list, overrides = {}) {
  DB = new Map();
  for (const raw of list) {
    const c = normalize({ ...raw, ...(overrides[raw.id] || {}) });
    DB.set(c.id, c);
  }
  return DB;
}

/**
 * Database cards + finished (riftcardmaker) cards. A finished card overrides the
 * database row with the same id, but keeps the database's Champion/Signature type
 * (riftcardmaker exports those as plain units/spells) and its owner/purpose info.
 */
export function mergeSources(dbCards, imported) {
  const byId = new Map(dbCards.map(c => [c.id, c]));
  for (const c of imported) {
    const db = byId.get(c.id);
    const m = { ...(db || {}), ...c };
    // riftcardmaker can't mark a card as Signature, so that type comes from the database
    if (db && db.type === 'signature' && ['unit', 'spell', 'gear'].includes(c.type)) {
      m.type = db.type;
      if (db.sigType) m.sigType = db.sigType;
    }
    // a finished card without parsed logic keeps the database's real (non-provisional) logic
    if (db && !(c.effects || []).length) m.effects = db.provisionalEffect ? [] : (db.effects || []);
    if (db && db.provisionalEffect && c.uses == null) delete m.uses;
    if (db) m.keywords = [...new Set([...(c.keywords || []), ...(db.keywords || [])])];
    delete m.provisional; delete m.provisionalEffect; delete m.placeholder;
    m.wip = false;
    byId.set(c.id, m);
  }
  return [...byId.values()];
}

/** common | uncommon | rare | epic (legendary/showcase count as epic). */
export function rarityOf(def) {
  const r = String(def.rarity || '').toLowerCase();
  if (['epic', 'legendary', 'showcase', 'overnumbered'].includes(r)) return 'epic';
  if (['common', 'uncommon', 'rare'].includes(r)) return r;
  return 'common';
}

export function getDef(id) {
  const d = DB.get(id);
  if (!d) throw new Error(`Unknown card id: ${id}`);
  return d;
}
export function hasDef(id) { return DB.has(id); }
export function allCards() { return [...DB.values()]; }

/** Finished artwork, used as tinted placeholder art for cards that have none yet. */
export function artPool() { return allCards().filter(c => c.image); }

export function normalize(c) {
  const def = {
    keywords: [], effects: [], colors: [], tribes: [], cost: 0, power: 0,
    rarity: 'common', flavor: '', image: null, illustrator: '',
    ...c,
  };
  def.colors = (def.colors || []).map(cap);
  def.type = (def.type || 'unit').toLowerCase();
  applyRarityRules(def);
  // "Videogame" is just "Game"
  def.tribes = (def.tribes || []).map(t => (/^video ?game$/i.test(String(t).trim()) ? 'Game' : t));
  if (def.type === 'signature' && !def.sigType) def.sigType = 'spell';
  def.recycle = def.recycle || 0;
  def.text = def.text && def.text.trim() ? def.text : describe(def);
  if (def.provisionalEffect) def.text = `{Provisional#7A7A7A}__(placeholder effect until this card is designed)__\n${def.text}`;
  return def;
}

/** EPIC: The Musical cards ("EPIC - The Ithaca Saga", ...). */
export const isEpicMusical = (def) => /^EPIC\b/.test(String(def.name || ''));

/**
 * Rarity ground rules (they win over whatever a card was added with):
 *   Legend -> Rare · Signature, EPIC: The Musical, full-art cards and full-art Runes -> Epic ·
 *   any other card listed as Epic -> Rare.
 */
export function applyRarityRules(def) {
  if (def.type === 'legend') def.rarity = 'rare';
  else if (def.type === 'signature' || isEpicMusical(def) || def.fullArtRune || (def.fullArt && def.image)) def.rarity = 'epic';
  else if (rarityOf(def) === 'epic') def.rarity = 'rare';
  return def;
}

const cap = (s) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

/** How the card behaves on the table: 'unit' | 'spell' | 'gear' | 'legend' */
export function kindOf(def) {
  switch (def.type) {
    case 'unit': case 'champion': case 'token': return 'unit';
    case 'spell': return 'spell';
    case 'gear': return 'gear';
    case 'legend': return 'legend';
    case 'rune': return 'rune';
    case 'signature': return def.sigType || 'spell';
    default: return 'unit';
  }
}

/** "Varok, Ashen Warlord" -> "Varok" — used to link Legend / Champion / Signature. */
export function baseName(name) { return String(name || '').split(/[|,]/)[0].trim().toLowerCase(); }

export function championMatchesLegend(champ, legend) {
  if (!champ || !legend) return false;
  const names = [legend.name, legend.subname, ...(legend.championNames || [])].filter(Boolean).map(baseName);
  // finished cards carry the person in the subname ("Miniature Painter" / "Lui")
  return names.includes(baseName(champ.name)) || (!!champ.subname && names.includes(baseName(champ.subname)));
}
export function signatureMatchesLegend(sig, legend) {
  if (!sig || !legend) return false;
  if (sig.legend) return sig.legend === legend.id;
  return (sig.tribes || []).some(t => baseName(t) === baseName(legend.name));
}

// ---------------------------------------------------------------------------
// Rules-text generation (riftcardmaker-compatible markup):
//   {Keyword#HEX}  -> coloured keyword badge
//   __text__       -> italic reminder text
//   [N]            -> mana icon, [T] tap icon, [M] might icon
// ---------------------------------------------------------------------------

export function keywordMarkup(kw, n) {
  const k = KEYWORDS[kw];
  if (!k) return `{${kw}#555555}`;
  const label = n != null ? `${kw} ${n}` : kw;
  const reminder = k.reminder.replace('[N]', `[${n ?? 1}]`);
  return `{${label}#${k.hex.replace('#', '')}}__(${reminder})__`;
}

const TARGET_TEXT = {
  enemyUnit: 'target enemy Unit',
  friendlyUnit: 'target friendly Unit',
  anyUnit: 'target Unit',
  enemyTappedUnit: 'target tapped enemy Unit',
  enemyGear: 'target enemy Gear',
  allEnemyUnits: 'all enemy Units',
  allFriendlyUnits: 'all your Units',
  allUnits: 'all Units',
  self: 'this Unit',
  played: 'that Unit',
};

const TRIGGER_TEXT = {
  play: (d) => (kindOf(d) === 'spell' ? '' : 'When you play this: '),
  attack: () => 'When this attacks: ',
  destroyed: () => 'When this is destroyed: ',
  turnStart: () => 'At the start of your turn: ',
  unitPlayed: () => 'Whenever you play a Unit: ',
  spellCast: () => 'Whenever you cast a Spell: ',
  static: () => '',
  lowShields: () => 'When you are down to 1 shield or less: ',
  tribeCombo: () => 'Once per turn, if you have played both a Movie and a Game card: ',
  activate: (d) => `[T]${d.activateCost ? ` + [${d.activateCost}]` : ''}: `,
};

export function describeEffect(e, def) {
  const t = TARGET_TEXT[e.target] || 'target Unit';
  const n = e.amount ?? 1;
  const f = e.filter || {};
  const pw = (e.maxPower != null ? ` with [M]${e.maxPower} or less` : '')
    + (f.notType ? ` (not ${f.notType === 'champion' ? 'a Champion' : f.notType})` : '')
    + (f.color ? ` (${f.color} only)` : '') + (f.notColor ? ` (non-${f.notColor})` : '');
  const dur = e.duration === 'permanent' ? '' : ' this turn';
  switch (e.do) {
    case 'draw': return e.who === 'opponent' ? `Your opponent draws ${n}.` : `Draw ${n}.`;
    case 'destroy': return `Destroy ${t}${pw}.`;
    case 'buff': {
      if (e.on === 'static') {
        const who = `Your ${f.color ? f.color + ' ' : ''}Units${f.keyword ? ' with ' + f.keyword : ''}`;
        return `${who} have ${n >= 0 ? '+' : ''}${n} [M].`;
      }
      return n >= 0 ? `Give ${t} +${n} [M]${dur}.` : `Reduce ${t}'s [M]Might by [${-n}]${dur === ' this turn' ? ' until the end of this turn' : ''}.`;
    }
    case 'tap': return `Tap [T] ${t}${pw}.`;
    case 'untap': return `Ready ${t}.`;
    case 'bounce': return `Return ${t}${pw} to its owner's hand.`;
    case 'breakShield': return `Break ${n} of your opponent's shields.`;
    case 'addShield': return `Put the top ${n} card${n > 1 ? 's' : ''} of your deck into your Shield Zone.`;
    case 'shieldify': return keywordMarkup('Shieldify', n);
    case 'channel': return `Channel ${n} extra rune${n > 1 ? 's' : ''}${e.tapped ? ' tapped' : ''}.`;
    case 'discard': return `Your opponent discards ${n} random card${n > 1 ? 's' : ''}.`;
    case 'recover': return `Return a Unit from your Graveyard to your hand.`;
    case 'seizure': return 'Banish all Units on the Field, and enter Seizure.';
    case 'contract': return 'Your opponent draws 1 card. At the start of your next turn, if they have more cards in hand than you, destroy their strongest Unit.';
    case 'cantLose': return "You can't lose the game this turn.";
    case 'grantKeyword': return `Give ${t} ${e.keyword}${dur}.`;
    case 'copyUnit': return `Copy ${t}${pw}; the copy has Haste and dies at the end of this turn.`;
    case 'artDiscount': return 'Your other Art cards cost [1] this turn; any played this way are banished at the end of your turn.';
    case 'nextDiscount': return `The next ${e.tribes ? e.tribes.join(' or ') : e.color} card${e.thisTurn ? ' this turn' : ''} costs [${n}] less.`;
    case 'drawKeepTribe': return `Draw [${n}] cards. Keep the ${e.tribe} cards, shuffle the rest back into your deck.`;
    case 'recoverTribe': return `Return a ${(e.tribes || []).join(' or ')} card from your Graveyard to your hand.`;
    case 'lastPlayBuff': return `If this is the last card you play this turn, give ${t} +${n} [M] and ${e.keyword}.`;
    case 'tutor': return `Search your deck for a ${e.kind === 'spell' ? 'Spell' : 'Unit'}${e.name ? ` named ${e.name}` : ''}, put it into your hand, then shuffle.`;
    case 'mightPerRune': return `Has [+${n}M] for each ${e.color} rune in your Mana Zone.`;
    case 'token': return `Create ${n > 1 ? n + ' ' : 'a '}${e.tokenName || 'token'}${n > 1 ? 's' : ''}.`;
    default: return e.text || '';
  }
}

export function describe(def) {
  const lines = [];
  for (const kw of def.keywords || []) {
    if (kw === 'Shieldify') continue; // rendered from its effect (has a number)
    lines.push(keywordMarkup(kw));
  }
  if (def.uses) lines.push(`{Saga ${def.uses}#8A6D3B}__(Expires after ${def.uses} uses.)__`);
  // group effects by trigger so "When you play this:" is printed once
  const groups = new Map();
  for (const e of def.effects || []) {
    if (e.do === 'shieldify') { lines.push(describeEffect(e, def)); continue; }
    const on = e.on || 'play';
    if (!groups.has(on)) groups.set(on, []);
    groups.get(on).push(describeEffect(e, def));
  }
  for (const [on, parts] of groups) lines.push((TRIGGER_TEXT[on] || (() => ''))(def) + parts.join(' '));
  if (def.afterCast === 'deckTop') lines.push('Then put this card on top of your deck.');
  return lines.join('\n');
}
