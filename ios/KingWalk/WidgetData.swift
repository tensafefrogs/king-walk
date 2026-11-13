import Foundation
import WidgetKit

/// Saves the progress the page sends (op "widget") where the widget can read it, and refreshes the widget.
enum WidgetData {
    private static var last: Data?

    static func save(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              (try? JSONDecoder().decode(Progress.self, from: data)) != nil,   // only what the widget can read
              let shared = UserDefaults(suiteName: Progress.appGroup) else { return }
        // the page also sends it at launch: skip when only the timestamp changed
        let withoutTime = try? JSONSerialization.data(withJSONObject: dict.filter { $0.key != "at" }, options: .sortedKeys)
        if withoutTime == last { return }
        last = withoutTime
        shared.set(data, forKey: Progress.key)
        WidgetCenter.shared.reloadTimelines(ofKind: Progress.widgetKind)
    }
}
