// Between-floor transitions: stairwell climb, lift ride (floor counter + muzak + announcements), corridor walk.
// Doubles as the loading screen with an internal memo (spec 9.2 loading tips).
import { app, Scene } from '../core/app';
import { drawText, drawWrapped } from '../render/font';
import { audio } from '../audio/audio';
import type { RunState } from '../game/run';
import { MEMOS, TIPS } from '../data/text/memos';
import { LIFT_ANNOUNCEMENTS } from '../data/text/announcements';
import { fxRng } from '../core/rng';
import { ACT_PALETTES } from '../art/palette';
import type { Act } from '../data/ids';

export interface TransitionOpts { kind: 'stairs' | 'lift' | 'corridor' | 'lift_ambush' | 'boss'; from: number; to: number; act: Act; run: RunState; onDone: () => void; }

export class TransitionScene implements Scene {
  name = 'transition';
  t = 0;
  dur: number;
  memo: { title: string; from: string; body: string };
  announce: string;
  private done = false;
  constructor(private o: TransitionOpts) {
    this.dur = o.kind === 'lift' || o.kind === 'lift_ambush' ? 3.0 : 2.4;
    const pool = fxRng.chance(0.4) ? TIPS : MEMOS;
    this.memo = fxRng.pick(pool);
    this.announce = fxRng.pick(LIFT_ANNOUNCEMENTS);
  }

  enter(): void {
    if (this.o.kind === 'lift' || this.o.kind === 'lift_ambush') { audio.music.play('lift', 0.4); audio.sfx('lift_doors'); audio.sfx('lift_motor'); }
    else if (this.o.kind === 'stairs') audio.sfx('stairs_steps');
    else audio.sfx('step');
  }

  update(dt: number): void {
    this.t += dt;
    const k = this.o.kind;
    if ((k === 'lift' || k === 'lift_ambush') && this.t > this.dur - 0.5 && !this.flags.chime) { this.flags.chime = true; audio.sfx('lift_chime'); }
    if (k === 'lift_ambush' && this.t > this.dur * 0.55 && !this.flags.jolt) { this.flags.jolt = true; audio.sfx('alarm'); app.renderer.shake(6, 0.5); }
    const skip = this.t > 0.8 && (app.input.pressed('confirm') || app.input.pressed('melee') || app.input.clicks.length > 0);
    if ((this.t >= this.dur || skip) && !this.done) {
      this.done = true;
      app.pop();
      this.o.onDone();
    }
  }
  private flags: Record<string, boolean> = {};

  render(): void {
    const r = app.renderer, g = r.f, W = r.W, H = r.H;
    const k = this.o.kind;
    const pal = ACT_PALETTES[this.o.act];
    g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, W, H);
    const p = Math.min(1, this.t / this.dur);
    const cx = Math.round(W / 2), cy = Math.round(H / 2) - 30;
    if (k === 'lift' || k === 'lift_ambush') {
      // lift interior
      const lw = 180, lh = 150, x = cx - lw / 2, y = cy - lh / 2;
      const shake = k === 'lift_ambush' && this.t > this.dur * 0.55 ? Math.round(Math.sin(this.t * 60) * 2) : 0;
      g.fillStyle = pal.wall[2]; g.fillRect(x - 6, y - 6 + shake, lw + 12, lh + 12);
      g.fillStyle = '#8a8f98'; g.fillRect(x, y + shake, lw, lh);
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#9aa0aa' : '#828892'; g.fillRect(x + i * (lw / 6), y + shake, lw / 6, lh); }
      g.fillStyle = '#5a5e66'; g.fillRect(x, y + lh - 12 + shake, lw, 12); // floor
      g.fillStyle = '#c8ccd4'; g.fillRect(x + 8, y + 70 + shake, lw - 16, 3); // handrail
      // floor counter panel
      const cur = Math.round(this.o.from + (this.o.to - this.o.from) * Math.min(1, p * 1.2));
      g.fillStyle = '#111'; g.fillRect(cx - 22, y + 10 + shake, 44, 20);
      drawText(g, String(k === 'lift_ambush' && this.t > this.dur * 0.55 ? '??' : cur).padStart(2, '0'), cx, y + 14 + shake, { align: 'center', scale: 1, color: '#ff9a2a', shadow: null });
      g.fillStyle = Math.floor(this.t * 3) % 2 ? '#ff9a2a' : '#5a3a1a';
      g.fillRect(cx + 14, y + 16 + shake, 3, 1); g.fillRect(cx + 13, y + 17 + shake, 5, 1);
      // button panel
      for (let i = 0; i < 10; i++) { g.fillStyle = i + 1 === this.o.to % 10 ? '#ffd34d' : '#3a3e46'; g.fillRect(x + lw - 20 + (i % 2) * 6, y + 40 + Math.floor(i / 2) * 6 + shake, 4, 4); }
      if (k === 'lift_ambush' && this.t > this.dur * 0.55) {
        g.fillStyle = `rgba(255,30,20,${(0.2 + 0.15 * Math.sin(this.t * 20)).toFixed(3)})`; g.fillRect(0, 0, W, H);
        drawText(g, 'LIFT AMBUSH', cx, y + lh + 14, { align: 'center', color: '#ff6a5a', scale: 2, outline: '#000' });
      } else drawText(g, `"${this.announce}"`, cx, y + lh + 14, { align: 'center', color: '#c8d0e0', shadow: null });
    } else if (k === 'stairs') {
      // stairwell: steps scrolling down
      const off = (this.t * 60) % 16;
      for (let i = -2; i < 14; i++) {
        const sy = cy - 80 + i * 16 + off;
        const sx = cx - 70 + i * 6;
        g.fillStyle = i % 2 ? '#4a4e56' : '#565a62'; g.fillRect(sx, sy, 140, 12);
        g.fillStyle = '#2a2c30'; g.fillRect(sx, sy + 12, 140, 4);
        g.fillStyle = '#ffd34d'; g.fillRect(sx, sy, 140, 1);
      }
      g.fillStyle = '#1a1c20'; g.fillRect(0, 0, cx - 90, H); g.fillRect(cx + 120, 0, W, H);
      drawText(g, `FLOOR ${this.o.to}`, cx + 10, cy - 100, { align: 'center', scale: 2, color: '#e8e8e8', outline: '#000' });
      drawText(g, 'Stairwell landing: a moment to breathe.', cx + 10, cy - 76, { align: 'center', color: '#8af0a0', outline: '#000' });
    } else {
      // corridor: perspective walls
      const off = (this.t * 80) % 32;
      g.fillStyle = pal.floor[1]; g.fillRect(0, cy - 40, W, 120);
      for (let i = 0; i < 30; i++) { g.fillStyle = i % 2 ? pal.floor[2] : pal.floor[0]; g.fillRect(i * 32 - off, cy + 20, 16, 2); }
      g.fillStyle = pal.wall[1]; g.fillRect(0, cy - 60, W, 22);
      for (let i = 0; i < 12; i++) { g.fillStyle = '#e8e6d8'; g.fillRect(i * 64 - off * 2, cy - 54, 20, 12); }
      drawText(g, 'LATERAL MOVE — WEST WING', cx, cy - 90, { align: 'center', scale: 2, color: '#ffd34d', outline: '#000' });
    }
    // memo card
    const mw = Math.min(420, W - 40), mh = 64, mx = Math.round(W / 2 - mw / 2), my = H - mh - 18;
    g.fillStyle = '#f2efe6'; g.fillRect(mx, my, mw, mh);
    g.fillStyle = '#25467a'; g.fillRect(mx, my, mw, 12);
    drawText(g, 'INTERNAL MEMO — ' + this.memo.title.toUpperCase(), mx + 4, my + 2, { color: '#fff', shadow: null });
    drawText(g, 'From: ' + this.memo.from, mx + 4, my + 15, { color: '#5a5a62', shadow: null });
    drawWrapped(g, this.memo.body, mx + 4, my + 26, mw - 8, { color: '#1a1a1e', shadow: null });
    // progress
    g.fillStyle = '#333'; g.fillRect(mx, my + mh + 3, mw, 2);
    g.fillStyle = '#ffd34d'; g.fillRect(mx, my + mh + 3, Math.round(mw * p), 2);
  }
}
