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

/** A tiered achievement: bronze / silver / gold levels of the same count (ids stay stable for saved unlocks). */
const tiers = ({ name, icon, levels, desc, hint, count }) => levels.map(([id, n, tier], i) => ({
  id, name: name + ['', ' II', ' III'][i], icon, tier, desc: desc(n),
  ...(hint ? { hint: (ctx) => hint(ctx, n) } : {}),
  check: (ctx) => count(ctx) >= n,
}));

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
  // Speed Painting I / II / III: Accelerate 1 / 3 / 5 Miniatures with the Painter in one turn
  ...tiers({
    name: 'Speed Painting', icon: '🖌️', levels: [['painter-1', 1, 'bronze'], ['painter', 3, 'silver'], ['painter-5', 5, 'gold']],
    desc: (n) => `Accelerate ${n} Miniature${n > 1 ? 's' : ''} with the Miniature Painter in a single turn.`,
    hint: ({ mine }, n) => mine.has('OGN-188') && (mine.has('OGN-179') || mine.has('OGN-189'))
      ? { hu: `Egy körben készíts és gyorsíts (Accelerate) ${n} Miniature-t a 3D Printerekkel, miközben a Painter lent van.`,
        en: `In one turn make and accelerate ${n} Miniature${n > 1 ? 's' : ''} with your 3D Printers while the Painter is on the field.` } : null,
    count: ({ ev, me, events }) => (ev.type === 'accelerate' && ev.player === me && !ev.via
      ? sameTurn(events, ev, e => e.type === 'accelerate' && e.player === me && !e.via).length : 0),
  }),
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
  // Art of Destruction I / II / III: banish 1 / 3 / 5 cards in a turn with The Chronicler
  ...tiers({
    name: 'Art of Destruction', icon: '🎨', levels: [['art-destruction-1', 1, 'bronze'], ['art-destruction-3', 3, 'silver'], ['art-destruction', 5, 'gold']],
    desc: (n) => `Banish ${n} card${n > 1 ? 's' : ''} in a turn with The Chronicler.`,
    hint: ({ mine }, n) => {
      if (!mine.has('OGN-178')) return null;
      const k = withTribe(mine, 'Art').filter(id => id !== 'OGN-178').length;
      return k >= n ? { hu: `Gyűjts ${n} Art lapot a kezedbe, játszd ki a The Chroniclert, majd őket 1-ért (${k} Art lap van a pakliban).`,
        en: `Hold ${n} Art card${n > 1 ? 's' : ''}, play The Chronicler, then cast ${n > 1 ? 'them' : 'it'} for 1 (${k} Art cards in your deck).` } : null;
    },
    count: ({ ev, me, events }) => (ev.type === 'banish' && ev.player === me
      ? sameTurn(events, ev, e => e.type === 'banish' && e.player === me).length : 0),
  }),
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
  // ---- more card stories ---------------------------------------------------------------
  {
    id: 'checkmate', name: 'Checkmate Fantasy', icon: '♛',
    desc: 'Promote a Pawn all the way to a Queen with Aspect of Foundation.',
    hint: ({ mine }) => mine.has('OGN-L-kozi')
      ? { hu: 'Három körön át tapeld a Legendet: Pawn → Knight/Bishop/Rook → Queen. Védd közben a bábut!', en: 'Tap the Legend three turns in a row: Pawn → Knight/Bishop/Rook → Queen. Keep the piece alive!' } : null,
    check: ({ ev, me }) => ev.type === 'promote' && ev.player === me && ev.to === 'TKN-011',
  },
  {
    id: 'memoization', name: 'Memoization', icon: '💾',
    desc: 'Force exactly 3 Thunks at once with Aspect of Excessive Detail.',
    hint: ({ mine }) => mine.has('OGN-L-domi')
      ? { hu: 'Gyűjts 3 thunkot a Legend alá, és csak utána Force-old őket: plusz lapot is kapsz.', en: 'Stack 3 Thunks under the Legend before you Force them — you draw an extra card too.' } : null,
    check: ({ ev, me }) => ev.type === 'force' && ev.player === me && ev.count === 3,
  },
  {
    id: 'zero-day', name: 'Zero-Day', icon: '🕳️',
    desc: 'Steal a Shield Trigger with Exploit — and play it for free.',
    hint: ({ mine }) => mine.has('OGN-L-laci')
      ? { hu: 'Side Channellel fordíts fel egy Shieldet; ha Shield Trigger, a következő körben lopd el Exploittal.', en: 'Turn a Shield face up with Side Channel; if it is a Shield Trigger, steal it with Exploit next turn.' } : null,
    check: ({ ev, me, events }) => ev.type === 'play' && ev.player === me && ev.via === 'shieldTrigger'
      && events.some(e => e.type === 'exploit' && e.player === me && e.id === ev.id && e.n < ev.n),
  },
  {
    id: 'mad-science', name: 'Mad Science', icon: '🧪',
    desc: 'Enter Seizure with Aspect of Science — and still win the game.',
    hint: ({ mine }) => mine.has('OGN-L-anna')
      ? { hu: '1 Shieldnél tisztára söpröd a pályát. Utána Shieldify-olj és fordíts!', en: 'At 1 Shield the Field is wiped. Then Shieldify back up and turn it around!' } : null,
    check: ({ ev, me, s }) => ev.type === 'win' && ev.player === me && !!s.players[me].seizure,
  },
  {
    id: 'pot-of-greed', name: 'What Does Pot of Greed Do?!', icon: '🏺',
    desc: 'Activate Pot of Greed, which allows you to draw 2 cards from your deck.',
    hint: ({ mine }) => mine.has('OGN-187') ? { hu: 'Csak játszd ki. Mondd is ki hangosan.', en: 'Just play it. Say the line out loud.' } : null,
    check: ({ ev, me }) => ev.type === 'play' && ev.player === me && ev.id === 'OGN-187',
  },
  {
    id: 'spin-to-win', name: 'Spin to Win', icon: '🌀',
    desc: 'Destroy 4 or more Units with a single Girl with a Spinner.',
    hint: ({ mine }) => mine.has('OGN-013')
      ? { hu: 'Várj, amíg sok kis (nem Mighty) Unit áll a pályán, és akkor pörgesd meg.', en: 'Wait until the Field is crowded with small (non-Mighty) Units, then spin.' } : null,
    check: ({ ev, me, events }) => {
      if (ev.type !== 'destroy') return false;
      const spin = [...events].reverse().find(e => e.type === 'play' && e.player === me && e.id === 'OGN-013' && e.n < ev.n && e.turn === ev.turn);
      if (!spin) return false;
      const next = events.find(e => e.type === 'play' && e.n > spin.n);
      return events.filter(e => e.type === 'destroy' && e.n > spin.n && (!next || e.n < next.n)).length >= 4;
    },
  },
  {
    id: 'emperor-protects', name: 'The Emperor Protects', icon: '🎲',
    desc: 'Captain Tingus loses a fight — and survives on the D6.',
    hint: ({ mine }) => mine.has('OGN-120')
      ? { hu: 'Captain Tingus vesztes harc után 4+ dobással túlél. Merj vele nagyobbat támadni!', en: 'Captain Tingus survives a lost fight on a 4+. Dare to attack bigger Units with him!' } : null,
    check: ({ ev, me }) => ev.type === 'survive' && ev.player === me && ev.id === 'OGN-120',
  },
  {
    id: 'not-today-satan', name: 'Not Today, Satan', icon: '😈',
    desc: 'Zselmó escapes from hell instead of dying.',
    hint: ({ mine }) => mine.has('OGN-009')
      ? { hu: 'Zselmó első halála helyett +1 Might-ot kap — küldd bátran harcba.', en: "Zselmó's first death gives him +1 Might instead — send him into a fight." } : null,
    check: ({ ev, me }) => ev.type === 'escape' && ev.player === me && ev.id === 'OGN-009',
  },
  {
    id: 'floodgates', name: 'Opened the Floodgates', icon: '🌊',
    desc: 'Land the winning direct attack with The Sluice Machine.',
    hint: ({ mine }) => mine.has('OGN-181')
      ? { hu: 'Tartsd meg a 8 Might-os The Sluice Machine-t a döntő Direct Attackra.', en: 'Save the 8-Might Sluice Machine for the final direct attack.' } : null,
    check: ({ ev, me }) => ev.type === 'finalBlow' && ev.player === me && ev.id === 'OGN-181',
  },
  {
    id: 'open-bar', name: 'Open Bar', icon: '🥃',
    desc: 'Have 3 Whiskey tokens on your Battlefield at the same time.',
    hint: ({ mine }) => mine.has('OGN-L-balu')
      ? { hu: 'Tapeld minden körben a Legendet, és vigyázz a Whiskey-kre.', en: 'Tap the Legend every turn and keep the Whiskeys alive.' } : null,
    check: ({ me, s }) => s.players[me].battle.filter(u => u.id === 'TKN-006').length >= 3,
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
