// CHARACTER ART CONTRACT (spec 5.3, 9.1). Procedural modular pixel characters.
// Implementation: 2 base rigs × 3 builds; ≤6 layers (body, outfit, head, hair, accessory, anchor item);
// all animations shared per rig; each individual baked into a runtime atlas when spawned (spec 10.1).
// The implementation lives in src/art/chars/ (see chars/index.ts for the reusable humanoid helpers).
import type { Rng } from '../core/rng';
import type { ArchetypeId, PlayerRoleId, Tier } from '../data/ids';
import type { Ctx } from '../render/canvas';
import { rollLookImpl } from './chars/look';
import { bakeImpl, portraitLarge, BakedCharacterEx } from './chars/bake';

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

/**
 * Roll a new individual. Deterministic for a given Rng state; every choice is stored in
 * look.layers (JSON-serialisable). layers.act (1–4) drives the indoctrination escalation and
 * defaults to archetype act + tier; override with withAct(look, act) from './chars'.
 */
export function rollLook(spec: LookSpec, rng: Rng): CharacterLook {
  return rollLookImpl(spec, rng);
}

// ---- bake cache (keyed on the look; LRU so long sessions don't grow without bound) ----
const CACHE_MAX = 32;
const cache = new Map<string, BakedCharacterEx>();

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
}

/** Cache key for a look (stable key order, so looks reloaded from disk hit the cache). */
export function lookKey(look: CharacterLook): string { return stable(look); }

/** Bake (or fetch from cache) every frame of one individual into an atlas. ~5–10 ms on desktop. */
export function bakeCharacter(look: CharacterLook): BakedCharacter {
  const key = lookKey(look);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const b = bakeImpl(look);
  cache.set(key, b);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return b;
}

/** Drop a baked character from the cache (e.g. a Terminated promoted enemy). */
export function releaseCharacter(look: CharacterLook): void { cache.delete(lookKey(look)); }
export function clearCharacterCache(): void { cache.clear(); }

/** Larger head-and-shoulders portrait for intro cards (e.g. size 64 → 64×64 canvas). */
export function drawPortraitLarge(look: CharacterLook, size = 64): HTMLCanvasElement {
  return portraitLarge(look, size);
}
