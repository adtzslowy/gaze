import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'CodePulse',
    backgroundColor: '#0a0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 }, // posisi traffic lights
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
});
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) {
      const prefix = level === 3 ? '[ERROR]' : '[WARN]';
      console.log(`${prefix} (renderer): ${message}`);
    }
  });
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('[CodePulse] App ready');
  console.log('[preload path]', path.join(__dirname, 'preload.js'));

  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Pilih Direktori Repositori',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('path-exists', (_event, targetPath: string) => {
    return fs.existsSync(targetPath);
  });

  ipcMain.handle('analyze-repo', async (_event, repoPath: string) => {
    try {
      const { analyzeRepository } = await import('./analytics.js');
      return await analyzeRepository(repoPath, () => {});
    } catch (err) {
      console.error('[analyze-repo] error:', err);
      throw err;
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});