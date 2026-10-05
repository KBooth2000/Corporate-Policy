// Performance Review slide deck (run summary): pixel-art charts + exportable screenshot.
import { app } from '../core/app';
import { isMobile } from '../core/app';
import { audio } from '../audio/audio';
import { Ctx, makeCanvas, ctx2d, hexToRgb, line } from '../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../render/font';
import { C, box, ink, uiS, clamp, easeOutCubic, shade, stripes, dim, drawGlyph, dropShadow, focusRing, RectL, truncate } from './style';
import { Widget, Ui, Button, btnH } from './widgets';
import { drawWindow, OpenAnim, popRect, titleBarH, drawDesktop } from './window';

export const SLIDE_W = 480;
export const SLIDE_H = 270;
export const DECK_COLOURS = ['#2f5fa8', '#e8a33d', '#3fbf6a', '#b5503c', '#7a5fc8', '#2aa7a0', '#8a8f9c', '#d6c24a'];

export interface ChartDatum { label: string; value: number; colour?: string }
export type Slide =
  | { type: 'title'; title: string; subtitle?: string; stamp?: string; footer?: string }
  | { type: 'bars'; title: string; data: ChartDatum[]; unit?: string; note?: string; horizontal?: boolean }
  | { type: 'pie'; title: string; data: ChartDatum[]; note?: string; unit?: string }
  | { type: 'line'; title: string; series: { label: string; points: number[]; colour?: string }[]; xLabels?: string[]; note?: string }
  | { type: 'bullets'; title: string; bullets: string[]; note?: string }
  | { type: 'stats'; title: string; stats: { label: string; value: string; sub?: string; colour?: string }[]; note?: string };

export interface DeckOpts {
  /** window title bar text */
  title?: string;
  slides: Slide[];
  onClose?: () => void;
  exportName?: string;
  backdrop?: 'dim' | 'desktop' | 'none';
  /** footer branding shown on every slide */
  branding?: string;
}

// ---------------------------------------------------------------------------
// Slide rendering (always at SLIDE_W x SLIDE_H logical pixels)
const PAPER = '#f6f3ea';

function frame(g: Ctx, title: string, page: number, total: number, branding: string): void {
  g.fillStyle = PAPER; g.fillRect(0, 0, SLIDE_W, SLIDE_H);
  // faint ruled grid
  g.fillStyle = 'rgba(40,60,90,0.045)';
  for (let y = 44; y < SLIDE_H - 18; y += 12) g.fillRect(0, y, SLIDE_W, 1);
  // header band
  g.fillStyle = C.navy; g.fillRect(0, 0, SLIDE_W, 34);
  stripes(g, SLIDE_W - 150, 0, 150, 34, C.navy, C.navyHi, 3);
  g.fillStyle = C.amber; g.fillRect(0, 34, SLIDE_W, 2);
  g.fillStyle = C.gold; g.fillRect(14, 0, 6, 34);
  drawText(g, truncate(title, SLIDE_W - 84, 2), 30, 10, { scale: 2, color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
  box(g, SLIDE_W - 30, 6, 22, 22, { face: C.navyHi, cham: 2, depth: 1 });
  drawGlyph(g, 'logo', SLIDE_W - 19, 17, C.gold, 1);
  // footer
  g.fillStyle = C.faceLo; g.fillRect(0, SLIDE_H - 16, SLIDE_W, 16);
  g.fillStyle = C.faceDark; g.fillRect(0, SLIDE_H - 16, SLIDE_W, 1);
  drawText(g, branding, 10, SLIDE_H - 12, { color: C.inkDim, shadow: null });
  drawText(g, `${page}/${total}`, SLIDE_W - 10, SLIDE_H - 12, { color: C.ink, align: 'right', shadow: null });
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
const fmtNum = (v: number): string => (Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + 'k' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const colOf = (d: { colour?: string }, i: number): string => d.colour ?? DECK_COLOURS[i % DECK_COLOURS.length];

function drawBars(g: Ctx, s: Extract<Slide, { type: 'bars' }>, k: number): void {
  const ax = 44, ay = 50, aw = SLIDE_W - ax - 26, ah = SLIDE_H - ay - 50;
  const max = niceMax(Math.max(...s.data.map((d) => d.value), 1));
  if (s.horizontal) {
    const n = s.data.length, rowH = Math.min(26, Math.floor(ah / n));
    const lw = Math.min(130, Math.max(...s.data.map((d) => measure(d.label))) + 10);
    s.data.forEach((d, i) => {
      const y = ay + 6 + i * rowH;
      const p = easeOutCubic(clamp(k * 1.6 - i * 0.12, 0, 1));
      drawText(g, truncate(d.label, lw - 4), ax + lw - 6, y + 6, { color: C.ink, align: 'right', shadow: null });
      const bw = Math.round(((aw - lw - 50) * d.value) / max * p);
      g.fillStyle = C.outline; g.fillRect(ax + lw, y + 1, bw + 2, rowH - 8);
      g.fillStyle = colOf(d, i); g.fillRect(ax + lw + 1, y + 2, bw, rowH - 10);
      g.fillStyle = shade(colOf(d, i), 0.4); g.fillRect(ax + lw + 1, y + 2, bw, 1);
      if (p > 0.6) drawText(g, fmtNum(d.value) + (s.unit ?? ''), ax + lw + bw + 6, y + 5, { color: C.ink, shadow: null });
    });
  } else {
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(ay + ah - (ah * i) / 4);
      g.fillStyle = i === 0 ? C.ink : 'rgba(40,50,70,0.25)';
      if (i === 0) g.fillRect(ax, y, aw, 1); else for (let x = ax; x < ax + aw; x += 4) g.fillRect(x, y, 2, 1);
      drawText(g, fmtNum((max * i) / 4), ax - 5, y - 3, { color: C.inkDim, align: 'right', shadow: null });
    }
    g.fillStyle = C.ink; g.fillRect(ax, ay, 1, ah);
    const n = s.data.length, slot = aw / n, bw = Math.min(46, Math.floor(slot * 0.62));
    s.data.forEach((d, i) => {
      const p = easeOutCubic(clamp(k * 1.7 - i * 0.14, 0, 1));
      const h = Math.round(((ah - 4) * d.value) / max * p);
      const x = Math.round(ax + slot * i + (slot - bw) / 2), y = ay + ah - h;
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, y + 3, bw, h);
      g.fillStyle = C.outline; g.fillRect(x - 1, y - 1, bw + 2, h + 1);
      g.fillStyle = colOf(d, i); g.fillRect(x, y, bw, h);
      g.fillStyle = shade(colOf(d, i), 0.4); g.fillRect(x, y, bw, 1); g.fillRect(x, y, 2, h);
      g.fillStyle = shade(colOf(d, i), -0.3); g.fillRect(x + bw - 2, y, 2, h);
      if (p > 0.7) drawText(g, fmtNum(d.value) + (s.unit ?? ''), x + bw / 2, y - 10, { color: C.ink, align: 'center', shadow: null });
      const lab = wrap(d.label, slot - 4, 1).slice(0, 2);
      lab.forEach((l, j) => drawText(g, l, Math.round(ax + slot * i + slot / 2), ay + ah + 5 + j * 10, { color: C.ink, align: 'center', shadow: null }));
    });
  }
}

const pieCache = new Map<string, HTMLCanvasElement>();
function bakePie(data: ChartDatum[], r: number, sweep: number): HTMLCanvasElement {
  const key = data.map((d) => d.value + (d.colour ?? '')).join(',') + '|' + r + '|' + Math.round(sweep * 72);
  const hit = pieCache.get(key);
  if (hit) return hit;
  const sz = r * 2 + 3;
  const c = makeCanvas(sz, sz), g = ctx2d(c);
  const im = g.createImageData(sz, sz);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  const cum: number[] = []; let acc = 0;
  for (const d of data) { acc += Math.max(0, d.value) / total; cum.push(acc); }
  const cols = data.map((d, i) => hexToRgb(colOf(d, i)));
  const ol = hexToRgb(C.outline);
  const cx = r + 1, cy = r + 1;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > (r + 0.5) * (r + 0.5)) continue;
    let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    const f = a / (Math.PI * 2);
    if (f > sweep) continue;
    let idx = cum.findIndex((cv) => f <= cv); if (idx < 0) idx = cum.length - 1;
    let col = cols[idx];
    const rim = d2 > (r - 0.8) * (r - 0.8);
    // boundary lines between slices
    const dist = Math.sqrt(d2);
    let edge = false;
    for (const cv of [0, ...cum]) { let df = Math.abs(f - cv); df = Math.min(df, 1 - df); if (df * Math.PI * 2 * dist < 0.75 && dist > 1) edge = true; }
    if (f > sweep - 0.004 && sweep < 1) edge = true;
    let rgb: [number, number, number];
    if (rim || edge) rgb = ol;
    else {
      // top-left light, bottom-right shade, banded
      const lit = (-dx - dy) / (r * 1.4);
      const band = lit > 0.42 ? 1.18 : lit < -0.45 ? 0.78 : 1;
      rgb = [clamp(col[0] * band, 0, 255), clamp(col[1] * band, 0, 255), clamp(col[2] * band, 0, 255)];
    }
    const p = (y * sz + x) * 4;
    im.data[p] = rgb[0]; im.data[p + 1] = rgb[1]; im.data[p + 2] = rgb[2]; im.data[p + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  if (pieCache.size > 160) pieCache.clear();
  pieCache.set(key, c);
  return c;
}

function drawPie(g: Ctx, s: Extract<Slide, { type: 'pie' }>, k: number): void {
  const r = 78, cx = 130, cy = 148;
  const sweep = easeOutCubic(clamp(k * 1.4, 0, 1));
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(cx + 4, cy + r - 4, r - 2, 12, 0, 0, Math.PI * 2); g.fill();
  const c = bakePie(s.data, r, sweep);
  g.drawImage(c, cx - r - 1, cy - r - 1);
  const total = s.data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  const lx = 250;
  s.data.forEach((d, i) => {
    const y = 62 + i * 22;
    const p = clamp(k * 3 - i * 0.2, 0, 1);
    g.globalAlpha = p;
    box(g, lx, y, 12, 12, { face: colOf(d, i), cham: 0, depth: 1 });
    drawText(g, truncate(d.label, 130, 1), lx + 18, y + 1, { color: C.ink, shadow: null });
    drawText(g, `${fmtNum(d.value)}${s.unit ?? ''}  (${Math.round((d.value / total) * 100)}%)`, lx + 18, y + 11, { color: C.inkDim, shadow: null });
    g.globalAlpha = 1;
  });
}

function drawLineChart(g: Ctx, s: Extract<Slide, { type: 'line' }>, k: number): void {
  const ax = 46, ay = 56, aw = SLIDE_W - ax - 30, ah = SLIDE_H - ay - 48;
  const n = Math.max(...s.series.map((q) => q.points.length), 2);
  const max = niceMax(Math.max(...s.series.flatMap((q) => q.points), 1));
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(ay + ah - (ah * i) / 4);
    g.fillStyle = i === 0 ? C.ink : 'rgba(40,50,70,0.25)';
    if (i === 0) g.fillRect(ax, y, aw, 1); else for (let x = ax; x < ax + aw; x += 4) g.fillRect(x, y, 2, 1);
    drawText(g, fmtNum((max * i) / 4), ax - 5, y - 3, { color: C.inkDim, align: 'right', shadow: null });
  }
  g.fillStyle = C.ink; g.fillRect(ax, ay, 1, ah);
  const px = (i: number) => Math.round(ax + 8 + ((aw - 16) * i) / (n - 1));
  const py = (v: number) => Math.round(ay + ah - 4 - ((ah - 8) * v) / max);
  for (let i = 0; i < n; i++) {
    g.fillStyle = C.ink; g.fillRect(px(i), ay + ah, 1, 3);
    const lab = s.xLabels?.[i] ?? String(i + 1);
    drawText(g, lab, px(i), ay + ah + 6, { color: C.ink, align: 'center', shadow: null });
  }
  const reveal = easeOutCubic(clamp(k * 1.3, 0, 1)) * (n - 1);
  s.series.forEach((q, si) => {
    const col = colOf(q, si);
    for (let i = 0; i < q.points.length - 1; i++) {
      const seg = clamp(reveal - i, 0, 1);
      if (seg <= 0) break;
      const x0 = px(i), y0 = py(q.points[i]);
      const x1 = x0 + (px(i + 1) - x0) * seg, y1 = y0 + (py(q.points[i + 1]) - y0) * seg;
      line(g, x0, y0 + 1, x1, y1 + 1, 'rgba(0,0,0,0.2)', 2);
      line(g, x0, y0, x1, y1, col, 2);
    }
    q.points.forEach((v, i) => {
      if (i > reveal + 0.05) return;
      g.fillStyle = C.outline; g.fillRect(px(i) - 3, py(v) - 3, 7, 7);
      g.fillStyle = col; g.fillRect(px(i) - 2, py(v) - 2, 5, 5);
      g.fillStyle = '#fff'; g.fillRect(px(i) - 2, py(v) - 2, 2, 2);
    });
    // legend
    const ly = 46 + si * 10;
    g.fillStyle = col; g.fillRect(SLIDE_W - 150, ly + 2, 10, 4);
    drawText(g, truncate(q.label, 120), SLIDE_W - 136, ly, { color: C.ink, shadow: null });
  });
}

function drawBullets(g: Ctx, s: Extract<Slide, { type: 'bullets' }>, t: number): void {
  const sc = s.bullets.length <= 5 && s.bullets.every((b) => b.length < 44) ? 2 : 1;
  let y = 56;
  s.bullets.forEach((b, i) => {
    const p = easeOutCubic(clamp((t - 0.2 - i * 0.28) / 0.25, 0, 1));
    if (p <= 0) return;
    const lines = wrap(b, SLIDE_W - 90, sc);
    g.globalAlpha = p;
    const xo = Math.round((1 - p) * 24);
    box(g, 30 + xo, y + 2 * sc, 6 * sc, 6 * sc, { face: C.amber, cham: 0, depth: 1 });
    lines.forEach((l, j) => ink(g, l, 48 + xo, y + j * LINE_H * sc, { scale: sc }));
    g.globalAlpha = 1;
    y += lines.length * LINE_H * sc + (sc === 2 ? 12 : 7);
  });
}

function drawStats(g: Ctx, s: Extract<Slide, { type: 'stats' }>, t: number): void {
  const n = s.stats.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gw = SLIDE_W - 48, gh = SLIDE_H - 100;
  const cw = Math.floor((gw - 10 * (cols - 1)) / cols), ch = Math.min(88, Math.floor((gh - 10 * (rows - 1)) / rows));
  s.stats.forEach((st, i) => {
    const p = easeOutCubic(clamp((t - i * 0.1) / 0.3, 0, 1));
    const x = 24 + (i % cols) * (cw + 10), y = 50 + Math.floor(i / cols) * (ch + 10) + Math.round((1 - p) * 14);
    g.globalAlpha = p;
    dropShadow(g, x, y, cw, ch, 3);
    box(g, x, y, cw, ch, { face: '#fffdf6', cham: 1, depth: 2 });
    g.fillStyle = st.colour ?? C.navyHi; g.fillRect(x + 3, y + 3, cw - 6, 5);
    drawText(g, truncate(st.value, cw - 12, 3), x + cw / 2, y + 17, { color: C.ink, scale: 3, align: 'center', shadow: 'rgba(0,0,0,0.12)' });
    drawText(g, truncate(st.label.toUpperCase(), cw - 10), x + cw / 2, y + ch - 26, { color: C.navy, align: 'center', shadow: null });
    if (st.sub) drawText(g, truncate(st.sub, cw - 10), x + cw / 2, y + ch - 15, { color: C.inkDim, align: 'center', shadow: null });
    g.globalAlpha = 1;
  });
}

function drawTitleSlide(g: Ctx, s: Extract<Slide, { type: 'title' }>, t: number, branding: string): void {
  // dark gradient with dither bands
  const bands = ['#0f2036', '#132a46', '#183358', '#1f3f6c', '#25467a'];
  const bh = Math.ceil(SLIDE_H / bands.length);
  bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bh, SLIDE_W, bh + 1); });
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < SLIDE_H; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < SLIDE_W; x += 4) g.fillRect(x, y, 1, 1);
  // diagonal ribbon
  const rx = Math.round((1 - easeOutCubic(clamp(t * 2, 0, 1))) * -SLIDE_W);
  g.save(); g.translate(rx, 0);
  stripes(g, 0, 152, SLIDE_W, 14, C.amber, '#ffd34d', 4);
  g.fillStyle = C.outline; g.fillRect(0, 151, SLIDE_W, 1); g.fillRect(0, 166, SLIDE_W, 1);
  g.restore();
  // sun disc watermark
  g.globalAlpha = 0.18; g.fillStyle = C.gold;
  for (let y = -50; y <= 50; y++) { if (y > 6 && Math.floor((y - 6) / 4) % 2) continue; const sp = Math.floor(Math.sqrt(2500 - y * y)); g.fillRect(380 - sp, 90 + y, sp * 2, 1); }
  g.globalAlpha = 1;
  const p = easeOutCubic(clamp((t - 0.15) / 0.35, 0, 1));
  g.globalAlpha = p;
  drawText(g, 'PERFORMANCE REVIEW', 40, 40 + Math.round((1 - p) * 12), { color: C.gold, scale: 1 });
  const lines = wrap(s.title, SLIDE_W - 80, 4);
  lines.slice(0, 2).forEach((l, i) => drawText(g, l, 40, 62 + i * 38 + Math.round((1 - p) * 12), { color: '#fff', scale: 4, shadow: 'rgba(0,0,0,0.6)' }));
  if (s.subtitle) wrap(s.subtitle, SLIDE_W - 80, 2).slice(0, 2).forEach((l, i) => drawText(g, l, 40, 184 + i * 22, { color: '#cfe0f5', scale: 2 }));
  g.globalAlpha = 1;
  if (s.stamp) {
    const sw = measure(s.stamp, 2) + 16;
    const a = easeOutCubic(clamp((t - 0.7) / 0.15, 0, 1));
    g.globalAlpha = 0.9 * a;
    const sx = SLIDE_W - sw - 30, sy = SLIDE_H - 50 - Math.round((1 - a) * 10);
    g.fillStyle = '#e04545'; g.fillRect(sx, sy, sw, 3); g.fillRect(sx, sy + 24, sw, 3); g.fillRect(sx, sy, 3, 27); g.fillRect(sx + sw - 3, sy, 3, 27);
    drawText(g, s.stamp, sx + sw / 2, sy + 6, { color: '#e04545', scale: 2, align: 'center', shadow: null });
    g.globalAlpha = 1;
  }
  drawText(g, s.footer ?? branding, 40, SLIDE_H - 24, { color: '#8fa6c8', shadow: null });
  box(g, SLIDE_W - 52, 14, 30, 30, { face: C.navyHi, cham: 2, depth: 2 });
  drawGlyph(g, 'logo', SLIDE_W - 37, 29, C.gold, 2);
}

export function drawSlide(g: Ctx, s: Slide, t: number, page: number, total: number, branding = 'COMPANY POLICY  |  CONFIDENTIAL'): void {
  g.save();
  g.imageSmoothingEnabled = false;
  if (s.type === 'title') { drawTitleSlide(g, s, t, branding); g.restore(); return; }
  frame(g, s.title, page, total, branding);
  switch (s.type) {
    case 'bars': drawBars(g, s, t / 0.9); break;
    case 'pie': drawPie(g, s, t / 0.9); break;
    case 'line': drawLineChart(g, s, t / 1.1); break;
    case 'bullets': drawBullets(g, s, t); break;
    case 'stats': drawStats(g, s, t); break;
  }
  const note = (s as { note?: string }).note;
  if (note) { g.fillStyle = 'rgba(0,0,0,0)'; drawText(g, truncate(note, SLIDE_W - 28), 14, SLIDE_H - 30, { color: C.inkDim, shadow: null }); }
  g.restore();
}

// ---------------------------------------------------------------------------
export function exportScreenshot(canvas: HTMLCanvasElement, filename = 'company-policy-review.png'): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { resolve(false); return; }
      try {
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        const file = new File([blob], filename, { type: 'image/png' });
        if (isMobile && nav.canShare?.({ files: [file] }) && nav.share) {
          await nav.share({ files: [file], title: 'Company Policy' });
          resolve(true); return;
        }
      } catch (e) { if ((e as Error)?.name === 'AbortError') { resolve(false); return; } }
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resolve(true);
      } catch { resolve(false); }
    }, 'image/png');
  });
}

class SlideArea extends Widget {
  constructor(public deck: SlideDeck) { super(); }
  override nav(dx: number): boolean { if (dx !== 0) { this.deck.go(dx); return true; } return false; }
  override activate(): void { this.deck.go(1); }
  override click(px: number): void { this.deck.go(px < this.x + this.w * 0.2 ? -1 : 1); }
  override draw(g: Ctx): void { if (this.focused) focusRing(g, this.x, this.y, this.w, this.h, 2); }
}

export class SlideDeck {
  done = false;
  ui: Ui;
  index = 0;
  private prev = -1;
  private trans = 1; private dir = 1;
  private st = 0;
  private anim = new OpenAnim(7);
  private cur = makeCanvas(SLIDE_W, SLIDE_H);
  private old = makeCanvas(SLIDE_W, SLIDE_H);
  private area: SlideArea;
  private btnPrev: Button; private btnNext: Button; private btnExport: Button; private btnClose: Button;
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private slideRect: RectL = { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H };
  private toastMsg = ''; private toastT = 0;
  constructor(public o: DeckOpts) {
    this.ui = new Ui({ onBack: () => this.close() });
    this.area = this.ui.add(new SlideArea(this));
    this.btnPrev = this.ui.add(new Button({ text: 'Prev', glyph: 'left', onPress: () => this.go(-1), sound: 'ui_move' }));
    this.btnNext = this.ui.add(new Button({ text: 'Next', glyph: 'right', onPress: () => this.go(1), sound: 'ui_move' }));
    this.btnExport = this.ui.add(new Button({ text: 'Export PNG', glyph: 'camera', onPress: () => void this.exportCurrent() }));
    this.btnClose = this.ui.add(new Button({ text: 'Close', kind: 'primary', onPress: () => this.close(), sound: 'ui_back' }));
    this.ui.setFocus(this.area);
    audio.sfx('ui_login');
  }
  close(): void { if (this.done) return; this.done = true; this.o.onClose?.(); }
  go(d: number): void {
    const n = this.o.slides.length;
    const ni = this.index + d;
    if (ni < 0) { audio.sfx('ui_error'); return; }
    if (ni >= n) { if (d > 0) this.close(); return; }
    this.prev = this.index; this.index = ni; this.dir = d; this.trans = 0; this.st = 0;
    this.renderTo(this.old, this.prev, 99);
    audio.sfx('ui_slide');
  }
  private renderTo(c: HTMLCanvasElement, i: number, t: number): void {
    const g = ctx2d(c);
    drawSlide(g, this.o.slides[i], t, i + 1, this.o.slides.length, this.o.branding);
  }
  /** Render the current slide at 4x (1920x1080) into a fresh canvas. */
  renderExport(scale = 4): HTMLCanvasElement {
    const c = makeCanvas(SLIDE_W * scale, SLIDE_H * scale);
    const g = ctx2d(c);
    g.imageSmoothingEnabled = false;
    this.renderTo(this.cur, this.index, 99);
    g.drawImage(this.cur, 0, 0, SLIDE_W * scale, SLIDE_H * scale);
    return c;
  }
  async exportCurrent(): Promise<void> {
    const ok = await exportScreenshot(this.renderExport(), (this.o.exportName ?? 'company-policy-review') + `-slide${this.index + 1}.png`);
    this.toastMsg = ok ? 'Slide exported. Share it with your colleagues.' : 'Export failed. IT has been notified (they won\'t care).';
    this.toastT = 3;
    audio.sfx(ok ? 'ui_purchase' : 'ui_error');
  }
  update(dt: number): void {
    this.anim.step(dt);
    this.st += dt; this.toastT = Math.max(0, this.toastT - dt);
    if (this.trans < 1) this.trans = Math.min(1, this.trans + dt / 0.28);
    const r = app.renderer, s = uiS();
    const th = titleBarH();
    const bh = btnH();
    const ww = SLIDE_W + 18, wh = th + 8 + SLIDE_H + 6 + bh + (s === 2 ? 6 : 24);
    const aw = r.W - r.safe.l - r.safe.r, ah = r.H - r.safe.t - r.safe.b;
    this.win = { x: Math.round(r.safe.l + (aw - ww) / 2), y: Math.round(r.safe.t + Math.max(0, (ah - wh) / 2)), w: ww, h: wh };
    const sx = this.win.x + 9, sy = this.win.y + th + 6;
    this.slideRect = { x: sx, y: sy, w: SLIDE_W, h: SLIDE_H };
    this.area.set(sx, sy, SLIDE_W, SLIDE_H);
    const by = sy + SLIDE_H + 6;
    let bx = sx;
    const pw = this.btnPrev.autoW(9), nw = this.btnNext.autoW(9), ew = this.btnExport.autoW(9), cw = this.btnClose.autoW(10);
    this.btnPrev.set(bx, by, pw, bh); bx += pw + 4;
    this.btnNext.set(bx, by, nw, bh);
    this.btnClose.set(sx + SLIDE_W - cw, by, cw, bh);
    this.btnExport.set(sx + SLIDE_W - cw - ew - 4, by, ew, bh);
    this.btnNext.text = this.index >= this.o.slides.length - 1 ? 'Finish' : 'Next';
    this.btnPrev.enabled = this.index > 0;
    this.renderTo(this.cur, this.index, this.st);
    if (app.input.pressed('alt')) void this.exportCurrent();
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    const bd = this.o.backdrop ?? 'dim';
    if (bd === 'dim') dim(g, 0.6 * easeOutCubic(this.anim.t)); else if (bd === 'desktop') drawDesktop(g, 'slate');
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    drawWindow(g, this.o.title ?? 'Performance Review', rr, { icon: 'chart', close: true, status: this.toastT > 0 ? this.toastMsg : undefined });
    if (!this.anim.done) return;
    const sr = this.slideRect;
    // slide viewport
    g.fillStyle = C.outline; g.fillRect(sr.x - 1, sr.y - 1, sr.w + 2, sr.h + 2);
    g.save(); g.beginPath(); g.rect(sr.x, sr.y, sr.w, sr.h); g.clip();
    if (this.trans < 1) {
      const e = easeOutCubic(this.trans);
      const off = Math.round(e * SLIDE_W) * this.dir;
      g.drawImage(this.old, sr.x - off, sr.y);
      g.drawImage(this.cur, sr.x - off + SLIDE_W * this.dir, sr.y);
    } else g.drawImage(this.cur, sr.x, sr.y);
    g.restore();
    // page dots
    const n = this.o.slides.length;
    const dx0 = sr.x + Math.round(sr.w / 2 - (n * 9) / 2);
    const dy = this.btnNext.y + Math.round(this.btnNext.h / 2) - 2;
    const room = this.btnExport.x - 6 - (this.btnNext.x + this.btnNext.w + 6);
    if (room >= n * 9) for (let i = 0; i < n; i++) { g.fillStyle = C.outline; g.fillRect(dx0 + i * 9 - 1, dy - 1, 7, 7); g.fillStyle = i === this.index ? C.amber : C.faceDark; g.fillRect(dx0 + i * 9, dy, 5, 5); }
    this.ui.render(g);
    if (uiS() === 1) this.ui.drawHints(g, this.win.x + 8, this.win.y + this.win.h - 20, this.win.w - 16, [{ key: '←→', text: 'Slides' }, { action: 'alt', text: 'Export' }, { action: 'back', text: 'Close' }], 'center', false);
    this.ui.drawCursor(g);
  }
}
