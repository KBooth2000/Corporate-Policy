// Benefit definitions: Sales (speed and aggression) and Marketing (crowd control). Registered by benefits.ts.
import type { BenefitDef } from '../content-info';
import { B, mul, add } from './benefit-kit';
import { on, tick, every, outMod, near, foes, burst, earn, setTemp, st, pct, pf, num } from './common';
import type { Actor } from '../entity';

export const SALES_BENEFITS: BenefitDef[] = [
  B({
    id: 'hard_close', dept: 'sales', name: 'Hard Close', starter: true,
    v: [10, 16, 26],
    desc: (v) => `Your dash hits every enemy it passes through for ${v} damage (scaled by melee damage).`,
    floor: (s, v) => {
      let hit = new Set<number>();
      on(s, 'dash', () => { hit = new Set(); });
      tick(s, () => {
        const p = s.player;
        if (p.dashT <= 0) return;
        for (const e of near(s, p.x, p.y, 18)) {
          if (hit.has(e.id)) continue;
          hit.add(e.id);
          p.dealHit(e, v * p.stats.meleeDamage, 'melee', 140, 30, 'fists', Math.atan2(p.dashDir.y, p.dashDir.x));
        }
      });
    },
  }),
  B({
    id: 'cold_call', dept: 'sales', name: 'Cold Call', starter: true,
    v: [{ b: 0, r: 0 }, { b: 0.2, r: 0 }, { b: 0.4, r: 0.5 }],
    desc: (v) => `First hit after a dash is a critical${v.b ? `, ${pf(v.b)} stronger` : ''}${v.r ? ', refunding half a dash' : ''}.`,
    floor: (s, v) => {
      let armed = false;
      on(s, 'dashEnd', () => { armed = true; s.player.nextHitCrit = true; });
      outMod(s, (info) => {
        if (!armed || !info.crit) return;
        armed = false;
        info.amount *= 1 + v.b;
        if (v.r) s.player.dashCharges = Math.min(s.player.stats.dashCharges, s.player.dashCharges + v.r);
      });
    },
  }),
  B({
    id: 'commission', dept: 'sales', name: 'Commission Structure', starter: true,
    v: [{ max: 3, step: 0.05 }, { max: 5, step: 0.05 }, { max: 8, step: 0.05 }],
    desc: (v) => `Each kill stacks +${pf(v.step)} move and attack speed (max ${v.max}). Stacks drop after 4s without a kill.`,
    floor: (s, v) => {
      let n = 0, last = -99;
      const apply = () => setTemp(s, 'commission', n ? [mul('moveSpeed', 1 + v.step * n), mul('meleeSpeed', 1 + v.step * n)] : null);
      on(s, 'kill', () => { n = Math.min(v.max, n + 1); last = s.world.time; apply(); });
      tick(s, () => { if (n > 0 && s.world.time - last > 4) { n = 0; apply(); } });
    },
  }),
  B({
    id: 'stretch_target', dept: 'sales', name: 'Stretch Target', starter: true,
    v: [{ d: 1.08, c: 0.03 }, { d: 1.14, c: 0.05 }, { d: 1.22, c: 0.08 }],
    desc: (v) => `Melee damage +${pct(v.d)}. Critical hit chance +${pf(v.c)}.`,
    mods: (v) => [mul('meleeDamage', v.d), add('critChance', v.c)],
  }),
  B({
    id: 'elevator_pitch', dept: 'sales', name: 'Elevator Pitch',
    v: [{ c: 0.85, n: 0 }, { c: 0.75, n: 0 }, { c: 0.65, n: 1 }],
    desc: (v) => `Dash recharges ${pf(1 - v.c)} faster${v.n ? ' and you carry an extra dash charge' : ''}.`,
    mods: (v) => [mul('dashCooldown', v.c), ...(v.n ? [add('dashCharges', v.n)] : [])],
  }),
  B({
    id: 'spiff', dept: 'sales', name: 'Spiff',
    v: [{ c: 2, r: 3 }, { c: 3, r: 5 }, { c: 5, r: 8 }],
    desc: (v) => `A kill within 2s of the last pays £${v.c} and gives +${v.r} Rage.`,
    floor: (s, v) => {
      let last = -99;
      on(s, 'kill', () => {
        if (s.world.time - last < 2) { earn(s, v.c); s.player.addRage(v.r); }
        last = s.world.time;
      });
    },
  }),
  B({
    id: 'leaderboard_pressure', dept: 'sales', name: 'Leaderboard Pressure',
    v: [1.12, 1.2, 1.3],
    desc: (v) => `Deal ${pct(v)} more damage while four or more enemies share the room.`,
    floor: (s, v) => outMod(s, (info) => { if (s.world.liveEnemies(s.world.currentRoom) >= 4) info.amount *= v; }),
  }),
  B({
    id: 'ring_the_gong', dept: 'sales', name: 'Ring the Gong',
    v: [{ k: 6, t: 0.5 }, { k: 5, t: 0.8 }, { k: 4, t: 1.2 }],
    desc: (v) => `Every ${v.k}th kill rings the gong: enemies within 80px are blasted back and stunned ${num(v.t)}s.`,
    floor: (s, v) => {
      let n = 0;
      on(s, 'kill', () => {
        if (++n % v.k !== 0) return;
        s.world.floatText(s.player.x, s.player.y - 44, 'GONG!', '#ffd34d', 2);
        burst(s, s.player.x, s.player.y, 80, { stun: v.t, knock: 240, ring: '#ffd34d' });
      });
    },
  }),
  B({
    id: 'target_driven', dept: 'sales', name: 'Target-Driven Adrenaline',
    v: [1.15, 1.25, 1.4],
    desc: (v) => `Below 40% Wellbeing, melee attack speed +${pct(v)}.`,
    floor: (s, v) => {
      let low = false;
      tick(s, () => {
        const l = s.player.hp / s.player.maxHp < 0.4;
        if (l !== low) { low = l; setTemp(s, 'target_driven', l ? [mul('meleeSpeed', v)] : null); }
      });
    },
  }),
  B({
    id: 'hot_desking_sprint', dept: 'sales', name: 'Hot-Desking Sprint',
    v: [1.05, 1.1, 1.16],
    desc: (v) => `Move speed +${pct(v)}.`,
    mods: (v) => [mul('moveSpeed', v)],
  }),
  B({
    id: 'premium_tier', dept: 'sales', name: 'Premium Tier',
    v: [1.2, 1.35, 1.6],
    desc: (v) => `Heavy attacks deal ${pct(v)} more damage.`,
    mods: (v) => [mul('heavyDamage', v)],
  }),
];

export const MARKETING_BENEFITS: BenefitDef[] = [
  B({
    id: 'rebrand', dept: 'marketing', name: 'Rebrand', starter: true,
    v: [2, 3, 4.5],
    desc: (v) => `Thrown enemies rebrand whoever they hit, confusing them for ${num(v)}s.`,
    floor: (s, v) => on(s, 'throwHit', (e) => { if (e.hitActor) e.hitActor.status.confused = Math.max(e.hitActor.status.confused, v); }),
  }),
  B({
    id: 'go_viral', dept: 'marketing', name: 'Go Viral', starter: true,
    v: [{ r: 40, p: 0.5 }, { r: 56, p: 0.75 }, { r: 76, p: 1 }],
    desc: (v) => `Confusion is contagious: ${pf(v.p)} chance to spread to enemies within ${v.r}px.`,
    floor: (s, v) => {
      const was = new Map<number, boolean>();
      every(s, 0.15, () => {
        for (const e of foes(s)) {
          const c = e.status.confused > 0;
          if (c && !was.get(e.id)) {
            was.set(e.id, true);
            for (const o of near(s, e.x, e.y, v.r, e)) {
              if (o.status.confused <= 0 && s.world.rng.combat.chance(v.p)) { o.status.confused = 1.8; was.set(o.id, true); }
            }
          } else if (!c) was.set(e.id, false);
        }
      });
    },
  }),
  B({
    id: 'brand_engagement', dept: 'marketing', name: 'Brand Engagement', starter: true,
    v: [{ r: 1.25, t: 0.04 }, { r: 1.5, t: 0.07 }, { r: 1.8, t: 0.1 }],
    desc: (v) => `Grab range +${pct(v.r)}. You can grab enemies up to ${pf(v.t)} HP healthier.`,
    mods: (v) => [mul('grabRange', v.r), add('grabThreshold', v.t)],
  }),
  B({
    id: 'press_release', dept: 'marketing', name: 'Press Release',
    v: [{ d: 0, t: 0.8 }, { d: 8, t: 1.2 }, { d: 16, t: 1.8 }],
    desc: (v) => `Enemies killed by a throw or body-slam burst into confetti: stun ${num(v.t)}s${v.d ? `, ${v.d} damage` : ''} within 64px.`,
    floor: (s, v) => on(s, 'kill', (e) => {
      if (e.method !== 'body' && e.method !== 'throw') return;
      burst(s, e.victim.x, e.victim.y, 64, { dmg: v.d, stun: v.t, ring: '#ffd34d' });
    }),
  }),
  B({
    id: 'engagement_metrics', dept: 'marketing', name: 'Engagement Metrics',
    v: [{ s: 1.3, k: 1.1 }, { s: 1.6, k: 1.2 }, { s: 2, k: 1.35 }],
    desc: (v) => `Stagger you deal +${pct(v.s)}, knockback +${pct(v.k)}.`,
    mods: (v) => [mul('staggerDealt', v.s), mul('knockbackDealt', v.k)],
  }),
  B({
    id: 'influencer_collab', dept: 'marketing', name: 'Influencer Collab',
    v: [1.5, 2.5, 3.5],
    desc: (v) => `Grabbing an enemy mesmerises everyone within 100px: confused for ${num(v)}s.`,
    floor: (s, v) => on(s, 'grab', (e) => { for (const o of near(s, s.player.x, s.player.y, 100, e.victim)) o.status.confused = Math.max(o.status.confused, v); }),
  }),
  B({
    id: 'rebrand_rollout', dept: 'marketing', name: 'Rebrand Rollout',
    v: [1.3, 1.6, 2.2],
    desc: (v) => `Thrown items deal ${pct(v)} more damage.`,
    mods: (v) => [mul('throwDamage', v)],
  }),
  B({
    id: 'teaser_campaign', dept: 'marketing', name: 'Teaser Campaign',
    v: [1, 1.5, 2.2],
    desc: (v) => `The first enemy you hit in each room is stunned for ${num(v)}s.`,
    floor: (s, v) => {
      const done = new Set<number>();
      on(s, 'hit', (e) => {
        const r = s.world.roomAt(e.target.x, e.target.y);
        if (done.has(r)) return;
        done.add(r);
        e.target.status.stun = Math.max(e.target.status.stun, v);
      });
    },
  }),
  B({
    id: 'brand_ambassador', dept: 'marketing', name: 'Brand Ambassador',
    v: [{ j: 1.5, f: 1 }, { j: 1.9, f: 1.05 }, { j: 2.5, f: 1.1 }],
    desc: (v) => `Overheard jargon fills ${pct(v.j)} more Rage${v.f > 1 ? `; all Rage gain +${pct(v.f)}` : ''}.`,
    mods: (v) => [mul('rageJargonFill', v.j), ...(v.f > 1 ? [mul('rageFill', v.f)] : [])],
  }),
  B({
    id: 'flash_mob', dept: 'marketing', name: 'Flash Mob', starter: true,
    v: [{ r: 44, t: 1 }, { r: 56, t: 1.6 }, { r: 72, t: 2.4 }],
    desc: (v) => `When a dash ends, enemies within ${v.r}px break into spontaneous dance (confused ${num(v.t)}s).`,
    floor: (s, v) => on(s, 'dashEnd', () => { for (const e of near(s, s.player.x, s.player.y, v.r)) e.status.confused = Math.max(e.status.confused, v.t); }),
  }),
  B({
    id: 'ab_testing', dept: 'marketing', name: 'A/B Testing',
    v: [0.2, 0.3, 0.4],
    desc: (v) => `${pf(v)} of hits run an experiment on the target: randomly slowed, stunned or confused.`,
    floor: (s, v) => on(s, 'hit', (e) => {
      const rng = s.world.rng.combat;
      if (!rng.chance(v)) return;
      const t: Actor = e.target;
      const k = rng.int(0, 2);
      if (k === 0) { t.status.slow = Math.max(t.status.slow, 2); t.status.slowAmt = Math.max(t.status.slowAmt, 0.4); }
      else if (k === 1) t.status.stun = Math.max(t.status.stun, 0.8);
      else t.status.confused = Math.max(t.status.confused, 2);
      s.world.floatText(t.x, t.y - t.height - 10, ['VARIANT A', 'VARIANT B', 'VARIANT C'][k], '#ffd34d');
    }),
  }),
];

void st;
