// Profile save (spec 10.3): unlocks, Annual Leave, promoted roster, KPI progress, statistics. Versioned with migrations.
import { loadVersioned, saveVersioned, removeSave } from '../core/storage';
import type { PlayerRoleId } from '../data/ids';
import type { CharacterLook } from '../art/characters';

export const PROFILE_VERSION = 1;
const KEY = 'profile';

/** Spec 5.6 promoted enemy record (persisted). */
export interface PromotedRecord {
  id: string;
  name: string;
  title: string;
  archetype: string;
  rank: number;            // 1..4 Associate..Director
  look: CharacterLook;
  strengths: string[];
  weakness: string;
  weaknessKnown: boolean;
  kills: { floor: number; weapon: string; method: string; at: number }[];
  terminated?: boolean;
  createdAt: number;
}

export interface LifetimeStats {
  runs: number; wins: number; deaths: number; kills: number; executions: number; defenestrations: number; breaches: number;
  hazardKills: number; bossKills: Record<string, number>; bestFloor: number; totalTime: number; rageActivations: number;
  promotedTerminated: number; cashEarned: number; leaveEarned: number; execByType: Record<string, number>; killsByArchetype: Record<string, number>;
  fastestWin: number; liftAmbushes: number; corridors: number; floorsCleared: number;
}

export interface Profile {
  version: number;
  created: number;
  annualLeave: number;          // permanent meta currency (days)
  unlocks: string[];            // ids of unlocked weapons/benefits/desk items/events/roles/radio tracks/cosmetics
  roles: PlayerRoleId[];
  selectedRole: PlayerRoleId;
  promoted: PromotedRecord[];   // max 10 active (spec 5.6)
  trophies: { id: string; name: string; item: string; at: number }[];
  achievements: string[];
  kpi: number;                  // Performance Review KPI points earned (spec 7.4)
  kpiBest: number;
  prUnlocked: boolean;          // after first CEO kill
  prModifiers: Record<string, number>;
  cosmetics: { outfit: string; title: string; decor: string[] };
  stats: LifetimeStats;
  seenExecutions: string[];
  seenIntro: boolean;
  seenTutorialTips: string[];
  discoveries: string[];        // first-time discoveries (Annual Leave bonus)
  daily: { lastScoredKey: string; history: { key: string; score: number; floor: number; time: number; won: boolean }[] };
  localBoards: Record<string, { name: string; score: number; floor: number; time: number; at: number; assist: boolean }[]>;
  fullGameUnlocked: boolean;    // Android one-time unlock (spec 8.1) — stubbed true until Play Billing is configured
  radio: { track: number; volume: number };
  feats: Record<string, number>;
}

export function freshStats(): LifetimeStats {
  return { runs: 0, wins: 0, deaths: 0, kills: 0, executions: 0, defenestrations: 0, breaches: 0, hazardKills: 0, bossKills: {}, bestFloor: 0, totalTime: 0, rageActivations: 0, promotedTerminated: 0, cashEarned: 0, leaveEarned: 0, execByType: {}, killsByArchetype: {}, fastestWin: 0, liftAmbushes: 0, corridors: 0, floorsCleared: 0 };
}

export function freshProfile(): Profile {
  return {
    version: PROFILE_VERSION, created: Date.now(), annualLeave: 0, unlocks: [], roles: ['office_worker'], selectedRole: 'office_worker',
    promoted: [], trophies: [], achievements: [], kpi: 0, kpiBest: 0, prUnlocked: false, prModifiers: {},
    cosmetics: { outfit: 'default', title: '', decor: [] }, stats: freshStats(), seenExecutions: [], seenIntro: false, seenTutorialTips: [], discoveries: [],
    daily: { lastScoredKey: '', history: [] }, localBoards: {}, fullGameUnlocked: true, radio: { track: 0, volume: 0.8 }, feats: {},
  };
}

const MIGRATIONS = {} as Record<number, (d: any) => any>;

let current: Profile | null = null;

export function profile(): Profile {
  if (!current) {
    const loaded = loadVersioned<Profile>(KEY, PROFILE_VERSION, MIGRATIONS);
    current = { ...freshProfile(), ...(loaded ?? {}) };
    current.stats = { ...freshStats(), ...(current.stats ?? {}) };
  }
  return current;
}

/** Hook for cloud sync providers (Steam Cloud / Play Games saved games). */
export const profileSavedHooks: ((p: Profile) => void)[] = [];

export function saveProfile(): void {
  const p = profile();
  saveVersioned(KEY, PROFILE_VERSION, p);
  for (const h of profileSavedHooks) try { h(p); } catch (e) { console.warn(e); }
}

export function resetProfile(): void {
  removeSave(KEY);
  current = freshProfile();
  saveProfile();
}

export function hasUnlock(id: string): boolean { return profile().unlocks.includes(id); }
export function feat(id: string, add = 1): number { const p = profile(); p.feats[id] = (p.feats[id] ?? 0) + add; return p.feats[id]; }
