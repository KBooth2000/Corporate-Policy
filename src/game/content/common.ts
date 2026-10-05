// Shared helpers for the in-run progression content modules (Benefits, Desk Items, rewards, shops, events, challenges).
// Nothing in here registers content except the single FLOOR_HOOKS entry that runs every installer below in order.
import { Entity, Actor, DamageInfo } from '../entity';
import type { GameplayScene } from '../../scenes/gameplay';
import type { GameEvents, StatMod } from '../stats';
import { queryActors } from '../combat';
import { Enemy } from '../enemy';
import { sparks } from '../fx';
import { audio } from '../../audio/audio';
import { FLOOR_HOOKS } from '../registry';
import { STAT_MOD_PROVIDERS, RunState } from '../run';
import type { BenefitDept, PropKind } from '../../data/ids';
import type { PropRT } from '../world';
import type { RoomKind } from '../world-types';
import { PROP_INFO } from '../gen/props';

export type S = GameplayScene;
export type Rar = 0 | 1 | 2;

export const DEPT_NAMES: Record<BenefitDept, string> = {
  it: 'IT Helpdesk', facilities: 'Facilities', sales: 'Sales', marketing: 'Marketing', finance: 'Finance', legal: 'Legal', hr: 'People & Culture', executive: 'Executive Office',
};
export const DEPT_SHORT: Record<BenefitDept, string> = {
  it: 'IT', facilities: 'Facilities', sales: 'Sales', marketing: 'Marketing', finance: 'Finance', legal: 'Legal', hr: 'HR', executive: 'Executive',
};
export const RARITY_LABEL = ['Standard', 'Enhanced', 'Executive'] as const;

/** Format a multiplier as a signed percentage: 1.25 -> "25%". */
export const pct = (m: number): string => `${Math.round(Math.abs(m - 1) * 100)}%`;
/** Format a fraction as a percentage: 0.25 -> "25%". */
export const pf = (f: number): string => `${Math.round(f * 100)}%`;
/** Trim a number for display (no trailing .0). */
export const num = (n: number): string => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------------------
// Per-floor scratch space (cleared by the scene each floor because it lives on s.data)
export interface FloorScratch { [k: string]: any }
export function st(s: S): FloorScratch { return (s.data.cp ??= {}); }

// ---------------------------------------------------------------------------
// Hook tracking: everything a hook registers through these helpers can be torn down again (benefit upgrades mid-floor).
interface Track { offs: (() => void)[]; tickers: Ticker[]; out: unknown[]; inc: unknown[]; sav: unknown[]; }
let active: Track | null = null;

export class Ticker extends Entity {
  constructor(private fn: (dt: number) => void) { super(); this.persist = true; this.layer = 1; }
  update(dt: number): void { this.fn(dt); }
  render(): void { /* invisible */ }
}

export function on<K extends keyof GameEvents>(s: S, type: K, fn: (e: GameEvents[K]) => void): void {
  const off = s.world.bus.on(type, fn as never);
  active?.offs.push(off);
}
export function tick(s: S, fn: (dt: number) => void): Ticker {
  const t = s.world.add(new Ticker(fn));
  active?.tickers.push(t);
  return t;
}
/** Run `fn` every `period` seconds of simulation time (first run after one period). */
export function every(s: S, period: number, fn: () => void): Ticker {
  let acc = 0;
  return tick(s, (dt) => { acc += dt; if (acc >= period) { acc -= period; fn(); } });
}
export function outMod(s: S, fn: (info: DamageInfo, target: Actor) => void): void { s.player.outgoingMods.push(fn); active?.out.push(fn); }
export function inMod(s: S, fn: (info: DamageInfo) => void): void { s.player.incomingMods.push(fn); active?.inc.push(fn); }
export function saver(s: S, fn: () => boolean): void { s.player.deathSavers.push(fn); active?.sav.push(fn); }

/** Run an installer and return a function that undoes everything it registered (temp stat keys must start with `id`). */
export function trackInstall(s: S, id: string, fn: () => void): () => void {
  const tr: Track = { offs: [], tickers: [], out: [], inc: [], sav: [] };
  const prev = active;
  active = tr;
  try { fn(); } finally { active = prev; }
  return () => {
    for (const o of tr.offs) o();
    const p = s.player;
    p.outgoingMods = p.outgoingMods.filter((m) => !tr.out.includes(m));
    p.incomingMods = p.incomingMods.filter((m) => !tr.inc.includes(m));
    p.deathSavers = p.deathSavers.filter((m) => !tr.sav.includes(m));
    for (const t of tr.tickers) t.dead = true;
    let had = false;
    for (const k of [...temp.mods.keys()]) if (k === id || k.startsWith(id + ':')) { temp.mods.delete(k); had = true; }
    if (had) { p.refreshStats(); syncWorldStats(s); }
  };
}

// ---------------------------------------------------------------------------
// Temporary stat modifiers (not persisted: they only live for the current floor).
const temp = { plan: null as unknown, mods: new Map<string, StatMod[]>() };
STAT_MOD_PROVIDERS.push((run: RunState) => (temp.plan === run.plan ? [...temp.mods.values()].flat() : []));

export function beginFloorTemps(s: S): void { temp.plan = s.plan; temp.mods.clear(); }
export type TempMod = Omit<StatMod, 'source'>;
export function setTemp(s: S, key: string, mods: TempMod[] | null): void {
  if (mods && mods.length) temp.mods.set(key, mods.map((m) => ({ ...m, source: key }))); else temp.mods.delete(key);
  s.player.refreshStats();
  syncWorldStats(s);
}

/** Push derived stats into the places that cached them at floor start. */
export function syncWorldStats(s: S): void {
  (s.world as any).breachStunMult = s.player.stats.breachStun;
}

// ---------------------------------------------------------------------------
// Installer registry: one FLOOR_HOOKS entry runs these (in registration order) after resetting temporary mods.
export const floorInstallers: ((s: S) => void)[] = [];
FLOOR_HOOKS.push((s) => {
  beginFloorTemps(s);
  guardPlayerDeath(s);
  for (const f of floorInstallers) {
    try { f(s); } catch (e) { console.error('[content] floor installer failed', e); }
  }
});

/**
 * Core quirk: combat.damage() always calls world.onKilled() after Player.onDeath(), even when a death-saver
 * (Hang In There, Duty of Care) revived the player, which would still end the run. Swallow that kill event here.
 */
function guardPlayerDeath(s: S): void {
  const w = s.world;
  const orig = w.onKill;
  w.onKill = (v, info) => {
    if (v === s.player && !s.player.dying && s.player.hp > 0) return;
    orig?.(v, info);
  };
}

// ---------------------------------------------------------------------------
// World helpers
export function foes(s: S): Enemy[] {
  const out: Enemy[] = [];
  for (const a of s.world.actors) if (a instanceof Enemy && a.alive && !a.grabbedBy) out.push(a);
  return out;
}
export function near(s: S, x: number, y: number, r: number, exclude?: Actor): Actor[] {
  return queryActors(s.world, { kind: 'circle', x, y, r }, 'enemy', exclude);
}
export function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function sortByDist<T extends { x: number; y: number }>(list: T[], from: { x: number; y: number }): T[] {
  return list.sort((a, b) => dist2(a, from) - dist2(b, from));
}

/** Electrical damage + the visual/status flavour that IT Benefits key off (status.electrified). */
export function shock(s: S, target: Actor, dmg: number, stun = 0, dur = 1.6): number {
  if (!target.alive) return 0;
  target.status.electrified = Math.max(target.status.electrified, dur);
  if (stun > 0) target.status.stun = Math.max(target.status.stun, stun);
  sparks(s.world.particles, target.x, target.y - 10, 6, '#9fe8ff');
  let dealt = 0;
  if (dmg > 0) dealt = s.world.damage(target, { amount: dmg, type: 'electric', method: 'other', source: s.player, knockback: 0 });
  return dealt;
}

/** Radial burst: damage + stun + knockback to every enemy in range. */
export function burst(s: S, x: number, y: number, r: number, o: { dmg?: number; stun?: number; knock?: number; electric?: boolean; ring?: string }): number {
  const targets = near(s, x, y, r);
  for (const t of targets) {
    if (o.stun) t.status.stun = Math.max(t.status.stun, o.stun);
    if (o.knock) {
      const a = Math.atan2(t.y - y, t.x - x);
      t.kx += Math.cos(a) * o.knock / Math.max(0.4, t.mass); t.ky += Math.sin(a) * o.knock / Math.max(0.4, t.mass);
    }
    if (o.electric) shock(s, t, o.dmg ?? 0, 0, 1.4);
    else if (o.dmg) s.world.damage(t, { amount: o.dmg, type: 'blunt', method: 'other', source: s.player, knockback: 0 });
  }
  s.world.particles.spawn({ kind: 'ring', x, y: y - 10, life: 0.4, col: o.ring ?? '#ffffff', size: Math.max(20, r * 0.8) });
  return targets.length;
}

export function say(s: S, text: string, col = '#ffe9a0'): void {
  s.world.floatText(s.player.x, s.player.y - 44, text, col);
}

// ---------------------------------------------------------------------------
// Petty Cash: earning, debt and spending (spec 8.2). Everything goes through run.pettyCash / run.log.cashSpent.
export function creditLimit(run: RunState): number {
  let lim = 0;
  if (run.deskItems.includes('company_card')) lim = Math.max(lim, 150);
  const od = run.benefits.find((b) => b.id === 'overdraft');
  if (od) lim = Math.max(lim, [80, 150, 250][od.rarity]);
  return lim;
}
/** Spending power in shops: cash in hand plus whatever credit is left. */
export function spendable(run: RunState): number { return run.pettyCash + Math.max(0, creditLimit(run) - run.debt); }

/** Deduct debt from fresh earnings (Company Credit Card / Overdraft repayments come out of future earnings). */
export function repayDebt(s: S): void {
  const run = s.run;
  if (run.debt <= 0 || run.pettyCash <= 0) return;
  const r = Math.min(run.debt, run.pettyCash);
  run.debt -= r; run.pettyCash -= r;
  s.world.floatText(s.player.x, s.player.y - 52, `DEBT -£${r}`, '#ff9a8a');
}

export function earn(s: S, amount: number, o: { noMult?: boolean; quiet?: boolean } = {}): number {
  const amt = Math.max(0, Math.round(amount * (o.noMult ? 1 : s.player.stats.cashMult)));
  if (amt <= 0) return 0;
  s.run.pettyCash += amt;
  s.run.log.cashEarned += amt;
  if (!o.quiet) s.world.floatText(s.player.x, s.player.y - 36, `+£${amt}`, '#ffd34d');
  repayDebt(s);
  return amt;
}

/** Pay `price`: cash first, then credit. Returns false (and changes nothing) when it cannot be afforded. */
export function spend(s: S, price: number, kind: string): boolean {
  const run = s.run;
  if (price > spendable(run)) return false;
  const fromCash = Math.min(run.pettyCash, price);
  run.pettyCash -= fromCash;
  run.debt += price - fromCash;
  run.log.cashSpent += price;
  s.world.bus.emit('shopBuy', { kind, price });
  return true;
}

export function heldRarity(run: RunState, id: string): Rar | -1 { const b = run.benefits.find((x) => x.id === id); return b ? b.rarity : -1; }
export function hasDesk(run: RunState, id: string): boolean { return run.deskItems.includes(id); }

/** A combat room is one that was populated with enemies (empty rooms do not count for clear rewards). */
export function isCombatRoom(s: S, roomId: number): boolean { return (s.world.rooms[roomId]?.enemies.size ?? 0) > 0; }

/** Fire `fn` once per room the first time the player steps inside (works on alarm floors, which never seal rooms). */
export function onRoomEnter(s: S, fn: (roomId: number) => void): void {
  // rooms already entered when this installs (mid-floor pick-ups) must not fire retroactively
  const seen = new Set<number>();
  s.world.rooms.forEach((r, i) => { if (r.entered) seen.add(i); });
  tick(s, () => {
    s.world.rooms.forEach((r, i) => {
      if (r.entered && !seen.has(i)) { seen.add(i); fn(i); }
    });
  });
}

export function enemiesInRoom(s: S, roomId: number): Enemy[] {
  return foes(s).filter((e) => s.world.roomAt(e.x, e.y) === roomId || e.roomId === roomId);
}

/** Per-floor disposer table for installed Benefits / Desk Items (so an upgrade can swap its hooks mid-floor). */
export function disposers(s: S): Record<string, () => void> { return (s.data.cpDispose ??= {}); }

/** Randomly refund melee durability so the weapon lasts `mult` times as long (Deep-Clean Rota, Post-it Notes). */
export function refundDurability(s: S, mult: number): void {
  let lastW: unknown = null, lastDur = 0;
  tick(s, () => {
    const w = s.run.loadout.melee;
    if (w && w === lastW && w.dur < lastDur && w.maxDur > 0 && s.world.rng.combat.chance(1 - 1 / mult)) w.dur = Math.min(w.maxDur, lastDur);
    lastW = w; lastDur = w ? w.dur : 0;
  });
}

// ---------------------------------------------------------------------------
// Room centrepieces (canteen counter, fortune copier, stationery cupboard)
export interface Centrepiece { x: number; y: number; roomId: number; prop: PropRT; placed: boolean; }

/**
 * Find the floor's centrepiece prop of one of `kinds`; if the generator did not place one, add it ourselves in the
 * room of kind `roomKind` (or the first non-core room) so the floor is always playable.
 */
export function findCentrepiece(s: S, kinds: PropKind[], roomKind: RoomKind): Centrepiece {
  const w = s.world;
  const found = w.props.filter((p) => !p.gone && kinds.includes(p.def.kind));
  if (found.length) {
    // prefer one in the matching room, then the first
    const p = found.find((q) => w.map.rooms[q.def.roomId]?.kind === roomKind) ?? found[0];
    return { x: p.def.x, y: p.def.y, roomId: p.def.roomId, prop: p, placed: false };
  }
  const room = w.map.rooms.find((r) => r.kind === roomKind) ?? w.map.rooms.find((r) => r.kind !== 'core') ?? w.map.rooms[0];
  const kind = kinds[0];
  const info = PROP_INFO[kind];
  const x = Math.round(room.rewardPoint.x), y = Math.round(room.rewardPoint.y);
  const prop = w.addProp({ id: 100000 + w.props.length, kind, x, y, w: info.fw * 16, h: Math.max(16, info.fh * 16), solid: false, variant: 0, roomId: room.id, facing: 0, hazard: false });
  return { x, y, roomId: room.id, prop, placed: true };
}
