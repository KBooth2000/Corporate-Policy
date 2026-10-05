// Pattern compiler + lookahead music player with vertical layering.
// Tracks are pure data (see ./tracks/*). A Player renders one track into any BaseAudioContext, so the same code
// drives the live game (pumped by a timer ~120 ms ahead of AudioContext time) and offline QA renders.
import type { MusicTrack } from './audio';
import { AC, ARng, gain, filt, shaper, satCurve, reverbIR, noteToMidi, freshSeed, panner } from './core';
import { INSTRUMENTS, DRUM_INSTS, IP } from './instruments';
import { Chord, parseChord, transposeChord, degree, voice, bassNote } from './theory';

export type Stem = 'drums' | 'bass' | 'chords' | 'lead' | 'fx';
/** d = drum steps, b = chord-relative bass steps, c = chord comp steps, a = arpeggio (voicing index) steps, m = melody tokens. */
export type PartKind = 'd' | 'b' | 'c' | 'a' | 'm';

export interface PartDef {
  i: string;                    // instrument name (instruments.ts)
  k: PartKind;
  p: string | Record<string, string>;
  /** Order of pattern keys (char mode 'AABA' or token mode 'A*3 B _*4'); '_' is a silent bar. Default: 'A'. */
  o?: string;
  s?: Stem;
  /** Arrangement: x = exploration (muzak), c = combat, a = always. */
  on?: 'x' | 'c' | 'a';
  /** 1 = only while raging, 2 = only while not raging. */
  rage?: 0 | 1 | 2;
  /** Minimum / maximum boss phase. */
  ph?: number; phMax?: number;
  /** First bar (absolute) the part may play. */
  from?: number;
  /** Melody/arp octave shift (semitones via tr), comp centre MIDI, bass low MIDI bound. */
  oct?: number; tr?: number;
  v?: number; pan?: number; rv?: number; dl?: number;
  x?: IP;
  hum?: number;
  voices?: number; rootless?: boolean; spread?: boolean;
  /** Fixed MIDI note for drum-type parts that take pitch (e.g. timpani) */
  note?: number;
  /** Legato multiplier for note lengths. */
  leg?: number;
}

export interface TrackDef {
  id: MusicTrack;
  title: string;
  combatTitle?: string;
  bpm: number;
  swing?: number;
  key: string;
  desc: string;
  prog: string;
  parts: PartDef[];
  phaseBpm?: [number, number, number];
  phaseTr?: [number, number, number];
  phaseCut?: [number, number, number];
  exploreFx?: 'phone';
  fx?: 'lofi';
  rv?: { size: number; damp: number; wet?: number };
  delay?: { beats: number; fb: number; wet?: number };
  gain?: number;
  /** Disable the generic rage layer (heavy kick + grit bass). */
  noRage?: boolean;
  /** Level of the exploration (muzak) bus relative to combat; default 0.75. */
  xGain?: number;
  /** Low MIDI bound for the generic rage bass. */
  rageLow?: number;
}

// ---------------------------------------------------------------- compiled data
export interface Ev { st: number; d: number; v: number; n: number; ns?: number[]; deg?: string }
interface CPart { def: PartDef; bars: Ev[][]; stem: Stem; isKick: boolean }
interface CTrack { def: TrackDef; parts: CPart[]; prog: { at: number; c: Chord }[][]; hasCombat: boolean; hasExplore: boolean; warnings: string[] }

const VEL: Record<string, number> = { X: 1, x: 0.82, o: 0.6, g: 0.36 };
const BASS_DEG = 'RrTO o35724 6LbAaDm'.replace(/ /g, '');

function clean(s: string): string { return s.replace(/[\s|]/g, ''); }

function parseSteps(s: string, kind: PartKind): { evs: Ev[]; steps: number } {
  const c = clean(s);
  const evs: Ev[] = [];
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '.' || ch === '-') continue;
    let d = 1;
    while (c[i + d] === '-') d++;
    if (kind === 'b') {
      if (!BASS_DEG.includes(ch)) throw new Error(`bad bass char '${ch}' in ${s}`);
      evs.push({ st: i, d, v: ch === 'r' || ch === 'o' ? 0.55 : 0.88, n: 0, deg: ch });
    } else if (kind === 'a') {
      const idx = '0123456789'.indexOf(ch);
      if (idx < 0) throw new Error(`bad arp char '${ch}' in ${s}`);
      evs.push({ st: i, d, v: 0.8, n: idx });
    } else {
      const v = VEL[ch];
      if (v === undefined) throw new Error(`bad step char '${ch}' in ${s}`);
      evs.push({ st: i, d, v, n: 0 });
    }
  }
  return { evs, steps: c.length };
}

function parseMel(s: string, warn: (m: string) => void): { evs: Ev[]; steps: number } {
  const evs: Ev[] = [];
  let pos = 0, lastDur = 4;
  for (const tok of s.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') { if (Math.abs(pos - Math.round(pos / 16) * 16) > 1e-6) warn(`bar line at step ${pos.toFixed(2)} in melody '${s.slice(0, 40)}…'`); continue; }
    let t = tok, v = 0.85;
    if (t.endsWith('!')) { v = 1; t = t.slice(0, -1); } else if (t.endsWith('?')) { v = 0.6; t = t.slice(0, -1); }
    const [nm, ds] = t.split(':');
    let dur = lastDur;
    if (ds) { dur = ds.endsWith('t') ? parseFloat(ds) * 2 / 3 : parseFloat(ds); if (!(dur > 0)) throw new Error(`bad duration in ${tok}`); lastDur = dur; }
    if (nm !== 'r') {
      const ns = nm.split('+').map((x) => noteToMidi(x));
      if (ns.some((x) => isNaN(x))) throw new Error(`bad note '${nm}' in melody`);
      evs.push({ st: pos, d: dur, v, n: ns[0], ns: ns.length > 1 ? ns : undefined });
    }
    pos += dur;
  }
  return { evs, steps: pos };
}

function expandOrder(o: string): string[] {
  if (/[\s*]/.test(o)) {
    const out: string[] = [];
    for (const tok of o.trim().split(/\s+/)) {
      const [k, n] = tok.split('*');
      for (let i = 0; i < (n ? parseInt(n, 10) : 1); i++) out.push(k);
    }
    return out;
  }
  return o.split('');
}

function compilePart(def: PartDef, warn: (m: string) => void): CPart {
  const pats = typeof def.p === 'string' ? { A: def.p } : def.p;
  const parsed = new Map<string, Ev[][]>();
  for (const [k, s] of Object.entries(pats)) {
    const r = def.k === 'm' ? parseMel(s, warn) : parseSteps(s, def.k);
    const nb = Math.max(1, Math.ceil(r.steps / 16 - 1e-6));
    if (def.k !== 'm' && r.steps % 16 !== 0) warn(`pattern ${def.i}/${k} has ${r.steps} steps (not a multiple of 16)`);
    if (def.k === 'm' && Math.abs(r.steps - nb * 16) > 1e-6) warn(`melody ${def.i}/${k} is ${r.steps} steps (not whole bars)`);
    const bars: Ev[][] = Array.from({ length: nb }, () => []);
    for (const e of r.evs) { const b = Math.floor(e.st / 16 + 1e-9); bars[b].push({ ...e, st: e.st - b * 16 }); }
    parsed.set(k, bars);
  }
  const bars: Ev[][] = [];
  for (const k of expandOrder(def.o ?? 'A')) {
    if (k === '_') { bars.push([]); continue; }
    const b = parsed.get(k);
    if (!b) { warn(`order key '${k}' missing in part ${def.i}`); continue; }
    bars.push(...b);
  }
  const stem: Stem = def.s ?? (DRUM_INSTS.has(def.i) ? 'drums' : def.k === 'b' ? 'bass' : def.k === 'm' ? 'lead' : 'chords');
  if (!INSTRUMENTS[def.i]) warn(`unknown instrument ${def.i}`);
  return { def, bars: bars.length ? bars : [[]], stem, isKick: def.i === 'kick' };
}

function parseProg(s: string): { at: number; c: Chord }[][] {
  return s.split('|').map((b) => b.trim()).filter((b) => b.length).map((b) => {
    const cs = b.split(',').map((x) => x.trim()).filter(Boolean);
    return cs.map((sym, i) => ({ at: Math.round((i * 16) / cs.length), c: parseChord(sym) }));
  });
}

const RAGE_PARTS = (low: number): PartDef[] => [
  { i: 'kick', k: 'd', p: 'X...X...X...X...', rage: 1, s: 'fx', v: 0.85, x: { f: 47, dec: 0.5, drive: 4, sub: 0.45, click: 0.9, post: 0.6 } },
  { i: 'reese', k: 'b', p: '..R-..R-..R-..O-', rage: 1, s: 'fx', oct: low, v: 0.5, x: { cut: 900, drive: 2.5, g: 0.22 } },
  { i: 'hat', k: 'd', p: 'gxgxgxgxgxgxgxgX', rage: 1, s: 'fx', v: 0.55, pan: 0.2, x: { dec: 0.03 } },
];

const compiled = new Map<TrackDef, CTrack>();
export function compileTrack(def: TrackDef): CTrack {
  const have = compiled.get(def);
  if (have) return have;
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(`[${def.id}] ${m}`);
  const defs = def.noRage ? def.parts : def.parts.concat(RAGE_PARTS(def.rageLow ?? 33));
  const parts = defs.map((p) => compilePart(p, warn));
  const t: CTrack = {
    def, parts, prog: parseProg(def.prog), warnings,
    hasCombat: def.parts.some((p) => p.on === 'c'), hasExplore: def.parts.some((p) => p.on === 'x'),
  };
  for (const w of warnings) console.warn('[audio]', w);
  compiled.set(def, t);
  return t;
}

// ---------------------------------------------------------------- player
interface State { combat: boolean; rage: boolean; phase: number }
interface PartRt { cp: CPart; inp: GainNode; prevVoicing?: number[]; voicingKey?: string; voicing?: number[] }

export class Player {
  readonly ctx: AC;
  readonly out: GainNode;
  readonly t: CTrack;
  private pre: GainNode;
  private rageLP: BiquadFilterNode;
  private toneLP: BiquadFilterNode | null = null;
  private xBus: GainNode; private cBus: GainNode; private aBus: GainNode;
  private xLP: BiquadFilterNode;
  private rvIn: GainNode; private dlIn: GainNode;
  private rt: PartRt[] = [];
  private rng = new ARng(freshSeed());
  want: State = { combat: false, rage: false, phase: 1 };
  cur: State = { combat: false, rage: false, phase: 1 };
  bar = 0; step = 0;
  nextStepTime = 0;
  barStart = 0;
  bpm: number;
  private stepDur: number;
  private started = false;
  private markers: { t: number; bar: number; bpm: number }[] = [];
  private pendingRiser: GainNode | null = null;
  realtime = true;
  stopped = false;
  stopAt = Infinity;

  constructor(ctx: AC, dest: AudioNode, def: TrackDef, partFilter?: (d: PartDef, i: number) => boolean) {
    this.ctx = ctx;
    this.t = compileTrack(def);
    this.bpm = def.bpm;
    this.stepDur = 60 / this.bpm / 4;
    this.out = gain(ctx, def.gain ?? 1, dest);
    this.rageLP = filt(ctx, 'lowpass', 20000, 0.7, this.out);
    let preDest: AudioNode = this.rageLP;
    if (def.phaseCut) { this.toneLP = filt(ctx, 'lowpass', def.phaseCut[0], 0.9, this.rageLP); preDest = this.toneLP; }
    if (def.fx === 'lofi') {
      // gentle tape/vinyl colour: low shelf warmth, rolled-off highs, soft saturation
      const sh = shaper(ctx, satCurve(1.3), gain(ctx, 0.85, preDest));
      preDest = filt(ctx, 'lowpass', 6500, 0.6, filt(ctx, 'lowshelf', 180, 0.7, sh, 3));
    }
    this.pre = gain(ctx, 1, preDest);
    this.aBus = gain(ctx, 1, this.pre);
    this.cBus = gain(ctx, 0, this.pre);
    this.xLP = filt(ctx, 'lowpass', 20000, 0.8, this.pre);
    let xDest: AudioNode = this.xLP;
    if (def.exploreFx === 'phone') {
      // band-limited "phone line": 350 Hz – 3.2 kHz, presence bump, slight grit
      const g = gain(ctx, 1.25, this.xLP);
      const sh = shaper(ctx, satCurve(1.8), g);
      const pk = filt(ctx, 'peaking', 1700, 1, sh, 5);
      xDest = filt(ctx, 'highpass', 380, 0.9, filt(ctx, 'highpass', 330, 0.7, filt(ctx, 'lowpass', 3200, 0.9, filt(ctx, 'lowpass', 3400, 0.7, pk))));
    }
    this.xBus = gain(ctx, 1, xDest);
    // shared reverb + tempo delay
    const rv = def.rv ?? { size: 2.2, damp: 0.5 };
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = reverbIR(ctx, rv.size, rv.damp);
    this.rvIn = gain(ctx, 1, conv);
    conv.connect(gain(ctx, rv.wet ?? 0.35, this.pre));
    const dl = def.delay ?? { beats: 0.75, fb: 0.35 };
    const delay = ctx.createDelay(4);
    delay.delayTime.value = (60 / def.bpm) * dl.beats;
    const fbLP = filt(ctx, 'lowpass', 3200, 0.7);
    const fbHP = filt(ctx, 'highpass', 300, 0.7, fbLP);
    const fb = gain(ctx, dl.fb, fbHP);
    delay.connect(fb); fbLP.connect(delay);
    this.dlIn = gain(ctx, 1, delay);
    const dOut = gain(ctx, dl.wet ?? 0.5, this.pre);
    delay.connect(dOut);
    delay.connect(gain(ctx, 0.2, this.rvIn));
    this.t.parts.forEach((cp, idx) => {
      if (partFilter && !partFilter(cp.def, idx)) return;
      const d = cp.def;
      const bus = d.on === 'x' ? this.xBus : d.on === 'c' ? this.cBus : this.aBus;
      const inp = gain(ctx, d.v ?? 1);
      inp.connect(d.pan ? panner(ctx, d.pan, bus) : bus);
      if (d.rv) inp.connect(gain(ctx, d.rv, this.rvIn));
      if (d.dl) inp.connect(gain(ctx, d.dl, this.dlIn));
      this.rt.push({ cp, inp });
    });
  }

  /** Start at absolute context time t (bar `bar`). */
  start(t: number, startBar = 0): void {
    this.nextStepTime = t;
    this.bar = startBar; this.step = 0;
    this.cur = { ...this.want };
    this.cBus.gain.setValueAtTime(this.cur.combat ? 1 : 0, t);
    this.xBus.gain.setValueAtTime(this.cur.combat && this.t.hasCombat ? 0 : this.xLevel, t);
    this.started = true;
    this.applyPhaseTone(t, this.cur.phase, true);
  }

  get xLevel(): number { return this.t.hasCombat ? (this.t.def.xGain ?? 0.75) : 1; }
  get barDur(): number { return this.stepDur * 16; }
  /** Context time of the next bar line whose state has not been latched yet. */
  nextLatch(): number { return this.step === 0 ? this.nextStepTime : this.barStart + this.barDur; }

  setCombat(on: boolean, now = this.ctx.currentTime): void {
    if (this.want.combat === on) return;
    this.want.combat = on;
    if (!this.started || !this.t.hasCombat) return;
    const T = this.nextLatch();
    const lead = T - now;
    if (on && !this.cur.combat) {
      // anticipation: muzak gets sucked into a filter while a riser fills the gap to the drop
      if (lead > 0.25) {
        const rg = gain(this.ctx, 1, this.aBus);
        INSTRUMENTS.riser(this.ctx, rg, now + 0.01, 0, lead - 0.02, 0.9, { g: 0.16 }, this.rng);
        this.pendingRiser = rg;
        const f = this.xLP.frequency;
        f.cancelScheduledValues(now); f.setValueAtTime(20000, now); f.exponentialRampToValueAtTime(700, T);
      }
    } else if (!on && this.pendingRiser) {
      this.pendingRiser.gain.setTargetAtTime(0, now, 0.03); this.pendingRiser = null;
      const f = this.xLP.frequency; f.cancelScheduledValues(now); f.setTargetAtTime(20000, now, 0.05);
    }
  }

  setRage(on: boolean, now = this.ctx.currentTime): void {
    if (this.want.rage === on) return;
    this.want.rage = on;
    if (!this.started || this.t.def.noRage) return;
    const f = this.rageLP.frequency, q = this.rageLP.Q, bd = this.barDur;
    f.cancelScheduledValues(now); q.cancelScheduledValues(now);
    if (on) {
      // resonant sweep up from a choked low-pass over one bar
      f.setValueAtTime(220, now); f.exponentialRampToValueAtTime(19000, now + bd);
      q.setValueAtTime(7, now); q.linearRampToValueAtTime(7, now + bd * 0.7); q.linearRampToValueAtTime(0.7, now + bd);
    } else {
      f.setValueAtTime(19000, now); f.exponentialRampToValueAtTime(500, now + bd * 0.25); f.exponentialRampToValueAtTime(20000, now + bd * 0.75);
      q.setValueAtTime(3, now); q.linearRampToValueAtTime(0.7, now + bd * 0.75);
    }
  }

  setPhase(p: number): void { this.want.phase = Math.max(1, Math.min(3, Math.round(p))); }

  private applyPhaseTone(t: number, phase: number, instant = false): void {
    const pc = this.t.def.phaseCut;
    if (!pc || !this.toneLP) return;
    const v = pc[phase - 1];
    if (instant) this.toneLP.frequency.setValueAtTime(v, t);
    else { this.toneLP.frequency.setValueAtTime(this.toneLP.frequency.value || pc[0], t); this.toneLP.frequency.exponentialRampToValueAtTime(v, t + this.barDur); }
  }

  /** Latch requested state at a bar line. */
  private latch(T: number): void {
    const prev = this.cur;
    const next: State = { ...this.want };
    const def = this.t.def;
    if (next.phase !== prev.phase || this.markers.length === 0) {
      const mult = def.phaseBpm ? def.phaseBpm[next.phase - 1] : 1;
      this.bpm = def.bpm * mult;
      this.stepDur = 60 / this.bpm / 4;
    }
    if (this.t.hasCombat && next.combat !== prev.combat) {
      if (next.combat) {
        this.xBus.gain.setTargetAtTime(0, T, 0.025);
        this.cBus.gain.cancelScheduledValues(T); this.cBus.gain.setValueAtTime(0, T); this.cBus.gain.linearRampToValueAtTime(1, T + 0.004);
        INSTRUMENTS.impact(this.ctx, this.aBus, T, 0, 0, 0.75, { dec: 1 }, this.rng);
        this.xLP.frequency.setValueAtTime(700, T + 0.2); this.xLP.frequency.setValueAtTime(20000, T + 0.25);
        this.pendingRiser = null;
      } else {
        this.cBus.gain.setTargetAtTime(0, T, 0.05);
        this.xBus.gain.cancelScheduledValues(T); this.xBus.gain.setValueAtTime(0, T); this.xBus.gain.linearRampToValueAtTime(this.xLevel, T + 0.01);
        INSTRUMENTS.downer(this.ctx, this.aBus, T, 0, this.barDur * 0.5, 0.7, {}, this.rng);
      }
    }
    if (next.phase !== prev.phase) {
      INSTRUMENTS.impact(this.ctx, this.aBus, T, 0, 0, 0.9, { dec: 1.5 }, this.rng);
      this.applyPhaseTone(T, next.phase);
    }
    this.cur = next;
    this.barStart = T;
    this.markers.push({ t: T, bar: this.bar, bpm: this.bpm });
    if (this.markers.length > 8) this.markers.shift();
  }

  private active(cp: CPart, s: State): boolean {
    const d = cp.def;
    if (this.t.hasCombat) {
      if (d.on === 'x' && s.combat) return false;
      if (d.on === 'c' && !s.combat) return false;
    }
    if (d.rage === 1 && !s.rage) return false;
    if (d.rage === 2 && s.rage) return false;
    if (d.ph && s.phase < d.ph) return false;
    if (d.phMax && s.phase > d.phMax) return false;
    if (d.from && this.bar < d.from) return false;
    return true;
  }

  chordAt(bar: number, st: number): Chord {
    while (st >= 16) { st -= 16; bar++; }
    const pb = this.t.prog[((bar % this.t.prog.length) + this.t.prog.length) % this.t.prog.length];
    let c = pb[0].c;
    for (const x of pb) if (x.at <= st + 1e-6) c = x.c;
    const tr = this.t.def.phaseTr ? this.t.def.phaseTr[this.cur.phase - 1] : 0;
    return transposeChord(c, tr);
  }

  /** Schedule everything up to `horizon` (context time). */
  pump(horizon: number): void {
    if (!this.started || this.stopped) return;
    let guard = 0;
    while (this.nextStepTime < horizon && guard++ < 4096) {
      if (this.step === 0) this.latch(this.nextStepTime);
      const late = this.realtime && this.nextStepTime < this.ctx.currentTime - 0.015;
      if (!late && this.nextStepTime < this.stopAt) this.scheduleStep(this.nextStepTime);
      this.step++;
      this.nextStepTime += this.stepDur;
      if (this.step >= 16) { this.step = 0; this.bar++; }
    }
  }

  private scheduleStep(t: number): void {
    const s = this.cur, step = this.step, bar = this.bar;
    const swing = this.t.def.swing ?? 0;
    const trP = this.t.def.phaseTr ? this.t.def.phaseTr[s.phase - 1] : 0;
    for (const prt of this.rt) {
      const cp = prt.cp;
      if (!this.active(cp, s)) continue;
      const rel = cp.def.from ? bar - cp.def.from : bar;
      const evs = cp.bars[((rel % cp.bars.length) + cp.bars.length) % cp.bars.length];
      for (const e of evs) {
        if (Math.floor(e.st + 1e-9) !== step) continue;
        const frac = e.st - step;
        let tt = t + frac * this.stepDur + (step % 2 === 1 && frac < 1e-6 ? swing * this.stepDur : 0);
        const hum = cp.def.hum ?? 0;
        let v = e.v;
        if (hum) { tt += (this.rng.next() - 0.5) * hum * 0.012; v *= 1 + (this.rng.next() - 0.5) * hum * 0.25; }
        if (cp.isKick && s.rage && cp.def.rage !== 1) v *= 0.6;
        this.play(prt, e, Math.max(tt, t), v, trP);
      }
    }
  }

  private play(prt: PartRt, e: Ev, t: number, v: number, trP: number): void {
    const d = prt.cp.def;
    const inst = INSTRUMENTS[d.i];
    if (!inst) return;
    const dur = e.d * this.stepDur * (d.leg ?? 0.94);
    const x = d.x ?? {};
    const ctx = this.ctx, out = prt.inp, r = this.rng;
    switch (d.k) {
      case 'd': inst(ctx, out, t, d.note ?? 0, dur, v, x, r); break;
      case 'm': {
        const tr = (d.tr ?? 0) + trP;
        if (e.ns) for (const n of e.ns) inst(ctx, out, t, n + tr, dur, v, x, r);
        else inst(ctx, out, t, e.n + tr, dur, v, x, r);
        break;
      }
      case 'b': {
        const c = this.chordAt(this.bar, e.st);
        const low = d.oct ?? 28;
        const deg = e.deg!;
        let n: number;
        if (deg === 'A' || deg === 'a' || deg === 'D') {
          const nc = this.chordAt(this.bar, e.st + e.d);
          const nr = bassNote(nc.bass, low);
          n = deg === 'A' ? nr - 1 : deg === 'a' ? nr + 1 : nr + 7 > low + 14 ? nr - 5 : nr + 7;
        } else {
          const root = bassNote(c.root, low);
          if (deg === 'R' || deg === 'r') n = bassNote(c.bass, low);
          else if (deg === 'L') n = root - 5;
          else if (deg === 'b') n = root + degree(c, '7') - 12;
          else n = root + degree(c, deg);
        }
        inst(ctx, out, t, n + (d.tr ?? 0), dur, v, x, r);
        break;
      }
      case 'c': case 'a': {
        const c = this.chordAt(this.bar, e.st);
        if (prt.voicingKey !== c.sym) {
          prt.voicing = voice(c, d.voices ?? 4, d.oct ?? 62, prt.prevVoicing, d.rootless, d.spread);
          prt.prevVoicing = prt.voicing; prt.voicingKey = c.sym;
        }
        const vc = prt.voicing!;
        if (d.k === 'c') {
          const strum = x.strum ?? 0;
          vc.forEach((n, i) => inst(ctx, out, t + i * strum, n + (d.tr ?? 0), dur, v * (0.92 + (i === vc.length - 1 ? 0.08 : 0)), x, r));
        } else {
          const n = vc[e.n % vc.length] + 12 * Math.floor(e.n / vc.length);
          inst(ctx, out, t, n + (d.tr ?? 0), dur, v, x, r);
        }
        break;
      }
    }
  }

  /** Beat clock for visuals. */
  beat(now: number): { phase: number; bpm: number; bar: number } {
    let m = this.markers[0];
    for (const x of this.markers) if (x.t <= now) m = x;
    if (!m || now < m.t) return { phase: 0, bpm: this.bpm, bar: Math.max(0, this.bar - 1) };
    const bd = 60 / m.bpm;
    const beats = (now - m.t) / bd;
    return { phase: beats - Math.floor(beats), bpm: m.bpm, bar: m.bar + Math.floor(beats / 4) };
  }

  /** Re-anchor after a pause so scheduling resumes at `t` from the current position. */
  resumeAt(t: number): void {
    this.nextStepTime = t;
    // restart at the beginning of the current bar for musical continuity
    if (this.step !== 0) { this.step = 0; }
  }

  fadeOut(now: number, secs: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + Math.max(0.02, secs));
    this.stopAt = now + secs + 0.05;
  }

  dispose(): void {
    this.stopped = true;
    try { this.out.disconnect(); } catch { /* already gone */ }
  }
}
