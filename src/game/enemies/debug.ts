// Dev-only QA helpers for the enemy AI (used by tools/ai-test.mjs). Stripped from production builds by the DEV guard.
//   __cpSpawn(archetype, tier = 0, dx = 70, dy = 0, aware = true) → Enemy   (spawns near the player in their room)
//   __cpAI.clear()            remove every enemy on the floor
//   __cpAI.chant()            force a room-wide unison chant
//   __cpAI.zones()            the AI zone list (cables, puddles, fields)
//   __cpAI.tiers              per-archetype seniority extras (documentation)
import { app } from '../../core/app';
import { Enemy } from '../enemy';
import { makeEnemy } from '../spawner';
import type { ArchetypeId, Tier } from '../../data/ids';
import { zones, unisonChant, TIER_EXTRAS, isWalkable } from './common';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const scene = () => app.top as any;
  (window as any).__cpSpawn = (archetype: ArchetypeId, tier: Tier = 0, dx = 70, dy = 0, aware = true): Enemy | null => {
    const s = scene();
    if (!s?.world || !s.spawn) return null;
    const w = s.world, p = s.player;
    let x = p.x + dx, y = p.y + dy;
    for (let i = 0; i < 24 && !isWalkable(w, x, y); i++) { const a = i * 0.9; x = p.x + Math.cos(a) * (Math.hypot(dx, dy) || 60); y = p.y + Math.sin(a) * (Math.hypot(dx, dy) || 60); }
    const roomId = Math.max(0, w.roomAt(x, y));
    return makeEnemy(s.spawn, { archetype, tier, roomId }, x, y, aware);
  };
  (window as any).__cpAI = {
    clear(): void {
      const w = scene()?.world;
      if (!w) return;
      for (const a of w.actors) if (a.team === 'enemy') { a.dead = true; for (const r of w.rooms) r.enemies.delete(a); }
      for (const t of w.telegraphs) t.done = true;
      for (const q of scene().spawn.queues.q.values()) q.length = 0;
    },
    chant(): void { const w = scene()?.world; if (w) unisonChant(w, w.actors.filter((a: any) => a instanceof Enemy && a.alive)); },
    zones(): unknown[] { const w = scene()?.world; return w ? zones(w).zones.map((z) => ({ kind: z.kind, x: z.x, y: z.y, t: z.t, owner: z.owner?.archetype })) : []; },
    tiers: TIER_EXTRAS,
    Enemy,
  };
}
