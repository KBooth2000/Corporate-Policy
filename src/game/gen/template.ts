// Room template library: compact ASCII authoring format (spec 4.3).
//
// A template is the INTERIOR of a room (walls excluded). Interior sizes are (cells * CELL - 1) tiles, so
// rooms snap to the macro grid and every N/E/S/W door socket (centre of each cell edge) always aligns.
// One authored template yields up to 4 orientations (identity, mirror, and, when allowed, the 90° rotation
// and its mirror). Sockets are derived automatically: a socket is usable when its door apron is clear.
//
// Legend (default; templates may override with their own legend):
//   .  floor            ,  floor (accent material: walkway strip / inlay)   #  structural pillar (WALL)
//   c  cubicle wall tile (low; projectiles pass)                            ~  static water puddle
//   s  enemy spawn hint  $  reward point    *  light slot
//   ?  decor slot (theme pool)   +  cover slot (theme pool; Hot Desking removes many)
//   !  hazard slot (kind/theme pool)   {  event centrepiece slot
//   Props (fixed): see GLYPHS below. Repeated glyphs form one component that is tiled by the prop's footprint
//   (or becomes ONE prop of the component's size for stretchy kinds such as meeting tables and counters).
import type { PropKind, ThemeId } from '../../data/ids';
import type { RoomKind } from '../world-types';
import { T } from '../world-types';
import { MAT, MatId } from './materials';
import { PROP_INFO } from './props';

export const CELL = 8; // macro grid pitch in tiles (wall line + 7 interior tiles)

export type SlotType = 'decor' | 'hazard' | 'cover' | 'centre';
export interface Glyph {
  tile?: number;
  prop?: PropKind;
  mat?: MatId;
  marker?: 'spawn' | 'reward' | 'light';
  slot?: SlotType;
}

export const GLYPHS: Record<string, Glyph> = {
  '.': {}, ',': { mat: MAT.ACCENT }, '#': { tile: T.WALL }, c: { tile: T.CUBICLE }, '~': { tile: T.WATER },
  s: { marker: 'spawn' }, $: { marker: 'reward' }, '*': { marker: 'light' },
  '?': { slot: 'decor' }, '!': { slot: 'hazard' }, '+': { slot: 'cover' }, '{': { slot: 'centre' },
  D: { prop: 'desk' }, L: { prop: 'desk_l' }, h: { prop: 'swivel_chair' }, H: { prop: 'exec_chair' }, a: { prop: 'chair' },
  T: { prop: 'meeting_table' }, R: { prop: 'reception_desk' }, X: { prop: 'exec_desk' },
  o: { prop: 'sofa' }, B: { prop: 'bookshelf' }, p: { prop: 'plant' }, P: { prop: 'plant_large' }, b: { prop: 'bin' }, Y: { prop: 'coat_stand' },
  W: { prop: 'whiteboard' }, V: { prop: 'tv_screen' }, J: { prop: 'projector_screen' }, N: { prop: 'noticeboard' },
  F: { prop: 'filing_cabinet' }, K: { prop: 'photocopier' }, Q: { prop: 'printer' }, w: { prop: 'water_cooler' }, e: { prop: 'fire_extinguisher' },
  Z: { prop: 'server_rack' }, z: { prop: 'shredder' },
  k: { prop: 'canteen_counter' }, m: { prop: 'microwave' }, n: { prop: 'kettle' }, j: { prop: 'knife_block' }, i: { prop: 'sink' }, f: { prop: 'fridge' },
  U: { prop: 'toilet_cubicle' }, u: { prop: 'urinal' }, y: { prop: 'hand_dryer' }, r: { prop: 'mirror' },
  v: { prop: 'vending_machine' }, q: { prop: 'vending_snack' },
  G: { prop: 'pigeonholes' }, g: { prop: 'parcel_cage' }, t: { prop: 'mail_trolley' }, A: { prop: 'sack_pile' }, I: { prop: 'conveyor' },
  O: { prop: 'boiler' }, l: { prop: 'pipe' }, x: { prop: 'toolbox' }, d: { prop: 'ladder' }, M: { prop: 'mop_bucket' }, E: { prop: 'cable_reel' },
  '@': { prop: 'trophy_cabinet' }, '%': { prop: 'putting_green' }, '^': { prop: 'minibar' }, '&': { prop: 'globe_bar' },
  '=': { prop: 'leaderboard_screen' }, '0': { prop: 'sales_gong' },
  C: { prop: 'archive_stack' }, S: { prop: 'safe' }, '9': { prop: 'stock_ticker' }, '8': { prop: 'dartboard' },
  '6': { prop: 'ping_pong' }, '5': { prop: 'beanbag' },
  '1': { prop: 'banner_values' }, '2': { prop: 'ceo_shrine' }, '3': { prop: 'candles' }, '4': { prop: 'ceremonial_lectern' }, '7': { prop: 'stationery_shelf' },
  _: { prop: 'cable_run' }, ';': { prop: 'socket' }, ':': { prop: 'sprinkler' },
  '[': { prop: 'glass_partition' }, '|': { prop: 'hr_cabinet' }, ']': { prop: 'stationery_cupboard' }, '}': { prop: 'fortune_copier' },
};

export type BreachMat = 'plaster' | 'glass' | 'cubicle';

export interface TemplateSrc {
  id: string;
  kind: RoomKind;
  /** Department themes this template belongs to; omit for the shared pool. */
  themes?: ThemeId[];
  rows: string[];
  legend?: Record<string, Glyph>;
  /** Exterior windows allowed on this room's outer walls (default: true except server/toilets/archive). */
  win?: boolean;
  /** Material used if this room takes part in a breach (default by kind). */
  breach?: BreachMat;
  /** Ambient darkness override. */
  dark?: number;
  /** Sprinklers override (default by kind). */
  sprinklers?: boolean;
  /** Allow 90° rotation (default true). */
  rot?: boolean;
  /** Base floor material override. */
  mat?: MatId;
  weight?: number;
}

export interface TplProp { kind: PropKind; x: number; y: number; fw: number; fh: number; facing: 0 | 1 | 2 | 3; wall: boolean }
export interface TplSlot { type: SlotType; x: number; y: number }

export interface Tpl {
  id: string;            // unique per orientation: base id + '/' + orientation
  baseId: string;
  kind: RoomKind;
  themes: ThemeId[] | null;
  cw: number; ch: number; w: number; h: number;
  tiles: Uint8Array;     // local interior tile codes
  mat: Int8Array;        // -1 = room base material
  props: TplProp[];
  slots: TplSlot[];
  spawns: { x: number; y: number }[];
  reward: { x: number; y: number } | null;
  lights: { x: number; y: number }[];
  /** Usable door sockets: key `${side}${cellIndex}` with side N/E/S/W. */
  sockets: Set<string>;
  win: boolean;
  breach: BreachMat;
  dark?: number;
  sprinklers?: boolean;
  mat0?: MatId;
  weight: number;
}

const DEFAULT_BREACH: Partial<Record<RoomKind, BreachMat>> = { meeting: 'glass', manager: 'glass', cubicles: 'cubicle', openplan: 'plaster' };
const NO_WINDOWS: RoomKind[] = ['server', 'toilets', 'archive', 'treasure', 'lift_arena'];

// ---------------------------------------------------------------------------------------------
// Transforms on raw ASCII (props are re-derived from the transformed grid, so footprints follow).

function mirrorRows(rows: string[]): string[] { return rows.map((r) => [...r].reverse().join('')); }
/** Rotate 90° clockwise: new[y][x] = old[h-1-x][y]. */
function rotateRows(rows: string[]): string[] {
  const h = rows.length, w = rows[0].length;
  const out: string[] = [];
  for (let y = 0; y < w; y++) {
    let s = '';
    for (let x = 0; x < h; x++) s += rows[h - 1 - x][y];
    out.push(s);
  }
  return out;
}

/** Door apron for socket on side/cell: the 3 door columns (or rows) x 2 tiles deep. */
export function socketApron(side: 'N' | 'E' | 'S' | 'W', k: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  const c0 = k * CELL + 2;
  for (let i = 0; i < 3; i++) for (let d = 0; d < 2; d++) {
    if (side === 'N') out.push([c0 + i, d]);
    else if (side === 'S') out.push([c0 + i, h - 1 - d]);
    else if (side === 'W') out.push([d, c0 + i]);
    else out.push([w - 1 - d, c0 + i]);
  }
  return out;
}

function parse(src: TemplateSrc, rows: string[], orient: string, rotated: boolean, mirrored: boolean): Tpl {
  const h = rows.length, w = rows[0].length;
  const cw = (w + 1) / CELL, ch = (h + 1) / CELL;
  if (!Number.isInteger(cw) || !Number.isInteger(ch)) throw new Error(`template ${src.id}: bad size ${w}x${h}`);
  for (const r of rows) if (r.length !== w) throw new Error(`template ${src.id}: ragged row "${r}"`);
  const legend = src.legend ? { ...GLYPHS, ...src.legend } : GLYPHS;
  const tiles = new Uint8Array(w * h).fill(T.FLOOR);
  const mat = new Int8Array(w * h).fill(-1);
  const spawns: { x: number; y: number }[] = [];
  const lights: { x: number; y: number }[] = [];
  const slots: TplSlot[] = [];
  let reward: { x: number; y: number } | null = null;
  const propCell: (PropKind | null)[] = new Array(w * h).fill(null);
  const charAt: string[] = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const chr = rows[y][x];
    charAt[y * w + x] = chr;
    const gph = legend[chr];
    if (!gph) throw new Error(`template ${src.id}: unknown glyph '${chr}'`);
    const i = y * w + x;
    if (gph.tile !== undefined) tiles[i] = gph.tile;
    if (gph.mat !== undefined) mat[i] = gph.mat;
    if (gph.marker === 'spawn') spawns.push({ x, y });
    if (gph.marker === 'reward') reward = { x, y };
    if (gph.marker === 'light') lights.push({ x, y });
    if (gph.slot) slots.push({ type: gph.slot, x, y });
    if (gph.prop) propCell[i] = gph.prop;
  }
  // Props: connected components of identical glyph.
  const seen = new Uint8Array(w * h);
  const props: TplProp[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const kind = propCell[i];
    if (!kind || seen[i]) continue;
    const chr = charAt[i];
    // flood component
    let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!; n++;
      const jx = j % w, jy = (j / w) | 0;
      x0 = Math.min(x0, jx); x1 = Math.max(x1, jx); y0 = Math.min(y0, jy); y1 = Math.max(y1, jy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!seen[k] && charAt[k] === chr) { seen[k] = 1; stack.push(k); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw * bh !== n) throw new Error(`template ${src.id}: non-rectangular '${chr}' at ${x},${y}`);
    const info = PROP_INFO[kind];
    const wallish = info.wall || (kind === 'whiteboard' && y0 === 0);
    // Wall-mounted props are only valid on the north wall (3/4 view): drop ones a transform moved elsewhere.
    if (info.wall && (y0 !== 0 || bh !== 1)) continue;
    if (info.stretchy) {
      props.push({ kind, x: x0, y: y0, fw: bw, fh: bh, facing: 0, wall: !!wallish });
      continue;
    }
    // tile by footprint (canonical, else rotated)
    let fw = info.fw, fh = info.fh;
    if (wallish) { fw = Math.min(info.fw, bw); fh = 1; }
    if (bw % fw !== 0 || bh % fh !== 0) {
      if (!wallish && bw % info.fh === 0 && bh % info.fw === 0) { fw = info.fh; fh = info.fw; }
      else if (wallish && bh === 1) { fw = bw; fh = 1; }
      else throw new Error(`template ${src.id}: '${chr}' ${bw}x${bh} not tileable by ${info.fw}x${info.fh}`);
    }
    for (let yy = y0; yy <= y1; yy += fh) for (let xx = x0; xx <= x1; xx += fw)
      props.push({ kind, x: xx, y: yy, fw, fh, facing: fw < fh ? 1 : 0, wall: !!wallish });
  }
  // Wall-mounted props are only valid on the north wall (3/4 view): drop others produced by transforms.
  const kept = props.filter((p) => !p.wall || p.y === 0);
  // Facing heuristics.
  const occ = new Int16Array(w * h).fill(-1);
  kept.forEach((p, idx) => { for (let yy = p.y; yy < p.y + p.fh; yy++) for (let xx = p.x; xx < p.x + p.fw; xx++) occ[yy * w + xx] = idx; });
  const isTable = (k: PropKind) => k === 'desk' || k === 'desk_l' || k === 'exec_desk' || k === 'meeting_table' || k === 'reception_desk';
  const isSeat = (k: PropKind) => k === 'chair' || k === 'swivel_chair' || k === 'exec_chair';
  const neighbourKinds = (p: TplProp, dir: number): PropKind[] => {
    const out: PropKind[] = [];
    const cells: [number, number][] = [];
    if (dir === 0) for (let xx = p.x; xx < p.x + p.fw; xx++) cells.push([xx, p.y + p.fh]);
    if (dir === 2) for (let xx = p.x; xx < p.x + p.fw; xx++) cells.push([xx, p.y - 1]);
    if (dir === 1) for (let yy = p.y; yy < p.y + p.fh; yy++) cells.push([p.x + p.fw, yy]);
    if (dir === 3) for (let yy = p.y; yy < p.y + p.fh; yy++) cells.push([p.x - 1, yy]);
    for (const [cx, cy] of cells) if (cx >= 0 && cy >= 0 && cx < w && cy < h && occ[cy * w + cx] >= 0) out.push(kept[occ[cy * w + cx]].kind);
    return out;
  };
  for (const p of kept) {
    if (p.wall) { p.facing = 0; continue; }
    if (isSeat(p.kind)) {
      for (const d of [2, 0, 1, 3] as const) if (neighbourKinds(p, d).some(isTable)) { p.facing = d; break; }
      continue;
    }
    if (isTable(p.kind) && (p.kind === 'desk' || p.kind === 'desk_l' || p.kind === 'exec_desk')) {
      // the seated side faces the chair
      for (const d of [0, 2, 1, 3] as const) if (neighbourKinds(p, d).some(isSeat)) { p.facing = d; break; }
      continue;
    }
    // against-wall props face away from the wall
    if (p.y === 0) p.facing = 0;
    else if (p.y + p.fh === h) p.facing = 2;
    else if (p.x === 0) p.facing = 1;
    else if (p.x + p.fw === w) p.facing = 3;
    else if (p.fw < p.fh) p.facing = 1;
    else p.facing = 0;
  }
  // Sockets.
  const sockets = new Set<string>();
  const clear = (x: number, y: number) => {
    const i = y * w + x;
    if (tiles[i] !== T.FLOOR) return false;
    if (occ[i] >= 0 && !kept[occ[i]].wall) return false;
    return true;
  };
  const sides: ['N' | 'E' | 'S' | 'W', number][] = [['N', cw], ['S', cw], ['W', ch], ['E', ch]];
  for (const [side, n] of sides) for (let k = 0; k < n; k++) {
    if (socketApron(side, k, w, h).every(([x, y]) => clear(x, y))) sockets.add(side + k);
  }
  return {
    id: src.id + '/' + orient, baseId: src.id, kind: src.kind, themes: src.themes ?? null,
    cw, ch, w, h, tiles, mat, props: kept, slots, spawns, reward, lights, sockets,
    win: src.win ?? !NO_WINDOWS.includes(src.kind),
    breach: src.breach ?? DEFAULT_BREACH[src.kind] ?? 'plaster',
    dark: src.dark, sprinklers: src.sprinklers, mat0: src.mat, weight: src.weight ?? 1,
  };
  void rotated; void mirrored;
}

/** Expand an authored template into all its distinct orientations. */
export function expandTemplate(src: TemplateSrc): Tpl[] {
  const out: Tpl[] = [];
  const seen = new Set<string>();
  const add = (rows: string[], orient: string, rot: boolean, mir: boolean) => {
    const key = rows.join('\n');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(parse(src, rows, orient, rot, mir));
  };
  add(src.rows, 'n', false, false);
  add(mirrorRows(src.rows), 'm', false, true);
  if (src.rot !== false) {
    // A 90° turn puts the template's north wall on the east; that turns wall props into floor-free strips.
    const r = rotateRows(src.rows);
    add(r, 'r', true, false);
    add(mirrorRows(r), 'rm', true, true);
  }
  return out;
}
