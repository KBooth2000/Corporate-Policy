// One-shot SFX building blocks used when pre-rendering into OfflineAudioContexts.
import { AC, ARng, gain, filt, osc, oscWave, noise, perc, adsr, shaper, satCurve, reverbIR, xramp, mtof } from './core';
import { INSTRUMENTS, IP } from './instruments';

type W = OscillatorType | PeriodicWave;
export interface ToneOpts { w?: W; f: number; f2?: number; glide?: number; t?: number; d: number; a?: number; v: number; to?: AudioNode; hold?: boolean; rel?: number; det?: number; vib?: [number, number]; lin?: boolean }
export interface NoiseOpts { k?: 'white' | 'pink' | 'brown' | 'crackle'; t?: number; d: number; a?: number; v: number; hp?: number; lp?: number; bp?: number; q?: number; f2?: number; to?: AudioNode; hold?: boolean; rel?: number; rate?: number; pk?: [number, number] }

/** Synth helper bound to one offline context. All times are seconds from the start of the sound. */
export class Syn {
  t0 = 0.002;
  constructor(public ctx: AC, public out: AudioNode, public r: ARng) {}

  g(v: number, to?: AudioNode): GainNode { return gain(this.ctx, v, to ?? this.out); }
  lp(f: number, q = 0.7, to?: AudioNode): BiquadFilterNode { return filt(this.ctx, 'lowpass', f, q, to ?? this.out); }
  hp(f: number, q = 0.7, to?: AudioNode): BiquadFilterNode { return filt(this.ctx, 'highpass', f, q, to ?? this.out); }
  bp(f: number, q = 1, to?: AudioNode): BiquadFilterNode { return filt(this.ctx, 'bandpass', f, q, to ?? this.out); }
  drive(k: number, post = 0.7, to?: AudioNode): WaveShaperNode { return shaper(this.ctx, satCurve(k), gain(this.ctx, post, to ?? this.out), '2x'); }
  /** Reverb send: returns an input node. */
  verb(size = 1.2, wet = 0.3, damp = 0.5, to?: AudioNode): GainNode {
    const c = this.ctx.createConvolver();
    c.normalize = false;
    c.buffer = reverbIR(this.ctx, size, damp, 0.008, 0.3);
    c.connect(gain(this.ctx, wet, to ?? this.out));
    return gain(this.ctx, 1, c);
  }
  /** Dry + reverb bus. */
  room(size = 1.0, wet = 0.25, damp = 0.5): GainNode {
    const inp = gain(this.ctx, 1, this.out);
    inp.connect(this.verb(size, wet, damp));
    return inp;
  }

  tone(o: ToneOpts): OscillatorNode {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, o.t ?? 0);
    const g = gain(ctx, 0, o.to ?? this.out);
    const w = o.w ?? 'sine';
    const x = typeof w === 'string' ? osc(ctx, w as OscillatorType, o.f, g, o.det ?? 0) : oscWave(ctx, w, o.f, g, o.det ?? 0);
    x.frequency.setValueAtTime(o.f, T);
    if (o.f2) {
      if (o.lin) x.frequency.linearRampToValueAtTime(o.f2, T + (o.glide ?? o.d));
      else x.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), T + (o.glide ?? o.d));
    }
    const end = o.hold ? adsr(g.gain, T, o.a ?? 0.004, 0.02, 1, o.rel ?? 0.03, o.d, o.v) : perc(g.gain, T, o.a ?? 0.002, o.d, o.v);
    if (o.vib) {
      const l = osc(ctx, 'sine', o.vib[0]); const lg = gain(ctx, o.vib[1]); l.connect(lg); lg.connect(x.detune); l.start(T); l.stop(end);
    }
    x.start(T); x.stop(end + 0.01);
    return x;
  }

  nz(o: NoiseOpts): GainNode {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, o.t ?? 0);
    const g = gain(ctx, 0, o.to ?? this.out);
    let head: AudioNode = g;
    let sweep: BiquadFilterNode | null = null;
    if (o.pk) head = filt(ctx, 'peaking', o.pk[0], 1.5, head, o.pk[1]);
    if (o.lp) { const f = filt(ctx, 'lowpass', o.lp, o.q ?? 0.7, head); head = f; if (o.f2 && !o.bp) sweep = f; }
    if (o.hp) head = filt(ctx, 'highpass', o.hp, o.bp || o.lp ? 0.7 : (o.q ?? 0.7), head);
    if (o.bp) { const f = filt(ctx, 'bandpass', o.bp, o.q ?? 1, head); head = f; if (o.f2) sweep = f; }
    if (sweep && o.f2) xramp(sweep.frequency, T, [[0, sweep.frequency.value], [o.d + (o.a ?? 0), o.f2]]);
    const end = o.hold ? adsr(g.gain, T, o.a ?? 0.004, 0.02, 1, o.rel ?? 0.04, o.d, o.v) : perc(g.gain, T, o.a ?? 0.002, o.d, o.v);
    noise(ctx, o.k ?? 'white', T, end + 0.01, head, this.r, o.rate ?? 1);
    return g;
  }

  /** Low sine "thump" with pitch drop. */
  thump(t: number, f0: number, f1: number, d: number, v: number, to?: AudioNode): void {
    this.tone({ f: f0, f2: f1, glide: Math.min(d, 0.12), t, d, v, to, a: 0.001 });
  }
  /** Inharmonic metallic ring. */
  ring(t: number, f: number, ratios: number[], d: number, v: number, to?: AudioNode): void {
    ratios.forEach((k, i) => this.tone({ f: f * k * this.r.vary(0.01), t, d: d / (1 + i * 0.35), v: v / (1 + i * 0.6), to }));
  }
  /** FM tone (carrier/modulator ratio, decaying index). */
  fm(t: number, f: number, ratio: number, idx: number, d: number, v: number, to?: AudioNode, f2?: number): void {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, t);
    const g = gain(ctx, 0, to ?? this.out);
    const c = osc(ctx, 'sine', f, g);
    const m = osc(ctx, 'sine', f * ratio);
    const mg = gain(ctx, 0); m.connect(mg); mg.connect(c.frequency);
    mg.gain.setValueAtTime(f * idx, T); mg.gain.exponentialRampToValueAtTime(f * idx * 0.05 + 0.1, T + d);
    if (f2) { c.frequency.setValueAtTime(f, T); c.frequency.exponentialRampToValueAtTime(f2, T + d); m.frequency.setValueAtTime(f * ratio, T); m.frequency.exponentialRampToValueAtTime(f2 * ratio, T + d); }
    const end = perc(g.gain, T, 0.001, d, v);
    c.start(T); c.stop(end); m.start(T); m.stop(end);
  }
  /** Burst of tiny random clicks/ticks (debris, crackle, glass grains). */
  grains(t: number, d: number, n: number, fLo: number, fHi: number, v: number, dec = 0.03, to?: AudioNode): void {
    for (let i = 0; i < n; i++) {
      const tt = t + Math.pow(this.r.next(), 1.6) * d;
      const f = this.r.range(fLo, fHi);
      this.tone({ f, t: tt, d: dec * this.r.range(0.5, 1.5), v: v * this.r.range(0.3, 1) * (1 - (tt - t) / (d * 1.3)), to, a: 0.0005 });
    }
  }
  /** Noise ticks (wood/plastic debris). */
  ticks(t: number, d: number, n: number, f: number, v: number, to?: AudioNode): void {
    for (let i = 0; i < n; i++) {
      const tt = t + this.r.next() * d;
      this.nz({ t: tt, d: this.r.range(0.008, 0.03), v: v * this.r.range(0.3, 1), bp: f * this.r.range(0.6, 1.6), q: 2, to });
    }
  }
  /** Whoosh: band-passed noise sweeping up then down. */
  whoosh(t: number, d: number, v: number, fLo = 400, fHi = 2500, to?: AudioNode): void {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, t);
    const g = gain(ctx, 0, to ?? this.out);
    const bp = filt(ctx, 'bandpass', fLo, 1.6, g);
    bp.frequency.setValueAtTime(fLo, T);
    bp.frequency.exponentialRampToValueAtTime(fHi, T + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(fLo * 0.8, T + d);
    g.gain.setValueAtTime(0, T);
    g.gain.linearRampToValueAtTime(v, T + d * 0.42);
    g.gain.exponentialRampToValueAtTime(v * 0.001, T + d);
    g.gain.linearRampToValueAtTime(0, T + d + 0.005);
    noise(ctx, 'pink', T, T + d + 0.02, bp, this.r);
  }
  /** Play a score instrument note (bells, brass, choir...) inside an SFX. */
  note(inst: string, t: number, midi: number, d: number, v: number, p: IP = {}, to?: AudioNode): void {
    INSTRUMENTS[inst]?.(this.ctx, to ?? this.out, this.t0 + t, midi, d, v, p, this.r);
  }
  beep(t: number, f: number, d: number, v: number, w: OscillatorType = 'square', to?: AudioNode): void {
    const lp = this.lp(f * 3, 0.7, to);
    this.tone({ w, f, t, d, v, hold: true, a: 0.003, rel: 0.012, to: lp });
  }
  /** Amplitude-chopped noise (rotors, motors, tape). */
  chopped(t: number, d: number, v: number, rate: number, lp: number, depth = 0.9, to?: AudioNode, k: 'white' | 'pink' | 'brown' = 'brown', w: OscillatorType = 'square'): GainNode {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, t);
    const env = gain(ctx, 0, to ?? this.out);
    const am = gain(ctx, 1 - depth / 2, env);
    const l = osc(ctx, w, rate); const lg = gain(ctx, depth / 2); l.connect(lg); lg.connect(am.gain);
    noise(ctx, k, T, T + d + 0.05, filt(ctx, 'lowpass', lp, 1, am), this.r);
    l.start(T); l.stop(T + d + 0.05);
    adsr(env.gain, T, 0.01, 0.02, 1, 0.03, d, v);
    return env;
  }
  /** Formant vocal blob (crowd, choir-ish, screams). */
  vowel(t: number, f0: number, d: number, v: number, vowel: [number, number, number], opts: { f0end?: number; vib?: number; breath?: number; a?: number; to?: AudioNode; rough?: number } = {}): void {
    const { ctx } = this;
    const T = this.t0 + Math.max(0, t);
    const env = gain(ctx, 0, opts.to ?? this.out);
    const sum = gain(ctx, 1);
    const fq = [[vowel[0], 1, 8], [vowel[1], 0.5, 10], [vowel[2], 0.22, 12]] as const;
    for (const [f, a, q] of fq) sum.connect(filt(ctx, 'bandpass', f, q, gain(ctx, a * 3, env)));
    const src = osc(ctx, 'sawtooth', f0, sum);
    src.frequency.setValueAtTime(f0, T);
    if (opts.f0end) src.frequency.exponentialRampToValueAtTime(opts.f0end, T + d);
    if (opts.vib) { const l = osc(ctx, 'sine', 5.5 + this.r.next()); const lg = gain(ctx, opts.vib); l.connect(lg); lg.connect(src.detune); l.start(T); l.stop(T + d + 0.2); }
    if (opts.rough) { const o2 = osc(ctx, 'sawtooth', f0 * 1.03, gain(ctx, opts.rough, sum)); o2.frequency.setValueAtTime(f0 * 1.03, T); if (opts.f0end) o2.frequency.exponentialRampToValueAtTime(opts.f0end * 1.03, T + d); o2.start(T); o2.stop(T + d + 0.2); }
    if (opts.breath) noise(ctx, 'white', T, T + d + 0.2, gain(ctx, opts.breath, sum), this.r);
    adsr(env.gain, T, opts.a ?? 0.05, 0.1, 0.8, 0.12, d, v);
    src.start(T); src.stop(T + d + 0.2);
  }
  midi = mtof;
}
