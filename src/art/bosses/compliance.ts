// Act 3 boss art: Patricia Steel, Head of Compliance. Cold navy skirt suit, burgundy neck-bow (the "tie" the
// shredder takes), steel-grey bun, half-moon glasses on a chain, pearls, Act 3 lanyard glow, a giant policy binder
// and an oversized rubber stamp.
import { C } from '../chars/pixbuf';
import { ACT_GLOW } from '../chars/colours';
import { BossArt, AnimDef } from './bake';
import { FigSpec, FigPose, View, ITEMS, ramp, skinRamp, basePose, rod, R, walkLegs, rotRect } from './fig';

const SUIT = ramp('#2b3a5e');
const HAIR = ramp('#9aa0aa');
const BOW = ramp('#7a1e2e');
const BINDER = ramp('#8a2a2a');
const WOOD = ramp('#7a5232');
const INK = ramp('#c02a2a');
const PAPER = ramp('#f2efe6');
const GLOW = C(ACT_GLOW[3]);

ITEMS.binder = (b, x, y, ang) => {
  rotRect(b, x + Math.cos(ang) * 6, y + Math.sin(ang) * 6, 16, 20, ang + Math.PI / 2, BINDER);
  const cx = x + Math.cos(ang) * 6, cy = y + Math.sin(ang) * 6;
  b.set(R(cx) - 2, R(cy) - 3, PAPER.base); b.set(R(cx) - 1, R(cy) - 3, PAPER.base); b.set(R(cx), R(cy) - 3, PAPER.base);
  b.set(R(cx + Math.cos(ang + Math.PI / 2) * 7), R(cy + Math.sin(ang + Math.PI / 2) * 7), C('#d8dde4'));
};
ITEMS.stamp = (b, x, y, ang) => {
  const e = rod(b, x - Math.cos(ang) * 3, y - Math.sin(ang) * 3, ang, 10, 4, WOOD);
  rotRect(b, e[0] + Math.cos(ang) * 3, e[1] + Math.sin(ang) * 3, 12, 6, ang + Math.PI / 2, ramp('#3a3d46'));
  b.set(R(e[0] + Math.cos(ang) * 6), R(e[1] + Math.sin(ang) * 6), INK.base);
  b.ellipse(x - Math.cos(ang) * 4, y - Math.sin(ang) * 4, 2.5, 2.5, WOOD.lt);
};
ITEMS.policy = (b, x, y) => {
  b.rect(R(x) - 6, R(y) - 16, 13, 16, PAPER.base);
  b.hline(R(x) - 5, R(x) + 5, R(y) - 14, INK.base); b.hline(R(x) - 5, R(x) + 5, R(y) - 13, INK.base);
  for (let k = 0; k < 4; k++) b.hline(R(x) - 5, R(x) + 3 - (k % 2) * 2, R(y) - 10 + k * 2, C('#7a7f8a'));
  b.vline(R(x) + 6, R(y) - 16, R(y) - 1, PAPER.sh);
};

export const COMP_SPEC: FigSpec = {
  legLen: 24, torsoH: 21, shoulderW: 23, waistW: 18, hipW: 21, belly: 1, armT: 6, legT: 7, upperArm: 12, foreArm: 11, headW: 16, headH: 16, neck: 2,
  skin: skinRamp('#e8c0a0'), top: SUIT, sleeve: SUIT, under: ramp('#e8ecf2'), tie: BOW, legs: skinRamp('#d8b090'), shoes: ramp('#1c2236'), hair: HAIR,
  skirt: true, skirtCol: SUIT, heels: true, lapels: true,
  face: { eyeGap: 3, brow: ramp('#6a6e78'), browT: 1, glasses: 'half', glassesCol: ramp('#c8b070'), lip: C('#8a3a42'), wrinkles: true, jaw: 'soft' },
  hair_(b, hb, layer) {
    const { x, y, w, h, view } = hb;
    const L = (r: number) => (r === 0 ? 3 : r === 1 ? 1 : 0);
    if (layer === 'back') { if (view === 'side') { b.ellipse(x + 1, y + 4, 4, 4, HAIR.base); b.set(x, y + 2, HAIR.lt); b.set(x + 2, y + 6, HAIR.sh); } return; }
    if (view === 'front') {
      for (let r = 0; r < 5; r++) for (let c = L(r); c <= w - 1 - L(r); c++) { if (r >= 3 && c > 3 && c < w - 4) continue; b.set(x + c, y + r, r === 0 ? HAIR.hi : c === Math.floor(w / 2) ? HAIR.sh : c < 4 ? HAIR.lt : HAIR.base); }
      for (let r = 5; r < 8; r++) { b.set(x, y + r, HAIR.base); b.set(x + w - 1, y + r, HAIR.sh); }
      // bun peeking over the crown
      b.ellipse(x + w / 2 - 0.5, y - 2, 4, 2.5, HAIR.base); b.hline(x + Math.floor(w / 2) - 2, x + Math.floor(w / 2) + 1, y - 4, HAIR.hi);
    } else if (view === 'side') {
      for (let r = 0; r < 6; r++) for (let c = L(r); c < w - 3 - Math.max(0, r - 3); c++) b.set(x + c, y + r, r === 0 ? HAIR.hi : c < 2 ? HAIR.sh : HAIR.base);
      for (let r = 6; r < 10; r++) b.set(x + 1, y + r, HAIR.sh);
      b.set(x - 2, y + 4, C('#c8b070')); // hairpin
    } else {
      for (let r = 0; r < h - 3; r++) for (let c = L(r); c <= w - 1 - L(r); c++) b.set(x + c, y + r, r === 0 ? HAIR.hi : c === L(r) ? HAIR.lt : c === w - 1 - L(r) ? HAIR.sh : (r + c) % 5 === 0 ? HAIR.lt : HAIR.base);
      b.ellipse(x + w / 2 - 0.5, y + 4, 4.5, 4, HAIR.base); b.ellipse(x + w / 2 - 1.5, y + 3, 2, 1.5, HAIR.hi);
      b.hline(x + Math.floor(w / 2) - 4, x + Math.floor(w / 2) + 3, y + 8, HAIR.dk);
    }
  },
  headDetail(b, hb) {
    // glasses chain
    const { x, y, h, w, view } = hb;
    if (view === 'front') { for (let k = 0; k < 5; k++) { b.set(x - 1 - (k > 2 ? 0 : 0), y + Math.round(h * 0.55) + k, C('#c8b070')); b.set(x + w, y + Math.round(h * 0.55) + k, C('#c8b070')); } }
  },
  torsoDetail(b, sk) {
    const cx = R(sk.shC[0]), top = R(sk.shY);
    if (sk.view === 'front') {
      // pearls + the neck-bow loops
      for (let k = -3; k <= 3; k++) b.set(cx + k, top + 2 + (Math.abs(k) < 2 ? 1 : 0), C('#f4f1ea'));
      b.rect(cx - 4, top + 1, 3, 3, BOW.base); b.rect(cx + 2, top + 1, 3, 3, BOW.sh); b.set(cx - 4, top + 1, BOW.lt);
      // lanyard with ID (Act 3 glow) clipped at the hip
      for (let k = 0; k < 10; k++) b.set(cx - 5 + Math.round(k * 0.2), top + 3 + k, C('#2e4f86'));
      b.rect(cx - 6, top + 13, 5, 6, C('#e8ecf2')); b.set(cx - 5, top + 14, GLOW); b.set(cx - 4, top + 14, GLOW); b.hline(cx - 5, cx - 3, top + 16, C('#2a2b34'));
      // buttons
      for (let k = 0; k < 2; k++) b.set(cx + 2, top + 12 + k * 4, C('#c8b070'));
    } else if (sk.view === 'side') {
      const fx = sk.rows[2]?.r ?? cx;
      b.rect(fx - 1, top + 1, 3, 3, BOW.base); b.set(fx + 1, top + 4, BOW.sh);
      b.set(fx - 2, top + 10, GLOW);
    } else b.rect(cx - 3, top, 6, 2, BOW.sh);
  },
};

function P0(): FigPose { const p = basePose(); p.expr = 'focus'; return p; }

function idle(f: number, v: View): FigPose {
  const p = P0();
  p.crouch = f % 2 ? 1 : 0;
  p.legs = v === 'side' ? [[2, f === 1 ? 2 : 0], [-2, 0]] : [[0, f === 1 ? 2 : 0], [0, 0]];
  // binder clutched to the chest, the other hand holding the stamp
  p.arms = v === 'side' ? [[6, 8], [9, 6]] : [[2, 16], [-5, 6]];
  p.arm1Front = true;
  p.item = { kind: 'stamp', angle: 1.6 };
  p.item2 = { kind: 'binder', angle: v === 'side' ? 1.2 : 1.35 };
  p.expr = f === 3 ? 'blink' : 'focus';
  return p;
}
function walk(f: number, v: View, n: number): FigPose {
  const p = P0();
  p.legs = walkLegs(v, f / n, 5, 3);
  if (v !== 'side') p.legs = [[0, p.legs[0][1]], [0, p.legs[1][1]]];
  p.arms = v === 'side' ? [[6 + Math.sin(f / n * 6.28) * 3, 15], [9, 6]] : [[3, 16], [-5, 6]];
  p.arm1Front = true;
  p.item = { kind: 'stamp', angle: 1.6 };
  p.item2 = { kind: 'binder', angle: v === 'side' ? 1.2 : 1.35 };
  return p;
}
function stampW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'angry';
  p.crouch = -1;
  p.legs = v === 'side' ? [[5, 0], [-4, 0]] : [[2, 0], [2, 0]];
  p.arms = v === 'side' ? [[2, -22 - f * 2], [0, -20]] : [[-1, -24 - f * 2], [-1, -24 - f * 2]];
  p.item = { kind: 'stamp', angle: -1.57 };
  p.head = [0, -1];
  return p;
}
function stamp(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.crouch = 6; p.bend = 3;
  p.lean = v === 'side' ? 7 : 0;
  p.legs = v === 'side' ? [[9, 0], [-7, 0]] : [[5, 0], [5, 0]];
  p.arms = v === 'side' ? [[16, 18 + f], [14, 16]] : [[-1, 20 + f], [-1, 20]];
  p.item = { kind: 'stamp', angle: 1.57 };
  return p;
}
function slamW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'angry';
  p.legs = v === 'side' ? [[6, 0], [-5, 0]] : [[3, 0], [3, 0]];
  p.lean = v === 'side' ? -3 : 0;
  p.arms = v === 'side' ? [[-6, -12 - f * 2], [-4, -10]] : [[-4, -14 - f * 2], [8, 6]];
  p.arm0Behind = v === 'side';
  p.item = { kind: 'binder', angle: -2.4 };
  return p;
}
function slam(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.crouch = 3;
  p.legs = v === 'side' ? [[9, 0], [-7, 0]] : [[4, 0], [4, 0]];
  p.lean = v === 'side' ? 6 : 0;
  p.arms = v === 'side' ? [[16, 6 + f * 4], [-4, 12]] : [[10, 8 + f * 3], [6, 10]];
  p.item = { kind: 'binder', angle: 0.2 + f * 0.5 };
  return p;
}
function shove(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  const k = f === 0 ? 0.3 : 1;
  p.crouch = 2;
  p.lean = v === 'side' ? 3 + 6 * k : 0;
  p.legs = v === 'side' ? [[8, 0], [-8, 0]] : [[3, 0], [3, 0]];
  p.arms = v === 'side' ? [[6 + 12 * k, 2], [5 + 12 * k, 4]] : [[2, 2 - 6 * k], [2, 2 - 6 * k]];
  p.arm1Front = true;
  return p;
}
function post(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 2 ? 'talk' : 'smug';
  p.legs = v === 'side' ? [[3, 0], [-3, 0]] : [[1, 0], [1, 0]];
  p.arms = v === 'side' ? [[12, -16], [8, 6]] : [[0, -18], [-5, 6]];
  p.arm1Front = true;
  p.item = { kind: 'policy', angle: 0 };
  p.item2 = { kind: 'binder', angle: v === 'side' ? 1.2 : 1.35 };
  return p;
}
function file(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'blink';
  p.crouch = 3 + f * 3;
  p.arms = v === 'side' ? [[6, 4], [8, 2]] : [[-6, 4], [-6, 4]];
  p.arm1Front = true;
  p.legs = [[0, 0], [0, 0]];
  return p;
}
function hurt(_f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'pain'; p.crouch = 2; p.lean = v === 'side' ? -4 : 0; p.head = [v === 'side' ? -2 : 1, 1];
  p.legs = v === 'side' ? [[2, 0], [-6, 0]] : [[1, 0], [2, 0]];
  p.arms = v === 'side' ? [[8, 6], [-6, 10]] : [[9, 8], [8, 8]];
  return p;
}
function stagger(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 3 === 0 ? 'dazed' : 'pain';
  p.crouch = 11; p.bend = 3; p.lean = v === 'side' ? 5 : 0;
  p.head = [Math.round(Math.sin(f * 1.7) * 2), 3];
  p.legs = v === 'side' ? [[10, 2], [-7, 6]] : [[6, 0], [4, 5]];
  p.arms = v === 'side' ? [[8, 17], [6, 17]] : [[7, 14], [9, 14]];
  return p;
}
function grabbed(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.legs = v === 'side' ? [[4 + f * 3, 3 + f], [-6, 0]] : [[2, f * 3], [2, 0]];
  p.arms = v === 'side' ? [[12, -8 + f * 4], [-10, -6]] : [[12, -6 + f * 4], [12, -4 - f * 3]];
  return p;
}
function intro(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f >= 2 ? 'smug' : 'focus';
  p.legs = v === 'side' ? [[2, 0], [-2, 0]] : [[0, 0], [0, 0]];
  // adjusts her glasses, binder at her side
  p.arms = v === 'side' ? [[10, -14 + (f % 2)], [6, 14]] : [[-7, -15 + (f % 2)], [3, 16]];
  p.item2 = { kind: 'binder', angle: 1.57 };
  return p;
}
function down(f: number, v: View): FigPose { const p = stagger(f, v); p.crouch = 13; p.expr = 'dazed'; p.head = [0, 5]; return p; }
function shred(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.crouch = 3; p.bend = 5;
  p.lean = v === 'side' ? 12 + f * 2 : 0;
  p.head = [v === 'side' ? 4 : 0, 4 + f];
  p.legs = v === 'side' ? [[-4, 0], [-12, 4]] : [[2, 0], [2, 3]];
  p.arms = v === 'side' ? [[-8, -10], [-10, -6]] : [[12, -12 + f * 3], [12, -10 - f * 2]];
  return p;
}

const anim = (frames: number, fps: number, loop: boolean, pose: AnimDef['pose']): AnimDef => ({ frames, fps, loop, pose });

export const COMP_ANIMS: Record<string, AnimDef> = {
  idle: anim(4, 3, true, idle),
  walk: anim(6, 8, true, walk),
  stamp_w: anim(2, 5, false, stampW),
  stamp: anim(2, 12, false, stamp),
  slam_w: anim(2, 6, false, slamW),
  slam: anim(2, 14, false, slam),
  shove: anim(2, 10, false, shove),
  post: anim(2, 4, true, post),
  file: anim(2, 6, false, file),
  hurt: anim(1, 8, false, hurt),
  stagger: anim(4, 5, true, stagger),
  grabbed: anim(2, 8, true, grabbed),
  intro: anim(4, 3, true, intro),
  down: anim(4, 3, true, down),
  shred: anim(2, 10, true, shred),
};

let art: BossArt | null = null;
export function complianceArt(): BossArt { return (art ??= new BossArt(COMP_SPEC, COMP_ANIMS)); }
