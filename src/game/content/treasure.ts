// Treasure floors (spec 3.4): the Stationery Cupboard. No combat, one guaranteed upgrade: choose 1 of 3 attachments
// (a Desk Item, an Enhanced Benefit, or a rare weapon).
import { FLOOR_SETUP } from '../registry';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import { UiScene, EmailView, notify } from '../../ui/corpos';
import type { EmailAttachment } from '../../ui/corpos';
import { icon, deskItemIcon, weaponIcon } from '../../art/items';
import { def as wdef, WeaponInst } from '../weapons';
import { Pickup } from '../pickups';
import { S, RARITY_LABEL, findCentrepiece, earn, DEPT_SHORT } from './common';
import { rollOffers, addBenefit, benefitIcon, Offer } from './benefits';
import { rollDeskItem, acquireDeskItem } from './deskitems';
import { rollRewardWeapon } from './rewards';
import type { DeskItemDef } from '../../data/deskitems';

const BODIES = [
  'Following your requisition (form 27B, submitted in triplicate), the Cupboard has been unlocked. Please take ONE item. We are counting.',
  'Everything in here is technically stationery. Please select one of the following and do not tell Procurement about the others.',
  'Your request for "a better pen" has been escalated. The below were found. Choose one. The pens are not included.',
];

type Choice =
  | { t: 'desk'; d: DeskItemDef }
  | { t: 'benefit'; o: Offer }
  | { t: 'weapon'; w: WeaponInst }
  | { t: 'cash'; amount: number };

export function openCupboard(s: S, onTaken: () => void): void {
  const choices: Choice[] = [];
  const desk = rollDeskItem(s, s.floorRng.loot);
  if (desk) choices.push({ t: 'desk', d: desk });
  const bens = rollOffers(s, { dept: null, count: desk ? 1 : 2, minRarity: 1 });
  for (const o of bens) choices.push({ t: 'benefit', o });
  choices.push({ t: 'weapon', w: rollRewardWeapon(s, 1, 0.6) });
  if (choices.length < 3) choices.push({ t: 'cash', amount: 60 + s.plan.floor_number * 8 });

  const attachments: EmailAttachment[] = choices.map((c) => {
    switch (c.t) {
      case 'desk': return { icon: deskItemIcon(c.d.id), title: c.d.name, subtitle: 'Desk Item', desc: c.d.desc, rarity: c.d.tier, tag: 'DESK' };
      case 'benefit': {
        const d = c.o.def;
        const parent = d.synergy ? `Synergy: ${DEPT_SHORT[d.synergy[0]]} + ${DEPT_SHORT[d.synergy[1]]}` : `${DEPT_SHORT[d.dept]} Benefit`;
        return { icon: benefitIcon(d), title: d.name, subtitle: c.o.kind === 'upgrade' ? parent + ' - upgrade' : parent, desc: d.desc[c.o.rarity], rarity: c.o.rarity, tag: c.o.kind === 'upgrade' ? 'UPGRADE' : 'BENEFIT' };
      }
      case 'weapon': {
        const wd = wdef(c.w.id);
        return { icon: weaponIcon(c.w.id), title: wd.name, subtitle: `Rare ${wd.cls} weapon`, desc: wd.desc, rarity: wd.rarity, tag: 'WEAPON' };
      }
      default: return { icon: icon('cash'), title: 'Petty Cash', subtitle: 'The stationery budget', desc: `£${c.amount} in an unmarked envelope.`, rarity: 0, tag: 'CASH' };
    }
  });
  const email = new EmailView({
    from: 'Stationery Cupboard <supplies@corp.example>', subject: 'Re: Your Stationery Requisition', body: s.floorRng.cosmetic.pick(BODIES), attachments, allowSkip: false,
    onPick: (i) => {
      const c = choices[i];
      switch (c.t) {
        case 'desk': acquireDeskItem(s, c.d.id); break;
        case 'benefit':
          addBenefit(s, c.o.def.id, c.o.rarity);
          notify({ title: c.o.kind === 'upgrade' ? 'Benefit upgraded' : 'Benefit accepted', body: `${c.o.def.name} (${RARITY_LABEL[c.o.rarity]})`, icon: benefitIcon(c.o.def), kind: 'good', sound: false });
          break;
        case 'weapon': {
          const old = s.player.equip(c.w);
          if (old) s.world.add(new Pickup({ kind: 'weapon', weapon: old, x: s.player.x, y: s.player.y + 6, vx: 30, vy: 20 }));
          notify({ title: 'Equipment requisitioned', body: wdef(c.w.id).name, icon: weaponIcon(c.w.id), kind: 'good', sound: false });
          break;
        }
        default: earn(s, c.amount);
      }
      audio.sfx('ui_purchase');
      onTaken();
    },
  });
  app.push(new UiScene(email, { transparent: true }));
}

FLOOR_SETUP.treasure = (s) => {
  const c = findCentrepiece(s, ['stationery_cupboard'], 'treasure');
  let taken = false;
  s.world.interactables.push({
    x: c.x, y: c.y + 8, r: 36, priority: 1,
    get label() { return taken ? 'The cupboard is empty' : 'Open the Stationery Cupboard'; },
    sub: 'One item. Choose wisely.',
    enabled: () => !taken,
    onInteract: () => openCupboard(s, () => { taken = true; }),
  });
  s.hud.showBanner('STATIONERY CUPBOARD', 'No combat. One guaranteed upgrade. Please sign the log.', '#ffd34d', 3.2);
};
