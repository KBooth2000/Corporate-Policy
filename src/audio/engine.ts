// Audio engine implementation (spec 9.3). Importing this module registers it with the audio contract.
// Everything is synthesised at runtime; nothing here throws if Web Audio is missing.
import {
  registerAudio, audio as audioProxy, AudioApi, SfxName, LoopName, MusicTrack, VoiceKind, SfxOpts, LoopHandle,
} from './audio';
import { buildMix, Mix, TRIM } from './mixer';
import { SfxBank } from './sfxbank';
import { SFX, LOOPS } from './sfxdefs';
import { Player } from './sequencer';
import { TRACKS } from './tracks/index';
import { speak } from './voice';
import { ARng, freshSeed, clamp, dbToGain, gain, panner } from './core';

/** Names that need a visual indicator (spec 9.3 accessibility). */
const CUE_SFX = new Set<string>(['telegraph', 'telegraph_heavy', 'alarm', 'whistle', 'printer_beep', 'phone_ring', 'microwave_ding', 'gong', 'helicopter', 'scream']);
const CUE_LOOPS: Partial<Record<LoopName, string>> = { alarm_loop: 'alarm', helicopter_loop: 'helicopter' };

const LOOKAHEAD = 0.14;   // seconds of music scheduled ahead of the audio clock
const TICK_MS = 25;
const MAX_SFX = 40;
const MAX_VOICES = 4;
const SILENT_LOOP: LoopHandle = { stop() {}, setVolume() {} };

interface Inst { name: string; src: AudioBufferSourceNode; g: GainNode; end: number }

class Engine implements AudioApi {
  onCue?: (name: string, x?: number, y?: number) => void;
  ctx: AudioContext | null = null;
  mix: Mix | null = null;
  bank: SfxBank | null = null;
  private unavailable = false;
  private vols = { master: 1, music: 1, sfx: 1, voice: 1 };
  private lx = 0; private ly = 0;
  private rng = new ARng(freshSeed());
  private inst: Inst[] = [];
  private lastVariant = new Map<string, number>();
  private lastPlay = new Map<string, number>();
  private voicesEnd: number[] = [];
  private uttCounter = 1;
  private paused = false;
  private hidden = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingLoops: { name: LoopName; opts?: SfxOpts; h: LoopRec }[] = [];
  // music state
  private player: Player | null = null;
  private fading: Player[] = [];
  private track: MusicTrack = 'none';
  private want = { combat: false, rage: false, phase: 1 };

  // ------------------------------------------------------------------ lifecycle
  unlock(): void {
    if (this.unavailable) return;
    if (this.ctx) { this.tryResume(); return; }
    try {
      const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
      if (!AC) { this.unavailable = true; return; }
      const ctx: AudioContext = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.mix = buildMix(ctx, ctx.destination);
      this.applyVolumes(true);
      this.bank = new SfxBank(ctx);
      this.bank.onLoopReady = (n) => this.flushLoops(n);
      this.bank.start();
      this.timer = setInterval(() => this.pump(), TICK_MS);
      const kick = () => this.tryResume();
      for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, kick, { passive: true });
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden;
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend().catch(() => {});
        else this.tryResume();
      });
      ctx.addEventListener?.('statechange', () => { if ((ctx.state as string) === 'interrupted' || ctx.state === 'suspended') { /* resumed on next gesture */ } });
      this.tryResume();
      // a track requested before unlock starts now
      if (this.track !== 'none') { const t = this.track; this.track = 'none'; this.music.play(t, 0.05); }
    } catch (e) {
      console.warn('[audio] Web Audio unavailable', e);
      this.unavailable = true; this.ctx = null;
    }
  }

  private tryResume(): void {
    const c = this.ctx;
    if (!c || this.hidden) return;
    if (c.state !== 'running') void c.resume().catch(() => {});
  }

  get ok(): boolean { return !!this.ctx && !!this.mix; }

  setVolumes(master: number, music: number, sfx: number, voice: number): void {
    this.vols = { master: clamp(master, 0, 1), music: clamp(music, 0, 1), sfx: clamp(sfx, 0, 1), voice: clamp(voice, 0, 1) };
    this.applyVolumes(false);
  }
  private applyVolumes(instant: boolean): void {
    const m = this.mix, c = this.ctx;
    if (!m || !c) return;
    const curve = (v: number) => v * v; // perceptual taper
    const set = (g: GainNode, v: number) => { if (instant) g.gain.value = v; else g.gain.setTargetAtTime(v, c.currentTime, 0.05); };
    set(m.masterVol, curve(this.vols.master));
    set(m.musicVol, curve(this.vols.music) * TRIM.music);
    set(m.sfxVol, curve(this.vols.sfx) * TRIM.sfx);
    set(m.voiceVol, curve(this.vols.voice) * TRIM.voice);
  }

  setListener(x: number, y: number): void { this.lx = x; this.ly = y; }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    const c = this.ctx, m = this.mix;
    if (!c || !m) return;
    const now = c.currentTime;
    m.musicPause.gain.setTargetAtTime(p ? 0 : 1, now, p ? 0.04 : 0.12);
    m.loopPause.gain.setTargetAtTime(p ? 0 : 1, now, 0.05);
    if (!p && this.player) this.player.resumeAt(now + 0.06);
  }

  // ------------------------------------------------------------------ spatial helpers
  private spatial(opts: SfxOpts | undefined, minAtt = 0): { pan: number; att: number } {
    if (!opts || opts.x === undefined || opts.y === undefined) return { pan: 0, att: 1 };
    const dx = opts.x - this.lx, dy = opts.y - this.ly;
    const d = Math.hypot(dx, dy);
    const pan = clamp(dx / 340, -1, 1) * 0.8;
    const k = Math.max(0, d - 140) / 380;
    const att = Math.max(minAtt, 1 / (1 + k * k));
    return { pan, att };
  }

  // ------------------------------------------------------------------ SFX
  sfx(name: SfxName, opts?: SfxOpts): void {
    if (CUE_SFX.has(name)) { try { this.onCue?.(name, opts?.x, opts?.y); } catch { /* user callback */ } }
    const c = this.ctx, m = this.mix, bank = this.bank;
    if (!c || !m || !bank || this.unavailable) return;
    const def = SFX[name];
    if (!def) return;
    const bufs = bank.bufs.get(name);
    if (!bufs || !bufs.length) { bank.want(name); return; }
    const now = c.currentTime;
    const { pan, att } = this.spatial(opts, def.minAtt ?? 0);
    if (att < 0.02) return;
    // de-duplicate identical triggers in the same frame
    const lp = this.lastPlay.get(name) ?? -1;
    if (now - lp < 0.018) return;
    this.lastPlay.set(name, now);
    // voice limiting per name, then globally
    this.inst = this.inst.filter((i) => i.end > now);
    const same = this.inst.filter((i) => i.name === name);
    if (same.length >= (def.lim ?? 4)) this.kill(same[0], now);
    if (this.inst.length >= MAX_SFX) this.kill(this.inst[0], now);
    // variant (never the same twice in a row when we have several)
    let vi = this.rng.int(0, bufs.length - 1);
    if (bufs.length > 1 && vi === this.lastVariant.get(name)) vi = (vi + 1) % bufs.length;
    this.lastVariant.set(name, vi);
    const buf = bufs[vi];
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      const rate = (opts?.pitch ?? 1) * this.rng.vary(0.035);
      src.playbackRate.value = rate;
      const g = gain(c, dbToGain(def.lvl ?? -6) * (opts?.vol ?? 1) * this.rng.vary(0.07) * att);
      src.connect(g);
      g.connect(pan ? panner(c, pan, m.sfxIn) : m.sfxIn);
      src.start(now);
      const end = now + buf.duration / rate;
      src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
      this.inst.push({ name, src, g, end });
    } catch (e) { /* never throw from audio */ }
  }

  private kill(i: Inst, now: number): void {
    try { i.g.gain.setTargetAtTime(0, now, 0.012); i.src.stop(now + 0.06); } catch { /* already stopped */ }
    i.end = now;
    this.inst = this.inst.filter((x) => x !== i);
  }

  loop(name: LoopName, opts?: SfxOpts): LoopHandle {
    const cue = CUE_LOOPS[name];
    if (cue) { try { this.onCue?.(cue, opts?.x, opts?.y); } catch { /* user callback */ } }
    if (!this.ctx || !this.mix || !this.bank || !LOOPS[name]) return SILENT_LOOP;
    const h = new LoopRec(this, name, opts);
    if (this.bank.loops.has(name)) h.begin();
    else { this.bank.want(name, true); this.pendingLoops.push({ name, opts, h }); }
    return h;
  }
  private flushLoops(name: string): void {
    const ready = this.pendingLoops.filter((p) => p.name === name);
    this.pendingLoops = this.pendingLoops.filter((p) => p.name !== name);
    for (const p of ready) if (!p.h.stopped) p.h.begin();
  }
  /** @internal used by LoopRec */
  loopStart(name: LoopName, opts: SfxOpts | undefined, vol: number): { src: AudioBufferSourceNode; g: GainNode; base: number } | null {
    const c = this.ctx, m = this.mix, buf = this.bank?.loops.get(name);
    if (!c || !m || !buf) return null;
    const { pan, att } = this.spatial(opts, 0.05);
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = gain(c, 0);
    src.connect(g);
    g.connect(pan ? panner(c, pan, m.loopIn) : m.loopIn);
    const base = dbToGain(LOOPS[name].lvl ?? -12) * (opts?.vol ?? 1) * att;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(base * vol, c.currentTime + 0.25);
    src.start(c.currentTime, this.rng.next() * buf.duration);
    return { src, g, base };
  }
  get now(): number { return this.ctx?.currentTime ?? 0; }

  // ------------------------------------------------------------------ voice
  voice(voiceSeed: number, kind: VoiceKind, opts?: SfxOpts & { syllables?: number }): void {
    const c = this.ctx, m = this.mix;
    if (!c || !m || this.unavailable || c.state !== 'running') return;
    const now = c.currentTime;
    this.voicesEnd = this.voicesEnd.filter((e) => e > now);
    const heavy = kind === 'chant' || kind === 'speech';
    if (this.voicesEnd.length >= (heavy ? MAX_VOICES - 1 : MAX_VOICES)) return;
    const { pan, att } = this.spatial(opts, heavy ? 0.4 : 0);
    if (att < 0.03) return;
    try {
      const g = gain(c, (opts?.vol ?? 1) * att);
      g.connect(pan ? panner(c, pan, m.voiceIn) : m.voiceIn);
      const end = speak(c, g, now + 0.02, voiceSeed | 0, kind, this.uttCounter++, { syllables: opts?.syllables, bpm: this.player?.bpm });
      this.voicesEnd.push(end);
      setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, (end - now + 1.5) * 1000);
    } catch { /* never throw */ }
  }

  // ------------------------------------------------------------------ music
  private pump(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.player && !this.paused) this.player.pump(now + LOOKAHEAD);
    for (const f of this.fading) f.pump(now + LOOKAHEAD);
    const done = this.fading.filter((f) => now > f.stopAt + 4);
    for (const f of done) f.dispose();
    if (done.length) this.fading = this.fading.filter((f) => !done.includes(f));
  }

  music = {
    play: (track: MusicTrack, fadeSeconds = 1): void => {
      if (track === this.track && (this.player || track === 'none' || !this.ctx)) return;
      this.track = track;
      const c = this.ctx, m = this.mix;
      if (!c || !m) return; // starts on unlock
      const now = c.currentTime;
      if (this.player) { this.player.fadeOut(now, Math.max(0.05, fadeSeconds)); this.fading.push(this.player); this.player = null; }
      this.want.phase = 1; this.want.rage = false;
      const def = TRACKS[track];
      if (!def) return;
      try {
        const p = new Player(c, m.musicIn, def);
        p.want = { ...this.want };
        const fin = this.fading.length ? Math.min(fadeSeconds, 1.5) : 0.03;
        const g = p.out.gain, target = g.value;
        g.setValueAtTime(0, now); g.linearRampToValueAtTime(target, now + 0.06 + fin);
        p.start(now + 0.06);
        this.player = p;
        p.pump(now + LOOKAHEAD);
      } catch (e) { console.warn('[audio] music start failed', e); }
    },
    setCombat: (on: boolean): void => { this.want.combat = on; this.player?.setCombat(on); },
    setRage: (on: boolean): void => { this.want.rage = on; this.player?.setRage(on); },
    setPhase: (phase: number): void => { this.want.phase = phase; this.player?.setPhase(phase); },
    duck: (amount: number, seconds: number): void => {
      const c = this.ctx, m = this.mix;
      if (!c || !m) return;
      const now = c.currentTime, g = m.duck.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(clamp(1 - amount, 0, 1), now, 0.08);
      if (amount > 0 && seconds > 0 && isFinite(seconds)) g.setTargetAtTime(1, now + seconds, 0.3);
    },
    current: (): MusicTrack => this.track,
    beat: (): { phase: number; bpm: number; bar: number } => {
      const c = this.ctx, p = this.player;
      if (!c || !p) return { phase: 0, bpm: TRACKS[this.track]?.bpm ?? 120, bar: 0 };
      const lat = ((c as any).outputLatency ?? 0) + (c.baseLatency ?? 0);
      return p.beat(c.currentTime - lat);
    },
  };
}

/** Loop handle that can be created before its buffer is rendered. */
class LoopRec implements LoopHandle {
  stopped = false;
  private node: { src: AudioBufferSourceNode; g: GainNode; base: number } | null = null;
  private vol = 1;
  constructor(private e: Engine, private name: LoopName, private opts?: SfxOpts) {}
  begin(): void { if (!this.stopped && !this.node) this.node = this.e.loopStart(this.name, this.opts, this.vol); }
  stop(fade = 0.3): void {
    if (this.stopped) return;
    this.stopped = true;
    const n = this.node;
    if (!n) return;
    const now = this.e.now;
    try {
      n.g.gain.cancelScheduledValues(now);
      n.g.gain.setValueAtTime(n.g.gain.value, now);
      n.g.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
      n.src.stop(now + Math.max(0.02, fade) + 0.05);
    } catch { /* already stopped */ }
  }
  setVolume(v: number): void {
    this.vol = clamp(v, 0, 4);
    const n = this.node;
    if (n && !this.stopped) n.g.gain.setTargetAtTime(n.base * this.vol, this.e.now, 0.05);
  }
}

export const engine = new Engine();
// carry over a cue callback that was installed on the silent stub before we registered
const earlyCue = audioProxy.onCue;
if (earlyCue) engine.onCue = earlyCue;
registerAudio(engine);
