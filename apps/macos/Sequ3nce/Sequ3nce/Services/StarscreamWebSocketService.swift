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

    // MARK: - Reconnection Properties
    private var connectionParams: (callId: String, teamId: String, closerId: String)?
    private var lastHeartbeatAckReceived: Date = Date()
    private var missedHeartbeatCount: Int = 0  // Track consecutive missed heartbeats
    private var reconnectAttempt: Int = 0
    private var isReconnecting: Bool = false
    private var maxReconnectAttempts: Int = 10
    private var heartbeatInterval: TimeInterval = 15  // Send heartbeat every 15 seconds
    private var maxMissedHeartbeats: Int = 2  // Reconnect after 2 missed heartbeats (30+ seconds)

    // MARK: - Diagnostic Properties
    /// History of reconnection attempts this session (for diagnostics)
    private(set) var reconnectionHistory: [ReconnectionEvent] = []
    /// Total reconnection count this session
    private var totalReconnectionCount: Int = 0

    // MARK: - Callbacks
    var onStateChange: ((WebSocketState) -> Void)?
    var onError: ((String) -> Void)?
    var onReconnecting: ((Int) -> Void)?  // Called with attempt number
    var onReconnected: (() -> Void)?  // Called when successfully reconnected

    // MARK: - Diagnostic Accessors (for DiagnosticsService)
    var diagnosticReconnectionCount: Int { totalReconnectionCount }
    var diagnosticMissedHeartbeatCount: Int { missedHeartbeatCount }
    var timeSinceLastHeartbeatAck: Double {
        Date().timeIntervalSince(lastHeartbeatAckReceived)
    }

    // MARK: - Public Methods

    /// Connect to the WebSocket server and start a new call
    func connect(callId: String, teamId: String, closerId: String) async throws {
        guard state == .disconnected || isReconnecting else {
            print("[StarscreamWS] Already connected or connecting")
            return
        }

        // Store connection params for potential reconnection
        connectionParams = (callId: callId, teamId: teamId, closerId: closerId)

        if !isReconnecting {
            state = .connecting
        }
        print("[StarscreamWS] Connecting\(isReconnecting ? " (reconnect)" : "")...")

        // Build the metadata JSON to send after connection
        // Include convexCallId if reconnecting to resume existing call
        if isReconnecting, let existingConvexCallId = convexCallId {
            pendingMetadata = """
            {"callId":"\(callId)","teamId":"\(teamId)","closerId":"\(closerId)","sampleRate":48000,"convexCallId":"\(existingConvexCallId)","isReconnect":true}
            """
            print("[StarscreamWS] Reconnecting with existing convexCallId: \(existingConvexCallId)")
        } else {
            pendingMetadata = """
            {"callId":"\(callId)","teamId":"\(teamId)","closerId":"\(closerId)","sampleRate":48000}
            """
        }

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

        // Reset reconnection state on successful connection
        if isReconnecting {
            print("[StarscreamWS] Reconnected successfully after \(reconnectAttempt) attempts")

            // Log to diagnostic buffer
            DiagnosticLogger.shared.info(
                "WebSocket reconnected successfully",
                category: .websocket,
                metadata: ["attempts": "\(reconnectAttempt)"]
            )

            isReconnecting = false
            reconnectAttempt = 0
            onReconnected?()
        }
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

    /// Disconnect (clean disconnect, clears reconnection state)
    func disconnect() {
        // Stop all timers
        pingTimer?.invalidate()
        pingTimer = nil

        // Clear reconnection state
        isReconnecting = false
        reconnectAttempt = 0
        connectionParams = nil

        // Reset diagnostic counters (keep history for diagnostics after call ends)
        totalReconnectionCount = 0

        socket?.disconnect()
        socket = nil

        state = .disconnected
        convexCallId = nil
        pendingMetadata = nil

        print("[StarscreamWS] Disconnected (clean)")
    }

    /// Force disconnect without clearing connection params (for reconnection attempts)
    private func disconnectForReconnect() {
        pingTimer?.invalidate()
        pingTimer = nil

        socket?.disconnect()
        socket = nil

        // Don't clear connectionParams - we need them to reconnect
        // Don't clear convexCallId - we'll reuse it
        pendingMetadata = nil

        print("[StarscreamWS] Disconnected for reconnect")
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

    private func startHeartbeatTimer() {
        pingTimer?.invalidate()
        lastHeartbeatAckReceived = Date()  // Reset on start
        missedHeartbeatCount = 0

        pingTimer = Timer.scheduledTimer(withTimeInterval: heartbeatInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.checkConnectionHealth()
            }
        }
    }

    /// Check connection health and send heartbeat
    /// Uses application-level JSON heartbeats instead of WebSocket protocol pings
    /// (some networks/firewalls strip protocol-level ping/pong frames)
    private func checkConnectionHealth() {
        guard state == .connected || state == .ready else { return }

        // Check if we received an ack since last heartbeat
        let timeSinceLastAck = Date().timeIntervalSince(lastHeartbeatAckReceived)

        // If no ack received since our last heartbeat, increment missed count
        if timeSinceLastAck > heartbeatInterval {
            missedHeartbeatCount += 1
            print("[StarscreamWS] Heartbeat check: missed=\(missedHeartbeatCount), timeSinceAck=\(Int(timeSinceLastAck))s")

            if missedHeartbeatCount >= maxMissedHeartbeats {
                print("[StarscreamWS] Connection stale - \(missedHeartbeatCount) missed heartbeats, triggering reconnect")
                handleConnectionStale()
                return
            }
        }

        // Send JSON heartbeat (more reliable than protocol ping)
        socket?.write(string: "{\"type\":\"heartbeat\"}")
    }

    /// Handle stale/dead connection
    private func handleConnectionStale() {
        guard !isReconnecting else {
            print("[StarscreamWS] Already reconnecting, skipping")
            return
        }

        disconnectForReconnect()
        attemptReconnect()
    }

    /// Determine the reason for reconnection based on current state
    private func determineReconnectionReason() -> String {
        if missedHeartbeatCount >= maxMissedHeartbeats {
            return "missed_heartbeats_\(missedHeartbeatCount)"
        }
        // Check time since last heartbeat ack
        let timeSinceAck = Date().timeIntervalSince(lastHeartbeatAckReceived)
        if timeSinceAck > heartbeatInterval * 2 {
            return "stale_connection_\(Int(timeSinceAck))s"
        }
        return "connection_lost"
    }

    /// Attempt to reconnect with exponential backoff
    private func attemptReconnect() {
        guard let params = connectionParams else {
            print("[StarscreamWS] No connection params stored, cannot reconnect")
            state = .disconnected
            return
        }

        guard reconnectAttempt < maxReconnectAttempts else {
            print("[StarscreamWS] Max reconnect attempts (\(maxReconnectAttempts)) reached, giving up")
            state = .error("Connection lost - max reconnect attempts reached")
            isReconnecting = false
            reconnectAttempt = 0
            connectionParams = nil
            onError?("Connection lost after \(maxReconnectAttempts) reconnect attempts")
            return
        }

        reconnectAttempt += 1
        totalReconnectionCount += 1
        isReconnecting = true

        // Track reconnection in history
        let reason = determineReconnectionReason()
        let event = ReconnectionEvent(timestamp: Date(), reason: reason)
        reconnectionHistory.append(event)
        // Keep only last 10 entries
        if reconnectionHistory.count > 10 {
            reconnectionHistory.removeFirst(reconnectionHistory.count - 10)
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        let delay = min(pow(2.0, Double(reconnectAttempt - 1)), 30.0)
        print("[StarscreamWS] Reconnect attempt \(reconnectAttempt)/\(maxReconnectAttempts) in \(delay)s (reason: \(reason))")

        // Log to diagnostic buffer
        DiagnosticLogger.shared.warning(
            "WebSocket reconnecting (attempt \(reconnectAttempt))",
            category: .websocket,
            metadata: ["reason": reason, "delay": "\(delay)s"]
        )

        state = .reconnecting(attempt: reconnectAttempt)
        onReconnecting?(reconnectAttempt)

        Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            // Check if we should still reconnect (user might have manually disconnected)
            guard self.isReconnecting else {
                print("[StarscreamWS] Reconnection cancelled")
                return
            }

            do {
                try await self.connect(callId: params.callId, teamId: params.teamId, closerId: params.closerId)
            } catch {
                print("[StarscreamWS] Reconnect attempt \(self.reconnectAttempt) failed: \(error)")
                // Will try again on next attempt
                self.attemptReconnect()
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

            // Log to diagnostic buffer
            DiagnosticLogger.shared.info(
                "WebSocket connected",
                category: .websocket,
                metadata: ["isReconnect": "\(isReconnecting)"]
            )

            // Send metadata immediately after connection
            if let metadata = pendingMetadata {
                print("[StarscreamWS] Sending metadata: \(metadata)")
                socket?.write(string: metadata)
                pendingMetadata = nil
            }

            startHeartbeatTimer()

        case .disconnected(let reason, let code):
            print("[StarscreamWS] Disconnected: \(reason), code: \(code)")
            pingTimer?.invalidate()

            // Log to diagnostic buffer
            DiagnosticLogger.shared.warning(
                "WebSocket disconnected",
                category: .websocket,
                metadata: ["reason": reason, "code": "\(code)"]
            )

            // If we have connection params and weren't cleanly disconnected, attempt reconnect
            if connectionParams != nil && !isReconnecting {
                print("[StarscreamWS] Unexpected disconnect, attempting reconnect")
                handleConnectionStale()
            } else if !isReconnecting {
                state = .disconnected
            }

        case .text(let text):
            print("[StarscreamWS] Received text: \(text)")
            handleTextMessage(text)

        case .binary(let data):
            print("[StarscreamWS] Received binary: \(data.count) bytes")

        case .ping(_):
            // Starscream handles pong automatically
            break

        case .pong(_):
            // Protocol-level pong - also counts as connection healthy (backup)
            lastHeartbeatAckReceived = Date()
            missedHeartbeatCount = 0
            break

        case .viabilityChanged(let isViable):
            print("[StarscreamWS] Viability changed: \(isViable)")
            if !isViable && (state == .connected || state == .ready) {
                print("[StarscreamWS] Connection no longer viable, triggering reconnect")
                handleConnectionStale()
            }

        case .reconnectSuggested(let shouldReconnect):
            print("[StarscreamWS] Reconnect suggested: \(shouldReconnect)")
            if shouldReconnect && (state == .connected || state == .ready) {
                print("[StarscreamWS] Acting on reconnect suggestion")
                handleConnectionStale()
            }

        case .cancelled:
            print("[StarscreamWS] Cancelled")
            // Only set disconnected if not reconnecting
            if !isReconnecting {
                state = .disconnected
            }

        case .error(let error):
            let errorMsg = error?.localizedDescription ?? "Unknown error"
            print("[StarscreamWS] Error: \(errorMsg)")

            // Log to diagnostic buffer
            DiagnosticLogger.shared.error(
                "WebSocket error: \(errorMsg)",
                category: .websocket
            )

            // If we have connection params, attempt reconnect instead of erroring out
            if connectionParams != nil && !isReconnecting {
                print("[StarscreamWS] Error occurred, attempting reconnect")
                handleConnectionStale()
            } else if !isReconnecting {
                state = .error(errorMsg)
                onError?(errorMsg)
            }

        case .peerClosed:
            print("[StarscreamWS] Peer closed connection")
            // If we have connection params, attempt reconnect
            if connectionParams != nil && !isReconnecting {
                print("[StarscreamWS] Peer closed, attempting reconnect")
                handleConnectionStale()
            } else if !isReconnecting {
                state = .disconnected
            }
        }
    }

    private func handleTextMessage(_ text: String) {
        if let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {

            if let status = json["status"] as? String, status == "ready" {
                state = .ready
                let serverConvexCallId = json["convexCallId"] as? String
                let serverIsReconnect = json["isReconnect"] as? Bool ?? false

                if serverIsReconnect {
                    // Reconnection - verify server used same convexCallId
                    print("[StarscreamWS] Server confirmed reconnection, convexCallId: \(serverConvexCallId ?? "none") (existing: \(convexCallId ?? "none"))")
                } else {
                    // New connection - use server's convexCallId
                    convexCallId = serverConvexCallId
                    print("[StarscreamWS] Server ready, convexCallId: \(convexCallId ?? "none")")
                }
            } else if let error = json["error"] as? String {
                state = .error(error)
                onError?(error)
                print("[StarscreamWS] Server error: \(error)")
            } else if let messageType = json["type"] as? String {
                switch messageType {
                case "heartbeat_ack":
                    // Server acknowledged our heartbeat - connection is healthy
                    lastHeartbeatAckReceived = Date()
                    missedHeartbeatCount = 0
                case "silence_warning":
                    // Server detected no speech for 30+ seconds
                    // This could indicate audio capture issues - trigger reconnection
                    let silenceDuration = json["silenceDuration"] as? Int ?? 0
                    print("[StarscreamWS] Silence warning received: \(silenceDuration)s of silence")

                    // If silence is prolonged (60+ seconds), consider connection stale
                    if silenceDuration >= 60 && !isReconnecting {
                        print("[StarscreamWS] Prolonged silence (\(silenceDuration)s) - triggering reconnect")
                        handleConnectionStale()
                    }
                case "ammo_analysis":
                    // Ammo V2 analysis - handled elsewhere if needed
                    break
                default:
                    break
                }
            }
        }
    }
}
