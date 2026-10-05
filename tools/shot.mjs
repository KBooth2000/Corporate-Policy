// Visual QA: node tools/shot.mjs <out.png> [url-hash] [waitMs] [evalScript]
// Starts nothing itself: expects `npx vite --port 5173` running (or set URL env).
import { chromium } from 'playwright-core';
const [,, out = 'shot.png', hash = '', wait = '1500', script = ''] = process.argv;
const url = (process.env.URL || 'http://localhost:5173/') + (hash ? '#' + hash : '');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (script) { const r = await page.evaluate(script); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(+(process.env.AFTER || 800)); }
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 60).join('\n'));
await browser.close();
