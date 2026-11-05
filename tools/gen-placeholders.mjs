#!/usr/bin/env node
// Generates data/cards.json (placeholder cards for OGN + DND) and data/decks.json
// (premade decks). Placeholders have no image; the UI draws generated art.
// Your real cards live in data/imported.json and override placeholders by id.
//
//   node tools/gen-placeholders.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const cards = [];
const counters = { OGN: 4, DND: 0 }; // OGN 001-004 are the real imported cards
const byName = new Map();

function add(set, c) {
  const number = String(++counters[set]).padStart(3, '0');
  const card = {
    id: `${set}-${number}`, set, number, placeholder: true,
    setInfo: `${set} ${number}/300`,
    rarity: c.cost >= 7 ? 'epic' : c.cost >= 5 ? 'rare' : c.cost >= 3 ? 'uncommon' : 'common',
    keywords: [], effects: [], tribes: [],
    ...c,
  };
  cards.push(card);
  byName.set(card.name, card.id);
  return card;
}

// compact constructors
const U = (set, color, name, cost, power, o = {}) => add(set, { name, type: 'unit', colors: [color], cost, power, ...o });
const S = (set, color, name, cost, o = {}) => add(set, { name, type: 'spell', colors: [color], cost, ...o });
const G = (set, color, name, cost, o = {}) => add(set, { name, type: 'gear', colors: [color], cost, ...o });
const C = (set, color, name, cost, power, o = {}) => add(set, { name, type: 'champion', colors: [color], cost, power, ...o });
const L = (set, colors, name, o = {}) => add(set, { name, type: 'legend', colors, cost: 0, ...o });
const SIG = (set, colors, name, sigType, cost, o = {}) => add(set, { name, type: 'signature', sigType, colors, cost, ...o });

// effect shorthands
const destroy = (target, maxPower) => ({ do: 'destroy', target, ...(maxPower != null && { maxPower }) });
const buff = (target, amount, duration = 'turn', on) => ({ do: 'buff', target, amount, duration, ...(on && { on }) });
const draw = (amount = 1, on) => ({ do: 'draw', amount, ...(on && { on }) });
const tap = (target, maxPower) => ({ do: 'tap', target, ...(maxPower != null && { maxPower }) });
const bounce = (target, maxPower) => ({ do: 'bounce', target, ...(maxPower != null && { maxPower }) });
const on = (trigger, e) => ({ ...e, on: trigger });

// =========================================================== OGN =========
const O = 'OGN';
// Fury
U(O, 'Fury', 'Ember Recruit', 1, 2);
U(O, 'Fury', 'Blazing Duelist', 2, 2, { keywords: ['Haste'] });
U(O, 'Fury', 'Molten Brute', 3, 4);
U(O, 'Fury', 'Pyre Berserker', 4, 5, { keywords: ['Breaker'] });
U(O, 'Fury', 'Inferno Titan', 8, 9, { keywords: ['Haste', 'Breaker'] });
S(O, 'Fury', 'Flame Lash', 2, { keywords: ['Action'], effects: [destroy('enemyUnit', 3)] });
S(O, 'Fury', 'War Cry', 1, { keywords: ['Reaction'], effects: [buff('friendlyUnit', 3)] });
G(O, 'Fury', 'Forge of Rage', 2, { effects: [on('activate', buff('friendlyUnit', 2))] });
// Chaos
U(O, 'Chaos', 'Rift Imp', 1, 1, { effects: [{ do: 'discard', amount: 1 }] });
U(O, 'Chaos', 'Gloom Crawler', 2, 3);
U(O, 'Chaos', 'Void Stalker', 3, 3, { effects: [tap('enemyUnit')] });
U(O, 'Chaos', 'Shard Horror', 5, 6, { keywords: ['Breaker'], effects: [draw(1, 'destroyed')] });
S(O, 'Chaos', 'Pawn Storm', 2, { effects: [{ do: 'token', tokenId: 'TKN-001', tokenName: 'Black Pawn', amount: 2 }] });
S(O, 'Chaos', 'Chaos Bolt', 3, { keywords: ['Action'], effects: [destroy('enemyUnit', 5)] });
S(O, 'Chaos', 'Unravel', 2, { keywords: ['Reaction', 'Shield Trigger'], effects: [bounce('anyUnit')] });
S(O, 'Chaos', 'Oblivion Gate', 7, { effects: [destroy('allUnits', 6)] });
G(O, 'Chaos', 'Cursed Idol', 1, { uses: 3, effects: [on('turnStart', { do: 'discard', amount: 1 })] });
// Calm
U(O, 'Calm', 'Seedling', 1, 1, { effects: [{ do: 'channel', amount: 1, tapped: true }] });
U(O, 'Calm', 'Grove Sentinel', 2, 3, { keywords: ['Defensive'] });
U(O, 'Calm', 'Chess Club', 2, 1, { effects: [{ do: 'token', tokenId: 'TKN-002', tokenName: 'White Pawn', amount: 1 }] });
U(O, 'Calm', 'Moss Tortoise', 3, 4, { keywords: ['Defensive'] });
U(O, 'Calm', 'Ancient Oak', 6, 8, { keywords: ['Defensive', 'Breaker'] });
S(O, 'Calm', 'Healing Spring', 2, { keywords: ['Shield Trigger'], effects: [{ do: 'addShield', amount: 1 }] });
S(O, 'Calm', 'Wildgrowth', 1, { effects: [{ do: 'channel', amount: 1 }] });
S(O, 'Calm', "Nature's Wrath", 4, { keywords: ['Action'], effects: [destroy('enemyTappedUnit')] });
G(O, 'Calm', 'Sacred Grove', 2, { effects: [on('activate', { do: 'untap', target: 'friendlyUnit' })] });
// Mind
U(O, 'Mind', 'Arcane Student', 1, 1, { effects: [draw(1)] });
U(O, 'Mind', 'Mirror Mage', 3, 3, { effects: [bounce('enemyUnit', 3)] });
U(O, 'Mind', 'Thought Weaver', 4, 3, { effects: [draw(2)] });
U(O, 'Mind', 'Astral Sentinel', 5, 5, { keywords: ['Defensive'] });
S(O, 'Mind', 'Insight', 2, { effects: [draw(2)] });
S(O, 'Mind', 'Dispel', 3, { keywords: ['Reaction', 'Shield Trigger'], effects: [bounce('enemyUnit', 4)] });
S(O, 'Mind', 'Mind Storm', 6, { effects: [draw(2), tap('allEnemyUnits')] });
G(O, 'Mind', 'Spellbook Archive', 3, { uses: 3, effects: [on('activate', draw(1))] });

// Legend: Varok (Fury/Chaos)
L(O, ['Fury', 'Chaos'], 'Varok, Ashen Warlord', { effects: [{ on: 'static', do: 'buff', target: 'allFriendlyUnits', amount: 1, filter: { color: 'Fury' } }] });
C(O, 'Fury', 'Varok, Blade of Cinders', 4, 5, { keywords: ['Haste'] });
C(O, 'Chaos', 'Mara, Rift Witch', 3, 3, { effects: [destroy('enemyUnit', 2)] });
C(O, 'Fury', 'Grix, Ash Goblin', 5, 5, { keywords: ['Breaker'], effects: [on('attack', buff('self', 1))] });
SIG(O, ['Fury', 'Chaos'], 'Cinderstorm', 'spell', 9, { tribes: ['Varok'], effects: [destroy('allEnemyUnits', 5)] });
SIG(O, ['Fury', 'Chaos'], "Varok's Warbanner", 'gear', 1, { tribes: ['Varok'], effects: [{ on: 'static', do: 'buff', target: 'allFriendlyUnits', amount: 1 }] });
// Legend: Selwyn (Calm/Mind)
L(O, ['Calm', 'Mind'], 'Selwyn, Tidewarden', { effects: [{ on: 'static', do: 'buff', target: 'allFriendlyUnits', amount: 1, filter: { keyword: 'Defensive' } }] });
C(O, 'Calm', 'Selwyn, Keeper of the Tide', 4, 4, { keywords: ['Defensive', 'Shieldify'], effects: [{ do: 'shieldify', amount: 1 }] });
C(O, 'Mind', 'Orin, Star Scholar', 3, 2, { effects: [draw(2)] });
C(O, 'Calm', 'Thalia, Grove Mother', 6, 6, { keywords: ['Defensive'], effects: [{ do: 'addShield', amount: 1 }] });
SIG(O, ['Calm', 'Mind'], 'Riptide Ward', 'spell', 1, { tribes: ['Selwyn'], keywords: ['Reaction'], effects: [bounce('enemyUnit', 3)] });
SIG(O, ['Calm', 'Mind'], 'Tidal Colossus', 'unit', 10, { tribes: ['Selwyn'], power: 10, keywords: ['Defensive', 'Breaker'], effects: [tap('allEnemyUnits')] });

// =========================================================== DND =========
const D = 'DND';
// Body
U(D, 'Body', 'Tavern Brawler', 1, 2);
U(D, 'Body', 'Orc Bruiser', 3, 4, { keywords: ['Haste'] });
U(D, 'Body', 'Dire Bear', 4, 5, { keywords: ['Breaker'] });
U(D, 'Body', 'Hill Giant', 5, 7);
U(D, 'Body', 'Mountain Behemoth', 9, 11, { keywords: ['Defensive', 'Breaker'] });
S(D, 'Body', 'Second Wind', 1, { keywords: ['Reaction'], effects: [buff('friendlyUnit', 2), { do: 'untap', target: 'friendlyUnit' }] });
S(D, 'Body', 'Barbarian Rage', 2, { keywords: ['Action'], effects: [buff('friendlyUnit', 4)] });
S(D, 'Body', 'Earthshaker', 6, { effects: [tap('allEnemyUnits'), buff('allFriendlyUnits', 1)] });
G(D, 'Body', 'Training Dummy', 1, { effects: [on('activate', buff('friendlyUnit', 1))] });
// Order
U(D, 'Order', 'Squire', 1, 2, { keywords: ['Defensive'] });
U(D, 'Order', 'Temple Cleric', 2, 2, { effects: [{ do: 'recover' }] });
U(D, 'Order', 'Town Guard', 3, 3, { keywords: ['Defensive', 'Shieldify'], effects: [{ do: 'shieldify', amount: 1 }] });
U(D, 'Order', 'Paladin of the Oath', 4, 5, { keywords: ['Defensive'] });
S(D, 'Order', 'Divine Smite', 3, { keywords: ['Action', 'Shield Trigger'], effects: [destroy('enemyUnit', 4)] });
S(D, 'Order', 'Shield of Faith', 1, { keywords: ['Reaction'], effects: [buff('friendlyUnit', 3)] });
S(D, 'Order', 'Mass Sanctuary', 7, { effects: [{ do: 'addShield', amount: 2 }, { do: 'untap', target: 'allFriendlyUnits' }] });
G(D, 'Order', 'Holy Relic', 2, { uses: 2, effects: [on('turnStart', { do: 'addShield', amount: 1 })] });
// Mind
U(D, 'Mind', 'Scrying Owl', 1, 1, { effects: [draw(1)] });
U(D, 'Mind', 'Apprentice Wizard', 2, 2, { effects: [draw(1)] });
U(D, 'Mind', 'Illusionist', 3, 2, { effects: [tap('enemyUnit')] });
U(D, 'Mind', 'Archivist Golem', 5, 5, { effects: [draw(1)] });
S(D, 'Mind', 'Magic Missile', 1, { keywords: ['Action'], effects: [destroy('enemyUnit', 2)] });
S(D, 'Mind', 'Counterspell', 2, { keywords: ['Reaction'], effects: [bounce('enemyUnit')] });
S(D, 'Mind', 'Time Stop', 8, { effects: [tap('allEnemyUnits'), draw(2)] });
G(D, 'Mind', 'Crystal Ball', 2, { activateCost: 1, effects: [on('activate', draw(1))] });
// Fury
U(D, 'Fury', 'Kobold Skirmisher', 1, 1, { keywords: ['Haste'] });
U(D, 'Fury', 'Flame Dancer', 2, 3);
U(D, 'Fury', 'Dragon Whelp', 3, 3, { effects: [on('attack', buff('self', 2))] });
U(D, 'Fury', 'Fire Elemental', 4, 4, { keywords: ['Haste'], effects: [destroy('enemyUnit', 1)] });
U(D, 'Fury', 'Ancient Wyrm', 10, 12, { keywords: ['Haste', 'Breaker'] });
S(D, 'Fury', 'Scorching Ray', 3, { keywords: ['Action'], effects: [destroy('enemyUnit', 4)] });
S(D, 'Fury', 'Fireball', 4, { effects: [destroy('allEnemyUnits', 2)] });
G(D, 'Fury', 'Brazier of Flames', 2, { effects: [on('turnStart', buff('allFriendlyUnits', 1))] });

// Legend: Brenna (Body/Order)
L(D, ['Body', 'Order'], 'Brenna, Oathsworn', { effects: [on('turnStart', buff('allFriendlyUnits', 1))] });
C(D, 'Order', 'Brenna, Shieldmaiden', 4, 5, { keywords: ['Defensive'], effects: [on('destroyed', { do: 'addShield', amount: 1 })] });
C(D, 'Body', 'Torg, Mountain Born', 5, 6, { keywords: ['Breaker'] });
C(D, 'Order', 'Elric, Holy Knight', 3, 3, { keywords: ['Haste'], effects: [{ do: 'recover' }] });
SIG(D, ['Body', 'Order'], "Oathkeeper's Stand", 'spell', 1, { tribes: ['Brenna'], keywords: ['Reaction', 'Shield Trigger'], effects: [buff('allFriendlyUnits', 2)] });
SIG(D, ['Body', 'Order'], 'Citadel Golem', 'unit', 8, { tribes: ['Brenna'], power: 9, keywords: ['Defensive', 'Shieldify'], effects: [{ do: 'shieldify', amount: 2 }] });
// Legend: Zara (Mind/Fury)
L(D, ['Mind', 'Fury'], 'Zara, Flamecaller', { effects: [on('spellCast', buff('allFriendlyUnits', 1))] });
C(D, 'Mind', 'Zara, Archmage', 4, 3, { effects: [destroy('enemyUnit', 3)] });
C(D, 'Fury', 'Pip, Firebrand', 3, 3, { keywords: ['Haste'] });
C(D, 'Mind', 'Korr, Storm Sorcerer', 6, 5, { effects: [tap('enemyUnit'), draw(1)] });
SIG(D, ['Mind', 'Fury'], 'Meteor Rain', 'spell', 10, { tribes: ['Zara'], effects: [destroy('allEnemyUnits', 6), { do: 'breakShield', amount: 1 }] });
SIG(D, ['Mind', 'Fury'], "Zara's Familiar", 'unit', 1, { tribes: ['Zara'], power: 1, keywords: ['Haste'], effects: [draw(1)] });

// ========================================================== decks =========
// Real (imported) cards referenced by name -> id
const REAL = {
  'Pizza with virsli and fries': 'OGN-001', 'Christmas Villamos': 'OGN-002',
  'Snowball fight': 'OGN-003', 'Te buzi vagy!': 'OGN-004',
};
const id = (n) => REAL[n] || byName.get(n) || (() => { throw new Error('no card ' + n); })();

function deck(did, name, legend, champion, signature, list, runes) {
  const cardsMap = {};
  for (const n of list) cardsMap[id(n)] = 1;
  if (Object.keys(cardsMap).length !== 20) throw new Error(`${name}: ${Object.keys(cardsMap).length} cards`);
  return { id: did, name, premade: true, legend: id(legend), champion: id(champion), signature: id(signature), cards: cardsMap, runes };
}

const decks = [
  deck('pre-varok', 'Varok — Ashen Assault', 'Varok, Ashen Warlord', 'Varok, Blade of Cinders', 'Cinderstorm', [
    'Varok, Blade of Cinders', 'Mara, Rift Witch', 'Grix, Ash Goblin', 'Cinderstorm', "Varok's Warbanner",
    'Ember Recruit', 'Rift Imp', 'Blazing Duelist', 'Gloom Crawler', 'Molten Brute', 'Void Stalker', 'Pyre Berserker', 'Inferno Titan',
    'War Cry', 'Flame Lash', 'Pawn Storm', 'Te buzi vagy!', 'Chaos Bolt', 'Oblivion Gate',
    'Forge of Rage',
  ], { Fury: 6, Chaos: 6 }),
  deck('pre-selwyn', 'Selwyn — Tide & Pizza', 'Selwyn, Tidewarden', 'Selwyn, Keeper of the Tide', 'Riptide Ward', [
    'Selwyn, Keeper of the Tide', 'Orin, Star Scholar', 'Thalia, Grove Mother', 'Riptide Ward', 'Tidal Colossus',
    'Arcane Student', 'Grove Sentinel', 'Chess Club', 'Pizza with virsli and fries', 'Mirror Mage', 'Christmas Villamos', 'Thought Weaver', 'Ancient Oak',
    'Wildgrowth', 'Insight', 'Healing Spring', 'Dispel', 'Snowball fight', 'Mind Storm',
    'Spellbook Archive',
  ], { Calm: 6, Mind: 6 }),
  deck('pre-brenna', 'Brenna — Iron Oath', 'Brenna, Oathsworn', 'Brenna, Shieldmaiden', "Oathkeeper's Stand", [
    'Brenna, Shieldmaiden', 'Torg, Mountain Born', 'Elric, Holy Knight', "Oathkeeper's Stand", 'Citadel Golem',
    'Tavern Brawler', 'Squire', 'Temple Cleric', 'Orc Bruiser', 'Town Guard', 'Dire Bear', 'Paladin of the Oath', 'Mountain Behemoth',
    'Second Wind', 'Shield of Faith', 'Barbarian Rage', 'Divine Smite', 'Earthshaker', 'Mass Sanctuary',
    'Holy Relic',
  ], { Body: 6, Order: 6 }),
  deck('pre-zara', 'Zara — Spellfire', 'Zara, Flamecaller', 'Zara, Archmage', "Zara's Familiar", [
    'Zara, Archmage', 'Pip, Firebrand', 'Korr, Storm Sorcerer', 'Meteor Rain', "Zara's Familiar",
    'Kobold Skirmisher', 'Scrying Owl', 'Apprentice Wizard', 'Flame Dancer', 'Dragon Whelp', 'Illusionist', 'Fire Elemental', 'Ancient Wyrm',
    'Magic Missile', 'Counterspell', 'Insight', 'Scorching Ray', 'Fireball', 'Time Stop',
    'Crystal Ball',
  ], { Mind: 6, Fury: 6 }),
];

fs.writeFileSync(path.join(root, 'data', 'cards.json'), JSON.stringify(cards, null, 1) + '\n');
fs.writeFileSync(path.join(root, 'data', 'decks.json'), JSON.stringify(decks, null, 2) + '\n');
console.log(`${cards.length} placeholder cards, ${decks.length} decks`);
