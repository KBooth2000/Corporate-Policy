// Act 4 archetypes (spec 5.2): HR Business Partner (support), Senior Vice President (bruiser), Executive Assistant
// (disruptor/assassin), Management Consultant (ranged), Culture Champion (elite). Act minimum telegraph 0.25 s.
import { Enemy } from '../enemy';
import type { Ctx } from '../../render/canvas';
import { bakeCharacter } from '../../art/characters';
import { audio } from '../../audio/audio';
import { sparks, smokePuff } from '../fx';
import { drawText } from '../../render/font';
import {
  define, P, approach, kite, behindAllies, go, pathDir, allies, addBuff, sayIf, swing, burst, shoot, lineHit, zones,
  callout, ring, beamFx, isWalkable, clearLine, dist, angleTo, TAU, clamp,
} from './common';

// ---------------------------------------------------------------------------------------------------------------
// HR BUSINESS PARTNER — support (kill priority). "Wellbeing check-in": restores/grants allies' shields.
define('hr_partner', {
  tiers: {
    senior: 'Holistic check-in: also cleanses allies of stun, slow, blind, bleed and burning.',
    lead: 'Mandatory wellbeing session: drops a "safe space" zone where allies regenerate 4% HP per second for 5 s.',
  },
  weapon: 'scissors',
  init(e) { e.flags.checkCd = e.rng.range(1, 2.5); e.flags.safeCd = e.rng.range(4, 7); },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.checkCd -= dt; e.flags.safeCd -= dt;
    if (e.flags.checkCd <= 0) {
      const team = allies(e, 160).filter((a) => a.aware && w.los(e, a));
      const needy = team.filter((a) => a.shield < Math.max(1, a.maxShield) * 0.6 || a.maxShield < a.maxHp * 0.3)
        .sort((a, b) => a.shield / Math.max(1, a.maxShield) - b.shield / Math.max(1, b.maxShield)).slice(0, 3);
      if (needy.length) {
        e.flags.checkCd = e.rng.range(5.5, 7);
        e.busy = 0.7; e.vx = e.vy = 0; e.setAnim('cast', true);
        audio.sfx('wellbeing_chime', { x: e.x, y: e.y });
        callout(w, 'WELLBEING CHECK-IN', '#7fe0ff', e, 1.1);
        for (const a of needy) {
          a.maxShield = Math.max(a.maxShield, Math.round(a.maxHp * 0.3));
          a.shield = a.maxShield;
          if (e.tier >= 1) { a.status.stun = 0; a.status.slow = 0; a.status.blind = 0; a.status.bleed = 0; a.status.burning = 0; a.staggered = 0; }
          ring(w, a.x, a.y - 12, 14, '#7fe0ff', 0.5);
          beamFx(w, { x: e.x, y: e.y - 16 }, { x: a.x, y: a.y - 16 }, '#9fe0ff', 0.35);
        }
        audio.sfx('shield_up', { x: e.x, y: e.y, vol: 0.6 });
        sayIf(e, 'buff', 0.8, 'hr_buff', 4);
        return;
      }
      e.flags.checkCd = 1.2;
    }
    if (e.tier >= 2 && e.flags.safeCd <= 0) {
      const team = allies(e, 150).filter((a) => a.aware && a.hpFrac < 0.8);
      if (team.length >= 1) {
        e.flags.safeCd = e.rng.range(13, 16);
        let cx = 0, cy = 0; for (const a of team) { cx += a.x; cy += a.y; } cx /= team.length; cy /= team.length;
        if (isWalkable(w, cx, cy)) {
          e.busy = 0.6; e.setAnim('cast', true);
          zones(w).add({ kind: 'safe', x: cx, y: cy, r: 42, t: 5, owner: e });
          callout(w, 'SAFE SPACE', '#7fe0a0', { x: cx, y: cy - 20 }, 1.2);
          audio.sfx('wellbeing_chime', { x: cx, y: cy });
          return;
        }
      }
    }
    if (d < 28 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.4, reach: 26, damage: e.arch.damage, type: 'sharp', bleed: 0.35, cd: 1.2 }); return; }
    // nobody left to look after: hand out Performance Improvement Plans instead
    if (sees && d < 150 && e.attackCd <= 0 && !allies(e, 220).some((a) => a.aware && a.arch.role !== 'support')) {
      shoot(e, { windup: 0.55, kind: 'paper', speed: 200, damage: e.arch.damage, cd: e.rng.range(1.8, 2.4), sfx: 'paper_rustle' });
      return;
    }
    behindAllies(e, dt, 56, 85, 155);
  },
  onHurt(e, _info, amount) { if (amount > 0 && e.hpFrac < 0.5) e.flags.slot = -e.flags.slot; }, // mindfully relocates
});

// ---------------------------------------------------------------------------------------------------------------
// SENIOR VICE PRESIDENT — bruiser. Long-reach golf-club swings, golf-ball drives at range, power poses grant
// temporary armour (status.armour / armourAmt, applied in combat.damage).
define('svp', {
  tiers: {
    senior: 'Follow-through: every golf swing is followed by a backswing from the other side.',
    lead: 'Hostile takeover: power poses also release a telegraphed shockwave ring.',
  },
  weapon: 'golf_club',
  init(e) { e.flags.poseCd = e.rng.range(3, 6); e.flags.driveCd = e.rng.range(2, 4); e.flags.back = false; },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.poseCd -= dt; e.flags.driveCd -= dt;
    if (e.flags.poseCd <= 0 && (e.hpFrac < 0.8 || e.rng.chance(dt * 0.1))) {
      e.flags.poseCd = e.rng.range(11, 14);
      e.busy = 0.8; e.vx = e.vy = 0; e.setAnim('celebrate', true);
      e.status.armour = 5; e.status.armourAmt = 0.5;
      audio.sfx('power_pose', { x: e.x, y: e.y });
      callout(w, 'POWER POSE', '#ffd27a', e, 1.1);
      ring(w, e.x, e.y - 14, 20, '#ffd27a', 0.5);
      if (e.tier >= 2) burst(e, { x: e.x, y: e.y, r: 62, inner: 12, windup: 0.5, damage: e.arch.damage * 0.6, knockback: 260, follow: true, busy: false, onFire: (x, y) => ring(w, x, y - 4, 62, '#ffd27a', 0.4) });
      sayIf(e, 'buff', 0.7, 'svp_pose', 4);
      return;
    }
    if (e.flags.back) {
      e.flags.back = false;
      if (d < 60) { swing(e, { windup: 0.35, reach: 54, arc: 2.0, damage: e.arch.damage * 0.8, knockback: 200, heavy: true, cd: 1.6, anim: 'attack2', angle: e.angleToPlayer() }); return; }
    }
    if (d < 56 && e.attackCd <= 0 && sees) {
      swing(e, { windup: 0.6, reach: 56, arc: 2.0, damage: e.arch.damage, knockback: 240, heavy: true, cd: 1.7, anim: 'heavy', recovery: e.tier >= 1 ? 0.1 : 0.3, onFire: () => { if (e.tier >= 1) e.flags.back = true; } });
      sayIf(e, 'attack', 0.35, 'svp_atk', 4);
      return;
    }
    if (e.flags.driveCd <= 0 && sees && d > 80 && d < 200) {
      e.flags.driveCd = e.rng.range(4, 6);
      callout(w, 'FORE!', '#ffffff', e, 0.8);
      shoot(e, { windup: 0.6, kind: 'golf_ball', speed: 300, damage: e.arch.damage * 0.9, knockback: 120, cd: 1.2, anim: 'heavy', sfx: 'golf_swing' });
      return;
    }
    approach(e, dt, 46, 1, 0.5);
  },
  render(e, g, before) {
    if (before || e.corpse || e.dying || !(e.status.armour > 0)) return;
    // armour shimmer: gold glints climbing the silhouette
    const t = e.world.time;
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.5 + i / 3) % 1;
      const side = i % 2 ? 1 : -1;
      g.globalAlpha = 0.9 * (1 - k);
      g.fillStyle = '#ffd27a';
      g.fillRect(Math.round(e.x + side * 7), Math.round(e.y - 4 - k * (e.height - 4)), 1, 3);
    }
    g.globalAlpha = 1;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// EXECUTIVE ASSISTANT — disruptor / assassin. Sends a calendar invite (telegraphed destination behind the player),
// teleports there and backstabs (separate telegraphed arc). Busy-calendar invites slow at range.
function inviteSpot(e: Enemy): { x: number; y: number } | null {
  const p = P(e), w = e.world;
  const back = p.facing + Math.PI;
  for (const off of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
    const a = back + off;
    const q = { x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 16 };
    if (isWalkable(w, q.x, q.y) && clearLine(w, p, q) && w.roomAt(q.x, q.y) === w.roomAt(p.x, p.y)) return q;
  }
  return null;
}

function teleportTo(e: Enemy, x: number, y: number): void {
  const w = e.world;
  sparks(w.particles, e.x, e.y - 14, 10, '#a68cff', 90); smokePuff(w.particles, e.x, e.y - 8, 5, '#c8b8ff', 5);
  e.x = x; e.y = y; e.vx = e.vy = 0;
  sparks(w.particles, x, y - 14, 10, '#a68cff', 90); ring(w, x, y - 8, 14, '#a68cff', 0.35);
  audio.sfx('teleport', { x, y });
}

function invite(e: Enemy, windup: number, chain: boolean): boolean {
  const w = e.world;
  const at = inviteSpot(e);
  if (!at) return false;
  callout(w, 'INVITE: 1:1', '#a68cff', { x: at.x, y: at.y - 26 }, e.windup(windup) + 0.2);
  burst(e, {
    x: at.x, y: at.y, r: 13, windup, noDamage: true, anim: 'cast', recovery: 0,
    onFire: () => {
      const q = isWalkable(w, at.x, at.y) ? at : inviteSpot(e);
      if (!q) return;
      teleportTo(e, q.x, q.y);
      e.face(e.angleToPlayer());
      e.busy = 0;
      swing(e, {
        windup: 0.3, reach: 28, arc: 1.5, damage: e.arch.damage * 1.3, type: 'sharp', bleed: 0.35, knockback: 120, cd: 0.9, anim: 'attack3',
        onFire: () => {
          if (chain && e.alive) e.flags.inviteAgain = true;
          else if (e.tier >= 1) e.flags.blinkAt = w.time + 0.3;
        },
      });
    },
  });
  sayIf(e, 'attack', 0.5, 'ea_inv', 4, e.rng.pick(['I\'ve popped something in your diary.', 'Accept? You don\'t have a choice.', 'Quick sync?']));
  return true;
}

define('exec_assistant', {
  tiers: {
    senior: 'Double-booked: after a backstab, blinks away to a safe distance.',
    lead: 'Back-to-back meetings: chains a second invite-teleport-backstab immediately after the first.',
  },
  weapon: 'letter_opener',
  init(e) { e.flags.tpCd = e.rng.range(1.5, 3); e.flags.inviteCd = e.rng.range(2, 4); e.flags.flanker = true; },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (e.busy > 0) { e.stop(dt); return; }
    if (e.flags.inviteAgain) { e.flags.inviteAgain = false; if (invite(e, 0.5, false)) return; }
    if (e.flags.blinkAt && w.time >= e.flags.blinkAt) {
      e.flags.blinkAt = 0;
      for (let i = 0; i < 10; i++) {
        const a = e.rng.range(0, TAU);
        const q = { x: p.x + Math.cos(a) * 85, y: p.y + Math.sin(a) * 60 };
        if (isWalkable(w, q.x, q.y) && w.roomAt(q.x, q.y) === w.roomAt(p.x, p.y)) { teleportTo(e, q.x, q.y); break; }
      }
      return;
    }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.tpCd -= dt; e.flags.inviteCd -= dt;
    if (e.flags.tpCd <= 0 && sees && d > 50 && d < 210) {
      e.flags.tpCd = e.rng.range(4, 6);
      if (invite(e, 0.7, e.tier >= 2)) return;
    }
    if (d < 26 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.35, reach: 26, damage: e.arch.damage, type: 'sharp', bleed: 0.3, cd: 1 }); return; }
    if (e.flags.inviteCd <= 0 && sees && d > 50 && d < 170) {
      e.flags.inviteCd = e.rng.range(2.5, 3.5);
      shoot(e, { windup: 0.5, kind: 'invite', speed: 160, damage: e.arch.damage * 0.5, slow: { amt: 0.35, time: 2 }, cd: 1 });
      return;
    }
    kite(e, dt, 60, 120, 1.05);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MANAGEMENT CONSULTANT — ranged. Tracking laser-pointer beams (line telegraph locks at 60%), billed by the hour:
// damage rises the longer the fight runs.
export function billRate(e: Enemy): number {
  const t = e.flags.fightStart >= 0 ? e.world.time - e.flags.fightStart : 0;
  return Math.min(2.5, 1 + Math.floor(t / 10) * 0.12);
}

define('consultant', {
  tiers: {
    senior: 'Deck of slides: fires a fan of three beams.',
    lead: '"Just one more slide": a second beam follows immediately with its own short telegraph.',
  },
  weapon: 'laser_pointer',
  init(e) { e.flags.beamCd = e.rng.range(1, 2.5); },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.beamCd -= dt;
    const fire = (windup: number, fan: boolean, again: boolean) => {
      const rate = billRate(e);
      const base = e.angleToPlayer();
      const angles = fan ? [base - 0.28, base, base + 0.28] : [base];
      angles.forEach((a, i) => lineHit(e, {
        len: 230, width: 6, windup, damage: e.arch.damage * rate, type: 'fire', angle: a, track: fan ? 0 : 1.2, col: '#ff3030', cd: 0.4,
        anim: 'cast', recovery: again ? 0.05 : 0.35, sfx: i === 0 ? 'laser' : undefined, busy: i === 0,
        onFire: i === 0 && again ? () => { e.flags.oneMore = true; } : undefined,
      }));
    };
    if (e.flags.oneMore) { e.flags.oneMore = false; if (sees) { fire(0.3, false, false); callout(w, 'ONE MORE SLIDE', '#ff8080', e, 0.8); return; } }
    if (e.flags.beamCd <= 0 && sees && d < 220) {
      e.flags.beamCd = e.rng.range(2.6, 3.6);
      fire(0.75, e.tier >= 1, e.tier >= 2);
      sayIf(e, 'attack', 0.4, 'con_atk', 4);
      return;
    }
    if (d < 26 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.4, reach: 24, damage: e.arch.damage * 0.7, cd: 1.2 }); return; }
    kite(e, dt, 100, 185);
  },
  render(e, g: Ctx, before) {
    if (before || e.corpse || e.dying || !e.aware || e.flags.fightStart < 0) return;
    const rate = billRate(e);
    drawText(g, `£${Math.round(rate * 450)}/hr`, e.x, e.y - e.height - (e.hp < e.maxHp ? 18 : 12), { align: 'center', color: rate > 1.6 ? '#ff8080' : '#a8d8a0', outline: '#0b0c10' });
  },
});

// ---------------------------------------------------------------------------------------------------------------
// CULTURE CHAMPION (elite) — "re-onboards" fallen colleagues: intact corpses (not dismembered, not executed)
// get up again with a fresh lanyard. The channel is interruptible (stagger it, or hit it hard).
export function canReonboard(c: Enemy): boolean {
  return c.corpse && !c.dismembered && !c.executed && !c.dead && !c.isBoss && !c.flags.reonboarded && !c.flags.defenestrated;
}

export function reonboard(champ: Enemy, c: Enemy, lead: boolean): void {
  const w = c.world;
  c.corpse = false; c.dying = false;
  c.hp = Math.round(c.maxHp * 0.5);
  c.layer = 1;
  c.look.reonboarded = true;                 // fresh lanyard (art reads this flag)
  c.baked = bakeCharacter(c.look);
  c.height = c.baked.height;
  c.flags.reonboarded = true;
  c.flags.dash = null; c.flags.leap = null; c.flags.chantT = 0;
  c.staggered = 0; c.staggerMeter = 0; c.status.stun = 0; c.status.bleed = 0;
  c.kx = c.ky = 0; c.vx = c.vy = 0;
  c.aware = true;
  c.cashDrop = 0;                            // no double payout
  c.weapon = null;                           // their weapon already dropped on the first death
  c.busy = 0.7;
  c.setAnim('getup', true);
  if (lead) { c.maxShield = Math.max(c.maxShield, Math.round(c.maxHp * 0.3)); c.shield = c.maxShield; addBuff(c, 'culture', 9999, 1.2, 1.1, '#ffd27a'); }
  w.assignToRoom(c, c.roomId);
  ring(w, c.x, c.y - 10, 20, '#ffd27a', 0.6);
  sparks(w.particles, c.x, c.y - 16, 12, '#ffd27a', 80);
  callout(w, 'RE-ONBOARDED', '#ffd27a', c, 1.4);
  audio.sfx('revive', { x: c.x, y: c.y });
  c.bark('revive');
  w.bus.emit('enemySpawn', { enemy: c });
  void champ;
}

define('culture_champion', {
  tiers: {
    senior: 'Mass onboarding: re-onboards up to two colleagues per channel.',
    lead: 'Culture fit: re-onboarded staff return with a 30% shield and +20% speed / +10% damage.',
  },
  weapon: 'trophy',
  init(e) { e.flags.reviveCd = e.rng.range(2, 3.5); e.flags.ringCd = e.rng.range(2, 4); e.flags.channel = null; },
  onHurt(e, _info, amount) {
    const ch = e.flags.channel;
    if (ch) { ch.dmg += amount; if (ch.dmg > e.maxHp * 0.12 || e.staggered > 0) { e.flags.channel = null; e.busy = 0.2; callout(e.world, 'MEETING CANCELLED', '#ffffff', e, 1); } }
  },
  think(e, dt) {
    const w = e.world;
    const ch = e.flags.channel as { targets: Enemy[]; t: number; dmg: number } | null;
    if (ch) {
      e.stop(dt); e.setAnim('chant');
      ch.t -= dt;
      for (const c of ch.targets) if (w.rng.cosmetic.chance(dt * 8)) beamFx(w, { x: e.x, y: e.y - 18 }, { x: c.x, y: c.y - 4 }, '#ffd27a', 0.12);
      if (ch.t <= 0) {
        e.flags.channel = null;
        for (const c of ch.targets) if (canReonboard(c)) reonboard(e, c, e.tier >= 2);
        e.busy = 0.3;
      }
      return;
    }
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.reviveCd -= dt; e.flags.ringCd -= dt;
    if (e.flags.reviveCd <= 0) {
      const corpses = w.actors.filter((a): a is Enemy => a instanceof Enemy && canReonboard(a) && dist(a, e) < 200 && (a.roomId === e.roomId || w.roomAt(a.x, a.y) === w.roomAt(e.x, e.y)))
        .sort((a, b) => dist(a, e) - dist(b, e));
      if (corpses.length) {
        const near = corpses.filter((c) => dist(c, e) < 120);
        if (near.length) {
          e.flags.reviveCd = e.rng.range(6, 8);
          const targets = near.slice(0, e.tier >= 1 ? 2 : 1);
          e.flags.channel = { targets, t: 1.2, dmg: 0 };
          for (const c of targets) { ring(w, c.x, c.y, 16, '#ffd27a', 1.2); callout(w, 'RE-ONBOARDING…', '#ffd27a', { x: c.x, y: c.y - 20 }, 1.2); }
          audio.sfx('chant', { x: e.x, y: e.y });
          e.bark('revive');
          return;
        }
        if (d > 50) { go(e, pathDir(e, corpses[0]), 1, dt); e.face(angleTo(e, corpses[0])); return; }
      } else e.flags.reviveCd = 1.5;
    }
    if (e.flags.ringCd <= 0 && d < 62) {
      e.flags.ringCd = e.rng.range(5, 7);
      callout(w, 'COMPANY VALUES!', '#ffd27a', e, 1);
      burst(e, { x: e.x, y: e.y, r: 66, inner: 18, windup: 0.65, damage: e.arch.damage, knockback: 230, follow: true, anim: 'chant', onFire: (x, y) => ring(w, x, y - 6, 66, '#ffd27a', 0.4) });
      return;
    }
    if (d < 50 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.5, reach: 50, arc: 2.2, damage: e.arch.damage, knockback: 170, cd: 1.3, anim: 'attack1' }); return; }
    approach(e, dt, 42, 1, 0.6);
  },
});

void kite; void clamp;
