// Headless AI-vs-AI games across every premade deck pairing.
import assert from 'node:assert';
import { loadData } from './load.mjs';
import { createGame, step, whoActs, setClock } from '../js/engine/game.js';
import { chooseAction } from '../js/engine/ai.js';
import { validateDeck } from '../js/engine/deck.js';

const { decks } = loadData();
let fail = 0;
for (const d of decks) {
  const v = validateDeck(d);
  console.log(`${d.name}: avg ${v.stats.avgCost.toFixed(2)} | U${v.stats.units} C${v.stats.champions} S${v.stats.spells} G${v.stats.gears} Sig${v.stats.signatures}` +
    (v.errors.length ? `\n  ERRORS: ${v.errors.join(' | ')}` : '') + (v.warnings.length ? `\n  warn: ${v.warnings.join(' | ')}` : ''));
  if (v.errors.length) fail++;
}

const GAMES = +(process.env.GAMES || 4);
const wins = {};
let total = 0, turns = 0;
for (const a of decks) for (const b of decks) {
  for (let g = 0; g < GAMES; g++) {
    setClock(() => (g % 2 ? 18 : 10)); // exercise Nostalgia Line both ways
    const s = createGame({ decks: [a, b], names: ['P1', 'P2'], ai: [true, true], seed: 1000 + g * 7 + total });
    let n = 0;
    try {
      while (s.winner == null) {
        const pi = whoActs(s);
        const act = chooseAction(s, pi);
        assert(act, 'AI returned no action');
        step(s, act);
        if (++n > 5000) throw new Error('too many actions');
      }
    } catch (e) {
      fail++;
      console.error(`\nFAIL ${a.name} vs ${b.name} seed game ${g}:`, e.stack);
      console.error(s.log.slice(-15).join('\n'));
      continue;
    }
    total++; turns += s.turn;
    const w = s.winner === -1 ? 'draw' : (s.winner === 0 ? a.name : b.name);
    wins[w] = (wins[w] || 0) + 1;
  }
}
console.log(`\n${total} games, avg ${(turns / total).toFixed(1)} total turns`);
console.log(wins);
if (fail) { console.error(`${fail} failures`); process.exit(1); }
console.log('OK');
