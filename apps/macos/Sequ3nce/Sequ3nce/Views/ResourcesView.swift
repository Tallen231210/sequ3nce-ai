//
//  ResourcesView.swift
//  Sequ3nce
//
//  Standalone resources view for the sidebar tab.
//  Displays sales scripts, payment links, and documents from managers.
//

import SwiftUI
import AppKit

struct ResourcesView: View {
    @EnvironmentObject var appState: AppState

    @State private var resources: [Resource] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                Text("Resources")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.black)

                Text("Sales scripts, payment links, and documents from your manager.")
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.5))

                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                            .padding(.vertical, 40)
                        Spacer()
                    }
                } else if let error = errorMessage {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 24))
                                .foregroundColor(Color(white: 0.6))
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(Color(white: 0.5))
                        }
                        .padding(.vertical, 40)
                        Spacer()
                    }
                } else if resources.isEmpty {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: "folder")
                                .font(.system(size: 24))
                                .foregroundColor(Color(white: 0.75))
                            Text("No resources yet")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(white: 0.5))
                            Text("Your manager hasn't added any resources for your team.")
                                .font(.system(size: 13))
                                .foregroundColor(Color(white: 0.6))
                                .multilineTextAlignment(.center)
                        }
                        .padding(.vertical, 40)
                        Spacer()
                    }
                } else {
                    VStack(spacing: 12) {
                        ForEach(resources) { resource in
                            ResourceCard(
                                resource: resource,
                                onCopy: { text in
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString(text, forType: .string)
                                },
                                onOpen: { urlString in
                                    if let url = URL(string: urlString) {
                                        NSWorkspace.shared.open(url)
                                    }
                                }
                            )
                        }
                    }
                }

                Spacer(minLength: 40)
            }
            .padding(32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .onAppear {
            Task { await loadResources() }
        }
    }

    private func loadResources() async {
        guard let closer = appState.closerInfo else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            resources = try await appState.convexService.getActiveResources(teamId: closer.teamId)
        } catch {
            print("[Resources] Failed to load resources: \(error)")
            errorMessage = "Failed to load resources"
        }
    }
}
