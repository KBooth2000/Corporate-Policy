// Event floors (spec 3.4): a narrative or gamble encounter in the corridor. A centrepiece (the fortune copier) opens a CorpOS
// dialog for one of the written EVENTS; options show their costs and apply EventEffect outcomes.
import { FLOOR_SETUP } from '../registry';
import { app } from '../../core/app';
import { audio } from '../../audio/audio';
import { EVENTS, GameEvent, EventOption, EventEffect } from '../../data/text/events';
import { hasUnlock, profile } from '../profile';
import { ARCHETYPE_DEFS } from '../../data/tables';
import { ARCHETYPES } from '../../data/ids';
import { UiScene, notify, drawWindow, popRect, OpenAnim, titleBarH } from '../../ui/corpos';
import type { UiComponent } from '../../ui/corpos';
import { Ui, Button, btnH } from '../../ui/widgets';
import { C, ink, dim, uiS, box, RectL } from '../../ui/style';
import { wrap, LINE_H } from '../../render/font';
import type { Ctx } from '../../render/canvas';
import { icon, deskItemIcon } from '../../art/items';
import { makeEnemy, tierFor } from '../spawner';
import { Pickup } from '../pickups';
import { S, findCentrepiece, earn } from './common';
import { openBenefitEmail } from './benefits';
import { rollDeskItem, acquireDeskItem } from './deskitems';
import { rollRewardWeapon } from './rewards';

/** Events available from the first run; the rest need profile unlock `event:<id>` (hub vending machine). */
export const STARTER_EVENTS = new Set([
  'photocopier_fortune', 'team_building_trust_fall', 'leaving_do_cake', 'mandatory_fun_raffle', 'suggestion_box', 'secret_santa', 'wellness_pod',
  'lost_property', 'stationery_amnesty', 'vending_machine_jam', 'coffee_descaling', 'birthday_celebration', 'unattended_laptop', 'bring_dog_to_work',
]);
export const eventUnlocked = (e: GameEvent): boolean => STARTER_EVENTS.has(e.id) || hasUnlock('event:' + e.id);

export function pickEvent(s: S): GameEvent {
  const pool = EVENTS.filter(eventUnlocked);
  return s.floorRng.events.pick(pool.length ? pool : EVENTS);
}

// ---------------------------------------------------------------------------
// Effects
interface Outcome { lines: string[]; good: boolean | null; after?: () => void; }

const hpPct = (s: S, f: number): number => Math.round(s.player.maxHp * f);

function loseHp(s: S, amt: number): number {
  const p = s.player;
  const lost = Math.max(0, Math.min(Math.round(amt), Math.floor(p.hp) - 1));
  p.hp -= lost;
  if (lost > 0) { p.hurtAnim = 0.2; audio.sfx('hurt'); }
  return lost;
}

export function applyEffect(s: S, effect: EventEffect, rng = s.floorRng.events): Outcome {
  const run = s.run, p = s.player, f = run.floor;
  switch (effect) {
    case 'nothing': return { lines: [], good: null };
    case 'heal_small': { const g = Math.round(p.heal(hpPct(s, 0.22), true)); return { lines: [g ? `+${g} Wellbeing` : 'Wellbeing already at maximum'], good: g > 0 ? true : null }; }
    case 'heal_full': { const g = Math.round(p.heal(p.maxHp, true)); return { lines: [g ? `+${g} Wellbeing (full)` : 'Wellbeing already at maximum'], good: g > 0 ? true : null }; }
    case 'lose_hp_small': { const l = loseHp(s, hpPct(s, 0.1)); return { lines: [`-${l} Wellbeing`], good: false }; }
    case 'lose_hp_large': { const l = loseHp(s, hpPct(s, 0.25)); return { lines: [`-${l} Wellbeing`], good: false }; }
    case 'gain_cash_small': { const a = earn(s, 18 + f * 3, { quiet: true }); return { lines: [`+£${a} Petty Cash`], good: true }; }
    case 'gain_cash_large': { const a = earn(s, 45 + f * 7, { quiet: true }); return { lines: [`+£${a} Petty Cash`], good: true }; }
    case 'lose_cash': { const l = Math.min(run.pettyCash, 15 + f * 2); run.pettyCash -= l; return { lines: [`-£${l} Petty Cash`], good: false }; }
    case 'gamble_cash': {
      if (rng.chance(0.5)) { const a = earn(s, 55 + f * 6, { quiet: true }); return { lines: ['The gamble pays off.', `+£${a} Petty Cash`], good: true }; }
      const l = Math.min(run.pettyCash, 25 + f * 3); run.pettyCash -= l;
      return { lines: ['The gamble does not pay off.', `-£${l} Petty Cash`], good: false };
    }
    case 'gain_benefit': return { lines: ['A Benefits Package is on its way to your inbox.'], good: true, after: () => { openBenefitEmail(s, { dept: null, onEmpty: () => earn(s, 40 + f * 4) }); } };
    case 'gain_desk_item': {
      const d = rollDeskItem(s, rng);
      if (!d) { const a = earn(s, 40 + f * 5, { quiet: true }); return { lines: ['The desk drawer is empty, except for cash.', `+£${a} Petty Cash`], good: true }; }
      acquireDeskItem(s, d.id);
      return { lines: [`Desk Item acquired: ${d.name}`], good: true };
    }
    case 'gain_weapon_rare': {
      const w = rollRewardWeapon(s, 1, 0.5);
      s.world.add(new Pickup({ kind: 'weapon', weapon: w, x: p.x, y: p.y + 10, vx: 20, vy: 20 }));
      return { lines: ['A rare weapon lands at your feet.'], good: true };
    }
    case 'curse_marked': run.flags.markedNext = true; return { lines: ['You will be Marked on the next floor: +25% damage taken for a while.'], good: false };
    case 'rage_full_next': run.flags.rageFullNext = true; return { lines: ['You start the next floor with your Stress gauge full.'], good: true };
    case 'reveal_weakness': {
      const rec = profile().promoted.find((r) => !r.terminated && !r.weaknessKnown);
      if (rec) {
        rec.weaknessKnown = true; run.intel.push(rec.id);
        return { lines: [`Intel: ${rec.name} (${rec.title}) is weak to ${rec.weakness}.`], good: true };
      }
      run.extraMods.push({ stat: 'critChance', add: 0.02, source: 'event:intel' });
      p.refreshStats();
      return { lines: ['No staff on file to report. You learn their habits anyway: +2% critical chance.'], good: true };
    }
    case 'shield_up': {
      run.extraMods.push({ stat: 'maxShield', add: 10, source: 'event:shield' });
      p.refreshStats(); p.shield = Math.min(p.maxShield, p.shield + 10);
      return { lines: ['+10 maximum Wellbeing shield'], good: true };
    }
    case 'max_hp_up': { run.maxHpBonus += 10; p.refreshStats(); return { lines: ['+10 maximum Wellbeing'], good: true }; }
    case 'max_hp_down': {
      if (p.maxHp <= 40) return { lines: ['Nothing more can be taken from you.'], good: null };
      run.maxHpBonus -= 10; p.refreshStats(); p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
      return { lines: ['-10 maximum Wellbeing'], good: false };
    }
    case 'free_reroll': run.flags.bonusRerolls = Number(run.flags.bonusRerolls ?? 0) + 1; return { lines: ['One free reroll at your next Canteen.'], good: true };
    case 'annual_leave_small': {
      const n = rng.chance(0.35) ? 2 : 1;
      run.flags.bonusLeave = Number(run.flags.bonusLeave ?? 0) + n; // credited by the meta module at run end
      return { lines: [`+${n} Annual Leave ${n === 1 ? 'day' : 'days'} (credited when the run ends)`], good: true };
    }
    case 'spawn_elite_fight': return { lines: ['Someone senior has noticed. The doors lock.'], good: false, after: () => spawnEliteFight(s) };
  }
  return { lines: [], good: null };
}

/** Spawn an elite in the player's room and seal it; the floor stays un-cleared until the elite is dead. */
export function spawnEliteFight(s: S): void {
  const w = s.world, p = s.player;
  const act = s.plan.act;
  const elites = ARCHETYPES.map((id) => ARCHETYPE_DEFS[id]).filter((a) => a.eliteOnly && a.act <= act);
  const arch = elites.find((a) => a.act === act) ?? elites[elites.length - 1] ?? ARCHETYPE_DEFS.team_leader;
  let rid = w.roomAt(p.x, p.y);
  if (rid < 0) rid = w.currentRoom;
  const rs = w.rooms[rid];
  const pts = [...(rs?.def.spawnPoints ?? [])].sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
  const at = pts[0] ?? { x: p.x + 60, y: p.y };
  makeEnemy(s.spawn, { archetype: arch.id, tier: tierFor(arch, act), roomId: rid }, at.x, at.y, true);
  if (rs) {
    rs.entered = true; rs.locked = true; rs.cleared = false;
    w.setRoomDoors(rid, 'locked');
    w.floorCleared = false;
    audio.sfx('door_lock');
    w.bus.emit('roomLock', { roomId: rid });
    w.onRoomLocked?.(rid);
  }
  s.hud.showBanner('ELITE ENGAGEMENT', 'Senior staff have joined the meeting.', '#ff6a5a', 3);
}

// ---------------------------------------------------------------------------
// Dialog
class EventDialog implements UiComponent {
  done = false;
  private ui: Ui;
  private anim = new OpenAnim(8);
  private phase: 'choose' | 'result' = 'choose';
  private btns: { b: Button; o: EventOption }[] = [];
  private cont: Button;
  private win: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private result: Outcome | null = null;
  private resultText = '';

  constructor(private ev: GameEvent, private s: S, private onFinish: (after?: () => void) => void) {
    this.ui = new Ui({});
    for (const o of ev.options) {
      const b = this.ui.add(new Button({ text: this.label(o), align: 'left', onPress: () => this.choose(o) }));
      this.btns.push({ b, o });
    }
    this.cont = this.ui.add(new Button({ text: 'Continue', kind: 'primary', onPress: () => this.finish() }));
    this.cont.visible = false;
    this.refresh();
    audio.sfx('ui_notify');
  }
  private label(o: EventOption): string {
    const c = o.cost;
    const bits: string[] = [];
    if (c?.cash) bits.push(`£${c.cash}`);
    if (c?.hp) bits.push(`${c.hp} HP`);
    return bits.length ? `${o.label}   [costs ${bits.join(' + ')}]` : o.label;
  }
  private affordable(o: EventOption): boolean {
    const c = o.cost;
    if (c?.cash && this.s.run.pettyCash < c.cash) return false;
    if (c?.hp && this.s.player.hp <= c.hp) return false;
    return true;
  }
  private refresh(): void {
    for (const { b, o } of this.btns) { b.enabled = this.affordable(o); b.visible = this.phase === 'choose'; }
    this.cont.visible = this.phase === 'result';
    const first = this.phase === 'choose' ? this.btns.find((x) => x.b.enabled)?.b : this.cont;
    this.ui.setFocus(first ?? null);
  }
  private choose(o: EventOption): void {
    if (this.phase !== 'choose') return;
    const s = this.s;
    if (o.cost?.cash) { s.run.pettyCash -= o.cost.cash; s.run.log.cashSpent += o.cost.cash; }
    if (o.cost?.hp) loseHp(s, o.cost.hp);
    this.result = applyEffect(s, o.effect);
    this.resultText = o.outcome;
    this.phase = 'result';
    this.refresh();
    audio.sfx(this.result.good === false ? 'ui_error' : 'ui_purchase');
  }
  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.onFinish(this.result?.after);
  }
  update(dt: number): void {
    this.anim.step(dt);
    const r = app.renderer, s = uiS();
    const w = Math.min(r.W - 24, s === 2 ? 470 : 400);
    const th = titleBarH(), bh = btnH();
    const text = this.phase === 'choose' ? this.ev.intro : this.resultText;
    const lines = wrap(text, w - 28, s);
    const extra = this.phase === 'result' ? (this.result?.lines ?? []).flatMap((l) => wrap(l, w - 36, s)) : [];
    const nBtns = this.phase === 'choose' ? this.btns.length : 1;
    const h = th + 14 + lines.length * LINE_H * s + (extra.length ? 10 + extra.length * LINE_H * s : 0) + 12 + nBtns * (bh + 3) + 22;
    this.win = { x: Math.round((r.W - w) / 2), y: Math.round((r.H - h) / 2), w, h };
    if (this.phase === 'choose') {
      this.btns.forEach(({ b }, i) => b.set(this.win.x + 10, this.win.y + h - 14 - (nBtns - i) * (bh + 3) + 1, w - 20, bh));
    } else {
      const bw = 120 * s;
      this.cont.set(this.win.x + w - bw - 12, this.win.y + h - bh - 16, bw, bh);
    }
    this.ui.update(dt);
  }
  render(g: Ctx): void {
    dim(g, 0.55 * this.anim.t);
    const full = this.win;
    const rr = this.anim.done ? full : popRect(full, this.anim.t);
    drawWindow(g, `Calendar Invite: ${this.ev.title}`, rr, { icon: 'mail', close: false });
    if (!this.anim.done) return;
    const s = uiS();
    let y = full.y + titleBarH() + 10;
    const text = this.phase === 'choose' ? this.ev.intro : this.resultText;
    wrap(text, full.w - 28, s).forEach((l, i) => ink(g, l, full.x + 14, y + i * LINE_H * s, { scale: s }));
    y += wrap(text, full.w - 28, s).length * LINE_H * s + 8;
    if (this.phase === 'result' && this.result) {
      const lines = this.result.lines.flatMap((l) => wrap(l, full.w - 36, s));
      const col = this.result.good === true ? '#1d7a3e' : this.result.good === false ? '#a82828' : C.inkDim;
      box(g, full.x + 10, y - 2, full.w - 20, lines.length * LINE_H * s + 6, { face: '#fbfaf5', kind: 'sunken', depth: 1, cham: 0 });
      lines.forEach((l, i) => ink(g, l, full.x + 16, y + 1 + i * LINE_H * s, { scale: s, color: col }));
    }
    this.ui.render(g);
    this.ui.drawCursor(g);
  }
}

export function openEvent(s: S, ev: GameEvent, onResolved?: () => void): void {
  const dlg = new EventDialog(ev, s, (after) => {
    onResolved?.();
    if (after) setTimeout(after, 0);
  });
  app.push(new UiScene(dlg, { transparent: true }));
}

FLOOR_SETUP.event = (s) => {
  const ev = pickEvent(s);
  s.data.cpEvent = ev;
  const c = findCentrepiece(s, ['fortune_copier'], 'event');
  let resolved = false;
  s.world.interactables.push({
    x: c.x, y: c.y + 8, r: 34, priority: 1,
    get label() { return resolved ? 'Nothing more to see' : `Investigate: ${ev.title}`; },
    sub: 'Something odd is happening',
    enabled: () => !resolved,
    onInteract: () => openEvent(s, ev, () => { resolved = true; }),
  });
  s.hud.showBanner('SOMETHING ODD', ev.title, '#ffd34d', 3);
};

void [icon, deskItemIcon, notify];
