//
//  ConvexService.swift
//  Sequ3nce
//
//  HTTP client for Convex backend API
//  Base URL: https://ideal-ram-982.convex.site
//

import Foundation

/// Login response from the server
struct LoginResponse: Codable {
    let success: Bool
    let error: String?
    let closer: CloserResponseData?
}

/// Closer data nested in login response
struct CloserResponseData: Codable {
    let closerId: String
    let teamId: String
    let name: String
    let email: String
    let status: String?
    let teamName: String?
}

/// Generic API error response
struct APIErrorResponse: Codable {
    let error: String?
    let message: String?
}

/// API errors
enum ConvexError: Error, LocalizedError {
    case invalidURL
    case networkError(String)
    case serverError(String)
    case decodingError(String)
    case unauthorized
    case invalidCredentials

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL configuration"
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .decodingError(let message):
            return "Failed to parse response: \(message)"
        case .unauthorized:
            return "Session expired. Please log in again."
        case .invalidCredentials:
            return "Invalid email or password."
        }
    }
}

// MARK: - Training Models

/// Training playlist summary
struct TrainingPlaylist: Codable, Identifiable {
    let _id: String
    let name: String
    let description: String?
    let itemCount: Int
    let totalDuration: Double
    let assignedAt: Double
    let assignedByName: String

    var id: String { _id }
}

/// Training highlight (clip)
struct TrainingHighlight: Codable, Identifiable {
    let _id: String
    let title: String
    let notes: String?
    let category: String
    let transcriptText: String
    let startTimestamp: Double
    let endTimestamp: Double
    let recordingUrl: String?
    let closerName: String

    var id: String { _id }
}

/// Training playlist item (highlight with order)
struct TrainingPlaylistItem: Codable, Identifiable {
    let _id: String
    let order: Int
    let highlight: TrainingHighlight

    var id: String { _id }
}

/// Training playlist with full item details
struct TrainingPlaylistWithItems: Codable, Identifiable {
    let _id: String
    let name: String
    let description: String?
    let itemCount: Int
    let totalDuration: Double
    let assignedAt: Double
    let assignedByName: String
    let items: [TrainingPlaylistItem]

    var id: String { _id }
}

// MARK: - Call Review / Coaching Models

/// A call that has manager feedback (for closer's Coaching > Your Feedback)
struct FeedbackCall: Codable, Identifiable {
    let callId: String
    let prospectName: String
    let commentCount: Int
    let lastCommentAt: Double
    let latestCommentPreview: String?
    var isUnread: Bool

    var id: String { callId }
}

/// A comment on a call review
struct CallComment: Codable, Identifiable {
    let _id: String
    let callId: String
    let authorType: String        // "manager" | "closer"
    let authorId: String
    let authorName: String
    let content: String
    let timestampSeconds: Double?
    let parentCommentId: String?
    let createdAt: Double

    var id: String { _id }
}

/// A shared moment from a call review
struct SharedMoment: Codable, Identifiable {
    let _id: String
    let callId: String
    let title: String
    let notes: String?
    let startSeconds: Double
    let endSeconds: Double
    let closerName: String?
    let createdAt: Double

    var id: String { _id }
}

/// Unread feedback count response
struct UnreadFeedbackCountResponse: Codable {
    let count: Int
}

// MARK: - Calendar Models

/// Calendar connection status
struct CalendarStatus: Codable {
    let closerId: String
    let connected: Bool
    let icsUrl: String?
    let connectedAt: Double?
    let lastSynced: Double?
}

/// Calendar event
struct CalendarEvent: Codable, Identifiable {
    let _id: String
    let uid: String
    let title: String
    let description: String?
    let startTime: Double
    let endTime: Double
    let location: String?
    let isAllDay: Bool?
    let meetingUrl: String?  // Extracted Zoom/Meet/Teams URL for one-click join

    var id: String { _id }
}

// MARK: - Role Play Room Models

/// Role play room response from getOrCreateRolePlayRoom
struct RolePlayRoomResponse: Codable {
    let roomUrl: String
    let roomName: String
}

/// Role play room participant
struct RolePlayRoomParticipant: Codable, Identifiable {
    let closerId: String
    let userName: String
    let joinedAt: Double

    var id: String { closerId }
}

/// Pending questionnaire info returned from API
struct PendingQuestionnaireInfo {
    let count: Int
    let firstCallId: String?
    let firstProspectName: String?
}

/// Service for Convex HTTP API calls
class ConvexService {
    // MARK: - Configuration
    private let baseURL = "https://ideal-ram-982.convex.site"
    private let session: URLSession

    // MARK: - API Error Tracking (for diagnostics)
    var lastApiError: String?
    var lastApiErrorEndpoint: String?
    var lastApiErrorAt: Date?
    var apiErrorCountLastHour: Int = 0
    private var apiErrorResetTime = Date()

    func trackApiError(endpoint: String, error: String) {
        lastApiError = error
        lastApiErrorEndpoint = endpoint
        lastApiErrorAt = Date()
        apiErrorCountLastHour += 1
        if Date().timeIntervalSince(apiErrorResetTime) > 3600 {
            apiErrorCountLastHour = 1
            apiErrorResetTime = Date()
        }
    }

    // MARK: - Initialization
    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60

        self.session = URLSession(configuration: config)
    }

    // MARK: - Authentication

    /// Login with email and password
    func login(email: String, password: String) async throws -> CloserInfo {
        // Add cache-busting param like Electron app does
        let url = URL(string: "\(baseURL)/loginCloser?_=\(Date().timeIntervalSince1970)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        // Trim and lowercase email like Electron app
        let body: [String: String] = [
            "email": email.trimmingCharacters(in: .whitespaces).lowercased(),
            "password": password
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        // Log response for debugging
        if let responseStr = String(data: data, encoding: .utf8) {
            print("[ConvexService] Login response: \(responseStr)")
        }

        switch httpResponse.statusCode {
        case 200:
            let loginResponse = try JSONDecoder().decode(LoginResponse.self, from: data)

            guard loginResponse.success,
                  let closer = loginResponse.closer else {
                throw ConvexError.invalidCredentials
            }

            return CloserInfo(
                closerId: closer.closerId,
                teamId: closer.teamId,
                name: closer.name,
                email: closer.email,
                teamName: closer.teamName ?? "Unknown Team"
            )

        case 401:
            throw ConvexError.invalidCredentials

        default:
            let errorResponse = try? JSONDecoder().decode(LoginResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Unknown error")
        }
    }

    /// Change password
    func changePassword(closerId: String, currentPassword: String, newPassword: String) async throws {
        let url = URL(string: "\(baseURL)/changePassword")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "closerId": closerId,
            "currentPassword": currentPassword,
            "newPassword": newPassword
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to change password")
        }
    }

    // MARK: - Call Management

    /// Complete call with outcome data (full questionnaire)
    func completeCallWithOutcome(
        callId: String,
        prospectName: String,
        outcome: String,
        cashCollected: Int?,
        contractValue: Int?,
        notes: String?,
        primaryObjection: String?,
        primaryObjectionOther: String?,
        objectionsOvercome: String?,
        objectionsOvercomeOther: String?,
        leadQualityScore: Int?,
        prospectWasDecisionMaker: String?
    ) async throws {
        let url = URL(string: "\(baseURL)/completeCallWithOutcome")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "callId": callId,
            "prospectName": prospectName,
            "outcome": outcome
        ]

        // Also set dealValue to contractValue for backward compat with old stats
        if let cash = cashCollected {
            body["cashCollected"] = cash
        }
        if let contract = contractValue {
            body["contractValue"] = contract
            body["dealValue"] = contract  // Legacy field
        }
        if let notes = notes, !notes.isEmpty {
            body["notes"] = notes
        }
        if let objection = primaryObjection {
            body["primaryObjection"] = objection
        }
        if let objectionOther = primaryObjectionOther, !objectionOther.isEmpty {
            body["primaryObjectionOther"] = objectionOther
        }
        if let overcome = objectionsOvercome {
            body["objectionsOvercome"] = overcome
        }
        if let overcomeOther = objectionsOvercomeOther, !overcomeOther.isEmpty {
            body["objectionsOvercomeOther"] = overcomeOther
        }
        if let quality = leadQualityScore {
            body["leadQualityScore"] = quality
        }
        if let decisionMaker = prospectWasDecisionMaker {
            body["prospectWasDecisionMaker"] = decisionMaker
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("[ConvexService] Submitting call outcome: \(body)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if let responseStr = String(data: data, encoding: .utf8) {
            print("[ConvexService] completeCallWithOutcome response: \(responseStr)")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? errorResponse?.error ?? "Failed to complete call")
        }
    }

    /// Update prospect name for a call
    func updateProspectName(callId: String, prospectName: String) async throws {
        let url = URL(string: "\(baseURL)/updateProspectName")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "callId": callId,
            "prospectName": prospectName
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to update prospect name")
        }
    }

    /// Update call notes
    func updateCallNotes(callId: String, notes: String) async throws {
        let url = URL(string: "\(baseURL)/updateCallNotes")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "callId": callId,
            "notes": notes
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to update notes")
        }
    }

    // MARK: - Ammo & Transcript

    /// Get ammo items for a call (typed)
    func getAmmoItems(callId: String) async throws -> [AmmoItem] {
        var components = URLComponents(string: "\(baseURL)/getAmmoByCall")!
        components.queryItems = [URLQueryItem(name: "callId", value: callId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([AmmoItem].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get ammo")
        }
    }

    /// Get transcript segments for a call (typed)
    func getTranscriptSegments(callId: String) async throws -> [TranscriptSegment] {
        var components = URLComponents(string: "\(baseURL)/getTranscriptSegments")!
        components.queryItems = [URLQueryItem(name: "callId", value: callId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            do {
                let decoder = JSONDecoder()
                let segments = try decoder.decode([TranscriptSegment].self, from: data)
                if !segments.isEmpty {
                    print("[ConvexService] Fetched \(segments.count) transcript segments")
                }
                return segments
            } catch {
                // Log the raw response for debugging
                if let responseStr = String(data: data, encoding: .utf8) {
                    print("[ConvexService] Failed to decode transcript. Raw response: \(responseStr.prefix(500))")
                }
                print("[ConvexService] Decode error: \(error)")
                throw ConvexError.decodingError(error.localizedDescription)
            }
        } else {
            throw ConvexError.serverError("Failed to get transcript")
        }
    }

    /// Check if Ammo V2 is enabled for team
    func isAmmoV2Enabled(teamId: String) async throws -> Bool {
        var components = URLComponents(string: "\(baseURL)/isAmmoV2Enabled")!
        components.queryItems = [URLQueryItem(name: "teamId", value: teamId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            if let result = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let enabled = result["enabled"] as? Bool {
                return enabled
            }
        }
        return false
    }

    /// Get Ammo V2 analysis for a call (typed)
    func getAmmoAnalysis(callId: String) async throws -> AmmoV2Analysis? {
        var components = URLComponents(string: "\(baseURL)/getAmmoAnalysis")!
        components.queryItems = [URLQueryItem(name: "callId", value: callId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Check if response has engagement data (indicates valid analysis)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               json["engagement"] != nil {
                let decoder = JSONDecoder()
                return try decoder.decode(AmmoV2Analysis.self, from: data)
            }
        }
        return nil
    }

    /// Get active resources for a team
    func getActiveResources(teamId: String) async throws -> [Resource] {
        var components = URLComponents(string: "\(baseURL)/getActiveResources")!
        components.queryItems = [URLQueryItem(name: "teamId", value: teamId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([Resource].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get resources")
        }
    }

    // MARK: - Error Logging

    /// Log client error to server
    func logClientError(
        closerId: String?,
        teamId: String?,
        errorType: String,
        errorMessage: String,
        stackTrace: String?,
        context: [String: String]?
    ) async {
        guard let url = URL(string: "\(baseURL)/logClientError") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "errorType": errorType,
            "errorMessage": errorMessage,
            "platform": "macos-swift",
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        ]

        if let closerId = closerId { body["closerId"] = closerId }
        if let teamId = teamId { body["teamId"] = teamId }
        if let stackTrace = stackTrace { body["stackTrace"] = stackTrace }
        if let context = context { body["context"] = context }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        // Fire and forget - don't wait for response
        Task {
            _ = try? await session.data(for: request)
        }
    }

    // MARK: - Training

    /// Get assigned training playlists for a closer
    func getAssignedPlaylists(closerId: String) async throws -> [TrainingPlaylist] {
        var components = URLComponents(string: "\(baseURL)/getAssignedTraining")!
        components.queryItems = [URLQueryItem(name: "closerId", value: closerId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([TrainingPlaylist].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get playlists")
        }
    }

    /// Get training playlist details with items
    func getPlaylistDetails(playlistId: String, closerId: String) async throws -> TrainingPlaylistWithItems? {
        var components = URLComponents(string: "\(baseURL)/getTrainingPlaylistDetails")!
        components.queryItems = [
            URLQueryItem(name: "playlistId", value: playlistId),
            URLQueryItem(name: "closerId", value: closerId)
        ]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode(TrainingPlaylistWithItems.self, from: data)
        } else {
            return nil
        }
    }

    // MARK: - URL Helper

    /// Safely construct a URL from the base URL and a path.
    /// Throws ConvexError.invalidURL if the string cannot be parsed.
    private func makeURL(path: String) throws -> URL {
        guard let url = URL(string: "\(baseURL)/\(path)") else {
            throw ConvexError.invalidURL
        }
        return url
    }

    // MARK: - Call Reviews / Coaching

    /// Get calls with manager feedback for this closer
    func getFeedbackForCloser(closerId: String) async throws -> [FeedbackCall] {
        let url = try makeURL(path: "getFeedbackForCloser")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Response is {"calls": [...]}
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let callsData = json["calls"] {
                let callsJson = try JSONSerialization.data(withJSONObject: callsData)
                return try JSONDecoder().decode([FeedbackCall].self, from: callsJson)
            }
            print("[ConvexService] getFeedbackForCloser: unexpected response structure")
            return []
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to get feedback (HTTP \(httpResponse.statusCode))")
        }
    }

    /// Get comments for a specific call
    func getCommentsForCall(callId: String) async throws -> [CallComment] {
        let url = try makeURL(path: "getCommentsForCall")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["callId": callId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Response is {"comments": [...]}
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let commentsData = json["comments"] {
                let commentsJson = try JSONSerialization.data(withJSONObject: commentsData)
                return try JSONDecoder().decode([CallComment].self, from: commentsJson)
            }
            print("[ConvexService] getCommentsForCall: unexpected response structure")
            return []
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to get comments (HTTP \(httpResponse.statusCode))")
        }
    }

    /// Add a comment to a call review
    func addCallComment(
        callId: String,
        authorType: String,
        authorId: String,
        authorName: String,
        content: String,
        timestampSeconds: Double?,
        parentCommentId: String? = nil
    ) async throws {
        let url = try makeURL(path: "addCallComment")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "callId": callId,
            "authorType": authorType,
            "authorId": authorId,
            "authorName": authorName,
            "content": content
        ]

        if let ts = timestampSeconds {
            body["timestampSeconds"] = ts
        }

        if let parentId = parentCommentId {
            body["parentCommentId"] = parentId
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to add comment")
        }
    }

    /// Flag a call for manager review
    func flagCallForReview(callId: String, closerId: String) async throws {
        let url = try makeURL(path: "flagCallForReview")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["callId": callId, "closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to flag call")
        }
    }

    /// Unflag a call (remove flag for review)
    func unflagCall(callId: String, closerId: String) async throws {
        let url = try makeURL(path: "unflagCall")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["callId": callId, "closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to unflag call")
        }
    }

    /// Get team shared moments for this closer
    func getSharedMoments(closerId: String) async throws -> [SharedMoment] {
        let url = try makeURL(path: "getSharedMoments")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Response is {"moments": [...]}
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let momentsData = json["moments"] {
                let momentsJson = try JSONSerialization.data(withJSONObject: momentsData)
                return try JSONDecoder().decode([SharedMoment].self, from: momentsJson)
            }
            return []
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to get shared moments (HTTP \(httpResponse.statusCode))")
        }
    }

    /// Get unread feedback count for badge
    func getUnreadFeedbackCount(closerId: String) async throws -> Int {
        let url = try makeURL(path: "getUnreadFeedbackCount")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let result = try JSONDecoder().decode(UnreadFeedbackCountResponse.self, from: data)
            return result.count
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to get unread count (HTTP \(httpResponse.statusCode))")
        }
    }

    /// Mark feedback as read for a call
    func markFeedbackRead(callId: String, closerId: String) async throws {
        let url = try makeURL(path: "markFeedbackRead")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["callId": callId, "closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.message ?? "Failed to mark feedback read")
        }
    }

    // MARK: - Role Play Room

    /// Get or create a role play room for a team
    func getOrCreateRolePlayRoom(teamId: String) async throws -> RolePlayRoomResponse {
        let url = URL(string: "\(baseURL)/getOrCreateRolePlayRoom")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["teamId": teamId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode(RolePlayRoomResponse.self, from: data)
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to get/create role play room")
        }
    }

    /// Join the role play room
    func joinRolePlayRoom(teamId: String, closerId: String, userName: String) async throws {
        let url = URL(string: "\(baseURL)/joinRolePlayRoom")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "teamId": teamId,
            "closerId": closerId,
            "userName": userName
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to join role play room")
        }
    }

    /// Leave the role play room
    func leaveRolePlayRoom(teamId: String, closerId: String) async throws {
        let url = URL(string: "\(baseURL)/leaveRolePlayRoom")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "teamId": teamId,
            "closerId": closerId
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to leave role play room")
        }
    }

    /// Get role play room participants
    func getRolePlayRoomParticipants(teamId: String) async throws -> [RolePlayRoomParticipant] {
        var components = URLComponents(string: "\(baseURL)/getRolePlayRoomParticipants")!
        components.queryItems = [URLQueryItem(name: "teamId", value: teamId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([RolePlayRoomParticipant].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get participants")
        }
    }

    // MARK: - Calendar

    /// Get calendar status for a closer by email and teamId
    func getCalendarStatus(email: String, teamId: String) async throws -> CalendarStatus? {
        var components = URLComponents(string: "\(baseURL)/getCloserCalendarStatusByEmail")!
        components.queryItems = [
            URLQueryItem(name: "email", value: email),
            URLQueryItem(name: "teamId", value: teamId)
        ]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Check if response has data (not null/empty)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               json["closerId"] != nil {
                let decoder = JSONDecoder()
                return try decoder.decode(CalendarStatus.self, from: data)
            }
            return nil
        } else {
            throw ConvexError.serverError("Failed to get calendar status")
        }
    }

    /// Connect calendar with ICS URL
    func connectCalendar(email: String, teamId: String, icsUrl: String) async throws {
        let url = URL(string: "\(baseURL)/connectCalendarByEmail")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "email": email,
            "teamId": teamId,
            "icsUrl": icsUrl
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to connect calendar")
        }
    }

    /// Disconnect calendar
    func disconnectCalendar(email: String, teamId: String) async throws {
        let url = URL(string: "\(baseURL)/disconnectCalendarByEmail")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "email": email,
            "teamId": teamId
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to disconnect calendar")
        }
    }

    /// Sync calendar
    func syncCalendar(email: String, teamId: String) async throws {
        let url = URL(string: "\(baseURL)/syncCalendarByEmail")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "email": email,
            "teamId": teamId
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to sync calendar")
        }
    }

    /// Get calendar events for a closer
    func getCalendarEvents(email: String, teamId: String, startDate: Int64, endDate: Int64) async throws -> [CalendarEvent] {
        var components = URLComponents(string: "\(baseURL)/getCloserEventsByEmail")!
        components.queryItems = [
            URLQueryItem(name: "email", value: email),
            URLQueryItem(name: "teamId", value: teamId),
            URLQueryItem(name: "startDate", value: String(startDate)),
            URLQueryItem(name: "endDate", value: String(endDate))
        ]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([CalendarEvent].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get calendar events")
        }
    }

    // MARK: - Live Messaging

    /// Get all messages for a closer
    func getMessagesForCloser(closerId: String, limit: Int? = nil) async throws -> [ChatMessage] {
        var components = URLComponents(string: "\(baseURL)/getMessagesForCloser")!
        var queryItems = [URLQueryItem(name: "closerId", value: closerId)]
        if let limit = limit {
            queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
        }
        components.queryItems = queryItems

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            return try decoder.decode([ChatMessage].self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get messages")
        }
    }

    /// Get unread message count for a closer
    func getUnreadCountForCloser(closerId: String) async throws -> Int {
        var components = URLComponents(string: "\(baseURL)/getUnreadCountForCloser")!
        components.queryItems = [URLQueryItem(name: "closerId", value: closerId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            let result = try decoder.decode(UnreadCountResponse.self, from: data)
            return result.count
        } else {
            throw ConvexError.serverError("Failed to get unread count")
        }
    }

    /// Get latest unread message for notification banner
    func getLatestUnreadForCloser(closerId: String) async throws -> LatestUnreadMessage? {
        var components = URLComponents(string: "\(baseURL)/getLatestUnreadForCloser")!
        components.queryItems = [URLQueryItem(name: "closerId", value: closerId)]

        let (data, response) = try await session.data(from: components.url!)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            // Check if response is null
            if let jsonString = String(data: data, encoding: .utf8),
               jsonString == "null" || jsonString.isEmpty {
                return nil
            }
            let decoder = JSONDecoder()
            return try decoder.decode(LatestUnreadMessage.self, from: data)
        } else {
            throw ConvexError.serverError("Failed to get latest unread")
        }
    }

    /// Send a message from a closer to the team (all managers can see it)
    func sendMessageFromCloser(teamId: String, closerId: String, closerName: String, message: String) async throws {
        let url = URL(string: "\(baseURL)/sendMessage")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "teamId": teamId,
            "senderType": "closer",
            "senderCloserId": closerId,
            "senderName": closerName,
            "recipientType": "manager",
            "message": message
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(SendMessageResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to send message")
        }
    }

    /// Mark all messages as read for a closer
    func markAllAsReadForCloser(closerId: String) async throws {
        let url = URL(string: "\(baseURL)/markAllAsReadForCloser")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["closerId": closerId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to mark messages as read")
        }
    }

    // MARK: - Reinforcement Requests

    /// Request reinforcements from the sales manager
    /// Called when a closer needs urgent help during a call
    func requestReinforcement(
        teamId: String,
        closerId: String,
        closerName: String,
        callId: String?,
        message: String?
    ) async throws -> Bool {
        let url = URL(string: "\(baseURL)/requestReinforcement")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "teamId": teamId,
            "closerId": closerId,
            "closerName": closerName
        ]

        if let callId = callId {
            body["callId"] = callId
        }
        if let message = message, !message.isEmpty {
            body["message"] = message
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("[ConvexService] Requesting reinforcement: \(body)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let success = json["success"] as? Bool {
                print("[ConvexService] Reinforcement request success: \(success)")
                return success
            }
            return true
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to request reinforcement")
        }
    }

    /// Notify that call is going long
    /// Called when a closer clicks "Call Going Long" button
    func callGoingLong(
        teamId: String,
        closerId: String,
        callId: String?,
        estimatedMinutes: Int
    ) async throws -> Bool {
        let url = URL(string: "\(baseURL)/callGoingLong")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "teamId": teamId,
            "closerId": closerId,
            "estimatedMinutes": estimatedMinutes
        ]

        if let callId = callId {
            body["callId"] = callId
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("[ConvexService] Notifying call going long: \(body)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let success = json["success"] as? Bool {
                print("[ConvexService] Call going long notification success: \(success)")
                return success
            }
            return true
        } else {
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw ConvexError.serverError(errorResponse?.error ?? "Failed to send call going long notification")
        }
    }

    // MARK: - Meeting Bot

    /// Check if team has meeting bot enabled
    func isMeetingBotEnabled(teamId: String) async throws -> Bool {
        let url = URL(string: "\(baseURL)/isMeetingBotEnabled")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["teamId": teamId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let enabled = json["enabled"] as? Bool {
            return enabled
        }
        return false
    }

    /// Check if closer needs calendar onboarding
    func needsCalendarOnboarding(closerId: String) async throws -> Bool {
        let url = URL(string: "\(baseURL)/needsCalendarOnboarding")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["closerId": closerId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let needsOnboarding = json["needsOnboarding"] as? Bool {
            return needsOnboarding
        }
        return false
    }

    /// Get active bot call for closer (returns nil if no active bot call)
    func getActiveCallForCloserBot(closerId: String) async throws -> ActiveBotInfo? {
        let url = URL(string: "\(baseURL)/getActiveCallForCloserBot")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["closerId": closerId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            trackApiError(endpoint: "getActiveCallForCloserBot", error: "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
            return nil
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let hasActiveCall = json["hasActiveCall"] as? Bool,
           hasActiveCall,
           let botId = json["botId"] as? String {
            return ActiveBotInfo(
                callId: json["callId"] as? String,
                meetingTitle: json["meetingTitle"] as? String,
                prospectName: json["prospectName"] as? String,
                botId: botId,
                status: json["status"] as? String ?? "active"
            )
        }
        return nil
    }

    /// Create a meeting bot on demand (when closer clicks "Join & Record")
    func createBotForMeeting(closerId: String, teamId: String, meetingUrl: String, meetingTitle: String?, prospectName: String?) async throws -> Bool {
        let url = URL(string: "\(baseURL)/createBotForMeeting")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "closerId": closerId,
            "teamId": teamId,
            "meetingUrl": meetingUrl,
        ]
        if let meetingTitle = meetingTitle {
            body["meetingTitle"] = meetingTitle
        }
        if let prospectName = prospectName {
            body["prospectName"] = prospectName
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[ConvexService] createBotForMeeting failed: HTTP \(statusCode)")
            trackApiError(endpoint: "createBotForMeeting", error: "HTTP \(statusCode)")
            return false
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let success = json["success"] as? Bool {
            return success
        }
        return false
    }

    /// Get pending questionnaire info (count + first pending call details)
    func getPendingQuestionnaireInfo(closerId: String) async throws -> PendingQuestionnaireInfo {
        let url = URL(string: "\(baseURL)/getPendingQuestionnaireCount")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["closerId": closerId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return PendingQuestionnaireInfo(count: 0, firstCallId: nil, firstProspectName: nil)
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let count = json["count"] as? Int {
            return PendingQuestionnaireInfo(
                count: count,
                firstCallId: json["firstCallId"] as? String,
                firstProspectName: json["firstProspectName"] as? String
            )
        }
        return PendingQuestionnaireInfo(count: 0, firstCallId: nil, firstProspectName: nil)
    }

    /// Get upcoming bots for closer (next 24 hours)
    func getUpcomingBotsForCloser(closerId: String) async throws -> [[String: Any]] {
        let url = URL(string: "\(baseURL)/getUpcomingBotsForCloser")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["closerId": closerId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return []
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let bots = json["bots"] as? [[String: Any]] {
            return bots
        }
        return []
    }

    /// Cancel/kick a bot from a meeting
    func cancelBot(botId: String) async throws -> Bool {
        let url = URL(string: "\(baseURL)/cancelBot")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["botId": botId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let success = json["success"] as? Bool {
            return success
        }
        return false
    }

    /// Create a quick bot (ad-hoc meeting)
    func createQuickBot(meetingUrl: String, closerId: String, teamId: String, prospectName: String?) async throws -> Bool {
        let url = URL(string: "\(baseURL)/createQuickBot")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "meetingUrl": meetingUrl,
            "closerId": closerId,
            "teamId": teamId
        ]
        if let name = prospectName {
            body["prospectName"] = name
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError("Invalid response")
        }

        if httpResponse.statusCode == 200 {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let success = json["success"] as? Bool {
                return success
            }
            return true  // 200 status is success even without explicit field
        } else {
            // Parse error message from response
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMsg = json["error"] as? String {
                trackApiError(endpoint: "createQuickBot", error: errorMsg)
                throw ConvexError.serverError(errorMsg)
            }
            trackApiError(endpoint: "createQuickBot", error: "HTTP \(httpResponse.statusCode)")
            throw ConvexError.serverError("Server returned status \(httpResponse.statusCode)")
        }
    }

    /// Exclude a calendar event from bot auto-join
    func excludeCalendarEvent(closerId: String, calendarEventId: String, eventTitle: String?) async throws -> Bool {
        let url = URL(string: "\(baseURL)/excludeCalendarEvent")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "closerId": closerId,
            "calendarEventId": calendarEventId
        ]
        if let title = eventTitle {
            body["eventTitle"] = title
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        return true
    }

    /// Get closer stats for dashboard
    func getCloserStats(closerId: String, period: String) async throws -> [String: Any] {
        let url = URL(string: "\(baseURL)/getCloserStats")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "period": period
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return [:]
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return json
        }
        return [:]
    }

    /// Get analytics summary for a closer
    func getAnalyticsSummary(closerId: String, teamId: String, period: String) async throws -> AnalyticsSummary? {
        let url = URL(string: "\(baseURL)/getCloserAnalyticsSummary")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "teamId": teamId,
            "period": period
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }

        return try? JSONDecoder().decode(AnalyticsSummary.self, from: data)
    }

    /// Get lost deals by objection for a closer
    func getLostDealsByObjection(closerId: String, teamId: String, period: String) async throws -> LostDealsData? {
        let url = URL(string: "\(baseURL)/getCloserLostDeals")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "teamId": teamId,
            "period": period
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }

        return try? JSONDecoder().decode(LostDealsData.self, from: data)
    }

    /// Get objection analysis for a closer
    func getObjectionAnalysis(closerId: String, teamId: String, period: String) async throws -> ObjectionAnalysisData? {
        let url = URL(string: "\(baseURL)/getCloserObjectionAnalysis")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "teamId": teamId,
            "period": period
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }

        return try? JSONDecoder().decode(ObjectionAnalysisData.self, from: data)
    }

    /// Mark calendar onboarding as completed
    func markOnboardingCompleted(closerId: String) async throws -> Bool {
        let url = URL(string: "\(baseURL)/markOnboardingCompleted")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["closerId": closerId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        return true
    }

    /// Save meeting platform selection during onboarding
    func saveMeetingPlatform(closerId: String, platform: String) async throws -> Bool {
        let url = URL(string: "\(baseURL)/saveMeetingPlatform")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "platform": platform
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        return true
    }

    /// Get call history for closer
    func getCallHistory(closerId: String, limit: Int = 50) async throws -> [[String: Any]] {
        let url = URL(string: "\(baseURL)/getCallHistory")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "closerId": closerId,
            "limit": limit
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return []
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let calls = json["calls"] as? [[String: Any]] {
            return calls
        }
        return []
    }
}
