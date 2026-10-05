// CONTRACT between the procedural generator (src/game/gen/*) and gameplay.
// Coordinates: tiles are 16x16 px. "px" values are world pixels.
import type { Act, ExitKind, FloorType, PropKind, ThemeId, ExecType } from '../data/ids';
import type { Vec } from '../core/math';

export const TILE = 16;

/** Tile codes stored in FloorMap.tiles. */
export const T = {
  VOID: 0,          // outside the building; solid
  FLOOR: 1,         // walkable
  WALL: 2,          // structural wall; solid; indestructible
  PARTITION: 3,     // plasterboard partition; solid; breachable
  GLASS: 4,         // glass partition wall; solid; breachable; shatters (hazard)
  CUBICLE: 5,       // low cubicle wall; solid for movement; projectiles pass; breachable
  WINDOW: 6,        // exterior window; solid; defenestration target
  WINDOW_SEALED: 7, // Act 4 curtain wall: needs weakening (hit) before defenestration
  WINDOW_BROKEN: 8, // smashed exterior window: open edge (fall/wind hazard); solid for walking (edge), executions use it
  DOOR: 9,          // doorway between rooms (open/closed state lives in DoorDef)
  RUBBLE: 10,       // destroyed partition: walkable floor with debris
  CORE_WALL: 11,    // building core walls: solid; never breachable
  CORE_FLOOR: 12,   // core floor (lift lobby / stair landing); walkable
  WATER: 13,        // wet floor overlay is dynamic; this is a static puddle/plant-room water; walkable (slippery)
  PIT: 14,          // open drop (rooftop edges / boss arenas); walkable=no; fall kills
} as const;
export type TileCode = (typeof T)[keyof typeof T];

export const SOLID_TILES = new Set<number>([T.VOID, T.WALL, T.PARTITION, T.GLASS, T.CUBICLE, T.WINDOW, T.WINDOW_SEALED, T.WINDOW_BROKEN, T.CORE_WALL]);
/** Tiles that block projectiles. Cubicle walls are low, so projectiles pass over them. */
export const PROJECTILE_BLOCKING = new Set<number>([T.VOID, T.WALL, T.PARTITION, T.GLASS, T.WINDOW, T.WINDOW_SEALED, T.CORE_WALL]);
export const BREACHABLE_TILES = new Set<number>([T.PARTITION, T.GLASS, T.CUBICLE]);

export type RoomKind =
  | 'core' | 'openplan' | 'cubicles' | 'meeting' | 'kitchen' | 'print' | 'server' | 'manager' | 'toilets'
  | 'shop' | 'treasure' | 'event' | 'challenge' | 'lift_arena' | 'director' | 'boss' | 'corridor' | 'reception' | 'archive';

export interface LightDef {
  x: number; y: number;            // px
  radius: number;                  // px
  color: string;                   // hex
  intensity: number;               // 0..1.5
  flicker?: 'fluorescent' | 'spark' | 'candle' | 'emergency' | 'none';
}

export interface PropDef {
  id: number;
  kind: PropKind;
  /** Position of the prop's base centre (px) — y is used for depth sorting. */
  x: number; y: number;
  /** Collision footprint in px, centred on (x, y - h/2) ... see `footprint()` helper. */
  w: number; h: number;
  solid: boolean;
  variant: number;                 // art variant index
  roomId: number;
  /** Rotation/facing for art: 0 down,1 right,2 up,3 left. */
  facing: 0 | 1 | 2 | 3;
  /** Optional execution type if this prop can host an environmental execution. */
  exec?: ExecType;
  /** Optional: prop is a hazard (gameplay looks up behaviour by kind). */
  hazard?: boolean;
  /** For wall-mounted props (whiteboards/banners) – drawn on wall face, no collision. */
  wallMounted?: boolean;
}

export interface DoorDef {
  id: number;
  /** Tile coordinates of the door's first tile. Doors are `len` tiles along the wall. */
  tx: number; ty: number;
  orient: 'h' | 'v';  // 'h' = door in a horizontal wall (passage goes N/S); 'v' = in a vertical wall (passage E/W)
  len: number;        // tiles (2 or 3)
  roomA: number; roomB: number;
}

export interface BreachDef {
  id: number;
  roomA: number; roomB: number;
  /** All breachable wall tiles of this segment (tile coords). */
  tiles: [number, number][];
  material: 'plaster' | 'glass' | 'cubicle';
}

export interface SpawnPoint { x: number; y: number; }

export interface RoomDef {
  id: number;
  kind: RoomKind;
  templateId: string;
  /** Interior bounds (tiles, walls excluded). */
  tx: number; ty: number; tw: number; th: number;
  isCritical: boolean;            // on the critical path from the core
  isSide: boolean;                // optional loot side room
  neighbours: number[];           // room ids connected by doors
  doorIds: number[];
  /** Candidate enemy spawn points (px), already validated walkable & away from doors. */
  spawnPoints: SpawnPoint[];
  /** Where to drop the room/floor reward (px). */
  rewardPoint: Vec;
  /** Relative size weight for splitting enemy_budget (spec 5.5). */
  sizeWeight: number;
  lights: LightDef[];
  /** Ambient darkness 0 (bright) .. 1 (pitch black). Server rooms ~0.55. */
  darkness: number;
  /** Elite/manager arena flag (manager's office elite room). */
  eliteRoom?: boolean;
  /** Has exterior window tiles on its perimeter (defenestration possible). */
  hasWindows: boolean;
  /** Sprinklers present (room-wide). */
  sprinklers: boolean;
}

export interface ExitDef {
  kind: ExitKind;
  /** Interaction point in front of the exit (px). */
  x: number; y: number;
  /** Whether this exit is offered on this floor (decided by run logic, passed in the request). */
  available: boolean;
}

export interface FloorRequest {
  runSeed: number;
  floorNumber: number;     // 1..20
  act: Act;
  wing: number;            // 0 = main floor; >0 lateral wings reached by corridor (spec 3.3)
  floorType: FloorType;
  theme: ThemeId;
  alarm: boolean;          // spec 4.1 alarm floor
  exits: ExitKind[];       // exits that will be available once cleared
  platform: 'pc' | 'android';
  hotDesking: boolean;     // Performance Review modifier: less cover
  /** Act 4 cult dressing on/off (on for act 4). */
  cultDressing: boolean;
}

export interface FloorMap {
  req: FloorRequest;
  /** Tiles in the map. */
  w: number; h: number;
  tiles: Uint8Array;           // TileCode per tile, index y*w+x
  roomOf: Int16Array;          // room id per tile (-1 for walls/void)
  rooms: RoomDef[];
  doors: DoorDef[];
  breaches: BreachDef[];
  props: PropDef[];
  exits: ExitDef[];
  coreRoomId: number;
  /** Player arrival point in the core (px). */
  spawn: Vec;
  /** Generation diagnostics. */
  attempts: number;
  /** Floor material per tile for the renderer (0..n theme-specific). */
  material: Uint8Array;
  /** Decorative floor decals placed at generation (stains, rugs, logos) — cosmetic only. */
  decor: { kind: string; x: number; y: number; variant: number }[];
}

export const tileAt = (m: FloorMap, tx: number, ty: number): number =>
  tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? T.VOID : m.tiles[ty * m.w + tx];

export const roomAtPx = (m: FloorMap, x: number, y: number): number => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return -1;
  return m.roomOf[ty * m.w + tx];
};

/** Prop collision rect in px (axis aligned), anchored at base centre. */
export function footprint(p: PropDef): { x: number; y: number; w: number; h: number } {
  return { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
}
