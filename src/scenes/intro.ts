// Opening sequence (spec 1.1, framing rule 1: "employees attack first"). The meeting room: HR presents the Culture
// Realignment Programme, colleagues with glowing lanyards chant with fixed smiles, the player objects (every dialogue
// option is a flavour of "No"), the room turns on them and the player snaps. Skippable. Hands off to the first floor.
import { app, Scene } from '../core/app';
import { audio } from '../audio/audio';
import { Rng, fxRng } from '../core/rng';
import { Ctx, makeCanvas, ctx2d, rect, ellipse } from '../render/canvas';
import { drawText, measure, wrap } from '../render/font';
import { touch } from '../ui/touch';
import { Ui, Button, btnH } from '../ui/widgets';
import { C, box, dim, clamp, easeOutCubic, uiS } from '../ui/style';
import { notify, updateNotifications, renderNotifications } from '../ui/corpos';
import { bakeCharacter, rollLook, BakedCharacter, AnimName } from '../art/characters';
import { SCENES } from '../game/registry';
import { profile } from '../game/profile';
import { SW, SH } from '../game/meta/carpark';

const SLIDES: { title: string; sub: string; col?: string }[] = [
  { title: 'CULTURE REALIGNMENT', sub: 'PROGRAMME  -  MODULE 1 OF 1: ALIGNMENT' },
  { title: 'WE ARE ONE FAMILY', sub: '(Families do not leave.)' },
  { title: 'FEEDBACK IS A GIFT', sub: 'Please do not return the gift.' },
  { title: 'MANDATORY FUN', sub: 'Attendance: mandatory. Fun: mandatory.' },
  { title: 'ANY QUESTIONS?', sub: '(There are none.)' },
];

const CHOICES = ['No.', 'No. I will not sign that.', 'No. This is a cult.', 'No. And I am not smiling.'];

interface Actor {
  id: string; baked: BakedCharacter | null; x: number; y: number; hx: number; hy: number; dir: number; anim: AnimName; t: number;
  kind: 'hr' | 'col' | 'player'; sit: boolean; flash: number; glow: number;
}

type Phase = 'in' | 'hr' | 'choice' | 'reply' | 'turn' | 'attack' | 'snap' | 'out';

class IntroScene implements Scene {
  name = 'intro';
  private t = 0;
  private phase: Phase = 'in';
  private pt = 0;
  private step = 0;
  private actors: Actor[] = [];
  private bg!: HTMLCanvasElement;
  private bgKey = '';
  private ox = 0; private oy = 0;
  private sub = { who: '', text: '', t: 0, dur: 0 };
  private slide = 0;
  private slideGlitch = 0;
  private screenText: { title: string; sub: string; col: string } = { title: '', sub: '', col: '#14234a' };
  private ui = new Ui({ onBack: () => this.skip() });
  private choiceBtns: Button[] = [];
  private skipBtn: Button;
  private chosen = '';
  private done = false;
  private flashWhite = 0; private flashRed = 0;
  private fade = 1;
  private bubble: { text: string; t: number } | null = null;
  private stapler: { t: number; fx: number; fy: number } | null = null;
  private skipHold = 0;
  private prevMode: 'gameplay' | 'menu' = 'gameplay';
  private hits = 0;

  constructor(private onDone: () => void) {
    const rng = new Rng(0x1d7a ^ (profile().created >>> 0));
    const mk = (spec: Parameters<typeof rollLook>[0]) => { try { return bakeCharacter(rollLook(spec, new Rng(rng.nextU32()))); } catch (e) { console.warn(e); return null; } };
    const add = (id: string, kind: Actor['kind'], x: number, y: number, dir: number, sit: boolean, spec: Parameters<typeof rollLook>[0]) => this.actors.push({ id, baked: mk(spec), x, y, hx: x, hy: y, dir, anim: sit ? 'sit' : 'idle', t: fxRng.range(0, 2), kind, sit, flash: 0, glow: 0 });
    const col = (a: 'intern' | 'receptionist' | 'caretaker' | 'it_tech') => ({ kind: 'enemy' as const, archetype: a, tier: 0 as const });
    add('hr', 'hr', 320, 114, 0, false, { kind: 'enemy', archetype: 'hr_partner', tier: 1 });
    add('n1', 'col', 232, 170, 0, true, col('intern')); add('n2', 'col', 280, 170, 0, true, col('receptionist'));
    add('n3', 'col', 360, 170, 0, true, col('it_tech')); add('n4', 'col', 408, 170, 0, true, col('caretaker'));
    add('w1', 'col', 180, 204, 1, true, col('intern')); add('e1', 'col', 460, 204, 3, true, col('receptionist'));
    add('s1', 'col', 262, 254, 2, true, col('it_tech')); add('s2', 'col', 380, 254, 2, true, col('intern'));
    add('player', 'player', 320, 258, 2, true, { kind: 'player', role: profile().selectedRole, tier: 0 });

    this.ui.hoverFocus = true;
    CHOICES.forEach((c, i) => { const b = new Button({ text: c, kind: i === 0 ? 'primary' : 'normal', onPress: () => this.choose(c), sound: 'ui_select' }); b.visible = false; this.choiceBtns.push(b); this.ui.add(b); });
    this.skipBtn = this.ui.add(new Button({ text: 'Skip', glyph: 'right', kind: 'flat', onPress: () => this.skip(), sound: 'ui_back' }));
    this.setScreen(0);
  }

  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    audio.music.play('act1', 1.5);
    audio.music.setCombat(false);
  }
  exit(): void { touch.setContext({ mode: this.prevMode }); audio.music.setCombat(false); audio.music.setRage(false); }

  // ---------------------------------------------------------------- helpers
  private A(id: string): Actor { return this.actors.find((a) => a.id === id)!; }
  private cols(): Actor[] { return this.actors.filter((a) => a.kind === 'col'); }
  private say(who: string, text: string, dur = 0): void { this.sub = { who, text, t: 0, dur: dur || 1.4 + text.length * 0.045 }; audio.voice(who === 'HR' ? 11 : 5, 'speech', { syllables: Math.min(10, Math.ceil(text.length / 5)), vol: 0.6 }); }
  private setScreen(i: number): void { this.slide = i; this.screenText = { title: SLIDES[i].title, sub: SLIDES[i].sub, col: SLIDES[i].col ?? '#14234a' }; this.slideGlitch = 0.25; audio.sfx('ui_slide'); }
  private go(p: Phase): void { this.phase = p; this.pt = 0; this.step = 0; }

  private choose(c: string): void {
    if (this.phase !== 'choice') return;
    this.chosen = c;
    for (const b of this.choiceBtns) b.visible = false;
    this.bubble = { text: c, t: 0 };
    this.say('YOU', c, 1.6);
    this.go('reply');
    this.skipBtn.visible = true;
  }

  private skip(): void {
    if (this.done) return;
    this.done = true;
    audio.sfx('ui_select');
    this.phase = 'out'; this.pt = 0; this.step = 99;
    for (const b of this.choiceBtns) b.visible = false;
  }

  private finish(): void {
    profile().seenIntro = true;
    this.onDone();
  }

  // ---------------------------------------------------------------- script
  update(dt: number): void {
    this.t += dt; this.pt += dt;
    touch.update(); updateNotifications(dt);
    this.sub.t += dt;
    this.slideGlitch = Math.max(0, this.slideGlitch - dt);
    this.flashWhite = Math.max(0, this.flashWhite - dt * 1.8); this.flashRed = Math.max(0, this.flashRed - dt * 1.6);
    if (this.bubble) this.bubble.t += dt;
    for (const a of this.actors) { a.t += dt; a.flash = Math.max(0, a.flash - dt * 4); }
    // glow pulse on lanyards
    for (const a of this.actors) if (a.kind !== 'player') a.glow = 0.5 + 0.5 * Math.sin(this.t * 3 + a.x);
    // hold-to-skip
    const i = app.input;
    if (i.down('confirm') && this.phase !== 'choice') { this.skipHold += dt; if (this.skipHold > 1.0) this.skip(); } else this.skipHold = Math.max(0, this.skipHold - dt * 2);
    if (i.pressed('pause')) this.skip();

    this.layoutUi();
    this.ui.update(dt);

    const P = this.phase, T = this.pt;
    const when = (n: number, at: number, fn: () => void) => { if (this.step === n && T >= at) { this.step = n + 1; fn(); } };
    switch (P) {
      case 'in':
        this.fade = Math.max(0, 1 - T / 1.0);
        if (T > 1.2) { this.go('hr'); }
        break;
      case 'hr': {
        when(0, 0.2, () => this.say('HR', 'Welcome, everyone, to the Culture Realignment Programme. Please smile. Thank you.'));
        when(1, 3.6, () => { this.setScreen(1); this.say('HR', 'Our values are simple: one family, one culture, no exceptions.'); });
        when(2, 7.2, () => { this.chant('ONE FAMILY. ONE CULTURE.'); });
        when(3, 10.4, () => { this.setScreen(2); this.say('HR', 'Feedback is a gift. Please do not return it.'); });
        when(4, 13.6, () => { this.setScreen(3); this.say('HR', 'Fun is mandatory. Attendance at fun is mandatory.'); });
        when(5, 17.0, () => { this.setScreen(4); this.say('HR', 'Any questions? Wonderful. There are none.'); this.A('hr').anim = 'cast'; });
        when(6, 20.0, () => { this.A('hr').anim = 'idle'; this.go('choice'); this.showChoices(); });
        break;
      }
      case 'choice': break;
      case 'reply': {
        when(0, 2.0, () => { this.bubble = null; this.screenText = { title: 'OBJECTION NOTED', sub: 'Please remain seated and smiling.', col: '#7a1a1a' }; this.slideGlitch = 0.5; audio.sfx('policy_stamp'); this.say('HR', 'Objection noted. Please remain seated. And smiling.'); });
        when(1, 5.0, () => this.go('turn'));
        break;
      }
      case 'turn': {
        // the room turns: heads swivel toward the player, lanyards flare, the chant starts again, quietly
        when(0, 0.0, () => { audio.music.setCombat(true); audio.sfx('chant'); for (const a of this.cols()) { const p = this.A('player'); a.dir = Math.abs(p.x - a.x) > Math.abs(p.y - a.y) * 1.2 ? (p.x > a.x ? 1 : 3) : p.y > a.y ? 0 : 2; a.anim = 'chant'; } this.A('hr').anim = 'chant'; });
        when(1, 0.5, () => { this.screenText = { title: 'REALIGNING...', sub: 'Please do not resist.', col: '#7a1a1a' }; this.slideGlitch = 0.6; this.say('HR', 'Realign them.', 1.4); });
        when(2, 2.0, () => this.go('attack'));
        break;
      }
      case 'attack': {
        const p = this.A('player');
        // they stand and move first: employees attack first (framing rule 1)
        when(0, 0.0, () => { for (const a of this.cols()) { a.sit = false; a.anim = 'run'; } audio.sfx('scream'); app.renderer.shake(2, 0.3); });
        for (const a of this.cols()) if (!a.sit && a.anim === 'run') {
          const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
          if (d > 26) { a.x += (dx / d) * 78 * dt; a.y += (dy / d) * 78 * dt * 0.85; a.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? 1 : 3) : dy > 0 ? 0 : 2; }
          else { a.anim = 'attack1'; a.t = 0; }
        }
        when(1, 0.55, () => { this.stapler = { t: 0, fx: this.A('n3').x, fy: this.A('n3').y - 20 }; audio.sfx('enemy_throw'); });
        if (this.stapler) { this.stapler.t += dt; if (this.stapler.t > 0.45) { this.stapler = null; this.hurt(1); } }
        when(2, 1.5, () => { this.hurt(2); });
        when(3, 2.2, () => this.go('snap'));
        break;
      }
      case 'snap': {
        when(0, 0.0, () => { const p = this.A('player'); p.sit = false; p.anim = 'rage'; p.dir = 2; this.flashRed = 1; audio.sfx('rage_activate'); audio.music.setRage(true); app.renderer.shake(7, 0.6); this.bubble = null; this.say('YOU', 'That is QUITE enough.', 1.6); });
        when(1, 1.8, () => { this.flashWhite = 1; audio.sfx('screen_smash'); app.renderer.shake(9, 0.5); });
        when(2, 3.0, () => { this.go('out'); });
        break;
      }
      case 'out':
        this.fade = Math.min(1, T / 0.7);
        if (this.fade >= 1 && !this.doneFired) { this.doneFired = true; this.finish(); }
        break;
    }
  }
  private doneFired = false;

  private chant(text: string): void {
    this.say('ALL', text, 2.4);
    audio.sfx('chant'); audio.voice(3, 'chant', { syllables: 6, vol: 0.5 });
    for (const a of this.cols()) { a.anim = 'chant'; }
    this.A('hr').anim = 'chant';
    setTimeout(() => { if (this.phase === 'hr') for (const a of this.cols()) a.anim = 'sit'; }, 2600);
  }

  private hurt(n: number): void {
    this.hits++;
    const p = this.A('player');
    p.flash = 1; p.anim = 'hit'; p.t = 0;
    this.flashRed = 0.7; app.renderer.shake(4 + n, 0.3);
    audio.sfx('hurt'); audio.sfx('hit_blunt');
    notify({ kind: 'bad', title: 'Wellbeing score reduced', body: n === 1 ? 'A colleague has expressed concern. Physically. -18.' : 'A second colleague has expressed concern. -24. Please smile.', duration: 3.2, sound: false });
  }

  private showChoices(): void { for (const b of this.choiceBtns) b.visible = true; this.ui.setFocus(this.choiceBtns[0]); this.skipBtn.visible = false; }

  // ---------------------------------------------------------------- layout / render
  private layoutUi(): void {
    const r = app.renderer, s = uiS();
    const bh = btnH();
    const w = Math.min(r.W - 40, 300 * s);
    const n = this.choiceBtns.length;
    const total = n * (bh + 3);
    const x = Math.round((r.W - w) / 2), y0 = Math.round(r.H - total - 14 - r.safe.b);
    this.choiceBtns.forEach((b, i) => b.set(x, y0 + i * (bh + 3), w, bh));
    const sw = this.skipBtn.autoW(10);
    this.skipBtn.set(r.W - r.safe.r - sw - 6, r.safe.t + 6, sw, bh);
  }

  private makeBg(W: number, H: number): void {
    const key = W + 'x' + H;
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.ox = Math.floor((W - SW) / 2); this.oy = Math.floor((H - SH) / 2);
    const ox = this.ox, oy = this.oy;
    const c = makeCanvas(W, H), g = ctx2d(c);
    const rng = new Rng(404);
    // carpet
    rect(g, 0, 0, W, H, '#3c4a66');
    for (let i = 0; i < W * H / 10; i++) rect(g, rng.int(0, W - 1), rng.int(0, H - 1), 1, 1, rng.chance(0.5) ? '#44536f' : '#34425c');
    for (let y = oy + 100; y < H; y += 18) rect(g, 0, y, W, 1, 'rgba(0,0,0,0.12)');
    // wall
    rect(g, 0, 0, W, oy + 96, '#c8ccd0');
    for (let x = -ox % 48; x < W; x += 48) rect(g, x, 0, 1, oy + 90, '#b2b7bc');
    rect(g, 0, oy + 84, W, 6, '#9aa0a8'); rect(g, 0, oy + 90, W, 2, '#6a7078'); rect(g, 0, oy + 92, W, 6, 'rgba(0,0,0,0.3)');
    // blinds / windows
    for (const wx of [ox + 20, ox + 540]) { rect(g, wx - 2, oy + 14, 84, 58, '#4a4e58'); rect(g, wx, oy + 16, 80, 54, '#8fb8d8'); for (let y = oy + 16; y < oy + 70; y += 6) rect(g, wx, y, 80, 3, '#d8dce0'); }
    // posters
    const post = (x: number, t1: string, t2: string, col: string) => { rect(g, x - 1, oy + 22, 78, 38, '#4a4e58'); rect(g, x, oy + 23, 76, 36, col); drawText(g, t1, x + 38, oy + 27, { align: 'center', color: '#fff', shadow: null }); drawText(g, t2, x + 38, oy + 46, { align: 'center', color: '#fff6d8', shadow: null }); };
    post(ox + 126, 'TEAMWORK', 'ALL OF IT', '#2f5fa8'); post(ox + 440, 'SMILE', 'IT IS POLICY', '#b57800');
    // projector screen
    rect(g, ox + 214, oy + 6, 212, 76, '#20242c'); rect(g, ox + 218, oy + 10, 204, 68, '#2c313c');
    // table
    const tx = ox + 190, ty = oy + 158;
    rect(g, tx + 4, ty + 70, 252, 10, 'rgba(0,0,0,0.3)');
    rect(g, tx, ty, 260, 62, '#8a5a34'); rect(g, tx, ty, 260, 2, '#b58250'); rect(g, tx, ty, 2, 62, '#a06c40'); rect(g, tx + 258, ty, 2, 62, '#5a3a20');
    for (let y = ty + 6; y < ty + 60; y += 7) rect(g, tx + 4, y, 252, 1, 'rgba(0,0,0,0.12)');
    rect(g, tx, ty + 62, 260, 8, '#5a3a20'); rect(g, tx, ty + 62, 260, 1, '#7a4e2c'); rect(g, tx + 6, ty + 70, 8, 6, '#2a1a10'); rect(g, tx + 246, ty + 70, 8, 6, '#2a1a10');
    // table items
    for (const [x, y] of [[40, 10], [90, 12], [150, 12], [200, 10], [60, 42], [190, 42]]) { rect(g, tx + x, ty + y, 14, 9, '#2a2e38'); rect(g, tx + x + 1, ty + y + 1, 12, 6, '#7fb8e8'); rect(g, tx + x - 1, ty + y + 9, 16, 2, '#1a1c24'); }
    ellipse(g, tx + 130, ty + 32, 9, 4, '#e8e6f0'); ellipse(g, tx + 130, ty + 31, 6, 2, '#ffd34d'); // biscuits
    rect(g, tx + 118, ty + 22, 5, 7, '#9fd0e8'); rect(g, tx + 118, ty + 22, 5, 1, '#d8f0ff');  // water jug
    this.bg = c;
  }

  render(): void {
    const r = app.renderer, g = r.f;
    this.makeBg(r.W, r.H);
    g.drawImage(this.bg, 0, 0);
    this.drawScreen(g);
    // chairs (under characters)
    const ox = this.ox, oy = this.oy;
    const chair = (x: number, y: number, dir: number) => { rect(g, x - 8, y - 12, 16, 12, '#222733'); rect(g, x - 7, y - 11, 14, 4, '#394156'); if (dir === 2) rect(g, x - 8, y - 22, 16, 9, '#2a3040'); if (dir === 0) rect(g, x - 8, y - 20, 16, 3, '#2a3040'); };
    for (const a of this.actors) if (a.hx === a.x && a.hy === a.y) chair(a.hx, a.hy + (a.dir === 2 ? 2 : -2), a.dir);
    // actors sorted by feet, table drawn at its own y
    const list = [...this.actors].sort((a, b) => a.y - b.y);
    const tableY = oy + 158 + 70;
    let tableDrawn = false;
    const drawTable = () => { if (this.phase === 'attack' || this.phase === 'snap' || this.phase === 'out') return; g.drawImage(this.bg, ox + 190, oy + 158, 260, 80, ox + 190, oy + 158, 260, 80); };
    for (const a of list) { if (!tableDrawn && a.y > tableY) { drawTable(); tableDrawn = true; } this.drawActor(g, a); }
    if (!tableDrawn) drawTable();
    // lanyard glow
    g.globalCompositeOperation = 'lighter';
    for (const a of this.actors) if (a.kind !== 'player') { const col = this.phase === 'attack' || this.phase === 'snap' ? 'rgba(255,120,90,' : 'rgba(127,240,216,'; for (let k = 3; k >= 1; k--) { g.fillStyle = col + (0.05 * a.glow * (4 - k) + 0.05).toFixed(3) + ')'; ellipse(g, a.x, a.y - 22, k * 3, k * 3, g.fillStyle); } }
    g.globalCompositeOperation = 'source-over';
    if (this.stapler) { const t = this.stapler.t / 0.45, p = this.A('player'); const x = this.stapler.fx + (p.x - this.stapler.fx) * t, y = this.stapler.fy + (p.y - 20 - this.stapler.fy) * t - Math.sin(t * Math.PI) * 18; rect(g, x - 4, y - 1, 8, 4, '#d03a32'); rect(g, x - 4, y - 1, 8, 1, '#ff7a6a'); rect(g, x + 2, y + 2, 2, 1, '#2a2a2a'); }
    // speech bubble above the player
    if (this.bubble) { const p = this.A('player'); const a = clamp(this.bubble.t * 5, 0, 1); this.drawBubble(g, this.bubble.text, p.x, p.y - 44, a); }
    // vignette + flashes
    if (this.phase === 'snap' || this.flashRed > 0) { g.fillStyle = `rgba(190,20,10,${(this.phase === 'snap' ? 0.2 + 0.08 * Math.sin(this.t * 10) : 0) + this.flashRed * 0.35})`; g.fillRect(0, 0, r.W, 6); g.fillRect(0, r.H - 6, r.W, 6); g.fillRect(0, 0, 6, r.H); g.fillRect(r.W - 6, 0, 6, r.H); g.fillStyle = `rgba(160,10,10,${this.flashRed * 0.35})`; g.fillRect(0, 0, r.W, r.H); }
    if (this.phase === 'turn' || this.phase === 'attack') { g.fillStyle = 'rgba(40,0,0,0.14)'; g.fillRect(0, 0, r.W, r.H); }
    this.drawSubtitle(g);
    // title slam on the snap
    if (this.phase === 'snap' && this.pt > 1.8) {
      const k = easeOutCubic((this.pt - 1.8) / 0.25);
      g.fillStyle = `rgba(255,255,255,${(this.flashWhite * 0.9).toFixed(3)})`; g.fillRect(0, 0, r.W, r.H);
      drawText(g, 'COMPANY POLICY', r.W / 2, Math.round(r.H / 2 - 18 - (1 - k) * 12), { scale: 4, align: 'center', color: '#14161f', shadow: null, outline: '#ffd34d', alpha: k });
    }
    if (this.flashWhite > 0 && this.phase !== 'snap') { g.fillStyle = `rgba(255,255,255,${this.flashWhite.toFixed(3)})`; g.fillRect(0, 0, r.W, r.H); }
    // UI
    this.ui.render(g);
    if (this.skipHold > 0) { const w = 60; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(r.W - w - 8, r.H - 14, w, 6); g.fillStyle = '#ffd34d'; g.fillRect(r.W - w - 8, r.H - 14, Math.round(w * clamp(this.skipHold, 0, 1)), 6); }
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${this.fade.toFixed(3)})`; g.fillRect(0, 0, r.W, r.H); }
    renderNotifications(g);
    this.ui.drawCursor(g);
  }

  private drawActor(g: Ctx, a: Actor): void {
    const x = Math.round(a.x), y = Math.round(a.y);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 7, y - 1, 14, 2);
    const anim: AnimName = a.sit && a.anim !== 'hit' && a.anim !== 'chant' && a.anim !== 'rage' ? 'sit' : a.anim;
    if (a.baked) a.baked.draw(g, anim, a.dir, a.t, x, y, { flash: a.flash, rage: a.id === 'player' && this.phase === 'snap' });
    else { rect(g, x - 5, y - 24, 10, 24, a.kind === 'player' ? '#3a6ea5' : '#a5503a'); rect(g, x - 4, y - 30, 8, 7, '#e8b996'); }
    if (a.flash > 0) { g.fillStyle = `rgba(255,255,255,${(a.flash * 0.5).toFixed(2)})`; g.fillRect(x - 6, y - 30, 12, 30); }
  }

  private drawScreen(g: Ctx): void {
    const ox = this.ox, oy = this.oy;
    const x = ox + 218, y = oy + 10, w = 204, h = 68;
    const st = this.screenText;
    const glitch = this.slideGlitch > 0;
    rect(g, x, y, w, h, st.col === '#7a1a1a' ? '#3a0c0c' : '#e8eef2');
    if (st.col !== '#7a1a1a') { for (let i = 0; i < w; i += 4) rect(g, x + i, y, 2, 3, '#2f5fa8'); rect(g, x, y + h - 4, w, 4, '#e8a33d'); }
    const title = st.title, tc = st.col === '#7a1a1a' ? '#ff6a5a' : '#14234a';
    const sc = measure(title, 2) > w - 12 ? 1 : 2;
    const jx = glitch ? Math.round(Math.sin(this.t * 90) * 2) : 0;
    drawText(g, title, x + w / 2 + jx, y + 14, { align: 'center', scale: sc, color: tc, shadow: null });
    wrap(st.sub, w - 16, 1).slice(0, 2).forEach((l, i) => drawText(g, l, x + w / 2, y + 36 + i * 10, { align: 'center', color: st.col === '#7a1a1a' ? '#ffb0a0' : '#3a4a6a', shadow: null }));
    if (this.screenText.title === 'REALIGNING...') { const p = clamp(this.pt / 2.0, 0, 1); rect(g, x + 14, y + h - 14, w - 28, 6, '#1a0606'); rect(g, x + 15, y + h - 13, Math.round((w - 30) * p), 4, '#ff6a5a'); }
    if (glitch) for (let i = 0; i < 4; i++) rect(g, x, y + ((this.t * 300 + i * 17) % h) | 0, w, 1, 'rgba(255,255,255,0.35)');
    // slide progress dots
    for (let i = 0; i < SLIDES.length; i++) rect(g, x + w - 8 - i * 7, y + h - 12, 4, 4, i <= this.slide ? '#e8a33d' : '#aab4c4');
    // light cone from the screen
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(180,210,255,0.04)'; for (let k = 0; k < 4; k++) g.fillRect(x - 6 - k * 6, y + h + k * 12, w + 12 + k * 12, 14); g.globalCompositeOperation = 'source-over';
  }

  private drawSubtitle(g: Ctx): void {
    const r = app.renderer;
    if (!this.sub.text || this.sub.t > this.sub.dur + 1.0 || this.phase === 'choice' || this.phase === 'snap' && this.pt > 1.7) return;
    const shown = this.sub.text.slice(0, Math.floor(this.sub.t * 46));
    const w = Math.min(r.W - 40, 420), lines = wrap(shown || ' ', w - 24, 1);
    const h = lines.length * 10 + 20;
    const x = Math.round((r.W - w) / 2), y = Math.round(r.H - h - 22 - r.safe.b);
    g.globalAlpha = this.sub.t > this.sub.dur ? clamp(1 - (this.sub.t - this.sub.dur), 0, 1) : 1;
    box(g, x, y, w, h, { face: 'rgba(0,0,0,0)', cham: 1, depth: 1 });
    g.fillStyle = 'rgba(6,8,14,0.88)'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = this.sub.who === 'YOU' ? '#ffd34d' : this.sub.who === 'ALL' ? '#7ff0d8' : '#8fb8e8';
    g.fillRect(x + 1, y + 1, 3, h - 2);
    drawText(g, this.sub.who === 'HR' ? 'HR BUSINESS PARTNER' : this.sub.who, x + 10, y + 4, { color: g.fillStyle as string, shadow: null });
    lines.forEach((l, i) => drawText(g, l, x + 10, y + 15 + i * 10, { color: '#f2f2ee', shadow: null }));
    g.globalAlpha = 1;
  }

  private drawBubble(g: Ctx, text: string, cx: number, tipY: number, a: number): void {
    const w = measure(text, 2) + 20, h = 24;
    const x = Math.round(cx - w / 2), y = Math.round(tipY - h - 6);
    g.globalAlpha = a;
    box(g, x, y, w, h, { face: '#fffdf6', cham: 2, depth: 2 });
    drawText(g, text, x + w / 2, y + 5, { align: 'center', scale: 2, color: '#14161f', shadow: null });
    g.fillStyle = '#14161f'; g.fillRect(Math.round(cx) - 3, y + h, 7, 1); g.fillRect(Math.round(cx) - 2, y + h + 1, 5, 1); g.fillRect(Math.round(cx) - 1, y + h + 2, 3, 1); g.fillRect(Math.round(cx), y + h + 3, 1, 1);
    g.globalAlpha = 1;
    void dim; void C;
  }
}

SCENES.intro = (onDone) => new IntroScene(onDone);
