//
//  BotSettingsView.swift
//  Sequ3nce
//
//  Settings view for meeting bot configuration.
//  Integrated into the sidebar navigation (not a separate window).
//

import SwiftUI

struct BotSettingsView: View {
    @EnvironmentObject var appState: AppState

    // Calendar state
    @State private var calendarStatus: CalendarStatus?
    @State private var isLoadingCalendarStatus: Bool = true
    @State private var isDisconnectingCalendar: Bool = false
    @State private var isReconnectingCalendar: Bool = false
    @State private var isConnectingCalendar: Bool = false
    @State private var calendarError: String?
    @State private var icsUrlInput: String = ""

    // Bot preferences state
    @State private var botDisplayName: String = ""
    @State private var isSavingBotName: Bool = false
    @State private var botNameSaved: Bool = false
    @State private var excludedEvents: [String] = []

    // Password change state
    @State private var showPasswordModal: Bool = false

    // Diagnostics state
    @State private var isSendingDiagnostics: Bool = false
    @State private var diagnosticsDescription: String = ""
    @State private var diagnosticsReportId: String?
    @State private var diagnosticsError: String?

    private let convexService = ConvexService()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.black)
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 16)

            Divider()

            // Scrollable settings content
            ScrollView {
                VStack(spacing: 24) {
                    // Calendar Section
                    calendarSection

                    // Bot Preferences Section
                    botPreferencesSection

                    // Support & Diagnostics Section
                    diagnosticsSection

                    // Account Section
                    accountSection
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            loadCalendarStatus()
            loadBotPreferences()
        }
        .sheet(isPresented: $showPasswordModal) {
            if let closer = appState.closerInfo {
                SettingsModal(
                    closerInfo: closer,
                    isPresented: $showPasswordModal
                )
                .environmentObject(appState)
            }
        }
    }

    // MARK: - Calendar Section

    private var calendarSection: some View {
        SettingsSection(title: "Calendar Connection", icon: "calendar") {
            if isLoadingCalendarStatus {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Loading calendar status...")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                }
                .padding(.vertical, 8)
            } else if let status = calendarStatus, status.connected {
                // Connected state
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.green)
                        Text("Connected")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(red: 0.09, green: 0.63, blue: 0.22))
                    }

                    if let lastSynced = status.lastSynced {
                        HStack(spacing: 4) {
                            Text("Last synced:")
                                .font(.system(size: 12))
                                .foregroundColor(Color(white: 0.5))
                            Text(formatTimestamp(lastSynced))
                                .font(.system(size: 12))
                                .foregroundColor(Color(white: 0.4))
                        }
                    }

                    HStack(spacing: 8) {
                        Button(action: handleReconnectCalendar) {
                            HStack(spacing: 4) {
                                if isReconnectingCalendar {
                                    ProgressView()
                                        .scaleEffect(0.6)
                                } else {
                                    Image(systemName: "arrow.clockwise")
                                        .font(.system(size: 11))
                                }
                                Text("Reconnect")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(.black)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color(white: 0.95))
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .disabled(isReconnectingCalendar)

                        Button(action: handleDisconnectCalendar) {
                            HStack(spacing: 4) {
                                if isDisconnectingCalendar {
                                    ProgressView()
                                        .scaleEffect(0.6)
                                } else {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 11))
                                }
                                Text("Disconnect Calendar")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(.red)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.red.opacity(0.05))
                            .cornerRadius(6)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Color.red.opacity(0.2), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(isDisconnectingCalendar)
                    }
                }
            } else {
                // Not connected state
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.5))
                        Text("Not Connected")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(white: 0.5))
                    }

                    Text("Paste your calendar's ICS feed URL to enable automatic meeting bot joins.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.6))

                    TextField("Paste your ICS feed URL here...", text: $icsUrlInput)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12))

                    Button(action: handleConnectCalendar) {
                        HStack(spacing: 4) {
                            if isConnectingCalendar {
                                ProgressView()
                                    .scaleEffect(0.6)
                            } else {
                                Image(systemName: "link")
                                    .font(.system(size: 11))
                            }
                            Text(isConnectingCalendar ? "Connecting..." : "Connect Calendar")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(isValidSettingsIcsUrl ? Color.black : Color(white: 0.7))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isValidSettingsIcsUrl || isConnectingCalendar)
                }
            }

            // Calendar error
            if let error = calendarError {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 11))
                        .foregroundColor(.red)
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(.red)
                }
                .padding(.top, 4)
            }
        }
    }

    // MARK: - Bot Preferences Section

    private var botPreferencesSection: some View {
        SettingsSection(title: "Bot Preferences", icon: "cpu") {
            VStack(alignment: .leading, spacing: 16) {
                // Excluded events
                VStack(alignment: .leading, spacing: 6) {
                    Text("Excluded Events")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(white: 0.3))

                    Text("The bot will not join these calendar events.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.6))

                    if excludedEvents.isEmpty {
                        Text("No excluded events")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.6))
                            .italic()
                            .padding(.vertical, 8)
                    } else {
                        VStack(spacing: 4) {
                            ForEach(excludedEvents, id: \.self) { event in
                                HStack {
                                    Text(event)
                                        .font(.system(size: 12))
                                        .foregroundColor(.black)

                                    Spacer()

                                    Button(action: {
                                        excludedEvents.removeAll { $0 == event }
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color(white: 0.6))
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color(white: 0.97))
                                .cornerRadius(6)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Diagnostics Section

    private var diagnosticsSection: some View {
        SettingsSection(title: "Support & Diagnostics", icon: "wrench.and.screwdriver") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Send a diagnostic report to help troubleshoot any issues you're experiencing.")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))

                TextField("Describe the issue (optional)...", text: $diagnosticsDescription, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
                    .lineLimit(3...5)

                HStack(spacing: 12) {
                    Button(action: handleSendDiagnostics) {
                        HStack(spacing: 6) {
                            if isSendingDiagnostics {
                                ProgressView()
                                    .scaleEffect(0.6)
                            } else {
                                Image(systemName: "arrow.up.doc")
                                    .font(.system(size: 11))
                            }
                            Text(isSendingDiagnostics ? "Sending..." : "Send Diagnostics")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSendingDiagnostics)

                    if let reportId = diagnosticsReportId {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundColor(.green)
                            Text("Sent! Reference: \(reportId)")
                                .font(.system(size: 12))
                                .foregroundColor(Color(white: 0.4))

                            Button(action: {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(reportId, forType: .string)
                            }) {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 10))
                                    .foregroundColor(Color(white: 0.5))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let error = diagnosticsError {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.red)
                        Text(error)
                            .font(.system(size: 11))
                            .foregroundColor(.red)
                    }
                }
            }
        }
    }

    // MARK: - Account Section

    private var accountSection: some View {
        SettingsSection(title: "Account", icon: "person.circle") {
            VStack(alignment: .leading, spacing: 12) {
                // User info display
                if let closer = appState.closerInfo {
                    HStack(spacing: 12) {
                        // Avatar
                        ZStack {
                            Circle()
                                .fill(Color(white: 0.95))
                                .frame(width: 40, height: 40)

                            Text(initials(from: closer.name))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Color(white: 0.4))
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(closer.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.black)
                            Text(closer.email)
                                .font(.system(size: 12))
                                .foregroundColor(Color(white: 0.5))
                            Text(closer.teamName)
                                .font(.system(size: 11))
                                .foregroundColor(Color(white: 0.6))
                        }
                    }
                }

                Divider()

                // Action buttons
                HStack(spacing: 12) {
                    Button(action: { showPasswordModal = true }) {
                        HStack(spacing: 6) {
                            Image(systemName: "key.fill")
                                .font(.system(size: 11))
                            Text("Change Password")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.black)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.95))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)

                    Button(action: { appState.logout() }) {
                        HStack(spacing: 6) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 11))
                            Text("Sign Out")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.red)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.05))
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.red.opacity(0.2), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Actions

    private func loadCalendarStatus() {
        guard let closer = appState.closerInfo else {
            isLoadingCalendarStatus = false
            return
        }

        isLoadingCalendarStatus = true

        Task {
            do {
                let status = try await convexService.getCalendarStatus(
                    email: closer.email,
                    teamId: closer.teamId
                )
                await MainActor.run {
                    calendarStatus = status
                    isLoadingCalendarStatus = false
                }
            } catch {
                print("[BotSettingsView] Failed to load calendar status: \(error)")
                await MainActor.run {
                    isLoadingCalendarStatus = false
                    calendarError = error.localizedDescription
                }
            }
        }
    }

    private func loadBotPreferences() {
        // Placeholder: load from UserDefaults or backend
        botDisplayName = UserDefaults.standard.string(forKey: "botDisplayName") ?? ""
    }

    private var isValidSettingsIcsUrl: Bool {
        let trimmed = icsUrlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && (trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") || trimmed.hasPrefix("webcal://"))
    }

    private func handleConnectCalendar() {
        guard let closer = appState.closerInfo else { return }

        let trimmedUrl = icsUrlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedUrl.isEmpty else { return }

        isConnectingCalendar = true
        calendarError = nil

        Task {
            do {
                try await convexService.connectCalendar(
                    email: closer.email,
                    teamId: closer.teamId,
                    icsUrl: trimmedUrl
                )
                try await convexService.syncCalendar(
                    email: closer.email,
                    teamId: closer.teamId
                )
                let status = try await convexService.getCalendarStatus(
                    email: closer.email,
                    teamId: closer.teamId
                )
                await MainActor.run {
                    calendarStatus = status
                    isConnectingCalendar = false
                    icsUrlInput = ""
                }
            } catch {
                print("[BotSettingsView] Failed to connect calendar: \(error)")
                await MainActor.run {
                    calendarError = "Failed to connect. Please check your ICS URL."
                    isConnectingCalendar = false
                }
            }
        }
    }

    private func handleDisconnectCalendar() {
        guard let closer = appState.closerInfo else { return }

        isDisconnectingCalendar = true
        calendarError = nil

        Task {
            do {
                try await convexService.disconnectCalendar(
                    email: closer.email,
                    teamId: closer.teamId
                )
                await MainActor.run {
                    calendarStatus = nil
                    isDisconnectingCalendar = false
                }
            } catch {
                print("[BotSettingsView] Failed to disconnect calendar: \(error)")
                await MainActor.run {
                    calendarError = error.localizedDescription
                    isDisconnectingCalendar = false
                }
            }
        }
    }

    private func handleReconnectCalendar() {
        guard let closer = appState.closerInfo else { return }

        isReconnectingCalendar = true
        calendarError = nil

        Task {
            do {
                try await convexService.syncCalendar(
                    email: closer.email,
                    teamId: closer.teamId
                )
                // Refresh status after sync
                let status = try await convexService.getCalendarStatus(
                    email: closer.email,
                    teamId: closer.teamId
                )
                await MainActor.run {
                    calendarStatus = status
                    isReconnectingCalendar = false
                }
            } catch {
                print("[BotSettingsView] Failed to reconnect calendar: \(error)")
                await MainActor.run {
                    calendarError = error.localizedDescription
                    isReconnectingCalendar = false
                }
            }
        }
    }

    private func handleSendDiagnostics() {
        isSendingDiagnostics = true
        diagnosticsReportId = nil
        diagnosticsError = nil

        let description = diagnosticsDescription.isEmpty ? nil : diagnosticsDescription

        Task {
            do {
                let reportId = try await appState.diagnosticsService.sendDiagnostics(userDescription: description)
                await MainActor.run {
                    isSendingDiagnostics = false
                    diagnosticsReportId = reportId
                    diagnosticsDescription = ""
                }
            } catch {
                await MainActor.run {
                    isSendingDiagnostics = false
                    diagnosticsError = error.localizedDescription
                }
            }
        }
    }

    private func saveBotDisplayName() {
        guard !botDisplayName.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        isSavingBotName = true

        // Save locally for now (will wire to backend later)
        UserDefaults.standard.set(botDisplayName, forKey: "botDisplayName")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            isSavingBotName = false
            botNameSaved = true

            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                botNameSaved = false
            }
        }
    }

    // MARK: - Helpers

    private func formatTimestamp(_ timestamp: Double) -> String {
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func initials(from name: String) -> String {
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        } else if let first = parts.first {
            return String(first.prefix(2)).uppercased()
        }
        return "?"
    }
}

// MARK: - Settings Section Container

struct SettingsSection<Content: View>: View {
    let title: String
    let icon: String
    let content: () -> Content

    init(title: String, icon: String, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.icon = icon
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.45))
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)
            }

            // Section content
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color(white: 0.9), lineWidth: 1)
            )
        }
    }
}

#Preview {
    BotSettingsView()
        .environmentObject(AppState())
        .frame(width: 700, height: 600)
}
