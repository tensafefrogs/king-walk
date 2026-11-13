import AVFoundation
import SwiftUI

@main
struct KingWalkApp: App {
    init() {
        // Play the game's sounds even when the ring switch is on silent (the game has its own Sound switch),
        // alongside the player's own music rather than stopping it
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()   // the page handles safe areas itself (viewport-fit=cover)
                .background(Color("LaunchBackground").ignoresSafeArea())
        }
    }
}

struct GameView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController { GameViewController() }
    func updateUIViewController(_ controller: GameViewController, context: Context) {}
}
