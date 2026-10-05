// Department theme rules for the generator (spec 4.3 theming, 4.4 step 5-6). Pure data.
import type { PropKind, ThemeId } from '../../data/ids';
import type { RoomKind } from '../world-types';
import { MAT, MatId } from './materials';

export interface ThemeGen {
  /** Relative weights of room kinds on this department's floors. */
  kinds: Partial<Record<RoomKind, number>>;
  /** Pools used to fill template slots. */
  decor: PropKind[];
  cover: PropKind[];
  hazard: PropKind[];
  /** Floor material override for carpet-type rooms (open plan, corridors, cubicles, meetings). */
  carpetMat?: MatId;
  /** Cosmetic floor decals scattered on this department's floors. */
  decals: string[];
}

const BASE_DECOR: PropKind[] = ['plant', 'bin', 'coat_stand', 'plant', 'bin'];
const BASE_COVER: PropKind[] = ['filing_cabinet', 'plant_large', 'archive_stack'];
const BASE_HAZARD: PropKind[] = ['water_cooler', 'fire_extinguisher', 'filing_cabinet', 'printer', 'socket'];

export const THEME_GEN: Record<ThemeId, ThemeGen> = {
  reception: { kinds: { reception: 2.5, openplan: 2, meeting: 2, kitchen: 1.2, toilets: 1, corridor: 1.5, cubicles: 1.5, manager: 1, print: 0.8, archive: 0.4, server: 0.3 },
    decor: ['plant', 'plant_large', 'coat_stand', 'bin'], cover: ['plant_large', 'filing_cabinet'], hazard: ['water_cooler', 'fire_extinguisher', 'glass_partition', 'filing_cabinet'], decals: ['rug', 'logo', 'stain'] },
  postroom: { kinds: { openplan: 3, archive: 2.5, print: 2, corridor: 1.5, cubicles: 1.5, kitchen: 1, toilets: 1, manager: 1, meeting: 0.5, server: 0.3 },
    decor: ['bin', 'mail_trolley', 'plant'], cover: ['mail_trolley', 'filing_cabinet', 'archive_stack'], hazard: ['fire_extinguisher', 'printer', 'water_cooler', 'socket'], carpetMat: MAT.LINO, decals: ['tape', 'papers', 'scuff', 'parcel_tape'] },
  facilities: { kinds: { server: 2.5, openplan: 2, archive: 1.5, corridor: 1.5, kitchen: 1, toilets: 1, manager: 1, cubicles: 1.2, meeting: 0.8, print: 0.6 },
    decor: ['mop_bucket', 'toolbox', 'bin', 'ladder'], cover: ['cable_reel', 'filing_cabinet', 'archive_stack'], hazard: ['fire_extinguisher', 'socket', 'water_cooler', 'filing_cabinet'], carpetMat: MAT.CONCRETE, decals: ['tape', 'oil', 'grate', 'scuff'] },
  it: { kinds: { openplan: 2.5, server: 2.5, cubicles: 2, print: 1.2, meeting: 1.2, manager: 1, kitchen: 1, corridor: 1, toilets: 0.8, archive: 0.4 },
    decor: ['bin', 'cable_reel', 'plant'], cover: ['cable_reel', 'filing_cabinet', 'archive_stack'], hazard: ['socket', 'printer', 'water_cooler', 'fire_extinguisher'], decals: ['cable', 'stain', 'grate', 'papers'] },
  sales: { kinds: { openplan: 3.5, cubicles: 2, meeting: 1.5, manager: 1.5, kitchen: 1, corridor: 1, toilets: 0.8, print: 1, server: 0.3, archive: 0.3 },
    decor: ['plant', 'bin', 'coat_stand', 'sales_gong'], cover: ['plant_large', 'filing_cabinet'], hazard: ['water_cooler', 'printer', 'fire_extinguisher', 'socket'], decals: ['logo', 'stain', 'confetti', 'rug'] },
  marketing: { kinds: { openplan: 3.5, meeting: 2, cubicles: 1.5, kitchen: 1.2, print: 1.2, manager: 1, corridor: 1, toilets: 0.8, server: 0.3 },
    decor: ['plant', 'beanbag', 'bin', 'plant_large'], cover: ['beanbag', 'plant_large'], hazard: ['water_cooler', 'fire_extinguisher', 'socket', 'printer'], decals: ['confetti', 'rug', 'logo', 'paint'] },
  customerservice: { kinds: { cubicles: 3.5, openplan: 2.5, meeting: 1, kitchen: 1.2, manager: 1, corridor: 1, toilets: 1, print: 0.8, server: 0.4 },
    decor: ['bin', 'plant'], cover: ['filing_cabinet', 'plant_large'], hazard: ['water_cooler', 'fire_extinguisher', 'socket'], decals: ['stain', 'papers', 'scuff'] },
  finance: { kinds: { cubicles: 2.5, openplan: 2, archive: 2, print: 1.5, manager: 1.2, meeting: 1.2, kitchen: 1, corridor: 1, toilets: 0.8, server: 0.5 },
    decor: ['bin', 'plant'], cover: ['filing_cabinet', 'safe', 'archive_stack'], hazard: ['printer', 'filing_cabinet', 'fire_extinguisher', 'water_cooler'], decals: ['papers', 'rug', 'stain'] },
  legal: { kinds: { archive: 2.5, openplan: 2, meeting: 2, manager: 1.5, print: 1.2, kitchen: 1, corridor: 1, toilets: 0.8, cubicles: 0.8, server: 0.3 },
    decor: ['plant', 'coat_stand', 'bin'], cover: ['filing_cabinet', 'archive_stack'], hazard: ['filing_cabinet', 'fire_extinguisher', 'water_cooler'], decals: ['rug', 'papers'] },
  compliance: { kinds: { cubicles: 2.5, archive: 2, meeting: 2, openplan: 1.5, print: 1.2, manager: 1, kitchen: 1, corridor: 1, toilets: 0.8, server: 0.5 },
    decor: ['bin', 'plant'], cover: ['filing_cabinet', 'archive_stack'], hazard: ['filing_cabinet', 'glass_partition', 'fire_extinguisher', 'water_cooler'], decals: ['tape', 'papers', 'stain'] },
  procurement: { kinds: { openplan: 2.5, archive: 2.5, cubicles: 2, meeting: 1.2, print: 1.2, manager: 1, kitchen: 1, corridor: 1, toilets: 0.8, server: 0.3 },
    decor: ['bin', 'mail_trolley', 'plant'], cover: ['archive_stack', 'filing_cabinet', 'mail_trolley'], hazard: ['fire_extinguisher', 'socket', 'water_cooler', 'printer'], decals: ['tape', 'scuff', 'parcel_tape', 'papers'] },
  hrhq: { kinds: { openplan: 2.5, meeting: 2, cubicles: 2, archive: 1.5, manager: 1.5, reception: 1, kitchen: 1, corridor: 1, toilets: 0.8, print: 0.6, server: 0.3 },
    decor: ['plant', 'plant_large', 'bin'], cover: ['plant_large', 'filing_cabinet'], hazard: ['water_cooler', 'fire_extinguisher', 'filing_cabinet'], decals: ['rug', 'inlay', 'stain'] },
  executive: { kinds: { manager: 2.5, openplan: 2, meeting: 2, kitchen: 1.2, reception: 1.2, archive: 1, corridor: 1.2, toilets: 0.8, server: 0.6 },
    decor: ['plant_large', 'coat_stand', 'plant'], cover: ['plant_large', 'minibar'], hazard: ['water_cooler', 'fire_extinguisher', 'glass_partition'], carpetMat: MAT.MARBLE, decals: ['rug', 'inlay', 'logo'] },
  boardroom: { kinds: { meeting: 3, openplan: 2, manager: 1.5, reception: 1, kitchen: 1, archive: 1, corridor: 1.2, toilets: 0.8, print: 0.8, server: 0.3 },
    decor: ['plant_large', 'coat_stand', 'plant'], cover: ['plant_large', 'filing_cabinet'], hazard: ['fire_extinguisher', 'water_cooler'], decals: ['rug', 'inlay', 'logo'] },
  carpark: { kinds: { openplan: 2, corridor: 2, archive: 1 }, decor: BASE_DECOR, cover: BASE_COVER, hazard: BASE_HAZARD, carpetMat: MAT.CONCRETE, decals: ['oil', 'tape'] },
  basement: { kinds: { server: 2, archive: 2, corridor: 1.5, openplan: 1 }, decor: ['mop_bucket', 'toolbox', 'bin'], cover: ['cable_reel', 'archive_stack'], hazard: ['socket', 'fire_extinguisher'], carpetMat: MAT.CONCRETE, decals: ['oil', 'grate', 'tape'] },
  rooftop: { kinds: { openplan: 2, corridor: 1, server: 1 }, decor: BASE_DECOR, cover: BASE_COVER, hazard: BASE_HAZARD, carpetMat: MAT.CONCRETE, decals: ['oil', 'grate'] },
};

/** Kind-specific hazard pools override the department pool. */
export const KIND_HAZARD: Partial<Record<RoomKind, PropKind[]>> = {
  kitchen: ['water_cooler', 'fire_extinguisher', 'socket'],
  server: ['socket', 'fire_extinguisher', 'cable_run'],
  print: ['printer', 'fire_extinguisher', 'socket'],
  toilets: ['fire_extinguisher', 'socket'],
  shop: ['water_cooler', 'fire_extinguisher'],
  treasure: ['fire_extinguisher'],
  event: ['water_cooler', 'fire_extinguisher'],
};

/** Base floor material per room kind (the theme's carpetMat replaces CARPET). */
export const KIND_MAT: Record<RoomKind, MatId> = {
  core: MAT.CORE, openplan: MAT.CARPET, cubicles: MAT.CARPET, meeting: MAT.CARPET, kitchen: MAT.LINO, print: MAT.LINO,
  server: MAT.RAISED, manager: MAT.WOOD, toilets: MAT.TILE, shop: MAT.LINO, treasure: MAT.CARPET, event: MAT.CARPET,
  challenge: MAT.CARPET, lift_arena: MAT.CORE, director: MAT.WOOD, boss: MAT.CARPET, corridor: MAT.CARPET, reception: MAT.MARBLE, archive: MAT.CARPET,
};

export const COMBAT_KINDS = new Set<RoomKind>(['openplan', 'cubicles', 'meeting', 'kitchen', 'print', 'server', 'manager', 'toilets', 'challenge', 'lift_arena', 'director', 'boss', 'corridor', 'reception', 'archive']);
