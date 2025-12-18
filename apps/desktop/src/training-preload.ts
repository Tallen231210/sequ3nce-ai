// Training Window - Preload script
import { contextBridge, ipcRenderer } from 'electron';

// Expose training-specific APIs to the renderer
contextBridge.exposeInMainWorld('training', {
  // Get closer ID for fetching assigned playlists
  getCloserId: () => ipcRenderer.invoke('training:get-closer-id'),

  // Get assigned playlists for the closer
  getAssignedPlaylists: (closerId: string) => ipcRenderer.invoke('training:get-playlists', closerId),

  // Get playlist details with items
  getPlaylistDetails: (playlistId: string, closerId: string) =>
    ipcRenderer.invoke('training:get-playlist-details', playlistId, closerId),

  // Close the training window
  close: () => ipcRenderer.invoke('training:close'),

  // Minimize the training window
  minimize: () => ipcRenderer.invoke('training:minimize'),

  // Listen for closer ID updates (when user logs in)
  onCloserIdChange: (callback: (closerId: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, closerId: string | null) => callback(closerId);
    ipcRenderer.on('training:closer-id-changed', handler);
    return () => ipcRenderer.removeListener('training:closer-id-changed', handler);
  },
});
