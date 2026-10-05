// Act 3 boss (spec 6.4): Patricia Steel, Head of Compliance — floor 15, the records archive.
// P1 archive stacks: timed "policies" ban a verb (no dash / ranged / Rage / grab / melee) shown on the HUD
//    (hud.policy) — breaking the active policy costs damage + a stun (player.bannedVerbs + onPolicyBreach).
// P2 audit: shutter walls seal the arena into four compartments; she relocates between them with Lawyer and
//    Auditor adds — breach the shutters (throw adds through them, or batter them down) to reach her.
// P3 shredding floor: conveyor belts run into an industrial shredder, rapid policy rotation, shoves onto the belts.
// Finisher: shredder execution (gore toggle applies).
import { BOSS_FLOORS } from '../registry';
import type { GameplayScene } from '../../scenes/gameplay';
import type { FloorRequest, LightDef, BreachDef } from '../world-types';
import { TILE, T } from '../world-types';
import { Boss, Layer, ScriptOpts, ScriptCutscene, easeOut, clamp, lerp, angleTo, dist, fromAngle } from './boss';
import { buildArena, Grid, coreLobby, ArenaMap, mark, roomOfMark } from './arena';
import { MAT } from '../gen/materials';
import { complianceArt } from '../../art/bosses/compliance';
import { shredderSprite, shutterSprite } from '../../art/bosses/props';
import type { Ctx } from '../../render/canvas';
import { drawSprite } from '../../render/canvas';
import { redrawTiles } from '../../art/env';
import { audio } from '../../audio/audio';
import { app } from '../../core/app';
import { fxRng } from '../../core/rng';
import { bloodBurst, debrisBurst, goreLevel, sparks } from '../fx';
import type { PropRT } from '../world';
import { registerProp } from '../world';
import { Enemy } from '../enemy';
import type { Vec } from '../../core/math';
import type { PropKind } from '../../data/ids';
import { COMPLIANCE_POLICIES } from '../../data/text/bosses';
import { notify } from '../../ui/corpos';

type Verb = 'dash' | 'ranged' | 'rage' | 'grab' | 'melee';
const SHORT: Record<Verb, string> = { dash: 'NO DASHING', ranged: 'NO RANGED', rage: 'NO RAGE', grab: 'NO GRABBING', melee: 'NO MELEE' };

// lanes (tiles)
const LANE_X0 = 28, LANE_X1 = 31, LANE_Y0 = 3, SIDE_Y0 = 13, SIDE_Y1 = 14;
const CROSS_X = 30, CROSS_Y = 13;

function buildMap(req: FloorRequest): ArenaMap {
  const g = new Grid(50, 28, ' ');
  g.room(13, 0, 48, 27, '#', '.');
  coreLobby(g, 0, 8);
  g.fill(13, 13, 13, 15, 'D');
  g.set(24, 9, 'a'); g.set(23, 7, 'b');
  for (const [x, y] of [[21, 7], [38, 7], [21, 20], [38, 20]]) g.set(x, y, 'q');
  const lamp = (x: number, y: number): LightDef => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, radius: 120, color: '#dfe8ff', intensity: 0.9, flicker: 'none' });
  const stacks: { kind: string; tx: number; ty: number; fw: number; fh: number }[] = [];
  for (const x of [16, 39]) for (const y of [6, 10, 18, 22]) stacks.push({ kind: 'archive_stack', tx: x, ty: y, fw: 4, fh: 1 });
  return buildArena(req, {
    rows: g.rows(), roomMarks: ['a'],
    rooms: [
      { kind: 'core' },
      { kind: 'archive', material: MAT.CARPET, darkness: 0.38, lights: [lamp(20, 5), lamp(40, 5), lamp(20, 21), lamp(40, 21), lamp(30, 8), lamp(30, 19)] },
    ],
    props: [
      { kind: 'boss_shredder', tx: 27, ty: 1, fw: 6, fh: 2, cw: 92, ch: 26, solid: true },
      ...stacks,
      { kind: 'filing_cabinet', tx: 15, ty: 2 }, { kind: 'filing_cabinet', tx: 46, ty: 2 }, { kind: 'filing_cabinet', tx: 15, ty: 25 }, { kind: 'filing_cabinet', tx: 46, ty: 25 },
    ],
  });
}

registerProp('boss_shutter' as PropKind, { maxHp: 70 });

interface Seg { name: string; tiles: [number, number][]; vertical: boolean; def: BreachDef | null; prop: PropRT | null; open: boolean }

class HeadOfCompliance extends Boss {
  map: ArenaMap;
  shredder: PropRT | null = null;
  segs: Seg[] = [];
  shutters = false;
  belts = 0; // reveal 0..1
  running = false;
  policyT = 4;
  policyOn = false;
  policyVerb: Verb | null = null;
  lastVerb: Verb | null = null;
  breachCd = 0;
  arriveT = 0;
  dmgSince = 0;
  auditCd = 3;
  actions = 0;
  shredFrame = 0;

  constructor(s: GameplayScene, map: ArenaMap) {
    const b = mark(map, 'b');
    super(s, { id: 'head_of_compliance', act: 3, maxHp: 1700, art: complianceArt(), radius: 9, height: 64, speed: 48, phases: 3, arenaRoom: roomOfMark(map, 'a'), accent: '#a8d4ff' }, b.x, b.y);
    this.map = map;
    this.phaseNames = ['The Archive', 'Audit', 'Shredding Floor'];
    this.phaseExecCaptions = ['NON-COMPLIANT', 'AUDIT FAILED'];
    this.voiceSeed = 0xc0a1;
  }

  override onAdded(): void {
    super.onAdded();
    for (const p of this.w.props) if ((p.def.kind as string) === 'boss_shredder') { this.shredder = p; this.setShredSprite(); }
    this.w.add(new Layer(0, (g) => this.drawBelts(g), (dt) => this.tick(dt)));
    for (let i = 0; i < 4; i++) this.w.add(new Layer(1, (g) => this.drawShutters(g, i), undefined, () => this.segSortY(i)));
    // segments of the audit cross
    const room = this.map.rooms[this.cfg.arenaRoom];
    const N: [number, number][] = [], S: [number, number][] = [], W: [number, number][] = [], E: [number, number][] = [];
    for (let y = LANE_Y0; y < CROSS_Y; y++) N.push([CROSS_X, y]);
    for (let y = CROSS_Y + 1; y < room.ty + room.th; y++) S.push([CROSS_X, y]);
    for (let x = room.tx; x < CROSS_X; x++) W.push([x, CROSS_Y]);
    for (let x = CROSS_X; x < room.tx + room.tw; x++) E.push([x, CROSS_Y]);
    this.segs = [{ name: 'N', tiles: N, vertical: true, def: null, prop: null, open: true }, { name: 'S', tiles: S, vertical: true, def: null, prop: null, open: true }, { name: 'W', tiles: W, vertical: false, def: null, prop: null, open: true }, { name: 'E', tiles: E, vertical: false, def: null, prop: null, open: true }];
    const p = this.player;
    p.onPolicyBreach = (v) => this.onBreach(v as Verb);
  }
  setShredSprite(): void {
    const p = this.shredder; if (!p) return;
    const sp = shredderSprite(Math.floor(this.shredFrame) % 2, this.running, !!p.data.gore);
    for (const st of ['intact', 'damaged', 'destroyed', 'active', 'used'] as const) p.spriteCache.set(st, sp);
  }
  segSortY(i: number): number { const s = this.segs[i]; if (!s) return 0; const ys = s.tiles.map((t) => t[1]); return (s.vertical ? Math.min(...ys) + 1 : Math.max(...ys) + 1) * TILE; }

  // ----------------------------------------------------------------------------------------- policies
  postPolicy(): void {
    const p = this.player;
    let pool = COMPLIANCE_POLICIES.filter((q) => q.verb !== this.lastVerb);
    if (!p.run.loadout.ranged && !p.run.loadout.thrown) pool = pool.filter((q) => q.verb !== 'ranged');
    const pol = this.rng.pick(pool);
    this.policyVerb = pol.verb; this.lastVerb = pol.verb; this.policyOn = true;
    p.bannedVerbs.clear(); p.bannedVerbs.add(pol.verb);
    this.policyT = this.phase === 3 ? 4.2 : this.phase === 2 ? 8 : 7;
    this.s.hud.policy = { title: SHORT[pol.verb], body: 'Breach = damage + stun', t: this.policyT };
    notify({ kind: 'boss', title: 'ALL-STAFF: ' + pol.title.split(' — ')[0], body: pol.body, duration: Math.min(5, this.policyT), tag: 'compliance' });
    audio.sfx('policy_stamp', { x: this.x, y: this.y });
    if (this.busy <= 0 && this.mode === 'fight') { this.setAnim('post', true); this.busy = 0.7; }
  }
  liftPolicy(): void {
    this.policyOn = false; this.policyVerb = null;
    this.player.bannedVerbs.clear();
    this.s.hud.policy = null;
    this.policyT = this.phase === 3 ? 0.9 : 2.2; // grace period between policies
  }
  onBreach(v: Verb): void {
    if (this.breachCd > 0 || this.mode !== 'fight') return;
    this.breachCd = 1.0;
    const p = this.player;
    this.w.damage(p, { amount: 8, type: 'blunt', method: 'other', source: this, knockback: 0 });
    p.status.stun = Math.max(p.status.stun, 0.6);
    this.w.floatText(p.x, p.y - 42, 'INFRACTION LOGGED', '#ff6a5a', 1, 1.4);
    audio.sfx('policy_stamp', { x: p.x, y: p.y });
    for (let i = 0; i < 6; i++) this.w.particles.spawn({ kind: 'paper', x: p.x, y: p.y - 30, vx: fxRng.range(-60, 60), vy: fxRng.range(-80, -20), life: 0.8, col: '#f2efe6', size: 3, drag: 2 });
    if (this.rng.chance(0.6)) this.say(this.rng.pick([`That's a breach of ${SHORT[v].toLowerCase().replace('no ', 'the ')} policy.`, 'Your violation is noted.', 'This is being recorded.']), 0);
  }

  // ----------------------------------------------------------------------------------------- per-frame
  tick(dt: number): void {
    if (this.mode === 'dormant') return;
    const w = this.w;
    this.breachCd = Math.max(0, this.breachCd - dt);
    if (this.mode === 'fight') {
      this.policyT -= dt;
      if (this.policyT <= 0) { if (this.policyOn) this.liftPolicy(); else this.postPolicy(); }
      if (this.s.hud.policy) this.s.hud.policy.t = this.policyT;
    }
    // shutters destroyed by battering → breach the segment
    for (const sg of this.segs) {
      if (sg.prop && sg.prop.state === 'destroyed' && sg.def && !sg.open) {
        const mid = sg.tiles[Math.floor(sg.tiles.length / 2)];
        w.breach(sg.def, { x: (mid[0] + 0.5) * TILE, y: (mid[1] + 0.5) * TILE }, angleTo(sg.prop.def, this.player));
        w.floatText((mid[0] + 0.5) * TILE, mid[1] * TILE - 8, 'SHUTTER BREACHED', '#ffd34d', 1, 1.5);
      }
      if (sg.def && !sg.open && w.map.tiles[sg.tiles[0][1] * w.map.w + sg.tiles[0][0]] !== T.PARTITION) {
        sg.open = true; sg.def = null;
        if (sg.prop) { sg.prop.gone = true; sg.prop = null; }
        this.player.addRage(10);
      }
    }
    // belts + shredder
    if (this.running) {
      this.shredFrame += dt * 12; this.setShredSprite();
      if (fxRng.chance(dt * 10)) w.particles.spawn({ kind: 'paper', x: (LANE_X0 + 2) * TILE + fxRng.range(-30, 30), y: 66, vx: fxRng.range(-40, 40), vy: fxRng.range(-30, 10), life: 0.7, col: '#f2efe6', size: 2, drag: 1 });
    }
    if (this.belts >= 1) {
      for (const a of w.actors) {
        if (!a.alive || a.grabbedBy || a === this || a.thrown) continue;
        const v = this.beltVel(a);
        if (!v) continue;
        const k = a.team === 'player' ? 44 : 52;
        w.moveActor(a, v.x * k * dt, v.y * k * dt);
        // the intake
        if (a.y < (LANE_Y0 + 1.1) * TILE && a.x > LANE_X0 * TILE && a.x < (LANE_X1 + 1) * TILE) this.intake(a);
      }
    }
  }
  beltVel(a: Vec): Vec | null {
    const tx = Math.floor(a.x / TILE), ty = Math.floor(a.y / TILE);
    if (tx >= LANE_X0 && tx <= LANE_X1 && ty >= LANE_Y0) return { x: 0, y: -1 };
    if (ty >= SIDE_Y0 && ty <= SIDE_Y1) { if (tx < LANE_X0) return { x: 1, y: 0 }; if (tx > LANE_X1) return { x: -1, y: 0 }; }
    return null;
  }
  intake(a: any): void {
    const w = this.w;
    if (a === this.player) {
      if (a.invuln > 0) { a.y += 2; return; }
      w.damage(a, { amount: 16, type: 'cut', method: 'hazard', source: this, hazardKind: 'shredder', knockback: 0 });
      a.y = (LANE_Y0 + 3) * TILE; a.ky = 320; a.status.stun = 0.4; a.invuln = Math.max(a.invuln, 1.0);
      w.floatText(a.x, a.y - 40, 'SPAT OUT', '#ffffff', 1, 1.2);
      audio.sfx('shredder', { x: a.x, y: a.y });
      sparks(w.particles, a.x, a.y - 30, 12, '#ffe9a0');
    } else if (a instanceof Enemy) {
      w.floatText(a.x, a.y - 30, 'SHREDDED', '#f2efe6');
      audio.sfx('shredder', { x: a.x, y: a.y });
      if (goreLevel() > 0) bloodBurst(w.particles, a.x, a.y - 10, -Math.PI / 2, 16, this.cfg.arenaRoom, 20);
      for (let i = 0; i < 16; i++) w.particles.spawn({ kind: 'paper', x: a.x, y: a.y - 20, vx: fxRng.range(-90, 90), vy: fxRng.range(-120, 20), life: 1.2, col: fxRng.chance(0.3) && goreLevel() === 2 ? '#c0262a' : '#f2efe6', size: 2, drag: 2 });
      a.executed = true; a.ignoreForClear = true;
      w.damage(a, { amount: 99999, type: 'cut', method: 'hazard', source: this.player, hazardKind: 'shredder', unavoidable: true, silent: true });
      a.dead = true;
    }
  }

  // ----------------------------------------------------------------------------------------- shutters
  quad(p: Vec): number { return (p.x < (CROSS_X + 0.5) * TILE ? 0 : 1) + (p.y < (CROSS_Y + 0.5) * TILE ? 0 : 2); }
  reachable(): boolean {
    const w = this.w; const i = Math.floor(this.y / TILE) * w.map.w + Math.floor(this.x / TILE);
    return w.flow[i] >= 0;
  }
  dropSegment(sg: Seg): void {
    const w = this.w, m = w.map;
    for (const [x, y] of sg.tiles) m.tiles[y * m.w + x] = T.PARTITION;
    // nudge anyone standing in the line
    for (const a of w.actors) {
      const tx = Math.floor(a.x / TILE), ty = Math.floor(a.y / TILE);
      if (sg.tiles.some(([x, y]) => x === tx && y === ty)) { if (sg.vertical) a.x += a.x % TILE < 8 ? -10 : 10; else a.y += a.y % TILE < 8 ? -10 : 12; }
    }
    const xs = sg.tiles.map((t) => t[0]), ys = sg.tiles.map((t) => t[1]);
    redrawTiles(m, w.bg, Math.min(...xs) - 1, Math.min(...ys) - 2, Math.max(...xs) + 1, Math.max(...ys) + 2);
    sg.def = { id: 700 + this.segs.indexOf(sg), roomA: this.cfg.arenaRoom, roomB: this.cfg.arenaRoom, tiles: sg.tiles.map((t) => [t[0], t[1]] as [number, number]), material: 'plaster' };
    m.breaches.push(sg.def);
    const mid = sg.tiles[Math.floor(sg.tiles.length / 2)];
    const len = sg.tiles.length * TILE;
    sg.prop = w.addProp({ id: 800 + this.segs.indexOf(sg), kind: 'boss_shutter' as PropKind, x: (mid[0] + 0.5) * TILE, y: (mid[1] + 1) * TILE, w: sg.vertical ? 16 : len, h: sg.vertical ? len : 16, solid: false, variant: 0, roomId: this.cfg.arenaRoom, facing: 0 });
    sg.prop.spriteCache.set('intact', { img: document.createElement('canvas'), sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 });
    for (const st of ['damaged', 'destroyed', 'active', 'used'] as const) sg.prop.spriteCache.set(st, sg.prop.spriteCache.get('intact')!);
    sg.open = false;
    w.rebuildPropBlock();
    audio.sfx('shutter_slam', { x: (mid[0] + 0.5) * TILE, y: mid[1] * TILE });
    app.renderer.shake(5, 0.3);
    for (const [x, y] of sg.tiles) if (fxRng.chance(0.4)) this.w.particles.spawn({ kind: 'smoke', x: (x + 0.5) * TILE, y: (y + 1) * TILE, life: 0.5, col: '#b8b0a0', size: 4 });
  }
  raiseAll(): void {
    const w = this.w, m = w.map;
    for (const sg of this.segs) {
      for (const [x, y] of sg.tiles) { const i = y * m.w + x; if (m.tiles[i] === T.PARTITION || m.tiles[i] === T.RUBBLE) m.tiles[i] = T.FLOOR; }
      if (sg.def) m.breaches = m.breaches.filter((b) => b !== sg.def);
      if (sg.prop) sg.prop.gone = true;
      sg.def = null; sg.prop = null; sg.open = true;
    }
    redrawTiles(m, w.bg, 0, 0, m.w - 1, m.h - 1);
    w.rebuildPropBlock();
  }

  relocate(): void {
    const pq = this.quad(this.player);
    const cands = [0, 1, 2, 3].filter((q) => q !== pq && q !== this.quad(this));
    const qs = this.map.marks.q ?? [];
    if (!cands.length || !qs.length) return;
    const q = this.rng.pick(cands);
    const target = qs[q];
    sparks(this.w.particles, this.x, this.y - 30, 6, '#a8d4ff');
    for (let i = 0; i < 18; i++) this.w.particles.spawn({ kind: 'paper', x: this.x, y: this.y - 24, vx: fxRng.range(-100, 100), vy: fxRng.range(-120, 20), life: 1, col: '#f2efe6', size: 3, drag: 2 });
    audio.sfx('teleport', { x: this.x, y: this.y });
    this.x = target.x; this.y = target.y;
    for (let i = 0; i < 18; i++) this.w.particles.spawn({ kind: 'paper', x: this.x, y: this.y - 24, vx: fxRng.range(-100, 100), vy: fxRng.range(-120, 20), life: 1, col: '#f2efe6', size: 3, drag: 2 });
    this.setAnim('file', true);
    this.arriveT = 0; this.dmgSince = 0;
    this.say(this.rng.pick(['I move between cells.', 'The audit separates us.', 'The compartments are policy-defined.']), 1);
    this.spawnAuditTeam();
  }
  spawnAuditTeam(): void {
    const p = this.player;
    const pts: Vec[] = [];
    for (let i = 0; i < 30 && pts.length < 2; i++) {
      const a = fxRng.range(0, Math.PI * 2), r = fxRng.range(60, 110);
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (this.w.isWalkablePx(q.x, q.y) && this.quad(q) === this.quad(p) && this.w.roomAt(q.x, q.y) === this.cfg.arenaRoom) pts.push(q);
    }
    if (pts[0]) this.spawnAdd('lawyer', pts[0], 1);
    if (pts[1] && this.liveAdds() < 3) this.spawnAdd(this.rng.chance(0.5) ? 'auditor' : 'lawyer', pts[1], 0);
  }

  // ----------------------------------------------------------------------------------------- AI
  override onBossHurt(_i: unknown, amount: number): void { this.dmgSince += amount; }

  think(dt: number): void {
    const p = this.player;
    if (this.status.stun <= 0) this.stunAnim = 'stagger';
    if (this.busy > 0) { this.vx = this.vy = 0; return; }
    const d = this.distToPlayer();
    if (this.phase === 2) {
      this.arriveT += dt;
      const sealed = this.segs.some((s) => !s.open);
      if (sealed && !this.reachable()) {
        // across the shutters: audit notices land on you (telegraphed), adds do the legwork
        this.vx = this.vy = 0; this.facePlayer(); this.setAnim('idle');
        this.auditCd -= dt;
        if (this.auditCd <= 0) { this.auditCd = 3.2; this.auditNotice(); }
        if (this.liveAdds() === 0 && this.arriveT > 6) { this.arriveT = 0; this.spawnAuditTeam(); }
        return;
      }
      if (sealed && (this.arriveT > 10 || this.dmgSince > this.maxHp * 0.12)) {
        const others = [0, 1, 2, 3].filter((q) => q !== this.quad(p));
        if (others.length && this.segs.filter((s) => !s.open).length >= 2) { this.relocate(); this.busy = 0.6; return; }
      }
    }
    if (this.attackCd <= 0) {
      this.actions++;
      if (this.phase === 3 && d < 70 && this.actions % 2 === 0) { this.shove(); return; }
      if (d < 46) { this.binderSlam(); return; }
      if (this.actions % 3 === 0) { this.stamp(); return; }
      if (d > 80) { this.tape(); return; }
      this.stamp(); return;
    }
    if (this.phase === 3) {
      // get the player between her and the nearest belt
      const lane = { x: (LANE_X0 + 2) * TILE, y: clamp(p.y, (LANE_Y0 + 1) * TILE, 25 * TILE) };
      const side = { x: p.x, y: (SIDE_Y0 + 1) * TILE };
      const belt = dist(p, lane) < dist(p, side) ? lane : side;
      const away = angleTo(belt, p);
      const t = { x: p.x + Math.cos(away) * 34, y: p.y + Math.sin(away) * 30 };
      if (dist(this, t) > 10) { this.moveTo(t, this.speed * 1.2, dt); this.setAnim('walk'); this.facePlayer(); return; }
    }
    if (d > 60) { this.chase(dt); this.setAnim('walk'); } else { this.vx = this.vy = 0; this.facePlayer(); this.setAnim('idle'); }
  }
  cd(b: number): number { return b * (this.phase === 3 ? 0.8 : 1); }

  binderSlam(): void {
    const a = angleTo(this, this.player);
    this.face(a); this.setAnim('slam_w', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.35; this.attackCd = this.cd(1.2);
    this.tele({ kind: 'arc', x: this.x, y: this.y - 8, r: 50, angle: a, half: 1.0 }, 0.6, (sh) => {
      this.setAnim('slam', true); audio.sfx('enemy_swing', { x: this.x, y: this.y });
      this.hitShape(sh, 15, { kb: 230 });
    });
  }
  stamp(): void {
    const p = this.player;
    const t = { x: p.x, y: p.y };
    this.face(angleTo(this, t)); this.setAnim('stamp_w', true);
    const wd = this.windup(0.8);
    this.busy = wd + 0.4; this.attackCd = this.cd(1.4);
    const from = { x: this.x, y: this.y };
    this.tele({ kind: 'circle', x: t.x, y: t.y, r: 32 }, 0.8, (sh) => {
      if (dist(from, t) > 40) { const k = Math.max(0, dist(from, t) - 22) / dist(from, t); this.w.moveActor(this, (t.x - from.x) * k, (t.y - from.y) * k); }
      this.setAnim('stamp', true);
      audio.sfx('policy_stamp', { x: t.x, y: t.y }); app.renderer.shake(5, 0.2);
      this.hitShape(sh, 16, { kb: 240 });
      this.w.decals.splat(this.cfg.arenaRoom, t.x, t.y, 5, '#a3161b', 'splat');
      this.w.floatText(t.x, t.y - 10, 'VOID', '#c02a2a', 2, 0.9);
    }, { heavy: true });
  }
  tape(): void {
    const base = angleTo(this, this.player);
    this.face(base); this.setAnim('slam_w', true);
    const wd = this.windup(0.6);
    this.busy = wd + 0.3; this.attackCd = this.cd(1.3);
    for (const off of [-0.25, 0, 0.25]) {
      const a = base + off;
      this.tele({ kind: 'line', x: this.x, y: this.y - 6, angle: a, len: 210, width: 8 }, 0.6, () => {
        this.setAnim('slam', true);
        this.shoot({ angle: a, speed: 200, kind: 'tape', dmg: 8, life: 1.3, radius: 4, slow: { amt: 0.45, time: 2 } });
      }, { follow: (sh: any) => { sh.x = this.x; sh.y = this.y - 6; } });
    }
  }
  shove(): void {
    const a = angleTo(this, this.player);
    this.face(a); this.setAnim('shove', true);
    const wd = this.windup(0.55);
    this.busy = wd + 0.35; this.attackCd = this.cd(1.1);
    this.tele({ kind: 'arc', x: this.x, y: this.y - 8, r: 50, angle: a, half: 0.8 }, 0.55, (sh) => {
      audio.sfx('kick', { x: this.x, y: this.y });
      this.hitShape(sh, 8, { kb: 420 });
    });
  }
  auditNotice(): void {
    const p = this.player;
    this.setAnim('post', true);
    this.tele({ kind: 'circle', x: p.x, y: p.y, r: 26 }, 0.95, (sh) => {
      audio.sfx('policy_stamp', { x: sh.x, y: sh.y });
      this.hitShape(sh, 12, { kb: 160, method: 'ranged' });
      for (let i = 0; i < 8; i++) this.w.particles.spawn({ kind: 'paper', x: sh.x, y: sh.y - 10, vx: fxRng.range(-60, 60), vy: fxRng.range(-80, 0), life: 0.8, col: '#f2efe6', size: 3, drag: 2 });
    }, { keep: true });
  }

  // ----------------------------------------------------------------------------------------- phases
  override onWindowStart(): void { this.liftPolicy(); }
  override onFinalStart(): void { this.liftPolicy(); this.policyT = 999; }

  transitionScript(phase: number): ScriptOpts {
    const w = this.w;
    this.liftPolicy();
    if (phase === 2) {
      const dropped = [false, false, false, false];
      let moved = false;
      return {
        dur: 2.9,
        camera: (t) => t < 2.0 ? { x: (CROSS_X + 0.5) * TILE, y: (CROSS_Y + 0.5) * TILE } : { x: this.x, y: this.y - 20 },
        zoom: () => 1.0,
        update: (t, dt) => {
          this.animT += dt;
          if (t < 0.1) { audio.sfx('alarm'); this.setAnim('post', true); }
          this.segs.forEach((sg, i) => { if (!dropped[i] && t > 0.35 + i * 0.35) { dropped[i] = true; this.dropSegment(sg); } });
          if (!moved && t > 2.0) { moved = true; this.shutters = true; this.relocate(); }
        },
        caption: 'AUDIT', sub: 'Shutters seal the archive. Throw her people through them — or batter them down.', captionAt: 0.5, captionCol: '#a8d4ff',
        onEnd: () => { this.arriveT = 0; this.policyT = 3; },
      };
    }
    let raised = false, roar = false;
    const from = { x: this.x, y: this.y };
    const to = { x: 22 * TILE, y: 20 * TILE };
    return {
      dur: 3.0,
      camera: (t) => t < 1.6 ? { x: (LANE_X0 + 2) * TILE, y: 6 * TILE } : { x: (LANE_X0 + 2) * TILE, y: 13 * TILE },
      zoom: (t) => t < 1.6 ? 1.3 : 1.05,
      update: (t, dt) => {
        this.animT += dt;
        if (!raised && t > 0.3) { raised = true; this.raiseAll(); audio.sfx('shutter_slam', { vol: 0.6 }); this.x = to.x; this.y = to.y; void from; }
        if (!roar && t > 0.6) { roar = true; this.running = true; audio.sfx('shredder'); audio.sfx('conveyor'); app.renderer.shake(4, 0.6); }
        this.belts = clamp((t - 0.8) / 1.0, 0, 1);
        if (this.running) { this.shredFrame += dt * 12; this.setShredSprite(); }
      },
      caption: 'SHREDDING FLOOR', sub: 'The belts run into the shredder. Keep off them. Policies rotate fast.', captionAt: 1.0, captionCol: '#ff8a7a',
      onEnd: () => { this.belts = 1; this.policyT = 1.5; w.forcedDarkness = -1; },
    };
  }

  // ----------------------------------------------------------------------------------------- finisher
  finisher(): void {
    const w = this.w, p = this.player, s = this.s;
    const mouth = { x: (LANE_X0 + 2) * TILE, y: (LANE_Y0 + 1.6) * TILE };
    const from = { x: this.x, y: this.y };
    const pf = { x: p.x, y: p.y };
    let caught = false, gone = false;
    p.invuln = 99;
    this.running = true;
    s.hud.bossBar = null;
    w.cutscene = new ScriptCutscene({
      dur: 3.1,
      caption: 'DOCUMENTATION ENDS', sub: goreLevel() === 0 ? 'Filed under: confidential waste.' : 'This conversation was recorded.', captionAt: 1.9, captionCol: '#ff8a7a',
      camera: () => ({ x: mouth.x, y: mouth.y + 10 }),
      zoom: (t) => 1.3 + 0.4 * easeOut(t / 1.5),
      update: (t, dt) => {
        p.animT += dt; this.animT += dt;
        this.shredFrame += dt * (gone ? 30 : 14); this.setShredSprite();
        if (t < 0.5) {
          const k = easeOut(t / 0.5);
          this.x = lerp(from.x, mouth.x, k); this.y = lerp(from.y, mouth.y + 14, k);
          p.x = lerp(pf.x, mouth.x, k); p.y = lerp(pf.y, mouth.y + 34, k);
          this.face(-Math.PI / 2); p.face(-Math.PI / 2); this.setAnim('grabbed'); p.setAnim('exec_hold');
        }
        if (!caught && t > 0.6) { caught = true; this.setAnim('shred', true); p.setAnim('exec_slam', true); audio.sfx('shredder', { x: mouth.x, y: mouth.y }); this.w.floatText(mouth.x, mouth.y - 50, 'THE BOW CATCHES', '#f2efe6', 1, 1); }
        if (caught && !gone) {
          this.y -= dt * 14; this.x = mouth.x + Math.sin(t * 40) * 1.5;
          app.renderer.shake(3, 0.1);
          if (fxRng.chance(0.7)) w.particles.spawn({ kind: 'paper', x: mouth.x + fxRng.range(-30, 30), y: mouth.y + 12, vx: fxRng.range(-90, 90), vy: fxRng.range(-40, 80), life: 1.2, col: '#f2efe6', size: 2, drag: 1 });
        }
        if (!gone && t > 1.7) {
          gone = true;
          this.y = -999;
          audio.sfx('dismember', { x: mouth.x, y: mouth.y }); audio.sfx('shredder', { x: mouth.x, y: mouth.y });
          app.renderer.shake(10, 0.8); w.hitstop = 0.12;
          const gl = goreLevel();
          if (gl > 0 && this.shredder) this.shredder.data.gore = true;
          if (gl > 0) bloodBurst(w.particles, mouth.x, mouth.y + 10, Math.PI / 2, gl === 2 ? 50 : 18, this.cfg.arenaRoom, 20);
          for (let i = 0; i < 60; i++) w.particles.spawn({ kind: 'paper', x: mouth.x + fxRng.range(-30, 30), y: mouth.y + 10, z: 10, vx: fxRng.range(-160, 160), vy: fxRng.range(-60, 160), vz: fxRng.range(40, 140), gravity: 200, life: 2, col: gl === 2 && i % 3 === 0 ? '#a3161b' : gl === 1 && i % 4 === 0 ? '#c02a2a' : i % 5 === 0 ? '#2b3a5e' : '#f2efe6', size: 2, toDecal: true, roomId: this.cfg.arenaRoom });
          debrisBurst(w.particles, mouth.x, mouth.y + 10, 8, ['#c8b070', '#2b3a5e'], this.cfg.arenaRoom);
        }
      },
      onEnd: () => {
        p.invuln = 0.8;
        s.run.log.executions++; s.run.log.execByType.shredder = (s.run.log.execByType.shredder ?? 0) + 1;
        w.bus.emit('execution', { type: 'shredder', victim: this });
        this.belts = 0; this.running = false; this.setShredSprite();
        this.timers.after(0, () => this.defeat({ removed: true, at: { x: mouth.x, y: mouth.y + 80 } }));
      },
    });
  }

  // ----------------------------------------------------------------------------------------- render
  drawBelts(g: Ctx): void {
    if (this.belts <= 0) return;
    const t = this.w.time;
    const k = this.belts;
    const room = this.map.rooms[this.cfg.arenaRoom];
    const lane = (x0: number, y0: number, w: number, h: number, dir: Vec) => {
      // panels slide open, revealing the belt
      const ww = dir.x === 0 ? w : Math.round(w * k), hh = dir.y === 0 ? h : Math.round(h * k);
      const xx = dir.x > 0 ? x0 : x0 + w - ww, yy = dir.y < 0 ? y0 : y0;
      g.fillStyle = '#1a1b22'; g.fillRect(xx, yy, ww, hh);
      g.fillStyle = '#2a2c36';
      const off = ((t * 44) % 12);
      if (dir.y !== 0) for (let y = yy + 12 - off; y < yy + hh; y += 12) { g.fillRect(xx + 2, Math.round(y), ww - 4, 2); g.fillStyle = '#5a5e6a'; g.fillRect(xx + ww / 2 - 6, Math.round(y) - 3, 12, 1); g.fillStyle = '#2a2c36'; }
      else for (let x = xx + (dir.x > 0 ? off : 12 - off); x < xx + ww; x += 12) { g.fillRect(Math.round(x), yy + 2, 2, hh - 4); }
      // chevrons pointing with the flow
      g.fillStyle = '#c8a030';
      if (dir.y !== 0) for (let y = yy + ((t * 44) % 32); y < yy + hh; y += 32) { const cx = xx + ww / 2; for (let q = 0; q < 6; q++) { g.fillRect(Math.round(cx - q), Math.round(y + q), 1, 1); g.fillRect(Math.round(cx + q), Math.round(y + q), 1, 1); } }
      else for (let x = xx + ((t * 44) % 32); x < xx + ww; x += 32) { const cy = yy + hh / 2; for (let q = 0; q < 6; q++) { const sx = dir.x > 0 ? Math.round(x - q) : Math.round(x + q); g.fillRect(sx, Math.round(cy - q), 1, 1); g.fillRect(sx, Math.round(cy + q), 1, 1); } }
      g.fillStyle = '#7e8894'; if (dir.y !== 0) { g.fillRect(xx, yy, 2, hh); g.fillRect(xx + ww - 2, yy, 2, hh); } else { g.fillRect(xx, yy, ww, 2); g.fillRect(xx, yy + hh - 2, ww, 2); }
    };
    lane(LANE_X0 * TILE, LANE_Y0 * TILE, (LANE_X1 - LANE_X0 + 1) * TILE, (room.ty + room.th - LANE_Y0) * TILE, { x: 0, y: -1 });
    lane(room.tx * TILE, SIDE_Y0 * TILE, (LANE_X0 - room.tx) * TILE, (SIDE_Y1 - SIDE_Y0 + 1) * TILE, { x: 1, y: 0 });
    lane((LANE_X1 + 1) * TILE, SIDE_Y0 * TILE, (room.tx + room.tw - LANE_X1 - 1) * TILE, (SIDE_Y1 - SIDE_Y0 + 1) * TILE, { x: -1, y: 0 });
    // danger stripe at the intake
    for (let x = LANE_X0 * TILE; x < (LANE_X1 + 1) * TILE; x += 4) { g.fillStyle = ((x / 4) | 0) % 2 ? '#1c1c22' : '#e8c030'; g.fillRect(x, (LANE_Y0 + 1) * TILE, 4, 3); }
  }
  drawShutters(g: Ctx, i: number): void {
    const sg = this.segs[i];
    if (!sg || sg.open) return;
    const m = this.w.map;
    const dmg = !!sg.prop && sg.prop.hp < sg.prop.maxHp * 0.5;
    for (const [x, y] of sg.tiles) if (m.tiles[y * m.w + x] === T.PARTITION) drawSprite(g, shutterSprite(sg.vertical, dmg), (x + 0.5) * TILE, (y + 1) * TILE);
  }
  override renderOver(g: Ctx): void {
    // Act 3: a recording light — "this conversation is being recorded"
    if (this.mode === 'fight' && Math.floor(this.w.time * 2) % 2 === 0) { g.fillStyle = '#ff3a24'; g.fillRect(Math.round(this.x + 8), Math.round(this.y - this.height - 2), 2, 2); }
  }
}

BOSS_FLOORS[3] = {
  music: 'boss3',
  buildMap,
  setup(s: GameplayScene) {
    const map = s.world.map as ArenaMap;
    const boss = new HeadOfCompliance(s, map);
    s.world.add(boss);
    s.world.holdClear = true;
    s.data.boss = boss;
  },
};

void fromAngle;
