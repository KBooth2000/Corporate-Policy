// Meta-progression / front-end flow test (Playwright). Walks: main menu -> decline -> intro -> first floor -> forced death ->
// Performance Review deck -> hub -> every station UI -> run start / suspend / continue -> daily / seeded / assist runs ->
// telemetry opt-in + crash reporter -> touch pass -> controller pass. Screenshots land in $OUT (default scratch/meta).
// Usage: npx vite --port 5190 &   then   node tools/meta-test.mjs        (URL=http://localhost:5190/ by default)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5190/';
const OUT = process.env.OUT || 'scratch/meta';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let fails = 0, passes = 0;
const check = (name, ok, extra = '') => { if (ok) { passes++; console.log(`  PASS  ${name}`); } else { fails++; console.log(`  FAIL  ${name} ${extra}`); } };
const section = (s) => console.log(`\n== ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const hook = (page, tag = '') => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}[pageerror] ${e.message}\n${e.stack}`));
};

const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('__metaInit')) { localStorage.clear(); sessionStorage.setItem('__metaInit', '1'); } });
const page = await ctx.newPage();
hook(page);

const ev = (fn, arg) => page.evaluate(fn, arg);
const top = () => ev(() => window.__cp?.app.top?.name);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); };
const waitTop = async (name, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await top()) === name) return true; await sleep(120); }
  return false;
};
const waitFor = async (fn, timeout = 20000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch { /* page still loading */ } await sleep(120); }
  return false;
};
const toPage = (ix, iy) => ev(([ix, iy]) => { const r = window.__cp.app.renderer; const b = r.screen.getBoundingClientRect(); return { x: b.left + (r.offX + ix * r.scale) / r.dpr, y: b.top + (r.offY + iy * r.scale) / r.dpr }; }, [ix, iy]);
const clickInternal = async (ix, iy) => { const p = await toPage(ix, iy); await page.mouse.move(p.x, p.y); await sleep(60); await page.mouse.click(p.x, p.y); };
const press = async (key, n = 1, gap = 90) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(gap); } };
const P = (fn, arg) => ev(async (a) => { const m = await import('/src/game/profile.ts'); return (0, eval)('(' + a.f + ')')(m.profile(), m, a.x); }, { f: fn.toString(), x: arg });
const profileNow = () => P((p) => JSON.parse(JSON.stringify(p)));
const killPlayer = () => ev(() => { const s = window.__cp.app.top; s.player.hp = 0; s.world.damage(s.player, { amount: 9999, type: 'blunt', method: 'other', unavoidable: true }); });
const gameplayOk = async () => { const ok = await waitTop('gameplay', 25000); await sleep(1200); return ok; };

// ===========================================================================
section('Boot: main menu');
await page.goto(URL);
check('main menu is the first scene', await waitTop('mainmenu', 90000));
await sleep(2500);
await shot('01-mainmenu');
check('no profile yet: seenIntro false', (await profileNow()).seenIntro === false);

section('Decline -> intro (first time)');
await waitFor(() => window.__cp.app.top.state === 'login', 20000);
await sleep(800);
const declineRect = await ev(() => { const m = window.__cp.app.top; const b = m.btnDecline; return { x: b.x + b.w / 2, y: b.y + b.h / 2, state: m.state }; });
check('menu is on the login state', declineRect.state === 'login', JSON.stringify(declineRect));
await clickInternal(declineRect.x, declineRect.y);
check('decline starts the opening sequence', await waitTop('intro', 20000));
await sleep(2500);
await shot('02-intro-hr');
check('intro reaches the dialogue choice', await waitFor(() => window.__cp.app.top.phase === 'choice', 40000));
await sleep(700);
await shot('03-intro-choice');
const choices = await ev(() => window.__cp.app.top.choiceBtns.map((b) => ({ t: b.text, x: b.x + b.w / 2, y: b.y + b.h / 2, v: b.visible })));
check('every dialogue option is a variant of "No"', choices.length === 4 && choices.every((c) => /^No\b/.test(c.t) && c.v), JSON.stringify(choices.map((c) => c.t)));
await clickInternal(choices[2].x, choices[2].y);
await sleep(1200);
await shot('04-intro-reply');
check('player objects (reply phase)', (await ev(() => window.__cp.app.top.phase)) === 'reply');
await waitFor(() => window.__cp.app.top.phase === 'attack', 15000);
await sleep(900);
await shot('05-intro-attack');
const firstAttacker = await ev(() => { const s = window.__cp.app.top; return { phase: s.phase, hits: s.hits, cols: s.actors.filter((a) => a.kind === 'col').map((a) => a.anim) }; });
check('employees attack first (colleagues in attack/run before any player action)', firstAttacker.phase === 'attack' && firstAttacker.cols.some((a) => a === 'run' || a === 'attack1'), JSON.stringify(firstAttacker));
await waitFor(() => window.__cp.app.top.phase === 'snap', 10000);
await sleep(2200);
await shot('06-intro-snap');
check('intro hands off to the first floor', await gameplayOk());
await shot('07-floor1');
const afterIntro = await profileNow();
check('seenIntro persisted', afterIntro.seenIntro === true);

// ===========================================================================
section('Forced death -> Performance Review');
await ev(() => {
  const s = window.__cp.app.top, r = s.run, L = r.log;
  L.kills = 31; L.killsByMethod = { melee: 12, heavy: 5, ranged: 4, throw: 3, hazard: 5, execution: 2 };
  L.executions = 3; L.execByType = { defenestration: 2, shredder: 1 }; L.defenestrations = 2; L.damageDealt = 1840; L.damageTaken = 420; L.cashEarned = 265;
  L.breaches = 2; L.hazardKills = 5; L.floorsCleared = 6; L.timePerFloor = [100, 140, 170, 155, 210, 180]; L.elitesKilled = 2; L.rageActivations = 3;
  r.floor = 7; r.plan = { ...r.plan, floor_number: 7 }; r.pettyCash = 80; r.elapsed = 1140; s.floorTime = 65;
});
await killPlayer();
check('summary scene appears after the death animation', await waitTop('summary', 15000));
await sleep(1800);
const p1 = await profileNow();
// expected leave: 7 floors + 5 (1 boss) + 5 (first boss) + 2+2 (first defenestration + shredder) + 3 (act 2) + 8 (expense 80/10)
check('Annual Leave awarded (formula)', p1.annualLeave === 32, `got ${p1.annualLeave}`);
check('lifetime stats updated', p1.stats.runs === 1 && p1.stats.deaths === 1 && p1.stats.kills === 31 && p1.stats.bestFloor === 7 && p1.stats.defenestrations === 2 && p1.stats.leaveEarned === 32, JSON.stringify(p1.stats));
check('Temp unlocked by reaching floor 6', p1.roles.includes('temp') && p1.unlocks.includes('role:temp'));
check('achievements detected', ['first_blood', 'floor_one', 'defenestration_one', 'shredder', 'hazard_kill', 'facilities_done', 'temp_unlock'].every((a) => p1.achievements.includes(a)), JSON.stringify(p1.achievements));
check('Performance Review stays locked after a death', p1.prUnlocked === false);
const nSlides = await ev(() => window.__cp.app.top.deck.o.slides.length);
check('deck has the expected slides', nSlides >= 7, `slides ${nSlides}`);
for (let i = 0; i < nSlides; i++) {
  await sleep(1500);
  await shot(`08-summary-${String(i + 1).padStart(2, '0')}`);
  if (i === 0) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), ev(() => window.__cp.app.top.deck.exportCurrent())]);
    if (dl) { await dl.saveAs(`${OUT}/export-slide1.png`); const sz = fs.statSync(`${OUT}/export-slide1.png`).size; const head = fs.readFileSync(`${OUT}/export-slide1.png`).subarray(0, 4).toString('hex'); check('screenshot export produces a PNG', sz > 2000 && head === '89504e47', `size ${sz} head ${head}`); }
    else check('screenshot export produces a PNG', false, 'no download event');
  }
  if (i < nSlides - 1) await press('ArrowRight', 1, 450);
}
await ev(() => window.__cp.app.top.deck.close());
check('closing the deck returns to the hub', await waitTop('hub', 10000));
await sleep(1200);
await shot('09-hub-after-death');

// ===========================================================================
section('Hub: walking, click-to-walk, stations');
const pos0 = await ev(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py }; });
await page.keyboard.down('KeyD'); await sleep(700); await page.keyboard.up('KeyD');
const pos1 = await ev(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py }; });
check('WASD walks the player', pos1.x > pos0.x + 15, `${pos0.x}->${pos1.x}`);
// click the vending machine: the player walks there and the catalogue opens
const vbox = await ev(() => { const h = window.__cp.app.top; const s = h.park.stations.find((q) => q.id === 'vending'); return { x: s.box.x + s.box.w / 2, y: s.box.y + s.box.h / 2 }; });
await clickInternal(vbox.x, vbox.y);
check('click-to-walk opens the vending machine', await waitTop('vending', 12000));
await sleep(900);
await shot('10-vending-weapons');
// buy the cheapest item
await P((p) => { p.annualLeave = 300; });
const before = await profileNow();
await press('Enter', 1, 500);
await sleep(600);
await shot('11-vending-confirm');
await press('Enter', 1, 800);
const after = await profileNow();
check('purchase spends Annual Leave and adds an unlock', after.annualLeave < before.annualLeave && after.unlocks.length === before.unlocks.length + 1, `${before.annualLeave}->${after.annualLeave} unlocks ${before.unlocks.length}->${after.unlocks.length}`);
check('first_unlock achievement', after.achievements.includes('first_unlock'));
const tabsShots = ['benefits', 'desk', 'events', 'roles'];
for (const t of tabsShots) { await press('PageDown', 1, 600); await sleep(500); await shot(`12-vending-${t}`); }
const prices = await ev(async () => { const c = await import('/src/game/meta/catalogue.ts'); const all = c.catalogue(); return { total: c.catalogueTotal(), n: all.length, buyable: all.filter((p) => !p.starter && !p.feat && p.kind !== 'role').length, byKind: Object.fromEntries(['weapon', 'benefit', 'desk', 'event', 'role'].map((k) => [k, all.filter((p) => p.kind === k).map((p) => `${p.key}:${p.starter ? 'starter' : p.feat ? 'feat' : p.price}`)])) }; });
console.log('  catalogue:', JSON.stringify({ total: prices.total, n: prices.n, buyable: prices.buyable }));
for (const [k, v] of Object.entries(prices.byKind)) console.log(`    ${k}: ${v.join(' ')}`);
check('catalogue total in the 40-60 h pacing band (~2,400 days)', prices.total > 1200 && prices.total < 4200, `total ${prices.total}`);
await press('Escape', 1, 700);
check('vending closes to the hub', await waitTop('hub', 5000));

// other stations
const panelShots = [['carboot', '13-carboot', 'carboot'], ['noticeboard', '14-noticeboard', 'noticeboard'], ['dashboard', '15-dashboard', 'dashboard'], ['radio', '16-radio', 'radio'], ['daily', '17-daily', 'daily'], ['clockin', '18-clockin', 'clockin']];
// give the noticeboard something to show
await P((p, m) => {
  p.promoted = [{ id: 'p1', name: 'Gordon Pike', title: 'Senior Account Manager', archetype: 'sales_rep', rank: 2, look: { kind: 'enemy', archetype: 'sales_rep', tier: 1, rig: 'A', build: 'average', seed: 99, layers: {} }, strengths: ['Ballistic', 'Sharpshooter'], weakness: 'Fear of Heights', weaknessKnown: false, kills: [{ floor: 7, weapon: 'stapler', method: 'ranged', at: Date.now() }], createdAt: 1 },
    { id: 'p2', name: 'Priya Nair', title: 'Regional Director', archetype: 'lawyer', rank: 4, look: { kind: 'enemy', archetype: 'lawyer', tier: 2, rig: 'B', build: 'slim', seed: 5, layers: {} }, strengths: ['Calm Under Pressure'], weakness: 'Paper Allergy', weaknessKnown: true, kills: [{ floor: 12, weapon: 'briefcase', method: 'melee', at: Date.now() }, { floor: 13, weapon: 'briefcase', method: 'melee', at: Date.now() }], createdAt: 2 },
    { id: 'p3', name: 'Dennis Hale', title: 'Facilities Lead', archetype: 'caretaker', rank: 1, look: { kind: 'enemy', archetype: 'caretaker', tier: 0, rig: 'A', build: 'heavy', seed: 7, layers: {} }, strengths: [], weakness: 'Mop Phobia', weaknessKnown: false, kills: [], createdAt: 3, terminated: true }];
  p.trophies = [{ id: 't1', name: 'Dennis Hale, Facilities Lead', item: 'Giant Wrench', at: Date.now() }];
});
for (const [id, name] of panelShots) {
  await ev((id) => window.__cp.app.top.openStation(id), id);
  check(`${id} panel opens`, await waitTop(id === 'carboot' ? 'carboot' : id, 5000));
  await sleep(900);
  await shot(name);
  if (id === 'dashboard') { for (let i = 1; i < 5; i++) { await press('PageDown', 1, 600); await sleep(400); await shot(`15-dashboard-${i + 1}`); } }
  if (id === 'radio') { await press('Enter', 1, 600); const on = await ev(async () => (await import('/src/game/meta/ui/radio.ts')).radio.on); check('radio plays the selected track', on === true); await sleep(900); await shot('16-radio-on'); }
  if (id === 'clockin') { /* leave it open for the run start below */ break; }
  await press('Escape', 1, 700);
  check(`${id} closes to the hub`, await waitTop('hub', 5000));
}

// ===========================================================================
section('Clock In: new run');
// scroll the setup list so the screenshots show every section
await ev(() => { const s = window.__cp.app.top; s.list.target = 9999; });
await sleep(700); await shot('18-clockin-bottom');
await ev(() => { const s = window.__cp.app.top; s.list.target = 0; });
await sleep(500);
const btnPos = await ev(() => { const s = window.__cp.app.top; const b = s.list.items.find((i) => i.text && /^New run/.test(i.text)); return { x: b.x + b.w / 2, y: b.y + b.h / 2, t: b.text }; });
await clickInternal(btnPos.x, btnPos.y);
check('new run starts (gameplay after the fade)', await gameplayOk());
const run1 = await ev(() => { const r = window.__cp.app.top.run; return { daily: r.daily, seeded: r.seeded, role: r.role, assist: r.assist, floor: r.floor, code: r.seedCode }; });
check('new run: not daily, not seeded, office worker, no assist', !run1.daily && !run1.seeded && run1.role === 'office_worker' && !run1.assist, JSON.stringify(run1));

section('Suspend save + Continue Shift');
await ev(() => { const s = window.__cp.app.top; s.pause(); });
await sleep(600);
check('pause scene up', (await top()) === 'pause');
await ev(() => window.__cp.app.top.saveQuit());
check('save & quit returns to the hub', await waitTop('hub', 8000));
const susp = await ev(() => localStorage.getItem('cp.suspend'));
check('suspend save written', !!susp);
await sleep(800); await shot('19-hub-suspended');
await ev(() => window.__cp.app.top.openStation('clockin'));
await waitTop('clockin', 5000); await sleep(700); await shot('20-clockin-continue');
const contPos = await ev(() => { const s = window.__cp.app.top; const b = s.list.items.find((i) => i.text && /^Continue shift/.test(i.text)); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, t: b.text } : null; });
check('Continue shift button is offered', !!contPos, JSON.stringify(contPos));
await clickInternal(contPos.x, contPos.y);
check('continue resumes the run', await gameplayOk());
const run2 = await ev(() => { const s = window.__cp.app.top; return { code: s.run.seedCode, floor: s.run.floor, save: localStorage.getItem('cp.suspend') }; });
check('resumed run keeps its seed and the suspend save is deleted', run2.code === run1.code && run2.save === null, JSON.stringify(run2));
await killPlayer();
check('death -> summary', await waitTop('summary', 15000));
await sleep(1200);
const p2 = await profileNow();
check('second run counted', p2.stats.runs === 2 && p2.annualLeave > p1.annualLeave - 0, `runs ${p2.stats.runs} leave ${p2.annualLeave}`);
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000);

// ===========================================================================
section('Daily run');
const dkey = await ev(async () => { const r = await import('/src/core/rng.ts'); return { key: r.utcDateKey(), seed: r.dailySeed(r.utcDateKey()) }; });
await ev(() => window.__cp.app.top.openStation('daily'));
await waitTop('daily', 5000); await sleep(900); await shot('21-daily-briefing');
const dBtn = await ev(() => { const s = window.__cp.app.top; const b = s.list.items.find((i) => i.text && /Start scored/.test(i.text)); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; });
check('daily panel offers a scored attempt', !!dBtn);
await clickInternal(dBtn.x, dBtn.y);
check('daily run starts', await gameplayOk());
const d1 = await ev(() => { const r = window.__cp.app.top.run; return { daily: r.daily, key: r.dailyKey, seed: r.seed, practice: r.practice, role: r.role, mods: Object.keys(r.modifiers).length, seeded: r.seeded, assist: r.assist }; });
check('daily run: date seed, scored, fixed modifiers, office worker', d1.daily && d1.seed === dkey.seed && d1.key === dkey.key && !d1.practice && d1.role === 'office_worker' && d1.mods >= 2, JSON.stringify(d1));
check('scored attempt consumed (lastScoredKey)', (await profileNow()).daily.lastScoredKey === dkey.key);
await ev(() => { const s = window.__cp.app.top; s.run.log.kills = 12; s.run.floor = 4; s.run.plan = { ...s.run.plan, floor_number: 4 }; s.run.elapsed = 400; s.floorTime = 30; });
await killPlayer();
check('daily death -> summary', await waitTop('summary', 15000));
await sleep(1500);
const dsl = await ev(() => { const d = window.__cp.app.top.deck.o.slides; const i = d.findIndex((s) => s.title === 'Daily Leaderboard Submission'); return { i, n: d.length, bullets: i >= 0 ? d[i].bullets : [] }; });
check('daily submission slide present', dsl.i >= 0, JSON.stringify(dsl));
check('daily score submitted to the local board', dsl.bullets.some((b) => /submitted/.test(b)), JSON.stringify(dsl.bullets));
for (let i = 0; i < dsl.i; i++) await press('ArrowRight', 1, 500);
await sleep(1500); await shot('22-summary-daily');
const p3 = await profileNow();
check('daily history + local board recorded', p3.daily.history.length === 1 && (p3.localBoards['daily:' + dkey.key] ?? []).length === 1, JSON.stringify(p3.daily));
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000); await sleep(1000);
await shot('23-hub-daily-used');
// second attempt = practice, not scored
await ev(() => window.__cp.app.top.openStation('daily'));
await waitTop('daily', 5000);
const dBtn2 = await ev(() => { const s = window.__cp.app.top; const b = s.list.items.find((i) => i.text && /practice/.test(i.text)); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; });
check('second daily attempt is offered as practice', !!dBtn2);
await clickInternal(dBtn2.x, dBtn2.y);
await gameplayOk();
const d2 = await ev(() => { const r = window.__cp.app.top.run; return { daily: r.daily, practice: r.practice }; });
check('second daily attempt is practice (not scored)', d2.daily && d2.practice);
await killPlayer();
await waitTop('summary', 15000); await sleep(1200);
const p4 = await profileNow();
check('practice attempt not added to the board', p4.daily.history.length === 1 && p4.localBoards['daily:' + dkey.key].length === 1);
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000);

section('Assist runs are marked and never submitted');
await ev(() => { window.__cp.app.settings.assist.enabled = true; });
await ev(async () => { const r = await import('/src/game/meta/runs.ts'); r.startDaily(); });
await gameplayOk();
const a1 = await ev(() => { const r = window.__cp.app.top.run; return { assist: r.assist, practice: r.practice, daily: r.daily }; });
check('assist daily run is flagged and practice', a1.assist && a1.practice && a1.daily, JSON.stringify(a1));
await killPlayer();
await waitTop('summary', 15000); await sleep(1200);
const p5 = await profileNow();
check('assist run not submitted to the board', p5.daily.history.length === 1 && p5.localBoards['daily:' + dkey.key].length === 1);
check('assist run marked in the run history', p5.meta.history[0].assist === true);
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000);
await ev(() => window.__cp.app.top.openStation('dashboard'));
await waitTop('dashboard', 5000);
await press('PageDown', 2, 600); await sleep(600); await shot('24-dashboard-history-assist');
await press('Escape', 1, 600);
await ev(() => { window.__cp.app.settings.assist.enabled = false; });

section('Seeded run');
const sd = await ev(async () => { const r = await import('/src/core/rng.ts'); const m = await import('/src/game/meta/runs.ts'); const seed = r.codeToSeed(r.seedToCode(123456)); m.startSeeded(seed); return { seed, code: r.seedToCode(123456) }; });
await gameplayOk();
const s1 = await ev(() => { const r = window.__cp.app.top.run; return { seeded: r.seeded, seed: r.seed, code: r.seedCode, daily: r.daily }; });
check('seeded run: flagged seeded, seed matches code', s1.seeded && !s1.daily && s1.seed === sd.seed && s1.code === sd.code, JSON.stringify(s1));
await killPlayer();
await waitTop('summary', 15000); await sleep(800);
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000);

section('Victory: Performance Review unlock + KPI');
await ev(async () => {
  const m = await import('/src/game/meta/runs.ts'); const rr = m.buildRun({ kind: 'normal', modifiers: { budget_cuts: 2, restructure: 1, micromanagement: 1 } });
  const { app } = await import('/src/core/app.ts'); const { GameplayScene } = await import('/src/scenes/gameplay.ts');
  app.reset(new GameplayScene(rr));
});
await gameplayOk();
await ev(() => { const s = window.__cp.app.top; s.run.floor = 20; s.run.plan = { ...s.run.plan, floor_number: 20 }; s.run.log.bossesKilled = 4; s.run.log.kills = 90; s.run.elapsed = 3000; s.victory(); });
check('victory -> summary (ending scene may be skipped)', await waitTop('summary', 15000));
await sleep(1600); await shot('25-summary-victory');
const p6 = await profileNow();
check('first CEO kill unlocks Performance Review and Ex-Employee', p6.prUnlocked === true && p6.roles.includes('ex_employee') && p6.achievements.includes('ceo_defeated'));
check('KPI points awarded for modifiers (2+1+2 = 5)', p6.kpi === 5, `kpi ${p6.kpi}`);
check('KPI cosmetic unlocked', p6.unlocks.some((u) => u.startsWith('cosmetic:')));
await ev(() => window.__cp.app.top.deck.close());
await waitTop('hub', 10000); await sleep(800);
await ev(() => window.__cp.app.top.openStation('clockin'));
await waitTop('clockin', 5000); await sleep(700);
await ev(() => { const s = window.__cp.app.top; s.list.target = 560; });
await sleep(800); await shot('26-clockin-performance-review');
await press('Escape', 1, 600);

// ===========================================================================
section('Telemetry (opt-in) and crash reporter');
check('no telemetry recorded while opted out', (await ev(() => localStorage.getItem('cp.telemetry'))) === null);
await ev(async () => { window.__cp.app.settings.telemetryOptIn = true; const s = await import('/src/platform/services.ts'); s.getPlatform().telemetry.record('test_event', { a: 1 }); });
check('telemetry recorded after opt-in (local queue only)', !!(await ev(() => localStorage.getItem('cp.telemetry'))));
await ev(() => { window.__cp.app.settings.telemetryOptIn = false; });
await ev(() => window.dispatchEvent(new ErrorEvent('error', { message: 'meta-test synthetic error', error: new Error('meta-test synthetic error') })));
await ev(() => window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('meta-test synthetic rejection') })));
const crashes = await ev(async () => (await import('/src/platform/crash.ts')).getCrashReports().map((c) => `${c.kind}:${c.message}`));
check('crash reporter captured error + rejection into the ring buffer', crashes.length >= 2 && crashes.some((c) => c.startsWith('error')) && crashes.some((c) => c.startsWith('rejection')), JSON.stringify(crashes));
check('nothing is sent off-device by default', await ev(async () => { const c = await import('/src/platform/crash.ts'); const s = await import('/src/platform/services.ts'); return c.crashConfig.endpoint === '' && s.telemetryConfig.endpoint === '' && c.forwardCrashReports() === false && s.flushTelemetry() === false; }));

// ===========================================================================
section('Controller pass');
await ev(async () => { const { app } = await import('/src/core/app.ts'); const { HubScene } = await import('/src/scenes/hub.ts'); app.reset(new HubScene({ mood: 'night' })); });
await waitTop('hub', 5000); await sleep(600);
await ev(() => {
  const mk = () => ({ pressed: false, value: 0 });
  window.__pad = { connected: true, index: 0, id: 'Xbox 360 Controller (STANDARD GAMEPAD 045e)', buttons: Array.from({ length: 17 }, mk), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => [window.__pad];
});
const pp0 = await ev(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py }; });
await ev(() => { window.__pad.axes[0] = 1; });
await sleep(900);
await ev(() => { window.__pad.axes[0] = 0; });
const pp1 = await ev(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py, dev: window.__cp.app.input.device }; });
check('left stick walks the player (device xbox)', pp1.x > pp0.x + 20 && pp1.dev === 'xbox', JSON.stringify({ pp0, pp1 }));
// RB cycles stations (and auto-walks); A/X interacts
const tap = async (idx, ms = 140) => { await ev((i) => { window.__pad.buttons[i].pressed = true; }, idx); await sleep(ms); await ev((i) => { window.__pad.buttons[i].pressed = false; }, idx); await sleep(160); };
await tap(5); await sleep(2500);
await shot('27-pad-station-focus');
const padNear = await ev(() => { const h = window.__cp.app.top; return h.near?.id ?? null; });
await tap(3);
await sleep(900);
const padTop = await top();
check('RB walks to a station and the interact button opens it', padNear !== null && padTop !== 'hub', `near ${padNear} top ${padTop}`);
await shot('28-pad-panel');
await tap(13); await tap(1); await sleep(700);
check('B button closes the panel', (await top()) === 'hub');

// ===========================================================================
section('Touch pass (mobile viewport)');
const mctx = await browser.newContext({ viewport: { width: 854, height: 400 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await mctx.addInitScript(() => { if (!sessionStorage.getItem('__metaInit')) { localStorage.clear(); sessionStorage.setItem('__metaInit', '1'); } });
const mp = await mctx.newPage();
hook(mp, '[touch]');
await mp.goto(URL + '#hub');
await sleep(2500);
const mtoPage = (ix, iy) => mp.evaluate(([ix, iy]) => { const r = window.__cp.app.renderer; const b = r.screen.getBoundingClientRect(); return { x: b.left + (r.offX + ix * r.scale) / r.dpr, y: b.top + (r.offY + iy * r.scale) / r.dpr }; }, [ix, iy]);
const mtap = async (ix, iy) => { const p = await mtoPage(ix, iy); await mp.touchscreen.tap(p.x, p.y); };
const mtop = () => mp.evaluate(() => window.__cp?.app.top?.name);
await mp.screenshot({ path: `${OUT}/29-touch-hub.png` });
check('hub loads on a touch device', (await mtop()) === 'hub');
const tb = await mp.evaluate(() => window.__cp.app.top.tbRects.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })));
check('taskbar exposes every station', tb.length === 7, `${tb.length} items`);
await mtap(tb[0].x, tb[0].y);   // first taskbar item = vending (stations order)
await sleep(300);
let t0 = Date.now(); while (Date.now() - t0 < 12000 && (await mtop()) === 'hub') await sleep(150);
check('tapping a taskbar item walks to the station and opens it', (await mtop()) === 'vending');
await sleep(800);
await mp.screenshot({ path: `${OUT}/30-touch-vending.png` });
// tap a row to open the confirm dialog, tap Not today, then Back to car park
const row = await mp.evaluate(() => { const s = window.__cp.app.top; const r = s.rows[0]; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
await mtap(row.x, row.y); await sleep(700);
await mp.screenshot({ path: `${OUT}/31-touch-vending-row.png` });
const closeB = await mp.evaluate(() => { const s = window.__cp.app.top; const b = s.closeBtn; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; });
await mtap(closeB.x, closeB.y); await sleep(500);
await mtap(closeB.x, closeB.y); await sleep(700);
check('touch can close panels', (await mtop()) === 'hub', await mtop());
const g0 = await mp.evaluate(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py }; });
await mtap(g0.x + 80, g0.y + 10); await sleep(1200);
const g1 = await mp.evaluate(() => { const h = window.__cp.app.top; return { x: h.px, y: h.py }; });
check('tap-to-walk moves the player on touch', g1.x > g0.x + 30, JSON.stringify({ g0, g1 }));
await mp.close();

// ===========================================================================
section('Console errors');
const real = errors.filter((e) => !/favicon|Failed to load resource.*404|net::ERR/.test(e));
check('no console errors / page errors during the whole flow', real.length === 0, '\n' + real.slice(0, 8).join('\n'));
await browser.close();
console.log(`\n${passes} passed, ${fails} failed. Screenshots in ${OUT}/`);
process.exit(fails ? 1 : 0);
