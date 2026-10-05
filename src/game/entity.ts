// Entity + Actor base classes. Actors are anything that fights: the player, enemies, bosses.
import type { World } from './world';
import type { Ctx } from '../render/canvas';
import type { AnimName, BakedCharacter } from '../art/characters';
import type { DamageType } from '../data/ids';
import type { KillMethod } from './stats';
import { dir4 } from '../core/math';

let nextId = 1;

export abstract class Entity {
  id = nextId++;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  radius = 5;
  dead = false;          // remove from the world at end of frame
  world!: World;
  /** Draw order layer: floor items under actors, air above. */
  layer: 0 | 1 | 2 = 1;
  /** Entities with persist=true keep updating even when their room is suspended. */
  persist = false;

  abstract update(dt: number): void;
  abstract render(g: Ctx): void;
  sortY(): number { return this.y; }
  onAdded(): void {}
  onRemoved(): void {}
}

export type Team = 'player' | 'enemy' | 'neutral';

export interface DamageInfo {
  amount: number;
  type: DamageType;
  method: KillMethod;
  source?: Actor | null;
  /** Direction of the hit (radians) for knockback / gore spray. */
  dir?: number;
  knockback?: number;
  stagger?: number;
  bleed?: number;        // chance 0..1 to apply bleed
  dismember?: number;    // chance on kill
  crit?: boolean;
  weaponId?: string;
  hazardKind?: string;
  ignoreShield?: boolean;
  /** Execution / scripted damage: ignores i-frames. */
  unavoidable?: boolean;
  /** Suppress hit-stop and flinch (DoT ticks). */
  silent?: boolean;
}

export interface StatusMap {
  bleed: number;        // seconds remaining
  bleedDps: number;
  stun: number;
  slow: number;         // seconds
  slowAmt: number;      // 0..1 speed reduction
  wet: number;
  electrified: number;
  confused: number;
  injunction: number;   // takes increased damage (Legal)
  marked: number;       // auditor mark on player
  blind: number;        // smoke
  burning: number;
  rebranded: number;    // marketing buff
  armour: number;       // temporary damage reduction (power pose)
  armourAmt: number;
}

const freshStatus = (): StatusMap => ({ bleed: 0, bleedDps: 0, stun: 0, slow: 0, slowAmt: 0, wet: 0, electrified: 0, confused: 0, injunction: 0, marked: 0, blind: 0, burning: 0, rebranded: 0, armour: 0, armourAmt: 0 });

export abstract class Actor extends Entity {
  team: Team = 'neutral';
  hp = 100;
  maxHp = 100;
  shield = 0;
  maxShield = 0;
  facing = Math.PI / 2;  // radians
  dir: 0 | 1 | 2 | 3 = 0;
  anim: AnimName = 'idle';
  animT = 0;
  baked: BakedCharacter | null = null;
  status: StatusMap = freshStatus();
  hitFlash = 0;
  invuln = 0;
  /** Knockback velocity (decays). */
  kx = 0; ky = 0;
  /** Stagger meter (0..staggerMax). Exceeding it staggers the actor. */
  staggerMeter = 0;
  staggerMax = 40;
  staggered = 0;
  /** Held by a grabber. */
  grabbedBy: Actor | null = null;
  /** Thrown as a projectile (body). */
  thrown: { t: number; vx: number; vy: number; thrower: Actor | null; hitIds: Set<number> } | null = null;
  /** Death: corpse stays on floor. */
  dying = false;
  corpse = false;
  dismembered = false;
  executed = false;
  deathAnim: AnimName = 'death1';
  lastHitBy: Actor | null = null;
  lastHitTime = -99;
  /** Mass: affects knockback. */
  mass = 1;
  /** Collides with other actors (dashes disable this). */
  pushable = true;
  /** Ghost: passes through actors (dash). */
  ghost = false;
  /** Visual squash. */
  squash = 1;
  /** Hurtbox height for projectiles/z. */
  height = 30;

  get alive(): boolean { return !this.dying && !this.corpse; }
  get hpFrac(): number { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }

  setAnim(a: AnimName, restart = false): void {
    if (this.anim !== a || restart) { this.anim = a; this.animT = 0; }
  }

  face(angle: number): void { this.facing = angle; this.dir = dir4(angle); }

  /** Called by combat when this actor dies. */
  abstract onDeath(info: DamageInfo): void;

  /** Hook: modify incoming damage (armour, shields of binder etc.). Return final amount. */
  modifyIncoming(info: DamageInfo): number { return info.amount; }

  isStunned(): boolean { return this.status.stun > 0 || this.staggered > 0 || this.grabbedBy !== null || this.thrown !== null; }

  speedMult(): number {
    let m = 1;
    if (this.status.slow > 0) m *= 1 - this.status.slowAmt;
    return m;
  }

  updateStatus(dt: number): void {
    const s = this.status;
    for (const k of Object.keys(s) as (keyof StatusMap)[]) {
      if (k === 'bleedDps' || k === 'slowAmt' || k === 'armourAmt') continue;
      if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.staggered > 0) this.staggered = Math.max(0, this.staggered - dt);
    this.staggerMeter = Math.max(0, this.staggerMeter - dt * 12);
    this.squash += (1 - this.squash) * Math.min(1, dt * 14);
  }

  drawShadow(g: Ctx, w = 12): void {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    const sw = Math.round(w), x = Math.round(this.x), y = Math.round(this.y);
    g.fillRect(x - sw / 2 + 1, y - 1, sw - 2, 3);
    g.fillRect(x - sw / 2, y, sw, 1);
  }
}
