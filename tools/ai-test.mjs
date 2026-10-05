// Enemy AI QA (scripted): spawns archetypes next to a stationary / strafing player and asserts behaviour.
//   node tools/ai-test.mjs [case,case,...]        (expects `npx vite --port 5186` running, or set URL)
// Env: URL (default http://localhost:5186/), OUT (screenshot dir), SECS (fight length per case, default 12), PAR (parallel pages)
// Asserts: no console errors/exceptions; every enemy-sourced, non-hazard player damage was preceded by a telegraph from
// that enemy; every telegraph respects the act minimum; enemies reach / damage the player; supports buff; summoners
// cap; the Culture Champion re-onboards intact corpses only; room-wide chants hit every enemy.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:5186/';
const OUT = process.env.OUT || 'scratch/ai';
const SECS = +(process.env.SECS || 12);
const PAR = +(process.env.PAR || 3);
mkdirSync(OUT, { recursive: true });

const ACT = {
  intern: 1, receptionist: 1, caretaker: 1, it_tech: 1, fire_warden: 1,
  sales_rep: 2, marketing_exec: 2, call_centre: 2, team_leader: 2, employee_of_month: 2,
  accountant: 3, lawyer: 3, compliance_officer: 3, procurement_buyer: 3, auditor: 3,
  hr_partner: 4, svp: 4, exec_assistant: 4, consultant: 4, culture_champion: 4,
};
const FLOOR = { 1: 3, 2: 7, 3: 12, 4: 17 };
const TMIN = { 1: 0.4, 2: 0.35, 3: 0.3, 4: 0.25 };

// ------------------------------------------------------------------ cases
const cases = [];
for (const [a, act] of Object.entries(ACT)) {
  cases.push({ name: `${a}_t0`, act, spawns: [[a, 0, 70, 0]], mode: 'still', expect: { damage: !['marketing_exec', 'hr_partner', 'procurement_buyer'].includes(a), reach: true } });
  cases.push({ name: `${a}_t2`, act, spawns: [[a, 2, -80, 20]], mode: 'strafe', expect: { damage: false } });
}
cases.push({ name: 'pack_interns', act: 1, spawns: [['intern', 0, 60, 0], ['intern', 0, 70, 20], ['intern', 0, 60, -20], ['intern', 0, 80, 10], ['receptionist', 0, 120, 0]], mode: 'still', expect: { damage: true, spread: true } });
cases.push({ name: 'support_marketing', act: 2, spawns: [['marketing_exec', 0, 120, 0], ['sales_rep', 0, 60, 30], ['team_leader', 0, 60, -30]], mode: 'still', expect: { rebrand: true } });
cases.push({ name: 'support_hr', act: 4, spawns: [['hr_partner', 0, 130, 0], ['svp', 0, 60, 30], ['svp', 0, 60, -30]], mode: 'still', expect: { shield: true } });
cases.push({ name: 'summon_procurement', act: 3, spawns: [['procurement_buyer', 1, 140, 0]], mode: 'strafe', secs: 30, expect: { summonCap: [4, 'order'], summonMin: 1 } });
cases.push({ name: 'summon_teamleader', act: 2, spawns: [['team_leader', 2, 120, 0]], mode: 'strafe', secs: 20, expect: { summonCap: [2, 'delegate'], summonMin: 1 } });
cases.push({ name: 'champion_revive', act: 4, spawns: [['culture_champion', 0, 90, 0]], mode: 'still', secs: 14, revive: true, expect: {} });
cases.push({ name: 'chant_act2', act: 2, spawns: [['intern', 1, 80, 0], ['sales_rep', 0, 80, 30], ['call_centre', 0, 120, -30], ['intern', 1, 90, -10]], mode: 'still', secs: 5, chant: true, expect: {} });
cases.push({ name: 'lawyer_injunction', act: 3, spawns: [['lawyer', 0, 90, 0]], mode: 'still', secs: 8, injunction: true, expect: {} });
cases.push({ name: 'compliance_flank', act: 3, spawns: [['compliance_officer', 0, 40, 0]], mode: 'still', secs: 4, shieldTest: true, expect: {} });

const only = process.argv[2] ? process.argv[2].split(',') : null;
const todo = only ? cases.filter((c) => only.some((o) => o !== 'promo' && c.name.includes(o))) : cases;
const PROMO = !only || only.includes('promo');

// ------------------------------------------------------------------ in-page code
function setup(c) {
  const s = window.__cp.app.top, w = s.world, p = s.player;
  window.__cpAI.clear();
  w.alarm = true; // whole floor "in combat" so morale/chants run and nothing is suspended
  p.maxHp = 5000; p.hp = 5000; p.deathSavers.push(() => true);
  const log = (window.__log = { tel: [], dmg: [], minD: {}, rebrand: 0, shield: 0, summons: {}, summonMax: {}, errors: [], spread: 1e9, ids: [] });
  const oT = w.telegraph.bind(w);
  w.telegraph = (owner, shape, wu, onFire, opts) => { log.tel.push({ t: w.time, id: owner ? owner.id : -1, own: owner && owner.owner ? owner.owner.id : -1, wu, kind: shape.kind, arch: owner && owner.archetype }); return oT(owner, shape, wu, onFire, opts); };
  const oD = w.damage.bind(w);
  w.damage = (target, info) => { const r = oD(target, info); if (target === p && info.source && info.source !== p && r > 0) log.dmg.push({ t: w.time, id: info.source.id, method: info.method, amt: r, arch: info.source.archetype }); return r; };
  const ctl = { move: { x: 0, y: 0 }, aimPoint: null, aimDir: null, pressed: () => false, released: () => false, down: () => false, held: () => 0, assist: 0 };
  p.ctl = ctl; window.__ctl = ctl;
  window.__mode = c.mode;
  window.__t0 = w.time;
  const out = [];
  for (const [a, tier, dx, dy] of c.spawns) { const e = window.__cpSpawn(a, tier, dx, dy, true); if (e) { out.push(e.id); log.ids.push(e.id); } }
  return { spawned: out.length, room: w.roomAt(p.x, p.y), px: p.x, py: p.y };
}

function sample() {
  const s = window.__cp.app.top, w = s.world, p = s.player, log = window.__log;
  p.hp = p.maxHp;
  // strafing player: circle around the start point
  if (window.__mode === 'strafe') { const a = (w.time - window.__t0) * 1.3; window.__ctl.move = { x: Math.cos(a), y: Math.sin(a) }; }
  const en = w.actors.filter((a) => a.team === 'enemy' && a.alive && a.archetype);
  for (const e of en) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    log.minD[e.archetype] = Math.min(log.minD[e.archetype] ?? 1e9, d);
    if (e.status.rebranded > 0) log.rebrand++;
    if (e.shield > 0) log.shield++;
    if (e.flags.summonedBy) { const k = e.flags.summonTag; log.summons[k] = 1; }
  }
  const tags = {};
  for (const e of en) if (e.flags.summonedBy) tags[e.flags.summonTag] = (tags[e.flags.summonTag] ?? 0) + 1;
  for (const k in tags) log.summonMax[k] = Math.max(log.summonMax[k] ?? 0, tags[k]);
  // pack spread: smallest pairwise distance between living enemies
  for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) log.spread = Math.min(log.spread, Math.hypot(en[i].x - en[j].x, en[i].y - en[j].y));
  return { t: +(w.time - window.__t0).toFixed(1), n: en.length, hp: Math.round(p.hp), dmg: log.dmg.length, tel: log.tel.length };
}

function reviveSetup() {
  // three interns around the champion: one killed normally (intact), one dismembered, one executed
  const s = window.__cp.app.top, w = s.world, p = s.player;
  const mk = (dx, dy) => window.__cpSpawn('intern', 0, dx, dy, true);
  const a = mk(60, 30), b = mk(60, -30), c = mk(110, 30);
  window.__revive = { intact: a.id, dism: b.id, exec: c.id };
  w.damage(a, { amount: 999, type: 'blunt', method: 'melee', source: p, unavoidable: true });
  b.dismembered = true; w.damage(b, { amount: 999, type: 'explosive', method: 'melee', source: p, unavoidable: true }); b.dismembered = true;
  c.executed = true; w.damage(c, { amount: 999, type: 'crush', method: 'execution', source: p, unavoidable: true });
  return true;
}
function reviveCheck() {
  const w = window.__cp.app.top.world, r = window.__revive;
  const f = (id) => w.actors.find((a) => a.id === id);
  const st = (a) => (a ? { alive: a.alive, corpse: a.corpse, re: !!a.flags.reonboarded, dead: a.dead, lanyard: !!a.look.reonboarded } : 'removed');
  return { intact: st(f(r.intact)), dism: st(f(r.dism)), exec: st(f(r.exec)) };
}

function chantRun() {
  const w = window.__cp.app.top.world;
  window.__cpAI.chant();
  const en = w.actors.filter((a) => a.team === 'enemy' && a.alive && a.archetype);
  const bubbled = en.filter((e) => w.bubbles.some((b) => b.actor === e)).length;
  const texts = new Set(w.bubbles.filter((b) => en.includes(b.actor)).map((b) => b.text));
  return { enemies: en.length, bubbled, sameLine: texts.size === 1, subtitle: w.subtitles.some((s) => s.speaker.includes('unison')) };
}

function injunctionProbe() {
  const p = window.__cp.app.top.player;
  return { injunctionT: p.injunctionT ?? 0, zones: window.__cpAI.zones().filter((z) => z.kind === 'injunction').length };
}

function shieldProbe() {
  // hit the compliance officer from the front, then from behind
  const s = window.__cp.app.top, w = s.world, p = s.player;
  const e = w.actors.find((a) => a.archetype === 'compliance_officer' && a.alive);
  if (!e) return null;
  e.busy = 1; e.flags.guard = Math.atan2(p.y - e.y, p.x - e.x); e.flags.guardDown = 0;
  const hp0 = e.hp;
  w.damage(e, { amount: 10, type: 'blunt', method: 'melee', source: p });
  const front = hp0 - e.hp;
  const save = { x: p.x, y: p.y };
  p.x = e.x + (e.x - save.x); p.y = e.y + (e.y - save.y); // stand behind
  const hp1 = e.hp;
  w.damage(e, { amount: 10, type: 'blunt', method: 'melee', source: p });
  const back = hp1 - e.hp;
  p.x = save.x; p.y = save.y;
  return { front, back };
}

// ------------------------------------------------------------------ runner
async function runCase(browser, c) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const floor = FLOOR[c.act];
  await page.goto(`${URL}#play&seed=${4242 + c.act}&floor=${floor}`);
  await page.waitForFunction(() => window.__cp?.app?.top?.world && window.__cpSpawn, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(setup, c);
  const res = { name: c.name, ok: true, fails: [], info };
  const fail = (m) => { res.ok = false; res.fails.push(m); };
  if (c.revive) await page.evaluate(reviveSetup);
  if (c.chant) { await page.waitForTimeout(400); res.chant = await page.evaluate(chantRun); if (!(res.chant.bubbled >= res.chant.enemies && res.chant.sameLine && res.chant.subtitle)) fail(`chant ${JSON.stringify(res.chant)}`); }
  if (c.shieldTest) { await page.waitForTimeout(300); res.shield = await page.evaluate(shieldProbe); if (!res.shield || res.shield.front !== 0 || !(res.shield.back > 0)) fail(`shield ${JSON.stringify(res.shield)}`); }
  const secs = c.secs ?? SECS;
  const shots = new Set([Math.round(secs * 0.3), Math.round(secs * 0.65)]);
  let sawInj = false;
  for (let i = 1; i <= secs; i++) {
    // sample several times a second (game time is what counts; headless may run slow)
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(250); await page.evaluate(sample); if (c.injunction) { const q = await page.evaluate(injunctionProbe); if (q.injunctionT > 0) sawInj = true; } }
    if (shots.has(i)) await page.screenshot({ path: `${OUT}/${c.name}_${i}s.png` });
  }
  const log = await page.evaluate(() => { const l = window.__log; const w = window.__cp.app.top.world; return { ...l, now: w.time - window.__t0 }; });
  res.gameSecs = +log.now.toFixed(1);
  if (c.revive) {
    res.revive = await page.evaluate(reviveCheck);
    if (!(res.revive.intact !== 'removed' && res.revive.intact.re && res.revive.intact.lanyard)) fail(`intact corpse not re-onboarded ${JSON.stringify(res.revive.intact)}`);
    for (const k of ['dism', 'exec']) if (res.revive[k] !== 'removed' && res.revive[k].re) fail(`${k} corpse was re-onboarded`);
  }
  if (c.injunction && !sawInj) fail('injunction never applied to the player');
  // telegraph-before-damage
  let untele = 0;
  for (const d of log.dmg) {
    if (d.method === 'hazard') continue;
    const ok = log.tel.some((t) => (t.id === d.id || t.own === d.id) && t.t <= d.t - 0.15 && d.t - t.t < 5);
    if (!ok) untele++;
  }
  if (untele) fail(`${untele} damage events without a prior telegraph`);
  const tmin = TMIN[c.act];
  const short = log.tel.filter((t) => t.id !== -1 && t.wu < tmin - 1e-6);
  if (short.length) fail(`${short.length} telegraphs under the act minimum (${short[0].wu.toFixed(3)} < ${tmin}) ${short[0].arch}`);
  if (c.expect.damage && !log.dmg.length) fail('never damaged the player');
  const main = c.spawns[0][0];
  if (c.expect.reach && !(log.dmg.length || (log.minD[main] ?? 1e9) < 60)) fail(`never reached the player (minD ${Math.round(log.minD[main])})`);
  if (c.expect.rebrand && !log.rebrand) fail('no ally was rebranded');
  if (c.expect.shield && !log.shield) fail('no ally received a shield');
  if (c.expect.summonCap) { const [cap, tag] = c.expect.summonCap; const m = log.summonMax[tag] ?? 0; res.summonMax = m; if (m > cap) fail(`summon cap exceeded ${m} > ${cap}`); if (m < (c.expect.summonMin ?? 0)) fail('summoner never summoned'); }
  if (c.expect.spread && log.spread < 3) fail(`pack stacked perfectly (min spacing ${log.spread.toFixed(1)})`);
  if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(' | ')}`);
  res.dmg = log.dmg.length; res.tel = log.tel.length; res.minD = Math.round(log.minD[main] ?? -1); res.spread = +log.spread.toFixed(1);
  await page.screenshot({ path: `${OUT}/${c.name}_end.png` });
  await page.close();
  return res;
}


// ------------------------------------------------------------------ promotion suite (spec 5.6), both modes
async function promoPage(ctx, mode, hash) {
  const page = await ctx.newPage(); // one browser context per mode so localStorage (the profile) carries across "runs"
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((m) => { window.__cpPromotionMode = m; }, mode);
  await page.goto(`${URL}#${hash}`);
  await page.waitForFunction(() => window.__cp?.app?.top?.world && window.__cpSpawn, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { page, errors };
}

async function promoSuite(browser, mode) {
  browser = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const res = { name: `promotion_${mode}`, ok: true, fails: [], notes: {} };
  const fail = (m) => { res.ok = false; res.fails.push(m); };
  // 1) an Intern kills the player → promoted via RUN_END_HOOKS
  let { page, errors } = await promoPage(browser, mode, 'play&seed=777&floor=2');
  await page.evaluate(async () => {
    const prof = (await import('/src/game/profile.ts')).profile();
    prof.promoted = []; prof.trophies = [];
    const s = window.__cp.app.top, w = s.world, p = s.player;
    window.__cpAI.clear();
    p.ctl = { move: { x: 0, y: 0 }, aimPoint: null, aimDir: null, pressed: () => false, released: () => false, down: () => false, held: () => 0, assist: 0 };
    p.hp = 2; p.shield = 0; p.maxShield = 0; p.deathSavers.length = 0; p.autoDodge = 0;
    w.alarm = true;
    window.__cpSpawn('intern', 0, 30, 0, true);
  });
  try { await page.waitForFunction(() => { const t = window.__cp.app.top; return t && t.name !== 'gameplay' || t.state !== 'play'; }, null, { timeout: 25000 }); } catch { fail('player was never killed'); }
  await page.waitForTimeout(3500);
  const after = await page.evaluate(async () => { const prof = (await import('/src/game/profile.ts')).profile(); return prof.promoted.map((r) => ({ name: r.name, rank: r.rank, arch: r.archetype, str: r.strengths, weak: r.weakness, kills: r.kills.length })); });
  res.notes.promoted = after;
  if (after.length !== 1 || after[0].arch !== 'intern' || after[0].rank !== 1) fail(`killer not promoted correctly ${JSON.stringify(after)}`);
  else if (mode === 'full' && !(after[0].str.length === 1 && after[0].weak && after[0].kills === 1)) fail('full mode record missing strength/weakness/memory');
  else if (mode === 'light' && (after[0].str.length || after[0].weak || after[0].kills)) fail('light mode record has traits/memory');
  if (errors.length) fail(`errors(1): ${errors.slice(0, 2).join(' | ')}`);
  await page.close();

  // 2) next normal run: returns on an act-1 floor with a title; announced; killing it terminates
  ({ page, errors } = await promoPage(browser, mode, 'play&seed=778&floor=4'));
  const ins = await page.evaluate(async () => {
    const prof = (await import('/src/game/profile.ts')).profile();
    const s = window.__cp.app.top, w = s.world;
    const e = w.actors.find((a) => a.promoted);
    return { plan: s.run.flags.promoPlan, found: !!e, name: e?.name, roster: prof.promoted.length, id: e?.id };
  });
  res.notes.insert = ins;
  if (!ins.found) fail(`promoted enemy not inserted (plan ${ins.plan})`);
  else {
    if (!/^Associate /.test(ins.name)) fail(`bad title ${ins.name}`);
    if (mode === 'light' && ins.roster !== 0) fail('light: record should leave the roster once re-inserted');
    if (mode === 'full' && ins.roster !== 1) fail('full: record should stay until terminated');
    const k = await page.evaluate(async (id) => {
      const s = window.__cp.app.top, w = s.world, p = s.player;
      w.alarm = true; p.hp = p.maxHp = 5000; p.deathSavers.push(() => true);
      const e = w.actors.find((a) => a.id === id);
      e.aware = true; e.x = p.x + 40; e.y = p.y;
      await new Promise((r) => setTimeout(r, 1200));
      const announced = !!e.flags.announced;
      const banner = s.hud.banner?.text ?? '';
      w.damage(e, { amount: 99999, type: 'blunt', method: 'melee', source: p, unavoidable: true });
      await new Promise((r) => setTimeout(r, 300));
      const prof = (await import('/src/game/profile.ts')).profile();
      return { announced, banner, roster: prof.promoted.length, trophies: prof.trophies.length, log: s.run.log.promotedTerminated };
    }, ins.id);
    res.notes.kill = k;
    if (!k.announced || !/PROMOTED/.test(k.banner)) fail(`not announced ${JSON.stringify(k)}`);
    if (k.roster !== 0 || k.log !== 1) fail(`not terminated ${JSON.stringify(k)}`);
    if (mode === 'full' && k.trophies !== 1) fail('full: no trophy');
    await page.screenshot({ path: `${OUT}/promotion_${mode}_terminated.png` });
  }
  // 3) exclusions: daily / seeded / boss floor
  const ex = await page.evaluate(async () => {
    const P = await import('/src/game/promotion.ts');
    const s = window.__cp.app.top;
    const e = window.__cpSpawn('intern', 0, 40, 0, true);
    s.killer = e; s.killMethod = 'melee'; s.killWeapon = 'mug';
    const out = {};
    s.run.seeded = true; out.seeded = P.promoteKiller(s) === null; s.run.seeded = false;
    s.run.daily = true; out.daily = P.promoteKiller(s) === null; out.dailyPlan = P.planRun(s.run).length === 0; s.run.daily = false;
    const ft = s.plan.floor_type; s.plan.floor_type = 'boss'; out.boss = P.promoteKiller(s) === null; s.plan.floor_type = ft;
    return out;
  });
  res.notes.exclusions = ex;
  if (!ex.seeded || !ex.daily || !ex.dailyPlan || !ex.boss) fail(`exclusions ${JSON.stringify(ex)}`);
  if (errors.length) fail(`errors(2): ${errors.slice(0, 2).join(' | ')}`);
  await page.close();

  if (mode === 'full') {
    // 4) rank-up, Director arena + director API, weakness mechanics, HR intel
    ({ page, errors } = await promoPage(browser, mode, 'play&seed=779&floor=17'));
    const d = await page.evaluate(async () => {
      const P = await import('/src/game/promotion.ts');
      const prof = (await import('/src/game/profile.ts')).profile();
      const { Rng } = await import('/src/core/rng.ts');
      const s = window.__cp.app.top, w = s.world, p = s.player;
      window.__cpAI.clear();
      p.hp = p.maxHp = 5000; p.deathSavers.push(() => true);
      // promote twice more through the real path: an already-promoted SVP kills again
      const base = window.__cpSpawn('svp', 0, 60, 0, true);
      s.killer = base; s.killMethod = 'melee'; s.killWeapon = 'golf_club';
      prof.promoted = [];
      const r1 = P.promoteKiller(s);
      base.promoted = r1; s.killMethod = 'ranged'; P.promoteKiller(s); P.promoteKiller(s); P.promoteKiller(s);
      const rec = prof.promoted[0];
      const out = { rank: rec.rank, strengths: rec.strengths, kills: rec.kills.length, avail: P.directorAvailable(), pick: P.pickDirector()?.id === rec.id };
      base.dead = true;
      rec.weakness = 'Technophobe';
      const e = P.spawnPromoted(s, rec, new Rng(5));
      out.director = !!e?.flags.director;
      out.arenaAlone = w.actors.filter((a) => a.team === 'enemy' && a.alive && a.roomId === e.roomId && a !== e && !a.dead).length === 0;
      w.alarm = true; e.aware = true;
      await new Promise((r) => setTimeout(r, 1000));
      out.bossBar = !!s.hud.bossBar;
      e.shield = 0;
      const h0 = e.hp; w.damage(e, { amount: 10, type: 'blunt', method: 'melee', source: p }); const blunt = h0 - e.hp;
      const h1 = e.hp; w.damage(e, { amount: 10, type: 'electric', method: 'melee', source: p }); const elec = h1 - e.hp;
      out.technophobe = elec > blunt * 2.5;
      out.reveal = !!P.revealWeakness(s) && prof.promoted[0]?.weaknessKnown === true;
      return out;
    });
    res.notes.director = d;
    if (d.rank !== 4 || d.kills !== 4 || d.strengths.length < 2) fail(`rank-up ${JSON.stringify(d)}`);
    if (!d.avail || !d.pick) fail('directorAvailable/pickDirector');
    if (!d.director || !d.arenaAlone || !d.bossBar) fail(`director arena ${JSON.stringify(d)}`);
    if (!d.technophobe) fail('Technophobe weakness not applied');
    if (!d.reveal) fail('HR intel reveal failed');
    await page.screenshot({ path: `${OUT}/promotion_director.png` });
    if (errors.length) fail(`errors(3): ${errors.slice(0, 2).join(' | ')}`);
    await page.evaluate(async () => { const m = await import('/src/game/profile.ts'); m.profile().promoted = []; m.profile().trophies = []; m.saveProfile(); });
    await page.close();
  }
  await browser.close();
  return res;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const queue = [...todo];
await Promise.all(Array.from({ length: PAR }, async () => {
  while (queue.length) {
    const c = queue.shift();
    try { const r = await runCase(browser, c); results.push(r); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} (game ${r.gameSecs}s, dmg ${r.dmg}, tel ${r.tel}, minD ${r.minD}${r.summonMax !== undefined ? ', summons ' + r.summonMax : ''})${r.ok ? '' : '\n     - ' + r.fails.join('\n     - ')}`); }
    catch (err) { results.push({ name: c.name, ok: false, fails: [String(err)] }); console.log(`FAIL ${c.name}: ${err}`); }
  }
}));
if (PROMO) {
  for (const mode of ['light', 'full']) {
    try { const r = await promoSuite(browser, mode); results.push(r); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${JSON.stringify(r.notes)}${r.ok ? '' : '\n     - ' + r.fails.join('\n     - ')}`); }
    catch (err) { results.push({ name: `promotion_${mode}`, ok: false, fails: [String(err)] }); console.log(`FAIL promotion_${mode}: ${err}`); }
  }
}
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
