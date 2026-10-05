'use strict';
// Exposes window.cpNative exactly as declared in src/core/storage.ts.
// Sandboxed preload: no fs here; synchronous IPC to the main process keeps the API synchronous.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cpNative', {
  platform: 'electron',
  readFile(name) {
    const r = ipcRenderer.sendSync('cp:readFile', String(name));
    return typeof r === 'string' ? r : null;
  },
  writeFileAtomic(name, data) {
    ipcRenderer.sendSync('cp:writeFileAtomic', String(name), String(data));
  },
  removeFile(name) {
    ipcRenderer.sendSync('cp:removeFile', String(name));
  },
  setFullscreen(on) {
    ipcRenderer.send('cp:setFullscreen', !!on);
  },
  quit() {
    ipcRenderer.send('cp:quit');
  },
});
