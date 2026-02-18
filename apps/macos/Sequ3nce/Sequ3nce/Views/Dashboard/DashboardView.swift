//
//  DashboardView.swift
//  Sequ3nce
//
//  Dashboard home view - shows stats, schedule, recent calls, and quick actions
//  Stats view - shows detailed performance metrics and team comparison
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

struct RecentCallItem: Identifiable {
    let id: String
    let prospectName: String
    let duration: TimeInterval
    let outcome: String?
    let date: Date
}

// MARK: - Analytics Models

struct AnalyticsSummary: Codable {
    let totalPitched: Int
    let totalClosed: Int
    let leftOnTable: Int
    let closeRate: Double
    let totalCalls: Int
    let closedCalls: Int
    let lostOrFollowUpCalls: Int
    let trends: AnalyticsTrends
}

struct AnalyticsTrends: Codable {
    let pitched: Double
    let closed: Double
    let leftOnTable: Double
    let closeRate: Double
}

struct LostDealsData: Codable {
    let objections: [ObjectionBreakdown]
    let totalLost: Int
    let totalDeals: Int
    let problemAreas: [String]
}

struct ObjectionBreakdown: Codable, Identifiable {
    var id: String { objection }
    let objection: String
    let objectionLabel: String
    let lostAmount: Int
    let dealCount: Int
    let trend: Double
}

struct ObjectionAnalysisData: Codable {
    let lostObjections: [LostObjectionItem]
    let overcomeObjections: [OvercomeObjectionItem]
    let totalLostValue: Int
    let totalClosedValue: Int
    let insights: [String]
}

struct LostObjectionItem: Codable, Identifiable {
    var id: String { objection }
    let objection: String
    let objectionLabel: String
    let count: Int
    let value: Int
    let overcomeRate: Int?
}

struct OvercomeObjectionItem: Codable, Identifiable {
    var id: String { objection }
    let objection: String
    let objectionLabel: String
    let count: Int
    let value: Int
}

// MARK: - DashboardView

struct DashboardView: View {
    @EnvironmentObject var appState: AppState

    // Data
    @State private var upcomingCalls: [UpcomingCall] = []
    @State private var recentCalls: [RecentCallItem] = []
    @State private var stats: [String: Any] = [:]
    @State private var calendarEvents: [CalendarEvent] = []
    @State private var isLoadingCalls = false
    @State private var isLoadingStats = false
    @State private var selectedEvent: CalendarEvent?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // 1. Welcome Header
                welcomeHeader

                // 2. Quick Stats Row
                quickStatsRow

                // 3. Today's Schedule
                todayScheduleSection

                // 4. Recent Calls
                recentCallsSection

                // 5. Pending Questionnaires Banner
                if appState.pendingQuestionnaireCount > 0 {
                    pendingQuestionnaireBanner
                }

                Spacer(minLength: 40)
            }
            .padding(32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            Task {
                await loadAllData()
            }
        }
        .sheet(item: $selectedEvent) { event in
            meetingConfirmationSheet(event)
        }
    }

    // MARK: - Welcome Header

    private var welcomeHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greetingText)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.black)

            Text(currentDateFormatted)
                .font(.system(size: 13))
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

    // MARK: - Quick Stats Row

    private var quickStatsRow: some View {
        HStack(spacing: 12) {
            StatCard(
                title: "Calls This Week",
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

            StatCard(
                title: "Avg Call",
                value: formatDurationShort(stats["avgCallDuration"] as? Int ?? 0),
                icon: "clock.fill"
            )
        }
    }

    // MARK: - Today's Schedule Section

    private var todayScheduleSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("TODAY'S SCHEDULE")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.45))

                Spacer()

                if !todayEvents.isEmpty {
                    Button(action: {
                        appState.selectedSidebarItem = .schedule
                    }) {
                        Text("View All")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(white: 0.45))
                    }
                    .buttonStyle(.plain)
                }
            }

            if todayEvents.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "calendar")
                            .font(.system(size: 20))
                            .foregroundColor(Color(white: 0.7))
                        Text("No calls scheduled today")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .padding(.vertical, 20)
                    Spacer()
                }
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(todayEvents.prefix(5).enumerated()), id: \.element.id) { index, event in
                        todayEventRow(event)

                        if index < min(todayEvents.count, 5) - 1 {
                            Divider()
                                .padding(.horizontal, 16)
                        }
                    }
                }
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            }
        }
    }

    private var todayEvents: [CalendarEvent] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { return [] }
        let startMs = startOfDay.timeIntervalSince1970 * 1000
        let endMs = endOfDay.timeIntervalSince1970 * 1000

        return calendarEvents
            .filter { $0.startTime >= startMs && $0.startTime < endMs }
            .sorted { $0.startTime < $1.startTime }
    }

    private func todayEventRow(_ event: CalendarEvent) -> some View {
        HStack(spacing: 12) {
            Text(formatEventTime(event.startTime))
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(Color(white: 0.3))
                .frame(width: 80, alignment: .leading)

            Text(event.title)
                .font(.system(size: 13))
                .foregroundColor(.black)
                .lineLimit(1)

            Spacer()

            if event.meetingUrl != nil {
                Button(action: {
                    selectedEvent = event
                }) {
                    Text("Join")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Color.black)
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Recent Calls Section

    private var recentCallsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("RECENT CALLS")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.45))

                Spacer()

                if !recentCalls.isEmpty {
                    Button(action: {
                        appState.selectedSidebarItem = .calls
                    }) {
                        Text("View All")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(white: 0.45))
                    }
                    .buttonStyle(.plain)
                }
            }

            if recentCalls.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "phone.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(white: 0.7))
                        Text("No recent calls")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .padding(.vertical, 20)
                    Spacer()
                }
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(recentCalls.prefix(5).enumerated()), id: \.element.id) { index, call in
                        recentCallRow(call)

                        if index < min(recentCalls.count, 5) - 1 {
                            Divider()
                                .padding(.horizontal, 16)
                        }
                    }
                }
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            }
        }
    }

    private func recentCallRow(_ call: RecentCallItem) -> some View {
        HStack(spacing: 12) {
            Text(call.prospectName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.black)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(formatDurationShort(Int(call.duration)))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Color(white: 0.5))

            Text(outcomeLabel(call.outcome))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(outcomeColor(call.outcome))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(outcomeBg(call.outcome))
                .cornerRadius(10)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Pending Questionnaire Banner

    private var pendingQuestionnaireBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.72, green: 0.53, blue: 0.0))

            Text("\(appState.pendingQuestionnaireCount) call\(appState.pendingQuestionnaireCount == 1 ? "" : "s") need\(appState.pendingQuestionnaireCount == 1 ? "s" : "") outcomes")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(red: 0.55, green: 0.40, blue: 0.0))

            Spacer()

            Button(action: {
                if let callId = appState.firstPendingCallId {
                    WindowManager.shared.openQuestionnairePanel(
                        appState: appState,
                        callId: callId,
                        prospectName: appState.firstPendingProspectName ?? "Prospect"
                    )
                } else {
                    appState.selectedSidebarItem = .calls
                }
            }) {
                Text("Fill In")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(red: 0.55, green: 0.40, blue: 0.0))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Color(red: 0.99, green: 0.92, blue: 0.72))
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(Color(red: 1.0, green: 0.97, blue: 0.88))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(red: 0.95, green: 0.87, blue: 0.65), lineWidth: 0.5)
        )
    }

    // MARK: - Data Loading

    private func loadAllData() async {
        guard let closer = appState.closerInfo else { return }

        // Load stats, calendar events, and recent calls in parallel
        async let statsTask: Void = loadStats(closerId: closer.closerId)
        async let calendarTask: Void = loadCalendarEvents(email: closer.email, teamId: closer.teamId)
        async let callsTask: Void = loadRecentCalls(closerId: closer.closerId)
        async let upcomingTask: Void = loadUpcomingCalls(closerId: closer.closerId)

        _ = await (statsTask, calendarTask, callsTask, upcomingTask)
    }

    private func loadStats(closerId: String) async {
        isLoadingStats = true
        defer { isLoadingStats = false }

        do {
            stats = try await appState.convexService.getCloserStats(closerId: closerId, period: "week")
        } catch {
            print("[Dashboard] Failed to load stats: \(error)")
        }
    }

    private func loadCalendarEvents(email: String, teamId: String) async {
        do {
            let calendar = Calendar.current
            let startOfDay = calendar.startOfDay(for: Date())
            guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { return }

            let events = try await appState.convexService.getCalendarEvents(
                email: email,
                teamId: teamId,
                startDate: Int64(startOfDay.timeIntervalSince1970 * 1000),
                endDate: Int64(endOfDay.timeIntervalSince1970 * 1000)
            )

            await MainActor.run {
                calendarEvents = events
            }
        } catch {
            print("[Dashboard] Failed to load calendar events: \(error)")
        }
    }

    private func loadRecentCalls(closerId: String) async {
        do {
            let rawCalls = try await appState.convexService.getCallHistory(closerId: closerId)
            let items: [RecentCallItem] = rawCalls.prefix(5).compactMap { dict in
                guard let id = dict["_id"] as? String else { return nil }
                let prospectName = dict["prospectName"] as? String ?? "Unknown"
                let duration = dict["duration"] as? Double ?? 0
                let outcome = dict["outcome"] as? String
                let startedAt = dict["startedAt"] as? Double ?? 0
                let date = Date(timeIntervalSince1970: startedAt / 1000)

                return RecentCallItem(id: id, prospectName: prospectName, duration: duration, outcome: outcome, date: date)
            }

            await MainActor.run {
                recentCalls = Array(items)
            }
        } catch {
            print("[Dashboard] Failed to load recent calls: \(error)")
        }
    }

    private func loadUpcomingCalls(closerId: String) async {
        isLoadingCalls = true
        defer { isLoadingCalls = false }

        do {
            let bots = try await appState.convexService.getUpcomingBotsForCloser(closerId: closerId)
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

    // MARK: - Helpers

    private func formatCurrency(_ amount: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }

    private func formatDurationShort(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        if minutes >= 60 {
            return "\(minutes / 60)h \(minutes % 60)m"
        }
        return "\(minutes)m \(secs)s"
    }

    private func formatEventTime(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private func outcomeLabel(_ outcome: String?) -> String {
        switch outcome {
        case "closed": return "Closed"
        case "lost": return "Not Closed"
        case "no_show": return "No Show"
        case "follow_up": return "Follow Up"
        default: return "Pending"
        }
    }

    private func outcomeColor(_ outcome: String?) -> Color {
        switch outcome {
        case "closed": return Color(red: 0.09, green: 0.63, blue: 0.22)
        case "lost": return Color(red: 0.86, green: 0.15, blue: 0.15)
        case "no_show": return Color(white: 0.5)
        case "follow_up": return Color(red: 0.2, green: 0.4, blue: 0.8)
        default: return Color(white: 0.5)
        }
    }

    private func outcomeBg(_ outcome: String?) -> Color {
        switch outcome {
        case "closed": return Color(red: 0.94, green: 0.99, blue: 0.94)
        case "lost": return Color(red: 1.0, green: 0.94, blue: 0.94)
        case "no_show": return Color(white: 0.95)
        case "follow_up": return Color(red: 0.93, green: 0.95, blue: 1.0)
        default: return Color(white: 0.95)
        }
    }

    // MARK: - Meeting Confirmation Sheet

    private func meetingConfirmationSheet(_ event: CalendarEvent) -> some View {
        VStack(spacing: 0) {
            // Header bar
            HStack {
                Spacer()
                Button(action: { selectedEvent = nil }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(white: 0.45))
                        .frame(width: 24, height: 24)
                        .background(Color(white: 0.96))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Color(white: 0.9), lineWidth: 0.5))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            Spacer()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(Color(white: 0.96))
                        .frame(width: 56, height: 56)
                    Image(systemName: "video.fill")
                        .font(.system(size: 24))
                        .foregroundColor(Color(white: 0.4))
                }

                Text(event.title)
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)

                Text(event.isAllDay == true ? "All day" : "\(formatEventTime(event.startTime)) – \(formatEventTime(event.endTime))")
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Color(white: 0.5))

                if let platform = meetingPlatformName(event) {
                    HStack(spacing: 6) {
                        Image(systemName: "video.fill")
                            .font(.system(size: 12))
                        Text(platform)
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(Color(red: 0.2, green: 0.5, blue: 0.9))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color(red: 0.93, green: 0.95, blue: 1.0))
                    .cornerRadius(6)
                }
            }
            .padding(.horizontal, 24)

            Spacer()

            VStack(spacing: 10) {
                if event.meetingUrl != nil {
                    Button(action: {
                        if let meetingUrl = event.meetingUrl {
                            selectedEvent = nil
                            joinAndRecord(event: event, meetingUrl: meetingUrl)
                        }
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "video.fill")
                                .font(.system(size: 14))
                            Text("Join & Start Meeting")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.black)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("No video meeting link found")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                }

                Button(action: { selectedEvent = nil }) {
                    Text("Cancel")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(white: 0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .frame(width: 340, height: 360)
        .background(Color.white)
    }

    private func meetingPlatformName(_ event: CalendarEvent) -> String? {
        guard let url = event.meetingUrl?.lowercased() else { return nil }
        if url.contains("zoom.us") { return "Zoom Meeting" }
        if url.contains("meet.google.com") { return "Google Meet" }
        if url.contains("teams.microsoft.com") { return "Microsoft Teams" }
        if url.contains("webex.com") { return "Webex" }
        return "Video Call"
    }

    private func joinAndRecord(event: CalendarEvent, meetingUrl: String) {
        if let closerInfo = appState.closerInfo {
            Task {
                do {
                    let success = try await appState.convexService.createBotForMeeting(
                        closerId: closerInfo.closerId,
                        teamId: closerInfo.teamId,
                        meetingUrl: meetingUrl,
                        meetingTitle: event.title,
                        prospectName: event.title
                    )
                    print("[DashboardView] Bot creation \(success ? "succeeded" : "failed") for: \(event.title)")
                } catch {
                    print("[DashboardView] Failed to create bot: \(error)")
                }
            }
        }

        WindowManager.shared.openAmmoPanelSnapped(appState: appState)

        if let url = URL(string: meetingUrl) {
            NSWorkspace.shared.open(url)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            WindowManager.shared.resizeFrontmostWindowToLeft()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NotificationCenter.default.post(
                name: Notification.Name("StartRecordingFromCalendar"),
                object: nil,
                userInfo: ["prospectName": event.title]
            )
        }
    }
}

// MARK: - Stats View (Separate Tab)

struct StatsView: View {
    @EnvironmentObject var appState: AppState

    @State private var stats: [String: Any] = [:]
    @State private var isLoading = false
    @State private var selectedPeriod = "week"
    @State private var analyticsSummary: AnalyticsSummary?
    @State private var lostDeals: LostDealsData?
    @State private var objectionAnalysis: ObjectionAnalysisData?
    @State private var isLoadingAnalytics = false

    private let periodOptions = [
        ("today", "Today"),
        ("week", "This Week"),
        ("month", "This Month"),
        ("last30", "Last 30 Days"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header with period selector
                HStack {
                    Text("Performance")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.black)

                    Spacer()

                    HStack(spacing: 4) {
                        ForEach(periodOptions, id: \.0) { option in
                            Button(action: { selectedPeriod = option.0 }) {
                                Text(option.1)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(selectedPeriod == option.0 ? .white : Color(white: 0.45))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(selectedPeriod == option.0 ? Color.black : Color(white: 0.95))
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .onChange(of: selectedPeriod) {
                        Task { await loadStats() }
                    }
                }

                // Stats Cards - 2 rows of 3
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        StatCard(
                            title: periodLabel("Calls"),
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

                    HStack(spacing: 12) {
                        StatCard(
                            title: "Avg Call Duration",
                            value: formatDuration(stats["avgCallDuration"] as? Int ?? 0),
                            icon: "clock.fill"
                        )

                        StatCard(
                            title: "Talk Ratio",
                            value: "\(Int(stats["avgTalkRatio"] as? Double ?? 0))%",
                            icon: "waveform"
                        )

                        StatCard(
                            title: "Contract Value",
                            value: formatCurrency(stats["totalContractValue"] as? Int ?? 0),
                            icon: "doc.text.fill"
                        )
                    }
                }

                // Team Comparison
                teamComparisonSection

                // Money Overview
                moneyOverviewSection

                // Where You're Losing Money
                lostDealsSection

                // Objection Handling
                objectionHandlingSection

                // Insights
                insightsSection

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

    // MARK: - Team Comparison

    private var teamComparisonSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                Text("YOU VS TEAM AVERAGE")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.45))

                Spacer()

                let teamSize = stats["teamSize"] as? Int ?? 0
                if teamSize > 0 {
                    Text("\(teamSize) closers")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.55))
                }
            }

            VStack(spacing: 14) {
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

                ComparisonRow(
                    label: "Avg Duration",
                    yours: formatDuration(stats["avgCallDuration"] as? Int ?? 0),
                    team: formatDuration(stats["teamAvgDuration"] as? Int ?? 0),
                    yourValue: Double(stats["avgCallDuration"] as? Int ?? 0),
                    teamValue: Double(stats["teamAvgDuration"] as? Int ?? 0)
                )

                ComparisonRow(
                    label: "Talk Ratio",
                    yours: "\(Int(stats["avgTalkRatio"] as? Double ?? 0))%",
                    team: "\(Int(stats["teamAvgTalkRatio"] as? Double ?? 0))%",
                    yourValue: stats["avgTalkRatio"] as? Double ?? 0,
                    teamValue: stats["teamAvgTalkRatio"] as? Double ?? 0
                )
            }
            .padding(16)
            .background(Color(white: 0.98))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(white: 0.9), lineWidth: 0.5)
            )
        }
    }

    // MARK: - Money Overview

    private var moneyOverviewSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("MONEY OVERVIEW")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .foregroundColor(Color(white: 0.45))

            if let summary = analyticsSummary {
                HStack(spacing: 12) {
                    StatCard(
                        title: "Total Pitched",
                        value: formatCurrency(summary.totalPitched),
                        icon: "dollarsign.circle",
                        trend: summary.trends.pitched
                    )

                    StatCard(
                        title: "Total Closed",
                        value: formatCurrency(summary.totalClosed),
                        icon: "checkmark.circle.fill",
                        trend: summary.trends.closed
                    )

                    StatCard(
                        title: "Left on Table",
                        value: formatCurrency(summary.leftOnTable),
                        icon: "exclamationmark.triangle",
                        trend: summary.trends.leftOnTable,
                        invertTrend: true
                    )
                }
            } else {
                Text("No data for this period")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            }
        }
    }

    // MARK: - Lost Deals

    private var lostDealsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                Text("WHERE YOU'RE LOSING MONEY")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.45))

                Spacer()

                if let deals = lostDeals, deals.totalDeals > 0 {
                    Text("\(deals.totalDeals) deals · \(formatCurrency(deals.totalLost))")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.55))
                }
            }

            if let deals = lostDeals, !deals.objections.isEmpty {
                VStack(spacing: 0) {
                    // Problem areas badges
                    if !deals.problemAreas.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(deals.problemAreas, id: \.self) { area in
                                Text(area)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color(red: 0.86, green: 0.15, blue: 0.15))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color(red: 1, green: 0.93, blue: 0.93))
                                    .cornerRadius(4)
                            }
                            Spacer()
                        }
                        .padding(.bottom, 12)
                    }

                    // Objection rows
                    ForEach(deals.objections) { objection in
                        ObjectionBarRow(
                            objection: objection,
                            maxAmount: deals.objections.first?.lostAmount ?? 1,
                            formatCurrency: formatCurrency
                        )
                    }
                }
                .padding(16)
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            } else {
                Text("No lost deals this period")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            }
        }
    }

    // MARK: - Objection Handling

    private var objectionHandlingSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("OBJECTION HANDLING")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .foregroundColor(Color(white: 0.45))

            let itemsWithRate = objectionAnalysis?.lostObjections.filter { $0.overcomeRate != nil } ?? []

            if !itemsWithRate.isEmpty {
                VStack(spacing: 10) {
                    ForEach(itemsWithRate) { item in
                        OvercomeRateRow(item: item)
                    }
                }
                .padding(16)
                .background(Color(white: 0.98))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(white: 0.9), lineWidth: 0.5)
                )
            } else {
                Text("Not enough data yet")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            }
        }
    }

    // MARK: - Insights

    @ViewBuilder
    private var insightsSection: some View {
        if let insights = objectionAnalysis?.insights, !insights.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                Text("INSIGHTS")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.45))

                VStack(spacing: 8) {
                    ForEach(insights, id: \.self) { insight in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "lightbulb.fill")
                                .font(.system(size: 12))
                                .foregroundColor(Color(red: 0.85, green: 0.65, blue: 0))
                                .padding(.top, 2)

                            Text(insight)
                                .font(.system(size: 12))
                                .foregroundColor(Color(white: 0.3))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(red: 1, green: 0.97, blue: 0.88))
                        .cornerRadius(8)
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func periodLabel(_ base: String) -> String {
        switch selectedPeriod {
        case "today": return "\(base) Today"
        case "week": return "\(base) This Week"
        case "month": return "\(base) This Month"
        case "last30": return "\(base) (30 Days)"
        default: return base
        }
    }

    private func loadStats() async {
        guard let closer = appState.closerInfo else { return }
        isLoading = true
        defer { isLoading = false }

        async let statsTask = appState.convexService.getCloserStats(closerId: closer.closerId, period: selectedPeriod)
        async let summaryTask = appState.convexService.getAnalyticsSummary(closerId: closer.closerId, teamId: closer.teamId, period: selectedPeriod)
        async let lostTask = appState.convexService.getLostDealsByObjection(closerId: closer.closerId, teamId: closer.teamId, period: selectedPeriod)
        async let objectionTask = appState.convexService.getObjectionAnalysis(closerId: closer.closerId, teamId: closer.teamId, period: selectedPeriod)

        stats = (try? await statsTask) ?? [:]
        analyticsSummary = try? await summaryTask
        lostDeals = try? await lostTask
        objectionAnalysis = try? await objectionTask
    }

    private func formatCurrency(_ amount: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }

    private func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        if minutes >= 60 {
            return "\(minutes / 60)h \(minutes % 60)m"
        }
        if minutes == 0 && secs == 0 {
            return "—"
        }
        return "\(minutes)m \(secs)s"
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    var trend: Double? = nil
    var invertTrend: Bool = false

    @State private var displayValue: String = ""
    @State private var opacity: Double = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.5))
                Spacer()
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(displayValue.isEmpty ? " " : displayValue)
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundColor(.black)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(title.uppercased())
                        .font(.system(size: 11, weight: .medium))
                        .tracking(0.5)
                        .foregroundColor(Color(white: 0.5))

                    if let trend = trend {
                        HStack(spacing: 2) {
                            Image(systemName: trend >= 0 ? "arrow.up.right" : "arrow.down.right")
                                .font(.system(size: 9, weight: .semibold))
                            Text(String(format: "%.1f%%", abs(trend)))
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor({
                            let isPositive = trend >= 0
                            let showGreen = invertTrend ? !isPositive : isPositive
                            return showGreen ? Color(red: 0.13, green: 0.55, blue: 0.13) : Color(red: 0.86, green: 0.15, blue: 0.15)
                        }())
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.9), lineWidth: 0.5)
        )
        .opacity(opacity)
        .onAppear {
            animateValue()
        }
        .onChange(of: value) { _, _ in
            animateValue()
        }
    }

    private func animateValue() {
        // Extract the numeric part from the value
        let cleaned = value.replacingOccurrences(of: ",", with: "")

        // For duration strings like "5m 23s" or "0m 0s", just fade in
        if value.contains("m ") || value.contains("h ") {
            withAnimation(.easeOut(duration: 0.4)) {
                displayValue = value
                opacity = 1
            }
            return
        }

        // Try to extract a number
        let prefix = value.hasPrefix("$") ? "$" : ""
        let suffix = value.hasSuffix("%") ? "%" : ""
        let numStr = cleaned
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: "%", with: "")
            .trimmingCharacters(in: .whitespaces)

        guard let targetNum = Double(numStr), targetNum > 0 else {
            withAnimation(.easeOut(duration: 0.4)) {
                displayValue = value
                opacity = 1
            }
            return
        }

        // Animate counting up
        let steps = 20
        let duration = 0.6
        let interval = duration / Double(steps)

        displayValue = "\(prefix)0\(suffix)"
        withAnimation(.easeOut(duration: 0.3)) {
            opacity = 1
        }

        for i in 1...steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) {
                let progress = easeOutCubic(Double(i) / Double(steps))
                let current = targetNum * progress

                if targetNum == Double(Int(targetNum)) {
                    // Integer value
                    displayValue = "\(prefix)\(Int(current))\(suffix)"
                } else {
                    // Decimal value
                    displayValue = "\(prefix)\(String(format: "%.1f", current))\(suffix)"
                }

                // Ensure final value is exact
                if i == steps {
                    displayValue = value
                }
            }
        }
    }

    private func easeOutCubic(_ t: Double) -> Double {
        1 - pow(1 - t, 3)
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
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .foregroundColor(Color(white: 0.45))

            HStack(spacing: 12) {
                // Your bar
                VStack(alignment: .leading, spacing: 3) {
                    Text("You: \(yours)")
                        .font(.system(size: 12))
                        .foregroundColor(.black)
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.black)
                            .frame(width: max(geo.size.width * (yourValue / maxVal), 2))
                    }
                    .frame(height: 4)
                }

                // Team bar
                VStack(alignment: .leading, spacing: 3) {
                    Text("Team: \(team)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(white: 0.8))
                            .frame(width: max(geo.size.width * (teamValue / maxVal), 2))
                    }
                    .frame(height: 4)
                }
            }
        }
    }
}

// MARK: - Objection Bar Row

struct ObjectionBarRow: View {
    let objection: ObjectionBreakdown
    let maxAmount: Int
    let formatCurrency: (Int) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(objection.objectionLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.black)

                Spacer()

                HStack(spacing: 6) {
                    Text(formatCurrency(objection.lostAmount))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(red: 0.86, green: 0.15, blue: 0.15))

                    Text("\(objection.dealCount) deal\(objection.dealCount == 1 ? "" : "s")")
                        .font(.system(size: 10))
                        .foregroundColor(Color(white: 0.5))

                    if objection.trend != 0 {
                        HStack(spacing: 2) {
                            Image(systemName: objection.trend > 0 ? "arrow.up.right" : "arrow.down.right")
                                .font(.system(size: 8, weight: .semibold))
                            Text(String(format: "%.0f%%", abs(objection.trend)))
                                .font(.system(size: 9, weight: .medium))
                        }
                        .foregroundColor(objection.trend > 0 ? Color(red: 0.86, green: 0.15, blue: 0.15) : Color(red: 0.13, green: 0.55, blue: 0.13))
                    }
                }
            }

            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(red: 0.86, green: 0.15, blue: 0.15).opacity(0.3))
                    .frame(width: max(geo.size.width * (Double(objection.lostAmount) / Double(max(maxAmount, 1))), 4))
            }
            .frame(height: 4)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Overcome Rate Row

struct OvercomeRateRow: View {
    let item: LostObjectionItem

    private var rate: Int { item.overcomeRate ?? 0 }

    private var rateColor: Color {
        if rate >= 60 { return Color(red: 0.13, green: 0.55, blue: 0.13) }
        if rate >= 40 { return Color(red: 0.85, green: 0.65, blue: 0) }
        return Color(red: 0.86, green: 0.15, blue: 0.15)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.objectionLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.black)

                Spacer()

                Text("\(rate)%")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(rateColor)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(white: 0.9))

                    RoundedRectangle(cornerRadius: 2)
                        .fill(rateColor)
                        .frame(width: max(geo.size.width * (Double(rate) / 100.0), 2))
                }
            }
            .frame(height: 6)
        }
        .padding(.vertical, 2)
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
