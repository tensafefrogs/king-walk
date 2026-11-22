// Runs ios/KingWalk/SaveRank.swift against testing/save-cases.json, the cases unit.js runs betterSave on.
// swiftc ios/KingWalk/SaveRank.swift testing/SaveRankCases.swift -o /tmp/save-rank && /tmp/save-rank testing/save-cases.json
import Foundation

@main
enum SaveRankCases {
    static func text(_ o: Any?) -> String { String(data: try! JSONSerialization.data(withJSONObject: o ?? [:]), encoding: .utf8)! }

    static func main() {
        let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "testing/save-cases.json"
        guard let data = FileManager.default.contents(atPath: path),
              let file = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cases = file["cases"] as? [[String: Any]] else { print("can't read \(path)"); exit(2) }
        var bad = 0
        for c in cases {
            let want = c["a_wins"] as? Bool ?? false
            let got = SaveRank.better(text(c["a"]), than: text(c["b"]))
            if got != want { bad += 1; print("FAIL \(c["what"] ?? ""): SaveRank says \(got), the case says \(want)") }
        }
        print("\(cases.count - bad) passed, \(bad) failed")
        exit(bad == 0 ? 0 : 1)
    }
}
