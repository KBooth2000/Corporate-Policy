// Floor-clear reward grants (spec 3.3, 8.4): Benefit email, Petty Cash, weapon, food, Stress Modifier, Desk Item, elite bonus.
// A reward is a glowing pickup at the cleared room's reward point; collecting it opens the right UI.
import { REWARD_GRANT } from '../registry';
import { Pickup, dropCash } from '../pickups';
import { makeWeapon, rollWeapon, def as wdef, WeaponInst } from '../weapons';
import { icon, deskItemIcon, IconName } from '../../art/items';
import { BENEFIT_DEPTS } from '../../data/ids';
import type { BenefitDept } from '../../data/ids';
import type { Vec } from '../../core/math';
import { S, DEPT_NAMES } from './common';
import { openBenefitEmail } from './benefits';
import { rollDeskItem, acquireDeskItem } from './deskitems';

export function spawnReward(s: S, at: Vec, o: { kind: string; label: string; icon: HTMLCanvasElement; grant: () => void }): Pickup {
  return s.world.add(new Pickup({ kind: 'reward', x: at.x, y: at.y, reward: o }));
}

const isElite = (s: S): boolean => s.plan.floor_type === 'elite' || !!s.data.eliteReward;

/** A weapon whose rarity scales with floor/act/luck (and elites / treasure ask for rare-or-better). */
export function rollRewardWeapon(s: S, minRarity = 0, extraLuck = 0): WeaponInst {
  const rng = s.floorRng.loot;
  const luck = s.player.stats.luck + 0.3 + (s.plan.act - 1) * 0.15 + extraLuck;
  let id = rollWeapon(rng, s.plan.act, luck);
  for (let i = 0; i < 8 && wdef(id).rarity < minRarity; i++) id = rollWeapon(rng, s.plan.act, luck + 0.5);
  return makeWeapon(id, { durabilityMult: s.player.stats.durabilityMult, ammoMult: s.player.stats.ammoMult });
}

export function cashForFloor(s: S): number {
  const f = s.plan.floor_number;
  return Math.round((28 + f * 5) * s.floorRng.loot.vary(0.12));
}

// ---------------------------------------------------------------------------
REWARD_GRANT.benefit = (s, at) => {
  const dept: BenefitDept = s.plan.rewardDept ?? BENEFIT_DEPTS[s.floorRng.loot.int(0, BENEFIT_DEPTS.length - 1)];
  const boss = !!s.data.bossReward;
  const elite = isElite(s);
  spawnReward(s, at, {
    kind: 'benefit', label: `Open email: ${DEPT_NAMES[dept]}`, icon: icon(('dept_' + dept) as IconName),
    grant: () => {
      const ok = openBenefitEmail(s, { dept, boost: elite ? 1 : 0, minRarity: boss ? 1 : 0, onEmpty: () => dropCash(s.world, s.player.x, s.player.y, cashForFloor(s)) });
      if (!ok) s.world.floatText(s.player.x, s.player.y - 40, 'INBOX EMPTY', '#ffd34d');
    },
  });
};

REWARD_GRANT.rage_mod = (s, at) => {
  const elite = isElite(s);
  spawnReward(s, at, {
    kind: 'rage_mod', label: 'Open email: Occupational Health', icon: icon('reward_rage'),
    grant: () => {
      const ok = openBenefitEmail(s, { dept: null, pool: 'stress', boost: elite ? 1 : 0, minRarity: s.data.bossReward ? 1 : 0, onEmpty: () => dropCash(s.world, s.player.x, s.player.y, cashForFloor(s)) });
      if (!ok) s.world.floatText(s.player.x, s.player.y - 40, 'NO MORE STRESS TO GIVE', '#ff9a8a');
    },
  });
};

REWARD_GRANT.cash = (s, at) => {
  dropCash(s.world, at.x, at.y, cashForFloor(s));
};

REWARD_GRANT.weapon = (s, at) => {
  const elite = isElite(s);
  const w = rollRewardWeapon(s, elite ? 1 : 0, elite ? 0.4 : 0);
  s.world.add(new Pickup({ kind: 'weapon', weapon: w, x: at.x, y: at.y }));
};

REWARD_GRANT.heal = (s, at) => {
  const p = s.player;
  const r = s.floorRng.loot;
  const f = s.plan.floor_number;
  if (r.chance(0.5)) {
    // first aid kit: a big chunk of Wellbeing
    s.world.add(new Pickup({ kind: 'heal', amount: Math.round(p.maxHp * (0.4 + Math.min(0.1, f * 0.004))), x: at.x, y: at.y }));
  } else {
    // a sandwich and a couple of biscuits
    s.world.add(new Pickup({ kind: 'heal', amount: Math.round(p.maxHp * 0.22), x: at.x - 6, y: at.y }));
    s.world.add(new Pickup({ kind: 'heal', amount: Math.round(p.maxHp * 0.1), x: at.x + 6, y: at.y + 2, vx: 30 }));
    s.world.add(new Pickup({ kind: 'heal', amount: Math.round(p.maxHp * 0.08), x: at.x, y: at.y + 6, vy: 30 }));
  }
};

/** Desk Item pickup: the item is rolled now (so the pickup shows the real icon) and reserved until collected. */
REWARD_GRANT.desk_item = (s, at) => {
  const item = rollDeskItem(s, s.floorRng.loot);
  if (!item) { dropCash(s.world, at.x, at.y, cashForFloor(s) + 20); return; }
  const reserved: Set<string> = (s.data.cpReservedDesk ??= new Set<string>());
  reserved.add(item.id);
  spawnReward(s, at, {
    kind: 'desk_item', label: `Take: ${item.name}`, icon: deskItemIcon(item.id),
    grant: () => { reserved.delete(item.id); acquireDeskItem(s, item.id); },
  });
};

/** Elite bonus (spec 8.4): a rare weapon and a purse. */
REWARD_GRANT.elite = (s, at) => {
  s.data.eliteReward = true;
  try { REWARD_GRANT.weapon!(s, { x: at.x - 8, y: at.y }); } finally { delete s.data.eliteReward; }
  dropCash(s.world, at.x + 8, at.y, 25 + s.plan.floor_number * 3);
};

// Boss rewards (spec 8.4) are issued by the boss module: it sets s.data.bossReward = true, then calls REWARD_GRANT.benefit
// (offers Enhanced-or-better) and REWARD_GRANT.desk_item (guaranteed), and handles the full heal and Annual Leave bonus itself.

