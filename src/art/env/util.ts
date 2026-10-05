// Small deterministic drawing helpers for procedural environment art.
import type { Ctx } from '../../render/canvas';
import { rect, px, shade, mixHex, rgba } from '../../render/canvas';

/** Deterministic integer hash of (x, y, seed) -> [0, 2^32). */
export function h2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
export const hf = (x: number, y: number, seed = 0) => h2(x, y, seed) / 4294967296;

/** Scatter single-pixel flecks in a rect. density = fraction of pixels. */
export function speckle(g: Ctx, x: number, y: number, w: number, h: number, cols: string[], density: number, seed: number): void {
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    const r = h2(i, seed, 77);
    px(g, x + (r % w), y + ((r >>> 8) % h), cols[(r >>> 16) % cols.length]);
  }
}

/** Outline a rect with a 1px border colour. */
export function frame(g: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  rect(g, x, y, w, 1, col); rect(g, x, y + h - 1, w, 1, col); rect(g, x, y, 1, h, col); rect(g, x + w - 1, y, 1, h, col);
}

/** Vertical gradient using bands of flat colour (pixel art friendly). */
export function vgrad(g: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string, steps = 4): void {
  for (let i = 0; i < h; i++) {
    const t = Math.floor((i / Math.max(1, h - 1)) * steps) / steps;
    rect(g, x, y + i, w, 1, mixHex(top, bottom, t));
  }
}

/** Soft drop shadow ellipse (translucent). */
export function shadowEllipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.28): void {
  g.fillStyle = `rgba(8,10,16,${a})`;
  for (let yy = -ry; yy <= ry; yy++) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry + 0.01))));
    if (span <= 0) continue;
    g.fillRect(Math.round(cx - span), Math.round(cy + yy), span * 2, 1);
  }
}

/** 3/4 box: top face (w x d) above a front face (w x h). (x, y) = top-left of the top face. */
export function box3(g: Ctx, x: number, y: number, w: number, d: number, h: number, top: string, front: string, opts: { edge?: string; hi?: boolean } = {}): void {
  rect(g, x, y, w, d, top);
  rect(g, x, y + d, w, h, front);
  if (opts.hi !== false) { rect(g, x, y, w, 1, shade(top, 0.18)); rect(g, x, y + d, w, 1, shade(front, 0.12)); }
  if (opts.edge) rect(g, x, y + d - 1, w, 1, opts.edge);
  rect(g, x, y + d + h - 1, w, 1, shade(front, -0.25));
}

export { rect, px, shade, mixHex, rgba };

// Tiny 3x5 sign font for in-world signage (exit signs, labels). Uppercase, digits, a few symbols.
const MINI: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '-': '000000111000000', '!': '010010010000010', '>': '100010001010100', '<': '001010100010001',
  '.': '000000000000010', '^': '010101000000000', "'": '010010000000000', '%': '101001010100101', '&': '010101010101011',
  ' ': '000000000000000', '#': '101111101111101', '/': '001001010100100', '+': '000010111010000',
};
export function miniText(g: Ctx, text: string, x: number, y: number, col: string, center = false): number {
  const w = text.length * 4 - 1;
  g.fillStyle = col;
  let cx = center ? Math.round(x - w / 2) : x;
  for (const ch of text.toUpperCase()) {
    const gph = MINI[ch] ?? MINI[' '];
    for (let i = 0; i < 15; i++) if (gph[i] === '1') g.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
  return w;
}
export function miniTextC(g: Ctx, text: string, x: number, y: number, col: string, center = false): number {
  g.fillStyle = col;
  return miniText(g, text, x, y, col, center);
}
