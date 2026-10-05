// Crash reporter (spec 10.5): captures window.onerror / unhandledrejection into a local ring buffer.
// Nothing leaves the device by default. If a build sets crashConfig.endpoint AND the player opted in to telemetry,
// forwardCrashReports() would send the buffer (e.g. to a Sentry-compatible relay). Both default to off.
import { app, PLATFORM } from '../core/app';
import { backend } from '../core/storage';
import { GAME_VERSION } from './services';

export interface CrashReport {
  t: number;
  kind: 'error' | 'rejection' | 'manual';
  message: string;
  stack?: string;
  where?: string;       // file:line:col for window errors
  scene?: string;       // name of the top scene when it happened
  version: string;
  platform: string;
  count: number;        // de-duplicated repeats
}

export const crashConfig: { endpoint: string } = { endpoint: '' };
const KEY = 'crashlog';
const MAX = 25;
let ring: CrashReport[] | null = null;
let installed = false;

function load(): CrashReport[] {
  if (ring) return ring;
  try { ring = JSON.parse(backend.read(KEY) ?? '[]'); } catch { ring = []; }
  if (!Array.isArray(ring)) ring = [];
  return ring;
}

function persist(): void { try { backend.write(KEY, JSON.stringify(load())); } catch { /* never throw from the reporter */ } }

export function recordCrash(kind: CrashReport['kind'], message: string, stack?: string, where?: string): void {
  try {
    const r = load();
    const msg = String(message).slice(0, 400);
    const last = r[r.length - 1];
    if (last && last.message === msg && Date.now() - last.t < 5000) { last.count++; last.t = Date.now(); persist(); return; }
    r.push({ t: Date.now(), kind, message: msg, stack: stack ? String(stack).slice(0, 1500) : undefined, where, scene: app.top?.name, version: GAME_VERSION, platform: PLATFORM, count: 1 });
    while (r.length > MAX) r.shift();
    persist();
  } catch { /* */ }
}

export function getCrashReports(): readonly CrashReport[] { return load().slice(); }
export function clearCrashReports(): void { ring = []; try { backend.remove(KEY); } catch { /* */ } }

/** Would forward the buffer if (and only if) an endpoint is configured and the player opted in. Default: no-op. */
export function forwardCrashReports(): boolean {
  if (!crashConfig.endpoint || !app.settings?.telemetryOptIn) return false;
  try {
    const r = load();
    if (!r.length) return false;
    const ok = navigator.sendBeacon?.(crashConfig.endpoint, JSON.stringify({ v: GAME_VERSION, platform: PLATFORM, reports: r })) ?? false;
    if (ok) clearCrashReports();
    return ok;
  } catch { return false; }
}

export function installCrashReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    recordCrash('error', e.message || String(e.error), (e.error as Error | undefined)?.stack, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    recordCrash('rejection', typeof r === 'string' ? r : r?.message ?? 'Unhandled promise rejection', typeof r === 'object' ? r?.stack : undefined);
  });
  window.addEventListener('pagehide', () => { forwardCrashReports(); });
}
