// Combat HUD (spec 9.2): Wellbeing score (HP + shield), Stress level KPI gauge (Rage), expenses (Petty Cash),
// lift-panel floor display, minimap, loadout, prompts, subtitles, boss bar. Minimal — gags live in menus.
import { app } from '../core/app';
import type { Ctx } from '../render/canvas';
import { drawText, measure, wrap } from '../render/font';
import { UI, RARITY_COLOURS } from '../art/palette';
import { weaponIcon, promptGlyph, icon, deskItemIcon } from '../art/items';
import * as env from '../art/env';
import type { Player } from '../game/player';
import type { World } from '../game/world';
import type { RunState } from '../game/run';
import { def } from '../game/weapons';
import { THEME_NAMES } from '../data/ids';
import { STRESS_LEVELS } from '../data/text/ui';
import { clamp } from '../core/math';
import { audio } from '../audio/audio';

export interface BossBar { name: string; title: string; hp: number; maxHp: number; phase: number; markers: number[]; shield?: number; }

export class Hud {
  bossBar: BossBar | null = null;
  /** Active compliance policy banner (spec 6.4). */
  policy: { title: string; body: string; t: number; icon?: string } | null = null;
  banner: { text: string; sub?: string; t: number; col: string } | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private minimapKey = '';
  private shownRage = 0;
  private shownHp = 0;
  private cues: { name: string; x?: number; y?: number; t: number }[] = [];
  /** Visible enemy HP numbers (Calculator Watch). */
  showEnemyHp = false;

  constructor() {
    audio.onCue = (name, x, y) => { if (app.settings.visualAudioCues) this.cues.push({ name, x, y, t: 1.2 }); };
  }

  showBanner(text: string, sub?: string, col = '#ffd34d', t = 2.6): void { this.banner = { text, sub, t, col }; }

  update(dt: number): void {
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.policy && this.policy.t > 0) this.policy.t -= dt;
    for (const c of this.cues) c.t -= dt;
    this.cues = this.cues.filter((c) => c.t > 0);
  }

  render(g: Ctx, w: World, p: Player, run: RunState): void {
    const r = app.renderer;
    const W = r.W, H = r.H;
    const s = r.safe;
    const L = 6 + s.l, R = W - 6 - s.r, Tp = 5 + s.t;
    const touch = app.input.device === 'touch';

    // ---------------- Wellbeing (top-left)
    this.shownHp += (p.hp - this.shownHp) * 0.2;
    const bw = 92;
    drawPanel(g, L - 2, Tp - 2, bw + 34, 37);
    drawText(g, 'WELLBEING', L + 2, Tp, { color: UI.textLight, shadow: null });
    const score = Math.round(p.hp);
    drawText(g, `${score}`, L + bw + 28, Tp, { color: p.hp / p.maxHp < 0.3 ? '#ff6a6a' : UI.hp, align: 'right', shadow: null });
    // shield
    const sy = Tp + 10;
    bar(g, L + 2, sy, bw + 26, 3, p.maxShield > 0 ? p.shield / p.maxShield : 0, UI.shield, '#16303e');
    // hp
    const hy = sy + 5;
    bar(g, L + 2, hy, bw + 26, 6, this.shownHp / p.maxHp, '#ff8a5a', '#2a1214');
    bar(g, L + 2, hy, bw + 26, 6, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? '#ff4a4a' : UI.hp, null);
    // Stress level KPI gauge (rage)
    this.shownRage += (p.rage - this.shownRage) * 0.25;
    const gy = hy + 10;
    const full = p.rage >= 100 && p.raging <= 0;
    const raging = p.raging > 0;
    const rfrac = raging ? p.raging / p.stats.rageDuration : this.shownRage / 100;
    bar(g, L + 2, gy, bw, 5, rfrac, raging ? (Math.floor(app.time * 10) % 2 ? '#ff2a1a' : '#ffb000') : full ? '#ff3a2a' : '#c0402a', '#2a1410');
    for (let i = 1; i < 10; i++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(L + 2 + Math.round((bw * i) / 10), gy, 1, 5); }
    const level = STRESS_LEVELS[Math.min(STRESS_LEVELS.length - 1, Math.floor(clamp(p.rage, 0, 99.9) / (100 / STRESS_LEVELS.length)))] ?? '';
    const stressLabel = raging ? 'GROSS MISCONDUCT' : full ? 'RAGE READY' : 'STRESS: ' + level;
    drawText(g, stressLabel.toUpperCase(), L + 2, gy + 7, { color: full || raging ? '#ff6a4a' : '#b9a0a0', shadow: null, alpha: full && !raging ? 0.6 + 0.4 * Math.sin(app.time * 8) : 1 });
    if (full && !touch) {
      const gl = promptGlyph(app.input.label('rage'), app.input.device);
      g.drawImage(gl, L + bw + 6, gy - 3);
    }

    // ---------------- Loadout (bottom-left on PC, under wellbeing on touch)
    const ly = touch ? Tp + 46 : H - 26 - s.b;
    this.drawLoadout(g, L, ly, run, p);

    // ---------------- Lift panel + expenses (top-right)
    const pw = 70;
    const px = R - pw;
    drawPanel(g, px - 2, Tp - 2, pw + 4, 24, '#14100c');
    g.fillStyle = '#0a0806'; g.fillRect(px + 2, Tp + 1, 26, 15);
    const fl = String(run.floor).padStart(2, '0');
    drawText(g, fl, px + 15, Tp + 4, { color: '#ff9a2a', align: 'center', scale: 1, shadow: null });
    g.fillStyle = 'rgba(255,154,42,0.15)'; g.fillRect(px + 2, Tp + 1, 26, 15);
    // up arrow
    g.fillStyle = w.floorCleared ? '#ffb64a' : '#5a3a1a';
    g.fillRect(px + 34, Tp + 3, 1, 1); g.fillRect(px + 33, Tp + 4, 3, 1); g.fillRect(px + 32, Tp + 5, 5, 1);
    drawText(g, `ACT ${run.plan.act}`, px + 40, Tp + 1, { color: '#c8b8a0', shadow: null });
    const tn = run.plan.floor_type === 'boss' ? 'BOSS' : run.plan.wing > 0 ? 'WING' : (THEME_NAMES[run.plan.department_theme] ?? '').split(' ')[0].toUpperCase();
    drawText(g, tn.slice(0, 7), px + 40, Tp + 11, { color: '#8a7a64', shadow: null });
    // expenses
    drawPanel(g, px - 2, Tp + 24, pw + 4, 13);
    drawText(g, 'EXPENSES', px + 1, Tp + 26, { color: '#a0a0a0', shadow: null });
    drawText(g, `£${run.pettyCash}${run.debt > 0 ? ` (-${run.debt})` : ''}`, R - 1, Tp + 26, { color: UI.cash, align: 'right', shadow: null });

    // ---------------- Minimap
    this.drawMinimap(g, w, R, Tp + 40);

    // room status
    if (w.inCombat) {
      const n = w.totalLiveEnemies();
      const txt = w.alarm ? `FIRE ALARM — ${n} HOSTILE` : `ROOM SEALED — ${w.liveEnemies(w.currentRoom) + ((w as any).pendingFor?.(w.currentRoom) ?? 0)} REMAINING`;
      drawText(g, txt, R, Tp + 40 + (this.minimap?.height ?? 0) + 4, { color: '#ff7a6a', align: 'right', outline: '#000' });
    } else if (w.floorCleared && run.plan.floor_type !== 'boss') {
      drawText(g, 'FLOOR CLEAR — EXITS OPEN', R, Tp + 40 + (this.minimap?.height ?? 0) + 4, { color: '#8af0a0', align: 'right', outline: '#000', alpha: 0.7 + 0.3 * Math.sin(app.time * 4) });
    }

    // ---------------- Desk items (bottom-right, PC only)
    if (!touch && run.deskItems.length) {
      let x = R - 16;
      const y = H - 20 - s.b;
      for (const id of run.deskItems.slice(-12)) { g.globalAlpha = 0.85; g.drawImage(deskItemIcon(id), x, y); g.globalAlpha = 1; x -= 17; }
    }

    // ---------------- Boss bar
    if (this.bossBar) this.drawBoss(g, this.bossBar);

    // ---------------- Policy banner (compliance boss)
    if (this.policy) {
      const pw2 = 200, ph = 30, x = Math.round(W / 2 - pw2 / 2), y = this.bossBar ? 34 : 8;
      drawPanel(g, x, y, pw2, ph, '#2a0e0e');
      g.fillStyle = '#ff4a4a'; g.fillRect(x, y, pw2, 1);
      drawText(g, 'ACTIVE POLICY: ' + this.policy.title.toUpperCase(), W / 2, y + 4, { color: '#ffd0c0', align: 'center', shadow: null });
      drawText(g, this.policy.body, W / 2, y + 16, { color: '#ff9a8a', align: 'center', shadow: null });
    }

    // ---------------- Interact / grab prompts (bottom-centre)
    const py = H - 44 - s.b;
    if (p.grabbing) {
      const lines: [string, string][] = [];
      if (p.execCandidate) lines.push([app.input.label('interact'), `EXECUTE (${p.execCandidate.replace('_', ' ').toUpperCase()})`]);
      lines.push([app.input.label('ranged'), 'THROW']);
      lines.push([app.input.label('melee'), 'PUMMEL']);
      this.drawPrompts(g, W / 2, py, lines, touch);
    } else if (p.interactTarget) {
      this.drawPrompts(g, W / 2, py, [[app.input.label('interact'), p.interactTarget.label.toUpperCase()]], touch, p.interactTarget.sub);
    } else if (p.grabCandidate) {
      this.drawPrompts(g, W / 2, py, [[app.input.label('grab'), 'GRAB']], touch);
    }

    // ---------------- Subtitles (spec 9.3)
    if (app.settings.subtitles) {
      const sc = app.settings.subtitleSize;
      let y = H - 60 - s.b - (sc - 1) * 20;
      for (const sub of [...w.subtitles].reverse()) {
        const line = `${sub.speaker}: ${sub.text}`;
        const lines = wrap(line, W * 0.7, sc);
        for (let i = lines.length - 1; i >= 0; i--) {
          const tw = measure(lines[i], sc);
          g.fillStyle = 'rgba(0,0,0,0.6)';
          g.fillRect(Math.round(W / 2 - tw / 2 - 3), y - 2, tw + 6, 10 * sc + 2);
          drawText(g, lines[i], W / 2, y, { align: 'center', color: i === 0 ? sub.col : '#e8e8e8', scale: sc, shadow: null, alpha: Math.min(1, sub.t * 2) });
          y -= 11 * sc;
        }
      }
    }

    // ---------------- Visual indicators for audio cues (spec 9.3 accessibility)
    for (const c of this.cues) {
      if (c.x === undefined || c.y === undefined) continue;
      const f = r.worldToFrame(c.x, c.y);
      const x = clamp(f.x, 20, W - 20), y = clamp(f.y - 30, 30, H - 30);
      drawText(g, '♪ ' + c.name.replace('_', ' ').toUpperCase(), x, y, { align: 'center', color: '#ffe9a0', outline: '#000', alpha: Math.min(1, c.t * 2) });
    }

    // ---------------- Banner (room clear, floor intro)
    if (this.banner) {
      const b = this.banner;
      const a = Math.min(1, b.t * 2, (2.6 - b.t) * 4 + 0.2);
      const y = Math.round(H * 0.28);
      g.globalAlpha = a * 0.75; g.fillStyle = '#000'; g.fillRect(0, y - 6, W, b.sub ? 34 : 22); g.globalAlpha = 1;
      drawText(g, b.text, W / 2, y, { align: 'center', color: b.col, scale: 1, shadow: null, alpha: a });
      if (b.sub) drawText(g, b.sub, W / 2, y + 14, { align: 'center', color: '#d8d8d8', shadow: null, alpha: a });
    }

    // exit previews above exits (world-space anchored)
    if (w.floorCleared) this.drawExitPreviews(g, w);

    if (app.settings.showFps) drawText(g, `${Math.round(app.fps)} FPS`, W / 2, 2, { align: 'center', color: '#8f8', outline: '#000' });
    if (run.assist) drawText(g, 'WORKPLACE ADJUSTMENTS', W / 2, H - 10 - s.b, { align: 'center', color: '#8ab4ff', shadow: null, alpha: 0.5 });
  }

  private drawLoadout(g: Ctx, x: number, y: number, run: RunState, p: Player): void {
    const slots: [string, ReturnType<() => typeof run.loadout.melee>][] = [['MELEE', run.loadout.melee], ['RANGED', run.loadout.ranged], ['THROW', run.loadout.thrown]];
    let cx = x;
    for (const [label, w] of slots) {
      drawPanel(g, cx - 2, y - 2, 22, 22);
      if (w) {
        const d = def(w.id);
        if (d.rarity > 0) { g.fillStyle = RARITY_COLOURS[d.rarity]; g.fillRect(cx - 2, y - 2, 22, 1); }
        g.drawImage(weaponIcon(w.id), cx + 1, y + 1);
        if (w.maxDur > 0) bar(g, cx, y + 17, 18, 2, w.dur / w.maxDur, w.dur / w.maxDur < 0.3 ? '#ff6a4a' : '#e8e0c0', '#2a2a2a');
        if (w.maxAmmo > 0) drawText(g, String(w.ammo), cx + 19, y + 10, { color: w.ammo === 0 ? '#ff6a6a' : '#ffffff', align: 'right', outline: '#000' });
      } else if (label === 'MELEE') {
        g.drawImage(weaponIcon('fists'), cx + 1, y + 1);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(cx + 4, y + 4, 10, 10);
      }
      cx += 24;
    }
    // dash charges
    for (let i = 0; i < p.stats.dashCharges; i++) {
      const f = clamp(p.dashCharges - i, 0, 1);
      g.fillStyle = '#20262c'; g.fillRect(cx + 1, y + 2 + i * 7, 6, 5);
      g.fillStyle = f >= 1 ? '#9fe0ff' : '#3a5a6a'; g.fillRect(cx + 1, y + 2 + i * 7 + Math.round(5 * (1 - f)), 6, Math.round(5 * f));
    }
  }

  private drawPrompts(g: Ctx, cx: number, y: number, lines: [string, string][], touch: boolean, sub?: string): void {
    let yy = y - (lines.length - 1) * 13;
    for (const [key, label] of lines) {
      const glyph = touch ? null : promptGlyph(key, app.input.device);
      const tw = measure(label) + (glyph ? glyph.width + 4 : 0) + 8;
      const x = Math.round(cx - tw / 2);
      g.fillStyle = 'rgba(10,12,16,0.8)'; g.fillRect(x, yy - 2, tw, 13);
      g.fillStyle = '#ffd34d'; g.fillRect(x, yy - 2, 1, 13);
      if (glyph) g.drawImage(glyph, x + 4, yy - 1);
      drawText(g, label, x + 4 + (glyph ? glyph.width + 4 : 0), yy + 1, { color: '#ffffff', shadow: null });
      yy += 13;
    }
    if (sub) drawText(g, sub, cx, yy + 1, { align: 'center', color: '#c0c0c0', outline: '#000' });
  }

  private drawMinimap(g: Ctx, w: World, right: number, top: number): void {
    const fn = (env as any).renderMinimap as ((m: any, v: Set<number>, c: number, cl: Set<number>) => HTMLCanvasElement) | undefined;
    if (!fn) return;
    const visited = new Set<number>(), cleared = new Set<number>();
    w.rooms.forEach((r, i) => { if (r.entered) visited.add(i); if (r.cleared) cleared.add(i); });
    const key = [...visited].join(',') + '|' + [...cleared].join(',') + '|' + w.currentRoom + '|' + w.floorCleared;
    if (key !== this.minimapKey || !this.minimap) { this.minimap = fn(w.map, visited, w.currentRoom, cleared); this.minimapKey = key; }
    const m = this.minimap;
    g.globalAlpha = 0.85;
    g.drawImage(m, Math.round(right - m.width), top);
    g.globalAlpha = 1;
  }

  private drawBoss(g: Ctx, b: BossBar): void {
    const W = app.renderer.W;
    const bw = Math.min(300, W * 0.5), x = Math.round(W / 2 - bw / 2), y = 14;
    drawText(g, `${b.name.toUpperCase()} — ${b.title}`, W / 2, y - 10, { align: 'center', color: '#ffe0c0', outline: '#000' });
    g.fillStyle = '#000'; g.fillRect(x - 2, y - 2, bw + 4, 9);
    g.fillStyle = '#3a1010'; g.fillRect(x, y, bw, 5);
    g.fillStyle = '#e04030'; g.fillRect(x, y, Math.round(bw * clamp(b.hp / b.maxHp, 0, 1)), 5);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, Math.round(bw * clamp(b.hp / b.maxHp, 0, 1)), 1);
    if (b.shield) { g.fillStyle = '#ffd34d'; g.fillRect(x, y + 6, Math.round(bw * clamp(b.shield, 0, 1)), 1); }
    for (const m of b.markers) { g.fillStyle = '#ffffff'; g.fillRect(x + Math.round(bw * m), y - 2, 1, 9); }
    drawText(g, `PHASE ${b.phase}`, x + bw + 6, y - 2, { color: '#ff9a8a', outline: '#000' });
  }

  private drawExitPreviews(g: Ctx, w: World): void {
    const r = app.renderer;
    const prev = (w as any).exitPreviews as { x: number; y: number; icon: string; label: string; sub?: string; available: boolean }[] | undefined;
    if (!prev) return;
    for (const e of prev) {
      const f = r.worldToFrame(e.x, e.y - 52);
      if (f.x < -20 || f.x > r.W + 20 || f.y < -20 || f.y > r.H + 20) continue;
      const bob = Math.round(Math.sin(app.time * 3 + e.x) * 2);
      if (!e.available) { drawText(g, 'OUT OF ORDER', f.x, f.y + bob, { align: 'center', color: '#888', outline: '#000' }); continue; }
      g.fillStyle = 'rgba(10,12,16,0.85)'; g.fillRect(Math.round(f.x - 11), Math.round(f.y - 11 + bob), 22, 22);
      g.fillStyle = '#ffd34d'; g.fillRect(Math.round(f.x - 11), Math.round(f.y - 11 + bob), 22, 1);
      g.drawImage(icon(e.icon as any), Math.round(f.x - 8), Math.round(f.y - 8 + bob));
      drawText(g, e.label, f.x, f.y + 14 + bob, { align: 'center', color: '#ffffff', outline: '#000' });
      if (e.sub) drawText(g, e.sub, f.x, f.y + 24 + bob, { align: 'center', color: '#ffd34d', outline: '#000' });
    }
  }
}

export function drawPanel(g: Ctx, x: number, y: number, w: number, h: number, col = 'rgba(10,12,18,0.72)'): void {
  g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(Math.round(x), Math.round(y + h - 1), Math.round(w), 1);
}

export function bar(g: Ctx, x: number, y: number, w: number, h: number, f: number, col: string, bg: string | null): void {
  if (bg) { g.fillStyle = bg; g.fillRect(x, y, w, h); }
  g.fillStyle = col;
  g.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), h);
  if (h >= 3) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), 1); }
}
