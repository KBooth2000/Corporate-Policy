// CorpOS window chrome, desktop wallpaper and taskbar.
import { app } from '../core/app';
import { Rng } from '../core/rng';
import { Ctx, makeCanvas, ctx2d } from '../render/canvas';
import { drawText, measure } from '../render/font';
import { C, box, dropShadow, stripes, drawGlyph, uiS, textY, ink, easeOutBack, clamp, shade, RectL, drawBadge } from './style';

export interface WindowOpts {
  /** glyph name shown as the title-bar app icon */
  icon?: string;
  active?: boolean;
  close?: boolean; min?: boolean; max?: boolean;
  status?: string;
  face?: string;
  shadow?: boolean;
  /** title bar colour override (e.g. red for warnings) */
  tint?: string;
  hoverClose?: boolean;
  titleScale?: number;
}
export interface WindowRects { client: RectL; titleBar: RectL; close: RectL; min: RectL; max: RectL; status: RectL | null }

export function titleBarH(): number { return uiS() === 2 ? 22 : 15; }

/** Draws a CorpOS window and returns the interesting rectangles. */
export function drawWindow(g: Ctx, title: string, r: RectL, o: WindowOpts = {}): WindowRects {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  const s = o.titleScale ?? uiS();
  const th = titleBarH();
  const active = o.active !== false;
  if (o.shadow !== false) dropShadow(g, x, y, w, h, 3);
  box(g, x, y, w, h, { face: o.face ?? C.face, cham: 2, depth: 2 });
  // title bar
  const tint = o.tint ?? (active ? C.navy : '#59627a');
  const tx = x + 3, ty = y + 3, tw = w - 6;
  g.fillStyle = tint; g.fillRect(tx, ty, tw, th - 2);
  // lanyard stripes on the right-hand side
  const sw = Math.min(Math.round(tw * 0.34), 150);
  stripes(g, tx + tw - sw, ty, sw, th - 2, tint, shade(tint, active ? 0.14 : 0.1), 2);
  g.fillStyle = shade(tint, 0.3); g.fillRect(tx, ty, tw, 1);
  g.fillStyle = active ? C.amber : '#a9a699'; g.fillRect(tx, ty + th - 2, tw, 1);
  // app chip
  let cx = tx + 3;
  const chip = th - 6;
  box(g, cx, ty + 2, chip + 2, chip, { face: C.amber, cham: 1, depth: 1 });
  drawGlyph(g, o.icon ?? 'logo', cx + (chip + 2) / 2, ty + 2 + chip / 2, C.outline, 1);
  cx += chip + 6;
  drawText(g, title, cx, ty + Math.round((th - 2 - 7 * s) / 2), { scale: s, color: active ? '#fff' : '#d9d6cc', shadow: 'rgba(0,0,0,0.5)' });
  // control capsule
  const bw = th - 3, bh = th - 6;
  const rects = { close: { x: 0, y: 0, w: 0, h: 0 }, min: { x: 0, y: 0, w: 0, h: 0 }, max: { x: 0, y: 0, w: 0, h: 0 } };
  let bx = tx + tw - 3 - bw;
  const place = (key: 'close' | 'min' | 'max', glyph: string, enabled: boolean, hover = false) => {
    if (!enabled) return;
    const rr = { x: bx, y: ty + 2, w: bw, h: bh };
    rects[key] = rr;
    box(g, rr.x, rr.y, rr.w, rr.h, { face: key === 'close' ? (hover ? '#ff6a5a' : '#d9534a') : C.face, cham: 1, depth: 1 });
    drawGlyph(g, glyph, rr.x + rr.w / 2, rr.y + rr.h / 2, key === 'close' ? '#fff' : C.ink, 1);
    bx -= bw + 2;
  };
  place('close', 'close', o.close !== false, !!o.hoverClose);
  place('max', 'max', !!o.max);
  place('min', 'min', !!o.min);
  const sh = o.status ? (uiS() === 2 ? 16 : 12) : 0;
  let status: RectL | null = null;
  if (o.status) {
    status = { x: x + 4, y: y + h - 4 - sh, w: w - 8, h: sh };
    box(g, status.x, status.y, status.w, status.h, { face: C.faceLo, kind: 'sunken', cham: 0, depth: 1 });
    ink(g, o.status, status.x + 4, textY(status.y, status.h, s > 1 ? 1 : 1) , { color: C.inkDim });
  }
  const client = windowClient(r, !!o.status);
  return { client, titleBar: { x: tx, y: ty, w: tw, h: th - 2 }, status, ...rects };
}

/** Client rectangle of a window drawn at r (with or without the status strip). */
export function windowClient(r: RectL, status = false): RectL {
  const th = titleBarH();
  const sh = status ? (uiS() === 2 ? 16 : 12) : 0;
  return { x: Math.round(r.x) + 5, y: Math.round(r.y) + th + 3, w: Math.round(r.w) - 10, h: Math.round(r.h) - th - 8 - (sh ? sh + 1 : 0) };
}

/** Animation helper: 0..1 open progress. */
export class OpenAnim {
  t = 0;
  constructor(public speed = 7) {}
  step(dt: number): void { this.t = Math.min(1, this.t + dt * this.speed); }
  get done(): boolean { return this.t >= 1; }
  reset(): void { this.t = 0; }
}

/** Integer rect scaled about its centre for the window-open pop (overshoot via easeOutBack). */
export function popRect(r: RectL, t: number): RectL {
  const k = clamp(0.55 + 0.45 * easeOutBack(t), 0.4, 1.04);
  const w = Math.round(r.w * k), h = Math.round(r.h * (0.7 + 0.3 * Math.min(1, k)));
  return { x: Math.round(r.x + (r.w - w) / 2), y: Math.round(r.y + (r.h - h) / 2), w, h };
}

// ---------------------------------------------------------------------------
// Wallpapers
const wpCache = new Map<string, { img: HTMLCanvasElement; lights: { x: number; y: number; ph: number }[] }>();
export type Wallpaper = 'login' | 'teal' | 'slate' | 'warm';

function bakeWallpaper(kind: Wallpaper, W: number, H: number): { img: HTMLCanvasElement; lights: { x: number; y: number; ph: number }[] } {
  const c = makeCanvas(W, H); const g = ctx2d(c);
  const rng = new Rng(kind === 'login' ? 77 : kind === 'warm' ? 31 : 5);
  const pal = {
    login: ['#0b1e30', '#0f2e45', '#134059', '#1a5670', '#2a6f82', '#4b8a8a', '#c9a66b', '#e7a35a'],
    teal: ['#0f3b4f', '#12475d', '#175370', '#1c5e7a', '#237088', '#2a7f95', '#318ea2', '#3a9bad'],
    slate: ['#12151d', '#171b25', '#1d2230', '#232a3b', '#2a3246', '#323b52', '#3a455f', '#43506c'],
    warm: ['#2b1f2a', '#3c2a30', '#503637', '#6a4639', '#8a5a3a', '#b0743c', '#d2924a', '#e8b266'],
  }[kind];
  const bandH = Math.ceil((H * 0.78) / pal.length);
  for (let i = 0; i < pal.length; i++) {
    g.fillStyle = pal[i]; g.fillRect(0, i * bandH, W, bandH + 1);
    // dithered transition into the next band
    if (i + 1 < pal.length) {
      g.fillStyle = pal[i + 1];
      for (let x = 0; x < W; x += 2) for (let k = 0; k < 2; k++) if (((x >> 1) + k) % 2 === 0) g.fillRect(x + k, (i + 1) * bandH - 2 + k, 1, 1);
    }
  }
  g.fillStyle = pal[pal.length - 1]; g.fillRect(0, pal.length * bandH, W, H);
  // retro sun disc with slats
  const sx = Math.round(W * 0.72), sy = Math.round(H * 0.5), sr = Math.round(H * 0.2);
  for (let y = -sr; y <= sr; y++) {
    if (y > 4 && (Math.floor((y - 4) / 3) % 2 === 1) && y > sr * 0.15) continue;
    const span = Math.floor(Math.sqrt(sr * sr - y * y));
    g.fillStyle = kind === 'slate' ? '#3d4a66' : '#f2c27a';
    g.globalAlpha = 0.5;
    g.fillRect(sx - span, sy + y, span * 2, 1);
  }
  g.globalAlpha = 1;
  // faint grid of company logos
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 10; y < H; y += 34) for (let x = ((y / 34) & 1) * 17 + 6; x < W; x += 34) { g.fillRect(x + 2, y, 5, 1); g.fillRect(x, y + 2, 1, 5); g.fillRect(x + 2, y + 8, 5, 1); g.fillRect(x + 8, y + 2, 1, 5); }
  // skyline: two parallax layers
  const lights: { x: number; y: number; ph: number }[] = [];
  const base = Math.round(H * 0.9);
  const layers = [
    { col: kind === 'slate' ? '#1b2130' : '#123347', win: 'rgba(240,215,140,0.0)', hMin: 36, hMax: 120, wMin: 14, wMax: 30 },
    { col: kind === 'slate' ? '#10131b' : '#0a1f2e', win: '#f2d88a', hMin: 24, hMax: 90, wMin: 12, wMax: 26 },
  ];
  layers.forEach((L, li) => {
    let x = -8;
    while (x < W) {
      const tw = rng.int(L.wMin, L.wMax), th = rng.int(L.hMin, L.hMax);
      g.fillStyle = L.col; g.fillRect(x, base - th, tw, th + H);
      if (rng.chance(0.3)) { g.fillRect(x + (tw >> 1) - 1, base - th - 8, 2, 8); } // antenna
      g.fillStyle = shade(L.col, 0.08); g.fillRect(x, base - th, tw, 1);
      if (li === 1) {
        for (let wy = base - th + 5; wy < base - 4; wy += 6) for (let wx = x + 3; wx < x + tw - 3; wx += 5) {
          if (rng.chance(0.38)) { g.fillStyle = rng.chance(0.2) ? '#9fd8e6' : '#f2d88a'; g.fillRect(wx, wy, 2, 3); if (rng.chance(0.12)) lights.push({ x: wx, y: wy, ph: rng.next() * 6 }); }
        }
      }
      x += tw + rng.int(0, 3);
    }
    if (li === 0) { /* far layer drawn lower alpha by the colour itself */ }
  });
  // ground fog under the skyline
  const grd = g.createLinearGradient(0, base - 4, 0, H);
  grd.addColorStop(0, 'rgba(8,16,24,0)'); grd.addColorStop(1, 'rgba(8,16,24,0.9)');
  g.fillStyle = grd; g.fillRect(0, base - 4, W, H - base + 4);
  return { img: c, lights };
}

export function drawDesktop(g: Ctx, wallpaper: Wallpaper = 'login', t = app.time): void {
  const r = app.renderer;
  const k = wallpaper + r.W + 'x' + r.H;
  let w = wpCache.get(k);
  if (!w) { w = bakeWallpaper(wallpaper, r.W, r.H); wpCache.set(k, w); }
  g.drawImage(w.img, 0, 0);
  for (const l of w.lights) {
    const on = Math.sin(t * 0.7 + l.ph * 3) > 0.2;
    g.fillStyle = on ? '#fff3c4' : '#3a4a5a';
    g.fillRect(l.x, l.y, 2, 3);
  }
}

// ---------------------------------------------------------------------------
export interface TaskItem { label: string; glyph?: string; active?: boolean }
export interface TaskbarOpts { startLabel?: string; items?: TaskItem[]; tray?: string[]; clock?: boolean; height?: number }
export interface TaskbarRects { bar: RectL; start: RectL; items: RectL[]; clock: RectL }

export function taskbarH(): number { return uiS() === 2 ? 28 : 19; }

export function clockText(sec = false): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + (sec ? ':' + p(d.getSeconds()) : '');
}

export function drawTaskbar(g: Ctx, o: TaskbarOpts = {}, y?: number): TaskbarRects {
  const r = app.renderer;
  const s = uiS();
  const h = o.height ?? taskbarH();
  const by = y ?? r.H - h - r.safe.b;
  const x0 = r.safe.l, w = r.W - r.safe.l - r.safe.r;
  // bar
  g.fillStyle = C.outline; g.fillRect(0, by - 1, r.W, 1);
  g.fillStyle = shade(C.face, 0.0); g.fillRect(0, by, r.W, h + r.safe.b);
  g.fillStyle = C.faceHi; g.fillRect(0, by, r.W, 1);
  g.fillStyle = C.amber; g.fillRect(0, by + 1, r.W, 1);
  // start badge
  const sl = o.startLabel ?? 'CorpOS';
  const sw = measure(sl, s) + 14 + 12 * s;
  const start = { x: x0 + 2, y: by + 3, w: sw, h: h - 5 };
  box(g, start.x, start.y, start.w, start.h, { face: C.navyHi, cham: 1, depth: 1 });
  drawGlyph(g, 'logo', start.x + 9, start.y + start.h / 2, C.gold, 1);
  drawText(g, sl, start.x + 16, textY(start.y, start.h, s), { color: '#fff', scale: s, shadow: 'rgba(0,0,0,0.5)' });
  // clock tray
  const ct = clockText();
  const cw = measure(ct, s) + 14;
  const clock = { x: x0 + w - cw - 2, y: by + 3, w: cw, h: h - 5 };
  box(g, clock.x, clock.y, clock.w, clock.h, { face: C.faceLo, kind: 'sunken', cham: 0, depth: 1 });
  ink(g, ct, clock.x + clock.w / 2, textY(clock.y, clock.h, s), { scale: s, align: 'center' });
  let tx = clock.x - 4;
  for (const t of o.tray ?? []) { tx -= 12; drawGlyph(g, t, tx + 5, by + h / 2 + 1, C.navy, 1); }
  // task items
  const items: RectL[] = [];
  let ix = start.x + start.w + 6;
  for (const it of o.items ?? []) {
    const iw = Math.min(measure(it.label, s) + 18 + (it.glyph ? 12 : 0), 120);
    if (ix + iw > tx - 4) break;
    const rr = { x: ix, y: by + 3, w: iw, h: h - 5 };
    box(g, rr.x, rr.y, rr.w, rr.h, { face: it.active ? '#fbfaf5' : C.face, kind: it.active ? 'sunken' : 'raised', cham: 1, depth: 1 });
    let lx = rr.x + 6;
    if (it.glyph) { drawGlyph(g, it.glyph, lx + 4, rr.y + rr.h / 2, C.navy, 1); lx += 12; }
    ink(g, it.label, lx, textY(rr.y, rr.h, s), { scale: s });
    items.push(rr);
    ix += iw + 3;
  }
  return { bar: { x: 0, y: by, w: r.W, h }, start, items, clock };
}

export { drawBadge };
