//
//  RolePlayRoomView.swift
//  Sequ3nce
//
//  Role Play Room - persistent video chat room for team practice
//  Uses Daily.co prebuilt UI via WKWebView
//

import SwiftUI
@preconcurrency import WebKit

// MARK: - Role Play Room View Model

@MainActor
class RolePlayRoomViewModel: ObservableObject {
    @Published var roomUrl: String?
    @Published var isLoading = true
    @Published var error: String?
    @Published var participants: [RolePlayRoomParticipant] = []
    @Published var sessionStartTime: Date?
    @Published var sessionDuration: TimeInterval = 0

    private let convexService = ConvexService()
    private var participantPollingTimer: Timer?
    private var sessionTimer: Timer?
    private var hasJoined = false

    // Team and user info
    var teamId: String = ""
    var closerId: String = ""
    var userName: String = ""

    func setup(teamId: String, closerId: String, userName: String) {
        self.teamId = teamId
        self.closerId = closerId
        self.userName = userName
    }

    func loadRoom() async {
        guard !teamId.isEmpty else {
            error = "Team ID not set"
            isLoading = false
            return
        }

        isLoading = true
        error = nil

        do {
            let response = try await convexService.getOrCreateRolePlayRoom(teamId: teamId)
            roomUrl = response.roomUrl
            isLoading = false

            // Start polling for participants
            startParticipantPolling()
        } catch {
            self.error = "Failed to load room: \(error.localizedDescription)"
            isLoading = false
        }
    }

    func joinRoom() async {
        guard !hasJoined else { return }

        do {
            try await convexService.joinRolePlayRoom(teamId: teamId, closerId: closerId, userName: userName)
            hasJoined = true
            sessionStartTime = Date()
            startSessionTimer()
            print("[RolePlayRoom] Joined room")
        } catch {
            print("[RolePlayRoom] Failed to join room: \(error)")
        }
    }

    func leaveRoom() async {
        guard hasJoined else { return }

        do {
            try await convexService.leaveRolePlayRoom(teamId: teamId, closerId: closerId)
            hasJoined = false
            stopSessionTimer()
            print("[RolePlayRoom] Left room")
        } catch {
            print("[RolePlayRoom] Failed to leave room: \(error)")
        }
    }

    func cleanup() {
        stopParticipantPolling()
        stopSessionTimer()

        // Leave room if still joined
        if hasJoined {
            Task {
                await leaveRoom()
            }
        }
    }

    private func startParticipantPolling() {
        // Poll every 5 seconds
        participantPollingTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.fetchParticipants()
            }
        }

        // Also fetch immediately
        Task {
            await fetchParticipants()
        }
    }

    private func stopParticipantPolling() {
        participantPollingTimer?.invalidate()
        participantPollingTimer = nil
    }

    private func fetchParticipants() async {
        do {
            participants = try await convexService.getRolePlayRoomParticipants(teamId: teamId)
        } catch {
            print("[RolePlayRoom] Failed to fetch participants: \(error)")
        }
    }

    private func startSessionTimer() {
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let startTime = self.sessionStartTime else { return }
                self.sessionDuration = Date().timeIntervalSince(startTime)
            }
        }
    }

    private func stopSessionTimer() {
        sessionTimer?.invalidate()
        sessionTimer = nil
        sessionDuration = 0
        sessionStartTime = nil
    }

    var formattedDuration: String {
        let hours = Int(sessionDuration) / 3600
        let minutes = Int(sessionDuration) / 60 % 60
        let seconds = Int(sessionDuration) % 60

        if hours > 0 {
            return String(format: "%dh %dm", hours, minutes)
        } else if minutes > 0 {
            return String(format: "%dm %ds", minutes, seconds)
        } else {
            return String(format: "%ds", seconds)
        }
    }
}

// MARK: - Role Play Room View

struct RolePlayRoomView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = RolePlayRoomViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            Divider()

            // Main content
            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(error)
            } else if let roomUrl = viewModel.roomUrl {
                DailyWebView(
                    roomUrl: roomUrl,
                    userName: appState.closerInfo?.name ?? "User",
                    onJoined: {
                        Task {
                            await viewModel.joinRoom()
                        }
                    }
                )
            }

            Divider()

            // Footer
            footerView
        }
        .frame(minWidth: 700, minHeight: 500)
        .preferredColorScheme(.light)
        .task {
            if let closer = appState.closerInfo {
                viewModel.setup(
                    teamId: closer.teamId,
                    closerId: closer.closerId,
                    userName: closer.name
                )
                await viewModel.loadRoom()
            }
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Role Play Room")
                    .font(.headline)

                if viewModel.sessionStartTime != nil {
                    Text("You've been here for \(viewModel.formattedDuration)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Participant count
            HStack(spacing: 4) {
                Image(systemName: "person.2.fill")
                    .foregroundColor(.green)
                Text("\(viewModel.participants.count)")
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(white: 0.95))
            .cornerRadius(6)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var footerView: some View {
        HStack {
            // Participants list (scrollable horizontal)
            if !viewModel.participants.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.participants) { participant in
                            Text(participant.userName)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color(white: 0.9))
                                .cornerRadius(4)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("No one else here yet")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }

            // Leave button
            Button(action: {
                Task {
                    await viewModel.leaveRoom()
                }
                dismiss()
            }) {
                Text("Leave Room")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.red)
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var loadingView: some View {
        VStack {
            ProgressView()
                .scaleEffect(1.5)
            Text("Setting up role play room...")
                .foregroundColor(.secondary)
                .padding(.top, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.orange)

            Text(message)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Try Again") {
                Task {
                    await viewModel.loadRoom()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Daily.co WebView

struct DailyWebView: NSViewRepresentable {
    let roomUrl: String
    let userName: String
    var onJoined: (() -> Void)?

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Allow media playback without user gesture
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // Create web view
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator  // For camera/mic permissions

        // Construct URL with user name
        let encodedName = userName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userName
        if let url = URL(string: "\(roomUrl)?userName=\(encodedName)") {
            print("[DailyWebView] Loading: \(url)")
            webView.load(URLRequest(url: url))
        }

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        // No updates needed
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onJoined: onJoined)
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var onJoined: (() -> Void)?
        private var hasCalledJoined = false

        init(onJoined: (() -> Void)?) {
            self.onJoined = onJoined
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            print("[DailyWebView] Page loaded")

            // Call onJoined when Daily.co page loads
            // Note: In a more sophisticated implementation, you'd use JavaScript bridge
            // to detect when the user actually joins the call
            if !hasCalledJoined {
                hasCalledJoined = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                    self?.onJoined?()
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            print("[DailyWebView] Failed to load: \(error)")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            print("[DailyWebView] Provisional navigation failed: \(error)")
        }

        // MARK: - WKUIDelegate - Auto-grant camera/mic permissions for Daily.co
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            print("[DailyWebView] Media permission requested: \(type) from \(origin.host)")
            // Auto-grant camera and microphone permissions for Daily.co
            decisionHandler(.grant)
        }
    }
}

// MARK: - Preview

#Preview {
    RolePlayRoomView()
}
