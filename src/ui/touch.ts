// Touch controls (spec 2.5, 10.4): floating dual sticks + context buttons, safe-area aware, mirrorable.
// Writes app.input.virtual every frame in gameplay mode; in menu mode taps are injected as UI clicks.
import { app, isMobile, PLATFORM } from '../core/app';
import type { Action } from '../core/input';
import { icon } from '../art/items';
import { Ctx } from '../render/canvas';
import { drawText, measure } from '../render/font';
import { C, box, easeOutBack, clamp, glyph } from './style';

export type TouchMode = 'gameplay' | 'menu';
export interface TouchContext {
  /** a grabbable target is in range -> show the Grab button */
  grab: boolean;
  /** label of an interactable in range (e.g. "Open"), or null */
  interact: string | null;
  rageReady: boolean;
  rageActive: boolean;
  /** player currently owns a ranged weapon/throwable (right-stick release fires it) */
  ranged: boolean;
  mode: TouchMode;
}

/** Max finger travel (internal px) that still counts as a tap. Shared with scrolling lists. */
export const TAP_SLOP = 7;

/** Single menu pointer for drag-scrolling lists and sliders (first active finger in menu mode). */
export const touchPtr = { down: false, x: 0, y: 0, sx: 0, sy: 0, id: -1 };

type Role = 'move' | 'aim' | 'pause' | 'melee' | 'dash' | 'rage' | 'grab' | 'interact' | 'heavy' | 'menu';
interface Finger { id: number; role: Role; sx: number; sy: number; x: number; y: number; bx: number; by: number; t0: number }
interface Btn { role: Exclude<Role, 'move' | 'aim' | 'menu'>; x: number; y: number; r: number }
interface Ripple { x: number; y: number; t: number }

class TouchControls {
  private forced: boolean | null = null;
  private attached: HTMLCanvasElement | null = null;
  private fingers = new Map<number, Finger>();
  private ctx: TouchContext = { grab: false, interact: null, rageReady: false, rageActive: false, ranged: true, mode: 'gameplay' };
  private lastFrame = -1;
  private btns: Btn[] = [];
  private pop: Record<string, number> = { grab: 0, interact: 0 };
  private pulse: { action: Action | null; frames: number } = { action: null, frames: 0 };
  private aimLast: { x: number; y: number } | null = null;
  private aimHoldFrames = 0;
  private ripples: Ripple[] = [];
  private tcount = 0;
  /** dev gallery: render a fake held state */
  demoState: { move?: { x: number; y: number }; aim?: { x: number; y: number }; buttons?: Role[] } | null = null;

  /** auto: true when the active device is touch, or on Android/mobile (unless a controller is in use). */
  get enabled(): boolean {
    if (this.forced !== null) return this.forced;
    const i = app.input;
    if (!i) return false;
    if (i.device === 'touch') return true;
    if (PLATFORM === 'android' || isMobile) return !i.isPad();
    return false;
  }
  set enabled(v: boolean) { this.forced = v; }
  /** Return to automatic detection. */
  auto(): void { this.forced = null; }

  get mode(): TouchMode { return this.ctx.mode; }

  setContext(c: Partial<TouchContext>): void {
    const was = this.ctx;
    this.ctx = { ...was, ...c };
    if (c.mode && c.mode !== was.mode) { this.releaseAll(); }
  }

  attach(canvas: HTMLCanvasElement): void {
    if (this.attached === canvas) return;
    this.attached = canvas;
    const down = (e: PointerEvent) => this.onDown(e);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent) => this.onUp(e, e.type === 'pointercancel');
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => this.releaseAll());
  }

  private pos(e: PointerEvent): { x: number; y: number } { return app.renderer.toInternal(e.clientX, e.clientY); }

  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    try { this.attached?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    app.input.device = 'touch';
    const p = this.pos(e);
    const f: Finger = { id: e.pointerId, role: 'menu', sx: p.x, sy: p.y, x: p.x, y: p.y, bx: p.x, by: p.y, t0: performance.now() };
    if (this.ctx.mode === 'menu') {
      if (!touchPtr.down) { touchPtr.down = true; touchPtr.id = e.pointerId; touchPtr.x = touchPtr.sx = p.x; touchPtr.y = touchPtr.sy = p.y; }
      this.fingers.set(e.pointerId, f);
      return;
    }
    f.role = this.pick(p.x, p.y);
    if (f.role === 'move' || f.role === 'aim') {
      const R = this.stickR();
      const r = app.renderer;
      f.bx = clamp(p.x, r.safe.l + R + 6, r.W - r.safe.r - R - 6);
      f.by = clamp(p.y, r.safe.t + R + 6, r.H - r.safe.b - R - 6);
    }
    if (f.role === 'menu') { this.fingers.set(e.pointerId, f); return; }
    // one finger per role; steal the role from an older finger
    for (const o of this.fingers.values()) if (o.role === f.role && o.id !== f.id) { this.endFinger(o, false); this.fingers.delete(o.id); }
    this.fingers.set(e.pointerId, f);
    if (f.role === 'dash' || f.role === 'rage' || f.role === 'grab' || f.role === 'interact' || f.role === 'melee' || f.role === 'heavy' || f.role === 'pause') this.ripples.push({ x: f.sx, y: f.sy, t: 0 });
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const p = this.pos(e);
    f.x = p.x; f.y = p.y;
    if (touchPtr.down && touchPtr.id === e.pointerId) { touchPtr.x = p.x; touchPtr.y = p.y; }
    if (f.role === 'move' || f.role === 'aim') {
      // floating stick follows the finger if dragged beyond the rim
      const R = this.stickR();
      const dx = f.x - f.bx, dy = f.y - f.by, d = Math.hypot(dx, dy);
      if (d > R * 1.35) { const k = (d - R * 1.35) / d; f.bx += dx * k; f.by += dy * k; }
    }
  }

  private onUp(e: PointerEvent, cancel: boolean): void {
    if (e.pointerType !== 'touch') return;
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const p = this.pos(e);
    f.x = p.x; f.y = p.y;
    this.fingers.delete(e.pointerId);
    if (f.role === 'menu') {
      if (touchPtr.id === e.pointerId) { touchPtr.down = false; touchPtr.id = -1; }
      if (!cancel && Math.hypot(f.x - f.sx, f.y - f.sy) <= TAP_SLOP) {
        app.input.injectTap(f.x, f.y);
        this.ripples.push({ x: f.x, y: f.y, t: 0 });
      }
      return;
    }
    this.endFinger(f, cancel);
  }

  private endFinger(f: Finger, cancel: boolean): void {
    if (f.role === 'aim') {
      const v = this.stickVec(f);
      if (!cancel && this.ctx.ranged && Math.hypot(v.x, v.y) > 0.45) {
        this.aimLast = v; this.aimHoldFrames = 4; // keep aiming for a few frames while the shot pulses
        this.pulse = { action: 'ranged', frames: 3 };
      }
    }
  }

  private releaseAll(): void {
    this.fingers.clear();
    touchPtr.down = false; touchPtr.id = -1;
    this.aimLast = null; this.aimHoldFrames = 0;
    const v = app.input?.virtual;
    if (v) { v.move.x = 0; v.move.y = 0; v.aim = null; v.buttons = {}; }
  }

  // --------------------------------------------------------------------------
  // layout
  private mirror(): boolean { return !!app.settings?.touchLayout.leftHanded; }
  private lay() { return app.settings?.touchLayout ?? { stickSize: 1, buttonSize: 1, opacity: 0.55, leftHanded: false }; }
  private stickR(): number { return Math.round(30 * this.lay().stickSize); }

  private computeButtons(): void {
    const r = app.renderer;
    const lay = this.lay();
    const bs = lay.buttonSize;
    const m = this.mirror();
    const sr = m ? r.safe.l : r.safe.r;
    const sb = r.safe.b;
    const mx0 = Math.round(48 * bs) + sr + 6;
    const my = r.H - sb - Math.round(48 * bs) - 4;
    const X = (dx: number) => Math.round(m ? mx0 + dx : r.W - mx0 - dx);
    const b: Btn[] = [];
    b.push({ role: 'melee', x: X(0), y: my, r: Math.round(28 * bs) });
    b.push({ role: 'dash', x: X(58 * bs), y: my + Math.round(8 * bs), r: Math.round(19 * bs) });
    b.push({ role: 'rage', x: X(44 * bs), y: my - Math.round(48 * bs), r: Math.round(19 * bs) });
    b.push({ role: 'grab', x: X(-2 * bs), y: my - Math.round(66 * bs), r: Math.round(19 * bs) });
    if (this.ctx.interact) b.push({ role: 'interact', x: X(52 * bs), y: my - Math.round(98 * bs), r: Math.round(20 * bs) });
    if (app.settings?.heavyMode === 'button') b.push({ role: 'heavy', x: X(112 * bs), y: my + Math.round(14 * bs), r: Math.round(17 * bs) });
    b.push({ role: 'pause', x: Math.round(r.W / 2), y: r.safe.t + 14, r: 15 });
    this.btns = b;
  }

  private pick(x: number, y: number): Role {
    const r = app.renderer;
    for (const b of this.btns) {
      if (b.role === 'grab' && !this.ctx.grab) continue;
      if (b.role === 'interact' && !this.ctx.interact) continue;
      const slop = b.role === 'pause' ? 12 : 8;
      if (b.role === 'pause') { if (Math.abs(x - b.x) < 30 && Math.abs(y - b.y) < 20) return 'pause'; continue; }
      if (Math.hypot(x - b.x, y - b.y) <= b.r + slop) return b.role;
    }
    if (y < r.H * 0.2) return 'menu';
    const leftZone = this.mirror() ? x > r.W * 0.55 : x < r.W * 0.45;
    return leftZone ? 'move' : 'aim';
  }

  private stickVec(f: Finger): { x: number; y: number } {
    const R = this.stickR();
    let dx = (f.x - f.bx) / R, dy = (f.y - f.by) / R;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    if (d < 0.12) return { x: 0, y: 0 };
    return { x: dx, y: dy };
  }

  // --------------------------------------------------------------------------
  update(): void {
    if (this.lastFrame === app.frame) return;
    this.lastFrame = app.frame;
    const v = app.input.virtual;
    for (const k of Object.keys(this.pop)) {
      const show = k === 'grab' ? this.ctx.grab : !!this.ctx.interact;
      this.pop[k] = clamp(this.pop[k] + (show ? 0.1 : -0.15), 0, 1);
    }
    for (const rp of this.ripples) rp.t += 1 / 60;
    this.ripples = this.ripples.filter((r) => r.t < 0.35);
    if (this.ctx.mode === 'menu') {
      if (touchPtr.down) { /* position kept by events */ }
      v.move.x = 0; v.move.y = 0; v.aim = null; v.buttons = {};
      return;
    }
    this.computeButtons();
    const buttons: Partial<Record<Action, boolean>> = {};
    let move = { x: 0, y: 0 };
    let aim: { x: number; y: number } | null = null;
    for (const f of this.fingers.values()) {
      switch (f.role) {
        case 'move': move = this.stickVec(f); break;
        case 'aim': { const s = this.stickVec(f); aim = Math.hypot(s.x, s.y) > 0.15 ? s : null; break; }
        case 'melee': buttons.melee = true; break;
        case 'dash': buttons.dash = true; break;
        case 'rage': buttons.rage = true; break;
        case 'grab': buttons.grab = true; break;
        case 'interact': buttons.interact = true; break;
        case 'heavy': buttons.heavy = true; break;
        case 'pause': buttons.pause = true; break;
        default: break;
      }
    }
    if (this.aimHoldFrames > 0 && !aim) { aim = this.aimLast; this.aimHoldFrames--; }
    if (this.pulse.frames > 0 && this.pulse.action) { buttons[this.pulse.action] = true; this.pulse.frames--; }
    v.move.x = move.x; v.move.y = move.y;
    v.aim = aim;
    v.buttons = buttons;
    this.tcount = this.fingers.size;
  }

  // --------------------------------------------------------------------------
  render(g: Ctx): void {
    // tap ripples (menu + gameplay feedback) drawn regardless of mode while touch is in use
    if (this.enabled || this.ripples.length) {
      for (const rp of this.ripples) {
        const k = rp.t / 0.35;
        g.globalAlpha = (1 - k) * 0.7;
        ring(g, rp.x, rp.y, 4 + k * 12, 1, '#fff3c4');
        g.globalAlpha = 1;
      }
    }
    if (!this.enabled || this.ctx.mode === 'menu') return;
    const lay = this.lay();
    const op = clamp(lay.opacity, 0.15, 1);
    if (this.btns.length === 0) this.computeButtons();
    const r = app.renderer;
    const demo = this.demoState;
    const held = (role: Role) => (demo?.buttons?.includes(role) ?? false) || [...this.fingers.values()].some((f) => f.role === role);
    g.save();
    g.globalAlpha = op;
    // sticks
    const R = this.stickR();
    const m = this.mirror();
    const sl = r.safe.l, sr = r.safe.r, sb = r.safe.b;
    const defMove = { x: (m ? r.W - sr - R - 22 : sl + R + 22), y: r.H - sb - R - 14 };
    const defAim = { x: Math.round(m ? r.W * 0.34 : r.W * 0.62), y: r.H - sb - R - 22 };
    const drawStick = (base: { x: number; y: number }, vec: { x: number; y: number } | null, label: string, tint: string, dim: boolean) => {
      g.globalAlpha = op * (vec || !dim ? 1 : 0.55);
      disc(g, base.x, base.y, R, 'rgba(10,12,18,0.42)');
      ring(g, base.x, base.y, R, 2, vec ? '#fff3c4' : '#d9d6cc');
      ring(g, base.x, base.y, R - 6, 1, 'rgba(255,255,255,0.22)');
      // direction ticks
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(Math.round(base.x + Math.cos(a) * (R - 3)) - 1, Math.round(base.y + Math.sin(a) * (R - 3)) - 1, 2, 2);
      }
      const kr = Math.round(R * 0.42);
      const kx = base.x + (vec ? vec.x * (R - kr * 0.4) : 0), ky = base.y + (vec ? vec.y * (R - kr * 0.4) : 0);
      disc(g, kx + 1, ky + 2, kr, 'rgba(0,0,0,0.35)');
      disc(g, kx, ky, kr, C.outline);
      disc(g, kx, ky, kr - 1, vec ? tint : '#e6e3dc');
      disc(g, kx - 1, ky - 1, kr - 4, vec ? '#fff3c4' : '#f8f6ef');
      if (!vec) drawText(g, label, base.x, base.y + R + 3, { color: '#fff', align: 'center', shadow: 'rgba(0,0,0,0.7)' });
    };
    const fm = [...this.fingers.values()].find((f) => f.role === 'move');
    const fa = [...this.fingers.values()].find((f) => f.role === 'aim');
    const mBase = fm ? { x: fm.bx, y: fm.by } : defMove;
    const aBase = fa ? { x: fa.bx, y: fa.by } : defAim;
    const mv = demo?.move ?? (fm ? this.stickVec(fm) : null);
    const av = demo?.aim ?? (fa ? this.stickVec(fa) : null);
    drawStick(mBase, mv && (mv.x || mv.y) ? mv : null, 'MOVE', '#5ec8ff', true);
    drawStick(aBase, av && (av.x || av.y) ? av : null, this.ctx.ranged ? 'AIM / FIRE' : 'AIM', this.ctx.ranged ? '#ffb000' : '#9fb7c4', true);
    if (av && (av.x || av.y) && this.ctx.ranged) {
      // aim line preview
      g.fillStyle = 'rgba(255,243,196,0.7)';
      for (let i = 1; i < 6; i++) g.fillRect(Math.round(aBase.x + av.x * (R + 8 + i * 8)) - 1, Math.round(aBase.y + av.y * (R + 8 + i * 8)) - 1, 2, 2);
    }

    // buttons
    const t = app.time;
    for (const b of this.btns) {
      let sc = 1, alpha = 1;
      if (b.role === 'grab') { sc = easeOutBack(this.pop.grab); alpha = this.pop.grab; if (this.pop.grab <= 0.01) continue; }
      if (b.role === 'interact') { sc = easeOutBack(this.pop.interact); alpha = this.pop.interact; if (this.pop.interact <= 0.01) continue; }
      const down = held(b.role);
      const rr = Math.round(b.r * sc * (down ? 0.92 : 1));
      g.globalAlpha = op * alpha;
      if (b.role === 'pause') { this.drawPause(g, b, down); continue; }
      let tint = '#e6e3dc', rim = '#14161f', glow = false;
      if (b.role === 'melee') tint = '#f2a53a';
      else if (b.role === 'dash') tint = '#5ec8ff';
      else if (b.role === 'heavy') tint = '#e86a3a';
      else if (b.role === 'grab') tint = '#9be37b';
      else if (b.role === 'interact') tint = '#ffd34d';
      else if (b.role === 'rage') {
        tint = this.ctx.rageActive ? '#ff3a2a' : this.ctx.rageReady ? '#ff5a3a' : '#7a5a58';
        glow = this.ctx.rageReady && !this.ctx.rageActive;
      }
      if (glow) {
        const k = 0.5 + 0.5 * Math.sin(t * 7);
        g.globalAlpha = op * (0.35 + 0.4 * k);
        ring(g, b.x, b.y, rr + 3 + k * 4, 2, '#ff8a6a');
        g.globalAlpha = op;
      }
      disc(g, b.x + 1, b.y + 2, rr, 'rgba(0,0,0,0.35)');
      disc(g, b.x, b.y, rr, rim);
      disc(g, b.x, b.y, rr - 1, down ? shadeHex(tint, -0.25) : tint);
      // bevel: top-left light arc, bottom-right dark arc
      arc(g, b.x, b.y, rr - 2, -Math.PI * 0.95, -Math.PI * 0.1, down ? shadeHex(tint, -0.4) : 'rgba(255,255,255,0.65)');
      arc(g, b.x, b.y, rr - 2, Math.PI * 0.05, Math.PI * 0.9, down ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)');
      this.drawSymbol(g, b, rr, down);
      if (b.role === 'rage' && this.ctx.rageActive) ring(g, b.x, b.y, rr + 2, 1, '#ffd34d');
      if (b.role === 'interact' && this.ctx.interact) {
        const label = this.ctx.interact;
        const w = measure(label) + 10;
        const lx = Math.round(clamp(b.x - w / 2, 4, app.renderer.W - w - 4)), ly = Math.round(b.y - rr - 16);
        box(g, lx, ly, w, 13, { face: '#fff3c4', cham: 1, depth: 1 });
        drawText(g, label, Math.round(b.x), ly + 3, { color: C.ink, shadow: null, align: 'center' });
      }
      if (b.role === 'rage' && !this.ctx.rageReady && !this.ctx.rageActive) { g.globalAlpha = op * 0.5; }
    }
    g.restore();
    void this.tcount;
  }

  private drawPause(g: Ctx, b: Btn, down: boolean): void {
    const w = 38, h = 15;
    box(g, b.x - w / 2, b.y - h / 2, w, h, { face: down ? '#bbb8ae' : '#e6e3dc', kind: down ? 'sunken' : 'raised', cham: 2, depth: 1 });
    g.fillStyle = C.ink;
    g.fillRect(b.x - 6, b.y - 4, 3, 8);
    g.fillRect(b.x + 3, b.y - 4, 3, 8);
  }

  private drawSymbol(g: Ctx, b: Btn, rr: number, down: boolean): void {
    const x = b.x + (down ? 0 : 0), y = b.y + (down ? 1 : 0);
    const dark = '#14161f';
    switch (b.role) {
      case 'melee': {
        // fist-impact burst: starburst with a solid core
        g.fillStyle = dark;
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; for (let k = 4; k <= Math.round(rr * 0.62); k++) g.fillRect(Math.round(x + Math.cos(a) * k) - 1, Math.round(y + Math.sin(a) * k) - 1, i % 2 ? 1 : 2, i % 2 ? 1 : 2); }
        disc(g, x, y, 5, dark); disc(g, x, y, 3, '#fff3c4');
        break;
      }
      case 'dash': {
        const c = glyph('right', dark);
        g.drawImage(c, Math.round(x - 7), Math.round(y - 3), 4, 7);
        g.drawImage(c, Math.round(x - 2), Math.round(y - 3), 4, 7);
        g.drawImage(c, Math.round(x + 3), Math.round(y - 3), 4, 7);
        break;
      }
      case 'heavy': {
        g.fillStyle = dark; g.fillRect(x - 5, y - 6, 10, 5); g.fillRect(x - 2, y - 1, 4, 8);
        break;
      }
      case 'rage': {
        const ic = icon('rage');
        g.drawImage(ic, Math.round(x - ic.width / 2), Math.round(y - ic.height / 2));
        break;
      }
      case 'grab': {
        const ic = icon('grab');
        g.drawImage(ic, Math.round(x - ic.width / 2), Math.round(y - ic.height / 2));
        break;
      }
      case 'interact': {
        const ic = icon('interact');
        g.drawImage(ic, Math.round(x - ic.width / 2), Math.round(y - ic.height / 2));
        break;
      }
      default: break;
    }
  }

  /** Dev helper: number of fingers currently tracked. */
  get fingerCount(): number { return this.fingers.size; }
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; } else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Pixel-perfect filled disc (integer scanlines). */
function disc(g: Ctx, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -r; y <= r; y++) {
    const s = Math.floor(Math.sqrt(r * r + r * 0.6 - y * y));
    if (s < 0) continue;
    g.fillRect(cx - s, cy + y, s * 2 + 1, 1);
  }
}

/** Pixel ring of given thickness. */
function ring(g: Ctx, cx: number, cy: number, r: number, th: number, col: string): void {
  g.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  const ri = Math.max(0, r - th);
  for (let y = -r; y <= r; y++) {
    const so = Math.floor(Math.sqrt(r * r + r * 0.6 - y * y));
    if (so < 0) continue;
    const inner = Math.abs(y) < ri ? Math.floor(Math.sqrt(ri * ri + ri * 0.6 - y * y)) : -1;
    if (inner < 0) g.fillRect(cx - so, cy + y, so * 2 + 1, 1);
    else { g.fillRect(cx - so, cy + y, so - inner, 1); g.fillRect(cx + inner + 1, cy + y, so - inner, 1); }
  }
}

function arc(g: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, col: string): void {
  g.fillStyle = col;
  const n = Math.max(8, Math.round(r * (a1 - a0)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

export const touch = new TouchControls();
export { disc as touchDisc, ring as touchRing };
