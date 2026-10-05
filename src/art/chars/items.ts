// Anchor items (spec 5.2 "always present, readable by silhouette"), lanyards (indoctrination),
// seniority/promotion flair, and body-worn kit. Held items sit in the LEFT (off) hand so the right
// hand stays free for the gameplay weapon layer drawn at hand().
import { PixBuf, C, Col, mixCol } from './pixbuf';
import type { Dress, HeldItem, View, Ramp } from './types';
import type { Skel, P2 } from './rig';
import { tcx, tx } from './rig';
import { ramp, GOLD, GOLD_HI, SILVER, WHITE } from './colours';

const rd = Math.round;
/** Mask tag for glowing pixels (lanyard, app screens). */
export const TAG_GLOW = 1;

// ---------------------------------------------------------------------------------------------
// Lanyards

export function drawLanyard(b: PixBuf, sk: Skel, d: Dress, glowMul: number): void {
  const ly = d.lanyard;
  if (!ly) return;
  const glowing = ly.glow !== null && glowMul > 0;
  const n = sk.rows.length;
  const y0 = sk.rows[0].y;
  const strap = ly.strap;
  const thick = ly.style === 'oversized';
  // ceremonial (Act 4) straps don't glow along their length; only the medallion does
  const tag = () => { b.tag = glowing && !ly.medallion ? TAG_GLOW : 0; };
  tag();
  if (sk.view === 'back') {
    const cx = tcx(sk, 0);
    for (let x = cx - 3; x <= cx + 2; x++) b.set(x, y0, x === cx - 3 || x === cx + 2 ? strap.base : strap.lt);
    if (thick) for (let x = cx - 2; x <= cx + 1; x++) b.set(x, y0 + 1, ly.edge ?? strap.sh);
    b.tag = 0;
    return;
  }
  const cardRow = ly.style === 'oversized' ? n - 3 : Math.round(n * 0.5);
  const cy = sk.rows[Math.min(n - 1, cardRow)].y;
  if (sk.view === 'side') {
    const r0 = sk.rows[0].r;
    for (let ri = 0; ri < cardRow; ri++) {
      const x = sk.rows[ri].r - (ri < 2 ? 2 : 1);
      b.set(x, sk.rows[ri].y, ri % 2 && ly.edge ? ly.edge : strap.base);
      if (thick) b.set(x - 1, sk.rows[ri].y, strap.sh);
    }
    void r0;
    const cx = sk.rows[cardRow].r;
    drawCard(b, cx - 1, cy, ly.style === 'oversized' ? 3 : 2, ly.style === 'oversized' ? 5 : 4, d);
    b.tag = 0;
    return;
  }
  const cx = tcx(sk, 0);
  const lx0 = cx - 3, rx0 = cx + 2;
  const lx1 = cx - 1, rx1 = cx;
  for (let ri = 0; ri < cardRow; ri++) {
    const t = ri / Math.max(1, cardRow);
    const y = sk.rows[ri].y;
    const xl = rd(lx0 + (lx1 - lx0) * t), xr = rd(rx0 + (rx1 - rx0) * t);
    const cA = ly.edge && ri % 2 ? ly.edge : strap.lt, cB = ly.edge && ri % 2 ? ly.edge : strap.base;
    b.set(xl, y, cA); b.set(xr, y, cB);
    if (thick) { b.set(xl - 1, y, strap.base); b.set(xr + 1, y, strap.sh); }
    if (ly.pins.length && ri % 2 === 1) {
      const pc = ly.pins[(ri >> 1) % ly.pins.length];
      b.set(xl - (thick ? 1 : 0), y, pc); if (ri > 1) b.set(xr, y, ly.pins[((ri >> 1) + 1) % ly.pins.length]);
    }
  }
  if (ly.style === 'wellbeing') {
    // heart charm
    const hc = C('#f07a8c'), hs = C('#c04a62');
    b.set(cx - 2, cy, hc); b.set(cx, cy, hc); b.set(cx - 1, cy + 1, hc); b.set(cx - 2, cy + 1, hc); b.set(cx, cy + 1, hs); b.set(cx - 1, cy + 2, hs);
    b.set(cx - 1, cy, C('#ffc0c8'));
  } else if (ly.medallion) {
    const g = ramp(GOLD);
    b.tag = glowing ? TAG_GLOW : 0;
    b.set(cx - 1, cy, g.lt); b.set(cx, cy, g.base);
    b.set(cx - 2, cy + 1, g.lt); b.set(cx - 1, cy + 1, C(GOLD_HI)); b.set(cx, cy + 1, g.base); b.set(cx + 1, cy + 1, g.sh);
    b.set(cx - 1, cy + 2, g.sh); b.set(cx, cy + 2, g.dk);
    b.tag = 0;
  } else {
    const w = ly.style === 'oversized' ? 5 : 3, h = ly.style === 'oversized' ? 6 : 4;
    drawCard(b, cx - Math.ceil(w / 2), cy, w, h, d);
  }
  b.tag = 0;
}

function drawCard(b: PixBuf, x: number, y: number, w: number, h: number, d: Dress): void {
  const ly = d.lanyard!;
  const card = ly.card;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = card.base;
    if (j === 0) c = ly.strap.base;
    else if (i === w - 1 || j === h - 1) c = card.sh;
    b.set(x + i, y + j, c);
  }
  if (w >= 3 && h >= 4) {
    b.set(x + 1, y + 1 + (h > 4 ? 1 : 0), d.skin.base); // photo
    if (w >= 5) { b.set(x + 2, y + 2, d.hair.base); b.set(x + 3, y + 2, card.sh); b.set(x + 3, y + 3, card.sh); b.set(x + 1, y + 4, card.sh); b.set(x + 2, y + 4, card.sh); }
  }
}

// ---------------------------------------------------------------------------------------------
// Chest flair (seniority badges, promotion rosette / crown) and small worn items

export function drawFlair(b: PixBuf, sk: Skel, d: Dress): void {
  if (sk.view === 'back') return;
  const f = d.flair;
  const n = sk.rows.length;
  const side = sk.view === 'side';
  const ax = (ri: number) => (side ? sk.rows[ri].r - 2 : tx(sk, ri, 0.55));
  const g = ramp(GOLD);
  let ri = 2;
  if (f.crown) {
    const x = ax(2) - 2, y = sk.rows[2].y - 1;
    b.set(x, y, g.lt); b.set(x + 2, y - 1, C(GOLD_HI)); b.set(x + 4, y, g.base);
    b.hline(x, x + 4, y + 1, g.base); b.hline(x, x + 4, y + 2, g.sh);
    b.set(x + 2, y + 1, C('#c03040')); b.set(x + 1, y + 1, g.lt);
    ri = 5;
  } else if (f.rosette) {
    const x = ax(2) - 1, y = sk.rows[2].y;
    const rc = C('#3a6ad0'), rl = C('#7aa0f0');
    b.set(x, y, rl); b.set(x + 1, y, rc); b.set(x + 2, y, rc); b.set(x, y + 1, rc); b.set(x + 1, y + 1, g.lt); b.set(x + 2, y + 1, rc); b.set(x, y + 2, rc); b.set(x + 1, y + 2, rc); b.set(x + 2, y + 2, mixCol(rc, C('#000000'), 0.3));
    b.set(x, y + 3, C('#c03040')); b.set(x + 2, y + 3, C('#c03040')); b.set(x, y + 4, C('#901828'));
    ri = 6;
  }
  for (let k = 0; k < f.badges && ri < n - 1; k++, ri += 2) {
    const x = ax(ri) + (k % 2), y = sk.rows[ri].y;
    b.set(x, y, k === 0 ? g.lt : k === 1 ? C(SILVER) : C('#c03040'));
  }
  if (d.worn.includes('eotm_badge')) {
    const x = side ? sk.rows[2].r - 2 : tx(sk, 2, -0.5), y = sk.rows[2].y;
    b.set(x, y, g.lt); b.set(x - 1, y + 1, g.base); b.set(x, y + 1, C(GOLD_HI)); b.set(x + 1, y + 1, g.base); b.set(x, y + 2, g.sh);
  }
  if (d.worn.includes('visitor_sticker')) {
    const x = side ? sk.rows[2].r - 3 : tx(sk, 2, -0.55) - 1, y = sk.rows[2].y;
    b.hline(x, x + 2, y, C('#3a6ad0')); b.hline(x, x + 2, y + 1, WHITE); b.set(x + 1, y + 1, C('#5a5a64'));
  }
  if (d.worn.includes('red_pen')) {
    const x = side ? sk.rows[1].r - 2 : tx(sk, 1, 0.55), y = sk.rows[1].y;
    b.set(x, y - 1, C('#e04040')); b.set(x, y, C('#c03030')); b.set(x, y + 1, C('#8a2020'));
  }
}

/** Belt-level kit: tool belt, pouches, hip phone, slide clicker. Front/side only unless noted. */
export function drawBeltKit(b: PixBuf, sk: Skel, d: Dress): void {
  const n = sk.rows.length;
  const bot = sk.rows[n - 1];
  const view = sk.view;
  const leather = ramp('#7a5030');
  if (d.worn.includes('toolbelt')) {
    for (let x = bot.l; x <= bot.r; x++) b.set(x, bot.y, leather.base);
    if (view !== 'side') {
      for (const s of [-1, 1]) {
        const x = s < 0 ? bot.l - 1 : bot.r - 1;
        b.rect(x, bot.y + 1, 2, 3, leather.base); b.set(x, bot.y + 1, leather.lt); b.set(x + 1, bot.y + 3, leather.sh);
      }
      b.set(bot.r, bot.y - 2, C('#8a8e98')); b.set(bot.r, bot.y - 1, leather.sh);
    } else { b.rect(bot.l + 1, bot.y + 1, 2, 3, leather.base); b.set(bot.l + 1, bot.y + 1, leather.lt); }
  }
  if (d.worn.includes('pouch') && view !== 'back') {
    const x = view === 'side' ? bot.l + 1 : bot.r - 2;
    b.rect(x, bot.y, 2, 2, C('#30343c')); b.set(x, bot.y, C('#4a505a'));
  }
  if (d.worn.includes('hip_phone') && view !== 'back') {
    const x = view === 'side' ? bot.r - 1 : bot.l;
    b.rect(x, bot.y - 1, 2, 3, C('#22242a')); b.set(x, bot.y - 1, C('#6aa8f0'));
  }
  if (d.worn.includes('clicker') && view !== 'back') {
    const x = view === 'side' ? bot.r - 2 : tcx(sk, n - 1) + 1;
    b.set(x, bot.y, C('#22242a')); b.set(x + 1, bot.y, C('#22242a')); b.set(x, bot.y + 1, C('#e04040')); b.set(x + 1, bot.y + 1, C('#40c060'));
  }
}

/** Bags and packs hanging off the body. `layer`: 'behind' (before torso) or 'over' (after torso). */
export function drawBag(b: PixBuf, sk: Skel, d: Dress, layer: 'behind' | 'over'): void {
  const view = sk.view;
  const n = sk.rows.length;
  if (d.worn.includes('tote')) {
    const canvas = ramp('#e2d6b6'), strap = ramp('#b8a882');
    const accent = d.wornCol;
    // character's left hip: screen-right in front view, screen-left in back view, far side in side view
    const behind = view === 'side' || view === 'front' ? false : false;
    const onLayer = view === 'side' ? 'behind' : 'over';
    if (layer === onLayer || behind) {
      const bot = sk.rows[n - 1];
      const bx = view === 'front' ? bot.r - 1 : view === 'back' ? bot.l - 4 : bot.l - 3;
      const by = bot.y - 3;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) b.set(bx + i, by + j, i === 0 ? canvas.lt : i === 4 || j === 5 ? canvas.sh : canvas.base);
      b.set(bx + 2, by + 2, accent.base); b.set(bx + 3, by + 2, accent.sh); b.set(bx + 2, by + 3, accent.sh);
      // strap up to the shoulder
      const shx = view === 'front' ? sk.rows[0].r - 1 : view === 'back' ? sk.rows[0].l + 1 : sk.rows[0].l + 1;
      b.line(shx, sk.rows[0].y, bx + (view === 'front' ? 1 : 3), by - 1, strap.base);
    }
  }
  if (d.worn.includes('backpack')) {
    const pack = d.wornCol;
    if (view === 'back' && layer === 'over') {
      const x0 = tcx(sk, 1) - 4, y0 = sk.rows[1].y;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) b.set(x0 + i, y0 + j, i === 0 ? pack.lt : i === 7 || j === 7 ? pack.sh : j === 0 ? pack.lt : pack.base);
      b.hline(x0 + 2, x0 + 5, y0 + 4, pack.sh); b.set(x0 + 4, y0 + 3, C(SILVER));
    } else if (view === 'side' && layer === 'behind') {
      const x0 = sk.rows[1].l - 3, y0 = sk.rows[1].y;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) b.set(x0 + i, y0 + j, i === 0 ? pack.lt : j === 7 ? pack.sh : pack.base);
    } else if (view === 'front' && layer === 'over') {
      for (let ri = 0; ri < Math.min(n - 2, 5); ri++) { b.set(tx(sk, ri, -0.7), sk.rows[ri].y, pack.sh); b.set(tx(sk, ri, 0.7), sk.rows[ri].y, pack.sh); }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Held items (left hand)

export interface HeldCtx { b: PixBuf; d: Dress; view: View; hand: P2; sk: Skel; frame: number; flip: boolean }

/** Items held in front of the torso are drawn after it even when the holding arm is on the far side. */
export function heldInFront(item: HeldItem): boolean {
  return item === 'tray' || item === 'shield_binder' || item === 'certificate' || item === 'clipboard' || item === 'tablet' || item === 'script' || item === 'calculator' || item === 'po_pad' || item === 'phone_app' || item === 'magnifier';
}

export function drawHeld(hc: HeldCtx): void {
  const { b, d, view } = hc;
  const item = d.held;
  if (!item) return;
  const hx = rd(hc.hand[0]), hy = rd(hc.hand[1]);
  const s = view === 'back' ? -1 : 1; // mirror horizontal offsets for the back view
  const ic = d.heldCol;
  switch (item) {
    case 'tray': {
      const tray = ramp('#c49a62');
      const cup = ramp('#f2eee6'), lid = ramp('#6a4a32'), sleeve = ramp('#b98a52');
      const w = view === 'side' ? 6 : 9;
      const x0 = view === 'side' ? hx - 2 : hx - 5;
      const ty = hy - 1;
      // cups: back row higher, front row lower, staggered
      const cups = view === 'side' ? [[0, -1], [3, -1], [1, 0], [4, 0]] : [[0, -1], [4, -1], [2, 0], [6, 0]];
      for (const [cx, cyo] of cups) {
        const x = x0 + cx + (view === 'side' ? 0 : 0), y = ty - 4 + cyo;
        b.set(x, y, lid.lt); b.set(x + 1, y, lid.base);
        b.set(x, y + 1, cup.base); b.set(x + 1, y + 1, cup.sh);
        b.set(x, y + 2, sleeve.lt); b.set(x + 1, y + 2, sleeve.sh);
        b.set(x, y + 3, cup.base); b.set(x + 1, y + 3, cup.sh);
      }
      for (let i = 0; i < w; i++) { b.set(x0 + i, ty, i === 0 ? tray.hi : tray.lt); b.set(x0 + i, ty + 1, i === w - 1 ? tray.dk : tray.sh); }
      break;
    }
    case 'mop': {
      const pole = ramp('#3a7ac0'), head = ramp('#d8d2c2');
      const top = hy - 20, bot = hy + 8;
      for (let y = top; y <= bot; y++) b.set(hx, y, y < top + 2 ? C('#2a2c34') : (y - top) % 5 === 0 ? pole.lt : pole.base);
      // mop head: metal clamp + splayed strands
      b.hline(hx - 2, hx + 2, bot, C('#7a7e88')); b.set(hx - 2, bot, C('#a8aeb8'));
      for (let j = 1; j <= 4; j++) {
        const half = j === 1 ? 2 : j === 2 ? 3 : 4;
        for (let i = -half; i <= half; i++) b.set(hx + i, bot + j, j === 4 ? ((i & 1) ? head.sh : head.base) : (i + j) % 2 ? head.base : i < 0 ? head.lt : head.sh);
      }
      b.set(hx - 4, bot + 4, head.lt);
      break;
    }
    case 'reel': {
      const or = ramp('#e07a2a'), cab = ramp('#2c2e36');
      b.set(hx, hy + 1, C('#3a3c44'));
      const cx = hx, cy = hy + 5;
      b.ellipse(cx, cy, 3.4, 3.4, or.base);
      for (let a = 0; a < 8; a++) { const x = rd(cx + Math.cos(a) * 2.2), y = rd(cy + Math.sin(a) * 2.2); b.set(x, y, cab.base); }
      b.set(cx - 2, cy - 2, or.hi); b.set(cx - 1, cy - 3, or.lt); b.set(cx + 2, cy + 2, or.sh); b.set(cx + 3, cy + 1, or.sh);
      b.set(cx, cy, cab.dk);
      b.set(cx + 3, cy + 3, cab.base); b.set(cx + 4, cy + 4, cab.base);
      break;
    }
    case 'can': {
      const can = ramp('#5ad04a');
      b.set(hx, hy - 3, C('#c8ccd4')); b.set(hx + 1, hy - 3, C('#9aa0a8'));
      for (let j = -2; j <= 1; j++) { b.set(hx, hy + j, j === 0 ? C('#1e2a20') : can.lt); b.set(hx + 1, hy + j, j === 0 ? C('#1e2a20') : can.sh); }
      break;
    }
    case 'latte': {
      const lid = ramp('#efeae0'), cup = ramp('#f4f0e8'), slv = ramp('#a8784a');
      b.hline(hx - 1, hx + 1, hy - 4, lid.lt); b.set(hx + 1, hy - 4, lid.sh);
      for (let j = -3; j <= 0; j++) { b.set(hx - 1, hy + j, j === -2 || j === -1 ? slv.lt : cup.base); b.set(hx, hy + j, j === -2 || j === -1 ? slv.base : cup.base); b.set(hx + 1, hy + j, j === -2 || j === -1 ? slv.sh : cup.sh); }
      break;
    }
    case 'mug': {
      const m = ic;
      for (let j = -3; j <= -1; j++) { b.set(hx - 1, hy + j, m.lt); b.set(hx, hy + j, m.base); b.set(hx + 1, hy + j, m.sh); }
      b.set(hx - 1, hy - 3, C('#5a3a24')); b.set(hx, hy - 3, C('#4a2e1c'));
      b.set(hx + 2 * s, hy - 2, m.sh);
      break;
    }
    case 'script': case 'clipboard': case 'calculator': case 'po_pad': case 'tablet': case 'certificate': case 'phone_app': {
      if (view === 'back') { b.set(hx - 3, hy - 2, ic.sh); b.set(hx - 3, hy - 1, ic.sh); break; }
      if (view === 'side') {
        const h = item === 'certificate' ? 7 : item === 'phone_app' ? 4 : 6;
        const c1 = item === 'certificate' ? ramp(GOLD) : item === 'clipboard' ? ramp('#9a6a3a') : ic;
        for (let j = 0; j < h; j++) { b.set(hx + 1, hy - h + 2 + j, j === 0 ? c1.lt : c1.base); b.set(hx + 2, hy - h + 2 + j, c1.sh); }
        if (item === 'script' || item === 'po_pad') for (let j = 1; j < h - 1; j++) b.set(hx + 2, hy - h + 2 + j, C('#ecebe4'));
        if (item === 'phone_app') { b.tag = TAG_GLOW; b.set(hx + 2, hy - 1, C('#8ff0c8')); b.tag = 0; }
        break;
      }
      drawFlatItem(b, item, hx, hy, ic, d);
      break;
    }
    case 'briefcase': {
      const bc = ic;
      b.hline(hx - 1, hx + 1, hy + 1, C('#2a1e16'));
      const x0 = hx - 3, y0 = hy + 2, w = view === 'side' ? 5 : 7;
      const xs = view === 'side' ? hx - 2 : x0;
      for (let j = 0; j < 5; j++) for (let i = 0; i < w; i++) b.set(xs + i, y0 + j, i === 0 || j === 0 ? bc.lt : i === w - 1 || j === 4 ? bc.sh : bc.base);
      b.set(xs + Math.floor(w / 2), y0 + 1, C(GOLD));
      b.hline(xs + 1, xs + w - 2, y0 + 2, bc.dk);
      break;
    }
    case 'shield_binder': {
      const cv = ic, pg = ramp('#efece2');
      if (view === 'side') {
        // seen edge-on: thick cover in front, chunky spine of pages on top
        const x0 = hx - 1, y0 = hy - 10;
        for (let j = 0; j < 15; j++) for (let i = 0; i < 6; i++) {
          let c = i >= 4 ? (i === 5 ? cv.sh : cv.base) : j === 0 ? pg.hi : i === 0 ? cv.lt : j === 14 ? cv.sh : pg.base;
          if (i < 4 && j > 0 && j < 14 && i > 0) c = (j % 5 === 0) ? pg.sh : pg.base;
          if (i === 0) c = cv.lt;
          b.set(x0 + i, y0 + j, c);
        }
        b.set(x0, y0, cv.hi);
        b.set(x0 + 4, y0 + 5, pg.hi); b.set(x0 + 4, y0 + 6, pg.hi); b.set(x0 + 4, y0 + 7, pg.base);
        break;
      }
      if (view === 'back') {
        const cx = tcx(hc.sk, 3);
        for (let j = 0; j < 14; j++) { b.set(cx - 7, hy - 9 + j, cv.sh); b.set(cx + 6, hy - 9 + j, cv.sh); }
        break;
      }
      const W = 12, H = 15;
      const cx = tcx(hc.sk, 3);
      const x0 = cx - 6, y0 = hy - 10;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        let c = cv.base;
        if (i <= 1) c = i === 0 ? cv.lt : cv.sh; // spine
        else if (j === 0) c = cv.lt;
        else if (i === W - 1 || j === H - 1) c = cv.sh;
        b.set(x0 + i, y0 + j, c);
      }
      b.set(x0, y0, cv.hi);
      // pages edge peeking at the bottom-right, spine label, front label "POLICY"
      for (let i = 3; i < W - 1; i++) b.set(x0 + i, y0 + H - 1, pg.sh);
      b.set(x0 + W - 1, y0 + H - 2, pg.base);
      b.set(x0 + 1, y0 + 3, pg.base); b.set(x0 + 1, y0 + 4, pg.sh);
      const lx = x0 + 4, ly = y0 + 3;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) b.set(lx + i, ly + j, j === 0 || i === 0 ? pg.hi : pg.base);
      b.hline(lx + 1, lx + 4, ly + 1, cv.dk); b.hline(lx + 1, lx + 3, ly + 3, cv.sh);
      // ring clasp
      b.set(x0 + 1, y0 + 9, C(SILVER)); b.set(x0 + 1, y0 + 10, C('#8a909a'));
      break;
    }
    case 'magnifier': {
      const ring = ramp('#b8902a'), glass = C('#cfe8f4'), glassSh = C('#9cc4d8'), handle = ramp('#5a3a22');
      const cx = hx + (view === 'side' ? 2 : -1 * s), cy = hy - 4;
      for (let j = 1; j <= 3; j++) b.set(hx, hy + j - 1, j === 1 ? ring.sh : handle.base);
      for (let a = 0; a < 16; a++) {
        const x = rd(cx + Math.cos(a / 16 * Math.PI * 2) * 2.6), y = rd(cy + Math.sin(a / 16 * Math.PI * 2) * 2.6);
        b.set(x, y, a > 8 && a < 14 ? ring.lt : a < 4 ? ring.sh : ring.base);
      }
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) b.set(cx + i, cy + j, i + j > 0 ? glassSh : glass);
      b.set(cx - 1, cy - 1, WHITE);
      if (view === 'front') { b.set(cx, cy, C('#1a1218')); b.set(cx + 1, cy, C('#1a1218')); b.set(cx, cy + 1, C('#1a1218')); }
      break;
    }
    case 'golf_club': {
      const shaft = C('#c8ced8'), shaftSh = C('#7c828c'), grip = C('#24262c'), head = ramp('#b8bec8');
      let ex: number, ey: number;
      if (view === 'front') { ex = hx + 4; ey = hy - 14; }
      else if (view === 'back') { ex = hx - 5; ey = hy - 14; }
      else { ex = hx - 10; ey = hy - 12; }
      b.line(hx, hy, ex, ey, shaft);
      b.line(hx + 1, hy, ex + 1, ey, shaftSh);
      b.set(hx, hy + 1, grip); b.set(hx, hy, grip); b.set(hx + 1, hy, grip);
      // driver head: a chunky wedge so the silhouette reads as a club, not a stick
      const dx = view === 'side' ? -1 : view === 'back' ? -1 : 1;
      b.set(ex, ey - 1, head.lt); b.set(ex + dx, ey - 1, head.base); b.set(ex + dx * 2, ey - 1, head.base); b.set(ex + dx * 3, ey - 1, head.sh);
      b.set(ex + dx, ey - 2, head.hi); b.set(ex + dx * 2, ey - 2, head.lt);
      b.set(ex + dx * 2, ey, head.sh); b.set(ex + dx * 3, ey, head.dk);
      break;
    }
    case 'laser': {
      const body = ramp('#9aa2ae'), red = C('#ff3a30');
      if (view === 'front') { b.set(hx + 1, hy + 1, body.lt); b.set(hx + 2, hy + 2, body.base); b.set(hx + 3, hy + 3, red); }
      else if (view === 'side') { b.hline(hx + 1, hx + 4, hy - 1, body.lt); b.hline(hx + 1, hx + 4, hy, body.sh); b.set(hx + 5, hy - 1, red); b.set(hx + 5, hy, C('#c02020')); }
      else { b.set(hx - 1, hy - 1, body.base); }
      break;
    }
  }
}

function drawFlatItem(b: PixBuf, item: HeldItem, hx: number, hy: number, ic: Ramp, d: Dress): void {
  void d;
  switch (item) {
    case 'clipboard': {
      const brd = ramp('#9a6a3a'), pp = ramp('#f2f0e8');
      const x0 = hx - 3, y0 = hy - 6;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) b.set(x0 + i, y0 + j, i === 0 || j === 0 ? brd.lt : i === 5 || j === 7 ? brd.sh : brd.base);
      for (let j = 1; j < 7; j++) for (let i = 1; i < 5; i++) b.set(x0 + i, y0 + j, j % 2 === 0 && i < 4 ? C('#9aa0aa') : pp.base);
      b.set(x0 + 2, y0, C(SILVER)); b.set(x0 + 3, y0, C('#8a909a')); b.set(x0 + 2, y0 - 1, C(SILVER));
      // tick box
      b.set(x0 + 4, y0 + 2, C('#40a050'));
      break;
    }
    case 'script': {
      const x0 = hx - 3, y0 = hy - 6;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) b.set(x0 + i, y0 + j, i === 0 || j === 0 ? ic.lt : i === 4 ? C('#ecebe4') : j === 6 ? ic.sh : ic.base);
      b.set(x0 + 2, y0 + 2, C('#ecebe4')); b.set(x0 + 3, y0 + 2, C('#ecebe4'));
      break;
    }
    case 'calculator': {
      const body = ramp('#3a3c44');
      const x0 = hx - 2, y0 = hy - 6;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) b.set(x0 + i, y0 + j, i === 0 || j === 0 ? body.lt : i === 4 || j === 6 ? body.dk : body.base);
      b.hline(x0 + 1, x0 + 3, y0 + 1, C('#9ad08a')); b.set(x0 + 3, y0 + 1, C('#6aa05a'));
      for (let j = 3; j <= 5; j++) for (let i = 1; i <= 3; i += 1) if ((i + j) % 2 === 0) b.set(x0 + i, y0 + j, j === 5 && i === 3 ? C('#e07a2a') : C('#c8ccd4'));
      break;
    }
    case 'po_pad': {
      const x0 = hx - 2, y0 = hy - 6;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
        let c = C('#f4f2ea');
        if (i === 4) c = j % 2 ? C('#f0c8d0') : C('#f0e4a8');
        if (j === 6) c = C('#f0c8d0');
        if (j === 0) c = ic.base;
        b.set(x0 + i, y0 + j, c);
      }
      b.hline(x0 + 1, x0 + 3, y0 + 2, C('#a0a6b0')); b.hline(x0 + 1, x0 + 2, y0 + 4, C('#a0a6b0'));
      b.set(x0 + 3, y0 + 4, C('#3050c0')); b.set(x0 + 3, y0 + 5, C('#3050c0'));
      break;
    }
    case 'tablet': {
      const fr = ramp('#2a2c34');
      const x0 = hx - 4, y0 = hy - 5;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) b.set(x0 + i, y0 + j, i === 0 || j === 0 ? fr.lt : i === 6 || j === 5 ? fr.dk : fr.base);
      for (let j = 1; j < 5; j++) for (let i = 1; i < 6; i++) b.set(x0 + i, y0 + j, j === 1 ? C('#8ac4f0') : (i + j) % 3 === 0 ? C('#3a78b8') : C('#5aa0e0'));
      break;
    }
    case 'certificate': {
      const g = ramp(GOLD), pp = ramp('#f4ecd4');
      const x0 = hx - 5, y0 = hy - 7;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
        const frame = i === 0 || j === 0 || i === 8 || j === 6;
        b.set(x0 + i, y0 + j, frame ? (i === 0 || j === 0 ? g.lt : g.sh) : pp.base);
      }
      b.set(x0, y0, C(GOLD_HI));
      b.hline(x0 + 2, x0 + 6, y0 + 2, C('#8a7a5a'));
      b.hline(x0 + 3, x0 + 5, y0 + 3, C('#b0a080'));
      b.set(x0 + 6, y0 + 4, C('#c03040')); b.set(x0 + 6, y0 + 5, C('#901828'));
      b.set(x0 + 4, y0 + 7, g.sh); b.set(x0 + 3, y0 + 8, g.sh); b.set(x0 + 5, y0 + 8, g.sh);
      break;
    }
    case 'phone_app': {
      const x0 = hx - 2, y0 = hy - 5;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) b.set(x0 + i, y0 + j, i === 0 || j === 0 ? C('#3a3c46') : C('#1e2028'));
      b.tag = TAG_GLOW;
      b.set(x0 + 1, y0 + 1, C('#9ff4d8')); b.set(x0 + 2, y0 + 1, C('#7ee8c8'));
      b.set(x0 + 1, y0 + 2, C('#7ee8c8')); b.set(x0 + 2, y0 + 2, C('#e8fff6'));
      b.set(x0 + 1, y0 + 3, C('#6ad8b8')); b.set(x0 + 2, y0 + 3, C('#7ee8c8'));
      b.set(x0 + 1, y0 + 4, C('#5ac8a8')); b.set(x0 + 2, y0 + 4, C('#6ad8b8'));
      b.tag = 0;
      break;
    }
  }
}

export function mixRamp(a: Col, b2: Col): Col { return mixCol(a, b2, 0.5); }
