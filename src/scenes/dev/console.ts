// In-game debug console (spec 10.6): a dev-only overlay toggled with the `debug` input action (Backquote by default).
//
// Enabled when `import.meta.env.DEV` or the URL hash contains `debug` (e.g. `index.html#debug`); in a normal production build the key does
// nothing and the scene is never pushed. It is a transparent Scene pushed over gameplay, so the run is frozen while it is open (only the top
// scene updates), and it reads the bitmap font + `app.input.textInput` for typing. Type `help` for the command list.
//
//   spawn <archetype> [tier] [n]     give weapon <id>      give desk <id>      give benefit <id> [rarity]     give cash <n>
//   floor <n> [type]                 god                   seed                replay <seedcode>
//   heal   rage   kill   clear       fps                   help
import { app, Scene } from '../../core/app';
import { drawText, wrap, LINE_H } from '../../render/font';
import { touch } from '../../ui/touch';
import { codeToSeed, seedToCode } from '../../core/rng';
import { ARCHETYPES } from '../../data/ids';
import type { ArchetypeId, FloorType, Tier } from '../../data/ids';
import { WEAPONS } from '../../data/tables';
import { DESK_ITEMS } from '../../data/deskitems';
import { BENEFITS, BENEFIT_INFO } from '../../game/content-info';
import { makeWeapon } from '../../game/weapons';
import { makeEnemy } from '../../game/spawner';
import { Enemy } from '../../game/enemy';
import { newRun, planFloor } from '../../game/run';
import { acquireDeskItem } from '../../game/content/deskitems';
import { addBenefit } from '../../game/content/benefits';
import { GameplayScene } from '../gameplay';

/** Console is available in dev builds, or in any build opened with `#debug` in the URL. */
export function consoleEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try { return /(^|[#&])debug(&|=|$)/.test(location.hash); } catch { return false; }
}

type Kind = 'info' | 'ok' | 'err' | 'dim' | 'cmd';
const COL: Record<Kind, string> = { info: '#c8d4f0', ok: '#8af0a0', err: '#ff6a5a', dim: '#7f8aa0', cmd: '#ffd34d' };

// Persisted across open/close so history and output survive toggling.
const log: { text: string; kind: Kind }[] = [{ text: 'Company Policy debug console. Type "help".', kind: 'dim' }];
const history: string[] = [];
const state = { god: false };
let current: ConsoleScene | null = null;

const gp = (): GameplayScene | undefined => app.scenes.find((s) => s.name === 'gameplay') as GameplayScene | undefined;

type Out = (text: string, kind?: Kind) => void;
interface Cmd { usage: string; help: string; run(args: string[], out: Out): void }

/** Resolve `q` against ids: exact match, else unique prefix, else unique substring. */
function resolve(q: string, ids: readonly string[]): { id?: string; options: string[] } {
  q = q.toLowerCase();
  if (ids.includes(q)) return { id: q, options: [q] };
  let m = ids.filter((i) => i.startsWith(q));
  if (!m.length) m = ids.filter((i) => i.includes(q));
  return { id: m.length === 1 ? m[0] : undefined, options: m };
}
function pickId(kind: string, q: string | undefined, ids: readonly string[], out: Out): string | undefined {
  if (!q) { out(`Missing ${kind} id. Try: ${ids.slice(0, 8).join(', ')}...`, 'err'); return undefined; }
  const r = resolve(q, ids);
  if (r.id) return r.id;
  out(r.options.length ? `Ambiguous ${kind} "${q}": ${r.options.slice(0, 10).join(', ')}` : `Unknown ${kind} "${q}".`, 'err');
  return undefined;
}
const needRun = (out: Out): GameplayScene | undefined => { const s = gp(); if (!s) out('No run in progress.', 'err'); return s; };

const RARITIES = ['standard', 'enhanced', 'executive'];
const FLOOR_TYPES: FloorType[] = ['standard', 'elite', 'shop', 'treasure', 'event', 'challenge', 'boss', 'director'];

const COMMANDS: Record<string, Cmd> = {
  help: { usage: 'help', help: 'List the commands.', run(_a, out) { for (const [n, c] of Object.entries(COMMANDS)) out(`${c.usage}  -  ${c.help}`, 'info'); } },
  spawn: {
    usage: 'spawn <archetype> [tier] [n]', help: 'Spawn aware enemies near the player (tier 0-2).',
    run(a, out) {
      const s = needRun(out); if (!s) return;
      const id = pickId('archetype', a[0], ARCHETYPES, out) as ArchetypeId | undefined; if (!id) return;
      const tier = Math.max(0, Math.min(2, Math.floor(Number(a[1] ?? 0)) || 0)) as Tier;
      const n = Math.max(1, Math.min(30, Math.floor(Number(a[2] ?? 1)) || 1));
      const w = s.world, p = s.player;
      let made = 0;
      for (let i = 0; i < n; i++) {
        let x = p.x, y = p.y, ok = false;
        for (let k = 0; k < 40 && !ok; k++) {
          const ang = (i * 2.4 + k * 0.7) % (Math.PI * 2), d = 60 + (k % 5) * 14 + (i % 3) * 10;
          x = p.x + Math.cos(ang) * d; y = p.y + Math.sin(ang) * d * 0.7;
          ok = w.isWalkablePx(x, y);
        }
        if (!ok) { x = p.x + 30; y = p.y; }
        const room = w.roomAt(x, y);
        makeEnemy(s.spawn, { archetype: id, tier, roomId: room >= 0 ? room : Math.max(0, w.currentRoom) }, x, y, true);
        made++;
      }
      out(`Spawned ${made} x ${id} (tier ${tier}).`, 'ok');
    },
  },
  give: {
    usage: 'give weapon|desk|benefit|cash ...', help: 'give weapon <id> / desk <id> / benefit <id> [rarity] / cash <n>',
    run(a, out) {
      const s = needRun(out); if (!s) return;
      const what = (a[0] ?? '').toLowerCase();
      if (what === 'cash') {
        const n = Math.floor(Number(a[1])); if (!Number.isFinite(n)) { out('give cash <n>', 'err'); return; }
        s.run.pettyCash = Math.max(0, s.run.pettyCash + n); out(`Petty Cash: ${s.run.pettyCash}.`, 'ok');
      } else if (what === 'weapon') {
        const id = pickId('weapon', a[1], Object.keys(WEAPONS), out); if (!id) return;
        const p = s.player;
        p.equip(makeWeapon(id, { durabilityMult: p.stats.durabilityMult, ammoMult: p.stats.ammoMult }));
        out(`Equipped ${id}.`, 'ok');
      } else if (what === 'desk') {
        const id = pickId('desk item', a[1], DESK_ITEMS.map((d) => d.id), out); if (!id) return;
        const got = acquireDeskItem(s, id);
        out(got ? `Desk Item acquired: ${id}.` : `Already held: ${id}.`, got ? 'ok' : 'err');
      } else if (what === 'benefit') {
        const id = pickId('benefit', a[1], BENEFITS.map((b) => b.id), out); if (!id) return;
        let r = a[2] === undefined ? 0 : RARITIES.indexOf(a[2].toLowerCase());
        if (r < 0) r = Math.floor(Number(a[2]));
        if (!(r >= 0 && r <= 2)) { out('Rarity: 0-2 or standard / enhanced / executive.', 'err'); return; }
        addBenefit(s, id, r as 0 | 1 | 2);
        out(`Benefit added: ${BENEFIT_INFO(id)?.name ?? id} (${RARITIES[r]}).`, 'ok');
      } else out('give weapon <id> | desk <id> | benefit <id> [rarity] | cash <n>', 'err');
    },
  },
  floor: {
    usage: 'floor <n> [type]', help: 'Jump to floor n (1-20). Type: ' + FLOOR_TYPES.join('/'),
    run(a, out) {
      const s = needRun(out); if (!s) return;
      const n = Math.floor(Number(a[0]));
      if (!(n >= 1 && n <= 20)) { out('floor <n> (1-20) [type]', 'err'); return; }
      let type: FloorType = 'standard';
      if (a[1]) { const t = pickId('floor type', a[1], FLOOR_TYPES, out) as FloorType | undefined; if (!t) return; type = t; }
      s.persistPlayer();
      s.run.plan = planFloor(s.run, n, 0, { reward: 'weapon', type });
      s.run.floor = n;
      s.startFloor();
      out(`Floor ${n} (${s.plan.floor_type}).`, 'ok');
    },
  },
  god: { usage: 'god', help: 'Toggle invulnerability.', run(_a, out) { state.god = !state.god; out(`God mode ${state.god ? 'ON' : 'OFF'}.`, 'ok'); } },
  seed: {
    usage: 'seed', help: 'Print (and copy) the run seed.',
    run(_a, out) {
      const s = needRun(out); if (!s) return;
      const code = s.run.seedCode || seedToCode(s.run.seed);
      out(`Seed ${code} (${s.run.seed}) floor ${s.run.floor}.`, 'ok');
      try { void navigator.clipboard?.writeText(code); } catch { /* clipboard may be unavailable */ }
    },
  },
  replay: {
    usage: 'replay <seedcode>', help: 'Start a new run with that seed (same role + modifiers).',
    run(a, out) {
      const seed = a[0] ? codeToSeed(a[0]) : null;
      if (seed === null) { out('replay <seedcode>  (e.g. ABCD-EFGH)', 'err'); return; }
      const s = gp();
      const run = newRun({ seed, role: s?.run.role ?? 'office_worker', modifiers: s ? { ...s.run.modifiers } : undefined, seeded: true });
      out(`Replaying seed ${seedToCode(seed)}.`, 'ok');
      app.reset(new GameplayScene(run));
    },
  },
  heal: { usage: 'heal', help: 'Full HP and shield.', run(_a, out) { const s = needRun(out); if (!s) return; const p = s.player; p.hp = p.maxHp; p.shield = p.maxShield; out('Healed.', 'ok'); } },
  rage: { usage: 'rage', help: 'Fill the Rage meter and activate Rage.', run(_a, out) { const s = needRun(out); if (!s) return; const p = s.player; p.rage = 100; p.activateRage(); out('RAGE.', 'ok'); } },
  kill: {
    usage: 'kill', help: 'Kill every enemy on the floor.',
    run(_a, out) {
      const s = needRun(out); if (!s) return;
      let n = 0;
      for (const q of s.spawn.queues.q.values()) q.length = 0;
      for (const e of [...s.world.actors]) if (e instanceof Enemy && e.alive) { s.world.damage(e, { amount: 999999, type: 'crush', method: 'other', source: s.player, unavoidable: true }); n++; }
      out(`Killed ${n} enemies.`, 'ok');
    },
  },
  clear: {
    usage: 'clear', help: 'Clear the floor (kill everything, drop the queues, open the exits).',
    run(_a, out) {
      const s = needRun(out); if (!s) return;
      for (const q of s.spawn.queues.q.values()) q.length = 0;
      let n = 0;
      for (const e of [...s.world.actors]) if (e instanceof Enemy && e.alive) { s.world.damage(e, { amount: 999999, type: 'crush', method: 'other', source: s.player, unavoidable: true }); n++; }
      s.world.holdClear = false;
      out(`Floor clear requested (${n} enemies removed). Close the console to let the world update.`, 'ok');
    },
  },
  fps: { usage: 'fps', help: 'Toggle the FPS counter.', run(_a, out) { app.settings.showFps = !app.settings.showFps; out(`FPS counter ${app.settings.showFps ? 'ON' : 'OFF'} (now ${Math.round(app.fps)}).`, 'ok'); } },
};

function candidates(parts: string[]): string[] {
  if (parts.length <= 1) return Object.keys(COMMANDS);
  const c = parts[0].toLowerCase();
  if (c === 'spawn' && parts.length === 2) return ARCHETYPES;
  if (c === 'floor' && parts.length === 3) return FLOOR_TYPES;
  if (c === 'give') {
    if (parts.length === 2) return ['weapon', 'desk', 'benefit', 'cash'];
    const w = parts[1].toLowerCase();
    if (parts.length === 3) return w === 'weapon' ? Object.keys(WEAPONS) : w === 'desk' ? DESK_ITEMS.map((d) => d.id) : w === 'benefit' ? BENEFITS.map((b) => b.id) : [];
    if (parts.length === 4 && w === 'benefit') return RARITIES;
  }
  return [];
}

export function runCommand(line: string): void {
  const text = line.trim();
  if (!text) return;
  log.push({ text: '> ' + text, kind: 'cmd' });
  history.push(text); if (history.length > 50) history.shift();
  const parts = text.split(/\s+/);
  const cmd = COMMANDS[parts[0].toLowerCase()];
  const out: Out = (t, k = 'info') => { log.push({ text: t, kind: k }); if (log.length > 200) log.shift(); };
  if (!cmd) { out(`Unknown command "${parts[0]}". Type help.`, 'err'); return; }
  try { cmd.run(parts.slice(1), out); } catch (e) { out('Error: ' + (e as Error).message, 'err'); console.error(e); }
}

export class ConsoleScene implements Scene {
  name = 'console';
  transparent = true;
  private buf = '';
  private hist = -1;
  private t = 0;
  private prevMode: 'gameplay' | 'menu' = 'gameplay';
  /** Exposed for tests. */
  get text(): string { return this.buf; }

  enter(): void { this.prevMode = touch.mode; touch.setContext({ mode: 'menu' }); }
  exit(): void { touch.setContext({ mode: this.prevMode }); if (current === this) current = null; }

  update(dt: number): void {
    this.t += dt;
    const inp = app.input;
    for (const ch of inp.textInput) {
      if (ch === '\b') this.buf = this.buf.slice(0, -1);
      else if (ch !== '`' && ch !== '~' && this.buf.length < 120) this.buf += ch;
    }
    const k = inp.lastKey;
    if (k === 'Enter' || k === 'NumpadEnter') { const l = this.buf; this.buf = ''; this.hist = -1; runCommand(l); }
    else if (k === 'Escape') close();
    else if (k === 'ArrowUp' && history.length) { this.hist = this.hist < 0 ? history.length - 1 : Math.max(0, this.hist - 1); this.buf = history[this.hist]; }
    else if (k === 'ArrowDown' && this.hist >= 0) { this.hist++; if (this.hist >= history.length) { this.hist = -1; this.buf = ''; } else this.buf = history[this.hist]; }
    else if (k === 'Tab') this.complete();
  }

  private complete(): void {
    const trail = /\s$/.test(this.buf);
    const parts = this.buf.split(/\s+/).filter(Boolean);
    if (trail || !parts.length) parts.push('');
    const last = parts[parts.length - 1].toLowerCase();
    const m = candidates(parts).filter((c) => c.startsWith(last));
    if (!m.length) return;
    if (m.length === 1) { parts[parts.length - 1] = m[0]; this.buf = parts.join(' ') + ' '; return; }
    let common = m[0];
    for (const c of m) while (!c.startsWith(common)) common = common.slice(0, -1);
    parts[parts.length - 1] = common;
    this.buf = parts.join(' ');
    log.push({ text: m.slice(0, 14).join('  ') + (m.length > 14 ? ' ...' : ''), kind: 'dim' });
  }

  render(): void {
    const r = app.renderer, g = r.f;
    const h = Math.round(r.H * 0.5), y0 = r.H - h;
    g.fillStyle = 'rgba(5,8,16,0.9)'; g.fillRect(0, y0, r.W, h);
    g.fillStyle = '#ffd34d'; g.fillRect(0, y0, r.W, 1);
    const maxW = r.W - 12;
    const lines: { text: string; kind: Kind }[] = [];
    for (const l of log) for (const w of wrap(l.text, maxW, 1)) lines.push({ text: w, kind: l.kind });
    const rows = Math.floor((h - 18) / LINE_H);
    const view = lines.slice(-rows);
    view.forEach((l, i) => drawText(g, l.text, 6, y0 + 4 + i * LINE_H, { color: COL[l.kind], shadow: null }));
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, r.H - 14, r.W, 14);
    const cursor = Math.floor(this.t * 2.5) % 2 === 0 ? '_' : ' ';
    drawText(g, '> ' + this.buf + cursor, 6, r.H - 11, { color: '#ffffff', shadow: null });
    drawText(g, state.god ? 'GOD' : '', r.W - 6, r.H - 11, { color: '#ff6a5a', align: 'right', shadow: null });
  }
}

function open(): void {
  if (current || app.input?.capturing) return;
  current = new ConsoleScene();
  app.push(current);
}
function close(): void {
  const c = current;
  if (!c) return;
  current = null;
  app.remove(c);
}
/** Toggle the console (also exposed as window.__cpConsole for tests). */
export function toggleConsole(): void { if (!consoleEnabled()) return; if (current) close(); else open(); }

// God mode: re-armed every simulation step (the player object is recreated each floor).
function applyGod(): void {
  if (!state.god) return;
  const s = gp();
  const p = s?.player;
  if (!p || !p.alive) return;
  p.invuln = Math.max(p.invuln, 1);
  p.hp = p.maxHp;
  if (!(p as any).__godSaver) { (p as any).__godSaver = true; p.deathSavers.push(() => { if (!state.god) return false; p.hp = p.maxHp; return true; }); }
}

// Hook the debug key without touching core/app: wrap the fixed-step. Runs for every top scene so it works over gameplay, menus and the hub.
const baseStep = app.step.bind(app);
app.step = (): void => {
  baseStep();
  if (!consoleEnabled()) return;
  if (app.input?.pressed('debug')) toggleConsole();
  applyGod();
};

if (typeof window !== 'undefined' && consoleEnabled()) (window as any).__cpConsole = { toggle: toggleConsole, run: runCommand, state, log };
