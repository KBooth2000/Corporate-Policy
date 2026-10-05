// Platform services (spec 4.6, 8.1, 10.3, 10.5): one interface, three implementations.
//   Local      - web/default. Achievements are tracked in the profile, leaderboards are local boards in profile.localBoards.
//   Steam      - Electron build. STUB: logs and falls back to Local. See the "PLUG-IN POINT" comments for where
//                steamworks.js (or a Steamworks.NET-equivalent) hooks in via the preload bridge window.cpNative.steam.
//   PlayGames  - Android (Capacitor). STUB: logs and falls back to Local. See the "PLUG-IN POINT" comments for the
//                Capacitor Play Games plugin placeholder (window.Capacitor.Plugins.PlayGames).
// Every method is safe to call and never throws. Nothing is ever sent off-device unless a build explicitly configures
// an endpoint AND the player opted in (telemetry) - see telemetry/crash config below.
import { app, PLATFORM, isElectron } from '../core/app';
import { dailySeed, hashCombine, seedToCode, utcDateKey } from '../core/rng';
import { backend } from '../core/storage';
import { profile, profileSavedHooks, saveProfile, Profile } from '../game/profile';
import type { RunState } from '../game/run';

export const GAME_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Leaderboard data model (spec 4.6)
export interface LeaderboardEntry { name: string; score: number; floor: number; time: number; at: number; assist: boolean; rank?: number; won?: boolean }

/** What the client submits for a scored daily run: seed, run duration, a checksum of the key run events, and the score. */
export interface DailySubmission {
  board: string;            // e.g. "daily:2026-10-05"
  dateKey: string;          // UTC date the seed was generated for
  seed: number;
  seedCode: string;
  durationSec: number;
  score: number;
  floor: number;
  won: boolean;
  role: string;
  assist: boolean;
  practice: boolean;
  /** run.checksum: rolling hash over the key run events (kills, floor clears, departures...). */
  checksum: number;
  /** Count of events folded into the checksum, plus a digest of the retained event codes. */
  eventCount: number;
  eventDigest: number;
  version: string;
  platform: string;
}

export interface SubmitResult {
  ok: boolean;
  /** Why it was not submitted / rejected (shown on the summary deck). */
  reason?: string;
  rank?: number;
  total?: number;
  board: string;
  /** 'local' | 'steam' | 'playgames': where the score ended up. */
  via: string;
}

// ---------------------------------------------------------------------------
// Score + sanity checks. computeScore is the client formula; sanityCheck is the SAME check the Steam validation
// service runs server-side (spec 10.5): seed matches the date, duration plausible, score within the achievable range.
export function computeScore(run: RunState, won: boolean, durationSec: number): number {
  const L = run.log;
  let s = run.floor * 1000
    + L.kills * 10 + L.executions * 40 + L.defenestrations * 20 + L.breaches * 15
    + L.bossesKilled * 500 + L.elitesKilled * 50 + Math.floor(L.cashEarned / 2)
    - Math.floor(L.damageTaken / 10);
  if (won) s += 10000 + Math.max(0, 3600 - Math.floor(durationSec)) * 5;
  return Math.max(0, Math.round(s));
}

export const SANITY = {
  maxFloor: 20,
  minSecondsPerFloor: 15,
  maxDurationSec: 8 * 3600,
  /** generous ceiling: 4000 per floor + 35000 for a win + 5000 slack */
  maxScore: (floor: number, won: boolean) => floor * 4000 + (won ? 35000 : 0) + 5000,
};

export function sanityCheck(sub: DailySubmission, now = new Date()): string | null {
  if (sub.assist) return 'Workplace Adjustments runs are not eligible for the daily boards.';
  if (sub.practice) return 'Practice attempts are not scored.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sub.dateKey)) return 'Malformed date key.';
  if (sub.seed !== dailySeed(sub.dateKey)) return 'Seed does not match the published daily seed.';
  const dayMs = Date.parse(sub.dateKey + 'T00:00:00Z');
  if (!isFinite(dayMs) || dayMs > now.getTime() + 36e5 || now.getTime() - dayMs > 5 * 86400000) return 'Seed is not from a currently open day.';
  if (!(sub.floor >= 1 && sub.floor <= SANITY.maxFloor)) return 'Floor out of range.';
  if (!(sub.score >= 0 && sub.score <= SANITY.maxScore(sub.floor, sub.won))) return 'Score outside the achievable range.';
  if (!(sub.durationSec >= sub.floor * SANITY.minSecondsPerFloor * (sub.floor > 1 ? 0.5 : 0.25) && sub.durationSec <= SANITY.maxDurationSec)) return 'Run duration is implausible.';
  if (!(sub.eventCount > 0) || !sub.checksum) return 'Missing event checksum.';
  return null;
}

function digest(events: number[]): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < events.length; i += 8) h = hashCombine(h, events[i], events[i + 1] ?? 0, events[i + 2] ?? 0, events[i + 3] ?? 0, events[i + 4] ?? 0, events[i + 5] ?? 0, events[i + 6] ?? 0, events[i + 7] ?? 0);
  return h >>> 0;
}

export function buildSubmission(run: RunState, won: boolean, durationSec: number): DailySubmission {
  const dateKey = run.dailyKey ?? utcDateKey();
  return {
    board: 'daily:' + dateKey, dateKey, seed: run.seed, seedCode: seedToCode(run.seed), durationSec: Math.round(durationSec),
    score: computeScore(run, won, durationSec), floor: run.floor, won, role: run.role, assist: run.assist, practice: run.practice,
    checksum: run.checksum >>> 0, eventCount: run.events.length, eventDigest: digest(run.events), version: GAME_VERSION, platform: PLATFORM,
  };
}

// ---------------------------------------------------------------------------
// Platform interface
export interface Platform {
  readonly id: 'local' | 'steam' | 'playgames';
  init(): void;
  achievements: { unlock(id: string): void };
  leaderboards: {
    submit(sub: DailySubmission): Promise<SubmitResult>;
    fetch(board: string, limit?: number): Promise<LeaderboardEntry[]>;
  };
  /** Cloud save hooks (Steam Cloud / Play Games saved games). Called after every profile save. */
  cloud: { onProfileSaved(p: Profile): void; pull(): Promise<Profile | null> };
  /** Android demo / one-time unlock (spec 8.1). Stubbed unlocked until Play Billing is configured. */
  iap: { isFullGameUnlocked(): boolean; purchase(): Promise<boolean> };
  telemetry: { record(event: string, props?: Record<string, string | number | boolean>): void };
}

// ---------------------------------------------------------------------------
// Telemetry: opt-in only (UK GDPR). Records nothing unless settings.telemetryOptIn. Events go to a small local queue.
// Only if a build sets telemetryConfig.endpoint (and the player is opted in) does flushTelemetry() send anything.
export const telemetryConfig: { endpoint: string } = { endpoint: '' };
const TELEMETRY_KEY = 'telemetry';
const TELEMETRY_MAX = 200;
let telemetryQueue: { t: number; e: string; p?: Record<string, string | number | boolean> }[] | null = null;

function loadTelemetry(): NonNullable<typeof telemetryQueue> {
  if (telemetryQueue) return telemetryQueue;
  try { telemetryQueue = JSON.parse(backend.read(TELEMETRY_KEY) ?? '[]'); } catch { telemetryQueue = []; }
  if (!Array.isArray(telemetryQueue)) telemetryQueue = [];
  return telemetryQueue;
}

export function telemetryOptedIn(): boolean { return !!app.settings?.telemetryOptIn; }

export function recordTelemetry(event: string, props?: Record<string, string | number | boolean>): void {
  if (!telemetryOptedIn()) return; // opt-in only: record nothing otherwise
  try {
    const q = loadTelemetry();
    q.push({ t: Date.now(), e: event, p: props });
    while (q.length > TELEMETRY_MAX) q.shift();
    backend.write(TELEMETRY_KEY, JSON.stringify(q));
  } catch { /* never throw */ }
}

export function telemetryQueueSnapshot(): readonly unknown[] { return loadTelemetry().slice(); }
export function clearTelemetry(): void { telemetryQueue = []; try { backend.remove(TELEMETRY_KEY); } catch { /* */ } }

/** Sends the queued events ONLY if an endpoint is configured and the player opted in. Default build: no-op. */
export function flushTelemetry(): boolean {
  if (!telemetryConfig.endpoint || !telemetryOptedIn()) return false;
  try {
    const q = loadTelemetry();
    if (!q.length) return false;
    const ok = navigator.sendBeacon?.(telemetryConfig.endpoint, JSON.stringify({ v: GAME_VERSION, platform: PLATFORM, events: q })) ?? false;
    if (ok) clearTelemetry();
    return ok;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Local implementation
const BOARD_KEEP = 21; // days of local boards to retain

export class LocalPlatform implements Platform {
  readonly id: Platform['id'] = 'local';
  protected log(...a: unknown[]): void { if (this.id !== 'local') console.info(`[platform:${this.id}]`, ...a); }
  init(): void { /* nothing to initialise */ }

  achievements = { unlock: (_id: string): void => { /* the profile already records it; platform stubs add their own call */ } };

  leaderboards = {
    submit: async (sub: DailySubmission): Promise<SubmitResult> => this.submitLocal(sub),
    fetch: async (board: string, limit = 10): Promise<LeaderboardEntry[]> => this.fetchLocal(board, limit),
  };

  cloud = {
    onProfileSaved: (_p: Profile): void => { /* Steam Cloud / Play Games saved-game upload would go here */ },
    pull: async (): Promise<Profile | null> => null,
  };

  iap = {
    isFullGameUnlocked: (): boolean => profile().fullGameUnlocked !== false,
    purchase: async (): Promise<boolean> => { profile().fullGameUnlocked = true; saveProfile(); return true; },
  };

  telemetry = { record: (event: string, props?: Record<string, string | number | boolean>): void => recordTelemetry(event, props) };

  protected submitLocal(sub: DailySubmission): SubmitResult {
    const bad = sanityCheck(sub);
    if (bad) return { ok: false, reason: bad, board: sub.board, via: 'local' };
    const p = profile();
    const list = (p.localBoards[sub.board] ??= []);
    list.push({ name: 'YOU', score: sub.score, floor: sub.floor, time: sub.durationSec, at: Date.now(), assist: false });
    list.sort((a, b) => b.score - a.score);
    if (list.length > 25) list.length = 25;
    // prune old boards
    const keys = Object.keys(p.localBoards).filter((k) => k.startsWith('daily:')).sort();
    while (keys.length > BOARD_KEEP) delete p.localBoards[keys.shift()!];
    const rank = list.findIndex((e) => e.score === sub.score && e.floor === sub.floor && e.time === sub.durationSec) + 1;
    return { ok: true, rank: rank || 1, total: list.length, board: sub.board, via: 'local' };
  }

  protected fetchLocal(board: string, limit: number): LeaderboardEntry[] {
    const list = profile().localBoards[board] ?? [];
    return list.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
  }
}

// ---------------------------------------------------------------------------
// Steam (Electron). STUB: logs, then behaves as Local.
export class SteamPlatform extends LocalPlatform {
  override readonly id = 'steam' as const;
  /** The preload bridge a real build would expose (see electron/preload.cjs). Everything is optional. */
  private get bridge(): { unlockAchievement?(id: string): void; submitScore?(payload: unknown): Promise<{ rank?: number }>; fetchScores?(board: string, n: number): Promise<LeaderboardEntry[]>; cloudWrite?(json: string): void; cloudRead?(): string | null } | undefined {
    return (window as unknown as { cpNative?: { steam?: never } }).cpNative?.steam;
  }
  override init(): void { this.log('init (stub) - Steamworks not wired; using local fallbacks'); }

  override achievements = {
    unlock: (id: string): void => {
      this.log('achievement', id);
      // PLUG-IN POINT: steamworks.js -> client.achievement.activate(id); Steamworks.NET equivalent: SteamUserStats.SetAchievement(id) + StoreStats().
      try { this.bridge?.unlockAchievement?.(id); } catch { /* */ }
    },
  };

  override leaderboards = {
    submit: async (sub: DailySubmission): Promise<SubmitResult> => {
      const local = this.submitLocal(sub);
      if (!local.ok) return local;
      this.log('submit daily', sub.board, sub.score);
      // PLUG-IN POINT: POST the payload (seed, durationSec, checksum, eventDigest, score) to the validation service (spec 10.5).
      // The service re-runs sanityCheck() and writes to a trusted Steam leaderboard through the Steam Web API.
      try { const r = await this.bridge?.submitScore?.(sub); if (r?.rank) return { ...local, rank: r.rank, via: 'steam' }; } catch (e) { this.log('submit failed', e); }
      return local;
    },
    fetch: async (board: string, limit = 10): Promise<LeaderboardEntry[]> => {
      try { const r = await this.bridge?.fetchScores?.(board, limit); if (r?.length) return r; } catch { /* */ }
      return this.fetchLocal(board, limit);
    },
  };

  override cloud = {
    onProfileSaved: (p: Profile): void => {
      // PLUG-IN POINT: Steam Cloud. Write the profile JSON via steamworks.js cloud.writeFile('profile.json', json).
      try { this.bridge?.cloudWrite?.(JSON.stringify(p)); } catch { /* */ }
    },
    pull: async (): Promise<Profile | null> => { try { const j = this.bridge?.cloudRead?.(); return j ? (JSON.parse(j) as Profile) : null; } catch { return null; } },
  };
}

// ---------------------------------------------------------------------------
// Google Play Games (Android / Capacitor). STUB: logs, then behaves as Local.
export class PlayGamesPlatform extends LocalPlatform {
  override readonly id = 'playgames' as const;
  /** PLUG-IN POINT: a Capacitor plugin registered as "PlayGames" (e.g. a thin wrapper over the Play Games Services v2 SDK). */
  private get plugin(): { unlockAchievement?(o: { id: string }): Promise<void>; submitScore?(o: { board: string; score: number }): Promise<{ rank?: number }>; getTopScores?(o: { board: string; limit: number }): Promise<{ entries: LeaderboardEntry[] }>; saveSnapshot?(o: { json: string }): Promise<void>; isUnlocked?(): Promise<{ value: boolean }>; purchase?(): Promise<{ value: boolean }> } | undefined {
    return (window as unknown as { Capacitor?: { Plugins?: { PlayGames?: never } } }).Capacitor?.Plugins?.PlayGames;
  }
  override init(): void { this.log('init (stub) - Play Games plugin not installed; using local fallbacks'); }

  override achievements = {
    unlock: (id: string): void => { this.log('achievement', id); try { void this.plugin?.unlockAchievement?.({ id }); } catch { /* */ } },
  };

  override leaderboards = {
    submit: async (sub: DailySubmission): Promise<SubmitResult> => {
      const local = this.submitLocal(sub);
      if (!local.ok) return local;
      this.log('submit daily', sub.board, sub.score);
      // Android accepts a higher cheating risk (spec 10.5): client submission with a score-range limit only. sanityCheck() above is that limit.
      try { const r = await this.plugin?.submitScore?.({ board: sub.board, score: sub.score }); if (r?.rank) return { ...local, rank: r.rank, via: 'playgames' }; } catch (e) { this.log('submit failed', e); }
      return local;
    },
    fetch: async (board: string, limit = 10): Promise<LeaderboardEntry[]> => {
      try { const r = await this.plugin?.getTopScores?.({ board, limit }); if (r?.entries?.length) return r.entries; } catch { /* */ }
      return this.fetchLocal(board, limit);
    },
  };

  override cloud = {
    onProfileSaved: (p: Profile): void => { try { void this.plugin?.saveSnapshot?.({ json: JSON.stringify(p) }); } catch { /* */ } },
    pull: async (): Promise<Profile | null> => null,
  };

  override iap = {
    // PLUG-IN POINT: Play Billing one-time product "full_game". Stubbed unlocked (spec 8.1) until configured.
    isFullGameUnlocked: (): boolean => profile().fullGameUnlocked !== false,
    purchase: async (): Promise<boolean> => { try { const r = await this.plugin?.purchase?.(); if (r) { profile().fullGameUnlocked = r.value; saveProfile(); return r.value; } } catch { /* */ } profile().fullGameUnlocked = true; saveProfile(); return true; },
  };
}

// ---------------------------------------------------------------------------
function create(): Platform {
  try {
    if (isElectron) return new SteamPlatform();
    if (PLATFORM === 'android') return new PlayGamesPlatform();
  } catch { /* fall through */ }
  return new LocalPlatform();
}

let current: Platform | null = null;
export function getPlatform(): Platform {
  if (!current) {
    current = create();
    try { current.init(); } catch { /* */ }
    profileSavedHooks.push((p) => { try { current!.cloud.onProfileSaved(p); } catch { /* */ } });
  }
  return current;
}
/** Test hook / future build configuration. */
export function setPlatform(p: Platform): void { current = p; }
