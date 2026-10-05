// Main menu (spec 9.2): the CorpOS login screen. The player is asked to accept updated HR terms.
// ACCEPT is a darkly funny dead end. DECLINE ("you snapped") starts the game.
import { app, Scene, PLATFORM } from '../core/app';
import { codeToSeed, fxRng } from '../core/rng';
import { audio } from '../audio/audio';
import { Ctx, makeCanvas, ctx2d } from '../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../render/font';
import { touch } from '../ui/touch';
import { Widget, Ui, List, Label, Button, TextField, attachOSK, rowH, btnH, touchy, ptr, Modal } from '../ui/widgets';
import {
  C, box, well, ink, drawGlyph, dim, dropShadow, osIcon, uiS, clamp, easeOutBack, easeOutCubic, stripes, focusRing, inRect, shade, textY, RectL,
} from '../ui/style';
import {
  drawWindow, drawDesktop, drawTaskbar, windowClient, OpenAnim, popRect, titleBarH, taskbarH, notify, updateNotifications, renderNotifications, ConfirmDialog,
} from '../ui/corpos';
import { SettingsScene } from './settings';
import { HR_TERMS, LOGIN_FLAVOUR } from '../data/text/ui';

export interface MainMenuOpts {
  /** DECLINE: starts the game (after the "you snapped" transition). */
  onDecline: () => void;
  onContinue?: () => void;
  hasContinue?: boolean;
  onDaily?: () => void;
  onSeeded?: (seed: number) => void;
  onSettings?: () => void;
  onCredits?: () => void;
  onQuit?: () => void;
  /** Achievement hook: called when the player accepts the terms (count = how many times so far). */
  onAccept?: (count: number) => void;
  version: string;
  /** show Shut Down even on web (dev gallery) */
  forceQuit?: boolean;
}

export const HR_TERMS_FALLBACK = 'UPDATED HR TERMS & CONDITIONS\nCulture Realignment Programme\n\nBy accepting you agree to be realigned.';

const TERMS_FULL: string = typeof HR_TERMS === 'string' && HR_TERMS.length > 20 ? HR_TERMS : HR_TERMS_FALLBACK;
const TERMS_SPLIT = TERMS_FULL.indexOf('\n');
const TERMS_TITLE = TERMS_FULL.slice(0, TERMS_SPLIT > 0 ? TERMS_SPLIT : TERMS_FULL.length).trim();
const TERMS_BODY = TERMS_SPLIT > 0 ? TERMS_FULL.slice(TERMS_SPLIT + 1).trim() : '';

let acceptCount = 0;

const ACCEPT_LINES = [
  'Thank you for your compliance.',
  'You have already complied. Compliance is now mandatory.',
  'This has been noted on your file. Please stop.',
  'The Decline button is right there. Just saying.',
];

// ---------------------------------------------------------------------------
class DesktopIcon extends Widget {
  constructor(public label: string, public glyph: string, public tint: string, public onOpen: () => void, public appear = 0) { super(); }
  override activate(): void { this.press = 1; audio.sfx('ui_select'); this.onOpen(); }
  override draw(g: Ctx): void {
    const a = easeOutCubic(clamp(this.appear, 0, 1));
    if (a <= 0) return;
    g.globalAlpha = a;
    const sel = this.focused || this.hovered;
    const tile = osIcon(this.glyph, this.tint, 24);
    const tx = Math.round(this.x + (this.w - 24) / 2), ty = this.y + 3 + (this.press > 0.4 ? 1 : 0) + Math.round((1 - a) * 6);
    if (sel) { g.fillStyle = 'rgba(255,243,196,0.16)'; g.fillRect(this.x + 2, this.y, this.w - 4, this.h); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(tx + 2, ty + 3, 24, 24);
    g.drawImage(tile, tx, ty);
    const lw = measure(this.label) + 6;
    const lx = Math.round(this.x + (this.w - lw) / 2), ly = ty + 27;
    if (this.focused) { g.fillStyle = C.navyHi; g.fillRect(lx, ly - 1, lw, 11); g.fillStyle = C.gold; g.fillRect(lx, ly + 10, lw, 1); }
    if (!this.focused) { g.fillStyle = 'rgba(8,12,20,0.5)'; g.fillRect(lx, ly - 1, lw, 11); }
    drawText(g, this.label, this.x + this.w / 2, ly + 1, { align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.8)' });
    if (this.focused) focusRing(g, this.x + 1, this.y - 1, this.w - 2, this.h + 1, 1);
    g.globalAlpha = 1;
  }
}

/** Focusable scrolling text pane (up/down scroll while focused). */
class ScrollText extends List {
  override focusable = true;
  label: Label;
  constructor(text: string) { super(); this.label = new Label(text); this.add(this.label); this.padX = 6; this.padY = 4; }
  override nav(_dx: number, dy: number): boolean {
    if (!dy) return false;
    const step = LINE_H * uiS() * 3;
    if (dy > 0 && this.target < this.maxScroll() - 0.5) { this.target = clamp(this.target + step, 0, this.maxScroll()); return true; }
    if (dy < 0 && this.target > 0.5) { this.target = clamp(this.target - step, 0, this.maxScroll()); return true; }
    return false;
  }
  override activate(): void { /* confirm scrolls a page */ this.target = this.target >= this.maxScroll() - 1 ? 0 : clamp(this.target + this.h - 20, 0, this.maxScroll()); audio.sfx('ui_move'); }
  override draw(g: Ctx, ui: Ui): void {
    this.background = '#fffdf6';
    super.draw(g, ui);
    if (this.focused) focusRing(g, this.x, this.y, this.w, this.h, 1);
  }
  get progress(): number { return this.maxScroll() <= 0 ? 1 : this.scroll / this.maxScroll(); }
}

// ---------------------------------------------------------------------------
class SeedDialog implements Modal {
  done = false;
  ui: Ui;
  private anim = new OpenAnim(9);
  private tf: TextField;
  private ok: Button; private cancel: Button;
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private err = ''; private errT = 0; private shake = 0;
  constructor(private onSeed: (seed: number) => void) {
    this.ui = new Ui({ onBack: () => { this.done = true; } });
    const fmt = (v: string) => { const c = v.replace(/-/g, ''); return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
    this.tf = new TextField('Seed code', '', {
      maxLen: 9, placeholder: 'XXXX-XXXX', format: fmt,
      filter: (ch) => (/[0-9a-z]/i.test(ch) ? ch.toUpperCase() : ''),
      onSubmit: () => this.go(),
    });
    attachOSK(this.ui, this.tf, 'Enter seed code', 8);
    this.ui.add(this.tf);
    this.ok = this.ui.add(new Button({ text: 'Start run', kind: 'primary', onPress: () => this.go(), sound: 'ui_select' }));
    this.cancel = this.ui.add(new Button({ text: 'Cancel', onPress: () => { this.done = true; }, sound: 'ui_back' }));
    this.ui.setFocus(this.tf);
    if (app.input.device === 'kbm') this.tf.activate();
    audio.sfx('ui_select');
  }
  private go(): void {
    const seed = codeToSeed(this.tf.value);
    if (seed === null) { this.err = this.tf.value ? 'Invalid seed code. Checksum failed. HR has been notified.' : 'Please enter a seed code.'; this.errT = 3; this.shake = 1; audio.sfx('ui_error'); return; }
    this.done = true;
    this.onSeed(seed);
  }
  update(dt: number): void {
    this.anim.step(dt);
    this.errT = Math.max(0, this.errT - dt); this.shake = Math.max(0, this.shake - dt * 4);
    const r = app.renderer, s = uiS();
    const th = titleBarH();
    const w = Math.min(r.W - 24, s === 2 ? 440 : 330), h = th + 12 + rowH() + 16 + LINE_H * s * 2 + btnH() + 22;
    this.win = { x: Math.round((r.W - w) / 2), y: Math.round((r.H - h) / 2), w, h };
    const cl = windowClient(this.win);
    this.tf.set(cl.x + 6, cl.y + 8, cl.w - 12, rowH() + 2);
    const bw = Math.min(110 * s, Math.floor((cl.w - 24) / 2));
    const by = this.win.y + h - btnH() - 10;
    this.ok.set(this.win.x + w / 2 - bw - 4, by, bw, btnH());
    this.cancel.set(this.win.x + w / 2 + 4, by, bw, btnH());
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    dim(g, 0.55 * this.anim.t);
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    drawWindow(g, 'Enter Seed Code', rr, { icon: 'hash', close: false });
    if (!this.anim.done) return;
    const s = uiS();
    const cl = windowClient(this.win);
    this.ui.render(g);
    const ty = this.tf.y + this.tf.h + 6;
    const off = this.shake > 0 ? Math.round(Math.sin(this.shake * 40) * 3 * this.shake) : 0;
    if (this.errT > 0) wrap(this.err, cl.w - 12, s).slice(0, 2).forEach((l, i) => ink(g, l, cl.x + 8 + off, ty + i * LINE_H * s, { scale: s, color: '#a82828' }));
    else wrap('Seeds are shared by friends, rivals and the occasional disgruntled ex-colleague.', cl.w - 12, s).slice(0, 2).forEach((l, i) => ink(g, l, cl.x + 8, ty + i * LINE_H * s, { scale: s, color: C.inkDim }));
    this.ui.drawHints(g, this.win.x + 8, this.win.y + this.win.h + 5, this.win.w - 16, undefined, 'center', true);
    this.ui.drawCursor(g);
  }
}

// ---------------------------------------------------------------------------
// CRT overlay (tasteful): scanlines + vignette baked once per size
let crtCache: { w: number; h: number; img: HTMLCanvasElement } | null = null;
function crtOverlay(w: number, h: number): HTMLCanvasElement {
  if (crtCache && crtCache.w === w && crtCache.h === h) return crtCache.img;
  const c = makeCanvas(w, h), g = ctx2d(c);
  g.fillStyle = 'rgba(0,0,0,0.075)';
  for (let y = 1; y < h; y += 2) g.fillRect(0, y, w, 1);
  const grd = g.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.56);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  crtCache = { w, h, img: c };
  return c;
}


/** Big pixel title: coloured extrusion, thin dark outline, white fill with a gold lower half. */
function titleText(g: Ctx, text: string, cx: number, y: number, sc: number, extrude: string, gold = true): void {
  const ex = Math.max(2, Math.round(sc * 1.2));
  const draw = (dx: number, dy: number, c: string) => drawText(g, text, cx + dx, y + dy, { scale: sc, color: c, align: 'center', shadow: null });
  for (let k = ex + 1; k >= 1; k--) draw(Math.round(k * 0.8), k, k === ex + 1 ? '#14161f' : extrude);
  const o = Math.max(1, Math.round(sc / 2));
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) draw(dx, dy, '#14161f');
  draw(0, 0, '#fff');
  if (gold) {
    g.save(); g.beginPath(); g.rect(cx - 400, y + Math.round(4 * sc), 800, 4 * sc + 2); g.clip();
    draw(0, 0, '#ffe08a');
    g.restore();
  }
}

// ---------------------------------------------------------------------------
type State = 'intro' | 'login' | 'accept' | 'snap';

export class MainMenuScene implements Scene {
  name = 'mainmenu';
  private ui: Ui;
  private state: State = 'intro';
  private st = 0;                 // time in state
  private t = 0;                  // scene time
  private idle = 0;
  private icons: DesktopIcon[] = [];
  private terms: ScrollText;
  private btnAccept: Button; private btnDecline: Button;
  private anim = new OpenAnim(5);
  private buf = makeCanvas(640, 360);
  private bg!: Ctx;
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private flavour = fxRng.pick(LOGIN_FLAVOUR) ?? 'Welcome to your desk.';
  private prevMode: 'gameplay' | 'menu' = 'gameplay';
  private declineFired = false;
  private snapFlags = { zap: false, smash: false, gong: false };
  private acceptMsg = ''; private acceptStage = 0;
  private flicker = 0;
  private saver = { x: 60, y: 60, vx: 38, vy: 27, hue: 0 };
  private audioUnlocked = false;

  constructor(private o: MainMenuOpts) {
    this.ui = new Ui();
    this.terms = new ScrollText(TERMS_BODY);
    this.btnAccept = new Button({ text: 'ACCEPT', kind: 'primary', onPress: () => this.accept(), sound: 'ui_select' });
    this.btnDecline = new Button({ text: 'DECLINE', kind: 'danger', onPress: () => this.decline(), sound: null });
    const ic = (label: string, glyph: string, tint: string, fn: () => void) => new DesktopIcon(label, glyph, tint, fn);
    if (o.hasContinue && o.onContinue) this.icons.push(ic('Continue Shift', 'play', '#2c8a50', () => o.onContinue!()));
    if (o.onDaily) this.icons.push(ic('Daily Run', 'calendar', '#c98a1a', () => o.onDaily!()));
    if (o.onSeeded) this.icons.push(ic('Enter Seed', 'hash', '#7a5fc8', () => this.ui.openModal(new SeedDialog((s) => o.onSeeded!(s)))));
    this.icons.push(ic('Control Panel', 'gear', '#1f7f8e', () => (o.onSettings ? o.onSettings() : app.push(new SettingsScene(() => app.pop())))));
    if (o.onCredits) this.icons.push(ic('Credits', 'user', '#3f6fb0', () => o.onCredits!()));
    if ((o.onQuit && PLATFORM !== 'web') || o.forceQuit) this.icons.push(ic('Shut Down', 'power', '#b83a32', () => this.ui.openModal(new ConfirmDialog({
      title: 'Shut Down', message: 'Are you sure you want to leave the building? Your absence will be noted.', confirmText: 'Shut down', cancelText: 'Stay', danger: true, onConfirm: () => o.onQuit?.(),
    }))));
    for (const i of this.icons) this.ui.add(i);
    this.ui.add(this.terms); this.ui.add(this.btnAccept); this.ui.add(this.btnDecline);
    this.ui.setFocus(this.icons[0]?.label === 'Continue Shift' ? this.icons[0] : this.btnDecline);
  }

  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    audio.music.play('menu', 0.8);
  }
  exit(): void { touch.setContext({ mode: this.prevMode }); }
  resume(): void { touch.setContext({ mode: 'menu' }); }

  // ---- actions
  private accept(): void {
    if (this.state !== 'login') return;
    acceptCount++;
    this.state = 'accept'; this.st = 0; this.acceptStage = 0;
    this.acceptMsg = ACCEPT_LINES[Math.min(acceptCount, ACCEPT_LINES.length) - 1];
    audio.sfx('ui_login');
    this.o.onAccept?.(acceptCount);
  }
  private decline(): void {
    if (this.state !== 'login') return;
    this.state = 'snap'; this.st = 0;
    this.snapFlags = { zap: false, smash: false, gong: false };
    audio.sfx('ui_error');
  }

  // ---- layout
  private layout(): void {
    const r = app.renderer, s = uiS();
    const tb = taskbarH();
    const logoH = s === 2 ? 44 : 58;
    const top = r.safe.t + logoH + 6;
    const bottom = r.H - tb - r.safe.b - 8;
    // icons
    const pitch = touchy() ? 48 : 43;
    const colW = 88;
    const perCol = Math.max(1, Math.floor((bottom - top) / pitch));
    const cols = Math.ceil(this.icons.length / perCol);
    this.icons.forEach((ic, i) => {
      ic.set(r.safe.l + 6 + Math.floor(i / perCol) * colW, top + (i % perCol) * pitch, colW - 4, pitch - 3);
      ic.appear = (this.t - 0.5 - i * 0.07) / 0.25;
    });
    const x0 = r.safe.l + 6 + cols * colW + 4;
    const avail = r.W - r.safe.r - 8 - x0;
    const ww = Math.min(avail, s === 2 ? 470 : 440);
    const wh = Math.min(bottom - top, 252);
    this.win = { x: Math.round(x0 + (avail - ww) / 2), y: Math.round(top + (bottom - top - wh) / 2) - 2, w: ww, h: wh };
    const cl = windowClient(this.win, true);
    const headH = 26 * (s === 2 ? 1.2 : 1);
    const footH = btnH() + 10;
    this.terms.set(cl.x + 4, cl.y + headH + 4, cl.w - 8, cl.h - headH - footH - 10);
    this.terms.label.opts = { scale: s };
    const bw = Math.min(Math.floor((cl.w - 8 - 8) / 2), 130 * s);
    const by = cl.y + cl.h - footH + 4;
    this.btnAccept.set(cl.x + 4 + (cl.w - 8) / 2 - bw - 4, by, bw, btnH());
    this.btnDecline.set(cl.x + 4 + (cl.w - 8) / 2 + 4, by, bw, btnH());
  }

  // ---- update
  update(dt: number): void {
    const i = app.input;
    touch.update();
    updateNotifications(dt);
    this.t += dt; this.st += dt;
    this.flicker -= dt;
    if (this.flicker < -5 - ((this.t * 13) % 4)) this.flicker = 0.18;
    if (!this.audioUnlocked && (i.lastKey || i.clicks.length)) { this.audioUnlocked = true; audio.unlock(); }
    const activity = !!i.lastKey || i.clicks.length > 0 || i.mouse.moved || ptr.down || Math.hypot(i.move().x, i.move().y) > 0.3 || i.pressed('confirm');
    if (activity) this.idle = 0; else this.idle += dt;
    this.layout();
    switch (this.state) {
      case 'intro': {
        this.anim.step(dt);
        if (this.st > 0.9) { this.state = 'login'; this.st = 0; }
        break;
      }
      case 'login': {
        this.anim.step(dt);
        if (this.idle < 40) this.ui.update(dt);
        else if (activity) this.idle = 0;
        break;
      }
      case 'accept': {
        const stage = this.st < 2.4 ? 0 : this.st < 5 ? 1 : 2;
        if (stage === 1 && this.acceptStage === 0) audio.sfx('stinger_announcement');
        this.acceptStage = stage;
        if (this.st < 2.4 && Math.floor(this.st * 12) !== Math.floor((this.st - dt) * 12)) audio.sfx('ui_typing', { vol: 0.35 });
        if (this.st > 6.6) { this.state = 'login'; this.st = 0; this.terms.scroll = this.terms.target = 0; this.ui.setFocus(this.btnDecline); }
        break;
      }
      case 'snap': {
        const t = this.st;
        if (t > 0.7 && !this.snapFlags.zap) { this.snapFlags.zap = true; audio.sfx('electric_zap'); }
        if (t > 1.35 && !this.snapFlags.smash) { this.snapFlags.smash = true; audio.sfx('screen_smash'); audio.music.play('none', 0.3); }
        if (t > 1.55 && !this.snapFlags.gong) { this.snapFlags.gong = true; audio.sfx('gong'); }
        if ((i.pressed('confirm') || i.clicks.length) && t > 2.0 && t < 3.3) this.st = 3.3;
        if (this.st > 3.4 && !this.declineFired) { this.declineFired = true; this.o.onDecline(); }
        break;
      }
    }
    if (this.idle >= 40) {
      const sv = this.saver;
      const r = app.renderer;
      sv.x += sv.vx * dt; sv.y += sv.vy * dt;
      const w = 150, h = 30;
      if (sv.x < 0) { sv.x = 0; sv.vx = Math.abs(sv.vx); sv.hue++; }
      if (sv.x > r.W - w) { sv.x = r.W - w; sv.vx = -Math.abs(sv.vx); sv.hue++; }
      if (sv.y < 0) { sv.y = 0; sv.vy = Math.abs(sv.vy); sv.hue++; }
      if (sv.y > r.H - h) { sv.y = r.H - h; sv.vy = -Math.abs(sv.vy); sv.hue++; }
    }
  }

  // ---- render
  render(): void {
    const r = app.renderer, f = r.f;
    if (this.buf.width !== r.W || this.buf.height !== r.H) { this.buf = makeCanvas(r.W, r.H); this.bg = ctx2d(this.buf); }
    if (!this.bg) this.bg = ctx2d(this.buf);
    const g = this.bg;
    g.clearRect(0, 0, r.W, r.H);
    const snap = this.state === 'snap';
    if (!(snap && this.st > 1.35)) this.drawLogin(g);
    // compose to the frame with effects
    f.fillStyle = '#000'; f.fillRect(0, 0, r.W, r.H);
    if (snap) this.composeSnap(f, g);
    else {
      f.drawImage(this.buf, 0, 0);
      if (this.idle >= 40) this.drawSaver(f);
    }
    // CRT: tasteful scanlines + vignette (not during the black title card)
    if (!(snap && this.st > 1.35)) {
      f.drawImage(crtOverlay(r.W, r.H), 0, 0);
      const roll = ((this.t * 22) % (r.H + 60)) - 40;
      f.fillStyle = 'rgba(255,255,255,0.025)'; f.fillRect(0, Math.round(roll), r.W, 26);
    }
    if (snap) this.drawSnapOverlay(f);
    renderNotifications(f);
    this.ui.drawCursor(f);
    if (this.idle >= 40) { /* cursor hidden by activity reset */ }
  }

  private drawLogo(g: Ctx, cx: number, y: number, scale: number, jitter = 0): void {
    titleText(g, 'COMPANY POLICY', cx + Math.round(jitter), y, scale, '#b36b00');
  }

  private drawLogin(g: Ctx): void {
    const r = app.renderer, s = uiS();
    drawDesktop(g, 'login', this.t);
    // logo
    const lscale = s === 2 ? 3 : 4;
    const lw = measure('COMPANY POLICY', lscale);
    const lx = Math.round(r.W / 2);
    const intro = easeOutBack(clamp(this.t / 0.7, 0, 1));
    const ly = r.safe.t + 8 - Math.round((1 - intro) * 30);
    const jit = this.flicker > 0 ? (Math.floor(this.flicker * 60) % 2 ? 3 : -3) : 0;
    if (this.flicker > 0) { g.globalAlpha = 0.5; drawText(g, 'COMPANY POLICY', lx + 3, ly + 1, { scale: lscale, color: '#00d1c1', align: 'center', shadow: null }); g.globalAlpha = 1; }
    this.drawLogo(g, lx, ly, lscale, jit);
    const sub = 'CorpOS 4.2  -  Human Capital Edition';
    const sy = ly + 8 * lscale + 5;
    drawText(g, sub, lx, sy, { align: 'center', color: '#cfe0f5', scale: 1 });
    // taskbar
    const tbr = drawTaskbar(g, { startLabel: 'CorpOS', items: [{ label: 'HR Terms', glyph: 'doc', active: true }], tray: ['bell', 'user'] });
    const hintX = (tbr.items[0] ? tbr.items[0].x + tbr.items[0].w : 150) + 14;
    const tb = taskbarH();
    if (this.state === 'login' && !touchy()) {
      const by = r.H - tb - r.safe.b;
      if (s === 1) this.ui.drawHints(g, hintX, by + Math.round((tb - 9) / 2) + 1, r.W - r.safe.r - hintX - 150, this.compactHints(), 'left');
    }
    drawText(g, 'v' + this.o.version, r.W - r.safe.r - 70, r.H - tb - r.safe.b + 7, { color: C.inkDim, shadow: null, align: 'right' });
    // window
    const full = this.win;
    const rr = this.anim.done ? full : popRect(full, easeOutCubic(this.anim.t));
    const shake = this.state === 'snap' ? this.snapShake() : 0;
    const wr = { ...rr, x: rr.x + shake };
    const res = drawWindow(g, 'HR Terms Update - Action Required', wr, { icon: 'warn', status: this.statusText(), tint: this.state === 'snap' && this.st > 0.1 ? '#8a2020' : undefined, close: false });
    if (!this.anim.done) return;
    // desktop icons draw even during intro (staggered)
    const cl = res.client;
    // header
    const s1 = uiS();
    const hh = 26 * (s === 2 ? 1.2 : 1);
    well(g, cl.x + 4 + shake, cl.y + 2, cl.w - 8, hh, '#fbfaf5');
    box(g, cl.x + 7 + shake, cl.y + 5, hh - 6, hh - 6, { face: '#ffe9a0', cham: 1, depth: 1 });
    drawGlyph(g, 'warn', cl.x + 7 + shake + (hh - 6) / 2, cl.y + 5 + (hh - 6) / 2, '#a45c00', 1);
    ink(g, TERMS_TITLE, cl.x + hh + 8 + shake, cl.y + 5, { color: C.navy, scale: s1 === 2 ? 1 : 1 });
    const caret = Math.floor(this.t * 2.2) % 2 === 0 ? '_' : ' ';
    ink(g, 'Signed in as: EMPLOYEE 0451 (probationary)' + caret, cl.x + hh + 8 + shake, cl.y + 5 + 11, { color: C.inkDim });
    // draw widgets (shifted when shaking)
    if (shake) { g.save(); g.translate(shake, 0); }
    this.ui.render(g);
    if (shake) g.restore();
    // read progress + flavour
    const prog = Math.round(this.terms.progress * 100);
    const sbY = this.terms.y + this.terms.h + 2;
    drawText(g, `Read: ${prog}%`, this.terms.x + 2 + shake, sbY + 3, { color: C.inkDim, shadow: null });
    if (this.state === 'accept') this.drawAccept(g, full);
  }

  private compactHints() {
    const dev = app.input.device;
    const h = this.ui.autoHints();
    if (touchy()) return [];
    return dev === 'touch' ? [] : h.filter((x) => x.action !== 'back').slice(0, 2);
  }

  private statusText(): string {
    if (this.state === 'snap') return 'ACCESS DENIED';
    return this.flavour;
  }

  private snapShake(): number {
    const t = this.st;
    if (t < 0.05 || t > 0.9) return 0;
    return Math.round(Math.sin(t * 90) * 4 * (1 - t));
  }

  // accept dead-end overlay
  private drawAccept(g: Ctx, full: RectL): void {
    const r = app.renderer, s = uiS();
    const t = this.st;
    if (this.acceptStage === 0) {
      dim(g, 0.55);
      const w = Math.min(r.W - 40, 340), h = 78 + (s - 1) * 24;
      const x = Math.round((r.W - w) / 2), y = Math.round((r.H - h) / 2);
      const res = drawWindow(g, 'Culture Realignment Programme', { x, y, w, h }, { icon: 'user', close: false });
      const cl = res.client;
      const steps = ['Updating personality...', 'Removing remaining autonomy...', 'Installing enthusiasm...', 'Finalising compliance...'];
      const p = clamp(t / 2.3, 0, 1);
      ink(g, steps[Math.min(3, Math.floor(p * 4))], cl.x + 8, cl.y + 6, { scale: s });
      well(g, cl.x + 8, cl.y + 8 + 9 * s + 4, cl.w - 16, 12, '#fbfaf5');
      const cells = Math.floor((cl.w - 20) / 6);
      for (let k = 0; k < Math.round(cells * p); k++) { g.fillStyle = C.navyHi; g.fillRect(cl.x + 10 + k * 6, cl.y + 8 + 9 * s + 6, 5, 8); g.fillStyle = shade(C.navyHi, 0.4); g.fillRect(cl.x + 10 + k * 6, cl.y + 8 + 9 * s + 6, 5, 1); }
      ink(g, Math.round(p * 100) + '%', cl.x + cl.w - 8, cl.y + 6, { align: 'right', color: C.inkDim });
    } else {
      // dim to black and show the line
      const k = clamp((t - 2.4) / 1.4, 0, 1);
      g.fillStyle = `rgba(4,6,10,${0.55 + 0.45 * k})`; g.fillRect(0, 0, r.W, r.H);
      const lines = wrap(this.acceptMsg, r.W - 60, 2);
      const a = easeOutCubic(clamp((t - 2.6) / 0.6, 0, 1));
      const fade = this.acceptStage === 2 ? clamp(1 - (t - 5.2) / 1.2, 0, 1) : 1;
      g.globalAlpha = a * fade;
      lines.forEach((l, i) => drawText(g, l, r.W / 2, r.H / 2 - 16 + i * 22, { scale: 2, align: 'center', color: '#e8eef8' }));
      const b = clamp((t - 3.8) / 0.6, 0, 1);
      g.globalAlpha = b * fade;
      drawText(g, 'Please return to your desk.', r.W / 2, r.H / 2 + 26 + (lines.length - 1) * 22, { align: 'center', color: '#8fa6c8' });
      g.globalAlpha = 1;
    }
    void full;
  }

  private drawSaver(g: Ctx): void {
    const r = app.renderer;
    const a = clamp((this.idle - 40) / 1.5, 0, 0.92);
    g.fillStyle = `rgba(3,5,9,${a})`; g.fillRect(0, 0, r.W, r.H);
    const sv = this.saver;
    const cols = ['#ffd34d', '#5ec8ff', '#9be37b', '#ff9a4d', '#c5a8ff'];
    const c = cols[sv.hue % cols.length];
    g.globalAlpha = a;
    box(g, Math.round(sv.x), Math.round(sv.y), 150, 30, { face: shade(c, -0.55), cham: 2, depth: 1 });
    drawGlyph(g, 'logo', sv.x + 16, sv.y + 15, c, 2);
    drawText(g, 'COMPANY', sv.x + 34, sv.y + 5, { color: c, shadow: null });
    drawText(g, 'POLICY', sv.x + 34, sv.y + 16, { color: c, shadow: null });
    drawText(g, 'Your idle time is being recorded.', r.W / 2, r.H - 24, { align: 'center', color: '#5a6a85', shadow: null });
    g.globalAlpha = 1;
  }

  // ---- decline sequence
  private composeSnap(f: Ctx, src: Ctx): void {
    const r = app.renderer;
    const t = this.st;
    void src;
    if (t < 1.35) {
      const amt = clamp((t - 0.55) / 0.8, 0, 1);
      // slice displacement
      const sl = 18;
      for (let y = 0; y < r.H; y += sl) {
        let off = 0;
        if (amt > 0) { const n = Math.sin(y * 12.9898 + Math.floor(t * 24) * 78.233) * 43758.5453; const q = n - Math.floor(n); if (q < 0.15 + amt * 0.6) off = Math.round((q - 0.4) * 60 * amt); }
        f.drawImage(this.buf, 0, y, r.W, sl, off, y, r.W, sl);
        if (off && amt > 0.3) { f.globalAlpha = 0.5; f.drawImage(this.buf, 0, y, r.W, sl, off + 3, y, r.W, sl); f.globalAlpha = 1; }
      }
      // inverted bars
      if (amt > 0.2) {
        f.globalCompositeOperation = 'difference'; f.fillStyle = '#fff';
        for (let k = 0; k < 4; k++) { const n = Math.sin(k * 91.7 + Math.floor(t * 18) * 12.3) * 9999; const q = n - Math.floor(n); if (q < amt) f.fillRect(0, Math.round(q * r.H), r.W, 2 + Math.round(q * 10)); }
        f.globalCompositeOperation = 'source-over';
      }
      // red flash (access denied)
      const flash = t < 0.35 ? (1 - t / 0.35) * 0.55 : 0;
      f.fillStyle = `rgba(224,40,40,${flash + amt * 0.25})`; f.fillRect(0, 0, r.W, r.H);
    }
  }

  private drawSnapOverlay(f: Ctx): void {
    const r = app.renderer, t = this.st;
    if (t < 0.9) {
      // ACCESS DENIED stamp
      const k = clamp((t - 0.05) / 0.12, 0, 1);
      if (k > 0) {
        const label = 'ACCESS DENIED';
        const sc = 3;
        const w = measure(label, sc) + 24, h = 7 * sc + 20;
        const x = Math.round((r.W - w) / 2), y = Math.round(r.H / 2 - h / 2 + (1 - k) * -20);
        f.globalAlpha = Math.min(1, k * 1.4) * (t > 0.7 ? clamp(1 - (t - 0.7) / 0.2, 0, 1) : 1);
        f.fillStyle = '#14161f'; f.fillRect(x - 3, y - 3, w + 6, h + 6);
        f.fillStyle = '#e04545'; f.fillRect(x, y, w, h);
        f.fillStyle = '#14161f'; f.fillRect(x + 4, y + 4, w - 8, h - 8);
        drawText(f, label, r.W / 2, y + 10, { scale: sc, color: '#ff5a4a', align: 'center', shadow: null });
        f.globalAlpha = 1;
      }
    }
    if (t >= 1.35) {
      f.fillStyle = '#05060a'; f.fillRect(0, 0, r.W, r.H);
      // faint red vignette
      const grd = f.createRadialGradient(r.W / 2, r.H / 2, 20, r.W / 2, r.H / 2, r.W * 0.6);
      grd.addColorStop(0, 'rgba(120,10,16,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = grd; f.fillRect(0, 0, r.W, r.H);
      if (t >= 1.55) {
        const k = clamp((t - 1.55) / 0.18, 0, 1);
        const settle = clamp((t - 1.55) / 0.5, 0, 1);
        const sc = 5 + Math.round((1 - easeOutCubic(k)) * 3);
        const trem = Math.round(Math.sin(t * 70) * 3 * (1 - settle));
        const y = Math.round(r.H / 2 - 30);
        // flash
        if (t < 1.75) { f.fillStyle = `rgba(255,70,50,${(1.75 - t) * 3.5})`; f.fillRect(0, 0, r.W, r.H); }
        const text = 'COMPANY POLICY';
        const cx = Math.round(r.W / 2) + trem;
        const fit = Math.min(sc, Math.max(1, Math.floor((r.W - 40) / measure(text, 1))));
        titleText(f, text, cx, y, fit, '#a31b22', false);
        // tagline typed
        const tag = 'Terms declined. Initiating Culture Realignment.';
        const n = Math.floor(clamp((t - 2.0) * 38, 0, tag.length));
        drawText(f, tag.slice(0, n), r.W / 2, y + 8 * fit + 24, { align: 'center', color: '#e86a5a', scale: 1 });
      }
    }
  }
}
