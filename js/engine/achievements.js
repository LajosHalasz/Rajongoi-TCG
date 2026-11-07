// Achievements: definitions + a pure checker over the engine's game events.
// check(ctx) gets { s, me, op, ev, events } where `ev` is the new event being looked at
// and `events` the recent event history (same game). Return true to unlock.
import { getDef } from './cards.js';

const sameTurn = (events, ev, f) => events.filter(e => e.turn === ev.turn && f(e));
const defOf = (id) => { try { return getDef(id); } catch { return null; } };
const makesTokens = (ids) => [...ids].filter(id => JSON.stringify(defOf(id)?.effects || []).includes('"do":"token"'));
const withKw = (ids, kw) => [...ids].filter(id => (defOf(id)?.keywords || []).includes(kw));
const withTribe = (ids, t) => [...ids].filter(id => (defOf(id)?.tribes || []).some(x => x.toLowerCase() === t.toLowerCase()));
const names = (ids) => ids.map(id => defOf(id)?.name || id).join(', ');
const playedThisTurn = (events, ev, me, id) => events.some(e => e.type === 'play' && e.player === me && e.id === id && e.turn === ev.turn);

export const ACHIEVEMENTS = [
  {
    id: 'funniest', name: 'Funniest shit I have ever seen', icon: '🤣',
    desc: 'Destroy your opponent with a copy of a token creature they created, using the Parody Alchemist.',
    hint: ({ mine, theirs }) => {
      if (!mine.has('OGN-180')) return null;
      if (!theirs) return 'Possible if the AI\'s deck makes tokens: copy one with Parody Alchemist and land the final blow with it.';
      const t = makesTokens(theirs);
      return t.length ? `They make tokens (${names(t)}) — copy one with Parody Alchemist and deliver the final direct attack with the copy.` : null;
    },
    check: ({ ev, me }) => ev.type === 'finalBlow' && ev.player === me && ev.copy && ev.token,
  },
  {
    id: 'unexpected-flex', name: 'Unexpected FLEX', icon: '💪',
    desc: 'Play The Ultimate Flex from a triggered shield.',
    hint: ({ mine }) => mine.has('OGN-186')
      ? `You run The ULTIMATE FLEX${mine.has('OGN-182') ? ' — Shieldify it with The Solar Boat Team so it can trigger from your shields' : ' — hope it lands in your shields'}.` : null,
    check: ({ ev, me }) => ev.type === 'play' && ev.player === me && ev.id === 'OGN-186' && ev.via === 'shieldTrigger',
  },
  {
    id: 'painter', name: 'Speed Painting', icon: '🖌️',
    desc: 'Accelerate 3 Miniatures with the Miniature Painter in a single turn.',
    hint: ({ mine }) => mine.has('OGN-188') && (mine.has('OGN-179') || mine.has('OGN-189'))
      ? 'Untap the 3D Printers over a few turns, then make and accelerate 3 Miniatures in one big turn (Painter on the field).' : null,
    check: ({ ev, me, events }) => ev.type === 'accelerate' && ev.player === me
      && sameTurn(events, ev, e => e.type === 'accelerate' && e.player === me).length >= 3,
  },
  {
    id: 'manyika-rest', name: 'Manyika can rest finally', icon: '🪦',
    desc: 'Watch a Manyika Dreadnought die from a Burst-Pouch (either of you may control them).',
    hint: ({ mine, theirs }) => {
      const a = mine.has('OGN-176'), b = theirs?.has('OGN-176');
      if (a && b) return 'Both decks run Manyika Dreadnought — attack theirs with your Burst-Pouch, or let theirs run into yours.';
      if (a && !theirs) return 'Needs a Manyika on both sides — possible if the AI also picks a deck with Manyika Dreadnought.';
      if ((a || b) && (mine.has('OGN-180') || theirs?.has('OGN-180'))) return 'Copy a Burst-Pouch with Parody Alchemist and attack into a Manyika Dreadnought.';
      return null;
    },
    check: ({ ev }) => ev.type === 'kill' && ev.victim === 'OGN-176' && ev.killer === 'TKN-005',
  },
  {
    id: 'art-destruction', name: 'Art of Destruction', icon: '🎨',
    desc: 'Banish 5 cards in a turn with The Chronicler.',
    hint: ({ mine }) => {
      if (!mine.has('OGN-178')) return null;
      const art = withTribe(mine, 'Art').filter(id => id !== 'OGN-178');
      return art.length >= 5 ? `Hold 5 Art cards, play The Chronicler, then cast them all for 1 (${art.length} Art cards in your deck).` : null;
    },
    check: ({ ev, me, events }) => ev.type === 'banish' && ev.player === me
      && sameTurn(events, ev, e => e.type === 'banish' && e.player === me).length >= 5,
  },
  {
    id: 'came-prepared', name: 'Came Prepared', icon: '🛡️',
    desc: 'Shieldify a Shield Trigger card.',
    hint: ({ mine }) => {
      const sh = withKw(mine, 'Shieldify'), st = withKw(mine, 'Shield Trigger');
      return sh.length && st.length ? `Play ${names(sh)} with a Shield Trigger card in hand (${names(st)}).` : null;
    },
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
    hint: ({ theirs }) => !theirs ? 'Possible if the AI\'s deck runs Welcome to the Strawberry Club!.'
      : theirs.has('OGN-012') ? 'The AI runs Welcome to the Strawberry Club! — keep breaking shields and it may trigger.' : null,
    check: ({ ev, op }) => ev.type === 'play' && ev.player === op && ev.id === 'OGN-012' && ev.via === 'shieldTrigger',
  },
  {
    id: 'movie-night', name: 'Quality Movie Night', icon: '🎬',
    desc: 'Play Movie Night at Chris and The Law on the same turn.',
    hint: ({ mine }) => mine.has('OGN-173') && mine.has('OGN-171') ? 'Cast Movie Night at Chris, then The Law as your last card that turn (4 mana).' : null,
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-173', 'OGN-171'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-173') && playedThisTurn(events, ev, me, 'OGN-171'),
  },
  {
    id: 'finale', name: 'Finale', icon: '🐄',
    desc: 'Play Cowtrix and GOLDEN on the same turn.',
    hint: ({ mine }) => mine.has('OGN-172') && mine.has('OGN-177') ? 'Play Cowtrix choosing Rumi (draws GOLDEN), then cast GOLDEN the same turn.' : null,
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-172', 'OGN-177'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-172') && playedThisTurn(events, ev, me, 'OGN-177'),
  },
  {
    id: 'printer-upgrade', name: 'Printer Upgrade', icon: '🖨️',
    desc: "Replace 3D Printer - Lui's Forge with 3D Printer - X Forge 2.",
    hint: ({ mine }) => mine.has('OGN-179') && mine.has('OGN-189') ? 'With both Gear slots full (one of them Lui\'s Forge), play X Forge 2 and choose to replace Lui\'s Forge.' : null,
    check: ({ ev, me }) => ev.type === 'gearReplace' && ev.player === me && ev.oldId === 'OGN-179' && ev.newId === 'OGN-189',
  },
  {
    id: 'dungeon-survivors', name: 'Dungeon Survivors', icon: '🏰',
    desc: 'Win the game with Darkest Dungeoneers tapped on your side of the battlefield.',
    hint: ({ mine }) => mine.has('OGN-045') ? 'Use Darkest Dungeoneers\' Defensive (it taps) or attack with it on your winning turn.' : null,
    check: ({ ev, me, s }) => ev.type === 'win' && ev.player === me && s.players[me].battle.some(u => u.id === 'OGN-045' && u.tapped),
  },
];

/** Achievements reachable in this matchup with a tip each.
 *  mine / theirs: Sets of card ids (theirs = null when the AI deck is random). */
export function achievementHints(mine, theirs) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (a.unobtainable || !a.hint) continue;
    let tip = null;
    try { tip = a.hint({ mine, theirs }); } catch { /* ignore */ }
    if (tip) out.push({ ...a, tip });
  }
  return out;
}

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
