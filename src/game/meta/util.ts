// Small shared helpers for the meta module.
import { saveProfile } from '../profile';

export function saveSafe(): void { try { saveProfile(); } catch (e) { console.warn('profile save failed', e); } }

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtHours(sec: number): string { return (sec / 3600).toFixed(sec >= 36000 ? 0 : 1) + ' h'; }

export const BOSS_IDS = ['facilities_manager', 'head_of_sales', 'head_of_compliance', 'ceo'] as const;
export const BOSS_NAMES: Record<string, string> = { facilities_manager: 'Facilities Manager', head_of_sales: 'Head of Sales', head_of_compliance: 'Head of Compliance', ceo: 'The CEO' };
