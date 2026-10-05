// Achievement bookkeeping: dedupe, toast, forward to the platform (Steam / Play Games).
import { profile, saveProfile } from '../profile';
import { ACHIEVEMENTS } from '../../data/text/achievements';
import { notify } from '../../ui/corpos';
import { icon } from '../../art/items';
import { getPlatform } from '../../platform/services';

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function hasAchievement(id: string): boolean { return profile().achievements.includes(id); }

/** Returns true if newly awarded. Toasts via notify(); persists the profile immediately. */
export function awardAchievement(id: string, quiet = false): boolean {
  const def = ACHIEVEMENT_BY_ID.get(id);
  if (!def) return false;
  const p = profile();
  if (p.achievements.includes(id)) return false;
  p.achievements.push(id);
  if (!quiet) notify({ kind: 'good', title: 'Achievement: ' + def.name, body: def.desc, icon: safeIcon(), sound: 'ui_unlock', duration: 5 });
  try { getPlatform().achievements.unlock(id); } catch { /* */ }
  saveProfile();
  return true;
}

function safeIcon(): HTMLCanvasElement | string { try { return icon('star'); } catch { return 'star'; } }

export const achievementProgress = (): { done: number; total: number } => ({ done: profile().achievements.length, total: ACHIEVEMENTS.length });
