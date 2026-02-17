//
//  DashboardView.swift
//  Sequ3nce
//
//  Dashboard home view - shows upcoming calls and quick actions
//  Displayed when closer opens the app in meeting bot mode
//

import SwiftUI

// MARK: - Dashboard Models

struct UpcomingCall: Identifiable {
    let id = UUID()
    let time: String
    let title: String
    let botStatus: BotStatus
    let calendarEventId: String?

    enum BotStatus: String {
        case ready = "Bot Ready"
        case scheduled = "Scheduled"
    }
}

// MARK: - DashboardView

struct DashboardView: View {
    @EnvironmentObject var appState: AppState

    // Upcoming calls (loaded from API)
    @State private var upcomingCalls: [UpcomingCall] = []
    @State private var isLoadingCalls = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // 1. Welcome Header
                welcomeHeader

                // 2. Upcoming Calls
                upcomingCallsSection

                // 3. Pending Questionnaires Banner
                if appState.pendingQuestionnaireCount > 0 {
                    pendingQuestionnaireBanner
                }

                // Bottom spacing
                Spacer(minLength: 40)
            }
            .padding(32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            Task {
                await loadUpcomingCalls()
            }
        }
    }

    // MARK: - Welcome Header

    private var welcomeHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greetingText)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.black)

            Text(currentDateFormatted)
                .font(.system(size: 15))
                .foregroundColor(Color(white: 0.5))
        }
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let firstName = appState.closerInfo?.name.split(separator: " ").first.map(String.init) ?? "there"

        if hour < 12 {
            return "Good morning, \(firstName)"
        } else if hour < 17 {
            return "Good afternoon, \(firstName)"
        } else {
            return "Good evening, \(firstName)"
        }
    }

    private var currentDateFormatted: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter.string(from: Date())
    }

    // MARK: - Upcoming Calls Section

    private var upcomingCallsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "clock.fill")
                    .font(.system(size: 16))
                    .foregroundColor(Color(white: 0.4))
                Text("Upcoming Calls")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.black)
            }

            if isLoadingCalls {
                HStack {
                    Spacer()
                    ProgressView()
                        .padding(.vertical, 24)
                    Spacer()
                }
                .background(Color(white: 0.98))
                .cornerRadius(12)
            } else if upcomingCalls.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "calendar")
                            .font(.system(size: 24))
                            .foregroundColor(Color(white: 0.7))
                        Text("No upcoming calls")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.5))
                        Text("Connect your calendar in Settings to see upcoming meetings")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.6))
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 24)
                    Spacer()
                }
                .background(Color(white: 0.98))
                .cornerRadius(12)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(upcomingCalls.prefix(5).enumerated()), id: \.element.id) { index, call in
                        UpcomingCallRow(call: call, onExclude: {
                            Task {
                                await excludeCall(call)
                            }
                        })

                        if index < min(upcomingCalls.count, 5) - 1 {
                            Divider()
                                .padding(.horizontal, 16)
                        }
                    }
                }
                .background(Color(white: 0.98))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(white: 0.92), lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Pending Questionnaire Banner

    private var pendingQuestionnaireBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 18))
                .foregroundColor(Color(red: 0.72, green: 0.53, blue: 0.0))

            VStack(alignment: .leading, spacing: 2) {
                Text("You have \(appState.pendingQuestionnaireCount) call\(appState.pendingQuestionnaireCount == 1 ? "" : "s") that need\(appState.pendingQuestionnaireCount == 1 ? "s" : "") outcomes")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(red: 0.55, green: 0.40, blue: 0.0))
            }

            Spacer()

            Button(action: {
                // Open floating questionnaire panel for first pending call
                if let callId = appState.firstPendingCallId {
                    WindowManager.shared.openQuestionnairePanel(
                        appState: appState,
                        callId: callId,
                        prospectName: appState.firstPendingProspectName ?? "Prospect"
                    )
                } else {
                    // Fallback: navigate to calls tab
                    appState.selectedSidebarItem = .calls
                }
            }) {
                Text("Fill In")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(red: 0.55, green: 0.40, blue: 0.0))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color(red: 0.99, green: 0.92, blue: 0.72))
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(Color(red: 1.0, green: 0.97, blue: 0.88))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(red: 0.95, green: 0.87, blue: 0.65), lineWidth: 1)
        )
    }

    // MARK: - Data Loading

    private func loadUpcomingCalls() async {
        guard let closer = appState.closerInfo else { return }
        isLoadingCalls = true
        defer { isLoadingCalls = false }

        do {
            let bots = try await appState.convexService.getUpcomingBotsForCloser(closerId: closer.closerId)
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"

            var calls: [UpcomingCall] = []
            for bot in bots {
                let title = (bot["meetingTitle"] as? String) ?? (bot["prospectName"] as? String) ?? "Scheduled Call"
                let scheduledAt = bot["scheduledAt"] as? Double ?? 0
                let timeStr = formatter.string(from: Date(timeIntervalSince1970: scheduledAt / 1000))
                let status: UpcomingCall.BotStatus = (bot["status"] as? String) == "active" ? .ready : .scheduled
                let eventId = bot["calendarEventId"] as? String

                calls.append(UpcomingCall(time: timeStr, title: title, botStatus: status, calendarEventId: eventId))
            }

            self.upcomingCalls = calls
        } catch {
            print("[Dashboard] Failed to load upcoming calls: \(error)")
        }
    }

    private func excludeCall(_ call: UpcomingCall) async {
        guard let closer = appState.closerInfo, let eventId = call.calendarEventId else { return }

        do {
            let _ = try await appState.convexService.excludeCalendarEvent(
                closerId: closer.closerId,
                calendarEventId: eventId,
                eventTitle: call.title
            )
            withAnimation {
                upcomingCalls.removeAll { $0.id == call.id }
            }
        } catch {
            print("[Dashboard] Failed to exclude call: \(error)")
        }
    }
}

// MARK: - Upcoming Call Row

struct UpcomingCallRow: View {
    let call: UpcomingCall
    let onExclude: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Time
            Text(call.time)
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundColor(Color(white: 0.3))
                .frame(width: 80, alignment: .leading)

            // Title
            Text(call.title)
                .font(.system(size: 14))
                .foregroundColor(.black)
                .lineLimit(1)

            Spacer()

            // Bot status badge
            Text(call.botStatus.rawValue)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(call.botStatus == .ready
                    ? Color(red: 0.13, green: 0.55, blue: 0.13)
                    : Color(white: 0.5))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(call.botStatus == .ready
                    ? Color(red: 0.13, green: 0.55, blue: 0.13).opacity(0.1)
                    : Color(white: 0.95))
                .cornerRadius(6)

            // Exclude button
            Button(action: onExclude) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(white: 0.6))
                    .frame(width: 24, height: 24)
                    .background(Color(white: 0.95))
                    .cornerRadius(12)
            }
            .buttonStyle(.plain)
            .help("Exclude this event from bot auto-join")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - Stats View (Separate Tab)

struct StatsView: View {
    @EnvironmentObject var appState: AppState

    @State private var stats: [String: Any] = [:]
    @State private var isLoading = false
    @State private var selectedPeriod = "week"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // Header with period selector
                HStack {
                    Text("Your Performance")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.black)

                    Spacer()

                    Picker("Period", selection: $selectedPeriod) {
                        Text("This Week").tag("week")
                        Text("This Month").tag("month")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                    .onChange(of: selectedPeriod) {
                        Task { await loadStats() }
                    }
                }

                // Stats Cards
                statsCards

                // Team Comparison
                teamComparisonSection

                Spacer(minLength: 40)
            }
            .padding(32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            Task { await loadStats() }
        }
    }

    // MARK: - Stats Cards

    private var statsCards: some View {
        HStack(spacing: 16) {
            StatCard(
                title: selectedPeriod == "week" ? "Calls This Week" : "Calls This Month",
                value: "\(stats["callsThisPeriod"] as? Int ?? 0)",
                icon: "phone.fill"
            )

            StatCard(
                title: "Close Rate",
                value: "\(Int(stats["closeRate"] as? Double ?? 0))%",
                icon: "target"
            )

            StatCard(
                title: "Cash Collected",
                value: formatCurrency(stats["cashCollected"] as? Int ?? 0),
                icon: "dollarsign.circle.fill"
            )
        }
    }

    // MARK: - Team Comparison

    private var teamComparisonSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "person.3.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.4))
                Text("You vs Team Average")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.black)

                Spacer()

                let teamSize = stats["teamSize"] as? Int ?? 0
                if teamSize > 0 {
                    Text("\(teamSize) closers")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                }
            }

            VStack(spacing: 16) {
                ComparisonRow(
                    label: "Close Rate",
                    yours: "\(Int(stats["closeRate"] as? Double ?? 0))%",
                    team: "\(Int(stats["teamAvgCloseRate"] as? Double ?? 0))%",
                    yourValue: stats["closeRate"] as? Double ?? 0,
                    teamValue: stats["teamAvgCloseRate"] as? Double ?? 0
                )

                ComparisonRow(
                    label: "Cash Collected",
                    yours: formatCurrency(stats["cashCollected"] as? Int ?? 0),
                    team: formatCurrency(stats["teamAvgCash"] as? Int ?? 0),
                    yourValue: Double(stats["cashCollected"] as? Int ?? 0),
                    teamValue: Double(stats["teamAvgCash"] as? Int ?? 0)
                )

                ComparisonRow(
                    label: "Calls Taken",
                    yours: "\(stats["callsThisPeriod"] as? Int ?? 0)",
                    team: String(format: "%.1f", stats["teamAvgCalls"] as? Double ?? 0),
                    yourValue: Double(stats["callsThisPeriod"] as? Int ?? 0),
                    teamValue: stats["teamAvgCalls"] as? Double ?? 0
                )
            }
            .padding(20)
            .background(Color(white: 0.98))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(white: 0.92), lineWidth: 1)
            )
        }
    }

    // MARK: - Data Loading

    private func loadStats() async {
        guard let closer = appState.closerInfo else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            stats = try await appState.convexService.getCloserStats(closerId: closer.closerId, period: selectedPeriod)
        } catch {
            print("[Stats] Failed to load stats: \(error)")
        }
    }

    private func formatCurrency(_ amount: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    var trend: Double? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.5))
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(value)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                HStack(spacing: 4) {
                    Text(title)
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))

                    if let trend = trend {
                        HStack(spacing: 2) {
                            Image(systemName: trend >= 0 ? "arrow.up.right" : "arrow.down.right")
                                .font(.system(size: 10, weight: .semibold))
                            Text(String(format: "%.1f%%", abs(trend)))
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(trend >= 0 ? Color(red: 0.13, green: 0.55, blue: 0.13) : Color(red: 0.86, green: 0.15, blue: 0.15))
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(white: 0.92), lineWidth: 1)
        )
    }
}

// MARK: - Comparison Row

struct ComparisonRow: View {
    let label: String
    let yours: String
    let team: String
    let yourValue: Double
    let teamValue: Double

    private var maxVal: Double { max(yourValue, teamValue, 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(white: 0.4))

            HStack(spacing: 12) {
                // Your bar
                VStack(alignment: .leading, spacing: 4) {
                    Text("You: \(yours)")
                        .font(.system(size: 12))
                        .foregroundColor(.black)
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.black)
                            .frame(width: geo.size.width * (yourValue / maxVal))
                    }
                    .frame(height: 8)
                }

                // Team bar
                VStack(alignment: .leading, spacing: 4) {
                    Text("Team Avg: \(team)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(white: 0.8))
                            .frame(width: geo.size.width * (teamValue / maxVal))
                    }
                    .frame(height: 8)
                }
            }
        }
    }
}

// MARK: - Quick Bot Sheet

struct QuickBotSheet: View {
    @EnvironmentObject var appState: AppState
    @Binding var isPresented: Bool
    @State private var meetingUrl = ""
    @State private var prospectName = ""
    @State private var isJoining = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            // Header
            HStack {
                Text("Quick Bot")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.black)

                Spacer()

                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(white: 0.5))
                        .frame(width: 28, height: 28)
                        .background(Color(white: 0.95))
                        .cornerRadius(14)
                }
                .buttonStyle(.plain)
            }

            // Description
            Text("Paste a meeting URL to send a bot to record and coach you.")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.5))
                .frame(maxWidth: .infinity, alignment: .leading)

            // Form
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Meeting URL")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(white: 0.3))

                    TextField("https://meet.google.com/abc-defg-hij", text: $meetingUrl)
                        .textFieldStyle(.plain)
                        .foregroundColor(.black)
                        .padding(12)
                        .background(Color(white: 0.97))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(white: 0.9), lineWidth: 1)
                        )
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Prospect Name")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(white: 0.3))

                    TextField("e.g., John Smith", text: $prospectName)
                        .textFieldStyle(.plain)
                        .foregroundColor(.black)
                        .padding(12)
                        .background(Color(white: 0.97))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(white: 0.9), lineWidth: 1)
                        )
                }
            }

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer()

            // Join button
            Button(action: { Task { await handleJoinMeeting() } }) {
                HStack {
                    if isJoining {
                        ProgressView()
                            .scaleEffect(0.7)
                            .padding(.trailing, 4)
                    }
                    Text(isJoining ? "Sending Bot..." : "Join Meeting")
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(canJoin ? Color.black : Color(white: 0.7))
                .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(!canJoin || isJoining)
        }
        .padding(24)
        .frame(width: 420, height: 420)
        .background(Color.white)
    }

    private var canJoin: Bool {
        let url = meetingUrl.trimmingCharacters(in: .whitespaces)
        return !url.isEmpty && (url.contains("zoom.us") || url.contains("zoom.com") || url.contains("meet.google.com") || url.contains("teams.microsoft.com") || url.hasPrefix("https://"))
    }

    private func handleJoinMeeting() async {
        guard let closer = appState.closerInfo else {
            errorMessage = "Not logged in"
            return
        }

        isJoining = true
        errorMessage = nil

        do {
            let success = try await appState.convexService.createQuickBot(
                meetingUrl: meetingUrl.trimmingCharacters(in: .whitespaces),
                closerId: closer.closerId,
                teamId: closer.teamId,
                prospectName: prospectName.isEmpty ? nil : prospectName
            )

            if success {
                print("[QuickBot] Bot sent to meeting: \(meetingUrl)")
                isPresented = false
            } else {
                errorMessage = "Failed to create bot. Please try again."
            }
        } catch {
            print("[QuickBot] Error: \(error)")
            errorMessage = "Error: \(error.localizedDescription)"
        }

        isJoining = false
    }
}

// MARK: - Preview

#Preview {
    DashboardView()
        .environmentObject(AppState())
        .frame(width: 900, height: 700)
}
