// The building core (spec 4.2): lift lobby + stairwell + corridor link. One hand-polished space, reused on
// every floor (mirrored on some floors). It occupies 3x2 macro cells (23x15 interior).
//
// Rows 0-1 are the core block (CORE_WALL: lift shaft / stair core); the three exits sit in its face.
// Exits: stairs (2 tiles), lift (3 tiles), corridor link (2 tiles). The player arrives in the lobby.
import type { ExitKind, PropKind } from '../../data/ids';
import { T } from '../world-types';

export const CORE_CW = 3, CORE_CH = 2;
export const CORE_W = 23, CORE_H = 15;

export interface CoreProp { kind: PropKind; x: number; y: number; fw: number; fh: number; wall?: boolean; facing?: 0 | 1 | 2 | 3; cult?: boolean; plain?: boolean }
export interface CoreExit { kind: ExitKind; x0: number; x1: number } // interior columns of the doorway (inclusive)

// Hand-authored lobby. X = core block; '.' floor; ',' accent inlay (lobby rug/terrazzo band).
export const CORE_ROWS = [
  'XXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXX',
  '.......................',
  '.......................',
  '.......................',
  '.......,,,,,,,,,.......',
  '.......,.......,.......',
  '.......,.......,.......',
  '.......,.......,.......',
  '.......,.......,.......',
  '.......,,,,,,,,,.......',
  '.......................',
  '.......................',
  '.......................',
  '.......................',
];

export const CORE_EXITS: CoreExit[] = [
  { kind: 'stairs', x0: 3, x1: 4 },
  { kind: 'lift', x0: 10, x1: 12 },
  { kind: 'corridor', x0: 18, x1: 19 },
];

/** Hand-placed lobby furniture (interior coordinates). `cult` = only with Act 4 dressing; `plain` = only without. */
export const CORE_PROPS: CoreProp[] = [
  { kind: 'noticeboard', x: 6, y: 2, fw: 2, fh: 1, wall: true, plain: true },
  { kind: 'tv_screen', x: 14, y: 2, fw: 2, fh: 1, wall: true },
  { kind: 'banner_values', x: 6, y: 2, fw: 2, fh: 1, wall: true, cult: true },
  { kind: 'banner_values', x: 15, y: 2, fw: 2, fh: 1, wall: true, cult: true },
  { kind: 'fire_extinguisher', x: 1, y: 2, fw: 1, fh: 1 },
  { kind: 'plant_large', x: 8, y: 2, fw: 1, fh: 1 },
  { kind: 'plant_large', x: 14, y: 2, fw: 1, fh: 1 },
  { kind: 'bin', x: 21, y: 2, fw: 1, fh: 1 },
  { kind: 'sofa', x: 9, y: 11, fw: 2, fh: 1, facing: 2, plain: true },
  { kind: 'sofa', x: 12, y: 11, fw: 2, fh: 1, facing: 2, plain: true },
  { kind: 'plant', x: 11, y: 11, fw: 1, fh: 1, plain: true },
  { kind: 'ceo_shrine', x: 10, y: 10, fw: 3, fh: 2, facing: 2, cult: true },
  { kind: 'candles', x: 9, y: 11, fw: 1, fh: 1, cult: true },
  { kind: 'candles', x: 13, y: 11, fw: 1, fh: 1, cult: true },
  { kind: 'plant', x: 0, y: 14, fw: 1, fh: 1 },
  { kind: 'plant', x: 22, y: 14, fw: 1, fh: 1 },
];

/** Interior tile code for a core glyph. */
export function coreTile(ch: string): number { return ch === 'X' ? T.CORE_WALL : T.CORE_FLOOR; }

/** Sockets the core offers (north is the core block). */
export const CORE_SOCKETS = ['W0', 'W1', 'E0', 'E1', 'S0', 'S1', 'S2'];

/** Interior tiles that must stay clear (exit approaches + arrival point). */
export function coreKeepClear(): [number, number][] {
  const out: [number, number][] = [];
  for (const e of CORE_EXITS) for (let x = e.x0 - 1; x <= e.x1 + 1; x++) for (let y = 2; y <= 4; y++) out.push([x, y]);
  for (let y = 6; y <= 8; y++) for (let x = 9; x <= 13; x++) out.push([x, y]);
  return out;
}
