// Boss art registry (lazy factories) + the set-piece gallery used by the dev scene.
import type { Ctx } from '../../render/canvas';
import type { BossArt } from './bake';
import { facilitiesArt } from './facilities';
import { salesArt } from './sales';

export const BOSS_ARTS: Record<string, () => BossArt> = {
  fm: facilitiesArt,
  sales: salesArt,
};

/** Dev gallery page for arena set pieces (filled in by props.ts). */
export let BOSS_PROPS_GALLERY: (g: Ctx, t: number, page: number) => void = () => {};
export function setPropsGallery(fn: typeof BOSS_PROPS_GALLERY): void { BOSS_PROPS_GALLERY = fn; }
