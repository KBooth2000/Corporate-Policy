import { compileTrack } from './sequencer';
import { TRACKS } from './tracks/index';
export { dbToGain, gain } from './core';

/** Compile every track and return pattern/melody warnings (bar misalignment etc.). */
export function compileTrackWarnings(): string[] {
  const out: string[] = [];
  for (const def of Object.values(TRACKS)) if (def) out.push(...compileTrack(def).warnings);
  return out;
}
