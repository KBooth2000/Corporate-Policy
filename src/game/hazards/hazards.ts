// Environmental hazards (spec 4.5, pillar 3 "the office is a weapon"). Registered per PropKind via registerProp().
// Everything here hurts enemies AND the player (spec: enemies take hazard damage too and can be lured into hazards).
// Damage always goes through hurt() (core.ts): method 'hazard', x hazardDamage for enemies, x hazardTaken for the player.
import { registerProp, World, PropRT, PropHit } from '../world';
import { Actor, Entity } from '../entity';
import type { Ctx } from '../../render/canvas';
import { fxRng } from '../../core/rng';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import { footprint, TILE } from '../world-types';
import { shapeHits } from '../combat';
import { debrisBurst, sparks, smokePuff } from '../fx';
import { Pickup } from '../pickups';
import { makeWeapon } from '../weapons';
import { angleDiff } from '../../core/math';
import {
  fieldOf, hurt, actorsIn, knockDown, centre, distToFoot, angleFrom, hitDir, isHeavy, isHard,
  shock, shortCircuit, electrifyPuddle, electrifyNear, nearElectric, sprinklersFor, Pt,
} from './core';

export const GLASS_COLS = ['#cfe8f4', '#9fd0e6', '#ffffff', '#7fb8d4'];
export const PAPER_COLS = ['#f4f1e8', '#dcd6c8', '#bcd4e6', '#ffffff'];

// ---------------------------------------------------------------------------
// Small effect helpers shared with destructibles.ts / executions.ts
export function paperBurst(w: World, x: number, y: number, n: number, dir?: number, spread = 3.2): void {
  const room = w.roomAt(x, y);
  for (let i = 0; i < n; i++) {
    const a = dir === undefined ? fxRng.range(0, 6.28) : dir + fxRng.range(-spread / 2, spread / 2), sp = fxRng.range(30, 120);
    w.particles.spawn({ kind: fxRng.chance(0.25) ? 'confetti' : 'paper', x, y, z: fxRng.range(6, 18), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: fxRng.range(30, 90), gravity: 150, life: fxRng.range(0.9, 1.8), col: fxRng.pick(PAPER_COLS), size: 2, toDecal: true, roomId: room, bounce: 0.1 });
  }
}

export function ring(w: World, x: number, y: number, size: number, col = '#ffffff', life = 0.35): void {
  w.particles.spawn({ kind: 'ring', x, y, z: 0, life, col, size });
}

/** Floor shards (persistent glass decals) scattered around a point. */
export function shardDecals(w: World, x: number, y: number, n: number, spreadX: number, spreadY = spreadX * 0.6): void {
  const room = w.roomAt(x, y);
  for (let i = 0; i < n; i++) {
    w.decals.add(room, { x: x + fxRng.range(-spreadX, spreadX), y: y + fxRng.range(-spreadY, spreadY), kind: 'glass', col: fxRng.pick(GLASS_COLS), size: fxRng.chance(0.2) ? 2 : 1, rot: 0 });
  }
}

/** Closest point on a prop's footprint to a point. */
function closestOn(p: PropRT, q: Pt): Pt {
  const f = footprint(p.def);
  return { x: Math.min(Math.max(q.x, f.x), f.x + f.w), y: Math.min(Math.max(q.y, f.y), f.y + f.h) };
}

/** Reduce hp (floor optional) and flip to 'damaged' under 50%. Returns true when hp hit the floor. */
export function chip(w: World, p: PropRT, hit: PropHit, floorHp = 0): boolean {
  p.hp = Math.max(floorHp, p.hp - hit.amount);
  if (p.hp < p.maxHp * 0.5 && p.state === 'intact') w.setPropState(p, 'damaged');
  return p.hp <= floorHp;
}

/** Rate-limit cosmetic hit feedback per prop. */
export function fxReady(w: World, p: PropRT, gap = 0.22): boolean {
  const last = (p.data.fxT as number | undefined) ?? -9;
  if (w.time - last < gap) return false;
  p.data.fxT = w.time;
  return true;
}

// ---------------------------------------------------------------------------
// glass_partition: damage or a thrown body shatters it -> cut damage + bleed to anyone adjacent, shards, non-solid.
function shatterGlass(w: World, p: PropRT, hit: PropHit): void {
  const c = centre(p);
  w.setPropState(p, 'destroyed');           // non-solid (thin prop): bodies fly straight through
  debrisBurst(w.particles, c.x, c.y, 26, GLASS_COLS, w.roomAt(c.x, c.y), 'glass');
  sparks(w.particles, c.x, c.y - 6, 8, '#ffffff', 110);
  shardDecals(w, c.x, c.y, 16, Math.max(10, p.def.w * 0.7));
  audio.sfx('glass_shatter', { x: c.x, y: c.y });
  app.renderer.shake(3.5, 0.2);
  const dir = hitDir(p, hit);
  for (const a of actorsIn(w, c.x, c.y, 8)) {
    if (a.grabbedBy) continue;
    if (distToFoot(p, a.x, a.y) > a.radius + 12) continue;
    hurt(w, a, 11, 'cut', { source: hit.source ?? null, kind: 'glass_partition', dir: angleFrom(c, a), knockback: 90, stagger: 30, bleed: 0.9 });
  }
  void dir;
}

registerProp('glass_partition', {
  maxHp: 12,
  onHit(w, p, hit) {
    if (p.state === 'destroyed') return true;
    p.hp -= hit.amount;
    if (isHard(hit) || hit.amount >= 8 || p.hp <= 0 || p.state === 'damaged') { shatterGlass(w, p, hit); return true; }
    // crack
    w.setPropState(p, 'damaged');
    const c = centre(p);
    sparks(w.particles, c.x, c.y - 4, 5, '#ffffff', 60);
    audio.sfx('glass_shatter', { x: c.x, y: c.y, vol: 0.3, pitch: 1.7 });
    return true;
  },
});

// ---------------------------------------------------------------------------
// printer: heavy hit -> 'active' (beeping, smoking) ~1.2 s fuse with a telegraphed circle -> explosion
const PRINTER_R = 40;
const PRINTER_FUSE = 1.2;

function armPrinter(w: World, p: PropRT, hit: PropHit | null): void {
  if (p.data.armed || p.state === 'destroyed') return;
  p.data.armed = true;
  p.data.src = hit?.source ?? null;
  p.data.beep = 0;
  w.setPropState(p, 'active');
  const c = centre(p);
  audio.sfx('printer_beep', { x: c.x, y: c.y });
  w.floatText(c.x, c.y - 14, 'PAPER JAM', '#ffd34d');
  // telegraph (reserved colour is drawn by the Telegraph itself)
  w.telegraph(null, { kind: 'circle', x: c.x, y: c.y, r: PRINTER_R }, PRINTER_FUSE, () => explodePrinter(w, p), { heavy: true });
}

export function explodePrinter(w: World, p: PropRT): void {
  if (p.gone || p.state === 'destroyed') return;
  const c = centre(p);
  const src = (p.data.src as Actor | null) ?? null;
  p.data.armed = false;
  w.setPropState(p, 'destroyed');
  const room = w.roomAt(c.x, c.y);
  for (const a of actorsIn(w, c.x, c.y, PRINTER_R)) {
    const d = Math.hypot(a.x - c.x, a.y - 4 - c.y);
    const f = 1 - 0.45 * Math.min(1, d / (PRINTER_R + a.radius));
    const dir = d < 2 ? fxRng.range(0, 6.28) : angleFrom(c, a);
    hurt(w, a, (a.team === 'player' ? 26 : 42) * f, 'explosive', { source: src, kind: 'printer', dir, knockback: 340 * f, stagger: 80, stun: 0.5 });
  }
  // chain reaction / collateral on neighbouring props
  for (const q of w.propsNear(c.x, c.y, PRINTER_R + 6)) {
    if (q === p || q.gone || q.state === 'destroyed') continue;
    if (q.def.hazard || q.maxHp > 0) w.hitProp(q, { amount: 30, type: 'explosive', method: 'hazard', source: src, dir: angleFrom(c, q.def), heavy: true });
  }
  // spectacle
  w.decals.splat(room, c.x, c.y + 2, 13, '#17130f', 'scorch');
  w.decals.splat(room, c.x + 6, c.y + 5, 7, '#2a221b', 'scorch');
  paperBurst(w, c.x, c.y - 4, 48);
  debrisBurst(w.particles, c.x, c.y, 16, ['#6a7480', '#8a94a0', '#3a4048', '#d8dce0'], room);
  smokePuff(w.particles, c.x, c.y - 4, 12, '#3a3a40', 9);
  smokePuff(w.particles, c.x, c.y - 4, 8, '#ff9a3a', 6);
  sparks(w.particles, c.x, c.y - 8, 22, '#ffd34d', 180);
  fieldOf(w).addBlast(c.x, c.y, PRINTER_R, true);
  ring(w, c.x, c.y - 4, PRINTER_R, '#ffd9a0', 0.4);
  for (let i = 0; i < 18; i++) { const a = fxRng.range(0, 6.28), sp = fxRng.range(40, 170); w.particles.spawn({ kind: 'debris', x: c.x, y: c.y, z: 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, vz: fxRng.range(40, 120), gravity: 300, life: 1.6, col: fxRng.pick(['#17130f', '#2a221b', '#3a3a40']), size: 1, toDecal: true, roomId: room, bounce: 0.2 }); }
  audio.sfx('explosion', { x: c.x, y: c.y });
  app.renderer.shake(7, 0.4);
  w.hitstop = Math.max(w.hitstop, 0.07);
  w.floatText(c.x, c.y - 20, 'TONER LEAK', '#ffb070');
  sprinklersFor(w, room, src);
}

registerProp('printer', {
  maxHp: 40,
  onHit(w, p, hit) {
    if (p.state === 'destroyed' || p.data.armed) return true;
    const c = centre(p);
    if (isHeavy(hit)) { armPrinter(w, p, hit); return true; }
    const spent = chip(w, p, hit, 0);
    if (fxReady(w, p)) { sparks(w.particles, c.x, c.y - 6, 4, '#ffe9a0', 70); audio.sfx('printer_beep', { x: c.x, y: c.y, vol: 0.4, pitch: 1.5 }); }
    if (spent) armPrinter(w, p, hit);
    return true;
  },
  update(w, p, dt) {
    if (!p.data.armed || p.state === 'destroyed') return;
    const c = centre(p);
    p.shake = Math.max(p.shake, 0.05);
    p.data.beep -= dt;
    if (p.data.beep <= 0) { p.data.beep = 0.2; audio.sfx('printer_beep', { x: c.x, y: c.y, vol: 0.5, pitch: 1 + fxRng.range(0, 0.4) }); }
    if (fxRng.chance(dt * 14)) w.particles.spawn({ kind: 'smoke', x: c.x + fxRng.range(-5, 5), y: c.y - 4, z: 8, vx: fxRng.range(-8, 8), vy: -14, life: 0.7, col: '#4a4a52', size: 4, drag: 1 });
    if (fxRng.chance(dt * 10)) sparks(w.particles, c.x + fxRng.range(-5, 5), c.y - 8, 2, '#ffd34d', 80);
    if (fxRng.chance(dt * 6)) w.particles.spawn({ kind: 'paper', x: c.x, y: c.y - 6, z: 10, vx: fxRng.range(-30, 30), vy: fxRng.range(-10, 30), vz: 50, gravity: 140, life: 1, col: '#f4f1e8', size: 2, roomId: w.roomAt(c.x, c.y) });
  },
});

// ---------------------------------------------------------------------------
// water_cooler: hit -> leaks a puddle (wet zone); electrified (IT Tech / socket / rack) -> stun + electric damage
function coolerLeak(w: World, p: PropRT, hit: PropHit | null, burst: boolean): void {
  const f = fieldOf(w);
  const x = p.def.x, y = p.def.y + 3;
  const src = hit?.source ?? null;
  const live = !!p.data.electrified || hit?.type === 'electric' || nearElectric(w, x, y, 26);
  if (!p.data.puddle || p.data.puddle.wz.t <= 0) {
    p.data.puddle = f.addPuddle(x, y, burst ? 28 : 20, burst ? 18 : 14, src, live);
  } else if (burst) {
    const q = p.data.puddle;
    q.wz.r = Math.max(q.wz.r, 28); q.wz.t = Math.max(q.wz.t, 18); q.max = Math.max(q.max, 18);
    w.decals.splat(w.roomAt(x, y), x, y, 14, '#6aa8d8', 'wet');
    if (live) electrifyPuddle(f, q, 6, src);
  }
  const room = w.roomAt(x, y);
  for (let i = 0; i < (burst ? 22 : 12); i++) {
    const a = fxRng.range(0, 6.28), sp = fxRng.range(20, burst ? 120 : 70);
    w.particles.spawn({ kind: 'water', x: p.def.x, y: p.def.y - 6, z: fxRng.range(6, 16), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: fxRng.range(20, 80), gravity: 260, life: 0.7, col: fxRng.pick(['#bfe4f6', '#8cc4e6', '#ffffff']), size: 1, roomId: room });
  }
  audio.sfx('water_splash', { x, y });
  if (!p.data.leaked) { p.data.leaked = true; w.floatText(p.def.x, p.def.y - 24, live ? 'LIVE LEAK' : 'LEAK', live ? '#9fe8ff' : '#9fd0f0'); }
}

registerProp('water_cooler', {
  maxHp: 36,
  onHit(w, p, hit) {
    if (p.state === 'destroyed') return true;
    const heavy = isHeavy(hit);
    const was = !!p.data.leaked;
    coolerLeak(w, p, hit, heavy || (was && isHard(hit)));
    p.hp -= hit.amount;
    if (!was) w.setPropState(p, 'damaged');
    if (heavy || p.hp <= 0) {
      w.setPropState(p, 'destroyed');
      app.renderer.shake(3, 0.15);
      audio.sfx('glass_shatter', { x: p.def.x, y: p.def.y, vol: 0.5, pitch: 1.3 });
      debrisBurst(w.particles, p.def.x, p.def.y - 8, 8, ['#bfe4f6', '#ffffff', '#8cc4e6'], w.roomAt(p.def.x, p.def.y), 'glass');
    }
    return true;
  },
  update(w, p, dt) {
    if (typeof p.data.electrified === 'number') { p.data.electrified -= dt; if (p.data.electrified <= 0) delete p.data.electrified; }
    const q = p.data.puddle as { wz: { t: number }; elec: number; src: Actor | null } | undefined;
    if (!q || q.wz.t <= 0) return;
    p.data.chk = (p.data.chk ?? 0) - dt;
    if (p.data.chk > 0) return;
    p.data.chk = 0.3;
    if ((p.data.electrified || nearElectric(w, p.def.x, p.def.y, 22)) && q.elec < 1) electrifyPuddle(fieldOf(w), q as any, 3, (p.data.src as Actor | null) ?? null);
    // trickle from the spout while it still has water
    if (p.state !== 'destroyed' && fxRng.chance(0.5)) w.particles.spawn({ kind: 'water', x: p.def.x + fxRng.range(-2, 2), y: p.def.y - 3, z: 6, vz: 0, gravity: 200, life: 0.3, col: '#8cc4e6', size: 1, roomId: w.roomAt(p.def.x, p.def.y) });
  },
});

// ---------------------------------------------------------------------------
// fire_extinguisher: hit or thrown -> knockback cone + vision-blocking smoke cloud (enemies inside go blind)
function burstExtinguisher(w: World, p: PropRT, hit: PropHit): void {
  if (p.state === 'destroyed') return;
  const c = centre(p);
  const dir = hitDir(p, hit);
  w.setPropState(p, 'destroyed');
  const cone = { kind: 'arc' as const, x: c.x, y: c.y, r: 82, angle: dir, half: 0.66 };
  for (const a of w.actors) {
    if (!a.alive || a.grabbedBy || !shapeHits(cone, a, a.radius)) continue;
    const d = Math.hypot(a.x - c.x, a.y - c.y);
    hurt(w, a, 3, 'blunt', { source: hit.source ?? null, kind: 'fire_extinguisher', dir: angleFrom(c, a), knockback: 330 * (1 - 0.4 * d / 90), stagger: 55 });
    if (a.team === 'enemy') a.status.blind = Math.max(a.status.blind, 2.5);
    a.status.burning = 0;
  }
  const f = fieldOf(w);
  f.addCloud(c.x + Math.cos(dir) * 36, c.y + Math.sin(dir) * 24, 38, 6.5);
  f.addCloud(c.x, c.y, 20, 5);
  f.addBlast(c.x, c.y, 30, false);
  const room = w.roomAt(c.x, c.y);
  for (let i = 0; i < 34; i++) {
    const a = dir + fxRng.range(-0.62, 0.62), sp = fxRng.range(70, 230);
    w.particles.spawn({ kind: 'pixel', x: c.x, y: c.y - 6, z: fxRng.range(2, 14), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, life: fxRng.range(0.3, 0.7), col: fxRng.pick(['#ffffff', '#e8eef2', '#cfd8de']), size: fxRng.chance(0.4) ? 2 : 1, drag: 3, roomId: room });
  }
  ring(w, c.x, c.y - 6, 26, '#ffffff', 0.3);
  audio.sfx('extinguisher_burst', { x: c.x, y: c.y });
  app.renderer.shake(3.5, 0.25);
  w.floatText(c.x, c.y - 18, 'WHOOSH', '#e8eef2');
}

registerProp('fire_extinguisher', {
  maxHp: 6,
  onHit(w, p, hit) {
    if (p.state === 'destroyed') return true;
    burstExtinguisher(w, p, hit);
    return true;
  },
});

// ---------------------------------------------------------------------------
// swivel_chair: kicked (melee or walked into at speed) -> rolling projectile, knocks enemies down, bounces off walls
interface Roll { vx: number; vy: number; t: number; hit: Set<Actor | PropRT>; src: Actor | null; wasSolid: boolean; }

function chairBlocked(w: World, self: PropRT, x: number, y: number): boolean {
  const r = 5;
  for (const [ox, oy] of [[-r, -2], [r, -2], [-r, -7], [r, -7], [0, 0]] as const) {
    if (w.isSolidTile(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return true;
  }
  for (const q of w.props) {
    if (q === self || q.gone || !q.solid) continue;
    const f = footprint(q.def);
    if (x + r < f.x || x - r > f.x + f.w || y < f.y || y - 8 > f.y + f.h) continue;
    return true;
  }
  return false;
}

function kickChair(w: World, p: PropRT, dir: number, speed: number, src: Actor | null): void {
  if (p.data.roll || p.state === 'destroyed') return;
  const roll: Roll = { vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, t: 0, hit: new Set(), src, wasSolid: p.solid };
  p.data.roll = roll;
  p.solid = false;
  w.rebuildPropBlock();
  w.setPropState(p, 'active');
  audio.sfx('chair_roll', { x: p.def.x, y: p.def.y });
  audio.sfx('kick', { x: p.def.x, y: p.def.y, vol: 0.6 });
  app.renderer.shake(1.5, 0.1);
  ring(w, p.def.x, p.def.y - 2, 10, '#ffffff', 0.2);
}

function stopChair(w: World, p: PropRT): void {
  const r = p.data.roll as Roll;
  p.data.roll = null;
  p.oy = 0;
  p.data.restore = r.wasSolid;
  w.setPropState(p, 'intact');
  p.data.cool = 0.4;
}

registerProp('swivel_chair', {
  maxHp: 999,
  onHit(w, p, hit) {
    if (p.state === 'destroyed' || p.data.roll) return true;
    const dir = hitDir(p, hit);
    kickChair(w, p, dir, hit.heavy || hit.body || hit.method === 'throw' ? 290 : 215, hit.source ?? null);
    return true;
  },
  update(w, p, dt) {
    const roll = p.data.roll as Roll | null;
    if (!roll) {
      // re-solidify once nobody is standing in it
      if (p.data.restore !== undefined) {
        const f = footprint(p.def);
        let free = true;
        for (const a of w.actors) {
          if (!a.alive) continue;
          if (a.x + a.radius > f.x && a.x - a.radius < f.x + f.w && a.y + a.radius * 0.4 > f.y && a.y - a.radius * 0.6 < f.y + f.h) { free = false; break; }
        }
        if (free) { p.solid = !!p.data.restore; delete p.data.restore; w.rebuildPropBlock(); }
      }
      // walking into it at speed is a kick
      p.data.cool = (p.data.cool ?? 0) - dt;
      const pl = w.player;
      if (p.data.cool > 0 || !pl.alive || pl.grabbedBy || p.data.restore !== undefined) return;
      const sp = Math.hypot(pl.vx, pl.vy);
      if (sp < 55) return;
      if (distToFoot(p, pl.x, pl.y - 2) > pl.radius + 2.5) return;
      const mv = Math.atan2(pl.vy, pl.vx);
      const to = angleFrom(pl, p.def);
      if (Math.abs(angleDiff(mv, to)) > 1.15) return;
      kickChair(w, p, mv, Math.min(300, 120 + sp * 1.6), pl);
      return;
    }
    // ---- rolling
    roll.t += dt;
    let sp = Math.hypot(roll.vx, roll.vy);
    if (sp < 24 || roll.t > 3) { stopChair(w, p); return; }
    const steps = Math.max(1, Math.ceil((sp * dt) / 3));
    for (let i = 0; i < steps; i++) {
      const nx = p.def.x + (roll.vx * dt) / steps, ny = p.def.y + (roll.vy * dt) / steps;
      let bounced = false;
      if (chairBlocked(w, p, nx, p.def.y)) { roll.vx *= -0.62; roll.vy *= 0.9; bounced = true; } else p.def.x = nx;
      if (chairBlocked(w, p, p.def.x, ny)) { roll.vy *= -0.62; roll.vx *= 0.9; bounced = true; } else p.def.y = ny;
      if (bounced) {
        audio.sfx('thud', { x: p.def.x, y: p.def.y, vol: 0.5 });
        debrisBurst(w.particles, p.def.x, p.def.y - 4, 4, ['#d0c8b8', '#a09888'], w.roomAt(p.def.x, p.def.y));
        app.renderer.shake(1.8, 0.1);
        break;
      }
    }
    const k = Math.exp(-1.45 * dt);
    roll.vx *= k; roll.vy *= k;
    sp = Math.hypot(roll.vx, roll.vy);
    p.oy = -Math.abs(Math.sin(roll.t * 22)) * 1.6;
    if (fxRng.chance(dt * 30)) w.particles.spawn({ kind: 'pixel', x: p.def.x, y: p.def.y, life: 0.25, col: '#cfc6b4', size: 1, drag: 3 });
    // knock enemies (and unlucky players) flat
    const dir = Math.atan2(roll.vy, roll.vx);
    for (const a of w.actors) {
      if (!a.alive || a.grabbedBy || roll.hit.has(a) || (a === roll.src && roll.t < 0.5)) continue;
      if (Math.hypot(a.x - p.def.x, a.y - 4 - (p.def.y - 4)) > a.radius + 6) continue;
      roll.hit.add(a);
      const heavy = sp > 150;
      hurt(w, a, (a.team === 'player' ? 5 : 12) * (heavy ? 1.3 : 1), 'blunt', { source: roll.src, kind: 'swivel_chair', dir, knockback: 190, stagger: 90 });
      knockDown(a, 1.3);
      roll.vx *= 0.62; roll.vy *= 0.62;
      audio.sfx('thud', { x: a.x, y: a.y });
      w.floatText(a.x, a.y - a.height - 8, 'CHAIR!', '#ffffff');
    }
    // clatter into other props
    if (sp > 110) {
      for (const q of w.propsNear(p.def.x, p.def.y, 8)) {
        if (q === p || roll.hit.has(q) || q.gone || !(q.def.hazard || q.maxHp > 0)) continue;
        roll.hit.add(q);
        w.hitProp(q, { amount: 12, type: 'blunt', method: 'body', source: roll.src, dir, body: true });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// filing_cabinet: heavy hit -> topples in the hit direction: crush line + becomes a new cover line
class ToppleAnim extends Entity {
  t = 0;
  constructor(private p: PropRT, private dir: 0 | 1 | 2 | 3, private dur: number, private onDone: () => void) { super(); this.layer = 1; this.persist = true; this.x = p.def.x; this.y = p.def.y; }
  override sortY(): number { return this.p.def.y + 1; }
  update(dt: number): void {
    this.t += dt;
    if (this.t >= this.dur) { this.dead = true; this.onDone(); }
  }
  render(g: Ctx): void {
    const p = this.p, w = this.world;
    const s = w.propSpriteFor(p);
    const k = Math.min(1, this.t / this.dur);
    const th = (Math.PI / 2) * k * k;
    const hw = p.def.w / 2;
    g.save();
    if (this.dir === 1 || this.dir === 3) {
      const sgn = this.dir === 1 ? 1 : -1;
      g.translate(Math.round(p.def.x + sgn * hw), Math.round(p.def.y));
      g.rotate(sgn * th);
      g.drawImage(s.img, s.sx, s.sy, s.w, s.h, Math.round(-sgn * hw - s.ox), -s.oy, s.w, s.h);
    } else {
      // towards / away from the viewer: foreshorten
      const sy = Math.max(0.3, Math.cos(th));
      const sh = this.dir === 0 ? 1 : -1;
      g.translate(Math.round(p.def.x), Math.round(p.def.y + sh * (1 - sy) * 4));
      g.scale(1, sy);
      g.drawImage(s.img, s.sx, s.sy, s.w, s.h, -s.ox, -s.oy, s.w, s.h);
    }
    g.restore();
  }
}

const TOPPLE_LEN = 32;

function toppleCabinet(w: World, p: PropRT, hit: PropHit): void {
  if (p.data.toppling || p.state === 'destroyed') return;
  const ang = hitDir(p, hit);
  // cardinal direction of the fall: 0 down, 1 right, 2 up, 3 left (matches PropDef.facing)
  const dir: 0 | 1 | 2 | 3 = Math.abs(Math.cos(ang)) >= Math.abs(Math.sin(ang)) ? (Math.cos(ang) >= 0 ? 1 : 3) : (Math.sin(ang) >= 0 ? 0 : 2);
  const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0, dy = dir === 0 ? 1 : dir === 2 ? -1 : 0;
  p.data.toppling = true;
  p.data.src = hit.source ?? null;
  const ox = p.def.x, oy = p.def.y, ow = p.def.w, oh = p.def.h;
  p.gone = true; // the falling sprite is drawn by ToppleAnim; collision is released while it falls
  w.rebuildPropBlock();
  audio.sfx('cabinet_topple', { x: ox, y: oy });
  w.floatText(ox, oy - 26, 'TIMBER', '#ffffff');
  w.add(new ToppleAnim(p, dir, 0.34, () => {
    // fit the lying footprint: shorten if a wall/prop is in the way
    let len = TOPPLE_LEN;
    const probe = (L: number): boolean => {
      for (let d = Math.max(oh, ow) / 2 + 2; d <= L; d += 4) {
        const px = ox + dx * (ow / 2 + d - 4), py = oy - 4 + dy * (oh / 2 + d - 4);
        if (w.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE))) return false;
        const q = w.propAt(px, py - 0, 0);
        if (q && q.solid && q !== p) return false;
      }
      return true;
    };
    while (len > Math.max(ow, oh) + 2 && !probe(len)) len -= 4;
    p.gone = false;
    p.state = 'destroyed';
    p.spriteCache.clear();
    p.def.facing = dir;
    p.def.exec = undefined;           // a toppled cabinet is no longer an execution object
    if (dir === 1 || dir === 3) {
      p.def.w = len; p.def.h = Math.max(10, oh + 2);
      p.def.x = ox + dx * (len - ow) / 2;
    } else {
      p.def.w = ow + 2; p.def.h = len;
      p.def.y = dir === 0 ? oy + (len - oh) : oy;
    }
    p.solid = true;
    w.rebuildPropBlock();
    const src = (p.data.src as Actor | null) ?? null;
    // crush line (also clears actors from the new footprint)
    const f = footprint(p.def);
    const line = { kind: 'line' as const, x: ox, y: oy - 5, angle: Math.atan2(dy, dx), len: len + 8, width: 18 };
    for (const a of w.actors) {
      if (!a.alive || a.grabbedBy) continue;
      const inFoot = a.x + a.radius > f.x && a.x - a.radius < f.x + f.w && a.y + a.radius * 0.4 > f.y && a.y - a.radius * 0.6 < f.y + f.h;
      if (!inFoot && !shapeHits(line, a, a.radius)) continue;
      hurt(w, a, a.team === 'player' ? 20 : 30, 'crush', { source: src, kind: 'filing_cabinet', dir: Math.atan2(dy, dx), knockback: 120, stagger: 90, stun: 0.9 });
      knockDown(a, 1.4);
      // step out of the footprint, past the end of the cabinet
      if (inFoot && a.alive) {
        const ex = dx ? (dx > 0 ? f.x + f.w + a.radius + 1 : f.x - a.radius - 1) : a.x;
        const ey = dy ? (dy > 0 ? f.y + f.h + a.radius * 0.6 + 1 : f.y - a.radius * 0.4 - 1) : a.y;
        if (!w.isSolidTile(Math.floor(ex / TILE), Math.floor(ey / TILE))) { a.x = ex; a.y = ey; }
      }
    }
    const cx = ox + dx * len * 0.6, cy = oy - 4 + dy * len * 0.6;
    const room = w.roomAt(cx, cy);
    smokePuff(w.particles, cx, cy, 10, '#cfc6b4', 7);
    paperBurst(w, cx, cy - 4, 26, Math.atan2(dy, dx), 2.4);
    debrisBurst(w.particles, cx, cy, 8, ['#8a94a0', '#6a7480', '#b8c0c8'], room);
    w.decals.splat(room, cx, cy + 3, 6, '#4a4540', 'scorch');
    ring(w, cx, cy, 24, '#cfc6b4', 0.3);
    audio.sfx('thud', { x: cx, y: cy });
    app.renderer.shake(5, 0.3);
    w.hitstop = Math.max(w.hitstop, 0.05);
    p.data.toppling = false;
  }));
}

registerProp('filing_cabinet', {
  maxHp: 60,
  onHit(w, p, hit) {
    if (p.state === 'destroyed' || p.data.toppling) return true;
    const c = centre(p);
    if (isHeavy(hit)) { toppleCabinet(w, p, hit); return true; }
    p.hp -= hit.amount;
    if (fxReady(w, p)) {
      paperBurst(w, c.x, c.y - 6, 4, hitDir(p, hit), 2);
      audio.sfx('thud', { x: c.x, y: c.y, vol: 0.45, pitch: 1.3 });
    }
    if (p.hp < p.maxHp * 0.5 && p.state === 'intact') w.setPropState(p, 'damaged');
    if (p.hp <= 0) toppleCabinet(w, p, hit);
    return true;
  },
});

// ---------------------------------------------------------------------------
// sprinkler / room sprinklers (RoomDef.sprinklers): fire / alarm / being hit -> room-wide slow, water conducts electricity
registerProp('sprinkler', {
  maxHp: 12,
  onHit(w, p, hit) {
    if (p.state === 'destroyed') return true;
    p.hp -= hit.amount;
    const room = w.roomAt(p.def.x, p.def.y + 6);
    if (isHard(hit) || hit.amount >= 6 || p.hp <= 0) {
      const f = fieldOf(w);
      const def = w.map.rooms[room];
      if (def && def.kind !== 'core') f.triggerSprinklers(room, 8, hit.source ?? null);
      else f.addPuddle(p.def.x, p.def.y + 10, 16, 8, hit.source ?? null);
      w.setPropState(p, 'active');
      p.data.until = w.time + 8;
      sparks(w.particles, p.def.x, p.def.y, 6, '#bfe4f6', 60);
    }
    return true;
  },
  update(w, p) {
    if (p.state === 'active' && p.data.until !== undefined && w.time > p.data.until) { w.setPropState(p, 'destroyed'); p.data.until = undefined; }
  },
});

// ---------------------------------------------------------------------------
// cable_run / socket: electric hazard. Hitting a socket shorts it: electrifies nearby water and zaps.
function shortProp(w: World, p: PropRT, hit: PropHit | null, secs: number): void {
  const at = hit?.source ? closestOn(p, hit.source) : centre(p);
  p.data.short = secs;
  p.data.src = hit?.source ?? null;
  p.data.at = at;
  w.setPropState(p, 'active');
  shortCircuit(w, at.x, at.y, p.def.kind === 'cable_run' ? 22 : 26, 10, hit?.source ?? null, p.def.kind);
  w.floatText(at.x, at.y - 14, 'ZAP', '#bff4ff');
  app.renderer.shake(2.5, 0.2);
}

function sparkUpdate(w: World, p: PropRT, dt: number, r: number): void {
  const d = p.data;
  if (typeof d.electrified === 'number') { d.electrified -= dt; if (d.electrified <= 0) delete d.electrified; }
  const live = d.short > 0 || !!d.electrified;
  if (!live) return;
  if (d.short > 0) {
    d.short -= dt;
    if (d.short <= 0) { d.short = 0; if (p.state === 'active') w.setPropState(p, p.def.kind === 'socket' ? 'destroyed' : 'damaged'); }
  }
  const at: Pt = d.at ?? centre(p);
  p.data.arcT = (p.data.arcT ?? 0) - dt;
  if (fxRng.chance(dt * 12)) sparks(w.particles, at.x + fxRng.range(-5, 5), at.y - 3, 2, '#ffe9a0', 90);
  if (p.data.arcT <= 0) {
    p.data.arcT = 0.4;
    const f = fieldOf(w);
    electrifyNear(w, at.x, at.y, r + 10, 1.5, (d.src as Actor | null) ?? null);
    for (const a of actorsIn(w, at.x, at.y, r)) {
      f.addArc(at.x, at.y - 4, a.x, a.y - 10, 0.18, true);
      shock(w, a, 6, (d.src as Actor | null) ?? null, p.def.kind, 0.5);
    }
  }
}

registerProp('socket', {
  maxHp: 10,
  onHit(w, p, hit) {
    if (p.state === 'destroyed' || p.data.short > 0) return true;
    shortProp(w, p, hit, 3);
    return true;
  },
  update(w, p, dt) { sparkUpdate(w, p, dt, 24); },
});

registerProp('cable_run', {
  maxHp: 20,
  onHit(w, p, hit) {
    if (p.state === 'destroyed' || p.data.short > 0) return true;
    shortProp(w, p, hit, 3.5);
    return true;
  },
  update(w, p, dt) { sparkUpdate(w, p, dt, 20); },
});

// ---------------------------------------------------------------------------
// server_rack: hit -> sparks + brief electric arc to nearby actors; damaged / active states
registerProp('server_rack', {
  maxHp: 80,
  onHit(w, p, hit) {
    const c = centre(p);
    p.hp = Math.max(1, p.hp - hit.amount);
    if (p.hp < p.maxHp * 0.5 && p.state === 'intact') w.setPropState(p, 'damaged');
    if ((p.data.cool ?? 0) > w.time) return true;
    p.data.cool = w.time + 0.9;
    p.data.activeUntil = w.time + 0.7;
    p.data.src = hit.source ?? null;
    w.setPropState(p, 'active');
    sparks(w.particles, c.x, c.y - 4, 12, '#ffe9a0', 130);
    sparks(w.particles, c.x, c.y - 4, 8, '#bff4ff', 100);
    audio.sfx('server_spark', { x: c.x, y: c.y });
    const f = fieldOf(w);
    electrifyNear(w, c.x, c.y, 34, 4, hit.source ?? null);
    for (const a of actorsIn(w, c.x, c.y, 40)) {
      if (distToFoot(p, a.x, a.y) > 40) continue;
      f.addArc(c.x, c.y - 6, a.x, a.y - 10, 0.2, true);
      shock(w, a, 8, hit.source ?? null, 'server_rack', 0.55);
    }
    return true;
  },
  update(w, p) {
    if (p.state === 'active' && p.data.activeUntil !== undefined && w.time > p.data.activeUntil) {
      w.setPropState(p, p.hp < p.maxHp * 0.5 ? 'damaged' : 'intact');
      p.data.activeUntil = undefined;
    }
    // IT Technician "electrified" flag: the rack crackles on its own
    if (p.data.electrified && fxRng.chance(0.03)) { const c = centre(p); sparks(w.particles, c.x, c.y - 4, 3, '#bff4ff', 90); }
  },
});

// ---------------------------------------------------------------------------
// Vending machines: a hard hit dislodges one caffeine/biscuit snack (fictional, heals a little)
function vendingHit(w: World, p: PropRT, hit: PropHit): boolean {
  const c = centre(p);
  p.hp = Math.max(1, p.hp - hit.amount);
  if (p.hp < p.maxHp * 0.5 && p.state === 'intact') w.setPropState(p, 'damaged');
  if (isHard(hit) && !p.data.dropped) {
    p.data.dropped = true;
    audio.sfx('vending_buy', { x: c.x, y: c.y });
    w.floatText(c.x, c.y - 22, 'SNACK DISPENSED', '#ffd34d');
    w.add(new Pickup({ kind: 'heal', amount: 12, x: c.x, y: p.def.y + 8, vx: fxRng.range(-30, 30), vy: 50 }));
    if (w.rng.loot.chance(0.4)) w.add(new Pickup({ kind: 'espresso', amount: 5, x: c.x + 8, y: p.def.y + 9, vx: fxRng.range(10, 40), vy: 40 }));
    debrisBurst(w.particles, c.x, c.y, 8, GLASS_COLS, w.roomAt(c.x, c.y), 'glass');
    app.renderer.shake(2.5, 0.15);
  } else if (fxReady(w, p)) {
    audio.sfx('thud', { x: c.x, y: c.y, vol: 0.5, pitch: 0.8 });
    sparks(w.particles, c.x, c.y - 4, 3, '#ffe9a0', 60);
  }
  return true;
}
registerProp(['vending_snack', 'vending_machine'], { maxHp: 70, onHit: vendingHit });

// ---------------------------------------------------------------------------
// microwave: dings. kettle: scald. knife_block: drops a sharp weapon when broken.
registerProp('microwave', {
  maxHp: 50,
  onHit(w, p, hit) {
    const c = centre(p);
    p.hp = Math.max(1, p.hp - hit.amount);
    if (p.hp < p.maxHp * 0.5 && p.state === 'intact') w.setPropState(p, 'damaged');
    if (fxReady(w, p, 0.35)) {
      audio.sfx('microwave_ding', { x: c.x, y: c.y, vol: 0.7 });
      sparks(w.particles, c.x, c.y - 2, 5, '#ffe9a0', 70);
      w.floatText(c.x, c.y - 16, 'DING', '#ffe9a0');
    }
    return true;
  },
});

registerProp('kettle', {
  maxHp: 14,
  onHit(w, p, hit) {
    if (p.state === 'destroyed') return true;
    const c = centre(p);
    const dir = hitDir(p, hit);
    p.hp -= hit.amount;
    if (!p.data.spilled) {
      p.data.spilled = true;
      w.setPropState(p, 'damaged');
      audio.sfx('kettle', { x: c.x, y: c.y });
      audio.sfx('water_splash', { x: c.x, y: c.y, vol: 0.6 });
      const sx = c.x + Math.cos(dir) * 12, sy = c.y + Math.sin(dir) * 10;
      fieldOf(w).addPuddle(sx, sy, 12, 6, hit.source ?? null, false);
      for (const a of actorsIn(w, sx, sy, 20)) {
        if (a.grabbedBy) continue;
        hurt(w, a, 7, 'fire', { source: hit.source ?? null, kind: 'kettle', dir: angleFrom(c, a), knockback: 70, stagger: 25 });
      }
      for (let i = 0; i < 10; i++) w.particles.spawn({ kind: 'smoke', x: sx + fxRng.range(-6, 6), y: sy, z: 6, vx: fxRng.range(-10, 10), vy: -12, life: 0.9, col: '#f4f8fa', size: 3, drag: 1 });
      w.floatText(c.x, c.y - 18, 'SCALDED', '#ffffff');
    }
    if (p.hp <= 0) { w.setPropState(p, 'destroyed'); debrisBurst(w.particles, c.x, c.y, 10, ['#c8ccd0', '#8a8f96', '#ffffff'], w.roomAt(c.x, c.y)); }
    return true;
  },
});

registerProp('knife_block', {
  maxHp: 10,
  onDestroyed(w, p) {
    const c = centre(p);
    const id = w.rng.loot.pick(['letter_opener', 'scissors']);
    w.add(new Pickup({ kind: 'weapon', weapon: makeWeapon(id), x: c.x, y: p.def.y + 6, vx: fxRng.range(-30, 30), vy: 40 }));
    debrisBurst(w.particles, c.x, c.y, 10, ['#8a6a43', '#b8925a', '#d8dce0'], w.roomAt(c.x, c.y));
    audio.sfx('debris', { x: c.x, y: c.y });
    w.floatText(c.x, c.y - 16, 'SHARP!', '#d8dce0');
  },
  onHit(w, p, hit) {
    const c = centre(p);
    if (fxReady(w, p)) { sparks(w.particles, c.x, c.y - 4, 3, '#d8dce0', 60); audio.sfx('hit_sharp', { x: c.x, y: c.y, vol: 0.4 }); }
    void hit;
    return false;
  },
});

