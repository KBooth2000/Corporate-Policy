// "Probation Period Complete": the CorpOS end-of-demo screen (spec 8.1, D25). Shown by GameplayScene when the Act 1 boss falls in a demo
// build (Steam Act 1 demo, or the free Android install while ANDROID_PAYWALL_ENABLED). Offers the unlock / wishlist call to action; closing it
// continues to the run summary (Annual Leave is still awarded: the profile is shared with the full game).
import { Ctx } from '../render/canvas';
import { Widget, List, Heading, Label, Button, Spacer, btnH } from '../ui/widgets';
import { C, box, RectL } from '../ui/style';
import { notify } from '../ui/corpos';
import { PanelScene } from '../game/meta/ui/panel';
import { InfoRow } from '../game/meta/ui/rows';
import { demoStore, unlockFullGame } from '../platform/edition';

export class DemoEndPanel extends PanelScene {
  override name = 'demoend';
  private list = new List();
  private unlocked = false;
  private busyBuying = false;
  private result = '';

  constructor(onContinue: () => void) {
    super({ title: 'CorpOS - Probation Period Complete', glyph: 'check', w: 540, h: 300, closeText: 'Continue to my review', onClose: onContinue });
    this.ui.add(this.list);
    this.build();
    this.finishBuild();
    this.ui.setFocus(this.list.items.find((i) => i instanceof Button) ?? this.closeBtn);
    this.statusText = 'End of the Act 1 demo.';
  }

  private build(): void {
    const store = demoStore();
    const items: Widget[] = [];
    items.push(new Heading('Probation Period Complete', 'check'));
    items.push(new Label('Congratulations. You survived Facilities, and the Facilities Manager did not. Human Resources is delighted, in the sense that it has not yet been told.', { scale: 1 }));
    items.push(new Spacer(3));
    items.push(new Heading('Your record is safe', 'user'));
    items.push(new InfoRow('Annual Leave, unlocks and feats', 'KEPT', { sub: 'Everything you earned carries over to the full game.', valueCol: '#1d7a3e' }));
    items.push(new Heading('Still to come in the full game', 'warn'));
    items.push(new InfoRow('Acts 2 to 4', 'LOCKED', { sub: 'Sales, Compliance, and the C-suite. It gets worse.', valueCol: C.inkDim }));
    items.push(new InfoRow('Daily Run and Performance Review', 'LOCKED', { sub: 'Published modifiers, leaderboards and cosmetic KPI rewards.', valueCol: C.inkDim }));
    items.push(new Spacer(3));
    if (this.unlocked) {
      items.push(new Label(this.result || 'Full game unlocked. Thank you.', { color: '#1d7a3e', scale: 1 }));
    } else {
      const text = store === 'android' ? 'Unlock the full game' : 'Wishlist / buy on Steam';
      const b = new Button({ text, kind: 'primary', glyph: store === 'android' ? 'play' : 'star', sound: 'ui_select', onPress: () => this.unlock() });
      b.h = btnH() + 2; b.enabled = !this.busyBuying;
      items.push(b, new Spacer(4));
      if (this.result) items.push(new Label(this.result, { dim: true, scale: 1 }));
      else items.push(new Label(store === 'android' ? 'One-time purchase. No ads, no loot boxes, no premium currency. Progress and unlocks carry over.' : 'Your progress and unlocks carry over to the full game.', { dim: true, scale: 1 }));
    }
    const f = this.ui.focus;
    const fi = f ? this.list.items.indexOf(f) : -1;
    this.list.setItems(items);
    for (const it of items) it.parent = this.list;
    if (fi >= 0 && items[fi]) this.ui.setFocus(items[fi]);
  }

  private unlock(): void {
    if (this.busyBuying) return;
    this.busyBuying = true; this.result = 'Contacting the Accounts department...'; this.build();
    void unlockFullGame().then((r) => {
      this.busyBuying = false;
      this.result = r.message;
      if (r.ok) { this.unlocked = true; notify({ kind: 'good', title: 'Full game unlocked', body: 'Start a new run from the car park to keep climbing.', sound: 'ui_unlock', duration: 5 }); }
      this.build();
    });
  }

  protected layout(cl: RectL): void {
    this.list.set(cl.x + 2, cl.y + 2, cl.w - 4, cl.h - this.footH() - 4);
    this.list.padY = 2; this.list.padX = 2;
  }
  protected drawBody(g: Ctx): void { box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: C.face, kind: 'sunken', cham: 0, depth: 1 }); }
}
