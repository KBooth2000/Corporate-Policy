// Run state, floor planning and exit rolling (spec 3: run structure, exits, floor data model 3.7).
import { RngStreams, RngState, StreamName, seedToCode, hashCombine } from '../core/rng';
import type { Act, ExitKind, FloorType, PlayerRoleId, RewardKind, ThemeId, BenefitDept } from '../data/ids';
import { THEMES_BY_ACT, BENEFIT_DEPTS } from '../data/ids';
import { ACTS, actOfFloor, enemyBudget, isBossFloor, REWARD_WEIGHTS, ROLES } from '../data/tables';
import { WeaponInst, makeWeapon } from './weapons';
import { BASE_STATS, PlayerStats, StatMod, computeStats } from './stats';

export const RUN_VERSION = 1;

/** Spec 3.7 floor data object. */
export interface FloorPlan {
  floor_number: number;
  act: Act;
  wing: number;
  floor_type: FloorType;
  department_theme: ThemeId;
  alarm: boolean;
  enemy_budget: number;
  lift_ambush_chance: number;
  /** The reward granted when this floor is cleared (decided by the exit preview that led here). */
  reward: RewardKind;
  rewardDept?: BenefitDept;
  /** Corridor destination sub-type (shop/event/treasure/challenge/director). */
  challenge?: 'fire_drill' | 'quiet_carriage' | 'no_damage' | 'hazard_only';
}

/** An exit offer on a cleared floor (spec 3.3). */
export interface ExitOption {
  kind: ExitKind;
  available: boolean;
  dest: FloorPlan | null;
  /** Lift ambush resolved at departure (25%). */
}

export interface RunStatsLog {
  kills: number; executions: number; defenestrations: number; breaches: number; hazardKills: number; throwsKills: number;
  damageDealt: number; damageTaken: number; rageActivations: number; floorsCleared: number; roomsCleared: number;
  cashEarned: number; cashSpent: number; weaponsBroken: number; bossesKilled: number; elitesKilled: number; promotedTerminated: number;
  liftAmbushes: number; corridorsTaken: number; deaths: number; maxCombo: number; timePerFloor: number[]; killsByMethod: Record<string, number>;
  execByType: Record<string, number>;
}

export interface RunState {
  version: number;
  seed: number;
  seedCode: string;
  daily: boolean;
  dailyKey?: string;
  practice: boolean;
  seeded: boolean;
  role: PlayerRoleId;
  floor: number;
  wing: number;
  plan: FloorPlan;
  hp: number;
  shield: number;
  rage: number;
  maxHpBonus: number;
  loadout: { melee: WeaponInst | null; ranged: WeaponInst | null; thrown: WeaponInst | null };
  benefits: { id: string; rarity: 0 | 1 | 2 }[];
  deskItems: string[];
  pettyCash: number;
  debt: number;
  modifiers: Record<string, number>;
  assist: boolean;
  streams: Record<StreamName, RngState>;
  corridorsThisAct: number;
  lastWasCorridor: boolean;
  themesUsed: ThemeId[];
  flags: Record<string, number | boolean | string>;
  log: RunStatsLog;
  events: number[];      // anti-cheat event hash chain (spec 4.6)
  checksum: number;
  startTime: number;
  elapsed: number;
  /** Promoted enemies inserted this run (ids). */
  promotedIds: string[];
  /** Extra stat mods from events/temporary effects. */
  extraMods: StatMod[];
  /** Weakness intel revealed this run. */
  intel: string[];
  victory: boolean;
}

export function freshLog(): RunStatsLog {
  return { kills: 0, executions: 0, defenestrations: 0, breaches: 0, hazardKills: 0, throwsKills: 0, damageDealt: 0, damageTaken: 0, rageActivations: 0, floorsCleared: 0, roomsCleared: 0, cashEarned: 0, cashSpent: 0, weaponsBroken: 0, bossesKilled: 0, elitesKilled: 0, promotedTerminated: 0, liftAmbushes: 0, corridorsTaken: 0, deaths: 0, maxCombo: 0, timePerFloor: [], killsByMethod: {}, execByType: {} };
}

export interface NewRunOpts { seed: number; role: PlayerRoleId; daily?: boolean; dailyKey?: string; practice?: boolean; seeded?: boolean; modifiers?: Record<string, number>; assist?: boolean; }

export function newRun(o: NewRunOpts): RunState {
  const streams = new RngStreams(o.seed);
  const role = ROLES[o.role];
  const run: RunState = {
    version: RUN_VERSION, seed: o.seed, seedCode: seedToCode(o.seed), daily: !!o.daily, dailyKey: o.dailyKey, practice: !!o.practice, seeded: !!o.seeded,
    role: o.role, floor: 1, wing: 0, plan: null as unknown as FloorPlan, hp: 0, shield: 0, rage: 0, maxHpBonus: 0,
    loadout: { melee: role.melee && role.melee !== 'fists' ? makeWeapon(role.melee) : null, ranged: role.ranged ? makeWeapon(role.ranged, { ammoMult: role.ammoMult }) : null, thrown: role.throwables[0] ? makeWeapon(role.throwables[0]) : null },
    benefits: [], deskItems: [], pettyCash: 0, debt: 0, modifiers: o.modifiers ?? {}, assist: !!o.assist,
    streams: streams.serialise(), corridorsThisAct: 0, lastWasCorridor: false, themesUsed: [], flags: {}, log: freshLog(),
    events: [], checksum: hashCombine(o.seed, 'run'), startTime: Date.now(), elapsed: 0, promotedIds: [], extraMods: [], intel: [], victory: false,
  };
  if (role.throwables[1]) run.flags.spareThrowable = role.throwables[1];
  run.plan = planFloor(run, 1, 0, { reward: 'cash', type: 'standard' });
  const s = runStats(run);
  run.hp = s.maxHp;
  run.shield = s.maxShield;
  return run;
}

/** Live stream objects for a run (restored from state). */
export function streamsOf(run: RunState): RngStreams {
  const s = new RngStreams(run.seed);
  s.restore(run.streams);
  return s;
}

/** Role + benefit/desk item/performance-review mods → stats. Effects register their mods via STAT_MOD_PROVIDERS. */
export const STAT_MOD_PROVIDERS: ((run: RunState) => StatMod[])[] = [];

export function runStats(run: RunState): PlayerStats {
  const role = ROLES[run.role];
  const mods: StatMod[] = [
    { stat: 'maxHp', mult: role.hpMult, source: 'role' },
    { stat: 'rageFill', mult: role.rageFillMult, source: 'role' },
    { stat: 'shieldRegenRate', mult: role.shieldRegen, source: 'role' },
    { stat: 'ammoMult', mult: role.ammoMult, source: 'role' },
    { stat: 'hazardDamage', mult: role.hazardMult, source: 'role' },
    { stat: 'maxHp', add: run.maxHpBonus, source: 'bonus' },
    ...run.extraMods,
  ];
  for (const p of STAT_MOD_PROVIDERS) mods.push(...p(run));
  // Performance Review: Mandatory Fun (rage decays faster), Zero Tolerance (grab threshold)
  const mf = run.modifiers.mandatory_fun ?? 0;
  if (mf) mods.push({ stat: 'rageDecay', mult: 1 + 0.4 * mf, source: 'pr' });
  const zt = run.modifiers.zero_tolerance ?? 0;
  if (zt) mods.push({ stat: 'grabThreshold', add: zt === 1 ? -0.10 : -0.15, source: 'pr' });
  return computeStats(mods, BASE_STATS);
}

// ---------------------------------------------------------------------------
// Floor planning
export function actDef(act: number) { return ACTS[act - 1]; }

export function pickTheme(run: RunState, act: Act, rngNext: () => number): ThemeId {
  const pool = THEMES_BY_ACT[act];
  const used = new Set(run.themesUsed);
  let avail = pool.filter((t) => !used.has(t));
  if (!avail.length) avail = [...pool];
  return avail[Math.floor(rngNext() * avail.length)];
}

export function rollReward(r: () => number, luck = 0): RewardKind {
  const items = REWARD_WEIGHTS.map((w) => ({ k: w.reward as RewardKind, w: w.weight * (w.reward === 'desk_item' ? 1 + luck : 1) }));
  const total = items.reduce((a, b) => a + b.w, 0);
  let x = r() * total;
  for (const it of items) { x -= it.w; if (x < 0) return it.k; }
  return 'cash';
}

export function planFloor(run: RunState, floor: number, wing: number, o: { reward: RewardKind; type?: FloorType; dept?: BenefitDept; challenge?: FloorPlan['challenge'] }): FloorPlan {
  const act = actOfFloor(floor) as Act;
  const r = streamsOf(run).get('layout');
  const rr = () => r.next();
  const a = actDef(act);
  let type: FloorType = o.type ?? 'standard';
  if (isBossFloor(floor) && wing === 0 && type !== 'lift_ambush') type = 'boss';
  const theme: ThemeId = type === 'boss' ? (act === 1 ? 'basement' : act === 2 ? 'sales' : act === 3 ? 'compliance' : 'boardroom') : pickTheme(run, act, rr);
  const alarm = (type === 'standard' || type === 'elite') && floor > 1 && rr() < a.alarmChance;
  return {
    floor_number: floor, act, wing, floor_type: type, department_theme: theme, alarm,
    enemy_budget: Math.round(enemyBudget(floor) * (alarm ? 1.3 : 1) * (type === 'elite' ? 0.8 : 1)),
    lift_ambush_chance: a.liftAmbushChance, reward: o.reward, rewardDept: o.dept, challenge: o.challenge,
  };
}

/**
 * Roll the exits offered on a cleared floor (spec 3.3):
 * - 2–3 of the three exits; lift never skips a boss floor; corridors ≤2 per act and never twice in a row.
 * Destinations and their reward previews are decided now so the preview is honest.
 */
export function rollExits(run: RunState): ExitOption[] {
  const st = streamsOf(run);
  const r = st.get('loot');
  const f = run.floor;
  const luck = 0;
  const nextIsBoss = isBossFloor(f + 1);
  const curIsBoss = run.plan.floor_type === 'boss';
  const opts: ExitOption[] = [];
  if (f >= 20) return [];
  const mkDest = (floor: number, kind: ExitKind): FloorPlan => {
    const reward = rollReward(() => r.next(), luck);
    const elite = !isBossFloor(floor) && floor >= 3 && r.next() < (actOfFloor(floor) === 1 ? 0.22 : 0.18);
    const dept = reward === 'benefit' ? BENEFIT_DEPTS[Math.floor(r.next() * BENEFIT_DEPTS.length)] : undefined;
    void kind;
    return planFloor(run, floor, 0, { reward: elite && reward === 'cash' ? 'weapon' : reward, type: elite ? 'elite' : 'standard', dept });
  };
  // stairs: always considered
  const stairs: ExitOption = { kind: 'stairs', available: true, dest: mkDest(f + 1, 'stairs') };
  const liftAllowed = !nextIsBoss && f + 2 <= 20 && !curIsBoss;
  const lift: ExitOption = { kind: 'lift', available: liftAllowed, dest: liftAllowed ? mkDest(f + 2, 'lift') : null };
  const corridorAllowed = run.corridorsThisAct < 2 && !run.lastWasCorridor && run.wing === 0 && !curIsBoss;
  let corridor: ExitOption = { kind: 'corridor', available: false, dest: null };
  if (corridorAllowed) {
    const roll = r.next();
    const type: FloorType = roll < 0.4 ? 'shop' : roll < 0.7 ? 'event' : roll < 0.82 ? 'treasure' : 'challenge';
    const reward: RewardKind = type === 'shop' ? 'shop' : type === 'event' ? 'event' : type === 'treasure' ? 'treasure' : 'challenge';
    const challenge = type === 'challenge' ? (r.next() < 0.5 ? 'fire_drill' : 'quiet_carriage') : undefined;
    const dest = planFloor(run, f, run.wing + 1, { reward, type, challenge });
    corridor = { kind: 'corridor', available: true, dest };
  }
  opts.push(stairs, lift, corridor);
  // choose 2–3 of the available exits; stairs is always one of them (the reliable option)
  const avail = opts.filter((o) => o.available);
  if (avail.length === 3 && r.next() < 0.35) {
    const drop = r.next() < 0.5 ? lift : corridor;
    drop.available = false;
  }
  // persist RNG
  run.streams = st.serialise();
  return opts;
}

/** Record an event into the anti-cheat hash chain (spec 4.6). */
export function logEvent(run: RunState, code: number, value = 0): void {
  run.checksum = hashCombine(run.checksum, code, value, run.floor);
  run.events.push(code);
  if (run.events.length > 4096) run.events.shift();
}
