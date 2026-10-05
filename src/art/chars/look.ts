// rollLook (deterministic, JSON-serialisable) and resolveDress (look → drawing description).
import { Rng } from '../../core/rng';
import type { CharacterLook, LookSpec } from '../characters';
import type { Dress, HairId, LanyardSpec, Mood, Worn, Pattern, Print } from './types';
import { KITS, ROLE_KITS, STAFF_KIT, HEADS, HAIR_WEIGHTS, WRAP_COLS, GLASSES_COLS, MUG_COLS, Kit } from './kits';
import { SKIN_TONES, HAIR_NATURAL, HAIR_DYED, ramp, skinRamp, ACT_GLOW, ACT_STRAP, ACT_EYE, GOLD, GOLD_HI, SILVER, FAB } from './colours';
import { PROPS } from './rig';
import { C } from './pixbuf';

/** Layer schema version stored in look.layers.v. */
export const LOOK_VERSION = 1;

export function kitFor(look: { kind: CharacterLook['kind']; archetype?: CharacterLook['archetype']; role?: CharacterLook['role'] }): Kit {
  if (look.kind === 'player') return ROLE_KITS[look.role ?? 'office_worker'];
  if (look.archetype) return KITS[look.archetype];
  if (look.role) return ROLE_KITS[look.role];
  return STAFF_KIT;
}

function weighted<T>(rng: Rng, items: [T, number][]): T {
  return rng.weighted(items, (x) => x[1])[0];
}

/**
 * Roll every appearance choice into `layers`. Deterministic for a given Rng state; consumes a fixed
 * number of draws per branch so the same seed always gives the same individual.
 */
export function rollLayers(look: Pick<CharacterLook, 'kind' | 'archetype' | 'role' | 'tier' | 'rig' | 'build'>, rng: Rng): Record<string, number | string> {
  const kit = kitFor(look);
  const L: Record<string, number | string> = { v: LOOK_VERSION };
  const tier = look.tier;
  L.act = Math.min(4, kit.act + tier);
  L.skin = rng.pick(SKIN_TONES);
  // hair
  const hw = HAIR_WEIGHTS[look.rig].filter(([id]) => !(kit.worn.some((w) => w.startsWith('hardhat')) && (id === 'afro' || id === 'headwrap')));
  L.hairStyle = weighted(rng, hw);
  const greyChance = tier === 2 ? 0.35 : tier === 1 ? 0.15 : 0.04;
  const dyed = rng.chance(0.06), grey = rng.chance(greyChance);
  const dyedHex = rng.pick(HAIR_DYED), greyHex = rng.pick(['#8a8a8a', '#c9c9c9', '#a8a8a0', '#e0e0dc']);
  const natHex = rng.pick(HAIR_NATURAL.slice(0, 6).concat(['#9a3d1c', '#2a2a3a', '#1e1611', '#3b2a1e']));
  L.hair = dyed ? dyedHex : grey ? greyHex : natHex;
  L.head = rng.int(0, HEADS[look.rig].length - 1);
  L.wrap = rng.pick(WRAP_COLS);
  // outfit: sharper suits at higher seniority
  const oi = rng.weighted(kit.outfits.map((_, i) => i), (i) => {
    const f = kit.outfits[i].formal;
    return 1 / (1 + Math.abs(f - tier) * 1.6) + (tier === 2 && f === 2 ? 1 : 0);
  });
  L.outfit = oi;
  const o = kit.outfits[oi];
  L.main = rng.pick(o.main);
  L.under = rng.pick(o.under ?? [FAB.white, FAB.paleblue, FAB.cream]);
  L.tie = o.tie && rng.chance(o.tieChance ?? 1) ? rng.pick(o.tie) : '';
  L.legs = o.suit ? (L.main as string) : rng.pick(o.legs.length ? o.legs : [FAB.charcoal]);
  L.skirt = look.rig === 'B' && rng.chance(o.skirtB ?? 0) ? 1 : 0;
  if (o.top === 'dress') L.skirt = 1;
  L.shoes = rng.pick(o.shoes ?? ['#24242c']);
  L.heels = look.rig === 'B' && rng.chance(0.35) && o.formal >= 1 ? 1 : 0;
  L.pattern = o.pattern && rng.chance(o.patternChance ?? 1) ? o.pattern : 'none';
  L.overlayCol = o.overlayCol ? rng.pick(o.overlayCol) : '';
  L.tights = rng.chance(0.5) ? rng.pick(['#2a2a30', '#5a4a40', '#3a3040']) : '';
  // accessories
  const glassesP = kit.glasses ?? 0.22;
  L.glasses = rng.chance(glassesP) ? rng.int(1, 4) : 0;
  L.glassesCol = rng.pick(GLASSES_COLS);
  const facialP = look.rig === 'A' ? (L.hairStyle === 'turban' ? 0.85 : 0.42) : 0.02;
  L.facial = rng.chance(facialP) ? rng.int(1, 5) : 0;
  const headset = kit.worn.includes('headset1') || kit.worn.includes('headset2');
  L.earbuds = !headset && rng.chance(look.kind === 'player' ? 0.25 : 0.1) ? 1 : 0;
  L.earrings = rng.chance(look.rig === 'B' ? 0.45 : 0.12) ? 1 : 0;
  L.freckles = rng.chance(0.14) ? 1 : 0;
  L.blush = rng.chance(0.12) ? 1 : 0;
  L.watch = tier === 2 ? 3 : tier === 1 ? (rng.chance(0.7) ? 2 : 1) : rng.chance(0.3) ? 1 : 0;
  L.mug = kit.mugOk && rng.chance(0.4) ? 1 : 0;
  L.mugCol = rng.pick(MUG_COLS);
  L.heldCol = rng.pick(kit.heldCols ?? MUG_COLS);
  L.wornCol = rng.pick(kit.wornCols ?? [FAB.navy, FAB.forest, FAB.rust, FAB.charcoal, FAB.teal]);
  L.pocket = rng.pick(['#f0f0f0', '#c03040', '#3a6ad0', '#d4a537']);
  return L;
}

export function rollLookImpl(spec: LookSpec, rng: Rng): CharacterLook {
  const kit = kitFor(spec);
  const rig: 'A' | 'B' = rng.chance(0.5) ? 'A' : 'B';
  const build = rng.weighted(['slim', 'average', 'heavy'] as const, (b) => kit.build[b === 'slim' ? 0 : b === 'average' ? 1 : 2]);
  const seed = rng.nextU32();
  const look: CharacterLook = { kind: spec.kind, tier: spec.tier ?? 0, rig, build, seed, layers: {} };
  if (spec.archetype) look.archetype = spec.archetype;
  if (spec.role) look.role = spec.role;
  look.layers = rollLayers(look, rng.fork('layers'));
  return look;
}

/** Copy of a look with its indoctrination act overridden (spawners: pass the current floor's act). */
export function withAct(look: CharacterLook, act: 1 | 2 | 3 | 4): CharacterLook {
  return { ...look, layers: { ...look.layers, act } };
}

const num = (v: number | string | undefined, d: number): number => (typeof v === 'number' ? v : v === undefined || v === '' ? d : Number(v) || d);
const str = (v: number | string | undefined, d: string): string => (typeof v === 'string' && v !== '' ? v : d);

/** Resolve a look into a fully specified Dress. Pure; missing layers are re-rolled from look.seed. */
export function resolveDress(look: CharacterLook): Dress {
  let L = look.layers;
  if (!L || L.v === undefined) L = { ...rollLayers(look, new Rng(look.seed >>> 0)), ...(L ?? {}) };
  const kit = kitFor(look);
  const tier = look.tier;
  const act = Math.max(1, Math.min(4, num(L.act, kit.act))) as 1 | 2 | 3 | 4;
  const o = kit.outfits[Math.min(kit.outfits.length - 1, num(L.outfit, 0))];
  const rig = look.rig;
  const base = PROPS[rig][look.build];
  const hp = HEADS[rig][num(L.head, 0) % HEADS[rig].length];
  const prop = { ...base, headW: base.headW + hp.dw, headH: base.headH + hp.dh };
  const promo = look.promotedRank ?? 0;
  const enemy = look.kind === 'enemy';
  const mood: Mood = enemy ? 'hr' : look.kind === 'player' ? 'angry' : 'neutral';

  const worn: Worn[] = [...kit.worn];
  if (L.wornCol === undefined) void 0;
  // top
  const sleeveLen = o.sleeve ?? 'long';
  const mainHex = str(L.main, o.main[0]);
  const isSuit = o.top === 'suit' || o.top === 'blazer';
  const underHex = str(L.under, FAB.white);
  const sleeveHex = o.top === 'gilet' || o.top === 'waistcoat' || o.top === 'tabard' || o.overlay === 'apron' ? underHex : mainHex;
  const legKind = num(L.skirt, 0) ? 'skirt' : (o.legKind ?? 'trousers');
  const legsHex = o.top === 'dress' ? mainHex : str(L.legs, FAB.charcoal);
  const lanyard = makeLanyard(look, kit, act, tier, promo);
  const trim = enemy && act === 4 ? C(GOLD) : null;
  const held = kit.held ?? (num(L.mug, 0) ? 'mug' : null);
  const carry = kit.held ? kit.carry : held === 'mug' ? 'cup' : 'none';
  const glowHex = look.reonboarded ? '#b8fff0' : ACT_GLOW[act];
  const dress: Dress = {
    rig, build: look.build, prop, head: hp,
    skin: skinRamp(str(L.skin, '#e8b996')),
    hair: ramp(str(L.hair, '#3b2a1e')),
    hairStyle: str(L.hairStyle, 'crew') as HairId,
    wrap: ramp(str(L.wrap, '#2a3a6a')),
    top: {
      kind: o.top,
      main: ramp(mainHex),
      sleeve: ramp(sleeveHex),
      sleeveLen,
      under: ramp(underHex),
      tie: str(L.tie, '') ? ramp(str(L.tie, '')) : null,
      pattern: str(L.pattern, 'none') as Pattern,
      print: (o.print ?? 'none') as Print,
      overlay: o.overlay ?? 'none',
      overlayCol: o.overlay ? ramp(str(L.overlayCol, (o.overlayCol ?? ['#c8e83a'])[0])) : null,
      scruffy: !!o.scruffy,
    },
    legs: { kind: legKind, main: ramp(legsHex), tights: legKind === 'skirt' && str(L.tights, '') ? ramp(str(L.tights, '')) : null },
    shoes: ramp(str(L.shoes, '#24242c')),
    heels: !!num(L.heels, 0),
    worn,
    wornCol: ramp(str(L.wornCol, kit.wornCols?.[0] ?? FAB.navy)),
    held,
    heldCol: ramp(held === 'mug' ? str(L.mugCol, '#e8e4dc') : str(L.heldCol, '#2a4a8a')),
    carry,
    lanyard,
    acc: {
      glasses: num(L.glasses, 0) as 0 | 1 | 2 | 3 | 4,
      glassesCol: ramp(str(L.glassesCol, '#1e1a1e')),
      facial: num(L.facial, 0) as 0 | 1 | 2 | 3 | 4 | 5,
      earbuds: !!num(L.earbuds, 0),
      earrings: !!num(L.earrings, 0),
      watch: (enemy ? Math.max(num(L.watch, 0), tier === 2 ? 3 : 0) : num(L.watch, 0)) as 0 | 1 | 2 | 3,
      freckles: !!num(L.freckles, 0),
      blush: !!num(L.blush, 0),
    },
    flair: {
      rosette: promo >= 1 && promo < 4,
      tiePin: promo >= 2,
      sparkle: promo >= 3,
      crown: promo >= 4,
      badges: enemy ? tier + (promo >= 2 ? 1 : 0) : 0,
      pocketSquare: isSuit && enemy && tier >= 1 ? C(str(L.pocket, '#f0f0f0')) : null,
      trim,
    },
    mood,
    eyeGlow: enemy && (act >= 3 || look.reonboarded) ? C(look.reonboarded ? '#30ffd0' : ACT_EYE[act]) : null,
    fxCol: enemy ? C(glowHex) : look.kind === 'player' ? C('#d8ecff') : C('#f0f0f0'),
  };
  if (look.kind === 'player' && look.role === 'night_cleaner') dress.wornCol = ramp(str(L.wornCol, '#e0a830'));
  return dress;
}

function makeLanyard(look: CharacterLook, kit: Kit, act: 1 | 2 | 3 | 4, tier: number, promo: number): LanyardSpec | null {
  if (look.kind === 'player') return null;
  const style = kit.lanyard ?? (look.kind === 'npc' ? null : 'normal');
  if (!style) return null;
  if (look.kind === 'npc') {
    // snapped out of it: dull, unlit lanyard
    return { style, strap: ramp('#6a707a'), edge: null, card: ramp('#c8c8c0'), medallion: false, glow: null, glowAmt: 0, pins: [] };
  }
  let strapHex = style === 'wellbeing' ? '#8ad8c8' : ACT_STRAP[act];
  let edge: number | null = null;
  if (tier === 1) edge = C(SILVER);
  if (tier >= 2 || promo >= 4) { strapHex = style === 'wellbeing' ? '#8ad8c8' : '#c8952e'; edge = C(GOLD_HI); }
  if (act === 4 && style !== 'wellbeing') { strapHex = tier >= 2 || promo >= 4 ? '#c8952e' : '#9a1a2a'; edge = C(GOLD); }
  let glowAmt = [0, 0.24, 0.34, 0.42, 0.5][act];
  let glow = C(ACT_GLOW[act]);
  let card = ramp('#eef2f2');
  if (look.reonboarded) {
    strapHex = '#f2fbff'; glow = C('#b8fff0'); glowAmt += 0.3; card = ramp('#ffffff');
    edge = C('#9ffff0');
  }
  const pins = style === 'badges' ? [C('#e04848'), C('#48a8e8'), C('#f0c040'), C('#60c060'), C('#ffffff')] : [];
  return { style, strap: ramp(strapHex), edge, card, medallion: act === 4 && style !== 'wellbeing' && style !== 'oversized', glow, glowAmt, pins };
}
