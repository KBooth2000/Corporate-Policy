// Final boss (spec 6.5): James Hartley, CEO — floor 20, penthouse → rooftop helipad.
// P1 boardroom: he addresses the room from a giant screen while the board (SVPs + Executive Assistants) fights;
//    presentation slides are projected as beam patterns — clear the board to force him out in person.
// P2 CEO's office (trophy cabinet, putting green, panoramic glass): in person. Motivational speeches DRAIN your Rage
//    (the inverse of everyone else) — interrupt them with thrown objects; power poses give armour.
// P3 rooftop helipad: wind, open edges, a helicopter waiting; he tries to escape behind a "golden parachute" shield —
//    break the shield, Rage, then finish: thrown off the roof or into the rotor (gore toggle applies).
// Then the ending (src/scenes/ending.ts).
import { BOSS_FLOORS } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import type { FloorRequest, LightDef } from '../world-types';
import { TILE } from '../world-types';
import { Boss, Layer, ScriptOpts, ScriptCutscene, easeOut, clamp, lerp, angleTo, dist, fromAngle } from './boss';
import { buildArena, Grid, coreLobby, ArenaMap, mark, roomOfMark } from './arena';
import { MAT } from '../gen/materials';
import { ceoArt } from '../../art/bosses/ceo';
import { heliSprite, trophySprite, bigScreenSprite, pxEllipse } from '../../art/bosses/props';
import type { Ctx } from '../../render/canvas';
import { drawSprite } from '../../render/canvas';
import { drawText } from '../../render/font';
import { audio, LoopHandle } from '../../audio/audio';
import { app } from '../../core/app';
import { fxRng } from '../../core/rng';
import { bloodBurst, debrisBurst, goreLevel, sparks, smokePuff } from '../fx';
import type { PropRT } from '../world';
import { registerProp } from '../world';
import type { Enemy } from '../enemy';
import type { Vec } from '../../core/math';
import type { ArchetypeId, PropKind } from '../../data/ids';
import type { DamageInfo } from '../entity';
import { CEO_SPEECHES } from '../../data/text/bosses';
import { Pickup } from '../pickups';
import { makeWeapon } from '../weapons';
import { FallSequence } from './fall';
import { notify } from '../../ui/corpos';
import '../../scenes/ending'; // registers SCENES.ending (scenes/ is not auto-loaded)

const SLIDES = ['SYNERGY', 'Q4 VISION', 'OUR VALUES', 'ONE FAMILY', 'GROWTH MINDSET', 'ALIGNMENT', 'BLUE-SKY THINKING', 'RIGHTSIZING'];

function buildMap(req: FloorRequest): ArenaMap {
  const g = new Grid(52, 72, ' ');
  g.room(13, 0, 50, 21, '#', '.');                 // boardroom
  coreLobby(g, 0, 4);
  g.fill(13, 9, 13, 11, 'D');
  g.room(13, 24, 50, 45, '#', '.');                // CEO's office
  g.fill(15, 45, 48, 45, 'S');                     // panoramic glass
  g.fill(13, 48, 50, 71, 'O');                     // rooftop: open edges all round
  g.fill(16, 50, 47, 69, '.');
  g.set(31, 14, 'a'); g.set(31, 3, 'b'); g.set(31, 34, 'o'); g.set(31, 41, 'e'); g.set(31, 30, 'c');
  g.set(31, 60, 'r'); g.set(22, 65, 'p'); g.set(39, 56, 'h'); g.set(30, 60, 'k');
  for (const [x, y] of [[22, 8], [40, 8], [22, 15], [40, 15], [26, 17], [36, 17]]) g.set(x, y, 'm');
  const L = (x: number, y: number, c: string, r = 120, i = 0.9, f: LightDef['flicker'] = 'none'): LightDef => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: r, color: c, intensity: i, flicker: f });
  return buildArena(req, {
    rows: g.rows(), roomMarks: ['a', 'o', 'r'],
    rooms: [
      { kind: 'core' },
      { kind: 'boss', material: MAT.WOOD, darkness: 0.3, lights: [L(31, 4, '#9fd0ff', 160, 1), L(20, 6, '#ffe2b0', 90, 0.8, 'candle'), L(42, 6, '#ffe2b0', 90, 0.8, 'candle'), L(20, 17, '#ffe2b0', 100), L(42, 17, '#ffe2b0', 100), L(31, 12, '#ffe2b0', 110)] },
      { kind: 'manager', material: MAT.MARBLE, darkness: 0.18, lights: [L(20, 28, '#ffe2b0'), L(42, 28, '#ffe2b0'), L(31, 36, '#ffe2b0', 140), L(20, 42, '#c8d8ff'), L(42, 42, '#c8d8ff')] },
      { kind: 'boss', material: MAT.CONCRETE, darkness: 0.5, lights: [L(31, 60, '#fff2c8', 150, 0.9), L(18, 52, '#9fd0ff', 90, 0.7), L(45, 52, '#9fd0ff', 90, 0.7), L(18, 67, '#ff8a6a', 90, 0.7, 'emergency'), L(45, 67, '#ff8a6a', 90, 0.7, 'emergency')] },
    ],
    props: [
      ...[24, 27, 30, 33, 36].map((x) => ({ kind: 'meeting_table', tx: x, ty: 10, fw: 3, fh: 2 })),
      { kind: 'banner_values', tx: 18, ty: 1, fw: 2, fh: 1 }, { kind: 'banner_values', tx: 42, ty: 1, fw: 2, fh: 1 },
      { kind: 'candles', tx: 16, ty: 2 }, { kind: 'candles', tx: 46, ty: 2 }, { kind: 'ceremonial_lectern', tx: 31, ty: 6 },
      { kind: 'boss_trophies', tx: 16, ty: 25, fw: 3, fh: 1, cw: 46, ch: 12, solid: true },
      { kind: 'exec_desk', tx: 29, ty: 27, fw: 3, fh: 2 }, { kind: 'globe_bar', tx: 45, ty: 26 }, { kind: 'plant_large', tx: 47, ty: 43 }, { kind: 'plant_large', tx: 15, ty: 43 },
      { kind: 'boss_heli', tx: 36, ty: 55, fw: 6, fh: 2, cw: 76, ch: 20, solid: true },
      ...[[20, 54], [43, 54], [20, 66], [43, 66]].map(([x, y]) => ({ kind: 'helipad_light', tx: x, ty: y })),
    ],
  });
}

registerProp('boss_trophies' as PropKind, { maxHp: 40 });

type Speech = { t: number; dur: number };

class CEO extends Boss {
  map: ArenaMap;
  rooms: number[];
  hidden = true;
  board: Enemy[] = [];
  boardSpawned = 0;
  boardTotal = 6;
  beamCd = 3;
  beams: { pts: Vec[]; ang: number; len: number; t: number; label: string }[] = [];
  screenCracked = false;
  screenGlitch = 0;
  speech: Speech | null = null;
  speechCd = 5;
  poseCd = 9;
  trophies: PropRT | null = null;
  heli: Vec;
  heliZ = 0;
  rotor = 0;
  rotorSpeed = 0;
  boarding: { t: number } | null = null;
  airborne: { t: number; strafed: number } | null = null;
  escapeCd = 10;
  exposedT = 0;
  shieldUp = false;
  redeploys = 0;
  gustCd = 5;
  gust: { ang: number; t: number; warn: number } | null = null;
  actions = 0;
  fade = 0;
  loops: LoopHandle[] = [];
  hintedThrow = false;

  constructor(s: GameplayScene, map: ArenaMap) {
    const b = mark(map, 'b');
    super(s, { id: 'ceo', act: 4, maxHp: 2200, art: ceoArt(), radius: 10, height: 74, speed: 54, phases: 3, arenaRoom: roomOfMark(map, 'a'), accent: '#d4a537' }, b.x, b.y + 30);
    this.map = map;
    this.rooms = [roomOfMark(map, 'a'), roomOfMark(map, 'o'), roomOfMark(map, 'r')];
    this.heli = mark(map, 'h');
    this.phaseNames = ['The Boardroom', "The CEO's Office", 'Golden Parachute'];
    this.phaseExecCaptions = ['', 'MISALIGNED'];
    this.voiceSeed = 0xce0;
    this.invulnerable = true;
    this.team = 'neutral';
    this.ghost = true;
  }

  override onAdded(): void {
    super.onAdded();
    for (const p of this.w.props) {
      const k = p.def.kind as string;
      if (k === 'boss_trophies') { this.trophies = p; for (const st of ['intact', 'damaged', 'destroyed', 'active', 'used'] as const) p.spriteCache.set(st, trophySprite(st === 'intact' || st === 'active' ? 'intact' : st === 'damaged' ? 'damaged' : 'destroyed')); }
      if (k === 'boss_heli') { const blank = { img: document.createElement('canvas'), sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 }; for (const st of ['intact', 'damaged', 'destroyed', 'active', 'used'] as const) p.spriteCache.set(st, blank); }
    }
    this.w.add(new Layer(0, (g) => this.drawFloor(g), (dt) => this.tick(dt)));
    this.w.add(new Layer(1, (g) => this.drawScreen(g), undefined, () => (this.map.rooms[this.rooms[0]].ty) * TILE));
    this.w.add(new Layer(1, (g) => this.drawHeli(g), undefined, () => this.heli.y + 16));
    this.w.add(new Layer(2, (g) => this.drawAir(g)));
    // throwables in the office (spec: interrupt speeches with thrown objects)
    const o = this.map.rooms[this.rooms[1]];
    for (const [i, id] of ['paperweight', 'mug', 'monitor', 'potted_plant'].entries()) this.w.add(new Pickup({ kind: 'weapon', weapon: makeWeapon(id), x: (o.tx + 4 + i * 9) * TILE, y: (o.ty + o.th - 4) * TILE }));
  }

  override render(g: Ctx): void { if (!this.hidden) super.render(g); }

  // ----------------------------------------------------------------------------------------- shared tick
  tick(dt: number): void {
    if (this.mode === 'dormant') return;
    const w = this.w;
    this.rotor += dt * this.rotorSpeed;
    this.screenGlitch = Math.max(0, this.screenGlitch - dt);
    for (const b of this.beams) b.t -= dt;
    this.beams = this.beams.filter((b) => b.t > 0);
    if (this.phase === 1 && this.mode === 'fight') this.tickBoard(dt);
    if (this.phase === 3 && this.mode !== 'defeated') {
      // rotor wash dust
      if (this.rotorSpeed > 10 && fxRng.chance(dt * 20)) w.particles.spawn({ kind: 'smoke', x: this.heli.x + fxRng.range(-70, 70), y: this.heli.y + fxRng.range(-10, 20), vx: fxRng.range(-80, 80), vy: fxRng.range(-30, 30), life: 0.6, col: '#8a8e96', size: 4 });
    }
  }
  override displayHp(): number { return this.hp; }

  // ----------------------------------------------------------------------------------------- P1: the board
  boardArch(i: number): ArchetypeId { return i % 3 === 0 ? 'svp' : 'exec_assistant'; }
  tickBoard(dt: number): void {
    const ms = this.map.marks.m ?? [];
    this.board = this.board.filter((e) => e.alive);
    while (this.board.length < 4 && this.boardSpawned < this.boardTotal) {
      const e = this.spawnAdd(this.boardArch(this.boardSpawned), ms[this.boardSpawned % ms.length], 1);
      if (!e) break;
      e.name = ['Lord ', 'Dame ', 'Sir ', ''][this.boardSpawned % 4] + e.name;
      this.board.push(e); this.boardSpawned++;
    }
    // HP bar: phase one drains as the board falls
    let frac = this.boardTotal - this.boardSpawned;
    for (const e of this.board) frac += Math.max(0, e.hpFrac);
    this.hp = this.maxHp * (0.66 + 0.34 * clamp(frac / this.boardTotal, 0, 1));
    if (frac <= 0.001 && this.boardSpawned >= this.boardTotal) { this.hp = this.maxHp * 0.66; this.reachThreshold(); return; }
    // slide beams
    this.beamCd -= dt;
    if (this.beamCd <= 0) { this.beamCd = 4.2; this.slideBeams(); }
  }
  slideBeams(): void {
    const r = this.map.rooms[this.rooms[0]];
    const x0 = r.tx * TILE, y0 = r.ty * TILE, W = r.tw * TILE, H = r.th * TILE;
    const label = this.rng.pick(SLIDES);
    const pat = this.rng.int(0, 2);
    const lines: { x: number; y: number; ang: number; len: number }[] = [];
    if (pat === 0) { const off = this.rng.range(0, 60); for (let y = y0 + 30 + off; y < y0 + H - 10; y += 96) lines.push({ x: x0, y, ang: 0, len: W }); }
    else if (pat === 1) { const off = this.rng.range(0, 80); for (let x = x0 + 30 + off; x < x0 + W - 10; x += 120) lines.push({ x, y: y0, ang: Math.PI / 2, len: H }); }
    else { const a = this.rng.chance(0.5) ? 0.45 : -0.45; for (let k = -1; k <= 1; k++) { const cx = x0 + W / 2 + k * 170, cy = y0 + H / 2; lines.push({ x: cx - Math.cos(a) * 260, y: cy - Math.sin(a) * 260, ang: a, len: 520 }); } }
    audio.sfx('slide_beam');
    this.screenGlitch = 0.3;
    if (this.rng.chance(0.5)) this.say(this.rng.pick(this.text.phaseLines[0]), 1);
    for (const l of lines) {
      this.tele({ kind: 'line', x: l.x, y: l.y, angle: l.ang, len: l.len, width: 24 }, 1.1, (sh) => {
        this.beams.push({ pts: [{ x: l.x, y: l.y }], ang: l.ang, len: l.len, t: 0.35, label });
        this.hitShape(sh, 12, { kb: 120, type: 'fire', method: 'hazard', hazardKind: 'slide_beam' });
      }, { heavy: true, keep: true });
    }
  }

  override reachThreshold(): void {
    if (this.phase === 1) { this.cancelAttacks(); this.beginTransition(false); return; } // he is on a screen: no grab
    super.reachThreshold();
  }

  // ----------------------------------------------------------------------------------------- AI
  think(dt: number): void {
    if (this.phase === 1) { this.vx = this.vy = 0; return; }
    const p = this.player;
    if (this.status.stun <= 0) this.stunAnim = 'stagger';
    if (this.speech) { this.updateSpeech(dt); return; }
    if (this.phase === 3 && this.updateRoof(dt)) return;
    if (this.busy > 0) { this.vx = this.vy = 0; return; }
    const d = this.distToPlayer();
    this.speechCd -= dt; this.poseCd -= dt;
    if (this.attackCd <= 0) {
      this.actions++;
      if (this.phase === 2 && this.speechCd <= 0 && this.status.armour <= 0) { this.startSpeech(); return; }
      if (this.poseCd <= 0 && this.status.armour <= 0) { this.powerPose(); return; }
      if (this.phase === 2 && this.liveAdds() < 2 && this.actions % 5 === 0) {
        const r = this.map.rooms[this.cfg.arenaRoom];
        this.spawnAdd('exec_assistant', { x: (r.tx + 2) * TILE, y: (r.ty + 2) * TILE }, 1);
      }
      if (this.phase === 3 && this.actions % 3 === 0) { this.briefcase(); return; }
      if (this.phase === 3 && this.actions % 4 === 1 && d < 200) { this.handshake(); return; }
      if (d < 50) { this.swing(); return; }
      this.drive(this.phase === 3 && this.actions % 2 === 0 ? 3 : 1); return;
    }
    if (d > 90) { this.chase(dt); this.setAnim('walk'); } else if (d < 40) { this.moveTo({ x: this.x * 2 - p.x, y: this.y * 2 - p.y }, this.speed * 0.6, dt); this.facePlayer(); this.setAnim('walk'); } else { this.vx = this.vy = 0; this.facePlayer(); this.setAnim('idle'); }
  }

  swing(): void {
    const a = angleTo(this, this.player);
    this.face(a); this.setAnim('swing_w', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.35; this.attackCd = 1.1;
    this.tele({ kind: 'arc', x: this.x, y: this.y - 8, r: 54, angle: a, half: 1.05 }, 0.6, (sh) => {
      this.setAnim('swing', true); audio.sfx('golf_swing', { x: this.x, y: this.y });
      this.hitShape(sh, 15, { kb: 240 });
    });
  }
  drive(n: number): void {
    const base = angleTo(this, this.player);
    this.face(base); this.setAnim('drive', true); this.animT = 0;
    const wd = this.windup(0.7);
    this.busy = wd + 0.4; this.attackCd = 1.4;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.2;
      this.tele({ kind: 'line', x: this.x, y: this.y - 4, angle: a, len: 260, width: 8 }, 0.7, () => {
        this.setAnim('drive', true); this.animT = 0.4;
        audio.sfx('golf_swing', { x: this.x, y: this.y });
        this.shoot({ angle: a, speed: 330, kind: 'golf_ball', dmg: 12, life: 1.2, radius: 3 });
      }, { follow: (sh: any) => { sh.x = this.x; sh.y = this.y - 4; } });
    }
  }
  powerPose(): void {
    this.setAnim('pose', true);
    this.busy = 1.1; this.attackCd = 0.8; this.poseCd = 13;
    audio.sfx('power_pose', { x: this.x, y: this.y });
    this.say(this.rng.pick(['I stand taller.', 'Power posing grants me armour.', 'I am golden. Immovable.']), 0);
    this.timers.after(0.6, () => { if (this.mode !== 'fight') return; this.status.armour = 6; this.status.armourAmt = 0.6; this.w.particles.spawn({ kind: 'ring', x: this.x, y: this.y - 30, life: 0.5, col: '#ffd34d', size: 40 }); this.w.floatText(this.x, this.y - this.height - 8, 'POWER POSE: ARMOUR', '#ffd34d'); });
  }

  // -- motivational speech: drains the player's Rage (spec 6.5), interrupted by thrown objects
  startSpeech(): void {
    this.speech = { t: 0, dur: 3.6 };
    this.speechCd = 11;
    this.setAnim('speech', true);
    this.vx = this.vy = 0;
    audio.sfx('speech', { x: this.x, y: this.y });
    audio.music.duck(0.4, 3.6);
    this.say(this.rng.pick(CEO_SPEECHES), 0);
    const p = this.player;
    if (!p.run.loadout.thrown) {
      // the office always has something to hand
      const a = this.rng.range(0, Math.PI * 2);
      this.w.add(new Pickup({ kind: 'weapon', weapon: makeWeapon(this.rng.pick(['mug', 'paperweight', 'desk_phone', 'hole_punch'])), x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 18 }));
    }
    if (!this.hintedThrow) { this.hintedThrow = true; notify({ kind: 'boss', title: 'Motivational Speech', body: 'His speeches drain your Rage. Throw something at him to shut him up.' }); }
  }
  updateSpeech(dt: number): void {
    const sp = this.speech!, p = this.player;
    sp.t += dt;
    this.setAnim('speech');
    if (dist(this, p) < 330 && p.alive) {
      if (p.raging > 0) p.raging = Math.max(0.01, p.raging - dt * 0.8);
      else p.rage = Math.max(0, p.rage - 16 * dt);
      if (fxRng.chance(dt * 30)) { const k = fxRng.next(); this.w.particles.spawn({ kind: 'pixel', x: lerp(p.x, this.x, k), y: lerp(p.y - 14, this.y - 40, k), vx: (this.x - p.x) * 0.8, vy: (this.y - p.y) * 0.8, life: 0.35, col: '#ff3a2a', size: 2, drag: 0 }); }
    }
    if (sp.t >= sp.dur) {
      this.speech = null;
      this.status.armour = 6; this.status.armourAmt = 0.6;
      this.w.floatText(this.x, this.y - this.height - 8, 'INSPIRED: ARMOUR', '#ffd34d');
      this.attackCd = 0.6;
    }
  }
  override onBossHurt(info: DamageInfo): void {
    if (this.speech && (info.method === 'throw' || info.method === 'body')) {
      this.speech = null;
      this.status.stun = Math.max(this.status.stun, 1.9); this.stunAnim = 'stagger';
      this.player.addRage(20);
      this.w.floatText(this.x, this.y - this.height - 10, 'INTERRUPTED!', '#ff6a4a', 2, 1.3);
      audio.sfx('crowd_gasp', { x: this.x, y: this.y });
      this.say(this.rng.pick(['How DARE you interrupt a keynote!', 'I was on my third act!', 'Please hold your questions—']), 0);
    }
    if (this.phase === 3 && this.shieldUp && this.shield <= 0) this.shieldBreak();
  }

  // ----------------------------------------------------------------------------------------- P3: rooftop
  deployShield(frac: number): void {
    this.maxShield = 420; this.shield = Math.round(420 * frac); this.shieldUp = true;
    audio.sfx('golden_parachute', { x: this.x, y: this.y });
    this.w.particles.spawn({ kind: 'ring', x: this.x, y: this.y - 30, life: 0.6, col: '#ffd34d', size: 50 });
    this.w.floatText(this.x, this.y - this.height - 10, 'GOLDEN PARACHUTE', '#ffd34d', 1, 1.4);
  }
  shieldBreak(): void {
    this.shieldUp = false; this.shield = 0;
    this.boarding = null;
    this.status.stun = Math.max(this.status.stun, 2.2); this.stunAnim = 'stagger';
    this.exposedT = 9;
    const p = this.player;
    p.addRage(45);
    sparks(this.w.particles, this.x, this.y - 30, 30, '#ffd34d', 200);
    for (let i = 0; i < 14; i++) this.w.particles.spawn({ kind: 'confetti', x: this.x, y: this.y - 30, z: 10, vx: fxRng.range(-120, 120), vy: fxRng.range(-80, 60), vz: fxRng.range(40, 120), gravity: 200, life: 1.2, col: fxRng.pick(['#ffd34d', '#f6dc8a', '#d4a537']), size: 2 });
    audio.sfx('shield_break', { x: this.x, y: this.y });
    app.renderer.shake(6, 0.4);
    this.w.floatText(this.x, this.y - this.height - 12, 'PARACHUTE TORN — RAGE!', '#ff6a4a', 2, 2);
    this.say('That parachute was contractual!', 0);
  }
  /** Returns true when the rooftop logic consumed the frame. */
  updateRoof(dt: number): boolean {
    const p = this.player;
    // wind gusts (no damage: the edges are walls of air — but you get shoved)
    this.gustCd -= dt;
    if (!this.gust && this.gustCd <= 0) { this.gustCd = this.rng.range(4.5, 6.5); this.gust = { ang: this.rng.range(0, Math.PI * 2), t: 1.0, warn: 0.8 }; audio.sfx('whoosh', { vol: 0.5 }); }
    if (this.gust) {
      if (this.gust.warn > 0) this.gust.warn -= dt;
      else { this.gust.t -= dt; const v = fromAngle(this.gust.ang, 72 * dt); this.w.moveActor(p, v.x, v.y); for (const a of this.adds) if (a.alive) this.w.moveActor(a, v.x * 1.3, v.y * 1.3); if (this.gust.t <= 0) this.gust = null; }
    }
    if (this.exposedT > 0) { this.exposedT -= dt; if (this.exposedT <= 0 && this.mode === 'fight' && this.redeploys < 2) { this.redeploys++; this.deployShield(0.6 - this.redeploys * 0.15); } }
    if (this.airborne) { this.updateAirborne(dt); return true; }
    if (this.boarding) {
      const door = { x: this.heli.x - 6, y: this.heli.y + 14 };
      if (dist(this, door) > 8) { this.moveTo(door, this.speed * 1.4, dt); this.setAnim('run'); return true; }
      this.boarding.t += dt; this.setAnim('idle'); this.face(-Math.PI / 2);
      if (this.boarding.t >= 3) { this.boarding = null; this.takeOff(); }
      return true;
    }
    this.escapeCd -= dt;
    if (this.escapeCd <= 0 && this.shieldUp && this.busy <= 0) {
      this.escapeCd = 16;
      this.boarding = { t: 0 };
      this.say(this.rng.pick(['The helicopter awaits.', 'Escape is imminent.', 'I transcend the building.']), 0);
      this.w.floatText(this.x, this.y - this.height - 10, 'ESCAPING — BREAK THE PARACHUTE!', '#ffd34d', 1, 2);
      return true;
    }
    void p;
    return false;
  }
  takeOff(): void {
    this.airborne = { t: 0, strafed: 0 };
    this.hidden = true; this.invulnerable = true; this.team = 'neutral';
    audio.sfx('helicopter', { x: this.heli.x, y: this.heli.y });
    this.w.floatText(this.heli.x, this.heli.y - 60, 'WHEELS UP', '#ffd34d', 2, 1.4);
  }
  updateAirborne(dt: number): void {
    const A = this.airborne!;
    A.t += dt;
    this.heliZ = A.t < 1 ? A.t * 40 : A.t < 4.2 ? 40 : Math.max(0, 40 - (A.t - 4.2) * 50);
    const r = this.map.rooms[this.cfg.arenaRoom];
    if (A.t > 1.0 && A.strafed === 0 || A.t > 2.4 && A.strafed === 1) {
      A.strafed++;
      const p = this.player;
      const vertical = this.rng.chance(0.5);
      const shape = vertical ? { kind: 'line' as const, x: p.x, y: r.ty * TILE, angle: Math.PI / 2, len: r.th * TILE, width: 44 } : { kind: 'line' as const, x: r.tx * TILE, y: p.y, angle: 0, len: r.tw * TILE, width: 44 };
      this.w.telegraph(null, shape, this.windup(0.95), (sh) => { audio.sfx('whoosh'); app.renderer.shake(4, 0.3); this.hitShape(sh, 10, { kb: 300, method: 'hazard', hazardKind: 'rotor_wash' }); }, { heavy: true });
    }
    if (A.t > 3.0 && A.t - dt <= 3.0) { notify({ kind: 'bad', title: 'Asset Finance', body: 'Your helicopter lease has been cancelled. Please return the aircraft.' }); this.say('LEASE CANCELLED?! Who approved that?!', 0); }
    if (A.t >= 5.0) {
      this.airborne = null; this.heliZ = 0;
      this.hidden = false; this.invulnerable = false; this.team = 'enemy';
      this.x = this.heli.x - 10; this.y = this.heli.y + 26;
      this.status.stun = 1.4; this.stunAnim = 'stagger';
      this.deployShield(0.5);
      smokePuff(this.w.particles, this.x, this.y - 10, 10, '#8a8e96', 7);
    }
  }
  briefcase(): void {
    const p = this.player;
    const t = { x: p.x + p.vx * 0.3, y: p.y + p.vy * 0.3 };
    this.face(angleTo(this, t)); this.setAnim('swing_w', true);
    this.busy = 0.7; this.attackCd = 1.3;
    this.tele({ kind: 'circle', x: t.x, y: t.y, r: 28 }, 1.0, (sh) => {
      this.setAnim('swing', true);
      audio.sfx('thud', { x: t.x, y: t.y });
      for (let i = 0; i < 10; i++) this.w.particles.spawn({ kind: 'confetti', x: t.x, y: t.y - 4, z: 4, vx: fxRng.range(-80, 80), vy: fxRng.range(-60, 60), vz: fxRng.range(40, 120), gravity: 220, life: 1.2, col: fxRng.pick(['#7ac46a', '#5aa04a']), size: 2 });
      this.hitShape(sh, 14, { kb: 200, method: 'ranged' });
    }, { heavy: true });
  }
  handshake(): void {
    const ang = angleTo(this, this.player);
    const len = 120;
    this.face(ang); this.setAnim('intro', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.45; this.attackCd = 1.4;
    this.say('Let me shake your hand.', 0);
    this.tele({ kind: 'line', x: this.x, y: this.y - 4, angle: ang, len, width: 22 }, 0.6, () => {
      this.setAnim('run', true);
      const steps = 8; let hit = false;
      for (let i = 0; i < steps; i++) this.timers.after(i * 0.03, () => {
        const v = fromAngle(ang, len / steps); this.w.moveActor(this, v.x, v.y);
        if (!hit && dist(this, this.player) < this.radius + 10) { hit = true; this.w.damage(this.player, { amount: this.dmg(14), type: 'blunt', method: 'melee', source: this, knockback: 280, dir: ang }); }
      });
    });
  }

  // ----------------------------------------------------------------------------------------- phases
  override onWindowStart(): void { this.speech = null; this.boarding = null; }
  override onFinalStart(): void {
    this.speech = null; this.boarding = null; this.airborne = null; this.heliZ = 0;
    this.hidden = false; this.shield = 0; this.shieldUp = false; this.gust = null;
    if (this.player.rage >= 100 && this.player.raging <= 0) this.w.floatText(this.player.x, this.player.y - 46, 'RAGE — THEN FINISH HIM', '#ff6a4a', 1, 2);
  }
  override phaseExecFx(): void { for (let i = 0; i < 16; i++) this.w.particles.spawn({ kind: 'confetti', x: this.x, y: this.y - 30, z: 8, vx: fxRng.range(-120, 120), vy: fxRng.range(-80, 60), vz: fxRng.range(40, 120), gravity: 200, life: 1, col: fxRng.pick(['#ffd34d', '#a01828']), size: 2 }); }

  transitionScript(phase: number): ScriptOpts {
    const w = this.w, p = this.player;
    if (phase === 2) {
      let moved = false;
      const scr = mark(this.map, 'b');
      return {
        dur: 3.4,
        camera: (t) => t < 1.2 ? { x: scr.x, y: scr.y + 40 } : t < 2.3 ? { x: (this.trophies?.def.x ?? this.x), y: (this.trophies?.def.y ?? this.y) + 10 } : { x: this.x, y: this.y - 20 },
        zoom: (t) => t < 1.2 ? 1.25 : 1.15,
        update: (t, dt) => {
          this.animT += dt;
          if (t < 1.0) { this.screenGlitch = 0.3; if (t > 0.6 && !this.screenCracked) { this.screenCracked = true; audio.sfx('screen_smash'); app.renderer.shake(6, 0.4); } }
          this.fade = t < 1.0 ? 0 : t < 1.3 ? (t - 1.0) / 0.3 : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.4);
          if (!moved && t >= 1.3) {
            moved = true;
            const e = mark(this.map, 'e'), c = mark(this.map, 'c');
            p.x = e.x; p.y = e.y; this.x = c.x; this.y = c.y;
            this.hidden = false; this.invulnerable = false; this.team = 'enemy'; this.ghost = false;
            this.cfg.arenaRoom = this.rooms[1];
            w.assignToRoom(this, this.rooms[1]);
            this.face(Math.PI / 2); this.setAnim('intro', true);
            audio.sfx('lift_chime');
          }
        },
        screen: (g) => { if (this.fade > 0) { g.globalAlpha = this.fade; g.fillStyle = '#000'; g.fillRect(0, 0, app.renderer.W, app.renderer.H); g.globalAlpha = 1; } },
        caption: 'THE CEO WILL SEE YOU NOW', sub: 'Speeches drain your Rage. Throw things to interrupt. Power poses = armour.', captionAt: 1.8, captionCol: '#d4a537',
        onEnd: () => { this.speechCd = 4; this.poseCd = 8; },
      };
    }
    // P3: the rooftop
    let moved = false, shielded = false;
    const from = { x: this.x, y: this.y };
    return {
      dur: 3.6,
      camera: (t) => t < 1.0 ? { x: this.x, y: this.y - 20 } : { x: lerp(this.heli.x - 60, this.heli.x, clamp((t - 1.6) / 1.5, 0, 1)), y: this.heli.y + 10 },
      zoom: (t) => t < 1.0 ? 1.3 : 1.15,
      update: (t, dt) => {
        this.animT += dt;
        if (t < 0.9) { this.setAnim('run'); this.x = from.x + t * 80; if (t < 0.05) this.say('I have a helicopter to catch.', 0); }
        this.fade = t < 0.8 ? 0 : t < 1.1 ? (t - 0.8) / 0.3 : t < 1.4 ? 1 : Math.max(0, 1 - (t - 1.4) / 0.4);
        if (!moved && t >= 1.1) {
          moved = true;
          const pp = mark(this.map, 'p'), k = mark(this.map, 'k');
          p.x = pp.x; p.y = pp.y; this.x = k.x; this.y = k.y;
          this.cfg.arenaRoom = this.rooms[2];
          w.assignToRoom(this, this.rooms[2]);
          this.rotorSpeed = 30;
          this.loops.push(audio.loop('helicopter_loop', { vol: 0.5 }), audio.loop('wind', { vol: 0.4 }));
          this.setAnim('idle', true);
        }
        if (!shielded && t > 2.2) { shielded = true; this.setAnim('pose', true); this.deployShield(1); app.renderer.shake(4, 0.3); }
      },
      screen: (g) => { if (this.fade > 0) { g.globalAlpha = this.fade; g.fillStyle = '#000'; g.fillRect(0, 0, app.renderer.W, app.renderer.H); g.globalAlpha = 1; } },
      caption: 'GOLDEN PARACHUTE', sub: 'Break the shield, Rage, then finish. Do not let him board.', captionAt: 2.2, captionCol: '#ffd34d',
      onEnd: () => { this.escapeCd = 9; this.gustCd = 3; },
    };
  }

  // ----------------------------------------------------------------------------------------- finisher
  finisher(): void {
    const p = this.player;
    this.s.hud.bossBar = null;
    if (dist(this, this.heli) < 140) this.rotorFinisher(); else this.roofFinisher();
    void p;
  }
  rotorFinisher(): void {
    const w = this.w, p = this.player, s = this.s;
    const hub = { x: this.heli.x - 10, y: this.heli.y - 50 };
    const from = { x: this.x, y: this.y };
    const gl = goreLevel();
    let launched = false, hit = false;
    p.invuln = 99;
    this.rotorSpeed = 46;
    w.cutscene = new ScriptCutscene({
      dur: 3.0,
      caption: 'GOLDEN HANDSHAKE', sub: gl === 0 ? 'He was let go. Very far.' : 'Severance processed.', captionAt: 1.4, captionCol: '#ffd34d',
      camera: () => ({ x: this.heli.x - 20, y: this.heli.y - 10 }),
      zoom: (t) => 1.2 + 0.3 * easeOut(t / 1.0),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        this.rotor += dt * this.rotorSpeed;
        if (t < 0.6) { const k = easeOut(t / 0.6); this.x = lerp(from.x, hub.x + 20, k); this.y = lerp(from.y, this.heli.y + 30, k); p.x = this.x - 14; p.y = this.y + 8; this.setAnim('grabbed'); p.setAnim('exec_hold'); }
        if (!launched && t > 0.7) { launched = true; p.setAnim('exec_hurl', true); audio.sfx('whoosh'); }
        if (launched && !hit) { this.z = Math.min(80, (t - 0.7) * 260); this.y -= dt * 40; this.setAnim('fall'); }
        if (!hit && t > 1.05) {
          hit = true;
          app.renderer.shake(12, 0.8); w.hitstop = 0.15; app.input.rumble(1, 1, 500);
          audio.sfx('dismember', { x: hub.x, y: hub.y }); audio.sfx('helicopter');
          const at = { x: this.x, y: this.y - this.z - 30 };
          if (gl > 0) {
            for (let i = 0; i < (gl === 2 ? 80 : 30); i++) w.particles.spawn({ kind: 'blood', x: at.x, y: at.y, z: 40, vx: fxRng.range(-200, 200), vy: fxRng.range(-120, 160), vz: fxRng.range(-20, 140), gravity: 300, life: 1.6, col: fxRng.pick(['#8a0f14', '#a3161b', '#c0262a']), size: 2, toDecal: gl === 2, roomId: this.cfg.arenaRoom });
            bloodBurst(w.particles, at.x, at.y + 30, 0, gl === 2 ? 30 : 10, this.cfg.arenaRoom, 40);
            this.hidden = true;
          }
          for (let i = 0; i < 30; i++) w.particles.spawn({ kind: 'confetti', x: at.x, y: at.y, z: 40, vx: fxRng.range(-180, 180), vy: fxRng.range(-120, 160), vz: fxRng.range(0, 160), gravity: 260, life: 2, col: fxRng.pick(['#ffd34d', '#7ac46a', '#2e3038', '#a01828']), size: 2 });
          debrisBurst(w.particles, at.x, at.y + 30, 10, ['#d4a537', '#2e3038'], this.cfg.arenaRoom);
        }
        if (hit && gl === 0) { this.x += dt * 260; this.y -= dt * 200; this.z += dt * 120; this.setAnim('fall'); }
      },
      onEnd: () => this.endGame('rotor'),
    });
  }
  roofFinisher(): void {
    const w = this.w, p = this.player;
    const r = this.map.rooms[this.cfg.arenaRoom];
    // nearest edge
    const edges = [{ x: this.x, y: r.ty * TILE + 6 }, { x: this.x, y: (r.ty + r.th) * TILE - 6 }, { x: r.tx * TILE + 6, y: this.y }, { x: (r.tx + r.tw) * TILE - 6, y: this.y }];
    edges.sort((a, b) => dist(a, this) - dist(b, this));
    const edge = edges[0];
    const from = { x: this.x, y: this.y };
    let thrown = false;
    p.invuln = 99;
    w.cutscene = new ScriptCutscene({
      dur: 1.2,
      camera: () => ({ x: edge.x, y: edge.y }),
      zoom: (t) => 1.3 + 0.3 * easeOut(t),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        const k = easeOut(Math.min(1, t / 0.7));
        this.x = lerp(from.x, edge.x, k); this.y = lerp(from.y, edge.y, k);
        p.x = lerp(from.x, edge.x, k) - Math.cos(angleTo(from, edge)) * 16; p.y = lerp(from.y, edge.y, k) - Math.sin(angleTo(from, edge)) * 10;
        this.setAnim('grabbed'); p.setAnim('exec_hold');
        if (!thrown && t > 0.8) { thrown = true; p.setAnim('exec_hurl', true); audio.sfx('whoosh'); app.renderer.shake(6, 0.3); }
        if (thrown) { const v = fromAngle(angleTo(from, edge), 260 * dt); this.x += v.x; this.y += v.y; }
      },
      onEnd: () => {
        this.timers.after(0, () => {
          this.w.cutscene = new FallSequence({
            art: this.art, anim: 'fall', floors: 20, night: true, stamp: 'TERMINATED', stampSub: 'His golden parachute failed to deploy.', flutter: 'cash', accent: '#d4a537', dur: 3.8,
            onEnd: () => this.endGame('roof'),
          });
        });
      },
    });
  }
  endGame(how: 'rotor' | 'roof'): void {
    const s = this.s, w = this.w, p = this.player;
    p.invuln = 99;
    s.run.log.executions++;
    if (how === 'roof') s.run.log.defenestrations++;
    s.run.log.execByType[how === 'roof' ? 'defenestration' : 'boss'] = (s.run.log.execByType[how === 'roof' ? 'defenestration' : 'boss'] ?? 0) + 1;
    w.bus.emit('execution', { type: how === 'roof' ? 'defenestration' : 'boss', victim: this });
    for (const l of this.loops) l.stop(2);
    this.loops = [];
    this.timers.after(0, () => {
      this.defeat({ removed: true });
      s.hud.showBanner('THE CEO HAS BEEN REMOVED', 'Effective immediately.', '#ffd34d', 4);
      audio.music.play('ceo_finale', 2);
      this.timers.after(2.8, () => s.victory());
    });
  }

  // ----------------------------------------------------------------------------------------- render
  drawFloor(g: Ctx): void {
    const t = this.w.time;
    // putting green in the office
    const o = this.map.rooms[this.rooms[1]];
    const gx = (o.tx + 4) * TILE, gy = (o.ty + 10) * TILE;
    g.fillStyle = '#2f6a3a'; pxEllipse(g, gx + 48, gy + 24, 52, 22);
    g.fillStyle = '#3f8a4a'; pxEllipse(g, gx + 44, gy + 21, 46, 18);
    g.fillStyle = '#4f9a58'; for (let k = 0; k < 30; k++) g.fillRect(gx + 8 + ((k * 37) % 80), gy + 8 + ((k * 23) % 30), 1, 1);
    g.fillStyle = '#0d0e14'; pxEllipse(g, gx + 76, gy + 24, 3, 2);
    g.fillStyle = '#d8d0b0'; g.fillRect(gx + 76, gy + 4, 1, 20); g.fillStyle = '#a01828'; g.fillRect(gx + 77, gy + 4, 7, 5);
    // ceremonial rug down the boardroom
    const b = this.map.rooms[this.rooms[0]];
    g.fillStyle = '#5c0e18'; g.fillRect((b.tx + 15) * TILE, (b.ty + 4) * TILE, 6 * TILE, (b.th - 4) * TILE);
    g.fillStyle = '#d4a537'; g.fillRect((b.tx + 15) * TILE + 3, (b.ty + 4) * TILE, 1, (b.th - 4) * TILE); g.fillRect((b.tx + 21) * TILE - 4, (b.ty + 4) * TILE, 1, (b.th - 4) * TILE);
    // helipad
    const r = this.map.rooms[this.rooms[2]];
    const hx = this.heli.x - 4, hy = this.heli.y + 26;
    g.fillStyle = '#3a3d44'; pxEllipse(g, hx, hy, 96, 52);
    g.fillStyle = '#e8e0c0'; pxEllipse(g, hx, hy, 88, 47); g.fillStyle = '#3a3d44'; pxEllipse(g, hx, hy, 84, 44);
    g.fillStyle = '#e8e0c0';
    g.fillRect(hx - 24, hy - 22, 8, 44); g.fillRect(hx + 16, hy - 22, 8, 44); g.fillRect(hx - 16, hy - 4, 32, 8);
    // edge markings (hazard)
    for (let x = r.tx * TILE; x < (r.tx + r.tw) * TILE; x += 8) { g.fillStyle = ((x / 8) | 0) % 2 ? '#e8c030' : '#1c1c22'; g.fillRect(x, r.ty * TILE, 8, 3); g.fillRect(x, (r.ty + r.th) * TILE - 3, 8, 3); }
    for (let y = r.ty * TILE; y < (r.ty + r.th) * TILE; y += 8) { g.fillStyle = ((y / 8) | 0) % 2 ? '#e8c030' : '#1c1c22'; g.fillRect(r.tx * TILE, y, 3, 8); g.fillRect((r.tx + r.tw) * TILE - 3, y, 3, 8); }
    // slide beams flash
    for (const bm of this.beams) {
      const a = bm.t / 0.35;
      g.save(); g.translate(bm.pts[0].x, bm.pts[0].y); g.rotate(bm.ang);
      g.globalAlpha = 0.7 * a; g.fillStyle = '#e9f1ff'; g.fillRect(0, -12, bm.len, 24);
      g.globalAlpha = a; g.fillStyle = '#9fd0ff'; g.fillRect(0, -2, bm.len, 4);
      for (let x = 40; x < bm.len; x += 160) drawText(g, bm.label, x, -5, { color: '#1c2a44', shadow: null });
      g.restore(); g.globalAlpha = 1;
    }
    void t;
  }
  drawScreen(g: Ctx): void {
    // the giant screen on the boardroom's north wall
    const s = mark(this.map, 'b');
    const x = s.x, y = s.y + 20;
    drawSprite(g, bigScreenSprite(this.screenCracked), x, y);
    const x0 = Math.round(x - 72), y0 = Math.round(y - 82);
    if (this.phase === 1 || this.mode === 'intro' || this.mode === 'dormant' || (this.mode === 'transition' && !this.screenCracked)) {
      g.fillStyle = '#10223a'; g.fillRect(x0, y0, 144, 72);
      // the CEO, live, ×2
      const talking = this.w.time % 0.5 < 0.25;
      const por = this.art.portrait('talk', talking ? 1 : 0, 36);
      g.imageSmoothingEnabled = false;
      g.drawImage(por, x0 + 8, y0 + 0, 128, 72);
      // ticker
      g.fillStyle = '#a01828'; g.fillRect(x0, y0 + 62, 144, 10);
      const msg = '  WE ARE A FAMILY  ·  CULTURE IS NON-NEGOTIABLE  ·  RETURN TO ALIGNMENT  ·  '.replace(/·/g, '/');
      g.save(); g.beginPath(); g.rect(x0, y0 + 62, 144, 10); g.clip();
      drawText(g, msg + msg, x0 - ((this.w.time * 40) % 480), y0 + 63, { color: '#ffe2b0', shadow: null });
      g.restore();
      // scanlines + glitch
      g.globalAlpha = 0.15; g.fillStyle = '#000'; for (let k = 0; k < 72; k += 2) g.fillRect(x0, y0 + k, 144, 1); g.globalAlpha = 1;
      if (this.screenGlitch > 0) for (let k = 0; k < 6; k++) { g.fillStyle = fxRng.pick(['#9fd0ff', '#ffffff', '#a01828']); g.fillRect(x0 + fxRng.int(0, 120), y0 + fxRng.int(0, 66), fxRng.int(6, 30), 2); }
      g.fillStyle = '#ff3a24'; if (Math.floor(this.w.time * 2) % 2) g.fillRect(x0 + 4, y0 + 4, 3, 3);
      drawText(g, 'LIVE', x0 + 10, y0 + 2, { color: '#ffffff', shadow: null });
    } else if (this.screenCracked) {
      g.fillStyle = '#05060a'; g.fillRect(x0, y0, 144, 72);
      drawText(g, 'NO SIGNAL', x, y0 + 30, { align: 'center', color: '#3a4a6a', shadow: null });
      if (fxRng.chance(0.05)) sparks(this.w.particles, x + fxRng.range(-60, 60), y0 + fxRng.range(10, 60), 3, '#9fd0ff', 60);
    }
  }
  drawHeli(g: Ctx): void {
    const h = this.heli;
    const z = Math.round(this.heliZ);
    g.fillStyle = 'rgba(0,0,0,0.35)'; pxEllipse(g, h.x, h.y + 22, 56 - z * 0.3, 10);
    drawSprite(g, heliSprite(!!this.boarding || !!this.airborne || this.mode === 'final'), h.x, h.y + 24 - z);
    // main rotor: two blades, motion blur (mast sits at x 44 of the 124-wide sprite)
    const cx = h.x - 17, cy = h.y + 24 - z - 55;
    const sp = this.rotorSpeed;
    if (sp > 0) {
      if (sp > 20) { g.globalAlpha = 0.22; g.fillStyle = '#c8ccd4'; pxEllipse(g, cx, cy, 86, 12); g.globalAlpha = 0.35; g.strokeStyle = '#e8ecf2'; g.beginPath(); g.ellipse(cx, cy, 86, 12, 0, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = sp > 20 ? 0.75 : 1;
      g.fillStyle = '#1c1d24';
      for (const k of [0, Math.PI]) { const a = this.rotor + k; const ex = Math.cos(a) * 86, ey = Math.sin(a) * 12; g.beginPath(); g.moveTo(cx, cy - 1); g.lineTo(cx + ex, cy + ey - 1); g.lineTo(cx + ex, cy + ey + 2); g.lineTo(cx, cy + 2); g.fill(); }
      g.globalAlpha = 1;
    } else { g.fillStyle = '#1c1d24'; g.fillRect(cx - 84, cy - 1, 168, 3); }
    g.fillStyle = '#8e98a6'; g.fillRect(cx - 2, cy - 2, 4, 4);
    // boarding progress
    if (this.boarding && this.boarding.t > 0) {
      const bx = Math.round(this.x - 20), by = Math.round(this.y - this.height - 16);
      g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 42, 5); g.fillStyle = '#ffd34d'; g.fillRect(bx, by, Math.round(40 * this.boarding.t / 3), 3);
      drawText(g, 'BOARDING', this.x, by - 10, { align: 'center', color: '#ffd34d', outline: '#000' });
    }
  }
  drawAir(g: Ctx): void {
    const r = app.renderer;
    if (this.gust && this.phase === 3) {
      const vx = r.viewX(), vy = r.viewY();
      const warn = this.gust.warn > 0;
      g.globalAlpha = warn ? 0.5 + 0.5 * Math.sin(this.w.time * 30) : 0.5;
      g.fillStyle = '#e9f1ff';
      const c = Math.cos(this.gust.ang), sn = Math.sin(this.gust.ang);
      for (let i = 0; i < 24; i++) {
        const sx = (i * 89) % r.W, sy = (i * 47) % r.H;
        const off = (this.w.time * (warn ? 60 : 400) + i * 13) % 60;
        const x = vx + sx + c * off, y = vy + sy + sn * off;
        for (let k = 0; k < 10; k++) g.fillRect(Math.round(x + c * k), Math.round(y + sn * k), 1, 1);
      }
      if (warn) drawText(g, 'GUST!', vx + r.W / 2, vy + 70, { align: 'center', color: '#e9f1ff', outline: '#000' });
      g.globalAlpha = 1;
    }
  }
  override renderUnder(g: Ctx): void {
    if (this.status.armour > 0 || this.speech) {
      g.globalAlpha = 0.35 + 0.15 * Math.sin(this.w.time * 8);
      g.fillStyle = '#ffd34d'; pxEllipse(g, this.x, this.y, 20, 7);
      g.globalAlpha = 1;
    }
  }
  override renderOver(g: Ctx): void {
    if (this.shield > 0 && this.shieldUp) {
      // golden parachute bubble
      const k = this.shield / Math.max(1, this.maxShield);
      g.globalAlpha = 0.25 + 0.2 * k;
      g.strokeStyle = '#ffd34d'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(Math.round(this.x) + 0.5, Math.round(this.y - 34) + 0.5, 26, 40, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.12 + 0.08 * Math.sin(this.w.time * 6); g.fillStyle = '#ffe2a0';
      g.beginPath(); g.ellipse(Math.round(this.x), Math.round(this.y - 34), 25, 39, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    if (this.speech) {
      const k = this.speech.t / this.speech.dur;
      const bx = Math.round(this.x - 20), by = Math.round(this.y - this.height - 14);
      g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 42, 5); g.fillStyle = '#ff3a2a'; g.fillRect(bx, by, Math.round(40 * k), 3);
      drawText(g, 'SPEECH — THROW SOMETHING!', this.x, by - 10, { align: 'center', color: '#ffd34d', outline: '#000' });
    }
  }

  override debugAdvance(): void {
    if (this.mode !== 'fight') return;
    if (this.phase === 1) { for (const e of this.board) if (e.alive) this.w.damage(e, { amount: 99999, type: 'blunt', method: 'melee', source: this.player, unavoidable: true }); this.boardSpawned = this.boardTotal; return; }
    super.debugAdvance();
  }
  qaEntry(): Vec { const r = this.map.rooms[this.rooms[0]]; return { x: (r.tx + 3) * TILE, y: (r.ty + 10) * TILE }; }
}

BOSS_FLOORS[4] = {
  music: 'boss4',
  buildMap,
  setup(s: GameplayScene) {
    const map = s.world.map as ArenaMap;
    const boss = new CEO(s, map);
    s.world.add(boss);
    s.world.holdClear = true;
    s.data.boss = boss;
  },
};
