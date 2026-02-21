//
//  CoachingView.swift
//  Sequ3nce
//
//  Coaching tab — manager feedback and shared moments for closers.
//  Replaces the old TrainingView with two sections:
//    1. "Your Feedback" — calls with manager comments
//    2. "Shared with You" — team shared moments
//

import SwiftUI
import AVKit

// MARK: - Coaching View Model

@MainActor
class CoachingViewModel: ObservableObject {
    @Published var feedbackCalls: [FeedbackCall] = []
    @Published var sharedMoments: [SharedMoment] = []
    @Published var isLoadingFeedback = false
    @Published var isLoadingMoments = false
    @Published var error: String?

    private let convexService = ConvexService()

    func loadFeedback(closerId: String) async {
        isLoadingFeedback = true
        error = nil
        defer { isLoadingFeedback = false }

        do {
            feedbackCalls = try await convexService.getFeedbackForCloser(closerId: closerId)
        } catch {
            self.error = "Failed to load feedback"
            print("[CoachingVM] Failed to load feedback: \(error)")
        }
    }

    func loadSharedMoments(closerId: String) async {
        isLoadingMoments = true
        defer { isLoadingMoments = false }

        do {
            sharedMoments = try await convexService.getSharedMoments(closerId: closerId)
        } catch {
            self.error = "Failed to load shared moments"
            print("[CoachingVM] Failed to load shared moments: \(error)")
        }
    }

    func markFeedbackRead(callId: String, closerId: String) async {
        do {
            try await convexService.markFeedbackRead(callId: callId, closerId: closerId)
            // Update local state
            if let index = feedbackCalls.firstIndex(where: { $0.callId == callId }) {
                feedbackCalls[index].isUnread = false
            }
        } catch {
            print("[CoachingVM] Failed to mark feedback read: \(error)")
        }
    }
}

// MARK: - Coaching View

struct CoachingView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = CoachingViewModel()
    @State private var selectedTab = 0  // 0 = Your Feedback, 1 = Shared with You
    @State private var selectedCallId: String?

    var body: some View {
        Group {
            if appState.closerInfo == nil {
                notLoggedInView
            } else if let callId = selectedCallId {
                // Show the full review view for a specific call
                CallReviewView(
                    callId: callId,
                    onBack: { selectedCallId = nil }
                )
                .environmentObject(appState)
            } else {
                mainContent
            }
        }
        .frame(minWidth: 600, minHeight: 400)
        .preferredColorScheme(.light)
        .task {
            if let closerId = appState.closerInfo?.closerId {
                async let feedback: () = viewModel.loadFeedback(closerId: closerId)
                async let moments: () = viewModel.loadSharedMoments(closerId: closerId)
                _ = await (feedback, moments)
            }
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            // Header with segmented control
            VStack(spacing: 16) {
                HStack {
                    Text("Coaching")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.black)
                    Spacer()

                    // Refresh button
                    Button(action: {
                        if let closerId = appState.closerInfo?.closerId {
                            Task {
                                async let feedback: () = viewModel.loadFeedback(closerId: closerId)
                                async let moments: () = viewModel.loadSharedMoments(closerId: closerId)
                                _ = await (feedback, moments)
                            }
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .buttonStyle(.plain)
                }

                // Segmented control
                HStack(spacing: 0) {
                    segmentButton("Your Feedback", index: 0, count: viewModel.feedbackCalls.filter { $0.isUnread }.count)
                    segmentButton("Shared with You", index: 1, count: 0)
                }
                .background(Color(white: 0.93))
                .cornerRadius(8)
            }
            .padding(.horizontal, 32)
            .padding(.top, 24)
            .padding(.bottom, 16)
            .background(Color.white)

            Divider()

            // Tab content
            if selectedTab == 0 {
                feedbackTab
            } else {
                sharedMomentsTab
            }
        }
        .background(Color.white)
    }

    private func segmentButton(_ title: String, index: Int, count: Int) -> some View {
        Button(action: { withAnimation(.easeInOut(duration: 0.15)) { selectedTab = index } }) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 13, weight: selectedTab == index ? .semibold : .regular))
                    .foregroundColor(selectedTab == index ? .black : Color(white: 0.5))

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(Color.red)
                        .cornerRadius(9)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(selectedTab == index ? Color.white : Color.clear)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
        .padding(2)
    }

    // MARK: - Your Feedback Tab

    private var feedbackTab: some View {
        Group {
            if viewModel.isLoadingFeedback {
                loadingView("Loading feedback...")
            } else if let error = viewModel.error {
                errorView(error)
            } else if viewModel.feedbackCalls.isEmpty {
                emptyFeedbackView
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(viewModel.feedbackCalls) { call in
                            FeedbackCallRow(call: call) {
                                // Mark as read and navigate
                                if call.isUnread, let closerId = appState.closerInfo?.closerId {
                                    Task {
                                        await viewModel.markFeedbackRead(callId: call.callId, closerId: closerId)
                                    }
                                }
                                selectedCallId = call.callId
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    // MARK: - Shared Moments Tab

    private var sharedMomentsTab: some View {
        Group {
            if viewModel.isLoadingMoments {
                loadingView("Loading shared moments...")
            } else if viewModel.sharedMoments.isEmpty {
                emptyMomentsView
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(viewModel.sharedMoments) { moment in
                            SharedMomentRow(moment: moment) {
                                // Navigate to the review view for this call
                                selectedCallId = moment.callId
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    // MARK: - Shared Views

    private func loadingView(_ text: String) -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text(text)
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 36))
                .foregroundColor(Color(red: 0.86, green: 0.15, blue: 0.15))
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(Color(red: 0.86, green: 0.15, blue: 0.15))
            Button(action: {
                if let closerId = appState.closerInfo?.closerId {
                    Task { await viewModel.loadFeedback(closerId: closerId) }
                }
            }) {
                Text("Try Again")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.black))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyFeedbackView: some View {
        VStack(spacing: 16) {
            Image(systemName: "text.bubble")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.75))
            Text("No Feedback Yet")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.black)
            Text("When your manager reviews your calls and leaves comments, they'll appear here.")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.5))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyMomentsView: some View {
        VStack(spacing: 16) {
            Image(systemName: "star")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.75))
            Text("Nothing Shared Yet")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.black)
            Text("When your manager shares standout call moments with the team, they'll appear here.")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.5))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var notLoggedInView: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.5))
            Text("Not Logged In")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.black)
            Text("Please log in to access coaching feedback.")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Feedback Call Row

struct FeedbackCallRow: View {
    let call: FeedbackCall
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                // Unread indicator
                Circle()
                    .fill(call.isUnread ? Color.red : Color.clear)
                    .frame(width: 8, height: 8)

                // Call info
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(call.prospectName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.black)

                        Text(formatDate(call.lastCommentAt))
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))
                    }

                    HStack(spacing: 6) {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 10))
                            .foregroundColor(Color(white: 0.5))

                        Text("\(call.commentCount) comment\(call.commentCount != 1 ? "s" : "") from manager")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))
                    }

                    if let preview = call.latestCommentPreview, !preview.isEmpty {
                        Text(preview)
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.4))
                            .lineLimit(1)
                            .italic()
                    }
                }

                Spacer()

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(white: 0.7))
            }
            .padding(14)
            .background(isHovered ? Color(white: 0.96) : Color(white: 0.98))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(call.isUnread ? Color.red.opacity(0.3) : Color(white: 0.9), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.1)) { isHovered = hovering }
        }
    }

    private func formatDate(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Shared Moment Row

struct SharedMomentRow: View {
    let moment: SharedMoment
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                // Title
                Text(moment.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)

                // Details
                HStack(spacing: 12) {
                    if let closerName = moment.closerName {
                        Label(closerName, systemImage: "person.fill")
                    }

                    Label(formatTimeRange(start: moment.startSeconds, end: moment.endSeconds), systemImage: "clock")

                    Label(formatDate(moment.createdAt), systemImage: "calendar")
                }
                .font(.system(size: 11))
                .foregroundColor(Color(white: 0.5))

                // Notes
                if let notes = moment.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.4))
                        .lineLimit(2)
                        .italic()
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isHovered ? Color(white: 0.96) : Color(white: 0.98))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color(white: 0.9), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.1)) { isHovered = hovering }
        }
    }

    private func formatTimeRange(start: Double, end: Double) -> String {
        let startStr = formatSeconds(start)
        let endStr = formatSeconds(end)
        return "\(startStr) - \(endStr)"
    }

    private func formatSeconds(_ totalSeconds: Double) -> String {
        let mins = Int(totalSeconds) / 60
        let secs = Int(totalSeconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatDate(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

#Preview {
    CoachingView()
        .environmentObject(AppState())
        .frame(width: 800, height: 600)
}
