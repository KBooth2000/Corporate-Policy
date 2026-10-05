// Android (Capacitor) glue. Call `initAndroid()` once at startup (from src/main.ts).
// It is a no-op in the browser and in Electron.
//
// Events dispatched on `window` for the game to hook:
//   'cp-back'  (CustomEvent) - hardware/gesture Back pressed. Handle it as "Pause / go back one menu".
//   'cp-pause' (Event)       - app is going to the background. Write the run-suspend save here.
//   'cp-resume'(Event)       - app returned to the foreground.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

let started = false;

export function initAndroid(): void {
  if (started) return;
  if (!Capacitor.isNativePlatform()) return;
  started = true;

  // Without a listener Capacitor would exit the app on Back; registering one stops that and hands control to the game.
  void App.addListener('backButton', () => {
    window.dispatchEvent(new CustomEvent('cp-back'));
  });
  void App.addListener('pause', () => {
    window.dispatchEvent(new Event('cp-pause'));
  });
  void App.addListener('resume', () => {
    window.dispatchEvent(new Event('cp-resume'));
  });
  // Lets the game quit from its menu on Android: window.dispatchEvent(new Event('cp-exit')).
  window.addEventListener('cp-exit', () => { void App.exitApp(); });
}
