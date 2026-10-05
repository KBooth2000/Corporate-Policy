// Dual-department Synergies (spec 7.1): offered only once you hold Benefits from both departments.
// Plus the "Stress Modifier" pool (Rage modifiers granted by the rage_mod reward; executive-flavoured, id prefix `stress_`).
import type { BenefitDef } from '../content-info';
import { B, mul, add } from './benefit-kit';
import { on, tick, every, near, foes, shock, burst, earn, setTemp, dist2, pct, pf, num, onRoomEnter, say } from './common';
import { audio } from '../../audio/audio';

const ZAP = '#9fe8ff';

export const SYNERGIES: BenefitDef[] = [
  B({
    id: 'smart_building', dept: 'it', synergy: ['it', 'facilities'], name: 'Smart Building', starter: true,
    v: [{ r: 36, cd: 8 }, { r: 52, cd: 6 }, { r: 72, cd: 4 }],
    desc: (v) => `Hazards trigger themselves when an enemy is within ${v.r}px (each re-arms after ${v.cd}s).`,
    floor: (s, v) => every(s, 0.25, () => {
      const w = s.world;
      const enemies = foes(s);
      if (!enemies.length) return;
      for (const p of w.props) {
        if (!p.def.hazard || p.gone || p.used || p.state === 'destroyed') continue;
        p.data.autoTrigger = true;
        if (w.time < (p.data.smartT ?? 0)) continue;
        const px = p.def.x, py = p.def.y - p.def.h / 2;
        if (dist2(s.player, { x: px, y: py }) < 40) continue; // never blow the player up with their own building
        if (!enemies.some((e) => dist2(e, { x: px, y: py }) < v.r)) continue;
        p.data.smartT = w.time + v.cd;
        w.floatText(px, py - 14, 'AUTO-TRIGGER', ZAP);
        w.hitProp(p, { amount: 12, type: 'electric', method: 'other', source: s.player, dir: 0, heavy: true });
      }
    }),
  }),
  B({
    id: 'fast_broadband', dept: 'it', synergy: ['it', 'sales'], name: 'Fast Broadband', starter: false,
    v: [0.4, 0.7, 1],
    desc: (v) => `Your dash leaves a live trail: enemies it brushes are shocked and stunned ${num(v)}s.`,
    floor: (s, v) => {
      const hit = new Set<number>();
      on(s, 'dash', () => hit.clear());
      tick(s, () => {
        if (s.player.dashT <= 0) return;
        for (const e of near(s, s.player.x, s.player.y, 22)) { if (hit.has(e.id)) continue; hit.add(e.id); shock(s, e, 6, v, 1.6); }
      });
    },
  }),
  B({
    id: 'phishing_campaign', dept: 'it', synergy: ['it', 'marketing'], name: 'Phishing Campaign', starter: false,
    v: [5, 9, 14],
    desc: (v) => `Confused enemies zap each other every second for ${v} electric damage (within 48px).`,
    floor: (s, v) => every(s, 1, () => {
      for (const e of foes(s)) {
        if (e.status.confused <= 0) continue;
        const o = near(s, e.x, e.y, 48, e)[0];
        if (o) shock(s, o, v, 0, 1.4);
      }
    }),
  }),
  B({
    id: 'crypto_mining', dept: 'it', synergy: ['it', 'finance'], name: 'Crypto Mining', starter: false, minRarity: 1,
    v: [{ p: 6, c: 1 }, { p: 4.5, c: 2 }, { p: 3, c: 3 }],
    desc: (v) => `The server room is not for work: earn £${v.c} every ${num(v.p)}s while in combat.`,
    floor: (s, v) => every(s, v.p, () => { if (s.world.inCombat) earn(s, v.c); }),
  }),
  B({
    id: 'terms_of_service', dept: 'it', synergy: ['it', 'legal'], name: 'Terms of Service', starter: true,
    v: [2, 3, 5],
    desc: (v) => `Shocked enemies are automatically served an Injunction (${v}s, +30% damage taken).`,
    floor: (s, v) => every(s, 0.2, () => { for (const e of foes(s)) if (e.status.electrified > 0) e.status.injunction = Math.max(e.status.injunction, v); }),
  }),
  B({
    id: 'smart_watch', dept: 'it', synergy: ['it', 'hr'], name: 'Smart Watch', starter: false,
    v: [{ h: 3, s: 5 }, { h: 5, s: 10 }, { h: 8, s: 15 }],
    desc: (v) => `Killing a shocked enemy heals ${v.h} and restores ${v.s} shield. Your watch tells you to breathe.`,
    floor: (s, v) => on(s, 'kill', (e) => {
      if (e.victim.status.electrified <= 0) return;
      s.player.heal(v.h);
      s.player.shield = Math.min(s.player.maxShield, s.player.shield + v.s);
    }),
  }),
  B({
    id: 'cto_promotion', dept: 'it', synergy: ['it', 'executive'], name: 'Chief Technology Officer', starter: true, minRarity: 1,
    v: [{ d: 25, t: 1 }, { d: 45, t: 1.4 }, { d: 75, t: 2 }],
    desc: (v) => `Executions arc lightning through every enemy within 200px: ${v.d} damage and ${num(v.t)}s stun.`,
    floor: (s, v) => on(s, 'execution', () => {
      audio.sfx('electric_zap', { x: s.player.x, y: s.player.y });
      for (const e of near(s, s.player.x, s.player.y, 200)) shock(s, e, v.d, v.t, 2);
    }),
  }),
  B({
    id: 'express_delivery', dept: 'facilities', synergy: ['facilities', 'sales'], name: 'Express Delivery', starter: false,
    v: [{ c: 5, b: 1.15 }, { c: 10, b: 1.25 }, { c: 20, b: 1.4 }],
    desc: (v) => `Breaches refill your dashes, pay £${v.c}, and give ${pct(v.b)} move speed for 4s.`,
    floor: (s, v) => {
      let until = 0;
      on(s, 'breach', () => {
        s.player.dashCharges = s.player.stats.dashCharges;
        earn(s, v.c);
        until = s.world.time + 4;
        setTemp(s, 'express_delivery', [mul('moveSpeed', v.b)]);
        say(s, 'EXPRESS DELIVERY', '#ffd34d');
      });
      tick(s, () => { if (until && s.world.time > until) { until = 0; setTemp(s, 'express_delivery', null); } });
    },
  }),
  B({
    id: 'slippery_slope', dept: 'facilities', synergy: ['facilities', 'marketing'], name: 'Slippery Slope', starter: true,
    v: [0.6, 1, 1.5],
    desc: (v) => `Wet enemies are so busy with the Wet Floor sign that they are confused for ${num(v)}s.`,
    floor: (s, v) => every(s, 0.2, () => { for (const e of foes(s)) if (e.status.wet > 0) e.status.confused = Math.max(e.status.confused, v); }),
  }),
  B({
    id: 'litigation_finance', dept: 'finance', synergy: ['finance', 'legal'], name: 'Litigation Finance', starter: true,
    v: [1, 2, 3],
    desc: (v) => `Every hit on an Injunction'd enemy pays £${v}. Justice is expensive.`,
    floor: (s, v) => on(s, 'hit', (e) => { if (e.target.status.injunction > 0) earn(s, v, { quiet: true }); }),
  }),
  B({
    id: 'burnout_recovery', dept: 'hr', synergy: ['hr', 'executive'], name: 'Burnout Recovery', starter: true, minRarity: 1,
    v: [{ h: 0.15, sh: false }, { h: 0.25, sh: false }, { h: 0.4, sh: true }],
    desc: (v) => `When Rage ends you are signed off sick: heal ${pf(v.h)} of max Wellbeing${v.sh ? ' and restore your shield' : ''}.`,
    floor: (s, v) => on(s, 'rageEnd', () => {
      s.player.heal(s.player.maxHp * v.h);
      if (v.sh) s.player.shield = s.player.maxShield;
    }),
  }),
  B({
    id: 'bonus_season', dept: 'sales', synergy: ['sales', 'executive'], name: 'Bonus Season', starter: false,
    v: [{ c: 3, e: 0.3 }, { c: 5, e: 0.5 }, { c: 8, e: 0.8 }],
    desc: (v) => `Kills while Raging pay £${v.c} and extend Rage by ${num(v.e)}s.`,
    floor: (s, v) => on(s, 'kill', () => { if (s.player.raging > 0) { earn(s, v.c); s.player.raging += v.e; } }),
  }),
];

// ---------------------------------------------------------------------------
// Stress Modifiers: the Rage-modifier reward (a "Stress Modifier" choice email). Duration, on-activation effects,
// healing on kill and fill-rate boosts. Held in run.benefits like any other Benefit but never offered by Benefit rewards.
export const STRESS_MODS: BenefitDef[] = [
  B({
    id: 'stress_overtime', dept: 'executive', name: 'Unpaid Overtime', starter: true,
    v: [3, 4.5, 6],
    desc: (v) => `Rage lasts ${num(v)}s longer.`,
    mods: (v) => [add('rageDuration', v)],
  }),
  B({
    id: 'stress_tantrum', dept: 'executive', name: 'Tantrum Shockwave', starter: true,
    v: [{ d: 18, t: 0.3 }, { d: 30, t: 0.6 }, { d: 48, t: 1 }],
    desc: (v) => `Activating Rage releases a tantrum within 96px: ${v.d} damage, big knockback, ${num(v.t)}s stun.`,
    floor: (s, v) => on(s, 'rageStart', () => burst(s, s.player.x, s.player.y, 96, { dmg: v.d, stun: v.t, knock: 320, ring: '#ff6a4a' })),
  }),
  B({
    id: 'stress_catharsis', dept: 'executive', name: 'Cathartic Release', starter: true,
    v: [0.15, 0.25, 0.4],
    desc: (v) => `Activating Rage heals ${pf(v)} of your max Wellbeing.`,
    floor: (s, v) => on(s, 'rageStart', () => s.player.heal(s.player.maxHp * v)),
  }),
  B({
    id: 'stress_silent_treatment', dept: 'executive', name: 'The Silent Treatment',
    v: [1, 1.6, 2.5],
    desc: (v) => `Activating Rage freezes every enemy within 160px in awkward silence for ${num(v)}s.`,
    floor: (s, v) => on(s, 'rageStart', () => burst(s, s.player.x, s.player.y, 160, { stun: v, ring: '#c8d0ff' })),
  }),
  B({
    id: 'stress_bloodlust', dept: 'executive', name: 'Blood on the Carpet',
    v: [3, 5, 9],
    desc: (v) => `Kills while Raging heal ${v} Wellbeing.`,
    mods: (v) => [add('rageKillHeal', v)],
  }),
  B({
    id: 'stress_pressure_cooker', dept: 'executive', name: 'Pressure Cooker', starter: true,
    v: [{ f: 1.35, j: 1.2 }, { f: 1.75, j: 1.4 }, { f: 2.3, j: 1.8 }],
    desc: (v) => `Rage fills ${pct(v.f)} faster; overheard jargon fills a further ${pct(v.j)}.`,
    mods: (v) => [mul('rageFill', v.f), mul('rageJargonFill', v.j)],
  }),
  B({
    id: 'stress_preloaded', dept: 'executive', name: 'Pre-Loaded Frustration',
    v: [20, 35, 55],
    desc: (v) => `Start every combat room with +${v} Rage already simmering.`,
    floor: (s, v) => onRoomEnter(s, (id) => { if ((s.world.rooms[id]?.enemies.size ?? 0) > 0) s.player.addRage(v); }),
  }),
  B({
    id: 'stress_adrenaline', dept: 'executive', name: 'Adrenaline Dump',
    v: [0.7, 0.5, 0.35],
    desc: (v) => `While Raging, dash recharges ${pf(1 - v)} faster. Starting Rage refills your dashes.`,
    floor: (s, v) => {
      on(s, 'rageStart', () => { s.player.dashCharges = s.player.stats.dashCharges; setTemp(s, 'stress_adrenaline', [mul('dashCooldown', v)]); });
      on(s, 'rageEnd', () => setTemp(s, 'stress_adrenaline', null));
    },
  }),
  B({
    id: 'stress_hide', dept: 'executive', name: 'Thick-Skinned Fury', starter: true,
    v: [{ r: 0.15, d: 1.05 }, { r: 0.25, d: 1.1 }, { r: 0.35, d: 1.2 }],
    desc: (v) => `Rage damage resistance +${pf(v.r)}, Rage damage +${pct(v.d)}.`,
    mods: (v) => [add('rageResist', v.r), mul('rageDamage', v.d)],
  }),
  B({
    id: 'stress_hysteria', dept: 'executive', name: 'Mass Hysteria', starter: true,
    v: [0.4, 0.7, 1.1],
    desc: (v) => `Every kill while Raging extends it by ${num(v)}s.`,
    floor: (s, v) => on(s, 'kill', () => { if (s.player.raging > 0) s.player.raging += v; }),
  }),
  B({
    id: 'stress_scorched_earth', dept: 'executive', name: 'Scorched Earth',
    v: [0.3, 0.45, 0.7],
    desc: (v) => `While Raging, melee hits splash ${pf(v)} damage to every enemy within 44px.`,
    floor: (s, v) => on(s, 'hit', (e) => {
      if (s.player.raging <= 0 || (e.method !== 'melee' && e.method !== 'heavy')) return;
      for (const o of near(s, e.target.x, e.target.y, 44, e.target)) s.world.damage(o, { amount: e.amount * v, type: 'fire', method: 'rage', source: s.player, knockback: 0 });
    }),
  }),
];

void [mul, add];
