// Act 1 boss art: Gordon Pike, Facilities Manager. Heavy build, navy boilersuit, hi-vis vest, hard hat,
// walrus moustache, key-bundle lanyard (Act 1 glow), tool belt, a giant pipe wrench — and a ride-on floor scrubber.
import { PixBuf, C } from '../chars/pixbuf';
import { ACT_GLOW, REFLECT } from '../chars/colours';
import { BossArt, AnimDef } from './bake';
import { FigSpec, FigPose, View, ITEMS, ramp, skinRamp, basePose, rod, R, walkLegs, P, mixCol, poly } from './fig';

const NAVY = ramp('#2f3d5c');
const LIME = ramp('#c8e83a');
const HAT = ramp('#f0c232');
const STEEL = ramp('#8e98a6');
const WRENCH_RED = ramp('#b8352c');
const BELT = ramp('#5a3a22');
const GREY_HAIR = ramp('#9a958c');
const TAN = ramp('#c0773a');
const BOOT = ramp('#3a2e26');
const GLOW = C(ACT_GLOW[1]);

// ------------------------------------------------------------------ items
ITEMS.wrench = (b, x, y, ang) => {
  // handle (red grip) then steel shaft then the jaw
  const g1 = rod(b, x - Math.cos(ang) * 5, y - Math.sin(ang) * 5, ang, 12, 5, WRENCH_RED);
  const g2 = rod(b, g1[0], g1[1], ang, 24, 5, STEEL);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const hx = g2[0], hy = g2[1];
  // jaw block
  const pts: P[] = [
    [hx - nx * 4 - Math.cos(ang) * 3, hy - ny * 4 - Math.sin(ang) * 3],
    [hx + nx * 8 - Math.cos(ang) * 3, hy + ny * 8 - Math.sin(ang) * 3],
    [hx + nx * 8 + Math.cos(ang) * 9, hy + ny * 8 + Math.sin(ang) * 9],
    [hx - nx * 4 + Math.cos(ang) * 9, hy - ny * 4 + Math.sin(ang) * 9],
  ];
  poly(b, pts, STEEL.sh);
  for (let k = 0; k < 4; k++) b.set(R(hx + nx * (k * 3 - 3) + Math.cos(ang) * 2), R(hy + ny * (k * 3 - 3) + Math.sin(ang) * 2), STEEL.lt);
  // hook jaw + adjuster knurl
  rod(b, hx + Math.cos(ang) * 9 - nx * 3, hy + Math.sin(ang) * 9 - ny * 3, ang + Math.PI / 2, 9, 4, STEEL);
  b.set(R(hx + nx * 5 + Math.cos(ang) * 4), R(hy + ny * 5 + Math.sin(ang) * 4), C('#b8352c'));
  b.set(R(hx + nx * 2), R(hy + ny * 2), STEEL.hi);
  b.set(R(hx + nx * 2 + Math.cos(ang) * 3), R(hy + ny * 2 + Math.sin(ang) * 3), STEEL.dk);
};

ITEMS.toolbox = (b, x, y, ang) => {
  void ang;
  const w = 16, h = 10;
  const x0 = R(x - w / 2), y0 = R(y - 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x0 + i, y0 + j, j === 0 ? C('#e85a3a') : j === h - 1 ? C('#6a1a14') : i === 0 ? C('#d84a30') : i === w - 1 ? C('#8a2a1e') : C('#b83a28'));
  b.hline(x0 + 1, x0 + w - 2, y0 + 3, C('#6a1a14'));
  b.hline(x0 + 5, x0 + 10, y0 - 2, STEEL.base); b.set(x0 + 5, y0 - 1, STEEL.base); b.set(x0 + 10, y0 - 1, STEEL.base);
  b.set(x0 + 7, y0 + 5, STEEL.hi); b.set(x0 + 8, y0 + 5, STEEL.base);
};

ITEMS.whistle = (b, x, y) => { b.rect(R(x) - 1, R(y) - 2, 4, 2, C('#d8dde4')); b.set(R(x) + 3, R(y) - 2, C('#8e98a6')); };

// ------------------------------------------------------------------ spec
export const FM_SPEC: FigSpec = {
  legLen: 21, torsoH: 22, shoulderW: 30, waistW: 31, hipW: 27, belly: 3, armT: 8, legT: 9, upperArm: 12, foreArm: 12, headW: 18, headH: 17, neck: 2,
  skin: skinRamp('#d99a78'), top: NAVY, sleeve: NAVY, under: ramp('#e8e4da'), tie: null, legs: NAVY, shoes: BOOT, hair: GREY_HAIR,
  gloves: TAN,
  face: { eyeGap: 3, brow: GREY_HAIR, browT: 2, moustache: ramp('#8a8178'), stubble: true, jaw: 'square', blush: true, wrinkles: true },
  hair_(b, hb, layer) {
    const { x, y, w, h, view } = hb;
    if (layer === 'back') return;
    // short grey hair visible under the hat
    if (view === 'front') { for (let k = 4; k < 9; k++) { b.set(x, y + k, GREY_HAIR.base); b.set(x + w - 1, y + k, GREY_HAIR.sh); } }
    else if (view === 'side') { for (let k = 4; k < 11; k++) for (let q = 0; q < 4; q++) b.set(x + q + (k > 8 ? 1 : 0), y + k, q === 0 ? GREY_HAIR.sh : GREY_HAIR.base); }
    else { for (let k = 4; k < h - 2; k++) for (let q = 0; q < w; q++) b.set(x + q, y + k, q === 0 ? GREY_HAIR.lt : q === w - 1 ? GREY_HAIR.sh : k === h - 3 ? GREY_HAIR.sh : (k === 6 && q % 4 === 1) ? GREY_HAIR.lt : GREY_HAIR.base); }
  },
  headDetail(b, hb) {
    // hard hat: dome + brim
    const { x, y, w, view } = hb;
    const cx = x + w / 2;
    const domeW = w + 2, domeH = 7;
    for (let j = 0; j < domeH; j++) {
      const half = Math.round((domeW / 2) * Math.sqrt(1 - ((domeH - j) / (domeH + 1)) ** 2)) + 1;
      for (let i = -half; i < half; i++) {
        const u = (i + half) / (2 * half);
        b.set(R(cx + i), y - 4 + j, j === 0 ? HAT.hi : u < 0.2 ? HAT.lt : u > 0.78 ? HAT.sh : HAT.base);
      }
    }
    // ridge
    if (view !== 'side') for (let j = 0; j < domeH - 1; j++) b.set(R(cx) - 1, y - 4 + j, HAT.hi);
    else for (let i = -4; i < 4; i++) b.set(R(cx + i), y - 3, HAT.hi);
    // brim
    const by = y - 4 + domeH;
    if (view === 'side') { b.hline(R(cx - domeW / 2), R(cx + domeW / 2 + 4), by, HAT.sh); b.hline(R(cx - domeW / 2), R(cx + domeW / 2 + 4), by + 1, HAT.dk); }
    else { b.hline(R(cx - domeW / 2 - 1), R(cx + domeW / 2), by, HAT.sh); b.hline(R(cx - domeW / 2 - 1), R(cx + domeW / 2), by + 1, HAT.dk); }
    if (view === 'front') { b.rect(R(cx) - 2, y - 1, 4, 3, C('#3a6ab0')); b.set(R(cx) - 1, y, C('#e8e4da')); }
  },
  torsoDetail(b, sk, f) {
    const view = sk.view;
    const rows = sk.rows;
    // hi-vis vest
    for (const row of rows) {
      const ry = row.y - rows[0].y;
      if (ry < 1) continue;
      for (let x = row.l; x <= row.r; x++) {
        const u = (x - row.l) / Math.max(1, row.r - row.l);
        const cx = view === 'front' ? (row.l + row.r) / 2 : view === 'back' ? -999 : -999;
        if (view === 'front' && Math.abs(x - cx) < 3) continue; // open vest shows the boilersuit
        let c = u < 0.15 ? LIME.lt : u < 0.65 ? LIME.base : u < 0.88 ? LIME.sh : LIME.dk;
        const t = ry / Math.max(1, rows.length - 1);
        if ((t > 0.42 && t < 0.52) || (t > 0.7 && t < 0.8)) c = u > 0.8 ? C('#a8b0b8') : C(REFLECT);
        b.set(x, row.y, c);
      }
    }
    // tool belt at the hips
    const last = rows[rows.length - 1];
    for (let y = last.y - 3; y <= last.y; y++) for (let x = last.l; x <= last.r; x++) b.set(x, y, y === last.y - 3 ? BELT.lt : y === last.y ? BELT.dk : BELT.base);
    const bx = view === 'side' ? last.l + 2 : last.r - 6;
    b.rect(bx, last.y - 2, 4, 6, C('#d0b040')); b.set(bx + 1, last.y, C('#2a2a2a')); // tape measure
    if (view !== 'back') { b.rect(view === 'side' ? last.r - 3 : last.l + 2, last.y - 1, 2, 7, BELT.dk); b.rect(view === 'side' ? last.r - 4 : last.l + 1, last.y + 5, 4, 2, STEEL.base); }
    // lanyard + keys (Act 1 glow)
    if (view === 'front') {
      const cx = R(sk.shC[0]), top = R(sk.shY);
      for (let k = 0; k < 9; k++) { b.set(cx - 4 + Math.round(k * 0.4), top + 1 + k, C('#3f8f9a')); b.set(cx + 4 - Math.round(k * 0.4), top + 1 + k, C('#3f8f9a')); }
      const ky = top + 11;
      b.set(cx, ky, GLOW); b.set(cx - 1, ky + 1, GLOW); b.set(cx + 1, ky + 1, GLOW);
      const swing = Math.round(Math.sin(f.frame * 1.7) * 1);
      for (const [dx, dy] of [[-2, 2], [0, 3], [2, 2], [1, 4]]) { b.set(cx + dx + swing, ky + dy, C('#d8dde4')); b.set(cx + dx + swing, ky + dy + 1, C('#8e98a6')); }
    } else if (view === 'side') {
      const fx = rows[3].r;
      b.set(fx, rows[6].y, GLOW); b.set(fx + 1, rows[7].y, C('#d8dde4')); b.set(fx + 1, rows[8].y, C('#8e98a6'));
    }
  },
  legDetail(b, sk) {
    // knee pads / boot cuffs
    for (const i of [0, 1] as const) { const k = sk.kn[i]; b.set(R(k[0]) - 1, R(k[1]), NAVY.dk); b.set(R(k[0]), R(k[1]) + 1, NAVY.dk); }
  },
};

// ------------------------------------------------------------------ poses
const FPS = 1;
function P0(): FigPose { const p = basePose(); p.expr = 'angry'; return p; }

function idle(f: number, v: View): FigPose {
  const p = P0();
  const br = Math.round(Math.sin((f / 4) * Math.PI * 2));
  p.crouch = br > 0 ? 1 : 0;
  p.legs = v === 'side' ? [[2, 0], [-2, 0]] : [[1, 0], [1, 0]];
  p.arms = v === 'side' ? [[2, -4], [-1, 18]] : [[-2, -6], [3, 17]];
  p.item = { kind: 'wrench', angle: v === 'side' ? -2.3 : v === 'front' ? -1.25 : -1.9 };
  p.expr = f === 3 ? 'blink' : 'angry';
  return p;
}

function walk(f: number, v: View, n: number): FigPose {
  const p = P0();
  const ph = f / n;
  p.legs = walkLegs(v, ph, 6, 4);
  p.crouch = Math.abs(Math.sin(ph * Math.PI * 2)) > 0.7 ? 0 : 1;
  const sw = Math.sin(ph * Math.PI * 2);
  p.arms = v === 'side' ? [[6 + sw * 2, 14], [-sw * 5, 17]] : [[4, 16], [3, 17 - Math.max(0, sw) * 2]];
  p.item = { kind: 'wrench', angle: v === 'side' ? 2.6 : 1.9 };
  p.lean = v === 'side' ? 2 : 0;
  return p;
}

function swingW(f: number, v: View): FigPose {
  const p = P0();
  const k = Math.min(1, (f + 1) / 3);
  p.expr = 'shout';
  p.crouch = 2;
  p.legs = v === 'side' ? [[6, 0], [-6, 0]] : [[3, 0], [3, 0]];
  p.lean = v === 'side' ? -3 * k : 0;
  if (v === 'side') { p.arms = [[-10 * k, -12 * k], [6, 8]]; p.item = { kind: 'wrench', angle: -2.6 - 0.3 * k }; p.arm0Behind = true; }
  else { p.arms = [[-6 * k, -16 * k], [6, 8]]; p.item = { kind: 'wrench', angle: -1.7 }; }
  return p;
}

function swing(f: number, v: View): FigPose {
  const p = P0();
  const k = Math.min(1, f / 2);
  p.expr = 'shout';
  p.crouch = 3;
  p.legs = v === 'side' ? [[9, 0], [-7, 0]] : [[4, 0], [4, 0]];
  p.lean = v === 'side' ? 5 : 0;
  if (v === 'side') { p.arms = [[16 * (0.4 + k * 0.6), 2 + 12 * k], [-4, 14]]; p.item = { kind: 'wrench', angle: -0.9 + k * 1.5 }; }
  else if (v === 'front') { p.arms = [[-4 + 10 * k, 10 + 6 * k], [5, 12]]; p.item = { kind: 'wrench', angle: 0.4 + k * 1.6 }; }
  else { p.arms = [[8 * k, 10], [5, 12]]; p.item = { kind: 'wrench', angle: 1.2 }; }
  return p;
}

function slamW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.crouch = -1;
  p.legs = v === 'side' ? [[5, 0], [-5, 0]] : [[4, 0], [4, 0]];
  p.lean = v === 'side' ? -4 : 0;
  p.head = [0, -1];
  p.arms = v === 'side' ? [[-2, -22], [0, -20]] : [[-1, -24 - f], [-1, -24 - f]];
  p.item = { kind: 'wrench', angle: v === 'side' ? -2.4 : -1.57 };
  p.arm1Front = v === 'side';
  return p;
}

function slam(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.crouch = 6;
  p.bend = 3;
  p.legs = v === 'side' ? [[10, 0], [-8, 0]] : [[6, 0], [6, 0]];
  p.lean = v === 'side' ? 8 : 0;
  p.head = [v === 'side' ? 2 : 0, 2];
  p.arms = v === 'side' ? [[18, 16], [16, 14]] : [[-2, 20], [-2, 20]];
  p.item = { kind: 'wrench', angle: v === 'side' ? 0.6 + f * 0.25 : 1.57 };
  return p;
}

function lunge(f: number, v: View, n: number): FigPose {
  const p = walk(f, v, n);
  p.legs = walkLegs(v, f / n, 9, 6);
  p.lean = v === 'side' ? 7 : 0;
  p.bend = 2;
  p.expr = 'shout';
  p.arms = v === 'side' ? [[-8, 4], [8, 12]] : [[-6, 6], [6, 12]];
  p.item = { kind: 'wrench', angle: v === 'side' ? -2.8 : -2.2 };
  p.arm0Behind = v === 'side';
  return p;
}

function whistle(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.legs = v === 'side' ? [[2, 0], [-2, 0]] : [[2, 0], [2, 0]];
  // left hand to mouth with whistle, right hand holding the wrench down
  p.arms = v === 'side' ? [[2, 18], [10, -12]] : [[4, 17], [-9, -13]];
  p.arm1Front = true;
  p.item = { kind: 'wrench', angle: 1.7 };
  p.item2 = { kind: 'whistle', angle: 0 };
  p.head = [0, f % 2 ? -1 : 0];
  return p;
}

function throwW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'angry';
  p.crouch = 2;
  p.legs = v === 'side' ? [[7, 0], [-6, 0]] : [[4, 0], [4, 0]];
  p.lean = v === 'side' ? -3 : 0;
  p.arms = v === 'side' ? [[-10, -16 - f * 2], [8, 6]] : [[-4, -20 - f * 2], [6, 10]];
  p.arm0Behind = v === 'side';
  p.item = { kind: 'toolbox', angle: 0 };
  return p;
}

function throwF(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.crouch = 3;
  p.legs = v === 'side' ? [[9, 0], [-7, 0]] : [[4, 0], [4, 0]];
  p.lean = v === 'side' ? 5 : 0;
  p.arms = v === 'side' ? [[16, -2 + f * 6], [-6, 14]] : [[-2, 6 + f * 4], [6, 12]];
  if (f === 0) p.item = { kind: 'toolbox', angle: 0 };
  return p;
}

function kick(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  const k = [0.3, 1, 1, 0.4][f] ?? 0;
  p.legs = v === 'side' ? [[6 + 12 * k, 8 + 10 * k], [-4, 0]] : [[2, 6 + 10 * k], [3, 0]];
  p.lean = v === 'side' ? -4 * k : 0;
  p.arms = v === 'side' ? [[-6, 10], [6, 6]] : [[8, 8], [8, 8]];
  p.item = { kind: 'wrench', angle: v === 'side' ? -2.6 : -2 };
  return p;
}

function slip(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 2 ? 'dazed' : 'pain';
  p.legs = v === 'side' ? [[6, 4 + f * 2], [-2, 2]] : [[3, 2], [3, 4]];
  p.arms = v === 'side' ? [[10, -14 + f * 3], [-8, -10]] : [[10, -10 + f * 2], [10, -12]];
  return p;
}

function shock(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 2 ? 'shock' : 'shout';
  p.crouch = f % 2;
  p.legs = v === 'side' ? [[5, f % 2], [-5, 0]] : [[5, f % 2], [5, 0]];
  p.arms = v === 'side' ? [[12, -10 - f * 3], [-10, -8]] : [[13, -6 - (f % 2) * 4], [13, -8 + (f % 2) * 3]];
  p.head = [f % 2 ? 1 : -1, 0];
  return p;
}

function hurt(_f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'pain';
  p.crouch = 2;
  p.lean = v === 'side' ? -4 : 0;
  p.head = [v === 'side' ? -2 : 1, 1];
  p.legs = v === 'side' ? [[3, 0], [-5, 0]] : [[2, 0], [2, 0]];
  p.arms = v === 'side' ? [[6, 8], [-4, 12]] : [[8, 10], [6, 12]];
  p.item = { kind: 'wrench', angle: 1.9 };
  return p;
}

function stagger(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 3 === 0 ? 'dazed' : 'pain';
  p.crouch = 9;
  p.bend = 3;
  p.lean = v === 'side' ? 4 : 0;
  p.head = [Math.round(Math.sin(f * 1.6) * 2), 2];
  p.legs = v === 'side' ? [[10, 2], [-6, 5]] : [[5, 0], [3, 4]];
  p.arms = v === 'side' ? [[8, 18], [6, 18]] : [[6, 16], [8, 16]];
  return p;
}

function grabbed(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.crouch = 2;
  p.legs = v === 'side' ? [[4 + f * 3, 3], [-6, 0]] : [[3, f * 2], [3, 0]];
  p.arms = v === 'side' ? [[12, -6 + f * 4], [-10, -4]] : [[12, -4 + f * 4], [12, -2 - f * 3]];
  return p;
}

function intro(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f === 1 || f === 2 ? 'smug' : 'angry';
  p.legs = v === 'side' ? [[4, 0], [-4, 0]] : [[3, 0], [3, 0]];
  // taps the wrench into his palm
  const tap = f % 2;
  p.arms = v === 'side' ? [[8, 6 - tap * 3], [10, 10]] : [[1, 6 - tap * 3], [1, 10]];
  p.item = { kind: 'wrench', angle: v === 'side' ? -0.3 : -0.5 - tap * 0.2 };
  p.arm1Front = true;
  return p;
}

function down(f: number, v: View): FigPose {
  const p = stagger(f, v);
  p.crouch = 11;
  p.expr = 'dazed';
  p.head = [0, 4];
  return p;
}

function shoved(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.crouch = 4;
  p.bend = 4;
  p.lean = v === 'side' ? 10 + f * 2 : 0;
  p.head = [v === 'side' ? 3 : 0, 3];
  p.legs = v === 'side' ? [[-2, 0], [-10, 3]] : [[2, 0], [2, 2]];
  p.arms = v === 'side' ? [[14, 2], [12, 6]] : [[10, -8], [10, -6]];
  return p;
}

// ------------------------------------------------------------------ scrubber (ride-on floor cleaner)
const SCR = ramp('#e2b234');
const SCR2 = ramp('#3c4048');
const SEAT = ramp('#2a2c34');

function scrubber(b: PixBuf, f: number, view: View, ox: number, oy: number, layer: 'under' | 'over', mood: 'ride' | 'charge' | 'crash'): void {
  const beacon = (f % 2 === 0) !== (mood === 'crash');
  const bc = beacon ? C('#ffb020') : C('#9a5a10');
  if (view === 'side') {
    if (layer === 'under') {
      // chassis
      for (let y = oy - 18; y <= oy - 3; y++) for (let x = ox - 24; x <= ox + 22; x++) {
        const top = y === oy - 18, bot = y >= oy - 5;
        const front = x > ox + 18;
        b.set(x, y, bot ? SCR2.sh : top ? SCR.hi : front ? SCR.sh : (x - ox) < -20 ? SCR.lt : SCR.base);
      }
      // tank lid + vents
      b.rect(ox - 22, oy - 22, 14, 4, SCR.sh); b.hline(ox - 21, ox - 10, oy - 22, SCR.lt);
      for (let k = 0; k < 4; k++) b.hline(ox - 4 + k * 5, ox - 2 + k * 5, oy - 12, SCR.dk);
      // seat back
      b.rect(ox - 8, oy - 30, 5, 14, SEAT.base); b.vline(ox - 8, oy - 30, oy - 17, SEAT.lt);
      // beacon post
      b.vline(ox - 18, oy - 34, oy - 22, SCR2.base); b.rect(ox - 20, oy - 38, 5, 4, bc); b.set(ox - 19, oy - 38, C('#fff0c0'));
      // wheels
      for (const wx of [ox - 15, ox + 13]) { b.ellipse(wx, oy - 3, 5, 4, C('#1c1c22')); b.set(wx - 1, oy - 5, C('#5a5a64')); b.set(wx, oy - 3, C('#8a8a94')); }
      // squeegee at the back + brush deck
      b.rect(ox - 27, oy - 4, 4, 4, SCR2.base); b.hline(ox - 28, ox - 23, oy, C('#1c1c22'));
      if (mood === 'charge') for (let k = 0; k < 6; k++) b.set(ox - 30 - k * 2, oy - 2 - (k % 2), C('#9fd0e6'));
    } else {
      // steering column + wheel in front of the driver
      b.limb(ox + 16, oy - 16, ox + 10, oy - 30, 2, SCR2.lt, SCR2.base, SCR2.dk);
      b.hline(ox + 6, ox + 13, oy - 31, C('#1c1c22')); b.hline(ox + 7, ox + 12, oy - 32, C('#4a4a54'));
      // front bumper + headlight
      b.rect(ox + 20, oy - 15, 4, 8, SCR.sh); b.rect(ox + 22, oy - 13, 2, 3, mood === 'crash' ? C('#6a6a50') : C('#fff6c8'));
      // dashboard cowl over the driver's lap
      for (let y = oy - 20; y <= oy - 16; y++) for (let x = ox - 4; x <= ox + 18; x++) b.set(x, y, y === oy - 20 ? SCR.hi : SCR.base);
      if (mood === 'crash') { b.set(ox + 23, oy - 18, C('#3a3a3a')); b.set(ox + 21, oy - 21, C('#5a5a5a')); }
    }
  } else {
    const back = view === 'back';
    if (layer === 'under') {
      // chassis seen end-on
      for (let y = oy - 18; y <= oy - 2; y++) for (let x = ox - 19; x <= ox + 19; x++) {
        const u = (x - (ox - 19)) / 38;
        b.set(x, y, y >= oy - 4 ? SCR2.sh : y === oy - 18 ? SCR.hi : u < 0.1 ? SCR.lt : u > 0.88 ? SCR.sh : SCR.base);
      }
      for (const wx of [ox - 20, ox + 20]) b.rect(wx - 2, oy - 7, 4, 7, C('#1c1c22'));
      // beacon
      b.vline(ox + (back ? 14 : -14), oy - 32, oy - 18, SCR2.base); b.rect(ox + (back ? 12 : -16), oy - 36, 5, 4, bc); b.set(ox + (back ? 13 : -15), oy - 36, C('#fff0c0'));
      if (back) { b.rect(ox - 12, oy - 16, 24, 6, SCR.sh); b.set(ox - 8, oy - 14, C('#2a2a30')); b.set(ox + 7, oy - 14, C('#2a2a30')); b.rect(ox - 16, oy - 3, 32, 3, SCR2.base); }
    } else if (!back) {
      // front: dash + steering wheel + headlights + squeegee skirt
      for (let y = oy - 22; y <= oy - 12; y++) for (let x = ox - 15; x <= ox + 15; x++) b.set(x, y, y === oy - 22 ? SCR.hi : y > oy - 14 ? SCR.sh : SCR.base);
      b.hline(ox - 7, ox + 7, oy - 26, C('#1c1c22')); b.hline(ox - 6, ox + 6, oy - 27, C('#4a4a54'));
      b.vline(ox, oy - 26, oy - 22, SCR2.base);
      const hl = mood === 'crash' ? C('#6a6a50') : C('#fff6c8');
      b.rect(ox - 14, oy - 10, 5, 3, hl); b.rect(ox + 10, oy - 10, 5, 3, hl);
      b.hline(ox - 18, ox + 18, oy - 1, C('#1c1c22'));
      // hazard chevrons
      for (let k = -3; k <= 3; k++) { b.set(ox + k * 4, oy - 5, C('#1c1c22')); b.set(ox + k * 4 + 1, oy - 6, C('#1c1c22')); }
    }
  }
}

function ride(mood: 'ride' | 'charge' | 'crash'): AnimDef {
  return {
    frames: 2, fps: mood === 'charge' ? 12 : mood === 'crash' ? 3 : 6, loop: true,
    pose(f, v) {
      const p = P0();
      p.noLegs = true;
      p.crouch = 5 - (mood === 'ride' ? f % 2 : 0);
      p.expr = mood === 'crash' ? 'dazed' : mood === 'charge' ? 'shout' : 'angry';
      p.lean = v === 'side' ? (mood === 'charge' ? 6 : mood === 'crash' ? -3 : 3) : 0;
      p.bend = mood === 'charge' ? 2 : 0;
      p.head = mood === 'crash' ? [f ? 2 : -2, 2] : [0, 0];
      if (v === 'side') p.arms = mood === 'crash' ? [[6, 18], [-4, 18]] : [[14, 6], [12, 6]];
      else p.arms = mood === 'crash' ? [[6, 18], [6, 18]] : [[-1, 8], [-1, 8]];
      if (v === 'side' && mood !== 'crash') p.arm1Front = false;
      return p;
    },
    extra(b, f, v, ox, oy, layer) { scrubber(b, f, v, ox, oy, layer, mood); },
  };
}

const anim = (frames: number, fps: number, loop: boolean, pose: AnimDef['pose'], lie?: 1 | 3): AnimDef => ({ frames, fps, loop, pose, lie });

export const FM_ANIMS: Record<string, AnimDef> = {
  idle: anim(4, 4, true, idle),
  walk: anim(6, 9, true, walk),
  swing_w: anim(3, 8, false, swingW),
  swing: anim(3, 18, false, swing),
  slam_w: anim(2, 5, false, slamW),
  slam: anim(2, 12, false, slam),
  lunge: anim(6, 14, true, lunge),
  whistle: anim(4, 7, true, whistle),
  throw_w: anim(2, 6, false, throwW),
  throw: anim(2, 10, false, throwF),
  kick: anim(4, 10, false, kick),
  slip: anim(2, 4, true, slip, 3),
  shock: anim(2, 20, true, shock),
  hurt: anim(1, 8, false, hurt),
  stagger: anim(4, 5, true, stagger),
  grabbed: anim(2, 8, true, grabbed),
  intro: anim(4, 4, true, intro),
  down: anim(4, 3, true, down),
  shoved: anim(2, 6, true, shoved),
  ride: ride('ride'),
  ride_charge: ride('charge'),
  crash: ride('crash'),
};
void FPS; void mixCol;

let art: BossArt | null = null;
export function facilitiesArt(): BossArt { return (art ??= new BossArt(FM_SPEC, FM_ANIMS)); }

// ------------------------------------------------------------------ parked scrubber (no driver)
import { outlineRect, toCanvas } from '../chars/pixbuf';
import type { Sprite } from '../../render/canvas';
import { OUTC } from './fig';
const parked = new Map<string, Sprite>();
export function scrubberSprite(view: View, beacon = false): Sprite {
  const key = view + beacon;
  let s = parked.get(key);
  if (!s) {
    const b = new PixBuf(80, 50);
    scrubber(b, beacon ? 0 : 1, view, 40, 46, 'under', 'ride');
    scrubber(b, beacon ? 0 : 1, view, 40, 46, 'over', 'ride');
    outlineRect(b, 0, 0, 80, 50, OUTC);
    const c = toCanvas(b);
    s = { img: c, sx: 0, sy: 0, w: 80, h: 50, ox: 40, oy: 46 };
    parked.set(key, s);
  }
  return s;
}
