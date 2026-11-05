import { loadData } from './data.js';
import { allCards, hasDef, getDef } from './engine/cards.js';
import { cardHtml, installAutoFit } from './ui/card.js';
import { renderCollection, renderDecks, renderBuilder } from './ui/collection.js';
import { renderSetup, stopGame } from './ui/play.js';
import { renderBoosters } from './ui/boosters.js';

const app = document.getElementById('app');

function renderHome() {
  const showcase = ['OGN-001', 'OGN-002', 'OGN-003', 'OGN-004', 'TKN-001'].filter(hasDef).map(getDef);
  const fan = showcase.map((d, i) => {
    const rot = (i - (showcase.length - 1) / 2) * 7;
    return cardHtml(d, { size: 'md', classes: 'fan-card' }).replace('class="card', `style="transform:rotate(${rot}deg) translateY(${Math.abs(rot) * 1.4}px)" class="card`);
  }).join('');
  app.innerHTML = `<section class="home"><div>
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

function route() {
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
loadData().then(() => {
  window.addEventListener('hashchange', route);
  route();
}).catch(err => {
  app.innerHTML = `<div class="page"><h2>Could not load card data</h2><p class="muted">${err}</p>
  <p>Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) — opening index.html as a file won't work.</p></div>`;
});
