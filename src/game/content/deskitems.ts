// Desk Items (spec 7.2): rare passives, unique per run, no carry limit. The 40 definitions live in src/data/deskitems.ts;
// this module implements their effects (stat mods + floor hooks), the unlock gating and the "Desk Item acquired" pop-up.
import { DESK_ITEMS, DeskItemDef } from '../../data/deskitems';
import { STAT_MOD_PROVIDERS } from '../run';
import { hasUnlock } from '../profile';
import { Enemy } from '../enemy';
import { makeWeapon } from '../weapons';
import { notify } from '../../ui/corpos';
import { deskItemIcon } from '../../art/items';
import { logEvent } from '../run';
import type { Rng } from '../../core/rng';
import { S, TempMod, floorInstallers, trackInstall, disposers, on, tick, every, inMod, outMod, saver, near, foes, burst, shock, earn, say, sortByDist, onRoomEnter, enemiesInRoom, isCombatRoom, refundDurability, syncWorldStats } from './common';
import { mul, add } from './benefit-kit';

/** Desk Items available from the very first run; everything else needs profile unlock `desk:<id>` (hub vending machine). */
export const DESK_STARTERS = new Set([
  'stress_ball', 'out_of_office', 'gold_lanyard', 'ergonomic_cushion', 'lucky_mug', 'standing_desk', 'fidget_spinner', 'desk_fan',
  'post_it_notes', 'swear_jar', 'desk_plant', 'coffee_loyalty', 'wrist_rest', 'values_mug', 'fudged_receipts', 'employee_handbook',
]);

interface Effect {
  mods?: TempMod[];
  floor?: (s: S) => void;
  acquire?: (s: S) => void;
}

const ZAP = '#9fe8ff';

const FX: Record<string, Effect> = {
  stress_ball: { mods: [mul('rageFill', 1.3)] },
  out_of_office: { floor: (s) => { s.player.autoDodge = Math.max(s.player.autoDodge, 1); } },
  company_card: { /* creditLimit() in common.ts reads this item; repayments are taken from earnings by earn()/economy.ts */ },
  gold_lanyard: { mods: [add('shopDiscount', 0.2)] },
  employee_handbook: {
    floor: (s) => every(s, 0.5, () => {
      for (const e of foes(s)) {
        const r = e.promoted;
        if (!r || r.weaknessKnown) continue;
        r.weaknessKnown = true;
        s.run.intel.push(r.id);
        s.world.floatText(e.x, e.y - e.height - 14, 'WEAKNESS: ' + String(r.weakness).toUpperCase(), '#ffd34d');
        notify({ title: 'Employee Handbook', body: `Section 9: ${r.name} is weak to ${r.weakness}.`, kind: 'info', icon: deskItemIcon('employee_handbook') });
      }
    }),
  },
  ergonomic_cushion: { mods: [mul('maxShield', 1.5)] },
  lucky_mug: { mods: [add('luck', 0.35)] },
  noise_cancelling: {
    floor: (s) => {
      tick(s, () => { s.player.status.slow = 0; });
      inMod(s, (info) => { if (info.method === 'ranged' && info.source instanceof Enemy && info.source.archetype === 'call_centre') info.amount = 0; });
    },
  },
  standing_desk: { mods: [mul('moveSpeed', 1.1)] },
  fidget_spinner: { mods: [mul('dashCooldown', 1 / 1.2)] },
  desk_fan: { mods: [mul('shieldRegenRate', 1.4)] },
  post_it_notes: { floor: (s) => refundDurability(s, 1.3) },
  duct_tape: {
    floor: (s) => on(s, 'kill', (e) => {
      if (e.method !== 'melee' && e.method !== 'heavy') return;
      const w = s.run.loadout.melee;
      if (w && w.maxDur > 0 && w.dur < w.maxDur) w.dur++;
    }),
  },
  lanyard_clip: { mods: [mul('grabRange', 1.5), add('grabThreshold', 0.05)] },
  swear_jar: { floor: (s) => on(s, 'playerHit', () => earn(s, 3, { noMult: true })) },
  hang_in_there: {
    floor: (s) => saver(s, () => {
      if (s.run.flags.hangUsed) return false;
      s.run.flags.hangUsed = true;
      s.player.rage = 100; s.player.rageReadyAnnounced = true;
      say(s, 'HANG IN THERE!', '#ffd34d');
      notify({ title: 'Poster', body: 'Hang In There. You survived with 1 HP and a full Stress gauge.', kind: 'good', icon: deskItemIcon('hang_in_there') });
      return true;
    }),
  },
  desk_plant: { floor: (s) => on(s, 'roomClear', (e) => { if (isCombatRoom(s, e.roomId)) s.player.heal(3); }) },
  calculator_watch: { mods: [add('critChance', 0.1)], floor: (s) => { s.hud.showEnemyHp = true; } },
  monogrammed_stapler: {
    mods: [mul('ammoMult', 1.4)],
    acquire: (s) => { const r = s.run.loadout.ranged; if (r && r.maxAmmo > 0) { const add_ = Math.round(r.maxAmmo * 0.4); r.maxAmmo += add_; r.ammo += add_; } },
  },
  suspicious_usb: {
    floor: (s) => {
      let cd = 0;
      on(s, 'playerHit', () => {
        if (s.world.time < cd) return;
        cd = s.world.time + 0.6;
        for (const e of near(s, s.player.x, s.player.y, 48)) shock(s, e, 10, 0.4, 1.4);
        s.world.particles.spawn({ kind: 'ring', x: s.player.x, y: s.player.y - 10, life: 0.3, col: ZAP, size: 40 });
      });
    },
  },
  coffee_loyalty: {
    floor: (s) => on(s, 'kill', () => {
      const n = Number(s.run.flags.coffeeKills ?? 0) + 1;
      if (n >= 10) {
        s.run.flags.coffeeKills = 0;
        s.player.heal(5); s.player.addRage(15);
        say(s, 'FREE ESPRESSO', '#c8e85a');
      } else s.run.flags.coffeeKills = n;
    }),
  },
  spare_hi_vis: { mods: [mul('hazardTaken', 0.4)] },
  shredded_contract: { floor: (s) => on(s, 'execution', () => { s.player.dashCharges = s.player.stats.dashCharges; }) },
  fake_name_badge: {
    floor: (s) => onRoomEnter(s, (id) => {
      const list = sortByDist(enemiesInRoom(s, id), s.player);
      const e = list[0];
      if (!e) return;
      e.status.confused = Math.max(e.status.confused, 3);
      s.world.floatText(e.x, e.y - e.height - 10, 'WHO?', '#ffe9a0');
    }),
  },
  double_booked: {
    floor: (s) => {
      const stunElite = (e: Enemy) => { if (e.elite) { e.status.stun = Math.max(e.status.stun, 3); s.world.floatText(e.x, e.y - e.height - 10, 'DOUBLE-BOOKED', '#ffe9a0'); } };
      onRoomEnter(s, (id) => enemiesInRoom(s, id).forEach(stunElite));
      on(s, 'enemySpawn', (e) => { const en = e.enemy as Enemy; if (en.elite && s.world.rooms[en.roomId]?.entered) stunElite(en); });
    },
  },
  cycle_helmet: { mods: [mul('knockbackTaken', 0.5)] },
  golden_handshake: { floor: (s) => on(s, 'execution', () => earn(s, 15, { noMult: true })) },
  fudged_receipts: { mods: [mul('cashMult', 1.25)] },
  phone_charger: { floor: (s) => every(s, 5, () => { const r = s.run.loadout.ranged; if (r && r.maxAmmo > 0 && r.ammo < r.maxAmmo) r.ammo++; }) },
  emergency_opener: {
    floor: (s) => on(s, 'weaponBreak', (e) => {
      if (e.slot !== 'melee' || s.run.loadout.melee) return;
      s.run.loadout.melee = makeWeapon('letter_opener', { durabilityMult: s.player.stats.durabilityMult });
      say(s, 'EMERGENCY OPENER', '#e0e0e0');
    }),
  },
  leave_request: { acquire: (s) => { s.run.flags.leaveMult = 1.25; } },
  wrist_rest: { mods: [mul('meleeSpeed', 1.12)] },
  values_mug: { mods: [add('rageDuration', 2)] },
  sick_note: {
    floor: (s) => {
      let used = false;
      inMod(s, (info) => {
        if (used || info.amount < 15) return;
        used = true;
        info.amount *= 0.5;
        say(s, 'SICK NOTE', '#e0e0e0');
      });
    },
  },
  hands_free_headset: { mods: [mul('rageJargonFill', 1.6)] },
  parking_permit: { /* stair-landing heals are doubled in GameplayScene.depart() */ },
  confiscated_whistle: { floor: (s) => on(s, 'rageStart', () => burst(s, s.player.x, s.player.y, 96, { stun: 1.5, ring: '#ffffff' })) },
  hr_complaint: {
    floor: (s) => {
      const complainers = new Set<number>();
      on(s, 'playerHit', (e) => { if (e.source) complainers.add(e.source.id); });
      outMod(s, (info, t) => { if (complainers.has(t.id)) info.amount *= 1.2; });
    },
  },
  visitor_pass: { /* lift ambush chance and payout are handled in GameplayScene.depart() */ },
  rubber_duck: { /* a fourth attachment in Benefit emails: see openBenefitEmail() */ },
};

export const DESK_FX_IDS = Object.keys(FX);
export const deskById = (id: string): DeskItemDef | undefined => DESK_ITEMS.find((d) => d.id === id);
export const deskUnlocked = (d: DeskItemDef): boolean => DESK_STARTERS.has(d.id) || hasUnlock('desk:' + d.id);

STAT_MOD_PROVIDERS.push((run) => run.deskItems.flatMap((id) => (FX[id]?.mods ?? []).map((m) => ({ ...m, source: 'desk:' + id }))));

function install(s: S, id: string): void {
  const fx = FX[id];
  if (!fx?.floor) return;
  const d = disposers(s);
  d['d:' + id]?.();
  d['d:' + id] = trackInstall(s, 'desk_' + id, () => fx.floor!(s));
}
floorInstallers.push((s) => {
  for (const id of s.run.deskItems) {
    try { install(s, id); } catch (e) { console.error('[desk] install failed', id, e); }
  }
});

/** Items that could be offered now: unlocked, not held, and not already waiting on the floor as a pickup. */
export function deskPool(s: S, exclude: string[] = []): DeskItemDef[] {
  const reserved: Set<string> = (s.data.cpReservedDesk ??= new Set<string>());
  return DESK_ITEMS.filter((d) => deskUnlocked(d) && !s.run.deskItems.includes(d.id) && !reserved.has(d.id) && !exclude.includes(d.id));
}
export function rollDeskItem(s: S, rng: Rng, exclude: string[] = []): DeskItemDef | null {
  const pool = deskPool(s, exclude);
  if (!pool.length) return null;
  const luck = s.player.stats.luck;
  return rng.weighted(pool, (d) => (d.tier === 0 ? 10 : d.tier === 1 ? 5 * (1 + luck) : 2 * (1 + luck * 2)));
}

/** Give the player a Desk Item: stat mods apply, hooks install immediately, and the "Desk Item acquired" pop-up shows. */
export function acquireDeskItem(s: S, id: string, o: { quiet?: boolean } = {}): boolean {
  const d = deskById(id);
  if (!d || s.run.deskItems.includes(id)) return false;
  s.run.deskItems.push(id);
  s.player.refreshStats();
  syncWorldStats(s);
  install(s, id);
  FX[id]?.acquire?.(s);
  logEvent(s.run, 21, s.run.deskItems.length);
  if (!o.quiet) notify({ title: 'Desk Item acquired', body: `${d.name}: ${d.desc}`, icon: deskItemIcon(id), kind: 'good', duration: 7 });
  return true;
}

/** Desk item shop price (spec 8.3: 150-250 by tier). Interpolates from data/csv/prices.csv. */
export function deskTierPrice(tier: number, min: number, max: number): number { return Math.round(min + ((max - min) * tier) / 2); }
