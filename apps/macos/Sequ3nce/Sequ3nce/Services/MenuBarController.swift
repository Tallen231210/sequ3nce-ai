//
//  MenuBarController.swift
//  Sequ3nce
//
//  Manages the macOS menu bar (status bar) presence
//  Shows Sequ3nce logo with recording indicator dot
//

import Cocoa
import SwiftUI
import Combine

class MenuBarController {
    private var statusItem: NSStatusItem?
    private weak var appState: AppState?
    private var cancellables = Set<AnyCancellable>()

    // Local state for thread-safe access
    private var currentRecordingState: RecordingState = .idle
    private var currentIsAuthenticated: Bool = false
    private var currentRecordingDuration: TimeInterval = 0

    var isRecording: Bool {
        currentRecordingState == .recording
    }

    @MainActor
    init(appState: AppState) {
        self.appState = appState
        self.currentRecordingState = appState.recordingState
        self.currentIsAuthenticated = appState.isAuthenticated
        self.currentRecordingDuration = appState.recordingDuration

        setupStatusItem()
        observeAppState(appState)
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        // Verify button exists before proceeding
        guard statusItem?.button != nil else {
            print("[MenuBarController] Failed to create status item button")
            return
        }

        updateIcon(for: currentRecordingState)
        rebuildMenu()
    }

    @MainActor
    private func observeAppState(_ appState: AppState) {
        // Observe recording state changes
        appState.$recordingState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.currentRecordingState = state
                self?.updateIcon(for: state)
                self?.rebuildMenu()
            }
            .store(in: &cancellables)

        // Observe recording duration for menu updates
        appState.$recordingDuration
            .receive(on: DispatchQueue.main)
            .throttle(for: .seconds(1), scheduler: DispatchQueue.main, latest: true)
            .sink { [weak self] duration in
                self?.currentRecordingDuration = duration
                if self?.currentRecordingState == .recording {
                    self?.rebuildMenu()
                }
            }
            .store(in: &cancellables)

        // Observe authentication state
        appState.$isAuthenticated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isAuth in
                self?.currentIsAuthenticated = isAuth
                self?.updateIcon(for: self?.currentRecordingState ?? .idle)
                self?.rebuildMenu()
            }
            .store(in: &cancellables)
    }

    private func updateIcon(for state: RecordingState) {
        guard let button = statusItem?.button else { return }

        // Create composite image: App icon + indicator dot
        let logoSize: CGFloat = 18
        let totalWidth: CGFloat = state == .idle ? logoSize : logoSize + 8
        let compositeImage = NSImage(size: NSSize(width: totalWidth, height: logoSize))

        compositeImage.lockFocus()

        // Draw app icon from MenuBarIcon asset
        if let appIcon = NSImage(named: "MenuBarIcon") {
            // Draw the app icon scaled to menu bar size
            appIcon.draw(in: NSRect(x: 0, y: 0, width: logoSize, height: logoSize),
                        from: NSRect.zero,
                        operation: .sourceOver,
                        fraction: state == .idle && !currentIsAuthenticated ? 0.5 : 1.0)
        } else {
            // Fallback: draw "S" text if icon not found
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.boldSystemFont(ofSize: 14),
                .foregroundColor: NSColor.labelColor
            ]
            "S".draw(at: NSPoint(x: 4, y: 1), withAttributes: attrs)
        }

        // Draw indicator dot based on state (right side of logo)
        if state != .idle {
            let dotSize: CGFloat = 6
            let dotX = logoSize + 1
            let dotY: CGFloat = (logoSize - dotSize) / 2

            let dotRect = NSRect(x: dotX, y: dotY, width: dotSize, height: dotSize)

            switch state {
            case .idle:
                break // No dot
            case .connecting:
                NSColor.systemYellow.setFill()
                NSBezierPath(ovalIn: dotRect).fill()
            case .recording:
                NSColor.systemRed.setFill()
                NSBezierPath(ovalIn: dotRect).fill()
            case .error:
                NSColor.systemRed.setFill()
                NSBezierPath(ovalIn: dotRect).fill()
            }
        }

        compositeImage.unlockFocus()
        compositeImage.isTemplate = false // Don't template the composite (preserve dot colors)
        button.image = compositeImage
    }

    private func rebuildMenu() {
        let menu = NSMenu()

        // Show Sequ3nce
        let showItem = NSMenuItem(title: "Show Sequ3nce", action: #selector(showMainWindow), keyEquivalent: "")
        showItem.target = self
        menu.addItem(showItem)

        menu.addItem(NSMenuItem.separator())

        // Recording controls
        if currentRecordingState == .recording {
            // Duration display
            let durationItem = NSMenuItem(
                title: "● Recording: \(formatDuration(currentRecordingDuration))",
                action: nil,
                keyEquivalent: ""
            )
            durationItem.isEnabled = false
            menu.addItem(durationItem)

            // Stop Recording
            let stopItem = NSMenuItem(title: "Stop Recording", action: #selector(stopRecording), keyEquivalent: "")
            stopItem.target = self
            menu.addItem(stopItem)
        } else if currentRecordingState == .connecting {
            let connectingItem = NSMenuItem(title: "Connecting...", action: nil, keyEquivalent: "")
            connectingItem.isEnabled = false
            menu.addItem(connectingItem)
        } else if currentIsAuthenticated {
            // Start Recording
            let startItem = NSMenuItem(title: "Start Recording", action: #selector(startRecording), keyEquivalent: "")
            startItem.target = self
            menu.addItem(startItem)
        }

        menu.addItem(NSMenuItem.separator())

        // Quick access (authenticated only)
        if currentIsAuthenticated {
            let ammoItem = NSMenuItem(title: "Open Ammo Panel", action: #selector(openAmmoPanel), keyEquivalent: "")
            ammoItem.target = self
            menu.addItem(ammoItem)

            let scheduleItem = NSMenuItem(title: "My Schedule", action: #selector(openSchedule), keyEquivalent: "")
            scheduleItem.target = self
            menu.addItem(scheduleItem)

            menu.addItem(NSMenuItem.separator())
        }

        // Check for Updates
        let updateItem = NSMenuItem(title: "Check for Updates...", action: #selector(checkForUpdates), keyEquivalent: "")
        updateItem.target = self
        menu.addItem(updateItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: "Quit Sequ3nce", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem?.menu = menu
    }

    // MARK: - Actions

    @objc func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)

        // Find and show the main window
        if let window = NSApp.windows.first(where: { $0.contentView != nil && !($0 is NSPanel) }) {
            window.makeKeyAndOrderFront(nil)
        } else {
            // If no window exists, the WindowGroup will create one
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    @objc func startRecording() {
        showMainWindow()
        Task { @MainActor in
            await appState?.startRecording()
        }
    }

    @objc func stopRecording() {
        Task { @MainActor in
            appState?.stopRecording()
        }
        showMainWindow() // Show for post-call questionnaire
    }

    @objc func openAmmoPanel() {
        NSApp.activate(ignoringOtherApps: true)
        Task { @MainActor in
            if let state = appState {
                WindowManager.shared.openAmmoPanel(appState: state)
            }
        }
    }

    @objc func openSchedule() {
        NSApp.activate(ignoringOtherApps: true)
        Task { @MainActor in
            if let state = appState {
                WindowManager.shared.openScheduleWindow(appState: state)
            }
        }
    }

    @objc func checkForUpdates() {
        // Post notification to trigger Sparkle update check
        NotificationCenter.default.post(name: Notification.Name("CheckForUpdates"), object: nil)
    }

    @objc func quitApp() {
        NSApp.terminate(nil)
    }

    // MARK: - Helpers

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
