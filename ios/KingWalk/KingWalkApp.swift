import AVFoundation
import SwiftUI
import UIKit
import UserNotifications

@main
struct KingWalkApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

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
                // kingwalkgame://daily, from the widgets and the Control Center control
                .onOpenURL { url in if let what = url.host, !what.isEmpty { Launch.open(what) } }
        }
    }
}

struct GameView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController { GameViewController() }
    func updateUIViewController(_ controller: GameViewController, context: Context) {}
}

/// Home Screen quick actions (long press the icon: "Today's puzzle", in Info.plist) and taps on a daily reminder
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { Launch.open(item.type) }   // launched from a quick action
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // a reminder tapped: open today's puzzle
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        if let what = response.notification.request.content.userInfo["open"] as? String { Launch.open(what) }
        done()
    }

    // a reminder due while the game is open: the player is already here, so don't show it
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([])
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    // a quick action while the app was already running
    func windowScene(_ scene: UIWindowScene, performActionFor item: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        Launch.open(item.type)
        completionHandler(true)
    }
}
