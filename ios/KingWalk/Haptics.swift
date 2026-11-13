import UIKit

/// Haptic feedback the page asks for (index.html: haptic(kind)). iOS skips it on its own when the player has
/// turned off System Haptics; the game has its own Haptics switch in the menu too.
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notice = UINotificationFeedbackGenerator()

    static func play(_ kind: String) {
        switch kind {
        case "pick":    // picking up one of your pieces
            light.impactOccurred(intensity: 0.6); light.prepare()
        case "tick":    // dragging a piece over a square it can move to
            selection.selectionChanged(); selection.prepare()
        case "move":    // your piece lands
            rigid.impactOccurred(intensity: 0.75)
        case "take":    // your piece takes one
            medium.impactOccurred(intensity: 1)
        case "opp":     // the other side moves
            soft.impactOccurred(intensity: 0.5)
        case "wrong":   // not the right move
            notice.notificationOccurred(.error)
        case "solve":   // puzzle solved
            notice.notificationOccurred(.success)
        case "rank":    // a new rank: a success, then a short drumroll
            notice.notificationOccurred(.success)
            for (i, strength) in [1.0, 0.8, 1.0].enumerated() {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.22 + Double(i) * 0.12) { heavy.impactOccurred(intensity: CGFloat(strength)) }
            }
        case "hint":
            light.impactOccurred(intensity: 0.5)
        case "toggle":  // a switch in the menu
            selection.selectionChanged()
        default:
            break
        }
    }
}
