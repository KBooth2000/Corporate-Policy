// Bus graph shared by the live engine and offline QA renders:
//   music -> duck -> pause -> glue comp -> musicVol ┐
//   sfx -------------------------------> sfxVol   ┼-> sum -> DC block -> look-ahead limiter -> soft clip -> masterVol -> out
//   loops -> loopPause ----------------> sfxVol   │
//   voice -----------------------------> voiceVol ┘
// Note: Chrome's DynamicsCompressor ducks transients that start from silence (a 5 ms burst loses ~8 dB), so it is
// only used on the continuous music bus. The master limiter is an AudioWorklet (falls back to the soft clipper).
import { AC, gain, filt, shaper, softClipCurve } from './core';

export interface Mix {
  musicIn: GainNode; sfxIn: GainNode; loopIn: GainNode; voiceIn: GainNode;
  duck: GainNode; musicPause: GainNode; loopPause: GainNode;
  musicVol: GainNode; sfxVol: GainNode; voiceVol: GainNode; masterVol: GainNode;
  limiterSlot: GainNode; clip: WaveShaperNode; limiter: AudioNode | null;
}

/** Static trims so that music sits under SFX and voices at default settings. */
export const TRIM = { music: 0.62, sfx: 1.0, voice: 0.6, pre: 0.8 };

export function buildMix(ctx: AC, dest: AudioNode): Mix {
  const masterVol = gain(ctx, 1, dest);
  const clip = shaper(ctx, softClipCurve(0.8, 0.935), masterVol);
  const limiterSlot = gain(ctx, 1, clip);
  const sum = gain(ctx, TRIM.pre, filt(ctx, 'highpass', 20, 0.6, limiterSlot)); // DC / subsonic blocker
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 10; glue.ratio.value = 2; glue.attack.value = 0.015; glue.release.value = 0.25;
  const musicVol = gain(ctx, TRIM.music, sum);
  glue.connect(musicVol);
  const sfxVol = gain(ctx, TRIM.sfx, sum);
  const voiceVol = gain(ctx, TRIM.voice, sum);
  const musicPause = gain(ctx, 1, glue);
  const duck = gain(ctx, 1, musicPause);
  const musicIn = gain(ctx, 1, duck);
  const sfxIn = gain(ctx, 1, sfxVol);
  const loopPause = gain(ctx, 1, sfxVol);
  const loopIn = gain(ctx, 1, loopPause);
  const voiceIn = gain(ctx, 1, voiceVol);
  return { musicIn, sfxIn, loopIn, voiceIn, duck, musicPause, loopPause, musicVol, sfxVol, voiceVol, masterVol, limiterSlot, clip, limiter: null };
}

// ------------------------------------------------------------------ look-ahead limiter worklet
const LIMITER_SRC = `
class CpLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.n = Math.max(32, Math.round(sampleRate * 0.004));      // 4 ms look-ahead
    this.buf = [new Float32Array(this.n), new Float32Array(this.n)];
    this.i = 0; this.env = 0; this.g = 1;
    this.rel = Math.exp(-1 / (sampleRate * 0.12));               // 120 ms release
    this.att = Math.exp(-1 / (this.n * 0.3));                    // reaches target within the look-ahead
    this.ceil = 0.89;                                            // -1 dBFS
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const len = out[0].length, ch = out.length;
    const l = inp[0], r = inp[1] || inp[0];
    for (let s = 0; s < len; s++) {
      const a = l ? Math.abs(l[s]) : 0, b = r ? Math.abs(r[s]) : 0;
      const pk = a > b ? a : b;
      this.env = pk > this.env ? pk : this.env * this.rel;
      const tgt = this.env > this.ceil ? this.ceil / this.env : 1;
      this.g = tgt < this.g ? tgt + (this.g - tgt) * this.att : tgt + (this.g - tgt) * this.rel;
      const i = this.i;
      const dl = this.buf[0][i], dr = this.buf[1][i];
      this.buf[0][i] = l ? l[s] : 0; this.buf[1][i] = r ? r[s] : 0;
      out[0][s] = dl * this.g;
      if (ch > 1) out[1][s] = dr * this.g;
      this.i = i + 1 === this.n ? 0 : i + 1;
    }
    return true;
  }
}
registerProcessor('cp-limiter', CpLimiter);
`;
const loaded = new WeakSet<AC>();
let blobUrl: string | null = null;

/** Insert the worklet limiter (async). Safe to ignore failures: the soft clipper still protects the output. */
export async function attachLimiter(ctx: AC, mix: Mix): Promise<boolean> {
  try {
    const wl = (ctx as any).audioWorklet;
    if (!wl || typeof AudioWorkletNode === 'undefined') return false;
    if (!loaded.has(ctx)) {
      blobUrl ??= URL.createObjectURL(new Blob([LIMITER_SRC], { type: 'application/javascript' }));
      await wl.addModule(blobUrl);
      loaded.add(ctx);
    }
    const node = new AudioWorkletNode(ctx, 'cp-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    mix.limiterSlot.disconnect();
    mix.limiterSlot.connect(node);
    node.connect(mix.clip);
    mix.limiter = node;
    return true;
  } catch (e) {
    console.warn('[audio] limiter worklet unavailable; using soft clip only', e);
    return false;
  }
}
