// Benefit catalogue registry (spec 7.1). The content module pushes its definitions here.
import type { BenefitDept } from '../data/ids';
import type { RunState } from './run';
import type { GameplayScene } from '../scenes/gameplay';

export interface BenefitDef {
  id: string;
  dept: BenefitDept;
  name: string;
  /** Description per rarity (Standard, Enhanced, Executive). */
  desc: [string, string, string];
  /** Synergy: requires Benefits from both departments. */
  synergy?: [BenefitDept, BenefitDept];
  /** Minimum rarity offered (synergies may start Enhanced). */
  minRarity?: 0 | 1 | 2;
  /** Unlocked from the start (otherwise bought at the hub vending machine). */
  starter?: boolean;
  /** Stat modifiers for a given rarity. */
  mods?: (rarity: 0 | 1 | 2, run: RunState) => import('./stats').StatMod[];
  /** Per-floor behaviour hooks (subscribe to s.world.bus, add player.outgoingMods, etc.). */
  floor?: (s: GameplayScene, rarity: 0 | 1 | 2) => void;
}

export const BENEFITS: BenefitDef[] = [];
const byId = new Map<string, BenefitDef>();
export function registerBenefits(list: BenefitDef[]): void { for (const b of list) { BENEFITS.push(b); byId.set(b.id, b); } }
export function BENEFIT_INFO(id: string): BenefitDef | undefined { return byId.get(id); }
