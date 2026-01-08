//
//  TrainingView.swift
//  Sequ3nce
//
//  Training window - video player with playlists
//

import SwiftUI
import AVKit

// MARK: - Training View Model

@MainActor
class TrainingViewModel: ObservableObject {
    @Published var playlists: [TrainingPlaylist] = []
    @Published var selectedPlaylist: TrainingPlaylistWithItems?
    @Published var isLoading = false
    @Published var error: String?
    @Published var currentIndex = 0

    private let convexService = ConvexService()

    func loadPlaylists(closerId: String) async {
        isLoading = true
        error = nil

        do {
            playlists = try await convexService.getAssignedPlaylists(closerId: closerId)
            isLoading = false
        } catch {
            self.error = "Failed to load playlists"
            isLoading = false
        }
    }

    func selectPlaylist(_ playlist: TrainingPlaylist, closerId: String) async {
        isLoading = true
        error = nil
        currentIndex = 0

        do {
            selectedPlaylist = try await convexService.getPlaylistDetails(playlistId: playlist._id, closerId: closerId)
            isLoading = false
        } catch {
            self.error = "Failed to load playlist"
            isLoading = false
        }
    }

    func goBack() {
        selectedPlaylist = nil
        currentIndex = 0
    }

    func nextClip() {
        guard let playlist = selectedPlaylist else { return }
        if currentIndex < playlist.items.count - 1 {
            currentIndex += 1
        }
    }

    func previousClip() {
        if currentIndex > 0 {
            currentIndex -= 1
        }
    }

    var currentItem: TrainingPlaylistItem? {
        guard let playlist = selectedPlaylist,
              currentIndex < playlist.items.count else {
            return nil
        }
        return playlist.items[currentIndex]
    }
}

// MARK: - Training View

struct TrainingView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = TrainingViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(error)
            } else if appState.closerInfo == nil {
                notLoggedInView
            } else if viewModel.selectedPlaylist != nil {
                TrainingPlayerView(viewModel: viewModel)
            } else {
                PlaylistListView(viewModel: viewModel, closerId: appState.closerInfo?.closerId ?? "")
            }
        }
        .frame(minWidth: 600, minHeight: 400)
        .preferredColorScheme(.light)
        .task {
            if let closerId = appState.closerInfo?.closerId {
                await viewModel.loadPlaylists(closerId: closerId)
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading...")
                .font(.system(size: 14))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.red)
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(.red)
            Button("Try Again") {
                if let closerId = appState.closerInfo?.closerId {
                    Task {
                        await viewModel.loadPlaylists(closerId: closerId)
                    }
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var notLoggedInView: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundColor(.gray)
            Text("Not Logged In")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.black)
            Text("Please log in to access your training playlists.")
                .font(.system(size: 14))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Playlist List View

struct PlaylistListView: View {
    @ObservedObject var viewModel: TrainingViewModel
    let closerId: String

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Your Training Playlists")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.black)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(Color(white: 0.97))

            Divider()

            if viewModel.playlists.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(viewModel.playlists) { playlist in
                            PlaylistCard(playlist: playlist) {
                                Task {
                                    await viewModel.selectPlaylist(playlist, closerId: closerId)
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .background(Color.white)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "music.note.list")
                .font(.system(size: 48))
                .foregroundColor(.gray)
            Text("No Training Playlists")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.black)
            Text("Your manager hasn't assigned any training playlists to you yet. Check back later!")
                .font(.system(size: 14))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Playlist Card

struct PlaylistCard: View {
    let playlist: TrainingPlaylist
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Text(playlist.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.black)

                if let description = playlist.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                }

                HStack(spacing: 16) {
                    Label("\(playlist.itemCount) clip\(playlist.itemCount != 1 ? "s" : "")", systemImage: "music.note.list")
                    Label(formatDuration(playlist.totalDuration), systemImage: "clock")
                    Label("Assigned \(formatDate(playlist.assignedAt))", systemImage: "calendar")
                }
                .font(.system(size: 11))
                .foregroundColor(.gray)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.gray.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func formatDuration(_ seconds: Double) -> String {
        if seconds < 60 {
            return "\(Int(seconds))s"
        }
        let mins = Int(seconds / 60)
        let secs = Int(seconds.truncatingRemainder(dividingBy: 60))
        if secs == 0 {
            return "\(mins)m"
        }
        return "\(mins)m \(secs)s"
    }

    private func formatDate(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

// MARK: - Training Player View

struct TrainingPlayerView: View {
    @ObservedObject var viewModel: TrainingViewModel
    @StateObject private var audioPlayer = AudioPlayerViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            Divider()

            // Main content
            HStack(spacing: 0) {
                // Player and transcript
                VStack(spacing: 0) {
                    if let item = viewModel.currentItem {
                        // Audio controls
                        audioControlsView(item: item)

                        Divider()

                        // Transcript
                        transcriptView(item: item)

                        // Coaching notes
                        if let notes = item.highlight.notes, !notes.isEmpty {
                            Divider()
                            coachingNotesView(notes: notes)
                        }
                    } else {
                        Text("No clips in this playlist")
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity)

                Divider()

                // Playlist sidebar
                playlistSidebar
            }
        }
        .background(Color.white)
        .onChange(of: viewModel.currentIndex) { _, _ in
            if let item = viewModel.currentItem {
                audioPlayer.loadAudio(
                    url: item.highlight.recordingUrl,
                    startTime: item.highlight.startTimestamp,
                    endTime: item.highlight.endTimestamp
                )
            }
        }
        .onAppear {
            if let item = viewModel.currentItem {
                audioPlayer.loadAudio(
                    url: item.highlight.recordingUrl,
                    startTime: item.highlight.startTimestamp,
                    endTime: item.highlight.endTimestamp
                )
            }
        }
        .onDisappear {
            audioPlayer.stop()
        }
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: { viewModel.goBack() }) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12))
                    Text(viewModel.selectedPlaylist?.name ?? "Back")
                        .font(.system(size: 13))
                }
                .foregroundColor(.gray)
            }
            .buttonStyle(.plain)

            if let item = viewModel.currentItem {
                Text(item.highlight.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.black)

                HStack(spacing: 8) {
                    categoryBadge(category: item.highlight.category)
                    Text("by \(item.highlight.closerName)")
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
    }

    private func audioControlsView(item: TrainingPlaylistItem) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 16) {
                // Previous button
                Button(action: { viewModel.previousClip() }) {
                    Image(systemName: "backward.end.fill")
                        .font(.system(size: 16))
                        .foregroundColor(viewModel.currentIndex > 0 ? .black : .gray.opacity(0.3))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.currentIndex == 0)

                // Play/Pause button
                Button(action: { audioPlayer.togglePlayPause() }) {
                    ZStack {
                        Circle()
                            .fill(Color.black)
                            .frame(width: 48, height: 48)

                        if audioPlayer.isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 18))
                                .foregroundColor(.white)
                                .offset(x: audioPlayer.isPlaying ? 0 : 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(audioPlayer.hasError || item.highlight.recordingUrl == nil)

                // Next button
                Button(action: { viewModel.nextClip() }) {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 16))
                        .foregroundColor(viewModel.currentIndex < (viewModel.selectedPlaylist?.items.count ?? 1) - 1 ? .black : .gray.opacity(0.3))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.currentIndex >= (viewModel.selectedPlaylist?.items.count ?? 1) - 1)

                // Progress bar
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(Color.gray.opacity(0.2))
                                .frame(height: 4)
                                .cornerRadius(2)

                            Rectangle()
                                .fill(Color.black)
                                .frame(width: geo.size.width * audioPlayer.progress, height: 4)
                                .cornerRadius(2)
                        }
                    }
                    .frame(height: 4)

                    HStack {
                        Text(formatTime(audioPlayer.currentTime))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                        Spacer()
                        Text(formatTime(item.highlight.endTimestamp))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                    }
                }
            }

            if audioPlayer.hasError {
                Text("Unable to load audio. Please try again.")
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            } else if item.highlight.recordingUrl == nil {
                Text("No audio available for this clip")
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
            }
        }
        .padding(16)
    }

    private func transcriptView(item: TrainingPlaylistItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                let segments = parseTranscript(item.highlight.transcriptText)

                if segments.isEmpty {
                    Text(item.highlight.transcriptText)
                        .font(.system(size: 13))
                        .foregroundColor(.black)
                } else {
                    ForEach(Array(segments.enumerated()), id: \.offset) { index, segment in
                        HStack(alignment: .top, spacing: 8) {
                            Text("[\(formatTime(segment.timestamp))]")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.gray)

                            Text(segment.speaker + ":")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(segment.speaker == "Closer" ? .blue : .green)

                            Text(segment.text)
                                .font(.system(size: 13))
                                .foregroundColor(.black)
                        }
                        .padding(8)
                        .background(
                            isSegmentActive(segment, currentTime: audioPlayer.currentTime) && audioPlayer.isPlaying
                                ? Color.yellow.opacity(0.2)
                                : Color.clear
                        )
                        .cornerRadius(4)
                    }
                }
            }
            .padding(16)
        }
    }

    private func coachingNotesView(notes: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Coaching Notes")
                .font(.system(size: 11))
                .foregroundColor(.gray)
            Text(notes)
                .font(.system(size: 13))
                .foregroundColor(.black)
        }
        .padding(16)
        .background(Color(white: 0.97))
    }

    private var playlistSidebar: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Clip \(viewModel.currentIndex + 1) of \(viewModel.selectedPlaylist?.items.count ?? 0)")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                Spacer()
            }
            .padding(12)
            .background(Color(white: 0.97))

            Divider()

            // Clip list
            ScrollView {
                VStack(spacing: 4) {
                    ForEach(Array((viewModel.selectedPlaylist?.items ?? []).enumerated()), id: \.element.id) { index, item in
                        Button(action: { viewModel.currentIndex = index }) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.highlight.title)
                                    .font(.system(size: 12, weight: index == viewModel.currentIndex ? .semibold : .regular))
                                    .foregroundColor(.black)
                                    .lineLimit(1)

                                Text(categoryLabel(item.highlight.category))
                                    .font(.system(size: 10))
                                    .foregroundColor(.gray)
                            }
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(index == viewModel.currentIndex ? Color.gray.opacity(0.2) : Color.clear)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(8)
            }
        }
        .frame(width: 200)
        .background(Color(white: 0.97))
    }

    private func categoryBadge(category: String) -> some View {
        let (bg, fg, label) = categoryStyle(category)
        return Text(label)
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(bg)
            .cornerRadius(4)
    }

    private func categoryStyle(_ category: String) -> (Color, Color, String) {
        switch category {
        case "objection_handling":
            return (Color.orange.opacity(0.2), Color.orange, "Objection Handling")
        case "pitch":
            return (Color.blue.opacity(0.2), Color.blue, "Pitch")
        case "close":
            return (Color.green.opacity(0.2), Color.green, "Close")
        case "pain_discovery":
            return (Color.purple.opacity(0.2), Color.purple, "Pain Discovery")
        default:
            return (Color.gray.opacity(0.2), Color.gray, category)
        }
    }

    private func categoryLabel(_ category: String) -> String {
        categoryStyle(category).2
    }

    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds / 60)
        let secs = Int(seconds.truncatingRemainder(dividingBy: 60))
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Transcript Parsing

struct TrainingTranscriptSegment {
    let timestamp: Double
    let speaker: String
    let text: String
}

func parseTranscript(_ text: String) -> [TrainingTranscriptSegment] {
    var segments: [TrainingTranscriptSegment] = []

    // Match patterns like "[5:55] Prospect:" or "[6:00] Closer:"
    let pattern = #"\[(\d+):(\d+)\]\s*(Prospect|Closer):\s*(?:\[(?:Prospect|Closer)\]:\s*)?(.+?)(?=\[|\n\n|$)"#

    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else {
        return []
    }

    let range = NSRange(text.startIndex..., in: text)
    let matches = regex.matches(in: text, options: [], range: range)

    for match in matches {
        guard match.numberOfRanges >= 5,
              let minutesRange = Range(match.range(at: 1), in: text),
              let secondsRange = Range(match.range(at: 2), in: text),
              let speakerRange = Range(match.range(at: 3), in: text),
              let textRange = Range(match.range(at: 4), in: text) else {
            continue
        }

        let minutes = Double(text[minutesRange]) ?? 0
        let seconds = Double(text[secondsRange]) ?? 0
        let timestamp = minutes * 60 + seconds
        let speaker = String(text[speakerRange])
        let segmentText = String(text[textRange]).trimmingCharacters(in: .whitespacesAndNewlines)

        if !segmentText.isEmpty {
            segments.append(TrainingTranscriptSegment(timestamp: timestamp, speaker: speaker, text: segmentText))
        }
    }

    return segments
}

func isSegmentActive(_ segment: TrainingTranscriptSegment, currentTime: Double) -> Bool {
    segment.timestamp <= currentTime
}

// MARK: - Audio Player View Model

@MainActor
class AudioPlayerViewModel: ObservableObject {
    @Published var isPlaying = false
    @Published var isLoading = false
    @Published var hasError = false
    @Published var currentTime: Double = 0
    @Published var progress: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var startTime: Double = 0
    private var endTime: Double = 0

    func loadAudio(url: String?, startTime: Double, endTime: Double) {
        stop()

        self.startTime = startTime
        self.endTime = endTime
        self.currentTime = startTime
        self.progress = 0
        self.hasError = false

        guard let urlString = url, let audioURL = URL(string: urlString) else {
            return
        }

        isLoading = true

        let playerItem = AVPlayerItem(url: audioURL)
        player = AVPlayer(playerItem: playerItem)

        // Seek to start time
        player?.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))

        // Add time observer - capture values to avoid actor isolation issues
        let startT = self.startTime
        let endT = self.endTime
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let currentSeconds = time.seconds

            Task { @MainActor in
                guard let self = self else { return }
                self.currentTime = currentSeconds

                let duration = endT - startT
                if duration > 0 {
                    self.progress = min(1, max(0, (currentSeconds - startT) / duration))
                }

                // Stop at end time
                if currentSeconds >= endT {
                    self.pause()
                }
            }
        }

        // Listen for ready to play
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemNewAccessLogEntry,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isLoading = false
            }
        }

        // Listen for errors
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.hasError = true
                self?.isLoading = false
            }
        }

        // Set loading to false after a timeout
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            self.isLoading = false
        }
    }

    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    func play() {
        guard let player = player else { return }

        // If at or past end, reset to start
        if currentTime >= endTime {
            player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
            currentTime = startTime
            progress = 0
        }

        player.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func stop() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
        isPlaying = false
        isLoading = false
    }
}

#Preview {
    TrainingView()
        .environmentObject(AppState())
        .frame(width: 800, height: 600)
}
