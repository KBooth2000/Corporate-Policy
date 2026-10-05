// Pickups: weapons (interact to swap), petty cash, heals, ammo, intel files, rewards.
import { Entity } from './entity';
import type { Ctx, Sprite } from '../render/canvas';
import { drawSprite, sprite, paint, rect } from '../render/canvas';
import * as items from '../art/items';
import { WeaponInst, def, slotOf } from './weapons';
import type { Interactable } from './world';
import { audio } from '../audio/audio';
import { drawText } from '../render/font';
import { RARITY_COLOURS } from '../art/palette';

export type PickupKind = 'weapon' | 'cash' | 'heal' | 'ammo' | 'espresso' | 'reward' | 'intel' | 'leave';

export interface PickupOpts {
  kind: PickupKind;
  x: number; y: number;
  weapon?: WeaponInst;
  amount?: number;
  /** Reward pickups: what to grant (handled by gameplay scene callback). */
  reward?: { kind: string; label: string; icon?: HTMLCanvasElement; grant: () => void };
  /** Pop out in a direction. */
  vx?: number; vy?: number;
}

function pickSprite(kind: string): Sprite {
  const fn = (items as any).pickupSprite as ((k: string) => Sprite) | undefined;
  if (fn) return fn(kind);
  return sprite(paint(8, 8, (g) => rect(g, 0, 0, 8, 8, '#ffd34d')), 4, 8);
}

export class Pickup extends Entity {
  o: PickupOpts;
  t = 0;
  private interact: Interactable | null = null;
  magnet = false;

  constructor(o: PickupOpts) {
    super();
    this.o = o;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
    this.z = 6; this.vz = 50;
    this.layer = 0;
    this.persist = false;
  }

  override onAdded(): void {
    if (this.o.kind === 'weapon' || this.o.kind === 'reward') {
      const w = this.o.weapon;
      this.interact = {
        x: this.x, y: this.y, r: 18, priority: this.o.kind === 'reward' ? 1 : 0,
        label: this.o.kind === 'reward' ? this.o.reward!.label : `Take ${def(w!.id).name}`,
        sub: w ? (w.maxDur ? `${w.dur}/${w.maxDur} uses` : w.maxAmmo ? `${w.ammo}/${w.maxAmmo} ammo` : undefined) : undefined,
        enabled: () => !this.dead && this.z <= 0.5,
        onInteract: () => this.collect(),
      };
      this.world.interactables.push(this.interact);
    }
  }

  override onRemoved(): void {
    if (this.interact) this.world.interactables = this.world.interactables.filter((i) => i !== this.interact);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 300 * dt; this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; }
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (this.world.isWalkablePx(nx, ny)) { this.x = nx; this.y = ny; } else { this.vx *= -0.3; this.vy *= -0.3; }
    this.vx *= Math.max(0, 1 - 5 * dt); this.vy *= Math.max(0, 1 - 5 * dt);
    if (this.interact) { this.interact.x = this.x; this.interact.y = this.y; }
    const p = this.world.player as any;
    if (!p || !p.alive) return;
    const auto = this.o.kind === 'cash' || this.o.kind === 'heal' || this.o.kind === 'ammo' || this.o.kind === 'espresso' || this.o.kind === 'intel' || this.o.kind === 'leave';
    if (!auto || this.t < 0.35) return;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.o.kind === 'heal' && p.hp >= p.maxHp) return;
    if (this.o.kind === 'ammo' && !p.run.loadout.ranged) return;
    if (d < 40 || this.magnet) {
      this.magnet = true;
      const sp = 220;
      this.x += ((p.x - this.x) / Math.max(d, 1)) * sp * dt;
      this.y += ((p.y - this.y) / Math.max(d, 1)) * sp * dt;
    }
    if (d < 8) this.collect();
  }

  collect(): void {
    if (this.dead) return;
    const p = this.world.player as any;
    const o = this.o;
    switch (o.kind) {
      case 'weapon': {
        const old: WeaponInst | null = p.equip(o.weapon!);
        if (old) this.world.add(new Pickup({ kind: 'weapon', weapon: old, x: p.x, y: p.y + 6, vx: (Math.random() - 0.5) * 60, vy: 30 }));
        this.world.bus.emit('pickup', { kind: 'weapon', id: o.weapon!.id });
        break;
      }
      case 'cash': {
        const amt = Math.round((o.amount ?? 1) * p.stats.cashMult);
        p.run.pettyCash += amt;
        p.run.log.cashEarned += amt;
        audio.sfx('pickup_cash', { vol: 0.5, pitch: 0.9 + Math.random() * 0.3 });
        this.world.floatText(this.x, this.y - 10, '+£' + amt, '#ffd34d');
        this.world.bus.emit('pickup', { kind: 'cash', amount: amt });
        break;
      }
      case 'heal': p.heal(o.amount ?? 10); audio.sfx('pickup_heal'); this.world.bus.emit('pickup', { kind: 'heal', amount: o.amount }); break;
      case 'espresso': p.heal(o.amount ?? 5); p.addRage(15); audio.sfx('energy_drink'); break;
      case 'ammo': {
        const r: WeaponInst = p.run.loadout.ranged;
        r.ammo = Math.min(r.maxAmmo, r.ammo + Math.ceil(r.maxAmmo * 0.4));
        audio.sfx('pickup_item'); this.world.floatText(this.x, this.y - 10, '+AMMO', '#e0e0e0');
        break;
      }
      case 'intel': case 'leave': case 'reward':
        audio.sfx(o.kind === 'reward' ? 'pickup_item' : 'paper_rustle');
        o.reward?.grant();
        this.world.bus.emit('pickup', { kind: o.kind });
        break;
    }
    this.dead = true;
  }

  render(g: Ctx): void {
    const bob = this.z > 0 ? this.z : Math.round(Math.sin(this.t * 4) * 1.5 + 1.5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.round(this.x) - 4, Math.round(this.y), 8, 1);
    const o = this.o;
    if (o.kind === 'weapon') {
      const w = o.weapon!;
      const img = items.weaponIcon(w.id);
      const rarity = def(w.id).rarity;
      if (rarity > 0) { g.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 5); g.fillStyle = RARITY_COLOURS[rarity]; g.fillRect(Math.round(this.x) - 9, Math.round(this.y - bob) - 17, 18, 18); g.globalAlpha = 1; }
      g.drawImage(img, Math.round(this.x - img.width / 2), Math.round(this.y - bob - img.height));
      const p = this.world.player;
      if (p && Math.hypot(p.x - this.x, p.y - this.y) < 26) {
        drawText(g, def(w.id).name, this.x, this.y - bob - 28, { align: 'center', color: RARITY_COLOURS[rarity], outline: '#0b0c10' });
        void slotOf;
      }
      return;
    }
    if (o.kind === 'reward' && o.reward?.icon) {
      const img = o.reward.icon;
      g.globalAlpha = 0.3 + 0.2 * Math.sin(this.t * 4);
      g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(this.x, this.y - bob - 8, 12, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.drawImage(img, Math.round(this.x - img.width / 2), Math.round(this.y - bob - img.height));
      return;
    }
    const map: Record<string, string> = { cash: (o.amount ?? 1) >= 20 ? 'cash_bundle' : (o.amount ?? 1) >= 6 ? 'cash_note' : 'cash_coin', heal: (o.amount ?? 10) >= 40 ? 'heal_firstaid' : (o.amount ?? 10) >= 15 ? 'heal_sandwich' : 'heal_biscuit', ammo: 'ammo_box', espresso: 'espresso', intel: 'hr_file', leave: 'leave_token', reward: 'desk_item_box' };
    drawSprite(g, pickSprite(map[o.kind] ?? 'cash_coin'), this.x, this.y - bob);
  }
}

/** Scatter petty cash coins/notes worth `total`. */
export function dropCash(world: any, x: number, y: number, total: number): void {
  let left = Math.round(total);
  while (left > 0) {
    const v = left >= 20 ? 20 : left >= 5 ? 5 : 1;
    left -= v;
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
    world.add(new Pickup({ kind: 'cash', amount: v, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s }));
  }
}
