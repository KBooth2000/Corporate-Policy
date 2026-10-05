// Canonical identifiers shared by every module. Add to these lists rather than inventing ad-hoc strings.

export type Act = 1 | 2 | 3 | 4;

/** Floor department themes (spec 3.1). */
export const THEMES_BY_ACT: Record<Act, readonly ThemeId[]> = {
  1: ['reception', 'postroom', 'facilities', 'it'],
  2: ['sales', 'marketing', 'customerservice'],
  3: ['finance', 'legal', 'compliance', 'procurement'],
  4: ['hrhq', 'executive', 'boardroom'],
};
export type ThemeId =
  | 'reception' | 'postroom' | 'facilities' | 'it'
  | 'sales' | 'marketing' | 'customerservice'
  | 'finance' | 'legal' | 'compliance' | 'procurement'
  | 'hrhq' | 'executive' | 'boardroom'
  | 'carpark' | 'basement' | 'rooftop';

export const THEME_NAMES: Record<ThemeId, string> = {
  reception: 'Reception', postroom: 'Post Room', facilities: 'Facilities', it: 'IT Helpdesk',
  sales: 'Sales', marketing: 'Marketing', customerservice: 'Customer Service',
  finance: 'Finance', legal: 'Legal', compliance: 'Compliance', procurement: 'Procurement',
  hrhq: 'HR HQ', executive: 'Executive Suite', boardroom: 'Boardroom',
  carpark: 'Staff Car Park', basement: 'Basement Plant Room', rooftop: 'Rooftop',
};

/** Benefit provider departments (spec 7.1). */
export type BenefitDept = 'it' | 'facilities' | 'sales' | 'marketing' | 'finance' | 'legal' | 'hr' | 'executive';
export const BENEFIT_DEPTS: BenefitDept[] = ['it', 'facilities', 'sales', 'marketing', 'finance', 'legal', 'hr', 'executive'];

/** Enemy archetypes (spec 5.2). */
export type ArchetypeId =
  | 'intern' | 'receptionist' | 'caretaker' | 'it_tech' | 'fire_warden'
  | 'sales_rep' | 'marketing_exec' | 'call_centre' | 'team_leader' | 'employee_of_month'
  | 'accountant' | 'lawyer' | 'compliance_officer' | 'procurement_buyer' | 'auditor'
  | 'hr_partner' | 'svp' | 'exec_assistant' | 'consultant' | 'culture_champion';

export const ARCHETYPES: ArchetypeId[] = [
  'intern', 'receptionist', 'caretaker', 'it_tech', 'fire_warden',
  'sales_rep', 'marketing_exec', 'call_centre', 'team_leader', 'employee_of_month',
  'accountant', 'lawyer', 'compliance_officer', 'procurement_buyer', 'auditor',
  'hr_partner', 'svp', 'exec_assistant', 'consultant', 'culture_champion',
];

export type Role = 'swarmer' | 'bruiser' | 'ranged' | 'support' | 'disruptor' | 'elite';

export type BossId = 'facilities_manager' | 'head_of_sales' | 'head_of_compliance' | 'ceo';

/** Player starting roles (spec 7.3). */
export type PlayerRoleId = 'office_worker' | 'temp' | 'night_cleaner' | 'contractor' | 'ex_employee';

/** Seniority tiers (spec 5.3). */
export type Tier = 0 | 1 | 2; // Junior, Senior, Lead
export const TIER_NAMES = ['Junior', 'Senior', 'Lead'] as const;

/** Promotion ranks (spec 5.6). */
export const PROMOTION_RANKS = ['Associate', 'Manager', 'Senior Manager', 'Director'] as const;

export type WeaponClass = 'blunt' | 'sharp' | 'ranged' | 'throwable' | 'fists';

/** Environmental executions (spec 4.7). */
export type ExecType = 'defenestration' | 'photocopier' | 'server_rack' | 'shredder' | 'microwave' | 'hand_dryer' | 'water_cooler' | 'vending_machine' | 'filing_cabinet';

/** Props placed by the generator. Hazard/exec behaviour is keyed by kind in gameplay code. */
export type PropKind =
  // furniture / cover
  | 'desk' | 'desk_l' | 'reception_desk' | 'meeting_table' | 'exec_desk' | 'chair' | 'swivel_chair' | 'exec_chair' | 'sofa'
  | 'bookshelf' | 'plant' | 'plant_large' | 'bin' | 'coat_stand' | 'whiteboard' | 'projector_screen' | 'tv_screen'
  | 'cubicle_wall' | 'pigeonholes' | 'parcel_cage' | 'mail_trolley' | 'sack_pile' | 'toolbox' | 'ladder' | 'mop_bucket'
  | 'trophy_cabinet' | 'putting_green' | 'minibar' | 'globe_bar' | 'leaderboard_screen' | 'sales_gong' | 'archive_stack'
  | 'conveyor' | 'boiler' | 'pipe' | 'helipad_light' | 'vending_snack' | 'canteen_counter' | 'fridge' | 'kettle'
  | 'knife_block' | 'sink' | 'toilet_cubicle' | 'urinal' | 'mirror' | 'banner_values' | 'ceo_shrine' | 'candles' | 'ceremonial_lectern'
  | 'stationery_shelf' | 'safe' | 'stock_ticker' | 'dartboard' | 'ping_pong' | 'beanbag' | 'cable_reel'
  // hazards (spec 4.5)
  | 'glass_partition' | 'printer' | 'water_cooler' | 'fire_extinguisher' | 'filing_cabinet' | 'sprinkler' | 'cable_run' | 'socket'
  // execution objects (spec 4.7)
  | 'photocopier' | 'server_rack' | 'shredder' | 'microwave' | 'hand_dryer'
  // interactables
  | 'hr_cabinet' | 'vending_machine' | 'noticeboard' | 'fortune_copier' | 'stationery_cupboard' | 'exit_stairs' | 'exit_lift' | 'exit_corridor';

export type FloorType = 'standard' | 'elite' | 'shop' | 'treasure' | 'event' | 'challenge' | 'boss' | 'lift_ambush' | 'director';
export type ExitKind = 'stairs' | 'lift' | 'corridor';

/** Reward preview icons (spec 3.3, 8.4). */
export type RewardKind = 'benefit' | 'cash' | 'weapon' | 'heal' | 'rage_mod' | 'desk_item' | 'shop' | 'event' | 'treasure' | 'challenge' | 'elite' | 'director' | 'boss';

export type DamageType = 'blunt' | 'sharp' | 'electric' | 'explosive' | 'crush' | 'cut' | 'fire' | 'fall' | 'rage';
