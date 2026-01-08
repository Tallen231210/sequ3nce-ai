//
//  StarscreamWebSocketService.swift
//  Sequ3nce
//
//  WebSocket client using Starscream library for RFC 6455 compliance
//  Fixes the RSV1 bit bug in Apple's URLSessionWebSocketTask
//

import Foundation
import Starscream

/// WebSocket service using Starscream (RFC 6455 compliant)
@MainActor
class StarscreamWebSocketService: ObservableObject, WebSocketDelegate {
    // MARK: - Published Properties
    @Published var state: WebSocketState = .disconnected
    @Published var convexCallId: String?

    // MARK: - Private Properties
    private var socket: WebSocket?
    private var pendingMetadata: String?
    private var pingTimer: Timer?

    // MARK: - Callbacks
    var onStateChange: ((WebSocketState) -> Void)?
    var onError: ((String) -> Void)?

    // MARK: - Public Methods

    /// Connect to the WebSocket server and start a new call
    func connect(callId: String, teamId: String, closerId: String) async throws {
        guard state == .disconnected else {
            print("[StarscreamWS] Already connected or connecting")
            return
        }

        state = .connecting
        print("[StarscreamWS] Connecting...")

        // Build the metadata JSON to send after connection
        pendingMetadata = """
        {"callId":"\(callId)","teamId":"\(teamId)","closerId":"\(closerId)","sampleRate":48000}
        """

        // Create WebSocket request
        var request = URLRequest(url: URL(string: "wss://amusing-charm-production.up.railway.app")!)
        request.timeoutInterval = 30

        // Create socket with default engine (no compression)
        socket = WebSocket(request: request)
        socket?.delegate = self

        // Connect
        socket?.connect()

        // Wait for connection with timeout
        try await waitForConnection()
    }

    // Debug counter for audio sends
    private var audioSendCount = 0

    /// Send audio data (only after receiving "ready" from server)
    func sendAudioData(_ data: Data) {
        guard state == .ready else {
            if audioSendCount == 0 {
                print("[StarscreamWS] sendAudioData called but state is \(state) (not ready)")
            }
            return
        }

        audioSendCount += 1
        if audioSendCount % 50 == 1 {
            print("[StarscreamWS] Sending audio: \(data.count) bytes (send #\(audioSendCount))")
        }

        socket?.write(data: data)
    }

    /// End the call
    func endCall() async {
        guard state == .connected || state == .ready else { return }

        // Send end message
        socket?.write(string: "{\"type\":\"end\"}")
        print("[StarscreamWS] Sent end message")

        // Small delay to ensure message is sent
        try? await Task.sleep(nanoseconds: 100_000_000)

        disconnect()
    }

    /// Disconnect
    func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil

        socket?.disconnect()
        socket = nil

        state = .disconnected
        convexCallId = nil
        pendingMetadata = nil

        print("[StarscreamWS] Disconnected")
    }

    // MARK: - Private Methods

    private func waitForConnection() async throws {
        // Wait up to 10 seconds for server to send "ready" response
        for _ in 0..<100 {
            if state == .ready {
                return  // Only return once we receive "ready" from server
            }
            if case .error(let msg) = state {
                throw NSError(domain: "StarscreamWS", code: -1, userInfo: [NSLocalizedDescriptionKey: msg])
            }
            try await Task.sleep(nanoseconds: 100_000_000) // 100ms
        }

        throw NSError(domain: "StarscreamWS", code: -1, userInfo: [NSLocalizedDescriptionKey: "Connection timeout - server did not send ready"])
    }

    private func startPingTimer() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.socket?.write(ping: Data())
            }
        }
    }

    // MARK: - WebSocketDelegate

    nonisolated func didReceive(event: WebSocketEvent, client: any WebSocketClient) {
        Task { @MainActor in
            handleEvent(event)
        }
    }

    private func handleEvent(_ event: WebSocketEvent) {
        switch event {
        case .connected(let headers):
            print("[StarscreamWS] Connected! Headers: \(headers)")
            state = .connected

            // Send metadata immediately after connection
            if let metadata = pendingMetadata {
                print("[StarscreamWS] Sending metadata: \(metadata)")
                socket?.write(string: metadata)
                pendingMetadata = nil
            }

            startPingTimer()

        case .disconnected(let reason, let code):
            print("[StarscreamWS] Disconnected: \(reason), code: \(code)")
            state = .disconnected
            pingTimer?.invalidate()

        case .text(let text):
            print("[StarscreamWS] Received text: \(text)")
            handleTextMessage(text)

        case .binary(let data):
            print("[StarscreamWS] Received binary: \(data.count) bytes")

        case .ping(_):
            // Starscream handles pong automatically
            break

        case .pong(_):
            break

        case .viabilityChanged(let isViable):
            print("[StarscreamWS] Viability changed: \(isViable)")

        case .reconnectSuggested(let shouldReconnect):
            print("[StarscreamWS] Reconnect suggested: \(shouldReconnect)")

        case .cancelled:
            print("[StarscreamWS] Cancelled")
            state = .disconnected

        case .error(let error):
            let errorMsg = error?.localizedDescription ?? "Unknown error"
            print("[StarscreamWS] Error: \(errorMsg)")
            state = .error(errorMsg)
            onError?(errorMsg)

        case .peerClosed:
            print("[StarscreamWS] Peer closed connection")
            state = .disconnected
        }
    }

    private func handleTextMessage(_ text: String) {
        if let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {

            if let status = json["status"] as? String, status == "ready" {
                state = .ready
                convexCallId = json["convexCallId"] as? String
                print("[StarscreamWS] Server ready, convexCallId: \(convexCallId ?? "none")")
            } else if let error = json["error"] as? String {
                state = .error(error)
                onError?(error)
                print("[StarscreamWS] Server error: \(error)")
            }
        }
    }
}
