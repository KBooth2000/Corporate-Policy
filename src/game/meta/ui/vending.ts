// Hub vending machine: the CorpOS "Staff Perks Portal" catalogue. Spend Annual Leave to unlock weapons, Benefits,
// Desk Items, events and starting roles into the run pools (spec 7.3, 8.2). Feat-gated unlocks show their progress.
import { app } from '../../../core/app';
import { Rng, fxRng } from '../../../core/rng';
import { audio } from '../../../audio/audio';
import { Ctx } from '../../../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../../../render/font';
import { Widget, Ui, List, Heading, Tabs, Label, rowH } from '../../../ui/widgets';
import { C, box, well, ink, drawGlyph, uiS, truncate, textY, RectL, colourFor } from '../../../ui/style';
import { ConfirmDialog, notify } from '../../../ui/corpos';
import { weaponIcon, deskItemIcon, icon } from '../../../art/items';
import { bakeCharacter, rollLook } from '../../../art/characters';
import { profile } from '../../profile';
import { VENDING_LINES } from '../../../data/text/ui';
import { RARITY_NAMES } from '../../../art/palette';
import { Perk, UnlockKind, perksOf, isOwned, purchase, checkFeatUnlocks, checkRoleUnlocks, roleCondition } from '../catalogue';
import { PanelScene } from './panel';

const TABS: { kind: UnlockKind; label: string; glyph: string }[] = [
  { kind: 'weapon', label: 'Weapons', glyph: 'skull' },
  { kind: 'benefit', label: 'Benefits', glyph: 'heart' },
  { kind: 'desk', label: 'Desk Items', glyph: 'doc' },
  { kind: 'event', label: 'Events', glyph: 'mail' },
  { kind: 'role', label: 'Roles', glyph: 'user' },
];

const portraitCache = new Map<string, HTMLCanvasElement>();
export function rolePortrait(role: string): HTMLCanvasElement {
  let c = portraitCache.get(role);
  if (!c) {
    try { c = bakeCharacter(rollLook({ kind: 'player', role: role as never, tier: 0 }, new Rng(0x51ed ^ role.length * 7919))).portrait; } catch { c = icon('check'); }
    portraitCache.set(role, c);
  }
  return c;
}

export function perkIcon(p: Perk): HTMLCanvasElement {
  try {
    switch (p.kind) {
      case 'weapon': return weaponIcon(p.key);
      case 'desk': return deskItemIcon(p.key);
      case 'benefit': return icon(('dept_' + (p.dept ?? 'hr')) as never);
      case 'event': return icon('reward_event');
      case 'role': return rolePortrait(p.key);
    }
  } catch { /* fall through */ }
  return icon('info');
}

type StatusKind = 'owned' | 'buy' | 'poor' | 'feat' | 'earn';
function statusOf(p: Perk): { kind: StatusKind; text: string } {
  if (isOwned(p)) return { kind: 'owned', text: p.starter ? 'STARTER' : 'UNLOCKED' };
  if (p.feat) return { kind: 'feat', text: `FEAT ${Math.min(p.feat.progress(), p.feat.target)}/${p.feat.target}` };
  if (p.kind === 'role' && !p.price) { const c = roleCondition(p.role!); return { kind: 'earn', text: `${Math.min(c.have, c.need)}/${c.need}` }; }
  return { kind: profile().annualLeave >= p.price ? 'buy' : 'poor', text: `${p.price} d` };
}

class PerkRow extends Widget {
  shake = 0; flash = 0;
  constructor(public perk: Perk, public owner: VendingPanel) { super(); }
  override layout(): void { this.h = this.owner.rowHeight(); }
  override activate(): void { this.press = 1; this.owner.tryBuy(this); }
  override update(dt: number, ui: Ui): void { super.update(dt, ui); this.shake = Math.max(0, this.shake - dt * 5); this.flash = Math.max(0, this.flash - dt * 3); }
  override draw(g: Ctx): void {
    const p = this.perk, s = uiS(), st = statusOf(p);
    const dx = this.shake > 0 ? Math.round(Math.sin(this.shake * 40) * 3 * this.shake) : 0;
    const x = this.x + dx, y = this.y, w = this.w, h = this.h;
    const owned = st.kind === 'owned';
    g.fillStyle = this.focused ? '#fff3c4' : this.hovered ? '#f6f2e4' : owned ? '#e2dfd4' : '#f3f0e6';
    g.fillRect(x, y, w, h - 1);
    if (this.focused) { g.fillStyle = C.amber; g.fillRect(x, y, 3, h - 1); }
    g.fillStyle = C.faceLo; g.fillRect(x, y + h - 1, w, 1);
    // icon tile
    const ib = Math.min(h - 4, 22);
    well(g, x + 6, y + Math.round((h - ib) / 2), ib, ib, owned ? '#c8c4b8' : '#fbfaf5');
    const ic = perkIcon(p);
    g.globalAlpha = owned ? 0.55 : 1;
    const sc = ic.width > 16 ? 1 : ib >= 20 ? 1 : 1;
    g.drawImage(ic, Math.round(x + 6 + (ib - ic.width * sc) / 2), Math.round(y + (h - ib) / 2 + (ib - ic.height * sc) / 2), ic.width * sc, ic.height * sc);
    g.globalAlpha = 1;
    // status chip (right)
    const label = st.text;
    const cw = measure(label, 1) + 14, ch = Math.min(h - 6, 12 + (s - 1) * 4);
    const cx = x + w - cw - 8, cy = y + Math.round((h - ch) / 2);
    const face = st.kind === 'owned' ? '#6f8f78' : st.kind === 'buy' ? '#2c8a50' : st.kind === 'poor' ? '#a82828' : st.kind === 'feat' ? '#b57800' : '#59627a';
    box(g, cx, cy, cw, ch, { face, cham: 1, depth: 1 });
    drawText(g, label, cx + cw / 2, cy + Math.round((ch - 7) / 2), { color: '#fff', align: 'center', shadow: 'rgba(0,0,0,0.4)' });
    if (st.kind === 'owned') drawGlyph(g, 'check', cx - 8, cy + ch / 2, '#2c8a50', 1);
    // text
    const tx = x + 6 + ib + 8, tw = cx - tx - (st.kind === 'owned' ? 18 : 8);
    const two = h >= 22;
    const col = owned ? C.inkDim : C.ink;
    ink(g, truncate(p.name, tw - (p.tag ? measure(p.tag) + 12 : 0), s), tx, two ? y + 3 : textY(y, h, s), { scale: s, color: col });
    if (p.tag) {
      const nameW = measure(truncate(p.name, tw - measure(p.tag) - 12, s), s);
      const tgx = tx + nameW + 6;
      if (tgx + measure(p.tag) + 6 < cx - 4) { box(g, tgx, (two ? y + 3 : textY(y, h, s)) - 1, measure(p.tag) + 6, 9, { face: p.rarity === 2 ? '#8a6a1a' : p.rarity === 1 ? '#2f5fa8' : C.navy, cham: 0, depth: 1 }); drawText(g, p.tag, tgx + 3, (two ? y + 3 : textY(y, h, s)) + 0, { color: p.rarity === 2 ? '#ffe9a0' : '#fff', shadow: null }); }
    }
    if (two && s === 1) ink(g, truncate(p.desc, tw), tx, y + 3 + LINE_H + (this.owner.rowHeight() > 26 ? 2 : 0), { color: C.inkDim });
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`; g.fillRect(x, y, w, h - 1); }
  }
}

export class VendingPanel extends PanelScene {
  override name = 'vending';
  private tabs: Tabs;
  private list = new List();
  private kind: UnlockKind = 'weapon';
  private chipRect: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private detailRect: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private shownLeave = profile().annualLeave;
  private rows: PerkRow[] = [];

  constructor(onClose?: () => void) {
    super({ title: 'Staff Perks Portal - Vending Machine', glyph: 'cart', w: 620, h: 350, closeText: 'Back to car park', onClose });
    checkFeatUnlocks(true);
    checkRoleUnlocks(true);
    this.tabs = new Tabs(TABS.map((t) => ({ label: t.label, glyph: t.glyph })), (i) => { this.kind = TABS[i].kind; this.rebuild(); });
    this.tabs.vertical = false;
    this.ui.add(this.tabs); this.ui.add(this.list);
    this.finishBuild();
    this.rebuild();
    this.ui.setFocus(this.rows[0] ?? this.tabs);
    this.statusText = fxRng.pick(VENDING_LINES) ?? 'Please select.';
  }

  private counts(kind: UnlockKind): string {
    const all = perksOf(kind);
    return `${all.filter(isOwned).length}/${all.length}`;
  }

  rebuild(keepIndex = -1): void {
    const all = perksOf(this.kind);
    const groups: { title: string; glyph: string; items: Perk[] }[] = [
      { title: 'On sale (Annual Leave)', glyph: 'cart', items: all.filter((p) => !isOwned(p) && !p.feat && (p.price > 0)).sort((a, b) => a.price - b.price) },
      { title: 'Earn through play', glyph: 'star', items: all.filter((p) => !isOwned(p) && (p.feat || (p.kind === 'role' && !p.price))) },
      { title: 'Unlocked', glyph: 'check', items: all.filter(isOwned).sort((a, b) => Number(a.starter) - Number(b.starter)) },
    ];
    const widgets: Widget[] = [];
    this.rows = [];
    for (const gp of groups) {
      if (!gp.items.length) continue;
      widgets.push(new Heading(`${gp.title} (${gp.items.length})`, gp.glyph));
      for (const p of gp.items) { const r = new PerkRow(p, this); this.rows.push(r); widgets.push(r); }
    }
    if (!widgets.length) widgets.push(new Label('Nothing in this department yet. The content team is still writing the descriptions.', { dim: true }));
    this.list.setItems(widgets);
    for (const w of widgets) w.parent = this.list;
    if (keepIndex >= 0) this.ui.setFocus(this.rows[Math.min(keepIndex, this.rows.length - 1)] ?? this.tabs);
  }

  tryBuy(row: PerkRow): void {
    const p = row.perk;
    if (isOwned(p)) { audio.sfx('ui_error'); row.shake = 0.6; this.statusText = 'Already unlocked. HR cannot find a refund form.'; return; }
    if (p.feat) { audio.sfx('ui_error'); row.shake = 1; this.statusText = `Earn this through play: ${p.feat.label} (${Math.min(p.feat.progress(), p.feat.target)}/${p.feat.target}).`; return; }
    if (p.kind === 'role' && !p.price) { audio.sfx('ui_error'); row.shake = 1; const c = roleCondition(p.role!); this.statusText = `Earned in play: ${c.label} (${Math.min(c.have, c.need)}/${c.need}).`; return; }
    if (profile().annualLeave < p.price) { audio.sfx('ui_error'); row.shake = 1; this.statusText = `You need ${p.price - profile().annualLeave} more days of Annual Leave. Your manager says "work harder".`; return; }
    const idx = this.rows.indexOf(row);
    this.ui.openModal(new ConfirmDialog({
      title: 'Confirm purchase', icon: 'cart', confirmText: `Unlock for ${p.price} days`, cancelText: 'Not today',
      message: `${p.kind === 'role' ? 'Pay the sign-on fee for' : 'Unlock'} ${p.name} for ${p.price} days of Annual Leave? It joins your run pools permanently. Non-refundable.`,
      onConfirm: () => {
        const r = purchase(p);
        if (r.ok) {
          audio.sfx('ui_purchase');
          row.flash = 1;
          notify({ kind: 'good', title: p.name + ' unlocked', body: p.kind === 'role' ? 'Choose it in the car boot.' : 'Added to the run pools.', icon: perkIcon(p), sound: 'ui_unlock', duration: 3.2 });
          this.statusText = `${p.name} unlocked. ${profile().annualLeave} days remaining.`;
          this.rebuild(idx);
        } else { audio.sfx('ui_error'); this.statusText = r.reason; }
      },
    }));
  }

  protected layout(cl: RectL): void {
    const s = uiS(), foot = this.footH();
    const th = rowH() + 6;
    const chipW = measure('ANNUAL LEAVE ') + measure('9999 d') + 22;
    this.chipRect = { x: cl.x + cl.w - chipW - 2, y: cl.y + 2, w: chipW, h: th };
    this.tabs.set(cl.x + 2, cl.y + 2, cl.w - chipW - 10, th);
    this.tabs.tabs.forEach((t, i) => { t.label = TABS[i].label + ' ' + this.counts(TABS[i].kind); });
    const detH = 2 * LINE_H * s + 12;
    this.detailRect = { x: cl.x + 2, y: cl.y + cl.h - foot - detH - 2, w: cl.w - 4, h: detH };
    this.list.set(cl.x + 2, cl.y + th + 6, cl.w - 4, this.detailRect.y - (cl.y + th + 6) - 4);
    this.list.padX = 0;
  }

  protected override tick(dt: number): void { this.shownLeave += (profile().annualLeave - this.shownLeave) * Math.min(1, dt * 8); }

  protected drawBody(g: Ctx, cl: RectL): void {
    const s = uiS();
    // balance chip
    const c = this.chipRect;
    box(g, c.x, c.y, c.w, c.h, { face: '#1d3d2b', cham: 1, depth: 1 });
    drawText(g, 'ANNUAL LEAVE', c.x + 7, c.y + Math.round((c.h - 7) / 2), { color: '#7fbf9a', shadow: null });
    drawText(g, Math.round(this.shownLeave) + ' d', c.x + c.w - 7, c.y + Math.round((c.h - 7) / 2), { color: C.gold, align: 'right', shadow: null });
    // list well
    box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: '#e1ddd0', kind: 'sunken', cham: 0, depth: 1 });
    // detail
    const d = this.detailRect;
    well(g, d.x, d.y, d.w, d.h, '#fbfaf5');
    const f = this.ui.focus;
    if (f instanceof PerkRow) {
      const p = f.perk;
      const st = statusOf(p);
      ink(g, truncate(p.name, d.w - 130, s), d.x + 6, d.y + 4, { scale: s, color: C.navy });
      const rar = p.kind === 'weapon' || p.kind === 'desk' || p.kind === 'benefit' ? RARITY_NAMES[p.rarity] ?? '' : '';
      if (rar) drawText(g, rar.toUpperCase(), d.x + d.w - 6, d.y + 4, { color: colourFor(p.rarity) === '#c9cdd4' ? C.inkDim : colourFor(p.rarity), align: 'right', shadow: null });
      let desc = p.desc;
      if (st.kind === 'feat' && p.feat) desc = `Earn through play: ${p.feat.label}. ${desc}`;
      else if (p.kind === 'role') { const cnd = roleCondition(p.role!); desc = `${cnd.done || isOwned(p) ? 'Unlocked' : 'Unlock: ' + cnd.label}. ${desc}${p.price && !isOwned(p) ? ` Sign-on fee to skip: ${p.price} days.` : ''}`; }
      wrap(desc, d.w - 12, s).slice(0, 2).forEach((l, i) => ink(g, l, d.x + 6, d.y + 4 + (i + 1) * LINE_H * s, { scale: s }));
    } else if (!this.rows.length) ink(g, 'Select a department.', d.x + 6, d.y + 4, { scale: s, color: C.inkDim });
    void cl;
  }
}
