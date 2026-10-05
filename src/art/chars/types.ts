// Shared types for the modular character system (spec 5.3, 9.1).
import type { Col } from './pixbuf';

/** A 5-step hue-shifted colour ramp: highlight, light, base, shadow, dark. */
export interface Ramp { hex: string; hi: Col; lt: Col; base: Col; sh: Col; dk: Col }

export type RigId = 'A' | 'B';
export type BuildId = 'slim' | 'average' | 'heavy';
export type View = 'front' | 'side' | 'back';

/**
 * Body proportions in pixels (1× scale). Bosses can pass larger values to the humanoid helpers
 * (see `drawHumanoid` in rig.ts), e.g. multiply every field by 2.5 for a 96 px boss.
 */
export interface Proportions {
  /** Hip height above the feet. */
  legLen: number;
  /** Hip line to shoulder line. */
  torsoH: number;
  shoulderW: number;
  waistW: number;
  hipW: number;
  /** Extra belly bulge (px each side) around the lower torso. */
  belly: number;
  /** Arm thickness (sleeve width). */
  armT: number;
  /** Leg thickness. */
  legT: number;
  upperArm: number;
  foreArm: number;
  /** Shoe length (side view) / width (front view). */
  footL: number;
  headW: number;
  headH: number;
}

/** Facial presets (8–12 per rig). */
export interface HeadPreset {
  shape: 'round' | 'square' | 'oval' | 'long' | 'wide' | 'heart';
  dw: number; dh: number;
  eyeGap: number;
  nose: 'small' | 'big' | 'button' | 'long';
  brows: 'thin' | 'thick' | 'bushy' | 'arched';
  ears: 'small' | 'big';
  lashes: boolean;
  cheeks: boolean;
}

export type HairId =
  | 'bald' | 'receding' | 'buzz' | 'crew' | 'side_part' | 'comb_over' | 'slick_back' | 'quiff' | 'curly' | 'afro'
  | 'cornrows' | 'locs' | 'bob' | 'long' | 'ponytail' | 'bun' | 'pixie' | 'hijab' | 'turban' | 'headwrap';

export type TopKind =
  | 'shirt' | 'polo' | 'tee' | 'hoodie' | 'jumper' | 'turtleneck' | 'cardigan' | 'blazer' | 'suit' | 'gilet'
  | 'quarterzip' | 'boilersuit' | 'blouse' | 'dress' | 'waistcoat' | 'tabard' | 'workjacket';

export type Pattern = 'none' | 'pinstripe' | 'check' | 'knit' | 'stripe';
export type Print = 'none' | 'power' | 'logo' | 'heart' | 'star' | 'stripe';

export interface TopSpec {
  kind: TopKind;
  main: Ramp;
  sleeve: Ramp;
  sleeveLen: 'long' | 'short' | 'rolled';
  /** Shirt/blouse visible in jacket and cardigan openings. */
  under: Ramp;
  tie: Ramp | null;
  pattern: Pattern;
  print: Print;
  /** Hi-vis vest, sash, apron etc. drawn over the top. */
  overlay: 'none' | 'hivis' | 'hivis_orange' | 'sash' | 'apron';
  overlayCol: Ramp | null;
  /** Loosened tie / untucked etc. */
  scruffy: boolean;
}

export interface LegSpec { kind: 'trousers' | 'skirt' | 'shorts' | 'jeans'; main: Ramp; tights: Ramp | null }

export type HeldItem =
  | 'tray' | 'mop' | 'reel' | 'can' | 'latte' | 'script' | 'clipboard' | 'certificate' | 'calculator'
  | 'briefcase' | 'shield_binder' | 'po_pad' | 'magnifier' | 'phone_app' | 'golf_club' | 'tablet' | 'laser' | 'mug';

/** Where the off (left) hand rests while carrying the held item. */
export type Carry = 'none' | 'tray' | 'side' | 'chest' | 'shield' | 'shoulder' | 'raised' | 'upright' | 'cup' | 'phone' | 'point';

export type Worn =
  | 'headset1' | 'headset2' | 'whistle' | 'hardhat_red' | 'hardhat_white' | 'cap' | 'beanie' | 'tote' | 'ear_phone'
  | 'hip_phone' | 'pen_ear' | 'red_pen' | 'clicker' | 'eotm_badge' | 'visitor_sticker' | 'backpack' | 'toolbelt'
  | 'gloves' | 'plaster' | 'bandage' | 'reel_belt' | 'pouch';

export type LanyardStyle = 'normal' | 'oversized' | 'badges' | 'wellbeing';

export interface LanyardSpec {
  style: LanyardStyle;
  strap: Ramp;
  /** Strap edge colour (silver/gold for seniority). */
  edge: Col | null;
  card: Ramp;
  /** Ceremonial medallion (Act 4) instead of a card. */
  medallion: boolean;
  /** Glow colour; null = not glowing (player/npc). */
  glow: Col | null;
  /** 0..1 glow strength. */
  glowAmt: number;
  /** Extra pin colours along the strap. */
  pins: Col[];
}

export interface Flair {
  rosette: boolean;
  tiePin: boolean;
  sparkle: boolean;
  crown: boolean;
  /** Small status badges on the chest (seniority). */
  badges: number;
  pocketSquare: Col | null;
  /** Gold trim on collar/cuffs/hem (Act 4 ceremonial). */
  trim: Col | null;
}

export interface Accessories {
  glasses: 0 | 1 | 2 | 3 | 4; // none, round, square, thick, half-moon
  glassesCol: Ramp;
  facial: 0 | 1 | 2 | 3 | 4 | 5; // none, stubble, moustache, goatee, beard, full beard
  earbuds: boolean;
  earrings: boolean;
  /** 0 none, 1 plain, 2 smart silver, 3 gold. */
  watch: 0 | 1 | 2 | 3;
  freckles: boolean;
  blush: boolean;
}

export type Mood = 'hr' | 'angry' | 'neutral';

/** Fully resolved drawing description of one individual (derived from a CharacterLook). */
export interface Dress {
  rig: RigId;
  build: BuildId;
  prop: Proportions;
  head: HeadPreset;
  skin: Ramp;
  hair: Ramp;
  hairStyle: HairId;
  /** Fabric colour for hijab/turban/headwrap. */
  wrap: Ramp;
  top: TopSpec;
  legs: LegSpec;
  shoes: Ramp;
  heels: boolean;
  worn: Worn[];
  wornCol: Ramp;
  held: HeldItem | null;
  heldCol: Ramp;
  carry: Carry;
  lanyard: LanyardSpec | null;
  acc: Accessories;
  flair: Flair;
  mood: Mood;
  /** Act 3+ indoctrinated pupils glow. */
  eyeGlow: Col | null;
  /** Colour used for cast sparkles, dash smear etc. */
  fxCol: Col;
}
