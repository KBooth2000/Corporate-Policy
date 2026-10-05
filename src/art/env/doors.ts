// Room-lock doors (spec 4.1) and core exits (spec 3.3 / 4.2).
import type { ExitKind } from '../../data/ids';
import { TILE } from '../../game/world-types';
import type { Ctx, Sprite } from '../../render/canvas';
import { paint, sprite, rect, px, shade, withOutline } from '../../render/canvas';
import { OUTLINE } from '../palette';
import type { Skin } from './skin';
import { frame, miniText, h2 } from './util';

export type DoorState = 'open' | 'closed' | 'locked';

const cache = new Map<string, Sprite>();

function doorCols(s: Skin) {
  switch (s.act) {
    case 1: return { leaf: '#a88a5e', leafHi: '#c0a272', leafDark: '#7a6040', frame: '#8a9096', glass: '#9fd0e0', handle: '#d8d8d0' };
    case 2: return { leaf: '#d8dcec', leafHi: '#f4f6fc', leafDark: '#9aa0c0', frame: '#4c5070', glass: '#8ad8f0', handle: s.brand };
    case 3: return { leaf: '#4e3420', leafHi: '#64462c', leafDark: '#34200f', frame: '#2a3040', glass: '#6a90b0', handle: '#b8925a' };
    default: return { leaf: '#6a0e18', leafHi: '#8a1a24', leafDark: '#40060c', frame: '#d4a537', glass: '#e8c890', handle: '#f2d27a' };
  }
}

/** Security shutter (locked): steel slats, hazard edge, red lamp. */
function shutterH(g: Ctx, w: number, y0: number, h: number, lampOn = true): void {
  rect(g, 0, y0, w, h, '#6a7078');
  for (let y = y0; y < y0 + h; y += 2) { rect(g, 0, y, w, 1, '#868c94'); }
  rect(g, 0, y0 + h - 2, w, 2, '#3a3e44');
  for (let x = 0; x < w; x += 6) { rect(g, x, y0 + h - 2, 3, 2, '#d9a82e'); }
  rect(g, 0, y0, 2, h, '#2a2e34'); rect(g, w - 2, y0, 2, h, '#2a2e34');
  if (lampOn) { rect(g, (w >> 1) - 2, y0 - 3, 4, 3, '#e02828'); px(g, (w >> 1) - 1, y0 - 3, '#ff9a8a'); }
}

export function buildDoorSprite(orient: 'h' | 'v', len: number, state: DoorState, s: Skin): Sprite {
  const key = s.key + orient + len + state;
  let sp = cache.get(key);
  if (sp) return sp;
  const c = doorCols(s);
  if (orient === 'h') {
    // door in a horizontal wall: seen from the front. Spans the door tiles; rises 6 px above for the lintel/lamp.
    const W = len * TILE, H = TILE + 6, top = 6;
    const img = paint(W, H, (g) => {
      // jambs + lintel (always)
      rect(g, 0, top, 2, TILE, c.frame); rect(g, W - 2, top, 2, TILE, c.frame);
      rect(g, 0, top, W, 3, c.frame); rect(g, 0, top, W, 1, shade(c.frame, 0.3));
      if (state === 'open') {
        // leaves slid into the wall pockets: just slivers at the jambs
        rect(g, 2, top + 3, 2, TILE - 4, c.leafDark); rect(g, W - 4, top + 3, 2, TILE - 4, c.leafDark);
        rect(g, (W >> 1) - 2, top - 3, 4, 3, '#2a8a3a'); px(g, (W >> 1) - 1, top - 3, '#8af0a0');
        return;
      }
      if (state === 'locked') { shutterH(g, W, top + 3, TILE - 3); return; }
      // closed double doors
      const lw = (W - 4) >> 1;
      for (const lx of [2, 2 + lw]) {
        rect(g, lx, top + 3, lw, TILE - 3, c.leaf);
        rect(g, lx, top + 3, lw, 1, c.leafHi); rect(g, lx + lw - 1, top + 3, 1, TILE - 3, c.leafDark);
        rect(g, lx + 3, top + 5, lw - 6, 4, c.glass); rect(g, lx + 3, top + 5, lw - 6, 1, shade(c.glass, 0.3));
      }
      rect(g, (W >> 1) - 2, top + 9, 1, 3, c.handle); rect(g, (W >> 1) + 1, top + 9, 1, 3, c.handle);
      rect(g, (W >> 1) - 2, top - 3, 4, 3, '#a07020'); px(g, (W >> 1) - 1, top - 3, '#f0c060');
    });
    sp = sprite(img, 0, top);
  } else {
    // door in a vertical wall: seen from above as a slab along the wall line
    const W = TILE, H = len * TILE;
    const img = paint(W, H + 4, (g) => {
      const y0 = 4;
      rect(g, 3, y0, 10, 3, c.frame); rect(g, 3, y0 + H - 3, 10, 3, c.frame);
      rect(g, 3, y0, 10, 1, shade(c.frame, 0.3));
      if (state === 'open') {
        rect(g, 5, y0 + 3, 6, 2, c.leafDark); rect(g, 5, y0 + H - 5, 6, 2, c.leafDark);
        rect(g, 6, 0, 4, 3, '#2a8a3a'); px(g, 7, 0, '#8af0a0');
        return;
      }
      if (state === 'locked') {
        rect(g, 4, y0 + 3, 8, H - 6, '#6a7078');
        for (let y = y0 + 3; y < y0 + H - 3; y += 2) rect(g, 4, y, 8, 1, '#868c94');
        for (let y = y0 + 3; y < y0 + H - 3; y += 6) rect(g, 11, y, 1, 3, '#d9a82e');
        rect(g, 6, 0, 4, 3, '#e02828'); px(g, 7, 0, '#ff9a8a');
        return;
      }
      rect(g, 5, y0 + 3, 6, H - 6, c.leaf);
      rect(g, 5, y0 + 3, 1, H - 6, c.leafHi); rect(g, 10, y0 + 3, 1, H - 6, c.leafDark);
      rect(g, 5, y0 + (H >> 1) - 1, 6, 1, c.leafDark);
      rect(g, 7, y0 + (H >> 1) - 4, 2, 2, c.handle); rect(g, 7, y0 + (H >> 1) + 2, 2, 2, c.handle);
      rect(g, 6, 0, 4, 3, '#a07020'); px(g, 7, 0, '#f0c060');
    });
    sp = sprite(img, 0, 4);
  }
  cache.set(key, sp);
  return sp;
}

// ---------------------------------------------------------------------------------------------
// Exits: drawn over the core block face. Origin = base centre, 8 px in front of the doorway (ExitDef x,y).

function tape(g: Ctx, w: number, y: number, h: number): void {
  // diagonal "OUT OF ORDER" hazard tape (amber/black; never the reserved telegraph yellow)
  for (let i = -h; i < w + h; i++) for (let j = 0; j < 4; j++) {
    const x = i + j, yy = y + Math.floor((i * h) / w);
    if (x < 0 || x >= w || yy < 0) continue;
    px(g, x, yy + j, ((i >> 2) & 1) ? '#d9a82e' : '#1a1a1a');
  }
  for (let i = -h; i < w + h; i++) for (let j = 0; j < 4; j++) {
    const x = w - 1 - (i + j), yy = y + Math.floor((i * h) / w);
    if (x < 0 || x >= w || yy < 0) continue;
    px(g, x, yy + j, ((i >> 2) & 1) ? '#d9a82e' : '#1a1a1a');
  }
}

function sign(g: Ctx, cx: number, y: number, text: string, bg: string, fg: string): void {
  const w = text.length * 4 + 3;
  rect(g, cx - (w >> 1), y, w, 8, bg);
  frame(g, cx - (w >> 1), y, w, 8, shade(bg, -0.4));
  miniText(g, text, cx, y + 2, fg, true);
}

export function buildExitSprite(kind: ExitKind, available: boolean, open: boolean, s: Skin): Sprite {
  const key = s.key + kind + available + open;
  let sp = cache.get(key);
  if (sp) return sp;
  const dw = kind === 'lift' ? 48 : 32;
  const W = dw + (kind === 'lift' ? 14 : 8), H = 46;
  const base = H - 8; // doorway bottom row
  const x0 = (W - dw) >> 1;
  const body = paint(W, H, (g) => {
    const steel = s.act === 4 ? '#c8a050' : '#a8b0b8', steelHi = s.act === 4 ? '#f2d27a' : '#d0d6dc', steelDk = s.act === 4 ? '#7a5a20' : '#6a7078';
    const dh = 30; // doorway height
    const top = base - dh;
    // threshold mat in front
    rect(g, x0 + 2, base, dw - 4, 6, s.act === 4 ? '#5c0e18' : '#3a3e46');
    rect(g, x0 + 2, base, dw - 4, 1, shade(s.act === 4 ? '#5c0e18' : '#3a3e46', 0.25));
    // surround
    rect(g, x0 - 3, top - 4, dw + 6, dh + 4, steelDk);
    rect(g, x0 - 2, top - 3, dw + 4, dh + 3, steel);
    rect(g, x0 - 2, top - 3, dw + 4, 1, steelHi);
    if (kind === 'lift') {
      // indicator panel above
      rect(g, (W >> 1) - 10, top - 11, 20, 7, '#101418'); frame(g, (W >> 1) - 10, top - 11, 20, 7, steelDk);
      if (available) {
        const on = open ? '#5af07a' : '#e04040';
        px(g, (W >> 1) - 7, top - 8, on); px(g, (W >> 1) - 8, top - 7, on); px(g, (W >> 1) - 6, top - 7, on); // up arrow
        miniText(g, open ? 'UP' : '--', (W >> 1) + 2, top - 10, '#ffb040', true);
      }
      // doors
      if (open && available) {
        rect(g, x0, top, dw, dh, '#e8e0c8'); // lit car
        rect(g, x0, top, dw, 3, '#fffbe8');
        rect(g, x0 + 4, top + 6, dw - 8, dh - 10, '#b8b0a0'); rect(g, x0 + 4, top + dh - 6, dw - 8, 6, '#8a8070');
        rect(g, x0 + 6, top + 10, 2, 8, '#606870');
        rect(g, x0, top, 4, dh, steel); rect(g, x0 + dw - 4, top, 4, dh, steel);
      } else {
        const lw = dw >> 1;
        for (const lx of [x0, x0 + lw]) {
          rect(g, lx, top, lw, dh, steel);
          for (let y = top + 2; y < top + dh; y += 3) rect(g, lx + 1, y, lw - 2, 1, shade(steel, 0.08));
          rect(g, lx + lw - 1, top, 1, dh, steelDk);
          rect(g, lx, top, 1, dh, steelHi);
        }
      }
      // call buttons
      const bx = x0 + dw + 3;
      rect(g, bx, top + 10, 4, 8, steelDk); px(g, bx + 1, top + 12, available ? (open ? '#5af07a' : '#ffb040') : '#404040'); px(g, bx + 1, top + 15, available ? '#ffb040' : '#404040');
      if (!available) {
        rect(g, x0 + 10, top + 8, dw - 20, 12, '#f2f0e8'); frame(g, x0 + 10, top + 8, dw - 20, 12, '#b0aca0');
        miniText(g, 'OUT OF', x0 + (dw >> 1), top + 9, '#c02020', true); miniText(g, 'ORDER', x0 + (dw >> 1), top + 15, '#c02020', true);
      }
    } else {
      const isStairs = kind === 'stairs';
      const leaf = isStairs ? (s.act === 4 ? '#7a1420' : '#b83a2a') : s.act === 2 ? '#d8dcec' : s.act === 3 ? '#4e3420' : s.act === 4 ? '#6a0e18' : '#a88a5e';
      if (open && available) {
        rect(g, x0, top, dw, dh, '#1a1c22');
        if (isStairs) for (let i = 0; i < 7; i++) { rect(g, x0 + 2, top + dh - 4 - i * 4, dw - 4, 3, shade('#5a5e66', i * 0.04)); rect(g, x0 + 2, top + dh - 4 - i * 4, dw - 4, 1, '#8a8e96'); }
        else { for (let i = 0; i < 5; i++) { const ins = i * 3; rect(g, x0 + ins, top + ins, dw - ins * 2, dh - ins * 2, shade('#3a3e48', i * 0.08)); } rect(g, x0 + (dw >> 1) - 3, top + 12, 6, 6, '#f0e8c0'); }
        // door swung open (seen edge-on)
        rect(g, x0, top, 3, dh, leaf); rect(g, x0 + dw - 3, top, 3, dh, isStairs ? '#1a1c22' : leaf);
      } else {
        const lw = isStairs ? dw : dw >> 1;
        for (let lx = x0; lx < x0 + dw; lx += lw) {
          rect(g, lx, top, lw, dh, leaf);
          rect(g, lx, top, lw, 1, shade(leaf, 0.25)); rect(g, lx, top, 1, dh, shade(leaf, 0.15)); rect(g, lx + lw - 1, top, 1, dh, shade(leaf, -0.3));
          if (!isStairs) { rect(g, lx + 3, top + 4, lw - 6, 12, s.act === 4 ? '#e8c890' : '#9fd0e0'); rect(g, lx + 3, top + 4, lw - 6, 1, '#e8f8ff'); }
        }
        if (isStairs) { rect(g, x0 + 3, top + 16, dw - 6, 2, '#c8ccd0'); rect(g, x0 + 3, top + 18, dw - 6, 1, '#7a7e84'); rect(g, x0 + 5, top + 4, 8, 10, '#e8e4dc'); }
        else rect(g, x0 + (dw >> 1) - 1, top + 18, 2, 4, '#d8d8d0');
      }
      // signage above the door
      if (isStairs) sign(g, W >> 1, top - 12, 'STAIRS', '#2a8a4a', '#ffffff');
      else sign(g, W >> 1, top - 12, 'WING >', s.act === 2 ? s.brand2 : '#3a5a8a', '#ffffff');
      // status lamp
      if (available) { rect(g, x0 + dw - 6, top - 3, 3, 2, open ? '#5af07a' : '#e04040'); }
    }
    if (!available) {
      rect(g, x0 - 2, top - 3, dw + 4, dh + 3, 'rgba(0,0,0,0.25)');
      tape(g, W, top + 2, dh - 10);
      if (kind !== 'lift') {
        rect(g, x0 + 3, top + 9, dw - 6, 12, '#f2f0e8'); frame(g, x0 + 3, top + 9, dw - 6, 12, '#b0aca0');
        miniText(g, 'OUT OF', W >> 1, top + 10, '#c02020', true); miniText(g, 'ORDER', W >> 1, top + 16, '#c02020', true);
      }
    }
    void h2;
  });
  const img = withOutline(body, OUTLINE);
  sp = sprite(img, (W >> 1) + 1, H + 1);
  cache.set(key, sp);
  return sp;
}
