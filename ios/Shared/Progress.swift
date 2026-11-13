import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// The player's progress as the home screen widget shows it. The page sends it after each puzzle
/// (reportProgress in index.html); the app stores it in the app group the widget can read.
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

    static let appGroup = "group.com.geoffstearns.kingwalk"
    static let key = "progress"
    static let widgetKind = "KingWalkProgress"

    /// The rating a rank starts at, for the bar to the next rank
    static let rankFloors: [String: Int] = ["Pawn": 400, "Knight": 700, "Bishop": 1000, "Rook": 1300, "Queen": 1600, "King": 1900]

    /// How far from this rank to the next, 0 to 1
    var rankFraction: Double {
        guard !next.isEmpty, let lo = Progress.rankFloors[rank] else { return 1 }
        let hi = rating + toNext
        return min(1, max(0.04, Double(rating - lo) / Double(max(1, hi - lo))))
    }

    static let sample = Progress(rating: 1124, rank: "Bishop", piece: "b", next: "Rook", toNext: 176, solved: 142, streak: 4, best: 11,
                                 played: 210, hist: [1020, 1031, 1018, 1044, 1052, 1047, 1066, 1071, 1063, 1080, 1092, 1088, 1101, 1097, 1112, 1124],
                                 at: Date().timeIntervalSince1970 * 1000)

    static func load() -> Progress? {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Progress.self, from: data)
    }
}
