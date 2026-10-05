// Shared plumbing for environmental hazards (spec 4.5) and executions (spec 4.7):
// damage helper (hazard multipliers), the per-world "hazard field" (puddles, electricity, smoke clouds, sprinklers),
// and small geometry helpers. Auto-loaded with the rest of src/game/hazards/*.ts (no registrations here).
import type { World, PropRT, PropHit } from '../world';
import { Entity, Actor } from '../entity';
import type { Ctx } from '../../render/canvas';
import { ellipse, line } from '../../render/canvas';
import type { DamageType } from '../../data/ids';
import { fxRng } from '../../core/rng';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import { footprint, TILE } from '../world-types';
import { sparks } from '../fx';

// ---------------------------------------------------------------------------
// Geometry
export interface Pt { x: number; y: number; }

/** Visual / interaction centre of a prop (a little above its base). */
export function centre(p: PropRT): Pt { return { x: p.def.x, y: p.def.y - Math.min(p.def.h, 14) / 2 }; }

/** Distance from a point to a prop's footprint rectangle (0 when inside). */
export function distToFoot(p: PropRT, x: number, y: number): number {
  const f = footprint(p.def);
  const dx = Math.max(f.x - x, 0, x - (f.x + f.w)), dy = Math.max(f.y - y, 0, y - (f.y + f.h));
  return Math.hypot(dx, dy);
}

export const angleFrom = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x);

/** Direction a hit travelled in (falls back to attacker -> prop, then random). */
export function hitDir(p: PropRT, h: PropHit): number {
  if (h.dir !== undefined) return h.dir;
  if (h.source) return angleFrom(h.source, p.def);
  return fxRng.range(0, Math.PI * 2);
}

/** "Heavy" hits (spec 4.5): heavy swings, thrown bodies, thrown items, explosions, or big numbers. */
export function isHeavy(h: PropHit): boolean {
  return !!(h.heavy || h.body || h.method === 'heavy' || h.method === 'body' || h.method === 'throw' || h.type === 'explosive' || h.amount >= 24);
}

/** Medium-or-better hits (any decent swing). */
export function isHard(h: PropHit): boolean { return isHeavy(h) || h.amount >= 14; }

// ---------------------------------------------------------------------------
// Damage
export interface HurtOpts {
  source?: Actor | null;
  dir?: number;
  knockback?: number;
  stagger?: number;
  bleed?: number;
  /** hazardKind recorded on the DamageInfo (counts towards hazard kills + Night Cleaner). */
  kind: string;
  /** Extra stun seconds (player's capped). */
  stun?: number;
  silent?: boolean;
}

/**
 * Hazard damage with the spec multipliers: enemies take x player.stats.hazardDamage, the player takes
 * x stats.hazardTaken (applied inside Player.modifyIncoming for method 'hazard'). method is always 'hazard'
 * so the gameplay scene counts hazard kills; source is the actor that triggered it (the player for player-triggered).
 */
export function hurt(w: World, a: Actor, amount: number, type: DamageType, o: HurtOpts): number {
  if (!a.alive) return 0;
  let amt = amount;
  if (a.team === 'enemy') amt *= (w.player as any)?.stats?.hazardDamage ?? 1;
  const isPlayer = a === w.player;
  // a player hurt by a hazard they triggered themselves is not "killed by themselves" for promotion credit
  const src = isPlayer && o.source === a ? null : (o.source ?? null);
  const dealt = w.damage(a, {
    amount: amt, type, method: 'hazard', hazardKind: o.kind, source: src, dir: o.dir,
    knockback: o.knockback, stagger: isPlayer ? 0 : o.stagger, bleed: o.bleed, silent: o.silent,
  });
  if (dealt > 0 && o.stun && a.alive) {
    a.status.stun = Math.max(a.status.stun, isPlayer ? Math.min(o.stun, 0.45) : o.stun);
  }
  return dealt;
}

/** Live actors whose body overlaps a circle. */
export function actorsIn(w: World, x: number, y: number, r: number, pad = true): Actor[] {
  const out: Actor[] = [];
  for (const a of w.actors) {
    if (!a.alive || a.grabbedBy) continue;
    const d = Math.hypot(a.x - x, (a.y - 4) - y);
    if (d <= r + (pad ? a.radius : 0)) out.push(a);
  }
  return out;
}

export function knock(a: Actor, ang: number, force: number): void {
  const k = force / Math.max(0.3, a.mass);
  a.kx += Math.cos(ang) * k; a.ky += Math.sin(ang) * k;
}

/** Knocked flat: stagger (enemy stagger anim) + short stun. */
export function knockDown(a: Actor, secs: number): void {
  if (!a.alive) return;
  if (a.team !== 'player') a.staggered = Math.max(a.staggered, secs);
  a.status.stun = Math.max(a.status.stun, Math.min(secs, a.team === 'player' ? 0.5 : secs * 0.8));
  a.setAnim(a.team === 'player' ? 'hit' : 'knockdown', true);
}

export function say(w: World, x: number, y: number, text: string, col = '#ffffff', scale = 1): void { w.floatText(x, y, text, col, scale); }

// ---------------------------------------------------------------------------
// The per-world hazard field
export interface WetZone { x: number; y: number; r: number; t: number; }
export interface Puddle {
  wz: WetZone;
  elec: number;           // seconds of electrification left
  src: Actor | null;
  tick: number;
  seed: number;
  /** Max life (for fade). */
  max: number;
}
interface Puff { dx: number; dy: number; r: number; ph: number; col: string; }
export interface Cloud { x: number; y: number; r: number; t: number; max: number; puffs: Puff[]; }
export interface Arc { pts: Pt[]; t: number; max: number; big: boolean; }
interface Sprinkle { id: number; t: number; sfxT: number; src: Actor | null; }
export interface Blast { x: number; y: number; r: number; t: number; max: number; hot: boolean; col?: string; }

const SMOKE = ['#eef2f4', '#d8e0e4', '#c2ccd2', '#aeb9c0'];

export class Field {
  puddles: Puddle[] = [];
  private known = new WeakMap<object, Puddle>();
  clouds: Cloud[] = [];
  arcs: Arc[] = [];
  blasts: Blast[] = [];
  /** Full-screen flash (0..1) used by big explosions. */
  flash = 0;
  sprinklers = new Map<number, Sprinkle>();
  /** Sprinkler rooms already triggered by an alarm (once each). */
  alarmDone = new Set<number>();
  private scanT = 0;
  constructor(public w: World) {}

  // ------------------------------------------------------------ puddles
  zones(): WetZone[] { return ((this.w as any).wetZones ??= []) as WetZone[]; }

  /** Create a puddle (wet zone + decal). */
  addPuddle(x: number, y: number, r: number, life = 14, src: Actor | null = null, electrified = false, decal = true): Puddle {
    const w = this.w;
    const wz: WetZone = { x, y, r, t: life };
    this.zones().push(wz);
    const p = this.adopt(wz);
    p.src = src; p.max = life;
    if (decal) w.decals.splat(w.roomAt(x, y), x, y, r * 0.55, '#6aa8d8', 'wet');
    if (electrified || nearElectric(w, x, y, r + 14)) electrifyPuddle(this, p, 6, src);
    return p;
  }

  private adopt(z: WetZone): Puddle {
    let p = this.known.get(z);
    if (!p) { p = { wz: z, elec: 0, src: null, tick: 0.1, seed: (fxRng.next() * 1000) | 0, max: Math.max(1, z.t) }; this.known.set(z, p); this.puddles.push(p); }
    return p;
  }

  // ------------------------------------------------------------ clouds / arcs
  addCloud(x: number, y: number, r: number, life: number): Cloud {
    const puffs: Puff[] = [];
    const n = Math.max(6, Math.round(r / 2.2));
    for (let i = 0; i < n; i++) {
      const a = fxRng.range(0, Math.PI * 2), d = Math.sqrt(fxRng.next()) * r * 0.85;
      puffs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, r: fxRng.range(r * 0.28, r * 0.5), ph: fxRng.range(0, 6.28), col: fxRng.pick(SMOKE) });
    }
    const c: Cloud = { x, y, r, t: life, max: life, puffs };
    this.clouds.push(c);
    if (this.clouds.length > 8) this.clouds.shift();
    return c;
  }

  /** Pixel-art fireball / shockwave (printer explosions). */
  addBlast(x: number, y: number, r: number, hot = true, col?: string): void {
    this.blasts.push({ x, y, r, t: 0.42, max: 0.42, hot, col });
    if (hot) this.flash = Math.max(this.flash, 0.55);
  }

  addArc(x0: number, y0: number, x1: number, y1: number, life = 0.16, big = false): void {
    const pts: Pt[] = [{ x: x0, y: y0 }];
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 7));
    const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const k = i / n, j = fxRng.range(-4, 4);
      pts.push({ x: x0 + (x1 - x0) * k + (nx / nl) * j, y: y0 + (y1 - y0) * k + (ny / nl) * j });
    }
    pts.push({ x: x1, y: y1 });
    this.arcs.push({ pts, t: life, max: life, big });
    if (this.arcs.length > 40) this.arcs.shift();
  }

  // ------------------------------------------------------------ sprinklers
  triggerSprinklers(roomId: number, secs = 8, src: Actor | null = null): void {
    const w = this.w;
    if (roomId < 0 || this.sprinklers.has(roomId)) return;
    const def = w.map.rooms[roomId];
    if (!def || def.kind === 'core') return;
    this.sprinklers.set(roomId, { id: roomId, t: secs, sfxT: 0, src });
    audio.sfx('sprinkler', { x: (def.tx + def.tw / 2) * TILE, y: (def.ty + def.th / 2) * TILE });
    w.floatText((def.tx + def.tw / 2) * TILE, (def.ty + 1) * TILE, 'SPRINKLERS', '#9fd0f0');
    // flood: a lattice of puddles across the floor so electricity can conduct room-wide
    const rect = w.roomRect(roomId);
    const step = 34;
    let n = 0;
    for (let y = rect.y + step / 2; y < rect.y + rect.h && n < 30; y += step) {
      for (let x = rect.x + step / 2; x < rect.x + rect.w && n < 30; x += step) {
        if (!w.isWalkablePx(x, y)) continue;
        const wz: WetZone = { x, y, r: 22, t: secs + 6 };
        this.zones().push(wz);
        const p = this.adopt(wz); p.max = secs + 6;
        n++;
      }
    }
    for (let i = 0; i < 6; i++) w.decals.splat(roomId, rect.x + fxRng.range(12, rect.w - 12), rect.y + fxRng.range(12, rect.h - 12), 7, '#6aa8d8', 'wet');
    // fire is put out
    for (const a of w.actors) if (w.roomAt(a.x, a.y) === roomId) a.status.burning = 0;
  }

  sprinklersOn(roomId: number): boolean { return this.sprinklers.has(roomId); }

  // ------------------------------------------------------------ update
  update(dt: number): void {
    const w = this.w;
    const zs = this.zones();
    for (const z of zs) if (!this.known.has(z)) this.adopt(z);
    // electrified puddles
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      if (p.wz.t <= 0) { this.puddles.splice(i, 1); continue; }
      if (p.elec > 0) {
        p.elec -= dt;
        p.tick -= dt;
        if (fxRng.chance(dt * 9)) {
          const a = fxRng.range(0, 6.28), d = fxRng.range(0, p.wz.r * 0.9);
          sparks(w.particles, p.wz.x + Math.cos(a) * d, p.wz.y + Math.sin(a) * d * 0.6, 2, '#bff4ff', 70);
        }
        if (p.tick <= 0) {
          p.tick = 0.45;
          for (const a of w.actors) {
            if (!a.alive || a.grabbedBy || a.thrown) continue;
            if (Math.hypot(a.x - p.wz.x, (a.y - 2 - p.wz.y) / 0.75) > p.wz.r + a.radius * 0.4) continue;
            shock(w, a, 6, p.src, 'electrified_water', 0.6);
          }
        }
      }
    }
    // smoke
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt;
      if (c.t <= 0) { this.clouds.splice(i, 1); continue; }
      for (const a of w.actors) {
        if (!a.alive || a.team !== 'enemy') continue;
        if (Math.hypot(a.x - c.x, (a.y - 8 - c.y) / 0.8) < c.r) a.status.blind = Math.max(a.status.blind, 0.7);
      }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].t -= dt; if (this.arcs[i].t <= 0) this.arcs.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { this.blasts[i].t -= dt; if (this.blasts[i].t <= 0) this.blasts.splice(i, 1); }
    this.flash = Math.max(0, this.flash - dt * 4);
    // sprinklers
    for (const [id, s] of this.sprinklers) {
      s.t -= dt;
      s.sfxT -= dt;
      if (s.sfxT <= 0) { s.sfxT = 1.4; audio.sfx('sprinkler', { vol: 0.35 }); }
      for (const a of w.actors) {
        if (!a.alive || w.roomAt(a.x, a.y) !== id) continue;
        a.status.wet = Math.max(a.status.wet, 0.45);
        a.status.slowAmt = a.status.slow > 0 ? Math.max(a.status.slowAmt, 0.22) : 0.22;
        a.status.slow = Math.max(a.status.slow, 0.45);
        a.status.burning = 0;
      }
      // rain (only near the camera)
      const r = app.renderer;
      const rect = w.roomRect(id);
      const x0 = Math.max(rect.x, r.viewX()), x1 = Math.min(rect.x + rect.w, r.viewX() + r.W);
      const y0 = Math.max(rect.y, r.viewY()), y1 = Math.min(rect.y + rect.h, r.viewY() + r.H);
      if (x1 > x0 && y1 > y0) {
        const n = Math.min(3, Math.ceil(((x1 - x0) * (y1 - y0)) / 14000));
        for (let k = 0; k < n; k++) {
          w.particles.spawn({ kind: 'water', x: fxRng.range(x0, x1), y: fxRng.range(y0, y1), z: fxRng.range(26, 38), vz: -30, gravity: 520, life: 0.34, col: fxRng.pick(['#bfe4f6', '#8cc4e6', '#ffffff']), size: 1, roomId: id });
        }
      }
      if (s.t <= 0) this.sprinklers.delete(id);
    }
    // sprinkler triggers: fire in the room, or an alarm floor the first time the player walks in
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      for (const rm of w.rooms) {
        if (!rm.def.sprinklers || this.sprinklers.has(rm.def.id)) continue;
        const id = rm.def.id;
        let fire = false;
        for (const a of w.actors) if (a.alive && a.status.burning > 0 && w.roomAt(a.x, a.y) === id) { fire = true; break; }
        if (fire) { this.triggerSprinklers(id, 8, null); continue; }
        if (w.alarm && !this.alarmDone.has(id) && w.roomAt(w.player.x, w.player.y) === id && rm.entered) { this.alarmDone.add(id); this.triggerSprinklers(id, 9, null); }
      }
    }
  }

  // ------------------------------------------------------------ render
  renderFloor(g: Ctx): void {
    const t = app.time;
    for (const p of this.puddles) {
      const z = p.wz;
      if (z.t <= 0) continue;
      const fade = Math.min(1, z.t / 2.5);
      g.globalAlpha = 0.5 * fade;
      ellipse(g, z.x, z.y, z.r, z.r * 0.62, '#4f86bd');
      g.globalAlpha = 0.45 * fade;
      ellipse(g, z.x - 1, z.y - 1, z.r * 0.72, z.r * 0.4, '#7fb6e0');
      // gleam
      g.globalAlpha = 0.8 * fade;
      const k = (t * 1.4 + p.seed) % 6.28;
      g.fillStyle = '#e8f6ff';
      g.fillRect(Math.round(z.x + Math.cos(k) * z.r * 0.5), Math.round(z.y + Math.sin(k) * z.r * 0.28), 2, 1);
      if (p.elec > 0) {
        const flick = (Math.floor(t * 18) + p.seed) % 3;
        g.globalAlpha = flick === 0 ? 0.65 : 0.3;
        ellipse(g, z.x, z.y, z.r, z.r * 0.62, flick === 1 ? '#ffffff' : '#7fe0ff');
        g.globalAlpha = 0.9;
        for (let i = 0; i < 3; i++) {
          const a = (t * 7 + i * 2.1 + p.seed) % 6.28;
          const x0 = z.x + Math.cos(a) * z.r * 0.7, y0 = z.y + Math.sin(a) * z.r * 0.4;
          const x1 = z.x + Math.cos(a + 1.3) * z.r * 0.45, y1 = z.y + Math.sin(a + 1.3) * z.r * 0.25;
          line(g, x0, y0, (x0 + x1) / 2 + (flick - 1) * 3, (y0 + y1) / 2 - 2, '#eaffff');
          line(g, (x0 + x1) / 2 + (flick - 1) * 3, (y0 + y1) / 2 - 2, x1, y1, '#9fe8ff');
        }
      }
      g.globalAlpha = 1;
    }
  }

  renderAir(g: Ctx): void {
    const t = app.time;
    for (const c of this.clouds) {
      const grow = Math.min(1, (c.max - c.t) / 0.35 + 0.35);
      const fade = Math.min(1, c.t / 1.3);
      for (const p of c.puffs) {
        const bob = Math.sin(t * 1.6 + p.ph) * 1.5;
        g.globalAlpha = 0.58 * fade;
        ellipse(g, c.x + p.dx * grow, c.y - 8 + p.dy * grow + bob, p.r * grow, p.r * grow * 0.78, p.col);
      }
      g.globalAlpha = 1;
    }
    for (const b of this.blasts) {
      const k = 1 - b.t / b.max;            // 0 -> 1
      const cy = b.y - 6;
      if (b.hot) {
        if (k < 0.7) { g.globalAlpha = 1 - k * 1.1; ellipse(g, b.x, cy, b.r * (0.35 + k * 0.75), b.r * (0.35 + k * 0.75) * 0.8, k < 0.2 ? '#ffffff' : '#ff8a2a'); }
        if (k < 0.5) { g.globalAlpha = 1 - k * 1.6; ellipse(g, b.x, cy, b.r * (0.22 + k * 0.6), b.r * (0.22 + k * 0.6) * 0.8, k < 0.3 ? '#fff2a8' : '#ffd34d'); }
        g.globalAlpha = 0.55 * (1 - k);
        ellipse(g, b.x, cy - k * 8, b.r * (0.5 + k * 0.7), b.r * (0.5 + k * 0.7) * 0.7, '#3a3a40');
        g.globalAlpha = 1;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 6.283 + b.x, l0 = b.r * (0.3 + k * 0.7), l1 = l0 + b.r * 0.35 * (1 - k);
          line(g, b.x + Math.cos(a) * l0, cy + Math.sin(a) * l0 * 0.8, b.x + Math.cos(a) * l1, cy + Math.sin(a) * l1 * 0.8, k < 0.4 ? '#ffffff' : '#ffb04a');
        }
      } else {
        g.globalAlpha = 0.7 * (1 - k);
        ellipse(g, b.x, cy, b.r * (0.3 + k * 0.8), b.r * (0.3 + k * 0.8) * 0.75, b.col ?? '#e8eef2');
        g.globalAlpha = 1;
      }
    }
    if (this.flash > 0.01) {
      const r = app.renderer;
      g.globalAlpha = Math.min(0.5, this.flash);
      g.fillStyle = '#fff2c8';
      g.fillRect(r.viewX(), r.viewY(), r.W, r.H);
      g.globalAlpha = 1;
    }
    for (const a of this.arcs) {
      const k = a.t / a.max;
      if (k < 0.18 && Math.floor(t * 40) % 2) continue;
      for (let i = 1; i < a.pts.length; i++) {
        if (a.big) line(g, a.pts[i - 1].x, a.pts[i - 1].y, a.pts[i].x, a.pts[i].y, '#3aa8ff', 3);
        line(g, a.pts[i - 1].x, a.pts[i - 1].y, a.pts[i].x, a.pts[i].y, '#d8faff', 1);
      }
    }
  }
}

/** The world only draws entities near the camera: pin the field's layers to the view centre. */
function pinToView(e: Entity): void {
  Object.defineProperty(e, 'x', { get: () => app.renderer.viewX() + app.renderer.W / 2, set: () => {}, configurable: true });
  Object.defineProperty(e, 'y', { get: () => app.renderer.viewY() + app.renderer.H / 2, set: () => {}, configurable: true });
}

class FieldFloor extends Entity {
  constructor(private f: Field) { super(); this.layer = 0; this.persist = true; pinToView(this); }
  update(dt: number): void { this.f.update(dt); }
  render(g: Ctx): void { this.f.renderFloor(g); }
}
class FieldAir extends Entity {
  constructor(private f: Field) { super(); this.layer = 2; this.persist = true; pinToView(this); }
  update(): void { /* driven by FieldFloor */ }
  render(g: Ctx): void { this.f.renderAir(g); }
}

/** Get (lazily creating) this world's hazard field. */
export function fieldOf(w: World): Field {
  const any = w as any;
  if (!any.__hazardField) {
    const f = new Field(w);
    any.__hazardField = f;
    w.add(new FieldFloor(f));
    w.add(new FieldAir(f));
  }
  return any.__hazardField as Field;
}

// ---------------------------------------------------------------------------
// Electricity
/** Set a puddle (and every puddle it touches) live. */
export function electrifyPuddle(f: Field, p: Puddle, secs: number, src: Actor | null): void {
  const seen = new Set<Puddle>();
  const stack = [p];
  while (stack.length) {
    const q = stack.pop()!;
    if (seen.has(q)) continue;
    seen.add(q);
    q.elec = Math.max(q.elec, secs);
    q.src = src ?? q.src;
    q.tick = Math.min(q.tick, 0.05);
    for (const o of f.puddles) {
      if (seen.has(o) || o.wz.t <= 0) continue;
      if (Math.hypot(o.wz.x - q.wz.x, (o.wz.y - q.wz.y)) < (o.wz.r + q.wz.r) * 0.9) stack.push(o);
    }
  }
}

/** Electrify any puddle near a point. Returns how many puddles (not counting flood fill) were hit. */
export function electrifyNear(w: World, x: number, y: number, r: number, secs = 5, src: Actor | null = null): number {
  const f = fieldOf(w);
  let n = 0;
  for (const p of f.puddles.slice()) {
    if (p.wz.t <= 0) continue;
    if (Math.hypot(p.wz.x - x, p.wz.y - y) < r + p.wz.r) { electrifyPuddle(f, p, secs, src); n++; }
  }
  return n;
}

/** True when an electrical prop (shorted socket / cable / rack / IT-tech-electrified) is close by. */
export function nearElectric(w: World, x: number, y: number, r: number): boolean {
  for (const p of w.props) {
    if (p.gone) continue;
    const k = p.def.kind;
    if (k !== 'cable_run' && k !== 'socket' && k !== 'server_rack' && k !== 'water_cooler') continue;
    if (!(p.state === 'active' || p.data.electrified)) continue;
    if (distToFoot(p, x, y) < r) return true;
  }
  return false;
}

let lastZap = -1;
/**
 * One electric shock to an actor: damage, brief stun, blue tint and, if the victim is wet, a chain through other wet actors
 * (spec 4.5: water conducts electricity; sprinklers make the whole room conductive).
 */
export function shock(w: World, a: Actor, dmg: number, src: Actor | null, kind: string, stun = 0.6, depth = 0, seen: Set<Actor> = new Set()): void {
  if (!a.alive || seen.has(a)) return;
  seen.add(a);
  const f = fieldOf(w);
  a.status.electrified = Math.max(a.status.electrified, 0.5);
  hurt(w, a, dmg, 'electric', { source: src, kind, stun, silent: false, dir: 0 });
  sparks(w.particles, a.x, a.y - 14, 6, '#bff4ff', 90);
  if (w.time - lastZap > 0.15 || w.time < lastZap) { audio.sfx('electric_zap', { x: a.x, y: a.y, vol: 0.55 }); lastZap = w.time; }
  if (depth >= 5) return;
  const room = w.roomAt(a.x, a.y);
  const conduct = f.sprinklersOn(room);
  for (const o of w.actors) {
    if (!o.alive || seen.has(o) || o.grabbedBy) continue;
    if (!(o.status.wet > 0)) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    const ok = conduct && w.roomAt(o.x, o.y) === room ? true : d < 46;
    if (!ok) continue;
    f.addArc(a.x, a.y - 10, o.x, o.y - 10, 0.2);
    shock(w, o, dmg * 0.7, src, kind, stun, depth + 1, seen);
  }
}

/** A deliberate burst of electricity at a point: zaps adjacent actors and electrifies nearby water. */
export function shortCircuit(w: World, x: number, y: number, r: number, dmg: number, src: Actor | null, kind: string): void {
  const f = fieldOf(w);
  sparks(w.particles, x, y - 6, 18, '#ffe9a0', 150);
  sparks(w.particles, x, y - 6, 12, '#bff4ff', 110);
  audio.sfx('server_spark', { x, y });
  electrifyNear(w, x, y, r + 8, 5, src);
  for (const a of actorsIn(w, x, y, r)) {
    f.addArc(x, y - 6, a.x, a.y - 10, 0.22, true);
    shock(w, a, dmg, src, kind, 0.7);
  }
}

/** Trigger room sprinklers (printer explosions, fire, sprinkler hit). */
export function sprinklersFor(w: World, roomId: number, src: Actor | null = null): void {
  const room = w.map.rooms[roomId];
  if (room?.sprinklers) fieldOf(w).triggerSprinklers(roomId, 8, src);
}
