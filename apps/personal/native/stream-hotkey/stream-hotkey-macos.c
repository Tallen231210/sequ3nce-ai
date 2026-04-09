// Sequ3nce Stream — macOS hotkey hook
//
// Captures Fn (globe) key presses using a CGEventTap at the session level.
// Ported and simplified from CypherKey's keyboard-hook-macos.c.
//
// libuiohook (the library behind uiohook-napi) does not expose the Fn key on
// macOS because Apple treats it as a hardware-level modifier. The canonical
// workaround is to create a CGEventTap that subscribes to kCGEventFlagsChanged
// and read the FN bit from CGEventGetFlags directly.
//
// Event codes posted to the atomic stored in g_event:
//   -1 = no event since last poll (default state after exchange)
//    1 = Fn pressed  (key down)
//    2 = Fn released (key up)

#include "stream-hotkey.h"
#include <ApplicationServices/ApplicationServices.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>

// FN_MODIFIER_MASK matches Apple's private-ish flag for the Fn key, which
// doesn't have a public constant. 0x800000 = kCGEventFlagMaskSecondaryFn
// in the CF header.
#define FN_MODIFIER_MASK 0x800000

// Event codes exposed to JS via poll()
#define EVENT_FN_DOWN 1
#define EVENT_FN_UP   2

static atomic_int g_event = -1;
static int g_fn_down = 0;

static pthread_t g_thread;
static CFRunLoopRef g_run_loop = NULL;
static CFMachPortRef g_event_tap = NULL;
static int g_running = 0;

static CGEventRef event_callback(
    CGEventTapProxy proxy,
    CGEventType type,
    CGEventRef event,
    void *refcon
) {
    (void)proxy;
    (void)refcon;

    // If the OS disabled our tap (common after macOS sleep/wake or heavy load),
    // re-enable it so we don't lose Fn detection silently.
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_event_tap) {
            CGEventTapEnable(g_event_tap, true);
        }
        return event;
    }

    // We only care about modifier flag changes. Let keyDown/keyUp through untouched.
    if (type != kCGEventFlagsChanged) {
        return event;
    }

    CGEventFlags flags = CGEventGetFlags(event);
    uint64_t raw_flags = (uint64_t)flags;

    int fn_now = (raw_flags & FN_MODIFIER_MASK) != 0;

    if (fn_now != g_fn_down) {
        g_fn_down = fn_now;
        atomic_store(&g_event, fn_now ? EVENT_FN_DOWN : EVENT_FN_UP);
    }

    // Always return the event unmodified — we're an observer, not a consumer.
    return event;
}

static void *hook_thread(void *arg) {
    (void)arg;

    CGEventMask mask = (CGEventMask)(1 << kCGEventFlagsChanged);
    g_event_tap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        mask,
        event_callback,
        NULL
    );

    if (!g_event_tap) {
        fprintf(stderr, "[stream-hotkey] CGEventTapCreate failed — check accessibility permission\n");
        return NULL;
    }

    CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(
        kCFAllocatorDefault,
        g_event_tap,
        0
    );
    g_run_loop = CFRunLoopGetCurrent();
    CFRunLoopAddSource(g_run_loop, source, kCFRunLoopCommonModes);
    CGEventTapEnable(g_event_tap, true);

    CFRunLoopRun();

    CFRunLoopRemoveSource(g_run_loop, source, kCFRunLoopCommonModes);
    CFRelease(source);
    CFRelease(g_event_tap);
    g_event_tap = NULL;
    g_run_loop = NULL;

    return NULL;
}

void stream_hotkey_start(void) {
    if (g_running) return;
    g_running = 1;
    atomic_store(&g_event, -1);
    pthread_create(&g_thread, NULL, hook_thread, NULL);
}

int stream_hotkey_poll(void) {
    // Atomically read and clear — so repeated polls don't re-fire the same event
    return atomic_exchange(&g_event, -1);
}

void stream_hotkey_stop(void) {
    if (!g_running) return;
    g_running = 0;
    if (g_run_loop) {
        CFRunLoopStop(g_run_loop);
    }
    pthread_join(g_thread, NULL);
}

int stream_hotkey_check_permission(void) {
    const void *keys[] = { kAXTrustedCheckOptionPrompt };
    const void *values[] = { kCFBooleanFalse };
    CFDictionaryRef options = CFDictionaryCreate(
        kCFAllocatorDefault,
        keys,
        values,
        1,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks
    );
    Boolean trusted = AXIsProcessTrustedWithOptions(options);
    CFRelease(options);
    return trusted ? 1 : 0;
}
