// Act 1 archetypes (spec 5.2): Intern, Receptionist, Caretaker, IT Technician, Fire Warden (elite).
// All attacks are telegraphed through world.telegraph (via the helpers), respecting the act's minimum windup (0.4 s).
// Seniority extras (spec 5.3) are listed in each `tiers` block.
import { Enemy } from '../enemy';
import { audio } from '../../audio/audio';
import { smokePuff, sparks } from '../fx';
import { queryActors } from '../combat';
import { PROP_BEHAVIOURS } from '../world';
import {
  define, P, approach, kite, flee, go, pathDir, allies, addBuff, sayIf, gate, swing, burst, shoot, lineHit, zones, addWet,
  callout, ring, beamFx, isWalkable, dist, angleTo, fromAngle, norm,
} from './common';

const COFFEE = '#6b4a2b';

// ---------------------------------------------------------------------------------------------------------------
// INTERN — swarmer. Packs of 3–5 surround the player from spread flank slots; panics and flees at low HP;
// fumbles their coffee (slippery puddle + a free hit for the player).
define('intern', {
  tiers: {
    senior: 'Throws hot coffee: a lobbed cup that slows on hit and leaves a slippery puddle where it lands.',
    lead: '"Coffee run": once per fight hands coffees to up to 3 nearby colleagues (+30% speed, +15% damage for 8 s).',
  },
  weapon: (e) => (e.tier >= 1 ? 'coffee_tray' : 'mug'),
  init(e) {
    e.flags.fumbleCd = e.rng.range(7, 15);
    e.flags.flanker = e.rng.chance(0.35);
    e.flags.coffeeCd = e.rng.range(2, 5);
    e.flags.coffeeRun = e.tier >= 2;
  },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    // panic at low HP (once): flee, then pull themselves together
    if (!e.flags.panicked && e.hpFrac < 0.35) {
      e.flags.panicked = true; e.state = 'flee'; e.flags.fleeT = e.rng.range(2.5, 4);
      e.bark('flee');
    }
    if (e.state === 'flee') {
      e.flags.fleeT -= dt;
      if (d < 22 && e.attackCd <= 0 && sees) { // cornered: desperate flailing
        swing(e, { windup: 0.45, reach: 22, arc: 1.8, damage: e.arch.damage * 0.8, knockback: 80, cd: 1.4, anim: 'attack2' });
        return;
      }
      flee(e, dt);
      if (e.flags.fleeT <= 0) { e.state = 'chase'; sayIf(e, 'alert', 0.6, undefined, 0, e.rng.pick(['Right. Deep breaths. Back in.', 'My mentor said never give up!', 'I can still get a reference!'])); }
      return;
    }
    // Lead: coffee run for the team (once)
    if (e.flags.coffeeRun) {
      const near = allies(e, 100).filter((a) => a.aware).sort((a, b) => dist(a, e) - dist(b, e)).slice(0, 3);
      if (near.length) {
        e.flags.coffeeRun = false;
        e.busy = 0.6; e.setAnim('cast', true);
        callout(w, 'COFFEE RUN!', '#c89a6a', e);
        audio.sfx('pickup_item', { x: e.x, y: e.y });
        for (const a of near) { addBuff(a, 'coffee', 8, 1.3, 1.15, '#c89a6a'); ring(w, a.x, a.y - 10, 12, '#c89a6a'); beamFx(w, { x: e.x, y: e.y - 14 }, { x: a.x, y: a.y - 14 }, '#c89a6a', 0.3); }
        e.bark('buff');
        return;
      }
    }
    // fumble the coffee (comic, and a gift for the player)
    e.flags.fumbleCd -= dt;
    if (e.flags.fumbleCd <= 0 && d > 30 && d < 140 && Math.hypot(e.vx, e.vy) > 25) {
      e.flags.fumbleCd = e.rng.range(10, 18);
      e.busy = 0.75; e.vx *= 0.3; e.vy *= 0.3;
      e.setAnim('hit', true);
      addWet(w, e.x + Math.cos(e.facing) * 6, e.y + 2, 12, 6, COFFEE);
      audio.sfx('water_splash', { x: e.x, y: e.y, vol: 0.5 });
      sayIf(e, 'hurt', 0.7, 'intern_fumble', 6, e.rng.pick(['Oh no, my flat white!', 'Is this oat? This was oat!', 'Nobody saw that.']));
      return;
    }
    // Senior+: lob hot coffee
    e.flags.coffeeCd -= dt;
    if (e.tier >= 1 && e.flags.coffeeCd <= 0 && sees && d > 50 && d < 130 && e.attackCd <= 0) {
      e.flags.coffeeCd = e.rng.range(4, 7);
      shoot(e, {
        windup: 0.5, kind: 'coffee', speed: 170, gravity: true, damage: e.arch.damage * 0.8, type: 'fire', slow: { amt: 0.3, time: 1.5 }, cd: 1.2,
        onEnd: (x, y) => addWet(w, x, y, 12, 5, COFFEE),
      });
      return;
    }
    // pack courage: interns attack faster when the pack is together
    const pack = allies(e, 90).filter((a) => a.archetype === 'intern').length;
    if (d < 26 && e.attackCd <= 0 && sees) {
      swing(e, { windup: 0.5, reach: 24, arc: 1.4, damage: e.arch.damage, knockback: 90, cd: e.rng.range(1.0, 1.5) * (pack >= 2 ? 0.8 : 1), anim: e.rng.chance(0.5) ? 'attack1' : 'attack2' });
      if (e.rng.chance(0.25)) sayIf(e, 'attack', 1, 'intern_atk', 3);
      return;
    }
    approach(e, dt, 20, pack >= 2 ? 1.05 : 0.9, 1.3);
    void p;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// RECEPTIONIST — ranged. Keeps distance, repositions for line of sight, throws staplers and desk phones.
define('receptionist', {
  tiers: {
    senior: 'Stapler fan: throws three staplers in a spread.',
    lead: '"Please hold": thrown desk phones keep ringing where they land, then burst (telegraphed circle).',
  },
  weapon: 'desk_phone',
  init(e) { e.flags.throwN = 0; },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    if (d < 30 && e.attackCd <= 0 && sees && e.flags.stuckT > 0) { // cornered: phone swat
      swing(e, { windup: 0.5, reach: 26, damage: e.arch.damage, knockback: 140, cd: 1.3 });
      return;
    }
    if (sees && d < 155 && d > 34 && e.attackCd <= 0) {
      const phone = e.flags.throwN++ % 3 === 2;
      if (phone) {
        audio.sfx('phone_ring', { x: e.x, y: e.y, vol: 0.5 });
        const lead = e.tier >= 2;
        shoot(e, {
          windup: 0.65, itemId: 'desk_phone', speed: 190, damage: e.arch.damage * 1.3, knockback: 150, cd: e.rng.range(1.6, 2.2),
          onEnd: lead ? (x, y) => {
            callout(w, 'PLEASE HOLD…', '#ffd9a0', { x, y: y - 10 }, 0.8);
            burst(e, { x, y, r: 24, windup: 0.8, damage: e.arch.damage * 0.9, knockback: 120, busy: false, onFire: (bx, by) => { ring(w, bx, by - 4, 24, '#ffd9a0'); audio.sfx('phone_ring', { x: bx, y: by }); } });
          } : undefined,
        });
      } else {
        shoot(e, { windup: 0.5, kind: 'stapler_thrown', speed: 230, damage: e.arch.damage, cd: e.rng.range(1.2, 1.7), count: e.tier >= 1 ? 3 : 1, spread: 0.2 });
      }
      if (e.rng.chance(0.3)) sayIf(e, 'attack', 1, 'recep_atk', 4);
      return;
    }
    kite(e, dt, 70, 140);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// CARETAKER — bruiser. Wide mop sweep that leaves freshly mopped floor (slips the player, not the caretaker).
define('caretaker', {
  tiers: {
    senior: 'Mop slam: an overhead slam (telegraphed circle) that floods a wide area.',
    lead: 'Bucket slosh: lobs a bucket of mop water at range — a slippery puddle around the player.',
  },
  weapon: 'mop',
  init(e) { e.flags.n = 0; e.flags.bucketCd = e.rng.range(3, 6); },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.bucketCd -= dt;
    if (e.tier >= 2 && e.flags.bucketCd <= 0 && sees && d > 70 && d < 150) {
      e.flags.bucketCd = e.rng.range(7, 10);
      shoot(e, {
        windup: 0.7, kind: 'coffee', trail: '#6aa8d8', speed: 160, gravity: true, damage: e.arch.damage * 0.6, cd: 1.5, anim: 'heavy',
        onEnd: (x, y) => { addWet(w, x, y, 28, 9, '#6aa8d8', e, true); audio.sfx('mop_slosh', { x, y }); },
      });
      sayIf(e, 'attack', 1, 'ct_bucket', 6, 'Mind the floor. Or don\'t.');
      return;
    }
    if (d < 46 && e.attackCd <= 0 && sees) {
      const slam = e.tier >= 1 && e.flags.n++ % 3 === 2;
      if (slam) {
        const a = e.angleToPlayer();
        const x = e.x + Math.cos(a) * 26, y = e.y + Math.sin(a) * 20;
        burst(e, { x, y, r: 24, windup: 0.75, damage: e.arch.damage * 1.3, knockback: 160, heavy: true, cd: 1.8, anim: 'heavy', onFire: (bx, by) => { addWet(w, bx, by, 30, 10, '#6aa8d8', e, true); audio.sfx('mop_slosh', { x: bx, y: by }); } });
      } else {
        swing(e, {
          windup: 0.7, reach: 46, arc: 2.6, damage: e.arch.damage, knockback: 170, heavy: true, cd: 1.7, anim: 'heavy',
          onFire: (a) => {
            for (const k of [-0.7, 0, 0.7]) addWet(w, e.x + Math.cos(a + k) * 26, e.y + Math.sin(a + k) * 18, 14, 9, '#6aa8d8', e, true);
            audio.sfx('mop_slosh', { x: e.x, y: e.y });
          },
        });
      }
      if (e.rng.chance(0.3)) sayIf(e, 'attack', 1, 'ct_atk', 4);
      return;
    }
    // faster on his own freshly mopped floor
    const onMopped = zones(w).zones.some((z) => z.kind === 'mopped' && dist(z, e) < z.r);
    approach(e, dt, 36, onMopped ? 1.3 : 1, 0.6);
    void p;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// IT TECHNICIAN — disruptor. Lays cable trip-traps across the player's approach, electrifies water coolers,
// tasers at mid range.
define('it_tech', {
  tiers: {
    senior: 'Live cables: trip-traps are electrified (longer stun, electric damage, sparks).',
    lead: '"Have you tried turning it off and on again?": once below 40% HP, reboots (interruptible) to heal 35% and releases a telegraphed EMP ring that re-energises every cable in the room.',
  },
  weapon: 'keyboard',
  init(e) { e.flags.cableCd = e.rng.range(1, 3); e.flags.coolCd = e.rng.range(2, 4); },
  think(e, dt) {
    const w = e.world, p = P(e);
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.cableCd -= dt; e.flags.coolCd -= dt;
    // Lead: reboot
    if (e.tier >= 2 && !e.flags.rebooted && e.hpFrac < 0.4) {
      e.flags.rebooted = true;
      callout(w, 'REBOOTING…', '#9fe8ff', e, 1.4);
      e.setAnim('cast', true);
      burst(e, {
        x: e.x, y: e.y, r: 64, inner: 14, windup: 1.1, damage: e.arch.damage * 0.8, type: 'electric', stun: 0.4, knockback: 160, follow: true, anim: 'cast', recovery: 0.3,
        onFire: () => {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.35);
          ring(w, e.x, e.y - 8, 64, '#9fe8ff', 0.5);
          sparks(w.particles, e.x, e.y - 12, 16, '#9fe8ff', 140);
          audio.sfx('electric_zap', { x: e.x, y: e.y });
          for (const z of zones(w).zones) if (z.kind === 'cable' && dist(z, e) < 220) { z.data.live = true; z.t = Math.max(z.t, 14); }
          e.bark('revive', 'And we\'re back. Ticket closed.');
        },
      });
      return;
    }
    // electrify a water cooler near the player
    if (e.flags.coolCd <= 0) {
      const cooler = w.propsNear(e.x, e.y, 170, (q) => q.def.kind === 'water_cooler' && q.state !== 'destroyed' && !q.data.electrified)
        .filter((q) => dist(q.def, p) < 80).sort((a, b) => dist(a.def, e) - dist(b.def, e))[0];
      if (cooler) {
        const at = { x: cooler.def.x, y: cooler.def.y + 8 };
        if (dist(e, at) < 50) {
          e.flags.coolCd = 12;
          e.setAnim('cast', true);
          callout(w, 'ZAP', '#9fe8ff', at, 0.8);
          burst(e, {
            x: at.x, y: at.y, r: 32, windup: 0.8, noDamage: true, anim: 'cast',
            onFire: () => {
              if (PROP_BEHAVIOURS.water_cooler) {
                // hazards module owns cooler puddles: a numeric `electrified` timer + an electric hit makes a live leak
                cooler.data.electrified = 8; cooler.data.src = e;
                w.hitProp(cooler, { amount: 4, type: 'electric', method: 'hazard', source: e });
              } else {
                cooler.data.electrified = true;
                zones(w).add({ kind: 'shock', x: at.x, y: at.y, r: 32, t: 8, owner: e, data: { damage: e.dmg(5), prop: cooler } });
              }
              sparks(w.particles, at.x, at.y - 10, 14, '#9fe8ff', 120);
              audio.sfx('electric_zap', { x: at.x, y: at.y });
              w.decals.splat(w.roomAt(at.x, at.y), at.x, at.y, 12, '#6aa8d8', 'wet');
            },
          });
          sayIf(e, 'attack', 1, 'it_cooler', 5, 'Water and electricity. What could go wrong?');
          return;
        }
        if (d > 40) { go(e, pathDir(e, at), 1, dt); e.face(angleTo(e, at)); return; }
      } else e.flags.coolCd = 2;
    }
    // lay a cable trip-trap across the player's approach line
    const mine = zones(w).zones.filter((z) => z.kind === 'cable' && z.owner === e).length;
    if (e.flags.cableCd <= 0 && mine < 3 && sees && d > 40 && d < 150) {
      const a = angleTo(p, e);
      const c = { x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30 };
      const perp = a + Math.PI / 2;
      const h = 20;
      const A = { x: c.x + Math.cos(perp) * h, y: c.y + Math.sin(perp) * h }, B = { x: c.x - Math.cos(perp) * h, y: c.y - Math.sin(perp) * h };
      if (isWalkable(w, A.x, A.y, 2) && isWalkable(w, B.x, B.y, 2)) {
        e.flags.cableCd = e.rng.range(4, 6);
        e.busy = e.windup(0.55) + 0.2; e.vx = e.vy = 0;
        e.setAnim('cast', true);
        w.telegraph(e, { kind: 'line', x: A.x, y: A.y, angle: angleTo(A, B), len: h * 2, width: 6 }, e.windup(0.55), () => {
          if (!e.alive) return;
          zones(w).add({ kind: 'cable', x: A.x, y: A.y, x2: B.x, y2: B.y, r: 0, t: 18, owner: e, data: { live: e.tier >= 1, damage: e.dmg(e.tier >= 1 ? 6 : 4) } });
          audio.sfx('debris', { x: c.x, y: c.y, vol: 0.4 });
        });
        return;
      }
      e.flags.cableCd = 1;
    }
    // taser zap at mid range, keyboard swat up close
    if (d < 26 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.5, reach: 26, damage: e.arch.damage, cd: 1.2 }); return; }
    if (d < 85 && e.attackCd <= 0 && sees) {
      lineHit(e, { len: 90, width: 8, windup: 0.55, damage: e.arch.damage, type: 'electric', stun: 0.25, col: '#9fe8ff', cd: e.rng.range(1.8, 2.4), sfx: 'electric_zap', stopAtWalls: true });
      return;
    }
    kite(e, dt, 60, 110);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// FIRE WARDEN (elite) — extinguisher blast cone with heavy knockback + a vision-blocking smoke cloud; the whistle
// rallies and alerts nearby staff and buffs them.
define('fire_warden', {
  tiers: {
    senior: 'Double blast: the extinguisher cone is followed by a second, re-aimed blast.',
    lead: 'PPE issue: rallied colleagues also receive a protective shield (25% of their max HP).',
  },
  weapon: 'fire_extinguisher',
  init(e) { e.flags.rallyCd = 1.2; e.flags.blastCd = e.rng.range(1, 2.5); },
  think(e, dt) {
    const w = e.world;
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    e.flags.rallyCd -= dt; e.flags.blastCd -= dt;
    if (e.flags.rallyCd <= 0) {
      e.flags.rallyCd = 14;
      e.busy = 0.6; e.vx = e.vy = 0; e.setAnim('cast', true);
      audio.sfx('whistle', { x: e.x, y: e.y });
      ring(w, e.x, e.y - 14, 120, '#ffa040', 0.6); ring(w, e.x, e.y - 14, 60, '#ffa040', 0.4);
      callout(w, 'ASSEMBLY POINT!', '#ffa040', e);
      for (const a of w.actors) {
        if (!(a instanceof Enemy) || a === e || !a.alive) continue;
        const dd = dist(a, e);
        if (dd < 230) a.alert();
        if (dd < 150) {
          addBuff(a, 'rally', 6, 1.2, 1.2, '#ffa040');
          if (e.tier >= 2) { a.maxShield = Math.max(a.maxShield, Math.round(a.maxHp * 0.25)); a.shield = a.maxShield; }
        }
      }
      e.bark('buff');
      return;
    }
    const blast = (windup: number, follow: boolean) => swing(e, {
      windup, reach: 78, arc: 0.95, damage: e.arch.damage, knockback: 300, heavy: true, cd: 2.2, anim: 'heavy', recovery: follow ? 0.1 : 0.35,
      onFire: (a) => {
        const sx = e.x + Math.cos(a) * 50, sy = e.y + Math.sin(a) * 36;
        smokePuff(w.particles, sx, sy - 6, 16, '#f0f4f8', 9);
        audio.sfx('extinguisher_burst', { x: e.x, y: e.y });
        zones(w).add({ kind: 'smoke', x: sx, y: sy, r: 28, t: 4, owner: e });
        for (const t of queryActors(w, { kind: 'arc', x: e.x, y: e.y - 6, r: 78, angle: a, half: 0.48 }, 'enemy')) if (t !== e) { t.kx += Math.cos(a) * 160 / t.mass; t.ky += Math.sin(a) * 160 / t.mass; }
        if (follow && e.alive) { e.flags.blastCd = 0; e.flags.second = true; }
      },
    });
    if (e.flags.second) { e.flags.second = false; blast(0.45, false); return; }
    if (e.flags.blastCd <= 0 && d < 80 && sees && e.attackCd <= 0) {
      e.flags.blastCd = e.rng.range(3.5, 5);
      blast(0.6, e.tier >= 1);
      sayIf(e, 'attack', 0.5, 'fw_atk', 4);
      return;
    }
    if (d < 34 && e.attackCd <= 0 && sees) { swing(e, { windup: 0.55, reach: 34, damage: e.arch.damage * 0.9, knockback: 200, cd: 1.2, anim: 'attack1' }); return; }
    approach(e, dt, 50, 1, 0.7);
  },
});

void fromAngle; void norm; void gate;
