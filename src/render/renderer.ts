// Integer-scaled pixel renderer (spec 9.1). Base 640x360; the view extends
// horizontally up to 21:9 and vertically up to 16:10 so no black bars on Deck/phones.
import { makeCanvas, ctx2d, Ctx } from './canvas';
import { clamp } from '../core/math';

export const BASE_W = 640;
export const BASE_H = 360;
const MAX_W = 864;
const MAX_H = 400;

export class Renderer {
  screen: HTMLCanvasElement;
  sctx: Ctx;
  /** Final composed internal-resolution frame. */
  frame!: HTMLCanvasElement;
  f!: Ctx;
  /** World layer (camera space) — composited into frame with zoom. */
  world!: HTMLCanvasElement;
  w!: Ctx;
  W = BASE_W;
  H = BASE_H;
  scale = 1;
  offX = 0;
  offY = 0;
  dpr = 1;

  camX = 0; camY = 0;
  zoom = 1;
  shakeX = 0; shakeY = 0;
  private shakeT = 0; private shakeMag = 0;
  shakeEnabled = true;
  shakeMult = 1;
  /** Safe-area insets in internal pixels (notched phones). */
  safe = { l: 0, r: 0, t: 0, b: 0 };

  constructor(screen: HTMLCanvasElement) {
    this.screen = screen;
    this.sctx = ctx2d(screen);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const sw = Math.round(window.innerWidth * this.dpr);
    const sh = Math.round(window.innerHeight * this.dpr);
    this.screen.width = sw;
    this.screen.height = sh;
    let s = Math.min(Math.floor(sw / BASE_W), Math.floor(sh / BASE_H));
    if (s < 1) s = Math.min(sw / BASE_W, sh / BASE_H);
    this.scale = s;
    const W = clamp(Math.floor(sw / s), BASE_W, MAX_W);
    const H = clamp(Math.floor(sh / s), BASE_H, MAX_H);
    if (W !== this.W || H !== this.H || !this.frame) {
      this.W = W; this.H = H;
      this.frame = makeCanvas(W, H); this.f = ctx2d(this.frame);
      this.world = makeCanvas(W, H); this.w = ctx2d(this.world);
    }
    this.offX = Math.floor((sw - W * s) / 2);
    this.offY = Math.floor((sh - H * s) / 2);
    this.sctx = ctx2d(this.screen);
    this.sctx.imageSmoothingEnabled = false;
    this.readSafeArea();
  }

  private readSafeArea(): void {
    const cs = getComputedStyle(document.documentElement);
    const read = (v: string) => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:fixed;left:0;top:0;width:env(${v},0px);height:0`;
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return Math.ceil((w * this.dpr) / this.scale);
    };
    void cs;
    try {
      this.safe = { l: read('safe-area-inset-left'), r: read('safe-area-inset-right'), t: read('safe-area-inset-top'), b: read('safe-area-inset-bottom') };
    } catch { /* ignore */ }
  }

  /** Map a client (CSS px) coordinate to internal frame pixels. */
  toInternal(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: (clientX * this.dpr - this.offX) / this.scale,
      y: (clientY * this.dpr - this.offY) / this.scale,
    };
  }

  /** Internal frame coords -> world coords (accounting for camera + zoom). */
  frameToWorld(x: number, y: number): { x: number; y: number } {
    const cx = this.W / 2, cy = this.H / 2;
    return { x: (x - cx) / this.zoom + cx + this.viewX(), y: (y - cy) / this.zoom + cy + this.viewY() };
  }
  worldToFrame(x: number, y: number): { x: number; y: number } {
    const cx = this.W / 2, cy = this.H / 2;
    return { x: (x - this.viewX() - cx) * this.zoom + cx, y: (y - this.viewY() - cy) * this.zoom + cy };
  }

  /** Top-left of the world view in world pixels (integer). */
  viewX(): number { return Math.round(this.camX - this.W / 2 + this.shakeX); }
  viewY(): number { return Math.round(this.camY - this.H / 2 + this.shakeY); }

  shake(mag: number, time = 0.25): void {
    if (!this.shakeEnabled) return;
    mag *= this.shakeMult;
    if (mag > this.shakeMag * (this.shakeT > 0 ? 1 : 0)) { this.shakeMag = mag; }
    this.shakeT = Math.max(this.shakeT, time);
  }

  update(dt: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeT) * 4;
      const mm = Math.min(m, this.shakeMag);
      this.shakeX = (Math.random() * 2 - 1) * mm;
      this.shakeY = (Math.random() * 2 - 1) * mm;
      if (this.shakeT <= 0) { this.shakeX = this.shakeY = 0; this.shakeMag = 0; }
    }
  }

  /** Begin world drawing: clears world layer and applies camera translation. Call endWorld() after. */
  beginWorld(clear = '#000'): Ctx {
    const w = this.w;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.fillStyle = clear;
    w.fillRect(0, 0, this.W, this.H);
    w.setTransform(1, 0, 0, 1, -this.viewX(), -this.viewY());
    w.imageSmoothingEnabled = false;
    return w;
  }

  endWorld(): void {
    this.w.setTransform(1, 0, 0, 1, 0, 0);
    const f = this.f;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.imageSmoothingEnabled = false;
    if (this.zoom === 1) {
      f.drawImage(this.world, 0, 0);
    } else {
      const sw = this.W / this.zoom, sh = this.H / this.zoom;
      f.fillStyle = '#000';
      f.fillRect(0, 0, this.W, this.H);
      f.drawImage(this.world, (this.W - sw) / 2, (this.H - sh) / 2, sw, sh, 0, 0, this.W, this.H);
    }
  }

  /** Present the internal frame to the screen with integer scaling. */
  present(): void {
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.imageSmoothingEnabled = false;
    s.fillStyle = '#000';
    s.fillRect(0, 0, this.screen.width, this.screen.height);
    s.drawImage(this.frame, 0, 0, this.W, this.H, this.offX, this.offY, this.W * this.scale, this.H * this.scale);
  }
}
