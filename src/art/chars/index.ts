// Public helpers for the character system (re-exported for gameplay and the boss artist).
//
// BOSS ARTIST QUICK START (96×96 bosses in the same style):
//   import { PixBuf, PROPS, scaleProps, animPose, drawFigure, resolveDress, outlineRect, toCanvas } from '../art/chars';
//   const d = resolveDress(rollLook({ kind: 'enemy', archetype: 'svp', tier: 2 }, rng)); // or build a Dress by hand
//   const big = { ...d, prop: scaleProps(PROPS.A.heavy, 2.2) };                         // ~70 px tall
//   const b = new PixBuf(96, 96, true);
//   drawFigure(b, null, big, animPose('idle', 0, { carry: big.carry, blinks: false, heavy: true }), 'front', 48, 92, { f: 0, n: 4 });
//   outlineRect(b, 0, 0, 96, 96, OUT);  const canvas = toCanvas(b);
// Lower-level pieces (skeleton, drawLeg, drawTorso, drawArm, drawHead, drawHair, smileHR, drawHeld,
// drawLanyard, ramp/skinRamp) can be composed directly for bespoke boss bodies. Face features are
// 1px-scale; at 2×+ draw the head at 1× into its own PixBuf and upscale with scaleBuf().
export { PixBuf, C, Ca, mixCol, rotateInto, outlineRect, toCanvas } from './pixbuf';
export type { Col } from './pixbuf';
export { ramp, skinRamp, SKIN_TONES, HAIR_NATURAL, HAIR_DYED, FAB, ACT_GLOW, ACT_STRAP, GOLD, SILVER, OUT, HIVIS_LIME, HIVIS_ORANGE } from './colours';
export { PROPS, skeleton, project, ik, drawLeg, drawSkirt, drawTorso, drawArm, tx as torsoX, tcx as torsoCentreX, farRamp } from './rig';
export type { Skel, TorsoRow, P2 } from './rig';
export { drawHead, drawHair, headSpans, smileHR, eyeRow, mouthRow, eyeXs } from './head';
export type { HeadBox } from './head';
export { drawHeld, drawLanyard, drawFlair, drawBeltKit, drawBag, TAG_GLOW } from './items';
export { drawFigure } from './figure';
export { animPose, TIMING, CARRY_HAND } from './poses';
export type { Pose, PoseCtx, V3, Expr } from './poses';
export { resolveDress, rollLayers, withAct, kitFor, LOOK_VERSION } from './look';
export { KITS, ROLE_KITS, STAFF_KIT, HEADS, HAIR_WEIGHTS } from './kits';
export { bakeImpl as bakeCharacterEx, prewarmImpl, bakeAllAnims, setCharacterShadows, lastBakeStats, bakeTimings, INITIAL_ANIMS, PREWARM_ORDER, makePortrait, portraitLarge, CELL_W, CELL_H, CELL_OX, CELL_OY } from './bake';
export type { BakedCharacterEx, BakeStats } from './bake';
export type * from './types';

import type { Proportions } from './types';
import { PixBuf as PB } from './pixbuf';

/** Scale body proportions for bigger figures (bosses). Integer-rounded. */
export function scaleProps(p: Proportions, k: number): Proportions {
  const o = {} as Proportions;
  for (const key of Object.keys(p) as (keyof Proportions)[]) o[key] = Math.max(1, Math.round(p[key] * k));
  o.belly = Math.round(p.belly * k);
  return o;
}

/** Nearest-neighbour integer upscale of a PixBuf (e.g. draw a 1× head, blow it up 2× for a boss). */
export function scaleBuf(src: PB, k: number): PB {
  const out = new PB(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.d[y * out.w + x] = src.d[Math.floor(y / k) * src.w + Math.floor(x / k)];
  out.bx0 = src.bx0 * k; out.by0 = src.by0 * k; out.bx1 = src.bx1 * k + k - 1; out.by1 = src.by1 * k + k - 1;
  return out;
}
