// DEV ONLY: boss art gallery for visual QA (open with #dev=bosses&b=fm&p=0). Registered from the bosses
// folder because the boss team owns only src/game/bosses/** and src/art/bosses/**.
import { app, Scene } from '../../core/app';
import { registerDev } from '../../scenes/dev/registry';
import { drawText } from '../../render/font';
import type { BossArt } from '../../art/bosses/bake';
import { BOSS_ARTS, BOSS_PROPS_GALLERY } from '../../art/bosses/index';

function hp(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) { const [k, v] = part.split('='); if (k) o[k] = v ?? ''; }
  return o;
}

class BossGallery implements Scene {
  name = 'boss-gallery';
  t = 0;
  art: BossArt | null;
  page: number;
  key: string;
  constructor() {
    const h = hp();
    this.key = h.b || 'fm';
    this.page = Number(h.p || 0);
    this.art = BOSS_ARTS[this.key]?.() ?? null;
  }
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = app.renderer, g = r.f;
    g.fillStyle = '#5a5e66'; g.fillRect(0, 0, r.W, r.H);
    for (let y = 0; y < r.H; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < r.W; x += 32) { g.fillStyle = '#62666e'; g.fillRect(x, y, 16, 16); }
    if (this.key === 'props') { BOSS_PROPS_GALLERY(g, this.t, this.page); return; }
    const a = this.art;
    if (!a) { drawText(g, 'unknown boss ' + this.key, 10, 10); return; }
    const names = Object.keys(a.anims);
    const per = 8;
    const list = names.slice(this.page * per, this.page * per + per);
    list.forEach((n, i) => {
      const x = 40 + i * 78;
      drawText(g, n, x, 4, { align: 'center', color: '#fff', outline: '#000' });
      [0, 1, 2, 3].forEach((dir, j) => {
        if (j === 3) return;
        const y = 104 + j * 118;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 14, y - 2, 28, 4);
        a.draw(g, n, dir, this.t, x, y);
      });
    });
  }
}

registerDev('bosses', () => new BossGallery());
