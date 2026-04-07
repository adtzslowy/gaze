const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  pickFolder: function() {
    return ipcRenderer.invoke('pick-folder');
  },
  pathExists: function(p) {
    return ipcRenderer.invoke('path-exists', p);
  },
  analyzeRepo: function(repoPath) {
    return ipcRenderer.invoke('analyze-repo', repoPath);
  },
});

console.log('[preload] exposeInMainWorld done');