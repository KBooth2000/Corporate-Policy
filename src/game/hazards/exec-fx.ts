// Visual toolkit for the bespoke execution mini-cutscenes (spec 4.7): puppets, letterbox, impact frames,
// the pixel-art building-facade fall shot, battered-face photocopier printouts and the hand-dryer face-flap close-up.
import type { Ctx } from '../../render/canvas';
import { makeCanvas, ctx2d, ellipse, line } from '../../render/canvas';
import { drawText, measure } from '../../render/font';
import type { Actor } from '../entity';
import type { AnimName, BakedCharacter, DrawOpts } from '../../art/characters';
import { ACT_PALETTES } from '../../art/palette';
import type { Act } from '../../data/ids';
import { dir4, clamp } from '../../core/math';
import { fxRng } from '../../core/rng';

// ---------------------------------------------------------------------------
// Puppets: the victim is drawn by the cutscene (so it can be clipped, shaken, tinted, tumbled).
export interface PuppetOpts extends DrawOpts {
  dir?: number;            // facing angle (radians)
  shadow?: boolean;
  /** Only draw inside this world rect [x0, y0, x1, y1] (being swallowed into an object). */
  clip?: [number, number, number, number];
  scale?: number;
  lift?: number;
}

export function drawPuppet(g: Ctx, a: Actor, anim: AnimName, t: number, x: number, y: number, o: PuppetOpts = {}): void {
  const b: BakedCharacter | null = a.baked;
  if (!b) return;
  const rx = Math.round(x), ry = Math.round(y - (o.lift ?? 0));
  g.save();
  if (o.clip) {
    g.beginPath();
    g.rect(o.clip[0], o.clip[1], o.clip[2] - o.clip[0], o.clip[3] - o.clip[1]);
    g.clip();
  }
  if (o.shadow !== false) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    const sw = Math.round(b.shadowW);
    g.fillRect(rx - sw / 2 + 1, Math.round(y) - 1, sw - 2, 3);
    g.fillRect(rx - sw / 2, Math.round(y), sw, 1);
  }
  const d = dir4(o.dir ?? a.facing);
  if (o.scale && o.scale !== 1) {
    g.translate(rx, ry); g.scale(o.scale, o.scale);
    b.draw(g, anim, d, t, 0, 0, o);
  } else b.draw(g, anim, d, t, rx, ry, o);
  g.restore();
}

// ---------------------------------------------------------------------------
// Screen overlays
export function letterbox(g: Ctx, W: number, H: number, k: number): void {
  const bar = Math.round(clamp(k, 0, 1) * 26);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
}

export function flashFrame(g: Ctx, W: number, H: number, a: number): void {
  if (a <= 0.01) return;
  g.globalAlpha = Math.min(1, a);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
}

/** Caption in the bottom letterbox bar (deadpan, unique per execution). */
export function caption(g: Ctx, W: number, H: number, text: string, t: number, col = '#ffd34d'): void {
  const n = Math.min(text.length, Math.floor(t * 70));
  drawText(g, text.slice(0, n), W / 2, H - 20, { align: 'center', color: col, scale: 1, outline: '#000' });
  void measure;
}

/** Comic-book style impact lines + onomatopoeia at a screen position. */
export function bang(g: Ctx, x: number, y: number, text: string, k: number, col = '#ffd34d'): void {
  if (k <= 0 || k >= 1) return;
  const s = 1 + (1 - k) * 0.5;
  g.globalAlpha = 1 - k * k;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 6.283 + 0.3, r0 = 10 + k * 14, r1 = r0 + 8 * (1 - k);
    line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, '#ffffff');
  }
  drawText(g, text, x, y - 14 - k * 6, { align: 'center', color: col, scale: s > 1.3 ? 2 : 1, outline: '#000' });
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Photocopier printouts: the victim's battered face, photocopied (1-bit dither, smeared, bruised)
const BAYER = [[0, 2], [3, 1]];

export function makePrintout(portrait: HTMLCanvasElement, variant: number): HTMLCanvasElement {
  const W = 16, H = 20;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d9d5c9'; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
  // toner streaks
  g.fillStyle = '#b9b6ac';
  g.fillRect(1 + (variant * 5) % 11, 1, 1, H - 2);
  // the face, 12x12 (nearest neighbour) -> 1-bit
  const f = makeCanvas(12, 12);
  const fg = ctx2d(f);
  fg.drawImage(portrait, 0, 0, portrait.width, portrait.height, 0, 0, 12, 12);
  const img = fg.getImageData(0, 0, 12, 12);
  const out = fg.createImageData(12, 12);
  for (let y = 0; y < 12; y++) {
    // smear: rows slide sideways while the head hits the scanner
    const shift = variant === 3 ? Math.round(Math.sin(y * 0.9 + variant) * 2) : variant === 2 ? (y > 5 ? 2 : -1) : 0;
    for (let x = 0; x < 12; x++) {
      const sx = clamp(x - shift, 0, 11);
      const i = (y * 12 + sx) * 4;
      const a = img.data[i + 3];
      const lum = a < 40 ? 255 : (img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11);
      const thr = 70 + BAYER[y & 1][x & 1] * 38 + (variant === 0 ? -10 : 0);
      const dark = lum < thr + 40;
      const o = (y * 12 + x) * 4;
      if (a < 40) { out.data[o + 3] = 0; continue; }
      out.data[o] = dark ? 0x26 : 0xf6; out.data[o + 1] = dark ? 0x26 : 0xf4; out.data[o + 2] = dark ? 0x2c : 0xee; out.data[o + 3] = 255;
    }
  }
  fg.putImageData(out, 0, 0);
  g.drawImage(f, 2, 3);
  if (variant === 1) { g.globalAlpha = 0.55; g.drawImage(f, 3, 4); g.globalAlpha = 1; }          // double exposure
  // squashed against the glass: flatten the nose line, bruise the eyes, tape-measure of regret
  g.fillStyle = '#26262c';
  g.fillRect(4, 8, 2, 1); g.fillRect(9, 8, 2, 1);
  g.fillStyle = '#6a6a72';
  g.fillRect(3, 7, 4, 1); g.fillRect(9, 7, 4, 1);
  if (variant === 0 || variant === 3) { g.fillStyle = '#26262c'; g.fillRect(6, 14, 4, 1); }
  // "COPY n/4"
  g.fillStyle = '#8a8a92';
  g.fillRect(2, 17, 2 + variant, 1); g.fillRect(12, 17, 2, 1);
  return c;
}

// ---------------------------------------------------------------------------
// Hand dryer: the victim's portrait close-up with flapping cheeks
export function drawFaceFlap(g: Ctx, portrait: HTMLCanvasElement, cx: number, cy: number, t: number, amp: number, scale = 3): void {
  const W = portrait.width, H = portrait.height;
  // frame
  const fw = W * scale + 8, fh = H * scale + 8;
  g.fillStyle = '#0b0c10'; g.fillRect(Math.round(cx - fw / 2) - 2, Math.round(cy - fh / 2) - 2, fw + 4, fh + 4);
  g.fillStyle = '#9fd0e6'; g.fillRect(Math.round(cx - fw / 2), Math.round(cy - fh / 2), fw, fh);
  g.save();
  g.beginPath(); g.rect(Math.round(cx - fw / 2) + 2, Math.round(cy - fh / 2) + 2, fw - 4, fh - 4); g.clip();
  // wind-blown streak background
  g.fillStyle = '#cfe8f4';
  g.fillRect(Math.round(cx - fw / 2) + 2, Math.round(cy - fh / 2) + 2, fw - 4, fh - 4);
  for (let r = 0; r < H; r++) {
    // the mid-face rows (cheeks) flap hardest; hair at the top streams back, chin trails
    const mid = Math.exp(-Math.pow((r - H * 0.62) / (H * 0.2), 2));
    const hair = r < H * 0.3 ? 0.6 : 0;
    const dx = Math.sin(t * 38 + r * 0.9) * amp * (mid * 3.2 + hair) + amp * (r < H * 0.3 ? 2.4 : 0) + Math.sin(t * 21 + r * 0.4) * amp * 0.6;
    const bulge = 1 + mid * amp * 0.07 * Math.sin(t * 30);
    const sw = Math.round(W * scale * bulge);
    g.drawImage(portrait, 0, r, W, 1, Math.round(cx - sw / 2 + dx * scale * 0.5), Math.round(cy - fh / 2 + 4 + r * scale), sw, scale);
  }
  // wind streaks across the frame
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const y = Math.round(cy - fh / 2 + 6 + ((i * 17 + t * 260) % (fh - 10)));
    const x = Math.round(cx - fw / 2 + 2 + ((i * 29 + t * 520) % (fw - 14)));
    g.globalAlpha = 0.8; g.fillRect(x, y, 10 + (i % 3) * 5, 1); g.globalAlpha = 1;
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The exterior facade fall shot
export interface FallShot {
  W: number; H: number;
  /** Floor the window is on (1 = ground floor). */
  floor: number;
  act: Act;
  /** Fall progress 0..1 (eased by the caller). */
  k: number;
  /** Seconds since the shot began (for wobble / paper). */
  t: number;
  /** Impact clock: <0 not landed; seconds since landing. */
  landed: number;
  victim: Actor;
  gore: 0 | 1 | 2;
  rot: number;
  /** Total fall in px (floor*FH). */
  fallPx: number;
}

export const FH = 52;           // floor height on the facade
const WIN_W = 38, WIN_H = 32, COL_W = 62;

function hash(n: number): number { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

export function fallDistance(floor: number): number { return floor <= 1 ? 16 : (floor - 1) * FH + 8; }

export function drawFallShot(g: Ctx, s: FallShot): void {
  const { W, H } = s;
  const pal = ACT_PALETTES[s.act];
  const total = s.fallPx;
  const vy = total * s.k;                           // victim world y below the sill
  const groundY = total;                            // world y of the pavement top
  // camera: follow the victim, but stop once the ground fills the lower part of the frame
  const camY = Math.min(vy - H * 0.36, groundY - H * 0.8);
  const toS = (wy: number) => Math.round(wy - camY);

  // sky (banded)
  const bands = ['#5fa8e0', '#78bbe8', '#93cbee', '#add9f2', '#c6e5f5', '#dcf0f8'];
  for (let i = 0; i < bands.length; i++) { g.fillStyle = bands[i]; g.fillRect(0, Math.round((i * H) / bands.length), W, Math.ceil(H / bands.length) + 1); }
  // distant skyline
  g.fillStyle = '#a9c4d6';
  for (let i = 0; i < 14; i++) {
    const bx = i * 66 - 20 + (i % 3) * 9, bh = 90 + hash(i * 7) * 120, bw = 40 + hash(i * 3) * 24;
    const top = toS(groundY - bh * 0.9) ;
    g.fillRect(bx, Math.max(top, 0), bw, H);
  }
  // clouds
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.7;
  for (let i = 0; i < 5; i++) {
    const cx = (i * 190 + 60) % (W + 80) - 40, cy = ((i * 130 + 40 - camY * 0.25) % (H + 60)) - 30;
    ellipse(g, cx, cy, 34, 7, '#ffffff'); ellipse(g, cx + 14, cy - 5, 20, 6, '#ffffff');
  }
  g.globalAlpha = 1;

  // facade
  const fx0 = Math.round(W * 0.13), fx1 = W - fx0;
  g.fillStyle = pal.wall[1]; g.fillRect(fx0, 0, fx1 - fx0, H);
  g.fillStyle = pal.wall[2]; g.fillRect(fx0 - 4, 0, 4, H); g.fillRect(fx1, 0, 4, H);
  const bTop = Math.floor((camY - 4) / FH) - 1, bBot = Math.ceil((camY + H + 4) / FH) + 1;
  const cols = Math.floor((fx1 - fx0) / COL_W);
  const colX0 = fx0 + Math.floor(((fx1 - fx0) - cols * COL_W) / 2);
  const brokenCol = Math.floor((W / 2 - colX0) / COL_W);
  for (let b = bTop; b <= bBot; b++) {
    const sill = b * FH;                            // world y of this floor's window sill
    if (sill > groundY + 4) continue;
    const sy = toS(sill);
    const floorNo = s.floor - b;
    // spandrel / slab
    g.fillStyle = pal.wall[0]; g.fillRect(fx0, sy + 1, fx1 - fx0, FH - WIN_H - 3);
    g.fillStyle = pal.wall[2]; g.fillRect(fx0, sy + 1, fx1 - fx0, 1);
    for (let c = 0; c < cols; c++) {
      const wx = colX0 + c * COL_W + (COL_W - WIN_W) / 2;
      const wy = sy - WIN_H + 0;
      const seed = (b + 100) * 31 + c * 7 + 1;
      const broken = b === 0 && c === brokenCol;
      // frame
      g.fillStyle = '#2a3340'; g.fillRect(wx - 2, wy - 2, WIN_W + 4, WIN_H + 4);
      if (broken) {
        g.fillStyle = '#0d1016'; g.fillRect(wx, wy, WIN_W, WIN_H);
        // jagged glass teeth + a blind flapping out
        g.fillStyle = '#cfe8f4';
        for (let i = 0; i < 7; i++) { const tx = wx + i * 6, th = 3 + ((i * 5) % 7); g.fillRect(tx, wy, 3, th); g.fillRect(tx + 1, wy + WIN_H - th, 3, th); }
        const fl = Math.sin(s.t * 14) * 2;
        g.fillStyle = '#f6f3ea'; g.fillRect(wx + WIN_W - 6 + fl, wy + 2, 5, 18);
      } else {
        const lit = hash(seed) > 0.35;
        g.fillStyle = lit ? '#bfe0f0' : '#5a7f98'; g.fillRect(wx, wy, WIN_W, WIN_H);
        g.fillStyle = lit ? '#e8f6fc' : '#7fa4bd'; g.fillRect(wx + 2, wy + 2, 6, WIN_H - 4);       // glare
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(wx, wy + WIN_H - 6, WIN_W, 6);
        // tiny staff
        const h2 = hash(seed + 3);
        if (lit && h2 > 0.45) {
          g.fillStyle = '#26303c'; g.fillRect(wx + 12 + Math.floor(h2 * 14), wy + WIN_H - 14, 6, 14);
          g.fillStyle = '#e8b996'; g.fillRect(wx + 13 + Math.floor(h2 * 14), wy + WIN_H - 18, 4, 4);
          if (hash(seed + 9) > 0.7) { g.fillStyle = '#f6f3ea'; g.fillRect(wx + 11 + Math.floor(h2 * 14), wy + WIN_H - 22, 8, 4); }  // panicking, arms up
        } else if (h2 > 0.2 && h2 <= 0.32) { g.fillStyle = '#3e7a3a'; g.fillRect(wx + 26, wy + WIN_H - 10, 7, 10); }
        g.fillStyle = '#2a3340'; g.fillRect(wx + WIN_W / 2 - 1, wy, 2, WIN_H);                       // mullion
      }
      // sill
      g.fillStyle = pal.wall[2]; g.fillRect(wx - 3, sy, WIN_W + 6, 2);
    }
    // floor plate on the left
    const tag = String(floorNo);
    if (floorNo >= 1 && sy > -20 && sy < H + 20) {
      g.fillStyle = '#0b0c10'; g.fillRect(fx0 + 2, sy - 13, measure(tag) + 6, 11);
      drawText(g, tag, fx0 + 5, sy - 12, { color: pal.accent[2] ?? '#ffd34d', shadow: null });
    }
  }
  // Act-4 gold trim
  if (s.act === 4) { g.fillStyle = '#d4a537'; g.fillRect(fx0, 0, 2, H); g.fillRect(fx1 - 2, 0, 2, H); }

  // ground
  if (toS(groundY) < H + 4) {
    const gy = toS(groundY);
    g.fillStyle = '#8f8f98'; g.fillRect(0, gy, W, H - gy + 2);
    g.fillStyle = '#a8a8b2'; g.fillRect(0, gy, W, 3);
    g.fillStyle = '#6c6c76'; g.fillRect(0, gy + 3, W, 1);
    for (let x = 0; x < W; x += 24) { g.fillStyle = '#7a7a84'; g.fillRect(x, gy + 14, 14, 1); }
    // hedge, bin, lamp post, car
    g.fillStyle = '#2f6a34'; g.fillRect(0, gy - 10, 74, 10); g.fillStyle = '#3e8a44'; g.fillRect(0, gy - 10, 74, 3);
    for (let x = 4; x < 74; x += 9) { g.fillStyle = '#4aa352'; g.fillRect(x, gy - 12, 4, 3); }
    g.fillStyle = '#4a5560'; g.fillRect(W - 112, gy - 6, 9, 6); g.fillStyle = '#6a7580'; g.fillRect(W - 112, gy - 7, 9, 2);
    g.fillStyle = '#2a3340'; g.fillRect(W - 60, gy - 60, 2, 60); g.fillRect(W - 62, gy - 62, 8, 3);
    g.fillStyle = '#c0262a'; g.fillRect(W - 168, gy - 14, 46, 10); g.fillStyle = '#e04545'; g.fillRect(W - 160, gy - 21, 28, 8);
    g.fillStyle = '#bfe0f0'; g.fillRect(W - 156, gy - 19, 10, 5); g.fillRect(W - 143, gy - 19, 10, 5);
    g.fillStyle = '#10131a'; g.fillRect(W - 164, gy - 5, 9, 5); g.fillRect(W - 134, gy - 5, 9, 5);
    // bystanders, mid-gasp
    if (s.k > 0.75 || s.landed >= 0) for (const bx of [W * 0.28, W * 0.7]) {
      g.fillStyle = '#26303c'; g.fillRect(bx, gy - 12, 6, 12); g.fillStyle = '#e8b996'; g.fillRect(bx + 1, gy - 16, 4, 4);
      g.fillStyle = '#f6f3ea'; g.fillRect(bx - 2, gy - 14 - (s.landed >= 0 ? 2 : 0), 2, 4); g.fillRect(bx + 6, gy - 14 - (s.landed >= 0 ? 2 : 0), 2, 4);
      g.fillStyle = '#6b4a2b'; g.fillRect(bx - 5, gy - 3 + (s.landed >= 0 ? 3 : 0), 4, 4);   // dropped coffee
    }
  }

  // speed streaks
  if (s.k > 0.05 && s.k < 0.95 && total > 70) {
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.45;
    for (let i = 0; i < 22; i++) {
      const x = Math.round(hash(i * 13 + 5) * W), y = Math.round((hash(i * 7 + 1) * H + s.t * 900 * (0.6 + hash(i) * 0.8)) % H);
      g.fillRect(x, y, 1, 10 + Math.round(hash(i * 3) * 18));
    }
    g.globalAlpha = 1;
  }

  // paper from the broken window
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const px = W / 2 + 8 + Math.sin(s.t * 3 + i) * 18 + i * 5, py = toS(-14 + ((s.t * 40 + i * 31) % 120));
    if (py > 0 && py < H) g.fillRect(Math.round(px), py, 3, 2);
  }

  // the victim
  const vx = Math.round(W / 2 + Math.sin(s.t * 9) * 3);
  const vyS = toS(vy);
  const gy = toS(groundY);
  if (s.landed < 0) {
    // tumbling about the body centre, drawn at 2x so the gag reads at this distance
    const b = s.victim.baked;
    if (b) { g.save(); g.translate(vx, vyS); g.rotate(s.rot); g.scale(2, 2); b.draw(g, 'thrown', 0, s.t, 0, 15); g.restore(); }
  } else {
    // splat on the pavement
    const sq = Math.min(1, s.landed * 10);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(vx - 14, gy + 1, 28, 2);
    if (s.gore === 2) { g.fillStyle = '#8a0f14'; ellipse(g, vx, gy + 4, 14 * sq + 2, 3, '#8a0f14'); g.fillStyle = '#c0262a'; g.fillRect(vx - 6, gy + 2, 3, 1); g.fillRect(vx + 4, gy + 4, 4, 1); }
    else if (s.gore === 1) { g.fillStyle = '#8a0f14'; ellipse(g, vx, gy + 4, 7 * sq + 1, 2, '#8a0f14'); }
    drawPuppet(g, s.victim, 'death1', 99, vx, gy + 4, { shadow: false, scale: 2 });
    // stars / paper confetti
    for (let i = 0; i < 5; i++) {
      const a = s.t * 5 + i * 1.26;
      g.fillStyle = s.gore === 0 ? '#ffffff' : '#ffe9a0';
      g.fillRect(Math.round(vx + Math.cos(a) * 13), Math.round(gy - 30 + Math.sin(a) * 3), s.gore === 0 ? 3 : 2, 2);
    }
  }
  void fxRng;
}

/** Floor number the victim is currently passing (for the HUD-style counter). */
export function floorAt(s: { floor: number; k: number; fallPx: number }): number {
  const y = s.fallPx * s.k;
  return Math.max(1, s.floor - Math.round(y / FH));
}

/** Immediate-mode jagged electric arc (cutscenes: the field's own arcs are frozen while the world is paused). */
export function zapLine(g: Ctx, x0: number, y0: number, x1: number, y1: number, big = true): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
  const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const k = i / n, j = i === n ? 0 : fxRng.range(-4, 4);
    const qx = x0 + (x1 - x0) * k + (nx / nl) * j, qy = y0 + (y1 - y0) * k + (ny / nl) * j;
    if (big) line(g, px, py, qx, qy, '#3aa8ff', 3);
    line(g, px, py, qx, qy, '#e8ffff', 1);
    px = qx; py = qy;
  }
}

/** A few bones over a dark silhouette: the classic electrocution x-ray frame. */
export function skeletonFrame(g: Ctx, x: number, y: number): void {
  const c = '#e8f6ff';
  line(g, x, y - 26, x, y - 10, c);                         // spine
  line(g, x - 4, y - 22, x + 4, y - 22, c); line(g, x - 5, y - 19, x + 5, y - 19, c); line(g, x - 4, y - 16, x + 4, y - 16, c);   // ribs
  line(g, x - 3, y - 10, x + 3, y - 10, c); line(g, x - 3, y - 10, x - 5, y, c); line(g, x + 3, y - 10, x + 5, y, c);               // pelvis + legs
  line(g, x - 4, y - 23, x - 8, y - 14, c); line(g, x + 4, y - 23, x + 8, y - 14, c);                                                // arms
  g.fillStyle = c; g.fillRect(x - 3, y - 33, 6, 6);          // skull
  g.fillStyle = '#102040'; g.fillRect(x - 2, y - 31, 1, 2); g.fillRect(x + 1, y - 31, 1, 2); g.fillRect(x - 1, y - 28, 2, 1);
}
