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
    @Published var isLoading = false
    @Published var error: String?
    @Published var participants: [RolePlayRoomParticipant] = []
    @Published var sessionStartTime: Date?
    @Published var sessionDuration: TimeInterval = 0
    @Published var isInRoom = false

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

    func enterRoom() async {
        guard !teamId.isEmpty else {
            error = "Team ID not set"
            return
        }

        isLoading = true
        error = nil

        do {
            let response = try await convexService.getOrCreateRolePlayRoom(teamId: teamId)
            roomUrl = response.roomUrl
            isInRoom = true
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
        if hasJoined {
            do {
                try await convexService.leaveRolePlayRoom(teamId: teamId, closerId: closerId)
                print("[RolePlayRoom] Left room")
            } catch {
                print("[RolePlayRoom] Failed to leave room: \(error)")
            }
        }

        hasJoined = false
        isInRoom = false
        roomUrl = nil
        stopParticipantPolling()
        stopSessionTimer()
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

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isInRoom {
                // In-room view
                headerView

                Divider()

                if let roomUrl = viewModel.roomUrl {
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

                footerView
            } else {
                // Lobby view
                lobbyView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            if let closer = appState.closerInfo {
                viewModel.setup(
                    teamId: closer.teamId,
                    closerId: closer.closerId,
                    userName: closer.name
                )
            }
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    // MARK: - Lobby View

    private var lobbyView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.2.fill")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.7))

            VStack(spacing: 8) {
                Text("Role Play Room")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                Text("Practice your pitch with teammates in a live video room")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 60)
            }

            Button(action: {
                Task {
                    await viewModel.enterRoom()
                }
            }) {
                HStack(spacing: 8) {
                    if viewModel.isLoading {
                        ProgressView()
                            .scaleEffect(0.7)
                            .frame(width: 16, height: 16)
                    } else {
                        Image(systemName: "video.fill")
                    }
                    Text(viewModel.isLoading ? "Connecting..." : "Enter Role Play Room")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(viewModel.isLoading ? Color.gray : Color.black)
                )
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isLoading)

            if let error = viewModel.error {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                    .padding(.horizontal, 40)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Header

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Role Play Room")
                    .font(.system(size: 16, weight: .semibold))

                if viewModel.sessionStartTime != nil {
                    Text("You've been here for \(viewModel.formattedDuration)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                }
            }

            Spacer()

            // Participant count
            HStack(spacing: 4) {
                Image(systemName: "person.2.fill")
                    .foregroundColor(Color(red: 0.2, green: 0.7, blue: 0.4))
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

    // MARK: - Footer

    private var footerView: some View {
        HStack {
            // Participants list
            if !viewModel.participants.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.participants) { participant in
                            Text(participant.userName)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color(white: 0.95))
                                .cornerRadius(6)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("No one else here yet")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
                Spacer()
            }

            // Leave button
            Button(action: {
                Task {
                    await viewModel.leaveRoom()
                }
            }) {
                Text("Leave Room")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.red)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
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
            decisionHandler(.grant)
        }
    }
}

// MARK: - Preview

#Preview {
    RolePlayRoomView()
}
