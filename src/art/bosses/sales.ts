// Act 2 boss art: Sienna Cross, Head of Sales. Tall and sharp: scarlet power blazer, charcoal pencil skirt,
// dark tights and heels, platinum high ponytail, sales headset, gold jewellery, a gong mallet and a fistful of contracts.
import { C } from '../chars/pixbuf';
import { ACT_GLOW } from '../chars/colours';
import { BossArt, AnimDef } from './bake';
import { FigSpec, FigPose, View, ITEMS, ramp, skinRamp, basePose, rod, R, walkLegs, rotRect } from './fig';

const BLAZER = ramp('#d0402a');
const SKIRT = ramp('#2a2b34');
const TIGHTS = skinRamp('#c99272');
const HEELS = ramp('#1c1c22');
const HAIR = ramp('#e6d6a8');
const GOLD = ramp('#d8a838');
const WOOD = ramp('#8a5a32');
const PAD = ramp('#e8e0cc');
const PAPER = ramp('#f2efe6');
const GLOW = C(ACT_GLOW[2]);

ITEMS.mallet = (b, x, y, ang) => {
  const e = rod(b, x - Math.cos(ang) * 4, y - Math.sin(ang) * 4, ang, 22, 3, WOOD);
  rotRect(b, e[0] + Math.cos(ang) * 3, e[1] + Math.sin(ang) * 3, 9, 11, ang, PAD);
  b.set(R(e[0] + Math.cos(ang) * 3), R(e[1] + Math.sin(ang) * 3), C('#c03a2c'));
};
ITEMS.contracts = (b, x, y, ang) => {
  for (let k = 0; k < 3; k++) rotRect(b, x + Math.cos(ang) * 3 + k, y - 2 - k * 2, 8, 10, ang + 0.5 - k * 0.25, PAPER);
  b.set(R(x + 2), R(y - 3), C('#2a2a30')); b.set(R(x + 3), R(y - 3), C('#2a2a30'));
};
ITEMS.phone = (b, x, y) => { b.rect(R(x) - 2, R(y) - 5, 4, 7, C('#1c1c22')); b.set(R(x) - 1, R(y) - 4, C('#6fe8ff')); b.set(R(x), R(y) - 3, C('#6fe8ff')); };

export const SALES_SPEC: FigSpec = {
  legLen: 27, torsoH: 20, shoulderW: 22, waistW: 15, hipW: 19, belly: 0, armT: 6, legT: 6, upperArm: 12, foreArm: 12, headW: 15, headH: 16, neck: 3,
  skin: skinRamp('#c99272'), top: BLAZER, sleeve: BLAZER, under: ramp('#f4f1ea'), tie: null, legs: TIGHTS, shoes: HEELS, hair: HAIR,
  skirt: true, skirtCol: SKIRT, heels: true, lapels: true,
  face: { eyeGap: 2, brow: ramp('#8a6a3a'), browT: 1, liner: true, lashes: true, lip: C('#b82a2e'), jaw: 'chiselled' },
  hair_(b, hb, layer, f) {
    const { x, y, w, h, view } = hb;
    const sway = Math.round(Math.sin((f.pose.ph ?? f.frame * 0.25) * Math.PI * 2) * 2);
    if (layer === 'back') {
      // high ponytail
      if (view === 'side') {
        const px = x - 2, py = y + 1;
        for (let k = 0; k < 18; k++) { const xx = px - Math.round(k * 0.35) + Math.round(sway * k / 18), wv = k < 4 ? 4 : k < 12 ? 3 : 2; for (let q = 0; q < wv; q++) b.set(xx - q, py + k, q === 0 ? HAIR.lt : q === wv - 1 ? HAIR.sh : HAIR.base); }
      } else if (view === 'front') {
        // a glimpse of the tail swinging behind the head
        b.set(x + w, y + 6 + sway, HAIR.sh); b.set(x + w + 1, y + 7 + sway, HAIR.sh);
      }
      return;
    }
    // front: sleek scraped-back cap, high pony base on top
    const L = (r: number) => (r === 0 ? 3 : r === 1 ? 1 : 0);
    if (view === 'front') {
      for (let r = 0; r < 6; r++) for (let c = L(r); c <= w - 1 - L(r); c++) {
        if (r === 5 && c > 2 && c < w - 3) continue;
        if (r === 4 && c > 4 && c < w - 4 && c !== 5) continue;
        b.set(x + c, y + r, r === 0 ? HAIR.hi : c <= L(r) + 1 ? HAIR.lt : c >= w - 3 - L(r) ? HAIR.sh : (r === 2 && c % 4 === 1) ? HAIR.hi : HAIR.base);
      }
      for (let r = 5; r < 9; r++) { b.set(x, y + r, HAIR.base); b.set(x + w - 1, y + r, HAIR.sh); }
      // pony base + gold tie on the crown
      const cx = x + Math.floor(w / 2);
      for (let q = -2; q <= 2; q++) for (let r = -3; r < 0; r++) if (Math.abs(q) + (r === -3 ? 1 : 0) <= 2) b.set(cx + q, y + r, r === -3 ? HAIR.hi : q < 0 ? HAIR.lt : HAIR.base);
      b.hline(cx - 1, cx + 1, y - 1, GOLD.base);
    } else if (view === 'side') {
      for (let r = 0; r < 6; r++) for (let c = L(r); c < w - 3 + (r < 2 ? 1 : -Math.max(0, r - 2)); c++) b.set(x + c, y + r, r === 0 ? HAIR.hi : c < 2 ? HAIR.sh : HAIR.base);
      for (let r = 6; r < 10; r++) b.set(x + 1, y + r, HAIR.sh);
      for (let q = 0; q < 4; q++) b.set(x + 1 + q, y - 1, HAIR.lt);
      b.set(x, y - 1, GOLD.base); b.set(x, y, GOLD.sh);
    } else {
      for (let r = 0; r < h - 3; r++) for (let c = L(r); c <= w - 1 - L(r); c++) b.set(x + c, y + r, r === 0 ? HAIR.hi : c === L(r) ? HAIR.lt : c === w - 1 - L(r) ? HAIR.sh : (r % 4 === 2 && c % 3 === 1) ? HAIR.lt : HAIR.base);
      // ponytail hangs over the back of the head
      const cx = x + Math.floor(w / 2);
      for (let k = 0; k < 22; k++) { const wv = k < 6 ? 5 : k < 15 ? 4 : 2; for (let q = -Math.floor(wv / 2); q < Math.ceil(wv / 2); q++) b.set(cx + q + Math.round(sway * k / 22), y - 2 + k, q === -Math.floor(wv / 2) ? HAIR.lt : q === Math.ceil(wv / 2) - 1 ? HAIR.sh : HAIR.base); }
      b.hline(cx - 2, cx + 2, y - 1, GOLD.base);
    }
  },
  headDetail(b, hb) {
    const { x, y, w, h, view } = hb;
    // headset: band, ear cup, boom mic
    const band = C('#2a2b34');
    if (view === 'front') {
      b.hline(x + 1, x + w - 2, y - 2, band);
      b.rect(x - 2, y + 6, 3, 5, band); b.set(x - 2, y + 7, C('#6fe8ff'));
      b.line(x - 1, y + 11, x + 3, y + h - 3, band); b.set(x + 4, y + h - 3, C('#4a4b54'));
      // gold hoop on the other ear
      b.set(x + w + 1, y + 9, GOLD.base); b.set(x + w + 1, y + 10, GOLD.sh);
    } else if (view === 'side') {
      const ex = x + Math.round(w * 0.38);
      b.vline(ex, y - 2, y + 5, band); b.rect(ex - 1, y + 6, 3, 4, band); b.set(ex, y + 7, C('#6fe8ff'));
      b.line(ex + 1, y + 10, x + w - 2, y + h - 3, band); b.set(x + w - 1, y + h - 3, C('#4a4b54'));
    } else { b.hline(x + 1, x + w - 2, y - 2, band); b.rect(x - 2, y + 6, 3, 5, band); }
  },
  torsoDetail(b, sk, f) {
    const view = sk.view;
    const cx = R(sk.shC[0]), top = R(sk.shY);
    if (view === 'front') {
      // gold necklace + lanyard with Act 2 glow
      b.set(cx - 2, top + 3, GOLD.lt); b.set(cx - 1, top + 4, GOLD.base); b.set(cx, top + 4, GOLD.hi); b.set(cx + 1, top + 4, GOLD.base); b.set(cx + 2, top + 3, GOLD.lt);
      for (let k = 0; k < 8; k++) b.set(cx + 4 - Math.round(k * 0.3), top + 2 + k, C('#2bb5c8'));
      b.rect(cx + 1, top + 10, 4, 5, C('#f4f1ea')); b.set(cx + 2, top + 11, GLOW); b.set(cx + 3, top + 11, GLOW); b.hline(cx + 2, cx + 3, top + 13, C('#2a2b34'));
      // padded power shoulders
      const r0 = sk.rows[1];
      if (r0) { b.set(r0.l - 1, r0.y, BLAZER.lt); b.set(r0.r + 1, r0.y, BLAZER.sh); }
      // belt
      const last = sk.rows[sk.rows.length - 1];
      b.hline(last.l + 1, last.r - 1, last.y - 1, C('#1c1c22')); b.set(cx, last.y - 1, GOLD.hi);
    } else if (view === 'side') {
      const fx = sk.rows[3]?.r ?? cx;
      b.set(fx - 1, top + 4, GOLD.base);
      b.set(fx, top + 9, GLOW);
    }
    void f;
  },
  over(b, sk, f) {
    // pocket square + gold watch on the leading wrist
    const ha = sk.ha[0];
    b.set(R(ha[0]) - 1, R(ha[1]) - 3, GOLD.hi);
    if (sk.view === 'front') b.set(R(sk.shC[0]) + 6, R(sk.shY) + 6, C('#6fe8ff'));
    void f;
  },
};

function P0(): FigPose { const p = basePose(); p.expr = 'smug'; return p; }

function idle(f: number, v: View): FigPose {
  const p = P0();
  p.ph = f / 4;
  p.crouch = f % 2;
  p.legs = v === 'side' ? [[3, 0], [-2, 0]] : [[0, 0], [-1, 0]];
  // hand on hip, phone in the other
  p.arms = v === 'side' ? [[4, 13], [-3, 12]] : [[8, 11], [-3, -2]];
  p.arm1Front = true;
  p.item2 = { kind: 'phone', angle: 0 };
  p.expr = f === 2 ? 'blink' : 'smug';
  return p;
}
function walk(f: number, v: View, n: number): FigPose {
  const p = P0();
  p.ph = f / n;
  p.legs = walkLegs(v, f / n, 7, 4);
  if (v !== 'side') p.legs = [[-1 + (f % 2), p.legs[0][1]], [-1 + ((f + 1) % 2), p.legs[1][1]]];
  const sw = Math.sin((f / n) * Math.PI * 2);
  p.arms = v === 'side' ? [[sw * 6, 17], [-sw * 6, 17]] : [[3, 17], [3, 17]];
  p.crouch = f % 3 === 0 ? 1 : 0;
  p.expr = 'smug';
  return p;
}
function dashW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'focus';
  p.crouch = 5 + f;
  p.bend = 2;
  p.lean = v === 'side' ? 6 : 0;
  p.legs = v === 'side' ? [[9, 0], [-9, 1]] : [[4, 0], [4, 0]];
  p.arms = v === 'side' ? [[-9, 10], [9, 10]] : [[8, 12], [8, 12]];
  return p;
}
function dash(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.ph = f / 2;
  p.crouch = 3;
  p.lean = v === 'side' ? 9 : 0;
  p.legs = v === 'side' ? (f % 2 ? [[12, 4], [-10, 3]] : [[-8, 3], [12, 2]]) : [[2, f % 2 ? 4 : 0], [2, f % 2 ? 0 : 4]];
  p.arms = v === 'side' ? [[-12, 4], [14, 6]] : [[10, 4], [10, 4]];
  return p;
}
function gong(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f >= 2 ? 'shout' : 'focus';
  const k = [0, 0.5, 1, 1][f];
  p.legs = v === 'side' ? [[6, 0], [-6, 0]] : [[3, 0], [3, 0]];
  p.lean = v === 'side' ? -3 + 8 * k : 0;
  p.crouch = 2 * k;
  if (v === 'side') { p.arms = [[-6 + 22 * k, -16 + 24 * k], [6, 10]]; p.item = { kind: 'mallet', angle: -2.2 + 2.6 * k }; p.arm0Behind = k < 0.5; }
  else { p.arms = [[-2 + 8 * k, -18 + 26 * k], [6, 10]]; p.item = { kind: 'mallet', angle: -1.6 + 2.4 * k }; }
  return p;
}
function throwW(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'grin';
  p.legs = v === 'side' ? [[6, 0], [-5, 0]] : [[3, 0], [3, 0]];
  p.lean = v === 'side' ? -2 : 0;
  p.arms = v === 'side' ? [[-12, -4 - f * 2], [8, 8]] : [[-6, -8 - f * 2], [6, 10]];
  p.arm0Behind = v === 'side';
  p.item = { kind: 'contracts', angle: -0.6 };
  return p;
}
function throwF(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.legs = v === 'side' ? [[8, 0], [-7, 0]] : [[3, 0], [3, 0]];
  p.lean = v === 'side' ? 5 : 0;
  p.arms = v === 'side' ? [[16, 0 + f * 4], [-6, 14]] : [[12, 2 + f * 3], [6, 12]];
  if (f === 0) p.item = { kind: 'contracts', angle: 0.4 };
  return p;
}
function lungeW(f: number, v: View): FigPose {
  const p = dashW(f, v);
  p.expr = 'grin';
  p.arms = v === 'side' ? [[-6, 2], [-8, 4]] : [[12, -2], [12, -2]];
  return p;
}
function lunge(f: number, v: View): FigPose {
  const p = dash(f, v);
  p.expr = 'grin';
  p.arms = v === 'side' ? [[18, -2], [16, 0]] : [[4, -8], [4, -8]];
  p.arm1Front = true;
  return p;
}
function carry(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'grin';
  p.ph = f / 4;
  p.legs = walkLegs(v, f / 4, 6, 3);
  p.lean = v === 'side' ? -3 : 0;
  p.arms = v === 'side' ? [[14, -6], [12, -4]] : [[2, -10], [2, -10]];
  p.arm1Front = true;
  return p;
}
function hurt(_f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'pain';
  p.crouch = 2; p.lean = v === 'side' ? -4 : 0; p.head = [v === 'side' ? -2 : 1, 1];
  p.legs = v === 'side' ? [[2, 0], [-6, 0]] : [[1, 0], [2, 0]];
  p.arms = v === 'side' ? [[8, 6], [-6, 10]] : [[9, 8], [8, 8]];
  return p;
}
function stagger(f: number, v: View): FigPose {
  const p = P0();
  p.expr = f % 3 === 0 ? 'dazed' : 'pain';
  p.crouch = 12; p.bend = 3;
  p.lean = v === 'side' ? 5 : 0;
  p.head = [Math.round(Math.sin(f * 1.7) * 2), 3];
  p.legs = v === 'side' ? [[11, 2], [-7, 7]] : [[6, 0], [4, 5]];
  p.arms = v === 'side' ? [[8, 18], [6, 18]] : [[7, 15], [9, 15]];
  return p;
}
function grabbed(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.crouch = 1;
  p.legs = v === 'side' ? [[4 + f * 3, 3 + f], [-6, 0]] : [[2, f * 3], [2, 0]];
  p.arms = v === 'side' ? [[12, -8 + f * 4], [-10, -6]] : [[12, -6 + f * 4], [12, -4 - f * 3]];
  return p;
}
function intro(f: number, v: View): FigPose {
  const p = P0();
  p.ph = f / 4;
  p.expr = f >= 2 ? 'grin' : 'smug';
  p.legs = v === 'side' ? [[3, 0], [-3, 0]] : [[0, 0], [-1, 0]];
  // finger-gun at you, other hand on hip
  p.arms = v === 'side' ? [[19, -4], [-3, 12]] : [[3, -6 - (f % 2)], [8, 11]];
  return p;
}
function down(f: number, v: View): FigPose { const p = stagger(f, v); p.crouch = 14; p.expr = 'dazed'; p.head = [0, 5]; return p; }
function tantrum(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shout';
  p.legs = v === 'side' ? [[4, f % 2 ? 8 : 0], [-4, 0]] : [[2, f % 2 ? 8 : 0], [2, 0]];
  p.arms = v === 'side' ? [[6, -14], [4, -14]] : [[6, -16 + (f % 2) * 4], [6, -16 + ((f + 1) % 2) * 4]];
  p.head = [0, f % 2];
  return p;
}
function fall(f: number, v: View): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.legs = v === 'side' ? [[8 - f * 4, 6 + f * 2], [-6 + f * 4, 4]] : [[6, 6 + f * 3], [6, 3]];
  p.arms = v === 'side' ? [[14, -14 + f * 6], [-12, -12]] : [[14, -12 + f * 4], [14, -8 - f * 4]];
  p.ph = f / 2;
  return p;
}
function smash(f: number, v: View): FigPose {
  const p = gong(Math.min(3, f + 1), v);
  p.item = undefined;
  p.expr = 'shout';
  return p;
}

const anim = (frames: number, fps: number, loop: boolean, pose: AnimDef['pose'], lie?: 1 | 3): AnimDef => ({ frames, fps, loop, pose, lie });

export const SALES_ANIMS: Record<string, AnimDef> = {
  idle: anim(4, 4, true, idle),
  walk: anim(6, 11, true, walk),
  dash_w: anim(2, 6, false, dashW),
  dash: anim(2, 16, true, dash),
  gong: anim(4, 9, false, gong),
  throw_w: anim(2, 6, false, throwW),
  throw: anim(2, 12, false, throwF),
  lunge_w: anim(2, 6, false, lungeW),
  lunge: anim(2, 16, true, lunge),
  carry: anim(4, 8, true, carry),
  hurt: anim(1, 8, false, hurt),
  stagger: anim(4, 5, true, stagger),
  grabbed: anim(2, 8, true, grabbed),
  intro: anim(4, 4, true, intro),
  down: anim(4, 3, true, down),
  tantrum: anim(2, 8, true, tantrum),
  fall: anim(2, 6, true, fall),
  smash: anim(3, 10, false, smash),
};

let art: BossArt | null = null;
export function salesArt(): BossArt { return (art ??= new BossArt(SALES_SPEC, SALES_ANIMS)); }
