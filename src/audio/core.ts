// Shared DSP helpers for the audio engine: cosmetic RNG, envelopes, noise, shaper curves, reverb IRs, wave tables.
// Works with any BaseAudioContext (realtime AudioContext or OfflineAudioContext).

export type AC = BaseAudioContext;

/** Cosmetic PRNG (mulberry32). Audio is purely cosmetic so it never touches gameplay Rng streams. */
export class ARng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  /** Symmetric jitter around 1 (e.g. 0.05 -> 0.95..1.05). */
  vary(amt: number): number { return 1 + (this.next() * 2 - 1) * amt; }
}

let globalSeed = 0x51ed27;
/** Non-deterministic-ish seed source for cosmetic variation (no Math.random needed). */
export function freshSeed(): number {
  globalSeed = (Math.imul(globalSeed ^ (globalSeed >>> 13), 0x5bd1e995) + ((performance.now() * 1000) | 0)) >>> 0;
  return globalSeed;
}
export const fx = new ARng(freshSeed());

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'c4' = 60, 'f#3', 'bb5', 'eb2'. Returns NaN on failure. */
export function noteToMidi(s: string): number {
  const m = /^([a-gA-G])(#|b|s)?(-?\d)$/.exec(s);
  if (!m) return NaN;
  let pc = NOTE_PC[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === 's') pc++;
  else if (m[2] === 'b') pc--;
  return pc + (parseInt(m[3], 10) + 1) * 12;
}

// ---------------------------------------------------------------- envelopes
/** Percussive envelope: attack (linear) then exponential decay to silence. Ends exactly at 0 at t+a+d+0.004. */
export function perc(p: AudioParam, t: number, a: number, d: number, peak: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
  p.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.0008), t + a + d);
  p.linearRampToValueAtTime(0, t + a + d + 0.004);
  return t + a + d + 0.005;
}

/** ADSR for a held note of length dur. Returns the time the voice is fully silent. */
export function adsr(p: AudioParam, t: number, a: number, d: number, s: number, r: number, dur: number, peak: number): number {
  const sus = Math.max(1e-5, peak * s);
  p.setValueAtTime(0, t);
  const ta = t + Math.max(0.001, a);
  const tr = t + Math.max(dur, 0.002);
  if (tr <= ta) {
    // released during attack
    const lvl = peak * ((tr - t) / Math.max(0.001, a));
    p.linearRampToValueAtTime(Math.max(1e-5, lvl), tr);
    p.exponentialRampToValueAtTime(Math.max(1e-5, lvl * 0.001), tr + r);
  } else {
    p.linearRampToValueAtTime(peak, ta);
    const td = ta + Math.max(0.001, d);
    if (td < tr) {
      p.exponentialRampToValueAtTime(sus, td);
      p.setValueAtTime(sus, tr);
      p.exponentialRampToValueAtTime(sus * 0.001, tr + r);
    } else {
      // release during decay: approximate level at tr
      const k = (tr - ta) / (td - ta);
      const lvl = peak * Math.pow(s, k);
      p.exponentialRampToValueAtTime(Math.max(1e-5, lvl), tr);
      p.exponentialRampToValueAtTime(Math.max(1e-6, lvl * 0.001), tr + r);
    }
  }
  p.linearRampToValueAtTime(0, tr + r + 0.004);
  return tr + r + 0.006;
}

/** Piecewise-linear automation from [time, value] pairs (times relative to t). */
export function ramp(p: AudioParam, t: number, pts: [number, number][]): void {
  p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
}
/** Exponential automation (values must be > 0). */
export function xramp(p: AudioParam, t: number, pts: [number, number][]): void {
  p.setValueAtTime(Math.max(1e-4, pts[0][1]), t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-4, pts[i][1]), t + pts[i][0]);
}

// ---------------------------------------------------------------- node helpers
export function gain(ctx: AC, v = 1, dest?: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}
export function filt(ctx: AC, type: BiquadFilterType, f: number, q = 0.7, dest?: AudioNode, gainDb = 0): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  if (gainDb) b.gain.value = gainDb;
  if (dest) b.connect(dest);
  return b;
}
export function osc(ctx: AC, type: OscillatorType, f: number, dest?: AudioNode, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f;
  if (detune) o.detune.value = detune;
  if (dest) o.connect(dest);
  return o;
}
export function oscWave(ctx: AC, w: PeriodicWave, f: number, dest?: AudioNode, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.setPeriodicWave(w); o.frequency.value = f;
  if (detune) o.detune.value = detune;
  if (dest) o.connect(dest);
  return o;
}
export function panner(ctx: AC, pan: number, dest?: AudioNode): AudioNode {
  if (typeof (ctx as any).createStereoPanner !== 'function') { const g = gain(ctx, 1, dest); return g; }
  const p = ctx.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  if (dest) p.connect(dest);
  return p;
}
export function startStop(n: AudioScheduledSourceNode, t: number, end: number): void {
  n.start(t); n.stop(end);
}

// ---------------------------------------------------------------- noise
type NoiseKind = 'white' | 'pink' | 'brown' | 'crackle';
const noiseCache = new WeakMap<AC, Partial<Record<NoiseKind, AudioBuffer>>>();
export function noiseBuffer(ctx: AC, kind: NoiseKind = 'white'): AudioBuffer {
  let m = noiseCache.get(ctx);
  if (!m) { m = {}; noiseCache.set(ctx, m); }
  const have = m[kind];
  if (have) return have;
  const len = Math.floor(ctx.sampleRate * 2.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = new ARng(kind.length * 7919 + 17);
  if (kind === 'white') for (let i = 0; i < len; i++) d[i] = r.next() * 2 - 1;
  else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = r.next() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (r.next() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  } else {
    // vinyl-ish crackle: sparse impulses
    for (let i = 0; i < len; i++) {
      d[i] = r.next() < 0.0009 ? (r.next() * 2 - 1) * (r.next() < 0.1 ? 1 : 0.35) : 0;
    }
  }
  // remove DC and make the loop seamless by fading the wrap point
  let mean = 0; for (let i = 0; i < len; i++) mean += d[i]; mean /= len;
  const xf = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < len; i++) d[i] -= mean;
  for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len - xf + i] * (1 - k); }
  m[kind] = buf;
  return buf;
}
/** Looping noise source started at a random offset. */
export function noise(ctx: AC, kind: NoiseKind, t: number, end: number, dest: AudioNode, rnd?: ARng, rate = 1): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, kind);
  s.loop = true;
  if (rate !== 1) s.playbackRate.value = rate;
  s.connect(dest);
  s.start(t, (rnd ?? fx).next() * 2.2);
  s.stop(end);
  return s;
}

// ---------------------------------------------------------------- shaper curves
const curveCache = new Map<string, Float32Array<ArrayBuffer>>();
/** tanh-style saturation with drive k. */
export function satCurve(k: number): Float32Array<ArrayBuffer> {
  const key = 'sat' + k;
  let c = curveCache.get(key);
  if (c) return c;
  const n = 2048;
  c = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / norm; }
  curveCache.set(key, c);
  return c;
}
/** Bit-crush/fold style hard curve for gritty sounds. */
export function foldCurve(k: number): Float32Array<ArrayBuffer> {
  const key = 'fold' + k;
  let c = curveCache.get(key);
  if (c) return c;
  const n = 2048;
  c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.sin(x * k * Math.PI * 0.5) * 0.9; }
  curveCache.set(key, c);
  return c;
}
/** Transparent soft clipper: linear to `knee`, then smoothly saturates towards `ceil`. Used as the final safety stage. */
export function softClipCurve(knee = 0.7, ceil = 0.93): Float32Array<ArrayBuffer> {
  const key = `clip${knee}_${ceil}`;
  let c = curveCache.get(key);
  if (c) return c;
  const n = 8193;
  c = new Float32Array(new ArrayBuffer(n * 4));
  const room = ceil - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // shaper input range -1..1 (beyond clamps to the ends)
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = Math.sign(x) * y;
  }
  curveCache.set(key, c);
  return c;
}
export function shaper(ctx: AC, curve: Float32Array<ArrayBuffer>, dest?: AudioNode, over: OverSampleType = 'none'): WaveShaperNode {
  const w = ctx.createWaveShaper();
  w.curve = curve; w.oversample = over;
  if (dest) w.connect(dest);
  return w;
}

// ---------------------------------------------------------------- reverb impulse responses
const irCache = new WeakMap<AC, Map<string, AudioBuffer>>();
/** Procedural stereo reverb IR: exponentially decaying noise with HF damping and early reflections. */
export function reverbIR(ctx: AC, seconds: number, damp = 0.5, pre = 0.01, early = 0.4): AudioBuffer {
  let m = irCache.get(ctx);
  if (!m) { m = new Map(); irCache.set(ctx, m); }
  const key = `${seconds}_${damp}_${pre}_${early}`;
  const have = m.get(key);
  if (have) return have;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (seconds + pre));
  const buf = ctx.createBuffer(2, len, sr);
  const r = new ARng(Math.floor(seconds * 1000) + 3);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const p0 = Math.floor(pre * sr);
    for (let i = p0; i < len; i++) {
      const tt = (i - p0) / sr;
      const env = Math.exp((-6.9 * tt) / seconds);
      // damping: one-pole lowpass whose coefficient grows with time
      const a = Math.min(0.97, 0.05 + damp * (tt / seconds) * 1.6 + damp * 0.25);
      lp = lp * a + (r.next() * 2 - 1) * (1 - a);
      d[i] = lp * env * (1.6 + damp * 2);
    }
    // early reflections
    for (let k = 0; k < 9; k++) {
      const pos = p0 + Math.floor(sr * (0.004 + r.next() * 0.06));
      if (pos < len) d[pos] += (r.next() < 0.5 ? -1 : 1) * early * (1 - k / 10);
    }
    // fade in to avoid initial click, fade out tail
    const fi = Math.min(len, Math.floor(sr * 0.002) + p0);
    for (let i = p0; i < fi; i++) d[i] *= (i - p0) / (fi - p0);
    const fo = Math.floor(sr * 0.05);
    for (let i = 0; i < fo; i++) d[len - 1 - i] *= i / fo;
  }
  // normalise energy so different sizes have similar loudness
  let e = 0;
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) e += d[i] * d[i]; }
  const k = 1 / Math.sqrt(e / 2 + 1e-9) * 0.9;
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] *= k; }
  m.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------- periodic waves
const waveCache = new WeakMap<AC, Map<string, PeriodicWave>>();
/** Cached PeriodicWave from a harmonic amplitude function (harmonic index from 1). */
export function wave(ctx: AC, key: string, n: number, amp: (h: number) => number, phase?: (h: number) => number): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  const have = m.get(key);
  if (have) return have;
  const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
  for (let h = 1; h <= n; h++) {
    const a = amp(h), ph = phase ? phase(h) : 0;
    real[h] = a * Math.sin(ph); imag[h] = a * Math.cos(ph);
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  m.set(key, w);
  return w;
}

/** Vowel formants (F1,F2,F3 Hz and relative amps) used by choir pads and the voice synth. */
export const VOWELS: Record<string, [number, number, number, number, number, number]> = {
  a: [800, 1150, 2800, 1, 0.5, 0.15],
  e: [450, 1900, 2600, 1, 0.35, 0.18],
  i: [300, 2250, 3000, 1, 0.25, 0.15],
  o: [450, 800, 2830, 1, 0.45, 0.08],
  u: [330, 700, 2700, 1, 0.25, 0.05],
  ae: [660, 1700, 2400, 1, 0.45, 0.2],
  uh: [600, 1200, 2500, 1, 0.45, 0.12],
  er: [500, 1350, 1700, 1, 0.5, 0.2],
};
/** Formant-shaped harmonic amplitude (sum of three resonance bumps over a glottal -12 dB/oct slope). */
export function formantAmp(f0: number, h: number, v: string, scale = 1): number {
  const F = VOWELS[v] ?? VOWELS.a;
  const f = f0 * h;
  let a = 0;
  for (let k = 0; k < 3; k++) {
    const fc = F[k] * scale, bw = 60 + fc * 0.08;
    const x = (f - fc) / bw;
    a += F[3 + k] / (1 + x * x);
  }
  return (a + 0.02) / Math.pow(h, 0.9);
}
