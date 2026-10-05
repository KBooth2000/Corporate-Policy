// Renders the Company Policy app icon (original pixel art, drawn in code) to every PNG the platforms need.
//   node tools/make-icons.mjs            -> build/*, public/icon.png, android/app/src/main/res/*
// Uses the same headless Chromium as tools/shot.mjs (override with CHROME=/path/to/chrome).
// Concept: a corporate ID badge on a glowing cyan lanyard with a red DECLINED stamp across it.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const w = (rel, buf) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
const wText = (rel, s) => w(rel, s);

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');

// ---------------------------------------------------------------------------------------------
// Everything below runs inside the page. 32x32 master art grid; one art pixel = one "big pixel".
// ---------------------------------------------------------------------------------------------
await page.evaluate(() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const BAYER = [[0, 2], [3, 1]];
  const P = {
    bg0: '#0b0f13', bg1: '#101418', bg2: '#15212b', bg3: '#1b3040', bg4: '#215268', bg5: '#2b6a82',
    halo: '#0f6a82', halo2: '#0c3f52', cyan: '#3fe6ff', cyanHi: '#c9fbff', cyanLo: '#1190ad', glowA: 'rgba(63,230,255,0.34)', glowB: 'rgba(63,230,255,0.16)',
    line: '#07090c', card: '#f1f4f8', cardSh: '#b4bfcc', cardSh2: '#8f9cac', blue: '#2e62e6', blueLo: '#1d3fa0', blueHi: '#6e96ff',
    photo: '#8ea6bd', photoLo: '#64809b', sil: '#1f2a36', ink: '#3a4656', metal: '#d3d9e0', metalLo: '#7d8896', slot: '#12171d',
    red: '#e8262e', redHi: '#ff6a63', redLo: '#8c1017', redLine: '#4c070c', stampTxt: '#ffe3de',
  };

  function bgGrid(n) {
    const [c, g] = mk(n, n);
    const cx = n / 2, cy = n * 0.46, k = 32 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * k + (BAYER[y & 1][x & 1] - 1.5) * 0.7;
      g.fillStyle = d < 13 ? P.bg5 : d < 17 ? P.bg4 : d < 21.5 ? P.bg3 : d < 27 ? P.bg2 : P.bg1;
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  // Foreground: lanyard + badge + stamp on a transparent 32x32 grid.
  function fgArt() {
    const [c, g] = mk(32, 32);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

    // --- lanyard: two straps converging on the badge clip, with a teal halo
    const lx = (y) => 1.4 + y * 2.2, rx = (y) => 30.6 - y * 2.2, HW = 2.2;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 32; x++) {
      const d = Math.min(Math.abs(x + 0.5 - lx(y)), Math.abs(x + 0.5 - rx(y)));
      if (d > HW && d <= HW + 1.1) px(x, y, P.halo);
      else if (d > HW + 1.1 && d <= HW + 2.6 && (x + y) % 2 === 0) px(x, y, P.halo2);
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < 32; x++) {
      for (const [f, side] of [[lx, -1], [rx, 1]]) {
        const dx = x + 0.5 - f(y);
        if (Math.abs(dx) <= HW) {
          const t = (dx / HW) * side;             // -1 (outer) .. 1 (inner)
          px(x, y, t > 0.45 ? P.cyanLo : t < -0.35 ? P.cyanHi : P.cyan);
        }
      }
    }

    // --- badge card
    const X0 = 5, Y0 = 8, W = 22, H = 23;
    const corner = (x, y) => (x === X0 || x === X0 + W - 1) && (y === Y0 || y === Y0 + H - 1);
    for (let y = Y0; y < Y0 + H; y++) for (let x = X0; x < X0 + W; x++) if (!corner(x, y)) px(x, y, P.line);
    for (let y = Y0 + 1; y < Y0 + H - 1; y++) for (let x = X0 + 1; x < X0 + W - 1; x++) px(x, y, P.card);
    rect(X0 + W - 2, Y0 + 2, 1, H - 4, P.cardSh);        // right inner shade
    rect(X0 + 2, Y0 + H - 2, W - 4, 1, P.cardSh);        // bottom inner shade
    rect(X0 + W - 2, Y0 + H - 2, 1, 1, P.cardSh2);

    // metal clip + slot at the top of the badge
    rect(12, 4, 8, 7, P.line);
    rect(13, 5, 6, 3, P.metal);
    rect(13, 5, 6, 1, '#ffffff');
    rect(13, 7, 6, 1, P.metalLo);
    rect(13, 8, 6, 1, P.line);
    rect(13, 9, 6, 1, P.slot);
    rect(12, 10, 8, 1, P.line);

    // header band (corporate blue) with an invented square logo
    rect(X0 + 1, 13, W - 2, 4, P.blue);
    rect(X0 + 1, 13, W - 2, 1, P.blueHi);
    rect(X0 + 1, 16, W - 2, 1, P.blueLo);
    rect(X0 + 2, 14, 2, 2, '#ffffff');
    rect(X0 + 5, 14, 8, 1, P.blueHi);

    // photo box with silhouette
    rect(7, 18, 9, 9, P.line);
    rect(8, 19, 7, 7, P.photo);
    rect(8, 23, 7, 3, P.photoLo);
    rect(10, 20, 3, 4, P.sil);
    rect(9, 24, 5, 2, P.sil);

    // name / role lines + barcode
    rect(17, 19, 8, 1, P.ink);
    rect(17, 21, 6, 1, P.cardSh2);
    rect(17, 23, 7, 1, P.cardSh2);
    rect(17, 25, 5, 1, P.cardSh2);
    for (let i = 0; i < 18; i++) if ((i * 7 + 3) % 5 !== 0 && i % 3 !== 2) rect(7 + i, 28, 1, 1, P.ink);

    // --- DECLINED stamp: red band that climbs 1px every 4px (stair-step shear keeps pixels crisp)
    const SX0 = 3, SX1 = 28, SCY = 22;
    const HR = 2;                                         // band half-height (rows)
    const glyphH = [3, 3, 2, 3, 3, 2, 3, 3, 2, 3, 3, 2];  // abstract letters: vertical dashes
    for (let x = SX0 - 1; x <= SX1 + 1; x++) {
      const cy = SCY - Math.floor((x - 16 + 2) / 4);
      const edgeX = x < SX0 || x > SX1;
      for (let dy = -HR - 1; dy <= HR + 1; dy++) {
        const y = cy + dy, ad = Math.abs(dy);
        if (edgeX || ad > HR) { px(x, y, P.redLine); continue; }
        let col = dy === -HR ? P.redHi : dy === HR ? P.redLo : P.red;
        const k = (x - (SX0 + 3));
        if (k >= 0 && k % 2 === 0 && k / 2 < glyphH.length && ad <= (glyphH[k / 2] === 3 ? 1 : 0) + (glyphH[k / 2] === 2 && dy === 1 ? 0 : 0)) {
          if (glyphH[k / 2] === 3 || dy <= 0) col = P.stampTxt;
        }
        px(x, y, col);
      }
    }
    return c;
  }

  const FG = fgArt();
  const BG32 = bgGrid(32), BG54 = bgGrid(54);

  // Scale a source canvas to `size` px. Integer ratio -> pure nearest; otherwise nearest up then smooth down.
  function scaled(src, size, smoothDown = true) {
    const r = size / src.width;
    const [o, g] = mk(size, size);
    if (Number.isInteger(r) || !smoothDown) { g.drawImage(src, 0, 0, size, size); return o; }
    const k = Math.max(1, Math.ceil(r)) * 4;
    const [big, bg] = mk(src.width * k, src.width * k);
    bg.drawImage(src, 0, 0, big.width, big.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(big, 0, 0, size, size);
    return o;
  }

  // Rounded-square mask with pixel-art stepped corners (radius in art pixels of the 32 grid).
  function tile(size, shape) {
    const [o, g] = mk(size, size);
    const base = (() => { const [t, tg] = mk(32, 32); tg.drawImage(BG32, 0, 0); tg.drawImage(FG, 0, 0); return t; })();
    g.drawImage(scaled(base, size), 0, 0);
    // mask
    const [m, mg] = mk(size, size);
    mg.fillStyle = '#000';
    const s = size / 32;
    if (shape === 'round') { mg.beginPath(); mg.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); mg.fill(); }
    else {
      const cut = [3, 2, 1, 1, 0].map((n) => n); // stepped corner profile (rows from top)
      mg.fillRect(0, 0, size, size);
      mg.globalCompositeOperation = 'destination-out';
      cut.forEach((n, row) => { if (!n) return;
        mg.fillRect(0, row * s, n * s, s); mg.fillRect(size - n * s, row * s, n * s, s);
        mg.fillRect(0, size - (row + 1) * s, n * s, s); mg.fillRect(size - n * s, size - (row + 1) * s, n * s, s); });
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(m, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return o;
  }

  // Adaptive layers: 108dp canvas = 54 art units at 2dp each; foreground art (32 units) centred.
  function adaptiveFg(size) {
    const [o, g] = mk(size, size);
    const [l, lg] = mk(54, 54); lg.drawImage(FG, 11, 11);
    g.drawImage(scaled(l, size), 0, 0);
    return o;
  }
  function adaptiveBg(size) { return scaled(BG54, size); }

  // Splash / Android 12 icon: logo (badge+lanyard, no tile) centred in a transparent square.
  function logo(size, inner) {
    const [o, g] = mk(size, size);
    const [t, tg] = mk(32, 32); tg.drawImage(FG, 0, 0);
    const k = inner / 32;
    const [s] = [scaled(t, inner)];
    g.drawImage(s, (size - inner) / 2, (size - inner) / 2);
    return o;
  }

  window.__icons = {
    tile: (size, shape) => tile(size, shape).toDataURL('image/png'),
    afg: (size) => adaptiveFg(size).toDataURL('image/png'),
    abg: (size) => adaptiveBg(size).toDataURL('image/png'),
    logo: (size, inner) => logo(size, inner).toDataURL('image/png'),
    splash: (w, h, inner) => {
      const [o, g] = mk(w, h); g.fillStyle = '#101418'; g.fillRect(0, 0, w, h);
      g.drawImage(logo(inner, inner), (w - inner) / 2, (h - inner) / 2);
      return o.toDataURL('image/png');
    },
  };
});

const grab = async (fn, ...args) => Buffer.from((await page.evaluate(([f, a]) => window.__icons[f](...a), [fn, args])).split(',')[1], 'base64');

// --- desktop / web
const t1024 = await grab('tile', 1024);
w('build/icon.png', t1024);
w('build/icon-256.png', await grab('tile', 256));
w('build/play-store-512.png', await grab('tile', 512));
w('public/icon.png', await grab('tile', 256));

// Windows .ico (PNG-compressed entries)
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = [];
for (const s of icoSizes) icoPngs.push(await grab('tile', s));
{
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(icoSizes.length, 4);
  let offset = 6 + 16 * icoSizes.length;
  const entries = icoSizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s === 256 ? 0 : s, 0); e.writeUInt8(s === 256 ? 0 : s, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(icoPngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += icoPngs[i].length; return e;
  });
  w('build/icon.ico', Buffer.concat([head, ...entries, ...icoPngs]));
}
// small-size preview sheet used while iterating on the design
w('build/icon-16.png', await grab('tile', 16));

// --- Android launcher icons
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  w(`${dir}/ic_launcher.png`, await grab('tile', 48 * k));
  w(`${dir}/ic_launcher_round.png`, await grab('tile', 48 * k, 'round'));
  w(`${dir}/ic_launcher_foreground.png`, await grab('afg', 108 * k));
  w(`${dir}/ic_launcher_background.png`, await grab('abg', 108 * k));
}
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
wText('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptiveXml);
wText('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveXml);
// the template's vector/colour placeholders are no longer referenced
for (const f of ['drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml', 'values/ic_launcher_background.xml']) {
  fs.rmSync(path.join(RES, f), { force: true });
}

// --- Android splash: dark #101418 with the logo, centred and never stretched (works in any landscape aspect ratio)
for (const d of fs.readdirSync(RES)) {
  if (/^drawable(-(land|port))?-(m|h|xh|xxh|xxxh)dpi$/.test(d)) fs.rmSync(path.join(RES, d, 'splash.png'), { force: true });
}
fs.rmSync(path.join(RES, 'drawable/splash.png'), { force: true });
w('android/app/src/main/res/drawable-nodpi/splash_icon.png', await grab('logo', 576, 384));
wText('android/app/src/main/res/drawable/splash.xml', `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background"/>
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash_icon"/>
    </item>
</layer-list>
`);
wText('android/app/src/main/res/values/colors.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_background">#101418</color>
    <color name="colorPrimary">#101418</color>
    <color name="colorPrimaryDark">#101418</color>
    <color name="colorAccent">#3FE6FF</color>
</resources>
`);
w('build/splash-preview.png', await grab('splash', 1920, 1080, 576));

await browser.close();
console.log('icons written');
