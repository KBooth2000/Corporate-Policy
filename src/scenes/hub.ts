// The staff car park hub (spec 7.3): a small walkable pixel-art scene. Stations: Vending Machine (unlocks), Car Boot
// (role + loadout), Internal Announcements noticeboard (promoted roster), Dashboard (trophies + stats), Car Radio
// (soundtrack), the Daily Run board on the lobby wall, and the car itself = "Clock In" (run setup).
// Controller (stick + confirm + shoulder buttons), keyboard + mouse (WASD, click to walk) and touch (tap to walk) all work,
// and the CorpOS taskbar along the bottom lists every station for one-tap access.
import { app, Scene } from '../core/app';
import { audio, LoopHandle } from '../audio/audio';
import { fxRng } from '../core/rng';
import { Ctx, silhouette } from '../render/canvas';
import { drawText, measure, wrap } from '../render/font';
import { touch } from '../ui/touch';
import { Ui, drawHintBar } from '../ui/widgets';
import { C, box, ink, drawGlyph, drawPrompt, uiS, inRect, clamp, easeOutCubic, dim, RectL } from '../ui/style';
import { drawTaskbar, taskbarH, notify, updateNotifications, renderNotifications, PopupMenu, ConfirmDialog, drawBadge } from '../ui/corpos';
import { icon } from '../art/items';
import { bakeCharacter, rollLook, BakedCharacter } from '../art/characters';
import { Rng } from '../core/rng';
import { HUB_LINES } from '../data/text/ui';
import { SCENES } from '../game/registry';
import { profile, resetProfile } from '../game/profile';
import { SettingsScene } from './settings';
import { buildCarPark, paintDailyScreen, CarPark, Mood, Prop, StationDef, StationId } from '../game/meta/carpark';
import { VendingPanel } from '../game/meta/ui/vending';
import { BootPanel } from '../game/meta/ui/carboot';
import { NoticeboardPanel } from '../game/meta/ui/noticeboard';
import { DashboardPanel } from '../game/meta/ui/dashboard';
import { RadioPanel, radio, applyRadioVolume, restoreVolumes } from '../game/meta/ui/radio';
import { ClockInPanel, DailyPanel, LaunchFn } from '../game/meta/ui/clockin';
import { dailyInfo, describeModifiers, hasSuspend } from '../game/meta/runs';
import { checkFeatUnlocks, checkRoleUnlocks, syncRadioUnlocks } from '../game/meta/catalogue';
import { syncCosmetics } from '../game/meta/cosmetics';
import { meta } from '../game/meta/prefs';
import { MODIFIERS } from '../data/tables';

const SPEED = 82;

export interface HubOpts { open?: StationId; mood?: Mood }

/** Fades to black, then runs the callback (used when driving off into a run). */
export class FadeScene implements Scene {
  name = 'fade';
  transparent = true;
  private t = 0;
  private fired = false;
  constructor(private go: () => void, private dur = 0.55) {}
  enter(): void { audio.sfx('car_engine'); }
  update(dt: number): void { this.t += dt; if (this.t >= this.dur && !this.fired) { this.fired = true; this.go(); } }
  render(): void { const g = app.renderer.f; g.fillStyle = `rgba(0,0,0,${easeOutCubic(this.t / this.dur).toFixed(3)})`; g.fillRect(0, 0, app.renderer.W, app.renderer.H); }
}

interface Rain { x: number; y: number; v: number; l: number }

export class HubScene implements Scene {
  name = 'hub';
  private park!: CarPark;
  private parkKey = '';
  private baked!: BakedCharacter;
  private mood: Mood;
  private px = 0; private py = 0;
  private dir = 0;
  private walkT = 0; private moving = false;
  private target: { x: number; y: number } | null = null;
  private pending: StationId | null = null;
  private focusIdx = -1;
  private near: StationDef | null = null;
  private hover: StationDef | null = null;
  private t = 0;
  private ui = new Ui({ onBack: () => this.openMenu() });
  private thought = { text: '', t: 99 };
  private thoughtNext = 3;
  private rain: Rain[] = [];
  private rainLoop: LoopHandle | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private tbRects: RectL[] = []; private startRect: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private leaveShown = 0;
  private shownLeave = profile().annualLeave;
  private prevMode: 'gameplay' | 'menu' = 'menu';
  private stuck = 0;
  private prompt = 0;

  constructor(private opts: HubOpts = {}) {
    const m = meta();
    this.mood = opts.mood ?? (m.lastOutcome === 'win' ? 'dawn' : fxRng.chance(0.45) ? 'rain' : 'night');
    const rng = new Rng((profile().created ^ 0x51ed) >>> 0);
    try { this.baked = bakeCharacter(rollLook({ kind: 'player', role: profile().selectedRole, tier: 0 }, rng)); } catch (e) { console.warn(e); }
  }

  // ------------------------------------------------------------------ lifecycle
  enter(): void {
    this.prevMode = touch.mode;
    touch.attach(app.renderer.screen);
    touch.setContext({ mode: 'menu' });
    checkRoleUnlocks(true); checkFeatUnlocks(true); syncCosmetics(true); syncRadioUnlocks();
    meta().hubVisits++;
    this.ensurePark(true);
    this.px = this.park.spawn.x; this.py = this.park.spawn.y;
    this.dir = 2;
    if (radio.on) applyRadioVolume(); else audio.music.play('hub', 1.5);
    if (this.mood === 'rain') this.rainLoop = audio.loop('rain', { vol: 0.35 });
    const R = app.renderer;
    for (let i = 0; i < 110; i++) this.rain.push({ x: fxRng.range(0, R.W), y: fxRng.range(0, R.H), v: fxRng.range(150, 230), l: fxRng.int(4, 8) });
    this.say(fxRng.pick(HUB_LINES), 5);
    window.addEventListener('cp-back', this.onBack);
    if (this.opts.open) this.open(this.opts.open);
  }
  exit(): void { this.rainLoop?.stop(0.5); this.rainLoop = null; restoreVolumes(); window.removeEventListener('cp-back', this.onBack); touch.setContext({ mode: this.prevMode }); }
  private onBack = (): void => { if (app.top === this && !this.ui.modal) this.openMenu(); };
  resume(): void { touch.setContext({ mode: 'menu' }); this.ensurePark(true); this.refreshDailyScreen(); if (radio.on) applyRadioVolume(); }

  private say(text: string, dur = 5): void { this.thought = { text, t: -dur }; }

  private ensurePark(force = false): void {
    const r = app.renderer, p = profile();
    const key = `${r.W}x${r.H}|${this.mood}|${p.cosmetics.decor.join(',')}|${p.trophies.length}`;
    if (!force && key === this.parkKey) return;
    const old = this.park;
    this.parkKey = key;
    this.park = buildCarPark({ W: r.W, H: r.H, mood: this.mood, trophies: p.trophies.length, decor: p.cosmetics.decor, role: p.selectedRole });
    if (old) { this.px += this.park.ox - old.ox; this.py += this.park.oy - old.oy; }
    this.scratch = document.createElement('canvas'); this.scratch.width = r.W; this.scratch.height = r.H;
    this.refreshDailyScreen();
    this.tbRects = [];
  }

  private refreshDailyScreen(): void {
    const d = dailyInfo(), p = profile();
    const board = (p.localBoards['daily:' + d.key] ?? []).slice(0, 2);
    paintDailyScreen(this.park.dailyScreen, { date: d.key, code: d.code, mods: describeModifiers(d.modifiers).map((m) => m.name + ' ' + 'I'.repeat(m.rank)), scored: d.scoredAvailable, top: board.map((b) => ({ score: b.score, floor: b.floor })), assist: !!app.settings.assist.enabled });
    void MODIFIERS;
  }

  // ------------------------------------------------------------------ stations
  private launch: LaunchFn = (go) => app.push(new FadeScene(go));
  private afterPanel = (): void => { this.shownLeave = Math.min(this.shownLeave, profile().annualLeave); };

  private open(id: StationId): void {
    const done = this.afterPanel;
    switch (id) {
      case 'vending': app.push(new VendingPanel(done)); break;
      case 'carboot': app.push(new BootPanel(done)); break;
      case 'noticeboard': app.push(new NoticeboardPanel(done)); break;
      case 'dashboard': app.push(new DashboardPanel(done)); break;
      case 'radio': app.push(new RadioPanel(done)); break;
      case 'daily': app.push(new DailyPanel(this.launch, done)); break;
      case 'clockin': app.push(new ClockInPanel(this.launch, done)); break;
    }
  }

  /** Public so tests / the main menu can drive the hub. */
  openStation(id: StationId): void { this.open(id); }

  private stationById(id: StationId): StationDef { return this.park.stations.find((s) => s.id === id)!; }

  private openMenu(): void {
    const S = this.park.stations;
    const go = (id: StationId) => () => this.open(id);
    this.ui.openModal(new PopupMenu({
      title: 'Car Park Menu',
      items: [
        { label: 'Clock In (run setup)', glyph: 'clock', onPick: go('clockin') },
        { label: 'Daily Run board', glyph: 'calendar', onPick: go('daily') },
        { label: 'Vending Machine', glyph: 'cart', onPick: go('vending') },
        { label: 'Car Boot (role and loadout)', glyph: 'folder', onPick: go('carboot') },
        { label: 'Internal Announcements', glyph: 'mail', onPick: go('noticeboard') },
        { label: 'Dashboard', glyph: 'chart', onPick: go('dashboard') },
        { label: 'Car Radio', glyph: 'bell', onPick: go('radio') },
        { label: 'Control Panel', glyph: 'gear', onPick: () => app.push(new SettingsScene(() => app.pop(), { onResetProgress: () => { resetProfile(); app.reset(new HubScene()); } })) },
        { label: 'Log out (main menu)', glyph: 'power', onPick: () => this.ui.openModal(new ConfirmDialog({ title: 'Log out', message: 'Return to the CorpOS login screen? Your suspended shift, if any, stays saved.', confirmText: 'Log out', cancelText: 'Stay', onConfirm: () => { const mm = SCENES.mainMenu?.(); if (mm) app.reset(mm); } })) },
      ],
    }));
    void S;
  }

  // ------------------------------------------------------------------ update
  update(dt: number): void {
    this.t += dt;
    touch.update();
    updateNotifications(dt);
    this.ensurePark();
    this.shownLeave += (profile().annualLeave - this.shownLeave) * Math.min(1, dt * 6);
    this.thought.t += dt;
    if (this.thought.t > 0) this.thoughtNext -= dt;
    if (this.thoughtNext <= 0 && this.thought.t > 0) { this.say(fxRng.pick(HUB_LINES), 5); this.thoughtNext = fxRng.range(14, 24); }
    for (const r of this.rain) { r.y += r.v * dt; r.x -= r.v * 0.12 * dt; if (r.y > app.renderer.H) { r.y = -8; r.x = fxRng.range(0, app.renderer.W + 40); } }

    if (this.ui.modal) { this.ui.update(dt); return; }
    const i = app.input;
    const P = this.park;

    // ---- movement
    const mv = i.move();
    let vx = 0, vy = 0;
    if (Math.hypot(mv.x, mv.y) > 0.2) { vx = mv.x; vy = mv.y; this.target = null; this.pending = null; }
    else if (this.target) {
      const dx = this.target.x - this.px, dy = this.target.y - this.py, d = Math.hypot(dx, dy);
      if (d < 2.5) { this.target = null; if (this.pending) { const id = this.pending; this.pending = null; this.faceStation(id); this.open(id); } }
      else { vx = dx / d; vy = dy / d; }
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    this.moving = len > 0.05;
    const before = { x: this.px, y: this.py };
    if (this.moving) {
      this.walkT += dt;
      this.moveAxis(vx * SPEED * dt, 0); this.moveAxis(0, vy * SPEED * dt * 0.85);
      if (Math.abs(vx) > Math.abs(vy)) this.dir = vx > 0 ? 1 : 3; else this.dir = vy > 0 ? 0 : 2;
      if (Math.hypot(this.px - before.x, this.py - before.y) < 0.15 * dt * SPEED && this.target) this.stuck += dt; else this.stuck = 0;
      if (this.stuck > 0.45 && this.target) {
        // blocked on the way to a station: if we are close enough, just use it
        this.stuck = 0; const id = this.pending; this.target = null; this.pending = null;
        if (id) { const st = this.stationById(id); if (Math.hypot(st.x - this.px, st.y - this.py) < st.r + 26) { this.faceStation(id); this.open(id); return; } }
      }
    } else this.walkT = 0;

    // ---- nearest station
    this.near = null;
    let best = 1e9;
    for (const s of P.stations) { const d = Math.hypot(s.x - this.px, (s.y - this.py) * 1.3); if (d < s.r && d < best) { best = d; this.near = s; } }
    if (this.near) { this.focusIdx = P.stations.indexOf(this.near); this.prompt = Math.min(1, this.prompt + dt * 6); } else this.prompt = Math.max(0, this.prompt - dt * 6);

    // ---- mouse hover
    this.hover = null;
    if (i.device === 'kbm' && i.mouse.inside) for (const s of P.stations) if (inRect(s.box, i.mouse.x, i.mouse.y)) { this.hover = s; break; }

    // ---- clicks / taps
    for (const c of i.clicks) {
      if (c.button !== 0) continue;
      if (inRect(this.startRect, c.x, c.y)) { audio.sfx('ui_select'); this.openMenu(); return; }
      const ti = this.tbRects.findIndex((r) => inRect(r, c.x, c.y));
      if (ti >= 0) { this.goTo(P.stations[ti].id); continue; }
      if (c.y > app.renderer.H - taskbarH() - app.renderer.safe.b) continue;
      const st = P.stations.find((s) => inRect(s.box, c.x, c.y));
      if (st) { this.goTo(st.id); continue; }
      this.target = { x: clamp(c.x, P.walk.x, P.walk.x + P.walk.w), y: clamp(c.y, P.walk.y, P.walk.y + P.walk.h) };
      this.pending = null;
    }

    // ---- controller / keyboard shortcuts
    const pad = i.isPad();
    const next = pad ? i.pressed('tabR') : i.pressed('alt'), prev = i.pressed('tabL');
    if (next || prev) {
      const n = P.stations.length;
      const d = prev ? -1 : 1;
      this.focusIdx = ((this.focusIdx < 0 ? (d > 0 ? -1 : 0) : this.focusIdx) + d + n) % n;
      audio.sfx('ui_move');
      this.goTo(P.stations[this.focusIdx].id, false);
    }
    if (i.pressed('interact') || i.pressed('confirm')) {
      if (this.near) { audio.sfx('ui_select'); this.faceStation(this.near.id); this.open(this.near.id); }
      else if (this.focusIdx >= 0) this.goTo(P.stations[this.focusIdx].id);
    }
    if (i.pressed('pause') || i.pressed('back')) { audio.sfx('ui_select'); this.openMenu(); }
    void this.leaveShown;
  }

  private goTo(id: StationId, open = true): void {
    const st = this.stationById(id);
    this.target = { x: st.x, y: st.y };
    this.pending = open ? id : null;
    this.focusIdx = this.park.stations.indexOf(st);
    audio.sfx('ui_move');
  }

  private faceStation(id: StationId): void { const s = this.stationById(id); const dx = s.x - this.px, dy = s.y - this.py; this.dir = Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 1 : 3) : dy > 0 ? 0 : 2; }

  private blocked(x: number, y: number): boolean {
    const P = this.park;
    if (x < P.walk.x || x > P.walk.x + P.walk.w || y < P.walk.y || y > P.walk.y + P.walk.h) return true;
    const fx = x - 5, fy = y - 4, fw = 10, fh = 4;
    for (const s of P.solids) if (fx < s.x + s.w && fx + fw > s.x && fy < s.y + s.h && fy + fh > s.y) return true;
    return false;
  }

  private moveAxis(dx: number, dy: number): void {
    const nx = this.px + dx, ny = this.py + dy;
    if (!this.blocked(nx, ny)) { this.px = nx; this.py = ny; return; }
    // slide: try a nudge along the free axis so corners don't snag
    if (dx !== 0) for (const n of [-2, 2, -4, 4]) if (!this.blocked(nx, this.py + n * 0.5)) { this.px = nx; this.py += n * 0.25; return; }
    if (dy !== 0) for (const n of [-2, 2, -4, 4]) if (!this.blocked(this.px + n * 0.5, ny)) { this.py = ny; this.px += n * 0.25; return; }
  }

  // ------------------------------------------------------------------ render
  render(): void {
    const r = app.renderer, g = r.f, P = this.park;
    g.drawImage(P.bg, 0, 0);
    // interaction rings on the ground
    this.drawRings(g);
    // depth-sorted props + player
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const p of P.props) items.push({ y: p.y, draw: () => this.drawProp(g, p) });
    items.push({ y: this.py, draw: () => this.drawPlayer(g) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // darkness with a pool of light around the player
    this.drawDark(g);
    // emissive pass
    g.drawImage(P.emissive, 0, 0);
    for (const p of P.props) if (p.emissive) { const o = p.emOff ?? 1; g.drawImage(p.emissive, Math.round(p.x - p.ox - o), Math.round(p.y - p.oy - o)); }
    g.drawImage(P.glow, 0, 0);
    if (P.lamps.some((l) => l.flicker)) { const f = 0.5 + 0.5 * Math.sin(this.t * 31) * Math.sin(this.t * 7.3); g.globalAlpha = 0.18 * Math.max(0, f); g.globalCompositeOperation = 'lighter'; g.drawImage(P.glow, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    this.drawStationFx(g);
    // rain
    if (this.mood === 'rain') this.drawRain(g);
    if (this.mood === 'dawn') { g.fillStyle = 'rgba(255,170,120,0.07)'; g.fillRect(0, 0, r.W, r.H); }
    this.drawOverlay(g);
    this.ui.render(g);
    renderNotifications(g);
    this.ui.drawCursor(g);
  }

  private drawProp(g: Ctx, p: Prop): void {
    const x = Math.round(p.x - p.ox), y = Math.round(p.y - p.oy);
    if (p.shadow) { g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < p.shadow.ry; k++) { const w = Math.round(p.shadow.rx * Math.sqrt(1 - ((k + 0.5) / p.shadow.ry) ** 2)); g.fillRect(Math.round(p.x) - w, Math.round(p.y) - 2 + k, w * 2, 1); } }
    g.drawImage(p.canvas, x, y);
  }

  private drawPlayer(g: Ctx): void {
    const x = Math.round(this.px), y = Math.round(this.py);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 4, y + 1, 8, 1);
    this.baked?.draw(g, this.moving ? 'walk' : 'idle', this.dir, this.moving ? this.walkT : this.t, x, y);
  }

  private drawDark(g: Ctx): void {
    const P = this.park;
    if (!this.scratch) { g.drawImage(P.dark, 0, 0); return; }
    const s = this.scratch.getContext('2d')!;
    s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, this.scratch.width, this.scratch.height);
    s.drawImage(P.dark, 0, 0);
    s.globalCompositeOperation = 'destination-out';
    const L = P.playerLight;
    s.drawImage(L, Math.round(this.px - L.width / 2), Math.round(this.py - L.height / 2 - 10));
    g.drawImage(this.scratch, 0, 0);
  }

  private drawRings(g: Ctx): void {
    for (const s of this.park.stations) {
      const act = this.near === s, foc = this.park.stations[this.focusIdx] === s || this.hover === s;
      const a = act ? 1 : foc ? 0.85 : 0.4;
      const n = 20, rx = 12 + (act ? Math.sin(this.t * 6) * 1.5 : 0), ry = rx * 0.5;
      g.globalAlpha = a;
      for (let k = 0; k < n; k++) {
        if (!act && k % 2) continue;
        const ang = (k / n) * Math.PI * 2 + this.t * (act ? 1.6 : 0.5);
        g.fillStyle = act ? '#fff3c4' : '#ffd34d';
        g.fillRect(Math.round(s.x + Math.cos(ang) * rx), Math.round(s.y + Math.sin(ang) * ry), 2, 1);
      }
      g.globalAlpha = 1;
    }
  }

  private drawStationFx(g: Ctx): void {
    const P = this.park;
    // outline on the focused station's prop + floating icon markers
    for (const s of P.stations) {
      const act = this.near === s, foc = this.hover === s || P.stations[this.focusIdx] === s;
      const bob = Math.round(Math.sin(this.t * 3 + s.x) * 1.5);
      const ic = icon(s.icon);
      const mx = Math.round(s.x - 8), my = Math.round(s.y + (s.markerDy ?? -30) + bob);
      g.globalAlpha = act ? 1 : foc ? 0.95 : 0.55;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(mx - 1, my - 1, 18, 18);
      g.fillStyle = act ? '#ffd34d' : 'rgba(255,255,255,0.35)'; g.fillRect(mx - 2, my - 2, 20, 1); g.fillRect(mx - 2, my + 17, 20, 1); g.fillRect(mx - 2, my - 2, 1, 20); g.fillRect(mx + 17, my - 2, 1, 20);
      g.drawImage(ic, mx, my);
      g.globalAlpha = 1;
      if (act || foc) {
        const prop = P.props.find((p) => p.station === s.id);
        const pulse = 0.55 + 0.45 * Math.sin(this.t * 7);
        g.globalAlpha = pulse;
        if (prop) { const sil = silhouette(prop.canvas, '#fff3c4'); const x = Math.round(prop.x - prop.ox), y = Math.round(prop.y - prop.oy); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(sil, x + dx, y + dy); g.drawImage(prop.canvas, x, y); }
        else { const b = s.box, k = 3 + Math.round(Math.sin(this.t * 6)); g.fillStyle = '#fff3c4'; for (const [cx, cy, sx, sy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]) { g.fillRect(cx - (sx < 0 ? k + 1 : 0), cy - (sy < 0 ? 1 : 0), k + 1, 1); g.fillRect(cx - (sx < 0 ? 1 : 0), cy - (sy < 0 ? k + 1 : 0), 1, k + 1); } }
        g.globalAlpha = 1;
      }
    }
  }

  private drawRain(g: Ctx): void {
    g.fillStyle = 'rgba(170,200,255,0.5)';
    for (const r of this.rain) { g.fillRect(Math.round(r.x), Math.round(r.y), 1, r.l); }
    g.fillStyle = 'rgba(190,215,255,0.35)';
    const P = this.park;
    for (let k = 0; k < 14; k++) { const s = (this.t * 3 + k * 1.7) % 1; const x = P.walk.x + ((k * 97.3) % P.walk.w), y = P.walk.y + ((k * 53.1) % P.walk.h); if (s < 0.5) { const rr = Math.round(s * 8); g.fillRect(Math.round(x - rr), Math.round(y), rr * 2 + 1, 1); } }
  }

  private drawOverlay(g: Ctx): void {
    const r = app.renderer, s = uiS();
    const P = this.park;
    // ---- top-left: Annual Leave + KPI chips
    const x0 = r.safe.l + 6, y0 = r.safe.t + 6;
    const txt = Math.round(this.shownLeave) + ' d';
    const w1 = 22 + measure('ANNUAL LEAVE ', s) + measure(txt, s) + 10;
    box(g, x0, y0, w1, 14 + (s - 1) * 6, { face: 'rgba(0,0,0,0)', cham: 1, depth: 1 });
    g.fillStyle = 'rgba(8,12,22,0.82)'; g.fillRect(x0 + 1, y0 + 1, w1 - 2, 12 + (s - 1) * 6);
    g.drawImage(icon('leave'), x0 + 3, y0 + 1 + (s - 1) * 3);
    drawText(g, 'ANNUAL LEAVE', x0 + 22, y0 + 4 + (s - 1) * 3, { color: '#7fbf9a', scale: s, shadow: null });
    drawText(g, txt, x0 + w1 - 6, y0 + 4 + (s - 1) * 3, { color: C.gold, scale: s, align: 'right', shadow: null });
    const p = profile();
    if (p.prUnlocked) {
      const k = `KPI ${p.kpi}`;
      const w2 = measure(k, s) + 18;
      g.fillStyle = 'rgba(8,12,22,0.82)'; g.fillRect(x0 + w1 + 4, y0 + 1, w2, 12 + (s - 1) * 6);
      g.drawImage(icon('kpi'), x0 + w1 + 6, y0 + 1 + (s - 1) * 3);
      drawText(g, k, x0 + w1 + 24, y0 + 4 + (s - 1) * 3, { color: '#c8d4f0', scale: s, shadow: null });
    }
    // ---- top-right: daily availability
    const d = dailyInfo();
    const dt = d.scoredAvailable && !app.settings.assist.enabled ? 'DAILY: SCORED ATTEMPT READY' : 'DAILY: PRACTICE';
    const dw = measure(dt) + 22;
    const dx = r.W - r.safe.r - dw - 6;
    g.fillStyle = 'rgba(8,12,22,0.82)'; g.fillRect(dx, y0 + 1, dw, 12);
    g.drawImage(icon('daily'), dx + 2, y0 - 1, 16, 16);
    drawText(g, dt, dx + 19, y0 + 4, { color: d.scoredAvailable && !app.settings.assist.enabled ? '#7fff9c' : '#ffb04d', shadow: null });
    if (hasSuspend()) {
      const t2 = 'SHIFT SUSPENDED - CLOCK IN TO CONTINUE';
      const w3 = measure(t2) + 14;
      g.fillStyle = 'rgba(8,12,22,0.82)'; g.fillRect(dx + dw - w3, y0 + 15, w3, 12);
      drawText(g, t2, dx + dw - 7, y0 + 18, { color: '#8fd0ff', align: 'right', shadow: null });
    }
    if (app.settings.assist.enabled) {
      const t3 = 'WORKPLACE ADJUSTMENTS ON';
      const w3 = measure(t3) + 12;
      g.fillStyle = 'rgba(8,12,22,0.82)'; g.fillRect(dx + dw - w3, y0 + (hasSuspend() ? 29 : 15), w3, 12);
      drawText(g, t3, dx + dw - 6, y0 + (hasSuspend() ? 32 : 18), { color: '#ffb04d', align: 'right', shadow: null });
    }
    // ---- speech / thought bubble over the player
    if (this.thought.t < 0 || (this.thought.t >= 0 && this.thought.t < 0)) { /* handled below */ }
    const shown = this.thought.t < 0 ? Math.min(1, -this.thought.t > 0.4 ? 1 : (-this.thought.t) / 0.4) : 0;
    if (this.thought.t < 0 && shown > 0 && this.prompt < 0.2) this.drawBubble(g, this.thought.text, this.px, this.py - 52, shown);
    // ---- station prompt
    const st = this.near;
    if (st && this.prompt > 0) this.drawPrompt(g, st);
    else if (this.hover) this.drawLabel(g, this.hover, false);
    // ---- hints
    const dev = app.input.device;
    const hints = dev === 'touch' ? [{ text: 'Tap a station or the ground' }] : [{ key: dev === 'kbm' ? 'WASD' : 'L-Stick', text: 'Walk' }, { action: 'interact' as const, text: 'Use' }, { ...(dev === 'kbm' ? { action: 'alt' as const } : { action: 'tabR' as const }), text: 'Next station' }, { action: 'pause' as const, text: 'Menu' }];
    const tbH = taskbarH();
    drawHintBar(g, hints, r.safe.l, r.H - r.safe.b - tbH - 12, r.W - r.safe.l - r.safe.r, 'center', true);
    // ---- taskbar (every station one tap away)
    const labels: Record<StationId, { label: string; glyph: string }> = {
      clockin: { label: 'Clock In', glyph: 'clock' }, daily: { label: 'Daily', glyph: 'calendar' }, vending: { label: 'Vending', glyph: 'cart' }, carboot: { label: 'Boot', glyph: 'folder' },
      noticeboard: { label: 'Notices', glyph: 'mail' }, dashboard: { label: 'Dash', glyph: 'chart' }, radio: { label: 'Radio', glyph: 'bell' },
    };
    const rects = drawTaskbar(g, { startLabel: 'Menu', items: P.stations.map((s, i) => ({ label: labels[s.id].label, glyph: labels[s.id].glyph, active: i === this.focusIdx })), tray: radio.on ? ['bell'] : [] });
    this.tbRects = rects.items; this.startRect = rects.start;
    void ink; void drawGlyph; void dim; void drawBadge; void s;
  }

  private drawLabel(g: Ctx, st: StationDef, strong: boolean): void {
    const y = st.box.y - 14;
    const w = measure(st.name.toUpperCase()) + 14;
    const x = Math.round(st.box.x + st.box.w / 2 - w / 2);
    g.fillStyle = 'rgba(8,12,22,0.88)'; g.fillRect(x, y, w, 12);
    g.fillStyle = strong ? '#ffd34d' : '#8fa6c8'; g.fillRect(x, y + 12, w, 1);
    drawText(g, st.name.toUpperCase(), x + w / 2, y + 3, { color: '#fff', align: 'center', shadow: null });
  }

  private drawPrompt(g: Ctx, st: StationDef): void {
    const label = app.input.device === 'touch' ? 'Tap' : app.input.label('interact');
    const nameW = measure(st.name.toUpperCase());
    const hintW = measure(st.hint);
    const w = Math.max(nameW + 30, hintW + 14), h = 24;
    const x = Math.round((st.labelY !== undefined ? st.x : st.box.x + st.box.w / 2) - w / 2), y = Math.max(r_top(), st.labelY ?? st.box.y - h - 4);
    g.globalAlpha = this.prompt;
    g.fillStyle = 'rgba(8,12,22,0.92)'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffd34d'; g.fillRect(x, y + h, w, 1); g.fillRect(x, y, w, 1);
    drawPrompt(g, label, x + 4, y + 3, 1);
    drawText(g, st.name.toUpperCase(), x + 24, y + 4, { color: '#fff', shadow: null });
    drawText(g, st.hint, x + w / 2, y + 14, { color: '#9fb7c4', align: 'center', shadow: null });
    g.globalAlpha = 1;
    function r_top(): number { return app.renderer.safe.t + 22; }
  }

  private drawBubble(g: Ctx, text: string, cx: number, tipY: number, a: number): void {
    const lines = wrap(text, 150, 1);
    const w = Math.max(...lines.map((l) => measure(l))) + 14, h = lines.length * 10 + 8;
    const x = Math.round(clamp(cx - w / 2, 4, app.renderer.W - w - 4)), y = Math.round(tipY - h - 6);
    g.globalAlpha = a;
    box(g, x, y, w, h, { face: '#fffdf6', cham: 2, depth: 1 });
    lines.forEach((l, i) => drawText(g, l, x + 7, y + 5 + i * 10, { color: '#1a1a1e', shadow: null }));
    // thought tail: three shrinking bubbles
    g.fillStyle = '#14161f'; for (const [dx, dy, s] of [[cx - x < 8 ? 8 : Math.round(cx - x), h + 1, 3], [Math.round(cx - x) + 1, h + 5, 2]] as const) { g.fillRect(x + dx - 1, y + dy - 1, s + 2, s + 2); }
    g.fillStyle = '#fffdf6'; for (const [dx, dy, s] of [[cx - x < 8 ? 8 : Math.round(cx - x), h + 1, 3], [Math.round(cx - x) + 1, h + 5, 2]] as const) { g.fillRect(x + dx, y + dy, s, s); }
    g.globalAlpha = 1;
  }
}

SCENES.hub = () => new HubScene();
