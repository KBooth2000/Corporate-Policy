// Player settings (spec 2.6 accessibility, 1.3 gore toggle, 4.7 cutscene setting, 9.2 UI scaling, 7.3 assist mode).
import type { Bindings, MoveKeys } from './input';

export type GoreLevel = 'full' | 'reduced' | 'off';
export type CutsceneMode = 'always' | 'first' | 'off';

export interface Settings {
  gore: GoreLevel;
  screenShake: boolean;
  shakeIntensity: number; // 0..1.5
  hitStop: boolean;
  colourblindTelegraphs: boolean;
  aimAssist: number; // 0..1 (mandatory > 0 on touch, default 0.6)
  aimAssistPad: number; // 0..1 for controllers
  cutscenes: CutsceneMode;
  heavyMode: 'hold' | 'button'; // hold-to-charge, or dedicated heavy button only
  holdToTap: boolean; // convert hold interactions to taps (accessibility)
  rageAutoTrigger: boolean; // accessibility: activate rage automatically when full
  subtitles: boolean;
  subtitleSize: 1 | 2;
  visualAudioCues: boolean;
  volMaster: number; volMusic: number; volSfx: number; volVoice: number;
  uiScale: 1 | 2;
  reducedLights: boolean;
  fpsMode: 'locked60' | 'unlocked';
  fullscreen: boolean;
  showFps: boolean;
  rumble: boolean;
  touchLayout: { stickSize: number; buttonSize: number; opacity: number; leftHanded: boolean };
  bindings: Bindings | null;
  moveKeys: MoveKeys | null;
  /** Workplace Adjustments assist mode (7.3). */
  assist: { enabled: boolean; damageTaken: number; gameSpeed: number };
  telemetryOptIn: boolean;
  language: string;
}

export function defaultSettings(isMobile: boolean): Settings {
  return {
    gore: 'full',
    screenShake: true,
    shakeIntensity: 1,
    hitStop: true,
    colourblindTelegraphs: false,
    aimAssist: isMobile ? 0.6 : 0,
    aimAssistPad: 0.45,
    cutscenes: 'always',
    heavyMode: 'hold',
    holdToTap: false,
    rageAutoTrigger: false,
    subtitles: true,
    subtitleSize: isMobile ? 2 : 1,
    visualAudioCues: isMobile, // phones are often played muted (spec 9.3 accessibility)
    volMaster: 0.8, volMusic: 0.7, volSfx: 0.85, volVoice: 0.85,
    uiScale: 1,
    reducedLights: isMobile,
    fpsMode: 'locked60',
    fullscreen: true,
    showFps: false,
    rumble: true,
    touchLayout: { stickSize: 1, buttonSize: 1, opacity: 0.55, leftHanded: false },
    bindings: null,
    moveKeys: null,
    assist: { enabled: false, damageTaken: 1, gameSpeed: 1 },
    telemetryOptIn: false,
    language: 'en-GB',
  };
}
