// Enemy base (spec 5): archetype stats, seniority tiers, ±10% variance, quirks, identity (UK names + job-title grammar),
// telegraphed attack helpers, barks that fill player Rage, thrown-body physics (breach / defenestrate), death + drops.
import { Actor, DamageInfo } from './entity';
import type { Ctx } from '../render/canvas';
import { Vec, angleTo, dist, fromAngle, norm, clamp, angleDiff } from '../core/math';
import { Rng, fxRng } from '../core/rng';
import type { ArchetypeId, Tier, Act } from '../data/ids';
import { TIER_NAMES } from '../data/ids';
import { ARCHETYPE_DEFS, ArchetypeDef, ACTS } from '../data/tables';
import { bakeCharacter, rollLook, CharacterLook, AnimName } from '../art/characters';
import { weaponSprite } from '../art/items';
import { drawSpriteRot } from '../render/canvas';
import { Shape, queryActors } from './combat';
import { Projectile } from './projectile';
import type { ProjectileKind } from '../art/items';
import { audio } from '../audio/audio';
import { app } from '../core/app';
import { gibBurst, bloodBurst, debrisBurst, goreLevel } from './fx';
import { TILE, T, BREACHABLE_TILES } from './world-types';
import { WeaponInst, makeWeapon, def as wdef } from './weapons';
import { Pickup, dropCash } from './pickups';
import { BARKS, BarkContext } from '../data/text/barks';
import { FIRST_NAMES, SURNAMES, SENIORITY, BUZZWORDS, FUNCTIONS, SPECIAL_TITLES } from '../data/text/names';
import type { KillMethod } from './stats';

// ---------------------------------------------------------------------------
// Quirks (spec 5.3: one quirk from a pool)
export interface QuirkDef { id: string; name: string; desc: string; apply?(e: Enemy): void; }
export const QUIRKS: QuirkDef[] = [
  { id: 'speakerphone', name: 'Speakerphone', desc: 'Louder barks (more Rage for you).', apply: (e) => { e.barkRage *= 2; e.barkRate *= 1.4; } },
  { id: 'gym_bro', name: 'Gym Bro', desc: '+HP, slower.', apply: (e) => { e.maxHp *= 1.3; e.hp = e.maxHp; e.speed *= 0.85; e.mass *= 1.3; } },
  { id: 'caffeine', name: 'Caffeine-Dependent', desc: 'Slows down if their mug is destroyed.', apply: (e) => { e.speed *= 1.12; e.flags.caffeine = true; } },
  { id: 'hybrid', name: 'Hybrid Worker', desc: 'Sometimes just... is not there (dodges).', apply: (e) => { e.flags.dodger = true; } },
  { id: 'reply_all', name: 'Reply-All', desc: 'Alerts the whole room when hurt.', apply: (e) => { e.flags.replyAll = true; } },
  { id: 'glass_ceiling', name: 'Fragile Ego', desc: 'Staggers easily.', apply: (e) => { e.staggerMax *= 0.6; } },
  { id: 'overtime', name: 'Unpaid Overtime', desc: 'Attacks faster as HP drops.', apply: (e) => { e.flags.overtime = true; } },
  { id: 'mindful', name: 'Mindfulness Enthusiast', desc: 'Slowly regenerates.', apply: (e) => { e.flags.regen = 1.2; } },
  { id: 'keyboard_warrior', name: 'Keyboard Warrior', desc: 'Brave at range, flees up close.', apply: (e) => { e.flags.coward = true; } },
  { id: 'early_bird', name: 'Early Bird', desc: 'First to the fight (+speed).', apply: (e) => { e.speed *= 1.2; } },
  { id: 'vegan_lunch', name: 'Packed Lunch', desc: 'Drops a snack (heal) on death.', apply: (e) => { e.flags.snack = true; } },
  { id: 'expense_fraud', name: 'Expense Fiddler', desc: 'Drops extra Petty Cash.', apply: (e) => { e.cashDrop *= 2; } },
];

// ---------------------------------------------------------------------------
// Behaviour registry: the AI module registers one per archetype.
export interface Behaviour {
  init?(e: Enemy): void;
  /** Called each frame while aware and able to act. */
  think(e: Enemy, dt: number): void;
  onHurt?(e: Enemy, info: DamageInfo, amount: number): void;
  onDeath?(e: Enemy, info: DamageInfo): void;
  onAllyDeath?(e: Enemy, ally: Enemy): void;
  render?(e: Enemy, g: Ctx, before: boolean): void;
  /** Weapon the archetype carries (dropped on death; spec 5.4). */
  weapon?: string | ((e: Enemy) => string | null);
}
export const BEHAVIOURS: Partial<Record<ArchetypeId | string, Behaviour>> = {};
export function registerBehaviour(id: ArchetypeId | string, b: Behaviour): void { BEHAVIOURS[id] = b; }

// ---------------------------------------------------------------------------
export interface EnemyInit {
  archetype: ArchetypeId;
  tier: Tier;
  act: Act;
  floor: number;
  x: number; y: number;
  roomId: number;
  rng: Rng;
  aware?: boolean;
  look?: CharacterLook;
  name?: string;
  title?: string;
  /** Telegraph speed multiplier from Performance Review (Micromanagement) and tier. */
  telegraphMult?: number;
}

export function generateIdentity(rng: Rng, tier: Tier): { name: string; title: string } {
  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
  let title: string;
  if (rng.chance(0.12)) title = rng.pick(SPECIAL_TITLES);
  else {
    const sen = tier === 0 ? rng.pick(['Junior', 'Associate', 'Trainee', ...SENIORITY.slice(0, 3)]) : tier === 1 ? rng.pick(['Senior', 'Principal', ...SENIORITY]) : rng.pick(['Head of', 'Lead', 'Chief', 'Global Head of', 'VP of']);
    title = sen.endsWith('of') ? `${sen} ${rng.pick(BUZZWORDS)}` : `${sen} ${rng.pick(BUZZWORDS)} ${rng.pick(FUNCTIONS)}`;
  }
  return { name, title };
}

export class Enemy extends Actor {
  arch: ArchetypeDef;
  archetype: ArchetypeId;
  tier: Tier;
  act: Act;
  floor: number;
  roomId: number;
  rng: Rng;
  look: CharacterLook;
  name: string;
  title: string;
  quirk: QuirkDef;
  speed: number;
  damageMult: number;
  telegraphMult: number;
  aware = false;
  state = 'idle';
  stateT = 0;
  attackCd = 0;
  barkCd: number;
  barkRate = 1;
  barkRage = 2.5;
  voiceSeed: number;
  weapon: WeaponInst | null = null;
  cashDrop: number;
  elite: boolean;
  isBoss = false;
  promoted: any = null;  // PromotedRecord when spawned from the roster
  flags: Record<string, any> = {};
  behaviour: Behaviour;
  moveDir: Vec = { x: 0, y: 0 };
  wanderT = 0;
  /** Busy with a scripted action (attack windup etc.). */
  busy = 0;
  corpseT = 0;
  ignoreForClear = false;
  /** Damage tracker for promotion credit. */
  dealtToPlayerAt = -99;
  deathHandled = false;
  swingVis: { t: number; dur: number; angle: number; arc: number; reach: number } | null = null;
  heldWeaponAngle = 0;

  constructor(o: EnemyInit) {
    super();
    this.team = 'enemy';
    this.arch = ARCHETYPE_DEFS[o.archetype];
    this.archetype = o.archetype;
    this.tier = o.tier;
    this.act = o.act;
    this.floor = o.floor;
    this.roomId = o.roomId;
    this.rng = o.rng;
    this.x = o.x; this.y = o.y;
    this.elite = this.arch.role === 'elite';
    const v = () => o.rng.vary(0.1); // spec 5.3 ±10%
    const tierHp = [1, 1.45, 2.0][o.tier];
    const floorScale = 1 + (o.floor - 1) * 0.045; // spec 3.5: power scales with floor number
    this.maxHp = Math.round(this.arch.hp * tierHp * floorScale * v());
    this.hp = this.maxHp;
    this.speed = this.arch.speed * v() * (1 + o.tier * 0.06);
    this.damageMult = (1 + o.tier * 0.25) * (1 + (o.floor - 1) * 0.03) * v();
    const actMin = ACTS[o.act - 1].telegraphMin;
    this.telegraphMult = (o.telegraphMult ?? 1) * (1 - o.tier * 0.1);
    this.flags.telegraphMin = actMin;
    this.radius = this.elite ? 7 : this.arch.role === 'bruiser' ? 7 : 5;
    this.mass = this.arch.role === 'bruiser' ? 2.2 : this.elite ? 2.5 : this.arch.role === 'swarmer' ? 0.8 : 1;
    this.staggerMax = this.arch.role === 'bruiser' ? 70 : this.elite ? 110 : 34;
    this.cashDrop = Math.max(1, Math.round(this.arch.cost * 2.2 * (1 + o.tier * 0.4)));
    this.barkCd = o.rng.range(2, 8);
    this.voiceSeed = o.rng.nextU32();
    this.look = o.look ?? rollLook({ kind: 'enemy', archetype: o.archetype, tier: o.tier }, o.rng.fork('look'));
    (this.look as any).act = o.act;
    this.baked = bakeCharacter(this.look);
    this.height = this.baked.height;
    const id = o.name ? { name: o.name, title: o.title ?? '' } : generateIdentity(o.rng, o.tier);
    this.name = id.name; this.title = id.title;
    this.quirk = o.rng.pick(QUIRKS);
    this.quirk.apply?.(this);
    this.aware = !!o.aware;
    this.behaviour = BEHAVIOURS[o.archetype] ?? (this.arch.role === 'ranged' ? DEFAULT_RANGED : DEFAULT_MELEE);
    const wid = typeof this.behaviour.weapon === 'function' ? this.behaviour.weapon(this) : this.behaviour.weapon ?? DEFAULT_WEAPONS[o.archetype] ?? null;
    if (wid) this.weapon = makeWeapon(wid, { frac: o.rng.range(0.5, 1) });
    if (this.elite && this.weapon) this.weapon.rare = true;
    this.behaviour.init?.(this);
    this.face(o.rng.range(0, Math.PI * 2));
  }

  get displayTitle(): string { return `${TIER_NAMES[this.tier]} ${this.arch.name}`; }
  get player(): Actor { return this.world.player; }
  /** Effective telegraph windup for a base duration (spec 5.4 minimum per act). */
  windup(base: number): number { return Math.max(this.flags.telegraphMin ?? 0.25, base * this.telegraphMult * (this.flags.overtime ? 0.75 + 0.25 * this.hpFrac : 1)); }
  dmg(base: number): number { return base * this.damageMult * (this.status.rebranded > 0 ? 1.3 : 1); }

  // ------------------------------------------------------------------ update
  update(dt: number): void {
    this.updateStatus(dt);
    this.animT += dt;
    if (this.corpse) { this.corpseT += dt; return; }
    if (this.dying) { this.updateDying(dt); return; }
    if (this.flags.regen && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.flags.regen * dt);
    if (this.status.bleed > 0) this.bleedTick(dt);
    if (this.thrown) { this.updateThrown(dt); return; }
    if (this.grabbedBy) { this.setAnim('grabbed'); return; }

    // knockback
    if (Math.abs(this.kx) + Math.abs(this.ky) > 1) {
      const r = this.world.moveActor(this, this.kx * dt, this.ky * dt);
      if ((r.hitX || r.hitY) && Math.hypot(this.kx, this.ky) > 220) this.wallSplat();
      this.kx *= Math.max(0, 1 - 7 * dt); this.ky *= Math.max(0, 1 - 7 * dt);
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.busy = Math.max(0, this.busy - dt);
    this.stateT += dt;
    if (this.swingVis) { this.swingVis.t += dt; if (this.swingVis.t > this.swingVis.dur) this.swingVis = null; }

    if (this.staggered > 0 || this.status.stun > 0) { this.setAnim('stagger'); return; }
    // wet floors make enemies slip (Caretaker's mop / spilt water)
    if (this.status.wet > 0 && Math.hypot(this.vx, this.vy) > 30 && this.rng.chance(dt * 0.5)) { this.status.stun = 0.6; audio.sfx('slip', { x: this.x, y: this.y }); }

    if (!this.aware) {
      this.idleWander(dt);
      if (this.world.alarm || (dist(this, this.player) < 110 && this.world.los(this, this.player) && this.world.roomAt(this.player.x, this.player.y) === this.roomId)) this.alert();
    } else if (this.player.alive) {
      if (this.status.blind > 0) { this.idleWander(dt); }
      else if (this.status.confused > 0) { this.wanderAt(dt, 0.6); }
      else this.behaviour.think(this, dt);
      // barks fill the player's Rage (spec 2.2)
      this.barkCd -= dt * this.barkRate;
      if (this.barkCd <= 0) { this.barkCd = this.rng.range(5, 11); this.bark(this.rng.chance(0.3) ? 'taunt' : 'attack'); }
    } else {
      this.setAnim('celebrate');
    }
    if (!this.busy && !this.swingVis && this.anim !== 'cast' && this.anim !== 'throw') {
      const mv = Math.hypot(this.vx, this.vy);
      if (this.state === 'flee' && mv > 5) this.setAnim('flee');
      else this.setAnim(mv > 50 ? 'run' : mv > 5 ? 'walk' : 'idle');
    }
  }

  alert(): void {
    if (this.aware) return;
    this.aware = true;
    this.bark('alert');
  }

  private idleWander(dt: number): void {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = this.rng.range(1.5, 4);
      this.moveDir = this.rng.chance(0.5) ? { x: 0, y: 0 } : fromAngle(this.rng.range(0, Math.PI * 2));
    }
    this.steer(this.moveDir, this.speed * 0.3, dt);
    if (Math.hypot(this.moveDir.x, this.moveDir.y) > 0) this.face(Math.atan2(this.moveDir.y, this.moveDir.x));
  }
  private wanderAt(dt: number, mult: number): void { this.idleWander(dt); this.steer(this.moveDir, this.speed * mult, dt); }

  // ------------------------------------------------------------------ movement helpers (for behaviours)
  /** Accelerate towards a desired velocity direction and move with collision. */
  steer(dir: Vec, speed: number, dt: number): void {
    const sm = this.speedMult() * (this.flags.caffeineCrash ? 0.6 : 1);
    const tx = dir.x * speed * sm, ty = dir.y * speed * sm;
    const acc = this.status.wet > 0 ? 2 : 10;
    this.vx += (tx - this.vx) * Math.min(1, acc * dt);
    this.vy += (ty - this.vy) * Math.min(1, acc * dt);
    // hazard avoidance when alert (spec 5.4): push away from active hazards
    const hz = this.world.propsNear(this.x, this.y, 22, (p) => !!p.def.hazard && (p.state === 'active' || !!p.data.electrified));
    for (const p of hz) { const a = angleTo(p.def, this); this.vx += Math.cos(a) * 40 * dt * 10; this.vy += Math.sin(a) * 40 * dt * 10; }
    const r = this.world.moveActor(this, this.vx * dt, this.vy * dt);
    if (r.hitX) this.vx *= -0.2;
    if (r.hitY) this.vy *= -0.2;
  }

  /** Path towards the player via the flow field (direct when LOS). */
  chase(dt: number, speedMult = 1): void {
    const p = this.player;
    let d: Vec | null = null;
    if (dist(this, p) < 90 && this.world.los(this, p)) d = norm({ x: p.x - this.x, y: p.y - this.y });
    else d = this.world.flowDir(this.x, this.y) ?? norm({ x: p.x - this.x, y: p.y - this.y });
    this.steer(d, this.speed * speedMult, dt);
    this.face(Math.atan2(p.y - this.y, p.x - this.x));
  }

  /** Move away from the player (kiting). */
  retreat(dt: number, speedMult = 1): void {
    const p = this.player;
    const d = norm({ x: this.x - p.x, y: this.y - p.y });
    this.steer(d, this.speed * speedMult, dt);
    this.face(angleTo(this, p));
  }

  /** Circle-strafe around the player at the current distance. */
  strafe(dt: number, dirSign: number, speedMult = 0.8): void {
    const p = this.player;
    const a = angleTo(p, this) + dirSign * Math.PI / 2;
    this.steer(fromAngle(a), this.speed * speedMult, dt);
    this.face(angleTo(this, p));
  }

  stop(dt: number): void { this.steer({ x: 0, y: 0 }, 0, dt); }

  distToPlayer(): number { return dist(this, this.player); }
  seesPlayer(): boolean { return this.world.los(this, this.player); }
  angleToPlayer(): number { return angleTo(this, this.player); }

  // ------------------------------------------------------------------ attack helpers (all telegraphed — spec 5.4)
  /** Melee arc attack in front: telegraph then hit. */
  meleeAttack(o: { windup?: number; reach?: number; arc?: number; damage?: number; knockback?: number; anim?: AnimName; cd?: number; heavy?: boolean; type?: DamageInfo['type']; onHit?: (t: Actor) => void; lunge?: number; track?: boolean }): void {
    const reach = o.reach ?? this.arch.attackRange + 8;
    const arc = o.arc ?? 1.6;
    const angle = this.angleToPlayer();
    const w = this.windup(o.windup ?? 0.5);
    this.busy = w + 0.25;
    this.attackCd = o.cd ?? 1.1;
    this.stop(0);
    this.vx = this.vy = 0;
    this.setAnim(o.anim ?? 'attack1', true);
    this.animT = 0;
    const shape: Shape = { kind: 'arc', x: this.x, y: this.y - 6, r: reach, angle, half: arc / 2 };
    this.world.telegraph(this, shape, w, (s) => {
      if (!this.alive) return;
      if (o.lunge) { const l = fromAngle((s as any).angle, o.lunge); this.world.moveActor(this, l.x, l.y); }
      this.swingVis = { t: 0, dur: 0.15, angle: (s as any).angle, arc, reach };
      audio.sfx(o.heavy ? 'golf_swing' : 'enemy_swing', { x: this.x, y: this.y });
      for (const t of queryActors(this.world, { ...s, x: this.x, y: this.y - 6 } as Shape, 'player')) {
        const dealt = this.world.damage(t, { amount: this.dmg(o.damage ?? this.arch.damage), type: o.type ?? 'blunt', method: 'melee', source: this, knockback: o.knockback ?? 120, dir: (s as any).angle, weaponId: this.weapon?.id });
        if (dealt > 0) { this.dealtToPlayerAt = this.world.time; o.onHit?.(t); }
      }
      // hits hazards too
      for (const p of this.world.propsNear(this.x, this.y, reach)) if (p.def.hazard && Math.abs(angleDiff((s as any).angle, angleTo(this, p.def))) < arc / 2) this.world.hitProp(p, { amount: 5, type: 'blunt', method: 'melee', source: this });
    }, { heavy: o.heavy, follow: o.track ? (s: any) => { s.x = this.x; s.y = this.y - 6; } : (s: any) => { s.x = this.x; s.y = this.y - 6; } });
  }

  /** Ranged shot(s): line telegraph then projectile(s). */
  rangedAttack(o: { windup?: number; kind?: ProjectileKind; itemId?: string; speed?: number; damage?: number; count?: number; spread?: number; cd?: number; gravity?: boolean; anim?: AnimName; slow?: { amt: number; time: number }; onHit?: (t: Actor | null) => void; type?: DamageInfo['type']; lead?: boolean }): void {
    const w = this.windup(o.windup ?? 0.55);
    const p = this.player;
    let angle = this.angleToPlayer();
    if (o.lead) { const t = dist(this, p) / (o.speed ?? 200); angle = angleTo(this, { x: p.x + (p as any).vx * t * 0.5, y: p.y + (p as any).vy * t * 0.5 }); }
    this.busy = w + 0.2;
    this.attackCd = o.cd ?? 1.8;
    this.vx = this.vy = 0;
    this.setAnim(o.anim ?? 'throw', true);
    const len = Math.min(260, dist(this, p) + 30);
    this.world.telegraph(this, { kind: 'line', x: this.x, y: this.y - 4, angle, len, width: 6 + (o.count ?? 1) * 2 }, w, (s: any) => {
      if (!this.alive) return;
      const n = o.count ?? 1;
      for (let i = 0; i < n; i++) {
        const a = s.angle + (n > 1 ? (i - (n - 1) / 2) * (o.spread ?? 0.15) : 0);
        this.world.add(new Projectile({
          team: 'enemy', x: this.x + Math.cos(a) * 8, y: this.y + Math.sin(a) * 4, z: 12, angle: a, speed: o.speed ?? 200, kind: o.kind, itemId: o.itemId,
          spin: o.itemId ? 14 : 0, gravity: o.gravity, life: 2.2, radius: 3, slow: o.slow,
          dmg: { amount: this.dmg(o.damage ?? this.arch.damage), type: o.type ?? 'blunt', method: 'ranged', source: this, knockback: 60 },
          onHit: (_pp, t) => { if (t && t.team === 'player') this.dealtToPlayerAt = this.world.time; o.onHit?.(t); },
        }));
      }
      audio.sfx('enemy_throw', { x: this.x, y: this.y });
    }, { follow: (s: any) => { s.x = this.x; s.y = this.y - 4; } });
  }

  /** Area attack on a point (circle), e.g. slams, electrified zones. */
  areaAttack(o: { x: number; y: number; r: number; windup?: number; damage?: number; type?: DamageInfo['type']; knockback?: number; cd?: number; onFire?: () => void; heavy?: boolean }): void {
    const w = this.windup(o.windup ?? 0.7);
    this.busy = w + 0.2;
    this.attackCd = o.cd ?? 2;
    this.world.telegraph(this, { kind: 'circle', x: o.x, y: o.y, r: o.r }, w, (s: any) => {
      if (!this.alive) return;
      o.onFire?.();
      for (const t of queryActors(this.world, s, 'player')) {
        const dealt = this.world.damage(t, { amount: this.dmg(o.damage ?? this.arch.damage), type: o.type ?? 'blunt', method: 'melee', source: this, knockback: o.knockback ?? 140, dir: angleTo(s, t) });
        if (dealt > 0) this.dealtToPlayerAt = this.world.time;
      }
    }, { heavy: o.heavy });
  }

  /** Say a line: subtitle + bubble + vocal grunt; fills the player's Rage if close (spec 2.2). */
  bark(ctx: BarkContext, text?: string): void {
    const line = text ?? pickBark(this.rng, this.archetype, ctx, this.act);
    if (!line) return;
    this.world.say(this, `${this.name} (${this.arch.name})`, line);
    audio.voice(this.voiceSeed, ctx === 'death' ? 'death' : ctx === 'hurt' ? 'pain' : ctx === 'chant' ? 'chant' : 'bark', { x: this.x, y: this.y, syllables: Math.min(8, 2 + Math.floor(line.length / 8)) });
    const p = this.player as any;
    if (p?.alive && dist(this, p) < 200) p.addRage?.(this.barkRage, true);
  }

  // ------------------------------------------------------------------ thrown bodies (spec 4.7 breach, executions)
  private updateThrown(dt: number): void {
    const th = this.thrown!;
    th.t -= dt;
    this.setAnim('thrown');
    const w = this.world;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + th.vx * dt / steps, ny = this.y + th.vy * dt / steps;
      const tx = Math.floor(nx / TILE), ty = Math.floor((ny - 4) / TILE);
      const tile = w.tile(tx, ty);
      const speed = Math.hypot(th.vx, th.vy);
      if (w.isSolidTile(tx, ty)) {
        // breach a partition (merges rooms) or defenestrate through an exterior window
        if (BREACHABLE_TILES.has(tile) && speed > 150) {
          const b = w.breachAtTile(tx, ty);
          if (b) {
            w.breach(b, { x: nx, y: ny }, Math.atan2(th.vy, th.vx));
            const bonus = Math.round(15 * ((w.player as any).stats?.breachCash ?? 1));
            dropCash(w, nx, ny, bonus);
            (w.player as any).addRage?.(15);
            (w.player as any).run && (w.player as any).run.log.breaches++;
            this.x = nx + Math.cos(Math.atan2(th.vy, th.vx)) * 14; this.y = ny + Math.sin(Math.atan2(th.vy, th.vx)) * 14;
            w.damage(this, { amount: 18, type: 'crush', method: 'breach', source: th.thrower, unavoidable: true });
            this.endThrow(); return;
          }
        }
        if ((tile === T.WINDOW || tile === T.WINDOW_BROKEN) && speed > 180) {
          w.smashWindow(tx, ty);
          this.defenestrated(th.thrower);
          return;
        }
        // wall slam
        w.damage(this, { amount: 12 + this.maxHp * 0.08, type: 'crush', method: 'body', source: th.thrower, unavoidable: true });
        debrisBurst(w.particles, nx, ny, 6, ['#d0c8b8', '#a09888'], this.roomId);
        audio.sfx('thud', { x: nx, y: ny });
        app_shake(3);
        this.status.stun = Math.max(this.status.stun, 1.2);
        this.endThrow();
        return;
      }
      this.x = nx; this.y = ny;
      // body hits other enemies (projectile)
      for (const a of w.actors) {
        if (a === this || !a.alive || a.team !== 'enemy' || th.hitIds.has(a.id) || a.grabbedBy) continue;
        if (dist(a, this) > a.radius + this.radius + 4) continue;
        th.hitIds.add(a.id);
        const dir = Math.atan2(th.vy, th.vx);
        w.damage(a, { amount: 14 + this.maxHp * 0.12, type: 'blunt', method: 'body', source: th.thrower, knockback: 200, stagger: 60, dir });
        w.damage(this, { amount: 8, type: 'blunt', method: 'body', source: th.thrower, unavoidable: true });
        w.bus.emit('throwHit', { victim: this, hitActor: a });
        th.vx *= 0.6; th.vy *= 0.6;
      }
      // hazards
      const prop = w.propAt(this.x, this.y - 4, 2);
      if (prop && (prop.def.hazard || prop.maxHp > 0) && !th.hitIds.has(-prop.def.id)) {
        th.hitIds.add(-prop.def.id);
        w.hitProp(prop, { amount: 40, type: 'blunt', method: 'body', source: th.thrower, dir: Math.atan2(th.vy, th.vx), body: true, heavy: true });
        if (prop.solid) { this.status.stun = 1; this.endThrow(); return; }
      }
    }
    th.vx *= Math.max(0, 1 - 1.5 * dt); th.vy *= Math.max(0, 1 - 1.5 * dt);
    if (th.t <= 0 || Math.hypot(th.vx, th.vy) < 40) { this.status.stun = Math.max(this.status.stun, 0.8); this.endThrow(); }
  }

  private endThrow(): void {
    this.thrown = null;
    this.kx = this.ky = 0;
    this.vx = this.vy = 0;
    if (this.alive) this.setAnim('knockdown', true);
    this.squash = 0.7;
  }

  private wallSplat(): void {
    this.kx *= -0.3; this.ky *= -0.3;
    this.world.damage(this, { amount: 6, type: 'crush', method: 'body', source: this.lastHitBy, silent: false });
    audio.sfx('thud', { x: this.x, y: this.y, vol: 0.6 });
  }

  /** Thrown out of an exterior window: counts as a defenestration kill. */
  defenestrated(by: Actor | null): void {
    this.thrown = null;
    this.flags.defenestrated = true;
    this.executed = true;
    this.ignoreForClear = true;
    audio.sfx('fall_whistle', { x: this.x, y: this.y });
    this.world.damage(this, { amount: 99999, type: 'fall', method: 'execution', source: by, unavoidable: true, hazardKind: 'defenestration' });
    this.dead = true; // gone out of the building
  }

  // ------------------------------------------------------------------ death
  onDeath(info: DamageInfo): void {
    if (this.grabbedBy) { const g = this.grabbedBy as any; if (g.grabbing === this) g.grabbing = null; }
    this.thrown = null;
    this.grabbedBy = null;
    this.deathAnim = info.method === 'body' || (info.knockback ?? 0) > 180 ? 'death2' : info.type === 'electric' ? 'death3' : this.rng.pick(['death1', 'death2', 'death3'] as AnimName[]);
    this.setAnim(this.deathAnim, true);
    const dir = info.dir ?? 0;
    // dismemberment (spec 1.3: gore toggle applies)
    const gl = goreLevel();
    const dis = gl === 2 && !this.flags.defenestrated && (this.rng.next() < (info.dismember ?? 0) || info.type === 'explosive' || (info.crit && info.type === 'sharp' && this.rng.chance(0.4)));
    if (dis && this.baked) {
      this.dismembered = true;
      gibBurst(this.world.particles, this.baked.gibs, this.x, this.y - 10, dir, this.roomId, info.type === 'explosive' ? 1.5 : 1);
      audio.sfx('dismember', { x: this.x, y: this.y });
    } else {
      bloodBurst(this.world.particles, this.x, this.y, dir, 14, this.roomId, 14);
      if (gl > 0) this.world.decals.splat(this.roomId, this.x, this.y + 2, 6, undefined, 'pool');
    }
    audio.sfx('enemy_death', { x: this.x, y: this.y });
    if (this.rng.chance(0.5)) this.bark('death');
    this.behaviour.onDeath?.(this, info);
    // weapon drops with remaining durability (spec 5.4)
    if (this.weapon && !this.flags.defenestrated) {
      const w = this.weapon;
      if (wdef(w.id).cls === 'ranged') w.ammo = Math.max(1, Math.round(w.maxAmmo * this.rng.range(0.25, 0.6)));
      this.world.add(new Pickup({ kind: 'weapon', weapon: w, x: this.x, y: this.y, vx: Math.cos(dir) * 40, vy: Math.sin(dir) * 40 }));
    }
    if (!this.flags.defenestrated) dropCash(this.world, this.x, this.y, this.cashDrop);
    if (this.flags.snack) this.world.add(new Pickup({ kind: 'heal', amount: 8, x: this.x, y: this.y }));
    // allies react
    for (const a of this.world.actors) if (a !== this && a instanceof Enemy && a.alive && a.roomId === this.roomId) a.behaviour.onAllyDeath?.(a, this);
  }

  private updateDying(dt: number): void {
    this.kx *= Math.max(0, 1 - 6 * dt); this.ky *= Math.max(0, 1 - 6 * dt);
    this.world.moveActor(this, this.kx * dt, this.ky * dt);
    if (this.animT >= (this.baked?.duration(this.deathAnim) ?? 0.6)) {
      this.dying = false;
      this.corpse = true;
      if (this.dismembered) this.dead = true; // body is in pieces: nothing left to re-onboard
      this.layer = 0;
    }
  }

  private bleedTick(dt: number): void {
    const dps = this.status.bleedDps * ((this.world.player as any)?.stats?.bleedDamage ?? 1);
    this.hp -= dps * dt;
    if (this.rng.chance(dt * 6)) bloodBurst(this.world.particles, this.x, this.y, fxRng.range(0, 6.28), 1, this.roomId, 10);
    if (this.hp <= 0) { this.hp = 1; this.world.damage(this, { amount: 2, type: 'cut', method: 'bleed', source: this.lastHitBy, unavoidable: true, silent: true }); }
  }

  override onHurtLocal(info: DamageInfo, amount: number): void {
    if (this.flags.dodger && this.rng.chance(0.15) && info.method !== 'execution') { /* hybrid workers occasionally 'aren't in today' */ }
    if (!this.aware) this.alert();
    if (this.flags.replyAll) for (const a of this.world.actors) if (a instanceof Enemy && a.roomId === this.roomId) a.alert();
    if (amount > 0 && this.rng.chance(0.25)) this.bark('hurt');
    this.behaviour.onHurt?.(this, info, amount);
  }

  override modifyIncoming(info: DamageInfo): number {
    if (this.flags.dodger && info.method !== 'execution' && info.method !== 'breach' && !info.unavoidable && this.rng.chance(0.08)) {
      this.world.floatText(this.x, this.y - 34, 'WFH', '#9fe0ff');
      return 0;
    }
    const mod = (this.behaviour as any).modifyIncoming as ((e: Enemy, i: DamageInfo) => number) | undefined;
    return mod ? mod(this, info) : info.amount;
  }

  // ------------------------------------------------------------------ render
  render(g: Ctx): void {
    const b = this.baked!;
    if (!this.corpse) this.drawShadow(g, b.shadowW);
    this.behaviour.render?.(this, g, true);
    const lift = this.thrown ? 8 : this.grabbedBy ? 4 : 0;
    const anim = this.corpse ? this.deathAnim : this.anim;
    const t = this.corpse ? 99 : this.animT;
    const hand = b.hand(anim, this.dir, t);
    const showW = this.weapon && !this.corpse && !this.dying && !this.thrown && !this.grabbedBy && wdef(this.weapon.id).cls !== 'throwable';
    let wa = this.facing;
    if (this.swingVis) { const p = this.swingVis.t / this.swingVis.dur; wa = this.swingVis.angle + (this.swingVis.arc / 2) * (p * 2 - 1); }
    const drawW = () => { if (showW) drawSpriteRot(g, weaponSprite(this.weapon!.id), this.x + hand.x, this.y + hand.y - lift, wa, Math.cos(wa) < 0); };
    if (hand.behind) drawW();
    b.draw(g, anim, this.dir, t, this.x, this.y - lift, {
      flash: this.hitFlash, squash: this.squash,
      tint: this.status.electrified > 0 ? '#8fe8ff' : this.status.rebranded > 0 ? '#ffb000' : this.staggered > 0 ? '#ffffff' : undefined,
      tintAmt: this.status.electrified > 0 ? 0.5 : this.status.rebranded > 0 ? 0.25 : this.staggered > 0 ? 0.15 + 0.1 * Math.sin(this.world.time * 20) : 0,
      alpha: this.corpse ? 1 : 1,
    });
    if (!hand.behind) drawW();
    if (this.swingVis) {
      const s = this.swingVis;
      g.save(); g.globalAlpha = 0.6 * (1 - s.t / s.dur); g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc(this.x, this.y - 6, s.reach * 0.8, s.angle - s.arc / 2, s.angle + s.arc / 2); g.stroke(); g.restore();
    }
    this.behaviour.render?.(this, g, false);
    if (this.corpse || this.dying) return;
    // overhead: HP bar when damaged; grabbable indicator; stagger stars
    const top = Math.round(this.y - this.height - 6 - lift);
    if (this.hp < this.maxHp || this.elite) {
      const w = this.elite ? 22 : 14;
      g.fillStyle = '#0b0c10'; g.fillRect(Math.round(this.x - w / 2) - 1, top - 1, w + 2, 4);
      g.fillStyle = '#3a1416'; g.fillRect(Math.round(this.x - w / 2), top, w, 2);
      g.fillStyle = this.elite ? '#ffc53d' : '#e04545'; g.fillRect(Math.round(this.x - w / 2), top, Math.round(w * clamp(this.hpFrac, 0, 1)), 2);
      if (this.shield > 0) { g.fillStyle = '#5ec8ff'; g.fillRect(Math.round(this.x - w / 2), top - 2, Math.round(w * clamp(this.shield / Math.max(1, this.maxShield), 0, 1)), 1); }
    }
    const p = this.world.player as any;
    if (p && p.grabCandidate === this) {
      const bob = Math.round(Math.sin(this.world.time * 10) * 1);
      g.fillStyle = '#ffd34d';
      g.fillRect(Math.round(this.x) - 1, top - 8 + bob, 3, 3);
      g.fillRect(Math.round(this.x) - 3, top - 6 + bob, 7, 1);
    }
    if (this.staggered > 0 || this.status.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.world.time * 6 + i * 2.1;
        g.fillStyle = '#ffe9a0';
        g.fillRect(Math.round(this.x + Math.cos(a) * 7), Math.round(top - 3 + Math.sin(a) * 2), 1, 1);
      }
    }
  }
}

// Hook from combat → enemy (keeps combat generic)
declare module './entity' {
  interface Actor { onHurtLocal?(info: DamageInfo, amount: number): void; }
}

function app_shake(m: number): void { app.renderer.shake(m, 0.15); }

/** Pick a bark line for an archetype/context, falling back to generic lines. */
export function pickBark(rng: Rng, arch: ArchetypeId, ctx: BarkContext, act: Act): string | null {
  const own = BARKS.filter((b) => b.archetype === arch && b.context === ctx);
  const any = BARKS.filter((b) => b.archetype === 'any' && b.context === ctx && (!b.act || b.act <= act));
  const pool = own.length && (rng.chance(0.65) || !any.length) ? own : any.length ? any : BARKS.filter((b) => b.archetype === arch);
  if (!pool.length) return null;
  return rng.pick(pool).text;
}

// ---------------------------------------------------------------------------
// Default behaviours (used until/unless the AI module registers a bespoke one)
export const DEFAULT_WEAPONS: Partial<Record<ArchetypeId, string>> = {
  intern: 'mug', receptionist: 'desk_phone', caretaker: 'mop', it_tech: 'keyboard', fire_warden: 'fire_extinguisher',
  sales_rep: 'energy_drink', marketing_exec: 'clipboard', call_centre: 'desk_phone', team_leader: 'clipboard', employee_of_month: 'framed_certificate',
  accountant: 'calculator', lawyer: 'briefcase', compliance_officer: 'policy_binder', procurement_buyer: 'box_cutter', auditor: 'letter_opener',
  hr_partner: 'scissors', svp: 'golf_club', exec_assistant: 'letter_opener', consultant: 'laser_pointer', culture_champion: 'trophy',
};

export const DEFAULT_MELEE: Behaviour = {
  think(e, dt) {
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const reach = e.arch.attackRange + 6;
    if (d < reach + 6 && e.attackCd <= 0 && e.seesPlayer()) e.meleeAttack({ windup: 0.5, reach: reach + 6 });
    else if (d > reach * 0.8) e.chase(dt);
    else e.strafe(dt, (e.id % 2) * 2 - 1, 0.5);
  },
};

export const DEFAULT_RANGED: Behaviour = {
  think(e, dt) {
    if (e.busy > 0) { e.stop(dt); return; }
    const d = e.distToPlayer();
    const sees = e.seesPlayer();
    if (d < 60) e.retreat(dt);
    else if (!sees || d > e.arch.attackRange) e.chase(dt);
    else if (e.attackCd <= 0) e.rangedAttack({ kind: 'staple', speed: 220 });
    else e.strafe(dt, (e.id % 2) * 2 - 1, 0.6);
  },
};

export type { KillMethod };
