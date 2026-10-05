// Boot: decides the first scene. Integration point — updated as scenes land.
import { app, Scene } from '../core/app';
import { drawText } from '../render/font';
import { rect } from '../render/canvas';
import { DEV_SCENES } from './dev/registry';
import '../game/autoload';
import { GameplayScene } from './gameplay';
import { newRun, planFloor } from '../game/run';
import { codeToSeed, randomSeed } from '../core/rng';
import { touch } from '../ui/touch';
import type { PlayerRoleId } from '../data/ids';

// Auto-load every dev gallery module (each calls registerDev).
import.meta.glob('./dev/*.ts', { eager: true });

class FontTestScene implements Scene {
  name = 'fonttest';
  update(): void {}
  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#1c5e7a');
    drawText(g, 'COMPANY POLICY', r.W / 2, 40, { scale: 3, align: 'center', color: '#ffd34d' });
    drawText(g, 'Dev scenes: ' + [...DEV_SCENES.keys()].join(', '), 20, 100);
  }
}

/** Parse hash params like #play&seed=XXXX-XXXX&floor=5&role=temp */
export function hashParams(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) { const [k, v] = part.split('='); if (k) out[k] = v ?? ''; }
  return out;
}

export function boot(): void {
  touch.attach(app.renderer.screen);
  const h = hashParams();
  const dev = h.dev && DEV_SCENES.get(h.dev);
  if (dev) { app.reset(dev()); return; }
  if ('play' in h) {
    const seed = (h.seed && codeToSeed(h.seed)) || (h.seed ? Number(h.seed) : randomSeed());
    const run = newRun({ seed, role: (h.role as PlayerRoleId) || 'office_worker' });
    if (h.floor) {
      const f = Number(h.floor);
      run.plan = planFloor(run, f, 0, { reward: 'weapon', type: (h.type as any) || 'standard' });
      run.floor = f;
    }
    app.reset(new GameplayScene(run));
    return;
  }
  app.reset(new FontTestScene());
}
