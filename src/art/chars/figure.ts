// Figure assembly: draws one complete character frame (all ≤6 layers: body, outfit, head, hair,
// accessory, anchor item) for a pose and view, in the correct depth order, then the lanyard glow
// pass and the un-outlined FX layer (stars, steam, smear, sparks).
import { PixBuf, C, Col, mixCol } from './pixbuf';
import type { Dress, View, Ramp } from './types';
import type { Pose } from './poses';
import { skeleton, drawLeg, drawSkirt, drawTorso, drawArm, Skel, farRamp, tcx } from './rig';
import { drawHead, drawHair } from './head';
import { drawLanyard, drawFlair, drawBeltKit, drawBag, drawHeld, heldInFront, TAG_GLOW } from './items';
import { ramp } from './colours';

const rd = Math.round;

export interface FrameInfo {
  /** Frame index within the anim (drives pulses/sparkles). */
  f: number;
  n: number;
  /** Optional per-bake stamp cache: heads and torsos repeat across many frames. */
  cache?: Map<string, PixBuf>;
}

const STAMP = 64;
const SO = 24; // stamp origin offset

// Stamp buffers are pooled across bakes (no per-bake allocation).
const pool: PixBuf[] = [];
let poolUsed = 0;
/** Release all pooled stamps (called at the start of each bake). */
export function resetStampPool(): void { poolUsed = 0; }

function stampOf(cache: Map<string, PixBuf> | undefined, key: string, draw: (b: PixBuf) => void): PixBuf | null {
  if (!cache) return null;
  let s = cache.get(key);
  if (!s) {
    if (poolUsed >= pool.length) pool.push(new PixBuf(STAMP, STAMP, true));
    s = pool[poolUsed++];
    s.clear();
    draw(s);
    cache.set(key, s);
  }
  return s;
}

function xrayDress(d: Dress): Dress {
  const nv = ramp('#1c2a62');
  const top = { ...d.top, main: nv, sleeve: nv, under: nv, tie: null, pattern: 'none' as const, print: 'none' as const, overlay: 'none' as const, overlayCol: null };
  return {
    ...d, skin: nv, hair: nv, wrap: nv, top, legs: { kind: 'trousers', main: nv, tights: null }, shoes: nv, lanyard: null, held: null,
    worn: [], acc: { ...d.acc, glasses: 0, facial: 0, earbuds: false, earrings: false, watch: 0 },
    flair: { ...d.flair, rosette: false, crown: false, badges: 0, tiePin: false, pocketSquare: null, trim: null },
  };
}

function drawBones(b: PixBuf, sk: Skel): void {
  const bone = C('#eaf6ff'), joint = C('#bfe4ff');
  for (const i of [0, 1] as const) {
    b.line(sk.shJ[i][0], sk.shJ[i][1], sk.el[i][0], sk.el[i][1], bone);
    b.line(sk.el[i][0], sk.el[i][1], sk.ha[i][0], sk.ha[i][1], bone);
    b.set(rd(sk.el[i][0]), rd(sk.el[i][1]), joint);
    b.line(sk.hiJ[i][0], sk.hiJ[i][1], sk.kn[i][0], sk.kn[i][1], bone);
    b.line(sk.kn[i][0], sk.kn[i][1], sk.ft[i][0], sk.ft[i][1] - 1, bone);
  }
  const n = sk.rows.length;
  for (let ri = 0; ri < n; ri++) b.set(tcx(sk, ri) - 1, sk.rows[ri].y, bone);
  for (let ri = 2; ri < n - 3; ri += 2) {
    const row = sk.rows[ri];
    for (let x = row.l + 1; x < row.r; x++) b.set(x, row.y, x % 2 === 0 ? bone : joint);
  }
  const pr = sk.rows[n - 1];
  b.hline(pr.l + 1, pr.r - 1, pr.y - 1, bone);
}

/**
 * Draw one upright character frame into `b` (with optional fx buffer). (ox, oy) = feet origin.
 * Returns the skeleton (hand positions etc.).
 */
export function drawFigure(b: PixBuf, fx: PixBuf | null, d0: Dress, pose: Pose, view: View, ox: number, oy: number, fi: FrameInfo): Skel {
  const d = pose.xray ? xrayDress(d0) : d0;
  const sk = skeleton(d.prop, pose, view, ox, oy);
  const gloves: Ramp | null = d.worn.includes('gloves') ? d.wornCol : null;
  const held = pose.holdL ? d.held : null;
  const armBehind = (i: 0 | 1) => (view === 'side' ? i === 1 : sk.haD[i] < -1.5);
  const drawArmI = (i: 0 | 1) => {
    const far = view === 'side' && i === 1;
    drawArm(b, sk, i, d, far, gloves);
  };
  const drawItem = () => { if (held) drawHeld({ b, d, view, hand: sk.ha[1], sk, frame: fi.f, flip: view === 'back' }); };
  const itemFront = held ? heldInFront(held) : false;
  const hairBack = () => {
    if (!hasBackHair(d, view)) return;
    const hb = sk.head;
    const st = stampOf(fi.cache, 'hb' + view + hb.w + hb.h, (s) => drawHair(s, d, view, { x: SO, y: SO, w: hb.w, h: hb.h }, 'back', false, false));
    if (st) b.stamp(st, hb.x - SO, hb.y - SO);
    else drawHair(b, d, view, hb, 'back', pose.hairUp, false);
  };
  const headF = () => {
    const hb = sk.head;
    const st = stampOf(fi.cache, 'h' + view + pose.expr + (pose.hairUp ? 1 : 0) + (pose.xray ? 1 : 0) + hb.w + hb.h, (s) => drawHead(s, d, view, { x: SO, y: SO, w: hb.w, h: hb.h }, pose.expr, fi.f, pose.hairUp, pose.xray));
    if (st) b.stamp(st, hb.x - SO, hb.y - SO);
    else drawHead(b, d, view, sk.head, pose.expr, fi.f, pose.hairUp, pose.xray);
  };
  const torso = () => {
    const glowing = !!(d.lanyard && d.lanyard.glow !== null && pose.glow > 0);
    const r0 = sk.rows[0];
    let hsh = sk.rows.length * 31 + (glowing ? 7 : 0) + (pose.xray ? 13 : 0);
    for (let k = 0; k < sk.rows.length; k++) { const r = sk.rows[k]; hsh = (Math.imul(hsh, 0x9e3779b1) ^ ((r.l - r0.l + 64) | ((r.r - r0.l + 64) << 8))) >>> 0; }
    const key = 't' + view + hsh;
    const st = stampOf(fi.cache, key, (s) => {
      const tsk: Skel = { ...sk, rows: sk.rows.map((r) => ({ y: r.y - r0.y + SO, l: r.l - r0.l + SO, r: r.r - r0.l + SO })) };
      torsoLayers(s, tsk, d, pose.glow);
    });
    if (st) b.stamp(st, r0.l - SO, r0.y - SO);
    else torsoLayers(b, sk, d, pose.glow);
  };
  const golfBack = held === 'golf_club';

  if (view === 'side') {
    // far arm + its item (unless the item is held in front of the chest)
    drawArmI(1);
    if (!itemFront && !golfBack) drawItem();
    drawLeg(b, sk, 1, d, true);
    drawBag(b, sk, d, 'behind');
    hairBack();
    drawLeg(b, sk, 0, d, false);
    torso();
    if (golfBack) drawItem();
    headF();
    if (itemFront) drawItem();
    drawArmI(0);
  } else {
    const order: (0 | 1)[] = sk.haD[0] <= sk.haD[1] ? [0, 1] : [1, 0];
    for (const i of order) if (armBehind(i)) { drawArmI(i); if (i === 1 && !(view === 'back' && golfBack)) drawItem(); }
    if (view === 'front') hairBack();
    drawBag(b, sk, d, 'behind');
    drawLeg(b, sk, 0, d, false);
    drawLeg(b, sk, 1, d, false);
    torso();
    if (view === 'back') { drawBag(b, sk, d, 'over'); headF(); hairBack(); }
    else { drawBag(b, sk, d, 'over'); headF(); }
    for (const i of order) if (!armBehind(i)) { drawArmI(i); if (i === 1) drawItem(); }
    if (view === 'back' && golfBack && armBehind(1)) drawItem();
  }
  if (pose.xray) drawBones(b, sk);
  if (d.lanyard && d.lanyard.glow !== null && pose.glow > 0) glowPass(b, d.lanyard.glow, d.lanyard.glowAmt * pose.glow * (1 + 0.25 * Math.sin((fi.f / Math.max(1, fi.n)) * Math.PI * 2)));
  if (fx) drawFx(fx, b, d, pose, sk, fi, view);
  return sk;
}

function hasBackHair(d: Dress, view: View): boolean {
  return view !== 'side' && (d.hairStyle === 'long' || d.hairStyle === 'locs');
}

function torsoLayers(b: PixBuf, sk: Skel, d: Dress, glow: number): void {
  drawTorso(b, sk, d);
  drawSkirt(b, sk, d);
  drawBeltKit(b, sk, d);
  drawLanyard(b, sk, d, glow);
  drawFlair(b, sk, d);
}

const NBX = [-1, 1, 0, 0, -2, 2, 0, 0, -1, 1, -1, 1], NBY = [0, 0, -1, 1, 0, 0, -2, 2, -1, -1, 1, 1];
const glowSeen = new Uint8Array(64 * 64);
const glowTouched: number[] = [];

/** Brighten glowing pixels and spill light onto neighbouring pixels (cloth around the lanyard). */
function glowPass(b: PixBuf, glow: Col, amt: number): void {
  if (!b.mask || amt <= 0 || !b.tagged.length) return;
  const { w, h, d, mask } = b;
  const a1 = Math.min(0.85, amt) * 0.6, a2 = Math.min(0.45, amt * 0.5), a3 = Math.min(0.22, amt * 0.2);
  const seen = w * h <= glowSeen.length ? glowSeen : new Uint8Array(w * h);
  const touched = glowTouched;
  touched.length = 0;
  const list = b.tagged;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    if (seen[i] === 3 || mask[i] !== TAG_GLOW) continue;
    seen[i] = 3; touched.push(i);
    if (d[i] >>> 24) d[i] = mixCol(d[i], glow, a1);
  }
  const n = touched.length;
  // ring 1 (4-neighbours) then ring 2 (distance-2 cross + diagonals)
  for (let pass = 0; pass < 2; pass++) {
    const k0 = pass === 0 ? 0 : 4, k1 = pass === 0 ? 4 : 12, lvl = pass === 0 ? 2 : 1, a = pass === 0 ? a2 : a3;
    for (let t = 0; t < n; t++) {
      const i = touched[t];
      const x = i % w, y = (i / w) | 0;
      for (let k = k0; k < k1; k++) {
        const X = x + NBX[k], Y = y + NBY[k];
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (seen[j] >= lvl || mask[j] === TAG_GLOW || !(d[j] >>> 24)) continue;
        if (!seen[j]) touched.push(j);
        seen[j] = lvl;
        d[j] = mixCol(d[j], glow, a);
      }
    }
  }
  for (let t = 0; t < touched.length; t++) seen[touched[t]] = 0;
}

// ---------------------------------------------------------------------------------------------
// FX layer (not outlined)

function star(fx: PixBuf, x: number, y: number, c: Col, core: Col): void {
  fx.set(x, y, core); fx.set(x - 1, y, c); fx.set(x + 1, y, c); fx.set(x, y - 1, c); fx.set(x, y + 1, c);
}

function puff(fx: PixBuf, x: number, y: number, r: number, c: Col, a: number): void {
  const col = ((Math.round(a * 255) << 24) | (c & 0xffffff)) >>> 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 0.5) fx.set(x + i, y + j, col);
}

function alpha(c: Col, a: number): Col { return ((Math.round(a * 255) << 24) | (c & 0xffffff)) >>> 0; }

function drawFx(fx: PixBuf, b: PixBuf, d: Dress, pose: Pose, sk: Skel, fi: FrameInfo, view: View): void {
  const hx = sk.head.x + sk.head.w / 2, hy = sk.head.y;
  const fwd: [number, number] = view === 'side' ? [1, 0] : view === 'front' ? [0, 1] : [0, -1];
  for (const e of pose.fx) {
    if (e.startsWith('stars')) {
      const f = +e.slice(5);
      for (let k = 0; k < 3; k++) {
        const a = f * (Math.PI / 2) + (k * Math.PI * 2) / 3;
        star(fx, rd(hx + Math.cos(a) * 6), rd(hy - 2 + Math.sin(a) * 2), C('#fff0a8'), C('#ffffff'));
      }
    } else if (e.startsWith('sweat')) {
      const k = +e.slice(5);
      const x = rd(hx + (k === 1 ? -sk.head.w / 2 - 2 : sk.head.w / 2 + 1)), y = hy + 2 + k;
      fx.set(x, y, C('#d8f4ff')); fx.set(x, y + 1, C('#8ad0ff')); fx.set(x + (k === 2 ? 1 : 0), y - 1, alpha(C('#d8f4ff'), 0.6));
    } else if (e.startsWith('steam')) {
      const f = +e.slice(5);
      for (let k = 0; k < 3; k++) {
        const ph = (f + k * 1.4) % 4;
        const x = rd(hx - 4 + k * 4 + (k === 1 ? 0 : Math.sin(ph) * 1)), y = rd(hy - 1 - ph * 2.5);
        puff(fx, x, y, ph > 2.5 ? 2 : 1, C('#f2f2f2'), 0.75 - ph * 0.15);
      }
    } else if (e.startsWith('zap')) {
      const f = +e.slice(3);
      const zc = C('#9ff0ff'), zw = C('#ffffff');
      const pts = [[-10, -24], [9, -18], [-8, -8], [10, -30]];
      for (let k = 0; k < 2; k++) {
        const [px0, py0] = pts[(f + k * 2) % 4];
        let x = sk.ox + px0, y = sk.oy + py0;
        for (let s = 0; s < 4; s++) { const nx = x + (s % 2 ? 2 : -2), ny = y + 2; fx.line(x, y, nx, ny, s === 0 ? zw : zc); x = nx; y = ny; }
      }
    } else if (e === 'impact' || e === 'impact_big') {
      const big = e === 'impact_big';
      const cx = rd(sk.ha[0][0] + fwd[0] * 2), cy = sk.oy + (view === 'back' ? -1 : 0);
      const dc = C('#e6dccb');
      for (let k = -1; k <= 1; k++) puff(fx, cx + k * (big ? 5 : 3), cy - (k === 0 ? 1 : 0), big ? 2 : 1, dc, 0.7);
      if (big) { fx.set(cx - 8, cy - 3, alpha(dc, 0.6)); fx.set(cx + 8, cy - 3, alpha(dc, 0.6)); }
    } else if (e === 'dust') {
      const dc = C('#e6dccb');
      for (const k of [-12, -5, 4, 11]) puff(fx, sk.ox + k, sk.oy - 1, 1, dc, 0.55);
    } else if (e === 'blow') {
      const lc = alpha(C('#ffffff'), 0.6);
      for (const k of [-6, -1, 4]) fx.hline(sk.ox + 10, sk.ox + 15, sk.oy - 14 + k, lc);
    } else if (e.startsWith('cast')) {
      const f = +e.slice(4);
      const gc = d.fxCol, wc = C('#ffffff');
      const [ax, ay] = sk.ha[0], [bx2, by2] = sk.ha[1];
      const mx = rd((ax + bx2) / 2), my = rd((ay + by2) / 2);
      const offs = [[-4, -5], [5, -3], [0, -8], [-6, 1], [6, 2]];
      for (let k = 0; k < f + 1; k++) { const [ox2, oy2] = offs[(k + f) % offs.length]; star(fx, mx + ox2, my + oy2, gc, wc); }
    } else if (e.startsWith('smear')) {
      const f = +e.slice(5);
      ghost(fx, b, -fwd[0] * 4, -fwd[1] * 3, d.fxCol, f === 1 ? 0.5 : 0.35);
      ghost(fx, b, -fwd[0] * 8, -fwd[1] * 6, d.fxCol, f === 1 ? 0.25 : 0.15);
    }
  }
  if (d.held === 'laser' && pose.holdL && pose.glow > 0 && !pose.rot) {
    const [lx, ly] = sk.ha[1];
    const dot = view === 'side' ? [lx + 12, sk.oy - 2] : view === 'front' ? [lx + 4, sk.oy + 3] : null;
    if (dot) { fx.set(dot[0], dot[1], C('#ff4a3a')); fx.set(dot[0] - 1, dot[1], alpha(C('#ff4a3a'), 0.45)); fx.set(dot[0] + 1, dot[1], alpha(C('#ff4a3a'), 0.45)); fx.set(dot[0], dot[1] - 1, alpha(C('#ff4a3a'), 0.45)); }
  }
  if (d.flair.sparkle && pose.glow > 0) {
    const ph = fi.f % 4;
    const spots = [[-9, -24], [8, -28], [-7, -12], [9, -16]];
    const [sx, sy] = spots[ph];
    const g = C('#fff2b8');
    fx.set(sk.ox + sx, sk.oy + sy, C('#ffffff')); fx.set(sk.ox + sx - 1, sk.oy + sy, g); fx.set(sk.ox + sx + 1, sk.oy + sy, g); fx.set(sk.ox + sx, sk.oy + sy - 1, g); fx.set(sk.ox + sx, sk.oy + sy + 1, g);
  }
}

/** Translucent afterimage of the current figure silhouette, behind it (dash smear). */
function ghost(fx: PixBuf, b: PixBuf, dx: number, dy: number, c: Col, a: number): void {
  const col = alpha(c, a);
  for (let y = Math.max(0, b.by0); y <= Math.min(b.h - 1, b.by1); y++) {
    for (let x = Math.max(0, b.bx0); x <= Math.min(b.w - 1, b.bx1); x++) {
      if (!(b.d[y * b.w + x] >>> 24)) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= b.w || Y >= b.h) continue;
      if (b.d[Y * b.w + X] >>> 24) continue;
      if (fx.d[Y * fx.w + X] >>> 24) continue;
      fx.set(X - fx.tx, Y - fx.ty, col);
    }
  }
}

export { farRamp };
