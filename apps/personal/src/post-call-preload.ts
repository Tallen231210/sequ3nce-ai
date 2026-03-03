// Post-Call Questionnaire Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

export interface PostCallCallData {
  callId: string;
  closerId: string;
  closerName: string;
  teamId: string;
  prospectName?: string;
}

// Expose post-call-specific APIs to the renderer
contextBridge.exposeInMainWorld('postCall', {
  // Get the call data passed from main process
  getCallData: () => ipcRenderer.invoke('post-call:get-data'),

  // Signal that the questionnaire was submitted — main process closes the window
  submitQuestionnaire: () => ipcRenderer.invoke('post-call:submitted'),

  // Listen for call data from main process (sent after window ready-to-show)
  onCallData: (callback: (data: PostCallCallData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PostCallCallData) => callback(data);
    ipcRenderer.on('post-call:call-data', handler);
    return () => ipcRenderer.removeListener('post-call:call-data', handler);
  },

  // Listen for theme changes from main window
  onThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: string) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
});
