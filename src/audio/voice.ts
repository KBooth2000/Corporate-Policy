// Formant-synthesised gibberish vocalisations (spec 9.3 fallback: subtitled barks with short vocal grunts).
// Never real words: syllables are random consonant/vowel pairs. Per-individual timbre comes from the seed.
import type { VoiceKind } from './audio';
import { AC, ARng, VOWELS, gain, filt, osc, oscWave, noise, wave, reverbIR, clamp } from './core';

export interface VoiceProfile { female: boolean; f0: number; fs: number; breath: number; rough: number; rate: number; lilt: number }

export function voiceProfile(seed: number): VoiceProfile {
  const r = new ARng((seed * 2654435761) >>> 0);
  const female = r.chance(0.45);
  return {
    female,
    f0: female ? r.range(170, 245) : r.range(88, 138),
    fs: female ? r.range(1.1, 1.22) : r.range(0.9, 1.05),
    breath: r.range(0.02, 0.09),
    rough: r.range(0, 0.35),
    rate: r.range(0.85, 1.18),
    lilt: r.range(0.7, 1.4), // how sing-song the intonation is
  };
}

type Cons = 'p' | 't' | 'k' | 'b' | 'd' | 'g' | 's' | 'sh' | 'f' | 'h' | 'z' | 'v' | 'm' | 'n' | 'l' | 'r' | 'w' | 'y' | '';
const PLOS: Record<string, number> = { p: 900, t: 4200, k: 2300, b: 800, d: 3600, g: 1900 };
const FRIC: Record<string, [number, number, number]> = { s: [6500, 2.5, 0.55], sh: [3200, 1.6, 0.5], f: [5500, 0.5, 0.18], z: [6000, 2.5, 0.35], v: [4500, 0.6, 0.12] };
const LIQ: Record<string, [number, number, number]> = { l: [360, 1300, 2700], r: [420, 1150, 1650], w: [300, 700, 2300], y: [280, 2200, 2950], m: [280, 1000, 2400], n: [280, 1500, 2500] };
const ONSETS: Cons[] = ['p', 't', 'k', 'b', 'd', 'g', 's', 'sh', 'f', 'h', 'm', 'n', 'l', 'r', 'w', 'y', 'v', 'z', '', '', 'b', 'd', 'n', 'm'];
const VOWEL_KEYS = ['a', 'e', 'i', 'o', 'u', 'ae', 'uh', 'er'] as const;
type VK = (typeof VOWEL_KEYS)[number];
const CODAS: Cons[] = ['', '', '', '', 'n', 'm', 's', 't', 'k', 'sh', 'l'];

interface Syl { c: Cons; v: VK; coda: Cons; dur: number; f0a: number; f0b: number; amp: number }

/** The synthesis rig: glottal sources -> parallel formant bank -> amp; plus a fricative noise path. */
class Rig {
  srcs: OscillatorNode[] = [];
  F: BiquadFilterNode[] = [];
  amp: GainNode; asp: GainNode; fric: GainNode; fricF: BiquadFilterNode;
  constructor(public ctx: AC, dest: AudioNode, public t: number, public end: number, public p: VoiceProfile, f0s: number[]) {
    const out = gain(ctx, 1, filt(ctx, 'highpass', p.female ? 140 : 80, 0.7, filt(ctx, 'lowpass', 6500, 0.7, dest)));
    this.amp = gain(ctx, 0, out);
    const bank = gain(ctx, 1);
    const fa = [1, 0.55, 0.28];
    const fq = [7, 9, 11];
    for (let i = 0; i < 3; i++) {
      const f = filt(ctx, 'bandpass', 500 * (i + 1), fq[i], gain(ctx, fa[i] * 3.2, this.amp));
      bank.connect(f);
      this.F.push(f);
    }
    const glottal = wave(ctx, 'glottal', 48, (h) => 1 / Math.pow(h, 1.35));
    const srcMix = gain(ctx, 1 / Math.sqrt(f0s.length), bank);
    f0s.forEach((f0, i) => {
      const o = oscWave(ctx, glottal, f0, srcMix);
      if (i === 0 && p.rough > 0.05) {
        // roughness: slightly detuned partner source
        const o2 = oscWave(ctx, glottal, f0 * 1.025, gain(ctx, p.rough * 0.6, srcMix));
        this.srcs.push(o2);
      }
      this.srcs.push(o);
    });
    // jitter/vibrato
    const vib = osc(ctx, 'sine', 5.3 + p.rate);
    const vg = gain(ctx, 9);
    vib.connect(vg);
    for (const o of this.srcs) vg.connect(o.detune);
    vib.start(t); vib.stop(end + 0.1);
    // aspiration through the formants
    this.asp = gain(ctx, p.breath, bank);
    noise(ctx, 'white', t, end + 0.1, this.asp);
    // fricatives bypass the formants
    this.fric = gain(ctx, 0, out);
    this.fricF = filt(ctx, 'bandpass', 5000, 2, this.fric);
    noise(ctx, 'white', t, end + 0.1, this.fricF);
    for (const o of this.srcs) { o.start(t); o.stop(end + 0.1); }
  }
  /** Set the pitch of every source (ratio to their base), gliding from a to b over [t0,t1]. */
  pitch(t0: number, t1: number, ra: number, rb: number, base: number[]): void {
    let k = 0;
    for (let i = 0; i < this.srcs.length; i++) {
      const o = this.srcs[i];
      const b = base[Math.min(k, base.length - 1)] * (o.frequency.value / (base[Math.min(k, base.length - 1)] || 1) > 1.01 ? 1.025 : 1);
      o.frequency.setValueAtTime(b * ra, t0);
      o.frequency.linearRampToValueAtTime(b * rb, t1);
      if (!(o.frequency.value > base[Math.min(k, base.length - 1)] * 1.01)) k++;
    }
  }
  formants(t: number, f: [number, number, number], tc = 0.018): void {
    for (let i = 0; i < 3; i++) this.F[i].frequency.setTargetAtTime(f[i] * this.p.fs, t, tc);
  }
  level(t: number, v: number, tc = 0.012): void { this.amp.gain.setTargetAtTime(v, t, tc); }
  hiss(t: number, d: number, f: number, q: number, v: number): void {
    this.fricF.frequency.setValueAtTime(f, t); this.fricF.Q.setValueAtTime(q, t);
    this.fric.gain.setTargetAtTime(v, t, 0.008);
    this.fric.gain.setTargetAtTime(0, t + d, 0.01);
  }
  breathe(t: number, d: number, v: number): void {
    this.asp.gain.setTargetAtTime(v, t, 0.01);
    this.asp.gain.setTargetAtTime(this.p.breath, t + d, 0.02);
  }
}

function vowelF(v: VK): [number, number, number] { const x = VOWELS[v]; return [x[0], x[1], x[2]]; }

function speakSyllables(rig: Rig, syls: Syl[], t: number, base: number[], loud: number): number {
  let tt = t;
  for (const s of syls) {
    const cd = s.c ? Math.min(0.07, s.dur * 0.35) : 0;
    const vt = tt + cd;
    const vEnd = tt + s.dur;
    const vf = vowelF(s.v);
    // onset
    if (s.c in PLOS) {
      rig.level(tt, 0, 0.006);
      rig.hiss(tt + cd * 0.7, 0.012, PLOS[s.c], 1.2, 0.35 * loud);
      rig.formants(tt, vf, 0.01);
    } else if (s.c in FRIC) {
      const [f, q, v] = FRIC[s.c];
      rig.level(tt, s.c === 'z' || s.c === 'v' ? 0.25 * loud : 0, 0.008);
      rig.hiss(tt, cd, f, q, v * loud);
      rig.formants(tt, vf, 0.01);
    } else if (s.c === 'h') {
      rig.level(tt, 0.05, 0.008);
      rig.breathe(tt, cd, 0.9 * loud);
      rig.formants(tt, vf, 0.01);
    } else if (s.c in LIQ) {
      rig.formants(tt, LIQ[s.c], 0.008);
      rig.level(tt, (s.c === 'm' || s.c === 'n' ? 0.35 : 0.6) * s.amp * loud, 0.01);
    }
    // vowel nucleus
    rig.formants(vt, vf, 0.02);
    rig.level(vt, s.amp * loud, 0.012);
    rig.pitch(tt, vEnd, s.f0a, s.f0b, base);
    // coda
    if (s.coda) {
      const ct = vEnd - Math.min(0.06, s.dur * 0.3);
      if (s.coda in PLOS) { rig.level(ct, 0, 0.006); rig.hiss(ct + 0.03, 0.01, PLOS[s.coda], 1.2, 0.25 * loud); }
      else if (s.coda in FRIC) { rig.level(ct, 0.05, 0.01); const [f, q, v] = FRIC[s.coda]; rig.hiss(ct, vEnd - ct, f, q, v * loud * 0.8); }
      else if (s.coda in LIQ) { rig.formants(ct, LIQ[s.coda], 0.015); rig.level(ct, 0.35 * loud, 0.015); }
    }
    tt = vEnd;
  }
  rig.level(tt, 0, 0.02);
  return tt;
}

/** UK-ish sing-song: alternating rises on stressed syllables, declination, final fall (or a cheeky rise). */
function barkSyls(r: ARng, p: VoiceProfile, n: number): Syl[] {
  const out: Syl[] = [];
  const stressAt = r.int(0, Math.min(2, n - 1));
  const question = r.chance(0.22);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const stressed = i === stressAt || (i > stressAt && (i - stressAt) % 2 === 0 && r.chance(0.6));
    const dec = -2.2 * (i / Math.max(1, n - 1));
    let st = dec + (stressed ? 4.5 : r.range(-0.5, 2)) * p.lilt;
    if (last) st = question ? st + 3 : dec - 1;
    const end = last ? (question ? st + 4 * p.lilt : st - 4.5 * p.lilt) : st + r.range(-1.2, 0.8);
    const dur = (r.range(0.1, 0.16) * (stressed ? 1.3 : 1) * (last ? 1.45 : 1)) / p.rate;
    out.push({ c: r.pick(ONSETS), v: r.pick(VOWEL_KEYS), coda: last || r.chance(0.3) ? r.pick(CODAS) : '', dur, f0a: Math.pow(2, (prev * 0.3 + st * 0.7) / 12), f0b: Math.pow(2, end / 12), amp: stressed ? 1 : 0.78 });
    prev = end;
  }
  return out;
}

/**
 * Speak one vocalisation. Returns the end time. All nodes are created on `ctx` (realtime or offline).
 */
export function speak(ctx: AC, dest: AudioNode, t: number, seed: number, kind: VoiceKind, uttSeed: number, opts: { syllables?: number; bpm?: number } = {}): number {
  const p = voiceProfile(seed);
  const r = new ARng((uttSeed ^ (seed * 7919)) >>> 0);
  const f0 = p.f0;
  let syls: Syl[] = [];
  let voices = [f0];
  let loud = 0.55;
  let wet = 0;
  let dst: AudioNode = dest;
  switch (kind) {
    case 'bark': syls = barkSyls(r, p, clamp(opts.syllables ?? r.int(3, 6), 1, 12)); break;
    case 'pain': {
      const d = r.range(0.22, 0.38);
      syls = [{ c: r.pick(['', '', 'h'] as Cons[]), v: r.pick(['a', 'uh', 'ae', 'er'] as VK[]), coda: r.pick(['', '', 'k', 'h'] as Cons[]), dur: d, f0a: r.range(1.5, 1.9), f0b: r.range(1.0, 1.2), amp: 1 }];
      p.rough = Math.max(p.rough, 0.4); p.breath = Math.max(p.breath, 0.12); loud = 0.5;
      break;
    }
    case 'death': {
      syls = [
        { c: '', v: r.pick(['a', 'ae', 'o'] as VK[]), coda: '', dur: r.range(0.4, 0.6), f0a: 1.45, f0b: 0.85, amp: 1 },
        { c: 'h', v: 'uh', coda: '', dur: r.range(0.35, 0.5), f0a: 0.8, f0b: 0.55, amp: 0.55 },
      ];
      p.rough = Math.max(p.rough, 0.45); p.breath = Math.max(p.breath, 0.15); loud = 0.45;
      break;
    }
    case 'effort': syls = [{ c: r.pick(['h', 'h', ''] as Cons[]), v: r.pick(['uh', 'u', 'a'] as VK[]), coda: r.pick(['p', 'k', ''] as Cons[]), dur: r.range(0.12, 0.18), f0a: 1.25, f0b: 1.1, amp: 1 }]; loud = 0.65; break;
    case 'laugh': {
      const n = r.int(4, 7);
      const v = r.pick(['a', 'e', 'ae'] as VK[]);
      for (let i = 0; i < n; i++) { const k = Math.pow(2, (6 - i * 0.7) / 12) * p.lilt * 0.9 + 0.1; syls.push({ c: 'h', v, coda: '', dur: r.range(0.1, 0.13), f0a: k, f0b: k * 0.94, amp: 1 - i * 0.08 }); }
      p.breath = Math.max(p.breath, 0.1);
      break;
    }
    case 'gasp': {
      syls = [{ c: 'h', v: 'a', coda: '', dur: r.range(0.3, 0.42), f0a: 1.3, f0b: 1.5, amp: 0.3 }];
      p.breath = 1.6; loud = 1.4;
      break;
    }
    case 'chant': {
      // several voices in unison/octaves, rhythmic on the music beat
      const beat = 60 / (opts.bpm ?? 120);
      voices = [f0, f0 * 1.012, f0 * 0.993, (p.female ? f0 / 2 : f0 * 2) * 1.004, f0 * 1.5 > 400 ? f0 * 0.75 : f0 * 1.498];
      const phrase: Syl[] = [];
      const pitches = [0, 0, 2, -3];
      for (let i = 0; i < 4; i++) phrase.push({ c: r.pick(['k', 't', 'd', 's', 'n', 'b'] as Cons[]), v: r.pick(['o', 'a', 'e', 'i'] as VK[]), coda: i === 3 ? 'n' : '', dur: beat * (i === 3 ? 1.6 : 0.95), f0a: Math.pow(2, pitches[i] / 12), f0b: Math.pow(2, pitches[i] / 12), amp: i === 0 ? 1 : 0.85 });
      syls = phrase.concat(phrase.map((s) => ({ ...s })));
      wet = 0.25; loud = 0.38;
      break;
    }
    case 'speech': {
      // CEO motivational murmur over a PA: several phrases with pauses
      const n = r.int(3, 4);
      for (let k = 0; k < n; k++) {
        const ph = barkSyls(r, { ...p, lilt: 0.8, rate: p.rate * 1.1 }, r.int(5, 9));
        syls.push(...ph);
        syls.push({ c: '', v: 'uh', coda: '', dur: r.range(0.22, 0.38), f0a: 1, f0b: 1, amp: 0 });
      }
      wet = 0.22; loud = 0.5;
      dst = filt(ctx, 'highpass', 220, 0.8, filt(ctx, 'lowpass', 4200, 0.8, filt(ctx, 'peaking', 2200, 1, dest, 4)));
      break;
    }
  }
  const total = syls.reduce((a, s) => a + s.dur, 0) + 0.25;
  let out: AudioNode = dst;
  if (wet > 0) {
    const mix = gain(ctx, 1, dst);
    const c = ctx.createConvolver();
    c.normalize = false;
    c.buffer = reverbIR(ctx, 1.2, 0.5, 0.01, 0.3);
    mix.connect(c); c.connect(gain(ctx, wet, dst));
    out = mix;
  }
  const rig = new Rig(ctx, out, t, t + total + 0.3, p, voices);
  rig.level(t, 0, 0.001);
  const end = speakSyllables(rig, syls, t + 0.01, voices, loud);
  if (kind === 'gasp' || kind === 'death' || kind === 'laugh') rig.breathe(t, end - t, kind === 'gasp' ? 0.7 : 0.25);
  return end + 0.15;
}
