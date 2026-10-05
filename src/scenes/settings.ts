// "Control Panel": the settings screen (spec 2.5, 2.6, 7.3, 9.2). Everything applies live and persists.
import { app, Scene, isMobile, PLATFORM } from '../core/app';
import { defaultSettings, Settings } from '../core/settings';
import { audio } from '../audio/audio';
import { TELEGRAPH, TELEGRAPH_FILL, TELEGRAPH_CB, TELEGRAPH_CB_FILL } from '../art/palette';
import { Ctx } from '../render/canvas';
import { drawText, measure, wrap, LINE_H } from '../render/font';
import { touch } from '../ui/touch';
import {
  Widget, Ui, List, Tabs, Button, Toggle, Slider, Choice, KeyBind, Heading, Label, Spacer, rowH, btnH,
} from '../ui/widgets';
import { C, box, well, ink, drawGlyph, dim, clamp, textY, uiS, inRect, RectL } from '../ui/style';
import { drawWindow, drawDesktop, windowClient, OpenAnim, popRect } from '../ui/corpos';
import { ConfirmDialog, notify, updateNotifications, renderNotifications } from '../ui/corpos';

export interface SettingsOpts {
  /** true when opened from the pause menu (draws over the game, dimmed). */
  inGame?: boolean;
  /** Called after the player confirms "Reset all progress" twice. */
  onResetProgress?: () => void;
}

type TabId = 'display' | 'audio' | 'controls' | 'touch' | 'access' | 'gameplay' | 'privacy' | 'data';
const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'display', label: 'Display', glyph: 'camera' },
  { id: 'audio', label: 'Audio', glyph: 'bell' },
  { id: 'controls', label: 'Controls', glyph: 'key' },
  { id: 'touch', label: 'Touch', glyph: 'dot' },
  { id: 'access', label: 'Accessibility', glyph: 'user' },
  { id: 'gameplay', label: 'Gameplay', glyph: 'heart' },
  { id: 'privacy', label: 'Privacy', glyph: 'lock' },
  { id: 'data', label: 'Data', glyph: 'folder' },
];

// ---------------------------------------------------------------------------
// small custom widgets
class ColumnHeader extends Widget {
  override focusable = false;
  constructor(public cols: string[]) { super(); this.h = 12; }
  override draw(g: Ctx): void {
    const cx = this.x + Math.round(this.w * 0.42);
    const cw = this.x + this.w - cx - 4;
    const half = Math.floor((cw - 4) / 2);
    ink(g, 'Action', this.x + 7, this.y + 2, { color: C.inkDim });
    ink(g, this.cols[0], cx + half / 2, this.y + 2, { color: C.inkDim, align: 'center' });
    ink(g, this.cols[1], cx + half + 4 + half / 2, this.y + 2, { color: C.inkDim, align: 'center' });
    g.fillStyle = C.faceDark; g.fillRect(this.x, this.y + this.h - 1, this.w, 1);
  }
}

class Notice extends Widget {
  override focusable = false;
  lines: string[] = [];
  constructor(public text: string, public tone: 'info' | 'warn' | 'bad' = 'info', public glyph?: string) { super(); }
  override layout(): void {
    const s = uiS();
    this.lines = wrap(this.text, this.w - 40, s);
    this.h = Math.max(30, this.lines.length * LINE_H * s + 12);
  }
  override draw(g: Ctx): void {
    const s = uiS();
    const col = this.tone === 'warn' ? '#ffe9a0' : this.tone === 'bad' ? '#f7c9c4' : '#d8e6f4';
    const ic = this.tone === 'warn' ? '#a45c00' : this.tone === 'bad' ? '#a82828' : C.navy;
    box(g, this.x + 2, this.y, this.w - 4, this.h, { face: col, kind: 'sunken', cham: 1, depth: 1 });
    drawGlyph(g, this.glyph ?? (this.tone === 'info' ? 'info' : 'warn'), this.x + 16, this.y + this.h / 2, ic, 1);
    this.lines.forEach((l, i) => ink(g, l, this.x + 30, this.y + 6 + i * LINE_H * s, { scale: s }));
  }
}

class TelegraphPreview extends Widget {
  override focusable = false;
  constructor() { super(); this.h = 56; }
  override draw(g: Ctx): void {
    const cb = app.settings.colourblindTelegraphs;
    const w = Math.floor((this.w - 14) / 2);
    const items: { x: number; stroke: string; fill: string; label: string; on: boolean }[] = [
      { x: this.x + 4, stroke: TELEGRAPH, fill: TELEGRAPH_FILL, label: 'Standard', on: !cb },
      { x: this.x + 10 + w, stroke: TELEGRAPH_CB, fill: TELEGRAPH_CB_FILL, label: 'Colourblind-safe', on: cb },
    ];
    for (const it of items) {
      box(g, it.x, this.y, w, this.h, { face: '#3c3a33', kind: 'sunken', cham: 0, depth: 1 });
      for (let yy = 0; yy < this.h - 16; yy += 8) for (let xx = (yy / 8) % 2 ? 0 : 8; xx < w - 2; xx += 16) { g.fillStyle = '#464339'; g.fillRect(it.x + 1 + xx, this.y + 1 + yy, 8, 8); }
      // telegraph disc + cone with hatch edge for the CB variant
      const cx = it.x + Math.round(w * 0.3), cy = this.y + 22;
      g.fillStyle = it.fill;
      for (let y = -16; y <= 16; y++) { const sp = Math.floor(Math.sqrt(256 - y * y)); g.fillRect(cx - sp, cy + y, sp * 2, 1); }
      g.fillStyle = it.stroke;
      for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(an) * 16), Math.round(cy + Math.sin(an) * 16), 1, 1); g.fillRect(Math.round(cx + Math.cos(an) * 15), Math.round(cy + Math.sin(an) * 15), 1, 1); }
      // cone
      const ox = it.x + Math.round(w * 0.62);
      for (let i = 0; i < 28; i++) { const half = Math.round(i * 0.45); g.fillStyle = it.fill; g.fillRect(ox + i, cy - half, 1, half * 2 + 1); g.fillStyle = it.stroke; g.fillRect(ox + i, cy - half, 1, 1); g.fillRect(ox + i, cy + half, 1, 1); }
      g.fillStyle = it.stroke; g.fillRect(ox + 27, cy - 12, 1, 25);
      if (it.stroke === TELEGRAPH_CB) { g.fillStyle = '#0d0e14'; for (let i = 0; i < 28; i += 4) g.fillRect(ox + i, cy - Math.round(i * 0.45) - 1, 2, 1); }
      drawText(g, it.label, it.x + w / 2, this.y + this.h - 12, { color: '#fff', align: 'center' });
      if (it.on) { g.fillStyle = C.amber; g.fillRect(it.x, this.y - 2, w, 2); g.fillRect(it.x, this.y + this.h, w, 2); g.fillRect(it.x - 2, this.y - 2, 2, this.h + 4); g.fillRect(it.x + w, this.y - 2, 2, this.h + 4); drawGlyph(g, 'check', it.x + w - 8, this.y + 8, '#fff', 1); }
    }
  }
}

/** Mini preview scene: shows the real touch controls so size/opacity/handedness can be tuned. */
class TouchPreview implements Scene {
  name = 'touch-preview';
  private prev: 'gameplay' | 'menu' = 'menu';
  constructor(private onClose: () => void) {}
  enter(): void { this.prev = touch.mode; touch.attach(app.renderer.screen); touch.enabled = true; touch.setContext({ mode: 'gameplay', grab: true, interact: 'Interact', rageReady: true, ranged: true }); }
  exit(): void { touch.auto(); touch.setContext({ mode: this.prev, grab: false, interact: null, rageReady: false }); this.onClose(); }
  update(): void {
    touch.update();
    const i = app.input;
    if (i.pressed('back') || i.pressed('pause') || i.clicks.some((c) => c.button === 0 && c.y < 30 && Math.abs(c.x - app.renderer.W / 2) < 40)) { audio.sfx('ui_back'); app.pop(); }
  }
  render(): void {
    const g = app.renderer.f, r = app.renderer;
    g.fillStyle = '#26282f'; g.fillRect(0, 0, r.W, r.H);
    for (let y = 0; y < r.H; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < r.W; x += 32) { g.fillStyle = '#2d3039'; g.fillRect(x, y, 16, 16); }
    drawText(g, 'Touch controls preview', r.W / 2, r.H / 2 - 20, { align: 'center', color: '#fff', scale: 2 });
    drawText(g, 'Try the sticks and buttons. Tap the pause button to go back.', r.W / 2, r.H / 2 + 4, { align: 'center', color: '#cfd6e0' });
    touch.render(g);
  }
}

// ---------------------------------------------------------------------------
export class SettingsScene implements Scene {
  name = 'settings';
  transparent: boolean;
  private ui: Ui;
  private tabs: Tabs;
  private list = new List();
  private closeBtn: Button;
  private anim = new OpenAnim(7);
  private tab: TabId = 'display';
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private dirty = 0;
  private prevMode: 'gameplay' | 'menu' = 'gameplay';
  private lastDevice = '';
  private lastScale = 0;
  private closeRect: RectL = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private onClose: () => void, private opts: SettingsOpts = {}) {
    this.transparent = !!opts.inGame;
    this.ui = new Ui({ onBack: () => this.back() });
    this.tabs = new Tabs(TABS.map((t) => ({ label: t.label, glyph: t.glyph })), (i) => { this.tab = TABS[i].id; this.rebuild(); });
    this.closeBtn = new Button({ text: 'Close', kind: 'primary', onPress: () => this.close(), sound: 'ui_back' });
    this.ui.add(this.tabs); this.ui.add(this.list); this.ui.add(this.closeBtn);
    this.rebuild();
    this.ui.setFocus(this.tabs);
  }

  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    audio.sfx('ui_login');
  }
  exit(): void { this.flush(); touch.setContext({ mode: this.prevMode }); }
  resume(): void { touch.setContext({ mode: 'menu' }); }

  private back(): void {
    // from content: back to the category list first; from the list: close
    if (this.ui.focus && this.ui.focus !== this.tabs && this.ui.focus !== this.closeBtn) { this.ui.setFocus(this.tabs, false); return; }
    this.close();
  }
  private close(): void { this.flush(); audio.sfx('ui_back'); this.onClose(); }

  // ---- persistence
  private changed(): void { app.applySettings(); this.dirty = 0.5; }
  private flush(): void { if (this.dirty > 0) { app.saveSettings(); this.dirty = 0; } }
  private get S(): Settings { return app.settings; }

  private on<K extends keyof Settings>(k: K, v: Settings[K]): void { (this.S[k] as Settings[K]) = v; this.changed(); }
  private toggle(label: string, k: keyof Settings, onChange?: () => void): Toggle {
    return new Toggle(label, () => this.S[k] as boolean, (v) => { this.on(k, v as never); onChange?.(); });
  }
  private slider(label: string, get: () => number, set: (v: number) => void, min = 0, max = 1, step = 0.05, fmt?: (v: number) => string): Slider {
    return new Slider(label, get, (v) => { set(v); this.changed(); }, min, max, step, fmt);
  }
  private choice<T>(label: string, options: { value: T; label: string }[], get: () => T, set: (v: T) => void): Choice<T> {
    return new Choice(label, options, get, (v) => { set(v); this.changed(); });
  }

  // ---- tab content
  private rebuild(): void {
    const S = this.S;
    const items: Widget[] = [];
    const head = (t: string, g?: string) => items.push(new Heading(t, g));
    const note = (t: string, tone: 'info' | 'warn' | 'bad' = 'info') => items.push(new Notice(t, tone));
    const text = (t: string, dimc = true) => { items.push(new Label(t, { dim: dimc, scale: uiS() })); };
    const vol = () => audio.setVolumes(S.volMaster, S.volMusic, S.volSfx, S.volVoice);
    switch (this.tab) {
      case 'display': {
        head('Display', 'camera');
        if (PLATFORM !== 'android') items.push(this.toggle('Fullscreen', 'fullscreen', () => this.applyFullscreen()));
        items.push(this.choice<1 | 2>('UI scale', [{ value: 1, label: 'Standard' }, { value: 2, label: 'Large (2x)' }], () => S.uiScale, (v) => { S.uiScale = v; }));
        items.push(this.toggle('Reduced lights', 'reducedLights'));
        items.push(this.choice<'locked60' | 'unlocked'>('Frame rate', [{ value: 'locked60', label: '60 FPS (locked)' }, { value: 'unlocked', label: 'Unlocked (high refresh)' }], () => S.fpsMode, (v) => { S.fpsMode = v; }));
        items.push(this.toggle('Show FPS counter', 'showFps'));
        items.push(new Spacer(4));
        text('"Reduced lights" cuts dynamic lighting to protect battery and frame rate on weaker devices.');
        break;
      }
      case 'audio': {
        head('Volume', 'bell');
        items.push(this.slider('Master', () => S.volMaster, (v) => { S.volMaster = v; vol(); }));
        items.push(this.slider('Music', () => S.volMusic, (v) => { S.volMusic = v; vol(); }));
        items.push(this.slider('Sound effects', () => S.volSfx, (v) => { S.volSfx = v; vol(); }));
        items.push(this.slider('Voices', () => S.volVoice, (v) => { S.volVoice = v; vol(); }));
        items.push(new Button({ text: 'Play test sound', glyph: 'play', onPress: () => audio.sfx('ui_notify'), sound: null }));
        head('Captions', 'doc');
        items.push(this.toggle('Subtitles', 'subtitles'));
        items.push(this.choice<1 | 2>('Subtitle size', [{ value: 1, label: 'Normal' }, { value: 2, label: 'Large' }], () => S.subtitleSize, (v) => { S.subtitleSize = v; }));
        items.push(this.toggle('Visual audio cues', 'visualAudioCues'));
        text('Visual audio cues show an on-screen indicator for off-screen sounds such as alarms and telegraphs.');
        break;
      }
      case 'controls': {
        head('Bindings', 'key');
        if (app.input.device === 'touch') note('Touch controls are set up on the Touch tab. These bindings apply to keyboard, mouse and controllers.');
        else text('Select a row and press confirm, then press the new key, mouse button or controller button. Esc cancels.');
        items.push(new ColumnHeader(['Keyboard / Mouse', 'Gamepad']));
        const rows: [string, 'melee' | 'heavy' | 'ranged' | 'grab' | 'dash' | 'rage' | 'interact' | 'pause'][] = [
          ['Melee attack', 'melee'], ['Heavy attack', 'heavy'], ['Ranged / throw', 'ranged'], ['Grab', 'grab'], ['Dash', 'dash'], ['Rage', 'rage'], ['Interact', 'interact'], ['Pause', 'pause'],
        ];
        for (const [label, action] of rows) items.push(new KeyBind({ label, action }));
        head('Movement', 'slider');
        for (const [label, k] of [['Move up', 'up'], ['Move down', 'down'], ['Move left', 'left'], ['Move right', 'right']] as const) items.push(new KeyBind({ label, moveKey: k, padFixed: 'L-Stick' }));
        head('Combat feel', 'star');
        items.push(this.choice<'hold' | 'button'>('Heavy attack', [{ value: 'hold', label: 'Hold melee to charge' }, { value: 'button', label: 'Separate button' }], () => S.heavyMode, (v) => { S.heavyMode = v; }));
        items.push(this.toggle('Hold-to-tap (no holding)', 'holdToTap'));
        items.push(this.slider('Aim assist (controller)', () => S.aimAssistPad, (v) => { S.aimAssistPad = v; }));
        items.push(this.toggle('Controller rumble', 'rumble'));
        items.push(new Spacer(4));
        items.push(new Button({ text: 'Reset controls to defaults', kind: 'danger', glyph: 'warn', onPress: () => this.ui.openModal(new ConfirmDialog({
          title: 'Reset controls', message: 'Restore every key, mouse and controller binding to its default?', confirmText: 'Reset', danger: true,
          onConfirm: () => { app.input.resetBindings(); this.dirty = 0.01; this.changed(); this.rebuild(); notify({ title: 'Controls reset', body: 'Defaults restored.', kind: 'info' }); },
        })) }));
        break;
      }
      case 'touch': {
        head('Touch controls', 'dot');
        if (app.input.device !== 'touch' && !touch.enabled) note('Touch controls only appear on touch devices. You can still tune them here.');
        items.push(this.slider('Stick size', () => S.touchLayout.stickSize, (v) => { S.touchLayout.stickSize = v; }, 0.7, 1.5, 0.1, (v) => Math.round(v * 100) + '%'));
        items.push(this.slider('Button size', () => S.touchLayout.buttonSize, (v) => { S.touchLayout.buttonSize = v; }, 0.7, 1.5, 0.1, (v) => Math.round(v * 100) + '%'));
        items.push(this.slider('Opacity', () => S.touchLayout.opacity, (v) => { S.touchLayout.opacity = v; }, 0.2, 1, 0.05));
        items.push(new Toggle('Left-handed layout', () => S.touchLayout.leftHanded, (v) => { S.touchLayout.leftHanded = v; this.changed(); }));
        items.push(this.slider('Aim assist', () => Math.max(0.2, S.aimAssist), (v) => { S.aimAssist = Math.max(0.2, v); }, 0.2, 1, 0.05));
        text('Touch aim assist cannot be switched off: it keeps the aim stick usable on a small screen.');
        items.push(new Spacer(4));
        items.push(new Button({ text: 'Preview controls', glyph: 'play', onPress: () => { this.flush(); app.push(new TouchPreview(() => undefined)); } }));
        break;
      }
      case 'access': {
        head('Comfort', 'user');
        items.push(this.toggle('Screen shake', 'screenShake'));
        const sh = this.slider('Screen shake intensity', () => S.shakeIntensity, (v) => { S.shakeIntensity = v; }, 0, 1.5, 0.1, (v) => Math.round(v * 100) + '%');
        items.push(sh);
        items.push(this.toggle('Hit-stop (impact freeze)', 'hitStop'));
        items.push(this.toggle('Rage auto-trigger', 'rageAutoTrigger'));
        items.push(this.toggle('Hold-to-tap (no holding)', 'holdToTap'));
        head('Telegraph colours', 'warn');
        items.push(this.choice<boolean>('Palette', [{ value: false, label: 'Standard' }, { value: true, label: 'Colourblind-safe' }], () => S.colourblindTelegraphs, (v) => { S.colourblindTelegraphs = v; }));
        items.push(new TelegraphPreview());
        text('Attack warnings use this colour and nothing else in the game does.');
        head('Content', 'skull');
        items.push(this.choice<'full' | 'reduced' | 'off'>('Gore', [{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }], () => S.gore, (v) => { S.gore = v; }));
        items.push(this.choice<'always' | 'first' | 'off'>('Execution cutscenes', [{ value: 'always', label: 'Always' }, { value: 'first', label: 'First time only' }, { value: 'off', label: 'Off' }], () => S.cutscenes, (v) => { S.cutscenes = v; }));
        break;
      }
      case 'gameplay': {
        head('Workplace Adjustments', 'heart');
        text('An optional assist mode for anyone who wants the paperwork without the pain.');
        const en = new Toggle('Enable Workplace Adjustments', () => S.assist.enabled, (v) => { S.assist.enabled = v; this.changed(); this.rebuild(); });
        items.push(en);
        const dmg = this.slider('Damage taken', () => S.assist.damageTaken, (v) => { S.assist.damageTaken = v; }, 0.25, 1, 0.05);
        const spd = this.slider('Game speed', () => S.assist.gameSpeed, (v) => { S.assist.gameSpeed = v; }, 0.6, 1, 0.05);
        dmg.enabled = spd.enabled = S.assist.enabled;
        items.push(dmg, spd);
        items.push(new Spacer(2));
        note('Runs played with Workplace Adjustments are excluded from the daily leaderboards and are marked on your stats screen. HR keeps a record. HR keeps a record of everything.', 'warn');
        break;
      }
      case 'privacy': {
        head('Privacy and telemetry', 'lock');
        items.push(this.toggle('Share anonymous usage data', 'telemetryOptIn'));
        items.push(new Spacer(2));
        text('Off by default. If you switch it on, we collect anonymous gameplay data: which floor you reached, how long a run lasted, crashes and a rough device class. That is it.', false);
        text('We never collect your name, email address, contacts, location or advertising ID, and we never sell data or build advertising profiles.', false);
        text('Under UK GDPR our legal basis is your consent (Article 6(1)(a)). You can withdraw it at any time by switching this off, and nothing further will be sent. You may also ask us to delete data already collected.', false);
        break;
      }
      case 'data': {
        head('Your data', 'folder');
        text('Saves and settings are stored on this device only. Uninstalling the game removes them.');
        items.push(new Spacer(4));
        items.push(new Button({ text: 'Reset settings to defaults', glyph: 'gear', onPress: () => this.ui.openModal(new ConfirmDialog({
          title: 'Reset settings', message: 'Restore all settings (not your progress) to their defaults?', confirmText: 'Reset', danger: true,
          onConfirm: () => { Object.assign(S, defaultSettings(isMobile)); app.input.resetBindings(); this.dirty = 0.01; this.changed(); vol(); this.rebuild(); notify({ title: 'Settings reset', kind: 'info' }); },
        })) }));
        head('Danger zone', 'warn');
        note('Resetting progress deletes all unlocks, stats and currencies. It cannot be undone.', 'bad');
        items.push(new Button({ text: 'Reset all progress', kind: 'danger', glyph: 'skull', onPress: () => this.confirmReset() }));
        break;
      }
    }
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
  }

  private confirmReset(): void {
    this.ui.openModal(new ConfirmDialog({
      title: 'Reset all progress', danger: true, confirmText: 'Continue', cancelText: 'Keep my progress',
      message: 'This will permanently delete all unlocks, currencies, statistics and saved runs.',
      onConfirm: () => {
        this.ui.openModal(new ConfirmDialog({
          title: 'Final confirmation', danger: true, confirmText: 'Delete everything', cancelText: 'Cancel',
          message: 'Are you absolutely sure? HR will not be able to restore it, and neither will anyone else.',
          onConfirm: () => { this.opts.onResetProgress?.(); notify({ title: 'Progress reset', body: 'Your record has been shredded.', kind: 'bad' }); },
        }));
      },
    }));
  }

  private applyFullscreen(): void {
    const on = this.S.fullscreen;
    try {
      if (window.cpNative?.setFullscreen) window.cpNative.setFullscreen(on);
      else if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    } catch { /* ignore */ }
  }

  // ---- loop
  update(dt: number): void {
    touch.update();
    updateNotifications(dt);
    this.anim.step(dt);
    if (this.dirty > 0) { this.dirty -= dt; if (this.dirty <= 0) { app.saveSettings(); this.dirty = 0; } }
    const r = app.renderer, s = uiS();
    const aw = r.W - r.safe.l - r.safe.r, ah = r.H - r.safe.t - r.safe.b;
    const ww = Math.min(aw - 12, 628), wh = Math.min(ah - 8, 346);
    this.win = { x: Math.round(r.safe.l + (aw - ww) / 2), y: Math.round(r.safe.t + (ah - wh) / 2), w: ww, h: wh };
    const cl = windowClient(this.win, true);
    const compact = s === 2 || cl.w < 420;
    this.tabs.vertical = !compact; this.tabs.compact = false;
    const footH = btnH() + 8;
    const sbW = compact ? 0 : Math.min(128, Math.round(cl.w * 0.2));
    if (compact) {
      // horizontal icon strip on top
      this.tabs.vertical = false; this.tabs.compact = true;
      this.tabs.set(cl.x + 2, cl.y + 2, cl.w - 4, rowH() + 6);
      this.list.set(cl.x + 2, cl.y + rowH() + 12, cl.w - 4, cl.h - footH - rowH() - 14);
    } else {
      this.tabs.set(cl.x + 2, cl.y + 2, sbW, cl.h - footH - 4);
      this.list.set(cl.x + sbW + 8, cl.y + 2, cl.w - sbW - 10, cl.h - footH - 4);
    }
    this.list.padX = 2;
    const cw = Math.max(this.closeBtn.autoW(14), 80);
    this.closeBtn.set(cl.x + cl.w - cw - 2, cl.y + cl.h - footH + 4, cw, btnH());
    // rebuild when the device or UI scale changes (touch-friendly sizes, labels)
    for (const c of app.input.clicks) if (c.button === 0 && this.anim.done && inRect(this.closeRect, c.x, c.y)) { this.close(); return; }
    const key = app.input.device + '|' + s;
    if (key !== this.lastDevice) { this.lastDevice = key; if (this.lastScale) this.rebuild(); this.lastScale = s; }
    this.ui.update(dt);
  }

  render(): void {
    const g = app.renderer.f;
    if (this.transparent) dim(g, 0.55 * this.anim.t); else drawDesktop(g, 'teal');
    const rr = this.anim.done ? this.win : popRect(this.win, this.anim.t);
    const tab = TABS.find((t) => t.id === this.tab)!;
    const st = this.dirty > 0 ? 'Applying changes...' : 'Changes are applied and saved automatically.';
    const res = drawWindow(g, 'Control Panel - ' + tab.label, rr, { icon: 'gear', status: st, close: true });
    this.closeRect = res.close;
    if (!this.anim.done) { return; }
    const cl = res.client;
    // content well
    const L = this.list;
    box(g, L.x - 2, L.y - 1, L.w + 4, L.h + 2, { face: C.face, kind: 'sunken', cham: 0, depth: 1 });
    this.ui.render(g);
    const hy = cl.y + cl.h - btnH() - 4 + Math.round((btnH() - 9 * uiS()) / 2) + 1;
    this.ui.drawHints(g, cl.x + 4, hy, cl.w - this.closeBtn.w - 16, undefined, 'left');
    renderNotifications(g);
    this.ui.drawCursor(g);
  }
}
