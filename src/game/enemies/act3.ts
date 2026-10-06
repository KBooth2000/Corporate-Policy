// Act 3 archetypes (spec 5.2): Accountant, Lawyer, Compliance Officer (bruiser), Procurement Buyer (support),
// Auditor (elite). Act minimum telegraph 0.30 s.
import { Enemy } from '../enemy';
import { Actor, DamageInfo } from '../entity';
import type { Ctx } from '../../render/canvas';
import { audio } from '../../audio/audio';
import { sparks, smokePuff, debrisBurst } from '../fx';
import { Projectile } from '../projectile';
import type { ArchetypeId, Tier } from '../../data/ids';
import {
  define, P, approach, kite, behindAllies, go, pathDir, sayIf, swing, burst, shoot, startDash, runDash, zones, lineHit,
  callout, ring, summon, roomAtCap, liveSummons, summonSpot, dist, angleTo, angleDiff, clamp, fromAngle, gate,
} from './common';

// ---------------------------------------------------------------------------------------------------------------
// ACCOUNTANT — ranged. Plants a calculator turret stance (stationary, precise slow projectiles with lead),
// packs up and relocates when pressured.

/** Senior Accountants deploy a standalone calculator turret: a small destructible gadget (not counted for room clear). */
export class CalcTurret extends Actor {
  owner: Enemy;
  fireT: number;
  ignoreForClear = true;
  ungrabbable = true;
  constructor(owner: Enemy, x: number, y: number) {
    super();
    this.owner = owner;
    this.team = 'enemy';
    this.x = x; this.y = y;
    this.radius = 4; this.mass = 50; this.height = 12;
    this.maxHp = this.hp = Math.round(16 + owner.floor * 1.2);
    this.staggerMax = 9999;
    this.fireT = 1.2;
  }
  update(dt: number): void {
    this.updateStatus(dt);
    if (!this.alive) return;
    const w = this.world, p = w.player as any;
    if (!this.owner.alive && !this.owner.corpse) { /* still dying */ }
    if (this.owner.corpse || !this.owner.alive) { w.damage(this, { amount: 999, type: 'blunt', method: 'other', unavoidable: true, silent: true }); return; }
    this.fireT -= dt;
    if (this.fireT <= 0 && p.alive && dist(this, p) < 210 && w.los(this, p)) {
      this.fireT = 2.4;
      const a = angleTo(this, p);
      const wu = this.owner.windup(0.6);
      w.telegraph(this, { kind: 'line', x: this.x, y: this.y - 4, angle: a, len: Math.min(240, dist(this, p) + 20), width: 6 }, wu, (s: any) => {
        if (!this.alive) return;
        w.add(new Projectile({
          team: 'enemy', x: this.x, y: this.y - 2, z: 8, angle: s.angle, speed: 120, kind: 'calc', life: 2.4, radius: 3, trail: '#9fe8a0',
          dmg: { amount: this.owner.dmg(this.owner.arch.damage * 0.7), type: 'blunt', method: 'ranged', source: this.owner, knockback: 40 },
          onHit: (_q, t) => { if (t && t.team === 'player') this.owner.dealtToPlayerAt = w.time; },
        }));
        audio.sfx('calculator_beep', { x: this.x, y: this.y, vol: 0.6 });
      });
    }
  }
  onDeath(_info: DamageInfo): void {
    sparks(this.world.particles, this.x, this.y - 6, 10, '#9fe8a0');
    debrisBurst(this.world.particles, this.x, this.y - 4, 6, ['#3a3e48', '#9fe8a0', '#d8d8d0'], this.world.roomAt(this.x, this.y));
    audio.sfx('debris', { x: this.x, y: this.y, vol: 0.6 });
    this.dead = true;
  }
  render(g: Ctx): void {
    const x = Math.round(this.x), y = Math.round(this.y);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 5, y, 10, 2);
    // tripod
    g.fillStyle = '#1a1a1e'; g.fillRect(x - 4, y - 5, 1, 5); g.fillRect(x + 3, y - 5, 1, 5); g.fillRect(x, y - 6, 1, 6);
    // calculator body
    g.fillStyle = '#1a1a1e'; g.fillRect(x - 5, y - 13, 10, 8);
    g.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#3a3e48'; g.fillRect(x - 4, y - 12, 8, 6);
    g.fillStyle = '#9fe8a0'; g.fillRect(x - 3, y - 11, 6, 2);
    g.fillStyle = '#c8ccd4'; g.fillRect(x - 3, y - 8, 1, 1); g.fillRect(x - 1, y - 8, 1, 1); g.fillRect(x + 1, y - 8, 1, 1);
    if (this.hp < this.maxHp) { g.fillStyle = '#0b0c10'; g.fillRect(x - 6, y - 17, 12, 3); g.fillStyle = '#e04545'; g.fillRect(x - 5, y - 16, Math.round(10 * clamp(this.hpFrac, 0, 1)), 1); }
  }
}

define('accountant', {
  tiers: {
    senior: 'Deploys a standalone calculator turret (destructible) the first time it plants.',
    lead: 'Compound interest: fires three-shot bursts, each shot 25% stronger than the last.',
  },
  weapon: 'calculator',
  init(e) { e.flags.mode = 'mobile'; e.flags.plantCd = e.rng.range(0.5, 1.5); e.flags.noLos = 0; e.flags.burst = 0; },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.plantCd -= dt;
    if (e.flags.mode === 'planted') {
      e.stop(dt);
      e.face(e.angleToPlayer());
      e.flags.plantedT += dt;
      e.flags.noLos = sees ? 0 : e.flags.noLos + dt;
      if (d < 70 || e.flags.noLos > 1.4 || e.flags.plantedT > 10) {
        e.flags.mode = 'mobile'; e.flags.plantCd = 2.5;
        e.busy = 0.4; e.setAnim('cast', true);
        callout(w, 'PACKING UP', '#9fe8a0', e, 0.8);
        return;
      }
      if (e.attackCd <= 0 && sees) {
        const n = e.flags.burst;
        const lead = e.tier >= 2;
        shoot(e, {
          windup: n > 0 ? 0.3 : 0.55, kind: 'calc', speed: 120 + n * 15, lead: 1, damage: e.arch.damage * (1 + 0.25 * n), trail: '#9fe8a0', cd: lead && n < 2 ? 0.05 : 1.15,
          sfx: 'calculator_beep', anim: 'cast', recovery: 0.1,
        });
        e.flags.burst = lead && n < 2 ? n + 1 : 0;
      }
      return;
    }
    if (e.flags.plantCd <= 0 && sees && d > 85 && d < 185) {
      e.flags.mode = 'planted'; e.flags.plantedT = 0; e.flags.noLos = 0;
      e.busy = 0.5; e.vx = e.vy = 0; e.setAnim('cast', true);
      callout(w, 'RUNNING THE NUMBERS', '#9fe8a0', e, 1);
      audio.sfx('calculator_beep', { x: e.x, y: e.y });
      if (e.tier >= 1 && !e.flags.turret) {
        const a = angleTo(P(e), e) + Math.PI / 2 * e.flags.strafe;
        const x = e.x + Math.cos(a) * 18, y = e.y + Math.sin(a) * 12;
        if (w.isWalkablePx(x, y)) { e.flags.turret = true; w.add(new CalcTurret(e, x, y)); smokePuff(w.particles, x, y - 4, 4, '#d0d4dc', 4); }
      }
      return;
    }
    if (d < 28 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.5, reach: 26, damage: e.arch.damage * 0.8, cd: 1.3 }); return; }
    kite(e, dt, 95, 170);
  },
  render(e, g, before) {
    if (!before || e.corpse || e.dying || e.flags.mode !== 'planted') return;
    // the "desk": a folding tripod with the calculator, at the accountant's feet
    const x = Math.round(e.x + Math.cos(e.facing) * 7), y = Math.round(e.y + 1);
    g.fillStyle = '#1a1a1e'; g.fillRect(x - 3, y - 4, 1, 4); g.fillRect(x + 2, y - 4, 1, 4);
    g.fillRect(x - 4, y - 8, 8, 4); g.fillStyle = '#9fe8a0'; g.fillRect(x - 3, y - 7, 6, 1);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// LAWYER — disruptor. Injunction field: while inside, the player cannot fire ranged weapons or throw
// (see the clearly-marked hook in player.ts handleActions). Contracts at range, briefcase up close.
define('lawyer', {
  tiers: {
    senior: 'Restraining order: a telegraphed ring that shoves the player away when they close in.',
    lead: 'Contempt of court: inside the injunction field the player also takes +30% damage (status.injunction).',
  },
  weapon: 'briefcase',
  init(e) { e.flags.injCd = e.rng.range(0.8, 2); e.flags.roCd = 0; },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.injCd -= dt; e.flags.roCd -= dt;
    if (e.tier >= 1 && e.flags.roCd <= 0 && d < 42) {
      e.flags.roCd = 6;
      callout(w, 'RESTRAINING ORDER', '#d9b45a', e, 1);
      burst(e, { x: e.x, y: e.y, r: 48, inner: 6, windup: 0.5, damage: e.arch.damage * 0.5, knockback: 300, follow: true, anim: 'cast', onFire: (x, y) => ring(w, x, y - 6, 48, '#d9b45a', 0.35) });
      return;
    }
    if (e.flags.injCd <= 0 && sees && d < 160) {
      e.flags.injCd = e.rng.range(8, 10);
      const x = p.x, y = p.y;
      callout(w, 'INJUNCTION PENDING', '#d9b45a', { x, y: y - 30 }, 0.9);
      burst(e, {
        x, y, r: 52, windup: 0.7, noDamage: true, anim: 'cast',
        onFire: () => {
          zones(w).add({ kind: 'injunction', x, y, r: 52, t: 6, owner: e, data: { contempt: e.tier >= 2 } });
          audio.sfx('injunction', { x, y }); audio.sfx('policy_stamp', { x, y, vol: 0.6 });
          ring(w, x, y, 52, '#d9b45a', 0.45);
        },
      });
      sayIf(e, 'alert', 0.7, 'law_inj', 4, e.rng.pick(['I\'m issuing an injunction.', 'Cease. And. Desist.', 'Without prejudice, obviously.']));
      return;
    }
    if (d < 28 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.5, reach: 30, damage: e.arch.damage * 1.1, knockback: 170, cd: 1.3, anim: 'heavy' }); return; }
    if (sees && d < 140 && e.attackCd <= 0) { shoot(e, { windup: 0.55, kind: 'contract', speed: 210, damage: e.arch.damage, cd: e.rng.range(1.6, 2.2), sfx: 'contract_throw' }); return; }
    kite(e, dt, 60, 110);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// COMPLIANCE OFFICER — bruiser. A front-facing policy-binder shield blocks frontal damage; it turns slowly, so the
// answer is to flank (dash behind) or break its guard with heavy hits (stagger → grabbable).
const GUARD_HALF = 1.2; // ~69° either side
function guardAngle(e: Enemy): number { return e.flags.guard ?? e.facing; }
function guardUp(e: Enemy): boolean { return !(e.staggered > 0 || e.status.stun > 0 || e.flags.guardDown > 0 || e.grabbedBy || e.thrown || !e.alive); }

define('compliance_officer', {
  tiers: {
    senior: 'Binder charge: a telegraphed shield rush that bowls the player over (still blocks from the front).',
    lead: 'Zero tolerance: blocking a hit triggers an immediate (telegraphed, minimum-windup) counter-swat.',
  },
  weapon: 'policy_binder',
  init(e) { e.flags.guard = e.facing; e.flags.guardDown = 0; e.flags.n = 0; e.flags.chargeCd = e.rng.range(3, 5); },
  modifyIncoming(e, info) {
    if (!guardUp(e) || info.unavoidable || !info.source) return info.amount;
    if (['execution', 'hazard', 'bleed', 'breach', 'fall', 'body'].includes(info.method)) return info.amount;
    const from = angleTo(e, info.source);
    if (Math.abs(angleDiff(guardAngle(e), from)) > GUARD_HALF) return info.amount; // flanked!
    // blocked: heavy hits still wear the guard down (stagger → grabbable, spec 4.7)
    e.staggerMeter += (info.stagger ?? 8) * (info.method === 'heavy' ? 1.1 : 0.5);
    if (e.staggerMeter >= e.staggerMax) { e.staggerMeter = 0; e.staggered = 1.4; callout(e.world, 'BINDER DROPPED', '#ffffff', e); audio.sfx('policy_stamp', { x: e.x, y: e.y }); }
    sparks(e.world.particles, e.x + Math.cos(from) * 7, e.y - 12, 5, '#e8e8f0', 80);
    audio.sfx('block', { x: e.x, y: e.y });
    if (gate(e.world, `deny${e.id}`, 0.5)) e.world.floatText(e.x, e.y - e.height - 6, 'DENIED', '#c8d0ff');
    if (e.tier >= 2) e.flags.counter = true;
    return 0;
  },
  think(e, dt) {
    const w = e.world;
    if (runDash(e, dt)) { e.flags.guard = e.facing; return; }
    e.flags.guardDown = Math.max(0, e.flags.guardDown - dt);
    // slow guard turn (2.2 rad/s; Lead 2.8) — flanking works
    const want = e.angleToPlayer();
    const rate = e.tier >= 2 ? 2.8 : 2.2;
    e.flags.guard = e.flags.guard + clamp(angleDiff(e.flags.guard, want), -rate * dt, rate * dt);
    if (e.busy > 0) { e.stop(dt); e.face(e.flags.guard); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.chargeCd -= dt;
    const atk = (o: Parameters<typeof swing>[1]) => { swing(e, { ...o, angle: e.flags.guard, onFire: () => { e.flags.guardDown = 0.45; } }); };
    if (e.flags.counter) {
      e.flags.counter = false;
      if (d < 44) { atk({ windup: 0.3, reach: 40, arc: 1.6, damage: e.arch.damage * 0.8, knockback: 200, cd: 1.0, anim: 'attack2' }); callout(w, 'NON-COMPLIANT', '#c8d0ff', e, 0.8); return; }
    }
    if (e.tier >= 1 && e.flags.chargeCd <= 0 && sees && d > 60 && d < 130 && Math.abs(angleDiff(e.flags.guard, want)) < 0.4) {
      e.flags.chargeCd = e.rng.range(6, 8);
      startDash(e, { len: Math.min(d + 20, 140), windup: 0.6, speed: 250, damage: e.arch.damage * 1.1, knockback: 280, width: 16, angle: e.flags.guard });
      return;
    }
    if (d < 40 && e.attackCd <= 0 && sees && Math.abs(angleDiff(e.flags.guard, want)) < 0.9) {
      if (e.flags.n++ % 3 === 2) {
        const a = e.flags.guard;
        burst(e, { x: e.x + Math.cos(a) * 24, y: e.y + Math.sin(a) * 18, r: 22, windup: 0.7, damage: e.arch.damage * 1.3, knockback: 160, heavy: true, cd: 1.6, anim: 'heavy', onFire: (x, y) => { e.flags.guardDown = 0.6; audio.sfx('policy_stamp', { x, y }); smokePuff(w.particles, x, y, 5, '#d8d0c0', 5); } });
      } else atk({ windup: 0.55, reach: 38, arc: 1.5, damage: e.arch.damage, knockback: 150, cd: 1.3, anim: 'attack1' });
      return;
    }
    approach(e, dt, 32, 1, 0.3);
    e.face(e.flags.guard);
  },
  render(e, g, before) {
    if (before || e.corpse || e.dying) return;
    const a = guardAngle(e);
    const up = guardUp(e);
    // the policy binder: a thick ringbinder held in front (lowered and tilted when the guard is down)
    const ox = Math.round(e.x + Math.cos(a) * (up ? 8 : 5)), oy = Math.round(e.y - (up ? 14 : 6) + Math.sin(a) * 4);
    const behind = Math.sin(a) < -0.3;
    if (behind && up) return; // binder hidden behind the body when facing away
    g.fillStyle = '#0b0c10'; g.fillRect(ox - 4, oy - 6, 8, up ? 12 : 7);
    g.fillStyle = up ? '#2a4a8a' : '#3a4a6a'; g.fillRect(ox - 3, oy - 5, 6, up ? 10 : 5);
    g.fillStyle = '#e8e8f0'; g.fillRect(ox - 2, oy - 3, 4, 1); if (up) g.fillRect(ox - 2, oy - 1, 3, 1);
    g.fillStyle = '#c8a040'; g.fillRect(ox - 3, oy - 5, 1, 1); g.fillRect(ox - 3, oy + (up ? 3 : 0), 1, 1);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// PROCUREMENT BUYER — support (kill priority). "Orders" reinforcements: periodically raises a PO and a telegraphed
// parcel drop delivers an Intern, until killed. Max 4 ordered staff alive at once.
const MAX_ORDERED = 4;
define('procurement_buyer', {
  tiers: {
    senior: 'Bulk order: each purchase order delivers two staff (cap still 4).',
    lead: 'Preferred supplier: every third order is a Sales Rep instead of an Intern.',
  },
  weapon: 'box_cutter',
  init(e) { e.flags.orderCd = e.rng.range(1.5, 3); e.flags.orders = 0; },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.orderCd -= dt;
    const live = liveSummons(e, 'order').length;
    if (e.flags.orderCd <= 0 && live < MAX_ORDERED) {
      e.flags.orderCd = e.rng.range(5.5, 7);
      const n = Math.min(MAX_ORDERED - live, e.tier >= 1 ? 2 : 1);
      e.busy = 0.6; e.vx = e.vy = 0; e.setAnim('cast', true);
      audio.sfx('purchase_order', { x: e.x, y: e.y });
      callout(w, 'PO RAISED', '#d0a060', e, 1);
      for (let i = 0; i < n; i++) {
        e.flags.orders++;
        const arch: ArchetypeId = e.tier >= 2 && e.flags.orders % 3 === 0 ? 'sales_rep' : 'intern';
        const at = summonSpot(e, i === 0 ? e : P(e), 55);
        burst(e, {
          x: at.x, y: at.y, r: 12, windup: 0.8, damage: e.arch.damage * 0.6, knockback: 120, busy: false,
          onFire: (x, y) => {
            if (liveSummons(e, 'order').length >= MAX_ORDERED || roomAtCap(e)) return;
            debrisBurst(w.particles, x, y - 4, 8, ['#b08850', '#8a6438', '#d8c8a0'], w.roomAt(x, y));
            smokePuff(w.particles, x, y - 4, 6, '#d0d4dc', 5);
            audio.sfx('thud', { x, y, vol: 0.6 });
            const s = summon(e, arch, clamp(e.act - (arch === 'intern' ? 1 : 2), 0, 2) as Tier, x, y, 'order');
            s.busy = 0.35;
          },
        });
      }
      sayIf(e, 'buff', 0.8, 'proc_order', 4);
      return;
    }
    if (d < 28 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.45, reach: 26, damage: e.arch.damage, type: 'sharp', bleed: 0.3, cd: 1.2 }); return; }
    behindAllies(e, dt, 54, 80, 150);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// AUDITOR (elite) — marks the player (status.marked: +25% damage taken from everything, see Player.modifyIncoming),
// then red-pen lunges.
define('auditor', {
  tiers: {
    senior: 'Red-pen volley: throws a spread of three red pens at range.',
    lead: 'Full audit: red-pen lunges chain up to three times.',
  },
  weapon: 'letter_opener',
  init(e) { e.flags.markCd = e.rng.range(0.6, 1.5); e.flags.lungeCd = e.rng.range(2, 3.5); e.flags.penCd = e.rng.range(3, 5); },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (runDash(e, dt)) return;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.markCd -= dt; e.flags.lungeCd -= dt; e.flags.penCd -= dt;
    if (e.flags.markCd <= 0 && sees && d < 220 && !(p.status.marked > 1)) {
      e.flags.markCd = 4;
      callout(w, 'UNDER REVIEW', '#ff5a4a', e, 0.9);
      lineHit(e, {
        len: Math.min(240, d + 20), width: 10, windup: 0.7, damage: 0, col: '#d42a2a', cd: 0.6, anim: 'cast', stopAtWalls: true,
        onTarget: () => {
          if (p.alive) {
            p.status.marked = 7;
            e.flags.markCd = 12;
            audio.sfx('mark', { x: p.x, y: p.y });
            ring(w, p.x, p.y - 12, 16, '#d42a2a', 0.5);
            sayIf(e, 'taunt', 1, 'aud_mark', 3, e.rng.pick(['Discrepancy noted.', 'You\'ve been flagged for review.', 'This will go in my report.']));
          }
        },
      });
      return;
    }
    if (e.flags.lungeCd <= 0 && sees && d > 36 && d < 140) {
      e.flags.lungeCd = e.rng.range(3.5, 5);
      const chain = (left: number) => startDash(e, {
        len: Math.min(dist(e, P(e)) + 26, 150), windup: left === (e.tier >= 2 ? 2 : 0) ? 0.55 : 0.32, speed: 360, damage: e.arch.damage, type: 'sharp', bleed: 0.4, width: 10, knockback: 140,
        then: left > 0 ? (en) => { if (en.alive && en.seesPlayer()) chain(left - 1); } : undefined,
      });
      chain(e.tier >= 2 ? 2 : 0);
      sayIf(e, 'attack', 0.6, 'aud_lunge', 3);
      return;
    }
    if (e.tier >= 1 && e.flags.penCd <= 0 && sees && d > 80 && d < 190) {
      e.flags.penCd = e.rng.range(4, 6);
      shoot(e, { windup: 0.55, kind: 'pen', speed: 240, damage: e.arch.damage * 0.6, count: 3, spread: 0.18, type: 'sharp', cd: 1 });
      return;
    }
    if (d < 32 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.45, reach: 32, damage: e.arch.damage, type: 'sharp', bleed: 0.3, cd: 1.1 }); return; }
    kite(e, dt, 70, 130);
  },
});

void go; void pathDir; void approach; void fromAngle;
