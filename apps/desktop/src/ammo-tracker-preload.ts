// Ammo Tracker Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

// Expose ammo-specific APIs to the renderer
contextBridge.exposeInMainWorld('ammoTracker', {
  // Get the current call ID
  getCallId: () => ipcRenderer.invoke('ammo:get-call-id'),

  // Copy text to clipboard
  copyToClipboard: (text: string) => ipcRenderer.invoke('ammo:copy-to-clipboard', text),

  // Close the ammo window
  close: () => ipcRenderer.invoke('ammo:close'),

  // Save notes to the call
  saveNotes: (callId: string, notes: string) => ipcRenderer.invoke('ammo:save-notes', callId, notes),

  // Get notes for a call
  getNotes: (callId: string) => ipcRenderer.invoke('ammo:get-notes', callId),

  // Listen for call ID updates (when a new call starts)
  onCallIdChange: (callback: (callId: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, callId: string | null) => callback(callId);
    ipcRenderer.on('ammo:call-id-changed', handler);
    return () => ipcRenderer.removeListener('ammo:call-id-changed', handler);
  },

  // Listen for new ammo items (pushed from main process for instant updates)
  onNewAmmo: (callback: (ammo: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ammo: any) => callback(ammo);
    ipcRenderer.on('ammo:new-item', handler);
    return () => ipcRenderer.removeListener('ammo:new-item', handler);
  },

  // Listen for new transcript segments
  onNewTranscript: (callback: (segment: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, segment: any) => callback(segment);
    ipcRenderer.on('ammo:new-transcript', handler);
    return () => ipcRenderer.removeListener('ammo:new-transcript', handler);
  },
});
