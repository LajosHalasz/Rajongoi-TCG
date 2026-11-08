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
      if (!theirs) return { hu: 'Akkor sikerülhet, ha az AI paklija tokeneket csinál: másold le az egyiket a Parody Alchemisttel, és azzal mérd a döntő csapást.',
        en: 'Possible if the AI\'s deck makes tokens: copy one with Parody Alchemist and land the final blow with it.' };
      const t = makesTokens(theirs);
      return t.length ? { hu: `Az ellenfél tokeneket csinál (${names(t)}). Másold le az egyiket a Parody Alchemisttel, és a másolattal vidd be a győztes Direct Attackot.`,
        en: `They make tokens (${names(t)}) — copy one with Parody Alchemist and deliver the final direct attack with the copy.` } : null;
    },
    check: ({ ev, me }) => ev.type === 'finalBlow' && ev.player === me && ev.copy && ev.token,
  },
  {
    id: 'unexpected-flex', name: 'Unexpected FLEX', icon: '💪',
    desc: 'Play The Ultimate Flex from a triggered shield.',
    hint: ({ mine }) => !mine.has('OGN-186') ? null : mine.has('OGN-182')
      ? { hu: 'Tedd a The ULTIMATE FLEX-et Shieldbe a The Solar Boat Team Shieldify-jával, hogy Shield Triggerként elsülhessen.',
        en: 'Shieldify The ULTIMATE FLEX with The Solar Boat Team so it can trigger from your shields.' }
      : { hu: 'Benne van a pakliban a The ULTIMATE FLEX. Reméld, hogy Shieldbe kerül.', en: 'You run The ULTIMATE FLEX — hope it lands in your shields.' },
    check: ({ ev, me }) => ev.type === 'play' && ev.player === me && ev.id === 'OGN-186' && ev.via === 'shieldTrigger',
  },
  {
    id: 'painter', name: 'Speed Painting', icon: '🖌️',
    desc: 'Accelerate 3 Miniatures with the Miniature Painter in a single turn.',
    hint: ({ mine }) => mine.has('OGN-188') && (mine.has('OGN-179') || mine.has('OGN-189'))
      ? { hu: 'Egy nagy körben készíts és gyorsíts (Accelerate) 3 Miniature-t a 3D Printerekkel, miközben a Painter lent van.',
        en: 'In one big turn make and accelerate 3 Miniatures with your 3D Printers while the Painter is on the field.' } : null,
    check: ({ ev, me, events }) => ev.type === 'accelerate' && ev.player === me && !ev.via
      && sameTurn(events, ev, e => e.type === 'accelerate' && e.player === me && !e.via).length >= 3,
  },
  {
    id: 'manyika-rest', name: 'Manyika can rest finally', icon: '🪦',
    desc: 'Watch a Manyika Dreadnought die from a Burst-Pouch (either of you may control them).',
    hint: ({ mine, theirs }) => {
      const a = mine.has('OGN-176'), b = theirs?.has('OGN-176');
      if (a && b) return { hu: 'Mindkét pakliban van Manyika Dreadnought. Támadd meg az övét a Burst-Pouchoddal, vagy hagyd, hogy az övé belefusson a tiédbe.',
        en: 'Both decks run Manyika Dreadnought — attack theirs with your Burst-Pouch, or let theirs run into yours.' };
      if (a && !theirs) return { hu: 'Mindkét oldalon kell egy Manyika. Akkor sikerülhet, ha az AI is Manyika Dreadnought-os paklit választ.',
        en: 'Needs a Manyika on both sides — possible if the AI also picks a deck with Manyika Dreadnought.' };
      if ((a || b) && (mine.has('OGN-180') || theirs?.has('OGN-180'))) return { hu: 'Másolj le egy Burst-Pouchot a Parody Alchemisttel, és támadj vele egy Manyika Dreadnoughtra.',
        en: 'Copy a Burst-Pouch with Parody Alchemist and attack into a Manyika Dreadnought.' };
      return null;
    },
    check: ({ ev }) => ev.type === 'kill' && ev.victim === 'OGN-176' && ev.killer === 'TKN-005',
  },
  {
    id: 'art-destruction', name: 'Art of Destruction', icon: '🎨',
    desc: 'Banish 5 cards in a turn with The Chronicler.',
    hint: ({ mine }) => {
      if (!mine.has('OGN-178')) return null;
      const n = withTribe(mine, 'Art').filter(id => id !== 'OGN-178').length;
      return n >= 5 ? { hu: `Gyűjts össze 5 Art lapot a kezedben, játszd ki a The Chroniclert, majd mindet 1-ért (${n} Art lap van a pakliban).`,
        en: `Hold 5 Art cards, play The Chronicler, then cast them all for 1 (${n} Art cards in your deck).` } : null;
    },
    check: ({ ev, me, events }) => ev.type === 'banish' && ev.player === me
      && sameTurn(events, ev, e => e.type === 'banish' && e.player === me).length >= 5,
  },
  {
    id: 'came-prepared', name: 'Came Prepared', icon: '🛡️',
    desc: 'Shieldify a Shield Trigger card.',
    hint: ({ mine }) => {
      const sh = withKw(mine, 'Shieldify'), st = withKw(mine, 'Shield Trigger');
      return sh.length && st.length ? { hu: `Játszd ki ezt: ${names(sh)}, miközben egy Shield Trigger lap van a kezedben (${names(st)}), és azt tedd a Shieldek közé.`,
        en: `Play ${names(sh)} with a Shield Trigger card in hand (${names(st)}).` } : null;
    },
    check: ({ ev, me }) => ev.type === 'shieldify' && ev.player === me && (getDef(ev.id).keywords || []).includes('Shield Trigger'),
  },
  {
    id: 'art-of-deal', name: 'Art of the Deal', icon: '🤝', tier: 'bronze',
    desc: 'Make a deal with your opponent using The Dealmaker — and collect when the bill comes due.',
    hint: ({ mine }) => mine.has('OGN-183')
      ? { hu: 'Tapeld a The Dealmakert, amikor az ellenfél keze már közel van a tiédhez: a következő körödben, ha több lapja van, elviszed a legerősebb Unitját.',
        en: "Tap The Dealmaker when your opponent's hand is close to yours: next turn, if they hold more cards, you collect their strongest Unit." } : null,
    check: ({ ev, me }) => ev.type === 'contractCollected' && ev.player === me,
  },
  {
    id: 'art-of-deal-2', name: 'Art of the Deal II', icon: '🤝', tier: 'silver',
    desc: "Win the game with The Dealmaker's gift: make your opponent draw when they can't.",
    hint: ({ mine }) => mine.has('OGN-183')
      ? { hu: 'Ha az ellenfélnek már se paklija, se Shieldje nincs, tapeld a The Dealmakert: a „ajándék” lap húzásába belebukik.',
        en: "When your opponent has no deck and no Shields left, tap The Dealmaker: they lose drawing your 'gift'." } : null,
    check: ({ ev, me }) => ev.type === 'dealWin' && ev.player === me,
  },
  {
    id: 'art-of-deal-3', name: 'Art of the Deal III', icon: '🤝', tier: 'gold',
    desc: "Collect a Dealmaker contract that destroys your opponent's only Unit.",
    hint: ({ mine }) => mine.has('OGN-183')
      ? { hu: 'Akkor tapeld a The Dealmakert, amikor az ellenfélnek csak egy Unitja van, és tartsd kevesebb lapon a kezed, mint ő.',
        en: 'Tap The Dealmaker when your opponent has a single Unit, and keep fewer cards in hand than they do.' } : null,
    check: ({ ev, me }) => ev.type === 'contractCollected' && ev.player === me && ev.only,
  },
  {
    id: 'strawberry', name: 'Join the Strawberry Club', icon: '🍓',
    desc: 'Have your opponent play Welcome to the Strawberry Club! against you as a Shield Trigger.',
    hint: ({ theirs }) => !theirs
      ? { hu: 'Akkor sikerülhet, ha az AI paklijában van Welcome to the Strawberry Club!.', en: 'Possible if the AI\'s deck runs Welcome to the Strawberry Club!.' }
      : theirs.has('OGN-012') ? { hu: 'Az AI-nál van Welcome to the Strawberry Club!. Törd a Shieldjeit, és egyszer elsülhet.',
        en: 'The AI runs Welcome to the Strawberry Club! — keep breaking shields and it may trigger.' } : null,
    check: ({ ev, op }) => ev.type === 'play' && ev.player === op && ev.id === 'OGN-012' && ev.via === 'shieldTrigger',
  },
  {
    id: 'movie-night', name: 'Quality Movie Night', icon: '🎬',
    desc: 'Play Movie Night at Chris and The Law on the same turn.',
    hint: ({ mine }) => mine.has('OGN-173') && mine.has('OGN-171')
      ? { hu: 'Movie Night at Chris, majd a The Law legyen az utolsó lapod abban a körben (4 mana).', en: 'Cast Movie Night at Chris, then The Law as your last card that turn (4 mana).' } : null,
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-173', 'OGN-171'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-173') && playedThisTurn(events, ev, me, 'OGN-171'),
  },
  {
    id: 'finale', name: 'Finale', icon: '🐄',
    desc: 'Play Cowtrix and GOLDEN on the same turn.',
    hint: ({ mine }) => mine.has('OGN-172') && mine.has('OGN-177')
      ? { hu: 'Játszd ki a Cowtrixot Rumival (felhúzza a GOLDEN-t), és még ugyanabban a körben a GOLDEN-t.', en: 'Play Cowtrix choosing Rumi (draws GOLDEN), then cast GOLDEN the same turn.' } : null,
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ['OGN-172', 'OGN-177'].includes(ev.id)
      && playedThisTurn(events, ev, me, 'OGN-172') && playedThisTurn(events, ev, me, 'OGN-177'),
  },
  {
    id: 'printer-upgrade', name: 'Printer Upgrade', icon: '🖨️',
    desc: "Replace 3D Printer - Lui's Forge with 3D Printer - X Forge 2.",
    hint: ({ mine }) => mine.has('OGN-179') && mine.has('OGN-189')
      ? { hu: 'Ha mindkét Gear Slot foglalt (az egyikben a Lui\'s Forge), játszd ki az X Forge 2-t, és válaszd a Lui\'s Forge cseréjét.',
        en: 'With both Gear slots full (one of them Lui\'s Forge), play X Forge 2 and choose to replace Lui\'s Forge.' } : null,
    check: ({ ev, me }) => ev.type === 'gearReplace' && ev.player === me && ev.oldId === 'OGN-179' && ev.newId === 'OGN-189',
  },
  {
    id: 'dungeon-survivors', name: 'Dungeon Survivors', icon: '🏰',
    desc: 'Win the game with Darkest Dungeoneers tapped on your side of the battlefield.',
    hint: ({ mine }) => mine.has('OGN-045')
      ? { hu: 'A győztes körödben a Darkest Dungeoneers legyen lefordítva: védekezzen (Defensive) vagy támadjon.',
        en: 'Have Darkest Dungeoneers tapped on your winning turn: use its Defensive or attack with it.' } : null,
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
