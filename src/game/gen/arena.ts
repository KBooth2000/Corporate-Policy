// Hand-made arenas from ASCII (boss floors, lift ambush). Pure TypeScript (no DOM).
//
// buildArenaFromAscii(ascii, legend, req, opts?) turns a FULL map (walls included) into a valid FloorMap.
// Rooms are the connected walkable regions separated by DOOR tiles. A region containing CORE_FLOOR tiles is the
// core (spawn + exits); without one, coreRoomId is the room holding the player spawn marker.
//
// Default legend (override or extend with `legend`; any template prop glyph not shadowed also works, see template.ts):
//   ' ' / 'V' void     '#' wall      'X' core wall     'o' core floor     '.' floor      'D' door (runs of 2-3)
//   'w' window (sealed curtain wall automatically in Act 4)   'b' broken window   '_' pit   '~' water
//   'g' glass partition tile   'c' cubicle wall tile   'r' plaster partition tile   ',' floor (accent material)
//   '@' player spawn (core floor)   '%' player spawn (floor)   'S' 'L' 'C' stairs / lift / corridor doorway on core floor
//   'e' enemy spawn hint (floor)   '$' reward point (floor)   '*' light (floor)
import type { ExitKind, PropKind } from '../../data/ids';
import type { DoorDef, ExitDef, FloorMap, FloorRequest, RoomDef, RoomKind } from '../world-types';
import { T, TILE } from '../world-types';
import { ACT_DARKNESS, ACT_LIGHT, bfs, computeReward, computeSpawns, freeGrid, isWalkTile, makeProp, panelLights } from './build';
import { MAT } from './materials';
import { PROP_INFO } from './props';
import { GLYPHS } from './template';
import { KIND_MAT } from './themes';

export interface ArenaGlyph {
  tile?: number;
  prop?: PropKind;
  exit?: ExitKind;
  spawn?: boolean;
  enemy?: boolean;
  reward?: boolean;
  light?: boolean;
  mat?: number;
}

export const ARENA_LEGEND: Record<string, ArenaGlyph> = {
  ' ': { tile: T.VOID }, V: { tile: T.VOID }, '#': { tile: T.WALL }, X: { tile: T.CORE_WALL }, o: { tile: T.CORE_FLOOR },
  '.': { tile: T.FLOOR }, ',': { tile: T.FLOOR, mat: MAT.ACCENT }, D: { tile: T.DOOR }, w: { tile: T.WINDOW }, b: { tile: T.WINDOW_BROKEN },
  _: { tile: T.PIT }, '~': { tile: T.WATER }, g: { tile: T.GLASS }, c: { tile: T.CUBICLE }, r: { tile: T.PARTITION },
  '@': { tile: T.CORE_FLOOR, spawn: true }, '%': { tile: T.FLOOR, spawn: true },
  S: { tile: T.CORE_FLOOR, exit: 'stairs' }, L: { tile: T.CORE_FLOOR, exit: 'lift' }, C: { tile: T.CORE_FLOOR, exit: 'corridor' },
  e: { tile: T.FLOOR, enemy: true }, $: { tile: T.FLOOR, reward: true }, '*': { tile: T.FLOOR, light: true },
};

export interface ArenaOpts {
  /** Kind of the non-core rooms (default: 'boss' on boss floors, 'lift_arena' on lift ambushes, else 'challenge'). */
  roomKind?: RoomKind;
  /** Force all exits available (lift ambush: the lift is the way out). */
  exitsAvailable?: boolean;
  templateId?: string;
}

export function buildArenaFromAscii(ascii: string[], legend: Record<string, ArenaGlyph> = {}, req: FloorRequest, opts: ArenaOpts = {}): FloorMap {
  const h = ascii.length, w = Math.max(...ascii.map((r) => r.length));
  const L: Record<string, ArenaGlyph> = { ...ARENA_LEGEND, ...legend };
  const tiles = new Uint8Array(w * h).fill(T.VOID);
  const material = new Uint8Array(w * h).fill(MAT.CARPET);
  const roomOf = new Int16Array(w * h).fill(-1);
  const idx = (x: number, y: number) => y * w + x;
  const props: { kind: PropKind; x: number; y: number }[] = [];
  const exitCells: { kind: ExitKind; x: number; y: number }[] = [];
  const enemyHints: [number, number][] = [], lights: [number, number][] = [];
  let spawn: [number, number] | null = null, reward: [number, number] | null = null;
  const propChar: string[] = new Array(w * h).fill('');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = ascii[y][x] ?? ' ';
    const g = L[ch];
    const i = idx(x, y);
    if (g) {
      if (g.tile !== undefined) tiles[i] = g.tile;
      if (g.mat !== undefined) material[i] = g.mat;
      if (g.prop) { tiles[i] = g.tile ?? T.FLOOR; propChar[i] = ch; props.push({ kind: g.prop, x, y }); }
      if (g.exit) exitCells.push({ kind: g.exit, x, y });
      if (g.spawn) spawn = [x, y];
      if (g.enemy) enemyHints.push([x, y]);
      if (g.reward) reward = [x, y];
      if (g.light) lights.push([x, y]);
      continue;
    }
    const tg = GLYPHS[ch];
    if (tg?.prop) { tiles[i] = T.FLOOR; propChar[i] = ch; continue; }
    if (tg?.tile !== undefined) { tiles[i] = tg.tile; continue; }
    tiles[i] = T.FLOOR;
  }
  if (req.act === 4) for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.WINDOW) tiles[i] = T.WINDOW_SEALED;

  // rooms = walkable regions split by doors
  const rooms: RoomDef[] = [];
  const defaultKind: RoomKind = opts.roomKind ?? (req.floorType === 'boss' ? 'boss' : req.floorType === 'lift_ambush' ? 'lift_arena' : 'challenge');
  let coreRoomId = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (roomOf[i] >= 0 || !isWalkTile(tiles[i]) || tiles[i] === T.DOOR) continue;
    const id = rooms.length;
    const stack = [i];
    roomOf[i] = id;
    let x0 = x, y0 = y, x1 = x, y1 = y, hasCore = false;
    while (stack.length) {
      const j = stack.pop()!;
      const jx = j % w, jy = (j / w) | 0;
      if (tiles[j] === T.CORE_FLOOR) hasCore = true;
      x0 = Math.min(x0, jx); x1 = Math.max(x1, jx); y0 = Math.min(y0, jy); y1 = Math.max(y1, jy);
      for (const k of [j - 1, j + 1, j - w, j + w]) {
        if (k < 0 || k >= w * h || roomOf[k] >= 0) continue;
        if (Math.abs((k % w) - jx) > 1) continue;
        if (!isWalkTile(tiles[k]) || tiles[k] === T.DOOR) continue;
        roomOf[k] = id; stack.push(k);
      }
    }
    const kind: RoomKind = hasCore ? 'core' : defaultKind;
    if (hasCore && coreRoomId < 0) coreRoomId = id;
    rooms.push({ id, kind, templateId: opts.templateId ?? 'arena', tx: x0, ty: y0, tw: x1 - x0 + 1, th: y1 - y0 + 1,
      isCritical: !hasCore, isSide: false, neighbours: [], doorIds: [], spawnPoints: [], rewardPoint: { x: 0, y: 0 },
      sizeWeight: 0, lights: [], darkness: hasCore ? 0.06 : ACT_DARKNESS[req.act], hasWindows: false, sprinklers: false });
  }
  for (let i = 0; i < w * h; i++) if (roomOf[i] >= 0) {
    if (tiles[i] === T.CORE_FLOOR) material[i] = material[i] === MAT.ACCENT ? MAT.ACCENT : MAT.CORE;
    else if (material[i] === MAT.CARPET) material[i] = KIND_MAT[rooms[roomOf[i]].kind];
  }

  // doors = runs of DOOR tiles
  const doors: DoorDef[] = [];
  const seenDoor = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (tiles[i] !== T.DOOR || seenDoor[i]) continue;
    const horiz = x + 1 < w && tiles[i + 1] === T.DOOR ? true : y + 1 < h && tiles[i + w] === T.DOOR ? false
      : (isWalkTile(tiles[i - w]) && isWalkTile(tiles[i + w]));
    let len = 0;
    while (true) {
      const xx = horiz ? x + len : x, yy = horiz ? y : y + len;
      if (xx >= w || yy >= h || tiles[idx(xx, yy)] !== T.DOOR) break;
      seenDoor[idx(xx, yy)] = 1; len++;
    }
    const orient: 'h' | 'v' = horiz ? 'h' : 'v';
    const a = horiz ? roomOf[idx(x, y - 1)] : roomOf[idx(x - 1, y)];
    const b = horiz ? roomOf[idx(x, y + 1)] : roomOf[idx(x + 1, y)];
    const d: DoorDef = { id: doors.length, tx: x, ty: y, orient, len, roomA: a, roomB: b };
    doors.push(d);
    if (a >= 0 && b >= 0) {
      rooms[a].neighbours.push(b); rooms[b].neighbours.push(a);
      rooms[a].doorIds.push(d.id); rooms[b].doorIds.push(d.id);
    }
    material[i] = material[horiz ? idx(x, y - 1) : idx(x - 1, y)];
  }

  if (coreRoomId < 0 && spawn) coreRoomId = roomOf[idx(spawn[0], spawn[1])];
  if (coreRoomId < 0) coreRoomId = 0;

  const m: FloorMap = { req, w, h, tiles, roomOf, rooms, doors, breaches: [], props: [], exits: [], coreRoomId,
    spawn: spawn ? { x: (spawn[0] + 0.5) * TILE, y: (spawn[1] + 0.5) * TILE } : { x: (rooms[coreRoomId].tx + rooms[coreRoomId].tw / 2) * TILE, y: (rooms[coreRoomId].ty + rooms[coreRoomId].th / 2) * TILE },
    attempts: 1, material, decor: [] };

  // props: components of identical glyph (like templates)
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    const ch = propChar[i];
    if (!ch || seen[i]) continue;
    const kind = (L[ch]?.prop ?? GLYPHS[ch]?.prop)!;
    let x1 = x, y1 = y;
    while (x1 + 1 < w && propChar[idx(x1 + 1, y)] === ch) x1++;
    while (y1 + 1 < h && propChar[idx(x, y1 + 1)] === ch) y1++;
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) seen[idx(xx, yy)] = 1;
    const info = PROP_INFO[kind];
    const bw = x1 - x + 1, bh = y1 - y + 1;
    const rid = roomOf[i];
    const wall = !!info.wall;
    if (info.stretchy) { m.props.push(makeProp(m.props.length, kind, x, y, bw, bh, rid, 0, false, 0)); continue; }
    let fw = info.fw, fh = info.fh;
    if (wall) fh = 1;
    if (bw % fw || bh % fh) { fw = info.fh; fh = info.fw; }
    if (bw % fw || bh % fh) { fw = 1; fh = 1; }
    for (let yy = y; yy <= y1; yy += fh) for (let xx = x; xx <= x1; xx += fw)
      m.props.push(makeProp(m.props.length, kind, xx, yy, fw, fh, rid, fw < fh ? 1 : 0, wall, 0));
  }

  // exits: runs of exit cells
  const exSeen = new Set<number>();
  for (const c of exitCells) {
    if (exSeen.has(idx(c.x, c.y))) continue;
    let x1 = c.x;
    while (exitCells.some((o) => o.kind === c.kind && o.y === c.y && o.x === x1 + 1)) x1++;
    for (let x = c.x; x <= x1; x++) exSeen.add(idx(x, c.y));
    const ex: ExitDef = { kind: c.kind, x: ((c.x + x1 + 1) / 2) * TILE, y: c.y * TILE + 8, available: opts.exitsAvailable ? true : req.exits.includes(c.kind) };
    m.exits.push(ex);
  }

  // windows / spawns / rewards / lights / weights
  for (let i = 0; i < w * h; i++) if (tiles[i] === T.WINDOW || tiles[i] === T.WINDOW_SEALED) {
    const x = i % w, y = (i / w) | 0;
    for (const k of [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)]) if (k >= 0 && k < w * h && roomOf[k] >= 0) rooms[roomOf[k]].hasWindows = true;
  }
  const free = freeGrid(m);
  const greach = bfs(m, free, [[Math.floor(m.spawn.x / TILE), Math.floor(m.spawn.y / TILE)]]);
  for (const r of rooms) {
    const hints = enemyHints.filter(([x, y]) => roomOf[idx(x, y)] === r.id);
    if (r.kind !== 'core') {
      r.spawnPoints = computeSpawns(m, free, r, hints, 18, greach);
      r.rewardPoint = computeReward(m, free, r, reward && roomOf[idx(reward[0], reward[1])] === r.id ? reward : null, greach);
      r.sizeWeight = Math.round((r.tw * r.th / 225) * 100) / 100;
    } else {
      r.rewardPoint = { x: m.spawn.x, y: m.spawn.y + TILE };
    }
    const own = lights.filter(([x, y]) => roomOf[idx(x, y)] === r.id);
    r.lights = own.length ? own.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 96, color: ACT_LIGHT[req.act], intensity: 0.85, flicker: 'none' as const }))
      : panelLights(r, ACT_LIGHT[req.act], req.act === 1 ? 3 : 0, 0x5a5a5a);
  }
  return m;
}

// ------------------------------------------------------------------------------------------------
// Lift ambush (spec 3.3): tight 14x10 arena next to a tiny lift lobby. The lift is the only exit.

const LIFT_AMBUSH: string[][] = [[
  '                        ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XooooooLLLoooooX    ',
  '    Xoooooo@oooooooX    ',
  '    XooooooooooooooX    ',
  '    XXXXXXXDDDXXXXXX    ',
  '    #......*.......#    ',
  '    w.e..........e.w    ',
  '    w...P......P...w    ',
  '    #..............#    ',
  '    w.e....$.....e.w    ',
  '    w..............w    ',
  '    #..F...e....k..#    ',
  '    w...P......P...w    ',
  '    w.e.....*....e.w    ',
  '    #..............#    ',
  '    ################    ',
  '                        ',
  '                        ',
], [
  '                        ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXX    ',
  '    XooooooLLLoooooX    ',
  '    Xoooooo@oooooooX    ',
  '    XooooooooooooooX    ',
  '    XXXXXXXDDDXXXXXX    ',
  '    #......*.......#    ',
  '    #.e....e.....e.#    ',
  '    #..##......##..#    ',
  '    w..............w    ',
  '    w.e....$.....e.w    ',
  '    w..............w    ',
  '    #..##..k...##..#    ',
  '    #......e.......#    ',
  '    #.e.....*....e.#    ',
  '    #..............#    ',
  '    #ww##ww##ww##ww#    ',
  '                        ',
  '                        ',
]];

export function buildLiftAmbush(req: FloorRequest): FloorMap {
  const v = (req.runSeed + req.floorNumber * 7) & 1;
  const m = buildArenaFromAscii(LIFT_AMBUSH[v], { P: { prop: 'plant_large' }, F: { prop: 'filing_cabinet' }, k: { prop: 'water_cooler' } }, req,
    { roomKind: 'lift_arena', exitsAvailable: true, templateId: 'lift_ambush_' + v });
  return m;
}

// ------------------------------------------------------------------------------------------------
// Default boss floor (the boss team provides real arenas via buildArenaFromAscii): core + big hall.

const BOSS_HALL: string[] = [
  '                                       ',
  '                                       ',
  '    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    ',
  '    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    ',
  '    XooooSSooooooooLLLooooooooCCooX    ',
  '    XoooooooooooooooooooooooooooooX    ',
  '    Xoooooooooooooo@ooooooooooooooX    ',
  '    XoooooooooooooooooooooooooooooX    ',
  '    XXXXXXXXXXXXXXDDDXXXXXXXXXXXXXX    ',
  '    #.............................#    ',
  '    w..e.......e.......e.......e..w    ',
  '    w.............................w    ',
  '    #.....##.......*.......##.....#    ',
  '    w.....##...............##.....w    ',
  '    w.............................w    ',
  '    #..e.........................e#    ',
  '    w......*.......$.......*......w    ',
  '    w.............................w    ',
  '    #..e.........................e#    ',
  '    w.............................w    ',
  '    w.....##...............##.....w    ',
  '    #.....##.......*.......##.....#    ',
  '    w.............................w    ',
  '    w..e.......e.......e.......e..w    ',
  '    #.............................#    ',
  '    ###ww#ww#ww#ww###ww#ww#ww#ww###    ',
  '                                       ',
  '                                       ',
];

export function buildBossArena(req: FloorRequest): FloorMap {
  return buildArenaFromAscii(BOSS_HALL, {}, req, { roomKind: req.floorType === 'boss' ? 'boss' : 'challenge', templateId: 'boss_hall_default' });
}
