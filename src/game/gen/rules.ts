// Floor-type rules shared by the generator and the validator.
import type { FloorRequest } from '../world-types';

export const SPECIAL_FLOORS = new Set(['shop', 'treasure', 'event']);

/** Critical-path length bounds (rooms after the core) for a request (spec 4.1: 4-7 rooms). */
export function critBounds(req: FloorRequest): [number, number] {
  if (SPECIAL_FLOORS.has(req.floorType)) return [1, 2];
  if (req.floorType === 'lift_ambush' || req.floorType === 'boss') return [1, 1];
  const f = req.floorNumber;
  let lo = 4, hi = 4;
  if (f >= 3) hi = 5;
  if (f >= 6) hi = 6;
  if (f >= 11) { lo = 5; hi = 6; }
  if (f >= 16) { lo = 5; hi = 7; }
  if (req.floorType === 'elite') hi = Math.max(lo, hi - 1);
  return [lo, hi];
}
