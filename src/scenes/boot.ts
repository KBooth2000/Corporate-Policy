// Boot: decides the first scene. Normal startup: CorpOS login (main menu) -> Decline -> opening sequence (first time) or the
// car park hub. Dev routes stay available: #dev=<gallery>, #play&seed=..., plus #hub, #intro, #menu for QA.
import { app, Scene, PLATFORM } from '../core/app';
import { drawText } from '../render/font';
import { rect } from '../render/canvas';
import { DEV_SCENES } from './dev/registry';
import '../game/autoload';
import { GameplayScene } from './gameplay';
import { newRun, planFloor } from '../game/run';
import { codeToSeed, randomSeed } from '../core/rng';
import { touch } from '../ui/touch';
import { audio } from '../audio/audio';
import type { PlayerRoleId } from '../data/ids';
import { SCENES } from '../game/registry';
import { profile } from '../game/profile';
import { CREDITS_LINES } from '../data/text/ui';
import { MainMenuScene } from './menu';
import { HubScene } from './hub';
import './summary';
import './intro';
import '../game/meta/progression';
import { continueShift, hasSuspend, startDaily, startNewRun, startSeeded } from '../game/meta/runs';
import { DailyPanel } from '../game/meta/ui/clockin';
import { GAME_VERSION, getPlatform } from '../platform/services';

// Auto-load every dev gallery module (each calls registerDev).
import.meta.glob('./dev/*.ts', { eager: true });

class FontTestScene implements Scene {
  name = 'fonttest';
  update(): void {}
  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#1c5e7a');
    drawText(g, 'COMPANY POLICY', r.W / 2, 40, { scale: 3, align: 'center', color: '#ffd34d' });
    drawText(g, 'Dev scenes: ' + [...DEV_SCENES.keys()].join(', '), 20, 100);
  }
}

/** Rolling credits (from the writing in data/text/ui.ts). Any input closes. */
class CreditsScene implements Scene {
  name = 'credits';
  private t = 0;
  private prevMode: 'gameplay' | 'menu' = 'menu';
  constructor(private onClose: () => void) {}
  enter(): void { this.prevMode = touch.mode; touch.setContext({ mode: 'menu' }); audio.music.play('credits', 1); }
  exit(): void { touch.setContext({ mode: this.prevMode }); }
  update(dt: number): void {
    this.t += dt; touch.update();
    const i = app.input;
    if (this.t > 0.5 && (i.pressed('back') || i.pressed('confirm') || i.pressed('pause') || i.clicks.length)) this.onClose();
  }
  render(): void {
    const r = app.renderer, g = r.f;
    rect(g, 0, 0, r.W, r.H, '#0b1220');
    drawText(g, 'COMPANY POLICY', r.W / 2, Math.round(r.H - this.t * 22), { scale: 3, align: 'center', color: '#ffd34d', outline: '#000' });
    CREDITS_LINES.forEach((l, i) => { const y = Math.round(r.H + 40 - this.t * 22 + i * 18); if (y > -10 && y < r.H + 10) drawText(g, l, r.W / 2, y, { align: 'center', color: '#e8e6f0' }); });
    drawText(g, 'Press any button to leave the building', r.W / 2, r.H - 14, { align: 'center', color: '#8fa6c8' });
    if (this.t * 22 > r.H + 40 + CREDITS_LINES.length * 18 + 40) this.onClose();
  }
}

/** The CorpOS login screen wired to the meta flow. */
export function makeMainMenu(): Scene {
  return new MainMenuScene({
    version: GAME_VERSION,
    hasContinue: hasSuspend(),
    onContinue: () => { continueShift(); },
    // DECLINE: first time the opening sequence plays (startNewRun routes through it); afterwards the car park hub
    onDecline: () => { if (!profile().seenIntro) startNewRun(); else app.reset(new HubScene()); },
    onDaily: () => { app.push(new DailyPanel(undefined, () => undefined)); },
    onSeeded: (seed) => startSeeded(seed),
    onCredits: () => { app.push(new CreditsScene(() => app.pop())); },
    onQuit: () => quit(),
  });
}

export function quit(): void {
  try {
    if (window.cpNative?.quit) window.cpNative.quit();
    else window.dispatchEvent(new Event('cp-exit'));
  } catch { /* nothing to do in a browser tab */ }
  void PLATFORM;
}

SCENES.mainMenu = makeMainMenu;

/** Parse hash params like #play&seed=XXXX-XXXX&floor=5&role=temp */
export function hashParams(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) { const [k, v] = part.split('='); if (k) out[k] = v ?? ''; }
  return out;
}

export function boot(): void {
  touch.attach(app.renderer.screen);
  getPlatform();
  const h = hashParams();
  const dev = h.dev && DEV_SCENES.get(h.dev);
  if (dev) { app.reset(dev()); return; }
  if ('play' in h) {
    const seed = (h.seed && codeToSeed(h.seed)) || (h.seed ? Number(h.seed) : randomSeed());
    const run = newRun({ seed, role: (h.role as PlayerRoleId) || 'office_worker' });
    if (h.floor) {
      const f = Number(h.floor);
      run.plan = planFloor(run, f, 0, { reward: 'weapon', type: (h.type as any) || 'standard' });
      run.floor = f;
    }
    app.reset(new GameplayScene(run));
    return;
  }
  if ('hub' in h) { app.reset(new HubScene({ open: h.open as never })); return; }
  if ('daily' in h) { startDaily(); return; }
  if ('intro' in h && SCENES.intro) { app.reset(SCENES.intro(() => app.reset(new HubScene()))); return; }
  app.reset(makeMainMenu());
}
