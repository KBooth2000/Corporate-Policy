// Boss QA driver (spec 6): quick-plays each boss floor, drives the fight through every phase with a scripted bot
// plus QA hooks (Boss.debugAdvance), grabs in stagger windows, lets one window expire, triggers the finisher,
// screenshots intro card / phases / transitions / executions / finisher / rewards (and the ending after the CEO),
// and fails on any console error.
//
//   npx vite --port 5187 &
//   node tools/boss-test.mjs [all|1|2|3|4|director] [outDir]
//
// Env: URL (default http://localhost:5187/), CHROME (chromium path), W/H viewport.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const which = process.argv[2] || 'all';
const out = process.argv[3] || 'scratch/boss-test';
mkdirSync(out, { recursive: true });
const BASE = process.env.URL || 'http://localhost:5187/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

const FLOORS = { 1: 5, 2: 10, 3: 15, 4: 20 };
let failures = 0;

async function runBoss(act) {
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
  // the dev server's HMR socket would reload the page whenever another team member saves a file mid-test
  await page.routeWebSocket(/.*/, () => { /* swallow: no HMR */ });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  const floor = FLOORS[act];
  await page.goto(`${BASE}#play&seed=1&floor=${floor}`);
  await page.waitForTimeout(2500);
  const tag = `b${act}`;
  const log = (...a) => console.log(`[boss ${act}]`, ...a);

  // in-page helpers: deterministic stepping, a bot that fights, QA state
  await page.evaluate(() => {
    const app = window.__cp.app;
    window.__t = {
      gs: () => app.scenes.find((s) => s.name === 'gameplay'),
      boss: () => window.__t.gs()?.data.boss,
      step(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) app.step(); app.draw(); },
      until(fn, max = 12) { let t = 0; while (!fn() && t < max) { for (let i = 0; i < 6; i++) app.step(); t += 0.1; } app.draw(); return fn(); },
      bot: { on: false, pressed: new Set() },
      tank() { const p = window.__t.gs().player; p.maxHp = 5000; p.hp = 5000; },
    };
    const gs = window.__t.gs();
    const p = gs.player;
    const bot = window.__t.bot;
    let f = 0;
    p.ctl = {
      move: { x: 0, y: 0 }, aimPoint: null, aimDir: null, assist: 0.5,
      pressed: (a) => { if (bot.pressed.has(a)) { bot.pressed.delete(a); return true; } return false; },
      released: () => false, down: () => false, held: () => 0,
    };
    // bot brain runs every step through a tiny wrapper on world.update
    const w0 = gs.world;
    const orig = gs.update.bind(gs);
    gs.update = (dt) => {
      if (bot.on) {
        const b = window.__t.boss();
        const pl = gs.player;
        if (b && pl) {
          f++;
          const dx = b.x - pl.x, dy = b.y - pl.y, d = Math.hypot(dx, dy) || 1;
          const want = d > 46 ? 1 : d < 26 ? -1 : 0;
          const side = Math.sin(f / 40);
          pl.ctl.move = { x: (dx / d) * want - (dy / d) * side * 0.6, y: (dy / d) * want + (dx / d) * side * 0.6 };
          pl.ctl.aimDir = { x: dx / d, y: dy / d };
          if (f % 9 === 0 && d < 60) bot.pressed.add('melee');
          if (f % 97 === 0) bot.pressed.add('dash');
        }
      }
      orig(dt);
    };
    void w0;
  });

  const shot = async (name) => { await page.evaluate(() => window.__cp.app.draw()); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
  const state = () => page.evaluate(() => { const b = window.__t.boss(); const gs = window.__t.gs(); return b ? { mode: b.mode, phase: b.phase, hp: Math.round(b.hp), maxHp: b.maxHp, cut: !!gs?.world.cutscene, scene: window.__cp.app.top?.name, php: Math.round(gs.player.hp) } : { scene: window.__cp.app.top?.name }; });

  // 1) walk into the arena → intro card
  await page.evaluate(() => {
    const gs = window.__t.gs(); const b = window.__t.boss(); const w = gs.world; const p = gs.player;
    window.__t.tank();
    const r = w.map.rooms[b.cfg.arenaRoom];
    const entry = b.qaEntry ? b.qaEntry() : { x: (r.tx + 3) * 16, y: (r.ty + r.th / 2) * 16 };
    p.x = entry.x; p.y = entry.y;
    window.__t.step(0.3);
  });
  await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'intro', 3));
  await page.evaluate(() => window.__t.step(1.6));
  await shot('01-intro');
  log('intro', JSON.stringify(await state()));
  await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'fight', 6));

  const phases = await page.evaluate(() => window.__t.boss().cfg.phases);
  for (let ph = 1; ph <= phases; ph++) {
    // fight for a while with the bot
    await page.evaluate(() => { window.__t.bot.on = true; window.__t.step(2.2); });
    await shot(`${ph + 1}0-phase${ph}-fight`);
    await page.evaluate(() => window.__t.step(2.0));
    await shot(`${ph + 1}1-phase${ph}-fight-b`);
    log(`phase ${ph}`, JSON.stringify(await state()));
    await page.evaluate(() => { window.__t.bot.on = false; const b = window.__t.boss(); window.__t.until(() => b.mode === 'fight', 8); b.debugAdvance(); window.__t.step(0.25); });
    if (ph < phases) {
      await shot(`${ph + 1}2-phase${ph}-window`);
      log('window', JSON.stringify(await state()));
      if (ph === 1) {
        // grab → phase-transition execution
        await page.evaluate(() => { const gs = window.__t.gs(); const b = window.__t.boss(); const p = gs.player; p.x = b.x - 16; p.y = b.y + 6; p.startGrab(b); window.__t.step(0.6); });
        await shot(`${ph + 1}3-phase${ph}-execution`);
        await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'transition' && !!window.__t.gs().world.cutscene && window.__t.gs().world.cutscene.o?.dur > 2, 3));
      } else {
        // let the stagger window expire instead
        await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'transition', 4));
      }
      await page.evaluate(() => window.__t.step(1.3));
      await shot(`${ph + 1}4-transition-to-${ph + 1}`);
      await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'fight', 6));
      log('after transition', JSON.stringify(await state()));
    } else {
      await page.evaluate(() => window.__t.until(() => window.__t.boss().mode === 'final', 3));
      await shot(`${ph + 1}2-final-down`);
      log('final', JSON.stringify(await state()));
      await page.evaluate(() => { const gs = window.__t.gs(); const b = window.__t.boss(); const p = gs.player; p.x = b.x - 16; p.y = b.y + 6; p.startGrab(b); window.__t.step(0.9); });
      await shot('80-finisher-a');
      await page.evaluate(() => window.__t.step(0.9));
      await shot('81-finisher-b');
      await page.evaluate(() => window.__t.until(() => !window.__t.gs()?.world.cutscene, 8));
      log('after finisher', JSON.stringify(await state()));
    }
  }

  if (act < 4) {
    await page.evaluate(() => window.__t.step(2.5));
    await shot('90-rewards');
    const fin = await page.evaluate(() => { const gs = window.__t.gs(); return { cleared: gs.world.floorCleared, hold: gs.world.holdClear, leave: gs.run.flags.bossLeave, hp: gs.player.hp, bosses: gs.run.log.bossesKilled }; });
    log('rewards', JSON.stringify(fin));
    if (!fin.cleared || fin.leave !== 5) { failures++; log('FAIL: floor not cleared / leave not granted'); }
  } else {
    // ending sequence
    await page.waitForTimeout(400);
    for (const [i, sec] of [[1, 2.5], [2, 7], [3, 8], [4, 9], [5, 8], [6, 12]]) {
      await page.evaluate((s) => { const app = window.__cp.app; const n = Math.round(s * 60); for (let k = 0; k < n; k++) app.step(); app.draw(); }, sec);
      await page.screenshot({ path: `${out}/${tag}-9${i}-ending.png` });
      log('ending', i, await page.evaluate(() => window.__cp.app.top?.name));
    }
  }
  if (errors.length) { failures++; log('CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n')); }
  else log('no console errors');
  await page.close();
}

const acts = which === 'all' ? [1, 2, 3, 4] : [Number(which)];
for (const a of acts) {
  try { await runBoss(a); } catch (e) { failures++; console.log(`[boss ${a}] EXCEPTION`, e); }
}
await browser.close();
console.log(failures ? `FAILED (${failures})` : 'ALL BOSSES OK');
process.exit(failures ? 1 : 0);
