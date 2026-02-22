//
//  Sequ3nceApp.swift
//  Sequ3nce
//
//  Native macOS app for sales call recording
//  Uses Core Audio Taps for system audio capture (macOS 14.4+)
//

import SwiftUI
import Sparkle
import Combine
import UserNotifications

@main
struct Sequ3nceApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState()

    // Sparkle auto-updater
    private let updaterController: SPUStandardUpdaterController

    init() {
        // Initialize Sparkle updater (starts checking for updates automatically)
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )

        // Check for updates after launch and show dialog if available
        // Using checkForUpdates() instead of checkForUpdatesInBackground()
        // to ensure the update dialog is shown prominently
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [updaterController] in
            // Only check if we can (prevents multiple dialogs)
            if updaterController.updater.canCheckForUpdates {
                updaterController.updater.checkForUpdates()
            }
        }
    }

    var body: some Scene {
        // Main window - adapts between compact (legacy) and full-screen (meeting bot) mode
        Window("Sequ3nce", id: "main") {
            MainWindowRouter()
                .environmentObject(appState)
                .onAppear {
                    // Log app launch for diagnostics
                    let windowCount = NSApp.windows.count
                    DiagnosticLogger.shared.info(
                        "Main window appeared",
                        category: .app,
                        metadata: ["windowCount": "\(windowCount)"]
                    )

                    // Initialize menu bar after AppState is ready
                    appDelegate.setupMenuBar(with: appState)

                    // Capture reference to main window
                    DispatchQueue.main.async {
                        let secondaryTitles = ["Ammo Tracker", "Training", "Role Play Room", "My Schedule", "Team Messages"]
                        if let mainWindow = NSApp.windows.first(where: {
                            $0.contentView != nil &&
                            !($0 is NSPanel) &&
                            !secondaryTitles.contains($0.title)
                        }) {
                            appDelegate.mainWindow = mainWindow

                            // Resize for meeting bot mode if needed
                            if self.appState.meetingBotEnabled {
                                mainWindow.setContentSize(NSSize(width: 1200, height: 800))
                                mainWindow.minSize = NSSize(width: 900, height: 600)
                                mainWindow.center()
                            }

                            DiagnosticLogger.shared.info(
                                "Captured main window reference",
                                category: .app,
                                metadata: ["windowTitle": mainWindow.title]
                            )
                        }
                    }

                    // Check meeting bot status after login
                    Task {
                        await appState.checkMeetingBotStatus()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: Notification.Name("CheckForUpdates"))) { _ in
                    if updaterController.updater.canCheckForUpdates {
                        updaterController.updater.checkForUpdates()
                    }
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(appState.meetingBotEnabled ? .automatic : .contentSize)
        .defaultSize(width: appState.meetingBotEnabled ? 1200 : 400,
                     height: appState.meetingBotEnabled ? 800 : 600)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: updaterController.updater)
            }
        }
    }
}

// MARK: - Sparkle Update Menu

/// SwiftUI view that wraps Sparkle's "Check for Updates" functionality
struct CheckForUpdatesView: View {
    @ObservedObject private var checkForUpdatesViewModel: CheckForUpdatesViewModel
    let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        self.checkForUpdatesViewModel = CheckForUpdatesViewModel(updater: updater)
    }

    var body: some View {
        Button("Check for Updates...") {
            updater.checkForUpdates()
        }
        .disabled(!checkForUpdatesViewModel.canCheckForUpdates)
    }
}

/// ViewModel for tracking whether update checks are available
final class CheckForUpdatesViewModel: ObservableObject {
    @Published var canCheckForUpdates = false

    init(updater: SPUUpdater) {
        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }
}

// MARK: - App State
/// Connection state for UI display
enum ConnectionState: Equatable {
    case connected
    case reconnecting(attempt: Int)
    case disconnected

    var displayText: String {
        switch self {
        case .connected: return "Connected"
        case .reconnecting(let attempt): return "Reconnecting... (\(attempt))"
        case .disconnected: return "Disconnected"
        }
    }

    var isReconnecting: Bool {
        if case .reconnecting = self { return true }
        return false
    }
}

/// Navigation sidebar items for meeting bot mode
enum SidebarItem: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case stats = "Stats"
    case calls = "Calls"
    case schedule = "Schedule"
    case roleplay = "Role Play"
    case messages = "Messages"
    case resources = "Resources"
    case coaching = "Coaching"
    case settings = "Settings"

    var id: String { rawValue }

    var iconName: String {
        switch self {
        case .dashboard: return "house.fill"
        case .stats: return "chart.bar.fill"
        case .calls: return "video.fill"
        case .schedule: return "calendar"
        case .roleplay: return "person.2.fill"
        case .messages: return "message.fill"
        case .resources: return "folder.fill"
        case .coaching: return "text.bubble.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

/// Global app state shared across views
@MainActor
class AppState: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var closerInfo: CloserInfo?
    @Published var recordingState: RecordingState = .idle
    @Published var audioLevel: Float = 0.0
    @Published var recordingDuration: TimeInterval = 0
    @Published var currentCallId: String?
    @Published var convexCallId: String?
    @Published var error: String?
    @Published var connectionState: ConnectionState = .disconnected

    // Meeting Bot state
    @Published var meetingBotEnabled: Bool = UserDefaults.standard.bool(forKey: "meetingBotEnabled")
    @Published var botCallActive: Bool = false
    @Published var botIsScheduled: Bool = false  // Bot exists but hasn't joined yet
    @Published var botActiveStartTime: Date? = nil  // When bot became active (for min duration guard)
    @Published var activeBotCallId: String?
    @Published var activeBotId: String?  // Meeting BaaS bot ID for kick/cancel
    @Published var activeBotMeetingTitle: String?
    @Published var activeBotProspectName: String?
    @Published var pendingQuestionnaireCount: Int = 0
    @Published var firstPendingCallId: String?
    @Published var firstPendingProspectName: String?
    @Published var needsCalendarOnboarding: Bool = false
    @Published var selectedSidebarItem: SidebarItem = .dashboard
    @Published var showActiveCallView: Bool = false
    @Published var unreadFeedbackCount: Int = 0
    @Published var unreadSharedMomentsCount: Int = 0

    // Post-call questionnaire state (triggered when bot call ends)
    @Published var showBotPostCallQuestionnaire: Bool = false
    @Published var botQuestionnaireCallId: String?
    @Published var botQuestionnaireProspectName: String?

    // Services
    let audioService = AudioCaptureService()
    let webSocketService = StarscreamWebSocketService()  // Using Starscream for RFC 6455 compliance
    let convexService = ConvexService()
    let diagnosticsService = DiagnosticsService()

    // Messaging state
    let messagingState = MessagingState()

    // Bot polling timer
    private var botPollingTimer: Timer?

    // Coaching feedback polling timer
    private var feedbackPollingTimer: Timer?

    // Timer for duration tracking
    private var durationTimer: Timer?
    private var audioLevelTimer: Timer?

    // Combine cancellables for observing WebSocket state
    private var cancellables = Set<AnyCancellable>()

    // Check for saved session on init
    init() {
        loadSavedSession()
        setupAudioCallback()
        setupWebSocketObserver()
        setupDiagnosticsService()
    }

    private func setupDiagnosticsService() {
        // Wire up service references
        diagnosticsService.audioService = audioService
        diagnosticsService.webSocketService = webSocketService
        diagnosticsService.convexService = convexService

        // Update diagnostics service state when relevant properties change
        // (will be updated in startRecording/stopRecording as well)
    }

    /// Observe WebSocket convexCallId changes and update AppState
    private func setupWebSocketObserver() {
        webSocketService.$convexCallId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newCallId in
                guard let self = self else { return }
                if self.convexCallId != newCallId {
                    print("[AppState] convexCallId updated: \(self.convexCallId ?? "nil") -> \(newCallId ?? "nil")")
                    self.convexCallId = newCallId
                    // Update diagnostics service
                    self.diagnosticsService.convexCallId = newCallId
                }
            }
            .store(in: &cancellables)

        // Observe WebSocket state for connection status
        webSocketService.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newState in
                guard let self = self else { return }
                switch newState {
                case .ready, .connected:
                    self.connectionState = .connected
                case .reconnecting(let attempt):
                    self.connectionState = .reconnecting(attempt: attempt)
                    print("[AppState] Connection state: reconnecting (attempt \(attempt))")
                case .disconnected:
                    if self.recordingState == .recording {
                        // Only show disconnected if we were actively recording
                        self.connectionState = .disconnected
                    }
                case .connecting:
                    // Don't change connection state during initial connect
                    break
                case .error(let msg):
                    self.connectionState = .disconnected
                    print("[AppState] Connection error: \(msg)")
                }
            }
            .store(in: &cancellables)

        // Set up reconnection callbacks
        webSocketService.onReconnecting = { [weak self] attempt in
            Task { @MainActor in
                self?.connectionState = .reconnecting(attempt: attempt)
                print("[AppState] WebSocket reconnecting, attempt \(attempt)")
            }
        }

        webSocketService.onReconnected = { [weak self] in
            Task { @MainActor in
                self?.connectionState = .connected
                print("[AppState] WebSocket reconnected successfully")
            }
        }
    }

    private func loadSavedSession() {
        // Load saved closer info from UserDefaults
        if let data = UserDefaults.standard.data(forKey: "closerInfo"),
           let savedCloser = try? JSONDecoder().decode(CloserInfo.self, from: data) {
            self.closerInfo = savedCloser
            self.isAuthenticated = true
            print("[AppState] Restored session for \(savedCloser.name)")

            // Update diagnostics service with user info
            diagnosticsService.closerId = savedCloser.closerId
            diagnosticsService.teamId = savedCloser.teamId
            diagnosticsService.closerEmail = savedCloser.email

            // Start messaging polling for restored session
            messagingState.startPolling(
                closerId: savedCloser.closerId,
                teamId: savedCloser.teamId,
                closerName: savedCloser.name
            )

            // Start coaching feedback polling for restored session
            startFeedbackPolling()
        }
    }

    private func saveSession() {
        guard let closerInfo = closerInfo else { return }
        if let data = try? JSONEncoder().encode(closerInfo) {
            UserDefaults.standard.set(data, forKey: "closerInfo")
            print("[AppState] Saved session for \(closerInfo.name)")
        }
    }

    private func clearSession() {
        UserDefaults.standard.removeObject(forKey: "closerInfo")
        print("[AppState] Cleared saved session")
    }

    // Debug counter for audio callback
    private var audioCallbackCount = 0

    private func setupAudioCallback() {
        // Wire audio data from capture service to WebSocket
        audioService.onAudioData = { [weak self] data in
            guard let self = self else { return }
            self.audioCallbackCount += 1
            if self.audioCallbackCount % 50 == 1 {
                print("[AppState] Received audio data: \(data.count) bytes (callback #\(self.audioCallbackCount))")
            }
            self.webSocketService.sendAudioData(data)
        }
    }

    // MARK: - Authentication

    func login(email: String, password: String) async throws {
        let closerInfo = try await convexService.login(email: email, password: password)
        self.closerInfo = closerInfo
        self.isAuthenticated = true
        saveSession()

        // Update diagnostics service with user info
        diagnosticsService.closerId = closerInfo.closerId
        diagnosticsService.teamId = closerInfo.teamId
        diagnosticsService.closerEmail = closerInfo.email

        // Start messaging polling
        messagingState.startPolling(
            closerId: closerInfo.closerId,
            teamId: closerInfo.teamId,
            closerName: closerInfo.name
        )

        // Start coaching feedback polling
        startFeedbackPolling()

        // Check meeting bot status after login
        await checkMeetingBotStatus()
    }

    func logout() {
        // Stop messaging polling
        messagingState.stopPolling()

        // Stop bot polling
        stopBotPolling()

        // Stop feedback polling
        stopFeedbackPolling()

        // Clear diagnostics service user info
        diagnosticsService.closerId = nil
        diagnosticsService.teamId = nil
        diagnosticsService.closerEmail = nil
        diagnosticsService.meetingBotEnabled = false
        diagnosticsService.botCallActive = false
        diagnosticsService.activeBotCallId = nil
        diagnosticsService.activeBotId = nil
        diagnosticsService.activeBotMeetingTitle = nil
        diagnosticsService.activeBotProspectName = nil
        diagnosticsService.pendingQuestionnaireCount = 0
        diagnosticsService.showingPostCallQuestionnaire = false
        diagnosticsService.pollBotStatusActive = false

        // Reset meeting bot state
        meetingBotEnabled = false
        UserDefaults.standard.removeObject(forKey: "meetingBotEnabled")
        botCallActive = false
        activeBotCallId = nil
        activeBotId = nil
        activeBotMeetingTitle = nil
        activeBotProspectName = nil
        pendingQuestionnaireCount = 0
        firstPendingCallId = nil
        firstPendingProspectName = nil
        needsCalendarOnboarding = false
        selectedSidebarItem = .dashboard
        showActiveCallView = false
        showBotPostCallQuestionnaire = false
        botQuestionnaireCallId = nil
        botQuestionnaireProspectName = nil

        isAuthenticated = false
        closerInfo = nil
        stopRecording()
        clearSession()
    }

    // MARK: - Recording

    func startRecording() async {
        guard let closer = closerInfo else {
            error = "Not logged in"
            return
        }

        // Log that recording is starting (for debugging)
        print("[AppState] startRecording called - current state: \(recordingState)")

        recordingState = .connecting
        error = nil

        // Track timing for diagnostics
        let startTime = Date()
        var stepTimings: [String: Double] = [:]

        do {
            // Generate call ID
            let callId = UUID().uuidString
            currentCallId = callId

            // Step 1: Set up audio capture
            print("[AppState] Step 1: Setting up audio capture...")
            let audioSetupStart = Date()
            try await audioService.setup()
            stepTimings["audioSetup"] = Date().timeIntervalSince(audioSetupStart)
            print("[AppState] Audio setup complete in \(stepTimings["audioSetup"]!)s")

            // Set call context for error reporting
            audioService.setCallContext(callId: callId, teamId: closer.teamId, closerId: closer.closerId)

            // Step 2: Connect WebSocket
            print("[AppState] Step 2: Connecting WebSocket...")
            let wsConnectStart = Date()
            try await webSocketService.connect(
                callId: callId,
                teamId: closer.teamId,
                closerId: closer.closerId
            )
            stepTimings["wsConnect"] = Date().timeIntervalSince(wsConnectStart)
            print("[AppState] WebSocket connected in \(stepTimings["wsConnect"]!)s")

            // Step 3: Start audio capture
            print("[AppState] Step 3: Starting audio capture...")
            let audioCaptureStart = Date()
            try audioService.startCapture()
            stepTimings["audioCapture"] = Date().timeIntervalSince(audioCaptureStart)
            print("[AppState] Audio capture started in \(stepTimings["audioCapture"]!)s")

            // Start duration timer (every 1 second)
            durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self = self else { return }
                    self.recordingDuration += 1
                    // Keep diagnostics service in sync
                    self.diagnosticsService.recordingDuration = self.recordingDuration
                }
            }

            // Start audio level timer (every 100ms for smooth meter)
            audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.audioLevel = self?.audioService.micLevel ?? 0.0
                }
            }

            recordingState = .recording
            let totalTime = Date().timeIntervalSince(startTime)
            print("[AppState] Recording started successfully - callId: \(callId), totalTime: \(totalTime)s")

            // Log to diagnostic buffer
            DiagnosticLogger.shared.info(
                "Recording started",
                category: .recording,
                metadata: [
                    "callId": callId,
                    "totalTimeMs": "\(Int(totalTime * 1000))"
                ]
            )

            // Update diagnostics service state
            diagnosticsService.closerId = closer.closerId
            diagnosticsService.teamId = closer.teamId
            diagnosticsService.closerEmail = closer.email
            diagnosticsService.currentCallId = callId
            diagnosticsService.recordingState = "recording"
            diagnosticsService.recordingStartTime = Date()

            // Log successful start (helps track if issues happen after successful start)
            Task {
                await convexService.logClientError(
                    closerId: closer.closerId,
                    teamId: closer.teamId,
                    errorType: "recording_started",
                    errorMessage: "Recording started successfully",
                    stackTrace: nil,
                    context: [
                        "callId": callId,
                        "totalTimeMs": String(Int(totalTime * 1000)),
                        "audioSetupMs": String(Int((stepTimings["audioSetup"] ?? 0) * 1000)),
                        "wsConnectMs": String(Int((stepTimings["wsConnect"] ?? 0) * 1000)),
                        "audioCaptureMs": String(Int((stepTimings["audioCapture"] ?? 0) * 1000))
                    ]
                )
            }

        } catch {
            let totalTime = Date().timeIntervalSince(startTime)
            recordingState = .error
            self.error = error.localizedDescription
            print("[AppState] Failed to start recording after \(totalTime)s: \(error)")

            // Log to diagnostic buffer
            DiagnosticLogger.shared.error(
                "Recording failed to start: \(error.localizedDescription)",
                category: .recording,
                metadata: ["totalTimeMs": "\(Int(totalTime * 1000))"]
            )

            // Determine which step failed
            let failedStep: String
            if stepTimings["audioSetup"] == nil {
                failedStep = "audio_setup"
            } else if stepTimings["wsConnect"] == nil {
                failedStep = "websocket_connect"
            } else if stepTimings["audioCapture"] == nil {
                failedStep = "audio_capture_start"
            } else {
                failedStep = "unknown"
            }

            // Log detailed error to server
            Task {
                await convexService.logClientError(
                    closerId: closer.closerId,
                    teamId: closer.teamId,
                    errorType: "recording_start_failed",
                    errorMessage: error.localizedDescription,
                    stackTrace: String(describing: error),
                    context: [
                        "callId": currentCallId ?? "unknown",
                        "failedStep": failedStep,
                        "totalTimeMs": String(Int(totalTime * 1000)),
                        "audioSetupMs": String(Int((stepTimings["audioSetup"] ?? 0) * 1000)),
                        "wsConnectMs": String(Int((stepTimings["wsConnect"] ?? 0) * 1000)),
                        "osVersion": ProcessInfo.processInfo.operatingSystemVersionString
                    ]
                )
            }
        }
    }

    func stopRecording() {
        guard recordingState == .recording else { return }

        // Stop timers
        durationTimer?.invalidate()
        durationTimer = nil
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil

        // Stop audio capture
        audioService.stopCapture()

        // End WebSocket connection
        Task {
            await webSocketService.endCall()
        }

        // Reset state
        recordingState = .idle
        recordingDuration = 0
        audioLevel = 0.0
        currentCallId = nil
        convexCallId = nil

        // Log to diagnostic buffer
        DiagnosticLogger.shared.info(
            "Recording stopped",
            category: .recording,
            metadata: ["duration": "\(Int(recordingDuration))s"]
        )

        // Update diagnostics service state
        diagnosticsService.currentCallId = nil
        diagnosticsService.convexCallId = nil
        diagnosticsService.recordingState = "idle"
        diagnosticsService.recordingDuration = 0
        diagnosticsService.recordingStartTime = nil

        print("[AppState] Recording stopped")
    }

    // MARK: - Meeting Bot

    /// Check if the team has meeting bot enabled and start polling
    func checkMeetingBotStatus() async {
        guard let closer = closerInfo else { return }

        do {
            let enabled = try await convexService.isMeetingBotEnabled(teamId: closer.teamId)
            self.meetingBotEnabled = enabled
            UserDefaults.standard.set(enabled, forKey: "meetingBotEnabled")
            diagnosticsService.meetingBotEnabled = enabled

            if enabled {
                // Check if closer needs calendar onboarding
                let needsOnboarding = try await convexService.needsCalendarOnboarding(closerId: closer.closerId)
                self.needsCalendarOnboarding = needsOnboarding

                // Resize the window to full-screen hub size
                DispatchQueue.main.async {
                    if let mainWindow = NSApp.windows.first(where: {
                        $0.contentView != nil &&
                        !($0 is NSPanel) &&
                        !["Ammo Tracker", "Training", "Role Play Room", "My Schedule", "Team Messages"].contains($0.title)
                    }) {
                        mainWindow.setContentSize(NSSize(width: 1200, height: 800))
                        mainWindow.minSize = NSSize(width: 900, height: 600)
                        mainWindow.center()
                    }
                }

                // Start bot polling
                startBotPolling()
            }
        } catch {
            print("[AppState] Failed to check meeting bot status: \(error)")
        }
    }

    /// Start polling for active bot calls every 10 seconds
    func startBotPolling() {
        guard botPollingTimer == nil else { return }

        // Poll immediately
        Task { await pollBotStatus() }

        // Then poll every 3 seconds (fast enough to catch call end promptly)
        botPollingTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollBotStatus()
            }
        }
        print("[AppState] Started bot polling")
    }

    /// Stop bot polling
    func stopBotPolling() {
        botPollingTimer?.invalidate()
        botPollingTimer = nil
        print("[AppState] Stopped bot polling")
    }

    /// Start polling for unread coaching feedback every 30 seconds
    func startFeedbackPolling() {
        guard feedbackPollingTimer == nil else { return }

        // Poll immediately
        Task { await pollFeedbackCount() }

        // Then poll every 30 seconds (feedback is not time-critical)
        feedbackPollingTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollFeedbackCount()
            }
        }
        print("[AppState] Started feedback polling")
    }

    /// Stop feedback polling
    func stopFeedbackPolling() {
        feedbackPollingTimer?.invalidate()
        feedbackPollingTimer = nil
        unreadFeedbackCount = 0
        unreadSharedMomentsCount = 0
        print("[AppState] Stopped feedback polling")
    }

    /// Poll for unread coaching feedback and shared moments counts
    private func pollFeedbackCount() async {
        guard let closer = closerInfo else { return }

        // Poll independently so one failure doesn't block the other
        do {
            let count = try await convexService.getUnreadFeedbackCount(closerId: closer.closerId)
            unreadFeedbackCount = count
        } catch {
            print("[AppState] Failed to poll feedback count: \(error)")
        }

        do {
            let count = try await convexService.getUnreadSharedMomentsCount(closerId: closer.closerId)
            if count != unreadSharedMomentsCount {
                print("[AppState] Shared moments unread count changed: \(unreadSharedMomentsCount) → \(count)")
            }
            unreadSharedMomentsCount = count
        } catch {
            print("[AppState] Failed to poll shared moments count: \(error)")
        }
    }

    /// Poll for active bot calls and pending questionnaires
    private func pollBotStatus() async {
        guard let closer = closerInfo else { return }

        do {
            // Check for active bot call
            let activeBot = try await convexService.getActiveCallForCloserBot(closerId: closer.closerId)

            let wasBotActive = botCallActive
            let previousCallId = activeBotCallId
            let previousProspectName = activeBotProspectName

            print("[AppState] pollBotStatus: activeBot=\(activeBot != nil), wasBotActive=\(wasBotActive), botCallActive=\(botCallActive)")

            if let bot = activeBot {
                if bot.status == "active" {
                    let wasAlreadyActive = botCallActive
                    botCallActive = true
                    botIsScheduled = false
                    activeBotCallId = bot.callId
                    activeBotId = bot.botId
                    activeBotMeetingTitle = bot.meetingTitle
                    activeBotProspectName = bot.prospectName

                    // Auto-open ammo panel when bot call first becomes active
                    if !wasAlreadyActive {
                        botActiveStartTime = Date()  // Track when bot became active
                        print("[AppState] AUTO-OPENING ammo panel — bot call just became active")
                        print("[AppState] NOTE: If testing on same computer, live audio may break up due to audio feedback loop")
                        WindowManager.shared.openAmmoPanel(appState: self)
                    }
                } else if bot.status == "scheduled" {
                    // Bot exists but hasn't joined the meeting yet
                    botIsScheduled = true
                    botCallActive = false
                    activeBotId = bot.botId
                    activeBotMeetingTitle = bot.meetingTitle
                    activeBotProspectName = bot.prospectName
                    print("[AppState] Bot is scheduled (joining meeting...)")
                }
            } else {
                botIsScheduled = false
                botCallActive = false
                activeBotCallId = nil
                activeBotId = nil
                activeBotMeetingTitle = nil
                activeBotProspectName = nil

                // If bot was active and now isn't, a call just ended
                // Guard: require bot to have been active for at least 30 seconds
                // and not in "scheduled" state (prevents premature questionnaire)
                if wasBotActive {
                    let activeSeconds = botActiveStartTime.map { Date().timeIntervalSince($0) } ?? 0
                    botActiveStartTime = nil  // Reset

                    if activeSeconds >= 30 {
                        print("[AppState] BOT CALL ENDED (\(Int(activeSeconds))s) — opening questionnaire for callId=\(previousCallId ?? "nil")")
                        showActiveCallView = false
                        WindowManager.shared.closeAmmoPanel()

                        // Open floating questionnaire panel over all windows
                        if let callId = previousCallId {
                            botQuestionnaireCallId = callId
                            botQuestionnaireProspectName = previousProspectName
                            showBotPostCallQuestionnaire = true
                            WindowManager.shared.openQuestionnairePanel(
                                appState: self,
                                callId: callId,
                                prospectName: previousProspectName ?? "Prospect"
                            )
                        }

                        // Send notification if app is in background
                        sendBotCallEndedNotification()
                    } else {
                        print("[AppState] BOT CALL TOO SHORT (\(Int(activeSeconds))s) — skipping questionnaire")
                    }
                } else {
                    botActiveStartTime = nil  // Reset if no active bot
                }
            }

            // Check pending questionnaires
            let pendingInfo = try await convexService.getPendingQuestionnaireInfo(closerId: closer.closerId)
            self.pendingQuestionnaireCount = pendingInfo.count
            self.firstPendingCallId = pendingInfo.firstCallId
            self.firstPendingProspectName = pendingInfo.firstProspectName

            // Keep diagnostics service in sync
            diagnosticsService.botCallActive = botCallActive
            diagnosticsService.activeBotCallId = activeBotCallId
            diagnosticsService.activeBotId = activeBotId
            diagnosticsService.activeBotMeetingTitle = activeBotMeetingTitle
            diagnosticsService.activeBotProspectName = activeBotProspectName
            diagnosticsService.pendingQuestionnaireCount = pendingInfo.count
            diagnosticsService.showingPostCallQuestionnaire = showBotPostCallQuestionnaire
            diagnosticsService.pollBotStatusActive = botPollingTimer != nil
            diagnosticsService.currentSidebarItem = selectedSidebarItem.rawValue
            diagnosticsService.ammoPanelVisible = WindowManager.shared.isAmmoPanelVisible
            diagnosticsService.questionnairePanelVisible = WindowManager.shared.isQuestionnairePanelVisible
            diagnosticsService.firstPendingCallId = firstPendingCallId
            diagnosticsService.firstPendingProspectName = firstPendingProspectName
            diagnosticsService.botStatus = activeBot?.status
            diagnosticsService.botIsScheduled = botIsScheduled
            diagnosticsService.botActiveSeconds = botActiveStartTime.map { Date().timeIntervalSince($0) }

        } catch {
            // Silent failure - polling will retry
            print("[AppState] Bot poll error: \(error.localizedDescription)")
            diagnosticsService.lastBotError = error.localizedDescription
            diagnosticsService.lastBotErrorAt = Date()
        }
    }

    /// Send macOS notification when a bot call ends (app in background)
    private func sendBotCallEndedNotification() {
        guard !NSApp.isActive else { return } // Only notify if app is in background

        let content = UNMutableNotificationContent()
        content.title = "Call Ended"
        content.body = "Your call with \(activeBotProspectName ?? "prospect") ended — how did it go?"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "botCallEnded-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - Models
struct CloserInfo: Codable {
    let closerId: String
    let teamId: String
    let name: String
    let email: String
    let teamName: String
}

enum RecordingState {
    case idle
    case connecting
    case recording
    case error

    var displayText: String {
        switch self {
        case .idle: return "Ready"
        case .connecting: return "Connecting..."
        case .recording: return "Recording"
        case .error: return "Error"
        }
    }

    var statusColor: Color {
        switch self {
        case .idle: return .gray
        case .connecting: return .yellow
        case .recording: return .green
        case .error: return .red
        }
    }
}

/// Info about an active bot call (returned from ConvexService)
struct ActiveBotInfo {
    let callId: String?
    let meetingTitle: String?
    let prospectName: String?
    let botId: String
    let status: String
}

// MARK: - Main Window Router

/// Routes between legacy compact view (400x600) and new full-screen hub based on meetingBotEnabled flag
struct MainWindowRouter: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if !appState.isAuthenticated {
                // Login view - same for both modes
                ContentView()
                    .frame(width: 400, height: 600)
            } else if appState.meetingBotEnabled {
                // Full-screen meeting bot hub with sidebar
                MeetingBotHubView()
            } else {
                // Legacy compact recording view
                ContentView()
                    .frame(width: 400, height: 600)
            }
        }
    }
}

// MARK: - Meeting Bot Hub (Full-Screen with Sidebar)

/// The full-screen app layout with sidebar navigation for meeting bot mode
struct MeetingBotHubView: View {
    @EnvironmentObject var appState: AppState
    @State private var showQuickBotSheet = false

    var body: some View {
        ZStack {
            // Main content with sidebar
            NavigationSplitView {
                // Sidebar
                VStack(spacing: 0) {
                    // Logo & User info
                    VStack(spacing: 8) {
                        Image("Logo")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(height: 40)
                            .padding(.top, 20)
                            .padding(.horizontal, 24)

                        if let closer = appState.closerInfo {
                            Text(closer.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            Text(closer.teamName)
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.bottom, 16)

                    Divider()

                    // Navigation items
                    VStack(spacing: 2) {
                        ForEach(SidebarItem.allCases) { item in
                            SidebarButton(
                                item: item,
                                isSelected: appState.selectedSidebarItem == item,
                                badgeCount: badgeCount(for: item)
                            ) {
                                appState.selectedSidebarItem = item
                                appState.showActiveCallView = false

                                // Mark messages as read when switching to Messages tab
                                if item == .messages {
                                    appState.messagingState.openChatPanel()
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)

                    Spacer()

                    // Sign Out
                    HStack {
                        Spacer()

                        Button(action: {
                            appState.logout()
                        }) {
                            HStack(spacing: 4) {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .font(.system(size: 12))
                                Text("Sign Out")
                                    .font(.system(size: 11))
                            }
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(.secondary)

                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                }
                .frame(minWidth: 180, idealWidth: 200, maxWidth: 220)
                .background(Color(NSColor.controlBackgroundColor))
            } detail: {
                // Main content area
                VStack(spacing: 0) {
                    // Top bar with Quick Bot button
                    if !appState.showActiveCallView || !appState.botCallActive {
                        HStack {
                            Spacer()

                            Button(action: {
                                showQuickBotSheet = true
                            }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 13))
                                    Text("Quick Bot")
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(Color.black)
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(Color(white: 0.98))
                    }

                    // Content
                    Group {
                        if appState.showActiveCallView && appState.botCallActive {
                            ActiveCallView()
                        } else {
                            switch appState.selectedSidebarItem {
                            case .dashboard:
                                DashboardView()
                            case .stats:
                                StatsView()
                            case .calls:
                                CallHistoryView()
                            case .schedule:
                                ScheduleView()
                            case .roleplay:
                                RolePlayRoomView()
                            case .messages:
                                InlineMessagesView(messagingState: appState.messagingState)
                            case .resources:
                                ResourcesView()
                            case .coaching:
                                CoachingView()
                            case .settings:
                                BotSettingsView()
                            }
                        }
                    }
                }
            }
            .navigationSplitViewStyle(.balanced)

            // Onboarding overlay (blocks everything until completed)
            if appState.needsCalendarOnboarding {
                BotOnboardingView()
                    .transition(.opacity)
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .onAppear {
            // Force light mode
            NSApp.appearance = NSAppearance(named: .aqua)
        }
        .sheet(isPresented: $showQuickBotSheet) {
            QuickBotSheet(isPresented: $showQuickBotSheet)
                .environmentObject(appState)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("ShowQuickBot"))) { _ in
            showQuickBotSheet = true
        }
    }

    private func badgeCount(for item: SidebarItem) -> Int {
        switch item {
        case .calls:
            return appState.pendingQuestionnaireCount
        case .messages:
            return appState.messagingState.unreadCount
        case .coaching:
            return appState.unreadFeedbackCount + appState.unreadSharedMomentsCount
        default:
            return 0
        }
    }
}

// MARK: - Sidebar Button

struct SidebarButton: View {
    let item: SidebarItem
    let isSelected: Bool
    var badgeCount: Int = 0
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: item.iconName)
                    .font(.system(size: 14))
                    .frame(width: 20)
                Text(item.rawValue)
                    .font(.system(size: 13))
                Spacer()
                if badgeCount > 0 {
                    Text("\(badgeCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.red)
                        .cornerRadius(8)
                }
            }
            .foregroundColor(isSelected ? .white : (isHovered ? .black : .primary))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.black : (isHovered ? Color(white: 0.93) : Color.clear))
            )
            .shadow(color: isSelected ? Color.black.opacity(0.25) : Color.clear, radius: 6, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }
}
