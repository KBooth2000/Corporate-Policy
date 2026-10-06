// Meta-progression (spec 7.3, 7.4, 8.2, 8.4): runs hooks that turn a finished run into Annual Leave, lifetime stats,
// role unlocks, feats, achievements, Performance Review unlock and KPI cosmetics. Registers itself on import.
//
// ANNUAL LEAVE FORMULA (days, 100% kept on death):
//   floors      1 x highest floor reached
//   bosses      5 x bosses beaten            (run.flags.bossLeave if the content module supplies it)
//   terminated  10 x promoted enemies terminated this run
//   discoveries first-time bonuses: +2 per new execution type, +5 per new boss, +3 per new act reached, +10 first win,
//               +5 first win per role, +5 first Termination
//   expense     unspent Petty Cash / 10     (run.flags.expenseLeave if the content module supplies it)
//   found       run.flags.bonusLeave        (events / pickups, content module)
//   desk item   Annual Leave Request Form: +25% of everything above
import type { GameplayScene } from '../../scenes/gameplay';
import { app } from '../../core/app';
import { FLOOR_HOOKS, RUN_END_HOOKS, RUN_START_HOOKS } from '../registry';
import { profile, saveProfile, feat } from '../profile';
import type { RunState } from '../run';
import { MODIFIERS, ROLES } from '../../data/tables';
import { PROMOTION_MODE } from '../flags';
import { EXEC_NAMES } from '../executions';
import { BENEFIT_INFO } from '../content-info';
import { notify } from '../../ui/corpos';
import { awardAchievement, ACHIEVEMENT_BY_ID } from './achievements';
import { checkFeatUnlocks, checkRoleUnlocks, syncRadioUnlocks } from './catalogue';
import { syncCosmetics, COSMETIC_BY_ID } from './cosmetics';
import { meta } from './prefs';
import { BOSS_IDS } from './util';
import { buildSubmission, computeScore, getPlatform, recordTelemetry } from '../../platform/services';

export interface LeaveLine { label: string; days: number; kind: 'floor' | 'boss' | 'terminated' | 'discovery' | 'expense' | 'bonus' | 'desk' }

export interface DailyOutcome {
  state: 'pending' | 'submitted' | 'rejected' | 'practice' | 'assist';
  text: string;
  rank?: number;
  score: number;
}

export interface RunResult {
  won: boolean;
  floor: number;
  durationSec: number;
  score: number;
  bossesBeaten: number;
  leave: LeaveLine[];
  leaveTotal: number;
  leaveBalance: number;
  achievements: string[];     // names, newly earned this run (including mid-run ones)
  roleUnlocks: string[];
  featUnlocks: string[];
  cosmetics: string[];
  discoveries: string[];
  kpi: number;
  prJustUnlocked: boolean;
  newBestFloor: boolean;
  daily?: DailyOutcome;
}

const results = new WeakMap<RunState, RunResult>();
export const getRunResult = (run: RunState): RunResult | undefined => results.get(run);

const EXEC_FIRST = 2, BOSS_FIRST = 5, ACT_FIRST = 3, WIN_FIRST = 10, ROLE_WIN_FIRST = 5, TERMINATE_FIRST = 5;

/** Achievements earned during the run in progress (collected by the per-floor listeners and reported on the summary). */
const earnedThisRun: string[] = [];
/** At run end achievements are bundled into one toast (the summary deck lists them all); mid-run ones toast individually. */
let endPhase = false;
const endNames: string[] = [];
function ach(id: string): void { if (awardAchievement(id, endPhase)) { const d = ACHIEVEMENT_BY_ID.get(id); if (d) { earnedThisRun.push(d.name); if (endPhase) endNames.push(d.name); } } }

// ---------------------------------------------------------------------------
export function bossesBeaten(run: RunState, won: boolean): number {
  if (won) return 4;
  const byFloor = Math.floor((run.floor - 1) / 5); // reaching floor 11 means the floor-10 boss fell, etc.
  return Math.min(4, Math.max(byFloor, run.log.bossesKilled | 0));
}

export function durationOf(s: GameplayScene): number { return Math.max(0, s.run.elapsed + (s.floorTime || 0)); }

export function computeLeave(run: RunState, won: boolean): { lines: LeaveLine[]; total: number; discoveries: { id: string; label: string; days: number }[] } {
  const p = profile();
  const lines: LeaveLine[] = [];
  const f = Math.max(1, run.floor);
  lines.push({ label: `Floors reached (${f})`, days: f, kind: 'floor' });
  const nb = bossesBeaten(run, won);
  const bossDays = typeof run.flags.bossLeave === 'number' ? run.flags.bossLeave : nb * 5;
  if (bossDays > 0) lines.push({ label: `Bosses beaten (${nb})`, days: bossDays, kind: 'boss' });
  const term = run.log.promotedTerminated | 0;
  if (term > 0) lines.push({ label: `Terminated promoted staff (${term})`, days: term * 10, kind: 'terminated' });
  // first-time discoveries / feats
  const disc: { id: string; label: string; days: number }[] = [];
  const add = (id: string, label: string, days: number) => { if (!p.discoveries.includes(id) && !disc.some((d) => d.id === id)) disc.push({ id, label, days }); };
  for (const [t, n] of Object.entries(run.log.execByType)) if (n > 0) add('exec:' + t, `First ${EXEC_NAMES[t as keyof typeof EXEC_NAMES] ?? t} execution`, EXEC_FIRST);
  for (let i = 0; i < nb; i++) add('boss:' + BOSS_IDS[i], `First defeat: ${['Facilities Manager', 'Head of Sales', 'Head of Compliance', 'the CEO'][i]}`, BOSS_FIRST);
  for (let a = 2; a <= 4; a++) if (f >= (a - 1) * 5 + 1) add('act:' + a, `First time in Act ${a}`, ACT_FIRST);
  if (won) { add('win', 'First victory', WIN_FIRST); add('role_win:' + run.role, `First win as ${ROLES[run.role].name}`, ROLE_WIN_FIRST); }
  if (term > 0) add('terminate', 'First promoted enemy terminated', TERMINATE_FIRST);
  for (const d of disc) lines.push({ label: d.label, days: d.days, kind: 'discovery' });
  const expense = typeof run.flags.expenseLeave === 'number' ? run.flags.expenseLeave : Math.floor(run.pettyCash / 10);
  if (expense > 0) lines.push({ label: 'Expense claim (unspent Petty Cash)', days: expense, kind: 'expense' });
  const bonus = typeof run.flags.bonusLeave === 'number' ? run.flags.bonusLeave : 0;
  if (bonus > 0) lines.push({ label: 'Found on the job', days: bonus, kind: 'bonus' });
  let sub = lines.reduce((a, l) => a + l.days, 0);
  if (run.deskItems.includes('leave_request')) { const extra = Math.round(sub * 0.25); if (extra > 0) { lines.push({ label: 'Annual Leave Request Form (+25%)', days: extra, kind: 'desk' }); sub += extra; } }
  return { lines, total: sub, discoveries: disc };
}

/** KPI points a win with these modifiers is worth (spec 7.4). Promotion Season only counts if Promotion is enabled. */
export function kpiFor(run: RunState): number {
  let k = 0;
  for (const m of MODIFIERS) { if (m.id === 'promotion_season' && PROMOTION_MODE !== 'full') continue; k += (run.modifiers[m.id] ?? 0) * m.kpiPerRank; }
  return k;
}

// ---------------------------------------------------------------------------
function onRunEnd(s: GameplayScene, won: boolean): void {
  const run = s.run, p = profile(), st = p.stats, L = run.log;
  const duration = durationOf(s);
  const prevBest = st.bestFloor;
  const nb = bossesBeaten(run, won);
  const leave = computeLeave(run, won);

  // ---- lifetime statistics
  st.runs++; if (won) st.wins++; else if (!run.flags.demoComplete) st.deaths++; // an end-of-demo (Act 1 gate, edition.ts) is neither a win nor a death
  st.kills += L.kills; st.executions += L.executions; st.defenestrations += L.defenestrations; st.breaches += L.breaches;
  st.hazardKills += L.hazardKills; st.rageActivations += L.rageActivations; st.promotedTerminated += L.promotedTerminated;
  st.cashEarned += L.cashEarned; st.liftAmbushes += L.liftAmbushes; st.corridors += L.corridorsTaken; st.floorsCleared += L.floorsCleared;
  st.totalTime += duration;
  st.bestFloor = Math.max(st.bestFloor, run.floor);
  if (won && (st.fastestWin <= 0 || duration < st.fastestWin)) st.fastestWin = Math.round(duration);
  for (const [k, n] of Object.entries(L.execByType)) st.execByType[k] = (st.execByType[k] ?? 0) + n;
  for (let i = 0; i < nb; i++) st.bossKills[BOSS_IDS[i]] = (st.bossKills[BOSS_IDS[i]] ?? 0) + 1;
  feat('throwKills', L.throwsKills);
  if (run.assist) feat('assistRuns', 1);

  // ---- Annual Leave
  p.annualLeave += leave.total;
  st.leaveEarned += leave.total;
  for (const d of leave.discoveries) p.discoveries.push(d.id);

  // ---- Performance Review + KPI (cosmetic only)
  let kpi = 0, prJustUnlocked = false;
  if (won && !p.prUnlocked) {
    p.prUnlocked = true; prJustUnlocked = true;
    notify({ kind: 'good', title: 'Performance Review unlocked', body: 'Stack difficulty modifiers before a run in the car. KPI points unlock cosmetics, never power.', icon: 'chart', sound: 'ui_unlock', duration: 6 });
  }
  if (won && !(run.daily && run.practice)) { kpi = kpiFor(run); if (kpi > 0) { p.kpi += kpi; p.kpiBest = Math.max(p.kpiBest, kpi); } }
  const cos = syncCosmetics(true);

  // ---- unlocks
  const roles = checkRoleUnlocks(true);
  const feats = checkFeatUnlocks(true);
  syncRadioUnlocks();

  // ---- achievements derived from the finished run + lifetime stats
  endPhase = true; endNames.length = 0;
  runEndAchievements(s, won, nb);
  endPhase = false;
  if (endNames.length) notify({ kind: 'good', title: `${endNames.length} achievement${endNames.length === 1 ? '' : 's'} unlocked`, body: endNames.slice(0, 3).join(', ') + (endNames.length > 3 ? ` and ${endNames.length - 3} more` : '') + '.', icon: 'star', sound: 'ui_unlock', duration: 4.5 });

  // ---- score + daily
  const score = computeScore(run, won, duration);
  const result: RunResult = {
    won, floor: run.floor, durationSec: duration, score, bossesBeaten: nb, leave: leave.lines, leaveTotal: leave.total, leaveBalance: p.annualLeave,
    achievements: earnedThisRun.splice(0), roleUnlocks: roles.map((r) => ROLES[r].name), featUnlocks: feats.map((f) => f.name),
    cosmetics: cos.map((c) => c.name), discoveries: leave.discoveries.map((d) => d.label), kpi, prJustUnlocked, newBestFloor: run.floor > prevBest,
  };
  results.set(run, result);
  if (run.daily) handleDaily(run, won, duration, result);

  // ---- history (assist runs are marked: spec 7.3)
  const m = meta();
  m.lastOutcome = won || run.flags.demoComplete ? 'win' : 'death';
  const killer = s.killer as unknown as { name?: string; title?: string } | null;
  m.history.unshift({
    at: Date.now(), role: run.role, floor: run.floor, won, time: Math.round(duration), seed: run.seedCode, kills: L.kills, leave: leave.total, score,
    assist: run.assist, daily: run.daily, practice: run.practice, seeded: run.seeded, killer: killer?.name ? `${killer.title ?? ''} ${killer.name}`.trim() : undefined,
    modifiers: Object.values(run.modifiers).filter((v) => v > 0).length,
  });
  if (m.history.length > 30) m.history.length = 30;

  recordTelemetry('run_end', { won, floor: run.floor, role: run.role, seconds: Math.round(duration), daily: run.daily, seeded: run.seeded, assist: run.assist, bosses: nb });
  saveProfile();
}

function handleDaily(run: RunState, won: boolean, duration: number, result: RunResult): void {
  const p = profile();
  if (run.assist) { result.daily = { state: 'assist', text: 'Not submitted: runs with Workplace Adjustments are excluded from the daily boards.', score: result.score }; return; }
  if (run.practice) { result.daily = { state: 'practice', text: 'Practice attempt. Your one scored attempt for this day was already used, so this does not count.', score: result.score }; return; }
  if (won) ach('daily_run');
  const sub = buildSubmission(run, won, duration);
  const out: DailyOutcome = { state: 'pending', text: 'Submitting score to the daily board...', score: sub.score };
  result.daily = out;
  p.daily.history.push({ key: sub.dateKey, score: sub.score, floor: run.floor, time: sub.durationSec, won });
  if (p.daily.history.length > 60) p.daily.history.shift();
  getPlatform().leaderboards.submit(sub).then((r) => {
    if (r.ok) { out.state = 'submitted'; out.rank = r.rank; out.text = `Score ${sub.score.toLocaleString('en-GB')} submitted to the ${r.via === 'local' ? 'local' : r.via === 'steam' ? 'Steam' : 'Play Games'} daily board${r.rank ? `. Rank #${r.rank}` : ''}.`; }
    else { out.state = 'rejected'; out.text = 'Not submitted: ' + (r.reason ?? 'rejected by the sanity checks') ; }
  }).catch(() => { out.state = 'rejected'; out.text = 'Score kept locally. The leaderboard could not be reached.'; });
}

// ---------------------------------------------------------------------------
function runEndAchievements(s: GameplayScene, won: boolean, nb: number): void {
  const run = s.run, p = profile(), st = p.stats, L = run.log;
  if (st.kills > 0) ach('first_blood');
  if (st.bestFloor >= 5) ach('floor_one');
  if (st.bestFloor >= 10) ach('halfway_there');
  if (st.bestFloor >= 15) ach('mid_tower');
  if (st.bestFloor >= 20) ach('penthouse');
  if (nb >= 1) ach('facilities_done');
  if (nb >= 2) ach('sales_done');
  if (nb >= 3) ach('compliance_done');
  if (won) { ach('ceo_defeated'); ach(run.role + '_win'); if (L.damageTaken <= 0) ach('flawless_run'); if (!run.assist) ach('assist_off_win'); if (app.settings.gore === 'off') ach('gore_off_win'); if (L.cashSpent === 0) ach('budget_conscious'); }
  if (st.defenestrations >= 1) ach('defenestration_one');
  if (st.defenestrations >= 50) ach('defenestration_fifty');
  for (const t of ['photocopier', 'server_rack', 'shredder', 'microwave', 'hand_dryer']) if ((st.execByType[t] ?? 0) > 0) ach(t);
  if (st.breaches >= 1) { ach('breach_one'); ach('merge_rooms'); }
  if (st.breaches >= 5) ach('breach_five');
  if (L.breaches >= 10) ach('breach_master');
  if (st.hazardKills >= 1) ach('hazard_kill');
  if (L.rageActivations >= 10) ach('rage_ten');
  if (L.executions >= 20) ach('execution_enthusiast');
  const nm = Object.values(run.modifiers).filter((v) => v > 0).length;
  if (nm >= 1) ach('hard_mode');
  if (nm >= 3) ach('multiple_modifiers');
  if (st.promotedTerminated >= 1) ach('promoted_kill');
  if (st.promotedTerminated >= 3) ach('promoted_three');
  if (st.leaveEarned >= 100) ach('annual_leave_stacked');
  if (st.leaveEarned >= 5000) ach('wealth_builder');
  checkRunState(run);
}

/** In-run state checks (cheap; called on floor start / clear / run end). */
function checkRunState(run: RunState): void {
  const L = run.log;
  if (run.pettyCash >= 1000) ach('cash_rich');
  if (run.deskItems.length >= 5) ach('desk_item_five');
  if (L.breaches >= 5) ach('breach_five');
  if (L.breaches >= 10) ach('breach_master');
  if (run.loadout.melee && run.loadout.ranged && run.loadout.thrown) ach('full_arsenal');
  let syn = 0;
  for (const b of run.benefits) if (BENEFIT_INFO(b.id)?.synergy) syn++;
  if (syn >= 1) { ach('synergy_gain'); ach('first_synergy'); }
  if (syn >= 5) ach('synergy_five');
}

// ---------------------------------------------------------------------------
// Per-floor listeners: achievements that need to observe play as it happens.
function subscribe(s: GameplayScene): void {
  const w = s.world, run = s.run;
  const start = { dmg: run.log.damageTaken, rage: run.log.rageActivations, spent: run.log.cashSpent };
  const roomKills = new Map<number, number>();
  const floorNo = s.plan.floor_number;
  if (s.plan.floor_type === 'shop') ach('corridor_shop');
  checkRunState(run);

  w.bus.on('kill', ({ victim, method, hazardKind }) => {
    const v = victim as unknown as { archetype?: string; roomId?: number; isBoss?: boolean };
    if (!v.archetype) return;
    ach('first_blood');
    if (method === 'hazard') { ach('hazard_kill'); if (hazardKind === 'printer') ach('printer_boom'); }
    const rid = v.roomId ?? -1;
    const n = (roomKills.get(rid) ?? 0) + 1;
    roomKills.set(rid, n);
    if (n >= 5) ach('hostile_work_environment');
    if (v.isBoss) { if (floorNo === 5) ach('facilities_done'); else if (floorNo === 10) ach('sales_done'); else if (floorNo === 15) ach('compliance_done'); }
  });
  w.bus.on('execution', ({ type }) => {
    if (type === 'defenestration') ach('defenestration_one');
    else if (type === 'photocopier' || type === 'server_rack' || type === 'shredder' || type === 'microwave' || type === 'hand_dryer') ach(type);
  });
  w.bus.on('breach', () => { ach('breach_one'); ach('merge_rooms'); checkRunState(run); });
  w.bus.on('rageFull', () => ach('rage_full'));
  w.bus.on('hit', ({ target, amount }) => {
    if (s.player.raging > 0 && (target as unknown as { archetype?: string }).archetype && feat('rageDamage', amount) >= 500) ach('exceeds_expectations');
  });
  w.bus.on('bark', ({ text }) => { if (/per my last email/i.test(text) && feat('perMyLastEmail', 1) >= 100) ach('per_my_last_email'); });
  w.bus.on('enemySpawn', ({ enemy }) => {
    const a = (enemy as unknown as { archetype?: string }).archetype;
    if (!a) return;
    const p = profile();
    if (!p.feats['seen:' + a]) { p.feats['seen:' + a] = 1; if (Object.keys(p.feats).filter((k) => k.startsWith('seen:')).length >= 20) ach('all_archetypes_seen'); }
  });
  w.bus.on('shopBuy', () => ach('corridor_shop'));
  w.bus.on('floorClear', () => {
    const t = s.plan.floor_type;
    const combat = t === 'standard' || t === 'elite' || t === 'boss' || t === 'director';
    if (combat && run.log.damageTaken === start.dmg) ach('no_damage');
    if (combat && run.log.rageActivations === start.rage) ach('rageless');
    if (combat && run.log.cashSpent === start.spent) ach('under_budget');
    if (t === 'treasure') ach('treasure_room');
    if (t === 'challenge') ach('challenge_clear');
    if (t === 'lift_ambush') ach('lift_ambush');
    if (s.plan.wing > 0 && feat('corridorsCleared', 1) >= 5) ach('corridor_explorer');
    checkRunState(run);
  });
}

FLOOR_HOOKS.push(subscribe);
RUN_START_HOOKS.push(() => { earnedThisRun.length = 0; });
RUN_END_HOOKS.push(onRunEnd);

void COSMETIC_BY_ID;
