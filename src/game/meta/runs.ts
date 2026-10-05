// Run start / resume (spec 3.6, 4.6, 7.3, 7.4, 10.3): new runs, the daily run, seed-entered runs and the suspend save.
import { app } from '../../core/app';
import { Rng, dailySeed, randomSeed, seedToCode, utcDateKey } from '../../core/rng';
import { loadVersioned, removeSave } from '../../core/storage';
import { MODIFIERS, ROLES, WEAPONS } from '../../data/tables';
import type { PlayerRoleId } from '../../data/ids';
import { newRun, RunState, RUN_VERSION } from '../run';
import { makeWeapon } from '../weapons';
import { profile, saveProfile } from '../profile';
import { SCENES } from '../registry';
import { GameplayScene, SUSPEND_KEY } from '../../scenes/gameplay';
import { audio } from '../../audio/audio';
import { getPlatform } from '../../platform/services';
import { isRoleUnlocked, isWeaponUnlocked } from './catalogue';
import { meta } from './prefs';

export type RunKind = 'normal' | 'daily' | 'seeded';

export interface DailyInfo {
  key: string; seed: number; code: string;
  modifiers: Record<string, number>;
  /** true when the player's one scored attempt for this UTC day is still available */
  scoredAvailable: boolean;
  resetsInSec: number;
  role: PlayerRoleId;
}

/** The fixed, published modifier set for a date (spec 7.4): derived purely from the date so every player sees the same. */
export function dailyModifiers(key: string): Record<string, number> {
  const r = Rng.from(key, 'daily-modifiers');
  const pool = MODIFIERS.filter((m) => m.id !== 'promotion_season');
  const n = r.chance(0.35) ? 3 : 2;
  const out: Record<string, number> = {};
  for (const m of r.shuffle([...pool]).slice(0, n)) out[m.id] = r.int(1, Math.min(2, m.ranks));
  return out;
}

export function dailyInfo(now = new Date()): DailyInfo {
  const key = utcDateKey(now);
  const seed = dailySeed(key);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { key, seed, code: seedToCode(seed), modifiers: dailyModifiers(key), scoredAvailable: profile().daily.lastScoredKey !== key, resetsInSec: Math.max(0, Math.round((next - now.getTime()) / 1000)), role: 'office_worker' };
}

export function describeModifiers(mods: Record<string, number>): { id: string; name: string; rank: number; ranks: number; desc: string }[] {
  return MODIFIERS.filter((m) => (mods[m.id] ?? 0) > 0).map((m) => ({ id: m.id, name: m.name, rank: mods[m.id], ranks: m.ranks, desc: m.desc }));
}

export function activeModifiers(): Record<string, number> {
  const p = profile();
  if (!p.prUnlocked) return {};
  const out: Record<string, number> = {};
  for (const m of MODIFIERS) { const r = Math.max(0, Math.min(m.ranks, Math.floor(p.prModifiers[m.id] ?? 0))); if (r) out[m.id] = r; }
  return out;
}

export function kpiOf(mods: Record<string, number>): number {
  let k = 0;
  for (const m of MODIFIERS) k += (mods[m.id] ?? 0) * m.kpiPerRank;
  return k;
}

export function selectedRole(): PlayerRoleId {
  const r = profile().selectedRole;
  return r && ROLES[r] && isRoleUnlocked(r) ? r : 'office_worker';
}

// ---------------------------------------------------------------------------
export interface BuildOpts { kind: RunKind; seed?: number; role?: PlayerRoleId; modifiers?: Record<string, number> }

/** Role-defining slots cannot be swapped by the Car Boot loadout (it changes the kit, not the twist). */
export const LOCKED_SLOT: Record<PlayerRoleId, 'melee' | 'ranged' | null> = { office_worker: null, temp: 'melee', night_cleaner: 'melee', contractor: 'ranged', ex_employee: 'melee' };

export function buildRun(o: BuildOpts): RunState {
  const assist = !!app.settings.assist.enabled;
  let run: RunState;
  if (o.kind === 'daily') {
    const info = dailyInfo();
    run = newRun({ seed: info.seed, role: info.role, daily: true, dailyKey: info.key, practice: !info.scoredAvailable || assist, modifiers: info.modifiers, assist });
  } else {
    const role = o.role ?? selectedRole();
    run = newRun({ seed: o.seed ?? randomSeed(), role, seeded: o.kind === 'seeded', modifiers: o.modifiers ?? activeModifiers(), assist });
    applyLoadout(run);
  }
  return run;
}

function applyLoadout(run: RunState): void {
  const lo = meta().loadout, locked = LOCKED_SLOT[run.role], role = ROLES[run.role];
  const slots: ('melee' | 'ranged' | 'thrown')[] = ['melee', 'ranged', 'thrown'];
  for (const slot of slots) {
    const id = lo[slot];
    if (!id || slot === locked) continue;
    const def = WEAPONS[id];
    if (!def || def.rarity !== 0 || !isWeaponUnlocked(id)) continue;
    const cls = def.cls === 'ranged' ? 'ranged' : def.cls === 'throwable' ? 'thrown' : 'melee';
    if (cls !== slot) continue;
    run.loadout[slot] = makeWeapon(id, { ammoMult: role.ammoMult });
  }
}

// ---------------------------------------------------------------------------
export function peekSuspend(): RunState | null {
  try { return loadVersioned<RunState>(SUSPEND_KEY, RUN_VERSION); } catch { return null; }
}
export const hasSuspend = (): boolean => !!peekSuspend();
export function discardSuspend(): void { removeSave(SUSPEND_KEY); }

/** Resume the suspended shift: GameplayScene deletes the save (spec 10.3: no save-scumming). */
export function continueShift(): boolean {
  const run = peekSuspend();
  if (!run) return false;
  audio.sfx('car_door');
  app.reset(new GameplayScene(run, { resumed: true }));
  getPlatform().telemetry.record('run_resume', { floor: run.floor });
  return true;
}

/**
 * Start a run. The very first run plays the opening sequence (the meeting room) before floor 1.
 * Any older suspend save is discarded (starting over replaces the shift).
 */
export function launchRun(run: RunState): void {
  discardSuspend();
  const p = profile();
  if (run.daily && !run.practice && !run.assist) p.daily.lastScoredKey = run.dailyKey ?? utcDateKey();
  saveProfile();
  getPlatform().telemetry.record('run_start', { daily: run.daily, seeded: run.seeded, role: run.role, assist: run.assist });
  const go = () => { audio.sfx('car_door'); app.reset(new GameplayScene(run)); };
  if (!p.seenIntro && SCENES.intro) {
    app.reset(SCENES.intro(() => { profile().seenIntro = true; saveProfile(); go(); }));
  } else go();
}

export const startNewRun = (): void => launchRun(buildRun({ kind: 'normal' }));
export const startDaily = (): void => launchRun(buildRun({ kind: 'daily' }));
export const startSeeded = (seed: number): void => launchRun(buildRun({ kind: 'seeded', seed }));
