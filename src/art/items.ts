// ITEM / ICON ART. Weapons, projectiles, pickups, UI icons, desk items, button prompts.
// Everything is hand-authored pixel art (ASCII grids + shape helpers in src/art/items/*), baked once and cached.
// Lighting is top-left; every solid object has a 1px OUTLINE. The telegraph colours never appear here.
import type { Sprite } from '../render/canvas';
import type { Device } from '../core/input';
import type { IDef } from './items/gfx';
import { iconTile } from './items/gfx';
import { weaponHeld, weaponIconCanvas } from './items/weapons';
import { ICONS_REWARD, ICONS_DEPT } from './items/icons';
import { ICONS_HUD } from './items/icons2';
import { DESK_ICONS, DESK_FALLBACK } from './items/desk';
import { projectile, pickup, cursor } from './items/misc';
import { glyph } from './items/prompts';

/** UI / reward / HUD icon names. */
export type IconName =
  // reward previews (spec 3.3)
  | 'reward_benefit' | 'reward_cash' | 'reward_weapon' | 'reward_heal' | 'reward_rage' | 'reward_desk_item'
  | 'reward_shop' | 'reward_event' | 'reward_treasure' | 'reward_challenge' | 'reward_elite' | 'reward_director' | 'reward_boss'
  // departments (benefit providers)
  | 'dept_it' | 'dept_facilities' | 'dept_sales' | 'dept_marketing' | 'dept_finance' | 'dept_legal' | 'dept_hr' | 'dept_executive'
  // HUD
  | 'hp' | 'shield' | 'rage' | 'cash' | 'leave' | 'ammo' | 'durability' | 'skull' | 'lock' | 'unlock' | 'star' | 'kpi' | 'clock'
  | 'stairs' | 'lift' | 'corridor' | 'grab' | 'interact' | 'execution' | 'window' | 'promotion' | 'trophy' | 'seed' | 'daily'
  | 'email' | 'attachment' | 'warning' | 'info' | 'check' | 'cross' | 'gear' | 'radio' | 'car' | 'noticeboard' | 'vending' | 'boot' | 'dashboard'
  | 'policy_no_dash' | 'policy_no_ranged' | 'policy_no_rage' | 'policy_no_grab' | 'policy_no_melee';

/** Projectile visuals. */
export type ProjectileKind = 'staple' | 'nail' | 'laser' | 'calc' | 'tape' | 'confetti' | 'phone' | 'stapler_thrown' | 'contract' | 'toolbox' | 'binder' | 'scream' | 'beam' | 'golf_ball' | 'paper' | 'coffee' | 'invite' | 'pen';

/** World pickup visuals (origin bottom-centre). */
export type PickupKind = 'cash_coin' | 'cash_note' | 'cash_bundle' | 'heal_biscuit' | 'heal_sandwich' | 'heal_firstaid' | 'espresso' | 'leave_token' | 'ammo_box' | 'hr_file' | 'benefit_envelope' | 'desk_item_box' | 'rage_mod' | 'repair_tape' | 'key_card';

const ICON_DEFS: Record<IconName, IDef> = { ...ICONS_REWARD, ...ICONS_DEPT, ...ICONS_HUD } as Record<IconName, IDef>;
/** All icon names with art (for galleries / tests). */
export const ICON_NAMES = Object.keys(ICON_DEFS) as IconName[];
const iconCache = new Map<string, HTMLCanvasElement>();

/** Held weapon sprite pointing right (+x) with origin at the grip. Unknown ids fall back to the fist. */
export function weaponSprite(id: string): Sprite { return weaponHeld(id); }
/** 16×16 inventory/pickup icon. */
export function weaponIcon(id: string): HTMLCanvasElement { return weaponIconCanvas(id); }
/** 16×16 reward / HUD / department / policy icon. */
export function icon(name: IconName): HTMLCanvasElement {
  let c = iconCache.get(name);
  if (!c) {
    const d = ICON_DEFS[name] ?? DESK_FALLBACK;
    c = iconTile(d.rows, d.pal);
    iconCache.set(name, c);
  }
  return c;
}
/** 16×16 Desk Item icon (unique per item; unknown ids get a generic cardboard-box fallback). */
export function deskItemIcon(id: string): HTMLCanvasElement {
  const key = 'desk:' + id;
  let c = iconCache.get(key);
  if (!c) {
    const d = DESK_ICONS[id] ?? DESK_FALLBACK;
    c = iconTile(d.rows, d.pal);
    iconCache.set(key, c);
  }
  return c;
}
/** Projectile sprite, oriented pointing right, origin centred. */
export function projectileSprite(kind: ProjectileKind): Sprite { return projectile(kind); }
/** Button prompt glyph for a binding label on a device (e.g. 'X' on xbox, 'Square' on playstation, 'E' on kbm). 14px tall. */
export function promptGlyph(label: string, device: Device): HTMLCanvasElement { return glyph(label, device); }
/** World pickup sprite, origin bottom-centre. */
export function pickupSprite(kind: PickupKind): Sprite { return pickup(kind); }
/** Aim crosshair (11×11, origin centre, white with teal pip) or the CorpOS pointer (origin at the tip). */
export function cursorSprite(kind: 'aim' | 'pointer'): Sprite { return cursor(kind); }
