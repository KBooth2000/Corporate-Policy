// Builder for Benefit definitions: each Benefit supplies one value per rarity (Standard, Enhanced, Executive) and a
// description function, so the text and the numbers can never drift apart. Mods and floor hooks receive the rarity's value.
import type { BenefitDef } from '../content-info';
import type { BenefitDept } from '../../data/ids';
import type { RunState } from '../run';
import type { StatKey } from '../stats';
import type { Rar, S, TempMod } from './common';

export interface BSpec<V> {
  id: string; dept: BenefitDept; name: string;
  starter?: boolean;
  synergy?: [BenefitDept, BenefitDept];
  minRarity?: Rar;
  /** One value per rarity (Standard, Enhanced, Executive). */
  v: [V, V, V];
  desc: (v: V) => string;
  mods?: (v: V, run: RunState) => TempMod[];
  floor?: (s: S, v: V, r: Rar) => void;
}

export function B<V>(sp: BSpec<V>): BenefitDef {
  const def: BenefitDef = {
    id: sp.id, dept: sp.dept, name: sp.name,
    desc: [sp.desc(sp.v[0]), sp.desc(sp.v[1]), sp.desc(sp.v[2])],
    starter: !!sp.starter,
  };
  if (sp.synergy) def.synergy = sp.synergy;
  if (sp.minRarity) def.minRarity = sp.minRarity;
  if (sp.mods) { const f = sp.mods; def.mods = (r, run) => f(sp.v[r], run).map((m) => ({ ...m, source: sp.id })); }
  if (sp.floor) { const f = sp.floor; def.floor = (s, r) => f(s, sp.v[r], r); }
  return def;
}

export const mul = (stat: StatKey, mult: number): TempMod => ({ stat, mult });
export const add = (stat: StatKey, a: number): TempMod => ({ stat, add: a });
