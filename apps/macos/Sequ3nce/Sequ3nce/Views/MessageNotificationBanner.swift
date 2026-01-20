//
//  MessageNotificationBanner.swift
//  Sequ3nce
//
//  A notification banner that appears when a new message arrives from a manager
//

import SwiftUI

/// Notification banner shown at the top of the window when a new message arrives
struct MessageNotificationBanner: View {
    let message: LatestUnreadMessage
    let onView: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Message icon
            Image(systemName: "message.fill")
                .font(.system(size: 16))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Color.blue)
                .clipShape(Circle())

            // Message content
            VStack(alignment: .leading, spacing: 2) {
                Text(message.senderName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.primary)

                Text(message.message)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            // Actions
            HStack(spacing: 8) {
                Button(action: onView) {
                    Text("View")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.blue)
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 24, height: 24)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(4)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(NSColor.windowBackgroundColor))
                .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.top, 44) // Below title bar (32px) + spacing
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Chat icon button for the title bar
struct ChatIconButton: View {
    @ObservedObject var messagingState: MessagingState
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "message.fill")
                    .font(.system(size: 14))
                    .foregroundColor(isHovered ? Color(white: 0.2) : Color(white: 0.45))
                    .frame(width: 32, height: 28)
                    .background(isHovered ? Color(white: 0.88) : Color.clear)
                    .cornerRadius(4)

                // Unread badge
                if messagingState.unreadCount > 0 {
                    Text(messagingState.unreadCount > 9 ? "9+" : "\(messagingState.unreadCount)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Color.red)
                        .clipShape(Circle())
                        .offset(x: 6, y: -2)
                }
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
        .help("Messages" + (messagingState.unreadCount > 0 ? " (\(messagingState.unreadCount) unread)" : ""))
    }
}

#Preview("Notification Banner") {
    VStack {
        MessageNotificationBanner(
            message: LatestUnreadMessage(
                _id: "123",
                senderName: "John Smith (Manager)",
                message: "Try the ROI breakdown we practiced for price objections. The prospect seems hesitant about value.",
                createdAt: Date().timeIntervalSince1970 * 1000
            ),
            onView: {},
            onDismiss: {}
        )
        Spacer()
    }
    .frame(width: 400, height: 200)
}

// Note: ChatIconButton preview removed - requires MessagingState which can't be easily mocked in previews
