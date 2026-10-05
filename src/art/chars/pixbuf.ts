// Software pixel raster used by the character baker (and available to the boss artist).
//
// Why: drawing ~375 frames with thousands of canvas fillRect calls is far too slow to meet the
// 15 ms per-character bake budget. Instead every frame is rasterised into a Uint32Array
// (one packed RGBA pixel per element, little-endian ABGR) and the finished atlas is uploaded
// with a single putImageData.
//
// Conventions: integer pixel coordinates, no anti-aliasing, colours are packed `Col` numbers
// produced by `C('#rrggbb')`. A PixBuf has an optional translation (tx, ty) so drawing code can
// work relative to a figure's feet origin.

import { hexToRgb, makeCanvas, ctx2d } from '../../render/canvas';

/** Packed colour (little-endian ABGR as stored in ImageData's Uint32 view). 0 = transparent. */
export type Col = number;

const colCache = new Map<string, Col>();

/** Pack '#rrggbb' (alpha 255) into a Col. Cached. */
export function C(hex: string): Col {
  let c = colCache.get(hex);
  if (c === undefined) {
    const [r, g, b] = hexToRgb(hex);
    c = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    colCache.set(hex, c);
  }
  return c;
}

/** Pack with explicit alpha 0..255. */
export function Ca(hex: string, a: number): Col {
  const [r, g, b] = hexToRgb(hex);
  return (((a & 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function colR(c: Col): number { return c & 255; }
export function colG(c: Col): number { return (c >>> 8) & 255; }
export function colB(c: Col): number { return (c >>> 16) & 255; }
export function colA(c: Col): number { return c >>> 24; }

/** Linear mix of two packed colours (alpha taken from a). */
export function mixCol(a: Col, b: Col, t: number): Col {
  const r = colR(a) + (colR(b) - colR(a)) * t;
  const g = colG(a) + (colG(b) - colG(a)) * t;
  const bl = colB(a) + (colB(b) - colB(a)) * t;
  return ((colA(a) << 24) | (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

export class PixBuf {
  readonly w: number;
  readonly h: number;
  readonly d: Uint32Array;
  /** Optional per-pixel tag channel (e.g. marks glowing lanyard pixels). */
  mask: Uint8Array | null;
  /** Tag written into `mask` by every pixel write while non-zero. */
  tag = 0;
  /** Indices of pixels written with a non-zero tag (for the glow pass). */
  tagged: number[] = [];
  /** Translation applied to all drawing calls. */
  tx = 0; ty = 0;
  /** Bounding box of written pixels (buffer space) since the last resetBounds(). */
  bx0 = 1e9; by0 = 1e9; bx1 = -1e9; by1 = -1e9;

  constructor(w: number, h: number, withMask = false, backing?: ArrayBuffer) {
    this.w = w; this.h = h;
    this.d = backing ? new Uint32Array(backing, 0, w * h) : new Uint32Array(w * h);
    this.mask = withMask ? new Uint8Array(w * h) : null;
  }

  clear(): void {
    if (this.bx1 >= this.bx0) {
      // only clear the touched rows
      const y0 = Math.max(0, this.by0), y1 = Math.min(this.h - 1, this.by1);
      this.d.fill(0, y0 * this.w, (y1 + 1) * this.w);
      if (this.mask) this.mask.fill(0, y0 * this.w, (y1 + 1) * this.w);
    }
    this.tagged.length = 0;
    this.tx = 0; this.ty = 0;
    this.resetBounds();
  }

  /** Copy a stamp (opaque pixels + tags) with its top-left at (dx, dy) in buffer space. */
  stamp(src: PixBuf, dx: number, dy: number): void {
    if (src.bx1 < src.bx0) return;
    const sm = src.mask, dm = this.mask;
    for (let y = src.by0; y <= src.by1; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      const so = y * src.w;
      for (let x = src.bx0; x <= src.bx1; x++) {
        const c = src.d[so + x];
        if (c >>> 24 === 0) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        const i = ty * this.w + tx;
        this.d[i] = c;
        if (dm) { const t = sm ? sm[so + x] : 0; dm[i] = t; if (t) this.tagged.push(i); }
      }
    }
    const x0 = src.bx0 + dx, x1 = src.bx1 + dx, y0 = src.by0 + dy, y1 = src.by1 + dy;
    if (x0 < this.bx0) this.bx0 = Math.max(0, x0);
    if (x1 > this.bx1) this.bx1 = Math.min(this.w - 1, x1);
    if (y0 < this.by0) this.by0 = Math.max(0, y0);
    if (y1 > this.by1) this.by1 = Math.min(this.h - 1, y1);
  }

  resetBounds(): void { this.bx0 = 1e9; this.by0 = 1e9; this.bx1 = -1e9; this.by1 = -1e9; }

  /** Set one pixel (translated). Out-of-range writes are ignored. */
  set(x: number, y: number, c: Col): void {
    x = (x + this.tx) | 0; y = (y + this.ty) | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.d[i] = c;
    if (this.mask) { this.mask[i] = this.tag; if (this.tag) this.tagged.push(i); }
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }

  /** Read one pixel (translated). Returns 0 outside. */
  get(x: number, y: number): Col {
    x = (x + this.tx) | 0; y = (y + this.ty) | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }

  /** True if the pixel is opaque. */
  solid(x: number, y: number): boolean { return this.get(x, y) >>> 24 > 0; }

  /** Set a pixel only where something is already drawn (for shading/details on top of a shape). */
  over(x: number, y: number, c: Col): void { if (this.solid(x, y)) this.set(x, y, c); }

  /** Alpha-blend a colour onto the pixel (result is opaque if the pixel was opaque). */
  blend(x: number, y: number, c: Col, a: number): void {
    const cur = this.get(x, y);
    if (cur >>> 24 === 0) { this.set(x, y, (((Math.round(a * 255)) << 24) | (c & 0xffffff)) >>> 0); return; }
    this.set(x, y, mixCol(cur, c, a));
  }

  rect(x: number, y: number, w: number, h: number, c: Col): void {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  hline(x0: number, x1: number, y: number, c: Col): void {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: Col): void {
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    for (let y = Math.round(y0); y <= Math.round(y1); y++) this.set(x, y, c);
  }

  /** 1px Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: Col): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled pixel ellipse centred on (cx, cy). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col): void {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = 1 - (y * y) / Math.max(ry * ry, 0.0001);
      if (t < 0) continue;
      const span = rx * Math.sqrt(t);
      const x0 = Math.round(cx - span), x1 = Math.round(cx + span);
      for (let x = x0; x <= x1; x++) this.set(x, Math.round(cy + y), c);
    }
  }

  /**
   * Thick shaded limb from (x0,y0) to (x1,y1). `t` = thickness in px. Light comes from the
   * top-left, so the left (or top) edge uses `lt` and the right (or bottom) edge uses `dk`.
   */
  limb(x0: number, y0: number, x1: number, y1: number, t: number, lt: Col, base: Col, dk: Col): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const vertical = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    const o = Math.floor((t - 1) / 2);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    for (;;) {
      for (let k = 0; k < t; k++) {
        const col = t <= 1 ? base : k === 0 ? lt : k === t - 1 ? dk : base;
        if (vertical) this.set(x - o + k, y, col); else this.set(x, y - o + k, col);
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /** Copy every opaque pixel of `src` (whole buffer) at offset (dx, dy) in buffer space. */
  blit(src: PixBuf, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const c = src.d[y * src.w + x];
        if (c >>> 24 === 0) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        this.d[ty * this.w + tx] = c;
        if (tx < this.bx0) this.bx0 = tx;
        if (tx > this.bx1) this.bx1 = tx;
        if (ty < this.by0) this.by0 = ty;
        if (ty > this.by1) this.by1 = ty;
      }
    }
  }
}

/**
 * Copy `src` into `dst` rotated by `quarter` × 90° clockwise (and optionally mirrored first),
 * mapping src pivot (px, py) onto dst point (qx, qy). Pixel-exact (no resampling).
 */
export function rotateInto(src: PixBuf, dst: PixBuf, quarter: number, flip: boolean, px: number, py: number, qx: number, qy: number): void {
  const q = ((quarter % 4) + 4) % 4;
  if (src.bx1 < src.bx0) return;
  for (let y = src.by0; y <= src.by1; y++) {
    for (let x = src.bx0; x <= src.bx1; x++) {
      const c = src.d[y * src.w + x];
      if (c >>> 24 === 0) continue;
      const rx = flip ? px - x : x - px, ry = y - py;
      let ox: number, oy: number;
      if (q === 0) { ox = rx; oy = ry; } else if (q === 1) { ox = -ry; oy = rx; } else if (q === 2) { ox = -rx; oy = -ry; } else { ox = ry; oy = -rx; }
      const tx = qx + ox, ty = qy + oy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const i = ty * dst.w + tx;
      dst.d[i] = c;
      if (dst.mask && src.mask) dst.mask[i] = src.mask[y * src.w + x];
      if (tx < dst.bx0) dst.bx0 = tx;
      if (tx > dst.bx1) dst.bx1 = tx;
      if (ty < dst.by0) dst.by0 = ty;
      if (ty > dst.by1) dst.by1 = ty;
    }
  }
}

/**
 * Add a 1px outline (4-neighbour) of colour `col` around fully opaque pixels inside the rectangle.
 * Outline pixels are written with alpha 254 (visually opaque) so they never seed further outline;
 * semi-transparent pixels don't count as solid. The rectangle should have a ≥1px empty margin.
 */
export function outlineRect(buf: PixBuf, x0: number, y0: number, w: number, h: number, col: Col): void {
  const W = buf.w, d = buf.d;
  const x1 = Math.min(W - 1, x0 + w - 1), y1 = Math.min(buf.h - 1, y0 + h - 1);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  const oc = ((col & 0x00ffffff) | (254 << 24)) >>> 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      const i = row + x;
      if (d[i] >>> 24 !== 0) continue;
      if ((x > x0 && d[i - 1] >>> 24 === 255) || (x < x1 && d[i + 1] >>> 24 === 255) || (y > y0 && d[i - W] >>> 24 === 255) || (y < y1 && d[i + W] >>> 24 === 255)) d[i] = oc;
    }
  }
}

/** Upload a region of a PixBuf into a new canvas (one putImageData). */
export function toCanvas(buf: PixBuf, x = 0, y = 0, w = buf.w, h = buf.h): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  const img = g.createImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  if (x === 0 && w === buf.w) {
    out.set(buf.d.subarray(y * buf.w, (y + h) * buf.w));
  } else {
    for (let j = 0; j < h; j++) out.set(buf.d.subarray((y + j) * buf.w + x, (y + j) * buf.w + x + w), j * w);
  }
  g.putImageData(img, 0, 0);
  return c;
}
