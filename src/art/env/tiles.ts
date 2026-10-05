// Floor/wall/window/exterior tile rendering for whole floors (cached into one canvas per floor).
// 16x16 tiles, top-down 3/4: wall front faces are drawn inside the wall tile footprint (collision = visuals);
// purely cosmetic parapets/facades are only ever drawn into VOID tiles (which are solid anyway).
import type { FloorMap } from '../../game/world-types';
import { T, TILE } from '../../game/world-types';
import { MAT } from '../../game/gen/materials';
import type { Ctx } from '../../render/canvas';
import { makeCanvas, ctx2d, paint, rect, px, shade, mixHex, line } from '../../render/canvas';
import { drawText } from '../../render/font';
import type { Skin } from './skin';
import { getSkin } from './skin';
import { h2, hf, speckle, frame } from './util';

const WALLISH = new Set<number>([T.WALL, T.CORE_WALL, T.PARTITION, T.GLASS, T.WINDOW, T.WINDOW_SEALED, T.WINDOW_BROKEN]);
const OPEN = new Set<number>([T.FLOOR, T.DOOR, T.RUBBLE, T.CORE_FLOOR, T.WATER, T.CUBICLE, T.PIT]);
const isWallish = (t: number) => WALLISH.has(t);
const isOpen = (t: number) => OPEN.has(t);

export function skinFor(map: FloorMap): Skin { return getSkin(map.req.theme, map.req.act, map.req.floorNumber); }

// ---------------------------------------------------------------------------------------------
// Material sheets: 64x64 seamless textures per (skin, material).

const SHEET = 64;
const sheetCache = new Map<string, HTMLCanvasElement>();

function sheet(s: Skin, mat: number): HTMLCanvasElement {
  const key = s.key + '|' + mat;
  let c = sheetCache.get(key);
  if (c) return c;
  c = paint(SHEET, SHEET, (g) => drawSheet(g, s, mat));
  sheetCache.set(key, c);
  return c;
}

function drawCarpet(g: Ctx, s: Skin, base: [string, string, string], fleck: string, style: string, seed: number): void {
  const [b, l, d] = base;
  rect(g, 0, 0, SHEET, SHEET, b);
  // pile texture
  for (let y = 0; y < SHEET; y++) for (let x = 0; x < SHEET; x++) {
    const r = h2(x, y, seed);
    if ((r & 15) === 0) px(g, x, y, l);
    else if ((r & 15) === 1) px(g, x, y, d);
  }
  if (style === 'tiles' || style === 'grid' || style === 'loop') {
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const alt = (tx + ty) & 1;
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        const x = tx * 16 + i, y = ty * 16 + j;
        if (style === 'loop') { if ((i % 3 === 1) && (j % 3 === 1)) px(g, x, y, l); if ((i % 3 === 2) && (j % 3 === 2)) px(g, x, y, d); continue; }
        if (alt ? (j % 3 === 0 && (h2(x, y, seed + 1) & 3) !== 0) : (i % 3 === 0 && (h2(x, y, seed + 2) & 3) !== 0)) px(g, x, y, alt ? shade(b, 0.05) : shade(b, -0.05));
      }
      if (style === 'grid' || style === 'tiles') {
        rect(g, tx * 16, ty * 16, 16, 1, style === 'grid' ? d : shade(b, -0.08));
        rect(g, tx * 16, ty * 16, 1, 16, style === 'grid' ? d : shade(b, -0.08));
      }
    }
  } else if (style === 'stripe') {
    rect(g, 0, 20, SHEET, 8, l); rect(g, 0, 23, SHEET, 1, mixHex(b, fleck, 0.6)); rect(g, 0, 52, SHEET, 1, mixHex(b, fleck, 0.35));
  } else if (style === 'pinstripe') {
    for (let x = 0; x < SHEET; x += 4) for (let y = 0; y < SHEET; y++) if ((h2(x, y, seed) & 7) !== 0) px(g, x, y, l);
  } else if (style === 'speckle') {
    speckle(g, 0, 0, SHEET, SHEET, [fleck, l, d], 0.06, seed);
  } else if (style === 'diamond') {
    for (let y = 0; y < SHEET; y++) for (let x = 0; x < SHEET; x++) {
      const a = (x + y) % 16, bb = (x - y + 64) % 16;
      if (a === 0 || bb === 0) px(g, x, y, d);
      if ((a === 8 && bb === 8)) px(g, x, y, fleck);
    }
  } else if (style === 'pattern') {
    for (let y = 0; y < SHEET; y++) for (let x = 0; x < SHEET; x++) {
      const a = (x + y) % 16, bb = (x - y + 64) % 16;
      if (a === 0 || bb === 0) px(g, x, y, d);
      if (a === 8 && bb === 8) { px(g, x, y, fleck); }
      if ((a === 7 || a === 9) && bb === 8) px(g, x, y, shade(fleck, -0.35));
    }
    rect(g, 0, 0, SHEET, 1, shade(fleck, -0.45));
  }
}

function drawSheet(g: Ctx, s: Skin, mat: number): void {
  const seed = mat * 101 + s.act * 7;
  switch (mat) {
    case MAT.CARPET: drawCarpet(g, s, s.carpet, s.carpetFleck, s.carpetStyle, seed); break;
    case MAT.ACCENT: drawCarpet(g, s, s.accent, shade(s.accent[1], 0.2), 'tiles', seed); break;
    case MAT.LINO: {
      const [b, l, d] = s.lino;
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) rect(g, tx * 16, ty * 16, 16, 16, (tx + ty) & 1 ? b : shade(b, 0.05));
      speckle(g, 0, 0, SHEET, SHEET, [l, d, shade(d, -0.15)], 0.08, seed);
      for (let i = 0; i < 4; i++) { rect(g, 0, i * 16, SHEET, 1, shade(b, -0.1)); rect(g, i * 16, 0, 1, SHEET, shade(b, -0.1)); }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { px(g, i * 16 + 3, j * 16 + 3, l); px(g, i * 16 + 4, j * 16 + 3, l); }
      break;
    }
    case MAT.TILE: {
      const [b, grout] = s.tile;
      rect(g, 0, 0, SHEET, SHEET, grout);
      for (let y = 0; y < SHEET; y += 8) for (let x = 0; x < SHEET; x += 8) {
        const v = hf(x, y, seed) < 0.15 ? shade(b, -0.06) : b;
        rect(g, x, y, 7, 7, v); px(g, x + 1, y + 1, shade(b, 0.25)); px(g, x + 2, y + 1, shade(b, 0.15));
      }
      break;
    }
    case MAT.RAISED: {
      const [b, l, d] = s.raised;
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const x = tx * 16, y = ty * 16;
        rect(g, x, y, 16, 16, b); rect(g, x, y, 16, 1, l); rect(g, x, y, 1, 16, l); rect(g, x, y + 15, 16, 1, d); rect(g, x + 15, y, 1, 16, d);
        if ((tx * 3 + ty * 5) % 4 === 1) for (let j = 3; j < 13; j += 2) for (let i = 3; i < 13; i += 2) px(g, x + i, y + j, d);
        else { px(g, x + 2, y + 2, d); px(g, x + 13, y + 2, d); px(g, x + 2, y + 13, d); px(g, x + 13, y + 13, d); }
      }
      break;
    }
    case MAT.CONCRETE: {
      const [b, l, d] = s.concrete;
      rect(g, 0, 0, SHEET, SHEET, b);
      speckle(g, 0, 0, SHEET, SHEET, [l, d, shade(b, 0.04)], 0.18, seed);
      rect(g, 0, 31, SHEET, 1, d); rect(g, 31, 0, 1, SHEET, d); rect(g, 0, 63, SHEET, 1, d); rect(g, 63, 0, 1, SHEET, d);
      let cx = 8, cy = 40;
      for (let i = 0; i < 14; i++) { px(g, cx, cy, d); cx += 1; cy += (h2(i, 3, seed) & 3) - 1; }
      break;
    }
    case MAT.WOOD: {
      const [b, l, d] = s.wood;
      rect(g, 0, 0, SHEET, SHEET, b);
      // herringbone: 4x12 planks alternating direction
      for (let by = 0; by < SHEET; by += 8) for (let bx = 0; bx < SHEET; bx += 8) {
        const flip = ((bx + by) / 8) & 1;
        const tone = [b, l, shade(b, -0.08), shade(l, -0.05)][h2(bx, by, seed) & 3];
        if (flip) { rect(g, bx, by, 8, 4, tone); rect(g, bx, by + 4, 8, 4, shade(tone, -0.06)); rect(g, bx, by + 3, 8, 1, d); rect(g, bx, by + 7, 8, 1, d); }
        else { rect(g, bx, by, 4, 8, tone); rect(g, bx + 4, by, 4, 8, shade(tone, -0.06)); rect(g, bx + 3, by, 1, 8, d); rect(g, bx + 7, by, 1, 8, d); }
      }
      speckle(g, 0, 0, SHEET, SHEET, [d, l], 0.03, seed);
      break;
    }
    case MAT.MARBLE: {
      const [b, vein, inlay] = s.marble;
      rect(g, 0, 0, SHEET, SHEET, b);
      speckle(g, 0, 0, SHEET, SHEET, [shade(b, -0.04), shade(b, 0.04)], 0.2, seed);
      for (let v = 0; v < 5; v++) {
        let x = h2(v, 1, seed) % SHEET, y = 0;
        while (y < SHEET) { px(g, x % SHEET, y, vein); if ((h2(x, y, seed) & 3) === 0) px(g, (x + 1) % SHEET, y, shade(vein, 0.2)); y++; x += (h2(v, y, seed) % 3) - 1 + SHEET; }
      }
      rect(g, 0, 0, SHEET, 1, mixHex(b, inlay, 0.55)); rect(g, 0, 0, 1, SHEET, mixHex(b, inlay, 0.55)); rect(g, 0, 32, SHEET, 1, shade(b, -0.08)); rect(g, 32, 0, 1, SHEET, shade(b, -0.08));
      break;
    }
    case MAT.CORE: {
      const [b, l, d] = s.core;
      rect(g, 0, 0, SHEET, SHEET, b);
      if (s.act === 4) {
        speckle(g, 0, 0, SHEET, SHEET, [d, l], 0.12, seed);
        for (let v = 0; v < 4; v++) { let x = h2(v, 9, seed) % SHEET; for (let y = 0; y < SHEET; y++) { px(g, x % SHEET, y, d); x += (h2(v, y, seed) % 3) - 1 + SHEET; } }
        rect(g, 0, 0, SHEET, 1, s.coreInlay); rect(g, 0, 0, 1, SHEET, s.coreInlay); rect(g, 31, 0, 1, SHEET, shade(b, -0.1)); rect(g, 0, 31, SHEET, 1, shade(b, -0.1));
      } else if (s.act === 2) {
        speckle(g, 0, 0, SHEET, SHEET, [l, d], 0.05, seed);
        for (let i = 0; i < SHEET; i += 32) { rect(g, 0, i, SHEET, 1, d); rect(g, i, 0, 1, SHEET, d); }
        for (let i = 0; i < SHEET; i++) if ((i + 4) % 32 < 2) { /* sheen */ }
        for (let i = 0; i < 6; i++) px(g, 6 + i, 4 + i, shade(b, 0.12));
      } else {
        speckle(g, 0, 0, SHEET, SHEET, [l, d, s.coreInlay, shade(b, 0.2)], 0.22, seed);
        for (let i = 0; i < SHEET; i += 32) { rect(g, 0, i, SHEET, 1, d); rect(g, i, 0, 1, SHEET, d); }
      }
      break;
    }
    default: drawCarpet(g, s, s.carpet, s.carpetFleck, s.carpetStyle, seed);
  }
}

// ---------------------------------------------------------------------------------------------
// Tile drawing

function ti(m: FloorMap, x: number, y: number): number {
  return x < 0 || y < 0 || x >= m.w || y >= m.h ? T.VOID : m.tiles[y * m.w + x];
}
function matAt(m: FloorMap, x: number, y: number): number {
  return x < 0 || y < 0 || x >= m.w || y >= m.h ? MAT.CARPET : m.material[y * m.w + x];
}

function drawFloor(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, mat: number): void {
  const sh = sheet(s, mat === MAT.RUBBLE ? MAT.CONCRETE : mat);
  const sx = (x * TILE) % SHEET, sy = (y * TILE) % SHEET;
  g.drawImage(sh, sx, sy, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
  const r = h2(x, y, 911);
  // occasional wear on soft floors
  if ((mat === MAT.CARPET || mat === MAT.ACCENT) && (r & 63) === 0) {
    const c = shade(s.carpet[0], -0.12);
    for (let i = 0; i < 6; i++) px(g, x * TILE + 4 + ((r >>> (i * 3)) & 7), y * TILE + 4 + ((r >>> (i * 2 + 9)) & 7), c);
  }
}

function floorShadows(g: Ctx, m: FloorMap, x: number, y: number): void {
  const X = x * TILE, Y = y * TILE;
  const n = ti(m, x, y - 1), w = ti(m, x - 1, y), e = ti(m, x + 1, y);
  if (isWallish(n)) { g.fillStyle = 'rgba(10,12,20,0.30)'; g.fillRect(X, Y, TILE, 2); g.fillStyle = 'rgba(10,12,20,0.16)'; g.fillRect(X, Y + 2, TILE, 2); g.fillStyle = 'rgba(10,12,20,0.07)'; g.fillRect(X, Y + 4, TILE, 2); }
  if (isWallish(w)) { g.fillStyle = 'rgba(10,12,20,0.18)'; g.fillRect(X, Y, 2, TILE); }
  if (isWallish(e)) { g.fillStyle = 'rgba(10,12,20,0.10)'; g.fillRect(X + TILE - 1, Y, 1, TILE); }
}

function wallColours(s: Skin, t: number) {
  if (t === T.CORE_WALL) return { cap: s.coreCap, edge: shade(s.coreFaceDark, -0.3), face: s.coreFace, hi: s.coreFaceHi, dark: s.coreFaceDark };
  if (t === T.PARTITION) return { cap: shade(s.partition, 0.05), edge: shade(s.partition, -0.35), face: s.partition, hi: shade(s.partition, 0.08), dark: shade(s.partition, -0.18) };
  return { cap: s.wallCap, edge: s.wallCapEdge, face: s.wallFace, hi: s.wallFaceHi, dark: s.wallFaceDark };
}

/** Wall cap (top surface seen from above), with dark edges against open space. */
function drawCap(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, t: number, y0: number, h: number): void {
  const c = wallColours(s, t);
  const X = x * TILE, Y = y * TILE + y0;
  rect(g, X, Y, TILE, h, c.cap);
  rect(g, X, Y + h - 1, TILE, 1, shade(c.cap, -0.12));
  const n = ti(m, x, y - 1), w = ti(m, x - 1, y), e = ti(m, x + 1, y);
  if (y0 === 0 && !isWallish(n)) rect(g, X, Y, TILE, 1, c.edge);
  if (!isWallish(w) && w !== T.VOID) rect(g, X, Y, 1, h, c.edge);
  if (!isWallish(e) && e !== T.VOID) rect(g, X + TILE - 1, Y, 1, h, c.edge);
  if (w === T.VOID) rect(g, X, Y, 1, h, shade(c.cap, -0.2));
  if (e === T.VOID) rect(g, X + TILE - 1, Y, 1, h, shade(c.cap, -0.2));
  if (t === T.CORE_WALL && s.act === 4) { rect(g, X, Y + Math.min(h - 2, 2), TILE, 1, s.coreTrim); }
  if (t === T.PARTITION) { // breachable plasterboard: visible board seams + hairline cracks
    rect(g, X + 7, Y + 1, 1, h - 2, shade(c.cap, -0.1));
  }
}

/** Wall front face in [y0, y0+h) of the tile. */
function drawFace(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, t: number, y0: number, h: number, part: 'full' | 'top' | 'mid' | 'bottom' = 'full'): void {
  const c = wallColours(s, t);
  const X = x * TILE, Y = y * TILE + y0;
  rect(g, X, Y, TILE, h, c.face);
  const r = h2(x, y, 5);
  if (t === T.CORE_WALL) {
    // stone/metal cladding panels
    const joint = shade(c.face, -0.18);
    for (let j = 0; j < h; j++) if (((y * TILE + y0 + j) % 8) === 0) rect(g, X, Y + j, TILE, 1, joint);
    for (let j = 0; j < h; j++) { const row = Math.floor((y * TILE + y0 + j) / 8); if (((x * TILE + (row & 1) * 8) % 16) === 0) px(g, X, Y + j, joint); }
    for (let j = 0; j < h; j += 1) if (((y * TILE + y0 + j) % 8) === 1) rect(g, X, Y + j, TILE, 1, c.hi);
    if (part === 'top' || part === 'full') rect(g, X, Y, TILE, 2, s.coreTrim);
    if (part === 'bottom' || part === 'full') { rect(g, X, Y + h - 2, TILE, 2, shade(c.face, -0.35)); }
    return;
  }
  if (t === T.PARTITION) {
    rect(g, X, Y, TILE, 1, c.hi);
    rect(g, X + 7, Y, 1, h, shade(c.face, -0.1));
    if ((r & 3) === 0) { px(g, X + 3, Y + 4, shade(c.face, -0.25)); px(g, X + 4, Y + 5, shade(c.face, -0.25)); px(g, X + 4, Y + 6, shade(c.face, -0.25)); }
    rect(g, X, Y + h - 2, TILE, 2, s.skirting);
    return;
  }
  switch (s.wallStyle) {
    case 'panel':
      if ((x & 1) === 0) rect(g, X, Y, 1, h, c.dark);
      rect(g, X, Y + Math.floor(h * 0.55), TILE, 1, c.dark); rect(g, X, Y + Math.floor(h * 0.55) + 1, TILE, 1, c.hi);
      break;
    case 'stripe': {
      const sy = Y + Math.floor(h * 0.45);
      rect(g, X, sy, TILE, 2, s.wallStripe); rect(g, X, sy + 2, TILE, 1, shade(s.wallStripe, -0.35));
      if ((x % 6) === 0) rect(g, X, Y, 1, h, c.dark);
      break;
    }
    case 'wood':
      for (let i = 0; i < TILE; i += 4) { rect(g, X + i, Y, 1, h, c.dark); if (((r >> i) & 3) === 0) rect(g, X + i + 2, Y + 2, 1, h - 5, c.hi); }
      rect(g, X, Y + Math.floor(h * 0.4), TILE, 1, s.wallStripe);
      break;
    case 'damask':
      for (let j = 2; j < h - 3; j += 4) for (let i = 2 + ((j >> 2) & 1) * 4; i < TILE; i += 8) { px(g, X + i, Y + j, c.hi); px(g, X + i - 1, Y + j + 1, c.hi); px(g, X + i + 1, Y + j + 1, c.hi); px(g, X + i, Y + j + 2, c.hi); }
      rect(g, X, Y, TILE, 1, s.wallStripe);
      if ((x % 4) === 0) { rect(g, X, Y, 2, h, s.wallStripe); rect(g, X + 2, Y, 1, h, shade(s.wallStripe, -0.4)); }
      break;
    case 'block':
      for (let j = 0; j < h; j++) {
        const yy = y * TILE + y0 + j;
        if (yy % 5 === 0) rect(g, X, Y + j, TILE, 1, c.dark);
        else if ((x * TILE + (Math.floor(yy / 5) & 1) * 6) % 12 === 0) px(g, X, Y + j, c.dark);
      }
      break;
    case 'slat':
      for (let i = 1; i < TILE; i += 3) { rect(g, X + i, Y + 1, 2, h - 3, c.hi); rect(g, X + i + 2, Y + 1, 1, h - 3, c.dark); }
      break;
    default:
      speckle(g, X, Y, TILE, h, [c.hi, c.dark], 0.03, r);
  }
  rect(g, X, Y, TILE, 1, c.hi);
  rect(g, X, Y + h - 2, TILE, 2, s.skirting);
}

// city / sky seen through exterior windows (continuous across tiles: sampled in world space)
function windowView(g: Ctx, s: Skin, X: number, Y: number, w: number, h: number, sealed: boolean): void {
  const top = sealed ? '#2a1c14' : s.exterior === 'street' ? '#6a8ab0' : s.act === 4 ? '#3a2a40' : s.act === 3 ? '#16203a' : s.act === 2 ? '#24204a' : '#2a3e5e';
  const bot = sealed ? '#4a3220' : s.exterior === 'street' ? '#a8c0d4' : s.act === 4 ? '#c07a4a' : s.act === 3 ? '#2e4060' : s.act === 2 ? '#6a3a6a' : '#6a7e96';
  for (let j = 0; j < h; j++) rect(g, X, Y + j, w, 1, mixHex(top, bot, Math.floor((j / h) * 4) / 4));
  // distant towers
  for (let i = 0; i < w; i++) {
    const wx = X + i;
    const bh = 3 + (h2(wx >> 2, 0, 31) % Math.max(2, h - 4));
    const col = sealed ? '#1a120c' : s.exterior === 'street' ? '#5a6878' : '#141a28';
    rect(g, wx, Y + h - bh, 1, bh, col);
    if (!sealed && (h2(wx, Y, 3) % 5) === 0 && bh > 3) px(g, wx, Y + h - bh + 2 + (h2(wx, 1, 9) % Math.max(1, bh - 3)), s.act === 2 ? '#7af0e8' : '#e8c070');
  }
  // reflections
  for (let i = 0; i < w + h; i += 9) for (let k = 0; k < 3; k++) {
    const xx = X + i - k, yy = Y + k;
    for (let j = 0; j < h; j++) { const px0 = xx - j; if (px0 >= X && px0 < X + w && (j + k) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(px0, yy + j - k, 1, 1); } }
  }
}

function drawWindow(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, t: number): void {
  const X = x * TILE, Y = y * TILE;
  const n = ti(m, x, y - 1), so = ti(m, x, y + 1), w = ti(m, x - 1, y), e = ti(m, x + 1, y);
  const sealed = t === T.WINDOW_SEALED, broken = t === T.WINDOW_BROKEN;
  const frameCol = sealed ? s.mullion : shade(s.wallCap, -0.25);
  const winLeft = !(w === t || w === T.WINDOW || w === T.WINDOW_SEALED || w === T.WINDOW_BROKEN);
  const winRight = !(e === t || e === T.WINDOW || e === T.WINDOW_SEALED || e === T.WINDOW_BROKEN);
  if (n === T.VOID && isOpen(so)) {
    // north exterior wall: tall glazing in the face
    windowView(g, s, X, Y, TILE, TILE - 3, sealed);
    if (broken) {
      rect(g, X, Y, TILE, TILE - 3, '#0a0e16');
      g.fillStyle = 'rgba(160,210,230,0.55)';
      for (let i = 0; i < TILE; i += 3) { const len = 2 + (h2(x, i, 2) % 5); g.fillRect(X + i, Y, 2, len); g.fillRect(X + i + 1, Y + TILE - 4 - (h2(i, x, 3) % 3), 2, 2 + (h2(i, x, 3) % 3)); }
    }
    rect(g, X, Y + TILE - 3, TILE, 1, shade(frameCol, 0.25)); // sill
    rect(g, X, Y + TILE - 2, TILE, 2, s.skirting);
    rect(g, X, Y, TILE, 1, frameCol);
    if (winLeft) rect(g, X, Y, 1, TILE - 2, frameCol);
    if (winRight) rect(g, X + TILE - 1, Y, 1, TILE - 2, frameCol);
    rect(g, X + (sealed ? 4 : 8), Y, 1, TILE - 3, frameCol);
    if (sealed) { rect(g, X + 12, Y, 1, TILE - 3, frameCol); rect(g, X, Y + 6, TILE, 1, frameCol); }
    return;
  }
  // window seen from above (south / west / east exterior walls): cap with a glass band
  drawCap(g, m, s, x, y, T.WALL, 0, TILE);
  const glass = sealed ? s.sealedGlass : broken ? '#0a0e16' : s.glassTint;
  if (so === T.VOID || n === T.VOID) {
    rect(g, X, Y + 5, TILE, 6, glass);
    if (!broken) { rect(g, X, Y + 5, TILE, 1, shade(glass, 0.35)); for (let i = (x * 5) % 7; i < TILE; i += 7) px(g, X + i, Y + 7, '#ffffff'); }
    else for (let i = 0; i < TILE; i += 3) { g.fillStyle = 'rgba(160,210,230,0.6)'; g.fillRect(X + i, Y + 5, 2, 1 + (h2(x, i, 4) % 3)); }
    rect(g, X, Y + 4, TILE, 1, frameCol); rect(g, X, Y + 11, TILE, 1, frameCol);
    if (sealed) for (let i = 0; i < TILE; i += 4) rect(g, X + i, Y + 5, 1, 6, frameCol);
  } else {
    rect(g, X + 5, Y, 6, TILE, glass);
    if (!broken) { rect(g, X + 5, Y, 1, TILE, shade(glass, 0.35)); for (let i = (y * 5) % 7; i < TILE; i += 7) px(g, X + 7, Y + i, '#ffffff'); }
    else for (let i = 0; i < TILE; i += 3) { g.fillStyle = 'rgba(160,210,230,0.6)'; g.fillRect(X + 5, Y + i, 1 + (h2(y, i, 4) % 3), 2); }
    rect(g, X + 4, Y, 1, TILE, frameCol); rect(g, X + 11, Y, 1, TILE, frameCol);
    if (sealed) for (let i = 0; i < TILE; i += 4) rect(g, X + 5, Y + i, 6, 1, frameCol);
  }
}

function drawGlassWall(g: Ctx, m: FloorMap, s: Skin, x: number, y: number): void {
  const X = x * TILE, Y = y * TILE;
  const so = ti(m, x, y + 1);
  const n = ti(m, x, y - 1);
  if (isOpen(so) && !isOpen(ti(m, x - 1, y)) && !isOpen(ti(m, x + 1, y)) || (isOpen(so) && isOpen(n))) {
    // glass partition face: floor shows through tint, frosted manifestation band
    drawFloor(g, m, s, x, y, matAt(m, x, y));
    g.fillStyle = 'rgba(170,220,240,0.38)'; g.fillRect(X, Y + 3, TILE, TILE - 3);
    rect(g, X, Y + 2, TILE, 1, s.metal); rect(g, X, Y + TILE - 1, TILE, 1, s.metalDark);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(X, Y + 8, TILE, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(X + ((x * 7) % 11) + 2, Y + 4, 1, 3); g.fillRect(X + ((x * 7) % 11) + 3, Y + 4, 1, 1);
    rect(g, X, Y, TILE, 2, shade(s.metal, 0.1));
    return;
  }
  // vertical run seen from above
  drawFloor(g, m, s, x, y, matAt(m, x, y));
  g.fillStyle = 'rgba(170,220,240,0.45)'; g.fillRect(X + 5, Y, 6, TILE);
  rect(g, X + 5, Y, 1, TILE, s.metal); rect(g, X + 10, Y, 1, TILE, s.metalDark);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(X + 7, Y + ((y * 5) % 9) + 2, 1, 4);
}

function drawCubicle(g: Ctx, m: FloorMap, s: Skin, x: number, y: number): void {
  const X = x * TILE, Y = y * TILE;
  drawFloor(g, m, s, x, y, matAt(m, x, y));
  const c = (xx: number, yy: number) => ti(m, xx, yy) === T.CUBICLE;
  const hz = c(x - 1, y) || c(x + 1, y), vt = c(x, y - 1) || c(x, y + 1);
  const fab = s.cubicle, trim = s.cubicleTrim;
  const fabD = shade(fab, -0.22), fabL = shade(fab, 0.12);
  // shadow
  g.fillStyle = 'rgba(10,12,20,0.22)';
  if (hz || !vt) g.fillRect(X, Y + 13, TILE, 3);
  if (vt) g.fillRect(X + 11, Y, 3, TILE);
  if (vt) {
    const y0 = c(x, y - 1) ? 0 : 3, y1 = c(x, y + 1) ? TILE : 13;
    rect(g, X + 5, Y + y0, 6, y1 - y0, fab);
    rect(g, X + 5, Y + y0, 2, y1 - y0, trim); rect(g, X + 10, Y + y0, 1, y1 - y0, fabD);
    for (let j = y0; j < y1; j += 2) px(g, X + 8, Y + j, fabL);
  }
  if (hz || !vt) {
    const x0 = c(x - 1, y) ? 0 : 3, x1 = c(x + 1, y) ? TILE : 13;
    rect(g, X + x0, Y + 4, x1 - x0, 2, trim);
    rect(g, X + x0, Y + 6, x1 - x0, 7, fab);
    for (let i = x0; i < x1; i += 2) px(g, X + i, Y + 9, fabL);
    rect(g, X + x0, Y + 12, x1 - x0, 1, fabD);
  }
}

function drawVoid(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, dist: Int16Array): void {
  const X = x * TILE, Y = y * TILE;
  const d = dist[y * m.w + x];
  if (s.exterior === 'street') {
    if (d <= 2) {
      // pavement slabs
      const base = '#8a8a86';
      rect(g, X, Y, TILE, TILE, (h2(x, y, 1) & 3) === 0 ? '#84847f' : base);
      rect(g, X, Y, TILE, 1, '#70706c'); rect(g, X, Y, 1, TILE, '#70706c');
      speckle(g, X, Y, TILE, TILE, ['#9a9a95', '#767672'], 0.06, h2(x, y, 2));
    } else if (d === 3) {
      rect(g, X, Y, TILE, TILE, '#3e5a34');
      speckle(g, X, Y, TILE, TILE, ['#4e6e40', '#2e4a28', '#5a7e48'], 0.3, h2(x, y, 3));
      if ((h2(x, y, 4) % 7) === 0) { rect(g, X + 3, Y + 3, 10, 9, '#2e5a2a'); rect(g, X + 4, Y + 4, 6, 4, '#4a7a3a'); }
    } else {
      rect(g, X, Y, TILE, TILE, '#34363a');
      speckle(g, X, Y, TILE, TILE, ['#3c3e42', '#2c2e32'], 0.15, h2(x, y, 5));
      if (d === 4) rect(g, X, Y, TILE, 2, '#a8a8a0');
      if (d === 7 && (x % 3) === 0) rect(g, X + 2, Y + 7, 10, 2, '#c8c0a0');
    }
  } else {
    // city at night far below: irregular dark blocks, sparse lit windows, faint street lights
    const bgc = s.exterior === 'clouds' ? '#0c0a14' : '#0b1018';
    rect(g, X, Y, TILE, TILE, bgc);
    const bx = Math.floor((x + (Math.floor(y / 5) & 1) * 2) / 4), by = Math.floor(y / 5);
    const r = h2(bx, by, 7);
    const lx = (x + (Math.floor(y / 5) & 1) * 2) % 4, ly = y % 5;
    const inBlock = lx !== 0 && ly !== 0 && (r & 7) !== 0;
    if (inBlock) {
      const roof = mixHex(bgc, ['#1a2232', '#161e2c', '#1c2434', '#141a26'][r & 3], 0.7);
      rect(g, X, Y, TILE, TILE, roof);
      if (lx === 1) rect(g, X, Y, 1, TILE, shade(roof, 0.12));
      if (ly === 1) rect(g, X, Y, TILE, 1, shade(roof, 0.15));
      const q = h2(x, y, 21);
      if ((q & 15) === 0) px(g, X + (q >>> 8) % 16, Y + (q >>> 16) % 16, (q & 64) ? '#c8a060' : '#7890a8');
    } else if ((h2(x, y, 9) & 31) === 0) { px(g, X + 8, Y + 8, '#d8c080'); }
    if (s.exterior === 'clouds') {
      const c = h2(Math.floor(x / 6), Math.floor(y / 3), 13);
      if ((c & 7) === 0) { g.fillStyle = 'rgba(190,180,215,0.06)'; g.fillRect(X, Y + 3 + (c >> 8) % 4, TILE, 6); }
    }
  }
  // building facade / drop shadow right below and right of the building
  const n = ti(m, x, y - 1), w = ti(m, x - 1, y);
  if (isWallish(n)) {
    const fac = s.exterior === 'street' ? '#5a6068' : s.act === 4 ? '#2a1c18' : '#1e2632';
    rect(g, X, Y, TILE, 10, fac);
    rect(g, X, Y, TILE, 1, shade(fac, 0.3));
    for (let i = 0; i < TILE; i += 4) rect(g, X + i, Y + 1, 1, 9, shade(fac, -0.3));
    if (s.exterior !== 'street') for (let i = 1; i < TILE; i += 4) if ((h2(x, i, 1) & 3) === 0) px(g, X + i + 1, Y + 4, '#8aa8c8');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y + 10, TILE, 6);
  } else if (isWallish(w)) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y, 5, TILE);
  }
  // parapet: the top of a north exterior wall that shows a full-height face below
  const so = ti(m, x, y + 1);
  if (isWallish(so) && isOpen(ti(m, x, y + 2))) {
    const c = wallColours(s, so === T.CORE_WALL ? T.CORE_WALL : T.WALL);
    rect(g, X, Y + 10, TILE, 6, c.cap);
    rect(g, X, Y + 10, TILE, 1, shade(c.cap, 0.15));
    rect(g, X, Y + 9, TILE, 1, c.edge);
    const ww = ti(m, x - 1, y + 1), ee = ti(m, x + 1, y + 1);
    if (!isWallish(ww)) rect(g, X, Y + 9, 1, 7, c.edge);
    if (!isWallish(ee)) rect(g, X + TILE - 1, Y + 9, 1, 7, c.edge);
  }
}

function drawWallTile(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, t: number): void {
  const so = ti(m, x, y + 1), n = ti(m, x, y - 1);
  if (t === T.CORE_WALL) {
    // the core block shows a tall face (up to 3 tiles) above core floor
    let d = 0;
    for (let k = 1; k <= 3; k++) { const tt = ti(m, x, y + k); if (isOpen(tt)) { d = k; break; } if (tt !== T.CORE_WALL) break; }
    const sideOk = ti(m, x - 1, y) === T.CORE_WALL || ti(m, x + 1, y) === T.CORE_WALL;
    if (d === 1 || (d > 1 && sideOk && ti(m, x, y + d) === T.CORE_FLOOR)) {
      const top = d === 3 || (d >= 1 && !isWallish(n) && n !== T.VOID) ;
      if (d === 1 && !isWallish(n) && n !== T.VOID) { drawCap(g, m, s, x, y, t, 0, 5); drawFace(g, m, s, x, y, t, 5, 11, 'full'); }
      else if (top && d === 3 && n !== T.VOID && !isWallish(n)) { drawCap(g, m, s, x, y, t, 0, 4); drawFace(g, m, s, x, y, t, 4, 12, 'top'); }
      else drawFace(g, m, s, x, y, t, 0, TILE, d === 1 ? 'bottom' : d === 3 ? 'top' : 'mid');
      return;
    }
    drawCap(g, m, s, x, y, t, 0, TILE);
    return;
  }
  if (isOpen(so)) {
    if (n === T.VOID || isWallish(n)) drawFace(g, m, s, x, y, t, 0, TILE);
    else { drawCap(g, m, s, x, y, t, 0, 5); drawFace(g, m, s, x, y, t, 5, 11); }
    return;
  }
  drawCap(g, m, s, x, y, t, 0, TILE);
}

function drawRubble(g: Ctx, m: FloorMap, s: Skin, x: number, y: number): void {
  drawFloor(g, m, s, x, y, matAt(m, x, y));
  const X = x * TILE, Y = y * TILE;
  const cols = [shade(s.partition, -0.1), s.partition, shade(s.partition, -0.3), '#6a6a6a'];
  for (let i = 0; i < 9; i++) {
    const r = h2(x, y, 40 + i);
    const w = 1 + (r & 3), hh = 1 + ((r >>> 2) & 1);
    rect(g, X + ((r >>> 4) % 14), Y + ((r >>> 9) % 14), w, hh, cols[(r >>> 14) & 3]);
  }
  g.fillStyle = 'rgba(200,200,190,0.18)'; g.fillRect(X + 1, Y + 2, TILE - 2, TILE - 4);
}

function drawWater(g: Ctx, m: FloorMap, s: Skin, x: number, y: number): void {
  drawFloor(g, m, s, x, y, matAt(m, x, y));
  const X = x * TILE, Y = y * TILE;
  g.fillStyle = 'rgba(70,130,190,0.45)';
  g.fillRect(X + 1, Y + 2, TILE - 2, TILE - 4); g.fillRect(X + 2, Y + 1, TILE - 4, TILE - 2);
  g.fillStyle = 'rgba(200,235,255,0.55)';
  g.fillRect(X + 4, Y + 4, 3, 1); g.fillRect(X + 9, Y + 9, 2, 1);
}

function drawDoorFloor(g: Ctx, m: FloorMap, s: Skin, x: number, y: number): void {
  drawFloor(g, m, s, x, y, matAt(m, x, y));
  const X = x * TILE, Y = y * TILE;
  const horiz = isWallish(ti(m, x - 1, y)) || ti(m, x - 1, y) === T.DOOR || ti(m, x + 1, y) === T.DOOR || isWallish(ti(m, x + 1, y));
  const vert = isWallish(ti(m, x, y - 1)) || ti(m, x, y - 1) === T.DOOR || ti(m, x, y + 1) === T.DOOR;
  if (horiz && !vert) { rect(g, X, Y + 6, TILE, 4, s.metalDark); rect(g, X, Y + 6, TILE, 1, s.metal); for (let i = 1; i < TILE; i += 3) px(g, X + i, Y + 8, s.metal); }
  else { rect(g, X + 6, Y, 4, TILE, s.metalDark); rect(g, X + 6, Y, 1, TILE, s.metal); for (let i = 1; i < TILE; i += 3) px(g, X + 8, Y + i, s.metal); }
}

function drawTile(g: Ctx, m: FloorMap, s: Skin, x: number, y: number, dist: Int16Array): void {
  const t = ti(m, x, y);
  switch (t) {
    case T.VOID: drawVoid(g, m, s, x, y, dist); return;
    case T.FLOOR: drawFloor(g, m, s, x, y, matAt(m, x, y)); floorShadows(g, m, x, y); return;
    case T.CORE_FLOOR: {
      drawFloor(g, m, s, x, y, MAT.CORE);
      if (matAt(m, x, y) === MAT.ACCENT) {
        // lobby inlay band (brass / brand inlay set into the stone)
        const X = x * TILE, Y = y * TILE;
        const a = (dx: number, dy: number) => ti(m, x + dx, y + dy) === T.CORE_FLOOR && matAt(m, x + dx, y + dy) === MAT.ACCENT;
        const hz = a(-1, 0) || a(1, 0), vt = a(0, -1) || a(0, 1);
        g.fillStyle = s.coreInlay;
        if (hz) { g.fillRect(X, Y + 5, TILE, 1); g.fillRect(X, Y + 10, TILE, 1); }
        if (vt) { g.fillRect(X + 5, Y, 1, TILE); g.fillRect(X + 10, Y, 1, TILE); }
        if (hz && vt) { g.fillRect(X + 6, Y + 6, 4, 4); }
        g.fillStyle = 'rgba(255,255,255,0.12)';
        if (hz) g.fillRect(X, Y + 6, TILE, 4); else if (vt) g.fillRect(X + 6, Y, 4, TILE);
      }
      floorShadows(g, m, x, y); return;
    }
    case T.DOOR: drawDoorFloor(g, m, s, x, y); return;
    case T.RUBBLE: drawRubble(g, m, s, x, y); floorShadows(g, m, x, y); return;
    case T.WATER: drawWater(g, m, s, x, y); floorShadows(g, m, x, y); return;
    case T.PIT: rect(g, x * TILE, y * TILE, TILE, TILE, '#050508'); if (ti(m, x, y - 1) !== T.PIT) rect(g, x * TILE, y * TILE, TILE, 3, '#2a2a30'); return;
    case T.CUBICLE: drawCubicle(g, m, s, x, y); return;
    case T.GLASS: drawGlassWall(g, m, s, x, y); return;
    case T.WINDOW: case T.WINDOW_SEALED: case T.WINDOW_BROKEN: drawWindow(g, m, s, x, y, t); return;
    case T.WALL: case T.CORE_WALL: case T.PARTITION: drawWallTile(g, m, s, x, y, t); return;
    default: rect(g, x * TILE, y * TILE, TILE, TILE, '#202020');
  }
}

// ---------------------------------------------------------------------------------------------
// Decals

const decorCache = new Map<string, HTMLCanvasElement>();

function rugCanvas(s: Skin, w: number, h: number, v: number): HTMLCanvasElement {
  const key = s.key + 'rug' + w + 'x' + h + ':' + v;
  let c = decorCache.get(key);
  if (c) return c;
  const cols = s.act === 4 ? ['#7a1420', '#d4a537'] : s.act === 3 ? ['#4a2a20', '#b8925a'] : s.act === 2 ? [s.brand, s.brand2] : ['#6a5a48', '#c7b26a'];
  c = paint(w, h, (g) => {
    rect(g, 0, 0, w, h, cols[0]);
    frame(g, 2, 2, w - 4, h - 4, cols[1]);
    frame(g, 4, 4, w - 8, h - 8, shade(cols[0], -0.25));
    for (let y = 6; y < h - 6; y += 4) for (let x = 6 + ((y >> 2) & 1) * 2; x < w - 6; x += 4) px(g, x, y, shade(cols[0], 0.18));
    for (let x = 0; x < w; x += 2) { px(g, x, 0, cols[1]); px(g, x + 1, h - 1, cols[1]); }
    if (v & 1) { rect(g, (w >> 1) - 3, (h >> 1) - 1, 6, 2, cols[1]); rect(g, (w >> 1) - 1, (h >> 1) - 3, 2, 6, cols[1]); }
  });
  decorCache.set(key, c);
  return c;
}

function drawDecal(g: Ctx, m: FloorMap, s: Skin, d: FloorMap['decor'][number]): void {
  const x = Math.round(d.x), y = Math.round(d.y), v = d.variant;
  switch (d.kind) {
    case 'rug': {
      const tw = (v >> 4) & 15, th = (v >> 8) & 15;
      const w = Math.max(3, tw) * TILE, h = Math.max(3, th) * TILE;
      g.drawImage(rugCanvas(s, w, h, v & 3), x - w / 2, y - h / 2);
      return;
    }
    case 'logo': case 'sigil': {
      // invented company emblem: a ring with a rising chevron ("Ascend")
      const col = d.kind === 'sigil' ? '#d4a537' : s.brand;
      const r = d.kind === 'sigil' ? 26 : 18;
      g.globalAlpha = 0.85;
      for (let a = 0; a < 360; a += 3) { const rad = (a * Math.PI) / 180; px(g, x + Math.round(Math.cos(rad) * r), y + Math.round(Math.sin(rad) * r * 0.6), col); px(g, x + Math.round(Math.cos(rad) * (r - 2)), y + Math.round(Math.sin(rad) * (r - 2) * 0.6), shade(col, -0.3)); }
      line(g, x - 10, y + 5, x, y - 6, col, 2); line(g, x, y - 6, x + 10, y + 5, col, 2);
      line(g, x - 5, y + 6, x, y + 1, col, 1); line(g, x, y + 1, x + 5, y + 6, col, 1);
      if (d.kind === 'sigil') for (let k = 0; k < 8; k++) { const rad = (k * Math.PI) / 4; rect(g, x + Math.round(Math.cos(rad) * (r + 5)) - 1, y + Math.round(Math.sin(rad) * (r + 5) * 0.6) - 1, 2, 2, col); }
      g.globalAlpha = 1;
      return;
    }
    case 'floor_sign': {
      const txt = 'FLOOR ' + v;
      g.globalAlpha = 0.55;
      drawText(g, txt, x, y - 4, { align: 'center', color: s.act === 4 ? '#b8925a' : shade(s.core[0], -0.35), shadow: null, scale: 1 });
      g.globalAlpha = 1;
      return;
    }
    case 'stain': g.fillStyle = 'rgba(70,45,25,0.28)'; g.fillRect(x - 3, y - 2, 6, 4); g.fillRect(x - 2, y - 3, 4, 6); g.fillStyle = 'rgba(70,45,25,0.18)'; g.fillRect(x + 3, y + 2, 2, 2); return;
    case 'oil': g.fillStyle = 'rgba(15,15,20,0.35)'; g.fillRect(x - 4, y - 2, 8, 5); g.fillRect(x - 2, y - 3, 5, 7); g.fillStyle = 'rgba(120,90,160,0.25)'; g.fillRect(x - 1, y - 1, 2, 1); return;
    case 'papers': for (let i = 0; i < 3; i++) { const r = h2(x, y, i + v); const px0 = x - 6 + (r % 10), py0 = y - 4 + ((r >> 4) % 8); rect(g, px0, py0, 5, 4, s.paper); rect(g, px0 + 1, py0 + 1, 3, 1, '#9a9a9a'); rect(g, px0 + 1, py0 + 3, 2, 1, '#b0b0b0'); } return;
    case 'scuff': g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x - 5, y, 10, 1); g.fillRect(x - 3, y + 2, 7, 1); return;
    case 'tape': for (let i = -8; i < 8; i += 4) { rect(g, x + i, y - 1, 2, 3, '#d9a82e'); rect(g, x + i + 2, y - 1, 2, 3, '#2a2a2a'); } return;
    case 'parcel_tape': rect(g, x - 4, y, 9, 2, '#c8a060'); rect(g, x - 4, y, 9, 1, '#e0c080'); return;
    case 'grate': rect(g, x - 6, y - 4, 12, 8, '#3a3e44'); for (let i = -5; i < 6; i += 2) rect(g, x + i, y - 3, 1, 6, '#1a1c20'); frame(g, x - 6, y - 4, 12, 8, '#5a5e64'); return;
    case 'cable': line(g, x - 8, y, x - 2, y + 2, '#1a1a1a'); line(g, x - 2, y + 2, x + 6, y - 1, '#1a1a1a'); return;
    case 'confetti': for (let i = 0; i < 10; i++) { const r = h2(x, i, v); px(g, x - 7 + (r % 14), y - 5 + ((r >> 5) % 10), [s.brand, s.brand2, '#ffffff', '#ff6a00'][(r >> 10) & 3]); } return;
    case 'paint': g.fillStyle = 'rgba(0,209,193,0.4)'; g.fillRect(x - 3, y - 2, 7, 4); g.fillStyle = 'rgba(122,60,255,0.35)'; g.fillRect(x + 1, y + 1, 4, 3); return;
    case 'inlay': rect(g, x - 8, y - 1, 16, 1, '#d4a537'); return;
  }
}

// ---------------------------------------------------------------------------------------------
// Public: whole-floor render + partial redraw

function voidDistance(m: FloorMap): Int16Array {
  const d = new Int16Array(m.w * m.h).fill(99);
  const q: number[] = [];
  for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] !== T.VOID) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h]; const x = i % m.w, y = (i / m.w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
const distCache = new WeakMap<FloorMap, Int16Array>();

export function renderBase(map: FloorMap): HTMLCanvasElement {
  const c = makeCanvas(map.w * TILE, map.h * TILE);
  redrawRegion(map, c, 0, 0, map.w - 1, map.h - 1, true);
  return c;
}

export function redrawRegion(map: FloorMap, canvas: HTMLCanvasElement, tx0: number, ty0: number, tx1: number, ty1: number, full = false): void {
  const g = ctx2d(canvas);
  const s = skinFor(map);
  let dist = distCache.get(map);
  if (!dist) { dist = voidDistance(map); distCache.set(map, dist); }
  // neighbours influence faces, shadows, parapets and facades: widen by 2 tiles
  const x0 = Math.max(0, tx0 - (full ? 0 : 2)), y0 = Math.max(0, ty0 - (full ? 0 : 2));
  const x1 = Math.min(map.w - 1, tx1 + (full ? 0 : 2)), y1 = Math.min(map.h - 1, ty1 + (full ? 0 : 2));
  g.save();
  g.beginPath(); g.rect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE); g.clip();
  g.clearRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTile(g, map, s, x, y, dist);
  // decals under props (skip ones fully outside the region)
  const bx0 = x0 * TILE - 64, by0 = y0 * TILE - 64, bx1 = (x1 + 1) * TILE + 64, by1 = (y1 + 1) * TILE + 64;
  for (const d of map.decor) {
    if (d.x < bx0 || d.x > bx1 || d.y < by0 || d.y > by1) continue;
    const t = map.tiles[Math.floor(d.y / TILE) * map.w + Math.floor(d.x / TILE)];
    if (t !== T.FLOOR && t !== T.CORE_FLOOR && t !== T.RUBBLE && d.kind !== 'rug') continue;
    drawDecal(g, map, s, d);
  }
  // decals may have spilled onto walls: redraw wall-type tiles on top
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = map.tiles[y * map.w + x];
    if (isWallish(t) || t === T.CUBICLE) drawTile(g, map, s, x, y, dist);
  }
  g.restore();
}
