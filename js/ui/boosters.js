// Booster pack opening: pick a set, tear the pack open, flip the cards.
import { openPack, boosterSets, setPools, PACK_RULES } from '../engine/booster.js';
import { rarityOf, getDef } from '../engine/cards.js';
import { COLORS } from '../engine/rules.js';
import { cardHtml, esc } from './card.js';
import { showCardModal } from './collection.js';

const SET_INFO = {
  OGN: { name: 'OGN 2026-01', sub: 'Origins', c1: '#d8433b', c2: '#3b82c8' },
  DND: { name: 'DND', sub: 'Dungeons & Dragons DLC', c1: '#8e4fc4', c2: '#4b9a4b' },
};
const LS_PULLS = 'rajongoi.pulls.v1';
const loadPulls = () => { try { return JSON.parse(localStorage.getItem(LS_PULLS)) || {}; } catch { return {}; } };
const savePulls = (p) => { try { localStorage.setItem(LS_PULLS, JSON.stringify(p)); } catch { /* ignore */ } };

let state = { set: null, pack: null, revealed: new Set(), opened: 0, busy: false };

const tier = (e) => (e.slot === 'hit' ? 'hit' : e.slot === 'legend' ? 'legend' : rarityOf(e.def));

export function renderBoosters(app) {
  const sets = boosterSets();
  if (!state.set || !sets.includes(state.set)) state.set = sets[0];
  state.pack = null;
  drawShop(app, sets);
}

function packHtml(set, extra = '') {
  const s = SET_INFO[set] || { name: set, sub: '', c1: '#b07335', c2: '#3a2a1a' };
  return `<div class="booster ${extra}" style="--p1:${s.c1};--p2:${s.c2}">
    <div class="booster-top"><span>RAJONGOI TCG</span></div>
    <div class="booster-body">
      <div class="booster-logo">RAJONGOI<br>TCG</div>
      <div class="booster-set">${esc(s.name)}</div>
      <div class="booster-sub">${esc(s.sub)}</div>
      <div class="booster-count">15 cards</div>
    </div>
    <div class="booster-shine"></div>
  </div>`;
}

function drawShop(app, sets) {
  const P = setPools(state.set);
  app.innerHTML = `<div class="page booster-page">
    <h2>Booster packs</h2>
    <div class="tabs">${sets.map(s => `<button class="${s === state.set ? 'active' : ''}" data-set="${s}">${esc(SET_INFO[s]?.name || s)}</button>`).join('')}</div>
    <div class="booster-stage">
      <div class="booster-wrap" id="pack" title="Click to open">${packHtml(state.set, 'idle')}</div>
      <p class="muted">Click the pack to tear it open.</p>
    </div>
    <div class="booster-odds muted">
      Each pack: ${PACK_RULES.commons} Commons (a Legend may replace one) · ${PACK_RULES.uncommons} Uncommons · 1 Rune or Token ·
      1 Champion or Signature in ~1 of ${Math.round(1 / PACK_RULES.hitChance)} packs (otherwise a Rare).
      <br>Pool: ${P.commons.length} commons, ${P.uncommons.length} uncommons, ${P.rares.length} rares, ${P.hits.length} champions/signatures, ${P.legends.length} legends.
      ${state.opened ? `<br>Packs opened this session: <b>${state.opened}</b>` : ''}
    </div>
  </div>`;
  app.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { state.set = b.dataset.set; drawShop(app, sets); });
  app.querySelector('#pack').onclick = () => tearOpen(app, sets);
}

function tearOpen(app, sets) {
  if (state.busy) return;
  state.busy = true;
  const wrap = app.querySelector('#pack');
  const pack = wrap.querySelector('.booster');
  pack.classList.remove('idle');
  pack.classList.add('shake');
  setTimeout(() => {
    pack.classList.remove('shake');
    pack.classList.add('torn');
    burst(wrap, ['#fff', '#ffd36b', SET_INFO[state.set]?.c1 || '#d8433b'], 26);
  }, 520);
  setTimeout(() => {
    state.pack = openPack(state.set);
    state.revealed = new Set();
    state.opened++;
    const pulls = loadPulls();
    state.pack.forEach(e => { e.isNew = !pulls[e.def.id]; pulls[e.def.id] = (pulls[e.def.id] || 0) + 1; });
    savePulls(pulls);
    state.busy = false;
    drawReveal(app, sets);
  }, 1250);
}

function drawReveal(app, sets) {
  const cards = state.pack.map((e, i) => {
    const t = tier(e);
    return `<div class="flip t-${t}" data-i="${i}" style="--d:${i * 55}ms">
      <div class="flip-inner">
        <div class="flip-face flip-back"><div class="pack-back"><span>RAJONGOI<br>TCG</span></div></div>
        <div class="flip-face flip-front">${cardHtml(e.def, { size: 'md' })}${e.isNew ? '<span class="new-badge">NEW</span>' : ''}</div>
      </div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="page booster-page">
    <div class="row" style="margin-bottom:10px"><h2 style="margin:0">${esc(SET_INFO[state.set]?.name || state.set)} booster</h2><span class="spacer"></span>
      <button id="all" class="primary">Reveal all</button></div>
    <p class="muted" style="margin-top:0">Click the cards to flip them. The best card is saved for last.</p>
    <div class="reveal-grid">${cards}</div>
    <div class="row" id="after" style="justify-content:center;margin-top:20px;visibility:hidden">
      <button class="primary" id="again">Open another pack</button>
      <button id="back">Back to packs</button>
    </div>
  </div>`;
  const flip = (el) => {
    const i = +el.dataset.i;
    if (state.revealed.has(i)) { showCardModal(getDef(state.pack[i].def.id)); return; }
    state.revealed.add(i);
    el.classList.add('flipped');
    const t = tier(state.pack[i]);
    if (['rare', 'epic', 'hit', 'legend'].includes(t)) {
      setTimeout(() => {
        burst(el, t === 'hit' || t === 'epic' ? ['#ff5fd2', '#6be3ff', '#ffe36b', '#8dff7a'] : ['#ffd36b', '#fff2b8', '#e6ad3c'], t === 'rare' ? 18 : 34);
        if (t !== 'rare') app.querySelector('.booster-page').classList.add('quake');
        setTimeout(() => app.querySelector('.booster-page')?.classList.remove('quake'), 450);
      }, 260);
    }
    if (state.revealed.size === state.pack.length) app.querySelector('#after').style.visibility = 'visible';
  };
  app.querySelectorAll('.flip').forEach(el => el.onclick = () => flip(el));
  app.querySelector('#all').onclick = () => {
    const els = [...app.querySelectorAll('.flip')].filter(el => !state.revealed.has(+el.dataset.i));
    els.forEach((el, k) => setTimeout(() => flip(el), k * 140));
  };
  app.querySelector('#again').onclick = () => { drawShop(app, sets); setTimeout(() => app.querySelector('#pack')?.click(), 50); };
  app.querySelector('#back').onclick = () => drawShop(app, sets);
}

/** Little particle burst around an element. */
function burst(el, colors, n) {
  const r = el.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = r.left + r.width / 2 + 'px';
  layer.style.top = r.top + r.height / 2 + 'px';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 90 + Math.random() * 140;
    p.style.setProperty('--x', Math.cos(a) * dist + 'px');
    p.style.setProperty('--y', Math.sin(a) * dist + 'px');
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 80 + 'ms';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}

export { COLORS };
