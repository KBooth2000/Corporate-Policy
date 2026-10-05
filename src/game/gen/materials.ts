// Floor material ids stored in FloorMap.material (renderer picks the texture per theme).
export const MAT = {
  CARPET: 0,     // theme carpet tiles (default room floor)
  ACCENT: 1,     // walkway strip / rug-coloured carpet inlay (template ',')
  CORE: 2,       // building core: stone / terrazzo / marble
  LINO: 3,       // kitchens, print rooms, post room: vinyl / lino
  TILE: 4,       // toilets: ceramic tiles
  RAISED: 5,     // server rooms: raised access floor panels
  CONCRETE: 6,   // plant rooms, facilities, loading bays
  WOOD: 7,       // manager's offices, boardroom, legal: parquet
  MARBLE: 8,     // reception lobby, executive, act 4 ceremony
  RUBBLE: 9,     // breached partitions
} as const;
export type MatId = (typeof MAT)[keyof typeof MAT];
