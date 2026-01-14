// Schedule Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

// Expose schedule-specific APIs to the renderer
contextBridge.exposeInMainWorld('schedule', {
  // Get closer email for fetching calendar data
  getCloserEmail: () => ipcRenderer.invoke('schedule:get-closer-email'),

  // Get calendar status (is connected, last sync, etc.)
  getCalendarStatus: (email: string) => ipcRenderer.invoke('schedule:get-calendar-status', email),

  // Connect calendar with ICS URL
  connectCalendar: (email: string, icsUrl: string) =>
    ipcRenderer.invoke('schedule:connect-calendar', email, icsUrl),

  // Disconnect calendar
  disconnectCalendar: (email: string) => ipcRenderer.invoke('schedule:disconnect-calendar', email),

  // Sync calendar (fetch latest events)
  syncCalendar: (email: string) => ipcRenderer.invoke('schedule:sync-calendar', email),

  // Get events for a date range
  getEvents: (email: string, startDate: number, endDate: number) =>
    ipcRenderer.invoke('schedule:get-events', email, startDate, endDate),

  // Close the schedule window
  close: () => ipcRenderer.invoke('schedule:close'),

  // Minimize the schedule window
  minimize: () => ipcRenderer.invoke('schedule:minimize'),

  // Listen for closer email updates (when user logs in)
  onCloserEmailChange: (callback: (email: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, email: string | null) => callback(email);
    ipcRenderer.on('schedule:closer-email-changed', handler);
    return () => ipcRenderer.removeListener('schedule:closer-email-changed', handler);
  },
});
