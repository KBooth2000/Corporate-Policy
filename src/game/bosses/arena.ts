// Boss arena builder: hand-authored ASCII layouts → a valid FloorMap (world-types contract). Boss floors replace
// procedural generation (registry BOSS_FLOORS.buildMap). No buildArenaFromAscii exists in src/game/gen, so the boss
// team owns this one.
//
// Glyphs: ' ' void · '#' wall · 'X' core wall · 'W' window · 'S' sealed curtain-wall window · 'P' partition ·
// 'G' glass partition · 'D' door · 'O' pit (open edge) · '~' static water · '.' floor · ',' core floor ·
// '@' player arrival (core floor) · 'E' exit slot (core floor, filled left→right with req.exits) ·
// lowercase letters: floor tiles recorded as named marks (room anchors, set-piece positions).
import type { FloorMap, FloorRequest, PropDef, RoomDef, RoomKind, LightDef, DoorDef } from '../world-types';
import { T, TILE } from '../world-types';
import type { PropKind, ExecType } from '../../data/ids';
import { PROP_INFO } from '../gen/props';
import { MAT } from '../gen/materials';
import type { Vec } from '../../core/math';

export interface ArenaProp {
  kind: PropKind | string;
  tx: number; ty: number;
  fw?: number; fh?: number;
  /** Collision box in px (defaults: PROP_INFO or the footprint). */
  cw?: number; ch?: number;
  solid?: boolean; wall?: boolean; hazard?: boolean; exec?: ExecType;
  facing?: 0 | 1 | 2 | 3; variant?: number;
}

export interface ArenaRoomSpec {
  kind: RoomKind;
  material?: number;
  darkness?: number;
  lights?: LightDef[];
  sprinklers?: boolean;
}

export interface ArenaSpec {
  rows: string[];
  /** Marker letters whose regions become rooms 1, 2, 3… in this order (room 0 is the core). */
  roomMarks: string[];
  rooms: ArenaRoomSpec[]; // index = room id (0 = core)
  props?: ArenaProp[];
  decor?: FloorMap['decor'];
}

export interface ArenaMap extends FloorMap {
  /** Named marks (px centres of the marked tiles). */
  marks: Record<string, Vec[]>;
}

const WALKABLE = new Set<number>([T.FLOOR, T.CORE_FLOOR, T.WATER, T.RUBBLE]);

export function buildArena(req: FloorRequest, spec: ArenaSpec): ArenaMap {
  const rows = spec.rows;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(w * h).fill(T.VOID);
  const roomOf = new Int16Array(w * h).fill(-1);
  const material = new Uint8Array(w * h);
  const marks: Record<string, Vec[]> = {};
  const exitSlots: [number, number][] = [];
  let spawn: Vec = { x: 0, y: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] ?? ' ';
    let t: number = T.VOID;
    switch (ch) {
      case '#': t = T.WALL; break;
      case 'X': t = T.CORE_WALL; break;
      case 'W': t = T.WINDOW; break;
      case 'S': t = T.WINDOW_SEALED; break;
      case 'P': t = T.PARTITION; break;
      case 'G': t = T.GLASS; break;
      case 'D': t = T.DOOR; break;
      case 'O': t = T.PIT; break;
      case '~': t = T.WATER; break;
      case ',': t = T.CORE_FLOOR; break;
      case '@': t = T.CORE_FLOOR; spawn = { x: (x + 0.5) * TILE, y: (y + 0.8) * TILE }; break;
      case 'E': t = T.CORE_FLOOR; exitSlots.push([x, y]); break;
      case ' ': t = T.VOID; break;
      default:
        if (ch === '.' || /[a-z]/.test(ch)) t = T.FLOOR;
        if (/[a-z]/.test(ch)) (marks[ch] ??= []).push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
    }
    tiles[y * w + x] = t;
  }

  // ---- flood-fill rooms
  const regionOf = new Int16Array(w * h).fill(-1);
  const regions: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (regionOf[i] >= 0 || !WALKABLE.has(tiles[i])) continue;
    const id = regions.length;
    const list: number[] = [];
    const q = [i];
    regionOf[i] = id;
    while (q.length) {
      const c = q.pop()!;
      list.push(c);
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (regionOf[n] >= 0 || !WALKABLE.has(tiles[n])) continue;
        regionOf[n] = id; q.push(n);
      }
    }
    regions.push(list);
  }
  // order: core (has core floor) → marked rooms → the rest
  const order: number[] = [];
  const coreR = regions.findIndex((l) => l.some((i) => tiles[i] === T.CORE_FLOOR));
  if (coreR >= 0) order.push(coreR);
  for (const m of spec.roomMarks) {
    const p = marks[m]?.[0];
    if (!p) continue;
    const r = regionOf[Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE)];
    if (r >= 0 && !order.includes(r)) order.push(r);
  }
  regions.forEach((_, i) => { if (!order.includes(i)) order.push(i); });

  // tiles under solid props (spawn/reward points must stay clear of furniture — gen/validate.ts)
  const blocked = new Uint8Array(w * h);
  for (const p of spec.props ?? []) {
    const info = (PROP_INFO as Record<string, (typeof PROP_INFO)[PropKind] | undefined>)[p.kind];
    if (!(p.solid ?? info?.solid ?? true) || (p.wall ?? info?.wall)) continue;
    const fw = p.fw ?? info?.fw ?? 1, fh = p.fh ?? info?.fh ?? 1;
    for (let y = p.ty; y < p.ty + fh; y++) for (let x = p.tx; x < p.tx + fw; x++) if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1;
  }
  const rooms: RoomDef[] = [];
  order.forEach((ri, id) => {
    const list = regions[ri];
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of list) { roomOf[i] = id; const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const rs = spec.rooms[id] ?? { kind: 'boss' as RoomKind };
    const mat = rs.material ?? (id === 0 ? MAT.CORE : MAT.CARPET);
    for (const i of list) material[i] = tiles[i] === T.CORE_FLOOR ? MAT.CORE : mat;
    // spawn points: tiles at least 2 away from any non-walkable tile
    const sp: Vec[] = [];
    for (const i of list) {
      const x = i % w, y = (i / w) | 0;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) { const n = (y + dy) * w + (x + dx); if (!WALKABLE.has(tiles[n] ?? 0) || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && blocked[n])) ok = false; }
      if (ok && (x + y) % 3 === 0) sp.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
    }
    let hasWindows = false;
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) { const t = tiles[y * w + x]; if (t === T.WINDOW || t === T.WINDOW_SEALED) hasWindows = true; }
    rooms.push({
      id, kind: id === 0 ? 'core' : rs.kind, templateId: 'boss_arena', tx: x0, ty: y0, tw: x1 - x0 + 1, th: y1 - y0 + 1,
      isCritical: id === 1, isSide: false, neighbours: [], doorIds: [], spawnPoints: sp.slice(0, 40),
      rewardPoint: nearest(sp, { x: ((x0 + x1 + 1) / 2) * TILE, y: ((y0 + y1 + 1) / 2) * TILE }), sizeWeight: 1,
      lights: rs.lights ?? [], darkness: rs.darkness ?? 0, hasWindows, sprinklers: !!rs.sprinklers,
    });
  });

  // ---- doors (contiguous runs of 'D')
  const doors: DoorDef[] = [];
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (tiles[i] !== T.DOOR || seen[i]) continue;
    const horiz = tiles[i + 1] === T.DOOR || (WALKABLE.has(tiles[i - w]) && WALKABLE.has(tiles[i + w]));
    let len = 0;
    while (true) {
      const xx = horiz ? x + len : x, yy = horiz ? y : y + len;
      const j = yy * w + xx;
      if (xx >= w || yy >= h || tiles[j] !== T.DOOR) break;
      seen[j] = 1; len++;
    }
    const a = horiz ? roomOf[i - w] : roomOf[i - 1];
    const lastI = horiz ? i + (len - 1) : i + (len - 1) * w;
    const bb = horiz ? roomOf[i + w] : roomOf[lastI + 1 - (len - 1) * w + (len - 1) * w];
    const id = doors.length;
    // door ROOM ids: look either side of the first tile
    const ra = a, rb = horiz ? roomOf[i + w] : roomOf[i + 1];
    void bb;
    if (ra < 0 || rb < 0) console.warn(`[boss arena] door at ${x},${y} does not join two rooms (${ra}/${rb})`);
    doors.push({ id, tx: x, ty: y, orient: horiz ? 'h' : 'v', len, roomA: ra, roomB: rb });
    if (ra >= 0 && rb >= 0) {
      rooms[ra].neighbours.push(rb); rooms[rb].neighbours.push(ra);
      rooms[ra].doorIds.push(id); rooms[rb].doorIds.push(id);
    }
  }

  // ---- props
  const props: PropDef[] = [];
  for (const p of spec.props ?? []) {
    const info = (PROP_INFO as Record<string, (typeof PROP_INFO)[PropKind] | undefined>)[p.kind];
    const fw = p.fw ?? info?.fw ?? 1, fh = p.fh ?? info?.fh ?? 1;
    const cw = p.cw ?? info?.cw ?? fw * TILE, chh = p.ch ?? info?.ch ?? fh * TILE;
    const px = (p.tx + fw / 2) * TILE, py = (p.ty + fh) * TILE;
    props.push({
      id: props.length, kind: p.kind as PropKind, x: px, y: py, w: cw, h: chh, solid: p.solid ?? info?.solid ?? true,
      variant: p.variant ?? 0, roomId: roomOf[Math.min(h - 1, p.ty) * w + p.tx] ?? -1, facing: p.facing ?? 0,
      exec: p.exec ?? info?.exec, hazard: p.hazard ?? info?.hazard, wallMounted: p.wall ?? info?.wall,
    });
  }

  // ---- exits (core north wall slots)
  exitSlots.sort((a, b) => a[0] - b[0]);
  const exits = req.exits.map((k, i) => {
    const s = exitSlots[Math.min(i, exitSlots.length - 1)] ?? [2, 2];
    return { kind: k, x: (s[0] + 0.5) * TILE, y: (s[1] + 0.9) * TILE, available: true };
  });

  return {
    req, w, h, tiles, roomOf, rooms, doors, breaches: [], props, exits, coreRoomId: 0, spawn, attempts: 1, material,
    decor: spec.decor ?? [], marks,
  };
}

function nearest(pts: Vec[], c: Vec): Vec {
  let best = c, bd = Infinity;
  for (const p of pts) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = p; } }
  return { ...best };
}

/** Room id of the region containing a mark. */
export function roomOfMark(m: ArenaMap, mark: string): number {
  const p = m.marks[mark]?.[0];
  if (!p) return -1;
  return m.roomOf[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
}

export function mark(m: ArenaMap, k: string, i = 0): Vec {
  const p = m.marks[k]?.[i] ?? m.marks[k]?.[0];
  return p ? { ...p } : { x: m.w * TILE / 2, y: m.h * TILE / 2 };
}

/** Character grid for composing arena layouts in code. */
export class Grid {
  c: string[][];
  constructor(public w: number, public h: number, fill = ' ') { this.c = Array.from({ length: h }, () => Array(w).fill(fill)); }
  set(x: number, y: number, ch: string): this { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y][x] = ch; return this; }
  get(x: number, y: number): string { return this.c[y]?.[x] ?? ' '; }
  fill(x0: number, y0: number, x1: number, y1: number, ch: string): this { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch); return this; }
  /** Walled room: outline in `wall`, interior in `floor` (inclusive outer bounds). */
  room(x0: number, y0: number, x1: number, y1: number, wall = '#', floor = '.'): this {
    this.fill(x0, y0, x1, y1, wall);
    return this.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor);
  }
  rows(): string[] { return this.c.map((r) => r.join('')); }
}

/**
 * Doorway from the lift lobby (core, east wall at x=12) into an arena whose west wall is x=13: the two walls are
 * back to back, so the lobby wall is opened up as core floor and the arena wall carries the door (rows y0..y1).
 */
export function lobbyDoor(g: Grid, y0: number, y1: number): void {
  g.fill(12, y0, 12, y1, ',');
  g.fill(13, y0, 13, y1, 'D');
}

/** Standard boss-floor lift lobby (core) with exit slots on its north wall. Interior x0+1..x0+11, y0+2..y0+11. */
export function coreLobby(g: Grid, x0: number, y0: number): void {
  g.fill(x0, y0, x0 + 12, y0 + 12, 'X');
  g.fill(x0 + 1, y0 + 2, x0 + 11, y0 + 11, ',');
  g.set(x0 + 3, y0 + 2, 'E'); g.set(x0 + 6, y0 + 2, 'E'); g.set(x0 + 9, y0 + 2, 'E');
  g.set(x0 + 6, y0 + 8, '@');
}
