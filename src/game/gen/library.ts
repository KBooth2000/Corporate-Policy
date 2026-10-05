// Template library index: expands every authored template into its orientations once at module load.
import type { ThemeId } from '../../data/ids';
import type { RoomKind } from '../world-types';
import { expandTemplate, Tpl, TemplateSrc } from './template';
import { SHARED } from './templates/shared';
import { ACT1 } from './templates/act1';
import { ACT2 } from './templates/act2';
import { ACT3 } from './templates/act3';
import { ACT4 } from './templates/act4';

export const AUTHORED: TemplateSrc[] = [...SHARED, ...ACT1, ...ACT2, ...ACT3, ...ACT4];

/** Execution objects a room kind must keep in every orientation (spec 4.7). */
const REQUIRED: Partial<Record<RoomKind, string[]>> = {
  kitchen: ['microwave'], toilets: ['hand_dryer'], server: ['server_rack'], print: ['photocopier', 'printer'],
  treasure: ['stationery_cupboard'],
};

function build(): Tpl[] {
  const ids = new Set<string>();
  const out: Tpl[] = [];
  for (const src of AUTHORED) {
    if (ids.has(src.id)) throw new Error('duplicate template id ' + src.id);
    ids.add(src.id);
    const req = REQUIRED[src.kind];
    for (const t of expandTemplate(src)) {
      if (req && !t.props.some((p) => req.includes(p.kind))) continue;
      out.push(t);
    }
  }
  return out;
}

export const TEMPLATES: Tpl[] = build();

const byKey = new Map<string, Tpl[]>();
for (const t of TEMPLATES) {
  const k = `${t.kind}:${t.cw}x${t.ch}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k)!.push(t);
}

/** Templates of a kind and cell size usable for a theme (department templates + shared pool). */
export function templatesFor(kind: RoomKind, cw: number, ch: number, theme: ThemeId): Tpl[] {
  const all = byKey.get(`${kind}:${cw}x${ch}`) ?? [];
  return all.filter((t) => !t.themes || t.themes.includes(theme));
}

/** Cell shapes available for a kind (any theme). */
export function shapesFor(kind: RoomKind, theme: ThemeId): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const t of TEMPLATES) {
    if (t.kind !== kind || (t.themes && !t.themes.includes(theme))) continue;
    const k = t.cw + 'x' + t.ch;
    if (!seen.has(k)) { seen.add(k); out.push([t.cw, t.ch]); }
  }
  return out;
}

/** Library statistics for reports/soak. */
export function libraryStats(): { authored: number; orientations: number; perTheme: Record<string, number>; shared: number } {
  const perTheme: Record<string, number> = {};
  let shared = 0;
  for (const s of AUTHORED) {
    if (!s.themes) { shared++; continue; }
    for (const th of s.themes) perTheme[th] = (perTheme[th] ?? 0) + 1;
  }
  return { authored: AUTHORED.length, orientations: TEMPLATES.length, perTheme, shared };
}
