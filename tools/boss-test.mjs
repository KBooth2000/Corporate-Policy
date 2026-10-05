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
      /** BFS over walkable tiles (world.isSolidTile + world.propBlock) from a px point; returns a dist field. */
      flood(from) {
        const w = window.__t.gs().world, m = w.map, W = m.w;
        const d = new Int32Array(W * m.h).fill(-1);
        const sx = Math.floor(from.x / 16), sy = Math.floor(from.y / 16);
        const q = [sy * W + sx]; d[q[0]] = 0;
        while (q.length) { const c = q.shift(); const x = c % W, y = (c / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue; const n = ny * W + nx;
            if (d[n] >= 0 || w.isSolidTile(nx, ny) || w.propBlock[n]) continue; d[n] = d[c] + 1; q.push(n); } }
        return d;
      },
      reach(from, to) { const d = window.__t.flood(from); const W = window.__t.gs().world.map.w; return d[Math.floor(to.y / 16) * W + Math.floor(to.x / 16)] >= 0; },
      /** Walk the player (real movement input, no teleport) towards a px target along the BFS gradient. */
      walkTo(to) { window.__t.bot.walk = { to, field: null, t: 0 }; },
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
      if (bot.walk) {
        const wk = bot.walk, pl = gs.player, w = gs.world, W = w.map.w;
        if (!wk.field || (wk.t++ % 30) === 0) wk.field = window.__t.flood(wk.to); // dist field from the target
        const tx = Math.floor(pl.x / 16), ty = Math.floor(pl.y / 16);
        let best = null, bd = wk.field[ty * W + tx];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const v = wk.field[(ty + dy) * W + tx + dx]; if (v >= 0 && (bd < 0 || v < bd) && !(dx && dy && (wk.field[ty * W + tx + dx] < 0 || wk.field[(ty + dy) * W + tx] < 0))) { bd = v; best = [dx, dy]; } }
        const goal = best ? { x: (tx + best[0] + 0.5) * 16, y: (ty + best[1] + 0.5) * 16 } : wk.to;
        const dx = goal.x - pl.x, dy = goal.y - pl.y, dd = Math.hypot(dx, dy) || 1;
        pl.ctl.move = dd < 2 ? { x: 0, y: 0 } : { x: dx / dd, y: dy / dd };
        pl.ctl.aimDir = pl.ctl.move;
      }
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

  // 0) map checks: generator validator + flood fill from the real spawn to the boss (no teleporting)
  const chk = await page.evaluate(async (act) => {
    const { validateFloor } = await import('/src/game/gen/validate.ts');
    const gs = window.__t.gs(); const b = window.__t.boss(); const w = gs.world; const m = w.map;
    let errs = validateFloor(m);
    // the CEO's office and rooftop are deliberately sealed: phase transitions move the fight there (spec 6.5 arena changes)
    if (act === 4) errs = errs.filter((e) => !/^room [23] unreachable|room [23] spawn point unreachable|room [23] reward unreachable|room graph disconnected/.test(e));
    const doorsOk = m.doors.every((d) => d.roomA >= 0 && d.roomB >= 0);
    const r = m.rooms[b.cfg.arenaRoom];
    const target = act === 4 ? r.rewardPoint : { x: b.x, y: b.y + 4 };
    return { errs, doorsOk, reachBoss: window.__t.reach(m.spawn, target), spawn: m.spawn };
  }, act);
  log('validateFloor', chk.errs.length ? JSON.stringify(chk.errs) : 'OK', 'doors join rooms:', chk.doorsOk, 'boss reachable from spawn:', chk.reachBoss);
  if (chk.errs.length || !chk.doorsOk || !chk.reachBoss) { failures++; log('FAIL: arena map invalid / boss unreachable from spawn'); }

  // 1) walk in from the spawn (real movement) → intro card
  const walked = await page.evaluate(() => {
    const gs = window.__t.gs(); const b = window.__t.boss(); const w = gs.world;
    window.__t.tank();
    const r = w.map.rooms[b.cfg.arenaRoom];
    const entry = b.qaEntry ? b.qaEntry() : { x: (r.tx + 4) * 16, y: (r.ty + r.th / 2) * 16 };
    window.__t.walkTo(entry);
    const ok = window.__t.until(() => b.mode === 'intro', 25);
    window.__t.bot.walk = null; gs.player.ctl.move = { x: 0, y: 0 };
    return { ok, at: [Math.round(gs.player.x), Math.round(gs.player.y)], room: w.currentRoom };
  });
  log('walk-in from spawn:', JSON.stringify(walked));
  if (!walked.ok) { failures++; log('FAIL: could not walk from the spawn into the arena'); }
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
    const ex = await page.evaluate(() => { const gs = window.__t.gs(); const w = gs.world; return w.map.exits.map((e) => ({ kind: e.kind, available: e.available, reach: window.__t.reach(gs.player, { x: e.x, y: e.y }) })); });
    log('exits after the fight:', JSON.stringify(ex));
    if (!ex.length || ex.some((e) => !e.reach)) { failures++; log('FAIL: exits unreachable after the boss'); }
    if (!fin.cleared || fin.leave !== 5) { failures++; log('FAIL: floor not cleared / leave not granted'); }
  } else {
    // ending sequence
    await page.waitForTimeout(400);
    for (const [i, sec] of [[1, 2.5], [2, 7], [3, 8], [4, 9], [5, 8], [6, 12]]) {
      await page.evaluate((s) => { const app = window.__cp.app; const n = Math.round(s * 60); for (let k = 0; k < n; k++) app.step(); app.draw(); }, sec);
      await page.screenshot({ path: `${out}/${tag}-9${i}-ending.png` });
      log('ending', i, await page.evaluate(() => window.__cp.app.top?.name));
    }
    // credits run out → the run summary / hub takes over
    const after = await page.evaluate(() => { const app = window.__cp.app; for (let k = 0; k < 60 * 90 && app.top?.name === 'ending'; k++) app.step(); app.draw(); return app.top?.name; });
    await page.screenshot({ path: `${out}/${tag}-99-after-ending.png` });
    log('after ending →', after);
    if (after === 'ending') { failures++; log('FAIL: ending never finished'); }
  }
  if (errors.length) { failures++; log('CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n')); }
  else log('no console errors');
  await page.close();
}

// Optional Director boss (spec 6.6): only in PROMOTION_MODE 'full' (dev override) with a Director on the roster.
async function runDirector() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.addInitScript(() => { window.__cpPromotionMode = 'full'; });
  await page.goto(`${BASE}#play&seed=3&floor=7&type=director`);
  await page.waitForTimeout(2500);
  const log = (...a) => console.log('[director]', ...a);
  const res = await page.evaluate(async () => {
    const prof = await import('/src/game/profile.ts');
    const chars = await import('/src/art/characters.ts');
    const rng = await import('/src/core/rng.ts');
    const p = prof.profile();
    const look = chars.rollLook({ kind: 'enemy', archetype: 'team_leader', tier: 2 }, new rng.Rng(77));
    p.promoted.push({ id: 'qa-dir', name: 'Derek Hollis', title: 'Head of Synergy', archetype: 'team_leader', rank: 4, look, strengths: ['bruiser'], weakness: 'decaf', weaknessKnown: false, kills: [{ floor: 7, weapon: 'stapler', method: 'ranged', at: Date.now() }, { floor: 9, weapon: 'clipboard', method: 'melee', at: Date.now() }], createdAt: Date.now() });
    const app = window.__cp.app;
    const gs = app.scenes.find((x) => x.name === 'gameplay');
    gs.startFloor();
    const b = gs.data.boss;
    if (!b) return { ok: false, why: 'no director spawned' };
    gs.player.maxHp = gs.player.hp = 5000;
    const room = gs.world.map.rooms[b.arena];
    // walk into the director's office
    gs.player.x = room.rewardPoint.x - 40; gs.player.y = room.rewardPoint.y + 30;
    for (let i = 0; i < 60; i++) app.step();
    return { ok: true, mode: b.mode, room: room.kind };
  });
  log(JSON.stringify(res));
  if (!res.ok) { failures++; await page.close(); return; }
  await page.evaluate(() => { const app = window.__cp.app; for (let i = 0; i < 90; i++) app.step(); app.draw(); });
  await page.screenshot({ path: `${out}/dir-01-intro.png` });
  const st = await page.evaluate(() => {
    const app = window.__cp.app; const gs = app.scenes.find((x) => x.name === 'gameplay'); const b = gs.data.boss; const p = gs.player;
    const step = (s) => { for (let i = 0; i < s * 60; i++) app.step(); };
    const until = (f, s) => { let t = 0; while (!f() && t < s) { step(0.1); t += 0.1; } };
    until(() => b.mode === 'fight', 6);
    step(2);
    const out = [b.mode];
    gs.world.damage(b, { amount: b.hp, type: 'blunt', method: 'melee', source: p }); step(0.2); out.push(b.mode);
    p.x = b.x - 14; p.y = b.y + 4; p.startGrab(b); step(1.4); out.push(b.mode);
    until(() => b.mode === 'fight', 6); out.push(b.mode, b.phase);
    step(2); app.draw();
    return out;
  });
  log('phases', JSON.stringify(st));
  await page.screenshot({ path: `${out}/dir-02-phase2.png` });
  const fin = await page.evaluate(() => {
    const app = window.__cp.app; const gs = app.scenes.find((x) => x.name === 'gameplay'); const b = gs.data.boss; const p = gs.player;
    const step = (s) => { for (let i = 0; i < s * 60; i++) app.step(); };
    gs.world.damage(b, { amount: b.hp, type: 'blunt', method: 'melee', source: p }); step(0.2);
    const m = b.mode;
    p.x = b.x - 14; p.y = b.y + 4; p.startGrab(b); step(0.8); app.draw();
    return m;
  });
  await page.screenshot({ path: `${out}/dir-03-finisher.png` });
  const end = await page.evaluate(() => {
    const app = window.__cp.app; const gs = app.scenes.find((x) => x.name === 'gameplay'); const b = gs.data.boss;
    for (let i = 0; i < 240; i++) app.step(); app.draw();
    return { mode: b.mode, alive: b.alive, hold: gs.world.holdClear, roster: gs.run ? 1 : 0 };
  });
  await page.screenshot({ path: `${out}/dir-04-after.png` });
  log('final', fin, JSON.stringify(end));
  if (end.alive || end.hold) { failures++; log('FAIL: director not defeated'); }
  if (errors.length) { failures++; log('CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n')); } else log('no console errors');
  await page.close();
}

/** Several seeds per boss floor: validator + spawn→boss flood fill, without fighting. */
async function sweepSeeds() {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const floor of [5, 10, 15, 20]) for (const seed of [1, 777, 4242, 90210]) {
    await page.goto('about:blank'); // a hash-only change would not reload the game
    await page.goto(`${BASE}#play&seed=${seed}&floor=${floor}`);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async (floor) => {
      const { validateFloor } = await import('/src/game/gen/validate.ts');
      const app = window.__cp.app; const gs = app.scenes.find((x) => x.name === 'gameplay'); const b = gs?.data.boss; const w = gs.world; const m = w.map;
      if (!b) return { err: 'no boss' };
      let errs = validateFloor(m);
      if (floor === 20) errs = errs.filter((e) => !/^room [23] unreachable|room [23] spawn point unreachable|room [23] reward unreachable|room graph disconnected/.test(e));
      const d = new Int32Array(m.w * m.h).fill(-1); const W = m.w; const s0 = Math.floor(m.spawn.y / 16) * W + Math.floor(m.spawn.x / 16); const q = [s0]; d[s0] = 0;
      while (q.length) { const c = q.shift(); const x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, n = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h || d[n] >= 0 || w.isSolidTile(nx, ny) || w.propBlock[n]) continue; d[n] = d[c] + 1; q.push(n); } }
      const t = floor === 20 ? m.rooms[b.cfg.arenaRoom].rewardPoint : { x: b.x, y: b.y + 4 };
      const exitsReach = m.exits.every((e) => d[Math.floor(e.y / 16) * W + Math.floor(e.x / 16)] >= 0);
      return { errs, reach: d[Math.floor(t.y / 16) * W + Math.floor(t.x / 16)] >= 0, doors: m.doors.every((dd) => dd.roomA >= 0 && dd.roomB >= 0), exitsReach };
    }, floor);
    const ok = !r.err && !r.errs.length && r.reach && r.doors && r.exitsReach;
    console.log(`[sweep] floor ${floor} seed ${seed}:`, ok ? 'OK' : 'FAIL ' + JSON.stringify(r));
    if (!ok) failures++;
  }
  if (errors.length) { failures++; console.log('[sweep] page errors', errors.slice(0, 5)); }
  await page.close();
}

const acts = which === 'all' ? ['sweep', 1, 2, 3, 4, 'director'] : [which === 'director' || which === 'sweep' ? which : Number(which)];
for (const a of acts) {
  try { if (a === 'director') await runDirector(); else if (a === 'sweep') await sweepSeeds(); else await runBoss(a); } catch (e) { failures++; console.log(`[boss ${a}] EXCEPTION`, e); }
}
await browser.close();
console.log(failures ? `FAILED (${failures})` : 'ALL BOSSES OK');
process.exit(failures ? 1 : 0);
