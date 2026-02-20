//
//  ContentView.swift
//  Sequ3nce
//
//  Main window content - matches Electron app layout
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isAuthenticated, let closer = appState.closerInfo {
                MainRecordingView(closerInfo: closer)
            } else {
                LoginView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            print("[ContentView] onAppear - isAuthenticated: \(appState.isAuthenticated), hasCloserInfo: \(appState.closerInfo != nil)")
        }
        .onChange(of: appState.isAuthenticated) { oldValue, newValue in
            print("[ContentView] isAuthenticated changed: \(oldValue) -> \(newValue)")
        }
    }
}

// MARK: - Login View
struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            // Title bar area (draggable)
            Color.clear
                .frame(height: 32)

            Spacer()

            // Logo
            VStack(spacing: 16) {
                Image("Logo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 56)

                Text("Sign in to your account")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(.bottom, 32)

            // Login form
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textFieldStyle(.plain)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color(white: 0.96))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(white: 0.85), lineWidth: 1)
                    )
                    .textContentType(.emailAddress)
                    .disabled(isLoading)

                SecureField("Password", text: $password)
                    .textFieldStyle(.plain)
                    .foregroundColor(.black)
                    .padding(12)
                    .background(Color(white: 0.96))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(white: 0.85), lineWidth: 1)
                    )
                    .disabled(isLoading)

                Button(action: handleLogin) {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .scaleEffect(0.8)
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            Text("Signing in...")
                        } else {
                            Text("Sign In")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(12)
                    .background(canSubmit ? Color.black : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isLoading)

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: 280)

            Spacer()

            // Footer
            Text("Use the email and password your manager provided")
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .padding(.bottom, 24)
        }
        .padding(.horizontal, 24)
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty &&
        !password.isEmpty
    }

    private func handleLogin() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await appState.login(email: email, password: password)
                await MainActor.run {
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Main Recording View
struct MainRecordingView: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var windowManager = WindowManager.shared
    let closerInfo: CloserInfo

    @State private var showingSettings = false
    @State private var showingQuestionnaire = false
    @State private var pendingCallId: String?
    @State private var showSpeakFirstReminder = false
    @State private var prospectName: String = ""
    @State private var prospectNameSaved = false
    @State private var showProspectPrompt = false
    @State private var rolePlayParticipantCount = 0
    @State private var rolePlayPollingTimer: Timer?

    // Calendar: next upcoming event
    @State private var nextCalendarEvent: CalendarEvent?
    @State private var calendarPollingTimer: Timer?
    @State private var now = Date()
    private let timeUpdateTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    // App version
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    // User initials for profile avatar (e.g., "JD" for "John Doe")
    private var userInitials: String {
        let parts = closerInfo.name.split(separator: " ")
        if parts.count >= 2 {
            let first = parts[0].prefix(1).uppercased()
            let last = parts[1].prefix(1).uppercased()
            return "\(first)\(last)"
        } else if let first = parts.first {
            return String(first.prefix(2)).uppercased()
        }
        return "?"
    }

    var body: some View {
        ZStack {
            // Main content
            VStack(spacing: 0) {
                // Title bar with grouped action icons
                HStack {
                    Spacer()

                    // Calendar button with next meeting preview (separate, before the group)
                    if nextCalendarEvent != nil {
                        Button(action: {
                            windowManager.openScheduleWindow(appState: appState)
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: "calendar")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(white: 0.45))

                                if let event = nextCalendarEvent {
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(event.title)
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundColor(.black)
                                            .lineLimit(1)
                                        Text(timeUntilEvent(event))
                                            .font(.system(size: 9))
                                            .foregroundColor(Color(white: 0.5))
                                    }
                                    .frame(maxWidth: 90, alignment: .leading)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Color(white: 0.94))
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 8)
                    }

                    // Grouped icon container
                    HStack(spacing: 0) {
                        // Calendar (when no upcoming meeting)
                        if nextCalendarEvent == nil {
                            IconBarButton(
                                icon: "calendar",
                                action: { windowManager.openScheduleWindow(appState: appState) },
                                tooltip: "My Schedule"
                            )
                        }

                        // Messages
                        ChatIconButton(
                            messagingState: appState.messagingState,
                            action: {
                                windowManager.toggleChatPanel(messagingState: appState.messagingState)
                            }
                        )
                        .frame(width: 32, height: 28)

                        // Settings
                        IconBarButton(
                            icon: "gearshape",
                            action: { showingSettings = true },
                            tooltip: "Settings"
                        )

                        // Sign out
                        IconBarButton(
                            icon: "rectangle.portrait.and.arrow.right",
                            action: { handleLogout() },
                            tooltip: "Sign Out"
                        )
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 3)
                    .background(Color(white: 0.94))
                    .cornerRadius(8)
                }
                .frame(height: 36)
                .padding(.horizontal, 16)

                // Logo
                Image("Logo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 48)
                    .padding(.top, 16)
                    .padding(.bottom, 8)

                // User info - matches Electron's border-b border-gray-100 bg-gray-50/50
                VStack(spacing: 2) {
                    Text(closerInfo.name)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.black)
                    Text(closerInfo.teamName)
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                }
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(Color(white: 0.98).opacity(0.5))

                // Main content area with more vertical space
                VStack(spacing: 0) {
                    Spacer()

                    // Status indicator with mic icon
                    StatusIndicator(state: appState.recordingState)

                    // Reconnection warning (shown during recording when connection is unstable)
                    if appState.recordingState == .recording && appState.connectionState.isReconnecting {
                        HStack(spacing: 8) {
                            ProgressView()
                                .scaleEffect(0.7)
                                .progressViewStyle(CircularProgressViewStyle(tint: Color(red: 0.7, green: 0.5, blue: 0.0)))
                            Text(appState.connectionState.displayText)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(red: 0.6, green: 0.4, blue: 0.0))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color(red: 1.0, green: 0.97, blue: 0.88))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(red: 0.95, green: 0.85, blue: 0.6), lineWidth: 1)
                        )
                        .padding(.top, 16)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
                    }

                    // Speak first reminder (shown briefly when recording starts)
                    if showSpeakFirstReminder && !appState.connectionState.isReconnecting {
                        HStack(spacing: 8) {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(.blue)
                            Text("Speak first to be identified correctly")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(red: 0.1, green: 0.3, blue: 0.6))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color(red: 0.93, green: 0.96, blue: 1.0))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(red: 0.8, green: 0.88, blue: 0.98), lineWidth: 1)
                        )
                        .padding(.top, 16)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
                    }

                    // Duration (when recording)
                    if appState.recordingState == .recording {
                        Text(formatDuration(appState.recordingDuration))
                            .font(.system(size: 24, weight: .regular, design: .monospaced))
                            .foregroundColor(.black)
                            .padding(.top, 16)
                    }

                    // Prospect Name Prompt (when recording and name not saved)
                    if appState.recordingState == .recording && showProspectPrompt && !prospectNameSaved {
                        ProspectNamePromptView(
                            prospectName: $prospectName,
                            onSubmit: handleProspectNameSubmit
                        )
                        .padding(.top, 16)
                        .frame(maxWidth: 280)
                    }

                    // Prospect Name Confirmed (when recording and name is saved)
                    if appState.recordingState == .recording && prospectNameSaved && !prospectName.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color(red: 0.13, green: 0.55, blue: 0.13))
                            Text("Calling \(prospectName)")
                                .font(.system(size: 14))
                                .foregroundColor(Color(red: 0.13, green: 0.55, blue: 0.13))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color(red: 0.94, green: 0.99, blue: 0.94))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(red: 0.77, green: 0.91, blue: 0.77), lineWidth: 1)
                        )
                        .padding(.top, 16)
                        .frame(maxWidth: 280)
                    }

                    // Audio level meter with label and helper text
                    AudioLevelMeter(level: appState.audioLevel, isActive: appState.recordingState == .recording)
                        .frame(maxWidth: 280)
                        .padding(.top, 24)

                    // Record button
                    RecordButton(
                        isRecording: appState.recordingState == .recording,
                        isConnecting: appState.recordingState == .connecting,
                        onTap: handleRecordTap
                    )
                    .padding(.top, 32)

                    // Panel toggle button - matches Electron: black when visible, gray-100 when hidden
                    Button(action: {
                        windowManager.toggleAmmoPanel(appState: appState)
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "line.3.horizontal")
                                .font(.system(size: 14))
                            Text(windowManager.isAmmoPanelVisible ? "Hide Panel" : "Show Panel")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(windowManager.isAmmoPanelVisible ? Color.black : Color(white: 0.95))
                        .foregroundColor(windowManager.isAmmoPanelVisible ? .white : Color(white: 0.4))
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 16)

                    // Training button - matches Electron: bg-gray-100 text-gray-600
                    Button(action: {
                        windowManager.openTrainingWindow(appState: appState)
                    }) {
                        Text("Training")
                            .font(.system(size: 14, weight: .medium))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(white: 0.95))
                            .foregroundColor(Color(white: 0.4))
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)

                    // Role Play Room button
                    Button(action: {
                        windowManager.openRolePlayRoomWindow(appState: appState)
                    }) {
                        HStack(spacing: 6) {
                            Text("Role Play Room")
                            if rolePlayParticipantCount > 0 {
                                Text("(\(rolePlayParticipantCount))")
                                    .fontWeight(.semibold)
                            }
                        }
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.95))
                        .foregroundColor(Color(white: 0.4))
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)

                    // Call ID (when active)
                    if let callId = appState.currentCallId {
                        Text("Call: \(String(callId.prefix(8)))...")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Color(white: 0.6))
                            .padding(.top, 16)
                    }

                    // Error message
                    if let error = appState.error {
                        HStack {
                            Text(error)
                                .font(.system(size: 14))
                                .foregroundColor(Color(red: 0.86, green: 0.15, blue: 0.15))
                                .multilineTextAlignment(.center)
                        }
                        .padding(12)
                        .background(Color(red: 1.0, green: 0.94, blue: 0.94))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(red: 0.99, green: 0.83, blue: 0.83), lineWidth: 1)
                        )
                        .frame(maxWidth: 280)
                        .padding(.top, 16)
                    }

                    Spacer()
                }
                .padding(.horizontal, 24)

                // Footer - matches Electron: border-t border-gray-200
                HStack {
                    Text("v\(appVersion)")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))

                    Spacer()

                    HStack(spacing: 6) {
                        Circle()
                            .fill(footerStatusColor)
                            .frame(width: 6, height: 6)
                        Text(footerStatusText)
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .overlay(
                    Rectangle()
                        .fill(Color(white: 0.88))
                        .frame(height: 1),
                    alignment: .top
                )
            }

            // Message notification banner overlay
            if appState.messagingState.showNotificationBanner,
               let message = appState.messagingState.latestUnreadMessage {
                VStack {
                    MessageNotificationBanner(
                        message: message,
                        onView: {
                            appState.messagingState.dismissNotificationBanner()
                            windowManager.openChatPanel(messagingState: appState.messagingState)
                        },
                        onDismiss: {
                            appState.messagingState.dismissNotificationBanner()
                        }
                    )
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .animation(.easeInOut(duration: 0.3), value: appState.messagingState.showNotificationBanner)
            }

            // Settings Modal
            if showingSettings {
                SettingsModal(
                    closerInfo: closerInfo,
                    isPresented: $showingSettings
                )
            }

            // Post-Call Questionnaire Modal
            if showingQuestionnaire, let callId = pendingCallId {
                PostCallQuestionnaireView(
                    callId: callId,
                    initialProspectName: prospectName,
                    isPresented: $showingQuestionnaire,
                    onComplete: {
                        showingQuestionnaire = false
                        pendingCallId = nil
                        prospectName = ""
                        prospectNameSaved = false
                    }
                )
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showSpeakFirstReminder)
        .animation(.easeInOut(duration: 0.3), value: appState.connectionState.isReconnecting)
        .onAppear {
            print("[MainRecordingView] onAppear - recordingState: \(appState.recordingState), closerId: \(closerInfo.closerId)")
            startRolePlayParticipantPolling()
            startCalendarPolling()
        }
        .onDisappear {
            print("[MainRecordingView] onDisappear - recordingState: \(appState.recordingState)")
            stopRolePlayParticipantPolling()
            stopCalendarPolling()
        }
        .onChange(of: appState.recordingState) { oldValue, newValue in
            print("[MainRecordingView] recordingState changed: \(oldValue) -> \(newValue)")
            // Log state transitions to backend for debugging blank screen issues
            if newValue == .error || (oldValue != .idle && newValue == .idle) {
                Task {
                    await appState.convexService.logClientError(
                        closerId: closerInfo.closerId,
                        teamId: closerInfo.teamId,
                        errorType: "recording_state_change",
                        errorMessage: "State: \(oldValue) -> \(newValue)",
                        stackTrace: nil,
                        context: [
                            "previousState": String(describing: oldValue),
                            "newState": String(describing: newValue),
                            "hasError": appState.error != nil ? "true" : "false",
                            "errorMessage": appState.error ?? "none"
                        ]
                    )
                }
            }
        }
        .onReceive(timeUpdateTimer) { _ in
            now = Date()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("StartRecordingFromCalendar"))) { notification in
            // Handle "Join & Record" from ScheduleView
            handleStartRecordingFromCalendar(notification: notification)
        }
    }

    /// Handle "Join & Record" notification from ScheduleView
    private func handleStartRecordingFromCalendar(notification: Notification) {
        // Only start if we're not already recording
        guard appState.recordingState == .idle else {
            print("[ContentView] Cannot start from calendar - already recording")
            return
        }

        // Get prospect name from notification
        if let userInfo = notification.userInfo,
           let calendarProspectName = userInfo["prospectName"] as? String {
            // Set the prospect name from the calendar event
            prospectName = calendarProspectName
            prospectNameSaved = true  // Auto-save since it came from calendar
            showProspectPrompt = false
        }

        // Start recording
        Task {
            await appState.startRecording()

            // Wait for convexCallId to be set (it's set asynchronously when server responds)
            // Timeout after 5 seconds to avoid hanging forever
            guard !prospectName.isEmpty else { return }

            var callId: String?
            for _ in 0..<50 {  // 50 x 100ms = 5 seconds max
                if let id = appState.convexCallId {
                    callId = id
                    break
                }
                try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms
            }

            // Update prospect name in Convex after recording starts
            if let callId = callId {
                do {
                    try await appState.convexService.updateProspectName(
                        callId: callId,
                        prospectName: prospectName.trimmingCharacters(in: .whitespaces)
                    )
                    print("[ContentView] Prospect name from calendar saved: \(prospectName)")
                } catch {
                    print("[ContentView] Failed to save prospect name from calendar: \(error)")
                }
            } else {
                print("[ContentView] Warning: convexCallId not available after 5s, prospect name not saved to backend")
            }
        }
    }

    // Role Play Room participant polling
    private func startRolePlayParticipantPolling() {
        // Poll every 5 seconds
        rolePlayPollingTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            Task { @MainActor in
                await fetchRolePlayParticipantCount()
            }
        }
        // Also fetch immediately
        Task {
            await fetchRolePlayParticipantCount()
        }
    }

    private func stopRolePlayParticipantPolling() {
        rolePlayPollingTimer?.invalidate()
        rolePlayPollingTimer = nil
    }

    private func fetchRolePlayParticipantCount() async {
        do {
            let participants = try await appState.convexService.getRolePlayRoomParticipants(teamId: closerInfo.teamId)
            rolePlayParticipantCount = participants.count
        } catch {
            // Silently fail - participant count is optional info
            print("[MainRecordingView] Failed to fetch role play participants: \(error)")
        }
    }

    // MARK: - Calendar Polling

    private func startCalendarPolling() {
        // Poll every 5 minutes to match ScheduleView's auto-sync
        calendarPollingTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { _ in
            Task { @MainActor in
                await fetchNextCalendarEvent()
            }
        }
        // Also fetch immediately
        Task {
            await fetchNextCalendarEvent()
        }
    }

    private func stopCalendarPolling() {
        calendarPollingTimer?.invalidate()
        calendarPollingTimer = nil
    }

    private func fetchNextCalendarEvent() async {
        do {
            // Get events for the next 24 hours
            let startOfDay = Calendar.current.startOfDay(for: Date())
            let endDate = Calendar.current.date(byAdding: .day, value: 1, to: startOfDay)!

            let events = try await appState.convexService.getCalendarEvents(
                email: closerInfo.email,
                teamId: closerInfo.teamId,
                startDate: Int64(Date().timeIntervalSince1970 * 1000),
                endDate: Int64(endDate.timeIntervalSince1970 * 1000)
            )

            // Get first upcoming event (events are sorted by startTime)
            let nowMs = Date().timeIntervalSince1970 * 1000
            nextCalendarEvent = events.first { $0.startTime > nowMs }
        } catch {
            // Silently fail - next event is optional info
            print("[MainRecordingView] Failed to fetch next calendar event: \(error)")
        }
    }

    /// Format time until an event starts
    private func timeUntilEvent(_ event: CalendarEvent) -> String {
        let nowMs = now.timeIntervalSince1970 * 1000
        let diff = event.startTime - nowMs
        let minutes = Int(diff / 60000)

        if minutes < 0 {
            return "Started"
        } else if minutes < 1 {
            return "Starting now"
        } else if minutes < 60 {
            return "in \(minutes) min"
        }

        let hours = minutes / 60
        let remainingMins = minutes % 60

        if hours < 24 {
            if remainingMins > 0 {
                return "in \(hours)h \(remainingMins)m"
            }
            return "in \(hours)h"
        }

        let days = hours / 24
        return "in \(days)d"
    }

    // Footer status color matching Electron
    private var footerStatusColor: Color {
        // Show yellow when reconnecting
        if appState.connectionState.isReconnecting {
            return Color(red: 0.96, green: 0.62, blue: 0.04) // yellow-500
        }

        switch appState.recordingState {
        case .idle: return Color(white: 0.6)
        case .connecting: return Color(red: 0.96, green: 0.62, blue: 0.04) // yellow-500
        case .recording: return Color(red: 0.13, green: 0.77, blue: 0.37) // green-500
        case .error: return Color(red: 0.94, green: 0.27, blue: 0.27) // red-500
        }
    }

    // Footer status text matching Electron
    private var footerStatusText: String {
        // Show reconnecting status when applicable
        if case .reconnecting(let attempt) = appState.connectionState {
            return "Reconnecting... (\(attempt))"
        }

        switch appState.recordingState {
        case .idle: return "Ready"
        case .connecting: return "Connecting..."
        case .recording: return "Recording"
        case .error: return "Error"
        }
    }

    private func handleRecordTap() {
        if appState.recordingState == .recording {
            // Stop recording - show questionnaire
            pendingCallId = appState.convexCallId ?? appState.currentCallId
            appState.stopRecording()
            showProspectPrompt = false
            showingQuestionnaire = true
        } else if appState.recordingState == .idle {
            // Start recording
            prospectName = ""
            prospectNameSaved = false
            showProspectPrompt = true

            // Show "speak first" reminder for 4 seconds
            showSpeakFirstReminder = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                withAnimation {
                    showSpeakFirstReminder = false
                }
            }

            Task {
                await appState.startRecording()
            }
        }
    }

    private func handleProspectNameSubmit() {
        guard !prospectName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        prospectNameSaved = true
        showProspectPrompt = false

        // Save prospect name to backend
        Task {
            // Wait briefly for convexCallId if not yet available (race condition fix)
            var callId = appState.convexCallId
            if callId == nil {
                for _ in 0..<30 {  // 30 x 100ms = 3 seconds max
                    if let id = appState.convexCallId {
                        callId = id
                        break
                    }
                    try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms
                }
            }

            guard let callId = callId else {
                print("[ContentView] No convexCallId available after waiting, prospect name will be saved in post-call questionnaire")
                return
            }

            do {
                try await appState.convexService.updateProspectName(
                    callId: callId,
                    prospectName: prospectName.trimmingCharacters(in: .whitespaces)
                )
                print("[ContentView] Prospect name updated successfully: \(prospectName)")
            } catch {
                print("[ContentView] Failed to update prospect name: \(error)")
                // Don't show error to user - the name will still be saved in post-call questionnaire
            }
        }
    }

    private func handleLogout() {
        appState.logout()
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - Prospect Name Prompt
struct ProspectNamePromptView: View {
    @Binding var prospectName: String
    let onSubmit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Who are you calling?")
                .font(.system(size: 12))
                .foregroundColor(.gray)

            HStack(spacing: 8) {
                TextField("Enter prospect name", text: $prospectName)
                    .textFieldStyle(.plain)
                    .foregroundColor(.black)
                    .padding(10)
                    .background(Color.white)
                    .cornerRadius(6)
                    .onSubmit(onSubmit)

                Button(action: onSubmit) {
                    Text("Save")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(prospectName.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color.black)
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(prospectName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(12)
        .background(Color(white: 0.97))
        .cornerRadius(8)
    }
}

// MARK: - Settings Modal
struct SettingsModal: View {
    let closerInfo: CloserInfo
    @Binding var isPresented: Bool
    @EnvironmentObject var appState: AppState

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isChangingPassword = false
    @State private var passwordError: String?
    @State private var passwordSuccess = false

    var body: some View {
        ZStack {
            // Dimmed background
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture {
                    if !isChangingPassword {
                        isPresented = false
                    }
                }

            // Modal content
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Change Password")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)

                    Spacer()

                    Button(action: { isPresented = false }) {
                        Image(systemName: "xmark")
                            .foregroundColor(.gray)
                            .font(.system(size: 14, weight: .medium))
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)

                Divider()

                if passwordSuccess {
                    // Success state
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.green.opacity(0.1))
                                .frame(width: 48, height: 48)

                            Image(systemName: "checkmark")
                                .foregroundColor(.green)
                                .font(.system(size: 20, weight: .semibold))
                        }

                        Text("Password changed successfully!")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.green)
                    }
                    .padding(32)
                } else {
                    // Form
                    VStack(spacing: 16) {
                        PasswordField(label: "Current Password", text: $currentPassword)
                        PasswordField(label: "New Password", text: $newPassword)
                        PasswordField(
                            label: "Confirm New Password",
                            text: $confirmPassword,
                            showValidation: true,
                            matchesTarget: newPassword == confirmPassword && !confirmPassword.isEmpty
                        )

                        if let error = passwordError {
                            Text(error)
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                        }

                        // Password match indicator
                        if !confirmPassword.isEmpty {
                            if newPassword == confirmPassword {
                                Text("Passwords match")
                                    .font(.system(size: 11))
                                    .foregroundColor(.green)
                            } else {
                                Text("Passwords do not match")
                                    .font(.system(size: 11))
                                    .foregroundColor(.red)
                            }
                        }
                    }
                    .padding(20)

                    Divider()

                    // Footer buttons
                    HStack(spacing: 12) {
                        Button("Cancel") {
                            isPresented = false
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.95))
                        .cornerRadius(6)

                        Button(action: handleChangePassword) {
                            HStack {
                                if isChangingPassword {
                                    ProgressView()
                                        .scaleEffect(0.7)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Text(isChangingPassword ? "Updating..." : "Update Password")
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(canSubmit ? Color.black : Color.gray)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSubmit || isChangingPassword)
                    }
                    .padding(20)
                }
            }
            .frame(width: 320)
            .background(Color.white)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.15), radius: 20, x: 0, y: 10)
        }
    }

    private var canSubmit: Bool {
        !currentPassword.isEmpty &&
        newPassword.count >= 6 &&
        newPassword == confirmPassword
    }

    private func handleChangePassword() {
        passwordError = nil
        isChangingPassword = true

        Task {
            do {
                try await appState.convexService.changePassword(
                    closerId: closerInfo.closerId,
                    currentPassword: currentPassword,
                    newPassword: newPassword
                )
                await MainActor.run {
                    isChangingPassword = false
                    passwordSuccess = true

                    // Auto-close after success
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        isPresented = false
                    }
                }
            } catch {
                await MainActor.run {
                    passwordError = error.localizedDescription
                    isChangingPassword = false
                }
            }
        }
    }
}

struct PasswordField: View {
    let label: String
    @Binding var text: String
    var showValidation: Bool = false
    var matchesTarget: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(white: 0.3))

            SecureField("", text: $text)
                .textFieldStyle(.plain)
                .padding(10)
                .background(backgroundColor)
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(borderColor, lineWidth: 1)
                )
        }
    }

    private var backgroundColor: Color {
        if showValidation && !text.isEmpty {
            return matchesTarget ? Color.green.opacity(0.05) : Color.red.opacity(0.05)
        }
        return Color(white: 0.97)
    }

    private var borderColor: Color {
        if showValidation && !text.isEmpty {
            return matchesTarget ? Color.green.opacity(0.3) : Color.red.opacity(0.3)
        }
        return Color(white: 0.9)
    }
}

// MARK: - Post-Call Questionnaire
struct PostCallQuestionnaireView: View {
    let callId: String
    let initialProspectName: String
    @Binding var isPresented: Bool
    let onComplete: () -> Void
    @EnvironmentObject var appState: AppState

    @State private var prospectName: String = ""
    @State private var outcome: CallOutcome?
    @State private var cashCollected: String = ""
    @State private var contractValue: String = ""
    @State private var pitchedValue: String = ""
    @State private var notes: String = ""
    @State private var primaryObjection: String?
    @State private var primaryObjectionOther: String = ""
    @State private var objectionsOvercome: String?  // For closed deals
    @State private var objectionsOvercomeOther: String = ""
    @State private var leadQualityScore: Int?
    @State private var prospectWasDecisionMaker: String?
    @State private var isSubmitting = false
    @State private var showValidationWarning = false

    private let cashPresets = [1000, 3000, 5000, 10000, 15000]
    private let contractPresets = [3000, 5000, 10000, 15000, 25000]
    private let pitchedPresets = [3000, 5000, 10000, 15000, 25000]
    private let objectionOptions = [
        ("spouse_partner", "Spouse/Partner"),
        ("price_money", "Price/Money"),
        ("timing", "Timing"),
        ("need_to_think", "Need to think about it"),
        ("not_qualified", "Not qualified / Bad lead"),
        ("logistics", "Logistics"),
        ("competitor", "Went with competitor"),
        ("no_show_ghosted", "No-show / Ghosted"),
        ("other", "Other")
    ]
    private let objectionsOvercomeOptions = [
        ("none", "None - No objections"),
        ("spouse_partner", "Spouse/Partner"),
        ("price_money", "Price/Money"),
        ("timing", "Timing"),
        ("need_to_think", "Need to think about it"),
        ("logistics", "Logistics"),
        ("other", "Other")
    ]

    var body: some View {
        HStack(spacing: 0) {
            // Left: Sequ3nce app icon
            Image(nsImage: NSApplication.shared.applicationIconImage)
                .resizable()
                .interpolation(.high)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.leading, 24)
                .padding(.trailing, 16)

            // Right: Form content
            VStack(spacing: 0) {
            // Row 1: Prospect → Outcome (color-coded) → Objection (contextual)
            HStack(alignment: .center, spacing: 16) {
                // Prospect name
                VStack(alignment: .leading, spacing: 3) {
                    Text("PROSPECT")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(white: 0.5))
                        .tracking(0.5)
                    TextField("Name", text: $prospectName)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.black.opacity(0.06))
                        .cornerRadius(8)
                }
                .frame(width: 180)

                // Outcome (color-coded)
                VStack(alignment: .leading, spacing: 3) {
                    Text("OUTCOME")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(white: 0.5))
                        .tracking(0.5)
                    HStack(spacing: 4) {
                        ForEach([
                            ("Closed", CallOutcome.closed),
                            ("Follow Up", CallOutcome.followUp),
                            ("Lost", CallOutcome.lost),
                            ("No Show", CallOutcome.noShow)
                        ], id: \.0) { label, value in
                            Button(action: { outcome = value }) {
                                Text(label)
                                    .font(.system(size: 11, weight: .medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(outcome == value ? outcomeButtonColor(value) : Color.black.opacity(0.06))
                                    .foregroundColor(outcome == value ? .white : Color(white: 0.4))
                                    .cornerRadius(14)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Objection (contextual — appears when outcome requires it)
                if outcome == .lost || outcome == .followUp {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("OBJECTION")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                            .tracking(0.5)
                        compactDropdown(
                            options: objectionOptions,
                            selection: $primaryObjection,
                            placeholder: "Select..."
                        )
                    }
                } else if outcome == .closed {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("OBJECTION OVERCOME")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                            .tracking(0.5)
                        compactDropdown(
                            options: objectionsOvercomeOptions,
                            selection: $objectionsOvercome,
                            placeholder: "None"
                        )
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)

            // Divider between rows
            Rectangle()
                .fill(Color(white: 0.3))
                .frame(height: 1)
                .padding(.horizontal, 24)
                .padding(.vertical, 8)

            // Row 2: Decision Maker → Lead Quality (gradient) → Value → Notes → Save
            HStack(alignment: .top, spacing: 16) {
                // Decision Maker
                VStack(alignment: .leading, spacing: 3) {
                    Text("DECISION MAKER")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(white: 0.5))
                        .tracking(0.5)
                    HStack(spacing: 3) {
                        ForEach([("yes", "Yes"), ("no", "No"), ("unclear", "?")], id: \.0) { key, label in
                            Button(action: { prospectWasDecisionMaker = key }) {
                                Text(label)
                                    .font(.system(size: 11, weight: .medium))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(prospectWasDecisionMaker == key ? Color.black : Color.black.opacity(0.06))
                                    .foregroundColor(prospectWasDecisionMaker == key ? .white : Color(white: 0.4))
                                    .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Lead Quality (gradient fill bar: red 1-3, orange 4-6, green 7-10)
                VStack(alignment: .leading, spacing: 3) {
                    Text("LEAD QUALITY")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(white: 0.5))
                        .tracking(0.5)
                    HStack(spacing: 2) {
                        ForEach(1...10, id: \.self) { score in
                            Button(action: { leadQualityScore = score }) {
                                Text("\(score)")
                                    .font(.system(size: 11, weight: .medium))
                                    .frame(width: 24, height: 26)
                                    .background(
                                        leadQualityScore != nil && score <= leadQualityScore!
                                            ? leadQualityColor(for: score)
                                            : Color.black.opacity(0.06)
                                    )
                                    .foregroundColor(
                                        leadQualityScore != nil && score <= leadQualityScore!
                                            ? .white
                                            : Color(white: 0.5)
                                    )
                                    .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Value fields (contextual based on outcome)
                if outcome == .closed {
                    // Cash Collected
                    VStack(alignment: .leading, spacing: 3) {
                        Text("CASH COLLECTED")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                            .tracking(0.5)
                        HStack(spacing: 4) {
                            ForEach(cashPresets, id: \.self) { preset in
                                Button(action: { cashCollected = String(preset) }) {
                                    Text("$\(preset / 1000)k")
                                        .font(.system(size: 10, weight: .medium))
                                        .fixedSize()
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 5)
                                        .background(cashCollected == String(preset) ? Color.black : Color.black.opacity(0.06))
                                        .foregroundColor(cashCollected == String(preset) ? .white : Color(white: 0.4))
                                        .cornerRadius(6)
                                }
                                .buttonStyle(.plain)
                            }
                            HStack(spacing: 2) {
                                Text("$").font(.system(size: 11)).foregroundColor(Color(white: 0.5))
                                TextField("Amt", text: $cashCollected)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11))
                                    .foregroundColor(.black)
                                    .frame(width: 50)
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 5)
                            .background(Color.black.opacity(0.06))
                            .cornerRadius(6)
                        }
                    }

                    // Contract Value
                    VStack(alignment: .leading, spacing: 3) {
                        Text("CONTRACT VALUE")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                            .tracking(0.5)
                        HStack(spacing: 4) {
                            ForEach(contractPresets, id: \.self) { preset in
                                Button(action: { contractValue = String(preset) }) {
                                    Text("$\(preset / 1000)k")
                                        .font(.system(size: 10, weight: .medium))
                                        .fixedSize()
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 5)
                                        .background(contractValue == String(preset) ? Color.black : Color.black.opacity(0.06))
                                        .foregroundColor(contractValue == String(preset) ? .white : Color(white: 0.4))
                                        .cornerRadius(6)
                                }
                                .buttonStyle(.plain)
                            }
                            HStack(spacing: 2) {
                                Text("$").font(.system(size: 11)).foregroundColor(Color(white: 0.5))
                                TextField("Amt", text: $contractValue)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11))
                                    .foregroundColor(.black)
                                    .frame(width: 50)
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 5)
                            .background(Color.black.opacity(0.06))
                            .cornerRadius(6)
                        }
                    }
                } else if outcome == .lost || outcome == .followUp {
                    // Deal Value
                    VStack(alignment: .leading, spacing: 3) {
                        Text("DEAL VALUE")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(white: 0.5))
                            .tracking(0.5)
                        HStack(spacing: 4) {
                            ForEach(pitchedPresets, id: \.self) { preset in
                                Button(action: { pitchedValue = String(preset) }) {
                                    Text("$\(preset / 1000)k")
                                        .font(.system(size: 10, weight: .medium))
                                        .fixedSize()
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 5)
                                        .background(pitchedValue == String(preset) ? Color.black : Color.black.opacity(0.06))
                                        .foregroundColor(pitchedValue == String(preset) ? .white : Color(white: 0.4))
                                        .cornerRadius(6)
                                }
                                .buttonStyle(.plain)
                            }
                            HStack(spacing: 2) {
                                Text("$").font(.system(size: 11)).foregroundColor(Color(white: 0.5))
                                TextField("Amt", text: $pitchedValue)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11))
                                    .foregroundColor(.black)
                                    .frame(width: 50)
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 5)
                            .background(Color.black.opacity(0.06))
                            .cornerRadius(6)
                        }
                    }
                }

                // Notes
                VStack(alignment: .leading, spacing: 3) {
                    Text("NOTES")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(white: 0.5))
                        .tracking(0.5)
                    TextField("Quick notes...", text: $notes)
                        .textFieldStyle(.plain)
                        .font(.system(size: 11))
                        .foregroundColor(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.06))
                        .cornerRadius(6)
                }
                .frame(minWidth: 120)

                Spacer()

                // Save
                Button(action: handleSubmit) {
                    HStack(spacing: 4) {
                        if isSubmitting {
                            ProgressView()
                                .scaleEffect(0.6)
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        }
                        Text(isSubmitting ? "Saving..." : "Save")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(isValid ? Color.black : Color(white: 0.7))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .disabled(!isValid || isSubmitting)
            }
            .padding(.horizontal, 24)
            .padding(.top, 4)
            .padding(.bottom, 12)

            // Validation warning
            if showValidationWarning && !isValid {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.red)
                    Text("Complete required fields")
                        .font(.system(size: 10))
                        .foregroundColor(.red)
                }
                .padding(.bottom, 8)
            }
        }
        } // end HStack (logo + form)
        .onAppear {
            prospectName = initialProspectName
        }
    }

    // MARK: - Color Helpers

    private var selectedOutcomeColor: Color {
        switch outcome {
        case .closed: return Color(red: 0.3, green: 0.75, blue: 0.35)
        case .followUp: return Color(red: 0.95, green: 0.68, blue: 0.15)
        case .lost: return Color(red: 0.9, green: 0.3, blue: 0.3)
        case .noShow: return Color(white: 0.55)
        case .none: return Color(white: 0.85)
        }
    }

    private func outcomeButtonColor(_ value: CallOutcome) -> Color {
        switch value {
        case .closed: return Color(red: 0.3, green: 0.75, blue: 0.35)
        case .followUp: return Color(red: 0.95, green: 0.68, blue: 0.15)
        case .lost: return Color(red: 0.9, green: 0.3, blue: 0.3)
        case .noShow: return Color(white: 0.55)
        }
    }

    private func leadQualityColor(for score: Int) -> Color {
        if score <= 3 { return Color(red: 0.9, green: 0.35, blue: 0.3) }
        if score <= 6 { return Color(red: 0.95, green: 0.7, blue: 0.2) }
        return Color(red: 0.3, green: 0.75, blue: 0.35)
    }

    // MARK: - Compact Dropdown

    private func compactDropdown(
        options: [(String, String)],
        selection: Binding<String?>,
        placeholder: String
    ) -> some View {
        Menu {
            Button(placeholder) { selection.wrappedValue = nil }
            ForEach(options, id: \.0) { option in
                Button(option.1) { selection.wrappedValue = option.0 }
            }
        } label: {
            HStack(spacing: 4) {
                Text(options.first { $0.0 == selection.wrappedValue }?.1 ?? placeholder)
                    .font(.system(size: 11))
                    .foregroundColor(selection.wrappedValue == nil ? Color(white: 0.5) : .black)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.05))
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private var isValid: Bool {
        let hasName = !prospectName.trimmingCharacters(in: .whitespaces).isEmpty
        let hasOutcome = outcome != nil

        guard hasName && hasOutcome else { return false }

        switch outcome {
        case .closed:
            let hasCash = Int(cashCollected) ?? 0 > 0
            let hasContract = Int(contractValue) ?? 0 > 0
            let hasLeadQuality = leadQualityScore != nil
            return hasCash && hasContract && hasLeadQuality
        case .lost, .followUp:
            let hasPitched = Int(pitchedValue) ?? 0 > 0
            let hasObjection = primaryObjection != nil
            let hasLeadQuality = leadQualityScore != nil
            let hasDecisionMaker = prospectWasDecisionMaker != nil
            return hasPitched && hasObjection && hasLeadQuality && hasDecisionMaker
        case .noShow, .none:
            return true
        }
    }

    private func handleSubmit() {
        guard isValid else { return }

        isSubmitting = true

        // Determine the contract value to send:
        // - For closed deals: use contractValue (full contract commitment)
        // - For lost/follow_up: use pitchedValue (what the deal was worth)
        let finalContractValue: Int? = {
            switch outcome {
            case .closed:
                return Int(contractValue)
            case .lost, .followUp:
                return Int(pitchedValue)
            default:
                return nil
            }
        }()

        Task {
            do {
                try await appState.convexService.completeCallWithOutcome(
                    callId: callId,
                    prospectName: prospectName,
                    outcome: outcome!.rawValue,
                    cashCollected: outcome == .closed ? Int(cashCollected) : nil,
                    contractValue: finalContractValue,
                    notes: notes.isEmpty ? nil : notes,
                    primaryObjection: primaryObjection,
                    primaryObjectionOther: primaryObjection == "other" ? primaryObjectionOther : nil,
                    objectionsOvercome: outcome == .closed ? objectionsOvercome : nil,
                    objectionsOvercomeOther: outcome == .closed && objectionsOvercome == "other" ? objectionsOvercomeOther : nil,
                    leadQualityScore: leadQualityScore,
                    prospectWasDecisionMaker: prospectWasDecisionMaker
                )

                await MainActor.run {
                    isSubmitting = false
                    isPresented = false
                    onComplete()
                }
            } catch {
                await MainActor.run {
                    isSubmitting = false
                    // Show error but don't close
                    appState.error = error.localizedDescription
                }
            }
        }
    }
}

// MARK: - Form Field Helper
struct FormField<Content: View>: View {
    let label: String
    var required: Bool = false
    var optional: Bool = false
    var description: String?
    let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(white: 0.3))

                if required {
                    Text("*")
                        .foregroundColor(.red)
                }

                if optional {
                    Text("(optional)")
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                }
            }

            if let desc = description {
                Text(desc)
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
            }

            content()
        }
    }
}

// MARK: - Outcome Button
enum CallOutcome: String {
    case closed = "closed"
    case followUp = "follow_up"
    case lost = "lost"
    case noShow = "no_show"
}

struct OutcomeButton: View {
    let label: String
    let value: CallOutcome
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(selected ? Color.black : Color(white: 0.97))
                .foregroundColor(selected ? .white : .gray)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(selected ? Color.black : Color(white: 0.9), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preset Button
struct PresetButton: View {
    let amount: Int
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text("$\(amount / 1000)k")
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(isSelected ? Color.black : Color(white: 0.95))
                .foregroundColor(isSelected ? .white : .gray)
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Icon Bar Button

/// A standardized button for the icon bar with hover state
struct IconBarButton: View {
    let icon: String
    let action: () -> Void
    var tooltip: String? = nil

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(isHovered ? Color(white: 0.2) : Color(white: 0.45))
                .frame(width: 32, height: 28)
                .background(isHovered ? Color(white: 0.88) : Color.clear)
                .cornerRadius(4)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
        .help(tooltip ?? "")
    }
}

// MARK: - Supporting Views

struct StatusIndicator: View {
    let state: RecordingState

    // Status dot color matching Electron
    private var statusDotColor: Color {
        switch state {
        case .idle: return Color(white: 0.6)  // gray-400
        case .connecting: return Color(red: 0.96, green: 0.62, blue: 0.04)  // yellow-500
        case .recording: return Color(red: 0.13, green: 0.77, blue: 0.37)  // green-500
        case .error: return Color(red: 0.94, green: 0.27, blue: 0.27)  // red-500
        }
    }

    // Status text matching Electron
    private var statusText: String {
        switch state {
        case .idle: return "Ready to Record"
        case .connecting: return "Connecting..."
        case .recording: return "Recording"
        case .error: return "Error"
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            // Large circle with mic icon - matches Electron's w-16 h-16 (64x64)
            ZStack {
                Circle()
                    .fill(Color(white: 0.95))  // gray-100
                    .frame(width: 64, height: 64)

                Image(systemName: "mic.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(white: 0.6))  // gray-400
            }

            // Status text with dot
            HStack(spacing: 6) {
                Circle()
                    .fill(statusDotColor)
                    .frame(width: 8, height: 8)

                Text(statusText)
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.45))  // gray-500
            }
        }
    }
}

struct AudioLevelMeter: View {
    let level: Float
    let isActive: Bool

    // Clamp level between 0 and 1
    private var clampedLevel: Float {
        min(1.0, max(0.0, level))
    }

    // Convert level to percentage
    private var percentage: Int {
        Int(clampedLevel * 100)
    }

    var body: some View {
        VStack(spacing: 8) {
            // Header row with label and percentage
            HStack {
                Text("Audio Level")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(white: 0.45))

                Spacer()

                if isActive {
                    Text("\(percentage)%")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(white: 0.45))
                        .monospacedDigit()
                }
            }

            // Level bar - matches Electron: h-1.5 (6px), black bar, smooth transition
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(white: 0.95))

                    // Level indicator with smooth animation
                    RoundedRectangle(cornerRadius: 3)
                        .fill(isActive ? Color.black : Color(white: 0.85))
                        .frame(width: geometry.size.width * CGFloat(isActive ? clampedLevel : 0))
                        .animation(.easeOut(duration: 0.075), value: clampedLevel)
                }
            }
            .frame(height: 6)

            // Helper text when not active
            if !isActive {
                Text("Start recording to see audio levels")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.6))
            }
        }
    }
}

struct RecordButton: View {
    let isRecording: Bool
    let isConnecting: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack {
                // Outer circle
                Circle()
                    .stroke(isRecording ? Color.black : Color(white: 0.85), lineWidth: 2)
                    .frame(width: 64, height: 64)
                    .background(
                        Circle()
                            .fill(isRecording ? Color.black : Color.white)
                    )

                // Inner shape
                if isRecording {
                    // Stop icon (square)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white)
                        .frame(width: 20, height: 20)
                } else {
                    // Record icon (circle)
                    Circle()
                        .fill(Color.black)
                        .frame(width: 20, height: 20)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isConnecting)
        .opacity(isConnecting ? 0.5 : 1.0)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
        .frame(width: 400, height: 600)
}
