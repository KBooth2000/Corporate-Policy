// Boss figure renderer (spec 9.1: bosses up to 96×96, 1px dark outline, hue-shifted top-left lighting).
// A 2D parametric humanoid drawn into the character artist's PixBuf raster (src/art/chars/pixbuf.ts) with the
// same ramps (src/art/chars/colours.ts), so bosses share the cast's palette logic and outline — just at ~2.2×
// the size, with hand-tuned proportions, faces and per-boss costume hooks.
import { PixBuf, Col, C, mixCol } from '../chars/pixbuf';
import { ramp, skinRamp, EYE, TEETH, MOUTH, WHITE } from '../chars/colours';
import type { Ramp } from '../chars/types';

export type View = 'front' | 'side' | 'back';
export type Expr = 'neutral' | 'angry' | 'shout' | 'pain' | 'dazed' | 'smug' | 'talk' | 'grin' | 'shock' | 'dead' | 'blink' | 'focus';
export type P = [number, number];

export interface HeadBox { x: number; y: number; w: number; h: number; view: View }

export interface FaceSpec {
  eyeGap: number;           // px between eyes (front)
  brow: Ramp;               // brow colour
  browT: 1 | 2;             // brow thickness
  lashes?: boolean;
  liner?: boolean;          // eyeliner wings
  moustache?: Ramp | null;
  stubble?: boolean;
  beard?: Ramp | null;
  glasses?: 'none' | 'half' | 'square';
  glassesCol?: Ramp;
  blush?: boolean;
  lip?: Col | null;         // lipstick colour
  wrinkles?: boolean;
  jaw?: 'round' | 'square' | 'chiselled' | 'soft';
  ears?: boolean;
  tan?: boolean;
  bigTeeth?: boolean;       // CEO veneers
}

export interface FigSpec {
  legLen: number; torsoH: number; shoulderW: number; waistW: number; hipW: number; belly: number;
  armT: number; legT: number; upperArm: number; foreArm: number; headW: number; headH: number; neck: number;
  skin: Ramp; top: Ramp; sleeve: Ramp; under: Ramp; tie: Ramp | null; legs: Ramp; shoes: Ramp; hair: Ramp;
  gloves?: Ramp | null;
  skirt?: boolean; heels?: boolean;
  /** Skirt fabric (defaults to the legs ramp). */
  skirtCol?: Ramp;
  /** Jacket open at the front (lapels showing the shirt). */
  lapels?: boolean;
  face: FaceSpec;
  hair_(b: PixBuf, hb: HeadBox, layer: 'back' | 'front', f: FigCtx): void;
  torsoDetail?(b: PixBuf, sk: Skel, f: FigCtx): void;
  headDetail?(b: PixBuf, hb: HeadBox, f: FigCtx): void;
  legDetail?(b: PixBuf, sk: Skel, f: FigCtx): void;
  over?(b: PixBuf, sk: Skel, f: FigCtx): void;
}

/** Held item drawer: (b, hand point, angle, view, frame ctx). */
export type ItemDraw = (b: PixBuf, x: number, y: number, angle: number, f: FigCtx) => void;
export const ITEMS: Record<string, ItemDraw> = {};

export interface FigPose {
  crouch: number;              // hip drop (px)
  lean: number;                // shoulder x offset vs hips (+ forward in side view)
  bend: number;                // torso shortening (bow)
  legs: [P, P];                // foot offsets from hip joints: [dx (+forward/outward), lift]
  arms: [P, P];                // hand offsets from shoulder joints: [dx (+forward/outward), dy (+down)]
  head: P;
  expr: Expr;
  item?: { kind: string; angle: number };
  item2?: { kind: string; angle: number };
  /** Draw arm 0 (item arm) behind the body (side view wind-ups). */
  arm0Behind?: boolean;
  arm1Front?: boolean;
  /** Extra free-form flags for costume hooks. */
  tag?: string;
  /** 0..1 generic animation phase for hooks. */
  ph?: number;
  /** Legs hidden (seated in a vehicle). */
  noLegs?: boolean;
}

export interface Skel {
  view: View; ox: number; oy: number;
  hipY: number; shY: number;
  hipC: P; shC: P;
  shJ: [P, P]; el: [P, P]; ha: [P, P];
  hiJ: [P, P]; kn: [P, P]; ft: [P, P];
  head: HeadBox;
  rows: { y: number; l: number; r: number }[];
}

export interface FigCtx { spec: FigSpec; pose: FigPose; view: View; sk: Skel; frame: number }

export const R = Math.round;
export const OUTC = C('#0d0e14');
export { ramp, skinRamp, C, mixCol, EYE, TEETH, MOUTH, WHITE };

// ---------------------------------------------------------------------------------------------
// Raster helpers

/** Scanline polygon fill (integer pixels). */
export function poly(b: PixBuf, pts: P[], col: Col): void {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if ((a[1] <= y + 0.5 && c[1] > y + 0.5) || (c[1] <= y + 0.5 && a[1] > y + 0.5)) {
        xs.push(a[0] + ((y + 0.5 - a[1]) / (c[1] - a[1])) * (c[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = R(xs[k]); x < R(xs[k + 1]); x++) b.set(x, y, col);
  }
}

/** Shaded polygon: fill base then light the top-left edge and shade the bottom-right edge. */
export function shadedPoly(b: PixBuf, pts: P[], r: Ramp): void {
  const tmp = new PixBuf(b.w, b.h);
  tmp.tx = b.tx; tmp.ty = b.ty;
  poly(tmp, pts, r.base);
  edgeShade(tmp, r);
  b.blit(tmp, 0, 0);
}

/** Light top/left edge pixels, shade bottom/right edges of everything in a buffer (in place). */
export function edgeShade(t: PixBuf, r: Ramp): void {
  const W = t.w, H = t.h, d = t.d;
  const src = d.slice();
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[y * W + x] >>> 24 > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const i = y * W + x;
    if (!on(x, y - 1) || !on(x - 1, y)) d[i] = r.lt;
    if (!on(x + 1, y) || !on(x, y + 1)) d[i] = r.sh;
    if (!on(x + 1, y) && !on(x, y + 1)) d[i] = r.dk;
  }
}

/** Thick line in a direction (items): from (x,y) along angle for len px. */
export function rod(b: PixBuf, x: number, y: number, ang: number, len: number, t: number, r: Ramp): P {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  b.limb(x, y, ex, ey, t, r.lt, r.base, r.dk);
  return [ex, ey];
}

/** Rotated rectangle (centre, size, angle) filled with ramp shading. */
export function rotRect(b: PixBuf, cx: number, cy: number, w: number, h: number, ang: number, r: Ramp): P[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts: P[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c] as P);
  shadedPoly(b, pts, r);
  return pts;
}

function ik2(a: P, c: P, l1: number, l2: number, bendSign: number, horizontal: boolean): P {
  const dx = c[0] - a[0], dy = c[1] - a[1];
  const d = Math.max(0.001, Math.hypot(dx, dy));
  if (d >= l1 + l2 - 0.01) return [a[0] + dx * l1 / (l1 + l2), a[1] + dy * l1 / (l1 + l2)];
  const ad = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - ad * ad));
  const ux = dx / d, uy = dy / d;
  // perpendicular
  let px = -uy, py = ux;
  if (horizontal) { if (px * bendSign < 0) { px = -px; py = -py; } } else if (py * bendSign < 0) { px = -px; py = -py; }
  return [a[0] + ux * ad + px * h, a[1] + uy * ad + py * h];
}

// ---------------------------------------------------------------------------------------------
// Skeleton

/** Screen x sign for limb index i in a view (front: the right hand appears on the viewer's left). */
export function sideSign(view: View, i: 0 | 1): number {
  if (view === 'front') return i === 0 ? -1 : 1;
  if (view === 'back') return i === 0 ? 1 : -1;
  return 0;
}

export function skeleton(s: FigSpec, p: FigPose, view: View, ox: number, oy: number): Skel {
  const side = view === 'side';
  const hipY = oy - s.legLen + p.crouch;
  const shY = hipY - s.torsoH + p.bend;
  const hipC: P = [ox, hipY];
  const shC: P = [ox + p.lean, shY];
  const hipHalf = Math.max(1, s.hipW / 2 - s.legT / 2);
  const shHalf = Math.max(2, s.shoulderW / 2 - s.armT / 2 + 0.5);
  const shJ: [P, P] = [[0, 0], [0, 0]], ha: [P, P] = [[0, 0], [0, 0]], el: [P, P] = [[0, 0], [0, 0]];
  const hiJ: [P, P] = [[0, 0], [0, 0]], ft: [P, P] = [[0, 0], [0, 0]], kn: [P, P] = [[0, 0], [0, 0]];
  for (const i of [0, 1] as const) {
    const sg = sideSign(view, i);
    if (side) {
      // near (0) and far (1) shoulders almost overlap in profile
      shJ[i] = [shC[0] + (i === 0 ? 1 : -1), shC[1] + 2];
      hiJ[i] = [hipC[0] + (i === 0 ? 1 : -1), hipY];
      ha[i] = [shJ[i][0] + p.arms[i][0], shJ[i][1] + p.arms[i][1]];
      ft[i] = [hiJ[i][0] + p.legs[i][0], oy - p.legs[i][1]];
      el[i] = ik2(shJ[i], ha[i], s.upperArm, s.foreArm, -1, true);
      kn[i] = ik2(hiJ[i], ft[i], s.legLen / 2 + 0.25, s.legLen / 2 + 0.25, 1, true);
    } else {
      shJ[i] = [shC[0] + sg * shHalf, shC[1] + 2];
      hiJ[i] = [hipC[0] + sg * hipHalf, hipY];
      ha[i] = [shJ[i][0] + sg * p.arms[i][0], shJ[i][1] + p.arms[i][1]];
      ft[i] = [hiJ[i][0] + sg * p.legs[i][0], oy - p.legs[i][1]];
      el[i] = ik2(shJ[i], ha[i], s.upperArm, s.foreArm, sg, true);
      kn[i] = ik2(hiJ[i], ft[i], s.legLen / 2, s.legLen / 2, sg, true);
    }
  }
  // torso rows
  const rows: Skel['rows'] = [];
  const y0 = R(shY), y1 = R(hipY);
  const H = Math.max(1, y1 - y0);
  const k = side ? 0.66 : 1;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / H;
    const cx = shC[0] + (hipC[0] - shC[0]) * t;
    let w = t < 0.55 ? s.shoulderW + (s.waistW - s.shoulderW) * (t / 0.55) : s.waistW + (s.hipW - s.waistW) * ((t - 0.55) / 0.45);
    w *= k;
    const bulge = s.belly * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 0.7)));
    let l: number, r: number;
    if (side) {
      const back = cx - (s.shoulderW * k) / 2 + 1;
      l = R(back); r = R(back + w + bulge * 2);
    } else {
      l = R(cx - w / 2 - bulge); r = R(cx + w / 2 + bulge) - 1;
    }
    if (y === y0) { l += 2; r -= 2; }
    else if (y === y0 + 1) { l += 1; r -= 1; }
    rows.push({ y, l, r });
  }
  const hw = side ? s.headW - 2 : s.headW;
  const hx = R(shC[0] + p.head[0] - hw / 2 + (side ? 1 : 0));
  const hy = R(shY - s.neck - s.headH + p.head[1]);
  return { view, ox, oy, hipY, shY, hipC, shC, shJ, el, ha, hiJ, kn, ft, head: { x: hx, y: hy, w: hw, h: s.headH, view }, rows };
}

// ---------------------------------------------------------------------------------------------
// Body parts

export function farRamp(r: Ramp): Ramp {
  return { hex: r.hex, hi: r.lt, lt: r.base, base: mixCol(r.base, r.sh, 0.55), sh: r.sh, dk: r.dk };
}

function drawLeg(b: PixBuf, sk: Skel, i: 0 | 1, f: FigCtx, far: boolean): void {
  const s = f.spec;
  const L = far ? farRamp(s.legs) : s.legs;
  const Sh = far ? farRamp(s.shoes) : s.shoes;
  const h = sk.hiJ[i], k = sk.kn[i], ft = sk.ft[i];
  const side = sk.view === 'side';
  const t = s.legT;
  b.limb(h[0], h[1], k[0], k[1], t, L.lt, L.base, L.sh);
  b.limb(k[0], k[1], ft[0], ft[1] - 2, Math.max(2, t - 1), L.lt, L.base, L.sh);
  // knee crease
  b.set(R(k[0]), R(k[1]), L.sh);
  // shoe
  const fx = R(ft[0]), fy = R(ft[1]);
  if (side) {
    const len = t + 4;
    for (let y = -3; y <= 0; y++) for (let x = -2; x < len - 2; x++) {
      if (y === -3 && x > len - 6) continue;
      b.set(fx + x, fy + y, y === -3 ? Sh.lt : y === 0 ? Sh.dk : Sh.base);
    }
    if (s.heels) { b.vline(fx - 2, fy - 2, fy + 0, Sh.dk); b.set(fx + len - 3, fy - 1, Sh.hi); }
    else b.set(fx + len - 3, fy - 2, Sh.hi);
  } else {
    const w = t + 2;
    for (let y = -3; y <= 0; y++) for (let x = 0; x < w; x++) b.set(fx - (w >> 1) + x, fy + y, y === -3 ? Sh.lt : y === 0 ? Sh.dk : x === 0 ? Sh.lt : Sh.base);
    if (s.heels) b.set(fx, fy - 4, Sh.base);
  }
}

function drawTorso(b: PixBuf, sk: Skel, f: FigCtx): void {
  const s = f.spec, T = s.top;
  const view = sk.view;
  for (const row of sk.rows) {
    const n = row.r - row.l;
    for (let x = row.l; x <= row.r; x++) {
      const u = n > 0 ? (x - row.l) / n : 0.5;
      let c = u < 0.12 ? T.lt : u < 0.62 ? T.base : u < 0.88 ? T.sh : T.dk;
      if (view === 'side') c = u < 0.18 ? T.lt : u < 0.7 ? T.base : T.sh;
      if (row === sk.rows[0]) c = T.hi;
      b.set(x, row.y, c);
    }
  }
  // bottom hem shadow
  const last = sk.rows[sk.rows.length - 1];
  if (last) for (let x = last.l; x <= last.r; x++) b.set(x, last.y, T.dk);
  const cx = R(sk.shC[0]);
  const top = R(sk.shY);
  if (view === 'front') {
    // collar + shirt V + tie
    const depth = Math.round(s.torsoH * (s.lapels ? 0.5 : 0.18));
    for (let y = 0; y < depth; y++) {
      const half = Math.max(0, Math.round((depth - y) * (s.lapels ? 0.42 : 0.6)));
      for (let x = -half; x <= half; x++) b.set(cx + x, top + 1 + y, s.under.base);
      if (s.lapels) { b.set(cx - half - 1, top + 1 + y, T.dk); b.set(cx + half + 1, top + 1 + y, T.dk); b.set(cx - half - 2, top + 1 + y, T.hi); }
    }
    b.set(cx - 2, top + 1, s.under.hi); b.set(cx + 2, top + 1, s.under.lt);
    if (s.tie) {
      const tl = Math.round(s.torsoH * 0.62);
      for (let y = 2; y < tl; y++) {
        const half = y < 4 ? 1 : y > tl - 3 ? (tl - y > 1 ? 1 : 0) : 1;
        for (let x = -half; x <= half; x++) b.set(cx + x, top + y, x < 0 ? s.tie.lt : x > 0 ? s.tie.sh : s.tie.base);
      }
      b.set(cx, top + 2, s.tie.dk); b.set(cx, top + tl - 1, s.tie.dk);
    }
    if (s.lapels) for (let k = 0; k < 3; k++) b.set(cx + 1, top + Math.round(s.torsoH * 0.58) + k * 3, T.dk);
  } else if (view === 'back') {
    for (let y = top + 2; y < R(sk.hipY) - 1; y++) b.set(cx, y, T.sh);
    for (let x = -3; x <= 3; x++) b.set(cx + x, top + 1, s.under.sh);
  } else {
    // side: collar at the front, lapel edge
    const fx = sk.rows[1]?.r ?? cx;
    b.set(fx - 1, top + 1, s.under.base); b.set(fx - 2, top + 1, s.under.lt); b.set(fx - 1, top + 2, s.under.base);
    if (s.tie) for (let y = 3; y < Math.round(s.torsoH * 0.55); y++) b.set(fx - 1, top + y, s.tie.base);
    if (s.lapels) for (let y = 2; y < Math.round(s.torsoH * 0.5); y++) b.set(fx - 3 - Math.round(y * 0.15), top + y, T.dk);
  }
}

function drawArm(b: PixBuf, sk: Skel, i: 0 | 1, f: FigCtx, far: boolean): void {
  const s = f.spec;
  const Sl = far ? farRamp(s.sleeve) : s.sleeve;
  const Sk = far ? farRamp(s.skin) : s.skin;
  const sh = sk.shJ[i], el = sk.el[i], ha = sk.ha[i];
  const t = s.armT;
  b.limb(sh[0], sh[1], el[0], el[1], t, Sl.lt, Sl.base, Sl.sh);
  b.limb(el[0], el[1], ha[0], ha[1], Math.max(2, t - 1), Sl.lt, Sl.base, Sl.sh);
  // cuff
  const dx = ha[0] - el[0], dy = ha[1] - el[1];
  const d = Math.max(0.01, Math.hypot(dx, dy));
  const cxp = ha[0] - (dx / d) * 2, cyp = ha[1] - (dy / d) * 2;
  b.set(R(cxp), R(cyp), s.under.base);
  // hand
  const G = s.gloves ? (far ? farRamp(s.gloves) : s.gloves) : Sk;
  const hr = Math.max(1.5, t / 2);
  b.ellipse(ha[0], ha[1], hr, hr, G.base);
  b.set(R(ha[0] - hr + 1), R(ha[1] - hr + 1), G.lt);
  b.set(R(ha[0] + hr - 1), R(ha[1] + hr - 1), G.sh);
}

// ---------------------------------------------------------------------------------------------
// Head + face

function headShape(hb: HeadBox, jaw: FaceSpec['jaw']): { L: number[]; R: number[] } {
  const L: number[] = [], Rr: number[] = [];
  const top = [3, 1, 1];
  const bot = jaw === 'square' ? [2, 1] : jaw === 'chiselled' ? [3, 1, 0] : jaw === 'soft' ? [4, 2, 1, 1] : [3, 2, 1];
  for (let r = 0; r < hb.h; r++) {
    let inset = r < top.length ? top[r] : 0;
    const br = hb.h - 1 - r;
    if (br < bot.length) inset = Math.max(inset, bot[br]);
    let l = inset, rr = hb.w - 1 - inset;
    if (hb.view === 'side') { if (br < 4) l = Math.max(l, 3 + (3 - br)); if (br === 0) rr -= 1; }
    L.push(l); Rr.push(rr);
  }
  return { L, R: Rr };
}

function drawHead(b: PixBuf, hb: HeadBox, f: FigCtx): void {
  const s = f.spec, F = s.face, K = s.skin;
  const { x, y, w, h, view } = hb;
  const { L, R: Rr } = headShape(hb, F.jaw);
  // neck
  const nx = R(x + w / 2 + (view === 'side' ? -1 : 0)), nw = Math.max(4, Math.round(w * 0.42));
  for (let yy = y + h - 1; yy <= R(f.sk.shY) + 1; yy++) for (let xx = -Math.floor(nw / 2); xx < Math.ceil(nw / 2); xx++) b.set(nx + xx, yy, xx === Math.ceil(nw / 2) - 1 ? K.dk : K.sh);
  s.hair_(b, hb, 'back', f);
  for (let r = 0; r < h; r++) for (let c = L[r]; c <= Rr[r]; c++) {
    let col = K.base;
    if (view === 'front') col = c === L[r] ? K.lt : c >= Rr[r] - 1 ? K.sh : r >= h - 2 ? K.sh : K.base;
    else if (view === 'side') col = c <= L[r] + 1 ? K.sh : c === Rr[r] ? K.base : K.base;
    else col = c === L[r] ? K.lt : c === Rr[r] ? K.sh : K.base;
    if (c === L[r] + 1 && r > 2 && r < h - 3 && view === 'front') col = K.hi;
    b.set(x + c, y + r, col);
  }
  if (F.ears !== false && view !== 'back') {
    const ey = y + Math.round(h * 0.45);
    if (view === 'front') {
      for (let k = 0; k < 3; k++) { b.set(x - 1, ey + k, K.sh); b.set(x + w, ey + k, K.dk); }
      b.set(x - 2, ey + 1, K.sh); b.set(x + w + 1, ey + 1, K.dk);
    } else {
      const ex = x + Math.round(w * 0.38);
      for (let k = 0; k < 4; k++) { b.set(ex, ey + k, K.sh); b.set(ex + 1, ey + k, k === 0 || k === 3 ? K.sh : K.dk); }
    }
  } else if (view === 'back') {
    const ey = y + Math.round(h * 0.45);
    for (let k = 0; k < 3; k++) { b.set(x - 1, ey + k, K.sh); b.set(x + w, ey + k, K.sh); }
  }
  if (view !== 'back') drawFace(b, hb, L, Rr, f);
  s.hair_(b, hb, 'front', f);
  s.headDetail?.(b, hb, f);
}

function drawFace(b: PixBuf, hb: HeadBox, L: number[], Rr: number[], f: FigCtx): void {
  const s = f.spec, F = s.face, K = s.skin, ex = f.pose.expr;
  const { x, y, w, h, view } = hb;
  const eyeY = y + Math.round(h * 0.47);
  const mouthY = y + h - 4;
  const brow = F.brow;
  if (view === 'front') {
    const cx = x + Math.floor(w / 2);
    const g = F.eyeGap;
    const exs = [cx - g - 2, cx + g];
    // eyes
    for (const [k, ex0] of exs.entries()) {
      if (ex === 'blink' || ex === 'dead') { b.hline(ex0, ex0 + 1, eyeY + 1, EYE); continue; }
      if (ex === 'dazed') { b.set(ex0, eyeY, EYE); b.set(ex0 + 1, eyeY + 1, EYE); b.set(ex0 + 1, eyeY, WHITE); b.set(ex0, eyeY + 1, WHITE); continue; }
      const wide = ex === 'shock' || ex === 'shout';
      b.set(ex0, eyeY, WHITE); b.set(ex0 + 1, eyeY, WHITE);
      b.set(ex0 + (k === 0 ? 1 : 0), eyeY, EYE);
      b.set(ex0, eyeY + 1, EYE); b.set(ex0 + 1, eyeY + 1, EYE);
      if (wide) { b.set(ex0, eyeY - 1, WHITE); b.set(ex0 + 1, eyeY - 1, WHITE); }
      if (F.lashes || F.liner) { b.set(ex0 + (k === 0 ? -1 : 2), eyeY - 1, EYE); }
      if (F.liner) b.set(ex0 + (k === 0 ? -1 : 2), eyeY, EYE);
    }
    // brows
    const by = eyeY - 2 - (ex === 'shock' ? 1 : 0);
    for (const [k, ex0] of exs.entries()) {
      const inner = k === 0 ? 1 : 0;
      for (let q = -1; q <= 2; q++) {
        let yy = by;
        if (ex === 'angry' || ex === 'shout' || ex === 'focus') yy += (k === 0 ? q : 1 - q) >= 1 ? 1 : 0;
        if (ex === 'pain') yy += (k === 0 ? 1 - q : q) >= 1 ? 1 : 0;
        if (ex === 'smug' && k === 1) yy -= q >= 1 ? 1 : 0;
        b.set(ex0 + q, yy, brow.base);
        if (F.browT === 2) b.set(ex0 + q, yy - 1, brow.dk);
      }
      void inner;
    }
    // nose
    b.set(cx - 1, eyeY + 2, K.sh); b.set(cx - 1, eyeY + 3, K.sh); b.set(cx, eyeY + 4, K.dk); b.set(cx - 1, eyeY + 4, K.sh);
    if (F.blush) { b.set(exs[0] - 1, eyeY + 3, mixCol(K.base, C('#e0707a'), 0.45)); b.set(exs[1] + 2, eyeY + 3, mixCol(K.base, C('#e0707a'), 0.45)); }
    if (F.wrinkles) { b.set(exs[0] - 1, eyeY + 1, K.sh); b.set(exs[1] + 2, eyeY + 1, K.sh); b.set(cx - 3, eyeY + 5, K.sh); b.set(cx + 2, eyeY + 5, K.sh); }
    // facial hair base
    if (F.stubble) for (let r = Math.round(h * 0.62); r < h; r++) for (let c = L[r] + 1; c < Rr[r]; c++) if ((c + r) % 2 === 0) b.set(x + c, y + r, mixCol(K.base, s.hair.base, 0.35));
    if (F.beard) for (let r = Math.round(h * 0.66); r < h + 1; r++) for (let c = L[Math.min(h - 1, r)]; c <= Rr[Math.min(h - 1, r)]; c++) b.set(x + c, y + r, r === h ? F.beard.dk : c === L[Math.min(h - 1, r)] ? F.beard.lt : F.beard.base);
    // mouth
    mouthFront(b, cx, mouthY, ex, F);
    if (F.moustache) {
      const M = F.moustache;
      for (let q = -3; q <= 2; q++) b.set(cx + q, mouthY - 2, q === -3 ? M.lt : M.base);
      b.set(cx - 4, mouthY - 1, M.sh); b.set(cx + 3, mouthY - 1, M.sh);
      b.set(cx - 2, mouthY - 3, M.lt); b.set(cx + 1, mouthY - 3, M.base);
    }
    if (F.glasses && F.glasses !== 'none') {
      const G = F.glassesCol ?? ramp('#2a2a30');
      const gy = F.glasses === 'half' ? eyeY + 1 : eyeY - 1;
      for (const ex0 of exs) {
        if (F.glasses === 'square') { b.hline(ex0 - 1, ex0 + 2, gy, G.base); b.hline(ex0 - 1, ex0 + 2, gy + 3, G.base); b.vline(ex0 - 1, gy, gy + 3, G.base); b.vline(ex0 + 2, gy, gy + 3, G.base); b.set(ex0, gy + 1, C('#cfe3ef')); }
        else { b.hline(ex0 - 1, ex0 + 2, gy, G.base); b.hline(ex0 - 1, ex0 + 2, gy + 2, G.dk); b.set(ex0 - 1, gy + 1, G.base); b.set(ex0 + 2, gy + 1, G.base); }
      }
      b.hline(exs[0] + 2, exs[1] - 1, gy, G.base);
      b.set(x - 1, gy, G.base); b.set(x + w, gy, G.base);
    }
  } else {
    // side profile facing +x
    const fx = x + Rr[Math.round(h * 0.5)];
    const ex0 = fx - 3;
    if (ex === 'blink' || ex === 'dead') b.hline(ex0, ex0 + 1, eyeY + 1, EYE);
    else { b.set(ex0 + 1, eyeY, WHITE); b.set(ex0, eyeY, EYE); b.set(ex0, eyeY + 1, EYE); b.set(ex0 + 1, eyeY + 1, ex === 'dazed' ? WHITE : EYE); }
    if (F.liner || F.lashes) b.set(ex0 - 1, eyeY - 1, EYE);
    const by = eyeY - 2 + (ex === 'angry' || ex === 'shout' || ex === 'focus' ? 1 : 0);
    b.hline(ex0 - 1, ex0 + 2, by, brow.base);
    if (F.browT === 2) b.hline(ex0 - 1, ex0 + 1, by - 1, brow.dk);
    // nose protrudes
    b.set(fx + 1, eyeY + 1, K.base); b.set(fx + 1, eyeY + 2, K.base); b.set(fx + 2, eyeY + 3, K.base); b.set(fx + 1, eyeY + 3, K.sh); b.set(fx + 1, eyeY + 4, K.sh);
    if (F.stubble) for (let r = Math.round(h * 0.62); r < h; r++) for (let c = L[r] + 3; c < Rr[r]; c++) if ((c + r) % 2 === 0) b.set(x + c, y + r, mixCol(K.base, s.hair.base, 0.35));
    if (F.beard) for (let r = Math.round(h * 0.66); r < h; r++) for (let c = L[r] + 4; c <= Rr[r]; c++) b.set(x + c, y + r, F.beard.base);
    const mx = fx - 1;
    if (ex === 'shout' || ex === 'shock') { b.set(mx, mouthY - 1, MOUTH); b.set(mx + 1, mouthY - 1, MOUTH); b.set(mx, mouthY, MOUTH); b.set(mx + 1, mouthY, TEETH); b.set(mx, mouthY + 1, MOUTH); }
    else if (ex === 'grin' || ex === 'smug') { b.set(mx - 2, mouthY - 1, MOUTH); b.set(mx - 1, mouthY, MOUTH); b.set(mx, mouthY, TEETH); b.set(mx + 1, mouthY, TEETH); }
    else if (ex === 'talk') { b.set(mx, mouthY, MOUTH); b.set(mx + 1, mouthY, MOUTH); b.set(mx + 1, mouthY + 1, MOUTH); }
    else if (ex === 'pain' || ex === 'dazed') { b.set(mx - 1, mouthY + 1, MOUTH); b.set(mx, mouthY, MOUTH); b.set(mx + 1, mouthY + 1, MOUTH); }
    else { b.set(mx, mouthY, MOUTH); b.set(mx + 1, mouthY, MOUTH); if (F.lip) b.set(mx, mouthY, F.lip); }
    if (F.moustache) { b.hline(mx - 1, mx + 2, mouthY - 2, F.moustache.base); b.set(mx + 2, mouthY - 1, F.moustache.sh); }
    if (F.glasses && F.glasses !== 'none') {
      const G = F.glassesCol ?? ramp('#2a2a30');
      const gy = F.glasses === 'half' ? eyeY + 1 : eyeY - 1;
      b.hline(ex0 - 1, ex0 + 2, gy, G.base); b.set(ex0 + 2, gy + 1, G.base);
      b.hline(x + Math.round(w * 0.38), ex0 - 1, gy, G.dk);
    }
  }
}

function mouthFront(b: PixBuf, cx: number, my: number, ex: Expr, F: FaceSpec): void {
  const lip = F.lip ?? MOUTH;
  switch (ex) {
    case 'shout': case 'shock':
      for (let yy = -1; yy <= 2; yy++) for (let xx = -2; xx <= 1; xx++) b.set(cx + xx, my + yy, MOUTH);
      b.hline(cx - 2, cx + 1, my - 1, TEETH);
      if (F.lip) { b.hline(cx - 2, cx + 1, my - 2, lip); b.hline(cx - 2, cx + 1, my + 3, lip); }
      return;
    case 'grin': case 'smug': {
      const half = F.bigTeeth ? 4 : 3;
      b.set(cx - half - 1, my - 1, MOUTH); b.set(cx + half, my - 1, MOUTH);
      b.hline(cx - half, cx + half - 1, my, TEETH);
      if (F.bigTeeth) b.hline(cx - half + 1, cx + half - 2, my + 1, TEETH);
      b.hline(cx - half + 1, cx + half - 2, my + (F.bigTeeth ? 2 : 1), MOUTH);
      if (ex === 'smug') b.set(cx + half, my - 2, MOUTH);
      return;
    }
    case 'talk':
      b.hline(cx - 2, cx + 1, my, MOUTH); b.hline(cx - 1, cx, my + 1, MOUTH);
      if (F.lip) b.hline(cx - 2, cx + 1, my - 1, lip);
      return;
    case 'angry': case 'focus':
      b.hline(cx - 2, cx + 1, my + 1, MOUTH); b.set(cx - 3, my + 2, MOUTH); b.set(cx + 2, my + 2, MOUTH);
      return;
    case 'pain': case 'dazed':
      b.set(cx - 2, my + 1, MOUTH); b.set(cx - 1, my, MOUTH); b.set(cx, my + 1, MOUTH); b.set(cx + 1, my, MOUTH);
      return;
    case 'dead':
      b.hline(cx - 2, cx + 1, my + 1, MOUTH);
      return;
    default:
      b.hline(cx - 2, cx + 1, my, F.lip ?? MOUTH);
      if (F.lip) b.hline(cx - 1, cx, my + 1, mixCol(F.lip, MOUTH, 0.4));
  }
}

// ---------------------------------------------------------------------------------------------
// Full figure

/** Draw a whole boss figure into `b` with feet at (ox, oy). Caller outlines afterwards. */
export function drawFigure(b: PixBuf, spec: FigSpec, pose: FigPose, view: View, ox: number, oy: number, frame = 0): Skel {
  const sk = skeleton(spec, pose, view, ox, oy);
  const f: FigCtx = { spec, pose, view, sk, frame };
  const side = view === 'side';
  const drawItem = (it: FigPose['item'], hand: P) => { if (it) ITEMS[it.kind]?.(b, hand[0], hand[1], it.angle, f); };
  if (view === 'back') {
    // items are mostly hidden behind the body when seen from behind
    drawItem(pose.item, sk.ha[0]); drawItem(pose.item2, sk.ha[1]);
  }
  if (side) {
    if (!pose.arm1Front) drawArm(b, sk, 1, f, true);
    if (pose.arm0Behind) { drawItem(pose.item, sk.ha[0]); drawArm(b, sk, 0, f, true); }
    if (!pose.noLegs) drawLeg(b, sk, 1, f, true);
  }
  if (!pose.noLegs) {
    if (!side) { drawLeg(b, sk, 0, f, false); drawLeg(b, sk, 1, f, false); }
    else drawLeg(b, sk, 0, f, false);
    spec.legDetail?.(b, sk, f);
  }
  if (spec.skirt && !pose.noLegs) drawSkirt(b, sk, f);
  drawTorso(b, sk, f);
  spec.torsoDetail?.(b, sk, f);
  if (view === 'back') { drawArm(b, sk, 0, f, false); drawArm(b, sk, 1, f, false); drawHead(b, sk.head, f); }
  else {
    drawHead(b, sk.head, f);
    if (side) {
      if (pose.arm1Front) drawArm(b, sk, 1, f, false);
      if (!pose.arm0Behind) { drawArm(b, sk, 0, f, false); drawItem(pose.item, sk.ha[0]); }
      drawItem(pose.item2, sk.ha[1]);
    } else {
      drawArm(b, sk, 0, f, false); drawArm(b, sk, 1, f, false);
      drawItem(pose.item, sk.ha[0]); drawItem(pose.item2, sk.ha[1]);
    }
  }
  spec.over?.(b, sk, f);
  return sk;
}

function drawSkirt(b: PixBuf, sk: Skel, f: FigCtx): void {
  const s = f.spec, L = s.skirtCol ?? s.legs;
  const y0 = R(sk.hipY) - 1, y1 = R(sk.hipY + s.legLen * 0.52);
  const side = sk.view === 'side';
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const half = side ? s.hipW * 0.35 + t * 2 : s.hipW / 2 + t * 2;
    const cx = sk.hipC[0] + (side ? 1 : 0);
    for (let x = R(cx - half); x <= R(cx + half); x++) {
      const u = (x - (cx - half)) / (2 * half);
      b.set(x, y, y === y1 ? L.dk : u < 0.15 ? L.lt : u > 0.8 ? L.sh : L.base);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pose helpers

export function basePose(): FigPose {
  return { crouch: 0, lean: 0, bend: 0, legs: [[0, 0], [0, 0]], arms: [[3, 18], [3, 18]], head: [0, 0], expr: 'neutral' };
}

export function lerpN(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function ease(t: number): number { return t * t * (3 - 2 * t); }

/** Walk cycle legs for a view (phase 0..1). */
export function walkLegs(view: View, ph: number, stride: number, lift: number): [P, P] {
  const a = Math.sin(ph * Math.PI * 2), c = Math.cos(ph * Math.PI * 2);
  if (view === 'side') return [[a * stride, Math.max(0, c) * lift], [-a * stride, Math.max(0, -c) * lift]];
  return [[0.5, Math.max(0, a) * lift], [0.5, Math.max(0, -a) * lift]];
}
