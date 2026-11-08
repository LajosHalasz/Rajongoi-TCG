// Rules page: a short, readable summary of how Rajongoi TCG is played (HU default, EN switchable).
import { RULES } from '../engine/rules.js';
import { getLang, langToggleHtml, bindLangToggle } from './lang.js';

const R = RULES;

const SECTIONS = [
  {
    icon: '🏆',
    hu: { t: 'A játék célja', b: `<p>Törd át az ellenfél <b>${R.SHIELDS} Shieldjét</b>, majd támadd meg őt közvetlenül (<b>Direct Attack</b>). Ha ez sikerül, nyertél.</p>
      <p>Akkor is veszítesz, ha húznod kellene, de már se paklid, se Shieldod nincs.</p>` },
    en: { t: 'Goal of the game', b: `<p>Break all <b>${R.SHIELDS} of your opponent's Shields</b>, then hit them with a <b>Direct Attack</b>. If it lands, you win.</p>
      <p>You also lose if you have to draw but have no deck and no Shields left.</p>` },
  },
  {
    icon: '🃏',
    hu: { t: 'A pakli', b: `<ul>
      <li><b>${R.DECK_SIZE} lap</b>, mindegyikből csak <b>1</b> példány.</li>
      <li><b>1 Legend</b>: a passzív képessége mindig él, és a 2 színe határozza meg, milyen lapok mehetnek a pakliba.</li>
      <li><b>${R.MIN_CHAMPIONS}–${R.MAX_CHAMPIONS} Champion</b>, ebből legalább egynek a neve egyezik a Legendével. Ő kezd a Champion Slotban.</li>
      <li>Legfeljebb <b>${R.MAX_SIGNATURES} Signature</b> lap. Ezek kétszínű, erős lapok, és csak a saját Legendjükkel használhatók.</li>
      <li>Külön <b>Mana Deck</b>: ${R.RUNE_DECK_SIZE} Rune a Legend két színében.</li>
      <li>Ajánlott: átlagosan kb. 4-es mana költség, sok olcsó lap és néhány drága finisher.</li></ul>` },
    en: { t: 'The deck', b: `<ul>
      <li><b>${R.DECK_SIZE} cards</b>, only <b>1 copy</b> of each.</li>
      <li><b>1 Legend</b>: its passive is always on, and its 2 colors decide which cards your deck can use.</li>
      <li><b>${R.MIN_CHAMPIONS}–${R.MAX_CHAMPIONS} Champions</b>, at least one named like your Legend. That one starts in the Champion Slot.</li>
      <li>Up to <b>${R.MAX_SIGNATURES} Signature</b> cards: strong two-color cards that only work with their own Legend.</li>
      <li>A separate <b>Mana Deck</b> of ${R.RUNE_DECK_SIZE} Runes in your Legend's two colors.</li>
      <li>Guideline: average cost around 4, lots of cheap cards and a few expensive finishers.</li></ul>` },
  },
  {
    icon: '🗺️',
    hu: { t: 'Zónák az asztalon', b: `<ul>
      <li><b>Battlefield</b>: itt állnak a Unitjaid, innen támadnak. Legfeljebb ${R.MAX_BATTLE} Unitod lehet itt.</li>
      <li><b>Shield Zone</b>: ${R.SHIELDS} lefordított lap, ezek védenek.</li>
      <li><b>Deck</b> és <b>Graveyard</b>: a Graveyardba kerülnek az elpusztult Unitok és a lejátszott Spellek.</li>
      <li><b>Mana Zone</b> és <b>Mana Deck</b>: a Mana Deckből húzott Rune-ok adják a manát.</li>
      <li><b>Legend</b>, <b>Champion Slot</b>, <b>Signature Slot</b>: ezek a lapok az asztalon kezdenek, és innen kijátszhatók.</li>
      <li><b>Gear Slotok</b>: egyszerre legfeljebb ${R.GEAR_SLOTS} Gear lehet lent.</li>
      <li><b>Kéz</b>: legfeljebb ${R.MAX_HAND} lap. Ha tele van, az újonnan kapott lap (húzás, betört Shield…) a Graveyardba kerül.</li></ul>` },
    en: { t: 'Zones on the table', b: `<ul>
      <li><b>Battlefield</b>: your Units stand here and attack from here. At most ${R.MAX_BATTLE} Units.</li>
      <li><b>Shield Zone</b>: ${R.SHIELDS} face-down cards that protect you.</li>
      <li><b>Deck</b> and <b>Graveyard</b>: destroyed Units and resolved Spells go to the Graveyard.</li>
      <li><b>Mana Zone</b> and <b>Mana Deck</b>: Runes from the Mana Deck give you mana.</li>
      <li><b>Legend</b>, <b>Champion Slot</b>, <b>Signature Slot</b>: these start on the table and can be played from there.</li>
      <li><b>Gear Slots</b>: at most ${R.GEAR_SLOTS} Gear at a time.</li>
      <li><b>Hand</b>: at most ${R.MAX_HAND} cards. With a full hand, a new card (a draw, a broken Shield…) goes to the Graveyard.</li></ul>` },
  },
  {
    icon: '🎲',
    hu: { t: 'Kezdés', b: `<ol>
      <li>Keverd meg a paklit, és a felső ${R.SHIELDS} lapot tedd le lefordítva: ezek a Shieldjeid.</li>
      <li>Húzz ${R.OPENING_HAND} lapot. Legfeljebb ${R.MULLIGAN_MAX}-t visszatehetsz a pakli aljára, és ugyanannyit újrahúzol (mulligan).</li>
      <li>Pénzfeldobással dől el, ki kezd.</li></ol>` },
    en: { t: 'Setup', b: `<ol>
      <li>Shuffle and put the top ${R.SHIELDS} cards face down: these are your Shields.</li>
      <li>Draw ${R.OPENING_HAND}. You may put up to ${R.MULLIGAN_MAX} on the bottom of your deck and draw that many again (mulligan).</li>
      <li>A coin flip decides who goes first.</li></ol>` },
  },
  {
    icon: '🔄',
    hu: { t: 'Egy kör menete', b: `<ol>
      <li><b>Kezdés</b>: minden lapod feláll (untap), és lefutnak a kör eleji hatások.</li>
      <li><b>Húzás</b>: húzol 1 lapot. Ha üres a pakli, egy Shieldot veszel kézbe helyette.</li>
      <li><b>Mana</b>: ${R.CHANNEL_PER_TURN} Rune-t teszel a Mana Deckből a Mana Zone-ba (a második játékos az első körében ${R.CHANNEL_SECOND_PLAYER_FIRST_TURN}-at).</li>
      <li><b>Kijátszás</b>: Unitokat, Spelleket és Geart játszol ki. Annyi Rune-t fordítasz le, amennyi a költség, és <b>legalább 1-nek egyeznie kell a lap színével</b>.</li>
      <li><b>Harc</b>: egyesével támadsz (lásd lent).</li>
      <li><b>Vége</b>: lejárnak az „ebben a körben” hatások.</li></ol>
      <p><b>Recycle N</b>: plusz költség. N darab, a lap színével egyező Rune-t visszateszel a Mana Deck aljára.</p>` },
    en: { t: 'Turn order', b: `<ol>
      <li><b>Start</b>: untap everything and resolve start-of-turn effects.</li>
      <li><b>Draw</b> 1 card. If your deck is empty, take a Shield into your hand instead.</li>
      <li><b>Mana</b>: channel ${R.CHANNEL_PER_TURN} Runes from the Mana Deck (the second player channels ${R.CHANNEL_SECOND_PLAYER_FIRST_TURN} on their first turn).</li>
      <li><b>Play</b> Units, Spells and Gear. Tap Runes equal to the cost; <b>at least 1 must match the card's color</b>.</li>
      <li><b>Combat</b>: attack one at a time (see below).</li>
      <li><b>End</b>: "this turn" effects expire.</li></ol>
      <p><b>Recycle N</b> is an extra cost: put N Runes of the card's color on the bottom of the Mana Deck.</p>` },
  },
  {
    icon: '⚔️',
    hu: { t: 'Harc', b: `<p>Egy álló (untapped) Unittal támadsz, és ez lefordítja. A kijátszás körében egy Unit még nem támadhat, kivéve ha <b>Haste</b> vagy aktív <b>Nostalgia Line</b> van rajta. Három célpont közül választhatsz:</p>
      <ul>
      <li><b>Shield</b>: 1 Shield betörik, és a tulajdonosa kézbe veszi. Ha az <b>Shield Trigger</b>, azonnal ingyen kijátszhatja.</li>
      <li><b>Direct Attack</b>: csak ha az ellenfélnek már nincs Shieldje. Ha betalál, nyertél.</li>
      <li><b>Lefordított (tapped) ellenséges Unit</b>: a nagyobb <b>Might</b> nyer, a vesztes elpusztul. Döntetlennél mindkettő.</li></ul>
      <p>A védekező egy álló <b>Defensive</b> Unitra irányíthatja át a támadást. Ezután mindketten játszhattok <b>Action</b> és <b>Reaction</b> spelleket. Ezek egy veremre (stack) kerülnek, és fordított sorrendben oldódnak fel (az utolsó elsőként). A Reaction akár egy másik spellre válaszul is mehet.</p>` },
    en: { t: 'Combat', b: `<p>Attack with an untapped Unit (it taps). Units can't attack the turn they're played unless they have <b>Haste</b> or an active <b>Nostalgia Line</b>. Pick a target:</p>
      <ul>
      <li><b>Shield</b>: break 1 Shield; its owner takes it into their hand. If it's a <b>Shield Trigger</b>, they may play it for free right away.</li>
      <li><b>Direct Attack</b>: only when the opponent has no Shields. If it lands, you win.</li>
      <li><b>A tapped enemy Unit</b>: higher <b>Might</b> wins and the loser is destroyed. On a tie, both are.</li></ul>
      <p>The defender may redirect the attack to an untapped <b>Defensive</b> Unit. Then both players may cast <b>Action</b> and <b>Reaction</b> spells onto a stack, which resolves last-in, first-out. A Reaction can even answer another spell.</p>` },
  },
  {
    icon: '📜',
    hu: { t: 'Lap típusok', b: `<ul>
      <li><b>Legend</b>: passzív képesség, végig az asztalon marad.</li>
      <li><b>Unit</b>: harcoló lény a Battlefielden, a száma a Might (erő).</li>
      <li><b>Champion</b>: különleges Unit, egyikük a Champion Slotból indul.</li>
      <li><b>Signature</b>: kétszínű, erős lap, egy adott Legendhez tartozik.</li>
      <li><b>Spell</b>: egyszeri hatás, utána a Graveyardba kerül.</li>
      <li><b>Gear</b>: tartós lap a Gear Slotban, gyakran tap-pel aktiválható. Ha mindkét slot foglalt, az új Gear egy általad választott régi helyére kerül. A <i>Saga</i> Gear néhány használat után lejár.</li>
      <li><b>Token</b>: lapok által létrehozott Unit (pl. Miniature).</li>
      <li><b>Rune</b>: mana a Mana Deckből.</li></ul>
      <p>A 0 vagy kevesebb Might-ú Unit elpusztul.</p>` },
    en: { t: 'Card types', b: `<ul>
      <li><b>Legend</b>: a passive ability that stays on the table all game.</li>
      <li><b>Unit</b>: a fighter on the Battlefield; its number is its Might.</li>
      <li><b>Champion</b>: a special Unit; one starts in the Champion Slot.</li>
      <li><b>Signature</b>: a strong two-color card tied to one Legend.</li>
      <li><b>Spell</b>: a one-time effect, then it goes to the Graveyard.</li>
      <li><b>Gear</b>: a lasting card in a Gear Slot, often used by tapping. With both slots full, a new Gear replaces one of your choice. <i>Saga</i> Gear expires after a few uses.</li>
      <li><b>Token</b>: a Unit created by other cards (e.g. Miniature).</li>
      <li><b>Rune</b>: mana from the Mana Deck.</li></ul>
      <p>A Unit with 0 or less Might is destroyed.</p>` },
  },
];

// Keyword glossary (names stay English, explanations are translated).
const KW = [
  ['Shield Trigger', 'Ha Shieldból kerül a kezedbe, azonnal ingyen kijátszhatod.', 'If you get it from your Shield Zone, you may play it for free right away.'],
  ['Shieldify N', 'Kijátszáskor N lapot teszel a kezedből a Shield Zone-ba.', 'When played, put N cards from your hand into your Shield Zone.'],
  ['Defensive', 'Ha egy ellenséges Unit támad, ezt lefordítva magadra irányíthatod a támadást.', 'When an enemy Unit attacks, tap this to redirect the attack to it.'],
  ['Deathtouch', 'Ha harcban elpusztul, azt a Unitot is elpusztítja, amelyik megölte.', 'If it loses a fight, it also destroys the Unit that killed it.'],
  ['Haste', 'Már a kijátszás körében támadhat.', 'Can attack the turn it is played.'],
  ['Nostalgia Line', 'Este 16:00 és 22:00 között a kijátszás körében is támadhat (a valós idő számít).', 'Between 16:00 and 22:00 (real local time) it can attack the turn it is played.'],
  ['Breaker', '1 helyett 2 Shieldot tör.', 'Breaks 2 Shields instead of 1.'],
  ['Party Breaker', 'Álló (untapped) Unitokat is megtámadhat.', 'Can attack untapped Units.'],
  ['Indestructible', 'Nem lehet elpusztítani.', "Can't be destroyed."],
  ['Unstoppable', 'A támadását nem lehet átirányítani.', "Its attacks can't be redirected."],
  ['Vigilance', 'A köröd végén újra felállíthatod (untap).', 'You may untap it at the end of your turn.'],
  ['Slow Start', 'Lefordítva (tapped) érkezik.', 'Enters tapped.'],
  ['Furious', 'Minden körben támadnia kell.', 'Must attack every turn.'],
  ['Accelerate', 'Plusz költségért állva érkezik, így azonnal támadhat.', 'Pay extra so it enters ready and can attack right away.'],
  ['Action', 'Harc közben is kijátszható, ha a stack üres.', 'Can also be played in combat while the stack is empty.'],
  ['Reaction', 'Bármikor kijátszható, akár egy másik spellre válaszul is.', 'Can be played any time, even in response to another spell.'],
];

export function renderRules(app) {
  const l = getLang();
  const h = (o) => o[l];
  app.innerHTML = `<div class="page rules-page">
    <div class="row rules-head"><h2 style="margin:0">${l === 'hu' ? 'Szabályok' : 'Rules'}</h2><span class="spacer"></span>${langToggleHtml()}</div>
    <p class="muted rules-intro">${l === 'hu'
      ? 'A Rajongoi TCG a Duel Masters egyszerű alapjaira épül (Shieldek, Shield Trigger, Direct Attack), néhány Riftbound-elemmel: Legend, Champion, Signature, Gear és Rune alapú mana.'
      : 'Rajongoi TCG builds on the simple core of Duel Masters (Shields, Shield Trigger, Direct Attack) with a few Riftbound ideas: Legend, Champion, Signature, Gear and Rune-based mana.'}</p>
    <div class="rules-grid">
      ${SECTIONS.map(s => `<section class="rule-card"><h3><span class="rule-ico">${s.icon}</span>${h(s).t}</h3>${h(s).b}</section>`).join('')}
      <section class="rule-card rule-kw"><h3><span class="rule-ico">🔑</span>${l === 'hu' ? 'Kulcsszavak' : 'Keywords'}</h3>
        <dl>${KW.map(([k, hu, en]) => `<div><dt>${k}</dt><dd>${l === 'hu' ? hu : en}</dd></div>`).join('')}</dl></section>
    </div>
  </div>`;
  bindLangToggle(app, () => renderRules(app));
}
