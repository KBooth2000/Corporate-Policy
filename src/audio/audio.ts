// AUDIO CONTRACT (spec 9.3). Implementation owned by the audio module.
// Everything is synthesised at runtime with Web Audio — no external audio files.
// Gameplay code calls only the functions exported here.

/** Every SFX gameplay may request. The audio module must implement all of these (and may add more). */
export const SFX_NAMES = [
  // UI / CorpOS
  'ui_move', 'ui_select', 'ui_back', 'ui_error', 'ui_notify', 'ui_email', 'ui_purchase', 'ui_unlock', 'ui_typing', 'ui_login', 'ui_logout', 'ui_toggle', 'ui_slide',
  // building
  'lift_chime', 'lift_doors', 'lift_motor', 'stairs_steps', 'door_lock', 'door_unlock', 'alarm', 'room_clear', 'floor_clear', 'exit_open', 'car_door', 'car_engine',
  // player
  'step', 'dash', 'swing_light', 'swing_heavy', 'charge', 'hit_blunt', 'hit_sharp', 'hit_flesh', 'crit', 'shield_hit', 'shield_break', 'shield_regen',
  'hurt', 'player_death', 'rage_ready', 'rage_activate', 'rage_end', 'grab', 'throw', 'whoosh', 'execution_impact', 'pickup_weapon', 'pickup_cash',
  'pickup_heal', 'pickup_item', 'weapon_break', 'out_of_ammo', 'stapler_fire', 'nailgun_fire', 'laser_fire', 'tape_fire', 'confetti_fire', 'heal', 'kick', 'block',
  // enemies
  'enemy_hurt', 'enemy_death', 'gore_splat', 'dismember', 'telegraph', 'telegraph_heavy', 'enemy_swing', 'enemy_throw', 'projectile_hit', 'whistle', 'mop_slosh', 'slip',
  'electric_zap', 'scream', 'hold_music', 'gong', 'calculator_beep', 'injunction', 'shield_up', 'purchase_order', 'teleport', 'laser', 'golf_swing', 'power_pose',
  'wellbeing_chime', 'chant', 'cheer', 'revive', 'rebrand', 'mark', 'promotion', 'paper_rustle', 'phone_ring', 'energy_drink',
  // hazards / environment
  'glass_shatter', 'printer_beep', 'explosion', 'water_splash', 'extinguisher_burst', 'chair_roll', 'cabinet_topple', 'sprinkler', 'wall_breach', 'debris',
  'server_spark', 'microwave_ding', 'microwave_hum', 'shredder', 'hand_dryer', 'photocopier', 'window_smash', 'thud', 'kettle', 'vending_buy', 'fall_whistle', 'splat_far',
  // bosses
  'boss_intro', 'phase_transition', 'boss_shout', 'wrench_swing', 'scrubber_engine', 'boiler_blast', 'contract_throw', 'commission_ding', 'policy_stamp',
  'shutter_slam', 'conveyor', 'helicopter', 'slide_beam', 'golden_parachute', 'crowd_gasp', 'speech', 'screen_smash',
  // stingers
  'stinger_victory', 'stinger_death', 'stinger_promotion', 'stinger_boss_defeat', 'stinger_unlock', 'stinger_announcement',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** Looping ambiences / sustained effects. */
export const LOOP_NAMES = ['wind', 'electric_hum', 'sprinkler_loop', 'server_hum', 'helicopter_loop', 'conveyor_loop', 'scrubber_loop', 'alarm_loop', 'fluorescent_buzz', 'rain', 'hold_music_loop', 'microwave_loop', 'car_idle'] as const;
export type LoopName = (typeof LOOP_NAMES)[number];

/** Music tracks. Act tracks have two arrangements (explore muzak / combat house) driven by setCombat(). */
export type MusicTrack =
  | 'menu' | 'hub' | 'act1' | 'act2' | 'act3' | 'act4'
  | 'boss1' | 'boss2' | 'boss3' | 'boss4' | 'ceo_finale' | 'shop' | 'lift' | 'credits' | 'event' | 'daily' | 'none';

export type VoiceKind = 'bark' | 'pain' | 'death' | 'effort' | 'laugh' | 'chant' | 'gasp' | 'speech';

export interface SfxOpts {
  vol?: number;      // 0..1 multiplier
  pitch?: number;    // playback rate multiplier (1 = normal)
  /** World position for stereo panning/attenuation relative to the listener. */
  x?: number; y?: number;
}

export interface LoopHandle { stop(fade?: number): void; setVolume(v: number): void; }

export interface AudioApi {
  /** Create the AudioContext lazily; call on first user gesture. Safe to call repeatedly. */
  unlock(): void;
  /** Apply volume settings (0..1 each). */
  setVolumes(master: number, music: number, sfx: number, voice: number): void;
  /** Listener position for spatialised SFX (world px). */
  setListener(x: number, y: number): void;
  sfx(name: SfxName, opts?: SfxOpts): void;
  loop(name: LoopName, opts?: SfxOpts): LoopHandle;
  /** Synthesised vocal grunt for barks (spec 9.3 fallback). voiceSeed picks timbre/pitch per individual. */
  voice(voiceSeed: number, kind: VoiceKind, opts?: SfxOpts & { syllables?: number }): void;
  music: {
    play(track: MusicTrack, fadeSeconds?: number): void;
    /** Switch exploration (muzak) <-> combat (house/techno). Transition lands on the next bar boundary. */
    setCombat(on: boolean): void;
    /** Rage layer: filter sweep + heavier kick. */
    setRage(on: boolean): void;
    /** Boss phase 1..3 escalation. */
    setPhase(phase: number): void;
    /** Duck music (e.g. during cutscenes/speech). 0..1 amount. */
    duck(amount: number, seconds: number): void;
    current(): MusicTrack;
    /** Beat clock for visual sync (0..1 phase within current beat, bpm). */
    beat(): { phase: number; bpm: number; bar: number };
  };
  /** Pause all audio (app backgrounded / pause menu dims). */
  setPaused(paused: boolean): void;
  /** Optional callback for visual indicators of audio-only cues (spec 9.3 accessibility). */
  onCue?: (name: string, x?: number, y?: number) => void;
}

/** Car-radio tracklist (spec 7.3) — unlockable soundtrack entries. */
export const RADIO_TRACKS: { id: MusicTrack; title: string; combat?: boolean }[] = [
  { id: 'menu', title: 'CorpOS Login Chime (Extended Mix)' },
  { id: 'hub', title: 'Car Park Contemplation' },
  { id: 'act1', title: 'Lobby Bossa (Fresh Starters)' },
  { id: 'act1', title: 'Ground Floor Deep House', combat: true },
  { id: 'act2', title: 'Smooth Pipeline Jazz' },
  { id: 'act2', title: 'Quarter-End Tech House', combat: true },
  { id: 'act3', title: 'Your Call Is Important To Us' },
  { id: 'act3', title: 'Minimal Compliance', combat: true },
  { id: 'act4', title: 'We Are One Family (Anthem)' },
  { id: 'act4', title: 'Hard Techno Board Meeting', combat: true },
  { id: 'boss1', title: 'Ticket Logged' },
  { id: 'boss2', title: 'Always Be Closing' },
  { id: 'boss3', title: 'This Call Is Being Recorded' },
  { id: 'boss4', title: 'Golden Parachute' },
  { id: 'ceo_finale', title: 'All-Staff Email' },
  { id: 'shop', title: 'Canteen Muzak' },
  { id: 'lift', title: 'Going Up' },
];

// ---------------------------------------------------------------------------
// The concrete implementation registers itself here (see ./engine.ts).
// Until then a silent stub keeps the game running.
const silent: LoopHandle = { stop() {}, setVolume() {} };
let impl: AudioApi = {
  unlock() {}, setVolumes() {}, setListener() {}, sfx() {}, loop() { return silent; }, voice() {},
  music: { play() {}, setCombat() {}, setRage() {}, setPhase() {}, duck() {}, current() { return 'none'; }, beat() { return { phase: 0, bpm: 120, bar: 0 }; } },
  setPaused() {},
};

export function registerAudio(a: AudioApi): void { impl = a; }

/** Proxy so modules can `import { audio }` before the implementation registers. */
export const audio: AudioApi = {
  unlock: () => impl.unlock(),
  setVolumes: (a, b, c, d) => impl.setVolumes(a, b, c, d),
  setListener: (x, y) => impl.setListener(x, y),
  sfx: (n, o) => impl.sfx(n, o),
  loop: (n, o) => impl.loop(n, o),
  voice: (s, k, o) => impl.voice(s, k, o),
  music: {
    play: (t, f) => impl.music.play(t, f),
    setCombat: (on) => impl.music.setCombat(on),
    setRage: (on) => impl.music.setRage(on),
    setPhase: (p) => impl.music.setPhase(p),
    duck: (a, s) => impl.music.duck(a, s),
    current: () => impl.music.current(),
    beat: () => impl.music.beat(),
  },
  setPaused: (p) => impl.setPaused(p),
  get onCue() { return impl.onCue; },
  set onCue(fn) { impl.onCue = fn; },
};
