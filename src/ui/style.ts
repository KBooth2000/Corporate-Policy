// CorpOS visual language: chunky bevels, chamfered corners, own glyph + icon set.
// Everything here is generated procedurally. NO resemblance to any real operating system trade dress:
// chamfered window corners, stepped drop shadows, amber "lanyard" accents, hex logo, tiled glyph icons.
import { app } from '../core/app';
import type { Device } from '../core/input';
import { UI } from '../art/palette';
import { promptGlyph } from '../art/items';
import { Ctx, makeCanvas, ctx2d, shade, mixHex } from '../render/canvas';
import { drawText, measure, GLYPH_H } from '../render/font';

// ---------------------------------------------------------------------------
// Colours (derived from the shared UI palette)
export const C = {
  outline: '#14161f',
  ink: UI.text,
  inkDim: UI.textDim,
  inkLight: UI.textLight,
  face: UI.window,
  faceHi: '#f8f6ef',
  faceLo: UI.windowDark,
  faceDark: '#8f8a7e',
  navy: UI.titleBar,
  navyHi: UI.titleBarActive,
  navyDark: '#16284a',
  teal: UI.desktop,
  tealDark: UI.desktopDark,
  amber: UI.focus,
  gold: UI.highlight,
  good: UI.good,
  bad: UI.bad,
  warn: UI.warn,
  shadow: 'rgba(6,8,14,0.45)',
  dim: 'rgba(8,10,16,0.6)',
};

/** UI scale (settings.uiScale): enlarges text and hit areas. */
export function uiS(): number { return app.settings?.uiScale === 2 ? 2 : 1; }

export interface RectL { x: number; y: number; w: number; h: number }
export const inRect = (r: RectL, x: number, y: number): boolean => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t: number): number => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// ---------------------------------------------------------------------------
// Box primitives

export interface BoxOpts {
  face?: string;
  kind?: 'raised' | 'sunken' | 'flat';
  outline?: string | null;
  /** chamfer size of the corners (0 = square). */
  cham?: number;
  /** bevel thickness. */
  depth?: 1 | 2;
}

function fr(g: Ctx, col: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/** Chunky bevelled panel with chamfered corners. All coordinates are integers. */
export function box(g: Ctx, x: number, y: number, w: number, h: number, o: BoxOpts = {}): void {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 3 || h < 3) { fr(g, o.face ?? C.face, x, y, w, h); return; }
  const face = o.face ?? C.face;
  const kind = o.kind ?? 'raised';
  const c = Math.min(o.cham ?? 1, 2, (h >> 1) - 1, (w >> 1) - 1);
  const out = o.outline === undefined ? C.outline : o.outline;
  const d = o.depth ?? 2;
  const inO = (r: number) => Math.max(0, c - r, c - (h - 1 - r));
  // outline silhouette
  for (let r = 0; r < h; r++) { const i = inO(r); fr(g, out ?? face, x + i, y + r, w - i * 2, 1); }
  // face
  for (let r = 1; r < h - 1; r++) { const i = inO(r) + 1 > 1 ? inO(r) + 1 : 1; fr(g, face, x + i, y + r, w - i * 2, 1); }
  if (kind === 'flat') return;
  const lo = shade(face, -0.28), lo2 = shade(face, -0.14), hi = shade(face, 0.6), hi2 = shade(face, 0.28);
  const raised = kind === 'raised';
  const tl = raised ? hi : lo, br = raised ? lo : hi;
  const tl2 = raised ? hi2 : lo2, br2 = raised ? lo2 : hi2;
  const i1 = inO(1) + 1 > 1 ? inO(1) + 1 : 1;
  const ib = inO(h - 2) + 1 > 1 ? inO(h - 2) + 1 : 1;
  fr(g, tl, x + i1, y + 1, w - i1 - 1 - (ib > 1 ? 1 : 0), 1);
  fr(g, tl, x + 1, y + 1 + c, 1, h - 2 - c * 2 + 1);
  fr(g, br, x + ib, y + h - 2, w - ib - 1, 1);
  fr(g, br, x + w - 2, y + 1 + c, 1, h - 2 - c);
  if (d === 2 && w > 8 && h > 8) {
    fr(g, tl2, x + 2, y + 2, w - 5, 1);
    fr(g, tl2, x + 2, y + 2, 1, h - 5);
    fr(g, br2, x + 3, y + h - 3, w - 5, 1);
    fr(g, br2, x + w - 3, y + 3, 1, h - 5);
  }
}

export function dropShadow(g: Ctx, x: number, y: number, w: number, h: number, off = 3, col = C.shadow): void {
  g.fillStyle = col;
  g.fillRect(Math.round(x + off), Math.round(y + h), Math.round(w - off), off);
  g.fillRect(Math.round(x + w), Math.round(y + off), off, Math.round(h - off));
  // stepped corner for a chunkier look
  g.fillRect(Math.round(x + w), Math.round(y + h), off - 1, off - 1);
}

/** Inset "well" used for text fields, list backgrounds, track grooves. */
export function well(g: Ctx, x: number, y: number, w: number, h: number, face = '#fbfaf5'): void {
  box(g, x, y, w, h, { face, kind: 'sunken', depth: 1, cham: 0 });
}

/** Dithered stripe fill (title-bar lanyard pattern). */
export function stripes(g: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, step = 2): void {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = a; g.fillRect(x, y, w, h);
  g.fillStyle = b;
  for (let i = -h; i < w; i += step * 2) {
    for (let j = 0; j < h; j++) {
      const px = i + j;
      if (px >= 0 && px < w) g.fillRect(x + px, y + j, Math.min(step, w - px), 1);
    }
  }
}

export function checker(g: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, s = 2): void {
  g.fillStyle = a; g.fillRect(x, y, w, h);
  g.fillStyle = b;
  for (let j = 0; j < h; j += s) for (let i = 0; i < w; i += s) if (((i / s + j / s) & 1) === 0) g.fillRect(x + i, y + j, Math.min(s, w - i), Math.min(s, h - j));
}

/** Focus ring: blinking amber/white bracket rectangle, 2px outside the widget. */
export function focusRing(g: Ctx, x: number, y: number, w: number, h: number, pad = 2): void {
  const on = Math.floor(app.time * 3.5) % 2 === 0;
  const col = on ? C.amber : '#fff3c4';
  x -= pad; y -= pad; w += pad * 2; h += pad * 2;
  fr(g, C.outline, x - 1, y + 1, 1, h - 2); fr(g, C.outline, x + w, y + 1, 1, h - 2);
  fr(g, C.outline, x + 1, y - 1, w - 2, 1); fr(g, C.outline, x + 1, y + h, w - 2, 1);
  fr(g, col, x, y + 1, 1, h - 2); fr(g, col, x + w - 1, y + 1, 1, h - 2);
  fr(g, col, x + 1, y, w - 2, 1); fr(g, col, x + 1, y + h - 1, w - 2, 1);
  // brighter corner studs
  fr(g, '#fff', x + 1, y + 1, 1, 1); fr(g, '#fff', x + w - 2, y + 1, 1, 1); fr(g, '#fff', x + 1, y + h - 2, 1, 1); fr(g, '#fff', x + w - 2, y + h - 2, 1, 1);
}

// ---------------------------------------------------------------------------
// Text helpers (dark text on light faces => no shadow)
export interface TxtOpts { color?: string; scale?: number; align?: 'left' | 'center' | 'right'; shadow?: string | null; outline?: string | null; alpha?: number }
export function ink(g: Ctx, text: string, x: number, y: number, o: TxtOpts = {}): number {
  return drawText(g, text, x, y, { color: C.ink, shadow: null, ...o });
}
/** Vertically centre text (cap height 7) within a box row. */
export function textY(y: number, h: number, scale = 1): number { return Math.round(y + (h - 7 * scale) / 2); }
export function truncate(text: string, maxW: number, scale = 1): string {
  if (measure(text, scale) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measure(t + '…', scale) > maxW) t = t.slice(0, -1);
  return t + '…';
}

// ---------------------------------------------------------------------------
// Glyphs (9x9-ish mono masks, our own design)
const GL: Record<string, string[]> = {
  close: ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '###...###', '##.....##'],
  min: ['.........', '.........', '.........', '.........', '.........', '.........', '.#######.', '.#######.', '.........'],
  max: ['#########', '#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########', '.........'],
  up: ['....#....', '...###...', '..#####..', '.#######.', '#########'],
  down: ['#########', '.#######.', '..#####..', '...###...', '....#....'],
  left: ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
  right: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  check: ['.......##', '......###', '.....###.', '##..###..', '#######..', '.#####...', '..###....', '...#.....', '.........'],
  plus: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'],
  warn: ['....#....', '...###...', '...#.#...', '..##.##..', '..##.##..', '.###.###.', '.###.###.', '#########', '.........'],
  info: ['..#####..', '.#######.', '####.####', '####.####', '#########', '####.####', '####.####', '.#######.', '..#####..'],
  lock: ['..#####..', '.##...##.', '.##...##.', '#########', '#########', '####.####', '####.####', '#########', '#########'],
  gear: ['...###...', '.#.###.#.', '.#######.', '###...###', '###...###', '###...###', '.#######.', '.#.###.#.', '...###...'],
  mail: ['#########', '##.....##', '#.#...#.#', '#..#.#..#', '#...#...#', '#.......#', '#.......#', '#########', '.........'],
  user: ['...###...', '..#####..', '..#####..', '...###...', '..#####..', '.#######.', '#########', '#########', '.........'],
  power: ['....#....', '..#.#.#..', '.#..#..#.', '#...#...#', '#.......#', '#.......#', '.#.....#.', '..#####..', '.........'],
  folder: ['.####....', '#######..', '#########', '#.......#', '#.......#', '#.......#', '#.......#', '#########', '.........'],
  doc: ['.######..', '.#....##.', '.#....###', '.#......#', '.#.####.#', '.#......#', '.#.####.#', '.#......#', '.########'],
  clock: ['..#####..', '.#..#..#.', '#...#...#', '#...#...#', '#...###.#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  bell: ['....#....', '..#####..', '.#######.', '.#######.', '.#######.', '#########', '#########', '....#....', '.........'],
  play: ['##.......', '####.....', '######...', '########.', '#########', '########.', '######...', '####.....', '##.......'],
  key: ['.####....', '##..##...', '##..##...', '.####....', '..##.....', '..##.....', '..###....', '..##.....', '..###....'],
  star: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.'],
  chart: ['.........', '......###', '......###', '..###.###', '..###.###', '#.###.###', '#.###.###', '#########', '.........'],
  cart: ['#........', '##.......', '.########', '..#######', '..#######', '...######', '...######', '..#...#..', '..#...#..'],
  calendar: ['.#.....#.', '#########', '#########', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#.......#', '#########'],
  hash: ['..#...#..', '..#...#..', '#########', '..#...#..', '..#...#..', '#########', '..#...#..', '..#...#..', '..#...#..'],
  slider: ['.........', '..#......', '########.', '..#......', '.........', '.....#...', '.########', '.....#...', '.........'],
  skull: ['..#####..', '.#######.', '#########', '##.###.##', '##.###.##', '#########', '..#####..', '..#.#.#..', '..#####..'],
  heart: ['.##...##.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  logo: ['..#####..', '.#######.', '###...###', '###......', '###......', '###...###', '.#######.', '..#####..', '.........'],
  dot: ['.........', '...###...', '..#####..', '..#####..', '..#####..', '...###...', '.........', '.........', '.........'],
  camera: ['..###....', '#########', '#.......#', '#..###..#', '#.#...#.#', '#.#...#.#', '#..###..#', '#########', '.........'],
  shield: ['#########', '#########', '#########', '#########', '.#######.', '.#######.', '..#####..', '...###...', '....#....'],
};

const glyphCache = new Map<string, HTMLCanvasElement>();
export type GlyphName = keyof typeof GL;
export function glyph(name: string, color: string): HTMLCanvasElement {
  const k = name + color;
  let c = glyphCache.get(k);
  if (c) return c;
  const rows = GL[name] ?? GL.dot;
  const w = Math.max(...rows.map((r) => r.length));
  c = makeCanvas(w, rows.length);
  const g = ctx2d(c);
  g.fillStyle = color;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') g.fillRect(x, y, 1, 1); });
  glyphCache.set(k, c);
  return c;
}
export function glyphSize(name: string): { w: number; h: number } {
  const r = GL[name] ?? GL.dot; return { w: Math.max(...r.map((s) => s.length)), h: r.length };
}
/** Draw a glyph centred on (cx, cy) at integer scale. */
export function drawGlyph(g: Ctx, name: string, cx: number, cy: number, color: string, scale = 1): void {
  const c = glyph(name, color);
  g.drawImage(c, Math.round(cx - (c.width * scale) / 2), Math.round(cy - (c.height * scale) / 2), c.width * scale, c.height * scale);
}

// ---------------------------------------------------------------------------
// OS icon tiles: chunky coloured tile + oversized white glyph. Our own icon style.
const tileCache = new Map<string, HTMLCanvasElement>();
export function osIcon(name: string, tint: string, size = 26): HTMLCanvasElement {
  const k = name + tint + size;
  let c = tileCache.get(k);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = ctx2d(c);
  box(g, 0, 0, size, size, { face: tint, cham: 2, depth: 2 });
  const gl = glyph(name, '#fff');
  const sc = size >= 22 ? 2 : 1;
  const sh = glyph(name, shade(tint, -0.45));
  const gx = Math.round((size - gl.width * sc) / 2), gy = Math.round((size - gl.height * sc) / 2);
  g.drawImage(sh, gx + 1, gy + 1, gl.width * sc, gl.height * sc);
  g.drawImage(gl, gx, gy, gl.width * sc, gl.height * sc);
  tileCache.set(k, c);
  return c;
}

/** CorpOS logo badge: navy hex-ish tile with amber C. */
export function drawBadge(g: Ctx, x: number, y: number, s = 1): void {
  const w = 11 * s;
  box(g, x, y, w, w, { face: C.navyHi, cham: 2 * s > 3 ? 3 : 2, depth: 1 });
  drawGlyph(g, 'logo', x + w / 2, y + w / 2, C.gold, 1);
}

// ---------------------------------------------------------------------------
// Button prompt glyphs (promptGlyph() when it is real art, otherwise our own keycap)
const promptCache = new Map<string, HTMLCanvasElement>();
const PAD_COL: Record<string, string> = { A: '#3fbf6a', B: '#e04545', X: '#3f7fd6', Y: '#f0bf2e', Cross: '#3f7fd6', Circle: '#e04545', Square: '#d86aa8', Triangle: '#3fbf6a' };

function isPlaceholder(c: HTMLCanvasElement): boolean {
  try {
    const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
    for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) return false;
    return true;
  } catch { return true; }
}

function ownPrompt(label: string, device: Device): HTMLCanvasElement {
  const padLike = device === 'xbox' || device === 'playstation' || device === 'pad';
  const single = label.length <= 1 || PAD_COL[label] !== undefined;
  if (padLike && single) {
    const c = makeCanvas(11, 11); const g = ctx2d(c);
    const col = PAD_COL[label] ?? '#8a93a6';
    // circle button
    g.fillStyle = C.outline;
    for (const [x, y, w, h] of [[3, 0, 5, 11], [1, 1, 9, 9], [0, 3, 11, 5]] as const) g.fillRect(x, y, w, h);
    g.fillStyle = col;
    for (const [x, y, w, h] of [[3, 1, 5, 9], [1, 2, 9, 7], [2, 3, 7, 5]] as const) g.fillRect(x, y, w, h);
    g.fillStyle = shade(col, 0.45); g.fillRect(3, 1, 4, 1); g.fillRect(2, 2, 1, 2);
    if (label === 'Cross' || label === 'Circle' || label === 'Square' || label === 'Triangle') {
      g.fillStyle = '#fff';
      if (label === 'Cross') { for (let i = 0; i < 5; i++) { g.fillRect(3 + i, 3 + i, 1, 1); g.fillRect(7 - i, 3 + i, 1, 1); } }
      else if (label === 'Square') { g.fillRect(3, 3, 5, 5); g.fillStyle = col; g.fillRect(4, 4, 3, 3); }
      else if (label === 'Circle') { g.fillRect(4, 3, 3, 5); g.fillRect(3, 4, 5, 3); g.fillStyle = col; g.fillRect(4, 4, 3, 3); }
      else { g.fillRect(5, 3, 1, 1); g.fillRect(4, 4, 3, 1); g.fillRect(4, 5, 3, 1); g.fillRect(3, 6, 5, 2); g.fillStyle = col; g.fillRect(5, 5, 1, 1); g.fillRect(4, 7, 3, 1); }
    } else {
      const t = makeCanvas(5, 9); const tg = ctx2d(t);
      drawText(tg, label, 0, 0, { color: '#fff', shadow: null });
      g.drawImage(t, 3, 1);
    }
    return c;
  }
  const w = Math.max(11, measure(label) + 7);
  const c = makeCanvas(w, 12); const g = ctx2d(c);
  // keycap
  box(g, 0, 0, w, 11, { face: '#eceae2', cham: 1, depth: 1 });
  fr(g, shade('#eceae2', -0.28), 1, 9, w - 2, 1);
  drawText(g, label, Math.round(w / 2), 2, { color: C.ink, shadow: null, align: 'center' });
  return c;
}

export function promptCanvas(label: string, device: Device): HTMLCanvasElement {
  const k = device + '|' + label;
  let c = promptCache.get(k);
  if (c) return c;
  let real: HTMLCanvasElement | null = null;
  try { real = promptGlyph(label, device); } catch { real = null; }
  c = real && !isPlaceholder(real) ? real : ownPrompt(label, device);
  promptCache.set(k, c);
  return c;
}

/** Draw a prompt glyph at (x, y) top-left; returns width in px. */
export function drawPrompt(g: Ctx, label: string, x: number, y: number, scale = 1): number {
  const dev = app.input?.device ?? 'kbm';
  const c = promptCanvas(label, dev === 'touch' ? 'kbm' : dev);
  g.drawImage(c, Math.round(x), Math.round(y), c.width * scale, c.height * scale);
  return c.width * scale;
}

// ---------------------------------------------------------------------------
// Mouse cursor (the canvas hides the system cursor)
export function drawCursor(g: Ctx, x: number, y: number, pressed = false): void {
  x = Math.round(x); y = Math.round(y);
  const rows = ['#', '##', '#.#', '#..#', '#...#', '#....#', '#.....#', '#......#', '#.......#', '#....#####', '#..#..#', '#.# #..#', '##  #..#', '#    #..#', '     #..#', '      ##'];
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== ' ') g.fillRect(x + i + 1, y + j + 1, 1, 1); });
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      if (r[i] === ' ') continue;
      g.fillStyle = r[i] === '#' ? C.outline : pressed ? C.gold : '#fff';
      g.fillRect(x + i, y + j, 1, 1);
    }
  });
}

/** Should the software mouse cursor be shown right now? */
export function showCursor(): boolean {
  const i = app.input;
  return !!i && i.device === 'kbm' && i.mouse.inside;
}

// ---------------------------------------------------------------------------
export function colourFor(rarity: number | string | undefined): string {
  const arr = ['#c9cdd4', '#5ec8ff', '#ffc53d'];
  if (typeof rarity === 'number') return arr[clamp(rarity, 0, 2)];
  if (typeof rarity === 'string' && rarity.startsWith('#')) return rarity;
  return arr[0];
}

export function dim(g: Ctx, a = 0.55): void {
  const r = app.renderer;
  g.fillStyle = `rgba(8,10,16,${a})`;
  g.fillRect(0, 0, r.W, r.H);
}

export { shade, mixHex, GLYPH_H };
