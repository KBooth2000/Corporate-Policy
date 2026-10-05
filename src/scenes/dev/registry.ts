// Dev/gallery scenes for visual QA. Each module adds its own file in src/scenes/dev/ that calls registerDev().
// Open with URL hash: http://localhost:5173/#dev=<name>
import type { Scene } from '../../core/app';

export const DEV_SCENES = new Map<string, () => Scene>();
export function registerDev(name: string, factory: () => Scene): void { DEV_SCENES.set(name, factory); }
