#ifndef STREAM_HOTKEY_H
#define STREAM_HOTKEY_H

// Sequ3nce Stream — macOS hotkey hook (Fn key via CGEventTap).
//
// Based on CypherKey's keyboard-hook-macos.c, simplified for Stream v1:
//   - Only tracks the Fn key (modifier mask 0x800000 from CGEventGetFlags)
//   - No multi-mode logic, no tap+hold window
//   - Polling API: JS polls poll() at ~60fps and reads the latest event
//
// Event codes returned by stream_hotkey_poll():
//   -1 = no event since last poll
//    1 = Fn pressed
//    2 = Fn released

void stream_hotkey_start(void);
int stream_hotkey_poll(void);
void stream_hotkey_stop(void);
int stream_hotkey_check_permission(void);

#endif
