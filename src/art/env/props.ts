// Prop sprites for every PropKind (spec 4.5 hazards, 4.7 execution objects, 9.1 readability).
// Top-down 3/4 view, 1 px dark outline, origin at the prop's base centre (PropDef x,y). Cached per
// (kind, state, footprint, facing, variant, frame, skin). States: intact / damaged / destroyed / active / used.
import type { PropKind } from '../../data/ids';
import type { PropDef } from '../../game/world-types';
import { TILE } from '../../game/world-types';
import type { Ctx, Sprite } from '../../render/canvas';
import { paint, sprite, rect, px, shade, mixHex, line, ellipse, withOutline, makeCanvas, ctx2d } from '../../render/canvas';
import { OUTLINE } from '../palette';
import type { Skin } from './skin';
import { box3, frame, h2, miniText, shadowEllipse } from './util';
import { buildExitSprite } from './doors';

export type PropState = 'intact' | 'damaged' | 'destroyed' | 'active' | 'used';

interface PP {
  s: Skin; st: PropState; f: 0 | 1 | 2 | 3; v: number; fr: number;
  W: number; D: number;       // footprint in px (width, depth)
  wall: boolean; kind: PropKind;
}
interface Art { c: HTMLCanvasElement; shadow?: [number, number] | null; /** px the base sits above the canvas bottom */ lift?: number; noOutline?: boolean }

const cache = new Map<string, Sprite>();

// ------------------------------------------------------------------------------------------------
// helpers

const mk = (w: number, h: number, fn: (g: Ctx) => void) => paint(Math.max(1, w), Math.max(1, h), fn);

function cracks(g: Ctx, x: number, y: number, w: number, h: number, seed: number, col = '#1a1a1a', n = 3): void {
  for (let k = 0; k < n; k++) {
    let cx = x + (h2(k, seed, 1) % Math.max(1, w)), cy = y + (h2(k, seed, 2) % Math.max(1, h));
    for (let i = 0; i < 5; i++) {
      px(g, cx, cy, col);
      cx += (h2(i, k, seed) % 3) - 1; cy += ((h2(k, i, seed) % 3) === 0 ? 0 : 1);
      if (cx < x || cx >= x + w || cy >= y + h) break;
    }
  }
}
function scorch(g: Ctx, x: number, y: number, w: number, h: number, seed: number): void {
  for (let i = 0; i < (w * h) / 6; i++) { const r = h2(i, seed, 9); g.fillStyle = `rgba(20,14,10,${0.35 + ((r >> 20) & 3) * 0.12})`; g.fillRect(x + (r % w), y + ((r >>> 8) % h), 2, 1); }
}
function smoke(g: Ctx, x: number, y: number, fr: number): void {
  const o = fr & 1;
  g.fillStyle = 'rgba(70,70,76,0.75)'; g.fillRect(x - 2 + o, y - 3, 4, 3); g.fillRect(x - 1 + o, y - 5, 3, 2);
  g.fillStyle = 'rgba(120,120,128,0.6)'; g.fillRect(x + 1 - o, y - 8, 4, 3); g.fillRect(x + 2 - o, y - 10, 2, 2);
}
function sparks(g: Ctx, x: number, y: number, fr: number, r = 4): void {
  const pts = fr & 1 ? [[0, -r], [r, -1], [-r + 1, 1], [1, r - 1]] : [[r - 1, -r + 1], [-r, -1], [0, r], [-1, -r]];
  for (const [dx, dy] of pts) { line(g, x, y, x + dx, y + dy, '#fff4c0'); px(g, x + dx, y + dy, '#ffd060'); }
  px(g, x, y, '#ffffff');
}
function debris(g: Ctx, w: number, h: number, cols: string[], seed: number, n = 14): void {
  for (let i = 0; i < n; i++) {
    const r = h2(i, seed, 5);
    const pw = 2 + (r & 3), ph = 1 + ((r >> 2) & 1);
    const x = r % Math.max(1, w - pw), y = (r >>> 8) % Math.max(1, h - ph);
    rect(g, x, y, pw, ph, cols[(r >>> 16) % cols.length]);
    rect(g, x, y, pw, 1, shade(cols[(r >>> 16) % cols.length], 0.2));
  }
}
/** Generic wreck: low pile of broken pieces in the prop's colours. */
function wreck(W: number, cols: string[], seed: number, hgt = 8): Art {
  return { c: mk(W, hgt + 2, (g) => { debris(g, W, hgt + 2, cols, seed, Math.max(6, (W * hgt) / 10)); }), shadow: [W / 2, 3] };
}
function legs(g: Ctx, x: number, y: number, h: number, col: string): void { rect(g, x, y, 2, h, col); rect(g, x, y, 1, h, shade(col, 0.2)); }

function monitor(g: Ctx, s: Skin, cx: number, by: number, back: boolean, on: boolean, broken = false): void {
  // 12 x 9 screen on a stand; by = base y
  rect(g, cx - 1, by - 3, 3, 3, s.metalDark);
  rect(g, cx - 3, by - 1, 7, 1, s.metalDark);
  if (back) { rect(g, cx - 6, by - 12, 12, 9, shade(s.metalDark, 0.15)); rect(g, cx - 6, by - 12, 12, 1, shade(s.metal, 0.1)); rect(g, cx - 2, by - 9, 4, 3, shade(s.metalDark, -0.2)); return; }
  rect(g, cx - 6, by - 12, 12, 9, '#16181e');
  rect(g, cx - 5, by - 11, 10, 7, on ? s.screen : '#0a0c10');
  if (on) {
    rect(g, cx - 4, by - 10, 6, 1, s.screenGlow); rect(g, cx - 4, by - 8, 8, 1, shade(s.screenGlow, -0.35)); rect(g, cx - 4, by - 6, 4, 1, shade(s.screenGlow, -0.2));
    px(g, cx + 3, by - 10, '#ffffff');
  }
  if (broken) { line(g, cx - 5, by - 11, cx + 2, by - 5, '#e8e8e8'); line(g, cx - 1, by - 11, cx + 4, by - 7, '#a0a0a0'); }
}
function keyboard(g: Ctx, x: number, y: number, w: number): void {
  rect(g, x, y, w, 3, '#c8ccd2'); rect(g, x, y + 2, w, 1, '#8a8e96');
  for (let i = 1; i < w - 1; i += 2) px(g, x + i, y + 1, '#e8eaee');
}
function papers(g: Ctx, s: Skin, x: number, y: number, n = 3): void {
  for (let i = 0; i < n; i++) rect(g, x + i, y - i, 6, 4, i % 2 ? s.paper : shade(s.paper, -0.06));
  rect(g, x + n - 1, y - n + 2, 4, 1, '#9a9aa0');
}
function mug(g: Ctx, x: number, y: number, col: string): void { rect(g, x, y, 3, 3, col); px(g, x + 3, y + 1, col); px(g, x + 1, y, '#3a2010'); }

// ------------------------------------------------------------------------------------------------
// furniture

function deskArt(p: PP): Art {
  const { s, st, f, v } = p;
  const vertical = p.D > p.W;
  if (st === 'destroyed') return wreck(p.W, [s.deskTop, s.deskSide, s.metalDark, s.paper], v + 3, vertical ? 12 : 8);
  const W = p.W, topD = vertical ? p.D - 6 : 12, frontH = 9, mon = 9;
  const H = mon + topD + frontH;
  return { shadow: [W / 2 + 1, 4], c: mk(W, H, (g) => {
    const ty = mon;
    // legs / pedestals
    rect(g, 0, ty + topD, W, frontH, shade(s.deskSide, -0.1));
    if (!vertical && f === 0) {
      rect(g, 6, ty + topD + 1, W - 12, frontH - 1, '#14161c'); // legroom
      rect(g, 0, ty + topD, 6, frontH, s.deskSide); rect(g, W - 6, ty + topD, 6, frontH, s.deskSide);
      rect(g, 1, ty + topD + 3, 4, 1, shade(s.deskSide, -0.3)); rect(g, 1, ty + topD + 6, 4, 1, shade(s.deskSide, -0.3));
      px(g, 3, ty + topD + 2, s.metal); px(g, 3, ty + topD + 5, s.metal);
    } else {
      rect(g, 0, ty + topD, W, frontH, s.deskSide);
      rect(g, 2, ty + topD + 2, W - 4, 1, shade(s.deskSide, 0.12));
    }
    rect(g, 0, ty + topD + frontH - 1, W, 1, shade(s.deskSide, -0.35));
    // top
    rect(g, 0, ty, W, topD, s.deskTop); rect(g, 0, ty, W, 1, s.deskTopHi); rect(g, 0, ty + topD - 1, W, 1, shade(s.deskTop, -0.15));
    if (s.act === 4) { rect(g, 0, ty + topD - 1, W, 1, s.metal); }
    // accessories
    const broken = st === 'damaged';
    if (!vertical) {
      const back = f === 2;
      const mx = (v & 1) ? 10 : W - 10;
      if (broken) { rect(g, mx - 6, ty + 3, 12, 5, '#16181e'); rect(g, mx - 5, ty + 4, 10, 3, '#0a0c10'); line(g, mx - 4, ty + 4, mx + 3, ty + 6, '#e0e0e0'); }
      else if (back) monitor(g, s, mx, ty + topD - 2, true, false);
      else monitor(g, s, mx, ty + 5, false, true);
      if (s.act === 2 && !broken && (v & 2)) { if (back) monitor(g, s, mx + (mx < W / 2 ? 12 : -12), ty + topD - 2, true, false); else monitor(g, s, mx + (mx < W / 2 ? 12 : -12), ty + 5, false, true); }
      if (!back) keyboard(g, (W >> 1) - 5, ty + topD - 4, 10); else keyboard(g, (W >> 1) - 5, ty + 2, 10);
      if (v & 4) papers(g, s, (v & 1) ? W - 9 : 2, ty + 7); else mug(g, (v & 1) ? W - 6 : 3, ty + 4, [s.brand, '#e8e8e8', '#c04040', '#3a6aa0'][v & 3]);
      if (s.act === 3 && (v & 2)) { rect(g, (v & 1) ? W - 5 : 2, ty - 3, 3, 5, '#2a6a3a'); rect(g, (v & 1) ? W - 6 : 1, ty - 4, 5, 2, '#3a8a4a'); }
      if (broken) { papers(g, s, 4, ty + topD - 3, 2); cracks(g, 2, ty + 1, W - 4, topD - 2, v + 11, shade(s.deskTop, -0.4), 2); }
    } else {
      // side-on desk (vertical footprint): monitor on the far side from the chair
      const mx = f === 1 ? 4 : W - 5;
      const my = ty + (topD >> 1) + 4;
      rect(g, mx - 1, my - 12, 3, 12, '#16181e'); rect(g, mx, my - 11, 1, 10, s.screenGlow);
      rect(g, mx - 2, my, 5, 2, s.metalDark);
      keyboard(g, f === 1 ? 7 : W - 10, my - 6, 4);
      if (v & 4) papers(g, s, 4, ty + 6); else mug(g, 6, ty + topD - 6, s.brand);
      if (broken) cracks(g, 1, ty + 1, W - 2, topD - 2, v + 5, shade(s.deskTop, -0.4), 2);
    }
  }) };
}

function deskLArt(p: PP): Art {
  const { s, st, v, f } = p;
  if (st === 'destroyed') return wreck(p.W, [s.deskTop, s.deskSide, s.metalDark], v + 7, 10);
  const W = p.W, topD = p.D - 6, frontH = 9, mon = 9, H = mon + topD + frontH;
  const cutLeft = f === 1 || f === 0 ? (v & 1) === 0 : (v & 1) === 1;
  return { shadow: [W / 2 + 1, 5], c: mk(W, H, (g) => {
    const ty = mon;
    // L-shape: back run full width; return on one side
    const rw = 14;
    const rx = cutLeft ? W - rw : 0;
    rect(g, rx, ty + 10, rw, topD - 10 + frontH, s.deskSide);
    rect(g, 0, ty + 10, W, frontH, s.deskSide);
    rect(g, 0, ty, W, 11, s.deskTop); rect(g, rx, ty, rw, topD, s.deskTop);
    rect(g, 0, ty, W, 1, s.deskTopHi);
    rect(g, rx, ty + topD, rw, frontH, shade(s.deskSide, -0.05)); rect(g, rx, ty + topD + frontH - 1, rw, 1, shade(s.deskSide, -0.35));
    rect(g, cutLeft ? 0 : rw, ty + 11 + frontH - 1, W - rw, 1, shade(s.deskSide, -0.35));
    monitor(g, s, rx + (cutLeft ? 4 : rw - 4), ty + 7, false, st !== 'damaged', st === 'damaged');
    keyboard(g, rx + 2, ty + 12, 10);
    papers(g, s, cutLeft ? 4 : W - 10, ty + 6);
    mug(g, cutLeft ? 12 : W - 15, ty + 4, s.brand);
  }) };
}

function counterArt(p: PP, high: boolean): Art {
  // reception desks / canteen counters / kitchen counters (stretchy)
  const { s, st, v, kind } = p;
  const W = p.W, vertical = p.D > p.W;
  if (st === 'destroyed') return wreck(W, [s.deskTop, s.deskSide, s.brand], v + 9, 10);
  const topD = Math.max(8, p.D - (high ? 4 : 6)), frontH = high ? 13 : 10;
  const H = topD + frontH + (kind === 'canteen_counter' ? 6 : 2);
  const isCanteen = kind === 'canteen_counter';
  const top = isCanteen ? (s.act === 4 ? '#e9e4dc' : '#c8ccd2') : s.deskTop;
  const front = isCanteen ? (s.act === 4 ? '#5c0e18' : shade(s.lino[2], -0.1)) : s.deskSide;
  return { shadow: [W / 2, 4], c: mk(W, H, (g) => {
    const ty = H - topD - frontH;
    rect(g, 0, ty, W, topD, top); rect(g, 0, ty, W, 1, shade(top, 0.25));
    rect(g, 0, ty + topD, W, frontH, front);
    rect(g, 0, ty + topD, W, 1, shade(front, 0.2)); rect(g, 0, ty + topD + frontH - 1, W, 1, shade(front, -0.35));
    if (kind === 'reception_desk') {
      // raised transaction ledge + brand band
      rect(g, 0, ty + topD - 3, W, 3, shade(s.deskTop, 0.1));
      rect(g, 0, ty + topD + 4, W, 3, s.brand); rect(g, 0, ty + topD + 4, W, 1, shade(s.brand, 0.3));
      if (W >= 32 && !vertical) { const cx = W >> 1; rect(g, cx - 4, ty + topD + 3, 8, 5, shade(s.brand, -0.3)); line(g, cx - 3, ty + topD + 7, cx, ty + topD + 4, s.paper); line(g, cx, ty + topD + 4, cx + 3, ty + topD + 7, s.paper); }
      monitor(g, s, 8, ty + topD - 2, true, false);
      if (W > 32) monitor(g, s, W - 10, ty + topD - 2, true, false);
      rect(g, (W >> 1) + 6, ty + 2, 4, 3, '#2a2a30'); // phone
      if (st === 'damaged') cracks(g, 0, ty + topD, W, frontH, v, '#101010', 4);
      return;
    }
    if (isCanteen) {
      // sneeze guard + trays + doors
      if (!vertical) {
        rect(g, 1, ty - 5, W - 2, 1, '#d0e8f0'); g.fillStyle = 'rgba(180,220,240,0.35)'; g.fillRect(1, ty - 4, W - 2, 4);
        for (let x = 3; x < W - 4; x += 9) { rect(g, x, ty + 2, 7, Math.max(2, topD - 4), '#7a7e86'); rect(g, x + 1, ty + 3, 5, Math.max(1, topD - 6), ['#c8803a', '#5a8a3a', '#d8c8a0', '#a83a2a'][(x >> 3) & 3]); }
      }
      for (let x = 2; x < W - 4; x += 8) { rect(g, x, ty + topD + 2, 6, frontH - 4, shade(front, 0.08)); px(g, x + 4, ty + topD + 5, s.metal); }
      if (st === 'damaged') cracks(g, 0, ty, W, topD + frontH, v, '#101010', 4);
      return;
    }
    // generic kitchen counter: cupboard doors, a few items
    for (let x = 1; x < W - 3; x += 8) { rect(g, x, ty + topD + 2, 6, frontH - 4, shade(front, 0.1)); px(g, x + 4, ty + topD + 4, s.metal); }
    if ((v & 1) && !vertical) { rect(g, 3, ty + 1, 4, 3, s.paper); }
    if (st === 'damaged') cracks(g, 0, ty, W, topD + frontH, v, '#101010', 3);
  }) };
}

function counterUnit(p: PP, top: (g: Ctx, ty: number) => void, extraH = 10): Art {
  // 16 x 16 counter section with an appliance on top
  const { s } = p;
  const W = 16, topD = 9, frontH = 10, H = extraH + topD + frontH;
  const ctop = s.act === 4 ? '#e9e4dc' : s.act === 3 ? '#8a8270' : '#c8ccd2';
  const cfront = s.act === 4 ? '#5c0e18' : s.act === 2 ? '#e8e8f0' : s.act === 3 ? '#4e3420' : '#b8b0a0';
  return { shadow: [9, 4], c: mk(W, H, (g) => {
    const ty = extraH;
    rect(g, 0, ty, W, topD, ctop); rect(g, 0, ty, W, 1, shade(ctop, 0.25));
    rect(g, 0, ty + topD, W, frontH, cfront); rect(g, 0, ty + topD, W, 1, shade(cfront, 0.2));
    rect(g, 2, ty + topD + 2, 12, frontH - 4, shade(cfront, 0.08)); px(g, 12, ty + topD + 4, s.metal);
    rect(g, 0, ty + topD + frontH - 1, W, 1, shade(cfront, -0.35));
    top(g, ty);
  }) };
}

function microwaveArt(p: PP): Art {
  const { st, fr } = p;
  return counterUnit(p, (g, ty) => {
    const y = ty - 7;
    const body = st === 'used' || st === 'destroyed' ? '#7a7e84' : '#d8dce0';
    rect(g, 1, y, 14, 10, body); rect(g, 1, y, 14, 1, '#f0f2f4');
    if (st === 'used' || st === 'destroyed') {
      rect(g, 2, y + 2, 8, 6, '#101214'); line(g, 2, y + 2, 9, y + 7, '#c8d8e0');
      rect(g, 0, y + 4, 2, 6, '#5a5e64'); // door hanging off
      scorch(g, 1, y, 14, 10, 3);
      if (st === 'used') smoke(g, 6, y, fr);
    } else {
      rect(g, 2, y + 2, 8, 6, '#2a3038'); rect(g, 3, y + 3, 6, 4, st === 'active' ? '#f0c060' : '#3a4450');
      if (st === 'damaged') { line(g, 3, y + 3, 8, y + 6, '#c8d8e0'); px(g, 1, y + 1, '#5a5e64'); }
      rect(g, 11, y + 2, 3, 6, '#9aa0a6'); px(g, 12, y + 3, '#40e070'); px(g, 12, y + 5, '#303438'); px(g, 12, y + 6, '#303438');
    }
  });
}
function kettleArt(p: PP): Art {
  return counterUnit(p, (g, ty) => {
    const col = p.s.act === 4 ? '#d4a537' : p.s.act === 2 ? p.s.brand : '#e8e8e8';
    rect(g, 3, ty - 7, 7, 8, col); rect(g, 3, ty - 7, 7, 1, shade(col, 0.3)); rect(g, 3, ty - 2, 7, 1, shade(col, -0.35)); px(g, 5, ty - 5, '#40a0e0'); rect(g, 10, ty - 4, 2, 3, shade(col, -0.2)); rect(g, 3, ty - 4, 1, 2, shade(col, -0.2));
    rect(g, 11, ty - 1, 4, 3, '#a85030'); // mugs
    if (p.st === 'damaged' || p.st === 'destroyed') { rect(g, 4, ty - 2, 6, 3, col); g.fillStyle = 'rgba(160,200,230,0.6)'; g.fillRect(2, ty + 2, 10, 3); }
  }, 8);
}
function knifeBlockArt(p: PP): Art {
  return counterUnit(p, (g, ty) => {
    rect(g, 5, ty - 5, 6, 7, '#6a4a30'); rect(g, 5, ty - 5, 6, 1, '#8a6a48');
    if (p.st !== 'destroyed') for (let i = 0; i < 4; i++) { rect(g, 6 + i, ty - 9 + (i & 1), 1, 4, '#1a1a1a'); px(g, 6 + i, ty - 10 + (i & 1), '#d8dce0'); }
    rect(g, 1, ty + 1, 3, 2, '#c8a070');
  }, 10);
}
function sinkArt(p: PP): Art {
  const toilets = false;
  return counterUnit(p, (g, ty) => {
    rect(g, 2, ty + 1, 12, 7, '#9aa4ac'); rect(g, 3, ty + 2, 10, 5, '#c8d4dc'); rect(g, 3, ty + 2, 10, 1, '#7a8288');
    rect(g, 7, ty - 3, 2, 5, p.s.metal); rect(g, 6, ty - 3, 4, 1, p.s.metal);
    if (p.st === 'damaged' || p.st === 'destroyed' || p.st === 'active') { g.fillStyle = 'rgba(120,180,230,0.7)'; g.fillRect(4, ty + 3, 8, 3); g.fillRect(7, ty - 1, 1, 3); }
    void toilets;
  }, 4);
}
function fridgeArt(p: PP): Art {
  const { s, st, v } = p;
  if (st === 'destroyed') return wreck(16, ['#e8e8ec', '#9aa0a6', '#3a3a3a'], v, 10);
  const col = s.act === 4 ? '#e9e4dc' : s.act === 3 ? '#9aa0a6' : '#eef0f2';
  return { shadow: [8, 4], c: mk(15, 32, (g) => {
    box3(g, 0, 0, 15, 5, 27, shade(col, 0.05), col);
    rect(g, 0, 15, 15, 1, shade(col, -0.25));
    rect(g, 12, 8, 1, 5, s.metalDark); rect(g, 12, 18, 1, 6, s.metalDark);
    if (v & 1) { rect(g, 3, 8, 4, 3, '#f0d060'); rect(g, 7, 10, 3, 3, '#80c0f0'); rect(g, 3, 18, 5, 4, s.paper); }
    if (st === 'damaged' || st === 'used') { rect(g, 0, 16, 3, 11, '#1a1c20'); cracks(g, 2, 5, 11, 20, v, '#5a5e64', 3); }
  }) };
}

function chairArt(p: PP): Art {
  const { s, st, f, v, kind } = p;
  const swivel = kind === 'swivel_chair', exec = kind === 'exec_chair';
  const seat = exec ? s.chair : swivel ? s.chair : s.act === 4 ? '#7a1420' : shade(s.fabric, -0.1);
  const seatHi = exec ? s.chairHi : swivel ? s.chairHi : shade(seat, 0.2);
  const frameCol = s.act === 4 ? '#d4a537' : '#2a2c32';
  if (st === 'destroyed') return wreck(14, [seat, seatHi, frameCol, '#3a3a3a'], v + 1, 6);
  const W = exec ? 16 : 14, H = exec ? 26 : swivel ? 22 : 18;
  const tilt = st === 'damaged' || st === 'active';
  return { shadow: [6, 3], c: mk(W + (tilt ? 4 : 0), H, (g) => {
    const ox = tilt ? 2 : 0;
    const cx = ox + (W >> 1);
    if (swivel || exec) {
      // 5-star base
      rect(g, cx - 6, H - 3, 13, 2, frameCol); rect(g, cx - 1, H - 4, 3, 2, frameCol);
      px(g, cx - 6, H - 1, '#111'); px(g, cx + 6, H - 1, '#111'); px(g, cx, H - 1, '#111');
      rect(g, cx, H - 8, 1, 5, s.metal);
    } else {
      legs(g, cx - 5, H - 7, 7, frameCol); legs(g, cx + 3, H - 7, 7, frameCol);
    }
    const sy = H - (swivel || exec ? 11 : 9);
    const backH = exec ? 14 : swivel ? 10 : 8;
    const drawSeat = () => { rect(g, cx - 5, sy, 11, 4, seat); rect(g, cx - 5, sy, 11, 1, seatHi); rect(g, cx - 5, sy + 3, 11, 1, shade(seat, -0.3)); };
    const drawBack = (y: number) => { rect(g, cx - 5, y, 11, backH, seat); rect(g, cx - 4, y + 1, 9, 1, seatHi); rect(g, cx - 5, y + backH - 1, 11, 1, shade(seat, -0.3)); if (exec) { rect(g, cx - 5, y, 11, 1, s.act === 4 ? '#d4a537' : seatHi); for (let i = 3; i < backH - 2; i += 3) px(g, cx, y + i, shade(seat, -0.25)); } };
    if (f === 0) { drawBack(sy - backH + 1); drawSeat(); }
    else if (f === 2) { drawSeat(); drawBack(sy - backH + 4); rect(g, cx - 1, sy - 1, 3, 3, frameCol); }
    else {
      // side view
      drawSeat();
      const bx = f === 1 ? cx - 6 : cx + 4;
      rect(g, bx, sy - backH + 2, 3, backH, seat); rect(g, bx, sy - backH + 2, 3, 1, seatHi);
      if (swivel || exec) { rect(g, f === 1 ? cx + 3 : cx - 5, sy - 3, 3, 1, frameCol); }
    }
    if (st === 'active') { rect(g, 0, sy + 1, 2, 1, '#e8e8e8'); rect(g, 0, sy + 4, 3, 1, '#c8c8c8'); }
    if (st === 'damaged') { line(g, cx - 4, sy + 1, cx + 2, sy + 2, shade(seat, -0.45)); rect(g, cx + 3, sy - 2, 2, 2, '#e8e0c8'); }
  }) };
}

function sofaArt(p: PP): Art {
  const { s, st, f, v } = p;
  const col = s.act === 4 ? '#7a1420' : s.act === 3 ? '#3a2a20' : s.act === 2 ? s.brand2 : '#6a7a8a';
  if (st === 'destroyed') return wreck(p.W, [col, shade(col, 0.2), '#e8e0c8'], v, 8);
  const vertical = p.D > p.W;
  const W = p.W, D = vertical ? p.D - 4 : 10, H = D + 10;
  return { shadow: [W / 2, 4], c: mk(W, H, (g) => {
    const hi = shade(col, 0.18), dk = shade(col, -0.3);
    if (!vertical) {
      if (f !== 2) {
        rect(g, 0, 0, W, 9, col); rect(g, 0, 0, W, 1, hi); // back
        rect(g, 0, 8, W, H - 8, shade(col, -0.08));
        rect(g, 2, 8, W - 4, 5, col); for (let x = 2; x < W - 4; x += Math.max(8, Math.floor((W - 4) / 3))) rect(g, x, 8, 1, 5, dk);
        rect(g, 0, 4, 3, H - 4, hi); rect(g, W - 3, 4, 3, H - 4, hi);
        rect(g, 0, H - 1, W, 1, dk);
        if (v & 1) { rect(g, 5, 6, 5, 4, s.brand); rect(g, 5, 6, 5, 1, shade(s.brand, 0.3)); }
      } else {
        rect(g, 0, 0, W, 6, shade(col, -0.05)); rect(g, 0, 0, W, 1, hi);
        rect(g, 0, 6, W, H - 6, col); rect(g, 0, 6, W, 1, hi); rect(g, 0, H - 1, W, 1, dk);
      }
    } else {
      const backX = f === 1 ? 0 : W - 5;
      rect(g, 0, 4, W, H - 4, shade(col, -0.08));
      rect(g, backX, 0, 5, H - 2, col); rect(g, backX, 0, 5, 1, hi);
      rect(g, 0, 0, W, 4, hi); rect(g, 0, H - 4, W, 4, hi);
      rect(g, 0, H - 1, W, 1, dk);
    }
    if (st === 'damaged') { rect(g, (W >> 1) - 2, 9, 4, 2, '#e8e0c8'); line(g, 3, 10, 8, 12, dk); }
  }) };
}

function shelfArt(p: PP, fill: (g: Ctx, x: number, y: number, w: number, h: number) => void, col: string, tall = 26): Art {
  const { st, f, v } = p;
  const vertical = p.D > p.W;
  const W = vertical ? 16 : p.W;
  if (st === 'destroyed') return wreck(p.W, [col, shade(col, 0.2), '#c8a060', '#e8e0c8'], v, 9);
  if (vertical) {
    const H = p.D - 4 + tall - 8;
    return { shadow: [8, 6], c: mk(W, H, (g) => {
      const topD = p.D - 4;
      rect(g, 2, 0, 12, topD, shade(col, 0.15)); rect(g, 2, 0, 12, 1, shade(col, 0.35));
      rect(g, 2, topD, 12, H - topD, shade(col, -0.15));
      for (let y = 2; y < topD - 2; y += 4) rect(g, f === 1 ? 10 : 3, y, 3, 3, ['#a03a2a', '#3a6aa0', '#c8a060', '#4a8a4a'][(y >> 2) & 3]);
      if (st === 'damaged') cracks(g, 2, 0, 12, H, v, '#101010', 3);
    }) };
  }
  const H = tall + 4;
  return { shadow: [W / 2, 3], c: mk(W, H, (g) => {
    rect(g, 0, 0, W, 4, shade(col, 0.15)); rect(g, 0, 0, W, 1, shade(col, 0.35));
    rect(g, 0, 4, W, tall, col);
    if (f === 2) { rect(g, 1, 5, W - 2, tall - 2, shade(col, -0.1)); return; }
    const shelves = Math.max(2, Math.floor(tall / 8));
    const sh = Math.floor((tall - 2) / shelves);
    for (let i = 0; i < shelves; i++) {
      const y = 5 + i * sh;
      rect(g, 1, y, W - 2, sh - 1, shade(col, -0.45));
      fill(g, 2, y, W - 4, sh - 1);
      rect(g, 1, y + sh - 1, W - 2, 1, shade(col, 0.1));
    }
    rect(g, 0, 4, 1, tall, shade(col, 0.2)); rect(g, W - 1, 4, 1, tall, shade(col, -0.3));
    if (st === 'damaged') { cracks(g, 0, 4, W, tall, v, '#101010', 3); rect(g, 3, tall + 1, 5, 3, '#a03a2a'); }
  }) };
}
const books = (g: Ctx, x: number, y: number, w: number, h: number) => {
  for (let i = 0; i < w; i += 2) {
    const r = h2(i, x + y, 3);
    if ((r & 7) === 0) continue;
    const bh = Math.max(2, h - (r >> 3) % 3);
    rect(g, x + i, y + h - bh, 2, bh, ['#8a2a20', '#2a4a7a', '#c8a060', '#3a6a3a', '#5a3a6a', '#d8d0b8'][(r >> 6) % 6]);
    px(g, x + i, y + h - bh, '#e8e0c8');
  }
};
const boxes = (g: Ctx, x: number, y: number, w: number, h: number) => {
  for (let i = 0; i + 5 <= w; i += 6) { rect(g, x + i, y + 1, 5, h - 1, '#b08a5a'); rect(g, x + i, y + 1, 5, 1, '#c8a070'); rect(g, x + i + 1, y + 3, 3, 1, '#f0e8d0'); }
};
const slots = (g: Ctx, x: number, y: number, w: number, h: number) => {
  for (let i = 0; i + 4 <= w; i += 4) { rect(g, x + i, y, 3, h, '#2a2620'); if ((h2(i, y, 1) & 3) !== 0) rect(g, x + i, y + h - 2, 3, 2, (h2(i, y, 2) & 1) ? '#f2f0e8' : '#d8c8a0'); }
};
const stationery = (g: Ctx, x: number, y: number, w: number, h: number) => {
  for (let i = 0; i + 4 <= w; i += 5) {
    const k = h2(i, y, 4) % 4;
    if (k === 0) { rect(g, x + i, y + h - 3, 4, 3, '#f2f0e8'); rect(g, x + i, y + h - 3, 4, 1, '#c8c8c0'); }
    else if (k === 1) { rect(g, x + i, y + h - 2, 4, 2, '#c02828'); rect(g, x + i, y + h - 3, 3, 1, '#2a2a2a'); }
    else if (k === 2) { for (let j = 0; j < 3; j++) rect(g, x + i + j, y + h - 4, 1, 4, ['#2a4ab0', '#c02828', '#1a1a1a'][j]); }
    else { rect(g, x + i, y + h - 3, 4, 3, '#e0b040'); }
  }
};
const trophies = (g: Ctx, x: number, y: number, w: number, h: number) => {
  g.fillStyle = 'rgba(180,220,240,0.25)'; g.fillRect(x, y, w, h);
  for (let i = 1; i + 3 <= w; i += 5) { rect(g, x + i, y + h - 1, 3, 1, '#a07a20'); rect(g, x + i + 1, y + h - 3, 1, 2, '#d4a537'); rect(g, x + i, y + h - 5, 3, 2, '#f2d27a'); }
};

function plantArt(p: PP, large: boolean): Art {
  const { s, st, v } = p;
  const W = large ? 16 : 12, H = large ? 30 : 18;
  if (st === 'destroyed') return { shadow: [6, 3], c: mk(W, 8, (g) => { debris(g, W, 8, [s.plantPot, shade(s.plantPot, -0.3), '#4a3020', s.leafDark], v + 2, 10); rect(g, 2, 4, W - 4, 3, '#4a3020'); }) };
  return { shadow: [large ? 7 : 5, 3], c: mk(W, H, (g) => {
    const pw = large ? 10 : 8, ph = large ? 8 : 6;
    const px0 = (W - pw) >> 1;
    rect(g, px0, H - ph, pw, ph, s.plantPot); rect(g, px0, H - ph, pw, 1, shade(s.plantPot, 0.3)); rect(g, px0 + pw - 2, H - ph, 2, ph, shade(s.plantPot, -0.2));
    rect(g, px0 + 1, H - ph, pw - 2, 1, '#4a3020');
    const leaf = (x: number, y: number, dx: number, dy: number, len: number) => { for (let i = 0; i < len; i++) { px(g, x + Math.round(dx * i), y + Math.round(dy * i), i < len / 2 ? s.leaf : s.leafHi); px(g, x + Math.round(dx * i) + 1, y + Math.round(dy * i), s.leafDark); } };
    const top = H - ph;
    const n = large ? 9 : 6;
    const knocked = st === 'damaged';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * (large ? 2.4 : 2.6) + (knocked ? 0.7 : 0);
      const len = (large ? 14 : 8) + (h2(i, v, 3) % 4);
      leaf((W >> 1) - 1, top, Math.cos(a), Math.sin(a), len);
    }
    if (large) { rect(g, (W >> 1) - 1, top - 10, 2, 10, '#5a4030'); }
    if (knocked) { rect(g, px0 - 2, H - 2, 4, 2, '#4a3020'); }
  }) };
}

function binArt(p: PP): Art {
  const { s, st, v } = p;
  const col = s.act === 4 ? '#d4a537' : s.act === 2 ? s.brand2 : '#5a5e66';
  if (st === 'destroyed') return wreck(10, [col, s.paper, '#3a3a3a'], v, 4);
  if (st === 'damaged') return { shadow: [5, 2], c: mk(14, 9, (g) => { rect(g, 0, 2, 9, 6, col); rect(g, 0, 2, 1, 6, shade(col, 0.3)); ellipse(g, 9, 5, 2, 3, '#1a1a1a'); papers(g, s, 9, 7, 2); }) };
  return { shadow: [5, 2], c: mk(9, 11, (g) => {
    rect(g, 0, 2, 9, 9, col); rect(g, 0, 2, 9, 2, shade(col, 0.25)); rect(g, 1, 3, 7, 1, '#1a1a1a'); rect(g, 7, 4, 2, 7, shade(col, -0.25));
    rect(g, 2, 0, 3, 3, s.paper); px(g, 5, 1, shade(s.paper, -0.2));
  }) };
}

function coatStandArt(p: PP): Art {
  const { s, st, v } = p;
  if (st === 'destroyed') return wreck(12, ['#5a4030', '#3a4a6a'], v, 4);
  const col = s.act === 4 ? '#d4a537' : '#4a3a2a';
  return { shadow: [5, 2], c: mk(12, 30, (g) => {
    rect(g, 5, 2, 2, 26, col); rect(g, 2, 28, 8, 2, col);
    rect(g, 2, 3, 8, 1, col);
    if (v & 1) { rect(g, 1, 4, 5, 12, ['#3a4a6a', '#6a3a2a', '#2a2a2a', '#5a6a3a'][v & 3]); rect(g, 1, 4, 5, 1, '#8a8a8a'); }
    if (v & 2) { rect(g, 7, 4, 3, 6, '#c8a060'); }
    if (st === 'damaged') { rect(g, 0, 26, 4, 3, '#3a4a6a'); }
  }) };
}

// ------------------------------------------------------------------------------------------------
// wall-mounted (drawn on the wall face above the base line)

function wallArt(p: PP): Art {
  const { s, st, v, kind, fr } = p;
  const W = p.W - 2;
  const lift = 2;
  const broken = st === 'destroyed' || st === 'damaged';
  switch (kind) {
    case 'whiteboard': return { lift, c: mk(W, 12, (g) => {
      rect(g, 0, 0, W, 12, '#c8ccd2'); rect(g, 1, 1, W - 2, 9, '#f8f8f6'); rect(g, 0, 11, W, 1, '#7a7e86');
      const pen = ['#2a4ab0', '#c02828', '#2a8a3a'][v % 3];
      if (v & 1) { line(g, 3, 8, 8, 4, pen); line(g, 8, 4, 12, 6, pen); line(g, 12, 6, 18, 2, pen); px(g, 17, 2, pen); px(g, 18, 3, pen); }
      else miniText(g, 'SYNERGY', W >> 1, 3, pen, true);
      if (broken) cracks(g, 1, 1, W - 2, 9, v, '#7a7e86', 3);
    }) };
    case 'noticeboard': return { lift, c: mk(W, 13, (g) => {
      rect(g, 0, 0, W, 13, '#6a4a2a'); rect(g, 1, 1, W - 2, 11, '#b8875a');
      for (let i = 0; i < 5; i++) { const r = h2(i, v, 7); rect(g, 2 + (r % (W - 7)), 2 + ((r >> 8) % 6), 4, 4, ['#f2f0e8', '#f0d070', '#a8d0f0', '#f0a8a8'][(r >> 12) & 3]); px(g, 4 + (r % (W - 7)), 2 + ((r >> 8) % 6), '#c02828'); }
      if (v & 2) { rect(g, W - 11, 2, 9, 9, '#2a3a5a'); rect(g, W - 10, 6, 7, 3, '#e8e8f0'); px(g, W - 7, 4, '#ffffff'); miniText(g, 'FUN', W - 6, 3, '#f0d070', true); }
      if (broken) { rect(g, 3, 9, 5, 3, '#f2f0e8'); cracks(g, 1, 1, W - 2, 11, v, '#3a2010', 2); }
    }) };
    case 'tv_screen': case 'leaderboard_screen': case 'stock_ticker': case 'projector_screen': {
      const H = kind === 'stock_ticker' ? 7 : kind === 'projector_screen' ? 14 : 12;
      return { lift: kind === 'stock_ticker' ? 5 : lift, c: mk(W, H, (g) => {
        if (kind === 'projector_screen') {
          rect(g, 0, 0, W, 2, '#3a3a40'); rect(g, 1, 2, W - 2, H - 3, '#f2f2ee'); rect(g, 1, H - 1, W - 2, 1, '#9a9a96');
          for (let i = 0; i < 5; i++) { const bh = 2 + ((i * 3 + v) % 7); rect(g, 6 + i * 6, H - 2 - bh, 4, bh, i === 4 ? '#c02828' : s.brand); }
          miniText(g, 'Q3', 2, 3, '#3a3a40');
          if (broken) { rect(g, 1, 2, W - 2, H - 3, '#d8d8d4'); line(g, 1, 2, W - 2, H - 2, '#7a7a76'); }
          return;
        }
        rect(g, 0, 0, W, H, '#14161c'); rect(g, 1, 1, W - 2, H - 2, broken ? '#0a0a0c' : s.screen);
        if (!broken) {
          if (kind === 'leaderboard_screen') {
            for (let i = 0; i < 4; i++) { const bw = W - 12 - i * 5 - ((v + i) % 3) * 2; rect(g, 6, 2 + i * 2, Math.max(4, bw), 1, i === 0 ? '#ffb040' : s.screenGlow); px(g, 3, 2 + i * 2, '#e8e8e8'); }
          } else if (kind === 'stock_ticker') {
            for (let x = 2; x < W - 4; x += 8) { const up = (h2(x, v, fr) & 1) === 1; miniText(g, up ? '^' : '-', x, 1, up ? '#40e070' : '#e04040'); rect(g, x + 4, 2, 3, 3, up ? '#40e070' : '#e04040'); }
          } else {
            const mode = v % 3;
            if (mode === 0) { miniText(g, s.act === 4 ? 'OBEY' : 'WELCOME', W >> 1, 3, s.screenGlow, true); }
            else if (mode === 1) { for (let i = 0; i < 4; i++) rect(g, 3 + i * 6, H - 3 - (2 + ((i * 5 + v) % 5)), 4, 2 + ((i * 5 + v) % 5), i & 1 ? s.brand : s.screenGlow); }
            else { rect(g, 2, 2, W - 4, 3, s.brand); rect(g, 2, 6, W - 10, 1, s.screenGlow); rect(g, 2, 8, W - 14, 1, s.screenGlow); }
          }
          px(g, W - 3, 2, 'rgba(255,255,255,0.8)');
        } else { line(g, 2, 1, W - 4, H - 2, '#5a6070'); line(g, W >> 1, 1, (W >> 1) - 4, H - 2, '#3a4050'); if (fr & 1) sparks(g, W >> 1, H >> 1, fr, 3); }
        rect(g, (W >> 1) - 2, H - 1, 4, 1, '#3a3a40');
      }) };
    }
    case 'mirror': return { lift, c: mk(W, 12, (g) => {
      rect(g, 0, 0, W, 12, s.act === 4 ? '#d4a537' : '#a8b0b8'); rect(g, 1, 1, W - 2, 10, '#b8d0dc');
      for (let i = 0; i < 4; i++) px(g, 4 + i, 8 - i, '#ffffff'); for (let i = 0; i < 3; i++) px(g, 8 + i, 9 - i, '#e8f4fa');
      if (broken) { cracks(g, 1, 1, W - 2, 10, v + 2, '#5a6a74', 4); }
    }) };
    case 'banner_values': {
      const words = ['ALIGN', 'OBEY', 'THRIVE', 'LOYAL', 'ASCEND', 'UNITY', 'COMPLY', 'SMILE'];
      const word = words[v % words.length];
      const H = 30;
      return { lift: -10, c: mk(W, H, (g) => {
        rect(g, 0, 0, W, 2, '#d4a537'); rect(g, 0, 0, W, 1, '#f2d27a');
        const red = '#a01828';
        rect(g, 2, 2, W - 4, H - 6, red); rect(g, 2, 2, 1, H - 6, shade(red, 0.2)); rect(g, W - 3, 2, 1, H - 6, shade(red, -0.3));
        for (let x = 2; x < W - 2; x += 2) { px(g, x, H - 4, red); px(g, x + 1, H - 3, red); }
        rect(g, 4, 4, W - 8, 1, '#d4a537'); rect(g, 4, H - 9, W - 8, 1, '#d4a537');
        // emblem: invented company chevron
        line(g, (W >> 1) - 4, 13, W >> 1, 9, '#f2d27a'); line(g, W >> 1, 9, (W >> 1) + 4, 13, '#f2d27a');
        miniText(g, word.length > 6 ? word.slice(0, 6) : word, W >> 1, 16, '#f2d27a', true);
        if (broken) { rect(g, W - 8, 6, 6, H - 10, 'rgba(0,0,0,0)'); g.clearRect(W - 9, 10, 7, H - 10); line(g, W - 9, 10, W - 4, H - 4, '#5c0e18'); }
      }) };
    }
    case 'dartboard': return { lift: 3, c: mk(12, 12, (g) => {
      ellipse(g, 6, 6, 5, 5, '#1a1a1a'); ellipse(g, 6, 6, 4, 4, '#e8dcb8'); ellipse(g, 6, 6, 3, 3, '#2a8a3a'); ellipse(g, 6, 6, 2, 2, '#e8dcb8'); px(g, 6, 6, '#c02828');
      for (let i = 0; i < 4; i++) px(g, 6 + Math.round(Math.cos(i * 1.57) * 4), 6 + Math.round(Math.sin(i * 1.57) * 4), '#c02828');
      line(g, 7, 5, 9, 2, '#d4a537'); line(g, 4, 7, 2, 4, '#d4a537');
    }) };
    case 'hand_dryer': {
      const used = st === 'used' || st === 'destroyed';
      return { lift: 3, c: mk(12, 11, (g) => {
        const body = s.act === 4 ? '#d4a537' : '#c8ccd2';
        if (used) {
          rect(g, 1, 3, 10, 7, shade(body, -0.25)); line(g, 2, 4, 9, 9, '#3a3a3a'); rect(g, 3, 9, 6, 2, '#3a3a3a'); line(g, 6, 0, 6, 3, '#1a1a1a');
          return;
        }
        rect(g, 0, 0, 12, 9, body); rect(g, 0, 0, 12, 1, shade(body, 0.3)); rect(g, 10, 1, 2, 8, shade(body, -0.2));
        rect(g, 3, 8, 6, 3, shade(body, -0.35)); rect(g, 4, 10, 4, 1, '#1a1a1a');
        px(g, 2, 3, st === 'active' ? '#40e070' : '#606870');
        if (st === 'active') { g.fillStyle = 'rgba(220,240,255,0.5)'; g.fillRect(3, 11, 6, 0); }
        if (st === 'damaged') line(g, 2, 2, 8, 6, '#5a5e64');
      }) };
    }
    case 'sprinkler': {
      const spray = st === 'active' || st === 'damaged';
      return { lift: 2, c: mk(12, spray ? 16 : 12, (g) => {
        rect(g, 5, 0, 2, 8, '#a02020'); rect(g, 5, 0, 1, 8, '#d04040');
        ellipse(g, 6, 7, 3, 3, '#c02828'); px(g, 5, 6, '#ff8080');
        rect(g, 1, 6, 3, 2, '#c02828'); rect(g, 8, 6, 3, 2, '#c02828');
        rect(g, 4, 9, 4, 2, '#8a8e96');
        if (spray) { g.fillStyle = 'rgba(160,210,240,0.7)'; for (let i = 0; i < 6; i++) g.fillRect(1 + i * 2, 11 + ((i + p.fr) % 3), 1, 2); }
      }) };
    }
    case 'exit_stairs': case 'exit_lift': case 'exit_corridor': default: return { lift, c: mk(W, 10, (g) => { rect(g, 0, 0, W, 10, '#5a5e66'); }) };
  }
}

// ------------------------------------------------------------------------------------------------
// hazards & machines

function glassPartitionArt(p: PP): Art {
  const { s, st, v } = p;
  const vertical = p.D > p.W;
  if (st === 'destroyed') return { shadow: null, c: mk(16, 8, (g) => {
    rect(g, 0, 5, 2, 3, s.metalDark); rect(g, 14, 5, 2, 3, s.metalDark);
    g.fillStyle = 'rgba(190,230,245,0.85)'; for (let i = 0; i < 12; i++) { const r = h2(i, v, 1); g.fillRect(r % 15, (r >> 8) % 7, 1 + (r >> 16) % 2, 1); }
  }) };
  if (vertical) return { shadow: [3, 6], c: mk(6, 30, (g) => {
    g.fillStyle = 'rgba(170,220,240,0.45)'; g.fillRect(2, 2, 3, 26);
    rect(g, 1, 0, 4, 2, s.metal); rect(g, 1, 28, 4, 2, s.metalDark);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(3, 6, 1, 4);
    if (st === 'damaged') cracks(g, 2, 3, 3, 24, v, '#e8f4fa', 3);
  }) };
  return { shadow: [8, 2], c: mk(16, 22, (g) => {
    g.fillStyle = 'rgba(170,220,240,0.42)'; g.fillRect(1, 2, 14, 17);
    rect(g, 0, 0, 16, 2, s.metal); rect(g, 0, 19, 16, 2, s.metalDark); rect(g, 0, 21, 2, 1, '#1a1a1a'); rect(g, 14, 21, 2, 1, '#1a1a1a');
    rect(g, 0, 2, 1, 17, s.metal); rect(g, 15, 2, 1, 17, s.metalDark);
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(3, 4, 1, 5); g.fillRect(4, 4, 1, 2); g.fillRect(11, 12, 1, 3);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(1, 10, 14, 2);
    if (st === 'damaged') { const cx = 5 + (v % 6), cy = 8; for (let a = 0; a < 6; a++) line(g, cx, cy, cx + Math.round(Math.cos(a) * 6), cy + Math.round(Math.sin(a) * 6), '#f4fbff'); }
  }) };
}

function printerArt(p: PP): Art {
  const { s, st, v, fr } = p;
  const body = st === 'destroyed' ? '#2a2826' : '#d8dad8';
  return { shadow: [7, 3], c: mk(16, 22, (g) => {
    // stand
    rect(g, 2, 14, 12, 8, '#5a5e66'); rect(g, 2, 14, 12, 1, '#7a7e86'); rect(g, 3, 17, 10, 1, '#3a3e44');
    if (st === 'destroyed') {
      rect(g, 1, 6, 14, 8, body); scorch(g, 1, 4, 14, 10, v); rect(g, 3, 4, 9, 2, '#1a1816');
      debris(g, 16, 6, ['#3a3836', '#6a6864', '#1a1816'], v, 6);
      smoke(g, 8, 4, fr);
      return;
    }
    rect(g, 1, 4, 14, 10, body); rect(g, 1, 4, 14, 1, '#f4f6f4'); rect(g, 13, 5, 2, 9, '#a8aaa8');
    rect(g, 3, 2, 9, 3, '#c8cac8'); rect(g, 4, 1, 7, 2, s.paper); // output tray + paper
    rect(g, 2, 10, 10, 2, '#9a9c9a'); // paper drawer
    const led = st === 'active' ? ((fr & 1) ? '#ff3030' : '#601010') : st === 'damaged' ? '#ffa030' : '#40e070';
    rect(g, 11, 6, 2, 2, led);
    if (st === 'damaged' || st === 'used') { line(g, 2, 5, 8, 9, '#6a6c6a'); rect(g, 4, 0, 6, 4, shade(s.paper, -0.1)); line(g, 5, 0, 8, 3, '#9a9a9a'); }
    if (st === 'active') { smoke(g, 5, 4, fr); rect(g, 2, 6, 3, 2, '#3a3836'); }
    if (st === 'used') { rect(g, 0, 12, 5, 3, s.paper); rect(g, 11, 13, 5, 3, s.paper); }
  }) };
}

function waterCoolerArt(p: PP): Art {
  const { st, fr, v } = p;
  return { shadow: [6, 3], c: mk(12, 28, (g) => {
    const puddle = st === 'damaged' || st === 'destroyed' || st === 'used' || st === 'active';
    if (puddle) { g.fillStyle = 'rgba(80,150,210,0.55)'; g.fillRect(0, 24, 12, 4); g.fillRect(1, 23, 10, 5); }
    // dispenser
    rect(g, 2, 12, 8, 14, '#e8eaec'); rect(g, 2, 12, 8, 1, '#ffffff'); rect(g, 8, 13, 2, 13, '#b8bcc0');
    rect(g, 3, 16, 2, 2, '#3a6ad0'); rect(g, 6, 16, 2, 2, '#d03a3a'); rect(g, 3, 21, 5, 2, '#9aa0a6');
    if (st === 'destroyed' || st === 'used') {
      rect(g, 3, 9, 6, 3, 'rgba(120,190,240,0.8)'); debris(g, 12, 6, ['#a8d8f8', '#78b8e8'], v, 5);
      return;
    }
    // bottle
    g.fillStyle = 'rgba(110,180,235,0.85)'; g.fillRect(2, 1, 8, 11); g.fillRect(4, 0, 4, 1);
    rect(g, 3, 2, 1, 8, '#d8f0ff'); rect(g, 2, 5, 8, 1, '#5a9ad0');
    if (st === 'damaged') { line(g, 4, 3, 7, 8, '#ffffff'); rect(g, 5, 23 + (fr & 1), 1, 2, '#78b8e8'); }
    if (st === 'active') { sparks(g, 6, 25, fr, 4); }
  }) };
}

function extinguisherArt(p: PP): Art {
  const { st, fr, v } = p;
  if (st === 'destroyed') return { shadow: [6, 2], c: mk(16, 10, (g) => { rect(g, 2, 4, 11, 5, '#b02020'); rect(g, 2, 4, 11, 1, '#e04040'); rect(g, 12, 3, 3, 3, '#1a1a1a'); g.fillStyle = 'rgba(240,240,240,0.7)'; g.fillRect(0, 0, 6, 4); g.fillRect(10, 0, 5, 3); }) };
  return { shadow: [4, 2], c: mk(10, 18, (g) => {
    rect(g, 2, 5, 6, 13, '#c02020'); rect(g, 2, 5, 2, 13, '#e04848'); rect(g, 7, 6, 1, 12, '#801010');
    rect(g, 3, 2, 3, 3, '#2a2a2a'); rect(g, 6, 2, 3, 1, '#1a1a1a'); rect(g, 8, 3, 1, 4, '#1a1a1a');
    rect(g, 3, 9, 4, 4, '#f2f0e8'); rect(g, 3, 10, 4, 1, '#2a2a2a');
    if (st === 'damaged') { px(g, 6, 8, '#801010'); px(g, 5, 9, '#801010'); g.fillStyle = 'rgba(240,240,240,0.6)'; g.fillRect(8, 1, 2, 2); }
    if (st === 'active') { g.fillStyle = 'rgba(245,245,245,0.8)'; g.fillRect(8, 0, 2, 3); g.fillRect(9 - (fr & 1), 0, 1, 1); }
    void v;
  }) };
}

function filingArt(p: PP): Art {
  const { s, st, v } = p;
  const col = s.act === 4 ? '#3a2a20' : s.act === 3 ? '#5a6070' : s.act === 2 ? '#c8ccd8' : '#9a9e92';
  const hi = shade(col, 0.2), dk = shade(col, -0.3);
  if (st === 'destroyed' || st === 'used') {
    // toppled: lying on its back, drawers spilled, forming a low cover line
    return { shadow: [10, 3], c: mk(24, 13, (g) => {
      rect(g, 1, 3, 20, 8, col); rect(g, 1, 3, 20, 1, hi); rect(g, 1, 10, 20, 1, dk);
      for (let i = 0; i < 4; i++) { rect(g, 2 + i * 5, 4, 4, 5, dk); rect(g, 3 + i * 5, 6, 2, 1, s.metal); }
      papers(g, s, 16, 12, 2); rect(g, 19, 9, 5, 3, '#c8a060');
      if (st === 'used') { cracks(g, 1, 3, 20, 8, v, '#1a1a1a', 4); }
    }) };
  }
  return { shadow: [7, 3], c: mk(14, 24, (g) => {
    box3(g, 0, 0, 14, 4, 20, hi, col);
    for (let i = 0; i < 4; i++) {
      const y = 5 + i * 5;
      rect(g, 1, y, 12, 4, shade(col, 0.06)); rect(g, 1, y + 3, 12, 1, dk);
      rect(g, 5, y + 1, 4, 1, s.metal); rect(g, 6, y + 2, 2, 1, '#f2f0e8');
    }
    if (st === 'damaged') { rect(g, 1, 10, 12, 4, dk); rect(g, 0, 11, 14, 3, shade(col, 0.1)); papers(g, s, 2, 11, 2); cracks(g, 1, 4, 12, 18, v, dk, 2); }
    if (st === 'active') { rect(g, 0, 0, 14, 1, '#ffffff'); }
  }) };
}

function photocopierArt(p: PP): Art {
  const { s, st, v, fr } = p;
  const vertical = p.D > p.W;
  const body = '#d4d6d2', hi = '#eef0ec', dk = '#9a9c98';
  const W = vertical ? 16 : 30, H = vertical ? 34 : 26;
  if (st === 'destroyed') return wreck(W, [body, dk, '#2a2a2a', s.paper], v, 10);
  return { shadow: [W / 2, 4], c: mk(W, H, (g) => {
    if (vertical) {
      box3(g, 1, 0, 14, 22, 12, hi, body);
      rect(g, 3, 3, 10, 14, st === 'used' ? '#1a1c20' : '#2a3a48');
      if (st !== 'used') rect(g, 4, 4, 2, 10, '#5a7a98');
      rect(g, 3, 24, 10, 2, dk); rect(g, 3, 28, 10, 2, dk);
      if (st === 'used') { line(g, 3, 3, 12, 16, '#e8f0f4'); line(g, 12, 4, 5, 15, '#c8d4dc'); papers(g, s, 9, 32, 3); scorch(g, 1, 0, 14, 20, v); }
      return;
    }
    // top: lid / glass + control panel; front: paper trays
    rect(g, 0, 0, W, 10, hi); rect(g, 0, 0, W, 1, '#ffffff');
    if (st === 'used') {
      rect(g, 3, 2, 16, 7, '#1a1c20'); line(g, 4, 2, 17, 8, '#e8f0f4'); line(g, 10, 2, 6, 8, '#c8d4dc'); line(g, 13, 3, 18, 8, '#a8b4bc');
      rect(g, 2, -0 + 1, 2, 3, '#6a6c68');
      scorch(g, 0, 0, W, 10, v); smoke(g, 10, 4, fr);
    } else if (st === 'damaged') {
      rect(g, 3, 2, 16, 6, '#2a3a48'); rect(g, 2, 0, 18, 2, dk); line(g, 4, 3, 12, 7, '#a8c0d0');
    } else { rect(g, 3, 2, 16, 6, dk); rect(g, 3, 2, 16, 1, '#7a7c78'); }
    rect(g, 21, 2, 7, 6, '#3a3e44'); rect(g, 22, 3, 3, 2, st === 'used' ? '#1a1a1a' : '#5ac0e0'); px(g, 26, 3, st === 'damaged' ? '#ffa030' : '#40e070'); px(g, 26, 5, '#e8e8e8');
    rect(g, 0, 10, W, H - 10, body); rect(g, 0, 10, W, 1, hi);
    for (let i = 0; i < 3; i++) { rect(g, 2, 12 + i * 4, W - 4, 3, shade(body, -0.06)); rect(g, (W >> 1) - 3, 13 + i * 4, 6, 1, dk); }
    rect(g, W - 1, 10, 1, H - 10, dk); rect(g, 0, H - 1, W, 1, '#6a6c68');
    rect(g, W - 6, 1, 5, 1, s.paper);
    if (st === 'used') { rect(g, 1, H - 6, 6, 4, s.paper); rect(g, W - 8, H - 5, 6, 4, shade(s.paper, -0.05)); }
  }) };
}

function serverRackArt(p: PP): Art {
  const { st, fr, v } = p;
  const dead = st === 'used' || st === 'destroyed';
  return { shadow: [7, 3], c: mk(14, 36, (g) => {
    box3(g, 0, 0, 14, 4, 32, '#3a3e46', '#22252c');
    rect(g, 1, 5, 12, 30, '#16181e');
    for (let y = 6; y < 33; y += 3) {
      rect(g, 2, y, 10, 2, '#2a2e36'); rect(g, 2, y, 10, 1, '#363a44');
      if (!dead) {
        const r = h2(y, v, fr >> 0);
        px(g, 3, y + 1, (r & 1) ? '#40e070' : '#1a4028');
        px(g, 5, y + 1, (r & 2) ? '#3a9cff' : '#102840');
        if ((r & 12) === 4) px(g, 7, y + 1, '#ffb040');
      }
    }
    rect(g, 0, 4, 1, 32, '#4a4e58'); rect(g, 13, 4, 1, 32, '#121418');
    if (st === 'damaged') { rect(g, 9, 8, 5, 22, '#4a4e58'); line(g, 9, 8, 13, 30, '#121418'); }
    if (st === 'active') { sparks(g, 7, 14 + (fr & 1) * 6, fr, 5); }
    if (dead) { scorch(g, 0, 2, 14, 32, v); if (st === 'used') smoke(g, 7, 4, fr); else debris(g, 14, 6, ['#2a2e36', '#5a5e66'], v, 4); }
  }) };
}

function shredderArt(p: PP): Art {
  const { st, fr, v } = p;
  return { shadow: [7, 3], c: mk(14, 20, (g) => {
    box3(g, 0, 0, 14, 5, 15, '#4a4e56', '#2e3138');
    rect(g, 2, 2, 10, 2, '#0e1014'); // feed slot
    rect(g, 2, 8, 10, 9, '#3a3e46'); rect(g, 2, 8, 10, 1, '#5a5e66');
    for (let i = 3; i < 12; i += 2) rect(g, i, 10, 1, 6, '#26292e');
    px(g, 11, 6, st === 'active' ? ((fr & 1) ? '#ff3030' : '#601010') : '#40e070');
    miniText(g, 'XS', 4, 7, '#d8d8d8');
    if (st === 'used') {
      // jammed with a shredded tie (no gore: the tie)
      for (let i = 0; i < 5; i++) rect(g, 3 + i * 2, -0 + 0, 1, 3 + (i & 1), i & 1 ? '#a02828' : '#2a4a8a');
      rect(g, 3, 0, 9, 1, '#a02828');
      smoke(g, 6, 1, fr);
    }
    if (st === 'damaged' || st === 'destroyed') cracks(g, 0, 5, 14, 14, v, '#121418', 3);
  }) };
}

function vendingArt(p: PP, snack: boolean): Art {
  const { s, st, v, f } = p;
  const vertical = p.D > p.W;
  const body = snack ? (s.act === 2 ? '#2a2e4a' : '#3a3e48') : (s.act === 4 ? '#5c0e18' : s.act === 2 ? s.brand : '#a02828');
  if (st === 'destroyed') return wreck(p.W, [body, '#e8e8e8', '#2a2a2a', '#c8a040'], v, 12);
  if (vertical) return { shadow: [8, 5], c: mk(16, 40, (g) => {
    box3(g, 0, 0, 16, 26, 14, shade(body, 0.12), shade(body, -0.1));
    rect(g, f === 1 ? 12 : 1, 2, 3, 22, '#e8f4ff'); rect(g, 2, 28, 12, 4, '#1a1a1a');
  }) };
  const W = 30, H = 42;
  return { shadow: [15, 4], c: mk(W, H, (g) => {
    box3(g, 0, 0, W, 4, 38, shade(body, 0.15), body);
    if (f === 2) { rect(g, 2, 6, W - 4, 32, shade(body, -0.15)); return; }
    // glass front with goods
    rect(g, 2, 6, 19, 28, '#14161c');
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      const col = snack ? ['#d8a040', '#c04040', '#40a040', '#e0d060', '#8050c0'][(r + c + v) % 5] : ['#e8e8e8', '#40a0e0', '#e05030', '#50c070'][(r * 3 + c + v) % 4];
      if (snack) { rect(g, 3 + c * 4, 7 + r * 5, 3, 3, col); rect(g, 3 + c * 4, 10 + r * 5, 4, 1, '#5a5e66'); }
      else { rect(g, 4 + c * 4, 7 + r * 5, 2, 4, col); px(g, 4 + c * 4, 7 + r * 5, '#ffffff'); }
    }
    g.fillStyle = 'rgba(200,230,255,0.18)'; g.fillRect(2, 6, 19, 28);
    for (let i = 0; i < 6; i++) px(g, 4 + i, 8 + i * 2, 'rgba(255,255,255,0.6)');
    // panel
    rect(g, 22, 8, 6, 10, '#2a2e36'); for (let i = 0; i < 6; i++) px(g, 23 + (i % 2) * 2, 10 + Math.floor(i / 2) * 2, '#c8ccd2');
    rect(g, 23, 20, 4, 2, '#1a1a1a'); rect(g, 22, 24, 6, 3, '#d8a040');
    rect(g, 2, 35, 19, 3, '#0e1014');
    rect(g, 0, 4, 1, 38, shade(body, 0.25)); rect(g, W - 1, 4, 1, 38, shade(body, -0.35));
    if (st === 'used' || st === 'damaged') { line(g, 3, 7, 18, 30, '#e8f4fa'); line(g, 12, 7, 6, 32, '#c8d8e0'); line(g, 17, 10, 10, 20, '#e8f4fa'); if (st === 'used') { rect(g, 3, 36, 4, 2, '#e05030'); rect(g, 9, 36, 3, 2, '#40a0e0'); } }
  }) };
}

function cubicleWallArt(p: PP): Art {
  const { s, st, v } = p;
  if (st === 'destroyed') return wreck(16, [s.cubicle, s.cubicleTrim], v, 5);
  return { shadow: [8, 2], c: mk(16, 14, (g) => {
    rect(g, 0, 0, 16, 2, s.cubicleTrim); rect(g, 0, 2, 16, 10, s.cubicle); rect(g, 0, 11, 16, 1, shade(s.cubicle, -0.3));
    for (let x = 1; x < 16; x += 2) px(g, x, 6, shade(s.cubicle, 0.12));
    rect(g, 2, 12, 2, 2, '#2a2a2a'); rect(g, 12, 12, 2, 2, '#2a2a2a');
    if (st === 'damaged') line(g, 3, 3, 9, 10, shade(s.cubicle, -0.4));
  }) };
}

// ------------------------------------------------------------------------------------------------
// themed / misc props

function tableArt(p: PP): Art {
  // meeting tables (stretchy), ping pong (3x2), canteen tables (meeting_table in kitchens via variant)
  const { s, st, v, kind } = p;
  const W = p.W, D = p.D;
  if (st === 'destroyed') return wreck(W, [s.deskTop, s.deskSide, s.paper], v, 10);
  const pong = kind === 'ping_pong';
  const top = pong ? '#2a6a8a' : s.deskTop, side = pong ? '#1a4a6a' : s.deskSide;
  const topD = Math.max(8, D - 6), frontH = 7;
  return { shadow: [W / 2, Math.min(6, D / 4)], c: mk(W, topD + frontH, (g) => {
    rect(g, 0, 0, W, topD, top); rect(g, 0, 0, W, 1, shade(top, 0.25)); rect(g, 0, topD - 1, W, 1, shade(top, -0.2));
    if (!pong && s.act >= 3) for (let y = 2; y < topD - 1; y += 3) for (let x = (y * 7) % 9; x < W; x += 11) rect(g, x, y, 4, 1, shade(top, 0.08));
    rect(g, 2, topD, 3, frontH, side); rect(g, W - 5, topD, 3, frontH, side);
    if (W > 40) rect(g, (W >> 1) - 1, topD, 3, frontH, side);
    rect(g, 0, topD, W, 2, shade(side, -0.1));
    if (pong) {
      rect(g, 0, (topD >> 1), W, 1, '#e8e8e8'); rect(g, (W >> 1), 0, 1, topD, '#e8e8e8'); frame(g, 0, 0, W, topD, '#e8e8e8');
      rect(g, (W >> 1) - 1, -0, 2, topD, '#f2f2f2');
      rect(g, 6, 3, 4, 3, '#c02828'); rect(g, W - 10, topD - 6, 4, 3, '#2a2a2a'); px(g, 18, 6, '#f8f8f0');
      return;
    }
    // table dressing
    const n = Math.max(1, Math.floor(W / 14));
    for (let i = 0; i < n; i++) {
      const x = 4 + i * Math.floor((W - 10) / n);
      if ((h2(i, v, 1) & 3) === 0) continue;
      if (D >= 24) { rect(g, x, 2, 6, 4, '#2a2c32'); rect(g, x + 1, 3, 4, 2, s.screenGlow); }
      papers(g, s, x + 2, topD - 3, 2);
      if ((h2(i, v, 2) & 1)) { rect(g, x + 7, 4, 2, 3, 'rgba(200,230,255,0.8)'); }
    }
    if (D >= 24 && W >= 32) { const cx = W >> 1, cy = topD >> 1; rect(g, cx - 3, cy - 1, 6, 3, '#1a1a1a'); px(g, cx, cy, '#40e070'); }
    if (st === 'damaged') cracks(g, 0, 0, W, topD, v, shade(top, -0.45), 4);
  }) };
}

function execDeskArt(p: PP): Art {
  const { s, st, v, f } = p;
  const W = p.W, vertical = p.D > p.W;
  const wood = s.act <= 2 ? '#4a2e1c' : s.deskTop, woodHi = shade(wood, 0.2), front = shade(wood, -0.15);
  const trim = s.act === 4 ? '#d4a537' : '#b8925a';
  if (st === 'destroyed') return wreck(W, [wood, woodHi, trim, s.paper], v, 12);
  const topD = Math.max(10, p.D - 10), frontH = 11, H = topD + frontH + 10;
  return { shadow: [W / 2, 5], c: mk(W, H, (g) => {
    const ty = 10;
    rect(g, 0, ty, W, topD, wood); rect(g, 0, ty, W, 1, woodHi); rect(g, 0, ty + topD - 1, W, 1, trim);
    rect(g, 1, ty + 2, W - 2, topD - 4, shade(wood, 0.06));
    rect(g, 0, ty + topD, W, frontH, front); rect(g, 0, ty + topD + frontH - 1, W, 1, shade(front, -0.4));
    if (!vertical && f !== 0) { rect(g, 3, ty + topD + 2, W - 6, frontH - 4, shade(front, 0.08)); frame(g, 3, ty + topD + 2, W - 6, frontH - 4, trim); }
    else { rect(g, 8, ty + topD + 1, W - 16, frontH - 2, '#120c08'); rect(g, 1, ty + topD + 2, 6, frontH - 4, shade(front, 0.08)); rect(g, W - 7, ty + topD + 2, 6, frontH - 4, shade(front, 0.08)); }
    if (!vertical) {
      monitor(g, s, W - 10, ty + 6, f === 2, st !== 'damaged', st === 'damaged');
      rect(g, 4, ty + 2, 8, 6, '#1a3a1a'); rect(g, 4, ty + 2, 8, 1, '#2a5a2a'); // blotter
      rect(g, (W >> 1) - 5, ty + topD - 4, 10, 3, trim); miniText(g, 'CEO', (W >> 1), ty + topD - 4, '#2a1a10', true);
      mug(g, 14, ty + 3, '#f2f0e8'); px(g, 15, ty + 4, '#c02828');
      rect(g, 4, ty - 6, 1, 8, trim); rect(g, 2, ty - 8, 5, 3, '#2a6a3a'); // lamp
    } else {
      rect(g, 3, ty + 4, 10, 10, '#1a3a1a');
      rect(g, f === 1 ? 2 : W - 4, ty + topD - 14, 2, 10, '#16181e');
    }
    if (st === 'damaged') cracks(g, 0, ty, W, topD, v, '#120c08', 4);
  }) };
}

function boxyArt(p: PP, col: string, h: number, detail?: (g: Ctx, W: number, H: number) => void, topCol?: string): Art {
  const { st, v } = p;
  const W = Math.min(p.W, 32) - (p.W <= 16 ? 2 : 0);
  if (st === 'destroyed') return wreck(W, [col, shade(col, 0.2), shade(col, -0.3)], v, Math.min(10, h));
  const d = Math.max(4, Math.min(12, p.D - 6));
  return { shadow: [W / 2, 3], c: mk(W, d + h, (g) => {
    box3(g, 0, 0, W, d, h, topCol ?? shade(col, 0.15), col);
    rect(g, 0, d, 1, h, shade(col, 0.2)); rect(g, W - 1, d, 1, h, shade(col, -0.3));
    detail?.(g, W, d + h);
    if (st === 'damaged') cracks(g, 0, 0, W, d + h, v, shade(col, -0.5), 3);
  }) };
}

function propArt(p: PP): Art {
  const { s, st, v, fr, kind } = p;
  if (p.wall) return wallArt(p);
  switch (kind) {
    case 'desk': return deskArt(p);
    case 'desk_l': return deskLArt(p);
    case 'reception_desk': return counterArt(p, true);
    case 'canteen_counter': return counterArt(p, false);
    case 'meeting_table': case 'ping_pong': return tableArt(p);
    case 'exec_desk': return execDeskArt(p);
    case 'chair': case 'swivel_chair': case 'exec_chair': return chairArt(p);
    case 'sofa': return sofaArt(p);
    case 'bookshelf': return shelfArt(p, books, s.act === 2 ? '#e8e8f0' : s.act === 4 ? '#3a1a10' : '#6a4a2c', 26);
    case 'pigeonholes': return shelfArt(p, slots, s.act === 3 ? '#4e3420' : '#8a6a48', 22);
    case 'stationery_shelf': return shelfArt(p, stationery, '#8a8e96', 22);
    case 'trophy_cabinet': return shelfArt(p, trophies, s.act >= 3 ? '#3a2416' : '#5a3a24', 24);
    case 'archive_stack': return shelfArt(p, boxes, '#6a7078', 24);
    case 'plant': return plantArt(p, false);
    case 'plant_large': return plantArt(p, true);
    case 'bin': return binArt(p);
    case 'coat_stand': return coatStandArt(p);
    case 'whiteboard': {
      if (st === 'destroyed') return wreck(30, ['#f8f8f6', '#c8ccd2', '#5a5e66'], v, 6);
      return { shadow: [14, 3], c: mk(30, 24, (g) => {
        rect(g, 1, 0, 28, 15, '#c8ccd2'); rect(g, 2, 1, 26, 12, '#f8f8f6');
        miniText(g, v & 1 ? 'KPI' : 'PLAN', 15, 3, '#c02828', true); line(g, 5, 11, 12, 8, '#2a4ab0'); line(g, 12, 8, 20, 10, '#2a4ab0'); line(g, 20, 10, 25, 5, '#2a4ab0');
        rect(g, 3, 14, 24, 1, '#7a7e86');
        rect(g, 6, 15, 2, 7, '#7a7e86'); rect(g, 22, 15, 2, 7, '#7a7e86'); rect(g, 3, 22, 8, 2, '#3a3e44'); rect(g, 19, 22, 8, 2, '#3a3e44');
        if (st === 'damaged') cracks(g, 2, 1, 26, 12, v, '#7a7e86', 3);
      }) };
    }
    case 'cubicle_wall': return cubicleWallArt(p);
    case 'parcel_cage': return { ...boxyArt(p, '#7a7e86', 22, (g, W, H) => {
      for (let x = 1; x < W; x += 3) rect(g, x, 1, 1, H - 2, '#5a5e66');
      for (let y = 1; y < H; y += 3) rect(g, 1, y, W - 2, 1, 'rgba(90,94,102,0.6)');
      for (let i = 0; i < 4; i++) { const r = h2(i, v, 3); rect(g, 3 + (r % (W - 12)), 10 + ((r >> 8) % (H - 16)), 8, 6, '#b08a5a'); rect(g, 3 + (r % (W - 12)), 10 + ((r >> 8) % (H - 16)), 8, 1, '#c8a070'); }
      frame(g, 0, 0, W, H, '#4a4e56');
    }, 'rgba(120,124,132,0.4)') };
    case 'mail_trolley': return boxyArt(p, '#5a5e66', 10, (g, W, H) => { rect(g, 1, -0, W - 2, 6, '#8a8a7a'); rect(g, 2, 1, W - 4, 4, '#b8b4a0'); rect(g, 1, H - 2, 2, 2, '#1a1a1a'); rect(g, W - 3, H - 2, 2, 2, '#1a1a1a'); rect(g, 3, 2, 4, 3, s.paper); });
    case 'sack_pile': {
      if (st === 'destroyed') return wreck(p.W, ['#8a8a7a', '#6a6a5a', s.paper], v, 6);
      if (p.D > p.W) return { shadow: [7, 6], c: mk(16, 30, (g) => {
        for (let i = 0; i < 4; i++) { const y = 3 + i * 7; ellipse(g, 8, y + 4, 6, 4, i & 1 ? '#8a8a7a' : '#9a9a88'); rect(g, 5, y + 1, 5, 1, '#b8b8a4'); rect(g, 8, y, 1, 2, '#5a5a4a'); }
      }) };
      return { shadow: [15, 3], c: mk(30, 14, (g) => {
        for (let i = 0; i < 5; i++) { const x = 1 + i * 6 - (i > 2 ? 14 : 0), y = i > 2 ? 0 : 5; ellipse(g, x + 4, y + 4, 5, 4, i & 1 ? '#8a8a7a' : '#9a9a88'); rect(g, x + 2, y + 1, 4, 1, '#b8b8a4'); rect(g, x + 4, y, 1, 2, '#5a5a4a'); }
      }) };
    }
    case 'toolbox': return { shadow: [6, 2], c: mk(12, 9, (g) => { box3(g, 0, 2, 12, 3, 4, '#d04030', '#a02820'); rect(g, 4, 0, 4, 2, '#2a2a2a'); rect(g, 5, 6, 2, 1, '#d8d8d0'); if (st !== 'intact') { rect(g, 1, 7, 3, 2, '#9aa0a6'); rect(g, 8, 8, 4, 1, '#9aa0a6'); } }) };
    case 'ladder': {
      if (st === 'destroyed') return wreck(14, ['#c8ccd2', '#9aa0a6'], v, 4);
      return { shadow: [6, 3], c: mk(14, 26, (g) => {
        line(g, 2, 25, 6, 0, '#c8ccd2'); line(g, 12, 25, 8, 0, '#9aa0a6'); rect(g, 5, 0, 4, 2, '#d9a82e');
        for (let y = 5; y < 24; y += 5) rect(g, 3 + Math.floor((24 - y) / 7), y, 8 - Math.floor((24 - y) / 4), 1, '#e0e4e8');
      }) };
    }
    case 'mop_bucket': return { shadow: [5, 2], c: mk(12, 22, (g) => { rect(g, 1, 13, 9, 8, '#d9a82e'); rect(g, 1, 13, 9, 1, '#f0c050'); rect(g, 8, 14, 2, 7, '#a07a1e'); g.fillStyle = 'rgba(120,150,170,0.8)'; g.fillRect(2, 14, 6, 2); line(g, 4, 14, 8, 0, '#8a6a40'); rect(g, 2, 16, 4, 2, '#d8d8c8'); if (st !== 'intact') { g.fillStyle = 'rgba(80,150,210,0.5)'; g.fillRect(0, 20, 12, 2); } }) };
    case 'cable_reel': return { shadow: [6, 3], c: mk(14, 14, (g) => { ellipse(g, 7, 7, 6, 6, '#2a2a2a'); ellipse(g, 7, 7, 4, 4, '#d9a82e'); ellipse(g, 7, 7, 2, 2, '#1a1a1a'); rect(g, 1, 12, 12, 2, '#3a3a3a'); if (st === 'active') sparks(g, 12, 8, fr, 3); }) };
    case 'boiler': {
      if (st === 'destroyed') return wreck(30, ['#7a8086', '#a8aeb4', '#c02828'], v, 12);
      return { shadow: [15, 5], c: mk(30, 40, (g) => {
        rect(g, 3, 4, 24, 34, '#8a9096'); rect(g, 3, 4, 5, 34, '#b0b6bc'); rect(g, 22, 4, 5, 34, '#6a7076');
        ellipse(g, 15, 5, 12, 4, '#c0c6cc'); rect(g, 13, 0, 4, 4, '#6a7076');
        for (let y = 10; y < 36; y += 8) rect(g, 3, y, 24, 1, '#5a6066');
        ellipse(g, 15, 18, 4, 4, '#f2f0e8'); ellipse(g, 15, 18, 3, 3, '#e8e8e0'); line(g, 15, 18, 17, 16, '#c02828');
        rect(g, 0, 26, 4, 3, '#c02828'); rect(g, 26, 12, 4, 3, '#7a8086');
        if (st === 'active' || st === 'damaged') { smoke(g, 26, 10, fr); if (st === 'active') rect(g, 13, 24, 4, 2, '#ff6a30'); }
        rect(g, 5, 36, 20, 2, '#3a3e44');
      }) };
    }
    case 'pipe': {
      const vertical = p.D > p.W;
      const W = p.W, H = vertical ? p.D : 12;
      return { shadow: null, c: mk(W, H, (g) => {
        if (vertical) { rect(g, 4, 0, 8, H, '#7a8086'); rect(g, 5, 0, 2, H, '#a8aeb4'); rect(g, 10, 0, 2, H, '#5a6066'); for (let y = 8; y < H; y += 16) { rect(g, 3, y, 10, 3, '#5a6066'); rect(g, 6, y - 2, 4, 2, '#c02828'); } }
        else { rect(g, 0, 3, W, 7, '#7a8086'); rect(g, 0, 4, W, 2, '#a8aeb4'); rect(g, 0, 8, W, 2, '#5a6066'); for (let x = 8; x < W; x += 16) { rect(g, x, 2, 3, 9, '#5a6066'); rect(g, x - 1, 0, 5, 2, '#c02828'); } }
        if (st === 'damaged' || st === 'active') { smoke(g, W >> 1, 4, fr); }
      }) };
    }
    case 'conveyor': {
      const vertical = p.D > p.W;
      const W = p.W, D = vertical ? p.D - 4 : 10, H = D + 8;
      if (st === 'destroyed') return wreck(W, ['#3a3e44', '#5a5e66', '#b08a5a'], v, 8);
      return { shadow: [W / 2, 3], c: mk(W, H, (g) => {
        rect(g, 0, 0, W, D, '#2a2c30'); for (let i = (fr * 2) % 4; i < (vertical ? D : W); i += 4) { if (vertical) rect(g, 1, i, W - 2, 1, '#3a3e44'); else rect(g, i, 1, 1, D - 2, '#3a3e44'); }
        rect(g, 0, 0, W, 1, '#7a7e86'); rect(g, 0, D - 1, W, 1, '#7a7e86');
        rect(g, 0, D, W, 6, '#5a5e66'); rect(g, 0, D, W, 1, '#8a8e96');
        for (let x = 2; x < W - 2; x += 10) rect(g, x, D + 6, 2, 2, '#2a2a2a');
        const n = Math.floor((vertical ? D : W) / 14);
        for (let i = 0; i < n; i++) { const o = 3 + i * 14; if (vertical) { rect(g, 2, o, W - 4, 7, '#b08a5a'); rect(g, 2, o, W - 4, 1, '#c8a070'); } else { rect(g, o, 1, 9, D - 3, '#b08a5a'); rect(g, o, 1, 9, 1, '#c8a070'); rect(g, o + 3, 2, 3, D - 4, '#d8c8a0'); } }
      }) };
    }
    case 'helipad_light': return { shadow: null, c: mk(8, 6, (g) => { rect(g, 1, 2, 6, 4, '#3a3a3a'); rect(g, 2, 1, 4, 2, (fr & 1) ? '#ff4040' : '#802020'); }) };
    case 'vending_snack': return vendingArt(p, true);
    case 'vending_machine': return vendingArt(p, false);
    case 'fridge': return fridgeArt(p);
    case 'microwave': return microwaveArt(p);
    case 'kettle': return kettleArt(p);
    case 'knife_block': return knifeBlockArt(p);
    case 'sink': return sinkArt(p);
    case 'toilet_cubicle': {
      if (st === 'destroyed') return wreck(30, [s.cubicle, s.cubicleTrim, '#f2f2f2'], v, 10);
      const pcol = s.act === 4 ? '#5c0e18' : s.act === 3 ? '#4a5470' : s.act === 2 ? '#e8e8f0' : '#a8b0a0';
      return { shadow: [15, 4], c: mk(30, 40, (g) => {
        // inside seen from above (back half), door panel in front
        rect(g, 0, 0, 30, 14, shade(s.tile[0], -0.05));
        rect(g, 0, 0, 2, 40, pcol); rect(g, 28, 0, 2, 40, shade(pcol, -0.2)); rect(g, 0, 0, 30, 2, shade(pcol, 0.1));
        ellipse(g, 15, 8, 5, 4, '#f4f4f2'); ellipse(g, 15, 8, 3, 2, '#c8d8e0'); rect(g, 11, 2, 8, 3, '#e8e8e6');
        rect(g, 4, 3, 3, 4, '#f2f2f0'); // loo roll
        const open = st === 'used' || st === 'damaged';
        if (open) { rect(g, 2, 14, 4, 24, shade(pcol, 0.1)); rect(g, 6, 14, 22, 24, shade(s.tile[0], -0.1)); }
        else {
          rect(g, 2, 14, 26, 24, pcol); rect(g, 2, 14, 26, 1, shade(pcol, 0.3)); rect(g, 2, 37, 26, 1, shade(pcol, -0.35));
          rect(g, 22, 24, 3, 3, s.metal); rect(g, 22, 20, 3, 2, (v & 1) ? '#c02828' : '#2a8a3a');
        }
        rect(g, 0, 38, 30, 2, '#2a2a2a');
      }) };
    }
    case 'urinal': return { shadow: [5, 2], c: mk(12, 16, (g) => { rect(g, 2, 0, 8, 14, '#f2f2f0'); rect(g, 3, 3, 6, 9, '#d8e0e4'); rect(g, 2, 0, 8, 1, '#ffffff'); rect(g, 5, 0, 2, 2, s.metal); if (st !== 'intact') { cracks(g, 2, 1, 8, 12, v, '#8a9094', 3); g.fillStyle = 'rgba(120,180,230,0.6)'; g.fillRect(0, 14, 12, 2); } }) };
    case 'ceo_shrine': {
      if (st === 'destroyed') return wreck(46, ['#d4a537', '#7a1420', '#2a1a10', '#f2d27a'], v, 12);
      return { shadow: [22, 5], c: mk(46, 40, (g) => {
        // altar table with a red runner, gold frame portrait, offerings
        rect(g, 0, 18, 46, 10, '#2a1a10'); rect(g, 0, 18, 46, 1, '#4a3020');
        rect(g, 0, 28, 46, 12, '#1a100a'); rect(g, 0, 28, 46, 1, '#d4a537'); rect(g, 0, 39, 46, 1, '#0a0604');
        rect(g, 14, 18, 18, 22, '#a01828'); rect(g, 14, 18, 18, 1, '#c03040'); rect(g, 15, 36, 16, 2, '#d4a537');
        // portrait: anonymous executive silhouette in a sunburst
        rect(g, 15, 0, 16, 18, '#d4a537'); rect(g, 16, 1, 14, 16, '#f2d27a'); rect(g, 17, 2, 12, 14, '#3a2a40');
        for (let i = 0; i < 6; i++) line(g, 23, 9, 23 + Math.round(Math.cos(i * 1.05) * 6), 9 + Math.round(Math.sin(i * 1.05) * 6), '#5a4a60');
        ellipse(g, 23, 7, 3, 3, '#1a1018'); rect(g, 19, 11, 9, 5, '#1a1018'); rect(g, 22, 11, 3, 3, '#c8c8c8'); px(g, 23, 12, '#a01828');
        // candles + offerings
        for (const x of [3, 8, 37, 42]) { rect(g, x, 12, 2, 7, '#f2ecd8'); px(g, x, 11, (fr + x) & 1 ? '#ffd060' : '#ff9a30'); px(g, x + 1, 10, '#ffe8a0'); }
        mug(g, 9, 21, '#f2f0e8'); rect(g, 34, 21, 5, 3, '#e8e0c0'); px(g, 36, 20, '#c02828');
        if (st === 'damaged') { line(g, 17, 2, 28, 15, '#f2d27a'); }
      }) };
    }
    case 'candles': return { shadow: [4, 2], noOutline: false, c: mk(10, 12, (g) => {
      const fl = (i: number) => ((fr + i) & 1) ? '#ffd060' : '#ffa030';
      if (st === 'destroyed') { rect(g, 0, 9, 10, 3, '#f2ecd8'); return; }
      rect(g, 1, 6, 2, 6, '#f2ecd8'); rect(g, 4, 3, 2, 9, '#ece4cc'); rect(g, 7, 7, 2, 5, '#f2ecd8');
      px(g, 1, 5, fl(0)); px(g, 4, 2, fl(1)); px(g, 7, 6, fl(2)); px(g, 4, 1, '#fff0b0');
      rect(g, 0, 11, 10, 1, '#d4a537');
    }) };
    case 'ceremonial_lectern': {
      if (st === 'destroyed') return wreck(14, ['#2a1a10', '#d4a537', '#a01828'], v, 6);
      return { shadow: [6, 3], c: mk(14, 24, (g) => {
        rect(g, 1, 3, 12, 5, '#3a2416'); rect(g, 1, 3, 12, 1, '#d4a537');
        rect(g, 3, 1, 8, 3, '#f2ecd8'); rect(g, 6, 1, 1, 3, '#c8c0a8');
        rect(g, 4, 8, 6, 14, '#2a1a10'); rect(g, 5, 9, 4, 10, '#a01828'); rect(g, 5, 12, 4, 1, '#d4a537');
        rect(g, 2, 22, 10, 2, '#d4a537');
      }) };
    }
    case 'safe': return boxyArt(p, '#4a5058', 14, (g, W, H) => { ellipse(g, W >> 1, H - 8, 3, 3, '#c8ccd2'); px(g, W >> 1, H - 10, '#1a1a1a'); rect(g, W - 4, H - 10, 2, 5, '#9aa0a6'); if (st === 'used') { rect(g, 1, H - 14, W - 2, 12, '#1a1c20'); rect(g, 3, H - 6, 6, 3, '#d4a537'); } });
    case 'globe_bar': {
      if (st === 'destroyed') return wreck(14, ['#3a6aa0', '#5a8a4a', '#6a4a2c'], v, 6);
      return { shadow: [6, 3], c: mk(14, 22, (g) => {
        rect(g, 3, 19, 8, 3, '#4a2e1c'); rect(g, 6, 13, 2, 7, '#6a4a2c');
        ellipse(g, 7, 8, 6, 6, '#3a6aa0'); rect(g, 3, 5, 4, 3, '#5a8a4a'); rect(g, 8, 9, 3, 3, '#5a8a4a'); px(g, 4, 4, '#a8c8e8');
        rect(g, 0, 8, 14, 1, '#d4a537');
        if (v & 1) { rect(g, 2, 9, 10, 4, '#2a1a10'); rect(g, 4, 6, 1, 4, '#4a8a3a'); rect(g, 8, 7, 1, 3, '#a03a2a'); }
      }) };
    }
    case 'minibar': return boxyArt(p, s.act >= 3 ? '#3a2416' : '#4a4e56', 12, (g, W, H) => { rect(g, 2, H - 10, W - 4, 7, '#1a1a1a'); rect(g, 3, H - 9, W - 6, 5, '#3a2a20'); rect(g, 3, 0, 2, 4, '#4a8a3a'); rect(g, 6, 1, 2, 3, '#a03a2a'); rect(g, 9, 0, 2, 4, '#d8c8a0'); });
    case 'putting_green': {
      const W = p.W, D = Math.max(8, p.D - 2);
      return { shadow: null, c: mk(W, D, (g) => {
        rect(g, 0, 1, W, D - 2, '#3a8a3a'); rect(g, 1, 0, W - 2, D, '#3a8a3a'); speckle2(g, W, D);
        ellipse(g, W - 8, D >> 1, 2, 2, '#0e1a0e'); rect(g, W - 8, (D >> 1) - 9, 1, 9, '#e8e8e8'); rect(g, W - 7, (D >> 1) - 9, 4, 3, '#c02828');
        px(g, 6, (D >> 1), '#f8f8f0'); px(g, 12, (D >> 1) + 2, '#f8f8f0');
        rect(g, 0, D - 1, W, 1, '#2a6a2a');
      }) };
    }
    case 'sales_gong': {
      if (st === 'destroyed') return wreck(16, ['#d4a537', '#4a2e1c'], v, 6);
      return { shadow: [7, 2], c: mk(16, 22, (g) => {
        rect(g, 1, 2, 2, 20, '#4a2e1c'); rect(g, 13, 2, 2, 20, '#4a2e1c'); rect(g, 0, 1, 16, 2, '#6a4a2c');
        ellipse(g, 8, 10, 5, 5, '#c8962a'); ellipse(g, 8, 10, 3, 3, '#e8b84a'); px(g, 7, 8, '#fff0b0');
        line(g, 8, 3, 8, 5, '#2a2a2a');
        if (st === 'active') { for (let i = 0; i < 3; i++) px(g, 1 + i * 6, 8 + (i & 1), '#f2d27a'); }
      }) };
    }
    case 'beanbag': return { shadow: [6, 2], c: mk(14, 10, (g) => { const col = [s.brand, s.brand2, '#7a3cff', '#3a8a8a'][v & 3]; ellipse(g, 7, 6, 6, 4, col); ellipse(g, 6, 4, 4, 2, shade(col, 0.2)); rect(g, 2, 9, 10, 1, shade(col, -0.35)); if (st !== 'intact') { for (let i = 0; i < 6; i++) px(g, (h2(i, v, 1) % 14), 7 + (h2(i, v, 2) % 3), '#f2f0e8'); } }) };
    case 'hr_cabinet': return boxyArt(p, s.act === 4 ? '#5c0e18' : '#7a7e72', 22, (g, W, H) => { for (let i = 0; i < 3; i++) { rect(g, 1, H - 21 + i * 7, W - 2, 6, shade(s.act === 4 ? '#5c0e18' : '#7a7e72', 0.08)); rect(g, (W >> 1) - 2, H - 19 + i * 7, 4, 1, '#d4a537'); } rect(g, 2, H - 26, W - 4, 4, '#f2ecd8'); miniText(g, 'HR', W >> 1, H - 26, '#a01828', true); rect(g, W - 4, H - 12, 2, 3, '#d4a537'); });
    case 'fortune_copier': {
      if (st === 'destroyed') return wreck(30, ['#5a4a6a', '#d4d6d2', '#40e0d0'], v, 10);
      return { shadow: [15, 4], c: mk(30, 30, (g) => {
        rect(g, 0, 4, 30, 10, '#e0dcd0'); rect(g, 0, 4, 30, 1, '#fffcf0');
        rect(g, 3, 6, 16, 6, '#2a2440'); ellipse(g, 11, 9, 5, 2, (fr & 1) ? '#40e0d0' : '#30b0a8'); px(g, 11, 9, '#ffffff');
        rect(g, 21, 6, 7, 6, '#3a3048'); px(g, 23, 8, '#40e0d0'); px(g, 25, 8, '#d4a537');
        rect(g, 0, 14, 30, 16, '#d0ccc0'); rect(g, 0, 14, 30, 1, '#e8e4d8');
        rect(g, 4, 17, 22, 4, '#5a4a6a'); miniText(g, 'FATE', 15, 17, '#f2d27a', true);
        rect(g, 6, 0, 18, 5, '#f8f4e0'); rect(g, 8, 1, 14, 1, '#40e0d0'); rect(g, 8, 3, 10, 1, '#9a9890');
        rect(g, 0, 29, 30, 1, '#7a766a');
        g.fillStyle = 'rgba(64,224,208,0.18)'; g.fillRect(2, 0, 26, 6);
      }) };
    }
    case 'stationery_cupboard': {
      const open = st === 'used' || st === 'active';
      return { shadow: [22, 4], c: mk(46, 40, (g) => {
        box3(g, 0, 0, 46, 4, 36, '#9aa0a8', '#7a8088');
        rect(g, 0, 4, 1, 36, '#a8aeb6'); rect(g, 45, 4, 1, 36, '#4a5058');
        if (open) {
          rect(g, 2, 6, 42, 32, '#2a2e36');
          for (let sh = 0; sh < 3; sh++) { rect(g, 2, 15 + sh * 10, 42, 1, '#9aa0a8'); if (st === 'active') stationery(g, 3, 6 + sh * 10, 40, 9); }
          rect(g, 0, 6, 3, 32, '#6a7078'); rect(g, 43, 6, 3, 32, '#6a7078');
        } else {
          rect(g, 2, 6, 20, 32, '#8a9098'); rect(g, 24, 6, 20, 32, '#8a9098');
          rect(g, 2, 6, 20, 1, '#a8aeb6'); rect(g, 24, 6, 20, 1, '#a8aeb6');
          rect(g, 22, 6, 2, 32, '#f2d27a'); // glow through the gap
          g.fillStyle = 'rgba(255,220,120,0.35)'; g.fillRect(20, 4, 6, 36);
          rect(g, 19, 20, 2, 5, '#d8dce0'); rect(g, 25, 20, 2, 5, '#d8dce0');
          rect(g, 21, 26, 4, 4, '#d4a537'); rect(g, 22, 25, 2, 1, '#a07a20');
          rect(g, 8, 10, 30, 7, '#f2f0e8'); miniText(g, 'STATIONERY', 23, 11, '#2a3a6a', true);
        }
      }) };
    }
    case 'glass_partition': return glassPartitionArt(p);
    case 'printer': return printerArt(p);
    case 'water_cooler': return waterCoolerArt(p);
    case 'fire_extinguisher': return extinguisherArt(p);
    case 'filing_cabinet': return filingArt(p);
    case 'cable_run': {
      const vertical = p.D > p.W;
      const W = p.W, H = vertical ? p.D : 8;
      return { shadow: null, c: mk(W, H, (g) => {
        if (vertical) { rect(g, 5, 0, 6, H, '#2a2a2a'); for (let y = 0; y < H; y += 6) rect(g, 5, y, 6, 3, '#d9a82e'); rect(g, 5, 0, 1, H, '#4a4a4a'); }
        else { rect(g, 0, 2, W, 5, '#2a2a2a'); for (let x = 0; x < W; x += 6) rect(g, x, 2, 3, 5, '#d9a82e'); rect(g, 0, 2, W, 1, '#4a4a4a'); }
        if (st === 'damaged' || st === 'active' || st === 'destroyed') { const cx = W >> 1, cy = vertical ? H >> 1 : 4; rect(g, cx - 2, cy - 1, 4, 3, '#1a1a1a'); line(g, cx - 2, cy, cx + 3, cy - 3, '#c87020'); line(g, cx, cy, cx - 3, cy + 3, '#3a6ad0'); if (st === 'active') sparks(g, cx, cy, fr, 3); }
      }) };
    }
    case 'socket': return { shadow: null, c: mk(10, 8, (g) => {
      rect(g, 0, 1, 10, 7, '#5a5e66'); rect(g, 0, 1, 10, 1, '#8a8e96'); rect(g, 2, 3, 2, 2, '#1a1a1a'); rect(g, 6, 3, 2, 2, '#1a1a1a');
      line(g, 3, 4, 3, 7, '#2a2a2a');
      if (st !== 'intact') { scorch(g, 0, 1, 10, 7, v); if (st === 'active' || (st === 'damaged' && (fr & 1))) sparks(g, 5, 3, fr, 3); }
    }) };
    case 'photocopier': return photocopierArt(p);
    case 'server_rack': return serverRackArt(p);
    case 'shredder': return shredderArt(p);
    case 'stock_ticker': case 'leaderboard_screen': case 'tv_screen': case 'projector_screen': case 'banner_values': case 'mirror':
    case 'dartboard': case 'noticeboard': case 'hand_dryer': case 'sprinkler':
      return wallArt({ ...p, wall: true });
    default: return { c: mk(12, 12, (g) => rect(g, 0, 0, 12, 12, '#6a7480')) };
  }
}
function speckle2(g: Ctx, W: number, D: number): void { for (let i = 0; i < W * D / 8; i++) { const r = h2(i, W, D); px(g, r % W, (r >> 8) % D, (r & 64) ? '#4a9a4a' : '#2e7a2e'); } }

// ------------------------------------------------------------------------------------------------
// public

export function buildPropSprite(p: PropDef, state: PropState, frame: number, s: Skin): Sprite {
  const kind = p.kind;
  if (kind === 'exit_stairs' || kind === 'exit_lift' || kind === 'exit_corridor')
    return buildExitSprite(kind === 'exit_stairs' ? 'stairs' : kind === 'exit_lift' ? 'lift' : 'corridor', true, state === 'active' || state === 'used', s);
  const wall = !!p.wallMounted;
  // footprint in px (rounded to tiles where props span tiles)
  const W = wall ? p.w : Math.max(TILE, Math.ceil(p.w / TILE) * TILE);
  const D = wall ? TILE : Math.max(TILE, Math.ceil(p.h / TILE) * TILE);
  const animated = ['printer', 'server_rack', 'candles', 'ceo_shrine', 'socket', 'cable_run', 'stock_ticker', 'fortune_copier', 'conveyor', 'helipad_light', 'water_cooler', 'sprinkler', 'microwave', 'shredder', 'boiler', 'pipe', 'photocopier', 'cable_reel', 'tv_screen', 'leaderboard_screen'].includes(kind);
  const fr = animated ? frame & 3 : 0;
  const key = `${s.key}|${kind}|${state}|${W}x${D}|${p.facing}|${wall ? 1 : 0}|${p.variant & 7}|${fr}`;
  let sp = cache.get(key);
  if (sp) return sp;
  const pp: PP = { s, st: state, f: p.facing, v: p.variant & 7, fr, W, D, wall, kind };
  const art = propArt(pp);
  const body = art.noOutline ? art.c : withOutline(art.c, OUTLINE);
  const off = art.noOutline ? 0 : 1;
  const lift = art.lift ?? 0;
  let img = body;
  if (art.shadow && !wall) {
    const [rx, ry] = art.shadow;
    const w = Math.max(body.width, Math.ceil(rx * 2) + 2), h = body.height + Math.ceil(ry) + 1;
    img = makeCanvas(w, h);
    const g = ctx2d(img);
    shadowEllipse(g, w / 2, body.height - off - 1, Math.round(rx), Math.round(ry), 0.3);
    g.drawImage(body, Math.round((w - body.width) / 2), 0);
    sp = sprite(img, Math.round(w / 2), body.height - off + lift);
  } else {
    sp = sprite(img, Math.round(img.width / 2), img.height - off + lift);
  }
  cache.set(key, sp);
  return sp;
}

/** Every prop kind (for galleries / asset export). */
export const ALL_PROP_KINDS: PropKind[] = [
  'desk', 'desk_l', 'reception_desk', 'meeting_table', 'exec_desk', 'chair', 'swivel_chair', 'exec_chair', 'sofa',
  'bookshelf', 'plant', 'plant_large', 'bin', 'coat_stand', 'whiteboard', 'projector_screen', 'tv_screen',
  'cubicle_wall', 'pigeonholes', 'parcel_cage', 'mail_trolley', 'sack_pile', 'toolbox', 'ladder', 'mop_bucket',
  'trophy_cabinet', 'putting_green', 'minibar', 'globe_bar', 'leaderboard_screen', 'sales_gong', 'archive_stack',
  'conveyor', 'boiler', 'pipe', 'helipad_light', 'vending_snack', 'canteen_counter', 'fridge', 'kettle',
  'knife_block', 'sink', 'toilet_cubicle', 'urinal', 'mirror', 'banner_values', 'ceo_shrine', 'candles', 'ceremonial_lectern',
  'stationery_shelf', 'safe', 'stock_ticker', 'dartboard', 'ping_pong', 'beanbag', 'cable_reel',
  'glass_partition', 'printer', 'water_cooler', 'fire_extinguisher', 'filing_cabinet', 'sprinkler', 'cable_run', 'socket',
  'photocopier', 'server_rack', 'shredder', 'microwave', 'hand_dryer',
  'hr_cabinet', 'vending_machine', 'noticeboard', 'fortune_copier', 'stationery_cupboard', 'exit_stairs', 'exit_lift', 'exit_corridor',
];
void mixHex;
