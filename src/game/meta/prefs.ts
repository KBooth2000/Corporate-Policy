// Meta-progression data that lives on the profile object but is not part of the base Profile interface.
// Declared by module augmentation so it persists with the profile save (JSON) without editing profile.ts.
import { profile } from '../profile';
import type { Profile } from '../profile';

export interface RunHistoryEntry {
  at: number; role: string; floor: number; won: boolean; time: number; seed: string; kills: number; leave: number; score: number;
  assist: boolean; daily: boolean; practice: boolean; seeded: boolean; killer?: string; modifiers: number;
}

export interface MetaData {
  /** Car Boot loadout overrides (Standard-tier weapons only, so they change the kit not the power). */
  loadout: { melee?: string; ranged?: string; thrown?: string };
  history: RunHistoryEntry[];
  hubVisits: number;
  /** Where the last run ended: drives the hub's mood (dawn after a win). */
  lastOutcome: 'none' | 'win' | 'death';
  /** Unix day numbers on which the daily banner was already shown. */
  dailySeen: string;
}

declare module '../profile' {
  interface Profile { meta?: MetaData }
}

export function meta(): MetaData {
  const p: Profile = profile();
  const m = (p.meta ??= { loadout: {}, history: [], hubVisits: 0, lastOutcome: 'none', dailySeen: '' });
  m.loadout ??= {}; m.history ??= []; m.hubVisits ??= 0; m.lastOutcome ??= 'none'; m.dailySeen ??= '';
  return m;
}
