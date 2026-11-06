import { loadData } from './data.js';
import { allCards, hasDef, getDef } from './engine/cards.js';
import { cardHtml, installAutoFit } from './ui/card.js';
import { renderCollection, renderDecks, renderBuilder } from './ui/collection.js';
import { renderSetup, stopGame } from './ui/play.js';
import { renderBoosters } from './ui/boosters.js';
import { sfx, isMuted, setMuted } from './ui/sfx.js';

const app = document.getElementById('app');

function renderHome() {
  // 5 random finished cards (with artwork) on every visit
  const pool = allCards().filter(c => c.image && c.type !== 'rune');
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const showcase = pool.slice(0, 5);
  const fan = showcase.map((d, i) => {
    const rot = (i - (showcase.length - 1) / 2) * 7;
    return cardHtml(d, { size: 'md', classes: 'fan-card', style: `transform:rotate(${rot}deg) translateY(${Math.abs(rot) * 1.4}px)` });
  }).join('');
  const seeds = Array.from({ length: 22 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.73) % 9}s;animation-duration:${9 + (i % 5) * 2}s;--s:${0.6 + (i % 4) * 0.25}"></i>`).join('');
  app.innerHTML = `<div class="home-bg" aria-hidden="true">
    <div class="rays"></div><div class="rays rays-2"></div>
    <div class="hero-glow"></div>
    <img class="hero" src="img/mascot.svg" alt="">
    <div class="seeds">${seeds}</div>
    <div class="vignette"></div>
  </div>
  <section class="home"><div>
    <h1>RAJONGOI TCG</h1>
    <div class="tag">Shields, runes &amp; legends — a fan-made duel card game</div>
    <div class="menu">
      <button class="primary" onclick="location.hash='#/play'">Play against AI</button>
      <button onclick="location.hash='#/boosters'">Open boosters</button>
      <button onclick="location.hash='#/collection'">Collection</button>
      <button class="ghost" onclick="location.hash='#/decks'">Decks</button>
    </div>
    <div class="fan">${fan}</div>
    <p class="muted" style="margin-top:20px">${allCards().length} cards loaded</p>
  </div></section>`;
}

let firstRoute = true;
function route() {
  if (!firstRoute) sfx.nav();
  firstRoute = false;
  stopGame();
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [page, arg] = parts;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (page === 'deck' ? 'decks' : page)));
  window.scrollTo(0, 0);
  switch (page) {
    case 'play': return renderSetup(app);
    case 'collection': return renderCollection(app, arg || 'OGN');
    case 'decks': return renderDecks(app);
    case 'deck': return renderBuilder(app, arg || 'new');
    case 'boosters': return renderBoosters(app);
    default: return renderHome();
  }
}

installAutoFit();

// UI sounds: clicks on controls, soft ticks on hover
const muteBtn = document.getElementById('mute');
const paintMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
paintMute();
muteBtn.onclick = (e) => { e.stopPropagation(); setMuted(!isMuted()); paintMute(); sfx.toggle(); };
const CONTROLS = 'button, .chip, .dd-opt, .deck-pick, .tabs button, nav a, .logo, select';
document.addEventListener('click', (e) => {
  const t = e.target.closest(CONTROLS);
  if (t && t !== muteBtn && !t.disabled) sfx.click();
}, true);
let hoverEl = null;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest(CONTROLS + ', .grid .card, .hand-row.mine .card, .flip');
  if (t && t !== hoverEl) { hoverEl = t; if (t.matches('.hand-row.mine .card')) sfx.swish(0.5); else sfx.hover(); }
  if (!t) hoverEl = null;
});
loadData().then(() => {
  window.addEventListener('hashchange', route);
  route();
}).catch(err => {
  app.innerHTML = `<div class="page"><h2>Could not load card data</h2><p class="muted">${err}</p>
  <p>Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) — opening index.html as a file won't work.</p></div>`;
});
