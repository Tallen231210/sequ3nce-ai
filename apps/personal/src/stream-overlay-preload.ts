// Preload for the Stream overlay window. Exposes a minimal API on window.streamOverlay
// so the React overlay can listen for hotkey events from main, send transcription results
// back for paste, and ask main to hide the overlay.

import { contextBridge, ipcRenderer } from 'electron';

type HotkeyListener = () => void;

const api = {
  onHotkeyDown(listener: HotkeyListener): () => void {
    const handler = () => listener();
    ipcRenderer.on('stream:hotkey-down', handler);
    return () => ipcRenderer.off('stream:hotkey-down', handler);
  },
  onHotkeyUp(listener: HotkeyListener): () => void {
    const handler = () => listener();
    ipcRenderer.on('stream:hotkey-up', handler);
    return () => ipcRenderer.off('stream:hotkey-up', handler);
  },
  onThemeChanged(listener: (theme: string) => void): () => void {
    const handler = (_e: unknown, theme: string) => listener(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.off('theme-changed', handler);
  },
  onUserIdChanged(listener: (userId: string | null) => void): () => void {
    const handler = (_e: unknown, userId: string | null) => listener(userId);
    ipcRenderer.on('stream:user-id-changed', handler);
    return () => ipcRenderer.off('stream:user-id-changed', handler);
  },
  async getUserId(): Promise<string | null> {
    return ipcRenderer.invoke('stream:get-user-id');
  },
  pasteText(text: string): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('stream:paste-text', text);
  },
  hideOverlay(): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('stream:hide-overlay');
  },
};

contextBridge.exposeInMainWorld('streamOverlay', api);

declare global {
  interface Window {
    streamOverlay: typeof api;
  }
}
