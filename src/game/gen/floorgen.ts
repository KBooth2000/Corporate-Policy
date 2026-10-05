// PROCEDURAL FLOOR GENERATOR CONTRACT (spec 4.4). generateFloor() must be pure & deterministic
// for a given FloorRequest. Placeholder: a core + 2 rooms in a row (replaced by the generator module).
import { Rng } from '../../core/rng';
import { FloorMap, FloorRequest, RoomDef, T, TILE } from '../world-types';

export function generateFloor(req: FloorRequest): FloorMap {
  const rng = Rng.from(req.runSeed, req.floorNumber, req.wing, 'layout');
  const w = 80, h = 24;
  const tiles = new Uint8Array(w * h).fill(T.VOID);
  const roomOf = new Int16Array(w * h).fill(-1);
  const rooms: RoomDef[] = [];
  const mk = (id: number, x0: number, kind: RoomDef['kind']) => {
    const rw = 24, rh = 18, y0 = 3;
    for (let y = y0 - 1; y <= y0 + rh; y++) for (let x = x0 - 1; x <= x0 + rw; x++) {
      const edge = y === y0 - 1 || y === y0 + rh || x === x0 - 1 || x === x0 + rw;
      tiles[y * w + x] = edge ? (id === 0 ? T.CORE_WALL : y === y0 - 1 ? T.WINDOW : T.WALL) : id === 0 ? T.CORE_FLOOR : T.FLOOR;
      if (!edge) roomOf[y * w + x] = id;
    }
    const spawnPoints = [];
    for (let i = 0; i < 12; i++) spawnPoints.push({ x: (x0 + 3 + rng.int(0, rw - 6)) * TILE, y: (y0 + 3 + rng.int(0, rh - 6)) * TILE });
    rooms.push({ id, kind, templateId: 'stub', tx: x0, ty: y0, tw: rw, th: rh, isCritical: true, isSide: false, neighbours: [], doorIds: [], spawnPoints, rewardPoint: { x: (x0 + rw / 2) * TILE, y: (y0 + rh / 2) * TILE }, sizeWeight: 1, lights: [], darkness: 0, hasWindows: true, sprinklers: false });
  };
  mk(0, 2, 'core'); mk(1, 28, 'openplan'); mk(2, 54, 'openplan');
  const doors = [0, 1].map((i) => {
    const x = 2 + 24 + i * 26;
    for (let y = 10; y < 13; y++) { tiles[y * w + x] = T.DOOR; tiles[y * w + x + 1] = T.DOOR; }
    rooms[i].neighbours.push(i + 1); rooms[i + 1].neighbours.push(i);
    rooms[i].doorIds.push(i); rooms[i + 1].doorIds.push(i);
    return { id: i, tx: x, ty: 10, orient: 'v' as const, len: 3, roomA: i, roomB: i + 1 };
  });
  return {
    req, w, h, tiles, roomOf, rooms, doors, breaches: [], props: [],
    exits: req.exits.map((k, i) => ({ kind: k, x: (6 + i * 6) * TILE, y: 5 * TILE, available: true })),
    coreRoomId: 0, spawn: { x: 14 * TILE, y: 14 * TILE }, attempts: 1, material: new Uint8Array(w * h), decor: [],
  };
}
