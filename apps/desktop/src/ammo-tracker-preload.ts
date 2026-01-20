// Ammo Tracker Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

// Expose ammo-specific APIs to the renderer
contextBridge.exposeInMainWorld('ammoTracker', {
  // Get the current call ID
  getCallId: () => ipcRenderer.invoke('ammo:get-call-id'),

  // Get the team ID for resources
  getTeamId: () => ipcRenderer.invoke('ammo:get-team-id'),

  // Copy text to clipboard
  copyToClipboard: (text: string) => ipcRenderer.invoke('ammo:copy-to-clipboard', text),

  // Open URL in external browser
  openExternal: (url: string) => ipcRenderer.invoke('ammo:open-external', url),

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

  // ---- Live Chat API ----

  // Get messages for closer
  chatGetMessages: (closerId: string, limit?: number) =>
    ipcRenderer.invoke('chat:get-messages', closerId, limit),

  // Send message from closer
  chatSendMessage: (teamId: string, closerId: string, closerName: string, message: string) =>
    ipcRenderer.invoke('chat:send-message', teamId, closerId, closerName, message),

  // Mark all messages as read
  chatMarkAllRead: (closerId: string) =>
    ipcRenderer.invoke('chat:mark-all-read', closerId),

  // Get unread count
  chatGetUnreadCount: (closerId: string) =>
    ipcRenderer.invoke('chat:get-unread-count', closerId),

  // Get latest unread message
  chatGetLatestUnread: (closerId: string) =>
    ipcRenderer.invoke('chat:get-latest-unread', closerId),

  // Start polling for messages
  chatStartPolling: (closerId: string, teamId: string, closerName: string, intervalMs?: number) =>
    ipcRenderer.invoke('chat:start-polling', closerId, teamId, closerName, intervalMs),

  // Stop polling
  chatStopPolling: () =>
    ipcRenderer.invoke('chat:stop-polling'),

  // Listen for unread count changes
  onUnreadCountChanged: (callback: (count: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('chat:unread-count-changed', handler);
    return () => ipcRenderer.removeListener('chat:unread-count-changed', handler);
  },

  // Listen for new messages
  onNewMessage: (callback: (message: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: any) => callback(message);
    ipcRenderer.on('chat:new-message', handler);
    return () => ipcRenderer.removeListener('chat:new-message', handler);
  },

  // Get closer info for chat
  chatGetCloserInfo: () =>
    ipcRenderer.invoke('chat:get-closer-info'),

  // Listen for switch to chat tab (from notification click)
  onSwitchToChatTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('chat:switch-to-tab', handler);
    return () => ipcRenderer.removeListener('chat:switch-to-tab', handler);
  },
});
