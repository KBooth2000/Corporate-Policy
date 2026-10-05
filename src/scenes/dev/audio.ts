// Audio dev scene: #dev=audio
// Keys: Tab = switch list (music/sfx/loops/voice), Up/Down = select, Enter/Space = play,
// C = combat toggle, R = rage toggle, 1/2/3 = boss phase, D = duck, P = pause, S = stop music.
// Exposes window.__audioQA for tools/audio-check.mjs (offline renders + measurements).
import { app, Scene } from '../../core/app';
import { registerDev } from './registry';
import { drawText } from '../../render/font';
import { rect } from '../../render/canvas';
import { engine } from '../../audio/engine';
import { audio, SFX_NAMES, LOOP_NAMES, MusicTrack, VoiceKind, RADIO_TRACKS, LoopHandle } from '../../audio/audio';
import { TRACKS } from '../../audio/tracks/index';
import * as qa from '../../audio/qa';
import { compileTrack } from '../../audio/sequencer';
import { INSTRUMENTS, DRUM_INSTS } from '../../audio/instruments';
import { ARng } from '../../audio/core';
import { offlineCtor, renderOffline } from '../../audio/sfxbank';

const TRACK_IDS = Object.keys(TRACKS) as MusicTrack[];
const VOICE_KINDS: VoiceKind[] = ['bark', 'pain', 'death', 'effort', 'laugh', 'gasp', 'chant', 'speech'];
const TABS = ['music', 'sfx', 'loops', 'voice'] as const;

(window as any).__audioQA = {
  tracks: () => TRACK_IDS.map((id) => ({ id, bpm: TRACKS[id]!.bpm, key: TRACKS[id]!.key, title: TRACKS[id]!.title, combatTitle: TRACKS[id]!.combatTitle, hasCombat: TRACKS[id]!.parts.some((p) => p.on === 'c'), hasPhases: !!TRACKS[id]!.phaseBpm, desc: TRACKS[id]!.desc })),
  sfxNames: () => [...SFX_NAMES],
  loopNames: () => [...LOOP_NAMES],
  warnings: () => qa.compileTrackWarnings(),
  async music(id: MusicTrack, o: qa.MusicRenderOpts & { png?: boolean; wav?: boolean; title?: string }) {
    const b = await qa.renderMusic(id, o);
    return { stats: qa.stats(b, 0.1), wav: o.wav === false ? null : qa.wavBase64(b), png: o.png ? qa.spectrogramPNG(b, o.title ?? id) : null };
  },
  async sfx(name: (typeof SFX_NAMES)[number], variant = 0, wav = true) {
    const { played, raw } = await qa.renderSfxPlayed(name, variant);
    const r0 = raw.getChannelData(0);
    return { stats: qa.stats(played), raw: { seconds: raw.duration, start: Math.abs(r0[0]), end: Math.abs(r0[r0.length - 1]), ch: raw.numberOfChannels }, wav: wav ? qa.wavBase64(played) : null };
  },
  async loop(name: (typeof LOOP_NAMES)[number], wav = true) {
    const { played, raw, wrapJump } = await qa.renderLoopPlayed(name);
    return { stats: { ...qa.stats(played, 0.3), wrapJump }, seconds: raw.duration, wav: wav ? qa.wavBase64(played) : null };
  },
  async voice(seed: number, kind: VoiceKind, wav = true, png = false) {
    const b = await qa.renderVoice(seed, kind);
    return { stats: qa.stats(b), wav: wav ? qa.wavBase64(b) : null, png: png ? qa.spectrogramPNG(b, `voice ${kind} seed ${seed}`) : null };
  },
  async sfxPng(name: (typeof SFX_NAMES)[number]) { const { played } = await qa.renderSfxPlayed(name, 0); return qa.spectrogramPNG(played, name); },
  async partLevels(id: MusicTrack, o: qa.MusicRenderOpts) {
    const t = compileTrack(TRACKS[id]!);
    const out: { i: number; inst: string; on?: string; rms: number; peak: number }[] = [];
    for (let i = 0; i < t.parts.length; i++) {
      const d = t.parts[i].def;
      if (d.rage === 1 && !o.rage) continue;
      if (d.on === 'x' && o.combat) continue;
      if (d.on === 'c' && !o.combat) continue;
      if (d.ph && (o.phase ?? 1) < d.ph) continue;
      if (d.phMax && (o.phase ?? 1) > d.phMax) continue;
      const b = await qa.renderMusic(id, { ...o, only: [i], raw: true });
      const s = qa.stats(b, 0.1);
      out.push({ i, inst: d.i, on: d.on, rms: +s.rmsDb.toFixed(1), peak: +s.peakDb.toFixed(1) });
    }
    const all = qa.stats(await qa.renderMusic(id, { ...o, raw: true }), 0.1);
    return { parts: out, total: { rms: +all.rmsDb.toFixed(1), peak: +all.peakDb.toFixed(1) } };
  },
  async instLevels() {
    const out: Record<string, { peak: number; rms: number }> = {};
    for (const [name, fn] of Object.entries(INSTRUMENTS)) {
      const OAC = offlineCtor()!;
      const ctx = new OAC(1, 44100 * 2, 44100);
      const bassy = ['sub', 'deep', 'acid', 'fmbass', 'upright', 'fretless', 'reese', 'synbass', 'rumble', 'timpani'].includes(name);
      fn(ctx, ctx.destination, 0.01, DRUM_INSTS.has(name) ? 0 : bassy ? 36 : 67, 0.5, 0.85, {}, new ARng(5));
      const b = await renderOffline(ctx);
      const st = qa.stats(b);
      // RMS over the first 0.5 s only (the note body)
      const d = b.getChannelData(0); let e = 0; for (let i = 0; i < 22050; i++) e += d[i] * d[i];
      out[name] = { peak: +st.peakDb.toFixed(1), rms: +(10 * Math.log10(e / 22050 + 1e-12)).toFixed(1) };
    }
    return out;
  },
  partDefs: (id: MusicTrack) => compileTrack(TRACKS[id]!).parts.map((p) => p.def),
  live: () => ({ bank: engine.bank ? { ready: engine.bank.ready, progress: engine.bank.progress(), mb: engine.bank.bytes / 1048576 } : null, state: engine.ctx?.state, beat: audio.music.beat(), track: audio.music.current() }),
};

class AudioDevScene implements Scene {
  name = 'dev-audio';
  private tab = 0;
  private sel = [0, 0, 0, 0];
  private combat = false; private rage = false; private phase = 1; private paused = false;
  private loops: LoopHandle[] = [];
  private cues: { name: string; t: number }[] = [];
  private onKey = (e: KeyboardEvent) => this.key(e.code);

  enter(): void {
    window.addEventListener('keydown', this.onKey);
    audio.onCue = (name) => this.cues.push({ name, t: app.time });
  }
  exit(): void { window.removeEventListener('keydown', this.onKey); }

  private list(): string[] {
    switch (TABS[this.tab]) {
      case 'music': return TRACK_IDS;
      case 'sfx': return [...SFX_NAMES];
      case 'loops': return [...LOOP_NAMES];
      default: return VOICE_KINDS;
    }
  }

  private key(code: string): void {
    audio.unlock();
    const l = this.list();
    const t = this.tab;
    if (code === 'Tab') this.tab = (this.tab + 1) % TABS.length;
    else if (code === 'ArrowDown') this.sel[t] = (this.sel[t] + 1) % l.length;
    else if (code === 'ArrowUp') this.sel[t] = (this.sel[t] + l.length - 1) % l.length;
    else if (code === 'ArrowRight') this.sel[t] = Math.min(l.length - 1, this.sel[t] + 10);
    else if (code === 'ArrowLeft') this.sel[t] = Math.max(0, this.sel[t] - 10);
    else if (code === 'Enter' || code === 'Space') this.play();
    else if (code === 'KeyC') { this.combat = !this.combat; audio.music.setCombat(this.combat); }
    else if (code === 'KeyR') { this.rage = !this.rage; audio.music.setRage(this.rage); }
    else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.phase = +code.slice(5); audio.music.setPhase(this.phase); }
    else if (code === 'KeyD') audio.music.duck(0.7, 2);
    else if (code === 'KeyP') { this.paused = !this.paused; audio.setPaused(this.paused); }
    else if (code === 'KeyS') { audio.music.play('none'); for (const h of this.loops) h.stop(); this.loops = []; }
  }

  private play(): void {
    const name = this.list()[this.sel[this.tab]];
    switch (TABS[this.tab]) {
      case 'music': this.phase = 1; this.rage = false; audio.music.play(name as MusicTrack, 1); break;
      case 'sfx': audio.sfx(name as (typeof SFX_NAMES)[number], { x: (this.sel[1] % 5 - 2) * 150, y: 0 }); break;
      case 'loops': this.loops.push(audio.loop(name as (typeof LOOP_NAMES)[number])); break;
      default: audio.voice((app.frame * 7919) >>> 0, name as VoiceKind, { syllables: 4 }); break;
    }
  }

  update(): void {
    const clicks = app.input.clicks;
    if (clicks.length) { audio.unlock(); }
    this.cues = this.cues.filter((c) => app.time - c.t < 1.5);
  }

  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#101820');
    drawText(g, 'AUDIO DEV - click/press a key to unlock', 8, 6, { color: '#ffd34d' });
    TABS.forEach((tname, i) => drawText(g, tname.toUpperCase(), 8 + i * 60, 20, { color: i === this.tab ? '#ffffff' : '#667788' }));
    const l = this.list(), s = this.sel[this.tab];
    const start = Math.max(0, Math.min(s - 12, l.length - 26));
    for (let i = start; i < Math.min(l.length, start + 26); i++) {
      let label = l[i];
      if (TABS[this.tab] === 'music') { const d = TRACKS[label as MusicTrack]!; label = `${label}  ${d.bpm}bpm ${d.key}`; }
      drawText(g, (i === s ? '> ' : '  ') + label, 8, 34 + (i - start) * 11, { color: i === s ? '#7cf0ff' : '#c0c8d0' });
    }
    const b = audio.music.beat();
    const x0 = 330;
    drawText(g, `track: ${audio.music.current()}  bpm ${b.bpm.toFixed(1)}  bar ${b.bar}`, x0, 34);
    drawText(g, `combat ${this.combat ? 'ON' : 'off'}  rage ${this.rage ? 'ON' : 'off'}  phase ${this.phase}  ${this.paused ? 'PAUSED' : ''}`, x0, 46);
    for (let i = 0; i < 4; i++) rect(g, x0 + i * 22, 60, 18, 10, Math.floor(b.phase * 4) === i ? '#ffd34d' : '#334');
    rect(g, x0, 74, Math.floor(b.phase * 84), 3, '#7cf0ff');
    const live = (window as any).__audioQA.live();
    drawText(g, `ctx: ${live.state ?? 'locked'}  sfx bank: ${live.bank ? Math.round(live.bank.progress * 100) + '% ' + live.bank.mb.toFixed(1) + 'MB' : '-'}`, x0, 84);
    const radio = RADIO_TRACKS.filter((t) => t.id === audio.music.current()).map((t) => t.title).join(' / ');
    drawText(g, radio, x0, 96, { color: '#8fa' });
    drawText(g, 'TAB list  ENTER play  C combat  R rage  1-3 phase', x0, 300, { color: '#667788' });
    drawText(g, 'D duck  P pause  S stop', x0, 311, { color: '#667788' });
    this.cues.forEach((c, i) => drawText(g, `CUE: ${c.name}`, x0, 120 + i * 11, { color: '#ff9f40' }));
  }
}

registerDev('audio', () => new AudioDevScene());
