// Animation poses shared by both rigs (spec 5.3: "all animations shared per rig").
//
// Poses are authored once in BODY SPACE and projected into the front, side and back views by the
// rig (rig.ts), so every animation exists in all 4 directions without per-view authoring.
// Body space: x = towards the character's right, y = up, z = forward (the facing direction).
// Arm targets are hand positions relative to the shoulder joint with x measured OUTWARD from the
// body (so the same numbers work for either arm). Leg targets are foot offsets from the rest foot.
import type { AnimName } from '../characters';
import type { Carry, View } from './types';

export type V3 = [number, number, number];

export type Expr = 'base' | 'pain' | 'dazed' | 'shout' | 'dead' | 'scared' | 'chant' | 'happy' | 'shock' | 'strain' | 'rage' | 'blink';

export interface Pose {
  /** Root offset (body space). y > 0 lifts the whole body off the floor. */
  root: V3;
  /** Hip drop in px (bends the knees). */
  crouch: number;
  /** Shoulders forward (z) relative to hips. */
  lean: number;
  /** Shoulders sideways (x) relative to hips. */
  sway: number;
  /** Torso shortening in px (hunch/bow). */
  bend: number;
  /** Extra head offset (body space). */
  head: V3;
  armR: V3; armL: V3;
  legR: V3; legL: V3;
  expr: Expr;
  /** Quarter turns added to the facing direction (spins). */
  turn: number;
  /** Quarter turns clockwise applied to the finished upright figure (lying, thrown spin). */
  rot: number;
  /** Pivot height above the feet for `rot`. */
  pivot: number;
  /** Where the rotation pivot lands after `rot`: [forward px, height above the feet px]. */
  shift: [number, number];
  /** Force a view (lying face-down shows the back, etc). */
  view?: View;
  /** Mirror the forced side view (spins). */
  flip?: boolean;
  /** Draw the left-hand item. */
  holdL: boolean;
  /** Effects drawn on the un-outlined FX layer. */
  fx: string[];
  /** 0..1 multiplier for the lanyard glow (fades when unconscious/dead). */
  glow: number;
  hairUp: boolean;
  xray: boolean;
  /** Arms splayed flat (lying poses): elbows don't bend backwards. */
  limp: boolean;
}

/** Per-frame durations in seconds. Frame counts follow the brief (idle 4, walk 6, run 6 …). */
export const TIMING: Record<AnimName, number[]> = {
  idle: [0.22, 0.18, 0.22, 0.18],
  walk: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  run: [0.075, 0.075, 0.075, 0.075, 0.075, 0.075],
  attack1: [0.06, 0.05, 0.08, 0.1],
  attack2: [0.06, 0.05, 0.08, 0.1],
  attack3: [0.08, 0.06, 0.05, 0.1, 0.12],
  heavy: [0.12, 0.12, 0.14, 0.05, 0.14, 0.14],
  throw: [0.08, 0.08, 0.06, 0.12],
  cast: [0.08, 0.1, 0.12, 0.12, 0.1],
  hit: [0.08, 0.12],
  stagger: [0.15, 0.15, 0.15, 0.15],
  grabbed: [0.1, 0.1, 0.1, 0.1],
  thrown: [0.06, 0.06, 0.06, 0.06],
  knockdown: [0.06, 0.08, 0.1, 0.2],
  getup: [0.12, 0.12, 0.1, 0.08],
  dash: [0.04, 0.08, 0.08],
  death1: [0.08, 0.1, 0.12, 0.1, 0.4],
  death2: [0.05, 0.07, 0.07, 0.1, 0.4],
  death3: [0.07, 0.07, 0.07, 0.07, 0.1, 0.4],
  exec_slam: [0.1, 0.12, 0.14, 0.06, 0.2],
  exec_hurl: [0.1, 0.12, 0.08, 0.06, 0.2],
  exec_hold: [0.25, 0.25],
  victim_slam: [0.1, 0.12, 0.08, 0.3],
  victim_shock: [0.05, 0.05, 0.05, 0.05],
  flee: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
  chant: [0.25, 0.25, 0.25, 0.25],
  celebrate: [0.12, 0.12, 0.12, 0.12],
  sit: [0.6, 0.6],
  rage: [0.1, 0.1, 0.1, 0.1],
};

/** Off-hand rest target per carry style (hand relative to the shoulder, x outward). */
export const CARRY_HAND: Record<Carry, V3> = {
  none: [1, -9, 0],
  tray: [-1, -6, 5],
  side: [1.5, -9, 0],
  chest: [-3, -4, 4],
  shield: [-4, -5, 6],
  shoulder: [-2, -3, 3],
  raised: [-2, 1, 5],
  upright: [1, -6, 3],
  cup: [0, -6, 4],
  phone: [-2, -4, 5],
  point: [2, -1, 7],
};

export interface PoseCtx {
  carry: Carry;
  /** Player/npc blink in idle; enemies never blink (unsettling). */
  blinks: boolean;
  heavy: boolean;
}

function base(ctx: PoseCtx): Pose {
  return {
    root: [0, 0, 0], crouch: 0, lean: 0, sway: 0, bend: 0, head: [0, 0, 0],
    armR: [1, -9, 0], armL: [...CARRY_HAND[ctx.carry]] as V3,
    legR: [0, 0, 0], legL: [0, 0, 0],
    expr: 'base', turn: 0, rot: 0, pivot: 0, shift: [0, 0], holdL: true, fx: [], glow: 1,
    hairUp: false, xray: false, limp: false,
  };
}

const carrying = (ctx: PoseCtx) => ctx.carry !== 'none';
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Lying flat on the back (face up), head towards the back of the facing direction. */
function lyingSupine(ctx: PoseCtx, p: Pose): Pose {
  p.view = 'front';
  p.rot = 3; // head ends up behind the facing direction
  p.pivot = 13;
  p.shift = [0, 6];
  p.armR = [3, 3, 0]; p.armL = [3, -3, 0];
  p.legR = [1, 0, 0]; p.legL = [-0.5, 0, 0];
  p.limp = true; p.glow = 0; p.expr = 'dead';
  // held items are dropped when the body hits the floor (gameplay spawns the pickup)
  p.holdL = false;
  void ctx;
  return p;
}

/** Lying face-down, head towards the facing direction. */
function lyingProne(ctx: PoseCtx, p: Pose): Pose {
  lyingSupine(ctx, p);
  p.view = 'back';
  p.rot = 1;
  p.armR = [3, 2, 0]; p.armL = [2, -4, 0];
  p.legR = [0, 0, 0]; p.legL = [1, 0, 0];
  return p;
}

/** Curled on the side. */
function lyingSide(ctx: PoseCtx, p: Pose): Pose {
  p.view = 'side';
  p.rot = 1; p.pivot = 11; p.shift = [0, 6];
  p.crouch = 3; p.lean = 3; p.bend = 1;
  p.armR = [0, -4, 6]; p.armL = [0, -5, 5];
  p.legR = [0, 3, 5]; p.legL = [0, 2, 3];
  p.limp = true; p.glow = 0; p.expr = 'dead'; p.holdL = false;
  return p;
}

/**
 * Pose for frame `f` of `anim`. Pure and deterministic; the rig projects it into each view.
 */
export function animPose(anim: AnimName, f: number, ctx: PoseCtx): Pose {
  const p = base(ctx);
  const carryL = carrying(ctx);
  const n = TIMING[anim].length;
  const ph = (f / n) * Math.PI * 2;
  switch (anim) {
    case 'idle': {
      const b = [0, 0, 1, 1][f];
      p.bend = b; // breathing: shoulders settle by a pixel
      p.armR = [1, -9 + b * 0, 0];
      if (ctx.heavy) p.armR = [2, -9, 0];
      if (ctx.blinks && f === 3) p.expr = 'blink';
      break;
    }
    case 'walk': {
      const c = Math.cos(ph), s = Math.sin(ph);
      p.legR = [0, Math.max(0, -s) * 2, 3 * c];
      p.legL = [0, Math.max(0, s) * 2, -3 * c];
      p.root[1] = Math.abs(s) > 0.6 ? 1 : 0;
      p.armR = [1, -9, -2.5 * c];
      if (!carryL) p.armL = [1, -9, 2.5 * c];
      else p.armL = add(p.armL, [0, 0, 0]);
      break;
    }
    case 'run': {
      const c = Math.cos(ph), s = Math.sin(ph);
      p.legR = [0, Math.max(0, -s) * 3, 5 * c];
      p.legL = [0, Math.max(0, s) * 3, -5 * c];
      p.root[1] = Math.abs(s) > 0.6 ? 2 : 0;
      p.crouch = Math.abs(s) > 0.6 ? 0 : 1;
      p.lean = 2;
      p.head = [0, 0, 1];
      p.armR = [1, -6, -4 * c];
      if (!carryL) p.armL = [1, -6, 4 * c];
      break;
    }
    case 'attack1': {
      // forehand: wind back and up, snap forward, follow through across the body
      const R: V3[] = [[3, 2, -5], [1, -2, 10], [-5, -5, 6], [1, -7, 2]];
      p.armR = R[f];
      p.lean = [-1, 2, 2, 1][f];
      p.sway = [1, 0, -1, 0][f];
      p.legR = [0, 0, [0, 2, 2, 1][f]];
      p.crouch = [0, 1, 1, 0][f];
      p.expr = f === 1 || f === 2 ? 'shout' : 'base';
      break;
    }
    case 'attack2': {
      // backhand: start across the body, sweep outward
      const R: V3[] = [[-5, 0, 4], [4, -2, 9], [7, -4, 1], [2, -7, 1]];
      p.armR = R[f];
      p.lean = [0, 2, 1, 0][f];
      p.sway = [-1, 1, 1, 0][f];
      p.legL = [0, 0, [1, 2, 1, 0][f]];
      p.crouch = [0, 1, 1, 0][f];
      p.expr = f === 1 || f === 2 ? 'shout' : 'base';
      break;
    }
    case 'attack3': {
      // finisher: overhead chop
      const R: V3[] = [[1, 7, -2], [1, 9, -1], [0, -3, 10], [0, -6, 9], [1, -8, 3]];
      p.armR = R[f];
      p.root[1] = [0, 1, 0, 0, 0][f];
      p.lean = [-2, -2, 3, 3, 1][f];
      p.crouch = [1, 0, 2, 3, 1][f];
      p.legR = [0, 0, [0, 0, 3, 3, 1][f]];
      p.expr = f >= 1 && f <= 3 ? 'shout' : 'base';
      if (f === 3) p.fx.push('impact');
      if (!carryL) p.armL = [[2, -6, 0], [2, -5, -1], [1, -6, 3], [1, -7, 2], [1, -8, 0]][f] as V3;
      break;
    }
    case 'heavy': {
      // big two-handed windup then slam
      const R: V3[] = [[0, 2, 3], [0, 9, 0], [0, 10, -2], [0, -1, 10], [0, -6, 9], [1, -8, 4]];
      p.armR = R[f];
      p.armL = [R[f][0] - 1, R[f][1] - 1, R[f][2]] as V3;
      p.root[1] = [0, 0, 1, 0, 0, 0][f];
      p.crouch = [1, 0, 0, 2, 4, 2][f];
      p.lean = [0, -2, -3, 3, 4, 1][f];
      p.legR = [0, 0, [0, 0, 0, 3, 3, 2][f]];
      p.legL = [0, 0, [0, 0, 0, -1, -1, 0][f]];
      p.expr = f >= 1 ? 'strain' : 'base';
      if (f >= 3) p.expr = 'shout';
      if (f === 4) p.fx.push('impact', 'impact_big');
      break;
    }
    case 'throw': {
      const R: V3[] = [[3, 3, -6], [2, 5, -4], [0, 2, 10], [-3, -5, 7]];
      p.armR = R[f];
      p.lean = [-2, -2, 3, 2][f];
      p.sway = [1, 1, -1, 0][f];
      p.legR = [0, 0, [-1, -1, 2, 2][f]];
      p.legL = [0, 0, [1, 1, 0, 0][f]];
      p.expr = f === 2 ? 'shout' : 'base';
      break;
    }
    case 'cast': {
      // support ability: both hands raised forward, glow sparkles
      const R: V3[] = [[0, -5, 5], [0, -1, 7], [1, 3, 7], [1, 3, 7], [0, -4, 5]];
      p.armR = R[f];
      p.armL = R[f];
      p.root[1] = [0, 0, 1, 1, 0][f];
      p.lean = [0, 1, 1, 1, 0][f];
      p.expr = f >= 1 && f <= 3 ? 'chant' : 'base';
      if (f >= 1 && f <= 3) p.fx.push('cast' + f);
      p.glow = f >= 2 && f <= 3 ? 1.6 : 1;
      break;
    }
    case 'hit': {
      p.root[2] = [-2, -1][f];
      p.lean = [-3, -1][f];
      p.head = [[0, 1, -1], [0, 0, 0]][f] as V3;
      p.armR = [[3, -6, -2], [2, -8, -1]][f] as V3;
      if (!carryL) p.armL = [[3, -6, -2], [2, -8, -1]][f] as V3;
      p.crouch = [0, 1][f];
      p.expr = 'pain';
      break;
    }
    case 'stagger': {
      const sw = [1, 0, -1, 0][f];
      p.sway = sw;
      p.crouch = 1;
      p.bend = 1;
      p.head = [sw, -1, 0];
      p.armR = [3, -9, -1];
      if (!carryL) p.armL = [3, -9, -1];
      p.legR = [0.5, 0, 0]; p.legL = [0.5, 0, 0];
      p.expr = 'dazed';
      p.fx.push('stars' + f);
      p.glow = 0.5;
      break;
    }
    case 'grabbed': {
      // dangling a few px off the floor, legs kicking, arms flailing
      p.root[1] = 3;
      p.legR = [0, [2, 0, 1, 0][f], [2, -1, 1, -2][f]];
      p.legL = [0, [0, 2, 0, 1][f], [-1, 2, -2, 1][f]];
      p.armR = [[3, 2, 2], [4, 0, 3], [3, 3, 1], [4, -1, 2]][f] as V3;
      p.armL = [[4, 0, 3], [3, 2, 2], [4, -1, 2], [3, 3, 1]][f] as V3;
      p.lean = -1;
      p.head = [0, 0, -1];
      p.expr = f % 2 ? 'scared' : 'pain';
      p.glow = 0.7;
      break;
    }
    case 'thrown': {
      // starfish pinwheel, drawn front-on and rotated in quarter turns
      p.view = 'front';
      p.rot = f;
      p.pivot = 12;
      p.shift = [0, 12];
      p.armR = [5, 3, 0]; p.armL = [5, 3, 0];
      p.legR = [2, 0, 0]; p.legL = [2, 0, 0];
      p.expr = 'scared';
      p.glow = 0.6;
      p.holdL = false;
      break;
    }
    case 'knockdown': {
      if (f === 0) { p.root[2] = -2; p.lean = -3; p.armR = [3, -5, 3]; if (!carryL) p.armL = [3, -5, 3]; p.expr = 'pain'; }
      else if (f === 1) { p.root = [0, 1, -4]; p.lean = -5; p.crouch = 3; p.armR = [4, 0, 3]; p.armL = [4, 0, 3]; p.legR = [0, 2, 3]; p.legL = [0, 1, 2]; p.expr = 'pain'; }
      else { lyingSupine(ctx, p); p.expr = 'dazed'; p.glow = 0.3; if (f === 2) { p.shift = [0, 7]; p.fx.push('dust'); } }
      break;
    }
    case 'getup': {
      if (f === 0) { lyingSupine(ctx, p); p.expr = 'dazed'; p.glow = 0.3; }
      else if (f === 1) {
        // sitting up on the floor, hands behind
        p.crouch = 6; p.lean = -1; p.armR = [2, -6, -3]; p.armL = [2, -6, -3];
        p.legR = [0, 0, 5]; p.legL = [0, 0, 6]; p.expr = 'dazed'; p.glow = 0.5;
      } else if (f === 2) {
        p.crouch = 4; p.lean = 2; p.armR = [1, -7, 3]; if (!carryL) p.armL = [1, -7, 2];
        p.legR = [0, 2, 3]; p.legL = [0, 0, -2];
      } else { p.crouch = 1; p.lean = 1; }
      break;
    }
    case 'dash': {
      p.lean = [1, 4, 2][f];
      p.crouch = [1, 1, 0][f];
      p.root[1] = [0, 1, 0][f];
      p.armR = [[1, -8, -2], [2, -5, -6], [1, -7, -3]][f] as V3;
      if (!carryL) p.armL = [[1, -8, -2], [2, -5, -6], [1, -7, -3]][f] as V3;
      p.legR = [0, [0, 1, 0][f], [1, 4, 2][f]];
      p.legL = [0, [0, 2, 1][f], [-1, -4, -2][f]];
      p.head = [0, 0, [0, 1, 1][f]];
      if (f >= 1) p.fx.push('smear' + f);
      break;
    }
    case 'death1': {
      // collapse: recoil, knees buckle, kneel, pitch forward, face-down
      if (f === 0) { p.root[2] = -1; p.lean = -2; p.armR = [3, -7, -1]; p.expr = 'pain'; }
      else if (f === 1) { p.crouch = 3; p.lean = 1; p.bend = 1; p.head = [0, -1, 1]; p.armR = [2, -9, 1]; p.armL = [2, -9, 1]; p.legR = [0, 0, 1]; p.expr = 'pain'; p.glow = 0.6; }
      else if (f === 2) { p.crouch = 6; p.lean = 3; p.bend = 2; p.head = [0, -1, 1]; p.armR = [1, -9, 3]; p.armL = [1, -9, 3]; p.legR = [0, 0, 3]; p.legL = [0, 0, 3]; p.expr = 'dead'; p.glow = 0.3; }
      else if (f === 3) { lyingProne(ctx, p); p.shift = [3, 8]; p.fx.push('dust'); }
      else { lyingProne(ctx, p); p.shift = [4, 6]; }
      break;
    }
    case 'death2': {
      // blown backwards: launched, airborne horizontal, land, slide
      if (f === 0) { p.root = [0, 1, -2]; p.lean = -4; p.armR = [3, 0, 6]; p.armL = [3, 0, 6]; p.legR = [0, 1, 3]; p.legL = [0, 0, 2]; p.expr = 'shock'; p.head = [0, 0, -1]; }
      else { lyingSupine(ctx, p); p.armR = [4, 0, 4]; p.armL = [4, 1, 3]; p.legR = [1, 1, 2]; p.legL = [0, 0, 1]; }
      if (f === 1) { p.shift = [-6, 11]; p.expr = 'shock'; p.glow = 0.5; p.fx.push('blow'); }
      if (f === 2) { p.shift = [-9, 7]; p.fx.push('dust'); }
      if (f === 3) { p.shift = [-10, 6]; p.armR = [3, 3, 0]; p.armL = [3, -3, 0]; p.legR = [1, 0, 0]; p.legL = [-0.5, 0, 0]; }
      if (f === 4) { p.shift = [-10, 6]; p.armR = [3, 3, 0]; p.armL = [3, -3, 0]; p.legR = [1, 0, 0]; p.legL = [-0.5, 0, 0]; }
      break;
    }
    case 'death3': {
      // spin and crumple: turn through the views, sag, curl up on the floor
      if (f <= 3) {
        p.turn = f;
        p.armR = [5, -3, 0]; p.armL = [5, -4, 0];
        p.crouch = f; p.lean = f > 1 ? 1 : 0;
        p.expr = f === 0 ? 'shock' : 'pain';
        p.glow = 1 - f * 0.25;
        p.legR = [0, f % 2, 1]; p.legL = [0, (f + 1) % 2, -1];
      } else if (f === 4) { p.crouch = 6; p.lean = 4; p.bend = 2; p.armR = [1, -9, 3]; p.armL = [1, -9, 2]; p.legR = [0, 0, 2]; p.legL = [0, 0, -1]; p.expr = 'dead'; p.glow = 0.2; }
      else { lyingSide(ctx, p); }
      break;
    }
    case 'exec_slam': {
      // grip the victim's head, lift, slam into the object in front
      const R: V3[] = [[0, -4, 7], [0, 1, 6], [0, 6, 5], [0, -6, 10], [0, -5, 9]];
      p.armR = R[f];
      p.armL = [R[f][0] + 1, R[f][1] - 1, R[f][2] - 1] as V3;
      p.lean = [1, -1, -2, 4, 3][f];
      p.crouch = [0, 0, 0, 3, 2][f];
      p.legR = [0, 0, [1, 1, 1, 3, 3][f]];
      p.expr = f >= 2 ? 'shout' : 'base';
      p.holdL = false;
      if (f === 3) p.fx.push('impact');
      break;
    }
    case 'exec_hurl': {
      const R: V3[] = [[3, -4, 4], [6, -1, -5], [3, 1, 6], [0, 2, 11], [-4, -4, 7]];
      p.armR = R[f];
      p.armL = [[2, -4, 5], [3, -3, -2], [2, -2, 6], [1, 0, 9], [1, -6, 3]][f] as V3;
      p.lean = [0, -2, 1, 4, 2][f];
      p.sway = [0, 1, 0, -1, 0][f];
      p.crouch = [1, 2, 1, 1, 0][f];
      p.legR = [0, 0, [0, -2, 1, 3, 2][f]];
      p.legL = [0, 0, [0, 1, 0, -1, 0][f]];
      p.expr = f >= 2 ? 'shout' : 'strain';
      p.holdL = false;
      break;
    }
    case 'exec_hold': {
      p.armR = [1, -2, 8];
      p.armL = [0, -3, 7];
      p.lean = 1;
      p.bend = [0, 1][f];
      p.legR = [0, 0, 1];
      p.expr = 'rage';
      p.holdL = false;
      break;
    }
    case 'victim_slam': {
      p.lean = [5, 3, 7, 7][f];
      p.bend = [2, 1, 3, 3][f];
      p.crouch = [2, 1, 3, 3][f];
      p.head = [[0, -1, 1], [0, 1, 0], [0, -3, 2], [0, -3, 2]][f] as V3;
      p.armR = [[3, -5, 3], [4, -2, 2], [4, -6, 5], [1, -9, 3]][f] as V3;
      p.armL = [[4, -3, 2], [3, -4, 4], [4, -6, 5], [1, -9, 3]][f] as V3;
      p.expr = ['scared', 'scared', 'pain', 'dead'][f] as Expr;
      p.glow = [0.6, 0.6, 0.3, 0][f];
      if (f === 2) p.fx.push('impact');
      break;
    }
    case 'victim_shock': {
      // electrocution: stiff starfish jitter alternating with a skeleton flash
      p.armR = [5, -1, 1]; p.armL = [5, -1, 1];
      p.legR = [1, 0, 0]; p.legL = [1, 0, 0];
      p.root[0] = [0, 0, 1, 0][f];
      p.root[1] = [1, 0, 1, 0][f];
      p.hairUp = true;
      p.expr = 'shock';
      p.xray = f % 2 === 1;
      p.fx.push('zap' + f);
      p.glow = f % 2 ? 0 : 2;
      break;
    }
    case 'flee': {
      const c = Math.cos(ph), s = Math.sin(ph);
      p.legR = [0, Math.max(0, -s) * 3, 4 * c];
      p.legL = [0, Math.max(0, s) * 3, -4 * c];
      p.root[1] = Math.abs(s) > 0.6 ? 1 : 0;
      p.lean = 2;
      p.armR = [3, 4 + 2 * s, 1 + c];
      p.armL = [3, 4 - 2 * s, 1 - c];
      p.head = [0, 0, -1];
      p.expr = 'scared';
      p.fx.push('sweat' + (f % 3));
      break;
    }
    case 'chant': {
      // arms raised in synchronised unison (pass a shared clock as t so groups stay in phase)
      const up = [9, 10, 8, 10][f];
      p.armR = [3, up, 1]; p.armL = [3, up, 1];
      p.root[1] = [0, 1, 0, 1][f];
      p.head = [0, [1, 1, 0, 1][f], -1];
      p.expr = f % 2 ? 'chant' : 'happy';
      p.glow = f % 2 ? 1.8 : 1.2;
      break;
    }
    case 'celebrate': {
      p.root[1] = [0, 3, 4, 0][f];
      p.crouch = [2, 0, 0, 1][f];
      p.armR = [[2, -5, 2], [1, 9, 1], [3, 9, 0], [2, 4, 2]][f] as V3;
      if (!carryL) p.armL = [[2, -5, 2], [3, 6, 1], [3, 9, 0], [2, 2, 2]][f] as V3;
      else p.armL = add(CARRY_HAND[ctx.carry], [0, [0, 1, 2, 0][f], 0]);
      p.legR = [0, [0, 1, 1, 0][f], 0]; p.legL = [0, [0, 0, 1, 0][f], 0];
      p.expr = 'happy';
      p.glow = 1.3;
      break;
    }
    case 'sit': {
      // sitting in a car seat: thighs forward, hands on the wheel
      p.crouch = 4;
      p.legR = [0, 0, 6]; p.legL = [0, 0, 6];
      p.lean = -1;
      p.bend = [0, 1][f];
      p.armR = [-1, -3, 6]; p.armL = [-1, -3, 6];
      p.holdL = false;
      break;
    }
    case 'rage': {
      // berserk: hunched, shoulders heaving, fists clenched, steam
      p.lean = 2;
      p.bend = [2, 3, 2, 3][f];
      p.crouch = [1, 2, 1, 2][f];
      p.head = [0, -1, 1];
      p.armR = [3, -7, 2]; p.armL = [3, -7, 2];
      p.legR = [0.5, 0, 1]; p.legL = [0.5, 0, -1];
      p.expr = 'rage';
      p.holdL = false;
      p.fx.push('steam' + f);
      break;
    }
  }
  return p;
}
