// Core rule constants. Tweak here to rebalance the game.
export const RULES = {
  DECK_SIZE: 20,          // main deck (Legend + tokens not counted)
  MAX_COPIES: 1,          // singleton
  MIN_CHAMPIONS: 1,
  MAX_CHAMPIONS: 3,
  MAX_SIGNATURES: 2,
  RUNE_DECK_SIZE: 12,     // Mana Deck
  SHIELDS: 5,
  OPENING_HAND: 5,
  MULLIGAN_MAX: 2,
  CHANNEL_PER_TURN: 2,
  CHANNEL_SECOND_PLAYER_FIRST_TURN: 3,
  GEAR_SLOTS: 2,
  MAX_TURNS: 80,          // safety valve (total turns, both players)
};

// Soft deck-building guidance (shown as warnings, not enforced).
export const GUIDE = {
  units: [6, 9],
  champions: [1, 3],
  spells: [6, 9],
  gears: [0, 2],
  signatures: [0, 2],
  avgCost: 4.0,
  curve: { 1: 3, 2: 4, 3: 4, 4: 3, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 },
};

export const COLORS = {
  Fury:  { hex: '#d8433b', label: 'Fury' },
  Calm:  { hex: '#4b9a4b', label: 'Calm' },
  Mind:  { hex: '#3b82c8', label: 'Mind' },
  Body:  { hex: '#e07f27', label: 'Body' },
  Chaos: { hex: '#8e4fc4', label: 'Chaos' },
  Order: { hex: '#d6b02c', label: 'Order' },
};

// Color of the type badge above the name.
export const TYPE_INFO = {
  legend:    { label: 'Legend',    hex: '#b8892a' },
  champion:  { label: 'Champion',  hex: '#b23a55' },
  unit:      { label: 'Unit',      hex: '#4f8f3a' },
  spell:     { label: 'Spell',     hex: '#2f7fa8' },
  gear:      { label: 'Gear',      hex: '#7a6a55' },
  signature: { label: 'Signature', hex: '#7b3fa6' },
  token:     { label: 'Token',     hex: '#5d5d5d' },
  rune:      { label: 'Rune',      hex: '#8a7a63' },
};

export const KEYWORDS = {
  'Shield Trigger': { hex: '#CE356B', reminder: 'If you got this from your Shield Zone, you may play it immediately for [0] mana.' },
  'Shieldify':      { hex: '#21705B', reminder: 'When you play this, put [N] card(s) in your Shield Zone from your hand.' },
  'Defensive':      { hex: '#CE356B', reminder: 'When an enemy Unit attacks, you may [T] this to redirect the attack to this Unit.' },
  'Deathtouch':     { hex: '#94B131', reminder: 'Whenever this Unit loses in a fight, destroy the Unit that killed it.' },
  'Nostalgia Line': { hex: '#CE356B', reminder: 'This can attack the turn it is played if you play it between 16.00 - 22.00 local time.' },
  'Haste':          { hex: '#D9822B', reminder: 'Can attack the turn it is played.' },
  'Being Áron':     { hex: '#6D6E6B', reminder: 'Table rule - resolved in real life, not by the game.' },
  'Breaker':        { hex: '#B03A2E', reminder: 'Breaks 2 shields instead of 1.' },
  'Party Breaker':  { hex: '#CE356B', reminder: 'Can attack untapped Units.' },
  'Slow Start':     { hex: '#6D6E6B', reminder: 'Enters tapped.' },
  'Unstoppable':    { hex: '#6D6E6B', reminder: "This Unit's attacks can't be redirected." },
  'Action':         { hex: '#6D5BD0', reminder: 'Can also be played during combat.' },
  'Reaction':       { hex: '#2E8B9A', reminder: 'Can be played during combat, even in response to another spell.' },
};
