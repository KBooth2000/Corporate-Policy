// Benefits (spec 7.1): registry, unlock gating, offer rolls, the "Re: Your Benefits Package" email, and floor-hook installation.
// Definitions live in benefits-*.ts (written per department); this module registers them and wires them into the run.
import { registerBenefits, BENEFITS, BENEFIT_INFO, BenefitDef } from '../content-info';
import { STAT_MOD_PROVIDERS } from '../run';
import type { BenefitDept } from '../../data/ids';
import { BENEFIT_DEPTS } from '../../data/ids';
import { hasUnlock } from '../profile';
import { app } from '../../core/app';
import { UiScene, EmailView, notify } from '../../ui/corpos';
import type { EmailAttachment } from '../../ui/corpos';
import { icon, IconName } from '../../art/items';
import { paint } from '../../render/canvas';
import { logEvent } from '../run';
import { audio } from '../../audio/audio';
import { Rng } from '../../core/rng';
import { S, Rar, DEPT_NAMES, DEPT_SHORT, RARITY_LABEL, floorInstallers, trackInstall, disposers } from './common';
import { IT_BENEFITS, FACILITIES_BENEFITS } from './benefits-it-fac';
import { SALES_BENEFITS, MARKETING_BENEFITS } from './benefits-sales-mkt';
import { FINANCE_BENEFITS, LEGAL_BENEFITS, HR_BENEFITS, EXEC_BENEFITS } from './benefits-biz';
import { SYNERGIES, STRESS_MODS } from './benefits-synergy';

registerBenefits([...IT_BENEFITS, ...FACILITIES_BENEFITS, ...SALES_BENEFITS, ...MARKETING_BENEFITS, ...FINANCE_BENEFITS, ...LEGAL_BENEFITS, ...HR_BENEFITS, ...EXEC_BENEFITS, ...SYNERGIES, ...STRESS_MODS]);

export const isStress = (id: string): boolean => id.startsWith('stress_');
export const isUnlocked = (d: BenefitDef): boolean => !!d.starter || hasUnlock('benefit:' + d.id);

// ---------------------------------------------------------------------------
// Stats: everything the run holds feeds runStats()
STAT_MOD_PROVIDERS.push((run) => run.benefits.flatMap((b) => BENEFIT_INFO(b.id)?.mods?.(b.rarity, run) ?? []));

// ---------------------------------------------------------------------------
// Floor hooks: each held Benefit installs its behaviours into the fresh world every floor.

export function installBenefit(s: S, id: string, rarity: Rar): void {
  const def = BENEFIT_INFO(id);
  if (!def?.floor) return;
  const d = disposers(s);
  d['b:' + id]?.();
  d['b:' + id] = trackInstall(s, id, () => def.floor!(s, rarity));
}

floorInstallers.push((s) => {
  for (const b of s.run.benefits) {
    try { installBenefit(s, b.id, b.rarity); } catch (e) { console.error('[benefit] install failed', b.id, e); }
  }
});

/** Add a Benefit (or raise a held one to `rarity`) and make it live immediately. */
export function addBenefit(s: S, id: string, rarity: Rar): void {
  const run = s.run;
  const held = run.benefits.find((b) => b.id === id);
  if (held) held.rarity = Math.max(held.rarity, rarity) as Rar; else run.benefits.push({ id, rarity });
  s.player.refreshStats();
  (s.world as any).breachStunMult = s.player.stats.breachStun;
  installBenefit(s, id, (held ? held.rarity : rarity) as Rar);
  logEvent(run, 20, run.benefits.length);
}

// ---------------------------------------------------------------------------
// Offers
export function heldDepts(s: S): Set<BenefitDept> {
  const out = new Set<BenefitDept>();
  for (const b of s.run.benefits) {
    const d = BENEFIT_INFO(b.id);
    if (d && !d.synergy && !isStress(d.id)) out.add(d.dept);
  }
  return out;
}

export interface Offer { def: BenefitDef; rarity: Rar; kind: 'new' | 'upgrade'; }
export interface OfferOpts {
  dept: BenefitDept | null;
  count: number;
  pool?: 'benefit' | 'stress';
  /** Raise rolled rarity by this many tiers (elite floors). */
  boost?: number;
  /** Minimum rarity (boss rewards: Enhanced). */
  minRarity?: Rar;
  /** Exclude these ids (e.g. already shown in the same shop). */
  exclude?: string[];
  rng?: Rng;
}

export function rollRarity(s: S, rng: Rng, boost = 0, min: Rar = 0): Rar {
  const act = s.plan.act, luck = s.player.stats.luck;
  const w = [70, 25 + (act - 1) * 4, 5 + (act - 1) * 2];
  w[1] *= 1 + luck; w[2] *= 1 + luck * 2;
  const r = rng.weighted([0, 1, 2], (i) => w[i]);
  return Math.max(min, Math.min(2, r + boost)) as Rar;
}

export function rollOffers(s: S, o: OfferOpts): Offer[] {
  const rng = o.rng ?? s.floorRng.loot;
  const run = s.run;
  const stress = o.pool === 'stress';
  const held = new Map(run.benefits.map((b) => [b.id, b.rarity as number]));
  const depts = heldDepts(s);
  const excl = new Set(o.exclude ?? []);
  const base = BENEFITS.filter((d) => isUnlocked(d) && isStress(d.id) === stress && !excl.has(d.id) && (held.get(d.id) ?? -1) < 2);
  const eligible = (d: BenefitDef, dept: BenefitDept | null): boolean => {
    if (d.synergy) {
      if (stress) return false;
      if (!depts.has(d.synergy[0]) || !depts.has(d.synergy[1])) return false;
      return !dept || d.synergy.includes(dept);
    }
    return stress || !dept || d.dept === dept;
  };
  let cands = base.filter((d) => eligible(d, o.dept));
  const out: Offer[] = [];
  let synergyTaken = false;
  const take = (list: BenefitDef[]) => {
    const pickable = list.filter((d) => !out.some((x) => x.def.id === d.id) && !(d.synergy && synergyTaken));
    if (!pickable.length) return false;
    const d = rng.weighted(pickable, (x) => (held.has(x.id) ? 1.3 : 1) * (x.synergy ? 0.8 : 1));
    if (d.synergy) synergyTaken = true;
    const h = held.get(d.id);
    const min = Math.max(o.minRarity ?? 0, d.minRarity ?? 0) as Rar;
    const rarity: Rar = h !== undefined ? (Math.min(2, h + 1) as Rar) : rollRarity(s, rng, o.boost ?? 0, min);
    out.push({ def: d, rarity, kind: h !== undefined ? 'upgrade' : 'new' });
    return true;
  };
  while (out.length < o.count && take(cands)) { /* fill */ }
  if (out.length < o.count && !stress) {
    // dry department: top up from elsewhere so the email always carries a full set
    cands = base.filter((d) => !d.synergy && !excl.has(d.id));
    while (out.length < o.count && take(cands)) { /* fill */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Icons
const synIcons = new Map<string, HTMLCanvasElement>();
export function benefitIcon(def: BenefitDef): HTMLCanvasElement {
  if (isStress(def.id)) return icon('reward_rage');
  if (!def.synergy) return icon(('dept_' + def.dept) as IconName);
  let c = synIcons.get(def.id);
  if (!c) {
    const a = icon(('dept_' + def.synergy[0]) as IconName), b = icon(('dept_' + def.synergy[1]) as IconName);
    c = paint(16, 16, (g) => {
      g.drawImage(a, 0, 0);
      g.save(); g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 16); g.lineTo(0, 16); g.closePath(); g.clip();
      g.clearRect(0, 0, 16, 16); g.drawImage(b, 0, 0); g.restore();
    });
    synIcons.set(def.id, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// The email
const BODIES: Record<BenefitDept, string[]> = {
  it: [
    'Following your ticket (closed, unresolved), please find three attachments. Have you tried accepting one of them?',
    'We have reviewed your request for "something that works". Please choose one of the below. Do not forward.',
    'Your account has been upgraded. This was not requested. Please accept the upgrade to stop further upgrades.',
  ],
  facilities: [
    'Following the recent structural incidents, we are pleased to offer the following improvements. Please do not lean on them.',
    'Maintenance has approved three items from your requisition. Hard hats remain optional but advisable.',
    'Please find attached the available upgrades to your workspace. The ceiling tile situation is being monitored.',
  ],
  sales: [
    'Great news, champ! Smashing it. Pick ONE of these exclusive offers before the quarter closes (it closes in four minutes).',
    'Per my last voicemail: three opportunities, one winner. Let\'s circle back on yesterday. Always be closing.',
    'Hey team player, here are some incentives. They are not incentives for the team. They are for you. Do not tell the team.',
  ],
  marketing: [
    'We are thrilled to share three exciting new brand touchpoints. Please select the one that best aligns with your personal brand.',
    'Following the focus group (n=1), these assets have been shortlisted. Please engage responsibly.',
    'Here is the deck. It is not a deck. It is an email with three attachments. Please circle back with feedback by yesterday.',
  ],
  finance: [
    'Following the audit, three line items have been approved. Please do not ask where the money came from.',
    'Please find attached three offers. Receipts must be retained. Receipts must be retained. Receipts must be retained.',
    'Your benefits are subject to a 40 per cent administration fee, which has already been deducted. Choose wisely.',
  ],
  legal: [
    'Without prejudice and subject to contract, please select one of the below. By opening this email you have already agreed.',
    'Pursuant to clause 14(b), you are entitled to one (1) of the attached. This email is privileged. So are you, briefly.',
    'Kindly review the attached terms. Failure to review will be deemed acceptance. So will reviewing.',
  ],
  hr: [
    'We value you as a human resource. Please select the wellbeing offer that best supports your continued attendance.',
    'As part of our commitment to your wellbeing, here are three benefits. Please complete the mandatory feedback survey afterwards.',
    'This is a friendly reminder that you are a person. Please choose one of the below and return to productivity promptly.',
  ],
  executive: [
    'The Board has noted your contribution. Please select one of the following forms of recognition. Gratitude is not a form of recognition.',
    'From the desk of the Chief Executive: three perks, one choice. The other two have been allocated to someone more strategic.',
    'Your performance has been seen. The following is by way of acknowledgement. Please do not reply to this email.',
  ],
};
const STRESS_BODIES = [
  'Your stress levels have been noted and, following review, monetised. Please select one of the following modifications to your anger.',
  'Occupational Health has completed your assessment. The results are concerning only to management. Choose one adjustment.',
  'We have identified three ways to make you more upset, more effectively. Please select the one that best fits your wellbeing journey.',
];

export interface EmailOpts {
  dept: BenefitDept | null;
  pool?: 'benefit' | 'stress';
  subject?: string;
  from?: string;
  body?: string;
  count?: number;
  boost?: number;
  minRarity?: Rar;
  title?: string;
  onPicked?: (offer: Offer) => void;
  /** Called if no offers could be built at all. */
  onEmpty?: () => void;
}

/** Open the choice email and pause the run until one attachment is accepted. Returns false if there was nothing to offer. */
export function openBenefitEmail(s: S, o: EmailOpts): boolean {
  const stress = o.pool === 'stress';
  const dept = o.dept ?? (stress ? 'executive' : BENEFIT_DEPTS[s.floorRng.loot.int(0, BENEFIT_DEPTS.length - 1)]);
  const count = o.count ?? (s.run.deskItems.includes('rubber_duck') ? 4 : 3);
  const offers = rollOffers(s, { dept: o.dept ?? (stress ? null : dept), count, pool: o.pool, boost: o.boost, minRarity: o.minRarity });
  if (!offers.length) { o.onEmpty?.(); return false; }
  const attachments: EmailAttachment[] = offers.map((of) => {
    const d = of.def;
    const parent = d.synergy ? `Synergy: ${DEPT_SHORT[d.synergy[0]]} + ${DEPT_SHORT[d.synergy[1]]}` : stress ? 'Stress Modifier' : `${DEPT_SHORT[d.dept]} Benefit`;
    const held = s.run.benefits.find((b) => b.id === d.id);
    return {
      icon: benefitIcon(d), title: d.name,
      subtitle: of.kind === 'upgrade' ? `${parent} - upgrade from ${RARITY_LABEL[held!.rarity]}` : parent,
      desc: d.desc[of.rarity], rarity: of.rarity,
      tag: of.kind === 'upgrade' ? 'UPGRADE' : d.synergy ? 'SYNERGY' : undefined,
    };
  });
  const rng = s.floorRng.cosmetic;
  const lines = stress ? STRESS_BODIES : BODIES[dept];
  const email = new EmailView({
    from: o.from ?? (stress ? 'Occupational Health <anger.management@corp.example>' : `${DEPT_NAMES[dept]} <${dept}@corp.example>`),
    subject: o.subject ?? (stress ? 'Re: Your Stress Modifier' : 'Re: Your Benefits Package'),
    body: o.body ?? rng.pick(lines),
    attachments, allowSkip: false,
    onPick: (i) => {
      const of = offers[i];
      addBenefit(s, of.def.id, of.rarity);
      audio.sfx('ui_purchase');
      notify({
        title: of.kind === 'upgrade' ? 'Benefit upgraded' : stress ? 'Stress Modifier accepted' : 'Benefit accepted',
        body: `${of.def.name} (${RARITY_LABEL[of.rarity]}) is now active.`, icon: benefitIcon(of.def), kind: 'good', duration: 6, sound: false,
      });
      o.onPicked?.(of);
    },
  });
  app.push(new UiScene(email, { transparent: true }));
  return true;
}

export { BENEFITS, BENEFIT_INFO };
