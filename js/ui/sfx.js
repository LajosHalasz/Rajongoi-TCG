// Procedural sound design with the Web Audio API — no audio files needed.
// Every sound is built from filtered noise and tuned oscillators with envelopes,
// a shared convolution reverb and a master compressor.
const LS = 'rajongoi.sound.v1';
let ctx = null, master, verbIn, noiseBuf;
let muted = false;
let volume = 0.7;
try { const s = JSON.parse(localStorage.getItem(LS)); if (s) { muted = !!s.muted; volume = s.volume ?? volume; } } catch { /* ignore */ }

function save() { try { localStorage.setItem(LS, JSON.stringify({ muted, volume })); } catch { /* ignore */ } }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp); comp.connect(ctx.destination);
    // reverb
    const verb = ctx.createConvolver();
    verb.buffer = impulse(2.2, 3);
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    verbIn.connect(verb); verb.connect(wet); wet.connect(master);
    // white noise source buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function impulse(seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

/** envelope gain node routed to master (+ optional reverb send) */
function env(t, { attack = 0.004, dur = 0.2, gain = 0.3, rev = 0.15, curve = 'exp' }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  else g.gain.linearRampToValueAtTime(0.0001, t + attack + dur);
  g.connect(master);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(verbIn); }
  return g;
}

function tone({ freq = 440, to, type = 'sine', dur = 0.2, gain = 0.2, attack = 0.004, rev = 0.15, delay = 0, detune = 0, glide }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide ?? dur));
  o.connect(env(t, { attack, dur, gain, rev }));
  o.start(t); o.stop(t + attack + dur + 0.05);
}

function noise({ filter = 'bandpass', freq = 1000, to, q = 1, dur = 0.2, gain = 0.2, attack = 0.004, rev = 0.15, delay = 0, curve }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  src.connect(f); f.connect(env(t, { attack, dur, gain, rev, curve }));
  src.start(t, Math.random()); src.stop(t + attack + dur + 0.05);
}

/** bell-like partials */
function bell(freq, { gain = 0.12, dur = 1.2, delay = 0, rev = 0.5 } = {}) {
  [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.17, 0.12]].forEach(([m, g]) =>
    tone({ freq: freq * m, type: 'sine', dur: dur / (m * 0.7), gain: gain * g, rev, delay }));
}

const play = (fn) => (...a) => { if (muted) return; if (!ac()) return; try { fn(...a); } catch { /* audio is best-effort */ } };
let lastHover = 0;

export const sfx = {
  // ---------------------------------------------------------------- UI
  click: play(() => {
    tone({ freq: 1500, to: 900, type: 'triangle', dur: 0.05, gain: 0.12, rev: 0.05 });
    noise({ filter: 'highpass', freq: 3500, dur: 0.025, gain: 0.08, rev: 0 });
  }),
  hover: play(() => {
    const now = performance.now();
    if (now - lastHover < 45) return;
    lastHover = now;
    tone({ freq: 2400, type: 'sine', dur: 0.035, gain: 0.025, rev: 0.05 });
  }),
  nav: play(() => {
    noise({ filter: 'bandpass', freq: 500, to: 2800, q: 1.4, dur: 0.22, gain: 0.08, attack: 0.05, rev: 0.25 });
    tone({ freq: 660, type: 'sine', dur: 0.18, gain: 0.03, delay: 0.08, rev: 0.4 });
  }),
  toggle: play(() => { tone({ freq: 880, type: 'triangle', dur: 0.08, gain: 0.1 }); tone({ freq: 1320, type: 'triangle', dur: 0.1, gain: 0.08, delay: 0.06 }); }),
  // ------------------------------------------------------------- cards
  swish: play((vol = 1) => {
    noise({ filter: 'bandpass', freq: 3000, to: 900, q: 0.9, dur: 0.13, gain: 0.12 * vol, attack: 0.02, rev: 0.08 });
  }),
  draw: play(() => {
    noise({ filter: 'bandpass', freq: 2600, to: 1200, q: 1, dur: 0.16, gain: 0.14, attack: 0.03, rev: 0.1 });
    tone({ freq: 900, type: 'triangle', dur: 0.03, gain: 0.05, delay: 0.12, rev: 0 });
  }),
  play: play(() => {
    noise({ filter: 'bandpass', freq: 2200, to: 700, q: 0.8, dur: 0.12, gain: 0.12, attack: 0.02 });
    tone({ freq: 170, to: 60, type: 'sine', dur: 0.2, gain: 0.45, delay: 0.1, rev: 0.12 });
    noise({ filter: 'lowpass', freq: 900, dur: 0.09, gain: 0.25, delay: 0.1, rev: 0.1 });
  }),
  spell: play(() => {
    noise({ filter: 'highpass', freq: 1500, to: 7000, dur: 0.5, gain: 0.08, attack: 0.15, rev: 0.6 });
    [659, 880, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.07, delay: i * 0.06, rev: 0.6, detune: 4 }));
  }),
  gear: play(() => {
    noise({ filter: 'bandpass', freq: 1800, q: 6, dur: 0.05, gain: 0.25, rev: 0.1 });
    noise({ filter: 'bandpass', freq: 1200, q: 6, dur: 0.06, gain: 0.2, delay: 0.09, rev: 0.1 });
    tone({ freq: 220, to: 330, type: 'square', dur: 0.12, gain: 0.04, delay: 0.05, rev: 0.2 });
  }),
  rune: play(() => { bell(1046, { gain: 0.07, dur: 0.9 }); bell(1568, { gain: 0.05, dur: 0.8, delay: 0.07 }); }),
  turn: play((mine) => {
    const base = mine ? 196 : 147;
    [1, 1.5, 2].forEach((m, i) => tone({ freq: base * m, type: 'sine', dur: 1.4, gain: 0.08 / (i + 1), attack: 0.02, rev: 0.7 }));
    noise({ filter: 'lowpass', freq: 400, dur: 0.3, gain: 0.08, rev: 0.4 });
  }),
  attack: play(() => {
    noise({ filter: 'bandpass', freq: 300, to: 3500, q: 1.2, dur: 0.24, gain: 0.22, attack: 0.08, rev: 0.2 });
    tone({ freq: 110, to: 55, type: 'sawtooth', dur: 0.25, gain: 0.06, attack: 0.05, rev: 0.2 });
  }),
  block: play(() => {
    noise({ filter: 'bandpass', freq: 2500, q: 3, dur: 0.18, gain: 0.25, rev: 0.3 });
    tone({ freq: 523, type: 'triangle', dur: 0.4, gain: 0.08, rev: 0.5 });
    tone({ freq: 784, type: 'triangle', dur: 0.4, gain: 0.06, rev: 0.5, delay: 0.02 });
  }),
  impact: play(() => {
    tone({ freq: 95, to: 38, type: 'sine', dur: 0.35, gain: 0.6, rev: 0.2 });
    noise({ filter: 'lowpass', freq: 1400, to: 300, dur: 0.3, gain: 0.35, rev: 0.25 });
  }),
  destroy: play(() => {
    noise({ filter: 'lowpass', freq: 3000, to: 200, dur: 0.6, gain: 0.3, rev: 0.4 });
    tone({ freq: 220, to: 70, type: 'sawtooth', dur: 0.4, gain: 0.05, rev: 0.4 });
    for (let i = 0; i < 6; i++) noise({ filter: 'bandpass', freq: 800 + Math.random() * 2500, q: 8, dur: 0.04, gain: 0.12, delay: 0.05 + i * 0.05, rev: 0.2 });
  }),
  shield: play(() => {
    noise({ filter: 'highpass', freq: 3000, dur: 0.35, gain: 0.25, rev: 0.4 });
    for (let i = 0; i < 9; i++) tone({ freq: 2200 + Math.random() * 3800, type: 'sine', dur: 0.15 + Math.random() * 0.25, gain: 0.05, delay: Math.random() * 0.12, rev: 0.5 });
    tone({ freq: 140, to: 60, type: 'sine', dur: 0.25, gain: 0.3, rev: 0.2 });
  }),
  trigger: play(() => {
    noise({ filter: 'bandpass', freq: 400, to: 4000, q: 2, dur: 0.4, gain: 0.12, attack: 0.2, rev: 0.5 });
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.35, gain: 0.04, delay: 0.25 + i * 0.05, rev: 0.6 }));
    bell(1046, { gain: 0.08, delay: 0.45 });
  }),
  foilLand: play((delay = 0.55) => {
    noise({ filter: 'bandpass', freq: 5000, to: 500, q: 1, dur: delay, gain: 0.14, attack: 0.15, rev: 0.4 });
    tone({ freq: 1200, to: 200, type: 'sine', dur: delay, gain: 0.03, attack: 0.1, rev: 0.4 });
    tone({ freq: 75, to: 32, type: 'sine', dur: 0.7, gain: 0.8, delay, rev: 0.4 });
    noise({ filter: 'lowpass', freq: 700, to: 120, dur: 0.6, gain: 0.45, delay, rev: 0.5 });
    [1568, 2093, 2637, 3136].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.6, gain: 0.035, delay: delay + 0.05 + i * 0.04, rev: 0.7 }));
  }),
  crack: play(() => {
    for (let i = 0; i < 12; i++) noise({ filter: 'bandpass', freq: 600 + Math.random() * 2200, q: 4, dur: 0.03 + Math.random() * 0.05, gain: 0.25, delay: i * 0.025 + Math.random() * 0.02, rev: 0.2 });
    tone({ freq: 48, to: 30, type: 'sine', dur: 1.1, gain: 0.55, rev: 0.4 });
    noise({ filter: 'lowpass', freq: 250, dur: 1.1, gain: 0.35, attack: 0.02, rev: 0.4 });
    for (let i = 0; i < 8; i++) noise({ filter: 'bandpass', freq: 3000 + Math.random() * 3000, q: 6, dur: 0.03, gain: 0.08, delay: 0.3 + Math.random() * 0.6, rev: 0.2 });
  }),
  win: play(() => {
    [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]].forEach(([f, d]) => {
      tone({ freq: f, type: 'sawtooth', dur: 0.5, gain: 0.05, delay: d, rev: 0.6 });
      tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.08, delay: d, rev: 0.6, detune: 6 });
    });
    [1046, 1318, 1568].forEach(f => tone({ freq: f, type: 'triangle', dur: 1.6, gain: 0.06, delay: 0.6, rev: 0.8 }));
    bell(2093, { gain: 0.08, delay: 0.6, dur: 1.8 });
  }),
  lose: play(() => {
    [[392, 0], [349, 0.25], [311, 0.5], [262, 0.8]].forEach(([f, d]) => tone({ freq: f, type: 'triangle', dur: 0.7, gain: 0.09, delay: d, rev: 0.7 }));
    tone({ freq: 65, to: 40, type: 'sine', dur: 1.5, gain: 0.3, delay: 0.8, rev: 0.6 });
  }),
  // ------------------------------------------------------------ boosters
  packShake: play(() => {
    for (let i = 0; i < 6; i++) noise({ filter: 'bandpass', freq: 1200 + Math.random() * 1500, q: 2, dur: 0.06, gain: 0.1, delay: i * 0.08, rev: 0.05 });
    tone({ freq: 60, type: 'sine', dur: 0.5, gain: 0.15, attack: 0.1, rev: 0.1 });
  }),
  packTear: play(() => {
    for (let i = 0; i < 14; i++) noise({ filter: 'bandpass', freq: 2500 + Math.random() * 4000, q: 1.5, dur: 0.03 + Math.random() * 0.03, gain: 0.22, delay: i * 0.022, rev: 0.1 });
    noise({ filter: 'highpass', freq: 6000, to: 1500, dur: 0.35, gain: 0.12, rev: 0.2 });
    tone({ freq: 90, to: 45, type: 'sine', dur: 0.4, gain: 0.35, delay: 0.3, rev: 0.4 });
    noise({ filter: 'highpass', freq: 2000, to: 9000, dur: 0.8, gain: 0.06, attack: 0.3, delay: 0.3, rev: 0.8 });
  }),
  deal: play((i = 0) => {
    noise({ filter: 'bandpass', freq: 3200, to: 1100, q: 1, dur: 0.09, gain: 0.08, attack: 0.015, rev: 0.05 });
    tone({ freq: 1500 + i * 20, type: 'triangle', dur: 0.02, gain: 0.025, delay: 0.07, rev: 0 });
  }),
  flip: play(() => {
    noise({ filter: 'bandpass', freq: 1800, to: 3500, q: 1.2, dur: 0.08, gain: 0.14, rev: 0.05 });
    tone({ freq: 700, type: 'triangle', dur: 0.04, gain: 0.06, delay: 0.06 });
  }),
  reveal: play((tier) => {
    if (tier === 'uncommon') { bell(1318, { gain: 0.05, dur: 0.6 }); return; }
    if (tier === 'rare' || tier === 'legend') {
      [1046, 1318, 1568].forEach((f, i) => bell(f, { gain: 0.07, dur: 1.1, delay: i * 0.07 }));
      noise({ filter: 'highpass', freq: 4000, dur: 0.6, gain: 0.05, attack: 0.1, rev: 0.8 });
      return;
    }
    // epic / champion / signature
    noise({ filter: 'bandpass', freq: 300, to: 6000, q: 1.5, dur: 0.5, gain: 0.15, attack: 0.3, rev: 0.6 });
    tone({ freq: 60, to: 35, type: 'sine', dur: 0.9, gain: 0.6, delay: 0.45, rev: 0.5 });
    [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 1.4, gain: 0.05, delay: 0.45 + i * 0.045, rev: 0.8, detune: 5 }));
    bell(2093, { gain: 0.1, delay: 0.5, dur: 2 });
  }),
};

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; save();
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
}

/** Map new game-log lines to sounds (cheap, works for both players). */
export function soundForLog(line, humanName) {
  if (/ wins!/.test(line)) return line.startsWith(humanName) ? sfx.win() : sfx.lose();
  if (/^— Turn/.test(line)) return sfx.turn(line.includes(humanName));
  if (/Shield Trigger!/.test(line)) return sfx.trigger();
  if (/shield breaks/.test(line)) return sfx.shield();
  if (/defends!/.test(line)) return sfx.block();
  if (/ attacks /.test(line)) return sfx.attack();
  if (/^Fight:/.test(line)) return sfx.impact();
  if (/is destroyed|has 0 Might/.test(line)) return sfx.destroy();
  if (/ casts /.test(line)) return sfx.spell();
  if (/ equips | activates /.test(line)) return sfx.gear();
  if (/ plays /.test(line)) return null; // handled by the arrival animation
  if (/ channels /.test(line)) return sfx.rune();
  return null;
}
