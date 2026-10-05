// Hazard / execution / breach QA (Playwright). Usage:
//   npx vite --port 5188 &   then   URL=http://localhost:5188/ node tools/hazard-test.mjs [filter] [--keep]
// Loads #play&seed=N&floor=F, clears the arena, adds props via world.addProp, triggers them (hitProp, thrown bodies,
// startExecution), screenshots mid-effect into scratch/hz-*.png and asserts outcomes. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5188/';
const filter = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || '';
const OUT = 'scratch';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}
const ev = (fn, arg) => page.evaluate(fn, arg);

// ---------------------------------------------------------------------------------------------------- page-side kit
const SETUP = async () => {
  const { app } = window.__cp;
  const M = {};
  // Vite appends ?t=<hmr stamp> to modules that changed since the server started: import the exact URL the game loaded,
  // otherwise we would get a second module instance (separate registries / state).
  const imp = (path) => {
    const hit = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new URL(n).pathname === path);
    return import(hit || path);
  };
  M.spawner = await imp('/src/game/spawner.ts');
  M.props = await imp('/src/game/gen/props.ts');
  M.core = await imp('/src/game/hazards/core.ts');
  M.exec = await imp('/src/game/executions.ts');
  M.pickups = await imp('/src/game/pickups.ts');
  M.wt = await imp('/src/game/world-types.ts');
  M.entity = await imp('/src/game/entity.ts');
  const orig = app.step.bind(app);
  app.step = () => {};           // we drive the simulation by hand; rendering keeps running
  let pid = 9000;
  const T = {
    app, M, orig,
    W: () => app.top.world, P: () => app.top.player, S: () => app.top,
    step(n = 1) { for (let i = 0; i < n; i++) orig(); app.draw(); },
    /** Step until predicate or max frames. Returns frames used. */
    until(pred, max = 400) { let i = 0; for (; i < max && !pred(); i++) orig(); app.draw(); return i; },
    arena() {
      const w = T.W(), m = w.map, p = T.P();
      let best = null;
      for (const r of m.rooms) {
        if (r.kind === 'core') continue;
        let clear = true;
        for (let y = r.ty; y < r.ty + r.th && clear; y++) for (let x = r.tx; x < r.tx + r.tw; x++) if (m.tiles[y * m.w + x] !== M.wt.T.FLOOR) { clear = false; break; }
        if (clear && (!best || r.tw * r.th > best.tw * best.th)) best = r;
      }
      if (!best) best = m.rooms[1];
      w.props.length = 0;
      for (const e of w.actors) if (e !== p) e.dead = true;
      for (const e of w.entities) if (e.constructor.name === 'Pickup') e.dead = true;
      for (const r of w.rooms) r.enemies.clear();
      w.holdClear = true;
      w.rebuildPropBlock();
      T.room = best;
      T.cx = (best.tx + best.tw / 2) * 16; T.cy = (best.ty + best.th / 2) * 16;
      p.x = T.cx - 60; p.y = T.cy + 30; p.vx = p.vy = 0;
      p.invuln = 0; p.hp = p.maxHp; p.shield = 0;
      w.snapCamera();
      T.step(2);
      w.cutscene = null;
      return { room: best.id, cx: T.cx, cy: T.cy };
    },
    enemy(x, y, hp = 100, arch = 'intern') {
      const w = T.W(), s = T.S();
      const e = M.spawner.makeEnemy(s.spawn, { archetype: arch, tier: 0, roomId: T.room.id }, x, y, true);
      e.behaviour = { think() {} }; e.barkRate = 0; e.hp = e.maxHp = hp; e.weapon = null;
      return e;
    },
    prop(kind, x, y, over = {}) {
      const w = T.W();
      const info = M.props.PROP_INFO[kind];
      const p = w.addProp({ id: pid++, kind, x, y, w: info.cw ?? info.fw * 16, h: info.ch ?? info.fh * 16, solid: info.solid, variant: 0, roomId: T.room.id, facing: 0, exec: info.exec, hazard: info.hazard, wallMounted: !!info.wall, ...over });
      w.rebuildPropBlock();
      return p;
    },
    pickups() { return T.W().entities.filter((e) => e.constructor.name === 'Pickup' && !e.dead).map((e) => e.o.kind); },
    clip(x, y, hw = 130, hh = 80) {
      const r = app.renderer;
      app.draw();
      const a = r.worldToFrame(x - hw, y - hh), b = r.worldToFrame(x + hw, y + hh);
      const css = (v, off) => (v * r.scale + off) / r.dpr;
      return { x: Math.max(0, css(a.x, r.offX)), y: Math.max(0, css(a.y, r.offY)), width: (b.x - a.x) * r.scale / r.dpr, height: (b.y - a.y) * r.scale / r.dpr };
    },
    hit(p, o) { T.W().hitProp(p, { amount: 12, type: 'blunt', method: 'melee', source: T.P(), dir: 0, ...o }); },
    state() {
      const w = T.W(), p = T.P();
      return { frame: app.frame, cut: !!w.cutscene, hazardKills: T.S().run.log.hazardKills, php: p.hp, shield: p.shield };
    },

    /** Set up an execution scene: object (or window) at the arena centre, victim + player in front of it. */
    execSetup(type, o = {}) {
      const w = T.W(), p = T.P();
      const cx = T.cx, cy = T.cy - 6;
      let prop = null, tile = null, vx, vy;
      if (type === 'defenestration') {
        const tx = Math.floor(cx / 16), ty = T.room.ty - 1;
        w.map.tiles[ty * w.map.w + tx] = M.wt.T.WINDOW;
        tile = [tx, ty];
        p.x = tx * 16 + 8 - 10; p.y = (ty + 1) * 16 + 26;
        vx = tx * 16 + 8 + 2; vy = (ty + 1) * 16 + 18;
      } else {
        const ov = type === 'photocopier' ? { w: 32, h: 16 } : type === 'vending_machine' ? { w: 32, h: 14 } : type === 'server_rack' ? { w: 16, h: 14 } : {};
        prop = T.prop(type, cx, cy, ov);
        p.x = cx - 12; p.y = cy + 22;
        vx = cx + 2; vy = cy + 16;
      }
      p.vx = p.vy = 0; p.invuln = 0;
      p.aim = -Math.PI / 2;
      const e = T.enemy(vx, vy, 40);
      e.hp = e.maxHp * 0.2;
      const other = T.enemy(T.cx + 90, T.cy + 50, 100);
      w.snapCamera();
      return { prop, tile, e, other, target: { type, prop, tile } };
    },
    /** Run an execution; capture a contact sheet at the given real frames. Returns timing + outcome info. */
    runExec(type, frames = [], o = {}) {
      const w = T.W(), p = T.P(), s = T.S();
      const set = T.execSetup(type, o);
      if (o.floor) w.map.req.floorNumber = o.floor;
      const execs0 = s.run.log.executions, rage0 = p.rage;
      const t0 = w.time, ox0 = set.other.x;
      T.M.exec.startExecution(w, p, set.e, set.target);
      const started = !!w.cutscene;
      const r = app.renderer, W = r.W, H = r.H, cols = 2;
      const sheet = frames.length ? document.createElement('canvas') : null;
      let sg = null;
      if (sheet) { sheet.width = W * cols; sheet.height = H * Math.ceil(frames.length / cols); sg = sheet.getContext('2d'); }
      let f = 0, live = 0, idx = 0, dmin = 9, dmax = -9, invulnMid = null;
      const cs = w.cutscene;
      while (w.cutscene && f < 400) {
        if (sheet && idx < frames.length && f === frames[idx]) { app.draw(); sg.drawImage(r.frame, (idx % cols) * W, Math.floor(idx / cols) * H); idx++; }
        const hs = w.hitstop > 0;
        orig();
        f++;
        if (!hs) live++;
        if (w.forcedDarkness >= 0) { dmin = Math.min(dmin, w.forcedDarkness); dmax = Math.max(dmax, w.forcedDarkness); }
        if (f === 20) invulnMid = p.invuln;
      }
      app.draw();
      const e = set.e;
      return {
        started, frames: f, live, dur: live / 60, victimAlive: e.alive, victimDead: !!e.dead, dismembered: !!e.dismembered, executed: !!e.executed,
        used: set.prop ? set.prop.used : null, propState: set.prop ? set.prop.state : null,
        execs: s.run.log.executions - execs0, rage: p.rage - rage0, timeDelta: w.time - t0, otherMoved: Math.abs(set.other.x - ox0),
        invulnMid, forced: w.forcedDarkness, dmin, dmax, tint: !!w.tint, hasHideHud: !!(cs && cs.hideHud), sheet: sheet ? sheet.toDataURL('image/png') : null,
        px: p.x, py: p.y, ex: e.x, ey: e.y, walkable: w.isWalkablePx(p.x, p.y),
        sprites: w.particles.list.filter((q) => q.kind === 'sprite').length + [...w.decals.rooms.values()].reduce((a, rm) => a + rm.recs.filter((q) => q.kind === 'img' || q.kind === 'sprite').length, 0),
        pickups: T.pickups(),
        tileAfter: set.tile ? w.map.tiles[set.tile[1] * w.map.w + set.tile[0]] : null,
      };
    },
  };

  window.__T = T;
  return true;
};

async function fresh(hash = 'play&seed=7&floor=3') {
  await page.goto(URL + '#' + hash);
  await page.reload();
  await page.waitForFunction(() => window.__cp && window.__cp.app.top && window.__cp.app.top.world && window.__cp.app.top.player, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await ev(SETUP);
  return ev(() => window.__T.arena());
}
async function shot(name, x, y, hw = 130, hh = 80) {
  const clip = await ev(([x, y, hw, hh]) => window.__T.clip(x, y, hw, hh), [x, y, hw, hh]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/hz-${name}.png`, clip });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------------------------------------- hazards
test('glass_partition', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W();
    const g = T.prop('glass_partition', T.cx, T.cy);
    const e = T.enemy(T.cx + 6, T.cy + 4);
    const hp0 = e.hp;
    T.hit(g, { amount: 10, method: 'melee' });
    const st = g.state, solid = g.solid;
    T.step(8);
    return { st, solid, dmg: hp0 - e.hp, bleed: e.status.bleed > 0, hazardKills: T.S().run.log.hazardKills, shards: w.decals.rooms.size };
  });
  check('glass shatters on a solid hit', r.st === 'destroyed' && r.solid === false, JSON.stringify(r));
  check('adjacent enemy takes cut damage', r.dmg > 0, JSON.stringify(r));
  await shot('glass', 0, 0);
});

test('glass_partition thrown body', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const g = T.prop('glass_partition', T.cx + 40, T.cy);
    const e = T.enemy(T.cx, T.cy, 100);
    p.x = T.cx - 14; p.y = T.cy; p.aim = 0;
    p.startGrab(e);
    p.aim = 0;
    p.throwGrabbed();
    const n = T.until(() => g.state === 'destroyed', 90);
    return { st: g.state, solid: g.solid, thrown: !!e.thrown, frames: n, ex: e.x };
  });
  check('thrown body shatters glass and flies on', r.st === 'destroyed' && r.solid === false, JSON.stringify(r));
});

test('printer', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const pr = T.prop('printer', T.cx, T.cy);
    const e = T.enemy(T.cx + 14, T.cy + 4, 100);
    const far = T.enemy(T.cx + 110, T.cy + 4, 100);
    p.x = T.cx - 70; p.y = T.cy + 10; p.shield = 0;
    const tele0 = w.telegraphs.length;
    T.hit(pr, { amount: 20, heavy: true, method: 'heavy' });
    const armed = pr.state === 'active', tele = w.telegraphs.length - tele0;
    T.step(30);
    window.__mid = { x: pr.def.x, y: pr.def.y };
    return { armed, tele, hp: e.hp };
  });
  check('printer arms on heavy hit', r.armed && r.tele === 1, JSON.stringify(r));
  await shot('printer-fuse', await ev(() => window.__mid.x), await ev(() => window.__mid.y - 10));
  const r2 = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const pr = w.props[0];
    const near = w.actors.find((a) => a.team === 'enemy' && Math.abs(a.x - pr.def.x) < 20);
    const far = w.actors.find((a) => a.team === 'enemy' && Math.abs(a.x - pr.def.x) > 80);
    T.until(() => pr.state === 'destroyed', 120);
    T.step(3);
    return { st: pr.state, solid: pr.solid, near: near.hp, nearAlive: near.alive, far: far.hp, kills: T.S().run.log.hazardKills, tele: w.telegraphs.length };
  });
  check('printer explodes after the fuse', r2.st === 'destroyed' && r2.solid === false, JSON.stringify(r2));
  check('explosion damages in radius only', r2.near < 100 && r2.far === 100, JSON.stringify(r2));
  await shot('printer-boom', await ev(() => window.__mid.x), await ev(() => window.__mid.y - 10));
  await ev(() => window.__T.step(10));
  await shot('printer-boom2', await ev(() => window.__mid.x), await ev(() => window.__mid.y - 10));
  await ev(() => window.__T.step(60));
  await shot('printer-after', await ev(() => window.__mid.x), await ev(() => window.__mid.y - 10));
});

test('hazard multipliers and hazard kills', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const pr = T.prop('printer', T.cx, T.cy);
    const e = T.enemy(T.cx + 10, T.cy + 4, 30);
    const e2 = T.enemy(T.cx - 10, T.cy + 4, 400);
    p.stats.hazardDamage = 2; p.stats.hazardTaken = 0;   // x2 to enemies; the player takes none
    p.x = T.cx; p.y = T.cy + 20; p.shield = 0;
    const hp0 = p.hp;
    T.hit(pr, { heavy: true, method: 'heavy', amount: 30 });
    T.step(80);
    return { alive: e.alive, php: p.hp - hp0, e2: e2.maxHp - e2.hp, kills: T.S().run.log.hazardKills };
  });
  check('enemy killed by a hazard counts as a hazard kill', !r.alive && r.kills >= 1, JSON.stringify(r));
  check('hazardTaken scales player damage (0 -> none)', r.php === 0, JSON.stringify(r));
  check('hazardDamage scales enemy damage (x2)', r.e2 >= 60, JSON.stringify(r));
});

test('water_cooler + electricity', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const c = T.prop('water_cooler', T.cx, T.cy);
    const sock = T.prop('socket', T.cx + 30, T.cy + 8);
    const e = T.enemy(T.cx + 4, T.cy + 10, 100);
    const wz0 = (w.wetZones || []).length;
    T.hit(c, { amount: 10 });
    const f = T.M.core.fieldOf(w);
    const leaked = (w.wetZones || []).length - wz0, st = c.state;
    T.step(20);
    const wet = e.status.wet > 0;
    const hp0 = e.hp;
    T.hit(sock, { amount: 10 });
    T.step(6);
    const elec = f.puddles.some((q) => q.elec > 0);
    T.step(40);
    window.__mid = { x: T.cx + 10, y: T.cy + 6 };
    return { leaked, st, wet, elec, dmg: hp0 - e.hp, stunned: e.status.stun > 0 || e.status.electrified > 0, sockSt: sock.state };
  });
  check('water cooler leaks a puddle (wet zone) and goes damaged', r.leaked === 1 && r.st === 'damaged', JSON.stringify(r));
  check('standing in it makes the enemy wet', r.wet, JSON.stringify(r));
  check('hitting a socket electrifies the puddle', r.elec && r.sockSt !== 'intact', JSON.stringify(r));
  check('electrified puddle damages + stuns', r.dmg > 0 && r.stunned, JSON.stringify(r));
  await shot('cooler-electric', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 110, 70);
});

test('water_cooler IT-technician electrified flag', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W();
    const c = T.prop('water_cooler', T.cx, T.cy);
    c.data.electrified = true;
    const e = T.enemy(T.cx + 2, T.cy + 10, 100);
    T.hit(c, { amount: 10 });
    T.step(40);
    return { dmg: 100 - e.hp, elec: T.M.core.fieldOf(w).puddles.some((q) => q.elec > 0) };
  });
  check('IT-electrified cooler makes a live puddle that hurts', r.elec && r.dmg > 0, JSON.stringify(r));
});

test('fire_extinguisher', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const x = T.M.props;
    const fe = T.prop('fire_extinguisher', T.cx, T.cy);
    const e = T.enemy(T.cx + 34, T.cy - 2, 100);
    const f = T.M.core.fieldOf(w);
    T.hit(fe, { amount: 8, dir: 0 });
    const kx = e.kx;
    T.step(10);
    window.__mid = { x: T.cx + 30, y: T.cy };
    return { st: fe.state, kx, clouds: f.clouds.length, blind: e.status.blind > 0, moved: e.x - (T.cx + 34) };
  });
  check('extinguisher bursts: knockback + smoke + blind', r.st === 'destroyed' && r.kx > 50 && r.clouds >= 1 && r.blind, JSON.stringify(r));
  await shot('extinguisher', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 110, 70);
});

test('swivel_chair', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const ch = T.prop('swivel_chair', T.cx - 40, T.cy);
    const e = T.enemy(T.cx + 20, T.cy, 100);
    T.hit(ch, { amount: 10, dir: 0 });
    const rolling = !!ch.data.roll;
    T.step(10);
    window.__mid = { x: ch.def.x, y: ch.def.y };
    T.step(50);
    return { rolling, x: ch.def.x, x0: T.cx - 40, ex: e.x, hp: e.hp, stag: e.staggered, st: ch.state };
  });
  check('chair kicked rolls', r.rolling && r.x > r.x0, JSON.stringify(r));
  check('rolling chair knocks the enemy down', r.hp < 100, JSON.stringify(r));
  await shot('chair', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 110, 70);
  // walk-in kick + wall bounce
  await fresh();
  const r2 = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const ch = T.prop('swivel_chair', T.cx, T.cy);
    p.x = T.cx - 14; p.y = T.cy - 2;
    // simulate running into it
    for (let i = 0; i < 40; i++) { p.vx = 110; p.vy = 0; T.step(1); if (ch.data.roll) break; }
    const kicked = ch.data.roll || ch.def.x > T.cx + 6;
    T.step(6);
    window.__mid = { x: ch.def.x, y: ch.def.y };
    // aim at the wall and watch for a bounce
    const bx0 = ch.def.x;
    T.step(240);
    return { kicked: !!kicked, bx0, x: ch.def.x, solid: ch.solid, roll: !!ch.data.roll };
  });
  check('walking into a chair at speed kicks it', r2.kicked, JSON.stringify(r2));
  check('chair stops and becomes solid again', !r2.roll && r2.solid, JSON.stringify(r2));
});

test('filing_cabinet', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const fc = T.prop('filing_cabinet', T.cx, T.cy);
    const e = T.enemy(T.cx + 22, T.cy - 4, 100);
    const w0 = fc.def.w, x0 = fc.def.x;
    p.x = T.cx - 40; p.y = T.cy;
    T.hit(fc, { amount: 14, heavy: true, method: 'heavy', dir: 0 });
    T.step(8);
    const midGone = fc.gone;
    window.__mid = { x: T.cx + 14, y: T.cy };
    T.step(30);
    const f = T.M.wt.footprint(fc.def);
    const tx = Math.floor((fc.def.x + fc.def.w / 2 - 3) / 16), ty = Math.floor((fc.def.y - 3) / 16);
    return { midGone, gone: fc.gone, st: fc.state, solid: fc.solid, w0, w: fc.def.w, x0, x: fc.def.x, hp: e.hp, block: w.propBlock[ty * w.map.w + tx], facing: fc.def.facing };
  });
  check('cabinet falls (collision released while falling)', r.midGone === true, JSON.stringify(r));
  check('cabinet lies down as solid cover, wider footprint', r.st === 'destroyed' && r.solid && r.w > r.w0 && !r.gone, JSON.stringify(r));
  check('prop block rebuilt for the new footprint', r.block === 1, JSON.stringify(r));
  check('crush line damages enemy in the way', r.hp < 100, JSON.stringify(r));
  await shot('cabinet', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 110, 70);
});

test('sprinklers + conduction', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const f = T.M.core.fieldOf(w);
    const a = T.enemy(T.cx - 40, T.cy, 100), b = T.enemy(T.cx + 50, T.cy + 20, 100);
    p.x = T.cx; p.y = T.cy + 40;
    f.triggerSprinklers(T.room.id, 8, p);
    T.step(30);
    const wetA = a.status.wet > 0, slowA = a.status.slow > 0, wetP = p.status.wet > 0;
    window.__mid = { x: T.cx, y: T.cy };
    const hb = b.hp;
    // short-circuit anywhere in the room: all wet actors conduct
    T.M.core.shock(w, a, 10, p, 'test', 0.5);
    T.step(2);
    return { wetA, slowA, wetP, chained: hb - b.hp, zones: (w.wetZones || []).length };
  });
  check('sprinklers soak and slow everyone in the room', r.wetA && r.slowA && r.wetP, JSON.stringify(r));
  check('electric damage spreads through wet actors room-wide', r.chained > 0, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/hz-full-sprinklers.png` });
  await shot('sprinklers', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 150, 90);
});

test('server_rack + cable_run', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const sr = T.prop('server_rack', T.cx, T.cy, { w: 16, h: 16 });
    const e = T.enemy(T.cx + 8, T.cy + 12, 100);
    T.hit(sr, { amount: 10 });
    const st = sr.state;
    T.step(4);
    const dmg = 100 - e.hp;
    T.step(60);
    const cr = T.prop('cable_run', T.cx - 60, T.cy + 30, { w: 40, h: 6 });
    const e2 = T.enemy(T.cx - 60, T.cy + 38, 100);
    T.hit(cr, { amount: 10, source: p });
    T.step(30);
    window.__mid = { x: T.cx, y: T.cy };
    return { st, dmg, after: sr.state, crSt: cr.state, e2: 100 - e2.hp };
  });
  check('server rack arcs electricity (active state, damage)', r.st === 'active' && r.dmg > 0, JSON.stringify(r));
  check('rack returns from active', r.after !== 'active', JSON.stringify(r));
  check('shorted cable zaps adjacent actors', r.crSt === 'active' || r.crSt === 'damaged', JSON.stringify(r));
  await shot('rack', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 130, 80);
});

test('vending / knife block / kettle / destructibles', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, w = T.W(), p = T.P();
    const v = T.prop('vending_snack', T.cx - 60, T.cy, { w: 32, h: 12 });
    T.hit(v, { amount: 20, heavy: true, method: 'heavy' });
    T.hit(v, { amount: 20, heavy: true, method: 'heavy' });
    T.step(2);
    const snacks = T.pickups().filter((k) => k === 'heal' || k === 'espresso').length;
    const kb = T.prop('knife_block', T.cx - 20, T.cy);
    for (let i = 0; i < 3; i++) T.hit(kb, { amount: 12 });
    T.step(2);
    const weapons = T.pickups().filter((k) => k === 'weapon').length;
    const ke = T.prop('kettle', T.cx + 20, T.cy);
    const e = T.enemy(T.cx + 30, T.cy + 4, 100);
    T.hit(ke, { amount: 8, dir: 0 });
    T.step(2);
    const pl = T.prop('plant', T.cx + 50, T.cy);
    T.hit(pl, { amount: 12 });
    const bin = T.prop('bin', T.cx + 70, T.cy);
    T.hit(bin, { amount: 12 });
    const dk = T.prop('desk', T.cx - 20, T.cy + 40, { w: 32, h: 16 });
    T.hit(dk, { amount: 20, heavy: true, method: 'heavy' });
    const mw = T.prop('microwave', T.cx + 90, T.cy);
    T.hit(mw, { amount: 10 });
    T.step(5);
    window.__mid = { x: T.cx, y: T.cy + 10 };
    return { snacks, weapons, kettle: ke.state, scald: 100 - e.hp, plant: pl.state, bin: bin.state, desk: dk.state, deskSolid: dk.solid, vendOnce: snacks === 1 || snacks === 2 };
  });
  check('vending machine drops a snack once', r.vendOnce && r.snacks >= 1, JSON.stringify(r));
  check('knife block drops a sharp weapon when broken', r.weapons === 1, JSON.stringify(r));
  check('kettle scalds adjacent enemy', r.kettle === 'damaged' && r.scald > 0, JSON.stringify(r));
  check('plant / bin break, desk monitor smashes but desk stays cover', r.plant === 'destroyed' && r.bin === 'destroyed' && r.desk === 'damaged' && r.deskSolid, JSON.stringify(r));
  await shot('destructibles', await ev(() => window.__mid.x), await ev(() => window.__mid.y), 150, 70);
});


// ---------------------------------------------------------------------------------------------------- executions
const EXEC_TYPES = ['defenestration', 'photocopier', 'server_rack', 'shredder', 'microwave', 'hand_dryer', 'water_cooler', 'vending_machine', 'filing_cabinet'];
const FRAMES = [14, 30, 46, 62, 78, 92];

function saveSheet(name, dataUrl) {
  if (!dataUrl) return;
  fs.writeFileSync(`${OUT}/hz-exec-${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

for (const type of EXEC_TYPES) {
  test('execution ' + type, async () => {
    await fresh();
    await ev(() => { const a = window.__cp.app; a.settings.cutscenes = 'always'; a.settings.gore = 'full'; a.settings.screenShake = true; });
    const r = await ev(([type, frames]) => window.__T.runExec(type, frames, { floor: type === 'defenestration' ? 12 : undefined }), [type, FRAMES]);
    saveSheet(type, r.sheet);
    check(`${type}: cutscene starts`, r.started);
    check(`${type}: lasts 1-1.5 s (sim time ${r.dur.toFixed(2)} s)`, r.dur >= 0.95 && r.dur <= 1.6, JSON.stringify({ ...r, sheet: undefined }));
    check(`${type}: victim dies`, !r.victimAlive, JSON.stringify({ ...r, sheet: undefined }));
    check(`${type}: world timers + other enemies paused`, r.timeDelta === 0 && r.otherMoved === 0, JSON.stringify({ t: r.timeDelta, o: r.otherMoved }));
    check(`${type}: player invulnerable during`, (r.invulnMid ?? 0) > 1, String(r.invulnMid));
    check(`${type}: counted (execution stat + rage)`, r.execs === 1 && r.rage > 0, JSON.stringify({ e: r.execs, rage: r.rage }));
    check(`${type}: player left on walkable ground`, r.walkable, JSON.stringify({ x: r.px, y: r.py }));
    if (type !== 'defenestration') check(`${type}: object single-use (used)`, r.used === true && r.propState === 'used', JSON.stringify({ u: r.used, s: r.propState }));
    else check('defenestration: window smashed + body removed', r.tileAfter === 8 && r.victimDead, JSON.stringify({ t: r.tileAfter, d: r.victimDead }));
    if (type === 'photocopier') check('photocopier: 4 printouts', r.sprites >= 4, String(r.sprites));
    if (type === 'server_rack') check('server rack: lights flicker then restore', r.dmax - r.dmin > 0.2 && r.forced === -1 && !r.tint, JSON.stringify({ min: r.dmin, max: r.dmax, f: r.forced }));
    if (type === 'vending_machine') check('vending machine: snacks drop', r.pickups.filter((k) => k === 'heal' || k === 'espresso').length >= 2, JSON.stringify(r.pickups));
    if (type === 'shredder') check('shredder (gore full): dismembered', r.dismembered);
    check(`${type}: HUD hidden in the cinematic`, r.hasHideHud);
  });
}

test('execution cutscene setting Off / First time only', async () => {
  await fresh();
  const r = await ev(() => {
    const T = window.__T, a = T.app;
    a.settings.cutscenes = 'off';
    const off = T.runExec('photocopier', []);
    return { off: { dur: off.dur, dead: !off.victimAlive, used: off.used, hide: off.hasHideHud } };
  });
  check('Off: brief in-world animation (<= 0.7 s), victim still dies, object used', r.off.dur > 0.2 && r.off.dur <= 0.7 && r.off.dead && r.off.used, JSON.stringify(r.off));
  check('Off: no cinematic HUD hiding', !r.off.hide);
  await fresh();
  const r2 = await ev(() => {
    const T = window.__T, a = T.app;
    a.settings.cutscenes = 'first';
    T.M.exec.seenExecutions.clear();
    const first = T.runExec('microwave', []);
    T.arena();
    const second = T.runExec('microwave', []);
    return { first: first.dur, second: second.dur };
  });
  check('First time only: full first, brief second time', r2.first >= 0.95 && r2.second <= 0.7, JSON.stringify(r2));
});

test('shredder gore toggle (Reduced / Off)', async () => {
  for (const g of ['reduced', 'off']) {
    await fresh();
    const r = await ev((g) => { const T = window.__T; T.app.settings.cutscenes = 'always'; T.app.settings.gore = g; const x = T.runExec('shredder', [8, 30, 52, 74, 90, 100]); return { dis: x.dismembered, dead: !x.victimAlive, sheet: x.sheet }; }, g);
    saveSheet('shredder-' + g, r.sheet);
    check(`shredder gore ${g}: no dismemberment, victim still dies`, !r.dis && r.dead);
  }
});

test('defenestration ground floor = comedic short drop', async () => {
  await fresh();
  const r = await ev(() => { const T = window.__T; T.app.settings.cutscenes = 'always'; const x = T.runExec('defenestration', [10, 28, 40, 52, 64, 76], { floor: 1 }); return { ...x }; });
  saveSheet('defenestration-floor1', r.sheet);
  check('floor 1 drop is short (<= 1.35 s) and victim dies', r.dur >= 0.9 && r.dur <= 1.35 && !r.victimAlive, JSON.stringify({ ...r, sheet: undefined }));
});

test('executions leave no console errors in Reduced lights + screen shake off', async () => {
  await fresh();
  const r = await ev(() => { const T = window.__T, a = T.app; a.settings.cutscenes = 'always'; a.settings.screenShake = false; a.applySettings(); a.settings.reducedLights = true; const x = T.runExec('server_rack', []); a.settings.screenShake = true; a.applySettings(); a.settings.reducedLights = false; return { dur: x.dur, dead: !x.victimAlive, shake: a.renderer.shakeEnabled }; });
  check('server rack with shake off: runs, victim dies', r.dead && r.dur > 0.9);
});

// ---------------------------------------------------------------------------------------------------- main
await page.goto(URL);
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  console.log(`\n# ${t.name}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const f0 = fail, p0 = pass;
    try { await t.fn(); break; } catch (e) {
      const m = e.message.split('\n')[0];
      // the dev server hot-reloads when other agents edit sources: retry the whole test
      if (attempt < 2 && /__cp|__T|context was destroyed|Target closed|navigation|reading .step.|Cannot read properties of undefined/i.test(m)) { fail = f0; pass = p0; console.log('  (page reloaded, retrying)'); continue; }
      fail++; failures.push(t.name + ' (threw)'); console.log('  FAIL threw: ' + m); break;
    }
  }
}
console.log('\nconsole errors/warnings:');
const bad = logs.filter((l) => !l.includes('[vite]') && !/Failed to load resource|favicon/.test(l));
console.log(bad.length ? bad.slice(0, 40).join('\n') : '  none');
check('no console errors', bad.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')).length === 0);
console.log(`\n${pass} passed, ${fail} failed${failures.length ? ': ' + failures.join(', ') : ''}`);
await browser.close();
process.exit(fail ? 1 : 0);
