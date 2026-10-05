// Benefit definitions: Finance (economy), Legal (debuffs), HR (sustain), Executive (Rage and executions).
import type { BenefitDef } from '../content-info';
import { B, mul, add } from './benefit-kit';
import { on, tick, outMod, near, burst, earn, setTemp, say, st, saver, pct, pf, num, isCombatRoom } from './common';
import { dropCash, Pickup } from '../pickups';
import { Enemy } from '../enemy';
import { audio } from '../../audio/audio';

const money = (n: number) => `£${n}`;

// ---------------------------------------------------------------------------
export const FINANCE_BENEFITS: BenefitDef[] = [
  B({
    id: 'compound_interest', dept: 'finance', name: 'Compound Interest', starter: true,
    v: [{ r: 0.03, cap: 12 }, { r: 0.05, cap: 25 }, { r: 0.08, cap: 45 }],
    desc: (v) => `Clearing a room earns ${pf(v.r)} interest on cash held (max ${money(v.cap)}).`,
    floor: (s, v) => on(s, 'roomClear', (e) => {
      if (!isCombatRoom(s, e.roomId) || s.run.pettyCash <= 0) return;
      earn(s, Math.min(v.cap, Math.max(1, Math.floor(s.run.pettyCash * v.r))), { noMult: true });
    }),
  }),
  B({
    id: 'shareholder_value', dept: 'finance', name: 'Shareholder Value', starter: true,
    v: [{ per: 0.05, max: 0.2 }, { per: 0.08, max: 0.35 }, { per: 0.12, max: 0.6 }],
    desc: (v) => `Deal +${pf(v.per)} damage per £50 held (max +${pf(v.max)}).`,
    floor: (s, v) => outMod(s, (info) => { info.amount *= 1 + Math.min(v.max, (s.run.pettyCash / 50) * v.per); }),
  }),
  B({
    id: 'performance_bonus', dept: 'finance', name: 'Performance Bonus', starter: true,
    v: [1.15, 1.3, 1.5],
    desc: (v) => `All Petty Cash you pick up is worth ${pct(v)} more.`,
    mods: (v) => [mul('cashMult', v)],
  }),
  B({
    id: 'rate_card', dept: 'finance', name: 'Corporate Rate Card', starter: true,
    v: [0.1, 0.15, 0.25],
    desc: (v) => `${pf(v)} discount on everything in the Canteen and vending machines.`,
    mods: (v) => [add('shopDiscount', v)],
  }),
  B({
    id: 'tax_loophole', dept: 'finance', name: 'Tax Loophole',
    v: [0.12, 0.2, 0.3],
    desc: (v) => `${pf(v)} chance for each kill to drop double the usual cash.`,
    floor: (s, v) => on(s, 'kill', (e) => {
      if (!s.world.rng.loot.chance(v)) return;
      const base = e.victim instanceof Enemy ? e.victim.cashDrop : 4;
      dropCash(s.world, e.victim.x, e.victim.y, base);
    }),
  }),
  B({
    id: 'asset_stripping', dept: 'finance', name: 'Asset Stripping',
    v: [10, 20, 35],
    desc: (v) => `Whenever a weapon breaks you sell the pieces for ${money(v)}.`,
    floor: (s, v) => on(s, 'weaponBreak', () => earn(s, v)),
  }),
  B({
    id: 'golden_parachute', dept: 'finance', name: 'Golden Parachute',
    v: [{ cost: 30, heal: 0.35 }, { cost: 20, heal: 0.5 }, { cost: 10, heal: 0.7 }],
    desc: (v) => `Once per floor, below 25% Wellbeing, pay ${money(v.cost)} to heal ${pf(v.heal)}.`,
    floor: (s, v) => {
      let used = false;
      on(s, 'playerHit', () => {
        const p = s.player;
        if (used || p.hp <= 0 || p.hp / p.maxHp >= 0.25 || s.run.pettyCash < v.cost) return;
        used = true;
        s.run.pettyCash -= v.cost; s.run.log.cashSpent += v.cost;
        p.heal(p.maxHp * v.heal);
        say(s, 'GOLDEN PARACHUTE', '#ffd34d');
      });
    },
  }),
  B({
    id: 'expense_account', dept: 'finance', name: 'Expense Account',
    v: [1, 2, 3],
    desc: (v) => `The first ${v === 1 ? 'reroll' : v + ' rerolls'} in every Canteen ${v === 1 ? 'is' : 'are'} free.`,
  }),
  B({
    id: 'overdraft', dept: 'finance', name: 'Overdraft Facility',
    v: [80, 150, 250],
    desc: (v) => `Shop on credit up to ${money(v)} of debt. Repaid from future earnings.`,
  }),
  B({
    id: 'quarterly_dividend', dept: 'finance', name: 'Quarterly Dividend',
    v: [10, 18, 30],
    desc: (v) => `Clearing a combat floor pays ${money(v)} plus £1 per floor number.`,
    floor: (s, v) => on(s, 'floorClear', () => {
      if (!['standard', 'elite', 'challenge', 'lift_ambush'].includes(s.plan.floor_type)) return;
      earn(s, v + s.plan.floor_number);
    }),
  }),
  B({
    id: 'day_trading', dept: 'finance', name: 'Day Trading',
    v: [{ w: 0.15, l: 0.05 }, { w: 0.2, l: 0.03 }, { w: 0.25, l: 0 }],
    desc: (v) => `Each cash pickup has a ${pf(v.w)} chance to double${v.l ? ` and a ${pf(v.l)} chance to lose a third` : ''}.`,
    floor: (s, v) => on(s, 'pickup', (e) => {
      if (e.kind !== 'cash' || !e.amount) return;
      const r = s.world.rng.loot.next();
      if (r < v.w) { earn(s, e.amount, { noMult: true }); s.world.floatText(s.player.x, s.player.y - 52, 'BULL RUN', '#8af0a0'); }
      else if (r < v.w + v.l) {
        const loss = Math.min(s.run.pettyCash, Math.round(e.amount / 3));
        s.run.pettyCash -= loss;
        if (loss) s.world.floatText(s.player.x, s.player.y - 52, 'MARKET CRASH', '#ff9a8a');
      }
    }),
  }),
];

// ---------------------------------------------------------------------------
export const LEGAL_BENEFITS: BenefitDef[] = [
  B({
    id: 'injunction', dept: 'legal', name: 'Injunction', starter: true,
    v: [3, 5, 8],
    desc: (v) => `Hits serve an Injunction for ${v}s: the target takes 30% more damage.`,
    floor: (s, v) => on(s, 'hit', (e) => { if (e.target.alive) e.target.status.injunction = Math.max(e.target.status.injunction, v); }),
  }),
  B({
    id: 'cease_and_desist', dept: 'legal', name: 'Cease and Desist', starter: true,
    v: [{ t: 2, a: 0.25 }, { t: 2.5, a: 0.35 }, { t: 3, a: 0.5 }],
    desc: (v) => `Hits slow the target by ${pf(v.a)} for ${num(v.t)}s.`,
    floor: (s, v) => on(s, 'hit', (e) => { const t = e.target; t.status.slow = Math.max(t.status.slow, v.t); t.status.slowAmt = Math.max(t.status.slowAmt, v.a); }),
  }),
  B({
    id: 'small_print', dept: 'legal', name: 'The Small Print', starter: true,
    v: [0.25, 0.5, 0.9],
    desc: (v) => `Critical hits deal +${v.toFixed(2)}x extra damage.`,
    mods: (v) => [add('critMult', v)],
  }),
  B({
    id: 'discovery_phase', dept: 'legal', name: 'Discovery Phase', starter: true,
    v: [1.4, 1.7, 2.2],
    desc: (v) => `The first hit on each enemy deals ${pct(v)} more damage.`,
    floor: (s, v) => {
      const seen = new Set<number>();
      outMod(s, (info, t) => { if (!seen.has(t.id)) { seen.add(t.id); info.amount *= v; } });
    },
  }),
  B({
    id: 'gag_order', dept: 'legal', name: 'Gag Order',
    v: [0.15, 0.25, 0.35],
    desc: (v) => `${pf(v)} of hits serve a gag order: the target cannot attack for 3s.`,
    floor: (s, v) => on(s, 'hit', (e) => {
      if (!s.world.rng.combat.chance(v)) return;
      e.target.status.blind = Math.max(e.target.status.blind, 3);
      s.world.floatText(e.target.x, e.target.y - e.target.height - 10, 'GAGGED', '#d8d8ff');
    }),
  }),
  B({
    id: 'limitation_of_liability', dept: 'legal', name: 'Limitation of Liability',
    v: [0.95, 0.9, 0.83],
    desc: (v) => `You take ${pf(1 - v)} less damage from everything. It is in the contract.`,
    mods: (v) => [mul('damageTaken', v)],
  }),
  B({
    id: 'class_action', dept: 'legal', name: 'Class Action',
    v: [0.25, 0.4, 0.6],
    desc: (v) => `Hits on an Injunction'd enemy splash ${pf(v)} of the damage to every other Injunction'd enemy.`,
    floor: (s, v) => on(s, 'hit', (e) => {
      if (e.target.status.injunction <= 0) return;
      for (const a of s.world.actors) {
        if (a === e.target || a.team !== 'enemy' || !a.alive || a.status.injunction <= 0) continue;
        s.world.damage(a, { amount: e.amount * v, type: 'blunt', method: 'other', source: s.player, knockback: 0 });
      }
    }),
  }),
  B({
    id: 'binding_arbitration', dept: 'legal', name: 'Binding Arbitration',
    v: [1.2, 1.35, 1.55],
    desc: (v) => `Stunned or staggered enemies take ${pct(v)} more damage from you.`,
    floor: (s, v) => outMod(s, (info, t) => { if (t.status.stun > 0 || t.staggered > 0) info.amount *= v; }),
  }),
  B({
    id: 'case_law', dept: 'legal', name: 'Case Law',
    v: [0.05, 0.08, 0.12],
    desc: (v) => `Consecutive hits on one target stack +${pf(v)} damage (max 5 stacks, reset after 3s).`,
    floor: (s, v) => {
      let target = -1, n = 0, last = -99;
      outMod(s, (info, t) => {
        const now = s.world.time;
        if (t.id === target && now - last < 3) n = Math.min(5, n + 1); else n = 0;
        target = t.id; last = now;
        info.amount *= 1 + n * v;
      });
    },
  }),
  B({
    id: 'summary_judgement', dept: 'legal', name: 'Summary Judgement',
    v: [0.08, 0.12, 0.18],
    desc: (v) => `Melee hits that leave a non-boss below ${pf(v)} HP end the case immediately (elites: half that).`,
    floor: (s, v) => on(s, 'hit', (e) => {
      if (e.method !== 'melee' && e.method !== 'heavy') return;
      const t = e.target;
      if (!t.alive || (t as Enemy).isBoss) return;
      const thr = (t as Enemy).elite ? v / 2 : v;
      if (t.hpFrac >= thr) return;
      s.world.floatText(t.x, t.y - t.height - 10, 'SETTLED', '#ffd34d');
      s.world.damage(t, { amount: t.hp + 1, type: 'cut', method: 'melee', source: s.player, unavoidable: true, knockback: 0 });
    }),
  }),
  B({
    id: 'terms_and_conditions', dept: 'legal', name: 'Terms & Conditions',
    v: [{ b: 0.1, d: 1.4 }, { b: 0.2, d: 1.8 }, { b: 0.35, d: 2.5 }],
    desc: (v) => `${pf(v.b)} extra chance for hits to cause bleeding, and bleeding hurts ${pct(v.d)} more.`,
    mods: (v) => [mul('bleedDamage', v.d)],
    floor: (s, v) => outMod(s, (info) => { info.bleed = Math.min(1, (info.bleed ?? 0) + v.b); }),
  }),
];

// ---------------------------------------------------------------------------
export const HR_BENEFITS: BenefitDef[] = [
  B({
    id: 'wellbeing_hour', dept: 'hr', name: 'Wellbeing Hour', starter: true,
    v: [{ r: 1.3, d: 0.85 }, { r: 1.6, d: 0.7 }, { r: 2.1, d: 0.5 }],
    desc: (v) => `Wellbeing shield regenerates ${pct(v.r)} faster and starts ${pf(1 - v.d)} sooner.`,
    mods: (v) => [mul('shieldRegenRate', v.r), mul('shieldRegenDelay', v.d)],
  }),
  B({
    id: 'return_to_work', dept: 'hr', name: 'Return-to-Work Interview', starter: true,
    v: [4, 7, 12],
    desc: (v) => `Heal ${v} Wellbeing every time you clear a room.`,
    floor: (s, v) => on(s, 'roomClear', (e) => { if (isCombatRoom(s, e.roomId)) s.player.heal(v); }),
  }),
  B({
    id: 'mindfulness_app', dept: 'hr', name: 'Mindfulness App', starter: true,
    v: [1.2, 1.4, 1.7],
    desc: (v) => `Wellbeing shield capacity +${pct(v)}.`,
    mods: (v) => [mul('maxShield', v)],
  }),
  B({
    id: 'private_healthcare', dept: 'hr', name: 'Private Healthcare', starter: true,
    v: [{ h: 1.25, m: 5 }, { h: 1.5, m: 10 }, { h: 2, m: 15 }],
    desc: (v) => `All healing +${pct(v.h)}. Max Wellbeing +${v.m}.`,
    mods: (v) => [mul('healMult', v.h), add('maxHp', v.m)],
  }),
  B({
    id: 'team_debrief', dept: 'hr', name: 'Team Debrief',
    v: [0.5, 1, 1.8],
    desc: (v) => `Heal ${num(v)} Wellbeing per kill.`,
    mods: (v) => [add('killHeal', v)],
  }),
  B({
    id: 'duty_of_care', dept: 'hr', name: 'Duty of Care',
    v: [{ gap: 5, heal: 0 }, { gap: 2, heal: 0 }, { gap: 1, heal: 0.2 }],
    desc: (v) => `Survive a fatal hit at 1 HP, ${v.gap === 5 ? 'once per act' : v.gap === 2 ? 'once every 2 floors' : 'once per floor, then heal 20%'}.`,
    floor: (s, v) => {
      const sc = st(s);
      saver(s, () => {
        const last = Number(s.run.flags.dutyFloor ?? -99);
        if (s.run.floor - last < v.gap) return false;
        s.run.flags.dutyFloor = s.run.floor;
        sc.dutyHeal = v.heal; sc.dutyT = 0.15;
        say(s, 'DUTY OF CARE', '#4fdc7a');
        return true;
      });
      tick(s, (dt) => {
        if (!sc.dutyT) return;
        sc.dutyT -= dt;
        if (sc.dutyT <= 0) { sc.dutyT = 0; if (sc.dutyHeal) s.player.heal(s.player.maxHp * sc.dutyHeal); }
      });
    },
  }),
  B({
    id: 'fruit_bowl', dept: 'hr', name: 'Fruit Bowl',
    v: [{ p: 0.08, h: 6 }, { p: 0.12, h: 8 }, { p: 0.18, h: 12 }],
    desc: (v) => `${pf(v.p)} of kills drop a snack that heals ${v.h}.`,
    floor: (s, v) => on(s, 'kill', (e) => { if (s.world.rng.loot.chance(v.p)) s.world.add(new Pickup({ kind: 'heal', amount: v.h, x: e.victim.x, y: e.victim.y })); }),
  }),
  B({
    id: 'employee_assistance', dept: 'hr', name: 'Employee Assistance Programme',
    v: [2.5, 3.5, 5],
    desc: (v) => `Below 35% Wellbeing, your shield regenerates ${num(v)}x as fast with almost no delay.`,
    floor: (s, v) => {
      let low = false;
      tick(s, () => {
        const l = s.player.hp / s.player.maxHp < 0.35;
        if (l !== low) { low = l; setTemp(s, 'employee_assistance', l ? [mul('shieldRegenRate', v), mul('shieldRegenDelay', 0.2)] : null); }
      });
    },
  }),
  B({
    id: 'trauma_counselling', dept: 'hr', name: 'Trauma Counselling',
    v: [0.15, 0.25, 0.4],
    desc: (v) => `${pf(v)} of the damage you take is healed back over the next few seconds.`,
    floor: (s, v) => {
      const sc = st(s);
      on(s, 'playerHit', (e) => { sc.pool = (sc.pool ?? 0) + e.amount * v; });
      tick(s, (dt) => {
        if (!(sc.pool > 0)) return;
        const h = Math.min(sc.pool, dt * 6);
        s.player.heal(h, false);
        sc.pool -= h;
      });
    },
  }),
  B({
    id: 'annual_health_check', dept: 'hr', name: 'Annual Health Check',
    v: [0.05, 0.1, 0.18],
    desc: (v) => `Arrive on every new floor with ${pf(v)} of your max Wellbeing restored.`,
    floor: (s, v) => { if (s.world.time < 0.5) s.player.heal(s.player.maxHp * v, false); },
  }),
  B({
    id: 'flexible_working', dept: 'hr', name: 'Flexible Working',
    v: [{ d: 0.92, m: 1.03 }, { d: 0.84, m: 1.05 }, { d: 0.75, m: 1.08 }],
    desc: (v) => `Dash recharges ${pf(1 - v.d)} faster. Move speed +${pct(v.m)}.`,
    mods: (v) => [mul('dashCooldown', v.d), mul('moveSpeed', v.m)],
  }),
];

// ---------------------------------------------------------------------------
export const EXEC_BENEFITS: BenefitDef[] = [
  B({
    id: 'extended_mandate', dept: 'executive', name: 'Extended Mandate', starter: true,
    v: [2, 3.5, 5],
    desc: (v) => `Rage lasts ${num(v)}s longer.`,
    mods: (v) => [add('rageDuration', v)],
  }),
  B({
    id: 'severance_package', dept: 'executive', name: 'Severance Package', starter: true,
    v: [10, 18, 30],
    desc: (v) => `Every execution heals ${v} Wellbeing.`,
    mods: (v) => [add('executionHeal', v)],
  }),
  B({
    id: 'exit_interview', dept: 'executive', name: 'Exit Interview', starter: true,
    v: [1.5, 2.5, 4],
    desc: (v) => `Executions during Rage extend it by ${num(v)}s.`,
    mods: (v) => [add('executionRageExtend', v)],
  }),
  B({
    id: 'aggressive_targets', dept: 'executive', name: 'Aggressive Targets', starter: true,
    v: [1.15, 1.3, 1.5],
    desc: (v) => `Damage dealt while Raging +${pct(v)}.`,
    mods: (v) => [mul('rageDamage', v)],
  }),
  B({
    id: 'high_pressure', dept: 'executive', name: 'High-Pressure Environment',
    v: [1.2, 1.4, 1.7],
    desc: (v) => `Rage fills ${pct(v)} faster from everything.`,
    mods: (v) => [mul('rageFill', v)],
  }),
  B({
    id: 'thick_skin', dept: 'executive', name: 'Thick Skin',
    v: [0.1, 0.2, 0.3],
    desc: (v) => `Rage damage resistance +${pf(v)}.`,
    mods: (v) => [add('rageResist', v)],
  }),
  B({
    id: 'killer_instinct', dept: 'executive', name: 'Killer Instinct',
    v: [8, 14, 24],
    desc: (v) => `Kills while Raging restore ${v} Wellbeing shield.`,
    floor: (s, v) => on(s, 'kill', () => { if (s.player.raging > 0) s.player.shield = Math.min(s.player.maxShield, s.player.shield + v); }),
  }),
  B({
    id: 'fight_or_flight', dept: 'executive', name: 'Fight or Flight',
    v: [{ h: 0, sh: false }, { h: 0.1, sh: false }, { h: 0.2, sh: true }],
    desc: (v) => `Activating Rage refills your dashes${v.h ? `, heals ${pf(v.h)}` : ''}${v.sh ? ' and restores your shield' : ''}.`,
    floor: (s, v) => on(s, 'rageStart', () => {
      const p = s.player;
      p.dashCharges = p.stats.dashCharges;
      if (v.h) p.heal(p.maxHp * v.h);
      if (v.sh) p.shield = p.maxShield;
    }),
  }),
  B({
    id: 'golden_hello', dept: 'executive', name: 'Golden Hello',
    v: [10, 20, 35],
    desc: (v) => `Executions pay £${v} straight into your expenses.`,
    floor: (s, v) => on(s, 'execution', () => earn(s, v)),
  }),
  B({
    id: 'hostile_entrance', dept: 'executive', name: 'Hostile Entrance',
    v: [{ d: 20, t: 0.6 }, { d: 35, t: 1 }, { d: 60, t: 1.5 }],
    desc: (v) => `Activating Rage shatters the room: ${v.d} damage and ${num(v.t)}s stun within 90px.`,
    floor: (s, v) => on(s, 'rageStart', () => {
      audio.sfx('gong', { x: s.player.x, y: s.player.y, vol: 0.6 });
      burst(s, s.player.x, s.player.y, 90, { dmg: v.d, stun: v.t, knock: 200, ring: '#ff3a2a' });
    }),
  }),
  B({
    id: 'delegated_authority', dept: 'executive', name: 'Delegated Authority',
    v: [0.08, 0.14, 0.22],
    desc: (v) => `You can grab enemies with up to ${pf(v)} more HP, so executions come sooner.`,
    mods: (v) => [add('grabThreshold', v)],
  }),
  B({
    id: 'succession_planning', dept: 'executive', name: 'Succession Planning',
    v: [0.6, 0.35, 0.1],
    desc: (v) => `Rage decays ${pf(1 - v)} slower outside combat.`,
    mods: (v) => [mul('rageDecay', v)],
  }),
];
