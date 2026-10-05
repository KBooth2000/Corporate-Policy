// Button-prompt glyphs: keycaps, mouse, generic gamepad faces / bumpers / triggers, D-pad, chords.
// All shapes are generic (no trademarked logos). Height is fixed at 14px (incl. 1px outline).
import type { Device } from '../../core/input';
import { makeCanvas, ctx2d, rect, withOutline } from '../../render/canvas';
import type { Ctx } from '../../render/canvas';
import { drawText, measure } from '../../render/font';
import { OUTLINE } from '../palette';

const H = 14;
const INK = '#262a33';

function newGlyph(w: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = makeCanvas(w, H);
  return { c, g: ctx2d(c) };
}

/** Rounded rectangle (corners cut by 1px) with outline. */
function slab(g: Ctx, x: number, y: number, w: number, h: number, fill: string, col: string): void {
  rect(g, x + 1, y, w - 2, h, col);
  rect(g, x, y + 1, w, h - 2, col);
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
}

function keycap(label: string): HTMLCanvasElement {
  const tw = measure(label);
  const w = Math.max(14, tw + 7);
  const { c, g } = newGlyph(w);
  slab(g, 0, 0, w, H, '#a9a59a', OUTLINE);            // body edge (bottom lip colour)
  rect(g, 1, 1, w - 2, 10, '#ece9e1');                 // key face
  rect(g, 1, 1, w - 2, 1, '#ffffff');                  // top highlight
  rect(g, 1, 2, 1, 8, '#f8f6f0');                      // left highlight
  rect(g, w - 2, 2, 1, 9, '#cfcbc0');                  // right shade
  rect(g, 1, 11, w - 2, 1, '#8f8b80');                 // lip shade
  rect(g, 0, 0, 1, 1, 'rgba(0,0,0,0)');
  drawText(g, label, Math.floor((w - tw) / 2), 2, { color: INK, shadow: null });
  return c;
}

/** Draw into a 12px-high art canvas, then add the 1px outline (final glyph is 14px tall). */
function art(w: number, draw: (g: Ctx) => void): HTMLCanvasElement {
  const c = makeCanvas(w, 12);
  draw(ctx2d(c));
  return withOutline(c, OUTLINE);
}

function disc(g: Ctx, cx: number, cy: number, r: number, base: string, light: string, dark: string): void {
  for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) continue;
    g.fillStyle = d > r - 1.4 ? (dx + dy < -0.5 ? light : dx + dy > 0.5 ? dark : base) : base;
    g.fillRect(x, y, 1, 1);
  }
}

function faceButton(label: string, base: string, light: string, dark: string, ink = '#ffffff'): HTMLCanvasElement {
  return art(12, (g) => {
    disc(g, 6, 6, 6, base, light, dark);
    drawText(g, label, 6 - Math.floor(measure(label) / 2), 3, { color: ink, shadow: null });
  });
}

function psSymbol(kind: 'Cross' | 'Circle' | 'Square' | 'Triangle'): HTMLCanvasElement {
  return art(12, (g) => {
    disc(g, 6, 6, 6, '#3a4052', '#59607a', '#242836');
    const col = kind === 'Cross' ? '#79b0ff' : kind === 'Circle' ? '#ff7a66' : kind === 'Square' ? '#d6a4ee' : '#62dca0';
    const p = (x: number, y: number) => rect(g, x, y, 1, 1, col);
    if (kind === 'Cross') { for (let i = 0; i < 6; i++) { p(3 + i, 3 + i); p(8 - i, 3 + i); p(4 + i, 3 + i); p(7 - i, 3 + i); } }
    else if (kind === 'Circle') { for (const [x, y] of [[5, 3], [6, 3], [4, 4], [7, 4], [3, 5], [8, 5], [3, 6], [8, 6], [4, 7], [7, 7], [5, 8], [6, 8]]) p(x, y); }
    else if (kind === 'Square') { for (let i = 3; i <= 8; i++) { p(i, 3); p(i, 8); p(3, i); p(8, i); } }
    else { for (const [x, y] of [[5, 3], [6, 3], [4, 4], [7, 4], [4, 5], [7, 5], [3, 6], [8, 6], [3, 7], [8, 7], [4, 8], [5, 8], [6, 8], [7, 8]]) p(x, y); }
  });
}

/** Bumper / system button: wide pill with a 3D lip. */
function pill(label: string, fill: string, ink: string, light: string, dark: string, minW = 16): HTMLCanvasElement {
  const tw = measure(label);
  const w = Math.max(minW, tw + 8);
  return art(w, (g) => {
    rect(g, 1, 0, w - 2, 11, dark);
    rect(g, 0, 1, w, 9, dark);
    rect(g, 1, 1, w - 2, 9, fill);
    rect(g, 2, 1, w - 4, 1, light);
    drawText(g, label, Math.floor((w - tw) / 2), 2, { color: ink, shadow: null });
  });
}

/** Trigger: taller, curved top, dark body. */
function trigger(label: string): HTMLCanvasElement {
  const tw = measure(label);
  const w = Math.max(16, tw + 8);
  return art(w, (g) => {
    rect(g, 3, 0, w - 6, 1, '#7a8294');
    rect(g, 1, 1, w - 2, 1, '#7a8294');
    rect(g, 0, 2, w, 9, '#4a5266');
    rect(g, 1, 2, w - 2, 9, '#4a5266');
    rect(g, 1, 2, w - 2, 1, '#6a7388');
    rect(g, 1, 11, w - 2, 1, '#2f3544');
    rect(g, 0, 11, 1, 1, 'rgba(0,0,0,0)');
    drawText(g, label, Math.floor((w - tw) / 2), 2, { color: '#f4f4f0', shadow: null });
  });
}

function stick(label: string): HTMLCanvasElement {
  const ch = label[0];
  return art(12, (g) => {
    disc(g, 6, 6, 6, '#b4bacb', '#e6e9f0', '#6d758a');
    drawText(g, ch, 6 - Math.floor(measure(ch) / 2), 3, { color: INK, shadow: null });
  });
}

function dpad(dir: string): HTMLCanvasElement {
  return art(12, (g) => {
    const base = '#7a8294', lit = '#ffd34d';
    const on = (d: string) => dir === d;
    rect(g, 4, 0, 4, 12, base); rect(g, 0, 4, 12, 4, base);
    rect(g, 4, 0, 4, 4, on('↑') ? lit : base); rect(g, 4, 8, 4, 4, on('↓') ? lit : base);
    rect(g, 0, 4, 4, 4, on('←') ? lit : base); rect(g, 8, 4, 4, 4, on('→') ? lit : base);
    rect(g, 4, 0, 3, 1, '#c4c9d4'); rect(g, 0, 4, 1, 3, '#c4c9d4');
    rect(g, 5, 5, 2, 2, '#4a5266');
    rect(g, 4, 11, 4, 1, on('↓') ? '#b88a1a' : '#4a5266'); rect(g, 11, 4, 1, 4, on('→') ? '#b88a1a' : '#4a5266');
  });
}

function mouse(which: 'LMB' | 'RMB' | 'MMB'): HTMLCanvasElement {
  return art(9, (g) => {
    rect(g, 0, 0, 9, 12, '#dedbd2');
    rect(g, 0, 0, 1, 11, '#f4f2ec'); rect(g, 8, 2, 1, 10, '#b3afa4'); rect(g, 0, 11, 9, 1, '#a09c92');
    rect(g, 0, 6, 9, 1, '#555b6a');
    rect(g, 4, 0, 1, 6, '#555b6a');
    const hot = '#f08a2c', hotHi = '#ffbe63';
    if (which === 'LMB') { rect(g, 0, 0, 4, 6, hot); rect(g, 0, 0, 4, 1, hotHi); }
    if (which === 'RMB') { rect(g, 5, 0, 4, 6, hot); rect(g, 5, 0, 4, 1, hotHi); }
    if (which === 'MMB') { rect(g, 3, 0, 3, 5, hot); rect(g, 4, 1, 1, 3, '#8a4a12'); }
    g.clearRect(0, 0, 1, 1); g.clearRect(8, 0, 1, 1);
  });
}

function single(label: string, device: Device): HTMLCanvasElement {
  if (label === 'LMB' || label === 'RMB' || label === 'MMB') return mouse(label);
  if (/^D[↑↓←→]$/.test(label)) return dpad(label[1]);
  if (label === 'Cross' || label === 'Circle' || label === 'Square' || label === 'Triangle') return psSymbol(label);
  if (device === 'xbox') {
    if (label === 'A') return faceButton('A', '#4caf58', '#8fdc86', '#2b6f44');
    if (label === 'B') return faceButton('B', '#d9392f', '#ff7b62', '#8e1d22');
    if (label === 'X') return faceButton('X', '#3f7fd6', '#82c4f7', '#23468c');
    if (label === 'Y') return faceButton('Y', '#e8b52a', '#ffe48a', '#a87a14', '#262a33');
  }
  if (device === 'xbox' || device === 'playstation' || device === 'pad') {
    if (/^(LB|RB|L1|R1)$/.test(label)) return pill(label, '#c9ccd4', INK, '#eef0f4', '#8a90a0');
    if (/^(LT|RT|L2|R2)$/.test(label)) return trigger(label);
    if (/^(LS|RS|L3|R3)$/.test(label)) return stick(label);
    if (/^B\d+$/.test(label)) return faceButton(label.slice(1), '#6b7490', '#98a1bd', '#434a62');
    if (['View', 'Menu', 'Share', 'Options', 'Select', 'Start', 'Home', 'PS'].includes(label)) return pill(label, '#9aa2b4', INK, '#c6ccd8', '#5d6578', 12);
  }
  return keycap(label);
}

function plus(): HTMLCanvasElement {
  const { c, g } = newGlyph(7);
  rect(g, 1, 6, 5, 1, OUTLINE); rect(g, 3, 4, 1, 5, OUTLINE);
  rect(g, 2, 6, 3, 1, '#f4f4f0'); rect(g, 3, 5, 1, 3, '#f4f4f0');
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

export function glyph(label: string, device: Device): HTMLCanvasElement {
  const key = device + '|' + label;
  let c = cache.get(key);
  if (c) return c;
  if (label.length > 1 && label.includes('+') && label !== '+') {
    const parts = label.split('+').map((p) => single(p.trim(), device));
    const sep = plus();
    const w = parts.reduce((a, p) => a + p.width, 0) + sep.width * (parts.length - 1) - (parts.length - 1);
    c = makeCanvas(w, H);
    const g = ctx2d(c);
    let x = 0;
    parts.forEach((p, i) => {
      if (i > 0) { g.drawImage(sep, x - 1, 0); x += sep.width - 1; }
      g.drawImage(p, x, 0); x += p.width;
    });
  } else c = single(label, device);
  cache.set(key, c);
  return c;
}
