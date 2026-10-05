// Boot: decides the first scene. Integration point — updated as scenes land.
import { app, Scene } from '../core/app';
import { drawText } from '../render/font';
import { rect } from '../render/canvas';

class FontTestScene implements Scene {
  name = 'fonttest';
  update(): void {}
  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#1c5e7a');
    drawText(g, 'COMPANY POLICY', r.W / 2, 40, { scale: 3, align: 'center', color: '#ffd34d' });
    drawText(g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 20, 100);
    drawText(g, 'abcdefghijklmnopqrstuvwxyz £€ !?.,;:\'"()[]{}<>/\\|@#$%^&*-+=_~', 20, 114);
    drawText(g, 'The quick brown fox jumps over the lazy dog. Synergy, going forward!', 20, 128);
  }
}

export function boot(): void {
  app.reset(new FontTestScene());
}
