// Cards made in the Card Editor, kept in this browser (IndexedDB, with a localStorage fallback).
// Each record is a full card definition; its artwork is stored inline as a data: URL.
const DB_NAME = 'rajongoi-cards', STORE = 'cards', LS = 'rajongoi.customCards.v1';

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out?.result ?? out); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
const lsSet = (l) => localStorage.setItem(LS, JSON.stringify(l));

export async function loadCustomCards() {
  try { return await tx('readonly', s => s.getAll()); } catch { return lsGet(); }
}
export async function putCustomCard(card) {
  try { await tx('readwrite', s => s.put(card)); } catch { lsSet([...lsGet().filter(c => c.id !== card.id), card]); }
}
export async function removeCustomCard(id) {
  try { await tx('readwrite', s => s.delete(id)); } catch { lsSet(lsGet().filter(c => c.id !== id)); }
}
