// Boot: decides the first scene. Integration point — updated as scenes land.
import { app, Scene } from '../core/app';
import { drawText } from '../render/font';
import { rect } from '../render/canvas';
import { DEV_SCENES } from './dev/registry';

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

export function boot(): void {
  const m = /dev=([\w-]+)/.exec(location.hash);
  const dev = m && DEV_SCENES.get(m[1]);
  app.reset(dev ? dev() : new FontTestScene());
}
