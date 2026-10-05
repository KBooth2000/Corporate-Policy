// Boss arena set pieces (spec 6.2–6.5): baked, outlined hi-bit sprites in the environment style — top-left light,
// hue-shifted ramps, 1px dark outline. All sprites are cached; animated pieces cache one canvas per frame/state.
import type { Sprite, Ctx } from '../../render/canvas';
import { PixBuf, C, Col } from '../chars/pixbuf';
import { ramp, R, rotRect, poly, P } from './fig';
import { bakeSprite } from './bake';
import type { Ramp } from '../chars/types';

const cache = new Map<string, Sprite>();
export function cached(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) { s = make(); cache.set(key, s); }
  return s;
}

/** Filled shaded box (top-left light, bottom-right shade) in a PixBuf. */
export function box(b: PixBuf, x: number, y: number, w: number, h: number, r: Ramp, o: { top?: boolean } = {}): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = r.base;
    if (i === 0 || j === 0) c = r.lt;
    if (i === w - 1 || j === h - 1) c = r.sh;
    if (o.top && j === 0) c = r.hi;
    b.set(x + i, y + j, c);
  }
}
export function rivets(b: PixBuf, x: number, y: number, n: number, step: number, r: Ramp, vertical = false): void {
  for (let k = 0; k < n; k++) { const xx = vertical ? x : x + k * step, yy = vertical ? y + k * step : y; b.set(xx, yy, r.hi); b.set(xx + 1, yy + 1, r.dk); }
}
function stripes(b: PixBuf, x: number, y: number, w: number, h: number, a: Col, c2: Col, period = 4): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, y + j, ((i + j) % period) < period / 2 ? a : c2);
}

const STEEL = ramp('#7e8894');
const STEEL_D = ramp('#4c5562');
const COPPER = ramp('#b8743a');
const RED = ramp('#c03a2c');
const YEL = ramp('#f0c232');
const BLK = C('#1a1b22');

// =============================================================================================== Act 1
/** Boiler: 64 wide; state 'idle' | 'open' | 'blast'; frame animates gauge/steam. Origin base-centre. */
export function boilerSprite(state: 'idle' | 'open' | 'blast', frame = 0): Sprite {
  return cached(`boiler:${state}:${frame}`, () => bakeSprite(64, 78, (b) => {
    // flue pipes up into the wall
    box(b, 10, 0, 7, 30, COPPER); box(b, 46, 0, 7, 24, COPPER);
    for (let y = 4; y < 28; y += 8) { b.hline(10, 16, y, COPPER.dk); b.hline(46, 52, y, COPPER.dk); }
    // drum body (vertical cylinder)
    for (let y = 18; y < 76; y++) for (let x = 4; x < 60; x++) {
      const u = (x - 4) / 55;
      let c = u < 0.08 ? STEEL.lt : u < 0.2 ? STEEL.hi : u < 0.62 ? STEEL.base : u < 0.88 ? STEEL.sh : STEEL.dk;
      if (y === 18 || y === 19) c = STEEL.hi;
      if (y > 72) c = STEEL_D.sh;
      b.set(x, y, c);
    }
    // rounded top cap
    for (let x = 6; x < 58; x++) b.set(x, 17, STEEL.lt);
    for (let x = 9; x < 55; x++) b.set(x, 16, STEEL.hi);
    // bands + rivets
    for (const y of [26, 50, 70]) { b.hline(4, 59, y, STEEL_D.base); b.hline(4, 59, y + 1, STEEL_D.dk); rivets(b, 7, y - 2, 9, 6, STEEL); }
    // hazard label
    stripes(b, 40, 30, 14, 6, YEL.base, BLK, 4);
    // pressure gauge
    const gx = 18, gy = 36;
    b.ellipse(gx, gy, 6, 6, C('#2a2d34')); b.ellipse(gx, gy, 5, 5, C('#efe9d8'));
    for (let a = 0; a < 6; a++) { const an = Math.PI * (0.8 + a * 0.28); b.set(R(gx + Math.cos(an) * 4), R(gy + Math.sin(an) * 4), C('#3a3a3a')); }
    b.set(gx + 3, gy - 2, C('#c03a2c')); b.set(gx + 4, gy - 3, C('#c03a2c'));
    const na = state === 'blast' ? Math.PI * 2 * (frame / 4) : Math.PI * (1.2 + (frame % 2) * 0.1);
    b.line(gx, gy, R(gx + Math.cos(na) * 4), R(gy + Math.sin(na) * 4), C('#c03a2c'));
    // valve wheel
    b.ellipse(50, 44, 5, 5, RED.base); b.ellipse(50, 44, 3, 3, STEEL.sh); b.set(50, 44, RED.lt); b.hline(45, 55, 44, RED.dk); b.vline(50, 39, 49, RED.dk);
    // firebox hatch (round door)
    const hx = 32, hy = 60;
    if (state === 'idle') {
      b.ellipse(hx, hy, 11, 9, STEEL_D.base); b.ellipse(hx, hy, 9, 7, STEEL_D.lt); b.ellipse(hx, hy, 8, 6, STEEL_D.base);
      b.hline(hx - 6, hx + 6, hy, STEEL_D.dk); b.rect(hx + 6, hy - 1, 4, 3, BLK);
      for (let y = hy - 3; y <= hy + 3; y += 2) b.set(hx - 3, y, C('#ff8a3a'));
    } else {
      b.ellipse(hx, hy, 11, 9, STEEL_D.dk);
      b.ellipse(hx, hy + 1, 8, 6, state === 'blast' ? C('#ffe08a') : C('#ff6a1a'));
      b.ellipse(hx, hy + 2, 5, 3, state === 'blast' ? C('#ffffff') : C('#ffc04a'));
      // swung-open door
      for (let y = hy - 8; y <= hy + 8; y++) for (let x = hx - 20; x <= hx - 13; x++) b.set(x, y, x === hx - 20 ? STEEL_D.lt : STEEL_D.base);
    }
    // base plinth
    box(b, 0, 72, 64, 6, STEEL_D);
  }, 32, 78));
}

/** Electrical panel (stands against a wall): state ok | open | dead. */
export function panelSprite(state: 'ok' | 'open' | 'dead', frame = 0): Sprite {
  return cached(`panel:${state}:${frame}`, () => bakeSprite(20, 30, (b) => {
    box(b, 0, 0, 20, 30, ramp('#8a8f86'), { top: true });
    box(b, 2, 2, 16, 22, ramp('#9da293'));
    // warning triangle
    poly(b, [[10, 5], [15, 14], [5, 14]], YEL.base);
    b.vline(10, 8, 11, BLK); b.set(10, 13, BLK); b.set(11, 9, BLK);
    if (state === 'open') {
      // door swung, breakers exposed, live sparks
      box(b, 2, 2, 16, 22, ramp('#3a3d44'));
      for (let k = 0; k < 4; k++) { b.rect(4, 4 + k * 5, 12, 3, C('#24262c')); b.set(5 + ((k + frame) % 3) * 4, 5 + k * 5, C('#9fe8ff')); }
      if (frame % 2 === 0) { b.set(17, 3, C('#ffffff')); b.set(18, 2, C('#9fe8ff')); b.set(1, 20, C('#9fe8ff')); }
    } else if (state === 'dead') {
      box(b, 2, 2, 16, 22, ramp('#2a2a2e'));
      b.line(4, 6, 15, 18, C('#4a4a4e'));
    }
    // conduit
    b.rect(8, 26, 4, 4, ramp('#5a5e66').base);
  }, 10, 30));
}

export function beaconSprite(on: boolean): Sprite {
  return cached(`beacon:${on}`, () => bakeSprite(8, 9, (b) => {
    box(b, 0, 6, 8, 3, STEEL_D);
    b.ellipse(3.5, 3.5, 3, 3, on ? C('#ff3a24') : C('#6a1a14'));
    if (on) { b.set(2, 2, C('#ffd0c0')); b.set(3, 2, C('#ff9a80')); }
  }, 4, 9));
}

export function toolboxSprite(): Sprite {
  return cached('toolbox', () => bakeSprite(14, 10, (b) => {
    box(b, 0, 2, 14, 8, ramp('#c23a28'), { top: true });
    b.hline(1, 12, 4, C('#6a1a14'));
    b.hline(4, 9, 0, STEEL.base); b.set(4, 1, STEEL.base); b.set(9, 1, STEEL.base);
    b.set(6, 6, STEEL.hi); b.set(7, 6, STEEL.base);
  }, 7, 10));
}

export function hardhatSprite(): Sprite {
  return cached('hardhat', () => bakeSprite(14, 9, (b) => {
    for (let j = 0; j < 7; j++) { const half = Math.round(6 * Math.sqrt(1 - ((7 - j) / 8) ** 2)) + 1; for (let i = -half; i < half; i++) b.set(7 + i, j, j === 0 ? YEL.hi : i < -half + 2 ? YEL.lt : i > half - 3 ? YEL.sh : YEL.base); }
    b.hline(0, 13, 7, YEL.sh); b.hline(0, 13, 8, YEL.dk);
    b.rect(5, 3, 4, 3, C('#3a6ab0'));
  }, 7, 9));
}

export function hatchSprite(open: boolean): Sprite {
  return cached(`hatch:${open}`, () => bakeSprite(24, 10, (b) => {
    box(b, 0, 0, 24, 10, STEEL_D);
    if (open) { b.rect(2, 2, 20, 6, BLK); b.rect(2, 2, 20, 1, C('#3a3f48')); }
    else { stripes(b, 2, 2, 20, 6, YEL.base, BLK, 6); }
  }, 12, 10));
}

// =============================================================================================== drawing helpers (dynamic)
/** Pixel ellipse straight onto a canvas (dynamic puddles etc.). */
export function pxEllipse(g: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const span = rx * Math.sqrt(Math.max(0, 1 - (y * y) / Math.max(ry * ry, 0.01)));
    if (span < 0.5) continue;
    g.fillRect(Math.round(cx - span), Math.round(cy + y), Math.max(1, Math.round(span * 2)), 1);
  }
}

export { rotRect, poly };
export type { P };

// =============================================================================================== Act 2
const LACQ = ramp('#7a2a22');
const BRASS = ramp('#d8a838');
/** Sales gong on its lacquered A-frame. state intact | damaged | destroyed; wobble -2..2 shifts the disc. */
export function gongSprite(state: 'intact' | 'damaged' | 'destroyed', wobble = 0): Sprite {
  return cached(`gong:${state}:${wobble}`, () => bakeSprite(44, 52, (b) => {
    if (state === 'destroyed') {
      // toppled frame and a dented disc on the carpet
      box(b, 2, 44, 40, 4, LACQ); box(b, 6, 38, 4, 8, LACQ); box(b, 34, 40, 4, 6, LACQ);
      b.ellipse(24, 44, 13, 6, BRASS.sh); b.ellipse(23, 43, 10, 4, BRASS.base); b.ellipse(21, 42, 4, 2, BRASS.hi);
      b.line(16, 42, 28, 46, BRASS.dk);
      return;
    }
    // posts + crossbar
    box(b, 3, 6, 5, 46, LACQ); box(b, 36, 6, 5, 46, LACQ);
    box(b, 0, 2, 44, 6, LACQ, { top: true });
    b.hline(1, 42, 2, ramp('#c04a3a').base);
    // finials
    b.rect(0, 0, 4, 3, BRASS.base); b.rect(40, 0, 4, 3, BRASS.base);
    // cords
    b.vline(16, 8, 13, C('#2a2a30')); b.vline(28, 8, 13, C('#2a2a30'));
    // disc
    const cx = 22 + wobble, cy = 26;
    b.ellipse(cx, cy, 14, 14, BRASS.dk);
    b.ellipse(cx, cy, 13, 13, BRASS.base);
    for (let a = 0; a < 40; a++) { const an = (a / 40) * Math.PI * 2; b.set(R(cx + Math.cos(an) * 9), R(cy + Math.sin(an) * 9), BRASS.sh); }
    b.ellipse(cx, cy, 4, 4, BRASS.lt); b.ellipse(cx - 1, cy - 1, 2, 2, BRASS.hi);
    for (let k = 0; k < 6; k++) b.set(cx - 9 + k, cy - 9 + Math.round(k * 0.4), BRASS.hi);
    if (state === 'damaged') { b.line(cx - 6, cy - 10, cx + 2, cy + 3, BRASS.dk); b.line(cx + 2, cy + 3, cx + 9, cy + 1, BRASS.dk); }
    // feet
    box(b, 0, 48, 12, 4, LACQ); box(b, 32, 48, 12, 4, LACQ);
  }, 22, 52));
}

/** Freestanding leaderboard totem (the screen content is drawn live). */
export function screenSprite(state: 'on' | 'broken' | 'off'): Sprite {
  return cached(`screen:${state}`, () => bakeSprite(36, 46, (b) => {
    box(b, 15, 30, 6, 12, ramp('#3a3d46')); box(b, 8, 42, 20, 4, ramp('#3a3d46'), { top: true });
    box(b, 0, 0, 36, 30, ramp('#1c1d24'), { top: true });
    if (state === 'broken') {
      box(b, 2, 2, 32, 26, ramp('#0e0f14'));
      b.line(6, 4, 20, 16, C('#9aa4b4')); b.line(20, 16, 31, 9, C('#9aa4b4')); b.line(20, 16, 14, 27, C('#6a7484')); b.line(20, 16, 33, 24, C('#6a7484'));
      b.set(20, 16, C('#ffffff'));
    } else if (state === 'off') box(b, 2, 2, 32, 26, ramp('#0e0f14'));
    else box(b, 2, 2, 32, 26, ramp('#0a1a24'));
  }, 18, 46));
}

/** Contract projectile (paper with a red signature line). */
export function contractSprite(): Sprite {
  return cached('contract', () => bakeSprite(8, 10, (b) => {
    box(b, 0, 0, 8, 10, ramp('#f2efe6'));
    b.hline(1, 6, 2, C('#7a7f8a')); b.hline(1, 5, 4, C('#7a7f8a')); b.hline(1, 6, 6, C('#7a7f8a'));
    b.line(1, 8, 6, 7, C('#c03a2c'));
  }, 4, 5));
}

// =============================================================================================== Act 3
const SHRED = ramp('#4a5468');
const SHRED_D = ramp('#2a303e');
/** Industrial shredder (96 wide); frame animates the cutter drums; jam = red lights. */
export function shredderSprite(frame: number, running: boolean, gore = false): Sprite {
  return cached(`shredder:${frame}:${running}:${gore}`, () => bakeSprite(96, 70, (b) => {
    // hopper housing
    box(b, 4, 0, 88, 44, SHRED, { top: true });
    for (let x = 8; x < 88; x += 10) b.vline(x, 4, 40, SHRED.sh);
    stripes(b, 4, 40, 88, 4, YEL.base, BLK, 6);
    // label plate
    box(b, 30, 6, 36, 9, ramp('#d8d0b0'));
    b.hline(33, 62, 9, C('#8a2a2a')); b.hline(33, 56, 12, C('#5a5a62'));
    // warning lights
    const on = running && frame % 2 === 0;
    b.ellipse(14, 10, 3, 3, on ? C('#ff3a24') : C('#6a1a14')); b.ellipse(82, 10, 3, 3, !on && running ? C('#ff3a24') : C('#6a1a14'));
    // mouth with cutter drums
    box(b, 8, 44, 80, 22, SHRED_D);
    b.rect(12, 48, 72, 14, BLK);
    for (let x = 12; x < 84; x += 4) {
      const ph = (x / 4 + frame) % 2;
      b.vline(x + ph, 49, 53, C('#b8c0cc')); b.vline(x + 1 - ph, 56, 60, C('#8e98a6'));
      b.set(x + 2, 54, C('#d8dde4'));
    }
    if (gore) for (let k = 0; k < 12; k++) b.set(14 + ((k * 23) % 68), 52 + (k % 8), C('#8a0f14'));
    // shredded paper spilling out
    for (let k = 0; k < 14; k++) b.vline(10 + ((k * 37) % 76), 62, 66 + (k % 3), C(gore && k % 3 === 0 ? '#a3161b' : '#f2efe6'));
    box(b, 0, 64, 96, 6, SHRED_D);
  }, 48, 70));
}

/** Corrugated steel shutter tile (16 wide) — the audit walls. */
export function shutterSprite(vertical: boolean, damaged: boolean): Sprite {
  return cached(`shutter:${vertical}:${damaged}`, () => bakeSprite(16, 30, (b) => {
    const S = ramp('#6a7484');
    box(b, 0, 0, 16, 30, S, { top: true });
    for (let y = 3; y < 28; y += 3) b.hline(1, 14, y, S.sh);
    for (let y = 4; y < 28; y += 3) b.hline(1, 14, y, S.lt);
    stripes(b, 0, 24, 16, 4, YEL.base, BLK, 4);
    if (vertical) { b.vline(0, 0, 29, S.dk); b.vline(15, 0, 29, S.dk); }
    if (damaged) { b.line(3, 6, 9, 16, S.dk); b.line(9, 16, 13, 10, S.dk); b.set(8, 15, C('#ffe9a0')); }
  }, 8, 30));
}

/** Archive "red tape" projectile. */
export function tapeSprite(): Sprite {
  return cached('tape', () => bakeSprite(8, 4, (b) => { box(b, 0, 0, 8, 4, ramp('#c02a2a')); b.hline(1, 6, 1, C('#ff8a7a')); }, 4, 2));
}
