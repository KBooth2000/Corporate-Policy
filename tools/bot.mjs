// QA bot: plays runs headlessly. node tools/bot.mjs [seed] [maxFloor] [god=1] [seconds]
// Reports floors reached, deaths, console errors, softlocks (no progress for N seconds).
import { chromium } from 'playwright-core';
const [,, seed = '777', maxFloor = '20', god = '1', seconds = '240', startFloor = '1'] = process.argv;
const URL = (process.env.URL || 'http://localhost:5173/') + `#play&seed=${seed}&floor=${startFloor}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL);
await page.waitForTimeout(1500);
await page.evaluate(({ god, speed }) => {
  const W = window;
  const st = (W.__botState = { floors: [], deaths: 0, lastProgress: performance.now(), lastFloor: 0, stuckEvents: [], log: [] });
  const keys = new Set(); const prev = new Set();
  const press = (a) => keys.add(a);
  W.__cpBot = (c, s) => {
    const { world: w, player: p } = s;
    prev.clear(); for (const k of keys) prev.add(k); keys.clear();
    c.pressed = (a) => keys.has(a) && !prev.has(a);
    c.down = (a) => keys.has(a);
    c.released = (a) => !keys.has(a) && prev.has(a);
    c.held = (a) => (keys.has(a) ? 0.05 : 0);
    c.assist = 0.8; c.aimPoint = null;
    if (god) { p.hp = Math.max(p.hp, p.maxHp * 0.5); }
    if (s.run.floor !== st.lastFloor) { st.lastFloor = s.run.floor; st.floors.push({ floor: s.run.floor, type: s.plan.floor_type, t: performance.now() }); st.lastProgress = performance.now(); }
    const TILE = 16;
    // dodge telegraphs
    for (const t of w.telegraphs) {
      const sh = t.shape; const d = Math.hypot(sh.x - p.x, sh.y - p.y);
      if (t.dur - t.t < 0.2 && d < (sh.r || sh.len || 40) + 10 && p.dashCharges >= 1 && Math.random() < 0.5) {
        const a = Math.atan2(p.y - sh.y, p.x - sh.x); c.move = { x: Math.cos(a), y: Math.sin(a) }; press('dash'); return;
      }
    }
    const bfs = (tx, ty) => {
      const mw = w.map.w, mh = w.map.h, start = Math.floor(p.y / TILE) * mw + Math.floor(p.x / TILE), goal = ty * mw + tx;
      const prevA = new Int32Array(mw * mh).fill(-1); const q = [start]; prevA[start] = start;
      while (q.length) { const cur = q.shift(); if (cur === goal) break; const cx = cur % mw, cy = (cur / mw) | 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue; const ni = ny * mw + nx; if (prevA[ni] >= 0) continue; if (w.isSolidTile(nx, ny) || w.propBlock[ni]) { if (ni !== goal) continue; } prevA[ni] = cur; q.push(ni); } }
      if (prevA[goal] < 0) return null;
      let cur = goal, steps = 0; const path = [];
      while (cur !== start && steps++ < 4000) { path.push(cur); cur = prevA[cur]; }
      const nxt = path[Math.max(0, path.length - 2)] ?? goal;
      return { x: (nxt % mw + 0.5) * TILE, y: (((nxt / mw) | 0) + 0.5) * TILE };
    };
    const goTo = (x, y) => {
      const wp = bfs(Math.floor(x / TILE), Math.floor(y / TILE)) || { x, y };
      const dx = wp.x - p.x, dy = wp.y - p.y, l = Math.hypot(dx, dy) || 1; c.move = { x: dx / l, y: dy / l };
    };
    if (w.cutscene) { c.move = { x: 0, y: 0 }; return; }
    if (p.grabbing) { if (p.execCandidate) press('interact'); else press('ranged'); return; }
    if (p.rage >= 100 && p.raging <= 0 && w.inCombat) press('rage');
    let target = null, bd = 1e9;
    for (const a of w.actors) { if (a.team !== 'enemy' || !a.alive || a.grabbedBy) continue; const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < bd) { bd = d; target = a; } }
    if (target) {
      c.aimDir = { x: target.x - p.x, y: target.y - 12 - p.y + 12 };
      if (p.grabCandidate && Math.random() < 0.3) { press('grab'); return; }
      if (bd < 26) { if (!prev.has('melee')) press('melee'); c.move = { x: 0, y: 0 }; }
      else { goTo(target.x, target.y); if (bd < 160 && s.run.loadout.ranged?.ammo > 0 && Math.random() < 0.3) press('ranged'); }
      return;
    }
    // pick up nearby reward/weapon/interactables (rewards first)
    const its = w.interactables.filter((i) => i.enabled());
    const reward = its.find((i) => i.priority === 1);
    if (reward) { if (Math.hypot(reward.x - p.x, reward.y - p.y) < 14) press('interact'); else goTo(reward.x, reward.y); return; }
    if (!w.floorCleared) {
      // walk to the nearest uncleared room
      let best = null, bdd = 1e9;
      for (const r of w.rooms) { if (r.cleared || r.def.kind === 'core') continue; const cx = (r.def.tx + r.def.tw / 2) * TILE, cy = (r.def.ty + r.def.th / 2) * TILE; const d = Math.hypot(cx - p.x, cy - p.y); if (d < bdd) { bdd = d; best = { x: cx, y: cy }; } }
      if (best) goTo(best.x, best.y); else c.move = { x: 0, y: 0 };
      return;
    }
    // exits: prefer stairs
    const exits = its.filter((i) => i.priority === 2);
    const ex = exits.find((i) => i.label.includes('stairs')) || exits[0];
    if (ex) { if (Math.hypot(ex.x - p.x, ex.y - p.y) < 16) press('interact'); else goTo(ex.x, ex.y); }
  };
  // fast-forward simulation
  setInterval(() => { for (let i = 0; i < speed; i++) W.__cp.app.step(); }, 16);
}, { god: god === '1', speed: 3 });
const t0 = Date.now();
let last = '';
while ((Date.now() - t0) / 1000 < +seconds) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => { const a = window.__cp.app; const top = a.top; return { scene: top?.name, floor: top?.run?.floor, type: top?.plan?.floor_type, hp: top?.player ? Math.round(top.player.hp) : null, enemies: top?.world?.totalLiveEnemies?.(), cleared: top?.world?.floorCleared, rooms: top?.world?.rooms?.filter(r=>!r.cleared).length, kills: top?.run?.log?.kills }; });
  const line = JSON.stringify(s);
  console.log(Math.round((Date.now() - t0) / 1000) + 's', line);
  if (line === last) { console.log('!! no change in 5s'); await page.screenshot({ path: `scratch/bot-stuck-${Date.now()}.png` }); }
  last = line;
  if (s.floor >= +maxFloor && s.cleared) break;
  if (s.scene !== 'gameplay' && s.scene !== 'transition' && s.scene !== 'pause') { console.log('left gameplay:', s.scene); break; }
}
await page.screenshot({ path: 'scratch/bot-final.png' });
const st = await page.evaluate(() => window.__botState);
console.log('floors:', st.floors.map((f) => f.floor + ':' + f.type).join(' '));
console.log('errors:', errors.length); for (const e of errors.slice(0, 15)) console.log(e);
await browser.close();
