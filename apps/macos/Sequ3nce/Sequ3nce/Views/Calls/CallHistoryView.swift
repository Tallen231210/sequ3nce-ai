//
//  CallHistoryView.swift
//  Sequ3nce
//
//  List of completed calls for the closer.
//  Shows call cards with outcome, duration, talk ratio, and cash collected.
//

import SwiftUI

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
}

// MARK: - Call History View

struct CallHistoryView: View {
    @EnvironmentObject var appState: AppState

    @State private var calls: [CallHistoryItem] = []
    @State private var selectedCall: CallHistoryItem?
    @State private var isLoading: Bool = true
    @State private var filterOutcome: String = "all"
    @State private var startDate: Date = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @State private var endDate: Date = Date()

    private let outcomeFilters = [
        ("all", "All"),
        ("closed", "Closed"),
        ("lost", "Not Closed"),
        ("no_show", "No Show"),
        ("follow_up", "Follow Up")
    ]

    var filteredCalls: [CallHistoryItem] {
        calls.filter { call in
            // Date filter
            let inDateRange = call.date >= startDate && call.date <= endDate

            // Outcome filter
            let matchesOutcome: Bool
            if filterOutcome == "all" {
                matchesOutcome = true
            } else {
                matchesOutcome = call.outcome == filterOutcome
            }

            return inDateRange && matchesOutcome
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(alignment: .center) {
                Text("Call History")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.black)

                Spacer()

                // Call count
                Text("\(filteredCalls.count) calls")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 12)

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
                callList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    // MARK: - Call List

    private var callList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(filteredCalls) { call in
                    CallCard(call: call)
                        .onTapGesture {
                            selectedCall = call
                        }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
        }
    }

    // MARK: - Load Calls

    private func loadCalls() {
        isLoading = true

        // Placeholder demo data
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            calls = [
                CallHistoryItem(
                    id: "call_1",
                    prospectName: "John Smith",
                    date: Date().addingTimeInterval(-3600),
                    duration: 1845,
                    outcome: "closed",
                    closerTalkPercent: 42,
                    cashCollected: 5000,
                    hasVideo: false,
                    recordingType: "audio"
                ),
                CallHistoryItem(
                    id: "call_2",
                    prospectName: "Sarah Johnson",
                    date: Date().addingTimeInterval(-86400),
                    duration: 2340,
                    outcome: "follow_up",
                    closerTalkPercent: 55,
                    cashCollected: nil,
                    hasVideo: true,
                    recordingType: "video"
                ),
                CallHistoryItem(
                    id: "call_3",
                    prospectName: "Mike Williams",
                    date: Date().addingTimeInterval(-172800),
                    duration: 420,
                    outcome: "no_show",
                    closerTalkPercent: nil,
                    cashCollected: nil,
                    hasVideo: false,
                    recordingType: "audio"
                ),
                CallHistoryItem(
                    id: "call_4",
                    prospectName: "Emily Davis",
                    date: Date().addingTimeInterval(-259200),
                    duration: 3150,
                    outcome: "lost",
                    closerTalkPercent: 61,
                    cashCollected: nil,
                    hasVideo: true,
                    recordingType: "video"
                ),
                CallHistoryItem(
                    id: "call_5",
                    prospectName: "Alex Thompson",
                    date: Date().addingTimeInterval(-345600),
                    duration: 2700,
                    outcome: "closed",
                    closerTalkPercent: 38,
                    cashCollected: 10000,
                    hasVideo: false,
                    recordingType: "audio"
                )
            ]
            isLoading = false
        }
    }
}

// MARK: - Call Card

struct CallCard: View {
    let call: CallHistoryItem

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
        case "follow_up": return "Rescheduled"
        default: return "Unknown"
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            // Left: Date + prospect + duration
            VStack(alignment: .leading, spacing: 4) {
                Text(call.date.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.5))

                Text(call.prospectName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)
                    .lineLimit(1)

                Text(formatCallDuration(call.duration))
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }
            .frame(minWidth: 160, alignment: .leading)

            Spacer()

            // Center: Outcome badge
            Text(outcomeLabel)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(outcomeBadgeColor)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(outcomeBadgeBg)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(outcomeBadgeColor.opacity(0.3), lineWidth: 1)
                )

            Spacer()

            // Right: Talk ratio, cash, video icon
            HStack(spacing: 12) {
                // Mini talk ratio bar
                if let talkPercent = call.closerTalkPercent {
                    VStack(spacing: 2) {
                        Text("\(Int(talkPercent))%")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(white: 0.5))

                        GeometryReader { geometry in
                            HStack(spacing: 1) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.black.opacity(0.6))
                                    .frame(width: geometry.size.width * CGFloat(talkPercent / 100))
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.blue.opacity(0.3))
                            }
                        }
                        .frame(width: 60, height: 4)
                    }
                }

                // Cash collected
                if let cash = call.cashCollected, cash > 0 {
                    Text("$\(formatCash(cash))")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(red: 0.09, green: 0.63, blue: 0.22))
                }

                // Video icon
                if call.hasVideo {
                    Image(systemName: "video.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(white: 0.9), lineWidth: 1)
        )
        .contentShape(Rectangle())
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

    private func formatCash(_ amount: Double) -> String {
        if amount >= 1000 {
            let k = amount / 1000
            if k == Double(Int(k)) {
                return "\(Int(k))k"
            }
            return String(format: "%.1fk", k)
        }
        return "\(Int(amount))"
    }
}

// MARK: - Call Detail Sheet

struct CallDetailSheet: View {
    @EnvironmentObject var appState: AppState
    let call: CallHistoryItem
    @Environment(\.dismiss) private var dismiss

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
                    // Video player placeholder
                    if call.hasVideo {
                        VStack(spacing: 12) {
                            sectionHeader("Recording")

                            VStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color(white: 0.95))
                                        .frame(height: 200)

                                    VStack(spacing: 8) {
                                        Image(systemName: "play.circle.fill")
                                            .font(.system(size: 40))
                                            .foregroundColor(Color(white: 0.7))

                                        Text("Video playback coming soon")
                                            .font(.system(size: 13))
                                            .foregroundColor(Color(white: 0.5))
                                    }
                                }
                            }
                        }
                    }

                    // AI Summary placeholder
                    VStack(spacing: 8) {
                        sectionHeader("AI Summary")

                        Text("AI-generated call summary will appear here once analysis is complete.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.45))
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                    }

                    // Ammo Analysis placeholder
                    VStack(spacing: 8) {
                        sectionHeader("Ammo Analysis")

                        Text("Coaching insights from the call analysis will appear here.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.45))
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                    }

                    // Full Transcript placeholder
                    VStack(spacing: 8) {
                        sectionHeader("Full Transcript")

                        Text("The full call transcript will be available here for review.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.45))
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                    }

                    // Post-Call Questionnaire Data placeholder
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
        .frame(width: 600, height: 500)
        .background(Color.white)
        .preferredColorScheme(.light)
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
