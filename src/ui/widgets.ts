// UI toolkit for internal-resolution pixel UI: focusable widgets with directional navigation,
// mouse hover/click, touch taps + drag-scroll, UI-scale aware metrics and device-aware footer hints.
// Retained widgets, immediate-mode drawing: scenes create widgets once, re-position them each frame
// (cheap) and call ui.update(dt) / ui.render(g).
import { app } from '../core/app';
import type { Action } from '../core/input';
import { audio } from '../audio/audio';
import { Ctx } from '../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../render/font';
import { touchPtr, TAP_SLOP } from './touch';
import {
  C, box, well, focusRing, ink, textY, truncate, uiS, clamp, inRect, drawPrompt, promptCanvas, drawGlyph, glyphSize, easeOutCubic, dim, drawCursor, showCursor, shade, RectL,
} from './style';

// ---------------------------------------------------------------------------
// Metrics (UI scale + touch aware)
export const touchy = (): boolean => app.input?.device === 'touch';
/** Standard row height: 15 on mouse/pad, 22 on touch, doubled-ish by UI scale 2. */
export function rowH(): number { const s = uiS(); return touchy() ? (s === 2 ? 36 : 23) : s === 2 ? 26 : 15; }
export function btnH(): number { return rowH() + (uiS() === 2 ? 4 : 3); }
export function pad(): number { return uiS() === 2 ? 8 : 6; }

// ---------------------------------------------------------------------------
// Pointer (mouse or first touch) shared by all widgets
export const ptr = {
  x: 0, y: 0, down: false, justDown: false, justUp: false, sx: 0, sy: 0, dx: 0, dy: 0,
  touch: false, moved: false, owner: null as Widget | null, frame: -1,
};
let prevDown = false, prevX = 0, prevY = 0;
export function updatePtr(): void {
  if (ptr.frame === app.frame) return;
  ptr.frame = app.frame;
  const i = app.input;
  const t = touchPtr.down;
  const x = t ? touchPtr.x : i.mouse.x, y = t ? touchPtr.y : i.mouse.y;
  const down = t || (i.pointerDown && i.device !== 'touch');
  ptr.touch = t || i.device === 'touch';
  ptr.justDown = down && !prevDown;
  ptr.justUp = !down && prevDown;
  if (ptr.justDown) { ptr.sx = x; ptr.sy = y; ptr.moved = false; }
  ptr.dx = down && prevDown ? x - prevX : 0;
  ptr.dy = down && prevDown ? y - prevY : 0;
  if (down && Math.hypot(x - ptr.sx, y - ptr.sy) > TAP_SLOP) ptr.moved = true;
  ptr.x = x; ptr.y = y; ptr.down = down;
  prevDown = down; prevX = x; prevY = y;
  if (!down) ptr.owner = null;
}

// ---------------------------------------------------------------------------
export interface Hint { action?: Action; key?: string; text: string; onTap?: () => void }

export abstract class Widget {
  x = 0; y = 0; w = 0; h = 0;
  enabled = true;
  visible = true;
  focusable = true;
  focused = false;
  hovered = false;
  press = 0;        // 0..1 press animation
  parent: Widget | null = null;
  tooltip = '';
  /** true while the widget is editing / capturing and must receive all input. */
  busy = false;
  set(x: number, y: number, w: number, h: number): this { this.x = Math.round(x); this.y = Math.round(y); this.w = Math.round(w); this.h = Math.round(h); return this; }
  get rect(): RectL { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  children(): Widget[] { return []; }
  /** Called each frame before update so containers can lay out their children. */
  layout(): void {}
  update(dt: number, _ui: Ui): void { if (this.press > 0) this.press = Math.max(0, this.press - dt * 7); }
  abstract draw(g: Ctx, ui: Ui): void;
  /** Directional input. Return true if consumed (sliders, cyclers, tabs). */
  nav(_dx: number, _dy: number): boolean { return false; }
  activate(): void {}
  click(_px: number, _py: number, _ui: Ui): void { this.activate(); }
  /** Back pressed while focused; return true if consumed. */
  back(): boolean { return false; }
  /** Raw edit hook for busy widgets. */
  edit(_ui: Ui): void {}
  hit(px: number, py: number): Widget | null {
    if (!this.visible || !inRect(this, px, py)) return null;
    const ch = this.children();
    for (let i = ch.length - 1; i >= 0; i--) { const r = ch[i].hit(px, py); if (r) return r; }
    return this.focusable || this.children().length ? this : null;
  }
  hints(): Hint[] { return []; }
  protected sound(n: Parameters<typeof audio.sfx>[0]): void { audio.sfx(n); }
}

// ---------------------------------------------------------------------------
export class Label extends Widget {
  override focusable = false;
  lines: string[] = [];
  constructor(public text: string, public opts: { color?: string; scale?: number; align?: 'left' | 'center' | 'right'; bold?: boolean; dim?: boolean } = {}) { super(); }
  private sc(): number { return this.opts.scale ?? uiS(); }
  override layout(): void {
    const sc = this.sc();
    this.lines = wrap(this.text, Math.max(8, this.w), sc);
    this.h = this.lines.length * LINE_H * sc;
  }
  draw(g: Ctx): void {
    const sc = this.sc();
    const al = this.opts.align ?? 'left';
    const col = this.opts.color ?? (this.opts.dim ? C.inkDim : C.ink);
    this.lines.forEach((l, i) => ink(g, l, al === 'center' ? this.x + this.w / 2 : al === 'right' ? this.x + this.w : this.x, this.y + i * LINE_H * sc, { color: col, scale: sc, align: al }));
  }
}

export class Heading extends Widget {
  override focusable = false;
  constructor(public text: string, public glyph?: string) { super(); }
  draw(g: Ctx): void {
    const s = uiS();
    const ty = textY(this.y, this.h, s);
    let tx = this.x + 2;
    if (this.glyph) { drawGlyph(g, this.glyph, tx + 5, this.y + this.h / 2, C.navy, 1); tx += 14; }
    ink(g, this.text, tx, ty, { color: C.navy, scale: s });
    const w = measure(this.text, s);
    g.fillStyle = C.faceLo; g.fillRect(tx + w + 6, Math.round(this.y + this.h / 2), Math.max(0, this.x + this.w - (tx + w + 6) - 2), 1);
    g.fillStyle = C.faceHi; g.fillRect(tx + w + 6, Math.round(this.y + this.h / 2) + 1, Math.max(0, this.x + this.w - (tx + w + 6) - 2), 1);
  }
}

export class Spacer extends Widget {
  override focusable = false;
  constructor(h = 6) { super(); this.h = h; }
  draw(): void {}
}

// ---------------------------------------------------------------------------
export type ButtonKind = 'normal' | 'primary' | 'danger' | 'flat';
export interface ButtonOpts {
  text: string; onPress?: () => void; kind?: ButtonKind; glyph?: string; icon?: HTMLCanvasElement | null; scale?: number;
  sound?: Parameters<typeof audio.sfx>[0] | null; align?: 'left' | 'center';
}

export class Button extends Widget {
  text: string; onPress?: () => void; kind: ButtonKind; glyph?: string; icon?: HTMLCanvasElement | null; scale?: number;
  sfx: Parameters<typeof audio.sfx>[0] | null;
  align: 'left' | 'center';
  constructor(o: ButtonOpts) {
    super();
    this.text = o.text; this.onPress = o.onPress; this.kind = o.kind ?? 'normal'; this.glyph = o.glyph; this.icon = o.icon; this.scale = o.scale;
    this.sfx = o.sound === undefined ? 'ui_select' : o.sound; this.align = o.align ?? 'center';
  }
  /** Preferred width for the current text/scale. */
  autoW(padX = 12): number { const s = this.scale ?? uiS(); return measure(this.text, s) + padX * 2 + (this.glyph || this.icon ? 14 * s : 0); }
  override activate(): void {
    if (!this.enabled) { this.sound('ui_error'); return; }
    this.press = 1;
    if (this.sfx) this.sound(this.sfx);
    this.onPress?.();
  }
  draw(g: Ctx): void {
    const s = this.scale ?? uiS();
    const down = this.press > 0.35;
    const k = this.kind;
    let face = k === 'primary' ? '#ffd34d' : k === 'danger' ? '#d9534a' : C.face;
    let col = k === 'danger' ? '#fff' : C.ink;
    if (!this.enabled) { face = C.faceLo; col = C.faceDark; }
    else if (this.hovered || this.focused) face = shade(face, 0.18);
    if (k === 'flat' && !this.focused && !this.hovered && !down) { /* no box */ } else
      box(g, this.x, this.y, this.w, this.h, { face, kind: down ? 'sunken' : 'raised', cham: 1, depth: this.h > 18 ? 2 : 1 });
    const off = down ? 1 : 0;
    let tx = this.x + this.w / 2;
    const ty = textY(this.y, this.h, s) + off;
    const tw = measure(this.text, s);
    let ix = 0;
    if (this.glyph || this.icon) ix = 14 * s;
    const left = this.align === 'left';
    const startX = left ? this.x + 8 : tx - (tw + ix) / 2;
    if (this.glyph) drawGlyph(g, this.glyph, startX + 5 * s, this.y + this.h / 2 + off, col, s);
    else if (this.icon) g.drawImage(this.icon, Math.round(startX), Math.round(this.y + this.h / 2 - 8 * s + off), 16 * s, 16 * s);
    ink(g, this.text, startX + ix, ty, { color: col, scale: s });
    if (this.focused && this.enabled) focusRing(g, this.x, this.y, this.w, this.h);
  }
}

// ---------------------------------------------------------------------------
/** Base for settings-style rows: label left, control right. */
export abstract class Row extends Widget {
  constructor(public label: string) { super(); }
  protected controlRect(): RectL {
    const s = uiS();
    const lw = Math.min(measure(this.label, s) + 14, this.w * 0.55);
    const cx = Math.max(this.x + Math.round(this.w * 0.42), this.x + lw);
    return { x: cx, y: this.y + 1, w: this.x + this.w - cx - 4, h: this.h - 2 };
  }
  protected drawRowBg(g: Ctx): void {
    if (this.focused) {
      g.fillStyle = '#fff3c4'; g.fillRect(this.x, this.y, this.w, this.h);
      g.fillStyle = C.amber; g.fillRect(this.x, this.y, 3, this.h);
    } else if (this.hovered) { g.fillStyle = '#f1eee4'; g.fillRect(this.x, this.y, this.w, this.h); }
    g.fillStyle = C.faceLo; g.fillRect(this.x, this.y + this.h - 1, this.w, 1);
  }
  protected drawLabel(g: Ctx): void {
    const s = uiS();
    const col = this.enabled ? C.ink : C.faceDark;
    ink(g, truncate(this.label, this.controlRect().x - this.x - 10, s), this.x + 7, textY(this.y, this.h, s), { color: col, scale: s });
  }
  override hints(): Hint[] { return []; }
}

export class Toggle extends Row {
  constructor(label: string, public get: () => boolean, public set_: (v: boolean) => void, public onText = 'ON', public offText = 'OFF') { super(label); }
  private anim = -1;
  private flip(v: boolean): void { this.set_(v); this.anim = 0; this.sound('ui_toggle'); }
  override activate(): void { if (!this.enabled) { this.sound('ui_error'); return; } this.flip(!this.get()); }
  override nav(dx: number): boolean { if (dx === 0) return false; if (!this.enabled) return true; if (this.get() !== dx > 0) this.flip(dx > 0); return true; }
  override update(dt: number, ui: Ui): void { super.update(dt, ui); if (this.anim >= 0) { this.anim += dt * 8; if (this.anim >= 1) this.anim = -1; } }
  draw(g: Ctx): void {
    this.drawRowBg(g); this.drawLabel(g);
    const s = uiS();
    const on = this.get();
    const sw = 12 * s + 14, sh = Math.min(this.h - 4, 8 * s + 4);
    const cr = this.controlRect();
    const sx = cr.x, sy = Math.round(this.y + (this.h - sh) / 2);
    well(g, sx, sy, sw, sh, on ? '#2e9a55' : '#7a7468');
    const kw = Math.round(sw / 2 - 1);
    let t = on ? 1 : 0;
    if (this.anim >= 0) t = on ? easeOutCubic(this.anim) : 1 - easeOutCubic(this.anim);
    const kx = Math.round(sx + 1 + (sw - 2 - kw) * t);
    box(g, kx, sy + 1, kw, sh - 2, { face: this.enabled ? C.face : C.faceLo, cham: 0, depth: 1 });
    ink(g, on ? this.onText : this.offText, sx + sw + 6, textY(this.y, this.h, s), { color: on ? '#1d7a3e' : C.inkDim, scale: s });
  }
}

export class Slider extends Row {
  dragging = false;
  constructor(label: string, public get: () => number, public set_: (v: number) => void, public min = 0, public max = 1, public step = 0.05, public fmt: (v: number) => string = (v) => Math.round(v * 100) + '%') { super(label); }
  private track(): RectL {
    const s = uiS();
    const cr = this.controlRect();
    const vw = measure('100%', s) + 8;
    return { x: cr.x, y: cr.y + Math.round((cr.h - 8) / 2), w: Math.max(20, cr.w - vw), h: 8 };
  }
  private setFromX(px: number): void {
    const t = this.track();
    const f = clamp((px - t.x - 4) / (t.w - 8), 0, 1);
    let v = this.min + (this.max - this.min) * f;
    v = Math.round(v / this.step) * this.step;
    v = clamp(Math.round(v * 1000) / 1000, this.min, this.max);
    if (v !== this.get()) { this.set_(v); this.sound('ui_slide'); }
  }
  override nav(dx: number): boolean {
    if (dx === 0) return false;
    if (!this.enabled) return true;
    const v = clamp(Math.round((this.get() + dx * this.step) * 1000) / 1000, this.min, this.max);
    if (v !== this.get()) { this.set_(v); this.sound('ui_slide'); }
    return true;
  }
  override activate(): void { /* confirm does nothing; use left/right */ }
  override click(px: number, py: number): void { if (!this.enabled) return; this.setFromX(px); this.dragging = true; ptr.owner = this; void py; }
  override update(dt: number, ui: Ui): void {
    super.update(dt, ui);
    if (this.dragging) {
      if (ptr.down && ptr.owner === this) this.setFromX(ptr.x);
      else this.dragging = false;
    } else if (ptr.justDown && this.enabled && inRect(this.track(), ptr.x, ptr.y) && !ptr.owner && ui.contains(this, ptr.x, ptr.y)) {
      this.dragging = true; ptr.owner = this; ui.setFocus(this); this.setFromX(ptr.x);
    }
  }
  draw(g: Ctx): void {
    this.drawRowBg(g); this.drawLabel(g);
    const s = uiS();
    const t = this.track();
    well(g, t.x, t.y, t.w, t.h, '#a9a396');
    const f = (this.get() - this.min) / (this.max - this.min);
    const fw = Math.round((t.w - 4) * f);
    g.fillStyle = this.enabled ? C.navyHi : C.faceDark; g.fillRect(t.x + 2, t.y + 2, fw, t.h - 4);
    g.fillStyle = shade(C.navyHi, 0.35); g.fillRect(t.x + 2, t.y + 2, fw, 1);
    // chunky thumb
    const th = Math.min(this.h - 2, 12 + (s - 1) * 4), tw = 7;
    const tx = Math.round(t.x + 2 + (t.w - 4 - tw) * f), ty = Math.round(t.y + t.h / 2 - th / 2);
    box(g, tx, ty, tw, th, { face: this.dragging ? '#ffe9a0' : C.face, cham: 1, depth: 1 });
    g.fillStyle = C.faceDark; g.fillRect(tx + 3, ty + 3, 1, th - 6);
    ink(g, this.fmt(this.get()), this.x + this.w - 4, textY(this.y, this.h, s), { scale: s, align: 'right', color: this.enabled ? C.ink : C.faceDark });
  }
}

export class Choice<T> extends Row {
  constructor(label: string, public options: { value: T; label: string }[], public get: () => T, public set_: (v: T) => void) { super(label); }
  private idx(): number { const i = this.options.findIndex((o) => o.value === this.get()); return i < 0 ? 0 : i; }
  private bump = 0;
  private cycle(d: number): void {
    if (!this.enabled) { this.sound('ui_error'); return; }
    const n = this.options.length;
    this.set_(this.options[(this.idx() + d + n) % n].value);
    this.sound('ui_toggle'); this.bump = d;
  }
  override nav(dx: number): boolean { if (dx === 0) return false; this.cycle(dx); return true; }
  override activate(): void { this.cycle(1); }
  override click(px: number): void {
    const cr = this.controlRect();
    if (px < cr.x + 14) this.cycle(-1); else this.activate();
  }
  override update(dt: number, ui: Ui): void { super.update(dt, ui); this.bump *= 0.8; if (Math.abs(this.bump) < 0.05) this.bump = 0; }
  draw(g: Ctx): void {
    this.drawRowBg(g); this.drawLabel(g);
    const s = uiS();
    const cr = this.controlRect();
    well(g, cr.x, cr.y + 1, cr.w, cr.h - 2, this.enabled ? '#fbfaf5' : C.faceLo);
    const lab = this.options[this.idx()]?.label ?? '';
    const cy = this.y + this.h / 2;
    drawGlyph(g, 'left', cr.x + 7, cy, this.focused ? C.navy : C.faceDark, 1);
    drawGlyph(g, 'right', cr.x + cr.w - 7, cy, this.focused ? C.navy : C.faceDark, 1);
    ink(g, truncate(lab, cr.w - 30, s), cr.x + cr.w / 2 + this.bump, textY(this.y, this.h, s), { scale: s, align: 'center', color: this.enabled ? C.ink : C.faceDark });
  }
}

// ---------------------------------------------------------------------------
export class TextField extends Row {
  editing = false;
  caret = 0;
  constructor(label: string, public value = '', public opts: { maxLen?: number; filter?: (ch: string) => string; placeholder?: string; format?: (v: string) => string; onSubmit?: (v: string) => void; onChange?: (v: string) => void } = {}) { super(label); }
  get busy_(): boolean { return this.editing; }
  private begin(): void {
    if (app.input.device === 'kbm') { this.editing = true; this.busy = true; this.caret = 0; app.input.textInput.length = 0; this.sound('ui_select'); }
    else this.sound('ui_select');
  }
  private end(submit: boolean): void {
    this.editing = false; this.busy = false;
    this.sound(submit ? 'ui_select' : 'ui_back');
    if (submit) this.opts.onSubmit?.(this.value);
  }
  openOSK: ((tf: TextField) => void) | null = null;
  override activate(): void {
    if (app.input.device === 'kbm') { if (!this.editing) this.begin(); else this.end(true); }
    else this.openOSK?.(this);
  }
  override click(): void { this.activate(); }
  override back(): boolean { if (this.editing) { this.end(false); return true; } return false; }
  override edit(ui: Ui): void {
    const i = app.input;
    for (const ch of i.textInput) {
      if (ch === '\b') { this.value = this.value.slice(0, -1); this.sound('ui_typing'); this.opts.onChange?.(this.value); continue; }
      const f = this.opts.filter ? this.opts.filter(ch) : ch;
      if (!f) continue;
      if (this.opts.maxLen && this.value.length >= this.opts.maxLen) continue;
      this.value += f; this.sound('ui_typing'); this.opts.onChange?.(this.value);
    }
    if (i.lastKey === 'Enter' || i.lastKey === 'NumpadEnter') this.end(true);
    else if (i.lastKey === 'Escape') this.end(false);
    else if (ptr.justDown && !ui.contains(this, ptr.x, ptr.y)) this.end(true);
  }
  setValue(v: string): void { this.value = v; this.opts.onChange?.(v); }
  draw(g: Ctx): void {
    this.drawRowBg(g); this.drawLabel(g);
    const s = uiS();
    const cr = this.controlRect();
    well(g, cr.x, cr.y + 1, cr.w, cr.h - 2, this.editing ? '#ffffff' : '#fbfaf5');
    const shown = this.opts.format ? this.opts.format(this.value) : this.value;
    const ty = textY(this.y, this.h, s);
    if (!shown && !this.editing) ink(g, this.opts.placeholder ?? '', cr.x + 5, ty, { scale: s, color: C.faceDark });
    else ink(g, shown, cr.x + 5, ty, { scale: s });
    if (this.editing && Math.floor(app.time * 2.2) % 2 === 0) {
      g.fillStyle = C.ink; g.fillRect(cr.x + 5 + measure(shown, s) + 1, ty - 1, s + 1, 9 * s + 1);
    }
  }
  override hints(): Hint[] { return this.editing ? [{ key: 'Enter', text: 'Done', onTap: () => this.end(true) }, { key: 'Esc', text: 'Cancel', onTap: () => this.end(false) }] : []; }
}

// ---------------------------------------------------------------------------
export interface KeyBindOpts { label: string; action?: Action; moveKey?: 'up' | 'down' | 'left' | 'right'; onChange?: () => void; padFixed?: string }

const SYNTH_ESC = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); };

/** Rebinding row with a keyboard/mouse cell and a gamepad cell. */
export class KeyBind extends Row {
  cell: 0 | 1 = 0;
  capturing: 0 | 1 | null = null;
  private capT = 0;
  constructor(public o: KeyBindOpts) { super(o.label); }
  private slot(): number { return this.o.action === 'pause' ? 1 : 0; }
  private cellRect(c: 0 | 1): RectL {
    const cr = this.controlRect();
    const half = Math.floor((cr.w - 4) / 2);
    return { x: cr.x + (c === 0 ? 0 : half + 4), y: cr.y + 1, w: half, h: cr.h - 2 };
  }
  private labelFor(c: 0 | 1): string {
    const i = app.input;
    if (this.o.moveKey) return c === 0 ? bindingName(i.moveKeys[this.o.moveKey]) : this.o.padFixed ?? 'L-Stick';
    const b = i.bindings[this.o.action!][c === 0 ? 'kb' : 'pad'];
    const lab = (x: string) => (c === 0 ? bindingNameFull(x) : padName(x));
    if (!b.length) return '—';
    if (c === 0) return b.map(lab).slice(0, 2).join(' / ');
    return lab(b[0]);
  }
  private canEdit(c: 0 | 1): boolean { return !(c === 1 && this.o.moveKey); }
  override nav(dx: number): boolean {
    if (this.capturing !== null) return true;
    if (dx < 0 && this.cell === 1) { this.cell = 0; this.sound('ui_move'); return true; }
    if (dx > 0 && this.cell === 0) { this.cell = 1; this.sound('ui_move'); return true; }
    return false;
  }
  override click(px: number): void {
    const c1 = this.cellRect(1);
    this.cell = px >= c1.x - 2 ? 1 : 0;
    this.activate();
  }
  override activate(): void {
    if (this.capturing !== null) return;
    const c = this.cell;
    if (!this.canEdit(c)) { this.sound('ui_error'); return; }
    this.capturing = c; this.busy = true; this.capT = 0;
    this.sound('ui_select');
    const kind = c === 0 ? 'kb' : 'pad';
    app.input.captureNext(kind, (b) => {
      this.capturing = null; this.busy = false;
      if (!b) { this.sound('ui_back'); return; }
      if (this.o.moveKey) {
        if (!b.startsWith('key:')) { this.sound('ui_error'); return; }
        const code = b.slice(4);
        const mk = app.input.moveKeys;
        for (const k of ['up', 'down', 'left', 'right'] as const) if (k !== this.o.moveKey && mk[k] === code) mk[k] = mk[this.o.moveKey];
        mk[this.o.moveKey] = code;
      } else applyBinding(this.o.action!, kind, b, this.slot());
      this.sound('ui_toggle');
      app.saveSettings();
      this.o.onChange?.();
    });
  }
  override back(): boolean { return this.capturing !== null; }
  override update(dt: number, ui: Ui): void {
    super.update(dt, ui);
    if (this.capturing !== null) {
      this.capT += dt;
      if (!app.input.capturing) { this.capturing = null; this.busy = false; }
      else if (this.capT > 8 && this.capturing === 0) SYNTH_ESC();
    }
  }
  override hints(): Hint[] { return this.capturing !== null ? [{ key: 'Esc', text: 'Cancel', onTap: SYNTH_ESC }] : [{ action: 'confirm', text: 'Rebind' }]; }
  draw(g: Ctx): void {
    this.drawRowBg(g); this.drawLabel(g);
    const s = uiS();
    for (const c of [0, 1] as const) {
      const r = this.cellRect(c);
      const sel = this.focused && this.cell === c;
      const cap = this.capturing === c;
      const fixed = !this.canEdit(c);
      well(g, r.x, r.y, r.w, r.h, cap ? '#fff3c4' : fixed ? C.faceLo : '#fbfaf5');
      let txt = this.labelFor(c);
      let col = fixed ? C.faceDark : C.ink;
      if (cap) { txt = Math.floor(app.time * 3) % 2 ? 'Press input…' : 'Press input'; col = '#a45c00'; }
      ink(g, truncate(txt, r.w - 6, s), r.x + r.w / 2, textY(r.y, r.h, s), { scale: s, align: 'center', color: col });
      if (sel && !cap) { g.fillStyle = C.amber; g.fillRect(r.x, r.y + r.h - 2, r.w, 2); }
    }
    ink(g, '', 0, 0);
  }
}

function applyBinding(a: Action, kind: 'kb' | 'pad', b: string, slot: number): void {
  const bs = app.input.bindings;
  const list = bs[a][kind];
  const old = list[slot];
  // gameplay conflicts: swap bindings with the action currently holding it
  for (const other of ['melee', 'heavy', 'ranged', 'grab', 'dash', 'rage', 'interact', 'pause'] as Action[]) {
    if (other === a) continue;
    const ol = bs[other][kind];
    const ix = ol.indexOf(b);
    if (ix >= 0) { if (old) ol[ix] = old; else ol.splice(ix, 1); }
  }
  list[slot] = b;
}

function bindingName(code: string): string { return bindingNameFull('key:' + code); }
import { bindingLabel } from '../core/input';
function bindingNameFull(b: string): string { return bindingLabel(b, 'kbm'); }
function padName(b: string): string { const d = app.input.device; return bindingLabel(b, d === 'playstation' ? 'playstation' : d === 'xbox' ? 'xbox' : 'xbox'); }

// ---------------------------------------------------------------------------
export interface TabDef { label: string; glyph?: string }
export class Tabs extends Widget {
  index = 0;
  vertical = true;
  compact = false;
  constructor(public tabs: TabDef[], public onChange?: (i: number) => void) { super(); }
  itemRect(i: number): RectL {
    if (this.vertical) { const th = Math.min(this.h / this.tabs.length, rowH() + 6); return { x: this.x, y: this.y + Math.round(i * th), w: this.w, h: Math.round(th) - 1 }; }
    const tw = Math.floor(this.w / this.tabs.length);
    return { x: this.x + i * tw, y: this.y, w: tw - 1, h: this.h };
  }
  select(i: number, silent = false): void {
    i = clamp(i, 0, this.tabs.length - 1);
    if (i === this.index) return;
    this.index = i; if (!silent) this.sound('ui_move');
    this.onChange?.(i);
  }
  override nav(dx: number, dy: number): boolean {
    const d = this.vertical ? dy : dx;
    if (d === 0) return false;
    const n = this.index + d;
    if (n < 0 || n >= this.tabs.length) return false;
    this.select(n); return true;
  }
  override click(px: number, py: number): void { for (let i = 0; i < this.tabs.length; i++) if (inRect(this.itemRect(i), px, py)) { this.select(i); return; } }
  override activate(): void { /* selecting happens on navigation */ }
  draw(g: Ctx): void {
    const s = uiS();
    this.tabs.forEach((t, i) => {
      const r = this.itemRect(i);
      const sel = i === this.index;
      const hov = this.hovered && inRect(r, ptr.x, ptr.y) && !ptr.touch;
      if (sel) {
        box(g, r.x, r.y, r.w + (this.vertical ? 3 : 0), r.h + (this.vertical ? 0 : 2), { face: this.focused ? '#fff3c4' : '#fbfaf5', cham: 1, depth: 1 });
        g.fillStyle = C.amber; if (this.vertical) g.fillRect(r.x + 1, r.y + 2, 3, r.h - 4); else g.fillRect(r.x + 3, r.y + r.h - 1, r.w - 6, 2);
      } else {
        box(g, r.x, r.y, r.w, r.h, { face: hov ? '#ece9df' : C.faceLo, cham: 1, depth: 1 });
      }
      const col = sel ? C.navy : C.inkDim;
      if (this.compact) { if (t.glyph) drawGlyph(g, t.glyph, r.x + r.w / 2, r.y + r.h / 2, col, 1); }
      else {
        let tx = r.x + 8;
        if (t.glyph) { drawGlyph(g, t.glyph, tx + 5, r.y + r.h / 2, col, 1); tx += 15; }
        ink(g, truncate(t.label, r.x + r.w - tx - 3, s), tx, textY(r.y, r.h, s), { color: col, scale: s });
      }
    });
    if (this.focused) { const r = this.itemRect(this.index); focusRing(g, r.x, r.y, r.w, r.h, 1); }
  }
}

// ---------------------------------------------------------------------------
/** Scrollable vertical list container. Rows are laid out top to bottom at the list's width. */
export class List extends Widget {
  override focusable = false;
  items: Widget[] = [];
  scroll = 0;
  target = 0;
  gap = 0;
  padX = 0; padY = 2;
  contentH = 0;
  private vel = 0;
  private dragging = false;
  private sbDrag = false;
  background: string | null = null;
  /** When true the owner positions the items itself (grids); the list only handles scrolling. */
  layoutLocked = false;
  constructor() { super(); }
  setItems(items: Widget[]): void { this.items = items; for (const it of items) it.parent = this; this.scroll = this.target = 0; this.vel = 0; }
  add(w: Widget): this { this.items.push(w); w.parent = this; return this; }
  override children(): Widget[] { return this.items; }
  private viewH(): number { return this.h; }
  maxScroll(): number { return Math.max(0, this.contentH - this.viewH()); }
  override layout(): void {
    if (this.layoutLocked) return;
    const sbw = this.contentH > this.h ? 7 : 0;
    let y = this.y + this.padY - Math.round(this.scroll);
    let total = this.padY;
    for (const it of this.items) {
      if (!it.visible) continue;
      it.x = this.x + this.padX; it.w = this.w - this.padX * 2 - sbw;
      it.layout();
      if (it.h <= 0 && !(it instanceof Label)) it.h = rowH();
      it.y = y; y += it.h + this.gap; total += it.h + this.gap;
    }
    this.contentH = total + this.padY;
    this.scroll = clamp(this.scroll, 0, this.maxScroll());
    this.target = clamp(this.target, 0, this.maxScroll());
  }
  wheel(n: number): void { this.target = clamp(this.target + n * (rowH() * 2), 0, this.maxScroll()); }
  reveal(w: Widget): void {
    const top = w.y - (this.y + this.padY) + this.scroll;
    const bot = top + w.h;
    if (top < this.target) this.target = Math.max(0, top - 2);
    else if (bot > this.target + this.h - this.padY * 2) this.target = Math.min(this.maxScroll(), bot - this.h + this.padY * 2 + 2);
  }
  private sbRect(): RectL { return { x: this.x + this.w - 7, y: this.y, w: 7, h: this.h }; }
  private thumb(): RectL {
    const sb = this.sbRect();
    const th = Math.max(14, Math.round((this.h / this.contentH) * sb.h));
    const ty = sb.y + Math.round((this.scroll / Math.max(1, this.maxScroll())) * (sb.h - th));
    return { x: sb.x + 1, y: ty, w: 5, h: th };
  }
  override update(dt: number, ui: Ui): void {
    super.update(dt, ui);
    const ms = this.maxScroll();
    if (ms > 0) {
      // touch / mouse drag scrolling
      if (ptr.justDown && inRect(this, ptr.x, ptr.y) && !ptr.owner) {
        if (inRect(this.sbRect(), ptr.x, ptr.y)) { this.sbDrag = true; ptr.owner = this; }
        else if (ptr.touch) { this.dragging = true; this.vel = 0; }
      }
      if (this.sbDrag) {
        if (ptr.down) { const sb = this.sbRect(), th = this.thumb(); const f = clamp((ptr.y - sb.y - th.h / 2) / (sb.h - th.h), 0, 1); this.scroll = this.target = f * ms; }
        else this.sbDrag = false;
      } else if (this.dragging) {
        if (ptr.down) { if (ptr.moved) { this.scroll = this.target = clamp(this.scroll - ptr.dy, 0, ms); this.vel = -ptr.dy; ptr.owner = this; } }
        else { this.dragging = false; this.target = clamp(this.scroll + this.vel * 8, 0, ms); }
      }
    }
    if (!this.dragging && !this.sbDrag) this.scroll += (this.target - this.scroll) * Math.min(1, dt * 16);
    if (Math.abs(this.target - this.scroll) < 0.4) this.scroll = this.target;
  }
  draw(g: Ctx, ui: Ui): void {
    g.save();
    g.beginPath(); g.rect(this.x, this.y, this.w, this.h); g.clip();
    if (this.background) { g.fillStyle = this.background; g.fillRect(this.x, this.y, this.w, this.h); }
    for (const it of this.items) {
      if (!it.visible || it.y + it.h < this.y || it.y > this.y + this.h) continue;
      it.draw(g, ui);
    }
    g.restore();
    if (this.maxScroll() > 0) {
      const sb = this.sbRect(), th = this.thumb();
      well(g, sb.x, sb.y, sb.w, sb.h, '#cfcabd');
      box(g, th.x, th.y, th.w, th.h, { face: this.sbDrag ? '#ffe9a0' : C.face, cham: 0, depth: 1 });
      if (this.scroll > 2) drawGlyph(g, 'up', sb.x + 3, sb.y - 4 + 8, C.navy, 1);
      if (this.scroll < this.maxScroll() - 2) drawGlyph(g, 'down', sb.x + 3, sb.y + sb.h - 8, C.navy, 1);
    }
  }
  override hit(px: number, py: number): Widget | null {
    if (!this.visible || !inRect(this, px, py)) return null;
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; if (it.visible && inRect(it, px, py)) { const r = it.hit(px, py); if (r) return r; } }
    return this;
  }
}

// ---------------------------------------------------------------------------
// Modals
export interface Modal { done: boolean; update(dt: number): void; render(g: Ctx): void }

// ---------------------------------------------------------------------------
export interface UiOpts { onBack?: () => void }

export class Ui {
  widgets: Widget[] = [];
  focus: Widget | null = null;
  modal: Modal | null = null;
  onBack?: () => void;
  /** Extra hints appended to the footer (scenes can set this). */
  extraHints: Hint[] = [];
  private navT = 0; private navLast = { dx: 0, dy: 0 };
  private hintRects: { r: RectL; h: Hint }[] = [];
  private lastFocus: Widget | null = null;
  /** Disable the "mouse hover steals focus" behaviour (e.g. while capturing). */
  hoverFocus = true;
  constructor(o: UiOpts = {}) { this.onBack = o.onBack; }

  add<T extends Widget>(w: T): T { this.widgets.push(w); return w; }
  clear(): void { this.widgets.length = 0; this.focus = null; }
  openModal(m: Modal): void { this.modal = m; audio.sfx('ui_select'); }

  focusables(): Widget[] {
    const out: Widget[] = [];
    const walk = (ws: Widget[]) => { for (const w of ws) { if (!w.visible) continue; if (w.focusable && w.enabled !== undefined) out.push(w); const ch = w.children(); if (ch.length) walk(ch); } };
    walk(this.widgets);
    return out;
  }

  setFocus(w: Widget | null, silent = true): void {
    if (this.focus === w) return;
    if (this.focus) this.focus.focused = false;
    this.focus = w;
    if (w) { w.focused = true; this.revealFocus(); if (!silent) audio.sfx('ui_move'); }
  }

  private revealFocus(): void {
    const f = this.focus; if (!f) return;
    for (let p = f.parent; p; p = p.parent) (p as List).reveal?.(f);
  }

  /** Is the point (px,py) over widget w and not obscured/clipped by a container? */
  contains(w: Widget, px: number, py: number): boolean { return this.hitAt(px, py) === w; }
  hitAt(px: number, py: number): Widget | null {
    for (let i = this.widgets.length - 1; i >= 0; i--) { const r = this.widgets[i].hit(px, py); if (r) return r; }
    return null;
  }

  private readDir(): { dx: number; dy: number } {
    const i = app.input;
    let dx = (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0);
    let dy = (i.down('down') ? 1 : 0) - (i.down('up') ? 1 : 0);
    const m = i.move();
    if (!dx && Math.abs(m.x) > 0.55 && Math.abs(m.x) >= Math.abs(m.y)) dx = Math.sign(m.x);
    if (!dy && Math.abs(m.y) > 0.55 && Math.abs(m.y) > Math.abs(m.x)) dy = Math.sign(m.y);
    if (dx && dy) { if (this.navLast.dy) dx = 0; else dy = 0; }
    return { dx, dy };
  }

  private stepNav(dt: number): { dx: number; dy: number } {
    const d = this.readDir();
    if (!d.dx && !d.dy) { this.navLast = d; this.navT = 0; return { dx: 0, dy: 0 }; }
    if (d.dx !== this.navLast.dx || d.dy !== this.navLast.dy) { this.navLast = d; this.navT = 0.38; return d; }
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.085; return d; }
    return { dx: 0, dy: 0 };
  }

  /** Spatial navigation: nearest focusable in the direction. */
  private spatial(from: Widget, dx: number, dy: number): Widget | null {
    let best: Widget | null = null, bestScore = Infinity;
    const fx = from.cx, fy = from.cy;
    for (const w of this.focusables()) {
      if (w === from || !w.enabled) continue;
      const cx = w.cx, cy = w.cy;
      const pri = dx ? (cx - fx) * dx : (cy - fy) * dy;
      if (pri < 1) continue;
      // overlap on the perpendicular axis => zero perpendicular penalty
      let perp: number;
      if (dx) { const o = Math.min(from.y + from.h, w.y + w.h) - Math.max(from.y, w.y); perp = o > 0 ? 0 : Math.abs(cy - fy); }
      else { const o = Math.min(from.x + from.w, w.x + w.w) - Math.max(from.x, w.x); perp = o > 0 ? 0 : Math.abs(cx - fx); }
      const score = pri + perp * 3 + (perp === 0 ? 0 : 20);
      if (score < bestScore) { bestScore = score; best = w; }
    }
    return best;
  }

  /** Nearest focusable by distance to a point (used for wrap-around at the ends). */
  private wrapTarget(from: Widget, dx: number, dy: number): Widget | null {
    const list = this.focusables().filter((w) => w.enabled);
    if (!list.length) return null;
    if (dy) {
      const col = list.filter((w) => w !== from && Math.min(from.x + from.w, w.x + w.w) - Math.max(from.x, w.x) > 0);
      if (!col.length) return null;
      return col.reduce((a, b) => ((dy > 0 ? b.y < a.y : b.y > a.y) ? b : a));
    }
    void dx;
    return null;
  }

  update(dt: number): void {
    updatePtr();
    const i = app.input;
    for (const w of this.widgets) this.layoutRec(w);
    if (this.modal) {
      this.modal.update(dt);
      if (this.modal.done) this.modal = null;
      return;
    }
    // widget animations
    const upd = (ws: Widget[]) => { for (const w of ws) { w.update(dt, this); const ch = w.children(); if (ch.length) upd(ch); } };
    upd(this.widgets);

    const fl = this.focusables();
    if (this.focus && (!fl.includes(this.focus) || !this.focus.enabled)) this.setFocus(null);

    // hover / clicks
    const mouseMode = i.device === 'kbm';
    for (const w of fl) w.hovered = false;
    const hov = mouseMode && i.mouse.inside ? this.hitAt(i.mouse.x, i.mouse.y) : null;
    if (hov && hov.focusable) { hov.hovered = true; if (i.mouse.moved && this.hoverFocus && hov.enabled && !this.focus?.busy && hov !== this.focus) { this.setFocus(hov, false); } }

    // hint taps are handled first (so they win over widgets underneath)
    for (const c of [...i.clicks]) {
      if (c.button !== 0) continue;
      const hr = this.hintRects.find((h) => inRect(h.r, c.x, c.y));
      if (hr) { if (hr.h.onTap) { hr.h.onTap(); audio.sfx('ui_select'); } else if (hr.h.action === 'back') this.doBack(); else if (hr.h.action === 'confirm') this.focus?.activate(); i.clicks.splice(i.clicks.indexOf(c), 1); }
    }
    for (const c of i.clicks) {
      if (c.button !== 0) continue;
      if (this.focus?.busy && this.focus.hit(c.x, c.y) !== this.focus) { this.focus.edit(this); continue; }
      const w = this.hitAt(c.x, c.y);
      if (w && w.focusable) {
        if (!w.enabled) { audio.sfx('ui_error'); continue; }
        this.setFocus(w);
        w.press = 0.6;
        w.click(c.x, c.y, this);
      }
    }

    if (this.focus?.busy) { this.focus.edit(this); return; }

    // wheel
    if (i.mouseWheel) {
      const target = this.scrollableAt(i.mouse.x, i.mouse.y) ?? this.firstScrollable(this.widgets);
      target?.wheel(i.mouseWheel);
    }

    // tabs shoulder buttons
    const tabs = this.findTabs(this.widgets);
    if (tabs) {
      const L = i.isPad() ? i.pressed('tabL') : (i.lastKey === 'PageUp' || i.lastKey === 'KeyQ');
      const R = i.isPad() ? i.pressed('tabR') : i.lastKey === 'PageDown';
      if (L) tabs.select((tabs.index + tabs.tabs.length - 1) % tabs.tabs.length);
      else if (R) tabs.select((tabs.index + 1) % tabs.tabs.length);
    }

    const nav = this.stepNav(dt);
    const anyDir = nav.dx !== 0 || nav.dy !== 0;
    if (!this.focus && (anyDir || i.pressed('confirm'))) {
      const first = this.defaultFocus(fl);
      if (first) { this.setFocus(first, false); i.consume('confirm'); return; }
    }
    if (this.focus && anyDir) {
      if (!this.focus.nav(nav.dx, nav.dy)) {
        let n = this.spatial(this.focus, nav.dx, nav.dy);
        if (!n && nav.dy) n = this.wrapTarget(this.focus, nav.dx, nav.dy);
        if (n) this.setFocus(n, false);
        else if (!(nav.dx && this.focus.nav(0, 0))) { /* edge: no sound */ }
      }
    }
    if (this.focus && i.pressed('confirm')) this.focus.activate();
    if (i.pressed('back')) this.doBack();
    if (this.focus !== this.lastFocus) { this.lastFocus = this.focus; this.revealFocus(); }
  }

  private layoutRec(w: Widget): void { w.layout(); for (const c of w.children()) if (!(w instanceof List)) this.layoutRec(c); }

  doBack(): void {
    if (this.focus?.back()) return;
    if (this.onBack) { audio.sfx('ui_back'); this.onBack(); }
  }

  private defaultFocus(fl: Widget[]): Widget | null {
    return fl.find((w) => w.enabled && !(w.parent instanceof List && false)) ?? null;
  }

  private findTabs(ws: Widget[]): Tabs | null { for (const w of ws) if (w instanceof Tabs && w.visible) return w; return null; }
  private scrollableAt(px: number, py: number): List | null {
    let found: List | null = null;
    const walk = (ws: Widget[]) => { for (const w of ws) { if (w instanceof List && w.visible && inRect(w, px, py) && w.maxScroll() > 0) found = w; walk(w.children()); } };
    walk(this.widgets);
    return found;
  }
  private firstScrollable(ws: Widget[]): List | null {
    for (const w of ws) { if (w instanceof List && w.visible && w.maxScroll() > 0) return w; const r = this.firstScrollable(w.children()); if (r) return r; }
    return null;
  }

  // ---- rendering
  render(g: Ctx): void {
    for (const w of this.widgets) if (w.visible) w.draw(g, this);
    if (this.modal) this.modal.render(g);
  }

  /** Default footer hints for the current focus + device. */
  autoHints(): Hint[] {
    const h: Hint[] = [];
    if (this.modal) return h;
    const fh = this.focus?.hints() ?? [];
    if (fh.length) { h.push(...fh); if (this.focus?.busy) return h; }
    const dev = app.input.device;
    if (dev !== 'touch') h.push({ key: dev === 'kbm' ? '↑↓←→' : 'D-Pad', text: 'Navigate' });
    if (!fh.length && dev !== 'touch') h.push({ action: 'confirm', text: 'Select' });
    if (this.onBack) h.push({ action: 'back', text: 'Back' });
    h.push(...this.extraHints);
    return h;
  }

  /** Draw footer hints right-aligned/centred in a strip and register them as tap targets. */
  drawHints(g: Ctx, x: number, y: number, w: number, hints: Hint[] = this.autoHints(), align: 'left' | 'center' | 'right' = 'right', onDark = false): void {
    this.hintRects = drawHintBar(g, hints, x, y, w, align, onDark);
  }

  /** Draw the software mouse cursor on top of everything (call last in a scene's render). */
  drawCursor(g: Ctx): void { if (showCursor()) drawCursor(g, app.input.mouse.x, app.input.mouse.y, app.input.pointerDown); }
}

// ---------------------------------------------------------------------------
// Hint bar
export function hintLabel(h: Hint): string {
  const i = app.input;
  if (h.key) return h.key;
  if (h.action) return i.label(h.action);
  return '';
}

export function drawHintBar(g: Ctx, hints: Hint[], x: number, y: number, w: number, align: 'left' | 'center' | 'right', onDark: boolean): { r: RectL; h: Hint }[] {
  const s = uiS();
  const dev = app.input.device;
  const t = dev === 'touch';
  const items = hints.map((h) => {
    const lab = hintLabel(h);
    const pw = t || !lab ? 0 : promptCanvas(lab, dev).width * s + 3;
    const tw = measure(h.text, s);
    const iw = t ? tw + 14 : pw + tw;
    return { h, lab, pw, tw, iw };
  });
  const gap = t ? 6 : 12;
  const total = items.reduce((a, b) => a + b.iw, 0) + gap * Math.max(0, items.length - 1);
  let cx = align === 'right' ? x + w - total : align === 'center' ? x + Math.round((w - total) / 2) : x;
  const rects: { r: RectL; h: Hint }[] = [];
  const hh = t ? rowH() : 12 * s;
  const oy = y;
  for (const it of items) {
    const r = { x: cx - 2, y: y - 2, w: it.iw + 4, h: hh + 2 };
    if (t) {
      const dn = ptr.down && inRect(r, ptr.x, ptr.y);
      y = oy - Math.round((hh - 9 * s) / 2);
      r.y = y - 2;
      box(g, cx, y - 1, it.iw, hh, { face: dn ? C.faceLo : C.face, cham: 1, depth: 1, kind: dn ? 'sunken' : 'raised' });
      ink(g, it.h.text, cx + it.iw / 2, textY(y - 1, hh, s), { scale: s, align: 'center' });
    } else {
      if (it.lab) drawPrompt(g, it.lab, cx, y + Math.round((9 * s - promptCanvas(it.lab, dev).height * s) / 2), s);
      drawText(g, it.h.text, cx + it.pw, y, { scale: s, color: onDark ? '#f2f2ee' : C.ink, shadow: onDark ? 'rgba(0,0,0,0.55)' : null });
    }
    rects.push({ r, h: it.h });
    cx += it.iw + gap;
  }
  return rects;
}

// ---------------------------------------------------------------------------
// On-screen keyboard for text entry on pad/touch (used by TextField via attachOSK)
const OSK_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class OnScreenKeyboard implements Modal {
  done = false;
  ui = new Ui({ onBack: () => { this.done = true; } });
  private t = 0;
  constructor(public title: string, public value: string, public maxLen: number, public onDone: (v: string) => void, public format?: (v: string) => string, chars = OSK_CHARS) {
    this.ui.hoverFocus = true;
    const mk = (text: string, fn: () => void, kind: ButtonKind = 'normal') => this.ui.add(new Button({ text, onPress: fn, kind, sound: 'ui_typing' }));
    this.keys = [...chars].map((c) => mk(c, () => { if (this.value.length < this.maxLen) this.value += c; }));
    this.del = mk('DEL', () => { this.value = this.value.slice(0, -1); });
    this.clr = mk('CLEAR', () => { this.value = ''; }, 'danger');
    this.ok = this.ui.add(new Button({ text: 'OK', kind: 'primary', onPress: () => { this.done = true; this.onDone(this.value); }, sound: 'ui_select' }));
    this.cancel = this.ui.add(new Button({ text: 'CANCEL', onPress: () => { this.done = true; }, sound: 'ui_back' }));
    this.ui.setFocus(this.keys[0]);
  }
  keys: Button[]; del: Button; clr: Button; ok: Button; cancel: Button;
  update(dt: number): void {
    this.t += dt;
    const r = app.renderer;
    const s = uiS();
    const cols = 8, gap = 2;
    const kw = (touchy() ? 30 : 24) * (s === 2 ? 1.2 : 1), kh = rowH() + 3;
    const gw = cols * kw + (cols - 1) * gap;
    const ww = gw + 24, rows = Math.ceil(this.keys.length / cols);
    const wh = 22 + 20 + rows * (kh + gap) + kh + 24;
    const wx = Math.round((r.W - ww) / 2), wy = Math.round((r.H - wh) / 2);
    this.rect = { x: wx, y: wy, w: ww, h: wh };
    const gx = wx + 12, gy = wy + 22 + 22;
    this.keys.forEach((k, i) => k.set(gx + (i % cols) * (kw + gap), gy + Math.floor(i / cols) * (kh + gap), kw, kh));
    const by = gy + rows * (kh + gap) + 2;
    const bw = Math.floor((gw - gap * 3) / 4);
    this.del.set(gx, by, bw, kh); this.clr.set(gx + bw + gap, by, bw, kh); this.cancel.set(gx + (bw + gap) * 2, by, bw, kh); this.ok.set(gx + (bw + gap) * 3, by, bw, kh);
    this.ui.update(dt);
  }
  rect: RectL = { x: 0, y: 0, w: 0, h: 0 };
  render(g: Ctx): void {
    dim(g, 0.6);
    const r = this.rect;
    const s = uiS();
    box(g, r.x, r.y, r.w, r.h, { face: C.face, cham: 2 });
    g.fillStyle = C.navy; g.fillRect(r.x + 3, r.y + 3, r.w - 6, 13);
    drawText(g, this.title, r.x + 8, r.y + 5, { color: '#fff', shadow: null });
    well(g, r.x + 12, r.y + 20, r.w - 24, 16 + (s - 1) * 6);
    const shown = this.format ? this.format(this.value) : this.value;
    ink(g, shown, r.x + 16, r.y + 20 + Math.round((16 + (s - 1) * 6 - 7 * s) / 2), { scale: s });
    if (Math.floor(this.t * 2.2) % 2 === 0) { g.fillStyle = C.ink; g.fillRect(r.x + 17 + measure(shown, s), r.y + 23, s + 1, 9 * s); }
    this.ui.render(g);
    const hy = r.y + r.h - 14;
    this.ui.drawHints(g, r.x + 8, hy, r.w - 16, [{ action: 'confirm', text: 'Type' }, { action: 'back', text: 'Cancel' }], 'center');
    this.ui.drawCursor(g);
  }
}

/** Wire a TextField so pad/touch users get an on-screen keyboard. */
export function attachOSK(ui: Ui, tf: TextField, title: string, maxLen: number): void {
  tf.openOSK = (f) => ui.openModal(new OnScreenKeyboard(title, f.value, maxLen, (v) => f.setValue(v), f.opts.format));
}

export { drawCursor, showCursor, glyphSize, dim, LINE_H };
