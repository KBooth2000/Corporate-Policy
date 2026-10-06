// Act 2 archetypes (spec 5.2): Sales Rep, Marketing Exec (support), Call Centre Agent, Team Leader (bruiser),
// Employee of the Month (elite). Act minimum telegraph 0.35 s (enforced by Enemy.windup()).
import { Enemy } from '../enemy';
import type { Ctx } from '../../render/canvas';
import { audio } from '../../audio/audio';
import { smokePuff } from '../fx';
import type { Tier } from '../../data/ids';
import {
  define, P, approach, kite, behindAllies, go, allies, addBuff, sayIf, swing, burst, shoot, startDash, runDash,
  callout, ring, beamFx, summon, roomAtCap, liveSummons, summonSpot, dist, angleTo, TAU, clamp,
} from './common';

// ---------------------------------------------------------------------------------------------------------------
// SALES REP — swarmer / rusher. Telegraphed dash attacks (committed: they ignore hazards and stun themselves on
// walls), and they never, ever stop talking.
define('sales_rep', {
  tiers: {
    senior: 'Energy drink: once below 50% HP, chugs a can (interruptible) — heals 15% and +40% speed for 6 s.',
    lead: 'Chains two dashes: the second is re-aimed with its own short telegraph.',
  },
  weapon: 'energy_drink',
  init(e) {
    e.barkRate *= 2.6;                 // never stops talking
    e.barkCd = e.rng.range(0.5, 2.5);
    e.flags.dashCd = e.rng.range(0.8, 2);
  },
  think(e, dt) {
    const w = e.world;
    if (runDash(e, dt)) return;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.dashCd -= dt;
    if (e.tier >= 1 && !e.flags.drank && e.hpFrac < 0.5) {
      e.flags.drank = true;
      e.busy = 0.6; e.vx = e.vy = 0; e.setAnim('cast', true);
      audio.sfx('energy_drink', { x: e.x, y: e.y });
      callout(w, 'ENERGY DRINK!', '#c8e85a', e);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15);
      addBuff(e, 'energy', 6, 1.4, 1.1, '#c8e85a');
      e.bark('buff');
      return;
    }
    if (e.flags.dashCd <= 0 && sees && d > 40 && d < 135) {
      e.flags.dashCd = e.rng.range(2.6, 3.8);
      const dash = (windup: number, chain: boolean) => startDash(e, {
        len: Math.min(dist(e, P(e)) + 34, 160), windup, speed: 340, damage: e.arch.damage * 1.2, knockback: 200, width: 14,
        then: chain ? (en) => { if (en.alive && en.seesPlayer()) dash(0.3, false); } : undefined,
      });
      dash(0.5, e.tier >= 2);
      sayIf(e, 'attack', 0.6, undefined, 0, e.rng.pick(['Let\'s circle back - to your face!', 'Closing! Closing! CLOSING!', 'Can I just grab two minutes?', 'Let me run something by you!']));
      return;
    }
    if (d < 26 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.45, reach: 26, damage: e.arch.damage, knockback: 100, cd: 1.1, anim: 'attack2' }); return; }
    approach(e, dt, 70, 1.05, 1.2);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MARKETING EXEC — support (kill priority). Stays behind the line and "rebrands" an ally: a temporary buff
// (+30% damage via status.rebranded, +15% speed) and a floating new name.
const BRAND_PRE = ['Synergy', 'Disrupt', 'Agile', 'Thought-Leader', 'Next-Gen', 'Purpose-Led', 'Growth', 'Omni', 'Hyper', 'Brand'];
const BRAND_POST = ['2.0', ' TM', '.io', 'Plus', 'Pro Max', '360', 'Reimagined', 'X'];
function brandName(e: Enemy, target: Enemy): string {
  const first = target.name.split(' ')[0];
  return e.rng.chance(0.5) ? `${e.rng.pick(BRAND_PRE)} ${first}` : `${first} ${e.rng.pick(BRAND_POST)}`;
}

export function rebrand(e: Enemy, a: Enemy, t = 8, heal = 0): void {
  const w = e.world;
  if (!a.flags.origName) a.flags.origName = a.name;
  a.flags.brandName = brandName(e, a);
  a.name = a.flags.brandName;
  a.status.rebranded = Math.max(a.status.rebranded, t);
  a.flags.rebrandUntil = w.time + t;
  if (heal) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * heal);
  ring(w, a.x, a.y - 12, 16, '#ffb000', 0.5);
  beamFx(w, { x: e.x, y: e.y - 16 }, { x: a.x, y: a.y - 16 }, '#ffb000', 0.35, 1);
  audio.sfx('rebrand', { x: a.x, y: a.y });
  if (a.rng.chance(0.5)) sayIf(a, 'buff', 1, 'rebrand_reply', 4);
}

define('marketing_exec', {
  tiers: {
    senior: 'Viral campaign: each rebrand hits two allies at once.',
    lead: 'Brand refresh: rebranded allies are also healed for 20% of their max HP.',
  },
  weapon: 'clipboard',
  init(e) { e.flags.rebrandCd = e.rng.range(1.5, 3); },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.rebrandCd -= dt;
    if (e.flags.rebrandCd <= 0) {
      const cands = allies(e, 170).filter((a) => a.aware && a.status.rebranded <= 0 && a.arch.role !== 'support' && w.los(e, a))
        .sort((a, b) => (b.elite ? 1000 : 0) + b.maxHp - ((a.elite ? 1000 : 0) + a.maxHp));
      const n = e.tier >= 1 ? 2 : 1;
      if (cands.length) {
        e.flags.rebrandCd = e.rng.range(6.5, 8);
        e.busy = 0.7; e.vx = e.vy = 0; e.setAnim('cast', true);
        callout(w, 'REBRAND!', '#ffb000', e);
        for (const a of cands.slice(0, n)) rebrand(e, a, 8, e.tier >= 2 ? 0.2 : 0);
        sayIf(e, 'buff', 0.8, 'mkt_buff', 3);
        return;
      }
      e.flags.rebrandCd = 1;
    }
    const alone = !allies(e, 220).some((a) => a.aware && a.arch.role !== 'support');
    if ((d < 70 || (alone && d < 140)) && sees && e.attackCd <= 0) {
      if (d < 28) swing(e, { windup: 0.5, reach: 28, damage: e.arch.damage, knockback: 120, cd: 1.4 });
      else shoot(e, { windup: 0.55, kind: 'coffee', speed: 180, gravity: true, damage: e.arch.damage, type: 'fire', cd: 2 });
      return;
    }
    behindAllies(e, dt, 50, 80, 150);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// CALL CENTRE AGENT — ranged. Headset scream cone; a hold-music aura that slows the player.
const HOLD_R = 72;
define('call_centre', {
  tiers: {
    senior: '"Your call is important to us": throws a headset that puts you on hold (60% slow for 2 s).',
    lead: 'Escalation: the scream is immediately followed by a second, re-aimed scream.',
  },
  weapon: 'desk_phone',
  init(e) { e.flags.screamCd = e.rng.range(1, 2.5); e.flags.headsetCd = e.rng.range(2, 4); },
  think(e, dt) {
    const w = e.world, p = P(e);
    // hold music aura: passive, always on while alert
    if (p.alive && dist(e, p) < HOLD_R) {
      p.status.slow = Math.max(p.status.slow, 0.25); p.status.slowAmt = Math.max(p.status.slowAmt, 0.3);
      if (e.rng.chance(dt * 0.4)) audio.sfx('hold_music', { x: e.x, y: e.y, vol: 0.4 });
    }
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.screamCd -= dt; e.flags.headsetCd -= dt;
    const scream = (windup: number, chain: boolean) => swing(e, {
      windup, reach: 100, arc: 0.78, damage: e.arch.damage, knockback: 160, stun: 0.2, cd: 2, anim: 'cast', recovery: chain ? 0.05 : 0.3,
      onFire: (a) => {
        audio.sfx('scream', { x: e.x, y: e.y });
        for (let i = 1; i <= 4; i++) ring(w, e.x + Math.cos(a) * i * 22, e.y - 8 + Math.sin(a) * i * 16, 4 + i * 3, '#bfe8ff', 0.25 + i * 0.05);
        if (chain) e.flags.escalate = true;
      },
    });
    if (e.flags.escalate) { e.flags.escalate = false; scream(0.35, false); return; }
    if (e.flags.screamCd <= 0 && sees && d < 100) {
      e.flags.screamCd = e.rng.range(3.5, 5);
      scream(0.6, e.tier >= 2);
      sayIf(e, 'attack', 0.6, 'cc_atk', 3);
      return;
    }
    if (e.tier >= 1 && e.flags.headsetCd <= 0 && sees && d > 50 && d < 150) {
      e.flags.headsetCd = e.rng.range(4.5, 6.5);
      shoot(e, { windup: 0.55, kind: 'phone', speed: 210, damage: e.arch.damage * 0.6, slow: { amt: 0.6, time: 2 }, cd: 1.4 });
      return;
    }
    kite(e, dt, 60, 120);
  },
  render(e, g, before) {
    if (e.corpse || e.dying) return;
    const t = e.world.time;
    if (before) {
      g.save(); g.globalAlpha = 0.22; g.strokeStyle = '#5ad0c0'; g.lineWidth = 1; g.setLineDash([2, 4]); g.lineDashOffset = t * 8;
      g.beginPath(); g.ellipse(Math.round(e.x) + 0.5, Math.round(e.y) + 0.5, HOLD_R, HOLD_R * 0.6, 0, 0, TAU); g.stroke(); g.restore();
      return;
    }
    // drifting music notes (pixel-drawn so no font dependency)
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.5 + i / 3) % 1;
      const x = Math.round(e.x + Math.sin(t * 2 + i * 2.1) * 10), y = Math.round(e.y - e.height - 4 - k * 14);
      g.globalAlpha = 1 - k;
      g.fillStyle = '#5ad0c0'; g.fillRect(x, y, 2, 2); g.fillRect(x + 1, y - 4, 1, 4); g.fillRect(x + 2, y - 4, 1, 1);
    }
    g.globalAlpha = 1;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// TEAM LEADER — bruiser. Delegates: hangs back and sends Interns in (max 2 summoned, once per fight), barks
// "action items" that speed up allies; engages with clipboard swat combos when the team is gone.
function internTier(e: Enemy): Tier { return clamp(e.act - 1, 0, 2) as Tier; }

function delegate(e: Enemy, text: string): void {
  const w = e.world;
  const room = liveSummons(e, 'delegate').length;
  const n = 2 - room;
  if (n <= 0) return;
  e.busy = 0.8; e.vx = e.vy = 0; e.setAnim('cast', true);
  callout(w, 'DELEGATING…', '#8ac0ff', e);
  e.bark('buff', text);
  for (let i = 0; i < n; i++) {
    if (roomAtCap(e)) break;
    const at = summonSpot(e, e, 60);
    smokePuff(w.particles, at.x, at.y - 6, 8, '#d0d4dc', 6);
    const s = summon(e, 'intern', internTier(e), at.x, at.y, 'delegate');
    s.busy = 0.4;
  }
  audio.sfx('purchase_order', { x: e.x, y: e.y, vol: 0.6 });
}

define('team_leader', {
  tiers: {
    senior: 'Performance improvement plan: hurls clipboards while hanging back.',
    lead: '"I\'ll need you all to stay late": delegates a second pair of Interns below 50% HP (still max 2 alive).',
  },
  weapon: 'clipboard',
  init(e) { e.flags.ordersCd = e.rng.range(3, 5); e.flags.throwCd = e.rng.range(2, 4); e.flags.combo = 0; },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    if (!e.flags.delegated && d < 190) { e.flags.delegated = true; delegate(e, 'Can someone pick this up? Thanks.'); return; }
    if (e.tier >= 2 && !e.flags.delegated2 && e.hpFrac < 0.5) { e.flags.delegated2 = true; delegate(e, 'I\'ll need you all to stay late.'); return; }
    e.flags.ordersCd -= dt; e.flags.throwCd -= dt;
    const team = allies(e, 220).filter((a) => a.aware && a.arch.role !== 'support');
    if (e.flags.ordersCd <= 0 && team.length) {
      e.flags.ordersCd = e.rng.range(6, 8);
      e.setAnim('cast', true); e.busy = 0.4;
      callout(w, 'ACTION ITEMS!', '#8ac0ff', e);
      for (const a of team) { if (dist(a, e) < 140) { addBuff(a, 'orders', 4, 1.15, 1, '#8ac0ff'); ring(w, a.x, a.y - 10, 10, '#8ac0ff'); } }
      sayIf(e, 'attack', 0.7, 'tl_orders', 4);
      return;
    }
    // combo follow-up swat
    if (e.flags.combo === 1) {
      e.flags.combo = 0;
      if (d < 40) { swing(e, { windup: 0.4, reach: 36, damage: e.arch.damage * 0.8, knockback: 160, cd: 1.5, anim: 'attack2' }); return; }
    }
    const hangBack = team.length > 0 && d > 46;
    if (hangBack) {
      if (e.tier >= 1 && e.flags.throwCd <= 0 && sees && d < 150) {
        e.flags.throwCd = e.rng.range(3.5, 5);
        shoot(e, { windup: 0.55, itemId: 'clipboard', speed: 220, damage: e.arch.damage * 0.7, cd: 1.2 });
        return;
      }
      kite(e, dt, 80, 130, 0.9);
      return;
    }
    if (d < 38 && e.attackCd <= 0 && sees) {
      swing(e, { windup: 0.5, reach: 36, damage: e.arch.damage, knockback: 110, cd: 0.3, anim: 'attack1', recovery: 0.15, onFire: () => { e.flags.combo = 1; } });
      return;
    }
    approach(e, dt, 30, 1, 0.5);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// EMPLOYEE OF THE MONTH (elite) — enrages each time an ally dies: stacking speed/damage and faster windups.
const MAX_STACKS = 5;
define('employee_of_month', {
  tiers: {
    senior: 'Employee engagement: each enrage stack also heals 8% of max HP.',
    lead: 'Hall of Fame: the leap slam is available from the start and lands with an outer shockwave ring.',
  },
  weapon: 'framed_certificate',
  init(e) { e.flags.stacks = 0; e.flags.lungeCd = e.rng.range(2, 4); e.flags.leapCd = e.rng.range(3, 5); e.flags.baseTm = e.telegraphMult; },
  onAllyDeath(e) {
    if (!e.alive) return;
    const s = (e.flags.stacks = Math.min(MAX_STACKS, e.flags.stacks + 1));
    addBuff(e, 'enrage', 9999, 1 + 0.12 * s, 1 + 0.15 * s, '#ff5040');
    e.telegraphMult = e.flags.baseTm * (1 - 0.06 * s); // windup() still enforces the act minimum
    if (e.tier >= 1) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.08);
    callout(e.world, `ENRAGED ×${s}`, '#ff5040', e);
    ring(e.world, e.x, e.y - 12, 22, '#ff5040', 0.5);
    audio.sfx('boss_shout', { x: e.x, y: e.y, vol: 0.6 });
    e.alert();
    if (s === 1 || s === MAX_STACKS) e.bark('ally_death');
  },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (runDash(e, dt)) return;
    const leap = e.flags.leap as { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null;
    if (leap) {
      leap.t += dt;
      const k = clamp(leap.t / leap.dur, 0, 1);
      const nx = leap.fx + (leap.tx - leap.fx) * k, ny = leap.fy + (leap.ty - leap.fy) * k;
      w.moveActor(e, nx - e.x, ny - e.y);
      e.ghost = true; e.setAnim('dash');
      if (k >= 1) { e.flags.leap = null; e.ghost = false; }
      return;
    }
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.lungeCd -= dt; e.flags.leapCd -= dt;
    const canLeap = e.flags.stacks >= 3 || e.tier >= 2;
    if (canLeap && e.flags.leapCd <= 0 && sees && d > 50 && d < 160) {
      e.flags.leapCd = e.rng.range(5, 7);
      const tx = p.x, ty = p.y;
      const wu = e.windup(0.75);
      e.flags.leap = { fx: e.x, fy: e.y, tx, ty, t: 0, dur: wu };
      e.setAnim('heavy', true);
      burst(e, {
        x: tx, y: ty, r: 30, windup: 0.75, damage: e.arch.damage * 1.3, knockback: 220, heavy: true, busy: false,
        onFire: (x, y) => {
          e.busy = 0.45; e.ghost = false;
          ring(w, x, y - 2, 30, '#ff5040', 0.35); smokePuff(w.particles, x, y, 8, '#d8d0c0', 6);
          audio.sfx('thud', { x, y });
          if (e.tier >= 2) burst(e, { x, y, r: 60, inner: 30, windup: 0.35, damage: e.arch.damage * 0.7, knockback: 180, busy: false });
        },
      });
      e.busy = wu + 0.05;
      sayIf(e, 'attack', 0.8, 'eotm_leap', 3, 'This is what EXCELLENCE looks like!');
      return;
    }
    if (e.flags.lungeCd <= 0 && sees && d > 45 && d < 110) {
      e.flags.lungeCd = e.rng.range(4, 6);
      startDash(e, { len: Math.min(d + 12, 120), windup: 0.55, speed: 300, damage: e.arch.damage, knockback: 180, width: 12 });
      return;
    }
    if (d < 40 && e.attackCd <= 0 && sees) {
      swing(e, { windup: 0.5, reach: 40, arc: 1.8, damage: e.arch.damage, knockback: 150, cd: e.flags.stacks >= 3 ? 0.8 : 1.1, anim: e.rng.chance(0.5) ? 'attack1' : 'attack3' });
      return;
    }
    approach(e, dt, 34, 1, 0.6);
  },
  render(e, g: Ctx, before) {
    if (before || e.corpse || e.dying || !e.flags.stacks) return;
    // stack pips above the head
    const top = Math.round(e.y - e.height - 12);
    for (let i = 0; i < e.flags.stacks; i++) { g.fillStyle = '#0b0c10'; g.fillRect(Math.round(e.x) - 8 + i * 4 - 1, top - 1, 4, 4); g.fillStyle = '#ff5040'; g.fillRect(Math.round(e.x) - 8 + i * 4, top, 2, 2); }
  },
});

void go; void angleTo;
