import { app, BrowserWindow, dialog, Menu, session } from 'electron';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';

// A stable origin keeps localStorage and IndexedDB available across launches.
const PORT = 17843;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let server;
let window;
const smokeTest = process.argv.includes('--desktop-smoke-test');

app.setName('NutriLens');
if (smokeTest && process.env.NUTRILENS_SMOKE_PROFILE) app.setPath('userData', process.env.NUTRILENS_SMOKE_PROFILE);
app.setAppUserModelId('com.nutrilens.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    server?.close();
    server?.closeAllConnections();
  });
  app.whenReady().then(start).catch(error => {
    if (smokeTest) console.error(error);
    else dialog.showErrorBox('NutriLens could not start', error.code === 'EADDRINUSE'
      ? `Another program is using local port ${PORT}. Close it and reopen NutriLens. No existing service was opened.`
      : `The desktop app could not start: ${error.message}`);
    app.exit(1);
  });
}

async function start() {
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (details.url.startsWith(`${ORIGIN}/`)) {
      headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'"];
    }
    callback({ responseHeaders: headers });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
  ]));
  window = new BrowserWindow({
    title: 'NutriLens', width: 1280, height: 900, minWidth: 640, minHeight: 600,
    backgroundColor: '#0b1210', show: false, icon: fileURLToPath(new URL('./icon.png', import.meta.url)),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== ORIGIN) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => { if (!smokeTest) window.show(); });
  await window.loadURL(`${ORIGIN}/`);
  if (smokeTest) {
    // Exercise packaged assets and browser storage in an isolated test profile.
    const result = await window.webContents.executeJavaScript(`(async () => {
      const health = await fetch('/api/health').then(r => r.json());
      const module = await import('/src/diary-store.js');
      localStorage.setItem('nutrilens.desktop.smoke', 'ok');
      const storage = localStorage.getItem('nutrilens.desktop.smoke');
      localStorage.removeItem('nutrilens.desktop.smoke');
      return { title: document.title, health, storage, moduleLoaded: !!module, booted: !!document.querySelector('#connection-hint'), nodeExposed: typeof window.require !== 'undefined' };
    })()`);
    if (!result.title.includes('NutriLens') || !result.health.relay || !result.health.attachments || result.storage !== 'ok' || !result.booted || result.nodeExposed) throw new Error('Desktop smoke test failed.');
    const documents = [];
    if (process.env.NUTRILENS_SMOKE_DOCUMENTS) {
      const fixtures = JSON.parse(process.env.NUTRILENS_SMOKE_DOCUMENTS);
      for (const fixture of fixtures) {
        const response = await fetch(`${ORIGIN}/api/attachments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Nutrilens-Upload': '1' },
          body: JSON.stringify(fixture)
        });
        const parsed = await response.json();
        if (!response.ok || !parsed.text?.includes('100 g rolled oats')) throw new Error(`Packaged ${fixture.name} parsing failed: ${JSON.stringify(parsed)}`);
        documents.push(fixture.name);
        console.log('DESKTOP_DOCUMENT_OK', fixture.name);
      }
    }
    if (process.env.NUTRILENS_SMOKE_REPORT) await fs.writeFile(process.env.NUTRILENS_SMOKE_REPORT, JSON.stringify({ result, documents }));
    console.log('DESKTOP_SMOKE_OK', JSON.stringify(result));
    app.quit();
  }
}



