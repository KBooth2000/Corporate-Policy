// Dashboard (spec 7.3): trophies from Terminated Directors, lifetime run statistics, run history (Workplace Adjustments
// runs are marked), the local daily board and achievements.
import { Ctx } from '../../../render/canvas';
import { drawText, measure, LINE_H } from '../../../render/font';
import { Widget, List, Heading, Label, Tabs, rowH } from '../../../ui/widgets';
import { C, box, ink, drawGlyph, uiS, truncate, RectL } from '../../../ui/style';
import { icon } from '../../../art/items';
import { profile } from '../../profile';
import { meta } from '../prefs';
import { ACHIEVEMENTS } from '../../../data/text/achievements';
import { ROLES } from '../../../data/tables';
import { EXEC_NAMES } from '../../executions';
import { getPlatform, LeaderboardEntry } from '../../../platform/services';
import { dailyInfo, describeModifiers } from '../runs';
import { fmtTime, fmtHours, BOSS_IDS, BOSS_NAMES } from '../util';
import { PanelScene } from './panel';
import { InfoRow, Chip } from './rows';

const TABS = [
  { label: 'Statistics', glyph: 'chart' },
  { label: 'Trophies', glyph: 'star' },
  { label: 'Run History', glyph: 'clock' },
  { label: 'Daily', glyph: 'calendar' },
  { label: 'Achievements', glyph: 'check' },
];

export class DashboardPanel extends PanelScene {
  override name = 'dashboard';
  private tabs: Tabs;
  private list = new List();
  private tab = 0;
  private board: LeaderboardEntry[] | null = null;
  private boardLoaded = false;

  constructor(onClose?: () => void, startTab = 0) {
    super({ title: 'Dashboard - Employee Record', glyph: 'chart', w: 620, h: 350, closeText: 'Close dashboard', onClose });
    this.tabs = new Tabs(TABS, (i) => { this.tab = i; this.rebuild(); });
    this.tabs.vertical = false;
    this.tab = startTab; this.tabs.index = startTab;
    this.ui.add(this.tabs); this.ui.add(this.list);
    this.finishBuild();
    this.rebuild();
    this.ui.setFocus(this.list.items.find((i) => i.focusable) ?? this.tabs);
    this.statusText = 'Your record, as filed by HR. Everything is filed by HR.';
  }

  private rebuild(): void {
    const items: Widget[] = [];
    const p = profile(), st = p.stats;
    const head = (t: string, g?: string) => items.push(new Heading(t, g));
    const row = (l: string, v: string | number, o?: ConstructorParameters<typeof InfoRow>[2]) => items.push(new InfoRow(l, String(v), o));
    switch (this.tab) {
      case 0: {
        head('Career', 'user');
        const wr = st.runs ? Math.round((st.wins / st.runs) * 100) : 0;
        row('Runs played', st.runs); row('Victories', st.wins); row('Terminations (deaths)', st.deaths); row('Win rate', wr + '%');
        row('Best floor reached', st.bestFloor || '-'); row('Fastest victory', st.fastestWin ? fmtTime(st.fastestWin) : '-'); row('Total time on the clock', fmtHours(st.totalTime));
        row('Runs with Workplace Adjustments', p.feats.assistRuns ?? 0, { dim: true });
        head('Violence (workplace incidents)', 'skull');
        row('Enemies defeated', st.kills); row('Executions', st.executions); row('Defenestrations', st.defenestrations); row('Walls breached', st.breaches); row('Hazard kills', st.hazardKills);
        row('Rage activations', st.rageActivations); row('Floors cleared', st.floorsCleared); row('Lift ambushes survived', st.liftAmbushes); row('Corridors taken', st.corridors);
        row('Promoted staff terminated', st.promotedTerminated);
        head('Bosses beaten', 'warn');
        for (const id of BOSS_IDS) row(BOSS_NAMES[id], st.bossKills[id] ?? 0);
        head('Executions by type', 'doc');
        const ex = Object.entries(st.execByType).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        if (!ex.length) items.push(new Label('None yet. The photocopier is lonely.', { dim: true }));
        for (const [t, n] of ex) row(EXEC_NAMES[t as keyof typeof EXEC_NAMES] ?? t, n);
        head('Economy', 'cart');
        row('Annual Leave balance', p.annualLeave + ' days', { valueCol: '#1d7a3e' }); row('Annual Leave earned (lifetime)', st.leaveEarned + ' days'); row('Petty Cash earned (lifetime)', '£' + st.cashEarned);
        row('KPI points', p.kpi, { dim: !p.prUnlocked }); row('Best single-run KPI', p.kpiBest, { dim: !p.prUnlocked });
        break;
      }
      case 1: {
        head('Trophies (Terminated Directors)', 'star');
        if (!p.trophies.length) items.push(new Label('No trophies. Terminate a promoted Director and their anchor item is displayed here.', { dim: true }));
        for (const t of p.trophies) items.push(new InfoRow(t.name, new Date(t.at).toLocaleDateString('en-GB'), { sub: 'Trophy: ' + t.item, icon: icon('trophy') }));
        break;
      }
      case 2: {
        head('Last ' + meta().history.length + ' runs', 'clock');
        if (!meta().history.length) items.push(new Label('No runs on file. HR has noted your attendance record.', { dim: true }));
        for (const h of meta().history) {
          const chips: Chip[] = [];
          if (h.assist) chips.push({ text: 'ASSIST', face: '#b57800' });
          if (h.daily) chips.push({ text: h.practice ? 'DAILY (PRACTICE)' : 'DAILY', face: '#2f5fa8' });
          else if (h.seeded) chips.push({ text: 'SEEDED', face: '#7a5fc8' });
          if (h.modifiers) chips.push({ text: 'PR x' + h.modifiers, face: '#a82828' });
          const when = new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          items.push(new InfoRow(`${h.won ? 'VICTORY' : 'Terminated'} - floor ${h.floor} - ${ROLES[h.role as keyof typeof ROLES]?.name ?? h.role}`, `${fmtTime(h.time)}`, {
            sub: `${when} - seed ${h.seed} - ${h.kills} defeated - +${h.leave} days${h.killer ? ' - by ' + h.killer : ''}`, chips, icon: icon(h.won ? 'star' : 'skull'), valueCol: h.won ? '#1d7a3e' : C.navy,
          }));
        }
        break;
      }
      case 3: {
        const d = dailyInfo();
        head(`Today: ${d.key} (seed ${d.code})`, 'calendar');
        row('Scored attempt', d.scoredAvailable ? 'Available' : 'Used', { valueCol: d.scoredAvailable ? '#1d7a3e' : '#a82828' });
        for (const m of describeModifiers(d.modifiers)) row(`${m.name} ${'I'.repeat(m.rank)}`, '', { sub: m.desc });
        head('Local daily board (today)', 'chart');
        if (!this.boardLoaded) { this.boardLoaded = true; void getPlatform().leaderboards.fetch('daily:' + d.key, 10).then((b) => { this.board = b; if (this.tab === 3) this.rebuild(); }); }
        if (!this.board) items.push(new Label('Loading...', { dim: true }));
        else if (!this.board.length) items.push(new Label('No scored attempt yet today. Practice attempts are never scored.', { dim: true }));
        else for (const e of this.board) items.push(new InfoRow(`#${e.rank}  ${e.name}`, e.score.toLocaleString('en-GB'), { sub: `Floor ${e.floor} - ${fmtTime(e.time)}` }));
        head('Previous days', 'clock');
        const hist = p.daily.history.slice().reverse().slice(0, 14);
        if (!hist.length) items.push(new Label('No daily history yet.', { dim: true }));
        for (const h of hist) items.push(new InfoRow(h.key, h.score.toLocaleString('en-GB'), { sub: `Floor ${h.floor} - ${fmtTime(h.time)}${h.won ? ' - VICTORY' : ''}` }));
        items.push(new Label('Local boards only. Steam and Play Games boards are separate and use platform leaderboards.', { dim: true }));
        break;
      }
      case 4: {
        head(`Achievements (${p.achievements.length}/${ACHIEVEMENTS.length})`, 'check');
        const got = ACHIEVEMENTS.filter((a) => p.achievements.includes(a.id)), rest = ACHIEVEMENTS.filter((a) => !p.achievements.includes(a.id));
        for (const a of got) items.push(new InfoRow(a.name, '', { sub: a.desc, icon: icon('check') }));
        for (const a of rest) items.push(new InfoRow(a.hidden ? '???' : a.name, '', { sub: a.hidden ? 'Hidden. HR will let you know.' : a.desc, icon: icon('lock'), dim: true }));
        break;
      }
    }
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
  }

  protected layout(cl: RectL): void {
    const th = rowH() + 6;
    this.tabs.set(cl.x + 2, cl.y + 2, cl.w - 4, th);
    this.list.set(cl.x + 2, cl.y + th + 6, cl.w - 4, cl.h - this.footH() - th - 8);
    this.list.padY = 0;
  }

  protected drawBody(g: Ctx, _cl: RectL): void {
    box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: '#e1ddd0', kind: 'sunken', cham: 0, depth: 1 });
    void drawGlyph;
  }
}
