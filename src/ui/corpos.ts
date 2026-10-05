// CorpOS components: windows, desktop, toast notifications, dialogs, popup menus, memo loading card,
// email (benefit choice), intranet catalogue (shop). Slide deck lives in slides.ts and is re-exported here.
import { app, Scene } from '../core/app';
import { audio, SfxName } from '../audio/audio';
import { RARITY_NAMES } from '../art/palette';
import { Ctx, makeCanvas, ctx2d } from '../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../render/font';
import { touch } from './touch';
import {
  C, box, well, ink, textY, truncate, uiS, clamp, inRect, drawGlyph, dim, focusRing, easeOutCubic, easeOutBack, shade, colourFor, stripes, dropShadow, RectL, osIcon,
} from './style';
import {
  Widget, Ui, Button, List, Label, Modal, rowH, btnH, ptr, Hint,
} from './widgets';
import { drawWindow, OpenAnim, popRect, titleBarH, drawDesktop, windowClient } from './window';

export * from './window';
export * from './slides';

/** Anything with update/render that can run inside a scene. */
export interface UiComponent { done: boolean; update(dt: number): void; render(g: Ctx): void }

/** Scene wrapper so any component (EmailView, IntranetPage, SlideDeck, MemoCard...) can be app.push()ed. */
export class UiScene implements Scene {
  name = 'uiscene';
  transparent: boolean;
  private prevMode: 'gameplay' | 'menu' = 'gameplay';
  private closed = false;
  constructor(public comp: UiComponent, o: { transparent?: boolean; autoPop?: boolean; onExit?: () => void } = {}) {
    this.transparent = o.transparent ?? true; this.autoPop = o.autoPop ?? true; this.onExit = o.onExit;
  }
  autoPop: boolean; onExit?: () => void;
  enter(): void { this.prevMode = touch.mode; touch.attach(app.renderer.screen); touch.setContext({ mode: 'menu' }); }
  exit(): void { touch.setContext({ mode: this.prevMode }); this.onExit?.(); }
  update(dt: number): void {
    touch.update();
    this.comp.update(dt);
    if (this.comp.done && !this.closed && this.autoPop) { this.closed = true; app.remove(this); }
  }
  render(): void { this.comp.render(app.renderer.f); }
}

// ===========================================================================
// Notifications (toasts)
export type NotifyKind = 'info' | 'good' | 'warn' | 'bad' | 'boss' | 'mail';
export interface NotifyOpts {
  title: string; body?: string;
  /** a 16x16 icon canvas (icon('warning')) or a CorpOS glyph name ('mail', 'warn'...) */
  icon?: HTMLCanvasElement | string | null;
  kind?: NotifyKind; duration?: number; sound?: SfxName | false; sticky?: boolean; onClick?: () => void; tag?: string;
}
interface Toast { id: number; o: NotifyOpts; w: number; h: number; lines: string[]; age: number; life: number; state: 'in' | 'on' | 'out'; t: number; y: number; r: RectL }

/** Tweak where toasts appear (HUD owners can push them below their corner widgets). */
export const notifyConfig = { topOffset: 0, maxVisible: 4, side: 'right' as 'right' | 'left' };

const toasts: Toast[] = [];
const toastQueue: Toast[] = [];
let toastId = 1;
const KIND: Record<NotifyKind, { col: string; glyph: string; sfx: SfxName }> = {
  info: { col: C.navy, glyph: 'info', sfx: 'ui_notify' },
  good: { col: '#2c8a50', glyph: 'check', sfx: 'ui_notify' },
  warn: { col: '#b57800', glyph: 'warn', sfx: 'ui_notify' },
  bad: { col: '#a82828', glyph: 'skull', sfx: 'ui_error' },
  boss: { col: '#6d1620', glyph: 'warn', sfx: 'ui_notify' },
  mail: { col: '#1c6a7a', glyph: 'mail', sfx: 'ui_email' },
};

function toastWidth(): number { return uiS() === 2 ? 230 : 176; }

export function notify(o: NotifyOpts): number {
  const s = uiS();
  const w = toastWidth();
  const textW = w - 34;
  const lines = o.body ? wrap(o.body, textW, s).slice(0, s === 2 ? 4 : 4) : [];
  const h = (s === 2 ? 22 : 14) + 8 + Math.max(24, lines.length * LINE_H * s + 2) + 6;
  const life = o.sticky ? Infinity : o.duration ?? 4.5;
  const t: Toast = { id: toastId++, o, w, h, lines, age: 0, life, state: 'in', t: 0, y: 0, r: { x: 0, y: 0, w, h } };
  if (o.tag) { // replace an existing toast with the same tag
    const ex = toasts.find((x) => x.o.tag === o.tag);
    if (ex) { ex.o = o; ex.lines = lines; ex.h = h; ex.age = 0; ex.life = life; ex.state = 'on'; ex.t = 1; return ex.id; }
  }
  if (toasts.length >= notifyConfig.maxVisible) toastQueue.push(t); else toasts.push(t);
  if (o.sound !== false) audio.sfx(o.sound ?? KIND[o.kind ?? 'info'].sfx);
  return t.id;
}
export function dismissNotification(id: number): void { const t = toasts.find((x) => x.id === id); if (t && t.state !== 'out') { t.state = 'out'; t.t = 0; } }
export function clearNotifications(): void { toasts.length = 0; toastQueue.length = 0; }

export function updateNotifications(dt: number): void {
  const i = app.input;
  for (const c of i?.clicks ?? []) {
    if (c.button !== 0) continue;
    for (const t of toasts) if (t.state !== 'out' && inRect(t.r, c.x, c.y)) { t.o.onClick?.(); t.state = 'out'; t.t = 0; }
  }
  for (const t of toasts) {
    t.age += dt;
    if (t.state === 'in') { t.t += dt / 0.32; if (t.t >= 1) { t.t = 1; t.state = 'on'; } }
    else if (t.state === 'on') { if (t.age > t.life) { t.state = 'out'; t.t = 0; } }
    else { t.t += dt / 0.24; }
  }
  for (let k = toasts.length - 1; k >= 0; k--) if (toasts[k].state === 'out' && toasts[k].t >= 1) toasts.splice(k, 1);
  while (toastQueue.length && toasts.length < notifyConfig.maxVisible) toasts.push(toastQueue.shift()!);
}

export function renderNotifications(g: Ctx): void {
  if (!toasts.length) return;
  const r = app.renderer;
  const s = uiS();
  const right = notifyConfig.side === 'right';
  let y = r.safe.t + 6 + notifyConfig.topOffset;
  for (const t of toasts) {
    // smooth stacking
    if (t.y === 0 && t.state === 'in' && t.t < 0.05) t.y = y;
    t.y += (y - t.y) * 0.25;
    const ty = Math.round(t.y);
    let off = 0;
    if (t.state === 'in') off = (1 - easeOutBack(t.t)) * (t.w + 12);
    else if (t.state === 'out') off = easeOutCubic(t.t) * (t.w + 12);
    const x = right ? Math.round(r.W - r.safe.r - 6 - t.w + off) : Math.round(r.safe.l + 6 - off);
    t.r = { x, y: ty, w: t.w, h: t.h };
    drawToast(g, t, x, ty, s);
    y += t.h + 4;
  }
}

function drawToast(g: Ctx, t: Toast, x: number, y: number, s: number): void {
  const k = KIND[t.o.kind ?? 'info'];
  dropShadow(g, x, y, t.w, t.h, 3);
  box(g, x, y, t.w, t.h, { face: C.face, cham: 1, depth: 2 });
  const sh = s === 2 ? 22 : 14;
  g.fillStyle = k.col; g.fillRect(x + 3, y + 3, t.w - 6, sh - 2);
  if (t.o.kind === 'boss') stripes(g, x + 3, y + 3, t.w - 6, sh - 2, k.col, shade(k.col, 0.2), 3);
  g.fillStyle = shade(k.col, 0.35); g.fillRect(x + 3, y + 3, t.w - 6, 1);
  drawText(g, truncate(t.o.title, t.w - 30, s), x + 8, y + 3 + Math.round((sh - 2 - 7 * s) / 2), { color: '#fff', scale: s, shadow: 'rgba(0,0,0,0.55)' });
  drawGlyph(g, 'close', x + t.w - 9, y + 3 + (sh - 2) / 2, 'rgba(255,255,255,0.7)', 1);
  // icon well
  const iy = y + sh + 5;
  well(g, x + 6, iy, 22, 22, '#fbfaf5');
  if (typeof t.o.icon === 'string') drawGlyph(g, t.o.icon, x + 17, iy + 11, k.col, 1);
  else if (t.o.icon) g.drawImage(t.o.icon, x + 9, iy + 3, 16, 16);
  else drawGlyph(g, k.glyph, x + 17, iy + 11, k.col, 1);
  t.lines.forEach((l, i) => ink(g, l, x + 32, iy + i * LINE_H * s, { scale: s }));
  // life bar
  if (isFinite(t.life) && t.state === 'on') {
    const f = clamp(1 - t.age / t.life, 0, 1);
    g.fillStyle = C.faceLo; g.fillRect(x + 4, y + t.h - 5, t.w - 8, 2);
    g.fillStyle = k.col; g.fillRect(x + 4, y + t.h - 5, Math.round((t.w - 8) * f), 2);
  }
}

// ===========================================================================
// Dialogs
export interface ConfirmOpts {
  title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean; icon?: string;
  onConfirm?: () => void; onCancel?: () => void; /** only an OK button */ single?: boolean;
}

export class ConfirmDialog implements Modal {
  done = false;
  ui: Ui;
  private anim = new OpenAnim(9);
  private lines: string[] = [];
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private ok: Button; private cancel: Button | null = null;
  constructor(public o: ConfirmOpts) {
    this.ui = new Ui({ onBack: () => this.finish(false) });
    this.ok = this.ui.add(new Button({ text: o.confirmText ?? (o.single ? 'OK' : 'Yes'), kind: o.danger ? 'danger' : 'primary', onPress: () => this.finish(true), sound: o.danger ? 'ui_select' : 'ui_select' }));
    if (!o.single) this.cancel = this.ui.add(new Button({ text: o.cancelText ?? 'Cancel', onPress: () => this.finish(false), sound: 'ui_back' }));
    this.ui.setFocus(o.danger && this.cancel ? this.cancel : this.ok);
    audio.sfx(o.danger ? 'ui_error' : 'ui_notify');
  }
  private finish(yes: boolean): void { if (this.done) return; this.done = true; if (yes) this.o.onConfirm?.(); else this.o.onCancel?.(); }
  update(dt: number): void {
    this.anim.step(dt);
    const r = app.renderer, s = uiS();
    const w = Math.min(r.W - 24, s === 2 ? 440 : 340);
    this.lines = wrap(this.o.message, w - 62, s);
    const th = titleBarH();
    const bh = btnH();
    const bodyH = Math.max(34, this.lines.length * LINE_H * s + 6);
    const h = th + 10 + bodyH + bh + 18;
    this.win = { x: Math.round((r.W - w) / 2), y: Math.round((r.H - h) / 2), w, h };
    const bw = Math.min(110 * s, Math.floor((w - 40) / (this.cancel ? 2 : 1)));
    const by = this.win.y + h - bh - 9;
    if (this.cancel) { this.ok.set(this.win.x + w / 2 - bw - 4, by, bw, bh); this.cancel.set(this.win.x + w / 2 + 4, by, bw, bh); }
    else this.ok.set(this.win.x + (w - bw) / 2, by, bw, bh);
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    dim(g, 0.55 * this.anim.t);
    const full = this.win;
    const rr = this.anim.done ? full : popRect(full, this.anim.t);
    const danger = !!this.o.danger;
    drawWindow(g, this.o.title, rr, { icon: danger ? 'warn' : this.o.icon ?? 'info', tint: danger ? '#8a2020' : undefined, close: false });
    if (!this.anim.done) return;
    const s = uiS();
    const x = full.x, y = full.y + titleBarH() + 8;
    box(g, x + 12, y + 2, 28, 28, { face: danger ? '#ffe3a0' : '#dbe8f4', cham: 1, depth: 1 });
    drawGlyph(g, danger ? 'warn' : this.o.icon ?? 'info', x + 26, y + 16, danger ? '#a45c00' : C.navy, 2);
    this.lines.forEach((l, i) => ink(g, l, x + 50, y + 2 + i * LINE_H * s, { scale: s }));
    this.ui.render(g);
    this.ui.drawHints(g, full.x + 8, full.y + full.h + 5, full.w - 16, undefined, 'center', true);
    this.ui.drawCursor(g);
  }
}

export interface PopupItem { label: string; glyph?: string; onPick: () => void; disabled?: boolean }
export class PopupMenu implements Modal {
  done = false;
  ui: Ui;
  private anim = new OpenAnim(10);
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private btns: Button[] = [];
  constructor(public o: { title?: string; items: PopupItem[]; x?: number; y?: number }) {
    this.ui = new Ui({ onBack: () => { this.done = true; } });
    this.btns = o.items.map((it) => this.ui.add(new Button({ text: it.label, glyph: it.glyph, align: 'left', kind: 'flat', onPress: () => { this.done = true; it.onPick(); } })));
    o.items.forEach((it, i) => { this.btns[i].enabled = !it.disabled; });
    this.ui.setFocus(this.btns.find((b) => b.enabled) ?? null);
    audio.sfx('ui_select');
  }
  update(dt: number): void {
    this.anim.step(dt);
    const r = app.renderer, s = uiS();
    const bh = btnH();
    const w = Math.min(r.W - 20, Math.max(...this.btns.map((b) => b.autoW(10)), measure(this.o.title ?? '', s) + 40, 120));
    const th = this.o.title ? titleBarH() + 4 : 4;
    const h = th + this.btns.length * (bh + 1) + 8;
    const x = this.o.x !== undefined ? clamp(this.o.x, 6, r.W - w - 6) : Math.round((r.W - w) / 2);
    const y = this.o.y !== undefined ? clamp(this.o.y, 6, r.H - h - 6) : Math.round((r.H - h) / 2);
    this.win = { x, y, w, h };
    this.btns.forEach((b, i) => b.set(x + 5, y + th + 2 + i * (bh + 1), w - 10, bh));
    // tap outside closes
    for (const c of app.input.clicks) if (c.button === 0 && !inRect(this.win, c.x, c.y)) { this.done = true; audio.sfx('ui_back'); }
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    dim(g, 0.35 * this.anim.t);
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    if (this.o.title) drawWindow(g, this.o.title, rr, { close: false, icon: 'folder' });
    else { dropShadow(g, rr.x, rr.y, rr.w, rr.h); box(g, rr.x, rr.y, rr.w, rr.h, { cham: 2 }); }
    if (!this.anim.done) return;
    this.ui.render(g);
    this.ui.drawCursor(g);
  }
}

// ===========================================================================
// Memo card (loading screen)
export interface MemoOpts {
  to?: string; from?: string; subject?: string; body: string; progress?: number | null; stamp?: string; footer?: string; typeSpeed?: number;
}
export const MEMO_TIPS_FALLBACK = [
  'Please remember that the fire exits are for emergencies only. The window is not a fire exit. Management has asked us to stop calling it that.',
  'Productivity is up 3%. Morale is not on the agenda.',
  'Reminder: personal grievances should be raised via the Grievance Portal, which is currently offline for maintenance.',
];

export class MemoCard implements UiComponent {
  done = false;
  private t = 0;
  progress: number | null;
  constructor(public o: MemoOpts) { this.progress = o.progress ?? null; }
  setProgress(p: number | null): void { this.progress = p; }
  setBody(body: string): void { this.o = { ...this.o, body }; this.t = 0; }
  update(dt: number): void { this.t += dt; }
  render(g: Ctx): void { this.draw(g, true); }
  /** Draw the memo (optionally with a desktop backdrop). */
  draw(g: Ctx, backdrop = false): void {
    const r = app.renderer, s = uiS();
    if (backdrop) { drawDesktop(g, 'slate'); }
    const w = Math.min(r.W - r.safe.l - r.safe.r - 40, s === 2 ? 480 : 400);
    const bodyLines = wrap(this.o.body, w - 36, s);
    const fh = LINE_H * s + 3;
    const h = 14 + 22 + fh * 3 + 10 + bodyLines.length * LINE_H * s + 12 + (this.progress !== null ? 26 : 8) + (this.o.footer ? LINE_H + 4 : 0);
    const x = Math.round((r.W - w) / 2), y = Math.round((r.H - h) / 2) - 6;
    const open = easeOutBack(clamp(this.t * 5, 0, 1));
    const yy = y + Math.round((1 - open) * 14);
    g.globalAlpha = clamp(this.t * 6, 0, 1);
    dropShadow(g, x, yy, w, h, 4);
    // paper
    g.fillStyle = C.outline; g.fillRect(x - 1, yy - 1, w + 2, h + 2);
    g.fillStyle = '#f4efd8'; g.fillRect(x, yy, w, h);
    g.fillStyle = '#ddd6b6'; g.fillRect(x, yy + h - 2, w, 2); g.fillRect(x + w - 2, yy, 2, h);
    // punch holes
    for (const hy of [yy + 28, yy + h - 34]) { g.fillStyle = '#2a2d3a'; g.fillRect(x + 6, hy, 6, 6); g.fillStyle = '#4b4f60'; g.fillRect(x + 6, hy, 6, 1); }
    // header band
    g.fillStyle = C.navy; g.fillRect(x + 18, yy + 8, w - 26, 14);
    stripes(g, x + w - 90, yy + 8, 82, 14, C.navy, C.navyHi, 2);
    drawText(g, 'INTERNAL MEMO', x + 24, yy + 11, { color: '#fff', scale: 1 });
    drawText(g, 'REF: ' + String(((this.o.body.length * 7919) % 9000) + 1000), x + w - 14, yy + 11, { color: C.gold, align: 'right', shadow: null });
    let cy = yy + 28;
    const field = (k: string, v: string) => {
      ink(g, k, x + 22, cy, { color: C.inkDim, scale: s });
      ink(g, v, x + 22 + 46 * s, cy, { scale: s });
      g.fillStyle = '#c9c3a3'; g.fillRect(x + 22, cy + 8 * s + 2, w - 40, 1);
      cy += fh;
    };
    field('TO:', this.o.to ?? 'All Staff');
    field('FROM:', this.o.from ?? 'Office of Internal Communications');
    field('RE:', this.o.subject ?? 'Important Notice');
    cy += 6;
    // typed body
    const speed = this.o.typeSpeed ?? 70;
    let n = Math.floor(this.t * speed);
    for (let i = 0; i < bodyLines.length; i++) {
      const l = bodyLines[i].slice(0, Math.max(0, n));
      n -= bodyLines[i].length + 1;
      if (l) ink(g, l, x + 22, cy + i * LINE_H * s, { scale: s });
    }
    cy += bodyLines.length * LINE_H * s + 8;
    if (this.progress !== null) {
      const bw = w - 44, p = clamp(this.progress, 0, 1);
      ink(g, 'FORM COMPLETION', x + 22, cy, { color: C.inkDim });
      ink(g, Math.round(p * 100) + '%', x + 22 + bw, cy, { align: 'right', color: C.inkDim });
      well(g, x + 22, cy + 11, bw, 9, '#fbfaf5');
      const cells = Math.floor((bw - 4) / 6);
      for (let k = 0; k < Math.round(cells * p); k++) { g.fillStyle = C.navyHi; g.fillRect(x + 24 + k * 6, cy + 13, 5, 5); g.fillStyle = shade(C.navyHi, 0.4); g.fillRect(x + 24 + k * 6, cy + 13, 5, 1); }
    }
    if (this.o.footer) ink(g, this.o.footer, x + w / 2, yy + h - 14, { color: C.inkDim, align: 'center' });
    // stamp
    if (this.o.stamp) {
      const sw = measure(this.o.stamp, 2) + 12;
      const sx = x + w - sw - 14, sy = yy + 56;
      const a = clamp((this.t - 0.6) * 6, 0, 1);
      g.globalAlpha = 0.75 * a;
      g.fillStyle = '#b5322e';
      g.fillRect(sx, sy, sw, 2); g.fillRect(sx, sy + 20, sw, 2); g.fillRect(sx, sy, 2, 22); g.fillRect(sx + sw - 2, sy, 2, 22);
      drawText(g, this.o.stamp, sx + sw / 2, sy + 4, { color: '#b5322e', scale: 2, align: 'center', shadow: null });
    }
    g.globalAlpha = 1;
  }
}

// ===========================================================================
// Email view (benefit choice)
export interface EmailAttachment {
  icon?: HTMLCanvasElement | null; title: string; subtitle?: string; desc: string; rarity?: number | string; tag?: string;
}
export interface EmailOpts {
  from: string; to?: string; subject?: string; body: string; attachments: EmailAttachment[];
  onPick: (i: number) => void; onClose?: () => void; allowSkip?: boolean; skipLabel?: string; date?: string;
  backdrop?: 'dim' | 'desktop' | 'none'; title?: string; typeSpeed?: number; pickDelay?: number;
}

class AttachmentCard extends Widget {
  appear = 0;
  lift = 0;
  constructor(public a: EmailAttachment, public idx: number, public owner: EmailView) { super(); }
  override activate(): void { this.press = 1; this.owner.pick(this.idx); }
  override update(dt: number, ui: Ui): void {
    super.update(dt, ui);
    this.lift += ((this.focused ? 1 : 0) - this.lift) * Math.min(1, dt * 14);
  }
  override draw(g: Ctx): void {
    const o = this.owner, s = uiS();
    const ap = easeOutCubic(this.appear);
    if (ap <= 0.01) return;
    const picked = o.picked === this.idx;
    const faded = o.picked >= 0 && !picked;
    const yoff = Math.round((1 - ap) * 18 - this.lift * 3);
    const x = this.x, y = this.y + yoff, w = this.w, h = this.h;
    g.globalAlpha = ap * (faded ? 0.35 : 1);
    const rar = colourFor(this.a.rarity);
    dropShadow(g, x, y, w, h, this.focused ? 4 : 2);
    box(g, x, y, w, h, { face: this.focused ? '#fffaf0' : '#f1eee6', cham: 1, depth: 2, kind: this.press > 0.35 ? 'sunken' : 'raised' });
    // rarity band
    const bh = 11;
    g.fillStyle = rar; g.fillRect(x + 3, y + 3, w - 6, bh);
    g.fillStyle = shade(rar, 0.5); g.fillRect(x + 3, y + 3, w - 6, 1);
    const rn = typeof this.a.rarity === 'number' ? RARITY_NAMES[clamp(this.a.rarity, 0, 2)] : '';
    drawText(g, (rn || ' ').toUpperCase(), x + 7, y + 5, { color: C.outline, shadow: null });
    if (this.a.tag) {
      const tw = measure(this.a.tag) + 6;
      box(g, x + w - tw - 5, y + 4, tw, 9, { face: C.navy, cham: 0, depth: 1 });
      drawText(g, this.a.tag, x + w - tw - 2, y + 5, { color: C.gold, shadow: null });
    }
    // icon preview
    const iy = y + bh + 7;
    const ib = 36;
    well(g, x + 8, iy, ib, ib, shade(rar, 0.82));
    g.fillStyle = rar; g.globalAlpha = ap * (faded ? 0.35 : 1) * 0.35; g.fillRect(x + 9, iy + ib - 5, ib - 2, 4); g.globalAlpha = ap * (faded ? 0.35 : 1);
    if (this.a.icon) {
      const sc = Math.max(1, Math.floor((ib - 4) / Math.max(this.a.icon.width, this.a.icon.height)));
      const iw = this.a.icon.width * sc, ih = this.a.icon.height * sc;
      g.drawImage(this.a.icon, Math.round(x + 8 + (ib - iw) / 2), Math.round(iy + (ib - ih) / 2), iw, ih);
    }
    const tx = x + 8 + ib + 6, tw = w - (tx - x) - 6;
    let ts = s;
    let tl = wrap(this.a.title, tw, ts);
    if (tl.length > 2 && ts > 1) { ts = 1; tl = wrap(this.a.title, tw, 1); }
    tl = tl.slice(0, 3);
    tl.forEach((l, i) => ink(g, l, tx, iy + 1 + i * LINE_H * ts, { scale: ts, color: C.ink }));
    const sy = iy + 1 + tl.length * LINE_H * ts + 1;
    if (this.a.subtitle) wrap(this.a.subtitle, tw, 1).slice(0, 2).forEach((l, i) => ink(g, l, tx, sy + i * LINE_H, { color: C.inkDim }));
    // description
    const dy = iy + ib + 6;
    if (o.descInCard) {
      g.fillStyle = C.faceLo; g.fillRect(x + 8, dy - 3, w - 16, 1);
      const dl = wrap(this.a.desc, w - 18, 1);
      const maxL = Math.max(1, Math.floor((y + h - 6 - dy) / LINE_H));
      dl.slice(0, maxL).forEach((l, i) => {
        const last = i === maxL - 1 && dl.length > maxL;
        ink(g, last ? truncate(l + '…', w - 18) : l, x + 9, dy + i * LINE_H, { color: '#3a3a42' });
      });
    }
    if (picked) {
      // ACCEPTED stamp slam
      const k = clamp(o.pickT / 0.18, 0, 1);
      const sc = 3 - k;
      const label = 'ACCEPTED';
      const sw = measure(label, 2) + 12;
      const sx = Math.round(x + w / 2 - sw / 2), sy2 = Math.round(y + h / 2 - 11 * (sc > 2.5 ? 1 : 1));
      g.globalAlpha = Math.min(1, k * 1.5);
      g.fillStyle = '#1d7a3e'; g.fillRect(sx, sy2, sw, 2); g.fillRect(sx, sy2 + 20, sw, 2); g.fillRect(sx, sy2, 2, 22); g.fillRect(sx + sw - 2, sy2, 2, 22);
      g.fillStyle = 'rgba(244,239,216,0.85)'; g.fillRect(sx + 2, sy2 + 2, sw - 4, 18);
      drawText(g, label, sx + sw / 2, sy2 + 4, { color: '#1d7a3e', scale: 2, align: 'center', shadow: null });
    }
    g.globalAlpha = 1;
    if (this.focused && !faded) focusRing(g, x, y, w, h, 2);
  }
}

export class EmailView implements UiComponent {
  done = false;
  ui: Ui;
  picked = -1;
  pickT = 0;
  descInCard = true;
  private t = 0;
  private anim = new OpenAnim(7);
  private cards: AttachmentCard[] = [];
  private skip: Button | null = null;
  private bodyList = new List();
  private bodyLabel: Label;
  private bodyFull: string;
  private typed = 0;
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private lastTick = 0;
  constructor(public o: EmailOpts) {
    this.bodyFull = o.body;
    this.ui = new Ui({ onBack: o.allowSkip ? () => this.skipNow() : undefined });
    this.bodyLabel = new Label('');
    this.bodyList.add(this.bodyLabel);
    this.ui.add(this.bodyList);
    this.cards = o.attachments.map((a, i) => this.ui.add(new AttachmentCard(a, i, this)));
    if (o.allowSkip) this.skip = this.ui.add(new Button({ text: o.skipLabel ?? 'Decline benefits', onPress: () => this.skipNow(), sound: 'ui_back' }));
    this.ui.setFocus(this.cards[0] ?? null);
    audio.sfx('ui_email');
  }
  private skipNow(): void { if (this.picked >= 0 || this.done) return; this.done = true; this.o.onClose?.(); }
  pick(i: number): void {
    if (this.picked >= 0 || this.t < 0.4) return;
    this.picked = i; this.pickT = 0;
    audio.sfx('ui_purchase');
  }
  update(dt: number): void {
    this.t += dt;
    this.anim.step(dt);
    const r = app.renderer, s = uiS();
    // typed body
    const speed = this.o.typeSpeed ?? 140;
    if (this.anim.done && this.typed < this.bodyFull.length) {
      this.typed = Math.min(this.bodyFull.length, this.typed + speed * dt);
      if (app.input.pressed('confirm') || app.input.clicks.length) this.typed = this.bodyFull.length;
      if (this.t - this.lastTick > 0.07 && this.typed < this.bodyFull.length) { this.lastTick = this.t; audio.sfx('ui_typing', { vol: 0.4 }); }
    }
    const bodyDone = this.typed >= this.bodyFull.length;
    this.bodyLabel.text = this.bodyFull.slice(0, Math.floor(this.typed));
    // geometry
    const aw = r.W - r.safe.l - r.safe.r, ah = r.H - r.safe.t - r.safe.b;
    const ww = Math.min(aw - 12, 620), wh = Math.min(ah - 8, 348);
    this.win = { x: Math.round(r.safe.l + (aw - ww) / 2), y: Math.round(r.safe.t + (ah - wh) / 2), w: ww, h: wh };
    const cl = windowClient(this.win, true);
    const lh = (s === 2 ? 20 : 11);
    const hdrLines = s === 2 ? 2 : 3;
    const hdrH = hdrLines * lh + 8;
    const footH = btnH() + 10;
    const nC = this.cards.length;
    const labH = 17;
    // card layout
    const rowsC = nC > 3 && s === 1 ? 2 : 1;
    const perRow = Math.ceil(nC / rowsC);
    this.descInCard = s === 1 && (cl.w - 16) / perRow >= 150;
    const capH = this.descInCard ? 132 : s === 2 ? 84 : 84;
    const previewH = this.descInCard ? 0 : (s === 2 ? 2 : 3) * LINE_H * s + 10;
    const gap = 6;
    let ch = capH;
    let bodyH = cl.h - hdrH - footH - labH - previewH - rowsC * ch - (rowsC - 1) * gap - 14;
    if (bodyH < 28) { ch = Math.max(60, ch - (28 - bodyH) / rowsC); bodyH = 28; }
    bodyH = Math.min(bodyH, 90 * s);
    this.bodyList.set(cl.x + 8, cl.y + hdrH + 4, cl.w - 16, bodyH);
    this.bodyLabel.opts = { scale: s };
    const cardsTop = cl.y + hdrH + 4 + bodyH + 6 + labH;
    const cw = Math.floor((cl.w - 16 - gap * (perRow - 1)) / perRow);
    ch = Math.floor(ch);
    this.cards.forEach((c, i) => {
      const rr = Math.floor(i / perRow), cc = i % perRow;
      const inRow = rr === rowsC - 1 && nC % perRow ? nC % perRow : perRow;
      const rowW = inRow * cw + (inRow - 1) * gap;
      const x0 = cl.x + 8 + Math.floor((cl.w - 16 - rowW) / 2);
      c.set(x0 + cc * (cw + gap), cardsTop + rr * (ch + gap), cw, ch);
    });
    if (bodyDone) this.cards.forEach((c, i) => { c.appear = clamp((this.t - this.bodyDoneAt() - i * 0.12) / 0.3, 0, 1); });
    else this.cards.forEach((c) => { c.appear = 0; });
    if (this.skip) { const sw = this.skip.autoW(10); this.skip.set(cl.x + 8, cl.y + cl.h - footH + 3, sw, btnH()); }
    // after pick: finish
    if (this.picked >= 0) {
      this.pickT += dt;
      if (this.pickT > (this.o.pickDelay ?? 0.55) && !this.done) { this.done = true; this.o.onPick(this.picked); }
      return;
    }
    // sticky cards disabled until revealed
    for (const c of this.cards) c.enabled = bodyDone && c.appear > 0.5;
    if (!bodyDone) { /* keep input from navigating hidden cards */ this.ui.focus && this.ui.setFocus(null); return; }
    if (!this.ui.focus) this.ui.setFocus(this.cards[0] ?? null);
    // pad stick scrolls the body
    const st = app.input.stickAim();
    if (st && Math.abs(st.y) > 0.4) this.bodyList.wheel(Math.sign(st.y) * 0.25);
    this.ui.update(dt);
  }
  private doneAt = -1;
  private bodyDoneAt(): number { if (this.doneAt < 0) this.doneAt = this.t; return this.doneAt; }
  render(g: Ctx): void {
    const r = app.renderer, s = uiS();
    const bd = this.o.backdrop ?? 'dim';
    if (bd === 'dim') dim(g, 0.6 * easeOutCubic(this.anim.t));
    else if (bd === 'desktop') drawDesktop(g, 'teal');
    const full = this.win;
    const rr = this.anim.done ? full : popRect(full, this.anim.t);
    const unread = this.picked < 0;
    const res = drawWindow(g, this.o.title ?? 'Inbox - 1 unread message', rr, { icon: 'mail', status: unread ? 'Priority: HIGH  |  Mandatory reading' : 'Benefit accepted. Thank you for your compliance.', close: !!this.o.allowSkip });
    if (!this.anim.done) return;
    const cl = res.client;
    const lh = s === 2 ? 20 : 11;
    // header paper
    const hdrLines = s === 2 ? 2 : 3;
    const hdrH = hdrLines * lh + 8;
    well(g, cl.x + 2, cl.y, cl.w - 4, hdrH, '#fbfaf5');
    const rows: [string, string][] = [['From:', this.o.from]];
    if (s === 1) rows.push(['To:', this.o.to ?? 'You (Employee #0451)']);
    rows.push(['Subject:', this.o.subject ?? 'Re: Your Benefits Package']);
    const lw = measure('Subject:', s) + 8;
    rows.forEach(([k, v], i) => {
      const yy = cl.y + 4 + i * lh;
      ink(g, k, cl.x + 10, yy, { scale: s, color: C.inkDim });
      ink(g, truncate(v, cl.w - lw - 120, s), cl.x + 10 + lw, yy, { scale: s, color: i === rows.length - 1 ? C.navy : C.ink });
    });
    // received stamp (top-right)
    const dt = this.o.date ?? 'Today 09:00';
    ink(g, dt, cl.x + cl.w - 10, cl.y + 4, { align: 'right', color: C.inkDim });
    if (unread) { box(g, cl.x + cl.w - 56, cl.y + 4 + 11, 46, 11, { face: '#d9534a', cham: 0, depth: 1 }); drawText(g, 'URGENT', cl.x + cl.w - 33, cl.y + 4 + 13, { color: '#fff', align: 'center', shadow: null }); }
    // body list background
    const bl = this.bodyList;
    g.fillStyle = '#fffdf6'; g.fillRect(bl.x - 4, bl.y - 2, bl.w + 8, bl.h + 4);
    g.fillStyle = C.faceLo; g.fillRect(bl.x - 4, bl.y + bl.h + 2, bl.w + 8, 1);
    this.ui.render(g);
    // attachments label
    const cardsTop = this.cards[0] ? this.cards[0].y : cl.y + 100;
    const bodyDone = this.typed >= this.bodyFull.length;
    if (bodyDone) {
      drawGlyph(g, 'doc', cl.x + 14, cardsTop - 17 + 5, C.navy, 1);
      ink(g, `${this.cards.length} attachment${this.cards.length === 1 ? '' : 's'}  -  choose one`, cl.x + 24, cardsTop - 17 + 1, { color: C.navy });
    }
    // preview pane for compact layouts
    if (!this.descInCard && bodyDone) {
      const f = this.ui.focus as AttachmentCard | null;
      if (f instanceof AttachmentCard) {
        const pl = s === 2 ? 2 : 3;
        const py = cl.y + cl.h - (btnH() + 10) - (pl * LINE_H * s + 8);
        well(g, cl.x + 8, py, cl.w - 16, pl * LINE_H * s + 8, '#fbfaf5');
        wrap(f.a.desc, cl.w - 32, s).slice(0, pl).forEach((l, i) => ink(g, l, cl.x + 14, py + 4 + i * LINE_H * s, { scale: s }));
      }
    }
    // footer
    this.ui.drawHints(g, cl.x + 8, cl.y + cl.h - btnH() - 10 + 3 + Math.round((btnH() - 9 * s) / 2), cl.w - 16, this.picked >= 0 ? [] : [{ action: 'confirm', text: 'Accept attachment' }, ...(this.o.allowSkip ? [{ action: 'back', text: 'Decline' } as Hint] : [])], 'right');
    if (bodyDone && this.picked < 0) void 0;
    this.ui.drawCursor(g);

  }
}

// ===========================================================================
// Intranet catalogue (shop)
export interface Product {
  id?: string; icon?: HTMLCanvasElement | null; name: string; desc: string; price: number; soldOut?: boolean; tag?: string; rarity?: number | string;
}
export interface IntranetOpts {
  title?: string; products: Product[]; cash: number; onBuy: (i: number) => boolean | void; onClose?: () => void;
  currency?: string; backdrop?: 'dim' | 'desktop' | 'none'; url?: string; ticker?: string;
}

class ProductCard extends Widget {
  shake = 0; flash = 0; lift = 0;
  constructor(public idx: number, public owner: IntranetPage) { super(); }
  get p(): Product { return this.owner.o.products[this.idx]; }
  override activate(): void { this.press = 1; this.owner.buy(this.idx); }
  override update(dt: number, ui: Ui): void {
    super.update(dt, ui);
    this.shake = Math.max(0, this.shake - dt * 5); this.flash = Math.max(0, this.flash - dt * 3);
    this.lift += ((this.focused ? 1 : 0) - this.lift) * Math.min(1, dt * 14);
  }
  override draw(g: Ctx): void {
    const o = this.owner, p = this.p, s = uiS();
    const afford = o.o.cash >= p.price;
    const sold = !!p.soldOut;
    const dx = this.shake > 0 ? Math.round(Math.sin(this.shake * 40) * 3 * this.shake) : 0;
    const x = this.x + dx, y = this.y - Math.round(this.lift * 2), w = this.w, h = this.h;
    dropShadow(g, x, y, w, h, 2);
    box(g, x, y, w, h, { face: sold ? '#d4d0c6' : this.focused ? '#fffaf0' : '#f4f1e8', cham: 1, depth: 2, kind: this.press > 0.35 ? 'sunken' : 'raised' });
    const ib = Math.min(36, h - 40);
    const rar = colourFor(p.rarity);
    well(g, x + Math.round((w - ib) / 2), y + 5, ib, ib, sold ? '#b9b5aa' : shade(rar, 0.8));
    if (p.icon) {
      const sc = Math.max(1, Math.floor((ib - 4) / Math.max(p.icon.width, p.icon.height)));
      g.globalAlpha = sold ? 0.45 : 1;
      g.drawImage(p.icon, Math.round(x + (w - p.icon.width * sc) / 2), Math.round(y + 5 + (ib - p.icon.height * sc) / 2), p.icon.width * sc, p.icon.height * sc);
      g.globalAlpha = 1;
    }
    if (p.tag) { const tw = measure(p.tag) + 6; box(g, x + w - tw - 3, y + 3, tw, 9, { face: C.navy, cham: 0, depth: 1 }); drawText(g, p.tag, x + w - tw, y + 4, { color: C.gold, shadow: null }); }
    const nl = wrap(p.name, w - 8, s).slice(0, 2);
    nl.forEach((l, i) => ink(g, l, x + w / 2, y + ib + 9 + i * LINE_H * s, { scale: s, align: 'center', color: sold ? C.faceDark : C.ink }));
    // price chip
    const label = sold ? 'SOLD OUT' : o.fmt(p.price);
    const pw = Math.min(w - 10, measure(label, s) + 12);
    const py = y + h - 5 - 11 * s - 2;
    box(g, x + Math.round((w - pw) / 2), py, pw, 11 * s + 2, { face: sold ? C.faceDark : afford ? '#2c8a50' : '#a82828', cham: 1, depth: 1 });
    drawText(g, label, x + w / 2, py + 2 + Math.round((11 * s - 7 * s) / 2) - (s === 1 ? 0 : 0), { color: '#fff', scale: s, align: 'center', shadow: 'rgba(0,0,0,0.4)' });
    if (sold) {
      g.globalAlpha = 0.9;
      g.fillStyle = '#a82828'; g.fillRect(x + 4, y + Math.round(ib / 2) + 1, w - 8, 11);
      drawText(g, 'SOLD OUT', x + w / 2, y + Math.round(ib / 2) + 3, { color: '#fff', align: 'center', shadow: null });
      g.globalAlpha = 1;
    }
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`; g.fillRect(x + 2, y + 2, w - 4, h - 4); }
    if (this.focused) focusRing(g, x, y, w, h, 2);
  }
}

export class IntranetPage implements UiComponent {
  done = false;
  ui: Ui;
  private anim = new OpenAnim(7);
  private cards: ProductCard[] = [];
  private grid = new List();
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private msg = ''; private msgT = 0; private msgBad = false;
  private t = 0;
  private cashShown: number;
  private closeBtn: Button;
  constructor(public o: IntranetOpts) {
    this.ui = new Ui({ onBack: () => this.close() });
    this.ui.add(this.grid);
    this.rebuild();
    this.cashShown = o.cash;
    this.closeBtn = this.ui.add(new Button({ text: 'Leave canteen', onPress: () => this.close(), sound: 'ui_back' }));
    this.ui.setFocus(this.cards[0] ?? null);
    audio.sfx('ui_login');
  }
  fmt(n: number): string { return (this.o.currency ?? '£') + n; }
  private rebuild(): void {
    this.cards = this.o.products.map((_, i) => new ProductCard(i, this));
    this.grid.setItems([]);
  }
  /** Replace stock/cash after a purchase (keeps focus index). */
  setProducts(p: Product[]): void {
    this.o.products = p;
    if (this.cards.length !== p.length) { const f = this.cards.indexOf(this.ui.focus as ProductCard); this.rebuild(); this.ui.setFocus(this.cards[Math.max(0, f)] ?? null); }
  }
  setCash(c: number): void { this.o.cash = c; }
  private close(): void { if (this.done) return; this.done = true; this.o.onClose?.(); }
  buy(i: number): void {
    const p = this.o.products[i], card = this.cards[i];
    if (p.soldOut) { audio.sfx('ui_error'); card.shake = 1; this.say('Out of stock. Management regrets nothing.', true); return; }
    if (this.o.cash < p.price) { audio.sfx('ui_error'); card.shake = 1; this.say('Insufficient petty cash. Please see Finance.', true); return; }
    const ok = this.o.onBuy(i);
    if (ok !== false) { card.flash = 1; audio.sfx('ui_purchase'); this.say(`${p.name} purchased. Non-refundable.`, false); }
    else { audio.sfx('ui_error'); card.shake = 1; }
  }
  private say(m: string, bad: boolean): void { this.msg = m; this.msgT = 2.6; this.msgBad = bad; }
  update(dt: number): void {
    this.t += dt; this.anim.step(dt);
    this.msgT = Math.max(0, this.msgT - dt);
    this.cashShown += (this.o.cash - this.cashShown) * Math.min(1, dt * 10);
    for (const c of this.cards) c.enabled = true;
    const r = app.renderer, s = uiS();
    const aw = r.W - r.safe.l - r.safe.r, ah = r.H - r.safe.t - r.safe.b;
    const ww = Math.min(aw - 8, 628), wh = Math.min(ah - 6, 350);
    this.win = { x: Math.round(r.safe.l + (aw - ww) / 2), y: Math.round(r.safe.t + (ah - wh) / 2), w: ww, h: wh };
    const th = titleBarH();
    const cl = { x: this.win.x + 5, y: this.win.y + th + 3, w: ww - 10, h: wh - th - 8 - (s === 2 ? 16 : 12) };
    const headH = 24 * (s === 2 ? 1.4 : 1) + 12;
    const footH = btnH() + 8;
    const detH = 2 * LINE_H * s + 8;
    this.grid.set(cl.x + 4, cl.y + headH, cl.w - 8, cl.h - headH - footH - detH - 6);
    const cols = Math.max(2, Math.floor((this.grid.w - 8) / (s === 2 ? 138 : 112)));
    const gap = 6;
    const cw = Math.floor((this.grid.w - 8 - 7 - gap * (cols - 1)) / cols);
    const ch = s === 2 ? 118 : 100;
    // manual grid layout inside the scrolling list: cards are children placed by us
    this.grid.items = this.cards;
    this.cards.forEach((c) => { c.parent = this.grid; });
    const sc = this.grid.scroll;
    const rows = Math.ceil(this.cards.length / cols);
    this.grid.contentH = rows * (ch + gap) + 4;
    this.grid.target = clamp(this.grid.target, 0, this.grid.maxScroll());
    this.cards.forEach((c, i) => c.set(this.grid.x + 4 + (i % cols) * (cw + gap), this.grid.y + 4 + Math.floor(i / cols) * (ch + gap) - Math.round(sc), cw, ch));
    this.closeBtn.set(cl.x + cl.w - this.closeBtn.autoW(8) - 4, cl.y + cl.h - footH + 3, this.closeBtn.autoW(8), btnH());
    // we handle grid layout ourselves: stop List.layout() from stacking items
    this.grid.layoutLocked = true;
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    const s = uiS();
    const bd = this.o.backdrop ?? 'dim';
    if (bd === 'dim') dim(g, 0.6 * easeOutCubic(this.anim.t)); else if (bd === 'desktop') drawDesktop(g, 'teal');
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    const res = drawWindow(g, 'Canteen Intranet', rr, { icon: 'cart', status: this.msgT > 0 ? this.msg : 'Prices include mandatory service charge.', close: true });
    if (!this.anim.done) return;
    const cl = res.client;
    // address bar + header
    const hy = cl.y + 2;
    well(g, cl.x + 4, hy, cl.w - 8 - (measure('CASH ') + measure(this.fmt(Math.round(this.cashShown))) + 20), 13 * (s === 2 ? 1.5 : 1), '#fbfaf5');
    drawGlyph(g, 'lock', cl.x + 12, hy + 6 * (s === 2 ? 1.5 : 1) + 1, '#2c8a50', 1);
    ink(g, this.o.url ?? 'intranet://canteen/specials', cl.x + 20, hy + 3 * (s === 2 ? 1.5 : 1) + 1, { color: C.inkDim });
    const cashTxt = this.fmt(Math.round(this.cashShown));
    const cashW = measure('CASH ') + measure(cashTxt) + 14;
    const chh = 13 * (s === 2 ? 1.5 : 1);
    box(g, cl.x + cl.w - 4 - cashW, hy, cashW, chh, { face: '#1d3d2b', cham: 1, depth: 1 });
    drawText(g, 'CASH', cl.x + cl.w - 4 - cashW + 6, hy + Math.round((chh - 7) / 2), { color: '#7fbf9a', shadow: null });
    drawText(g, cashTxt, cl.x + cl.w - 10, hy + Math.round((chh - 7) / 2), { color: C.gold, align: 'right', shadow: null });
    // banner
    const by = hy + 13 * (s === 2 ? 1.5 : 1) + 3;
    g.fillStyle = C.navy; g.fillRect(cl.x + 4, by, cl.w - 8, 14 + (s - 1) * 6);
    stripes(g, cl.x + cl.w - 124, by, 120, 14 + (s - 1) * 6, C.navy, C.navyHi, 2);
    drawText(g, this.o.title ?? "Canteen Intranet - Today's Specials", cl.x + 10, by + 3 + (s - 1) * 3, { color: '#fff', scale: 1 });
    // ticker
    const tk = this.o.ticker ?? '   ALL SALES FINAL   *   NO REFUNDS   *   SMILE, YOU ARE ON CAMERA   *   PLEASE DO NOT FEED THE MANAGERS   *   ';
    const tw = measure(tk);
    const off = Math.floor((this.t * 24) % tw);
    g.save(); g.beginPath(); g.rect(cl.x + cl.w - 124 + 2, by + 1, 116, 12 + (s - 1) * 6); g.clip();
    drawText(g, tk, cl.x + cl.w - 124 + 4 - off, by + 3 + (s - 1) * 3, { color: C.gold, shadow: null });
    drawText(g, tk, cl.x + cl.w - 124 + 4 - off + tw, by + 3 + (s - 1) * 3, { color: C.gold, shadow: null });
    g.restore();
    // grid
    g.save(); g.beginPath(); g.rect(this.grid.x, this.grid.y - 2, this.grid.w, this.grid.h + 2); g.clip();
    g.fillStyle = '#e1ddd0'; g.fillRect(this.grid.x, this.grid.y - 2, this.grid.w, this.grid.h + 2);
    for (const c of this.cards) if (c.y + c.h > this.grid.y - 4 && c.y < this.grid.y + this.grid.h + 4) c.draw(g);
    g.restore();
    this.drawScroll(g);
    // details bar
    const f = this.ui.focus as ProductCard | null;
    const dy = this.grid.y + this.grid.h + 4;
    const detH = 2 * LINE_H * s + 8;
    well(g, cl.x + 4, dy, cl.w - 8, detH, '#fbfaf5');
    if (f instanceof ProductCard) {
      const p = f.p;
      ink(g, truncate(p.name, 220, s), cl.x + 10, dy + 4, { scale: s, color: C.navy });
      const dl = wrap(p.desc, cl.w - 24, s).slice(0, 1);
      ink(g, dl[0] ?? '', cl.x + 10, dy + 4 + LINE_H * s, { scale: s });
      // note: second line collapses into one to stay compact
    }
    this.closeBtn.draw(g);
    this.ui.drawHints(g, cl.x + 8, cl.y + cl.h - btnH() - 8 + 8, cl.w - this.closeBtn.w - 24, [{ action: 'confirm', text: 'Buy' }, { action: 'back', text: 'Leave' }], 'left');
    this.ui.drawCursor(g);
  }
  private drawScroll(g: Ctx): void {
    const gr = this.grid;
    if (gr.maxScroll() <= 0) return;
    const sb = { x: gr.x + gr.w - 7, y: gr.y, w: 7, h: gr.h };
    well(g, sb.x, sb.y, sb.w, sb.h, '#cfcabd');
    const th = Math.max(14, Math.round((gr.h / gr.contentH) * sb.h));
    const ty = sb.y + Math.round((gr.scroll / gr.maxScroll()) * (sb.h - th));
    box(g, sb.x + 1, ty, 5, th, { face: C.face, cham: 0, depth: 1 });
  }
}
