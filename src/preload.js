const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (p) => ipcRenderer.invoke('profiles:save', p),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  clearProfile: (id) => ipcRenderer.invoke('profiles:clear', id),
  launchProfile: (id) => ipcRenderer.invoke('profiles:launch', id),
  stopProfile: (id) => ipcRenderer.invoke('profiles:stop', id),
  runningProfiles: () => ipcRenderer.invoke('profiles:running'),
  openProfileFolder: (id) => ipcRenderer.invoke('profiles:openFolder', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  pickBrowser: () => ipcRenderer.invoke('settings:pickBrowser'),
  onRunningChanged: (cb) => ipcRenderer.on('running-changed', (_e, ids) => cb(ids)),
});
