//
//  BotOnboardingView.swift
//  Sequ3nce
//
//  Full-screen onboarding overlay for meeting bot calendar connection
//  Uses ICS feed URL approach (same as existing calendar connection)
//  Blocks the app until the closer connects their calendar
//

import SwiftUI

// MARK: - BotOnboardingView

struct BotOnboardingView: View {
    @EnvironmentObject var appState: AppState

    @State private var currentStep: Int = 0
    @State private var selectedPlatform: String?
    @State private var icsUrlInput: String = ""
    @State private var isConnecting = false
    @State private var connectionError: String?
    @State private var showHelp = false

    private let convexService = ConvexService()

    /// Total number of steps
    private let totalSteps = 4

    var body: some View {
        ZStack {
            // Semi-transparent background
            Color.black.opacity(0.5)
                .ignoresSafeArea()

            // Center card
            VStack(spacing: 0) {
                // Content area
                Group {
                    switch currentStep {
                    case 0:
                        welcomeStep
                    case 1:
                        platformSelectionStep
                    case 2:
                        connectCalendarStep
                    case 3:
                        allSetStep
                    default:
                        EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Progress dots
                progressDots
                    .padding(.bottom, 24)
            }
            .frame(width: 520, height: 560)
            .background(Color.white)
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.2), radius: 30, x: 0, y: 15)
        }
    }

    // MARK: - Step 0: Welcome

    private var welcomeStep: some View {
        VStack(spacing: 24) {
            Spacer()

            // Logo
            Image("Logo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 48)

            VStack(spacing: 12) {
                Text("Welcome to Sequ3nce")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                Text("Let's set up automatic call recording and live coaching")
                    .font(.system(size: 15))
                    .foregroundColor(Color(white: 0.5))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()

            Button(action: {
                withAnimation(.easeInOut(duration: 0.3)) {
                    currentStep = 1
                }
            }) {
                Text("Get Started")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.black)
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 40)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Step 1: Platform Selection

    private var platformSelectionStep: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("Which meeting platform do you primarily use?")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                Text("We'll optimize your setup for this platform")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.5))
            }
            .padding(.horizontal, 32)

            VStack(spacing: 12) {
                PlatformButton(
                    name: "Google Meet",
                    description: "Video calls through Google Workspace",
                    iconName: "video.fill",
                    isSelected: selectedPlatform == "google_meet",
                    action: { selectedPlatform = "google_meet" }
                )

                PlatformButton(
                    name: "Zoom",
                    description: "Zoom meetings and webinars",
                    iconName: "person.2.fill",
                    isSelected: selectedPlatform == "zoom",
                    action: { selectedPlatform = "zoom" }
                )

                PlatformButton(
                    name: "Microsoft Teams",
                    description: "Teams meetings and calls",
                    iconName: "bubble.left.and.bubble.right.fill",
                    isSelected: selectedPlatform == "teams",
                    action: { selectedPlatform = "teams" }
                )
            }
            .padding(.horizontal, 40)

            Spacer()

            Button(action: {
                withAnimation(.easeInOut(duration: 0.3)) {
                    currentStep = 2
                }
            }) {
                Text("Continue")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(selectedPlatform != nil ? Color.black : Color(white: 0.7))
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(selectedPlatform == nil)
            .padding(.horizontal, 40)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Step 2: Connect Calendar (ICS URL)

    private var connectCalendarStep: some View {
        VStack(spacing: 20) {
            Spacer()

            // Calendar icon
            ZStack {
                Circle()
                    .fill(Color(white: 0.95))
                    .frame(width: 64, height: 64)

                Image(systemName: "calendar.badge.plus")
                    .font(.system(size: 24))
                    .foregroundColor(Color(white: 0.4))
            }

            VStack(spacing: 8) {
                Text("Connect Your Calendar")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                Text("Paste your calendar's ICS feed URL so we can automatically detect your upcoming calls and send bots to record them.")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.5))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // ICS URL input
            VStack(alignment: .leading, spacing: 8) {
                TextField("Paste your ICS feed URL here...", text: $icsUrlInput)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                    .padding(.horizontal, 40)

                // Error message
                if let error = connectionError {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                        .padding(.horizontal, 40)
                }
            }

            // Help toggle
            Button(action: { showHelp.toggle() }) {
                HStack(spacing: 4) {
                    Image(systemName: showHelp ? "chevron.up" : "questionmark.circle")
                        .font(.system(size: 12))
                    Text(showHelp ? "Hide instructions" : "Where do I find my ICS URL?")
                        .font(.system(size: 13))
                }
                .foregroundColor(Color(white: 0.4))
            }
            .buttonStyle(.plain)

            if showHelp {
                helpSection
            }

            Spacer()

            Button(action: handleConnectCalendar) {
                HStack(spacing: 8) {
                    if isConnecting {
                        ProgressView()
                            .scaleEffect(0.8)
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                    Text(isConnecting ? "Connecting..." : "Connect Calendar")
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(isValidIcsUrl ? Color.black : Color(white: 0.7))
                .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(!isValidIcsUrl || isConnecting)
            .padding(.horizontal, 40)
            .padding(.bottom, 8)
        }
    }

    private var helpSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            helpItem(
                title: "Google Calendar",
                steps: "Settings > Select calendar > \"Secret address in iCal format\" > Copy URL"
            )
            helpItem(
                title: "Outlook / Office 365",
                steps: "Settings > Shared calendars > Publish a calendar > Copy ICS link"
            )
            helpItem(
                title: "Calendly",
                steps: "Account > Calendar Sync > Export ICS feed URL"
            )
            helpItem(
                title: "Cal.com",
                steps: "Settings > Calendars > Copy ICS feed URL"
            )
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 8)
        .background(Color(white: 0.97))
        .cornerRadius(8)
        .padding(.horizontal, 32)
    }

    private func helpItem(title: String, steps: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.black)
            Text(steps)
                .font(.system(size: 11))
                .foregroundColor(Color(white: 0.5))
        }
    }

    private var isValidIcsUrl: Bool {
        let trimmed = icsUrlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && (trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") || trimmed.hasPrefix("webcal://"))
    }

    // MARK: - Step 3: All Set

    private var allSetStep: some View {
        VStack(spacing: 24) {
            Spacer()

            // Checkmark
            ZStack {
                Circle()
                    .fill(Color(red: 0.13, green: 0.77, blue: 0.37).opacity(0.1))
                    .frame(width: 80, height: 80)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 44))
                    .foregroundColor(Color(red: 0.13, green: 0.77, blue: 0.37))
            }

            VStack(spacing: 12) {
                Text("You're all set!")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                VStack(spacing: 8) {
                    Text("We'll automatically join your calls, record, and give you live coaching.")
                        .font(.system(size: 15))
                        .foregroundColor(Color(white: 0.4))
                        .multilineTextAlignment(.center)

                    Text("You don't need to do anything -- just take your calls as usual.")
                        .font(.system(size: 15))
                        .foregroundColor(Color(white: 0.4))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
            }

            Spacer()

            Button(action: handleComplete) {
                Text("Let's Go")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.black)
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 40)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Progress Dots

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<totalSteps, id: \.self) { step in
                Circle()
                    .fill(step == currentStep ? Color.black : Color(white: 0.82))
                    .frame(width: 8, height: 8)
            }
        }
    }

    // MARK: - Actions

    private func handleConnectCalendar() {
        guard let closer = appState.closerInfo else { return }

        let trimmedUrl = icsUrlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedUrl.isEmpty else { return }

        isConnecting = true
        connectionError = nil

        Task {
            do {
                // 1. Connect calendar with ICS URL (same as existing ScheduleView flow)
                try await convexService.connectCalendar(
                    email: closer.email,
                    teamId: closer.teamId,
                    icsUrl: trimmedUrl
                )

                // 2. Trigger initial sync to fetch events
                try await convexService.syncCalendar(
                    email: closer.email,
                    teamId: closer.teamId
                )

                await MainActor.run {
                    isConnecting = false
                    withAnimation(.easeInOut(duration: 0.3)) {
                        currentStep = 3 // Go to "All Set" step
                    }
                }
            } catch {
                print("[BotOnboardingView] Calendar connection error: \(error)")
                await MainActor.run {
                    isConnecting = false
                    connectionError = "Failed to connect calendar. Please check your URL and try again."
                }
            }
        }
    }

    private func handleComplete() {
        // Mark onboarding as completed
        appState.needsCalendarOnboarding = false

        // Persist calendarOnboardingCompleted = true on closer record
        if let closer = appState.closerInfo {
            Task {
                do {
                    // Save meeting platform preference
                    if let platform = selectedPlatform {
                        let _ = try await appState.convexService.saveMeetingPlatform(
                            closerId: closer.closerId,
                            platform: platform
                        )
                    }

                    // Mark onboarding completed
                    let _ = try await appState.convexService.markOnboardingCompleted(
                        closerId: closer.closerId
                    )
                    print("[BotOnboardingView] Onboarding marked as completed")
                } catch {
                    print("[BotOnboardingView] Failed to mark onboarding complete: \(error)")
                }
            }
        }
    }
}

// MARK: - Platform Button

struct PlatformButton: View {
    let name: String
    let description: String
    let iconName: String
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? Color.black.opacity(0.05) : Color(white: 0.96))
                        .frame(width: 44, height: 44)

                    Image(systemName: iconName)
                        .font(.system(size: 18))
                        .foregroundColor(isSelected ? .black : Color(white: 0.5))
                }

                // Text
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.black)

                    Text(description)
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.5))
                }

                Spacer()

                // Selection indicator
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.black)
                }
            }
            .padding(14)
            .background(Color.white)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.black : Color(white: 0.88), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

// MARK: - Preview

#Preview {
    BotOnboardingView()
        .environmentObject(AppState())
        .frame(width: 900, height: 700)
}
