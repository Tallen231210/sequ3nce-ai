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

/// Service for Convex HTTP API calls
class ConvexService {
    // MARK: - Configuration
    private let baseURL = "https://ideal-ram-982.convex.site"
    private let session: URLSession

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
}
