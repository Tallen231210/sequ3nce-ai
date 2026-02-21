import SwiftUI
import AVKit
import AVFoundation

/// A drop-in replacement for SwiftUI's VideoPlayer that uses AVPlayerView directly
/// via NSViewRepresentable, bypassing _AVKit_SwiftUI which crashes on macOS 14.7.x
/// due to a superclass metadata resolution failure.
struct NativeVideoPlayer: NSViewRepresentable {
    let player: AVPlayer?
    var showsControls: Bool = true

    func makeNSView(context: Context) -> AVPlayerView {
        let playerView = AVPlayerView()
        playerView.player = player
        playerView.controlsStyle = showsControls ? .inline : .none
        playerView.showsFullScreenToggleButton = true
        return playerView
    }

    func updateNSView(_ nsView: AVPlayerView, context: Context) {
        if nsView.player !== player {
            nsView.player = player
        }
    }
}
