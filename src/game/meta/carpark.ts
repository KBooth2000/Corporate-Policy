// The staff car park: procedural pixel art for the hub (spec 7.3). Everything is drawn at runtime onto canvases:
// a baked ground/facade background, depth-sorted props (vending machine, noticeboard, the player's car, lamp posts...),
// an emissive pass (lit windows, glass, lamp heads) and a darkness layer with sodium-light pools cut out of it.
import { Rng } from '../../core/rng';
import { Ctx, makeCanvas, ctx2d, paint, rect, ellipse, shade, mixHex, withOutline, line } from '../../render/canvas';
import { drawText, measure } from '../../render/font';
import type { IconName } from '../../art/items';

export const SW = 640, SH = 360;

export type Mood = 'night' | 'rain' | 'dawn';
export type StationId = 'vending' | 'daily' | 'noticeboard' | 'carboot' | 'radio' | 'dashboard' | 'clockin';
export interface Rect { x: number; y: number; w: number; h: number }

export interface Prop {
  id: string;
  canvas: HTMLCanvasElement;
  emissive?: HTMLCanvasElement;
  /** base (feet) position in screen px and the origin inside the canvas */
  x: number; y: number; ox: number; oy: number;
  /** footprint blocking the player, in screen px */
  solid?: Rect;
  shadow?: { rx: number; ry: number };
  station?: StationId;
  /** the emissive canvas is drawn at (canvas offset - emOff); outlined sprites use 1 (default) */
  emOff?: number;
}

export interface StationDef {
  id: StationId; name: string; short: string; icon: IconName;
  /** where the player stands to use it (screen px) */
  x: number; y: number; r: number;
  /** clickable / highlight area (screen px) */
  box: Rect;
  hint: string;
  /** screen y of the top of the prompt bubble (defaults to above the box) */
  labelY?: number;
  /** vertical offset of the floating marker icon from the interaction point (default -30) */
  markerDy?: number;
}

export interface Lamp { x: number; y: number; rx: number; ry: number; strength: number; flicker?: boolean }

export interface CarPark {
  W: number; H: number; ox: number; oy: number; mood: Mood;
  bg: HTMLCanvasElement;
  emissive: HTMLCanvasElement;
  dark: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  props: Prop[];
  stations: StationDef[];
  lamps: Lamp[];
  walk: Rect;
  solids: Rect[];
  spawn: { x: number; y: number };
  playerLight: HTMLCanvasElement;
  dailyScreen: HTMLCanvasElement;
  rainArea: Rect;
}

interface Pal {
  sky: string[]; wall: string; wallLo: string; wallHi: string; glass: string; asphalt: string; asphaltA: string; asphaltB: string; paint: string; kerb: string; kerbHi: string; slab: string; slabLo: string;
  dark: string; darkA: number; litWin: string; lanyard: string; lampLight: string; hedge: string;
}

const PAL: Record<Mood, Pal> = {
  night: { sky: ['#070b1c', '#0b1226', '#101a32'], wall: '#232c42', wallLo: '#1a2236', wallHi: '#34405c', glass: '#111827', asphalt: '#2c303b', asphaltA: '#343846', asphaltB: '#242831', paint: '#c8c3ae', kerb: '#4d5262', kerbHi: '#7a8092', slab: '#4d5362', slabLo: '#3d4351', dark: '#070b20', darkA: 0.58, litWin: '#ffd98a', lanyard: '#7ff0d8', lampLight: 'rgba(255,170,60,', hedge: '#18291f' },
  rain: { sky: ['#06080f', '#0a0f1a', '#0e1522'], wall: '#1f2738', wallLo: '#161d2c', wallHi: '#2e3a52', glass: '#0e141f', asphalt: '#262a35', asphaltA: '#2e3340', asphaltB: '#1e222b', paint: '#aaa68f', kerb: '#434858', kerbHi: '#69707f', slab: '#434958', slabLo: '#353b49', dark: '#050918', darkA: 0.64, litWin: '#ffd98a', lanyard: '#7ff0d8', lampLight: 'rgba(255,170,60,', hedge: '#12211a' },
  dawn: { sky: ['#3a3a78', '#a45a8a', '#f09a7a'], wall: '#5e5470', wallLo: '#463f58', wallHi: '#80748e', glass: '#3a3550', asphalt: '#575562', asphaltA: '#625f6e', asphaltB: '#4a4856', paint: '#e0d8c4', kerb: '#7a7684', kerbHi: '#a39eae', slab: '#74707e', slabLo: '#625e6c', dark: '#4a2a5a', darkA: 0.2, litWin: '#ffe2a8', lanyard: '#9ff5e0', lampLight: 'rgba(255,200,120,', hedge: '#34503a' },
};

const stageRng = () => new Rng(0xca12ba2);

// ---------------------------------------------------------------------------
// tiny drawing helpers
const R = rect;
function dither(g: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, phase = 0): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { g.fillStyle = (i + j + phase) % 2 === 0 ? a : b; g.fillRect(x + i, y + j, 1, 1); }
}
function box(g: Ctx, x: number, y: number, w: number, h: number, face: string, lo: string, hi: string): void {
  R(g, x, y, w, h, face); R(g, x, y, w, 1, hi); R(g, x, y, 1, h, hi); R(g, x + w - 1, y, 1, h, lo); R(g, x, y + h - 1, w, 1, lo);
}

// ---------------------------------------------------------------------------
// Props
export function carSprite(o: { body: string; roof?: string; boot?: boolean; lights?: boolean; flip?: boolean; decor?: string[]; trophies?: number; plate?: string }): { canvas: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const W = 96, H = 48;
  const body = o.body, lo = shade(body, -0.35), hi = shade(body, 0.28), roof = o.roof ?? shade(body, 0.12);
  const draw = (g: Ctx, emissive: boolean) => {
    if (!emissive) {
      // wheels (south side)
      const wheel = (cx: number) => { ellipse(g, cx, 38, 7, 6, '#0b0c10'); ellipse(g, cx, 37, 5, 4, '#1b1d24'); ellipse(g, cx, 37, 2, 2, '#9aa0ae'); R(g, cx - 1, 36, 1, 1, '#d8dce6'); };
      // lower body (south wall)
      R(g, 5, 26, 86, 13, lo);
      R(g, 6, 25, 84, 13, body);
      R(g, 6, 25, 84, 1, hi);
      R(g, 5, 38, 86, 1, '#14161c');
      // wheel arches then wheels
      wheel(24); wheel(72);
      // door seams + handles
      for (const x of [38, 52, 66]) R(g, x, 27, 1, 9, lo);
      for (const x of [41, 55]) R(g, x, 29, 4, 1, hi);
      // sill / bumpers
      R(g, 4, 31, 3, 6, '#3a3e4a'); R(g, 89, 31, 3, 6, '#3a3e4a');
      // top surfaces: trunk, hood, cabin
      R(g, 6, 15, 26, 11, body); R(g, 6, 15, 26, 1, hi);
      R(g, 62, 15, 28, 11, body); R(g, 62, 15, 28, 1, hi);
      R(g, 8, 25, 22, 1, lo); R(g, 64, 25, 24, 1, lo);
      // cabin
      R(g, 30, 6, 34, 20, roof); R(g, 30, 6, 34, 1, shade(roof, 0.3));
      R(g, 31, 18, 32, 8, '#162033');            // side glass
      for (const x of [43, 53]) R(g, x, 18, 1, 8, roof);
      R(g, 32, 19, 6, 1, '#6a86b0'); R(g, 45, 19, 6, 1, '#6a86b0'); R(g, 55, 19, 6, 1, '#6a86b0');
      R(g, 31, 7, 32, 10, shade(roof, 0.14));    // roof panel
      R(g, 34, 9, 26, 6, shade(roof, 0.05));
      // windscreen + rear screen
      R(g, 62, 9, 3, 15, '#1d2c46'); R(g, 28, 9, 3, 15, '#1d2c46');
      // hood detail
      R(g, 66, 17, 20, 1, shade(body, 0.12)); R(g, 66, 22, 20, 1, lo);
      // grille + plate
      R(g, 91, 28, 1, 7, '#14161c');
      // tail
      R(g, 5, 28, 2, 4, '#7a1218');
      // trim
      if (o.decor?.includes('decor_gold_trim')) { R(g, 6, 33, 84, 1, '#d4a537'); R(g, 6, 34, 84, 1, '#8a6a1a'); }
      if (o.plate) { R(g, 7, 34, 11, 4, '#f2f0e6'); drawText(g, o.plate, 12, 34, { color: '#222', shadow: null, scale: 1 }); }
      // boot open: raised lid + contents
      if (o.boot) {
        R(g, 6, 15, 26, 11, '#12141a');                       // dark cavity
        R(g, 8, 17, 22, 8, '#1c1f28');
        R(g, 10, 17, 10, 8, '#b48a54'); R(g, 10, 17, 10, 1, '#d6ae78'); R(g, 14, 17, 2, 8, '#8a6538');   // cardboard box
        R(g, 21, 21, 7, 3, '#2f5fa8'); R(g, 22, 20, 5, 1, '#3f7fd6');                                    // folded jacket
        R(g, 3, 1, 29, 10, hi); R(g, 3, 1, 29, 1, shade(hi, 0.3)); R(g, 3, 10, 29, 1, lo);               // lid
        R(g, 5, 3, 25, 1, shade(hi, 0.2));
        R(g, 3, 11, 1, 5, lo); R(g, 31, 11, 1, 5, lo);
      }
      // trophies on dash
      const tn = Math.min(5, o.trophies ?? 0);
      for (let i = 0; i < tn; i++) { R(g, 66 + i * 4, 11, 3, 4, '#d4a537'); R(g, 66 + i * 4, 11, 3, 1, '#f6dc8a'); R(g, 67 + i * 4, 15, 1, 1, '#8a6a1a'); }
      if (o.decor?.includes('decor_air_freshener')) { R(g, 61, 14, 1, 3, '#cfd2da'); R(g, 59, 17, 5, 5, '#3fbf6a'); R(g, 60, 17, 3, 1, '#7ee8a0'); R(g, 61, 22, 1, 1, '#3fbf6a'); }
      if (o.decor?.includes('decor_bobblehead')) { R(g, 56, 10, 4, 4, '#e8b996'); R(g, 56, 10, 4, 1, '#3b2a1e'); R(g, 57, 14, 2, 2, '#232c42'); }
      // front lights housing
      R(g, 90, 21, 2, 5, lo);
    } else {
      if (o.lights) { R(g, 90, 22, 3, 3, '#fff6c0'); R(g, 89, 23, 1, 1, '#ffe27a'); R(g, 4, 28, 2, 3, '#ff3a2a'); }
      if (o.decor?.includes('decor_fairy_lights')) {
        const cols = ['#ff6a8a', '#ffd34d', '#7ff0d8', '#8fb8ff'];
        for (let x = 8; x < 90; x += 4) { const y = 26 + Math.round(Math.sin(x * 0.5) * 1.5); R(g, x, y, 2, 2, cols[(x >> 2) % 4]); }
      }
    }
  };
  const base = paint(W, H, (g) => draw(g, false));
  const out = withOutline(base, '#0d0e14');
  const em = paint(W + 2, H + 2, (g) => { g.save(); g.translate(1, 1); draw(g, true); g.restore(); });
  if (o.flip) {
    const f = (c: HTMLCanvasElement) => paint(c.width, c.height, (g) => { g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); });
    return { canvas: f(out), emissive: f(em) };
  }
  return { canvas: out, emissive: em };
}

export function vendingSprite(): { canvas: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const W = 32, H = 48;
  const prod = ['#e04545', '#ffd34d', '#3fbf6a', '#3f7fd6', '#d86aa8', '#ff8a2a', '#8fd0ff', '#f2f0e6'];
  const draw = (g: Ctx, em: boolean) => {
    if (!em) {
      R(g, 1, 0, 30, 5, '#e0685c'); R(g, 1, 0, 30, 1, '#f2958a');
      R(g, 0, 5, 32, 39, '#b83a32'); R(g, 0, 5, 1, 39, '#d8574d'); R(g, 28, 5, 4, 39, '#8f2b26');
      // header
      R(g, 3, 7, 26, 6, '#fff3c4'); for (let i = 0; i < 6; i++) R(g, 5 + i * 4, 9, 3, 2, i % 2 ? '#b83a32' : '#2f5fa8');
      // glass
      R(g, 3, 15, 21, 24, '#2a0e0c');
      R(g, 4, 16, 19, 22, '#bfe3ee');
      for (const sy of [24, 31]) R(g, 4, sy, 19, 1, '#6a8a96');
      const rng = new Rng(77);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const col = prod[rng.int(0, prod.length - 1)]; const x = 6 + c * 4.6 | 0, y = 17 + r * 7; R(g, x, y, 3, 5, col); R(g, x, y, 3, 1, shade(col, 0.4)); R(g, x + 2, y + 1, 1, 4, shade(col, -0.3)); }
      // right panel
      R(g, 25, 15, 6, 24, '#8f2b26'); R(g, 26, 17, 4, 2, '#1a1010'); R(g, 26, 17, 4, 1, '#3a2020');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) R(g, 26 + c * 2, 21 + r * 3, 1, 2, r === 3 ? '#3fbf6a' : '#e0dccf');
      R(g, 27, 34, 2, 2, '#ffd34d');
      // flap
      R(g, 5, 41, 17, 4, '#2a1514'); R(g, 5, 41, 17, 1, '#4a2a28');
      R(g, 2, 44, 5, 3, '#1e1e24'); R(g, 25, 44, 5, 3, '#1e1e24');
    } else {
      R(g, 4, 16, 19, 22, 'rgba(232,251,255,0.55)');
      R(g, 3, 7, 26, 6, 'rgba(255,243,196,0.7)');
      R(g, 27, 34, 2, 2, '#fff3a0');
    }
  };
  return { canvas: withOutline(paint(W, H, (g) => draw(g, false)), '#0d0e14'), emissive: paint(W + 2, H + 2, (g) => { g.save(); g.translate(1, 1); draw(g, true); g.restore(); }) };
}

export function noticeboardSprite(): HTMLCanvasElement {
  const W = 60, H = 56;
  return withOutline(paint(W, H, (g) => {
    R(g, 5, 32, 4, 24, '#5a3c22'); R(g, 5, 32, 1, 24, '#7a5230'); R(g, 51, 32, 4, 24, '#5a3c22'); R(g, 51, 32, 1, 24, '#7a5230');
    R(g, 2, 50, 10, 3, '#2a2c34'); R(g, 48, 50, 10, 3, '#2a2c34');
    // roof
    R(g, 0, 0, 60, 7, '#3d4c6e'); R(g, 0, 0, 60, 2, '#5a6c94'); R(g, 0, 6, 60, 1, '#232c42');
    // sign strip
    R(g, 3, 7, 54, 8, '#fff3c4'); for (let i = 0; i < 9; i++) R(g, 4 + i * 6, 7, 3, 1, '#b83a32');
    drawText(g, 'ALL STAFF', 30, 8, { color: '#232c42', align: 'center', shadow: null });
    // frame + cork
    R(g, 2, 15, 56, 32, '#7a5230'); R(g, 2, 15, 56, 1, '#a07040'); R(g, 2, 46, 56, 1, '#4a3018');
    R(g, 4, 17, 52, 28, '#b98a58');
    const rng = new Rng(311);
    for (let i = 0; i < 90; i++) R(g, 4 + rng.int(0, 51), 17 + rng.int(0, 27), 1, 1, rng.chance(0.5) ? '#9a6e40' : '#c89c68');
    const papers: [number, number, number, number, string][] = [[6, 19, 11, 14, '#f6f2e6'], [19, 18, 9, 10, '#ffe27a'], [30, 19, 12, 15, '#f6f2e6'], [44, 18, 10, 11, '#ffb8c8'], [8, 35, 12, 8, '#cfe8ff'], [22, 31, 10, 11, '#f6f2e6'], [35, 36, 9, 8, '#ffe27a'], [46, 32, 8, 12, '#f6f2e6']];
    for (const [x, y, w, h, c] of papers) {
      R(g, x + 1, y + 1, w, h, 'rgba(0,0,0,0.25)'); R(g, x, y, w, h, c);
      for (let ly = y + 3; ly < y + h - 1; ly += 2) R(g, x + 1, ly, w - 3 - (ly % 3), 1, '#9aa0ae');
      R(g, x + (w >> 1), y, 1, 2, '#d03a32');
    }
    R(g, 31, 20, 10, 4, '#d03a32'); drawText(g, 'HR', 36, 20, { color: '#fff', align: 'center', shadow: null });
  }), '#0d0e14');
}

export function lampSprite(): { canvas: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const W = 18, H = 64;
  const draw = (g: Ctx, em: boolean) => {
    if (!em) {
      R(g, 4, 59, 8, 4, '#2a2c34'); R(g, 5, 58, 6, 1, '#4a4e5c');
      R(g, 7, 10, 3, 49, '#3b404c'); R(g, 7, 10, 1, 49, '#5a6070');
      R(g, 7, 7, 10, 3, '#3b404c'); R(g, 7, 7, 10, 1, '#5a6070');
      R(g, 12, 9, 6, 3, '#555a68');
    } else { R(g, 12, 11, 6, 2, '#fff1b0'); R(g, 13, 13, 4, 1, '#ffd070'); }
  };
  return { canvas: withOutline(paint(W, H, (g) => draw(g, false)), '#0d0e14'), emissive: paint(W + 2, H + 2, (g) => { g.save(); g.translate(1, 1); draw(g, true); g.restore(); }) };
}

function smallProp(kind: 'bin' | 'cone' | 'trolley' | 'bollard' | 'sign' | 'barrier', pal: Pal): HTMLCanvasElement {
  switch (kind) {
    case 'bin': return withOutline(paint(12, 16, (g) => { R(g, 1, 3, 10, 12, '#4a5a4a'); R(g, 1, 3, 2, 12, '#62766a'); R(g, 9, 3, 2, 12, '#34423a'); R(g, 0, 1, 12, 3, '#3a463c'); R(g, 0, 1, 12, 1, '#7a8a7a'); for (let y = 6; y < 14; y += 3) R(g, 3, y, 6, 1, '#34423a'); }), '#0d0e14');
    case 'cone': return withOutline(paint(8, 10, (g) => { R(g, 0, 8, 8, 2, '#2a2c34'); R(g, 1, 5, 6, 3, '#ff7a2a'); R(g, 2, 2, 4, 3, '#ff7a2a'); R(g, 3, 0, 2, 2, '#ff7a2a'); R(g, 1, 5, 6, 1, '#f2f0e6'); R(g, 2, 3, 4, 1, '#f2f0e6'); }), '#0d0e14');
    case 'trolley': return withOutline(paint(20, 16, (g) => { R(g, 2, 3, 16, 8, '#8a909c'); for (let x = 3; x < 17; x += 3) R(g, x, 3, 1, 8, '#4a4e5c'); for (let y = 5; y < 11; y += 3) R(g, 2, y, 16, 1, '#4a4e5c'); R(g, 0, 1, 4, 2, '#555a68'); R(g, 3, 11, 2, 3, '#2a2c34'); R(g, 15, 11, 2, 3, '#2a2c34'); R(g, 4, 13, 2, 2, '#14161c'); R(g, 14, 13, 2, 2, '#14161c'); }), '#0d0e14');
    case 'bollard': return withOutline(paint(6, 14, (g) => { R(g, 0, 0, 6, 12, '#d8d4c4'); R(g, 0, 3, 6, 2, '#2a2c34'); R(g, 0, 7, 6, 2, '#2a2c34'); R(g, 1, 0, 2, 12, '#f2f0e6'); R(g, 4, 0, 2, 12, '#a8a494'); }), '#0d0e14');
    case 'sign': return withOutline(paint(26, 30, (g) => { R(g, 12, 12, 3, 18, '#555a68'); R(g, 0, 0, 26, 13, '#1d3d6a'); R(g, 1, 1, 24, 11, '#2f5fa8'); drawText(g, 'CEO', 13, 1, { color: '#fff3c4', align: 'center', shadow: null }); drawText(g, 'ONLY', 13, 6, { color: '#fff', align: 'center', shadow: null }); void pal; }), '#0d0e14');
    case 'barrier': return withOutline(paint(46, 22, (g) => { R(g, 0, 8, 7, 14, '#c8a63a'); R(g, 0, 8, 7, 2, '#e8c860'); R(g, 7, 10, 38, 4, '#f2f0e6'); for (let x = 9; x < 44; x += 8) R(g, x, 10, 4, 4, '#d03a32'); }), '#0d0e14');
  }
}

// ---------------------------------------------------------------------------
// Background layers
function paintSky(g: Ctx, pal: Pal, W: number, y1: number): void {
  const bands = pal.sky;
  const bh = Math.ceil(y1 / bands.length);
  bands.forEach((c, i) => { R(g, 0, i * bh, W, bh + 1, c); });
  for (let i = 1; i < bands.length; i++) dither(g, 0, i * bh - 2, W, 4, bands[i - 1], bands[i], 0);
}

function buildBg(W: number, H: number, ox: number, oy: number, mood: Mood, rng: Rng): { bg: HTMLCanvasElement; emissive: HTMLCanvasElement; windows: { x: number; y: number }[] } {
  const pal = PAL[mood];
  const bg = makeCanvas(W, H), g = ctx2d(bg);
  const em = makeCanvas(W, H), e = ctx2d(em);
  const wins: { x: number; y: number }[] = [];
  // ---- ground (everything), then facade over the top
  R(g, 0, 0, W, H, pal.asphalt);
  for (let i = 0; i < W * H / 14; i++) { const x = rng.int(0, W - 1), y = rng.int(0, H - 1); R(g, x, y, 1, 1, rng.chance(0.55) ? pal.asphaltA : pal.asphaltB); }
  for (let i = 0; i < 60; i++) { const x = rng.int(0, W - 20), y = rng.int(oy + 140, oy + 300); R(g, x, y, rng.int(3, 14), 1, pal.asphaltB); }
  // tarmac patches
  for (const [px, py, pw, ph] of [[ox + 90, oy + 180, 60, 22], [ox + 400, oy + 230, 50, 28], [ox + 220, oy + 140, 40, 14]]) { R(g, px, py, pw, ph, shade(pal.asphalt, -0.07)); dither(g, px, py, pw, 1, pal.asphalt, shade(pal.asphalt, -0.07)); }
  // oil stains
  for (const [cx, cy, rx, ry] of [[ox + 260, oy + 232, 14, 5], [ox + 410, oy + 198, 9, 3], [ox + 120, oy + 250, 11, 4]]) ellipse(g, cx, cy, rx, ry, shade(pal.asphaltB, -0.25));
  // ---- sky + facade (stage y 0..104), extended above and to the sides
  const fy = oy + 104;
  paintSky(g, pal, W, fy);
  R(g, 0, 0, W, fy, pal.wall);
  const topSky = oy + 8;
  paintSky(g, pal, W, topSky + 2); // a sliver of sky above the roofline if the viewport is taller
  R(g, 0, topSky, W, 4, pal.wallHi); R(g, 0, topSky + 4, W, 2, pal.wallLo);
  // panel seams
  for (let x = -ox % 40; x < W; x += 40) R(g, x, topSky + 6, 1, fy - topSky - 6, pal.wallLo);
  // upper floors windows
  const rows = [oy + 14, oy + 34];
  for (const wy of rows) for (let x = 4 - (ox % 26); x < W - 8; x += 26) {
    if (x > ox + 8 && x < ox + 222 && wy > oy + 30) continue; // sign band
    R(g, x - 1, wy - 1, 20, 17, pal.wallLo); R(g, x, wy, 18, 15, pal.glass);
    R(g, x + 8, wy, 1, 15, pal.wallLo);
    R(g, x, wy + 7, 18, 1, pal.wallLo);
    const roll = rng.next();
    if (roll < (mood === 'dawn' ? 0.12 : 0.3)) wins.push({ x, y: wy });
    else if (roll < (mood === 'dawn' ? 0.2 : 0.46)) { R(e, x, wy, 18, 15, mixHex(pal.lanyard, pal.glass, 0.55)); R(e, x + 8, wy, 1, 15, shade(pal.glass, 0.1)); R(e, x, wy + 7, 18, 1, shade(pal.glass, 0.1)); R(e, x + 2, wy + 2, 4, 2, pal.lanyard); }
    R(g, x - 2, wy + 16, 22, 2, pal.wallHi);
  }
  for (const w of wins) { R(e, w.x, w.y, 18, 15, pal.litWin); R(e, w.x + 8, w.y, 1, 15, '#8a6a30'); R(e, w.x, w.y + 7, 18, 1, '#8a6a30'); R(e, w.x + 2, w.y + 9, 5, 4, '#b8864a'); R(e, w.x + 11, w.y + 4, 4, 9, '#8a5a30'); }
  // sign band: COMPANY POLICY
  const sx = ox + 14, sy = oy + 50, sw = 206, sh = 24;
  R(g, sx - 2, sy - 2, sw + 4, sh + 4, '#10131c'); R(g, sx, sy, sw, sh, '#1d2740');
  drawText(g, 'COMPANY POLICY', sx + sw / 2, sy + 3, { align: 'center', scale: 2, color: '#e8e6f0', shadow: null });
  drawText(g, 'ONE FAMILY. ONE CULTURE.', sx + sw / 2, sy + 18, { align: 'center', color: '#7ff0d8', shadow: null });
  // emissive sign
  R(e, sx, sy, sw, sh, 'rgba(60,90,160,0.35)');
  drawText(e, 'COMPANY POLICY', sx + sw / 2, sy + 3, { align: 'center', scale: 2, color: '#fff6d8', shadow: null });
  drawText(e, 'ONE FAMILY. ONE CULTURE.', sx + sw / 2, sy + 18, { align: 'center', color: '#9ff5e0', shadow: null });
  // ground floor: lobby glazing
  const gy = oy + 78;
  R(g, 0, gy - 2, W, 3, pal.wallHi);
  R(g, 0, gy + 1, W, fy - gy - 1, pal.wallLo);
  for (let x = 2 - (ox % 34); x < W; x += 34) { R(g, x, gy + 3, 31, fy - gy - 6, '#0e1a1f'); R(g, x, gy + 3, 31, 1, '#1d3338'); R(g, x + 15, gy + 3, 1, fy - gy - 6, pal.wallLo); R(e, x + 2, gy + 5, 27, fy - gy - 10, mood === 'dawn' ? 'rgba(255,226,168,0.25)' : 'rgba(255,217,138,0.16)'); }
  // entrance
  const ex = ox + 440;
  R(g, ex - 3, gy - 6, 78, fy - gy + 6, '#10131c');
  R(g, ex, gy, 72, fy - gy, '#1a2c34');
  R(g, ex, gy, 72, 1, '#3a5a66');
  for (let i = 0; i < 4; i++) { const dx = ex + 3 + i * 17; R(g, dx, gy + 3, 15, fy - gy - 3, '#102228'); R(g, dx, gy + 3, 15, 1, '#3a5a66'); R(g, dx + 6, gy + 14, 1, 7, '#d4a537'); R(e, dx + 1, gy + 4, 13, fy - gy - 5, 'rgba(255,230,160,0.34)'); }
  // canopy
  R(g, ex - 8, gy - 12, 88, 6, '#2d3750'); R(g, ex - 8, gy - 12, 88, 2, '#4a5a7c'); R(g, ex - 8, gy - 7, 88, 1, '#10131c');
  for (let i = 0; i < 11; i++) R(g, ex - 8 + i * 8 + 1, gy - 10, 4, 3, i % 2 ? '#b83a32' : '#e8e6f0');
  R(g, ex - 10, gy - 30, 92, 10, '#1d2740'); R(g, ex - 9, gy - 29, 90, 8, '#232c42');
  drawText(g, 'STAFF ENTRANCE', ex + 36, gy - 28, { align: 'center', color: '#e8e6f0', shadow: null });
  drawText(e, 'STAFF ENTRANCE', ex + 36, gy - 28, { align: 'center', color: '#fff6d8', shadow: null });
  // ---- pavement + kerb
  const py = fy, pyEnd = oy + 124;
  R(g, 0, py, W, pyEnd - py, pal.slab);
  for (let y = py; y < pyEnd; y += 9) R(g, 0, y, W, 1, pal.slabLo);
  for (let row = 0, y = py; y < pyEnd; y += 9, row++) for (let x = (row % 2) * 12 - (ox % 24); x < W; x += 24) R(g, x, y, 1, 9, pal.slabLo);
  for (let i = 0; i < 160; i++) R(g, rng.int(0, W - 1), rng.int(py, pyEnd - 1), 1, 1, rng.chance(0.5) ? pal.kerbHi : pal.slabLo);
  R(g, 0, pyEnd, W, 2, pal.kerbHi); R(g, 0, pyEnd + 2, W, 2, pal.kerb); R(g, 0, pyEnd + 4, W, 2, shade(pal.asphalt, -0.3));
  // pavement shadow under facade
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, py, W, 3);
  // ---- bay markings (top row, bottom row)
  const bay = (x: number, y0: number, y1: number, col = pal.paint) => { R(g, x, y0, 2, y1 - y0, col); for (let i = 0; i < 5; i++) R(g, x + rng.int(0, 1), y0 + rng.int(0, y1 - y0 - 1), 1, 1, pal.asphalt); };
  for (let x = ox + 20; x < ox + 620; x += 60) { if ((x - ox - 20) / 60 === 6) continue; bay(x, oy + 130, oy + 168); }
  R(g, ox + 20, oy + 168, 540, 2, pal.paint);
  for (let x = ox + 20; x < ox + 620; x += 60) bay(x, oy + 304, oy + 348);
  R(g, ox + 20, oy + 304, 600, 2, pal.paint);
  // yellow hatching by the entrance
  for (let i = 0; i < 18; i++) { const x = ox + 430 + i * 5; line(g, x, oy + 148, x - 10, oy + 168, '#c8a63a'); }
  R(g, ox + 428, oy + 130, 2, 38, '#c8a63a'); R(g, ox + 518, oy + 130, 2, 38, '#c8a63a');
  // arrows + painted text
  const arrow = (x: number, y: number, dir: 1 | -1) => { R(g, x, y, 22 * dir > 0 ? 22 : 22, 3, pal.paint); const tip = dir > 0 ? x + 22 : x; for (let i = 0; i < 6; i++) R(g, tip - (dir > 0 ? i : -i) - (dir > 0 ? 0 : 0), y - 5 + i, 1, 13 - i * 2 > 0 ? 13 - i * 2 : 1, pal.paint); };
  arrow(ox + 130, oy + 286, 1); arrow(ox + 470, oy + 286, -1);
  drawText(g, 'STAFF PARKING ONLY', ox + 320, oy + 140, { align: 'center', color: shade(pal.paint, -0.2), shadow: null });
  drawText(g, 'CLAMPING IN OPERATION', ox + 150, oy + 288, { color: shade(pal.paint, -0.25), shadow: null });
  for (let i = 0; i < 10; i++) drawText(g, 'A' + (i + 1), ox + 32 + i * 60, oy + 322, { color: shade(pal.paint, -0.3), shadow: null });
  // manhole
  ellipse(g, ox + 392, oy + 206, 9, 4, shade(pal.asphalt, -0.3)); ellipse(g, ox + 392, oy + 205, 8, 3, '#3a3e48'); for (let i = -6; i <= 6; i += 3) R(g, ox + 392 + i, oy + 204, 1, 3, '#2a2c34');
  // ---- bottom: hedge, fence, road
  const hy = oy + 350;
  R(g, 0, hy - 10, W, H - hy + 10, pal.hedge);
  dither(g, 0, hy - 10, W, 6, shade(pal.hedge, 0.12), pal.hedge, 1);
  for (let x = 0; x < W; x += 5) R(g, x, hy - 12 + ((x * 7) % 3), 4, 3, shade(pal.hedge, 0.08));
  R(g, 0, hy + 6, W, H - hy - 6, '#1a1c22'); // road
  for (let x = 6; x < W; x += 36) R(g, x, hy + 18, 18, 2, '#9a9582');
  // chain-link fence
  for (let x = 0; x < W; x += 3) { R(g, x, hy - 22 + ((x / 3) % 2) * 1, 1, 14, 'rgba(150,160,175,0.45)'); }
  for (let y = hy - 22; y < hy - 8; y += 4) R(g, 0, y, W, 1, 'rgba(150,160,175,0.35)');
  for (let x = 0; x < W; x += 52) { R(g, x, hy - 26, 3, 24, '#4a4e5c'); R(g, x, hy - 26, 1, 24, '#7a8092'); }
  R(g, 0, hy - 27, W, 2, '#4a4e5c');
  // distant town lights
  for (let i = 0; i < 40; i++) R(g, rng.int(0, W - 1), hy + 8 + rng.int(0, 2), 1, 1, mood === 'dawn' ? '#ffe2a8' : rng.chance(0.5) ? '#ffd98a' : '#8fc8ff');
  // parked cars in the bottom row (decor only: out of the walkable area)
  const cols = ['#3b5a8a', '#8a3a3a', '#5a6a58', '#6a6a78', '#7a5a3a', '#4a4a5a', '#3a6a6a', '#8a7a3a'];
  for (let i = 0, x = ox + 6; x < W - 40; x += 120, i++) {
    if (i === 3) continue;
    const c = carSprite({ body: cols[(i + (mood === 'dawn' ? 3 : 0)) % cols.length], flip: i % 2 === 0, lights: false });
    g.drawImage(c.canvas, x, oy + 308);
  }
  return { bg, emissive: em, windows: wins };
}

// ---------------------------------------------------------------------------
function ringsDarkLayer(W: number, H: number, pal: Pal, lamps: Lamp[]): { dark: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const dark = makeCanvas(W, H), d = ctx2d(dark);
  d.fillStyle = pal.dark; d.globalAlpha = pal.darkA; d.fillRect(0, 0, W, H); d.globalAlpha = 1;
  const glow = makeCanvas(W, H), gl = ctx2d(glow);
  d.globalCompositeOperation = 'destination-out';
  gl.globalCompositeOperation = 'lighter';
  const steps = 6;
  for (const l of lamps) {
    for (let i = 0; i < steps; i++) {
      const k = 1 - i / steps;
      const a = (1 / steps) * l.strength * 0.95;
      d.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      ellipse(d, l.x, l.y, l.rx * k, l.ry * k, d.fillStyle);
      gl.fillStyle = pal.lampLight + (0.045 * l.strength).toFixed(3) + ')';
      ellipse(gl, l.x, l.y, l.rx * k * 0.9, l.ry * k * 0.9, gl.fillStyle);
    }
  }
  d.globalCompositeOperation = 'source-over';
  return { dark, glow };
}

function makePlayerLight(): HTMLCanvasElement {
  const r = 46, w = r * 2 + 2, h = Math.round(r * 1.5);
  return paint(w, h, (g) => {
    for (let i = 0; i < 5; i++) { const k = 1 - i / 5; ellipse(g, w / 2, h / 2, r * k, r * 0.7 * k, `rgba(0,0,0,${(0.17).toFixed(2)})`); }
  });
}

/** Render the dynamic "daily board" screen on the wall (today's seed, modifiers and the local top score). */
export function paintDailyScreen(c: HTMLCanvasElement, o: { date: string; code: string; mods: string[]; scored: boolean; top: { score: number; floor: number }[]; assist: boolean }): void {
  const g = ctx2d(c);
  g.clearRect(0, 0, c.width, c.height);
  const w = c.width, h = c.height;
  R(g, 0, 0, w, h, '#0a1418'); R(g, 1, 1, w - 2, h - 2, '#16363c'); R(g, 3, 3, w - 6, h - 6, '#0c1e24');
  for (let y = 4; y < h - 4; y += 2) R(g, 3, y, w - 6, 1, 'rgba(0,0,0,0.25)');
  drawText(g, 'DAILY RUN', 8, 6, { color: '#7ff0d8', shadow: null });
  drawText(g, o.date, w - 8, 6, { color: '#9fe0b4', align: 'right', shadow: null });
  drawText(g, 'SEED ' + o.code, 8, 16, { color: '#ffd34d', shadow: null });
  R(g, 6, 26, w - 12, 1, '#1f5a60');
  const fit = (t: string, max: number) => { while (measure(t) > max && t.includes(', ')) t = t.slice(0, t.lastIndexOf(', ')); while (measure(t) > max && t.length > 4) t = t.slice(0, -1); return t; };
  drawText(g, fit(o.mods.length ? o.mods.join(', ') : 'No modifiers', w - 16), 8, 30, { color: '#9fe0b4', shadow: null });
  if (o.top.length) drawText(g, `BEST ${o.top[0].score.toLocaleString('en-GB')}  FLOOR ${o.top[0].floor}`, 8, 40, { color: '#fff6d8', shadow: null });
  drawText(g, o.assist ? 'ASSIST ON: PRACTICE ONLY' : o.scored ? 'SCORED ATTEMPT READY' : 'ATTEMPT USED: PRACTICE', 8, o.top.length ? 50 : 42, { color: o.scored && !o.assist ? '#7fff9c' : '#ffb04d', shadow: null });
}

// ---------------------------------------------------------------------------
export interface BuildOpts { W: number; H: number; mood: Mood; trophies: number; decor: string[]; role: string }

export function buildCarPark(o: BuildOpts): CarPark {
  const { W, H, mood } = o;
  const pal = PAL[mood];
  const ox = Math.max(0, Math.floor((W - SW) / 2)), oy = Math.max(0, Math.floor((H - SH) / 2));
  const rng = stageRng();
  const { bg, emissive } = buildBg(W, H, ox, oy, mood, rng);

  const props: Prop[] = [];
  const solids: Rect[] = [];
  const addProp = (p: Prop) => { props.push(p); if (p.solid) solids.push(p.solid); };
  const X = (x: number) => ox + x, Y = (y: number) => oy + y;

  // vending machine
  const vm = vendingSprite();
  addProp({ id: 'vending', canvas: vm.canvas, emissive: vm.emissive, x: X(96), y: Y(124), ox: 17, oy: 49, solid: { x: X(80), y: Y(116), w: 32, h: 9 }, shadow: { rx: 17, ry: 4 }, station: 'vending' });
  // noticeboard
  const nb = noticeboardSprite();
  addProp({ id: 'noticeboard', canvas: nb, x: X(560), y: Y(134), ox: 31, oy: 57, solid: { x: X(534), y: Y(128), w: 52, h: 7 }, shadow: { rx: 28, ry: 4 }, station: 'noticeboard' });
  // daily screen on the lobby wall
  const dailyScreen = makeCanvas(172, 60);
  addProp({ id: 'daily', canvas: dailyScreen, emissive: dailyScreen, emOff: 0, x: X(318), y: Y(110), ox: 86, oy: 60, solid: { x: X(232), y: Y(106), w: 172, h: 8 }, station: 'daily' });
  // the player's car
  const car = carSprite({ body: '#9bb0d2', roof: '#b0c2e0', boot: true, lights: mood !== 'dawn', decor: o.decor, trophies: o.trophies, plate: o.decor.includes('decor_number_plate') ? 'HR 0K' : undefined });
  addProp({ id: 'car', canvas: car.canvas, emissive: car.emissive, x: X(302), y: Y(232), ox: 49, oy: 43, solid: { x: X(256), y: Y(206), w: 92, h: 24 }, shadow: { rx: 46, ry: 6 }, station: undefined });
  // other cars (solid, depth-sorted)
  const c1 = carSprite({ body: '#3b5a8a', flip: false }), c2 = carSprite({ body: '#8a3a3a', flip: true });
  addProp({ id: 'car2', canvas: c1.canvas, x: X(120), y: Y(278), ox: 49, oy: 43, solid: { x: X(74), y: Y(252), w: 92, h: 24 }, shadow: { rx: 46, ry: 6 } });
  addProp({ id: 'car3', canvas: c2.canvas, x: X(520), y: Y(274), ox: 49, oy: 43, solid: { x: X(474), y: Y(248), w: 92, h: 24 }, shadow: { rx: 46, ry: 6 } });
  // lamp posts
  const lp = lampSprite();
  const lampPos: [number, number][] = [[176, 154], [458, 158], [214, 296], [596, 288], [24, 176]];
  for (const [lx, ly] of lampPos) addProp({ id: 'lamp' + lx, canvas: lp.canvas, emissive: lp.emissive, x: X(lx), y: Y(ly), ox: 9, oy: 65, solid: { x: X(lx - 4), y: Y(ly - 3), w: 8, h: 4 }, shadow: { rx: 5, ry: 2 } });
  // small props
  addProp({ id: 'bin', canvas: smallProp('bin', pal), x: X(40), y: Y(124), ox: 7, oy: 17, solid: { x: X(34), y: Y(119), w: 12, h: 6 }, shadow: { rx: 7, ry: 2 } });
  addProp({ id: 'bin2', canvas: smallProp('bin', pal), x: X(612), y: Y(124), ox: 7, oy: 17, solid: { x: X(606), y: Y(119), w: 12, h: 6 }, shadow: { rx: 7, ry: 2 } });
  addProp({ id: 'cone1', canvas: smallProp('cone', pal), x: X(372), y: Y(262), ox: 5, oy: 11, shadow: { rx: 4, ry: 1 } });
  addProp({ id: 'cone2', canvas: smallProp('cone', pal), x: X(382), y: Y(268), ox: 5, oy: 11, shadow: { rx: 4, ry: 1 } });
  addProp({ id: 'trolley', canvas: smallProp('trolley', pal), x: X(598), y: Y(236), ox: 11, oy: 17, solid: { x: X(588), y: Y(230), w: 20, h: 7 }, shadow: { rx: 10, ry: 2 } });
  addProp({ id: 'bol1', canvas: smallProp('bollard', pal), x: X(424), y: Y(128), ox: 4, oy: 15, solid: { x: X(421), y: Y(124), w: 6, h: 4 } });
  addProp({ id: 'bol2', canvas: smallProp('bollard', pal), x: X(522), y: Y(128), ox: 4, oy: 15, solid: { x: X(519), y: Y(124), w: 6, h: 4 } });
  addProp({ id: 'sign', canvas: smallProp('sign', pal), x: X(70), y: Y(214), ox: 14, oy: 31, solid: { x: X(67), y: Y(210), w: 6, h: 4 }, shadow: { rx: 4, ry: 1 } });
  addProp({ id: 'barrier', canvas: smallProp('barrier', pal), x: X(22), y: Y(262), ox: 4, oy: 23, solid: { x: X(10), y: Y(256), w: 44, h: 6 } });

  // stations (interaction points around the car)
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x: X(x), y: Y(y), w, h });
  const stations: StationDef[] = [
    { id: 'vending', name: 'Vending Machine', short: 'Vending', icon: 'vending', x: X(96), y: Y(138), r: 22, box: box(80, 80, 34, 46), hint: 'Spend Annual Leave on unlocks' },
    { id: 'daily', name: 'Daily Run Board', short: 'Daily', icon: 'daily', x: X(318), y: Y(124), r: 24, box: box(232, 50, 172, 60), hint: "Today's published seed and board", markerDy: -2 },
    { id: 'noticeboard', name: 'Internal Announcements', short: 'Notices', icon: 'noticeboard', x: X(560), y: Y(146), r: 22, box: box(530, 78, 60, 58), hint: 'The promoted-staff roster' },
    { id: 'carboot', name: 'Car Boot', short: 'Boot', icon: 'boot', x: X(240), y: Y(226), r: 17, box: box(252, 188, 36, 44), hint: 'Choose your role and loadout', labelY: Y(160) },
    { id: 'radio', name: 'Car Radio', short: 'Radio', icon: 'radio', x: X(300), y: Y(196), r: 15, box: box(290, 190, 30, 20), hint: 'Soundtrack and DJ', labelY: Y(160) },
    { id: 'dashboard', name: 'Dashboard', short: 'Dash', icon: 'dashboard', x: X(362), y: Y(224), r: 17, box: box(318, 190, 36, 42), hint: 'Trophies and statistics', labelY: Y(160) },
    { id: 'clockin', name: 'Clock In', short: 'Clock In', icon: 'car', x: X(300), y: Y(250), r: 17, box: box(262, 214, 78, 28), hint: 'Start your shift', labelY: Y(160) },
  ];

  const lamps: Lamp[] = [];
  if (mood !== 'dawn') {
    for (const [lx, ly] of lampPos) lamps.push({ x: X(lx + 6), y: Y(ly + 2), rx: 98, ry: 56, strength: 1, flicker: lx === 458 });
    lamps.push({ x: X(476), y: Y(116), rx: 80, ry: 30, strength: 0.9 });   // entrance
    lamps.push({ x: X(318), y: Y(120), rx: 96, ry: 26, strength: 0.7 });   // daily board
    lamps.push({ x: X(96), y: Y(130), rx: 46, ry: 22, strength: 0.85 });   // vending glass
    lamps.push({ x: X(302), y: Y(226), rx: 92, ry: 34, strength: 1 }); // car interior / headlights
  } else {
    lamps.push({ x: X(476), y: Y(116), rx: 70, ry: 26, strength: 0.5 });
  }
  const { dark, glow } = ringsDarkLayer(W, H, pal, lamps);

  return {
    W, H, ox, oy, mood, bg, emissive, dark, glow, props, stations, lamps, solids,
    walk: { x: X(14), y: Y(114), w: SW - 28, h: 190 },
    spawn: { x: X(300), y: Y(262) },
    playerLight: makePlayerLight(), dailyScreen,
    rainArea: { x: 0, y: 0, w: W, h: H },
  };
}
