// Car radio (spec 7.3): music player for the soundtrack (RADIO_TRACKS) with unlockable tracks and DJ chatter.
import { app } from '../../../core/app';
import { fxRng } from '../../../core/rng';
import { audio, RADIO_TRACKS } from '../../../audio/audio';
import { Ctx } from '../../../render/canvas';
import { drawText, measure, LINE_H } from '../../../render/font';
import { Widget, Ui, List, Slider, Button, btnH, rowH } from '../../../ui/widgets';
import { C, box, well, ink, drawGlyph, uiS, truncate, RectL } from '../../../ui/style';
import { RADIO_DJ_LINES } from '../../../data/text/ui';
import { profile, saveProfile } from '../../profile';
import { radioUnlockRules, syncRadioUnlocks } from '../catalogue';
import { PanelScene } from './panel';

/** Shared radio state so the hub keeps the chosen track playing after the panel closes. */
export const radio = { on: false };

export function applyRadioVolume(): void {
  const S = app.settings;
  audio.setVolumes(S.volMaster, S.volMusic * Math.min(1.25, Math.max(0.05, profile().radio.volume / 0.8)), S.volSfx, S.volVoice);
}
export function restoreVolumes(): void { const S = app.settings; audio.setVolumes(S.volMaster, S.volMusic, S.volSfx, S.volVoice); }

export function playTrack(index: number): void {
  const t = RADIO_TRACKS[index];
  if (!t) return;
  profile().radio.track = index;
  radio.on = true;
  audio.music.play(t.id, 0.5);
  audio.music.setCombat(!!t.combat);
  saveProfile();
}
export function radioOff(): void { radio.on = false; audio.music.setCombat(false); audio.music.play('hub', 0.8); }

class TrackRow extends Widget {
  constructor(public index: number, public owner: RadioPanel) { super(); }
  override layout(): void { this.h = uiS() === 2 ? 28 : rowH() + 3; }
  override activate(): void { this.press = 1; this.owner.choose(this.index); }
  override draw(g: Ctx): void {
    const t = RADIO_TRACKS[this.index], s = uiS();
    const rule = radioUnlockRules()[this.index];
    const open = rule.done();
    const playing = radio.on && profile().radio.track === this.index;
    const x = this.x, y = this.y, w = this.w, h = this.h;
    g.fillStyle = this.focused ? '#fff3c4' : playing ? '#e3f1e6' : this.hovered ? '#f6f2e4' : '#f3f0e6';
    g.fillRect(x, y, w, h - 1);
    if (this.focused) { g.fillStyle = C.amber; g.fillRect(x, y, 3, h - 1); }
    g.fillStyle = C.faceLo; g.fillRect(x, y + h - 1, w, 1);
    ink(g, String(this.index + 1).padStart(2, '0'), x + 8, Math.round(y + (h - 7 * s) / 2), { scale: s, color: C.inkDim });
    const label = open ? t.title : '??? ' + rule.label;
    const chip = playing ? 'NOW PLAYING' : !open ? 'LOCKED' : t.combat ? 'COMBAT MIX' : '';
    const cw = chip ? measure(chip) + 12 : 0;
    ink(g, truncate(label, w - 40 - cw - 12, s), x + 30, Math.round(y + (h - 7 * s) / 2), { scale: s, color: open ? C.ink : C.inkDim });
    if (chip) {
      const cx = x + w - cw - 8;
      box(g, cx, y + Math.round((h - 12) / 2), cw, 12, { face: playing ? '#2c8a50' : !open ? '#59627a' : C.navyHi, cham: 1, depth: 1 });
      if (!open) drawGlyph(g, 'lock', cx + 7, y + h / 2, '#fff', 1);
      drawText(g, chip, cx + cw / 2 + (!open ? 4 : 0), y + Math.round((h - 7) / 2), { color: '#fff', align: 'center', shadow: null });
    }
  }
}

export class RadioPanel extends PanelScene {
  override name = 'radio';
  private list = new List();
  private rows: TrackRow[] = [];
  private vol: Slider;
  private btnPrev: Button; private btnToggle: Button; private btnNext: Button;
  private lcd: RectL = { x: 0, y: 0, w: 0, h: 0 };
  private dj = fxRng.pick(RADIO_DJ_LINES);
  private djT = 0; private djScroll = 0;
  private bars = new Float32Array(16);

  constructor(onClose?: () => void) {
    super({ title: 'KORP-FM Car Radio', glyph: 'bell', w: 560, h: 346, closeText: 'Switch off ignition', onClose });
    syncRadioUnlocks();
    this.rows = RADIO_TRACKS.map((_, i) => new TrackRow(i, this));
    this.list.setItems(this.rows);
    this.vol = new Slider('Volume', () => profile().radio.volume, (v) => { profile().radio.volume = v; applyRadioVolume(); saveProfile(); }, 0.1, 1, 0.1);
    this.btnPrev = new Button({ text: 'Prev', glyph: 'left', onPress: () => this.step(-1), sound: 'ui_move' });
    this.btnToggle = new Button({ text: radio.on ? 'Radio off' : 'Radio on', glyph: 'play', onPress: () => this.toggle(), sound: 'ui_select' });
    this.btnNext = new Button({ text: 'Next', glyph: 'right', onPress: () => this.step(1), sound: 'ui_move' });
    this.ui.add(this.list); this.ui.add(this.vol); this.ui.add(this.btnPrev); this.ui.add(this.btnToggle); this.ui.add(this.btnNext);
    this.finishBuild();
    this.ui.setFocus(this.rows[Math.min(profile().radio.track, this.rows.length - 1)] ?? this.btnToggle);
    this.statusText = 'Unlock more of the soundtrack by getting further up the tower.';
  }

  choose(i: number): void {
    if (!radioUnlockRules()[i].done()) { audio.sfx('ui_error'); this.statusText = `Locked: ${radioUnlockRules()[i].label}.`; return; }
    playTrack(i); applyRadioVolume();
    this.statusText = 'Now playing: ' + RADIO_TRACKS[i].title;
    this.btnToggle.text = 'Radio off';
  }
  private step(d: number): void {
    const n = RADIO_TRACKS.length; let i = profile().radio.track;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (radioUnlockRules()[i].done()) { this.choose(i); this.ui.setFocus(this.rows[i]); return; } }
  }
  private toggle(): void {
    if (radio.on) { radioOff(); this.btnToggle.text = 'Radio on'; this.statusText = 'Radio off. Car park ambience restored.'; }
    else { this.choose(profile().radio.track); }
  }

  protected override tick(dt: number): void {
    this.djT += dt; this.djScroll += dt * 32;
    if (this.djT > 11) { this.djT = 0; this.djScroll = 0; this.dj = fxRng.pick(RADIO_DJ_LINES); }
    const b = audio.music.beat();
    const beat = radio.on ? Math.pow(1 - b.phase, 2) : 0;
    for (let i = 0; i < this.bars.length; i++) {
      const target = radio.on ? 0.25 + 0.5 * Math.abs(Math.sin(this.t * (2.2 + i * 0.37) + i)) * (0.55 + 0.45 * beat) : 0.05;
      this.bars[i] += (target - this.bars[i]) * Math.min(1, dt * 14);
    }
  }

  protected layout(cl: RectL): void {
    const foot = this.footH();
    const lcdH = 62;
    this.lcd = { x: cl.x + 2, y: cl.y + 2, w: cl.w - 4, h: lcdH };
    const ctlH = btnH() + 4;
    const ly = cl.y + lcdH + 8;
    this.list.set(cl.x + 2, ly, cl.w - 4, cl.h - foot - lcdH - ctlH - 18);
    this.list.padY = 0;
    const cy = this.list.y + this.list.h + 4;
    const bw = Math.min(110, Math.floor((cl.w * 0.5) / 3));
    this.btnPrev.set(cl.x + 2, cy, bw, btnH()); this.btnToggle.set(cl.x + 2 + bw + 4, cy, bw + 20, btnH()); this.btnNext.set(cl.x + 2 + bw * 2 + 28, cy, bw, btnH());
    this.vol.set(cl.x + 2 + bw * 3 + 40, cy, cl.w - (bw * 3 + 44) - 4, btnH());
  }

  protected drawBody(g: Ctx, _cl: RectL): void {
    const l = this.lcd, s = uiS();
    box(g, l.x, l.y, l.w, l.h, { face: '#2a2e38', cham: 1, depth: 2 });
    well(g, l.x + 5, l.y + 5, l.w - 10, l.h - 10, '#10261d');
    const on = radio.on;
    const t = RADIO_TRACKS[profile().radio.track];
    drawText(g, on ? '98.4 KORP-FM' : 'RADIO OFF', l.x + 12, l.y + 10, { color: on ? '#7fff9c' : '#3c6a4c', scale: 2, shadow: null });
    drawText(g, on ? 'THE CULTURE FREQUENCY' : 'PRESS ON', l.x + 12, l.y + 28, { color: on ? '#4fc878' : '#2c5a3c', shadow: null });
    // track title
    if (t) ink(g, truncate(on ? t.title : '(not playing)', l.w - 220, s), l.x + 12, l.y + l.h - 17, { scale: s, color: on ? '#ffd34d' : '#6a7a5a', shadow: null });
    // equaliser
    const bx = l.x + l.w - 12 - this.bars.length * 7, by = l.y + l.h - 10;
    for (let i = 0; i < this.bars.length; i++) {
      const hh = Math.round(this.bars[i] * 36);
      for (let k = 0; k < hh; k += 3) { g.fillStyle = k > 26 ? '#ff6a5a' : k > 16 ? '#ffd34d' : '#4fc878'; g.fillRect(bx + i * 7, by - k - 2, 5, 2); }
    }
    // DJ ticker
    const tk = 'DJ: ' + this.dj + '      ';
    const tw = measure(tk);
    g.save(); g.beginPath(); g.rect(l.x + 7, l.y + 41, l.w - 150, 11); g.clip();
    const off = tw > l.w - 160 ? Math.floor(this.djScroll % tw) : 0;
    drawText(g, tk, l.x + 12 - off, l.y + 43, { color: '#9fe0b4', shadow: null });
    if (off) drawText(g, tk, l.x + 12 - off + tw, l.y + 43, { color: '#9fe0b4', shadow: null });
    g.restore();
    box(g, this.list.x - 1, this.list.y - 1, this.list.w + 2, this.list.h + 2, { face: '#e1ddd0', kind: 'sunken', cham: 0, depth: 1 });
    void LINE_H; void Ui;
  }
}
