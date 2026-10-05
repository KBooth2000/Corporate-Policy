// Benefit definitions: IT (electricity and tech) and Facilities (environment). Registered by benefits.ts.
import type { BenefitDef } from '../content-info';
import { B, mul, add } from './benefit-kit';
import { on, tick, every, outMod, near, foes, shock, burst, sortByDist, say, pct, pf, num, onRoomEnter, enemiesInRoom, refundDurability } from './common';
import { dropCash } from '../pickups';
import { audio } from '../../audio/audio';

const ZAP = '#9fe8ff';

export const IT_BENEFITS: BenefitDef[] = [
  B({
    id: 'chain_shock', dept: 'it', name: 'Surge Protector Off', starter: true,
    v: [{ n: 1, f: 0.4 }, { n: 2, f: 0.55 }, { n: 3, f: 0.7 }],
    desc: (v) => `Melee hits chain-shock ${v.n} nearby ${v.n === 1 ? 'enemy' : 'enemies'} for ${pf(v.f)} of the damage.`,
    floor: (s, v) => on(s, 'hit', (e) => {
      if (e.method !== 'melee' && e.method !== 'heavy') return;
      for (const o of sortByDist(near(s, e.target.x, e.target.y, 64, e.target), e.target).slice(0, v.n)) shock(s, o, e.amount * v.f, 0, 1.6);
    }),
  }),
  B({
    id: 'live_wires', dept: 'it', name: 'Live Wires', starter: true,
    v: [{ m: 1.5, d: 0.08 }, { m: 2, d: 0.12 }, { m: 3, d: 0.2 }],
    desc: (v) => `Electrified hazards stay live ${num(v.m)}x as long. Shocked enemies take ${pf(v.d)} more damage.`,
    floor: (s, v) => {
      (s.world as any).hazardLinger = v.m;
      outMod(s, (info, t) => { if (t.status.electrified > 0) info.amount *= 1 + v.d; });
      tick(s, (dt) => {
        const ext = dt * (1 - 1 / v.m);
        for (const p of s.world.props) {
          if (!p.def.hazard) continue;
          p.data.linger = v.m;
          if (typeof p.data.electrified === 'number' && p.data.electrified > 0) p.data.electrified += ext;
        }
        for (const e of foes(s)) if (e.status.electrified > 0) e.status.electrified = Math.min(e.status.electrified + ext, 8);
      });
    },
  }),
  B({
    id: 'firmware_update', dept: 'it', name: 'Firmware Update', starter: true,
    v: [{ d: 1.15, a: 1.1 }, { d: 1.3, a: 1.2 }, { d: 1.5, a: 1.35 }],
    desc: (v) => `Ranged damage +${pct(v.d)}. Ranged weapons carry ${pct(v.a)} more ammunition.`,
    mods: (v) => [mul('rangedDamage', v.d), mul('ammoMult', v.a)],
  }),
  B({
    id: 'ups', dept: 'it', name: 'Uninterruptible Power Supply', starter: true,
    v: [{ d: 8, t: 1 }, { d: 14, t: 1.5 }, { d: 22, t: 2.2 }],
    desc: (v) => `Shield break discharges ${v.d} damage and a ${num(v.t)}s stun within 72px (10s recharge).`,
    floor: (s, v) => {
      let cd = 0;
      on(s, 'playerHit', (e) => {
        if (e.absorbed <= 0 || s.player.shield > 0.5 || s.world.time < cd) return;
        cd = s.world.time + 10;
        say(s, 'POWER CUT', ZAP);
        audio.sfx('electric_zap', { x: s.player.x, y: s.player.y });
        burst(s, s.player.x, s.player.y, 72, { dmg: v.d, stun: v.t, electric: true, ring: ZAP });
      });
    },
  }),
  B({
    id: 'surge', dept: 'it', name: 'Power Surge',
    v: [{ t: 0.5, d: 6 }, { t: 0.8, d: 10 }, { t: 1.2, d: 16 }],
    desc: (v) => `Critical hits electrocute the target: ${v.d} damage and a ${num(v.t)}s stun.`,
    floor: (s, v) => on(s, 'hit', (e) => { if (e.crit) shock(s, e.target, v.d, v.t, 1.8); }),
  }),
  B({
    id: 'cache_flush', dept: 'it', name: 'Cache Flush',
    v: [0.25, 0.4, 0.6],
    desc: (v) => `Every kill recharges ${pf(v)} of a dash charge.`,
    floor: (s, v) => on(s, 'kill', () => { s.player.dashCharges = Math.min(s.player.stats.dashCharges, s.player.dashCharges + v); }),
  }),
  B({
    id: 'remote_desktop', dept: 'it', name: 'Remote Desktop',
    v: [{ td: 1.1, t: 0.6 }, { td: 1.2, t: 1 }, { td: 1.35, t: 1.5 }],
    desc: (v) => `Thrown items deal ${pct(v.td)} more damage and shock the target for ${num(v.t)}s.`,
    mods: (v) => [mul('throwDamage', v.td)],
    floor: (s, v) => on(s, 'hit', (e) => { if (e.method === 'throw') shock(s, e.target, 0, v.t, 1.8); }),
  }),
  B({
    id: 'ticket_closed', dept: 'it', name: 'Ticket Closed',
    v: [5, 9, 15],
    desc: (v) => `Enemies that die while shocked drop an extra £${v}.`,
    floor: (s, v) => on(s, 'kill', (e) => { if (e.victim.status.electrified > 0) dropCash(s.world, e.victim.x, e.victim.y, v); }),
  }),
  B({
    id: 'bandwidth_throttling', dept: 'it', name: 'Bandwidth Throttling',
    v: [0.15, 0.25, 0.38],
    desc: (v) => `Enemies within 72px are slowed by ${pf(v)}.`,
    floor: (s, v) => every(s, 0.2, () => {
      for (const e of near(s, s.player.x, s.player.y, 72)) { e.status.slow = Math.max(e.status.slow, 0.4); e.status.slowAmt = Math.max(e.status.slowAmt, v); }
    }),
  }),
  B({
    id: 'blue_screen', dept: 'it', name: 'Blue Screen of Death',
    v: [{ d: 20, t: 1 }, { d: 35, t: 1.5 }, { d: 60, t: 2.2 }],
    desc: (v) => `Executions blast everything within 110px: ${v.d} electric damage and a ${num(v.t)}s stun.`,
    floor: (s, v) => on(s, 'execution', () => burst(s, s.player.x, s.player.y, 110, { dmg: v.d, stun: v.t, electric: true, ring: ZAP })),
  }),
  B({
    id: 'reboot', dept: 'it', name: 'Have You Tried Turning It Off?',
    v: [{ t: 0.8, h: 0 }, { t: 1.2, h: 0 }, { t: 1.8, h: 0.15 }],
    desc: (v) => `Once per floor below 35% HP: full shield, ${num(v.t)}s stun within 80px${v.h ? `, heal ${pf(v.h)}` : ''}.`,
    floor: (s, v) => {
      let used = false;
      on(s, 'playerHit', () => {
        const p = s.player;
        if (used || p.hp <= 0 || p.hp / p.maxHp >= 0.35) return;
        used = true;
        p.shield = p.maxShield;
        if (v.h) p.heal(p.maxHp * v.h);
        say(s, 'REBOOTING...', ZAP);
        burst(s, p.x, p.y, 80, { stun: v.t, ring: ZAP });
      });
    },
  }),
];

export const FACILITIES_BENEFITS: BenefitDef[] = [
  B({
    id: 'industrial_grade', dept: 'facilities', name: 'Industrial-Grade Fixtures', starter: true,
    v: [1.25, 1.5, 2],
    desc: (v) => `Hazards deal ${pct(v)} more damage to enemies.`,
    mods: (v) => [mul('hazardDamage', v)],
  }),
  B({
    id: 'demolition_permit', dept: 'facilities', name: 'Demolition Permit', starter: true,
    v: [{ s: 1.5, c: 1.5 }, { s: 2.2, c: 2 }, { s: 3, c: 3 }],
    desc: (v) => `Breaches stun ${pct(v.s)} longer and pay ${pct(v.c)} more.`,
    mods: (v) => [mul('breachStun', v.s), mul('breachCash', v.c)],
  }),
  B({
    id: 'hard_hat', dept: 'facilities', name: 'Hard Hat Area', starter: true,
    v: [0.94, 0.89, 0.82],
    desc: (v) => `All damage you take is reduced by ${pf(1 - v)}.`,
    mods: (v) => [mul('damageTaken', v)],
  }),
  B({
    id: 'wet_floor_sign', dept: 'facilities', name: 'Wet Floor Sign', starter: true,
    v: [1.2, 1.35, 1.6],
    desc: (v) => `Enemies standing in water take ${pct(v)} more damage from you.`,
    floor: (s, v) => outMod(s, (info, t) => { if (t.status.wet > 0) info.amount *= v; }),
  }),
  B({
    id: 'non_slip', dept: 'facilities', name: 'Non-Slip Soles',
    v: [1.04, 1.08, 1.12],
    desc: (v) => `Move speed +${pct(v)}. You never slip on wet floors.`,
    mods: (v) => [mul('moveSpeed', v)],
    floor: (s) => tick(s, () => { s.player.status.wet = 0; }),
  }),
  B({
    id: 'sprinkler_maintenance', dept: 'facilities', name: 'Sprinkler Maintenance',
    v: [6, 9, 14],
    desc: (v) => `Enemies in a room are soaked for ${v}s when you enter it. Wet enemies slip over.`,
    floor: (s, v) => onRoomEnter(s, (id) => { for (const e of enemiesInRoom(s, id)) e.status.wet = Math.max(e.status.wet, v); }),
  }),
  B({
    id: 'steel_toe_caps', dept: 'facilities', name: 'Steel-Toe Capped Boots',
    v: [{ k: 1.25, s: 1.1 }, { k: 1.5, s: 1.2 }, { k: 2, s: 1.35 }],
    desc: (v) => `Knockback you deal +${pct(v.k)}, stagger +${pct(v.s)}. Walls hurt.`,
    mods: (v) => [mul('knockbackDealt', v.k), mul('staggerDealt', v.s)],
  }),
  B({
    id: 'deep_clean_rota', dept: 'facilities', name: 'Deep-Clean Rota',
    v: [1.25, 1.5, 2],
    desc: (v) => `Your melee weapon lasts ${num(v)}x as long (wear is randomly refunded).`,
    floor: (s, v) => refundDurability(s, v),
  }),
  B({
    id: 'spill_kit', dept: 'facilities', name: 'Spill Kit',
    v: [18, 26, 36],
    desc: (v) => `Kills leave a ${v}px puddle for 6s. Enemies crossing it slip; you know where the spills are.`,
    floor: (s, v) => {
      tick(s, () => { s.player.status.wet = 0; });
      on(s, 'kill', (e) => {
      const w = s.world;
      ((w as any).wetZones ??= []).push({ x: e.victim.x, y: e.victim.y, r: v, t: 6 });
      w.decals.splat(w.roomAt(e.victim.x, e.victim.y), e.victim.x, e.victim.y, 8, '#6aa8d8', 'wet');
      });
    },
  }),
  B({
    id: 'maintenance_contract', dept: 'facilities', name: 'Maintenance Contract',
    v: [24, 16, 9],
    desc: (v) => `Used execution objects are repaired after ${v}s, ready to be used again.`,
    floor: (s, v) => tick(s, () => {
      const w = s.world;
      for (const p of w.props) {
        if (!p.def.exec || p.gone) continue;
        if (p.used) {
          p.data.mcT ??= w.time;
          if (w.time - p.data.mcT >= v) { p.used = false; p.data.mcT = undefined; w.setPropState(p, 'intact'); w.floatText(p.def.x, p.def.y - 20, 'REPAIRED', '#9fe0ff'); }
        }
      }
    }),
  }),
  B({
    id: 'hs_inspector', dept: 'facilities', name: 'Health & Safety Inspector',
    v: [{ c: 6, h: 2 }, { c: 12, h: 4 }, { c: 20, h: 7 }],
    desc: (v) => `Hazard kills drop an extra £${v.c} and heal you for ${v.h}.`,
    floor: (s, v) => on(s, 'kill', (e) => {
      if (e.method !== 'hazard') return;
      dropCash(s.world, e.victim.x, e.victim.y, v.c);
      s.player.heal(v.h);
    }),
  }),
];

void add;
