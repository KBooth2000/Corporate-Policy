// Shared base for the hub's CorpOS windows (vending catalogue, car boot, noticeboard, dashboard, radio, clock-in).
// A panel is a transparent scene pushed over the hub: dimmed backdrop, popping window, Ui focus navigation
// (controller / keyboard / mouse / touch), notifications and a close button.
import { app, Scene } from '../../../core/app';
import { audio } from '../../../audio/audio';
import { Ctx } from '../../../render/canvas';
import { touch } from '../../../ui/touch';
import { Ui, Button, btnH, rowH } from '../../../ui/widgets';
import { dim, uiS, inRect, easeOutCubic, RectL } from '../../../ui/style';
import { drawWindow, OpenAnim, popRect, windowClient, notify, updateNotifications, renderNotifications } from '../../../ui/corpos';

export interface PanelOpts {
  title: string;
  glyph: string;
  /** preferred window size (clamped to the screen) */
  w?: number; h?: number;
  closeText?: string;
  tint?: string;
  onClose?: () => void;
}

export abstract class PanelScene implements Scene {
  name = 'panel';
  transparent = true;
  ui: Ui;
  anim = new OpenAnim(8);
  win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  closeBtn: Button;
  protected statusText = '';
  protected closeRect: RectL = { x: 0, y: 0, w: 0, h: 0 };
  protected t = 0;
  private prevMode: 'gameplay' | 'menu' = 'menu';
  private closed = false;

  constructor(protected o: PanelOpts) {
    this.ui = new Ui({ onBack: () => this.back() });
    this.closeBtn = new Button({ text: o.closeText ?? 'Close', kind: 'primary', onPress: () => this.close(), sound: 'ui_back' });
  }

  /** Subclasses add their widgets then call this last so the close button is last in the focus order. */
  protected finishBuild(): void { this.ui.add(this.closeBtn); }

  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    audio.sfx('ui_login');
  }
  exit(): void { touch.setContext({ mode: this.prevMode }); }
  resume(): void { touch.setContext({ mode: 'menu' }); }

  /** Default back behaviour: focus returns to the first widget, then closes. Override for sub-navigation. */
  protected back(): void { this.close(); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    audio.sfx('ui_back');
    app.remove(this);
    this.o.onClose?.();
  }

  protected abstract layout(cl: RectL): void;
  protected abstract drawBody(g: Ctx, cl: RectL): void;
  protected tick(_dt: number): void { /* optional */ }

  /** Footer height (close button row). */
  protected footH(): number { return btnH() + 8; }

  update(dt: number): void {
    this.t += dt;
    touch.update();
    updateNotifications(dt);
    this.anim.step(dt);
    this.tick(dt);
    const r = app.renderer;
    const aw = r.W - r.safe.l - r.safe.r, ah = r.H - r.safe.t - r.safe.b;
    const ww = Math.min(aw - 8, this.o.w ?? 600), wh = Math.min(ah - 6, this.o.h ?? 340);
    this.win = { x: Math.round(r.safe.l + (aw - ww) / 2), y: Math.round(r.safe.t + (ah - wh) / 2), w: ww, h: wh };
    const cl = windowClient(this.win, true);
    this.layout(cl);
    const cw = Math.max(this.closeBtn.autoW(14), 76);
    this.closeBtn.set(cl.x + cl.w - cw - 2, cl.y + cl.h - this.footH() + 4, cw, btnH());
    if (this.anim.done) for (const c of app.input.clicks) if (c.button === 0 && inRect(this.closeRect, c.x, c.y)) { this.close(); return; }
    this.ui.update(dt);
  }

  render(): void {
    const g = app.renderer.f;
    dim(g, 0.62 * easeOutCubic(this.anim.t));
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    const res = drawWindow(g, this.o.title, rr, { icon: this.o.glyph, status: this.statusText || undefined, close: true, tint: this.o.tint });
    this.closeRect = res.close;
    if (!this.anim.done) return;
    this.drawBody(g, res.client);
    this.ui.render(g);
    const s = uiS();
    const cl = res.client;
    const hy = cl.y + cl.h - btnH() - 4 + Math.round((btnH() - 9 * s) / 2) + 1;
    this.ui.drawHints(g, cl.x + 4, hy, cl.w - this.closeBtn.w - 16, undefined, 'left');
    renderNotifications(g);
    this.ui.drawCursor(g);
  }

  protected say(text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info', title = 'Notice'): void {
    this.statusText = text;
    notify({ kind, title, body: text, duration: 3, sound: kind === 'bad' ? 'ui_error' : false });
  }

  /** Standard row height for list rows in this UI scale / device. */
  rowHeight(mult = 1.6): number { return Math.round(rowH() * mult) + (uiS() === 2 ? 4 : 2); }
}
