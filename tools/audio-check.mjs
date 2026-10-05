// Audio QA: renders every SFX, loop, voice kind and ~20 s of each music arrangement offline in headless Chromium,
// writes WAVs (+ a few spectrogram PNGs) to scratch/audio/ and prints a loudness table.
// Usage: node tools/audio-check.mjs [all|music|sfx|loops|voice|<name>...]   (URL env, default http://localhost:5183/)
// Needs a dev server: npx vite --port 5183
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const want = (k) => args.length === 0 || args.includes('all') || args.includes(k);
const names = new Set(args.filter((a) => !['all', 'music', 'sfx', 'loops', 'voice'].includes(a)));
const OUT = path.resolve('scratch/audio');
fs.mkdirSync(OUT, { recursive: true });
const url = (process.env.URL || 'http://localhost:5183/') + '#dev=audio';
const SECS = +(process.env.SECS || 20);
const NOWAV = !!process.env.NOWAV;

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const logs = [];
let page = null, uses = 0;
async function openPage() {
  if (page) await page.close().catch(() => {});
  page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__audioQA, null, { timeout: 30000 });
  uses = 0;
}
await openPage();
// The shared dev server may hot-reload while other people edit files: retry across reloads.
async function ev(fn, arg) {
  // recycle the page regularly so offline-render memory never accumulates
  if (++uses > 12) await openPage();
  for (let i = 0; ; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) {
      if (i > 6 || !/context was destroyed|navigation|__audioQA|Target closed/.test(String(e))) throw e;
      await page.waitForTimeout(800);
      await page.waitForFunction(() => !!window.__audioQA, null, { timeout: 60000 }).catch(() => {});
    }
  }
}

const rows = [];
const fmt = (x, d = 1) => (x <= -199 ? '-inf' : x.toFixed(d));
function judge(kind, s) {
  const issues = [];
  if (s.peakDb > -0.5) issues.push('CLIP');
  if (s.clipped > 0) issues.push(`clipped:${s.clipped}`);
  if (s.peakDb < -60) issues.push('SILENT');
  if (Math.abs(s.dc) > 0.01) issues.push('DC');
  if (s.clicks > 0) issues.push(`clicks:${s.clicks}`);
  if (kind === 'music') { if (s.rmsDb < -30) issues.push('QUIET'); if (s.rmsDb > -9) issues.push('LOUD'); if (s.silentPct > 20) issues.push(`gaps:${s.silentPct.toFixed(0)}%`); }
  if (kind === 'sfx') { if (s.peakDb < -24) issues.push('QUIET'); }
  if (kind === 'loop') { if (s.rmsDb < -50) issues.push('QUIET'); if (s.wrapJump > 6) issues.push(`wrap:${s.wrapJump.toFixed(1)}x`); }
  if (kind === 'voice') { if (s.peakDb < -30) issues.push('QUIET'); }
  return issues;
}
function save(file, b64) { if (b64 && !NOWAV) fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64')); }
function savePng(file, dataUrl) { if (dataUrl) fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64')); }

const warnings = await ev(() => window.__audioQA.warnings());
if (warnings.length) console.log('PATTERN WARNINGS:\n  ' + warnings.join('\n  '));

const PNG_FOR = new Set((process.env.PNG || 'act1:transition,act3:explore,act4:combat,boss2:p3,ceo_finale:p3,hub:main').split(','));

if (want('music') || names.size) {
  const tracks = await ev(() => window.__audioQA.tracks());
  for (const t of tracks) {
    if (names.size && !names.has(t.id) && !want('music')) continue;
    const variants = [];
    if (t.hasPhases) variants.push(['p1', { phase: 1, combat: true }], ['p2', { phase: 2, combat: true }], ['p3', { phase: 3, combat: true }], ['p3rage', { phase: 3, combat: true, rage: true }]);
    else if (t.hasCombat) variants.push(['explore', {}], ['combat', { combat: true }], ['rage', { combat: true, rage: true }], ['transition', { events: [{ t: 6, combat: true }, { t: 14, combat: false }] }], ['explore_b', { startBar: 16 }], ['combat_b', { combat: true, startBar: 16 }]);
    else variants.push(['main', {}], ['main_b', { startBar: 8 }]);
    for (const [v, o] of variants) {
      const key = `${t.id}:${v}`;
      const png = PNG_FOR.has(key);
      const r = await ev(([id, o, png, title]) => window.__audioQA.music(id, { ...o, seconds: o.seconds ?? +title.secs, png, title: title.name }), [t.id, o, png, { secs: SECS, name: key }]);
      save(`music_${t.id}_${v}.wav`, r.wav);
      savePng(`music_${t.id}_${v}.png`, r.png);
      rows.push({ kind: 'music', name: key, ...r.stats, issues: judge('music', r.stats) });
      process.stdout.write('.');
    }
  }
}
if (want('sfx') || names.size) {
  const list = await ev(() => window.__audioQA.sfxNames());
  for (const n of list) {
    if (names.size && !names.has(n) && !want('sfx')) continue;
    const r = await ev(([n]) => window.__audioQA.sfx(n, 0, true), [n]);
    save(`sfx_${n}.wav`, r.wav);
    const issues = judge('sfx', r.stats);
    if (r.raw.start > 0.02) issues.push(`startPop:${r.raw.start.toFixed(3)}`);
    if (r.raw.end > 0.01) issues.push(`endPop:${r.raw.end.toFixed(3)}`);
    rows.push({ kind: 'sfx', name: n, ...r.stats, len: r.raw.seconds, issues });
    process.stdout.write('.');
  }
  for (const n of (process.env.SFXPNG || 'explosion,glass_shatter,telegraph,telegraph_heavy,gore_splat').split(',')) {
    if (!list.includes(n)) continue;
    savePng(`sfx_${n}.png`, await ev(([n]) => window.__audioQA.sfxPng(n), [n]));
  }
}
if (want('loops') || names.size) {
  const list = await ev(() => window.__audioQA.loopNames());
  for (const n of list) {
    if (names.size && !names.has(n) && !want('loops')) continue;
    const r = await ev(([n]) => window.__audioQA.loop(n, true), [n]);
    save(`loop_${n}.wav`, r.wav);
    rows.push({ kind: 'loop', name: n, ...r.stats, len: r.seconds, issues: judge('loop', r.stats) });
    process.stdout.write('.');
  }
}
if (want('voice') || names.size) {
  for (const k of ['bark', 'pain', 'death', 'effort', 'laugh', 'gasp', 'chant', 'speech']) {
    if (names.size && !names.has(k) && !want('voice')) continue;
    for (const seed of [11, 4242, 90001]) {
      const r = await ev(([s, k, png]) => window.__audioQA.voice(s, k, true, png), [seed, k, seed === 11 && (k === 'bark' || k === 'speech')]);
      save(`voice_${k}_${seed}.wav`, r.wav);
      savePng(`voice_${k}_${seed}.png`, r.png);
      rows.push({ kind: 'voice', name: `${k}#${seed}`, ...r.stats, issues: judge('voice', r.stats) });
      process.stdout.write('.');
    }
  }
}
console.log('\n');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('kind', 6) + pad('name', 30) + pad('peak dB', 9) + pad('RMS dB', 9) + pad('crest', 7) + pad('len s', 7) + 'issues');
for (const r of rows) console.log(pad(r.kind, 6) + pad(r.name, 30) + pad(fmt(r.peakDb), 9) + pad(fmt(r.rmsDb), 9) + pad(fmt(r.crest), 7) + pad((r.len ?? r.seconds).toFixed(2), 7) + r.issues.join(' '));
const bad = rows.filter((r) => r.issues.length);
console.log(`\n${rows.length} items, ${bad.length} with issues.`);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ rows, warnings, logs }, null, 1));
if (logs.length) console.log('Console:\n' + logs.slice(0, 40).join('\n'));
await browser.close();
