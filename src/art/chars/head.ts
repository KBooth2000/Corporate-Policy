// Heads: skull shapes, faces/expressions, 20 hairstyles and head coverings, facial hair, glasses,
// hats and headsets. Everything is drawn relative to a head box (x, y, w, h) in one of 3 views.
// Hair uses an auto-shading mask: styles only paint coverage, then the mask is shaded from its
// silhouette (top-left lit edges, bottom/right shadow, cast shadow on the forehead).
import { PixBuf, Col, C, mixCol } from './pixbuf';
import type { Dress, HairId, HeadPreset, View, Ramp } from './types';
import type { Expr } from './poses';
import { EYE, TEETH, MOUTH, WHITE, GOLD, SILVER } from './colours';

export interface HeadBox { x: number; y: number; w: number; h: number }

/** Head row spans (local columns, inclusive) for a preset in a view. */
export function headSpans(hp: HeadPreset, w: number, h: number, view: View): { L: number[]; R: number[] } {
  const top: Record<HeadPreset['shape'], number[]> = {
    round: [3, 1], square: [2, 1], oval: [3, 1], long: [3, 1], wide: [2, 1], heart: [2, 0],
  };
  const bot: Record<HeadPreset['shape'], number[]> = {
    round: [3, 1], square: [1, 0], oval: [3, 1, 1], long: [3, 2, 1], wide: [2, 1], heart: [4, 2, 1],
  };
  const L: number[] = [], R: number[] = [];
  for (let r = 0; r < h; r++) {
    let inset = 0;
    if (r < top[hp.shape].length) inset = top[hp.shape][r];
    const br = h - 1 - r;
    if (br < bot[hp.shape].length) inset = Math.max(inset, bot[hp.shape][br]);
    let l = inset, rr = w - 1 - inset;
    if (view === 'side') {
      // nape tapers at the back, jaw tucks at the front
      if (br < 3) l = Math.max(l, 2 + (2 - br));
      if (br === 0) rr = Math.min(rr, w - 3);
    }
    L.push(l); R.push(rr);
  }
  return { L, R };
}

export function eyeRow(h: number): number { return Math.round(h * 0.45); }
export function mouthRow(h: number): number { return h - 3; }

/** Eye x positions (front view, local). */
export function eyeXs(w: number, gap: number): [number, number] {
  return [Math.floor(w / 2) - 1 - gap, Math.ceil(w / 2) + gap];
}

interface FaceCtx {
  b: PixBuf; d: Dress; view: View; bx: HeadBox; L: number[]; R: number[];
  expr: Expr; frame: number;
}

// ---------------------------------------------------------------------------------------------
// Skull

function drawSkull(b: PixBuf, d: Dress, view: View, bx: HeadBox, L: number[], R: number[], bald: boolean): void {
  const s = d.skin;
  const { x, y, w, h } = bx;
  for (let r = 0; r < h; r++) {
    for (let c = L[r]; c <= R[r]; c++) {
      let col = s.base;
      if (view === 'back') {
        col = c === L[r] ? s.lt : c === R[r] ? s.sh : s.base;
        if (r === h - 1) col = s.sh;
      } else if (view === 'side') {
        col = c === L[r] ? s.sh : c === R[r] && r < h - 2 ? s.lt : s.base;
        if (r >= h - 2) col = s.sh;
      } else {
        if (c === L[r] && r > 1 && r < h - 2) col = s.lt;
        else if (c === R[r]) col = s.sh;
        if (r === h - 1) col = s.sh;
        if (r === h - 2 && (c === L[r] || c === R[r])) col = s.sh;
      }
      b.set(x + c, y + r, col);
    }
  }
  if (bald && view !== 'side') { b.set(x + 3, y + 1, s.hi); b.set(x + 4, y + 1, s.hi); b.set(x + 3, y + 2, s.lt); }
  if (bald && view === 'side') { b.set(x + 3, y + 1, s.hi); b.set(x + 4, y + 1, s.hi); }
}

function drawEars(b: PixBuf, d: Dress, view: View, bx: HeadBox, L: number[], R: number[]): void {
  const s = d.skin;
  const ey = eyeRow(bx.h);
  const big = d.head.ears === 'big';
  if (view === 'side') {
    const ec = Math.round(bx.w * 0.38);
    b.set(bx.x + ec, bx.y + ey, s.base); b.set(bx.x + ec + 1, bx.y + ey, s.lt);
    b.set(bx.x + ec, bx.y + ey + 1, s.sh); b.set(bx.x + ec + 1, bx.y + ey + 1, s.base);
    if (big) b.set(bx.x + ec, bx.y + ey - 1, s.base);
    return;
  }
  const lx = bx.x + L[ey] - 1, rx = bx.x + R[ey] + 1;
  for (let k = 0; k < 2; k++) {
    b.set(lx, bx.y + ey + k, k === 0 ? s.base : s.sh);
    b.set(rx, bx.y + ey + k, s.sh);
  }
  if (big) { b.set(lx, bx.y + ey - 1, s.base); b.set(rx, bx.y + ey - 1, s.sh); }
}

// ---------------------------------------------------------------------------------------------
// Faces & expressions

function drawFace(fc: FaceCtx): void {
  const { b, d, view, bx, expr } = fc;
  if (view === 'back') return;
  const s = d.skin;
  const ey = bx.y + eyeRow(bx.h);
  const my = bx.y + mouthRow(bx.h);
  const mood = d.mood;
  const hr = mood === 'hr';
  const glow = d.eyeGlow;
  const browC = mixCol(d.hair.dk, EYE, 0.3);
  const thick = d.head.brows === 'thick' || d.head.brows === 'bushy';

  if (view === 'side') {
    const fx = bx.x + bx.w - 1; // front edge column
    const ex = fx - 3;
    // nose
    b.set(fx + 1, ey + 1, s.base); b.set(fx + 1, ey + 2, s.sh);
    if (d.head.nose === 'big' || d.head.nose === 'long') b.set(fx + 1, ey, s.base);
    // eye
    eyeSide(b, ex, ey, expr, hr, glow, d);
    // brow
    const bAngry = expr === 'rage' || (mood === 'angry' && (expr === 'base' || expr === 'shout' || expr === 'strain'));
    if (bAngry) { b.set(ex - 1, ey - 2, browC); b.set(ex, ey - 1, browC); b.set(ex + 1, ey - 1, browC); }
    else if (expr === 'scared' || expr === 'shock') { b.set(ex, ey - 3, browC); b.set(ex + 1, ey - 3, browC); }
    else { b.set(ex, ey - 2, browC); b.set(ex + 1, ey - 2, browC); if (thick) b.set(ex - 1, ey - 2, browC); }
    mouthSide(b, fx, my, expr, hr, mood);
    if (d.acc.blush || d.head.cheeks) b.set(fx - 3, ey + 2, mixCol(s.base, C('#d0606a'), 0.35));
    if (d.acc.freckles) { b.set(fx - 2, ey + 2, s.sh); b.set(fx - 4, ey + 2, s.sh); }
    return;
  }

  const [exL, exR] = eyeXs(bx.w, d.head.eyeGap);
  const exl = bx.x + exL, exr = bx.x + exR;
  // nose
  const nx = bx.x + Math.floor(bx.w / 2) - (bx.w % 2 === 0 ? 1 : 0);
  if (d.head.nose === 'big') { b.set(nx, ey + 2, s.sh); b.set(nx + 1, ey + 2, s.sh); b.set(nx, ey + 1, s.lt); }
  else if (d.head.nose === 'long') { b.set(nx, ey + 1, s.lt); b.set(nx + 1, ey + 2, s.sh); b.set(nx, ey + 2, s.sh); }
  else if (d.head.nose === 'button') { b.set(nx, ey + 2, s.sh); }
  else { b.set(nx + (bx.w % 2 === 0 ? 1 : 0), ey + 2, s.sh); }
  // cheeks
  if (d.acc.blush || d.head.cheeks) { const bc = mixCol(s.base, C('#d0606a'), 0.32); b.set(exl - 1, ey + 2, bc); b.set(exr + 1, ey + 2, bc); }
  if (d.acc.freckles) { b.set(exl, ey + 2, s.sh); b.set(exl + 1, ey + 3, s.sh); b.set(exr, ey + 2, s.sh); b.set(exr - 1, ey + 3, s.sh); }
  // eyes
  eyeFront(b, exl, ey, -1, expr, hr, glow, d);
  eyeFront(b, exr, ey, 1, expr, hr, glow, d);
  // brows
  const angry = expr === 'rage' || (mood === 'angry' && (expr === 'base' || expr === 'shout' || expr === 'strain' || expr === 'blink'));
  if (angry) {
    b.set(exl - 1, ey - 2, browC); b.set(exl, ey - 2, browC); b.set(exl + 1, ey - 1, browC);
    b.set(exr + 1, ey - 2, browC); b.set(exr, ey - 2, browC); b.set(exr - 1, ey - 1, browC);
    if (thick) { b.set(exl - 1, ey - 3, browC); b.set(exr + 1, ey - 3, browC); }
  } else if (expr === 'scared' || expr === 'shock' || expr === 'pain' || expr === 'dazed') {
    b.set(exl - 1, ey - 2, browC); b.set(exl, ey - 3, browC); b.set(exr + 1, ey - 2, browC); b.set(exr, ey - 3, browC);
  } else if (hr || expr === 'happy' || expr === 'chant') {
    // raised, arched "so glad you could make it" brows
    b.set(exl - 1, ey - 2, browC); b.set(exl, ey - 3, browC); b.set(exl + 1, ey - 3, browC);
    b.set(exr + 1, ey - 2, browC); b.set(exr, ey - 3, browC); b.set(exr - 1, ey - 3, browC);
  } else {
    b.set(exl - 1, ey - 2, browC); b.set(exl, ey - 2, browC);
    b.set(exr + 1, ey - 2, browC); b.set(exr, ey - 2, browC);
    if (thick) { b.set(exl + 1, ey - 2, browC); b.set(exr - 1, ey - 2, browC); }
  }
  mouthFront(b, bx, exl, exr, my, expr, hr, mood, fc.frame);
}

function eyeFront(b: PixBuf, x: number, y: number, side: number, expr: Expr, hr: boolean, glow: Col | null, d: Dress): void {
  const pupil = glow ?? EYE;
  switch (expr) {
    case 'blink': b.set(x, y + 1, EYE); return;
    case 'dead': b.set(x - 1, y - 1, EYE); b.set(x + 1, y - 1, EYE); b.set(x, y, EYE); b.set(x - 1, y + 1, EYE); b.set(x + 1, y + 1, EYE); return;
    case 'pain': case 'strain': b.set(x - side, y, EYE); b.set(x, y + 1, EYE); b.set(x - side, y + 2 - 1 + 1, EYE); return;
    case 'chant': b.set(x - 1, y + 1, EYE); b.set(x, y + 1, EYE); return;
    case 'happy':
      if (hr) { b.set(x - 1, y + 1, EYE); b.set(x, y, EYE); b.set(x + 1, y + 1, EYE); return; }
      b.set(x - 1, y + 1, EYE); b.set(x, y, EYE); b.set(x + 1, y + 1, EYE); return;
    case 'dazed': b.set(x, y, EYE); b.set(x + side, y + 1, EYE); b.set(x - side, y + 1, WHITE); return;
    case 'shock': case 'scared':
      b.set(x, y, WHITE); b.set(x + side, y, WHITE); b.set(x, y + 1, WHITE); b.set(x + side, y + 1, pupil === EYE ? EYE : pupil);
      return;
    default:
      if (hr) {
        // fixed, unblinking stare with a sclera glint
        b.set(x, y, pupil); b.set(x, y + 1, glow ? mixCol(glow, EYE, 0.35) : pupil);
        b.set(x + side, y, glow ? mixCol(glow, WHITE, 0.55) : WHITE);
      } else {
        b.set(x, y, EYE); b.set(x, y + 1, EYE);
        if (d.head.lashes) b.set(x + side, y - 1 + 1 - 1, EYE);
        if (expr === 'rage') b.set(x, y, C('#ff3a2a'));
      }
  }
}

function eyeSide(b: PixBuf, x: number, y: number, expr: Expr, hr: boolean, glow: Col | null, d: Dress): void {
  const pupil = glow ?? EYE;
  switch (expr) {
    case 'blink': case 'chant': b.set(x, y + 1, EYE); b.set(x + 1, y + 1, EYE); return;
    case 'dead': b.set(x, y, EYE); b.set(x + 1, y + 1, EYE); b.set(x, y + 2 - 1 + 1, EYE); b.set(x + 1, y - 1 + 1, EYE); return;
    case 'pain': case 'strain': b.set(x, y, EYE); b.set(x + 1, y + 1, EYE); b.set(x, y + 2, EYE); return;
    case 'happy': b.set(x, y + 1, EYE); b.set(x + 1, y, EYE); return;
    case 'shock': case 'scared': b.set(x, y, WHITE); b.set(x + 1, y, WHITE); b.set(x + 1, y + 1, pupil); b.set(x, y + 1, WHITE); return;
    default:
      b.set(x + 1, y, pupil); b.set(x + 1, y + 1, pupil);
      if (hr) b.set(x, y, WHITE);
      if (d.head.lashes) b.set(x + 2, y - 1, EYE);
      if (expr === 'rage') b.set(x + 1, y, C('#ff3a2a'));
  }
}

function mouthFront(b: PixBuf, bx: HeadBox, exl: number, exr: number, my: number, expr: Expr, hr: boolean, mood: Dress['mood'], frame: number): void {
  const x0 = exl, x1 = exr;
  const cx = bx.x + Math.floor(bx.w / 2) - (bx.w % 2 === 0 ? 1 : 0);
  const even = bx.w % 2 === 0;
  void frame;
  switch (expr) {
    case 'dead':
      if (hr) { smileHR(b, x0, x1, my); return; }
      b.hline(cx - 1, cx + 1 + (even ? 1 : 0), my + 1, MOUTH); return;
    case 'pain': case 'scared':
      b.set(cx, my, MOUTH); b.set(cx + (even ? 1 : 0), my, MOUTH); b.set(cx, my + 1, MOUTH); b.set(cx + (even ? 1 : 0), my + 1, MOUTH);
      if (hr && expr === 'scared') { b.set(cx - 1, my - 1, MOUTH); b.set(cx + 1 + (even ? 1 : 0), my - 1, MOUTH); }
      return;
    case 'shock':
      b.hline(cx - 1, cx + 1 + (even ? 1 : 0), my, MOUTH);
      b.hline(cx, cx + (even ? 1 : 0), my + 1, TEETH);
      b.set(cx - 1, my + 1, MOUTH); b.set(cx + 1 + (even ? 1 : 0), my + 1, MOUTH);
      return;
    case 'chant':
      b.set(cx, my, MOUTH); b.set(cx + (even ? 1 : 0), my, MOUTH); b.set(cx, my + 1, MOUTH); b.set(cx + (even ? 1 : 0), my + 1, MOUTH);
      if (hr) { b.set(cx - 1, my, MOUTH); b.set(cx + 1 + (even ? 1 : 0), my, MOUTH); }
      return;
    case 'dazed':
      b.set(cx - 1, my + 1, MOUTH); b.set(cx, my, MOUTH); b.set(cx + 1, my + 1, MOUTH);
      return;
    case 'shout': case 'strain': case 'rage':
      if (hr) { smileHR(b, x0, x1, my); return; }
      // gritted teeth
      b.hline(x0 + 1, x1 - 1, my - 1, MOUTH);
      b.hline(x0 + 1, x1 - 1, my + 1, MOUTH);
      b.hline(x0 + 2, x1 - 2, my, TEETH);
      b.set(x0 + 1, my, MOUTH); b.set(x1 - 1, my, MOUTH);
      return;
    case 'happy':
      if (hr) { smileHR(b, x0, x1, my); return; }
      b.set(cx - 1, my, MOUTH); b.set(cx + 1 + (even ? 1 : 0), my, MOUTH); b.hline(cx, cx + (even ? 1 : 0), my + 1, MOUTH);
      return;
    default:
      if (hr) { smileHR(b, x0, x1, my); return; }
      if (mood === 'angry') {
        // set jaw: flat line with a downturned corner
        b.hline(cx - 1, cx + 1 + (even ? 1 : 0), my, MOUTH);
        b.set(cx - 2, my + 1, MOUTH);
        b.set(cx + 2 + (even ? 1 : 0), my + 1, MOUTH);
      } else {
        b.hline(cx, cx + (even ? 1 : 0), my, MOUTH);
        b.set(cx - 1, my - 1 + 1, MOUTH);
      }
  }
}

/** The fixed, too-wide "HR smile": corners up, a full row of teeth. */
export function smileHR(b: PixBuf, x0: number, x1: number, my: number): void {
  b.set(x0, my - 1, MOUTH); b.set(x1, my - 1, MOUTH);
  b.set(x0, my, MOUTH); b.set(x1, my, MOUTH);
  for (let x = x0 + 1; x <= x1 - 1; x++) { b.set(x, my, TEETH); b.set(x, my + 1, MOUTH); }
}

function mouthSide(b: PixBuf, fx: number, my: number, expr: Expr, hr: boolean, mood: Dress['mood']): void {
  switch (expr) {
    case 'pain': case 'scared': case 'chant': b.set(fx, my, MOUTH); b.set(fx - 1, my, MOUTH); b.set(fx, my + 1, MOUTH); return;
    case 'shock': b.set(fx, my, MOUTH); b.set(fx - 1, my, MOUTH); b.set(fx, my + 1, TEETH); b.set(fx - 1, my + 1, MOUTH); return;
    case 'dazed': b.set(fx - 1, my, MOUTH); b.set(fx, my + 1, MOUTH); return;
    case 'dead': if (!hr) { b.set(fx, my, MOUTH); b.set(fx - 1, my, MOUTH); return; } break;
    case 'shout': case 'strain': case 'rage':
      if (!hr) { b.set(fx, my - 1, MOUTH); b.set(fx - 1, my - 1, MOUTH); b.set(fx, my, TEETH); b.set(fx - 1, my, MOUTH); b.set(fx, my + 1, MOUTH); return; }
      break;
    case 'happy': if (!hr) { b.set(fx - 2, my - 1, MOUTH); b.set(fx - 1, my, MOUTH); b.set(fx, my, MOUTH); return; } break;
  }
  if (hr) {
    b.set(fx - 3, my - 1, MOUTH); b.set(fx - 2, my, MOUTH);
    b.set(fx - 1, my, TEETH); b.set(fx, my, TEETH);
    b.set(fx - 1, my + 1, MOUTH); b.set(fx, my + 1, MOUTH);
  } else if (mood === 'angry') {
    b.set(fx, my, MOUTH); b.set(fx - 1, my, MOUTH); b.set(fx - 2, my + 1, MOUTH);
  } else {
    b.set(fx, my, MOUTH); b.set(fx - 1, my, MOUTH);
  }
}

// ---------------------------------------------------------------------------------------------
// Facial hair

function drawFacialHair(fc: FaceCtx): void {
  const { b, d, view, bx, L, R } = fc;
  const f = d.acc.facial;
  if (!f || view === 'back') return;
  const hcol = d.hair;
  const ey = eyeRow(bx.h), my = mouthRow(bx.h);
  const stub = mixCol(d.skin.base, hcol.base, 0.45);
  const { x, y, w, h } = bx;
  if (view === 'side') {
    const fx = w - 1;
    if (f === 1) { for (let r = my - 1; r < h; r++) for (let c = Math.round(w * 0.45); c <= Math.min(R[r], fx); c++) if ((c + r) % 2 === 0) b.set(x + c, y + r, stub); return; }
    if (f >= 2) { b.set(x + fx, y + my - 1, hcol.base); b.set(x + fx - 1, y + my - 1, hcol.sh); }
    if (f === 3) { b.set(x + fx - 1, y + h - 1, hcol.base); b.set(x + fx - 2, y + h - 1, hcol.sh); b.set(x + fx - 1, y + h, hcol.sh); }
    if (f >= 4) {
      for (let r = ey + 2; r < h; r++) for (let c = Math.round(w * 0.45); c <= R[r]; c++) if (r > my - 1 || c < fx - 2) b.set(x + c, y + r, c === R[r] ? hcol.base : hcol.sh);
      if (f === 5) { for (let c = Math.round(w * 0.5); c <= fx - 1; c++) b.set(x + c, y + h, hcol.sh); }
    }
    return;
  }
  const [exL, exR] = eyeXs(w, d.head.eyeGap);
  if (f === 1) {
    for (let r = my - 1; r < h; r++) for (let c = L[r]; c <= R[r]; c++) {
      if (r < my + 1 && c > exL && c < exR) { if (r === my - 1 && (c + r) % 2 === 0) b.set(x + c, y + r, stub); continue; }
      if (r >= ey + 2 && (c + r) % 2 === 0) b.set(x + c, y + r, stub);
    }
    return;
  }
  // moustache
  if (f >= 2) {
    for (let c = exL; c <= exR; c++) b.set(x + c, y + my - 1, c === exL || c === exR ? hcol.sh : hcol.base);
    b.set(x + exL, y + my - 1, hcol.sh);
  }
  if (f === 3) {
    const cx = Math.floor(w / 2) - (w % 2 === 0 ? 1 : 0);
    for (let c = cx - 1; c <= cx + 1 + (w % 2 === 0 ? 1 : 0); c++) { b.set(x + c, y + h - 1, hcol.base); b.set(x + c, y + h - 2, c === cx - 1 ? hcol.lt : hcol.base); }
    b.set(x + cx, y + h, hcol.sh);
  }
  if (f >= 4) {
    for (let r = ey + 1; r < h; r++) {
      for (let c = L[r]; c <= R[r]; c++) {
        const edge = c <= L[r] + 1 || c >= R[r] - 1;
        if (r < my - 1 && !edge) continue;
        if (r >= my - 1 && r <= my + 1 && c > exL && c < exR && r !== my - 1) continue;
        b.set(x + c, y + r, c === L[r] ? hcol.lt : c === R[r] ? hcol.sh : r === h - 1 ? hcol.sh : hcol.base);
      }
    }
    if (f === 5) {
      for (let c = L[h - 1]; c <= R[h - 1]; c++) b.set(x + c, y + h, hcol.sh);
      for (let c = L[h - 1] + 1; c <= R[h - 1] - 1; c++) b.set(x + c, y + h + 1, hcol.dk);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Hair: coverage mask + auto shading

class HairMask {
  readonly P = 10;
  readonly mw: number; readonly mh: number;
  readonly m: Uint8Array;
  constructor(readonly bx: HeadBox) {
    this.mw = bx.w + this.P * 2; this.mh = bx.h + this.P * 2 + 6;
    this.m = new Uint8Array(this.mw * this.mh);
  }
  /** Mark local head coords (c, r). v: 1 = hair, 2 = wrap fabric. */
  set(c: number, r: number, v = 1): void {
    const X = c + this.P, Y = r + this.P;
    if (X < 0 || Y < 0 || X >= this.mw || Y >= this.mh) return;
    this.m[Y * this.mw + X] = v;
  }
  clear(c: number, r: number): void { this.set(c, r, 0); }
  get(c: number, r: number): number {
    const X = c + this.P, Y = r + this.P;
    if (X < 0 || Y < 0 || X >= this.mw || Y >= this.mh) return 0;
    return this.m[Y * this.mw + X];
  }
  fillRow(r: number, c0: number, c1: number, v = 1): void { for (let c = c0; c <= c1; c++) this.set(c, r, v); }
}

type Tex = 'none' | 'buzz' | 'curly' | 'coil' | 'shine' | 'locs' | 'rows' | 'straight' | 'fold';

function shadeMask(b: PixBuf, hm: HairMask, hr: Ramp, wr: Ramp, sk: Ramp, tex: Tex, view: View, skullBottom: number[]): void {
  const { bx } = hm;
  const P = hm.P;
  const cxm = bx.w / 2;
  for (let Y = 0; Y < hm.mh; Y++) {
    for (let X = 0; X < hm.mw; X++) {
      const v = hm.m[Y * hm.mw + X];
      if (!v) continue;
      const c = X - P, r = Y - P;
      const R = v === 2 ? wr : hr;
      const up = hm.get(c, r - 1) === v, dn = hm.get(c, r + 1) === v, lf = hm.get(c - 1, r) === v, rt = hm.get(c + 1, r) === v;
      let col = R.base;
      if (!up) col = c < cxm + (view === 'side' ? 1 : 0) ? R.hi : R.lt;
      else if (!lf) col = R.lt;
      else if (!rt || !dn) col = R.sh;
      const t = v === 2 ? (tex === 'fold' ? 'fold' : 'none') : tex;
      if (t === 'buzz') col = !up ? mixCol(R.lt, sk.base, 0.25) : (c + r * 2) % 5 === 0 ? mixCol(R.sh, sk.base, 0.2) : mixCol(R.base, sk.sh, 0.3);
      else if (t === 'curly' && up && dn && lf && rt) col = (c * 2 + r * 3) % 7 === 0 ? R.sh : (c + r * 2) % 7 === 3 ? R.lt : col;
      else if (t === 'coil' && up && dn) col = (c * 3 + r * 2) % 6 === 0 ? R.sh : (c * 2 + r) % 7 === 2 ? R.lt : col;
      else if (t === 'shine' && up && r >= 0 && r <= 1 && c >= 2 && c <= 4) col = R.hi;
      else if (t === 'locs' && up && r > 3) col = c % 2 === 0 ? R.base : R.sh;
      else if (t === 'rows' && up && dn) col = c % 2 === 0 ? R.base : R.sh;
      else if (t === 'straight' && up && dn && lf && rt && r > 4 && c % 4 === 1) col = R.sh;
      else if (t === 'fold' && up && dn && lf && rt && (c + r) % 6 === 0 && r > 0) col = R.sh;
      if (!dn && r > bx.h + 2) col = R.dk;
      b.set(bx.x + c, bx.y + r, col);
      // cast shadow onto the skin just below the fringe
      if (!dn && r >= 0 && r + 1 < skullBottom.length && view !== 'back') {
        const below = b.get(bx.x + c, bx.y + r + 1);
        if (below === sk.base || below === sk.lt) b.set(bx.x + c, bx.y + r + 1, sk.sh);
      }
    }
  }
}

/** Fill a cap over the skull: from (top - vol) down to row `to(c)` for every column (with volume). */
function capFront(hm: HairMask, L: number[], R: number[], vol: number, to: (c: number) => number, v = 1): void {
  const { w } = hm.bx;
  for (let c = -vol; c < w + vol; c++) {
    let top = -1;
    for (let r = 0; r < L.length; r++) if (c >= L[r] && c <= R[r]) { top = r; break; }
    if (top < 0) top = 2;
    const t0 = top - vol;
    const t1 = to(c);
    for (let r = t0; r <= t1; r++) hm.set(c, r, v);
  }
}

interface HairCtx {
  hm: HairMask; view: View; L: number[]; R: number[]; w: number; h: number; ey: number;
  layer: 'back' | 'front'; hairUp: boolean;
}

/** Generic hair: fringe row for interior columns, temple/side length at the edges. */
function generic(hc: HairCtx, vol: number, fringe: (c: number) => number, side: number, sideW: number, backLen: number, sideFront: number): void {
  const { hm, view, L, R, w } = hc;
  if (view === 'front') {
    capFront(hm, L, R, vol, (c) => {
      const edge = c < (L[side > 2 ? 3 : 2] ?? 0) + sideW || c > (R[side > 2 ? 3 : 2] ?? w - 1) - sideW;
      return edge ? side : fringe(c);
    });
  } else if (view === 'back') {
    capFront(hm, L, R, vol, () => backLen);
  } else {
    const frontEdge = Math.round(w * 0.55);
    capFront(hm, L, R, vol, (c) => c <= Math.round(w * 0.3) ? backLen : c < frontEdge ? Math.max(sideFront, Math.min(backLen, hc.ey - 1)) : sideFront);
    // clear around the ear
    const ec = Math.round(w * 0.38);
    for (let r = hc.ey; r <= hc.ey + 1; r++) { hm.clear(ec, r); hm.clear(ec + 1, r); }
  }
}

function styleHair(hc: HairCtx, style: HairId): Tex {
  const { hm, view, L, R, w, h, ey, layer } = hc;
  const mid = Math.floor(w / 2);
  const front = layer === 'front';
  switch (style) {
    case 'bald': return 'none';
    case 'receding':
      if (!front) return 'none';
      if (view === 'front') { for (let r = 2; r <= ey; r++) { hm.set(L[r], r); hm.set(R[r], r); hm.set(L[r] - 0, r); } for (let r = 3; r <= ey; r++) { hm.set(L[r] + 1, r); hm.set(R[r] - 1, r); } }
      else if (view === 'back') { for (let r = 3; r <= h - 3; r++) for (let c = L[r]; c <= R[r]; c++) hm.set(c, r); }
      else { for (let r = 3; r <= h - 3; r++) for (let c = L[r]; c <= Math.round(w * 0.36); c++) hm.set(c, r); }
      return 'straight';
    case 'buzz':
      if (!front) return 'none';
      generic(hc, 0, () => 1, ey - 2, 1, h - 3, 1);
      return 'buzz';
    case 'crew':
      if (!front) return 'none';
      generic(hc, 1, () => 2, ey - 1, 1, h - 3, 2);
      return 'none';
    case 'side_part':
      if (!front) return 'none';
      generic(hc, 1, (c) => (c <= Math.round(w * 0.35) ? 2 : c < w - 2 ? 3 : 2), ey - 1, 1, h - 3, 3);
      if (view === 'front') { hm.clear(Math.round(w * 0.35), -1); }
      return 'none';
    case 'comb_over':
      if (!front) return 'none';
      if (view === 'front') {
        for (let r = 2; r <= ey; r++) { hm.set(L[r], r); hm.set(R[r], r); }
        for (let r = 3; r <= ey - 1; r++) { hm.set(L[r] + 1, r); hm.set(R[r] - 1, r); }
        for (let c = L[0]; c <= R[0]; c++) if (c % 2 === 0) hm.set(c, 0);
        for (let c = L[1]; c <= R[1]; c++) if (c % 3 !== 1) hm.set(c, 1);
        hm.set(L[1] - 1, 1);
      } else if (view === 'back') { for (let r = 1; r <= h - 3; r++) for (let c = L[r]; c <= R[r]; c++) if (r > 2 || c % 2 === 0) hm.set(c, r); }
      else { for (let r = 0; r <= h - 3; r++) for (let c = L[r]; c <= Math.round(w * 0.4); c++) if (r > 2 || (c + r) % 2 === 0) hm.set(c, r); for (let c = L[1]; c <= R[1] - 1; c += 2) hm.set(c, 1); }
      return 'straight';
    case 'slick_back':
      if (!front) return 'none';
      generic(hc, 1, () => 1, ey - 1, 1, h - 3, 1);
      return 'shine';
    case 'quiff':
      if (!front) return 'none';
      generic(hc, 1, () => 2, ey - 1, 1, h - 3, 2);
      if (view === 'front') { for (let c = 2; c <= w - 3; c++) hm.set(c, -2); for (let c = 3; c <= w - 5; c++) hm.set(c, -3); }
      else if (view === 'side') { for (let c = Math.round(w * 0.45); c <= w; c++) { hm.set(c, -2); hm.set(c, -1); } hm.set(w, 0); for (let c = Math.round(w * 0.55); c <= w - 1; c++) hm.set(c, -3); }
      else { for (let c = 3; c <= w - 4; c++) hm.set(c, -2); }
      return 'shine';
    case 'curly':
      if (!front) return 'none';
      generic(hc, 1, (c) => (c % 2 === 0 ? 3 : 2), ey, 1, h - 2, 3);
      for (let c = -1; c <= w; c += 2) hm.set(c, -2);
      return 'curly';
    case 'afro': {
      if (!front) return 'none';
      const cy = 2, rx = w / 2 + 2.5, ry = 6.5;
      const cxx = (w - 1) / 2 - (view === 'side' ? 1.5 : 0);
      for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) {
        const t = 1 - ((r - cy) * (r - cy)) / (ry * ry);
        if (t < 0) continue;
        const span = rx * Math.sqrt(t);
        for (let c = Math.round(cxx - span); c <= Math.round(cxx + span); c++) hm.set(c, r);
      }
      if (view === 'front') for (let r = 3; r < h; r++) for (let c = L[r] + 1; c <= R[r] - 1; c++) hm.clear(c, r);
      if (view === 'front') for (let r = ey + 1; r < h; r++) { hm.clear(L[r], r); hm.clear(R[r], r); }
      if (view === 'side') for (let r = 3; r < h; r++) for (let c = Math.round(w * 0.5); c <= R[r] + 1; c++) hm.clear(c, r);
      if (view === 'side') for (let r = ey; r < h; r++) for (let c = Math.round(w * 0.3); c <= R[r] + 1; c++) hm.clear(c, r);
      return 'coil';
    }
    case 'cornrows':
      if (!front) return 'none';
      generic(hc, 0, () => 2, ey - 1, 1, h - 2, 2);
      return 'rows';
    case 'locs':
      if (view === 'front') {
        if (front) {
          generic(hc, 1, () => 2, ey, 1, h - 2, 2);
          for (let r = ey; r <= h + 4; r++) { hm.set(-1, r); hm.set(0, r); hm.set(w - 1, r); hm.set(w, r); if (r > h - 2) { hm.set(1, r); hm.set(w - 2, r); } }
        } else for (let r = h - 2; r <= h + 4; r++) hm.fillRow(r, -1, w);
      } else if (front) { generic(hc, 1, () => 2, ey, 1, h + 4, 2); if (view === 'back') for (let r = h; r <= h + 4; r++) hm.fillRow(r, 0, w - 1); else for (let r = h - 2; r <= h + 4; r++) hm.fillRow(r, -1, Math.round(w * 0.4)); }
      return 'locs';
    case 'bob':
      if (!front) return 'none';
      generic(hc, 1, () => 3, h - 2, 2, h - 1, 3);
      if (view === 'front') { hm.clear(-1, h - 2); hm.clear(w, h - 2); hm.set(0, h - 1); hm.set(w - 1, h - 1); }
      if (view === 'side') for (let r = ey; r <= h - 1; r++) for (let c = -1; c <= Math.round(w * 0.42); c++) hm.set(c, r);
      return 'straight';
    case 'long':
      if (view === 'front') {
        if (front) {
          generic(hc, 1, (c) => (Math.abs(c - (w - 1) / 2) < 1 ? 1 : Math.abs(c - (w - 1) / 2) < 3 ? 2 : 3), h + 3, 2, h - 2, 3);
        } else for (let r = h - 3; r <= h + 4; r++) hm.fillRow(r, -1, w);
      } else if (front) {
        generic(hc, 1, () => 2, h, 2, h + 4, 3);
        if (view === 'side') for (let r = ey; r <= h + 4; r++) for (let c = -1; c <= Math.round(w * 0.35); c++) hm.set(c, r);
        if (view === 'back') for (let r = h - 2; r <= h + 4; r++) hm.fillRow(r, -1, w);
      }
      return 'straight';
    case 'ponytail':
      if (!front) return 'none';
      generic(hc, 1, () => 2, ey - 1, 1, h - 3, 2);
      if (view === 'side') { for (let r = 1; r <= h + 1; r++) { hm.set(-2, r); if (r < h - 1) hm.set(-1, r); if (r > 2 && r < h - 2) hm.set(-3, r); } }
      else if (view === 'back') { for (let r = 1; r <= h + 3; r++) { hm.set(mid - 1, r); hm.set(mid, r); if (r > 4 && r < h + 1) hm.set(mid + 1, r); } }
      else { hm.set(-2, 3); hm.set(-2, 4); hm.set(-2, 5); }
      return 'straight';
    case 'bun':
      if (!front) return 'none';
      generic(hc, 1, () => 2, ey - 1, 1, h - 3, 2);
      if (view === 'front' || view === 'back') { for (let c = mid - 2; c <= mid + 1; c++) { hm.set(c, -3); hm.set(c, -2); } hm.set(mid - 1, -4); hm.set(mid, -4); }
      else { for (let r = -2; r <= 1; r++) for (let c = -2; c <= 1; c++) if (!(r === -2 && c === -2) && !(r === 1 && c === -2)) hm.set(c, r); }
      return 'none';
    case 'pixie':
      if (!front) return 'none';
      generic(hc, 1, (c) => (c < mid ? 3 : c < w - 2 ? 2 : 1), ey, 1, h - 3, 3);
      if (view === 'front') { hm.set(-1, ey + 1); }
      return 'none';
    case 'hijab': {
      // fabric frames the face and drapes over the shoulders
      if (view === 'front') {
        if (front) {
          for (let r = -1; r <= h + 3; r++) {
            const half = r < 1 ? w / 2 - (1 - r) * 1.5 : r > h ? w / 2 + 2 - (r - h) * 0 : w / 2 + 1;
            for (let c = Math.round((w - 1) / 2 - half); c <= Math.round((w - 1) / 2 + half); c++) hm.set(c, r, 2);
          }
          for (let r = 2; r <= h - 1; r++) for (let c = L[r] + 1; c <= R[r] - 1; c++) if (!(r === 2 && (c === L[r] + 1 || c === R[r] - 1))) hm.clear(c, r);
        }
      } else if (front && view === 'side') {
        const open0 = Math.round(w * 0.42);
        for (let r = -1; r <= h + 3; r++) {
          const l = r < 0 ? 1 : r < 1 ? 0 : -1;
          const rr = r < 0 ? w - 3 : r < 2 ? w - 1 : r < h - 1 ? open0 : r < h + 1 ? w - 2 : w - 3;
          for (let c = l; c <= rr; c++) hm.set(c, r, 2);
        }
        hm.set(-2, h + 2, 2); hm.set(-2, h + 3, 2);
      } else if (front) {
        for (let r = -1; r <= h + 3; r++) {
          const l = r < 1 ? 2 - r : -1, rr = r < 1 ? w - 3 + r : w;
          for (let c = l - (r > 1 ? 1 : 0); c <= rr; c++) hm.set(c, r, 2);
        }
      }
      return 'fold';
    }
    case 'turban': {
      if (!front) return 'none';
      for (let r = -3; r <= 3; r++) {
        const inset = r === -3 ? 3 : r === -2 ? 1 : 0;
        const c0 = -1 + inset, c1 = w - inset;
        for (let c = c0; c <= c1; c++) hm.set(c, r, 2);
      }
      if (view === 'front') { for (let r = 4; r <= ey; r++) { hm.set(-1, r, 2); hm.set(w, r, 2); } }
      else if (view === 'back' || view === 'side') { for (let r = 4; r <= ey + 1; r++) for (let c = -1; c <= (view === 'back' ? w : Math.round(w * 0.35)); c++) hm.set(c, r, 2); }
      return 'fold';
    }
    case 'headwrap': {
      if (!front) return 'none';
      for (let r = -5; r <= 2; r++) {
        const inset = r <= -5 ? 3 : r === -4 ? 1 : 0;
        for (let c = -1 + inset; c <= w - inset; c++) hm.set(c, r, 2);
      }
      if (view === 'front') { for (let c = mid - 1; c <= mid + 2; c++) hm.set(c, -6, 2); }
      if (view === 'side') { for (let r = -4; r <= 0; r++) hm.set(-2, r, 2); }
      return 'fold';
    }
  }
  return 'none';
}

/** Draw hair layer: 'back' = parts behind the body (drawn before the torso), 'front' = everything else. */
export function drawHair(b: PixBuf, d: Dress, view: View, bx: HeadBox, layer: 'back' | 'front', hairUp: boolean, hidden: boolean): void {
  const { L, R } = headSpans(d.head, bx.w, bx.h, view);
  const hm = new HairMask(bx);
  const hc: HairCtx = { hm, view, L, R, w: bx.w, h: bx.h, ey: eyeRow(bx.h), layer, hairUp };
  let style = d.hairStyle;
  if (hidden && style !== 'hijab' && style !== 'turban' && style !== 'headwrap') {
    // under a hat only the sides/back show
    if (layer === 'back') { /* long styles still show behind */ }
  }
  const tex = styleHair(hc, style);
  if (hairUp && layer === 'front' && style !== 'hijab' && style !== 'turban' && style !== 'headwrap' && style !== 'bald') {
    // electrocuted: spikes
    for (let c = 0; c < bx.w; c += 2) { hm.set(c, -2); hm.set(c, -3); if (c % 4 === 0) hm.set(c, -4); }
  }
  shadeMask(b, hm, d.hair, d.wrap, d.skin, tex, view, R);
}

// ---------------------------------------------------------------------------------------------
// Glasses, hats and head-worn kit

function drawGlasses(b: PixBuf, d: Dress, view: View, bx: HeadBox): void {
  const g = d.acc.glasses;
  if (!g || view === 'back') return;
  const fr = d.acc.glassesCol;
  const ey = bx.y + eyeRow(bx.h);
  const lens = mixCol(d.skin.base, C('#e8f4ff'), 0.45);
  if (view === 'side') {
    const ex = bx.x + bx.w - 3;
    b.set(ex - 1, ey - 1, fr.base); b.set(ex, ey - 1, fr.base); b.set(ex + 1, ey - 1, fr.base);
    if (g !== 4) b.set(ex - 1, ey, fr.base);
    b.set(ex - 1, ey + 1, fr.base); b.set(ex, ey + 2, fr.base); b.set(ex + 1, ey + 2, g === 3 ? fr.base : fr.sh);
    for (let c = bx.x + Math.round(bx.w * 0.42); c < ex - 1; c++) b.set(c, ey, fr.sh);
    return;
  }
  const [exL, exR] = eyeXs(bx.w, d.head.eyeGap);
  for (const ex of [bx.x + exL, bx.x + exR]) {
    const x0 = ex - 1, x1 = ex + 1;
    if (g === 4) { for (let x = x0; x <= x1; x++) b.set(x, ey + 2, fr.base); b.set(x0, ey + 1, fr.sh); b.set(x1, ey + 1, fr.sh); continue; }
    for (let x = x0; x <= x1; x++) { b.set(x, ey - 1, g === 3 ? fr.dk : fr.base); b.set(x, ey + 2, g === 1 ? fr.sh : fr.base); }
    for (let y = ey; y <= ey + 1; y++) { b.set(x0, y, fr.base); b.set(x1, y, fr.sh); }
    if (g === 1) { b.set(x0, ey - 1, b.get(x0, ey - 2) || lens); b.set(x1, ey + 2, lens); }
    for (let y = ey; y <= ey + 1; y++) if (b.get(ex, y) !== EYE && b.get(ex, y) !== WHITE) b.set(ex, y, lens);
  }
  // bridge + arms
  for (let x = bx.x + exL + 2; x <= bx.x + exR - 2; x++) b.set(x, ey, fr.base);
}

function drawHat(b: PixBuf, kind: 'hardhat_red' | 'hardhat_white' | 'cap' | 'beanie', view: View, bx: HeadBox, col: Ramp): void {
  const { x, y, w } = bx;
  if (kind === 'hardhat_red' || kind === 'hardhat_white') {
    const r = col;
    for (let rr = -3; rr <= 2; rr++) {
      const inset = rr === -3 ? 3 : rr === -2 ? 1 : 0;
      for (let c = -1 + inset; c <= w - inset; c++) b.set(x + c, y + rr, rr === -3 || c === -1 + inset ? r.hi : c >= w - inset - 1 ? r.sh : r.base);
    }
    const brimY = y + 3;
    if (view === 'side') { for (let c = -1; c <= w + 2; c++) b.set(x + c, brimY - 1, c > w ? r.sh : r.lt); }
    else for (let c = -2; c <= w + 1; c++) b.set(x + c, brimY - 1, c === -2 ? r.lt : r.sh);
    if (view !== 'side') { b.vline(x + Math.floor(w / 2) - 1, y - 2, y + 1, r.lt); }
    return;
  }
  if (kind === 'cap') {
    for (let rr = -2; rr <= 2; rr++) {
      const inset = rr === -2 ? 2 : rr === -1 ? 1 : 0;
      for (let c = -1 + inset; c <= w - inset; c++) b.set(x + c, y + rr, rr === -2 ? col.lt : c >= w - inset - 1 ? col.sh : col.base);
    }
    if (view === 'side') for (let c = w - 2; c <= w + 2; c++) b.set(x + c, y + 2, col.sh);
    else if (view === 'front') for (let c = 1; c <= w - 2; c++) b.set(x + c, y + 3, col.dk);
    return;
  }
  // beanie
  for (let rr = -3; rr <= 3; rr++) {
    const inset = rr === -3 ? 3 : rr === -2 ? 1 : 0;
    for (let c = -1 + inset; c <= w - inset; c++) {
      let cc = (c + rr) % 2 === 0 ? col.base : col.sh;
      if (rr === 3 || rr === 2) cc = rr === 2 ? col.lt : col.base;
      if (rr === -3) cc = col.lt;
      b.set(x + c, y + rr, cc);
    }
  }
}

function drawHeadset(b: PixBuf, d: Dress, view: View, bx: HeadBox, two: boolean): void {
  const dark = C('#2a2c34'), mid = C('#4a4e5a'), lt = C('#7a8090');
  const mic = d.worn.includes('headset1') ? C('#e24a4a') : C('#58c8ff');
  const { x, y, w } = bx;
  const ey = y + eyeRow(bx.h);
  if (view === 'side') {
    for (let c = 1; c < w - 3; c++) b.set(x + c, y - 2 + (c < 3 || c > w - 5 ? 1 : 0), dark);
    const ec = x + Math.round(w * 0.38);
    b.rect(ec - 1, ey - 1, 3, 4, mid); b.set(ec - 1, ey - 1, lt);
    b.line(ec + 1, ey + 2, x + w - 1, y + mouthRow(bx.h) - 0, dark); b.set(x + w, y + mouthRow(bx.h), mic);
    return;
  }
  // band over the top of the hair
  const top = y - (d.hairStyle === 'afro' ? 5 : d.hairStyle === 'bun' ? 2 : 2);
  for (let c = 0; c < w; c++) b.set(x + c, top + (c === 0 || c === w - 1 ? 2 : c === 1 || c === w - 2 ? 1 : 0), dark);
  const cupR = view === 'front' ? x - 2 : x + w - 1; // character's right ear
  const cupL = view === 'front' ? x + w - 1 : x - 2;
  for (const [cx, on] of [[cupR, true], [cupL, two]] as [number, boolean][]) {
    if (!on) { b.set(cx + 1, ey - 1, dark); continue; }
    b.rect(cx, ey - 1, 3, 4, mid); b.set(cx, ey - 1, lt); b.set(cx + 2, ey + 2, dark);
  }
  if (view === 'front') {
    const mx = x + 2, my = y + mouthRow(bx.h);
    b.line(cupR + 1, ey + 3, mx, my, dark);
    b.set(mx + 1, my, mic);
  }
}

/** Draw the head (skull, face, facial hair, hair front layer, glasses, hats, worn head items). */
export function drawHead(b: PixBuf, d: Dress, view: View, bx: HeadBox, expr: Expr, frame: number, hairUp: boolean, xray: boolean): void {
  const { L, R } = headSpans(d.head, bx.w, bx.h, view);
  const covered = d.hairStyle === 'hijab' || d.hairStyle === 'turban' || d.hairStyle === 'headwrap';
  if (xray) { drawSkullXray(b, view, bx, L, R); return; }
  drawSkull(b, d, view, bx, L, R, d.hairStyle === 'bald');
  if (!covered || d.hairStyle === 'headwrap') drawEars(b, d, view, bx, L, R);
  const fc: FaceCtx = { b, d, view, bx, L, R, expr, frame };
  drawFacialHair(fc);
  drawFace(fc);
  const hat = d.worn.find((w) => w === 'hardhat_red' || w === 'hardhat_white' || w === 'cap' || w === 'beanie') as 'hardhat_red' | 'hardhat_white' | 'cap' | 'beanie' | undefined;
  drawHair(b, d, view, bx, 'front', hairUp, !!hat);
  // ear items (after hair so they sit on top)
  const ey = bx.y + eyeRow(bx.h);
  if (!covered) {
    if (d.acc.earbuds && view !== 'side') { b.set(bx.x + L[eyeRow(bx.h)] - 1, ey + 1, WHITE); b.set(bx.x + R[eyeRow(bx.h)] + 1, ey + 1, WHITE); }
    if (d.acc.earbuds && view === 'side') b.set(bx.x + Math.round(bx.w * 0.38) + 1, ey + 1, WHITE);
    if (d.acc.earrings) {
      const gc = C(GOLD);
      if (view === 'side') b.set(bx.x + Math.round(bx.w * 0.38), ey + 2, gc);
      else { b.set(bx.x + L[eyeRow(bx.h)] - 1, ey + 2, gc); b.set(bx.x + R[eyeRow(bx.h)] + 1, ey + 2, gc); }
    }
    if (d.worn.includes('pen_ear') && view !== 'back') {
      const px = view === 'side' ? bx.x + Math.round(bx.w * 0.38) + 1 : bx.x + R[eyeRow(bx.h)] + 1;
      b.set(px, ey - 2, C('#c03030')); b.set(px, ey - 1, C('#e8e0d0')); b.set(px + (view === 'side' ? -1 : 0), ey - 3, C('#c03030'));
    }
  }
  if (view !== 'back') drawGlasses(b, d, view, bx);
  if (hat) drawHat(b, hat, view, bx, d.wornCol);
  if (d.worn.includes('headset1')) drawHeadset(b, d, view, bx, false);
  if (d.worn.includes('headset2')) drawHeadset(b, d, view, bx, true);
  if (d.worn.includes('ear_phone')) {
    // phone wedged against the right ear
    const dark = C('#24262e'), scr = C('#5a8ad0');
    const px = view === 'front' ? bx.x - 3 : view === 'back' ? bx.x + bx.w : bx.x + Math.round(bx.w * 0.38) - 1;
    if (view !== 'side' || true) { b.rect(px, ey - 2, 2, 5, dark); b.set(px + (view === 'front' ? 1 : 0), ey - 1, scr); }
  }
  if (d.worn.includes('whistle') && view !== 'back') {
    const my = bx.y + mouthRow(bx.h);
    const s = C(SILVER), sd = C('#7c828c');
    if (view === 'front') { const mx = bx.x + Math.floor(bx.w / 2); b.set(mx, my, s); b.set(mx + 1, my, sd); b.set(mx, my + 1, sd); }
    else { b.set(bx.x + bx.w, my, s); b.set(bx.x + bx.w + 1, my, sd); }
  }
  if (d.worn.includes('plaster') && view !== 'back') {
    const pc = C('#e8d0a8'), pl = C('#f4e4c4');
    if (view === 'front') { b.set(bx.x + 2, bx.y + 3, pl); b.set(bx.x + 3, bx.y + 3, pc); b.set(bx.x + 3, bx.y + 2, pc); }
    else { b.set(bx.x + bx.w - 3, bx.y + 3, pl); b.set(bx.x + bx.w - 2, bx.y + 3, pc); }
  }
}

function drawSkullXray(b: PixBuf, view: View, bx: HeadBox, L: number[], R: number[]): void {
  const bone = C('#eaf6ff'), boneSh = C('#9cc8e8'), dark = C('#16224a');
  for (let r = 0; r < bx.h; r++) for (let c = L[r]; c <= R[r]; c++) b.set(bx.x + c, bx.y + r, r < bx.h - 3 ? bone : (c + r) % 2 ? bone : boneSh);
  if (view === 'back') return;
  const ey = bx.y + eyeRow(bx.h);
  if (view === 'side') { b.rect(bx.x + bx.w - 4, ey, 2, 2, dark); b.set(bx.x + bx.w - 2, ey + 3, dark); return; }
  const [a, c] = eyeXs(bx.w, 2);
  b.rect(bx.x + a - 1, ey, 2, 2, dark); b.rect(bx.x + c, ey, 2, 2, dark);
  b.set(bx.x + Math.floor(bx.w / 2) - 1, ey + 2, dark);
  for (let x = a; x <= c; x += 2) b.set(bx.x + x, bx.y + bx.h - 2, dark);
}
