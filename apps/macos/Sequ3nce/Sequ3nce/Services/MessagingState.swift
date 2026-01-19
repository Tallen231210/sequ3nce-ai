//
//  MessagingState.swift
//  Sequ3nce
//
//  State management for Live Chat - handles polling for messages from managers
//

import Foundation
import SwiftUI
import Combine
import AppKit

/// State manager for the Live Chat feature
@MainActor
class MessagingState: ObservableObject {
    // MARK: - Published State

    @Published var messages: [ChatMessage] = []
    @Published var unreadCount: Int = 0
    @Published var showNotificationBanner: Bool = false
    @Published var latestUnreadMessage: LatestUnreadMessage?
    @Published var isChatPanelOpen: Bool = false
    @Published var isSendingMessage: Bool = false
    @Published var sendError: String?

    // Track the last seen message ID for notification purposes
    private var lastSeenMessageId: String?

    // Track the last manager who sent a message (for replies)
    private var lastManagerUserId: String?

    // MARK: - Configuration

    private let pollInterval: TimeInterval = 2.5 // Poll every 2.5 seconds
    private var soundDebounceTime: Date = Date.distantPast
    private let soundDebounceInterval: TimeInterval = 3.0 // Only play sound once every 3 seconds

    // MARK: - Private State

    private let convexService = ConvexService()
    private var pollTimer: Timer?
    private var closerId: String?
    private var teamId: String?
    private var closerName: String?

    // MARK: - Public Methods

    /// Start polling for messages
    func startPolling(closerId: String, teamId: String, closerName: String) {
        print("[MessagingState] Starting polling for closer: \(closerId)")

        self.closerId = closerId
        self.teamId = teamId
        self.closerName = closerName

        // Initial fetch
        Task {
            await fetchMessages()
            await fetchUnreadCount()
        }

        // Start timer for periodic polling
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.poll()
            }
        }
    }

    /// Stop polling for messages
    func stopPolling() {
        print("[MessagingState] Stopping polling")
        pollTimer?.invalidate()
        pollTimer = nil
        closerId = nil
        teamId = nil
        closerName = nil
    }

    /// Open the chat panel
    func openChatPanel() {
        isChatPanelOpen = true
        showNotificationBanner = false

        // Mark all messages as read when opening the panel
        Task {
            await markAllAsRead()
        }
    }

    /// Close the chat panel
    func closeChatPanel() {
        isChatPanelOpen = false
    }

    /// Dismiss the notification banner
    func dismissNotificationBanner() {
        showNotificationBanner = false
    }

    /// Send a message from the closer
    func sendMessage(_ text: String) async {
        guard let closerId = closerId,
              let teamId = teamId,
              let closerName = closerName else {
            sendError = "Not connected"
            return
        }

        guard let recipientUserId = lastManagerUserId else {
            sendError = "No manager to reply to"
            return
        }

        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        isSendingMessage = true
        sendError = nil

        do {
            try await convexService.sendMessageFromCloser(
                teamId: teamId,
                closerId: closerId,
                closerName: closerName,
                recipientUserId: recipientUserId,
                message: trimmedText
            )

            // Refresh messages after sending
            await fetchMessages()
        } catch {
            print("[MessagingState] Failed to send message: \(error)")
            sendError = error.localizedDescription
        }

        isSendingMessage = false
    }

    // MARK: - Private Methods

    /// Poll for updates (called by timer)
    private func poll() async {
        await fetchUnreadCount()

        // Only fetch full messages if chat panel is open
        if isChatPanelOpen {
            await fetchMessages()
        } else {
            // Just check for latest unread for notification banner
            await checkForNewMessages()
        }
    }

    /// Fetch all messages for the closer
    private func fetchMessages() async {
        guard let closerId = closerId else { return }

        do {
            let newMessages = try await convexService.getMessagesForCloser(closerId: closerId)
            messages = newMessages

            // Track the last manager who sent a message (for replies)
            if let lastManagerMessage = newMessages.last(where: { $0.senderType == "manager" && $0.senderUserId != nil }) {
                lastManagerUserId = lastManagerMessage.senderUserId
            }
        } catch {
            print("[MessagingState] Failed to fetch messages: \(error)")
        }
    }

    /// Fetch unread count for badge
    private func fetchUnreadCount() async {
        guard let closerId = closerId else { return }

        do {
            let count = try await convexService.getUnreadCountForCloser(closerId: closerId)
            unreadCount = count
        } catch {
            print("[MessagingState] Failed to fetch unread count: \(error)")
        }
    }

    /// Check for new messages and show notification banner
    private func checkForNewMessages() async {
        guard let closerId = closerId else { return }

        do {
            if let latest = try await convexService.getLatestUnreadForCloser(closerId: closerId) {
                // Check if this is a new message we haven't seen before
                if lastSeenMessageId != latest._id {
                    lastSeenMessageId = latest._id
                    latestUnreadMessage = latest

                    // Show notification banner (unless chat panel is open)
                    if !isChatPanelOpen {
                        showNotificationBanner = true
                        playNotificationSound()
                    }
                }
            }
        } catch {
            print("[MessagingState] Failed to check for new messages: \(error)")
        }
    }

    /// Mark all messages as read
    private func markAllAsRead() async {
        guard let closerId = closerId else { return }

        do {
            try await convexService.markAllAsReadForCloser(closerId: closerId)
            unreadCount = 0
            showNotificationBanner = false
        } catch {
            print("[MessagingState] Failed to mark messages as read: \(error)")
        }
    }

    /// Play notification sound (with debounce)
    private func playNotificationSound() {
        let now = Date()
        guard now.timeIntervalSince(soundDebounceTime) >= soundDebounceInterval else {
            return // Sound was played recently, skip
        }

        soundDebounceTime = now

        // Play system notification sound
        if let sound = NSSound(named: NSSound.Name("Glass")) {
            sound.play()
        } else {
            NSSound.beep()
        }
    }
}
