// Deterministic seeded RNG (spec 10.2). Never use Math.random() for gameplay.
// sfc32 core: fast, 128-bit state, serialisable for suspend saves.

export function hashString(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Final avalanche (murmur3 fmix32). */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hashCombine(...parts: (number | string)[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'number' ? p >>> 0 : hashString(p);
    h = mix32((h ^ v) + 0x9e3779b9 + (h << 6) + (h >>> 2));
  }
  return h >>> 0;
}

export type RngState = [number, number, number, number];

export class Rng {
  private a: number; private b: number; private c: number; private d: number;

  constructor(seed: number | RngState = 1) {
    if (Array.isArray(seed)) {
      [this.a, this.b, this.c, this.d] = seed;
    } else {
      this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = seed >>> 0;
      for (let i = 0; i < 15; i++) this.nextU32();
    }
  }

  static from(...parts: (number | string)[]): Rng { return new Rng(hashCombine(...parts)); }

  state(): RngState { return [this.a, this.b, this.c, this.d]; }

  nextU32(): number {
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = c + t | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** [0,1) */
  next(): number { return this.nextU32() / 4294967296; }
  /** [min,max) float */
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  /** [min,max] inclusive integer */
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign(): number { return this.next() < 0.5 ? -1 : 1; }
  /** ±pct variance multiplier, e.g. vary(0.1) -> 0.9..1.1 */
  vary(pct: number): number { return 1 + this.range(-pct, pct); }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  fork(label: string | number): Rng { return new Rng(hashCombine(this.nextU32(), label)); }
}

/** Separate streams so cosmetic randomness can never desync a seed (spec 10.2). */
export type StreamName = 'layout' | 'spawns' | 'loot' | 'cosmetic' | 'combat' | 'events';

export class RngStreams {
  streams: Record<StreamName, Rng>;
  constructor(public seed: number, salt: number | string = 0) {
    const mk = (n: StreamName) => Rng.from(seed, salt, n);
    this.streams = { layout: mk('layout'), spawns: mk('spawns'), loot: mk('loot'), cosmetic: mk('cosmetic'), combat: mk('combat'), events: mk('events') };
  }
  get(n: StreamName): Rng { return this.streams[n]; }
  serialise(): Record<StreamName, RngState> {
    const out = {} as Record<StreamName, RngState>;
    for (const k of Object.keys(this.streams) as StreamName[]) out[k] = this.streams[k].state();
    return out;
  }
  restore(s: Record<StreamName, RngState>): void {
    for (const k of Object.keys(s) as StreamName[]) this.streams[k] = new Rng(s[k]);
  }
}

/** Global cosmetic RNG for purely visual effects (particles etc). Not deterministic-critical. */
export const fxRng = new Rng((Date.now() ^ 0x5bd1e995) >>> 0);

// ---- Seed codes: 8 chars Crockford-ish base32, shown as XXXX-XXXX ----
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function seedToCode(seed: number): string {
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < 7; i++) { out = ALPHA[s & 31] + out; s = Math.floor(s / 32); }
  // checksum char
  const chk = ALPHA[hashString(out) & 31];
  const code = out + chk;
  return code.slice(0, 4) + '-' + code.slice(4);
}

export function codeToSeed(code: string): number | null {
  const c = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (c.length !== 8) return null;
  const body = c.slice(0, 7);
  if (ALPHA[hashString(body) & 31] !== c[7]) return null;
  let s = 0;
  for (const ch of body) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) return null;
    s = s * 32 + v;
  }
  return s >>> 0;
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else a[0] = (Date.now() * 2654435761) >>> 0;
  return a[0] >>> 0;
}

/** Daily seed = hash(UTC date + salt) (spec 10.2). */
export const DAILY_SALT = 'CompanyPolicy::CultureRealignment::v1';
export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function dailySeed(dateKey = utcDateKey()): number {
  return hashCombine(dateKey, DAILY_SALT);
}
