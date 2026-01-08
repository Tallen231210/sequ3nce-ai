//
//  Sequ3nceApp.swift
//  Sequ3nce
//
//  Native macOS app for sales call recording
//  Uses Core Audio Taps for system audio capture (macOS 14.4+)
//

import SwiftUI
import Sparkle

@main
struct Sequ3nceApp: App {
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

    // Services
    let audioService = AudioCaptureService()
    let webSocketService = StarscreamWebSocketService()  // Using Starscream for RFC 6455 compliance
    let convexService = ConvexService()

    // Timer for duration tracking
    private var durationTimer: Timer?
    private var audioLevelTimer: Timer?

    // Check for saved session on init
    init() {
        loadSavedSession()
        setupAudioCallback()
    }

    private func loadSavedSession() {
        // Load saved closer info from UserDefaults
        if let data = UserDefaults.standard.data(forKey: "closerInfo"),
           let savedCloser = try? JSONDecoder().decode(CloserInfo.self, from: data) {
            self.closerInfo = savedCloser
            self.isAuthenticated = true
            print("[AppState] Restored session for \(savedCloser.name)")
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
    }

    func logout() {
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

        recordingState = .connecting
        error = nil

        do {
            // Generate call ID
            let callId = UUID().uuidString
            currentCallId = callId

            // Set up audio capture
            try await audioService.setup()

            // Connect WebSocket
            try await webSocketService.connect(
                callId: callId,
                teamId: closer.teamId,
                closerId: closer.closerId
            )

            // Start audio capture
            try audioService.startCapture()

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
            convexCallId = webSocketService.convexCallId

            print("[AppState] Recording started - callId: \(callId)")

        } catch {
            recordingState = .error
            self.error = error.localizedDescription
            print("[AppState] Failed to start recording: \(error)")

            // Log error to server (fire and forget)
            Task {
                await convexService.logClientError(
                    closerId: closer.closerId,
                    teamId: closer.teamId,
                    errorType: "recording_start_failed",
                    errorMessage: error.localizedDescription,
                    stackTrace: nil,
                    context: ["callId": currentCallId ?? "unknown"]
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
