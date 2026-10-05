// Player stat block + modifier aggregation + gameplay event hooks used by Benefits / Desk Items / modifiers (spec 7).
import { Emitter } from '../core/events';
import type { Actor } from './entity';
import type { ExecType } from '../data/ids';

export interface PlayerStats {
  maxHp: number;
  maxShield: number;
  shieldRegenDelay: number;   // s without damage before regen
  shieldRegenRate: number;    // shield per s
  moveSpeed: number;          // px/s
  dashCharges: number;
  dashCooldown: number;       // s per charge
  dashDistance: number;       // px
  meleeDamage: number;        // multiplier
  meleeSpeed: number;         // multiplier on attack rate
  heavyDamage: number;        // multiplier
  rangedDamage: number;       // multiplier
  throwDamage: number;        // multiplier
  ammoMult: number;
  durabilityMult: number;
  critChance: number;         // 0..1
  critMult: number;
  rageFill: number;           // multiplier on all rage gains
  rageJargonFill: number;     // extra multiplier for barks
  rageDuration: number;       // s
  rageDamage: number;         // multiplier while raging
  rageResist: number;         // damage reduction while raging 0..1
  rageDecay: number;          // multiplier on decay
  grabThreshold: number;      // hp fraction
  grabRange: number;          // px
  hazardDamage: number;       // multiplier: hazard damage dealt to enemies
  hazardTaken: number;        // multiplier: hazard damage taken by player
  knockbackTaken: number;
  damageTaken: number;
  shopDiscount: number;       // 0..1
  cashMult: number;
  healMult: number;
  breachStun: number;         // multiplier
  breachCash: number;         // multiplier
  executionHeal: number;      // hp per execution
  executionRageExtend: number;// s added to active rage per execution
  killHeal: number;           // hp per kill
  rageKillHeal: number;       // hp per kill while raging
  bleedDamage: number;        // multiplier
  knockbackDealt: number;     // multiplier
  staggerDealt: number;       // multiplier
  luck: number;               // better drops 0..1
}

export const BASE_STATS: PlayerStats = {
  maxHp: 100, maxShield: 30, shieldRegenDelay: 3.0, shieldRegenRate: 14,
  moveSpeed: 96, dashCharges: 2, dashCooldown: 1.15, dashDistance: 58,
  meleeDamage: 1, meleeSpeed: 1, heavyDamage: 1, rangedDamage: 1, throwDamage: 1, ammoMult: 1, durabilityMult: 1,
  critChance: 0.05, critMult: 1.75,
  rageFill: 1, rageJargonFill: 1, rageDuration: 7, rageDamage: 1.6, rageResist: 0.4, rageDecay: 1,
  grabThreshold: 0.25, grabRange: 26, hazardDamage: 1, hazardTaken: 1, knockbackTaken: 1, damageTaken: 1,
  shopDiscount: 0, cashMult: 1, healMult: 1, breachStun: 1, breachCash: 1, executionHeal: 0, executionRageExtend: 0,
  killHeal: 0, rageKillHeal: 0, bleedDamage: 1, knockbackDealt: 1, staggerDealt: 1, luck: 0,
};

export type StatKey = keyof PlayerStats;

export interface StatMod { stat: StatKey; add?: number; mult?: number; source: string; }

export function computeStats(mods: StatMod[], base: PlayerStats = BASE_STATS): PlayerStats {
  const s = { ...base };
  // additive first, then multiplicative
  for (const m of mods) if (m.add) (s[m.stat] as number) += m.add;
  for (const m of mods) if (m.mult !== undefined) (s[m.stat] as number) *= m.mult;
  s.critChance = Math.min(0.95, Math.max(0, s.critChance));
  s.rageResist = Math.min(0.85, s.rageResist);
  s.shopDiscount = Math.min(0.9, s.shopDiscount);
  s.dashCharges = Math.max(1, Math.round(s.dashCharges));
  return s;
}

export type KillMethod = 'melee' | 'heavy' | 'ranged' | 'throw' | 'body' | 'hazard' | 'execution' | 'bleed' | 'rage' | 'fall' | 'breach' | 'other';

/** Gameplay events. Benefits/Desk Items subscribe to these. */
export interface GameEvents extends Record<string, unknown> {
  kill: { victim: Actor; killer: Actor | null; method: KillMethod; hazardKind?: string; weaponId?: string };
  hit: { target: Actor; amount: number; crit: boolean; method: KillMethod; weaponId?: string };
  playerHit: { amount: number; source: Actor | null; method: KillMethod; absorbed: number };
  playerDeath: { killer: Actor | null; method: KillMethod; weaponId?: string };
  dash: { x: number; y: number; dirX: number; dirY: number };
  dashEnd: { x: number; y: number };
  roomLock: { roomId: number };
  roomClear: { roomId: number };
  floorStart: { floor: number };
  floorClear: { floor: number };
  execution: { type: ExecType | 'boss' | 'inplace'; victim: Actor };
  breach: { roomA: number; roomB: number };
  rageStart: Record<string, never>;
  rageEnd: Record<string, never>;
  rageFull: Record<string, never>;
  grab: { victim: Actor };
  throwHit: { victim: Actor; hitActor: Actor | null };
  pickup: { kind: string; id?: string; amount?: number };
  weaponBreak: { id: string; slot: 'melee' | 'ranged' | 'thrown' };
  bark: { speaker: Actor; text: string };
  shopBuy: { kind: string; price: number };
  enemySpawn: { enemy: Actor };
}

export class GameBus extends Emitter<GameEvents> {}
