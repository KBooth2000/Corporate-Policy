// Humanoid rig: projects a body-space Pose into a screen-space skeleton for one view, then draws
// the body layers (legs, torso + outfit, arms) with consistent top-left lighting.
//
// Reusable by the boss artist: build a Proportions object (scale the PROPS values up), make a Pose
// with animPose() or by hand, call skeleton(), then drawLegs/drawTorso/drawArm/drawHeadLayer in
// the order used by drawFigure(). All drawing goes into a PixBuf; call outlineRect() afterwards.
import { PixBuf, Col, C, mixCol } from './pixbuf';
import type { Dress, Proportions, View, Ramp, RigId, BuildId } from './types';
import type { Pose, V3 } from './poses';
import { REFLECT, GOLD, SILVER } from './colours';
import { ramp } from './colours';

/** Base proportions per rig and build (1× scale). Visible height ≈ legLen + torsoH + headH + hair. */
export const PROPS: Record<RigId, Record<BuildId, Proportions>> = {
  A: {
    slim: { legLen: 9, torsoH: 10, shoulderW: 9, waistW: 7, hipW: 7, belly: 0, armT: 2, legT: 3, upperArm: 5, foreArm: 5, footL: 4, headW: 12, headH: 11 },
    average: { legLen: 8, torsoH: 10, shoulderW: 11, waistW: 9, hipW: 9, belly: 0, armT: 3, legT: 3, upperArm: 5, foreArm: 5, footL: 4, headW: 12, headH: 11 },
    heavy: { legLen: 8, torsoH: 10, shoulderW: 13, waistW: 14, hipW: 12, belly: 1, armT: 4, legT: 4, upperArm: 5, foreArm: 5, footL: 5, headW: 13, headH: 11 },
  },
  B: {
    slim: { legLen: 9, torsoH: 9, shoulderW: 8, waistW: 6, hipW: 8, belly: 0, armT: 2, legT: 3, upperArm: 5, foreArm: 4, footL: 4, headW: 11, headH: 11 },
    average: { legLen: 8, torsoH: 9, shoulderW: 9, waistW: 7, hipW: 10, belly: 0, armT: 2, legT: 3, upperArm: 5, foreArm: 4, footL: 4, headW: 11, headH: 11 },
    heavy: { legLen: 8, torsoH: 10, shoulderW: 12, waistW: 12, hipW: 13, belly: 1, armT: 3, legT: 4, upperArm: 5, foreArm: 5, footL: 5, headW: 12, headH: 11 },
  },
};

export type P2 = [number, number];

export interface TorsoRow { y: number; l: number; r: number }

/** Screen-space skeleton for one view. Index 0 = right limb (weapon hand), 1 = left limb. */
export interface Skel {
  view: View;
  /** Feet origin in buffer coordinates. */
  ox: number; oy: number;
  hip: P2; sh: P2;
  shJ: [P2, P2]; el: [P2, P2]; ha: [P2, P2]; haD: [number, number];
  hiJ: [P2, P2]; kn: [P2, P2]; ft: [P2, P2]; ftD: [number, number];
  head: { x: number; y: number; w: number; h: number };
  rows: TorsoRow[];
  /** Torso width at the shoulders in this view. */
  tw: number;
  prop: Proportions;
}

const KZ = 0.35; // forward depth → screen y in front/back views (3/4 camera)
const KX = 0.3;  // lateral depth → screen y in side views

/** Project body-space (x right, y up, z forward) into screen offsets + depth (larger = nearer camera). */
export function project(view: View, x: number, y: number, z: number): [number, number, number] {
  if (view === 'front') return [-x, -y + z * KZ, z];
  if (view === 'back') return [x, -y - z * KZ, -z];
  return [z, -y + x * KX, x];
}

function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function len(a: V3): number { return Math.hypot(a[0], a[1], a[2]); }

/** 3D two-bone IK: joint position between a and b with bone lengths l1, l2, bending towards `pole`. */
export function ik(a: V3, b: V3, l1: number, l2: number, pole: V3): V3 {
  const ab = sub(b, a);
  const d = Math.max(0.001, len(ab));
  const dir: V3 = [ab[0] / d, ab[1] / d, ab[2] / d];
  if (d >= l1 + l2 - 0.01) return [a[0] + dir[0] * l1 * d / (l1 + l2), a[1] + dir[1] * l1 * d / (l1 + l2), a[2] + dir[2] * l1 * d / (l1 + l2)];
  const ad = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - ad * ad));
  const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2];
  let p: V3 = [pole[0] - dir[0] * pd, pole[1] - dir[1] * pd, pole[2] - dir[2] * pd];
  const pl = len(p);
  if (pl < 0.001) p = [0, 0, -1]; else p = [p[0] / pl, p[1] / pl, p[2] / pl];
  return [a[0] + dir[0] * ad + p[0] * h, a[1] + dir[1] * ad + p[1] * h, a[2] + dir[2] * ad + p[2] * h];
}

/**
 * Build the screen skeleton for a pose. (ox, oy) is the feet origin in the buffer.
 */
export function skeleton(pr: Proportions, pose: Pose, view: View, ox: number, oy: number): Skel {
  const P = (v: V3): P2 => { const s = project(view, v[0], v[1], v[2]); return [ox + s[0], oy + s[1]]; };
  const D = (v: V3): number => project(view, v[0], v[1], v[2])[2];
  const r = pose.root;
  const hipY = pr.legLen - pose.crouch + r[1];
  const hip: V3 = [r[0], hipY, r[2]];
  const shc: V3 = [r[0] + pose.sway, hipY + pr.torsoH - pose.bend, r[2] + pose.lean];
  const shHalf = Math.max(1, pr.shoulderW / 2 - pr.armT / 2 + 0.5);
  const hipHalf = Math.max(1, pr.hipW / 2 - pr.legT / 2);
  const shJ: V3[] = [[shc[0] + shHalf, shc[1] - 1, shc[2]], [shc[0] - shHalf, shc[1] - 1, shc[2]]];
  const hands: V3[] = [
    [shJ[0][0] + pose.armR[0], shJ[0][1] + pose.armR[1], shJ[0][2] + pose.armR[2]],
    [shJ[1][0] - pose.armL[0], shJ[1][1] + pose.armL[1], shJ[1][2] + pose.armL[2]],
  ];
  const elbows: V3[] = [
    ik(shJ[0], hands[0], pr.upperArm, pr.foreArm, pose.limp ? [1, 0.2, 0] : [0.7, -0.2, -1]),
    ik(shJ[1], hands[1], pr.upperArm, pr.foreArm, pose.limp ? [-1, 0.2, 0] : [-0.7, -0.2, -1]),
  ];
  const hiJ: V3[] = [[hip[0] + hipHalf, hipY, hip[2]], [hip[0] - hipHalf, hipY, hip[2]]];
  const feet: V3[] = [
    [r[0] + hipHalf + pose.legR[0], Math.max(0, r[1] + pose.legR[1]), r[2] + pose.legR[2]],
    [r[0] - hipHalf - pose.legL[0], Math.max(0, r[1] + pose.legL[1]), r[2] + pose.legL[2]],
  ];
  const half = pr.legLen / 2;
  const knees: V3[] = [ik(hiJ[0], feet[0], half, half, [0.15, 0, 1]), ik(hiJ[1], feet[1], half, half, [-0.15, 0, 1])];

  const hipS = P(hip), shS = P(shc);
  // torso rows
  const side = view === 'side';
  const tw = side ? Math.max(6, Math.round(pr.shoulderW * 0.72)) : pr.shoulderW;
  const y0 = Math.round(shS[1]), y1 = Math.round(hipS[1]);
  const rows: TorsoRow[] = [];
  const H = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / H;
    const cx = shS[0] + (hipS[0] - shS[0]) * t;
    let w: number;
    if (side) {
      const sw = tw, ww = Math.max(5, Math.round(pr.waistW * 0.78)), hw = Math.max(5, Math.round(pr.hipW * 0.66));
      w = t < 0.55 ? sw + (ww - sw) * (t / 0.55) : ww + (hw - ww) * ((t - 0.55) / 0.45);
      w += pr.belly * 1.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 0.7)));
    } else {
      w = t < 0.55 ? pr.shoulderW + (pr.waistW - pr.shoulderW) * (t / 0.55) : pr.waistW + (pr.hipW - pr.waistW) * ((t - 0.55) / 0.45);
      w += pr.belly * 2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.35) / 0.65)));
    }
    let wi = Math.round(w);
    if (y === y0) wi -= 2;
    let l: number;
    if (side) {
      // back edge stays straight; the belly pushes the front out
      const back = Math.round(cx - tw / 2);
      l = back; if (y === y0) l += 1;
    } else l = Math.round(cx - wi / 2);
    rows.push({ y, l, r: l + wi - 1 });
  }
  const hw = view === 'side' ? pr.headW - 1 : pr.headW;
  const hcx = shS[0] + project(view, pose.head[0], 0, pose.head[2])[0] + (side ? 1 : 0);
  const hy = Math.round(shS[1] + project(view, 0, pose.head[1], pose.head[2])[1]);
  const head = { x: Math.round(hcx - hw / 2), y: hy - pr.headH, w: hw, h: pr.headH };
  return {
    view, ox, oy, hip: hipS, sh: shS,
    shJ: [P(shJ[0]), P(shJ[1])], el: [P(elbows[0]), P(elbows[1])], ha: [P(hands[0]), P(hands[1])], haD: [D(hands[0]), D(hands[1])],
    hiJ: [P(hiJ[0]), P(hiJ[1])], kn: [P(knees[0]), P(knees[1])], ft: [P(feet[0]), P(feet[1])], ftD: [D(feet[0]), D(feet[1])],
    head, rows, tw, prop: pr,
  };
}

/** Darker ramp for limbs on the far side of the body. */
export function farRamp(r: Ramp): Ramp {
  return { hex: r.hex, hi: r.lt, lt: r.base, base: mixCol(r.base, r.sh, 0.6), sh: r.sh, dk: r.dk };
}

const rd = Math.round;

// ---------------------------------------------------------------------------------------------
// Legs

export function drawLeg(b: PixBuf, sk: Skel, i: 0 | 1, d: Dress, far: boolean): void {
  const pr = sk.prop;
  const pants = far ? farRamp(d.legs.main) : d.legs.main;
  const skinR = far ? farRamp(d.skin) : d.skin;
  const lowerR = d.legs.kind === 'skirt' || d.legs.kind === 'shorts' ? (d.legs.tights ? (far ? farRamp(d.legs.tights) : d.legs.tights) : skinR) : pants;
  const upperR = d.legs.kind === 'skirt' ? lowerR : pants;
  const t = d.legs.kind === 'skirt' ? Math.max(2, pr.legT - 1) : pr.legT;
  const [hx, hy] = sk.hiJ[i], [kx, ky] = sk.kn[i], [fx, fy] = sk.ft[i];
  b.limb(hx, hy, kx, ky, t, upperR.lt, upperR.base, upperR.sh);
  b.limb(kx, ky, fx, fy - 1, t, lowerR.lt, lowerR.base, lowerR.sh);
  if (d.legs.kind === 'jeans' && sk.view !== 'side') b.over(rd(kx) - (i === 0 ? 0 : 0), rd(ky), pants.lt);
  // shoes
  const sh = far ? farRamp(d.shoes) : d.shoes;
  const X = rd(fx), Y = rd(fy);
  if (sk.view === 'side') {
    const L = pr.footL;
    b.hline(X - 1, X + L - 2, Y, sh.base);
    b.hline(X - 1, X + L - 3, Y - 1, sh.lt);
    b.set(X + L - 2, Y - 1, sh.base);
    b.set(X - 1, Y, sh.sh);
    if (d.heels) { b.set(X - 1, Y, sh.dk); b.set(X + L - 2, Y, sh.sh); }
    else b.hline(X, X + L - 2, Y, sh.base);
  } else {
    const w = Math.max(2, pr.legT);
    const x0 = X - Math.floor((w - 1) / 2) + (sk.view === 'front' ? (i === 0 ? -0 : 0) : 0);
    b.hline(x0, x0 + w - 1, Y - 1, sh.lt);
    b.hline(x0, x0 + w - 1, Y, sh.base);
    b.set(x0 + w - 1, Y, sh.sh);
    if (sk.view === 'front') b.set(x0, Y - 1, sh.hi);
    if (d.heels && sk.view === 'front') b.set(x0 + (i === 0 ? 0 : w - 1), Y, sh.dk);
  }
}

/** Skirt panel over the thighs (drawn after the legs). */
export function drawSkirt(b: PixBuf, sk: Skel, d: Dress): void {
  if (d.legs.kind !== 'skirt') return;
  const r = d.legs.main;
  const pr = sk.prop;
  const top = sk.rows[sk.rows.length - 1];
  const len = Math.max(3, Math.round(pr.legLen * 0.55));
  const cx = (top.l + top.r) / 2;
  const w0 = top.r - top.l + 1;
  for (let j = 0; j <= len; j++) {
    const w = sk.view === 'side' ? w0 + Math.floor(j / 2) : w0 + Math.floor(j / 2) * 2;
    let l = rd(cx - w / 2), rr = l + w - 1;
    if (sk.view === 'side') { l = top.l; rr = top.l + w - 1; }
    for (let x = l; x <= rr; x++) {
      const c = j === len ? r.sh : x === l ? r.lt : x >= rr - 0 ? r.sh : (x - l) % 3 === 2 && j > 1 ? mixCol(r.base, r.sh, 0.5) : r.base;
      b.set(x, top.y + j, c);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Torso + outfit

/** Map lateral u ∈ [-1, 1] on torso row index ri to a pixel x (front/back: screen-left = -1). */
export function tx(sk: Skel, ri: number, u: number): number {
  const row = sk.rows[Math.max(0, Math.min(sk.rows.length - 1, ri))];
  return rd(row.l + ((u + 1) / 2) * (row.r - row.l));
}
/** Centre column of a torso row (for even widths, the right-of-centre pixel is cx). */
export function tcx(sk: Skel, ri: number): number {
  const row = sk.rows[Math.max(0, Math.min(sk.rows.length - 1, ri))];
  return row.l + Math.floor((row.r - row.l + 1) / 2);
}

function inTorso(sk: Skel, ri: number, x: number): boolean {
  const row = sk.rows[ri];
  return !!row && x >= row.l && x <= row.r;
}

/**
 * Torso fill + outfit details + overlays. `ri` rows are indexed from the shoulder line down.
 */
export function drawTorso(b: PixBuf, sk: Skel, d: Dress): void {
  const top = d.top;
  const m = top.main;
  const n = sk.rows.length;
  const view = sk.view;
  const tucked = top.kind === 'shirt' || top.kind === 'blouse' || top.kind === 'polo';
  // base fill with lighting
  for (let ri = 0; ri < n; ri++) {
    const { y, l, r } = sk.rows[ri];
    for (let x = l; x <= r; x++) {
      let c = m.base;
      if (ri === 0) c = m.lt;
      else if (x === l) c = view === 'back' ? m.base : m.lt;
      else if (x === r) c = m.sh;
      else if (x === r - 1 && r - l > 6 && view !== 'side') c = mixCol(m.base, m.sh, 0.5);
      if (ri === n - 1) c = tucked && !top.scruffy ? d.legs.main.dk : m.sh;
      b.set(x, y, c);
    }
  }
  // patterns
  if (top.pattern !== 'none') {
    for (let ri = 1; ri < n - 1; ri++) {
      const { y, l, r } = sk.rows[ri];
      for (let x = l + 1; x < r; x++) {
        let hit = false;
        if (top.pattern === 'pinstripe') hit = (x - l) % 3 === 1;
        else if (top.pattern === 'check') hit = ((x >> 1) + (y >> 1)) % 2 === 0;
        else if (top.pattern === 'knit') hit = (x + y) % 2 === 0 && ri % 2 === 0;
        else if (top.pattern === 'stripe') hit = ri % 3 === 1;
        if (hit) b.set(x, y, top.pattern === 'pinstripe' ? mixCol(m.base, m.lt, 0.55) : top.pattern === 'stripe' ? m.lt : mixCol(m.base, m.sh, 0.55));
      }
    }
  }
  if (view === 'back') drawTorsoBack(b, sk, d);
  else drawTorsoFront(b, sk, d);
  drawOverlay(b, sk, d);
  // Act 4 gold trim on collar and hem
  if (d.flair.trim !== null && view !== 'back') {
    const r0 = sk.rows[0], rl = sk.rows[n - 1];
    b.set(r0.l, r0.y, d.flair.trim); b.set(r0.r, r0.y, d.flair.trim);
    for (let x = rl.l; x <= rl.r; x += 2) b.set(x, rl.y, d.flair.trim);
  }
}

function collar(b: PixBuf, sk: Skel, c: Col, cs: Col): void {
  const cx = tcx(sk, 0), y = sk.rows[0].y;
  if (sk.view === 'side') {
    const r = sk.rows[0].r;
    b.set(r - 1, y, c); b.set(r - 2, y, c); b.set(r - 1, y + 1, cs);
    return;
  }
  b.set(cx - 3, y, c); b.set(cx - 2, y, c); b.set(cx + 1, y, c); b.set(cx + 2, y, c);
  b.set(cx - 2, y + 1, cs); b.set(cx + 1, y + 1, cs);
}

function tie(b: PixBuf, sk: Skel, t: Ramp, scruffy: boolean, pin: boolean): void {
  const n = sk.rows.length;
  const y0 = sk.rows[0].y;
  if (sk.view === 'side') {
    const ri = 1;
    const x = sk.rows[ri].r;
    for (let k = 0; k < Math.min(n - 3, 6); k++) b.set(sk.rows[ri + k].r - (k > 3 ? 0 : 0), sk.rows[ri + k].y, k === 0 ? t.lt : t.base);
    void x;
    return;
  }
  const cx = tcx(sk, 0) - 1;
  const off = scruffy ? 1 : 0;
  b.set(cx + off, y0, t.lt); b.set(cx + 1 + off, y0, t.base);
  const end = Math.min(n - 2, scruffy ? n - 3 : n - 2);
  for (let ri = 1; ri < end; ri++) {
    const y = sk.rows[ri].y;
    const o = scruffy && ri < 3 ? 1 : 0;
    b.set(cx + o, y, ri === 1 ? t.base : t.lt);
    b.set(cx + 1 + o, y, t.sh);
  }
  b.set(cx, sk.rows[end].y, t.sh);
  if (pin) { b.set(cx, sk.rows[Math.min(4, end - 1)].y, C(GOLD)); }
}

function buttons(b: PixBuf, sk: Skel, c: Col, from = 1, to = -1, step = 2): void {
  const n = sk.rows.length;
  const end = to < 0 ? n - 1 : to;
  for (let ri = from; ri < end; ri += step) {
    const x = sk.view === 'side' ? sk.rows[ri].r - 1 : tcx(sk, ri) - 1;
    b.set(x, sk.rows[ri].y, c);
  }
}

/** Jacket-style V opening showing the under-shirt (and tie). */
function vOpening(b: PixBuf, sk: Skel, d: Dress, depth: number, lapel: boolean): void {
  const m = d.top.main, u = d.top.under;
  if (sk.view === 'side') {
    for (let ri = 0; ri < depth; ri++) {
      const row = sk.rows[ri];
      const w = Math.max(0, 2 - Math.floor(ri / 2));
      for (let k = 0; k < w; k++) b.set(row.r - k, row.y, k === 0 ? u.base : u.lt);
      if (lapel) b.set(row.r - w, row.y, m.lt);
    }
    if (d.top.tie) for (let ri = 1; ri < depth; ri++) b.set(sk.rows[ri].r, sk.rows[ri].y, d.top.tie.base);
    return;
  }
  for (let ri = 0; ri < depth; ri++) {
    const row = sk.rows[ri];
    const cx = tcx(sk, ri);
    const half = Math.max(0, Math.round((depth - ri) * 0.55));
    for (let x = cx - half - 1; x <= cx + half; x++) if (x >= row.l && x <= row.r) b.set(x, row.y, x === cx - half - 1 ? u.lt : u.base);
    if (lapel) {
      b.set(cx - half - 2, row.y, m.hi);
      b.set(cx + half + 1, row.y, m.sh);
    }
  }
  if (d.top.tie) tie(b, sk, d.top.tie, d.top.scruffy, d.flair.tiePin);
  else {
    const cx = tcx(sk, 0);
    b.set(cx - 1, sk.rows[0].y, d.skin.sh); b.set(cx, sk.rows[0].y, d.skin.sh);
  }
}

function drawTorsoFront(b: PixBuf, sk: Skel, d: Dress): void {
  const top = d.top, m = top.main, u = top.under;
  const n = sk.rows.length;
  const side = sk.view === 'side';
  const y0 = sk.rows[0].y;
  const cx = tcx(sk, 0);
  const neck = () => { if (!side) { b.set(cx - 1, y0, d.skin.sh); b.set(cx, y0, d.skin.sh); } else b.set(sk.rows[0].r - 1, y0, d.skin.sh); };
  switch (top.kind) {
    case 'shirt':
      if (top.tie) { collar(b, sk, u.hi, m.sh); tie(b, sk, top.tie, top.scruffy, d.flair.tiePin); }
      else { neck(); collar(b, sk, m.hi, m.sh); buttons(b, sk, m.sh, 2); }
      if (!side) b.set(tx(sk, 2, 0.55), sk.rows[2].y, m.sh); // pocket
      break;
    case 'blouse':
      neck(); collar(b, sk, m.hi, m.lt);
      if (top.tie) { b.set(cx - 1, y0 + 1, top.tie.base); b.set(cx, y0 + 1, top.tie.base); b.set(cx - 2, y0 + 1, top.tie.lt); b.set(cx + 1, y0 + 1, top.tie.sh); }
      buttons(b, sk, m.lt, 3, -1, 2);
      break;
    case 'polo':
      neck(); collar(b, sk, m.hi, m.sh);
      if (!side) { b.set(cx - 1, y0 + 1, m.sh); b.set(cx - 1, y0 + 2, m.dk); }
      if (top.print === 'logo' && !side) b.set(tx(sk, 2, 0.55), sk.rows[2].y, u.base);
      break;
    case 'tee': case 'jumper': case 'turtleneck': case 'hoodie': {
      if (top.kind === 'turtleneck') {
        if (!side) { for (let x = cx - 2; x <= cx + 1; x++) { b.set(x, y0 - 1, m.lt); b.set(x, y0, m.base); } }
        else { b.set(sk.rows[0].r - 1, y0 - 1, m.lt); b.set(sk.rows[0].r - 2, y0 - 1, m.lt); }
      } else if (top.kind === 'hoodie') {
        if (!side) {
          for (let x = cx - 3; x <= cx + 2; x++) b.set(x, y0, m.hi);
          b.set(cx - 1, y0, d.skin.sh); b.set(cx, y0, d.skin.sh);
          b.set(cx - 2, y0 + 1, u.hi); b.set(cx - 2, y0 + 2, u.hi); b.set(cx + 1, y0 + 1, u.hi); b.set(cx + 1, y0 + 2, u.hi);
          const py = sk.rows[Math.max(0, n - 4)].y;
          for (let x = tx(sk, n - 4, -0.5); x <= tx(sk, n - 4, 0.5); x++) b.set(x, py, m.sh);
        } else {
          b.set(sk.rows[0].l, y0 - 1, m.lt); b.set(sk.rows[0].l + 1, y0 - 1, m.lt); b.set(sk.rows[0].l, y0, m.lt);
        }
      } else if (top.kind === 'jumper') {
        if (top.tie || top.under) { if (!side) { b.set(cx - 2, y0, u.hi); b.set(cx + 1, y0, u.hi); } }
        neck();
        // ribbed hem
        const hr = sk.rows[n - 2];
        for (let x = hr.l; x <= hr.r; x++) if (x % 2 === 0) b.set(x, hr.y, m.sh);
      } else {
        neck();
        if (!side) { b.set(cx - 2, y0, m.sh); b.set(cx + 1, y0, m.sh); }
      }
      drawPrint(b, sk, d);
      break;
    }
    case 'cardigan': {
      // open front over a shirt/blouse
      for (let ri = 0; ri < n - 1; ri++) {
        const row = sk.rows[ri];
        const c = side ? row.r - 1 : tcx(sk, ri);
        const half = side ? 0 : 1;
        for (let x = c - half; x <= c + half - 1 + (side ? 1 : 1); x++) if (x >= row.l && x <= row.r) b.set(x, row.y, ri === 0 ? u.hi : u.base);
        if (!side) { b.set(c - half - 1, row.y, m.sh); if (ri % 2 === 1) b.set(c + half + 1, row.y, m.hi); }
      }
      if (top.tie && !side) tie(b, sk, top.tie, false, d.flair.tiePin);
      else neck();
      break;
    }
    case 'blazer': case 'suit':
      vOpening(b, sk, d, Math.max(4, Math.round(n * 0.6)), true);
      if (!side) {
        b.set(tcx(sk, Math.round(n * 0.6)) - 1, sk.rows[Math.min(n - 2, Math.round(n * 0.6))].y, m.dk);
        if (d.flair.pocketSquare !== null) { b.set(tx(sk, 2, 0.6), sk.rows[2].y, d.flair.pocketSquare); b.set(tx(sk, 2, 0.6) + 1, sk.rows[2].y, d.flair.pocketSquare); }
        // jacket hem flares slightly over the trousers
        const lr = sk.rows[n - 1];
        b.set(lr.l - 0, lr.y + 1, m.sh); b.set(lr.r, lr.y + 1, m.sh);
      }
      break;
    case 'waistcoat':
      vOpening(b, sk, d, Math.max(3, Math.round(n * 0.45)), false);
      buttons(b, sk, m.dk, Math.round(n * 0.45), n - 1, 2);
      break;
    case 'gilet': {
      // puffer: quilting lines and a zip
      for (let ri = 2; ri < n - 1; ri += 3) {
        const row = sk.rows[ri];
        for (let x = row.l + 1; x < row.r; x++) b.set(x, row.y, m.sh);
      }
      if (!side) {
        for (let ri = 0; ri < n - 1; ri++) b.set(tcx(sk, ri) - 1, sk.rows[ri].y, m.hi);
        b.set(cx - 2, y0, m.hi); b.set(cx + 1, y0, m.hi);
        if (top.tie) { b.set(cx - 1, y0, top.tie.base); }
        else { b.set(cx - 1, y0, u.hi); b.set(cx, y0, u.hi); }
      } else for (let ri = 0; ri < n - 1; ri++) b.set(sk.rows[ri].r - 1, sk.rows[ri].y, m.hi);
      break;
    }
    case 'quarterzip': {
      if (!side) {
        for (let x = cx - 2; x <= cx + 1; x++) b.set(x, y0 - 1, m.lt);
        b.set(cx - 1, y0, u.hi); b.set(cx, y0, u.hi);
        for (let ri = 0; ri < Math.min(n - 1, 4); ri++) b.set(cx - 1, sk.rows[ri].y, ri === 0 ? u.hi : C(SILVER));
        b.set(cx, sk.rows[1].y, C(SILVER));
      } else {
        b.set(sk.rows[0].r - 1, y0 - 1, m.lt); b.set(sk.rows[0].r - 2, y0 - 1, m.lt);
        for (let ri = 0; ri < Math.min(n - 1, 4); ri++) b.set(sk.rows[ri].r - 1, sk.rows[ri].y, C(SILVER));
      }
      const hr = sk.rows[n - 2];
      for (let x = hr.l; x <= hr.r; x++) if (x % 2 === 1) b.set(x, hr.y, m.sh);
      break;
    }
    case 'boilersuit': case 'workjacket': {
      collar(b, sk, m.hi, m.sh);
      for (let ri = 1; ri < n - 1; ri++) b.set(side ? sk.rows[ri].r - 1 : cx - 1, sk.rows[ri].y, m.sh);
      if (!side) {
        const px = tx(sk, 2, 0.55);
        b.set(px, sk.rows[2].y, m.dk); b.set(px + 1, sk.rows[2].y, m.dk); b.set(px, sk.rows[3].y, m.sh); b.set(px + 1, sk.rows[3].y, m.sh);
        if (top.kind === 'workjacket') { const qx = tx(sk, 2, -0.55); b.set(qx, sk.rows[2].y, m.dk); b.set(qx - 1, sk.rows[2].y, m.dk); }
      }
      if (top.kind === 'boilersuit') {
        const br = sk.rows[Math.round(n * 0.7)];
        for (let x = br.l; x <= br.r; x++) b.set(x, br.y, m.dk);
      }
      break;
    }
    case 'dress':
      neck();
      if (!side) { b.set(cx - 2, y0, d.skin.sh); b.set(cx + 1, y0, d.skin.sh); }
      {
        const br = sk.rows[Math.round(n * 0.6)];
        for (let x = br.l; x <= br.r; x++) b.set(x, br.y, top.under.dk);
      }
      break;
    case 'tabard': {
      // tunic over a shirt: shirt shows at the shoulders/sides
      for (let ri = 0; ri < n - 1; ri++) {
        const row = sk.rows[ri];
        b.set(row.l, row.y, u.lt);
        if (!side) b.set(row.r, row.y, u.sh);
      }
      neck();
      if (!side) { const px = tx(sk, n - 4, 0); for (let x = px - 2; x <= px + 1; x++) b.set(x, sk.rows[n - 4].y, m.sh); }
      break;
    }
  }
}

function drawTorsoBack(b: PixBuf, sk: Skel, d: Dress): void {
  const top = d.top, m = top.main;
  const n = sk.rows.length;
  const y0 = sk.rows[0].y;
  const cx = tcx(sk, 0);
  // collar / hood at the back of the neck
  if (top.kind === 'hoodie') {
    for (let x = cx - 3; x <= cx + 2; x++) { b.set(x, y0, m.lt); b.set(x, y0 + 1, x === cx - 3 ? m.lt : m.base); }
    for (let x = cx - 2; x <= cx + 1; x++) b.set(x, y0 + 2, m.sh);
  } else if (top.kind === 'turtleneck' || top.kind === 'quarterzip') {
    for (let x = cx - 2; x <= cx + 1; x++) b.set(x, y0 - 1, m.lt);
  } else if (top.kind !== 'tee' && top.kind !== 'dress' && top.kind !== 'jumper') {
    for (let x = cx - 2; x <= cx + 1; x++) b.set(x, y0, top.kind === 'shirt' || top.kind === 'polo' || top.kind === 'blouse' ? m.hi : m.lt);
  }
  if (top.kind === 'gilet') for (let ri = 2; ri < n - 1; ri += 3) { const row = sk.rows[ri]; for (let x = row.l + 1; x < row.r; x++) b.set(x, row.y, m.sh); }
  if (top.kind === 'blazer' || top.kind === 'suit') { for (let ri = Math.round(n * 0.6); ri < n; ri++) b.set(tcx(sk, ri) - 1, sk.rows[ri].y, m.sh); }
  // centre seam shading
  for (let ri = 2; ri < n - 1; ri += 1) if (ri % 3 === 0) b.set(tcx(sk, ri) - 1, sk.rows[ri].y, mixCol(m.base, m.sh, 0.4));
}

function drawPrint(b: PixBuf, sk: Skel, d: Dress): void {
  const pr = d.top.print;
  if (pr === 'none' || sk.view === 'back') return;
  const n = sk.rows.length;
  const ri = Math.min(n - 3, 3);
  const y = sk.rows[ri].y;
  const x = sk.view === 'side' ? sk.rows[ri].r - 3 : tcx(sk, ri) - 1;
  const c = d.top.under.hi, c2 = d.top.under.base;
  if (pr === 'power') {
    // the "have you tried turning it off" power glyph
    b.set(x, y - 1, c); b.set(x, y, c2);
    b.set(x - 1, y, c); b.set(x + 1, y, c); b.set(x - 1, y + 1, c); b.set(x + 1, y + 1, c); b.set(x, y + 2, c);
    if (sk.view !== 'side') { b.set(x - 2, y + 3, c2); b.set(x, y + 3, c2); b.set(x + 2, y + 3, c2); }
  } else if (pr === 'logo') {
    b.set(x, y, c); b.set(x + 1, y, c); b.set(x, y + 1, c2); b.set(x + 1, y + 1, c);
  } else if (pr === 'heart') {
    b.set(x - 1, y, c); b.set(x + 1, y, c); b.set(x - 1, y + 1, c); b.set(x, y + 1, c); b.set(x + 1, y + 1, c); b.set(x, y + 2, c); b.set(x, y, c2);
  } else if (pr === 'star') {
    b.set(x, y, c); b.set(x - 1, y + 1, c); b.set(x, y + 1, c); b.set(x + 1, y + 1, c); b.set(x, y + 2, c);
  } else if (pr === 'stripe') {
    const row = sk.rows[ri];
    for (let xx = row.l + 1; xx < row.r; xx++) b.set(xx, y, c);
  }
}

function drawOverlay(b: PixBuf, sk: Skel, d: Dress): void {
  const ov = d.top.overlay;
  if (ov === 'none' || !d.top.overlayCol) return;
  const o = d.top.overlayCol;
  const n = sk.rows.length;
  const view = sk.view;
  const refl = C(REFLECT), reflSh = C('#9aa6b0');
  if (ov === 'hivis' || ov === 'hivis_orange') {
    // vest: everything except the sleeves and an open collar
    for (let ri = 0; ri < n - 1; ri++) {
      const row = sk.rows[ri];
      const cx = view === 'side' ? row.r - 1 : tcx(sk, ri);
      for (let x = row.l; x <= row.r; x++) {
        if (view === 'front' && ri < 3 && (x === cx - 1 || x === cx)) continue;
        if (view === 'side' && ri < 2 && x >= row.r - 1) continue;
        const c = x === row.l && view !== 'back' ? o.lt : x === row.r ? o.sh : ri === 0 ? o.lt : o.base;
        b.set(x, row.y, c);
      }
      if (view === 'front') b.set(cx - 1 + (ri >= 3 ? 0 : 0), row.y, ri >= 3 ? o.sh : b.get(cx - 1, row.y));
    }
    for (const t of [0.42, 0.74]) {
      const ri = Math.round((n - 1) * t);
      const row = sk.rows[ri];
      for (let x = row.l; x <= row.r; x++) b.set(x, row.y, x === row.r ? reflSh : refl);
    }
    if (view !== 'side') {
      for (let ri = 0; ri < Math.round((n - 1) * 0.42); ri++) {
        b.set(tx(sk, ri, -0.55), sk.rows[ri].y, refl);
        b.set(tx(sk, ri, 0.55), sk.rows[ri].y, reflSh);
      }
    }
  } else if (ov === 'sash') {
    // company-values sash: shoulder to opposite hip, with gold stars
    const gold = C(GOLD);
    for (let ri = 0; ri < n; ri++) {
      const row = sk.rows[ri];
      const t = ri / Math.max(1, n - 1);
      const u = view === 'back' ? 0.85 - t * 1.7 : -0.85 + t * 1.7;
      const x = view === 'side' ? Math.round(row.l + (row.r - row.l) * (0.2 + t * 0.6)) : tx(sk, ri, u);
      for (let k = -1; k <= 1; k++) {
        const xx = x + k;
        if (!inTorso(sk, ri, xx)) continue;
        b.set(xx, row.y, k === -1 ? o.lt : k === 1 ? o.sh : o.base);
      }
      if (ri % 3 === 1) b.set(x, row.y, gold);
    }
  } else if (ov === 'apron') {
    for (let ri = 2; ri < n; ri++) {
      const row = sk.rows[ri];
      const cx = view === 'side' ? row.r - 1 : tcx(sk, ri);
      const hw = view === 'side' ? 1 : Math.max(2, Math.floor((row.r - row.l) / 2) - 1);
      for (let x = cx - hw; x <= cx + hw - 1; x++) b.set(x, row.y, x === cx - hw ? o.lt : o.base);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Arms

export function drawArm(b: PixBuf, sk: Skel, i: 0 | 1, d: Dress, far: boolean, gloves: Ramp | null): void {
  const pr = sk.prop;
  const sl = far ? farRamp(d.top.sleeve) : d.top.sleeve;
  const sk2 = far ? farRamp(d.skin) : d.skin;
  const [sx, sy] = sk.shJ[i], [ex, ey] = sk.el[i], [hx, hy] = sk.ha[i];
  const t = pr.armT;
  b.limb(sx, sy, ex, ey, t, sl.lt, sl.base, sl.sh);
  const len = d.top.sleeveLen;
  if (len === 'long') {
    b.limb(ex, ey, hx, hy, t, sl.lt, sl.base, sl.sh);
    // cuff
    const cx = rd(hx + (ex - hx) * 0.25), cy = rd(hy + (ey - hy) * 0.25);
    b.over(cx, cy, d.flair.trim !== null ? d.flair.trim : sl.sh);
  } else {
    const fr = sk2;
    b.limb(ex, ey, hx, hy, Math.max(2, t - (t > 2 ? 1 : 0)), fr.lt, fr.base, fr.sh);
    if (len === 'rolled') b.limb(ex, ey, ex + (hx - ex) * 0.25, ey + (hy - ey) * 0.25, t, sl.hi, sl.lt, sl.base);
    else b.set(rd(ex), rd(ey), sl.sh);
  }
  // watch on the left wrist
  if (i === 1 && d.acc.watch > 0 && (len !== 'long' || d.acc.watch >= 2)) {
    const wx = rd(hx + (ex - hx) * 0.3), wy = rd(hy + (ey - hy) * 0.3);
    const wc = d.acc.watch === 3 ? C(GOLD) : d.acc.watch === 2 ? C(SILVER) : C('#3a3a44');
    b.set(wx, wy, wc);
    if (d.acc.watch === 3) b.set(wx + (sk.view === 'front' ? 1 : -1), wy, C('#fff2c0'));
  }
  // hand
  const hr = gloves ? (far ? farRamp(gloves) : gloves) : sk2;
  const X = rd(hx), Y = rd(hy);
  const s = t >= 4 ? 3 : 2;
  const x0 = X - Math.floor(s / 2), y0 = Y - Math.floor(s / 2);
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    b.set(x0 + xx, y0 + yy, yy === 0 && xx === 0 ? hr.lt : xx === s - 1 || yy === s - 1 ? hr.sh : hr.base);
  }
}

export { ramp };
