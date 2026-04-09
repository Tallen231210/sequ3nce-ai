#ifndef STREAM_PASTE_SIMULATOR_H
#define STREAM_PASTE_SIMULATOR_H

// Sequ3nce Stream — macOS paste simulator.
// Synthesizes a Cmd+V keystroke using CGEventPost so transcribed text pastes
// into whatever app has focus. Requires accessibility permission — the same
// permission already requested by the stream hotkey hook.

void stream_simulate_paste(void);

#endif
