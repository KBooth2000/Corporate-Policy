// The hub vending machine's catalogue (spec 7.3, 8.2): everything bought with Annual Leave, plus feat-gated unlocks.
// Unlock id convention (profile.unlocks): benefit:<id>, desk:<id>, weapon:<id>, event:<id>, role:<id>, radio:<index>, cosmetic:<id>.
// Starter content needs no unlock. Run pools must exclude locked content: use contentUnlocked() / the is*Unlocked helpers.
import { profile, saveProfile } from '../profile';
import { WEAPONS, ROLES } from '../../data/tables';
import { DESK_ITEMS } from '../../data/deskitems';
import { EVENTS } from '../../data/text/events';
import { BENEFITS } from '../content-info';
import { RADIO_TRACKS } from '../../audio/audio';
import { BENEFIT_DEPTS } from '../../data/ids';
import type { PlayerRoleId } from '../../data/ids';
import { awardAchievement } from './achievements';
import { notify } from '../../ui/corpos';
import { saveSafe } from './util';

export type UnlockKind = 'weapon' | 'benefit' | 'desk' | 'event' | 'role';

// ---------------------------------------------------------------------------
// Pricing. Annual Leave earn rate (see progression.ts) averages ~25 days/hour early, ~55 days/hour for a competent player.
// With about 100 purchasable items the total comes to roughly 2,400 days: a first CEO kill lands at 10-20 h (with a few
// dozen cheap unlocks bought on the way) and everything is unlocked at roughly 40-60 h. Tune UNIT to rebalance the lot.
export const PRICING = {
  UNIT: 26,
  weight: {
    weapon: [1.0, 1.0, 2.4] as const,          // by rarity (Standard weapons are starters)
    benefit: [0.8, 1.1, 1.5] as const,         // Standard / Enhanced min rarity / Synergy
    desk: [0.7, 1.2, 2.4] as const,            // by tier
    event: 0.35,
  },
  /** Early-access ("sign-on fee") prices for roles; the condition unlocks them for free. Ex-Employee is prestige only. */
  roleFast: { temp: 60, night_cleaner: 140, contractor: 220 } as Partial<Record<PlayerRoleId, number>>,
};

const STARTER_DESK = new Set(['stress_ball', 'gold_lanyard', 'ergonomic_cushion', 'standing_desk', 'fidget_spinner', 'post_it_notes', 'desk_plant', 'swear_jar', 'wrist_rest', 'values_mug', 'employee_handbook', 'sick_note']);
const STARTER_EVENTS = new Set(['photocopier_fortune', 'team_building_trust_fall', 'leaving_do_cake', 'mandatory_fun_raffle', 'suggestion_box', 'wellness_pod', 'smoking_shelter', 'lost_property', 'stationery_amnesty', 'vending_machine_jam']);

// ---------------------------------------------------------------------------
export interface FeatDef { label: string; target: number; progress: () => number }

/** Feat-gated unlocks: not for sale, unlocked automatically (checkFeatUnlocks) once the lifetime target is met. */
export const FEATS: Record<string, FeatDef> = {
  'weapon:paperweight': { label: 'Defenestrate 50 enemies', target: 50, progress: () => profile().stats.defenestrations },
  'weapon:guillotine_blade': { label: 'Execute 10 enemies in the shredder', target: 10, progress: () => profile().stats.execByType.shredder ?? 0 },
  'weapon:wrench': { label: 'Breach 25 walls', target: 25, progress: () => profile().stats.breaches },
  'weapon:confetti_cannon': { label: 'Activate Rage 100 times', target: 100, progress: () => profile().stats.rageActivations },
  'desk:hang_in_there': { label: 'Reach floor 15', target: 15, progress: () => profile().stats.bestFloor },
  'desk:rubber_duck': { label: 'Terminate 3 promoted enemies', target: 3, progress: () => profile().stats.promotedTerminated },
};

export interface Perk {
  id: string; kind: UnlockKind; key: string; name: string; desc: string;
  price: number; rarity: 0 | 1 | 2; starter: boolean; feat?: FeatDef; tag?: string; dept?: string;
  /** roles only */
  role?: PlayerRoleId;
}

const roundPrice = (w: number): number => Math.max(5, Math.round((w * PRICING.UNIT) / 5) * 5);

let cache: { key: string; perks: Perk[] } | null = null;

/** Full catalogue (built lazily so content modules have registered their Benefits). */
export function catalogue(): Perk[] {
  const key = String(BENEFITS.length);
  if (cache && cache.key === key) return cache.perks;
  const perks: Perk[] = [];
  for (const w of Object.values(WEAPONS)) {
    if (w.id === 'fists') continue;
    const id = 'weapon:' + w.id, feat = FEATS[id];
    perks.push({ id, kind: 'weapon', key: w.id, name: w.name, desc: w.desc, rarity: w.rarity, starter: w.rarity === 0, feat, price: feat ? 0 : roundPrice(PRICING.weight.weapon[w.rarity]), tag: w.cls.toUpperCase() });
  }
  for (const b of BENEFITS) {
    const id = 'benefit:' + b.id;
    const rar = (b.minRarity ?? 0) as 0 | 1 | 2;
    const wt = b.synergy ? PRICING.weight.benefit[2] : PRICING.weight.benefit[rar];
    perks.push({ id, kind: 'benefit', key: b.id, name: b.name, desc: b.desc[rar], rarity: rar, starter: !!b.starter, price: b.starter ? 0 : roundPrice(wt), tag: b.synergy ? 'SYNERGY' : b.dept.toUpperCase(), dept: b.dept });
  }
  for (const d of DESK_ITEMS) {
    const id = 'desk:' + d.id, feat = FEATS[id];
    perks.push({ id, kind: 'desk', key: d.id, name: d.name, desc: d.desc, rarity: d.tier, starter: STARTER_DESK.has(d.id), feat, price: STARTER_DESK.has(d.id) || feat ? 0 : roundPrice(PRICING.weight.desk[d.tier]), tag: 'DESK ITEM' });
  }
  for (const e of EVENTS) {
    const id = 'event:' + e.id;
    perks.push({ id, kind: 'event', key: e.id, name: e.title, desc: e.intro, rarity: 0, starter: STARTER_EVENTS.has(e.id), price: STARTER_EVENTS.has(e.id) ? 0 : roundPrice(PRICING.weight.event), tag: 'EVENT' });
  }
  for (const r of Object.values(ROLES)) {
    const fast = PRICING.roleFast[r.id];
    perks.push({ id: 'role:' + r.id, kind: 'role', key: r.id, role: r.id, name: r.name, desc: r.desc, rarity: 0, starter: r.unlock === 'default', price: fast ?? 0, tag: 'ROLE' });
  }
  cache = { key, perks };
  return perks;
}

export function perksOf(kind: UnlockKind): Perk[] { return catalogue().filter((p) => p.kind === kind); }

/** Total days required to buy everything purchasable (pacing check; roles excluded). */
export function catalogueTotal(): number { return catalogue().filter((p) => p.kind !== 'role' && !p.starter && !p.feat).reduce((a, p) => a + p.price, 0); }

// ---------------------------------------------------------------------------
// Ownership / availability. Other modules call these when building run pools.
export function isOwned(p: Perk): boolean {
  if (p.starter) return true;
  if (p.kind === 'role') return profile().roles.includes(p.role!);
  return profile().unlocks.includes(p.id);
}

export function isWeaponUnlocked(id: string): boolean { const w = WEAPONS[id]; return !w || id === 'fists' || w.rarity === 0 || profile().unlocks.includes('weapon:' + id); }
export function isBenefitUnlocked(id: string): boolean { const b = BENEFITS.find((x) => x.id === id); return !b || !!b.starter || profile().unlocks.includes('benefit:' + id); }
export function isDeskItemUnlocked(id: string): boolean { return STARTER_DESK.has(id) || profile().unlocks.includes('desk:' + id); }
export function isEventUnlocked(id: string): boolean { return STARTER_EVENTS.has(id) || profile().unlocks.includes('event:' + id); }
export function isRoleUnlocked(id: PlayerRoleId): boolean { return id === 'office_worker' || profile().roles.includes(id); }
export function contentUnlocked(kind: UnlockKind, id: string): boolean {
  switch (kind) {
    case 'weapon': return isWeaponUnlocked(id);
    case 'benefit': return isBenefitUnlocked(id);
    case 'desk': return isDeskItemUnlocked(id);
    case 'event': return isEventUnlocked(id);
    case 'role': return isRoleUnlocked(id as PlayerRoleId);
  }
}

export type BuyResult = { ok: true } | { ok: false; reason: string };

export function purchase(p: Perk): BuyResult {
  const prof = profile();
  if (isOwned(p)) return { ok: false, reason: 'Already unlocked. HR cannot find a refund form.' };
  if (p.feat) return { ok: false, reason: 'Feat required: ' + p.feat.label + '.' };
  if (p.kind === 'role' && !p.price) return { ok: false, reason: 'Earned in play only: ' + roleCondition(p.role!).label + '.' };
  if (prof.annualLeave < p.price) return { ok: false, reason: `Not enough Annual Leave. You need ${p.price - prof.annualLeave} more days. Your manager says "work harder".` };
  prof.annualLeave -= p.price;
  grant(p.id);
  awardAchievement('first_unlock');
  saveSafe();
  return { ok: true };
}

/** Add an unlock id (and the role bookkeeping). Idempotent. */
export function grant(id: string): void {
  const p = profile();
  if (id.startsWith('role:')) {
    const r = id.slice(5) as PlayerRoleId;
    if (!p.roles.includes(r)) p.roles.push(r);
  }
  if (!p.unlocks.includes(id)) p.unlocks.push(id);
}

// ---------------------------------------------------------------------------
// Role unlock conditions (spec 7.3)
export interface RoleCondition { label: string; have: number; need: number; done: boolean }
export function roleCondition(id: PlayerRoleId): RoleCondition {
  const s = profile().stats;
  const mk = (label: string, have: number, need: number): RoleCondition => ({ label, have: Math.min(have, need), need, done: have >= need });
  switch (ROLES[id].unlock) {
    case 'reach_floor_6': return mk('Reach floor 6', s.bestFloor, 6);
    case 'hazard_kills_100': return mk('Kill 100 enemies with hazards', s.hazardKills, 100);
    case 'beat_boss_2': return mk('Beat the Act 2 boss', Math.max(s.bossKills.head_of_sales ?? 0, s.bestFloor > 10 ? 1 : 0), 1);
    case 'beat_ceo': return mk('Beat the CEO', Math.max(s.bossKills.ceo ?? 0, s.wins), 1);
    default: return mk('Default', 1, 1);
  }
}

/** Unlock roles whose conditions are met. Returns newly unlocked role ids. */
export function checkRoleUnlocks(announce = true): PlayerRoleId[] {
  const got: PlayerRoleId[] = [];
  for (const r of Object.values(ROLES)) {
    if (isRoleUnlocked(r.id) || !roleCondition(r.id).done) continue;
    grant('role:' + r.id);
    got.push(r.id);
    awardAchievement(r.id + '_unlock', !announce);
    if (announce) notify({ kind: 'good', title: 'New role: ' + r.name, body: ROLES[r.id].desc + ' Choose it in the car boot.', icon: 'user', sound: 'ui_unlock' });
  }
  return got;
}

/** Unlock feat-gated perks whose targets are met. Returns the newly unlocked perks. */
export function checkFeatUnlocks(announce = true): Perk[] {
  const got: Perk[] = [];
  for (const p of catalogue()) {
    if (!p.feat || isOwned(p) || p.feat.progress() < p.feat.target) continue;
    grant(p.id);
    got.push(p);
    if (announce) notify({ kind: 'good', title: 'Feat unlocked: ' + p.name, body: p.feat.label + '. Now in the run pools.', icon: 'star', sound: 'ui_unlock' });
  }
  if (got.length) saveProfile();
  return got;
}

// ---------------------------------------------------------------------------
// Car radio tracks (spec 7.3 soundtrack unlocks): milestone based, never bought.
export interface RadioUnlock { index: number; label: string; done: () => boolean }
export function radioUnlockRules(): RadioUnlock[] {
  const s = () => profile().stats;
  return RADIO_TRACKS.map((t, index) => {
    let label = 'Available', done: () => boolean = () => true;
    if (t.id === 'act2') { label = 'Reach floor 6'; done = () => s().bestFloor >= 6; }
    else if (t.id === 'act3') { label = 'Reach floor 11'; done = () => s().bestFloor >= 11; }
    else if (t.id === 'act4') { label = 'Reach floor 16'; done = () => s().bestFloor >= 16; }
    else if (t.id === 'boss1') { label = 'Reach floor 5'; done = () => s().bestFloor >= 5; }
    else if (t.id === 'boss2') { label = 'Reach floor 10'; done = () => s().bestFloor >= 10; }
    else if (t.id === 'boss3') { label = 'Reach floor 15'; done = () => s().bestFloor >= 15; }
    else if (t.id === 'boss4') { label = 'Reach floor 20'; done = () => s().bestFloor >= 20; }
    else if (t.id === 'ceo_finale') { label = 'Beat the CEO'; done = () => s().wins > 0; }
    return { index, label, done: () => profile().unlocks.includes('radio:' + index) || done() };
  });
}
export function radioUnlocked(index: number): boolean { return radioUnlockRules()[index]?.done() ?? false; }
export function syncRadioUnlocks(): number[] {
  const p = profile();
  const got: number[] = [];
  for (const r of radioUnlockRules()) if (r.done() && !p.unlocks.includes('radio:' + r.index)) { p.unlocks.push('radio:' + r.index); got.push(r.index); }
  return got;
}

void BENEFIT_DEPTS; void saveProfile;
