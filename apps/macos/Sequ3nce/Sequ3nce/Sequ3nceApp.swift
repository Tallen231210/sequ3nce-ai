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
        // Main recording window
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .frame(width: 400, height: 600)
                .onAppear {
                    // Initialize menu bar after AppState is ready
                    appDelegate.setupMenuBar(with: appState)

                    // Capture reference to main window so we can always bring it back
                    // (Fixes bug where clicking Dock icon wouldn't show main window)
                    DispatchQueue.main.async {
                        let secondaryTitles = ["Ammo Tracker", "Training", "Role Play Room", "My Schedule", "Team Messages"]
                        if let mainWindow = NSApp.windows.first(where: {
                            $0.contentView != nil &&
                            !($0 is NSPanel) &&
                            !secondaryTitles.contains($0.title)
                        }) {
                            appDelegate.mainWindow = mainWindow
                            print("[Sequ3nceApp] Captured main window reference")
                        }
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: Notification.Name("CheckForUpdates"))) { _ in
                    // Handle "Check for Updates" from menu bar
                    if updaterController.updater.canCheckForUpdates {
                        updaterController.updater.checkForUpdates()
                    }
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultSize(width: 400, height: 600)
        .commands {
            // Add "Check for Updates..." menu item
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

    // Services
    let audioService = AudioCaptureService()
    let webSocketService = StarscreamWebSocketService()  // Using Starscream for RFC 6455 compliance
    let convexService = ConvexService()

    // Messaging state
    let messagingState = MessagingState()

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

            // Start messaging polling for restored session
            messagingState.startPolling(
                closerId: savedCloser.closerId,
                teamId: savedCloser.teamId,
                closerName: savedCloser.name
            )
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

        // Start messaging polling
        messagingState.startPolling(
            closerId: closerInfo.closerId,
            teamId: closerInfo.teamId,
            closerName: closerInfo.name
        )
    }

    func logout() {
        // Stop messaging polling
        messagingState.stopPolling()

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
                    self?.recordingDuration += 1
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

        print("[AppState] Recording stopped")
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
