// The run: builds each floor, wires systems together, handles room-lock/clear, rewards, exits, transitions,
// death/victory, suspend saves (spec 3, 10.3).
import { app, Scene, PLATFORM } from '../core/app';
import { Rng, dailySeed } from '../core/rng';
import { generateFloor } from '../game/gen/floorgen';
import { World } from '../game/world';
import { Player, PlayerCtl } from '../game/player';
import { Enemy } from '../game/enemy';
import type { Actor, DamageInfo } from '../game/entity';
import { RunState, FloorPlan, ExitOption, rollExits, streamsOf, logEvent, actDef, RUN_VERSION } from '../game/run';
import { SpawnContext, SpawnQueues, populateFloor, updateReinforcements } from '../game/spawner';
import { Hud } from '../ui/hud';
import { audio, MusicTrack } from '../audio/audio';
import { Pickup, dropCash } from '../game/pickups';
import { makeWeapon, rollWeapon } from '../game/weapons';
import { FLOOR_SETUP, BOSS_FLOORS, REWARD_GRANT, FLOOR_HOOKS, RUN_END_HOOKS, RUN_START_HOOKS, SCENES } from '../game/registry';
import type { FloorRequest } from '../game/world-types';
import { saveVersioned, removeSave } from '../core/storage';
import { profile, saveProfile } from '../game/profile';
import { FLOOR_INTROS, ALARM_FLOOR_LINES } from '../data/text/announcements';
import { setExecutionHandler, seenExecutions } from '../game/executions';
import type { Vec } from '../core/math';
import { dist } from '../core/math';
import { drawText, drawWrapped } from '../render/font';
import { rect } from '../render/canvas';
import { THEME_NAMES } from '../data/ids';
import type { ExitKind, RewardKind } from '../data/ids';
import { touch } from '../ui/touch';
import { renderNotifications, updateNotifications, notify } from '../ui/corpos';
import { TransitionScene } from './transition';
import { PauseScene } from './pause';
import { ARCHETYPE_DEFS } from '../data/tables';

export const SUSPEND_KEY = 'suspend';

export class GameplayScene implements Scene {
  name = 'gameplay';
  run: RunState;
  plan: FloorPlan;
  world!: World;
  player!: Player;
  hud = new Hud();
  spawn!: SpawnContext;
  exits: ExitOption[] = [];
  /** After a lift ambush, continue straight to this floor. */
  pendingDest: FloorPlan | null = null;
  state: 'play' | 'dying' | 'done' = 'play';
  deathT = 0;
  killer: Actor | null = null;
  killMethod = '';
  killWeapon = '';
  floorTime = 0;
  floorStartJson = '';
  /** Last room cleared — floor rewards appear there (Hades model). */
  lastClearedAt: Vec | null = null;
  /** Content modules may stash per-floor data here. */
  data: Record<string, any> = {};
  private started = false;
  private offBg: () => void;
  private ctl: PlayerCtl;
  floorRng!: { combat: Rng; loot: Rng; spawns: Rng; cosmetic: Rng; events: Rng };

  constructor(run: RunState, opts: { resumed?: boolean } = {}) {
    this.run = run;
    this.plan = run.plan;
    if (opts.resumed) removeSave(SUSPEND_KEY); // spec 10.3: suspend saves are deleted when the run resumes
    const bg = () => this.backgroundSave();
    app.onBackground.push(bg);
    window.addEventListener('cp-pause', bg);
    this.offBg = () => { app.onBackground = app.onBackground.filter((f) => f !== bg); window.removeEventListener('cp-pause', bg); };
    this.ctl = this.makeCtl();
  }

  enter(): void {
    if (!this.started) {
      this.started = true;
      for (const h of RUN_START_HOOKS) h(this);
      this.startFloor();
    }
    touch.setContext({ mode: 'gameplay' } as any);
    window.addEventListener('cp-back', this.onBack);
  }

  exit(): void {
    this.offBg();
    window.removeEventListener('cp-back', this.onBack);
    touch.setContext({ mode: 'menu' } as any);
    audio.music.setCombat(false);
    audio.music.setRage(false);
  }

  resume(): void { touch.setContext({ mode: 'gameplay' } as any); }

  private onBack = () => { if (app.top === this) this.pause(); };

  // ------------------------------------------------------------------ input
  private makeCtl(): PlayerCtl {
    const inp = app.input;
    return {
      move: { x: 0, y: 0 },
      aimPoint: null,
      aimDir: null,
      pressed: (a) => inp.pressed(a),
      released: (a) => inp.released(a),
      down: (a) => inp.down(a),
      held: (a) => inp.held(a),
      assist: 0,
    };
  }

  private updateCtl(): void {
    const inp = app.input;
    const c = this.ctl;
    const bot = (window as any).__cpBot as ((c: PlayerCtl, s: GameplayScene) => void) | undefined;
    if (bot) { bot(c, this); return; }
    c.move = inp.move();
    const stick = inp.stickAim();
    if (inp.device === 'kbm') {
      c.aimPoint = app.renderer.frameToWorld(inp.mouse.x, inp.mouse.y);
      c.aimDir = null;
      c.assist = 0;
    } else {
      c.aimPoint = null;
      c.aimDir = stick;
      c.assist = inp.device === 'touch' ? Math.max(0.2, app.settings.aimAssist) : app.settings.aimAssistPad;
    }
  }

  // ------------------------------------------------------------------ floors
  floorRequest(plan: FloorPlan, exits: ExitKind[]): FloorRequest {
    return {
      runSeed: this.run.seed, floorNumber: plan.floor_number, act: plan.act, wing: plan.wing, floorType: plan.floor_type,
      theme: plan.department_theme, alarm: plan.alarm, exits, platform: PLATFORM === 'android' ? 'android' : 'pc',
      hotDesking: (this.run.modifiers.hot_desking ?? 0) > 0, cultDressing: plan.act === 4,
    };
  }

  startFloor(): void {
    const run = this.run;
    const plan = (this.plan = run.plan);
    run.floor = plan.floor_number;
    run.wing = plan.wing;
    this.state = 'play';
    this.floorTime = 0;
    this.lastClearedAt = null;
    this.data = {};
    this.hud = new Hud();
    this.floorStartJson = JSON.stringify(run);
    const r = (n: string) => Rng.from(run.seed, plan.floor_number, plan.wing, plan.floor_type, n);
    this.floorRng = { combat: r('combat'), loot: r('loot'), spawns: r('spawns'), cosmetic: r('cosmetic'), events: r('events') };

    // exits offered once this floor is cleared (decided now so they're deterministic and the core can show them)
    this.exits = plan.floor_type === 'lift_ambush' || (plan.floor_number >= 20 && plan.floor_type === 'boss') ? [] : rollExits(run);
    const req = this.floorRequest(plan, this.exits.filter((e) => e.available).map((e) => e.kind));
    const boss = plan.floor_type === 'boss' ? BOSS_FLOORS[plan.act] : undefined;
    const map = boss ? boss.buildMap(req) : generateFloor(req);

    const w = (this.world = new World(map, this.floorRng));
    const p = (this.player = new Player(run));
    p.ctl = this.ctl;
    p.x = map.spawn.x; p.y = map.spawn.y;
    p.face(-Math.PI / 2);
    w.player = p;
    w.add(p);
    (w as any).breachStunMult = p.stats.breachStun;

    // Rage cannot be stockpiled between floors (spec 2.2); Ex-Employee starts in Rage every floor
    p.rage = 0;
    if (run.role === 'ex_employee') { p.rage = 100; p.raging = 0; setTimeout(() => { if (this.player === p) p.activateRage(); }, 400); }

    // hooks
    w.onKill = (v, i) => this.onKill(v, i);
    w.onHurt = (v, i, a, ab) => this.onHurt(v, i, a, ab);
    w.onRoomLocked = () => { audio.music.setCombat(true); };
    w.onRoomCleared = (id) => this.onRoomCleared(id);
    w.onFloorCleared = () => this.onFloorCleared();
    setExecutionHandler((type, victim) => this.onExecution(type, victim));

    // enemies
    const queues = new SpawnQueues();
    const telegraphMult = 1 - 0.12 * (run.modifiers.micromanagement ?? 0);
    this.spawn = { world: w, run, plan, rng: this.floorRng.spawns, telegraphMult, queues };
    w.pendingFor = (id) => queues.count(id);
    if (boss) boss.setup(this);
    else if (plan.floor_type === 'standard' || plan.floor_type === 'elite' || plan.floor_type === 'lift_ambush' || plan.floor_type === 'challenge') populateFloor(this.spawn);
    FLOOR_SETUP[plan.floor_type]?.(this);
    for (const h of FLOOR_HOOKS) h(this);

    // exits in the building core
    this.setupExits();

    // presentation
    w.snapCamera();
    const music: MusicTrack = boss ? boss.music : plan.floor_type === 'shop' ? 'shop' : plan.floor_type === 'event' || plan.floor_type === 'treasure' ? 'event' : run.daily && plan.act === 1 && false ? 'daily' : (`act${plan.act}` as MusicTrack);
    audio.music.play(music, 1.2);
    audio.music.setCombat(w.alarm);
    audio.music.setRage(false);
    const intro = FLOOR_INTROS[plan.department_theme];
    const title = plan.floor_type === 'boss' ? '' : plan.wing > 0 ? 'WEST WING — ' + plan.floor_type.toUpperCase() : `FLOOR ${plan.floor_number} — ${(THEME_NAMES[plan.department_theme] ?? '').toUpperCase()}`;
    if (title) this.hud.showBanner(title, plan.alarm ? this.floorRng.cosmetic.pick(ALARM_FLOOR_LINES) : intro ? this.floorRng.cosmetic.pick(intro) : undefined, plan.alarm ? '#ff6a5a' : '#ffd34d', 3.2);
    if (plan.alarm) { audio.sfx('alarm'); }
    if (plan.floor_type === 'elite') notify({ kind: 'warn', title: 'Elite presence detected', body: 'Senior staff on this floor. Better rewards.' } as any);
    w.bus.emit('floorStart', { floor: plan.floor_number });
    logEvent(run, 1, plan.floor_number);
    // floors with no combat are clear immediately (shop, treasure, event)
    if (['shop', 'treasure', 'event'].includes(plan.floor_type) && w.totalLiveEnemies() === 0) { /* world clears on first update */ }
  }

  /** Exit interactables + reward previews (spec 3.3). */
  private setupExits(): void {
    const w = this.world;
    const previews: any[] = [];
    for (const ex of w.map.exits) {
      const opt = this.exits.find((o) => o.kind === ex.kind);
      const available = !!opt?.available && !!opt.dest;
      ex.available = available;
      const dest = opt?.dest;
      const label = ex.kind === 'stairs' ? 'STAIRS +1' : ex.kind === 'lift' ? 'LIFT +2' : 'CORRIDOR';
      let iconName = 'reward_cash', sub: string | undefined;
      if (dest) {
        iconName = rewardIcon(dest.reward);
        if (dest.floor_type === 'elite') sub = 'ELITE';
        if (dest.rewardDept) sub = (sub ? sub + ' · ' : '') + dest.rewardDept.toUpperCase();
        if (dest.floor_type === 'boss') { iconName = 'reward_boss'; sub = 'BOSS'; }
        if (dest.alarm) sub = (sub ? sub + ' · ' : '') + 'ALARM';
      }
      previews.push({ x: ex.x, y: ex.y, icon: iconName, label, sub, available });
      w.interactables.push({
        x: ex.x, y: ex.y, r: 22, priority: 2,
        label: available ? `${ex.kind === 'stairs' ? 'Take the stairs' : ex.kind === 'lift' ? 'Call the lift' : 'Use the corridor'}` : 'Out of order',
        sub: available ? rewardName(dest!.reward) + (dest!.floor_type === 'elite' ? ' (Elite)' : '') : undefined,
        enabled: () => w.floorCleared && available && this.state === 'play',
        onInteract: () => this.depart(ex.kind),
      });
    }
    (w as any).exitPreviews = previews;
  }

  // ------------------------------------------------------------------ events
  private onKill(v: Actor, info: DamageInfo): void {
    const run = this.run;
    const p = this.player;
    if (v === p) { this.onPlayerDeath(info); return; }
    if (!(v instanceof Enemy)) return;
    run.log.kills++;
    run.log.killsByMethod[info.method] = (run.log.killsByMethod[info.method] ?? 0) + 1;
    if (info.method === 'hazard') run.log.hazardKills++;
    if (info.method === 'body' || info.method === 'throw') run.log.throwsKills++;
    if (v.elite) {
      run.log.elitesKilled++;
      // elites drop a rare-tier weapon (spec 5.4) and sometimes a Desk Item (spec 7.2)
      const id = rollWeapon(this.floorRng.loot, this.plan.act, 1);
      w_add(this, new Pickup({ kind: 'weapon', weapon: makeWeapon(id, { durabilityMult: p.stats.durabilityMult, ammoMult: p.stats.ammoMult }), x: v.x + 6, y: v.y }));
      if (this.floorRng.loot.chance(0.35)) REWARD_GRANT.desk_item?.(this, { x: v.x, y: v.y + 8 });
    }
    p.addRage(6);
    if (p.stats.killHeal) p.heal(p.stats.killHeal, false);
    if (p.raging > 0 && p.stats.rageKillHeal) p.heal(p.stats.rageKillHeal, false);
    const prof = profile();
    prof.stats.killsByArchetype[v.archetype] = (prof.stats.killsByArchetype[v.archetype] ?? 0) + 1;
    this.world.bus.emit('kill', { victim: v, killer: (info.source as Actor) ?? null, method: info.method as any, hazardKind: info.hazardKind, weaponId: info.weaponId });
    logEvent(run, 2, v.maxHp | 0);
  }

  private onHurt(v: Actor, info: DamageInfo, amount: number, absorbed: number): void {
    if (v === this.player) this.player.onHurt(amount, absorbed, info);
    else if (info.source === this.player) { /* tracked in dealHit */ }
  }

  private onRoomCleared(id: number): void {
    const w = this.world;
    this.run.log.roomsCleared++;
    const r = w.map.rooms[id];
    if (r.kind !== 'core') this.lastClearedAt = { ...r.rewardPoint };
    if (!w.inCombat) audio.music.setCombat(false);
    if (r.isSide && r.kind !== 'core') {
      // optional loot side rooms (spec 4.4)
      dropCash(w, r.rewardPoint.x, r.rewardPoint.y, 10 + this.plan.floor_number * 2);
      if (this.floorRng.loot.chance(0.5)) w_add(this, new Pickup({ kind: 'weapon', weapon: makeWeapon(rollWeapon(this.floorRng.loot, this.plan.act, this.player.stats.luck), { durabilityMult: this.player.stats.durabilityMult }), x: r.rewardPoint.x + 10, y: r.rewardPoint.y }));
    }
  }

  private onFloorCleared(): void {
    const w = this.world;
    const plan = this.plan;
    audio.music.setCombat(false);
    audio.sfx('floor_clear');
    audio.sfx('exit_open');
    this.run.log.floorsCleared++;
    logEvent(this.run, 3, Math.round(this.floorTime));
    if (plan.floor_type !== 'shop' && plan.floor_type !== 'treasure' && plan.floor_type !== 'event') this.hud.showBanner('FLOOR CLEARED', this.exits.some((e) => e.available) ? 'Exits are open in the lift lobby.' : undefined, '#8af0a0');
    // the reward the player chose on the previous floor (spec 3.3, Hades model)
    const at = this.lastClearedAt ?? { x: this.player.x + 20, y: this.player.y };
    if (plan.floor_type === 'lift_ambush') {
      // bonus reward, then continue to the lift's destination
      dropCash(w, at.x, at.y, 30 + plan.floor_number * 3);
      (REWARD_GRANT.weapon ?? defaultGrant('weapon'))(this, { x: at.x + 14, y: at.y });
      setTimeout(() => { if (this.world === w && this.pendingDest) this.continueTo(this.pendingDest, 'lift'); }, 1600);
      return;
    }
    if (!['shop', 'treasure', 'event', 'boss', 'director'].includes(plan.floor_type)) {
      const grant = REWARD_GRANT[plan.reward] ?? defaultGrant(plan.reward);
      grant(this, at);
      if (plan.floor_type === 'elite') dropCash(w, at.x - 12, at.y, 25 + plan.floor_number * 2); // spec 8.4 elite bonus
    }
    // stair-landing style heal is applied on departure
  }

  private onExecution(type: string, victim: Actor): void {
    const run = this.run, p = this.player;
    run.log.executions++;
    run.log.execByType[type] = (run.log.execByType[type] ?? 0) + 1;
    if (type === 'defenestration') run.log.defenestrations++;
    p.addRage(20);
    if (p.raging > 0 && p.stats.executionRageExtend) p.raging += p.stats.executionRageExtend;
    if (p.stats.executionHeal) p.heal(p.stats.executionHeal);
    dropCash(this.world, victim.x, victim.y, 5);
    profile().seenExecutions = [...seenExecutions];
  }

  private onPlayerDeath(info: DamageInfo): void {
    if (this.state !== 'play') return;
    const w = this.world;
    // promotion credit: the killing blow, or the nearest enemy that damaged the player in the last 5 s (spec 5.6)
    let killer: Actor | null = info.source && info.source !== this.player ? info.source : null;
    if (!killer || !(killer instanceof Enemy)) {
      let best: Enemy | null = null, bd = 1e9;
      for (const a of w.actors) if (a instanceof Enemy && a.alive && w.time - a.dealtToPlayerAt < 5) { const d = dist(a, this.player); if (d < bd) { bd = d; best = a; } }
      killer = best;
    }
    this.killer = killer;
    this.killMethod = info.method;
    this.killWeapon = info.weaponId ?? (killer instanceof Enemy ? killer.weapon?.id ?? '' : info.hazardKind ?? '');
    this.state = 'dying';
    this.deathT = 0;
    this.run.log.deaths++;
    audio.music.duck(0.8, 3);
    audio.sfx('stinger_death');
    w.bus.emit('playerDeath', { killer, method: info.method as any, weaponId: this.killWeapon });
    if (killer instanceof Enemy) killer.bark('taunt');
  }

  // ------------------------------------------------------------------ departures (spec 3.3)
  depart(kind: ExitKind): void {
    if (this.state !== 'play') return;
    const opt = this.exits.find((e) => e.kind === kind);
    if (!opt?.dest) return;
    const run = this.run;
    this.persistPlayer();
    run.log.timePerFloor.push(Math.round(this.floorTime));
    // act transition bookkeeping
    const dest = opt.dest;
    if (dest.act !== this.plan.act) { run.corridorsThisAct = 0; run.themesUsed = []; }
    if (this.plan.wing === 0 && this.plan.floor_type !== 'boss') run.themesUsed.push(this.plan.department_theme);
    if (kind === 'corridor') { run.corridorsThisAct++; run.lastWasCorridor = true; run.log.corridorsTaken++; }
    else run.lastWasCorridor = false;
    logEvent(run, 10 + ['stairs', 'lift', 'corridor'].indexOf(kind), dest.floor_number);

    if (kind === 'stairs') {
      // small heal on the landing (spec 3.3); Hiring Freeze removes it (spec 7.4)
      if (!(run.modifiers.hiring_freeze >= 1)) {
        const heal = Math.round(this.player.maxHp * 0.12 * (run.deskItems.includes('parking_permit') ? 2 : 1));
        run.hp = Math.min(this.player.maxHp, run.hp + heal);
      }
      this.continueTo(dest, 'stairs');
    } else if (kind === 'lift') {
      let chance = this.plan.lift_ambush_chance * (run.deskItems.includes('visitor_pass') ? 0.5 : 1);
      if (run.deskItems.includes('visitor_pass')) run.pettyCash += 30;
      const ambush = this.floorRng.events.chance(chance);
      if (ambush) {
        run.log.liftAmbushes++;
        this.pendingDest = dest;
        const amb: FloorPlan = { ...dest, floor_number: this.plan.floor_number + 1, wing: 9, floor_type: 'lift_ambush', alarm: false, enemy_budget: dest.enemy_budget, reward: 'cash', department_theme: this.plan.department_theme };
        this.continueTo(amb, 'lift_ambush');
      } else this.continueTo(dest, 'lift');
    } else this.continueTo(dest, 'corridor');
  }

  /** Copy live player state into the run before leaving a floor. */
  persistPlayer(): void {
    const p = this.player;
    this.run.hp = Math.max(1, p.hp);
    this.run.shield = p.shield;
    this.run.rage = 0;
  }

  continueTo(dest: FloorPlan, how: 'stairs' | 'lift' | 'corridor' | 'lift_ambush' | 'boss'): void {
    this.state = 'done';
    if (how !== 'lift_ambush') this.pendingDest = how === 'lift' ? null : this.pendingDest;
    const from = this.plan.floor_number;
    this.persistPlayer();
    this.run.plan = dest;
    this.run.elapsed += this.floorTime;
    // spec 10.3: run suspend save between floors
    if (!this.run.practice || true) saveVersioned(SUSPEND_KEY, RUN_VERSION, this.run);
    app.push(new TransitionScene({ kind: how, from, to: dest.floor_number, act: dest.act, run: this.run, onDone: () => { this.startFloor(); } }));
  }

  /** Android backgrounding / pagehide: save the run as it was at the start of this floor (spec 10.3). */
  backgroundSave(): void {
    if (this.state === 'dying' || !this.floorStartJson) return;
    try { saveVersioned(SUSPEND_KEY, RUN_VERSION, JSON.parse(this.floorStartJson)); } catch { /* ignore */ }
  }

  /** Called by the final boss module after the CEO falls. */
  victory(): void {
    if (this.state === 'done') return;
    this.state = 'done';
    this.run.victory = true;
    this.persistPlayer();
    this.endRun(true);
  }

  endRun(won: boolean): void {
    removeSave(SUSPEND_KEY);
    for (const h of RUN_END_HOOKS) { try { h(this, won); } catch (e) { console.error(e); } }
    saveProfile();
    const next = () => {
      const hub = SCENES.hub?.() ?? SCENES.mainMenu?.();
      if (hub) app.reset(hub);
    };
    const showSummary = () => {
      const sum = SCENES.summary?.(this, won, next);
      if (sum) app.reset(sum); else next();
    };
    if (won && SCENES.ending) app.reset(SCENES.ending(this, showSummary));
    else showSummary();
  }

  pause(): void {
    if (this.state !== 'play' || this.world.cutscene) return;
    app.push(new PauseScene(this));
  }

  // ------------------------------------------------------------------ loop
  update(dt: number): void {
    if (app.input.pressed('pause')) { this.pause(); return; }
    const w = this.world;
    this.updateCtl();
    touch.update();
    touch.setContext({ mode: 'gameplay', grab: !!this.player.grabCandidate || !!this.player.grabbing, interact: this.player.interactTarget?.label ?? (this.player.execCandidate ? 'Execute' : null), rageReady: this.player.rage >= 100, rageActive: this.player.raging > 0, ranged: !!this.run.loadout.ranged || !!this.run.loadout.thrown } as any);
    updateNotifications(dt);
    this.hud.update(dt);
    if (this.state === 'dying') {
      this.deathT += dt;
      w.update(dt * 0.35);
      w.updateCamera(dt, { x: 0, y: 0 });
      app.renderer.zoom = Math.min(1.6, 1 + this.deathT * 0.2);
      if (this.deathT > 2.4) { this.state = 'done'; app.renderer.zoom = 1; this.endRun(false); }
      return;
    }
    if (this.state !== 'play') return;
    // hit-stop
    if (w.hitstop > 0) { w.hitstop -= dt; w.updateCamera(dt, { x: 0, y: 0 }); return; }
    const scale = this.run.assist ? app.settings.assist.gameSpeed : 1;
    const sdt = dt * scale;
    this.floorTime += sdt;
    w.update(sdt);
    updateReinforcements(this.spawn);
    // wet floors from mops/coolers
    const wz = (w as any).wetZones as { x: number; y: number; r: number; t: number }[] | undefined;
    if (wz) {
      for (const z of wz) { z.t -= sdt; for (const a of w.actors) if (a.alive && Math.hypot(a.x - z.x, a.y - z.y) < z.r) a.status.wet = Math.max(a.status.wet, 0.3); }
      (w as any).wetZones = wz.filter((z) => z.t > 0);
    }
    const lead = { x: Math.cos(this.player.aim) * 24, y: Math.sin(this.player.aim) * 14 };
    w.updateCamera(dt, lead);
    audio.setListener(this.player.x, this.player.y);
  }

  render(): void {
    const r = app.renderer;
    this.world.render();
    const g = r.f;
    this.hud.render(g, this.world, this.player, this.run);
    renderNotifications(g);
    touch.render(g);
    if (this.player.raging > 0) {
      // red vignette edges while raging
      const a = 0.18 + 0.08 * Math.sin(app.time * 10);
      g.fillStyle = `rgba(200,20,10,${a.toFixed(3)})`;
      g.fillRect(0, 0, r.W, 4); g.fillRect(0, r.H - 4, r.W, 4); g.fillRect(0, 0, 4, r.H); g.fillRect(r.W - 4, 0, 4, r.H);
    }
    // custom crosshair (KBM)
    if (app.input.device === 'kbm' && this.state === 'play') {
      const mx = Math.round(app.input.mouse.x), my = Math.round(app.input.mouse.y);
      g.fillStyle = '#000'; g.fillRect(mx - 4, my, 9, 1); g.fillRect(mx, my - 4, 1, 9);
      g.fillStyle = '#ffffff'; g.fillRect(mx - 3, my, 2, 1); g.fillRect(mx + 2, my, 2, 1); g.fillRect(mx, my - 3, 1, 2); g.fillRect(mx, my + 2, 1, 2);
    }
    if (this.state === 'dying') {
      const a = Math.min(0.7, this.deathT * 0.4);
      g.fillStyle = `rgba(60,0,0,${a.toFixed(3)})`; g.fillRect(0, 0, r.W, r.H);
      if (this.deathT > 0.8) drawText(g, 'YOUR EMPLOYMENT HAS BEEN TERMINATED', r.W / 2, r.H / 2 - 10, { align: 'center', color: '#ff6a5a', scale: 2, outline: '#000' });
    }
  }
}

function w_add(s: GameplayScene, e: Pickup): void { s.world.add(e); }

export function rewardIcon(k: RewardKind): string {
  return ({ benefit: 'reward_benefit', cash: 'reward_cash', weapon: 'reward_weapon', heal: 'reward_heal', rage_mod: 'reward_rage', desk_item: 'reward_desk_item', shop: 'reward_shop', event: 'reward_event', treasure: 'reward_treasure', challenge: 'reward_challenge', elite: 'reward_elite', director: 'reward_director', boss: 'reward_boss' } as Record<string, string>)[k] ?? 'reward_cash';
}
export function rewardName(k: RewardKind): string {
  return ({ benefit: 'Benefits Package', cash: 'Petty Cash', weapon: 'Equipment Requisition', heal: 'Wellbeing Package', rage_mod: 'Stress Modifier', desk_item: 'Desk Item', shop: 'Canteen', event: 'Something Odd', treasure: 'Stationery Cupboard', challenge: 'Challenge', elite: 'Elite', director: "Director's Office", boss: 'Boss' } as Record<string, string>)[k] ?? k;
}

/** Fallback reward grants (content module overrides via REWARD_GRANT). */
export function defaultGrant(k: RewardKind): (s: GameplayScene, at: Vec) => void {
  return (s, at) => {
    const w = s.world, p = s.player;
    switch (k) {
      case 'cash': dropCash(w, at.x, at.y, 35 + s.plan.floor_number * 4); break;
      case 'heal': w.add(new Pickup({ kind: 'heal', amount: Math.round(p.maxHp * 0.35), x: at.x, y: at.y })); break;
      case 'weapon': w.add(new Pickup({ kind: 'weapon', weapon: makeWeapon(rollWeapon(s.floorRng.loot, s.plan.act, p.stats.luck + 0.5), { durabilityMult: p.stats.durabilityMult, ammoMult: p.stats.ammoMult }), x: at.x, y: at.y })); break;
      default: dropCash(w, at.x, at.y, 40); break;
    }
  };
}

/** Quick-start a run (dev / tests). */
export function quickRun(role: 'office_worker' = 'office_worker', seed?: number): RunState {
  // lazy import to avoid cycles
  const { newRun } = require_run();
  return newRun({ seed: seed ?? dailySeed(), role });
}
import * as runMod from '../game/run';
function require_run() { return runMod; }
void streamsOf; void actDef; void ARCHETYPE_DEFS; void drawWrapped; void rect;
