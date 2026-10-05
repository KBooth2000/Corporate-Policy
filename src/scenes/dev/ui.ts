// Visual QA galleries for the CorpOS UI kit. Open with #dev=ui-menu | ui-settings | ui-email | ui-shop | ui-deck | ui-toasts | ui-touch
import { app, Scene } from '../../core/app';
import { registerDev } from './registry';
import { icon, weaponIcon, deskItemIcon } from '../../art/items';
import { drawDesktop, drawTaskbar, EmailView, IntranetPage, SlideDeck, UiScene, notify, renderNotifications, updateNotifications, MemoCard, ConfirmDialog, PopupMenu, Slide } from '../../ui/corpos';
import { touch } from '../../ui/touch';
import { Ui, Button, Slider, Toggle, Choice, TextField, KeyBind, Tabs, List, Heading, attachOSK } from '../../ui/widgets';
import { drawText } from '../../render/font';
import { audio } from '../../audio/audio';
import { MainMenuScene } from '../menu';
import { SettingsScene } from '../settings';

/** Hosts a UiComponent as a full scene, re-creating it when closed so galleries never go blank. */
class Host implements Scene {
  name = 'dev-ui';
  private comp: { done: boolean; update(dt: number): void; render(g: CanvasRenderingContext2D): void };
  constructor(private make: () => { done: boolean; update(dt: number): void; render(g: CanvasRenderingContext2D): void }, private backdrop = true) {
    this.comp = make();
  }
  enter(): void { touch.attach(app.renderer.screen); touch.setContext({ mode: 'menu' }); }
  update(dt: number): void {
    touch.update();
    updateNotifications(dt);
    this.comp.update(dt);
    if (this.comp.done) { this.comp = this.make(); }
  }
  render(): void {
    const g = app.renderer.f;
    if (this.backdrop) { drawDesktop(g, 'teal'); drawTaskbar(g, { items: [{ label: 'Inbox', glyph: 'mail', active: true }, { label: 'Canteen', glyph: 'cart' }], tray: ['bell', 'user'] }); }
    this.comp.render(g);
    renderNotifications(g);
  }
}

function emailDemo(): EmailView {
  return new EmailView({
    from: 'Benefits Team <benefits@corp.os>',
    body: 'Dear valued employee,\n\nFollowing your recent performance, HR is delighted to offer you a selection of benefits. Please choose ONE attachment. All others will be quietly given to someone who deserves them more.',
    attachments: [
      { icon: weaponIcon('stapler'), title: 'Ergonomic Chair Allowance', subtitle: 'Facilities  -  Standard', desc: 'Dash cooldown reduced by 15%. Your lumbar region thanks you. Legal will not.', rarity: 0, tag: 'NEW' },
      { icon: icon('dept_it'), title: 'Overclocked Calculator', subtitle: 'Finance  -  Enhanced', desc: 'Ranged hits have a 20% chance to compound into double damage. Interest is mandatory.', rarity: 1 },
      { icon: deskItemIcon('plant'), title: 'Executive Parachute', subtitle: 'Executive  -  Executive', desc: 'Survive one lethal hit per floor. Golden, comfortable, and absolutely not covered by your contract.', rarity: 2, tag: 'RARE' },
    ],
    onPick: (i) => notify({ title: 'Benefit accepted', body: 'You chose attachment ' + (i + 1) + '. This cannot be undone.', kind: 'good' }),
    allowSkip: true,
  });
}

function shopDemo(): IntranetPage {
  const products = [
    { name: 'Vending Coffee', desc: 'Restores a little Wellbeing. Tastes like regret.', price: 12, icon: icon('reward_heal'), rarity: 0 },
    { name: 'Staple Refill', desc: 'Twenty-four staples. Refillable up to zero times.', price: 25, icon: weaponIcon('stapler'), rarity: 0 },
    { name: 'Executive Biscuit', desc: 'Contains no calories. Contains one tiny bureaucrat.', price: 60, icon: icon('reward_rage'), rarity: 1, tag: 'HOT' },
    { name: 'Spare Lanyard', desc: 'Block one hit. Hang yourself later.', price: 45, icon: icon('shield'), rarity: 1 },
    { name: 'Gold Pen', desc: 'Weapon: +3 damage. Signs things.', price: 140, icon: weaponIcon('pen'), rarity: 2 },
    { name: 'Out of Office', desc: 'Sold out. Back in 3 working days.', price: 30, icon: icon('leave'), soldOut: true },
    { name: 'Dehumidifier', desc: 'Dries blood. Remarkably.', price: 80, icon: deskItemIcon('dehumidifier'), rarity: 1 },
    { name: 'Team Building Voucher', desc: 'Nobody will attend.', price: 20, icon: icon('reward_event') },
  ];
  let cash = 100;
  const page: IntranetPage = new IntranetPage({
    products, cash,
    onBuy: (i) => { products[i].soldOut = true; cash -= products[i].price; page.setCash(cash); page.setProducts(products); return true; },
  });
  return page;
}

function deckDemo(): SlideDeck {
  const slides: Slide[] = [
    { type: 'title', title: 'Annual Performance Review', subtitle: 'Employee #0451  -  Floor 12 reached', stamp: 'CONFIDENTIAL' },
    { type: 'stats', title: 'Key Results', stats: [{ label: 'Time in office', value: '14:32', sub: 'unpaid overtime' }, { label: 'Floors cleared', value: '12', sub: 'of 20' }, { label: 'Colleagues removed', value: '187', sub: 'restructured' }, { label: 'Stress peak', value: '100%', sub: 'at 11:40', colour: '#b5503c' }] },
    { type: 'bars', title: 'Departmental Headcount Reduction', data: [{ label: 'Kills', value: 187 }, { label: 'Executions', value: 41 }, { label: 'Defenestrations', value: 23 }, { label: 'Hazards', value: 56 }, { label: 'Thrown items', value: 78 }], note: 'Source: HR (unverified). Reductions are not layoffs.' },
    { type: 'pie', title: 'Method of Resignation', data: [{ label: 'Blunt trauma', value: 46 }, { label: 'Window exit', value: 23 }, { label: 'Staplers', value: 31 }, { label: 'Fire / hazards', value: 56 }, { label: 'Paperwork', value: 12 }] },
    { type: 'line', title: 'Wellbeing Score by Floor', series: [{ label: 'Wellbeing', points: [100, 92, 80, 84, 60, 55, 30, 42, 24, 12] }, { label: 'Stress', points: [5, 12, 30, 28, 55, 70, 80, 78, 92, 100], colour: '#b5503c' }], xLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    { type: 'bullets', title: 'Areas for Improvement', bullets: ['Stop dying on floor 5', 'Use the stairs less (they are on fire)', 'Please return the stapler', 'Smile more, or at least cover the camera'] },
  ];
  return new SlideDeck({ slides });
}

class ToastScene implements Scene {
  name = 'ui-toasts';
  private t = 0; private n = 0;
  enter(): void { touch.setContext({ mode: 'menu' }); }
  update(dt: number): void {
    this.t += dt;
    updateNotifications(dt);
    if (this.t > (this.n === 0 ? 0.3 : 1.1) && this.n < 5) {
      this.t = 0;
      const k = this.n++;
      const demos = [
        { title: 'Room cleared', body: 'Doors unlocked. Colleagues will be informed.', kind: 'good' as const },
        { title: 'Policy Update: No Dashing', body: 'Effective immediately, running is a compliance risk.', kind: 'boss' as const, icon: icon('policy_no_dash') },
        { title: 'Promotion!', body: 'Dave from Accounts is now Senior Dave. He has a new weakness.', kind: 'warn' as const, icon: icon('promotion') },
        { title: 'New mail', body: 'Re: Your Benefits Package', kind: 'mail' as const },
        { title: 'Wellbeing critical', body: 'Please consider a lie down.', kind: 'bad' as const },
      ];
      notify({ ...demos[k], duration: 12 });
    }
    if (app.input.pressed('confirm')) { this.n = 0; this.t = 0; }
  }
  render(): void {
    const g = app.renderer.f;
    drawDesktop(g, 'login');
    drawTaskbar(g, { items: [{ label: 'Notifications', glyph: 'bell', active: true }] });
    drawText(g, 'Toasts: press confirm to replay', 20, 20, { color: '#fff' });
    renderNotifications(g);
  }
}

class TouchScene implements Scene {
  name = 'ui-touch';
  private t = 0;
  enter(): void { touch.attach(app.renderer.screen); touch.enabled = true; touch.setContext({ mode: 'gameplay', grab: true, interact: 'Open door', rageReady: true, rageActive: false, ranged: true }); }
  update(dt: number): void {
    this.t += dt;
    touch.update();
    const a = this.t;
    touch.demoState = { move: { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.8 }, aim: { x: Math.cos(a * 0.7 + 2) * 0.9, y: Math.sin(a * 0.7 + 2) * 0.9 }, buttons: Math.floor(a) % 3 === 0 ? ['melee'] : [] };
  }
  render(): void {
    const g = app.renderer.f;
    const r = app.renderer;
    // fake game backdrop with HUD corners
    g.fillStyle = '#3c3a33'; g.fillRect(0, 0, r.W, r.H);
    for (let y = 0; y < r.H; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < r.W; x += 32) { g.fillStyle = '#464339'; g.fillRect(x, y, 16, 16); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(r.safe.l + 6, r.safe.t + 6, 110, 34); g.fillRect(r.W - r.safe.r - 116, r.safe.t + 6, 110, 34);
    drawText(g, 'HUD: Wellbeing', r.safe.l + 12, r.safe.t + 14); drawText(g, 'Cash 123', r.W - r.safe.r - 110, r.safe.t + 14);
    touch.render(g);
  }
}

class WidgetsScene implements Scene {
  name = 'ui-widgets';
  ui = new Ui({ onBack: () => audio.sfx('ui_back') });
  list = new List();
  tabs = new Tabs([{ label: 'Display', glyph: 'gear' }, { label: 'Audio', glyph: 'bell' }, { label: 'Controls', glyph: 'key' }]);
  vol = 0.6; tog = true; ch = 'b';
  seed: TextField;
  constructor() {
    this.seed = new TextField('Seed code', '', { maxLen: 9, filter: (c) => (/[0-9a-z-]/i.test(c) ? c.toUpperCase() : ''), placeholder: 'XXXX-XXXX' });
    attachOSK(this.ui, this.seed, 'Enter seed code', 9);
    this.list.setItems([
      new Heading('Sample controls', 'gear'),
      new Slider('Master volume', () => this.vol, (v) => { this.vol = v; }),
      new Toggle('Reduced lights', () => this.tog, (v) => { this.tog = v; }),
      new Choice('Gore', [{ value: 'a', label: 'Full' }, { value: 'b', label: 'Reduced' }, { value: 'c', label: 'Off' }], () => this.ch, (v) => { this.ch = v; }),
      this.seed,
      new KeyBind({ label: 'Melee', action: 'melee' }),
      new KeyBind({ label: 'Dash', action: 'dash' }),
      new KeyBind({ label: 'Move up', moveKey: 'up' }),
      new Button({ text: 'Open popup', onPress: () => this.ui.openModal(new PopupMenu({ title: 'Actions', items: [{ label: 'Reply', glyph: 'mail', onPick: () => notify({ title: 'Reply sent' }) }, { label: 'Delete', glyph: 'close', onPick: () => undefined }, { label: 'Disabled', disabled: true, onPick: () => undefined }] })) }),
      new Button({ text: 'Confirm dialog', kind: 'danger', onPress: () => this.ui.openModal(new ConfirmDialog({ title: 'Reset all progress', message: 'This will permanently delete all progress. HR will not be able to restore it.', danger: true, confirmText: 'Delete', onConfirm: () => notify({ title: 'Deleted', kind: 'bad' }) })) }),
    ]);
    this.ui.add(this.tabs); this.ui.add(this.list);
    this.ui.setFocus(this.list.items[1]);
  }
  enter(): void { touch.setContext({ mode: 'menu' }); }
  update(dt: number): void {
    touch.update();
    updateNotifications(dt);
    this.tabs.set(20, 40, 100, 100); this.list.set(130, 40, 420, 280);
    this.ui.update(dt);
  }
  render(): void {
    const g = app.renderer.f;
    drawDesktop(g, 'teal');
    g.fillStyle = '#e6e3dc'; g.fillRect(14, 34, 546, 292);
    this.ui.render(g);
    this.ui.drawHints(g, 14, 338, 546);
    renderNotifications(g);
    this.ui.drawCursor(g);
  }
}

registerDev('ui-email', () => new Host(emailDemo));
registerDev('ui-shop', () => new Host(shopDemo));
registerDev('ui-deck', () => new Host(deckDemo, false));
registerDev('ui-toasts', () => new ToastScene());
registerDev('ui-touch', () => new TouchScene());
registerDev('ui-widgets', () => new WidgetsScene());
registerDev('ui-memo', () => new Host(() => new MemoCard({ body: 'Please remember that the fire exits are for emergencies only. The window is not a fire exit.', subject: 'Safety Reminder', progress: 0.6, stamp: 'CONFIDENTIAL' }), false));
registerDev('ui-menu', () => new MainMenuScene({
  version: '0.1.0-dev', hasContinue: true,
  onDecline: () => notify({ title: 'Game starts here', body: 'onDecline() called', kind: 'warn' }),
  onContinue: () => notify({ title: 'Continue Shift' }),
  onDaily: () => notify({ title: 'Daily Run' }),
  onSeeded: (s) => notify({ title: 'Seeded run', body: 'seed ' + s }),
  onSettings: () => app.push(new SettingsScene(() => app.pop())),
  onCredits: () => notify({ title: 'Credits' }),
  onQuit: () => notify({ title: 'Shut Down' }),
}));
registerDev('ui-settings', () => new SettingsScene(() => notify({ title: 'Settings closed' }), { inGame: false, onResetProgress: () => notify({ title: 'Progress reset', kind: 'bad' }) } as never));
