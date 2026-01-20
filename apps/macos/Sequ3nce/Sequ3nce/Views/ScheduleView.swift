//
//  ScheduleView.swift
//  Sequ3nce
//
//  Schedule window - shows calendar events from ICS feed
//  Premium UI with card-based design, urgency indicators, and one-click join
//

import SwiftUI

struct ScheduleView: View {
    @EnvironmentObject var appState: AppState

    @State private var calendarStatus: CalendarStatus?
    @State private var events: [CalendarEvent] = []
    @State private var isLoading = true
    @State private var isSyncing = false
    @State private var error: String?

    // Connection form state
    @State private var icsUrl = ""
    @State private var isConnecting = false
    @State private var showHelp = false

    // Current time for countdown (updated every minute)
    @State private var now = Date()
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    // Auto-sync timer (every 5 minutes)
    private let autoSyncTimer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()

    private var closerEmail: String? {
        appState.closerInfo?.email
    }

    private var closerTeamId: String? {
        appState.closerInfo?.teamId
    }

    var body: some View {
        VStack(spacing: 0) {
            if isLoading {
                loadingView
            } else if let error = error {
                errorView(error)
            } else if closerEmail == nil {
                notLoggedInView
            } else if calendarStatus?.connected != true {
                connectionFormView
            } else {
                connectedView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(white: 0.96))  // Subtle gray background
        .onAppear {
            Task {
                await fetchCalendarData()
            }
        }
        .onReceive(timer) { _ in
            now = Date()
        }
        .onReceive(autoSyncTimer) { _ in
            Task {
                await silentSync()
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading schedule...")
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))
            Spacer()
        }
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(Color(red: 0.9, green: 0.3, blue: 0.3))

            Text("Something went wrong")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.black)

            Text(message)
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))
                .multilineTextAlignment(.center)

            Button("Try Again") {
                error = nil
                Task {
                    await fetchCalendarData()
                }
            }
            .buttonStyle(.plain)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color.black)
            .cornerRadius(8)

            Spacer()
        }
        .padding(24)
    }

    // MARK: - Not Logged In View

    private var notLoggedInView: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "lock.fill")
                .font(.system(size: 40))
                .foregroundColor(Color(white: 0.7))

            Text("Not Logged In")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.black)

            Text("Please log in to access your schedule.")
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))

            Spacer()
        }
        .padding(24)
    }

    // MARK: - Connection Form View

    private var connectionFormView: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Icon and header
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color(white: 0.94))
                            .frame(width: 80, height: 80)

                        Image(systemName: "calendar.badge.plus")
                            .font(.system(size: 32))
                            .foregroundColor(Color(white: 0.4))
                    }

                    Text("Connect Your Calendar")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.black)

                    Text("See your schedule and join meetings with one click.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.5))
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)

                // Form
                VStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("ICS Feed URL")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color(white: 0.4))

                        TextField("https://calendar.google.com/calendar/ical/...", text: $icsUrl)
                            .textFieldStyle(.plain)
                            .foregroundColor(.black)
                            .font(.system(size: 14))
                            .padding(14)
                            .background(Color.white)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(white: 0.88), lineWidth: 1)
                            )
                    }

                    Button(action: handleConnect) {
                        HStack(spacing: 8) {
                            if isConnecting {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                Text("Connecting...")
                            } else {
                                Image(systemName: "link")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Connect Calendar")
                            }
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(14)
                        .background(canConnect ? Color.black : Color(white: 0.8))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canConnect || isConnecting)
                }
                .frame(maxWidth: 320)

                // Help section
                VStack(alignment: .leading, spacing: 12) {
                    Button(action: { withAnimation(.easeInOut(duration: 0.2)) { showHelp.toggle() } }) {
                        HStack(spacing: 8) {
                            Image(systemName: "questionmark.circle")
                                .font(.system(size: 14))
                            Text("How do I find my ICS URL?")
                                .font(.system(size: 13))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                                .rotationEffect(.degrees(showHelp ? 90 : 0))
                        }
                        .foregroundColor(Color(white: 0.45))
                    }
                    .buttonStyle(.plain)

                    if showHelp {
                        VStack(alignment: .leading, spacing: 16) {
                            helpSection(
                                title: "Google Calendar",
                                steps: [
                                    "Go to calendar.google.com",
                                    "Click the three dots next to your calendar",
                                    "Click \"Settings and sharing\"",
                                    "Scroll to \"Integrate calendar\"",
                                    "Copy \"Secret address in iCal format\""
                                ]
                            )

                            helpSection(
                                title: "Calendly",
                                steps: [
                                    "Go to calendly.com/app/scheduled_events",
                                    "Click \"Export\"",
                                    "Copy the ICS feed URL"
                                ]
                            )

                            helpSection(
                                title: "Outlook",
                                steps: [
                                    "Go to outlook.com calendar",
                                    "Settings → View all Outlook settings",
                                    "Calendar → Shared calendars",
                                    "Publish a calendar → Create ICS link"
                                ]
                            )

                            helpSection(
                                title: "Cal.com",
                                steps: [
                                    "Go to app.cal.com",
                                    "Settings → Calendar",
                                    "Copy your ICS feed URL"
                                ]
                            )
                        }
                        .padding(16)
                        .background(Color.white)
                        .cornerRadius(10)
                    }
                }
                .frame(maxWidth: 320)

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
        }
    }

    private func helpSection(title: String, steps: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.black)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(index + 1).")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))
                            .frame(width: 16, alignment: .trailing)
                        Text(step)
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))
                    }
                }
            }
        }
    }

    private var canConnect: Bool {
        !icsUrl.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Connected View

    private var connectedView: some View {
        VStack(spacing: 0) {
            // Header
            header

            // Events list or empty state
            if events.isEmpty {
                emptyEventsView
            } else {
                eventsList
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center) {
            // Last synced with icon
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.2, green: 0.7, blue: 0.4))

                Text("Synced \(formatLastSynced(calendarStatus?.lastSynced))")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }

            Spacer()

            // Action buttons (subtle)
            HStack(spacing: 16) {
                Button(action: handleSync) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 11, weight: .medium))
                            .rotationEffect(.degrees(isSyncing ? 360 : 0))
                            .animation(isSyncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isSyncing)
                        Text(isSyncing ? "Syncing" : "Refresh")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Color(white: 0.4))
                }
                .buttonStyle(.plain)
                .disabled(isSyncing)

                Button(action: handleDisconnect) {
                    Text("Disconnect")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(white: 0.5))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
    }

    // MARK: - Empty Events View

    private var emptyEventsView: some View {
        VStack(spacing: 16) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color(white: 0.94))
                    .frame(width: 80, height: 80)

                Image(systemName: "calendar")
                    .font(.system(size: 32))
                    .foregroundColor(Color(white: 0.6))
            }

            Text("No upcoming meetings")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.black)

            Text("Your calendar is clear for the next 7 days.")
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.5))

            Spacer()
        }
        .padding(24)
    }

    // MARK: - Events List

    private var eventsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(groupedEvents.keys.sorted(), id: \.self) { dateKey in
                    VStack(alignment: .leading, spacing: 8) {
                        // Date header
                        Text(formatDateHeader(dateKey))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Color(white: 0.45))
                            .textCase(.uppercase)
                            .tracking(0.5)
                            .padding(.horizontal, 4)

                        // Event cards for this date
                        ForEach(groupedEvents[dateKey] ?? []) { event in
                            eventCard(event)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    // MARK: - Event Card (Premium Design)

    private func eventCard(_ event: CalendarEvent) -> some View {
        let urgency = eventUrgency(event)

        return VStack(alignment: .leading, spacing: 12) {
            // Top row: Urgency badge + Time
            HStack(alignment: .center) {
                // Urgency badge
                urgencyBadge(urgency)

                Spacer()

                // Time display
                Text(event.isAllDay == true ? "All day" : "\(formatTime(event.startTime)) - \(formatTime(event.endTime))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(white: 0.45))
            }

            // Meeting title
            Text(event.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.black)
                .lineLimit(2)

            // Meeting platform (if video meeting)
            if let platformName = meetingPlatformName(event) {
                HStack(spacing: 6) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 11))
                    Text(platformName)
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Color(red: 0.2, green: 0.5, blue: 0.9))
            } else if let location = event.location, !location.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "mappin")
                        .font(.system(size: 11))
                    Text(location)
                        .font(.system(size: 12))
                        .lineLimit(1)
                }
                .foregroundColor(Color(white: 0.5))
            }

            // Join & Record button (only for meetings with video URLs)
            if let meetingUrl = event.meetingUrl {
                Button(action: {
                    joinAndRecord(event: event, meetingUrl: meetingUrl)
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "video.fill")
                            .font(.system(size: 12))
                        Text("Join & Record")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.black)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(16)
        .background(Color.white)
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 2)
    }

    // MARK: - Urgency System

    private enum EventUrgency {
        case now        // Starting within 5 minutes or in progress
        case soon       // Starting within 1 hour
        case later      // Starting later today
        case future     // Tomorrow or later
    }

    private func eventUrgency(_ event: CalendarEvent) -> EventUrgency {
        let nowMs = now.timeIntervalSince1970 * 1000
        let diffMinutes = (event.startTime - nowMs) / 60000

        if diffMinutes <= 5 {
            return .now
        } else if diffMinutes <= 60 {
            return .soon
        } else if diffMinutes <= 24 * 60 {
            return .later
        } else {
            return .future
        }
    }

    @ViewBuilder
    private func urgencyBadge(_ urgency: EventUrgency) -> some View {
        let (text, bgColor, textColor): (String, Color, Color) = {
            switch urgency {
            case .now:
                return ("STARTING NOW", Color(red: 0.95, green: 0.2, blue: 0.2), .white)
            case .soon:
                return ("SOON", Color(red: 1.0, green: 0.8, blue: 0.3), Color(red: 0.5, green: 0.4, blue: 0.1))
            case .later:
                return ("TODAY", Color(red: 0.9, green: 0.95, blue: 0.9), Color(red: 0.2, green: 0.55, blue: 0.3))
            case .future:
                return ("UPCOMING", Color(white: 0.93), Color(white: 0.45))
            }
        }()

        Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(0.5)
            .foregroundColor(textColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(bgColor)
            .cornerRadius(4)
    }

    // MARK: - Helper Functions

    private func meetingPlatformName(_ event: CalendarEvent) -> String? {
        guard let url = event.meetingUrl?.lowercased() else { return nil }
        if url.contains("zoom.us") { return "Zoom Meeting" }
        if url.contains("meet.google.com") { return "Google Meet" }
        if url.contains("teams.microsoft.com") { return "Microsoft Teams" }
        if url.contains("webex.com") { return "Webex" }
        return "Video Call"
    }

    private func joinAndRecord(event: CalendarEvent, meetingUrl: String) {
        // 1. Open Ammo Panel snapped to right side of screen FIRST
        WindowManager.shared.openAmmoPanelSnapped(appState: appState)

        // 2. Open meeting URL in default browser/app (will appear on left)
        if let url = URL(string: meetingUrl) {
            NSWorkspace.shared.open(url)
        }

        // 3. After browser opens, resize it to fit the left side (alongside Ammo Panel)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            WindowManager.shared.resizeFrontmostWindowToLeft()
        }

        // 4. Start recording with event title as prospect name (after delay)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NotificationCenter.default.post(
                name: Notification.Name("StartRecordingFromCalendar"),
                object: nil,
                userInfo: ["prospectName": event.title]
            )
        }
    }

    // MARK: - Data Fetching

    private func fetchCalendarData() async {
        guard let email = closerEmail, let teamId = closerTeamId else {
            isLoading = false
            return
        }

        isLoading = true
        error = nil

        do {
            let status = try await appState.convexService.getCalendarStatus(email: email, teamId: teamId)
            await MainActor.run {
                calendarStatus = status
            }

            if status?.connected == true {
                let startOfDay = Calendar.current.startOfDay(for: Date())
                let endDate = Calendar.current.date(byAdding: .day, value: 7, to: startOfDay)!

                let fetchedEvents = try await appState.convexService.getCalendarEvents(
                    email: email,
                    teamId: teamId,
                    startDate: Int64(startOfDay.timeIntervalSince1970 * 1000),
                    endDate: Int64(endDate.timeIntervalSince1970 * 1000)
                )

                await MainActor.run {
                    events = fetchedEvents
                }
            }
        } catch {
            await MainActor.run {
                self.error = "Failed to load calendar"
            }
        }

        await MainActor.run {
            isLoading = false
        }
    }

    private func handleConnect() {
        guard let email = closerEmail, let teamId = closerTeamId, !icsUrl.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        isConnecting = true
        error = nil

        Task {
            do {
                try await appState.convexService.connectCalendar(email: email, teamId: teamId, icsUrl: icsUrl.trimmingCharacters(in: .whitespaces))
                try await appState.convexService.syncCalendar(email: email, teamId: teamId)
                await fetchCalendarData()
                await MainActor.run {
                    icsUrl = ""
                    isConnecting = false
                }
            } catch let err {
                await MainActor.run {
                    error = err.localizedDescription
                    isConnecting = false
                }
            }
        }
    }

    private func handleDisconnect() {
        guard let email = closerEmail, let teamId = closerTeamId else { return }

        isLoading = true
        error = nil

        Task {
            do {
                try await appState.convexService.disconnectCalendar(email: email, teamId: teamId)
                await MainActor.run {
                    calendarStatus = nil
                    events = []
                    isLoading = false
                }
            } catch let err {
                await MainActor.run {
                    error = err.localizedDescription
                    isLoading = false
                }
            }
        }
    }

    private func handleSync() {
        guard let email = closerEmail, let teamId = closerTeamId else { return }

        isSyncing = true
        error = nil

        Task {
            do {
                try await appState.convexService.syncCalendar(email: email, teamId: teamId)
                await fetchCalendarData()
            } catch {
                await MainActor.run {
                    self.error = "Failed to sync calendar"
                }
            }
            await MainActor.run {
                isSyncing = false
            }
        }
    }

    private func silentSync() async {
        guard let email = closerEmail, let teamId = closerTeamId else { return }
        guard calendarStatus?.connected == true else { return }

        do {
            try await appState.convexService.syncCalendar(email: email, teamId: teamId)
            await fetchCalendarData()
        } catch {
            print("[ScheduleView] Auto-sync failed: \(error)")
        }
    }

    private var nextUpcomingEvent: CalendarEvent? {
        let nowMs = now.timeIntervalSince1970 * 1000
        return events.first { $0.startTime > nowMs }
    }

    private var groupedEvents: [String: [CalendarEvent]] {
        var grouped: [String: [CalendarEvent]] = [:]
        for event in events {
            let date = Date(timeIntervalSince1970: event.startTime / 1000)
            let dateKey = Calendar.current.startOfDay(for: date).timeIntervalSince1970.description
            if grouped[dateKey] == nil {
                grouped[dateKey] = []
            }
            grouped[dateKey]?.append(event)
        }
        return grouped
    }

    private func timeUntilEvent(_ event: CalendarEvent) -> String {
        let nowMs = now.timeIntervalSince1970 * 1000
        let diff = event.startTime - nowMs
        let minutes = Int(diff / 60000)

        if minutes < 0 {
            return "now"
        } else if minutes < 1 {
            return "now"
        } else if minutes < 60 {
            return "\(minutes) min"
        }

        let hours = minutes / 60
        let remainingMins = minutes % 60

        if hours < 24 {
            if remainingMins > 0 {
                return "\(hours)h \(remainingMins)m"
            }
            return "\(hours)h"
        }

        let days = hours / 24
        return "\(days)d"
    }

    private func formatTime(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private func formatDateHeader(_ dateKey: String) -> String {
        guard let timestamp = Double(dateKey) else { return "" }
        let date = Date(timeIntervalSince1970: timestamp)

        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInTomorrow(date) {
            return "Tomorrow"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE, MMM d"
            return formatter.string(from: date)
        }
    }

    private func formatLastSynced(_ timestamp: Double?) -> String {
        guard let timestamp = timestamp else { return "never" }

        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let diff = now.timeIntervalSince(date)
        let minutes = Int(diff / 60)

        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes) min ago" }

        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }

        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter.string(from: date)
    }
}

#Preview {
    ScheduleView()
        .environmentObject(AppState())
        .frame(width: 380, height: 600)
}
