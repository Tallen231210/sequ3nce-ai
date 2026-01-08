//
//  TrainingView.swift
//  Sequ3nce
//
//  Training window - video player with playlists
//  Full implementation in Phase 6
//

import SwiftUI

struct TrainingView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedPlaylist: String?

    var body: some View {
        HSplitView {
            // Sidebar - Playlist list
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Playlists")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.black)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(white: 0.97))

                Divider()

                // Placeholder playlists
                ScrollView {
                    VStack(spacing: 0) {
                        PlaylistRow(
                            title: "Getting Started",
                            videoCount: 5,
                            isSelected: selectedPlaylist == "1"
                        ) {
                            selectedPlaylist = "1"
                        }

                        PlaylistRow(
                            title: "Objection Handling",
                            videoCount: 8,
                            isSelected: selectedPlaylist == "2"
                        ) {
                            selectedPlaylist = "2"
                        }

                        PlaylistRow(
                            title: "Closing Techniques",
                            videoCount: 6,
                            isSelected: selectedPlaylist == "3"
                        ) {
                            selectedPlaylist = "3"
                        }
                    }
                }
            }
            .frame(minWidth: 200, maxWidth: 250)
            .background(Color.white)

            // Main content - Video player
            VStack(spacing: 0) {
                if selectedPlaylist != nil {
                    // Video player placeholder
                    ZStack {
                        Rectangle()
                            .fill(Color.black)

                        VStack(spacing: 16) {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 64))
                                .foregroundColor(.white.opacity(0.8))

                            Text("Video player coming in Phase 6")
                                .font(.system(size: 14))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .aspectRatio(16/9, contentMode: .fit)
                    .frame(maxWidth: .infinity)

                    // Video info
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Introduction to Sales Fundamentals")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.black)

                        Text("Learn the basics of high-ticket sales")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)

                        HStack {
                            Label("12:34", systemImage: "clock")
                            Spacer()
                            Label("Video 1 of 5", systemImage: "list.number")
                        }
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                    }
                    .padding(16)

                    Spacer()
                } else {
                    // No playlist selected
                    VStack(spacing: 16) {
                        Image(systemName: "play.rectangle.on.rectangle")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)

                        Text("Select a playlist to start watching")
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(minWidth: 400)
            .background(Color.white)
        }
        .frame(minWidth: 600, minHeight: 400)
        .preferredColorScheme(.light)
    }
}

struct PlaylistRow: View {
    let title: String
    let videoCount: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                        .foregroundColor(.black)

                    Text("\(videoCount) videos")
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12))
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(isSelected ? Color.blue.opacity(0.1) : Color.clear)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    TrainingView()
        .environmentObject(AppState())
        .frame(width: 800, height: 600)
}
