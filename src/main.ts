import { app } from './core/app';
import { audio } from './audio/audio';
import { boot } from './scenes/boot';
import { initAndroid } from './platform/android';
import { installCrashReporter } from './platform/crash';
import { getPlatform } from './platform/services';

// The audio module registers its synthesis engine from src/audio/engine.ts. The glob is a no-op until that file exists,
// so the game keeps running with the silent stub in the meantime (no try/catch needed: a missing file matches nothing).
import.meta.glob('./audio/engine.ts', { eager: true });

installCrashReporter();

const canvas = document.getElementById('screen') as HTMLCanvasElement;
app.init(canvas);
initAndroid();

// Web Audio may only start after a user gesture: unlock on the first pointer / key / touch / gamepad interaction.
let unlocked = false;
const unlock = () => {
  if (unlocked) return;
  unlocked = true;
  audio.unlock();
  const s = app.settings;
  audio.setVolumes(s.volMaster, s.volMusic, s.volSfx, s.volVoice);
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.removeEventListener(ev, unlock, true);
  clearInterval(padPoll);
};
for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.addEventListener(ev, unlock, true);
const padPoll = setInterval(() => {
  try { for (const p of navigator.getGamepads?.() ?? []) if (p && (p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.6))) { unlock(); return; } } catch { /* */ }
}, 200);

// Quit: the main menu's Shut Down icon dispatches 'cp-exit' on Android (handled in platform/android.ts); on PC the Electron preload exposes quit().
window.addEventListener('cp-exit', () => { try { window.cpNative?.quit?.(); } catch { /* */ } });

boot();
app.start();
getPlatform().telemetry.record('app_start', {});

// Expose for automated tests / debug console.
(window as any).__cp = { app };
