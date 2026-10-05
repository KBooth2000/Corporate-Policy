// Art bible palettes (spec 9.1). The colour story is the escalation.
import type { Act } from '../data/ids';
import { app } from '../core/app';

/** Reserved telegraph colour: appears NOWHERE else in the game's art (spec 9.1 readability). */
export const TELEGRAPH = '#ff2bd6';
export const TELEGRAPH_FILL = 'rgba(255,43,214,0.28)';
/** Colourblind-safe alternative (spec 2.6): high-luminance yellow + dark hatch edge. */
export const TELEGRAPH_CB = '#ffe600';
export const TELEGRAPH_CB_FILL = 'rgba(255,230,0,0.30)';

export function telegraphColour(): { stroke: string; fill: string; cb: boolean } {
  const cb = app.settings?.colourblindTelegraphs ?? false;
  return cb ? { stroke: TELEGRAPH_CB, fill: TELEGRAPH_CB_FILL, cb } : { stroke: TELEGRAPH, fill: TELEGRAPH_FILL, cb };
}

export const OUTLINE = '#0d0e14';
export const BLOOD = ['#8a0f14', '#a3161b', '#6b0b10', '#c0262a'];
export const BLOOD_DRY = '#4a0a0d';

export interface ActPalette {
  name: string;
  floor: string[];      // floor tones light->dark
  wall: string[];       // wall tones (top, face, shadow)
  accent: string[];     // brand/accent colours
  light: string;        // dominant light colour
  ambient: string;      // ambient overlay tint
  ui: string;           // HUD accent
}

export const ACT_PALETTES: Record<Act, ActPalette> = {
  1: { name: 'Fluorescent Beige', floor: ['#b9ad95', '#a49880', '#8d826c', '#73695a'], wall: ['#d8d2c4', '#a79f8f', '#6e675c'], accent: ['#5d7a8c', '#8aa0a8', '#c7b26a', '#6f8a5a'], light: '#f1f6e4', ambient: '#c8cfb8', ui: '#9fb7c4' },
  2: { name: 'Brand Neon', floor: ['#3a3f5c', '#30344d', '#262a3e', '#1d2030'], wall: ['#e8e6f0', '#9aa0c0', '#4c5070'], accent: ['#ff6a00', '#00d1c1', '#ffd400', '#3d7bff'], light: '#e9f1ff', ambient: '#8090ff', ui: '#00d1c1' },
  3: { name: 'Archive Navy', floor: ['#3e3a33', '#34302a', '#2a2722', '#201e1a'], wall: ['#3c4a66', '#2b3650', '#1a2236'], accent: ['#8a6a43', '#b8925a', '#5a7398', '#c8c0a8'], light: '#dfe8ff', ambient: '#5a6c90', ui: '#b8925a' },
  4: { name: 'Gold & Marble', floor: ['#e9e4dc', '#d8d1c4', '#c2b9aa', '#a69c8c'], wall: ['#7a1420', '#5c0e18', '#3a0910'], accent: ['#d4a537', '#f2d27a', '#a01828', '#2a2a2a'], light: '#ffe2b0', ambient: '#c08040', ui: '#d4a537' },
};

/** Skin tones (diverse, UK office). */
export const SKIN = ['#f3d2b8', '#e8b996', '#d29f7a', '#b98260', '#9b6a4a', '#7a4f36', '#5c3a27', '#f0c8a8'];
export const HAIR = ['#1e1611', '#3b2a1e', '#6b4a2b', '#a77b4a', '#d8b26a', '#e8d9b0', '#8a8a8a', '#c9c9c9', '#9a3d1c', '#2a2a3a'];

/** CorpOS UI palette. */
export const UI = {
  desktop: '#1c5e7a',
  desktopDark: '#123f53',
  window: '#e6e3dc',
  windowDark: '#c4c0b6',
  titleBar: '#25467a',
  titleBarActive: '#2f5fa8',
  titleText: '#ffffff',
  text: '#1a1a1e',
  textDim: '#5a5a62',
  textLight: '#f2f2ee',
  highlight: '#ffd34d',
  focus: '#ffb000',
  good: '#3fbf6a',
  bad: '#e04545',
  warn: '#ffb000',
  rage: '#ff3a2a',
  shield: '#5ec8ff',
  hp: '#4fdc7a',
  cash: '#ffd34d',
  leave: '#9be37b',
  panel: 'rgba(14,16,22,0.82)',
  panelLine: '#3a4250',
};

export const RARITY_COLOURS = ['#c9cdd4', '#5ec8ff', '#ffc53d'] as const; // Standard, Enhanced, Executive
export const RARITY_NAMES = ['Standard', 'Enhanced', 'Executive'] as const;
