// Shared list row for the hub's CorpOS windows: label + value, optional icon, sub-line and coloured chips.
import { Ctx } from '../../../render/canvas';
import { drawText, measure, LINE_H } from '../../../render/font';
import { Widget, rowH } from '../../../ui/widgets';
import { C, box, ink, uiS, truncate } from '../../../ui/style';

export interface Chip { text: string; face: string }

export class InfoRow extends Widget {
  constructor(public label: string, public value = '', public o: { sub?: string; icon?: HTMLCanvasElement | null; chips?: Chip[]; dim?: boolean; valueCol?: string; tall?: boolean } = {}) { super(); }
  override layout(): void { const s = uiS(); this.h = this.o.sub || this.o.tall ? (s === 2 ? 38 : 26) : (s === 2 ? 24 : rowH() + 1); }
  override draw(g: Ctx): void {
    const s = uiS(), x = this.x, y = this.y, w = this.w, h = this.h;
    g.fillStyle = this.focused ? '#fff3c4' : this.hovered ? '#f6f2e4' : '#f3f0e6';
    g.fillRect(x, y, w, h - 1);
    if (this.focused) { g.fillStyle = C.amber; g.fillRect(x, y, 3, h - 1); }
    g.fillStyle = C.faceLo; g.fillRect(x, y + h - 1, w, 1);
    let tx = x + 8;
    if (this.o.icon) { g.drawImage(this.o.icon, tx, Math.round(y + (h - 16) / 2)); tx += 22; }
    const col = this.o.dim ? C.inkDim : C.ink;
    const ty = this.o.sub ? y + 3 : Math.round(y + (h - 7 * s) / 2);
    const vw = this.value ? measure(this.value, s) + 12 : 0;
    ink(g, truncate(this.label, w - (tx - x) - vw - 10, s), tx, ty, { scale: s, color: col });
    if (this.value) ink(g, this.value, x + w - 8, ty, { scale: s, align: 'right', color: this.o.valueCol ?? C.navy });
    if (this.o.sub) ink(g, truncate(this.o.sub, w - (tx - x) - 10), tx, ty + LINE_H * s, { color: C.inkDim });
    // chips (right, before value)
    let cx = x + w - 8 - (this.value ? measure(this.value, s) + 10 : 0);
    for (const c of this.o.chips ?? []) {
      const cw = measure(c.text) + 8; cx -= cw + 3;
      box(g, cx, y + 3, cw, 10, { face: c.face, cham: 0, depth: 1 });
      drawText(g, c.text, cx + cw / 2, y + 4, { color: '#fff', align: 'center', shadow: null });
    }
  }
}

