// "Camera follows the fall" (spec 4.7 defenestration, 6.3 / 6.5 finishers): a screen-space sequence down the
// tower facade — the boss tumbles past floors of glass, debris flutters, then a hard cut to the street far below.
import { app } from '../../core/app';
import type { Ctx } from '../../render/canvas';
import { drawText } from '../../render/font';
import type { Cutscene } from '../world';
import type { BossArt } from '../../art/bosses/bake';
import { goreLevel } from '../fx';
import { fxRng } from '../../core/rng';
import { audio } from '../../audio/audio';
import { clamp } from '../../core/math';

export interface FallOpts {
  art: BossArt;
  anim: string;
  dur?: number;
  night?: boolean;
  floors: number;
  stamp: string;
  stampSub?: string;
  flutter: 'contracts' | 'cash' | 'glass';
  accent: string;
  onEnd(): void;
}

export class FallSequence implements Cutscene {
  t = 0;
  dur: number;
  private bits: { x: number; y: number; vx: number; vy: number; r: number; vr: number; c: string; w: number; h: number }[] = [];
  private landed = false;
  constructor(public o: FallOpts) {
    this.dur = o.dur ?? 3.4;
    const cols = o.flutter === 'cash' ? ['#7ac46a', '#5aa04a', '#d4a537'] : o.flutter === 'contracts' ? ['#f2efe6', '#e8e4da', '#ffffff'] : ['#cfe8f4', '#9fd0e6', '#ffffff'];
    for (let i = 0; i < 26; i++) this.bits.push({ x: fxRng.range(-160, 160), y: fxRng.range(-60, 260), vx: fxRng.range(-30, 30), vy: fxRng.range(-160, -40), r: 0, vr: fxRng.range(-6, 6), c: fxRng.pick(cols), w: o.flutter === 'glass' ? 2 : 5, h: o.flutter === 'glass' ? 2 : 3 });
    audio.sfx('fall_whistle');
    audio.music.duck(0.7, this.dur);
  }
  update(dt: number): boolean {
    this.t += dt;
    for (const b of this.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; if (b.y < -200) b.y += 460; }
    if (!this.landed && this.t > this.dur - 0.9) {
      this.landed = true;
      audio.sfx('splat_far'); audio.sfx('thud', { vol: 0.5 });
      app.renderer.shake(5, 0.3);
    }
    if (this.t >= this.dur) { this.o.onEnd(); return true; }
    return false;
  }
  renderScreen(g: Ctx): void {
    const r = app.renderer, W = r.W, H = r.H;
    const t = this.t, o = this.o;
    const cut = this.dur - 0.9;
    if (t < cut) {
      // sky
      const night = o.night;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, night ? '#0a0c22' : '#5a8cc8'); grd.addColorStop(1, night ? '#2a1a3a' : '#c8d8e8');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // distant towers
      g.fillStyle = night ? '#141830' : '#7a98b8';
      for (let i = 0; i < 9; i++) { const bx = (i * 97) % W, bw = 40 + (i * 37) % 50, bh = 120 + (i * 53) % 160; g.fillRect(bx, H - bh + Math.min(60, t * 30), bw, bh); }
      if (night) { g.fillStyle = '#ffe9a0'; for (let i = 0; i < 70; i++) g.fillRect((i * 61) % W, H - ((i * 37) % 240) + Math.min(60, t * 30), 1, 1); }
      // our tower's facade: glass curtain wall scrolling up, accelerating
      const speed = 300 + t * 520;
      const scroll = (t * speed) % 48;
      const fx0 = Math.round(W / 2 - 130), fw = 260;
      g.fillStyle = night ? '#1c2a3e' : '#4a6a8a'; g.fillRect(fx0, 0, fw, H);
      for (let y = -48 + (48 - scroll); y < H + 48; y += 48) {
        g.fillStyle = night ? '#24364e' : '#6a8aac'; g.fillRect(fx0, Math.round(y), fw, 40);
        g.fillStyle = night ? '#0e1420' : '#2a3a4e'; g.fillRect(fx0, Math.round(y) + 40, fw, 8);
        for (let x = fx0; x < fx0 + fw; x += 32) { g.fillStyle = night ? '#0e1420' : '#3a4e66'; g.fillRect(x, Math.round(y), 2, 40); }
        // occasional lit office (with a silhouette at the window, watching)
        const k = Math.floor((y + t * speed) / 48);
        if ((k * 7) % 5 === 0) { g.fillStyle = night ? '#ffe2a0' : '#dfeefa'; g.fillRect(fx0 + 34 + ((k * 64) % 160), Math.round(y) + 6, 28, 30); g.fillStyle = '#1a1a22'; g.fillRect(fx0 + 44 + ((k * 64) % 160), Math.round(y) + 16, 6, 20); g.fillRect(fx0 + 45 + ((k * 64) % 160), Math.round(y) + 11, 4, 5); }
      }
      // floor counter
      const fl = Math.max(0, Math.round(o.floors * (1 - t / cut)));
      g.fillStyle = 'rgba(10,10,16,0.75)'; g.fillRect(10, H - 56, 82, 22);
      drawText(g, `FLOOR ${String(fl).padStart(2, '0')}`, 51, H - 50, { align: 'center', color: '#ff9a2a', shadow: null });
      // the boss, tumbling (2x close-up)
      g.save();
      g.translate(Math.round(W / 2 + Math.sin(t * 3) * 20), Math.round(H * 0.42));
      g.rotate(t * 5);
      g.scale(2, 2);
      o.art.draw(g, o.anim, 0, t, 0, 30);
      g.restore();
      // speed lines + debris
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 18; i++) { const x = (i * 71 + 13) % W, y = ((i * 137 - t * speed * 1.6) % (H + 80) + H + 80) % (H + 80) - 40; g.fillRect(x, Math.round(y), 1, 26); }
      for (const b of this.bits) {
        g.save(); g.translate(Math.round(W / 2 + b.x), Math.round(b.y)); g.rotate(b.r);
        g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
      }
      g.globalAlpha = clamp(1 - t * 3, 0, 1); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    } else {
      // street level, seen from above: the landing
      const k = clamp((t - cut) / 0.9, 0, 1);
      g.fillStyle = '#2a2c32'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#3a3d44'; g.fillRect(0, Math.round(H * 0.18), W, Math.round(H * 0.64));
      g.fillStyle = '#d8d0b0'; for (let x = 0; x < W; x += 40) g.fillRect(x, Math.round(H / 2), 20, 3);
      g.fillStyle = '#5a5c62'; g.fillRect(0, Math.round(H * 0.18) - 6, W, 6); g.fillRect(0, Math.round(H * 0.82), W, 6);
      const cx = W / 2, cy = H / 2 + 10;
      const gl = goreLevel();
      if (gl > 0) {
        g.fillStyle = gl === 2 ? '#8a0f14' : '#6a1a1a';
        for (let i = 0; i < (gl === 2 ? 26 : 10); i++) { const a = (i / 26) * Math.PI * 2; const rr = (gl === 2 ? 18 : 10) + ((i * 7) % 9); g.fillRect(Math.round(cx + Math.cos(a) * rr * k), Math.round(cy + Math.sin(a) * rr * 0.6 * k), 3, 2); }
        g.beginPath(); g.ellipse(cx, cy, 12 * k + 2, 7 * k + 1, 0, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#f2efe6';
        for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * 24 * k), Math.round(cy + Math.sin(a) * 14 * k), 4, 3); }
      }
      // a tiny crumpled figure and a lot of paperwork
      o.art.draw(g, o.anim, 0, 0, cx, cy + 6, { squash: 0.35 });
      g.fillStyle = '#f2efe6'; for (let i = 0; i < 12; i++) g.fillRect(Math.round(cx - 60 + ((i * 37) % 120)), Math.round(cy - 40 + ((i * 53) % 80)), 4, 3);
      // stamp
      const sk = clamp((t - cut - 0.15) / 0.15, 0, 1);
      if (sk > 0) {
        const sc = 4 - sk * 1.0;
        g.save(); g.translate(W / 2, H / 2 - 50); g.rotate(-0.12);
        g.globalAlpha = Math.min(1, sk * 1.5);
        const label = o.stamp;
        const tw = label.length * 6 * 3 + 20;
        g.strokeStyle = o.accent; g.lineWidth = 3; g.strokeRect(-tw / 2, -18, tw, 36);
        drawText(g, label, 0, -12, { align: 'center', color: o.accent, scale: Math.round(sc) >= 3 ? 3 : 3, shadow: null });
        g.restore(); g.globalAlpha = 1;
        if (o.stampSub) drawText(g, o.stampSub, W / 2, H / 2 + 60, { align: 'center', color: '#e8e0d0', outline: '#000' });
      }
    }
    // letterbox
    g.fillStyle = '#000'; g.fillRect(0, 0, W, 24); g.fillRect(0, H - 24, W, 24);
  }
}
