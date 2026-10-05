// Challenge floors (spec 3.4): Fire Drill (timed clear) and Quiet Carriage (no Rage). Reached by corridor, optional,
// with a bonus reward on success and a reduced one on failure. The challenge comes from s.plan.challenge.
import { FLOOR_SETUP, REWARD_GRANT } from '../registry';
import { dropCash } from '../pickups';
import { drawPanel, bar } from '../../ui/hud';
import { drawText } from '../../render/font';
import { app } from '../../core/app';
import type { Ctx } from '../../render/canvas';
import type { World } from '../world';
import type { Player } from '../player';
import type { RunState } from '../run';
import { audio } from '../../audio/audio';
import { BENEFIT_DEPTS } from '../../data/ids';
import { S, foes, on, tick, earn } from './common';
import { openBenefitEmail } from './benefits';
import { rollDeskItem, acquireDeskItem } from './deskitems';
import { cashForFloor, rollRewardWeapon, spawnReward } from './rewards';
import { icon, deskItemIcon } from '../../art/items';
import { Pickup } from '../pickups';

export type ChallengeKind = 'fire_drill' | 'quiet_carriage' | 'no_damage';
export interface ChallengeState {
  kind: ChallengeKind;
  state: 'active' | 'success' | 'failed';
  t: number;
  limit: number;
  flawless: boolean;
  /** Fraction of the time limit left when the floor was cleared (Fire Drill). */
  timeLeftFrac: number;
}
export const challengeOf = (s: S): ChallengeState | undefined => s.data.challenge as ChallengeState | undefined;

const mmss = (t: number): string => { const n = Math.max(0, Math.ceil(t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

/** Draw an extra HUD strip by wrapping this floor's Hud.render (the Hud instance is per floor). */
function hudStrip(s: S, draw: (g: Ctx, cx: number, y: number) => void): void {
  const hud = s.hud;
  const orig = hud.render.bind(hud) as (g: Ctx, w: World, p: Player, run: RunState) => void;
  hud.render = (g: Ctx, w: World, p: Player, run: RunState) => {
    orig(g, w, p, run);
    const r = app.renderer;
    draw(g, Math.round(r.W / 2), 5 + r.safe.t);
  };
}

FLOOR_SETUP.challenge = (s) => {
  const planned = s.plan.challenge;
  const kind: ChallengeKind = planned === 'quiet_carriage' ? 'quiet_carriage' : planned === 'no_damage' ? 'no_damage' : planned === 'fire_drill' ? 'fire_drill' : (s.floorRng.events.chance(0.5) ? 'fire_drill' : 'quiet_carriage');
  s.plan.challenge = kind;
  const c: ChallengeState = { kind, state: 'active', t: 0, limit: Math.round(Math.min(160, Math.max(75, 55 + s.plan.enemy_budget * 1.6))), flawless: true, timeLeftFrac: 0 };
  s.data.challenge = c;
  on(s, 'playerHit', () => { c.flawless = false; if (c.kind === 'no_damage' && c.state === 'active') { c.state = 'failed'; s.hud.showBanner('DISTURBANCE LOGGED', 'Flawless record broken. Reduced reward.', '#ff6a5a', 3); } });
  on(s, 'floorClear', () => {
    if (c.state !== 'active' && c.kind !== 'fire_drill') return;
    if (c.state === 'active') {
      c.state = 'success';
      c.timeLeftFrac = c.kind === 'fire_drill' ? Math.max(0, 1 - c.t / c.limit) : 0;
      s.hud.showBanner(c.kind === 'fire_drill' ? 'FIRE DRILL COMPLETE' : c.kind === 'quiet_carriage' ? 'QUIET CARRIAGE: CLEAR' : 'IMMACULATE RECORD', 'Bonus reward available.', '#8af0a0', 3);
      audio.sfx('floor_clear');
    }
  });
  if (kind === 'fire_drill') setupFireDrill(s, c);
  else if (kind === 'quiet_carriage') setupQuietCarriage(s, c);
  else setupNoDamage(s, c);
};

// ---------------------------------------------------------------------------
function setupFireDrill(s: S, c: ChallengeState): void {
  const w = s.world;
  w.alarm = true; // doors stay open, everyone hunts: it is a fire drill
  for (const e of foes(s)) e.aware = true;
  s.hud.showBanner('FIRE DRILL', `Clear the floor within ${mmss(c.limit)}. Assembly point is the lift lobby.`, '#ff6a5a', 3.5);
  audio.sfx('alarm');
  tick(s, (dt) => {
    if (c.state === 'success' || w.floorCleared) return;
    c.t += dt;
    if (c.state === 'active' && c.t >= c.limit) {
      c.state = 'failed';
      s.hud.showBanner('ASSEMBLY POINT MISSED', 'The drill is over. Your reward has been reduced.', '#ff6a5a', 3.5);
      audio.sfx('ui_error');
    }
  });
  hudStrip(s, (g, cx, y) => {
    const left = Math.max(0, c.limit - c.t);
    const frac = left / c.limit;
    const pw = 150;
    const x = cx - pw / 2;
    drawPanel(g, x, y, pw, 25, c.state === 'failed' ? '#2a0e0e' : 'rgba(10,12,18,0.78)');
    const done = c.state === 'success';
    const col = done ? '#8af0a0' : c.state === 'failed' ? '#ff6a5a' : frac < 0.2 ? (Math.floor(app.time * 6) % 2 ? '#ff6a5a' : '#ffd34d') : frac < 0.4 ? '#ffd34d' : '#ffffff';
    drawText(g, 'FIRE DRILL', x + 5, y + 3, { color: '#ff9a8a', shadow: null });
    drawText(g, done ? 'CLEAR' : c.state === 'failed' ? 'TIME UP' : mmss(left), x + pw - 5, y + 3, { color: col, align: 'right', shadow: null });
    bar(g, x + 4, y + 15, pw - 8, 5, done ? 1 : frac, done ? '#4fdc7a' : frac < 0.2 ? '#ff4a3a' : frac < 0.4 ? '#ffb000' : '#5ec8ff', '#14202a');
  });
}

function setupQuietCarriage(s: S, c: ChallengeState): void {
  const p = s.player;
  p.bannedVerbs.add('rage');
  let warn = 0;
  p.onPolicyBreach = (verb) => {
    if (verb !== 'rage' || s.world.time < warn) return;
    warn = s.world.time + 1.5;
    s.world.floatText(p.x, p.y - 40, 'QUIET CARRIAGE: NO RAGE', '#ff9a8a');
    audio.sfx('ui_error', { vol: 0.5 });
  };
  // Player.verbBanned() only reports the breach, so Rage is also made impossible at the source
  p.addRage = () => { /* blocked */ };
  p.activateRage = () => { p.onPolicyBreach?.('rage'); };
  tick(s, () => { p.rage = 0; p.raging = 0; });
  s.hud.showBanner('QUIET CARRIAGE', 'Rage is disabled. Please keep your voice down.', '#9fe0ff', 3.5);
  hudStrip(s, (g, cx, y) => {
    const pw = 168;
    const x = cx - pw / 2;
    drawPanel(g, x, y, pw, 25, 'rgba(10,18,30,0.78)');
    drawText(g, 'QUIET CARRIAGE', x + 5, y + 3, { color: '#9fe0ff', shadow: null });
    drawText(g, 'RAGE OFFLINE', x + pw - 5, y + 3, { color: '#ff9a8a', align: 'right', shadow: null });
    drawText(g, c.state === 'success' ? 'CARRIAGE CLEAR' : c.flawless ? 'NO DISTURBANCES LOGGED' : 'DISTURBANCE LOGGED', x + pw / 2, y + 14, { color: c.state === 'success' || c.flawless ? '#8af0a0' : '#ffd34d', align: 'center', shadow: null });
  });
}

function setupNoDamage(s: S, c: ChallengeState): void {
  s.hud.showBanner('NO-DAMAGE AUDIT', 'Clear the floor without being touched.', '#ffd34d', 3.5);
  hudStrip(s, (g, cx, y) => {
    const pw = 150;
    const x = cx - pw / 2;
    drawPanel(g, x, y, pw, 14, 'rgba(10,12,18,0.78)');
    drawText(g, c.state === 'failed' ? 'AUDIT FAILED' : 'AUDIT: NO DAMAGE', x + pw / 2, y + 3, { color: c.state === 'failed' ? '#ff6a5a' : '#8af0a0', align: 'center', shadow: null });
  });
}

// ---------------------------------------------------------------------------
// Rewards: bonus on success, reduced on failure
REWARD_GRANT.challenge = (s, at) => {
  const c = challengeOf(s);
  const cash = cashForFloor(s);
  const w = s.world;
  if (!c || c.state === 'failed') {
    dropCash(w, at.x, at.y, Math.round(cash * 0.5));
    return;
  }
  // success: cash plus a bonus item
  dropCash(w, at.x, at.y, Math.round(cash * 1.2) + (c.kind === 'fire_drill' && c.timeLeftFrac > 0.5 ? 20 : 0));
  const dept = BENEFIT_DEPTS[s.floorRng.loot.int(0, BENEFIT_DEPTS.length - 1)];
  spawnReward(s, { x: at.x - 14, y: at.y + 6 }, {
    kind: 'benefit', label: 'Open email: Bonus Benefit', icon: icon(('dept_' + dept) as any),
    grant: () => { openBenefitEmail(s, { dept, minRarity: 1, onEmpty: () => earn(s, cash) }); },
  });
  if (c.kind !== 'fire_drill' && c.flawless) {
    const item = rollDeskItem(s, s.floorRng.loot);
    if (item) spawnReward(s, { x: at.x + 14, y: at.y + 6 }, { kind: 'desk_item', label: `Take: ${item.name}`, icon: deskItemIcon(item.id), grant: () => { acquireDeskItem(s, item.id); } });
    else s.world.add(new Pickup({ kind: 'weapon', weapon: rollRewardWeapon(s, 1, 0.4), x: at.x + 14, y: at.y + 6 }));
  }
};
