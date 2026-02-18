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

    // View mode toggle and week navigation
    @State private var viewMode: ScheduleViewMode = .week
    @State private var weekOffset: Int = 0

    // Selected event for join confirmation
    @State private var selectedEvent: CalendarEvent?

    private let hourHeight: CGFloat = 60.0
    private let gridStartHour: Int = 6   // 6 AM
    private let gridEndHour: Int = 22    // 10 PM

    private enum ScheduleViewMode: String, CaseIterable {
        case list = "List"
        case week = "Week"
    }

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
        .onChange(of: weekOffset) {
            Task { await fetchCalendarData() }
        }
        .onChange(of: viewMode) {
            Task { await fetchCalendarData() }
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

            if viewMode == .list {
                // Events list or empty state
                if events.isEmpty {
                    emptyEventsView
                } else {
                    eventsList
                }
            } else {
                weeklyCalendarView
            }
        }
        .sheet(item: $selectedEvent) { event in
            meetingConfirmationSheet(event)
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
                // Meeting icon
                ZStack {
                    Circle()
                        .fill(Color(white: 0.96))
                        .frame(width: 56, height: 56)

                    Image(systemName: "video.fill")
                        .font(.system(size: 24))
                        .foregroundColor(Color(white: 0.4))
                }

                // Meeting title
                Text(event.title)
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)

                // Time
                Text(event.isAllDay == true ? "All day" : "\(formatTime(event.startTime)) – \(formatTime(event.endTime))")
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Color(white: 0.5))

                // Platform
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

            // Action buttons
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

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 0) {
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

                // View mode toggle
                Picker("View", selection: $viewMode) {
                    ForEach(ScheduleViewMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 120)

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
            .padding(.vertical, 10)

            // Week navigation bar (only in week mode)
            if viewMode == .week {
                HStack(spacing: 12) {
                    Button(action: { weekOffset -= 1 }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(white: 0.35))
                    }
                    .buttonStyle(.plain)

                    Button(action: { weekOffset = 0 }) {
                        Text("Today")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(weekOffset == 0 ? Color(red: 0.2, green: 0.5, blue: 0.9) : Color(white: 0.35))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                weekOffset == 0
                                    ? Color(red: 0.2, green: 0.5, blue: 0.9).opacity(0.1)
                                    : Color(white: 0.94)
                            )
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)

                    Button(action: { weekOffset += 1 }) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(white: 0.35))
                    }
                    .buttonStyle(.plain)

                    Text(weekLabel)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.black)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
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
            if event.meetingUrl != nil {
                Button(action: {
                    selectedEvent = event
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

    // MARK: - Weekly Calendar Grid

    private var weeklyCalendarView: some View {
        let dates = currentWeekDates
        let totalHeight = CGFloat(gridEndHour - gridStartHour) * hourHeight

        return VStack(spacing: 0) {
            // Day header row
            HStack(spacing: 0) {
                // Spacer for time column
                Color.clear
                    .frame(width: 52, height: 1)

                ForEach(dates, id: \.self) { date in
                    dayHeaderCell(date)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 8)
            .background(Color.white)

            Divider()

            // Scrollable time grid
            ScrollView(.vertical, showsIndicators: true) {
                HStack(alignment: .top, spacing: 0) {
                    // Hour labels column
                    VStack(spacing: 0) {
                        ForEach(gridStartHour..<gridEndHour, id: \.self) { hour in
                            Text(formatHourLabel(hour))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Color(white: 0.5))
                                .frame(width: 52, height: hourHeight, alignment: .topTrailing)
                                .padding(.trailing, 6)
                                .offset(y: -6)
                        }
                    }

                    // Day columns
                    ForEach(dates, id: \.self) { date in
                        dayColumn(date: date, totalHeight: totalHeight)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .background(Color(white: 0.97))
    }

    private func dayHeaderCell(_ date: Date) -> some View {
        let calendar = Calendar.current
        let isToday = calendar.isDateInToday(date)
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "EEE"
        let dayName = dayFormatter.string(from: date)
        let dayNumber = calendar.component(.day, from: date)

        return VStack(spacing: 4) {
            Text(dayName.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.3)
                .foregroundColor(isToday ? Color(red: 0.2, green: 0.5, blue: 0.9) : Color(white: 0.5))

            ZStack {
                if isToday {
                    Circle()
                        .fill(Color(red: 0.2, green: 0.5, blue: 0.9))
                        .frame(width: 28, height: 28)
                }
                Text("\(dayNumber)")
                    .font(.system(size: 14, weight: isToday ? .bold : .regular))
                    .foregroundColor(isToday ? .white : .black)
            }
        }
    }

    private func dayColumn(date: Date, totalHeight: CGFloat) -> some View {
        let calendar = Calendar.current
        let isToday = calendar.isDateInToday(date)
        let dayEvents = eventsForDate(date)

        return ZStack(alignment: .topLeading) {
            // Today background highlight
            if isToday {
                Rectangle()
                    .fill(Color(red: 0.93, green: 0.95, blue: 1.0).opacity(0.5))
            }

            // Hourly grid lines
            VStack(spacing: 0) {
                ForEach(gridStartHour..<gridEndHour, id: \.self) { _ in
                    Rectangle()
                        .fill(Color(white: 0.88))
                        .frame(height: 0.5)
                        .frame(maxWidth: .infinity)
                        .frame(height: hourHeight, alignment: .top)
                }
            }

            // Event blocks
            ForEach(dayEvents) { event in
                weekEventBlock(event)
            }

            // Current time indicator
            if isToday {
                currentTimeIndicator
            }
        }
        .frame(height: totalHeight)
        .clipped()
    }

    private func weekEventBlock(_ event: CalendarEvent) -> some View {
        let yOffset = eventYOffset(event)
        let height = eventBlockHeight(event)
        let urgency = eventUrgency(event)
        let color = urgencyBlockColor(urgency)
        let hasMeeting = event.meetingUrl != nil

        return VStack(alignment: .leading, spacing: 1) {
            Text(event.title)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(height > 35 ? 2 : 1)

            if height > 30 {
                Text(formatTime(event.startTime))
                    .font(.system(size: 9))
                    .opacity(0.85)
            }

            if height > 50, let platform = meetingPlatformName(event) {
                HStack(spacing: 2) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 7))
                    Text(platform)
                        .font(.system(size: 8))
                }
                .opacity(0.85)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.vertical, 3)
        .frame(height: max(height, 18), alignment: .top)
        .background(color.opacity(0.9))
        .foregroundColor(.white)
        .cornerRadius(4)
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(color, lineWidth: 1)
        )
        .shadow(color: color.opacity(0.2), radius: 2, x: 0, y: 1)
        .offset(y: yOffset)
        .padding(.horizontal, 2)
        .onTapGesture {
            selectedEvent = event
        }
        .help(hasMeeting ? "\(event.title) — Click for details" : event.title)
    }

    private var currentTimeIndicator: some View {
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: now)
        let minute = calendar.component(.minute, from: now)
        let yPosition = CGFloat(hour - gridStartHour) * hourHeight + CGFloat(minute) / 60.0 * hourHeight

        return HStack(spacing: 0) {
            Circle()
                .fill(Color.red)
                .frame(width: 8, height: 8)
            Rectangle()
                .fill(Color.red)
                .frame(height: 2)
                .frame(maxWidth: .infinity)
        }
        .offset(y: yPosition - 4)
    }

    // MARK: - Week View Helpers

    private var currentWeekDates: [Date] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        // weekday: 1=Sunday, 2=Monday, ..., 7=Saturday
        let weekday = calendar.component(.weekday, from: today)
        let daysToMonday = (weekday == 1) ? -6 : (2 - weekday)
        guard let monday = calendar.date(byAdding: .day, value: daysToMonday + (weekOffset * 7), to: today) else {
            return []
        }
        return (0..<7).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: monday)
        }
    }

    private var weekLabel: String {
        let dates = currentWeekDates
        guard let first = dates.first, let last = dates.last else { return "" }
        let calendar = Calendar.current
        let sameMonth = calendar.component(.month, from: first) == calendar.component(.month, from: last)

        let formatter = DateFormatter()
        if sameMonth {
            formatter.dateFormat = "MMM d"
            let startStr = formatter.string(from: first)
            formatter.dateFormat = "d, yyyy"
            let endStr = formatter.string(from: last)
            return "\(startStr) – \(endStr)"
        } else {
            formatter.dateFormat = "MMM d"
            let startStr = formatter.string(from: first)
            formatter.dateFormat = "MMM d, yyyy"
            let endStr = formatter.string(from: last)
            return "\(startStr) – \(endStr)"
        }
    }

    private func eventsForDate(_ date: Date) -> [CalendarEvent] {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { return [] }
        let startMs = startOfDay.timeIntervalSince1970 * 1000
        let endMs = endOfDay.timeIntervalSince1970 * 1000

        return events.filter { $0.startTime >= startMs && $0.startTime < endMs }
            .sorted { $0.startTime < $1.startTime }
    }

    private func eventYOffset(_ event: CalendarEvent) -> CGFloat {
        let date = Date(timeIntervalSince1970: event.startTime / 1000)
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        let effectiveHour = max(hour, gridStartHour)
        let effectiveMinute = hour < gridStartHour ? 0 : minute
        return CGFloat(effectiveHour - gridStartHour) * hourHeight + CGFloat(effectiveMinute) / 60.0 * hourHeight
    }

    private func eventBlockHeight(_ event: CalendarEvent) -> CGFloat {
        let durationMs = event.endTime - event.startTime
        let durationMinutes = durationMs / 60000
        return max(CGFloat(durationMinutes) / 60.0 * hourHeight, 18)
    }

    private func urgencyBlockColor(_ urgency: EventUrgency) -> Color {
        switch urgency {
        case .now: return Color(red: 0.9, green: 0.25, blue: 0.25)
        case .soon: return Color(red: 0.85, green: 0.65, blue: 0.15)
        case .later: return Color(red: 0.2, green: 0.65, blue: 0.4)
        case .future: return Color(red: 0.3, green: 0.5, blue: 0.85)
        case .past: return Color(white: 0.6)
        }
    }

    private func formatHourLabel(_ hour: Int) -> String {
        if hour == 0 { return "12 AM" }
        if hour < 12 { return "\(hour) AM" }
        if hour == 12 { return "12 PM" }
        return "\(hour - 12) PM"
    }

    private var fetchDateRange: (Date, Date) {
        let calendar = Calendar.current
        if viewMode == .week {
            let dates = currentWeekDates
            guard let first = dates.first, let last = dates.last,
                  let end = calendar.date(byAdding: .day, value: 1, to: last) else {
                let today = calendar.startOfDay(for: Date())
                return (today, calendar.date(byAdding: .day, value: 7, to: today)!)
            }
            return (first, end)
        } else {
            let startOfDay = calendar.startOfDay(for: Date())
            let endDate = calendar.date(byAdding: .day, value: 7, to: startOfDay)!
            return (startOfDay, endDate)
        }
    }

    // MARK: - Urgency System

    private enum EventUrgency {
        case now        // Starting within 5 minutes or currently in progress
        case soon       // Starting within 1 hour
        case later      // Starting later today
        case future     // Tomorrow or later
        case past       // Already ended
    }

    private func eventUrgency(_ event: CalendarEvent) -> EventUrgency {
        let nowMs = now.timeIntervalSince1970 * 1000
        let startDiffMinutes = (event.startTime - nowMs) / 60000
        let endDiffMinutes = (event.endTime - nowMs) / 60000

        // Check if event has already ended
        if endDiffMinutes < 0 {
            return .past
        }

        // Event is currently in progress (started but not ended)
        if startDiffMinutes < 0 && endDiffMinutes >= 0 {
            return .now
        }

        // Event starts in the future
        if startDiffMinutes <= 5 {
            return .now     // Starting very soon (within 5 minutes)
        } else if startDiffMinutes <= 60 {
            return .soon    // Starting within an hour
        } else if startDiffMinutes <= 24 * 60 {
            return .later   // Starting later today
        } else {
            return .future  // Tomorrow or later
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
            case .past:
                return ("ENDED", Color(white: 0.93), Color(white: 0.55))
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
        // 1. Send a meeting bot to join the call (async, fire-and-forget)
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
                    print("[ScheduleView] Bot creation \(success ? "succeeded" : "failed") for: \(event.title)")
                } catch {
                    print("[ScheduleView] Failed to create bot: \(error)")
                }
            }
        }

        // 2. Open Ammo Panel snapped to right side of screen
        WindowManager.shared.openAmmoPanelSnapped(appState: appState)

        // 3. Open meeting URL in default browser/app (will appear on left)
        if let url = URL(string: meetingUrl) {
            NSWorkspace.shared.open(url)
        }

        // 4. After browser opens, resize it to fit the left side (alongside Ammo Panel)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            WindowManager.shared.resizeFrontmostWindowToLeft()
        }

        // 5. Start recording with event title as prospect name (after delay)
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
                let (rangeStart, rangeEnd) = fetchDateRange

                let fetchedEvents = try await appState.convexService.getCalendarEvents(
                    email: email,
                    teamId: teamId,
                    startDate: Int64(rangeStart.timeIntervalSince1970 * 1000),
                    endDate: Int64(rangeEnd.timeIntervalSince1970 * 1000)
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
