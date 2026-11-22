import Foundation

/// betterSave in index.html, for the app: should save a replace save b? More progress (rated puzzles plus daily
/// puzzles played) wins; a save with none never wins; a newer Start over beats an older history. The same rule as the
/// page's, checked against the same cases (testing/save-cases.json: unit.js runs the page's rule on them, the Test
/// workflow's save-rank job this one), so the two can't drift apart. Kept apart from SaveStore so it compiles alone.
enum SaveRank {
    private struct Rank { let since: Double; let progress: Int; let reset: Bool; let at: Double }

    private static func rank(_ json: String) -> Rank? {
        guard let s = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any],
              let p = (s["players"] as? [[String: Any]])?.first else { return nil }
        let days = ((p["daily"] as? [String: Any])?["days"] as? [String: Any])?.count ?? 0
        return Rank(since: (p["since"] as? NSNumber)?.doubleValue ?? 0, progress: ((p["n"] as? NSNumber)?.intValue ?? 0) + days,
                    reset: s["reset"] as? Bool ?? false, at: (s["updatedAt"] as? NSNumber)?.doubleValue ?? 0)
    }

    static func better(_ a: String, than b: String) -> Bool {
        guard let A = rank(a) else { return false }
        guard let B = rank(b) else { return true }
        if A.since != B.since {
            if A.reset && A.since > B.since { return true }
            if B.reset && B.since > A.since { return false }
        }
        if A.progress == 0 { return false }
        if B.progress == 0 { return true }
        if A.progress != B.progress { return A.progress > B.progress }
        return A.at > B.at + 5000
    }
}
