//
//  ScheduleView.swift
//  Sequ3nce
//
//  Schedule window - shows calendar events from ICS feed
//  Matches Electron ScheduleApp.tsx
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

    private var closerEmail: String? {
        appState.closerInfo?.email
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
        .background(Color.white)
        .onAppear {
            Task {
                await fetchCalendarData()
            }
        }
        .onReceive(timer) { _ in
            now = Date()
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
            Spacer()
        }
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Text(message)
                .foregroundColor(.red)
                .multilineTextAlignment(.center)

            Button("Try Again") {
                error = nil
                Task {
                    await fetchCalendarData()
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(white: 0.95))
            .cornerRadius(8)
            Spacer()
        }
        .padding()
    }

    // MARK: - Not Logged In View

    private var notLoggedInView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundColor(Color(white: 0.75))

            Text("Not Logged In")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Color(white: 0.45))

            Text("Please log in to access your schedule.")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.55))
            Spacer()
        }
        .padding()
    }

    // MARK: - Connection Form View

    private var connectionFormView: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Icon and header
                VStack(spacing: 16) {
                    Image(systemName: "calendar")
                        .font(.system(size: 48))
                        .foregroundColor(Color(white: 0.75))

                    Text("Connect Your Calendar")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.black)

                    Text("See your schedule in Sequ3nce by connecting your calendar via ICS feed URL.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.55))
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 32)

                // Form
                VStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("ICS Feed URL")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(white: 0.45))

                        TextField("https://calendar.google.com/calendar/ical/...", text: $icsUrl)
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

                    Button(action: handleConnect) {
                        HStack {
                            if isConnecting {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                Text("Connecting...")
                            } else {
                                Text("Connect Calendar")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .background(canConnect ? Color.black : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canConnect || isConnecting)
                }
                .frame(maxWidth: 320)

                // Help section
                VStack(alignment: .leading, spacing: 12) {
                    Button(action: { showHelp.toggle() }) {
                        HStack(spacing: 8) {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12))
                                .rotationEffect(.degrees(showHelp ? 90 : 0))
                            Text("How do I find my ICS URL?")
                                .font(.system(size: 14))
                        }
                        .foregroundColor(Color(white: 0.55))
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
                        .background(Color(white: 0.97))
                        .cornerRadius(8)
                    }
                }
                .frame(maxWidth: 320)
                .animation(.easeInOut(duration: 0.2), value: showHelp)

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 24)
        }
    }

    private func helpSection(title: String, steps: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.black)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(index + 1).")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.55))
                            .frame(width: 16, alignment: .trailing)
                        Text(step)
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.55))
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
            // Next up banner
            if let nextEvent = nextUpcomingEvent {
                nextUpBanner(event: nextEvent)
            }

            // Sync status bar
            syncStatusBar

            // Events list
            if events.isEmpty {
                emptyEventsView
            } else {
                eventsList
            }
        }
    }

    private func nextUpBanner(event: CalendarEvent) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT UP IN \(timeUntilEvent(event))")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(white: 0.6))
                    .tracking(0.5)

                Text(event.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
            }

            Spacer()

            Text(formatTime(event.startTime))
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.75))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black)
    }

    private var syncStatusBar: some View {
        HStack {
            Text("Last synced: \(formatLastSynced(calendarStatus?.lastSynced))")
                .font(.system(size: 12))
                .foregroundColor(Color(white: 0.55))

            Spacer()

            HStack(spacing: 12) {
                Button(action: handleSync) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 12))
                            .rotationEffect(.degrees(isSyncing ? 360 : 0))
                            .animation(isSyncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isSyncing)
                        Text(isSyncing ? "Syncing..." : "Sync")
                            .font(.system(size: 12))
                    }
                    .foregroundColor(Color(white: 0.45))
                }
                .buttonStyle(.plain)
                .disabled(isSyncing)

                Button(action: handleDisconnect) {
                    Text("Disconnect")
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(white: 0.97))
        .overlay(
            Rectangle()
                .fill(Color(white: 0.88))
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private var emptyEventsView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "calendar")
                .font(.system(size: 36))
                .foregroundColor(Color(white: 0.75))

            Text("No upcoming events")
                .font(.system(size: 14))
                .foregroundColor(Color(white: 0.55))
            Spacer()
        }
    }

    private var eventsList: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                ForEach(groupedEvents.keys.sorted(), id: \.self) { dateKey in
                    Section {
                        ForEach(groupedEvents[dateKey] ?? []) { event in
                            eventRow(event)
                            Divider()
                                .padding(.leading, 80)
                        }
                    } header: {
                        HStack {
                            Text(formatDateHeader(dateKey))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(white: 0.55))
                                .textCase(.uppercase)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.97))
                    }
                }
            }
        }
    }

    private func eventRow(_ event: CalendarEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Time column
            VStack(alignment: .trailing, spacing: 2) {
                Text(event.isAllDay == true ? "All day" : formatTime(event.startTime))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.black)

                if event.isAllDay != true {
                    Text(formatTime(event.endTime))
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.6))
                }
            }
            .frame(width: 56, alignment: .trailing)

            // Event details
            VStack(alignment: .leading, spacing: 4) {
                Text(event.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.black)
                    .lineLimit(2)

                if let description = event.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.55))
                        .lineLimit(1)
                }

                if let location = event.location, !location.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "mappin")
                            .font(.system(size: 10))
                        Text(location)
                            .font(.system(size: 12))
                    }
                    .foregroundColor(Color(white: 0.6))
                    .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
        .contentShape(Rectangle())
    }

    // MARK: - Data Fetching

    private func fetchCalendarData() async {
        guard let email = closerEmail else {
            isLoading = false
            return
        }

        isLoading = true
        error = nil

        do {
            // Get calendar status
            let status = try await appState.convexService.getCalendarStatus(email: email)
            await MainActor.run {
                calendarStatus = status
            }

            if status?.connected == true {
                // Get events for next 7 days
                let startOfDay = Calendar.current.startOfDay(for: Date())
                let endDate = Calendar.current.date(byAdding: .day, value: 7, to: startOfDay)!

                let fetchedEvents = try await appState.convexService.getCalendarEvents(
                    email: email,
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
        guard let email = closerEmail, !icsUrl.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        isConnecting = true
        error = nil

        Task {
            do {
                try await appState.convexService.connectCalendar(email: email, icsUrl: icsUrl.trimmingCharacters(in: .whitespaces))
                try await appState.convexService.syncCalendar(email: email)
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
        guard let email = closerEmail else { return }

        isLoading = true
        error = nil

        Task {
            do {
                try await appState.convexService.disconnectCalendar(email: email)
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
        guard let email = closerEmail else { return }

        isSyncing = true
        error = nil

        Task {
            do {
                try await appState.convexService.syncCalendar(email: email)
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

    // MARK: - Helper Functions

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

        if minutes < 60 {
            return "\(minutes) minute\(minutes != 1 ? "s" : "")"
        }

        let hours = minutes / 60
        let remainingMins = minutes % 60

        if hours < 24 {
            if remainingMins > 0 {
                return "\(hours)h \(remainingMins)m"
            }
            return "\(hours) hour\(hours != 1 ? "s" : "")"
        }

        let days = hours / 24
        return "\(days) day\(days != 1 ? "s" : "")"
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
        guard let timestamp = timestamp else { return "Never" }

        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let diff = now.timeIntervalSince(date)
        let minutes = Int(diff / 60)

        if minutes < 1 { return "Just now" }
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
        .frame(width: 360, height: 500)
}
