// Edition gating (spec 8.1, D25): which build of the game is this?
//
//   Full game      Steam / PC premium, and Android once the one-time unlock is bought.
//   Demo (Act 1)   - the Steam "free Act 1" demo (Steam Next Fest): built with `VITE_DEMO=1` (see the CompanyPolicy-Windows-Demo CI artefact), and
//                  - the free Android download, but ONLY when ANDROID_PAYWALL_ENABLED is true and the full game has not been unlocked.
//
// In the demo the run ends after the Act 1 boss (floor 5): CorpOS shows a "Probation Period Complete" screen (src/scenes/demoend.ts)
// with the unlock / wishlist call to action, then a summary. The Daily Run and Performance Review are hidden behind a "Full game" badge.
// Everything else (hub, Act 1 unlocks, Annual Leave) is shared with the full game: the profile is the same save, so progress carries over.
import { PLATFORM, isElectron } from '../core/app';
import { getPlatform } from './services';
import { notify } from '../ui/corpos';

/**
 * OWNER SWITCH: set to `true` once Google Play Billing is configured (one-time product "full_game", see PlayGamesPlatform.iap in
 * services.ts). While false, Android behaves like the full game: `isFullGameUnlocked()` reports true and no gate is ever shown.
 * When true, a fresh Android install is the free Act 1 demo until iap.purchase() succeeds.
 */
export const ANDROID_PAYWALL_ENABLED = false;

/** The Act 1 boss floor: the last floor playable in the demo. */
export const DEMO_LAST_FLOOR = 5;

type Override = { demo?: boolean; store?: DemoStore };
/** Dev-only QA override: `window.__cpEdition = { demo: true, store: 'android' }` or the URL hash flag `#demo` / `#demo=android`. Never read in production builds. */
function devOverride(): Override | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const w = window as unknown as { __cpEdition?: Override; __cpDemo?: boolean };
  if (w.__cpEdition) return w.__cpEdition;
  if (w.__cpDemo !== undefined) return { demo: !!w.__cpDemo };
  const m = /[#&]demo(?:=(android|steam|web))?(?:&|$)/.exec(location.hash);
  return m ? { demo: true, store: (m[1] as DemoStore | undefined) } : null;
}

/** True when this build / install is the Act 1 demo. */
export function isDemo(): boolean {
  const o = devOverride();
  if (o && o.demo !== undefined) return o.demo;
  if (import.meta.env.VITE_DEMO === '1') return true;
  if (!ANDROID_PAYWALL_ENABLED) return false;
  return PLATFORM === 'android' && !getPlatform().iap.isFullGameUnlocked();
}

export type DemoStore = 'android' | 'steam' | 'web';
/** Where the "unlock" call to action points: Google Play (in-app purchase) or Steam (wishlist / buy). */
export function demoStore(): DemoStore {
  const o = devOverride();
  if (o?.store) return o.store;
  if (import.meta.env.VITE_DEMO === '1') return 'steam'; // VITE_DEMO builds are the Steam Act 1 demo
  return PLATFORM === 'android' ? 'android' : isElectron ? 'steam' : 'web';
}

/** Features that only exist in the full game (spec 8.1 "Demo scope"). */
export type FullGameFeature = 'daily' | 'performance_review';
export const isLockedInDemo = (_f: FullGameFeature): boolean => isDemo();
/** Text for the lock badge shown next to hidden entry points. */
export const FULL_GAME_BADGE = 'Full game';

/** The floor after which a demo run ends (Act 1 boss cleared). */
export function isDemoGateFloor(plan: { floor_number: number; floor_type: string; wing?: number }): boolean {
  return isDemo() && plan.floor_type === 'boss' && plan.floor_number >= DEMO_LAST_FLOOR && !(plan.wing && plan.wing > 0);
}

/** Toast shown when a demo player pokes a locked entry point (Daily Run, Performance Review). */
export function notifyFullGameOnly(feature: FullGameFeature): void {
  notify({ kind: 'info', title: 'Full game feature', body: (feature === 'daily' ? 'The Daily Run' : 'Performance Review') + ' is part of the full game. Your progress carries over when you unlock it.', icon: 'lock', duration: 4 });
}

export interface UnlockResult { ok: boolean; message: string }
/**
 * The "Unlock the full game" button. Android: Play Billing purchase (iap.purchase()). Steam / web demo: there is nothing to buy
 * in-app, so it returns the wishlist message and the caller shows it (no URL is opened: the Steam App ID is not configured yet).
 */
export async function unlockFullGame(): Promise<UnlockResult> {
  if (demoStore() === 'android') {
    try {
      const ok = await getPlatform().iap.purchase();
      return ok ? { ok: true, message: 'Full game unlocked. Thank you. HR has noted your commitment.' } : { ok: false, message: 'Purchase not completed. Nothing was charged.' };
    } catch { return { ok: false, message: 'The Play Store could not be reached. Nothing was charged.' }; }
  }
  return { ok: false, message: 'Wishlist or buy Company Policy on Steam to continue the climb. Your progress and unlocks carry over.' };
}
