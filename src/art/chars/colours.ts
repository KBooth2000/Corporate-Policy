// Colour ramps and palettes for characters. Hue-shifted shading: highlights lean warm (the office
// fluorescent/top-left key light), shadows lean cool violet, which reads cleaner than plain darkening.
import { mixHex } from '../../render/canvas';
import { C } from './pixbuf';
import type { Ramp } from './types';
import { SKIN, HAIR, OUTLINE } from '../palette';

const LIGHT = '#fff4dc';
const SHADOW = '#2a2142';
const DARK = '#160f22';

const rampCache = new Map<string, Ramp>();

/** Generic material ramp (cloth, plastic, metal). Cached per hex. */
export function ramp(hex: string): Ramp {
  let r = rampCache.get(hex);
  if (!r) {
    r = {
      hex,
      hi: C(mixHex(hex, LIGHT, 0.42)),
      lt: C(mixHex(hex, LIGHT, 0.2)),
      base: C(hex),
      sh: C(mixHex(hex, SHADOW, 0.3)),
      dk: C(mixHex(hex, DARK, 0.52)),
    };
    rampCache.set(hex, r);
  }
  return r;
}

const skinCache = new Map<string, Ramp>();
/** Skin ramp: warmer, redder shadows so faces don't go grey. */
export function skinRamp(hex: string): Ramp {
  let r = skinCache.get(hex);
  if (!r) {
    r = {
      hex,
      hi: C(mixHex(hex, '#fff3e6', 0.35)),
      lt: C(mixHex(hex, '#fff0dc', 0.16)),
      base: C(hex),
      sh: C(mixHex(hex, '#6b2b3d', 0.24)),
      dk: C(mixHex(hex, '#3a1428', 0.46)),
    };
    skinCache.set(hex, r);
  }
  return r;
}

/** Diverse skin tones (palette.SKIN plus extra depth at both ends). */
export const SKIN_TONES: readonly string[] = [...SKIN, '#c99272', '#4a2e20', '#e2a987', '#8a5a3c'];
/** Natural hair tones (palette.HAIR) plus a few dyed colours (no magenta: reserved for telegraphs). */
export const HAIR_NATURAL: readonly string[] = HAIR;
export const HAIR_DYED: readonly string[] = ['#3c7f86', '#6a4a8c', '#b5556a', '#d8743a', '#3a5aa0'];

/** Fabric palettes. */
export const FAB = {
  white: '#eef0f2', offwhite: '#e6e0d2', paleblue: '#b9d0e6', pink: '#e7b7c0', lilac: '#c2b2dc', mint: '#b6dcc4', cream: '#efe3c0',
  navy: '#273558', charcoal: '#3a3d46', black: '#22232a', grey: '#7c808a', lightgrey: '#a9adb5', slate: '#4e5a6e',
  beige: '#c2ae8a', khaki: '#9c8f62', brown: '#6e4a32', tan: '#b08a5a', camel: '#b98d55', olive: '#5f6a3a',
  burgundy: '#6e2232', red: '#b0303a', orange: '#d9772e', mustard: '#c99a2e', teal: '#2e7c7a', forest: '#2f5a3e',
  royal: '#3456a8', sky: '#6aa6d8', denim: '#3e5878', lightdenim: '#6a85a6', purple: '#5a3c78', plum: '#7a3a5e',
  coral: '#e07a62', lime: '#9cc94a', sand: '#d8c49a', rust: '#9a4a2a', stone: '#8e8678', ink: '#1d2438',
} as const;

export const HIVIS_LIME = '#c8e83a';
export const HIVIS_ORANGE = '#ff8a2a';
export const REFLECT = '#dfe6ec';
export const GOLD = '#d4a537';
export const GOLD_HI = '#f6dc8a';
export const SILVER = '#c9cdd4';
export const OUT = C(OUTLINE);
export const WHITE = C('#ffffff');
export const EYE = C('#1a1218');
export const TEETH = C('#f4f1ea');
export const MOUTH = C('#4a1820');

/** Indoctrination glow colours per act (never TELEGRAPH). */
export const ACT_GLOW: Record<number, string> = { 1: '#7ff0d8', 2: '#6fe8ff', 3: '#8cc8ff', 4: '#ffd27a' };
/** Indoctrinated pupils (Act 3+): saturated so they read as a glow, not as blank eyes. */
export const ACT_EYE: Record<number, string> = { 1: '#40e0c0', 2: '#30d0ff', 3: '#3aa8ff', 4: '#ffb020' };
export const ACT_STRAP: Record<number, string> = { 1: '#3f8f9a', 2: '#2bb5c8', 3: '#2e4f86', 4: '#9a1a2a' };
