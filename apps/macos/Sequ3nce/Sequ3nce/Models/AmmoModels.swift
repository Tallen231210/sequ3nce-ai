//
//  AmmoModels.swift
//  Sequ3nce
//
//  Data models for Ammo Panel functionality
//

import Foundation
import SwiftUI

// MARK: - Ammo Item

struct AmmoItem: Identifiable, Codable {
    let _id: String
    let type: AmmoType
    let text: String
    let createdAt: Double

    var id: String { _id }

    // Decode from server response
    enum CodingKeys: String, CodingKey {
        case _id
        case type
        case text
        case createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        _id = try container.decode(String.self, forKey: ._id)
        text = try container.decode(String.self, forKey: .text)
        createdAt = try container.decode(Double.self, forKey: .createdAt)

        // Handle type as string and convert to enum
        let typeString = try container.decode(String.self, forKey: .type)
        type = AmmoType(rawValue: typeString) ?? .unknown
    }

    init(_id: String, type: AmmoType, text: String, createdAt: Double) {
        self._id = _id
        self.type = type
        self.text = text
        self.createdAt = createdAt
    }
}

enum AmmoType: String, Codable, CaseIterable {
    case emotional = "emotional"
    case urgency = "urgency"
    case budget = "budget"
    case commitment = "commitment"
    case objectionPreview = "objection_preview"
    case painPoint = "pain_point"
    case unknown = "unknown"

    var label: String {
        switch self {
        case .emotional: return "Emotional"
        case .urgency: return "Urgency"
        case .budget: return "Budget"
        case .commitment: return "Commitment"
        case .objectionPreview: return "Objection"
        case .painPoint: return "Pain Point"
        case .unknown: return "Other"
        }
    }

    var backgroundColor: Color {
        switch self {
        case .emotional: return Color(red: 0.95, green: 0.90, blue: 1.0)  // purple-50
        case .urgency: return Color(red: 1.0, green: 0.95, blue: 0.90)    // orange-50
        case .budget: return Color(red: 0.90, green: 0.98, blue: 0.90)    // green-50
        case .commitment: return Color(red: 0.90, green: 0.95, blue: 1.0) // blue-50
        case .objectionPreview: return Color(red: 1.0, green: 0.90, blue: 0.90) // red-50
        case .painPoint: return Color(red: 1.0, green: 0.98, blue: 0.90)  // yellow-50
        case .unknown: return Color(white: 0.95)
        }
    }

    var textColor: Color {
        switch self {
        case .emotional: return Color(red: 0.58, green: 0.27, blue: 0.88)  // purple-600
        case .urgency: return Color(red: 0.92, green: 0.45, blue: 0.08)    // orange-600
        case .budget: return Color(red: 0.09, green: 0.63, blue: 0.22)     // green-600
        case .commitment: return Color(red: 0.15, green: 0.39, blue: 0.92) // blue-600
        case .objectionPreview: return Color(red: 0.86, green: 0.15, blue: 0.15) // red-600
        case .painPoint: return Color(red: 0.65, green: 0.50, blue: 0.08)  // yellow-700
        case .unknown: return Color(white: 0.4)
        }
    }

    var borderColor: Color {
        switch self {
        case .emotional: return Color(red: 0.85, green: 0.75, blue: 1.0)  // purple-200
        case .urgency: return Color(red: 1.0, green: 0.85, blue: 0.75)    // orange-200
        case .budget: return Color(red: 0.75, green: 0.93, blue: 0.75)    // green-200
        case .commitment: return Color(red: 0.75, green: 0.85, blue: 1.0) // blue-200
        case .objectionPreview: return Color(red: 1.0, green: 0.75, blue: 0.75) // red-200
        case .painPoint: return Color(red: 1.0, green: 0.93, blue: 0.75)  // yellow-200
        case .unknown: return Color(white: 0.88)
        }
    }
}

// MARK: - Transcript Segment

struct TranscriptSegment: Identifiable, Codable {
    let _id: String
    let callId: String?
    let speaker: String
    let text: String
    let timestamp: Double
    let createdAt: Double?

    var id: String { _id }

    var isCloser: Bool {
        speaker.lowercased() == "closer"
    }

    var displaySpeaker: String {
        isCloser ? "You" : "Prospect"
    }
}

// MARK: - Resource

struct Resource: Identifiable, Codable {
    let _id: String
    let type: ResourceType
    let title: String
    let description: String?
    let content: String?
    let url: String?

    var id: String { _id }
}

enum ResourceType: String, Codable {
    case script = "script"
    case paymentLink = "payment_link"
    case document = "document"
    case link = "link"

    var label: String {
        switch self {
        case .script: return "Script"
        case .paymentLink: return "Payment"
        case .document: return "Document"
        case .link: return "Link"
        }
    }

    var backgroundColor: Color {
        switch self {
        case .script: return Color(red: 0.90, green: 0.95, blue: 1.0)      // blue-50
        case .paymentLink: return Color(red: 0.90, green: 0.98, blue: 0.90) // green-50
        case .document: return Color(red: 0.95, green: 0.90, blue: 1.0)     // purple-50
        case .link: return Color(red: 1.0, green: 0.95, blue: 0.90)         // orange-50
        }
    }

    var textColor: Color {
        switch self {
        case .script: return Color(red: 0.15, green: 0.39, blue: 0.92)      // blue-600
        case .paymentLink: return Color(red: 0.09, green: 0.63, blue: 0.22) // green-600
        case .document: return Color(red: 0.58, green: 0.27, blue: 0.88)    // purple-600
        case .link: return Color(red: 0.92, green: 0.45, blue: 0.08)        // orange-600
        }
    }

    var borderColor: Color {
        switch self {
        case .script: return Color(red: 0.75, green: 0.85, blue: 1.0)      // blue-200
        case .paymentLink: return Color(red: 0.75, green: 0.93, blue: 0.75) // green-200
        case .document: return Color(red: 0.85, green: 0.75, blue: 1.0)     // purple-200
        case .link: return Color(red: 1.0, green: 0.85, blue: 0.75)         // orange-200
        }
    }
}

// MARK: - Ammo V2 Analysis

struct AmmoV2Analysis: Codable {
    let engagement: EngagementData
    let beliefs: BuyingBeliefs
    let objectionPrediction: [ObjectionPrediction]
    let painPoints: [String]
    let liveSummary: String?
    let analyzedAt: Double?

    // Explicit initializer for creating default instances
    init(engagement: EngagementData, beliefs: BuyingBeliefs, objectionPrediction: [ObjectionPrediction], painPoints: [String], liveSummary: String? = nil, analyzedAt: Double?) {
        self.engagement = engagement
        self.beliefs = beliefs
        self.objectionPrediction = objectionPrediction
        self.painPoints = painPoints
        self.liveSummary = liveSummary
        self.analyzedAt = analyzedAt
    }

    struct EngagementData: Codable {
        let level: EngagementLevel
        let reason: String

        init(level: EngagementLevel, reason: String) {
            self.level = level
            self.reason = reason
        }
    }

    struct BuyingBeliefs: Codable {
        let problem: Int
        let solution: Int
        let vehicle: Int
        let selfBelief: Int
        let time: Int
        let money: Int
        let urgency: Int

        // Map JSON "self" to selfBelief
        enum CodingKeys: String, CodingKey {
            case problem, solution, vehicle, time, money, urgency
            case selfBelief = "self"
        }

        // Explicit initializer for creating default instances
        init(problem: Int, solution: Int, vehicle: Int, selfBelief: Int, time: Int, money: Int, urgency: Int) {
            self.problem = problem
            self.solution = solution
            self.vehicle = vehicle
            self.selfBelief = selfBelief
            self.time = time
            self.money = money
            self.urgency = urgency
        }

        // Get all beliefs as array for iteration
        var allBeliefs: [(key: String, label: String, tooltip: String, value: Int)] {
            [
                ("problem", "Problem", "Do they believe they have a real problem?", problem),
                ("solution", "Solution", "Do they believe a solution exists?", solution),
                ("vehicle", "Vehicle", "Do they believe THIS solution is the right one?", vehicle),
                ("self", "Self", "Do they believe THEY can succeed with it?", selfBelief),
                ("time", "Time", "Do they believe NOW is the right time?", time),
                ("money", "Money", "Do they believe it's worth the investment?", money),
                ("urgency", "Urgency", "Is there urgency to make a decision?", urgency)
            ]
        }
    }

    struct ObjectionPrediction: Codable {
        let type: String
        let probability: Int

        var displayLabel: String {
            switch type {
            case "think_about_it": return "Think About It"
            case "spouse": return "Spouse/Partner"
            case "money": return "Money/Budget"
            case "time": return "Bad Timing"
            case "trust": return "Trust/Skepticism"
            case "comparison": return "Comparing Options"
            default: return type.replacingOccurrences(of: "_", with: " ").capitalized
            }
        }
    }
}

enum EngagementLevel: String, Codable {
    case high
    case medium
    case low

    var backgroundColor: Color {
        switch self {
        case .high: return Color(red: 0.90, green: 0.98, blue: 0.90)   // green-100
        case .medium: return Color(red: 1.0, green: 0.98, blue: 0.90) // yellow-100
        case .low: return Color(red: 1.0, green: 0.90, blue: 0.90)    // red-100
        }
    }

    var textColor: Color {
        switch self {
        case .high: return Color(red: 0.09, green: 0.54, blue: 0.22)   // green-700
        case .medium: return Color(red: 0.65, green: 0.50, blue: 0.08) // yellow-700
        case .low: return Color(red: 0.72, green: 0.18, blue: 0.18)    // red-700
        }
    }

    var borderColor: Color {
        switch self {
        case .high: return Color(red: 0.75, green: 0.93, blue: 0.75)   // green-200
        case .medium: return Color(red: 1.0, green: 0.93, blue: 0.75)  // yellow-200
        case .low: return Color(red: 1.0, green: 0.75, blue: 0.75)     // red-200
        }
    }
}

// MARK: - Helpers

extension Double {
    /// Format timestamp as relative time (e.g., "2m ago")
    var relativeTimeString: String {
        let seconds = (Date().timeIntervalSince1970 * 1000 - self) / 1000
        if seconds < 10 { return "just now" }
        if seconds < 60 { return "\(Int(seconds))s ago" }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(minutes)m ago" }
        return "\(Int(minutes / 60))h ago"
    }

    /// Format seconds to MM:SS
    var timestampString: String {
        let totalSeconds = Int(self)
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
