// Basic destructibles (spec 4.7: "objects that change a fight break through scripted states: intact, damaged, destroyed").
// Combat-relevant juice only: sensible hp, debris, a satisfying sound. No free physics.
import { registerProp, World, PropRT, PropHit } from '../world';
import { fxRng } from '../../core/rng';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import type { SfxName } from '../../audio/audio';
import { debrisBurst, sparks, smokePuff } from '../fx';
import { centre, fieldOf, hitDir, isHard } from './core';
import { GLASS_COLS, PAPER_COLS, paperBurst, shardDecals, chip, fxReady, ring } from './hazards';

interface Spec {
  hp: number;
  /** Debris colours (burst on break). */
  cols: string[];
  debris?: 'debris' | 'glass';
  paper?: number;
  glass?: boolean;
  /** Soil / stain decal colour on the floor when broken. */
  stain?: string;
  /** Spawns a puddle when broken. */
  wet?: boolean;
  sfx?: SfxName;
  hitSfx?: SfxName;
  /** Light-hit particles. */
  chips?: string[];
  shake?: number;
  /** Never reaches 'destroyed' (cover that only visibly damages). */
  sturdy?: boolean;
  /** Float text on break. */
  text?: string;
}

function feedback(w: World, p: PropRT, hit: PropHit, s: Spec): void {
  if (!fxReady(w, p, 0.25)) return;
  const c = centre(p);
  const dir = hitDir(p, hit);
  const cols = s.chips ?? s.cols;
  for (let i = 0; i < 4; i++) {
    const a = dir + fxRng.range(-0.9, 0.9), sp = fxRng.range(30, 80);
    w.particles.spawn({ kind: 'debris', x: c.x, y: c.y, z: fxRng.range(4, 12), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: fxRng.range(20, 50), gravity: 300, life: 0.8, col: fxRng.pick(cols), size: 1, toDecal: true, roomId: w.roomAt(c.x, c.y) });
  }
  audio.sfx(s.hitSfx ?? 'thud', { x: c.x, y: c.y, vol: 0.32, pitch: 1.1 + fxRng.range(0, 0.3) });
}

function breakFx(w: World, p: PropRT, hit: PropHit | undefined, s: Spec): void {
  const c = centre(p);
  const room = w.roomAt(c.x, c.y);
  const dir = hit ? hitDir(p, hit) : 0;
  debrisBurst(w.particles, c.x, c.y - 2, s.glass ? 18 : 14, s.cols, room, s.debris ?? (s.glass ? 'glass' : 'debris'));
  if (s.paper) paperBurst(w, c.x, c.y - 4, s.paper, hit ? dir : undefined, 3.6);
  if (s.glass) { shardDecals(w, c.x, c.y, 10, Math.max(8, p.def.w * 0.6)); sparks(w.particles, c.x, c.y - 4, 6, '#ffffff', 90); }
  if (s.stain) w.decals.splat(room, c.x, c.y + 4, Math.max(5, p.def.w * 0.5), s.stain, 'splat');
  if (s.wet) fieldOf(w).addPuddle(c.x, p.def.y + 3, 16, 12, hit?.source ?? null);
  smokePuff(w.particles, c.x, c.y, 4, '#cfc6b4', 5);
  audio.sfx(s.sfx ?? (s.glass ? 'glass_shatter' : 'debris'), { x: c.x, y: c.y, vol: 0.8 });
  app.renderer.shake(s.shake ?? 2, 0.15);
  if (s.text) w.floatText(c.x, c.y - 16, s.text, '#ffffff');
}

function register(kinds: Parameters<typeof registerProp>[0], s: Spec): void {
  registerProp(kinds, {
    maxHp: s.hp,
    onHit(w, p, hit) {
      if (p.state === 'destroyed') return true;
      if (s.sturdy) {
        const wasIntact = p.state === 'intact';
        chip(w, p, hit, 1);
        if (isHard(hit) && wasIntact && p.state === 'damaged') breakFx(w, p, hit, s);
        else feedback(w, p, hit, s);
        return true;
      }
      feedback(w, p, hit, s);
      return false;                       // default hp / state progression, onDestroyed does the burst
    },
    onDestroyed(w, p, hit) { breakFx(w, p, hit, s); },
  });
}

const WOOD = ['#8a6a43', '#b8925a', '#6b4a2b'];
const SOIL = ['#4a3424', '#6a4a30', '#3e7a3a', '#5a9a4a'];
const METAL = ['#8a94a0', '#6a7480', '#b8c0c8'];

register('plant', { hp: 10, cols: SOIL, stain: '#4a3424', sfx: 'debris', chips: SOIL });
register('plant_large', { hp: 18, cols: SOIL, stain: '#4a3424', sfx: 'debris', chips: SOIL, shake: 2.5 });
register('bin', { hp: 6, cols: ['#8a94a0', '#f4f1e8', '#dcd6c8'], paper: 14, sfx: 'paper_rustle' });
register('whiteboard', { hp: 24, cols: ['#f0f2f4', '#c8ccd2', '#8a94a0'], paper: 8, glass: true, shake: 2.5, text: 'ACTION POINTS' });
register('coat_stand', { hp: 8, cols: WOOD, sfx: 'thud' });
register('mop_bucket', { hp: 6, cols: ['#cfd8de', '#8cc4e6', '#ffffff'], wet: true, sfx: 'water_splash' });
register(['trophy_cabinet', 'minibar', 'globe_bar'], { hp: 30, cols: GLASS_COLS, glass: true, wet: false, shake: 3, text: 'MINUTES TAKEN' });
register(['mirror', 'tv_screen', 'leaderboard_screen', 'stock_ticker', 'projector_screen'], { hp: 10, cols: ['#2a2e36', '#9fd0e6', '#ffffff', '#6a7480'], glass: true, sfx: 'screen_smash', shake: 2 });
register('sink', { hp: 24, cols: ['#dfe6ea', '#8cc4e6'], wet: true, sfx: 'water_splash', sturdy: true, hitSfx: 'water_splash' });
register(['cable_reel', 'toolbox', 'ladder'], { hp: 16, cols: METAL, sfx: 'debris' });
register('beanbag', { hp: 12, cols: ['#f4f1e8', '#dcd6c8', '#ffd34d'], paper: 18, sfx: 'paper_rustle' });

// cover-sized furniture: sturdy, only visibly breaks (never removes the cover)
register(['bookshelf', 'pigeonholes', 'archive_stack', 'stationery_shelf', 'mail_trolley'], { hp: 50, cols: WOOD, paper: 14, chips: PAPER_COLS, sturdy: true, hitSfx: 'paper_rustle', sfx: 'debris', shake: 2 });
register(['photocopier'], { hp: 60, cols: [...METAL, ...PAPER_COLS], paper: 10, chips: PAPER_COLS, sturdy: true, hitSfx: 'photocopier', sfx: 'debris', shake: 2 });
register(['shredder'], { hp: 50, cols: [...METAL, ...PAPER_COLS], paper: 20, chips: PAPER_COLS, sturdy: true, hitSfx: 'shredder', sfx: 'debris' });
register(['hand_dryer'], { hp: 30, cols: ['#d8dce0', '#8a94a0'], sturdy: true, hitSfx: 'hand_dryer', sfx: 'debris' });
register(['sofa', 'fridge', 'boiler', 'canteen_counter'], { hp: 60, cols: ['#8a94a0', '#d8dce0', '#6a7480'], sturdy: true, sfx: 'debris', shake: 2 });

// desks: the monitor takes the beating (cosmetic) - desk stays as cover
for (const k of ['desk', 'desk_l', 'exec_desk', 'reception_desk'] as const) {
  registerProp(k, {
    maxHp: 60,
    onHit(w, p, hit) {
      if (p.state === 'destroyed') return true;
      const c = centre(p);
      p.hp = Math.max(1, p.hp - hit.amount);
      if (!p.data.monitor && (isHard(hit) || p.hp < p.maxHp * 0.6)) {
        p.data.monitor = true;
        w.setPropState(p, 'damaged');
        debrisBurst(w.particles, c.x, c.y - 6, 14, ['#1a1e26', '#9fd0e6', '#ffffff', '#6a7480'], w.roomAt(c.x, c.y), 'glass');
        sparks(w.particles, c.x, c.y - 8, 10, '#ffe9a0', 120);
        paperBurst(w, c.x, c.y - 6, 6);
        audio.sfx('screen_smash', { x: c.x, y: c.y });
        app.renderer.shake(2, 0.12);
        w.floatText(c.x, c.y - 18, 'DUAL-SCREEN SETUP HALVED', '#ffffff');
      } else if (fxReady(w, p, 0.3)) {
        paperBurst(w, c.x, c.y - 6, 3);
        audio.sfx('thud', { x: c.x, y: c.y, vol: 0.3 });
      }
      return true;
    },
  });
}

// sales gong: hit it. Obviously.
registerProp('sales_gong', {
  maxHp: 40,
  onHit(w, p) {
    const c = centre(p);
    if (fxReady(w, p, 0.6)) {
      audio.sfx('gong', { x: c.x, y: c.y });
      ring(w, c.x, c.y - 8, 34, '#ffd34d', 0.5);
      ring(w, c.x, c.y - 8, 18, '#ffffff', 0.3);
      app.renderer.shake(2, 0.2);
      w.floatText(c.x, c.y - 24, 'DEAL CLOSED', '#ffd34d');
    }
    p.hp = Math.max(1, p.hp);
    return true;
  },
});

