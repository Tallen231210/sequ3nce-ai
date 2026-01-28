//
//  AppDelegate.swift
//  Sequ3nce
//
//  NSApplicationDelegate for menu bar integration
//

import Cocoa
import SwiftUI
import Combine

class AppDelegate: NSObject, NSApplicationDelegate {
    // Track recording state for quit confirmation (accessed from main thread only)
    private var _isRecording: Bool = false

    // Thread-safe access to recording state
    var isRecording: Bool {
        get { _isRecording }
        set { _isRecording = newValue }
    }

    private var _menuBarController: MenuBarController?
    private var cancellables = Set<AnyCancellable>()

    // Store reference to main window so we can always bring it back
    private var _mainWindow: NSWindow?
    var mainWindow: NSWindow? {
        get { _mainWindow }
        set {
            _mainWindow = newValue
            // Prevent window from being released when closed (Cmd+W)
            _mainWindow?.isReleasedWhenClosed = false
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu bar will be initialized after AppState is ready (in Sequ3nceApp)
    }

    @MainActor
    func setupMenuBar(with appState: AppState) {
        _menuBarController = MenuBarController(appState: appState)
        // Wire up diagnostics service to menu bar controller
        _menuBarController?.diagnosticsService = appState.diagnosticsService

        // Observe recording state to update isRecording flag
        appState.$recordingState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?._isRecording = (state == .recording)
            }
            .store(in: &cancellables)
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // This is always called on main thread
        if _isRecording {
            let alert = NSAlert()
            alert.messageText = "Recording in Progress"
            alert.informativeText = "Are you sure you want to quit? The current recording will be stopped."
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Quit")
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            if response == .alertSecondButtonReturn {
                return .terminateCancel
            }
        }
        return .terminateNow
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // This is always called on main thread
        // Always show main window when Dock icon is clicked
        // (flag may be true because Ammo Panel is visible, but user wants main window)
        showMainWindow()
        return true
    }

    /// Show the main window - used by Dock click and menu bar
    func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)

        if let window = _mainWindow {
            // We have a stored reference to the main window
            window.makeKeyAndOrderFront(nil)
        } else {
            // Fallback: find main window by excluding known secondary windows
            let secondaryTitles = ["Ammo Tracker", "Training", "Role Play Room", "My Schedule", "Team Messages"]
            if let window = NSApp.windows.first(where: {
                $0.contentView != nil &&
                !($0 is NSPanel) &&
                !secondaryTitles.contains($0.title)
            }) {
                window.makeKeyAndOrderFront(nil)
                // Store for future use
                _mainWindow = window
                window.isReleasedWhenClosed = false
            }
        }
    }
}
