// Procedural generation soak test (spec 4.4 step 9; release gate: zero softlocks).
// Run: npm run soak   [optional: N=20000 npm run soak]
// Generates >= 10,000 floors across floors 1-20, every floor type, every department theme, wings 0-2, both
// platforms, alarm on/off and Hot Desking on/off; validates each; prints counts, timing and failure reasons.
// Exits non-zero on any failure.
import { THEMES_BY_ACT, type Act, type ExitKind, type FloorType, type ThemeId } from '../src/data/ids';
import type { FloorMap, FloorRequest } from '../src/game/world-types';
import { generateFloor, lastGenStats, validateFloor } from '../src/game/gen/floorgen';
import { libraryStats } from '../src/game/gen/library';

const N = Math.max(10000, Number(process.env.N ?? 10000));
const TYPES: FloorType[] = ['standard', 'elite', 'shop', 'treasure', 'event', 'challenge', 'lift_ambush', 'director', 'boss'];
const EXITS: ExitKind[][] = [['stairs', 'lift'], ['stairs', 'corridor'], ['lift', 'corridor'], ['stairs', 'lift', 'corridor']];

const actOf = (f: number): Act => (f <= 5 ? 1 : f <= 10 ? 2 : f <= 15 ? 3 : 4) as Act;

function hashU32(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

const failures = new Map<string, number>();
const examples: string[] = [];
const byType = new Map<string, { n: number; ms: number; max: number }>();
const byTheme = new Map<string, number>();
let totalMs = 0, maxMs = 0, retries = 0, maxAttempts = 0;
let rooms = 0, props = 0, breaches = 0, windows = 0, determinismChecks = 0, determinismFails = 0;
const timings: number[] = [];

const stats = libraryStats();
console.log(`Template library: ${stats.authored} authored (${stats.shared} shared), ${stats.orientations} orientations`);
console.log('Per theme:', Object.entries(stats.perTheme).map(([k, v]) => `${k}=${v}`).join(' '));

const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const h = hashU32(i + 1);
  const floorNumber = (i % 20) + 1;
  const act = actOf(floorNumber);
  const themes = THEMES_BY_ACT[act];
  const theme: ThemeId = themes[(i >>> 5) % themes.length];
  let floorType: FloorType = TYPES[(i >>> 2) % TYPES.length];
  const req: FloorRequest = {
    runSeed: h, floorNumber, act, wing: (i >>> 1) % 3, floorType, theme,
    alarm: (h & 7) === 0, exits: EXITS[(h >>> 3) & 3], platform: (h >>> 5) & 1 ? 'android' : 'pc',
    hotDesking: ((h >>> 6) & 3) === 0, cultDressing: act === 4,
  };
  if (floorType === 'boss') req.exits = ['stairs'];
  const s = performance.now();
  let map: FloorMap;
  try {
    map = generateFloor(req);
  } catch (e) {
    const key = 'exception: ' + (e as Error).message;
    failures.set(key, (failures.get(key) ?? 0) + 1);
    if (examples.length < 12) examples.push(`${JSON.stringify(req)} -> ${key}`);
    continue;
  }
  const ms = performance.now() - s;
  timings.push(ms);
  totalMs += ms; maxMs = Math.max(maxMs, ms);
  const bt = byType.get(floorType) ?? { n: 0, ms: 0, max: 0 };
  bt.n++; bt.ms += ms; bt.max = Math.max(bt.max, ms); byType.set(floorType, bt);
  byTheme.set(theme, (byTheme.get(theme) ?? 0) + 1);
  if (map.attempts > 1) retries++;
  maxAttempts = Math.max(maxAttempts, map.attempts);
  rooms += map.rooms.length; props += map.props.length; breaches += map.breaches.length;
  for (let k = 0; k < map.tiles.length; k++) if (map.tiles[k] === 6 || map.tiles[k] === 7) windows++;
  const errs = validateFloor(map);
  if (map.attempts > 64) errs.push('generator exhausted attempts: ' + lastGenStats().lastErrors.slice(0, 3).join('; '));
  for (const e of errs) {
    const key = e.replace(/\d+/g, '#');
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
  if (errs.length && examples.length < 12) examples.push(`seed=${req.runSeed} f=${floorNumber} type=${floorType} theme=${theme}: ${errs.slice(0, 3).join(' | ')}`);
  // determinism spot check
  if (i % 97 === 0) {
    determinismChecks++;
    const again = generateFloor(req);
    if (again.w !== map.w || again.h !== map.h || again.props.length !== map.props.length || again.tiles.some((t, k) => t !== map.tiles[k])) determinismFails++;
  }
}
const elapsed = performance.now() - t0;
timings.sort((a, b) => a - b);
const pct = (p: number) => timings[Math.min(timings.length - 1, Math.floor(timings.length * p))] ?? 0;

console.log(`\nGenerated ${N} floors in ${(elapsed / 1000).toFixed(1)} s`);
console.log(`Timing per floor: mean ${(totalMs / N).toFixed(2)} ms, p50 ${pct(0.5).toFixed(2)} ms, p99 ${pct(0.99).toFixed(2)} ms, max ${maxMs.toFixed(2)} ms`);
for (const [t, v] of byType) console.log(`  ${t.padEnd(12)} n=${String(v.n).padStart(5)}  mean ${(v.ms / v.n).toFixed(2)} ms  max ${v.max.toFixed(2)} ms`);
console.log('Per theme:', [...byTheme].map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`Floors needing regeneration (seed+1): ${retries} (max attempts ${maxAttempts})`);
console.log(`Totals: ${rooms} rooms, ${props} props, ${breaches} breach segments, ${windows} window tiles`);
console.log(`Determinism: ${determinismChecks - determinismFails}/${determinismChecks} identical re-generations`);
if (determinismFails) failures.set('non-deterministic generation', determinismFails);

if (failures.size) {
  console.log('\nFAILURES:');
  for (const [k, v] of [...failures].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
  console.log('\nExamples:');
  for (const e of examples) console.log('  ' + e);
  console.log('\nSOAK FAILED');
  process.exit(1);
}
console.log('\nSOAK PASSED: 0 failures, 0 softlocks');
