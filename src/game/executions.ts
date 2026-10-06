// Environmental executions (spec 4.7). Registry by ExecType; the hazards module registers rich cutscenes.
// A generic fallback guarantees every type works. Rules: 1–1.5 s mini cutscene, others paused, player invulnerable,
// cutscene setting Always / First time only / Off (Off plays a brief in-world animation), single-use objects,
// bonus Rage, counts towards execution upgrades.
import type { World, PropRT, Cutscene } from './world';
import type { Actor } from './entity';
import type { ExecType } from '../data/ids';
import { app } from '../core/app';
import { audio } from '../audio/audio';
import { gibBurst, bloodBurst, sparks } from './fx';
import { drawText } from '../render/font';
import { TILE } from './world-types';

export interface ExecTarget { type: ExecType; prop: PropRT | null; tile: [number, number] | null; }

export interface ExecutionImpl {
  /** Build the mini-cutscene. `full` = cinematic version (setting/first-time), else brief in-world version. */
  play(w: World, player: Actor, victim: Actor, target: ExecTarget, full: boolean, done: () => void): Cutscene;
}

export const EXECUTIONS: Partial<Record<ExecType, ExecutionImpl>> = {};
export function registerExecution(type: ExecType, impl: ExecutionImpl): void { EXECUTIONS[type] = impl; }

export const EXEC_NAMES: Record<ExecType, string> = {
  defenestration: 'Defenestration', photocopier: 'Photocopier', server_rack: 'Server Rack', shredder: 'Shredder',
  microwave: 'Microwave', hand_dryer: 'Hand Dryer', water_cooler: 'Water Cooler', vending_machine: 'Vending Machine', filing_cabinet: 'Filing Cabinet',
};

/** Seen execution types (for "First time only"). Persisted via profile by the gameplay scene. */
export const seenExecutions = new Set<string>();

/** Hook for the gameplay scene: rewards, stats, rage, achievements. */
export let onExecutionDone: ((type: ExecType | 'inplace', victim: Actor) => void) | null = null;
export function setExecutionHandler(fn: typeof onExecutionDone): void { onExecutionDone = fn; }

export function canGrab(e: Actor, threshold: number): boolean {
  if (!e.alive || e.grabbedBy || e.thrown) return false;
  const anyE = e as any;
  if (anyE.isBoss) return !!anyE.staggerWindow;
  if (anyE.ungrabbable) return false;
  return e.staggered > 0 || e.hpFrac <= threshold || e.status.stun > 0.2;
}

export function startExecution(w: World, player: Actor, victim: Actor, target: ExecTarget): void {
  const mode = app.settings.cutscenes;
  const full = mode === 'always' || (mode === 'first' && !seenExecutions.has(target.type));
  seenExecutions.add(target.type);
  victim.grabbedBy = player;
  player.invuln = 99;
  const impl = EXECUTIONS[target.type] ?? genericExecution;
  const finish = () => {
    player.invuln = 0.6;
    victim.grabbedBy = null;
    victim.executed = true;
    if (target.prop) { target.prop.used = true; w.setPropState(target.prop, 'used'); }
    if (victim.alive) w.damage(victim, { amount: 99999, type: 'crush', method: 'execution', source: player, unavoidable: true, hazardKind: target.type });
    onExecutionDone?.(target.type, victim);
    w.bus.emit('execution', { type: target.type, victim });
  };
  w.cutscene = impl.play(w, player, victim, target, full, finish);
  audio.music.duck(0.5, 1.2);
}

/** Fallback: generic slam with zoom + caption; used until a bespoke cutscene is registered. */
export const genericExecution: ExecutionImpl = {
  play(w, player, victim, target, full, done) {
    const dur = full ? 1.25 : 0.55;
    let t = 0;
    let hit = false;
    const tx = target.prop ? target.prop.def.x : target.tile ? (target.tile[0] + 0.5) * TILE : victim.x;
    const ty = target.prop ? target.prop.def.y - 8 : target.tile ? (target.tile[1] + 0.5) * TILE : victim.y;
    const sx = victim.x, sy = victim.y;
    player.setAnim('exec_slam', true);
    victim.setAnim('victim_slam', true);
    let finished = false;
    const end = () => { if (!finished) { finished = true; done(); } };
    return {
      abort: end,
      camera: full ? { x: (player.x + tx) / 2, y: (player.y + ty) / 2 - 8 } : undefined,
      zoom: full ? 1.6 : 1,
      update(dt) {
        t += dt;
        player.animT += dt; victim.animT += dt;
        const p = Math.min(1, t / (dur * 0.45));
        victim.x = sx + (tx - sx) * p * 0.7; victim.y = sy + (ty - sy) * p * 0.7;
        if (!hit && t >= dur * 0.45) {
          hit = true;
          app.renderer.shake(7, 0.3);
          app.input.rumble(1, 0.8, 200);
          audio.sfx('execution_impact', { x: tx, y: ty });
          if (target.type === 'server_rack') { sparks(w.particles, tx, ty - 10, 26, '#9fe8ff', 160); audio.sfx('electric_zap', { x: tx, y: ty }); }
          else if (target.type === 'defenestration') { if (target.tile) w.smashWindow(target.tile[0], target.tile[1]); }
          else bloodBurst(w.particles, tx, ty, Math.atan2(ty - sy, tx - sx), 22, w.roomAt(tx, ty));
          if (target.type === 'shredder' || target.type === 'defenestration') { if (victim.baked) gibBurst(w.particles, victim.baked.gibs, tx, ty, 0, w.roomAt(tx, ty), 0.6); victim.dismembered = true; }
          w.hitstop = 0.12;
        }
        if (t >= dur) { end(); return true; }
        return false;
      },
      renderScreen(g) {
        if (!full) return;
        const r = app.renderer;
        const bar = Math.round(Math.min(1, t * 6) * 26);
        g.fillStyle = '#000'; g.fillRect(0, 0, r.W, bar); g.fillRect(0, r.H - bar, r.W, bar);
        if (hit) drawText(g, (EXEC_NAMES[target.type] ?? 'EXECUTION').toUpperCase(), r.W / 2, r.H - 20, { align: 'center', color: '#ffd34d', scale: 1, outline: '#000' });
      },
    };
  },
};
