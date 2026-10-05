// Ending sequence (spec 6.5): after the CEO falls — the all-staff email cancelling the Culture Realignment
// Programme (CorpOS mail window), staff snapping out of the indoctrination (lanyard glow dies), a darkly funny
// epilogue, then the credits roll. Registers SCENES.ending; GameplayScene.endRun() hands over here on victory.
import { app, Scene } from '../core/app';
import type { GameplayScene } from './gameplay';
import { SCENES } from '../game/registry';
import { drawText, wrap, measure } from '../render/font';
import { drawDesktop, drawWindow, drawTaskbar } from '../ui/window';
import { ENDING_EMAIL } from '../data/text/announcements';
import { CREDITS_LINES } from '../data/text/ui';
import { rollLook, bakeCharacter, BakedCharacter, AnimName } from '../art/characters';
import { Rng } from '../core/rng';
import { audio } from '../audio/audio';
import { clamp } from '../core/math';

const SNAP_LINES = [
  'Why am I wearing a sash?', 'Did I... chant?', 'What day is it?', 'I have 4,000 unread emails.', 'Who is Gordon?',
  'I need a lie down.', 'Is it still Q4?', 'Why is my lanyard warm?', 'I agreed to WHAT?', 'Has anyone seen my soul?',
];

const EPILOGUE = (s: GameplayScene): string[] => [
  'The Culture Realignment Programme was replaced by the Culture Realignment Programme Review Programme.',
  'The Board voted itself a bonus for "navigating a challenging quarter with resilience".',
  `HR opened a file on you. It notes ${s.run.log.executions} executions and ${s.run.log.defenestrations} defenestrations, and recommends "a short course on de-escalation".`,
  'Gordon Pike\'s maintenance ticket was closed: Resolved — Will Not Fix.',
  'The sales gong was sold for scrap. It made its target.',
  'Every policy in the archive was shredded. Compliance has never been higher.',
  'The helicopter lease was returned with 0.2 hours remaining.',
  'There is a meeting next week to discuss what happened. It could have been an email.',
];

interface Npc { b: BakedCharacter; x: number; y: number; dir: number; snapAt: number; line: string; glow: string }

class EndingScene implements Scene {
  name = 'ending';
  t = 0;
  stage = 0;
  stageT = 0;
  typed = 0;
  npcs: Npc[] = [];
  credits: { text: string; col: string; scale: number }[] = [];
  creditsH = 0;
  done = false;
  private lastTick = 0;
  constructor(public s: GameplayScene, public onDone: () => void) {
    const rng = new Rng(s.run.seed ^ 0xe11d);
    const glows = ['#7ff0d8', '#6fe8ff', '#a8d4ff', '#ffe0a0'];
    for (let i = 0; i < 9; i++) {
      const look = rollLook({ kind: 'npc' }, rng);
      this.npcs.push({ b: bakeCharacter(look), x: 40 + (i % 5) * 60 + (i >= 5 ? 30 : 0), y: i < 5 ? 112 : 152, dir: 0, snapAt: 1.6 + i * 0.55 + rng.range(0, 0.3), line: SNAP_LINES[(i * 3 + (s.run.seed & 7)) % SNAP_LINES.length], glow: glows[i % 4] });
    }
    const L = (text: string, col = '#e8e0d0', scale = 1) => this.credits.push({ text, col, scale });
    L('COMPANY POLICY', '#ffd34d', 4); L(''); L('Design', '#8a8f9a'); L('Kallum Booth', '#ffffff', 2); L('');
    L('Built with an AI development team', '#9fd0ff'); L(''); L('');
    for (const c of CREDITS_LINES) { const [a, b] = c.split(': '); if (b) { L(a, '#8a8f9a'); L(b); L(''); } else { L(c); L(''); } }
    L(''); L('No real companies, products or people were harmed.', '#8a8f9a'); L('Several fictional ones were.', '#8a8f9a'); L(''); L('');
    L('Thank you for your service.', '#ffd34d', 2);
    this.creditsH = this.credits.reduce((a, c) => a + 12 * c.scale + 4, 0);
  }
  enter(): void { audio.music.play('ceo_finale', 1.5); audio.sfx('ui_email'); }
  next(): void { this.stage++; this.stageT = 0; if (this.stage === 3) audio.music.play('credits', 2); }
  update(dt: number): void {
    this.t += dt; this.stageT += dt;
    const inp = app.input;
    const skip = inp.pressed('confirm') || inp.pressed('interact') || inp.pressed('melee') || inp.pressed('back');
    const fast = inp.down('confirm') || inp.down('interact') || inp.down('melee');
    switch (this.stage) {
      case 0: { // email
        const full = ENDING_EMAIL.body.length;
        this.typed = Math.min(full, this.typed + dt * (fast ? 260 : 70));
        if (this.typed < full && this.t - this.lastTick > 0.09) { this.lastTick = this.t; audio.sfx('ui_typing', { vol: 0.25 }); }
        if (skip && this.stageT > 0.6) { if (this.typed < full) this.typed = full; else this.next(); }
        if (this.typed >= full && this.stageT > 14) this.next();
        break;
      }
      case 1: // staff snap out
        for (const n of this.npcs) if (this.stageT > n.snapAt && this.stageT - dt <= n.snapAt) audio.sfx('wellbeing_chime', { vol: 0.4 });
        if ((skip && this.stageT > 1) || this.stageT > 9.5) this.next();
        break;
      case 2: // epilogue
        if ((skip && this.stageT > 0.6) || this.stageT > EPILOGUE(this.s).length * 3.2 + 0.5) this.next();
        break;
      case 3: { // credits
        const end = (this.creditsH + app.renderer.H) / 26 + 2;
        if (fast) this.stageT += dt * 4;
        if (this.stageT > end || (inp.pressed('back'))) this.finish();
        break;
      }
    }
  }
  finish(): void { if (this.done) return; this.done = true; this.onDone(); }

  render(): void {
    const r = app.renderer, g = r.f, W = r.W, H = r.H;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.stage === 0) this.renderEmail(g, W, H);
    else if (this.stage === 1) this.renderStaff(g, W, H);
    else if (this.stage === 2) this.renderEpilogue(g, W, H);
    else this.renderCredits(g, W, H);
    // stage fades
    const f = clamp(1 - this.stageT * 2.5, 0, 1);
    if (f > 0) { g.globalAlpha = f; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  }

  private renderEmail(g: CanvasRenderingContext2D, W: number, H: number): void {
    drawDesktop(g, 'teal');
    drawTaskbar(g, { items: [{ label: 'CorpOS Mail', glyph: 'mail', active: true }], tray: ['wifi', 'vol'], clock: true });
    const ww = Math.min(520, W - 40), wh = Math.min(300, H - 50);
    const rect = { x: Math.round(W / 2 - ww / 2), y: 14, w: ww, h: wh };
    const k = clamp(this.stageT * 4, 0, 1);
    const wr = drawWindow(g, 'CorpOS Mail — Inbox (1 unread)', { x: rect.x, y: rect.y + Math.round((1 - k) * 30), w: rect.w, h: rect.h }, { icon: 'mail', tint: '#6d1620' });
    const c = wr.client;
    g.fillStyle = '#f8f6ef'; g.fillRect(c.x, c.y, c.w, c.h);
    g.fillStyle = '#e6e3dc'; g.fillRect(c.x, c.y, c.w, 38);
    drawText(g, 'From:', c.x + 6, c.y + 4, { color: '#5a5a62', shadow: null }); drawText(g, ENDING_EMAIL.from, c.x + 50, c.y + 4, { color: '#1a1a1e', shadow: null });
    drawText(g, 'To:', c.x + 6, c.y + 14, { color: '#5a5a62', shadow: null }); drawText(g, 'All Staff (everyone@corp)', c.x + 50, c.y + 14, { color: '#1a1a1e', shadow: null });
    drawText(g, 'Subject:', c.x + 6, c.y + 24, { color: '#5a5a62', shadow: null });
    drawText(g, ENDING_EMAIL.subject.length > 64 ? ENDING_EMAIL.subject.slice(0, 63) + '…' : ENDING_EMAIL.subject, c.x + 50, c.y + 24, { color: '#a82828', shadow: null });
    g.fillStyle = '#ffb000'; g.fillRect(c.x + c.w - 70, c.y + 4, 64, 11); drawText(g, 'URGENT', c.x + c.w - 38, c.y + 5, { align: 'center', color: '#1a1a1e', shadow: null });
    const body = ENDING_EMAIL.body.slice(0, Math.floor(this.typed));
    const lines = wrap(body, c.w - 16, 1);
    const maxL = Math.floor((c.h - 46) / 10);
    const shown = lines.slice(Math.max(0, lines.length - maxL));
    shown.forEach((l, i) => drawText(g, l, c.x + 8, c.y + 44 + i * 10, { color: '#1a1a1e', shadow: null }));
    if (this.typed < ENDING_EMAIL.body.length && Math.floor(this.t * 4) % 2) { const last = shown[shown.length - 1] ?? ''; g.fillStyle = '#1a1a1e'; g.fillRect(c.x + 8 + measure(last), c.y + 44 + (shown.length - 1) * 10, 4, 8); }
    if (this.typed >= ENDING_EMAIL.body.length) drawText(g, 'PRESS TO CONTINUE', W / 2, H - 34, { align: 'center', color: '#ffffff', outline: '#000', alpha: 0.6 + 0.4 * Math.sin(this.t * 4) });
  }

  private renderStaff(g: CanvasRenderingContext2D, W: number, H: number): void {
    // the open-plan office, morning after
    g.fillStyle = '#9c927e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, W, 90);
    g.fillStyle = '#a79f8f'; g.fillRect(0, 90, W, 8);
    for (let x = 20; x < W; x += 140) { g.fillStyle = '#6fb6e6'; g.fillRect(x, 20, 100, 56); g.fillStyle = '#9fd0f0'; g.fillRect(x + 6, 24, 30, 48); g.fillStyle = '#ffe9a0'; g.fillRect(x + 70, 40, 18, 12); }
    for (let y = 120; y < H; y += 32) for (let x = 0; x < W; x += 32) { g.fillStyle = (x / 32 + y / 32) % 2 ? '#a49880' : '#9c927e'; g.fillRect(x, y, 32, 32); }
    // a fallen "values" banner
    g.fillStyle = '#7a1420'; g.fillRect(W / 2 - 80, 100, 160, 14); drawText(g, 'WE ARE ONE FAM', W / 2, 103, { align: 'center', color: '#d4a537', shadow: null });
    g.fillStyle = '#5c0e18'; g.fillRect(W / 2 + 70, 104, 40, 6);
    const t = this.stageT;
    // close shot: staff drawn at an integer 2x
    const ox = Math.round(W / 4 - 170);
    g.save(); g.scale(2, 2); g.translate(ox, 0);
    for (const n of this.npcs) {
      // their desks
      g.fillStyle = '#6e4a32'; g.fillRect(n.x - 14, n.y + 2, 28, 6); g.fillStyle = '#8a6040'; g.fillRect(n.x - 14, n.y + 2, 28, 1);
      g.fillStyle = '#22232a'; g.fillRect(n.x + 4, n.y - 4, 8, 6); g.fillStyle = '#6fb6e6'; g.fillRect(n.x + 5, n.y - 3, 6, 4);
    }
    for (const n of this.npcs) {
      const snapped = t > n.snapAt;
      const k = clamp((t - n.snapAt) / 0.6, 0, 1);
      const anim: AnimName = !snapped ? 'chant' : k < 1 ? 'hit' : 'idle';
      n.b.draw(g, anim, 0, t, n.x, n.y, {});
      const glowA = snapped ? 1 - k : 0.65 + 0.35 * Math.sin(t * 6 + n.x);
      if (glowA > 0.02) {
        g.globalAlpha = glowA * 0.45; g.fillStyle = n.glow;
        g.beginPath(); g.ellipse(n.x, n.y - 15, 7, 6, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = glowA; g.fillRect(n.x - 1, n.y - 17, 2, 3);
        g.globalAlpha = 1;
      }
      if (snapped && k < 1) { g.globalAlpha = 1 - k; g.strokeStyle = n.glow; g.beginPath(); g.arc(n.x, n.y - 15, 4 + k * 14, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    }
    g.restore();
    for (const n of this.npcs) {
      const snapped = t > n.snapAt, k = clamp((t - n.snapAt) / 0.6, 0, 1);
      const sx = (n.x + ox) * 2, sy = n.y * 2;
      if (snapped && k >= 1 && t - n.snapAt < 3.4) {
        const text = n.line;
        const w = measure(text) + 8;
        const bx = Math.round(sx - w / 2), by = Math.round(sy - 82);
        g.fillStyle = '#f6f3ea'; g.fillRect(bx, by, w, 12); g.fillStyle = '#1a1a1e'; g.fillRect(bx, by + 12, w, 1); g.fillStyle = '#f6f3ea'; g.fillRect(Math.round(sx) - 1, by + 12, 3, 3);
        drawText(g, text, bx + 4, by + 2, { color: '#1a1a1e', shadow: null });
      }
      if (!snapped && Math.floor(t * 3 + n.x) % 4 === 0) drawText(g, '♪', sx + 14, sy - 70, { color: n.glow, shadow: null });
    }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 40, W, 40);
    const cap = t < 4 ? 'All staff received the email.' : t < 7 ? 'One by one, the lanyards went dark.' : 'Lanyards are now optional. Chanting is voluntary.';
    drawText(g, cap, W / 2, H - 26, { align: 'center', color: '#ffffff', scale: 1, shadow: null });
  }

  private renderEpilogue(g: CanvasRenderingContext2D, W: number, H: number): void {
    g.fillStyle = '#0b0c10'; g.fillRect(0, 0, W, H);
    const lines = EPILOGUE(this.s);
    const i = Math.min(lines.length - 1, Math.floor(this.stageT / 3.2));
    const lt = this.stageT - i * 3.2;
    const a = clamp(Math.min(lt * 3, (3.2 - lt) * 3), 0, 1);
    drawText(g, 'EPILOGUE', W / 2, 60, { align: 'center', color: '#8a8f9a', shadow: null });
    const wl = wrap(lines[i], Math.min(460, W - 60), 2);
    wl.forEach((l, k) => drawText(g, l, W / 2, H / 2 - wl.length * 11 + k * 22, { align: 'center', color: '#e8e0d0', scale: 2, shadow: null, alpha: a }));
    drawText(g, `${i + 1} / ${lines.length}`, W / 2, H - 40, { align: 'center', color: '#4a4f5a', shadow: null });
  }

  private renderCredits(g: CanvasRenderingContext2D, W: number, H: number): void {
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
    // the tower at night, lights going out floor by floor
    for (let f = 0; f < 20; f++) for (let k = 0; k < 6; k++) {
      const on = ((f * 7 + k * 3) % 5) > Math.min(4, this.stageT / 6);
      g.fillStyle = on ? '#ffe2a0' : '#141830';
      g.fillRect(24 + k * 10, H - 30 - f * 14, 7, 9);
    }
    let y = H - this.stageT * 26;
    for (const c of this.credits) {
      if (y > -40 && y < H + 10 && c.text) drawText(g, c.text, W / 2, y, { align: 'center', color: c.col, scale: c.scale, shadow: null });
      y += 12 * c.scale + 4;
    }
    drawText(g, 'HOLD TO FAST-FORWARD', W - 10, H - 14, { align: 'right', color: '#3a3f4a', shadow: null });
  }
}

SCENES.ending = (s, onDone) => new EndingScene(s, onDone);
