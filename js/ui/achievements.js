// Achievements page, unlock storage (per browser) and the unlock toast.
import { ACHIEVEMENTS } from '../engine/achievements.js';
import { esc } from './card.js';
import { sfx } from './sfx.js';

const LS = 'rajongoi.achievements.v1';
export function unlockedMap() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
function save(m) { try { localStorage.setItem(LS, JSON.stringify(m)); } catch { /* ignore */ } }

/** Store new unlocks and show a toast for each. */
export function unlock(ids) {
  const m = unlockedMap();
  const fresh = ids.filter(id => !m[id]);
  for (const id of fresh) m[id] = Date.now();
  if (!fresh.length) return;
  save(m);
  fresh.forEach((id, i) => setTimeout(() => toast(ACHIEVEMENTS.find(a => a.id === id)), i * 1600));
}

function toast(a) {
  if (!a) return;
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = `<div class="ach-ico">${a.icon}</div><div><div class="ach-kicker">Achievement unlocked!</div><b>${esc(a.name)}</b><div class="ach-desc">${esc(a.desc)}</div></div>`;
  document.body.appendChild(el);
  sfx.reveal('rare');
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

export function renderAchievements(app) {
  const m = unlockedMap();
  const got = ACHIEVEMENTS.filter(a => m[a.id]).length;
  const obtainable = ACHIEVEMENTS.filter(a => !a.unobtainable).length;
  app.innerHTML = `<div class="page ach-page">
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">Achievements</h2><span class="spacer"></span>
      <span class="ach-count"><b>${got}</b> / ${obtainable} unlocked</span></div>
    <div class="ach-bar"><i style="width:${(100 * got / obtainable).toFixed(0)}%"></i></div>
    <p class="muted">Achievements are unlocked in <b>Play vs AI</b> and are saved in this browser.</p>
    <div class="ach-grid">${ACHIEVEMENTS.map(a => {
      const when = m[a.id] ? new Date(m[a.id]).toLocaleDateString() : '';
      return `<div class="ach ${m[a.id] ? 'got' : 'locked'} ${a.unobtainable ? 'unob' : ''}">
        <div class="ach-ico">${a.icon}</div>
        <div class="ach-body"><b>${esc(a.name)}</b><div class="ach-desc">${esc(a.desc)}</div>
          <div class="ach-state">${m[a.id] ? `✓ Unlocked ${esc(when)}` : a.unobtainable ? esc(a.unobtainable) : 'Locked'}</div></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}
