// Achievements: definitions + a pure checker over the engine's game events.
// check(ctx) gets { s, me, op, ev, events } where `ev` is the new event being looked at
// and `events` the recent event history (same game). Return true to unlock.
import { getDef } from './cards.js';

const sameTurn = (events, ev, f) => events.filter(e => e.turn === ev.turn && f(e));
const playedThisTurn = (events, ev, me, id) => events.some(e => e.type === 'play' && e.player === me && e.id === id && e.turn === ev.turn);

export const ACHIEVEMENTS = [
  {
    id: 'funniest', name: 'Funniest shit I have ever seen', icon: '🤣',
    desc: 'Destroy your opponent with a copy of a token creature they created, using the Parody Alchemist.',
    check: ({ ev, me }) => ev.type === 'finalBlow' && ev.player === me && ev.copy && ev.token,
  },
  {
    id: 'unexpected-flex', name: 'Unexpected FLEX', icon: '💪',
    desc: 'Play The Ultimate Flex from a triggered shield.',
    check: ({ ev, me }) => ev.type === 'play' && ev.player === me && ev.id === 'OGN-186' && ev.via === 'shieldTrigger',
  },
  {
    id: 'painter', name: 'Speed Painting', icon: '🖌️',
    desc: 'Accelerate 3 Miniatures with the Miniature Painter in a single turn.',
    check: ({ ev, me, events }) => ev.type === 'accelerate' && ev.player === me
      && sameTurn(events, ev, e => e.type === 'accelerate' && e.player === me).length >= 3,
  },
  {
    id: 'manyika-rest', name: 'Manyika can rest finally', icon: '🪦',
    desc: 'Watch a Manyika Dreadnought die from a Burst-Pouch (either of you may control them).',
    check: ({ ev }) => ev.type === 'kill' && ev.victim === 'OGN-176' && ev.killer === 'TKN-005',
  },
  {
    id: 'art-destruction', name: 'Art of Destruction', icon: '🎨',
    desc: 'Banish 5 cards in a turn with The Chronicler.',
    check: ({ ev, me, events }) => ev.type === 'banish' && ev.player === me
      && sameTurn(events, ev, e => e.type === 'banish' && e.player === me).length >= 5,
  },
  {
    id: 'came-prepared', name: 'Came Prepared', icon: '🛡️',
    desc: 'Shieldify a Shield Trigger card.',
    check: ({ ev, me }) => ev.type === 'shieldify' && ev.player === me && (getDef(ev.id).keywords || []).includes('Shield Trigger'),
  },
  {
    id: 'art-of-deal', name: 'Art of the Deal', icon: '🤝',
    desc: 'Make a deal with your opponent using The Dealmaker.',
    unobtainable: 'Unlocks with online play — the AI never accepts a deal.',
    check: () => false,
  },
  {
    id: 'strawberry', name: 'Join the Strawberry Club', icon: '🍓',
    desc: 'Have your opponent play Welcome to the Strawberry Club! against you as a Shield Trigger.',
    check: ({ ev, op }) => ev.type === 'play' && ev.player === op && ev.id === 'OGN-012' && ev.via === 'shieldTrigger',
  },
  {
    id: 'movie-night', name: 'Quality Movie Night', icon: '🎬',
    desc: 'Play Movie Night at Chris and The Law on the same turn.',
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-173', 'OGN-171'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-173') && playedThisTurn(events, ev, me, 'OGN-171'),
  },
  {
    id: 'finale', name: 'Finale', icon: '🐄',
    desc: 'Play Cowtrix and GOLDEN on the same turn.',
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-172', 'OGN-177'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-172') && playedThisTurn(events, ev, me, 'OGN-177'),
  },
  {
    id: 'printer-upgrade', name: 'Printer Upgrade', icon: '🖨️',
    desc: "Replace 3D Printer - Lui's Forge with 3D Printer - X Forge 2.",
    check: ({ ev, me }) => ev.type === 'gearReplace' && ev.player === me && ev.oldId === 'OGN-179' && ev.newId === 'OGN-189',
  },
  {
    id: 'dungeon-survivors', name: 'Dungeon Survivors', icon: '🏰',
    desc: 'Win the game with Darkest Dungeoneers tapped on your side of the battlefield.',
    check: ({ ev, me, s }) => ev.type === 'win' && ev.player === me && s.players[me].battle.some(u => u.id === 'OGN-045' && u.tapped),
  },
];

/** Ids of achievements unlocked by the events after `seen` (event number). */
export function checkAchievements(s, me, seen, already = new Set()) {
  const events = s.events || [];
  const out = [];
  for (const ev of events) {
    if (ev.n <= seen) continue;
    for (const a of ACHIEVEMENTS) {
      if (already.has(a.id) || out.includes(a.id)) continue;
      try { if (a.check({ s, me, op: 1 - me, ev, events })) out.push(a.id); } catch { /* ignore */ }
    }
  }
  return out;
}
