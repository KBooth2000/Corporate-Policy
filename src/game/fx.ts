// Particles, gore and persistent decals (spec 1.3 gore toggle, 4.8 decal cap, 10.2 render-texture decals).
import { fxRng } from '../core/rng';
import type { Ctx } from '../render/canvas';
import { makeCanvas, ctx2d } from '../render/canvas';
import { BLOOD } from '../art/palette';
import { app, PLATFORM } from '../core/app';
import { TILE } from './world-types';
import type { RoomDef } from './world-types';

export type ParticleKind = 'pixel' | 'blood' | 'spark' | 'smoke' | 'paper' | 'glass' | 'debris' | 'sprite' | 'ring' | 'text' | 'water' | 'confetti' | 'slash';

export interface Particle {
  kind: ParticleKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  col: string;
  size: number;
  gravity: number;
  drag: number;
  rot: number; vr: number;
  toDecal: boolean;
  sprite?: HTMLCanvasElement;
  text?: string;
  roomId: number;
  bounce: number;
}

const MAX_PARTICLES = PLATFORM === 'android' ? 450 : 900;

export class Particles {
  list: Particle[] = [];
  constructor(private decals: Decals) {}

  spawn(p: Partial<Particle> & { x: number; y: number }): Particle | null {
    if (this.list.length >= MAX_PARTICLES) {
      // recycle oldest non-decal particle
      const i = this.list.findIndex((q) => !q.toDecal);
      if (i < 0) return null;
      this.list.splice(i, 1);
    }
    const q: Particle = {
      kind: 'pixel', z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, max: 0.5, col: '#fff', size: 1, gravity: 0, drag: 2,
      rot: 0, vr: 0, toDecal: false, roomId: -1, bounce: 0, ...p,
    };
    q.max = q.life;
    this.list.push(q);
    return q;
  }

  update(dt: number): void {
    const arr = this.list;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.gravity) {
        p.vz -= p.gravity * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.bounce > 0 && Math.abs(p.vz) > 30) { p.vz = -p.vz * p.bounce; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; }
          else {
            p.vz = 0;
            if (p.toDecal) { this.decals.stamp(p); arr.splice(i, 1); continue; }
            p.vx *= Math.max(0, 1 - dt * 10); p.vy *= Math.max(0, 1 - dt * 10); p.vr *= 0.8;
          }
        }
      } else if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.rot += p.vr * dt;
      if (p.life <= 0) {
        if (p.toDecal) this.decals.stamp(p);
        arr.splice(i, 1);
      }
    }
  }

  render(g: Ctx, above: boolean): void {
    for (const p of this.list) {
      const air = p.kind === 'text' || p.kind === 'ring' || p.kind === 'smoke' || p.kind === 'slash';
      if (air !== above) continue;
      const a = Math.min(1, p.life / Math.max(0.0001, p.max) * 2);
      const x = Math.round(p.x), y = Math.round(p.y - p.z);
      switch (p.kind) {
        case 'smoke': {
          g.globalAlpha = 0.5 * a;
          g.fillStyle = p.col;
          const s = Math.round(p.size * (1.5 - p.life / p.max * 0.5));
          g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'ring': {
          g.globalAlpha = a;
          g.strokeStyle = p.col; g.lineWidth = 1;
          g.beginPath(); g.arc(x + 0.5, y + 0.5, p.size * (1 - p.life / p.max) + 1, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'sprite': {
          if (!p.sprite) break;
          g.save(); g.translate(x, y); g.rotate(p.rot);
          g.drawImage(p.sprite, -p.sprite.width / 2 | 0, -p.sprite.height / 2 | 0);
          g.restore();
          break;
        }
        case 'text': break; // drawn by world overlay (font)
        case 'slash': {
          g.globalAlpha = a;
          g.strokeStyle = p.col; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, p.size, p.rot - 1.0, p.rot + 1.0); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        default: {
          g.fillStyle = p.col;
          const s = Math.max(1, Math.round(p.size));
          if (p.z > 0 && (p.kind === 'blood' || p.kind === 'water')) { g.globalAlpha = 0.3; g.fillRect(Math.round(p.x), Math.round(p.y), s, 1); g.globalAlpha = 1; }
          g.fillRect(x, y, s, p.kind === 'glass' || p.kind === 'paper' || p.kind === 'confetti' ? Math.max(1, s - 1) : s);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Decals: per-room render textures with a cap; oldest faded first (spec 4.8).
interface DecalRec { x: number; y: number; kind: ParticleKind | 'pool' | 'splat' | 'img' | 'scorch' | 'wet'; col: string; size: number; rot: number; img?: HTMLCanvasElement; }

interface RoomDecals { canvas: HTMLCanvasElement; g: Ctx; ox: number; oy: number; recs: DecalRec[]; }

const DECAL_CAP = PLATFORM === 'android' ? 220 : 420;

export class Decals {
  rooms = new Map<number, RoomDecals>();
  constructor(private roomDefs: RoomDef[], private roomAt: (x: number, y: number) => number) {}

  private room(id: number): RoomDecals | null {
    let r = this.rooms.get(id);
    if (r) return r;
    const def = this.roomDefs[id];
    if (!def) return null;
    const ox = (def.tx - 1) * TILE, oy = (def.ty - 1) * TILE;
    const c = makeCanvas((def.tw + 2) * TILE, (def.th + 2) * TILE);
    r = { canvas: c, g: ctx2d(c), ox, oy, recs: [] };
    this.rooms.set(id, r);
    return r;
  }

  stamp(p: Particle): void {
    const id = p.roomId >= 0 ? p.roomId : this.roomAt(p.x, p.y);
    if (id < 0) return;
    this.add(id, { x: p.x, y: p.y, kind: p.kind, col: p.col, size: p.size, rot: p.rot, img: p.sprite });
  }

  add(roomId: number, d: DecalRec): void {
    const r = this.room(roomId);
    if (!r) return;
    r.recs.push(d);
    if (r.recs.length > DECAL_CAP) {
      r.recs.splice(0, Math.floor(DECAL_CAP * 0.25));
      r.g.clearRect(0, 0, r.canvas.width, r.canvas.height);
      for (const q of r.recs) this.draw(r, q);
    } else this.draw(r, d);
  }

  /** Big blood pool / splat at a point. */
  splat(roomId: number, x: number, y: number, size: number, col = BLOOD[0], kind: DecalRec['kind'] = 'splat'): void {
    this.add(roomId, { x, y, kind, col, size, rot: fxRng.range(0, Math.PI * 2) });
  }

  private draw(r: RoomDecals, d: DecalRec): void {
    const g = r.g;
    const x = Math.round(d.x - r.ox), y = Math.round(d.y - r.oy);
    switch (d.kind) {
      case 'splat': case 'pool': case 'wet': case 'scorch': {
        // irregular pixel blob
        const n = Math.max(3, Math.round(d.size * 1.6));
        const rng = fxRng;
        g.fillStyle = d.col;
        if (d.kind === 'wet' || d.kind === 'scorch') g.globalAlpha = 0.45;
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2), rr = rng.range(0, d.size);
          const s = Math.max(1, Math.round(rng.range(1, d.size * 0.7)));
          g.fillRect(Math.round(x + Math.cos(a) * rr - s / 2), Math.round(y + Math.sin(a) * rr * 0.7 - s / 2), s, Math.max(1, Math.round(s * 0.8)));
        }
        if (d.kind === 'pool') {
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fillRect(x - 1, y - 1, 2, 1);
        }
        g.globalAlpha = 1;
        break;
      }
      case 'sprite': case 'img': {
        if (!d.img) break;
        g.save(); g.translate(x, y); g.rotate(d.rot);
        g.drawImage(d.img, -d.img.width / 2 | 0, -d.img.height / 2 | 0);
        g.restore();
        break;
      }
      default: {
        g.fillStyle = d.col;
        const s = Math.max(1, Math.round(d.size));
        g.fillRect(x, y, s, s);
      }
    }
  }

  render(g: Ctx, visibleRooms: Iterable<number>): void {
    for (const id of visibleRooms) {
      const r = this.rooms.get(id);
      if (r) g.drawImage(r.canvas, r.ox, r.oy);
    }
  }
}

// ---------------------------------------------------------------------------
// Gore helpers (respect the gore setting).
export function goreLevel(): 0 | 1 | 2 { const s = app.settings.gore; return s === 'off' ? 0 : s === 'reduced' ? 1 : 2; }

export function bloodBurst(parts: Particles, x: number, y: number, dir: number, amount: number, roomId: number, height = 14): void {
  const gl = goreLevel();
  if (gl === 0) {
    // Gore off: paperwork confetti instead of blood
    for (let i = 0; i < Math.min(8, amount); i++) {
      const a = dir + fxRng.range(-1, 1), sp = fxRng.range(30, 90);
      parts.spawn({ kind: 'paper', x, y, z: height * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: fxRng.range(20, 60), gravity: 160, life: 0.8, col: fxRng.pick(['#f4f1e8', '#dcd6c8', '#bcd4e6']), size: 2, roomId });
    }
    return;
  }
  const n = Math.round(amount * (gl === 1 ? 0.4 : 1));
  for (let i = 0; i < n; i++) {
    const a = dir + fxRng.range(-0.8, 0.8), sp = fxRng.range(20, 140);
    parts.spawn({ kind: 'blood', x, y, z: fxRng.range(height * 0.4, height), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: fxRng.range(-10, 70), gravity: 260, life: 2, col: fxRng.pick(BLOOD), size: fxRng.chance(0.25) ? 2 : 1, toDecal: true, roomId });
  }
}

export function gibBurst(parts: Particles, gibs: HTMLCanvasElement[], x: number, y: number, dir: number, roomId: number, force = 1): void {
  if (goreLevel() < 2) return;
  gibs.forEach((img, i) => {
    if (i === 1 && fxRng.chance(0.5)) return; // torso sometimes stays
    const a = dir + fxRng.range(-1.1, 1.1), sp = fxRng.range(40, 150) * force;
    parts.spawn({ kind: 'sprite', sprite: img, x, y, z: fxRng.range(8, 22), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: fxRng.range(40, 120), gravity: 300, life: 3, rot: fxRng.range(0, 6), vr: fxRng.range(-14, 14), toDecal: true, roomId, bounce: 0.3 });
  });
  bloodBurst(parts, x, y, dir, 26, roomId);
}

export function sparks(parts: Particles, x: number, y: number, n: number, col = '#ffe9a0', speed = 120): void {
  for (let i = 0; i < n; i++) {
    const a = fxRng.range(0, Math.PI * 2), sp = fxRng.range(speed * 0.3, speed);
    parts.spawn({ kind: 'spark', x, y, z: 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: fxRng.range(0.15, 0.4), col, size: 1, drag: 6 });
  }
}

export function smokePuff(parts: Particles, x: number, y: number, n: number, col = '#d8dce0', size = 6): void {
  for (let i = 0; i < n; i++) {
    const a = fxRng.range(0, Math.PI * 2), sp = fxRng.range(5, 40);
    parts.spawn({ kind: 'smoke', x: x + fxRng.range(-4, 4), y: y + fxRng.range(-4, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, life: fxRng.range(0.6, 1.4), col, size: fxRng.range(size * 0.6, size), drag: 2 });
  }
}

export function debrisBurst(parts: Particles, x: number, y: number, n: number, cols: string[], roomId: number, kind: ParticleKind = 'debris'): void {
  for (let i = 0; i < n; i++) {
    const a = fxRng.range(0, Math.PI * 2), sp = fxRng.range(30, 160);
    parts.spawn({ kind, x, y, z: fxRng.range(4, 18), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: fxRng.range(20, 90), gravity: 320, life: fxRng.range(1.5, 3), col: fxRng.pick(cols), size: fxRng.chance(0.3) ? 2 : 1, toDecal: true, roomId, bounce: 0.25 });
  }
}
