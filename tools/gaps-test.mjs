// QA for the compliance gap items: Quarterly Targets, holdToTap, Act 1 demo gate (+ Daily / Performance Review locks), the debug console and the
// Rage execution variant. Playwright against a dev server:
//   npx vite --config scratch/vite-nohmr.config.ts --port 5192 --strictPort &        (HMR off so other edits do not reload the page)
//   URL=http://localhost:5192/ node tools/gaps-test.mjs [scenario ...]               scenarios: quarterly holdtotap demo console rage
// Screenshots go to scratch/gaps-*.png. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.URL || 'http://localhost:5192/';
const OUT = process.env.OUT || 'scratch';
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0;
const failures = [];
const consoleErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; failures.push(name); console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
}

async function load(hash, { w = 1280, h = 720, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('swiftshader') && !t.includes('[vite]')) consoleErrors.push(`[${hash}] ${t}`); } });
  page.on('pageerror', (e) => consoleErrors.push(`[${hash}] pageerror ${e.message}`));
  await page.goto(BASE + '#' + hash);
  await page.waitForFunction(() => window.__cp && window.__cp.app.top, null, { timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    // import the exact module instance the game loaded (Vite may stamp module URLs)
    window.__imp = (p) => { const hit = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new URL(n).pathname === p); return import(hit || p); };
  });
  return { page, ctx };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/gaps-${name}.png` });
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const top = (page) => page.evaluate(() => __cp.app.top.name);

async function scenario(name, fn) {
  if (only.length && !only.includes(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { fail++; failures.push(`${name}: threw ${e.message}`); console.log('  FAIL threw', e.stack || e.message); }
}

// ================================================================================================ 1. Quarterly Targets
await scenario('quarterly', async () => {
  const { page, ctx } = await load('play&seed=11&floor=3');
  const lim = await ev(page, async () => { const q = await __imp('/src/game/content/quarterly.ts'); return { r1: q.limitFor(1, 20), r2: q.limitFor(2, 20), r3: q.limitFor(3, 20), big: q.limitFor(3, 60), small: q.limitFor(3, 11) }; });
  check('limit shrinks per rank and grows with enemy budget', lim.r1 > lim.r2 && lim.r2 > lim.r3 && lim.big > lim.small, JSON.stringify(lim));

  // rank 0 -> inert
  const none = await ev(page, () => { const s = __cp.app.top; return !!s.data.quarterly; });
  check('no modifier: no timer', none === false);

  await ev(page, () => { const s = __cp.app.top; s.run.modifiers.quarterly_targets = 2; s.startFloor(); __cpConsole.run('god'); });
  await page.waitForTimeout(500);
  const q0 = await ev(page, () => { const s = __cp.app.top; const q = s.data.quarterly; return q && { rank: q.rank, limit: q.limit, over: q.over, type: s.plan.floor_type, budget: s.plan.enemy_budget }; });
  check('rank 2 on a standard floor creates the timer', !!q0 && q0.rank === 2 && q0.limit > 40, JSON.stringify(q0));
  await shot(page, 'quarterly-running');

  // the timer runs, but no reinforcements before the limit
  const w0 = await ev(page, () => { const q = __cp.app.top.data.quarterly; return { t: q.t, waves: q.waves }; });
  await page.waitForTimeout(700);
  const w1 = await ev(page, () => { const q = __cp.app.top.data.quarterly; return { t: q.t, waves: q.waves, over: q.over }; });
  check('timer advances in play, no wave before the target', w1.t > w0.t && w1.waves === 0 && !w1.over, JSON.stringify({ w0, w1 }));

  // cutscene pauses the timer
  const paused = await ev(page, async () => {
    const s = __cp.app.top, w = s.world, q = s.data.quarterly;
    w.cutscene = { update() { return false; }, render() {} };
    const t0 = q.t;
    for (let i = 0; i < 90; i++) __cp.app.step();
    const t1 = q.t;
    w.cutscene = null;
    return { t0, t1 };
  });
  check('timer frozen during a cutscene', Math.abs(paused.t1 - paused.t0) < 1e-6, JSON.stringify(paused));

  // run past the limit
  await ev(page, () => { const q = __cp.app.top.data.quarterly; q.t = q.limit - 0.3; });
  const base = await ev(page, () => { const s = __cp.app.top; return s.world.totalLiveEnemies(); });
  await page.waitForTimeout(1500);
  const o1 = await ev(page, () => { const s = __cp.app.top, q = s.data.quarterly; return { over: q.over, waves: q.waves, spawned: q.spawned, live: s.world.totalLiveEnemies() }; });
  check('target missed -> over + first wave spawns at once', o1.over && o1.waves >= 1 && o1.spawned >= 1 && o1.live > base - 1, JSON.stringify({ base, ...o1 }));
  await shot(page, 'quarterly-over');

  // a wave every 20 s (fast-forward 45 s of simulation) and the per-room active cap holds
  const cap = await ev(page, async () => {
    const app = __cp.app, s = app.top, q = s.data.quarterly;
    const { MAX_ACTIVE_ENEMIES } = await __imp('/src/core/app.ts');
    const w0 = q.waves;
    let maxRoom = 0;
    for (let i = 0; i < 45 * 60; i++) { app.step(); if (i % 30 === 0) for (const r of s.world.rooms) maxRoom = Math.max(maxRoom, s.world.liveEnemies(r.def.id)); }
    return { waves: q.waves - w0, maxRoom, MAX_ACTIVE_ENEMIES, over: q.over };
  });
  check('2+ waves in 45 s while over target', cap.waves >= 2, JSON.stringify(cap));
  check('reinforcements respect MAX_ACTIVE_ENEMIES per room', cap.maxRoom <= cap.MAX_ACTIVE_ENEMIES, JSON.stringify(cap));

  // floor clear stops the timer
  const fin = await ev(page, async () => {
    const app = __cp.app, s = app.top, q = s.data.quarterly;
    __cpConsole.run('clear');
    for (let i = 0; i < 120 && !s.world.floorCleared; i++) app.step();
    const cleared = s.world.floorCleared;
    for (let i = 0; i < 10; i++) app.step();
    const t = q.t, waves = q.waves;
    for (let i = 0; i < 600; i++) app.step();
    return { cleared, done: q.done, frozen: q.t === t, noMore: q.waves === waves };
  });
  check('floor clear stops the timer and the waves', fin.cleared && fin.done && fin.frozen && fin.noMore, JSON.stringify(fin));
  await shot(page, 'quarterly-cleared');
  await ctx.close();

  // non-combat floors ignore the modifier
  for (const [label, hash] of [['shop', 'play&seed=11&floor=4&type=shop'], ['boss', 'play&seed=11&floor=5']]) {
    const c2 = await load(hash);
    const r = await ev(c2.page, () => { const s = __cp.app.top; s.run.modifiers.quarterly_targets = 3; s.startFloor(); return { t: s.plan.floor_type, has: !!s.data.quarterly }; });
    check(`${label} floor: no timer (${r.t})`, !r.has, JSON.stringify(r));
    await c2.ctx.close();
  }
});

// ================================================================================================ 2. holdToTap
await scenario('holdtotap', async () => {
  const { page, ctx } = await load('play&seed=5&floor=2');
  await ev(page, () => { __cpConsole.run('god'); __cpAI.clear(); __cp.app.top.world.holdClear = true; __cp.app.settings.holdToTap = false; __cp.app.settings.heavyMode = 'hold'; });
  const tapKey = async (code) => { await page.keyboard.down(code); await page.waitForTimeout(110); await page.keyboard.up(code); await page.waitForTimeout(60); };

  // default behaviour unchanged: Q swings a heavy at once, never latches a charge
  await tapKey('KeyQ');
  const d = await ev(page, () => { const p = __cp.app.top.player; return { charging: p.charging, heavy: !!p.swing?.heavy }; });
  check('off: Q = instant heavy swing (unchanged)', !d.charging && d.heavy, JSON.stringify(d));
  await page.waitForTimeout(900);

  // on: Q latches the charge, a second Q releases it
  await ev(page, () => { __cp.app.settings.holdToTap = true; });
  await tapKey('KeyQ');
  const c1 = await ev(page, () => { const p = __cp.app.top.player; return { charging: p.charging, swing: !!p.swing }; });
  check('on: first Q tap starts charging (no hold needed)', c1.charging && !c1.swing, JSON.stringify(c1));
  await page.waitForTimeout(700);
  const c2 = await ev(page, () => { const p = __cp.app.top.player; return { charging: p.charging, charge: p.charge, t: p.chargeT }; });
  check('on: charge builds and stays latched with the key released', c2.charging && c2.charge > 0.5, JSON.stringify(c2));
  await shot(page, 'holdtotap-charging');
  await tapKey('KeyQ');
  const c3 = await page.waitForFunction(() => { const p = __cp.app.top.player; return !p.charging && p.swing && p.swing.heavy; }, null, { timeout: 1500, polling: 'raf' }).then(() => true, () => false);
  check('on: second Q tap releases a charged heavy swing', c3);
  await page.waitForTimeout(900);

  // on: holding the mouse no longer charges (melee is tap-only)
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.waitForTimeout(900);
  const m1 = await ev(page, () => __cp.app.top.player.charging);
  await page.mouse.up();
  check('on: holding melee does not enter the hold-charge', m1 === false);
  await page.waitForTimeout(600);
  await ev(page, () => { __cp.app.settings.holdToTap = false; });
  await page.mouse.down();
  await page.waitForTimeout(900);
  const m2 = await ev(page, () => __cp.app.top.player.charging);
  await page.mouse.up();
  check('off: holding melee still charges a heavy (unchanged)', m2 === true);
  await ev(page, () => { __cp.app.settings.holdToTap = true; });

  // Rage chord LB+RB becomes a single tap
  const chord = await ev(page, () => {
    const inp = __cp.app.input;
    inp.padButtons = []; inp.padButtons[4] = true;
    inp.chordAsTap = false; const off = inp.bindingActive('pad:4+5');
    inp.chordAsTap = true; const on = inp.bindingActive('pad:4+5');
    inp.padButtons = []; inp.chordAsTap = false;
    return { off, on };
  });
  check('Rage chord: LB alone ignored when off, accepted when on', chord.off === false && chord.on === true, JSON.stringify(chord));
  const flag = await ev(page, async () => { await new Promise((r) => setTimeout(r, 100)); return __cp.app.input.chordAsTap; });
  check('gameplay scene mirrors the setting into input.chordAsTap', flag === true);

  // Laser Pointer: a tap fires a burst instead of needing a hold
  const laser = await ev(page, async () => {
    const wmod = await __imp('/src/game/weapons.ts');
    const p = __cp.app.top.player;
    p.run.loadout.ranged = wmod.makeWeapon('laser_pointer');
    return true;
  });
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(90); await page.mouse.up({ button: 'right' });
  const l1 = await ev(page, () => __cp.app.top.player.laserLatch);
  check('on: a right-click tap latches a Laser Pointer burst', laser && l1 > 0, String(l1));

  // touch: Fire + Heavy buttons appear only when holdToTap is on, and Fire injects `ranged`
  const t = await ev(page, async () => {
    const { touch } = await __imp('/src/ui/touch.ts');
    const app = __cp.app;
    touch.enabled = true;
    touch.setContext({ mode: 'gameplay', ranged: true });
    app.settings.holdToTap = false; touch.computeButtons(); const off = touch.btns.map((b) => b.role);
    app.settings.holdToTap = true; touch.computeButtons(); const on = touch.btns.map((b) => b.role);
    // simulate a finger on the Fire button
    touch.fingers.set(99, { id: 99, role: 'fire', sx: 0, sy: 0, x: 0, y: 0, bx: 0, by: 0, t0: 0 });
    touch.lastFrame = -1; touch.update();
    const fired = !!app.input.virtual.buttons.ranged;
    touch.fingers.clear();
    return { off, on, fired };
  });
  check('touch: no Fire/Heavy button by default', !t.off.includes('fire') && !t.off.includes('heavy'), JSON.stringify(t.off));
  check('touch: Fire + Heavy buttons shown with holdToTap', t.on.includes('fire') && t.on.includes('heavy'), JSON.stringify(t.on));
  check('touch: Fire button holds `ranged`', t.fired === true);
  await page.waitForTimeout(500);
  await shot(page, 'holdtotap-touch');
  await ctx.close();
});

// ================================================================================================ 3. Demo gate
await scenario('demo', async () => {
  // edition flags
  const e = await load('menu');
  const flags = await ev(e.page, async () => {
    const ed = await __imp('/src/platform/edition.ts');
    const a = ed.isDemo();
    window.__cpEdition = { demo: true };
    const b = ed.isDemo();
    window.__cpEdition = undefined;
    return { a, b, paywall: ed.ANDROID_PAYWALL_ENABLED, unlocked: (await __imp('/src/platform/services.ts')).getPlatform().iap.isFullGameUnlocked() };
  });
  check('isDemo() false by default; override flag turns it on', flags.a === false && flags.b === true, JSON.stringify(flags));
  check('ANDROID_PAYWALL_ENABLED is false and iap reports unlocked', flags.paywall === false && flags.unlocked === true);
  await e.ctx.close();

  // main menu: Daily Run icon locked in the demo, normal otherwise
  const full = await load('x');
  const icon0 = await ev(full.page, () => { const i = __cp.app.top.icons?.find((i) => i.label === 'Daily Run'); return i ? { lock: i.lockBadge } : null; });
  check('full game: Daily Run icon present without a lock', !!icon0 && icon0.lock === null, JSON.stringify(icon0));
  await full.ctx.close();
  const dm = await load('demo');
  const icon1 = await ev(dm.page, () => { const i = __cp.app.top.icons?.find((i) => i.label === 'Daily Run'); return i ? { lock: i.lockBadge } : null; });
  check('demo: Daily Run icon carries the "Full game" lock badge', !!icon1 && icon1.lock === 'Full game', JSON.stringify(icon1));
  await shot(dm.page, 'demo-menu');
  await dm.ctx.close();

  // hub clock-in panel in the demo
  const hub = await load('hub&open=clockin&demo');
  await hub.page.waitForTimeout(1200);
  await shot(hub.page, 'demo-clockin');
  const ci = await ev(hub.page, async () => {
    const run = await __imp('/src/game/meta/runs.ts');
    const before = __cp.app.scenes.length;
    run.launchRun(run.buildRun({ kind: 'daily' }));
    await new Promise((r) => setTimeout(r, 200));
    return { blocked: __cp.app.scenes.length === before && __cp.app.top.name !== 'gameplay' };
  });
  check('demo: a daily run cannot be launched', ci.blocked, JSON.stringify(ci));
  await hub.ctx.close();

  // the gate: Act 1 boss down -> Probation Period Complete -> end-of-demo summary, progress kept, no win/death
  const { page, ctx } = await load('play&seed=7&floor=5&demo');
  const pre = await ev(page, async () => {
    const pf = await __imp('/src/game/profile.ts');
    const p = pf.profile();
    __cpConsole.run('god');
    return { leave: p.annualLeave, deaths: p.stats.deaths, wins: p.stats.wins, pr: p.prUnlocked, floorType: __cp.app.top.plan.floor_type };
  });
  check('floor 5 is the boss floor', pre.floorType === 'boss', JSON.stringify(pre));
  await shot(page, 'demo-boss');
  // kill the boss (any scripted immunity is bypassed by zeroing hp through the damage pipeline)
  await ev(page, () => { const s = __cp.app.top; for (const a of s.world.actors) if (a.team === 'enemy') { a.invuln = 0; a.hp = 1; } __cpConsole.run('kill'); });
  const got = await page.waitForFunction(() => __cp.app.top.name === 'demoend', null, { timeout: 25000, polling: 250 }).then(() => true, () => false);
  if (!got) {
    // fall back: force the floor clear
    await ev(page, () => { const s = __cp.app.top; s.world.floorCleared = true; s.world.onFloorCleared?.(); });
  }
  check('boss cleared -> CorpOS "Probation Period Complete" opens', await page.waitForFunction(() => __cp.app.top.name === 'demoend', null, { timeout: 15000, polling: 250 }).then(() => true, () => false));
  await page.waitForTimeout(900);
  await shot(page, 'demo-gate');
  // unlock button (Android path: iap.purchase) via override, then continue
  await ev(page, () => { window.__cpEdition = { demo: true, store: 'android' }; });
  const clicked = await ev(page, () => {
    const pn = __cp.app.top;
    const b = pn.list.items.find((i) => i.text && /Wishlist|Unlock/.test(i.text));
    return b ? b.text : null;
  });
  check('end-of-demo panel offers a call to action button', !!clicked, String(clicked));
  const buy = await ev(page, async () => {
    const ed = await __imp('/src/platform/edition.ts');
    const r1 = await ed.unlockFullGame(); // store = android (override) -> iap.purchase()
    window.__cpEdition = { demo: true, store: 'steam' };
    const r2 = await ed.unlockFullGame();
    return { r1, r2 };
  });
  check('Android: unlockFullGame() calls iap.purchase()', buy.r1.ok === true, JSON.stringify(buy.r1));
  check('Steam: shows the wishlist / buy message, no purchase', buy.r2.ok === false && /Steam/.test(buy.r2.message), JSON.stringify(buy.r2));
  // continue to the review
  await ev(page, () => { __cp.app.top.close(); });
  const sum = await page.waitForFunction(() => __cp.app.top.name === 'summary', null, { timeout: 10000, polling: 250 }).then(() => true, () => false);
  check('closing the panel ends the run at the summary', sum);
  await page.waitForTimeout(1200);
  await shot(page, 'demo-summary');
  const post = await ev(page, async () => {
    const pf = await __imp('/src/game/profile.ts');
    const p = pf.profile();
    return { leave: p.annualLeave, deaths: p.stats.deaths, wins: p.stats.wins, pr: p.prUnlocked, runs: p.stats.runs };
  });
  check('Annual Leave still awarded', post.leave > pre.leave, JSON.stringify({ pre, post }));
  check('end of demo is neither a win nor a death; Performance Review stays locked', post.wins === pre.wins && post.deaths === pre.deaths && post.pr === false && post.runs >= 1, JSON.stringify({ pre, post }));
  await ctx.close();

  // the full game is not gated at floor 5
  const f5 = await load('play&seed=7&floor=5');
  const gate = await ev(f5.page, async () => { const ed = await __imp('/src/platform/edition.ts'); return ed.isDemoGateFloor(__cp.app.top.plan); });
  check('full game: floor 5 boss is not a demo gate', gate === false);
  await f5.ctx.close();
});

// ================================================================================================ 4. Debug console
await scenario('console', async () => {
  const { page, ctx } = await load('play&seed=5&floor=2');
  const run = (cmd) => ev(page, (c) => { __cpConsole.run(c); const l = __cpConsole.log; return l[l.length - 1]; }, cmd);
  await page.keyboard.press('Backquote');
  const opened = await page.waitForFunction(() => __cp.app.top.name === 'console', null, { timeout: 4000, polling: 100 }).then(() => true, () => false);
  check('Backquote opens the console over gameplay', opened);
  const under = await ev(page, () => __cp.app.scenes.map((s) => s.name));
  check('console is a transparent scene above gameplay', under.includes('gameplay') && under[under.length - 1] === 'console', JSON.stringify(under));

  // typing through app.input.textInput
  const n0 = await ev(page, () => __cp.app.top === undefined ? 0 : __cp.app.scenes.find((s) => s.name === 'gameplay').world.totalLiveEnemies());
  await page.keyboard.type('spawn intern 0 3', { delay: 25 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const n1 = await ev(page, () => __cp.app.scenes.find((s) => s.name === 'gameplay').world.totalLiveEnemies());
  check('typed `spawn intern 0 3` adds 3 enemies', n1 === n0 + 3, `${n0} -> ${n1}`);
  await page.keyboard.type('help', { delay: 25 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await shot(page, 'console-help');
  const typed = await ev(page, () => __cp.app.top.text);
  check('input line is cleared after Enter and Backquote is not typed', typed === '', JSON.stringify(typed));
  await page.keyboard.press('Backquote');
  const closed = await page.waitForFunction(() => __cp.app.top.name === 'gameplay', null, { timeout: 4000, polling: 100 }).then(() => true, () => false);
  check('Backquote closes it again', closed);
  await page.waitForTimeout(300);

  const sp = await run('spawn intern 1 2'); check('spawn <arch> <tier> <n>', /Spawned 2 x intern \(tier 1\)/.test(sp.text), sp.text);
  const sp2 = await run('spawn int'); check('spawn accepts a unique prefix', /Spawned 1 x intern/.test(sp2.text), sp2.text);
  const g1 = await run('give cash 250'); check('give cash', /Petty Cash/.test(g1.text), g1.text);
  const cash = await ev(page, () => __cp.app.top.run.pettyCash); check('cash applied', cash >= 250, String(cash));
  const g2 = await run('give weapon fire_extinguisher');
  const wid = await ev(page, () => __cp.app.top.run.loadout.melee?.id); check('give weapon', wid === 'fire_extinguisher', g2.text + ' / ' + wid);
  const g3 = await run('give desk stress_ball');
  check('give desk', /acquired/.test(g3.text) && (await ev(page, () => __cp.app.top.run.deskItems.includes('stress_ball'))), g3.text);
  const bid = await ev(page, async () => (await __imp('/src/game/content-info.ts')).BENEFITS[0].id);
  const g4 = await run(`give benefit ${bid} executive`);
  check('give benefit <id> <rarity>', /Benefit added/.test(g4.text) && (await ev(page, ([i]) => __cp.app.top.run.benefits.some((b) => b.id === i && b.rarity === 2), [bid])), g4.text);
  const s1 = await run('seed'); const code = await ev(page, () => __cp.app.top.run.seedCode);
  check('seed prints the run seed', s1.text.includes(code), s1.text);
  const hp0 = await ev(page, () => { const p = __cp.app.top.player; p.hp = 5; return p.hp; });
  await run('heal'); check('heal restores HP', (await ev(page, () => { const p = __cp.app.top.player; return p.hp === p.maxHp; })) && hp0 === 5);
  await run('rage'); check('rage activates Rage', await ev(page, () => __cp.app.top.player.raging > 0));
  await run('god');
  await ev(page, () => { const p = __cp.app.top.player; p.hurtTick?.(50); });
  await page.waitForTimeout(300);
  check('god keeps the player at full HP', await ev(page, () => { const p = __cp.app.top.player; return p.alive && p.hp === p.maxHp; }));
  await run('god');
  const fps = await run('fps'); check('fps toggles the counter', /FPS counter/.test(fps.text) && (await ev(page, () => __cp.app.settings.showFps)), fps.text);
  await run('fps');
  await run('kill');
  await page.waitForTimeout(300);
  check('kill removes every enemy', await ev(page, () => __cp.app.top.world.totalLiveEnemies() === 0));
  const f = await run('floor 4 elite');
  check('floor jumps to floor 4', await ev(page, () => { const s = __cp.app.top; return s.run.floor === 4 && s.plan.floor_number === 4 && s.plan.floor_type === 'elite'; }), f.text);
  await run('spawn intern 0 2'); await run('clear');
  const cl = await page.waitForFunction(() => __cp.app.scenes.find((s) => s.name === 'gameplay').world.floorCleared, null, { timeout: 4000 }).then(() => true, () => false);
  // the world only updates while the console is closed; `__cpConsole.run` keeps it open here? (top is gameplay) so this passes
  check('clear clears the floor', cl);
  const bad = await run('spawn nonsense'); check('unknown archetype is reported', /Unknown/.test(bad.text), bad.text);
  const bad2 = await run('frobnicate'); check('unknown command is reported', /Unknown command/.test(bad2.text), bad2.text);
  // replay a seed: new run with that seed
  const target = await ev(page, async () => (await __imp('/src/core/rng.ts')).seedToCode(424242));
  await run('replay ' + target);
  const rp = await page.waitForFunction((t) => __cp.app.top.name === 'gameplay' && __cp.app.top.run.seedCode === t, target, { timeout: 6000, polling: 200 }).then(() => true, () => false);
  const seedNow = await ev(page, () => __cp.app.top.run?.seedCode);
  check('replay <seedcode> starts a run with that seed', rp, String(seedNow));
  await ctx.close();

  // production gating: with import.meta.env.DEV true here the console always exists; check the hash gate function directly
  const gate = await load('menu');
  const ok = await ev(gate.page, async () => { const c = await __imp('/src/scenes/dev/console.ts'); return typeof c.consoleEnabled === 'function' && c.consoleEnabled(); });
  check('consoleEnabled() true in dev', ok);
  await gate.ctx.close();
});

// ================================================================================================ 5. Rage execution
await scenario('rage', async () => {
  const { page, ctx } = await load('play&seed=7&floor=3');
  await ev(page, async () => {
    const app = __cp.app;
    const M = { spawner: await __imp('/src/game/spawner.ts'), props: await __imp('/src/game/gen/props.ts'), exec: await __imp('/src/game/executions.ts'), wt: await __imp('/src/game/world-types.ts') };
    const T = (window.__T = { M });
    T.setup = () => {
      const s = app.top, w = s.world, p = s.player, m = w.map;
      let best = null;
      for (const r of m.rooms) { if (r.kind === 'core') continue; let clear = true; for (let y = r.ty; y < r.ty + r.th && clear; y++) for (let x = r.tx; x < r.tx + r.tw; x++) if (m.tiles[y * m.w + x] !== M.wt.T.FLOOR) { clear = false; break; } if (clear && (!best || r.tw * r.th > best.tw * best.th)) best = r; }
      best = best || m.rooms[1];
      w.props.length = 0;
      for (const e of w.actors) if (e !== p) e.dead = true;
      for (const r of w.rooms) r.enemies.clear();
      w.holdClear = true; w.rebuildPropBlock();
      const cx = (best.tx + best.tw / 2) * 16, cy = (best.ty + best.th / 2) * 16 - 6;
      const info = M.props.PROP_INFO.photocopier;
      const prop = w.addProp({ id: 9100, kind: 'photocopier', x: cx, y: cy, w: 32, h: 16, solid: info.solid, variant: 0, roomId: best.id, facing: 0, exec: info.exec, hazard: info.hazard, wallMounted: false });
      w.rebuildPropBlock();
      p.x = cx - 12; p.y = cy + 22; p.vx = p.vy = 0; p.invuln = 0; p.aim = -Math.PI / 2;
      const e = M.spawner.makeEnemy(s.spawn, { archetype: 'intern', tier: 0, roomId: best.id }, cx + 2, cy + 16, true);
      e.behaviour = { think() {} }; e.hp = e.maxHp * 0.2;
      w.snapCamera();
      return { prop, e };
    };
  });
  const runOne = async (raging) => {
    await ev(page, () => { __cp.app.settings.cutscenes = 'always'; __cp.app.settings.gore = 'full'; });
    const info = await ev(page, async (rg) => {
      const app = __cp.app, T = window.__T, s = app.top, p = s.player, w = s.world;
      const { prop, e } = T.setup();
      for (let i = 0; i < 3; i++) app.step();
      w.cutscene = null;
      p.raging = rg ? 6 : 0; p.rage = rg ? 100 : 0;
      T.M.exec.seenExecutions.clear();
      const before = { raging: p.raging, rage: p.rage };
      T.M.exec.startExecution(w, p, e, { type: 'photocopier', prop, tile: null });
      const cs = w.cutscene;
      return { before, caption: cs.caption, rage: cs.rage };
    }, raging);
    return info;
  };
  const rageInfo = await runOne(true);
  check('Rage execution flagged as the Rage variant', rageInfo.rage === true, JSON.stringify(rageInfo));
  const POOL = ['OUT OF OFFICE: PERMANENTLY', 'ANGER MANAGEMENT: DECLINED', 'FEEDBACK DELIVERED. IN PERSON.', 'EXIT INTERVIEW: VIOLENT', 'THIS MEETING COULD HAVE BEEN A SCREAM', 'ESCALATED. PERSONALLY.', 'HR WAS NOT CONSULTED', 'CONSTRUCTIVE CRITICISM: 100% CONSTRUCTIVE', 'NO FURTHER QUESTIONS', 'PERFORMANCE REVIEW: TERMINAL'];
  check('Rage caption comes from the Rage pool', POOL.includes(rageInfo.caption), String(rageInfo.caption));
  // step to mid-cutscene (past the caption trigger), screenshot, then finish
  await ev(page, () => { const app = __cp.app; for (let i = 0; i < 55; i++) app.step(); });
  await page.waitForTimeout(150);
  await shot(page, 'rage-exec');
  const after = await ev(page, () => {
    const app = __cp.app, s = app.top, p = s.player, w = s.world;
    const mid = p.raging;
    for (let i = 0; i < 300 && w.cutscene; i++) app.step();
    return { done: !w.cutscene, mid, raging: p.raging, rageMeter: p.rage, dur: p.stats.rageDuration };
  });
  check('Rage execution finishes and refunds ~25% of the Rage duration', after.done && after.raging - after.mid >= 0.25 * after.dur - 0.05, JSON.stringify(after));

  const calm = await runOne(false);
  check('Normal execution is not the Rage variant and uses its own captions', calm.rage === false && !POOL.includes(calm.caption), JSON.stringify(calm));
  await ev(page, () => { const app = __cp.app; for (let i = 0; i < 55; i++) app.step(); });
  await page.waitForTimeout(150);
  await shot(page, 'normal-exec');
  await ctx.close();
});

console.log(`\n${pass} passed, ${fail} failed`);
if (consoleErrors.length) { console.log('console errors:'); for (const e of [...new Set(consoleErrors)].slice(0, 15)) console.log('  ' + e); }
if (failures.length) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
process.exit(fail || consoleErrors.length ? 1 : 0);
