// Presentation patches that live entirely inside the hazards module (no edits to shared files):
//  1. Breach polish (Task C): extra spectacle on top of World.breach() without changing its rules.
//  2. Cinematic execution cutscenes hide the HUD (Hud.render consults world.cutscene.hideHud).
import { World } from '../world';
import type { BreachDef } from '../world-types';
import { TILE } from '../world-types';
import { Hud } from '../../ui/hud';
import { app } from '../../core/app';
import { fxRng } from '../../core/rng';
import { dist } from '../../core/math';
import { debrisBurst, smokePuff, sparks } from '../fx';
import { fieldOf } from './core';
import { ring } from './hazards';

// ---------------------------------------------------------------------------
// 2. HUD hiding for cinematic cutscenes
const hudRender = Hud.prototype.render;
Hud.prototype.render = function (this: Hud, g, w, p, run) {
  if ((w.cutscene as { hideHud?: boolean } | null)?.hideHud) return;
  return hudRender.call(this, g, w, p, run);
};

// ---------------------------------------------------------------------------
// 1. Breach polish. The original World.breach() keeps every rule (BreachDef tiles only, merges exactly two rooms,
// debris stun, aggro, locks). We wrap it and add: a dust cloud, flying rubble chunks, a camera kick (shake + zoom punch +
// nudge), a screen-edge shockwave, STUNNED flags and a "BREACH BONUS +£X" float.
const DUST: Record<BreachDef['material'], string[]> = {
  plaster: ['#e0dccf', '#c9c2b0', '#9c968a'],
  glass: ['#cfe8f4', '#9fd0e6', '#ffffff'],
  cubicle: ['#6a7080', '#8a90a0', '#c8c0b0'],
};

const origBreach = World.prototype.breach;
World.prototype.breach = function (this: World, b, at, dir) {
  const stunnedBefore = new Set<unknown>();
  for (const e of this.actors) if (e.alive && e.status.stun > 0.3) stunnedBefore.add(e);
  origBreach.call(this, b, at, dir);
  try { breachSpectacle(this, b, at, dir, stunnedBefore); } catch (e) { console.error('breach polish failed', e); }
};

function breachSpectacle(w: World, b: BreachDef, at: { x: number; y: number }, dir: number, stunnedBefore: Set<unknown>): void {
  const r = app.renderer;
  const cols = DUST[b.material];
  const xs = b.tiles.map((t) => (t[0] + 0.5) * TILE), ys = b.tiles.map((t) => (t[1] + 0.5) * TILE);
  const cx = xs.reduce((a, c) => a + c, 0) / xs.length, cy = ys.reduce((a, c) => a + c, 0) / ys.length;
  const room = w.roomAt(at.x + Math.cos(dir) * 20, at.y + Math.sin(dir) * 20);
  // dust cloud rolling out of the gap, both sides
  for (let i = 0; i < b.tiles.length; i++) {
    smokePuff(w.particles, xs[i], ys[i], 3, '#d8d0c0', 9);
    smokePuff(w.particles, xs[i] + Math.cos(dir) * 14, ys[i] + Math.sin(dir) * 14, 2, '#c9c2b0', 8);
  }
  fieldOf(w).addBlast(cx, cy, 30 + b.tiles.length * 4, false, '#d8d0c0');
  ring(w, cx, cy - 6, 40 + b.tiles.length * 4, '#e0dccf', 0.45);
  // chunky rubble flung in the direction of travel
  for (let i = 0; i < 16; i++) {
    const a = dir + fxRng.range(-0.9, 0.9), sp = fxRng.range(60, 190);
    w.particles.spawn({ kind: 'debris', x: cx + fxRng.range(-6, 6), y: cy + fxRng.range(-6, 6), z: fxRng.range(6, 22), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: fxRng.range(40, 130), gravity: 340, life: 2.4, col: fxRng.pick(cols), size: fxRng.chance(0.5) ? 3 : 2, toDecal: true, roomId: room, bounce: 0.3 });
  }
  debrisBurst(w.particles, cx, cy, 14, cols, room, b.material === 'glass' ? 'glass' : 'debris');
  sparks(w.particles, cx, cy - 8, 8, '#ffffff', 110);
  // camera kick
  r.shake(9, 0.45);
  r.zoom = Math.max(r.zoom, 1.08);
  r.camX += Math.cos(dir) * 10; r.camY += Math.sin(dir) * 6;
  w.hitstop = Math.max(w.hitstop, 0.08);
  // bonus float (same formula as the cash drop in Enemy.updateThrown)
  const bonus = Math.round(15 * ((w.player as any).stats?.breachCash ?? 1));
  w.floatText(at.x, at.y - 26, `BREACH BONUS +£${bonus}`, '#ffd34d', 2, 1.3);
  w.floatText(at.x, at.y - 40, 'ROOMS MERGED', '#ffffff', 1, 1.1);
  // enemies stunned by the debris
  let n = 0;
  for (const e of w.actors) {
    if (e.team !== 'enemy' || !e.alive || stunnedBefore.has(e) || e.status.stun <= 0.3 || dist(e, at) > 100 || n >= 5) continue;
    w.floatText(e.x, e.y - e.height - 10, 'STUNNED', '#ffe9a0');
    n++;
  }
}
