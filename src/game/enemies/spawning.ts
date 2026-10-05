// Spawner refinements (spec 5.5 / 7.4 / 5.6), applied as a FLOOR_HOOK after src/game/spawner.ts populateFloor():
//  - Lift ambush: budget = enemy_budget(floor) × 0.6 (from the base formula, not the destination's alarm/elite-adjusted
//    budget), swarmers and rushers only (Interns + Sales Reps), with at least one rusher from Act 2.
//  - Restructure (Performance Review, 3 ranks): spawner.ts already adds +8% elite-room chance per rank from Act 2
//    (modifiers.csv). Here: Act 1 standard floors get a 4%-per-rank chance per room of an elite (overriding the
//    "elite floors only" rule, since it is an opt-in difficulty modifier), and rank 3 adds a second elite room to
//    Elite floors. Elites replace roughly their cost in regular staff, and stay ≤1 per room.
//  - Promoted-enemy insertion helpers used by src/game/promotion.ts (normal rooms, or a Director's own arena room).
import { FLOOR_HOOKS } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import { Enemy, EnemyInit } from '../enemy';
import { makeEnemy, tierFor, isCombatRoom, QueuedSpawn } from '../spawner';
import { ARCHETYPE_DEFS, enemyBudget } from '../../data/tables';
import type { ArchetypeId, Tier } from '../../data/ids';
import { ARCHETYPES } from '../../data/ids';
import { MAX_ACTIVE_ENEMIES } from '../../core/app';
import type { RoomDef } from '../world-types';
import { Rng } from '../../core/rng';
import '../promotion'; // the promotion module lives in src/game/ (not auto-loaded); this import registers its hooks

const SWARM: ArchetypeId[] = ['intern', 'sales_rep'];
const RUSHERS: ArchetypeId[] = ['sales_rep'];

export function floorEnemies(s: GameplayScene): Enemy[] {
  return s.world.actors.filter((a): a is Enemy => a instanceof Enemy && a.alive && !a.isBoss);
}

/** Remove a freshly placed enemy (before the player meets it). */
export function despawn(s: GameplayScene, e: Enemy): void {
  e.dead = true;
  for (const r of s.world.rooms) r.enemies.delete(e);
}

function costOf(id: ArchetypeId): number { return ARCHETYPE_DEFS[id]?.cost ?? 1; }

function spawnInRoom(s: GameplayScene, room: RoomDef, q: QueuedSpawn, aware: boolean, rng: Rng): Enemy | null {
  if (s.world.liveEnemies(room.id) >= MAX_ACTIVE_ENEMIES) { s.spawn.queues.push(q); return null; }
  const pts = room.spawnPoints.length ? room.spawnPoints : [{ x: (room.tx + room.tw / 2) * 16, y: (room.ty + room.th / 2) * 16 }];
  const p = rng.pick(pts);
  return makeEnemy(s.spawn, q, p.x + rng.range(-4, 4), p.y + rng.range(-4, 4), aware);
}

// ---------------------------------------------------------------------------------------------------------------
// Lift ambush (spec 5.5)
export function refineLiftAmbush(s: GameplayScene): void {
  const { plan, world } = s;
  const rng = s.floorRng.spawns.fork('lift');
  const target = Math.max(2, Math.round(enemyBudget(plan.floor_number) * 0.6));
  const rooms = world.map.rooms.filter(isCombatRoom);
  if (!rooms.length) return;
  const live = floorEnemies(s);
  // 1) swarmers and rushers only
  for (const e of live) if (!SWARM.includes(e.archetype) && !e.promoted) despawn(s, e);
  for (const list of s.spawn.queues.q.values()) for (let i = list.length - 1; i >= 0; i--) if (!SWARM.includes(list[i].archetype)) list.splice(i, 1);
  const kept = () => floorEnemies(s).filter((e) => !e.dead);
  const queued = () => [...s.spawn.queues.q.values()].flat();
  const spent = () => kept().reduce((a, e) => a + costOf(e.archetype), 0) + queued().reduce((a, q) => a + costOf(q.archetype), 0);
  const repsAvailable = plan.act >= 2 || plan.floor_number >= ARCHETYPE_DEFS.sales_rep.fromFloor;
  // 2) trim down to the target (cheapest-last so packs stay packs)
  let guard = 0;
  while (spent() > target + 1 && guard++ < 40) {
    const q = queued();
    if (q.length) { for (const list of s.spawn.queues.q.values()) if (list.length) { list.pop(); break; } continue; }
    const k = kept();
    if (!k.length) break;
    despawn(s, k[k.length - 1]);
  }
  // 3) top up (aware: it's an ambush)
  guard = 0;
  while (spent() < target - 1 && guard++ < 40) {
    const room = rng.pick(rooms);
    const left = target - spent();
    const arch: ArchetypeId = repsAvailable && left >= 2 && rng.chance(0.4) ? 'sales_rep' : 'intern';
    spawnInRoom(s, room, { archetype: arch, tier: tierFor(ARCHETYPE_DEFS[arch], plan.act), roomId: room.id }, true, rng);
  }
  // 4) rushers from Act 2: swap two interns for a Sales Rep if there are none
  if (repsAvailable && !kept().some((e) => RUSHERS.includes(e.archetype)) && !queued().some((q) => RUSHERS.includes(q.archetype))) {
    const interns = kept().filter((e) => e.archetype === 'intern');
    if (interns.length >= 2) {
      const room = world.map.rooms[interns[0].roomId] ?? rooms[0];
      despawn(s, interns[0]); despawn(s, interns[1]);
      spawnInRoom(s, room, { archetype: 'sales_rep', tier: tierFor(ARCHETYPE_DEFS.sales_rep, plan.act), roomId: room.id }, true, rng);
    }
  }
  for (const e of kept()) e.aware = true;
}

// ---------------------------------------------------------------------------------------------------------------
// Restructure (spec 7.4)
function eliteForAct(act: number): ArchetypeId {
  const elites = ARCHETYPES.filter((id) => ARCHETYPE_DEFS[id].eliteOnly && ARCHETYPE_DEFS[id].act <= act);
  return elites.find((id) => ARCHETYPE_DEFS[id].act === act) ?? elites[elites.length - 1] ?? 'fire_warden';
}

/** Put an elite into a room, replacing roughly its cost in regular staff. Returns the elite (or null). */
export function addEliteToRoom(s: GameplayScene, room: RoomDef, rng: Rng): Enemy | null {
  const inRoom = floorEnemies(s).filter((e) => e.roomId === room.id && !e.dead);
  if (inRoom.some((e) => e.elite)) return null; // ≤1 elite per room (spec 5.5)
  const id = eliteForAct(s.plan.act);
  let budget = costOf(id) * 0.7;
  const q = s.spawn.queues.q.get(room.id) ?? [];
  while (budget > 0 && q.length) { const x = q.pop()!; budget -= costOf(x.archetype); }
  const cheap = inRoom.filter((e) => !e.elite && !e.promoted && e.arch.role !== 'support').sort((a, b) => a.arch.cost - b.arch.cost);
  while (budget > 0 && cheap.length > 1) { const e = cheap.shift()!; budget -= e.arch.cost; despawn(s, e); }
  return spawnInRoom(s, room, { archetype: id, tier: tierFor(ARCHETYPE_DEFS[id], s.plan.act), roomId: room.id }, s.world.alarm, rng);
}

export function applyRestructure(s: GameplayScene): void {
  const rank = s.run.modifiers.restructure ?? 0;
  if (!rank) return;
  const rng = s.floorRng.spawns.fork('restructure');
  const rooms = s.world.map.rooms.filter(isCombatRoom);
  const hasElite = (r: RoomDef) => floorEnemies(s).some((e) => e.roomId === r.id && (e.elite || e.promoted) && !e.dead);
  if (s.plan.act === 1 && s.plan.floor_type === 'standard') {
    for (const r of rooms) if (rng.chance(0.04 * rank) && !hasElite(r)) addEliteToRoom(s, r, rng);
  }
  if (s.plan.floor_type === 'elite' && rank >= 3) {
    const free = rooms.filter((r) => !hasElite(r)).sort((a, b) => b.sizeWeight - a.sizeWeight);
    if (free.length) addEliteToRoom(s, free[0], rng);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Promoted enemy insertion (used by src/game/promotion.ts)
/** A room for a promoted enemy: any combat room for regular ranks; for a Director, its own arena room. */
export function pickPromotedRoom(s: GameplayScene, director: boolean, rng: Rng, avoid: Set<number> = new Set()): RoomDef | null {
  const rooms = s.world.map.rooms.filter((r) => isCombatRoom(r) && r.spawnPoints.length && !avoid.has(r.id));
  if (!rooms.length) return null;
  if (director) {
    // the Manager's Office / elite arena template if present, otherwise the biggest room
    return rooms.find((r) => r.eliteRoom) ?? [...rooms].sort((a, b) => b.sizeWeight - a.sizeWeight)[0];
  }
  const normal = rooms.filter((r) => !r.eliteRoom);
  return rng.pick(normal.length ? normal : rooms);
}

export function insertPromoted(s: GameplayScene, o: { archetype: ArchetypeId; tier: Tier; room: RoomDef; extra: Partial<EnemyInit>; arena: boolean; rng: Rng }): Enemy | null {
  const room = o.room;
  if (o.arena) {
    // a Director gets the room to themselves
    for (const e of floorEnemies(s)) if (e.roomId === room.id) despawn(s, e);
    s.spawn.queues.q.set(room.id, []);
  }
  const pts = [...room.spawnPoints];
  if (!pts.length) return null;
  // furthest from the room's doors-ish: pick the spawn point furthest from the room centre's nearest door is overkill;
  // use the point furthest from the player's arrival so they meet it inside the room
  pts.sort((a, b) => Math.hypot(b.x - s.player.x, b.y - s.player.y) - Math.hypot(a.x - s.player.x, a.y - s.player.y));
  const p = o.arena ? pts[0] : o.rng.pick(pts);
  const e = makeEnemy(s.spawn, { archetype: o.archetype, tier: o.tier, roomId: room.id, extra: o.extra }, p.x, p.y, s.world.alarm);
  return e;
}

// ---------------------------------------------------------------------------------------------------------------
FLOOR_HOOKS.push((s) => {
  const t = s.plan.floor_type;
  if (t === 'lift_ambush') { refineLiftAmbush(s); return; }
  if (t === 'standard' || t === 'elite') applyRestructure(s);
});
