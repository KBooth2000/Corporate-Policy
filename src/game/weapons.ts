// Weapon instances, durability, ammo (spec 2.4). Stats come from src/data/csv/weapons.csv.
import { WEAPONS, WeaponDef, WEAPON_IDS } from '../data/tables';
import type { Rng } from '../core/rng';

export interface WeaponInst {
  id: string;
  dur: number;      // remaining hits (melee) — 0 for fists = infinite
  maxDur: number;
  ammo: number;     // ranged
  maxAmmo: number;
  rare?: boolean;
}

export const def = (id: string): WeaponDef => WEAPONS[id] ?? WEAPONS.fists;

export function slotOf(id: string): 'melee' | 'ranged' | 'thrown' {
  const c = def(id).cls;
  return c === 'ranged' ? 'ranged' : c === 'throwable' ? 'thrown' : 'melee';
}

export function makeWeapon(id: string, opts: { durabilityMult?: number; ammoMult?: number; frac?: number } = {}): WeaponInst {
  const d = def(id);
  const maxDur = d.durability > 0 ? Math.max(1, Math.round(d.durability * (opts.durabilityMult ?? 1))) : 0;
  const maxAmmo = d.ammo > 0 ? Math.max(1, Math.round(d.ammo * (opts.ammoMult ?? 1))) : 0;
  const f = opts.frac ?? 1;
  return { id, dur: Math.max(maxDur ? 1 : 0, Math.round(maxDur * f)), maxDur, ammo: Math.max(maxAmmo ? 1 : 0, Math.round(maxAmmo * f)), maxAmmo, rare: d.rarity >= 2 };
}

/** Unlock filter (set by the meta module): locked weapons never appear in run pools (spec 7.3). */
let unlockFilter: (id: string) => boolean = () => true;
export function setWeaponUnlockFilter(fn: (id: string) => boolean): void { unlockFilter = fn; }

/** Pool of weapons that can drop/appear by act; rarity weighting improved by luck. */
export function rollWeapon(rng: Rng, act: number, luck = 0, cls?: 'melee' | 'ranged' | 'thrown'): string {
  let ids = WEAPON_IDS.filter((id) => id !== 'fists' && (!cls || slotOf(id) === cls));
  const unlocked = ids.filter(unlockFilter);
  if (unlocked.length) ids = unlocked;
  return rng.weighted(ids, (id) => {
    const r = def(id).rarity;
    const base = r === 0 ? 10 : r === 1 ? 4 + act : 1 + act * 0.8;
    return base * (r > 0 ? 1 + luck * 2 : 1);
  });
}
