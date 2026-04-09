import React from 'react';

interface HotkeyVisualProps {
  /** The hotkey name to render, e.g. "RightControl". Defaults to "RightControl". */
  hotkey: string;
}

/**
 * Stylized keyboard row showing the hold-to-talk hotkey. Shows a simplified
 * modifier row with the selected key highlighted. Matches the Sequ3nce
 * design language (dark-friendly, rounded, accent indigo→cyan gradient).
 */
export function HotkeyVisual({ hotkey }: HotkeyVisualProps) {
  const label = displayNameForHotkey(hotkey);

  // We render a row of realistic mac-style keycaps with the active one highlighted.
  // For other keys not in the row, we show just the single key highlighted.
  const keys: Array<{ id: string; label: string; width?: string }> = [
    { id: 'LeftControl', label: 'control' },
    { id: 'LeftAlt', label: 'option' },
    { id: 'LeftCommand', label: '⌘ command', width: '72px' },
    { id: 'Space', label: 'space', width: '180px' },
    { id: 'RightCommand', label: '⌘ command', width: '72px' },
    { id: 'RightAlt', label: 'option' },
    { id: 'RightControl', label: 'control' },
  ];

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div
        className="flex items-end gap-1.5 p-3 rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(31,41,55,0.5) 0%, rgba(17,24,39,0.7) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {keys.map((k) => {
          const isActive = k.id === hotkey;
          return (
            <div
              key={k.id}
              className="flex items-center justify-center text-[10px] font-medium"
              style={{
                width: k.width ?? '52px',
                height: '36px',
                borderRadius: '8px',
                background: isActive
                  ? 'linear-gradient(180deg, #a78bfa 0%, #22d3ee 100%)'
                  : 'rgba(255, 255, 255, 0.06)',
                color: isActive ? '#0b0f19' : '#d1d5db',
                border: isActive ? '1px solid rgba(167, 139, 250, 0.8)' : '1px solid rgba(255, 255, 255, 0.05)',
                boxShadow: isActive
                  ? '0 4px 14px rgba(124, 58, 237, 0.35), inset 0 -2px 0 rgba(0,0,0,0.1)'
                  : 'inset 0 -1px 0 rgba(0,0,0,0.3)',
                fontWeight: isActive ? 700 : 500,
              }}
            >
              {k.label}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Hold <span className="font-semibold text-gray-800 dark:text-gray-200">{label}</span> to dictate
      </div>
    </div>
  );
}

export function displayNameForHotkey(hotkey: string): string {
  const map: Record<string, string> = {
    RightControl: 'Right Control',
    RightCtrl: 'Right Control',
    LeftControl: 'Left Control',
    LeftCtrl: 'Left Control',
    RightAlt: 'Right Option',
    RightOption: 'Right Option',
    LeftAlt: 'Left Option',
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
