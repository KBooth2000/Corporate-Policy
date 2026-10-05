// Shared floor-building helpers used by the generator and the arena builder. Pure TypeScript (no DOM).
import type { Act, PropKind } from '../../data/ids';
import type { FloorMap, LightDef, PropDef, RoomDef, SpawnPoint } from '../world-types';
import { T, TILE } from '../world-types';
import { PROP_INFO } from './props';

export const WALKABLE = new Set<number>([T.FLOOR, T.DOOR, T.RUBBLE, T.CORE_FLOOR, T.WATER]);
export const isWalkTile = (t: number) => WALKABLE.has(t);

/** Act light colours (kept here so the generator has no dependency on the DOM-side palette module). */
export const ACT_LIGHT: Record<Act, string> = { 1: '#f1f6e4', 2: '#e9f1ff', 3: '#dfe8ff', 4: '#ffe2b0' };
export const ACT_DARKNESS: Record<Act, number> = { 1: 0.12, 2: 0.2, 3: 0.3, 4: 0.24 };

/** Create a PropDef from a tile footprint (tx,ty = top-left tile; fw x fh tiles). */
export function makeProp(id: number, kind: PropKind, tx: number, ty: number, fw: number, fh: number, roomId: number,
  facing: 0 | 1 | 2 | 3, wall: boolean, variant: number): PropDef {
  const info = PROP_INFO[kind];
  const x = (tx + fw / 2) * TILE;
  if (wall) {
    return { id, kind, x, y: ty * TILE, w: fw * TILE, h: 4, solid: false, variant, roomId, facing: 0, wallMounted: true,
      ...(info.exec ? { exec: info.exec } : {}), ...(info.hazard ? { hazard: true } : {}) };
  }
  const rotated = fw !== info.fw && !info.stretchy;
  let w: number, h: number;
  if (info.cw !== undefined && info.ch !== undefined) { w = rotated ? info.ch : info.cw; h = rotated ? info.cw : info.ch; }
  else { w = fw * TILE - 2; h = fh * TILE - 2; }
  w = Math.min(w, fw * TILE); h = Math.min(h, fh * TILE);
  const y = (ty + fh) * TILE - (fh * TILE - h > 0 ? Math.floor((fh * TILE - h) / 2) : 0);
  const p: PropDef = { id, kind, x, y, w, h, solid: info.solid, variant, roomId, facing };
  if (info.exec) p.exec = info.exec;
  if (info.hazard) p.hazard = true;
  return p;
}

/** Tiles covered by a prop's collision rect. */
export function propTiles(p: PropDef): [number, number][] {
  const out: [number, number][] = [];
  const x0 = Math.floor((p.x - p.w / 2) / TILE), x1 = Math.floor((p.x + p.w / 2 - 0.01) / TILE);
  const y0 = Math.floor((p.y - p.h) / TILE), y1 = Math.floor((p.y - 0.01) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

/** The base tile of a prop (tile containing its base centre). */
export function propBaseTile(p: PropDef): [number, number] {
  return [Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)];
}

/** Tile-level walkability with solid props applied (1 = free). */
export function freeGrid(m: FloorMap): Uint8Array {
  const g = new Uint8Array(m.w * m.h);
  for (let i = 0; i < g.length; i++) g[i] = isWalkTile(m.tiles[i]) ? 1 : 0;
  for (const p of m.props) {
    if (!p.solid || p.wallMounted) continue;
    for (const [x, y] of propTiles(p)) if (x >= 0 && y >= 0 && x < m.w && y < m.h) g[y * m.w + x] = 0;
  }
  return g;
}

/** Door tiles of a door def. */
export function doorTiles(d: { tx: number; ty: number; orient: 'h' | 'v'; len: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < d.len; i++) out.push(d.orient === 'h' ? [d.tx + i, d.ty] : [d.tx, d.ty + i]);
  return out;
}

/** Door apron: door columns/rows `depth` tiles deep on both sides. */
export function doorApron(d: { tx: number; ty: number; orient: 'h' | 'v'; len: number }, depth = 2): [number, number][] {
  const out: [number, number][] = [];
  for (const [x, y] of doorTiles(d)) for (let k = 1; k <= depth; k++) {
    if (d.orient === 'h') { out.push([x, y - k]); out.push([x, y + k]); }
    else { out.push([x - k, y]); out.push([x + k, y]); }
  }
  return out;
}

/** BFS distances over free tiles from seeds (4-neighbour). -1 = unreachable. */
export function bfs(m: FloorMap, free: Uint8Array, seeds: [number, number][], limitRoom?: number, extra?: Set<number>): Int32Array {
  const dist = new Int32Array(m.w * m.h).fill(-1);
  const q = new Int32Array(m.w * m.h);
  let qh = 0, qt = 0;
  const ok = (i: number) => free[i] === 1 && (limitRoom === undefined || m.roomOf[i] === limitRoom || (extra?.has(i) ?? false));
  for (const [x, y] of seeds) {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
    const i = y * m.w + x;
    if (!ok(i) || dist[i] >= 0) continue;
    dist[i] = 0; q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % m.w, y = (i / m.w) | 0;
    const d = dist[i] + 1;
    if (x > 0 && dist[i - 1] < 0 && ok(i - 1)) { dist[i - 1] = d; q[qt++] = i - 1; }
    if (x < m.w - 1 && dist[i + 1] < 0 && ok(i + 1)) { dist[i + 1] = d; q[qt++] = i + 1; }
    if (y > 0 && dist[i - m.w] < 0 && ok(i - m.w)) { dist[i - m.w] = d; q[qt++] = i - m.w; }
    if (y < m.h - 1 && dist[i + m.w] < 0 && ok(i + m.w)) { dist[i + m.w] = d; q[qt++] = i + m.w; }
  }
  return dist;
}

/** Chebyshev distance from tile to the nearest door tile of a room. */
export function doorDistance(m: FloorMap, room: RoomDef, x: number, y: number): number {
  let best = 1e9;
  for (const id of room.doorIds) for (const [dx, dy] of doorTiles(m.doors[id])) best = Math.min(best, Math.max(Math.abs(dx - x), Math.abs(dy - y)));
  return best;
}

/**
 * Enemy spawn points (spec 5.5 / FloorMap contract): walkable, prop-free, reachable from the room's doors,
 * >= 3 tiles from every door, spread by farthest-point sampling. Template hints are preferred.
 */
export function computeSpawns(m: FloorMap, free: Uint8Array, room: RoomDef, hints: [number, number][], want = 16, globalReach?: Int32Array): SpawnPoint[] {
  const seeds: [number, number][] = [];
  const extra = new Set<number>();
  for (const id of room.doorIds) for (const [x, y] of doorTiles(m.doors[id])) { seeds.push([x, y]); extra.add(y * m.w + x); }
  if (!seeds.length) seeds.push([room.tx + (room.tw >> 1), room.ty + (room.th >> 1)]);
  const reach = globalReach ?? bfs(m, free, seeds, room.id, extra);
  const cand: [number, number][] = [];
  const dts: [number, number][] = [];
  for (const id of room.doorIds) for (const t of doorTiles(m.doors[id])) dts.push(t);
  const ddist = (x: number, y: number) => { let b = 1e9; for (const [dx, dy] of dts) { const d = Math.max(Math.abs(dx - x), Math.abs(dy - y)); if (d < b) b = d; } return b; };
  const good = (x: number, y: number, need: number) => {
    const i = y * m.w + x;
    if (m.roomOf[i] !== room.id || reach[i] < 0) return false;
    if (dts.length && ddist(x, y) < 3) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = (y + dy) * m.w + (x + dx);
      if (free[j] === 1) n++;
    }
    return n >= need;
  };
  for (const need of [8, 6, 4]) {
    for (let y = room.ty; y < room.ty + room.th; y++) for (let x = room.tx; x < room.tx + room.tw; x++) if (good(x, y, need)) cand.push([x, y]);
    if (cand.length >= 12) break;
    cand.length = 0;
  }
  if (!cand.length) for (let y = room.ty; y < room.ty + room.th; y++) for (let x = room.tx; x < room.tx + room.tw; x++) if (good(x, y, 1)) cand.push([x, y]);
  const chosen: [number, number][] = [];
  const candSet = new Set(cand.map(([x, y]) => y * m.w + x));
  for (const [hx, hy] of hints) if (candSet.has(hy * m.w + hx) && chosen.length < want) chosen.push([hx, hy]);
  const minD = new Float64Array(cand.length).fill(1e9);
  const upd = (c: [number, number]) => { for (let i = 0; i < cand.length; i++) minD[i] = Math.min(minD[i], (cand[i][0] - c[0]) ** 2 + (cand[i][1] - c[1]) ** 2); };
  for (const c of chosen) upd(c);
  if (!chosen.length && cand.length) {
    // start from the candidate farthest from the doors
    let bi = 0, bd = -1;
    for (let i = 0; i < cand.length; i++) { const d = ddist(cand[i][0], cand[i][1]); if (d > bd) { bd = d; bi = i; } }
    chosen.push(cand[bi]); upd(cand[bi]);
  }
  while (chosen.length < Math.min(want, cand.length)) {
    let bi = -1, bd = 0;
    for (let i = 0; i < cand.length; i++) if (minD[i] > bd) { bd = minD[i]; bi = i; }
    if (bi < 0 || bd === 0) break;
    chosen.push(cand[bi]); upd(cand[bi]);
  }
  return chosen.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }));
}

/** 2x2-body anchors (top-left tiles) reachable from the room's first door, within the room and its door tiles. */
export function bodyReach(m: FloorMap, free: Uint8Array, room: RoomDef): Set<number> {
  const W = m.w;
  const doorSet = new Set<number>();
  for (const id of room.doorIds) for (const [x, y] of doorTiles(m.doors[id])) doorSet.add(y * W + x);
  const region = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && free[y * W + x] === 1 && (m.roomOf[y * W + x] === room.id || doorSet.has(y * W + x));
  const anchorOk = (x: number, y: number) => region(x, y) && region(x + 1, y) && region(x, y + 1) && region(x + 1, y + 1);
  const seeds: number[] = [];
  if (room.doorIds.length) {
    for (const [x, y] of doorTiles(m.doors[room.doorIds[0]])) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const ax = x + dx, ay = y + dy;
      if (!anchorOk(ax, ay)) continue;
      let inRoom = false;
      for (const [tx, ty] of [[ax, ay], [ax + 1, ay], [ax, ay + 1], [ax + 1, ay + 1]]) if (m.roomOf[ty * W + tx] === room.id) inRoom = true;
      if (inRoom) seeds.push(ay * W + ax);
    }
  } else {
    for (let y = room.ty; y < room.ty + room.th - 1 && !seeds.length; y++) for (let x = room.tx; x < room.tx + room.tw - 1; x++) if (anchorOk(x, y)) { seeds.push(y * W + x); break; }
  }
  const reach = new Set<number>(seeds);
  const st = [...seeds];
  while (st.length) {
    const i = st.pop()!;
    const x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const j = ny * W + nx;
      if (!reach.has(j) && anchorOk(nx, ny)) { reach.add(j); st.push(j); }
    }
  }
  return reach;
}

/** Reward drop point: free tile with clear neighbourhood closest to the hint / room centre, reachable. */
export function computeReward(m: FloorMap, free: Uint8Array, room: RoomDef, hint: [number, number] | null, globalReach?: Int32Array): { x: number; y: number } {
  const seeds: [number, number][] = [];
  const extra = new Set<number>();
  for (const id of room.doorIds) for (const [x, y] of doorTiles(m.doors[id])) { seeds.push([x, y]); extra.add(y * m.w + x); }
  const cx = hint ? hint[0] : room.tx + (room.tw - 1) / 2, cy = hint ? hint[1] : room.ty + (room.th - 1) / 2;
  if (!seeds.length) seeds.push([Math.round(cx), Math.round(cy)]);
  const reach = globalReach ?? bfs(m, free, seeds, room.id, extra);
  const body = bodyReach(m, free, room);
  const bodyOk = (x: number, y: number) => body.has(y * m.w + x) || body.has(y * m.w + x - 1) || body.has((y - 1) * m.w + x) || body.has((y - 1) * m.w + x - 1);
  let best: [number, number] | null = null, bd = 1e9;
  for (const need of [9, 6, 1]) {
    for (let y = room.ty; y < room.ty + room.th; y++) for (let x = room.tx; x < room.tx + room.tw; x++) {
      const i = y * m.w + x;
      if (m.roomOf[i] !== room.id || reach[i] < 0 || !bodyOk(x, y)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (free[(y + dy) * m.w + x + dx] === 1) n++;
      if (n < need) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) break;
  }
  if (!best) best = [Math.round(cx), Math.round(cy)];
  return { x: (best[0] + 0.5) * TILE, y: (best[1] + 0.5) * TILE };
}

/** Fluorescent panel grid for a room. */
export function panelLights(room: RoomDef, color: string, flickerEvery: number, seedBits: number, intensity = 0.85): LightDef[] {
  const nx = Math.max(1, Math.round(room.tw / 7)), ny = Math.max(1, Math.round(room.th / 7));
  const out: LightDef[] = [];
  let k = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (room.tx + (room.tw * (i + 0.5)) / nx) * TILE, y = (room.ty + (room.th * (j + 0.5)) / ny) * TILE;
    const flick = flickerEvery > 0 && ((seedBits >> (k % 24)) & 1) === 1 && k % flickerEvery === 0;
    out.push({ x: Math.round(x), y: Math.round(y), radius: Math.round(Math.max(room.tw / nx, room.th / ny) * TILE * 0.75 + 24), color, intensity, flicker: flick ? 'fluorescent' : 'none' });
    k++;
  }
  return out;
}
