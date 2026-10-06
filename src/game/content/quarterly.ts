// Quarterly Targets (spec 7.4 Performance Review modifier, rank 1-3): a per-floor timer on combat floors. Once the timer runs out the
// floor is "over target" and a reinforcement wave is dropped into the room the player is fighting in every WAVE_EVERY seconds,
// until the floor is cleared. Cosmetic-only reward economy is unchanged: this only ever makes a run harder.
//
//   limit  = (BASE_LIMIT - RANK_STEP * rank) * budgetScale(enemy_budget)         (see limitFor)
//   waves  = composeRoom() roster for ~25% of the floor budget (+25% per extra rank), capped by MAX_ACTIVE_ENEMIES per room
//
// The timer is a Ticker entity, so it freezes during cutscenes automatically (World.update returns before updating entities
// while a cutscene runs) and stops when the floor clears. State for QA / other modules lives on `s.data.quarterly`.
import { FLOOR_HOOKS } from '../registry';
import { drawPanel, bar } from '../../ui/hud';
import { drawText } from '../../render/font';
import { app, MAX_ACTIVE_ENEMIES } from '../../core/app';
import type { Ctx } from '../../render/canvas';
import type { World } from '../world';
import type { Player } from '../player';
import type { RunState } from '../run';
import { audio } from '../../audio/audio';
import { notify } from '../../ui/corpos';
import { composeRoom, isCombatRoom, makeEnemy } from '../spawner';
import { smokePuff } from '../fx';
import { dist } from '../../core/math';
import { S, tick, on } from './common';

/** Seconds on the clock for a rank-0 floor before enemy-budget scaling (rank r subtracts RANK_STEP * r). */
export const QT_BASE_LIMIT = 150;
export const QT_RANK_STEP = 25;
/** Seconds between reinforcement waves once the target is missed. */
export const QT_WAVE_EVERY = 20;
/** Floor types the modifier applies to (combat floors only: no boss, shop, event, treasure, lift ambush or director). */
const QT_FLOORS = new Set(['standard', 'elite', 'challenge']);

export interface QuarterlyState {
  rank: number;
  /** Seconds elapsed on the floor timer (does not advance in cutscenes). */
  t: number;
  limit: number;
  over: boolean;
  /** Seconds since the target was missed, or since the last wave. */
  sinceWave: number;
  waves: number;
  /** Total enemies spawned by reinforcement waves on this floor. */
  spawned: number;
  done: boolean;
}
export const quarterlyOf = (s: S): QuarterlyState | undefined => s.data.quarterly as QuarterlyState | undefined;

/** Time limit for a floor: shorter per rank, longer when the floor carries a bigger enemy budget (8 + 3 per floor). */
export function limitFor(rank: number, enemyBudget: number): number {
  const base = QT_BASE_LIMIT - QT_RANK_STEP * rank;
  const scale = Math.min(1.5, Math.max(0.75, 0.75 + (enemyBudget - 11) / 60));
  return Math.max(45, Math.round(base * scale));
}

const mmss = (t: number): string => { const n = Math.max(0, Math.ceil(t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

/** Draw an extra HUD strip by wrapping this floor's Hud.render (the Hud instance is per floor). Same technique as challenge.ts. */
function hudStrip(s: S, draw: (g: Ctx, cx: number, y: number) => void): void {
  const hud = s.hud;
  const orig = hud.render.bind(hud) as (g: Ctx, w: World, p: Player, run: RunState) => void;
  hud.render = (g: Ctx, w: World, p: Player, run: RunState) => {
    orig(g, w, p, run);
    const r = app.renderer;
    // a challenge floor already uses the top-centre strip: sit underneath it
    draw(g, Math.round(r.W / 2), 5 + r.safe.t + (s.data.challenge ? 28 : 0));
  };
}

/** The combat room reinforcements should land in: the player's room, else the nearest combat room. */
function targetRoom(s: S): number {
  const w = s.world;
  const cur = w.currentRoom;
  if (cur >= 0 && isCombatRoom(w.map.rooms[cur])) return cur;
  let best = -1, bd = Infinity;
  for (const r of w.map.rooms) {
    if (!isCombatRoom(r)) continue;
    const rc = w.roomRect(r.id);
    const d = dist({ x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 }, w.player);
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}

/** Spawn one reinforcement wave; returns how many enemies arrived (0 when the room is already at the active cap). */
export function spawnWave(s: S, q: QuarterlyState): number {
  const w = s.world;
  const roomId = targetRoom(s);
  if (roomId < 0) return 0;
  const ctx = s.spawn;
  const room = w.map.rooms[roomId];
  const room_free = MAX_ACTIVE_ENEMIES - w.liveEnemies(roomId);
  if (room_free <= 0 || !room.spawnPoints.length) return 0;
  const budget = Math.max(3, Math.round(s.plan.enemy_budget * 0.25 * (1 + 0.25 * (q.rank - 1))));
  const roster = composeRoom(ctx.rng, s.plan, budget, { elite: false }).slice(0, room_free);
  // arrive through the spawn points furthest from the player (like updateReinforcements)
  const pts = [...room.spawnPoints].sort((a, b) => dist(b, w.player) - dist(a, w.player));
  let n = 0;
  for (const o of roster) {
    const p = pts[n % pts.length];
    const x = p.x + ctx.rng.range(-3, 3), y = p.y + ctx.rng.range(-3, 3);
    smokePuff(w.particles, p.x, p.y - 6, 8, '#d0d4dc', 6);
    makeEnemy(ctx, { archetype: o.arch.id, tier: o.tier, roomId }, x, y, true);
    n++;
  }
  if (n) audio.sfx('purchase_order', { x: w.player.x, y: w.player.y, vol: 0.6 });
  return n;
}

FLOOR_HOOKS.push((s) => {
  const rank = Math.min(3, Math.max(0, Math.round(s.run.modifiers?.quarterly_targets ?? 0)));
  if (rank <= 0 || !QT_FLOORS.has(s.plan.floor_type)) return;
  const q: QuarterlyState = { rank, t: 0, limit: limitFor(rank, s.plan.enemy_budget), over: false, sinceWave: 0, waves: 0, spawned: 0, done: false };
  s.data.quarterly = q;
  const w = s.world;
  on(s, 'floorClear', () => { q.done = true; });
  tick(s, (dt) => {
    if (q.done || w.floorCleared) return;
    q.t += dt;
    if (!q.over) {
      if (q.t < q.limit) return;
      q.over = true;
      q.sinceWave = QT_WAVE_EVERY; // first wave lands straight away
      notify({ kind: 'warn', title: 'Quarterly targets missed', body: 'Head office is sending reinforcements. Performance will be discussed.', tag: 'quarterly', duration: 5 });
      s.hud.showBanner('QUARTERLY TARGETS MISSED', `Reinforcements every ${QT_WAVE_EVERY} seconds until the floor is cleared.`, '#ff6a5a', 3);
    }
    q.sinceWave += dt;
    if (q.sinceWave >= QT_WAVE_EVERY) {
      const n = spawnWave(s, q);
      if (n > 0) { q.sinceWave = 0; q.waves++; q.spawned += n; notify({ kind: 'warn', title: 'Quarterly targets missed', body: 'Reinforcements have arrived.', tag: 'quarterly', duration: 3 }); }
      else q.sinceWave = QT_WAVE_EVERY - 2; // room is at the active cap or between rooms: retry shortly
    }
  });
  hudStrip(s, (g, cx, y) => {
    const left = Math.max(0, q.limit - q.t);
    const frac = left / q.limit;
    const pw = 150;
    const x = cx - pw / 2;
    drawPanel(g, x, y, pw, 25, q.over && !q.done ? '#2a0e0e' : 'rgba(10,12,18,0.78)');
    const blink = Math.floor(app.time * 6) % 2 === 0;
    const col = q.done ? '#8af0a0' : q.over ? (blink ? '#ff6a5a' : '#ffd34d') : frac < 0.2 ? (blink ? '#ff6a5a' : '#ffd34d') : frac < 0.4 ? '#ffd34d' : '#ffffff';
    drawText(g, 'QUARTERLY TARGET', x + 5, y + 3, { color: '#ffd34d', shadow: null });
    drawText(g, q.done ? 'MET' : q.over ? '+' + mmss(q.t - q.limit) : mmss(left), x + pw - 5, y + 3, { color: col, align: 'right', shadow: null });
    if (q.over && !q.done) {
      const nxt = Math.max(0, QT_WAVE_EVERY - q.sinceWave);
      bar(g, x + 4, y + 15, pw - 8, 5, 1 - nxt / QT_WAVE_EVERY, '#ff4a3a', '#14202a');
    } else bar(g, x + 4, y + 15, pw - 8, 5, q.done ? 1 : frac, q.done ? '#4fdc7a' : frac < 0.2 ? '#ff4a3a' : frac < 0.4 ? '#ffb000' : '#5ec8ff', '#14202a');
  });
});
