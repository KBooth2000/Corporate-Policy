// Act 2 boss (spec 6.3): Sienna Cross, Head of Sales — floor 10, the sales floor with a sales gong.
// P1 open-plan: dash charges; every gong strike summons Sales Reps — destroy the gong to stop the summons.
// P2 quarter-end: leaderboard screens on every wall + a commission meter that speeds her up; contract volleys —
//    smash the screens to drain the meter.
// P3 President's Club: she smashes the floor-to-ceiling windows, the wind drags everyone to the edge; lunging grabs
//    try to throw you out (telegraphed, escapable by mashing, damage not death). Finisher: boss defenestration.
import { BOSS_FLOORS } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import type { FloorRequest, LightDef } from '../world-types';
import { TILE, T } from '../world-types';
import { Boss, Layer, ScriptOpts, ScriptCutscene, easeOut, clamp, lerp, angleTo, dist, fromAngle } from './boss';
import { buildArena, Grid, coreLobby, lobbyDoor, ArenaMap, mark, roomOfMark } from './arena';
import { MAT } from '../gen/materials';
import { salesArt } from '../../art/bosses/sales';
import { gongSprite, screenSprite, contractSprite } from '../../art/bosses/props';
import type { Ctx } from '../../render/canvas';
import { drawSpriteRot } from '../../render/canvas';
import { drawText } from '../../render/font';
import { audio } from '../../audio/audio';
import { app } from '../../core/app';
import { fxRng } from '../../core/rng';
import { sparks, debrisBurst, smokePuff } from '../fx';
import type { PropRT } from '../world';
import { registerProp } from '../world';
import { Enemy } from '../enemy';
import type { Vec } from '../../core/math';
import type { PropKind } from '../../data/ids';
import { FallSequence } from './fall';
import { Projectile } from '../projectile';

const NAVY_NEON: LightDef[] = [];
void NAVY_NEON;

function buildMap(req: FloorRequest): ArenaMap {
  const g = new Grid(52, 26, ' ');
  g.room(13, 1, 50, 24, '#', '.');
  // floor-to-ceiling glass on the north and east walls
  g.fill(15, 1, 48, 1, 'W');
  g.fill(50, 4, 50, 21, 'W');
  coreLobby(g, 0, 6);
  lobbyDoor(g, 11, 13);
  g.set(32, 13, 'a'); g.set(32, 8, 'b'); g.set(32, 4, 'g');
  for (const [x, y] of [[15, 5], [15, 21], [48, 6], [48, 20]]) g.set(x, y, 'r');
  for (const [x, y] of [[20, 22], [32, 22], [44, 22], [21, 3], [43, 3], [48, 13]]) g.set(x, y, 's');
  const neon = (x: number, y: number, c: string): LightDef => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 120, color: c, intensity: 0.9, flicker: 'none' });
  const desks: { kind: string; tx: number; ty: number }[] = [];
  for (const x of [17, 21, 25, 38, 42, 46]) for (const y of [9, 16]) desks.push({ kind: 'desk', tx: x - 1, ty: y });
  return buildArena(req, {
    rows: g.rows(), roomMarks: ['a'],
    rooms: [
      { kind: 'core' },
      { kind: 'boss', material: MAT.CARPET, darkness: 0.12, lights: [neon(20, 6, '#00d1c1'), neon(44, 6, '#ff6a00'), neon(20, 19, '#3d7bff'), neon(44, 19, '#ffd400'), neon(32, 12, '#e9f1ff')] },
    ],
    props: [
      { kind: 'boss_gong', tx: 31, ty: 3, fw: 2, fh: 1, cw: 30, ch: 10, solid: true },
      ...desks.map((d) => ({ kind: d.kind, tx: d.tx, ty: d.ty })),
      { kind: 'plant_large', tx: 15, ty: 3 }, { kind: 'plant_large', tx: 48, ty: 3 }, { kind: 'water_cooler', tx: 15, ty: 18 },
    ],
  });
}

// the gong and the leaderboards take hits from anything (player swings, thrown objects, bodies)
registerProp('boss_gong' as PropKind, { maxHp: 70 });
registerProp('boss_screen' as PropKind, { maxHp: 26 });

class HeadOfSales extends Boss {
  map: ArenaMap;
  gong: PropRT | null = null;
  gongCd = 2;
  gongWobble = 0;
  screens: PropRT[] = [];
  meter = 0;
  dash: { ang: number; t: number; dur: number; hit: boolean; grab: boolean } | null = null;
  hold: { t: number; escape: number; target: Vec; dangle: number } | null = null;
  toGong = false;
  wind = 0;
  actions = 0;
  windowY: number;
  windLoop: { stop(f?: number): void } | null = null;

  constructor(s: GameplayScene, map: ArenaMap) {
    const b = mark(map, 'b');
    super(s, { id: 'head_of_sales', act: 2, maxHp: 1300, art: salesArt(), radius: 9, height: 66, speed: 62, phases: 3, arenaRoom: roomOfMark(map, 'a'), accent: '#ff6a00' }, b.x, b.y);
    this.map = map;
    this.phaseNames = ['The Sales Floor', 'Quarter-End', "President's Club"];
    this.phaseExecCaptions = ['DEAL BROKEN', 'TARGET MISSED'];
    this.voiceSeed = 0x5a1e5;
    this.windowY = (map.rooms[this.cfg.arenaRoom].ty) * TILE;
  }

  override onAdded(): void {
    super.onAdded();
    for (const p of this.w.props) if ((p.def.kind as string) === 'boss_gong') {
      this.gong = p;
      this.setGongSprite();
    }
    this.w.add(new Layer(2, (g) => this.drawAir(g)));
    this.w.add(new Layer(1, (g) => this.drawScreens(g), (dt) => this.tick(dt), () => -1e6));
  }
  setGongSprite(): void {
    const p = this.gong; if (!p) return;
    const wb = Math.round(this.gongWobble);
    p.spriteCache.set('intact', gongSprite('intact', wb)); p.spriteCache.set('damaged', gongSprite('damaged', wb));
    p.spriteCache.set('destroyed', gongSprite('destroyed')); p.spriteCache.set('active', gongSprite('intact', wb)); p.spriteCache.set('used', gongSprite('destroyed'));
  }
  gongAlive(): boolean { return !!this.gong && this.gong.state !== 'destroyed'; }

  tick(dt: number): void {
    if (this.mode === 'dormant') return;
    // gong wobble
    if (Math.abs(this.gongWobble) > 0.1) { this.gongWobble *= -0.86; this.setGongSprite(); }
    // gong destroyed → summons stop, she throws a tantrum
    if (this.gong && this.gong.state === 'destroyed' && !this.gong.data.mourned) {
      this.gong.data.mourned = true;
      this.gong.solid = false; this.w.rebuildPropBlock();
      audio.sfx('gong', { x: this.gong.def.x, y: this.gong.def.y, pitch: 0.6 });
      debrisBurst(this.w.particles, this.gong.def.x, this.gong.def.y - 20, 18, ['#d8a838', '#7a2a22', '#f6dc8a'], this.cfg.arenaRoom);
      this.w.floatText(this.gong.def.x, this.gong.def.y - 50, 'GONG DESTROYED — NO MORE REPS', '#ffd34d', 1, 2.4);
      if (this.mode === 'fight') {
        this.say('MY GONG! Do you know what that gong has closed?!', 0);
        this.toGong = false;
        this.status.stun = Math.max(this.status.stun, 1.8); this.stunAnim = 'tantrum';
      }
    }
    // screens: commission meter (P2+)
    if (this.phase >= 2 && this.mode === 'fight') this.meter = clamp(this.meter + dt * 0.03, 0, 1);
    for (const sc of this.screens) {
      if (sc.state === 'destroyed' && !sc.data.drained) {
        sc.data.drained = true; sc.data.reboot = 16;
        this.meter = Math.max(0, this.meter - 0.34);
        sparks(this.w.particles, sc.def.x, sc.def.y - 30, 24, '#6fe8ff', 180);
        debrisBurst(this.w.particles, sc.def.x, sc.def.y - 28, 14, ['#9aa4b4', '#cfe8f4', '#1c1d24'], this.cfg.arenaRoom, 'glass');
        audio.sfx('screen_smash', { x: sc.def.x, y: sc.def.y });
        this.w.floatText(sc.def.x, sc.def.y - 52, 'COMMISSION −34%', '#6fe8ff', 1, 1.6);
        if (this.mode === 'fight' && this.rng.chance(0.5)) this.say(this.rng.pick(['That was my leaderboard!', 'Do you know what those screens cost?', 'You can\'t smash a target.']), 0);
      }
      if (sc.data.drained && this.mode === 'fight') {
        sc.data.reboot -= dt;
        if (sc.data.reboot <= 0) { sc.data.drained = false; sc.hp = sc.maxHp; sc.state = 'intact'; sc.solid = true; this.w.rebuildPropBlock(); this.w.floatText(sc.def.x, sc.def.y - 52, 'REBOOTED', '#ffd34d'); }
      }
    }
    // President's Club wind: everyone is dragged to the broken windows
    if (this.wind > 0) {
      for (const a of this.w.actors) {
        if (!a.alive || a.grabbedBy || a === this || this.w.roomAt(a.x, a.y) !== this.cfg.arenaRoom) continue;
        const pull = a.team === 'player' ? 34 : 48;
        const k = clamp(1 - (a.y - this.windowY) / 360, 0.35, 1);
        this.w.moveActor(a, 0, -pull * k * this.wind * dt);
        // reps standing at the edge get blown out (comedy)
        if (a instanceof Enemy && a.y - this.windowY < 22 && !a.thrown) {
          const tx = Math.floor(a.x / TILE), ty = Math.floor((a.y - 18) / TILE);
          if (this.w.tile(tx, ty) === T.WINDOW_BROKEN) { this.w.floatText(a.x, a.y - 30, 'BLOWN AWAY', '#cfe8f4'); a.defenestrated(this.player); }
        }
      }
      if (fxRng.chance(dt * 22)) {
        const r = app.renderer;
        this.w.particles.spawn({ kind: 'paper', x: r.viewX() + fxRng.range(0, r.W), y: r.viewY() + r.H + 10, vx: fxRng.range(-30, 30), vy: -fxRng.range(160, 260), life: 2, col: '#f2efe6', size: 3, drag: 0 });
      }
    }
  }

  // ----------------------------------------------------------------------------------------- AI
  think(dt: number): void {
    const p = this.player;
    if (this.status.stun <= 0) this.stunAnim = 'stagger';
    if (this.hold) { this.updateHold(dt); return; }
    if (this.dash) { this.updateDash(dt); return; }
    if (this.toGong) { this.updateToGong(dt); return; }
    if (this.busy > 0) { this.vx = this.vy = 0; return; }
    this.gongCd -= dt;
    const speedK = 1 + this.meter * 0.9;
    const d = this.distToPlayer();
    if (this.attackCd <= 0) {
      this.actions++;
      if (this.phase === 1 && this.gongAlive() && this.gongCd <= 0 && this.liveAdds() < 3) { this.toGong = true; return; }
      if (this.phase === 3 && this.actions % 2 === 0 && d < 220) { this.startDash(angleTo(this, p), true); return; }
      if (this.phase >= 2 && this.actions % 3 === 0) { this.contracts(this.phase === 2 ? 5 : 4); return; }
      if (this.phase === 1 && this.actions % 4 === 3) { this.contracts(3); return; }
      if (d < 44) { this.slap(); return; }
      if (d < 260) { this.startDash(angleTo(this, p), false); return; }
    }
    if (d > 70) { this.chase(dt, speedK); this.setAnim('walk'); }
    else { this.vx = this.vy = 0; this.facePlayer(); this.setAnim('idle'); this.attackCd = Math.min(this.attackCd, 0.4); }
  }

  cd(base: number): number { return base * (1 - this.meter * 0.45); }

  slap(): void {
    const a = angleTo(this, this.player);
    this.face(a);
    this.setAnim('throw_w', true);
    const wd = this.windup(0.5);
    this.busy = wd + 0.3; this.attackCd = this.cd(1.0);
    this.tele({ kind: 'arc', x: this.x, y: this.y - 8, r: 48, angle: a, half: 0.9 }, 0.5, (sh) => {
      this.setAnim('throw', true);
      audio.sfx('enemy_swing', { x: this.x, y: this.y });
      if (this.hitShape(sh, 12, { kb: 200 })) this.meter = clamp(this.meter + 0.1, 0, 1);
    });
  }

  startDash(ang: number, grab: boolean): void {
    const hit = this.w.raycast(this.x, this.y - 4, this.x + Math.cos(ang) * 200, this.y - 4 + Math.sin(ang) * 200, { props: true });
    const len = Math.max(60, Math.min(grab ? 150 : 190, hit ? dist(this, hit) - 8 : 200));
    this.face(ang);
    this.setAnim(grab ? 'lunge_w' : 'dash_w', true);
    const wd = this.windup(grab ? 0.75 : 0.62);
    this.busy = wd + 0.05;
    this.attackCd = this.cd(grab ? 1.6 : 1.2);
    if (grab) this.say(this.rng.pick(['Let\'s take this offline.', 'Step into my office. It\'s outside.', 'Closing time.']), 0);
    this.tele({ kind: 'line', x: this.x, y: this.y - 4, angle: ang, len, width: grab ? 24 : 20 }, grab ? 0.75 : 0.62, () => {
      const sp = 360 * (1 + this.meter * 0.5);
      this.dash = { ang, t: 0, dur: len / sp, hit: false, grab };
      this.setAnim(grab ? 'lunge' : 'dash', true);
      audio.sfx('whoosh', { x: this.x, y: this.y });
    });
  }
  updateDash(dt: number): void {
    const D = this.dash!;
    D.t += dt;
    const sp = 360 * (1 + this.meter * 0.5);
    const v = fromAngle(D.ang, sp * dt);
    const r = this.w.moveActor(this, v.x, v.y);
    this.face(D.ang);
    if (fxRng.chance(0.7)) this.w.particles.spawn({ kind: 'smoke', x: this.x, y: this.y - 4, life: 0.3, col: '#ffd0b0', size: 3 });
    const p = this.player;
    if (!D.hit && dist(this, p) < this.radius + 10 && p.alive) {
      D.hit = true;
      if (D.grab && p.invuln <= 0 && p.dashT <= 0) { this.dash = null; this.startHold(); return; }
      const dealt = this.w.damage(p, { amount: this.dmg(14), type: 'blunt', method: 'melee', source: this, knockback: 260, dir: D.ang });
      if (dealt > 0) this.meter = clamp(this.meter + 0.12, 0, 1);
    }
    if (r.hitX || r.hitY || D.t >= D.dur) { this.dash = null; this.busy = 0.45; this.setAnim('idle'); }
  }

  // -- the lunging grab (P3): escapable by mashing, ends with you hung out of the window (damage, not death)
  startHold(): void {
    const p = this.player;
    const tx = clamp(this.x, (this.map.rooms[this.cfg.arenaRoom].tx + 2) * TILE, (this.map.rooms[this.cfg.arenaRoom].tx + this.map.rooms[this.cfg.arenaRoom].tw - 2) * TILE);
    this.hold = { t: 0, escape: 0, target: { x: tx, y: this.windowY + 22 }, dangle: 0 };
    p.swing = null; p.charging = false;
    audio.sfx('grab', { x: this.x, y: this.y });
    this.w.floatText(p.x, p.y - 40, 'GRABBED — MASH TO ESCAPE!', '#ffd34d', 1, 1.5);
    this.setAnim('carry', true);
  }
  updateHold(dt: number): void {
    const H = this.hold!;
    const p = this.player;
    H.t += dt;
    p.status.stun = Math.max(p.status.stun, 0.12);
    const c = p.ctl;
    if (c && (c.pressed('melee') || c.pressed('dash') || c.pressed('grab') || c.pressed('interact') || c.pressed('heavy') || c.pressed('ranged'))) {
      H.escape += 0.2; p.squash = 0.85; audio.sfx('enemy_hurt', { x: this.x, y: this.y, vol: 0.5 });
    }
    H.escape = Math.max(0, H.escape - dt * 0.18);
    if (H.escape >= 1) {
      // broke free: she stumbles — opening
      this.hold = null;
      p.status.stun = 0;
      p.invuln = Math.max(p.invuln, 0.6);
      p.kx += Math.cos(angleTo(this, p)) * 160; p.ky += Math.sin(angleTo(this, p)) * 160;
      this.status.stun = 1.6; this.stunAnim = 'stagger';
      this.w.floatText(p.x, p.y - 40, 'BROKE FREE!', '#8af0a0', 1, 1.2);
      this.say('Fine. Let\'s circle back.', 0);
      return;
    }
    if (H.dangle > 0) {
      H.dangle -= dt;
      p.x = this.x; p.y = this.windowY + 6;
      if (H.dangle <= 0) {
        // she lets go — you catch the frame and haul yourself back in
        this.hold = null;
        p.status.stun = 0.5;
        p.y = this.windowY + 40; p.ky += 160;
        this.w.damage(p, { amount: this.dmg(18), type: 'fall', method: 'melee', source: this, knockback: 0, unavoidable: false });
        this.w.floatText(p.x, p.y - 40, 'CLUNG ON!', '#ffffff', 1, 1.2);
        p.invuln = Math.max(p.invuln, 0.8);
        this.busy = 0.8; this.attackCd = this.cd(1.4);
      }
      return;
    }
    // carry you to the edge
    const r = this.moveTo(H.target, 58, dt);
    this.setAnim('carry');
    p.x = this.x + Math.cos(this.facing) * 12; p.y = this.y + Math.sin(this.facing) * 6 - 2;
    if (dist(this, H.target) < 8 || r.hitY || H.t > 4) { H.dangle = 0.55; this.face(-Math.PI / 2); audio.sfx('scream', { x: p.x, y: p.y, vol: 0.6 }); app.renderer.shake(4, 0.3); }
  }

  goToGong(): Vec { const gp = this.gong!.def; return { x: gp.x, y: gp.y + 18 }; }
  updateToGong(dt: number): void {
    if (!this.gongAlive()) { this.toGong = false; return; }
    const t = this.goToGong();
    if (dist(this, t) > 8) { this.moveTo(t, this.speed * 1.5 * (1 + this.meter * 0.5), dt); this.setAnim('walk'); return; }
    this.toGong = false;
    this.strikeGong();
  }
  strikeGong(): void {
    const g = this.gong!;
    this.face(-Math.PI / 2);
    this.setAnim('gong', true);
    this.busy = 1.0; this.attackCd = 1.2; this.gongCd = 12;
    this.timers.after(0.3, () => {
      if (this.mode !== 'fight' || !this.gongAlive()) return;
      audio.sfx('gong', { x: g.def.x, y: g.def.y });
      app.renderer.shake(5, 0.4);
      this.gongWobble = 2; this.setGongSprite();
      this.w.particles.spawn({ kind: 'ring', x: g.def.x, y: g.def.y - 26, life: 0.6, col: '#f6dc8a', size: 60 });
      this.say(this.rng.pick(['The gong rings. Destiny calls.', 'Another deal closed!', 'Sales team — converge!']), 2);
      // shockwave (telegraphed ring) + reps arrive
      this.tele({ kind: 'ring', x: g.def.x, y: g.def.y, r: 92, inner: 30 }, 0.6, (sh) => this.hitShape(sh, 9, { kb: 220 }), { keep: true });
      const rs = this.map.marks.r ?? [];
      const picks = [this.rng.int(0, rs.length - 1), this.rng.int(0, rs.length - 1)];
      for (const i of picks) this.timers.after(0.5, () => { if (this.mode === 'fight') this.spawnAdd('sales_rep', rs[i], this.phase >= 2 ? 1 : 0); });
    });
  }

  contracts(n: number): void {
    const p = this.player;
    const base = angleTo(this, p);
    this.face(base);
    this.setAnim('throw_w', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.35; this.attackCd = this.cd(1.4);
    audio.sfx('contract_throw', { x: this.x, y: this.y });
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.22;
      this.tele({ kind: 'line', x: this.x, y: this.y - 6, angle: a, len: 220, width: 8 }, 0.6, () => {
        if (i === 0) this.setAnim('throw', true);
        const pr = this.shoot({ angle: a, speed: 210, kind: 'contract', dmg: 9, life: 1.4, radius: 4, spin: 10 });
        pr.o.onHit = (_q, t) => { if (t === this.player) this.meter = clamp(this.meter + 0.05, 0, 1); };
      }, { follow: (sh: any) => { sh.x = this.x; sh.y = this.y - 6; } });
    }
  }

  // ----------------------------------------------------------------------------------------- phases
  override onWindowStart(): void { this.dash = null; this.toGong = false; this.releaseHold(); }
  override onFinalStart(): void { this.dash = null; this.releaseHold(); }
  releaseHold(): void { if (this.hold) { this.hold = null; this.player.status.stun = 0; } }
  override phaseExecFx(): void {
    for (let i = 0; i < 20; i++) this.w.particles.spawn({ kind: 'paper', x: this.x, y: this.y - 30, vx: fxRng.range(-120, 120), vy: fxRng.range(-120, 40), life: 1.2, col: '#f2efe6', size: 3, drag: 2 });
  }

  transitionScript(phase: number): ScriptOpts {
    const w = this.w;
    if (phase === 2) {
      // QUARTER-END: leaderboards drop from the ceiling on every wall
      const spots = this.map.marks.s ?? [];
      let made = false;
      return {
        dur: 2.7,
        camera: (t) => { const i = Math.min(spots.length - 1, Math.floor(t / 0.42)); const sp = spots[i] ?? this; return t < 2.4 ? { x: lerp(this.x, sp.x, 0.7), y: lerp(this.y, sp.y, 0.7) - 20 } : { x: this.player.x, y: this.player.y }; },
        zoom: () => 1.15,
        update: (t, dt) => {
          this.animT += dt;
          if (!made) {
            made = true;
            this.setAnim('intro', true);
            for (const sp of spots) {
              const pr = w.addProp({ id: 900 + this.screens.length, kind: 'boss_screen' as PropKind, x: sp.x, y: sp.y + 8, w: 30, h: 8, solid: true, variant: 0, roomId: this.cfg.arenaRoom, facing: 0 });
              pr.oy = -120; pr.data.drop = this.screens.length * 0.3;
              this.screens.push(pr);
            }
            w.rebuildPropBlock();
            audio.sfx('commission_ding');
          }
          for (const sc of this.screens) {
            sc.data.drop -= dt;
            if (sc.data.drop <= 0 && sc.oy < 0) { sc.oy = Math.min(0, sc.oy + dt * 520); if (sc.oy === 0 && !sc.data.landed) { sc.data.landed = true; audio.sfx('thud', { x: sc.def.x, y: sc.def.y }); app.renderer.shake(3, 0.15); sparks(w.particles, sc.def.x, sc.def.y - 20, 8, '#6fe8ff'); } }
          }
        },
        caption: 'QUARTER-END', sub: 'Smash the leaderboards to drain her commission meter.', captionAt: 0.9, captionCol: '#6fe8ff',
        onEnd: () => { for (const sc of this.screens) sc.oy = 0; this.meter = 0.2; },
      };
    }
    // PRESIDENT'S CLUB: she smashes the curtain wall
    const room = this.map.rooms[this.cfg.arenaRoom];
    const wy = room.ty - 1;
    const xs: number[] = [];
    for (let x = room.tx; x < room.tx + room.tw; x++) if (w.tile(x, wy) === T.WINDOW) xs.push(x);
    const cx = Math.round(this.x / TILE);
    xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
    let i = 0;
    const from = { x: this.x, y: this.y };
    const at = { x: clamp(this.x, (room.tx + 3) * TILE, (room.tx + room.tw - 3) * TILE), y: (room.ty + 1.6) * TILE };
    return {
      dur: 2.9,
      camera: (t) => ({ x: lerp(from.x, at.x, easeOut(t / 0.6)), y: at.y + 30 }),
      zoom: (t) => 1.2 + 0.1 * Math.sin(t * 2),
      update: (t, dt) => {
        this.animT += dt;
        if (t < 0.6) { const k = easeOut(t / 0.6); this.x = lerp(from.x, at.x, k); this.y = lerp(from.y, at.y, k); this.face(-Math.PI / 2); this.setAnim('walk'); }
        else if (t < 0.7) this.setAnim('smash', true);
        if (t > 0.75) {
          const want = Math.min(xs.length, Math.floor((t - 0.75) * 26));
          while (i < want) {
            const tx = xs[i++];
            w.smashWindow(tx, wy);
            if (i % 3 === 0) app.renderer.shake(4, 0.2);
          }
          this.wind = Math.min(1, (t - 0.75) / 1.2);
        }
        if (t > 1.0 && fxRng.chance(0.6)) w.particles.spawn({ kind: 'paper', x: this.x + fxRng.range(-200, 200), y: this.y + fxRng.range(0, 160), vx: fxRng.range(-20, 20), vy: -fxRng.range(180, 260), life: 1.6, col: '#f2efe6', size: 3, drag: 0 });
      },
      caption: "PRESIDENT'S CLUB", sub: 'The wind drags you to the edge. Mash to escape her grabs.', captionAt: 1.2, captionCol: '#ffd34d',
      onEnd: () => { while (i < xs.length) w.smashWindow(xs[i++], wy); this.wind = 1; this.windLoop = audio.loop('wind', { vol: 0.5 }); },
    };
  }

  // ----------------------------------------------------------------------------------------- finisher: defenestration
  finisher(): void {
    const w = this.w, p = this.player, s = this.s;
    const room = this.map.rooms[this.cfg.arenaRoom];
    const edge = { x: clamp(this.x, (room.tx + 2) * TILE, (room.tx + room.tw - 2) * TILE), y: room.ty * TILE + 14 };
    const from = { x: this.x, y: this.y };
    let thrown = false;
    p.invuln = 99;
    this.wind = 0.4;
    w.cutscene = new ScriptCutscene({
      dur: 1.25,
      camera: () => ({ x: edge.x, y: edge.y + 20 }),
      zoom: (t) => 1.3 + 0.4 * easeOut(t / 1.2),
      caption: 'DEAL CLOSED', captionAt: 0.75,
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        const k = easeOut(Math.min(1, t / 0.7));
        this.x = lerp(from.x, edge.x, k); this.y = lerp(from.y, edge.y + 10, k);
        p.x = this.x; p.y = this.y + 16; p.face(-Math.PI / 2); p.setAnim('exec_hold');
        this.setAnim('grabbed');
        if (!thrown && t > 0.8) {
          thrown = true;
          p.setAnim('exec_hurl', true);
          audio.sfx('whoosh'); audio.sfx('window_smash', { x: this.x, y: this.y });
          app.renderer.shake(8, 0.4);
          debrisBurst(w.particles, this.x, this.y - 20, 20, ['#cfe8f4', '#9fd0e6', '#ffffff'], this.cfg.arenaRoom, 'glass');
          this.y = edge.y - 30;
        }
        if (thrown) this.y -= dt * 300;
      },
      onEnd: () => {
        // hand over to the fall cam on the next tick
        this.timers.after(0, () => {
          w.cutscene = new FallSequence({
            art: this.art, anim: 'fall', floors: s.plan.floor_number, stamp: 'DEAL CLOSED', stampSub: 'Sienna Cross has left the building.', flutter: 'contracts', accent: '#ff6a00',
            onEnd: () => {
              p.invuln = 0.8;
              s.run.log.executions++; s.run.log.defenestrations++;
              s.run.log.execByType.defenestration = (s.run.log.execByType.defenestration ?? 0) + 1;
              w.bus.emit('execution', { type: 'defenestration', victim: this });
              this.wind = 0; this.windLoop?.stop(1);
              this.timers.after(0, () => this.defeat({ removed: true, at: { x: edge.x, y: edge.y + 80 } }));
            },
          });
        });
      },
    });
  }

  // ----------------------------------------------------------------------------------------- render
  drawScreens(g: Ctx): void {
    // live leaderboard content on the screen totems
    const t = this.w.time;
    for (const sc of this.screens) {
      const bx = Math.round(sc.def.x - 17), by = Math.round(sc.def.y + sc.oy - 52);
      if (sc.state === 'destroyed') { sc.spriteCache.set('destroyed', screenSprite('broken')); continue; }
      sc.spriteCache.set('intact', screenSprite('on')); sc.spriteCache.set('damaged', screenSprite('on'));
      void bx; void by;
    }
    void t;
  }
  drawScreenContent(g: Ctx): void {
    const t = this.w.time;
    for (const sc of this.screens) {
      if (sc.state === 'destroyed' || sc.oy < -2) continue;
      const x0 = Math.round(sc.def.x - 15), y0 = Math.round(sc.def.y + sc.oy - 51);
      g.fillStyle = '#0a1a24'; g.fillRect(x0, y0, 30, 24);
      g.fillStyle = '#6fe8ff'; g.fillRect(x0 + 1, y0 + 1, 28, 1);
      // leaderboard rows: Sienna on top, the rest shrinking
      const rows = [this.meter, 0.62, 0.41, 0.25];
      rows.forEach((v, i) => {
        g.fillStyle = i === 0 ? '#ffd34d' : '#2bb5c8';
        g.fillRect(x0 + 2, y0 + 4 + i * 4, Math.max(1, Math.round(26 * v)), 2);
      });
      // commission meter + flashing %
      g.fillStyle = '#1c1d24'; g.fillRect(x0 + 2, y0 + 20, 26, 3);
      g.fillStyle = this.meter > 0.75 && Math.floor(t * 8) % 2 ? '#ff6a00' : '#ffd34d'; g.fillRect(x0 + 2, y0 + 20, Math.round(26 * this.meter), 3);
    }
  }
  drawAir(g: Ctx): void {
    this.drawScreenContent(g);
    const r = app.renderer;
    // commission meter under the boss bar (screen-anchored)
    if (this.phase >= 2 && this.mode !== 'defeated') {
      const vx = r.viewX(), vy = r.viewY();
      const w = 160, x = Math.round(vx + r.W / 2 - w / 2), y = Math.round(vy + 30);
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x - 2, y - 2, w + 4, 8);
      g.fillStyle = '#2a2010'; g.fillRect(x, y, w, 4);
      g.fillStyle = this.meter > 0.75 && Math.floor(this.w.time * 8) % 2 ? '#ff6a00' : '#ffd34d'; g.fillRect(x, y, Math.round(w * this.meter), 4);
      drawText(g, `COMMISSION ${Math.round(this.meter * 100)}%`, x + w / 2, y + 6, { align: 'center', color: '#ffd34d', outline: '#000' });
    }
    if (this.wind > 0) {
      g.fillStyle = 'rgba(220,235,255,0.35)';
      const vx = r.viewX(), vy = r.viewY();
      for (let i = 0; i < 26; i++) {
        const sx = (i * 97) % r.W, sy = ((i * 53 - this.w.time * 420) % r.H + r.H) % r.H;
        g.fillRect(Math.round(vx + sx), Math.round(vy + sy), 1, 10);
      }
    }
    // escape meter while held
    if (this.hold) {
      const p = this.player;
      const x = Math.round(p.x - 16), y = Math.round(p.y - 50);
      g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, 34, 5);
      g.fillStyle = '#8af0a0'; g.fillRect(x, y, Math.round(32 * clamp(this.hold.escape, 0, 1)), 3);
      drawText(g, 'MASH!', p.x, y - 11, { align: 'center', color: Math.floor(this.w.time * 10) % 2 ? '#ffd34d' : '#ffffff', outline: '#000' });
    }
  }

  override renderOver(g: Ctx): void {
    if (this.meter > 0.5 && this.mode === 'fight') {
      // speed shimmer when the meter is hot
      g.globalAlpha = 0.35 * this.meter;
      g.fillStyle = '#ffd34d';
      for (let k = 0; k < 3; k++) g.fillRect(Math.round(this.x - 10 + k * 8 + Math.sin(this.w.time * 20 + k) * 2), Math.round(this.y - 20 - k * 12), 2, 6);
      g.globalAlpha = 1;
    }
  }
}

BOSS_FLOORS[2] = {
  music: 'boss2',
  buildMap,
  setup(s: GameplayScene) {
    const map = s.world.map as ArenaMap;
    const boss = new HeadOfSales(s, map);
    s.world.add(boss);
    s.world.holdClear = true;
    s.data.boss = boss;
  },
};

void contractSprite; void drawSpriteRot; void smokePuff; void Projectile;
