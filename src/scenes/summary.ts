// Run summary (spec 9.2): the Performance Review slide deck. Title slide with the outcome, KPI tiles, charts (kills by
// method, executions incl. defenestrations, time per floor), Annual Leave breakdown, unlocks and achievements,
// the promotion notice if a promoted enemy killed you, and the daily score submission result. Exportable as a screenshot.
import { app, Scene } from '../core/app';
import { audio } from '../audio/audio';
import { touch } from '../ui/touch';
import { SlideDeck, Slide, ChartDatum, DECK_COLOURS, notify, updateNotifications, renderNotifications } from '../ui/corpos';
import { hashCombine } from '../core/rng';
import { DEATH_MESSAGES, VICTORY_LINES } from '../data/text/announcements';
import { ROLES } from '../data/tables';
import { PROMOTION_RANKS } from '../data/ids';
import { EXEC_NAMES } from '../game/executions';
import { PROMOTION_MODE } from '../game/flags';
import { profile } from '../game/profile';
import { SCENES } from '../game/registry';
import type { GameplayScene } from './gameplay';
import type { RunState } from '../game/run';
import { getRunResult, RunResult, durationOf, computeLeave, bossesBeaten } from '../game/meta/progression';
import { fmtTime } from '../game/meta/util';
import { titleName } from '../game/meta/cosmetics';
import { seedToCode } from '../core/rng';

const METHOD_LABELS: Record<string, string> = { melee: 'Melee', heavy: 'Heavy', ranged: 'Ranged', throw: 'Thrown', body: 'Colleague', hazard: 'Hazards', execution: 'Execution', bleed: 'Bleed', rage: 'Rage', fall: 'Falls', breach: 'Breach', other: 'Other' };

export interface PromotionNotice { name: string; title: string; rank: number; rankName: string; floor: number; method: string; weapon: string; known: boolean }

/** Who killed the player and what did the promotion module do about it? Reads run.flags first, then the profile roster. */
export function promotionNotice(s: GameplayScene): PromotionNotice | null {
  const run = s.run, f = run.flags as Record<string, number | boolean | string>;
  const killer = s.killer as unknown as { name?: string; title?: string; promoted?: { name: string; title: string; rank: number } | null } | null;
  let name = typeof f.promotedName === 'string' ? f.promotedName : '';
  let title = typeof f.promotedTitle === 'string' ? f.promotedTitle : '';
  let rank = typeof f.promotedRank === 'number' ? f.promotedRank : 0;
  if (!name && killer?.name) {
    const roster = profile().promoted.filter((r) => r.name === killer.name);
    const rec = roster.sort((a, b) => b.createdAt - a.createdAt)[0] ?? killer.promoted ?? null;
    if (rec) { name = rec.name; title = rec.title; rank = rec.rank; }
  }
  if (!name) return null;
  const method = s.killMethod || 'unspecified causes';
  return { name, title, rank, rankName: PROMOTION_RANKS[Math.max(0, Math.min(3, (rank || 1) - 1))], floor: run.floor, method, weapon: s.killWeapon || '', known: true };
}

function pick<T>(arr: readonly T[], run: RunState): T { return arr[hashCombine(run.seed, run.floor, run.log.kills) % arr.length]; }

const fmt = (n: number): string => Math.round(n).toLocaleString('en-GB');

export function buildSlides(s: GameplayScene, won: boolean, res: RunResult): { slides: Slide[]; dailyBullets?: string[] } {
  const run = s.run, L = run.log;
  const role = ROLES[run.role]?.name ?? run.role;
  const dur = res.durationSec;
  const slides: Slide[] = [];
  const flagLine = [run.assist ? 'Workplace Adjustments: marked' : '', run.daily ? (run.practice ? 'Daily (practice)' : 'Daily run') : run.seeded ? 'Seeded run' : ''].filter(Boolean).join('  |  ');
  const ttl = titleName();
  slides.push({
    type: 'title',
    title: won ? 'Exceeds Expectations' : `Floor ${res.floor}: Terminated`,
    subtitle: won ? pick(VICTORY_LINES, run) : pick(DEATH_MESSAGES, run),
    stamp: won ? 'PROMOTED' : 'DOES NOT MEET',
    footer: `${role}${ttl ? ' (' + ttl + ')' : ''}  |  ${fmtTime(dur)}  |  Seed ${run.seedCode || seedToCode(run.seed)}${flagLine ? '  |  ' + flagLine : ''}`,
  });
  slides.push({
    type: 'stats', title: 'Key Performance Indicators',
    stats: [
      { label: 'Floor reached', value: String(res.floor), sub: res.newBestFloor ? 'New personal best' : `of 20 (best ${profile().stats.bestFloor})`, colour: '#2f5fa8' },
      { label: 'Time on the clock', value: fmtTime(dur), sub: `${role}`, colour: '#8a8f9c' },
      { label: 'Enemies defeated', value: fmt(L.kills), sub: `${L.elitesKilled} elites`, colour: '#b5503c' },
      { label: 'Executions', value: fmt(L.executions), sub: `${L.defenestrations} defenestrations`, colour: '#7a5fc8' },
      { label: 'Damage dealt', value: fmt(L.damageDealt), sub: `taken ${fmt(L.damageTaken)}`, colour: '#3fbf6a' },
      { label: 'Petty Cash earned', value: '£' + fmt(L.cashEarned), sub: `${L.breaches} walls breached`, colour: '#e8a33d' },
    ],
    note: run.assist ? 'Workplace Adjustments were active. This run is marked in your record.' : undefined,
  });
  // kills by method
  const km = Object.entries(L.killsByMethod).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  slides.push({
    type: 'bars', title: 'Kills by Method',
    data: km.length ? km.map(([k, n], i) => ({ label: METHOD_LABELS[k] ?? k, value: n, colour: DECK_COLOURS[i % DECK_COLOURS.length] })) : [{ label: 'None', value: 0 }],
    note: km.length ? `${fmt(L.kills)} colleagues reassigned. ${L.hazardKills} by the building itself.` : 'Nobody was hurt. Suspicious.',
  });
  // executions
  const ex = Object.entries(L.execByType).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const exData: ChartDatum[] = ex.map(([k, n], i) => ({ label: EXEC_NAMES[k as keyof typeof EXEC_NAMES] ?? k, value: n, colour: k === 'defenestration' ? '#e8a33d' : DECK_COLOURS[(i + 2) % DECK_COLOURS.length] }));
  if (exData.length >= 2) slides.push({ type: 'pie', title: 'Executions by Type', data: exData, unit: '', note: `${L.defenestrations} defenestration${L.defenestrations === 1 ? '' : 's'}. Health and Safety has been informed.` });
  else slides.push({ type: 'bars', title: 'Executions by Type', data: exData.length ? exData : [{ label: 'None', value: 0 }], horizontal: true, note: exData.length ? 'Specialising is a legitimate career strategy.' : 'No executions filed. The photocopier is disappointed.' });
  // time per floor
  const tpf = [...L.timePerFloor, Math.round(s.floorTime || 0)].filter((v) => v > 0);
  if (tpf.length >= 2) slides.push({ type: 'line', title: 'Seconds per Floor', series: [{ label: 'Time on floor', points: tpf, colour: '#2f5fa8' }], xLabels: tpf.map((_, i) => String(i + 1)), note: 'Quarterly targets are a suggestion. A strongly worded one.' });
  // annual leave
  slides.push({
    type: 'bars', title: 'Annual Leave Accrued', horizontal: true, unit: ' d',
    data: res.leave.map((l, i) => ({ label: l.label, value: l.days, colour: DECK_COLOURS[i % DECK_COLOURS.length] })),
    note: `+${res.leaveTotal} days kept (100% even on death). Balance: ${res.leaveBalance} days. Spend it at the vending machine.`,
  });
  // unlocks
  const ub: string[] = [];
  if (res.prJustUnlocked) ub.push('Performance Review modifiers unlocked. Stack them in the car.');
  for (const r of res.roleUnlocks) ub.push('Role unlocked: ' + r);
  for (const f of res.featUnlocks) ub.push('Feat unlocked: ' + f);
  for (const a of res.achievements) ub.push('Achievement: ' + a);
  for (const c of res.cosmetics) ub.push('KPI reward: ' + c);
  if (res.kpi > 0) ub.push(`+${res.kpi} KPI points (cosmetics only)`);
  if (!ub.length) ub.push('No new unlocks this run.', 'HR suggests trying harder, and a different weapon.');
  slides.push({ type: 'bullets', title: 'Unlocks and Achievements', bullets: ub.slice(0, 7), note: ub.length > 7 ? `+${ub.length - 7} more in your dashboard.` : res.discoveries.length ? `First-time bonuses: ${res.discoveries.slice(0, 3).join('; ')}.` : undefined });
  // promotion
  if (!won) {
    const pr = promotionNotice(s);
    if (pr) {
      const b = [`${pr.name} has been promoted to ${pr.rankName}.`, `Title: ${pr.title || pr.rankName}.`, `Floor ${pr.floor}. ${METHOD_LABELS[pr.method] ? 'Method: ' + METHOD_LABELS[pr.method].toLowerCase() : 'Method: ' + pr.method}${pr.weapon ? ' (' + pr.weapon.replace(/_/g, ' ') + ')' : ''}.`,
        PROMOTION_MODE === 'full' ? 'They will remember this. Check the noticeboard in the car park.' : 'They will be back, with a title. Check the noticeboard in the car park.'];
      slides.push({ type: 'bullets', title: 'Company Announcement', bullets: b, note: 'Congratulations to them. Commiserations to you.' });
    }
  }
  // daily
  let dailyBullets: string[] | undefined;
  if (run.daily && res.daily) {
    dailyBullets = [`Score: ${fmt(res.daily.score)}  (floor ${res.floor}${won ? ', victory' : ''})`, res.daily.text, run.practice ? 'Practice runs are never scored.' : 'One scored attempt per day. Come back after 00:00 UTC.'];
    slides.push({ type: 'bullets', title: 'Daily Leaderboard Submission', bullets: dailyBullets, note: `Seed ${run.seedCode}. Platform boards are separate (Steam / Play Games).` });
  }
  return { slides, dailyBullets };
}

class SummaryScene implements Scene {
  name = 'summary';
  private deck: SlideDeck;
  private res: RunResult;
  private dailyBullets?: string[];
  private done = false;
  private prevMode: 'gameplay' | 'menu' = 'gameplay';

  constructor(private s: GameplayScene, private won: boolean, private onDone: () => void) {
    this.res = getRunResult(s.run) ?? this.fallback(s, won);
    const built = buildSlides(s, won, this.res);
    this.dailyBullets = built.dailyBullets;
    this.deck = new SlideDeck({ title: 'Performance Review - Employee Record', slides: built.slides, backdrop: 'desktop', exportName: 'company-policy-review', onClose: () => this.finish() });
  }

  private fallback(s: GameplayScene, won: boolean): RunResult {
    const l = computeLeave(s.run, won);
    return { won, floor: s.run.floor, durationSec: durationOf(s), score: 0, bossesBeaten: bossesBeaten(s.run, won), leave: l.lines, leaveTotal: l.total, leaveBalance: profile().annualLeave, achievements: [], roleUnlocks: [], featUnlocks: [], cosmetics: [], discoveries: [], kpi: 0, prJustUnlocked: false, newBestFloor: false };
  }

  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    audio.music.play('hub', 1.2);
    if (this.won) audio.sfx('stinger_victory');
    app.renderer.zoom = 1;
  }
  exit(): void { touch.setContext({ mode: this.prevMode }); }
  private finish(): void { if (this.done) return; this.done = true; this.onDone(); }

  update(dt: number): void {
    touch.update();
    updateNotifications(dt);
    // the daily submission resolves asynchronously: keep its line current
    if (this.dailyBullets && this.res.daily) this.dailyBullets[1] = this.res.daily.text;
    this.deck.update(dt);
  }
  render(): void {
    const g = app.renderer.f;
    this.deck.render(g);
    renderNotifications(g);
  }
}

SCENES.summary = (s, won, onDone) => new SummaryScene(s, won, onDone);
void notify;
