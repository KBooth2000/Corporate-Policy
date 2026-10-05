// Damage resolution, telegraphs, hit queries (spec 2, 5.4). Telegraphs ALWAYS precede enemy attacks.
import { Actor, DamageInfo } from './entity';
import type { World } from './world';
import type { Ctx } from '../render/canvas';
import { Vec, angleDiff, angleTo, clamp, dist, distToSegment, fromAngle, TAU } from '../core/math';
import { telegraphColour } from '../art/palette';
import { audio } from '../audio/audio';
import { app } from '../core/app';

// ---------------------------------------------------------------------------
// Shapes
export type Shape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'arc'; x: number; y: number; r: number; angle: number; half: number }
  | { kind: 'line'; x: number; y: number; angle: number; len: number; width: number }
  | { kind: 'ring'; x: number; y: number; r: number; inner: number };

export function shapeHits(s: Shape, p: Vec, pr: number): boolean {
  switch (s.kind) {
    case 'circle': return dist(s, p) <= s.r + pr;
    case 'ring': { const d = dist(s, p); return d <= s.r + pr && d >= s.inner - pr; }
    case 'arc': {
      const d = dist(s, p);
      if (d > s.r + pr) return false;
      if (d < pr + 3) return true;
      return Math.abs(angleDiff(s.angle, angleTo(s, p))) <= s.half + Math.atan2(pr, d);
    }
    case 'line': {
      const e = fromAngle(s.angle, s.len);
      return distToSegment(p, s, { x: s.x + e.x, y: s.y + e.y }) <= s.width / 2 + pr;
    }
  }
}

// ---------------------------------------------------------------------------
// Telegraphs (spec 5.4: min 0.4s act 1 → 0.25s act 4; reserved colour; sound cue)
export class Telegraph {
  t = 0;
  done = false;
  constructor(
    public owner: Actor | null,
    public shape: Shape,
    public dur: number,
    public onFire: (shape: Shape) => void,
    public opts: { follow?: (s: Shape) => void; heavy?: boolean; silent?: boolean; cancelOnStun?: boolean } = {},
  ) {
    if (!opts.silent) {
      audio.sfx(opts.heavy ? 'telegraph_heavy' : 'telegraph', { x: shape.x, y: shape.y, vol: 0.55 });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    if (this.owner && (this.opts.cancelOnStun ?? true) && (!this.owner.alive || this.owner.isStunned())) { this.done = true; return; }
    this.opts.follow?.(this.shape);
    this.t += dt;
    if (this.t >= this.dur) { this.done = true; this.onFire(this.shape); }
  }

  render(g: Ctx): void {
    if (this.done) return;
    const { stroke, fill, cb } = telegraphColour();
    const p = clamp(this.t / this.dur, 0, 1);
    const blink = Math.floor(app.time * 20) % 2 === 0;
    const s = this.shape;
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = stroke;
    g.fillStyle = fill;
    g.beginPath();
    const path = (scale: number) => {
      g.beginPath();
      switch (s.kind) {
        case 'circle': g.arc(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.max(1, s.r * scale), 0, TAU); break;
        case 'ring': g.arc(s.x, s.y, Math.max(1, s.r * scale), 0, TAU); g.arc(s.x, s.y, s.inner, 0, TAU, true); break;
        case 'arc': g.moveTo(s.x, s.y); g.arc(s.x, s.y, Math.max(1, s.r * scale), s.angle - s.half, s.angle + s.half); g.closePath(); break;
        case 'line': {
          const e = fromAngle(s.angle, s.len * (s.kind === 'line' ? 1 : scale));
          const n = fromAngle(s.angle + Math.PI / 2, (s.width / 2) * (scale * 0.5 + 0.5));
          g.moveTo(s.x + n.x, s.y + n.y); g.lineTo(s.x + e.x + n.x, s.y + e.y + n.y);
          g.lineTo(s.x + e.x - n.x, s.y + e.y - n.y); g.lineTo(s.x - n.x, s.y - n.y); g.closePath();
          break;
        }
      }
    };
    // fill grows with progress; outline at full size
    path(s.kind === 'line' ? 1 : p);
    g.globalAlpha = 0.55 + 0.45 * p;
    g.fill();
    path(1);
    g.globalAlpha = p > 0.75 && blink ? 1 : 0.85;
    if (cb) g.setLineDash([3, 2]);
    g.stroke();
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Damage
export function damage(world: World, target: Actor, info: DamageInfo): number {
  if (!target.alive) return 0;
  if (target.invuln > 0 && !info.unavoidable) return 0;
  if (world.cutscene && !info.unavoidable) return 0;
  let amt = target.modifyIncoming(info);
  if (amt <= 0) return 0;
  if (target.status.injunction > 0) amt *= 1.3;
  if (target.status.armour > 0) amt *= 1 - target.status.armourAmt;
  amt = Math.max(0, amt);

  // shields absorb first (Wellbeing shield for the player, HR "wellbeing" shields for enemies)
  let absorbed = 0;
  if (!info.ignoreShield && target.shield > 0) {
    absorbed = Math.min(target.shield, amt);
    target.shield -= absorbed;
    amt -= absorbed;
  }
  target.hp -= amt;
  target.lastHitBy = info.source ?? target.lastHitBy;
  if (info.source) target.lastHitTime = world.time;
  if (!info.silent) {
    target.hitFlash = 1;
    target.squash = 0.82;
  }

  // knockback & stagger
  const dir = info.dir ?? (info.source ? angleTo(info.source, target) : 0);
  if (info.knockback) {
    const k = info.knockback / Math.max(0.3, target.mass);
    target.kx += Math.cos(dir) * k;
    target.ky += Math.sin(dir) * k;
  }
  if (info.stagger) {
    target.staggerMeter += info.stagger;
    if (target.staggerMeter >= target.staggerMax && target.staggered <= 0) {
      target.staggerMeter = 0;
      target.staggered = 1.1;
    }
  }
  if (info.bleed && world.rng.combat.next() < info.bleed) {
    target.status.bleed = Math.max(target.status.bleed, 3);
    target.status.bleedDps = Math.max(target.status.bleedDps, 3 + (info.amount * 0.15));
  }

  world.onDamaged(target, info, amt, absorbed, dir);
  target.onHurtLocal?.(info, amt + absorbed);

  if (target.hp <= 0) {
    target.hp = 0;
    target.dying = true;
    target.onDeath(info);
    world.onKilled(target, info, dir);
  }
  return amt + absorbed;
}

/** Find living actors of a team within a shape. */
export function queryActors(world: World, s: Shape, team: Actor['team'] | 'any', exclude?: Actor): Actor[] {
  const out: Actor[] = [];
  for (const a of world.actors) {
    if (a === exclude || !a.alive || a.grabbedBy) continue;
    if (team !== 'any' && a.team !== team) continue;
    if (shapeHits(s, a, a.radius)) out.push(a);
  }
  return out;
}
