import type { MusicTrack } from '../audio';
import type { TrackDef } from '../sequencer';
import { ACT1, ACT2, ACT3, ACT4 } from './acts';
import { BOSS1, BOSS2, BOSS3, BOSS4, CEO_FINALE } from './bosses';
import { MENU, HUB, SHOP, LIFT, EVENT, DAILY, CREDITS } from './misc';

export const TRACKS: Partial<Record<MusicTrack, TrackDef>> = {
  menu: MENU, hub: HUB, act1: ACT1, act2: ACT2, act3: ACT3, act4: ACT4,
  boss1: BOSS1, boss2: BOSS2, boss3: BOSS3, boss4: BOSS4, ceo_finale: CEO_FINALE,
  shop: SHOP, lift: LIFT, credits: CREDITS, event: EVENT, daily: DAILY,
};
