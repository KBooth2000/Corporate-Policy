// Bespoke environmental-execution mini-cutscenes (spec 4.7). One script per ExecType, registered via registerExecution().
//
// Rules honoured here: 1-1.5 s mini cutscene (world.cutscene pauses every other enemy/timer), the player is invulnerable
// (startExecution), cutscene setting Always / First time only / Off (Off = `full` false: a brief ~0.5 s in-world version without
// camera work or letterbox), single-use objects + bonus Rage + stats are handled by startExecution / the gameplay scene.
// Presentation: camera zoom + letterbox, impact frames (white flash + hit-stop), screen shake (renderer.shake respects the
// screen-shake setting), a unique deadpan caption, gore toggle (Full / Reduced / Off), and the victim's / player's baked
// characters driven through exec_* / victim_* animations. The victim is drawn as a "puppet" by the cutscene so it can be
// clipped, shaken, tinted or tumbled; the real player entity is posed in place.
import { registerExecution } from '../executions';
import type { ExecTarget } from '../executions';
import type { World, Cutscene, PropRT } from '../world';
import type { Actor } from '../entity';
import type { Ctx } from '../../render/canvas';
import { ellipse, drawSprite } from '../../render/canvas';
import type { AnimName } from '../../art/characters';
import type { ExecType } from '../../data/ids';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import type { LoopHandle } from '../../audio/audio';
import { fxRng } from '../../core/rng';
import { clamp, lerp, easeOutCubic, smooth } from '../../core/math';
import { footprint, TILE } from '../world-types';
import { bloodBurst, gibBurst, sparks, smokePuff, debrisBurst, goreLevel } from '../fx';
import { Pickup } from '../pickups';
import { drawText } from '../../render/font';
import { fieldOf, electrifyNear, nearElectric, Pt } from './core';
import { paperBurst, GLASS_COLS, PAPER_COLS, shardDecals } from './hazards';
import {
  drawPuppet, PuppetOpts, letterbox, flashFrame, caption, bang, makePrintout, drawFaceFlap, drawFallShot, FH, fallDistance, floorAt,
  zapLine, skeletonFrame,
} from './exec-fx';

// ---------------------------------------------------------------------------
// Choreography rig
interface Rig {
  /** Centre of the object (or window tile). */
  cx: number; cy: number;
  /** Footprint extents. */
  fw: number; fh: number;
  /** Unit vector pointing from the object out to where the player stands (its "front"). */
  f: Pt;
  /** Side vector (player's side of the victim). */
  s: Pt;
  /** Where the victim is held / the player stands. */
  vp: Pt; pp: Pt;
  /** Distance from the centre to the front face. */
  half: number;
}

function free(w: World, x: number, y: number): boolean { return w.isWalkablePx(x, y); }

function buildRig(w: World, pl: Actor, target: ExecTarget): Rig {
  let cx: number, cy: number, fw: number, fh: number;
  if (target.prop) {
    const fp = footprint(target.prop.def);
    cx = fp.x + fp.w / 2; cy = fp.y + fp.h / 2; fw = fp.w; fh = fp.h;
  } else {
    const t = target.tile ?? [Math.floor(pl.x / TILE), Math.floor(pl.y / TILE)];
    cx = (t[0] + 0.5) * TILE; cy = (t[1] + 0.5) * TILE; fw = TILE; fh = TILE;
  }
  const ang = Math.atan2(pl.y - cy, pl.x - cx);
  const f: Pt = Math.abs(Math.cos(ang)) >= Math.abs(Math.sin(ang)) ? { x: Math.sign(Math.cos(ang)) || 1, y: 0 } : { x: 0, y: Math.sign(Math.sin(ang)) || 1 };
  const half = (Math.abs(f.x) * fw + Math.abs(f.y) * fh) / 2;
  let vp: Pt = { x: cx + f.x * (half + 9), y: cy + f.y * (half + 9) };
  if (!free(w, vp.x, vp.y)) vp = { x: pl.x + Math.cos((pl as any).aim ?? 0) * 10, y: pl.y };
  let s: Pt = { x: -f.y, y: f.x };
  if ((pl.x - vp.x) * s.x + (pl.y - vp.y) * s.y < 0) s = { x: -s.x, y: -s.y };
  let pp: Pt = { x: vp.x + s.x * 14, y: vp.y + s.y * 14 };
  if (!free(w, pp.x, pp.y)) { pp = { x: vp.x - s.x * 14, y: vp.y - s.y * 14 }; }
  if (!free(w, pp.x, pp.y)) pp = { x: pl.x, y: pl.y };
  return { cx, cy, fw, fh, f, s, vp, pp, half };
}

const lerpPt = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

// ---------------------------------------------------------------------------
// Kit: shared cutscene runtime
interface Script {
  /** Nominal (full) duration in seconds; the timeline `n` runs 0..base. */
  base(k: Kit): number;
  /** Real duration when not full (cutscenes Off). Defaults to ~0.55 s. */
  briefDur?: number;
  caps: string[];
  setup?(k: Kit): void;
  tick(k: Kit, n: number, dt: number): void;
  under?(k: Kit, g: Ctx): void;
  over?(k: Kit, g: Ctx): void;
  screen?(k: Kit, g: Ctx, W: number, H: number): void;
  end?(k: Kit): void;
  /** After the kill resolves (e.g. remove a defenestrated body). */
  after?(k: Kit): void;
}

class Kit {
  t = 0;
  n = 0;
  dur: number;
  base: number;
  /** Impact-frame: peak alpha + the app frame it started (fades over 5 frames, even during hit-stop). */
  flashMag = 0; flashF = -99;
  letter = 0;
  vAnim: AnimName = 'grabbed'; vT = 0;
  pAnim: AnimName = 'exec_hold'; pT = 0;
  v: Pt; p: Pt; v0: Pt; p0: Pt;
  vo: PuppetOpts = {};
  vFace = 0;
  vHide = false;
  cam: Pt | null = null;
  zoom = 1;
  capShown = -1;
  fired = new Set<string>();
  bangs: { x: number; y: number; text: string; t: number; col?: string }[] = [];
  rig: Rig;
  prop: PropRT | null;
  cap: string;
  loop: LoopHandle | null = null;
  data: Record<string, any> = {};
  done = false;
  lights0: number;
  constructor(public script: Script, public w: World, public pl: Actor, public vc: Actor, public target: ExecTarget, public full: boolean, public finish: () => void) {
    this.rig = buildRig(w, pl, target);
    this.prop = target.prop;
    this.base = script.base(this);
    this.dur = full ? this.base : (script.briefDur ?? 0.55);
    this.v0 = { x: vc.x, y: vc.y }; this.p0 = { x: pl.x, y: pl.y };
    this.v = { ...this.v0 }; this.p = { ...this.p0 };
    this.vFace = Math.atan2(-this.rig.f.y, -this.rig.f.x);
    this.cap = script.caps[Math.floor(fxRng.next() * script.caps.length)];
    this.lights0 = w.forcedDarkness;
    script.setup?.(this);
    // hide the real victim: the cutscene draws it
    vc.x = -9999; vc.y = -9999;
  }

  /** Fire an effect once when the timeline passes `at`. */
  at(key: string, at: number, fn: () => void): void {
    if (this.n >= at && !this.fired.has(key)) { this.fired.add(key); fn(); }
  }

  setV(a: AnimName, restart = true): void { if (this.vAnim !== a || restart) { this.vAnim = a; this.vT = 0; } }
  setP(a: AnimName, restart = true): void { if (this.pAnim !== a || restart) { this.pAnim = a; this.pT = 0; } }

  /** Enter tween (actors slide into their staging spots). */
  enter(n: number, until: number): number { return smooth(clamp(n / until, 0, 1)); }

  /** Impact frame: white flash + hit-stop + shake + rumble. */
  impact(mag: number, hold = 0.07, flash = 0.75): void {
    this.flashMag = Math.min(0.8, flash); this.flashF = app.frame;
    this.w.hitstop = Math.max(this.w.hitstop, hold);
    app.renderer.shake(mag, 0.28);
    app.input.rumble(Math.min(1, mag / 8), 0.5, 140);
    if (this.prop) this.prop.shake = 0.14;
  }

  bang(x: number, y: number, text: string, col?: string): void { this.bangs.push({ x, y, text, t: 0, col }); }

  focus(x: number, y: number, zoom: number): void { if (this.full) { this.cam = { x, y }; this.zoom = zoom; } }

  update(dt: number): boolean {
    this.t += dt;
    this.n = (this.t / this.dur) * this.base;
    const n = this.n;
    this.vT += dt; this.pT += dt;
    this.letter = Math.min(1, this.letter + dt * 8);
    for (const b of this.bangs) b.t += dt;
    this.bangs = this.bangs.filter((b) => b.t < 0.5);
    this.script.tick(this, n, dt);
    // pose the real player
    const pl = this.pl;
    pl.x = this.p.x; pl.y = this.p.y;
    pl.setAnim(this.pAnim, false);
    pl.animT = this.pT;
    pl.face(Math.atan2(this.v.y - this.p.y, this.v.x - this.p.x));
    if (n >= this.base * 0.55) this.capShown = (n - this.base * 0.55) / (this.base * 0.45);
    if (this.t >= this.dur && !this.done) { this.done = true; this.close(); return true; }
    return false;
  }

  private close(): void {
    const { w, pl, vc } = this;
    this.loop?.stop(0.05);
    this.script.end?.(this);
    w.forcedDarkness = this.lights0;
    w.tint = null;
    vc.x = this.v.x; vc.y = this.v.y;
    if (!w.isWalkablePx(vc.x, vc.y)) { vc.x = this.v0.x; vc.y = this.v0.y; }
    pl.x = this.p.x; pl.y = this.p.y;
    if (!w.isWalkablePx(pl.x, pl.y)) { pl.x = this.p0.x; pl.y = this.p0.y; }
    pl.setAnim('idle', true);
    this.finish();
    this.script.after?.(this);
  }

  render(g: Ctx): void {
    this.script.under?.(this, g);
    if (!this.vHide) drawPuppet(g, this.vc, this.vAnim, this.vT, this.v.x, this.v.y, { dir: this.vFace, ...this.vo });
    this.script.over?.(this, g);
  }

  renderScreen(g: Ctx): void {
    const r = app.renderer;
    this.script.screen?.(this, g, r.W, r.H);
    if (this.full) {
      letterbox(g, r.W, r.H, this.letter);
      if (this.capShown >= 0) caption(g, r.W, r.H, this.cap, this.capShown * 1.4 + 0.02);
    }
    for (const b of this.bangs) { const f = r.worldToFrame(b.x, b.y); bang(g, f.x, f.y, b.text, b.t / 0.5, b.col); }
    flashFrame(g, r.W, r.H, this.flashMag * Math.max(0, 1 - (app.frame - this.flashF) / 5));
  }

  toCutscene(): Cutscene {
    const k = this;
    const cs: Cutscene & { hideHud?: boolean } = {
      update: (dt) => k.update(dt),
      render: (g) => k.render(g),
      renderScreen: (g) => k.renderScreen(g),
      hideHud: this.full,
    };
    Object.defineProperty(cs, 'camera', { get: () => (k.full && k.cam ? k.cam : undefined), enumerable: true });
    Object.defineProperty(cs, 'zoom', { get: () => (k.full ? k.zoom : 1), enumerable: true });
    return cs;
  }
}

function register(type: ExecType, script: Script): void {
  registerExecution(type, {
    play(w, player, victim, target, full, done) {
      const k = new Kit(script, w, player, victim, target, full, done);
      return k.toCutscene();
    },
  });
}

// ---------------------------------------------------------------------------
// Shared bits
const room = (w: World, x: number, y: number) => w.roomAt(x, y);

/** Staging: slide the victim to vp and the player to pp. */
function stage(k: Kit, n: number, until = 0.2): void {
  const e = k.enter(n, until);
  k.v = lerpPt(k.v0, k.rig.vp, e);
  k.p = lerpPt(k.p0, k.rig.pp, e);
}

/** Press the victim towards the object by `d` px (decays through k.data.nudge). */
function nudge(k: Kit, amount = 4): void { k.data.nudge = amount; }
function applyNudge(k: Kit, dt: number): void {
  const nd = (k.data.nudge ?? 0) as number;
  k.data.nudge = Math.max(0, nd - dt * 40);
  k.v = { x: k.v.x - k.rig.f.x * nd, y: k.v.y - k.rig.f.y * nd };
}

/** The point where the victim's head meets the object. */
const headPt = (k: Kit): Pt => ({ x: k.rig.cx + k.rig.f.x * (k.rig.half + 1), y: k.rig.cy + k.rig.f.y * (k.rig.half + 1) - 14 });

/** Clip rect: only the part of the victim in front of the object's face is visible. */
function frontClip(k: Kit, depth = 0): [number, number, number, number] {
  const { f, cx, cy, half } = k.rig;
  const fx = cx + f.x * (half - depth), fy = cy + f.y * (half - depth);
  const B = 600;
  if (f.y > 0) return [fx - B, fy, fx + B, fy + B];
  if (f.y < 0) return [fx - B, fy - B, fx + B, fy];
  if (f.x > 0) return [fx, fy - B, fx + B, fy + B];
  return [fx - B, fy - B, fx, fy + B];
}

function drip(w: World, x: number, y: number, dir: number, n: number, k: Kit): void {
  bloodBurst(w.particles, x, y, dir, n, room(w, x, y), 16);
  void k;
}

const outDir = (k: Kit) => Math.atan2(k.rig.f.y, k.rig.f.x);

// ---------------------------------------------------------------------------
// DEFENESTRATION: hurled through the glass, camera follows the fall in an exterior facade shot (ground floor = short drop)
const DEFEN: Script = {
  base(k) {
    if (!k.full) return 0.5;
    const floor = k.w.map.req.floorNumber;
    k.data.fall = floor <= 1 ? 0.34 : 0.58;
    return 0.5 + k.data.fall + 0.37;
  },
  briefDur: 0.5,
  caps: ['RESTRUCTURING. VERTICALLY.', 'NOTICE PERIOD: 1.8 SECONDS', 'A STEEP LEARNING CURVE', 'DOWNSIZED. EXTERNALLY.'],
  setup(k) {
    const { rig } = k;
    k.focus((rig.vp.x + rig.cx) / 2, (rig.vp.y + rig.cy) / 2 - 10, 2.1);
    k.data.floor = k.w.map.req.floorNumber;
    k.data.act = k.w.map.req.act;
    k.data.winC = { x: rig.cx, y: rig.cy - 4 };
    k.data.fallPx = fallDistance(k.data.floor);
  },
  tick(k, n, dt) {
    const { rig, w } = k;
    // interior: stage -> wind-up -> hurl -> smash
    if (n < 0.14) stage(k, n, 0.14);
    else if (n < 0.28) { k.v = { x: rig.vp.x - rig.f.x * 2, y: rig.vp.y - 6 }; k.p = rig.pp; }
    else if (n < 0.42) {
      const e = easeOutCubic(clamp((n - 0.28) / 0.14, 0, 1));
      k.v = lerpPt({ x: rig.vp.x, y: rig.vp.y - 6 }, { x: rig.cx - rig.f.x * 2, y: rig.cy - 6 }, e);
      k.vo = { rot: -rig.f.x * 0.9 - rig.f.y * 0.6 + 0.4, lift: 8 };
      k.p = rig.pp;
    }
    k.setV(n < 0.28 ? 'grabbed' : 'thrown', false);
    k.setP(n < 0.28 ? 'exec_hold' : 'exec_hurl', false);
    k.at('windup', 0.14, () => { audio.sfx('whoosh', { x: k.v.x, y: k.v.y }); });
    k.at('smash', 0.42, () => {
      const t = k.target.tile;
      if (t) { w.smashWindow(t[0], t[1]); }
      const c = k.data.winC as Pt;
      debrisBurst(w.particles, c.x, c.y, 26, GLASS_COLS, room(w, c.x, c.y), 'glass');
      sparks(w.particles, c.x, c.y, 10, '#ffffff', 150);
      shardDecals(w, c.x + rig.f.x * 8, c.y + rig.f.y * 8, 14, 12);
      audio.sfx('window_smash', { x: c.x, y: c.y });
      k.impact(8, 0.1, 0.95);
      k.vHide = true;
      if (k.full) { audio.sfx('scream', { x: c.x, y: c.y, vol: 0.6 }); audio.sfx('fall_whistle', { x: c.x, y: c.y }); }
      k.bang(c.x, c.y - 8, 'SMASH');
    });
    k.v = n >= 0.42 ? { x: rig.cx, y: rig.cy } : k.v;
    if (!k.full) return;
    // exterior fall
    const fall = k.data.fall as number;
    const tt = n - 0.5;
    if (tt >= 0) {
      const kk = clamp(tt / fall, 0, 1);
      k.data.k = kk * kk;
      k.data.landedAt ??= -1;
      if (kk >= 1 && k.data.landedAt < 0) {
        k.data.landedAt = n;
        audio.sfx('thud', { x: k.p.x, y: k.p.y, vol: 1 });
        audio.sfx('splat_far', { x: k.p.x, y: k.p.y });
        audio.sfx('crowd_gasp', { vol: 0.8 });
        app.renderer.shake(6, 0.3);
        k.flashMag = 0.6; k.flashF = app.frame;
      }
    }
    void dt;
  },
  screen(k, g, W, H) {
    if (!k.full || k.n < 0.5) return;
    const tt = k.n - 0.5;
    const fall = k.data.fall as number;
    const kk = (k.data.k ?? 0) as number;
    const landed = (k.data.landedAt ?? -1) >= 0 ? k.n - (k.data.landedAt as number) : -1;
    drawFallShot(g, {
      W, H, floor: k.data.floor, act: k.data.act, k: kk, t: tt, landed, victim: k.vc, gore: goreLevel(), rot: tt * 9, fallPx: k.data.fallPx,
    });
    // floor counter
    const fl = floorAt({ floor: k.data.floor, k: kk, fallPx: k.data.fallPx });
    if (landed < 0 && k.data.floor > 1) drawText(g, 'FLOOR ' + fl, W - 16, H * 0.5 - 8, { align: 'right', color: '#ffd34d', scale: 2, outline: '#000' });
    if (landed >= 0 && landed < 0.3) drawText(g, k.data.floor <= 1 ? 'BOING' : 'SPLAT', W / 2, H * 0.42, { align: 'center', color: '#ffffff', scale: 3, outline: '#000' });
    void fall; void FH;
  },
  end(k) {
    // the cutscene's impact flash on the cut back
    k.flashMag = 0.6; k.flashF = app.frame;
  },
  after(k) {
    const v = k.vc as any;
    if (!v.isBoss) {
      if (v.flags) v.flags.defenestrated = true;
      v.ignoreForClear = true;
      v.dead = true;           // gone out of the building (same as a thrown defenestration)
    }
  },
};
register('defenestration', DEFEN);

// ---------------------------------------------------------------------------
// PHOTOCOPIER: head slammed into the glass, four printouts of the battered face scatter as floor decals
const COPIER: Script = {
  base: () => 1.44,
  caps: ['FOUR COPIES FOR THE FILE', 'DOUBLE-SIDED, SINGLE-MINDED', 'PLEASE DO NOT SCAN PERSONAL ITEMS', 'REPRODUCED WITHOUT PERMISSION'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 6, k.rig.cy + k.rig.f.y * 6 - 10, 2.1); },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.22);
    k.setP('exec_slam', false);
    k.setV('victim_slam', false);
    const slams = [0.32, 0.56, 0.8, 1.02];
    slams.forEach((s, i) => k.at('slam' + i, s, () => {
      nudge(k, 5);
      k.setV('victim_slam', true); k.setP('exec_slam', true);
      const h = headPt(k);
      audio.sfx('execution_impact', { x: h.x, y: h.y, pitch: 0.9 + i * 0.12, vol: i === 3 ? 1 : 0.7 });
      audio.sfx('photocopier', { x: h.x, y: h.y, vol: 0.5, pitch: 0.8 + i * 0.2 });
      k.impact(i === 3 ? 7 : 3.5, i === 3 ? 0.1 : 0.04, i === 3 ? 0.9 : 0.5);
      if (i >= 1) drip(w, h.x, h.y + 6, outDir(k), i === 3 ? 18 : 8, k);
      if (i === 3) { k.bang(h.x, h.y - 6, 'KA-CHUNK'); }
      k.data.glow = 0.25;
    }));
    // printouts spit out
    for (let i = 0; i < 4; i++) k.at('print' + i, 1.1 + i * 0.05, () => {
      const portrait = k.vc.baked?.portrait;
      if (!portrait) return;
      const img = makePrintout(portrait, i);
      const tx = rig.cx + rig.s.x * (i - 1.5) * 5 + rig.f.x * (rig.half + 2), ty = rig.cy + rig.f.y * (rig.half) + rig.s.y * (i - 1.5) * 5 - 4;
      const a = Math.atan2(rig.f.y, rig.f.x) + (i - 1.5) * 0.55 + fxRng.range(-0.15, 0.15), sp = fxRng.range(70, 130);
      w.particles.spawn({ kind: 'sprite', sprite: img, x: tx, y: ty, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: fxRng.range(70, 110), gravity: 260, life: 2.5, rot: fxRng.range(-0.8, 0.8), vr: fxRng.range(-6, 6), toDecal: true, roomId: room(w, tx, ty), bounce: 0.15 });
      audio.sfx('paper_rustle', { x: tx, y: ty, vol: 0.6 });
      if (i === 0) paperBurst(w, tx, ty - 2, 14, Math.atan2(rig.f.y, rig.f.x), 2);
    });
    applyNudge(k, dt);
    k.data.glow = Math.max(0, (k.data.glow ?? 0) - dt);
    if (n > 1.1) k.v = { x: k.v.x + rig.f.x * 2, y: k.v.y + rig.f.y * 2 };
    if (k.prop && n > 0.2 && n < 1.2) k.prop.shake = Math.max(k.prop.shake, 0.04);
  },
  over(k, g) {
    const { rig, n } = k;
    if (n < 0.22 || n > 1.2) return;
    // scanner bar sweeping the copier glass
    const fp = k.prop ? footprint(k.prop.def) : { x: rig.cx - 16, y: rig.cy - 8, w: 32, h: 16 };
    const sweep = ((n * 2.2) % 1);
    const bx = Math.round(fp.x + 2 + sweep * (fp.w - 4)), by = Math.round(fp.y - 4);
    g.fillStyle = '#d8ffe4'; g.fillRect(bx, by, 2, 7);
    g.globalAlpha = 0.45; g.fillStyle = '#9fffc0'; g.fillRect(bx - 3, by, 8, 7); g.globalAlpha = 1;
    if ((k.data.glow ?? 0) > 0) { g.globalAlpha = 0.6; g.fillStyle = '#ffffff'; g.fillRect(Math.round(fp.x), Math.round(fp.y - 5), fp.w, 8); g.globalAlpha = 1; }
  },
};
register('photocopier', COPIER);

// ---------------------------------------------------------------------------
// SERVER RACK: electrocution with sparks; the room lights flicker
const RACK: Script = {
  base: () => 1.4,
  caps: ['HAVE YOU TRIED TURNING HIM OFF?', 'UNPLANNED DOWNTIME', 'THE LOAD HAS BEEN BALANCED', 'CRITICAL UPDATE: DECEASED'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 6, k.rig.cy + k.rig.f.y * 6 - 10, 2.0); },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.22);
    k.setP('exec_hold', false);
    const shock = n > 0.28 && n < 1.12;
    k.setV(shock ? 'victim_shock' : n <= 0.28 ? 'grabbed' : 'victim_slam', false);
    k.at('grab', 0.24, () => { nudge(k, 6); audio.sfx('execution_impact', { x: k.v.x, y: k.v.y }); k.impact(5, 0.06, 0.6); });
    if (shock) {
      const h = headPt(k);
      k.v = { x: rig.vp.x - rig.f.x * 5 + fxRng.range(-1.5, 1.5), y: rig.vp.y - rig.f.y * 5 + fxRng.range(-1, 1) };
      sparks(w.particles, h.x, h.y + 4, 2, '#bff4ff', 130);
      if (fxRng.chance(0.5)) sparks(w.particles, k.rig.cx + rig.f.x * 6, k.rig.cy - 8, 2, '#ffe9a0', 100);
      // flickering room: hard dark / blue-white pulses
      const ph = Math.sin(n * 70) + Math.sin(n * 41 + 1);
      w.forcedDarkness = ph > 0.7 ? 0.7 : ph < -1 ? 0.15 : 0.35;
      w.tint = ph > 1.3 ? { col: '#c8f0ff', a: 0.3 } : ph < -1.2 ? { col: '#101830', a: 0.25 } : null;
      k.vo = { tint: ph > 0.3 ? '#bff4ff' : '#9fd8ff', tintAmt: 0.4, flash: ph > 1.75 ? 0.7 : 0 };
      k.data.skel = Math.floor(n * 22) % 7 === 0;
      if (Math.floor(n * 40) !== Math.floor((n - dt) * 40)) audio.sfx('electric_zap', { x: h.x, y: h.y, vol: 0.4, pitch: 0.8 + fxRng.range(0, 0.6) });
      if (Math.floor(n * 7) !== Math.floor((n - dt) * 7)) { audio.sfx('server_spark', { x: h.x, y: h.y, vol: 0.5 }); app.renderer.shake(3, 0.12); }
    } else { k.vo = {}; k.data.skel = false; }
    if (n >= 1.12) { w.tint = null; w.forcedDarkness = k.lights0; }
    k.at('end', 1.12, () => {
      const h = headPt(k);
      k.impact(5, 0.08, 0.9);
      smokePuff(w.particles, h.x, h.y, 8, '#3a3a40', 6);
      sparks(w.particles, h.x, h.y, 20, '#ffffff', 170);
      k.bang(h.x, h.y - 6, 'BZZZT', '#bff4ff');
      k.v = { x: rig.vp.x, y: rig.vp.y };
      k.setV('victim_slam', true);
    });
    applyNudge(k, dt);
  },
  over(k, g) {
    const { rig } = k;
    if (k.n > 0.28 && k.n < 1.12) {
      const h = headPt(k);
      zapLine(g, rig.cx + rig.f.x * 4, rig.cy - 10, h.x + fxRng.range(-3, 3), h.y + 10);
      if (fxRng.chance(0.6)) zapLine(g, rig.cx - rig.s.x * 6, rig.cy - 14, k.v.x + fxRng.range(-6, 6), k.v.y - 8 + fxRng.range(-6, 6), false);
      if (k.data.skel) {
        // x-ray frame: dark silhouette + bones
        drawPuppet(g, k.vc, k.vAnim, k.vT, k.v.x, k.v.y, { dir: k.vFace, tint: '#102040', tintAmt: 1, shadow: false });
        skeletonFrame(g, Math.round(k.v.x), Math.round(k.v.y));
      }
    }
  },
  end(k) {
    const { w, rig } = k;
    electrifyNear(w, rig.cx, rig.cy, 70, 5, k.pl);
    sparks(w.particles, rig.cx, rig.cy - 8, 14, '#ffe9a0', 120);
  },
};
register('server_rack', RACK);

// ---------------------------------------------------------------------------
// SHREDDER: the tie is fed into the shredder (gore toggle: Off = comedic paper confetti only)
const SHREDDER: Script = {
  base: () => 1.44,
  caps: ['DATA PROTECTION COMPLIANT', 'CONFIDENTIAL. NOW REDACTED.', 'THE TIE-IN WITH LEGAL', 'SECURE DESTRUCTION OF STAFF'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 8, k.rig.cy + k.rig.f.y * 8 - 8, 2.0); k.data.gore = goreLevel(); },
  tick(k, n, dt) {
    const { rig, w } = k;
    const gore = k.data.gore as 0 | 1 | 2;
    stage(k, n, 0.2);
    k.setP('exec_slam', false);
    k.setV(n < 0.3 ? 'grabbed' : 'victim_slam', false);
    k.at('snag', 0.28, () => { audio.sfx('shredder', { x: rig.cx, y: rig.cy }); k.impact(3, 0.05, 0.5); k.bang(rig.cx, rig.cy - 14, 'CHUNK'); });
    // pulled in by the tie: slides behind the machine and is squashed out of sight
    if (n >= 0.3 && n < 1.0) {
      const e = smooth(clamp((n - 0.3) / 0.7, 0, 1));
      const inP = { x: rig.cx - rig.f.x * rig.half * 0.2, y: rig.cy - rig.f.y * rig.half * 0.2 + 2 };
      k.v = lerpPt(rig.vp, inP, e);
      k.vo = { squash: 1 - 0.8 * e * e + Math.sin(n * 60) * 0.03 };
      if (k.prop) { k.prop.shake = 0.1; k.prop.ox = Math.round(Math.sin(n * 90)); }
      // strips out of the bottom
      const sx = rig.cx + rig.f.x * (rig.half + 1) + rig.s.x * fxRng.range(-5, 5), sy = rig.cy + rig.f.y * (rig.half + 1) + rig.s.y * fxRng.range(-5, 5);
      for (let i = 0; i < 3; i++) {
        const bloody = gore > 0 && n > 0.62 && fxRng.chance(gore === 2 ? 0.55 : 0.25);
        w.particles.spawn({ kind: 'paper', x: sx, y: sy, z: 6, vx: rig.f.x * fxRng.range(10, 40) + fxRng.range(-12, 12), vy: rig.f.y * fxRng.range(10, 40) + fxRng.range(-6, 14), vz: fxRng.range(5, 40), gravity: 140, life: 1.2, col: bloody ? '#a3161b' : fxRng.pick(PAPER_COLS), size: 2, toDecal: true, roomId: room(w, sx, sy) });
      }
    }
    k.at('gulp', 1.0, () => {
      const c = { x: rig.cx + rig.f.x * (rig.half + 2), y: rig.cy + rig.f.y * (rig.half + 2) - 6 };
      k.impact(7, 0.1, 0.9);
      audio.sfx('execution_impact', { x: c.x, y: c.y });
      if (gore === 2) { gibBurst(w.particles, k.vc.baked?.gibs ?? [], c.x, c.y, outDir(k), room(w, c.x, c.y), 0.7); k.vc.dismembered = true; k.vHide = true; }
      else if (gore === 1) { bloodBurst(w.particles, c.x, c.y, outDir(k), 10, room(w, c.x, c.y), 12); paperBurst(w, c.x, c.y, 24, outDir(k), 3); }
      else paperBurst(w, c.x, c.y, 40, outDir(k), 4);
      k.bang(c.x, c.y - 10, gore === 0 ? 'SHRED' : 'SHRRRED');
      if (gore < 2) { k.v = { x: rig.vp.x, y: rig.vp.y }; k.vo = {}; k.setV('victim_slam', true); }
    });
    if (n >= 1.0 && gore === 2) k.vHide = true;
    if (n >= 1.0 && gore < 2) k.vo = {};
    void dt;
  },
  over(k, g) {
    const { rig } = k;
    // the machine swallows him: redraw it over the puppet (he is "behind" the front face)
    if (k.prop && k.n > 0.3 && k.n < 1.0) drawSprite(g, k.w.propSpriteFor(k.prop), k.prop.def.x + k.prop.ox, k.prop.def.y + k.prop.oy);
    // the tie, taut between the victim and the slot
    if (k.n > 0.2 && k.n < 0.8) {
      const sx = rig.cx + rig.f.x * (rig.half - 1), sy = rig.cy + rig.f.y * (rig.half - 1) - 8;
      g.fillStyle = '#c0262a';
      const x0 = k.v.x, y0 = k.v.y - 16, steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        g.fillRect(Math.round(x0 + (sx - x0) * t), Math.round(y0 + (sy - y0) * t + Math.sin(t * 3.14) * 2), 2, 2);
      }
    }
  },
};
register('shredder', SHREDDER);

// ---------------------------------------------------------------------------
// MICROWAVE: head slam, door slam, "ding"
const MICROWAVE: Script = {
  base: () => 1.44,
  caps: ['REHEAT UNTIL PIPING HOT', 'DING. LUNCH IS SERVED.', 'DO NOT MICROWAVE FISH (OR STAFF)', 'STAND BACK: HE MAY BE HOT'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 6, k.rig.cy + k.rig.f.y * 6 - 8, 2.2); },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.2);
    k.setP('exec_slam', false);
    k.setV('victim_slam', false);
    const slams = [0.3, 0.52, 0.74];
    slams.forEach((s, i) => k.at('slam' + i, s, () => {
      nudge(k, 6);
      k.setV('victim_slam', true); k.setP('exec_slam', true);
      const h = headPt(k);
      audio.sfx('execution_impact', { x: h.x, y: h.y, pitch: 1 + i * 0.1, vol: 0.8 });
      audio.sfx('thud', { x: h.x, y: h.y, vol: 0.7 });
      k.impact(4 + i, 0.05, 0.55);
      if (i >= 1) drip(w, h.x, h.y + 6, outDir(k), 7, k);
    }));
    k.at('hum', 0.86, () => { k.loop = audio.loop('microwave_loop', { x: rig.cx, y: rig.cy, vol: 0.7 }); audio.sfx('microwave_hum', { x: rig.cx, y: rig.cy }); k.data.cook = true; });
    if (k.data.cook && n < 1.1) {
      const h = headPt(k);
      k.v = { x: rig.vp.x - rig.f.x * 5 + fxRng.range(-1, 1), y: rig.vp.y - rig.f.y * 5 + fxRng.range(-1, 1) };
      if (fxRng.chance(0.5)) sparks(w.particles, h.x + fxRng.range(-4, 4), h.y + 6, 2, '#ffe9a0', 90);
      if (k.prop) k.prop.shake = 0.05;
    }
    k.at('ding', 1.1, () => {
      k.loop?.stop(0.02); k.loop = null; k.data.cook = false;
      const h = headPt(k);
      audio.sfx('microwave_ding', { x: h.x, y: h.y, vol: 1 });
      k.impact(6, 0.09, 0.9);
      smokePuff(w.particles, h.x, h.y, 10, '#d8dce0', 6);
      sparks(w.particles, h.x, h.y + 4, 16, '#ffe9a0', 150);
      if (goreLevel() > 0) bloodBurst(w.particles, h.x, h.y + 4, outDir(k), 12, room(w, h.x, h.y), 14);
      k.bang(h.x, h.y - 6, 'DING!', '#ffe9a0');
      k.v = { x: rig.vp.x, y: rig.vp.y };
      k.setV('victim_slam', true);
    });
    applyNudge(k, dt);
  },
  over(k, g) {
    if (!k.data.cook && !(k.n > 0.3 && k.n < 0.86)) return;
    // warm glow from the door window
    const { rig } = k;
    const gx = rig.cx + rig.f.x * (rig.half - 2), gy = rig.cy + rig.f.y * (rig.half - 2) - 7;
    const p = k.data.cook ? 0.5 + 0.3 * Math.sin(k.n * 50) : 0.15;
    g.globalAlpha = p * 0.7;
    ellipse(g, gx, gy, 12, 8, '#ffb040'); ellipse(g, gx, gy, 7, 5, '#ffe9a0');
    g.globalAlpha = 1;
  },
  end(k) { k.loop?.stop(0.02); },
};
register('microwave', MICROWAVE);

// ---------------------------------------------------------------------------
// HAND DRYER: comedic face-blast with flapping cheeks (close-up of the victim's baked portrait)
const DRYER: Script = {
  base: () => 1.4,
  caps: ['HYGIENE AUDIT: FAILED', 'BLOW-DRY REVIEW', 'AIR QUALITY: COMPROMISED', 'A BRIEF WARM DISMISSAL'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 10, k.rig.cy + k.rig.f.y * 10 - 4, 2.2); },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.2);
    k.setP('exec_hold', false);
    k.setV('victim_slam', false);
    k.at('start', 0.28, () => { audio.sfx('hand_dryer', { x: rig.cx, y: rig.cy }); k.impact(3, 0.05, 0.5); nudge(k, 5); });
    if (n > 0.28 && n < 1.15) {
      k.v = { x: rig.vp.x - rig.f.x * 3 + fxRng.range(-1, 1) + Math.sin(n * 60) * 0.8, y: rig.vp.y - rig.f.y * 3 };
      k.vo = { squash: 1 + Math.sin(n * 45) * 0.04 };
      // hot wind
      const ox = rig.cx + rig.f.x * (rig.half + 2), oy = rig.cy + rig.f.y * (rig.half + 2) - 4;
      for (let i = 0; i < 2; i++) {
        const a = Math.atan2(rig.f.y, rig.f.x) + fxRng.range(-0.5, 0.5), sp = fxRng.range(90, 170);
        w.particles.spawn({ kind: 'spark', x: ox, y: oy, z: 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25, col: fxRng.pick(['#ffffff', '#cfe8f4', '#ffd9a0']), size: 1, drag: 2 });
      }
      if (Math.floor(n * 9) !== Math.floor((n - dt) * 9)) app.renderer.shake(1.5, 0.1);
    } else { k.vo = {}; }
    k.at('end', 1.15, () => {
      k.impact(5, 0.08, 0.8);
      smokePuff(w.particles, k.v.x, k.v.y - 16, 6, '#e8e0d0', 5);
      k.bang(k.v.x, k.v.y - 28, 'FWOOOSH');
      k.v = { x: rig.vp.x, y: rig.vp.y };
      k.setV('victim_slam', true);
    });
    applyNudge(k, dt);
  },
  screen(k, g, W, H) {
    if (!k.full || k.n < 0.28 || k.n > 1.2) return;
    const portrait = k.vc.baked?.portrait;
    if (!portrait) return;
    const e = smooth(clamp((k.n - 0.28) / 0.12, 0, 1)) * (1 - smooth(clamp((k.n - 1.12) / 0.08, 0, 1)));
    if (e <= 0.02) return;
    const sc = e < 0.5 ? 2 : 3;
    drawFaceFlap(g, portrait, Math.round(W * 0.8), Math.round(H * 0.46), k.n - 0.28, 1.1 + Math.min(1, (k.n - 0.28) * 1.6), sc);
  },
};
register('hand_dryer', DRYER);

// ---------------------------------------------------------------------------
// WATER COOLER (bonus): head dunked into the bottle, bubbles, bottle bursts (live if electrified)
const COOLER: Script = {
  base: () => 1.35,
  caps: ['HYDRATION IS MANDATORY', 'BOTTOMLESS PERFORMANCE', 'WATER-COOLER MOMENT', 'STAYING HYDRATED (INTERNALLY)'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 6, k.rig.cy + k.rig.f.y * 6 - 10, 2.1); k.data.bubbles = [] as { x: number; y: number; r: number; vy: number; ph: number }[]; },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.2);
    k.setP('exec_slam', false);
    k.setV(n < 0.3 ? 'grabbed' : 'victim_slam', false);
    k.at('dunk', 0.3, () => { nudge(k, 7); audio.sfx('water_splash', { x: rig.cx, y: rig.cy }); k.impact(4, 0.06, 0.6); k.bang(rig.cx, rig.cy - 18, 'GLUG'); });
    if (n > 0.3 && n < 1.0) {
      const h = headPt(k);
      k.v = { x: rig.vp.x - rig.f.x * 5 + fxRng.range(-0.6, 0.6), y: rig.vp.y - rig.f.y * 5 };
      if (fxRng.chance(0.55)) (k.data.bubbles as any[]).push({ x: h.x + fxRng.range(-3, 3), y: h.y - 2, r: fxRng.pick([1, 1, 2, 2, 3]), vy: fxRng.range(14, 34), ph: fxRng.range(0, 6) });
      if (Math.floor(n * 6) !== Math.floor((n - dt) * 6)) audio.sfx('water_splash', { x: h.x, y: h.y, vol: 0.45, pitch: 0.8 + fxRng.range(0, 0.5) });
      if (k.prop) k.prop.shake = 0.05;
    }
    for (const b of k.data.bubbles as any[]) { b.y -= b.vy * dt; b.x += Math.sin(n * 9 + b.ph) * 0.3; }
    k.data.bubbles = (k.data.bubbles as any[]).filter((b) => b.y > rig.cy - 34);
    k.at('burst', 1.0, () => {
      const c = { x: rig.cx, y: rig.cy - 10 };
      k.impact(7, 0.09, 0.9);
      audio.sfx('glass_shatter', { x: c.x, y: c.y });
      for (let i = 0; i < 34; i++) {
        const a = fxRng.range(0, 6.28), sp = fxRng.range(30, 140);
        w.particles.spawn({ kind: 'water', x: c.x, y: c.y, z: fxRng.range(6, 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: fxRng.range(30, 100), gravity: 260, life: 0.8, col: fxRng.pick(['#bfe4f6', '#8cc4e6', '#ffffff']), size: 1, roomId: room(w, c.x, c.y) });
      }
      debrisBurst(w.particles, c.x, c.y, 10, ['#bfe4f6', '#ffffff', '#8cc4e6'], room(w, c.x, c.y), 'glass');
      const live = !!k.prop?.data.electrified || nearElectric(w, c.x, c.y, 28);
      fieldOf(w).addPuddle(rig.cx + rig.f.x * 8, rig.cy + rig.f.y * 8, 26, 18, k.pl, live);
      if (goreLevel() > 0) bloodBurst(w.particles, c.x, c.y, outDir(k), 8, room(w, c.x, c.y), 14);
      k.bang(c.x, c.y - 10, 'SPLOOSH', '#bfe4f6');
      k.v = { x: rig.vp.x, y: rig.vp.y }; k.setV('victim_slam', true);
    });
    applyNudge(k, dt);
  },
  over(k, g) {
    for (const b of k.data.bubbles as any[]) {
      g.fillStyle = '#e8f6ff'; g.fillRect(Math.round(b.x), Math.round(b.y), b.r, b.r);
      g.fillStyle = '#8cc4e6'; g.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, 1, 1);
    }
  },
};
register('water_cooler', COOLER);

// ---------------------------------------------------------------------------
// VENDING MACHINE (bonus): slammed into the glass until it gives; snacks drop (heal + caffeine)
const VENDING: Script = {
  base: () => 1.44,
  caps: ['SNACK DISPENSED', 'EXACT CHANGE ONLY', 'OUT OF ORDER (HIM)', 'B4: MANAGEMENT'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 8, k.rig.cy + k.rig.f.y * 8 - 10, 2.0); },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.2);
    k.setP('exec_slam', false);
    k.setV('victim_slam', false);
    [0.32, 0.66, 1.0].forEach((s, i) => k.at('slam' + i, s, () => {
      nudge(k, 6);
      k.setV('victim_slam', true); k.setP('exec_slam', true);
      const h = headPt(k);
      k.data.cracks = i + 1;
      audio.sfx('execution_impact', { x: h.x, y: h.y, pitch: 0.9 + i * 0.12 });
      audio.sfx(i === 2 ? 'glass_shatter' : 'thud', { x: h.x, y: h.y });
      k.impact(4 + i * 2, i === 2 ? 0.1 : 0.05, i === 2 ? 0.9 : 0.55);
      if (i === 2) {
        debrisBurst(w.particles, h.x, h.y + 4, 22, GLASS_COLS, room(w, h.x, h.y), 'glass');
        for (let j = 0; j < 8; j++) {
          const a = Math.atan2(rig.f.y, rig.f.x) + fxRng.range(-0.8, 0.8), sp = fxRng.range(20, 70);
          w.particles.spawn({ kind: 'debris', x: h.x, y: h.y, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 20, gravity: 320, life: 1.4, col: fxRng.pick(['#ffd34d', '#e04545', '#5ec8ff', '#8a6a43', '#4fdc7a']), size: 2, toDecal: true, roomId: room(w, h.x, h.y), bounce: 0.35 });
        }
        k.bang(h.x, h.y - 8, 'CLUNK');
      }
      if (i >= 1) drip(w, h.x, h.y + 6, outDir(k), 8 + i * 4, k);
    }));
    applyNudge(k, dt);
  },
  over(k, g) {
    const c = (k.data.cracks ?? 0) as number;
    if (!c || k.n > 1.0) return;
    const { rig } = k;
    const gx = rig.cx + rig.f.x * (rig.half - 1), gy = rig.cy + rig.f.y * (rig.half - 1) - 10;
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
    for (let i = 0; i < c * 4; i++) { const a = i * 1.7, l = 4 + c * 3; g.fillRect(Math.round(gx + Math.cos(a) * l), Math.round(gy + Math.sin(a) * l * 0.6), 1, 1); g.fillRect(Math.round(gx + Math.cos(a) * l * 0.5), Math.round(gy + Math.sin(a) * l * 0.3), 1, 1); }
    g.globalAlpha = 1;
  },
  end(k) {
    const { w, rig } = k;
    const x = rig.cx + rig.f.x * (rig.half + 8), y = rig.cy + rig.f.y * (rig.half + 8);
    w.add(new Pickup({ kind: 'heal', amount: 12, x, y, vx: fxRng.range(-30, 30), vy: 30 }));
    w.add(new Pickup({ kind: 'espresso', amount: 5, x: x + 9, y: y + 2, vx: fxRng.range(10, 40), vy: 20 }));
    w.floatText(rig.cx, rig.cy - 26, 'SNACK DISPENSED', '#ffd34d');
    audio.sfx('vending_buy', { x: rig.cx, y: rig.cy });
  },
};
register('vending_machine', VENDING);

// ---------------------------------------------------------------------------
// FILING CABINET (bonus): head into the drawer, drawer slammed three times, filed
const CABINET: Script = {
  base: () => 1.35,
  caps: ['FILED UNDER: DECEASED', 'PLEASE RETURN TO ORIGINAL FOLDER', 'ARCHIVED. PERMANENTLY.', 'DRAWER 3: RETENTION POLICY'],
  setup(k) { k.focus(k.rig.cx + k.rig.f.x * 6, k.rig.cy + k.rig.f.y * 6 - 10, 2.1); k.data.drawer = 0; },
  tick(k, n, dt) {
    const { rig, w } = k;
    stage(k, n, 0.2);
    k.setP('exec_slam', false);
    k.setV('victim_slam', false);
    k.data.drawer = n > 0.2 && n < 1.1 ? (Math.sin(n * 18) > 0 ? 7 : 1) : 0;
    [0.35, 0.65, 0.95].forEach((s, i) => k.at('slam' + i, s, () => {
      nudge(k, 6);
      k.setV('victim_slam', true); k.setP('exec_slam', true);
      const h = headPt(k);
      audio.sfx('thud', { x: h.x, y: h.y, pitch: 0.7 + i * 0.1 });
      audio.sfx('execution_impact', { x: h.x, y: h.y, vol: 0.7, pitch: 1 + i * 0.1 });
      k.impact(4 + i * 1.5, 0.05 + i * 0.02, 0.6);
      paperBurst(w, h.x, h.y + 6, 12, outDir(k), 3);
      if (i >= 1) drip(w, h.x, h.y + 6, outDir(k), 8, k);
      if (i === 2) k.bang(h.x, h.y - 6, 'FILED');
    }));
    if (k.prop && n > 0.3 && n < 1.1) k.prop.shake = 0.05;
    applyNudge(k, dt);
  },
  over(k, g) {
    const d = (k.data.drawer ?? 0) as number;
    if (!d) return;
    const { rig } = k;
    const x = Math.round(rig.cx + rig.f.x * (rig.half + d * 0.5) - 8), y = Math.round(rig.cy + rig.f.y * (rig.half + d * 0.5) - 6);
    g.fillStyle = '#b8c0c8'; g.fillRect(x, y, 16, 5);
    g.fillStyle = '#6a7480'; g.fillRect(x + 6, y + 1, 4, 1); g.fillRect(x, y + 4, 16, 1);
  },
};
register('filing_cabinet', CABINET);

void clamp;
