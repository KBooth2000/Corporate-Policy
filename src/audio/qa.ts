// Offline QA renders (used by the 'audio' dev scene and tools/audio-check.mjs): renders music, SFX, loops and
// voices through the real mix chain in an OfflineAudioContext and measures them.
import type { MusicTrack, SfxName, LoopName, VoiceKind } from './audio';
import { buildMix } from './mixer';
import { Player } from './sequencer';
import { TRACKS } from './tracks/index';
import { SFX, LOOPS } from './sfxdefs';
import { renderSfxDef, renderLoopDef, renderOffline, offlineCtor } from './sfxbank';
import { speak } from './voice';
import { dbToGain, gain, compileTrackWarnings } from './qa-helpers';

export interface Stats {
  peakDb: number; rmsDb: number; dc: number; silentPct: number; clipped: number; clicks: number; seconds: number; wrapJump?: number; crest: number; clickAt: number[];
}

const SR = 44100;
const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -200);

/** Self-test: a sine with an injected step must register exactly one click; a clean sine none. */
export function clickSelfTest(): { clean: number; stepped: number } {
  const sr = 44100, mk = (step: boolean) => { const b = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr }); const d = b.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = 0.3 * Math.sin(i * 2 * Math.PI * 220 / sr) + (step && i > sr / 2 ? 0.15 : 0); return b; };
  return { clean: stats(mk(false)).clicks, stepped: stats(mk(true)).clicks };
}

function isolated(ad: Float32Array, i: number): boolean {
  let m = 0;
  for (let k = 2; k <= 10; k++) m = Math.max(m, ad[i - k] ?? 0, ad[i + k] ?? 0);
  return ad[i] > 4 * m;
}

export function stats(buf: AudioBuffer, skipStart = 0): Stats {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const s0 = Math.floor(skipStart * sr);
  let peak = 0, sum = 0, dc = 0, clipped = 0, cnt = 0, clicks = 0;
  const clickAt: number[] = [];
  const win = Math.floor(sr * 0.05);
  let silentWins = 0, wins = 0;
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    // click detector: derivative spike vs local average derivative
    const W = 256;
    let acc = 0;
    const ad = new Float32Array(n);
    // second difference (linear-prediction residual): ~0 for smooth signals, a lone spike at a discontinuity
    for (let i = 2; i < n; i++) ad[i] = Math.abs(d[i] - 2 * d[i - 1] + d[i - 2]);
    for (let i = 0; i < Math.min(n, 2 * W); i++) acc += ad[i];
    for (let i = 0; i < n; i++) {
      if (i >= s0) {
        const x = d[i];
        const a = Math.abs(x);
        if (a > peak) peak = a;
        sum += x * x; dc += x; cnt++;
        if (a > 0.944) clipped++;
      }
      if (i >= W && i + W < n) {
        const local = acc / (2 * W); // window [i-W, i+W)
        if (i >= s0 && ad[i] > 0.05 && ad[i] > local * 10 && isolated(ad, i)) { clicks++; if (clickAt.length < 12) clickAt.push(+(i / sr).toFixed(4)); }
        acc += ad[i + W] - ad[i - W];
      }
    }
    for (let w = s0; w + win <= n; w += win) {
      let e = 0;
      for (let i = w; i < w + win; i++) e += d[i] * d[i];
      wins++;
      if (Math.sqrt(e / win) < 0.001) silentWins++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, cnt));
  return { peakDb: db(peak), rmsDb: db(rms), dc: dc / Math.max(1, cnt), silentPct: wins ? (100 * silentWins) / wins : 100, clipped, clicks, seconds: n / sr, crest: db(peak) - db(rms), clickAt };
}

export interface MusicRenderOpts {
  seconds?: number; combat?: boolean; rage?: boolean; phase?: number; startBar?: number; only?: number[]; raw?: boolean;
  events?: { t: number; combat?: boolean; rage?: boolean; phase?: number }[];
}

export async function renderMusic(track: MusicTrack, o: MusicRenderOpts = {}): Promise<AudioBuffer> {
  const OAC = offlineCtor()!;
  const secs = o.seconds ?? 20;
  const ctx = new OAC(2, Math.ceil(secs * SR), SR);
  const def = TRACKS[track]!;
  const dest = o.raw ? ctx.destination : buildMix(ctx, ctx.destination).musicIn;
  const p = new Player(ctx, dest, def, o.only ? (_d, i) => o.only!.includes(i) : undefined);
  p.realtime = false;
  p.want = { combat: !!o.combat, rage: false, phase: o.phase ?? 1 };
  p.start(0.05, o.startBar ?? 0);
  if (o.rage) { p.pump(0.06); p.setRage(true, 0.06); }
  for (const ev of (o.events ?? []).slice().sort((a, b) => a.t - b.t)) {
    p.pump(ev.t + 0.14);
    if (ev.combat !== undefined) p.setCombat(ev.combat, ev.t);
    if (ev.rage !== undefined) p.setRage(ev.rage, ev.t);
    if (ev.phase !== undefined) p.setPhase(ev.phase);
  }
  p.pump(secs);
  return renderOffline(ctx);
}

/** Render one SFX variant exactly as gameplay plays it (level + mix chain), with a short tail. */
export async function renderSfxPlayed(name: SfxName, variant = 0): Promise<{ played: AudioBuffer; raw: AudioBuffer }> {
  const def = SFX[name];
  const seed = (name.length * 131 + variant * 7919 + name.charCodeAt(0) * 17) >>> 0;
  const raw = (await renderSfxDef(def, seed, null))!;
  const OAC = offlineCtor()!;
  const ctx = new OAC(2, Math.ceil((raw.duration + 0.3) * SR), SR);
  const mix = buildMix(ctx, ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = raw;
  src.connect(gain(ctx, dbToGain(def.lvl ?? -6), mix.sfxIn));
  src.start(0.01);
  return { played: await renderOffline(ctx), raw };
}

export async function renderLoopPlayed(name: LoopName): Promise<{ played: AudioBuffer; raw: AudioBuffer; wrapJump: number }> {
  const def = LOOPS[name];
  const raw = (await renderLoopDef(def, 99, null))!;
  let wrap = 0;
  for (let c = 0; c < raw.numberOfChannels; c++) { const d = raw.getChannelData(c); wrap = Math.max(wrap, Math.abs(d[0] - d[d.length - 1])); }
  const OAC = offlineCtor()!;
  const ctx = new OAC(2, Math.ceil(raw.duration * 2.2 * SR), SR);
  const mix = buildMix(ctx, ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = raw; src.loop = true;
  src.connect(gain(ctx, dbToGain(def.lvl ?? -12), mix.loopIn));
  src.start(0, 0);
  return { played: await renderOffline(ctx), raw, wrapJump: wrap };
}

export async function renderVoice(seed: number, kind: VoiceKind, utt = 1): Promise<AudioBuffer> {
  const OAC = offlineCtor()!;
  const ctx = new OAC(2, Math.ceil(7 * SR), SR);
  const mix = buildMix(ctx, ctx.destination);
  speak(ctx, mix.voiceIn, 0.05, seed, kind, utt, { bpm: 126 });
  const b = await renderOffline(ctx);
  return b;
}

// ------------------------------------------------------------------ encoders
export function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels, n = buf.length;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const dv = new DataView(bytes.buffer);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Waveform strip + log-frequency spectrogram as a PNG data URL. */
export function spectrogramPNG(buf: AudioBuffer, title: string, W = 1000): string {
  const H1 = 90, H2 = 260, H = H1 + H2 + 18;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0b0c10'; g.fillRect(0, 0, W, H);
  const n = buf.length, sr = buf.sampleRate;
  const mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  // waveform (peak per column)
  g.fillStyle = '#4fc3f7';
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x * n) / W), b = Math.floor(((x + 1) * n) / W);
    let mn = 0, mx = 0;
    for (let i = a; i < b; i++) { if (mono[i] < mn) mn = mono[i]; if (mono[i] > mx) mx = mono[i]; }
    g.fillRect(x, 18 + H1 / 2 - mx * H1 / 2, 1, Math.max(1, (mx - mn) * H1 / 2));
  }
  g.fillStyle = '#ff5252'; g.fillRect(0, 18 + H1 / 2 - 0.944 * H1 / 2, W, 1); g.fillRect(0, 18 + H1 / 2 + 0.944 * H1 / 2, W, 1);
  // spectrogram
  const N = 2048;
  const re = new Float32Array(N), im = new Float32Array(N);
  const img = g.createImageData(W, H2);
  const fLo = 30, fHi = Math.min(16000, sr / 2);
  for (let x = 0; x < W; x++) {
    const c = Math.floor(((x + 0.5) * n) / W) - N / 2;
    for (let i = 0; i < N; i++) { const j = c + i; const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); re[i] = j >= 0 && j < n ? mono[j] * w : 0; im[i] = 0; }
    fft(re, im);
    for (let y = 0; y < H2; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / H2);
      const k = Math.min(N / 2 - 1, Math.round((f * N) / sr));
      const mag = Math.hypot(re[k], im[k]) / N;
      const v = Math.max(0, Math.min(1, (db(mag) + 100) / 75));
      const o = (y * W + x) * 4;
      img.data[o] = Math.min(255, v * 2.2 * 255); img.data[o + 1] = Math.max(0, Math.min(255, (v * 1.6 - 0.5) * 255)); img.data[o + 2] = Math.min(255, (v < 0.5 ? v * 1.6 : 0.8 - (v - 0.5) * 1.2 + (v > 0.85 ? (v - 0.85) * 6 : 0)) * 255); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, H1 + 18);
  g.fillStyle = '#fff'; g.font = '12px monospace';
  g.fillText(`${title}  (${buf.duration.toFixed(1)} s; spectrogram 30 Hz–16 kHz log)`, 4, 12);
  g.fillStyle = '#888';
  for (const f of [100, 1000, 10000]) { const y = H1 + 18 + H2 * (1 - Math.log(f / fLo) / Math.log(fHi / fLo)); g.fillRect(0, y, 6, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y + 4); }
  return cv.toDataURL('image/png');
}

export { compileTrackWarnings };
