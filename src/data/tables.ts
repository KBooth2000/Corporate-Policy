// Data-driven balancing (spec 3.7, 8.4, 10.2). Designers edit src/data/csv/*.csv in a spreadsheet;
// they are imported verbatim at build time and parsed into typed tables here. No balance numbers in code.
import weaponsCsv from './csv/weapons.csv?raw';
import archetypesCsv from './csv/archetypes.csv?raw';
import pricesCsv from './csv/prices.csv?raw';
import rewardsCsv from './csv/rewards.csv?raw';
import modifiersCsv from './csv/modifiers.csv?raw';
import rolesCsv from './csv/roles.csv?raw';
import floorsCsv from './csv/floors.csv?raw';
import type { ArchetypeId, PlayerRoleId, Role, WeaponClass } from './ids';

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  const head = rows.shift()!.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const num = (s: string) => (s === '' ? 0 : Number(s));

export interface WeaponDef {
  id: string; name: string; cls: WeaponClass;
  damage: number; heavyMult: number; interval: number; reach: number; arc: number;
  knockback: number; stagger: number; durability: number; ammo: number; projSpeed: number;
  bleed: number; dismember: number; rarity: 0 | 1 | 2; throwDamage: number; weight: number; desc: string;
}
export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(parseCsv(weaponsCsv).map((r) => [r.id, {
  id: r.id, name: r.name, cls: r.class as WeaponClass,
  damage: num(r.damage), heavyMult: num(r.heavy_mult), interval: num(r.interval), reach: num(r.reach), arc: num(r.arc),
  knockback: num(r.knockback), stagger: num(r.stagger), durability: num(r.durability), ammo: num(r.ammo), projSpeed: num(r.proj_speed),
  bleed: num(r.bleed), dismember: num(r.dismember), rarity: num(r.rarity) as 0 | 1 | 2, throwDamage: num(r.throw_damage), weight: num(r.weight), desc: r.desc,
} satisfies WeaponDef]));
export const WEAPON_IDS = Object.keys(WEAPONS);

export interface ArchetypeDef {
  id: ArchetypeId; name: string; role: Role; cost: number; fromFloor: number; act: 1 | 2 | 3 | 4;
  hp: number; speed: number; damage: number; attackRange: number; eliteOnly: boolean; anchor: string;
}
export const ARCHETYPE_DEFS: Record<ArchetypeId, ArchetypeDef> = Object.fromEntries(parseCsv(archetypesCsv).map((r) => [r.id, {
  id: r.id as ArchetypeId, name: r.name, role: r.role as Role, cost: num(r.cost), fromFloor: num(r.from_floor), act: num(r.act) as 1,
  hp: num(r.hp), speed: num(r.speed), damage: num(r.damage), attackRange: num(r.attack_range), eliteOnly: r.elite_only === '1', anchor: r.anchor,
}])) as Record<ArchetypeId, ArchetypeDef>;

export const PRICES: Record<string, { min: number; max: number }> = Object.fromEntries(
  parseCsv(pricesCsv).map((r) => [r.item, { min: num(r.min), max: num(r.max) }]));

export const REWARD_WEIGHTS: { reward: string; weight: number }[] = parseCsv(rewardsCsv).map((r) => ({ reward: r.reward, weight: num(r.weight) }));

export interface ModifierDef { id: string; name: string; ranks: number; kpiPerRank: number; desc: string; }
export const MODIFIERS: ModifierDef[] = parseCsv(modifiersCsv).map((r) => ({ id: r.id, name: r.name, ranks: num(r.ranks), kpiPerRank: num(r.kpi_per_rank), desc: r.desc }));

export interface RoleDef {
  id: PlayerRoleId; name: string; melee: string; ranged: string; throwables: string[];
  hpMult: number; rageFillMult: number; shieldRegen: number; ammoMult: number; hazardMult: number;
  startsInRage: boolean; shops: boolean; unlock: string; desc: string;
}
export const ROLES: Record<PlayerRoleId, RoleDef> = Object.fromEntries(parseCsv(rolesCsv).map((r) => [r.id, {
  id: r.id as PlayerRoleId, name: r.name, melee: r.melee, ranged: r.ranged, throwables: r.throwables ? r.throwables.split('|') : [],
  hpMult: num(r.hp_mult), rageFillMult: num(r.rage_fill_mult), shieldRegen: num(r.shield_regen), ammoMult: num(r.ammo_mult), hazardMult: num(r.hazard_mult),
  startsInRage: r.starts_in_rage === '1', shops: r.shops === '1', unlock: r.unlock, desc: r.desc,
}])) as Record<PlayerRoleId, RoleDef>;

export interface ActDef {
  act: 1 | 2 | 3 | 4; firstFloor: number; lastFloor: number; bossFloor: number; telegraphMin: number;
  eliteRoomChance: number; liftAmbushChance: number; alarmChance: number; poolCurrent: number; poolEarlier: number;
}
export const ACTS: ActDef[] = parseCsv(floorsCsv).map((r) => ({
  act: num(r.act) as 1, firstFloor: num(r.first_floor), lastFloor: num(r.last_floor), bossFloor: num(r.boss_floor), telegraphMin: num(r.telegraph_min),
  eliteRoomChance: num(r.elite_room_chance), liftAmbushChance: num(r.lift_ambush_chance), alarmChance: num(r.alarm_chance), poolCurrent: num(r.pool_current), poolEarlier: num(r.pool_earlier),
}));

export const actOfFloor = (f: number): 1 | 2 | 3 | 4 => (Math.min(4, Math.max(1, Math.ceil(f / 5))) as 1 | 2 | 3 | 4);
export const isBossFloor = (f: number) => f % 5 === 0;
/** spec 5.5: enemy_budget = 8 + floor × 3 */
export const enemyBudget = (floor: number) => 8 + floor * 3;
