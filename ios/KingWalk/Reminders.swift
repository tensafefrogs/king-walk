import UserNotifications

/// The daily puzzle reminder: one notification a day at the hour the player picked (Settings in the game). The page
/// sends the next week's worth with their text in the player's language (sendDaily in index.html), skipping today
/// once today's puzzle is done, and sends them again whenever that changes, so there's never a reminder for a
/// puzzle already solved. They are local notifications: nothing goes through a server.
enum Reminders {
    private static let prefix = "daily-"

    /// items: [{date: "yyyy-MM-dd", title, body}]; hour -1 turns them off. Calls back whether notifications are allowed.
    static func schedule(hour: Int, items: [[String: Any]], allowed: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(prefix) })
            guard hour >= 0 else { return DispatchQueue.main.async { allowed(true) } }
            center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                DispatchQueue.main.async { allowed(granted) }
                guard granted else { return }
                for item in items.prefix(14) {
                    guard let date = item["date"] as? String, let title = item["title"] as? String, let body = item["body"] as? String else { continue }
                    let parts = date.split(separator: "-").compactMap { Int($0) }
                    guard parts.count == 3 else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = title
                    content.body = body
                    content.sound = .default
                    content.userInfo = ["open": "daily"]
                    content.threadIdentifier = "daily"
                    let when = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour, minute: 0)
                    let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
                    center.add(UNNotificationRequest(identifier: prefix + date, content: content, trigger: trigger))
                }
            }
        }
    }
}
