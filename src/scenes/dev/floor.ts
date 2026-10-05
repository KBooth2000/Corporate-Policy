// Visual QA for the floor generator + environment art.
//   #dev=floor&seed=5&f=7&type=standard&theme=sales&wing=0&hot=0&alarm=0   (arrow keys / WASD scroll, Q/E zoom)
//   add &full=1 to overlay the whole floor at 1:1 in the page (for big screenshots), &lights=1 for a light preview,
//   &bench=1 to time 300 generations in the browser (printed to the console).
//   #dev=props&act=1&page=0   every prop kind in every state (full=1 overlay, 2x)
import { app, Scene } from '../../core/app';
import { registerDev } from './registry';
import { THEMES_BY_ACT, type Act, type ExitKind, type FloorType, type PropKind, type ThemeId } from '../../data/ids';
import type { FloorMap, FloorRequest, PropDef } from '../../game/world-types';
import { TILE } from '../../game/world-types';
import { generateFloor } from '../../game/gen/floorgen';
import { PROP_INFO } from '../../game/gen/props';
import { renderFloorBase, propSprite, doorSprite, exitSprite, renderMinimap, setEnvSkin, PropState } from '../../art/env';
import { ALL_PROP_KINDS } from '../../art/env/props';
import { makeCanvas, ctx2d, drawSprite, rect } from '../../render/canvas';
import { drawText } from '../../render/font';

function params(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) { const [k, v] = part.split('='); if (k) out[k] = decodeURIComponent(v ?? ''); }
  return out;
}
const actOf = (f: number): Act => (f <= 5 ? 1 : f <= 10 ? 2 : f <= 15 ? 3 : 4) as Act;

export function requestFromHash(q = params()): FloorRequest {
  const f = Math.max(1, Math.min(20, +(q.f ?? 2)));
  const act = actOf(f);
  const pool = THEMES_BY_ACT[act];
  const theme = (q.theme && (pool as readonly string[]).concat(['carpark', 'basement', 'rooftop']).includes(q.theme) ? q.theme : pool[(+(q.seed ?? 1) + f) % pool.length]) as ThemeId;
  const exits = (q.exits ? q.exits.split(',') : ['stairs', 'lift']) as ExitKind[];
  return { runSeed: +(q.seed ?? 1), floorNumber: f, act, wing: +(q.wing ?? 0), floorType: (q.type ?? 'standard') as FloorType, theme,
    alarm: q.alarm === '1', exits, platform: q.android === '1' ? 'android' : 'pc', hotDesking: q.hot === '1', cultDressing: act === 4 };
}

/** Compose a whole floor (base + props + doors + exits) into one canvas for QA. */
export function composeFloor(map: FloorMap, opts: { doors?: 'open' | 'closed' | 'locked'; lights?: boolean; frame?: number } = {}): HTMLCanvasElement {
  const base = renderFloorBase(map);
  const c = makeCanvas(base.width, base.height);
  const g = ctx2d(c);
  g.drawImage(base, 0, 0);
  const items: { y: number; draw: () => void }[] = [];
  for (const p of map.props) items.push({ y: p.wallMounted ? p.y - 1000 : p.y, draw: () => drawSprite(g, propSprite(p, 'intact', opts.frame ?? 0), p.x, p.y) });
  for (const d of map.doors) items.push({ y: (d.ty + 1) * TILE - (d.orient === 'h' ? 1 : 0), draw: () => drawSprite(g, doorSprite(d.orient, d.len, opts.doors ?? 'open'), d.tx * TILE, d.ty * TILE) });
  for (const e of map.exits) items.push({ y: e.y - 2000, draw: () => drawSprite(g, exitSprite(e.kind, e.available, false), e.x, e.y) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  if (opts.lights) {
    const l = makeCanvas(c.width, c.height);
    const lg = ctx2d(l);
    for (const r of map.rooms) { lg.fillStyle = `rgba(4,6,14,${0.25 + r.darkness * 0.7})`; lg.fillRect((r.tx - 1) * TILE, (r.ty - 1) * TILE, (r.tw + 2) * TILE, (r.th + 2) * TILE); }
    lg.globalCompositeOperation = 'destination-out';
    for (const r of map.rooms) for (const li of r.lights) {
      const gr = lg.createRadialGradient(li.x, li.y, 0, li.x, li.y, li.radius);
      gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, li.intensity)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.fillRect(li.x - li.radius, li.y - li.radius, li.radius * 2, li.radius * 2);
    }
    g.drawImage(l, 0, 0);
  }
  return c;
}

function overlay(c: HTMLCanvasElement, scale = 1): void {
  document.getElementById('qa-overlay')?.remove();
  c.id = 'qa-overlay';
  const q = params();
  const ox = -(+(q.ox ?? 0)) * TILE * scale, oy = -(+(q.oy ?? 0)) * TILE * scale;
  c.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;z-index:10;image-rendering:pixelated;width:${c.width * scale}px;height:${c.height * scale}px;background:#000`;
  document.body.style.overflow = 'auto';
  document.body.appendChild(c);
}

class FloorScene implements Scene {
  name = 'dev-floor';
  map!: FloorMap;
  img!: HTMLCanvasElement;
  mini!: HTMLCanvasElement;
  camX = 0; camY = 0; zoom = 1;
  q = params();
  genMs = 0;
  enter(): void {
    const req = requestFromHash(this.q);
    const t0 = performance.now();
    this.map = generateFloor(req);
    this.genMs = performance.now() - t0;
    const t1 = performance.now();
    this.img = composeFloor(this.map, { doors: (this.q.doors as 'open') ?? 'open', lights: this.q.lights === '1' });
    const renderMs = performance.now() - t1;
    const visited = new Set(this.map.rooms.slice(0, 3).map((r) => r.id));
    this.mini = renderMinimap(this.map, visited, 1, new Set([0, 1]));
    const core = this.map.rooms[this.map.coreRoomId];
    this.camX = this.q.cx ? +this.q.cx * TILE : (core.tx + core.tw / 2) * TILE;
    this.camY = this.q.cy ? +this.q.cy * TILE : (core.ty + core.th / 2) * TILE;
    this.zoom = this.q.zoom ? +this.q.zoom : 1;
    console.log(`floor ${req.floorNumber} ${req.floorType} ${req.theme}: ${this.map.w}x${this.map.h} tiles, ${this.map.rooms.length} rooms, ${this.map.props.length} props, ${this.map.breaches.length} breaches, attempts ${this.map.attempts}, gen ${this.genMs.toFixed(1)} ms, render ${renderMs.toFixed(1)} ms`);
    console.log('rooms: ' + this.map.rooms.map((r) => `${r.id}:${r.kind}(${r.templateId})${r.eliteRoom ? '*' : ''}`).join(' '));
    if (this.q.full === '1') overlay(this.img, +(this.q.scale ?? 1));
    if (this.q.bench === '1') {
      const ts: number[] = [];
      const types: FloorType[] = ['standard', 'elite', 'challenge', 'director', 'shop', 'event'];
      for (let i = 0; i < 300; i++) {
        const f = (i % 20) + 1, act = actOf(f);
        const r: FloorRequest = { ...req, runSeed: 1000 + i * 31, floorNumber: f, act, theme: THEMES_BY_ACT[act][i % THEMES_BY_ACT[act].length], floorType: types[i % types.length], cultDressing: act === 4 };
        const s = performance.now(); generateFloor(r); ts.push(performance.now() - s);
      }
      ts.sort((a, b) => a - b);
      console.log(`BENCH browser generateFloor x300: mean ${(ts.reduce((a, b) => a + b) / ts.length).toFixed(2)} ms, p50 ${ts[150].toFixed(2)}, p95 ${ts[285].toFixed(2)}, p99 ${ts[297].toFixed(2)}, max ${ts[299].toFixed(2)}`);
    }
  }
  update(): void {
    const i = app.input, sp = 6 / this.zoom;
    if (i.down('left')) this.camX -= sp;
    if (i.down('right')) this.camX += sp;
    if (i.down('up')) this.camY -= sp;
    if (i.down('down')) this.camY += sp;
    if (i.pressed('tabL')) this.zoom = Math.max(0.25, this.zoom / 2);
    if (i.pressed('tabR')) this.zoom = Math.min(2, this.zoom * 2);
  }
  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#05060a');
    g.imageSmoothingEnabled = false;
    const sw = r.W / this.zoom, sh = r.H / this.zoom;
    g.drawImage(this.img, Math.round(this.camX - sw / 2), Math.round(this.camY - sh / 2), sw, sh, 0, 0, r.W, r.H);
    g.drawImage(this.mini, r.W - this.mini.width - 4, 4);
    const m = this.map;
    drawText(g, `F${m.req.floorNumber} ${m.req.floorType} ${m.req.theme} seed ${m.req.runSeed} | ${m.rooms.length} rooms ${m.props.length} props | gen ${this.genMs.toFixed(1)}ms try ${m.attempts}`, 4, r.H - 12, { color: '#e8e8e8' });
  }
}

const STATES: PropState[] = ['intact', 'damaged', 'destroyed', 'active', 'used'];

class PropsScene implements Scene {
  name = 'dev-props';
  img!: HTMLCanvasElement;
  enter(): void {
    const q = params();
    const act = (+(q.act ?? 1)) as Act;
    const theme = (q.theme as ThemeId) ?? THEMES_BY_ACT[act][0];
    setEnvSkin(theme, act, 8);
    const kinds = ALL_PROP_KINDS.slice((+(q.page ?? 0)) * 40, (+(q.page ?? 0)) * 40 + 40);
    const colW = 60, rowH = 54, cols = 2; // two kind-columns, each with 5 states
    const rows = Math.ceil(kinds.length / cols);
    const W = cols * (110 + STATES.length * colW), H = rows * rowH + 20;
    this.img = makeCanvas(W, H);
    const g = ctx2d(this.img);
    rect(g, 0, 0, W, H, act === 4 ? '#3a2a24' : act === 3 ? '#2a2e3a' : act === 2 ? '#2e3044' : '#8d9188');
    drawText(g, `ACT ${act} ${theme}  states: ${STATES.join(' / ')}`, 4, 4, { color: '#ffffff' });
    kinds.forEach((kind, i) => {
      const cx = Math.floor(i / rows) * (110 + STATES.length * colW), cy = 20 + (i % rows) * rowH;
      drawText(g, kind, cx + 4, cy + rowH / 2 - 4, { color: '#ffffff' });
      const info = PROP_INFO[kind as PropKind];
      STATES.forEach((st, j) => {
        const fw = info.wall ? info.fw : info.stretchy ? Math.max(2, info.fw) : info.fw, fh = info.wall ? 1 : info.fh;
        const p: PropDef = { id: 0, kind, x: cx + 110 + j * colW + colW / 2, y: cy + rowH - 4, w: fw * TILE - 2, h: info.wall ? 4 : fh * TILE - 2, solid: info.solid, variant: i + j, roomId: 0, facing: 0, wallMounted: !!info.wall };
        if (info.wall) { rect(g, p.x - fw * 8 - 2, p.y - 16, fw * 16 + 4, 16, '#b8b0a0'); rect(g, p.x - fw * 8 - 2, p.y - 2, fw * 16 + 4, 2, '#6e675c'); }
        drawSprite(g, propSprite(p, st, j), p.x, p.y);
      });
    });
    overlay(this.img, +(q.scale ?? 2));
  }
  update(): void {}
  render(): void { const r = app.renderer; rect(r.f, 0, 0, r.W, r.H, '#000'); }
}

registerDev('floor', () => new FloorScene());
registerDev('props', () => new PropsScene());
