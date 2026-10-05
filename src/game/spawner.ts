// Spend each floor's enemy_budget across rooms (spec 5.5): composition rules, pool blending, elites, tiers,
// per-room active caps (spec 4.8) with reinforcement waves.
import type { World } from './world';
import type { FloorPlan, RunState } from './run';
import { Enemy, EnemyInit } from './enemy';
import { Rng } from '../core/rng';
import { ARCHETYPE_DEFS, ArchetypeDef, ACTS } from '../data/tables';
import type { Act, ArchetypeId, Tier } from '../data/ids';
import { ARCHETYPES } from '../data/ids';
import { MAX_ACTIVE_ENEMIES } from '../core/app';
import type { RoomDef } from './world-types';
import { dist } from '../core/math';
import { smokePuff } from './fx';
import { audio } from '../audio/audio';

export interface QueuedSpawn { archetype: ArchetypeId; tier: Tier; roomId: number; extra?: Partial<EnemyInit>; }

/** Reinforcement queues per room. */
export class SpawnQueues {
  q = new Map<number, QueuedSpawn[]>();
  push(s: QueuedSpawn): void { const l = this.q.get(s.roomId) ?? []; l.push(s); this.q.set(s.roomId, l); }
  count(roomId: number): number { return this.q.get(roomId)?.length ?? 0; }
  total(): number { let n = 0; for (const l of this.q.values()) n += l.length; return n; }
}

export function tierFor(arch: ArchetypeDef, act: Act): Tier {
  const diff = act - arch.act;
  return (diff <= 0 ? 0 : diff === 1 ? 1 : 2) as Tier;
}

export interface SpawnContext { world: World; run: RunState; plan: FloorPlan; rng: Rng; telegraphMult: number; queues: SpawnQueues; }

export function makeEnemy(ctx: SpawnContext, s: QueuedSpawn, x: number, y: number, aware = false): Enemy {
  const e = new Enemy({ archetype: s.archetype, tier: s.tier, act: ctx.plan.act, floor: ctx.plan.floor_number, x, y, roomId: s.roomId, rng: ctx.rng.fork(ctx.rng.nextU32()), aware, telegraphMult: ctx.telegraphMult, ...s.extra });
  ctx.world.add(e);
  ctx.world.assignToRoom(e, s.roomId);
  ctx.world.bus.emit('enemySpawn', { enemy: e });
  return e;
}

/** Archetype pool for a floor (spec 5.5 pool blending: 70% current act, 30% earlier at a higher tier). */
export function poolFor(plan: FloorPlan): { current: ArchetypeDef[]; earlier: ArchetypeDef[] } {
  const all = ARCHETYPES.map((id) => ARCHETYPE_DEFS[id]);
  const current = all.filter((a) => a.act === plan.act && a.fromFloor <= plan.floor_number && !a.eliteOnly);
  const earlier = all.filter((a) => a.act < plan.act && !a.eliteOnly);
  return { current: current.length ? current : all.filter((a) => a.act === 1 && !a.eliteOnly && a.fromFloor <= plan.floor_number), earlier };
}

function eliteFor(plan: FloorPlan): ArchetypeDef | null {
  const elites = ARCHETYPES.map((id) => ARCHETYPE_DEFS[id]).filter((a) => a.eliteOnly && a.act <= plan.act && a.fromFloor <= Math.max(plan.floor_number, 3));
  if (!elites.length) return null;
  // prefer this act's elite
  return elites.find((a) => a.act === plan.act) ?? elites[elites.length - 1];
}

/** Build a room's roster from its budget share, honouring composition rules. */
export function composeRoom(rng: Rng, plan: FloorPlan, budget: number, opts: { elite: boolean; swarmOnly?: boolean; restructure?: number }): { arch: ArchetypeDef; tier: Tier }[] {
  const { current, earlier } = poolFor(plan);
  const out: { arch: ArchetypeDef; tier: Tier }[] = [];
  let left = budget;
  if (opts.elite) {
    const el = eliteFor(plan);
    if (el && left >= el.cost * 0.7) { out.push({ arch: el, tier: tierFor(el, plan.act) }); left -= el.cost; }
  }
  let supports = 0;
  let guard = 0;
  while (left > 0.5 && guard++ < 60) {
    let pool = rng.chance(ACTS[plan.act - 1].poolCurrent) || !earlier.length ? current : earlier;
    if (opts.swarmOnly) pool = [...current, ...earlier].filter((a) => a.role === 'swarmer');
    pool = pool.filter((a) => a.cost <= left + 0.5 && !(a.role === 'support' && supports >= 2));
    if (!pool.length) break;
    // force role diversity: if all so far share one role, prefer a different role
    const roles = new Set(out.map((o) => o.arch.role));
    let pick: ArchetypeDef;
    if (out.length >= 1 && roles.size === 1 && !opts.swarmOnly) {
      const diff = pool.filter((a) => !roles.has(a.role));
      pick = diff.length ? rng.pick(diff) : rng.pick(pool);
    } else pick = rng.weighted(pool, (a) => (a.role === 'swarmer' ? 1.6 : 1));
    if (pick.role === 'support') supports++;
    // swarmers come in packs (Interns 3–5)
    const pack = pick.id === 'intern' ? rng.int(3, 5) : pick.role === 'swarmer' ? rng.int(2, 3) : 1;
    for (let i = 0; i < pack && left > 0.5; i++) {
      out.push({ arch: pick, tier: tierFor(pick, plan.act) });
      left -= pick.cost;
    }
  }
  // guarantee ≥2 roles (spec 5.5) when room has more than one enemy
  if (out.length >= 2 && new Set(out.map((o) => o.arch.role)).size < 2 && !opts.swarmOnly) {
    const alt = [...current, ...earlier].filter((a) => a.role !== out[0].arch.role && a.role !== 'support');
    if (alt.length) out[out.length - 1] = { arch: rng.pick(alt), tier: tierFor(out[0].arch, plan.act) };
  }
  return out;
}

/** Populate the floor. Returns the spawn queues for reinforcement waves. */
export function populateFloor(ctx: SpawnContext): void {
  const { world, plan, rng, run } = ctx;
  const rooms = world.map.rooms.filter((r) => isCombatRoom(r));
  if (!rooms.length) return;
  let budget = plan.enemy_budget;
  const lift = plan.floor_type === 'lift_ambush';
  if (lift) budget = Math.round(budget * 0.6);
  const totalWeight = rooms.reduce((a, r) => a + Math.max(0.2, r.sizeWeight), 0);
  const restructure = run.modifiers.restructure ?? 0;
  // elite rooms
  const eliteRoomIds = new Set<number>();
  if (plan.floor_type === 'elite') {
    const er = rooms.find((r) => r.eliteRoom) ?? rooms.reduce((a, b) => (a.sizeWeight > b.sizeWeight ? a : b));
    eliteRoomIds.add(er.id);
  } else if (plan.act >= 2 && !lift) {
    for (const r of rooms) if (rng.chance(ACTS[plan.act - 1].eliteRoomChance + restructure * 0.08)) eliteRoomIds.add(r.id);
  }
  for (const r of rooms) {
    const share = Math.max(2, Math.round((budget * Math.max(0.2, r.sizeWeight)) / totalWeight));
    const roster = composeRoom(rng, plan, share, { elite: eliteRoomIds.has(r.id), swarmOnly: lift, restructure });
    placeRoster(ctx, r, roster.map((o) => ({ archetype: o.arch.id, tier: o.tier, roomId: r.id })), world.alarm || lift);
  }
}

export function isCombatRoom(r: RoomDef): boolean {
  return !['core', 'shop', 'treasure', 'event', 'corridor'].includes(r.kind);
}

/** Spawn up to the active cap now; queue the rest as reinforcements. */
export function placeRoster(ctx: SpawnContext, r: RoomDef, list: QueuedSpawn[], aware: boolean): void {
  const pts = ctx.rng.shuffle([...r.spawnPoints]);
  let i = 0;
  for (const s of list) {
    if (i < MAX_ACTIVE_ENEMIES && i < pts.length) {
      const p = pts[i];
      makeEnemy(ctx, s, p.x + ctx.rng.range(-3, 3), p.y + ctx.rng.range(-3, 3), aware);
    } else ctx.queues.push(s);
    i++;
  }
}

/** Called every frame: when a locked room's live count drops, bring in reinforcements through the doors. */
export function updateReinforcements(ctx: SpawnContext): void {
  const { world } = ctx;
  for (const [roomId, list] of ctx.queues.q) {
    if (!list.length) continue;
    const rs = world.rooms[roomId];
    if (!rs || !(rs.locked || (world.alarm && rs.entered))) continue;
    const live = world.liveEnemies(roomId);
    if (live >= Math.max(2, MAX_ACTIVE_ENEMIES - 3)) continue;
    const s = list.shift()!;
    // furthest spawn point from player
    const pts = [...rs.def.spawnPoints].sort((a, b) => dist(b, world.player) - dist(a, world.player));
    const p = pts[0];
    smokePuff(world.particles, p.x, p.y - 6, 8, '#d0d4dc', 6);
    audio.sfx('purchase_order', { x: p.x, y: p.y, vol: 0.5 });
    makeEnemy(ctx, s, p.x, p.y, true);
  }
}
