// Softlock sweep: for many seeds x floors, load the floor and check every enemy and every exit is reachable
// from the player spawn (doors treated as open). node tools/reach-test.mjs [seeds=10]
import { chromium } from 'playwright-core';
const N = +(process.argv[2] || 10);
const URL = process.env.URL || 'http://localhost:5199/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(URL + '#play&seed=1&floor=1');
await page.waitForTimeout(3000);
const res = await page.evaluate(async (N) => {
  const G = await import('/src/scenes/gameplay.ts');
  const R = await import('/src/game/run.ts');
  const app = window.__cp.app;
  const bad = []; let checked = 0;
  for (let seed = 1; seed <= N; seed++) for (let f = 1; f <= 19; f++) {
    if (f % 5 === 0) continue;
    for (const type of ['standard', 'elite']) {
      const run = R.newRun({ seed: seed * 7919, role: 'office_worker' });
      run.plan = R.planFloor(run, f, 0, { reward: 'cash', type }); run.floor = f;
      const s = new G.GameplayScene(run); s.started = true; s.startFloor();
      const w = s.world, T = 16, W = w.map.w, H = w.map.h;
      for (const d of w.doors) d.state = 'open';
      const seen = new Uint8Array(W * H); const sx = s.player.x / T | 0, sy = s.player.y / T | 0; const q = [sy * W + sx]; seen[q[0]] = 1;
      while (q.length) { const c = q.pop(); const x = c % W, y = c / W | 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const i = ny * W + nx; if (seen[i] || w.isSolidTile(nx, ny) || w.propBlock[i]) continue; seen[i] = 1; q.push(i); } }
      const near = (x, y) => { const tx = x / T | 0, ty = y / T | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (seen[(ty + dy) * W + tx + dx]) return true; return false; };
      const enemies = w.actors.filter((a) => a.team === 'enemy');
      const lost = enemies.filter((e) => !near(e.x, e.y)).map((e) => `${e.archetype}@${e.x | 0},${e.y | 0} room${e.roomId}`);
      const exits = w.map.exits.filter((e) => e.available && !near(e.x, e.y + 8)).map((e) => e.kind);
      const stuck = enemies.filter((e) => w.collides(e)).length;
      checked++;
      if (lost.length || exits.length || stuck) bad.push({ seed: seed * 7919, f, type, lost, exits, stuck });
    }
  }
  app.reset(new (class { update() {} render() {} })());
  return { checked, bad };
}, N);
console.log('floors checked:', res.checked, 'problems:', res.bad.length);
for (const b of res.bad.slice(0, 20)) console.log(JSON.stringify(b));
await browser.close();
