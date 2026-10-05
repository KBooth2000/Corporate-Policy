// Bus graph shared by the live engine and offline QA renders:
//   music -> duck -> pause -> musicVol ┐
//   sfx ----------------------> sfxVol ┼-> sum -> glue comp -> limiter -> soft clip -> masterVol -> out
//   loops -> loopPause -------> sfxVol │
//   voice ------------------> voiceVol ┘
import { AC, gain, filt, shaper, softClipCurve } from './core';

export interface Mix {
  musicIn: GainNode; sfxIn: GainNode; loopIn: GainNode; voiceIn: GainNode;
  duck: GainNode; musicPause: GainNode; loopPause: GainNode;
  musicVol: GainNode; sfxVol: GainNode; voiceVol: GainNode; masterVol: GainNode;
}

/** Static trims so that music sits under SFX and voices at default settings. */
export const TRIM = { music: 0.62, sfx: 1.0, voice: 0.95, pre: 0.8 };

export function buildMix(ctx: AC, dest: AudioNode): Mix {
  const masterVol = gain(ctx, 1, dest);
  const clip = shaper(ctx, softClipCurve(0.8, 0.935), masterVol);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  lim.connect(clip);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 2; glue.attack.value = 0.012; glue.release.value = 0.25;
  glue.connect(lim);
  const sum = gain(ctx, TRIM.pre, filt(ctx, 'highpass', 20, 0.6, glue)); // DC / subsonic blocker
  const musicVol = gain(ctx, TRIM.music, sum);
  const sfxVol = gain(ctx, TRIM.sfx, sum);
  const voiceVol = gain(ctx, TRIM.voice, sum);
  const musicPause = gain(ctx, 1, musicVol);
  const duck = gain(ctx, 1, musicPause);
  const musicIn = gain(ctx, 1, duck);
  const sfxIn = gain(ctx, 1, sfxVol);
  const loopPause = gain(ctx, 1, sfxVol);
  const loopIn = gain(ctx, 1, loopPause);
  const voiceIn = gain(ctx, 1, voiceVol);
  return { musicIn, sfxIn, loopIn, voiceIn, duck, musicPause, loopPause, musicVol, sfxVol, voiceVol, masterVol };
}
