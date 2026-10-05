// Application shell: fixed-step loop, scene stack, global services.
import { Renderer } from '../render/renderer';
import { Input } from './input';
import { Settings, defaultSettings } from './settings';
import { loadVersioned, saveVersioned } from './storage';
import { audio } from '../audio/audio';

export interface Scene {
  /** Called when pushed/made active. */
  enter?(): void;
  /** Called when removed. */
  exit?(): void;
  /** Called when a scene above this one is popped. */
  resume?(): void;
  update(dt: number): void;
  render(): void;
  /** If true, the scene below is rendered first (pause menus, pop-ups). */
  transparent?: boolean;
  /** Name for debugging/telemetry. */
  name?: string;
}

export const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window && navigator.maxTouchPoints > 1 && !/Windows|Macintosh|Linux x86/.test(navigator.userAgent));
export const isElectron = typeof window !== 'undefined' && !!window.cpNative;
export const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
export const PLATFORM: 'pc' | 'android' | 'web' = isElectron ? 'pc' : isCapacitor || /Android/i.test(navigator.userAgent) ? 'android' : 'web';
/** Spec 4.8 / 10.4 */
export const MAX_ACTIVE_ENEMIES = PLATFORM === 'android' ? 8 : 12;

const SETTINGS_KEY = 'settings';
const SETTINGS_VERSION = 1;

export const STEP = 1 / 60;

class App {
  renderer!: Renderer;
  input!: Input;
  settings!: Settings;
  scenes: Scene[] = [];
  time = 0;            // real seconds since boot
  frame = 0;
  hitstop = 0;         // seconds of frozen gameplay
  timeScale = 1;       // assist game speed etc
  fps = 60;
  private acc = 0;
  private last = 0;
  private fpsAcc = 0; private fpsFrames = 0;
  private pending: (() => void)[] = [];
  onBackground: (() => void)[] = [];

  init(canvas: HTMLCanvasElement): void {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, (x, y) => this.renderer.toInternal(x, y));
    this.settings = { ...defaultSettings(isMobile), ...(loadVersioned<Settings>(SETTINGS_KEY, SETTINGS_VERSION) ?? {}) };
    this.applySettings();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) for (const fn of this.onBackground) fn();
    });
    window.addEventListener('pagehide', () => { for (const fn of this.onBackground) fn(); });
  }

  applySettings(): void {
    const s = this.settings;
    this.renderer.shakeEnabled = s.screenShake;
    this.renderer.shakeMult = s.shakeIntensity;
    if (s.bindings) this.input.bindings = structuredClone(s.bindings);
    if (s.moveKeys) this.input.moveKeys = { ...s.moveKeys };
    this.input.rumbleEnabled = s.rumble;
    audio.setVolumes(s.volMaster, s.volMusic, s.volSfx, s.volVoice);
    this.applyFullscreen();
  }

  applyFullscreen(): void {
    const on = this.settings.fullscreen;
    if (window.cpNative?.setFullscreen) { window.cpNative.setFullscreen(on); return; }
    if (isCapacitor) return; // Android is always immersive fullscreen
    try {
      if (on && !document.fullscreenElement && (navigator as any).userActivation?.isActive) document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    } catch { /* needs a user gesture on web */ }
  }

  saveSettings(): void {
    this.settings.bindings = structuredClone(this.input.bindings);
    this.settings.moveKeys = { ...this.input.moveKeys };
    saveVersioned(SETTINGS_KEY, SETTINGS_VERSION, this.settings);
    this.applySettings();
  }

  get top(): Scene | undefined { return this.scenes[this.scenes.length - 1]; }

  /** Scene changes are deferred to the end of the current update to keep iteration safe. */
  push(s: Scene): void { this.pending.push(() => { this.scenes.push(s); s.enter?.(); }); }
  pop(): void { this.pending.push(() => { const s = this.scenes.pop(); s?.exit?.(); this.top?.resume?.(); }); }
  replace(s: Scene): void { this.pending.push(() => { const o = this.scenes.pop(); o?.exit?.(); this.scenes.push(s); s.enter?.(); }); }
  /** Clear the whole stack and set a single scene. */
  reset(s: Scene): void { this.pending.push(() => { while (this.scenes.length) this.scenes.pop()!.exit?.(); this.scenes.push(s); s.enter?.(); }); }
  /** Pop the given scene wherever it is in the stack. */
  remove(s: Scene): void { this.pending.push(() => { const i = this.scenes.indexOf(s); if (i >= 0) { this.scenes.splice(i, 1); s.exit?.(); if (i === this.scenes.length) this.top?.resume?.(); } }); }

  private flush(): void {
    while (this.pending.length) this.pending.shift()!();
  }

  start(): void {
    this.flush();
    this.last = performance.now();
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.time += dt;
      this.acc += dt;
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
      let stepped = false;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.acc -= STEP;
        steps++;
        this.step();
        stepped = true;
      }
      if (steps >= 5) this.acc = 0;
      if (stepped || this.settings.fpsMode === 'unlocked') this.draw();
    };
    requestAnimationFrame(tick);
  }

  /** One fixed simulation step (exposed for automated tests). */
  step(): void {
    this.frame++;
    this.input.update(STEP);
    this.renderer.update(STEP);
    const top = this.top;
    top?.update(STEP);
    this.input.endFrame();
    this.flush();
  }

  draw(): void {
    // render from the lowest non-covered scene upward
    let start = this.scenes.length - 1;
    while (start > 0 && this.scenes[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.scenes.length; i++) this.scenes[i].render();
    this.renderer.present();
  }
}

export const app = new App();
