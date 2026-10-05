// Projectiles: staples, nails, thrown items, enemy shots. Thrown objects arc (z) and spin.
import { Entity, Actor, DamageInfo } from './entity';
import type { Ctx, Sprite } from '../render/canvas';
import { drawSpriteRot } from '../render/canvas';
import { projectileSprite, weaponSprite, ProjectileKind } from '../art/items';
import { TILE, T } from './world-types';
import { sparks, debrisBurst } from './fx';
import { audio } from '../audio/audio';
import type { Team } from './entity';

export interface ProjectileOpts {
  team: Team;
  x: number; y: number; z?: number;
  angle: number; speed: number;
  dmg: Omit<DamageInfo, 'dir'>;
  kind?: ProjectileKind;
  itemId?: string;        // thrown item: draw the item sprite spinning
  life?: number;
  radius?: number;
  pierce?: number;
  spin?: number;
  gravity?: boolean;      // lobbed arc
  onHit?: (p: Projectile, target: Actor | null) => void;
  onEnd?: (p: Projectile) => void;
  hitsProps?: boolean;
  /** Breaks glass partitions / hazards it hits. */
  propDamage?: number;
  slow?: { amt: number; time: number };
  trail?: string;
}

export class Projectile extends Entity {
  o: ProjectileOpts;
  life: number;
  hit = new Set<number>();
  pierceLeft: number;
  rot: number;
  private spr: Sprite;
  ended = false;

  constructor(o: ProjectileOpts) {
    super();
    this.o = o;
    this.x = o.x; this.y = o.y; this.z = o.z ?? 10;
    this.vx = Math.cos(o.angle) * o.speed; this.vy = Math.sin(o.angle) * o.speed;
    if (o.gravity) this.vz = 60;
    this.life = o.life ?? 1.6;
    this.radius = o.radius ?? 3;
    this.pierceLeft = o.pierce ?? 0;
    this.rot = o.angle;
    this.persist = true;
    this.layer = 1;
    this.spr = o.itemId ? weaponSprite(o.itemId) : projectileSprite(o.kind ?? 'staple');
  }

  update(dt: number): void {
    const w = this.world;
    this.life -= dt;
    if (this.life <= 0) return this.end(null);
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 4));
    for (let i = 0; i < steps && !this.dead; i++) {
      this.x += (this.vx * dt) / steps;
      this.y += (this.vy * dt) / steps;
      if (this.o.gravity) {
        this.vz -= 220 * dt / steps; this.z += this.vz * dt / steps;
        if (this.z <= 2) return this.end(null);
      }
      // tiles
      const tx = Math.floor(this.x / TILE), ty = Math.floor((this.y) / TILE);
      if (w.isSolidTile(tx, ty, true)) {
        const t = w.tile(tx, ty);
        if (t === T.WINDOW || t === T.WINDOW_SEALED) { /* windows just stop projectiles */ }
        return this.end(null, true);
      }
      // props
      if (this.o.hitsProps !== false) {
        const p = w.propAt(this.x, this.y);
        if (p && (p.def.h >= 12 || p.def.hazard)) {
          w.hitProp(p, { amount: this.o.propDamage ?? this.o.dmg.amount, type: this.o.dmg.type, method: this.o.dmg.method, source: this.o.dmg.source ?? null, dir: Math.atan2(this.vy, this.vx), body: false });
          if (p.solid && p.def.h >= 14) return this.end(null, true);
        }
      }
      // actors
      for (const a of w.actors) {
        if (!a.alive || a.team === this.o.team || a.team === 'neutral' || this.hit.has(a.id) || a.grabbedBy) continue;
        if (a.thrown) continue;
        const dx = a.x - this.x, dy = (a.y - a.height * 0.4) - (this.y - this.z * 0.2);
        const rr = a.radius + this.radius + 3;
        if (dx * dx + dy * dy * 0.6 > rr * rr) continue;
        this.hit.add(a.id);
        const dir = Math.atan2(this.vy, this.vx);
        const dealt = w.damage(a, { ...this.o.dmg, dir });
        if (this.o.slow && dealt > 0) { a.status.slow = Math.max(a.status.slow, this.o.slow.time); a.status.slowAmt = Math.max(a.status.slowAmt, this.o.slow.amt); }
        this.o.onHit?.(this, a);
        if (this.pierceLeft-- <= 0) return this.end(a);
      }
    }
    this.rot = this.o.spin ? this.rot + this.o.spin * dt : Math.atan2(this.vy, this.vx);
    if (this.o.trail && Math.random() < 0.6) w.particles.spawn({ kind: 'pixel', x: this.x, y: this.y - this.z, life: 0.15, col: this.o.trail, size: 1, drag: 0 });
  }

  end(target: Actor | null, wall = false): void {
    if (this.ended) return;
    this.ended = true;
    this.dead = true;
    if (wall) {
      sparks(this.world.particles, this.x, this.y - this.z, 3, '#e8e8e0', 60);
      audio.sfx('projectile_hit', { x: this.x, y: this.y, vol: 0.5 });
      if (this.o.itemId) debrisBurst(this.world.particles, this.x, this.y, 6, ['#d0d0d0', '#909090', '#ffffff'], this.world.roomAt(this.x, this.y));
    }
    if (!target) this.o.onHit?.(this, null);
    this.o.onEnd?.(this);
  }

  render(g: Ctx): void {
    // shadow
    if (this.z > 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.round(this.x) - 2, Math.round(this.y), 4, 1); }
    drawSpriteRot(g, this.spr, this.x, this.y - this.z, this.rot);
  }
}
