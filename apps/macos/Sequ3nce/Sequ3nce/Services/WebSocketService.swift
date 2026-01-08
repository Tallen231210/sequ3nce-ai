//
//  WebSocketService.swift
//  Sequ3nce
//
//  WebSocket client for streaming audio to the backend
//  Connects to wss://amusing-charm-production.up.railway.app
//

import Foundation
import Combine

/// WebSocket connection state
enum WebSocketState: Equatable {
    case disconnected
    case connecting
    case connected
    case ready  // After receiving ready response from server
    case error(String)
}

/// Metadata sent when starting a call (matches Electron app format)
struct CallMetadata: Codable {
    let callId: String
    let teamId: String
    let closerId: String
    let sampleRate: Int
    let prospectName: String?
}

/// Response from server after initial connection
struct ServerResponse: Codable {
    let status: String
    let convexCallId: String?
    let error: String?
}

/// Message to end the call
struct EndCallMessage: Codable {
    let type: String
}

/// WebSocket service for audio streaming
@MainActor
class WebSocketService: ObservableObject {
    // MARK: - Published Properties
    @Published var state: WebSocketState = .disconnected
    @Published var convexCallId: String?

    // MARK: - Configuration
    private let serverURL = URL(string: "wss://amusing-charm-production.up.railway.app")!

    // MARK: - Private Properties
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var pingTimer: Timer?
    private var currentCallMetadata: CallMetadata?
    private var delegateHandler: WebSocketDelegateHandler?
    private var connectionContinuation: CheckedContinuation<Void, Error>?

    // MARK: - Callbacks
    var onStateChange: ((WebSocketState) -> Void)?
    var onError: ((String) -> Void)?

    // MARK: - Initialization
    init() {
        setupSession()
    }

    // Called by delegate when connection opens
    func handleConnectionOpened() {
        connectionContinuation?.resume()
        connectionContinuation = nil
    }

    // Called by delegate when connection fails
    func handleConnectionFailed(_ error: Error) {
        connectionContinuation?.resume(throwing: error)
        connectionContinuation = nil
    }

    // MARK: - Public Methods

    /// Connect to the WebSocket server and start a new call
    func connect(callId: String, teamId: String, closerId: String) async throws {
        guard state == .disconnected || state == .error("") else {
            print("[WebSocketService] Already connected or connecting")
            return
        }

        state = .connecting
        print("[WebSocketService] Connecting to \(serverURL)")

        // Create WebSocket task
        webSocket = session?.webSocketTask(with: serverURL)
        webSocket?.resume()

        // Small delay to ensure connection is established
        // URLSessionWebSocketTask doesn't have a proper "connected" callback when using shared session
        print("[WebSocketService] Waiting for connection...")
        try await Task.sleep(nanoseconds: 500_000_000)  // 0.5 second

        // Send initial metadata (matches Electron app format)
        let metadata = CallMetadata(
            callId: callId,
            teamId: teamId,
            closerId: closerId,
            sampleRate: Int(AudioFormat.sampleRate),
            prospectName: nil
        )

        currentCallMetadata = metadata
        try await sendMetadata(metadata)

        // Start receiving messages AFTER sending metadata
        receiveMessages()

        // Start ping timer to keep connection alive
        startPingTimer()

        state = .connected
        print("[WebSocketService] Connected, waiting for ready signal")
    }

    /// Send audio data to the server
    func sendAudioData(_ data: Data) {
        guard state == .ready || state == .connected else {
            return
        }

        let message = URLSessionWebSocketTask.Message.data(data)
        webSocket?.send(message) { error in
            if let error = error {
                print("[WebSocketService] Error sending audio: \(error)")
            }
        }
    }

    /// End the current call
    func endCall() async {
        guard state == .connected || state == .ready else {
            return
        }

        // Send end message
        let endMessage = EndCallMessage(type: "end")
        if let data = try? JSONEncoder().encode(endMessage) {
            let message = URLSessionWebSocketTask.Message.data(data)
            do {
                try await webSocket?.send(message)
                print("[WebSocketService] Sent end message")
            } catch {
                print("[WebSocketService] Error sending end message: \(error)")
            }
        }

        disconnect()
    }

    /// Disconnect from the server
    func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil

        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil

        state = .disconnected
        convexCallId = nil
        currentCallMetadata = nil

        print("[WebSocketService] Disconnected")
    }

    // MARK: - Private Methods

    private func setupSession() {
        // Use shared session for simplicity
        session = URLSession.shared
    }

    private func sendMetadata(_ metadata: CallMetadata) async throws {
        // Manually construct JSON to avoid any encoder quirks
        var jsonString = "{"
        jsonString += "\"callId\":\"\(metadata.callId)\","
        jsonString += "\"teamId\":\"\(metadata.teamId)\","
        jsonString += "\"closerId\":\"\(metadata.closerId)\","
        jsonString += "\"sampleRate\":\(metadata.sampleRate)"
        if let prospectName = metadata.prospectName {
            jsonString += ",\"prospectName\":\"\(prospectName)\""
        }
        jsonString += "}"

        print("[WebSocketService] Sending metadata as TEXT frame: \(jsonString)")

        // Send as TEXT frame (opcode 0x1) - this is what Electron does
        let message = URLSessionWebSocketTask.Message.string(jsonString)

        try await webSocket?.send(message)
        print("[WebSocketService] Sent metadata successfully as TEXT frame")
    }

    private func receiveMessages() {
        webSocket?.receive { [weak self] result in
            Task { @MainActor in
                switch result {
                case .success(let message):
                    self?.handleMessage(message)
                    // Continue receiving
                    self?.receiveMessages()

                case .failure(let error):
                    print("[WebSocketService] Receive error: \(error)")
                    self?.state = .error(error.localizedDescription)
                    self?.onError?(error.localizedDescription)
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .data(let data):
            parseServerResponse(data)
        case .string(let text):
            if let data = text.data(using: .utf8) {
                parseServerResponse(data)
            }
        @unknown default:
            print("[WebSocketService] Unknown message type")
        }
    }

    private func parseServerResponse(_ data: Data) {
        do {
            let response = try JSONDecoder().decode(ServerResponse.self, from: data)

            if response.status == "ready" {
                state = .ready
                convexCallId = response.convexCallId
                print("[WebSocketService] Server ready, convexCallId: \(response.convexCallId ?? "none")")
            } else if let error = response.error {
                state = .error(error)
                onError?(error)
                print("[WebSocketService] Server error: \(error)")
            }
        } catch {
            // Try to parse as plain text
            if let text = String(data: data, encoding: .utf8) {
                print("[WebSocketService] Received text: \(text)")
            }
        }
    }

    private func startPingTimer() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.sendPing()
            }
        }
    }

    private func sendPing() {
        webSocket?.sendPing { error in
            if let error = error {
                print("[WebSocketService] Ping error: \(error)")
            }
        }
    }
}

// MARK: - WebSocket Delegate Handler
// Using a separate non-isolated class to handle delegate callbacks
private class WebSocketDelegateHandler: NSObject, URLSessionWebSocketDelegate {
    weak var service: WebSocketService?

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        print("[WebSocketService] WebSocket opened with protocol: \(`protocol` ?? "none")")

        // Notify service that connection is open
        Task { @MainActor [weak service] in
            service?.handleConnectionOpened()
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "unknown"
        print("[WebSocketService] WebSocket closed: \(closeCode), reason: \(reasonStr)")

        Task { @MainActor [weak service] in
            service?.state = .disconnected
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error = error {
            print("[WebSocketService] Connection failed: \(error)")
            Task { @MainActor [weak service] in
                service?.handleConnectionFailed(error)
            }
        }
    }
}
