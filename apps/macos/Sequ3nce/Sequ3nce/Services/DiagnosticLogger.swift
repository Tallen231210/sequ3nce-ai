//
//  DiagnosticLogger.swift
//  Sequ3nce
//
//  Thread-safe in-memory log buffer for diagnostics collection
//  Captures recent logs for debugging user-specific issues
//

import Foundation

/// Log level for diagnostic entries
enum DiagnosticLogLevel: String, Codable {
    case debug = "debug"
    case info = "info"
    case warning = "warning"
    case error = "error"

    var emoji: String {
        switch self {
        case .debug: return "🔍"
        case .info: return "ℹ️"
        case .warning: return "⚠️"
        case .error: return "❌"
        }
    }
}

/// Log category for diagnostic entries
enum DiagnosticLogCategory: String, Codable {
    case audio = "audio"
    case network = "network"
    case recording = "recording"
    case websocket = "websocket"
    case app = "app"
    case permissions = "permissions"
}

/// A single log entry
struct DiagnosticLogEntry: Codable {
    let timestamp: Date
    let level: DiagnosticLogLevel
    let category: DiagnosticLogCategory
    let message: String
    let metadata: [String: String]?

    var formattedMessage: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let timeStr = formatter.string(from: timestamp)
        let metaStr = metadata?.map { "\($0.key)=\($0.value)" }.joined(separator: ", ") ?? ""
        let metaDisplay = metaStr.isEmpty ? "" : " [\(metaStr)]"
        return "\(timeStr) \(level.emoji) [\(category.rawValue)] \(message)\(metaDisplay)"
    }
}

/// Thread-safe in-memory log buffer
class DiagnosticLogger {
    static let shared = DiagnosticLogger()

    private var buffer: [DiagnosticLogEntry] = []
    private let lock = NSLock()
    private let maxEntries = 500

    // Track error counts
    private var errorCountLastHour: Int = 0
    private var lastErrorTime: Date?
    private var lastErrorMessage: String?
    private var lastErrorResetTime: Date = Date()

    private init() {}

    // MARK: - Logging Methods

    /// Log a message with level and category
    func log(
        _ level: DiagnosticLogLevel,
        category: DiagnosticLogCategory,
        message: String,
        metadata: [String: String]? = nil
    ) {
        let entry = DiagnosticLogEntry(
            timestamp: Date(),
            level: level,
            category: category,
            message: message,
            metadata: metadata
        )

        lock.lock()
        defer { lock.unlock() }

        // Add entry
        buffer.append(entry)

        // Trim if needed
        if buffer.count > maxEntries {
            buffer.removeFirst(buffer.count - maxEntries)
        }

        // Track errors
        if level == .error {
            errorCountLastHour += 1
            lastErrorTime = entry.timestamp
            lastErrorMessage = message
        }

        // Reset error count every hour
        if Date().timeIntervalSince(lastErrorResetTime) > 3600 {
            errorCountLastHour = 0
            lastErrorResetTime = Date()
        }

        // Also print to console for debugging during development
        print(entry.formattedMessage)
    }

    // MARK: - Convenience Methods

    func debug(_ message: String, category: DiagnosticLogCategory, metadata: [String: String]? = nil) {
        log(.debug, category: category, message: message, metadata: metadata)
    }

    func info(_ message: String, category: DiagnosticLogCategory, metadata: [String: String]? = nil) {
        log(.info, category: category, message: message, metadata: metadata)
    }

    func warning(_ message: String, category: DiagnosticLogCategory, metadata: [String: String]? = nil) {
        log(.warning, category: category, message: message, metadata: metadata)
    }

    func error(_ message: String, category: DiagnosticLogCategory, metadata: [String: String]? = nil) {
        log(.error, category: category, message: message, metadata: metadata)
    }

    // MARK: - Retrieval Methods

    /// Get recent log entries
    func getRecentLogs(count: Int = 100) -> [DiagnosticLogEntry] {
        lock.lock()
        defer { lock.unlock() }

        let startIndex = max(0, buffer.count - count)
        return Array(buffer[startIndex...])
    }

    /// Get all log entries
    func getAllLogs() -> [DiagnosticLogEntry] {
        lock.lock()
        defer { lock.unlock() }

        return buffer
    }

    /// Get error statistics
    func getErrorStats() -> (count: Int, lastTime: Date?, lastMessage: String?) {
        lock.lock()
        defer { lock.unlock() }

        return (errorCountLastHour, lastErrorTime, lastErrorMessage)
    }

    /// Get logs filtered by level
    func getLogs(level: DiagnosticLogLevel, count: Int = 50) -> [DiagnosticLogEntry] {
        lock.lock()
        defer { lock.unlock() }

        let filtered = buffer.filter { $0.level == level }
        let startIndex = max(0, filtered.count - count)
        return Array(filtered[startIndex...])
    }

    /// Get logs filtered by category
    func getLogs(category: DiagnosticLogCategory, count: Int = 50) -> [DiagnosticLogEntry] {
        lock.lock()
        defer { lock.unlock() }

        let filtered = buffer.filter { $0.category == category }
        let startIndex = max(0, filtered.count - count)
        return Array(filtered[startIndex...])
    }

    /// Clear all logs
    func clear() {
        lock.lock()
        defer { lock.unlock() }

        buffer.removeAll()
        errorCountLastHour = 0
        lastErrorTime = nil
        lastErrorMessage = nil
    }
}
