// Boss sprite baking: every (animation, view) strip is rasterised lazily into canvases the first time it is
// drawn (or up-front via preload() during the intro card), then reused — no per-frame re-rendering (DEV_BRIEF 10).
import { PixBuf, outlineRect, toCanvas, rotateInto } from '../chars/pixbuf';
import type { Ctx, Sprite } from '../../render/canvas';
import { makeCanvas, ctx2d } from '../../render/canvas';
import { drawFigure, FigPose, FigSpec, View, OUTC } from './fig';

export interface AnimDef {
  frames: number;
  fps: number;
  loop: boolean;
  pose(frame: number, view: View, n: number): FigPose;
  /** Rotate the finished figure a quarter turn (lying down): 1 = head to the right, 3 = head to the left. */
  lie?: 1 | 3;
  /** Extra drawing after the figure (vehicle in front, props), buffer space with feet at (ox, oy). */
  extra?(b: PixBuf, frame: number, view: View, ox: number, oy: number, layer: 'under' | 'over'): void;
}

export interface DrawBossOpts { flash?: number; tint?: string; tintAmt?: number; alpha?: number; squash?: number }

const scratch = makeCanvas(160, 160);
const sg = ctx2d(scratch);

export class BossArt {
  private cache = new Map<string, Sprite[]>();
  readonly cw: number; readonly ch: number; readonly ox: number; readonly oy: number;

  constructor(public spec: FigSpec, public anims: Record<string, AnimDef>, cell: { w: number; h: number; ox: number; oy: number } = { w: 132, h: 124, ox: 66, oy: 112 }) {
    this.cw = cell.w; this.ch = cell.h; this.ox = cell.ox; this.oy = cell.oy;
  }

  has(anim: string): boolean { return !!this.anims[anim]; }

  duration(anim: string): number { const a = this.anims[anim]; return a ? a.frames / a.fps : 0.5; }

  frameIndex(anim: string, t: number): number {
    const a = this.anims[anim] ?? this.anims.idle;
    const f = Math.floor(t * a.fps);
    return a.loop ? ((f % a.frames) + a.frames) % a.frames : Math.min(a.frames - 1, Math.max(0, f));
  }

  frames(anim: string, view: View): Sprite[] {
    const key = anim + '|' + view;
    let fr = this.cache.get(key);
    if (fr) return fr;
    const a = this.anims[anim] ?? this.anims.idle;
    fr = [];
    for (let i = 0; i < a.frames; i++) fr.push(this.bakeFrame(a, i, view));
    this.cache.set(key, fr);
    return fr;
  }

  private bakeFrame(a: AnimDef, i: number, view: View): Sprite {
    let b = new PixBuf(this.cw, this.ch);
    a.extra?.(b, i, view, this.ox, this.oy, 'under');
    drawFigure(b, this.spec, a.pose(i, view, a.frames), view, this.ox, this.oy, i);
    a.extra?.(b, i, view, this.ox, this.oy, 'over');
    if (a.lie) {
      const d = new PixBuf(this.cw, this.ch);
      const half = Math.round((this.spec.legLen + this.spec.torsoH + this.spec.headH) / 2);
      rotateInto(b, d, a.lie, false, this.ox, this.oy, this.ox + (a.lie === 1 ? -half : half), this.oy - 4);
      b = d;
    }
    outlineRect(b, 0, 0, this.cw, this.ch, OUTC);
    const c = toCanvas(b);
    return { img: c, sx: 0, sy: 0, w: c.width, h: c.height, ox: this.ox, oy: this.oy };
  }

  /** Bake every animation for every view now (call behind the intro card). */
  preload(): void { for (const k of Object.keys(this.anims)) for (const v of ['front', 'side', 'back'] as View[]) this.frames(k, v); }

  /** dir: 0 down, 1 right, 2 up, 3 left (mirrored right). */
  draw(g: Ctx, anim: string, dir: number, t: number, x: number, y: number, o: DrawBossOpts = {}): void {
    const view: View = dir === 0 ? 'front' : dir === 2 ? 'back' : 'side';
    const fr = this.frames(anim, view);
    const s = fr[this.frameIndex(anim, t)];
    const flip = dir === 3;
    const px = Math.round(x), py = Math.round(y);
    const alpha = o.alpha ?? 1;
    const needFx = (o.flash ?? 0) > 0.05 || ((o.tintAmt ?? 0) > 0.02 && !!o.tint);
    const sq = o.squash ?? 1;
    let img: CanvasImageSource = s.img;
    if (needFx) {
      sg.globalCompositeOperation = 'source-over';
      sg.clearRect(0, 0, s.w, s.h);
      sg.drawImage(s.img as HTMLCanvasElement, 0, 0);
      sg.globalCompositeOperation = 'source-atop';
      if (o.tint && (o.tintAmt ?? 0) > 0.02) { sg.globalAlpha = Math.min(1, o.tintAmt!); sg.fillStyle = o.tint; sg.fillRect(0, 0, s.w, s.h); }
      if ((o.flash ?? 0) > 0.05) { sg.globalAlpha = Math.min(1, o.flash!); sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, s.w, s.h); }
      sg.globalAlpha = 1;
      sg.globalCompositeOperation = 'source-over';
      img = scratch;
    }
    if (alpha < 1) g.globalAlpha = alpha;
    const h = Math.round(s.h * sq);
    if (flip) {
      g.save(); g.translate(px, py); g.scale(-1, 1);
      g.drawImage(img, 0, 0, s.w, s.h, -(s.w - s.ox), -Math.round(s.oy * sq), s.w, h);
      g.restore();
    } else g.drawImage(img, 0, 0, s.w, s.h, px - s.ox, py - Math.round(s.oy * sq), s.w, h);
    if (alpha < 1) g.globalAlpha = 1;
  }

  /** Head-and-shoulders crop of a front-view frame for intro cards (unscaled; draw at an integer scale). */
  portrait(anim = 'intro', frame = 0, rows = 58): HTMLCanvasElement {
    const fr = this.frames(this.anims[anim] ? anim : 'idle', 'front');
    const s = fr[Math.min(frame, fr.length - 1)];
    const top = this.oy - (this.spec.legLen + this.spec.torsoH + this.spec.neck + this.spec.headH) - 10;
    const c = makeCanvas(64, rows);
    const g = ctx2d(c);
    g.drawImage(s.img as HTMLCanvasElement, this.ox - 32, Math.max(0, top), 64, rows, 0, 0, 64, rows);
    return c;
  }
}

/** Bake a free-standing set-piece sprite from a PixBuf painter (outlined), origin at base centre by default. */
export function bakeSprite(w: number, h: number, draw: (b: PixBuf) => void, ox = w / 2, oy = h, outline = true): Sprite {
  const b = new PixBuf(w + 2, h + 2);
  b.tx = 1; b.ty = 1;
  draw(b);
  b.tx = 0; b.ty = 0;
  if (outline) outlineRect(b, 0, 0, w + 2, h + 2, OUTC);
  const c = toCanvas(b);
  return { img: c, sx: 0, sy: 0, w: c.width, h: c.height, ox: ox + 1, oy: oy + 1 };
}
