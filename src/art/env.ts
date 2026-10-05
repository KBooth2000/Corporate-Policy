// ENVIRONMENT ART CONTRACT (spec 4.3 theming, 9.1 palettes). Tiles, walls, props, doors, exits.
import type { FloorMap, PropDef } from '../game/world-types';
import { T, TILE } from '../game/world-types';
import type { Sprite } from '../render/canvas';
import { makeCanvas, ctx2d, paint, sprite, rect } from '../render/canvas';
import type { ExitKind } from '../data/ids';

export type PropState = 'intact' | 'damaged' | 'destroyed' | 'active' | 'used';
export type DoorState = 'open' | 'closed' | 'locked';

// ----------------------------------------------------------------------------
// Placeholder implementation (replaced by the environment art module).
const COLS: Record<number, string> = { [T.FLOOR]: '#9c927e', [T.CORE_FLOOR]: '#7d8a8f', [T.WALL]: '#d8d2c4', [T.CORE_WALL]: '#5c6870', [T.PARTITION]: '#c9c2b0', [T.GLASS]: '#9fd0e6', [T.CUBICLE]: '#7a7f8a', [T.WINDOW]: '#6fb6e6', [T.WINDOW_SEALED]: '#4a90c0', [T.RUBBLE]: '#8a8072', [T.DOOR]: '#9c927e', [T.VOID]: '#101014', [T.WATER]: '#4a7fb0', [T.PIT]: '#000000', [T.WINDOW_BROKEN]: '#202838' };

/** Render the full static floor background (floor, walls, static decor). */
export function renderFloorBase(map: FloorMap): HTMLCanvasElement {
  const c = makeCanvas(map.w * TILE, map.h * TILE);
  redrawTiles(map, c, 0, 0, map.w - 1, map.h - 1);
  return c;
}

/** Re-render a tile region after destruction (breach, broken window). Inclusive tile bounds. */
export function redrawTiles(map: FloorMap, canvas: HTMLCanvasElement, tx0: number, ty0: number, tx1: number, ty1: number): void {
  const g = ctx2d(canvas);
  for (let y = Math.max(0, ty0); y <= Math.min(map.h - 1, ty1); y++)
    for (let x = Math.max(0, tx0); x <= Math.min(map.w - 1, tx1); x++) {
      const t = map.tiles[y * map.w + x];
      rect(g, x * TILE, y * TILE, TILE, TILE, COLS[t] ?? '#ff00ff');
    }
}

/** Prop sprite with origin at the prop's base centre. */
export function propSprite(p: PropDef, state: PropState = 'intact'): Sprite {
  const w = Math.max(6, p.w), h = Math.max(6, p.h + 10);
  return sprite(paint(w, h, (g) => rect(g, 0, 0, w, h, state === 'destroyed' ? '#55524c' : '#6a7480')), w / 2, h);
}

/** Door sprite covering the door tiles (origin top-left of the first tile). */
export function doorSprite(orient: 'h' | 'v', len: number, state: DoorState): Sprite {
  const w = orient === 'h' ? len * TILE : TILE, h = orient === 'h' ? TILE : len * TILE;
  return sprite(paint(w, h, (g) => rect(g, 0, 0, w, h, state === 'open' ? 'rgba(0,0,0,0)' : state === 'locked' ? '#a03030' : '#706050')), 0, 0);
}

/** Exit doors in the building core (stairs / lift / corridor). Origin at base centre. */
export function exitSprite(kind: ExitKind, available: boolean, open: boolean): Sprite {
  return sprite(paint(32, 32, (g) => rect(g, 0, 0, 32, 32, !available ? '#333' : open ? '#3a8a4a' : kind === 'lift' ? '#808890' : '#605040')), 16, 32);
}
