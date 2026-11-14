import AppIntents

/// "Play today's puzzle": opens the app on the daily puzzle. Used by Siri and Shortcuts (KingWalkShortcuts in the
/// app) and by the Control Center control (the widget extension), so it's in both targets: run from a control, the
/// system opens the app and performs it there.
struct OpenDailyIntent: AppIntent {
    static var title: LocalizedStringResource = "Play today's puzzle"
    static var description = IntentDescription("Opens King Walk on today's daily puzzle.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Launch.open("daily")
        return .result()
    }
}
