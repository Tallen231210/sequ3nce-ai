//
//  CallHistoryView.swift
//  Sequ3nce
//
//  List of completed calls for the closer.
//  Shows call cards with outcome, duration, talk ratio, and cash collected.
//

import SwiftUI
import AVKit

// MARK: - Call History Item Model

struct CallHistoryItem: Identifiable {
    let id: String
    let prospectName: String
    let date: Date
    let duration: TimeInterval
    let outcome: String?
    let closerTalkPercent: Double?
    let cashCollected: Double?
    let hasVideo: Bool
    let recordingType: String // "audio" or "video"
    let recordingUrl: String?
    let summary: String?
    let transcriptText: String?
}

// MARK: - Call History View

struct CallHistoryView: View {
    @EnvironmentObject var appState: AppState

    @State private var calls: [CallHistoryItem] = []
    @State private var selectedCall: CallHistoryItem?
    @State private var isLoading: Bool = true
    @State private var filterOutcome: String = "all"
    @State private var searchText: String = ""
    @State private var startDate: Date = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @State private var endDate: Date = Date()
    @State private var rowsVisible = false

    private let outcomeFilters = [
        ("all", "All"),
        ("closed", "Closed"),
        ("lost", "Not Closed"),
        ("no_show", "No Show"),
        ("follow_up", "Follow Up")
    ]

    var filteredCalls: [CallHistoryItem] {
        calls.filter { call in
            let inDateRange = call.date >= startDate && call.date <= endDate

            let matchesOutcome: Bool
            if filterOutcome == "all" {
                matchesOutcome = true
            } else {
                matchesOutcome = call.outcome == filterOutcome
            }

            let matchesSearch: Bool
            if searchText.isEmpty {
                matchesSearch = true
            } else {
                matchesSearch = call.prospectName.localizedCaseInsensitiveContains(searchText)
            }

            return inDateRange && matchesOutcome && matchesSearch
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(alignment: .center) {
                Text("Calls")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                Spacer()

                Text("\(filteredCalls.count) calls")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 12)

            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))

                TextField("Search by prospect name...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundColor(.black)

                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(white: 0.97))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(white: 0.9), lineWidth: 0.5)
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 10)

            // Filter bar
            filterBar

            Divider()
                .padding(.top, 8)

            // Content
            if isLoading {
                Spacer()
                VStack(spacing: 12) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading calls...")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                }
                Spacer()
            } else if filteredCalls.isEmpty {
                emptyState
            } else {
                // Pending questionnaire banner
                if appState.pendingQuestionnaireCount > 0, let callId = appState.firstPendingCallId {
                    pendingQuestionnaireBanner(callId: callId, prospectName: appState.firstPendingProspectName)
                }

                // Table header
                HStack(spacing: 0) {
                    Text("DATE / TIME")
                        .frame(width: 160, alignment: .leading)
                    Text("PROSPECT")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("DURATION")
                        .frame(width: 90, alignment: .trailing)
                    Text("OUTCOME")
                        .frame(width: 110, alignment: .center)
                    Text("TALK")
                        .frame(width: 60, alignment: .trailing)
                    // Space for video icon
                    Color.clear.frame(width: 30, height: 1)
                }
                .font(.system(size: 10, weight: .medium))
                .tracking(0.5)
                .foregroundColor(Color(white: 0.45))
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
                .background(Color(white: 0.98))

                Divider()

                // Table rows
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(filteredCalls.enumerated()), id: \.element.id) { index, call in
                            CallTableRow(call: call, isEven: index % 2 == 0)
                                .onTapGesture {
                                    selectedCall = call
                                }

                            Divider()
                                .padding(.horizontal, 24)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            loadCalls()
        }
        .sheet(item: $selectedCall) { call in
            CallDetailSheet(call: call)
                .environmentObject(appState)
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: 16) {
            // Date range pickers
            HStack(spacing: 8) {
                Text("From:")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))

                DatePicker("", selection: $startDate, displayedComponents: .date)
                    .labelsHidden()
                    .frame(width: 110)

                Text("To:")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))

                DatePicker("", selection: $endDate, displayedComponents: .date)
                    .labelsHidden()
                    .frame(width: 110)
            }

            Divider()
                .frame(height: 20)

            // Outcome filter
            HStack(spacing: 4) {
                ForEach(outcomeFilters, id: \.0) { filter in
                    Button(action: { filterOutcome = filter.0 }) {
                        Text(filter.1)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(filterOutcome == filter.0 ? .white : Color(white: 0.45))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(filterOutcome == filter.0 ? Color.black : Color(white: 0.95))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "phone.fill")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.82))

            VStack(spacing: 4) {
                Text("No calls yet")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(white: 0.45))

                Text("Calls will appear here once bots start recording")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.65))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Pending Questionnaire Banner

    private func pendingQuestionnaireBanner(callId: String, prospectName: String?) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 14))
                .foregroundColor(Color(red: 0.9, green: 0.5, blue: 0.1))

            Text("You have a pending post-call questionnaire")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(white: 0.3))

            if let name = prospectName {
                Text("for \(name)")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }

            Spacer()

            Button(action: {
                // Open the questionnaire panel
                appState.botQuestionnaireCallId = callId
                appState.botQuestionnaireProspectName = prospectName
                appState.showBotPostCallQuestionnaire = true
                WindowManager.shared.openQuestionnairePanel(
                    appState: appState,
                    callId: callId,
                    prospectName: prospectName ?? "Prospect"
                )
            }) {
                Text("Fill Out Now")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Color.black)
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
        .background(Color(red: 1.0, green: 0.97, blue: 0.92))
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(Color(red: 0.9, green: 0.85, blue: 0.75)),
            alignment: .bottom
        )
    }

    // MARK: - Load Calls

    private func loadCalls() {
        isLoading = true

        guard let closerId = appState.closerInfo?.closerId else {
            isLoading = false
            return
        }

        Task {
            do {
                let rawCalls = try await appState.convexService.getCallHistory(closerId: closerId)
                let items: [CallHistoryItem] = rawCalls.compactMap { dict in
                    guard let id = dict["_id"] as? String else { return nil }

                    let prospectName = dict["prospectName"] as? String ?? "Unknown Prospect"
                    let startedAt = dict["startedAt"] as? Double ?? 0
                    let date = Date(timeIntervalSince1970: startedAt / 1000)
                    let duration = dict["duration"] as? Double ?? 0
                    let outcome = dict["outcome"] as? String
                    let cashCollected = dict["cashCollected"] as? Double
                    let recordingUrl = dict["recordingUrl"] as? String
                    let recordingType = dict["recordingType"] as? String ?? "audio"
                    let hasVideo = recordingType == "video" && recordingUrl != nil

                    let closerTalkTime = dict["closerTalkTime"] as? Double
                    let prospectTalkTime = dict["prospectTalkTime"] as? Double
                    var closerTalkPercent: Double? = nil
                    if let ct = closerTalkTime, let pt = prospectTalkTime, (ct + pt) > 0 {
                        closerTalkPercent = (ct / (ct + pt)) * 100
                    }

                    let summary = dict["summary"] as? String
                    let transcriptText = dict["transcriptText"] as? String

                    return CallHistoryItem(
                        id: id,
                        prospectName: prospectName,
                        date: date,
                        duration: duration,
                        outcome: outcome,
                        closerTalkPercent: closerTalkPercent,
                        cashCollected: cashCollected,
                        hasVideo: hasVideo,
                        recordingType: recordingType,
                        recordingUrl: recordingUrl,
                        summary: summary,
                        transcriptText: transcriptText
                    )
                }

                await MainActor.run {
                    calls = items
                    isLoading = false
                    rowsVisible = true
                }
            } catch {
                print("[CallHistory] Error loading calls: \(error)")
                await MainActor.run {
                    calls = []
                    isLoading = false
                    rowsVisible = true
                }
            }
        }
    }
}

// MARK: - Call Table Row

struct CallTableRow: View {
    let call: CallHistoryItem
    let isEven: Bool
    @State private var isHovered = false

    private var outcomeBadgeColor: Color {
        switch call.outcome {
        case "closed": return Color(red: 0.09, green: 0.63, blue: 0.22)
        case "lost": return Color(red: 0.86, green: 0.15, blue: 0.15)
        case "no_show": return Color(white: 0.5)
        case "follow_up": return Color(red: 0.2, green: 0.4, blue: 0.8)
        default: return Color(white: 0.5)
        }
    }

    private var outcomeBadgeBg: Color {
        switch call.outcome {
        case "closed": return Color(red: 0.94, green: 0.99, blue: 0.94)
        case "lost": return Color(red: 1.0, green: 0.94, blue: 0.94)
        case "no_show": return Color(white: 0.95)
        case "follow_up": return Color(red: 0.93, green: 0.95, blue: 1.0)
        default: return Color(white: 0.95)
        }
    }

    private var outcomeLabel: String {
        switch call.outcome {
        case "closed": return "Closed"
        case "lost": return "Not Closed"
        case "no_show": return "No Show"
        case "follow_up": return "Follow Up"
        default: return "Unknown"
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            // Date/Time
            Text(call.date.formatted(date: .abbreviated, time: .shortened))
                .font(.system(size: 12))
                .foregroundColor(Color(white: 0.4))
                .frame(width: 160, alignment: .leading)

            // Prospect
            Text(call.prospectName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.black)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Duration
            Text(formatCallDuration(call.duration))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Color(white: 0.4))
                .frame(width: 90, alignment: .trailing)

            // Outcome badge
            Text(outcomeLabel)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(outcomeBadgeColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(outcomeBadgeBg)
                .cornerRadius(10)
                .frame(width: 110, alignment: .center)

            // Talk ratio
            if let talkPercent = call.closerTalkPercent {
                Text("\(Int(talkPercent))%")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(Color(white: 0.4))
                    .frame(width: 60, alignment: .trailing)
            } else {
                Text("—")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.7))
                    .frame(width: 60, alignment: .trailing)
            }

            // Video icon
            if call.hasVideo {
                Image(systemName: "video.fill")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.5))
                    .frame(width: 30, alignment: .center)
            } else {
                Color.clear.frame(width: 30)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
        .background(isHovered ? Color(white: 0.96) : (isEven ? Color.white : Color(white: 0.99)))
        .contentShape(Rectangle())
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.1)) {
                isHovered = hovering
            }
        }
    }

    private func formatCallDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        if minutes >= 60 {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            return "\(hours)h \(remainingMinutes)m"
        }
        return "\(minutes)m \(seconds)s"
    }
}


// MARK: - Call Detail Sheet

struct CallDetailSheet: View {
    @EnvironmentObject var appState: AppState
    let call: CallHistoryItem
    @Environment(\.dismiss) private var dismiss

    // Video player — persisted in @State to avoid recreation on view updates
    @State private var player: AVPlayer?

    // On-demand data
    @State private var ammoItems: [AmmoItem] = []
    @State private var transcriptSegments: [TranscriptSegment] = []
    @State private var isLoadingAmmo = true
    @State private var isLoadingTranscript = true
    @State private var isTranscriptExpanded = false

    // Flag for review state
    @State private var isFlagged = false
    @State private var isFlagging = false

    private let convexService = ConvexService()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(call.prospectName)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.black)

                    HStack(spacing: 12) {
                        Text(call.date.formatted(date: .long, time: .shortened))
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))

                        Text(formatDetailDuration(call.duration))
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))

                        if let outcome = call.outcome {
                            Text(outcomeDisplayLabel(outcome))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(outcomeDisplayColor(outcome))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(outcomeDisplayBg(outcome))
                                .cornerRadius(10)
                        }
                    }
                }

                Spacer()

                // Flag for Review button (only for video calls)
                if call.hasVideo, let closerId = appState.closerInfo?.closerId {
                    Button(action: {
                        Task {
                            isFlagging = true
                            do {
                                if isFlagged {
                                    try await convexService.unflagCall(callId: call.id, closerId: closerId)
                                    isFlagged = false
                                } else {
                                    try await convexService.flagCallForReview(callId: call.id, closerId: closerId)
                                    isFlagged = true
                                }
                            } catch {
                                print("[CallDetail] Flag error: \(error)")
                            }
                            isFlagging = false
                        }
                    }) {
                        HStack(spacing: 6) {
                            if isFlagging {
                                ProgressView()
                                    .scaleEffect(0.6)
                                    .frame(width: 14, height: 14)
                            } else {
                                Image(systemName: isFlagged ? "flag.fill" : "flag")
                                    .font(.system(size: 12))
                            }
                            Text(isFlagged ? "Flagged" : "Flag for Review")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(isFlagged ? .white : Color(white: 0.4))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(isFlagged ? Color.blue : Color.clear)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(isFlagged ? Color.blue : Color(white: 0.8), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(isFlagging)
                }

                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .foregroundColor(Color(white: 0.5))
                        .font(.system(size: 14, weight: .medium))
                        .frame(width: 28, height: 28)
                        .background(Color(white: 0.95))
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .background(Color(white: 0.99))

            Divider()

            // Content
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Video/Audio player
                    if let urlString = call.recordingUrl, let _ = URL(string: urlString) {
                        VStack(spacing: 12) {
                            sectionHeader("Recording")

                            if call.hasVideo {
                                NativeVideoPlayer(player: player)
                                    .frame(height: 280)
                                    .cornerRadius(10)
                            } else {
                                // Audio-only player
                                NativeVideoPlayer(player: player)
                                    .frame(height: 60)
                                    .cornerRadius(10)
                            }
                        }
                    }

                    // AI Summary
                    VStack(spacing: 8) {
                        sectionHeader("AI Summary")

                        if let summary = call.summary, !summary.isEmpty {
                            Text(summary)
                                .font(.system(size: 13))
                                .foregroundColor(Color(white: 0.25))
                                .lineSpacing(3)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(white: 0.97))
                                .cornerRadius(8)
                        } else {
                            Text("No summary available for this call.")
                                .font(.system(size: 13))
                                .foregroundColor(Color(white: 0.5))
                                .italic()
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(white: 0.97))
                                .cornerRadius(8)
                        }
                    }

                    // Ammo Analysis
                    VStack(spacing: 8) {
                        sectionHeader("Ammo Analysis")

                        if isLoadingAmmo {
                            HStack(spacing: 8) {
                                ProgressView().scaleEffect(0.7)
                                Text("Loading ammo...")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(white: 0.5))
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                        } else if ammoItems.isEmpty {
                            Text("No ammo captured for this call.")
                                .font(.system(size: 13))
                                .foregroundColor(Color(white: 0.5))
                                .italic()
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(white: 0.97))
                                .cornerRadius(8)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(ammoItems) { item in
                                    HStack(alignment: .top, spacing: 10) {
                                        Text(item.type.label)
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundColor(item.type.textColor)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(item.type.backgroundColor)
                                            .cornerRadius(4)

                                        Text("\"\(item.text)\"")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color(white: 0.25))
                                            .lineLimit(3)
                                    }
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.white)
                                    .cornerRadius(6)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Color(white: 0.9), lineWidth: 1)
                                    )
                                }
                            }
                            .padding(12)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                        }
                    }

                    // Full Transcript — scrollable section
                    VStack(spacing: 8) {
                        HStack {
                            sectionHeader("Full Transcript")
                            Spacer()
                            if !transcriptSegments.isEmpty {
                                Button(action: { isTranscriptExpanded.toggle() }) {
                                    Text(isTranscriptExpanded ? "Collapse" : "Show All")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(Color(white: 0.4))
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        if isLoadingTranscript {
                            HStack(spacing: 8) {
                                ProgressView().scaleEffect(0.7)
                                Text("Loading transcript...")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(white: 0.5))
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                        } else if transcriptSegments.isEmpty {
                            // Fallback to transcriptText if no segments
                            if let text = call.transcriptText, !text.isEmpty {
                                ScrollView {
                                    Text(text)
                                        .font(.system(size: 12))
                                        .foregroundColor(Color(white: 0.25))
                                        .lineSpacing(3)
                                        .padding(12)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .frame(maxHeight: isTranscriptExpanded ? .infinity : 300)
                                .background(Color(white: 0.97))
                                .cornerRadius(8)
                            } else {
                                Text("No transcript available for this call.")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(white: 0.5))
                                    .italic()
                                    .padding(16)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(white: 0.97))
                                    .cornerRadius(8)
                            }
                        } else {
                            ScrollView {
                                VStack(spacing: 4) {
                                    ForEach(transcriptSegments) { segment in
                                        HStack(alignment: .top, spacing: 8) {
                                            Text(segment.displaySpeaker)
                                                .font(.system(size: 10, weight: .semibold))
                                                .foregroundColor(segment.isCloser ? Color(white: 0.5) : .blue)
                                                .frame(width: 60, alignment: .trailing)

                                            Text(segment.text)
                                                .font(.system(size: 12))
                                                .foregroundColor(Color(white: 0.25))
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                        .padding(.vertical, 4)
                                        .padding(.horizontal, 12)
                                    }
                                }
                                .padding(.vertical, 8)
                            }
                            .frame(maxHeight: isTranscriptExpanded ? 600 : 300)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                        }
                    }

                    // Post-Call Questionnaire Data
                    VStack(spacing: 8) {
                        sectionHeader("Post-Call Data")

                        VStack(alignment: .leading, spacing: 8) {
                            if let outcome = call.outcome {
                                detailRow("Outcome", outcomeDisplayLabel(outcome))
                            }
                            if let talkPercent = call.closerTalkPercent {
                                detailRow("Talk Ratio", "\(Int(talkPercent))% closer / \(Int(100 - talkPercent))% prospect")
                            }
                            if let cash = call.cashCollected, cash > 0 {
                                detailRow("Cash Collected", "$\(Int(cash))")
                            }
                            detailRow("Recording Type", call.recordingType.capitalized)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(white: 0.97))
                        .cornerRadius(8)
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 700, height: 600)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            // Create persistent player
            if let urlString = call.recordingUrl, let url = URL(string: urlString) {
                player = AVPlayer(url: url)
            }
            // Fetch ammo and transcript
            Task {
                await loadAmmoItems()
                await loadTranscriptSegments()
            }
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    // MARK: - Data Loading

    private func loadAmmoItems() async {
        do {
            let items = try await convexService.getAmmoItems(callId: call.id)
            await MainActor.run {
                ammoItems = items.sorted { $0.createdAt > $1.createdAt }
                isLoadingAmmo = false
            }
        } catch {
            print("[CallDetail] Failed to load ammo: \(error)")
            await MainActor.run { isLoadingAmmo = false }
        }
    }

    private func loadTranscriptSegments() async {
        do {
            let segments = try await convexService.getTranscriptSegments(callId: call.id)
            await MainActor.run {
                transcriptSegments = segments
                isLoadingTranscript = false
            }
        } catch {
            print("[CallDetail] Failed to load transcript: \(error)")
            await MainActor.run { isLoadingTranscript = false }
        }
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Color(white: 0.5))
            .tracking(0.5)
    }

    // MARK: - Detail Row

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(white: 0.5))
                .frame(width: 120, alignment: .leading)

            Text(value)
                .font(.system(size: 12))
                .foregroundColor(.black)
        }
    }

    // MARK: - Outcome Helpers

    private func outcomeDisplayLabel(_ outcome: String) -> String {
        switch outcome {
        case "closed": return "Closed"
        case "lost": return "Not Closed"
        case "no_show": return "No Show"
        case "follow_up": return "Rescheduled"
        default: return outcome.capitalized
        }
    }

    private func outcomeDisplayColor(_ outcome: String) -> Color {
        switch outcome {
        case "closed": return Color(red: 0.09, green: 0.63, blue: 0.22)
        case "lost": return Color(red: 0.86, green: 0.15, blue: 0.15)
        case "no_show": return Color(white: 0.5)
        case "follow_up": return Color(red: 0.2, green: 0.4, blue: 0.8)
        default: return Color(white: 0.5)
        }
    }

    private func outcomeDisplayBg(_ outcome: String) -> Color {
        switch outcome {
        case "closed": return Color(red: 0.94, green: 0.99, blue: 0.94)
        case "lost": return Color(red: 1.0, green: 0.94, blue: 0.94)
        case "no_show": return Color(white: 0.95)
        case "follow_up": return Color(red: 0.93, green: 0.95, blue: 1.0)
        default: return Color(white: 0.95)
        }
    }

    private func formatDetailDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        if minutes >= 60 {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            return "\(hours)h \(remainingMinutes)m \(seconds)s"
        }
        return "\(minutes)m \(seconds)s"
    }
}

#Preview {
    CallHistoryView()
        .environmentObject(AppState())
        .frame(width: 800, height: 600)
}
