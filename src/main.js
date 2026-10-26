const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { Store } = require('./store');
const { Launcher, detectBrowsers } = require('./launcher');

let win;
let store;
let launcher;

function browserPath() {
  const configured = store.getSettings().browserPath;
  if (configured) return configured;
  const found = detectBrowsers();
  return found.length ? found[0].path : '';
}

function notifyRunning() {
  if (win && !win.isDestroyed()) win.webContents.send('running-changed', launcher.runningIds());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#f4f6fb',
    title: 'Multi Browser',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerIpc() {
  ipcMain.handle('profiles:list', () => store.listProfiles());
  ipcMain.handle('profiles:save', (_e, profile) => store.saveProfile(profile));

  ipcMain.handle('profiles:delete', async (_e, id) => {
    const p = store.getProfile(id);
    if (!p) return false;
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Delete "${p.name}"?`,
      detail: 'This removes the profile and all its saved logins, cookies and history. It cannot be undone.',
    });
    if (response !== 0) return false;
    launcher.stop(id);
    // Give the browser a moment to release its files before removing them.
    await new Promise((r) => setTimeout(r, 800));
    store.deleteProfile(id);
    return true;
  });

  ipcMain.handle('profiles:clear', async (_e, id) => {
    const p = store.getProfile(id);
    if (!p) return false;
    if (launcher.isRunning(id)) throw new Error('Close the browser for this profile first.');
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Clear data', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Clear all browsing data for "${p.name}"?`,
      detail: 'Logins, cookies, history and extensions for this profile will be erased. Settings are kept.',
    });
    if (response !== 0) return false;
    store.clearProfileData(id);
    return true;
  });

  ipcMain.handle('profiles:launch', (_e, id) => {
    const p = store.getProfile(id);
    if (!p) throw new Error('Profile not found');
    launcher.launch(p, store.dataDirFor(id), browserPath());
    store.touchProfile(id);
    return true;
  });

  ipcMain.handle('profiles:stop', (_e, id) => launcher.stop(id));
  ipcMain.handle('profiles:running', () => launcher.runningIds());
  ipcMain.handle('profiles:openFolder', (_e, id) => shell.openPath(store.dataDirFor(id)));

  ipcMain.handle('settings:get', () => ({
    ...store.getSettings(),
    effectiveBrowserPath: browserPath(),
    detected: detectBrowsers(),
    dataDir: store.baseDir,
  }));
  ipcMain.handle('settings:save', (_e, s) => store.saveSettings({ browserPath: String(s.browserPath || '') }));
  ipcMain.handle('settings:pickBrowser', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a Chromium-based browser',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe'] }] : [],
    });
    return res.canceled ? '' : res.filePaths[0];
  });
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'data'));
  launcher = new Launcher(notifyRunning);
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  // Profile browsers keep running on their own after the dashboard closes.
  app.quit();
});
