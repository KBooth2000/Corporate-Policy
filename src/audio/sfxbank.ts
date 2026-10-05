// Pre-renders SFX recipes into AudioBuffers (OfflineAudioContext), post-processes and stores variants.
import type { SfxName, LoopName } from './audio';
import { SFX, LOOPS, SfxDef, LoopDef } from './sfxdefs';
import { Syn } from './synth';
import { ARng } from './core';

export const SFX_RATE = 32000;

type OACCtor = new (ch: number, len: number, sr: number) => OfflineAudioContext;
export function offlineCtor(): OACCtor | null {
  const g = globalThis as any;
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** startRendering that also works on old WebKit (event based). */
export function renderOffline(ctx: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let done = false;
    ctx.oncomplete = (e) => { if (!done) { done = true; resolve(e.renderedBuffer); } };
    try {
      const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then((b) => { if (!done) { done = true; resolve(b); } }, reject);
    } catch (e) { reject(e); }
  });
}

function makeBuffer(like: BaseAudioContext | null, ch: number, len: number, sr: number): AudioBuffer {
  if (like) return like.createBuffer(ch, len, sr);
  return new AudioBuffer({ numberOfChannels: ch, length: len, sampleRate: sr });
}

/** DC block, trim trailing silence, edge fades, peak-normalise to -1 dBFS. */
export function postProcess(src: AudioBuffer, like: BaseAudioContext | null, trim = true): AudioBuffer {
  const ch = src.numberOfChannels, sr = src.sampleRate;
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(src.getChannelData(c).slice());
  if (trim) {
    // one-pole DC blocker (~10 Hz)
    const R = 1 - (2 * Math.PI * 10) / sr;
    for (const d of data) { let x1 = 0, y1 = 0; for (let i = 0; i < d.length; i++) { const y = d[i] - x1 + R * y1; x1 = d[i]; y1 = y; d[i] = y; } }
  } else {
    // loops: subtract the mean so the wrap stays perfectly continuous
    for (const d of data) { let m = 0; for (let i = 0; i < d.length; i++) m += d[i]; m /= d.length; for (let i = 0; i < d.length; i++) d[i] -= m; }
  }
  let len = src.length;
  if (trim) {
    let last = 0;
    for (const d of data) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > 2e-4) { last = i; break; }
    len = Math.min(src.length, last + Math.floor(sr * 0.02));
  }
  let peak = 0;
  for (const d of data) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 1e-6 ? 0.89 / peak : 0;
  const fi = Math.floor(sr * 0.0015), fo = Math.min(Math.floor(sr * 0.012), Math.floor(len / 4));
  const out = makeBuffer(like, ch, Math.max(1, len), sr);
  for (let c = 0; c < ch; c++) {
    const d = data[c], o = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let g = k;
      if (trim && i < fi) g *= i / fi;
      if (trim && i > len - fo) g *= (len - i) / fo;
      o[i] = d[i] * g;
    }
  }
  return out;
}

export async function renderSfxDef(def: SfxDef, seed: number, like: BaseAudioContext | null, sr = SFX_RATE): Promise<AudioBuffer | null> {
  const OAC = offlineCtor();
  if (!OAC) return null;
  const ch = def.stereo ? 2 : 1;
  const ctx = new OAC(ch, Math.ceil(def.d * sr), sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  def.b(new Syn(ctx, out, new ARng(seed)));
  const raw = await renderOffline(ctx);
  return postProcess(raw, like, true);
}

/** Render a seamless loop: render d + xfade, then fold the tail over the head with an equal-power crossfade. */
export async function renderLoopDef(def: LoopDef, seed: number, like: BaseAudioContext | null, sr = SFX_RATE): Promise<AudioBuffer | null> {
  const OAC = offlineCtor();
  if (!OAC) return null;
  const ch = def.stereo ? 2 : 1;
  const xf = Math.min(1.5, def.d * 0.25);
  const L = Math.round(def.d * sr), X = Math.round(xf * sr);
  const ctx = new OAC(ch, L + X + Math.round(0.6 * sr), sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  // start slightly before 0 is impossible, so render from 0.3 s in to skip any attack transient
  const pre = 0.3;
  const syn = new Syn(ctx, out, new ARng(seed));
  syn.t0 = def.aligned ? pre : 0.002;
  def.b(syn, def.d + xf + pre);
  const raw = await renderOffline(ctx);
  const off = Math.round(pre * sr);
  const tmp = makeBuffer(like, ch, L, sr);
  for (let c = 0; c < ch; c++) {
    const s = raw.getChannelData(c), o = tmp.getChannelData(c);
    for (let i = 0; i < L; i++) o[i] = s[off + i];
    for (let i = 0; i < X; i++) {
      const a = i / X;
      o[i] = s[off + i] * Math.sqrt(a) + s[off + L + i] * Math.sqrt(1 - a);
    }
  }
  return postProcess(tmp, like, false);
}

/** Memory budget: long sounds keep one variant (play-time pitch/level jitter still varies them). */
export function variantCount(n: SfxName): number {
  const d = SFX[n];
  const v = d.vars ?? 2;
  return d.d > 1.3 ? 1 : d.d > 0.7 ? Math.min(v, 2) : v;
}

export class SfxBank {
  bufs = new Map<string, AudioBuffer[]>();
  loops = new Map<string, AudioBuffer>();
  private queue: { name: string; loop: boolean; variant: number }[] = [];
  private running = false;
  private wanted = new Set<string>();
  bytes = 0;
  onLoopReady: ((name: string) => void) | null = null;
  constructor(private like: BaseAudioContext | null) {}

  start(): void {
    if (this.queue.length || this.running) return;
    const names = (Object.keys(SFX) as SfxName[]).sort((a, b) => (SFX[a].pri ?? 5) - (SFX[b].pri ?? 5));
    for (const n of names) this.queue.push({ name: n, loop: false, variant: 0 });
    for (const n of Object.keys(LOOPS) as LoopName[]) this.queue.push({ name: n, loop: true, variant: 0 });
    for (const n of names) for (let v = 1; v < variantCount(n); v++) this.queue.push({ name: n, loop: false, variant: v });
    void this.run();
  }

  /** Move a name to the front of the queue (requested before it was ready). */
  want(name: string, loop = false): void {
    if (this.wanted.has(name)) return;
    this.wanted.add(name);
    const i = this.queue.findIndex((q) => q.name === name && q.loop === loop);
    if (i > 0) { const [q] = this.queue.splice(i, 1); this.queue.unshift(q); }
  }

  private async run(): Promise<void> {
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      try {
        const seed = (job.name.length * 131 + job.variant * 7919 + job.name.charCodeAt(0) * 17) >>> 0;
        if (job.loop) {
          const b = await renderLoopDef(LOOPS[job.name as LoopName], seed, this.like);
          if (b) { this.loops.set(job.name, b); this.bytes += b.length * b.numberOfChannels * 4; this.onLoopReady?.(job.name); }
        } else {
          const b = await renderSfxDef(SFX[job.name as SfxName], seed, this.like);
          if (b) {
            const arr = this.bufs.get(job.name) ?? [];
            arr.push(b); this.bufs.set(job.name, arr);
            this.bytes += b.length * b.numberOfChannels * 4;
          }
        }
      } catch (e) {
        console.warn('[audio] render failed', job.name, e);
      }
      // yield so we never block the main thread for long
      await new Promise((r) => setTimeout(r, 0));
    }
    this.running = false;
  }

  get ready(): boolean { return !this.running && this.queue.length === 0; }
  progress(): number { const total = Object.keys(SFX).length + Object.keys(LOOPS).length; return Math.min(1, (this.bufs.size + this.loops.size) / total); }
}
