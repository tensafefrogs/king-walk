import Foundation
import Security
#if canImport(WidgetKit)
import WidgetKit
#endif

/// The player's progress as the home screen widget shows it. The page sends it after each puzzle
/// (reportProgress in index.html); the app stores it where the widget can read it (SharedStore below).
struct Progress: Codable, Equatable {
    var rating: Int
    var rank: String        // Pawn, Knight, Bishop, Rook, Queen, King
    var piece: String       // p, n, b, r, q, k
    var next: String        // the next rank's name, or "" at the top
    var toNext: Int         // rating points to the next rank
    var solved: Int
    var streak: Int
    var best: Int
    var played: Int
    var hist: [Int]         // the last 30 ratings, oldest first
    var at: Double          // when, in milliseconds since 1970
    // the same in the player's language, as the page writes them (missing from saves made before the game was translated)
    var rankLine: String?   // "Bishop rank"
    var nextLine: String?   // "176 to Rook", or "Top rank"
    var labels: [String: String]?   // chart, solved, inRow, best
    // the daily puzzle (missing from saves made before it existed)
    var dailyDay: String?   // the local date of the last daily solved, yyyy-MM-dd, or ""
    var dailyStreak: Int?   // days in a row, as of that day
    var dailyTodo: String?  // "Today's puzzle is ready", in the player's language
    var dailyDone: String?  // "Today's puzzle: done"
    var dailyLabel: String? // "Daily"
    var dailyFreezes: Int?  // streak freezes held: each covers one skipped day

    static let key = "progress"
    static let widgetKind = "KingWalkProgress"
    static let dailyKind = "KingWalkDaily"

    /// whether today's daily puzzle is solved, and the daily streak as it stands on this date (a skipped day ends it)
    func dailySolved(on date: Date = Date()) -> Bool { dailyDay == Daily.key(date) }
    func dailyStreakNow(on date: Date = Date()) -> Int {
        guard let day = dailyDay, !day.isEmpty, let streak = dailyStreak, let last = Daily.date(day) else { return 0 }
        let cal = Calendar.current
        let skipped = (cal.dateComponents([.day], from: cal.startOfDay(for: last), to: cal.startOfDay(for: date)).day ?? 99) - 1
        return skipped <= (dailyFreezes ?? 0) ? streak : 0          // the game uses a freeze per skipped day
    }
    var dailyTodoText: String { dailyTodo ?? "Today's puzzle is ready" }
    var dailyDoneText: String { dailyDone ?? "Today's puzzle: done" }
    var dailyLabelText: String { dailyLabel ?? "Daily" }

    /// The rating each rank starts at, by its piece letter (rank names come translated), for the bar to the next rank
    static let rankFloors: [String: Int] = ["p": 400, "n": 700, "b": 1000, "r": 1300, "q": 1600, "k": 1900]

    /// How far from this rank to the next, 0 to 1
    var rankFraction: Double {
        guard !next.isEmpty, let lo = Progress.rankFloors[piece] else { return 1 }
        let hi = rating + toNext
        return min(1, max(0.04, Double(rating - lo) / Double(max(1, hi - lo))))
    }

    /// "176 to Rook" as the page wrote it, or built here for saves from before the game was translated
    var nextText: String { nextLine ?? (next.isEmpty ? NSLocalizedString("Top rank", comment: "") : "\(toNext) → \(next)") }

    /// a label the page sent, or the widget's own translation of the English one
    func label(_ key: String, _ english: String) -> String { labels?[key] ?? NSLocalizedString(english, comment: "") }

    static let sample = Progress(rating: 1124, rank: "Bishop", piece: "b", next: "Rook", toNext: 176, solved: 142, streak: 4, best: 11,
                                 played: 210, hist: [1020, 1031, 1018, 1044, 1052, 1047, 1066, 1071, 1063, 1080, 1092, 1088, 1101, 1097, 1112, 1124],
                                 at: Date().timeIntervalSince1970 * 1000, rankLine: nil, nextLine: nil, labels: nil,
                                 dailyDay: Daily.key(Date()), dailyStreak: 5, dailyTodo: nil, dailyDone: nil, dailyLabel: nil, dailyFreezes: 1)

    static func load() -> Progress? {
        guard let data = SharedStore.read(key) else { return nil }
        return try? JSONDecoder().decode(Progress.self, from: data)
    }
}

/// A keychain item the app and its widget share (their entitlements list the same keychain access group,
/// <team>.<bundle ID>.shared, first, so items go there by default). An app group would be the usual way, but
/// Xcode can't set one up when it signs with an App Store Connect API key, as the GitHub build does.
enum SharedStore {
    private static let service = "KingWalkShared"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    static func write(_ account: String, _ data: Data) {
        let attributes: [String: Any] = [kSecValueData as String: data,
                                         kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        if SecItemUpdate(query(account) as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
            SecItemAdd(query(account).merging(attributes) { $1 } as CFDictionary, nil)
        }
    }

    static func read(_ account: String) -> Data? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
}

/// The daily puzzle's calendar, as the page counts it (dayNumber in index.html): Daily #1 is 14 November 2026,
/// and a new one starts at midnight, local time.
enum Daily {
    static func key(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    static func date(_ key: String) -> Date? {
        let p = key.split(separator: "-").compactMap { Int($0) }
        return p.count == 3 ? Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) : nil
    }
    static func number(_ date: Date = Date()) -> Int {
        let cal = Calendar.current
        guard let first = cal.date(from: DateComponents(year: 2026, month: 11, day: 14)) else { return 1 }
        return max(1, (cal.dateComponents([.day], from: cal.startOfDay(for: first), to: cal.startOfDay(for: date)).day ?? 0) + 1)
    }
    static func nextMidnight(after date: Date = Date()) -> Date {
        Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: date)) ?? date.addingTimeInterval(86400)
    }
    /// the link widgets open: the app plays today's puzzle (kingwalkgame is in the app's URL types)
    static let url = URL(string: "kingwalkgame://daily")!
}

/// Something asked the app to open a part of the game (a widget, a control, Siri, a notification, a Home Screen
/// quick action). The game's view passes it to the page once the page is ready (GameViewController).
enum Launch {
    static let notification = Notification.Name("KingWalkOpen")
    static var pending: String?
    static func open(_ what: String) {
        pending = what
        NotificationCenter.default.post(name: notification, object: nil)
    }
}
