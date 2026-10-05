export interface Vec { x: number; y: number; }

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
export const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export const v = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const norm = (a: Vec): Vec => { const l = Math.hypot(a.x, a.y); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const fromAngle = (a: number, l = 1): Vec => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const angleOf = (a: Vec) => Math.atan2(a.y, a.x);
export const angleTo = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);
export const wrapAngle = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);
export const rotateTowards = (a: number, target: number, maxStep: number) => {
  const d = angleDiff(a, target);
  return Math.abs(d) <= maxStep ? target : a + Math.sign(d) * maxStep;
};

/** 4-way facing index: 0 down, 1 right, 2 up, 3 left. */
export function dir4(angle: number): 0 | 1 | 2 | 3 {
  const a = wrapAngle(angle);
  if (a >= -Math.PI / 4 && a < Math.PI / 4) return 1;
  if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) return 0;
  if (a >= (-3 * Math.PI) / 4 && a < -Math.PI / 4) return 2;
  return 3;
}

export interface Rect { x: number; y: number; w: number; h: number; }
export const rectContains = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export const rectsOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function circleRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** Is point p within an arc sector centred on origin o, facing angle, half-width halfArc, radius r. */
export function inArc(o: Vec, facing: number, halfArc: number, r: number, p: Vec, pr = 0): boolean {
  const d = dist(o, p);
  if (d > r + pr) return false;
  if (d < pr + 2) return true;
  return Math.abs(angleDiff(facing, angleTo(o, p))) <= halfArc + Math.asin(Math.min(1, pr / Math.max(d, 1e-6)));
}

/** Distance from point p to segment ab. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

export function segmentIntersectsRect(a: Vec, b: Vec, r: Rect): boolean {
  // Liang–Barsky
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
