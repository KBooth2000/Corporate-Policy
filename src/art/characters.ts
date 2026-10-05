// CHARACTER ART CONTRACT (spec 5.3, 9.1). Procedural modular pixel characters.
// Implementation: 2 base rigs × 3 builds; ≤6 layers (body, outfit, head, hair, accessory, anchor item);
// all animations shared per rig; each individual baked into a runtime atlas when spawned (spec 10.1).
import type { Rng } from '../core/rng';
import type { ArchetypeId, PlayerRoleId, Tier } from '../data/ids';
import type { Ctx } from '../render/canvas';
import { makeCanvas, ctx2d, ellipse, rect } from '../render/canvas';

export type AnimName =
  | 'idle' | 'walk' | 'run' | 'attack1' | 'attack2' | 'attack3' | 'heavy' | 'throw' | 'cast'
  | 'hit' | 'stagger' | 'grabbed' | 'thrown' | 'knockdown' | 'getup' | 'dash'
  | 'death1' | 'death2' | 'death3'
  | 'exec_slam' | 'exec_hurl' | 'exec_hold' | 'victim_slam' | 'victim_shock'
  | 'flee' | 'chant' | 'celebrate' | 'sit' | 'rage';

export const ANIMS: AnimName[] = ['idle', 'walk', 'run', 'attack1', 'attack2', 'attack3', 'heavy', 'throw', 'cast', 'hit', 'stagger', 'grabbed', 'thrown', 'knockdown', 'getup', 'dash', 'death1', 'death2', 'death3', 'exec_slam', 'exec_hurl', 'exec_hold', 'victim_slam', 'victim_shock', 'flee', 'chant', 'celebrate', 'sit', 'rage'];

/** Looping animations; others play once and hold the last frame. */
export const LOOPING: Set<AnimName> = new Set(['idle', 'walk', 'run', 'grabbed', 'thrown', 'flee', 'chant', 'celebrate', 'sit', 'stagger', 'exec_hold', 'victim_shock', 'rage']);

/** JSON-serialisable description of one individual (persisted for promoted enemies). */
export interface CharacterLook {
  kind: 'enemy' | 'player' | 'npc';
  archetype?: ArchetypeId;
  role?: PlayerRoleId;
  tier: Tier;
  rig: 'A' | 'B';
  build: 'slim' | 'average' | 'heavy';
  seed: number;
  /** Free-form layer choices chosen by the generator (indices/colours). */
  layers: Record<string, number | string>;
  /** Promotion rank 0..4 (0 = never promoted) – adds visual flair. */
  promotedRank?: number;
  /** Enemy is re-onboarded (Culture Champion revive) – fresh lanyard glow. */
  reonboarded?: boolean;
}

export interface DrawOpts {
  /** 0..1 white hit-flash. */
  flash?: number;
  alpha?: number;
  /** Solid tint overlay (e.g. electrified blue), with strength 0..1. */
  tint?: string; tintAmt?: number;
  /** Vertical squash for landing/impacts (1 = none). */
  squash?: number;
  /** Rotation in radians around feet (thrown spin / corpses). */
  rot?: number;
  /** Rage aura on the player. */
  rage?: boolean;
}

export interface BakedCharacter {
  look: CharacterLook;
  /** Pixel height of the character (feet to top of head). */
  height: number;
  /** Draw at feet position (x, y). dir: 0 down, 1 right, 2 up, 3 left (left = mirrored right). t = seconds into the anim. */
  draw(g: Ctx, anim: AnimName, dir: number, t: number, x: number, y: number, opts?: DrawOpts): void;
  /** Duration in seconds of one cycle of an animation. */
  duration(anim: AnimName): number;
  /** Weapon hand offset relative to feet, and whether the weapon draws behind the body. */
  hand(anim: AnimName, dir: number, t: number): { x: number; y: number; behind: boolean };
  /** 24×24 head-and-shoulders portrait for UI (noticeboard, intro cards, emails). */
  portrait: HTMLCanvasElement;
  /** Gib sprites for dismemberment: [head, torso, armL, armR, legL, legR]. */
  gibs: HTMLCanvasElement[];
  /** Drop shadow width in px. */
  shadowW: number;
}

export interface LookSpec { kind: CharacterLook['kind']; archetype?: ArchetypeId; role?: PlayerRoleId; tier?: Tier; }

// ----------------------------------------------------------------------------
// Placeholder implementation (replaced by the art module). Keeps the game runnable.
export function rollLook(spec: LookSpec, rng: Rng): CharacterLook {
  return { kind: spec.kind, archetype: spec.archetype, role: spec.role, tier: spec.tier ?? 0, rig: rng.chance(0.5) ? 'A' : 'B', build: rng.pick(['slim', 'average', 'heavy'] as const), seed: rng.nextU32(), layers: {} };
}

export function bakeCharacter(look: CharacterLook): BakedCharacter {
  const col = look.kind === 'player' ? '#3a6ea5' : '#a5503a';
  const portrait = makeCanvas(24, 24);
  rect(ctx2d(portrait), 6, 4, 12, 16, col);
  const gib = makeCanvas(6, 6);
  rect(ctx2d(gib), 0, 0, 6, 6, col);
  return {
    look, height: 30, shadowW: 12, portrait, gibs: [gib, gib, gib, gib, gib, gib],
    draw(g, _anim, _dir, _t, x, y, o) {
      g.globalAlpha = o?.alpha ?? 1;
      ellipse(g, x, y - 1, 6, 2, 'rgba(0,0,0,0.3)');
      rect(g, x - 6, y - 26, 12, 26, o?.flash ? '#fff' : col);
      rect(g, x - 4, y - 32, 8, 8, '#e8b996');
      g.globalAlpha = 1;
    },
    duration: () => 0.6,
    hand: (_a, dir) => ({ x: dir === 3 ? -6 : 6, y: -14, behind: dir === 2 }),
  };
}
