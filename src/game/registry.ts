// Extension points for content modules (bosses, special floors, rewards, run-level effects).
// Content modules register here; the gameplay scene looks them up. Modules are auto-loaded from src/game/content/*.ts,
// src/game/bosses/*.ts and src/game/enemies/*.ts by src/game/autoload.ts.
import type { GameplayScene } from '../scenes/gameplay';
import type { FloorMap, FloorRequest } from './world-types';
import type { FloorType, RewardKind, Act } from '../data/ids';
import type { Vec } from '../core/math';

/** Special floor set-up (shop, event, treasure, challenge, director's office, lift ambush extras). Runs after enemies are placed. */
export const FLOOR_SETUP: Partial<Record<FloorType, (s: GameplayScene) => void>> = {};

/** Boss floors (spec 6). buildMap replaces procedural generation; setup spawns the boss and arena logic. */
export interface BossFloorDef {
  buildMap(req: FloorRequest): FloorMap;
  setup(s: GameplayScene): void;
  music: 'boss1' | 'boss2' | 'boss3' | 'boss4';
}
export const BOSS_FLOORS: Partial<Record<Act, BossFloorDef>> = {};

/** Reward grant on floor clear (spec 3.3/8.4). Spawns a pickup or opens a UI at `at`. */
export const REWARD_GRANT: Partial<Record<RewardKind, (s: GameplayScene, at: Vec) => void>> = {};

/** Run-level hooks: called when a floor's world has been created (benefit/desk-item effects subscribe to world.bus here). */
export const FLOOR_HOOKS: ((s: GameplayScene) => void)[] = [];

/** Called when a run ends (death or victory) before the summary — promotion, Annual Leave, achievements, leaderboards. */
export const RUN_END_HOOKS: ((s: GameplayScene, won: boolean) => void)[] = [];

/** Called once when a new run begins (role kit, starting benefits, promoted roster insertion planning). */
export const RUN_START_HOOKS: ((s: GameplayScene) => void)[] = [];

/** Scenes provided by other modules (resolved lazily to avoid import cycles). */
export const SCENES: {
  hub?: () => import('../core/app').Scene;
  summary?: (s: GameplayScene, won: boolean, onDone: () => void) => import('../core/app').Scene;
  ending?: (s: GameplayScene, onDone: () => void) => import('../core/app').Scene;
  intro?: (onDone: () => void) => import('../core/app').Scene;
  mainMenu?: () => import('../core/app').Scene;
} = {};
