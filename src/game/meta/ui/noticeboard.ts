// Internal Announcements noticeboard (spec 5.6, 7.3): the promoted-enemy roster with portraits, ranks, strengths and
// known weaknesses. Weaknesses stay classified until an HR filing cabinet reveals them in a run.
import { fxRng } from '../../../core/rng';
import { Ctx } from '../../../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../../../render/font';
import { Widget, List, Label } from '../../../ui/widgets';
import { C, box, well, ink, uiS, truncate, RectL } from '../../../ui/style';
import { bakeCharacter } from '../../../art/characters';
import { icon } from '../../../art/items';
import { PROMOTION_RANKS } from '../../../data/ids';
import { MEMOS } from '../../../data/text/memos';
import { PROMOTION_MODE } from '../../flags';
import { profile, PromotedRecord } from '../../profile';
import { PanelScene } from './panel';

const portraits = new Map<string, HTMLCanvasElement>();
function portraitOf(r: PromotedRecord): HTMLCanvasElement {
  let c = portraits.get(r.id);
  if (!c) { try { c = bakeCharacter({ ...r.look, promotedRank: r.rank }).portrait; } catch { c = icon('promotion'); } portraits.set(r.id, c); }
  return c;
}

const METHOD_NAMES: Record<string, string> = { melee: 'melee', heavy: 'heavy attack', ranged: 'ranged fire', throw: 'a throw', body: 'a thrown colleague', hazard: 'a hazard', execution: 'an execution', bleed: 'bleeding', rage: 'rage', fall: 'a fall', breach: 'a breach', other: 'unspecified causes' };

class RosterRow extends Widget {
  constructor(public rec: PromotedRecord) { super(); }
  override layout(): void { this.h = uiS() === 2 ? 70 : 52; }
  override draw(g: Ctx): void {
    const r = this.rec, s = uiS();
    const x = this.x, y = this.y, w = this.w, h = this.h;
    g.fillStyle = this.focused ? '#fff3c4' : r.terminated ? '#dcd8cc' : '#f3f0e6';
    g.fillRect(x, y, w, h - 2);
    if (this.focused) { g.fillStyle = C.amber; g.fillRect(x, y, 3, h - 2); }
    g.fillStyle = C.faceLo; g.fillRect(x, y + h - 2, w, 1);
    // portrait polaroid
    box(g, x + 7, y + 5, 30, 34, { face: '#fffdf6', cham: 0, depth: 1 });
    g.globalAlpha = r.terminated ? 0.5 : 1;
    g.drawImage(portraitOf(r), x + 10, y + 7, 24, 24);
    g.globalAlpha = 1;
    drawText(g, 'RANK ' + r.rank, x + 22, y + 32, { align: 'center', color: C.inkDim, shadow: null });
    const tx = x + 46;
    ink(g, truncate(`${r.title} ${r.name}`.trim(), w - 46 - 90, s), tx, y + 4, { scale: s, color: r.terminated ? C.inkDim : C.navy });
    // rank pips
    const px = x + w - 8 - 4 * 10;
    for (let i = 0; i < 4; i++) { g.fillStyle = C.outline; g.fillRect(px + i * 10, y + 5, 9, 9); g.fillStyle = i < r.rank ? '#d4a537' : '#c4c0b6'; g.fillRect(px + i * 10 + 1, y + 6, 7, 7); }
    drawText(g, PROMOTION_RANKS[Math.max(0, r.rank - 1)] ?? '', x + w - 8, y + 17, { align: 'right', color: C.inkDim, shadow: null });
    const last = r.kills[r.kills.length - 1];
    const l1 = `Strengths: ${r.strengths.length ? r.strengths.join(', ') : 'none recorded'}`;
    const l2 = r.weaknessKnown ? `Weakness: ${r.weakness}` : 'Weakness: classified. Find an HR filing cabinet.';
    const l3 = `Has put you down ${r.kills.length} time${r.kills.length === 1 ? '' : 's'}${last ? `. Last: floor ${last.floor}, ${METHOD_NAMES[last.method] ?? last.method}${last.weapon ? ' (' + last.weapon + ')' : ''}` : ''}.`;
    ink(g, truncate(l1, w - 54), tx, y + 4 + LINE_H * s + 2, { color: C.ink });
    ink(g, truncate(l2, w - 54), tx, y + 4 + LINE_H * (s + 1) + 2, { color: r.weaknessKnown ? '#1d7a3e' : '#8a5a00' });
    ink(g, truncate(l3, w - 54), tx, y + 4 + LINE_H * (s + 2) + 2, { color: C.inkDim });
    if (r.terminated) {
      const sw = measure('TERMINATED', 2) + 12;
      g.save(); g.globalAlpha = 0.85;
      g.fillStyle = '#e04545'; g.fillRect(x + w - sw - 14, y + h - 26, sw, 2); g.fillRect(x + w - sw - 14, y + h - 8, sw, 2); g.fillRect(x + w - sw - 14, y + h - 26, 2, 20); g.fillRect(x + w - 16, y + h - 26, 2, 20);
      drawText(g, 'TERMINATED', x + w - sw / 2 - 14, y + h - 22, { color: '#e04545', scale: 2, align: 'center', shadow: null });
      g.restore();
    }
  }
}

export class NoticeboardPanel extends PanelScene {
  override name = 'noticeboard';
  private list = new List();
  private memo = fxRng.pick(MEMOS);
  private head: RectL = { x: 0, y: 0, w: 0, h: 0 };

  constructor(onClose?: () => void) {
    super({ title: 'Internal Announcements - All Staff', glyph: 'mail', w: 600, h: 350, closeText: 'Walk away', onClose });
    const items: Widget[] = [];
    const roster = profile().promoted.filter((r) => !r.terminated).concat(profile().promoted.filter((r) => r.terminated));
    for (const r of roster) items.push(new RosterRow(r));
    if (!roster.length) {
      items.push(new Label('NO PROMOTIONS THIS QUARTER.', { scale: 2, color: C.navy }));
      items.push(new Label(PROMOTION_MODE === 'light'
        ? 'HR is investigating why nobody has been promoted. Anyone who defeats you in a run is promoted, returns with a title, and appears here. Check back after your next unfortunate incident.'
        : 'Anyone who defeats you is promoted, remembers how, and returns stronger. HR is investigating why nobody has managed it yet. Check back after your next unfortunate incident.', { dim: true }));
    }
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
    this.ui.add(this.list);
    this.finishBuild();
    this.ui.setFocus(items.find((i) => i.focusable) ?? this.closeBtn);
    const active = profile().promoted.filter((r) => !r.terminated).length;
    this.statusText = `${active} active / 10 maximum promoted staff. ${profile().stats.promotedTerminated} terminated to date.`;
  }

  protected layout(cl: RectL): void {
    const s = uiS();
    const hh = 2 * LINE_H * s + 10;
    this.head = { x: cl.x + 2, y: cl.y + 2, w: cl.w - 4, h: hh };
    this.list.set(cl.x + 2, cl.y + hh + 8, cl.w - 4, cl.h - this.footH() - hh - 10);
    this.list.padY = 0;
  }

  protected drawBody(g: Ctx, _cl: RectL): void {
    const s = uiS(), h = this.head;
    // memo banner
    box(g, h.x, h.y, h.w, h.h, { face: '#fffdf6', cham: 1, depth: 1 });
    g.fillStyle = C.navy; g.fillRect(h.x + 3, h.y + 3, 3, h.h - 6);
    drawText(g, 'MEMO OF THE DAY', h.x + 12, h.y + 5, { color: C.navy, shadow: null });
    drawText(g, truncate(this.memo.from, h.w - 130), h.x + h.w - 8, h.y + 5, { color: C.inkDim, align: 'right', shadow: null });
    const body = wrap(this.memo.title + '. ' + this.memo.body, h.w - 24, 1).slice(0, s === 2 ? 2 : 1);
    body.forEach((l, i) => ink(g, truncate(l, h.w - 24), h.x + 12, h.y + 5 + (i + 1) * LINE_H + 1, { color: C.ink }));
    box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: '#e1ddd0', kind: 'sunken', cham: 0, depth: 1 });
    void well;
  }
}
