// Unified input (spec 2.5, 2.6): keyboard+mouse, gamepad (standard mapping), touch (via TouchControls injecting state).
// Supports runtime rebinding, chords (LB+RB), device-aware prompts and hold/tap alternatives.

export type Action =
  | 'melee' | 'heavy' | 'ranged' | 'grab' | 'dash' | 'rage' | 'interact' | 'pause'
  | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'tabL' | 'tabR' | 'alt' | 'debug';

export const GAMEPLAY_ACTIONS: Action[] = ['melee', 'heavy', 'ranged', 'grab', 'dash', 'rage', 'interact', 'pause'];
export const ALL_ACTIONS: Action[] = [...GAMEPLAY_ACTIONS, 'up', 'down', 'left', 'right', 'confirm', 'back', 'tabL', 'tabR', 'alt', 'debug'];

export type Device = 'kbm' | 'xbox' | 'playstation' | 'pad' | 'touch';

/** Binding string forms: "key:KeyF", "mouse:0", "pad:2", "pad:4+5" (chord), "axis:5+" (trigger/axis direction). */
export type Bindings = Record<Action, { kb: string[]; pad: string[] }>;

export const DEFAULT_BINDINGS: Bindings = {
  melee: { kb: ['mouse:0'], pad: ['pad:2'] },
  heavy: { kb: ['key:KeyQ'], pad: ['pad:6'] },
  ranged: { kb: ['mouse:2'], pad: ['pad:7'] },
  grab: { kb: ['key:KeyF'], pad: ['pad:1'] },
  dash: { kb: ['key:Space'], pad: ['pad:0'] },
  rage: { kb: ['key:KeyR'], pad: ['pad:4+5'] },
  interact: { kb: ['key:KeyE'], pad: ['pad:3'] },
  pause: { kb: ['key:Escape', 'key:KeyP'], pad: ['pad:9'] },
  up: { kb: ['key:ArrowUp', 'key:KeyW'], pad: ['pad:12'] },
  down: { kb: ['key:ArrowDown', 'key:KeyS'], pad: ['pad:13'] },
  left: { kb: ['key:ArrowLeft', 'key:KeyA'], pad: ['pad:14'] },
  right: { kb: ['key:ArrowRight', 'key:KeyD'], pad: ['pad:15'] },
  confirm: { kb: ['key:Enter', 'key:Space', 'key:KeyE'], pad: ['pad:0'] },
  back: { kb: ['key:Escape', 'key:Backspace'], pad: ['pad:1'] },
  tabL: { kb: ['key:KeyQ', 'key:PageUp'], pad: ['pad:4'] },
  tabR: { kb: ['key:KeyE', 'key:PageDown'], pad: ['pad:5'] },
  alt: { kb: ['key:Tab'], pad: ['pad:8'] },
  debug: { kb: ['key:Backquote'], pad: [] },
};

/** Movement keys (separately bindable). */
export interface MoveKeys { up: string; down: string; left: string; right: string; }
export const DEFAULT_MOVE_KEYS: MoveKeys = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

interface ActState { down: boolean; pressed: boolean; released: boolean; held: number; }

/** Virtual (touch) state injected by touch controls each frame. */
export interface VirtualInput {
  move: { x: number; y: number };
  aim: { x: number; y: number } | null; // unit-ish vector; null when not aiming
  buttons: Partial<Record<Action, boolean>>;
}

export class Input {
  bindings: Bindings = structuredClone(DEFAULT_BINDINGS);
  moveKeys: MoveKeys = { ...DEFAULT_MOVE_KEYS };
  device: Device = 'kbm';
  deadzone = 0.22;

  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  private padButtons: boolean[] = [];
  private padAxes: number[] = [];
  private state = {} as Record<Action, ActState>;
  /** Mouse position in internal frame pixels. */
  mouse = { x: 0, y: 0, moved: false, inside: false };
  mouseWheel = 0;
  /** Pointer clicks/taps this frame for UI (internal coords). */
  clicks: { x: number; y: number; button: number }[] = [];
  /** Raw pointer state for UI drag (internal coords). */
  pointerDown = false;
  textInput: string[] = [];
  lastKey: string | null = null;
  virtual: VirtualInput = { move: { x: 0, y: 0 }, aim: null, buttons: {} };
  /** Capture mode: next physical input is returned for rebinding. */
  private capture: ((b: string) => void) | null = null;
  private captureKind: 'kb' | 'pad' = 'kb';
  private toInternal: (cx: number, cy: number) => { x: number; y: number };
  private padIndex = -1;
  padId = '';
  rumbleEnabled = true;
  /** holdToTap accessibility (spec 2.6): a pad chord such as LB+RB (Rage) triggers from any single button of the chord. Set by the gameplay scene. */
  chordAsTap = false;

  constructor(target: HTMLElement, toInternal: (cx: number, cy: number) => { x: number; y: number }) {
    this.toInternal = toInternal;
    for (const a of ALL_ACTIONS) this.state[a] = { down: false, pressed: false, released: false, held: 0 };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F11' || e.code === 'F12' || (e.ctrlKey && e.code === 'KeyR')) return;
      e.preventDefault();
      if (this.capture && this.captureKind === 'kb') {
        if (e.repeat) return;
        if (e.code !== 'Escape') { const cb = this.capture; this.capture = null; cb('key:' + e.code); }
        else { const cb = this.capture; this.capture = null; cb(''); }
        return;
      }
      if (!e.repeat) this.keys.add(e.code);
      this.lastKey = e.code;
      if (e.key.length === 1) this.textInput.push(e.key);
      else if (e.key === 'Backspace') this.textInput.push('\b');
      this.device = 'kbm';
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });

    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { this.device = 'touch'; return; }
      if (this.capture && this.captureKind === 'kb') { const cb = this.capture; this.capture = null; cb('mouse:' + e.button); return; }
      this.mouseButtons.add(e.button);
      const p = this.toInternal(e.clientX, e.clientY);
      this.clicks.push({ x: p.x, y: p.y, button: e.button });
      this.pointerDown = true;
      this.device = 'kbm';
      target.focus();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouseButtons.delete(e.button);
      this.pointerDown = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const p = this.toInternal(e.clientX, e.clientY);
      if (Math.abs(p.x - this.mouse.x) + Math.abs(p.y - this.mouse.y) > 0.5) {
        this.mouse.moved = true;
        if (this.device !== 'kbm' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) this.device = 'kbm';
      }
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.inside = true;
    });
    target.addEventListener('wheel', (e) => { this.mouseWheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('gamepadconnected', (e) => { this.padIndex = (e as GamepadEvent).gamepad.index; });
  }

  /** Inject a tap from touch UI (internal coords) so menus work by touch. */
  injectTap(x: number, y: number): void { this.clicks.push({ x, y, button: 0 }); this.device = 'touch'; }

  private pollPad(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    if (this.padIndex >= 0) pad = pads[this.padIndex] ?? null;
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; }
    if (!pad) { this.padButtons = []; this.padAxes = []; return; }
    const prev = this.padButtons;
    this.padButtons = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    this.padAxes = pad.axes.slice();
    this.padId = pad.id;
    const anyNew = this.padButtons.some((b, i) => b && !prev[i]);
    const stick = this.padAxes.some((a) => Math.abs(a) > 0.5);
    if (anyNew || stick) {
      const id = pad.id.toLowerCase();
      this.device = /054c|playstation|dualsense|dualshock|sony/.test(id) ? 'playstation' : /045e|xbox|xinput|microsoft/.test(id) ? 'xbox' : 'pad';
    }
    if (this.capture && this.captureKind === 'pad' && anyNew) {
      const idx = this.padButtons.findIndex((b, i) => b && !prev[i]);
      const cb = this.capture; this.capture = null;
      cb(idx === 9 ? '' : 'pad:' + idx);
    }
  }

  private bindingActive(b: string): boolean {
    const [kind, code] = b.split(':');
    if (kind === 'key') return this.keys.has(code);
    if (kind === 'mouse') return this.mouseButtons.has(+code);
    if (kind === 'pad') { const parts = code.split('+'); return this.chordAsTap ? parts.some((n) => !!this.padButtons[+n]) : parts.every((n) => !!this.padButtons[+n]); }
    return false;
  }

  /** Call once per fixed update, before game logic. */
  update(dt: number): void {
    this.pollPad();
    // Chord suppression: if LB+RB chord active, don't also fire tabL/tabR in gameplay.
    for (const a of ALL_ACTIONS) {
      const st = this.state[a];
      const b = this.bindings[a];
      let down = b.kb.some((x) => this.bindingActive(x)) || b.pad.some((x) => this.bindingActive(x));
      if (this.virtual.buttons[a]) down = true;
      st.pressed = down && !st.down;
      st.released = !down && st.down;
      st.held = down ? st.held + dt : 0;
      st.down = down;
    }
  }

  /** Call at end of frame to clear per-frame transient data. */
  endFrame(): void {
    this.clicks.length = 0;
    this.mouseWheel = 0;
    this.textInput.length = 0;
    this.mouse.moved = false;
    this.lastKey = null;
  }

  down(a: Action): boolean { return this.state[a].down; }
  pressed(a: Action): boolean { return this.state[a].pressed; }
  released(a: Action): boolean { return this.state[a].released; }
  held(a: Action): number { return this.state[a].held; }
  /** Consume a press so other systems don't also see it this frame. */
  consume(a: Action): void { this.state[a].pressed = false; }

  /** Movement vector (length <= 1). */
  move(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.moveKeys;
    if (this.keys.has(k.left) || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has(k.right) || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has(k.up) || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has(k.down) || this.keys.has('ArrowDown')) y += 1;
    if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
    const ax = this.padAxes[0] ?? 0, ay = this.padAxes[1] ?? 0;
    const l = Math.hypot(ax, ay);
    if (l > this.deadzone) {
      const m = Math.min(1, (l - this.deadzone) / (1 - this.deadzone));
      return { x: (ax / l) * m, y: (ay / l) * m };
    }
    if (this.padButtons[14]) x -= 1;
    if (this.padButtons[15]) x += 1;
    if (this.padButtons[12]) y -= 1;
    if (this.padButtons[13]) y += 1;
    if (x || y) { const l2 = Math.hypot(x, y); return { x: x / l2, y: y / l2 }; }
    return this.virtual.move;
  }

  /** Right stick aim vector, or null if not deflected. */
  stickAim(): { x: number; y: number } | null {
    const ax = this.padAxes[2] ?? 0, ay = this.padAxes[3] ?? 0;
    if (Math.hypot(ax, ay) > 0.35) return { x: ax, y: ay };
    return this.virtual.aim;
  }

  /** Rumble (Gamepad haptics where supported). */
  rumble(strong: number, weak: number, ms: number): void {
    if (!this.rumbleEnabled) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this.padIndex >= 0 ? pads[this.padIndex] : null;
    const act = (pad as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } })?.vibrationActuator;
    act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
    if (this.device === 'touch' && navigator.vibrate) navigator.vibrate(Math.min(ms, 60));
  }

  isPad(): boolean { return this.device === 'xbox' || this.device === 'playstation' || this.device === 'pad'; }

  /** Begin capturing the next input for rebinding. Callback receives '' on cancel. */
  captureNext(kind: 'kb' | 'pad', cb: (binding: string) => void): void { this.capture = cb; this.captureKind = kind; }
  get capturing(): boolean { return this.capture !== null; }
  /** Cancel an in-progress rebind capture (callback receives ''). */
  cancelCapture(): void { const cb = this.capture; this.capture = null; cb?.(''); }

  setBinding(a: Action, kind: 'kb' | 'pad', binding: string, slot = 0): void {
    const list = this.bindings[a][kind];
    list[slot] = binding;
  }
  resetBindings(): void { this.bindings = structuredClone(DEFAULT_BINDINGS); this.moveKeys = { ...DEFAULT_MOVE_KEYS }; }

  /** Human-readable label for the first binding of an action on the current device. */
  label(a: Action): string {
    const kind = this.isPad() ? 'pad' : 'kb';
    if (this.device === 'touch') return '';
    const b = this.bindings[a][kind][0];
    return b ? bindingLabel(b, this.device) : '—';
  }
}

const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Home'];
const PS = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'PS'];
const GENERIC = ['B1', 'B2', 'B3', 'B4', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Home'];

export function bindingLabel(b: string, device: Device): string {
  const [kind, code] = b.split(':');
  if (kind === 'mouse') return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][+code] ?? 'M' + code;
  if (kind === 'key') {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const map: Record<string, string> = { Space: 'Space', Escape: 'Esc', ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl', AltLeft: 'LAlt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'Bksp', Tab: 'Tab', Backquote: '`' };
    return map[code] ?? code;
  }
  if (kind === 'pad') {
    const names = device === 'playstation' ? PS : device === 'xbox' ? XBOX : GENERIC;
    return code.split('+').map((n) => names[+n] ?? 'B' + n).join('+');
  }
  return b;
}
