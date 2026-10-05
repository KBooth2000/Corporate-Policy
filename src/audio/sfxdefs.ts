// SFX + loop recipes. Each recipe builds a layered synthesis graph into an OfflineAudioContext via Syn.
// Buffers are peak-normalised after rendering; `lvl` (dB) is the playback level. vars = pre-rendered variants.
import type { SfxName, LoopName } from './audio';
import { Syn } from './synth';
import { VOWELS } from './core';

export interface SfxDef {
  d: number;               // render length (s)
  lvl?: number;            // playback level dB (default -6)
  vars?: number;           // variants (default 2)
  lim?: number;            // max concurrent instances (default 4)
  pri?: number;            // render priority (lower first; default 5)
  stereo?: boolean;        // render in stereo (stingers / wide sounds)
  minAtt?: number;         // floor for distance attenuation (telegraphs stay audible)
  b: (s: Syn) => void;
}
export interface LoopDef { d: number; lvl?: number; stereo?: boolean; aligned?: boolean; b: (s: Syn, d: number) => void }

const V = (k: keyof typeof VOWELS): [number, number, number] => [VOWELS[k][0], VOWELS[k][1], VOWELS[k][2]];

// ------------------------------------------------------------------ shared layers
function impactLayer(s: Syn, t: number, weight: number, bright = 1): void {
  s.thump(t, 150 * (0.9 + 0.2 * s.r.next()), 42, 0.22 * weight, 0.9);
  s.nz({ t, d: 0.07 * weight, v: 0.55, lp: 2200 * bright, k: 'white' });
  s.nz({ t, d: 0.012, v: 0.45 * bright, hp: 2500 });
}
function splatLayer(s: Syn, t: number, size: number, v = 1): void {
  s.nz({ t, d: 0.2 * size, v: 0.7 * v, bp: 1100, f2: 220, q: 1.3 });
  s.nz({ t, d: 0.1 * size, v: 0.6 * v, lp: 500, k: 'brown' });
  s.thump(t, 110, 50, 0.12, 0.45 * v);
  const n = Math.round(5 + size * 6);
  for (let i = 0; i < n; i++) {
    const tt = t + s.r.range(0.02, 0.3 * size);
    const f = s.r.range(250, 900);
    s.tone({ f, f2: f * s.r.range(1.5, 2.6), t: tt, d: s.r.range(0.02, 0.06), v: 0.18 * v, a: 0.002 });
  }
  s.ticks(t + 0.03, 0.25 * size, Math.round(4 * size), 1400, 0.25 * v);
}
function shatterLayer(s: Syn, t: number, size: number, v = 1): void {
  s.nz({ t, d: 0.035, v: 0.9 * v, hp: 1800 });
  s.thump(t, 220, 90, 0.1, 0.35 * v);
  s.grains(t + 0.005, 0.7 * size, Math.round(28 * size), 2600, 9500, 0.28 * v, 0.06);
  s.grains(t + 0.1, 0.9 * size, Math.round(12 * size), 4000, 11000, 0.16 * v, 0.03);
  s.nz({ t, d: 0.45 * size, v: 0.3 * v, hp: 5000, a: 0.005 });
}
function zapLayer(s: Syn, t: number, d: number, v = 1, base = 180): void {
  const { ctx } = s;
  const T = s.t0 + t;
  const g = s.g(0);
  const bp = s.bp(1800, 0.8, g);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.connect(s.drive(4, 0.6, bp));
  let tt = T;
  while (tt < T + d) { o.frequency.setValueAtTime(base * s.r.range(0.5, 3), tt); tt += s.r.range(0.008, 0.03); }
  g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(0.5 * v, T + 0.004); g.gain.setValueAtTime(0.5 * v, T + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0005, T + d); g.gain.linearRampToValueAtTime(0, T + d + 0.005);
  o.start(T); o.stop(T + d + 0.01);
  for (let i = 0; i < Math.round(d * 30); i++) s.nz({ t: t + s.r.next() * d, d: s.r.range(0.005, 0.02), v: 0.5 * v * s.r.next(), hp: 3000 });
}
function explosionLayer(s: Syn, t: number, size: number, v = 1): void {
  s.nz({ t, d: 0.02, v: 1 * v, hp: 800 });
  const dr = s.drive(2.5, 0.8);
  s.thump(t, 90, 28, 1.2 * size, 1 * v, dr);
  s.nz({ t, d: 2.0 * size, v: 0.9 * v, lp: 900, f2: 120, k: 'brown', a: 0.004 });
  s.nz({ t, d: 0.6 * size, v: 0.5 * v, lp: 3500, f2: 500, k: 'pink' });
  s.ticks(t + 0.1, 1.2 * size, Math.round(18 * size), 1800, 0.25 * v);
  s.ticks(t + 0.2, 1.5 * size, Math.round(10 * size), 500, 0.35 * v);
}
function bell(s: Syn, t: number, f: number, d: number, v: number, to?: AudioNode): void {
  s.ring(t, f, [1, 2.0, 2.76, 4.07, 5.4], d, v, to);
}
function chimeSeq(s: Syn, notes: number[], step: number, inst = 'glock', v = 0.9, to?: AudioNode, dur = 0.8): void {
  notes.forEach((m, i) => s.note(inst, i * step, m, dur, v, {}, to));
}
function stepLayer(s: Syn, t: number, v: number, hard = 0.5): void {
  s.nz({ t, d: 0.05, v: 0.7 * v, lp: 900 + hard * 1200, k: 'pink' });
  s.thump(t, 90, 55, 0.05, 0.4 * v);
  s.nz({ t: t + 0.005, d: 0.012, v: 0.25 * v * hard, hp: 3500 });
}
function coinLayer(s: Syn, t: number, v: number): void {
  const f = s.r.range(2400, 3400);
  s.ring(t, f, [1, 1.52, 2.31, 3.1], 0.35, 0.35 * v);
  s.nz({ t, d: 0.01, v: 0.3 * v, hp: 4000 });
}
function motor(s: Syn, t: number, d: number, f: number, v: number, f2?: number, to?: AudioNode): void {
  const lp = s.lp(f * 8, 1, to);
  s.tone({ w: 'sawtooth', f, f2: f2 ?? f, t, d, v, hold: true, a: 0.05, rel: 0.08, to: lp, lin: true });
  s.tone({ w: 'square', f: f * 2.01, f2: (f2 ?? f) * 2.01, t, d, v: v * 0.3, hold: true, a: 0.05, rel: 0.08, to: lp, lin: true });
}
function crowd(s: Syn, t: number, d: number, v: number, n: number, vowel: keyof typeof VOWELS, rise = 1): void {
  for (let i = 0; i < n; i++) {
    const f0 = s.r.chance(0.5) ? s.r.range(110, 160) : s.r.range(190, 280);
    s.vowel(t + s.r.range(0, 0.12), f0, d * s.r.range(0.7, 1), v / Math.sqrt(n), V(vowel), { f0end: f0 * rise * s.r.range(0.9, 1.1), vib: 25, breath: 0.15, a: 0.06 });
  }
}

// ------------------------------------------------------------------ the table
export const SFX: Record<SfxName, SfxDef> = {
  // ===== UI / CorpOS
  ui_move: { d: 0.08, lvl: -15, vars: 2, lim: 2, pri: 0, b: (s) => { s.tone({ w: 'triangle', f: 1180, f2: 1260, d: 0.045, v: 0.6, a: 0.002 }); s.nz({ d: 0.006, v: 0.2, hp: 5000 }); } },
  ui_select: { d: 0.2, lvl: -12, vars: 2, lim: 2, pri: 0, b: (s) => { s.beep(0, 880, 0.05, 0.4, 'triangle'); s.beep(0.055, 1320, 0.09, 0.45, 'triangle'); s.tone({ f: 2640, t: 0.055, d: 0.12, v: 0.12 }); } },
  ui_back: { d: 0.2, lvl: -13, vars: 2, lim: 2, pri: 0, b: (s) => { s.beep(0, 1100, 0.05, 0.4, 'triangle'); s.beep(0.055, 740, 0.09, 0.42, 'triangle'); } },
  ui_error: { d: 0.3, lvl: -11, vars: 1, lim: 2, pri: 0, b: (s) => { const b = s.bp(700, 1.2); s.tone({ w: 'square', f: 196, d: 0.09, v: 0.6, hold: true, to: b }); s.tone({ w: 'square', f: 185, t: 0.12, d: 0.12, v: 0.6, hold: true, to: b }); } },
  ui_notify: { d: 1.2, lvl: -11, vars: 1, lim: 2, pri: 1, stereo: true, b: (s) => { const r = s.room(1.2, 0.3); chimeSeq(s, [88, 95], 0.09, 'glock', 0.9, r); s.note('vibes', 0.09, 83, 0.4, 0.5, {}, r); } },
  ui_email: { d: 1.0, lvl: -11, vars: 1, lim: 2, pri: 1, stereo: true, b: (s) => { const r = s.room(1, 0.25); chimeSeq(s, [76, 81, 88], 0.07, 'marimba', 1, r); s.whoosh(0, 0.25, 0.2, 2000, 7000, r); } },
  ui_purchase: { d: 1.0, lvl: -9, vars: 2, lim: 2, pri: 1, b: (s) => { s.nz({ d: 0.05, v: 0.5, bp: 3500, q: 1.5 }); s.nz({ t: 0.04, d: 0.12, v: 0.3, hp: 4000 }); bell(s, 0.06, 2093, 0.6, 0.35); bell(s, 0.16, 2637, 0.7, 0.35); coinLayer(s, 0.1, 0.6); coinLayer(s, 0.2, 0.4); } },
  ui_unlock: { d: 1.6, lvl: -9, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(1.6, 0.35); chimeSeq(s, [79, 83, 86, 91, 95], 0.06, 'glock', 0.9, r, 1.2); s.nz({ t: 0.1, d: 1.0, v: 0.12, hp: 7000, a: 0.2 }); } },
  ui_typing: { d: 0.08, lvl: -16, vars: 4, lim: 3, pri: 0, b: (s) => { s.nz({ d: 0.008, v: 0.6, bp: s.r.range(2500, 4500), q: 2 }); s.thump(0.002, 260, 120, 0.03, 0.35); s.nz({ t: 0.03, d: 0.006, v: 0.25, bp: 2000, q: 2 }); } },
  ui_login: { d: 2.6, lvl: -9, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(2.5, 0.45); s.note('pad', 0, 60, 1.6, 0.8, { att: 0.3, cut: 2200 }, r); s.note('pad', 0, 64, 1.6, 0.6, { att: 0.3, cut: 2200 }, r); s.note('pad', 0, 71, 1.6, 0.5, { att: 0.3, cut: 2200 }, r); chimeSeq(s, [76, 79, 86, 84], 0.16, 'glock', 0.9, r, 1.4); } },
  ui_logout: { d: 2.0, lvl: -10, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(2, 0.4); chimeSeq(s, [84, 79, 76, 72], 0.15, 'glock', 0.85, r, 1.2); s.note('pad', 0.1, 57, 1.1, 0.6, { att: 0.2, cut: 1500 }, r); } },
  ui_toggle: { d: 0.1, lvl: -14, vars: 2, lim: 2, pri: 0, b: (s) => { s.nz({ d: 0.006, v: 0.6, bp: 3200, q: 2 }); s.tone({ f: 1600, d: 0.02, v: 0.2 }); s.nz({ t: 0.035, d: 0.006, v: 0.4, bp: 2400, q: 2 }); } },
  ui_slide: { d: 0.22, lvl: -15, vars: 2, lim: 2, pri: 0, b: (s) => { s.whoosh(0, 0.18, 0.5, 1500, 6000); } },

  // ===== building
  lift_chime: { d: 2.0, lvl: -8, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(1.5, 0.3); bell(s, 0, 1318.5, 1.6, 0.45, r); bell(s, 0.42, 1046.5, 1.8, 0.45, r); } },
  lift_doors: { d: 1.4, lvl: -10, vars: 1, lim: 1, b: (s) => { s.nz({ d: 0.9, v: 0.35, bp: 900, q: 0.8, a: 0.15, hold: true, rel: 0.2 }); motor(s, 0, 1.0, 70, 0.15); s.thump(1.05, 120, 60, 0.15, 0.6); s.nz({ t: 1.05, d: 0.06, v: 0.4, lp: 1500 }); } },
  lift_motor: { d: 2.2, lvl: -11, vars: 1, lim: 1, b: (s) => { motor(s, 0, 2.0, 48, 0.3, 62); s.tone({ f: 380, f2: 560, d: 2.0, v: 0.05, hold: true, a: 0.4, rel: 0.3, lin: true }); s.nz({ d: 2.0, v: 0.15, lp: 400, k: 'brown', hold: true, a: 0.3, rel: 0.3 }); } },
  stairs_steps: { d: 1.6, lvl: -12, vars: 2, lim: 1, b: (s) => { const r = s.room(1.4, 0.35); for (let i = 0; i < 5; i++) stepLayer(s, i * 0.28 + s.r.range(-0.02, 0.02), 0.9, 0.9); void r; } },
  door_lock: { d: 0.9, lvl: -6, vars: 2, lim: 2, pri: 2, b: (s) => { impactLayer(s, 0, 1.2, 0.6); s.nz({ t: 0.05, d: 0.12, v: 0.4, bp: 1800, q: 2, f2: 900 }); s.ring(0.0, 420, [1, 2.4, 3.9], 0.35, 0.25); s.beep(0.25, 330, 0.25, 0.25, 'square'); s.tone({ w: 'sawtooth', f: 55, d: 0.5, t: 0.2, v: 0.12, hold: true, rel: 0.2, to: s.lp(300) }); } },
  door_unlock: { d: 0.9, lvl: -7, vars: 2, lim: 2, pri: 2, b: (s) => { impactLayer(s, 0, 0.8, 0.7); s.nz({ t: 0.04, d: 0.1, v: 0.35, bp: 1200, q: 2, f2: 2400 }); s.beep(0.12, 660, 0.08, 0.3, 'triangle'); s.beep(0.21, 990, 0.12, 0.3, 'triangle'); s.nz({ t: 0.1, d: 0.5, v: 0.12, hp: 3000, a: 0.02 }); } },
  alarm: { d: 1.6, lvl: -8, vars: 1, lim: 1, pri: 3, b: (s) => { const b = s.bp(1200, 0.7); for (let i = 0; i < 6; i++) s.tone({ w: 'square', f: i % 2 ? 784 : 988, t: i * 0.25, d: 0.24, v: 0.5, hold: true, a: 0.005, rel: 0.01, to: b }); } },
  room_clear: { d: 1.8, lvl: -8, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(1.8, 0.35); [65, 69, 72, 77].forEach((m, i) => s.note('pluck', i * 0.06, m, 0.4, 0.9, { cut: 4000 }, r)); s.note('glock', 0.24, 89, 1.2, 0.8, {}, r); s.nz({ t: 0.2, d: 1.0, v: 0.1, hp: 6000, a: 0.1 }); } },
  floor_clear: { d: 3.0, lvl: -7, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(2.5, 0.4); [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((c, i) => c.forEach((m) => s.note('brass', i * 0.18, m, i === 3 ? 1.4 : 0.15, 0.9, { att: 0.01 }, r))); chimeSeq(s, [84, 88, 91, 96], 0.18, 'glock', 0.7, r, 1.5); s.note('timpani', 0.54, 36, 0, 0.9, {}, r); } },
  exit_open: { d: 1.6, lvl: -8, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(1.5, 0.3); s.whoosh(0, 0.7, 0.4, 300, 3000, r); impactLayer(s, 0.05, 0.7, 0.5); chimeSeq(s, [72, 79, 84], 0.1, 'vibes', 0.8, r, 0.8); } },
  car_door: { d: 0.6, lvl: -8, vars: 2, lim: 1, b: (s) => { s.thump(0, 110, 50, 0.2, 0.9); s.nz({ d: 0.08, v: 0.5, lp: 1200 }); s.nz({ t: 0.01, d: 0.03, v: 0.4, bp: 2500, q: 3 }); s.ring(0.01, 900, [1, 2.3], 0.15, 0.1); } },
  car_engine: { d: 2.4, lvl: -9, vars: 1, lim: 1, b: (s) => { for (let i = 0; i < 5; i++) s.nz({ t: i * 0.11, d: 0.08, v: 0.4, lp: 500, k: 'brown' }); const lp = s.lp(600, 2); s.tone({ w: 'sawtooth', f: 32, f2: 75, glide: 0.6, t: 0.55, d: 1.7, v: 0.6, hold: true, a: 0.05, rel: 0.3, to: lp }); s.chopped(0.55, 1.7, 0.4, 28, 400, 0.8); } },

  // ===== player
  step: { d: 0.1, lvl: -18, vars: 4, lim: 3, pri: 0, b: (s) => stepLayer(s, 0, 1, s.r.range(0.2, 0.7)) },
  dash: { d: 0.35, lvl: -9, vars: 3, lim: 2, pri: 0, b: (s) => { s.whoosh(0, 0.28, 0.9, 500, 4500); s.nz({ d: 0.04, v: 0.3, bp: 3000, q: 4, f2: 4500 }); } },
  swing_light: { d: 0.25, lvl: -10, vars: 3, lim: 4, pri: 0, b: (s) => s.whoosh(0, 0.17 * s.r.vary(0.15), 0.9, 800, 5000) },
  swing_heavy: { d: 0.45, lvl: -8, vars: 3, lim: 3, pri: 0, b: (s) => { s.whoosh(0, 0.36 * s.r.vary(0.1), 1, 250, 2500); s.whoosh(0.05, 0.25, 0.4, 900, 4000); } },
  charge: { d: 1.0, lvl: -10, vars: 1, lim: 2, pri: 1, b: (s) => { s.tone({ w: 'sawtooth', f: 110, f2: 440, d: 0.85, v: 0.3, hold: true, a: 0.1, rel: 0.1, vib: [14, 30], to: s.lp(1800, 2) }); s.nz({ d: 0.85, v: 0.2, bp: 600, f2: 4000, q: 2, hold: true, a: 0.3 }); } },
  hit_blunt: { d: 0.4, lvl: -4, vars: 4, lim: 5, pri: 0, b: (s) => { impactLayer(s, 0, 1.3, 0.8); s.nz({ t: 0.002, d: 0.09, v: 0.5, bp: 450, q: 1 }); s.ticks(0.02, 0.1, 3, 700, 0.2); } },
  hit_sharp: { d: 0.4, lvl: -5, vars: 4, lim: 5, pri: 0, b: (s) => { impactLayer(s, 0, 0.8, 1.4); s.nz({ d: 0.12, v: 0.6, hp: 3000, f2: 6000, bp: 4500, q: 1.5 }); s.ring(0.002, s.r.range(2400, 3200), [1, 2.7, 4.1], 0.18, 0.18); } },
  hit_flesh: { d: 0.5, lvl: -4, vars: 4, lim: 5, pri: 0, b: (s) => { impactLayer(s, 0, 1.1, 0.6); splatLayer(s, 0.01, 0.6, 0.7); } },
  crit: { d: 0.9, lvl: -3, vars: 2, lim: 3, pri: 0, b: (s) => { impactLayer(s, 0, 1.6, 1.2); s.thump(0, 70, 30, 0.5, 0.8, s.drive(2)); s.ring(0.0, 1760, [1, 2.01, 3.03], 0.45, 0.3); s.nz({ d: 0.3, v: 0.25, hp: 5000, a: 0.002 }); } },
  shield_hit: { d: 0.5, lvl: -6, vars: 3, lim: 3, pri: 1, b: (s) => { s.ring(0, s.r.range(600, 760), [1, 1.58, 2.31, 3.4], 0.35, 0.4); impactLayer(s, 0, 0.6, 1); s.fm(0, 300, 3.3, 4, 0.2, 0.2); } },
  shield_break: { d: 1.2, lvl: -4, vars: 2, lim: 2, pri: 1, b: (s) => { shatterLayer(s, 0, 1, 0.9); s.tone({ w: 'sawtooth', f: 900, f2: 120, d: 0.6, v: 0.25, to: s.lp(2500, 3) }); impactLayer(s, 0, 1, 1); } },
  shield_regen: { d: 0.9, lvl: -11, vars: 1, lim: 1, pri: 2, b: (s) => { s.tone({ w: 'triangle', f: 400, f2: 1600, d: 0.6, v: 0.35, hold: true, a: 0.2, rel: 0.2, vib: [12, 25] }); s.nz({ d: 0.6, v: 0.12, hp: 5000, a: 0.3, hold: true }); } },
  hurt: { d: 0.5, lvl: -4, vars: 3, lim: 2, pri: 0, b: (s) => { impactLayer(s, 0, 1.2, 0.7); s.nz({ d: 0.15, v: 0.5, bp: 300, q: 1, k: 'brown' }); s.tone({ w: 'sawtooth', f: 220, f2: 90, d: 0.18, v: 0.2, to: s.lp(900) }); } },
  player_death: { d: 2.8, lvl: -4, vars: 1, lim: 1, pri: 1, stereo: true, b: (s) => { const r = s.room(2.8, 0.5, 0.4); impactLayer(s, 0, 2, 0.8); s.thump(0, 80, 25, 1.6, 0.9, r); s.tone({ w: 'sawtooth', f: 330, f2: 55, d: 2.0, v: 0.3, to: s.lp(1200, 2, r) }); s.note('strings', 0.05, 46, 1.6, 0.9, { att: 0.05 }, r); s.note('strings', 0.05, 49, 1.6, 0.9, { att: 0.05 }, r); } },
  rage_ready: { d: 1.2, lvl: -7, vars: 1, lim: 1, pri: 1, b: (s) => { s.tone({ w: 'sawtooth', f: 160, f2: 640, d: 0.6, v: 0.3, hold: true, a: 0.3, rel: 0.05, to: s.lp(2400, 4) }); s.ring(0.62, 1046, [1, 2, 3.01], 0.6, 0.4); s.thump(0.62, 120, 50, 0.3, 0.6); } },
  rage_activate: { d: 1.6, lvl: -3, vars: 1, lim: 1, pri: 1, stereo: true, b: (s) => { const dr = s.drive(5, 0.6); s.nz({ d: 0.4, v: 0.7, bp: 300, f2: 1500, q: 1.5, a: 0.25, to: dr }); explosionLayer(s, 0.4, 0.6, 0.8); s.vowel(0.32, 95, 0.7, 0.6, V('a'), { f0end: 70, rough: 0.6, breath: 0.3, a: 0.02, to: dr }); } },
  rage_end: { d: 1.0, lvl: -9, vars: 1, lim: 1, pri: 2, b: (s) => { s.tone({ w: 'sawtooth', f: 500, f2: 60, d: 0.8, v: 0.35, to: s.lp(1500, 3) }); s.nz({ d: 0.7, v: 0.2, bp: 3000, f2: 200, q: 2 }); } },
  grab: { d: 0.3, lvl: -8, vars: 3, lim: 2, pri: 0, b: (s) => { s.nz({ d: 0.08, v: 0.6, bp: 1500, q: 0.8 }); s.thump(0, 140, 70, 0.08, 0.6); s.nz({ t: 0.03, d: 0.1, v: 0.3, bp: 3000, q: 0.6 }); } },
  throw: { d: 0.4, lvl: -8, vars: 3, lim: 3, pri: 0, b: (s) => s.whoosh(0, 0.32, 1, 300, 3200) },
  whoosh: { d: 0.4, lvl: -9, vars: 3, lim: 4, pri: 0, b: (s) => s.whoosh(0, 0.3 * s.r.vary(0.2), 1, 400, 3500) },
  execution_impact: { d: 1.6, lvl: -2, vars: 2, lim: 2, pri: 0, stereo: true, b: (s) => { impactLayer(s, 0, 2, 1); impactLayer(s, 0.09, 1.4, 0.6); s.thump(0, 65, 26, 0.9, 1, s.drive(3)); splatLayer(s, 0.03, 1.2, 0.9); s.ticks(0.02, 0.08, 5, 3500, 0.5); s.nz({ d: 1.2, v: 0.15, hp: 3000, a: 0.002, to: s.verb(1.6, 0.6) }); } },
  pickup_weapon: { d: 0.5, lvl: -9, vars: 2, lim: 2, pri: 1, b: (s) => { s.ring(0, s.r.range(900, 1200), [1, 2.7, 4.2], 0.25, 0.3); s.whoosh(0, 0.15, 0.3, 1500, 5000); s.nz({ d: 0.02, v: 0.4, bp: 2500, q: 2 }); } },
  pickup_cash: { d: 0.6, lvl: -9, vars: 3, lim: 3, pri: 0, b: (s) => { for (let i = 0; i < 4; i++) coinLayer(s, i * s.r.range(0.03, 0.07), 1 - i * 0.18); } },
  pickup_heal: { d: 0.8, lvl: -10, vars: 2, lim: 2, pri: 1, b: (s) => { [72, 76, 79, 84].forEach((m, i) => s.note('vibes', i * 0.05, m, 0.3, 0.7, { ped: 0.2 })); s.nz({ d: 0.4, v: 0.12, hp: 6000, a: 0.05 }); } },
  pickup_item: { d: 0.6, lvl: -9, vars: 2, lim: 2, pri: 1, b: (s) => { s.tone({ f: 500, f2: 1400, d: 0.08, v: 0.5 }); s.note('glock', 0.06, 86, 0.5, 0.9); s.note('glock', 0.12, 93, 0.5, 0.7); } },
  weapon_break: { d: 0.8, lvl: -6, vars: 2, lim: 2, pri: 1, b: (s) => { s.nz({ d: 0.03, v: 0.9, hp: 1500 }); s.ticks(0, 0.4, 12, 2500, 0.45); s.thump(0, 200, 80, 0.12, 0.6); s.ring(0.01, 1400, [1, 2.4], 0.2, 0.2); } },
  out_of_ammo: { d: 0.3, lvl: -11, vars: 2, lim: 2, pri: 0, b: (s) => { s.nz({ d: 0.008, v: 0.8, bp: 3000, q: 3 }); s.nz({ t: 0.12, d: 0.008, v: 0.6, bp: 2600, q: 3 }); s.tone({ f: 1200, d: 0.02, v: 0.15 }); } },
  stapler_fire: { d: 0.3, lvl: -8, vars: 3, lim: 4, pri: 0, b: (s) => { s.nz({ d: 0.01, v: 1, bp: 3500, q: 2 }); s.thump(0, 260, 110, 0.04, 0.6); s.ring(0.004, s.r.range(1800, 2400), [1, 2.6], 0.12, 0.25); s.nz({ t: 0.03, d: 0.04, v: 0.3, bp: 2000, q: 4, f2: 3000 }); } },
  nailgun_fire: { d: 0.35, lvl: -7, vars: 3, lim: 4, pri: 0, b: (s) => { s.nz({ d: 0.07, v: 0.8, hp: 1200, a: 0.001 }); s.nz({ d: 0.012, v: 0.9, bp: 2800, q: 2 }); s.thump(0, 300, 100, 0.05, 0.7); s.ring(0.005, 2900, [1, 2.2], 0.08, 0.2); } },
  laser_fire: { d: 0.35, lvl: -8, vars: 3, lim: 4, pri: 0, b: (s) => { s.fm(0, 1600, 1.5, 3, 0.22, 0.5, undefined, 280); s.tone({ w: 'square', f: 2200, f2: 400, d: 0.15, v: 0.12, to: s.lp(4000) }); } },
  tape_fire: { d: 0.45, lvl: -9, vars: 3, lim: 3, pri: 0, b: (s) => { s.chopped(0, 0.32, 0.8, s.r.range(55, 80), 6000, 1, undefined, 'white', 'sawtooth'); s.nz({ d: 0.3, v: 0.2, bp: 2500, q: 1 }); } },
  confetti_fire: { d: 0.9, lvl: -7, vars: 2, lim: 3, pri: 1, b: (s) => { s.nz({ d: 0.03, v: 1, bp: 1500, q: 1 }); s.thump(0, 200, 70, 0.08, 0.7); s.ticks(0.05, 0.6, 26, 5000, 0.18); s.tone({ w: 'triangle', f: 1200, f2: 2400, t: 0.02, d: 0.15, v: 0.15 }); } },
  heal: { d: 1.4, lvl: -10, vars: 1, lim: 1, pri: 1, stereo: true, b: (s) => { const r = s.room(1.6, 0.35); [60, 64, 67, 72, 76].forEach((m, i) => s.note('vibes', i * 0.08, m + 12, 0.6, 0.7, {}, r)); s.nz({ d: 1.0, v: 0.08, hp: 6000, a: 0.3, to: r }); } },
  kick: { d: 0.35, lvl: -5, vars: 3, lim: 3, pri: 0, b: (s) => { impactLayer(s, 0, 1.1, 0.6); s.nz({ d: 0.06, v: 0.4, bp: 700, q: 0.8 }); } },
  block: { d: 0.5, lvl: -5, vars: 3, lim: 3, pri: 0, b: (s) => { s.ring(0, s.r.range(500, 650), [1, 2.32, 3.7, 5.1], 0.3, 0.45); impactLayer(s, 0, 0.8, 1.3); } },

  // ===== enemies
  enemy_hurt: { d: 0.35, lvl: -7, vars: 4, lim: 5, pri: 0, b: (s) => { impactLayer(s, 0, 0.9, 0.7); s.nz({ d: 0.07, v: 0.35, bp: 600, q: 1 }); } },
  enemy_death: { d: 0.9, lvl: -5, vars: 3, lim: 4, pri: 0, b: (s) => { impactLayer(s, 0, 1.2, 0.7); splatLayer(s, 0.02, 0.6, 0.6); s.thump(0.32 + s.r.range(0, 0.1), 100, 50, 0.15, 0.6); s.nz({ t: 0.33, d: 0.08, v: 0.3, lp: 800 }); } },
  gore_splat: { d: 0.7, lvl: -5, vars: 4, lim: 4, pri: 0, b: (s) => splatLayer(s, 0, s.r.range(0.8, 1.3)) },
  dismember: { d: 0.8, lvl: -4, vars: 3, lim: 3, pri: 0, b: (s) => { s.ticks(0, 0.05, 6, 3200, 0.6); s.nz({ d: 0.02, v: 0.8, bp: 2200, q: 2 }); s.chopped(0.02, 0.15, 0.4, 45, 2000, 1, undefined, 'white'); splatLayer(s, 0.04, 1.1); } },
  telegraph: { d: 0.5, lvl: -5, vars: 2, lim: 4, pri: 0, minAtt: 0.55, b: (s) => { s.tone({ w: 'triangle', f: 760, f2: 1520, glide: 0.2, d: 0.34, v: 0.55, a: 0.015, vib: [22, 45] }); s.tone({ f: 1520, f2: 3040, glide: 0.2, d: 0.3, v: 0.18, a: 0.02 }); s.nz({ d: 0.3, v: 0.1, hp: 7000, a: 0.12 }); } },
  telegraph_heavy: { d: 0.9, lvl: -4, vars: 2, lim: 3, pri: 0, minAtt: 0.6, b: (s) => { const b = s.bp(900, 0.9); for (let i = 0; i < 2; i++) s.tone({ w: 'square', f: 300, f2: 600, glide: 0.2, t: i * 0.26, d: 0.22, v: 0.5, hold: true, a: 0.01, rel: 0.03, to: b }); s.tone({ w: 'sawtooth', f: 75, f2: 150, d: 0.7, v: 0.3, hold: true, a: 0.1, rel: 0.1, to: s.lp(500) }); s.nz({ d: 0.7, v: 0.15, bp: 500, f2: 3000, q: 1.5, hold: true, a: 0.4 }); } },
  enemy_swing: { d: 0.4, lvl: -10, vars: 3, lim: 4, pri: 0, b: (s) => s.whoosh(0, 0.26 * s.r.vary(0.15), 0.9, 350, 3000) },
  enemy_throw: { d: 0.35, lvl: -10, vars: 3, lim: 4, pri: 0, b: (s) => s.whoosh(0, 0.22, 0.9, 500, 3800) },
  projectile_hit: { d: 0.3, lvl: -8, vars: 3, lim: 5, pri: 0, b: (s) => { impactLayer(s, 0, 0.6, 1.2); s.ticks(0.01, 0.06, 3, 2500, 0.3); } },
  whistle: { d: 0.9, lvl: -7, vars: 2, lim: 2, pri: 1, b: (s) => { const f = s.r.range(2600, 3000); s.tone({ f, d: 0.7, v: 0.45, hold: true, a: 0.02, rel: 0.05, vib: [32, 90] }); s.nz({ d: 0.7, v: 0.12, bp: f, q: 4, hold: true }); } },
  mop_slosh: { d: 0.8, lvl: -9, vars: 2, lim: 2, b: (s) => { s.chopped(0, 0.55, 0.6, 9, 900, 0.8, undefined, 'pink', 'sine'); for (let i = 0; i < 8; i++) { const f = s.r.range(200, 500); s.tone({ f, f2: f * 2, t: s.r.range(0, 0.5), d: 0.05, v: 0.2 }); } } },
  slip: { d: 0.7, lvl: -7, vars: 2, lim: 2, b: (s) => { s.tone({ w: 'triangle', f: 900, f2: 2400, d: 0.18, v: 0.35, to: s.bp(1800, 1) }); impactLayer(s, 0.3, 1.1, 0.5); s.nz({ t: 0.3, d: 0.1, v: 0.3, bp: 700, q: 1 }); } },
  electric_zap: { d: 0.6, lvl: -7, vars: 3, lim: 3, pri: 1, b: (s) => zapLayer(s, 0, s.r.range(0.3, 0.45), 1) },
  scream: { d: 1.2, lvl: -9, vars: 3, lim: 2, pri: 2, b: (s) => { const f0 = s.r.range(380, 620); s.vowel(0, f0, 0.85, 0.8, V(s.r.pick(['a', 'ae', 'e'] as const)), { f0end: f0 * 0.75, vib: 60, rough: 0.4, breath: 0.25, a: 0.03 }); } },
  hold_music: { d: 2.4, lvl: -10, vars: 1, lim: 1, pri: 3, b: (s) => { const out = s.hp(350, 0.8, s.lp(3200, 0.8)); [76, 74, 72, 74, 76, 76, 76].forEach((m, i) => s.note('harpsi', i * 0.24, m, 0.22, 0.9, {}, out)); [48, 55].forEach((m, i) => s.note('strings', i * 0.9, m, 0.9, 0.8, { att: 0.05 }, out)); } },
  gong: { d: 4.0, lvl: -5, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(2.5, 0.3); s.note('gong', 0, 40, 0, 1, { dec: 3.6 }, r); impactLayer(s, 0, 0.8, 0.5); } },
  calculator_beep: { d: 0.4, lvl: -12, vars: 2, lim: 2, b: (s) => { for (let i = 0; i < 3; i++) s.beep(i * 0.09, 2400 + (i === 2 ? 400 : 0), 0.05, 0.4, 'square'); } },
  injunction: { d: 0.9, lvl: -5, vars: 1, lim: 2, b: (s) => { const r = s.room(1.2, 0.3); for (let i = 0; i < 2; i++) { s.thump(i * 0.22, 300, 120, 0.08, 0.9, r); s.nz({ t: i * 0.22, d: 0.04, v: 0.6, bp: 1500, q: 1.5, to: r }); } s.nz({ t: 0.5, d: 0.2, v: 0.2, bp: 4000, q: 0.8 }); } },
  shield_up: { d: 0.9, lvl: -9, vars: 1, lim: 2, b: (s) => { s.tone({ w: 'sawtooth', f: 200, f2: 800, d: 0.5, v: 0.25, hold: true, a: 0.1, rel: 0.2, to: s.lp(2000, 3) }); s.fm(0.4, 880, 2.01, 2, 0.4, 0.25); } },
  purchase_order: { d: 0.9, lvl: -8, vars: 1, lim: 2, b: (s) => { s.nz({ d: 0.2, v: 0.3, bp: 3500, q: 0.8 }); s.thump(0.22, 260, 100, 0.06, 0.9); s.nz({ t: 0.22, d: 0.03, v: 0.5, bp: 1500, q: 1.5 }); bell(s, 0.35, 2093, 0.4, 0.3); } },
  teleport: { d: 0.9, lvl: -7, vars: 2, lim: 2, b: (s) => { s.fm(0, 300, 1.41, 6, 0.5, 0.4, undefined, 2400); s.nz({ d: 0.5, v: 0.3, bp: 800, f2: 7000, q: 3 }); s.nz({ t: 0.5, d: 0.04, v: 0.6, hp: 1500 }); s.grains(0.5, 0.3, 8, 4000, 9000, 0.12, 0.05); } },
  laser: { d: 1.0, lvl: -8, vars: 2, lim: 2, pri: 1, b: (s) => { const lp = s.lp(4000, 2); s.tone({ w: 'sawtooth', f: 110, d: 0.8, v: 0.5, hold: true, a: 0.02, rel: 0.1, vib: [40, 60], to: s.drive(3, 0.6, lp) }); s.fm(0, 1500, 1.5, 2, 0.8, 0.2); s.nz({ d: 0.8, v: 0.2, hp: 4000, hold: true }); } },
  golf_swing: { d: 0.7, lvl: -7, vars: 2, lim: 2, b: (s) => { s.whoosh(0, 0.32, 0.8, 300, 3000); s.ring(0.3, 3800, [1, 2.4], 0.2, 0.35); s.nz({ t: 0.3, d: 0.01, v: 0.8, hp: 3000 }); } },
  power_pose: { d: 1.6, lvl: -7, vars: 1, lim: 1, stereo: true, b: (s) => { const r = s.room(2, 0.4); s.thump(0, 90, 50, 0.6, 0.7, r); [55, 62, 67, 71].forEach((m) => s.note('choir', 0.05, m, 0.9, 0.8, { att: 0.05 }, r)); s.nz({ d: 0.5, v: 0.3, bp: 400, f2: 2000, q: 1, a: 0.2 }); } },
  wellbeing_chime: { d: 3.0, lvl: -10, vars: 1, lim: 1, stereo: true, b: (s) => { const r = s.room(2.2, 0.4); s.ring(0, 523, [1, 2.71, 5.15, 8.3], 2.8, 0.3, r); s.ring(0.01, 527, [1], 2.8, 0.15, r); } },
  chant: { d: 1.4, lvl: -7, vars: 2, lim: 1, stereo: true, b: (s) => { const r = s.room(1.2, 0.3); for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { const f0 = i < 3 ? s.r.range(105, 125) : s.r.range(200, 230); s.vowel(k * 0.45 + s.r.range(0, 0.03), f0, 0.32, 0.5, V(k ? 'o' : 'e'), { breath: 0.1, vib: 10, a: 0.02, to: r }); } } },
  cheer: { d: 2.0, lvl: -8, vars: 2, lim: 1, stereo: true, b: (s) => { crowd(s, 0, 1.4, 0.9, 10, 'ae', 1.15); s.nz({ d: 1.6, v: 0.25, bp: 2000, q: 0.5, a: 0.1, hold: true, rel: 0.4 }); s.tone({ f: 2400, f2: 3200, t: 0.3, d: 0.4, v: 0.15, vib: [8, 60] }); } },
  revive: { d: 1.2, lvl: -8, vars: 1, lim: 2, b: (s) => { [60, 64, 67, 72, 76, 79].forEach((m, i) => s.note('glock', i * 0.06, m + 12, 0.5, 0.8)); s.whoosh(0, 0.5, 0.4, 300, 5000); } },
  rebrand: { d: 1.4, lvl: -8, vars: 1, lim: 2, stereo: true, b: (s) => { const r = s.room(1.4, 0.3); s.whoosh(0, 0.45, 0.6, 400, 6000, r); s.fm(0.4, 1046, 3.5, 3, 0.8, 0.3, r); chimeSeq(s, [84, 88, 91], 0.07, 'glock', 0.8, r); } },
  mark: { d: 0.6, lvl: -9, vars: 1, lim: 3, b: (s) => { s.beep(0, 1760, 0.05, 0.4, 'triangle'); s.beep(0.08, 1760, 0.05, 0.4, 'triangle'); s.tone({ f: 3520, t: 0.16, d: 0.3, v: 0.2 }); } },
  promotion: { d: 2.2, lvl: -7, vars: 1, lim: 1, stereo: true, b: (s) => { const r = s.room(2, 0.35); [[67, 71, 74], [67, 71, 74], [72, 76, 79]].forEach((c, i) => c.forEach((m) => s.note('brass', [0, 0.14, 0.3][i], m, i === 2 ? 1.1 : 0.1, 0.95, { att: 0.01 }, r))); s.note('crash', 0.3, 0, 0, 0.6, {}, r); } },
  paper_rustle: { d: 0.6, lvl: -12, vars: 3, lim: 3, b: (s) => { for (let i = 0; i < 9; i++) s.nz({ t: s.r.range(0, 0.4), d: s.r.range(0.02, 0.08), v: s.r.range(0.2, 0.6), bp: s.r.range(2500, 6000), q: 1.2 }); } },
  phone_ring: { d: 2.2, lvl: -9, vars: 1, lim: 1, pri: 3, b: (s) => { const b = s.bp(1400, 1.5); for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) s.tone({ w: 'square', f: i % 2 ? 1300 : 1600, t: ring * 1.1 + i * 0.05, d: 0.05, v: 0.4, hold: true, a: 0.002, rel: 0.005, to: b }); } },
  energy_drink: { d: 1.4, lvl: -8, vars: 2, lim: 1, b: (s) => { s.nz({ d: 0.02, v: 0.9, bp: 2500, q: 2 }); s.nz({ t: 0.01, d: 0.35, v: 0.35, hp: 3000, a: 0.002 }); s.grains(0.05, 0.6, 30, 3000, 8000, 0.06, 0.02); for (let i = 0; i < 3; i++) s.nz({ t: 0.6 + i * 0.22, d: 0.1, v: 0.3, bp: 400, q: 2, k: 'pink' }); } },

  // ===== hazards / environment
  glass_shatter: { d: 1.4, lvl: -4, vars: 3, lim: 3, pri: 1, b: (s) => shatterLayer(s, 0, s.r.range(0.9, 1.2)) },
  printer_beep: { d: 0.8, lvl: -10, vars: 1, lim: 2, pri: 2, b: (s) => { for (let i = 0; i < 3; i++) s.beep(i * 0.18, 2050, 0.1, 0.45, 'square'); } },
  explosion: { d: 3.0, lvl: -2, vars: 3, lim: 3, pri: 1, stereo: true, b: (s) => explosionLayer(s, 0, s.r.range(0.9, 1.15)) },
  water_splash: { d: 1.0, lvl: -8, vars: 3, lim: 3, b: (s) => { s.nz({ d: 0.3, v: 0.7, bp: 1200, f2: 400, q: 0.8 }); s.nz({ d: 0.5, v: 0.25, hp: 3000, a: 0.01 }); for (let i = 0; i < 10; i++) { const f = s.r.range(500, 1400); s.tone({ f, f2: f * 2.2, t: s.r.range(0.05, 0.6), d: 0.04, v: 0.2 }); } } },
  extinguisher_burst: { d: 1.2, lvl: -7, vars: 2, lim: 2, b: (s) => { s.nz({ d: 0.9, v: 0.9, hp: 1500, a: 0.004, hold: true, rel: 0.25 }); s.nz({ d: 0.9, v: 0.3, bp: 600, q: 0.6, hold: true, rel: 0.25 }); s.thump(0, 150, 60, 0.1, 0.5); } },
  chair_roll: { d: 1.0, lvl: -10, vars: 2, lim: 2, b: (s) => { s.chopped(0, 0.8, 0.6, s.r.range(14, 22), 700, 0.6, undefined, 'brown', 'triangle'); s.tone({ f: 1800, f2: 2300, t: 0.3, d: 0.15, v: 0.06, vib: [20, 60] }); } },
  cabinet_topple: { d: 1.4, lvl: -4, vars: 2, lim: 2, b: (s) => { s.nz({ d: 0.3, v: 0.2, bp: 700, f2: 1500, q: 1, a: 0.25 }); impactLayer(s, 0.35, 2, 0.8); s.ring(0.35, 240, [1, 2.4, 3.7, 5.2, 6.8], 0.8, 0.4); s.ticks(0.4, 0.5, 10, 1600, 0.3); } },
  sprinkler: { d: 1.4, lvl: -10, vars: 1, lim: 1, b: (s) => { s.nz({ d: 1.1, v: 0.6, hp: 2500, a: 0.05, hold: true, rel: 0.2 }); s.grains(0.05, 1.0, 30, 1200, 4000, 0.06, 0.02); s.nz({ d: 0.05, v: 0.3, bp: 1500, q: 2 }); } },
  wall_breach: { d: 2.6, lvl: -2, vars: 2, lim: 2, pri: 2, stereo: true, b: (s) => { explosionLayer(s, 0, 0.8, 0.9); s.ticks(0.05, 1.4, 30, 1200, 0.4); s.ticks(0.1, 1.6, 20, 400, 0.5); s.nz({ t: 0.1, d: 1.6, v: 0.25, bp: 1200, q: 0.5, a: 0.05 }); } },
  debris: { d: 1.0, lvl: -9, vars: 3, lim: 3, b: (s) => { s.ticks(0, 0.7, 14, 1500, 0.5); s.ticks(0.05, 0.8, 6, 450, 0.6); } },
  server_spark: { d: 0.8, lvl: -8, vars: 3, lim: 3, pri: 2, b: (s) => { zapLayer(s, 0, 0.2, 0.9, 260); s.grains(0.02, 0.5, 18, 3000, 9000, 0.12, 0.012); s.nz({ t: 0.15, d: 0.4, v: 0.15, hp: 4000 }); } },
  microwave_ding: { d: 1.6, lvl: -8, vars: 1, lim: 1, pri: 3, b: (s) => bell(s, 0, 2349, 1.4, 0.5) },
  microwave_hum: { d: 2.0, lvl: -12, vars: 1, lim: 1, b: (s) => { s.tone({ w: 'sawtooth', f: 100, d: 1.8, v: 0.25, hold: true, a: 0.1, rel: 0.2, to: s.lp(800) }); s.nz({ d: 1.8, v: 0.2, lp: 1500, k: 'pink', hold: true, a: 0.1, rel: 0.2 }); } },
  shredder: { d: 1.8, lvl: -7, vars: 2, lim: 1, b: (s) => { motor(s, 0, 1.5, 85, 0.3, 95); s.chopped(0.15, 1.2, 0.8, 32, 3000, 1, undefined, 'white', 'sawtooth'); s.ticks(0.2, 1.1, 20, 2500, 0.3); } },
  hand_dryer: { d: 2.4, lvl: -9, vars: 1, lim: 1, b: (s) => { s.nz({ d: 2.0, v: 0.8, bp: 1600, q: 0.4, a: 0.15, hold: true, rel: 0.3 }); s.tone({ f: 1100, f2: 1250, d: 2.0, v: 0.06, hold: true, a: 0.3, rel: 0.3, lin: true }); motor(s, 0, 2.0, 120, 0.12); } },
  photocopier: { d: 2.6, lvl: -10, vars: 1, lim: 1, b: (s) => { motor(s, 0, 2.2, 60, 0.18); s.nz({ t: 0.3, d: 1.2, v: 0.25, bp: 800, f2: 2500, q: 2, hold: true, a: 0.2, rel: 0.3 }); for (let i = 0; i < 3; i++) { s.thump(0.2 + i * 0.8, 200, 90, 0.05, 0.5); s.nz({ t: 0.2 + i * 0.8, d: 0.02, v: 0.4, bp: 2000, q: 2 }); } } },
  window_smash: { d: 1.8, lvl: -3, vars: 2, lim: 2, pri: 2, stereo: true, b: (s) => { impactLayer(s, 0, 1.6, 1); shatterLayer(s, 0.01, 1.5, 1); s.nz({ t: 0.05, d: 1.2, v: 0.25, bp: 500, q: 0.5, a: 0.1, k: 'pink' }); } },
  thud: { d: 0.4, lvl: -6, vars: 3, lim: 4, pri: 0, b: (s) => { s.thump(0, 120, 45, 0.22, 1); s.nz({ d: 0.06, v: 0.5, lp: 900 }); } },
  kettle: { d: 2.4, lvl: -10, vars: 1, lim: 1, b: (s) => { s.nz({ d: 1.6, v: 0.4, lp: 800, k: 'brown', hold: true, a: 0.5, rel: 0.3 }); s.grains(0, 1.6, 40, 300, 900, 0.08, 0.03); s.tone({ f: 1800, f2: 2600, t: 0.8, d: 1.2, v: 0.3, hold: true, a: 0.4, rel: 0.1, vib: [6, 30], lin: true }); s.nz({ t: 2.15, d: 0.02, v: 0.5, bp: 2000, q: 3 }); } },
  vending_buy: { d: 2.0, lvl: -9, vars: 1, lim: 1, b: (s) => { s.beep(0, 1500, 0.06, 0.3, 'square'); s.beep(0.1, 1500, 0.06, 0.3, 'square'); motor(s, 0.25, 0.9, 140, 0.15, 150); s.thump(1.3, 160, 70, 0.15, 0.9); s.ring(1.3, 700, [1, 2.6, 4.1], 0.3, 0.3); s.nz({ t: 1.3, d: 0.08, v: 0.4, lp: 1500 }); } },
  fall_whistle: { d: 1.8, lvl: -9, vars: 2, lim: 1, b: (s) => s.tone({ f: 1800, f2: 350, d: 1.5, v: 0.35, hold: true, a: 0.05, rel: 0.1, vib: [6, 20] }) },
  splat_far: { d: 1.0, lvl: -14, vars: 2, lim: 2, b: (s) => { const r = s.verb(2, 0.6); const lp = s.lp(900, 0.7, r); s.thump(0, 100, 45, 0.15, 0.7, lp); s.nz({ d: 0.15, v: 0.5, bp: 600, f2: 200, q: 1, to: lp }); } },

  // ===== bosses
  boss_intro: { d: 3.0, lvl: -3, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { const r = s.room(2.8, 0.5); s.nz({ d: 0.8, v: 0.4, bp: 300, f2: 5000, q: 1.5, a: 0.75 }); impactLayer(s, 0.8, 2, 1); s.thump(0.8, 70, 28, 1.6, 1, s.drive(2)); [40, 47, 52, 55].forEach((m) => s.note('brass', 0.8, m, 1.2, 1, { att: 0.01 }, r)); s.note('crash', 0.8, 0, 0, 0.8, {}, r); } },
  phase_transition: { d: 2.6, lvl: -4, vars: 1, lim: 1, pri: 2, stereo: true, b: (s) => { s.nz({ d: 1.0, v: 0.5, bp: 300, f2: 6000, q: 2, a: 0.95 }); s.tone({ w: 'sawtooth', f: 80, f2: 640, d: 1.0, v: 0.12, hold: true, a: 0.9, to: s.lp(3000) }); impactLayer(s, 1.0, 2, 1); s.thump(1.0, 70, 26, 1.2, 1, s.drive(2)); s.note('crash', 1.0, 0, 0, 0.8); } },
  boss_shout: { d: 1.0, lvl: -5, vars: 3, lim: 1, b: (s) => { const dr = s.drive(3, 0.6); s.vowel(0, s.r.range(95, 130), 0.6, 0.9, V(s.r.pick(['a', 'o', 'ae'] as const)), { f0end: 80, rough: 0.5, breath: 0.3, a: 0.02, vib: 30, to: dr }); } },
  wrench_swing: { d: 0.6, lvl: -7, vars: 3, lim: 2, b: (s) => { s.whoosh(0, 0.45, 1, 180, 1800); s.ring(0.02, 380, [1, 2.7], 0.3, 0.08); } },
  scrubber_engine: { d: 1.6, lvl: -8, vars: 1, lim: 1, b: (s) => { const lp = s.lp(700, 2); s.tone({ w: 'sawtooth', f: 40, f2: 85, glide: 0.5, d: 1.3, v: 0.6, hold: true, a: 0.05, rel: 0.2, to: s.drive(2, 0.6, lp) }); s.chopped(0, 1.3, 0.3, 24, 500, 0.8); } },
  boiler_blast: { d: 2.6, lvl: -3, vars: 1, lim: 1, stereo: true, b: (s) => { s.nz({ d: 1.6, v: 0.6, hp: 1200, a: 0.01, hold: true, rel: 0.6 }); explosionLayer(s, 0, 0.9); s.ring(0, 180, [1, 2.4, 3.9], 1.2, 0.3); } },
  contract_throw: { d: 0.5, lvl: -10, vars: 3, lim: 3, b: (s) => { s.whoosh(0, 0.3, 0.7, 800, 5000); s.chopped(0, 0.3, 0.25, 26, 5000, 1, undefined, 'white', 'square'); } },
  commission_ding: { d: 1.4, lvl: -7, vars: 1, lim: 2, b: (s) => { bell(s, 0, 2637, 1.0, 0.45); s.nz({ d: 0.04, v: 0.5, bp: 3000, q: 1.5 }); for (let i = 0; i < 3; i++) coinLayer(s, 0.15 + i * 0.07, 0.6); } },
  policy_stamp: { d: 0.8, lvl: -4, vars: 2, lim: 2, b: (s) => { s.nz({ d: 0.12, v: 0.3, bp: 1500, q: 1, a: 0.1 }); s.thump(0.12, 240, 70, 0.15, 1); s.nz({ t: 0.12, d: 0.05, v: 0.7, lp: 2000 }); s.nz({ t: 0.18, d: 0.25, v: 0.15, bp: 3000, q: 0.8, to: s.verb(1, 0.5) }); } },
  shutter_slam: { d: 1.8, lvl: -4, vars: 2, lim: 2, stereo: true, b: (s) => { s.chopped(0, 0.9, 0.5, 30, 2500, 0.9, undefined, 'white', 'sawtooth'); impactLayer(s, 0.95, 2, 0.9); s.ring(0.95, 160, [1, 2.2, 3.6, 5.3], 0.9, 0.4); } },
  conveyor: { d: 1.2, lvl: -10, vars: 1, lim: 1, b: (s) => { s.chopped(0, 1.0, 0.6, 16, 1200, 0.7, undefined, 'brown', 'sawtooth'); motor(s, 0, 1.0, 55, 0.15); } },
  helicopter: { d: 3.0, lvl: -6, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const g = s.chopped(0, 2.6, 1, 11.5, 600, 1); void g; s.nz({ d: 2.6, v: 0.3, bp: 2200, q: 0.8, hold: true, a: 0.8, rel: 0.6 }); s.tone({ w: 'sawtooth', f: 46, d: 2.6, v: 0.3, hold: true, a: 0.8, rel: 0.6, to: s.lp(200) }); } },
  slide_beam: { d: 1.0, lvl: -8, vars: 2, lim: 2, b: (s) => { s.tone({ w: 'sawtooth', f: 120, d: 0.7, v: 0.3, hold: true, a: 0.05, rel: 0.15, to: s.lp(1500, 2) }); s.nz({ d: 0.7, v: 0.25, bp: 600, f2: 4000, q: 4, hold: true }); s.beep(0, 1000, 0.05, 0.25, 'triangle'); } },
  golden_parachute: { d: 2.2, lvl: -6, vars: 1, lim: 1, stereo: true, b: (s) => { const r = s.room(2.2, 0.4); s.whoosh(0, 0.8, 0.6, 200, 4000, r); [64, 68, 71, 76].forEach((m) => s.note('choir', 0.2, m, 1.2, 0.8, { att: 0.15 }, r)); chimeSeq(s, [88, 92, 95, 100], 0.08, 'glock', 0.7, r, 1.2); } },
  crowd_gasp: { d: 1.2, lvl: -8, vars: 2, lim: 1, stereo: true, b: (s) => { crowd(s, 0, 0.5, 0.8, 9, 'a', 1.3); s.nz({ d: 0.5, v: 0.4, bp: 1500, f2: 2500, q: 0.6, a: 0.12 }); } },
  speech: { d: 1.4, lvl: -8, vars: 1, lim: 1, b: (s) => { s.thump(0, 180, 80, 0.05, 0.8); s.thump(0.25, 180, 80, 0.05, 0.6); s.tone({ f: 2900, t: 0.5, d: 0.7, v: 0.12, hold: true, a: 0.3, rel: 0.1, vib: [5, 12] }); } },
  screen_smash: { d: 1.4, lvl: -4, vars: 2, lim: 2, b: (s) => { impactLayer(s, 0, 1.2, 1.2); shatterLayer(s, 0.005, 0.8, 0.8); zapLayer(s, 0.05, 0.35, 0.6, 120); s.tone({ w: 'sawtooth', f: 100, d: 0.6, t: 0.1, v: 0.15, to: s.lp(600) }); } },

  // ===== stingers (musical, stereo)
  stinger_victory: { d: 3.6, lvl: -6, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(2.6, 0.4); const ch = [[60, 65, 69], [62, 67, 71], [64, 67, 72, 76]]; ch.forEach((c, i) => c.forEach((m) => { s.note('brass', i * 0.32, m, i === 2 ? 1.8 : 0.28, 0.95, { att: 0.01 }, r); s.note('strings', i * 0.32, m - 12, i === 2 ? 1.8 : 0.3, 0.8, { att: 0.02 }, r); })); s.note('timpani', 0.64, 36, 0, 1, {}, r); s.note('crash', 0.64, 0, 0, 0.6, {}, r); chimeSeq(s, [84, 88, 91, 96], 0.1, 'glock', 0.6, r, 1.5); } },
  stinger_death: { d: 4.0, lvl: -6, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(3, 0.45); [[58, 62, 65], [56, 60, 63], [55, 58, 62]].forEach((c, i) => c.forEach((m) => s.note('brass', i * 0.55, m - 12, i === 2 ? 2.0 : 0.5, 0.8, { att: 0.03, bright: 0.5 }, r))); s.note('timpani', 1.1, 31, 0, 1, { dec: 2.4 }, r); s.note('strings', 1.1, 43, 2.2, 0.9, {}, r); s.note('beep', 2.6, 0, 0.3, 0.6, { f: 440 }, s.hp(350, 0.7, s.lp(3000))); } },
  stinger_promotion: { d: 2.4, lvl: -6, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(2, 0.35); [[67, 71, 74], [69, 72, 76], [71, 74, 79], [72, 76, 79, 84]].forEach((c, i) => c.forEach((m) => s.note('brass', i * 0.12, m, i === 3 ? 1.2 : 0.1, 0.9, { att: 0.008 }, r))); s.note('crash', 0.36, 0, 0, 0.5, {}, r); s.note('glock', 0.36, 96, 1, 0.7, {}, r); } },
  stinger_boss_defeat: { d: 4.4, lvl: -5, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(3.2, 0.5); impactLayer(s, 0, 2, 1); s.thump(0, 70, 26, 1.4, 1, s.drive(2)); [50, 57, 62, 66, 69, 74].forEach((m) => s.note('choir', 0.15, m, 2.4, 0.85, { att: 0.2, v: 'a' }, r)); [62, 66, 69].forEach((m) => s.note('brass', 0.15, m, 2.2, 0.8, { att: 0.05 }, r)); s.note('timpani', 0.15, 38, 0, 1, {}, r); s.note('crash', 0.15, 0, 0, 0.7, {}, r); chimeSeq(s, [86, 90, 93, 98], 0.12, 'glock', 0.6, r, 2); } },
  stinger_unlock: { d: 2.4, lvl: -7, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(2.2, 0.4); [72, 76, 79, 83, 86, 91].forEach((m, i) => s.note('glock', i * 0.06, m, 1.2, 0.8, {}, r)); [60, 64, 67, 71].forEach((m) => s.note('pad', 0.3, m, 1.2, 0.8, { att: 0.2, cut: 2500 }, r)); } },
  stinger_announcement: { d: 2.4, lvl: -7, vars: 1, lim: 1, pri: 3, stereo: true, b: (s) => { const r = s.room(2.4, 0.5); [[0, 1046.5], [0.38, 830.6], [0.76, 932.3]].forEach(([t, f]) => bell(s, t, f, 1.5, 0.35, r)); } },
};

// ------------------------------------------------------------------ loops (seamless; rendered with crossfaded wrap)
export const LOOPS: Record<LoopName, LoopDef> = {
  wind: { d: 6, lvl: -12, stereo: true, b: (s, d) => { s.nz({ d, v: 0.6, bp: 500, q: 1.2, k: 'pink', hold: true, a: 0.01, rel: 0.01 }); s.nz({ d, v: 0.25, bp: 1400, q: 2, k: 'pink', hold: true, a: 0.01, rel: 0.01 }); } },
  electric_hum: { d: 4, lvl: -16, b: (s, d) => { s.tone({ w: 'sawtooth', f: 50, d, v: 0.4, hold: true, to: s.lp(700) }); s.tone({ f: 100, d, v: 0.3, hold: true }); s.nz({ d, v: 0.03, hp: 4000, hold: true }); } },
  sprinkler_loop: { d: 4, lvl: -13, stereo: true, b: (s, d) => { s.nz({ d, v: 0.5, hp: 2500, hold: true }); s.grains(0, d, 120, 1200, 4500, 0.05, 0.02); } },
  server_hum: { d: 4, lvl: -16, b: (s, d) => { s.nz({ d, v: 0.4, lp: 900, k: 'pink', hold: true }); s.tone({ f: 120, d, v: 0.15, hold: true }); s.tone({ f: 3150, d, v: 0.02, hold: true }); } },
  helicopter_loop: { d: 4, lvl: -8, stereo: true, b: (s, d) => { s.chopped(0, d, 1, 11.5, 600, 1); s.tone({ w: 'sawtooth', f: 46, d, v: 0.3, hold: true, to: s.lp(200) }); s.nz({ d, v: 0.2, bp: 2200, q: 0.8, hold: true }); } },
  conveyor_loop: { d: 2, lvl: -12, b: (s, d) => { s.chopped(0, d, 0.6, 16, 1200, 0.7, undefined, 'brown', 'sawtooth'); s.tone({ w: 'sawtooth', f: 55, d, v: 0.15, hold: true, to: s.lp(400) }); } },
  scrubber_loop: { d: 2, lvl: -10, b: (s, d) => { s.tone({ w: 'sawtooth', f: 62, d, v: 0.5, hold: true, to: s.drive(2, 0.6, s.lp(700, 2)) }); s.chopped(0, d, 0.3, 24, 500, 0.8); } },
  alarm_loop: { d: 2, lvl: -12, b: (s, d) => { const b = s.bp(1200, 0.7); const n = Math.round(d / 0.25); for (let i = 0; i < n; i++) s.tone({ w: 'square', f: i % 2 ? 784 : 988, t: i * 0.25, d: 0.24, v: 0.5, hold: true, a: 0.005, rel: 0.008, to: b }); } },
  fluorescent_buzz: { d: 3, lvl: -18, b: (s, d) => { s.tone({ w: 'square', f: 100, d, v: 0.25, hold: true, to: s.bp(1200, 2) }); s.tone({ f: 100, d, v: 0.2, hold: true }); s.nz({ d, v: 0.02, hp: 6000, hold: true }); } },
  rain: { d: 6, lvl: -12, stereo: true, b: (s, d) => { s.nz({ d, v: 0.4, lp: 5000, hp: 400, k: 'pink', hold: true }); s.grains(0, d, 220, 1500, 6000, 0.04, 0.008); } },
  hold_music_loop: { d: 24 * 60 / 126, lvl: -12, aligned: true, b: (s) => { holdTune(s); } },
  microwave_loop: { d: 3, lvl: -15, b: (s, d) => { s.tone({ w: 'sawtooth', f: 100, d, v: 0.25, hold: true, to: s.lp(800) }); s.nz({ d, v: 0.2, lp: 1500, k: 'pink', hold: true }); s.chopped(0, d, 0.08, 1, 3000, 0.5, undefined, 'white', 'sine'); } },
  car_idle: { d: 2, lvl: -12, b: (s, d) => { s.tone({ w: 'sawtooth', f: 38, d, v: 0.5, hold: true, to: s.lp(400, 2) }); s.chopped(0, d, 0.35, 19, 350, 0.8); } },
};

/** Original phone-line hold tune (G major minuet-style, 8 bars of 3/4 at 126 bpm = 11.43 s). */
function holdTune(s: Syn): void {
  const out = s.hp(380, 0.8, s.lp(3100, 0.9, s.drive(1.5, 0.8)));
  const q = 60 / 126;
  // melody: [midi, beats]
  const mel: [number, number][] = [
    [74, 1], [79, 1], [81, 1], [83, 2], [81, 1], [79, 1], [78, 1], [76, 1], [78, 3],
    [76, 1], [78, 1], [79, 1], [81, 2], [79, 1], [78, 1], [76, 1], [74, 1], [79, 3],
  ];
  let t = 0;
  for (const [m, b] of mel) { s.note('harpsi', t, m, b * q * 0.9, 0.9, {}, out); t += b * q; }
  const bass: [number, number][] = [[43, 3], [48, 3], [50, 3], [50, 3], [52, 3], [47, 3], [45, 3], [43, 3]];
  t = 0;
  for (const [m, b] of bass) { s.note('pizz', t, m, 0.2, 0.9, {}, out); s.note('strings', t + q, m + 12, q * 1.6, 0.5, { att: 0.05 }, out); t += b * q; }
}
