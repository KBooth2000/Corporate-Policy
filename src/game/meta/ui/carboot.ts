// Car boot: choose your starting role and loadout (spec 7.3), plus cosmetic outfit / title / decor from KPI rewards (spec 7.4).
// Roles change the starting kit and a twist, never raw power. The loadout swaps Standard-tier weapons into free slots.
import { audio } from '../../../audio/audio';
import { Ctx } from '../../../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../../../render/font';
import { Widget, Ui, List, Heading, Label, Choice, Toggle, Spacer } from '../../../ui/widgets';
import { C, box, well, ink, drawGlyph, uiS, truncate, RectL } from '../../../ui/style';
import { ROLES, WEAPONS } from '../../../data/tables';
import type { PlayerRoleId } from '../../../data/ids';
import { profile, saveProfile } from '../../profile';
import { isRoleUnlocked, isWeaponUnlocked, roleCondition, checkRoleUnlocks } from '../catalogue';
import { meta } from '../prefs';
import { LOCKED_SLOT } from '../runs';
import { COSMETICS, ownedCosmetics } from '../cosmetics';
import { PanelScene } from './panel';
import { rolePortrait } from './vending';

const ROLE_ORDER: PlayerRoleId[] = ['office_worker', 'temp', 'night_cleaner', 'contractor', 'ex_employee'];

export function roleKit(id: PlayerRoleId): string {
  const r = ROLES[id];
  const names: string[] = [];
  names.push(r.melee ? (r.melee === 'fists' ? 'Bare fists' : WEAPONS[r.melee]?.name ?? r.melee) : '');
  if (r.ranged) names.push(WEAPONS[r.ranged]?.name ?? r.ranged);
  for (const t of r.throwables) names.push(WEAPONS[t]?.name ?? t);
  return names.filter(Boolean).join(', ') || 'Nothing. Not even a lanyard.';
}

export function roleTwists(id: PlayerRoleId): string[] {
  const r = ROLES[id], out: string[] = [];
  if (r.hpMult !== 1) out.push(`${r.hpMult < 1 ? 'Lower' : 'Higher'} HP (x${r.hpMult})`);
  if (r.rageFillMult !== 1) out.push(`Rage fills ${Math.round((r.rageFillMult - 1) * 100)}% faster`);
  if (r.hazardMult !== 1) out.push(`Hazard damage x${r.hazardMult}`);
  if (r.ammoMult !== 1) out.push(`Ammunition x${r.ammoMult}`);
  if (r.shieldRegen === 0) out.push('No Wellbeing regeneration');
  if (r.startsInRage) out.push('Starts every floor in Rage');
  if (!r.shops) out.push('No shops');
  if (!out.length) out.push('Balanced');
  return out;
}

class RoleRow extends Widget {
  constructor(public id: PlayerRoleId, public owner: BootPanel) { super(); }
  override layout(): void { this.h = this.owner.roleRowH(); }
  override activate(): void { this.press = 1; this.owner.pick(this.id); }
  override draw(g: Ctx): void {
    const r = ROLES[this.id], s = uiS();
    const unlocked = isRoleUnlocked(this.id), sel = profile().selectedRole === this.id && unlocked;
    const x = this.x, y = this.y, w = this.w, h = this.h;
    g.fillStyle = this.focused ? '#fff3c4' : sel ? '#e3f1e6' : this.hovered ? '#f6f2e4' : '#f3f0e6';
    g.fillRect(x, y, w, h - 2);
    g.fillStyle = sel ? '#2c8a50' : this.focused ? C.amber : 'rgba(0,0,0,0)'; g.fillRect(x, y, 3, h - 2);
    g.fillStyle = C.faceLo; g.fillRect(x, y + h - 2, w, 1);
    const pw = Math.min(h - 6, 30);
    well(g, x + 7, y + Math.round((h - 2 - pw) / 2), pw, pw, unlocked ? '#dfe8f2' : '#b8b4a8');
    const pt = rolePortrait(this.id);
    g.globalAlpha = unlocked ? 1 : 0.35;
    g.drawImage(pt, Math.round(x + 7 + (pw - 24) / 2), Math.round(y + (h - 2 - 24) / 2), 24, 24);
    g.globalAlpha = 1;
    const tx = x + 7 + pw + 8;
    ink(g, truncate(r.name, w - (tx - x) - 82, s), tx, y + 4, { scale: s, color: unlocked ? C.navy : C.inkDim });
    const c = roleCondition(this.id);
    const line = unlocked ? roleKit(this.id) : `Locked: ${c.label} (${Math.min(c.have, c.need)}/${c.need})`;
    ink(g, truncate(line, w - (tx - x) - 10), tx, y + 4 + LINE_H * s + 1, { color: unlocked ? C.inkDim : '#a82828' });
    const label = !unlocked ? 'LOCKED' : sel ? 'SELECTED' : 'SELECT';
    const cw = measure(label) + 14, chH = 12;
    const cx = x + w - cw - 6, cy = y + 4;
    box(g, cx, cy, cw, chH, { face: !unlocked ? '#59627a' : sel ? '#2c8a50' : C.navyHi, cham: 1, depth: 1 });
    if (!unlocked) drawGlyph(g, 'lock', cx + 7, cy + chH / 2, '#fff', 1);
    drawText(g, label, cx + cw / 2 + (!unlocked ? 4 : 0), cy + 3, { color: '#fff', align: 'center', shadow: 'rgba(0,0,0,0.4)' });
  }
}

export class BootPanel extends PanelScene {
  override name = 'carboot';
  private roles = new List();
  private opts = new List();
  private detail: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private rowsR: RoleRow[] = [];

  constructor(onClose?: () => void) {
    super({ title: 'Car Boot - Starting Role and Loadout', glyph: 'folder', w: 620, h: 350, closeText: 'Shut the boot', onClose });
    checkRoleUnlocks(true);
    this.rowsR = ROLE_ORDER.map((id) => new RoleRow(id, this));
    this.roles.setItems(this.rowsR);
    this.ui.add(this.roles); this.ui.add(this.opts);
    this.buildOptions();
    this.finishBuild();
    this.ui.setFocus(this.rowsR.find((r) => r.id === profile().selectedRole) ?? this.rowsR[0]);
    this.statusText = 'Roles change what you start with, never how strong you are.';
  }

  roleRowH(): number { return uiS() === 2 ? 52 : this.ui.focus && (this.ui.focus as Widget).h > 40 ? 40 : 38; }

  pick(id: PlayerRoleId): void {
    if (!isRoleUnlocked(id)) { const c = roleCondition(id); audio.sfx('ui_error'); this.statusText = `Locked. ${c.label}: ${Math.min(c.have, c.need)}/${c.need}.`; return; }
    profile().selectedRole = id;
    saveProfile();
    audio.sfx('ui_select');
    this.statusText = `${ROLES[id].name} selected for your next run.`;
    this.buildOptions();
  }

  /** Loadout + cosmetics (rebuilt when the role changes because the kit-defining slot is locked). */
  private buildOptions(): void {
    const role = profile().selectedRole, locked = LOCKED_SLOT[role], lo = meta().loadout;
    const items: Widget[] = [];
    items.push(new Heading('Loadout (' + ROLES[role].name + ')', 'folder'));
    const slotOpts = (slot: 'melee' | 'ranged' | 'thrown') => {
      const cls = slot === 'ranged' ? 'ranged' : slot === 'thrown' ? 'throwable' : ['blunt', 'sharp'];
      const ids = Object.values(WEAPONS).filter((w) => w.rarity === 0 && w.id !== 'fists' && (Array.isArray(cls) ? cls.includes(w.cls) : w.cls === cls) && isWeaponUnlocked(w.id));
      return [{ value: '', label: 'Role default' }, ...ids.map((w) => ({ value: w.id, label: w.name }))];
    };
    const mk = (label: string, slot: 'melee' | 'ranged' | 'thrown') => {
      const c = new Choice<string>(label, slotOpts(slot), () => lo[slot] ?? '', (v) => { if (v) lo[slot] = v; else delete lo[slot]; saveProfile(); });
      if (locked === slot) { c.enabled = false; c.label = label + ' (role kit)'; }
      return c;
    };
    items.push(mk('Melee', 'melee'), mk('Ranged', 'ranged'), mk('Throwable', 'thrown'));
    items.push(new Label('Standard-tier weapons only. Unlock more weapons at the vending machine to widen this list.', { dim: true, scale: 1 }));
    items.push(new Spacer(4));
    items.push(new Heading('Wardrobe (KPI rewards)', 'star'));
    const outfits = [{ value: 'default', label: 'Standard issue' }, ...ownedCosmetics('outfit').map((c) => ({ value: c.id, label: c.name }))];
    const titles = [{ value: '', label: 'No title' }, ...ownedCosmetics('title').map((c) => ({ value: c.id, label: c.name }))];
    const p = profile();
    items.push(new Choice<string>('Outfit', outfits, () => (outfits.some((o) => o.value === p.cosmetics.outfit) ? p.cosmetics.outfit : 'default'), (v) => { p.cosmetics.outfit = v; saveProfile(); }));
    items.push(new Choice<string>('Title', titles, () => (titles.some((o) => o.value === p.cosmetics.title) ? p.cosmetics.title : ''), (v) => { p.cosmetics.title = v; saveProfile(); }));
    const decor = ownedCosmetics('decor');
    for (const d of decor) items.push(new Toggle(d.name, () => p.cosmetics.decor.includes(d.id), (v) => { p.cosmetics.decor = p.cosmetics.decor.filter((x) => x !== d.id); if (v) p.cosmetics.decor.push(d.id); saveProfile(); }));
    const total = COSMETICS.length, got = COSMETICS.filter((c) => p.unlocks.includes('cosmetic:' + c.id)).length;
    items.push(new Label(p.prUnlocked ? `KPI ${p.kpi} points. ${got}/${total} cosmetics unlocked. Win with Performance Review modifiers to earn more. Cosmetics are never power.` : 'Win a run to unlock Performance Review. KPI points from winning with modifiers unlock outfits, titles and hub decor.', { dim: true, scale: 1 }));
    this.opts.setItems(items);
    for (const it of items) it.parent = this.opts;
  }

  protected layout(cl: RectL): void {
    const foot = this.footH();
    const lw = Math.min(Math.round(cl.w * 0.5), 340);
    const detH = 3 * LINE_H + 10;
    this.roles.set(cl.x + 2, cl.y + 2, lw, cl.h - foot - detH - 8);
    this.detail = { x: cl.x + 2, y: cl.y + cl.h - foot - detH - 2, w: lw, h: detH };
    this.opts.set(cl.x + lw + 8, cl.y + 2, cl.w - lw - 10, cl.h - foot - 4);
    this.roles.padY = 0; this.roles.gap = 0;
    this.opts.padX = 2;
  }

  protected drawBody(g: Ctx, _cl: RectL): void {
    const s = uiS();
    box(g, this.roles.x - 1, this.roles.y - 1, this.roles.w + 2, this.roles.h + 2, { face: '#e1ddd0', kind: 'sunken', cham: 0, depth: 1 });
    box(g, this.opts.x - 1, this.opts.y - 1, this.opts.w + 2, this.opts.h + 2, { face: C.face, kind: 'sunken', cham: 0, depth: 1 });
    const d = this.detail;
    well(g, d.x, d.y, d.w, d.h, '#fbfaf5');
    const f = this.ui.focus;
    const id = f instanceof RoleRow ? f.id : profile().selectedRole;
    const r = ROLES[id];
    ink(g, truncate(r.name + ': ' + roleTwists(id).join('. '), d.w - 12, 1), d.x + 6, d.y + 4, { color: C.navy });
    wrap(r.desc + ' Kit: ' + roleKit(id) + '.', d.w - 12, 1).slice(0, 2).forEach((l, i) => ink(g, l, d.x + 6, d.y + 4 + (i + 1) * LINE_H, { color: C.ink }));
    void s; void Ui;
  }
}
