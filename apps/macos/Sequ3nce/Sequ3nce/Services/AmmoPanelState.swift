//
//  AmmoPanelState.swift
//  Sequ3nce
//
//  State management for Ammo Panel - handles polling, data fetching, and auto-save
//

import Foundation
import SwiftUI
import Combine

/// State manager for the Ammo Panel floating window
@MainActor
class AmmoPanelState: ObservableObject {
    // MARK: - Published State

    @Published var callId: String?
    @Published var teamId: String?

    // Ammo Tab
    @Published var ammoItems: [AmmoItem] = []
    @Published var selectedFilter: AmmoFilterType = .all

    // Transcript Tab
    @Published var transcriptSegments: [TranscriptSegment] = []
    @Published var transcriptSearchQuery: String = ""
    @Published var autoScrollEnabled: Bool = true

    // Notes Tab
    @Published var notes: String = ""
    @Published var isSavingNotes: Bool = false
    @Published var lastSavedAt: Date?

    // Resources Tab
    @Published var resources: [Resource] = []
    @Published var isLoadingResources: Bool = false

    // Ammo V2
    @Published var isAmmoV2Enabled: Bool = false
    @Published var ammoV2Analysis: AmmoV2Analysis?

    // MARK: - Configuration

    private let pollInterval: TimeInterval = 2.0  // Poll every 2 seconds
    private let notesSaveDelay: TimeInterval = 2.0  // Auto-save after 2 seconds of no typing

    // MARK: - Private State

    private let convexService = ConvexService()
    private var pollTimer: Timer?
    private var notesSaveTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Computed Properties

    /// Filtered ammo items based on selected filter
    var filteredAmmoItems: [AmmoItem] {
        if selectedFilter == .all {
            return ammoItems
        }
        return ammoItems.filter { item in
            switch selectedFilter {
            case .all: return true
            case .emotional: return item.type == .emotional
            case .urgency: return item.type == .urgency
            case .budget: return item.type == .budget
            case .commitment: return item.type == .commitment
            case .objectionPreview: return item.type == .objectionPreview
            case .painPoint: return item.type == .painPoint
            }
        }
    }

    /// Filtered transcript segments based on search query
    var filteredTranscriptSegments: [TranscriptSegment] {
        if transcriptSearchQuery.trimmingCharacters(in: .whitespaces).isEmpty {
            return transcriptSegments
        }
        let query = transcriptSearchQuery.lowercased()
        return transcriptSegments.filter { $0.text.lowercased().contains(query) }
    }

    /// Count of ammo items per category
    var ammoCategoryCounts: [AmmoType: Int] {
        var counts: [AmmoType: Int] = [:]
        for item in ammoItems {
            counts[item.type, default: 0] += 1
        }
        return counts
    }

    /// Filters that have at least one item
    var activeFilters: [AmmoFilterType] {
        var filters: [AmmoFilterType] = [.all]
        for type in AmmoType.allCases where type != .unknown {
            if ammoCategoryCounts[type, default: 0] > 0 {
                filters.append(AmmoFilterType.from(ammoType: type))
            }
        }
        return filters
    }

    // MARK: - Initialization

    init() {
        // Setup notes auto-save debounce
        $notes
            .debounce(for: .seconds(notesSaveDelay), scheduler: DispatchQueue.main)
            .sink { [weak self] newNotes in
                Task {
                    await self?.saveNotesIfNeeded(newNotes)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Public Methods

    /// Start tracking a call - called when main window starts recording
    func startTracking(callId: String, teamId: String) {
        print("[AmmoPanelState] startTracking called with callId: \(callId), teamId: \(teamId)")

        // Only restart if this is a new call
        if self.callId == callId {
            print("[AmmoPanelState] Already tracking this callId, skipping")
            return
        }

        self.callId = callId
        self.teamId = teamId

        // Reset state for new call
        ammoItems = []
        transcriptSegments = []
        notes = ""
        lastSavedAt = nil
        ammoV2Analysis = nil
        selectedFilter = .all
        transcriptSearchQuery = ""

        // Check if Ammo V2 is enabled for this team
        Task {
            await checkAmmoV2Enabled()
            await fetchResources()
        }

        // Start polling
        startPolling()
    }

    /// Stop tracking - called when call ends
    func stopTracking() {
        stopPolling()
        // Don't clear data - let user review after call ends
        callId = nil
    }

    /// Update call ID from main window (inter-window communication)
    func updateCallId(_ newCallId: String?) {
        if let newCallId = newCallId, callId != newCallId {
            // New call started - handled by startTracking
        } else if newCallId == nil && callId != nil {
            // Call ended - stop polling but keep data
            stopPolling()
            callId = nil
        }
    }

    /// Copy text to clipboard
    func copyToClipboard(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    /// Open URL in default browser
    func openURL(_ urlString: String) {
        if let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Polling

    private func startPolling() {
        stopPolling()

        // Initial fetch
        Task {
            await fetchAllData()
        }

        // Start timer for periodic polling
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.fetchAllData()
            }
        }
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func fetchAllData() async {
        guard let callId = callId else { return }

        // Fetch ammo, transcript, and V2 analysis in parallel
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                await self.fetchAmmo(callId: callId)
            }
            group.addTask {
                await self.fetchTranscript(callId: callId)
            }
            if self.isAmmoV2Enabled {
                group.addTask {
                    await self.fetchAmmoV2Analysis(callId: callId)
                }
            }
        }
    }

    // MARK: - Data Fetching

    private func fetchAmmo(callId: String) async {
        print("[AmmoPanelState] fetchAmmo called with callId: \(callId)")
        do {
            let items = try await convexService.getAmmoItems(callId: callId)
            // Sort by most recent first, limit to 15
            ammoItems = items.sorted { $0.createdAt > $1.createdAt }.prefix(15).map { $0 }
            print("[AmmoPanelState] Fetched \(items.count) ammo items")
        } catch {
            print("[AmmoPanelState] Failed to fetch ammo for callId \(callId): \(error)")
        }
    }

    private func fetchTranscript(callId: String) async {
        print("[AmmoPanelState] fetchTranscript called with callId: \(callId)")
        do {
            let segments = try await convexService.getTranscriptSegments(callId: callId)
            if segments.count != transcriptSegments.count {
                print("[AmmoPanelState] Transcript updated: \(segments.count) segments (was \(transcriptSegments.count))")
            }
            transcriptSegments = segments
        } catch {
            print("[AmmoPanelState] Failed to fetch transcript for callId \(callId): \(error)")
        }
    }

    private func fetchAmmoV2Analysis(callId: String) async {
        do {
            if let analysis = try await convexService.getAmmoAnalysis(callId: callId) {
                ammoV2Analysis = analysis
            }
        } catch {
            print("[AmmoPanelState] Failed to fetch Ammo V2 analysis: \(error)")
        }
    }

    private func checkAmmoV2Enabled() async {
        guard let teamId = teamId else { return }
        do {
            isAmmoV2Enabled = try await convexService.isAmmoV2Enabled(teamId: teamId)
            print("[AmmoPanelState] Ammo V2 enabled: \(isAmmoV2Enabled)")
        } catch {
            print("[AmmoPanelState] Failed to check Ammo V2 status: \(error)")
        }
    }

    private func fetchResources() async {
        guard let teamId = teamId else { return }
        isLoadingResources = true
        do {
            resources = try await convexService.getActiveResources(teamId: teamId)
        } catch {
            print("[AmmoPanelState] Failed to fetch resources: \(error)")
        }
        isLoadingResources = false
    }

    // MARK: - Notes

    private func saveNotesIfNeeded(_ notesText: String) async {
        guard let callId = callId, !notesText.isEmpty else { return }

        isSavingNotes = true
        do {
            try await convexService.updateCallNotes(callId: callId, notes: notesText)
            lastSavedAt = Date()
        } catch {
            print("[AmmoPanelState] Failed to save notes: \(error)")
        }
        isSavingNotes = false
    }

    /// Force save notes immediately (called before closing)
    func saveNotesNow() async {
        await saveNotesIfNeeded(notes)
    }
}

// MARK: - Filter Types

enum AmmoFilterType: String, CaseIterable {
    case all
    case emotional
    case urgency
    case budget
    case commitment
    case objectionPreview
    case painPoint

    var label: String {
        switch self {
        case .all: return "All"
        case .emotional: return "Emotional"
        case .urgency: return "Urgency"
        case .budget: return "Budget"
        case .commitment: return "Commitment"
        case .objectionPreview: return "Objection"
        case .painPoint: return "Pain Point"
        }
    }

    static func from(ammoType: AmmoType) -> AmmoFilterType {
        switch ammoType {
        case .emotional: return .emotional
        case .urgency: return .urgency
        case .budget: return .budget
        case .commitment: return .commitment
        case .objectionPreview: return .objectionPreview
        case .painPoint: return .painPoint
        case .unknown: return .all
        }
    }
}
