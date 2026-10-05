// Promotion system (spec 5.6). Both modes live behind src/game/flags.ts PROMOTION_MODE:
//
//  'light' (SHIPPING DEFAULT — the spec's legal-gate fallback): the enemy that killed the player (GameplayScene.killer:
//    the killing blow, or the nearest enemy that damaged them in the last 5 s) is saved, and returns ONCE in a later
//    normal run (in its archetype's act) as "Promoted: Associate <name>" with a one-tier stat bump. No memory, no
//    strengths or weaknesses. It leaves the roster the moment it is re-inserted.
//
//  'full' (implemented, disabled until the patent freedom-to-operate opinion clears it): ranks Associate → Manager →
//    Senior Manager → Director, a stat tier per rank, a strength derived from how they killed you, one random
//    (mechanical) weakness, memory of every kill (floor/weapon/method/count) used in barks, max 10 active, HR filing
//    cabinets reveal a weakness, 1–3 inserted per normal run in the act matching their rank (Promotion Season adds
//    more), a "Company Announcement" intro card, Directors in their own arena room as mini-bosses, Terminated on kill
//    (large reward + anchor-item trophy), execution bonus. `directorAvailable()` / `pickDirector()` serve the optional
//    Director bosses (spec 6.6).
//
//  Exclusions (both modes): daily runs, seed-entered runs, boss floors.
import { PROMOTION_MODE } from './flags';
import { RUN_START_HOOKS, RUN_END_HOOKS, FLOOR_HOOKS } from './registry';
import { profile, saveProfile, PromotedRecord } from './profile';
import { Enemy } from './enemy';
import type { DamageInfo } from './entity';
import type { GameplayScene } from '../scenes/gameplay';
import type { RunState } from './run';
import { PROMOTED_BARKS } from '../data/text/barks';
import { PROMOTION_ANNOUNCEMENTS, TERMINATION_NOTICES } from '../data/text/announcements';
import { PROMOTION_RANKS } from '../data/ids';
import type { ArchetypeId, Tier, Act } from '../data/ids';
import { ARCHETYPE_DEFS, ACTS, actOfFloor } from '../data/tables';
import { tierFor } from './spawner';
import { notify } from '../ui/corpos';
import { icon } from '../art/items';
import { Rng, hashCombine, fxRng } from '../core/rng';
import { dropCash, Pickup } from './pickups';
import { WEAPONS as WEAPON_DEFS } from '../data/tables';
import { audio } from '../audio/audio';
import { app } from '../core/app';
import { drawText } from '../render/font';
import { debrisBurst, sparks } from './fx';
import { INCOMING_HOOKS, THINK_HOOKS, DEATH_HOOKS, RENDER_HOOKS, rebase, callout, ring, windowNear } from './enemies/common';
import { insertPromoted, pickPromotedRoom } from './enemies/spawning';

export type PromotionMode = 'light' | 'full';
/** Active mode. Dev builds may override via `window.__cpPromotionMode = 'full'` for QA; shipping uses the flag. */
export function promotionMode(): PromotionMode {
  const o = import.meta.env.DEV ? (globalThis as any).__cpPromotionMode : undefined;
  return o === 'full' || o === 'light' ? o : PROMOTION_MODE;
}

export const MAX_PROMOTED = 10;
export const rankName = (rank: number): string => PROMOTION_RANKS[Math.max(0, Math.min(3, rank - 1))];

// ---------------------------------------------------------------------------------------------------------------
// Traits (full mode). Stored on the record by display name (other modules print `rec.weakness` directly).
export interface TraitDef { id: string; name: string; desc: string; }
export const STRENGTHS: Record<string, TraitDef> = {
  ballistic: { id: 'ballistic', name: 'Ballistic', desc: 'Thrown and ranged attacks deal +35% damage.' },
  sharpshooter: { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Ranged attacks deal +35% damage and come 25% more often.' },
  calm: { id: 'calm', name: 'Calm Under Pressure', desc: 'Takes 50% less damage while you are in Rage.' },
  bruiser: { id: 'bruiser', name: 'Bruiser', desc: 'Melee hits deal +30% damage with +50% knockback; +20% HP.' },
  hs_officer: { id: 'hs_officer', name: 'Health & Safety Officer', desc: 'Immune to hazards, wet floors and electrocution.' },
  paper_cuts: { id: 'paper_cuts', name: 'Paper Cuts', desc: 'Every hit has a high chance to make you bleed.' },
  networker: { id: 'networker', name: 'Networker', desc: 'Moves 20% faster and alerts the whole room.' },
};
export const WEAKNESSES: Record<string, TraitDef> = {
  fear_of_heights: { id: 'fear_of_heights', name: 'Fear of Heights', desc: 'Below 60% HP they freeze near windows (grabbable): defenestration triggers at much higher HP.' },
  paper_allergy: { id: 'paper_allergy', name: 'Paper Allergy', desc: 'Sneezes helplessly near printers and photocopiers; photocopier executions are instant.' },
  technophobe: { id: 'technophobe', name: 'Technophobe', desc: 'Takes triple electric damage.' },
  fragile_ego: { id: 'fragile_ego', name: 'Fragile Ego', desc: 'Every heavy hit staggers them (grab window).' },
  impostor: { id: 'impostor', name: 'Impostor Syndrome', desc: 'Takes +60% damage from behind.' },
  decaf: { id: 'decaf', name: 'Decaf', desc: 'Any thrown object slows them by 50% for 4 s.' },
  butterfingers: { id: 'butterfingers', name: 'Butterfingers', desc: 'A heavy hit knocks their weapon away (-25% damage).' },
};
const byName = (table: Record<string, TraitDef>, name: string): TraitDef | undefined => Object.values(table).find((t) => t.name === name || t.id === name);
const hasStrength = (r: PromotedRecord, id: string): boolean => r.strengths.some((n) => byName(STRENGTHS, n)?.id === id);
const weaknessId = (r: PromotedRecord): string => byName(WEAKNESSES, r.weakness)?.id ?? '';

export function strengthFor(method: string, weaponId: string, raging: boolean): TraitDef {
  if (raging) return STRENGTHS.calm;
  const thrown = !!weaponId && (WEAPON_DEFS as any)[weaponId]?.cls === 'throwable';
  if (method === 'throw' || method === 'body' || thrown) return STRENGTHS.ballistic;
  if (method === 'ranged') return STRENGTHS.sharpshooter;
  if (method === 'melee' || method === 'heavy') return STRENGTHS.bruiser;
  if (method === 'hazard' || method === 'fall') return STRENGTHS.hs_officer;
  if (method === 'bleed') return STRENGTHS.paper_cuts;
  return STRENGTHS.networker;
}

const METHOD_TEXT: Record<string, string> = {
  melee: 'close-quarters feedback', heavy: 'heavy-handed management', ranged: 'long-distance communication', throw: 'delegation by projectile',
  body: 'team building', hazard: 'a health & safety violation', bleed: 'death by a thousand paper cuts', execution: 'restructuring',
  fall: 'a vertical career move', rage: 'conflict resolution', breach: 'open-plan redesign', other: 'office politics',
};
function weaponText(id: string): string {
  if (!id) return 'bare hands';
  const d = (WEAPON_DEFS as any)[id];
  if (d?.name) return String(d.name).toLowerCase();
  return id.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------------------------------------------
// Exclusions
export function promotionExcluded(run: RunState): boolean { return !!run.daily || !!run.seeded; }

function roster(): PromotedRecord[] { return profile().promoted.filter((r) => !r.terminated); }

function capRoster(): void {
  const p = profile();
  p.promoted = p.promoted.filter((r) => !r.terminated);
  if (p.promoted.length > MAX_PROMOTED) {
    // drop the oldest non-Directors first
    p.promoted.sort((a, b) => (a.rank >= 4 ? 1 : 0) - (b.rank >= 4 ? 1 : 0) || a.createdAt - b.createdAt);
    p.promoted = p.promoted.slice(p.promoted.length - MAX_PROMOTED);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Run end: promote the killer (spec 5.6 triggers)
export function promoteKiller(s: GameplayScene): PromotedRecord | null {
  const run = s.run;
  if (promotionExcluded(run) || s.plan.floor_type === 'boss') return null;
  const k = s.killer;
  if (!(k instanceof Enemy) || k.isBoss) return null;
  const mode = promotionMode();
  const prof = profile();
  const method = s.killMethod || 'other';
  const weapon = s.killWeapon || '';
  const raging = (s.player as any)?.raging > 0;
  const prev = k.promoted as PromotedRecord | null;
  let rec: PromotedRecord | undefined = prev ? prof.promoted.find((r) => r.id === prev.id && !r.terminated) : undefined;
  const kill = { floor: s.plan.floor_number, weapon, method, at: Date.now() };
  if (mode === 'full' && rec) {
    // already promoted: promoted again (spec 5.6)
    rec.rank = Math.min(4, rec.rank + 1);
    const st = strengthFor(method, weapon, raging);
    if (!rec.strengths.includes(st.name)) rec.strengths.push(st.name);
    rec.kills.push(kill);
    (rec.look as any).promotedRank = rec.rank;
  } else {
    const rng = new Rng(hashCombine(run.seed, k.id, Date.now() & 0xffff));
    const baseName = String(k.flags.baseName ?? k.flags.origName ?? k.name);
    const look = JSON.parse(JSON.stringify(k.look));
    look.promotedRank = 1;
    delete look.reonboarded;
    rec = {
      id: `p${Date.now().toString(36)}${rng.nextU32().toString(36).slice(0, 4)}`,
      name: baseName,
      title: k.title,
      archetype: k.archetype,
      rank: 1,
      look,
      strengths: mode === 'full' ? [strengthFor(method, weapon, raging).name] : [],
      weakness: mode === 'full' ? rng.pick(Object.values(WEAKNESSES)).name : '',
      weaknessKnown: false,
      kills: mode === 'full' ? [kill] : [],
      createdAt: Date.now(),
    };
    prof.promoted.push(rec);
  }
  capRoster();
  // for the run summary (src/scenes/summary.ts reads these)
  run.flags.promotedName = rec.name;
  run.flags.promotedTitle = rec.title;
  run.flags.promotedRank = rec.rank;
  saveProfile();
  return rec;
}

RUN_END_HOOKS.push((s, won) => { if (!won) promoteKiller(s); });

// ---------------------------------------------------------------------------------------------------------------
// Run start: plan which promoted staff return this run, and on which floor
interface PlanEntry { id: string; floor: number; spawned?: boolean; }
function getPlan(run: RunState): PlanEntry[] {
  try { return JSON.parse(String(run.flags.promoPlan ?? '[]')) as PlanEntry[]; } catch { return []; }
}
function setPlan(run: RunState, p: PlanEntry[]): void { run.flags.promoPlan = JSON.stringify(p); }

export function targetAct(r: PromotedRecord, mode: PromotionMode): Act {
  if (mode === 'full') return Math.max(1, Math.min(4, r.rank)) as Act;             // the act matching their rank
  return (ARCHETYPE_DEFS[r.archetype as ArchetypeId]?.act ?? 1) as Act;            // light: their own act
}

export function planRun(run: RunState): PlanEntry[] {
  if (promotionExcluded(run)) { setPlan(run, []); return []; }
  const mode = promotionMode();
  const rng = new Rng(hashCombine(run.seed, 'promotion'));
  const list = rng.shuffle(roster().filter((r) => mode === 'full' || r.rank <= 1));
  let n: number;
  if (mode === 'full') n = rng.int(1, 3) + Math.min(2, run.modifiers.promotion_season ?? 0); // Promotion Season: more per run
  else n = list.length >= 4 ? 2 : 1;
  const plan: PlanEntry[] = [];
  for (const r of list) {
    if (plan.length >= n) break;
    const act = targetAct(r, mode);
    const a = ACTS[act - 1];
    const floors: number[] = [];
    for (let f = Math.max(a.firstFloor, run.floor); f < a.lastFloor; f++) floors.push(f); // never the boss floor
    if (!floors.length) continue;
    plan.push({ id: r.id, floor: rng.pick(floors) });
  }
  setPlan(run, plan);
  return plan;
}

RUN_START_HOOKS.push((s) => { if (s.run.flags.promoPlan === undefined) planRun(s.run); }); // resumed runs keep their plan

// ---------------------------------------------------------------------------------------------------------------
// Floor: insertion, intel cabinets, strength/weakness wiring
let scene: GameplayScene | null = null;

export function spawnPromoted(s: GameplayScene, rec: PromotedRecord, rng: Rng, avoid: Set<number> = new Set()): Enemy | null {
  const mode = promotionMode();
  const arch = ARCHETYPE_DEFS[rec.archetype as ArchetypeId];
  if (!arch) return null;
  const director = mode === 'full' && rec.rank >= 4;
  const room = pickPromotedRoom(s, director, rng, avoid);
  if (!room) return null;
  const tier = Math.min(2, tierFor(arch, s.plan.act) + 1) as Tier; // stat tier increase
  const look = JSON.parse(JSON.stringify(rec.look));
  look.promotedRank = mode === 'full' ? rec.rank : 1;
  look.tier = Math.max(look.tier ?? 0, tier);
  const shown = mode === 'full' ? rec.rank : 1;
  const e = insertPromoted(s, { archetype: arch.id, tier, room, arena: director, rng, extra: { look, name: `${rankName(shown)} ${rec.name}`, title: rec.title } });
  if (!e) return null;
  applyPromotion(e, rec, mode, s.plan.act);
  if (!s.run.promotedIds.includes(rec.id)) s.run.promotedIds.push(rec.id);
  if (mode === 'light') {
    // light: returns ONCE — leave the roster now
    const p = profile();
    p.promoted = p.promoted.filter((r) => r.id !== rec.id);
    saveProfile();
  }
  return e;
}

/** Stats + traits for a freshly spawned promoted enemy. */
export function applyPromotion(e: Enemy, rec: PromotedRecord, mode: PromotionMode, act: number): void {
  e.promoted = rec;
  e.flags.baseName = rec.name;
  e.flags.promoMode = mode;
  const rank = mode === 'full' ? rec.rank : 1;
  // later-act archetypes returning early are normalised so an Associate Culture Champion is not a wall in Act 1
  const archAct = ARCHETYPE_DEFS[e.archetype].act;
  const norm = Math.pow(0.72, Math.max(0, archAct - act));
  let hpMult = (1 + 0.25 * rank) * norm;
  let dmgMult = (1 + 0.08 * rank) * (0.85 + 0.15 * norm);
  let spdMult = 1;
  if (mode === 'full') {
    if (hasStrength(rec, 'bruiser')) hpMult *= 1.2;
    if (hasStrength(rec, 'networker')) spdMult *= 1.2;
  }
  e.maxHp = Math.round(e.maxHp * hpMult); e.hp = e.maxHp;
  e.staggerMax *= 1 + 0.15 * rank;
  e.cashDrop = Math.round(e.cashDrop * 2);
  rebase(e, spdMult, dmgMult);
  if (mode === 'full' && rank >= 4) {
    // Director: arena mini-boss
    e.flags.director = true;
    e.mass *= 1.4; e.staggerMax *= 1.5;
    e.maxShield = Math.round(e.maxHp * 0.25); e.shield = e.maxShield;
  }
  if (mode === 'full' && weaknessId(rec) === 'fragile_ego') e.staggerMax *= 0.5;
  e.flags.memCd = 6;
}

function memoryLine(e: Enemy): string | null {
  const r = e.promoted as PromotedRecord;
  if (!r || !r.kills.length) return null;
  const k = r.kills[r.kills.length - 1];
  const line = e.rng.pick(PROMOTED_BARKS);
  return line.replace(/\{floor\}/g, String(k.floor)).replace(/\{weapon\}/g, weaponText(k.weapon)).replace(/\{method\}/g, METHOD_TEXT[k.method] ?? k.method)
    .replace(/\{title\}/g, rankName(r.rank)).replace(/\{name\}/g, r.name).replace(/\{count\}/g, String(r.kills.length));
}

function announcementText(rec: PromotedRecord, mode: PromotionMode): string {
  const rank = rankName(mode === 'full' ? rec.rank : 1);
  const k = rec.kills[rec.kills.length - 1];
  const rankWords = /Manager|Director|VP|Principal|Senior/;
  const pool = PROMOTION_ANNOUNCEMENTS.filter((l) => !rankWords.test(l) && (k || !/\{method\}|\{floor\}/.test(l)));
  const rng = new Rng(hashCombine(rec.createdAt, rec.rank));
  const line = pool.length ? rng.pick(pool) : '{name} has been promoted to {title}. Please make them feel welcome.';
  return line.replace(/\{name\}/g, rec.name).replace(/\{title\}/g, rank).replace(/\{method\}/g, k ? METHOD_TEXT[k.method] ?? k.method : 'excellence')
    .replace(/\{floor\}/g, k ? String(k.floor) : '?');
}

function announce(s: GameplayScene, e: Enemy): void {
  const rec = e.promoted as PromotedRecord;
  const mode = (e.flags.promoMode as PromotionMode) ?? promotionMode();
  const rank = rankName(mode === 'full' ? rec.rank : 1);
  notify({ kind: 'boss', title: 'Company Announcement', body: announcementText(rec, mode), icon: icon('promotion'), duration: 6 });
  s.hud.showBanner(`PROMOTED: ${rank.toUpperCase()} ${rec.name.toUpperCase()}`, `${rec.title} · ${ARCHETYPE_DEFS[e.archetype].name}`, '#ffd34d', 3.6);
  audio.sfx('stinger_promotion');
  ring(e.world, e.x, e.y - 14, 26, '#ffd34d', 0.7);
  if (e.flags.director) s.hud.bossBar = { name: `${rank} ${rec.name}`, title: rec.title, hp: e.hp, maxHp: e.maxHp, phase: 1, markers: [], shield: e.shield };
}

// ---------------------------------------------------------------------------------------------------------------
// Resolution: Terminated (spec 5.6)
export function terminate(rec: PromotedRecord, executed: boolean): void {
  const p = profile();
  const mode = promotionMode();
  rec.terminated = true;
  p.promoted = p.promoted.filter((r) => r.id !== rec.id);
  p.stats.promotedTerminated++;
  if (mode === 'full') {
    const anchor = ARCHETYPE_DEFS[rec.archetype as ArchetypeId]?.anchor ?? 'Lanyard';
    p.trophies.push({ id: rec.id, name: `${rankName(rec.rank)} ${rec.name}${executed ? ' (executed)' : ''}`, item: anchor, at: Date.now() });
  }
  saveProfile();
}

function onPromotedDeath(e: Enemy, info: DamageInfo): void {
  const rec = e.promoted as PromotedRecord | null;
  if (!rec || e.flags.terminatedDone) return;
  e.flags.terminatedDone = true;
  const s = scene;
  const w = e.world;
  const mode = (e.flags.promoMode as PromotionMode) ?? promotionMode();
  const executed = info.method === 'execution' || e.executed;
  const rank = mode === 'full' ? rec.rank : 1;
  const cash = Math.round((mode === 'full' ? 60 + 30 * rank : 40) * (executed ? 1.5 : 1));
  dropCash(w, e.x, e.y, cash);
  if (mode === 'full') w.add(new Pickup({ kind: 'heal', amount: 20 + 5 * rank, x: e.x + 6, y: e.y }));
  if (executed) { (w.player as any).addRage?.(30); (w.player as any).heal?.(10); }
  if (s) { s.run.log.promotedTerminated++; if (e.flags.director) s.hud.bossBar = null; }
  terminate(rec, executed);
  const tline = new Rng(hashCombine(rec.createdAt, 7)).pick(TERMINATION_NOTICES).replace(/\{name\}/g, rec.name).replace(/\{title\}/g, rankName(rank));
  notify({ kind: 'good', title: executed ? 'Terminated (with prejudice)' : 'Terminated', body: tline + (executed ? ' Severance withheld: bonus paid to you.' : ''), duration: 5 });
  // the termination "card": stamp + hit-stop + shake
  callout(w, executed ? 'TERMINATED WITH PREJUDICE' : 'TERMINATED', '#ff5a4a', { x: e.x, y: e.y - 40 }, 2);
  ring(w, e.x, e.y - 12, 34, '#ff5a4a', 0.7);
  w.hitstop = Math.max(w.hitstop, executed ? 0.2 : 0.12);
  app.renderer.shake(executed ? 6 : 4, 0.3);
  audio.sfx('stinger_announcement');
}

// ---------------------------------------------------------------------------------------------------------------
// Hooks into the shared enemy AI (src/game/enemies/common.ts)
DEATH_HOOKS.push((e, info) => { if (e.promoted) onPromotedDeath(e, info); });

INCOMING_HOOKS.push((e, info, amt) => {
  const r = e.promoted as PromotedRecord | null;
  if (!r || e.flags.promoMode !== 'full' || amt <= 0) return amt;
  const p = e.world.player as any;
  if (hasStrength(r, 'calm') && p?.raging > 0) amt *= 0.5;
  if (hasStrength(r, 'hs_officer') && (info.method === 'hazard' || info.type === 'electric')) return 0;
  switch (weaknessId(r)) {
    case 'technophobe': if (info.type === 'electric') amt *= 3; break;
    case 'impostor': if (info.source) { const a = Math.atan2(info.source.y - e.y, info.source.x - e.x); const d = Math.abs(((a - e.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d > 2.0) { amt *= 1.6; e.world.floatText(e.x, e.y - e.height - 8, 'IMPOSTOR!', '#9fe0ff'); } } break;
    case 'fragile_ego': if (info.method === 'heavy') { e.staggered = Math.max(e.staggered, 1.2); } break;
    case 'decaf': if (info.method === 'throw') { e.status.slow = Math.max(e.status.slow, 4); e.status.slowAmt = Math.max(e.status.slowAmt, 0.5); } break;
    case 'butterfingers':
      if (info.method === 'heavy' && e.weapon) {
        e.world.add(new Pickup({ kind: 'weapon', weapon: e.weapon, x: e.x, y: e.y, vx: fxRng.range(-60, 60), vy: fxRng.range(-30, 30) }));
        e.weapon = null; rebase(e, 1, 0.75);
        callout(e.world, 'DROPPED IT', '#9fe0ff', e, 1);
      }
      break;
  }
  return amt;
});

THINK_HOOKS.push((e, dt) => {
  const r = e.promoted as PromotedRecord | null;
  if (!r) return;
  const s = scene;
  if (!e.flags.announced && s) { e.flags.announced = true; announce(s, e); }
  if (e.flags.director && s?.hud.bossBar) { s.hud.bossBar.hp = e.hp; s.hud.bossBar.maxHp = e.maxHp; s.hud.bossBar.shield = e.shield; }
  if (e.flags.promoMode !== 'full') return;
  // memory barks (spec 5.6)
  e.flags.memCd -= dt;
  if (e.flags.memCd <= 0) { e.flags.memCd = e.rng.range(9, 14); const l = memoryLine(e); if (l) e.bark('taunt', l); }
  if (hasStrength(r, 'hs_officer')) { e.status.wet = 0; e.status.electrified = 0; }
  if (hasStrength(r, 'sharpshooter') && e.arch.role === 'ranged') e.attackCd = Math.max(0, e.attackCd - dt * 0.25);
  if (hasStrength(r, 'networker') && !e.flags.networked) { e.flags.networked = true; for (const a of e.world.actors) if (a instanceof Enemy && a.roomId === e.roomId) a.alert(); }
  const p = e.world.player as any;
  switch (weaknessId(r)) {
    case 'fear_of_heights':
      e.flags.vertigoCd = (e.flags.vertigoCd ?? 0) - dt;
      if (e.hpFrac < 0.6 && e.flags.vertigoCd <= 0 && windowNear(e.world, e.x, e.y, 56) && Math.hypot(p.x - e.x, p.y - e.y) < 70) {
        e.flags.vertigoCd = 2.2; e.status.stun = Math.max(e.status.stun, 0.6);
        callout(e.world, 'VERTIGO', '#9fe0ff', e, 0.8);
      }
      break;
    case 'paper_allergy': {
      e.flags.sneezeCd = (e.flags.sneezeCd ?? 0) - dt;
      if (e.flags.sneezeCd <= 0 && e.world.propsNear(e.x, e.y, 34, (q) => q.def.kind === 'photocopier' || q.def.kind === 'printer').length) {
        e.flags.sneezeCd = 3; e.status.stun = Math.max(e.status.stun, 0.6);
        callout(e.world, 'ACHOO!', '#ffffff', e, 0.8);
        sparks(e.world.particles, e.x, e.y - e.height + 4, 6, '#f4f1e8', 60);
      }
      break;
    }
  }
});

RENDER_HOOKS.push((e, g) => {
  const r = e.promoted as PromotedRecord | null;
  if (!r || e.corpse || e.dying) return;
  const full = e.flags.promoMode === 'full';
  const rank = full ? r.rank : 1;
  const top = Math.round(e.y - e.height - 6) - 10;
  drawText(g, rankName(rank).toUpperCase(), e.x, top, { align: 'center', color: '#ffd34d', outline: '#1a1200' });
  // rank chevrons
  for (let i = 0; i < rank; i++) { const x = Math.round(e.x) - rank * 2 + i * 4; g.fillStyle = '#1a1200'; g.fillRect(x - 1, top - 5, 4, 3); g.fillStyle = '#ffd34d'; g.fillRect(x, top - 4, 2, 1); }
  if (full && r.weaknessKnown && r.weakness) drawText(g, `WEAK: ${r.weakness}`, e.x, Math.round(e.y) + 4, { align: 'center', color: '#9fe0ff', outline: '#0b0c10' });
});

// ---------------------------------------------------------------------------------------------------------------
// Intel: HR filing cabinets reveal one weakness (full mode)
export function revealWeakness(s: GameplayScene | null, prefer?: string[]): PromotedRecord | null {
  const all = roster().filter((r) => r.weakness && !r.weaknessKnown);
  const rec = all.find((r) => prefer?.includes(r.id)) ?? all[0];
  if (!rec) return null;
  rec.weaknessKnown = true;
  if (s && !s.run.intel.includes(rec.id)) s.run.intel.push(rec.id);
  saveProfile();
  const def = byName(WEAKNESSES, rec.weakness);
  notify({ kind: 'info', title: `HR file: ${rankName(rec.rank)} ${rec.name}`, body: `${rec.title}. Weakness: ${rec.weakness}. ${def?.desc ?? ''}`, icon: 'doc', duration: 7 });
  // live copies on this floor show it immediately
  if (s) for (const a of s.world.actors) if (a instanceof Enemy && (a.promoted as PromotedRecord | null)?.id === rec.id) (a.promoted as PromotedRecord).weaknessKnown = true;
  return rec;
}

function setupCabinets(s: GameplayScene): void {
  const w = s.world;
  for (const p of w.props) {
    if (p.def.kind !== 'hr_cabinet' || p.gone || p.data.hrIntel) continue;
    p.data.hrIntel = true;
    const it = {
      x: p.def.x, y: p.def.y + 6, r: 22, priority: 1, label: 'Search HR files', sub: 'Personnel records',
      enabled: () => !p.used && roster().some((r) => r.weakness && !r.weaknessKnown),
      onInteract: () => {
        p.used = true;
        audio.sfx('paper_rustle', { x: p.def.x, y: p.def.y });
        debrisBurst(w.particles, p.def.x, p.def.y - 10, 8, ['#f4f1e8', '#dcd6c8'], w.roomAt(p.def.x, p.def.y), 'paper');
        w.add(new Pickup({ kind: 'intel', x: p.def.x, y: p.def.y + 8, vy: 40, reward: { kind: 'intel', label: 'HR file', grant: () => { revealWeakness(s, s.run.promotedIds); } } }));
      },
    };
    w.interactables.push(it);
  }
}

// ---------------------------------------------------------------------------------------------------------------
FLOOR_HOOKS.push((s) => {
  scene = s;
  const run = s.run;
  if (promotionExcluded(run)) return;
  const mode = promotionMode();
  const w = s.world;
  if (mode === 'full') {
    setupCabinets(s);
    // outgoing strengths of promoted enemies modify the damage the player takes
    s.player.incomingMods.push((info) => {
      const src = info.source as Enemy | null | undefined;
      const r = src && (src as any).promoted as PromotedRecord | null;
      if (!r || (src as Enemy).flags.promoMode !== 'full') return;
      const thrown = !!info.weaponId && (WEAPON_DEFS as any)[info.weaponId]?.cls === 'throwable';
      if (hasStrength(r, 'ballistic') && (info.method === 'throw' || thrown || info.method === 'ranged')) info.amount *= 1.35;
      else if (hasStrength(r, 'sharpshooter') && info.method === 'ranged') info.amount *= 1.35;
      if (hasStrength(r, 'bruiser') && (info.method === 'melee' || info.method === 'heavy')) { info.amount *= 1.3; if (info.knockback) info.knockback *= 1.5; }
      if (hasStrength(r, 'paper_cuts')) info.bleed = Math.max(info.bleed ?? 0, 0.6);
    });
    // Paper Allergy: grabbing them next to a photocopier is an instant execution
    w.bus.on('grab', ({ victim }) => {
      const v = victim as Enemy;
      const r = v.promoted as PromotedRecord | null;
      if (!r || v.flags.promoMode !== 'full' || weaknessId(r) !== 'paper_allergy') return;
      const cop = w.propsNear(v.x, v.y, 40, (q) => q.def.kind === 'photocopier' && !q.used)[0];
      if (!cop) return;
      const pl = s.player as any;
      pl.grabbing = null; v.grabbedBy = null;
      v.executed = true;
      cop.used = true;
      debrisBurst(w.particles, v.x, v.y - 10, 16, ['#f4f1e8', '#dcd6c8', '#bcd4e6'], w.roomAt(v.x, v.y), 'paper');
      audio.sfx('photocopier', { x: v.x, y: v.y });
      callout(w, 'ALLERGIC REACTION', '#ffffff', { x: v.x, y: v.y - 30 }, 1.4);
      w.damage(v, { amount: 99999, type: 'crush', method: 'execution', source: pl, unavoidable: true, hazardKind: 'photocopier' });
      w.bus.emit('execution', { type: 'photocopier', victim: v });
    });
  }
  // insertion: normal combat floors only, never boss floors (or lift ambushes / wings)
  const t = s.plan.floor_type;
  if ((t !== 'standard' && t !== 'elite') || s.plan.wing !== 0) return;
  const plan = getPlan(run);
  if (!plan.length) return;
  const rng = s.floorRng.spawns.fork('promoted');
  const used = new Set<number>();
  let n = 0;
  for (const entry of plan) {
    if (entry.spawned || entry.floor > s.plan.floor_number || actOfFloor(entry.floor) !== s.plan.act || n >= 2) continue;
    const rec = roster().find((r) => r.id === entry.id);
    if (!rec) { entry.spawned = true; continue; }
    const e = spawnPromoted(s, rec, rng, used);
    if (!e) continue;
    entry.spawned = true; n++;
    used.add(e.roomId);
  }
  setPlan(run, plan);
});

// ---------------------------------------------------------------------------------------------------------------
// Optional Director bosses (spec 6.6) — for the boss team
/** True when the full system is on (not excluded) and at least one Director-rank promoted enemy exists. */
export function directorAvailable(run?: RunState): boolean {
  if (promotionMode() !== 'full') return false;
  if (run && promotionExcluded(run)) return false;
  return roster().some((r) => r.rank >= 4);
}
/** Pick the Director to face (most kills first). Returns null when none. Call `terminate(rec, executed)` on defeat. */
export function pickDirector(): PromotedRecord | null {
  if (promotionMode() !== 'full') return null;
  const d = roster().filter((r) => r.rank >= 4).sort((a, b) => b.kills.length - a.kills.length);
  return d[0] ?? null;
}
/** Memory bark for any promoted record (Director boss intros/phase lines). */
export function memoryBarkFor(rec: PromotedRecord, rng: Rng): string {
  const k = rec.kills[rec.kills.length - 1];
  const line = rng.pick(PROMOTED_BARKS);
  return line.replace(/\{floor\}/g, k ? String(k.floor) : '?').replace(/\{weapon\}/g, weaponText(k?.weapon ?? '')).replace(/\{method\}/g, k ? METHOD_TEXT[k.method] ?? k.method : 'excellence')
    .replace(/\{title\}/g, rankName(rec.rank)).replace(/\{name\}/g, rec.name).replace(/\{count\}/g, String(Math.max(1, rec.kills.length)));
}
