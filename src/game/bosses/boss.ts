// Shared boss machinery (spec 6.1): phase thresholds with HUD markers at 66% / 33%, stagger windows at the end of
// each phase (the only time a boss can be grabbed), phase-transition executions, 2–3 s arena-change set pieces
// (world.cutscene: player invulnerable, timers paused), intro cards, adds (≤4, act archetypes), barks, Board
// Pressure enrage, unique finishers and the reward drop (major upgrade, Desk Item, Annual Leave, full heal).
import { app } from '../../core/app';
import type { Ctx } from '../../render/canvas';
import { drawText, measure, wrap } from '../../render/font';
import { Actor, DamageInfo, Entity } from '../entity';
import { Enemy } from '../enemy';
import type { World, Cutscene } from '../world';
import type { GameplayScene } from '../../scenes/gameplay';
import type { Player } from '../player';
import { Shape, queryActors } from '../combat';
import { audio, MusicTrack } from '../../audio/audio';
import { Vec, angleTo, clamp, dist, norm, lerp, fromAngle } from '../../core/math';
import { BOSS_TEXT, BossText } from '../../data/text/bosses';
import type { Act, ArchetypeId, BossId } from '../../data/ids';
import { ACTS } from '../../data/tables';
import type { BossArt } from '../../art/bosses/bake';
import { REWARD_GRANT } from '../registry';
import { Pickup, dropCash } from '../pickups';
import { makeWeapon, rollWeapon, def as wdef } from '../weapons';
import { bloodBurst, smokePuff, sparks, goreLevel } from '../fx';
import { fxRng } from '../../core/rng';
import { Projectile } from '../projectile';
import { notify } from '../../ui/corpos';

export type BossMode = 'dormant' | 'intro' | 'fight' | 'window' | 'transition' | 'final' | 'finisher' | 'defeated';

export interface BossCfg {
  id: BossId | 'director';
  act: Act;
  maxHp: number;
  art: BossArt;
  radius: number;
  height: number;
  speed: number;
  phases: 2 | 3;
  arenaRoom: number;
  accent: string;
  /** Overrides for procedurally assembled bosses (Directors). */
  text?: BossText;
  portrait?: HTMLCanvasElement;
  music?: MusicTrack;
}

/** Simple world-space layer entity for set-piece overlays (floor layer 0, air layer 2). */
export class Layer extends Entity {
  constructor(layer: 0 | 1 | 2, public draw: (g: Ctx) => void, public tick?: (dt: number) => void, public sortAt?: () => number) {
    super();
    this.layer = layer; this.persist = true;
    // World.render culls entities by position: a layer always sits at the camera so it is never culled
    Object.defineProperty(this, 'x', { get: () => app.renderer.camX, set: () => {}, configurable: true });
    Object.defineProperty(this, 'y', { get: () => app.renderer.camY, set: () => {}, configurable: true });
  }
  update(dt: number): void { this.tick?.(dt); }
  render(g: Ctx): void { this.draw(g); }
  override sortY(): number { return this.sortAt ? this.sortAt() : this.y; }
}

/** Delayed callbacks on world time (paused during cutscenes like everything else). */
export class Timers extends Entity {
  private list: { t: number; fn: () => void }[] = [];
  constructor() { super(); this.layer = 0; this.persist = true; }
  after(t: number, fn: () => void): void { this.list.push({ t, fn }); }
  update(dt: number): void {
    for (const it of this.list) it.t -= dt;
    const due = this.list.filter((it) => it.t <= 0);
    this.list = this.list.filter((it) => it.t > 0);
    for (const it of due) it.fn();
  }
  render(): void {}
}

export function letterbox(g: Ctx, k: number): void {
  const r = app.renderer;
  const bar = Math.round(clamp(k, 0, 1) * 28);
  if (bar <= 0) return;
  g.fillStyle = '#000'; g.fillRect(0, 0, r.W, bar); g.fillRect(0, r.H - bar, r.W, bar);
}

export function easeOut(t: number): number { t = clamp(t, 0, 1); return 1 - (1 - t) ** 3; }
export function easeIn(t: number): number { t = clamp(t, 0, 1); return t * t * t; }

export function bossText(id: string): BossText { return BOSS_TEXT.find((b) => b.id === id) ?? BOSS_TEXT[0]; }

/** Scripted cutscene helper: duration, per-frame script, camera, letterbox and an optional caption. */
export interface ScriptOpts {
  dur: number;
  update?(t: number, dt: number): void;
  camera?(t: number): Vec | undefined;
  zoom?(t: number): number;
  render?(g: Ctx, t: number): void;
  screen?(g: Ctx, t: number): void;
  caption?: string; sub?: string; captionCol?: string; captionAt?: number;
  letterbox?: boolean;
  onEnd?(): void;
}
export class ScriptCutscene implements Cutscene {
  t = 0;
  camera: Vec | undefined;
  zoom = 1;
  constructor(public o: ScriptOpts) { this.camera = o.camera?.(0); this.zoom = o.zoom?.(0) ?? 1; }
  update(dt: number): boolean {
    this.t += dt;
    this.o.update?.(this.t, dt);
    const c = this.o.camera?.(this.t);
    this.camera = c;
    this.zoom = this.o.zoom?.(this.t) ?? 1;
    if (this.t >= this.o.dur) { this.o.onEnd?.(); return true; }
    return false;
  }
  render(g: Ctx): void { this.o.render?.(g, this.t); }
  renderScreen(g: Ctx): void {
    const t = this.t, d = this.o.dur;
    if (this.o.letterbox !== false) letterbox(g, Math.min(t * 5, (d - t) * 5));
    this.o.screen?.(g, t);
    if (this.o.caption && t >= (this.o.captionAt ?? 0)) {
      const r = app.renderer;
      const a = clamp(Math.min((t - (this.o.captionAt ?? 0)) * 6, (d - t) * 4), 0, 1);
      const pop = 1 + Math.max(0, 0.25 - (t - (this.o.captionAt ?? 0))) * 2;
      const sc = pop > 1.2 ? 3 : 2;
      drawText(g, this.o.caption, r.W / 2, r.H - 52 - (sc - 2) * 6, { align: 'center', color: this.o.captionCol ?? '#ffd34d', scale: sc, outline: '#000', alpha: a });
      if (this.o.sub) drawText(g, this.o.sub, r.W / 2, r.H - 26, { align: 'center', color: '#e8e0d0', outline: '#000', alpha: a });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
export abstract class Boss extends Actor {
  s: GameplayScene;
  w: World;
  cfg: BossCfg;
  text: BossText;
  art: BossArt;
  isBoss = true;
  staggerWindow = false;
  mode: BossMode = 'dormant';
  phase = 1;
  modeT = 0;
  windowT = 0;
  busy = 0;
  attackCd = 2;
  barkCd = 5;
  speed: number;
  enraged = false;
  invulnerable = false;
  adds: Enemy[] = [];
  timers: Timers;
  markers: number[];
  voiceSeed = 0x5eed;
  /** Overhead tint (electrified, enraged, golden). */
  tintCol: string | undefined; tintAmt = 0;
  /** Extra damage multiplier (armour etc.) applied in modifyIncoming. */
  dmgTakenMult = 1;
  /** Animation that plays while stunned (slip, shock, crash...). */
  stunAnim = 'stagger';
  /** Set by subclasses: telegraph labels for phase banners. */
  phaseNames: string[] = ['', '', ''];
  phaseExecCaptions: string[] = ['ESCALATED', 'ESCALATED'];
  private offGrab: (() => void) | null = null;
  defeatedAt = -1;
  /** Boss animation name (boss rigs have their own animation sets, wider than AnimName). */
  banim = 'idle';
  override setAnim(a: string, restart = false): void { if (this.banim !== a || restart) { this.banim = a; this.animT = 0; } }

  constructor(s: GameplayScene, cfg: BossCfg, x: number, y: number) {
    super();
    this.s = s; this.w = s.world; this.cfg = cfg;
    this.text = cfg.text ?? bossText(cfg.id);
    this.art = cfg.art;
    this.team = 'enemy';
    this.x = x; this.y = y;
    this.maxHp = this.hp = cfg.maxHp;
    this.radius = cfg.radius; this.height = cfg.height;
    this.mass = 8; this.staggerMax = 1e9; // never stagger-locked by chip damage: bosses stagger only through their mechanics
    this.speed = cfg.speed;
    this.persist = true;
    this.markers = cfg.phases === 3 ? [0.66, 0.33] : [0.5];
    this.face(Math.PI / 2);
    this.timers = new Timers();
  }

  get player(): Player { return this.s.player; }
  get rng() { return this.s.floorRng.combat; }

  override onAdded(): void {
    this.w.add(this.timers);
    this.w.assignToRoom(this, this.cfg.arenaRoom);
    this.offGrab = this.w.bus.on('grab', ({ victim }) => { if (victim === this) this.onGrabbed(); });
  }
  override onRemoved(): void { this.offGrab?.(); }

  // ----------------------------------------------------------------------------------------- telegraph + damage
  telegraphMin(): number { return ACTS[this.cfg.act - 1].telegraphMin; }
  windup(base: number): number {
    const m = this.s.spawn?.telegraphMult ?? 1;
    return Math.max(this.telegraphMin(), base * m * (this.enraged ? 0.85 : 1));
  }
  tele(shape: Shape, windup: number, onFire: (s: Shape) => void, o: { heavy?: boolean; follow?: (s: Shape) => void; keep?: boolean } = {}) {
    return this.w.telegraph(this, shape, this.windup(windup), (sh) => { if (this.mode === 'fight' || o.keep) onFire(sh); }, { heavy: o.heavy, follow: o.follow, cancelOnStun: !o.keep });
  }
  /** Damage the player (and optionally adds) inside a shape. */
  hitShape(shape: Shape, amount: number, o: { kb?: number; type?: DamageInfo['type']; method?: DamageInfo['method']; adds?: boolean; dir?: number; stun?: number; hazardKind?: string } = {}): boolean {
    let hit = false;
    for (const t of queryActors(this.w, shape, o.adds ? 'any' : 'player', this)) {
      if (t.team === 'enemy' && !o.adds) continue;
      if (t instanceof Boss) continue;
      const d = this.w.damage(t, { amount: this.dmg(amount), type: o.type ?? 'blunt', method: o.method ?? 'melee', source: this, knockback: o.kb ?? 160, dir: o.dir ?? angleTo(shape, t), hazardKind: o.hazardKind });
      if (d > 0) { hit = true; if (o.stun) t.status.stun = Math.max(t.status.stun, o.stun); }
    }
    return hit;
  }
  dmg(base: number): number { return base * (this.enraged ? 1.2 : 1); }

  /** Lobbed/straight boss projectile. */
  shoot(o: { angle: number; speed: number; kind: any; dmg: number; life?: number; radius?: number; type?: DamageInfo['type']; spin?: number; slow?: { amt: number; time: number }; z?: number }): Projectile {
    return this.w.add(new Projectile({
      team: 'enemy', x: this.x + Math.cos(o.angle) * 12, y: this.y + Math.sin(o.angle) * 6, z: o.z ?? 18, angle: o.angle, speed: o.speed, kind: o.kind,
      life: o.life ?? 2, radius: o.radius ?? 4, spin: o.spin, slow: o.slow,
      dmg: { amount: this.dmg(o.dmg), type: o.type ?? 'blunt', method: 'ranged', source: this, knockback: 80 },
    }));
  }

  // ----------------------------------------------------------------------------------------- movement
  moveTo(t: Vec, speed: number, dt: number): { hitX: boolean; hitY: boolean } {
    const d = norm({ x: t.x - this.x, y: t.y - this.y });
    const sm = this.speedMult() * (this.enraged ? 1.3 : 1);
    this.vx = d.x * speed * sm; this.vy = d.y * speed * sm;
    if (Math.hypot(d.x, d.y) > 0) this.face(Math.atan2(d.y, d.x));
    return this.w.moveActor(this, this.vx * dt, this.vy * dt);
  }
  chase(dt: number, speedMul = 1): void {
    const p = this.player;
    let d: Vec | null = null;
    if (dist(this, p) < 140 && this.w.los(this, p)) d = norm({ x: p.x - this.x, y: p.y - this.y });
    else d = this.w.flowDir(this.x, this.y) ?? norm({ x: p.x - this.x, y: p.y - this.y });
    this.moveTo({ x: this.x + d.x * 10, y: this.y + d.y * 10 }, this.speed * speedMul, dt);
    this.face(angleTo(this, p));
  }
  facePlayer(): void { this.face(angleTo(this, this.player)); }
  distToPlayer(): number { return dist(this, this.player); }

  // ----------------------------------------------------------------------------------------- barks
  say(text: string, rage = 2.5): void {
    this.w.say(this, `${this.text.name} (${this.text.title})`, text, this.cfg.accent);
    audio.voice(this.voiceSeed, 'bark', { x: this.x, y: this.y, syllables: Math.min(9, 2 + Math.floor(text.length / 7)) });
    const p = this.player;
    if (rage > 0 && p.alive && dist(this, p) < 240) p.addRage(rage, true);
  }
  barkPhase(): void { const lines = this.text.phaseLines[Math.min(2, this.phase - 1)]; if (lines?.length) this.say(this.rng.pick(lines)); }

  // ----------------------------------------------------------------------------------------- adds
  liveAdds(): number { this.adds = this.adds.filter((a) => a.alive); return this.adds.length; }
  spawnAdd(arch: ArchetypeId, at: Vec, tier: 0 | 1 | 2 = 0): Enemy | null {
    if (this.liveAdds() >= 4) return null;
    const e = new Enemy({ archetype: arch, tier, act: this.cfg.act, floor: this.s.plan.floor_number, x: at.x, y: at.y, roomId: this.w.roomAt(at.x, at.y) >= 0 ? this.w.roomAt(at.x, at.y) : this.cfg.arenaRoom, rng: this.s.floorRng.spawns.fork(this.adds.length + ':' + this.w.time.toFixed(2)), aware: true, telegraphMult: this.s.spawn?.telegraphMult });
    this.w.add(e);
    this.w.assignToRoom(e, this.cfg.arenaRoom);
    this.adds.push(e);
    smokePuff(this.w.particles, at.x, at.y - 6, 8, '#d8d0c0', 7);
    this.w.bus.emit('enemySpawn', { enemy: e });
    return e;
  }
  dismissAdds(text = 'RESIGNED'): void {
    for (const a of this.adds) if (a.alive) {
      this.w.floatText(a.x, a.y - 34, text, '#9fe0ff');
      this.w.damage(a, { amount: 99999, type: 'blunt', method: 'other', source: this.player, unavoidable: true, silent: true });
    }
  }

  // ----------------------------------------------------------------------------------------- HUD
  syncHud(): void {
    if (this.mode === 'dormant' || this.mode === 'intro') return;
    const hud = this.s.hud;
    hud.bossBar = {
      name: this.text.name, title: this.text.title.toUpperCase(), hp: this.displayHp(), maxHp: this.maxHp, phase: this.phase, markers: this.markers,
      shield: this.maxShield > 0 && this.shield > 0 ? this.shield / this.maxShield : undefined,
    };
  }
  displayHp(): number { return this.hp; }

  // ----------------------------------------------------------------------------------------- damage
  phaseFloor(): number { return this.phase < this.cfg.phases ? this.maxHp * this.markers[this.phase - 1] : 1; }

  override modifyIncoming(info: DamageInfo): number {
    if (this.mode !== 'fight' || this.invulnerable) {
      if (this.mode === 'window' || this.mode === 'final') this.hitFlash = 0.6;
      return 0;
    }
    let amt = this.scaleIncoming(info) * this.dmgTakenMult;
    const floor = this.phaseFloor();
    // shields absorb first (combat.damage), only the overflow reaches HP — clamp that at the phase floor
    const sh = info.ignoreShield ? 0 : Math.max(0, this.shield);
    const over = Math.max(0, amt - sh);
    if (this.hp - over < floor) amt = sh + Math.max(0, this.hp - floor);
    if (info.knockback) info.knockback *= 0.12;
    return amt;
  }
  /** Per-boss incoming damage hook. */
  scaleIncoming(info: DamageInfo): number { return info.amount; }

  override onHurtLocal(info: DamageInfo, amount: number): void {
    this.onBossHurt(info, amount);
    if (this.mode === 'fight' && this.hp <= this.phaseFloor() + 0.5) this.reachThreshold();
  }
  onBossHurt(_info: DamageInfo, _amount: number): void {}

  onDeath(): void {
    // bosses never die from normal damage (phase floors); this only runs from scripted finishers
    this.dying = false; this.corpse = true; this.layer = 0;
  }

  reachThreshold(): void {
    this.cancelAttacks();
    if (this.phase < this.cfg.phases) {
      this.mode = 'window'; this.modeT = 0;
      this.windowT = 2.6;
      this.staggerWindow = true;
      this.setAnim(this.art.has('stagger') ? 'stagger' : 'idle', true);
      this.w.hitstop = Math.max(this.w.hitstop, 0.14);
      app.renderer.shake(6, 0.35);
      audio.sfx('crit', { x: this.x, y: this.y });
      this.w.floatText(this.x, this.y - this.height - 14, 'STAGGERED — GRAB!', '#ffd34d', 1, 1.6);
      this.onWindowStart();
    } else {
      this.mode = 'final'; this.modeT = 0;
      this.staggerWindow = true;
      this.setAnim(this.art.has('down') ? 'down' : 'stagger', true);
      this.w.hitstop = Math.max(this.w.hitstop, 0.25);
      app.renderer.shake(9, 0.5);
      audio.sfx('crit', { x: this.x, y: this.y });
      audio.music.duck(0.6, 2);
      this.dismissAdds();
      this.w.floatText(this.x, this.y - this.height - 14, 'FINISH THEM', '#ff6a4a', 2, 2.5);
      this.onFinalStart();
    }
  }
  onWindowStart(): void {}
  onFinalStart(): void {}

  cancelAttacks(): void {
    for (const t of this.w.telegraphs) if (t.owner === this) t.done = true;
    this.busy = 0;
  }
  clearHostiles(): void {
    this.w.telegraphs = [];
    for (const e of this.w.entities) if (e instanceof Projectile && e.o.team === 'enemy') e.dead = true;
  }

  // ----------------------------------------------------------------------------------------- grab → executions
  private onGrabbed(): void {
    const p = this.player;
    if (p.grabbing === this) p.grabbing = null;
    this.grabbedBy = null;
    this.staggerWindow = false;
    if (this.mode === 'window') this.phaseExecution();
    else if (this.mode === 'final') { this.mode = 'finisher'; this.finisher(); }
  }

  /** Spec 6.1: grabbing in a stagger window → 1–1.5 s phase-transition execution, then the arena changes. */
  phaseExecution(): void {
    const w = this.w, p = this.player, s = this.s;
    this.mode = 'transition';
    const dur = 1.3;
    let hit = false;
    const sx = this.x, sy = this.y;
    const dir = angleTo(p, this);
    p.setAnim('exec_slam', true);
    this.setAnim(this.art.has('grabbed') ? 'grabbed' : 'stagger', true);
    p.invuln = 99;
    audio.music.duck(0.5, 1.2);
    const cap = this.phaseExecCaptions[this.phase - 1] ?? 'ESCALATED';
    w.cutscene = new ScriptCutscene({
      dur, captionAt: 0.55, caption: cap, sub: 'Phase-transition execution',
      camera: () => ({ x: (p.x + this.x) / 2, y: (p.y + this.y) / 2 - 18 }),
      zoom: (t) => 1 + 0.6 * easeOut(t / 0.3),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        if (t < 0.5) { const k = easeIn(t / 0.5); this.x = sx + Math.cos(dir) * 8 * k; this.y = sy + Math.sin(dir) * 4 * k; }
        if (!hit && t >= 0.5) {
          hit = true;
          this.setAnim(this.art.has('hurt') ? 'hurt' : 'stagger', true);
          app.renderer.shake(9, 0.4);
          app.input.rumble(1, 1, 250);
          w.hitstop = 0.12;
          audio.sfx('execution_impact', { x: this.x, y: this.y });
          bloodBurst(w.particles, this.x, this.y - 20, dir, goreLevel() ? 26 : 0, this.cfg.arenaRoom, 30);
          sparks(w.particles, this.x, this.y - 24, 14, '#ffe9a0', 160);
          this.hp = Math.max(1, this.hp - this.maxHp * 0.05);
          this.phaseExecFx();
        }
      },
      onEnd: () => {
        p.invuln = 0.6;
        s.run.log.executions++;
        s.run.log.execByType.boss = (s.run.log.execByType.boss ?? 0) + 1;
        p.addRage(25);
        w.bus.emit('execution', { type: 'boss', victim: this });
        this.syncHud();
        // straight into the arena change (next tick: world.update clears w.cutscene after this returns)
        this.timers.after(0, () => this.beginTransition(true));
      },
    });
  }
  /** Flavour effect at the impact frame of a phase execution. */
  phaseExecFx(): void {}

  private transitioning = false;
  beginTransition(executed: boolean): void {
    if (this.transitioning || this.phase >= this.cfg.phases) return;
    this.transitioning = true;
    void executed;
    this.mode = 'transition';
    this.staggerWindow = false;
    this.clearHostiles();
    this.phase++;
    audio.sfx('phase_transition');
    audio.music.setPhase(this.phase);
    const p = this.player;
    p.invuln = 99;
    const script = this.transitionScript(this.phase);
    const name = this.phaseNames[this.phase - 1];
    const userScreen = script.screen;
    script.screen = (g, t) => {
      userScreen?.(g, t);
      const r = app.renderer;
      const a = clamp(Math.min(t * 4, (script.dur - t) * 3), 0, 1);
      const sx = Math.round(lerp(-200, 0, easeOut(t * 3)));
      g.globalAlpha = a * 0.85; g.fillStyle = '#0a0b10'; g.fillRect(sx, 40, 260, 34); g.globalAlpha = 1;
      g.fillStyle = this.cfg.accent; g.fillRect(sx, 40, 4, 34);
      drawText(g, `PHASE ${this.phase}`, sx + 12, 44, { color: this.cfg.accent, scale: 1, alpha: a, shadow: null });
      drawText(g, name.toUpperCase(), sx + 12, 55, { color: '#ffffff', scale: 2, alpha: a, shadow: null });
      void r;
    };
    const userEnd = script.onEnd;
    script.onEnd = () => {
      userEnd?.();
      this.transitioning = false;
      this.mode = 'fight';
      this.attackCd = 1.2;
      this.busy = 0;
      p.invuln = 1.0;
      this.barkPhase();
      this.syncHud();
    };
    this.w.cutscene = new ScriptCutscene(script);
    this.syncHud();
  }
  /** Per-boss arena change set piece (2–3 s). */
  abstract transitionScript(phase: number): ScriptOpts;
  /** Per-boss unique finisher; must end by calling defeat(). */
  abstract finisher(): void;
  /** Per-boss AI while fighting. */
  abstract think(dt: number): void;
  /** Called once when the fight starts (after the intro). */
  onFightStart(): void {}

  // ----------------------------------------------------------------------------------------- intro card
  startIntro(): void {
    this.mode = 'intro';
    this.art.preload();
    const p = this.player;
    p.invuln = 99;
    this.facePlayer();
    this.setAnim(this.art.has('intro') ? 'intro' : 'idle', true);
    audio.sfx('boss_intro');
    audio.music.setCombat(true);
    audio.music.setPhase(1);
    const card = new IntroCard(this);
    this.w.cutscene = card;
  }
  endIntro(): void {
    this.mode = 'fight';
    this.player.invuln = 0.8;
    this.attackCd = 1.4;
    this.syncHud();
    this.say(this.rng.pick(this.text.intro), 0);
    this.onFightStart();
  }

  // ----------------------------------------------------------------------------------------- defeat + rewards
  defeat(o: { removed?: boolean; at?: Vec } = {}): void {
    const s = this.s, w = this.w, p = this.player;
    this.mode = 'defeated';
    this.staggerWindow = false;
    this.defeatedAt = w.time;
    this.dismissAdds();
    this.hp = 0;
    this.dying = false;
    this.corpse = true; this.layer = 0;
    if (o.removed) this.dead = true; // gone (boiler / window / rotor) — still counts as not alive for room clears
    s.hud.bossBar = null;
    s.hud.policy = null;
    s.run.log.bossesKilled++;
    s.hud.showBanner(`${this.text.name.toUpperCase()} — TERMINATED`, this.rng.pick(this.text.defeat), '#ffd34d', 4.5);
    audio.sfx('stinger_boss_defeat');
    audio.music.setCombat(false);
    audio.music.setPhase(1);
    p.invuln = 1.5;
    p.bannedVerbs.clear();
    p.onPolicyBreach = null;
    w.bus.emit('kill', { victim: this, killer: p, method: 'execution' });
    const at = o.at ?? this.rewardPoint();
    if (this.cfg.act >= 4 && this.cfg.id === 'ceo') return; // the CEO module runs the ending
    this.timers.after(1.2, () => this.grantRewards(at));
  }
  rewardPoint(): Vec { const r = this.w.map.rooms[this.cfg.arenaRoom]; return { ...r.rewardPoint }; }

  grantRewards(at: Vec): void {
    const s = this.s, w = this.w, p = this.player;
    // major upgrade choice (Enhanced+): the benefits module reads s.data.bossReward
    s.data.bossReward = true;
    const benefit = REWARD_GRANT.benefit;
    if (benefit) benefit(s, { x: at.x - 26, y: at.y });
    else {
      const id = rollWeapon(s.floorRng.loot, this.cfg.act, 2 + p.stats.luck);
      const wi = makeWeapon(wdef(id).rarity >= 1 ? id : 'trophy', { durabilityMult: p.stats.durabilityMult, ammoMult: p.stats.ammoMult });
      wi.rare = true;
      w.add(new Pickup({ kind: 'weapon', weapon: wi, x: at.x - 26, y: at.y }));
    }
    // guaranteed Desk Item
    if (REWARD_GRANT.desk_item) REWARD_GRANT.desk_item(s, { x: at.x + 26, y: at.y });
    else dropCash(w, at.x + 26, at.y, 40);
    // Annual Leave bonus (meta currency, spec 8.2)
    s.run.flags.bossLeave = (Number(s.run.flags.bossLeave) || 0) + 5;
    w.floatText(at.x, at.y - 30, '+5 ANNUAL LEAVE', '#9be37b', 1, 2.5);
    dropCash(w, at.x, at.y + 18, 50 + s.plan.floor_number * 4);
    // full heal before the next act (Hiring Freeze rank 2 removes it — spec 7.4)
    if (!((s.run.modifiers.hiring_freeze ?? 0) >= 2)) {
      const before = p.hp;
      p.hp = p.maxHp; p.shield = p.maxShield;
      if (p.hp > before) w.floatText(p.x, p.y - 40, 'FULL HEAL', '#4fdc7a', 1, 2);
      audio.sfx('heal');
    } else notify({ kind: 'warn', title: 'Hiring Freeze', body: 'No wellbeing budget for boss clears.' });
    notify({ kind: 'good', title: 'Boss cleared', body: 'Rewards issued. Exits are open in the lift lobby.' });
    w.holdClear = false;
  }

  /** QA hook (tools/boss-test.mjs): push the fight to the current phase threshold. */
  debugAdvance(): void {
    if (this.mode !== 'fight') return;
    this.shield = 0;
    this.status.armour = 0;
    this.w.damage(this, { amount: this.hp - this.phaseFloor() + 5, type: 'blunt', method: 'melee', source: this.player, unavoidable: true });
  }

  // ----------------------------------------------------------------------------------------- update
  update(dt: number): void {
    this.updateStatus(dt);
    this.animT += dt;
    if (this.corpse || this.dead) return;
    this.modeT += dt;
    const w = this.w;
    switch (this.mode) {
      case 'dormant': {
        const arena = this.cfg.arenaRoom;
        if (w.currentRoom === arena && (w.rooms[arena]?.locked || w.rooms[arena]?.entered)) this.startIntro();
        else this.idleDormant(dt);
        return;
      }
      case 'intro': case 'transition': case 'finisher': return;
      case 'defeated': return;
      case 'window':
        this.windowT -= dt;
        this.syncHud();
        if (this.windowT <= 0) this.beginTransition(false);
        return;
      case 'final':
        this.syncHud();
        if (this.banim !== 'down' && this.art.has('down')) this.setAnim('down');
        return;
    }
    // fight
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.busy = Math.max(0, this.busy - dt);
    this.barkCd -= dt;
    if (this.barkCd <= 0) { this.barkCd = this.rng.range(7, 12); this.barkPhase(); }
    if (Math.abs(this.kx) + Math.abs(this.ky) > 1) {
      w.moveActor(this, this.kx * dt, this.ky * dt);
      this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    }
    // Board Pressure (spec 7.4): enrage at 15% HP
    if (!this.enraged && (this.s.run.modifiers.board_pressure ?? 0) >= 1 && this.hpFrac <= 0.15) {
      this.enraged = true;
      this.say('The board is watching. No more mercy.', 0);
      notify({ kind: 'boss', title: 'Board Pressure', body: `${this.text.name} is ENRAGED.` });
      app.renderer.shake(5, 0.4);
    }
    if (this.status.stun > 0 || this.staggered > 0) { this.setAnim(this.stunAnim); this.vx = this.vy = 0; this.syncHud(); return; }
    this.think(dt);
    this.syncHud();
  }
  idleDormant(_dt: number): void { if (this.banim !== 'idle') this.setAnim('idle'); }

  // ----------------------------------------------------------------------------------------- render
  render(g: Ctx): void {
    if (this.dead) return;
    const x = Math.round(this.x), y = Math.round(this.y);
    if (!this.corpse) {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      const sw = this.radius * 2 + 10;
      g.beginPath(); g.ellipse(x, y, sw / 2, 4, 0, 0, Math.PI * 2); g.fill();
    }
    this.renderUnder(g);
    let tint = this.tintCol, tintAmt = this.tintAmt;
    if (this.enraged && !tint) { tint = '#ff2a1a'; tintAmt = 0.18 + 0.1 * Math.sin(this.w.time * 10); }
    if (this.status.electrified > 0) { tint = '#8fe8ff'; tintAmt = 0.55; }
    const anim = this.art.has(this.banim) ? this.banim : 'idle';
    this.art.draw(g, anim, this.dir, this.animT, x, y, { flash: this.hitFlash, tint, tintAmt, squash: this.squash });
    this.renderOver(g);
    if (this.staggerWindow && (this.mode === 'window' || this.mode === 'final')) {
      const bob = Math.round(Math.sin(this.w.time * 10) * 2);
      const top = y - this.height - 18 + bob;
      g.fillStyle = '#ffd34d';
      g.fillRect(x - 1, top, 3, 4); g.fillRect(x - 4, top + 4, 9, 1); g.fillRect(x - 3, top + 5, 7, 1); g.fillRect(x - 2, top + 6, 5, 1); g.fillRect(x - 1, top + 7, 3, 1);
      drawText(g, this.mode === 'final' ? 'EXECUTE' : 'GRAB', x, top - 10, { align: 'center', color: '#ffd34d', outline: '#000' });
      if (this.mode === 'window') { g.fillStyle = '#000'; g.fillRect(x - 15, top - 14, 30, 3); g.fillStyle = '#ffd34d'; g.fillRect(x - 14, top - 13, Math.round(28 * clamp(this.windowT / 2.6, 0, 1)), 1); }
      for (let i = 0; i < 3; i++) { const a = this.w.time * 5 + i * 2.1; g.fillStyle = '#ffe9a0'; g.fillRect(Math.round(x + Math.cos(a) * 10), Math.round(y - this.height + 2 + Math.sin(a) * 3), 2, 2); }
    }
  }
  renderUnder(_g: Ctx): void {}
  renderOver(_g: Ctx): void {}
}

// ---------------------------------------------------------------------------------------------------------------
/** Spec 6.1 intro card: name, job title and satirical tagline with a large portrait. Screen-space, ~3.4 s. */
export class IntroCard implements Cutscene {
  t = 0;
  camera: Vec;
  zoom = 1;
  dur = 3.6;
  portrait: HTMLCanvasElement;
  done = false;
  constructor(public boss: Boss) {
    this.camera = { x: boss.x, y: boss.y - 24 };
    this.portrait = boss.cfg.portrait ?? boss.art.portrait('intro');
  }
  update(dt: number): boolean {
    this.t += dt;
    const b = this.boss;
    b.animT += dt;
    this.zoom = 1 + 0.25 * easeOut(this.t / 0.8);
    const inp = app.input;
    if (this.t > 1.0 && this.t < this.dur - 0.35 && (inp.pressed('interact') || inp.pressed('confirm') || inp.pressed('melee'))) this.t = this.dur - 0.35;
    if (this.t >= this.dur) { b.endIntro(); return true; }
    return false;
  }
  renderScreen(g: Ctx): void {
    const r = app.renderer, W = r.W, H = r.H;
    const b = this.boss, t = this.t, d = this.dur;
    const out = clamp((d - t) / 0.35, 0, 1);
    const inK = easeOut(t / 0.45);
    letterbox(g, Math.min(t * 4, out));
    // dim + speed lines
    g.globalAlpha = 0.45 * Math.min(1, t * 3) * out; g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const acc = b.cfg.accent;
    const cy = Math.round(H / 2 - 4);
    const bandH = 120;
    const bx = Math.round(lerp(-W, 0, inK) + (1 - out) * -W);
    g.globalAlpha = 0.92; g.fillStyle = '#0d0e14'; g.fillRect(bx, cy - bandH / 2, W, bandH); g.globalAlpha = 1;
    g.fillStyle = acc; g.fillRect(bx, cy - bandH / 2, W, 2); g.fillRect(bx, cy + bandH / 2 - 2, W, 2);
    // diagonal stripes in the band
    g.save(); g.beginPath(); g.rect(bx, cy - bandH / 2 + 2, W, bandH - 4); g.clip();
    g.globalAlpha = 0.08; g.fillStyle = acc;
    const off = Math.round((t * 60) % 24);
    for (let x = -bandH; x < W + bandH; x += 24) { g.beginPath(); g.moveTo(bx + x + off, cy + bandH / 2); g.lineTo(bx + x + off + 10, cy + bandH / 2); g.lineTo(bx + x + off + 10 + bandH, cy - bandH / 2); g.lineTo(bx + x + off + bandH, cy - bandH / 2); g.fill(); }
    g.restore(); g.globalAlpha = 1;
    // portrait (integer ×3) in a framed well, slides from the left
    const ps = 3;
    const pw = this.portrait.width * ps, ph = this.portrait.height * ps;
    const px = Math.round(lerp(-pw - 40, 34, easeOut((t - 0.1) / 0.45)) + (1 - out) * -300);
    const py = cy + bandH / 2 - ph + 8;
    g.fillStyle = acc; g.globalAlpha = 0.25; g.fillRect(px - 6, cy - bandH / 2 + 8, pw + 12, bandH - 16); g.globalAlpha = 1;
    g.save(); g.beginPath(); g.rect(px - 6, cy - bandH / 2 - 30, pw + 12, bandH + 30 - 2); g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.portrait, px, py, pw, ph);
    g.restore();
    // scanline shimmer over the portrait
    g.globalAlpha = 0.12; g.fillStyle = '#000'; for (let y = cy - bandH / 2 + 2; y < cy + bandH / 2 - 2; y += 2) g.fillRect(px - 6, y, pw + 12, 1); g.globalAlpha = 1;
    // text slides from the right
    const tx0 = px + pw + 30;
    const tx = Math.round(lerp(W + 40, tx0, easeOut((t - 0.25) / 0.45)) + (1 - out) * 400);
    const a = clamp((t - 0.25) * 4, 0, 1) * out;
    drawText(g, b.cfg.id === 'director' ? 'OPTIONAL MEETING' : `ACT ${b.cfg.act} — BOSS ENCOUNTER`, tx, cy - 50, { color: acc, alpha: a, shadow: null });
    const nameSc = measure(b.text.name.toUpperCase(), 4) < W - tx - 16 ? 4 : 3;
    drawText(g, b.text.name.toUpperCase(), tx, cy - 38, { color: '#ffffff', scale: nameSc, alpha: a, outline: '#000' });
    drawText(g, b.text.title.toUpperCase(), tx, cy - 38 + nameSc * 9 + 4, { color: acc, scale: 2, alpha: a, outline: '#000' });
    // tagline types out
    const tag = `"${b.text.tagline}"`;
    const n = Math.floor(clamp((t - 0.9) / 0.9, 0, 1) * tag.length);
    const lines = wrap(tag.slice(0, n), W - tx - 20, 1);
    lines.forEach((l, i) => drawText(g, l, tx, cy + 22 + i * 11, { color: '#e8e0d0', alpha: out, shadow: null }));
    // corporate small print
    drawText(g, `EMPLOYEE ID ${(b.cfg.act * 7919 + 1000).toString(16).toUpperCase()}  /  STATUS: HOSTILE  /  REPORTS TO: THE BOARD`, tx, cy + bandH / 2 - 14, { color: '#7a7f8a', alpha: a, shadow: null });
    if (t > 1.0) drawText(g, 'SKIP', W - 10, H - 20, { align: 'right', color: '#8a8f9a', alpha: 0.7 * out, shadow: null });
  }
}

// Helpers shared by boss modules -----------------------------------------------------------------------------
export function randAround(c: Vec, r: number): Vec { const a = fxRng.range(0, Math.PI * 2); return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }; }
export { fromAngle, angleTo, dist, clamp, lerp, norm };
