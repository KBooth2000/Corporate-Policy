// ITEM / ICON ART CONTRACT. Weapons, projectiles, pickups, UI icons, desk items, button prompts.
import type { Sprite } from '../render/canvas';
import { paint, sprite, rect } from '../render/canvas';
import type { Device } from '../core/input';

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

// ----------------------------------------------------------------------------
// Placeholder implementation (replaced by the art module).
const cache = new Map<string, Sprite>();
function box(key: string, w: number, h: number, col: string, ox?: number, oy?: number): Sprite {
  let s = cache.get(key);
  if (!s) { s = sprite(paint(w, h, (g) => rect(g, 0, 0, w, h, col)), ox, oy); cache.set(key, s); }
  return s;
}

/** Held weapon sprite pointing right (+x) with origin at the grip. */
export function weaponSprite(id: string): Sprite { return box('w:' + id, 14, 4, '#c8c8d0', 2, 2); }
/** 16×16 inventory/pickup icon. */
export function weaponIcon(id: string): HTMLCanvasElement { return box('wi:' + id, 16, 16, '#c8c8d0', 8, 8).img as HTMLCanvasElement; }
export function icon(name: IconName): HTMLCanvasElement { return box('i:' + name, 16, 16, '#ffd34d', 8, 8).img as HTMLCanvasElement; }
export function deskItemIcon(id: string): HTMLCanvasElement { return box('d:' + id, 16, 16, '#9be37b', 8, 8).img as HTMLCanvasElement; }
export function projectileSprite(kind: ProjectileKind): Sprite { return box('p:' + kind, 4, 2, '#eeeeee', 2, 1); }
/** Button prompt glyph for a binding label on a device (e.g. 'X' on xbox, 'Square' on playstation, 'E' on kbm). */
export function promptGlyph(label: string, device: Device): HTMLCanvasElement { return box('g:' + device + label, 12, 12, '#ffffff', 6, 6).img as HTMLCanvasElement; }
