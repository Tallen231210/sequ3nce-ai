//
//  WindowManager.swift
//  Sequ3nce
//
//  Manages additional windows (Ammo Panel, Training)
//

import SwiftUI
import AppKit

/// Singleton to manage app windows
@MainActor
class WindowManager: ObservableObject {
    static let shared = WindowManager()

    private var ammoPanelWindow: NSWindow?
    private var trainingWindow: NSWindow?

    @Published var isAmmoPanelVisible = false
    @Published var isTrainingVisible = false

    private init() {}

    // MARK: - Ammo Panel

    func toggleAmmoPanel(appState: AppState) {
        if isAmmoPanelVisible {
            closeAmmoPanel()
        } else {
            openAmmoPanel(appState: appState)
        }
    }

    func openAmmoPanel(appState: AppState) {
        guard ammoPanelWindow == nil else {
            ammoPanelWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = AmmoPanelView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Ammo Tracker"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 320, height: 400)  // Prevent tabs from wrapping
        window.level = .floating  // Always on top
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        // Position to the right of the main window
        if let mainWindow = NSApp.mainWindow {
            let mainFrame = mainWindow.frame
            window.setFrameOrigin(NSPoint(
                x: mainFrame.maxX + 20,
                y: mainFrame.midY - 200
            ))
        } else {
            window.center()
        }

        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.ammoPanelWindow = nil
                self?.isAmmoPanelVisible = false
            }
        }

        ammoPanelWindow = window
        isAmmoPanelVisible = true
    }

    func closeAmmoPanel() {
        ammoPanelWindow?.close()
        ammoPanelWindow = nil
        isAmmoPanelVisible = false
    }

    // MARK: - Training Window

    func openTrainingWindow(appState: AppState) {
        guard trainingWindow == nil else {
            trainingWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = TrainingView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Training"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 600, height: 400)
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        window.center()
        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.trainingWindow = nil
                self?.isTrainingVisible = false
            }
        }

        trainingWindow = window
        isTrainingVisible = true
    }

    func closeTrainingWindow() {
        trainingWindow?.close()
        trainingWindow = nil
        isTrainingVisible = false
    }
}
