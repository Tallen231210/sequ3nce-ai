import React from 'react';

interface HotkeyVisualProps {
  /** The hotkey name to render, e.g. "Fn" on macOS or "RightControl" on Windows. */
  hotkey: string;
  /** Platform — controls which keyboard layout we render. */
  platform: 'darwin' | 'win32' | string;
}

/**
 * Stylized keyboard row showing the hold-to-talk hotkey. macOS shows the
 * MacBook bottom row (with the globe/Fn key on the left); Windows shows a
 * Windows-style modifier row.
 */
export function HotkeyVisual({ hotkey, platform }: HotkeyVisualProps) {
  const label = displayNameForHotkey(hotkey);
  const isMac = platform === 'darwin';

  // Two different layouts: a real MacBook bottom row vs a Windows bottom row.
  const keys: Array<{ id: string; label: string; width?: string }> = isMac
    ? [
        { id: 'Fn', label: '🌐 fn' },
        { id: 'LeftControl', label: 'control' },
        { id: 'LeftAlt', label: 'option' },
        { id: 'LeftCommand', label: '⌘ command', width: '72px' },
        { id: 'Space', label: 'space', width: '180px' },
        { id: 'RightCommand', label: '⌘ command', width: '72px' },
        { id: 'RightAlt', label: 'option' },
      ]
    : [
        { id: 'LeftControl', label: 'Ctrl' },
        { id: 'LeftMeta', label: '⊞ Win' },
        { id: 'LeftAlt', label: 'Alt' },
        { id: 'Space', label: 'space', width: '180px' },
        { id: 'RightAlt', label: 'Alt' },
        { id: 'RightMeta', label: '⊞ Win' },
        { id: 'RightShift', label: 'Shift' },
        { id: 'RightControl', label: 'Ctrl' },
      ];

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="flex items-end gap-1 p-3 rounded-xl bg-gray-50 border border-gray-200">
        {keys.map((k) => {
          const isActive = k.id === hotkey;
          return (
            <div
              key={k.id}
              className={`flex items-center justify-center text-[10px] transition-colors ${
                isActive
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-gray-600 border-gray-200 font-medium'
              }`}
              style={{
                width: k.width ?? '48px',
                height: '34px',
                borderRadius: '6px',
                borderWidth: '1px',
                borderStyle: 'solid',
                boxShadow: isActive
                  ? '0 2px 6px rgba(0, 0, 0, 0.18)'
                  : '0 1px 0 rgba(0, 0, 0, 0.04)',
              }}
            >
              {k.label}
            </div>
          );
        })}
      </div>
      <div className="text-[12px] text-gray-500">
        Hold <span className="font-semibold text-black">{label}</span> to dictate
      </div>
    </div>
  );
}

export function displayNameForHotkey(hotkey: string): string {
  const map: Record<string, string> = {
    Fn: 'Fn (globe)',
    RightControl: 'Right Control',
    RightCtrl: 'Right Control',
    LeftControl: 'Left Control',
    LeftCtrl: 'Left Control',
    RightAlt: 'Right Alt',
    RightOption: 'Right Option',
    LeftAlt: 'Left Alt',
    LeftOption: 'Left Option',
    RightShift: 'Right Shift',
    LeftShift: 'Left Shift',
    RightMeta: 'Right Command',
    RightCommand: 'Right Command',
    LeftMeta: 'Left Command',
    LeftCommand: 'Left Command',
    CapsLock: 'Caps Lock',
  };
  return map[hotkey] ?? hotkey;
}
