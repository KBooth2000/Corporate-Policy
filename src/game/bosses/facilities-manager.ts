// Act 1 boss (spec 6.2): Gordon Pike, Facilities Manager — floor 5, basement plant room.
// P1 plant room: giant-wrench swings, lunges, slams that burst pipes, whistles in Caretakers; slip him on wet floors.
// P2 fire alarm: sprinklers (room-wide slow, water conducts), sparking panels; hurls toolboxes; kicks panels to
//    electrify puddles — bait his follow-up lunge through the live water.
// P3 lights out: emergency lighting; charges on a ride-on floor scrubber — dodge so he crashes into walls.
// Finisher: boiler execution.
import { BOSS_FLOORS } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import type { FloorRequest, LightDef } from '../world-types';
import { TILE } from '../world-types';
import { Boss, Layer, ScriptOpts, ScriptCutscene, easeOut, easeIn, clamp, lerp, angleTo, dist, fromAngle } from './boss';
import { buildArena, Grid, coreLobby, lobbyDoor, ArenaMap, mark, roomOfMark } from './arena';
import { MAT } from '../gen/materials';
import { facilitiesArt, scrubberSprite } from '../../art/bosses/facilities';
import { boilerSprite, panelSprite, beaconSprite, toolboxSprite, hatchSprite, hardhatSprite, pxEllipse } from '../../art/bosses/props';
import type { Ctx } from '../../render/canvas';
import { drawSprite, drawSpriteRot } from '../../render/canvas';
import type { Actor } from '../entity';
import { Entity } from '../entity';
import { audio } from '../../audio/audio';
import { app } from '../../core/app';
import { fxRng } from '../../core/rng';
import { sparks, smokePuff, debrisBurst, bloodBurst, goreLevel } from '../fx';
import type { PropRT } from '../world';
import type { Vec } from '../../core/math';

// ------------------------------------------------------------------ arena
function buildMap(req: FloorRequest): ArenaMap {
  const g = new Grid(50, 24, ' ');
  g.room(13, 0, 48, 23, '#', '.');
  coreLobby(g, 0, 4);
  lobbyDoor(g, 9, 11);
  g.set(31, 12, 'a'); g.set(31, 6, 'b'); g.set(16, 21, 'h'); g.set(45, 21, 'h'); g.set(44, 18, 's');
  for (const [x, y] of [[22, 8], [40, 8], [24, 16], [38, 16], [31, 19], [17, 13], [45, 12]]) g.set(x, y, 'w');
  const warm = (x: number, y: number): LightDef => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 120, color: '#f1f6e4', intensity: 0.95, flicker: 'fluorescent' });
  return buildArena(req, {
    rows: g.rows(), roomMarks: ['a'],
    rooms: [
      { kind: 'core' },
      { kind: 'boss', material: MAT.CONCRETE, darkness: 0.32, lights: [warm(20, 6), warm(31, 5), warm(42, 6), warm(20, 17), warm(31, 18), warm(42, 17)] },
    ],
    props: [
      { kind: 'boss_boiler', tx: 29, ty: 1, fw: 4, fh: 2, cw: 60, ch: 28, solid: true },
      { kind: 'boss_panel', tx: 17, ty: 1, fw: 1, fh: 1, cw: 16, ch: 10, solid: true },
      { kind: 'boss_panel', tx: 23, ty: 1, fw: 1, fh: 1, cw: 16, ch: 10, solid: true },
      { kind: 'boss_panel', tx: 39, ty: 1, fw: 1, fh: 1, cw: 16, ch: 10, solid: true },
      { kind: 'boss_panel', tx: 45, ty: 1, fw: 1, fh: 1, cw: 16, ch: 10, solid: true },
      { kind: 'toolbox', tx: 15, ty: 3, solid: false },
      { kind: 'mop_bucket', tx: 46, ty: 4, solid: false },
      { kind: 'cable_reel', tx: 15, ty: 16 },
      { kind: 'ladder', tx: 47, ty: 9 },
    ],
  });
}

interface Puddle { x: number; y: number; r: number; grow: number; elec: number; tick: Map<number, number>; shocked: boolean; life: number }

// ------------------------------------------------------------------ the boss
class FacilitiesManager extends Boss {
  map: ArenaMap;
  puddles: Puddle[] = [];
  panels: PropRT[] = [];
  boiler: PropRT | null = null;
  whistleCd = 5;
  lunge: { ang: number; t: number; dur: number; hit: boolean; speed: number } | null = null;
  charge: { ang: number; t: number; hit: boolean } | null = null;
  toPanel: PropRT | null = null;
  sprinklers = false;
  riding = false;
  parked: Vec;
  parkedVisible = true;
  crashedAt: Vec | null = null;
  headlight: LightDef = { x: 0, y: 0, radius: 90, color: '#fff6c8', intensity: 0.95, flicker: 'none' };
  teleLights: LightDef[] = [];
  beaconsOn = false;
  hatchT = [0, 0];
  actions = 0;
  boilerState: 'idle' | 'open' | 'blast' = 'idle';
  boilerFrame = 0;

  constructor(s: GameplayScene, map: ArenaMap) {
    const b = mark(map, 'b');
    super(s, { id: 'facilities_manager', act: 1, maxHp: 900, art: facilitiesArt(), radius: 11, height: 64, speed: 50, phases: 3, arenaRoom: roomOfMark(map, 'a'), accent: '#f0c232' }, b.x, b.y);
    this.map = map;
    this.parked = mark(map, 's');
    this.phaseNames = ['The Plant Room', 'Fire Alarm', 'Lights Out'];
    this.phaseExecCaptions = ['TICKET ESCALATED', 'OUT OF ORDER'];
    this.voiceSeed = 0xf00d;
  }

  override onAdded(): void {
    super.onAdded();
    const w = this.w;
    for (const p of w.props) {
      if ((p.def.kind as string) === 'boss_panel') { this.panels.push(p); p.spriteCache.set('intact', panelSprite('ok')); p.spriteCache.set('damaged', panelSprite('ok')); p.spriteCache.set('active', panelSprite('open', 0)); p.spriteCache.set('destroyed', panelSprite('dead')); p.spriteCache.set('used', panelSprite('dead')); }
      if ((p.def.kind as string) === 'boss_boiler') { this.boiler = p; for (const st of ['intact', 'damaged', 'destroyed', 'active', 'used'] as const) p.spriteCache.set(st, boilerSprite('idle')); }
    }
    for (const m of this.map.marks.w ?? []) this.addPuddle(m.x, m.y, 16 + fxRng.range(0, 8));
    // floor layer: puddles, hatches, parked scrubber
    w.add(new Layer(0, (g) => this.drawFloor(g), (dt) => this.tickHazards(dt)));
    w.add(new Layer(1, (g) => this.drawParked(g), undefined, () => this.parked.y));
    w.add(new Layer(2, (g) => this.drawAir(g)));
  }

  addPuddle(x: number, y: number, r: number): void {
    if (this.puddles.length >= 14) return;
    if (!this.w.isWalkablePx(x, y)) return;
    this.puddles.push({ x, y, r: 4, grow: r, elec: 0, tick: new Map(), shocked: false, life: Infinity });
  }
  inPuddle(a: Vec, pad = 0): Puddle | null {
    for (const p of this.puddles) { const dx = (a.x - p.x) / (p.r + pad), dy = (a.y - p.y) / ((p.r + pad) * 0.6); if (dx * dx + dy * dy <= 1) return p; }
    return null;
  }

  // ----------------------------------------------------------------- hazards
  tickHazards(dt: number): void {
    if (this.mode === 'dormant') return;
    const w = this.w;
    for (const p of this.puddles) {
      if (p.r < p.grow) p.r = Math.min(p.grow, p.r + dt * (this.sprinklers ? 10 : 30));
      if (p.elec > 0) {
        p.elec -= dt;
        if (fxRng.chance(dt * 18)) sparks(w.particles, p.x + fxRng.range(-p.r, p.r), p.y + fxRng.range(-p.r * 0.5, p.r * 0.5), 2, '#9fe8ff', 70);
        for (const a of w.actors) {
          if (!a.alive || a.grabbedBy) continue;
          const dx = (a.x - p.x) / p.r, dy = (a.y - p.y) / (p.r * 0.6);
          if (dx * dx + dy * dy > 1) continue;
          if (a === this) { if (!p.shocked && this.mode === 'fight') { p.shocked = true; this.shock(); } continue; }
          const last = p.tick.get(a.id) ?? -9;
          if (w.time - last < 0.45) continue;
          p.tick.set(a.id, w.time);
          a.status.electrified = 0.5;
          w.damage(a, { amount: a.team === 'player' ? 9 : 28, type: 'electric', method: 'hazard', source: this, hazardKind: 'electrified_water', knockback: 40 });
          a.status.stun = Math.max(a.status.stun, a.team === 'player' ? 0.3 : 1);
          audio.sfx('electric_zap', { x: a.x, y: a.y, vol: 0.6 });
        }
      } else p.shocked = false;
    }
    // wet feet everywhere water lies (players and enemies slide; spec 4.5)
    for (const a of w.actors) if (a.alive && this.inPuddle(a)) a.status.wet = Math.max(a.status.wet, 0.25);
    if (this.sprinklers) {
      for (const a of w.actors) if (a.alive && w.roomAt(a.x, a.y) === this.cfg.arenaRoom) { a.status.slow = Math.max(a.status.slow, 0.3); a.status.slowAmt = Math.max(a.status.slowAmt, 0.2); a.status.wet = Math.max(a.status.wet, 0.2); }
      if (fxRng.chance(dt * 0.35)) { const sp = this.randomFloor(); this.addPuddle(sp.x, sp.y, 12 + fxRng.range(0, 10)); }
    }
    this.hatchT = this.hatchT.map((t) => Math.max(0, t - dt));
    if (this.riding) {
      this.headlight.x = this.x + Math.cos(this.facing) * 30; this.headlight.y = this.y + Math.sin(this.facing) * 20 - 6;
    }
    this.boilerFrame = (this.boilerFrame + dt * 6) % 4;
    if (this.boiler && this.boilerState === 'idle') this.boiler.spriteCache.set('intact', boilerSprite('idle', Math.floor(this.boilerFrame) % 2));
    for (const pn of this.panels) if (pn.state === 'active') pn.spriteCache.set('active', panelSprite('open', Math.floor(w.time * 12) % 2));
  }

  randomFloor(): Vec {
    const r = this.w.map.rooms[this.cfg.arenaRoom];
    for (let i = 0; i < 20; i++) {
      const x = (r.tx + 2 + fxRng.range(0, r.tw - 4)) * TILE, y = (r.ty + 4 + fxRng.range(0, r.th - 6)) * TILE;
      if (this.w.isWalkablePx(x, y)) return { x, y };
    }
    return { ...r.rewardPoint };
  }

  shock(): void {
    const w = this.w;
    this.status.electrified = 2.4;
    this.status.stun = Math.max(this.status.stun, 2.4);
    this.stunAnim = 'shock';
    this.lunge = null;
    this.cancelAttacks();
    sparks(w.particles, this.x, this.y - 30, 30, '#9fe8ff', 200);
    audio.sfx('electric_zap', { x: this.x, y: this.y });
    app.renderer.shake(6, 0.4);
    w.floatText(this.x, this.y - this.height - 10, 'SHORT CIRCUIT!', '#9fe8ff', 2, 1.4);
    this.say('ARGH — who left that live?!', 0);
    w.damage(this, { amount: this.maxHp * 0.09, type: 'electric', method: 'hazard', source: this.player, hazardKind: 'electrified_water' });
  }

  slip(): void {
    const w = this.w;
    this.lunge = null;
    this.status.stun = Math.max(this.status.stun, 2.3);
    this.stunAnim = 'slip';
    this.setAnim('slip', true);
    audio.sfx('slip', { x: this.x, y: this.y });
    audio.sfx('thud', { x: this.x, y: this.y });
    app.renderer.shake(5, 0.3);
    for (let i = 0; i < 10; i++) w.particles.spawn({ kind: 'water', x: this.x + fxRng.range(-10, 10), y: this.y, z: 4, vx: fxRng.range(-60, 60), vy: fxRng.range(-30, 30), vz: fxRng.range(40, 90), gravity: 260, life: 0.6, col: '#9fd0e6', size: 2 });
    w.floatText(this.x, this.y - 40, 'WET FLOOR!', '#9fd0e6', 2, 1.4);
    w.damage(this, { amount: this.maxHp * 0.035, type: 'blunt', method: 'hazard', source: this.player, hazardKind: 'wet_floor' });
  }

  // ----------------------------------------------------------------- AI
  override onFightStart(): void { this.whistleCd = 3; }

  think(dt: number): void {
    const w = this.w, p = this.player;
    if (this.status.stun <= 0) this.stunAnim = this.riding ? 'crash' : 'stagger';
    if (this.lunge) { this.updateLunge(dt); return; }
    if (this.charge) { this.updateCharge(dt); return; }
    if (this.toPanel) { this.updateToPanel(dt); return; }
    if (this.busy > 0) { if (!this.riding) this.vx = this.vy = 0; return; }
    this.whistleCd -= dt;
    const d = this.distToPlayer();
    if (this.riding) { this.thinkRiding(dt, d); return; }
    if (this.attackCd <= 0) {
      this.actions++;
      if (this.whistleCd <= 0 && this.liveAdds() < 2 && this.phase <= 2) { this.whistle(); return; }
      if (this.phase === 2 && this.actions % 3 === 0) { this.startKick(); return; }
      if (this.phase === 2 && this.actions % 3 === 1 && d > 70) { this.toolboxes(); return; }
      if (d < 54) { if (this.rng.chance(0.6)) this.swing(); else this.slam(); return; }
      if (d < 190 && this.rng.chance(0.65)) { this.startLungeTele(angleTo(this, p)); return; }
      if (d < 150) { this.slam(); return; }
    }
    if (d > 40) { this.chase(dt); this.setAnim('walk'); } else { this.vx = this.vy = 0; this.facePlayer(); this.setAnim('idle'); }
    void w;
  }

  swing(): void {
    const a = angleTo(this, this.player);
    this.face(a);
    this.setAnim('swing_w', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.45; this.attackCd = 1.3;
    this.tele({ kind: 'arc', x: this.x, y: this.y - 8, r: 58, angle: a, half: 1.05 }, 0.6, (sh) => {
      this.setAnim('swing', true);
      audio.sfx('wrench_swing', { x: this.x, y: this.y });
      this.hitShape(sh, 14, { kb: 230 });
      app.renderer.shake(2, 0.1);
    });
  }

  slam(): void {
    const p = this.player;
    const t = { x: p.x, y: p.y };
    this.face(angleTo(this, t));
    this.setAnim('slam_w', true);
    const wd = this.windup(0.85);
    this.busy = wd + 0.55; this.attackCd = 1.6;
    // leap towards the target if far
    const from = { x: this.x, y: this.y };
    const far = dist(from, t) > 50;
    this.tele({ kind: 'circle', x: t.x, y: t.y, r: 36 }, 0.85, (sh) => {
      if (far) { const k = Math.max(0, dist(from, t) - 26) / dist(from, t); this.w.moveActor(this, (t.x - from.x) * k, (t.y - from.y) * k); }
      this.setAnim('slam', true);
      audio.sfx('execution_impact', { x: t.x, y: t.y, vol: 0.7 });
      app.renderer.shake(6, 0.25);
      debrisBurst(this.w.particles, t.x, t.y, 12, ['#8a8478', '#6a655c', '#b0a898'], this.cfg.arenaRoom);
      this.hitShape(sh, 18, { kb: 260 });
      // burst pipe: fresh wet patch
      if (this.phase === 1 || this.rng.chance(0.5)) { this.addPuddle(t.x, t.y, 18 + fxRng.range(0, 6)); for (let i = 0; i < 12; i++) this.w.particles.spawn({ kind: 'water', x: t.x, y: t.y, z: 2, vx: fxRng.range(-80, 80), vy: fxRng.range(-50, 50), vz: fxRng.range(60, 140), gravity: 300, life: 0.7, col: '#8ac4e8', size: 2 }); audio.sfx('water_splash', { x: t.x, y: t.y }); }
    }, { heavy: true });
  }

  startLungeTele(ang: number): void {
    const len = 130;
    this.face(ang);
    this.setAnim('swing_w', true);
    const wd = this.windup(0.7);
    this.busy = wd + 0.1; this.attackCd = 1.5;
    this.addTeleLights(ang, len, wd);
    this.tele({ kind: 'line', x: this.x, y: this.y - 4, angle: ang, len, width: 26 }, 0.7, () => {
      this.lunge = { ang, t: 0, dur: len / 320, hit: false, speed: 320 };
      this.setAnim('lunge', true);
      audio.sfx('whoosh', { x: this.x, y: this.y });
    });
  }
  updateLunge(dt: number): void {
    const L = this.lunge!;
    L.t += dt;
    const v = fromAngle(L.ang, L.speed * dt);
    const r = this.w.moveActor(this, v.x, v.y);
    this.face(L.ang);
    const p = this.player;
    if (!L.hit && dist(this, p) < this.radius + 10) {
      L.hit = true;
      this.w.damage(p, { amount: this.dmg(13), type: 'blunt', method: 'melee', source: this, knockback: 260, dir: L.ang });
    }
    const pd = this.inPuddle(this);
    if (pd && pd.elec > 0) { if (!pd.shocked) { pd.shocked = true; this.shock(); } return; }
    if (pd && this.phase <= 2) { this.slip(); return; }
    if (r.hitX || r.hitY || L.t >= L.dur) {
      this.lunge = null;
      this.setAnim('swing', true);
      audio.sfx('wrench_swing', { x: this.x, y: this.y });
      this.busy = 0.5;
      if (dist(this, p) < 50) this.hitShape({ kind: 'arc', x: this.x, y: this.y - 8, r: 50, angle: L.ang, half: 0.9 }, 10, { kb: 200 });
    }
  }

  whistle(): void {
    this.whistleCd = 15;
    this.setAnim('whistle', true);
    this.busy = 1.1; this.attackCd = 1.2;
    audio.sfx('whistle', { x: this.x, y: this.y });
    this.w.floatText(this.x, this.y - this.height - 6, 'FWEEEET!', '#ffffff', 1, 1);
    this.say(this.rng.pick(['Caretakers! Mop this up.', 'Maintenance — to me!', 'I need a hand with a spillage.']), 1);
    const hs = this.map.marks.h ?? [];
    hs.forEach((h, i) => this.timers.after(0.5 + i * 0.35, () => {
      if (this.mode !== 'fight') return;
      this.hatchT[i] = 1.2;
      audio.sfx('door_unlock', { x: h.x, y: h.y });
      this.spawnAdd('caretaker', { x: h.x, y: h.y - 6 }, this.phase >= 2 ? 1 : 0);
    }));
  }

  toolboxes(): void {
    const p = this.player;
    this.face(angleTo(this, p));
    this.setAnim('throw_w', true);
    const wd = this.windup(1.15);
    this.busy = 1.0; this.attackCd = 1.4;
    const n = this.phase >= 3 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const off = i === 0 ? { x: 0, y: 0 } : fromAngle(this.rng.range(0, Math.PI * 2), this.rng.range(30, 52));
      const t = { x: p.x + off.x + p.vx * 0.25, y: p.y + off.y + p.vy * 0.25 };
      if (!this.w.isWalkablePx(t.x, t.y)) continue;
      const delay = i * 0.12;
      this.timers.after(delay, () => this.tele({ kind: 'circle', x: t.x, y: t.y, r: 22 }, 1.15, (sh) => {
        audio.sfx('thud', { x: t.x, y: t.y });
        debrisBurst(this.w.particles, t.x, t.y, 8, ['#c23a28', '#7e8894', '#d0d0d0'], this.cfg.arenaRoom);
        this.hitShape(sh, 14, { kb: 180, method: 'ranged' });
      }, { keep: true }));
      this.timers.after(delay + Math.max(0.1, wd - 0.75), () => {
        if (i === 0) { this.setAnim('throw', true); audio.sfx('enemy_throw', { x: this.x, y: this.y }); }
        this.w.add(new Lob({ x: this.x, y: this.y - 30 }, t, 0.75, 46));
      });
    }
  }

  startKick(): void {
    // walk to the nearest live panel, kick it open, the water goes live
    let best: PropRT | null = null, bd = 1e9;
    for (const pn of this.panels) { const d = dist(this, pn.def); if (d < bd) { bd = d; best = pn; } }
    if (!best) { this.swing(); return; }
    this.toPanel = best;
    this.attackCd = 2;
  }
  updateToPanel(dt: number): void {
    const pn = this.toPanel!;
    const t = { x: pn.def.x, y: pn.def.y + 16 };
    if (dist(this, t) > 10) { this.moveTo(t, this.speed * 1.6, dt); this.setAnim('walk'); if (this.modeT > 0 && dist(this, t) > 400) this.toPanel = null; return; }
    this.toPanel = null;
    this.face(-Math.PI / 2);
    this.setAnim('kick', true);
    this.busy = 0.6;
    this.timers.after(0.25, () => {
      if (this.mode !== 'fight') return;
      audio.sfx('kick', { x: this.x, y: this.y }); audio.sfx('server_spark', { x: pn.def.x, y: pn.def.y });
      this.w.setPropState(pn, 'active');
      sparks(this.w.particles, pn.def.x, pn.def.y - 18, 22, '#9fe8ff', 180);
      this.say(this.rng.pick(['Water conducts. Physics is deadly.', 'The puddles are now energised.', 'Electricity in water. Instructive.']), 1);
      this.electrify();
      // then he barrels at you — through the water
      this.timers.after(0.35, () => { if (this.mode === 'fight' && !this.status.stun) this.startLungeTele(angleTo(this, this.player)); });
    });
  }
  electrify(): void {
    const wd = 1.1;
    for (const p of this.puddles) {
      this.w.telegraph(null, { kind: 'circle', x: p.x, y: p.y, r: p.r }, this.windup(wd), () => { p.elec = 2.8; p.shocked = false; audio.sfx('electric_zap', { x: p.x, y: p.y, vol: 0.5 }); }, { silent: true });
    }
    audio.sfx('telegraph_heavy', { x: this.x, y: this.y });
  }

  // ----------------------------------------------------------------- phase 3: the scrubber
  thinkRiding(dt: number, d: number): void {
    const p = this.player;
    this.setAnim('ride');
    if (this.attackCd <= 0) {
      this.actions++;
      if (this.actions % 4 === 0) { this.toolboxes(); this.attackCd = 1.2; return; }
      const ang = angleTo(this, p);
      const hit = this.w.raycast(this.x, this.y - 4, this.x + Math.cos(ang) * 420, this.y - 4 + Math.sin(ang) * 420, { props: true });
      const L = hit ? dist(this, hit) : 420;
      if (L > 90) { this.startCharge(ang, L); return; }
    }
    // circle the player at range
    const orbit = angleTo(p, this) + 0.6 * dt * 10;
    const t = { x: p.x + Math.cos(orbit) * 120, y: p.y + Math.sin(orbit) * 90 };
    this.moveTo(t, 70, dt);
    this.face(angleTo(this, d > 0 ? p : t));
  }
  startCharge(ang: number, L: number): void {
    this.face(ang);
    const wd = this.windup(0.9);
    this.busy = wd; this.attackCd = 2.4;
    audio.sfx('scrubber_engine', { x: this.x, y: this.y });
    this.setAnim('ride_charge', true);
    this.addTeleLights(ang, L, wd);
    this.tele({ kind: 'line', x: this.x, y: this.y - 2, angle: ang, len: L, width: 34 }, 0.9, () => {
      this.charge = { ang, t: 0, hit: false };
      audio.sfx('whoosh', { x: this.x, y: this.y });
    }, { heavy: true });
  }
  updateCharge(dt: number): void {
    const c = this.charge!;
    c.t += dt;
    this.setAnim('ride_charge');
    const v = fromAngle(c.ang, 290 * dt);
    const r = this.w.moveActor(this, v.x, v.y);
    this.face(c.ang);
    if (fxRng.chance(0.6)) this.w.particles.spawn({ kind: 'water', x: this.x - Math.cos(c.ang) * 20, y: this.y, z: 1, vx: fxRng.range(-30, 30), vy: fxRng.range(-30, 30), vz: 40, gravity: 200, life: 0.4, col: '#9fd0e6', size: 1 });
    const p = this.player;
    if (!c.hit && dist(this, p) < this.radius + 14) { c.hit = true; this.w.damage(p, { amount: this.dmg(16), type: 'blunt', method: 'melee', source: this, knockback: 330, dir: c.ang }); }
    for (const a of this.adds) if (a.alive && dist(this, a) < 20) this.w.damage(a, { amount: 40, type: 'blunt', method: 'body', source: this, knockback: 300, dir: c.ang });
    if (r.hitX || r.hitY || c.t > 2.5) this.crash(c.ang);
  }
  crash(ang: number): void {
    const w = this.w;
    this.charge = null;
    const at = { x: this.x + Math.cos(ang) * 22, y: this.y + Math.sin(ang) * 10 };
    app.renderer.shake(9, 0.45);
    audio.sfx('explosion', { x: at.x, y: at.y, vol: 0.6 }); audio.sfx('thud', { x: at.x, y: at.y });
    sparks(w.particles, at.x, at.y - 12, 26, '#ffd34d', 200);
    smokePuff(w.particles, at.x, at.y - 16, 12, '#5a5a5a', 8);
    debrisBurst(w.particles, at.x, at.y, 14, ['#e2b234', '#3c4048', '#9a9a9a'], this.cfg.arenaRoom);
    w.floatText(this.x, this.y - this.height - 6, 'CRASH!', '#ffd34d', 2, 1.3);
    this.stunAnim = 'crash';
    this.status.stun = Math.max(this.status.stun, 2.7);
    w.damage(this, { amount: this.maxHp * 0.075, type: 'crush', method: 'hazard', source: this.player, hazardKind: 'scrubber_crash' });
  }

  addTeleLights(ang: number, len: number, wd: number): void {
    if (this.w.forcedDarkness < 0.3) return;
    const room = this.w.map.rooms[this.cfg.arenaRoom];
    const ls: LightDef[] = [];
    for (let k = 0; k <= len; k += 60) ls.push({ x: this.x + Math.cos(ang) * k, y: this.y + Math.sin(ang) * k, radius: 50, color: '#ff8aff', intensity: 0.7, flicker: 'none' });
    room.lights.push(...ls);
    this.timers.after(wd + 0.3, () => { room.lights = room.lights.filter((l) => !ls.includes(l)); });
  }

  // ----------------------------------------------------------------- phases
  override onWindowStart(): void { this.lunge = null; this.charge = null; this.toPanel = null; }
  override onFinalStart(): void {
    this.lunge = null; this.charge = null;
    if (this.riding) {
      this.riding = false;
      this.parked = { x: this.x, y: this.y };
      this.parkedVisible = true;
      this.crashedAt = { ...this.parked };
      this.x += 26; this.y += 6;
      this.w.moveActor(this, 0, 0);
      smokePuff(this.w.particles, this.parked.x, this.parked.y - 20, 14, '#4a4a4a', 9);
    }
    this.sprinklers = false;
    for (const p of this.puddles) p.elec = 0;
  }
  override phaseExecFx(): void {
    const w = this.w;
    if (this.phase === 1) for (let i = 0; i < 24; i++) w.particles.spawn({ kind: 'water', x: this.x, y: this.y - 10, z: 6, vx: fxRng.range(-120, 120), vy: fxRng.range(-70, 70), vz: fxRng.range(60, 160), gravity: 300, life: 0.8, col: '#8ac4e8', size: 2 });
    else { sparks(w.particles, this.x, this.y - 26, 40, '#9fe8ff', 220); this.status.electrified = 0.6; }
  }

  transitionScript(phase: number): ScriptOpts {
    const w = this.w, room = w.map.rooms[this.cfg.arenaRoom];
    if (phase === 2) {
      let alarmed = false, sprayed = false;
      const panelsMid = { x: (this.panels[0]?.def.x ?? this.x) * 0.5 + (this.panels[3]?.def.x ?? this.x) * 0.5, y: 60 };
      return {
        dur: 2.7,
        camera: (t) => t < 0.9 ? { x: this.x, y: this.y - 26 } : t < 2.1 ? { x: panelsMid.x, y: panelsMid.y + 70 } : { x: this.player.x, y: this.player.y - 10 },
        zoom: (t) => t < 0.9 ? 1.35 : 1.05,
        update: (t, dt) => {
          this.animT += dt;
          if (t < 0.05) { this.face(-Math.PI / 2); this.setAnim('slam_w', true); }
          if (!alarmed && t > 0.45) {
            alarmed = true; this.setAnim('slam', true);
            audio.sfx('alarm'); audio.sfx('execution_impact', { x: this.x, y: this.y, vol: 0.6 });
            app.renderer.shake(6, 0.3);
            this.beaconsOn = true;
            room.lights.push(...[[16, 2], [46, 2], [16, 21], [46, 21]].map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 110, color: '#ff3a24', intensity: 0.8, flicker: 'spark' as const })));
          }
          if (!sprayed && t > 1.0) {
            sprayed = true; this.sprinklers = true;
            audio.sfx('sprinkler');
            for (const pn of this.panels) sparks(w.particles, pn.def.x, pn.def.y - 20, 16, '#9fe8ff', 160);
            for (const p of this.puddles) p.grow = Math.max(p.grow, 26);
            for (let i = 0; i < 4; i++) { const sp = this.randomFloor(); this.addPuddle(sp.x, sp.y, 18); }
          }
          if (this.sprinklers) for (const p of this.puddles) if (p.r < p.grow) p.r = Math.min(p.grow, p.r + dt * 14);
          if (fxRng.chance(dt * 8)) { const pn = this.panels[fxRng.int(0, this.panels.length - 1)]; if (pn) sparks(w.particles, pn.def.x, pn.def.y - 18, 6, '#9fe8ff', 140); }
          w.particles.update(0); // keep particles alive visually (world ticks them)
        },
        caption: 'FIRE ALARM', sub: 'Sprinklers on — water conducts. Bait him into live puddles.', captionAt: 1.0, captionCol: '#ff6a4a',
      };
    }
    // phase 3: lights out, he mounts the scrubber
    let blown = false, mounted = false, lit = false;
    const from = { x: this.x, y: this.y };
    return {
      dur: 2.9,
      camera: (t) => t < 1.3 ? { x: this.x, y: this.y - 26 } : { x: this.parked.x, y: this.parked.y - 20 },
      zoom: (t) => t < 1.3 ? 1.3 : 1.45,
      update: (t, dt) => {
        this.animT += dt;
        if (t < 0.05) { this.setAnim('kick', true); }
        if (!blown && t > 0.3) {
          blown = true;
          audio.sfx('explosion', { x: this.x, y: this.y, vol: 0.5 }); audio.sfx('server_spark');
          for (const pn of this.panels) { w.setPropState(pn, 'destroyed'); sparks(w.particles, pn.def.x, pn.def.y - 18, 30, '#ffe9a0', 200); smokePuff(w.particles, pn.def.x, pn.def.y - 20, 6, '#3a3a3a', 6); }
          app.renderer.shake(7, 0.5);
        }
        // lights stutter and die
        if (t > 0.3 && t < 1.2) w.forcedDarkness = Math.sin(t * 40) > 0.2 ? 0.85 : 0.2;
        if (t >= 1.2 && !lit) {
          lit = true;
          w.forcedDarkness = 0.74; w.emergencyLights = true;
          this.sprinklers = false; this.beaconsOn = false;
          room.lights = [[15, 1], [47, 1], [15, 22], [47, 22], [31, 22]].map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 120, color: '#ff4a30', intensity: 0.75, flicker: 'emergency' as const }));
          room.lights.push(this.headlight);
        }
        if (t > 1.3 && t < 2.0) { const k = easeOut((t - 1.3) / 0.6); this.x = lerp(from.x, this.parked.x, k); this.y = lerp(from.y, this.parked.y, k) - Math.sin(k * Math.PI) * 18; this.setAnim('walk'); }
        if (!mounted && t >= 2.0) {
          mounted = true; this.riding = true; this.parkedVisible = false;
          this.x = this.parked.x; this.y = this.parked.y;
          this.face(Math.PI);
          this.setAnim('ride_charge', true);
          audio.sfx('scrubber_engine', { x: this.x, y: this.y });
          smokePuff(w.particles, this.x - 26, this.y - 10, 10, '#6a6a6a', 7);
          app.renderer.shake(4, 0.4);
        }
      },
      caption: 'LIGHTS OUT', sub: 'He is on the floor scrubber. Dodge — let him hit the walls.', captionAt: 1.3, captionCol: '#ff8a5a',
      onEnd: () => { this.riding = true; this.stunAnim = 'crash'; this.attackCd = 1.0; },
    };
  }

  // ----------------------------------------------------------------- finisher: boiler execution
  finisher(): void {
    const w = this.w, p = this.player, s = this.s;
    const boiler = this.boiler;
    const bx = boiler ? boiler.def.x : this.x, by = boiler ? boiler.def.y : this.y - 40;
    const front = { x: bx, y: by + 12 };
    let opened = false, shoved = false, blasted = false, hatT = 0;
    const hat = { x: bx, y: by - 60, vy: 0, z: 0, on: false };
    p.invuln = 99;
    audio.music.duck(0.7, 3);
    w.cutscene = new ScriptCutscene({
      dur: 3.2,
      caption: 'TICKET CLOSED', sub: 'Resolved — will not fix.', captionAt: 1.6,
      camera: () => ({ x: bx, y: by - 4 }),
      zoom: (t) => 1.25 + 0.35 * easeOut(t / 0.6),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        if (t < 0.35) {
          const k = easeOut(t / 0.35);
          this.x = lerp(this.x, front.x, k * 0.5); this.y = lerp(this.y, front.y, k * 0.5);
          p.x = lerp(p.x, front.x, k * 0.4); p.y = lerp(p.y, front.y + 22, k * 0.4);
          this.face(-Math.PI / 2); p.face(-Math.PI / 2);
          this.setAnim('shoved'); p.setAnim('exec_hold');
        }
        if (!opened && t > 0.45) { opened = true; this.boilerState = 'open'; if (boiler) boiler.spriteCache.set('intact', boilerSprite('open')); audio.sfx('door_unlock', { x: bx, y: by }); this.x = front.x; this.y = front.y; p.x = front.x; p.y = front.y + 22; }
        if (!shoved && t > 0.85) {
          shoved = true;
          p.setAnim('exec_slam', true);
          audio.sfx('execution_impact', { x: bx, y: by });
          app.renderer.shake(8, 0.3);
          this.squash = 0.6;
        }
        if (shoved && t < 1.15) { const k = (t - 0.85) / 0.3; this.y = front.y - k * 10; }
        if (!blasted && t > 1.15) {
          blasted = true;
          this.boilerState = 'blast'; this.dead = false; this.invulnerable = true;
          this.y = -999; // inside the boiler
          audio.sfx('boiler_blast', { x: bx, y: by }); audio.sfx('explosion', { x: bx, y: by, vol: 0.8 });
          app.renderer.shake(12, 0.9);
          app.input.rumble(1, 1, 500);
          w.hitstop = 0.15;
          hat.on = true; hat.vy = -260;
          if (goreLevel() > 0) bloodBurst(w.particles, bx, by - 30, -Math.PI / 2, goreLevel() === 2 ? 40 : 14, this.cfg.arenaRoom, 40);
        }
        if (blasted) {
          hatT += dt;
          if (boiler) boiler.spriteCache.set('intact', boilerSprite('blast', Math.floor(hatT * 10) % 4));
          if (fxRng.chance(0.9)) w.particles.spawn({ kind: 'smoke', x: bx + fxRng.range(-28, 28), y: by - 50 - fxRng.range(0, 20), vx: fxRng.range(-40, 40), vy: fxRng.range(-90, -40), life: 0.9, col: goreLevel() === 2 && hatT < 0.6 ? '#e8b0a8' : '#f2f4f6', size: 7 });
          if (hat.on) { hat.vy += 520 * dt; hat.y += hat.vy * dt; if (hat.vy > 0 && hat.y > by + 30) { hat.on = false; hat.y = by + 30; audio.sfx('thud', { x: bx, y: by }); } }
        }
      },
      render: (g) => {
        if (blasted) {
          // the hard hat, ejected through the flue — lands at your feet
          const t = this.hatSprite();
          drawSpriteRot(g, t, bx + 18 + hatT * 20, hat.y, hatT * 9);
        }
      },
      onEnd: () => {
        p.invuln = 0.8;
        if (boiler) boiler.spriteCache.set('intact', boilerSprite('open'));
        this.y = front.y;
        this.timers.after(0, () => this.defeat({ removed: true, at: { x: bx, y: by + 46 } }));
        s.run.log.executions++;
        s.run.log.execByType.boss = (s.run.log.execByType.boss ?? 0) + 1;
        w.bus.emit('execution', { type: 'boss', victim: this });
        // the hard hat stays where it landed
        const hx = bx + 18 + hatT * 20, hy = by + 30;
        w.add(new Layer(0, (g) => drawSprite(g, hardhatSprite(), hx, hy)));
      },
    });
  }
  hatSprite() { return hardhatSprite(); }

  // ----------------------------------------------------------------- rendering
  drawFloor(g: Ctx): void {
    const t = this.w.time;
    for (const p of this.puddles) {
      const live = p.elec > 0;
      g.globalAlpha = 0.55;
      g.fillStyle = live ? '#7fe0ff' : '#3c6a8c';
      pxEllipse(g, p.x, p.y, p.r, p.r * 0.6);
      g.globalAlpha = 0.5;
      g.fillStyle = live ? '#e8fbff' : '#6aa0c8';
      pxEllipse(g, p.x - p.r * 0.2, p.y - p.r * 0.12, p.r * 0.55, p.r * 0.3);
      g.globalAlpha = 0.9;
      g.fillStyle = live ? '#ffffff' : '#bfe0f4';
      g.fillRect(Math.round(p.x - p.r * 0.45), Math.round(p.y - p.r * 0.3), 3, 1);
      g.fillRect(Math.round(p.x + p.r * 0.2), Math.round(p.y + p.r * 0.1), 2, 1);
      if (this.sprinklers) { const k = (t * 3 + p.x) % 1; g.strokeStyle = '#bfe0f4'; g.globalAlpha = 0.5 * (1 - k); g.beginPath(); g.ellipse(Math.round(p.x + Math.sin(p.y) * p.r * 0.4), Math.round(p.y), 1 + k * 6, 1 + k * 3, 0, 0, Math.PI * 2); g.stroke(); }
      if (live) {
        g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const a0 = fxRng.range(0, Math.PI * 2);
          let x = p.x + Math.cos(a0) * p.r * 0.7, y = p.y + Math.sin(a0) * p.r * 0.4;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 3; s++) { x += fxRng.range(-6, 6); y += fxRng.range(-4, 4); g.lineTo(Math.round(x), Math.round(y)); }
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    for (const [i, h] of (this.map.marks.h ?? []).entries()) drawSprite(g, hatchSprite(this.hatchT[i] > 0), h.x, h.y + 6);
    // pipes along the north wall
    const room = this.w.map.rooms[this.cfg.arenaRoom];
    const y0 = room.ty * TILE - 10;
    for (const [px, w2] of [[room.tx * TILE + 6, 6], [room.tx * TILE + 14, 4]]) {
      g.fillStyle = '#5a6270'; g.fillRect(px, y0 - 4, w2, (room.th) * TILE * 0.18);
    }
    g.fillStyle = '#6e7684'; g.fillRect(room.tx * TILE, y0 - 2, room.tw * TILE, 4);
    g.fillStyle = '#9aa2ae'; g.fillRect(room.tx * TILE, y0 - 2, room.tw * TILE, 1);
    g.fillStyle = '#3a404a'; g.fillRect(room.tx * TILE, y0 + 2, room.tw * TILE, 1);
    for (let x = room.tx * TILE + 30; x < (room.tx + room.tw) * TILE; x += 64) { g.fillStyle = '#b8743a'; g.fillRect(x, y0 - 3, 3, 6); }
  }
  drawParked(g: Ctx): void {
    if (!this.parkedVisible) return;
    drawSprite(g, scrubberSprite('side', this.crashedAt ? false : Math.floor(this.w.time * 2) % 2 === 0), this.parked.x, this.parked.y, !!this.crashedAt);
    if (this.crashedAt && fxRng.chance(0.2)) this.w.particles.spawn({ kind: 'smoke', x: this.parked.x + fxRng.range(-10, 10), y: this.parked.y - 24, vy: -30, life: 0.8, col: '#4a4a4a', size: 4 });
  }
  drawAir(g: Ctx): void {
    const r = app.renderer;
    const vx = r.viewX(), vy = r.viewY();
    if (this.sprinklers) {
      g.fillStyle = 'rgba(190,220,240,0.55)';
      const t = this.w.time;
      for (let i = 0; i < 90; i++) {
        const sx = ((i * 73.13 + t * 30) % r.W + r.W) % r.W, sy = ((i * 41.7 + t * 420) % (r.H + 20));
        g.fillRect(Math.round(vx + sx), Math.round(vy + sy - 20), 1, 5);
      }
    }
    // alarm beacons on the walls
    const room = this.w.map.rooms[this.cfg.arenaRoom];
    for (const [x, y] of [[room.tx + 1, room.ty - 1], [room.tx + room.tw - 2, room.ty - 1]]) {
      const on = this.beaconsOn && Math.floor(this.w.time * 6) % 2 === 0;
      drawSprite(g, beaconSprite(on), x * TILE + 8, y * TILE + 12);
      if (on) { g.globalAlpha = 0.25; g.fillStyle = '#ff3a24'; pxEllipse(g, x * TILE + 8, y * TILE + 16, 22, 10); g.globalAlpha = 1; }
    }
  }

  override renderUnder(g: Ctx): void {
    if (this.riding && this.mode === 'fight' && this.charge) {
      // motion streaks behind the charging scrubber
      g.fillStyle = 'rgba(255,255,255,0.4)';
      for (let k = 1; k < 5; k++) g.fillRect(Math.round(this.x - Math.cos(this.charge.ang) * (20 + k * 8)), Math.round(this.y - 12 - k * 2 + Math.sin(this.w.time * 30 + k) * 3), 6, 1);
    }
  }
}


// ------------------------------------------------------------------ lobbed toolbox (visual; damage is the telegraph)
class Lob extends Entity {
  t = 0;
  constructor(public from: Vec, public to: Vec, public T: number, public hgt: number) { super(); this.x = from.x; this.y = from.y; this.persist = true; this.layer = 2; }
  update(dt: number): void {
    this.t += dt;
    const k = Math.min(1, this.t / this.T);
    this.x = lerp(this.from.x, this.to.x, k); this.y = lerp(this.from.y, this.to.y, k);
    this.z = 4 * this.hgt * k * (1 - k);
    if (k >= 1) this.dead = true;
  }
  render(g: Ctx): void {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(this.x) - 5, Math.round(this.y), 10, 2);
    drawSpriteRot(g, toolboxSprite(), this.x, this.y - this.z, this.t * 9);
  }
}

// ------------------------------------------------------------------ registration
BOSS_FLOORS[1] = {
  music: 'boss1',
  buildMap,
  setup(s: GameplayScene) {
    const map = s.world.map as ArenaMap;
    const boss = new FacilitiesManager(s, map);
    s.world.add(boss);
    s.world.holdClear = true;
    s.data.boss = boss;
  },
};

export type { Actor };
void clamp; void easeIn;
