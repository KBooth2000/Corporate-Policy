// Shops (spec 8.3): the Canteen (corridor shop floor, an intranet catalogue) and in-room vending machines.
// Petty Cash flows through run.pettyCash / run.log.cashSpent / bus 'shopBuy' (see spend() in common.ts).
import { FLOOR_SETUP } from '../registry';
import { app } from '../../core/app';
import { Rng } from '../../core/rng';
import { UiScene, IntranetPage, Product, notify } from '../../ui/corpos';
import { PRICES, ROLES } from '../../data/tables';
import { SHOP_BLURBS, VENDING_LINES } from '../../data/text/ui';
import { icon, deskItemIcon, weaponIcon, pickupSprite } from '../../art/items';
import { WeaponInst, makeWeapon, rollWeapon, def as wdef } from '../weapons';
import { Pickup } from '../pickups';
import type { PropRT } from '../world';
import { S, Rar, DEPT_SHORT, RARITY_LABEL, floorInstallers, findCentrepiece, spend, spendable, creditLimit, heldRarity } from './common';
import { rollOffers, addBenefit, benefitIcon, Offer } from './benefits';
import { rollDeskItem, acquireDeskItem, deskTierPrice } from './deskitems';
import type { DeskItemDef } from '../../data/deskitems';

type Kind = 'benefit' | 'desk' | 'weapon' | 'heal' | 'repair' | 'reroll' | 'snack' | 'throwable';
interface Item {
  kind: Kind; name: string; desc: string; icon: HTMLCanvasElement | null; base: number; rarity?: number; tag: string; sold: boolean;
  offer?: Offer; desk?: DeskItemDef; weapon?: WeaponInst; heal?: number;
}
interface ShopState { items: Item[]; rerolls: number; paid: number; free: number; }

const blurb = (key: keyof typeof SHOP_BLURBS, n: number): string => SHOP_BLURBS[key][Math.abs(n) % SHOP_BLURBS[key].length];

/** Final shop price: base x Budget Cuts (+20% per rank) x (1 - Gold Lanyard / Rate Card discounts). */
export function shopPrice(s: S, base: number): number {
  const bc = s.run.modifiers.budget_cuts ?? 0;
  return Math.max(1, Math.round(base * (1 + 0.2 * bc) * (1 - s.player.stats.shopDiscount)));
}

const lerpPrice = (key: string, t: number): number => { const p = PRICES[key]; return Math.round(p.min + (p.max - p.min) * t); };

function foodIcon(k: 'heal_biscuit' | 'heal_sandwich' | 'heal_firstaid'): HTMLCanvasElement | null {
  const img = pickupSprite(k).img;
  return img instanceof HTMLCanvasElement ? img : icon('hp');
}

// ---------------------------------------------------------------------------
// Canteen stock
function benefitItem(s: S, o: Offer): Item {
  const d = o.def;
  const tag = o.kind === 'upgrade' ? 'UPGRADE' : d.synergy ? 'SYNERGY' : 'BENEFIT';
  const parent = d.synergy ? `${DEPT_SHORT[d.synergy[0]]} + ${DEPT_SHORT[d.synergy[1]]}` : DEPT_SHORT[d.dept];
  const held = heldRarity(s.run, d.id);
  return { kind: 'benefit', name: d.name, icon: benefitIcon(d), rarity: o.rarity, tag, sold: false, offer: o, base: PRICES[['benefit_standard', 'benefit_enhanced', 'benefit_executive'][o.rarity]].min,
    desc: `${RARITY_LABEL[o.rarity]} ${parent}${held >= 0 ? ' upgrade' : ''}: ${d.desc[o.rarity]}` };
}

function genCanteen(s: S, n: number): Item[] {
  const run = s.run;
  const rng = Rng.from(run.seed, s.plan.floor_number, s.plan.wing, 'canteen', n);
  const items: Item[] = [];
  const offer = rollOffers(s, { dept: null, count: 1, rng })[0];
  if (offer) items.push(benefitItem(s, offer));
  const taken: string[] = [];
  const nDesk = rng.chance(0.5) ? 2 : 1;
  for (let i = 0; i < nDesk; i++) {
    const d = rollDeskItem(s, rng, taken);
    if (!d) break;
    taken.push(d.id);
    items.push({ kind: 'desk', name: d.name, desc: d.desc, icon: deskItemIcon(d.id), rarity: d.tier, tag: 'DESK', sold: false, desk: d, base: deskTierPrice(d.tier, PRICES.desk_item.min, PRICES.desk_item.max) });
  }
  const luck = s.player.stats.luck + 0.3 + (s.plan.act - 1) * 0.15;
  const wid = rollWeapon(rng, s.plan.act, luck);
  const wd = wdef(wid);
  items.push({
    kind: 'weapon', name: wd.name, icon: weaponIcon(wid), rarity: wd.rarity, tag: wd.cls === 'ranged' ? 'RANGED' : wd.cls === 'throwable' ? 'THROWN' : 'MELEE', sold: false,
    weapon: makeWeapon(wid, { durabilityMult: s.player.stats.durabilityMult, ammoMult: s.player.stats.ammoMult }),
    desc: wd.desc, base: lerpPrice('weapon', wd.rarity / 2),
  });
  // Budget Cuts: one fewer shop item per rank (second desk item goes first, then the weapon, then the rest)
  const cuts = run.modifiers.budget_cuts ?? 0;
  for (let c = 0; c < cuts && items.length > 1; c++) {
    const order: Kind[] = ['desk', 'weapon', 'desk', 'benefit'];
    for (const k of order) {
      const idx = items.map((x) => x.kind).lastIndexOf(k);
      if (idx >= 0) { items.splice(idx, 1); break; }
    }
  }
  items.push({ kind: 'heal', name: 'Full Heal', icon: icon('hp'), tag: 'HEAL', sold: false, desc: blurb('heal', n) + ' Restores your Wellbeing to maximum.', base: PRICES.full_heal.min });
  items.push({ kind: 'repair', name: 'Weapon Repair', icon: icon('durability'), tag: 'REPAIR', sold: false, desc: blurb('repair', n) + ' Melee durability and ranged ammunition.', base: PRICES.weapon_repair.min });
  items.push({ kind: 'reroll', name: 'Reroll Stock', icon: icon('gear'), tag: 'REROLL', sold: false, desc: blurb('reroll', n), base: PRICES.reroll_base.min });
  return items;
}

function freeRerolls(s: S): number {
  const b = s.run.benefits.find((x) => x.id === 'expense_account');
  return (b ? [1, 2, 3][b.rarity] : 0) + Number(s.run.flags.bonusRerolls ?? 0);
}

function rerollPrice(s: S, st: ShopState): number {
  if (st.free > 0) return 0;
  return shopPrice(s, PRICES.reroll_base.min + PRICES.reroll_step.min * st.paid);
}

function priceOfItem(s: S, st: ShopState, it: Item): number { return it.kind === 'reroll' ? rerollPrice(s, st) : shopPrice(s, it.base); }

function toProducts(s: S, st: ShopState): Product[] {
  return st.items.map((it) => ({
    name: it.kind === 'reroll' && st.free > 0 ? `${it.name} (free)` : it.name, desc: it.desc, icon: it.icon, tag: it.tag, rarity: it.rarity,
    price: priceOfItem(s, st, it), soldOut: it.sold,
  }));
}

function dropOld(s: S, old: WeaponInst | null): void {
  if (old) s.world.add(new Pickup({ kind: 'weapon', weapon: old, x: s.player.x, y: s.player.y + 6, vx: 30, vy: 20 }));
}

function revoked(s: S): boolean {
  if (ROLES[s.run.role].shops !== false) return false;
  notify({ title: 'Access denied', body: 'Your access badge has been revoked. The Canteen does not serve former employees.', kind: 'bad', icon: icon('lock') });
  s.world.floatText(s.player.x, s.player.y - 40, 'BADGE REVOKED', '#ff6a5a');
  return true;
}

function repairWeapons(s: S): boolean {
  let did = false;
  const m = s.run.loadout.melee, r = s.run.loadout.ranged;
  if (m && m.maxDur > 0 && m.dur < m.maxDur) { m.dur = m.maxDur; did = true; }
  if (r && r.maxAmmo > 0 && r.ammo < r.maxAmmo) { r.ammo = r.maxAmmo; did = true; }
  return did;
}

function creditTicker(s: S): string | undefined {
  const lim = creditLimit(s.run);
  return lim ? `   CREDIT APPROVED: UP TO £${lim} OF DEBT   *   DEBT IS REPAID FROM YOUR NEXT EARNINGS   *   ALL SALES FINAL   *   ` : undefined;
}

export function openCanteen(s: S): void {
  if (revoked(s)) return;
  const st = (s.data.cpShop ??= (() => { const f = freeRerolls(s); return { items: genCanteen(s, 0), rerolls: 0, paid: 0, free: f } as ShopState; })()) as ShopState;
  const page: IntranetPage = new IntranetPage({
    products: toProducts(s, st), cash: spendable(s.run), ticker: creditTicker(s),
    onBuy: (i) => {
      const it = st.items[i];
      if (!it || it.sold) return false;
      const p = s.player;
      const price = priceOfItem(s, st, it);
      // refuse purchases that would do nothing, before any money moves
      if (it.kind === 'heal' && p.hp >= p.maxHp - 0.5) { s.world.floatText(p.x, p.y - 40, 'ALREADY AT FULL WELLBEING', '#ffd34d'); return false; }
      if (it.kind === 'repair' && !(s.run.loadout.melee && s.run.loadout.melee.dur < s.run.loadout.melee.maxDur) && !(s.run.loadout.ranged && s.run.loadout.ranged.ammo < s.run.loadout.ranged.maxAmmo)) { s.world.floatText(p.x, p.y - 40, 'NOTHING TO REPAIR', '#ffd34d'); return false; }
      if (!spend(s, price, it.kind)) return false;
      switch (it.kind) {
        case 'benefit': addBenefit(s, it.offer!.def.id, it.offer!.rarity); it.sold = true; break;
        case 'desk': acquireDeskItem(s, it.desk!.id); it.sold = true; break;
        case 'weapon': dropOld(s, p.equip(it.weapon!)); it.sold = true; break;
        case 'heal': p.heal(p.maxHp, true); break;
        case 'repair': repairWeapons(s); break;
        case 'reroll': {
          if (st.free > 0) st.free--; else st.paid++;
          st.rerolls++;
          st.items = genCanteen(s, st.rerolls);
          break;
        }
      }
      page.setCash(spendable(s.run));
      page.setProducts(toProducts(s, st));
      return true;
    },
  });
  app.push(new UiScene(page, { transparent: true }));
}

FLOOR_SETUP.shop = (s) => {
  const c = findCentrepiece(s, ['canteen_counter'], 'shop');
  const w = s.world;
  w.interactables.push({
    x: c.x, y: c.y + 8, r: 34, priority: 1,
    label: 'Browse the Canteen',
    get sub() { return `Petty Cash: £${s.run.pettyCash}${s.run.debt ? ` (debt £${s.run.debt})` : ''}`; },
    enabled: () => true,
    onInteract: () => openCanteen(s),
  });
  s.hud.showBanner('THE CANTEEN', ROLES[s.run.role].shops === false ? 'Your access badge has been revoked.' : 'Please queue. There is no queue. Please queue anyway.', '#ffd34d', 3.2);
};

// ---------------------------------------------------------------------------
// Vending machines (spec 8.3): any vending prop in a normal room becomes a snack dispenser with one throwable.
const SNACKS: { name: string; heal: number; icon: 'heal_biscuit' | 'heal_sandwich' | 'heal_firstaid'; desc: string }[] = [
  { name: 'Custard Cream (single)', heal: 8, icon: 'heal_biscuit', desc: 'One biscuit. Heals 8. Expired in a way that does not matter.' },
  { name: 'Meal Deal Sandwich', heal: 16, icon: 'heal_sandwich', desc: 'Egg and something. Heals 16. Comes with a drink you did not ask for.' },
  { name: 'Mystery Flapjack', heal: 26, icon: 'heal_sandwich', desc: 'Dense, oaty, reassuring. Heals 26. Do not ask what is in it.' },
];

function genVending(s: S, prop: PropRT): Item[] {
  const rng = Rng.from(s.run.seed, s.plan.floor_number, s.plan.wing, 'vend', prop.def.id);
  const items: Item[] = SNACKS.map((sn, i) => ({
    kind: 'snack' as Kind, name: sn.name, desc: sn.desc, icon: foodIcon(sn.icon), tag: 'SNACK', sold: false, heal: sn.heal,
    base: lerpPrice('snack', i / (SNACKS.length - 1)),
  }));
  const wid = rollWeapon(rng, s.plan.act, 0, 'thrown');
  const wd = wdef(wid);
  items.push({ kind: 'throwable', name: wd.name, desc: wd.desc || 'Throwable. Slightly dented.', icon: weaponIcon(wid), rarity: wd.rarity, tag: 'THROWABLE', sold: false, weapon: makeWeapon(wid), base: lerpPrice('vending_throwable', wd.rarity / 2) });
  return items;
}

export function openVending(s: S, prop: PropRT): void {
  if (revoked(s)) return;
  const items: Item[] = (prop.data.vend ??= genVending(s, prop));
  const st: ShopState = { items, rerolls: 0, paid: 0, free: 0 };
  const line = VENDING_LINES[Math.abs(prop.def.id * 7 + s.plan.floor_number) % VENDING_LINES.length];
  const page: IntranetPage = new IntranetPage({
    products: toProducts(s, st), cash: spendable(s.run), ticker: `   ${line.toUpperCase()}   *   EXACT CHANGE ONLY   *   THE MACHINE KEEPS THE CHANGE   *   `, url: 'intranet://vending/selection',
    title: 'Vending Machine - Please Select',
    onBuy: (i) => {
      const it = items[i];
      if (!it || it.sold) return false;
      const p = s.player;
      if (it.kind === 'snack' && p.hp >= p.maxHp - 0.5) { s.world.floatText(p.x, p.y - 40, 'ALREADY AT FULL WELLBEING', '#ffd34d'); return false; }
      if (!spend(s, shopPrice(s, it.base), it.kind)) return false;
      if (it.kind === 'snack') { p.heal(it.heal ?? 8); it.sold = true; }
      else { dropOld(s, p.equip(it.weapon!)); it.sold = true; }
      page.setCash(spendable(s.run));
      page.setProducts(toProducts(s, st));
      return true;
    },
  });
  app.push(new UiScene(page, { transparent: true }));
}

floorInstallers.push((s) => {
  if (s.plan.floor_type === 'boss' || s.plan.floor_type === 'shop') return;
  for (const p of s.world.props) {
    if (p.gone || (p.def.kind !== 'vending_machine' && p.def.kind !== 'vending_snack')) continue;
    s.world.interactables.push({
      x: p.def.x, y: p.def.y + 8, r: 26, priority: 1,
      label: 'Use vending machine',
      get sub() { return `Snacks from £${shopPrice(s, PRICES.snack.min)}`; },
      enabled: () => p.state !== 'destroyed' && !p.gone,
      onInteract: () => openVending(s, p),
    });
  }
});

void (null as unknown as Rar);
