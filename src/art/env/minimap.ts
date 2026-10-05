// HUD minimap: rooms as blocks, fog of war, current room highlight, cleared state, doors and exits.
import type { FloorMap } from '../../game/world-types';
import { T, TILE } from '../../game/world-types';
import { makeCanvas, ctx2d, rect, px } from '../../render/canvas';

/** Scale: 2 px per 3 tiles would blur shapes; we use 1 px per tile plus a 2 px border. */
export function buildMinimap(map: FloorMap, visited: Set<number>, current: number, cleared: Set<number>): HTMLCanvasElement {
  const S = 1, B = 2;
  const c = makeCanvas(map.w * S + B * 2, map.h * S + B * 2);
  const g = ctx2d(c);
  g.fillStyle = 'rgba(10,12,18,0.72)';
  g.fillRect(0, 0, c.width, c.height);
  // a room is shown if visited, or adjacent (through a door) to a visited room (silhouette only)
  const known = new Set<number>(visited);
  const hinted = new Set<number>();
  for (const r of visited) for (const n of map.rooms[r]?.neighbours ?? []) if (!known.has(n)) hinted.add(n);
  known.add(map.coreRoomId);
  for (const r of map.rooms) {
    const vis = known.has(r.id), hint = hinted.has(r.id);
    if (!vis && !hint) continue;
    let fill: string, edge: string;
    if (r.id === current) { fill = '#5ec8ff'; edge = '#d8f4ff'; }
    else if (r.kind === 'core') { fill = '#7a8a96'; edge = '#c0ccd4'; }
    else if (!vis) { fill = 'rgba(120,130,150,0.25)'; edge = '#5a6474'; }
    else if (cleared.has(r.id)) { fill = '#3a6a4a'; edge = '#7ac08a'; }
    else { fill = '#7a3434'; edge = '#d06060'; }
    const x = B + r.tx * S, y = B + r.ty * S, w = r.tw * S, h = r.th * S;
    rect(g, x, y, w, h, fill);
    rect(g, x - 1, y - 1, w + 2, 1, edge); rect(g, x - 1, y + h, w + 2, 1, edge);
    rect(g, x - 1, y, 1, h, edge); rect(g, x + w, y, 1, h, edge);
    if (r.eliteRoom && vis) { rect(g, x + (w >> 1) - 1, y + (h >> 1) - 1, 3, 3, '#ffc53d'); }
  }
  for (const d of map.doors) {
    if (!(known.has(d.roomA) || known.has(d.roomB))) continue;
    for (let i = 0; i < d.len; i++) {
      const x = d.orient === 'h' ? d.tx + i : d.tx, y = d.orient === 'h' ? d.ty : d.ty + i;
      px(g, B + x * S, B + y * S, '#e8e8e8');
    }
  }
  // breach segments of known rooms (hint where walls can be smashed)
  for (const b of map.breaches) if (known.has(b.roomA) && known.has(b.roomB)) for (const [x, y] of b.tiles) if (map.tiles[y * map.w + x] === T.RUBBLE) px(g, B + x * S, B + y * S, '#c8b080');
  // exits
  for (const e of map.exits) {
    const x = B + Math.floor(e.x / TILE) * S, y = B + Math.floor(e.y / TILE) * S - 1;
    const col = !e.available ? '#4a4a4a' : e.kind === 'stairs' ? '#5af07a' : e.kind === 'lift' ? '#ffb040' : '#5ec8ff';
    rect(g, x - 1, y - 1, 3, 2, col);
  }
  return c;
}
