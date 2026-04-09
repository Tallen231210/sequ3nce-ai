// Sequ3nce Stream — macOS paste simulator
//
// Synthesizes a Cmd+V keystroke via CGEventPost so the transcribed text ends up
// pasted into whatever app currently has focus. Direct port from CypherKey's
// paste-simulator-macos.c (slightly cleaned up for exported symbol naming).

#include "paste-simulator.h"
#include <ApplicationServices/ApplicationServices.h>

// HID keycode for "V" on a US keyboard
#define VK_V 0x09

void stream_simulate_paste(void) {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    if (!source) return;

    CGEventRef keyDown = CGEventCreateKeyboardEvent(source, (CGKeyCode)VK_V, true);
    CGEventRef keyUp = CGEventCreateKeyboardEvent(source, (CGKeyCode)VK_V, false);

    if (keyDown && keyUp) {
        CGEventSetFlags(keyDown, kCGEventFlagMaskCommand);
        CGEventSetFlags(keyUp, kCGEventFlagMaskCommand);
        CGEventPost(kCGHIDEventTap, keyDown);
        CGEventPost(kCGHIDEventTap, keyUp);
    }

    if (keyDown) CFRelease(keyDown);
    if (keyUp) CFRelease(keyUp);
    CFRelease(source);
}
