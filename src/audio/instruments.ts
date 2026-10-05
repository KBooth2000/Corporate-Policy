// Synthesised instruments for the score. Every instrument schedules a single note at time t into `out`.
// Signature: (ctx, out, t, midi, durSeconds, velocity 0..1+, params, rng). All voices clean up after themselves.
import {
  AC, ARng, adsr, perc, gain, filt, osc, oscWave, panner, noise, satCurve, shaper, wave, mtof, formantAmp, xramp,
} from './core';

export type IP = Record<string, any>;
export type InstFn = (ctx: AC, out: AudioNode, t: number, midi: number, dur: number, vel: number, p: IP, r: ARng) => void;

const lfo = (ctx: AC, param: AudioParam, t: number, end: number, rate: number, depth: number, delay = 0, type: OscillatorType = 'sine'): void => {
  const l = osc(ctx, type, rate);
  const g = gain(ctx, 0);
  l.connect(g); g.connect(param);
  if (delay > 0) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0, t + delay * 0.4); g.gain.linearRampToValueAtTime(depth, t + delay); }
  else g.gain.setValueAtTime(depth, t);
  l.start(t); l.stop(end);
};

// ============================================================ DRUMS
const kick: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const f = p.f ?? 50, dec = (p.dec ?? 0.42) * r.vary(0.03), punch = p.punch ?? 3.6, drive = p.drive ?? 0;
  const dest = drive ? shaper(ctx, satCurve(drive), gain(ctx, p.post ?? 0.75, out)) : out;
  const g = gain(ctx, 0, dest);
  const o = osc(ctx, 'sine', f * punch, g);
  o.frequency.setValueAtTime(f * punch, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.028);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dec);
  const end = perc(g.gain, t, 0.0015, dec, vel * (p.g ?? 0.9));
  o.start(t); o.stop(end);
  const click = p.click ?? 0.45;
  if (click > 0) {
    const cg = gain(ctx, 0, dest);
    noise(ctx, 'white', t, t + 0.03, filt(ctx, 'highpass', p.clickF ?? 1800, 0.7, cg), r);
    perc(cg.gain, t, 0.0005, 0.012, vel * click * 0.5);
  }
  if (p.sub) { // long sub tail for heavy kicks
    const sg = gain(ctx, 0, out);
    const s = osc(ctx, 'sine', f * 0.9, sg);
    s.frequency.setValueAtTime(f * 1.2, t); s.frequency.exponentialRampToValueAtTime(f * 0.7, t + dec * 1.6);
    const e2 = perc(sg.gain, t + 0.01, 0.01, dec * 1.6, vel * p.sub);
    s.start(t); s.stop(e2);
  }
};

const snare: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const f = (p.f ?? 185) * r.vary(0.02);
  const bg = gain(ctx, 0, out);
  const o = osc(ctx, 'triangle', f * 1.3, bg);
  o.frequency.setValueAtTime(f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
  const e1 = perc(bg.gain, t, 0.001, p.body ?? 0.08, vel * 0.45);
  o.start(t); o.stop(e1);
  const ng = gain(ctx, 0, out);
  const hp = filt(ctx, 'highpass', p.nf ?? 1400, 0.7, filt(ctx, 'peaking', 4500, 1, ng, 4));
  noise(ctx, 'white', t, t + 0.4, hp, r);
  perc(ng.gain, t, 0.001, (p.dec ?? 0.17) * r.vary(0.05), vel * (p.ng ?? 0.42));
};

const clap: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const bp = filt(ctx, 'bandpass', (p.f ?? 1150) * r.vary(0.04), p.q ?? 1.4, g);
  noise(ctx, 'white', t, t + 0.5, filt(ctx, 'highpass', 600, 0.7, bp), r);
  const v = vel * (p.g ?? 0.9), gp = g.gain;
  gp.setValueAtTime(0, t);
  let tt = t;
  for (let i = 0; i < 3; i++) {
    gp.linearRampToValueAtTime(v * (1 - i * 0.12), tt + 0.001);
    gp.exponentialRampToValueAtTime(v * 0.12, tt + 0.009);
    tt += 0.0095 * r.vary(0.15);
  }
  gp.linearRampToValueAtTime(v, tt + 0.001);
  gp.exponentialRampToValueAtTime(v * 0.0008, tt + (p.dec ?? 0.16));
  gp.linearRampToValueAtTime(0, tt + (p.dec ?? 0.16) + 0.004);
};

const hat: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const chain = filt(ctx, 'highpass', p.f ?? 7200, 0.9, filt(ctx, 'peaking', p.pk ?? 10500, 1.2, g, 5));
  const dec = (p.dec ?? 0.04) * r.vary(0.12);
  noise(ctx, 'white', t, t + dec + 0.05, chain, r);
  perc(g.gain, t, 0.0008, dec, vel * (p.g ?? 0.32));
};

const shaker: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.15, filt(ctx, 'bandpass', (p.f ?? 6500) * r.vary(0.05), 1.1, g), r);
  const a = p.att ?? 0.012;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * (p.g ?? 0.22), t + a);
  g.gain.exponentialRampToValueAtTime(vel * 0.0005, t + a + (p.dec ?? 0.06));
  g.gain.linearRampToValueAtTime(0, t + a + (p.dec ?? 0.06) + 0.004);
};

const ride: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.9, filt(ctx, 'bandpass', 7400, 0.8, g), r);
  perc(g.gain, t, 0.001, (p.dec ?? 0.55) * r.vary(0.08), vel * 0.16);
  const bg = gain(ctx, 0, filt(ctx, 'highpass', 2000, 0.7, out));
  for (const k of [3150, 4720, 5980]) { const o = osc(ctx, 'sine', k * r.vary(0.004), bg); o.start(t); o.stop(t + 0.7); }
  perc(bg.gain, t, 0.001, 0.6, vel * 0.025);
};

const crash: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 13000, 0.5, g);
  xramp(lp.frequency, t, [[0, 14000], [p.dec ?? 1.8, 4000]]);
  noise(ctx, 'white', t, t + (p.dec ?? 1.8) + 0.1, filt(ctx, 'highpass', p.f ?? 3200, 0.6, lp), r);
  perc(g.gain, t, 0.002, (p.dec ?? 1.8) * r.vary(0.05), vel * (p.g ?? 0.3));
};

const rim: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'triangle', (p.f ?? 820) * r.vary(0.01), filt(ctx, 'highpass', 400, 0.7, g));
  const e = perc(g.gain, t, 0.0005, p.dec ?? 0.035, vel * 0.42);
  o.start(t); o.stop(e);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.03, filt(ctx, 'bandpass', 3200, 2, ng), r);
  perc(ng.gain, t, 0.0004, 0.012, vel * 0.35);
};

const clave: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', (p.f ?? 2350) * r.vary(0.01), g);
  const e = perc(g.gain, t, 0.0005, p.dec ?? 0.05, vel * 0.3);
  o.start(t); o.stop(e);
};

const conga: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const f = (p.f ?? 210) * r.vary(0.01);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', f * 1.25, g);
  o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.025);
  const e = perc(g.gain, t, 0.001, p.dec ?? 0.2, vel * 0.5);
  o.start(t); o.stop(e);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.03, filt(ctx, 'bandpass', f * 6, 1.5, ng), r);
  perc(ng.gain, t, 0.0005, 0.012, vel * 0.18);
};

const tom: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const f = (p.f ?? 110) * r.vary(0.01);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', f * 1.6, g);
  o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  const e = perc(g.gain, t, 0.001, p.dec ?? 0.35, vel * 0.55);
  o.start(t); o.stop(e);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.06, filt(ctx, 'lowpass', 2200, 0.7, ng), r);
  perc(ng.gain, t, 0.0005, 0.04, vel * 0.2);
};

const timpani: InstFn = (ctx, out, t, m, _d, vel, p, r) => {
  const f = mtof(m || 38);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', 1400, 0.7, out));
  for (const [k, a] of [[1, 1], [1.5, 0.45], [1.99, 0.3], [2.44, 0.15]] as const) {
    const o = osc(ctx, 'sine', f * k * r.vary(0.002), gain(ctx, a, g));
    o.frequency.setValueAtTime(f * k * 1.02, t); o.frequency.exponentialRampToValueAtTime(f * k, t + 0.15);
    o.start(t); o.stop(t + (p.dec ?? 1.6) + 0.1);
  }
  perc(g.gain, t, 0.003, p.dec ?? 1.6, vel * 0.42);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'brown', t, t + 0.2, filt(ctx, 'lowpass', 900, 0.7, ng), r);
  perc(ng.gain, t, 0.001, 0.08, vel * 0.5);
};

const cowbell: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const bp = filt(ctx, 'bandpass', 2600, 1.2, g);
  for (const f of [562, 845]) { const o = osc(ctx, 'square', f * (p.k ?? 1) * r.vary(0.003), bp); o.start(t); o.stop(t + 0.4); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.001);
  g.gain.exponentialRampToValueAtTime(vel * 0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(vel * 0.0003, t + 0.32);
  g.gain.linearRampToValueAtTime(0, t + 0.33);
};

const clank: InstFn = (ctx, out, t, m, _d, vel, p, r) => {
  // metallic pipe hit: inharmonic partials with independent decays
  const f = m ? mtof(m) : (p.f ?? 330) * r.vary(0.03);
  const bus = gain(ctx, 1, filt(ctx, 'highpass', 200, 0.7, out));
  const parts: [number, number, number][] = [[1, 1, 0.5], [2.76, 0.6, 0.28], [5.4, 0.35, 0.12], [8.93, 0.25, 0.06], [1.51, 0.4, 0.35]];
  for (const [k, a, d] of parts) {
    const g = gain(ctx, 0, bus);
    const o = osc(ctx, 'sine', f * k * r.vary(0.01), g);
    const e = perc(g.gain, t, 0.0005, d * (p.dec ?? 1), vel * a * 0.18);
    o.start(t); o.stop(e);
  }
  const ng = gain(ctx, 0, bus);
  noise(ctx, 'white', t, t + 0.05, filt(ctx, 'bandpass', 4000, 1, ng), r);
  perc(ng.gain, t, 0.0005, 0.02, vel * 0.3);
};

const gong: InstFn = (ctx, out, t, m, _d, vel, p, r) => {
  const f = m ? mtof(m) : 82;
  const bus = gain(ctx, 0, out);
  const parts = [1, 1.47, 2.09, 2.56, 3.12, 4.21, 5.3];
  parts.forEach((k, i) => {
    const o = osc(ctx, 'sine', f * k * r.vary(0.005), gain(ctx, 0.5 / (1 + i * 0.5), bus));
    o.frequency.setValueAtTime(f * k * 0.995, t); o.frequency.linearRampToValueAtTime(f * k * 1.004, t + 0.8);
    o.start(t); o.stop(t + (p.dec ?? 3.5) + 0.2);
  });
  bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(vel * 0.32, t + 0.01);
  bus.gain.linearRampToValueAtTime(vel * 0.4, t + 0.25);
  bus.gain.exponentialRampToValueAtTime(vel * 0.0004, t + (p.dec ?? 3.5));
  bus.gain.linearRampToValueAtTime(0, t + (p.dec ?? 3.5) + 0.05);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'pink', t, t + 1.5, filt(ctx, 'bandpass', 900, 0.8, ng), r);
  perc(ng.gain, t, 0.002, 1.2, vel * 0.1);
};

const brush: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.3, filt(ctx, 'bandpass', (p.f ?? 2600) * r.vary(0.05), 0.6, g), r);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.2, t + (p.att ?? 0.012));
  g.gain.exponentialRampToValueAtTime(vel * 0.0005, t + (p.dec ?? 0.14)); g.gain.linearRampToValueAtTime(0, t + (p.dec ?? 0.14) + 0.005);
};

const snap: InstFn = (ctx, out, t, _m, _d, vel, _p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.06, filt(ctx, 'bandpass', 2300 * r.vary(0.05), 2.2, g), r);
  perc(g.gain, t, 0.0005, 0.03, vel * 0.7);
};

const tamb: InstFn = (ctx, out, t, _m, _d, vel, _p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.25, filt(ctx, 'highpass', 7000, 1, filt(ctx, 'peaking', 9500, 3, g, 8)), r);
  g.gain.setValueAtTime(0, t);
  let tt = t;
  for (let i = 0; i < 3; i++) { g.gain.linearRampToValueAtTime(vel * 0.2 * (1 - i * 0.25), tt + 0.002); g.gain.exponentialRampToValueAtTime(vel * 0.02, tt + 0.018); tt += 0.02; }
  g.gain.exponentialRampToValueAtTime(vel * 0.0003, tt + 0.12); g.gain.linearRampToValueAtTime(0, tt + 0.125);
};

const tick: InstFn = (ctx, out, t, _m, _d, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', (p.f ?? 3100) * r.vary(0.02), g);
  const e = perc(g.gain, t, 0.0003, p.dec ?? 0.012, vel * 0.35);
  o.start(t); o.stop(e);
};

/** Short pitched techno bleep. */
const blip: InstFn = (ctx, out, t, m, _d, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, p.w ?? 'sine', f * 2, g);
  o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  const e = perc(g.gain, t, 0.001, p.dec ?? 0.09, vel * 0.22);
  o.start(t); o.stop(e);
};

// ============================================================ BASS
const sub: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', f, g);
  const o2 = osc(ctx, 'triangle', f, gain(ctx, p.tri ?? 0.25, g));
  if (p.glide) { o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); }
  const e = adsr(g.gain, t, 0.006, 0.12, p.s ?? 0.8, p.rel ?? 0.06, dur, vel * 0.45);
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

const deep: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 420, p.q ?? 1.5, g);
  const o = osc(ctx, 'sine', f, lp);
  const o2 = osc(ctx, 'sawtooth', f, gain(ctx, p.saw ?? 0.35, lp));
  const c = p.cut ?? 420;
  lp.frequency.setValueAtTime(c * 3.2 * (0.6 + vel * 0.4), t); lp.frequency.exponentialRampToValueAtTime(c, t + 0.12);
  const e = adsr(g.gain, t, 0.004, 0.25, p.s ?? 0.6, p.rel ?? 0.07, dur, vel * 0.5);
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

const acid: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const post = gain(ctx, 0, out);
  const sh = shaper(ctx, satCurve(p.drive ?? 2.2), post);
  const lp = filt(ctx, 'lowpass', p.cut ?? 380, p.q ?? 13, sh);
  const o = osc(ctx, p.w ?? 'sawtooth', f, lp);
  if (p.slide) { o.frequency.setValueAtTime(mtof(m + (p.slide as number)), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
  const c = p.cut ?? 380, acc = vel > 0.9 ? 1.8 : 1;
  lp.frequency.setValueAtTime(c, t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(12000, c * (p.env ?? 5) * acc), t + 0.006);
  lp.frequency.exponentialRampToValueAtTime(c, t + (p.dec ?? 0.17) * acc);
  const e = adsr(post.gain, t, 0.003, 0.12, 0.75, 0.03, dur, vel * (p.g ?? 0.24));
  o.start(t); o.stop(e);
};

const fmbass: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 1800, 0.7, filt(ctx, 'highpass', 22, 0.7, out)));
  const c = osc(ctx, 'sine', f, g);
  const mod = osc(ctx, 'sine', f * (p.ratio ?? 1));
  const mg = gain(ctx, 0); mod.connect(mg); mg.connect(c.frequency);
  const idx = (p.idx ?? 3) * f;
  mg.gain.setValueAtTime(idx * (0.5 + vel * 0.5), t); mg.gain.exponentialRampToValueAtTime(idx * 0.12 + 1, t + (p.dec ?? 0.18));
  const e = adsr(g.gain, t, 0.003, 0.15, p.s ?? 0.7, 0.05, dur, vel * 0.45);
  c.start(t); c.stop(e); mod.start(t); mod.stop(e);
};

const upright: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 900, 0.8, out));
  const o = osc(ctx, 'triangle', f, g);
  const o2 = osc(ctx, 'sine', f, gain(ctx, 0.7, g));
  o.frequency.setValueAtTime(f * 1.025, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
  const len = Math.min(dur + 0.08, 1.4);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.006);
  g.gain.exponentialRampToValueAtTime(vel * 0.28, t + 0.12);
  g.gain.exponentialRampToValueAtTime(vel * 0.12, t + len);
  g.gain.exponentialRampToValueAtTime(vel * 0.0002, t + len + 0.07);
  g.gain.linearRampToValueAtTime(0, t + len + 0.075);
  o.start(t); o.stop(t + len + 0.08); o2.start(t); o2.stop(t + len + 0.08);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.03, filt(ctx, 'bandpass', 900, 1.5, ng), r);
  perc(ng.gain, t, 0.0005, 0.015, vel * 0.12);
};

const fretless: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 1100, 1, out));
  const o = osc(ctx, 'sine', f, g);
  const o2 = osc(ctx, 'sawtooth', f, gain(ctx, 0.22, g));
  for (const x of [o, o2]) { x.detune.setValueAtTime(-55, t); x.detune.linearRampToValueAtTime(0, t + 0.07); }
  const e = adsr(g.gain, t, 0.02, 0.3, 0.7, 0.09, dur, vel * 0.5);
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

const reese: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const post = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 650, p.q ?? 2, shaper(ctx, satCurve(p.drive ?? 1.6), post));
  for (const d of [-14, 13]) { const o = osc(ctx, 'sawtooth', f, lp, d); o.start(t); o.stop(t + dur + 0.2); }
  const s = osc(ctx, 'sine', f, gain(ctx, 0.9, post)); s.start(t); s.stop(t + dur + 0.2);
  if (p.wob) lfo(ctx, lp.frequency, t, t + dur + 0.2, p.wob, (p.cut ?? 650) * 0.6);
  adsr(post.gain, t, 0.01, 0.2, 0.85, 0.08, dur, vel * (p.g ?? 0.26));
};

const synbass: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 400, 2, g);
  xramp(lp.frequency, t, [[0, (p.cut ?? 2600) * vel], [0.15, 380]]);
  const o = osc(ctx, 'square', f, lp), o2 = osc(ctx, 'sine', f, gain(ctx, 0.8, g));
  const e = adsr(g.gain, t, 0.004, 0.2, 0.7, 0.05, dur, vel * 0.3);
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

/** Hard-techno rumble: distorted low sine swelling after the kick. */
const rumble: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const post = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 160, 1, out));
  const o = osc(ctx, 'sine', f, shaper(ctx, satCurve(3), post));
  post.gain.setValueAtTime(0, t); post.gain.linearRampToValueAtTime(vel * 0.4, t + 0.03);
  post.gain.exponentialRampToValueAtTime(vel * 0.001, t + Math.max(0.1, dur)); post.gain.linearRampToValueAtTime(0, t + dur + 0.01);
  o.start(t); o.stop(t + dur + 0.02);
};

// ============================================================ KEYS & MALLETS
const rhodes: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const hp = filt(ctx, 'highpass', 40, 0.7, p.cut ? filt(ctx, 'lowpass', p.cut, 0.7, out) : out); // 1:1 FM has a DC sideband
  const g = gain(ctx, 0, hp);
  const c = osc(ctx, 'sine', f, g);
  const mod = osc(ctx, 'sine', f * (p.ratio ?? 1));
  const mg = gain(ctx, 0); mod.connect(mg); mg.connect(c.frequency);
  const idx = f * (p.idx ?? 1.6) * (0.4 + vel * 0.8);
  mg.gain.setValueAtTime(idx, t); mg.gain.exponentialRampToValueAtTime(idx * 0.15 + 0.5, t + 0.9);
  const tg = gain(ctx, 0, g);
  const tine = osc(ctx, 'sine', f * 7.1, tg);
  perc(tg.gain, t, 0.0005, 0.06, 0.12 * vel);
  const hold = Math.max(dur, 0.05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (p.g ?? 0.22), t + 0.003);
  g.gain.exponentialRampToValueAtTime(vel * (p.g ?? 0.22) * 0.35, t + 0.8);
  g.gain.exponentialRampToValueAtTime(vel * (p.g ?? 0.22) * 0.15, t + Math.max(0.81, hold + 0.01));
  const end = Math.max(0.82, hold + 0.02) + (p.rel ?? 0.25);
  g.gain.exponentialRampToValueAtTime(1e-5, t + end); g.gain.linearRampToValueAtTime(0, t + end + 0.004);
  for (const o of [c, mod, tine]) { o.start(t); o.stop(t + end + 0.01); }
};

function organWave(ctx: AC, reg: string): PeriodicWave {
  // harmonic numbers relative to the 16' fundamental; drawbars 16 8 5⅓ 4 2⅔ 2 1⅗ 1⅓ 1
  const H = [1, 2, 3, 4, 6, 8, 10, 12, 16];
  const regs: Record<string, number[]> = {
    jazz: [0.8, 1, 0.85, 0.2, 0, 0, 0, 0, 0.1],
    gospel: [0.9, 1, 0.8, 0.6, 0.4, 0.5, 0.2, 0.2, 0.3],
    church: [0.5, 1, 0.3, 0.8, 0.35, 0.6, 0.15, 0.3, 0.4],
    thin: [0, 1, 0.2, 0.6, 0, 0.3, 0, 0, 0],
  };
  const d = regs[reg] ?? regs.jazz;
  return wave(ctx, 'organ_' + reg, 16, (h) => { const i = H.indexOf(h); return i >= 0 ? d[i] : 0; });
}
const organ: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m) / 2;
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 6000, 0.6, out));
  const o = oscWave(ctx, organWave(ctx, p.reg ?? 'jazz'), f, g);
  lfo(ctx, o.detune, t, t + dur + 0.2, p.lrate ?? 6.2, p.lfo ?? 7);
  const e = adsr(g.gain, t, p.att ?? 0.006, 0.05, 0.95, p.rel ?? 0.06, dur, vel * (p.g ?? 0.15));
  o.start(t); o.stop(e);
  if (p.perc !== 0) { // key click + percussion harmonic
    const pg = gain(ctx, 0, out);
    const po = osc(ctx, 'sine', f * 6, pg);
    const e2 = perc(pg.gain, t, 0.001, 0.12, vel * 0.04);
    po.start(t); po.stop(e2);
    const ng = gain(ctx, 0, out);
    noise(ctx, 'white', t, t + 0.01, filt(ctx, 'bandpass', 2500, 1, ng), r);
    perc(ng.gain, t, 0.0003, 0.004, vel * 0.05);
  }
};

const harpsi: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const w = wave(ctx, 'harpsi', 48, (h) => Math.abs(Math.sin(Math.PI * h * 0.11)) / Math.pow(h, 0.55) + (h === 1 ? 0.3 : 0));
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 9000, 0.8, g);
  xramp(lp.frequency, t, [[0, 9500], [0.5, 2600]]);
  const o1 = oscWave(ctx, w, f, lp, r.range(-3, 3));
  const o2 = oscWave(ctx, w, f * 2, gain(ctx, p.four ?? 0.35, lp), r.range(-4, 4));
  const decay = Math.min(2.2, 4.5 - (m - 48) * 0.05);
  const hold = Math.max(dur, 0.06);
  const v = (p.g ?? 0.15) * (0.85 + vel * 0.15);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.001);
  g.gain.setTargetAtTime(0, t + 0.002, decay / 4);
  g.gain.setTargetAtTime(0, t + hold, 0.025);
  const end = t + hold + 0.2;
  o1.start(t); o1.stop(end); o2.start(t); o2.stop(end);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.02, filt(ctx, 'highpass', 2500, 0.7, ng), r);
  perc(ng.gain, t, 0.0003, 0.008, v * 0.6);
};

const vibes: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const trem = gain(ctx, 1, out);
  lfo(ctx, trem.gain, t, t + dur + 3, p.trem ?? 5.2, p.depth ?? 0.28);
  const g = gain(ctx, 0, trem);
  const o = osc(ctx, 'sine', f, g);
  const hg = gain(ctx, 0, g); const h = osc(ctx, 'sine', f * 4, hg);
  perc(hg.gain, t, 0.0005, 0.25, 0.3);
  const hold = Math.max(dur, 0.1) + (p.ped ?? 0.4);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (p.g ?? 0.2), t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.003, 0.9);
  g.gain.setTargetAtTime(0, t + hold, 0.08);
  o.start(t); o.stop(t + hold + 0.6); h.start(t); h.stop(t + 0.3);
};

const marimba: InstFn = (ctx, out, t, m, _dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', f, g);
  const hg = gain(ctx, 0, g); const h = osc(ctx, 'sine', f * 3.93, hg);
  perc(hg.gain, t, 0.0005, 0.05, 0.5);
  const d = Math.max(0.18, 0.7 - (m - 60) * 0.015) * (p.dec ?? 1);
  const e = perc(g.gain, t, 0.001, d, vel * (p.g ?? 0.32));
  o.start(t); o.stop(e); h.start(t); h.stop(t + 0.1);
};

const glock: InstFn = (ctx, out, t, m, _dur, vel, p) => {
  const f = mtof(m);
  const bus = gain(ctx, vel * (p.g ?? 0.12), out);
  let end = t;
  for (const [k, a, d] of [[1, 1, p.dec ?? 1.6], [2.756, 0.4, 0.45], [5.404, 0.2, 0.15]] as const) {
    const g = gain(ctx, 0, bus);
    const o = osc(ctx, 'sine', f * k, g);
    const e = perc(g.gain, t, 0.0008, d, a);
    o.start(t); o.stop(e); end = Math.max(end, e);
  }
};

const pluck: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 300, p.q ?? 3, g);
  const c = p.cut ?? 3200;
  xramp(lp.frequency, t, [[0, c * (0.5 + vel * 0.5)], [p.dec ?? 0.22, 280]]);
  const o = osc(ctx, p.w ?? 'sawtooth', f, lp);
  const o2 = osc(ctx, 'square', f, gain(ctx, 0.4, lp), 6);
  const e = perc(g.gain, t, 0.002, Math.max(dur, (p.dec ?? 0.22) * 1.6), vel * (p.g ?? 0.2));
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

const nylon: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const w = wave(ctx, 'nylon', 32, (h) => Math.abs(Math.sin(Math.PI * h * 0.19)) / Math.pow(h, 1.1));
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 4000, 0.9, g);
  xramp(lp.frequency, t, [[0, 2800 + vel * 2500], [0.35, 1100], [1.5, 700]]);
  const o = oscWave(ctx, w, f, lp);
  o.detune.setValueAtTime(8, t); o.detune.exponentialRampToValueAtTime(0.5, t + 0.08);
  const hold = Math.max(dur, 0.1);
  const v = vel * (p.g ?? 0.26);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.004, Math.max(0.25, 0.9 - (m - 52) * 0.012));
  g.gain.setTargetAtTime(0, t + hold, 0.06);
  o.start(t); o.stop(t + hold + 0.45);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.03, filt(ctx, 'bandpass', 1800 * r.vary(0.1), 1.2, ng), r);
  perc(ng.gain, t, 0.0005, 0.012, v * 0.35);
};

const pizz: InstFn = (ctx, out, t, m, _dur, vel, p) => {
  const f = mtof(m);
  const w = wave(ctx, 'pizz', 24, (h) => 1 / Math.pow(h, 1.35));
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 1900, 0.7, out));
  const o = oscWave(ctx, w, f, g);
  const e = perc(g.gain, t, 0.002, Math.max(0.15, 0.45 - (m - 50) * 0.006), vel * (p.g ?? 0.34));
  o.start(t); o.stop(e);
};

const piano: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const w = wave(ctx, 'piano', 32, (h) => (1 / Math.pow(h, 1.25)) * (h % 7 === 0 ? 0.3 : 1) * (1 + 0.3 * Math.sin(h * 1.3)));
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 2000, 0.7, g);
  xramp(lp.frequency, t, [[0, 1500 + vel * 6000], [1.2, 900 + vel * 900]]);
  const o1 = oscWave(ctx, w, f, lp, -1.5), o2 = oscWave(ctx, w, f, lp, 1.8);
  const hold = Math.max(dur, 0.08);
  const v = vel * (p.g ?? 0.16);
  const dec = Math.max(0.6, 3.2 - (m - 48) * 0.05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.002);
  g.gain.setTargetAtTime(v * 0.35, t + 0.003, 0.08);
  g.gain.setTargetAtTime(0, t + 0.25, dec / 3);
  g.gain.setTargetAtTime(0, t + hold, 0.07);
  o1.start(t); o1.stop(t + hold + 0.5); o2.start(t); o2.stop(t + hold + 0.5);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, t + 0.02, filt(ctx, 'bandpass', 2400 * r.vary(0.1), 1, ng), r);
  perc(ng.gain, t, 0.0004, 0.01, v * 0.25);
};

// ============================================================ WINDS / STRINGS / SYNTHS
const flute: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', f, g);
  const o2 = osc(ctx, 'triangle', f, gain(ctx, 0.28, g));
  const end = adsr(g.gain, t, p.att ?? 0.045, 0.1, 0.85, p.rel ?? 0.1, dur, vel * (p.g ?? 0.22));
  for (const x of [o, o2]) { lfo(ctx, x.detune, t, end, 5.1, 9, 0.28); x.start(t); x.stop(end); }
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, end, filt(ctx, 'bandpass', f * 2, 2.5, ng), r);
  adsr(ng.gain, t, 0.02, 0.06, 0.25, 0.08, dur, vel * 0.05);
};

const clarinet: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 1900, 0.8, out));
  const o = osc(ctx, 'square', f, g);
  const o2 = osc(ctx, 'sine', f, gain(ctx, 0.6, g));
  const end = adsr(g.gain, t, 0.035, 0.1, 0.85, 0.08, dur, vel * (p.g ?? 0.11));
  for (const x of [o, o2]) { lfo(ctx, x.detune, t, end, 5, 6, 0.35); x.start(t); x.stop(end); }
};

const sax: InstFn = (ctx, out, t, m, dur, vel, p, r) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const hp = filt(ctx, 'highpass', 260, 0.7, g);
  const pk = filt(ctx, 'peaking', 1300, 1.4, hp, 7);
  const lp = filt(ctx, 'lowpass', 1800 + vel * 1600, 1, pk);
  const end = adsr(g.gain, t, 0.035, 0.25, 0.8, p.rel ?? 0.11, dur, vel * (p.g ?? 0.17));
  lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(1800 + vel * 1600, t + 0.06);
  const o = osc(ctx, 'sawtooth', f, lp);
  const o2 = osc(ctx, 'square', f, gain(ctx, 0.25, lp), 4);
  for (const x of [o, o2]) {
    x.detune.setValueAtTime(-45 * (p.scoop ?? 1), t); x.detune.linearRampToValueAtTime(0, t + 0.07);
    lfo(ctx, x.detune, t, end, 5.4, dur > 0.4 ? 14 : 0, 0.3);
    x.start(t); x.stop(end);
  }
  const ng = gain(ctx, 0, out);
  noise(ctx, 'white', t, end, filt(ctx, 'bandpass', 2800, 1.5, ng), r);
  adsr(ng.gain, t, 0.02, 0.1, 0.3, 0.08, dur, vel * 0.025);
};

const brass: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', 500, 1.2, g);
  const top = 700 + 3200 * vel * (p.bright ?? 1);
  lp.frequency.setValueAtTime(450, t); lp.frequency.linearRampToValueAtTime(top, t + (p.swell ?? 0.05)); lp.frequency.exponentialRampToValueAtTime(top * 0.55, t + 0.35);
  const end = adsr(g.gain, t, p.att ?? 0.02, 0.2, p.s ?? 0.75, p.rel ?? 0.12, dur, vel * (p.g ?? 0.11));
  for (const d of [-7, 6]) { const o = osc(ctx, 'sawtooth', f, lp, d); o.start(t); o.stop(end); }
};

const strings: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 2600, 0.6, filt(ctx, 'highpass', 180, 0.6, g));
  const end = adsr(g.gain, t, p.att ?? 0.25, 0.4, 0.9, p.rel ?? 0.6, dur, vel * (p.g ?? 0.085));
  for (const d of [-11, 0, 10]) {
    const o = osc(ctx, 'sawtooth', f, lp, d);
    lfo(ctx, o.detune, t, end, 4.6 + d * 0.03, 5, 0.4);
    o.start(t); o.stop(end);
  }
};

const pad: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 1300, p.q ?? 0.8, g);
  if (p.sweep) lfo(ctx, lp.frequency, t, t + dur + 3, p.sweep, (p.cut ?? 1300) * 0.4);
  const end = adsr(g.gain, t, p.att ?? 0.7, 0.6, 0.85, p.rel ?? 1.2, dur, vel * (p.g ?? 0.08));
  const o1 = osc(ctx, 'sawtooth', f, lp, -9), o2 = osc(ctx, 'sawtooth', f, lp, 8), o3 = osc(ctx, 'triangle', f / 2, gain(ctx, 0.6, lp));
  for (const o of [o1, o2, o3]) { o.start(t); o.stop(end); }
};

const choir: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const v = (p.v as string) ?? 'a';
  const w = wave(ctx, `choir_${v}_${m}`, 40, (h) => formantAmp(f, h, v, p.fs ?? 1));
  const g = gain(ctx, 0, filt(ctx, 'highpass', 140, 0.7, out));
  const end = adsr(g.gain, t, p.att ?? 0.28, 0.3, 0.9, p.rel ?? 0.7, dur, vel * (p.g ?? 0.13));
  const vibr = osc(ctx, 'sine', 5.1);
  const vg = gain(ctx, 11); vibr.connect(vg);
  for (const d of [-9, 8, 0]) {
    const o = oscWave(ctx, w, f, g, d);
    vg.connect(o.detune);
    o.start(t); o.stop(end);
  }
  vibr.start(t); vibr.stop(end);
};

/** Short pitched vocal chop (formant stab) for house tracks. */
const vox: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const v = (p.v as string) ?? 'a';
  const w = wave(ctx, `choir_${v}_${m}`, 40, (h) => formantAmp(f, h, v, p.fs ?? 1.1));
  const g = gain(ctx, 0, filt(ctx, 'highpass', 220, 0.7, out));
  const end = adsr(g.gain, t, 0.008, 0.12, 0.5, 0.08, Math.min(dur, 0.35), vel * (p.g ?? 0.2));
  const o = oscWave(ctx, w, f, g);
  o.detune.setValueAtTime(-30, t); o.detune.linearRampToValueAtTime(0, t + 0.04);
  o.start(t); o.stop(end);
};

const supersaw: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 5200, p.q ?? 0.8, filt(ctx, 'highpass', 180, 0.7, g));
  if (p.pluck) xramp(lp.frequency, t, [[0, (p.cut ?? 5200) * 1.4], [p.pluck, (p.cut ?? 5200) * 0.25]]);
  const end = adsr(g.gain, t, p.att ?? 0.004, p.d ?? 0.3, p.s ?? 0.65, p.rel ?? 0.15, dur, vel * (p.g ?? 0.085));
  const det = p.n === 5 ? [-24, -9, 0, 10, 23] : [-17, 0, 16];
  det.forEach((d, i) => {
    const pn = panner(ctx, det.length === 1 ? 0 : (i / (det.length - 1)) * 1.3 - 0.65, lp);
    const o = osc(ctx, 'sawtooth', f, pn, d);
    o.start(t); o.stop(end);
  });
};

const lead: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 3600, p.q ?? 1, g);
  const end = adsr(g.gain, t, p.att ?? 0.006, 0.2, p.s ?? 0.7, p.rel ?? 0.09, dur, vel * (p.g ?? 0.1));
  const o = osc(ctx, p.w ?? 'square', f, lp), o2 = osc(ctx, 'sawtooth', f, gain(ctx, 0.5, lp), 7);
  for (const x of [o, o2]) {
    if (p.glide) { x.frequency.setValueAtTime(mtof(m - (p.glide as number)), t); x.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
    lfo(ctx, x.detune, t, end, 5.6, dur > 0.3 ? 10 : 0, 0.25);
    x.start(t); x.stop(end);
  }
};

const stab: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, out);
  const lp = filt(ctx, 'lowpass', p.cut ?? 1100, p.q ?? 3, g);
  xramp(lp.frequency, t, [[0, (p.cut ?? 1100) * 2.2], [p.dec ?? 0.16, (p.cut ?? 1100) * 0.5]]);
  const o = osc(ctx, 'sawtooth', f, lp), o2 = osc(ctx, 'square', f, gain(ctx, 0.6, lp), -8);
  const e = perc(g.gain, t, 0.002, Math.max(dur * 0.8, p.dec ?? 0.16) * 1.4, vel * (p.g ?? 0.13));
  o.start(t); o.stop(e); o2.start(t); o2.stop(e);
};

const siren: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const f = mtof(m);
  const g = gain(ctx, 0, filt(ctx, 'lowpass', p.cut ?? 2600, 1.5, out));
  const end = adsr(g.gain, t, 0.05, 0.2, 0.9, 0.15, dur, vel * (p.g ?? 0.07));
  const o = osc(ctx, 'square', f, g), o2 = osc(ctx, 'sawtooth', f * 1.003, gain(ctx, 0.6, g));
  for (const x of [o, o2]) {
    x.frequency.setValueAtTime(f * 0.75, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.25);
    lfo(ctx, x.detune, t, end, p.rate ?? 7, p.depth ?? 35);
    x.start(t); x.stop(end);
  }
};

const beep: InstFn = (ctx, out, t, m, dur, vel, p) => {
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', m ? mtof(m) : (p.f ?? 1400), g);
  const e = adsr(g.gain, t, 0.004, 0.02, 0.9, 0.02, Math.min(dur, 0.35), vel * (p.g ?? 0.1));
  o.start(t); o.stop(e);
};

// ============================================================ FX
const crackle: InstFn = (ctx, out, t, _m, dur, vel, p, r) => {
  const g = gain(ctx, 0, out);
  noise(ctx, 'crackle', t, t + dur + 0.1, filt(ctx, 'bandpass', 2400, 0.5, g), r);
  const hg = gain(ctx, 0, out);
  noise(ctx, 'pink', t, t + dur + 0.1, filt(ctx, 'bandpass', 5000, 0.6, hg), r);
  adsr(g.gain, t, 0.05, 0.1, 1, 0.05, dur, vel * (p.g ?? 0.6));
  adsr(hg.gain, t, 0.05, 0.1, 1, 0.05, dur, vel * 0.012);
};

const riser: InstFn = (ctx, out, t, _m, dur, vel, p, r) => {
  const d = Math.max(0.2, dur);
  const g = gain(ctx, 0, out);
  const bp = filt(ctx, 'bandpass', 400, 2.5, g);
  xramp(bp.frequency, t, [[0, 300], [d, p.top ?? 7000]]);
  noise(ctx, 'white', t, t + d + 0.05, bp, r);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (p.g ?? 0.18), t + d * 0.97); g.gain.linearRampToValueAtTime(0, t + d + 0.02);
  if (p.tone !== 0) {
    const tg = gain(ctx, 0, out);
    const o = osc(ctx, 'sawtooth', 110, filt(ctx, 'lowpass', 2500, 1, tg));
    xramp(o.frequency, t, [[0, 90], [d, 880]]);
    tg.gain.setValueAtTime(0, t); tg.gain.linearRampToValueAtTime(vel * 0.035, t + d * 0.97); tg.gain.linearRampToValueAtTime(0, t + d + 0.02);
    o.start(t); o.stop(t + d + 0.05);
  }
};

const downer: InstFn = (ctx, out, t, _m, dur, vel, _p, r) => {
  const d = Math.max(0.3, dur);
  const g = gain(ctx, 0, out);
  const bp = filt(ctx, 'bandpass', 4000, 1.5, g);
  xramp(bp.frequency, t, [[0, 5000], [d, 250]]);
  noise(ctx, 'white', t, t + d + 0.05, bp, r);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(vel * 0.001, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.01);
};

const impact: InstFn = (ctx, out, t, _m, _dur, vel, p, r) => {
  crash(ctx, out, t, 0, 0, vel * 0.9, { dec: 2.2, f: 2500 }, r);
  const g = gain(ctx, 0, out);
  const o = osc(ctx, 'sine', 70, shaper(ctx, satCurve(1.5), g));
  xramp(o.frequency, t, [[0, 90], [p.dec ?? 1.2, 32]]);
  const e = perc(g.gain, t, 0.002, p.dec ?? 1.2, vel * 0.7);
  o.start(t); o.stop(e);
  const ng = gain(ctx, 0, out);
  noise(ctx, 'brown', t, t + 0.6, filt(ctx, 'lowpass', 500, 0.7, ng), r);
  perc(ng.gain, t, 0.002, 0.45, vel * 0.5);
};

const rotor: InstFn = (ctx, out, t, _m, dur, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const chop = gain(ctx, 0, g);
  noise(ctx, 'brown', t, t + dur + 0.1, filt(ctx, 'lowpass', 500, 1, chop), r);
  const l = osc(ctx, 'square', p.rate ?? 11.5);
  const lg = gain(ctx, 0.5); l.connect(lg); lg.connect(chop.gain); chop.gain.value = 0.5;
  l.start(t); l.stop(t + dur + 0.1);
  adsr(g.gain, t, 0.3, 0.1, 1, 0.3, dur, vel * (p.g ?? 0.6));
};

const wind: InstFn = (ctx, out, t, _m, dur, vel, p, r) => {
  const g = gain(ctx, 0, out);
  const bp = filt(ctx, 'bandpass', 600, 1.4, g);
  lfo(ctx, bp.frequency, t, t + dur + 1.5, 0.23, 380);
  noise(ctx, 'pink', t, t + dur + 1.5, bp, r);
  adsr(g.gain, t, 0.8, 0.2, 1, 1.2, dur, vel * (p.g ?? 0.4));
};

const RAW: Record<string, InstFn> = {
  kick, snare, clap, hat, shaker, ride, crash, rim, clave, conga, tom, timpani, cowbell, clank, gong, brush, snap, tamb, tick, blip,
  sub, deep, acid, fmbass, upright, fretless, reese, synbass, rumble,
  rhodes, organ, harpsi, vibes, marimba, glock, pluck, nylon, pizz, piano,
  flute, clarinet, sax, brass, strings, pad, choir, vox, supersaw, lead, stab, siren, beep,
  crackle, riser, downer, impact, rotor, wind,
};
/**
 * Output calibration (linear) measured with the dev scene's instLevels(): brings single notes to consistent levels
 * (basses ~-20 dB RMS, leads ~-22, chord voices ~-27, kick peak ~-6 dBFS) without touching velocity-dependent timbre.
 */
const CAL: Record<string, number> = {
  kick: 0.66, snare: 0.6, conga: 1.2, tom: 0.7, timpani: 0.7, gong: 0.6, impact: 0.55,
  hat: 2.8, shaker: 5, rim: 3, clap: 2.0, brush: 4.4, tamb: 4, stab: 2.5, vox: 2, pluck: 2, tick: 4, ride: 1.4, clave: 2.5, cowbell: 2,
  glock: 3, supersaw: 1.6, blip: 3, snap: 1.6, crash: 1.5,
  sub: 0.4, deep: 0.4, fmbass: 0.5, upright: 0.33, fretless: 0.42, reese: 0.45, synbass: 0.4, acid: 0.85, rumble: 0.8,
  rhodes: 0.5, nylon: 0.5, vibes: 0.8, piano: 0.75, organ: 0.85, choir: 0.65, flute: 0.6, sax: 0.7, clarinet: 0.85,
  harpsi: 1.35, brass: 1.5, marimba: 1.6,
};
export const INSTRUMENTS: Record<string, InstFn> = {};
for (const [k, fn] of Object.entries(RAW)) {
  const c = CAL[k] ?? 1;
  INSTRUMENTS[k] = c === 1 ? fn : (ctx, out, t, m, d, v, p, r) => fn(ctx, gain(ctx, c, out), t, m, d, v, p, r);
}
/** Instruments that ignore pitch (drum-type parts). */
export const DRUM_INSTS = new Set(['kick', 'snare', 'clap', 'hat', 'shaker', 'ride', 'crash', 'rim', 'clave', 'conga', 'tom', 'cowbell', 'clank', 'gong', 'brush', 'snap', 'tamb', 'tick', 'crackle', 'riser', 'downer', 'impact', 'rotor', 'wind']);
