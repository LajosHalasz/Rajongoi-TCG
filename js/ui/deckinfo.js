// Play-vs-AI setup: the starting Legend / Champion / Signatures of each picked deck,
// a strategy guide, matchup tips and the achievements reachable in that matchup.
import { getDef, hasDef } from '../engine/cards.js';
import { achievementHints } from '../engine/achievements.js';
import { deckGuide } from '../data.js';
import { cardHtml, esc } from './card.js';
import { unlockedMap } from './achievements.js';
import { getLang } from './lang.js';

// UI strings: [hu, en]
const T = {
  noGuide: ['Ehhez a paklihoz még nincs leírás.', 'No strategy notes for this deck yet.'],
  plan: ['Játékterv', 'Game plan'], combos: ['Kombók', 'Combos'],
  random: ['Az AI véletlenszerűen választ a játszható paklik közül.', 'The AI will pick one of the playable decks at random.'],
  aiPlan: ['Az AI teljes játékterve', "The AI's full game plan"],
  howTo: ['Így játszd ezt a paklit', 'How to play this deck'],
  matchup: ['Tippek az ellenfél ellen', 'Matchup tips'],
  achs: ['Megszerezhető achievementek', 'Achievements you can go for'],
  achsRandom: [' (véletlen ellenféllel)', ' (opponent random)'],
  unlocked: ['✓ megvan', '✓ unlocked'],
};
const t = (k) => T[k][getLang() === 'hu' ? 0 : 1];
const L = (hu, en) => (getLang() === 'hu' ? hu : en);

const deckIds = (d) => new Set([d.legend, d.champion, ...Object.keys(d.cards || {})].filter(id => id && hasDef(id)));
const defs = (ids) => [...ids].map(getDef);
const kw = (d, k) => (d.keywords || []).includes(k);
const nameList = (list) => list.map(d => `<b>${esc(d.name)}</b>`).join(', ');

/** The cards a deck starts the game with: Legend, starting Champion and its Signatures. */
function startingCards(d) {
  const sigs = Object.keys(d.cards || {}).filter(id => hasDef(id) && getDef(id).type === 'signature');
  if (d.signature && !sigs.includes(d.signature)) sigs.unshift(d.signature);
  return [
    ...(d.legend ? [{ id: d.legend, role: 'Legend' }] : []),
    ...(d.champion ? [{ id: d.champion, role: 'Champion' }] : []),
    ...sigs.map(id => ({ id, role: 'Signature' })),
  ].filter(x => hasDef(x.id));
}

/** Tips derived from what the two decks actually contain. */
function matchupTips(mine, theirs) {
  const M = defs(mine), T = defs(theirs);
  const tips = [];
  const triggers = T.filter(d => kw(d, 'Shield Trigger'));
  if (triggers.length) {
    tips.push(L(`${triggers.length} Shield Trigger van a paklijában (${nameList(triggers)}). `
      + (mine.has('OGN-177') ? 'A nagy támadás előtt játszd ki a <b>GOLDEN</b>-t, hogy egyik se süljön el.' : 'Ne támadj túl sok lappal egyszerre a Shieldjeire.'),
    `They run ${triggers.length} Shield Trigger${triggers.length > 1 ? 's' : ''} (${nameList(triggers)}). `
      + (mine.has('OGN-177') ? 'Cast <b>GOLDEN</b> before your big attack so none of them can fire.' : 'Don\'t over-commit into their shields.')));
  }
  const walls = T.filter(d => kw(d, 'Defensive'));
  if (walls.length) {
    const pb = M.filter(d => kw(d, 'Party Breaker'));
    tips.push(L(`A Defensive Unitjai (${nameList(walls)}) magukra irányíthatják a támadásaidat.`
      + (pb.length ? ` ${nameList(pb)} álló Unitokat is támadhat, ezzel takarítsd el őket előbb.` : ' Fordítsd le vagy távolítsd el őket, mielőtt a Shieldekre mész.'),
    `Their Defensive units (${nameList(walls)}) can redirect your attacks.`
      + (pb.length ? ` ${nameList(pb)} can attack untapped units — use it to clear them first.` : ' Tap or remove them before going for shields.')));
  }
  const chaos = T.filter(d => (d.colors || []).includes('Chaos') && d.type !== 'legend' && (d.power ?? 0) < 5);
  if (chaos.length && mine.has('OGN-172')) tips.push(L(`A <b>Cowtrix</b> érkezéskor elpusztítja a nem Mighty Chaos lapjait (${chaos.length} van a paklijában).`, `<b>Cowtrix</b> destroys their non-Mighty Chaos cards when it enters (${chaos.length} in their deck).`));
  const big = T.filter(d => (d.cost || 0) >= 7 && ['unit', 'champion'].includes(d.type));
  if (big.length) tips.push(L(`A legerősebb lapjai: ${nameList(big)}. Ha már van rájuk manája, tarts vissza egy Defensive Unitot.`, `Their top end: ${nameList(big)}. Keep a Defensive unit back once they reach that much mana.`));
  const deathtouch = T.filter(d => JSON.stringify(d.effects || []).includes('TKN-005') || kw(d, 'Deathtouch'));
  if (deathtouch.length) tips.push(L(`Vigyázz a Deathtouch-ra (${nameList(deathtouch)}): tokennel támadd, ne a legjobb Unitoddal.`, `Watch out for Deathtouch (${nameList(deathtouch)}): attack it with tokens, not with your best unit.`));
  if (theirs.has('OGN-186')) tips.push(L('Nála is van <b>The ULTIMATE FLEX</b>: ha elsül, abban a körben nem veszíthet, úgyhogy ne pazarold bele a győztes támadást.', 'They also run <b>The ULTIMATE FLEX</b>: when it resolves they can\'t lose that turn, so don\'t waste a lethal swing into it.'));
  return tips;
}

function cardRow(d) {
  return `<div class="di-cards">${startingCards(d).map(x => `<div class="di-card" data-di-cid="${x.id}">
    ${cardHtml(getDef(x.id), { size: 'sm' })}<span class="di-role">${x.role}</span></div>`).join('')}</div>`;
}

function guideHtml(d, withStyle = true) {
  const g = deckGuide(d.id, getLang());
  if (!g) return `<p class="muted">${t('noGuide')}</p>`;
  const chips = (ids) => ids.filter(hasDef).map(id => `<span class="di-chip" data-di-cid="${id}">${esc(getDef(id).name)}</span>`).join('');
  return `${withStyle ? styleHtml(g) : ''}
    ${g.plan?.length ? `<h4>${t('plan')}</h4><ol class="di-plan">${g.plan.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
    ${g.mulligan ? `<p class="di-mull"><b>Mulligan:</b> ${esc(g.mulligan)}</p>` : ''}
    ${g.combos?.length ? `<h4>${t('combos')}</h4><div class="di-combos">${g.combos.map(c => `<div class="di-combo"><div class="di-chips">${chips(c.cards)}</div>${esc(c.text)}</div>`).join('')}</div>` : ''}`;
}

const styleHtml = (g) => `<div class="di-style"><span class="di-arch">${esc(g.archetype || '')}</span>${esc(g.style || '')}</div>`;

/** Short strategy for the Decks page: archetype + one-paragraph style, the game plan folded away. */
export function strategyHtml(d) {
  const g = deckGuide(d.id, getLang());
  if (!g) return `<p class="muted">${t('noGuide')}</p>`;
  return `${styleHtml(g)}${g.plan?.length ? `<details class="di-sec"><summary>${t('plan')}</summary><ol class="di-plan">${g.plan.map(p => `<li>${esc(p)}</li>`).join('')}</ol></details>` : ''}`;
}

/** Info column for one side. `other` is the opposing deck (null = random AI deck). */
export function deckInfoHtml(deck, other, side) {
  if (!deck) {
    return `<div class="deck-info"><p class="muted">${t('random')}</p></div>`;
  }
  const mine = deckIds(deck), theirs = other ? deckIds(other) : null;
  if (side === 'ai') {
    // what to watch out for is already in the player's Matchup tips; keep this side short
    const g = deckGuide(deck.id, getLang());
    return `<div class="deck-info">${cardRow(deck)}
      ${g ? styleHtml(g) : ''}
      <details class="di-sec"><summary>${t('aiPlan')}</summary>${guideHtml(deck, false)}</details>
    </div>`;
  }
  const tips = theirs ? matchupTips(mine, theirs) : [];
  const got = unlockedMap();
  const hints = achievementHints(mine, theirs).sort((a, b) => !!got[a.id] - !!got[b.id]);
  return `<div class="deck-info">${cardRow(deck)}
    <details class="di-sec" open><summary>${t('howTo')}</summary>${guideHtml(deck)}</details>
    ${tips.length ? `<details class="di-sec" open><summary>${t('matchup')}</summary><ul class="di-tips">${tips.map(t => `<li>${t}</li>`).join('')}</ul></details>` : ''}
    ${hints.length ? `<details class="di-sec" open><summary>${t('achs')}${theirs ? '' : t('achsRandom')}</summary>
      <div class="di-achs">${hints.map(a => `<div class="di-ach ${got[a.id] ? 'got' : ''}"><span class="ach-ico">${a.icon}</span>
        <div><b>${esc(a.name)}</b>${got[a.id] ? ` <span class="di-done">${t('unlocked')}</span>` : ''}<div class="muted">${esc(L(a.tip.hu, a.tip.en))}</div></div></div>`).join('')}</div></details>` : ''}
  </div>`;
}
