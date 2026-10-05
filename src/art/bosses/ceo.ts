// Act 4 final boss art: James Hartley, CEO. Tall, broad, charcoal three-piece suit, gold tie, the ceremonial
// red-and-gold sash of the Culture Realignment Programme, gold medallion lanyard, silver swept-back hair, a tan,
// veneers — and a golf club.
import { C } from '../chars/pixbuf';
import { ACT_GLOW } from '../chars/colours';
import { BossArt, AnimDef } from './bake';
import { FigSpec, FigPose, View, ITEMS, ramp, skinRamp, basePose, rod, R, walkLegs, rotRect } from './fig';

const SUIT = ramp('#2e3038');
const GOLDR = ramp('#d4a537');
const SASH = ramp('#a01828');
const HAIR = ramp('#c8ccd4');
const STEEL = ramp('#b8c0cc');
const BRIEF = ramp('#5a3a22');
const GLOW = C(ACT_GLOW[4]);

ITEMS.club = (b, x, y, ang) => {
  const e = rod(b, x - Math.cos(ang) * 6, y - Math.sin(ang) * 6, ang, 6, 3, ramp('#1c1c22'));
  const e2 = rod(b, e[0], e[1], ang, 26, 2, STEEL);
  // driver head
  rotRect(b, e2[0] + Math.cos(ang) * 2, e2[1] + Math.sin(ang) * 2, 9, 6, ang + 0.4, ramp('#2a2c34'));
  b.set(R(e2[0] + Math.cos(ang) * 3), R(e2[1] + Math.sin(ang) * 3), GOLDR.hi);
};
ITEMS.briefcase = (b, x, y) => {
  b.rect(R(x) - 7, R(y), 14, 10, BRIEF.base); b.hline(R(x) - 7, R(x) + 6, R(y), BRIEF.lt); b.hline(R(x) - 7, R(x) + 6, R(y) + 9, BRIEF.dk);
  b.rect(R(x) - 2, R(y) - 2, 5, 2, GOLDR.base); b.set(R(x) - 4, R(y) + 3, GOLDR.hi); b.set(R(x) + 3, R(y) + 3, GOLDR.hi);
};

export const CEO_SPEC: FigSpec = {
  legLen: 28, torsoH: 24, shoulderW: 28, waistW: 22, hipW: 22, belly: 0, armT: 8, legT: 8, upperArm: 14, foreArm: 13, headW: 17, headH: 18, neck: 3,
  skin: skinRamp('#c98a62'), top: SUIT, sleeve: SUIT, under: ramp('#f4f1ea'), tie: GOLDR, legs: SUIT, shoes: ramp('#3a2418'), hair: HAIR,
  lapels: true,
  face: { eyeGap: 3, brow: ramp('#8a8e96'), browT: 2, jaw: 'chiselled', bigTeeth: true, tan: true },
  hair_(b, hb, layer) {
    const { x, y, w, h, view } = hb;
    if (layer === 'back') return;
    const L = (r: number) => (r === 0 ? 3 : r === 1 ? 1 : 0);
    if (view === 'front') {
      // swept-back silver with a confident quiff
      for (let r = -2; r < 5; r++) for (let c = Math.max(0, L(r + 2) - 1); c <= w - 1 - Math.max(0, L(r + 2) - 1); c++) {
        if (r === -2 && (c < 4 || c > w - 7)) continue;
        if (r >= 3 && c > 2 && c < w - 3) continue;
        b.set(x + c, y + r, r <= -1 ? HAIR.hi : c < 3 ? HAIR.lt : c > w - 4 ? HAIR.sh : (c + r) % 4 === 0 ? HAIR.hi : HAIR.base);
      }
      for (let r = 5; r < 9; r++) { b.set(x, y + r, HAIR.sh); b.set(x + w - 1, y + r, HAIR.sh); }
    } else if (view === 'side') {
      for (let r = -2; r < 7; r++) for (let c = 0; c < w - 2 - Math.max(0, r - 2); c++) { if (r === -2 && c < 4) continue; b.set(x + c, y + r, r < 0 ? HAIR.hi : c < 2 ? HAIR.sh : (c + r) % 4 === 0 ? HAIR.hi : HAIR.base); }
      for (let r = 7; r < 12; r++) b.set(x + 1, y + r, HAIR.sh);
    } else {
      for (let r = -1; r < h - 4; r++) for (let c = L(r + 1); c <= w - 1 - L(r + 1); c++) b.set(x + c, y + r, r < 1 ? HAIR.hi : c === L(r + 1) ? HAIR.lt : c === w - 1 - L(r + 1) ? HAIR.sh : (r % 3 === 0 && c % 2 === 0) ? HAIR.lt : HAIR.base);
    }
  },
  torsoDetail(b, sk) {
    const rows = sk.rows, view = sk.view;
    const cx = R(sk.shC[0]), top = R(sk.shY);
    // ceremonial sash: shoulder to opposite hip (front/back), a band at the side
    if (view !== 'side') {
      const n = rows.length;
      for (let i = 1; i < n - 1; i++) {
        const row = rows[i]; const t = i / (n - 1);
        const sx = view === 'front' ? Math.round(row.l + (row.r - row.l) * (0.15 + 0.7 * t)) : Math.round(row.r - (row.r - row.l) * (0.15 + 0.7 * t));
        for (let q = -2; q <= 2; q++) b.set(sx + q, row.y, q === -2 ? SASH.lt : q === 2 ? SASH.dk : q === 0 ? GOLDR.base : SASH.base);
      }
    } else { for (let i = 2; i < rows.length - 2; i++) b.set(rows[i].l + 2, rows[i].y, SASH.base); }
    if (view === 'front') {
      // gold medallion lanyard (Act 4) — glowing
      for (let k = 0; k < 10; k++) { b.set(cx - 3 + Math.round(k * 0.2), top + 2 + k, SASH.base); b.set(cx + 3 - Math.round(k * 0.2), top + 2 + k, SASH.base); }
      b.ellipse(cx, top + 14, 2.5, 2.5, GOLDR.base); b.set(cx - 1, top + 13, GOLDR.hi); b.set(cx, top + 14, GLOW);
      // pocket square + waistcoat buttons
      const r3 = rows[5]; if (r3) { b.set(r3.r - 4, r3.y, GOLDR.hi); b.set(r3.r - 3, r3.y, GOLDR.base); }
    }
  },
  over(b, sk) {
    // gold cufflinks
    for (const i of [0, 1] as const) { const h = sk.ha[i]; b.set(R(h[0]) + (i ? 1 : -1), R(h[1]) - 3, GOLDR.hi); }
  },
};

function P0(): FigPose { const p = basePose(); p.expr = 'grin'; return p; }

function idle(f: number, v: View): FigPose {
  const p = P0();
  p.crouch = f % 2;
  p.legs = v === 'side' ? [[3, 0], [-3, 0]] : [[2, 0], [2, 0]];
  // club resting on the shoulder, other hand in pocket
  p.arms = v === 'side' ? [[3, -4], [-2, 20]] : [[-2, -6], [2, 20]];
  p.item = { kind: 'club', angle: v === 'side' ? -2.4 : v === 'front' ? -1.15 : -1.9 };
  p.expr = f === 3 ? 'blink' : 'grin';
  return p;
}
function walk(f: number, v: View, n: number): FigPose {
  const p = P0();
  p.legs = walkLegs(v, f / n, 7, 4);
  const sw = Math.sin((f / n) * Math.PI * 2);
  p.arms = v === 'side' ? [[3, -4], [-sw * 6, 20]] : [[-2, -6], [3, 20]];
  p.item = { kind: 'club', angle: v === 'side' ? -2.4 : v === 'front' ? -1.15 : -1.9 };
  p.crouch = f % 3 === 0 ? 1 : 0;
  return p;
}
function run(f: number, v: View, n: number): FigPose {
  const p = P0();
  p.expr = 'shock';
  p.legs = walkLegs(v, f / n, 11, 7);
  p.lean = v === 'side' ? 6 : 0;
  const sw = Math.sin((f / n) * Math.PI * 2);
  p.arms = v === 'side' ? [[sw * 10, 12], [-sw * 10, 12]] : [[6, 12 + sw * 3], [6, 12 - sw * 3]];
  p.item2 = { kind: 'briefcase', angle: 0 };
  return p;
}
function swingW(f: number, v: View): FigPose {
  const p = P0(); p.expr = 'focus';
  p.legs = v === 'side' ? [[6, 0], [-6, 0]] : [[4, 0], [4, 0]]; p.crouch = 2;
  if (v === 'side') { p.arms = [[-10, -12 - f * 2], [-6, -10]]; p.arm0Behind = true; p.item = { kind: 'club', angle: -2.6 }; }
  else { p.arms = [[-6, -16 - f * 2], [-4, -14]]; p.item = { kind: 'club', angle: -1.9 }; }
  return p;
}
function swing(f: number, v: View): FigPose {
  const p = P0(); p.expr = 'shout';
  const k = Math.min(1, f / 2);
  p.legs = v === 'side' ? [[9, 0], [-7, 1]] : [[5, 0], [5, 0]]; p.crouch = 3; p.lean = v === 'side' ? 5 : 0;
  if (v === 'side') { p.arms = [[16 * (0.4 + 0.6 * k), 4 + 10 * k], [14 * (0.4 + 0.6 * k), 6 + 8 * k]]; p.item = { kind: 'club', angle: -0.8 + 1.6 * k }; p.arm1Front = true; }
  else { p.arms = [[-2 + 12 * k, 10 + 6 * k], [4 + 4 * k, 12]]; p.item = { kind: 'club', angle: 0.5 + 1.5 * k }; }
  return p;
}
function drive(f: number, v: View): FigPose {
  // golf drive: address → follow-through over the shoulder
  const p = P0(); p.expr = f === 0 ? 'focus' : 'grin';
  p.legs = v === 'side' ? [[7, 0], [-7, 0]] : [[6, 0], [6, 0]];
  p.crouch = f === 0 ? 3 : 1;
  if (f === 0) { p.arms = v === 'side' ? [[6, 22], [5, 22]] : [[-2, 22], [-2, 22]]; p.item = { kind: 'club', angle: 1.7 }; }
  else { p.arms = v === 'side' ? [[-6, -16], [-4, -14]] : [[8, -16], [6, -14]]; p.item = { kind: 'club', angle: v === 'side' ? -2.6 : -0.6 }; p.lean = v === 'side' ? -3 : 0; }
  p.arm1Front = true;
  return p;
}
function speech(f: number, v: View): FigPose {
  // arms raised to the faithful
  const p = P0();
  p.expr = f % 2 ? 'talk' : 'grin';
  p.legs = v === 'side' ? [[3, 0], [-3, 0]] : [[3, 0], [3, 0]];
  p.head = [0, -1];
  p.arms = v === 'side' ? [[8, -20 + f], [-4, -20 + f]] : [[12, -20 + (f % 2)], [12, -20 + ((f + 1) % 2)]];
  return p;
}
function pose(f: number, v: View): FigPose {
  // power pose: hands on hips, chest out, chin up
  const p = P0();
  p.expr = 'smug';
  p.legs = v === 'side' ? [[6, 0], [-6, 0]] : [[6, 0], [6, 0]];
  p.crouch = -1 + (f % 2);
  p.head = [0, -2];
  p.lean = v === 'side' ? -2 : 0;
  p.arms = v === 'side' ? [[-2, 12], [-3, 12]] : [[9, 11], [9, 11]];
  return p;
}
function hurt(_f: number, v: View): FigPose {
  const p = P0(); p.expr = 'pain'; p.crouch = 2; p.lean = v === 'side' ? -4 : 0; p.head = [v === 'side' ? -2 : 1, 1];
  p.legs = v === 'side' ? [[3, 0], [-6, 0]] : [[2, 0], [3, 0]];
  p.arms = v === 'side' ? [[8, 6], [-6, 10]] : [[10, 8], [9, 8]];
  return p;
}
function stagger(f: number, v: View): FigPose {
  const p = P0(); p.expr = f % 3 === 0 ? 'dazed' : 'pain';
  p.crouch = 12; p.bend = 3; p.lean = v === 'side' ? 5 : 0; p.head = [Math.round(Math.sin(f * 1.7) * 2), 3];
  p.legs = v === 'side' ? [[12, 2], [-8, 7]] : [[7, 0], [5, 6]];
  p.arms = v === 'side' ? [[9, 19], [7, 19]] : [[8, 17], [10, 17]];
  return p;
}
function grabbed(f: number, v: View): FigPose {
  const p = P0(); p.expr = 'shock';
  p.legs = v === 'side' ? [[4 + f * 3, 3 + f], [-6, 0]] : [[3, f * 3], [3, 0]];
  p.arms = v === 'side' ? [[14, -8 + f * 4], [-12, -6]] : [[14, -6 + f * 4], [14, -4 - f * 3]];
  return p;
}
function intro(f: number, v: View): FigPose {
  // "Welcome to the family" — arms spread, veneers
  const p = P0();
  p.expr = f % 2 ? 'grin' : 'smug';
  p.legs = v === 'side' ? [[3, 0], [-3, 0]] : [[3, 0], [3, 0]];
  p.arms = v === 'side' ? [[16, 0], [-10, 2]] : [[16, 2 - (f % 2)], [16, 2 - (f % 2)]];
  return p;
}
function down(f: number, v: View): FigPose { const p = stagger(f, v); p.crouch = 15; p.expr = 'dazed'; p.head = [0, 5]; return p; }
function fall(f: number, v: View): FigPose {
  const p = P0(); p.expr = 'shock';
  p.legs = v === 'side' ? [[8 - f * 4, 6 + f * 2], [-6 + f * 4, 4]] : [[7, 6 + f * 3], [7, 3]];
  p.arms = v === 'side' ? [[16, -14 + f * 6], [-12, -12]] : [[16, -12 + f * 4], [16, -8 - f * 4]];
  return p;
}
function talk(f: number, v: View): FigPose {
  const p = idle(0, v);
  p.expr = f % 2 ? 'talk' : f === 2 ? 'smug' : 'grin';
  return p;
}

const anim = (frames: number, fps: number, loop: boolean, pose: AnimDef['pose']): AnimDef => ({ frames, fps, loop, pose });

export const CEO_ANIMS: Record<string, AnimDef> = {
  idle: anim(4, 3, true, idle),
  walk: anim(6, 9, true, walk),
  run: anim(6, 13, true, run),
  swing_w: anim(2, 6, false, swingW),
  swing: anim(3, 16, false, swing),
  drive: anim(2, 3, false, drive),
  speech: anim(2, 5, true, speech),
  pose: anim(2, 4, true, pose),
  talk: anim(4, 6, true, talk),
  hurt: anim(1, 8, false, hurt),
  stagger: anim(4, 5, true, stagger),
  grabbed: anim(2, 8, true, grabbed),
  intro: anim(2, 3, true, intro),
  down: anim(4, 3, true, down),
  fall: anim(2, 6, true, fall),
};

let art: BossArt | null = null;
export function ceoArt(): BossArt { return (art ??= new BossArt(CEO_SPEC, CEO_ANIMS)); }
