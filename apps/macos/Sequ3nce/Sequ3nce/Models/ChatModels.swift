//
//  ChatModels.swift
//  Sequ3nce
//
//  Data models for Live Chat functionality between managers and closers
//

import Foundation

// MARK: - Chat Message

/// A message in the live chat between manager and closer
struct ChatMessage: Identifiable, Codable, Equatable {
    let _id: String
    let senderType: String // "manager" or "closer"
    let senderUserId: String? // Manager's user ID (if sender is manager)
    let senderName: String
    let message: String
    let isRead: Bool
    let createdAt: Double
    let isFromMe: Bool

    var id: String { _id }

    /// Format timestamp as relative time (e.g., "2m ago")
    var relativeTimeString: String {
        let seconds = (Date().timeIntervalSince1970 * 1000 - createdAt) / 1000
        if seconds < 10 { return "just now" }
        if seconds < 60 { return "\(Int(seconds))s ago" }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = Int(minutes / 60)
        if hours < 24 { return "\(hours)h ago" }
        return "\(Int(hours / 24))d ago"
    }

    /// Format timestamp as time (e.g., "2:34 PM")
    var timeString: String {
        let date = Date(timeIntervalSince1970: createdAt / 1000)
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Unread Count Response

struct UnreadCountResponse: Codable {
    let count: Int
}

// MARK: - Latest Unread Response

struct LatestUnreadMessage: Codable {
    let _id: String
    let senderName: String
    let message: String
    let createdAt: Double
}

// MARK: - Send Message Request

struct SendMessageRequest: Codable {
    let teamId: String
    let senderType: String
    let senderCloserId: String?
    let senderUserId: String?
    let senderName: String
    let recipientType: String
    let recipientCloserId: String?
    let recipientUserId: String?
    let message: String
}

// MARK: - Send Message Response

struct SendMessageResponse: Codable {
    let success: Bool
    let messageId: String?
    let error: String?
}

// MARK: - Mark Read Response

struct MarkReadResponse: Codable {
    let success: Bool
    let markedCount: Int?
}
