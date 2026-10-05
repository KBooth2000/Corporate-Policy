// Baking (spec 10.1): every frame of one individual is rasterised into a single atlas canvas plus a
// white-flash silhouette atlas, once, then draw() is a single drawImage (plus a transform only when
// mirrored/rotated/squashed). Frames are trimmed and shelf-packed; identical poses are shared.
import type { AnimName, BakedCharacter, CharacterLook, DrawOpts } from '../characters';
import { ANIMS, LOOPING } from '../characters';
import { PixBuf, C, outlineRect, toCanvas, rotateInto, mixCol } from './pixbuf';
import { animPose, TIMING, Pose, PoseCtx } from './poses';
import { drawFigure, resetStampPool } from './figure';
import { resolveDress } from './look';
import type { Dress, View } from './types';
import { OUT } from './colours';
import { BLOOD, OUTLINE } from '../palette';
import { makeCanvas, ctx2d, Ctx } from '../../render/canvas';
import { skeleton, drawLeg, drawTorso, drawArm } from './rig';
import { drawHead } from './head';
import { drawLanyard, drawFlair } from './items';

/** Scratch cell: 64×60 with the feet origin at (32, 50). */
export const CELL_W = 64, CELL_H = 60, CELL_OX = 32, CELL_OY = 50;
const ATLAS_W = 1024;
const ATLAS_MAX_H = 2048;

interface FrameRec {
  sx: number; sy: number; w: number; h: number;
  /** Feet origin inside the frame. */
  ox: number; oy: number;
  /** Weapon hand relative to the feet. */
  hx: number; hy: number; behind: boolean;
  /** Head centre relative to the feet (for exec victims / barks). */
  headX: number; headY: number;
  lying: boolean;
}

const VIEWS: View[] = ['front', 'side', 'back'];
/** Anims whose frames may repeat exactly (no per-frame pulse): shared cells. */
const SHARE = new Set<AnimName>();

// Reused work buffers (allocated once).
let scratchA: PixBuf | null = null, scratchB: PixBuf | null = null, fxA: PixBuf | null = null, fxB: PixBuf | null = null;
let atlasBuf: PixBuf | null = null;
let atlasImg: ImageData | null = null;
function work(): { A: PixBuf; B: PixBuf; FA: PixBuf; FB: PixBuf; AT: PixBuf; img: ImageData } {
  if (!scratchA) {
    scratchA = new PixBuf(CELL_W, CELL_H, true); scratchB = new PixBuf(CELL_W, CELL_H, true);
    fxA = new PixBuf(CELL_W, CELL_H); fxB = new PixBuf(CELL_W, CELL_H);
    // the atlas raster IS the ImageData's memory: upload is a single putImageData, no copy
    atlasImg = ctx2d(makeCanvas(1, 1)).createImageData(ATLAS_W, ATLAS_MAX_H);
    atlasBuf = new PixBuf(ATLAS_W, ATLAS_MAX_H, false, atlasImg.data.buffer as ArrayBuffer);
  }
  return { A: scratchA!, B: scratchB!, FA: fxA!, FB: fxB!, AT: atlasBuf!, img: atlasImg! };
}

function poseCtx(d: Dress, look: CharacterLook): PoseCtx {
  return { carry: d.carry, blinks: look.kind !== 'enemy', heavy: d.build === 'heavy' };
}

/** Facing → view (+ mirror) for a pose with a `turn`. dir 0 down, 1 right, 2 up, 3 left. */
function viewFor(dir: number, turn: number): { view: View; flip: boolean } {
  const d = (((dir + turn) % 4) + 4) % 4;
  if (d === 0) return { view: 'front', flip: false };
  if (d === 2) return { view: 'back', flip: false };
  return { view: 'side', flip: d === 3 };
}

/** Render one frame (pose, base dir 0..2) into scratch B (+ fx). Returns hand/head info in cell coords. */
function renderFrame(d: Dress, pose: Pose, dir: number, f: number, n: number, cache: Map<string, PixBuf>) {
  const { A, B, FA, FB } = work();
  A.clear(); FA.clear(); B.clear(); FB.clear();
  let { view, flip } = viewFor(dir, pose.turn);
  if (pose.view) { view = pose.view; flip = !!pose.flip; }
  const sk = drawFigure(A, FA, d, pose, view, CELL_OX, CELL_OY, { f, n, cache });
  let hx = sk.ha[0][0] - CELL_OX, hy = sk.ha[0][1] - CELL_OY;
  let headX = sk.head.x + sk.head.w / 2 - CELL_OX, headY = sk.head.y + sk.head.h / 2 - CELL_OY;
  let behind = view === 'back' ? true : view === 'front' ? sk.haD[0] < -1.5 : false;
  const rot = ((pose.rot % 4) + 4) % 4;
  if (rot === 0 && !flip) {
    return { buf: A, fx: FA, hx, hy, headX, headY, behind, lying: false };
  }
  // rotate/mirror the finished figure around the pivot; forward shift follows the facing
  const px = CELL_OX, py = CELL_OY - pose.pivot;
  const fsx = dir === 1 ? 1 : dir === 0 ? 0 : dir === 2 ? 0 : -1;
  const fsy = dir === 0 ? 0.5 : dir === 2 ? -0.5 : 0;
  const qx = Math.round(CELL_OX + pose.shift[0] * fsx), qy = Math.round(CELL_OY - pose.shift[1] + pose.shift[0] * fsy);
  // when this is the base 'side' view the drawn figure faces right; head-back for supine = left.
  const q = rot;
  rotateInto(A, B, q, flip, px, py, qx, qy);
  rotateInto(FA, FB, q, flip, px, py, qx, qy);
  const tp = (x: number, y: number): [number, number] => {
    const rx = flip ? -x : x, ry = y + pose.pivot;
    let ox: number, oy: number;
    if (q === 0) { ox = rx; oy = ry; } else if (q === 1) { ox = -ry; oy = rx; } else if (q === 2) { ox = -rx; oy = -ry; } else { ox = ry; oy = -rx; }
    return [qx - CELL_OX + ox, qy - CELL_OY + oy];
  };
  [hx, hy] = tp(hx, hy);
  [headX, headY] = tp(headX, headY);
  if (rot) behind = false;
  return { buf: B, fx: FB, hx, hy, headX, headY, behind, lying: rot === 1 || rot === 3 };
}

export interface BakeStats { ms: number; frames: number; unique: number; atlasW: number; atlasH: number; render: number; upload: number; extras: number }
export let lastBakeStats: BakeStats = { ms: 0, frames: 0, unique: 0, atlasW: 0, atlasH: 0, render: 0, upload: 0, extras: 0 };

export interface BakedCharacterEx extends BakedCharacter {
  /** Head centre relative to the feet for a frame (attach execution victims, bark bubbles). */
  head(anim: AnimName, dir: number, t: number): { x: number; y: number };
  /** Frame index for an anim at time t (useful for gameplay events on specific frames). */
  frameAt(anim: AnimName, t: number): number;
  atlas: HTMLCanvasElement;
  flashAtlas: HTMLCanvasElement;
  dress: Dress;
}

let drawShadows = true;
/** Enable/disable the built-in feet shadow drawn by draw() (if gameplay draws its own using shadowW). */
export function setCharacterShadows(on: boolean): void { drawShadows = on; }

// Shared scratch for tint/rage compositing.
let tintCanvas: HTMLCanvasElement | null = null, tintCtx: Ctx | null = null;
function tintScratch(): [HTMLCanvasElement, Ctx] {
  if (!tintCanvas) { tintCanvas = makeCanvas(CELL_W + 4, CELL_H + 4); tintCtx = ctx2d(tintCanvas); }
  return [tintCanvas!, tintCtx!];
}
const shadowCache = new Map<number, HTMLCanvasElement>();
function shadowSprite(w: number): HTMLCanvasElement {
  let c = shadowCache.get(w);
  if (!c) {
    const h = Math.max(3, Math.round(w / 4));
    c = makeCanvas(w, h);
    const g = ctx2d(c);
    const rx = w / 2, ry = h / 2;
    for (let y = 0; y < h; y++) {
      const t = 1 - ((y + 0.5 - ry) * (y + 0.5 - ry)) / (ry * ry);
      if (t <= 0) continue;
      const span = rx * Math.sqrt(t);
      const x0 = Math.round(rx - span), x1 = Math.round(rx + span);
      g.fillStyle = 'rgba(8,10,20,0.32)';
      g.fillRect(x0, y, x1 - x0, 1);
      if (x1 - x0 > 4) { g.fillStyle = 'rgba(8,10,20,0.14)'; g.fillRect(x0 + 2, y, x1 - x0 - 4, 1); }
    }
    shadowCache.set(w, c);
  }
  return c;
}

export function bakeImpl(look: CharacterLook): BakedCharacterEx {
  const t0 = performance.now();
  const d = resolveDress(look);
  const ctx = poseCtx(d, look);
  const { AT, img } = work();
  resetStampPool();
  const frames: FrameRec[] = [];
  const index = {} as Record<AnimName, number[][]>;
  const dedupe = new Map<string, number>();
  const stamps = new Map<string, PixBuf>();
  let cx = 0, cy = 0, rowH = 0;
  let usedH = 0;
  // clear only what we'll use (previous bake's used height)
  AT.d.fill(0, 0, ATLAS_W * Math.min(ATLAS_MAX_H, lastUsedH + 2));
  let total = 0;
  for (const anim of ANIMS) {
    const n = TIMING[anim].length;
    const perDir: number[][] = [];
    const poses: Pose[] = [];
    for (let f = 0; f < n; f++) poses.push(animPose(anim, f, ctx));
    for (let dir = 0; dir < 3; dir++) {
      const list: number[] = [];
      for (let f = 0; f < n; f++) {
        total++;
        const p = poses[f];
        // identical frames (same pose, no glow pulse) share one atlas cell
        const pulse = (d.lanyard?.glow != null && p.glow > 0) || d.flair.sparkle;
        const k = pulse || !SHARE.has(anim) ? '' : dir + '|' + anim + f;
        const hit = k ? dedupe.get(k) : undefined;
        if (hit !== undefined) { list.push(hit); continue; }
        const r = renderFrame(d, p, dir, f, n, stamps);
        const buf = r.buf, fxb = r.fx;
        const bx0 = Math.min(buf.bx0, fxb.bx0), by0 = Math.min(buf.by0, fxb.by0);
        const bx1 = Math.max(buf.bx1, fxb.bx1), by1 = Math.max(buf.by1, fxb.by1);
        let rec: FrameRec;
        if (bx1 < bx0) {
          rec = { sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0, hx: r.hx, hy: r.hy, behind: r.behind, headX: r.headX, headY: r.headY, lying: r.lying };
        } else {
          const w = bx1 - bx0 + 3, h = by1 - by0 + 3;
          if (cx + w + 1 > ATLAS_W) { cx = 0; cy += rowH + 1; rowH = 0; }
          if (cy + h > ATLAS_MAX_H) throw new Error('character atlas overflow');
          // outline inside the small (cache-friendly) scratch, then memcpy rows into the atlas
          const ox0 = Math.max(0, buf.bx0 - 1), oy0 = Math.max(0, buf.by0 - 1);
          if (buf.bx1 >= buf.bx0) outlineRect(buf, ox0, oy0, Math.min(CELL_W - 1, buf.bx1 + 1) - ox0 + 1, Math.min(CELL_H - 1, buf.by1 + 1) - oy0 + 1, OUT);
          const sx0 = bx0 - 1, sy0 = by0 - 1; // frame rect origin in scratch space (may be -1 at edges)
          const AD = AT.d, SD = buf.d;
          for (let j = 0; j < h; j++) {
            const sy = sy0 + j;
            const drow = (cy + j) * ATLAS_W + cx;
            if (sy < 0 || sy >= CELL_H) { for (let x = 0; x < w; x++) AD[drow + x] = 0; continue; }
            const srow = sy * CELL_W + sx0;
            for (let x = 0; x < w; x++) { const X = sx0 + x; AD[drow + x] = X >= 0 && X < CELL_W ? SD[srow + x] : 0; }
          }
          // FX go on top, but only over empty pixels (never over the body or its outline)
          if (fxb.bx1 >= fxb.bx0) {
            const dx = cx - sx0, dy = cy - sy0;
            for (let y = fxb.by0; y <= fxb.by1; y++) {
              const so = y * CELL_W, doff = (y + dy) * ATLAS_W + dx;
              for (let x = fxb.bx0; x <= fxb.bx1; x++) {
                const e = fxb.d[so + x];
                if (e >>> 24 && !(AT.d[doff + x] >>> 24)) AT.d[doff + x] = e;
              }
            }
          }
          rec = { sx: cx, sy: cy, w, h, ox: CELL_OX - sx0, oy: CELL_OY - sy0, hx: r.hx, hy: r.hy, behind: r.behind, headX: r.headX, headY: r.headY, lying: r.lying };
          cx += w + 1;
          rowH = Math.max(rowH, h);
          usedH = Math.max(usedH, cy + rowH + 1);
        }
        const idx = frames.length;
        frames.push(rec);
        if (k) dedupe.set(k, idx);
        list.push(idx);
      }
      perDir.push(list);
    }
    index[anim] = perDir;
  }
  const t1 = performance.now();
  lastUsedH = usedH;
  const H = Math.max(1, usedH);
  const atlas = makeCanvas(ATLAS_W, H);
  ctx2d(atlas).putImageData(img, 0, 0, 0, 0, ATLAS_W, H);
  // white flash silhouette, composited on the GPU (no per-pixel JS)
  const flashAtlas = tintAtlas(atlas, '#ffffff');
  const t2 = performance.now();
  const portrait = makePortrait(d, ctx, 24, 24);
  const gibs = makeGibs(d, look);
  const t3 = performance.now();
  const durations = {} as Record<AnimName, number>;
  for (const a of ANIMS) durations[a] = TIMING[a].reduce((s, v) => s + v, 0);
  const idle = frames[index.idle[0][0]];
  const height = Math.max(20, idle.oy - 1);
  const shadowW = d.build === 'heavy' ? 18 : d.build === 'slim' ? 12 : 14;
  let rageAtlas: HTMLCanvasElement | null = null;

  const frameAt = (anim: AnimName, t: number): number => {
    const tm = TIMING[anim];
    const dur = durations[anim];
    let tt = t;
    if (LOOPING.has(anim)) { tt = ((t % dur) + dur) % dur; } else if (tt >= dur) return tm.length - 1;
    if (tt < 0) tt = 0;
    for (let i = 0; i < tm.length; i++) { if (tt < tm[i]) return i; tt -= tm[i]; }
    return tm.length - 1;
  };
  const recFor = (anim: AnimName, dir: number, t: number): FrameRec => {
    const dd = dir === 3 ? 1 : ((dir % 4) + 4) % 4;
    const list = (index[anim] ?? index.idle)[dd === 3 ? 1 : dd];
    return frames[list[frameAt(anim, t)]];
  };

  const blitCell = (g: Ctx, img: CanvasImageSource, rec: FrameRec, x: number, y: number, mirror: boolean, o: DrawOpts | undefined) => {
    const rot = o?.rot ?? 0, sq = o?.squash ?? 1;
    if (!rot && sq === 1 && !mirror) {
      g.drawImage(img, rec.sx, rec.sy, rec.w, rec.h, x - rec.ox, y - rec.oy, rec.w, rec.h);
      return;
    }
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale((mirror ? -1 : 1) * (sq === 1 ? 1 : Math.max(0.5, 2 - sq)), sq);
    g.drawImage(img, rec.sx, rec.sy, rec.w, rec.h, -rec.ox, -rec.oy, rec.w, rec.h);
    g.restore();
  };

  const baked: BakedCharacterEx = {
    look, height, portrait, gibs, shadowW, atlas, flashAtlas, dress: d,
    duration: (anim) => durations[anim] ?? 0.6,
    frameAt,
    hand(anim, dir, t) {
      const r = recFor(anim, dir, t);
      return { x: dir === 3 ? -r.hx : r.hx, y: r.hy, behind: r.behind };
    },
    head(anim, dir, t) {
      const r = recFor(anim, dir, t);
      return { x: dir === 3 ? -r.headX : r.headX, y: r.headY };
    },
    draw(g, anim, dir, t, x0, y0, o) {
      const rec = recFor(anim, dir, t);
      const x = Math.round(x0), y = Math.round(y0);
      const mirror = dir === 3;
      const alpha = o?.alpha ?? 1;
      if (alpha <= 0) return;
      const prevA = g.globalAlpha;
      if (drawShadows && anim !== 'grabbed' && anim !== 'thrown' && anim !== 'sit') {
        const sw = rec.lying ? shadowW + 12 : shadowW;
        const s = shadowSprite(sw);
        g.globalAlpha = prevA * alpha;
        g.drawImage(s, x - (sw >> 1), y - (s.height >> 1) - (rec.lying ? 4 : 0));
      }
      if (o?.rage) {
        if (!rageAtlas) rageAtlas = tintAtlas(flashAtlas, '#ff3a2a');
        const pulse = 0.45 + 0.25 * Math.sin(t * 18);
        g.globalAlpha = prevA * alpha * pulse;
        blitCell(g, rageAtlas, rec, x - 1, y, mirror, o);
        blitCell(g, rageAtlas, rec, x + 1, y, mirror, o);
        blitCell(g, rageAtlas, rec, x, y - 1, mirror, o);
        blitCell(g, rageAtlas, rec, x, y + 1, mirror, o);
      }
      g.globalAlpha = prevA * alpha;
      blitCell(g, atlas, rec, x, y, mirror, o);
      if (o?.tint && (o.tintAmt ?? 0) > 0) {
        const [tc, tg] = tintScratch();
        tg.globalCompositeOperation = 'copy';
        tg.drawImage(flashAtlas, rec.sx, rec.sy, rec.w, rec.h, 0, 0, rec.w, rec.h);
        tg.globalCompositeOperation = 'source-in';
        tg.fillStyle = o.tint;
        tg.fillRect(0, 0, rec.w, rec.h);
        tg.globalCompositeOperation = 'source-over';
        g.globalAlpha = prevA * alpha * Math.min(1, o.tintAmt ?? 0);
        blitCell(g, tc, { ...rec, sx: 0, sy: 0 }, x, y, mirror, o);
      }
      if (o?.rage && !o.tint) {
        if (!rageAtlas) rageAtlas = tintAtlas(flashAtlas, '#ff3a2a');
        g.globalAlpha = prevA * alpha * 0.14;
        blitCell(g, rageAtlas, rec, x, y, mirror, o);
      }
      if (o?.flash && o.flash > 0) {
        g.globalAlpha = prevA * alpha * Math.min(1, o.flash);
        blitCell(g, flashAtlas, rec, x, y, mirror, o);
      }
      g.globalAlpha = prevA;
    },
  };
  lastBakeStats = { ms: performance.now() - t0, frames: total, unique: frames.length, atlasW: ATLAS_W, atlasH: usedH, render: t1 - t0, upload: t2 - t1, extras: t3 - t2 };
  return baked;
}
let lastUsedH = ATLAS_MAX_H;


function tintAtlas(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Portrait & gibs

function portraitPose(ctx: PoseCtx): Pose {
  const p = animPose('idle', 0, ctx);
  p.holdL = false;
  p.armL = [1, -9, 0];
  return p;
}

/** Head-and-shoulders crop (front view), outlined. */
export function makePortrait(d: Dress, ctx: PoseCtx, w: number, h: number): HTMLCanvasElement {
  const big = new PixBuf(CELL_W, CELL_H + 10, true);
  const pose = portraitPose(ctx);
  const sk = drawFigure(big, null, { ...d, held: null }, pose, 'front', CELL_OX, CELL_OY + 10, { f: 0, n: 4 });
  const tall = d.hairStyle === 'afro' || d.hairStyle === 'headwrap' || d.hairStyle === 'bun' || d.worn.some((x) => x.startsWith('hardhat'));
  const top = sk.head.y - (tall ? 5 : 3);
  const cxh = Math.round(sk.head.x + sk.head.w / 2);
  const out = new PixBuf(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = big.get(cxh - Math.floor(w / 2) + x, top + y);
    if (c >>> 24) out.d[(y + 1) * out.w + x + 1] = c;
  }
  outlineRect(out, 0, 0, out.w, out.h - 1, OUT);
  return toCanvas(out, 1, 1, w, h);
}

function bloodStump(b: PixBuf, x: number, y: number, w: number, horizontal = true): void {
  const B0 = C(BLOOD[0]), B1 = C(BLOOD[1]), B2 = C(BLOOD[2]), B3 = C(BLOOD[3]), bone = C('#efe6d8');
  if (horizontal) {
    for (let i = 0; i < w; i++) { b.set(x + i, y, i === 0 ? B3 : B1); b.set(x + i, y + 1, i % 2 ? B2 : B0); }
    if (w >= 3) b.set(x + Math.floor(w / 2), y, bone);
    b.set(x + 1, y + 2, B2);
  } else {
    for (let i = 0; i < w; i++) { b.set(x, y + i, i === 0 ? B3 : B1); b.set(x + 1, y + i, i % 2 ? B2 : B0); }
  }
}

function gibCanvas(b: PixBuf): HTMLCanvasElement {
  // crop to content + outline
  const x0 = Math.max(0, b.bx0 - 1), y0 = Math.max(0, b.by0 - 1), x1 = Math.min(b.w - 1, b.bx1 + 1), y1 = Math.min(b.h - 1, b.by1 + 1);
  if (x1 < x0) return makeCanvas(2, 2);
  outlineRect(b, x0, y0, x1 - x0 + 1, y1 - y0 + 1, OUT);
  return toCanvas(b, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/** Gib sprites: [head, torso, armL, armR, legL, legR] in the individual's skin/outfit with blood stumps. */
export function makeGibs(d: Dress, look: CharacterLook): HTMLCanvasElement[] {
  const ctx = poseCtx(d, look);
  const out: HTMLCanvasElement[] = [];
  const nd: Dress = { ...d, lanyard: d.lanyard ? { ...d.lanyard, glow: null } : null };
  // head
  {
    const b = new PixBuf(28, 28);
    const bx = { x: 8, y: 7, w: d.prop.headW, h: d.prop.headH };
    drawHead(b, nd, 'front', bx, 'dead', 0, false, false);
    const cx = bx.x + Math.floor(bx.w / 2) - 2;
    bloodStump(b, cx, bx.y + bx.h, 4);
    out.push(gibCanvas(b));
  }
  const pose = animPose('idle', 0, ctx);
  pose.armR = [1, -9, 0]; pose.armL = [1, -9, 0]; pose.holdL = false;
  const sk = skeleton(d.prop, pose, 'front', 24, 34);
  // torso
  {
    const b = new PixBuf(48, 40);
    drawTorso(b, sk, nd);
    drawLanyard(b, sk, nd, 0);
    drawFlair(b, sk, nd);
    const r0 = sk.rows[0], rl = sk.rows[sk.rows.length - 1];
    bloodStump(b, Math.round((r0.l + r0.r) / 2) - 1, r0.y - 1, 3);
    b.set(r0.l, r0.y, C(BLOOD[1])); b.set(r0.r, r0.y, C(BLOOD[2]));
    for (let x = rl.l; x <= rl.r; x++) b.set(x, rl.y + 1, x % 3 === 0 ? C(BLOOD[3]) : C(BLOOD[1]));
    b.set(rl.l + 2, rl.y + 2, C(BLOOD[2]));
    out.push(gibCanvas(b));
  }
  // arms (L then R)
  for (const i of [1, 0] as const) {
    const b = new PixBuf(48, 40);
    drawArm(b, sk, i, nd, false, nd.worn.includes('gloves') ? nd.wornCol : null);
    const [sx, sy] = sk.shJ[i];
    bloodStump(b, Math.round(sx) - 1, Math.round(sy) - 2, Math.max(2, d.prop.armT));
    out.push(gibCanvas(b));
  }
  // legs (L then R)
  for (const i of [1, 0] as const) {
    const b = new PixBuf(48, 40);
    drawLeg(b, sk, i, nd, false);
    const [hx, hy] = sk.hiJ[i];
    bloodStump(b, Math.round(hx) - 1, Math.round(hy) - 2, Math.max(2, d.prop.legT));
    out.push(gibCanvas(b));
  }
  return out;
}

/** Larger portrait for intro cards (e.g. 64×64): a 32×32 head-and-shoulders crop scaled up by an integer. */
export function portraitLarge(look: CharacterLook, size: number): HTMLCanvasElement {
  const d = resolveDress(look);
  const ctx = poseCtx(d, look);
  // head-and-shoulders at an integer scale (64 → 21 px crop at 3×)
  const k = Math.max(1, Math.round(size / 22));
  const crop = Math.min(48, Math.floor(size / k));
  const small = makePortrait(d, ctx, crop, crop);
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  g.imageSmoothingEnabled = false;
  const off = Math.floor((size - crop * k) / 2);
  g.drawImage(small, 0, 0, crop, crop, off, off, crop * k, crop * k);
  return c;
}

export { mixCol, OUTLINE, VIEWS };
