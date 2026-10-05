// Visual QA galleries for item / icon art: dev=items, dev=icons, dev=prompts.
// Optional hash params: &z=<zoom> &p=<page>
import { app } from '../../core/app';
import type { Scene } from '../../core/app';
import { drawText } from '../../render/font';
import type { Ctx, Sprite } from '../../render/canvas';
import { rect, drawSprite } from '../../render/canvas';
import { registerDev } from './registry';
import { weaponSprite, weaponIcon, icon, deskItemIcon, projectileSprite, promptGlyph, pickupSprite, cursorSprite, ICON_NAMES } from '../../art/items';
import type { PickupKind, ProjectileKind } from '../../art/items';
import { WEAPON_IDS } from '../../data/tables';
import { DESK_ITEMS } from '../../data/deskitems';
import type { Device } from '../../core/input';

function sparam(name: string): string {
  const m = new RegExp('[&#]' + name + '=([\\w-]+)').exec(location.hash);
  return m ? m[1] : '';
}
function param(name: string, def: number): number {
  const m = new RegExp('[&#]' + name + '=(\\d+)').exec(location.hash);
  return m ? +m[1] : def;
}

const BGS = ['#6e7f86', '#b9ad95', '#2a2f3b'];

function zoomSprite(g: Ctx, s: Sprite, x: number, y: number, z: number): void {
  g.drawImage(s.img, 0, 0, s.w, s.h, x - s.ox * z, y - s.oy * z, s.w * z, s.h * z);
}

interface Cell { label: string; draw: (g: Ctx, x: number, y: number, w: number, h: number, z: number) => void }

class GalleryScene implements Scene {
  constructor(public name: string, private title: string, private cells: Cell[], private cw: number, private ch: number) {}
  update(): void {}
  render(): void {
    const r = app.renderer, g = r.f;
    const z = param('z', 2), page = param('p', 0), bg = BGS[param('bg', 0) % BGS.length];
    rect(g, 0, 0, r.W, r.H, bg);
    const cw = this.cw, ch = this.ch;
    const f = sparam('f');
    const cells = f ? this.cells.filter((c) => c.label.includes(f)) : this.cells;
    const cw2 = Math.max(cw, 16 * z + 8), ch2 = Math.max(ch, 16 * z + 18);
    const cols = Math.floor(r.W / cw2), rows = Math.floor((r.H - 14) / ch2), per = cols * rows;
    drawText(g, `${this.title} ${cells.length}  page ${page}/${Math.ceil(cells.length / per) - 1}  z${z}`, 4, 2, { color: '#fff' });
    cells.slice(page * per, (page + 1) * per).forEach((c, i) => {
      const cx = (i % cols) * cw2, cy = 14 + Math.floor(i / cols) * ch2;
      rect(g, cx + 1, cy + 1, cw2 - 2, ch2 - 2, 'rgba(255,255,255,0.12)');
      c.draw(g, cx, cy, cw2, ch2, z);
      drawText(g, c.label.slice(0, Math.floor((cw2 - 4) / 6)), cx + 3, cy + ch2 - 10, { color: '#fff' });
    });
  }
}

// ---------------------------------------------------------------- weapons
const weaponCells: Cell[] = WEAPON_IDS.map((id) => ({
  label: id,
  draw: (g, cx, cy, cw, ch, z) => {
    const ic = weaponIcon(id), s = weaponSprite(id);
    const iz = Math.max(1, Math.min(z, 3));
    g.drawImage(ic, cx + 3, cy + 3, 16 * iz, 16 * iz);
    const hx = cx + 16 * iz + 12, hy = cy + 3 + 8 * iz;
    zoomSprite(g, s, hx, hy, iz);
    rect(g, hx - 1, hy - 1, 2, 2, '#ffffff');
    drawSprite(g, s, cx + cw - 12, cy + 8);
    g.drawImage(ic, cx + cw - 20, cy + ch - 20);
  },
}));
registerDev('items', () => new GalleryScene('dev-items', 'weapons', weaponCells, 128, 51));

// ---------------------------------------------------------------- icons
const PROJ: ProjectileKind[] = ['staple', 'nail', 'laser', 'beam', 'calc', 'tape', 'confetti', 'phone', 'stapler_thrown', 'contract', 'toolbox', 'binder', 'scream', 'golf_ball', 'paper', 'coffee', 'invite', 'pen'];
const PICK: PickupKind[] = ['cash_coin', 'cash_note', 'cash_bundle', 'heal_biscuit', 'heal_sandwich', 'heal_firstaid', 'espresso', 'leave_token', 'ammo_box', 'hr_file', 'benefit_envelope', 'desk_item_box', 'rage_mod', 'repair_tape', 'key_card'];

const iconCells: Cell[] = [
  ...ICON_NAMES.map((n): Cell => ({ label: n.replace('policy_', 'p_').replace('reward_', 'r_'), draw: (g, cx, cy, cw, _ch, z) => { g.drawImage(icon(n), cx + 3, cy + 3, 16 * z, 16 * z); g.drawImage(icon(n), cx + cw - 20, cy + 3); } })),
  ...DESK_ITEMS.map((d): Cell => ({ label: d.id, draw: (g, cx, cy, cw, _ch, z) => { g.drawImage(deskItemIcon(d.id), cx + 3, cy + 3, 16 * z, 16 * z); g.drawImage(deskItemIcon(d.id), cx + cw - 20, cy + 3); } })),
  ...PICK.map((k): Cell => ({ label: k, draw: (g, cx, cy, cw, _ch, z) => { const s = pickupSprite(k); zoomSprite(g, s, cx + 10 + 8 * z, cy + 4 + 16 * z, z); drawSprite(g, s, cx + cw - 12, cy + 20); } })),
  ...PROJ.map((k): Cell => ({ label: k, draw: (g, cx, cy, cw, _ch, z) => { const s = projectileSprite(k); zoomSprite(g, s, cx + 10 + 8 * z, cy + 3 + 8 * z, s.w <= 10 && s.h <= 8 ? z * 2 : z); drawSprite(g, s, cx + cw - 12, cy + 14); } })),
  { label: 'aim', draw: (g, cx, cy, cw, _ch, z) => { const s = cursorSprite('aim'); zoomSprite(g, s, cx + 20, cy + 20, z); drawSprite(g, s, cx + cw - 12, cy + 14); } },
  { label: 'pointer', draw: (g, cx, cy, cw, _ch, z) => { const s = cursorSprite('pointer'); zoomSprite(g, s, cx + 12, cy + 6, z); drawSprite(g, s, cx + cw - 14, cy + 8); } },
];
registerDev('icons', () => new GalleryScene('dev-icons', 'icons', iconCells, 80, 52));

// ---------------------------------------------------------------- prompts
class PromptsScene implements Scene {
  name = 'dev-prompts';
  update(): void {}
  render(): void {
    const r = app.renderer, g = r.f;
    const z = param('z', 1);
    rect(g, 0, 0, r.W, r.H, BGS[param('bg', 0) % BGS.length]);
    const sets: [Device, string[]][] = [
      ['kbm', ['E', 'F', 'R', 'Q', 'Space', 'Esc', 'LShift', 'LCtrl', 'LAlt', 'Tab', 'Enter', 'Bksp', 'W', 'A', 'S', 'D', '↑', '↓', '←', '→', '1', '2', 'LMB', 'RMB', 'MMB', 'M4']],
      ['xbox', ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'View', 'Menu', 'LB+RB', 'LT+RT']],
      ['playstation', ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Share', 'Options', 'L1+R1']],
      ['pad', ['B1', 'B2', 'B3', 'B4', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'D↑', 'D→', 'Select', 'Start', 'Home', 'L1+R1']],
    ];
    let y = 4;
    for (const [dev, labels] of sets) {
      drawText(g, dev, 4, y, { color: '#fff' });
      y += 12;
      let x = 4;
      for (const l of labels) {
        const c = promptGlyph(l, dev);
        if (x + c.width * z + 6 > r.W) { x = 4; y += 14 * z + 8; }
        g.drawImage(c, x, y, c.width * z, c.height * z);
        x += c.width * z + 6;
      }
      y += 14 * z + 14;
    }
    // inline usage sample
    drawText(g, 'Press', 4, y + 3, { color: '#fff' });
    g.drawImage(promptGlyph('E', 'kbm'), 36, y);
    drawText(g, 'to interact   Hold', 54, y + 3, { color: '#fff' });
    g.drawImage(promptGlyph('LB+RB', 'xbox'), 164, y);
    drawText(g, 'to rage', 206, y + 3, { color: '#fff' });
  }
}
registerDev('prompts', () => new PromptsScene());
