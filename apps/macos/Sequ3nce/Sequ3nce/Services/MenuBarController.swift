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

    // Reference to diagnostics service for sending diagnostics
    weak var diagnosticsService: DiagnosticsService?

    // Local state for thread-safe access
    private var currentRecordingState: RecordingState = .idle
    private var currentIsAuthenticated: Bool = false
    private var currentRecordingDuration: TimeInterval = 0

    // Upcoming calendar events with meeting URLs (for submenu)
    private var upcomingMeetings: [CalendarEvent] = []
    private var calendarPollingTimer: Timer?

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
        startCalendarPolling()
    }

    deinit {
        calendarPollingTimer?.invalidate()
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

                // Refresh calendar events when auth changes
                if isAuth {
                    self?.fetchUpcomingMeetings()
                } else {
                    self?.upcomingMeetings = []
                }
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
            // Join Meeting submenu (if there are meetings with URLs)
            if !upcomingMeetings.isEmpty {
                let joinSubmenu = NSMenu()

                for (index, meeting) in upcomingMeetings.prefix(5).enumerated() {
                    let timeLabel = formatTimeUntilMeeting(meeting)
                    let truncatedTitle = meeting.title.count > 30
                        ? String(meeting.title.prefix(30)) + "..."
                        : meeting.title

                    let meetingItem = NSMenuItem(
                        title: "\(truncatedTitle) (\(timeLabel))",
                        action: #selector(joinMeetingAtIndex(_:)),
                        keyEquivalent: ""
                    )
                    meetingItem.target = self
                    meetingItem.tag = index
                    joinSubmenu.addItem(meetingItem)
                }

                let joinItem = NSMenuItem(title: "Join Meeting", action: nil, keyEquivalent: "")
                joinItem.submenu = joinSubmenu
                menu.addItem(joinItem)

                menu.addItem(NSMenuItem.separator())
            }

            // Start Recording (for ad-hoc recordings)
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

        // Send Diagnostics
        let diagnosticsItem = NSMenuItem(title: "Send Diagnostics...", action: #selector(sendDiagnostics), keyEquivalent: "")
        diagnosticsItem.target = self
        menu.addItem(diagnosticsItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: "Quit Sequ3nce", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem?.menu = menu
    }

    // MARK: - Actions

    @objc func showMainWindow() {
        // Delegate to AppDelegate which has the proper main window reference
        if let appDelegate = NSApp.delegate as? AppDelegate {
            appDelegate.showMainWindow()
        } else {
            // Fallback if AppDelegate not available
            NSApp.activate(ignoringOtherApps: true)
            let secondaryTitles = ["Ammo Tracker", "Training", "Role Play Room", "My Schedule", "Team Messages"]
            if let window = NSApp.windows.first(where: {
                $0.contentView != nil &&
                !($0 is NSPanel) &&
                !secondaryTitles.contains($0.title)
            }) {
                window.makeKeyAndOrderFront(nil)
            }
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

    @objc func sendDiagnostics() {
        showDiagnosticsAlert()
    }

    private func showDiagnosticsAlert() {
        NSApp.activate(ignoringOtherApps: true)

        let alert = NSAlert()
        alert.messageText = "Send Diagnostics"
        alert.informativeText = "This will send system info and recent logs to help debug any issues you're experiencing.\n\nDescribe the issue (optional):"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Send")
        alert.addButton(withTitle: "Cancel")

        // Add text field for description
        let textField = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 80))
        textField.placeholderString = "e.g., Audio stopped working after 5 minutes..."
        textField.cell?.wraps = true
        textField.cell?.isScrollable = false
        alert.accessoryView = textField

        let response = alert.runModal()

        if response == .alertFirstButtonReturn {
            let description = textField.stringValue.isEmpty ? nil : textField.stringValue
            sendDiagnosticsToBackend(description: description)
        }
    }

    private func sendDiagnosticsToBackend(description: String?) {
        guard let diagnosticsService = diagnosticsService else {
            showErrorAlert(message: "Diagnostics service not available")
            return
        }

        // Show progress indicator
        let progressAlert = NSAlert()
        progressAlert.messageText = "Sending Diagnostics..."
        progressAlert.informativeText = "Please wait..."
        progressAlert.alertStyle = .informational
        progressAlert.addButton(withTitle: "Cancel")

        // Add spinner
        let spinner = NSProgressIndicator(frame: NSRect(x: 0, y: 0, width: 32, height: 32))
        spinner.style = .spinning
        spinner.startAnimation(nil)
        progressAlert.accessoryView = spinner

        // Run async task
        Task { @MainActor in
            do {
                let reportId = try await diagnosticsService.sendDiagnostics(userDescription: description)
                showSuccessAlert(reportId: reportId)
            } catch {
                showErrorAlert(message: error.localizedDescription)
            }
        }
    }

    private func showSuccessAlert(reportId: String) {
        let alert = NSAlert()
        alert.messageText = "Diagnostics Sent"
        alert.informativeText = "Thank you! Your diagnostic report has been sent.\n\nReference ID: \(reportId)\n\nShare this ID with support if needed."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Copy ID")
        alert.addButton(withTitle: "OK")

        let response = alert.runModal()

        if response == .alertFirstButtonReturn {
            // Copy to clipboard
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(reportId, forType: .string)
        }
    }

    private func showErrorAlert(message: String) {
        let alert = NSAlert()
        alert.messageText = "Failed to Send Diagnostics"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc func quitApp() {
        NSApp.terminate(nil)
    }

    // MARK: - Calendar Polling

    private func startCalendarPolling() {
        // Poll every 5 minutes
        calendarPollingTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.fetchUpcomingMeetings()
        }
        // Also fetch immediately
        fetchUpcomingMeetings()
    }

    private func fetchUpcomingMeetings() {
        Task { @MainActor in
            guard let appState = appState,
                  let closerInfo = appState.closerInfo,
                  currentIsAuthenticated else {
                print("[MenuBarController] Skipping fetch - not authenticated or missing closerInfo")
                self.upcomingMeetings = []
                self.rebuildMenu()
                return
            }

            do {
                // Use same date range as ScheduleView for consistency
                // Start from beginning of today, end 7 days from now
                let startOfDay = Calendar.current.startOfDay(for: Date())
                let endDate = Calendar.current.date(byAdding: .day, value: 7, to: startOfDay)!

                let startMs = Int64(startOfDay.timeIntervalSince1970 * 1000)
                let endMs = Int64(endDate.timeIntervalSince1970 * 1000)

                print("[MenuBarController] Fetching calendar events for \(closerInfo.email), teamId: \(closerInfo.teamId)")
                print("[MenuBarController] Date range: \(startMs) to \(endMs)")

                let events = try await appState.convexService.getCalendarEvents(
                    email: closerInfo.email,
                    teamId: closerInfo.teamId,
                    startDate: startMs,
                    endDate: endMs
                )

                print("[MenuBarController] Found \(events.count) calendar events")

                // Filter to events with meeting URLs that started within last 30 min or are upcoming
                // This allows joining meetings that already started (e.g., running late)
                let now = Date()
                let thirtyMinAgoMs = (now.timeIntervalSince1970 - 1800) * 1000  // 30 min ago

                let meetingsWithUrl = events
                    .filter { $0.meetingUrl != nil && $0.startTime >= thirtyMinAgoMs }
                    .sorted { $0.startTime < $1.startTime }

                print("[MenuBarController] Events with meeting URLs: \(meetingsWithUrl.count)")
                for event in meetingsWithUrl.prefix(5) {
                    print("[MenuBarController]   - \(event.title): \(event.meetingUrl ?? "no url")")
                }

                self.upcomingMeetings = meetingsWithUrl

                if self.upcomingMeetings.isEmpty {
                    print("[MenuBarController] No meetings with URLs found")
                } else {
                    print("[MenuBarController] \(self.upcomingMeetings.count) meetings available to join")
                }

                self.rebuildMenu()
            } catch {
                print("[MenuBarController] Failed to fetch calendar events: \(error)")
            }
        }
    }

    @objc func joinMeetingAtIndex(_ sender: NSMenuItem) {
        let index = sender.tag
        guard index < upcomingMeetings.count else { return }

        let event = upcomingMeetings[index]
        guard let meetingUrlString = event.meetingUrl,
              let meetingUrl = URL(string: meetingUrlString) else {
            return
        }

        // 1. Open Ammo Panel snapped to right side of screen FIRST
        Task { @MainActor in
            if let state = appState {
                WindowManager.shared.openAmmoPanelSnapped(appState: state)
            }
        }

        // 2. Open the meeting URL in browser (will appear on left)
        NSWorkspace.shared.open(meetingUrl)

        // 3. After browser opens, resize it to fit the left side (alongside Ammo Panel)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            WindowManager.shared.resizeFrontmostWindowToLeft()
        }

        // 4. Post notification to set prospect name BEFORE starting recording
        //    (ContentView handler checks for idle state, so must be before startRecording)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NotificationCenter.default.post(
                name: Notification.Name("StartRecordingFromCalendar"),
                object: nil,
                userInfo: ["prospectName": event.title]
            )
        }
    }

    // MARK: - Helpers

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func formatTimeUntilMeeting(_ event: CalendarEvent) -> String {
        let nowMs = Date().timeIntervalSince1970 * 1000
        let diff = event.startTime - nowMs
        let minutes = Int(diff / 60000)

        if minutes < -1 {
            // Meeting started in the past
            let agoMinutes = abs(minutes)
            if agoMinutes < 60 {
                return "\(agoMinutes)m ago"
            }
            let agoHours = agoMinutes / 60
            return "\(agoHours)h ago"
        } else if minutes < 1 {
            return "now"
        } else if minutes < 60 {
            return "in \(minutes)m"
        }

        let hours = minutes / 60
        if hours < 24 {
            return "in \(hours)h"
        }

        return "tomorrow"
    }
}
