// PROCEDURAL FLOOR GENERATOR CONTRACT (spec 4.4). generateFloor() is pure & deterministic for a given
// FloorRequest. No DOM: it also runs in Node for the soak test (tools/soak.ts).
//
// Pipeline (spec 4.4):
//  1. Seed from run seed + floor (+ wing/type); attempt n uses seed + n ("regenerate with seed + 1").
//  2. Theme is given by the request (run logic picks it with no repeats per act).
//  3. Room graph on a macro grid: hand-built core + critical path (4-7) + 0-2 side rooms.
//  4. Templates that match each room's door sockets (all orientations of the authored library).
//  5. Department skin: slot fills, prop variants, decals, Act 4 cult dressing, Hot Desking.
//  6. Hazards from template slots; exterior windows; breach segments (4.7).
//  7. (enemy budget is spent by gameplay using RoomDef.sizeWeight / spawnPoints)
//  8. Reward points per room; exits in the core.
//  9. validateFloor(); on failure regenerate with seed + 1.
import type { ExitKind, PropKind, ThemeId } from '../../data/ids';
import { Rng } from '../../core/rng';
import type { BreachDef, DoorDef, ExitDef, FloorMap, FloorRequest, LightDef, PropDef, RoomDef, RoomKind } from '../world-types';
import { T, TILE } from '../world-types';
import { ACT_DARKNESS, ACT_LIGHT, bfs, computeReward, computeSpawns, doorApron, doorTiles, freeGrid, isWalkTile, makeProp, panelLights, propBaseTile, propTiles } from './build';
import { CORE_CH, CORE_CW, CORE_EXITS, CORE_H, CORE_PROPS, CORE_ROWS, CORE_SOCKETS, CORE_W, coreKeepClear, coreTile } from './core';
import { shapesFor, templatesFor } from './library';
import { MAT } from './materials';
import { PROP_INFO } from './props';
import { CELL, Tpl, BreachMat, socketsFit } from './template';
import { COMBAT_KINDS, KIND_HAZARD, KIND_MAT, THEME_GEN } from './themes';
import { validateFloor } from './validate';
import { critBounds, SPECIAL_FLOORS } from './rules';
import { buildBossArena, buildLiftAmbush } from './arena';

export { validateFloor } from './validate';
export { buildArenaFromAscii } from './arena';

const GW = 13, GH = 11; // macro grid (cells)
const MARGIN = 4;       // void tiles around the building (exterior view)
const MAX_ATTEMPTS = 64;

export interface GenStats { attempts: number; lastErrors: string[] }
let lastStats: GenStats = { attempts: 0, lastErrors: [] };
/** Diagnostics of the most recent generateFloor() call (soak test). */
export function lastGenStats(): GenStats { return lastStats; }

export function generateFloor(req: FloorRequest): FloorMap {
  if (req.floorType === 'boss') return finish(buildBossArena(req), 1, []);
  if (req.floorType === 'lift_ambush') return finish(buildLiftAmbush(req), 1, []);
  let lastErrors: string[] = [];
  let fallback: FloorMap | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = Rng.from(req.runSeed + attempt, req.floorNumber, req.wing, req.floorType, req.theme, 'layout');
    const map = tryGenerate(req, rng);
    if (typeof map === 'string') { lastErrors = [map]; continue; }
    const errs = validateFloor(map);
    if (!errs.length) return finish(map, attempt + 1, lastErrors);
    lastErrors = errs;
    fallback = map;
  }
  // Should never happen (the soak test gates this); fall back to the hand-made safe floor.
  const safe = buildBossArena({ ...req, floorType: 'standard' });
  return finish(fallback && !validateFloor(fallback).length ? fallback : safe, MAX_ATTEMPTS + 1, lastErrors);
}

function finish(m: FloorMap, attempts: number, errs: string[]): FloorMap {
  m.attempts = attempts;
  lastStats = { attempts, lastErrors: errs };
  return m;
}

// =============================================================================================
// 3. Room graph on the macro grid

interface PRoom {
  id: number; kind: RoomKind; cx: number; cy: number; cw: number; ch: number;
  parent: number; critical: boolean; side: boolean; elite: boolean;
  req: Set<string>; tpl: Tpl | null;
}
interface PDoor { a: number; b: number; orient: 'h' | 'v'; gx: number; gy: number; len: number }
type Side = 'N' | 'E' | 'S' | 'W';


const CAPS: Partial<Record<RoomKind, number>> = { toilets: 1, kitchen: 1, reception: 1, corridor: 1, server: 2, manager: 1, print: 1, meeting: 2, archive: 2 };
const BIG_KINDS: RoomKind[] = ['openplan', 'cubicles', 'reception', 'archive', 'meeting', 'server'];

function pickKinds(req: FloorRequest, rng: Rng, n: number): RoomKind[] {
  const tg = THEME_GEN[req.theme] ?? THEME_GEN.reception;
  const used: Partial<Record<RoomKind, number>> = {};
  const out: RoomKind[] = [];
  const special = req.floorType === 'shop' ? 'shop' : req.floorType === 'treasure' ? 'treasure' : req.floorType === 'event' ? 'event' : null;
  if (special) {
    for (let i = 0; i < n - 1; i++) out.push('corridor');
    out.push(special);
    return out;
  }
  const last = req.floorType === 'elite' ? 'manager' : req.floorType === 'director' ? 'director' : null;
  if (last) used[last === 'director' ? 'manager' : last] = 99; // no plain manager's office before the elite/director arena
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && last) { out.push(last); break; }
    const isLast = i === n - 1;
    const kinds = (Object.keys(tg.kinds) as RoomKind[]).filter((k) => {
      if ((used[k] ?? 0) >= (CAPS[k] ?? 9)) return false;
      if (out.length && out[out.length - 1] === k) return false;
      if (isLast && !BIG_KINDS.includes(k)) return false;
      if (i === 0 && (k === 'toilets')) return false;
      return shapesFor(k, req.theme).length > 0;
    });
    const k = kinds.length ? rng.weighted(kinds, (x) => tg.kinds[x] ?? 0) : 'openplan';
    used[k] = (used[k] ?? 0) + 1;
    out.push(k);
  }
  return out;
}

function sidesOf(r: PRoom): Side[] { return r.kind === 'core' ? ['W', 'E', 'S'] : ['N', 'E', 'S', 'W']; }

function planLayout(req: FloorRequest, rng: Rng): { rooms: PRoom[]; doors: PDoor[] } | null {
  const grid = new Int16Array(GW * GH).fill(-1);
  const rooms: PRoom[] = [];
  const doors: PDoor[] = [];
  const free = (cx: number, cy: number, cw: number, ch: number) => {
    if (cx < 0 || cy < 0 || cx + cw > GW || cy + ch > GH) return false;
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) if (grid[y * GW + x] >= 0) return false;
    return true;
  };
  const occupy = (r: PRoom) => { for (let y = r.cy; y < r.cy + r.ch; y++) for (let x = r.cx; x < r.cx + r.cw; x++) grid[y * GW + x] = r.id; };
  const core: PRoom = { id: 0, kind: 'core', cx: rng.int(4, GW - 4 - CORE_CW), cy: rng.int(1, 4), cw: CORE_CW, ch: CORE_CH, parent: -1, critical: false, side: false, elite: false, req: new Set(), tpl: null };
  rooms.push(core); occupy(core);
  const ccx = core.cx + core.cw / 2, ccy = core.cy + core.ch / 2;

  const attach = (parent: PRoom, kind: RoomKind, shapes: [number, number][], awayBias: number, preferBig: boolean): PRoom | null => {
    type Cand = { cx: number; cy: number; cw: number; ch: number; side: Side; lo: number; hi: number; score: number };
    const cands: Cand[] = [];
    for (const [cw, ch] of shapes) {
      for (const side of sidesOf(parent)) {
        if (side === 'N' || side === 'S') {
          const ny = side === 'N' ? parent.cy - ch : parent.cy + parent.ch;
          for (let nx = parent.cx - cw + 1; nx <= parent.cx + parent.cw - 1; nx++) {
            if (!free(nx, ny, cw, ch)) continue;
            const lo = Math.max(nx, parent.cx), hi = Math.min(nx + cw, parent.cx + parent.cw) - 1;
            cands.push({ cx: nx, cy: ny, cw, ch, side, lo, hi, score: 0 });
          }
        } else {
          const nx = side === 'W' ? parent.cx - cw : parent.cx + parent.cw;
          for (let ny = parent.cy - ch + 1; ny <= parent.cy + parent.ch - 1; ny++) {
            if (!free(nx, ny, cw, ch)) continue;
            const lo = Math.max(ny, parent.cy), hi = Math.min(ny + ch, parent.cy + parent.ch) - 1;
            cands.push({ cx: nx, cy: ny, cw, ch, side, lo, hi, score: 0 });
          }
        }
      }
    }
    // a template must exist for both rooms with these sockets (spec 4.3: placed only where sockets match)
    const feasible = (c: Cand, cell: number): boolean => {
      let ps: string, rs: string;
      if (c.side === 'N' || c.side === 'S') { ps = c.side + (cell - parent.cx); rs = (c.side === 'N' ? 'S' : 'N') + (cell - c.cx); }
      else { ps = c.side + (cell - parent.cy); rs = (c.side === 'W' ? 'E' : 'W') + (cell - c.cy); }
      const preq = new Set(parent.req); preq.add(ps);
      if (parent.kind === 'core') { if (![...preq].every((x) => CORE_SOCKETS.includes(x))) return false; }
      else if (!templatesFor(parent.kind, parent.cw, parent.ch, req.theme).some((t) => socketsFit(t, preq))) return false;
      return templatesFor(kind, c.cw, c.ch, req.theme).some((t) => socketsFit(t, [rs]));
    };
    const ok: (Cand & { cells: number[] })[] = [];
    for (const c of cands) {
      const cells: number[] = [];
      for (let cell = c.lo; cell <= c.hi; cell++) if (feasible(c, cell)) cells.push(cell);
      if (cells.length) ok.push({ ...c, cells });
    }
    cands.length = 0;
    if (!ok.length) return null;
    for (const c of ok) {
      const d = Math.abs(c.cx + c.cw / 2 - ccx) + Math.abs(c.cy + c.ch / 2 - ccy);
      // count free neighbouring cells (room to keep growing)
      let room = 0;
      for (let y = c.cy - 1; y <= c.cy + c.ch; y++) for (let x = c.cx - 1; x <= c.cx + c.cw; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if ((x < c.cx || x >= c.cx + c.cw || y < c.cy || y >= c.cy + c.ch) && grid[y * GW + x] < 0) room++;
      }
      c.score = d * awayBias + room * 0.35 + (preferBig ? c.cw * c.ch * 0.8 : 0) + rng.next() * 3;
    }
    ok.sort((a, b) => b.score - a.score);
    const c = ok[Math.min(ok.length - 1, rng.int(0, Math.min(2, ok.length - 1)))];
    const r: PRoom = { id: rooms.length, kind, cx: c.cx, cy: c.cy, cw: c.cw, ch: c.ch, parent: parent.id, critical: false, side: false, elite: false, req: new Set(), tpl: null };
    // door on a cell of the shared edge
    const cell = rng.pick(c.cells);
    let d: PDoor;
    if (c.side === 'N' || c.side === 'S') {
      const gy = c.side === 'N' ? parent.cy * CELL : (parent.cy + parent.ch) * CELL;
      d = { a: parent.id, b: r.id, orient: 'h', gx: cell * CELL + 3, gy, len: 3 };
      parent.req.add(c.side + (cell - parent.cx));
      r.req.add((c.side === 'N' ? 'S' : 'N') + (cell - r.cx));
    } else {
      const gx = c.side === 'W' ? parent.cx * CELL : (parent.cx + parent.cw) * CELL;
      d = { a: parent.id, b: r.id, orient: 'v', gx, gy: cell * CELL + 3, len: 3 };
      parent.req.add(c.side + (cell - parent.cy));
      r.req.add((c.side === 'W' ? 'E' : 'W') + (cell - r.cy));
    }
    rooms.push(r); occupy(r); doors.push(d);
    return r;
  };

  const [lo, hi] = critBounds(req);
  const n = rng.int(lo, hi);
  const kinds = pickKinds(req, rng, n);
  let prev = core;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    let shapes = shapesFor(kind, req.theme);
    if (kind === 'manager' && req.floorType === 'elite' && i === kinds.length - 1) {
      const big = shapes.filter(([w, h]) => w * h >= 4);
      if (big.length) shapes = big;
    }
    if (i === kinds.length - 1 && !SPECIAL_FLOORS.has(req.floorType)) {
      const big = shapes.filter(([w, h]) => w * h >= 4);
      if (big.length) shapes = big;
    }
    rng.shuffle(shapes);
    const r = attach(prev, kind, shapes, 1.2, false);
    if (!r) return null;
    r.critical = true;
    if (kind === 'manager' && req.floorType === 'elite' && i === kinds.length - 1) r.elite = true;
    if (kind === 'director') r.elite = true;
    prev = r;
  }
  // optional side rooms (loot)
  if (!SPECIAL_FLOORS.has(req.floorType)) {
    const nSide = rng.int(0, 2);
    const sidePool: RoomKind[] = ['kitchen', 'toilets', 'archive', 'print', 'meeting', 'server', 'manager'];
    const usedKinds = new Set(rooms.map((r) => r.kind));
    for (let s = 0; s < nSide; s++) {
      const opts = sidePool.filter((k) => !usedKinds.has(k) && shapesFor(k, req.theme).length > 0 && (THEME_GEN[req.theme]?.kinds[k] ?? 0) > 0);
      if (!opts.length) break;
      const kind = rng.pick(opts);
      const parents = rooms.filter((r) => r.critical && r.kind !== 'director' && !r.elite);
      rng.shuffle(parents);
      let placed: PRoom | null = null;
      for (const p of parents) {
        const shapes = shapesFor(kind, req.theme).filter(([w, h]) => w * h <= 4);
        if (!shapes.length) break;
        placed = attach(p, kind, rng.shuffle(shapes), 0.4, false);
        if (placed) break;
      }
      if (placed) { placed.side = true; usedKinds.add(kind); }
    }
  }
  return { rooms, doors };
}

// =============================================================================================
// 4. Template selection

const FALLBACK_KINDS: RoomKind[] = ['openplan', 'cubicles', 'meeting', 'archive', 'corridor', 'kitchen', 'print', 'toilets', 'server', 'manager', 'reception'];

function chooseTemplates(req: FloorRequest, rooms: PRoom[], rng: Rng): string | null {
  const usedBase = new Set<string>();
  for (const r of rooms) {
    if (r.kind === 'core') continue;
    const fits = (k: RoomKind) => templatesFor(k, r.cw, r.ch, req.theme).filter((t) => socketsFit(t, r.req));
    let cands = fits(r.kind);
    if (!cands.length && !['shop', 'treasure', 'event', 'director'].includes(r.kind) && !r.elite) {
      for (const k of FALLBACK_KINDS) { cands = fits(k); if (cands.length) { r.kind = k; break; } }
    }
    if (!cands.length) return `${r.kind} ${r.cw}x${r.ch} ${[...r.req].join(',')}`;
    const fresh = cands.filter((t) => !usedBase.has(t.baseId));
    const pool = fresh.length ? fresh : cands;
    const t = rng.weighted(pool, (x) => (x.themes ? 3 : 1) * x.weight);
    r.tpl = t; usedBase.add(t.baseId);
  }
  return null;
}

// =============================================================================================
// 5/6. Build the FloorMap

function tryGenerate(req: FloorRequest, rng: Rng): FloorMap | string {
  const plan = planLayout(req, rng);
  if (!plan) return 'layout: no placement';
  const { rooms: prs, doors: pds } = plan;
  const miss = chooseTemplates(req, prs, rng);
  if (miss) return 'templates: none fit ' + miss;
  const tg = THEME_GEN[req.theme] ?? THEME_GEN.reception;
  const act = req.act;

  // bounds
  let minCx = 1e9, minCy = 1e9, maxCx = -1e9, maxCy = -1e9;
  for (const r of prs) { minCx = Math.min(minCx, r.cx); minCy = Math.min(minCy, r.cy); maxCx = Math.max(maxCx, r.cx + r.cw); maxCy = Math.max(maxCy, r.cy + r.ch); }
  const w = (maxCx - minCx) * CELL + 1 + MARGIN * 2, h = (maxCy - minCy) * CELL + 1 + MARGIN * 2;
  const ox = MARGIN - minCx * CELL, oy = MARGIN - minCy * CELL;
  const tiles = new Uint8Array(w * h).fill(T.VOID);
  const roomOf = new Int16Array(w * h).fill(-1);
  const material = new Uint8Array(w * h).fill(MAT.CARPET);
  const m: FloorMap = {
    req, w, h, tiles, roomOf, rooms: [], doors: [], breaches: [], props: [], exits: [], coreRoomId: 0,
    spawn: { x: 0, y: 0 }, attempts: 1, material, decor: [],
  };
  const idx = (x: number, y: number) => y * w + x;
  const mirrorCore = rng.chance(0.5);
  const cosmetic = rng.fork('skin');

  // ---- rooms: walls + interiors
  const roomDefs: RoomDef[] = [];
  for (const r of prs) {
    const X0 = r.cx * CELL + ox, Y0 = r.cy * CELL + oy, X1 = X0 + r.cw * CELL, Y1 = Y0 + r.ch * CELL;
    const isCore = r.kind === 'core';
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const edge = x === X0 || x === X1 || y === Y0 || y === Y1;
      const i = idx(x, y);
      if (edge) { if (isCore) tiles[i] = T.CORE_WALL; else if (tiles[i] !== T.CORE_WALL) tiles[i] = T.WALL; continue; }
      const lx = x - X0 - 1, ly = y - Y0 - 1;
      roomOf[i] = r.id;
      if (isCore) {
        const chr = CORE_ROWS[ly][mirrorCore ? CORE_W - 1 - lx : lx];
        tiles[i] = coreTile(chr);
        material[i] = chr === ',' ? MAT.ACCENT : MAT.CORE;
      } else {
        const t = r.tpl!;
        tiles[i] = t.tiles[ly * t.w + lx];
        const base = t.mat0 ?? KIND_MAT[r.kind];
        const baseM = base === MAT.CARPET && tg.carpetMat !== undefined && !['manager', 'meeting'].includes(r.kind) ? tg.carpetMat : base;
        const mm = t.mat[ly * t.w + lx];
        material[i] = mm >= 0 ? mm : baseM;
      }
    }
    const def: RoomDef = {
      id: r.id, kind: r.kind, templateId: isCore ? (mirrorCore ? 'core/m' : 'core/n') : r.tpl!.id,
      tx: X0 + 1, ty: Y0 + 1, tw: r.cw * CELL - 1, th: r.ch * CELL - 1,
      isCritical: r.critical, isSide: r.side, neighbours: [], doorIds: [], spawnPoints: [], rewardPoint: { x: 0, y: 0 },
      sizeWeight: 0, lights: [], darkness: 0, hasWindows: false, sprinklers: false,
    };
    if (r.elite) def.eliteRoom = true;
    roomDefs.push(def);
  }
  m.rooms = roomDefs;

  // ---- doors
  pds.forEach((d, id) => {
    const len = d.len;
    const def: DoorDef = { id, tx: d.gx + ox, ty: d.gy + oy, orient: d.orient, len, roomA: d.a, roomB: d.b };
    for (const [x, y] of doorTiles(def)) { tiles[idx(x, y)] = T.DOOR; material[idx(x, y)] = material[idx(def.orient === 'h' ? x : x - 1, def.orient === 'h' ? y - 1 : y)]; }
    m.doors.push(def);
    roomDefs[d.a].neighbours.push(d.b); roomDefs[d.b].neighbours.push(d.a);
    roomDefs[d.a].doorIds.push(id); roomDefs[d.b].doorIds.push(id);
  });

  // ---- props
  let pid = 0;
  const occ = new Int32Array(w * h).fill(-1); // prop index occupying tile (solid or floor props)
  const wallOcc = new Uint8Array(w * h);      // wall-mounted props on the north-wall tile above
  const addProp = (kind: PropKind, tx: number, ty: number, fw: number, fh: number, roomId: number, facing: 0 | 1 | 2 | 3, wall: boolean): PropDef | null => {
    if (wall) {
      for (let x = tx; x < tx + fw; x++) if (wallOcc[idx(x, ty)] || tiles[idx(x, ty - 1)] === T.DOOR) return null;
    } else {
      for (let y = ty; y < ty + fh; y++) for (let x = tx; x < tx + fw; x++) {
        const i = idx(x, y);
        if (occ[i] >= 0 || !isWalkTile(tiles[i]) || tiles[i] === T.DOOR) return null;
      }
    }
    const variant = cosmetic.int(0, 7);
    const p = makeProp(pid++, kind, tx, ty, fw, fh, roomId, facing, wall, variant);
    m.props.push(p);
    if (wall) for (let x = tx; x < tx + fw; x++) wallOcc[idx(x, ty)] = 1;
    else for (let y = ty; y < ty + fh; y++) for (let x = tx; x < tx + fw; x++) occ[idx(x, y)] = m.props.length - 1;
    return p;
  };

  // keep-clear zones: door aprons (+1 tile either side of the door span) and core exit approaches
  const keep = new Uint8Array(w * h);
  const entrance = new Uint8Array(w * h); // within 2 tiles of a door (no hazard fills)
  for (const d of m.doors) {
    for (const [x, y] of doorApron(d, 2)) keep[idx(x, y)] = 1;
    for (const [x, y] of doorTiles(d)) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) entrance[idx(xx, yy)] = 1;
    }
  }
  const core = roomDefs[0];
  for (const [lx, ly] of coreKeepClear()) keep[idx(core.tx + (mirrorCore ? CORE_W - 1 - lx : lx), core.ty + ly)] = 1;

  // core furniture
  for (const cp of CORE_PROPS) {
    if (cp.cult && !req.cultDressing) continue;
    if (cp.plain && req.cultDressing) continue;
    const lx = mirrorCore ? CORE_W - cp.fw - cp.x : cp.x;
    const tx = core.tx + lx, ty = core.ty + cp.y;
    if (!cp.wall) {
      let blocked = false;
      for (let y = ty; y < ty + cp.fh; y++) for (let x = tx; x < tx + cp.fw; x++) if (keep[idx(x, y)]) blocked = true;
      if (blocked) continue;
    }
    addProp(cp.kind, tx, ty, cp.fw, cp.fh, 0, cp.facing ?? 0, !!cp.wall);
  }

  // template props + slots
  const tplHints = new Map<number, { spawns: [number, number][]; reward: [number, number] | null; lights: [number, number][] }>();
  const shredOk = req.theme === 'finance' || req.theme === 'legal';
  for (const r of prs) {
    if (r.kind === 'core') continue;
    const t = r.tpl!, rd = roomDefs[r.id];
    const kindHaz = KIND_HAZARD[r.kind] ?? tg.hazard;
    for (const p of t.props) {
      let kind = p.kind;
      if (kind === 'shredder' && !shredOk) kind = 'filing_cabinet';
      const tx = rd.tx + p.x, ty = rd.ty + p.y;
      if (!p.wall) {
        let blocked = false;
        for (let y = ty; y < ty + p.fh; y++) for (let x = tx; x < tx + p.fw; x++) if (keep[idx(x, y)]) blocked = true;
        if (blocked) continue; // never block a doorway (sockets guarantee this for fixed props)
      }
      if (req.hotDesking && (kind === 'desk' || kind === 'desk_l') && cosmetic.chance(0.45)) continue;
      if (req.hotDesking && PROP_INFO[kind].cover && kind !== 'desk' && kind !== 'desk_l' && cosmetic.chance(0.3)) continue;
      addProp(kind, tx, ty, p.fw, p.fh, r.id, p.facing, p.wall);
    }
    for (const s of t.slots) {
      const tx = rd.tx + s.x, ty = rd.ty + s.y;
      const i = idx(tx, ty);
      if (keep[i]) continue;
      let kind: PropKind | null = null;
      if (s.type === 'decor') {
        if (!cosmetic.chance(0.75)) continue;
        kind = req.cultDressing && cosmetic.chance(0.35) ? 'candles' : cosmetic.pick(tg.decor);
      } else if (s.type === 'cover') {
        if (!cosmetic.chance(req.hotDesking ? 0.3 : 0.85)) continue;
        kind = cosmetic.pick(tg.cover);
      } else if (s.type === 'hazard') {
        if (entrance[i] || !cosmetic.chance(0.9)) continue;
        kind = cosmetic.pick(kindHaz);
        if (kind === 'cable_run') kind = 'socket';
      } else if (s.type === 'centre') {
        if (!addProp('fortune_copier', tx, ty, 2, 1, r.id, 0, false)) addProp('hr_cabinet', tx, ty, 1, 1, r.id, 0, false);
        continue;
      }
      if (!kind) continue;
      const info = PROP_INFO[kind];
      if (info.fw !== 1 || info.fh !== 1 || info.wall || info.stretchy) continue;
      // hazards never cluster: skip if another hazard is adjacent
      if (info.hazard) {
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = occ[idx(tx + dx, ty + dy)]; if (o >= 0 && m.props[o].hazard) near = true; }
        if (near) continue;
      }
      addProp(kind, tx, ty, 1, 1, r.id, ty === rd.ty ? 0 : ty === rd.ty + rd.th - 1 ? 2 : tx === rd.tx ? 1 : tx === rd.tx + rd.tw - 1 ? 3 : 0, false);
    }
    tplHints.set(r.id, {
      spawns: t.spawns.map((s) => [rd.tx + s.x, rd.ty + s.y]),
      reward: t.reward ? [rd.tx + t.reward.x, rd.ty + t.reward.y] : null,
      lights: t.lights.map((s) => [rd.tx + s.x, rd.ty + s.y]),
    });
  }

  // ---- room flags: sprinklers, darkness, windows
  for (const r of prs) {
    const rd = roomDefs[r.id];
    if (r.kind === 'core') { rd.darkness = 0.06; continue; }
    const t = r.tpl!;
    const sprDefault = ['openplan', 'cubicles', 'kitchen', 'print', 'archive', 'meeting', 'reception', 'corridor', 'manager', 'director'].includes(r.kind);
    rd.sprinklers = t.sprinklers ?? (sprDefault && cosmetic.chance(0.55));
    rd.darkness = t.dark ?? (r.kind === 'server' ? 0.55 : r.kind === 'archive' ? ACT_DARKNESS[act] + 0.1 : r.kind === 'corridor' ? ACT_DARKNESS[act] + 0.05 : ACT_DARKNESS[act]);
  }

  // ---- Act 4 cult dressing (spec 4.3): banners of company values, shrines, candles, lecterns
  if (req.cultDressing) {
    let shrinePlaced = false;
    const byArea = prs.filter((r) => r.kind !== 'core' && COMBAT_KINDS.has(r.kind)).sort((a, b) => b.cw * b.ch - a.cw * a.ch);
    for (const r of byArea) {
      const rd = roomDefs[r.id];
      // banners on free north-wall spans
      let banners = 0;
      for (let x = rd.tx + 1; x < rd.tx + rd.tw - 2 && banners < 2; x += 3) {
        if (cosmetic.chance(0.5) && addProp('banner_values', x, rd.ty, 2, 1, r.id, 0, true)) banners++;
      }
      if (!shrinePlaced && r.cw * r.ch >= 4) {
        const cx = rd.tx + (rd.tw >> 1) - 1, cy = rd.ty + 2;
        for (let dy = 0; dy < 6 && !shrinePlaced; dy++) for (let dx = -4; dx <= 4 && !shrinePlaced; dx++) {
          const tx = cx + dx, ty = cy + dy;
          let ok = true;
          for (let y = ty - 2; y <= ty + 3 && ok; y++) for (let x = tx - 2; x <= tx + 4 && ok; x++) if (keep[idx(x, y)] || entrance[idx(x, y)] || occ[idx(x, y)] >= 0 || roomOf[idx(x, y)] !== r.id || !isWalkTile(tiles[idx(x, y)])) ok = false;
          if (ok && addProp('ceo_shrine', tx, ty, 3, 2, r.id, 0, false)) {
            shrinePlaced = true;
            addProp('candles', tx - 1, ty + 1, 1, 1, r.id, 0, false);
            addProp('candles', tx + 3, ty + 1, 1, 1, r.id, 0, false);
          }
        }
      }
      if ((r.kind === 'meeting' || r.kind === 'openplan') && cosmetic.chance(0.35)) {
        for (let tries = 0; tries < 12; tries++) {
          const tx = cosmetic.int(rd.tx + 2, rd.tx + rd.tw - 3), ty = cosmetic.int(rd.ty + 2, rd.ty + rd.th - 3);
          let ok = true;
          for (let y = ty - 2; y <= ty + 2 && ok; y++) for (let x = tx - 2; x <= tx + 2 && ok; x++) if (keep[idx(x, y)] || entrance[idx(x, y)] || occ[idx(x, y)] >= 0 || roomOf[idx(x, y)] !== r.id || !isWalkTile(tiles[idx(x, y)])) ok = false;
          if (ok && addProp('ceremonial_lectern', tx, ty, 1, 1, r.id, 0, false)) break;
        }
      }
    }
  }

  // sprinkler valves on the north wall of sprinkler rooms
  for (const r of prs) {
    const rd = roomDefs[r.id];
    if (!rd.sprinklers) continue;
    for (let tries = 0; tries < 6; tries++) {
      const x = cosmetic.int(rd.tx, rd.tx + rd.tw - 1);
      if (addProp('sprinkler', x, rd.ty, 1, 1, r.id, 0, true)) break;
    }
  }

  // ---- entrance sanitising (spec 4.4 step 9: no hazard clusters at room entrances):
  // no hazard within 1 tile of a door, at most one within 3 tiles.
  {
    const drop = new Set<PropDef>();
    for (const d of m.doors) {
      const dt = doorTiles(d);
      const near: { p: PropDef; dd: number }[] = [];
      for (const p of m.props) {
        if (!p.hazard || p.wallMounted) continue;
        const [bx, by] = propBaseTile(p);
        const dd = Math.min(...dt.map(([x, y]) => Math.max(Math.abs(x - bx), Math.abs(y - by))));
        if (dd <= 3) near.push({ p, dd });
      }
      near.sort((a, b) => b.dd - a.dd);
      near.forEach((o, k) => { if (o.dd <= 1 || k >= 1) drop.add(o.p); });
    }
    if (drop.size) {
      for (const p of drop) for (const [x, y] of propTiles(p)) if (occ[idx(x, y)] >= 0 && m.props[occ[idx(x, y)]] === p) occ[idx(x, y)] = -1;
      m.props = m.props.filter((p) => !drop.has(p));
    }
  }

  // ---- exterior windows (spec 4.7 defenestration) on the building perimeter
  const winTile = act === 4 ? T.WINDOW_SEALED : T.WINDOW;
  const isVoid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[idx(x, y)] === T.VOID;
  for (const r of prs) {
    if (r.kind === 'core' || !r.tpl!.win) continue;
    const rd = roomDefs[r.id];
    const X0 = rd.tx - 1, Y0 = rd.ty - 1, X1 = rd.tx + rd.tw, Y1 = rd.ty + rd.th;
    const tryWin = (x: number, y: number, ix: number, iy: number, along: number) => {
      const i = idx(x, y);
      if (tiles[i] !== T.WALL) return;
      if (along % 4 === 0) return; // mullion pillars every 4 tiles
      const outX = x + (x - ix), outY = y + (y - iy);
      if (!isVoid(outX, outY)) return;
      if (!isWalkTile(tiles[idx(ix, iy)])) return;
      if (y === Y0 && wallOcc[idx(x, y + 1)]) return; // keep wall under wall-mounted props
      // keep 1 tile of wall next to doors/corners
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = tiles[idx(x + dx, y + dy)]; if (t === T.DOOR || t === T.CORE_WALL) return; }
      tiles[i] = winTile;
      rd.hasWindows = true;
    };
    for (let x = X0 + 1; x < X1; x++) { tryWin(x, Y0, x, Y0 + 1, x - X0); tryWin(x, Y1, x, Y1 - 1, x - X0); }
    for (let y = Y0 + 1; y < Y1; y++) { tryWin(X0, y, X0 + 1, y, y - Y0); tryWin(X1, y, X1 - 1, y, y - Y0); }
  }

  // ---- breach segments (spec 4.7): only between two non-core rooms not already joined by a door;
  // each room in at most one segment, so a breach can never merge more than two rooms.
  const inBreach = new Set<number>();
  const pairs: { a: PRoom; b: PRoom; tiles: [number, number][] }[] = [];
  for (let i = 1; i < prs.length; i++) for (let j = i + 1; j < prs.length; j++) {
    const A = prs[i], B = prs[j];
    if (roomDefs[A.id].neighbours.includes(B.id)) continue;
    const seg = sharedWall(A, B, ox, oy);
    if (seg) pairs.push({ a: A, b: B, tiles: seg });
  }
  cosmetic.shuffle(pairs);
  const maxBreaches = rng.int(1, 2);
  for (const pr of pairs) {
    if (m.breaches.length >= maxBreaches) break;
    if (inBreach.has(pr.a.id) || inBreach.has(pr.b.id)) continue;
    const ok = pr.tiles.every(([x, y]) => tiles[idx(x, y)] === T.WALL
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => tiles[idx(x + dx, y + dy)] !== T.CORE_WALL && roomOf[idx(x + dx, y + dy)] !== 0));
    if (!ok) continue;
    const ma = pr.a.tpl!.breach, mb = pr.b.tpl!.breach;
    const mat: BreachMat = ma === 'glass' || mb === 'glass' ? 'glass' : ma === 'cubicle' && mb === 'cubicle' ? 'cubicle' : 'plaster';
    const code = mat === 'glass' ? T.GLASS : mat === 'cubicle' ? T.CUBICLE : T.PARTITION;
    for (const [x, y] of pr.tiles) tiles[idx(x, y)] = code;
    // wall-mounted props hanging on the breach segment are removed
    const segSet = new Set(pr.tiles.map(([x, y]) => idx(x, y)));
    m.props = m.props.filter((p) => {
      if (!p.wallMounted) return true;
      const wy = Math.floor(p.y / TILE) - 1;
      for (let x = Math.floor((p.x - p.w / 2) / TILE); x <= Math.floor((p.x + p.w / 2 - 1) / TILE); x++) if (segSet.has(idx(x, wy))) return false;
      return true;
    });
    // breached rubble shows the floor of room A
    const fa = material[idx(roomDefs[pr.a.id].tx, roomDefs[pr.a.id].ty)];
    for (const [x, y] of pr.tiles) material[idx(x, y)] = fa;
    const bd: BreachDef = { id: m.breaches.length, roomA: pr.a.id, roomB: pr.b.id, tiles: pr.tiles, material: mat };
    m.breaches.push(bd);
    inBreach.add(pr.a.id); inBreach.add(pr.b.id);
  }
  // re-index prop ids after filtering
  m.props.forEach((p, i) => { p.id = i; });

  // ---- exits in the core (spec 3.3 / 4.2): all three physically present
  for (const e of CORE_EXITS) {
    const x0 = mirrorCore ? CORE_W - 1 - e.x1 : e.x0, x1 = mirrorCore ? CORE_W - 1 - e.x0 : e.x1;
    const ex: ExitDef = { kind: e.kind, x: (core.tx + (x0 + x1 + 1) / 2) * TILE, y: (core.ty + 2) * TILE + 8, available: req.exits.includes(e.kind as ExitKind) };
    m.exits.push(ex);
  }
  m.spawn = { x: (core.tx + CORE_W / 2) * TILE, y: (core.ty + 7.5) * TILE };

  // ---- spawn points, rewards, lights, size weights
  const free = freeGrid(m);
  const greach = bfs(m, free, [[Math.floor(m.spawn.x / TILE), Math.floor(m.spawn.y / TILE)]]);
  const light = ACT_LIGHT[act];
  for (const r of prs) {
    const rd = roomDefs[r.id];
    const hints = tplHints.get(r.id);
    if (r.kind !== 'core') {
      rd.spawnPoints = computeSpawns(m, free, rd, hints?.spawns ?? [], 18, greach);
      rd.rewardPoint = computeReward(m, free, rd, hints?.reward ?? null, greach);
      if (r.kind === 'treasure') {
        const cup = m.props.find((p) => p.kind === 'stationery_cupboard' && p.roomId === r.id);
        if (cup) rd.rewardPoint = { x: cup.x, y: cup.y + TILE * 1.5 };
      }
    } else {
      rd.rewardPoint = { x: m.spawn.x, y: m.spawn.y + TILE * 2 };
    }
    const combat = COMBAT_KINDS.has(r.kind) && r.kind !== 'core' && !(SPECIAL_FLOORS.has(req.floorType));
    const area = rd.tw * rd.th;
    rd.sizeWeight = combat ? Math.round((area / 225) * (r.side ? 0.5 : 1) * 100) / 100 : 0;
    rd.lights = roomLights(m, r, rd, light, hints?.lights ?? [], cosmetic.nextU32());
    if (req.platform === 'android' && rd.lights.length > 4) rd.lights = rd.lights.slice(0, 4);
  }

  // ---- decals (cosmetic only)
  placeDecor(m, prs, roomDefs, rng.fork('decor'), tg.decals, occ);
  void minCy;
  return m;
}

/** Shared wall tiles between two rooms (one cell's worth, excluding corners). */
function sharedWall(A: PRoom, B: PRoom, ox: number, oy: number): [number, number][] | null {
  const pick = (lo: number, hi: number) => {
    if (hi <= lo) return null;
    const mid = Math.floor((lo + hi - 1) / 2);
    return mid; // cell index
  };
  if (A.cx + A.cw === B.cx || B.cx + B.cw === A.cx) {
    const gx = A.cx + A.cw === B.cx ? B.cx * CELL : A.cx * CELL;
    const lo = Math.max(A.cy, B.cy), hi = Math.min(A.cy + A.ch, B.cy + B.ch);
    const c = pick(lo, hi);
    if (c === null) return null;
    const out: [number, number][] = [];
    for (let y = c * CELL + 1; y < (c + 1) * CELL; y++) out.push([gx + ox, y + oy]);
    return out;
  }
  if (A.cy + A.ch === B.cy || B.cy + B.ch === A.cy) {
    const gy = A.cy + A.ch === B.cy ? B.cy * CELL : A.cy * CELL;
    const lo = Math.max(A.cx, B.cx), hi = Math.min(A.cx + A.cw, B.cx + B.cw);
    const c = pick(lo, hi);
    if (c === null) return null;
    const out: [number, number][] = [];
    for (let x = c * CELL + 1; x < (c + 1) * CELL; x++) out.push([x + ox, gy + oy]);
    return out;
  }
  return null;
}

function roomLights(m: FloorMap, r: PRoom, rd: RoomDef, color: string, hints: [number, number][], bits: number): LightDef[] {
  const act = m.req.act;
  const out: LightDef[] = [];
  if (r.kind === 'server') {
    out.push(...panelLights(rd, '#9fb8d8', 0, bits, 0.4).slice(0, 2));
    let k = 0;
    for (const p of m.props) if (p.roomId === r.id && p.kind === 'server_rack' && k++ % 3 === 0)
      out.push({ x: Math.round(p.x), y: Math.round(p.y - 12), radius: 30, color: k % 2 ? '#3a9cff' : '#38e0c8', intensity: 0.75, flicker: 'none' });
    return out;
  }
  if (hints.length) for (const [x, y] of hints) out.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 88, color, intensity: 0.85, flicker: act === 1 && (bits & 3) === 0 ? 'fluorescent' : 'none' });
  else out.push(...panelLights(rd, color, act === 1 ? 2 : act === 2 ? 5 : 4, bits, r.kind === 'core' ? 0.95 : 0.85));
  if (act === 2) {
    for (const p of m.props) if (p.roomId === r.id && (p.kind === 'leaderboard_screen' || p.kind === 'tv_screen'))
      out.push({ x: Math.round(p.x), y: Math.round(p.y + 6), radius: 40, color: (bits & 1) ? '#00d1c1' : '#ff6a00', intensity: 0.6, flicker: 'none' });
  }
  if (m.req.cultDressing) {
    for (const p of m.props) if (p.roomId === r.id && (p.kind === 'candles' || p.kind === 'ceo_shrine'))
      out.push({ x: Math.round(p.x), y: Math.round(p.y - 8), radius: p.kind === 'ceo_shrine' ? 64 : 36, color: '#ffb060', intensity: 0.8, flicker: 'candle' });
    for (const l of out) if (l.flicker !== 'candle') { l.color = '#ffd8a0'; l.intensity = Math.min(l.intensity, 0.7); }
  }
  return out;
}

function placeDecor(m: FloorMap, prs: PRoom[], rds: RoomDef[], rng: Rng, decals: string[], occ: Int32Array): void {
  const idx = (x: number, y: number) => y * m.w + x;
  const core = rds[0];
  // core: floor number sign + (act 4) company emblem inlay
  m.decor.push({ kind: 'floor_sign', x: core.tx * TILE + (core.tw * TILE) / 2, y: (core.ty + 7.5) * TILE, variant: m.req.floorNumber });
  if (m.req.cultDressing) m.decor.push({ kind: 'sigil', x: core.tx * TILE + (core.tw * TILE) / 2, y: (core.ty + 7.5) * TILE, variant: 0 });
  for (const r of prs) {
    if (r.kind === 'core') continue;
    const rd = rds[r.id];
    // rugs under meeting/boardroom tables and executive desks
    for (const p of m.props) {
      if (p.roomId !== r.id) continue;
      if ((p.kind === 'meeting_table' && r.kind !== 'kitchen' && r.kind !== 'shop' && r.kind !== 'openplan') || p.kind === 'exec_desk') {
        m.decor.push({ kind: 'rug', x: p.x, y: p.y - p.h / 2, variant: rng.int(0, 3) + (Math.round(p.w / TILE) + 2) * 16 + (Math.round(p.h / TILE) + 2) * 256 });
      }
    }
    if (r.kind === 'reception') m.decor.push({ kind: 'logo', x: (rd.tx + rd.tw / 2) * TILE, y: (rd.ty + rd.th * 0.62) * TILE, variant: rng.int(0, 3) });
    const n = rng.int(1, 3) + (rd.tw * rd.th > 300 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const tx = rng.int(rd.tx, rd.tx + rd.tw - 1), ty = rng.int(rd.ty, rd.ty + rd.th - 1);
      if (m.tiles[idx(tx, ty)] !== T.FLOOR || occ[idx(tx, ty)] >= 0) continue;
      const kind = rng.pick(decals);
      if (kind === 'rug' || kind === 'logo' || kind === 'inlay') continue;
      m.decor.push({ kind, x: (tx + 0.5) * TILE + rng.int(-4, 4), y: (ty + 0.5) * TILE + rng.int(-4, 4), variant: rng.int(0, 7) });
    }
    if (r.kind === 'print' || r.kind === 'archive') for (let k = 0; k < 2; k++) {
      const tx = rng.int(rd.tx, rd.tx + rd.tw - 1), ty = rng.int(rd.ty, rd.ty + rd.th - 1);
      if (m.tiles[idx(tx, ty)] === T.FLOOR) m.decor.push({ kind: 'papers', x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, variant: rng.int(0, 7) });
    }
  }
  void propTiles;
}

// helper for consumers
export function themeOf(req: FloorRequest): ThemeId { return req.theme; }
