import { app } from './core/app';
import { boot } from './scenes/boot';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
app.init(canvas);
boot();
app.start();

// Expose for automated tests / debug console.
(window as any).__cp = { app };
