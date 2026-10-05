// Pause overlay ("Screen Locked"): resume, run info (seed, benefits, desk items), Control Panel, save & quit.
import { app, Scene } from '../core/app';
import { drawText, drawWrapped } from '../render/font';
import { audio } from '../audio/audio';
import type { GameplayScene } from './gameplay';
import { SettingsScene } from './settings';
import { deskItemIcon, icon } from '../art/items';
import { DESK_ITEMS } from '../data/deskitems';
import { saveVersioned } from '../core/storage';
import { RUN_VERSION } from '../game/run';
import { SCENES } from '../game/registry';
import { BENEFIT_INFO } from '../game/content-info';

export class PauseScene implements Scene {
  name = 'pause';
  transparent = true;
  sel = 0;
  items: { label: string; act: () => void }[];
  constructor(private s: GameplayScene) {
    this.items = [
      { label: 'Resume', act: () => this.close() },
      { label: 'Control Panel', act: () => app.push(new SettingsScene(() => app.pop(), { inGame: true })) },
      { label: 'Save & Quit to Car Park', act: () => this.saveQuit() },
      { label: 'Abandon Run (Resign)', act: () => this.abandon() },
    ];
  }
  enter(): void { audio.setPaused(true); audio.sfx('ui_select'); }
  exit(): void { audio.setPaused(false); }
  resume(): void { app.saveSettings(); }

  close(): void { audio.sfx('ui_back'); app.pop(); }

  saveQuit(): void {
    // suspend from the start of this floor (spec 10.3)
    try { saveVersioned('suspend', RUN_VERSION, JSON.parse(this.s.floorStartJson)); } catch { /* */ }
    const hub = SCENES.hub?.() ?? SCENES.mainMenu?.();
    if (hub) app.reset(hub);
  }

  abandon(): void {
    app.pop();
    this.s.player.hp = 0;
    this.s.world.damage(this.s.player, { amount: 9999, type: 'blunt', method: 'other', unavoidable: true });
  }

  update(): void {
    const i = app.input;
    if (i.pressed('pause') || i.pressed('back')) { this.close(); return; }
    if (i.pressed('up')) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('ui_move'); }
    if (i.pressed('down')) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('ui_move'); }
    if (i.pressed('confirm')) { audio.sfx('ui_select'); this.items[this.sel].act(); }
    for (const c of i.clicks) {
      this.items.forEach((it, k) => { const y = this.itemY(k); if (c.y >= y - 2 && c.y < y + 12 && c.x >= 30 && c.x < 200) { this.sel = k; it.act(); } });
    }
  }
  private itemY(k: number): number { return 70 + k * 16; }

  render(): void {
    const r = app.renderer, g = r.f, W = r.W, H = r.H;
    g.fillStyle = 'rgba(8,10,16,0.82)'; g.fillRect(0, 0, W, H);
    drawText(g, 'SCREEN LOCKED', 30, 30, { scale: 2, color: '#ffd34d', outline: '#000' });
    drawText(g, 'Press Resume to unlock your workstation.', 30, 52, { color: '#a0a8b8' });
    this.items.forEach((it, k) => {
      const y = this.itemY(k), on = k === this.sel;
      if (on) { g.fillStyle = '#ffd34d'; g.fillRect(26, y - 3, 180, 13); }
      drawText(g, it.label, 32, y, { color: on ? '#1a1a1e' : '#e8e8e8', shadow: on ? null : undefined });
    });
    const run = this.s.run;
    const x = Math.max(230, W / 2 - 60);
    drawText(g, `RUN ${run.seedCode}${run.daily ? '  (DAILY)' : run.seeded ? '  (SEEDED)' : ''}`, x, 30, { color: '#9fb7c4' });
    drawText(g, `Floor ${run.floor} · Act ${run.plan.act} · ${run.log.kills} kills · £${run.pettyCash}`, x, 42, { color: '#c8c8c8' });
    drawText(g, 'BENEFITS', x, 62, { color: '#ffd34d' });
    let y = 74;
    for (const b of run.benefits.slice(0, 10)) {
      const info = BENEFIT_INFO(b.id);
      g.drawImage(icon(('dept_' + (info?.dept ?? 'hr')) as any), x, y - 3);
      drawText(g, info?.name ?? b.id, x + 18, y, { color: ['#c9cdd4', '#5ec8ff', '#ffc53d'][b.rarity] });
      y += 13;
    }
    if (!run.benefits.length) { drawText(g, 'None yet.', x, y, { color: '#707070' }); y += 13; }
    drawText(g, 'DESK ITEMS', x, y + 6, { color: '#9be37b' });
    y += 18;
    let ix = x;
    for (const id of run.deskItems) {
      g.drawImage(deskItemIcon(id), ix, y);
      ix += 18;
      if (ix > W - 30) { ix = x; y += 18; }
    }
    if (!run.deskItems.length) drawText(g, 'None yet.', x, y, { color: '#707070' });
    const hint = run.deskItems.length ? DESK_ITEMS.find((d) => d.id === run.deskItems[run.deskItems.length - 1]) : null;
    if (hint) drawWrapped(g, `${hint.name}: ${hint.desc}`, x, H - 30, W - x - 20, { color: '#a0a0a0' });
  }
}
