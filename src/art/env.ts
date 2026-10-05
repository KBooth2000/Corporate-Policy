// ENVIRONMENT ART CONTRACT (spec 4.3 theming, 9.1 palettes). Tiles, walls, props, doors, exits, minimap.
// Implementation lives in src/art/env/*. All art is procedural and cached.
//
// Usage (gameplay):
//   const base = renderFloorBase(map);              // once per floor; draw at world (0,0)
//   redrawTiles(map, base, tx0, ty0, tx1, ty1);     // after breaches (tiles -> RUBBLE) / broken windows
//   drawSprite(g, propSprite(p, state, frame), p.x, p.y);   // origin = base centre; depth-sort by p.y
//   drawSprite(g, doorSprite(d.orient, d.len, state), d.tx * TILE, d.ty * TILE);
//   drawSprite(g, exitSprite(e.kind, e.available, open), e.x, e.y);
//   const mm = renderMinimap(map, visited, currentRoom, cleared);
import type { FloorMap, PropDef } from '../game/world-types';
import type { Sprite } from '../render/canvas';
import type { Act, ExitKind, ThemeId } from '../data/ids';
import { renderBase, redrawRegion, skinFor } from './env/tiles';
import { getSkin, Skin } from './env/skin';
import { buildPropSprite, PropState as PS } from './env/props';
import { buildDoorSprite, buildExitSprite, DoorState as DS } from './env/doors';
import { buildMinimap } from './env/minimap';

export type PropState = PS;
export type DoorState = DS;

let active: Skin = getSkin('reception', 1, 1);

/** Select the department skin used by propSprite/doorSprite/exitSprite (renderFloorBase does this for you). */
export function setEnvSkin(theme: ThemeId, act: Act, floorNumber = 6): void { active = getSkin(theme, act, floorNumber); }

/** Render the full static floor background (floor, walls, windows, exterior, decals). Also selects the skin. */
export function renderFloorBase(map: FloorMap): HTMLCanvasElement {
  active = skinFor(map);
  return renderBase(map);
}

/** Re-render a tile region after destruction (breach, broken window). Inclusive tile bounds; neighbours' wall faces,
 *  shadows and parapets are refreshed automatically. */
export function redrawTiles(map: FloorMap, canvas: HTMLCanvasElement, tx0: number, ty0: number, tx1: number, ty1: number): void {
  redrawRegion(map, canvas, tx0, ty0, tx1, ty1);
}

/** Prop sprite with origin at the prop's base centre. `frame` (optional) selects animation frames for
 *  blinking LEDs, sparks, smoke and candle flicker (cycle 0..3 at ~6-8 fps). */
export function propSprite(p: PropDef, state: PropState = 'intact', frame = 0): Sprite {
  return buildPropSprite(p, state, frame, active);
}

/** Door sprite covering the door tiles (origin top-left of the first tile). open = frame only; closed = doors;
 *  locked = security shutter with a red lamp (room sealed during combat). */
export function doorSprite(orient: 'h' | 'v', len: number, state: DoorState): Sprite {
  return buildDoorSprite(orient, len, state, active);
}

/** Exit doors in the building core (stairs / lift / corridor). Origin at base centre (= ExitDef x,y).
 *  available=false shows OUT OF ORDER tape; open=true shows the unlocked/open exit (floor cleared). */
export function exitSprite(kind: ExitKind, available: boolean, open: boolean): Sprite {
  return buildExitSprite(kind, available, open, active);
}

/** HUD minimap (1 px per tile + 2 px border). Rooms: current (blue), cleared (green), visited uncleared (red),
 *  known-but-unvisited neighbours (ghost outline). Doors, exits and opened breaches are marked. */
export function renderMinimap(map: FloorMap, visited: Set<number>, current: number, cleared: Set<number>): HTMLCanvasElement {
  return buildMinimap(map, visited, current, cleared);
}
