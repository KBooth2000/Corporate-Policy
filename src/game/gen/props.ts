// Prop metadata used by the generator (footprints, collision, hazard/execution flags).
// Pure data: no DOM. Gameplay may import PROP_INFO to look up defaults by kind.
import type { ExecType, PropKind } from '../../data/ids';

export interface PropInfo {
  /** Footprint in tiles in canonical orientation (facing 0). */
  fw: number; fh: number;
  /** Collision box in px (centred horizontally on the footprint, anchored at its bottom). Defaults to the footprint. */
  cw?: number; ch?: number;
  solid: boolean;
  hazard?: boolean;
  exec?: ExecType;
  /** Drawn on the north wall face; no collision. Only valid in the first interior row. */
  wall?: boolean;
  /** One prop per connected component of any rectangular size (tables, counters, cable runs). */
  stretchy?: boolean;
  /** Counts as cover (removed by the Hot Desking modifier). */
  cover?: boolean;
  /** Interactable (shop, event, treasure). */
  interact?: boolean;
}

export const PROP_INFO: Record<PropKind, PropInfo> = {
  desk: { fw: 2, fh: 1, solid: true, cover: true },
  desk_l: { fw: 2, fh: 2, solid: true, cover: true },
  reception_desk: { fw: 3, fh: 1, solid: true, stretchy: true, cover: true },
  meeting_table: { fw: 3, fh: 2, solid: true, stretchy: true, cover: true },
  exec_desk: { fw: 3, fh: 2, solid: true, stretchy: true, cover: true },
  chair: { fw: 1, fh: 1, cw: 10, ch: 8, solid: false },
  swivel_chair: { fw: 1, fh: 1, cw: 10, ch: 8, solid: true, hazard: true },
  exec_chair: { fw: 1, fh: 1, cw: 12, ch: 10, solid: true },
  sofa: { fw: 2, fh: 1, solid: true, stretchy: true, cover: true },
  bookshelf: { fw: 2, fh: 1, solid: true, cover: true },
  plant: { fw: 1, fh: 1, cw: 10, ch: 8, solid: true },
  plant_large: { fw: 1, fh: 1, cw: 12, ch: 10, solid: true, cover: true },
  bin: { fw: 1, fh: 1, cw: 8, ch: 6, solid: false },
  coat_stand: { fw: 1, fh: 1, cw: 6, ch: 6, solid: true },
  whiteboard: { fw: 2, fh: 1, solid: true, cover: true },
  projector_screen: { fw: 3, fh: 1, solid: false, wall: true },
  tv_screen: { fw: 2, fh: 1, solid: false, wall: true },
  cubicle_wall: { fw: 1, fh: 1, solid: true, cover: true },
  pigeonholes: { fw: 2, fh: 1, solid: true, cover: true },
  parcel_cage: { fw: 2, fh: 2, solid: true, cover: true },
  mail_trolley: { fw: 1, fh: 1, cw: 14, ch: 10, solid: true, cover: true },
  sack_pile: { fw: 2, fh: 1, solid: true, cover: true },
  toolbox: { fw: 1, fh: 1, cw: 10, ch: 6, solid: false },
  ladder: { fw: 1, fh: 1, cw: 12, ch: 8, solid: true },
  mop_bucket: { fw: 1, fh: 1, cw: 10, ch: 8, solid: false },
  trophy_cabinet: { fw: 2, fh: 1, solid: true, cover: true },
  putting_green: { fw: 3, fh: 1, solid: false, stretchy: true },
  minibar: { fw: 1, fh: 1, solid: true },
  globe_bar: { fw: 1, fh: 1, cw: 12, ch: 10, solid: true },
  leaderboard_screen: { fw: 3, fh: 1, solid: false, wall: true },
  sales_gong: { fw: 1, fh: 1, cw: 14, ch: 6, solid: true },
  archive_stack: { fw: 1, fh: 1, solid: true, stretchy: true, cover: true },
  conveyor: { fw: 3, fh: 1, solid: true, stretchy: true, cover: true },
  boiler: { fw: 2, fh: 2, solid: true, cover: true },
  pipe: { fw: 1, fh: 1, solid: true, stretchy: true },
  helipad_light: { fw: 1, fh: 1, cw: 6, ch: 6, solid: false },
  vending_snack: { fw: 2, fh: 1, solid: true, cover: true, interact: true },
  canteen_counter: { fw: 1, fh: 1, solid: true, stretchy: true, cover: true },
  fridge: { fw: 1, fh: 1, solid: true },
  kettle: { fw: 1, fh: 1, solid: true },
  knife_block: { fw: 1, fh: 1, solid: true },
  sink: { fw: 1, fh: 1, solid: true },
  toilet_cubicle: { fw: 2, fh: 2, solid: true },
  urinal: { fw: 1, fh: 1, cw: 10, ch: 6, solid: true },
  mirror: { fw: 2, fh: 1, solid: false, wall: true },
  banner_values: { fw: 2, fh: 1, solid: false, wall: true },
  ceo_shrine: { fw: 3, fh: 2, solid: true, cover: true },
  candles: { fw: 1, fh: 1, cw: 8, ch: 6, solid: false },
  ceremonial_lectern: { fw: 1, fh: 1, cw: 12, ch: 8, solid: true },
  stationery_shelf: { fw: 2, fh: 1, solid: true, cover: true },
  safe: { fw: 1, fh: 1, solid: true, cover: true },
  stock_ticker: { fw: 3, fh: 1, solid: false, wall: true },
  dartboard: { fw: 1, fh: 1, solid: false, wall: true },
  ping_pong: { fw: 3, fh: 2, solid: true, cover: true },
  beanbag: { fw: 1, fh: 1, cw: 12, ch: 8, solid: true },
  cable_reel: { fw: 1, fh: 1, cw: 12, ch: 8, solid: true },
  glass_partition: { fw: 1, fh: 1, cw: 16, ch: 4, solid: true, hazard: true, cover: true },
  printer: { fw: 1, fh: 1, cw: 14, ch: 10, solid: true, hazard: true, exec: 'photocopier' },
  water_cooler: { fw: 1, fh: 1, cw: 10, ch: 8, solid: true, hazard: true, exec: 'water_cooler' },
  fire_extinguisher: { fw: 1, fh: 1, cw: 6, ch: 4, solid: false, hazard: true },
  filing_cabinet: { fw: 1, fh: 1, cw: 14, ch: 10, solid: true, hazard: true, exec: 'filing_cabinet', cover: true },
  sprinkler: { fw: 1, fh: 1, solid: false, hazard: true, wall: true },
  cable_run: { fw: 1, fh: 1, solid: false, hazard: true, stretchy: true },
  socket: { fw: 1, fh: 1, cw: 6, ch: 6, solid: false, hazard: true },
  photocopier: { fw: 2, fh: 1, solid: true, exec: 'photocopier', cover: true },
  server_rack: { fw: 1, fh: 1, solid: true, hazard: true, exec: 'server_rack', cover: true },
  shredder: { fw: 1, fh: 1, cw: 12, ch: 8, solid: true, exec: 'shredder' },
  microwave: { fw: 1, fh: 1, solid: true, exec: 'microwave' },
  hand_dryer: { fw: 1, fh: 1, solid: false, exec: 'hand_dryer', wall: true },
  hr_cabinet: { fw: 1, fh: 1, solid: true, interact: true },
  vending_machine: { fw: 2, fh: 1, solid: true, exec: 'vending_machine', interact: true, cover: true },
  noticeboard: { fw: 2, fh: 1, solid: false, wall: true },
  fortune_copier: { fw: 2, fh: 1, solid: true, interact: true },
  stationery_cupboard: { fw: 3, fh: 1, solid: true, interact: true },
  exit_stairs: { fw: 2, fh: 1, solid: false, wall: true },
  exit_lift: { fw: 2, fh: 1, solid: false, wall: true },
  exit_corridor: { fw: 2, fh: 1, solid: false, wall: true },
};

export const HAZARD_KINDS: PropKind[] = (Object.keys(PROP_INFO) as PropKind[]).filter((k) => PROP_INFO[k].hazard);
export const EXEC_KINDS: PropKind[] = (Object.keys(PROP_INFO) as PropKind[]).filter((k) => PROP_INFO[k].exec);
