// Archetype and role asset kits (spec 5.2, 5.3, 7.3): outfits (3–5 per archetype), anchor items,
// worn kit, build weights. rollLook() picks from these; every choice is stored in look.layers.
import type { ArchetypeId, PlayerRoleId } from '../../data/ids';
import type { Carry, HeldItem, LanyardStyle, Pattern, Print, TopKind, Worn, HeadPreset } from './types';
import { FAB, HIVIS_LIME, HIVIS_ORANGE } from './colours';

export interface OutfitDef {
  top: TopKind;
  sleeve?: 'long' | 'short' | 'rolled';
  main: string[];
  under?: string[];
  /** Tie colours; omitted = no tie. */
  tie?: string[];
  tieChance?: number;
  legs: string[];
  legKind?: 'trousers' | 'jeans' | 'shorts' | 'skirt';
  /** Chance of a skirt instead of trousers on rig B. */
  skirtB?: number;
  /** Trousers match the jacket (suits). */
  suit?: boolean;
  shoes?: string[];
  pattern?: Pattern;
  patternChance?: number;
  print?: Print;
  overlay?: 'hivis' | 'hivis_orange' | 'sash' | 'apron';
  overlayCol?: string[];
  /** 0 casual … 2 sharp. Higher tiers prefer sharper outfits (spec 5.3 seniority). */
  formal: 0 | 1 | 2;
  scruffy?: boolean;
}

export interface Kit {
  act: 1 | 2 | 3 | 4;
  outfits: OutfitDef[];
  held: HeldItem | null;
  heldCols?: string[];
  carry: Carry;
  worn: Worn[];
  wornCols?: string[];
  lanyard: LanyardStyle | null;
  /** slim / average / heavy weights. */
  build: [number, number, number];
  /** Free off-hand may carry a mug. */
  mugOk: boolean;
  glasses?: number;
}

const F = FAB;
const SHOES_SMART = ['#1e1a18', '#3a2618', '#24242c', '#5a3a22'];
const SHOES_CASUAL = ['#e8e8ea', '#2a2c34', '#7a7e88', '#3a4a6a', '#c8b8a0'];
const SHOES_WORK = ['#3a2a1e', '#2a2a2e', '#4a3a28'];
const TROUSERS = [F.charcoal, F.navy, F.black, F.grey, F.slate, F.stone];
const CHINOS = [F.beige, F.khaki, F.navy, F.stone, F.olive, F.sand];
const JEANS = [F.denim, F.lightdenim, F.ink, F.charcoal];
const SHIRTS = [F.white, F.paleblue, F.pink, F.offwhite, F.lilac, F.mint];
const TIES = [F.burgundy, F.navy, F.red, F.royal, F.forest, F.mustard, F.purple, F.teal];

export const KITS: Record<ArchetypeId, Kit> = {
  intern: {
    act: 1, held: 'tray', carry: 'tray', worn: [], lanyard: 'oversized', build: [5, 4, 1], mugOk: false,
    outfits: [
      { top: 'polo', sleeve: 'short', main: [F.sky, F.coral, F.mint, F.white, F.lime, F.lilac], legs: CHINOS, shoes: SHOES_CASUAL, formal: 0, print: 'logo' },
      { top: 'shirt', sleeve: 'rolled', main: SHIRTS, legs: [...CHINOS, ...JEANS], legKind: 'trousers', shoes: SHOES_CASUAL, formal: 1, tie: TIES, tieChance: 0.35, scruffy: true },
      { top: 'hoodie', main: [F.grey, F.navy, F.forest, F.burgundy, F.mustard], under: [F.white], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'shirt', sleeve: 'short', main: [F.white, F.paleblue, F.cream], legs: TROUSERS, shoes: SHOES_SMART, tie: [F.red, F.navy, F.mustard], tieChance: 0.9, formal: 1, pattern: 'check', patternChance: 0.3 },
      { top: 'jumper', main: [F.mustard, F.teal, F.coral, F.lilac, F.forest], under: SHIRTS, legs: CHINOS, shoes: SHOES_CASUAL, formal: 1, skirtB: 0.4, pattern: 'knit', patternChance: 0.5 },
    ],
  },
  receptionist: {
    act: 1, held: null, carry: 'none', worn: ['headset1'], lanyard: 'normal', build: [3, 5, 2], mugOk: true,
    outfits: [
      { top: 'blouse', main: [F.white, F.pink, F.lilac, F.cream, F.mint], tie: [F.navy, F.red, F.teal], tieChance: 0.4, legs: TROUSERS, skirtB: 0.6, shoes: SHOES_SMART, formal: 1 },
      { top: 'cardigan', main: [F.navy, F.burgundy, F.teal, F.camel, F.plum], under: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
      { top: 'blazer', main: [F.navy, F.charcoal, F.burgundy, F.royal], under: [F.white, F.cream], legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 2, suit: true },
      { top: 'shirt', main: SHIRTS, legs: TROUSERS, shoes: SHOES_SMART, tie: TIES, tieChance: 0.6, formal: 1 },
    ],
  },
  caretaker: {
    act: 1, held: 'mop', carry: 'upright', worn: [], lanyard: 'normal', build: [1, 3, 6], mugOk: false,
    outfits: [
      { top: 'boilersuit', main: [F.navy, F.slate, F.forest, F.brown], legs: [], suit: true, shoes: SHOES_WORK, overlay: 'hivis', overlayCol: [HIVIS_LIME], formal: 0 },
      { top: 'workjacket', main: [F.navy, F.charcoal, F.olive], legs: TROUSERS, shoes: SHOES_WORK, overlay: 'hivis', overlayCol: [HIVIS_LIME, HIVIS_ORANGE], formal: 1 },
      { top: 'polo', sleeve: 'short', main: [F.navy, F.forest, F.grey], legs: TROUSERS, shoes: SHOES_WORK, overlay: 'hivis', overlayCol: [HIVIS_LIME], formal: 0 },
      { top: 'tee', sleeve: 'short', main: [F.grey, F.charcoal, F.navy], under: [F.white], legs: [F.navy, F.charcoal, F.khaki], shoes: SHOES_WORK, overlay: 'hivis_orange', overlayCol: [HIVIS_ORANGE], formal: 0 },
    ],
  },
  it_tech: {
    act: 1, held: 'reel', carry: 'side', worn: ['pouch'], lanyard: 'normal', build: [4, 4, 3], mugOk: false, glasses: 0.5,
    outfits: [
      { top: 'tee', sleeve: 'short', main: [F.black, F.charcoal, F.navy, F.forest], under: [F.lime, F.white, F.sky], print: 'power', legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'tee', sleeve: 'short', main: [F.grey, F.slate, F.burgundy], under: [F.white, F.lime], print: 'power', legs: [F.khaki, F.olive, F.charcoal], legKind: 'shorts', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'hoodie', main: [F.charcoal, F.black, F.navy], under: [F.lime, F.white], print: 'power', legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 1 },
      { top: 'tee', sleeve: 'short', main: [F.black, F.navy], under: [F.sky, F.lime], print: 'power', legs: CHINOS, shoes: SHOES_CASUAL, formal: 1 },
    ],
  },
  fire_warden: {
    act: 1, held: null, carry: 'none', worn: ['whistle', 'hardhat_red'], wornCols: ['#c8302a', '#e04030'], lanyard: 'normal', build: [1, 4, 5], mugOk: false,
    outfits: [
      { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.6, legs: TROUSERS, shoes: SHOES_SMART, overlay: 'hivis_orange', overlayCol: [HIVIS_ORANGE], formal: 1 },
      { top: 'polo', sleeve: 'short', main: [F.white, F.navy, F.grey], legs: TROUSERS, shoes: SHOES_SMART, overlay: 'hivis_orange', overlayCol: [HIVIS_ORANGE], formal: 0 },
      { top: 'blouse', main: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, overlay: 'hivis_orange', overlayCol: [HIVIS_ORANGE], formal: 1 },
      { top: 'suit', main: [F.charcoal, F.navy], under: [F.white], tie: TIES, tieChance: 0.9, legs: [], suit: true, shoes: SHOES_SMART, overlay: 'hivis_orange', overlayCol: [HIVIS_ORANGE], formal: 2 },
    ],
  },
  sales_rep: {
    act: 2, held: 'can', carry: 'cup', worn: [], lanyard: 'normal', build: [4, 5, 1], mugOk: false,
    outfits: [
      { top: 'gilet', main: [F.navy, F.black, F.charcoal, F.forest], under: SHIRTS, legs: CHINOS, shoes: SHOES_SMART, formal: 1, pattern: 'none' },
      { top: 'gilet', main: [F.navy, F.black, F.royal], under: [F.paleblue, F.white, F.pink], tie: TIES, tieChance: 0.4, legs: TROUSERS, shoes: SHOES_SMART, formal: 2 },
      { top: 'gilet', main: [F.grey, F.olive, F.navy], under: [F.white, F.paleblue], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'gilet', main: [F.black, F.burgundy, F.navy], under: [F.white, F.sky], legs: TROUSERS, skirtB: 0.4, shoes: SHOES_SMART, formal: 1 },
    ],
  },
  marketing_exec: {
    act: 2, held: 'latte', carry: 'cup', worn: ['tote'], wornCols: [F.orange, F.teal, F.coral, F.royal, F.lime], lanyard: 'normal', build: [4, 4, 2], mugOk: false, glasses: 0.45,
    outfits: [
      { top: 'turtleneck', main: [F.black, F.cream, F.camel, F.charcoal], legs: [F.black, F.charcoal, F.cream], shoes: SHOES_CASUAL, formal: 1 },
      { top: 'blazer', main: [F.mustard, F.coral, F.teal, F.lilac], under: [F.white, F.black], legs: [F.black, F.charcoal, F.cream], shoes: SHOES_CASUAL, formal: 2 },
      { top: 'tee', sleeve: 'short', main: [F.white, F.black, F.coral], under: [F.orange, F.teal, F.royal], print: 'star', legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'jumper', main: [F.orange, F.lime, F.sky, F.coral, F.lilac], under: [F.white], legs: [F.black, F.cream, F.denim], skirtB: 0.5, shoes: SHOES_CASUAL, formal: 0 },
      { top: 'dress', main: [F.teal, F.mustard, F.coral, F.black], under: [F.black], legs: [], shoes: SHOES_SMART, formal: 1 },
    ],
  },
  call_centre: {
    act: 2, held: 'script', carry: 'chest', heldCols: [F.royal, F.black, F.red, F.forest], worn: ['headset2'], lanyard: 'normal', build: [3, 5, 3], mugOk: false,
    outfits: [
      { top: 'polo', sleeve: 'short', main: [F.royal, F.teal, F.red, F.navy], print: 'logo', under: [F.white], legs: TROUSERS, shoes: SHOES_CASUAL, formal: 0 },
      { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.4, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'cardigan', main: [F.grey, F.navy, F.burgundy], under: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
      { top: 'hoodie', main: [F.royal, F.grey], under: [F.white], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
    ],
  },
  team_leader: {
    act: 2, held: 'clipboard', carry: 'chest', worn: [], lanyard: 'badges', build: [2, 4, 4], mugOk: false,
    outfits: [
      { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.9, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'shirt', sleeve: 'short', main: [F.white, F.paleblue], tie: TIES, tieChance: 1, legs: TROUSERS, shoes: SHOES_SMART, formal: 0 },
      { top: 'blouse', main: SHIRTS, legs: TROUSERS, skirtB: 0.6, shoes: SHOES_SMART, formal: 1, tie: [F.navy, F.red], tieChance: 0.5 },
      { top: 'waistcoat', main: [F.charcoal, F.navy, F.grey], under: SHIRTS, tie: TIES, tieChance: 0.9, legs: TROUSERS, shoes: SHOES_SMART, formal: 2 },
    ],
  },
  employee_of_month: {
    act: 2, held: 'certificate', carry: 'chest', worn: ['eotm_badge'], lanyard: 'badges', build: [2, 5, 3], mugOk: false,
    outfits: [
      { top: 'suit', main: [F.navy, F.royal, F.charcoal], under: [F.white], tie: [F.mustard, F.red, F.royal], tieChance: 1, legs: [], suit: true, shoes: SHOES_SMART, formal: 2 },
      { top: 'shirt', main: [F.white, F.paleblue], tie: [F.mustard, F.red, F.royal], tieChance: 1, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'blazer', main: [F.burgundy, F.royal, F.teal], under: [F.white], legs: TROUSERS, skirtB: 0.6, shoes: SHOES_SMART, formal: 2 },
      { top: 'polo', sleeve: 'short', main: [F.mustard, F.royal], print: 'star', under: [F.white], legs: CHINOS, shoes: SHOES_SMART, formal: 0 },
    ],
  },
  accountant: {
    act: 3, held: 'calculator', carry: 'chest', worn: ['pen_ear'], lanyard: 'normal', build: [4, 4, 3], mugOk: false, glasses: 0.7,
    outfits: [
      { top: 'cardigan', main: [F.camel, F.olive, F.burgundy, F.grey, F.brown, F.forest], under: SHIRTS, tie: TIES, tieChance: 0.5, legs: [...TROUSERS, ...CHINOS], shoes: SHOES_SMART, formal: 1, pattern: 'knit', patternChance: 0.5 },
      { top: 'cardigan', main: [F.mustard, F.navy, F.plum, F.teal], under: [F.white, F.cream], legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
      { top: 'cardigan', main: [F.charcoal, F.navy], under: [F.white, F.paleblue], tie: TIES, tieChance: 0.9, legs: TROUSERS, shoes: SHOES_SMART, formal: 2 },
      { top: 'cardigan', main: [F.grey, F.camel], under: [F.paleblue, F.pink], legs: CHINOS, shoes: SHOES_CASUAL, formal: 0, pattern: 'knit', patternChance: 1 },
    ],
  },
  lawyer: {
    act: 3, held: 'briefcase', carry: 'side', heldCols: ['#4a2e1c', '#1e1c20', '#6a3a22'], worn: [], lanyard: 'normal', build: [4, 5, 2], mugOk: false,
    outfits: [
      { top: 'suit', main: [F.ink, F.charcoal, F.navy, F.black], under: [F.white, F.paleblue], tie: TIES, tieChance: 0.85, legs: [], suit: true, shoes: SHOES_SMART, formal: 2, pattern: 'pinstripe', patternChance: 0.6 },
      { top: 'suit', main: [F.charcoal, F.slate, F.grey], under: [F.white], tie: TIES, tieChance: 0.7, legs: [], suit: true, shoes: SHOES_SMART, formal: 1 },
      { top: 'blazer', main: [F.black, F.navy, F.burgundy], under: [F.white, F.cream], legs: TROUSERS, skirtB: 0.6, shoes: SHOES_SMART, formal: 2 },
    ],
  },
  compliance_officer: {
    act: 3, held: 'shield_binder', carry: 'shield', heldCols: ['#b0303a', '#2a4a8a', '#1e2028', '#3a6a3a'], worn: [], lanyard: 'normal', build: [1, 3, 6], mugOk: false, glasses: 0.4,
    outfits: [
      { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.9, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'suit', main: [F.slate, F.charcoal, F.navy], under: [F.white], tie: TIES, tieChance: 1, legs: [], suit: true, shoes: SHOES_SMART, formal: 2 },
      { top: 'waistcoat', main: [F.grey, F.brown, F.navy], under: SHIRTS, tie: TIES, tieChance: 0.8, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'blouse', main: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
    ],
  },
  procurement_buyer: {
    act: 3, held: 'po_pad', carry: 'chest', heldCols: [F.royal, F.red, F.forest], worn: ['pen_ear'], lanyard: 'normal', build: [3, 5, 3], mugOk: false,
    outfits: [
      { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.6, legs: TROUSERS, shoes: SHOES_SMART, formal: 1, pattern: 'check', patternChance: 0.3 },
      { top: 'waistcoat', main: [F.navy, F.charcoal, F.burgundy], under: SHIRTS, tie: TIES, tieChance: 0.7, legs: TROUSERS, shoes: SHOES_SMART, formal: 2 },
      { top: 'jumper', main: [F.navy, F.grey, F.forest, F.burgundy], under: SHIRTS, legs: CHINOS, skirtB: 0.4, shoes: SHOES_SMART, formal: 0 },
      { top: 'blouse', main: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
    ],
  },
  auditor: {
    act: 3, held: 'magnifier', carry: 'raised', worn: ['red_pen'], lanyard: 'normal', build: [3, 4, 3], mugOk: false, glasses: 0.6,
    outfits: [
      { top: 'suit', main: [F.grey, F.slate, F.charcoal], under: [F.white], tie: [F.red, F.burgundy], tieChance: 1, legs: [], suit: true, shoes: SHOES_SMART, formal: 2 },
      { top: 'suit', main: [F.brown, F.stone, F.olive], under: [F.cream, F.white], tie: [F.red, F.mustard], tieChance: 0.8, legs: [], suit: true, shoes: SHOES_SMART, formal: 1, pattern: 'check', patternChance: 0.4 },
      { top: 'blazer', main: [F.grey, F.navy], under: [F.white], legs: TROUSERS, skirtB: 0.6, shoes: SHOES_SMART, formal: 2 },
      { top: 'waistcoat', main: [F.grey, F.charcoal], under: [F.white], tie: [F.red], tieChance: 1, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
    ],
  },
  hr_partner: {
    act: 4, held: 'phone_app', carry: 'phone', worn: [], lanyard: 'wellbeing', build: [3, 5, 2], mugOk: false,
    outfits: [
      { top: 'cardigan', main: [F.lilac, F.mint, F.cream, F.pink], under: [F.white, F.cream], legs: [F.cream, F.grey, F.navy], skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
      { top: 'blouse', main: [F.mint, F.lilac, F.pink, F.cream], legs: [F.grey, F.navy, F.cream], skirtB: 0.6, shoes: SHOES_SMART, formal: 1 },
      { top: 'jumper', main: [F.sand, F.lilac, F.mint, F.sky], under: [F.white], legs: [F.cream, F.charcoal], shoes: SHOES_CASUAL, formal: 0, pattern: 'knit', patternChance: 0.6 },
      { top: 'blazer', main: [F.cream, F.lilac, F.sky], under: [F.white], legs: [F.cream, F.navy], skirtB: 0.4, shoes: SHOES_SMART, formal: 2 },
      { top: 'turtleneck', main: [F.cream, F.sand, F.mint], legs: [F.grey, F.cream], shoes: SHOES_CASUAL, formal: 1 },
    ],
  },
  svp: {
    act: 4, held: 'golf_club', carry: 'shoulder', worn: [], lanyard: 'normal', build: [1, 4, 5], mugOk: false,
    outfits: [
      { top: 'quarterzip', main: [F.navy, F.charcoal, F.burgundy, F.forest], under: [F.white, F.paleblue], legs: CHINOS, shoes: SHOES_SMART, formal: 1 },
      { top: 'quarterzip', main: [F.grey, F.navy, F.black], under: [F.white], legs: TROUSERS, shoes: SHOES_SMART, formal: 2 },
      { top: 'quarterzip', main: [F.camel, F.sky, F.lightgrey], under: [F.paleblue, F.pink], legs: CHINOS, shoes: SHOES_CASUAL, formal: 0 },
    ],
  },
  exec_assistant: {
    act: 4, held: 'tablet', carry: 'chest', worn: ['ear_phone', 'hip_phone'], lanyard: 'normal', build: [5, 4, 1], mugOk: false,
    outfits: [
      { top: 'turtleneck', main: [F.black, F.charcoal, F.cream], legs: [F.black, F.charcoal], skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
      { top: 'blazer', main: [F.black, F.ink, F.burgundy], under: [F.white, F.black], legs: [F.black, F.charcoal], skirtB: 0.5, shoes: SHOES_SMART, formal: 2, suit: true },
      { top: 'dress', main: [F.black, F.burgundy, F.navy], under: [F.black], legs: [], shoes: SHOES_SMART, formal: 2 },
      { top: 'shirt', main: [F.white, F.black], tie: [F.black], tieChance: 0.5, legs: [F.black, F.charcoal], shoes: SHOES_SMART, formal: 1 },
    ],
  },
  consultant: {
    act: 4, held: 'laser', carry: 'point', worn: ['clicker'], lanyard: 'normal', build: [5, 4, 1], mugOk: false, glasses: 0.35,
    outfits: [
      { top: 'suit', main: [F.navy, F.ink, F.charcoal], under: [F.white, F.paleblue], legs: [], suit: true, shoes: SHOES_SMART, formal: 2 },
      { top: 'blazer', main: [F.navy, F.slate], under: [F.white, F.paleblue], legs: CHINOS, shoes: SHOES_CASUAL, formal: 1 },
      { top: 'shirt', sleeve: 'rolled', main: [F.white, F.paleblue], legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'gilet', main: [F.navy, F.charcoal], under: [F.white, F.paleblue], legs: CHINOS, shoes: SHOES_SMART, formal: 0 },
    ],
  },
  culture_champion: {
    act: 4, held: null, carry: 'none', worn: ['eotm_badge'], lanyard: 'badges', build: [2, 5, 3], mugOk: true,
    outfits: [
      { top: 'polo', sleeve: 'short', main: [F.royal, F.teal, F.orange, F.purple], print: 'heart', under: [F.white], legs: CHINOS, shoes: SHOES_CASUAL, formal: 0, overlay: 'sash', overlayCol: ['#c02838', '#d4a537', '#6a3aa8'] },
      { top: 'blazer', main: [F.navy, F.royal, F.purple], under: [F.white], tie: [F.red, F.mustard], tieChance: 0.5, legs: TROUSERS, shoes: SHOES_SMART, formal: 2, overlay: 'sash', overlayCol: ['#c02838', '#d4a537'] },
      { top: 'tee', sleeve: 'short', main: [F.white, F.mustard, F.coral], under: [F.red, F.royal], print: 'heart', legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0, overlay: 'sash', overlayCol: ['#c02838', '#3a6ad0', '#6a3aa8'] },
      { top: 'cardigan', main: [F.red, F.royal, F.mustard], under: [F.white], legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1, overlay: 'sash', overlayCol: ['#c02838', '#d4a537'] },
    ],
  },
};

/** Player starting roles (spec 7.3). Not indoctrinated: no lanyard. */
export const ROLE_KITS: Record<PlayerRoleId, Kit> = {
  office_worker: {
    act: 1, held: null, carry: 'none', worn: [], lanyard: null, build: [3, 5, 2], mugOk: false,
    outfits: [
      { top: 'shirt', sleeve: 'rolled', main: [F.white, F.paleblue, F.offwhite], tie: [F.navy, F.burgundy, F.forest, F.slate], tieChance: 1, scruffy: true, legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'blouse', sleeve: 'rolled', main: [F.white, F.paleblue], legs: TROUSERS, shoes: SHOES_SMART, formal: 1 },
      { top: 'shirt', sleeve: 'rolled', main: [F.white, F.paleblue], legs: CHINOS, shoes: SHOES_SMART, formal: 1, scruffy: true },
    ],
  },
  temp: {
    act: 1, held: null, carry: 'none', worn: ['visitor_sticker', 'backpack'], wornCols: [F.forest, F.navy, F.rust, F.charcoal], lanyard: null, build: [5, 4, 1], mugOk: false,
    outfits: [
      { top: 'blazer', main: [F.stone, F.grey, F.brown], under: [F.white, F.paleblue], legs: [F.charcoal, F.black, F.denim], shoes: SHOES_CASUAL, formal: 1 },
      { top: 'cardigan', main: [F.mustard, F.grey, F.olive], under: [F.white, F.cream], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'jumper', main: [F.burgundy, F.navy, F.forest], under: [F.white], legs: [F.black, F.charcoal], shoes: SHOES_CASUAL, formal: 0 },
    ],
  },
  night_cleaner: {
    act: 1, held: null, carry: 'none', worn: ['gloves'], wornCols: ['#e0a830', '#4a8ad0'], lanyard: null, build: [3, 4, 3], mugOk: false,
    outfits: [
      { top: 'tabard', main: [F.teal, F.royal, F.navy], under: [F.grey, F.charcoal, F.white], legs: [F.navy, F.charcoal, F.black], shoes: SHOES_WORK, formal: 0 },
      { top: 'tabard', main: [F.burgundy, F.forest], under: [F.white, F.grey], legs: [F.charcoal, F.navy], shoes: SHOES_WORK, formal: 0 },
      { top: 'polo', sleeve: 'short', main: [F.teal, F.navy], under: [F.white], legs: [F.navy, F.black], shoes: SHOES_WORK, overlay: 'apron', overlayCol: [F.royal, F.grey], formal: 0 },
    ],
  },
  contractor: {
    act: 1, held: null, carry: 'none', worn: ['hardhat_white', 'toolbelt'], wornCols: ['#f0f0ec', '#e8823a'], lanyard: null, build: [2, 4, 4], mugOk: false,
    outfits: [
      { top: 'workjacket', main: [F.navy, F.charcoal, F.olive, F.orange], legs: [F.charcoal, F.navy, F.khaki], shoes: SHOES_WORK, formal: 0 },
      { top: 'tee', sleeve: 'short', main: [F.grey, F.navy, F.forest], under: [F.white], legs: [F.khaki, F.charcoal], shoes: SHOES_WORK, overlay: 'hivis', overlayCol: [HIVIS_LIME], formal: 0 },
      { top: 'hoodie', main: [F.orange, F.grey, F.charcoal], under: [F.white], legs: JEANS, legKind: 'jeans', shoes: SHOES_WORK, formal: 0 },
    ],
  },
  ex_employee: {
    act: 1, held: null, carry: 'none', worn: ['plaster'], lanyard: null, build: [3, 4, 3], mugOk: false,
    outfits: [
      { top: 'hoodie', main: [F.charcoal, F.black, F.grey, F.burgundy], under: [F.white], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
      { top: 'shirt', sleeve: 'rolled', main: [F.offwhite, F.paleblue], tie: [F.burgundy, F.navy], tieChance: 0.7, scruffy: true, legs: TROUSERS, shoes: SHOES_SMART, formal: 0 },
      { top: 'tee', sleeve: 'short', main: [F.black, F.grey, F.navy], under: [F.white], legs: JEANS, legKind: 'jeans', shoes: SHOES_CASUAL, formal: 0 },
    ],
  },
};

/** Generic office staff for npc looks without an archetype (hub, ending). */
export const STAFF_KIT: Kit = {
  act: 1, held: null, carry: 'none', worn: [], lanyard: 'normal', build: [3, 5, 3], mugOk: true,
  outfits: [
    { top: 'shirt', main: SHIRTS, tie: TIES, tieChance: 0.4, legs: [...TROUSERS, ...CHINOS], shoes: SHOES_SMART, formal: 1 },
    { top: 'blouse', main: SHIRTS, legs: TROUSERS, skirtB: 0.5, shoes: SHOES_SMART, formal: 1 },
    { top: 'jumper', main: [F.navy, F.forest, F.burgundy, F.mustard, F.grey], under: SHIRTS, legs: CHINOS, shoes: SHOES_CASUAL, formal: 0 },
    { top: 'cardigan', main: [F.camel, F.grey, F.teal], under: SHIRTS, legs: TROUSERS, skirtB: 0.4, shoes: SHOES_SMART, formal: 1 },
    { top: 'polo', sleeve: 'short', main: [F.sky, F.white, F.coral, F.navy], legs: CHINOS, shoes: SHOES_CASUAL, formal: 0 },
  ],
};

/** Head/face presets (10 per rig). */
export const HEADS: Record<'A' | 'B', HeadPreset[]> = {
  A: [
    { shape: 'square', dw: 0, dh: 0, eyeGap: 2, nose: 'small', brows: 'thick', ears: 'small', lashes: false, cheeks: false },
    { shape: 'round', dw: 0, dh: 0, eyeGap: 2, nose: 'button', brows: 'thin', ears: 'big', lashes: false, cheeks: true },
    { shape: 'wide', dw: 1, dh: -1, eyeGap: 3, nose: 'big', brows: 'bushy', ears: 'small', lashes: false, cheeks: false },
    { shape: 'long', dw: -1, dh: 1, eyeGap: 2, nose: 'long', brows: 'thin', ears: 'big', lashes: false, cheeks: false },
    { shape: 'oval', dw: 0, dh: 0, eyeGap: 1, nose: 'small', brows: 'thick', ears: 'small', lashes: false, cheeks: false },
    { shape: 'square', dw: 1, dh: 0, eyeGap: 3, nose: 'big', brows: 'thick', ears: 'big', lashes: false, cheeks: false },
    { shape: 'heart', dw: 0, dh: 0, eyeGap: 2, nose: 'button', brows: 'arched', ears: 'small', lashes: false, cheeks: true },
    { shape: 'round', dw: 1, dh: 0, eyeGap: 3, nose: 'small', brows: 'bushy', ears: 'small', lashes: false, cheeks: false },
    { shape: 'long', dw: 0, dh: 1, eyeGap: 2, nose: 'big', brows: 'thin', ears: 'small', lashes: false, cheeks: false },
    { shape: 'wide', dw: 1, dh: 0, eyeGap: 2, nose: 'button', brows: 'thick', ears: 'big', lashes: false, cheeks: true },
  ],
  B: [
    { shape: 'oval', dw: 0, dh: 0, eyeGap: 2, nose: 'button', brows: 'arched', ears: 'small', lashes: true, cheeks: true },
    { shape: 'round', dw: 0, dh: 0, eyeGap: 2, nose: 'small', brows: 'thin', ears: 'small', lashes: true, cheeks: false },
    { shape: 'heart', dw: 0, dh: 0, eyeGap: 2, nose: 'small', brows: 'arched', ears: 'small', lashes: true, cheeks: true },
    { shape: 'long', dw: -1, dh: 1, eyeGap: 2, nose: 'long', brows: 'thin', ears: 'small', lashes: false, cheeks: false },
    { shape: 'wide', dw: 1, dh: 0, eyeGap: 3, nose: 'button', brows: 'thick', ears: 'small', lashes: true, cheeks: true },
    { shape: 'square', dw: 0, dh: 0, eyeGap: 2, nose: 'big', brows: 'thick', ears: 'big', lashes: false, cheeks: false },
    { shape: 'round', dw: 1, dh: 0, eyeGap: 3, nose: 'button', brows: 'arched', ears: 'small', lashes: true, cheeks: true },
    { shape: 'oval', dw: 0, dh: 1, eyeGap: 1, nose: 'small', brows: 'thin', ears: 'small', lashes: true, cheeks: false },
    { shape: 'heart', dw: 1, dh: 0, eyeGap: 2, nose: 'big', brows: 'thick', ears: 'small', lashes: false, cheeks: false },
    { shape: 'square', dw: 1, dh: -1, eyeGap: 3, nose: 'small', brows: 'arched', ears: 'big', lashes: true, cheeks: true },
  ],
};

/** Hairstyle weights per rig (any style can appear on either rig). */
export const HAIR_WEIGHTS: Record<'A' | 'B', [string, number][]> = {
  A: [['bald', 5], ['receding', 6], ['buzz', 8], ['crew', 10], ['side_part', 9], ['comb_over', 4], ['slick_back', 6], ['quiff', 5], ['curly', 6], ['afro', 4], ['cornrows', 3], ['locs', 3], ['long', 2], ['ponytail', 2], ['bun', 2], ['pixie', 1], ['bob', 1], ['turban', 3], ['hijab', 0], ['headwrap', 0]],
  B: [['bald', 1], ['receding', 0], ['buzz', 3], ['crew', 2], ['side_part', 3], ['comb_over', 0], ['slick_back', 2], ['quiff', 1], ['curly', 6], ['afro', 5], ['cornrows', 3], ['locs', 4], ['long', 10], ['ponytail', 9], ['bun', 8], ['pixie', 6], ['bob', 9], ['turban', 0], ['hijab', 6], ['headwrap', 3]],
};

export const WRAP_COLS = ['#2a3a6a', '#6a2a3a', '#2e5a4a', '#c8b8a0', '#1e1e24', '#7a5a9a', '#b8603a', '#3a7a9a', '#e0d4c4', '#8a2a2a', '#d0a040'];
export const GLASSES_COLS = ['#1e1a1e', '#5a3a22', '#7a2a2a', '#2a3a6a', '#9aa0aa', '#c8a040'];
export const MUG_COLS = ['#e8e4dc', '#c04a3a', '#3a6ab0', '#3a8a5a', '#e0b040', '#2a2a30'];
