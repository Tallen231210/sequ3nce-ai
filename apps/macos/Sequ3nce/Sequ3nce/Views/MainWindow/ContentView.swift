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

    // App version
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    var body: some View {
        ZStack {
            // Main content
            VStack(spacing: 0) {
                // Title bar with settings and sign out
                HStack {
                    Spacer()

                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.6))
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 12)

                    Button("Sign out") {
                        handleLogout()
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.6))
                }
                .frame(height: 32)
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

                    // Speak first reminder (shown briefly when recording starts)
                    if showSpeakFirstReminder {
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
    }

    // Footer status color matching Electron
    private var footerStatusColor: Color {
        switch appState.recordingState {
        case .idle: return Color(white: 0.6)
        case .connecting: return Color(red: 0.96, green: 0.62, blue: 0.04) // yellow-500
        case .recording: return Color(red: 0.13, green: 0.77, blue: 0.37) // green-500
        case .error: return Color(red: 0.94, green: 0.27, blue: 0.27) // red-500
        }
    }

    // Footer status text matching Electron
    private var footerStatusText: String {
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

        // TODO: Save prospect name to backend
        // updateProspectName(callId: appState.currentCallId, prospectName: prospectName)
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
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color(white: 0.85), lineWidth: 1)
                    )
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
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.9), lineWidth: 1)
        )
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
    @State private var notes: String = ""
    @State private var primaryObjection: String?
    @State private var primaryObjectionOther: String = ""
    @State private var leadQualityScore: Int?
    @State private var prospectWasDecisionMaker: String?
    @State private var isSubmitting = false
    @State private var showValidationWarning = false

    private let cashPresets = [1000, 3000, 5000, 10000, 15000]
    private let contractPresets = [3000, 5000, 10000, 15000, 25000]
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

    var body: some View {
        ZStack {
            // Dimmed background
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            // Modal
            VStack(spacing: 0) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    Text("Call Summary")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.black)

                    Text("Complete this before your next call")
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(Color(white: 0.99))

                Divider()

                // Scrollable form content
                ScrollView {
                    VStack(spacing: 20) {
                        // Prospect Name
                        FormField(label: "Prospect Name", required: true) {
                            TextField("Enter prospect's name", text: $prospectName)
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

                        // Call Outcome
                        FormField(label: "Call Outcome", required: true) {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                OutcomeButton(label: "Closed", value: .closed, selected: outcome == .closed) {
                                    outcome = .closed
                                }
                                OutcomeButton(label: "Follow Up", value: .followUp, selected: outcome == .followUp) {
                                    outcome = .followUp
                                }
                                OutcomeButton(label: "Lost", value: .lost, selected: outcome == .lost) {
                                    outcome = .lost
                                }
                                OutcomeButton(label: "No Show", value: .noShow, selected: outcome == .noShow) {
                                    outcome = .noShow
                                }
                            }
                        }

                        // Cash Collected & Contract Value (only for closed)
                        if outcome == .closed {
                            FormField(label: "Cash Collected", required: true, description: "Amount paid on this call") {
                                VStack(spacing: 8) {
                                    // Preset buttons
                                    HStack(spacing: 6) {
                                        ForEach(cashPresets, id: \.self) { preset in
                                            PresetButton(
                                                amount: preset,
                                                isSelected: cashCollected == String(preset),
                                                onTap: { cashCollected = String(preset) }
                                            )
                                        }
                                    }

                                    // Custom input
                                    HStack {
                                        Text("$")
                                            .foregroundColor(.gray)
                                        TextField("Custom amount", text: $cashCollected)
                                            .textFieldStyle(.plain)
                                            .foregroundColor(.black)
                                    }
                                    .padding(12)
                                    .background(Color(white: 0.97))
                                    .cornerRadius(8)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(Color(white: 0.9), lineWidth: 1)
                                    )
                                }
                            }

                            FormField(label: "Contract Value", required: true, description: "Total contract commitment") {
                                VStack(spacing: 8) {
                                    // Preset buttons
                                    HStack(spacing: 6) {
                                        ForEach(contractPresets, id: \.self) { preset in
                                            PresetButton(
                                                amount: preset,
                                                isSelected: contractValue == String(preset),
                                                onTap: { contractValue = String(preset) }
                                            )
                                        }
                                    }

                                    // Custom input
                                    HStack {
                                        Text("$")
                                            .foregroundColor(.gray)
                                        TextField("Custom amount", text: $contractValue)
                                            .textFieldStyle(.plain)
                                            .foregroundColor(.black)
                                    }
                                    .padding(12)
                                    .background(Color(white: 0.97))
                                    .cornerRadius(8)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(Color(white: 0.9), lineWidth: 1)
                                    )
                                }
                            }

                            // Warning if cash > contract
                            if let cash = Int(cashCollected), let contract = Int(contractValue), cash > contract {
                                Text("Cash collected is higher than contract value - is this correct?")
                                    .font(.system(size: 12))
                                    .foregroundColor(.orange)
                            }
                        }

                        // Primary Objection (for lost or follow_up)
                        if outcome == .lost || outcome == .followUp {
                            FormField(label: "Primary Objection") {
                                VStack(spacing: 8) {
                                    // Dropdown/Picker
                                    Menu {
                                        Button("Select objection...") {
                                            primaryObjection = nil
                                        }
                                        ForEach(objectionOptions, id: \.0) { option in
                                            Button(option.1) {
                                                primaryObjection = option.0
                                            }
                                        }
                                    } label: {
                                        HStack {
                                            Text(objectionOptions.first { $0.0 == primaryObjection }?.1 ?? "Select objection...")
                                                .foregroundColor(primaryObjection == nil ? .gray : .black)
                                            Spacer()
                                            Image(systemName: "chevron.down")
                                                .foregroundColor(.gray)
                                                .font(.system(size: 12))
                                        }
                                        .padding(12)
                                        .background(Color(white: 0.97))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color(white: 0.9), lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)

                                    // Other text input
                                    if primaryObjection == "other" {
                                        TextField("Describe the objection...", text: $primaryObjectionOther)
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
                            }
                        }

                        // Lead Quality Score
                        FormField(label: "Lead Quality (1-10)", description: "Was this a real opportunity?") {
                            HStack(spacing: 4) {
                                ForEach(1...10, id: \.self) { score in
                                    Button(action: { leadQualityScore = score }) {
                                        Text("\(score)")
                                            .font(.system(size: 13, weight: .medium))
                                            .frame(width: 28, height: 32)
                                            .background(leadQualityScore == score ? Color.black : Color(white: 0.95))
                                            .foregroundColor(leadQualityScore == score ? .white : .gray)
                                            .cornerRadius(6)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        // Decision Maker
                        FormField(label: "Was the prospect the decision maker?") {
                            HStack(spacing: 8) {
                                ForEach([("yes", "Yes"), ("no", "No"), ("unclear", "Unclear")], id: \.0) { option in
                                    Button(action: { prospectWasDecisionMaker = option.0 }) {
                                        Text(option.1)
                                            .font(.system(size: 13, weight: .medium))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 10)
                                            .background(prospectWasDecisionMaker == option.0 ? Color.black : Color(white: 0.95))
                                            .foregroundColor(prospectWasDecisionMaker == option.0 ? .white : .gray)
                                            .cornerRadius(8)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        // Notes
                        FormField(label: "Notes", optional: true) {
                            TextEditor(text: $notes)
                                .font(.system(size: 14))
                                .foregroundColor(.black)
                                .scrollContentBackground(.hidden)
                                .frame(height: 80)
                                .padding(8)
                                .background(Color(white: 0.97))
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color(white: 0.9), lineWidth: 1)
                                )
                        }

                        // Validation warning
                        if showValidationWarning && !isValid {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.red)
                                Text("Please complete all required fields before closing.")
                                    .font(.system(size: 12))
                                    .foregroundColor(.red)
                            }
                            .padding(12)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(8)
                        }
                    }
                    .padding(20)
                }

                Divider()

                // Footer buttons
                HStack {
                    Button("Cancel") {
                        if isValid {
                            isPresented = false
                            onComplete()
                        } else {
                            showValidationWarning = true
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.gray)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)

                    Spacer()

                    Button(action: handleSubmit) {
                        HStack {
                            if isSubmitting {
                                ProgressView()
                                    .scaleEffect(0.7)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }
                            Text(isSubmitting ? "Saving..." : "Save & Finish")
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(isValid ? Color.black : Color.gray)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isValid || isSubmitting)
                }
                .padding(16)
            }
            .frame(width: 420, height: 600)
            .background(Color.white)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.2), radius: 30, x: 0, y: 15)
        }
        .onAppear {
            prospectName = initialProspectName
        }
    }

    private var isValid: Bool {
        let hasName = !prospectName.trimmingCharacters(in: .whitespaces).isEmpty
        let hasOutcome = outcome != nil

        if outcome == .closed {
            let hasCash = Int(cashCollected) ?? 0 > 0
            let hasContract = Int(contractValue) ?? 0 > 0
            return hasName && hasOutcome && hasCash && hasContract
        }

        return hasName && hasOutcome
    }

    private func handleSubmit() {
        guard isValid else { return }

        isSubmitting = true

        Task {
            do {
                try await appState.convexService.completeCallWithOutcome(
                    callId: callId,
                    prospectName: prospectName,
                    outcome: outcome!.rawValue,
                    cashCollected: outcome == .closed ? Int(cashCollected) : nil,
                    contractValue: outcome == .closed ? Int(contractValue) : nil,
                    notes: notes.isEmpty ? nil : notes,
                    primaryObjection: primaryObjection,
                    primaryObjectionOther: primaryObjection == "other" ? primaryObjectionOther : nil,
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
