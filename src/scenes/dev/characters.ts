// Visual QA for the procedural character system.
//   #dev=chars                       grid: 20 archetypes × tiers 0/1/2, players, NPCs, promotion, intern variety
//        &anim=walk&dir=1            force an anim / direction (default cycles idle/walk and all 4 dirs)
//        &act=4                      force the indoctrination act on every enemy
//        &seed=123                   change the roll seed
//   #dev=chars-anims                 6 characters, every anim in all 4 directions (cycles, labelled)
//        &anim=death2                pin one anim; &hand=1 shows the weapon hand marker + a dummy weapon
//   #dev=chars-anims&sheet=intern    frame sheet of one archetype/role (&dir=0..3, &page=0|1, &tier=, &act=)
import { app, Scene } from '../../core/app';
import { registerDev } from './registry';
import { Rng } from '../../core/rng';
import { ARCHETYPES, ArchetypeId, PlayerRoleId, Tier } from '../../data/ids';
import { rollLook, bakeCharacter, ANIMS, AnimName, BakedCharacter, CharacterLook, drawPortraitLarge } from '../../art/characters';
import { withAct, lastBakeStats, bakeCharacterEx, PREWARM_ORDER } from '../../art/chars';
import { drawText } from '../../render/font';
import { rect } from '../../render/canvas';

const ROLES: PlayerRoleId[] = ['office_worker', 'temp', 'night_cleaner', 'contractor', 'ex_employee'];
const ABBR: Record<ArchetypeId, string> = {
  intern: 'INTN', receptionist: 'RECP', caretaker: 'CARE', it_tech: 'IT', fire_warden: 'FIRE',
  sales_rep: 'SALE', marketing_exec: 'MKTG', call_centre: 'CALL', team_leader: 'TEAM', employee_of_month: 'EOTM',
  accountant: 'ACCT', lawyer: 'LAWY', compliance_officer: 'COMP', procurement_buyer: 'PROC', auditor: 'AUDT',
  hr_partner: 'HRBP', svp: 'SVP', exec_assistant: 'EA', consultant: 'CONS', culture_champion: 'CULT',
};

function params(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) { const [k, v] = part.split('='); if (k) out[k] = v ?? ''; }
  return out;
}

const bakeTimes: number[] = [];
function bake(look: CharacterLook): BakedCharacter {
  const t0 = performance.now();
  const b = bakeCharacter(look);
  const dt = performance.now() - t0;
  if (dt > 0.5) bakeTimes.push(dt);
  return b;
}

function bg(): void {
  const r = app.renderer, g = r.f;
  rect(g, 0, 0, r.W, r.H, '#8d826c');
  // office carpet tiles
  for (let y = 0; y < r.H; y += 16) for (let x = 0; x < r.W; x += 16) if (((x + y) >> 4) % 2 === 0) rect(g, x, y, 16, 16, '#958a73');
}

interface Cell { b: BakedCharacter; x: number; y: number; label?: string; phase: number }

class CharsScene implements Scene {
  name = 'chars';
  cells: Cell[] = [];
  t = 0;
  p = params();
  enter(): void {
    const seed = Number(this.p.seed ?? 7);
    const rng = new Rng(seed);
    const act = this.p.act ? (Number(this.p.act) as 1 | 2 | 3 | 4) : 0;
    const fix = (l: CharacterLook) => (act && l.kind === 'enemy' ? withAct(l, act) : l);
    const W = 32;
    for (let tier = 0 as Tier; tier <= 2; tier = (tier + 1) as Tier) {
      ARCHETYPES.forEach((a, i) => {
        const look = fix(rollLook({ kind: 'enemy', archetype: a, tier }, rng));
        this.cells.push({ b: bake(look), x: 16 + i * W, y: 58 + tier * 54, label: tier === 0 ? ABBR[a] : undefined, phase: i * 0.13 });
      });
    }
    // players, npcs, promotion ranks, re-onboarded
    let col = 0;
    for (const role of ROLES) { this.cells.push({ b: bake(rollLook({ kind: 'player', role }, rng)), x: 16 + col * W, y: 228, label: role.slice(0, 4).toUpperCase(), phase: col * 0.1 }); col++; }
    for (let k = 0; k < 4; k++) { this.cells.push({ b: bake(rollLook({ kind: 'npc', archetype: k % 2 ? 'accountant' : undefined }, rng)), x: 16 + col * W, y: 228, label: 'NPC', phase: col * 0.1 }); col++; }
    for (let rank = 1; rank <= 4; rank++) {
      const l = rollLook({ kind: 'enemy', archetype: (['sales_rep', 'lawyer', 'team_leader', 'svp'] as ArchetypeId[])[rank - 1], tier: 1 }, rng);
      l.promotedRank = rank;
      this.cells.push({ b: bake(fix(l)), x: 16 + col * W, y: 228, label: 'PR' + rank, phase: col * 0.1 }); col++;
    }
    { const l = rollLook({ kind: 'enemy', archetype: 'intern', tier: 0 }, rng); l.reonboarded = true; this.cells.push({ b: bake(l), x: 16 + col * W, y: 228, label: 'RE', phase: 0 }); col++; }
    for (let a = 1; a <= 4; a++) { const l = withAct(rollLook({ kind: 'enemy', archetype: 'accountant', tier: 0 }, rng), a as 1 | 2 | 3 | 4); this.cells.push({ b: bake(l), x: 16 + col * W, y: 228, label: 'A' + a, phase: 0 }); col++; }
    // intern variety row
    for (let i = 0; i < 20; i++) this.cells.push({ b: bake(fix(rollLook({ kind: 'enemy', archetype: 'intern', tier: 0 }, rng))), x: 16 + i * W, y: 290, phase: i * 0.21 });
    // a few large portraits
    this.portraits = [0, 21, 45].map((i) => drawPortraitLarge(this.cells[i].b.look, 64));
    console.log('[chars] bake ms: avg', (bakeTimes.reduce((s, v) => s + v, 0) / bakeTimes.length).toFixed(2), 'max', Math.max(...bakeTimes).toFixed(2), 'n', bakeTimes.length, lastBakeStats);
  }
  portraits: HTMLCanvasElement[] = [];
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = app.renderer, g = r.f;
    bg();
    const forced = this.p.anim as AnimName | undefined;
    const anim: AnimName = forced && ANIMS.includes(forced) ? forced : Math.floor(this.t / 2) % 2 ? 'walk' : 'idle';
    const dir = this.p.dir !== undefined ? Number(this.p.dir) : Math.floor(this.t / 4) % 4;
    const T = this.p.t !== undefined ? Number(this.p.t) : this.t;
    for (const c of this.cells) {
      c.b.draw(g, anim, dir, T + c.phase, c.x, c.y);
      if (c.label) drawText(g, c.label, c.x, c.y + 3, { color: '#f2f2ee', align: 'center', shadow: '#0d0e14' });
    }
    drawText(g, 'JUNIOR', 2, 8, { color: '#ffd34d' }); drawText(g, 'SENIOR / LEAD rows below', 40, 8, { color: '#e6e3dc' });
    const avg = bakeTimes.length ? bakeTimes.reduce((s, v) => s + v, 0) / bakeTimes.length : 0;
    drawText(g, `bake avg ${avg.toFixed(1)}ms max ${bakeTimes.length ? Math.max(...bakeTimes).toFixed(1) : 0}ms  n=${bakeTimes.length}  frames ${lastBakeStats.unique}/${lastBakeStats.frames}  atlas ${lastBakeStats.atlasW}x${lastBakeStats.atlasH}`, 4, r.H - 10, { color: '#ffffff', shadow: '#0d0e14' });
    void this.portraits;
  }
}

class AnimsScene implements Scene {
  name = 'chars-anims';
  chars: BakedCharacter[] = [];
  labels: string[] = [];
  t = 0;
  p = params();
  sheet: BakedCharacter | null = null;
  benchText = '';
  enter(): void {
    const rng = new Rng(Number(this.p.seed ?? 3) + (this.p.sheet ? this.p.sheet.length * 7919 : 0));
    if (this.p.bench) {
      // bake many distinct individuals and report the average (after JIT warm-up)
      const looks: CharacterLook[] = [];
      for (let i = 0; i < 80; i++) looks.push(rollLook({ kind: 'enemy', archetype: ARCHETYPES[i % 20], tier: (i % 3) as Tier }, rng));
      for (let i = 0; i < 20; i++) bakeCharacterEx(looks[i]).bakeAnims(ANIMS);
      const inits: number[] = [], fulls: number[] = [];
      const per: Record<string, number[]> = {};
      for (let i = 20; i < 80; i++) {
        const t0 = performance.now();
        const b = bakeCharacterEx(looks[i]);
        const t1 = performance.now();
        for (const a of PREWARM_ORDER) { const ta = performance.now(); b.bakeAnims([a]); (per[a] ??= []).push(performance.now() - ta); }
        void b.portrait; void b.gibs;
        inits.push(t1 - t0); fulls.push(performance.now() - t0);
      }
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
      const perTxt = Object.entries(per).map(([a, v]) => `${a} ${med(v).toFixed(2)}`).join(', ');
      const maxAnim = Math.max(...Object.values(per).map(med));
      this.benchText = `initial bake (idle+walk+run) median ${med(inits).toFixed(2)}ms | per-anim median max ${maxAnim.toFixed(2)}ms | everything median ${med(fulls).toFixed(2)}ms`;
      console.log('[bench] per-anim ms: ' + perTxt);
      console.log('[bench]', this.benchText);
      return;
    }
    if (this.p.sheet) {
      const id = this.p.sheet;
      const tier = Number(this.p.tier ?? 0) as Tier;
      let look: CharacterLook;
      if ((ROLES as string[]).includes(id)) look = rollLook({ kind: 'player', role: id as PlayerRoleId }, rng);
      else look = rollLook({ kind: this.p.npc ? 'npc' : 'enemy', archetype: id as ArchetypeId, tier }, rng);
      if (this.p.act) look = withAct(look, Number(this.p.act) as 1 | 2 | 3 | 4);
      if (this.p.rank) look.promotedRank = Number(this.p.rank);
      this.sheet = bakeCharacterEx(look);
      console.log('[chars-anims] bake', JSON.stringify(lastBakeStats));
      return;
    }
    const mk = (l: CharacterLook, label: string) => { this.chars.push(bake(l)); this.labels.push(label); };
    mk(rollLook({ kind: 'player', role: 'office_worker' }, rng), 'PLAYER');
    mk(rollLook({ kind: 'enemy', archetype: 'intern', tier: 0 }, rng), 'INTERN T0');
    mk(rollLook({ kind: 'enemy', archetype: 'caretaker', tier: 1 }, rng), 'CARETAKER T1');
    mk(rollLook({ kind: 'enemy', archetype: 'compliance_officer', tier: 2 }, rng), 'COMPLIANCE T2');
    const svp = rollLook({ kind: 'enemy', archetype: 'svp', tier: 2 }, rng); svp.promotedRank = 4; mk(svp, 'SVP DIRECTOR');
    const hr = rollLook({ kind: 'enemy', archetype: 'hr_partner', tier: 0 }, rng); hr.reonboarded = true; mk(hr, 'HR RE-ONBOARDED');
  }
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = app.renderer, g = r.f;
    bg();
    if (this.benchText) { drawText(g, this.benchText, 4, 20, { color: '#ffffff' }); return; }
    if (this.sheet) { this.renderSheet(); return; }
    const forced = this.p.anim as AnimName | undefined;
    const slot = 2.4;
    const ai = forced && ANIMS.includes(forced) ? ANIMS.indexOf(forced) : Math.floor(this.t / slot) % ANIMS.length;
    const anim = ANIMS[ai];
    const lt = this.p.t !== undefined ? Number(this.p.t) : forced ? this.t : this.t % slot;
    drawText(g, `ANIM: ${anim}  (${ai + 1}/${ANIMS.length})`, r.W / 2, 4, { color: '#ffd34d', align: 'center' });
    const showHand = this.p.hand === '1';
    this.chars.forEach((b, i) => {
      const colX = i < 3 ? 0 : 320, rowY = 60 + (i % 3) * 104;
      drawText(g, this.labels[i], colX + 8, rowY - 46, { color: '#f2f2ee' });
      for (let dir = 0; dir < 4; dir++) {
        const x = colX + 50 + dir * 70, y = rowY + 20;
        const tt = LOOP(anim) ? lt : lt % (b.duration(anim) + 0.5);
        const h = b.hand(anim, dir, tt);
        if (showHand && h.behind) weapon(g, x + h.x, y + h.y, dir);
        b.draw(g, anim, dir, tt, x, y);
        if (showHand && !h.behind) weapon(g, x + h.x, y + h.y, dir);
        if (showHand) rect(g, x + h.x, y + h.y, 1, 1, '#00ff60');
      }
    });
  }
  renderSheet(): void {
    const r = app.renderer, g = r.f;
    const b = this.sheet!;
    const dir = Number(this.p.dir ?? 1);
    const page = Number(this.p.page ?? 0);
    const list = ANIMS.slice(page * 16, page * 16 + 16);
    const ex = b as unknown as { frameAt(a: AnimName, t: number): number };
    list.forEach((anim, k) => {
      const colX = k < 8 ? 0 : 322, rowY = 44 + (k % 8) * 43;
      drawText(g, anim, colX + 2, rowY - 30, { color: '#ffd34d' });
      // step through frames by sampling at the start of each frame
      let tt = 0;
      const seen = new Set<number>();
      let fi = 0;
      for (let s = 0; s < 40 && fi < 8; s++) {
        const f = ex.frameAt(anim, tt + 0.001);
        if (!seen.has(f)) {
          seen.add(f);
          const x = colX + 70 + fi * 36;
          const h = b.hand(anim, dir, tt + 0.001);
          if (this.p.hand === '1' && h.behind) weapon(g, x + h.x, rowY + 8 + h.y, dir);
          b.draw(g, anim, dir, tt + 0.001, x, rowY + 8);
          if (this.p.hand === '1' && !h.behind) weapon(g, x + h.x, rowY + 8 + h.y, dir);
          if (this.p.hand === '1') rect(g, x + h.x, rowY + 8 + h.y, 1, 1, '#00ff60');
          fi++;
        }
        tt += 0.02;
        if (tt > b.duration(anim)) break;
      }
    });
    const lp = drawPortraitLarge(b.look, 64);
    g.drawImage(lp, r.W - 70, r.H - 70);
    g.drawImage(b.portrait, r.W - 100, r.H - 30);
    b.gibs.forEach((c, i) => g.drawImage(c, r.W - 210 + i * 16, r.H - 24));
    drawText(g, `bake ${lastBakeStats.ms.toFixed(1)}ms frames ${lastBakeStats.unique}/${lastBakeStats.frames} h=${b.height}`, 4, r.H - 10, { color: '#ffffff' });
  }
}

function LOOP(a: AnimName): boolean { return ['idle', 'walk', 'run', 'grabbed', 'thrown', 'flee', 'chant', 'celebrate', 'sit', 'stagger', 'exec_hold', 'victim_shock', 'rage'].includes(a); }

function weapon(g: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  const ang = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][dir] ?? 0;
  for (let k = 0; k < 9; k++) rect(g, Math.round(x + Math.cos(ang) * k), Math.round(y + Math.sin(ang) * k), 1, 1, k < 2 ? '#3a2a1e' : '#c8ccd4');
}

registerDev('chars', () => new CharsScene());
registerDev('chars-anims', () => new AnimsScene());
