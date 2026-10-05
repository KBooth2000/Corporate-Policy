// Shared AI toolkit for the 20 bespoke archetype behaviours (spec 5): positioning (flank slots, separation, kiting,
// support "stay behind the line"), hazard avoidance for AI-created zones, buffs, summons, a floor-level zone layer
// (cable trip-traps, electrified puddles, injunction fields, freshly mopped floors, smoke, wellbeing safe spaces),
// an overlay layer (rebrand labels, Auditor mark), a "morale" controller (player_rage / player_low_hp barks and
// room-wide unison chants from Act 2) and the caffeine-mug quirk.
//
// Every archetype registers through `define()`, which wraps its behaviour with the shared pre/post logic.
import { Enemy, registerBehaviour, Behaviour, pickBark } from '../enemy';
import { Entity, Actor, DamageInfo } from '../entity';
import type { World } from '../world';
import type { Ctx } from '../../render/canvas';
import { Vec, angleTo, dist, distToSegment, fromAngle, norm, clamp, angleDiff, TAU } from '../../core/math';
import { fxRng } from '../../core/rng';
import type { ArchetypeId, Tier } from '../../data/ids';
import { BARKS, BarkContext } from '../../data/text/barks';
import { audio } from '../../audio/audio';
import { sparks, smokePuff, debrisBurst } from '../fx';
import { drawText } from '../../render/font';
import { Shape, queryActors } from '../combat';
import { Projectile } from '../projectile';
import type { ProjectileKind } from '../../art/items';
import { T, TILE } from '../world-types';
import { FLOOR_HOOKS } from '../registry';

// ---------------------------------------------------------------------------------------------------------------
// Registration wrapper
export interface ArchSpec extends Behaviour {
  modifyIncoming?(e: Enemy, info: DamageInfo): number;
  /** Documentation of the seniority-tier extra behaviours (spec 5.3). */
  tiers: { senior: string; lead: string };
}

/** Per-archetype tier-extra documentation (also handy for a dev gallery / codex). */
export const TIER_EXTRAS: Partial<Record<ArchetypeId, { senior: string; lead: string }>> = {};
/** Hooks other modules (promotion) use to add per-enemy logic without touching the archetype files. */
export const INCOMING_HOOKS: ((e: Enemy, info: DamageInfo, amount: number) => number)[] = [];
export const THINK_HOOKS: ((e: Enemy, dt: number) => void)[] = [];
export const DEATH_HOOKS: ((e: Enemy, info: DamageInfo) => void)[] = [];
export const RENDER_HOOKS: ((e: Enemy, g: Ctx) => void)[] = [];

export function define(id: ArchetypeId, spec: ArchSpec): void {
  TIER_EXTRAS[id] = spec.tiers;
  const b: Behaviour & { modifyIncoming(e: Enemy, info: DamageInfo): number } = {
    weapon: spec.weapon,
    init(e) { commonInit(e); spec.init?.(e); },
    think(e, dt) {
      commonThink(e, dt);
      for (const h of THINK_HOOKS) h(e, dt);
      if (e.flags.chantT > 0) { e.flags.chantT -= dt; e.stop(dt); e.setAnim('chant'); return; }
      spec.think(e, dt);
    },
    onHurt(e, info, amount) { commonHurt(e, info, amount); spec.onHurt?.(e, info, amount); },
    onDeath(e, info) { spec.onDeath?.(e, info); for (const h of DEATH_HOOKS) h(e, info); },
    onAllyDeath(e, ally) {
      if (e.aware && gate(e.world, 'ally_death', 3.5) && e.rng.chance(0.6)) e.bark('ally_death');
      spec.onAllyDeath?.(e, ally);
    },
    render(e, g, before) {
      if (before) commonRenderUnder(e, g);
      spec.render?.(e, g, before);
      if (!before) for (const h of RENDER_HOOKS) h(e, g);
    },
    modifyIncoming(e, info) {
      let a = spec.modifyIncoming ? spec.modifyIncoming(e, info) : info.amount;
      for (const h of INCOMING_HOOKS) a = h(e, info, a);
      return a;
    },
  };
  registerBehaviour(id, b);
}

// ---------------------------------------------------------------------------------------------------------------
// Common per-enemy state
export interface Buff { id: string; t: number; spd: number; dmg: number; col: string; }

function commonInit(e: Enemy): void {
  const f = e.flags;
  f.baseSpeed = e.speed;
  f.baseDmg = e.damageMult;
  f.buffs = [] as Buff[];
  f.slot = e.rng.range(-1, 1);
  f.slotT = e.rng.range(2, 5);
  f.strafe = e.rng.sign();
  f.strafeT = e.rng.range(1.5, 3.5);
  f.stuckT = 0;
  f.lastX = e.x; f.lastY = e.y;
  f.fightStart = -1;
  f.chantT = 0;
}

/** Re-capture base speed/damage (call after changing stats post-construction, e.g. promotion). */
export function rebase(e: Enemy, speedMult = 1, dmgMult = 1): void {
  e.flags.baseSpeed = (e.flags.baseSpeed ?? e.speed) * speedMult;
  e.flags.baseDmg = (e.flags.baseDmg ?? e.damageMult) * dmgMult;
  e.speed = e.flags.baseSpeed; e.damageMult = e.flags.baseDmg;
}

function commonThink(e: Enemy, dt: number): void {
  const f = e.flags;
  if (f.fightStart < 0) f.fightStart = e.world.time;
  // buffs → speed / damage
  let s = 1, d = 1;
  const buffs = f.buffs as Buff[];
  for (const b of buffs) { b.t -= dt; s *= b.spd; d *= b.dmg; }
  if (buffs.some((b) => b.t <= 0)) f.buffs = buffs.filter((b) => b.t > 0);
  if (e.status.rebranded > 0) s *= 1.15;
  else if (f.origName) { e.name = f.origName; f.origName = null; f.brandName = null; } // rebrand expired
  e.speed = f.baseSpeed * s;
  e.damageMult = f.baseDmg * d;
  // flank slot re-roll
  f.slotT -= dt;
  if (f.slotT <= 0) { f.slotT = e.rng.range(2.5, 5); f.slot = clamp(f.slot + e.rng.range(-0.8, 0.8), -1, 1); }
  f.strafeT -= dt;
  if (f.strafeT <= 0) { f.strafeT = e.rng.range(1.5, 3.5); f.strafe = -f.strafe; }
  // stuck detection (for kiting / strafing against walls)
  const moved = Math.hypot(e.x - f.lastX, e.y - f.lastY);
  if (moved < 0.15 && Math.hypot(e.vx, e.vy) > 10) f.stuckT += dt; else f.stuckT = Math.max(0, f.stuckT - dt * 2);
  if (f.stuckT > 0.4) { f.strafe = -f.strafe; f.stuckT = 0; f.slot = -f.slot; }
  f.lastX = e.x; f.lastY = e.y;
}

function commonHurt(e: Enemy, info: DamageInfo, amount: number): void {
  // Caffeine-Dependent quirk: heavy hits and throws can smash their mug (spec 5.3) — they slow down (steer()).
  if (e.flags.caffeine && !e.flags.caffeineCrash && amount > 0 && (info.method === 'heavy' || info.method === 'throw' || info.method === 'body') && e.rng.chance(0.45)) {
    e.flags.caffeineCrash = true;
    e.world.floatText(e.x, e.y - e.height - 10, 'MUG SMASHED', '#c89a6a');
    debrisBurst(e.world.particles, e.x, e.y - 14, 6, ['#f4f1e8', '#d8d0c0', '#6b4a2b'], e.roomId, 'glass');
    audio.sfx('glass_shatter', { x: e.x, y: e.y, vol: 0.5, pitch: 1.5 });
    if (e.alive && e.rng.chance(0.5)) e.bark('hurt', e.rng.pick(['My mug! My only joy!', 'That was a Secret Santa mug!', 'No... the caffeine...']));
  }
}

function commonRenderUnder(e: Enemy, g: Ctx): void {
  const buffs = e.flags.buffs as Buff[] | undefined;
  if (!buffs?.length || e.corpse || e.dying) return;
  const b = buffs[buffs.length - 1];
  const a = 0.35 + 0.25 * Math.sin(e.world.time * 8);
  g.save(); g.globalAlpha = a; g.strokeStyle = b.col; g.lineWidth = 1;
  g.beginPath(); g.ellipse(Math.round(e.x) + 0.5, Math.round(e.y) + 0.5, e.radius + 4, (e.radius + 4) * 0.45, 0, 0, TAU); g.stroke();
  g.restore();
}

export function addBuff(e: Enemy, id: string, t: number, spd: number, dmg: number, col: string): void {
  const buffs = (e.flags.buffs ??= []) as Buff[];
  const ex = buffs.find((b) => b.id === id);
  if (ex) { ex.t = Math.max(ex.t, t); ex.spd = spd; ex.dmg = dmg; }
  else buffs.push({ id, t, spd, dmg, col });
}

// ---------------------------------------------------------------------------------------------------------------
// Small utilities
export const P = (e: Enemy): any => e.world.player as any;

/** World-level throttle (e.g. stop six interns all saying "ally_death" at once). */
export function gate(w: World, key: string, cd: number): boolean {
  const m = ((w as any).__aiGate ??= {}) as Record<string, number>;
  if ((m[key] ?? -99) + cd > w.time) return false;
  m[key] = w.time;
  return true;
}

/** Bark with an optional world-level cooldown key. */
export function sayIf(e: Enemy, ctx: BarkContext, chance = 1, key?: string, cd = 4, text?: string): void {
  if (!e.alive || !e.rng.chance(chance)) return;
  if (key && !gate(e.world, key, cd)) return;
  e.bark(ctx, text);
}

export function allies(e: Enemy, r = 9999, includeSelf = false): Enemy[] {
  const out: Enemy[] = [];
  for (const a of e.world.actors) {
    if (!(a instanceof Enemy) || !a.alive || a.isBoss || (!includeSelf && a === e)) continue;
    if (a.roomId !== e.roomId && e.world.roomAt(a.x, a.y) !== e.world.roomAt(e.x, e.y)) continue;
    if (dist(a, e) > r) continue;
    out.push(a);
  }
  return out;
}

export function isWalkable(w: World, x: number, y: number, r = 5): boolean {
  return w.isWalkablePx(x, y) && w.isWalkablePx(x - r, y) && w.isWalkablePx(x + r, y) && w.isWalkablePx(x, y - r * 0.6) && w.isWalkablePx(x, y + r * 0.4);
}

/** Straight walkable line (tiles + tall props) between two points. */
export function clearLine(w: World, a: Vec, b: Vec): boolean {
  return w.raycast(a.x, a.y - 2, b.x, b.y - 2, { props: true }) === null;
}

// ---------------------------------------------------------------------------------------------------------------
// Movement (flow-field pathing + separation + zone avoidance; spec 5.4 "never stacks perfectly")
export function separation(e: Enemy, r = 20): Vec {
  let x = 0, y = 0;
  for (const a of e.world.actors) {
    if (a === e || !a.alive || a.team !== 'enemy') continue;
    const dx = e.x - a.x, dy = e.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > r || d < 0.01) continue;
    const k = (r - d) / r;
    x += (dx / d) * k; y += (dy / d) * k;
  }
  return { x, y };
}

/** Push away from AI hazard zones (electrified puddles, cables, fresh mopping) when alert (spec 5.4). */
export function zoneAvoid(e: Enemy): Vec {
  const L = (e.world as any).__aiZones as ZoneLayer | undefined;
  if (!L || !e.aware) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const z of L.zones) {
    if (z.kind === 'cable') {
      if (e.archetype === 'it_tech') continue;
      const d = distToSegment(e, z, { x: z.x2!, y: z.y2! });
      if (d < 14) { const mx = (z.x + z.x2!) / 2, my = (z.y + z.y2!) / 2; const a = angleTo({ x: mx, y: my }, e); x += Math.cos(a) * 1.2; y += Math.sin(a) * 1.2; }
    } else if (z.kind === 'shock' || (z.kind === 'mopped' && e.archetype !== 'caretaker')) {
      const d = dist(e, z);
      if (d < z.r + 12) { const a = angleTo(z, e); const k = (z.r + 12 - d) / (z.r + 12) * 2; x += Math.cos(a) * k; y += Math.sin(a) * k; }
    }
  }
  return { x, y };
}

/** Steer in a direction with separation + avoidance mixed in. */
export function go(e: Enemy, dir: Vec, speedMult: number, dt: number, opts: { noAvoid?: boolean; sep?: number } = {}): void {
  const s = separation(e);
  const z = opts.noAvoid ? { x: 0, y: 0 } : zoneAvoid(e);
  const k = opts.sep ?? 0.9;
  const d = norm({ x: dir.x + s.x * k + z.x, y: dir.y + s.y * k + z.y });
  e.steer(d, e.speed * speedMult, dt);
}

/** Direction towards a point: direct when walkable, else the flow field (which leads to the player). */
export function pathDir(e: Enemy, target: Vec): Vec {
  const d = dist(e, target);
  if (d < 220 && clearLine(e.world, e, target)) return norm({ x: target.x - e.x, y: target.y - e.y });
  return e.world.flowDir(e.x, e.y) ?? norm({ x: target.x - e.x, y: target.y - e.y });
}

/** Close to `range` of the player at this enemy's flank slot (spreads packs around the player). */
export function approach(e: Enemy, dt: number, range: number, speedMult = 1, flank = 0.9): void {
  const p = P(e);
  const d = dist(e, p);
  const base = angleTo(p, e);
  // flankers bias towards the player's back
  let a = base + e.flags.slot * flank;
  if (e.flags.flanker) a = base + angleDiff(base, p.facing + Math.PI) * 0.5 + e.flags.slot * 0.5;
  const r = Math.max(4, range * 0.85);
  const tgt = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
  let dir: Vec;
  if (d > range * 2.2 || !clearLine(e.world, e, p)) dir = pathDir(e, d > range * 2.2 ? p : tgt);
  else dir = isWalkable(e.world, tgt.x, tgt.y) ? norm({ x: tgt.x - e.x, y: tgt.y - e.y }) : norm({ x: p.x - e.x, y: p.y - e.y });
  go(e, dir, speedMult, dt);
  e.face(angleTo(e, p));
}

/** Ranged spacing: keep [minD, maxD], reposition for LOS, strafe in the band (spec 5.4 ranged). */
export function kite(e: Enemy, dt: number, minD: number, maxD: number, speedMult = 1): void {
  const p = P(e);
  const d = dist(e, p);
  const sees = e.seesPlayer();
  if (!sees) {
    // reposition for line of sight: follow the flow field towards the player, sidestepping
    const f = e.world.flowDir(e.x, e.y) ?? norm({ x: p.x - e.x, y: p.y - e.y });
    go(e, f, speedMult * 0.9, dt);
  } else if (d < minD) {
    const away = norm({ x: e.x - p.x, y: e.y - p.y });
    const side = fromAngle(Math.atan2(away.y, away.x) + (Math.PI / 2) * e.flags.strafe);
    // if the retreat point is blocked, slide sideways instead (no cornering yourself)
    const probe = { x: e.x + away.x * 18, y: e.y + away.y * 18 };
    const dir = isWalkable(e.world, probe.x, probe.y) ? { x: away.x + side.x * 0.35, y: away.y + side.y * 0.35 } : side;
    go(e, dir, speedMult, dt);
  } else if (d > maxD) {
    go(e, pathDir(e, p), speedMult, dt);
  } else {
    const a = angleTo(p, e) + (Math.PI / 2) * e.flags.strafe;
    go(e, fromAngle(a), speedMult * 0.45, dt);
  }
  e.face(angleTo(e, p));
}

/** Supports: stay behind the allied line, relative to the player (spec 5.4). Falls back to kiting. */
export function behindAllies(e: Enemy, dt: number, back = 46, minD = 70, maxD = 150): void {
  const p = P(e);
  const front = allies(e, 260).filter((a) => a.arch.role !== 'support' && a.aware);
  const d = dist(e, p);
  if (!front.length || d < 55) { kite(e, dt, minD, maxD); return; }
  let cx = 0, cy = 0;
  for (const a of front) { cx += a.x; cy += a.y; }
  cx /= front.length; cy /= front.length;
  const away = norm({ x: cx - p.x, y: cy - p.y });
  const side = fromAngle(Math.atan2(away.y, away.x) + Math.PI / 2, e.flags.slot * 22);
  const tgt = { x: cx + away.x * back + side.x, y: cy + away.y * back + side.y };
  if (!isWalkable(e.world, tgt.x, tgt.y) || dist(tgt, p) < minD * 0.8) { kite(e, dt, minD, maxD); return; }
  const dd = dist(e, tgt);
  if (dd > 8) go(e, pathDir(e, tgt), dd > 40 ? 1 : 0.6, dt);
  else e.stop(dt);
  e.face(angleTo(e, p));
}

/** Panic flee (spec: interns flee at low HP). Does NOT avoid hazards — panicking staff can be lured into them. */
export function flee(e: Enemy, dt: number, speedMult = 1.15): void {
  const p = P(e);
  const away = norm({ x: e.x - p.x, y: e.y - p.y });
  const probe = { x: e.x + away.x * 16, y: e.y + away.y * 16 };
  const side = fromAngle(Math.atan2(away.y, away.x) + (Math.PI / 2) * e.flags.strafe);
  go(e, isWalkable(e.world, probe.x, probe.y) ? away : side, speedMult, dt, { noAvoid: true });
  e.face(Math.atan2(e.vy, e.vx));
}

// ---------------------------------------------------------------------------------------------------------------
// Attacks that need more than the base helpers
/** Telegraphed shot with full projectile options (line telegraph, then projectile(s)). */
export function shoot(e: Enemy, o: {
  windup?: number; kind?: ProjectileKind; itemId?: string; speed?: number; damage?: number; count?: number; spread?: number; cd?: number;
  gravity?: boolean; slow?: { amt: number; time: number }; type?: DamageInfo['type']; lead?: number; trail?: string; pierce?: number; life?: number;
  radius?: number; knockback?: number; angle?: number; anim?: 'throw' | 'cast' | 'attack1' | 'heavy'; recovery?: number; sfx?: Parameters<typeof audio.sfx>[0];
  onEnd?: (x: number, y: number, hit: Actor | null) => void; onFire?: () => void; noBusy?: boolean;
}): void {
  const w = e.world, p = P(e);
  const speed = o.speed ?? 200;
  let angle = o.angle ?? e.angleToPlayer();
  if (o.lead && o.angle === undefined) {
    const t = dist(e, p) / speed;
    angle = angleTo(e, { x: p.x + p.vx * t * o.lead, y: p.y + p.vy * t * o.lead });
  }
  const wu = e.windup(o.windup ?? 0.55);
  if (!o.noBusy) { e.busy = wu + (o.recovery ?? 0.2); e.vx = e.vy = 0; }
  e.attackCd = o.cd ?? 1.8;
  e.setAnim(o.anim ?? 'throw', true);
  const n = o.count ?? 1;
  const len = Math.min(280, dist(e, p) + 30);
  w.telegraph(e, { kind: 'line', x: e.x, y: e.y - 4, angle, len, width: 6 + n * 2 }, wu, (s: any) => {
    if (!e.alive) return;
    o.onFire?.();
    for (let i = 0; i < n; i++) {
      const a = s.angle + (n > 1 ? (i - (n - 1) / 2) * (o.spread ?? 0.15) : 0);
      w.add(new Projectile({
        team: 'enemy', x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 4, z: 12, angle: a, speed, kind: o.kind, itemId: o.itemId,
        spin: o.itemId ? 14 : 0, gravity: o.gravity, life: o.life ?? 2.2, radius: o.radius ?? 3, slow: o.slow, trail: o.trail, pierce: o.pierce,
        dmg: { amount: e.dmg(o.damage ?? e.arch.damage), type: o.type ?? 'blunt', method: 'ranged', source: e, knockback: o.knockback ?? 60, weaponId: o.itemId },
        onHit: (pp, t) => {
          if (t && t.team === 'player') e.dealtToPlayerAt = w.time;
          if (o.onEnd && (!t || t.team === 'player')) o.onEnd(pp.x, pp.y, t);
        },
      }));
    }
    audio.sfx(o.sfx ?? 'enemy_throw', { x: e.x, y: e.y });
  }, { follow: (s: any) => { s.x = e.x; s.y = e.y - 4; } });
}

/** Melee arc (like Enemy.meleeAttack) with an onFire callback and extras. Always telegraphed (spec 5.4). */
export function swing(e: Enemy, o: {
  windup: number; reach: number; arc?: number; damage?: number; knockback?: number; heavy?: boolean; type?: DamageInfo['type'];
  anim?: 'attack1' | 'attack2' | 'attack3' | 'heavy' | 'cast'; cd?: number; bleed?: number; angle?: number; stun?: number; lunge?: number; recovery?: number;
  onFire?: (angle: number) => void; onHit?: (t: Actor) => void;
}): void {
  const w = e.world;
  const angle = o.angle ?? e.angleToPlayer();
  const wu = e.windup(o.windup);
  const arc = o.arc ?? 1.6;
  e.busy = wu + (o.recovery ?? 0.25);
  e.attackCd = o.cd ?? 1.1;
  e.vx = e.vy = 0;
  e.setAnim(o.anim ?? 'attack1', true);
  e.face(angle);
  w.telegraph(e, { kind: 'arc', x: e.x, y: e.y - 6, r: o.reach, angle, half: arc / 2 }, wu, () => {
    if (!e.alive) return;
    if (o.lunge) w.moveActor(e, Math.cos(angle) * o.lunge, Math.sin(angle) * o.lunge);
    e.swingVis = { t: 0, dur: 0.15, angle, arc, reach: o.reach };
    audio.sfx(o.heavy ? 'golf_swing' : 'enemy_swing', { x: e.x, y: e.y });
    const shape: Shape = { kind: 'arc', x: e.x, y: e.y - 6, r: o.reach, angle, half: arc / 2 };
    for (const t of queryActors(w, shape, 'player')) {
      const dealt = w.damage(t, { amount: e.dmg(o.damage ?? e.arch.damage), type: o.type ?? 'blunt', method: 'melee', source: e, knockback: o.knockback ?? 120, dir: angle, bleed: o.bleed, weaponId: e.weapon?.id });
      if (dealt > 0) { e.dealtToPlayerAt = w.time; if (o.stun) t.status.stun = Math.max(t.status.stun, o.stun); o.onHit?.(t); }
    }
    for (const p of w.propsNear(e.x, e.y, o.reach)) if (p.def.hazard && Math.abs(angleDiff(angle, angleTo(e, p.def))) < arc / 2) w.hitProp(p, { amount: 6, type: 'blunt', method: 'melee', source: e, heavy: o.heavy });
    o.onFire?.(angle);
  }, { heavy: o.heavy, follow: (s: any) => { s.x = e.x; s.y = e.y - 6; } });
}

/** Telegraphed circle/ring burst at a point (slams, shockwaves, values rings). */
export function burst(e: Enemy, o: {
  x: number; y: number; r: number; inner?: number; windup: number; damage?: number; knockback?: number; type?: DamageInfo['type']; heavy?: boolean;
  stun?: number; cd?: number; busy?: boolean; follow?: boolean; recovery?: number; anim?: 'heavy' | 'cast' | 'attack1' | 'chant';
  onFire?: (x: number, y: number) => void; noDamage?: boolean;
}): void {
  const w = e.world;
  const wu = e.windup(o.windup);
  if (o.busy !== false) { e.busy = wu + (o.recovery ?? 0.2); e.vx = e.vy = 0; if (o.anim) e.setAnim(o.anim, true); }
  if (o.cd !== undefined) e.attackCd = o.cd;
  const shape: Shape = o.inner ? { kind: 'ring', x: o.x, y: o.y, r: o.r, inner: o.inner } : { kind: 'circle', x: o.x, y: o.y, r: o.r };
  w.telegraph(e, shape, wu, (s: any) => {
    if (!e.alive) return;
    if (!o.noDamage) for (const t of queryActors(w, s, 'player')) {
      const dir = angleTo(s, t);
      const dealt = w.damage(t, { amount: e.dmg(o.damage ?? e.arch.damage), type: o.type ?? 'blunt', method: 'melee', source: e, knockback: o.knockback ?? 140, dir });
      if (dealt > 0) { e.dealtToPlayerAt = w.time; if (o.stun) t.status.stun = Math.max(t.status.stun, o.stun); }
    }
    o.onFire?.(s.x, s.y);
  }, { heavy: o.heavy, follow: o.follow ? (s: any) => { s.x = e.x; s.y = e.y; } : undefined });
}

/** Telegraphed instant line hit (tasers, laser beams). `track` rotates the line towards the player for the first 60% of the windup. */
export function lineHit(e: Enemy, o: {
  len: number; width: number; windup: number; damage?: number; type?: DamageInfo['type']; angle?: number; track?: number; stun?: number; knockback?: number;
  col: string; cd?: number; recovery?: number; anim?: 'cast' | 'attack1' | 'throw'; sfx?: Parameters<typeof audio.sfx>[0]; busy?: boolean; stopAtWalls?: boolean;
  onFire?: (end: Vec) => void; onTarget?: (t: Actor) => void;
}): void {
  const w = e.world;
  const wu = e.windup(o.windup);
  if (o.busy !== false) { e.busy = wu + (o.recovery ?? 0.25); e.vx = e.vy = 0; e.setAnim(o.anim ?? 'cast', true); }
  if (o.cd !== undefined) e.attackCd = o.cd;
  const start = o.angle ?? e.angleToPlayer();
  const reach = (a: number) => {
    if (o.stopAtWalls === false) return o.len;
    const hit = w.raycast(e.x, e.y - 8, e.x + Math.cos(a) * o.len, e.y - 8 + Math.sin(a) * o.len, { projectile: true, props: false });
    return hit ? Math.max(10, Math.hypot(hit.x - e.x, hit.y - (e.y - 8))) : o.len;
  };
  const shape: any = { kind: 'line', x: e.x, y: e.y - 4, angle: start, len: reach(start), width: o.width };
  const tel = w.telegraph(e, shape, wu, (s: any) => {
    if (!e.alive) return;
    s.len = reach(s.angle);
    const end = { x: s.x + Math.cos(s.angle) * s.len, y: s.y + Math.sin(s.angle) * s.len };
    beamFx(w, { x: s.x, y: s.y - 4 }, { x: end.x, y: end.y - 4 }, o.col, 0.22, Math.max(1, Math.round(o.width / 4)));
    sparks(w.particles, end.x, end.y - 4, 5, o.col, 70);
    for (const t of queryActors(w, s, 'player')) {
      if ((t as any).dashT > 0) continue; // dashed through it
      o.onTarget?.(t);
      if (o.damage === 0) continue;
      const dealt = w.damage(t, { amount: e.dmg(o.damage ?? e.arch.damage), type: o.type ?? 'electric', method: 'ranged', source: e, knockback: o.knockback ?? 40, dir: s.angle });
      if (dealt > 0) { e.dealtToPlayerAt = w.time; if (o.stun) t.status.stun = Math.max(t.status.stun, o.stun); }
    }
    if (o.sfx) audio.sfx(o.sfx, { x: e.x, y: e.y });
    o.onFire?.(end);
  }, {
    follow: (s: any) => {
      s.x = e.x; s.y = e.y - 4;
      if (o.track && tel && tel.t < tel.dur * 0.6) {
        const want = e.angleToPlayer();
        const d = angleDiff(s.angle, want);
        s.angle += clamp(d, -o.track * (1 / 60), o.track * (1 / 60));
        s.len = reach(s.angle);
      }
    },
  });
}

/** Telegraphed straight-line dash (Sales Rep / Auditor lunges / Compliance charge). The dash runs in `runDash`. */
export function startDash(e: Enemy, o: { len: number; windup: number; speed: number; damage: number; width?: number; knockback?: number; type?: DamageInfo['type']; bleed?: number; then?: (e: Enemy) => void; label?: string; angle?: number }): void {
  const a = o.angle ?? e.angleToPlayer();
  const wu = e.windup(o.windup);
  e.busy = wu + 0.05;
  e.vx = e.vy = 0;
  e.setAnim('heavy', true);
  e.face(a);
  const shape: Shape = { kind: 'line', x: e.x, y: e.y - 4, angle: a, len: o.len, width: o.width ?? 14 };
  e.world.telegraph(e, shape, wu, () => {
    if (!e.alive) return;
    e.flags.dash = { a, left: o.len, speed: o.speed, damage: o.damage, hit: false, kb: o.knockback ?? 180, type: o.type ?? 'blunt', bleed: o.bleed, then: o.then };
    audio.sfx('whoosh', { x: e.x, y: e.y });
  }, { follow: (s: any) => { s.x = e.x; s.y = e.y - 4; } });
}

/** Advance an active dash. Returns true while dashing (caller should return). Dashes ignore hazard avoidance (lure-able). */
export function runDash(e: Enemy, dt: number): boolean {
  const d = e.flags.dash;
  if (!d) return false;
  const step = Math.min(d.left, d.speed * dt);
  const dx = Math.cos(d.a) * step, dy = Math.sin(d.a) * step;
  const r = e.world.moveActor(e, dx, dy);
  d.left -= step;
  e.vx = Math.cos(d.a) * d.speed * 0.3; e.vy = Math.sin(d.a) * d.speed * 0.3;
  e.setAnim('dash');
  e.ghost = true;
  if (fxRng.chance(0.6)) e.world.particles.spawn({ kind: 'smoke', x: e.x, y: e.y - 2, life: 0.25, col: '#c8c8c8', size: 3, drag: 4 });
  const p = P(e);
  if (!d.hit && p.alive && dist(e, p) < e.radius + p.radius + 6) {
    d.hit = true;
    const dealt = e.world.damage(p, { amount: e.dmg(d.damage), type: d.type, method: 'melee', source: e, knockback: d.kb, dir: d.a, bleed: d.bleed, weaponId: e.weapon?.id });
    if (dealt > 0) e.dealtToPlayerAt = e.world.time;
  }
  if (r.hitX || r.hitY) {
    // slammed into a wall/prop: stunned — a punish window (deaths are the player's fault, so are the rep's)
    e.flags.dash = null; e.ghost = false;
    e.status.stun = Math.max(e.status.stun, 0.7);
    audio.sfx('thud', { x: e.x, y: e.y, vol: 0.6 });
    e.world.floatText(e.x, e.y - e.height - 6, 'OOF', '#ffffff');
    return true;
  }
  if (d.left <= 0.01) {
    e.flags.dash = null; e.ghost = false;
    e.busy = 0.25;
    d.then?.(e);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Summons (Team Leader / Procurement Buyer / promotions)
export function summon(owner: Enemy, archetype: ArchetypeId, tier: Tier, x: number, y: number, tag: string): Enemy {
  const w = owner.world;
  const n = (owner.flags.summonCount = (owner.flags.summonCount ?? 0) + 1);
  const tmBase = owner.telegraphMult / Math.max(0.5, 1 - owner.tier * 0.1);
  const e = new Enemy({ archetype, tier, act: owner.act, floor: owner.floor, x, y, roomId: owner.roomId, rng: owner.rng.fork(`${tag}${n}`), aware: true, telegraphMult: tmBase });
  e.flags.summonedBy = owner.id;
  e.flags.summonTag = tag;
  e.cashDrop = Math.min(e.cashDrop, 1); // no farming summons
  w.add(e);
  w.assignToRoom(e, owner.roomId);
  w.bus.emit('enemySpawn', { enemy: e });
  return e;
}

export function liveSummons(owner: Enemy, tag?: string): Enemy[] {
  return owner.world.actors.filter((a): a is Enemy => a instanceof Enemy && a.alive && a.flags.summonedBy === owner.id && (!tag || a.flags.summonTag === tag));
}

/** A walkable spawn spot for a summon: a room spawn point near `near` that is not on top of the player. */
export function summonSpot(owner: Enemy, near: Vec, minFromPlayer = 50): Vec {
  const w = owner.world, p = P(owner);
  const room = w.map.rooms[owner.roomId];
  const pts = (room?.spawnPoints ?? []).filter((s) => dist(s, p) > minFromPlayer).sort((a, b) => dist(a, near) - dist(b, near));
  if (pts.length) return { x: pts[0].x + owner.rng.range(-4, 4), y: pts[0].y + owner.rng.range(-4, 4) };
  for (let i = 0; i < 12; i++) {
    const a = owner.rng.range(0, TAU), r = owner.rng.range(14, 30);
    const q = { x: near.x + Math.cos(a) * r, y: near.y + Math.sin(a) * r };
    if (isWalkable(w, q.x, q.y) && dist(q, p) > minFromPlayer * 0.6) return q;
  }
  return { x: owner.x, y: owner.y };
}

// ---------------------------------------------------------------------------------------------------------------
// Zone layer: floor-level persistent effects created by enemies. One per world, created lazily.
export type ZoneKind = 'cable' | 'shock' | 'mopped' | 'injunction' | 'smoke' | 'safe';
export interface Zone {
  kind: ZoneKind; x: number; y: number; r: number; t: number; max: number; owner: Enemy | null;
  x2?: number; y2?: number; data: Record<string, any>;
}

export class ZoneLayer extends Entity {
  zones: Zone[] = [];
  private tick = 0;
  constructor() { super(); this.layer = 0; this.persist = true; }

  add(z: Omit<Zone, 'max' | 'data'> & { data?: Record<string, any> }): Zone {
    const zz: Zone = { ...z, max: z.t, data: z.data ?? {} };
    this.zones.push(zz);
    return zz;
  }

  update(dt: number): void {
    const w = this.world;
    const p = w.player as any;
    this.x = p.x; this.y = p.y; // keep "in view" for the renderer
    this.tick += dt;
    for (const z of this.zones) {
      z.t -= dt;
      if (z.owner && z.data.followOwner) { if (z.owner.alive) { z.x = z.owner.x; z.y = z.owner.y; } else z.t = Math.min(z.t, 0.3); }
      switch (z.kind) {
        case 'cable': {
          const b = { x: z.x2!, y: z.y2! };
          const live = !!z.data.live;
          if (live && fxRng.chance(dt * 4)) { const k = fxRng.next(); sparks(w.particles, z.x + (b.x - z.x) * k, z.y + (b.y - z.y) * k - 1, 2, '#9fe8ff', 50); }
          if (p.alive && !(p.dashT > 0) && !p.thrown && distToSegment(p, z, b) < p.radius + 2) {
            z.t = 0;
            p.status.stun = Math.max(p.status.stun, live ? 0.75 : 0.5);
            p.status.slow = Math.max(p.status.slow, 1.6); p.status.slowAmt = Math.max(p.status.slowAmt, 0.4);
            const dealt = w.damage(p, { amount: z.data.damage ?? 4, type: live ? 'electric' : 'blunt', method: 'hazard', source: z.owner, hazardKind: 'cable_trap', knockback: 40 });
            if (dealt > 0 && z.owner) z.owner.dealtToPlayerAt = w.time;
            w.floatText(p.x, p.y - 38, live ? 'LIVE CABLE!' : 'TRIPPED!', live ? '#9fe8ff' : '#ffffff');
            audio.sfx(live ? 'electric_zap' : 'slip', { x: p.x, y: p.y });
            if (live) sparks(w.particles, p.x, p.y - 10, 10, '#9fe8ff');
            break;
          }
          // other staff trip over it too (lure them across)
          for (const a of w.actors) {
            if (!(a instanceof Enemy) || !a.alive || a.archetype === 'it_tech' || a.grabbedBy) continue;
            if (Math.hypot(a.vx, a.vy) < 30 && !a.thrown) continue;
            if (distToSegment(a, z, b) < a.radius + 1) {
              z.t = 0; a.status.stun = Math.max(a.status.stun, 0.9);
              if (live) w.damage(a, { amount: 8, type: 'electric', method: 'hazard', source: p, hazardKind: 'cable_trap' });
              w.floatText(a.x, a.y - a.height - 6, 'TRIPPED', '#ffffff');
              audio.sfx('slip', { x: a.x, y: a.y });
              break;
            }
          }
          break;
        }
        case 'shock': {
          z.data.pulse = (z.data.pulse ?? 0) - dt;
          if (fxRng.chance(dt * 10)) sparks(w.particles, z.x + fxRng.range(-z.r, z.r) * 0.8, z.y + fxRng.range(-z.r, z.r) * 0.4, 2, '#bff4ff', 70);
          if (z.data.pulse <= 0) {
            z.data.pulse = 0.55;
            for (const a of w.actors) {
              if (!a.alive || a.grabbedBy || a.thrown || a.team === 'neutral') continue;
              const dx = a.x - z.x, dy = (a.y - z.y) / 0.55;
              if (Math.hypot(dx, dy) > z.r) continue;
              if (a === p && p.dashT > 0) continue;
              const amt = a === p ? (z.data.damage ?? 5) : 9;
              const dealt = w.damage(a, { amount: amt, type: 'electric', method: 'hazard', source: a === p ? z.owner : p, hazardKind: 'water_cooler', silent: false });
              if (dealt > 0) { a.status.stun = Math.max(a.status.stun, 0.3); a.status.electrified = Math.max(a.status.electrified, 0.5); if (a === p && z.owner) z.owner.dealtToPlayerAt = w.time; }
            }
            audio.sfx('electric_zap', { x: z.x, y: z.y, vol: 0.45 });
          }
          break;
        }
        case 'mopped': {
          for (const a of w.actors) if (a.alive && !(a instanceof Enemy && a.archetype === 'caretaker') && Math.hypot(a.x - z.x, a.y - z.y) < z.r) a.status.wet = Math.max(a.status.wet, 0.3);
          if (p.alive && !z.data.slipped && Math.hypot(p.x - z.x, p.y - z.y) < z.r && Math.hypot(p.vx, p.vy) > 70 && !(p.dashT > 0)) {
            z.data.slipped = true;
            p.status.stun = Math.max(p.status.stun, 0.35);
            p.kx += p.vx * 0.8; p.ky += p.vy * 0.8;
            w.floatText(p.x, p.y - 38, 'SLIPPED!', '#9fd0ff');
            audio.sfx('slip', { x: p.x, y: p.y });
          }
          break;
        }
        case 'injunction': {
          if (p.alive && Math.hypot(p.x - z.x, (p.y - z.y) / 0.7) < z.r) {
            p.injunctionT = Math.max(p.injunctionT ?? 0, 0.2);
            if (z.data.contempt) p.status.injunction = Math.max(p.status.injunction, 0.2);
          }
          break;
        }
        case 'smoke': {
          if (fxRng.chance(dt * 12)) smokePuff(w.particles, z.x + fxRng.range(-z.r, z.r) * 0.7, z.y + fxRng.range(-z.r, z.r) * 0.5, 1, '#e8ecf0', 9);
          for (const a of w.actors) if (a instanceof Enemy && a.alive && a !== z.owner && Math.hypot(a.x - z.x, a.y - z.y) < z.r) a.status.blind = Math.max(a.status.blind, 0.3);
          break;
        }
        case 'safe': {
          for (const a of w.actors) if (a instanceof Enemy && a.alive && Math.hypot(a.x - z.x, (a.y - z.y) / 0.6) < z.r && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.04 * dt);
            if (fxRng.chance(dt * 3)) w.particles.spawn({ kind: 'pixel', x: a.x + fxRng.range(-4, 4), y: a.y - 20, vy: -20, life: 0.6, col: '#7fe0a0', size: 1, drag: 0 });
          }
          break;
        }
      }
    }
    if (this.zones.some((z) => z.t <= 0)) {
      for (const z of this.zones) if (z.t <= 0 && z.data.prop) z.data.prop.data.electrified = false;
      this.zones = this.zones.filter((z) => z.t > 0);
    }
    // the player's injunction timer decays here (player.ts only reads it)
    if (p.injunctionT > 0) p.injunctionT = Math.max(0, p.injunctionT - dt);
  }

  render(g: Ctx): void {
    const t = this.world.time;
    for (const z of this.zones) {
      const fade = Math.min(1, z.t / 0.5, (z.max - z.t) / 0.15 + 0.2);
      g.save();
      g.globalAlpha = fade;
      switch (z.kind) {
        case 'cable': {
          const x1 = Math.round(z.x), y1 = Math.round(z.y), x2 = Math.round(z.x2!), y2 = Math.round(z.y2!);
          g.strokeStyle = '#121418'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x1, y1 + 0.5); g.lineTo(x2, y2 + 0.5); g.stroke();
          g.strokeStyle = z.data.live ? '#3a7ea0' : '#4a5260'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          // plugs + blinking status LED
          g.fillStyle = '#d8d8d0'; g.fillRect(x1 - 2, y1 - 2, 4, 3); g.fillRect(x2 - 2, y2 - 2, 4, 3);
          g.fillStyle = Math.floor(t * 4) % 2 ? (z.data.live ? '#9fe8ff' : '#ff8a3a') : '#3a2a20';
          g.fillRect(x1 - 1, y1 - 1, 1, 1); g.fillRect(x2, y2 - 1, 1, 1);
          break;
        }
        case 'shock': {
          g.globalAlpha = fade * (0.3 + 0.12 * Math.sin(t * 22));
          g.fillStyle = '#4aa8e0';
          g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU); g.fill();
          g.globalAlpha = fade * 0.8;
          g.strokeStyle = '#bff4ff'; g.lineWidth = 1;
          g.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = t * 3 + i * 1.7 + Math.sin(t * 17 + i) * 0.6;
            const r0 = z.r * 0.2, r1 = z.r * 0.85;
            g.moveTo(z.x + Math.cos(a) * r0, z.y + Math.sin(a) * r0 * 0.55);
            g.lineTo(z.x + Math.cos(a + 0.3) * (r0 + r1) / 2, z.y + Math.sin(a - 0.4) * (r0 + r1) / 2 * 0.55);
            g.lineTo(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1 * 0.55);
          }
          g.stroke();
          break;
        }
        case 'mopped': {
          if (z.data.nosign) break;
          // little "caution: wet floor" A-frame sign so the hazard reads instantly
          const x = Math.round(z.x), y = Math.round(z.y);
          g.fillStyle = '#1a1a1e'; g.fillRect(x - 3, y - 9, 7, 10);
          g.fillStyle = '#f2c230'; g.fillRect(x - 2, y - 8, 5, 8);
          g.fillStyle = '#1a1a1e'; g.fillRect(x, y - 7, 1, 3); g.fillRect(x, y - 3, 1, 1);
          break;
        }
        case 'injunction': {
          g.globalAlpha = fade * 0.13;
          g.fillStyle = '#d9b45a';
          g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, TAU); g.fill();
          g.globalAlpha = fade * 0.85;
          g.strokeStyle = '#d9b45a'; g.lineWidth = 1; g.setLineDash([4, 3]); g.lineDashOffset = -t * 10;
          g.beginPath(); g.ellipse(Math.round(z.x) + 0.5, Math.round(z.y) + 0.5, z.r, z.r * 0.7, 0, 0, TAU); g.stroke();
          g.setLineDash([]);
          for (let i = 0; i < 3; i++) {
            const a = t * 0.6 + i * 2.094;
            drawText(g, 'S', z.x + Math.cos(a) * z.r * 0.6, z.y + Math.sin(a) * z.r * 0.42 - 4, { color: '#d9b45a', align: 'center', shadow: null });
          }
          break;
        }
        case 'safe': {
          g.globalAlpha = fade * (0.18 + 0.06 * Math.sin(t * 3));
          g.fillStyle = '#7fe0a0';
          g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, TAU); g.fill();
          g.globalAlpha = fade * 0.7; g.strokeStyle = '#7fe0a0'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(Math.round(z.x) + 0.5, Math.round(z.y) + 0.5, z.r, z.r * 0.6, 0, 0, TAU); g.stroke();
          break;
        }
        case 'smoke': break; // particles
      }
      g.restore();
    }
  }
}

export function zones(w: World): ZoneLayer {
  let L = (w as any).__aiZones as ZoneLayer | undefined;
  if (!L || L.dead || L.world !== w) { L = new ZoneLayer(); w.add(L); (w as any).__aiZones = L; }
  return L;
}

export function addWet(w: World, x: number, y: number, r: number, t: number, col = '#6aa8d8', owner: Enemy | null = null, slip = false, sign = true): void {
  const room = w.roomAt(x, y);
  w.decals.splat(room, x, y, Math.max(4, r * 0.55), col, 'wet');
  // freshly mopped floors are tracked by the zone layer (caretakers are immune); other spills use the shared wetZones
  if (slip) zones(w).add({ kind: 'mopped', x, y, r, t, owner, data: { nosign: !sign } });
  else ((w as any).wetZones ??= []).push({ x, y, r, t });
  for (let i = 0; i < 6; i++) w.particles.spawn({ kind: 'water', x: x + fxRng.range(-r, r) * 0.5, y: y + fxRng.range(-r, r) * 0.3, z: 4, vx: fxRng.range(-40, 40), vy: fxRng.range(-20, 20), vz: fxRng.range(20, 50), gravity: 200, life: 0.6, col, size: 1 });
}

/** Is there an exterior window within r px? (Fear of Heights, Fire Warden, etc.) */
export function windowNear(w: World, x: number, y: number, r: number): boolean {
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const t = w.tile(tx, ty); if (t === T.WINDOW || t === T.WINDOW_BROKEN) return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Overlay layer (above actors): rebrand name tags, the Auditor's mark on the player, short UI-like callouts.
export interface Callout { x: number; y: number; text: string; col: string; t: number; max: number; follow?: Actor; }

export interface BeamFx { a: Vec; b: Vec; col: string; t: number; max: number; width: number; }

export class OverlayLayer extends Entity {
  callouts: Callout[] = [];
  beams: BeamFx[] = [];
  constructor() { super(); this.layer = 2; this.persist = true; }
  update(dt: number): void {
    const p = this.world.player;
    this.x = p.x; this.y = p.y;
    for (const c of this.callouts) c.t -= dt;
    if (this.callouts.some((c) => c.t <= 0)) this.callouts = this.callouts.filter((c) => c.t > 0);
    for (const b of this.beams) b.t -= dt;
    if (this.beams.some((b) => b.t <= 0)) this.beams = this.beams.filter((b) => b.t > 0);
    morale(this.world, dt);
  }
  render(g: Ctx): void {
    const w = this.world;
    const p = w.player as any;
    for (const bm of this.beams) {
      g.save(); g.globalAlpha = Math.min(1, (bm.t / bm.max) * 1.5); g.strokeStyle = bm.col; g.lineWidth = bm.width;
      g.beginPath(); g.moveTo(Math.round(bm.a.x) + 0.5, Math.round(bm.a.y) + 0.5); g.lineTo(Math.round(bm.b.x) + 0.5, Math.round(bm.b.y) + 0.5); g.stroke();
      g.restore();
    }
    // rebranded allies: floating new name
    for (const a of w.actors) {
      if (!(a instanceof Enemy) || !a.alive || !(a.status.rebranded > 0) || !a.flags.brandName) continue;
      const y = Math.round(a.y - a.height - 16);
      drawText(g, a.flags.brandName, a.x, y, { align: 'center', color: '#ffb000', outline: '#1a0e00', alpha: Math.min(1, a.status.rebranded * 2) });
    }
    // the Auditor's mark: a red-pen ring and stamp over the player
    if (p.alive && p.status.marked > 0) {
      const a = Math.min(1, p.status.marked * 2);
      g.save(); g.globalAlpha = a * (0.7 + 0.3 * Math.sin(w.time * 9));
      g.strokeStyle = '#d42a2a'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, 10, 4.5, 0, 0, TAU); g.stroke();
      g.restore();
      drawText(g, 'AUDITED', p.x, p.y - p.height - 14, { align: 'center', color: '#ff5a4a', outline: '#200000', alpha: a });
    }
    if (p.alive && p.injunctionT > 0) drawText(g, 'INJUNCTION', p.x, p.y - p.height - (p.status.marked > 0 ? 24 : 14), { align: 'center', color: '#d9b45a', outline: '#1a1200' });
    for (const c of this.callouts) {
      const x = c.follow ? c.follow.x : c.x, y = c.follow ? c.follow.y - c.follow.height - 12 : c.y;
      const k = 1 - c.t / c.max;
      drawText(g, c.text, x, y - k * 6, { align: 'center', color: c.col, outline: '#0b0c10', alpha: Math.min(1, c.t * 3) });
    }
  }
}

export function overlay(w: World): OverlayLayer {
  let L = (w as any).__aiOverlay as OverlayLayer | undefined;
  if (!L || L.dead || L.world !== w) { L = new OverlayLayer(); w.add(L); (w as any).__aiOverlay = L; }
  return L;
}

export function callout(w: World, text: string, col: string, at: Actor | Vec, t = 1.4): void {
  const L = overlay(w);
  if (at instanceof Actor) L.callouts.push({ x: at.x, y: at.y, text, col, t, max: t, follow: at });
  else L.callouts.push({ x: at.x, y: at.y, text, col, t, max: t });
}

/** Expanding ring effect (never in telegraph colours). */
export function ring(w: World, x: number, y: number, size: number, col: string, life = 0.4): void {
  w.particles.spawn({ kind: 'ring', x, y, life, col, size });
}

/** A short-lived beam drawn between two points (ability tethers, lasers). */
export function beamFx(w: World, a: Vec, b: Vec, col: string, life = 0.2, width = 1): void {
  overlay(w).beams.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, col, t: life, max: life, width });
}

// ---------------------------------------------------------------------------------------------------------------
// Morale: shared bark triggers (player_rage, player_low_hp) + room-wide unison chants from Act 2 (spec 5.4 / 2.2).
function roomEnemies(w: World): Enemy[] {
  const room = w.currentRoom;
  const merged = w.rooms[room]?.mergedWith ?? -1;
  return w.actors.filter((a): a is Enemy => a instanceof Enemy && a.alive && a.aware && !a.isBoss && !a.grabbedBy && !a.thrown && (a.roomId === room || a.roomId === merged || w.roomAt(a.x, a.y) === room));
}

function morale(w: World, dt: number): void {
  const m = ((w as any).__aiMorale ??= { lowHpCd: 6, chantT: -1, rage: false, rageQ: [] as { e: Enemy; t: number }[] });
  const p = w.player as any;
  if (!p || !p.alive || w.cutscene) return;
  // player_rage: the room reacts when Rage kicks in
  if (p.raging > 0 && !m.rage) {
    m.rage = true;
    const list = roomEnemies(w).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 2);
    list.forEach((e, i) => m.rageQ.push({ e, t: 0.25 + i * 0.6 }));
  } else if (p.raging <= 0) m.rage = false;
  for (const q of m.rageQ) { q.t -= dt; if (q.t <= 0 && q.e.alive) { q.e.bark('player_rage'); if (q.e.rng.chance(0.5)) q.e.setAnim('flee', true); } }
  m.rageQ = m.rageQ.filter((q: any) => q.t > 0);
  // player_low_hp: someone always notices
  m.lowHpCd -= dt;
  if (p.hp / p.maxHp < 0.3 && m.lowHpCd <= 0) {
    const list = roomEnemies(w).filter((e) => w.los(e, p));
    if (list.length) { list.sort((a, b) => dist(a, p) - dist(b, p))[0].bark('player_low_hp'); m.lowHpCd = 14; }
  }
  // unison chants (Act 2+; Act 4 far more often)
  const act = (w.map.req.act ?? 1) as number;
  if (act < 2) return;
  if (m.chantT < 0) m.chantT = chantInterval(act, w);
  if (!w.inCombat) return;
  m.chantT -= dt;
  if (m.chantT > 0) return;
  const list = roomEnemies(w);
  const hasChampion = list.some((e) => e.archetype === 'culture_champion');
  m.chantT = chantInterval(act, w) * (hasChampion ? 0.6 : 1);
  if (list.length < 3) return;
  unisonChant(w, list);
}

function chantInterval(act: number, w: World): number {
  const r = w.rng.cosmetic;
  return act >= 4 ? r.range(14, 22) : act === 3 ? r.range(24, 36) : r.range(34, 50);
}

/** Every enemy in the room chants the same line together. They pause briefly — a readable window for the player. */
export function unisonChant(w: World, list: Enemy[]): void {
  const act = (w.map.req.act ?? 2) as 1 | 2 | 3 | 4;
  const pool = BARKS.filter((b) => b.context === 'chant' && b.archetype === 'any' && (!b.act || b.act <= act));
  const line = pool.length ? w.rng.cosmetic.pick(pool).text : pickBark(w.rng.cosmetic, list[0].archetype, 'chant', act) ?? 'Synergy!';
  const p = w.player as any;
  w.subtitles.push({ speaker: 'All staff (in unison)', text: line.toUpperCase(), t: 3.2, col: '#ffb0a0' });
  if (w.subtitles.length > 3) w.subtitles.shift();
  audio.sfx('chant', { x: p.x, y: p.y });
  for (const e of list) {
    w.bubbles = w.bubbles.filter((b) => b.actor !== e);
    w.bubbles.push({ actor: e, text: line, t: 2 });
    audio.voice(e.voiceSeed, 'chant', { x: e.x, y: e.y, syllables: 4 });
    if (p.alive && dist(e, p) < 220) p.addRage?.(e.barkRage * 0.7, true);
    if (!e.busy && !e.flags.dash) { e.flags.chantT = 0.9; e.setAnim('chant', true); }
  }
  w.bus.emit('bark', { speaker: list[0], text: line });
}

// Every floor gets the layers (cheap; they only do work when there are zones/callouts).
FLOOR_HOOKS.push((s) => { zones(s.world); overlay(s.world); });

// convenience re-exports for archetype files
export { dist, angleTo, fromAngle, norm, clamp, angleDiff, TAU };
export type { Vec };
