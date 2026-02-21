//
//  CallReviewView.swift
//  Sequ3nce
//
//  Full call review view — video player with comments panel.
//  Shows the recording, transcript, and timestamped manager comments.
//  Closer can add reply comments back to the manager.
//

import SwiftUI
import AVKit

// MARK: - Call Review View Model

@MainActor
class CallReviewViewModel: ObservableObject {
    @Published var callInfo: ReviewCallInfo?
    @Published var comments: [CallComment] = []
    @Published var transcriptSegments: [TranscriptSegment] = []
    @Published var isLoading = true
    @Published var isLoadingComments = true
    @Published var isLoadingTranscript = true
    @Published var error: String?
    @Published var newCommentText = ""
    @Published var isSendingComment = false
    @Published var replyingTo: CallComment?  // Comment being replied to

    private let convexService = ConvexService()

    @Published var commentError: String?

    func loadCallData(callId: String, closerId: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            comments = try await convexService.getCommentsForCall(callId: callId)
        } catch {
            print("[CallReviewVM] Failed to load comments: \(error)")
        }
        isLoadingComments = false

        do {
            transcriptSegments = try await convexService.getTranscriptSegments(callId: callId)
        } catch {
            print("[CallReviewVM] Failed to load transcript: \(error)")
        }
        isLoadingTranscript = false
    }

    func addComment(callId: String, closerId: String, closerName: String, currentTime: Double?) async {
        guard !newCommentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isSendingComment = true
        commentError = nil
        defer { isSendingComment = false }

        // If replying, use the parent comment's timestamp; otherwise use current video time
        let timestampSeconds = replyingTo?.timestampSeconds ?? currentTime
        let parentId = replyingTo?._id

        do {
            try await convexService.addCallComment(
                callId: callId,
                authorType: "closer",
                authorId: closerId,
                authorName: closerName,
                content: newCommentText.trimmingCharacters(in: .whitespacesAndNewlines),
                timestampSeconds: timestampSeconds,
                parentCommentId: parentId
            )
            // Refresh comments
            comments = try await convexService.getCommentsForCall(callId: callId)
            newCommentText = ""
            replyingTo = nil
        } catch {
            print("[CallReviewVM] Failed to add comment: \(error)")
            commentError = "Failed to send. Try again."
        }
    }
}

// MARK: - Review Call Info (loaded from call history data)

struct ReviewCallInfo {
    let callId: String
    let prospectName: String
    let recordingUrl: String?
    let hasVideo: Bool
    let date: Date
    let duration: TimeInterval
}

// MARK: - Call Review View

struct CallReviewView: View {
    @EnvironmentObject var appState: AppState
    let callId: String
    let onBack: () -> Void
    var sharedMoment: SharedMoment? = nil  // When set, show simplified moment view

    @StateObject private var viewModel = CallReviewViewModel()
    @State private var player: AVPlayer?
    @State private var currentTime: Double = 0
    @State private var duration: Double = 0
    @State private var isPlaying = false
    @State private var isMuted = false
    @State private var timeObserver: Any?

    // Call detail loaded from call history
    @State private var callDetail: CallHistoryItem?
    @State private var isLoadingCall = true

    private let convexService = ConvexService()
    private var isMomentView: Bool { sharedMoment != nil }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Button(action: {
                    cleanup()
                    onBack()
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12))
                        Text("Back")
                            .font(.system(size: 13))
                    }
                    .foregroundColor(Color(white: 0.5))
                }
                .buttonStyle(.plain)

                if let moment = sharedMoment {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(moment.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.black)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            if let closerName = moment.closerName {
                                Text(closerName)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(white: 0.5))
                            }
                            if let notes = moment.notes, !notes.isEmpty {
                                Text("·")
                                    .foregroundColor(Color(white: 0.5))
                                Text(notes)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(white: 0.5))
                                    .lineLimit(1)
                            }
                        }
                    }
                } else if let call = callDetail {
                    Text(call.prospectName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)

                    Text(call.date.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                } else {
                    Text("Call Review")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color(white: 0.99))

            Divider()

            if isLoadingCall || viewModel.isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Loading review...")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.5))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                if isMomentView {
                    // Simplified moment view — no comments panel
                    VStack(spacing: 0) {
                        if let _ = player {
                            videoPlayerSection
                        } else {
                            noVideoPlaceholder
                        }

                        Divider()

                        transcriptSection
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    // Full review — split layout with comments
                    HStack(spacing: 0) {
                        // Left: Video + Transcript (65%)
                        VStack(spacing: 0) {
                            if let _ = player {
                                videoPlayerSection
                            } else {
                                noVideoPlaceholder
                            }

                            Divider()

                            transcriptSection
                        }
                        .frame(maxWidth: .infinity)

                        Divider()

                        // Right: Comments (35%)
                        commentsPanel
                            .frame(width: 280)
                    }
                }
            }
        }
        .background(Color.white)
        .task {
            await loadCallDetail()
            if let closerId = appState.closerInfo?.closerId {
                await viewModel.loadCallData(callId: callId, closerId: closerId)
            }
        }
        .onDisappear {
            cleanup()
        }
    }

    // MARK: - Video Player Section

    private var videoPlayerSection: some View {
        VStack(spacing: 0) {
            // Video — no native controls
            if let avPlayer = player, callDetail?.hasVideo == true {
                NativeVideoPlayer(player: avPlayer, showsControls: false)
                    .frame(height: 260)
                    .onTapGesture { togglePlayPause() }
            } else if let avPlayer = player {
                NativeVideoPlayer(player: avPlayer, showsControls: false)
                    .frame(height: 60)
                    .onTapGesture { togglePlayPause() }
            }

            // Custom controls bar — play/pause + scrubber with dots + time
            HStack(spacing: 10) {
                // Play/Pause button
                Button(action: togglePlayPause) {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.plain)

                // Time (current)
                Text(formatTime(currentTime))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(white: 0.6))

                // Scrubber track with comment dots + moment highlight
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        // Track background
                        Capsule()
                            .fill(Color.white.opacity(0.2))
                            .frame(height: 3)

                        // Moment highlight range (yellow band on track)
                        if let moment = sharedMoment, duration > 0 {
                            let startFrac = moment.startSeconds / duration
                            let endFrac = moment.endSeconds / duration
                            let leftOffset = geo.size.width * startFrac
                            let rangeWidth = geo.size.width * (endFrac - startFrac)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.yellow.opacity(0.5))
                                .frame(width: max(4, rangeWidth), height: 6)
                                .position(x: leftOffset + rangeWidth / 2, y: geo.size.height / 2)
                        }

                        // Progress fill
                        Capsule()
                            .fill(Color.white.opacity(0.8))
                            .frame(width: duration > 0 ? geo.size.width * (currentTime / duration) : 0, height: 3)

                        // Comment dots (only in full review mode)
                        if !isMomentView {
                            ForEach(viewModel.comments.filter { $0.timestampSeconds != nil }) { comment in
                                let x = duration > 0 ? geo.size.width * ((comment.timestampSeconds ?? 0) / duration) : 0
                                Circle()
                                    .fill(Color.blue)
                                    .frame(width: 8, height: 8)
                                    .overlay(
                                        Circle()
                                            .stroke(Color.white, lineWidth: 1.5)
                                    )
                                    .shadow(color: .black.opacity(0.3), radius: 1, y: 1)
                                    .position(x: x, y: geo.size.height / 2)
                                    .onTapGesture {
                                        seekTo(comment.timestampSeconds ?? 0)
                                    }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let fraction = max(0, min(1, location.x / geo.size.width))
                        seekTo(duration * fraction)
                    }
                }
                .frame(height: 14)

                // Time (total)
                Text(formatTime(duration))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(white: 0.6))

                // Volume toggle
                Button(action: toggleMute) {
                    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.6))
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(red: 0.12, green: 0.12, blue: 0.13))
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var noVideoPlaceholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "video.slash")
                .font(.system(size: 24))
                .foregroundColor(Color(white: 0.6))
            Text("No recording available")
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))
        }
        .frame(height: 200)
        .frame(maxWidth: .infinity)
        .background(Color(white: 0.97))
    }

    // MARK: - Transcript Section

    private var transcriptSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            transcriptHeader
            transcriptContent
        }
        .frame(maxHeight: .infinity)
    }

    private var transcriptHeader: some View {
        Text("TRANSCRIPT")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Color(white: 0.5))
            .tracking(0.5)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
    }

    @ViewBuilder
    private var transcriptContent: some View {
        if viewModel.isLoadingTranscript {
            HStack(spacing: 8) {
                ProgressView().scaleEffect(0.7)
                Text("Loading transcript...")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else if viewModel.transcriptSegments.isEmpty {
            Text("No transcript available.")
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))
                .italic()
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            transcriptList
        }
    }

    private var transcriptList: some View {
        ScrollView {
            VStack(spacing: 2) {
                ForEach(viewModel.transcriptSegments) { segment in
                    transcriptRow(segment)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func transcriptRow(_ segment: TranscriptSegment) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(segment.displaySpeaker)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(segment.isCloser ? Color.blue : Color.green)
                .frame(width: 55, alignment: .trailing)

            Text(segment.text)
                .font(.system(size: 12))
                .foregroundColor(Color(white: 0.25))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 12)
        .background(isSegmentCurrent(segment) ? Color.yellow.opacity(0.15) : Color.clear)
        .cornerRadius(4)
        .id(segment.id)
        .onTapGesture {
            seekTo(segment.timestamp)
        }
    }

    private func isSegmentCurrent(_ segment: TranscriptSegment) -> Bool {
        let start = segment.timestamp
        let end = start + 5 // Approximate segment duration
        return currentTime >= start && currentTime < end
    }

    // MARK: - Comments Panel

    private var commentsPanel: some View {
        VStack(spacing: 0) {
            commentsPanelHeader
            Divider()
            commentsList
            Divider()
            commentInputArea
        }
    }

    private var commentsPanelHeader: some View {
        HStack {
            Text("COMMENTS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(white: 0.5))
                .tracking(0.5)

            Spacer()

            Text("\(viewModel.comments.count)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(white: 0.5))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color(white: 0.93))
                .cornerRadius(4)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(white: 0.98))
    }

    @ViewBuilder
    private var commentsList: some View {
        if viewModel.isLoadingComments {
            VStack {
                ProgressView().scaleEffect(0.8)
                Text("Loading...")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.comments.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "bubble.left")
                    .font(.system(size: 20))
                    .foregroundColor(Color(white: 0.7))
                Text("No comments yet")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    // Group: top-level comments with their replies nested underneath
                    let topLevel = viewModel.comments.filter { $0.parentCommentId == nil }
                    let replyMap = Dictionary(grouping: viewModel.comments.filter { $0.parentCommentId != nil },
                                              by: { $0.parentCommentId! })

                    ForEach(Array(topLevel.enumerated()), id: \.element.id) { index, comment in
                        // Parent comment
                        CommentBubble(
                            comment: comment,
                            isReply: false,
                            showReplyButton: comment.authorType == "manager",
                            onTimestampTap: {
                                if let ts = comment.timestampSeconds {
                                    seekTo(ts)
                                }
                            },
                            onReply: {
                                viewModel.replyingTo = comment
                            }
                        )
                        .padding(.top, index == 0 ? 0 : 8)

                        // Replies to this comment
                        if let replies = replyMap[comment._id] {
                            ForEach(replies) { reply in
                                CommentBubble(
                                    comment: reply,
                                    isReply: true,
                                    showReplyButton: false,
                                    onTimestampTap: {
                                        if let ts = reply.timestampSeconds {
                                            seekTo(ts)
                                        }
                                    },
                                    onReply: nil
                                )
                                .padding(.leading, 24)
                                .padding(.top, 4)
                            }
                        }
                    }
                }
                .padding(10)
            }
        }
    }

    private var commentInputArea: some View {
        VStack(spacing: 8) {
            if let errorMsg = viewModel.commentError {
                Text(errorMsg)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
            }

            // Replying-to indicator
            if let replyTarget = viewModel.replyingTo {
                HStack(spacing: 6) {
                    Image(systemName: "arrowshape.turn.up.left.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.orange)
                    Text("Replying to \(replyTarget.authorName)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(white: 0.4))
                    Spacer()
                    Button(action: { viewModel.replyingTo = nil }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(Color.orange.opacity(0.08))
                .cornerRadius(6)
            }

            HStack(spacing: 8) {
                TextField(
                    viewModel.replyingTo != nil ? "Write a reply..." : "Add a comment...",
                    text: $viewModel.newCommentText,
                    axis: .vertical
                )
                    .font(.system(size: 12))
                    .textFieldStyle(.plain)
                    .lineLimit(1...3)
                    .onChange(of: viewModel.newCommentText) { _, _ in
                        if viewModel.commentError != nil {
                            viewModel.commentError = nil
                        }
                    }

                sendCommentButton
            }
        }
        .padding(12)
        .background(Color(white: 0.98))
    }

    private var sendCommentButton: some View {
        let isEmpty = viewModel.newCommentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return Button(action: {
            guard let closerId = appState.closerInfo?.closerId,
                  let closerName = appState.closerInfo?.name else { return }
            Task {
                await viewModel.addComment(
                    callId: callId,
                    closerId: closerId,
                    closerName: closerName,
                    currentTime: currentTime
                )
            }
        }) {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 20))
                .foregroundColor(isEmpty ? Color(white: 0.8) : Color.black)
        }
        .buttonStyle(.plain)
        .disabled(isEmpty || viewModel.isSendingComment)
    }

    // MARK: - Helpers

    private func loadCallDetail() async {
        guard let closerId = appState.closerInfo?.closerId else {
            isLoadingCall = false
            return
        }

        do {
            let calls = try await convexService.getCallHistory(closerId: closerId, limit: 100)
            for callData in calls {
                guard let id = callData["_id"] as? String, id == callId else { continue }

                let prospectName = callData["prospectName"] as? String ?? "Unknown"
                let recordingUrl = callData["recordingUrl"] as? String
                let recordingType = callData["recordingType"] as? String ?? "audio"
                let durationSec = callData["duration"] as? Double ?? 0
                let createdAt = callData["_creationTime"] as? Double ?? 0

                callDetail = CallHistoryItem(
                    id: id,
                    prospectName: prospectName,
                    date: Date(timeIntervalSince1970: createdAt / 1000),
                    duration: durationSec,
                    outcome: callData["outcome"] as? String,
                    closerTalkPercent: callData["closerTalkPercent"] as? Double,
                    cashCollected: callData["cashCollected"] as? Double,
                    hasVideo: recordingType == "video",
                    recordingType: recordingType,
                    recordingUrl: recordingUrl,
                    summary: callData["summary"] as? String,
                    transcriptText: callData["transcriptText"] as? String
                )

                // Refresh recording URL (Recall.ai signed URLs expire after ~24h)
                var videoUrlStr = recordingUrl
                if recordingUrl != nil {
                    do {
                        if let freshUrl = try await convexService.refreshRecordingUrl(callId: callId) {
                            videoUrlStr = freshUrl
                        }
                    } catch {
                        print("[CallReviewView] Failed to refresh recording URL, using stored: \(error)")
                    }
                }

                // Set up player
                if let urlStr = videoUrlStr, let url = URL(string: urlStr) {
                    let avPlayer = AVPlayer(url: url)
                    self.player = avPlayer
                    setupTimeObserver(for: avPlayer)

                    // Get duration via KVO (wait for playerItem to load)
                    if let item = avPlayer.currentItem {
                        let dur: CMTime = try await item.asset.load(.duration)
                        self.duration = dur.seconds.isNaN ? 0 : dur.seconds
                    }

                    // Auto-seek to moment start time
                    if let moment = sharedMoment {
                        seekTo(moment.startSeconds)
                    }
                }

                break
            }
        } catch {
            print("[CallReviewView] Failed to load call detail: \(error)")
        }

        isLoadingCall = false
    }

    private func setupTimeObserver(for avPlayer: AVPlayer) {
        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [self] time in
            Task { @MainActor in
                self.currentTime = time.seconds.isNaN ? 0 : time.seconds
                self.isPlaying = avPlayer.rate > 0
            }
        }
    }

    private func togglePlayPause() {
        guard let avPlayer = player else { return }
        if avPlayer.rate > 0 {
            avPlayer.pause()
        } else {
            avPlayer.play()
        }
    }

    private func toggleMute() {
        guard let avPlayer = player else { return }
        avPlayer.isMuted.toggle()
        isMuted = avPlayer.isMuted
    }

    private func seekTo(_ seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
        currentTime = seconds
    }

    private func cleanup() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
    }

    private func formatTime(_ seconds: Double) -> String {
        let totalSeconds = Int(max(0, seconds))
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Comment Bubble

struct CommentBubble: View {
    let comment: CallComment
    var isReply: Bool = false
    var showReplyButton: Bool = false
    let onTimestampTap: () -> Void
    var onReply: (() -> Void)?

    private var isManager: Bool { comment.authorType == "manager" }
    private var authorColor: Color { isManager ? Color.orange : Color.blue }
    private var bgColor: Color { isManager ? Color.orange.opacity(0.06) : Color.blue.opacity(0.06) }
    private var borderColor: Color { isManager ? Color.orange.opacity(0.15) : Color.blue.opacity(0.15) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            commentHeader
            commentBody

            if showReplyButton {
                HStack {
                    Spacer()
                    Button(action: { onReply?() }) {
                        HStack(spacing: 3) {
                            Image(systemName: "arrowshape.turn.up.left")
                                .font(.system(size: 9))
                            Text("Reply")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(Color(white: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(isReply ? 8 : 10)
        .background(bgColor)
        .cornerRadius(isReply ? 6 : 8)
        .overlay(
            RoundedRectangle(cornerRadius: isReply ? 6 : 8)
                .stroke(borderColor, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTimestampTap()
        }
    }

    private var commentHeader: some View {
        HStack(spacing: 6) {
            if isReply {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 8))
                    .foregroundColor(authorColor.opacity(0.5))
            }

            Text(comment.authorName)
                .font(.system(size: isReply ? 10 : 11, weight: .semibold))
                .foregroundColor(authorColor)

            if let ts = comment.timestampSeconds, !isReply {
                Button(action: onTimestampTap) {
                    Text(formatTime(ts))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.blue)
                        .underline()
                }
                .buttonStyle(.plain)
            }

            Spacer()

            Text(formatRelativeDate(comment.createdAt))
                .font(.system(size: isReply ? 9 : 10))
                .foregroundColor(Color(white: 0.6))
        }
    }

    private var commentBody: some View {
        Text(comment.content)
            .font(.system(size: isReply ? 11 : 12))
            .foregroundColor(Color(white: 0.2))
            .fixedSize(horizontal: false, vertical: true)
    }

    private func formatTime(_ seconds: Double) -> String {
        let totalSeconds = Int(max(0, seconds))
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatRelativeDate(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
