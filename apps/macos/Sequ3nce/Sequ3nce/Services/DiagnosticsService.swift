//
//  DiagnosticsService.swift
//  Sequ3nce
//
//  Collects and sends diagnostic information for debugging user issues
//  Collects system info, audio state, WebSocket state, and recent logs
//

import Foundation
import AVFoundation
import CoreAudio

// MARK: - Diagnostic Data Structures

struct SystemDiagnostics: Codable {
    let macOSVersion: String
    let macOSBuild: String
    let hardwareModel: String
    let chipType: String
    let ramTotal: UInt64
    let ramAvailable: UInt64
    let appVersion: String
    let appBuild: String
}

struct AudioDiagnostics: Codable {
    let defaultInputDeviceName: String?
    let defaultInputDeviceUID: String?
    let systemAudioCaptureStatus: String
    let micLevel: Float
    let systemLevel: Float
    let silenceDetectionActive: Bool
    let lastMicCallbackSecondsAgo: Double
    let totalChunksSent: Int
    let isCapturing: Bool
}

struct WebSocketDiagnostics: Codable {
    let connectionState: String
    let reconnectionCountThisSession: Int
    let lastHeartbeatAckSecondsAgo: Double
    let missedHeartbeatCount: Int
    let reconnectionHistory: [ReconnectionEvent]
}

struct ReconnectionEvent: Codable {
    let timestamp: Date
    let reason: String
}

struct CallDiagnostics: Codable {
    let currentCallId: String?
    let convexCallId: String?
    let closerId: String?
    let teamId: String?
    let recordingState: String
    let recordingDuration: TimeInterval
    let timeSinceRecordingStarted: TimeInterval?
}

struct MeetingBotDiagnostics: Codable {
    let meetingBotEnabled: Bool
    let botCallActive: Bool
    let activeBotCallId: String?
    let activeBotId: String?
    let activeBotMeetingTitle: String?
    let activeBotProspectName: String?
    let pendingQuestionnaireCount: Int
    let showingPostCallQuestionnaire: Bool
    let calendarConnected: Bool
    let meetingPlatform: String?
    let appMode: String // "legacy_recording" or "meeting_bot"
    let currentSidebarItem: String?
    let pollBotStatusActive: Bool
    let ammoPanelVisible: Bool
    let questionnairePanelVisible: Bool
    let firstPendingCallId: String?
    let firstPendingProspectName: String?
}

struct PermissionDiagnostics: Codable {
    let microphonePermission: String
    let screenRecordingPermission: String
}

struct LogDiagnostics: Codable {
    let recentLogs: [LogEntryForExport]
    let errorCountLastHour: Int
    let lastErrorMessage: String?
    let lastErrorTimestamp: Date?
}

struct LogEntryForExport: Codable {
    let timestamp: Date
    let level: String
    let category: String
    let message: String
}

struct DiagnosticReport: Codable {
    let reportId: String
    let timestamp: Date
    let closerId: String?
    let teamId: String?
    let closerEmail: String?
    let userDescription: String?

    let system: SystemDiagnostics
    let audio: AudioDiagnostics
    let websocket: WebSocketDiagnostics
    let call: CallDiagnostics
    let meetingBot: MeetingBotDiagnostics?
    let permissions: PermissionDiagnostics
    let logs: LogDiagnostics
}

// MARK: - Diagnostics Service

@MainActor
class DiagnosticsService {
    private let baseURL = "https://ideal-ram-982.convex.site"

    // References to services for collecting diagnostics
    weak var audioService: AudioCaptureService?
    weak var webSocketService: StarscreamWebSocketService?

    // App state info (set from AppState)
    var closerId: String?
    var teamId: String?
    var closerEmail: String?
    var currentCallId: String?
    var convexCallId: String?
    var recordingState: String = "idle"
    var recordingDuration: TimeInterval = 0
    var recordingStartTime: Date?

    // Meeting bot state (set from AppState)
    var meetingBotEnabled: Bool = false
    var botCallActive: Bool = false
    var activeBotCallId: String?
    var activeBotId: String?
    var activeBotMeetingTitle: String?
    var activeBotProspectName: String?
    var pendingQuestionnaireCount: Int = 0
    var showingPostCallQuestionnaire: Bool = false
    var calendarConnected: Bool = false
    var meetingPlatform: String?
    var currentSidebarItem: String?
    var pollBotStatusActive: Bool = false
    var ammoPanelVisible: Bool = false
    var questionnairePanelVisible: Bool = false
    var firstPendingCallId: String?
    var firstPendingProspectName: String?

    // MARK: - Collection Methods

    /// Collect all diagnostics into a report
    func collectDiagnostics(userDescription: String?) -> DiagnosticReport {
        let reportId = generateReportId()

        return DiagnosticReport(
            reportId: reportId,
            timestamp: Date(),
            closerId: closerId,
            teamId: teamId,
            closerEmail: closerEmail,
            userDescription: userDescription,
            system: collectSystemDiagnostics(),
            audio: collectAudioDiagnostics(),
            websocket: collectWebSocketDiagnostics(),
            call: collectCallDiagnostics(),
            meetingBot: collectMeetingBotDiagnostics(),
            permissions: collectPermissionDiagnostics(),
            logs: collectLogDiagnostics()
        )
    }

    private func generateReportId() -> String {
        // Generate a short, memorable report ID
        let chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No I, O, 0, 1 to avoid confusion
        let id = (0..<6).map { _ in String(chars.randomElement()!) }.joined()
        return id
    }

    private func collectSystemDiagnostics() -> SystemDiagnostics {
        let processInfo = ProcessInfo.processInfo
        let osVersion = processInfo.operatingSystemVersion

        // Get build number
        var buildNumber = "unknown"
        var size = 0
        sysctlbyname("kern.osversion", nil, &size, nil, 0)
        var osVersionBuild = [CChar](repeating: 0, count: size)
        sysctlbyname("kern.osversion", &osVersionBuild, &size, nil, 0)
        buildNumber = String(cString: osVersionBuild)

        // Get hardware model
        var hardwareModel = "unknown"
        size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        var model = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.model", &model, &size, nil, 0)
        hardwareModel = String(cString: model)

        // Get chip type (ARM vs Intel)
        var chipType = "unknown"
        #if arch(arm64)
        chipType = "Apple Silicon"
        #else
        chipType = "Intel"
        #endif

        // Get RAM
        let ramTotal = processInfo.physicalMemory
        var ramAvailable: UInt64 = 0
        var vmStats = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
        let hostPort = mach_host_self()
        let result = withUnsafeMutablePointer(to: &vmStats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(hostPort, HOST_VM_INFO64, $0, &count)
            }
        }
        if result == KERN_SUCCESS {
            let pageSize = UInt64(vm_kernel_page_size)
            ramAvailable = UInt64(vmStats.free_count + vmStats.inactive_count) * pageSize
        }

        // Get app version
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        let appBuild = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"

        return SystemDiagnostics(
            macOSVersion: "\(osVersion.majorVersion).\(osVersion.minorVersion).\(osVersion.patchVersion)",
            macOSBuild: buildNumber,
            hardwareModel: hardwareModel,
            chipType: chipType,
            ramTotal: ramTotal,
            ramAvailable: ramAvailable,
            appVersion: appVersion,
            appBuild: appBuild
        )
    }

    private func collectAudioDiagnostics() -> AudioDiagnostics {
        // Get default input device info
        var deviceName: String? = nil
        var deviceUID: String? = nil

        var defaultDevice = AudioDeviceID()
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)

        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &defaultDevice
        )

        if status == noErr && defaultDevice != kAudioDeviceUnknown {
            // Get device name
            propertyAddress.mSelector = kAudioDevicePropertyDeviceNameCFString
            var nameRef: CFString? = nil
            propertySize = UInt32(MemoryLayout<CFString?>.size)
            let nameStatus = withUnsafeMutablePointer(to: &nameRef) { ptr -> OSStatus in
                AudioObjectGetPropertyData(defaultDevice, &propertyAddress, 0, nil, &propertySize, UnsafeMutableRawPointer(ptr))
            }
            if nameStatus == noErr {
                deviceName = nameRef as String?
            }

            // Get device UID
            propertyAddress.mSelector = kAudioDevicePropertyDeviceUID
            var uidRef: CFString? = nil
            let uidStatus = withUnsafeMutablePointer(to: &uidRef) { ptr -> OSStatus in
                AudioObjectGetPropertyData(defaultDevice, &propertyAddress, 0, nil, &propertySize, UnsafeMutableRawPointer(ptr))
            }
            if uidStatus == noErr {
                deviceUID = uidRef as String?
            }
        }

        // Get audio service state
        let micLevel = audioService?.micLevel ?? 0.0
        let systemLevel = audioService?.systemLevel ?? 0.0
        let isCapturing = audioService?.isCapturing ?? false

        // Calculate time since last mic callback (from audio service diagnostic properties)
        // We'll access these through exposed properties
        let lastMicCallbackSecondsAgo = audioService?.timeSinceLastMicCallback ?? -1
        let totalChunksSent = audioService?.diagnosticTotalChunksSent ?? 0
        let silenceDetectionActive = audioService?.diagnosticIsSilenceDetectionActive ?? false

        // Determine system audio capture status
        var systemAudioStatus = "unknown"
        if isCapturing {
            if systemLevel > 0.001 {
                systemAudioStatus = "running_with_audio"
            } else {
                systemAudioStatus = "running_silent"
            }
        } else {
            systemAudioStatus = "stopped"
        }

        return AudioDiagnostics(
            defaultInputDeviceName: deviceName,
            defaultInputDeviceUID: deviceUID,
            systemAudioCaptureStatus: systemAudioStatus,
            micLevel: micLevel,
            systemLevel: systemLevel,
            silenceDetectionActive: silenceDetectionActive,
            lastMicCallbackSecondsAgo: lastMicCallbackSecondsAgo,
            totalChunksSent: totalChunksSent,
            isCapturing: isCapturing
        )
    }

    private func collectWebSocketDiagnostics() -> WebSocketDiagnostics {
        let connectionState = webSocketService?.state.diagnosticDescription ?? "unknown"
        let reconnectionCount = webSocketService?.diagnosticReconnectionCount ?? 0
        let lastHeartbeatAckSecondsAgo = webSocketService?.timeSinceLastHeartbeatAck ?? -1
        let missedHeartbeatCount = webSocketService?.diagnosticMissedHeartbeatCount ?? 0
        let history = webSocketService?.reconnectionHistory ?? []

        return WebSocketDiagnostics(
            connectionState: connectionState,
            reconnectionCountThisSession: reconnectionCount,
            lastHeartbeatAckSecondsAgo: lastHeartbeatAckSecondsAgo,
            missedHeartbeatCount: missedHeartbeatCount,
            reconnectionHistory: history
        )
    }

    private func collectCallDiagnostics() -> CallDiagnostics {
        var timeSinceStarted: TimeInterval? = nil
        if let startTime = recordingStartTime {
            timeSinceStarted = Date().timeIntervalSince(startTime)
        }

        return CallDiagnostics(
            currentCallId: currentCallId,
            convexCallId: convexCallId,
            closerId: closerId,
            teamId: teamId,
            recordingState: recordingState,
            recordingDuration: recordingDuration,
            timeSinceRecordingStarted: timeSinceStarted
        )
    }

    private func collectMeetingBotDiagnostics() -> MeetingBotDiagnostics? {
        // Only include if meeting bot feature is relevant
        guard meetingBotEnabled else { return nil }

        return MeetingBotDiagnostics(
            meetingBotEnabled: meetingBotEnabled,
            botCallActive: botCallActive,
            activeBotCallId: activeBotCallId,
            activeBotId: activeBotId,
            activeBotMeetingTitle: activeBotMeetingTitle,
            activeBotProspectName: activeBotProspectName,
            pendingQuestionnaireCount: pendingQuestionnaireCount,
            showingPostCallQuestionnaire: showingPostCallQuestionnaire,
            calendarConnected: calendarConnected,
            meetingPlatform: meetingPlatform,
            appMode: meetingBotEnabled ? "meeting_bot" : "legacy_recording",
            currentSidebarItem: currentSidebarItem,
            pollBotStatusActive: pollBotStatusActive,
            ammoPanelVisible: ammoPanelVisible,
            questionnairePanelVisible: questionnairePanelVisible,
            firstPendingCallId: firstPendingCallId,
            firstPendingProspectName: firstPendingProspectName
        )
    }

    private func collectPermissionDiagnostics() -> PermissionDiagnostics {
        // Microphone permission
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        let micPermission: String
        switch micStatus {
        case .authorized: micPermission = "authorized"
        case .denied: micPermission = "denied"
        case .restricted: micPermission = "restricted"
        case .notDetermined: micPermission = "not_determined"
        @unknown default: micPermission = "unknown"
        }

        // Screen recording permission (check if we can capture screen)
        // This is a heuristic - macOS doesn't provide a direct API
        let screenPermission = "requires_manual_check"

        return PermissionDiagnostics(
            microphonePermission: micPermission,
            screenRecordingPermission: screenPermission
        )
    }

    private func collectLogDiagnostics() -> LogDiagnostics {
        let recentLogs = DiagnosticLogger.shared.getRecentLogs(count: 100)
        let errorStats = DiagnosticLogger.shared.getErrorStats()

        let logsForExport = recentLogs.map { entry in
            LogEntryForExport(
                timestamp: entry.timestamp,
                level: entry.level.rawValue,
                category: entry.category.rawValue,
                message: entry.message
            )
        }

        return LogDiagnostics(
            recentLogs: logsForExport,
            errorCountLastHour: errorStats.count,
            lastErrorMessage: errorStats.lastMessage,
            lastErrorTimestamp: errorStats.lastTime
        )
    }

    // MARK: - Sending Methods

    /// Send diagnostics to the backend and return the report ID
    func sendDiagnostics(userDescription: String?) async throws -> String {
        let report = collectDiagnostics(userDescription: userDescription)

        guard let url = URL(string: "\(baseURL)/submitDiagnosticReport") else {
            throw DiagnosticsError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(report)
        request.httpBody = body

        DiagnosticLogger.shared.info(
            "Sending diagnostic report \(report.reportId)",
            category: .app,
            metadata: ["reportSize": "\(body.count) bytes"]
        )

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw DiagnosticsError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            DiagnosticLogger.shared.info(
                "Diagnostic report sent successfully",
                category: .app,
                metadata: ["reportId": report.reportId]
            )
            return report.reportId
        } else {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw DiagnosticsError.serverError("Status \(httpResponse.statusCode): \(errorMessage)")
        }
    }
}

// MARK: - Errors

enum DiagnosticsError: Error, LocalizedError {
    case invalidURL
    case networkError(String)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid diagnostics URL"
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let message):
            return "Server error: \(message)"
        }
    }
}

// MARK: - Extensions for diagnostic properties

extension WebSocketState {
    var diagnosticDescription: String {
        switch self {
        case .disconnected: return "disconnected"
        case .connecting: return "connecting"
        case .connected: return "connected"
        case .ready: return "ready"
        case .reconnecting(let attempt): return "reconnecting_\(attempt)"
        case .error(let msg): return "error: \(msg)"
        }
    }
}
