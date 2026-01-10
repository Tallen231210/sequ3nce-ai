// Role Play Room Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

// Expose roleplay-specific APIs to the renderer
contextBridge.exposeInMainWorld('roleplay', {
  // Get user info (teamId, closerId, userName) passed from main window
  getUserInfo: () => ipcRenderer.invoke('roleplay:get-user-info'),

  // Close the roleplay window
  close: () => ipcRenderer.invoke('roleplay:close'),

  // Minimize the roleplay window
  minimize: () => ipcRenderer.invoke('roleplay:minimize'),

  // Listen for user info updates
  onUserInfoChange: (callback: (info: { teamId: string; closerId: string; userName: string } | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { teamId: string; closerId: string; userName: string } | null) => callback(info);
    ipcRenderer.on('roleplay:user-info-changed', handler);
    return () => ipcRenderer.removeListener('roleplay:user-info-changed', handler);
  },
});
