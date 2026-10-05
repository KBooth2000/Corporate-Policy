// Shared helpers for hand-authored pixel art: ASCII grids + a common material palette.
// Lighting is always top-left: highlight (light letter) top-left, shadow (dark letter) bottom-right.
import type { Sprite } from '../../render/canvas';
import { makeCanvas, ctx2d, withOutline, sprite } from '../../render/canvas';
import { OUTLINE } from '../palette';

export type Pal = Record<string, string>;

/** Common ramp letters. '.' / ' ' = transparent. Sprites may override or extend with their own pal. */
export const BASE: Pal = {
  k: OUTLINE,
  // steel / grey ramp (specular, light, mid, dark, darker, near black)
  w: '#f6f8fb', a: '#d3dae2', b: '#a2adba', c: '#707b8c', d: '#474f60', e: '#2a2f3b',
  // reds
  R: '#d93a30', r: '#ff7b62', q: '#8e1d22',
  // oranges
  O: '#f08a2c', o: '#ffbe63', n: '#b0521a',
  // golds
  Y: '#f0bf2e', y: '#ffe48a', u: '#b5801a',
  // greens
  G: '#4caf58', g: '#92dc88', h: '#2b6f44',
  // blues
  B: '#3f7fd6', l: '#82c4f7', j: '#23468c',
  // purples
  P: '#8a5ac8', p: '#bb94f0', x: '#55338f',
  // woods
  T: '#bc8650', t: '#e0ae78', m: '#7c5231', N: '#4b3120',
  // skin
  F: '#e9b894', f: '#f8d9bd', s: '#c48862',
  // paper
  W: '#eeece4', V: '#bfbcb2', v: '#8d8a82',
  // teal
  Z: '#2fb5a5', z: '#86e4d6', Q: '#1c7873',
};

const warned = new Set<string>();

/** Bake ASCII rows into a canvas (no outline). */
export function bake(rows: string[], pal: Pal = {}): HTMLCanvasElement {
  const P = { ...BASE, ...pal };
  const w = Math.max(1, ...rows.map((r) => r.length));
  const c = makeCanvas(w, rows.length);
  const g = ctx2d(c);
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const col = P[ch];
      if (!col) {
        if (!warned.has(ch)) { warned.add(ch); console.warn('items art: unknown pixel letter', ch); }
        continue;
      }
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Outlined held sprite: origin (ox, oy) given in art coordinates (before the outline margin). */
export function heldSprite(rows: string[], ox: number, oy: number, pal: Pal = {}): Sprite {
  const o = withOutline(bake(rows, pal), OUTLINE);
  return sprite(o, ox + 1, oy + 1);
}

/** Centre a canvas on a 16×16 tile. */
export function onTile(src: HTMLCanvasElement, size = 16): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  g.drawImage(src, Math.floor((size - src.width) / 2), Math.floor((size - src.height) / 2));
  return c;
}

/** 16×16 icon with a 1px outline (art up to 14×14). */
export function iconTile(rows: string[], pal: Pal = {}, outline = true): HTMLCanvasElement {
  const a = bake(rows, pal);
  return onTile(outline ? withOutline(a, OUTLINE) : a);
}

/** Outlined sprite with an origin given as fractions/pixels of the final canvas. */
export function outlinedSprite(rows: string[], pal: Pal, ox: number | 'c', oy: number | 'c' | 'b'): Sprite {
  const o = withOutline(bake(rows, pal), OUTLINE);
  const x = ox === 'c' ? Math.floor(o.width / 2) : ox + 1;
  const y = oy === 'c' ? Math.floor(o.height / 2) : oy === 'b' ? o.height - 1 : oy + 1;
  return sprite(o, x, y);
}

export interface IDef { rows: string[]; pal?: Pal }

export type P = (x: number, y: number, c: string) => void;
export type RC = (x: number, y: number, w: number, h: number, c: string) => void;
export type DC = (cx: number, cy: number, rad: number, c: string) => void;
export type LN = (x0: number, y0: number, x1: number, y1: number, c: string, th?: number) => void;
/** Tiny pixel-builder for long/regular shapes: returns ASCII rows. */
export function build(w: number, h: number, fn: (p: P, rc: RC, dc: DC, ln: LN) => void): string[] {
  const g: string[][] = Array.from({ length: h }, () => Array(w).fill('.'));
  const p: P = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const rc: RC = (x, y, ww, hh, c) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) p(x + i, y + j, c); };
  const dc: DC = (cx, cy, rad, c) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= rad * rad) p(x, y, c); } };
  const ln: LN = (x0, y0, x1, y1, c, th = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) p(x + a, y + b, c);
    }
  };
  fn(p, rc, dc, ln);
  return g.map((row) => row.join(''));
}
