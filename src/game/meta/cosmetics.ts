// KPI rewards (spec 7.4): cosmetic outfits, player titles and hub decor. NEVER power.
// KPI points come from winning runs with Performance Review modifiers active (progression.ts).
import { profile, saveProfile } from '../profile';
import { notify } from '../../ui/corpos';

export type CosmeticKind = 'outfit' | 'title' | 'decor';
export interface CosmeticDef { id: string; kind: CosmeticKind; name: string; desc: string; kpi: number; colour: string }

/** Total KPI = sum over winning runs of (modifier ranks x KPI per rank). A fully stacked win is worth 29 KPI. */
export const COSMETICS: CosmeticDef[] = [
  { id: 'title_team_player', kind: 'title', name: 'Team Player', desc: 'Printed under your name on every review.', kpi: 3, colour: '#8fb8e8' },
  { id: 'decor_air_freshener', kind: 'decor', name: 'Pine-Scented Air Freshener', desc: 'Hangs from the rear-view mirror. Smells of a forest that never existed.', kpi: 5, colour: '#3fbf6a' },
  { id: 'outfit_hivis', kind: 'outfit', name: 'Hi-Vis Vest', desc: 'Nobody questions a person in hi-vis.', kpi: 8, colour: '#c8e83a' },
  { id: 'decor_fairy_lights', kind: 'decor', name: 'Fairy Lights', desc: 'Strung along the car. Fire-safety compliant, allegedly.', kpi: 12, colour: '#ffd34d' },
  { id: 'title_self_starter', kind: 'title', name: 'Self-Starter', desc: 'Needs no supervision. Resents supervision.', kpi: 16, colour: '#8fb8e8' },
  { id: 'outfit_pinstripe', kind: 'outfit', name: 'Pinstripe Suit', desc: 'Dress for the job you are about to take from someone.', kpi: 22, colour: '#5a6c90' },
  { id: 'decor_bobblehead', kind: 'decor', name: 'CEO Bobblehead', desc: 'Nods along to everything. Finally, a colleague who agrees.', kpi: 30, colour: '#d4a537' },
  { id: 'title_synergy', kind: 'title', name: 'Synergy Champion', desc: 'An award nobody can define.', kpi: 40, colour: '#8fb8e8' },
  { id: 'outfit_gold_lanyard', kind: 'outfit', name: 'Gold Lanyard Set', desc: 'Gold lanyard, gold cufflinks, gold standards.', kpi: 55, colour: '#f2d27a' },
  { id: 'decor_number_plate', kind: 'decor', name: 'Personalised Number Plate', desc: 'Reads "HR 0K". Subtle.', kpi: 70, colour: '#e8e6f0' },
  { id: 'title_thought_leader', kind: 'title', name: 'Thought Leader', desc: 'Has posted about it. Twice.', kpi: 90, colour: '#8fb8e8' },
  { id: 'outfit_executive', kind: 'outfit', name: 'Executive Wardrobe', desc: 'Tailored. Expensive. Mildly sinister.', kpi: 120, colour: '#a01828' },
  { id: 'decor_gold_trim', kind: 'decor', name: 'Gold Trim', desc: 'The car park equivalent of a corner office.', kpi: 150, colour: '#d4a537' },
  { id: 'title_ceo_material', kind: 'title', name: 'CEO Material', desc: 'Allegedly. Pending background check.', kpi: 200, colour: '#ffc53d' },
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function cosmeticOwned(id: string): boolean { return profile().unlocks.includes('cosmetic:' + id); }
export function ownedCosmetics(kind?: CosmeticKind): CosmeticDef[] { return COSMETICS.filter((c) => (!kind || c.kind === kind) && cosmeticOwned(c.id)); }
export function titleName(): string { const t = COSMETIC_BY_ID.get(profile().cosmetics.title); return t?.kind === 'title' ? t.name : ''; }
export function nextCosmetic(): CosmeticDef | null { const k = profile().kpi; return COSMETICS.find((c) => c.kpi > k) ?? null; }

/** Unlock everything the lifetime KPI total now covers. Returns the new ones. */
export function syncCosmetics(announce = true): CosmeticDef[] {
  const p = profile();
  const got: CosmeticDef[] = [];
  for (const c of COSMETICS) {
    if (c.kpi > p.kpi || cosmeticOwned(c.id)) continue;
    p.unlocks.push('cosmetic:' + c.id);
    if (c.kind === 'decor' && !p.cosmetics.decor.includes(c.id)) p.cosmetics.decor.push(c.id);
    if (c.kind === 'title' && !p.cosmetics.title) p.cosmetics.title = c.id;
    got.push(c);
    if (announce) notify({ kind: 'good', title: 'KPI reward: ' + c.name, body: `${c.kind === 'decor' ? 'Hub decor' : c.kind === 'title' ? 'Player title' : 'Outfit'} unlocked. Purely cosmetic.`, icon: 'star', sound: 'ui_unlock' });
  }
  if (got.length) saveProfile();
  return got;
}
