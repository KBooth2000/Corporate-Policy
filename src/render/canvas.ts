// Canvas / pixel-art helpers shared by all procedural art generators.

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const x = c.getContext('2d', { willReadFrequently: false }) as Ctx;
  x.imageSmoothingEnabled = false;
  return x;
}

/** Create a canvas and run a draw callback on it. */
export function paint(w: number, h: number, draw: (g: Ctx, c: HTMLCanvasElement) => void): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  draw(g, c);
  return c;
}

/** A positioned sprite: img with an origin (ox, oy) relative to its top-left. */
export interface Sprite {
  img: CanvasImageSource;
  sx: number; sy: number; w: number; h: number;
  ox: number; oy: number;
}

export function sprite(img: HTMLCanvasElement, ox = img.width / 2, oy = img.height / 2): Sprite {
  return { img, sx: 0, sy: 0, w: img.width, h: img.height, ox, oy };
}

export function drawSprite(g: Ctx, s: Sprite, x: number, y: number, flip = false, alpha = 1): void {
  if (alpha <= 0) return;
  const px = Math.round(x), py = Math.round(y);
  if (alpha < 1) g.globalAlpha = alpha;
  if (flip) {
    g.save();
    g.translate(px, py);
    g.scale(-1, 1);
    g.drawImage(s.img, s.sx, s.sy, s.w, s.h, -(s.w - s.ox), -s.oy, s.w, s.h);
    g.restore();
  } else {
    g.drawImage(s.img, s.sx, s.sy, s.w, s.h, px - s.ox, py - s.oy, s.w, s.h);
  }
  if (alpha < 1) g.globalAlpha = 1;
}

/** Draw a sprite rotated around its origin. Rotation in radians. */
export function drawSpriteRot(g: Ctx, s: Sprite, x: number, y: number, rot: number, flipY = false, sc = 1): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.rotate(rot);
  if (flipY || sc !== 1) g.scale(sc, flipY ? -sc : sc);
  g.drawImage(s.img, s.sx, s.sy, s.w, s.h, -s.ox, -s.oy, s.w, s.h);
  g.restore();
}

export function rect(g: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(g: Ctx, x: number, y: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** Pixel-perfect filled ellipse. */
export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, col: string): void {
  g.fillStyle = col;
  const rx2 = rx * rx, ry2 = ry * ry;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const span = rx * Math.sqrt(Math.max(0, 1 - (y * y) / Math.max(ry2, 0.0001)));
    if (span <= 0 && rx2 > 0 && y !== 0) continue;
    const x0 = Math.round(cx - span), x1 = Math.round(cx + span);
    g.fillRect(x0, Math.round(cy + y), Math.max(1, x1 - x0), 1);
  }
}

/** Bresenham line. */
export function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, w = 1): void {
  g.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor(w / 2);
  for (;;) {
    g.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Returns a new canvas (w+2, h+2) with a 1px outline around opaque pixels (spec 9.1 readability). */
export function withOutline(src: HTMLCanvasElement, col = '#0b0c10', diagonal = false): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const out = makeCanvas(w + 2, h + 2);
  const g = ctx2d(out);
  const sd = ctx2d(src).getImageData(0, 0, w, h).data;
  const od = g.createImageData(w + 2, h + 2);
  const [r, gg, b] = hexToRgb(col);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sd[(y * w + x) * 4 + 3] > 40;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      let edge = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!edge && diagonal) edge = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
      if (edge) {
        const i = ((y + 1) * (w + 2) + (x + 1)) * 4;
        od.data[i] = r; od.data[i + 1] = gg; od.data[i + 2] = b; od.data[i + 3] = 255;
      }
    }
  }
  g.putImageData(od, 0, 0);
  g.drawImage(src, 1, 1);
  return out;
}

/** Tint every opaque pixel to a flat colour (hit flash, silhouettes). */
export function silhouette(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  return paint(src.width, src.height, (g) => {
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = col;
    g.fillRect(0, 0, src.width, src.height);
  });
}

export function flipH(src: HTMLCanvasElement): HTMLCanvasElement {
  return paint(src.width, src.height, (g) => { g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); });
}

// ---- colour utils ----
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** Lighten (amt>0) or darken (amt<0) by fraction. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
