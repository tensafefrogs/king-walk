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

    static let key = "progress"
    static let widgetKind = "KingWalkProgress"

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
                                 at: Date().timeIntervalSince1970 * 1000, rankLine: nil, nextLine: nil, labels: nil)

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
