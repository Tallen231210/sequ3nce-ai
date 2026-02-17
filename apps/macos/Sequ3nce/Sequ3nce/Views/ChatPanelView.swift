//
//  ChatPanelView.swift
//  Sequ3nce
//
//  Chat panel for messaging between closers and managers
//

import SwiftUI

/// Chat panel view showing messages and allowing replies
struct ChatPanelView: View {
    @ObservedObject var messagingState: MessagingState
    @State private var messageText: String = ""
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Header
            ChatPanelHeader(
                onClose: { messagingState.closeChatPanel() }
            )

            Divider()

            // Messages
            if messagingState.messages.isEmpty {
                EmptyMessagesView()
            } else {
                MessagesListView(messages: messagingState.messages)
            }

            Divider()

            // Compose area
            ComposeMessageView(
                messageText: $messageText,
                isSending: messagingState.isSendingMessage,
                error: messagingState.sendError,
                onSend: sendMessage
            )
            .focused($isTextFieldFocused)
        }
        .frame(width: 340, height: 450)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear {
            isTextFieldFocused = true
        }
    }

    private func sendMessage() {
        let text = messageText
        messageText = ""
        Task {
            await messagingState.sendMessage(text)
        }
    }
}

// MARK: - Header

struct ChatPanelHeader: View {
    let onClose: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "message.fill")
                .font(.system(size: 14))
                .foregroundColor(.blue)

            Text("Team Messages")
                .font(.system(size: 14, weight: .semibold))

            Spacer()

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(NSColor.controlBackgroundColor))
    }
}

// MARK: - Empty State

struct EmptyMessagesView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "message")
                .font(.system(size: 36))
                .foregroundColor(.secondary.opacity(0.5))

            Text("No messages yet")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.secondary)

            Text("Messages from your manager will appear here")
                .font(.system(size: 12))
                .foregroundColor(.secondary.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Messages List

struct MessagesListView: View {
    let messages: [ChatMessage]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding(12)
            }
            .onChange(of: messages.count) {
                // Scroll to latest message
                if let lastMessage = messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastMessage.id, anchor: .bottom)
                    }
                }
            }
            .onAppear {
                // Scroll to latest message on appear
                if let lastMessage = messages.last {
                    proxy.scrollTo(lastMessage.id, anchor: .bottom)
                }
            }
        }
    }
}

// MARK: - Message Bubble

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isFromMe {
                Spacer(minLength: 40)
            }

            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 4) {
                // Sender name (only for messages from others)
                if !message.isFromMe {
                    Text(message.senderName)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }

                // Message text
                Text(message.message)
                    .font(.system(size: 13))
                    .foregroundColor(message.isFromMe ? .white : .primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(message.isFromMe ? Color.blue : Color(NSColor.controlBackgroundColor))
                    )

                // Timestamp
                Text(message.timeString)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary.opacity(0.8))
            }

            if !message.isFromMe {
                Spacer(minLength: 40)
            }
        }
    }
}

// MARK: - Compose Message

struct ComposeMessageView: View {
    @Binding var messageText: String
    let isSending: Bool
    let error: String?
    let onSend: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            // Error message
            if let error = error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
            }

            HStack(spacing: 8) {
                TextField("Type a reply...", text: $messageText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(NSColor.controlBackgroundColor))
                    )
                    .onSubmit {
                        if canSend {
                            onSend()
                        }
                    }

                Button(action: onSend) {
                    if isSending {
                        ProgressView()
                            .scaleEffect(0.7)
                            .frame(width: 32, height: 32)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 14))
                            .foregroundColor(canSend ? .white : .secondary)
                            .frame(width: 32, height: 32)
                            .background(canSend ? Color.blue : Color(NSColor.controlBackgroundColor))
                            .cornerRadius(8)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
        }
        .padding(12)
    }

    private var canSend: Bool {
        !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }
}

// MARK: - Inline Messages View (for sidebar tab)

/// Full-size messages view displayed inline in the main content area
struct InlineMessagesView: View {
    @ObservedObject var messagingState: MessagingState
    @State private var messageText: String = ""
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Team Messages")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.black)

                Spacer()
            }
            .padding(.horizontal, 32)
            .padding(.top, 24)
            .padding(.bottom, 16)

            // Messages area
            if messagingState.messages.isEmpty {
                VStack(spacing: 16) {
                    Spacer()

                    Image(systemName: "message")
                        .font(.system(size: 48))
                        .foregroundColor(Color(white: 0.75))

                    Text("No messages yet")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color(white: 0.5))

                    Text("Messages from your manager will appear here.\nYou can also send messages to your team.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.6))
                        .multilineTextAlignment(.center)

                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(messagingState.messages) { message in
                                InlineMessageBubble(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding(.horizontal, 32)
                        .padding(.vertical, 16)
                    }
                    .onChange(of: messagingState.messages.count) {
                        if let lastMessage = messagingState.messages.last {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                    .onAppear {
                        if let lastMessage = messagingState.messages.last {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Compose area
            HStack(spacing: 12) {
                TextField("Type a message...", text: $messageText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundColor(.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color(white: 0.97))
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(white: 0.9), lineWidth: 1)
                    )
                    .onSubmit {
                        if canSend { sendMessage() }
                    }
                    .focused($isTextFieldFocused)

                Button(action: sendMessage) {
                    if messagingState.isSendingMessage {
                        ProgressView()
                            .scaleEffect(0.7)
                            .frame(width: 40, height: 40)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 16))
                            .foregroundColor(canSend ? .white : Color(white: 0.6))
                            .frame(width: 40, height: 40)
                            .background(canSend ? Color.black : Color(white: 0.92))
                            .cornerRadius(10)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 16)

            // Error message
            if let error = messagingState.sendError {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            messagingState.openChatPanel()
            isTextFieldFocused = true
        }
        .onDisappear {
            messagingState.closeChatPanel()
        }
    }

    private var canSend: Bool {
        !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !messagingState.isSendingMessage
    }

    private func sendMessage() {
        let text = messageText
        messageText = ""
        Task {
            await messagingState.sendMessage(text)
        }
    }
}

/// Wider message bubble for the inline view
struct InlineMessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isFromMe {
                Spacer(minLength: 120)
            }

            VStack(alignment: message.isFromMe ? .trailing : .leading, spacing: 4) {
                if !message.isFromMe {
                    Text(message.senderName)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(white: 0.5))
                }

                Text(message.message)
                    .font(.system(size: 14))
                    .foregroundColor(message.isFromMe ? .white : .black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(message.isFromMe ? Color.black : Color(white: 0.95))
                    )

                Text(message.timeString)
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.6))
            }

            if !message.isFromMe {
                Spacer(minLength: 120)
            }
        }
    }
}

#Preview {
    ChatPanelView(messagingState: MessagingState())
}
