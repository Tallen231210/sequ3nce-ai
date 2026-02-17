//
//  ActiveCallView.swift
//  Sequ3nce
//
//  Active call view that auto-appears when a meeting bot is in an active call.
//  Integrates with AmmoPanelState for live coaching data (ammo, transcript, resources).
//

import SwiftUI

struct ActiveCallView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var ammoPanelState = AmmoPanelState()

    // Duration timer
    @State private var duration: TimeInterval = 0
    @State private var durationTimer: Timer?

    // Tab selection
    @State private var selectedTab: Int = 0

    // Reinforcement state
    @State private var showReinforcementInput: Bool = false
    @State private var reinforcementMessage: String = ""
    @State private var isRequestingReinforcement: Bool = false
    @State private var reinforcementCooldownRemaining: Int = 0
    @State private var showReinforcementSuccess: Bool = false
    @State private var cooldownTimer: Timer?

    // Call going long state
    @State private var isNotifyingCallGoingLong: Bool = false
    @State private var callGoingLongSentThisCall: Bool = false
    @State private var showCallGoingLongSuccess: Bool = false
    @State private var showTimeOptions: Bool = false

    // Kick bot state
    @State private var isKickingBot: Bool = false

    private let convexService = ConvexService()

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Top Bar (Meeting Info)
            topBar

            Divider()

            // MARK: - Tab Bar
            tabBar

            Divider()

            // MARK: - Tab Content
            tabContent

            Divider()

            // MARK: - Bottom Action Bar
            bottomActionBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            startDurationTimer()
            startAmmoPanelTracking()
        }
        .onDisappear {
            stopDurationTimer()
            stopCooldownTimer()
            ammoPanelState.stopTracking()
        }
    }

    // MARK: - Start Ammo Panel Tracking

    private func startAmmoPanelTracking() {
        guard let callId = appState.activeBotCallId,
              let teamId = appState.closerInfo?.teamId else {
            print("[ActiveCallView] Cannot start tracking - missing callId or teamId")
            return
        }
        print("[ActiveCallView] Starting ammo panel tracking for callId: \(callId)")
        ammoPanelState.startTracking(callId: callId, teamId: teamId)
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            // Meeting title
            VStack(alignment: .leading, spacing: 2) {
                Text(appState.activeBotMeetingTitle ?? "Active Call")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.black)
                    .lineLimit(1)

                if let prospectName = appState.activeBotProspectName {
                    Text("with \(prospectName)")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                }
            }

            Spacer()

            // Duration timer
            Text(formatDuration(duration))
                .font(.system(size: 16, weight: .medium, design: .monospaced))
                .foregroundColor(.black)

            // Recording badge
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                Text("Recording")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(red: 0.09, green: 0.63, blue: 0.22))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(red: 0.94, green: 0.99, blue: 0.94))
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color(red: 0.77, green: 0.91, blue: 0.77), lineWidth: 1)
            )

            // Kick Bot button
            Button(action: handleKickBot) {
                HStack(spacing: 4) {
                    if isKickingBot {
                        ProgressView()
                            .scaleEffect(0.6)
                    } else {
                        Image(systemName: "xmark.circle")
                            .font(.system(size: 12))
                    }
                    Text("Kick Bot")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.red)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.white)
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.red.opacity(0.5), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(isKickingBot)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color(white: 0.99))
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 2) {
            ActiveCallTabButton(
                label: "Ammo",
                icon: "bolt.fill",
                isSelected: selectedTab == 0,
                badge: ammoPanelState.ammoItems.isEmpty ? nil : ammoPanelState.ammoItems.count
            ) {
                selectedTab = 0
            }
            ActiveCallTabButton(label: "Transcript", icon: "doc.text", isSelected: selectedTab == 1) {
                selectedTab = 1
            }
            ActiveCallTabButton(label: "Notes", icon: "pencil", isSelected: selectedTab == 2) {
                selectedTab = 2
            }
            ActiveCallTabButton(label: "Resources", icon: "book", isSelected: selectedTab == 3) {
                selectedTab = 3
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(white: 0.98))
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        Group {
            switch selectedTab {
            case 0:
                ammoTab
            case 1:
                transcriptTab
            case 2:
                notesTab
            case 3:
                resourcesTab
            default:
                EmptyView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(white: 0.99))
    }

    // MARK: - Ammo Tab (Live Data)

    private var ammoTab: some View {
        Group {
            if ammoPanelState.isAmmoV2Enabled, let analysis = ammoPanelState.ammoV2Analysis {
                // Ammo V2 — structured coaching data
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Engagement level
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Engagement Level")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color(white: 0.3))

                            HStack(spacing: 8) {
                                Text(analysis.engagement.level.rawValue.capitalized)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(analysis.engagement.level.textColor)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(analysis.engagement.level.backgroundColor)
                                    .cornerRadius(4)

                                Text(analysis.engagement.reason)
                                    .font(.system(size: 13))
                                    .foregroundColor(.black)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.97))
                            .cornerRadius(8)
                        }

                        // Buying beliefs
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Buying Beliefs")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color(white: 0.3))

                            ForEach(analysis.beliefs.allBeliefs, id: \.key) { belief in
                                HStack {
                                    Text(belief.label)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color(white: 0.4))
                                        .frame(width: 70, alignment: .leading)

                                    // 7-point scale bar
                                    GeometryReader { geometry in
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 3)
                                                .fill(Color(white: 0.92))
                                                .frame(height: 6)

                                            RoundedRectangle(cornerRadius: 3)
                                                .fill(beliefBarColor(value: belief.value))
                                                .frame(width: geometry.size.width * CGFloat(belief.value) / 7.0, height: 6)
                                        }
                                    }
                                    .frame(height: 6)

                                    Text("\(belief.value)/7")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(Color(white: 0.5))
                                        .frame(width: 30)
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        .padding(10)
                        .background(Color(white: 0.97))
                        .cornerRadius(8)

                        // Objection predictions
                        if !analysis.objectionPrediction.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Objection Predictions")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(Color(white: 0.3))

                                ForEach(analysis.objectionPrediction, id: \.type) { prediction in
                                    HStack {
                                        Text(prediction.displayLabel)
                                            .font(.system(size: 13))
                                            .foregroundColor(Color(red: 0.7, green: 0.3, blue: 0.0))

                                        Spacer()

                                        Text("\(prediction.probability)%")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(Color(red: 0.7, green: 0.3, blue: 0.0))
                                    }
                                    .padding(8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(red: 1.0, green: 0.96, blue: 0.9))
                                    .cornerRadius(6)
                                }
                            }
                        }

                        // Pain points
                        if !analysis.painPoints.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Pain Points")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(Color(white: 0.3))

                                ForEach(Array(analysis.painPoints.enumerated()), id: \.offset) { _, pain in
                                    Text(pain)
                                        .font(.system(size: 13))
                                        .foregroundColor(.black)
                                        .padding(8)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color(white: 0.97))
                                        .cornerRadius(6)
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            } else if !ammoPanelState.ammoItems.isEmpty {
                // Legacy ammo items
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(ammoPanelState.filteredAmmoItems) { item in
                            AmmoItemRow(item: item)
                        }
                    }
                    .padding(16)
                }
            } else {
                // Waiting for data
                VStack(spacing: 16) {
                    Spacer()

                    ZStack {
                        Circle()
                            .fill(Color(white: 0.95))
                            .frame(width: 64, height: 64)

                        Image(systemName: "bolt.fill")
                            .font(.system(size: 24))
                            .foregroundColor(Color(white: 0.75))
                    }

                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Analyzing call...")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(white: 0.45))
                        }

                        Text("Live coaching data will appear as the conversation progresses")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.65))
                    }

                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    // MARK: - Transcript Tab (Live Data)

    private var transcriptTab: some View {
        VStack(spacing: 0) {
            // Header with search
            HStack {
                Text("Live Transcript")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)

                Spacer()

                if !ammoPanelState.transcriptSegments.isEmpty {
                    Text("\(ammoPanelState.transcriptSegments.count) segments")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.6))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if ammoPanelState.transcriptSegments.isEmpty {
                // Waiting for transcript
                VStack(spacing: 12) {
                    Spacer()
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.7)
                        Text("Waiting for transcript...")
                            .font(.system(size: 13))
                            .foregroundColor(Color(white: 0.5))
                    }
                    Text("Transcript will appear as participants speak")
                        .font(.system(size: 12))
                        .foregroundColor(Color(white: 0.65))
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Real transcript segments
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 6) {
                            ForEach(Array(ammoPanelState.filteredTranscriptSegments.enumerated()), id: \.element.id) { _, segment in
                                ActiveCallTranscriptSegment(
                                    speaker: segment.speaker,
                                    text: segment.text,
                                    timestamp: formatSegmentTimestamp(segment.timestamp),
                                    isCloser: segment.speaker.lowercased().contains("closer") || segment.speaker.lowercased() == "agent"
                                )
                                .id(segment.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .onChange(of: ammoPanelState.transcriptSegments.count) {
                        // Auto-scroll to latest segment
                        if let last = ammoPanelState.transcriptSegments.last {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Notes Tab

    private var notesTab: some View {
        VStack(spacing: 0) {
            TextEditor(text: $ammoPanelState.notes)
                .font(.system(size: 14))
                .foregroundColor(.black)
                .scrollContentBackground(.hidden)
                .background(Color(white: 0.97))
                .padding(12)
                .background(Color.white)

            Divider()

            HStack {
                Text("\(ammoPanelState.notes.count) characters")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.6))
                Spacer()
                if ammoPanelState.isSavingNotes {
                    HStack(spacing: 4) {
                        ProgressView()
                            .scaleEffect(0.5)
                        Text("Saving...")
                            .font(.system(size: 11))
                            .foregroundColor(Color(white: 0.6))
                    }
                } else if ammoPanelState.lastSavedAt != nil {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.green)
                        Text("Saved")
                            .font(.system(size: 11))
                            .foregroundColor(Color(white: 0.6))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.white)
        }
    }

    // MARK: - Resources Tab (Live Data)

    private var resourcesTab: some View {
        Group {
            if ammoPanelState.isLoadingResources {
                VStack {
                    Spacer()
                    ProgressView()
                    Text("Loading resources...")
                        .font(.system(size: 13))
                        .foregroundColor(Color(white: 0.5))
                        .padding(.top, 8)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if ammoPanelState.resources.isEmpty {
                VStack(spacing: 16) {
                    Spacer()

                    Image(systemName: "book")
                        .font(.system(size: 28))
                        .foregroundColor(Color(white: 0.82))

                    VStack(spacing: 4) {
                        Text("No Resources")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.45))

                        Text("Your manager hasn't added any resources yet")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.65))
                    }

                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(ammoPanelState.resources) { resource in
                            ResourceRow(resource: resource, onOpen: {
                                if let url = resource.url ?? resource.content {
                                    ammoPanelState.openURL(url)
                                }
                            }, onCopy: {
                                if let url = resource.url ?? resource.content {
                                    ammoPanelState.copyToClipboard(url)
                                }
                            })
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 12) {
            // Request Reinforcement button
            if showReinforcementSuccess {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                    Text("Reinforcement Requested!")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.green)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.green.opacity(0.1))
                .cornerRadius(8)
            } else if reinforcementCooldownRemaining > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 12))
                    Text("Wait \(reinforcementCooldownRemaining)s")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Color(white: 0.5))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(white: 0.95))
                .cornerRadius(8)
            } else if showReinforcementInput {
                HStack(spacing: 6) {
                    TextField("Context (optional)", text: $reinforcementMessage)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                        .frame(width: 140)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.white)
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color(white: 0.85), lineWidth: 1)
                        )

                    if isRequestingReinforcement {
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        Button(action: requestReinforcement) {
                            Text("Send")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.orange)
                                .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }

                    Button(action: { showReinforcementInput = false }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                            .foregroundColor(Color(white: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Button(action: { showReinforcementInput = true }) {
                    HStack(spacing: 6) {
                        Image(systemName: "shield.fill")
                            .font(.system(size: 12))
                        Text("Request Reinforcement")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.orange)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }

            // Call Going Long button
            if callGoingLongSentThisCall {
                if showCallGoingLongSuccess {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                        Text("Team Notified")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.green)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.green.opacity(0.1))
                    .cornerRadius(8)
                }
            } else if isNotifyingCallGoingLong {
                ProgressView()
                    .scaleEffect(0.7)
                    .frame(width: 24, height: 24)
            } else if showTimeOptions {
                HStack(spacing: 4) {
                    ForEach([15, 30, 45, 60], id: \.self) { minutes in
                        Button(action: {
                            showTimeOptions = false
                            notifyCallGoingLong(estimatedMinutes: minutes)
                        }) {
                            Text(minutes == 60 ? "1hr" : "\(minutes)m")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Color(red: 0.6, green: 0.4, blue: 0))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(Color(red: 1, green: 0.95, blue: 0.85))
                                .cornerRadius(4)
                        }
                        .buttonStyle(.plain)
                    }

                    Button(action: { showTimeOptions = false }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(Color(white: 0.5))
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color(white: 0.96))
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(red: 0.85, green: 0.7, blue: 0.4), lineWidth: 1)
                )
            } else {
                Button(action: { showTimeOptions = true }) {
                    HStack(spacing: 6) {
                        Image(systemName: "clock.badge.exclamationmark")
                            .font(.system(size: 12))
                        Text("Call Going Long")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Color(red: 0.6, green: 0.4, blue: 0))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(red: 1, green: 0.95, blue: 0.85))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(red: 0.85, green: 0.7, blue: 0.4), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }

            Spacer()

            // Talk ratio indicator (uses data from transcript speaker analysis)
            talkRatioBar
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Color.white)
    }

    // MARK: - Talk Ratio Bar

    private var talkRatioBar: some View {
        let closerPercent = calculateCloserTalkPercent()

        return VStack(spacing: 4) {
            HStack {
                Text("Talk Ratio")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(white: 0.5))
                Spacer()
                Text("\(Int(closerPercent))% / \(Int(100 - closerPercent))%")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(white: 0.5))
            }

            GeometryReader { geometry in
                HStack(spacing: 1) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.black.opacity(0.7))
                        .frame(width: geometry.size.width * CGFloat(closerPercent / 100))

                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.blue.opacity(0.5))
                        .frame(width: geometry.size.width * CGFloat((100 - closerPercent) / 100))
                }
            }
            .frame(height: 6)

            HStack {
                Text("Closer")
                    .font(.system(size: 9))
                    .foregroundColor(Color(white: 0.6))
                Spacer()
                Text("Prospect")
                    .font(.system(size: 9))
                    .foregroundColor(Color(white: 0.6))
            }
        }
        .frame(width: 200)
    }

    private func calculateCloserTalkPercent() -> Double {
        let segments = ammoPanelState.transcriptSegments
        guard !segments.isEmpty else { return 50.0 }

        var closerChars = 0
        var prospectChars = 0
        for segment in segments {
            let isCloser = segment.speaker.lowercased().contains("closer") || segment.speaker.lowercased() == "agent"
            if isCloser {
                closerChars += segment.text.count
            } else {
                prospectChars += segment.text.count
            }
        }

        let total = closerChars + prospectChars
        guard total > 0 else { return 50.0 }
        return Double(closerChars) / Double(total) * 100.0
    }

    // MARK: - Actions

    private func handleKickBot() {
        guard let botId = appState.activeBotId else {
            print("[ActiveCallView] No activeBotId available to kick")
            return
        }

        isKickingBot = true

        Task {
            do {
                let success = try await convexService.cancelBot(botId: botId)
                await MainActor.run {
                    isKickingBot = false
                    if success {
                        print("[ActiveCallView] Bot kicked successfully")
                        // The polling will detect the call ended and hide this view
                    }
                }
            } catch {
                print("[ActiveCallView] Failed to kick bot: \(error)")
                await MainActor.run {
                    isKickingBot = false
                }
            }
        }
    }

    private func requestReinforcement() {
        guard let closerInfo = appState.closerInfo else { return }

        isRequestingReinforcement = true

        Task {
            do {
                let success = try await convexService.requestReinforcement(
                    teamId: closerInfo.teamId,
                    closerId: closerInfo.closerId,
                    closerName: closerInfo.name,
                    callId: appState.activeBotCallId,
                    message: reinforcementMessage.isEmpty ? nil : reinforcementMessage
                )

                await MainActor.run {
                    isRequestingReinforcement = false

                    if success {
                        showReinforcementSuccess = true
                        reinforcementMessage = ""
                        showReinforcementInput = false

                        reinforcementCooldownRemaining = 30
                        startCooldownTimer()

                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            showReinforcementSuccess = false
                        }
                    }
                }
            } catch {
                print("[ActiveCallView] Failed to request reinforcement: \(error)")
                await MainActor.run {
                    isRequestingReinforcement = false
                }
            }
        }
    }

    private func notifyCallGoingLong(estimatedMinutes: Int) {
        guard let closerInfo = appState.closerInfo else { return }

        isNotifyingCallGoingLong = true

        Task {
            do {
                let success = try await convexService.callGoingLong(
                    teamId: closerInfo.teamId,
                    closerId: closerInfo.closerId,
                    callId: appState.activeBotCallId,
                    estimatedMinutes: estimatedMinutes
                )

                await MainActor.run {
                    isNotifyingCallGoingLong = false

                    if success {
                        callGoingLongSentThisCall = true
                        showCallGoingLongSuccess = true

                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            showCallGoingLongSuccess = false
                        }
                    }
                }
            } catch {
                print("[ActiveCallView] Failed to notify call going long: \(error)")
                await MainActor.run {
                    isNotifyingCallGoingLong = false
                }
            }
        }
    }

    // MARK: - Timers

    private func startDurationTimer() {
        duration = 0
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            Task { @MainActor in
                duration += 1
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }

    private func startCooldownTimer() {
        cooldownTimer?.invalidate()
        cooldownTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            Task { @MainActor in
                if reinforcementCooldownRemaining > 0 {
                    reinforcementCooldownRemaining -= 1
                } else {
                    cooldownTimer?.invalidate()
                    cooldownTimer = nil
                }
            }
        }
    }

    private func stopCooldownTimer() {
        cooldownTimer?.invalidate()
        cooldownTimer = nil
    }

    // MARK: - Helpers

    private func formatDuration(_ duration: TimeInterval) -> String {
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        let seconds = Int(duration) % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func beliefBarColor(value: Int) -> Color {
        switch value {
        case 1...2: return Color(red: 0.86, green: 0.15, blue: 0.15) // red
        case 3...4: return Color(red: 0.92, green: 0.65, blue: 0.08) // yellow/orange
        case 5...6: return Color(red: 0.09, green: 0.63, blue: 0.22) // green
        case 7: return Color(red: 0.09, green: 0.72, blue: 0.22) // bright green
        default: return Color(white: 0.7)
        }
    }

    private func formatSegmentTimestamp(_ startTime: Double) -> String {
        let totalSeconds = Int(startTime)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - Ammo Item Row

struct AmmoItemRow: View {
    let item: AmmoItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.type.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(item.type.textColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(item.type.backgroundColor)
                    .cornerRadius(4)

                Spacer()

                Button(action: {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(item.text, forType: .string)
                }) {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 10))
                        .foregroundColor(Color(white: 0.5))
                }
                .buttonStyle(.plain)
            }

            Text("\"\(item.text)\"")
                .font(.system(size: 13))
                .foregroundColor(.black)
                .italic()
        }
        .padding(10)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.93), lineWidth: 1)
        )
    }
}

// MARK: - Resource Row

struct ResourceRow: View {
    let resource: Resource
    let onOpen: () -> Void
    let onCopy: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: resource.type == .link ? "link" : resource.type == .paymentLink ? "creditcard" : resource.type == .script ? "doc.text" : "doc")
                .font(.system(size: 14))
                .foregroundColor(resource.type.textColor)
                .frame(width: 28, height: 28)
                .background(resource.type.backgroundColor)
                .cornerRadius(6)

            VStack(alignment: .leading, spacing: 2) {
                Text(resource.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.black)
                    .lineLimit(1)

                if let desc = resource.description {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.5))
                        .lineLimit(1)
                }
            }

            Spacer()

            Button(action: onCopy) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.5))
            }
            .buttonStyle(.plain)

            Button(action: onOpen) {
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 11))
                    .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
        }
        .padding(10)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.93), lineWidth: 1)
        )
    }
}

// MARK: - Active Call Tab Button

struct ActiveCallTabButton: View {
    let label: String
    let icon: String
    let isSelected: Bool
    var badge: Int? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(label)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                if let badge = badge, badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.blue)
                        .cornerRadius(6)
                }
            }
            .foregroundColor(isSelected ? .white : Color(white: 0.45))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.black : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Active Call Transcript Segment

struct ActiveCallTranscriptSegment: View {
    let speaker: String
    let text: String
    let timestamp: String
    let isCloser: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(speaker)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(isCloser ? Color(white: 0.5) : Color.blue)

                Text(timestamp)
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.6))
            }

            Text(text)
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.25))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isCloser ? Color(white: 0.97) : Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isCloser ? Color.clear : Color(white: 0.95), lineWidth: 1)
        )
    }
}

#Preview {
    ActiveCallView()
        .environmentObject(AppState())
        .frame(width: 800, height: 600)
}
