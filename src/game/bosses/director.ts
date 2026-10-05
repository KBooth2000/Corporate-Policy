// Optional Director bosses (spec 6.6): a 2-phase boss assembled from a promoted Director's archetype behaviours,
// promoted traits and memory barks, in the generator's upgraded Manager's Office ("director" room). Only exists when
// the Promotion system runs in 'full' mode (src/game/flags.ts PROMOTION_MODE ships 'light'): FLOOR_SETUP.director is a
// no-op otherwise. Reward: rare weapon + large payout + trophy (the promotion module's Terminated handler), never
// mandatory (the floor is a corridor detour).
import { FLOOR_SETUP } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import * as promo from '../promotion';
import type { PromotedRecord } from '../profile';
import { Enemy } from '../enemy';
import type { DamageInfo } from '../entity';
import { IntroCard, ScriptCutscene, easeOut, easeIn, letterbox } from './boss';
import { TILE } from '../world-types';
import { ARCHETYPE_DEFS } from '../../data/tables';
import type { ArchetypeId, Tier } from '../../data/ids';
import { audio } from '../../audio/audio';
import { app } from '../../core/app';
import { makeWeapon, rollWeapon } from '../weapons';
import { Pickup } from '../pickups';
import { bloodBurst, goreLevel, sparks } from '../fx';
import { notify } from '../../ui/corpos';
import { drawText } from '../../render/font';
import type { Ctx } from '../../render/canvas';
import { angleTo, dist } from '../../core/math';

type Mode = 'dormant' | 'intro' | 'fight' | 'window' | 'transition' | 'final' | 'finisher' | 'defeated';

class DirectorBoss extends Enemy {
  s!: GameplayScene;
  rec!: PromotedRecord;
  arena = -1;
  mode: Mode = 'dormant';
  phase = 1;
  staggerWindow = false;
  windowT = 0;
  memCd = 6;
  wasMarkers = [0.5];
  pendingTransition = false;
  killing = false;

  override modifyIncoming(info: DamageInfo): number {
    if (this.killing) return info.amount;
    if (this.mode !== 'fight') return 0;
    let a = super.modifyIncoming(info);
    const floor = this.phase === 1 ? this.maxHp * 0.5 : 1;
    const over = Math.max(0, a - Math.max(0, this.shield));
    if (this.hp - over < floor) a = Math.max(0, this.shield) + Math.max(0, this.hp - floor);
    return a;
  }
  override onHurtLocal(info: DamageInfo, amount: number): void {
    super.onHurtLocal(info, amount);
    if (this.mode !== 'fight') return;
    const floor = this.phase === 1 ? this.maxHp * 0.5 : 1;
    if (this.hp <= floor + 0.5) {
      for (const t of this.world.telegraphs) if (t.owner === this) t.done = true;
      this.staggerWindow = true;
      this.mode = this.phase === 1 ? 'window' : 'final';
      this.windowT = 2.6;
      this.world.hitstop = 0.14; app.renderer.shake(6, 0.3);
      this.world.floatText(this.x, this.y - this.height - 12, this.phase === 1 ? 'STAGGERED — GRAB!' : 'FINISH THEM', '#ffd34d', 1, 1.6);
    }
  }
  override update(dt: number): void {
    const w = this.world;
    if (this.mode === 'dormant') {
      if (w.currentRoom === this.arena && w.rooms[this.arena]?.locked) this.startIntro();
      else { this.animT += dt; this.setAnim('idle'); }
      return;
    }
    if (this.pendingTransition && !w.cutscene) { this.pendingTransition = false; this.transition(true); return; }
    if (this.mode === 'intro' || this.mode === 'transition' || this.mode === 'finisher' || this.mode === 'defeated') { this.animT += dt; return; }
    this.syncHud();
    if (this.mode === 'window' || this.mode === 'final') {
      this.animT += dt; this.updateStatus(dt); this.setAnim('stagger');
      if (this.mode === 'window') { this.windowT -= dt; if (this.windowT <= 0) this.transition(false); }
      return;
    }
    super.update(dt);
    this.memCd -= dt;
    if (this.memCd <= 0 && this.alive) { this.memCd = this.rng.range(8, 12); this.bark('taunt', promo.memoryBarkFor(this.rec, this.rng)); }
  }
  syncHud(): void {
    this.s.hud.bossBar = { name: this.name, title: this.title.toUpperCase(), hp: this.hp, maxHp: this.maxHp, phase: this.phase, markers: [0.5], shield: this.maxShield > 0 && this.shield > 0 ? this.shield / this.maxShield : undefined };
  }
  startIntro(): void {
    this.mode = 'intro';
    const p = this.world.player as any;
    p.invuln = 99;
    audio.sfx('stinger_promotion'); audio.music.setCombat(true);
    const self = this;
    const memory = promo.memoryBarkFor(this.rec, this.rng);
    const duck: any = {
      x: this.x, y: this.y, animT: 0,
      cfg: { id: 'director', act: this.act, accent: '#ffd34d', portrait: this.baked!.portrait },
      art: { portrait: () => this.baked!.portrait },
      text: { name: this.name, title: this.title, tagline: memory },
      endIntro() { self.mode = 'fight'; p.invuln = 0.8; self.aware = true; self.syncHud(); self.bark('taunt', memory); },
    };
    this.world.cutscene = new IntroCard(duck);
  }
  private grabbedHook(): void {
    const p = this.world.player as any;
    if (p.grabbing === this) p.grabbing = null;
    this.grabbedBy = null; this.staggerWindow = false;
    if (this.mode === 'window') this.phaseExecution(); else if (this.mode === 'final') this.finisher();
  }
  hookGrab(): void { this.world.bus.on('grab', ({ victim }) => { if (victim === this) this.grabbedHook(); }); }

  phaseExecution(): void {
    this.mode = 'transition';
    const w = this.world, p = w.player as any;
    p.invuln = 99; p.setAnim('exec_slam', true); this.setAnim('grabbed', true);
    let hit = false;
    w.cutscene = new ScriptCutscene({
      dur: 1.2, caption: 'PERFORMANCE MANAGED', captionAt: 0.5,
      camera: () => ({ x: (p.x + this.x) / 2, y: (p.y + this.y) / 2 - 12 }), zoom: (t) => 1 + 0.6 * easeOut(t / 0.3),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        if (!hit && t > 0.5) { hit = true; app.renderer.shake(8, 0.3); audio.sfx('execution_impact', { x: this.x, y: this.y }); bloodBurst(w.particles, this.x, this.y - 12, angleTo(p, this), goreLevel() ? 20 : 0, this.arena, 20); this.hp = Math.max(1, this.hp - this.maxHp * 0.06); p.addRage?.(25); }
      },
      onEnd: () => { p.invuln = 0.6; this.pendingTransition = true; },
    });
  }
  transition(_executed: boolean): void {
    if (this.phase >= 2) return;
    this.mode = 'transition'; this.phase = 2; this.staggerWindow = false;
    const w = this.world, p = w.player as any;
    p.invuln = 99;
    audio.sfx('phase_transition'); audio.music.setPhase(2);
    const room = w.map.rooms[this.arena];
    let blinds = false;
    w.cutscene = new ScriptCutscene({
      dur: 2.4, caption: 'HOSTILE TAKEOVER', sub: 'The Director calls in their team.', captionAt: 0.6, captionCol: '#ffd34d',
      camera: () => ({ x: this.x, y: this.y - 20 }), zoom: () => 1.25,
      update: (t, dt) => {
        this.animT += dt; this.setAnim('rage');
        if (!blinds && t > 0.4) {
          blinds = true;
          w.forcedDarkness = 0.35; audio.sfx('shutter_slam');
          sparks(w.particles, this.x, this.y - 20, 20, '#ffd34d', 180);
          // two of their own archetype's colleagues
          const pool = Object.values(ARCHETYPE_DEFS).filter((a) => a.act === ARCHETYPE_DEFS[this.archetype].act && a.role !== 'elite');
          for (let i = 0; i < 2; i++) {
            const a = pool[(i + this.rec.kills.length) % pool.length];
            const at = { x: (room.tx + 2 + i * (room.tw - 4)) * TILE, y: (room.ty + 2) * TILE };
            const e = new Enemy({ archetype: a.id as ArchetypeId, tier: 1, act: this.act, floor: this.floor, x: at.x, y: at.y, roomId: this.arena, rng: this.rng.fork('add' + i), aware: true });
            w.add(e); w.assignToRoom(e, this.arena);
          }
        }
      },
      letterbox: true,
      onEnd: () => { this.mode = 'fight'; p.invuln = 1; this.speed *= 1.25; this.telegraphMult *= 0.9; this.bark('taunt', promo.memoryBarkFor(this.rec, this.rng)); },
    });
  }
  finisher(): void {
    this.mode = 'finisher';
    const w = this.world, p = w.player as any;
    p.invuln = 99; p.setAnim('exec_slam', true); this.setAnim('grabbed', true);
    let hit = false;
    w.cutscene = new ScriptCutscene({
      dur: 1.5, caption: 'TERMINATED', sub: `${this.name} has been let go.`, captionAt: 0.7, captionCol: '#ff5a4a',
      camera: () => ({ x: (p.x + this.x) / 2, y: (p.y + this.y) / 2 - 12 }), zoom: (t) => 1 + 0.7 * easeIn(Math.min(1, t / 0.6)),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        if (!hit && t > 0.65) { hit = true; app.renderer.shake(10, 0.5); w.hitstop = 0.15; audio.sfx('execution_impact', { x: this.x, y: this.y }); }
      },
      onEnd: () => {
        p.invuln = 0.8;
        this.mode = 'defeated';
        this.executed = true;
        this.killing = true;
        w.damage(this, { amount: 1e6, type: 'crush', method: 'execution', source: p, unavoidable: true, hazardKind: 'director' });
        // spec 6.6 reward: a rare weapon (cash + trophy come from the promotion module's Terminated handler)
        const s = this.s;
        const wi = makeWeapon(rollWeapon(s.floorRng.loot, this.act, 2), { durabilityMult: p.stats.durabilityMult, ammoMult: p.stats.ammoMult }); wi.rare = true;
        w.add(new Pickup({ kind: 'weapon', weapon: wi, x: this.x + 12, y: this.y }));
        s.hud.bossBar = null;
        w.forcedDarkness = -1;
        w.holdClear = false;
        notify({ kind: 'good', title: "Director's Office", body: 'Vacated. The trophy has been sent to your car.' });
      },
    });
  }
  override render(g: Ctx): void {
    super.render(g);
    if (this.staggerWindow && (this.mode === 'window' || this.mode === 'final')) drawText(g, this.mode === 'final' ? 'EXECUTE' : 'GRAB', this.x, this.y - this.height - 20, { align: 'center', color: '#ffd34d', outline: '#000' });
    // gold director aura
    if (this.alive && this.mode !== 'dormant') { g.globalAlpha = 0.25; g.strokeStyle = '#ffd34d'; g.beginPath(); g.ellipse(Math.round(this.x), Math.round(this.y), 14, 5, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
  }
}

FLOOR_SETUP.director = (s: GameplayScene) => {
  // compile-safe gate: no Directors unless the Promotion system is in 'full' mode and one exists
  if (!promo.directorAvailable(s.run)) return;
  const rec = promo.pickDirector();
  if (!rec || !ARCHETYPE_DEFS[rec.archetype as ArchetypeId]) return;
  const w = s.world;
  const rooms = w.map.rooms.filter((r) => r.kind !== 'core');
  const room = rooms.find((r) => r.kind === 'director') ?? rooms.find((r) => r.kind === 'manager') ?? rooms.sort((a, b) => b.tw * b.th - a.tw * a.th)[0];
  if (!room) return;
  const look = JSON.parse(JSON.stringify(rec.look));
  look.promotedRank = 4;
  const at = { ...room.rewardPoint };
  const e = new DirectorBoss({ archetype: rec.archetype as ArchetypeId, tier: 2 as Tier, act: s.plan.act, floor: s.plan.floor_number, x: at.x, y: at.y, roomId: room.id, rng: s.floorRng.spawns.fork('director'), aware: false, look, name: `Director ${rec.name}`, title: rec.title, telegraphMult: s.spawn?.telegraphMult });
  e.s = s; e.rec = rec; e.arena = room.id;
  promo.applyPromotion(e, rec, 'full', s.plan.act);
  e.isBoss = true;
  e.maxHp = Math.round(e.maxHp * 3); e.hp = e.maxHp;
  e.staggerMax = 1e9;
  e.persist = true;
  w.add(e); w.assignToRoom(e, room.id);
  e.hookGrab();
  w.holdClear = true;
  s.data.boss = e;
  void dist; void letterbox;
};
