'use strict';
// Company Policy - Electron main process (CommonJS because package.json is "type": "module").
const { app, BrowserWindow, Menu, ipcMain, protocol, net, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'game';
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = !app.isPackaged ? process.env.CP_DEV_URL || '' : '';
const isDev = !app.isPackaged;

// Custom privileged scheme so ES modules / fetch / localStorage behave like a normal secure origin (file:// would not).
protocol.registerSchemeAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Game loop + Web Audio must never be throttled; audio must start without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// AppImage / Steam Deck: the setuid chrome-sandbox cannot be honoured inside an AppImage mount.
if (process.platform === 'linux' && (process.env.APPIMAGE || process.argv.includes('--no-sandbox'))) {
  app.commandLine.appendSwitch('no-sandbox');
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.map': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

let win = null;
let savesDir = null;

function getSavesDir() {
  if (!savesDir) {
    savesDir = path.join(app.getPath('userData'), 'saves');
    fs.mkdirSync(savesDir, { recursive: true });
  }
  return savesDir;
}

/** Only plain file names are allowed - never paths. */
function safeName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new Error('bad save name');
  return path.join(getSavesDir(), name);
}

function registerIpc() {
  ipcMain.on('cp:readFile', (e, name) => {
    try { e.returnValue = fs.readFileSync(safeName(name), 'utf8'); } catch { e.returnValue = null; }
  });
  ipcMain.on('cp:writeFileAtomic', (e, name, data) => {
    try {
      const target = safeName(name);
      const tmp = target + '.' + process.pid + '.part';
      const fd = fs.openSync(tmp, 'w');
      try { fs.writeSync(fd, String(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, target);
      e.returnValue = true;
    } catch (err) { console.error('save failed', err); e.returnValue = false; }
  });
  ipcMain.on('cp:removeFile', (e, name) => {
    try { fs.rmSync(safeName(name), { force: true }); e.returnValue = true; } catch { e.returnValue = false; }
  });
  ipcMain.on('cp:setFullscreen', (_e, on) => { if (win && !win.isDestroyed()) win.setFullScreen(!!on); });
  ipcMain.on('cp:quit', () => app.quit());
}

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      if (!res.ok) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      headers.set('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      headers.set('Content-Security-Policy', CSP);
      headers.set('Cache-Control', 'no-cache');
      return new Response(res.body, { status: 200, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function toggleFullscreen() {
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Company Policy',
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    fullscreen: true,
    fullscreenable: true,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    useContentSize: true,
    transparent: false,
    frame: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      devTools: isDev,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // Keyboard shortcuts handled here because the menu (and its accelerators) is removed.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if (k === 'F11' || (input.alt && !input.control && !input.meta && k === 'Enter')) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (!isDev) {
      const ctrl = input.control || input.meta;
      if (k === 'F12' || (ctrl && input.shift && /^[ijc]$/i.test(k)) || (ctrl && /^[rw]$/i.test(k)) || k === 'F5') event.preventDefault();
    }
  });

  // Never navigate away or open new windows from the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`) && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault();
  });
  if (!isDev) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());

  if (process.env.CP_SMOKE) runSmokeTest(win);
  win.loadURL(DEV_URL || `${SCHEME}://${HOST}/index.html`);
}

// CI smoke test (CP_SMOKE=1): load the game, exercise the cpNative bridge, print SMOKE_OK / SMOKE_FAIL, exit.
function runSmokeTest(w) {
  const errors = [];
  w.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  w.webContents.on('render-process-gone', (_e, d) => { console.log('SMOKE_FAIL renderer gone ' + d.reason); app.exit(1); });
  w.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const r = await w.webContents.executeJavaScript(`(() => {
          const n = window.cpNative; if (!n || n.platform !== 'electron') return 'no cpNative';
          n.writeFileAtomic('smoke.json', '{"ok":1}');
          const back = n.readFile('smoke.json'); n.removeFile('smoke.json');
          if (back !== '{"ok":1}') return 'readback mismatch: ' + back;
          if (n.readFile('does-not-exist.json') !== null) return 'missing file should be null';
          if (!document.querySelector('canvas#screen')) return 'no canvas';
          return 'ok';
        })()`);
        if (r === 'ok') { console.log('SMOKE_OK console-errors=' + JSON.stringify(errors)); app.exit(0); }
        else { console.log('SMOKE_FAIL ' + r + ' errors=' + JSON.stringify(errors)); app.exit(1); }
      } catch (e) { console.log('SMOKE_FAIL ' + e); app.exit(1); }
    }, 2500);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    registerProtocol();
    // Deny every permission request (the game needs none; gamepad/audio don't use the permission API).
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
}
