//
//  AmmoPanelView.swift
//  Sequ3nce
//
//  Ammo Tracker floating panel - shows quotes, transcript, notes during calls
//  Matches Electron app design exactly
//

import SwiftUI

struct AmmoPanelView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var panelState = AmmoPanelState()
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            // Tab bar - matches Electron: h-10 (40px), gray-50/50 bg, border-b
            HStack(spacing: 0) {
                // Tab buttons in a non-wrapping row
                HStack(spacing: 2) {
                    TabButton(
                        icon: "bolt.fill",
                        label: "Ammo",
                        badge: panelState.ammoItems.isEmpty ? nil : panelState.ammoItems.count,
                        isSelected: selectedTab == 0
                    ) {
                        selectedTab = 0
                    }

                    TabButton(
                        icon: "doc.text",
                        label: "Transcript",
                        isSelected: selectedTab == 1
                    ) {
                        selectedTab = 1
                    }

                    TabButton(
                        icon: "pencil",
                        label: "Notes",
                        isSelected: selectedTab == 2
                    ) {
                        selectedTab = 2
                    }

                    TabButton(
                        icon: "book",
                        label: "Resources",
                        isSelected: selectedTab == 3
                    ) {
                        selectedTab = 3
                    }
                }
                .fixedSize(horizontal: true, vertical: false)

                Spacer(minLength: 4)

                // Status indicator (green when recording)
                Circle()
                    .fill(panelState.callId != nil ? Color.green : Color(white: 0.8))
                    .frame(width: 8, height: 8)
            }
            .padding(.horizontal, 6)
            .frame(height: 40)
            .background(Color(white: 0.98))

            Divider()
                .background(Color(white: 0.88))

            // Tab content - slightly off-white background like Electron
            Group {
                switch selectedTab {
                case 0:
                    if panelState.isAmmoV2Enabled {
                        AmmoV2TabView(panelState: panelState)
                    } else {
                        AmmoTabView(panelState: panelState)
                    }
                case 1:
                    TranscriptTabView(panelState: panelState)
                case 2:
                    NotesTabView(panelState: panelState)
                case 3:
                    ResourcesTabView(panelState: panelState)
                default:
                    EmptyView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(white: 0.99))
        }
        .frame(minWidth: 320, idealWidth: 320, minHeight: 400, idealHeight: 500)
        .background(Color.white)
        .preferredColorScheme(.light)
        .onAppear {
            // Sync with app state - use convexCallId for API calls
            print("[AmmoPanelView] onAppear - convexCallId: \(appState.convexCallId ?? "nil"), currentCallId: \(appState.currentCallId ?? "nil")")
            if let callId = appState.convexCallId, let closerInfo = appState.closerInfo {
                print("[AmmoPanelView] onAppear - calling startTracking with convexCallId: \(callId)")
                panelState.startTracking(callId: callId, teamId: closerInfo.teamId)
            }
        }
        .onChange(of: appState.convexCallId) { _, newCallId in
            print("[AmmoPanelView] onChange - convexCallId changed to: \(newCallId ?? "nil")")
            if let callId = newCallId, let closerInfo = appState.closerInfo {
                print("[AmmoPanelView] onChange - calling startTracking with convexCallId: \(callId)")
                panelState.startTracking(callId: callId, teamId: closerInfo.teamId)
            } else {
                print("[AmmoPanelView] onChange - calling stopTracking")
                panelState.stopTracking()
            }
        }
    }
}

// MARK: - Tab Button

struct TabButton: View {
    let icon: String
    let label: String
    var badge: Int? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                HStack(spacing: 4) {
                    Image(systemName: icon)
                        .font(.system(size: 12))
                    Text(label)
                        .font(.system(size: 11, weight: isSelected ? .medium : .regular))
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
                .foregroundColor(isSelected ? .black : Color(white: 0.45))
                .padding(.horizontal, 6)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSelected ? Color.white : Color.clear)
                        .shadow(color: isSelected ? Color.black.opacity(0.06) : Color.clear, radius: 2, x: 0, y: 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(isSelected ? Color(white: 0.88) : Color.clear, lineWidth: 1)
                )

                // Badge
                if let badge = badge, badge > 0 {
                    Text(badge > 9 ? "9+" : "\(badge)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 14, height: 14)
                        .background(Color.black)
                        .clipShape(Circle())
                        .offset(x: 4, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Ammo Tab (Classic)

struct AmmoTabView: View {
    @ObservedObject var panelState: AmmoPanelState

    var body: some View {
        VStack(spacing: 0) {
            if panelState.callId == nil {
                // No call - empty state
                EmptyStateView(
                    icon: "bolt.fill",
                    title: nil,
                    message: "Start a call to see AI-powered insights"
                )
            } else if panelState.ammoItems.isEmpty {
                // Recording but no ammo yet
                ListeningStateView()
            } else {
                // Show ammo items
                VStack(spacing: 0) {
                    // Filter chips (only if multiple categories)
                    if panelState.activeFilters.count > 2 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(panelState.activeFilters, id: \.self) { filter in
                                    FilterChip(
                                        label: filter.label,
                                        count: filter == .all ? panelState.ammoItems.count : panelState.ammoCategoryCounts[AmmoType(rawValue: filter.rawValue) ?? .unknown] ?? 0,
                                        isSelected: panelState.selectedFilter == filter
                                    ) {
                                        panelState.selectedFilter = filter
                                    }
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 8)
                        }
                    }

                    // Ammo cards
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(panelState.filteredAmmoItems) { item in
                                AmmoCard(item: item) {
                                    panelState.copyToClipboard(item.text)
                                }
                            }
                        }
                        .padding(8)
                    }
                }
            }
        }
    }
}

// MARK: - Ammo Card

struct AmmoCard: View {
    let item: AmmoItem
    let onCopy: () -> Void
    @State private var copied = false

    var body: some View {
        Button(action: handleCopy) {
            VStack(alignment: .leading, spacing: 6) {
                // Header
                HStack {
                    // Type badge
                    Text(item.type.label)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(item.type.textColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(item.type.backgroundColor)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(item.type.borderColor, lineWidth: 1)
                        )
                        .cornerRadius(4)

                    Spacer()

                    Text(item.createdAt.relativeTimeString)
                        .font(.system(size: 10))
                        .foregroundColor(Color(white: 0.6))
                }

                // Quote text
                Text("\"\(item.text)\"")
                    .font(.system(size: 13))
                    .foregroundColor(Color(white: 0.25))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(white: 0.88), lineWidth: 1)
            )
            .overlay(
                // Copied overlay
                Group {
                    if copied {
                        ZStack {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.white.opacity(0.95))

                            HStack(spacing: 6) {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.green)
                                Text("Copied!")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(.green)
                            }
                        }
                    }
                }
            )
        }
        .buttonStyle(.plain)
    }

    private func handleCopy() {
        onCopy()
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            copied = false
        }
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let label: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(label)
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 9))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(isSelected ? Color.white.opacity(0.2) : Color(white: 0.88))
                        .cornerRadius(8)
                }
            }
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(isSelected ? .white : Color(white: 0.4))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(isSelected ? Color.black : Color(white: 0.95))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Transcript Tab

struct TranscriptTabView: View {
    @ObservedObject var panelState: AmmoPanelState
    @State private var isSearchFocused = false

    var body: some View {
        VStack(spacing: 0) {
            if panelState.callId == nil {
                EmptyStateView(
                    icon: "doc.text",
                    title: nil,
                    message: "Start a call to see the transcript here"
                )
            } else if panelState.transcriptSegments.isEmpty {
                // Recording but no transcript yet
                VStack(spacing: 16) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 28))
                        .foregroundColor(Color(white: 0.75))

                    VStack(spacing: 4) {
                        Text("Waiting for speech...")
                            .font(.system(size: 14))
                            .foregroundColor(Color(white: 0.45))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 0) {
                    // Search bar
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 12))
                            .foregroundColor(Color(white: 0.5))

                        TextField("Search transcript...", text: $panelState.transcriptSearchQuery)
                            .textFieldStyle(.plain)
                            .font(.system(size: 12))

                        if !panelState.transcriptSearchQuery.isEmpty {
                            Text("\(panelState.filteredTranscriptSegments.count) matches")
                                .font(.system(size: 10))
                                .foregroundColor(Color(white: 0.5))

                            Button(action: { panelState.transcriptSearchQuery = "" }) {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(white: 0.5))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(8)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(white: 0.88), lineWidth: 1)
                    )
                    .padding(8)

                    // Transcript segments
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 6) {
                                ForEach(panelState.filteredTranscriptSegments) { segment in
                                    TranscriptLine(
                                        segment: segment,
                                        searchQuery: panelState.transcriptSearchQuery
                                    )
                                    .id(segment.id)
                                }
                            }
                            .padding(8)
                        }
                        .onChange(of: panelState.transcriptSegments.count) { _, _ in
                            if panelState.autoScrollEnabled, let lastId = panelState.transcriptSegments.last?.id {
                                withAnimation {
                                    proxy.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

struct TranscriptLine: View {
    let segment: TranscriptSegment
    var searchQuery: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(segment.displaySpeaker)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(segment.isCloser ? Color(white: 0.5) : Color.blue)

                Text(segment.timestamp.timestampString)
                    .font(.system(size: 10))
                    .foregroundColor(Color(white: 0.6))
            }

            Text(segment.text)
                .font(.system(size: 13))
                .foregroundColor(Color(white: 0.25))
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(segment.isCloser ? Color(white: 0.97) : Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(segment.isCloser ? Color.clear : Color(white: 0.95), lineWidth: 1)
        )
    }
}

// MARK: - Notes Tab

struct NotesTabView: View {
    @ObservedObject var panelState: AmmoPanelState

    var body: some View {
        if panelState.callId != nil {
            VStack(spacing: 0) {
                TextEditor(text: $panelState.notes)
                    .font(.system(size: 13))
                    .foregroundColor(.black)
                    .scrollContentBackground(.hidden)
                    .background(Color(white: 0.97))
                    .padding(8)
                    .background(Color.white)

                Divider()

                HStack {
                    Text("\(panelState.notes.count) characters")
                        .font(.system(size: 10))
                        .foregroundColor(Color(white: 0.6))
                    Spacer()
                    Text(panelState.isSavingNotes ? "Saving..." : (panelState.lastSavedAt != nil ? "Saved" : ""))
                        .font(.system(size: 10))
                        .foregroundColor(Color(white: 0.6))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.white)
            }
            .background(Color.white)
        } else {
            EmptyStateView(
                icon: "pencil",
                title: nil,
                message: "Start a call to take notes"
            )
        }
    }
}

// MARK: - Resources Tab

struct ResourcesTabView: View {
    @ObservedObject var panelState: AmmoPanelState

    var body: some View {
        if panelState.isLoadingResources {
            VStack(spacing: 12) {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Loading resources...")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.5))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if panelState.resources.isEmpty {
            EmptyStateView(
                icon: "book",
                title: "No resources yet",
                message: "Your manager can add sales scripts, payment links, and other resources."
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(panelState.resources) { resource in
                        ResourceCard(resource: resource) { url in
                            panelState.copyToClipboard(url)
                        } onOpen: { url in
                            panelState.openURL(url)
                        }
                    }
                }
                .padding(8)
            }
        }
    }
}

struct ResourceCard: View {
    let resource: Resource
    let onCopy: (String) -> Void
    let onOpen: (String) -> Void

    @State private var copied = false
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    // Type badge
                    Text(resource.type.label)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(resource.type.textColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(resource.type.backgroundColor)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(resource.type.borderColor, lineWidth: 1)
                        )
                        .cornerRadius(4)

                    Text(resource.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.black)

                    if let description = resource.description {
                        Text(description)
                            .font(.system(size: 11))
                            .foregroundColor(Color(white: 0.5))
                    }
                }
                Spacer()
            }

            // Actions for links
            if let url = resource.url {
                HStack(spacing: 8) {
                    Button(action: {
                        onCopy(url)
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            copied = false
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 10))
                            Text(copied ? "Copied!" : "Copy Link")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(copied ? .green : Color(white: 0.4))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(white: 0.95))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)

                    Button(action: { onOpen(url) }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 10))
                            Text("Open")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.black)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
            }

            // Script content (expandable)
            if resource.type == .script, let content = resource.content {
                Button(action: { expanded.toggle() }) {
                    Text(expanded ? "Hide Script" : "View Script")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)

                if expanded {
                    ScrollView {
                        Text(content)
                            .font(.system(size: 11))
                            .foregroundColor(Color(white: 0.3))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 150)
                    .padding(8)
                    .background(Color(white: 0.97))
                    .cornerRadius(8)
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.88), lineWidth: 1)
        )
    }
}

// MARK: - Ammo V2 Tab

// Default initial state - all beliefs at 0% (matches Electron app)
private let defaultAnalysis = AmmoV2Analysis(
    engagement: AmmoV2Analysis.EngagementData(
        level: .medium,
        reason: "Waiting for conversation data..."
    ),
    beliefs: AmmoV2Analysis.BuyingBeliefs(
        problem: 0,
        solution: 0,
        vehicle: 0,
        selfBelief: 0,
        time: 0,
        money: 0,
        urgency: 0
    ),
    objectionPrediction: [],
    painPoints: [],
    analyzedAt: nil
)

struct AmmoV2TabView: View {
    @ObservedObject var panelState: AmmoPanelState

    // Use actual analysis if available, otherwise show default state with 0% values
    private var displayAnalysis: AmmoV2Analysis {
        panelState.ammoV2Analysis ?? defaultAnalysis
    }

    private var hasRealData: Bool {
        panelState.ammoV2Analysis != nil
    }

    var body: some View {
        if panelState.callId == nil {
            EmptyStateView(
                icon: "bolt.fill",
                title: nil,
                message: "Start a call to see AI-powered insights"
            )
        } else {
            ScrollView {
                VStack(spacing: 12) {
                    // Engagement Section - always show
                    EngagementCard(engagement: displayAnalysis.engagement)

                    // Buying Beliefs - always show (starts at 0%)
                    BuyingBeliefsCard(beliefs: displayAnalysis.beliefs)

                    // Objections - show loading state or predictions
                    ObjectionsCard(predictions: displayAnalysis.objectionPrediction, hasRealData: hasRealData)

                    // Pain Points - show listening state or quotes
                    PainPointsCard(painPoints: displayAnalysis.painPoints, hasRealData: hasRealData) {
                        panelState.copyToClipboard($0)
                    }

                    // Last Updated timestamp
                    if let analyzedAt = displayAnalysis.analyzedAt {
                        Text("Last updated: \(Date(timeIntervalSince1970: analyzedAt / 1000).formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 10))
                            .foregroundColor(Color(white: 0.6))
                    }
                }
                .padding(8)
            }
        }
    }
}

struct EngagementCard: View {
    let engagement: AmmoV2Analysis.EngagementData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ENGAGEMENT")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(white: 0.5))

                Spacer()

                Text(engagement.level.rawValue.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(engagement.level.textColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(engagement.level.backgroundColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(engagement.level.borderColor, lineWidth: 1)
                    )
                    .cornerRadius(10)
            }

            Text(engagement.reason)
                .font(.system(size: 11))
                .foregroundColor(Color(white: 0.4))
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.88), lineWidth: 1)
        )
    }
}

struct BuyingBeliefsCard: View {
    let beliefs: AmmoV2Analysis.BuyingBeliefs

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("BUYING BELIEFS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(white: 0.5))

            VStack(spacing: 10) {
                ForEach(beliefs.allBeliefs, id: \.key) { belief in
                    BeliefBar(label: belief.label, value: belief.value, tooltip: belief.tooltip)
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.88), lineWidth: 1)
        )
    }
}

struct BeliefBar: View {
    let label: String
    let value: Int
    var tooltip: String = ""

    private var barColor: Color {
        if value <= 30 { return .red }
        if value <= 60 { return .yellow }
        return .green
    }

    private var textColor: Color {
        if value <= 30 { return Color(red: 0.86, green: 0.15, blue: 0.15) }
        if value <= 60 { return Color(red: 0.65, green: 0.50, blue: 0.08) }
        return Color(red: 0.09, green: 0.63, blue: 0.22)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(white: 0.4))
                Spacer()
                Text("\(value)%")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(textColor)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(white: 0.9))
                        .frame(height: 6)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(barColor)
                        .frame(width: geometry.size.width * CGFloat(value) / 100, height: 6)
                }
            }
            .frame(height: 6)
        }
        .help(tooltip)  // Shows tooltip on hover
    }
}

struct ObjectionsCard: View {
    let predictions: [AmmoV2Analysis.ObjectionPrediction]
    var hasRealData: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LIKELY OBJECTIONS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(white: 0.5))

            if !hasRealData {
                // Show loading state when waiting for analysis
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.6)
                    Text("Analyzing for potential objections...")
                        .font(.system(size: 11))
                        .foregroundColor(Color(white: 0.5))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            } else if predictions.isEmpty {
                Text("No objections predicted yet")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.5))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 6) {
                    ForEach(predictions, id: \.type) { prediction in
                        ObjectionRow(prediction: prediction)
                    }
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.88), lineWidth: 1)
        )
    }
}

struct ObjectionRow: View {
    let prediction: AmmoV2Analysis.ObjectionPrediction

    // Get likelihood label and colors based on probability
    private var likelihoodLabel: String {
        if prediction.probability >= 60 { return "Very Likely" }
        if prediction.probability >= 30 { return "Likely" }
        return "Less Likely"
    }

    private var likelihoodBgColor: Color {
        if prediction.probability >= 60 { return Color(red: 1.0, green: 0.90, blue: 0.90) }  // red-100
        if prediction.probability >= 30 { return Color(red: 1.0, green: 0.98, blue: 0.90) }  // yellow-100
        return Color(white: 0.95)  // gray-100
    }

    private var likelihoodTextColor: Color {
        if prediction.probability >= 60 { return Color(red: 0.72, green: 0.18, blue: 0.18) }  // red-700
        if prediction.probability >= 30 { return Color(red: 0.65, green: 0.50, blue: 0.08) }  // yellow-700
        return Color(white: 0.45)  // gray-600
    }

    var body: some View {
        HStack {
            Text(prediction.displayLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(white: 0.3))

            Spacer()

            // Likelihood badge instead of progress bar
            Text(likelihoodLabel)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(likelihoodTextColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(likelihoodBgColor)
                .cornerRadius(10)
        }
        .padding(8)
        .background(Color(white: 0.97))
        .cornerRadius(8)
    }
}

struct PainPointsCard: View {
    let painPoints: [String]
    var hasRealData: Bool = true
    let onCopy: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PAIN POINTS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(white: 0.5))

            if painPoints.isEmpty {
                Text(hasRealData ? "No pain points captured yet" : "Listening for pain points...")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.5))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 6) {
                    ForEach(painPoints, id: \.self) { quote in
                        PainPointQuote(quote: quote, onCopy: onCopy)
                    }
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(white: 0.88), lineWidth: 1)
        )
    }
}

struct PainPointQuote: View {
    let quote: String
    let onCopy: (String) -> Void
    @State private var copied = false

    var body: some View {
        Button(action: {
            onCopy(quote)
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                copied = false
            }
        }) {
            ZStack {
                Text("\"\(quote)\"")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.3))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(white: 0.88), lineWidth: 1)
                    )
                    .opacity(copied ? 0.1 : 1)

                if copied {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11))
                        Text("Copied!")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.green)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Empty/Loading States

struct EmptyStateView: View {
    let icon: String
    let title: String?
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 28))
                .foregroundColor(Color(white: 0.82))

            VStack(spacing: 4) {
                if let title = title {
                    Text(title)
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.45))
                }

                Text(message)
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.65))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 60)
        .background(Color.white)
    }
}

struct ListeningStateView: View {
    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color(white: 0.95))
                    .frame(width: 64, height: 64)

                Image(systemName: "bolt.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(white: 0.75))
            }

            VStack(spacing: 4) {
                Text("Listening...")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.45))

                Text("Key quotes will appear here")
                    .font(.system(size: 12))
                    .foregroundColor(Color(white: 0.65))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 60)
    }
}

#Preview {
    AmmoPanelView()
        .environmentObject(AppState())
        .frame(width: 280, height: 400)
}
