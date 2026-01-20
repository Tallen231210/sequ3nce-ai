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

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu bar will be initialized after AppState is ready (in Sequ3nceApp)
    }

    @MainActor
    func setupMenuBar(with appState: AppState) {
        _menuBarController = MenuBarController(appState: appState)

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
        if !flag {
            _menuBarController?.showMainWindow()
        }
        return true
    }
}
