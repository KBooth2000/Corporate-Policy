// The player (spec 2): 8-dir movement, dash with i-frames, 3-hit melee combos, heavy, ranged/throw,
// Grab (throw / breach / execute), Rage, HP + Wellbeing shield, breakable weapons.
import { Actor, DamageInfo } from './entity';
import type { Ctx } from '../render/canvas';
import { drawSpriteRot } from '../render/canvas';
import { Vec, angleDiff, angleTo, clamp, dist, fromAngle, norm, TAU } from '../core/math';
import { app } from '../core/app';
import type { Action } from '../core/input';
import { bakeCharacter, rollLook } from '../art/characters';
import { weaponSprite } from '../art/items';
import { Rng, fxRng } from '../core/rng';
import type { RunState } from './run';
import { runStats } from './run';
import type { PlayerStats } from './stats';
import { WeaponInst, def, makeWeapon, slotOf } from './weapons';
import { Projectile } from './projectile';
import { queryActors } from './combat';
import { audio } from '../audio/audio';
import { sparks, smokePuff } from './fx';
import { TILE } from './world-types';
import { Pickup } from './pickups';
import { startExecution, canGrab } from './executions';
import type { Interactable } from './world';

/** Abstract control source so bots/tests/replays can drive the player. */
export interface PlayerCtl {
  move: Vec;
  /** World-space aim point (mouse) or null. */
  aimPoint: Vec | null;
  /** Stick aim direction or null. */
  aimDir: Vec | null;
  pressed(a: Action): boolean;
  released(a: Action): boolean;
  down(a: Action): boolean;
  held(a: Action): number;
  /** Aim assist strength 0..1 for this device. */
  assist: number;
}

interface Swing {
  t: number; dur: number; active: [number, number];
  angle: number; arc: number; reach: number;
  heavy: boolean; combo: number; hit: Set<number>; propHit: Set<PropKey>;
  dmg: number; kb: number; stagger: number; weaponId: string;
  dir: number; // swing direction for the visual (+1 / -1)
}
type PropKey = number;

export class Player extends Actor {
  run: RunState;
  stats: PlayerStats;
  ctl!: PlayerCtl;
  aim = 0;
  swing: Swing | null = null;
  attackCd = 0;
  combo = 0;
  comboTimer = 0;
  charge = 0;
  charging = false;
  /** holdToTap (spec 2.6): seconds the toggled heavy charge has been latched on. */
  chargeT = 0;
  /** holdToTap: remaining seconds of a tapped Laser Pointer burst (replaces holding the fire button). */
  laserLatch = 0;
  dashT = 0;
  dashCharges: number;
  dashDir: Vec = { x: 1, y: 0 };
  grabbing: Actor | null = null;
  grabT = 0;
  rage = 0;
  raging = 0;
  rageReadyAnnounced = false;
  shieldDelay = 0;
  sinceCombat = 0;
  throwAnim = 0;
  hurtAnim = 0;
  rangedCd = 0;
  stepT = 0;
  /** Set by benefits: next hit is a guaranteed crit (e.g. first hit after dash). */
  nextHitCrit = false;
  /** Damage modifiers from benefits/desk items. */
  outgoingMods: ((info: DamageInfo, target: Actor) => void)[] = [];
  incomingMods: ((info: DamageInfo) => void)[] = [];
  /** Return true to prevent death (e.g. "Hang In There" poster). */
  deathSavers: (() => boolean)[] = [];
  /** Auto-dodge charges (Out-of-Office). */
  autoDodge = 0;
  interactTarget: { label: string; sub?: string; x: number; y: number } | null = null;
  grabCandidate: Actor | null = null;
  execCandidate: string | null = null;
  laserT = 0;
  /** Prevents actions while in shops/menus. */
  frozen = false;
  /** Boss compliance policies: verbs currently banned. */
  bannedVerbs = new Set<'dash' | 'ranged' | 'rage' | 'grab' | 'melee'>();
  onPolicyBreach: ((verb: string) => void) | null = null;
  deathHandled = false;

  constructor(run: RunState) {
    super();
    this.run = run;
    this.team = 'player';
    this.radius = 5;
    this.mass = 1.2;
    this.height = 30;
    this.stats = runStats(run);
    this.maxHp = this.stats.maxHp;
    this.hp = Math.min(run.hp, this.maxHp);
    this.maxShield = this.stats.maxShield;
    this.shield = Math.min(run.shield, this.maxShield);
    this.dashCharges = this.stats.dashCharges;
    this.rage = 0;
    this.persist = true;
    const look = rollLook({ kind: 'player', role: run.role, tier: 0 }, new Rng(run.seed ^ 0x51ed));
    this.baked = bakeCharacter(look);
  }

  refreshStats(): void {
    const hpFrac = this.hp / this.maxHp;
    this.stats = runStats(this.run);
    const oldMax = this.maxHp;
    this.maxHp = this.stats.maxHp;
    if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax; else this.hp = Math.min(this.hp, this.maxHp);
    void hpFrac;
    this.maxShield = this.stats.maxShield;
    this.shield = Math.min(this.shield, this.maxShield);
  }

  get canAct(): boolean { return !this.frozen && this.alive && !this.world.cutscene; }

  // ------------------------------------------------------------------ update
  update(dt: number): void {
    this.updateStatus(dt);
    const c = this.ctl;
    const s = this.stats;
    this.animT += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0 && !this.swing) this.combo = 0;
    this.throwAnim = Math.max(0, this.throwAnim - dt);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    if (this.dashCharges < s.dashCharges) this.dashCharges = Math.min(s.dashCharges, this.dashCharges + dt / s.dashCooldown);

    // shield regen (spec 2.3)
    this.shieldDelay -= dt;
    if (this.shieldDelay <= 0 && this.shield < this.maxShield && s.shieldRegenRate > 0) {
      const before = this.shield;
      this.shield = Math.min(this.maxShield, this.shield + s.shieldRegenRate * dt);
      if (before === 0 && this.shield > 0) audio.sfx('shield_regen', { vol: 0.5 });
    }

    // rage decay outside combat (spec 2.2)
    if (this.world.inCombat) this.sinceCombat = 0; else this.sinceCombat += dt;
    if (this.raging > 0) {
      this.raging -= dt;
      if (this.raging <= 0) this.endRage();
    } else if (this.sinceCombat > 2 && this.rage > 0) {
      this.rage = Math.max(0, this.rage - 12 * s.rageDecay * dt);
      this.rageReadyAnnounced = this.rage >= 100;
    }
    // bleed DoT
    if (this.status.bleed > 0) this.hurtTick(this.status.bleedDps * dt);

    if (!this.alive) return;
    if (this.frozen || this.world.cutscene) { this.vx = this.vy = 0; this.setAnim('idle'); return; }

    // ---- aim
    this.updateAim(dt);

    // ---- grabbing
    if (this.grabbing) { this.updateGrab(dt); }

    // ---- dash
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = s.dashDistance / 0.17;
      this.moveActor(this.dashDir.x * sp * dt, this.dashDir.y * sp * dt);
      if (fxRng.chance(0.7)) this.world.particles.spawn({ kind: 'smoke', x: this.x, y: this.y - 2, life: 0.25, col: '#c8c8c8', size: 3, drag: 4 });
      if (this.dashT <= 0) { this.ghost = false; this.world.bus.emit('dashEnd', { x: this.x, y: this.y }); }
      this.setAnim('dash');
      return;
    }

    const stunned = this.status.stun > 0;
    if (!stunned) this.handleActions(dt);

    // ---- movement
    let mv = c.move;
    if (this.status.confused > 0) mv = { x: -mv.x, y: -mv.y };
    let speed = s.moveSpeed * this.speedMult();
    if (this.raging > 0) speed *= 1.15;
    if (this.grabbing) speed *= 0.7;
    if (this.charging) speed *= 0.55;
    if (this.swing) speed *= this.swing.heavy ? 0.25 : 0.55;
    if (stunned) speed = 0;
    const wet = this.status.wet > 0;
    const acc = wet ? 3 : 18;
    this.vx += (mv.x * speed - this.vx) * Math.min(1, acc * dt);
    this.vy += (mv.y * speed - this.vy) * Math.min(1, acc * dt);
    // knockback
    this.kx *= Math.max(0, 1 - 8 * dt); this.ky *= Math.max(0, 1 - 8 * dt);
    this.moveActor((this.vx + this.kx) * dt, (this.vy + this.ky) * dt);
    const moving = Math.hypot(this.vx, this.vy) > 12;
    if (moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.28; audio.sfx('step', { vol: 0.18, x: this.x, y: this.y }); }
    }

    // ---- anim
    if (this.swing) this.setAnim(this.swing.heavy ? 'heavy' : (['attack1', 'attack2', 'attack3'] as const)[Math.min(2, this.swing.combo)]);
    else if (this.grabbing) this.setAnim('exec_hold');
    else if (this.throwAnim > 0) this.setAnim('throw');
    else if (this.hurtAnim > 0) this.setAnim('hit');
    else if (moving) this.setAnim(Math.hypot(this.vx, this.vy) > 70 ? 'run' : 'walk');
    else this.setAnim(this.raging > 0 ? 'rage' : 'idle');

    // rage auto-trigger accessibility
    if (app.settings.rageAutoTrigger && this.rage >= 100 && this.raging <= 0 && this.world.inCombat) this.activateRage();

    this.scanContext();
  }

  private moveActor(dx: number, dy: number): void { this.world.moveActor(this, dx, dy); }

  private updateAim(dt: number): void {
    const c = this.ctl;
    let target: number | null = null;
    if (c.aimPoint) target = angleTo({ x: this.x, y: this.y - 12 }, c.aimPoint);
    else if (c.aimDir) target = Math.atan2(c.aimDir.y, c.aimDir.x);
    else if (Math.hypot(c.move.x, c.move.y) > 0.2) target = Math.atan2(c.move.y, c.move.x);
    if (target === null) target = this.aim;
    // aim assist (spec 2.6; mandatory on touch)
    if (c.assist > 0 && !c.aimPoint) {
      let best: Actor | null = null, bestScore = 1e9;
      const cone = 0.3 + 0.6 * c.assist;
      for (const a of this.world.actors) {
        if (a.team !== 'enemy' || !a.alive) continue;
        const d = dist(this, a);
        if (d > 240) continue;
        const da = Math.abs(angleDiff(target, angleTo(this, a)));
        if (da > cone) continue;
        const score = da * 120 + d;
        if (score < bestScore && this.world.los(this, a)) { best = a; bestScore = score; }
      }
      if (best) {
        const ta = angleTo(this, best);
        target = target + angleDiff(target, ta) * Math.min(1, 0.35 + c.assist * 0.65);
      }
    }
    this.aim = target;
    if (!this.swing || this.swing.t < 0.04) this.face(this.aim);
    void dt;
  }

  /** Compliance policies (spec 6.4) do not block a verb — breaking the active policy is punished via onPolicyBreach.
   *  Modules that must hard-block a verb (e.g. Quiet Carriage) intercept it themselves. Always returns false. */
  private verbBanned(v: 'dash' | 'ranged' | 'rage' | 'grab' | 'melee'): boolean {
    if (this.bannedVerbs.has(v)) { this.onPolicyBreach?.(v); return false; }
    return false;
  }

  private handleActions(dt: number): void {
    const c = this.ctl;
    // dash (spec 2.1: i-frames, passes through enemies, charge-based cooldown)
    if (c.pressed('dash') && this.dashCharges >= 1 && !this.grabbing) {
      if (!this.verbBanned('dash')) this.startDash();
      return;
    }
    // rage
    if (c.pressed('rage') && this.rage >= 100 && this.raging <= 0) { if (!this.verbBanned('rage')) this.activateRage(); }

    // interact (pickups, exits, executions while grabbing)
    if (c.pressed('interact')) this.doInteract();

    // grab
    if (c.pressed('grab')) {
      if (this.grabbing) this.throwGrabbed();
      else if (this.grabCandidate) { if (!this.verbBanned('grab')) this.startGrab(this.grabCandidate); }
    }

    // melee: light combos; hold to charge heavy (spec 2.1)
    // Accessibility (spec 2.6, settings.holdToTap): nothing needs to be held. Melee is tap-only, the heavy action becomes a
    // toggle (tap to start charging, tap again to swing) and the Rage chord / Laser Pointer / touch fire are single taps.
    const tapMode = app.settings.holdToTap;
    const holdMode = app.settings.heavyMode === 'hold' && !tapMode;
    if (this.grabbing) {
      if (tapMode) this.cancelCharge();
      if (c.pressed('melee')) this.pummel();
      if (c.pressed('ranged')) this.throwGrabbed();
      return;
    }
    if (tapMode) this.tapHeavy(c, dt);
    else if (c.pressed('heavy') && !this.swing && this.attackCd <= 0) { if (!this.verbBanned('melee')) this.startSwing(true, 1); }
    if (holdMode) {
      // tap = light attack on press (responsive); keep holding = charge a heavy, release to swing (spec 2.1)
      if (c.pressed('melee')) {
        if (!this.swing && this.attackCd <= 0) { if (!this.verbBanned('melee')) this.startSwing(false, 1); }
        else this.bufferedMelee = 0.25;
      }
      if (c.down('melee') && !this.swing && this.attackCd <= 0 && c.held('melee') > 0.3) {
        if (!this.charging) { this.charging = true; this.bufferedMelee = 0; audio.sfx('charge', { vol: 0.5 }); }
        this.charge = Math.min(1, (c.held('melee') - 0.3) / 0.6);
      }
      if (c.released('melee') && this.charging) {
        this.charging = false;
        if (!this.verbBanned('melee')) this.startSwing(true, 0.6 + this.charge * 0.6);
        this.charge = 0;
      }
    } else if (c.pressed('melee')) {
      if (!this.swing && this.attackCd <= 0) { if (!this.verbBanned('melee')) this.startSwing(false, 1); }
      else this.bufferedMelee = 0.25;
    }
    this.bufferedMelee = Math.max(0, this.bufferedMelee - dt);
    if (this.bufferedMelee > 0 && !this.swing && this.attackCd <= 0) { this.bufferedMelee = 0; if (!this.verbBanned('melee')) this.startSwing(false, 1); }

    if (this.swing) this.updateSwing(dt);

    // [AI hook] Lawyer injunction field (spec 5.2): while `injunctionT` > 0 (set/decayed by src/game/enemies/common.ts
    // ZoneLayer) the player cannot fire ranged weapons or throw.
    if ((this as any).injunctionT > 0) {
      if (c.pressed('ranged')) { audio.sfx('ui_error', { vol: 0.6 }); this.world.floatText(this.x, this.y - 36, 'INJUNCTION: NO RANGED', '#d9b45a'); }
      return;
    }
    // ranged / throw (spec 2.1)
    const r = this.run.loadout.ranged;
    if (tapMode) {
      // tap-to-fire: a lone fire/throw button with no aim stick locks onto the nearest visible enemy; a Laser Pointer tap is a short burst
      if (c.pressed('ranged') && r?.id === 'laser_pointer') this.laserLatch = 0.9;
      if (c.down('ranged') || this.laserLatch > 0) this.tapAutoAim();
    }
    const laserOn = c.down('ranged') || this.laserLatch > 0;
    this.laserLatch = Math.max(0, this.laserLatch - dt);
    if (r && r.ammo > 0 && def(r.id).id === 'laser_pointer') {
      if (laserOn) { if (!this.verbBanned('ranged')) this.fireLaser(dt, r); }
    } else if (c.down('ranged') && this.rangedCd <= 0 && r && r.ammo > 0) {
      if (c.pressed('ranged') || def(r.id).interval < 0.35) { if (!this.verbBanned('ranged')) this.fireRanged(r); }
    } else if (c.pressed('ranged') && this.rangedCd <= 0) {
      if (!this.verbBanned('ranged')) {
        if (this.run.loadout.thrown) this.throwItem('thrown');
        else if (r && r.ammo <= 0) { audio.sfx('out_of_ammo'); this.world.floatText(this.x, this.y - 36, 'OUT OF STAPLES', '#ff8080'); this.rangedCd = 0.3; }
        else if (this.run.loadout.melee) this.throwItem('melee');
      }
    }
  }
  bufferedMelee = 0;

  /** holdToTap: tap `heavy` to start charging a heavy swing, tap again to release it (auto-releases after 3 s). */
  private tapHeavy(c: PlayerCtl, dt: number): void {
    if (this.charging) {
      this.chargeT += dt;
      this.charge = Math.min(1, this.chargeT / 0.6);
      if (this.swing) { this.cancelCharge(); return; }
    }
    const tap = c.pressed('heavy');
    if (this.charging && (tap || this.chargeT >= 3)) {
      const mult = 0.6 + this.charge * 0.6;
      this.cancelCharge();
      if (!this.verbBanned('melee')) this.startSwing(true, mult);
    } else if (!this.charging && tap && !this.swing && this.attackCd <= 0) {
      this.charging = true; this.chargeT = 0; this.charge = 0; this.bufferedMelee = 0;
      audio.sfx('charge', { vol: 0.5 });
    }
  }

  private cancelCharge(): void {
    if (!this.charging && this.chargeT === 0) return;
    this.charging = false; this.charge = 0; this.chargeT = 0;
  }

  /** holdToTap: with no aim stick or mouse, point at the nearest enemy in line of sight (a fire button has no direction of its own). */
  private tapAutoAim(): void {
    const c = this.ctl;
    if (c.aimPoint || c.aimDir) return;
    let best: Actor | null = null, bd = 260;
    for (const a of this.world.actors) {
      if (a.team !== 'enemy' || !a.alive) continue;
      const d = dist(this, a);
      if (d < bd && this.world.los(this, a)) { best = a; bd = d; }
    }
    if (best) { this.aim = angleTo(this, best); this.face(this.aim); }
  }

  // ------------------------------------------------------------------ dash
  startDash(): void {
    const c = this.ctl;
    let d = Math.hypot(c.move.x, c.move.y) > 0.2 ? norm(c.move) : fromAngle(this.aim);
    this.dashDir = d;
    this.dashT = 0.17;
    this.dashCharges -= 1;
    this.invuln = Math.max(this.invuln, 0.22);
    this.ghost = true;
    this.charging = false; this.charge = 0; this.chargeT = 0;
    this.swing = null;
    audio.sfx('dash', { x: this.x, y: this.y });
    this.world.bus.emit('dash', { x: this.x, y: this.y, dirX: d.x, dirY: d.y });
    this.setAnim('dash', true);
    d = d;
  }

  // ------------------------------------------------------------------ melee
  meleeWeapon(): WeaponInst | null { return this.run.loadout.melee; }

  startSwing(heavy: boolean, chargeMult: number): void {
    const w = this.meleeWeapon();
    const wd = def(w?.id ?? 'fists');
    const s = this.stats;
    const comboIdx = heavy ? 0 : this.combo % 3;
    const interval = wd.interval / (s.meleeSpeed * (this.raging > 0 ? 1.15 : 1));
    const dur = heavy ? interval * 1.6 : interval;
    let dmg = wd.damage * s.meleeDamage * (comboIdx === 2 ? 1.35 : 1);
    if (heavy) dmg *= wd.heavyMult * s.heavyDamage * chargeMult;
    const arc = (wd.arc * Math.PI) / 180 * (heavy ? 1.25 : 1) * (comboIdx === 1 ? 1.1 : 1);
    this.swing = {
      t: 0, dur, active: [dur * 0.18, dur * 0.55], angle: this.aim, arc, reach: wd.reach * (heavy ? 1.2 : 1) + 6,
      heavy, combo: comboIdx, hit: new Set(), propHit: new Set(), dmg, kb: wd.knockback * (heavy ? 1.6 : comboIdx === 2 ? 1.3 : 0.8) * s.knockbackDealt,
      stagger: wd.stagger * (heavy ? 2 : 1) * s.staggerDealt, weaponId: wd.id, dir: comboIdx % 2 === 0 ? 1 : -1,
    };
    if (!heavy) { this.combo++; this.comboTimer = dur + 0.35; }
    else this.combo = 0;
    this.attackCd = dur * (heavy ? 1.05 : 0.92);
    // small lunge
    const l = fromAngle(this.aim, heavy ? 6 : 3);
    this.kx += l.x * 20; this.ky += l.y * 20;
    audio.sfx(heavy ? 'swing_heavy' : 'swing_light', { x: this.x, y: this.y, pitch: 1 + comboIdx * 0.06 });
    // spec: fire extinguisher heavy releases a knockback blast; mop heavy leaves wet floor
    if (heavy && wd.id === 'fire_extinguisher') this.extinguisherBlast();
    if (heavy && wd.id === 'mop') this.mopWet();
  }

  private updateSwing(dt: number): void {
    const sw = this.swing!;
    sw.t += dt;
    if (sw.t >= sw.active[0] && sw.t <= sw.active[1]) this.swingHits(sw);
    if (sw.t >= sw.dur) this.swing = null;
  }

  private swingHits(sw: Swing): void {
    const origin = { x: this.x, y: this.y - 8 };
    const shape = { kind: 'arc' as const, x: origin.x, y: origin.y, r: sw.reach, angle: sw.angle, half: sw.arc / 2 };
    const targets = queryActors(this.world, shape, 'enemy');
    let connected = false;
    for (const t of targets) {
      if (sw.hit.has(t.id)) continue;
      if (!this.world.los(origin, t)) continue;
      sw.hit.add(t.id);
      connected = true;
      this.dealHit(t, sw.dmg, sw.heavy ? 'heavy' : 'melee', sw.kb, sw.stagger, sw.weaponId, sw.angle);
    }
    // props in the arc (hazards: printers, coolers, glass, cabinets, chairs)
    for (const p of this.world.propsNear(origin.x, origin.y, sw.reach + 4)) {
      if (sw.propHit.has(p.def.id)) continue;
      const px = p.def.x, py = p.def.y - Math.min(p.def.h, 16) / 2;
      const a = angleTo(origin, { x: px, y: py });
      const d = dist(origin, { x: px, y: py }) - Math.max(p.def.w, p.def.h) / 2;
      if (d > sw.reach || Math.abs(angleDiff(sw.angle, a)) > sw.arc / 2 + 0.3) continue;
      if (!(p.maxHp > 0 || p.def.hazard)) continue;
      sw.propHit.add(p.def.id);
      this.world.hitProp(p, { amount: sw.dmg, type: def(sw.weaponId).cls === 'sharp' ? 'sharp' : 'blunt', method: sw.heavy ? 'heavy' : 'melee', source: this, dir: sw.angle, heavy: sw.heavy });
      connected = true;
    }
    // Act 4 sealed windows can be weakened by hitting them (spec 4.7)
    this.tryWeakenWindow(origin, sw.angle, sw.reach);
    if (connected && sw.hit.size > 0) this.useDurability(sw.heavy ? 2 : 1);
  }

  private tryWeakenWindow(o: Vec, angle: number, reach: number): void {
    const p = { x: o.x + Math.cos(angle) * reach * 0.8, y: o.y + Math.sin(angle) * reach * 0.8 };
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (this.world.tile(tx, ty) === 7 /* WINDOW_SEALED */) {
      const w = this.world as any;
      w.weakened ??= new Set<number>();
      const key = ty * this.world.map.w + tx;
      if (!w.weakened.has(key)) {
        w.weakened.add(key);
        sparks(this.world.particles, p.x, p.y, 6, '#e0f0ff');
        audio.sfx('glass_shatter', { x: p.x, y: p.y, vol: 0.4, pitch: 1.4 });
        this.world.floatText(p.x, p.y - 8, 'CRACKED', '#cfe8f4');
      }
    }
  }

  /** Central outgoing-damage path for the player (benefits hook in via outgoingMods). */
  dealHit(t: Actor, base: number, method: DamageInfo['method'], kb: number, stagger: number, weaponId: string, dir: number): number {
    const s = this.stats;
    const wd = def(weaponId);
    let crit = this.nextHitCrit || this.world.rng.combat.next() < s.critChance;
    this.nextHitCrit = false;
    let amount = base * (crit ? s.critMult : 1) * (this.raging > 0 ? s.rageDamage : 1);
    const info: DamageInfo = {
      amount, type: wd.cls === 'sharp' ? 'sharp' : 'blunt', method, source: this, dir, knockback: kb, stagger,
      bleed: wd.bleed, dismember: wd.dismember + (this.raging > 0 ? 0.25 : 0), crit, weaponId,
    };
    for (const m of this.outgoingMods) m(info, t);
    amount = info.amount;
    const dealt = this.world.damage(t, info);
    if (dealt > 0) {
      this.run.log.damageDealt += dealt;
      audio.sfx(info.crit ? 'crit' : wd.cls === 'sharp' ? 'hit_sharp' : 'hit_blunt', { x: t.x, y: t.y });
      app.renderer.shake(info.crit || method === 'heavy' ? 3 : 1.5, 0.12);
      app.input.rumble(method === 'heavy' ? 0.6 : 0.3, 0.4, 70);
      this.world.bus.emit('hit', { target: t, amount: dealt, crit: !!info.crit, method: method as any, weaponId });
      if (info.crit) this.world.particles.spawn({ kind: 'ring', x: t.x, y: t.y - 12, life: 0.25, col: '#ffd34d', size: 14 });
    }
    void crit;
    return dealt;
  }

  useDurability(n: number): void {
    const w = this.run.loadout.melee;
    if (!w || w.maxDur <= 0) return;
    w.dur -= n;
    if (w.dur <= 0) this.breakWeapon('melee');
  }

  breakWeapon(slot: 'melee' | 'ranged' | 'thrown'): void {
    const w = this.run.loadout[slot];
    if (!w) return;
    this.run.loadout[slot] = null;
    audio.sfx('weapon_break', { x: this.x, y: this.y });
    this.world.floatText(this.x, this.y - 38, def(w.id).name.toUpperCase() + ' BROKE', '#ff9a6a');
    sparks(this.world.particles, this.x + Math.cos(this.aim) * 10, this.y - 12 + Math.sin(this.aim) * 10, 10, '#d0d0d0');
    this.run.log.weaponsBroken++;
    this.world.bus.emit('weaponBreak', { id: w.id, slot });
  }

  private extinguisherBlast(): void {
    const a = this.aim;
    smokePuff(this.world.particles, this.x + Math.cos(a) * 22, this.y - 8 + Math.sin(a) * 22, 14, '#f0f4f8', 8);
    audio.sfx('extinguisher_burst', { x: this.x, y: this.y });
    for (const e of queryActors(this.world, { kind: 'arc', x: this.x, y: this.y - 8, r: 64, angle: a, half: 0.6 }, 'enemy')) {
      e.kx += Math.cos(a) * 260 / e.mass; e.ky += Math.sin(a) * 260 / e.mass;
      e.status.blind = Math.max(e.status.blind, 1.5);
    }
  }

  private mopWet(): void {
    const a = this.aim;
    const x = this.x + Math.cos(a) * 18, y = this.y + Math.sin(a) * 14;
    const room = this.world.roomAt(x, y);
    this.world.decals.splat(room, x, y, 10, '#6aa8d8', 'wet');
    (this.world as any).wetZones ??= [];
    (this.world as any).wetZones.push({ x, y, r: 18, t: 8 });
    audio.sfx('mop_slosh', { x, y });
  }

  // ------------------------------------------------------------------ ranged
  fireRanged(w: WeaponInst): void {
    const d = def(w.id);
    const s = this.stats;
    this.rangedCd = d.interval;
    w.ammo--;
    const a = this.aim + fxRng.range(-0.04, 0.04);
    const ox = this.x + Math.cos(a) * 10, oy = this.y - 12 + Math.sin(a) * 6;
    const dmg = d.damage * s.rangedDamage * (this.raging > 0 ? s.rageDamage : 1);
    const common = { team: 'player' as const, x: ox, y: oy + 12, z: 12, speed: d.projSpeed, life: 1.2 };
    const mk = (ang: number, extra: Partial<ConstructorParameters<typeof Projectile>[0]> = {}) => this.world.add(new Projectile({
      ...common, angle: ang, dmg: { amount: dmg, type: 'sharp', method: 'ranged', source: this, knockback: d.knockback, stagger: d.stagger, bleed: d.bleed, weaponId: d.id }, ...extra,
      onHit: (p, t) => { if (t) { this.world.bus.emit('hit', { target: t, amount: dmg, crit: false, method: 'ranged', weaponId: d.id }); } void p; },
    }));
    switch (d.id) {
      case 'stapler': mk(a, { kind: 'staple', radius: 2 }); audio.sfx('stapler_fire', { x: ox, y: oy }); break;
      case 'nail_gun': mk(a, { kind: 'nail', pierce: 1, radius: 2 }); audio.sfx('nailgun_fire', { x: ox, y: oy }); app.renderer.shake(1, 0.06); break;
      case 'calculator': mk(a, { kind: 'calc', radius: 4, trail: '#9fe8a0' }); audio.sfx('calculator_beep', { x: ox, y: oy }); break;
      case 'tape_gun': mk(a, { kind: 'tape', radius: 3, slow: { amt: 0.5, time: 2.5 } }); audio.sfx('tape_fire', { x: ox, y: oy }); break;
      case 'confetti_cannon':
        for (let i = 0; i < 7; i++) mk(a + (i - 3) * 0.12, { kind: 'confetti', radius: 3, life: 0.45, speed: d.projSpeed * fxRng.range(0.8, 1.1) });
        audio.sfx('confetti_fire', { x: ox, y: oy }); app.renderer.shake(2.5, 0.12);
        this.kx -= Math.cos(a) * 60; this.ky -= Math.sin(a) * 60;
        break;
      default: mk(a, { kind: 'staple' }); audio.sfx('stapler_fire', { x: ox, y: oy });
    }
    this.throwAnim = 0.12;
    if (w.ammo <= 0) this.world.floatText(this.x, this.y - 36, 'EMPTY', '#ff8080');
  }

  private fireLaser(dt: number, w: WeaponInst): void {
    // continuous beam; spends 1 ammo per 0.25 s of use ("billable hours")
    this.laserT += dt;
    if (this.laserT >= 0.25) { this.laserT = 0; w.ammo--; }
    const a = this.aim;
    const o = { x: this.x + Math.cos(a) * 8, y: this.y - 12 + Math.sin(a) * 6 };
    const hit = this.world.raycast(o.x, o.y, o.x + Math.cos(a) * 260, o.y + Math.sin(a) * 260, { projectile: true });
    const end = hit ? { x: hit.x, y: hit.y } : { x: o.x + Math.cos(a) * 260, y: o.y + Math.sin(a) * 260 };
    (this as any).beam = { o, end, t: 0.05 };
    const len = dist(o, end);
    for (const e of queryActors(this.world, { kind: 'line', x: o.x, y: o.y + 12, angle: a, len, width: 6 }, 'enemy')) {
      if (fxRng.chance(0.35)) this.dealHit(e, def('laser_pointer').damage * this.stats.rangedDamage, 'ranged', 0, 2, 'laser_pointer', a);
    }
    if (fxRng.chance(0.3)) sparks(this.world.particles, end.x, end.y, 1, '#ff5050', 40);
    if (w.ammo <= 0) this.world.floatText(this.x, this.y - 36, 'BATTERY FLAT', '#ff8080');
  }

  // ------------------------------------------------------------------ throw
  throwItem(slot: 'thrown' | 'melee'): void {
    const w = this.run.loadout[slot];
    if (!w) return;
    const d = def(w.id);
    const a = this.aim;
    const s = this.stats;
    this.run.loadout[slot] = null;
    if (slot === 'thrown' && this.run.flags.spareThrowable) { this.run.loadout.thrown = makeWeapon(String(this.run.flags.spareThrowable)); delete this.run.flags.spareThrowable; }
    this.rangedCd = 0.3;
    this.throwAnim = 0.25;
    audio.sfx('throw', { x: this.x, y: this.y });
    const dmg = (d.throwDamage || d.damage) * s.throwDamage * (this.raging > 0 ? s.rageDamage : 1) * (slot === 'melee' ? 1.4 : 1);
    this.world.add(new Projectile({
      team: 'player', x: this.x + Math.cos(a) * 8, y: this.y + Math.sin(a) * 6, z: 14, angle: a, speed: Math.max(260, d.projSpeed || 320), itemId: w.id, spin: 18, life: 0.9, radius: 5,
      dmg: { amount: dmg, type: 'blunt', method: 'throw', source: this, knockback: d.knockback + 120, stagger: Math.max(50, d.stagger * 2) * s.staggerDealt, weaponId: w.id },
      propDamage: dmg * 1.5,
      onHit: (p, t) => {
        this.onThrowableImpact(w, p.x, p.y, t);
        if (t) this.world.bus.emit('hit', { target: t, amount: dmg, crit: false, method: 'throw', weaponId: w.id });
      },
    }));
  }

  /** Special throwable effects (spec 2.4 throwables one-shot, high stagger). */
  private onThrowableImpact(w: WeaponInst, x: number, y: number, t: Actor | null): void {
    const d = def(w.id);
    const room = this.world.roomAt(x, y);
    switch (w.id) {
      case 'toner_cartridge':
        smokePuff(this.world.particles, x, y, 16, '#20202a', 10);
        for (const e of queryActors(this.world, { kind: 'circle', x, y, r: 40 }, 'enemy')) e.status.blind = 3;
        break;
      case 'kettle':
        this.world.decals.splat(room, x, y, 8, '#9cc4e0', 'wet');
        for (const e of queryActors(this.world, { kind: 'circle', x, y, r: 26 }, 'enemy')) this.world.damage(e, { amount: 6, type: 'fire', method: 'throw', source: this, silent: true });
        audio.sfx('water_splash', { x, y });
        break;
      case 'energy_drink':
        this.world.decals.splat(room, x, y, 7, '#c8e85a', 'wet');
        for (const e of queryActors(this.world, { kind: 'circle', x, y, r: 26 }, 'enemy')) { e.status.slow = 3; e.status.slowAmt = 0.4; }
        break;
      case 'coffee_tray':
        for (const e of queryActors(this.world, { kind: 'circle', x, y, r: 28 }, 'enemy')) this.world.damage(e, { amount: 5, type: 'fire', method: 'throw', source: this, silent: true });
        this.world.decals.splat(room, x, y, 8, '#6b4a2b', 'wet');
        break;
      case 'framed_certificate': case 'mug': case 'monitor':
        audio.sfx('glass_shatter', { x, y, vol: 0.6 });
        break;
      case 'potted_plant':
        this.world.decals.splat(room, x, y, 6, '#4a3424', 'scorch');
        break;
    }
    // melee weapons thrown land on the floor with reduced durability (pick back up)
    if (d.cls !== 'throwable') {
      w.dur = Math.max(1, w.dur - 2);
      this.world.add(new Pickup({ kind: 'weapon', weapon: w, x, y: y + 4 }));
    } else {
      audio.sfx('debris', { x, y, vol: 0.6 });
    }
    void t;
  }

  // ------------------------------------------------------------------ grab (spec 2.1, 4.7)
  startGrab(e: Actor): void {
    this.grabbing = e;
    this.grabT = 3.2;
    e.grabbedBy = this;
    e.kx = e.ky = 0;
    this.swing = null; this.charging = false;
    audio.sfx('grab', { x: this.x, y: this.y });
    app.input.rumble(0.4, 0.2, 80);
    this.world.bus.emit('grab', { victim: e });
  }

  private updateGrab(dt: number): void {
    const e = this.grabbing!;
    if (!e.alive || e.grabbedBy !== this) { this.grabbing = null; return; }
    this.grabT -= dt;
    const a = this.aim;
    e.x = this.x + Math.cos(a) * 11;
    e.y = this.y + Math.sin(a) * 6 + 1;
    e.face(a + Math.PI);
    if (this.grabT <= 0) {
      // breaks free
      e.grabbedBy = null;
      e.status.stun = 0;
      this.grabbing = null;
      this.status.stun = 0.35;
      audio.sfx('enemy_hurt', { x: e.x, y: e.y });
    }
  }

  private pummel(): void {
    const e = this.grabbing!;
    if (this.attackCd > 0) return;
    this.attackCd = 0.32;
    const wd = def(this.run.loadout.melee?.id ?? 'fists');
    this.dealHit(e, wd.damage * 0.8 * this.stats.meleeDamage, 'melee', 0, 0, wd.id, this.aim);
    this.useDurability(1);
    this.squash = 0.85;
    if (e.alive) this.grabT = Math.max(this.grabT, 0.8);
  }

  throwGrabbed(): void {
    const e = this.grabbing;
    if (!e) return;
    this.grabbing = null;
    e.grabbedBy = null;
    const a = this.aim;
    const sp = 340 * (this.raging > 0 ? 1.25 : 1);
    e.thrown = { t: 0.65, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, thrower: this, hitIds: new Set() };
    e.setAnim('thrown', true);
    this.throwAnim = 0.25;
    audio.sfx('whoosh', { x: this.x, y: this.y });
    app.renderer.shake(2, 0.1);
  }

  // ------------------------------------------------------------------ rage (spec 2.2)
  addRage(amount: number, jargon = false): void {
    if (this.raging > 0 || this.bannedVerbs.has('rage') && false) return;
    const before = this.rage;
    this.rage = clamp(this.rage + amount * this.stats.rageFill * (jargon ? this.stats.rageJargonFill : 1), 0, 100);
    if (before < 100 && this.rage >= 100 && !this.rageReadyAnnounced) {
      this.rageReadyAnnounced = true;
      audio.sfx('rage_ready');
      this.world.bus.emit('rageFull', {});
    }
  }

  activateRage(): void {
    this.raging = this.stats.rageDuration;
    this.rage = 100;
    this.invuln = Math.max(this.invuln, 0.5);
    this.run.log.rageActivations++;
    audio.sfx('rage_activate');
    audio.music.setRage(true);
    app.renderer.shake(6, 0.4);
    app.input.rumble(1, 1, 250);
    this.setAnim('rage', true);
    // shockwave
    for (const e of queryActors(this.world, { kind: 'circle', x: this.x, y: this.y, r: 56 }, 'enemy')) {
      const a = angleTo(this, e);
      e.kx += Math.cos(a) * 220 / e.mass; e.ky += Math.sin(a) * 220 / e.mass;
      e.staggerMeter += 25;
    }
    this.world.particles.spawn({ kind: 'ring', x: this.x, y: this.y - 10, life: 0.4, col: '#ff3a2a', size: 60 });
    this.world.bus.emit('rageStart', {});
  }

  endRage(): void {
    this.raging = 0;
    this.rage = 0;
    this.rageReadyAnnounced = false;
    audio.sfx('rage_end');
    audio.music.setRage(false);
    this.world.bus.emit('rageEnd', {});
  }

  // ------------------------------------------------------------------ interact
  private scanContext(): void {
    // grab candidate
    this.grabCandidate = null;
    this.execCandidate = null;
    if (this.grabbing) {
      const ex = this.world.findExecutionTarget(this.x + Math.cos(this.aim) * 10, this.y + Math.sin(this.aim) * 6, 30);
      this.execCandidate = ex ? ex.type : null;
    } else {
      let best: Actor | null = null, bd = 1e9;
      for (const e of this.world.actors) {
        if (e.team !== 'enemy' || !e.alive || e.grabbedBy || e.thrown) continue;
        const d = dist(this, e);
        if (d > this.stats.grabRange + e.radius) continue;
        if (!canGrab(e, this.stats.grabThreshold)) continue;
        if (d < bd) { bd = d; best = e; }
      }
      this.grabCandidate = best;
    }
    // interactables
    this.interactTarget = null;
    let bestI: { label: string; sub?: string; x: number; y: number; d: number } | null = null;
    for (const it of this.world.interactables) {
      if (!it.enabled()) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (d > it.r) continue;
      const score = d - (it.priority ?? 0) * 100;
      if (!bestI || score < bestI.d) bestI = { label: it.label, sub: it.sub, x: it.x, y: it.y, d: score };
    }
    if (bestI) this.interactTarget = bestI;
  }

  private doInteract(): void {
    if (this.grabbing) {
      const ex = this.world.findExecutionTarget(this.x + Math.cos(this.aim) * 10, this.y + Math.sin(this.aim) * 6, 30);
      if (ex) { const v = this.grabbing; this.grabbing = null; startExecution(this.world, this, v, ex); return; }
    }
    let best: { it: Interactable; d: number } | null = null;
    for (const it of this.world.interactables) {
      if (!it.enabled()) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (d > it.r) continue;
      const score = d - (it.priority ?? 0) * 100;
      if (!best || score < best.d) best = { it, d: score };
    }
    best?.it.onInteract();
  }

  /** Equip a weapon into its slot; returns the displaced weapon (dropped by caller). */
  equip(w: WeaponInst): WeaponInst | null {
    const slot = slotOf(w.id);
    const old = this.run.loadout[slot];
    this.run.loadout[slot] = w;
    audio.sfx('pickup_weapon', { x: this.x, y: this.y });
    return old;
  }

  // ------------------------------------------------------------------ damage taken
  override modifyIncoming(info: DamageInfo): number {
    if (this.dashT > 0 && !info.unavoidable) return 0;
    if (this.autoDodge > 0 && info.source && !info.unavoidable) {
      this.autoDodge--;
      this.world.floatText(this.x, this.y - 38, 'OUT OF OFFICE', '#9fe0ff');
      this.invuln = 0.4;
      return 0;
    }
    for (const m of this.incomingMods) m(info);
    let a = info.amount * this.stats.damageTaken;
    if (info.method === 'hazard') a *= this.stats.hazardTaken;
    if (this.raging > 0) a *= 1 - this.stats.rageResist;
    if (this.status.marked > 0) a *= 1.25; // Auditor mark (spec 5.2)
    if (this.run.assist) a *= app.settings.assist.damageTaken;
    if (info.knockback) info.knockback *= this.stats.knockbackTaken;
    if (info.stagger) info.stagger = 0; // player never staggers from normal hits
    return a;
  }

  /** Rage gained from damage and the shield delay; called via world.onHurt by the gameplay scene. */
  onHurt(amount: number, absorbed: number, info: DamageInfo): void {
    this.shieldDelay = this.stats.shieldRegenDelay;
    if (amount + absorbed <= 0) return;
    this.invuln = Math.max(this.invuln, 0.45);
    this.hurtAnim = 0.18;
    if (absorbed > 0 && this.shield <= 0) audio.sfx('shield_break');
    else if (absorbed > 0) audio.sfx('shield_hit', { vol: 0.7 });
    if (amount > 0) audio.sfx('hurt');
    this.run.log.damageTaken += amount;
    this.addRage((amount + absorbed * 0.5) * 0.9);
    app.renderer.shake(3 + amount * 0.08, 0.2);
    app.input.rumble(0.7, 0.5, 120);
    this.world.bus.emit('playerHit', { amount, source: info.source ?? null, method: info.method, absorbed });
  }

  private hurtTick(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.dying = true; this.onDeath({ amount, type: 'cut', method: 'bleed' }); this.world.onKilled(this, { amount, type: 'cut', method: 'bleed' }, 0); }
  }

  onDeath(info: DamageInfo): void {
    for (const save of this.deathSavers) {
      if (save()) { this.dying = false; this.hp = 1; this.invuln = 1.5; return; }
    }
    if (this.grabbing) { this.grabbing.grabbedBy = null; this.grabbing = null; }
    this.setAnim('death2', true);
    audio.sfx('player_death');
    void info;
  }

  heal(amount: number, show = true): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount * this.stats.healMult);
    const got = this.hp - before;
    if (got > 0 && show) { this.world.floatText(this.x, this.y - 36, '+' + Math.round(got), '#4fdc7a'); audio.sfx('heal', { vol: 0.6 }); }
    return got;
  }

  // ------------------------------------------------------------------ render
  render(g: Ctx): void {
    const b = this.baked!;
    const hand = b.hand(this.anim, this.dir, this.animT);
    const wpn = this.grabbing ? null : (this.run.loadout.melee?.id ?? null);
    const sw = this.swing;
    let wAngle = this.aim;
    if (sw) {
      const p = clamp(sw.t / (sw.active[1]), 0, 1);
      wAngle = sw.angle + sw.dir * (sw.arc / 2) * (p * 2 - 1) * (sw.heavy ? 1.2 : 1);
    } else if (this.charging) wAngle = this.aim + Math.PI * 0.6 * this.charge * (Math.cos(this.aim) >= 0 ? -1 : 1);
    const flip = Math.cos(wAngle) < 0;
    const drawW = () => {
      if (this.anim === 'dash') return;
      const id = this.charging || sw ? (wpn ?? 'fists') : (this.run.loadout.ranged && this.ctl?.down('ranged') ? this.run.loadout.ranged.id : wpn ?? 'fists');
      if (id === 'fists' && !sw) return;
      drawSpriteRot(g, weaponSprite(id), this.x + hand.x, this.y + hand.y - this.z, wAngle, flip);
    };
    if (hand.behind) drawW();
    b.draw(g, this.anim, this.dir, this.animT, this.x, this.y - this.z, {
      flash: this.hitFlash, alpha: this.invuln > 0 && this.dashT <= 0 && Math.floor(this.world.time * 20) % 2 === 0 ? 0.55 : 1,
      squash: this.squash, rage: this.raging > 0,
      tint: this.raging > 0 ? '#ff2a1a' : this.charging ? '#ffffff' : undefined, tintAmt: this.raging > 0 ? 0.25 : this.charging ? this.charge * 0.35 : 0,
    });
    if (!hand.behind) drawW();
    // swing smear (readability)
    if (sw && sw.t >= sw.active[0] * 0.6 && sw.t <= sw.active[1] + 0.03) {
      const p = clamp((sw.t - sw.active[0] * 0.6) / (sw.active[1] - sw.active[0] * 0.6), 0, 1);
      g.save();
      g.globalAlpha = 0.75 * (1 - p * 0.6);
      g.strokeStyle = this.raging > 0 ? '#ff6a4a' : '#ffffff';
      g.lineWidth = sw.heavy ? 3 : 2;
      g.beginPath();
      const a0 = sw.angle - sw.arc / 2 * sw.dir, a1 = sw.angle - sw.arc / 2 * sw.dir + sw.arc * sw.dir * p;
      g.arc(this.x, this.y - 8, sw.reach * 0.85, Math.min(a0, a1), Math.max(a0, a1));
      g.stroke();
      g.restore();
    }
    const beam = (this as any).beam as { o: Vec; end: Vec; t: number } | undefined;
    if (beam && this.ctl?.down('ranged')) {
      g.strokeStyle = '#ff3030'; g.lineWidth = 1; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(beam.o.x, beam.o.y); g.lineTo(beam.end.x, beam.end.y); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#ffd0d0'; g.fillRect(Math.round(beam.end.x) - 1, Math.round(beam.end.y) - 1, 3, 3);
    }
    // charge meter
    if (this.charging) {
      g.fillStyle = '#000'; g.fillRect(Math.round(this.x) - 9, Math.round(this.y) + 4, 18, 3);
      g.fillStyle = this.charge >= 1 ? '#ffd34d' : '#ffffff'; g.fillRect(Math.round(this.x) - 8, Math.round(this.y) + 5, Math.round(16 * this.charge), 1);
    }
    void TAU;
  }
}
