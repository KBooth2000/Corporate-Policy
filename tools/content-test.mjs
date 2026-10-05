// Content QA for in-run progression (Benefits, Desk Items, rewards, shops, events, treasure, challenges, economy).
// Usage: start a dev server (`npx vite --port 5189 &`), then `URL=http://localhost:5189/ node tools/content-test.mjs [scenario ...]`.
// Drives the real game in headless Chromium: loads quick-play floors, opens each UI with simulated key input, takes screenshots
// into scratch/content-*.png, asserts state changes, and runs a self-check that instantiates every Benefit and Desk Item at every rarity.
import { chromium } from 'playwright-core';

const BASE = process.env.URL || 'http://localhost:5189/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'scratch';
const only = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let passed = 0, failed = 0;
const failures = [];
const liveCtx = new Set();
const consoleErrors = [];

function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS', msg); } else { failed++; failures.push(msg); console.log('  FAIL', msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(hash, { w = 1280, h = 720 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  liveCtx.add(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!t.includes('[vite]') && !t.includes('GPU stall') && !t.includes('swiftshader')) consoleErrors.push(`[${hash}] ${t}`); } });
  page.on('pageerror', (e) => consoleErrors.push(`[${hash}] pageerror ${e.message}`));
  await page.goto(BASE + '#' + hash);
  await page.waitForTimeout(2200);
  // Import helper: the app's modules may carry a ?t= HMR stamp, so import the exact URL the app loaded (never a second instance).
  await page.evaluate(() => {
    window.__imp = (p) => {
      const hit = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.split('?')[0].endsWith(p));
      return import(hit || p);
    };
  });
  return { page, ctx };
}
async function tap(page, code, ms = 90) { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); await sleep(70); }
const shot = (page, name) => page.screenshot({ path: `${OUT}/content-${name}.png` });
const topName = (page) => page.evaluate(() => __cp.app.top.name);

/** Run a scenario if selected. */
async function scenario(name, fn) {
  if (only.length && !only.includes(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { failed++; failures.push(`${name}: threw ${e.message}`); console.log('  FAIL threw', e.stack || e.message); }
  for (const c of liveCtx) { await c.close().catch(() => {}); } liveCtx.clear();
}

// Helpers evaluated inside the page --------------------------------------------------------------------------------
const PAGE = {
  /** Wait until the gameplay scene is on top and the world exists. */
  ready: () => !!(__cp.app.top && __cp.app.top.world && __cp.app.top.player),
};

// ===========================================================================================================
await scenario('selfcheck', async () => {
  const { page, ctx } = await load('play&seed=21&floor=3');
  const r = await page.evaluate(async () => {
    const out = { errors: [], depts: {}, synergies: 0, stress: 0, total: 0, desk: 0, deskMissing: [], benefitsChecked: 0, deskChecked: 0, starters: {} };
    const ci = await __imp('/src/game/content-info.ts');
    const ben = await __imp('/src/game/content/benefits.ts');
    const desk = await __imp('/src/game/content/deskitems.ts');
    const common = await __imp('/src/game/content/common.ts');
    const runMod = await __imp('/src/game/run.ts');
    const dd = await __imp('/src/data/deskitems.ts');
    const s = __cp.app.top;
    const w = s.world;
    out.total = ci.BENEFITS.length;
    for (const b of ci.BENEFITS) {
      if (b.synergy) out.synergies++;
      else if (b.id.startsWith('stress_')) out.stress++;
      else { out.depts[b.dept] = (out.depts[b.dept] || 0) + 1; if (b.starter) out.starters[b.dept] = (out.starters[b.dept] || 0) + 1; }
      for (let r = 0; r < 3; r++) if (!b.desc[r] || b.desc[r].length < 8 || /undefined|NaN/.test(b.desc[r])) out.errors.push(`desc ${b.id}/${r}: ${b.desc[r]}`);
    }
    // every Benefit at every rarity: mods compute and hooks install/uninstall and tick without throwing
    const saved = { b: s.run.benefits.slice(), d: s.run.deskItems.slice() };
    for (const b of ci.BENEFITS) {
      for (let r = 0; r < 3; r++) {
        try {
          s.run.benefits.length = 0; s.run.benefits.push({ id: b.id, rarity: r });
          const mods = b.mods ? b.mods(r, s.run) : [];
          for (const m of mods) if (!(m.stat in s.player.stats) || (m.mult !== undefined && !isFinite(m.mult)) || (m.add !== undefined && !isFinite(m.add))) out.errors.push(`bad mod ${b.id}/${r} ${JSON.stringify(m)}`);
          s.player.refreshStats();
          const st = runMod.runStats(s.run);
          for (const k of Object.keys(st)) if (!isFinite(st[k])) out.errors.push(`NaN stat ${k} for ${b.id}/${r}`);
          ben.installBenefit(s, b.id, r);
          for (let i = 0; i < 12; i++) w.update(1 / 60);
          // uninstall through the dispose table
          const d = s.data.cpDispose || {};
          d['b:' + b.id]?.(); delete d['b:' + b.id];
          out.benefitsChecked++;
        } catch (e) { out.errors.push(`benefit ${b.id}/${r}: ${e.message}`); }
      }
    }
    s.run.benefits.length = 0; s.player.refreshStats();
    // every Desk Item: has an effect entry, acquires, ticks, and its stat mods compute
    for (const d of dd.DESK_ITEMS) {
      if (!desk.DESK_FX_IDS.includes(d.id)) out.deskMissing.push(d.id);
      try {
        s.run.deskItems.length = 0;
        const ok = desk.acquireDeskItem(s, d.id, { quiet: true });
        if (!ok) out.errors.push(`acquire failed ${d.id}`);
        for (let i = 0; i < 12; i++) w.update(1 / 60);
        const st = runMod.runStats(s.run);
        for (const k of Object.keys(st)) if (!isFinite(st[k])) out.errors.push(`NaN stat ${k} for desk ${d.id}`);
        const dis = s.data.cpDispose || {};
        dis['d:' + d.id]?.(); delete dis['d:' + d.id];
        out.deskChecked++;
      } catch (e) { out.errors.push(`desk ${d.id}: ${e.message}`); }
    }
    out.desk = dd.DESK_ITEMS.length;
    s.run.deskItems.length = 0; s.run.benefits.push(...saved.b); s.run.deskItems.push(...saved.d);
    void common;
    return out;
  });
  console.log('  ', JSON.stringify({ total: r.total, depts: r.depts, synergies: r.synergies, stress: r.stress, starters: r.starters, benefitsChecked: r.benefitsChecked, deskChecked: r.deskChecked }));
  for (const d of ['it', 'facilities', 'sales', 'marketing', 'finance', 'legal', 'hr', 'executive']) assert((r.depts[d] || 0) >= 10, `${d} has >= 10 Benefits (${r.depts[d]})`);
  for (const d of ['it', 'facilities', 'sales', 'marketing', 'finance', 'legal', 'hr', 'executive']) assert((r.starters[d] || 0) >= 4, `${d} has >= 4 starter Benefits (${r.starters[d]})`);
  assert(r.synergies === 12, `12 synergies (${r.synergies})`);
  assert(r.stress >= 8, `stress modifier pool has >= 8 entries (${r.stress})`);
  assert(r.total >= 92, `total Benefits >= 92 (${r.total})`);
  assert(r.benefitsChecked === r.total * 3, `every Benefit x rarity instantiated (${r.benefitsChecked}/${r.total * 3})`);
  assert(r.desk === 40 && r.deskChecked === 40, `all 40 desk items acquire and tick (${r.deskChecked}/${r.desk})`);
  assert(r.deskMissing.length === 0, `every desk item has an effect entry (missing: ${r.deskMissing.join(',') || 'none'})`);
  assert(r.errors.length === 0, `no errors during instantiation (${r.errors.slice(0, 6).join(' | ')})`);
  await ctx.close();
});

// ===========================================================================================================
await scenario('benefit-email', async () => {
  const { page, ctx } = await load('play&seed=11&floor=3');
  // clear the floor the real way: kill every enemy, then the floor-clear reward spawns from the plan
  const info = await page.evaluate(async () => {
    const s = __cp.app.top;
    s.plan.reward = 'benefit'; s.plan.rewardDept = 'it';
    for (const a of s.world.actors) if (a.team === 'enemy') s.world.damage(a, { amount: 99999, type: 'blunt', method: 'melee', source: s.player, unavoidable: true });
    for (let i = 0; i < 90; i++) { s.world.update(1 / 60); }
    return { cleared: s.world.floorCleared, pickups: s.world.entities.filter((e) => e.o && e.o.kind === 'reward').length, interact: s.world.interactables.map((i) => i.label) };
  });
  console.log('  ', JSON.stringify(info));
  assert(info.cleared, 'floor cleared after killing everything');
  assert(info.pickups >= 1, 'benefit reward pickup spawned on floor clear');
  // walk onto the pickup and press interact
  await page.evaluate(() => { const s = __cp.app.top; const pk = s.world.entities.find((e) => e.o && e.o.kind === 'reward'); s.player.x = pk.x; s.player.y = pk.y + 4; for (let i = 0; i < 30; i++) s.world.update(1 / 60); });
  await sleep(200);
  await shot(page, 'benefit-pickup');
  await tap(page, 'KeyE');
  await sleep(400);
  assert((await topName(page)) === 'uiscene', 'interacting opens the email scene (gameplay paused)');
  const t0 = await page.evaluate(() => __cp.app.top.comp.constructor.name);
  assert(t0 === 'EmailView', 'scene is an EmailView');
  await sleep(2300);
  await shot(page, 'benefit-email');
  const before = await page.evaluate(() => ({ n: __cp.app.scenes[0].run.benefits.length, floorTime: __cp.app.scenes[0].floorTime }));
  await tap(page, 'ArrowRight'); await sleep(200);
  await tap(page, 'Enter'); await sleep(1400);
  const after = await page.evaluate(() => { const s = __cp.app.scenes[0]; return { top: __cp.app.top.name, n: s.run.benefits.slice(), maxHp: s.player.maxHp, floorTime: s.floorTime }; });
  console.log('  ', JSON.stringify(after.n));
  assert(before.n === 0 && after.n.length === 1, 'accepting an attachment adds exactly one Benefit to the run');
  assert(after.top === 'gameplay', 'gameplay resumes after the email closes');
  await shot(page, 'benefit-accepted');
  await ctx.close();
});


// ===========================================================================================================
/** Teleport the player next to the interactable whose label matches and press interact. */
async function interactWith(page, labelRe) {
  const ok = await page.evaluate((src) => {
    const re = new RegExp(src);
    const s = __cp.app.top;
    const it = s.world.interactables.find((i) => re.test(i.label));
    if (!it) return false;
    s.player.x = it.x; s.player.y = it.y - 4; s.player.vx = s.player.vy = 0;
    for (let i = 0; i < 20; i++) s.world.update(1 / 60);
    return true;
  }, labelRe.source);
  if (!ok) return false;
  await sleep(150);
  await tap(page, 'KeyE');
  await sleep(700);
  return true;
}

await scenario('shop', async () => {
  const { page, ctx } = await load('play&seed=5&floor=3&type=shop');
  const info = await page.evaluate(() => { const s = __cp.app.top; s.run.pettyCash = 700; s.run.log.cashSpent = 0; return { type: s.plan.floor_type, labels: s.world.interactables.map((i) => i.label), cleared: s.world.floorCleared }; });
  console.log('  ', JSON.stringify(info.labels));
  assert(info.type === 'shop', 'shop floor loaded');
  assert(info.labels.includes('Browse the Canteen'), 'canteen counter interactable exists');
  assert(await interactWith(page, /Canteen/), 'walked to the counter');
  assert((await topName(page)) === 'uiscene' && (await page.evaluate(() => __cp.app.top.comp.constructor.name)) === 'IntranetPage', 'interact opens the intranet catalogue');
  await sleep(900);
  await shot(page, 'canteen');
  const st0 = await page.evaluate(() => { const s = __cp.app.scenes[0]; const c = __cp.app.top.comp; return { cash: s.run.pettyCash, products: c.o.products.map((p) => ({ n: p.name, price: p.price, tag: p.tag })), nb: s.run.benefits.length }; });
  console.log('  ', JSON.stringify(st0.products));
  const tags = st0.products.map((p) => p.tag);
  assert(tags.includes('BENEFIT') || tags.includes('SYNERGY') || tags.includes('UPGRADE'), 'stock has a Benefit');
  assert(tags.filter((t) => t === 'DESK').length >= 1 && tags.filter((t) => t === 'DESK').length <= 2, '1-2 Desk Items');
  assert(tags.some((t) => ['MELEE', 'RANGED', 'THROWN'].includes(t)), 'stock has a weapon');
  assert(tags.includes('HEAL') && tags.includes('REPAIR') && tags.includes('REROLL'), 'full heal, weapon repair and reroll are stocked');
  assert(st0.products.find((p) => p.tag === 'HEAL').price === 90 && st0.products.find((p) => p.tag === 'REPAIR').price === 40 && st0.products.find((p) => p.tag === 'REROLL').price === 30, 'base prices 90 / 40 / 30 from prices.csv');
  // buy the first product (the Benefit)
  await tap(page, 'Enter'); await sleep(500);
  const st1 = await page.evaluate(() => { const s = __cp.app.scenes[0]; return { cash: s.run.pettyCash, spent: s.run.log.cashSpent, benefits: s.run.benefits.slice(), sold: __cp.app.top.comp.o.products[0].soldOut }; });
  console.log('  ', JSON.stringify(st1));
  assert(st1.benefits.length === 1, 'buying the Benefit adds it to the run');
  assert(st1.cash === 700 - st0.products[0].price && st1.spent === st0.products[0].price, 'Petty Cash spent and logged in run.log.cashSpent');
  assert(st1.sold === true, 'bought product is marked SOLD OUT');
  await shot(page, 'canteen-bought');
  // reroll: price goes 30 -> 60
  const idx = st0.products.findIndex((p) => p.tag === 'REROLL');
  const rr = await page.evaluate((i) => { const c = __cp.app.top.comp; return c.cards.length; }, idx);
  void rr;
  for (let i = 0; i < idx; i++) await tap(page, 'ArrowRight');
  await page.evaluate((i) => { const c = __cp.app.top.comp; c.ui.setFocus(c.cards[i]); }, idx);
  await sleep(100);
  await tap(page, 'Enter'); await sleep(400);
  const st2 = await page.evaluate(() => { const s = __cp.app.scenes[0]; const c = __cp.app.top.comp; return { cash: s.run.pettyCash, price: c.o.products.find((p) => p.tag === 'REROLL').price, sold: c.o.products.filter((p) => p.soldOut).length }; });
  assert(st2.price === 60, `reroll price rises to 60 after one reroll (${st2.price})`);
  assert(st2.sold === 0, 'reroll restocks (nothing sold out)');
  assert(st2.cash === st1.cash - 30, `reroll cost 30 (${st1.cash} -> ${st2.cash})`);
  await shot(page, 'canteen-rerolled');
  // heal while full is refused without charging
  // (the reroll may have changed the stock layout, so find the Full Heal card again)
  await page.evaluate(() => { const c = __cp.app.top.comp; c.ui.setFocus(c.cards[c.o.products.findIndex((p) => p.tag === 'HEAL')]); });
  const c0 = await page.evaluate(() => __cp.app.scenes[0].run.pettyCash);
  await tap(page, 'Enter'); await sleep(300);
  const c1 = await page.evaluate(() => __cp.app.scenes[0].run.pettyCash);
  assert(c0 === c1, 'full heal refused (no charge) while at full Wellbeing');
  await page.evaluate(() => { const s = __cp.app.scenes[0]; s.player.hp = 10; });
  await tap(page, 'Enter'); await sleep(300);
  const c2 = await page.evaluate(() => { const s = __cp.app.scenes[0]; return { cash: s.run.pettyCash, hp: s.player.hp, max: s.player.maxHp }; });
  assert(c2.hp === c2.max && c2.cash === c1 - 90, `full heal restores Wellbeing for 90 (${c2.hp}/${c2.max}, cash ${c2.cash})`);
  // leave
  await tap(page, 'Escape'); await sleep(500);
  assert((await topName(page)) === 'gameplay', 'leaving the canteen returns to gameplay');
  await ctx.close();
});


// ===========================================================================================================
await scenario('shop-extras', async () => {
  // Ex-Employee: "Your access badge has been revoked"
  {
    const { page, ctx } = await load('play&seed=5&floor=3&type=shop&role=ex_employee');
    assert(await interactWith(page, /Canteen/), 'ex-employee reached the counter');
    assert((await topName(page)) === 'gameplay', 'Ex-Employee (role.shops === false): no catalogue opens');
    await sleep(500);
    await shot(page, 'canteen-revoked');
    await ctx.close();
  }
  // Budget Cuts, Gold Lanyard and the Company Credit Card
  const { page, ctx } = await load('play&seed=5&floor=3&type=shop');
  const r = await page.evaluate(async () => {
    const shop = await __imp('/src/game/content/shop.ts');
    const desk = await __imp('/src/game/content/deskitems.ts');
    const common = await __imp('/src/game/content/common.ts');
    const s = __cp.app.top;
    const stock = () => {
      s.data.cpShop = undefined; shop.openCanteen(s); __cp.app.flush();
      const top = __cp.app.top;
      const p = top.comp.o.products.map((x) => ({ tag: x.tag, price: x.price }));
      __cp.app.remove(top); __cp.app.flush();
      return p;
    };
    const out = {};
    out.base = stock();
    s.run.modifiers.budget_cuts = 2;
    out.cuts = stock();
    s.run.modifiers.budget_cuts = 0;
    desk.acquireDeskItem(s, 'gold_lanyard', { quiet: true });
    out.lanyard = stock();
    desk.acquireDeskItem(s, 'company_card', { quiet: true });
    s.run.pettyCash = 50; s.run.debt = 0;
    out.credit = { limit: common.creditLimit(s.run), spendable: common.spendable(s.run) };
    const price = Math.round(90 * 0.8);
    s.player.hp = 20;
    const ok = common.spend(s, price, 'heal');
    out.afterSpend = { ok, cash: s.run.pettyCash, debt: s.run.debt, price };
    common.earn(s, 100, { noMult: true });
    out.afterEarn = { cash: s.run.pettyCash, debt: s.run.debt };
    out.tooMuch = common.spend(s, 400, 'x');
    return out;
  });
  console.log('  ', JSON.stringify({ base: r.base.length, cuts: r.cuts.length, afterSpend: r.afterSpend, afterEarn: r.afterEarn }));
  assert(r.cuts.length === r.base.length - 2, `Budget Cuts rank 2: two fewer shop items (${r.base.length} -> ${r.cuts.length})`);
  const bp = (k, a) => a.find((x) => x.tag === k).price;
  assert(bp('HEAL', r.cuts) === 126 && bp('REPAIR', r.cuts) === 56, `Budget Cuts rank 2: prices +40% (+20% per rank): heal 90 -> ${bp('HEAL', r.cuts)}, repair 40 -> ${bp('REPAIR', r.cuts)}`);
  assert(bp('HEAL', r.lanyard) === 72, `Gold Lanyard 20% discount: heal 90 -> ${bp('HEAL', r.lanyard)}`);
  assert(r.credit.limit === 150 && r.credit.spendable === 200, `Company Credit Card: 150 credit on top of cash (${JSON.stringify(r.credit)})`);
  assert(r.afterSpend.ok && r.afterSpend.cash === 0 && r.afterSpend.debt === 22, `going into debt: cash 0, debt 22 (${JSON.stringify(r.afterSpend)})`);
  assert(r.afterEarn.debt === 0 && r.afterEarn.cash === 78, `earnings repay the debt first (${JSON.stringify(r.afterEarn)})`);
  assert(r.tooMuch === false, 'cannot spend beyond the credit limit');
  await ctx.close();
});

// ===========================================================================================================
await scenario('vending', async () => {
  const { page, ctx } = await load('play&seed=5&floor=3');
  const r = await page.evaluate(async () => {
    const common = await __imp('/src/game/content/common.ts');
    const s = __cp.app.top;
    const pr = s.world.addProp({ id: 99991, kind: 'vending_snack', x: s.player.x + 20, y: s.player.y + 6, w: 32, h: 16, solid: false, variant: 0, roomId: 0, facing: 0 });
    for (const f of common.floorInstallers) f(s);
    const it = s.world.interactables.find((i) => i.label === 'Use vending machine');
    if (!it) return { found: false };
    s.run.pettyCash = 200; s.player.hp = 40; s.player.x = it.x; s.player.y = it.y - 4;
    for (let i = 0; i < 10; i++) s.world.update(1 / 60);
    void pr;
    return { found: true, sub: it.sub };
  });
  assert(r.found, 'a vending_snack prop becomes a "Use vending machine" interactable');
  await tap(page, 'KeyE'); await sleep(1200);
  assert((await page.evaluate(() => __cp.app.top.comp && __cp.app.top.comp.constructor.name)) === 'IntranetPage', 'vending machine opens a catalogue');
  await shot(page, 'vending');
  const p0 = await page.evaluate(() => { const s = __cp.app.scenes[0]; const c = __cp.app.top.comp; return { cash: s.run.pettyCash, hp: s.player.hp, prods: c.o.products.map((p) => `${p.tag}:${p.price}`), thrown: s.run.loadout.thrown && s.run.loadout.thrown.id }; });
  console.log('  ', JSON.stringify(p0));
  assert(p0.prods.filter((x) => x.startsWith('SNACK')).length === 3 && p0.prods.filter((x) => x.startsWith('THROWABLE')).length === 1, 'machine sells 3 snacks and a single throwable');
  assert(p0.prods.filter((x) => x.startsWith('SNACK')).every((x) => { const n = +x.split(':')[1]; return n >= 15 && n <= 25; }), 'snack prices 15-25 (prices.csv)');
  await tap(page, 'Enter'); await sleep(400);
  const p1 = await page.evaluate(() => { const s = __cp.app.scenes[0]; return { cash: s.run.pettyCash, hp: s.player.hp, spent: s.run.log.cashSpent }; });
  assert(p1.hp > p0.hp && p1.cash === p0.cash - 15 && p1.spent === 15, `a snack heals and costs 15 (hp ${p0.hp} -> ${p1.hp}, cash ${p0.cash} -> ${p1.cash})`);
  await page.evaluate(() => { const c = __cp.app.top.comp; c.ui.setFocus(c.cards[3]); });
  await tap(page, 'Enter'); await sleep(400);
  const p2 = await page.evaluate(() => { const s = __cp.app.scenes[0]; return { thrown: s.run.loadout.thrown && s.run.loadout.thrown.id, sold: __cp.app.top.comp.o.products[3].soldOut }; });
  assert(p2.sold === true, 'the throwable sells out after one purchase');
  await ctx.close();
});

// ===========================================================================================================
await scenario('event', async () => {
  const { page, ctx } = await load('play&seed=3&floor=3&type=event');
  const info = await page.evaluate(() => { const s = __cp.app.top; return { labels: s.world.interactables.map((i) => i.label), ev: s.data.cpEvent && s.data.cpEvent.id, cleared: s.world.floorCleared, enemies: s.world.totalLiveEnemies() }; });
  console.log('  ', JSON.stringify(info));
  assert(info.labels.some((l) => l.startsWith('Investigate')), 'event centrepiece interactable exists');
  assert(!!info.ev, `an event was picked deterministically (${info.ev})`);
  // determinism: the same seed picks the same event
  const again = await load('play&seed=3&floor=3&type=event');
  const ev2 = await again.page.evaluate(() => __cp.app.top.data.cpEvent.id);
  assert(ev2 === info.ev, `same seed -> same event (${ev2})`);
  await again.ctx.close();
  assert(await interactWith(page, /Investigate/), 'walked to the event');
  assert((await page.evaluate(() => __cp.app.top.comp && __cp.app.top.comp.constructor.name)) === 'EventDialog', 'interact opens the CorpOS event dialog');
  await sleep(700);
  await shot(page, 'event-dialog');
  const opts = await page.evaluate(() => __cp.app.top.comp.btns.map((b) => b.b.text));
  console.log('  ', JSON.stringify(opts));
  assert(opts.length === 3, 'three options shown');
  await tap(page, 'Enter'); await sleep(600);
  await shot(page, 'event-result');
  assert(await page.evaluate(() => __cp.app.top.comp.phase === 'result'), 'choosing shows the outcome text');
  await tap(page, 'Enter'); await sleep(700);
  assert((await topName(page)) === 'gameplay', 'continue returns to gameplay');
  assert(await page.evaluate(() => !__cp.app.top.world.interactables.find((i) => i.label.startsWith('Investigate'))?.enabled()), 'event centrepiece is spent');
  await ctx.close();
});

await scenario('event-effects', async () => {
  const { page, ctx } = await load('play&seed=3&floor=3&type=event');
  const r = await page.evaluate(async () => {
    const ev = await __imp('/src/game/content/events.ts');
    const common = await __imp('/src/game/content/common.ts');
    const s = __cp.app.top;
    const p = s.player, run = s.run;
    const out = {};
    const snap = () => ({ hp: p.hp, max: p.maxHp, cash: run.pettyCash, desk: run.deskItems.length, shield: p.maxShield, flags: { ...run.flags }, crit: p.stats.critChance, entities: s.world.entities.length });
    const eff = (name) => { const b = snap(); const o = ev.applyEffect(s, name); return { b, a: snap(), o }; };
    p.hp = 50; out.heal_small = eff('heal_small');
    p.hp = 50; out.heal_full = eff('heal_full');
    p.hp = 100; out.lose_hp_small = eff('lose_hp_small');
    p.hp = 5; out.lose_hp_large_lethal_guard = eff('lose_hp_large');
    p.hp = p.maxHp;
    out.gain_cash_small = eff('gain_cash_small');
    out.gain_cash_large = eff('gain_cash_large');
    out.lose_cash = eff('lose_cash');
    out.gain_desk_item = eff('gain_desk_item');
    out.gain_weapon_rare = eff('gain_weapon_rare');
    out.curse_marked = eff('curse_marked');
    out.rage_full_next = eff('rage_full_next');
    out.reveal_weakness = eff('reveal_weakness');
    out.shield_up = eff('shield_up');
    out.max_hp_up = eff('max_hp_up');
    out.max_hp_down = eff('max_hp_down');
    out.free_reroll = eff('free_reroll');
    out.annual_leave_small = eff('annual_leave_small');
    out.nothing = eff('nothing');
    run.pettyCash = 200; out.gamble_cash = eff('gamble_cash');
    // next-floor flags are consumed by the floor installers
    for (const f of common.floorInstallers) f(s);
    out.nextFloor = { marked: p.status.marked, rage: p.rage, flagsLeft: { m: run.flags.markedNext, r: run.flags.rageFullNext } };
    // elite fight
    const o = ev.applyEffect(s, 'spawn_elite_fight');
    o.after();
    for (let i = 0; i < 5; i++) s.world.update(1 / 60);
    const elites = s.world.actors.filter((a) => a.team === 'enemy' && a.elite);
    out.elite = { n: elites.length, floorCleared: s.world.floorCleared, locked: s.world.rooms.some((r) => r.locked), live: s.world.totalLiveEnemies() };
    for (const e of elites) s.world.damage(e, { amount: 99999, type: 'blunt', method: 'melee', source: p, unavoidable: true });
    for (let i = 0; i < 120; i++) s.world.update(1 / 60);
    out.eliteAfter = { floorCleared: s.world.floorCleared, locked: s.world.rooms.some((r) => r.locked) };
    // gain_benefit opens an email after the dialog
    const gb = ev.applyEffect(s, 'gain_benefit'); gb.after();
    return out;
  });
  const a = (k) => r[k].a, b = (k) => r[k].b;
  assert(a('heal_small').hp > b('heal_small').hp, 'heal_small heals');
  assert(a('heal_full').hp === a('heal_full').max, 'heal_full heals to maximum');
  assert(a('lose_hp_small').hp < b('lose_hp_small').hp, 'lose_hp_small hurts');
  assert(a('lose_hp_large_lethal_guard').hp >= 1, 'lose_hp_large can never kill (min 1 HP)');
  assert(a('gain_cash_small').cash > b('gain_cash_small').cash && a('gain_cash_large').cash > a('gain_cash_small').cash, 'gain_cash small/large add Petty Cash');
  assert(a('lose_cash').cash < b('lose_cash').cash, 'lose_cash removes Petty Cash');
  assert(a('gain_desk_item').desk === b('gain_desk_item').desk + 1, 'gain_desk_item grants a Desk Item');
  assert(a('gain_weapon_rare').entities > b('gain_weapon_rare').entities, 'gain_weapon_rare drops a weapon');
  assert(a('curse_marked').flags.markedNext === true && r.nextFloor.marked > 0 && !r.nextFloor.flagsLeft.m, 'curse_marked applies status.marked on the next floor and is consumed');
  assert(a('rage_full_next').flags.rageFullNext === true && r.nextFloor.rage === 100, 'rage_full_next fills Rage on the next floor');
  assert(a('reveal_weakness').crit > b('reveal_weakness').crit && r.reveal_weakness.o.lines.length > 0, 'reveal_weakness grants intel (fallback: +2% crit when no promoted staff)');
  assert(a('shield_up').shield > b('shield_up').shield, 'shield_up +10 max shield');
  assert(a('max_hp_up').max === b('max_hp_up').max + 10 && a('max_hp_down').max === b('max_hp_down').max - 10, 'max_hp_up / max_hp_down change max Wellbeing by 10');
  assert(a('free_reroll').flags.bonusRerolls === 1, 'free_reroll adds a bonus reroll');
  assert(a('annual_leave_small').flags.bonusLeave >= 1, 'annual_leave_small stashes bonusLeave for the meta module');
  assert(r.gamble_cash.o.lines.length === 2, 'gamble_cash resolves one way or the other');
  assert(r.elite.n >= 1 && r.elite.live >= 1 && r.elite.locked && r.elite.floorCleared === false, `spawn_elite_fight: elite spawned, room locked, floor un-cleared (${JSON.stringify(r.elite)})`);
  assert(r.eliteAfter.floorCleared === true && !r.eliteAfter.locked, 'killing the elite unlocks the room and re-clears the floor');
  await sleep(400);
  assert((await page.evaluate(() => __cp.app.top.comp && __cp.app.top.comp.constructor.name)) === 'EmailView', 'gain_benefit opens the Benefit email');
  // cost handling
  await page.evaluate(() => { __cp.app.top.comp.done = true; });
  await sleep(300);
  const c = await page.evaluate(async () => {
    const ev = await __imp('/src/game/content/events.ts');
    const data = await __imp('/src/data/text/events.ts');
    const s = __cp.app.top;
    s.run.pettyCash = 3;
    ev.openEvent(s, data.EVENTS.find((e) => e.id === 'mandatory_fun_raffle'));
    return true;
  });
  void c;
  await sleep(900);
  const en = await page.evaluate(() => __cp.app.top.comp.btns.map((b) => ({ t: b.b.text, on: b.b.enabled })));
  console.log('  ', JSON.stringify(en));
  assert(en.length === 3 && en[0].on === false && en[0].t.includes('costs') && en[1].on && en[2].on, 'an option costing 5 is shown with its cost and disabled when you hold 3');
  await shot(page, 'event-cost');
  await ctx.close();
});

// ===========================================================================================================
await scenario('treasure', async () => {
  const { page, ctx } = await load('play&seed=8&floor=4&type=treasure');
  const info = await page.evaluate(() => { const s = __cp.app.top; return { labels: s.world.interactables.map((i) => i.label), enemies: s.world.totalLiveEnemies(), cleared: s.world.floorCleared }; });
  assert(info.enemies === 0, 'no combat on a treasure floor');
  assert(info.labels.includes('Open the Stationery Cupboard'), 'stationery cupboard interactable exists');
  assert(await interactWith(page, /Stationery Cupboard/), 'opened the cupboard');
  assert((await page.evaluate(() => __cp.app.top.comp && __cp.app.top.comp.constructor.name)) === 'EmailView', 'cupboard opens a choice email');
  await sleep(2500);
  await shot(page, 'treasure');
  const cards = await page.evaluate(() => __cp.app.top.comp.cards.map((c) => ({ tag: c.a.tag, title: c.a.title, rarity: c.a.rarity })));
  console.log('  ', JSON.stringify(cards));
  assert(cards.length === 3, 'three attachments');
  assert(cards.map((c) => c.tag).join(',') === 'DESK,BENEFIT,WEAPON', `a Desk Item, an Enhanced Benefit and a rare weapon (${cards.map((c) => c.tag)})`);
  assert(cards[1].rarity >= 1 && cards[2].rarity >= 1, 'benefit is Enhanced or better, weapon is rare or better');
  const b0 = await page.evaluate(() => ({ n: __cp.app.scenes[0].run.benefits.length, d: __cp.app.scenes[0].run.deskItems.length }));
  await tap(page, 'ArrowRight'); await tap(page, 'Enter'); await sleep(1500);
  const b1 = await page.evaluate(() => ({ n: __cp.app.scenes[0].run.benefits.slice(), d: __cp.app.scenes[0].run.deskItems.length, top: __cp.app.top.name, label: __cp.app.top.world.interactables[0].label }));
  console.log('  ', JSON.stringify(b1));
  assert(b1.n.length === b0.n + 1 && b1.n[0].rarity >= 1 && b1.d === b0.d, 'taking the Benefit adds an Enhanced+ Benefit only');
  assert(b1.top === 'gameplay', 'gameplay resumes');
  assert(await page.evaluate(() => !__cp.app.top.world.interactables.find((i) => /cupboard/i.test(i.label) && i.enabled())), 'the cupboard cannot be looted twice');
  await ctx.close();
});

// ===========================================================================================================
const killAll = (page) => page.evaluate(() => { const s = __cp.app.top; for (const a of s.world.actors) if (a.team === 'enemy' && a.alive) s.world.damage(a, { amount: 99999, type: 'blunt', method: 'melee', source: s.player, unavoidable: true }); for (let i = 0; i < 60; i++) s.world.update(1 / 60); });
const restart = (page, patch) => page.evaluate((p) => { const s = __cp.app.top; Object.assign(s.run.plan, p); s.startFloor(); for (let i = 0; i < 5; i++) s.world.update(1 / 60); return { alarm: s.world.alarm, enemies: s.world.totalLiveEnemies(), c: s.data.challenge && { ...s.data.challenge } }; }, patch);

await scenario('challenge', async () => {
  const { page, ctx } = await load('play&seed=9&floor=4&type=challenge');
  // --- Fire Drill: success
  let r = await restart(page, { floor_type: 'challenge', challenge: 'fire_drill', reward: 'challenge' });
  console.log('  ', JSON.stringify(r));
  assert(r.c && r.c.kind === 'fire_drill' && r.alarm === true, 'Fire Drill: alarm on (doors open, everyone hunts)');
  assert(r.enemies > 0, 'Fire Drill floor is populated with enemies');
  assert(r.c.limit >= 75 && r.c.limit <= 160, `time limit scales with enemy budget (${r.c.limit}s)`);
  await page.evaluate(() => { const s = __cp.app.top; for (let i = 0; i < 180; i++) s.world.update(1 / 60); });
  const t1 = await page.evaluate(() => __cp.app.top.data.challenge.t);
  assert(t1 > 2.5, `timer runs with simulation time (${t1.toFixed(1)}s)`);
  await sleep(300);
  await shot(page, 'firedrill-hud');
  await killAll(page);
  let res = await page.evaluate(() => { const s = __cp.app.top; const c = s.data.challenge; return { state: c.state, left: c.timeLeftFrac, cleared: s.world.floorCleared, banner: s.hud.banner && s.hud.banner.text }; });
  console.log('  ', JSON.stringify(res));
  assert(res.cleared && res.state === 'success', 'clearing before the timer = success');
  await shot(page, 'firedrill-success');
  // reward comparison on a clean floor with the player far away from the drops
  const cmp = (state, extra) => page.evaluate(async ({ state, extra }) => {
    const reg = await __imp('/src/game/registry.ts');
    const s = __cp.app.top;
    for (const e of s.world.entities) if (e.o) e.dead = true;
    s.world.update(1 / 60);
    const c = s.data.challenge; c.state = state; Object.assign(c, extra || {});
    s.player.x -= 400; if (!s.world.isWalkablePx(s.player.x, s.player.y)) s.player.x += 800;
    reg.REWARD_GRANT.challenge(s, { x: s.player.x + 200, y: s.player.y + 40 });
    for (let i = 0; i < 4; i++) s.world.update(1 / 60);
    const es = s.world.entities.filter((e) => e.o);
    return { cash: es.filter((e) => e.o.kind === 'cash').reduce((a, e) => a + e.o.amount, 0), rewards: es.filter((e) => e.o.kind === 'reward').map((e) => e.o.reward.label) };
  }, { state, extra });
  const win = await cmp('success', { timeLeftFrac: 0.6 });
  r = await restart(page, { floor_type: 'challenge', challenge: 'fire_drill', reward: 'challenge' });
  const lose = await cmp('failed');
  console.log('  ', JSON.stringify({ win, lose }));
  assert(win.rewards.some((l) => /Bonus Benefit/.test(l)), 'success spawns a bonus Benefit reward');
  assert(lose.rewards.length === 0 && lose.cash > 0 && lose.cash < win.cash, `failure: reduced reward (cash only, ${lose.cash} < ${win.cash})`);
  // the real failure path
  r = await restart(page, { floor_type: 'challenge', challenge: 'fire_drill', reward: 'challenge' });
  await page.evaluate(() => { const s = __cp.app.top; s.data.challenge.t = s.data.challenge.limit - 0.01; for (let i = 0; i < 10; i++) s.world.update(1 / 60); });
  assert((await page.evaluate(() => __cp.app.top.data.challenge.state)) === 'failed', 'running out the clock = failed');
  await sleep(200);
  await shot(page, 'firedrill-failed');
  // --- Quiet Carriage
  r = await restart(page, { floor_type: 'challenge', challenge: 'quiet_carriage', reward: 'challenge' });
  assert(r.c.kind === 'quiet_carriage' && r.alarm === false, 'Quiet Carriage loaded');
  const q = await page.evaluate(() => { const s = __cp.app.top; const p = s.player; p.addRage(100); const a = p.rage; p.rage = 100; for (let i = 0; i < 3; i++) s.world.update(1 / 60); const b = p.rage; p.activateRage(); p.raging = 0; return { gained: a, afterFill: b, banned: p.bannedVerbs.has('rage'), raging: p.raging }; });
  assert(q.gained === 0 && q.afterFill === 0 && q.banned && q.raging === 0, `Rage disabled: gain blocked, gauge pinned to 0, activation refused (${JSON.stringify(q)})`);
  // damage taken while enemies bark / hit must not raise Rage either
  const q2 = await page.evaluate(() => { const s = __cp.app.top; const p = s.player; s.world.damage(p, { amount: 10, type: 'blunt', method: 'melee', source: s.world.actors.find((a) => a.team === 'enemy'), unavoidable: true }); for (let i = 0; i < 3; i++) s.world.update(1 / 60); return { rage: p.rage, flawless: s.data.challenge.flawless }; });
  assert(q2.rage === 0 && q2.flawless === false, 'taking damage gives no Rage and breaks the flawless record');
  await sleep(300);
  await shot(page, 'quiet-carriage-hud');
  await killAll(page);
  const labels = () => page.evaluate(() => __cp.app.top.world.entities.filter((e) => e.o && e.o.kind === 'reward').map((e) => e.o.reward.label));
  res = { state: await page.evaluate(() => __cp.app.top.data.challenge.state), pickups: await labels() };
  assert(res.state === 'success' && res.pickups.some((l) => /Bonus Benefit/.test(l)), 'Quiet Carriage success: bonus Benefit');
  assert(!res.pickups.some((l) => /Take:/.test(l)), 'no Desk Item without a flawless run');
  // flawless run gives a Desk Item too
  r = await restart(page, { floor_type: 'challenge', challenge: 'quiet_carriage', reward: 'challenge' });
  await killAll(page);
  res = { pickups: await labels() };
  assert(res.pickups.some((l) => /Take:/.test(l)), 'flawless Quiet Carriage also pays a Desk Item');
  await ctx.close();
});

// ===========================================================================================================
await scenario('rewards', async () => {
  const { page, ctx } = await load('play&seed=14&floor=6');
  const r = await page.evaluate(async () => {
    const reg = await __imp('/src/game/registry.ts');
    await __imp('/src/game/content/rewards.ts');
    const s = __cp.app.top;
    const out = {};
    const at = { x: s.player.x + 10, y: s.player.y };
    s.player.x -= 150; if (!s.world.isWalkablePx(s.player.x, s.player.y)) s.player.x += 300;
    s.player.hp = 30;
    const kinds = () => s.world.entities.filter((e) => e.o).map((e) => e.o.kind + (e.o.weapon ? ':' + e.o.weapon.id : '') + (e.o.amount ? ':' + e.o.amount : ''));
    const clear = () => { for (const e of s.world.entities) if (e.o) e.dead = true; s.world.update(1 / 60); };
    for (const k of ['cash', 'heal', 'weapon', 'benefit', 'rage_mod', 'desk_item', 'elite']) {
      clear(); s.plan.floor_type = k === 'elite' ? 'elite' : 'standard'; s.plan.reward = k; s.plan.rewardDept = 'finance';
      reg.REWARD_GRANT[k](s, at);
      for (let i = 0; i < 30; i++) s.world.update(1 / 60);
      out[k] = kinds();
    }
    // weapon rarity scaling: sample many elite weapon rewards vs standard
    const rar = async (elite) => { const w = await __imp('/src/game/weapons.ts'); let n = 0, tot = 0; for (let i = 0; i < 80; i++) { clear(); s.plan.floor_type = elite ? 'elite' : 'standard'; s.floorRng.loot = new (s.floorRng.loot.constructor)(1000 + i); reg.REWARD_GRANT.weapon(s, at); const p = s.world.entities.find((e) => e.o && e.o.weapon); if (p && w.def(p.o.weapon.id).rarity >= 1) n++; tot++; } return n / tot; };
    out.rareStd = await rar(false); out.rareElite = await rar(true);
    clear();
    return out;
  });
  console.log('  ', JSON.stringify(r));
  assert(r.cash.length >= 3 && r.cash.every((k) => k.startsWith('cash')), 'cash reward scatters Petty Cash');
  assert(r.heal.every((k) => k.startsWith('heal')) && r.heal.length >= 1, 'heal reward spawns food pickups');
  assert(r.weapon.length === 1 && r.weapon[0].startsWith('weapon'), 'weapon reward spawns one weapon');
  assert(r.benefit.length === 1 && r.benefit[0] === 'reward', 'benefit reward spawns a glowing reward pickup');
  assert(r.rage_mod.length === 1 && r.rage_mod[0] === 'reward', 'rage_mod reward spawns a Stress Modifier pickup');
  assert(r.desk_item.length === 1 && r.desk_item[0] === 'reward', 'desk_item reward spawns a pickup');
  assert(r.elite.some((k) => k.startsWith('weapon')) && r.elite.some((k) => k.startsWith('cash')), 'elite bonus: rare weapon plus cash');
  assert(r.rareElite >= 0.95 && r.rareElite >= r.rareStd, `elite weapon rewards are always rare+ (${r.rareElite}) vs standard (${r.rareStd})`);
  // Stress Modifier email
  await page.evaluate(() => { const s = __cp.app.top; const pk = s.world.entities.find((e) => e.o && e.o.kind === 'reward'); void pk; });
  const pk = await page.evaluate(async () => {
    const reg = await __imp('/src/game/registry.ts');
    const s = __cp.app.top;
    for (const e of s.world.entities) if (e.o) e.dead = true;
    s.world.update(1 / 60);
    reg.REWARD_GRANT.rage_mod(s, { x: s.player.x, y: s.player.y + 2 });
    for (let i = 0; i < 40; i++) s.world.update(1 / 60);
    const p = s.world.entities.find((e) => e.o && e.o.kind === 'reward');
    s.player.x = p.x; s.player.y = p.y + 3;
    for (let i = 0; i < 10; i++) s.world.update(1 / 60);
    return true;
  });
  void pk;
  await tap(page, 'KeyE'); await sleep(2800);
  assert((await page.evaluate(() => __cp.app.top.comp && __cp.app.top.comp.constructor.name)) === 'EmailView', 'Stress Modifier pickup opens a choice email');
  const subj = await page.evaluate(() => __cp.app.top.comp.o.subject + ' | ' + __cp.app.top.comp.o.attachments.map((a) => a.title + ':' + a.subtitle).join(' ; '));
  console.log('  ', subj);
  assert(/Stress Modifier/.test(subj), 'subject "Re: Your Stress Modifier"');
  await shot(page, 'stress-email');
  await tap(page, 'Enter'); await sleep(1400);
  const held = await page.evaluate(() => __cp.app.scenes[0].run.benefits.map((b) => b.id));
  assert(held.length === 1 && held[0].startsWith('stress_'), `the chosen Stress Modifier is held (${held})`);
  await ctx.close();
});

// ===========================================================================================================
/** In-page harness shared by the effect scenarios: builds enemies, resets state, runs named checks. */
const EFFECT_PRELUDE = `
  const sp = await __imp('/src/game/spawner.ts');
  const ben = await __imp('/src/game/content/benefits.ts');
  const desk = await __imp('/src/game/content/deskitems.ts');
  const common = await __imp('/src/game/content/common.ts');
  const pk = await __imp('/src/game/pickups.ts');
  const s = __cp.app.top, w = s.world, p = s.player, run = s.run;
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const step = (n = 1) => { for (let i = 0; i < n; i++) w.update(1 / 60); };
  const dead = () => { for (const a of w.actors) if (a.team === 'enemy') { a.dead = true; a.corpse = true; } step(2); };
  const reset = () => {
    const d = s.data.cpDispose || {}; for (const k of Object.keys(d)) { d[k](); delete d[k]; }
    run.benefits.length = 0; run.deskItems.length = 0; run.extraMods.length = 0; run.flags = {}; run.debt = 0; run.pettyCash = 0;
    for (const e of w.entities) if (e.o) e.dead = true;
    dead();
    p.refreshStats(); p.hp = p.maxHp; p.shield = p.maxShield; p.rage = 0; p.raging = 0; p.autoDodge = 0; p.nextHitCrit = false; p.invuln = 0; p.status.wet = 0; p.status.slow = 0; p.dashCharges = p.stats.dashCharges;
    p.outgoingMods.length = 0; p.incomingMods.length = 0; p.deathSavers.length = 0;
    p.stats = { ...p.stats }; 
    s.state = 'play';
  };
  const room = () => w.roomAt(p.x, p.y);
  const spawn = (dx = 30, dy = 0, arch = 'intern') => {
    const e = sp.makeEnemy(s.spawn, { archetype: arch, tier: 0, roomId: room() }, p.x + dx, p.y + dy, true);
    e.behaviour = { think() {} }; e.maxHp = e.hp = 1e6; e.barkRate = 0; e.world.assignToRoom(e, room());
    return e;
  };
  const noCrit = () => { p.stats = { ...p.stats, critChance: 0 }; };
  const add = (id, r = 0) => { ben.addBenefit(s, id, r); noCrit(); };
  const hit = (e, amt = 10, method = 'melee') => { noCrit(); return p.dealHit(e, amt, method, 0, 0, 'fists', 0); };
  const emit = (t, d) => w.bus.emit(t, d);
  const kill = (e, method = 'melee') => emit('kill', { victim: e, killer: p, method });
  const give = (id) => desk.acquireDeskItem(s, id, { quiet: true });
  const cashPickups = () => w.entities.filter((e) => e.o && e.o.kind === 'cash').length;
`;
async function effectScenario(name, body) {
  await scenario(name, async () => {
    const { page, ctx } = await load('play&seed=21&floor=3');
    await page.evaluate(() => { const s = __cp.app.top; for (const a of s.world.actors) if (a.team === 'enemy') { a.dead = true; a.corpse = true; } s.world.update(1 / 60); });
    const results = await page.evaluate(`(async () => { ${EFFECT_PRELUDE}
      try { ${body}
      } catch (e) { check('threw', false, e.stack || e.message); }
      return results; })()`);
    for (const r of results) assert(r.ok, r.name + (r.ok || !r.detail ? '' : ` [${r.detail}]`));
    await ctx.close();
  });
}

await effectScenario('benefits-it-facilities', `
  reset(); add('chain_shock'); { const a = spawn(20), b = spawn(40); hit(a); step(2);
    check('IT chain_shock: melee hit shocks a neighbour', b.hp < b.maxHp && b.status.electrified > 0, b.maxHp - b.hp); }
  reset(); add('live_wires'); { const a = spawn(20); const base = hit(a); a.status.electrified = 3; const hot = hit(a);
    check('IT live_wires: shocked enemies take +8%', Math.abs(hot / base - 1.08) < 0.01, hot / base);
    const pr = w.addProp({ id: 77001, kind: 'socket', x: p.x + 50, y: p.y, w: 8, h: 8, solid: false, variant: 0, roomId: room(), facing: 0, hazard: true });
    pr.data.electrified = 1; step(30); check('IT live_wires: electrified hazards decay slower (1.5x)', pr.data.electrified > 0.55, pr.data.electrified); pr.gone = true; }
  reset(); add('surge'); { const a = spawn(20); p.nextHitCrit = true; hit(a); check('IT surge: crit stuns the target', a.status.stun >= 0.5, a.status.stun); }
  reset(); add('ups'); { const a = spawn(30); p.shield = 0; emit('playerHit', { amount: 5, source: null, method: 'melee', absorbed: 4 });
    check('IT ups: shield break discharges (stun + damage)', a.status.stun >= 1 && a.hp < a.maxHp, a.status.stun); }
  reset(); add('cache_flush'); { p.dashCharges = 0; kill(spawn(20)); check('IT cache_flush: kills recharge dash', Math.abs(p.dashCharges - 0.25) < 0.01, p.dashCharges); }
  reset(); add('remote_desktop'); { const a = spawn(20); emit('hit', { target: a, amount: 5, crit: false, method: 'throw' }); check('IT remote_desktop: thrown hit shocks', a.status.electrified > 0 && a.status.stun >= 0.6); }
  reset(); add('ticket_closed'); { const a = spawn(20); a.status.electrified = 2; const n0 = cashPickups(); kill(a); step(1); check('IT ticket_closed: shocked kill drops extra cash', cashPickups() > n0); }
  reset(); add('bandwidth_throttling'); { const a = spawn(40); step(20); check('IT bandwidth_throttling: nearby enemies slowed', a.status.slow > 0 && a.status.slowAmt >= 0.15, a.status.slowAmt); }
  reset(); add('blue_screen'); { const a = spawn(60); emit('execution', { type: 'photocopier', victim: spawn(10) }); check('IT blue_screen: execution blasts the room', a.status.stun >= 1 && a.hp < a.maxHp); }
  reset(); add('reboot'); { const a = spawn(30); p.hp = 30; p.shield = 0; emit('playerHit', { amount: 1, source: null, method: 'melee', absorbed: 0 }); check('IT reboot: shield restored + stun below 35%', p.shield === p.maxShield && a.status.stun >= 0.8); }
  reset(); add('firmware_update', 2); check('IT firmware_update: ranged damage x1.5', Math.abs(p.stats.rangedDamage - 1.5) < 0.001, p.stats.rangedDamage);

  reset(); add('industrial_grade', 2); check('FAC industrial_grade: hazard damage x2', p.stats.hazardDamage === 2, p.stats.hazardDamage);
  reset(); add('demolition_permit', 1); check('FAC demolition_permit: breach stun/cash up and pushed to world', p.stats.breachStun === 2.2 && p.stats.breachCash === 2 && w.breachStunMult === 2.2, w.breachStunMult);
  reset(); add('hard_hat'); check('FAC hard_hat: damage taken x0.94', Math.abs(p.stats.damageTaken - 0.94) < 0.001);
  reset(); add('wet_floor_sign'); { const a = spawn(20); const base = hit(a); a.status.wet = 3; const wet = hit(a); check('FAC wet_floor_sign: +20% vs wet', Math.abs(wet / base - 1.2) < 0.01, wet / base); }
  reset(); add('non_slip'); { p.status.wet = 3; step(2); check('FAC non_slip: never wet', p.status.wet === 0); }
  reset(); { const a = spawn(60); const r = room(); w.rooms[r].entered = false; add('sprinkler_maintenance'); step(2); w.rooms[r].entered = true; step(3); check('FAC sprinkler_maintenance: room enemies soaked on entry', a.status.wet > 4, a.status.wet); }
  reset(); add('spill_kit'); { const n0 = (w.wetZones || []).length; kill(spawn(30)); check('FAC spill_kit: kill leaves a puddle', (w.wetZones || []).length === n0 + 1); }
  reset(); add('maintenance_contract', 2); { const pr = w.addProp({ id: 77002, kind: 'photocopier', x: p.x + 80, y: p.y, w: 32, h: 16, solid: false, variant: 0, roomId: room(), facing: 0, exec: 'photocopier' }); pr.used = true; step(600); check('FAC maintenance_contract: used exec object repaired (9s)', pr.used === false, pr.used); pr.gone = true; }
  reset(); add('hs_inspector'); { p.hp = 50; const n0 = cashPickups(); const hp0 = p.hp; kill(spawn(30), 'hazard'); step(1); check('FAC hs_inspector: hazard kill pays + heals', cashPickups() > n0 && p.hp > hp0); }
  reset(); add('deep_clean_rota'); { const m = run.loadout.melee; m.maxDur = 1000; m.dur = 1000; step(1); for (let i = 0; i < 300; i++) { m.dur -= 1; step(1); } check('FAC deep_clean_rota: melee wear refunded (x1.25 life)', m.dur > 740 && m.dur < 780, m.dur); }
  reset(); add('steel_toe_caps', 2); check('FAC steel_toe_caps: knockback x2', p.stats.knockbackDealt === 2);
  reset(); add('non_slip', 2); check('FAC non_slip: move speed up', p.stats.moveSpeed > 106);
`);

await effectScenario('benefits-sales-marketing', `
  reset(); add('hard_close'); { const a = spawn(30); p.aim = 0; p.ctl.move = { x: 1, y: 0 }; p.startDash(); step(14); p.ctl.move = { x: 0, y: 0 }; check('SALES hard_close: dash damages enemies passed through', a.hp < a.maxHp, a.maxHp - a.hp); }
  reset(); add('cold_call'); { emit('dashEnd', { x: p.x, y: p.y }); check('SALES cold_call: next hit after a dash is a crit', p.nextHitCrit === true); }
  reset(); add('commission'); { kill(spawn(20)); kill(spawn(20)); step(1); check('SALES commission: kills stack speed', Math.abs(p.stats.moveSpeed / 96 - 1.1) < 0.01, p.stats.moveSpeed); step(300); check('SALES commission: stacks decay after 4s', Math.abs(p.stats.moveSpeed - 96) < 0.01, p.stats.moveSpeed); }
  reset(); ben.addBenefit(s, 'stretch_target', 2); check('SALES stretch_target: melee x1.22, crit +8%', Math.abs(p.stats.meleeDamage - 1.22) < 0.001 && Math.abs(p.stats.critChance - 0.13) < 0.001);
  reset(); add('elevator_pitch', 2); check('SALES elevator_pitch (Executive): extra dash charge', p.stats.dashCharges === 3, p.stats.dashCharges);
  reset(); add('spiff'); { run.pettyCash = 0; kill(spawn(20)); kill(spawn(20)); check('SALES spiff: second kill within 2s pays', run.pettyCash === 2, run.pettyCash); }
  reset(); add('leaderboard_pressure'); { const a = spawn(20); const base = hit(a); spawn(30); spawn(40); spawn(50); const crowd = hit(a); check('SALES leaderboard_pressure: +12% with 4+ in the room', Math.abs(crowd / base - 1.12) < 0.01, crowd / base); }
  reset(); add('ring_the_gong'); { const a = spawn(30); for (let i = 0; i < 6; i++) kill(spawn(500)); check('SALES ring_the_gong: every 6th kill stuns nearby', a.status.stun >= 0.5, a.status.stun); }
  reset(); add('target_driven'); { p.hp = 30; step(2); check('SALES target_driven: attack speed up below 40%', Math.abs(p.stats.meleeSpeed - 1.15) < 0.001, p.stats.meleeSpeed); }
  reset(); add('premium_tier', 2); check('SALES premium_tier: heavy x1.6', Math.abs(p.stats.heavyDamage - 1.6) < 0.001);

  reset(); add('rebrand'); { const a = spawn(20), b = spawn(40); emit('throwHit', { victim: a, hitActor: b }); check('MKT rebrand: thrown enemy confuses what it hits', b.status.confused >= 2); }
  reset(); add('go_viral', 2); { const a = spawn(20), b = spawn(40); a.status.confused = 3; step(15); check('MKT go_viral (Executive): confusion spreads', b.status.confused > 0); }
  reset(); add('brand_engagement'); check('MKT brand_engagement: grab range +25%', Math.abs(p.stats.grabRange - 26 * 1.25) < 0.01 && Math.abs(p.stats.grabThreshold - 0.29) < 0.001);
  reset(); add('press_release'); { const a = spawn(40); kill(spawn(20), 'throw'); check('MKT press_release: throw kill stuns nearby', a.status.stun >= 0.8); }
  reset(); add('influencer_collab'); { const a = spawn(50); emit('grab', { victim: spawn(10) }); check('MKT influencer_collab: grab mesmerises neighbours', a.status.confused >= 1.5); }
  reset(); add('teaser_campaign'); { const a = spawn(20), b = spawn(30); hit(a); hit(b); check('MKT teaser_campaign: only the first hit enemy per room stuns', a.status.stun >= 1 && b.status.stun === 0, a.status.stun + '/' + b.status.stun); }
  reset(); add('flash_mob'); { const a = spawn(30); emit('dashEnd', { x: p.x, y: p.y }); check('MKT flash_mob: dash end confuses nearby', a.status.confused >= 1); }
  reset(); add('ab_testing', 2); { const a = spawn(20); let n = 0; for (let i = 0; i < 40; i++) { a.status.stun = 0; a.status.confused = 0; a.status.slow = 0; hit(a); if (a.status.stun > 0 || a.status.confused > 0 || a.status.slow > 0) n++; } check('MKT ab_testing: some hits run experiments', n > 5 && n < 40, n); }
  reset(); add('brand_ambassador', 1); check('MKT brand_ambassador: jargon x1.9', Math.abs(p.stats.rageJargonFill - 1.9) < 0.001);
  reset(); add('engagement_metrics'); check('MKT engagement_metrics: stagger x1.3', Math.abs(p.stats.staggerDealt - 1.3) < 0.001);
  reset(); add('rebrand_rollout'); check('MKT rebrand_rollout: throw damage x1.3', Math.abs(p.stats.throwDamage - 1.3) < 0.001);
`);

await effectScenario('benefits-finance-legal', `
  reset(); add('compound_interest'); { run.pettyCash = 100; const r = room(); spawn(30); emit('roomClear', { roomId: r }); check('FIN compound_interest: 3% interest on clear', run.pettyCash === 103, run.pettyCash); }
  reset(); add('shareholder_value'); { const a = spawn(20); run.pettyCash = 0; const base = hit(a); run.pettyCash = 100; const rich = hit(a); check('FIN shareholder_value: +10% per 100 held (2 x 5%)', Math.abs(rich / base - 1.1) < 0.01, rich / base); }
  reset(); add('performance_bonus', 2); check('FIN performance_bonus: cash x1.5', p.stats.cashMult === 1.5);
  reset(); add('rate_card', 2); check('FIN rate_card: 25% shop discount', Math.abs(p.stats.shopDiscount - 0.25) < 0.001);
  reset(); add('tax_loophole', 2); { const n0 = cashPickups(); for (let i = 0; i < 60; i++) kill(spawn(20)); step(1); check('FIN tax_loophole: some kills drop double cash', cashPickups() > n0, cashPickups() - n0); }
  reset(); add('asset_stripping'); { run.pettyCash = 0; emit('weaponBreak', { id: 'keyboard', slot: 'melee' }); check('FIN asset_stripping: broken weapon pays', run.pettyCash === 10, run.pettyCash); }
  reset(); add('golden_parachute'); { run.pettyCash = 100; p.hp = 20; emit('playerHit', { amount: 1, source: null, method: 'melee', absorbed: 0 }); check('FIN golden_parachute: pay to heal below 25%', p.hp >= 55 && run.pettyCash === 70, p.hp + '/' + run.pettyCash); }
  reset(); add('quarterly_dividend'); { run.pettyCash = 0; s.plan.floor_type = 'standard'; emit('floorClear', { floor: 3 }); check('FIN quarterly_dividend: floor clear pays 10 + floor', run.pettyCash === 13, run.pettyCash); }
  reset(); add('day_trading', 2); { run.pettyCash = 0; for (let i = 0; i < 100; i++) { run.pettyCash += 9; emit('pickup', { kind: 'cash', amount: 9 }); } check('FIN day_trading: some pickups double', run.pettyCash > 900, run.pettyCash); }
  reset(); add('expense_account', 1); check('FIN expense_account: 2 free rerolls recorded', ben.BENEFITS.find((b) => b.id === 'expense_account').desc[1].includes('2 rerolls'));
  reset(); add('overdraft', 1); check('FIN overdraft: credit limit 150', common.creditLimit(run) === 150);

  reset(); add('injunction'); { const a = spawn(20); const first = hit(a); const second = hit(a); check('LEGAL injunction: hit serves 3s injunction (+30%)', a.status.injunction >= 3 && Math.abs(second / first - 1.3) < 0.01, second / first); }
  reset(); add('cease_and_desist'); { const a = spawn(20); hit(a); check('LEGAL cease_and_desist: slows the target', a.status.slow >= 2 && a.status.slowAmt >= 0.25); }
  reset(); add('gag_order', 2); { const a = spawn(20); let n = 0; for (let i = 0; i < 40; i++) { a.status.blind = 0; hit(a); if (a.status.blind > 0) n++; } check('LEGAL gag_order: some hits gag (cannot attack)', n > 4 && n < 40, n); }
  reset(); add('small_print', 2); check('LEGAL small_print: crit multiplier +0.9', Math.abs(p.stats.critMult - 2.65) < 0.001, p.stats.critMult);
  reset(); add('discovery_phase'); { const a = spawn(20); const first = hit(a); const second = hit(a); check('LEGAL discovery_phase: first hit +40%', Math.abs(first / second - 1.4) < 0.01, first / second); }
  reset(); add('class_action'); { const a = spawn(20), b = spawn(40); a.status.injunction = 5; b.status.injunction = 5; hit(a, 100); step(1); check('LEGAL class_action: splash to other injuncted enemies', b.hp < b.maxHp, b.maxHp - b.hp); }
  reset(); add('binding_arbitration'); { const a = spawn(20); const base = hit(a); a.status.stun = 2; const stunned = hit(a); check('LEGAL binding_arbitration: +20% vs stunned', Math.abs(stunned / base - 1.2) < 0.01, stunned / base); }
  reset(); add('case_law'); { const a = spawn(20); const h1 = hit(a); const h2 = hit(a); const h3 = hit(a); check('LEGAL case_law: consecutive hits stack', h3 > h2 && h2 > h1, [h1, h2, h3].map((x) => x.toFixed(1))); }
  reset(); add('summary_judgement', 2); { const a = spawn(20); a.maxHp = 1000; a.hp = 150; hit(a, 5); step(1); check('LEGAL summary_judgement: low-HP target is settled', !a.alive, a.hp); }
  reset(); add('terms_and_conditions'); check('LEGAL terms_and_conditions: bleed damage x1.4', Math.abs(p.stats.bleedDamage - 1.4) < 0.001);
  reset(); add('limitation_of_liability'); check('LEGAL limitation_of_liability: damage taken x0.95', Math.abs(p.stats.damageTaken - 0.95) < 0.001);
`);

await effectScenario('benefits-hr-exec-synergy', `
  reset(); add('wellbeing_hour', 2); check('HR wellbeing_hour: regen x2.1, delay x0.5', Math.abs(p.stats.shieldRegenRate - 14 * 2.1) < 0.01 && Math.abs(p.stats.shieldRegenDelay - 1.5) < 0.01);
  reset(); add('return_to_work'); { const r = room(); spawn(30); p.hp = 50; emit('roomClear', { roomId: r }); check('HR return_to_work: heals on room clear', p.hp === 54, p.hp); }
  reset(); add('mindfulness_app', 2); check('HR mindfulness_app: shield x1.7', Math.abs(p.maxShield - 51) < 0.01, p.maxShield);
  reset(); add('private_healthcare', 2); check('HR private_healthcare: +15 max, heal x2', p.maxHp === 115 && p.stats.healMult === 2);
  reset(); add('team_debrief', 2); check('HR team_debrief: kill heal 1.8', Math.abs(p.stats.killHeal - 1.8) < 0.001);
  reset(); add('duty_of_care', 2); { p.hp = 5; w.damage(p, { amount: 9999, type: 'blunt', method: 'melee', unavoidable: true, ignoreShield: true }); step(60); check('HR duty_of_care: survive a fatal hit (run continues)', p.hp >= 1 && p.alive && s.state === 'play', p.hp + ' ' + s.state);
    p.hp = 5; w.damage(p, { amount: 9999, type: 'blunt', method: 'melee', unavoidable: true, ignoreShield: true }); check('HR duty_of_care: only once per floor', s.state === 'dying' || !p.alive, s.state); s.state = 'play'; p.dying = false; p.corpse = false; }
  reset(); add('fruit_bowl', 2); { const n0 = w.entities.filter((e) => e.o && e.o.kind === 'heal').length; for (let i = 0; i < 60; i++) kill(spawn(20)); step(1); check('HR fruit_bowl: kills drop snacks', w.entities.filter((e) => e.o && e.o.kind === 'heal').length > n0); }
  reset(); add('employee_assistance'); { p.hp = 20; step(2); check('HR employee_assistance: shield regen x2.5 when low', Math.abs(p.stats.shieldRegenRate - 35) < 0.01, p.stats.shieldRegenRate); }
  reset(); add('trauma_counselling', 2); { emit('playerHit', { amount: 40, source: null, method: 'melee', absorbed: 0 }); p.hp = 40; step(240); check('HR trauma_counselling: heals back part of damage taken', p.hp > 50 && p.hp <= 60, p.hp); }
  reset(); { p.hp = 50; w.time = 0.1; add('annual_health_check', 2); check('HR annual_health_check: heals on a fresh floor', p.hp >= 67, p.hp); }
  reset(); add('flexible_working', 2); check('HR flexible_working: dash cooldown x0.75', Math.abs(p.stats.dashCooldown - 1.15 * 0.75) < 0.001);

  reset(); add('extended_mandate', 2); check('EXEC extended_mandate: rage +5s', p.stats.rageDuration === 12);
  reset(); add('severance_package', 2); check('EXEC severance_package: execution heal 30', p.stats.executionHeal === 30);
  reset(); add('exit_interview', 2); check('EXEC exit_interview: execution extends rage 4s', p.stats.executionRageExtend === 4);
  reset(); add('aggressive_targets', 2); check('EXEC aggressive_targets: rage damage x1.5 more', Math.abs(p.stats.rageDamage - 2.4) < 0.001);
  reset(); add('high_pressure', 2); check('EXEC high_pressure: rage fill x1.7', Math.abs(p.stats.rageFill - 1.7) < 0.001);
  reset(); add('thick_skin', 2); check('EXEC thick_skin: rage resist +0.3', Math.abs(p.stats.rageResist - 0.7) < 0.001);
  reset(); add('killer_instinct'); { p.raging = 5; p.shield = 0; kill(spawn(20)); check('EXEC killer_instinct: rage kills restore shield', p.shield === 8, p.shield); }
  reset(); add('fight_or_flight', 2); { p.hp = 50; p.shield = 0; p.dashCharges = 0; emit('rageStart', {}); check('EXEC fight_or_flight: rage start refills dash/heal/shield', p.dashCharges === p.stats.dashCharges && p.hp === 70 && p.shield === p.maxShield, p.hp); }
  reset(); add('golden_hello'); { run.pettyCash = 0; emit('execution', { type: 'photocopier', victim: spawn(10) }); check('EXEC golden_hello: execution pays', run.pettyCash === 10, run.pettyCash); }
  reset(); add('hostile_entrance'); { const a = spawn(40); emit('rageStart', {}); check('EXEC hostile_entrance: rage start shatters the room', a.status.stun >= 0.6 && a.hp < a.maxHp); }
  reset(); add('delegated_authority'); check('EXEC delegated_authority: grab threshold +8%', Math.abs(p.stats.grabThreshold - 0.33) < 0.001);
  reset(); add('succession_planning', 1); check('EXEC succession_planning: rage decay x0.35', Math.abs(p.stats.rageDecay - 0.35) < 0.001);

  reset(); add('stress_tantrum'); { const a = spawn(40); emit('rageStart', {}); check('STRESS tantrum: activation shockwave', a.hp < a.maxHp && a.status.stun >= 0.3); }
  reset(); add('stress_catharsis'); { p.hp = 50; emit('rageStart', {}); check('STRESS catharsis: heals on activation (15%)', p.hp === 65, p.hp); }
  reset(); add('stress_silent_treatment'); { const a = spawn(120); emit('rageStart', {}); check('STRESS silent treatment: stuns the room', a.status.stun >= 1); }
  reset(); add('stress_bloodlust', 1); check('STRESS bloodlust: kill heal while raging 5', p.stats.rageKillHeal === 5);
  reset(); add('stress_pressure_cooker'); check('STRESS pressure cooker: fill x1.35', Math.abs(p.stats.rageFill - 1.35) < 0.001);
  reset(); { const a = spawn(30); const r = room(); w.rooms[r].entered = false; add('stress_preloaded'); step(2); w.rooms[r].entered = true; step(3); check('STRESS preloaded: rage on entering a combat room', p.rage >= 20, p.rage); }
  reset(); add('stress_adrenaline'); { p.dashCharges = 0; emit('rageStart', {}); step(1); check('STRESS adrenaline: dash refills + cooldown x0.7', p.dashCharges === p.stats.dashCharges && Math.abs(p.stats.dashCooldown - 0.805) < 0.001, p.stats.dashCooldown); emit('rageEnd', {}); step(1); check('STRESS adrenaline: ends with rage', Math.abs(p.stats.dashCooldown - 1.15) < 0.001); }
  reset(); add('stress_hysteria'); { p.raging = 3; kill(spawn(20)); check('STRESS hysteria: kills extend rage', Math.abs(p.raging - 3.4) < 0.001, p.raging); }
  reset(); add('stress_scorched_earth'); { const a = spawn(20), b = spawn(40); p.raging = 5; hit(a, 100); step(1); check('STRESS scorched earth: raging melee splashes', b.hp < b.maxHp, b.maxHp - b.hp); }
  reset(); add('stress_overtime'); check('STRESS overtime: +3s rage', p.stats.rageDuration === 10);
  reset(); add('stress_hide'); check('STRESS thick-skinned fury: resist + damage', Math.abs(p.stats.rageResist - 0.55) < 0.001);

  reset(); add('burnout_recovery', 2); add('smart_watch', 2); { p.hp = 30; emit('rageEnd', {}); check('SYN burnout_recovery: heal 40% + shield when rage ends', p.hp === 70 && p.shield === p.maxShield, p.hp); }
  reset(); add('terms_of_service'); { const a = spawn(30); a.status.electrified = 2; step(15); check('SYN terms_of_service: shocked enemies get an injunction', a.status.injunction > 1.5, a.status.injunction); }
  reset(); add('slippery_slope'); { const a = spawn(30); a.status.wet = 2; step(15); check('SYN slippery_slope: wet enemies are confused', a.status.confused > 0); }
  reset(); add('litigation_finance'); { const a = spawn(30); a.status.injunction = 5; run.pettyCash = 0; emit('hit', { target: a, amount: 5, crit: false, method: 'melee' }); check('SYN litigation_finance: hits on injuncted enemies pay', run.pettyCash === 1, run.pettyCash); }
  reset(); add('bonus_season'); { p.raging = 5; run.pettyCash = 0; kill(spawn(20)); check('SYN bonus_season: rage kills pay and extend', run.pettyCash === 3 && Math.abs(p.raging - 5.3) < 0.001, run.pettyCash); }
  reset(); add('cto_promotion', 1); { const a = spawn(60); emit('execution', { type: 'photocopier', victim: spawn(10) }); check('SYN cto_promotion: execution arcs lightning', a.status.stun >= 1.4 && a.hp < a.maxHp); }
  reset(); add('express_delivery'); { p.dashCharges = 0; run.pettyCash = 0; emit('breach', { roomA: 0, roomB: 1 }); step(1); check('SYN express_delivery: breach refills dash, pays, speeds up', p.dashCharges === p.stats.dashCharges && run.pettyCash === 5 && p.stats.moveSpeed > 96 * 1.1); }
  reset(); add('fast_broadband', 1); { const a = spawn(30); p.aim = 0; p.ctl.move = { x: 1, y: 0 }; p.startDash(); step(14); p.ctl.move = { x: 0, y: 0 }; check('SYN fast_broadband: dash trail shocks', a.status.electrified > 0 && a.status.stun > 0.3, a.status.stun); }
  reset(); add('phishing_campaign'); { const a = spawn(30), b = spawn(50); a.status.confused = 5; step(70); check('SYN phishing_campaign: confused enemies zap each other', b.hp < b.maxHp, b.maxHp - b.hp); }
  reset(); add('crypto_mining', 1); { run.pettyCash = 0; w.inCombat = true; step(600); w.inCombat = false; check('SYN crypto_mining: passive income while in combat (2 every 4.5s)', run.pettyCash >= 4 && run.pettyCash <= 6, run.pettyCash); }
  reset(); add('smart_watch', 1); { const a = spawn(30); a.status.electrified = 2; p.hp = 50; p.shield = 0; kill(a); check('SYN smart_watch: shocked kill heals + shield', p.hp === 55 && p.shield === 10, p.hp + '/' + p.shield); }
  reset(); add('smart_building'); add('industrial_grade'); { const a = spawn(30); const pr = w.addProp({ id: 77003, kind: 'printer', x: p.x + 30, y: p.y + 6, w: 14, h: 10, solid: false, variant: 0, roomId: room(), facing: 0, hazard: true }); step(30); check('SYN smart_building: hazard near an enemy triggers itself', pr.data.autoTrigger === true && pr.data.smartT > 0, JSON.stringify(Object.keys(pr.data))); pr.gone = true; }
`);

// ===========================================================================================================
await effectScenario('desk-items', `
  reset(); give('stress_ball'); check('DESK stress_ball: rage fill x1.3', Math.abs(p.stats.rageFill - 1.3) < 0.001);
  reset(); give('out_of_office'); { const a = spawn(20); const hp0 = p.hp; w.damage(p, { amount: 20, type: 'blunt', method: 'melee', source: a }); const hp1 = p.hp; p.invuln = 0; w.damage(p, { amount: 20, type: 'blunt', method: 'melee', source: a }); check('DESK out_of_office: first hit dodged, second lands', hp1 === hp0 && p.hp + p.shield < p.maxHp + p.maxShield, hp0 + ' ' + hp1 + ' ' + p.hp); }
  reset(); give('company_card'); check('DESK company_card: 150 credit', common.creditLimit(run) === 150);
  reset(); give('gold_lanyard'); check('DESK gold_lanyard: 20% discount', Math.abs(p.stats.shopDiscount - 0.2) < 0.001);
  reset(); give('ergonomic_cushion'); check('DESK ergonomic_cushion: shield +50%', p.maxShield === 45);
  reset(); give('lucky_mug'); check('DESK lucky_mug: luck up', p.stats.luck > 0.3);
  reset(); give('noise_cancelling'); { p.status.slow = 3; step(2); check('DESK noise_cancelling: slow-immune', p.status.slow === 0); const cc = spawn(20, 0, 'call_centre'); p.invuln = 0; const hp = p.hp + p.shield; w.damage(p, { amount: 10, type: 'blunt', method: 'ranged', source: cc }); check('DESK noise_cancelling: immune to headset screams', p.hp + p.shield === hp); }
  reset(); give('standing_desk'); check('DESK standing_desk: speed +10%', Math.abs(p.stats.moveSpeed - 105.6) < 0.01);
  reset(); give('fidget_spinner'); check('DESK fidget_spinner: dash 20% faster', Math.abs(p.stats.dashCooldown - 1.15 / 1.2) < 0.001);
  reset(); give('desk_fan'); check('DESK desk_fan: shield regen +40%', Math.abs(p.stats.shieldRegenRate - 19.6) < 0.01);
  reset(); give('post_it_notes'); { const m = run.loadout.melee; m.maxDur = 1000; m.dur = 1000; step(1); for (let i = 0; i < 300; i++) { m.dur -= 1; step(1); } check('DESK post_it_notes: weapons last 30% longer', m.dur > 750 && m.dur < 790, m.dur); }
  reset(); give('duct_tape'); { const m = run.loadout.melee; m.maxDur = 50; m.dur = 10; kill(spawn(20), 'melee'); check('DESK duct_tape: melee kill repairs 1', m.dur === 11, m.dur); }
  reset(); give('lanyard_clip'); check('DESK lanyard_clip: grab range +50%, threshold +5%', Math.abs(p.stats.grabRange - 39) < 0.01 && Math.abs(p.stats.grabThreshold - 0.3) < 0.001);
  reset(); give('swear_jar'); { run.pettyCash = 0; emit('playerHit', { amount: 5, source: null, method: 'melee', absorbed: 0 }); check('DESK swear_jar: +3 per hit taken', run.pettyCash === 3, run.pettyCash); }
  reset(); give('hang_in_there'); { p.hp = 5; w.damage(p, { amount: 9999, type: 'blunt', method: 'melee', unavoidable: true, ignoreShield: true }); step(5); check('DESK hang_in_there: survive at 1 HP with full Rage (run continues)', p.alive && s.state === 'play' && p.hp >= 1 && p.rage > 90, p.hp + ' ' + p.rage + ' ' + s.state);
    p.hp = 5; p.invuln = 0; w.damage(p, { amount: 9999, type: 'blunt', method: 'melee', unavoidable: true, ignoreShield: true }); check('DESK hang_in_there: only once per run', !p.alive || s.state === 'dying'); s.state = 'play'; p.dying = false; p.corpse = false; }
  reset(); give('desk_plant'); { const r = room(); spawn(30); p.hp = 50; emit('roomClear', { roomId: r }); check('DESK desk_plant: +3 on room clear', p.hp === 53, p.hp); }
  reset(); give('calculator_watch'); check('DESK calculator_watch: +10% crit and HUD enemy HP', Math.abs(p.stats.critChance - 0.15) < 0.001 && s.hud.showEnemyHp === true);
  reset(); { run.loadout.ranged = { id: 'stapler', dur: 0, maxDur: 0, ammo: 10, maxAmmo: 10 }; give('monogrammed_stapler'); check('DESK monogrammed_stapler: +40% ammo (existing weapon too)', p.stats.ammoMult === 1.4 && run.loadout.ranged.maxAmmo === 14); }
  reset(); give('suspicious_usb'); { const a = spawn(30); emit('playerHit', { amount: 5, source: null, method: 'melee', absorbed: 0 }); check('DESK suspicious_usb: hit electrocutes nearby enemies', a.status.electrified > 0 && a.hp < a.maxHp); }
  reset(); give('coffee_loyalty'); { p.hp = 50; for (let i = 0; i < 10; i++) kill(spawn(20)); check('DESK coffee_loyalty: 10th kill = espresso (heal + rage)', p.hp === 55 && p.rage >= 15, p.hp + '/' + p.rage); }
  reset(); give('spare_hi_vis'); check('DESK spare_hi_vis: hazards -60%', Math.abs(p.stats.hazardTaken - 0.4) < 0.001);
  reset(); give('shredded_contract'); { p.dashCharges = 0; emit('execution', { type: 'shredder', victim: spawn(10) }); check('DESK shredded_contract: execution recharges dash', p.dashCharges === p.stats.dashCharges); }
  reset(); { const a = spawn(30), b = spawn(40); const r = room(); w.rooms[r].entered = false; give('fake_name_badge'); step(3); check('DESK fake_name_badge: first enemy in the room confused 3s', a.status.confused >= 2 && b.status.confused === 0, a.status.confused + '/' + b.status.confused); }
  reset(); { const a = spawn(30, 0, 'team_leader'); a.elite = true; const r = room(); w.rooms[r].entered = false; give('double_booked'); step(3); check('DESK double_booked: elites start stunned 3s', a.status.stun >= 2, a.status.stun); }
  reset(); give('cycle_helmet'); check('DESK cycle_helmet: knockback taken -50%', p.stats.knockbackTaken === 0.5);
  reset(); give('golden_handshake'); { run.pettyCash = 0; emit('execution', { type: 'shredder', victim: spawn(10) }); check('DESK golden_handshake: execution pays 15', run.pettyCash === 15, run.pettyCash); }
  reset(); give('fudged_receipts'); check('DESK fudged_receipts: cash +25%', p.stats.cashMult === 1.25);
  reset(); give('phone_charger'); { run.loadout.ranged = { id: 'stapler', dur: 0, maxDur: 0, ammo: 3, maxAmmo: 10 }; step(320); check('DESK phone_charger: +1 ammo per 5s', run.loadout.ranged.ammo === 4, run.loadout.ranged.ammo); }
  reset(); give('emergency_opener'); { run.loadout.melee = null; emit('weaponBreak', { id: 'keyboard', slot: 'melee' }); check('DESK emergency_opener: letter opener appears when melee breaks', run.loadout.melee && run.loadout.melee.id === 'letter_opener'); }
  reset(); give('leave_request'); check('DESK leave_request: leaveMult flag', run.flags.leaveMult === 1.25);
  reset(); give('wrist_rest'); check('DESK wrist_rest: melee speed +12%', Math.abs(p.stats.meleeSpeed - 1.12) < 0.001);
  reset(); give('values_mug'); check('DESK values_mug: rage +2s', p.stats.rageDuration === 9);
  reset(); give('sick_note'); { const hp0 = p.hp + p.shield; p.invuln = 0; w.damage(p, { amount: 20, type: 'blunt', method: 'melee', source: spawn(20), ignoreShield: true }); const l1 = hp0 - (p.hp + p.shield); p.invuln = 0; const hp1 = p.hp + p.shield; w.damage(p, { amount: 20, type: 'blunt', method: 'melee', source: spawn(20), ignoreShield: true }); const l2 = hp1 - (p.hp + p.shield); check('DESK sick_note: first 15+ hit per floor halved', l1 === 10 && l2 === 20, l1 + '/' + l2); }
  reset(); give('hands_free_headset'); check('DESK hands_free_headset: jargon x1.6', p.stats.rageJargonFill === 1.6);
  reset(); give('confiscated_whistle'); { const a = spawn(60); emit('rageStart', {}); check('DESK confiscated_whistle: rage start stuns nearby', a.status.stun >= 1.5); }
  reset(); give('hr_complaint'); { const a = spawn(20), b = spawn(40); const base = hit(a); emit('playerHit', { amount: 5, source: a, method: 'melee', absorbed: 0 }); const after = hit(a); const other = hit(b); check('DESK hr_complaint: +20% vs enemies that hurt you', Math.abs(after / base - 1.2) < 0.01 && Math.abs(other / base - 1) < 0.01, after / base); }
  reset(); { const a = spawn(30); a.promoted = { id: 'prom-1', name: 'Test Manager', weakness: 'staplers', weaknessKnown: false }; give('employee_handbook'); step(40); check('DESK employee_handbook: reveals a promoted enemy weakness', a.promoted.weaknessKnown === true && run.intel.includes('prom-1')); run.intel.length = 0; }
  reset(); give('parking_permit'); give('visitor_pass'); check('DESK parking_permit / visitor_pass: held (effects live in GameplayScene.depart)', run.deskItems.length === 2);
  reset(); give('rubber_duck'); check('DESK rubber_duck: held (4th attachment in benefit emails)', run.deskItems.includes('rubber_duck'));
  reset(); check('DESK unique per run: re-acquiring is refused', give('stress_ball') && !give('stress_ball'));
`);

// ===========================================================================================================
await scenario('pools', async () => {
  const { page, ctx } = await load('play&seed=21&floor=7');
  const r = await page.evaluate(async () => {
    const ben = await __imp('/src/game/content/benefits.ts');
    const desk = await __imp('/src/game/content/deskitems.ts');
    const prof = await __imp('/src/game/profile.ts');
    const s = __cp.app.top;
    const run = s.run;
    const out = {};
    const reset = () => { run.benefits.length = 0; run.deskItems.length = 0; };
    reset();
    // starter-only pools on a fresh profile
    const seen = new Set();
    for (let i = 0; i < 80; i++) for (const o of ben.rollOffers(s, { dept: 'it', count: 3, rng: new (s.floorRng.loot.constructor)(i) })) { seen.add(o.def.id); }
    out.itSeen = [...seen]; out.itLocked = [...seen].filter((id) => !ben.BENEFITS.find((b) => b.id === id).starter);
    // synergy gating: none without both departments
    const syn = new Set();
    for (let i = 0; i < 60; i++) for (const o of ben.rollOffers(s, { dept: 'it', count: 3, rng: new (s.floorRng.loot.constructor)(i) })) if (o.def.synergy) syn.add(o.def.id);
    out.synNone = syn.size;
    run.benefits.push({ id: 'industrial_grade', rarity: 0 }, { id: 'chain_shock', rarity: 0 });
    for (let i = 0; i < 120; i++) for (const o of ben.rollOffers(s, { dept: 'it', count: 3, rng: new (s.floorRng.loot.constructor)(i) })) if (o.def.synergy) syn.add(o.def.id);
    out.synBoth = [...syn];
    out.synOnlyValid = [...syn].every((id) => { const d = ben.BENEFITS.find((b) => b.id === id); return d.synergy.includes('it') && d.synergy.includes('facilities'); });
    // upgrade offers: a held Benefit is offered at the next rarity
    reset(); run.benefits.push({ id: 'chain_shock', rarity: 0 });
    let up = null;
    for (let i = 0; i < 200 && !up; i++) up = ben.rollOffers(s, { dept: 'it', count: 3, rng: new (s.floorRng.loot.constructor)(i) }).find((o) => o.def.id === 'chain_shock');
    out.upgrade = up && { kind: up.kind, rarity: up.rarity };
    run.benefits[0].rarity = 2;
    let maxed = false;
    for (let i = 0; i < 200; i++) if (ben.rollOffers(s, { dept: 'it', count: 3, rng: new (s.floorRng.loot.constructor)(i) }).some((o) => o.def.id === 'chain_shock')) maxed = true;
    out.maxedOffered = maxed;
    // boss rewards: Enhanced+ ; elite shifts rarity up
    reset();
    const rar = (opts) => { let tot = 0, n = 0, min = 9; for (let i = 0; i < 100; i++) for (const o of ben.rollOffers(s, { dept: 'sales', count: 3, rng: new (s.floorRng.loot.constructor)(i), ...opts })) { tot += o.rarity; n++; min = Math.min(min, o.rarity); } return { avg: tot / n, min }; };
    out.rarBase = rar({}); out.rarElite = rar({ boost: 1 }); out.rarBoss = rar({ minRarity: 1 });
    // upgrade via addBenefit raises rarity and re-installs
    reset(); ben.addBenefit(s, 'extended_mandate', 0); ben.addBenefit(s, 'extended_mandate', 2);
    out.upgraded = { held: run.benefits.slice(), dur: s.player.stats.rageDuration };
    reset(); s.player.refreshStats();
    // desk pool: unlocked only, never held
    const unlocked = desk.deskPool(s).map((d) => d.id);
    out.deskPoolLocked = unlocked.filter((id) => !desk.DESK_STARTERS.has(id));
    run.deskItems.push('stress_ball');
    out.deskNoDup = !desk.deskPool(s).some((d) => d.id === 'stress_ball');
    run.deskItems.length = 0;
    prof.profile().unlocks.push('desk:hang_in_there', 'benefit:wet_floor_sign');
    out.deskUnlockedAfter = desk.deskPool(s).some((d) => d.id === 'hang_in_there');
    // rubber duck: 4 attachments
    run.deskItems.push('rubber_duck');
    ben.openBenefitEmail(s, { dept: 'sales' }); __cp.app.flush();
    out.duck = __cp.app.top.comp.o.attachments.length;
    __cp.app.remove(__cp.app.top); __cp.app.flush();
    run.deskItems.length = 0;
    ben.openBenefitEmail(s, { dept: 'sales' }); __cp.app.flush();
    out.noDuck = __cp.app.top.comp.o.attachments.length;
    __cp.app.remove(__cp.app.top); __cp.app.flush();
    return out;
  });
  console.log('  ', JSON.stringify({ synBoth: r.synBoth, upgrade: r.upgrade, rarBase: r.rarBase, rarElite: r.rarElite, rarBoss: r.rarBoss, duck: r.duck }));
  assert(r.itLocked.length === 0, `unlock gating: only starter Benefits offered on a fresh profile (${r.itLocked.join(',') || 'none'})`);
  assert(r.synNone === 0, 'synergies are never offered without Benefits from both departments');
  assert(r.synBoth.includes('smart_building') && r.synOnlyValid, `IT + Facilities unlocks Smart Building (${r.synBoth})`);
  assert(r.upgrade && r.upgrade.kind === 'upgrade' && r.upgrade.rarity === 1, 'a held Benefit is offered again as a rarity upgrade');
  assert(r.maxedOffered === false, 'an Executive-rarity Benefit is never offered again');
  assert(r.rarElite.avg > r.rarBase.avg, `elite floors roll higher rarity (${r.rarBase.avg.toFixed(2)} -> ${r.rarElite.avg.toFixed(2)})`);
  assert(r.rarBoss.min >= 1, 'boss rewards are Enhanced or better');
  assert(r.upgraded.held.length === 1 && r.upgraded.held[0].rarity === 2 && r.upgraded.dur === 12, `addBenefit upgrades in place and re-applies stats (${JSON.stringify(r.upgraded)})`);
  assert(r.deskPoolLocked.length === 0 && r.deskNoDup, 'desk pool excludes locked and already-held items');
  assert(r.deskUnlockedAfter, 'profile unlock desk:<id> adds the item to the pool');
  assert(r.duck === 4 && r.noDuck === 3, `Rubber Duck gives a 4th attachment (${r.noDuck} -> ${r.duck})`);
  await ctx.close();
});

// ===========================================================================================================
await scenario('economy', async () => {
  const { page, ctx } = await load('play&seed=21&floor=3');
  const r = await page.evaluate(async () => {
    const reg = await __imp('/src/game/registry.ts');
    await __imp('/src/game/content/economy.ts');
    const s = __cp.app.top;
    const out = {};
    s.run.pettyCash = 237; s.run.debt = 0; s.run.deskItems.push('leave_request');
    for (const h of reg.RUN_END_HOOKS) h(s, false);
    out.expense = { leave: s.run.flags.expenseLeave, rate: s.run.flags.expenseRate, mult: s.run.flags.leaveMult };
    s.run.pettyCash = 100; s.run.debt = 60; s.run.deskItems.length = 0;
    for (const h of reg.RUN_END_HOOKS) h(s, true);
    out.withDebt = s.run.flags.expenseLeave;
    // Night Cleaner kit
    const r2 = { ...s.run, role: 'night_cleaner', benefits: [], flags: {} };
    const fake = { run: r2 };
    for (const h of reg.RUN_START_HOOKS) h(fake);
    out.kit = r2.benefits.map((b) => b.id);
    for (const h of reg.RUN_START_HOOKS) h(fake);
    out.kitOnce = r2.benefits.length;
    // finance interest benefit also pays through earn()
    return out;
  });
  console.log('  ', JSON.stringify(r));
  assert(r.expense.leave === 23 && r.expense.rate === 10 && r.expense.mult === 1.25, 'expense claim: 237 unspent Petty Cash -> 23 days (10:1), leaveMult 1.25 with the request form');
  assert(r.withDebt === 4, 'unpaid debt reduces the expense claim (100 - 60 -> 4 days)');
  assert(r.kit.length === 1 && r.kitOnce === 1, `Night Cleaner starts with one Facilities Benefit, once (${r.kit})`);
  await ctx.close();
});

// ===========================================================================================================
await scenario('transition', async () => {
  const { page, ctx } = await load('play&seed=31&floor=3');
  await page.evaluate(async () => {
    const ben = await __imp('/src/game/content/benefits.ts');
    const desk = await __imp('/src/game/content/deskitems.ts');
    const s = __cp.app.top;
    ben.addBenefit(s, 'hard_hat', 1); ben.addBenefit(s, 'chain_shock', 0);
    desk.acquireDeskItem(s, 'out_of_office', { quiet: true }); desk.acquireDeskItem(s, 'stress_ball', { quiet: true });
    for (const a of s.world.actors) if (a.team === 'enemy') s.world.damage(a, { amount: 99999, type: 'blunt', method: 'melee', source: s.player, unavoidable: true });
    for (let i = 0; i < 90; i++) s.world.update(1 / 60);
    s.player.autoDodge = 0;
  });
  const stairs = await page.evaluate(() => { const s = __cp.app.top; return s.exits.find((e) => e.kind === 'stairs' && e.available); });
  assert(!!stairs, 'stairs available after clearing');
  await page.evaluate(() => __cp.app.top.depart('stairs'));
  await sleep(7000);
  const r = await page.evaluate(() => {
    const gp = __cp.app.scenes[0]; const s = gp;
    return { top: __cp.app.top.name, floor: s.run.floor, keys: Object.keys(s.data.cpDispose || {}), dmgTaken: s.player.stats.damageTaken, rageFill: s.player.stats.rageFill, autoDodge: s.player.autoDodge, benefits: s.run.benefits.length, desk: s.run.deskItems.length };
  });
  console.log('  ', JSON.stringify(r));
  assert(r.top === 'gameplay' && r.floor === 4, `arrived on floor 4 (${r.top} ${r.floor})`);
  assert(r.keys.includes('b:chain_shock') && r.keys.includes('b:hard_hat') === false, 'floor hooks re-installed on the new floor (chain_shock live; stat-only Benefits have no hooks)');
  assert(Math.abs(r.dmgTaken - 0.89) < 0.001 && r.rageFill === 1.3, 'stats carried over (hard_hat Enhanced, stress_ball)');
  assert(r.keys.includes('d:out_of_office') && r.autoDodge === 1, 'Out-of-Office re-arms every floor');
  assert(r.benefits === 2 && r.desk === 2, 'run keeps its Benefits and Desk Items');
  await ctx.close();
});

await scenario('visuals', async () => {
  const { page, ctx } = await load('play&seed=14&floor=6');
  // Desk Item acquired pop-up + a reward pickup on the floor
  await page.evaluate(async () => {
    const desk = await __imp('/src/game/content/deskitems.ts');
    const reg = await __imp('/src/game/registry.ts');
    const s = __cp.app.top;
    for (const a of s.world.actors) if (a.team === 'enemy') { a.dead = true; a.corpse = true; }
    s.world.update(1 / 60);
    reg.REWARD_GRANT.benefit(s, { x: s.player.x + 28, y: s.player.y - 10 });
    reg.REWARD_GRANT.desk_item(s, { x: s.player.x - 28, y: s.player.y - 10 });
    reg.REWARD_GRANT.rage_mod(s, { x: s.player.x, y: s.player.y + 34 });
    for (let i = 0; i < 40; i++) s.world.update(1 / 60);
    desk.acquireDeskItem(s, 'hang_in_there');
  });
  await sleep(900);
  await shot(page, 'pickups-and-toast');
  await page.evaluate(async () => {
    const ben = await __imp('/src/game/content/benefits.ts');
    const s = __cp.app.top;
    for (const t of ['industrial_grade', 'chain_shock']) ben.addBenefit(s, t, 0);
    s.run.deskItems.push('rubber_duck');
    ben.openBenefitEmail(s, { dept: 'it', minRarity: 1 });
  });
  await sleep(3000);
  await shot(page, 'email-four-attachments');
  await ctx.close();
});
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (consoleErrors.length) console.log('Console errors/warnings:\n' + [...new Set(consoleErrors)].slice(0, 25).join('\n'));
if (failed) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
