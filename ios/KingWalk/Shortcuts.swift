import AppIntents

/// The phrases Siri and the Shortcuts app offer without any setup
struct KingWalkShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenDailyIntent(), phrases: [
            "Play today's \(.applicationName) puzzle",
            "Open the \(.applicationName) daily puzzle",
            "\(.applicationName) daily puzzle",
        ])
    }
}
