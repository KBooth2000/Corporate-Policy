// "Clock In": the car itself. Run setup (spec 4.6, 7.3, 7.4): New Run / Continue Shift / Daily Run / Enter Seed /
// Performance Review modifiers (after the first CEO kill) / Workplace Adjustments assist toggle.
import { app } from '../../../core/app';
import { audio } from '../../../audio/audio';
import { codeToSeed, seedToCode } from '../../../core/rng';
import { Ctx } from '../../../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../../../render/font';
import { Widget, Ui, List, Heading, Label, Button, Toggle, Slider, Choice, TextField, Spacer, attachOSK, btnH, rowH } from '../../../ui/widgets';
import { C, box, ink, uiS, truncate, RectL } from '../../../ui/style';
import { ConfirmDialog } from '../../../ui/corpos';
import { MODIFIERS, ROLES } from '../../../data/tables';
import { PROMOTION_MODE } from '../../flags';
import { profile, saveProfile } from '../../profile';
import { buildRun, continueShift, dailyInfo, describeModifiers, hasSuspend, kpiOf, launchRun, peekSuspend, selectedRole } from '../runs';
import { getPlatform, LeaderboardEntry } from '../../../platform/services';
import { fmtTime } from '../util';
import { InfoRow } from './rows';
import { PanelScene } from './panel';

/** Lets the hub fade out before the run begins; defaults to immediate. */
export type LaunchFn = (go: () => void) => void;
const now: LaunchFn = (go) => go();

function fmtCountdown(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------------------
export class DailyPanel extends PanelScene {
  override name = 'daily';
  private list = new List();
  private board: LeaderboardEntry[] | null = null;
  constructor(private launch: LaunchFn = now, onClose?: () => void) {
    super({ title: 'Daily Run - Published Briefing', glyph: 'calendar', w: 560, h: 340, closeText: 'Not today', onClose });
    this.ui.add(this.list);
    this.build();
    this.finishBuild();
    const start = this.list.items.find((i) => i instanceof Button);
    this.ui.setFocus(start ?? this.closeBtn);
    void getPlatform().leaderboards.fetch('daily:' + dailyInfo().key, 5).then((b) => { this.board = b; this.build(); });
  }

  private build(): void {
    const d = dailyInfo();
    const assist = !!app.settings.assist.enabled;
    const scored = d.scoredAvailable && !assist;
    const items: Widget[] = [];
    items.push(new Heading(`${d.key} - seed ${d.code}`, 'calendar'));
    items.push(new InfoRow('Resets in', fmtCountdown(d.resetsInSec), { sub: 'The seed changes at 00:00 UTC for everyone.', icon: null }));
    items.push(new InfoRow('Role', ROLES[d.role].name, { sub: 'Fixed for the day. Promotion is disabled in daily runs.' }));
    items.push(new Heading('Published modifiers (fixed for every player)', 'warn'));
    for (const m of describeModifiers(d.modifiers)) items.push(new InfoRow(`${m.name}  ${'I'.repeat(m.rank)}`, `rank ${m.rank}/${m.ranks}`, { sub: m.desc }));
    items.push(new Heading('Your attempt', 'user'));
    items.push(new InfoRow(scored ? 'Scored attempt available' : d.scoredAvailable ? 'Practice only (Workplace Adjustments on)' : 'Scored attempt already used', scored ? 'ONE ATTEMPT' : 'PRACTICE', {
      sub: scored ? 'Quitting is fine: a suspended shift still counts as your attempt. Dying ends it.' : assist ? 'Runs with Workplace Adjustments are excluded from the daily boards.' : 'Practice attempts are never scored. Enjoy yourself.', valueCol: scored ? '#1d7a3e' : C.inkDim,
    }));
    if (assist && d.scoredAvailable) items.push(new Label('Switch Workplace Adjustments off in the car (Clock In) to use your scored attempt.', { dim: true }));
    const b = new Button({ text: scored ? 'Start scored daily run' : 'Start practice run', kind: 'primary', glyph: 'play', onPress: () => this.start(), sound: 'ui_select' });
    items.push(new Spacer(2), b);
    items.push(new Heading('Local board (today)', 'chart'));
    if (!this.board) items.push(new Label('Loading...', { dim: true }));
    else if (!this.board.length) items.push(new Label('No scored attempt on this device yet today.', { dim: true }));
    else for (const e of this.board) items.push(new InfoRow(`#${e.rank}  ${e.name}`, e.score.toLocaleString('en-GB'), { sub: `Floor ${e.floor} - ${fmtTime(e.time)}` }));
    const keep = this.ui.focus instanceof Button;
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
    if (keep) this.ui.setFocus(b);
  }

  private start(): void {
    const go = () => launchRun(buildRun({ kind: 'daily' }));
    if (hasSuspend()) this.ui.openModal(new ConfirmDialog({ title: 'Replace suspended shift?', message: 'Starting a run discards your suspended shift.', confirmText: 'Start run', cancelText: 'Keep my shift', danger: true, onConfirm: () => this.launch(go) }));
    else this.launch(go);
  }

  protected layout(cl: RectL): void {
    this.list.set(cl.x + 2, cl.y + 2, cl.w - 4, cl.h - this.footH() - 4);
    this.list.padY = 0;
  }
  protected drawBody(g: Ctx): void { box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: C.face, kind: 'sunken', cham: 0, depth: 1 }); }
}

// ---------------------------------------------------------------------------
export class ClockInPanel extends PanelScene {
  override name = 'clockin';
  private list = new List();
  private kpiLabel = new Label('', { dim: true });

  constructor(private launch: LaunchFn = now, onClose?: () => void) {
    super({ title: 'Clock In - Shift Setup', glyph: 'clock', w: 600, h: 350, closeText: 'Back to car park', onClose });
    this.ui.add(this.list);
    this.build();
    this.finishBuild();
    this.ui.setFocus(this.list.items.find((i) => i instanceof Button) ?? this.closeBtn);
    this.statusText = 'Your car. Your shift. Your problem.';
  }

  private build(): void {
    const p = profile();
    const items: Widget[] = [];
    const role = ROLES[selectedRole()];
    items.push(new Heading('Shift', 'clock'));
    const sus = peekSuspend();
    if (sus) {
      const lbl = `Continue shift: floor ${sus.plan.floor_number}, ${ROLES[sus.role]?.name ?? sus.role}${sus.daily ? ', daily' : sus.seeded ? ', seeded' : ''}`;
      items.push(new Button({ text: lbl, kind: 'primary', glyph: 'play', onPress: () => this.launch(() => { continueShift(); }), sound: 'ui_select' }));
      items.push(new Label(`Suspended at ${fmtTime(sus.elapsed)} on the clock. Seed ${sus.seedCode}. Resuming deletes the save.`, { dim: true, scale: 1 }));
    }
    const newBtn = new Button({ text: `New run as ${role.name}`, kind: sus ? 'normal' : 'primary', glyph: 'play', onPress: () => this.newRun(), sound: 'ui_select' });
    items.push(newBtn);
    items.push(new Label(`Starting role: ${role.name}. Change role and loadout in the car boot.${Object.keys(this.mods()).length ? ' Performance Review modifiers apply.' : ''}`, { dim: true, scale: 1 }));

    // daily
    const d = dailyInfo();
    items.push(new Heading('Daily run', 'calendar'));
    items.push(new Button({ text: d.scoredAvailable && !app.settings.assist.enabled ? `Daily run ${d.key}: scored attempt` : `Daily run ${d.key}: practice`, glyph: 'calendar', onPress: () => this.openDaily(), sound: 'ui_select' }));
    items.push(new Label('One scored attempt per day (00:00 UTC reset), a fixed published modifier set and no Promotion.', { dim: true, scale: 1 }));

    // seed
    items.push(new Heading('Enter seed', 'hash'));
    const fmt = (v: string) => { const c = v.replace(/-/g, ''); return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
    const tf = new TextField('Seed code', '', { maxLen: 9, placeholder: 'XXXX-XXXX', format: fmt, filter: (ch) => (/[0-9a-z]/i.test(ch) ? ch.toUpperCase() : ''), onSubmit: () => undefined });
    attachOSK(this.ui, tf, 'Enter seed code', 8);
    items.push(tf);
    items.push(new Button({ text: 'Start seeded run', glyph: 'hash', onPress: () => this.seeded(tf), sound: 'ui_select' }));
    items.push(new Label('Seeded runs share a layout and loot with whoever has the same code. Promotion is disabled.', { dim: true, scale: 1 }));

    // performance review
    items.push(new Heading('Performance Review', 'chart'));
    if (!p.prUnlocked) {
      items.push(new Label('Locked. Defeat the CEO once to unlock difficulty modifiers. Each rank earns KPI points toward cosmetic rewards: outfits, titles and hub decor. Never power.', { dim: true, scale: 1 }));
    } else {
      for (const m of MODIFIERS) {
        if (m.id === 'promotion_season' && PROMOTION_MODE !== 'full') continue;
        const opts = [{ value: 0, label: 'Off' }, ...Array.from({ length: m.ranks }, (_, i) => ({ value: i + 1, label: `Rank ${'I'.repeat(i + 1)}  (+${(i + 1) * m.kpiPerRank} KPI)` }))];
        items.push(new Choice<number>(m.name, opts, () => Math.min(m.ranks, p.prModifiers[m.id] ?? 0), (v) => { if (v) p.prModifiers[m.id] = v; else delete p.prModifiers[m.id]; saveProfile(); this.refreshKpi(); }));
        items.push(new Label(m.desc, { dim: true, scale: 1 }));
      }
      items.push(this.kpiLabel);
      this.refreshKpi();
    }

    // assist
    items.push(new Heading('Workplace Adjustments', 'heart'));
    const S = app.settings;
    const en = new Toggle('Assist mode', () => S.assist.enabled, (v) => { S.assist.enabled = v; app.saveSettings(); this.build(); });
    const dmg = new Slider('Damage taken', () => S.assist.damageTaken, (v) => { S.assist.damageTaken = v; app.saveSettings(); }, 0.25, 1, 0.05);
    const spd = new Slider('Game speed', () => S.assist.gameSpeed, (v) => { S.assist.gameSpeed = v; app.saveSettings(); }, 0.6, 1, 0.05);
    dmg.enabled = spd.enabled = S.assist.enabled;
    items.push(en, dmg, spd);
    items.push(new Label('Assist runs are excluded from the daily leaderboards and marked on your stats screen. Everything else works as normal, and you still earn Annual Leave.', { dim: true, scale: 1 }));

    const f = this.ui.focus;
    const fi = f ? this.list.items.indexOf(f) : -1;
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
    if (fi >= 0 && items[fi]) this.ui.setFocus(items[fi]);
  }

  private mods(): Record<string, number> { const p = profile(); const o: Record<string, number> = {}; if (p.prUnlocked) for (const [k, v] of Object.entries(p.prModifiers)) if (v > 0) o[k] = v; return o; }
  private refreshKpi(): void {
    const k = kpiOf(this.mods());
    this.kpiLabel.text = k ? `This setup is worth ${k} KPI on a win. Cosmetics only, never power.` : 'No modifiers active. Stack some for KPI points.';
  }

  private newRun(): void {
    const go = () => launchRun(buildRun({ kind: 'normal' }));
    if (hasSuspend()) this.ui.openModal(new ConfirmDialog({ title: 'Replace suspended shift?', message: 'Starting a new run discards your suspended shift. Use Continue shift to pick it up instead.', confirmText: 'Start new run', cancelText: 'Keep my shift', danger: true, onConfirm: () => this.launch(go) }));
    else this.launch(go);
  }
  private openDaily(): void { const hub = this.o.onClose; app.push(new DailyPanel(this.launch)); void hub; }
  private seeded(tf: TextField): void {
    const seed = codeToSeed(tf.value);
    if (seed === null) { this.statusText = tf.value ? 'Invalid seed code. The checksum failed. HR has been notified.' : 'Please enter a seed code.'; audio.sfx('ui_error'); return; }
    const go = () => launchRun(buildRun({ kind: 'seeded', seed }));
    this.statusText = `Seed ${seedToCode(seed)} accepted.`;
    if (hasSuspend()) this.ui.openModal(new ConfirmDialog({ title: 'Replace suspended shift?', message: 'Starting a run discards your suspended shift.', confirmText: 'Start run', cancelText: 'Keep my shift', danger: true, onConfirm: () => this.launch(go) }));
    else this.launch(go);
  }

  protected layout(cl: RectL): void {
    this.list.set(cl.x + 2, cl.y + 2, cl.w - 4, cl.h - this.footH() - 4);
    this.list.padY = 2;
    this.list.padX = 2;
  }
  protected drawBody(g: Ctx): void { box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: C.face, kind: 'sunken', cham: 0, depth: 1 }); void drawText; void measure; void wrap; void LINE_H; void ink; void uiS; void truncate; void Ui; void btnH; void rowH; }
}
