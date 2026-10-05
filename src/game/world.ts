// The World: one floor's simulation — tiles, rooms (room-lock), doors, props, entities, pathing, rendering.
import { app } from '../core/app';
import type { Ctx, Sprite } from '../render/canvas';
import { drawSprite, makeCanvas, ctx2d } from '../render/canvas';
import { drawText, measure } from '../render/font';
import { Rng, fxRng } from '../core/rng';
import { Vec, clamp, dist, lerp, Rect, circleRect } from '../core/math';
import { FloorMap, PropDef, RoomDef, DoorDef, BreachDef, T, TILE, SOLID_TILES, PROJECTILE_BLOCKING, BREACHABLE_TILES, tileAt, footprint } from './world-types';
import { renderFloorBase, redrawTiles, propSprite, doorSprite, exitSprite, PropState, DoorState } from '../art/env';
import { Entity, Actor, DamageInfo } from './entity';
import { Telegraph, Shape, damage as applyDamage } from './combat';
import { Particles, Decals, bloodBurst, debrisBurst, sparks, goreLevel, smokePuff } from './fx';
import { GameBus } from './stats';
import { audio } from '../audio/audio';
import type { ExecType, PropKind } from '../data/ids';

// ---------------------------------------------------------------------------
// Prop behaviours (hazards, destructibles) are registered by kind (src/game/hazards.ts).
export interface PropRT {
  def: PropDef;
  hp: number;
  maxHp: number;
  state: PropState;
  solid: boolean;
  /** Generic timer / data slots for behaviours. */
  t: number;
  data: Record<string, any>;
  /** Execution object already used (spec 4.7: single-use). */
  used: boolean;
  /** Visual offset (topple/shake). */
  ox: number; oy: number; shake: number;
  /** Removed from the world entirely. */
  gone: boolean;
  spriteCache: Map<string, Sprite>;
}

export interface PropHit { amount: number; type: DamageInfo['type']; method: DamageInfo['method']; source?: Actor | null; dir?: number; heavy?: boolean; body?: boolean; }

export interface PropBehaviour {
  maxHp?: number;
  /** Called when the prop takes a hit. Default: subtract hp, damaged at 50%, destroyed at 0. Return true if handled. */
  onHit?(w: World, p: PropRT, hit: PropHit): boolean | void;
  onDestroyed?(w: World, p: PropRT, hit?: PropHit): void;
  update?(w: World, p: PropRT, dt: number): void;
  /** Actor walked into it (e.g. kicks swivel chairs). */
  onBump?(w: World, p: PropRT, a: Actor): void;
}
export const PROP_BEHAVIOURS: Partial<Record<PropKind, PropBehaviour>> = {};
export function registerProp(kind: PropKind | PropKind[], b: PropBehaviour): void {
  for (const k of Array.isArray(kind) ? kind : [kind]) PROP_BEHAVIOURS[k] = b;
}

// ---------------------------------------------------------------------------
// Cutscenes (executions, boss phase transitions): pause the rest of the simulation (spec 4.7, 6.1).
export interface Cutscene {
  /** Return true when finished. */
  update(dt: number): boolean;
  /** World-space overlay drawing. */
  render?(g: Ctx): void;
  /** Screen-space overlay drawing (letterbox, captions). */
  renderScreen?(g: Ctx): void;
  /** Camera override (world px). */
  camera?: Vec;
  zoom?: number;
}

export interface Interactable {
  x: number; y: number; r: number;
  label: string;
  enabled(): boolean;
  onInteract(): void;
  /** Shown above the prompt, e.g. a price. */
  sub?: string;
  priority?: number;
}

export interface RoomState {
  def: RoomDef;
  entered: boolean;
  locked: boolean;
  cleared: boolean;
  enemies: Set<Actor>;
  /** Merged encounter partner after a breach (spec 4.7). */
  mergedWith: number;
}

export interface DoorRT { def: DoorDef; state: DoorState; anim: number; }

export interface FloatText { x: number; y: number; text: string; col: string; t: number; max: number; vy: number; scale: number; }
export interface Subtitle { speaker: string; text: string; t: number; col: string; }
export interface Bubble { actor: Actor; text: string; t: number; }

export class World {
  map: FloorMap;
  bg: HTMLCanvasElement;
  bus = new GameBus();
  time = 0;
  rng: { combat: Rng; loot: Rng; spawns: Rng; cosmetic: Rng; events: Rng };

  entities: Entity[] = [];
  actors: Actor[] = [];
  telegraphs: Telegraph[] = [];
  particles: Particles;
  decals: Decals;
  props: PropRT[] = [];
  doors: DoorRT[] = [];
  rooms: RoomState[] = [];
  interactables: Interactable[] = [];
  floats: FloatText[] = [];
  subtitles: Subtitle[] = [];
  bubbles: Bubble[] = [];

  player!: Actor;
  currentRoom = -1;
  activeRooms = new Set<number>();
  cutscene: Cutscene | null = null;
  floorCleared = false;
  /** Bosses/scripted floors hold the clear until they finish. */
  holdClear = false;
  inCombat = false;
  /** Alarm floor: doors open, everyone hunts (spec 4.1). */
  alarm: boolean;
  /** Pathing: BFS distance field to the player (tiles). */
  flow: Int16Array;
  private flowFrom = -1;
  /** Tiles blocked by solid props (for pathing). */
  propBlock: Uint8Array;
  /** Lighting overlay. */
  private light: HTMLCanvasElement;
  private lightG: Ctx;
  darknessNow = 0;
  /** Extra global darkness (lights-out boss phases). */
  forcedDarkness = -1;
  tint: { col: string; a: number } | null = null;
  emergencyLights = false;
  onFloorCleared: (() => void) | null = null;
  onRoomCleared: ((roomId: number) => void) | null = null;
  onRoomLocked: ((roomId: number) => void) | null = null;
  /** Gameplay scene hooks for kills (rage, cash). */
  onKill: ((victim: Actor, info: DamageInfo) => void) | null = null;
  onHurt: ((victim: Actor, info: DamageInfo, amount: number, absorbed: number) => void) | null = null;
  /** Hit-stop request (seconds). */
  hitstop = 0;
  private exitSprites = new Map<string, Sprite>();

  constructor(map: FloorMap, rng: World['rng']) {
    this.map = map;
    this.rng = rng;
    this.alarm = map.req.alarm;
    this.bg = renderFloorBase(map);
    this.decals = new Decals(map.rooms, (x, y) => this.roomAt(x, y));
    this.particles = new Particles(this.decals);
    this.flow = new Int16Array(map.w * map.h).fill(-1);
    this.propBlock = new Uint8Array(map.w * map.h);
    this.light = makeCanvas(app.renderer.W, app.renderer.H);
    this.lightG = ctx2d(this.light);
    for (const r of map.rooms) this.rooms.push({ def: r, entered: false, locked: false, cleared: r.kind === 'core', enemies: new Set(), mergedWith: -1 });
    for (const d of map.doors) this.doors.push({ def: d, state: 'open', anim: 1 });
    for (const p of map.props) this.addProp(p);
    this.rebuildPropBlock();
  }

  addProp(def: PropDef): PropRT {
    const b = PROP_BEHAVIOURS[def.kind];
    const maxHp = b?.maxHp ?? (def.hazard || def.exec ? 30 : 0);
    const p: PropRT = { def, hp: maxHp, maxHp, state: 'intact', solid: def.solid && !def.wallMounted, t: 0, data: {}, used: false, ox: 0, oy: 0, shake: 0, gone: false, spriteCache: new Map() };
    this.props.push(p);
    return p;
  }

  rebuildPropBlock(): void {
    this.propBlock.fill(0);
    for (const p of this.props) {
      if (!p.solid || p.gone) continue;
      const f = footprint(p.def);
      const x0 = Math.floor((f.x + 2) / TILE), x1 = Math.floor((f.x + f.w - 2) / TILE);
      const y0 = Math.floor((f.y + 2) / TILE), y1 = Math.floor((f.y + f.h - 2) / TILE);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < this.map.w && y < this.map.h) this.propBlock[y * this.map.w + x] = 1;
    }
    this.flowFrom = -1;
  }

  // ---------------------------------------------------------------- entities
  add<E extends Entity>(e: E): E {
    e.world = this;
    this.entities.push(e);
    if (e instanceof Actor) this.actors.push(e);
    e.onAdded();
    return e;
  }

  telegraph(owner: Actor | null, shape: Shape, windup: number, onFire: (s: Shape) => void, opts?: Telegraph['opts']): Telegraph {
    const t = new Telegraph(owner, shape, windup, onFire, opts);
    this.telegraphs.push(t);
    return t;
  }

  damage(target: Actor, info: DamageInfo): number { return applyDamage(this, target, info); }

  // ---------------------------------------------------------------- tiles / collision
  tile(tx: number, ty: number): number { return tileAt(this.map, tx, ty); }
  roomAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return -1;
    const r = this.map.roomOf[ty * this.map.w + tx];
    if (r >= 0) return r;
    // door tiles belong to no room — use nearest neighbour
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = this.map.roomOf[(ty + dy) * this.map.w + tx + dx];
      if (q !== undefined && q >= 0) return q;
    }
    return -1;
  }

  doorAtTile(tx: number, ty: number): DoorRT | null {
    for (const d of this.doors) {
      const { tx: x, ty: y, orient, len } = d.def;
      if (orient === 'h' ? ty === y && tx >= x && tx < x + len : tx === x && ty >= y && ty < y + len) return d;
    }
    return null;
  }

  isSolidTile(tx: number, ty: number, forProjectile = false): boolean {
    const t = this.tile(tx, ty);
    if (t === T.DOOR) {
      const d = this.doorAtTile(tx, ty);
      return !!d && d.state !== 'open';
    }
    if (t === T.PIT) return !forProjectile;
    return forProjectile ? PROJECTILE_BLOCKING.has(t) : SOLID_TILES.has(t);
  }

  isWalkablePx(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return !this.isSolidTile(tx, ty) && !this.propBlock[ty * this.map.w + tx];
  }

  /** Move an actor with tile + solid prop collision (axis separated, circle vs AABB). Returns true if blocked. */
  moveActor(a: Actor, dx: number, dy: number): { hitX: boolean; hitY: boolean } {
    let hitX = false, hitY = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) { a.x += sx; if (this.collides(a)) { a.x -= sx; hitX = true; } }
      if (sy) { a.y += sy; if (this.collides(a)) { a.y -= sy; hitY = true; } }
    }
    return { hitX, hitY };
  }

  collides(a: Actor): boolean {
    const r = a.radius;
    const x0 = Math.floor((a.x - r) / TILE), x1 = Math.floor((a.x + r) / TILE);
    const y0 = Math.floor((a.y - r * 0.6) / TILE), y1 = Math.floor((a.y + r * 0.4) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.isSolidTile(tx, ty)) {
        if (circleRect(a.x, a.y, r * 0.8, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE })) return true;
      }
    }
    for (const p of this.props) {
      if (!p.solid || p.gone) continue;
      const f = footprint(p.def);
      if (a.x + r < f.x || a.x - r > f.x + f.w || a.y + r < f.y || a.y - r > f.y + f.h) continue;
      if (circleRect(a.x, a.y, r * 0.8, f)) return true;
    }
    return false;
  }

  /** Find the first prop solid at a point. */
  propAt(x: number, y: number, pad = 0): PropRT | null {
    for (const p of this.props) {
      if (p.gone || (!p.solid && !p.def.hazard)) continue;
      const f = footprint(p.def);
      if (x >= f.x - pad && x <= f.x + f.w + pad && y >= f.y - pad && y <= f.y + f.h + pad) return p;
    }
    return null;
  }

  /** Ray march (2 px steps). Returns the first blocking point (tile or prop) or null. */
  raycast(x0: number, y0: number, x1: number, y1: number, opts: { projectile?: boolean; props?: boolean } = {}): { x: number; y: number; tx: number; ty: number; prop: PropRT | null } | null {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / 3));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.isSolidTile(tx, ty, opts.projectile)) return { x, y, tx, ty, prop: null };
      if (opts.props !== false) {
        const p = this.propAt(x, y);
        if (p && p.solid && p.def.h >= 10) return { x, y, tx, ty, prop: p };
      }
    }
    return null;
  }

  los(a: Vec, b: Vec): boolean { return this.raycast(a.x, a.y - 6, b.x, b.y - 6, { projectile: true, props: false }) === null; }

  // ---------------------------------------------------------------- pathing (flow field to player)
  updateFlow(): void {
    const p = this.player;
    if (!p) return;
    const w = this.map.w;
    const start = Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE);
    if (start === this.flowFrom) return;
    this.flowFrom = start;
    const f = this.flow;
    f.fill(-1);
    const q = new Int32Array(this.map.w * this.map.h);
    let head = 0, tail = 0;
    q[tail++] = start; f[start] = 0;
    while (head < tail) {
      const c = q[head++];
      const cd = f[c];
      if (cd > 70) continue;
      const cx = c % w, cy = (c / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.map.h) continue;
        const ni = ny * w + nx;
        if (f[ni] >= 0 || this.isSolidTile(nx, ny) || this.propBlock[ni]) continue;
        f[ni] = cd + 1;
        q[tail++] = ni;
      }
    }
  }

  /** Steering direction (unit-ish) towards the player using the flow field (8-neighbour descent). */
  flowDir(x: number, y: number): Vec | null {
    const w = this.map.w;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = this.flow[ty * w + tx];
    let best = here < 0 ? 9999 : here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= this.map.h) continue;
      const v = this.flow[ny * w + nx];
      if (v < 0) continue;
      if (dx && dy) { // no corner cutting
        if (this.flow[ty * w + nx] < 0 || this.flow[ny * w + tx] < 0) continue;
      }
      const score = v + (dx && dy ? 0.4 : 0);
      if (score < best) { best = score; bx = dx; by = dy; }
    }
    if (!bx && !by) return null;
    // aim for the centre of the chosen tile
    const cx = (tx + bx + 0.5) * TILE, cy = (ty + by + 0.5) * TILE;
    const l = Math.hypot(cx - x, cy - y) || 1;
    return { x: (cx - x) / l, y: (cy - y) / l };
  }

  // ---------------------------------------------------------------- rooms / doors
  roomRect(id: number): Rect {
    const r = this.map.rooms[id];
    return { x: r.tx * TILE, y: r.ty * TILE, w: r.tw * TILE, h: r.th * TILE };
  }

  setRoomDoors(roomId: number, state: DoorState): void {
    for (const d of this.doors) {
      if (d.def.roomA === roomId || d.def.roomB === roomId) {
        if (d.state !== state) { d.state = state; d.anim = 0; }
      }
    }
    this.flowFrom = -1;
  }

  /** Register an enemy as belonging to a room (for room-lock clearing). */
  assignToRoom(a: Actor, roomId: number): void {
    const r = this.rooms[roomId];
    if (r) r.enemies.add(a);
  }

  /** Pending reinforcements per room (set by the spawner). */
  pendingFor: (roomId: number) => number = () => 0;

  liveEnemies(roomId: number): number {
    const r = this.rooms[roomId];
    if (!r) return 0;
    let n = 0;
    for (const e of r.enemies) if (e.alive) n++;
    return n;
  }

  totalLiveEnemies(): number { let n = 0; for (const a of this.actors) if (a.team === 'enemy' && a.alive && !(a as any).ignoreForClear) n++; return n; }

  private updateRooms(): void {
    const p = this.player;
    const rid = this.roomAt(p.x, p.y);
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const onDoor = this.tile(tx, ty) === T.DOOR;
    if (rid >= 0 && rid !== this.currentRoom && !onDoor) {
      this.currentRoom = rid;
    }
    // streaming: current + neighbours (spec 4.8 / 10.2)
    this.activeRooms.clear();
    if (this.currentRoom >= 0) {
      this.activeRooms.add(this.currentRoom);
      for (const n of this.map.rooms[this.currentRoom].neighbours) this.activeRooms.add(n);
      const m = this.rooms[this.currentRoom].mergedWith;
      if (m >= 0) { this.activeRooms.add(m); for (const n of this.map.rooms[m].neighbours) this.activeRooms.add(n); }
    }

    const cur = this.rooms[this.currentRoom];
    if (cur && !cur.entered && !onDoor) {
      // require the player to be a little inside before sealing
      const rr = this.roomRect(this.currentRoom);
      const inside = p.x > rr.x + 10 && p.x < rr.x + rr.w - 10 && p.y > rr.y + 12 && p.y < rr.y + rr.h - 6;
      if (inside) {
        cur.entered = true;
        if (this.liveEnemies(this.currentRoom) + this.pendingFor(this.currentRoom) > 0 && !this.alarm) {
          cur.locked = true;
          this.setRoomDoors(this.currentRoom, 'locked');
          for (const e of cur.enemies) (e as any).aware = true;
          audio.sfx('door_lock');
          this.bus.emit('roomLock', { roomId: this.currentRoom });
          this.onRoomLocked?.(this.currentRoom);
        } else if (this.liveEnemies(this.currentRoom) === 0 && !cur.cleared) {
          cur.cleared = true;
          this.bus.emit('roomClear', { roomId: this.currentRoom });
          this.onRoomCleared?.(this.currentRoom);
        }
      }
    }

    // clear checks
    for (const r of this.rooms) {
      if (r.cleared) continue;
      const id = r.def.id;
      const partner = r.mergedWith;
      const live = this.liveEnemies(id) + this.pendingFor(id) + (partner >= 0 ? this.liveEnemies(partner) + this.pendingFor(partner) : 0);
      if ((r.locked || (this.alarm && r.entered) || (r.entered && !r.locked)) && live === 0) {
        r.cleared = true;
        if (r.locked) { r.locked = false; this.setRoomDoors(id, 'open'); audio.sfx('door_unlock'); }
        this.bus.emit('roomClear', { roomId: id });
        this.onRoomCleared?.(id);
        if (partner >= 0 && !this.rooms[partner].cleared) {
          const pr = this.rooms[partner];
          pr.cleared = true; pr.entered = true;
          if (pr.locked) { pr.locked = false; this.setRoomDoors(partner, 'open'); }
          this.bus.emit('roomClear', { roomId: partner });
          this.onRoomCleared?.(partner);
        }
      }
    }
    // alarm floors: rooms with no live enemies count as clear once the floor's enemies are dead
    const anyLocked = this.rooms.some((r) => r.locked);
    this.inCombat = anyLocked || (this.alarm && this.totalLiveEnemies() > 0);

    if (!this.floorCleared && !this.holdClear && this.totalLiveEnemies() === 0 && this.rooms.every((r) => r.cleared || (this.liveEnemies(r.def.id) + this.pendingFor(r.def.id)) === 0)) {
      this.floorCleared = true;
      for (const r of this.rooms) { r.cleared = true; r.locked = false; }
      for (const d of this.doors) d.state = 'open';
      this.flowFrom = -1;
      this.bus.emit('floorClear', { floor: this.map.req.floorNumber });
      this.onFloorCleared?.();
    }
  }

  /** Spec 4.7 breach: smash a partition segment, merge two rooms into one sealed encounter. */
  breach(b: BreachDef, at: Vec, dir: number): void {
    for (const [tx, ty] of b.tiles) this.map.tiles[ty * this.map.w + tx] = T.RUBBLE;
    const xs = b.tiles.map((t) => t[0]), ys = b.tiles.map((t) => t[1]);
    redrawTiles(this.map, this.bg, Math.min(...xs) - 1, Math.min(...ys) - 2, Math.max(...xs) + 1, Math.max(...ys) + 2);
    this.map.breaches = this.map.breaches.filter((q) => q !== b);
    this.flowFrom = -1;
    const cols = b.material === 'glass' ? ['#cfe8f4', '#9fd0e6', '#ffffff'] : b.material === 'cubicle' ? ['#6a7080', '#8a90a0', '#c8c0b0'] : ['#e0dccf', '#c9c2b0', '#9c968a'];
    for (const [tx, ty] of b.tiles) debrisBurst(this.particles, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 10, cols, this.roomAt(at.x + Math.cos(dir) * 20, at.y + Math.sin(dir) * 20), b.material === 'glass' ? 'glass' : 'debris');
    smokePuff(this.particles, at.x, at.y, 8, '#d8d0c0', 7);
    audio.sfx(b.material === 'glass' ? 'glass_shatter' : 'wall_breach', { x: at.x, y: at.y });
    app.renderer.shake(5, 0.35);
    // merge encounter
    const A = this.rooms[b.roomA], B = this.rooms[b.roomB];
    A.mergedWith = b.roomB; B.mergedWith = b.roomA;
    const target = this.currentRoom === b.roomA ? B : A;
    const stunMult = (this as any).breachStunMult ?? 1;
    for (const e of target.enemies) {
      if (!e.alive) continue;
      (e as any).aware = true;
      if (dist(e, at) < 90) e.status.stun = Math.max(e.status.stun, 1.2 * stunMult);
    }
    if (!target.cleared && this.liveEnemies(target.def.id) > 0) {
      target.entered = true; target.locked = true;
      this.setRoomDoors(target.def.id, 'locked');
      const here = this.rooms[this.currentRoom];
      if (here && !here.locked && !here.cleared) { here.locked = true; this.setRoomDoors(here.def.id, 'locked'); }
    }
    this.bus.emit('breach', { roomA: b.roomA, roomB: b.roomB });
  }

  breachAtTile(tx: number, ty: number): BreachDef | null {
    if (!BREACHABLE_TILES.has(this.tile(tx, ty))) return null;
    for (const b of this.map.breaches) for (const [x, y] of b.tiles) if (x === tx && y === ty) return b;
    return null;
  }

  /** Smash an exterior window tile (and its run of window tiles nearby). */
  smashWindow(tx: number, ty: number): void {
    const t = this.tile(tx, ty);
    if (t !== T.WINDOW && t !== T.WINDOW_SEALED) return;
    this.map.tiles[ty * this.map.w + tx] = T.WINDOW_BROKEN;
    redrawTiles(this.map, this.bg, tx - 1, ty - 2, tx + 1, ty + 2);
    debrisBurst(this.particles, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 16, ['#cfe8f4', '#9fd0e6', '#ffffff'], this.roomAt((tx + 0.5) * TILE, (ty + 1.5) * TILE), 'glass');
    audio.sfx('window_smash', { x: tx * TILE, y: ty * TILE });
  }

  // ---------------------------------------------------------------- props
  hitProp(p: PropRT, hit: PropHit): void {
    if (p.gone) return;
    const b = PROP_BEHAVIOURS[p.def.kind];
    p.shake = 0.15;
    if (b?.onHit && b.onHit(this, p, hit)) return;
    if (p.maxHp <= 0 || p.state === 'destroyed') return;
    p.hp -= hit.amount;
    if (p.hp <= 0) {
      p.hp = 0;
      this.setPropState(p, 'destroyed');
      b?.onDestroyed?.(this, p, hit);
    } else if (p.hp < p.maxHp * 0.5 && p.state === 'intact') this.setPropState(p, 'damaged');
  }

  setPropState(p: PropRT, s: PropState): void {
    p.state = s;
    if (s === 'destroyed' && p.def.kind !== 'filing_cabinet') { if (p.solid && p.def.h < 18) { p.solid = false; this.rebuildPropBlock(); } }
  }

  propSpriteFor(p: PropRT): Sprite {
    const key = p.state;
    let s = p.spriteCache.get(key);
    if (!s) { s = propSprite(p.def, p.state); p.spriteCache.set(key, s); }
    return s;
  }

  propsNear(x: number, y: number, r: number, filter?: (p: PropRT) => boolean): PropRT[] {
    const out: PropRT[] = [];
    for (const p of this.props) {
      if (p.gone) continue;
      if (Math.abs(p.def.x - x) > r + p.def.w / 2 || Math.abs(p.def.y - p.def.h / 2 - y) > r + p.def.h / 2) continue;
      if (!filter || filter(p)) out.push(p);
    }
    return out;
  }

  /** Execution object or window near a point (spec 4.7). */
  findExecutionTarget(x: number, y: number, range: number): { type: ExecType; prop: PropRT | null; tile: [number, number] | null } | null {
    let best: { type: ExecType; prop: PropRT | null; tile: [number, number] | null; d: number } | null = null;
    for (const p of this.props) {
      if (p.gone || p.used || !p.def.exec || p.state === 'destroyed') continue;
      const d = Math.hypot(p.def.x - x, p.def.y - p.def.h / 2 - y) - Math.max(p.def.w, p.def.h) / 2;
      if (d < range && (!best || d < best.d)) best = { type: p.def.exec, prop: p, tile: null, d };
    }
    // windows
    const tx0 = Math.floor((x - range) / TILE), tx1 = Math.floor((x + range) / TILE);
    const ty0 = Math.floor((y - range - 8) / TILE), ty1 = Math.floor((y + range) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = this.tile(tx, ty);
      if (t !== T.WINDOW && t !== T.WINDOW_BROKEN && !(t === T.WINDOW_SEALED && (this as any).weakened?.has(ty * this.map.w + tx))) continue;
      const d = Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) - 8;
      if (d < range && (!best || d < best.d)) best = { type: 'defenestration', prop: null, tile: [tx, ty], d };
    }
    return best;
  }

  // ---------------------------------------------------------------- damage hooks (called by combat.damage)
  onDamaged(target: Actor, info: DamageInfo, amount: number, absorbed: number, dir: number): void {
    const room = this.roomAt(target.x, target.y);
    if (amount > 0 && !info.silent) {
      const sharp = info.type === 'sharp' || info.type === 'cut';
      if (target.team !== 'neutral' && info.type !== 'electric') bloodBurst(this.particles, target.x, target.y, dir, sharp ? 10 : 6, room, target.height * 0.6);
      if (info.type === 'electric') sparks(this.particles, target.x, target.y - 12, 8, '#9fe8ff');
      const gl = goreLevel();
      if (gl > 0 && amount > 8 && fxRng.chance(0.5)) this.decals.splat(room, target.x + Math.cos(dir) * 6, target.y + Math.sin(dir) * 4, 2 + amount * 0.06);
    }
    if (absorbed > 0 && !info.silent) sparks(this.particles, target.x, target.y - 12, 4, '#9fe0ff', 60);
    // damage numbers (enemies only, small)
    if (target.team === 'enemy' && !info.silent && amount + absorbed >= 1) {
      this.floatText(target.x + fxRng.range(-4, 4), target.y - target.height - 4, String(Math.round(amount + absorbed)), info.crit ? '#ffd34d' : absorbed > 0 && amount === 0 ? '#9fe0ff' : '#ffffff', info.crit ? 2 : 1);
    }
    if (info.method === 'melee' || info.method === 'heavy' || info.method === 'body' || info.method === 'throw') {
      if (app.settings.hitStop) this.hitstop = Math.max(this.hitstop, info.method === 'heavy' || info.crit ? 0.085 : 0.045);
    }
    this.onHurt?.(target, info, amount, absorbed);
  }

  onKilled(victim: Actor, info: DamageInfo, dir: number): void {
    void dir;
    this.onKill?.(victim, info);
  }

  // ---------------------------------------------------------------- text overlays
  floatText(x: number, y: number, text: string, col = '#fff', scale = 1, life = 0.7): void {
    this.floats.push({ x, y, text, col, t: life, max: life, vy: -28, scale });
  }

  /** Subtitled bark (spec 9.3 accessibility) + speech bubble. */
  say(actor: Actor, speaker: string, text: string, col = '#ffd9a0'): void {
    this.bubbles = this.bubbles.filter((b) => b.actor !== actor);
    this.bubbles.push({ actor, text, t: 2.4 });
    if (this.bubbles.length > 3) this.bubbles.shift();
    this.subtitles.push({ speaker, text, t: 3.2, col });
    if (this.subtitles.length > 3) this.subtitles.shift();
    this.bus.emit('bark', { speaker: actor, text });
  }

  // ---------------------------------------------------------------- update
  update(dt: number): void {
    if (this.cutscene) {
      if (this.cutscene.update(dt)) this.cutscene = null;
      this.particles.update(dt);
      this.updateFloats(dt);
      return;
    }
    this.time += dt;
    this.updateFlow();
    // entities
    for (const e of this.entities) {
      if (e.dead) continue;
      if (!e.persist && !(e === this.player)) {
        const rid = this.roomAt(e.x, e.y);
        if (rid >= 0 && !this.activeRooms.has(rid) && !this.alarm) continue; // suspended (spec 4.8)
      }
      e.update(dt);
    }
    this.separateActors();
    for (const t of this.telegraphs) t.update(dt);
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
    for (const p of this.props) {
      if (p.gone) continue;
      if (p.shake > 0) p.shake = Math.max(0, p.shake - dt);
      const b = PROP_BEHAVIOURS[p.def.kind];
      if (b?.update) b.update(this, p, dt);
    }
    for (const d of this.doors) d.anim = Math.min(1, d.anim + dt * 5);
    this.particles.update(dt);
    this.updateFloats(dt);
    this.updateRooms();
    // remove dead
    if (this.entities.some((e) => e.dead)) {
      for (const e of this.entities) if (e.dead) e.onRemoved();
      this.entities = this.entities.filter((e) => !e.dead);
      this.actors = this.actors.filter((a) => !a.dead);
    }
  }

  private updateFloats(dt: number): void {
    for (const f of this.floats) { f.t -= dt; f.y += f.vy * dt; f.vy *= 0.92; }
    this.floats = this.floats.filter((f) => f.t > 0);
    for (const s of this.subtitles) s.t -= dt;
    this.subtitles = this.subtitles.filter((s) => s.t > 0);
    for (const b of this.bubbles) b.t -= dt;
    this.bubbles = this.bubbles.filter((b) => b.t > 0 && !b.actor.dead);
  }

  private separateActors(): void {
    const A = this.actors;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!a.alive || a.ghost || a.grabbedBy || a.thrown) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        if (!b.alive || b.ghost || b.grabbedBy || b.thrown) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.radius + b.radius - 1;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        this.moveActor(a, -nx * push * wa * 2, -ny * push * wa * 2);
        this.moveActor(b, nx * push * wb * 2, ny * push * wb * 2);
      }
    }
  }

  // ---------------------------------------------------------------- camera
  camTarget: Vec = { x: 0, y: 0 };
  updateCamera(dt: number, lead: Vec): void {
    const r = app.renderer;
    let tx: number, ty: number, zoom = 1;
    if (this.cutscene?.camera) { tx = this.cutscene.camera.x; ty = this.cutscene.camera.y; zoom = this.cutscene.zoom ?? 1; }
    else { tx = this.player.x + lead.x; ty = this.player.y - 10 + lead.y; }
    const mw = this.map.w * TILE, mh = this.map.h * TILE;
    const vw = r.W / zoom, vh = r.H / zoom;
    tx = mw <= vw ? mw / 2 : clamp(tx, vw / 2, mw - vw / 2);
    ty = mh <= vh ? mh / 2 : clamp(ty, vh / 2, mh - vh / 2);
    const k = Math.min(1, dt * (this.cutscene ? 6 : 9));
    r.camX = lerp(r.camX, tx, k);
    r.camY = lerp(r.camY, ty, k);
    r.zoom = lerp(r.zoom, zoom, Math.min(1, dt * 8));
    if (Math.abs(r.zoom - 1) < 0.01 && zoom === 1) r.zoom = 1;
  }

  snapCamera(): void {
    const r = app.renderer;
    r.camX = this.player.x; r.camY = this.player.y;
    this.updateCamera(1, { x: 0, y: 0 });
  }

  // ---------------------------------------------------------------- render
  render(): void {
    const r = app.renderer;
    const g = r.beginWorld('#07080a');
    const vx = r.viewX(), vy = r.viewY();
    // background (only the visible region)
    const sx = clamp(vx, 0, this.bg.width), sy = clamp(vy, 0, this.bg.height);
    const sw = Math.min(r.W, this.bg.width - sx), sh = Math.min(r.H, this.bg.height - sy);
    if (sw > 0 && sh > 0) g.drawImage(this.bg, sx, sy, sw, sh, sx, sy, sw, sh);

    const visible = new Set<number>();
    for (const room of this.map.rooms) {
      const rr = this.roomRect(room.id);
      if (rr.x + rr.w + 32 > vx && rr.x - 32 < vx + r.W && rr.y + rr.h + 32 > vy && rr.y - 32 < vy + r.H) visible.add(room.id);
    }
    this.decals.render(g, visible);

    // wall-mounted props and floor layer entities
    const inView = (x: number, y: number, m = 64) => x > vx - m && x < vx + r.W + m && y > vy - m && y < vy + r.H + m + 40;
    for (const p of this.props) if (!p.gone && p.def.wallMounted && inView(p.def.x, p.def.y)) drawSprite(g, this.propSpriteFor(p), p.def.x, p.def.y);
    for (const e of this.entities) if (e.layer === 0 && inView(e.x, e.y)) e.render(g);
    // corpses
    for (const a of this.actors) if (a.corpse && inView(a.x, a.y)) a.render(g);
    // telegraph fills (below live actors, above gore — spec 1.2/9.1)
    for (const t of this.telegraphs) t.render(g);
    this.particles.render(g, false);

    // y-sorted: props, doors, exits, live actors
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const p of this.props) {
      if (p.gone || p.def.wallMounted || !inView(p.def.x, p.def.y)) continue;
      const sp = this.propSpriteFor(p);
      const shake = p.shake > 0 ? Math.round(Math.sin(this.time * 80) * 1) : 0;
      list.push({ y: p.def.y, draw: () => drawSprite(g, sp, p.def.x + p.ox + shake, p.def.y + p.oy) });
    }
    for (const d of this.doors) {
      if (d.state === 'open' && d.anim >= 1) continue;
      const { tx, ty, orient, len } = d.def;
      if (!inView(tx * TILE, ty * TILE)) continue;
      const sp = doorSprite(orient, len, d.state === 'open' ? 'closed' : d.state);
      const a = d.state === 'open' ? 1 - d.anim : d.anim;
      list.push({ y: (ty + (orient === 'h' ? 1 : len)) * TILE - 1, draw: () => { g.globalAlpha = a; drawSprite(g, sp, tx * TILE, ty * TILE); g.globalAlpha = 1; } });
    }
    for (const ex of this.map.exits) {
      if (!inView(ex.x, ex.y)) continue;
      const open = this.floorCleared && ex.available;
      const key = ex.kind + ex.available + open;
      let sp = this.exitSprites.get(key);
      if (!sp) { sp = exitSprite(ex.kind, ex.available, open); this.exitSprites.set(key, sp); }
      list.push({ y: ex.y - 14, draw: () => drawSprite(g, sp!, ex.x, ex.y - 12) });
    }
    for (const e of this.entities) {
      if (e.layer !== 1 || (e instanceof Actor && e.corpse) || !inView(e.x, e.y)) continue;
      list.push({ y: e.sortY(), draw: () => e.render(g) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    for (const e of this.entities) if (e.layer === 2 && inView(e.x, e.y)) e.render(g);
    this.particles.render(g, true);
    // telegraph outlines again on top so bodies never obscure them
    g.globalAlpha = 0.6;
    for (const t of this.telegraphs) t.render(g);
    g.globalAlpha = 1;

    this.renderLighting(g, vx, vy);
    this.cutscene?.render?.(g);

    // floating text & bubbles
    for (const f of this.floats) drawText(g, f.text, f.x, f.y, { color: f.col, align: 'center', scale: f.scale, outline: '#0b0c10', alpha: Math.min(1, f.t / f.max * 2) });
    for (const b of this.bubbles) {
      const a = b.actor;
      if (!inView(a.x, a.y)) continue;
      const text = b.text.length > 34 ? b.text.slice(0, 33) + '…' : b.text;
      const w = measure(text) + 6;
      const bx = Math.round(a.x - w / 2), by = Math.round(a.y - a.height - 20);
      g.globalAlpha = Math.min(1, b.t * 3);
      g.fillStyle = '#f6f3ea'; g.fillRect(bx, by, w, 12);
      g.fillStyle = '#1a1a1e'; g.fillRect(bx, by - 1, w, 1); g.fillRect(bx, by + 12, w, 1); g.fillRect(bx - 1, by, 1, 12); g.fillRect(bx + w, by, 1, 12);
      g.fillStyle = '#f6f3ea'; g.fillRect(Math.round(a.x) - 1, by + 12, 3, 2);
      drawText(g, text, bx + 3, by + 2, { color: '#1a1a1e', shadow: null });
      g.globalAlpha = 1;
    }
    r.endWorld();
    this.cutscene?.renderScreen?.(r.f);
  }

  private renderLighting(g: Ctx, vx: number, vy: number): void {
    const r = app.renderer;
    const room = this.map.rooms[this.currentRoom];
    let target = room ? room.darkness : 0;
    if (this.forcedDarkness >= 0) target = this.forcedDarkness;
    this.darknessNow = lerp(this.darknessNow, target, 0.06);
    const reduced = app.settings.reducedLights;
    if (this.darknessNow > 0.02) {
      if (this.light.width !== r.W || this.light.height !== r.H) { this.light = makeCanvas(r.W, r.H); this.lightG = ctx2d(this.light); }
      const L = this.lightG;
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, r.W, r.H);
      L.fillStyle = `rgba(4,6,14,${this.darknessNow.toFixed(3)})`;
      L.fillRect(0, 0, r.W, r.H);
      L.globalCompositeOperation = 'destination-out';
      const lights: { x: number; y: number; radius: number; intensity: number }[] = [];
      for (const id of this.activeRooms) for (const l of this.map.rooms[id].lights) lights.push(l);
      lights.push({ x: this.player.x, y: this.player.y - 10, radius: 56, intensity: 0.75 });
      const max = reduced ? 4 : 8; // spec 10.4
      lights.sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y));
      for (const l of lights.slice(0, max + 1)) {
        let inten = l.intensity;
        const fl = (l as any).flicker as string | undefined;
        if (!reduced && fl === 'fluorescent' && Math.sin(this.time * 37 + l.x) > 0.97) inten *= 0.3;
        if (!reduced && fl === 'spark') inten *= 0.6 + 0.4 * Math.abs(Math.sin(this.time * 23 + l.y));
        if (!reduced && fl === 'candle') inten *= 0.85 + 0.15 * Math.sin(this.time * 9 + l.x);
        const x = l.x - vx, y = l.y - vy;
        const grd = L.createRadialGradient(x, y, 0, x, y, l.radius);
        grd.addColorStop(0, `rgba(0,0,0,${Math.min(1, inten)})`);
        grd.addColorStop(0.6, `rgba(0,0,0,${Math.min(1, inten) * 0.55})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = grd;
        L.fillRect(x - l.radius, y - l.radius, l.radius * 2, l.radius * 2);
      }
      g.drawImage(this.light, vx, vy);
      // coloured glow
      if (!reduced) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (const id of this.activeRooms) for (const l of this.map.rooms[id].lights) {
          if (Math.abs(l.x - this.player.x) > r.W || Math.abs(l.y - this.player.y) > r.H) continue;
          const grd = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius * 0.5);
          grd.addColorStop(0, hexA(l.color, 0.10 * l.intensity));
          grd.addColorStop(1, hexA(l.color, 0));
          g.fillStyle = grd;
          g.fillRect(l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
        }
        g.restore();
      }
    }
    if (this.emergencyLights || (this.alarm && !this.floorCleared)) {
      const a = 0.08 + 0.06 * Math.sin(this.time * 4);
      g.fillStyle = `rgba(255,30,20,${a.toFixed(3)})`;
      g.fillRect(vx, vy, r.W, r.H);
    }
    if (this.tint) { g.fillStyle = hexA(this.tint.col, this.tint.a); g.fillRect(vx, vy, r.W, r.H); }
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}
