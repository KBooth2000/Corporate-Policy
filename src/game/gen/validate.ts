// Floor validator (spec 4.4 step 9 + 4.7 breach rules). Returns a list of human-readable failures; [] = valid.
// Pure TypeScript (no DOM) so the soak test runs it in Node.
import type { FloorMap } from '../world-types';
import { BREACHABLE_TILES, T, TILE } from '../world-types';
import { bfs, doorApron, doorTiles, freeGrid, isWalkTile, propBaseTile, propTiles } from './build';
import { critBounds, SPECIAL_FLOORS } from './rules';
import { COMBAT_KINDS } from './themes';

const TC = { ...T };
const BREACHABLE = new Set(BREACHABLE_TILES);

export function validateFloor(m: FloorMap): string[] {
  const errs: string[] = [];
  const W = m.w, H = m.h;
  const idx = (x: number, y: number) => y * W + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (m.tiles.length !== W * H || m.roomOf.length !== W * H || m.material.length !== W * H) return ['bad array sizes'];
  if (!m.rooms[m.coreRoomId]) errs.push('core room missing');
  m.rooms.forEach((r, i) => { if (r.id !== i) errs.push(`room ${i} id mismatch`); });
  m.doors.forEach((d, i) => { if (d.id !== i) errs.push(`door ${i} id mismatch`); });
  m.props.forEach((p, i) => { if (p.id !== i) errs.push(`prop ${i} id mismatch`); });

  // ---- tiles vs rooms
  for (let i = 0; i < W * H; i++) {
    const r = m.roomOf[i];
    if (r >= 0 && !isWalkTile(m.tiles[i]) && m.tiles[i] !== TC.CUBICLE && m.tiles[i] !== TC.WALL && m.tiles[i] !== TC.PIT && m.tiles[i] !== TC.CORE_WALL)
      errs.push(`room tile ${i % W},${(i / W) | 0} has code ${m.tiles[i]}`);
    if ((m.tiles[i] === TC.WINDOW || m.tiles[i] === TC.WINDOW_SEALED)) {
      const x = i % W, y = (i / W) | 0;
      let voidN = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (!inb(xx, yy) || m.tiles[idx(xx, yy)] === TC.VOID) voidN = true; }
      if (!voidN) errs.push(`window ${x},${y} not on the perimeter`);
    }
  }
  // border must be solid
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (isWalkTile(m.tiles[idx(x, y)])) errs.push('walkable map edge');
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (isWalkTile(m.tiles[idx(x, y)])) errs.push('walkable map edge');

  // ---- doors
  for (const d of m.doors) {
    if (d.len < 2 || d.len > 3) errs.push(`door ${d.id} len ${d.len}`);
    for (const [x, y] of doorTiles(d)) {
      if (!inb(x, y) || m.tiles[idx(x, y)] !== TC.DOOR) { errs.push(`door ${d.id} tile not DOOR`); break; }
      const a = d.orient === 'h' ? [x, y - 1] : [x - 1, y], b = d.orient === 'h' ? [x, y + 1] : [x + 1, y];
      const ra = m.roomOf[idx(a[0], a[1])], rb = m.roomOf[idx(b[0], b[1])];
      if (!((ra === d.roomA && rb === d.roomB) || (ra === d.roomB && rb === d.roomA))) { errs.push(`door ${d.id} does not join rooms ${d.roomA}/${d.roomB}`); break; }
    }
    if (!m.rooms[d.roomA]?.neighbours.includes(d.roomB) || !m.rooms[d.roomB]?.neighbours.includes(d.roomA)) errs.push(`door ${d.id} neighbours not symmetric`);
  }
  const allDoor = new Set<number>();
  for (const d of m.doors) for (const [x, y] of doorTiles(d)) allDoor.add(idx(x, y));
  for (let i = 0; i < W * H; i++) if (m.tiles[i] === TC.DOOR && !allDoor.has(i)) { errs.push('stray DOOR tile'); break; }

  // ---- props never block doorways / exits; solid props stand on walkable tiles of their room
  const free = freeGrid(m);
  const apron = new Uint8Array(W * H);
  for (const d of m.doors) { for (const [x, y] of doorTiles(d)) apron[idx(x, y)] = 1; for (const [x, y] of doorApron(d, 2)) if (inb(x, y)) apron[idx(x, y)] = 1; }
  for (const p of m.props) {
    if (p.wallMounted) continue;
    const tl = propTiles(p);
    for (const [x, y] of tl) {
      if (!inb(x, y)) { errs.push(`prop ${p.id} out of map`); break; }
      if (p.solid && apron[idx(x, y)]) { errs.push(`prop ${p.id} ${p.kind} blocks door`); break; }
      if (p.solid && !isWalkTile(m.tiles[idx(x, y)])) { errs.push(`prop ${p.id} ${p.kind} on solid tile`); break; }
    }
  }
  for (const e of m.exits) {
    const ex = Math.floor(e.x / TILE), ey = Math.floor(e.y / TILE);
    for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 0; dx++) if (!inb(ex + dx, ey + dy) || !free[idx(ex + dx, ey + dy)]) errs.push(`exit ${e.kind} approach blocked`);
  }

  // ---- reachability from the player spawn (all doors open)
  const sx = Math.floor(m.spawn.x / TILE), sy = Math.floor(m.spawn.y / TILE);
  if (!inb(sx, sy) || !free[idx(sx, sy)]) errs.push('player spawn blocked');
  else {
    let around = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (free[idx(sx + dx, sy + dy)]) around++;
    if (around < 9) errs.push('player spawn enclosed');
  }
  const dist = bfs(m, free, [[sx, sy]]);
  for (const r of m.rooms) {
    let any = false;
    for (let y = r.ty; y < r.ty + r.th && !any; y++) for (let x = r.tx; x < r.tx + r.tw; x++) if (m.roomOf[idx(x, y)] === r.id && dist[idx(x, y)] >= 0) { any = true; break; }
    if (!any) errs.push(`room ${r.id} unreachable`);
    for (const s of r.spawnPoints) {
      const x = Math.floor(s.x / TILE), y = Math.floor(s.y / TILE);
      if (!inb(x, y) || dist[idx(x, y)] < 0) { errs.push(`room ${r.id} spawn point unreachable`); break; }
      if (m.roomOf[idx(x, y)] !== r.id) { errs.push(`room ${r.id} spawn point outside room`); break; }
      for (const id of r.doorIds) for (const [dx, dy] of doorTiles(m.doors[id])) if (Math.max(Math.abs(dx - x), Math.abs(dy - y)) < 3) { errs.push(`room ${r.id} spawn point near door`); break; }
    }
    if (r.kind !== 'core') {
      const rx = Math.floor(r.rewardPoint.x / TILE), ry = Math.floor(r.rewardPoint.y / TILE);
      if (!inb(rx, ry) || dist[idx(rx, ry)] < 0) errs.push(`room ${r.id} reward unreachable`);
    }
  }
  for (const d of m.doors) for (const [x, y] of doorTiles(d)) if (dist[idx(x, y)] < 0) { errs.push(`door ${d.id} unreachable`); break; }
  for (const e of m.exits) { const ex = Math.floor(e.x / TILE), ey = Math.floor(e.y / TILE); if (!inb(ex, ey) || dist[idx(ex, ey)] < 0) errs.push(`exit ${e.kind} unreachable`); }

  // ---- room graph: every room reachable from the core through doors
  const seen = new Set<number>([m.coreRoomId]);
  const q = [m.coreRoomId];
  while (q.length) { const r = q.shift()!; for (const n of m.rooms[r]?.neighbours ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  if (seen.size !== m.rooms.length) errs.push(`room graph disconnected (${seen.size}/${m.rooms.length})`);

  // ---- 2-tile clear corridor through every room between its doors
  for (const r of m.rooms) {
    if (!r.doorIds.length) continue;
    const dset = new Set<number>();
    for (const id of r.doorIds) for (const [x, y] of doorTiles(m.doors[id])) dset.add(idx(x, y));
    const region = (x: number, y: number) => { const i = y * W + x; return x >= 0 && y >= 0 && x < W && y < H && free[i] === 1 && (m.roomOf[i] === r.id || dset.has(i)); };
    const anchorOk = (x: number, y: number) => region(x, y) && region(x + 1, y) && region(x, y + 1) && region(x + 1, y + 1);
    const doorAnchors = (id: number): number[] => {
      const out: number[] = [];
      for (const [x, y] of doorTiles(m.doors[id])) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const ax = x + dx, ay = y + dy;
        if (!anchorOk(ax, ay)) continue;
        // anchor must also reach into the room proper
        let inRoom = false;
        for (const [tx, ty] of [[ax, ay], [ax + 1, ay], [ax, ay + 1], [ax + 1, ay + 1]]) if (m.roomOf[idx(tx, ty)] === r.id) inRoom = true;
        if (inRoom) out.push(idx(ax, ay));
      }
      return out;
    };
    const first = doorAnchors(r.doorIds[0]);
    if (!first.length) { errs.push(`room ${r.id} (${r.templateId}) door ${r.doorIds[0]} has no 2-tile approach`); continue; }
    const reach = new Set<number>(first);
    const qq = [...first];
    while (qq.length) {
      const i = qq.pop()!;
      const x = i % W, y = (i / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = idx(nx, ny);
        if (reach.has(j) || !anchorOk(nx, ny)) continue;
        reach.add(j); qq.push(j);
      }
    }
    for (const id of r.doorIds.slice(1)) {
      const as = doorAnchors(id);
      if (!as.length || !as.some((a) => reach.has(a))) errs.push(`room ${r.id} (${r.templateId}): no 2-tile corridor to door ${id}`);
    }
    if (r.kind !== 'core') {
      // the reward point must be reachable by a 2x2 body from the entrance
      const rx = Math.floor(r.rewardPoint.x / TILE), ry = Math.floor(r.rewardPoint.y / TILE);
      let ok = false;
      for (let dy = -1; dy <= 0 && !ok; dy++) for (let dx = -1; dx <= 0 && !ok; dx++) if (reach.has(idx(rx + dx, ry + dy))) ok = true;
      if (!ok) errs.push(`room ${r.id} (${r.templateId}): reward not reachable by a 2-tile body`);
    }
  }

  // ---- spawn points: >= 12 per combat room
  const special = SPECIAL_FLOORS.has(m.req.floorType);
  for (const r of m.rooms) {
    const combat = r.kind !== 'core' && COMBAT_KINDS.has(r.kind) && !special;
    if (combat && r.spawnPoints.length < 12) errs.push(`room ${r.id} (${r.kind} ${r.templateId}) has ${r.spawnPoints.length} spawn points`);
  }

  // ---- critical path bounds
  const crit = m.rooms.filter((r) => r.isCritical).length;
  const [lo, hi] = critBounds(m.req);
  if (crit < lo || crit > hi) errs.push(`critical path ${crit} outside ${lo}-${hi}`);

  // ---- hazard clusters at room entrances: at most one hazard within 3 tiles of a door, none on the apron
  for (const d of m.doors) {
    let n = 0;
    const dt = doorTiles(d);
    for (const p of m.props) {
      if (!p.hazard || p.wallMounted) continue;
      const [bx, by] = propBaseTile(p);
      const dd = Math.min(...dt.map(([x, y]) => Math.max(Math.abs(x - bx), Math.abs(y - by))));
      if (dd <= 3) n++;
      if (dd <= 1 && p.solid) errs.push(`hazard ${p.kind} on door ${d.id} apron`);
    }
    if (n >= 2) errs.push(`hazard cluster (${n}) at door ${d.id}`);
  }

  // ---- breaches (spec 4.7)
  const inBreach = new Map<number, number>();
  const breachTiles = new Set<number>();
  for (const b of m.breaches) {
    const A = m.rooms[b.roomA], B = m.rooms[b.roomB];
    if (!A || !B) { errs.push(`breach ${b.id} bad rooms`); continue; }
    if (b.roomA === m.coreRoomId || b.roomB === m.coreRoomId || A.kind === 'core' || B.kind === 'core') errs.push(`breach ${b.id} opens into the core`);
    if (A.neighbours.includes(b.roomB)) errs.push(`breach ${b.id} between door-connected rooms`);
    for (const r of [b.roomA, b.roomB]) inBreach.set(r, (inBreach.get(r) ?? 0) + 1);
    if (!b.tiles.length) errs.push(`breach ${b.id} empty`);
    for (const [x, y] of b.tiles) {
      const i = idx(x, y);
      breachTiles.add(i);
      if (!BREACHABLE.has(m.tiles[i]) && m.tiles[i] !== TC.RUBBLE) errs.push(`breach ${b.id} tile not breachable`);
      const ns = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].map(([nx, ny]) => m.roomOf[idx(nx, ny)]);
      if (!ns.includes(b.roomA) || !ns.includes(b.roomB)) errs.push(`breach ${b.id} tile ${x},${y} not between its rooms`);
      if (ns.some((r) => r === m.coreRoomId)) errs.push(`breach ${b.id} touches the core`);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (m.tiles[idx(nx, ny)] === TC.CORE_WALL) errs.push(`breach ${b.id} touches core walls`);
    }
  }
  for (const [r, n] of inBreach) if (n > 1) errs.push(`room ${r} in ${n} breaches (merge > 2 rooms)`);
  // no other breachable walls between rooms
  for (let i = 0; i < W * H; i++) {
    const t = m.tiles[i];
    if ((t === TC.PARTITION || t === TC.GLASS) && m.roomOf[i] < 0 && !breachTiles.has(i)) errs.push('breachable wall outside any breach segment');
    if (t === TC.CUBICLE && m.roomOf[i] < 0 && !breachTiles.has(i)) errs.push('cubicle wall on a room boundary outside a breach');
  }
  // breaching must not create softlocks: with every breach open, all rooms still reachable (trivially true) and
  // the rubble does not open into void
  for (const b of m.breaches) for (const [x, y] of b.tiles) {
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (m.tiles[idx(nx, ny)] === TC.VOID) errs.push(`breach ${b.id} opens to void`);
  }

  // ---- exits
  const normal = m.req.floorType !== 'lift_ambush';
  if (normal && m.req.floorType !== 'boss' && m.exits.length !== 3) errs.push(`expected 3 exits, got ${m.exits.length}`);
  if (!normal && (m.exits.length !== 1 || m.exits[0].kind !== 'lift')) errs.push('lift ambush must have only the lift exit');

  return [...new Set(errs)];
}
