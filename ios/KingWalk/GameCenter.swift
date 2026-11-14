import GameKit
import UIKit

/// Game Center: signs the player in at launch, then reports what the page sends: leaderboard scores (op "score")
/// and achievements (op "achieve"). Ids are the page's names with a prefix; they match ios/store/gamecenter.json.
/// Without Game Center (signed out, or turned off) the calls do nothing and the game plays the same.
final class GameCenter: NSObject, GKGameCenterControllerDelegate {
    static let shared = GameCenter()
    static let prefix = "kingwalk."

    private var pendingScores: [String: Int] = [:]
    private var pendingAchievements = Set<String>()
    private var completed = Set<String>()       // achievements Game Center already has: not reported again
    private var reportedScores: [String: Int] = [:]
    private var loadedAchievements = false
    weak var presenter: UIViewController?

    var isSignedIn: Bool { GKLocalPlayer.local.isAuthenticated }

    func signIn() {
        GKLocalPlayer.local.authenticateHandler = { [weak self] controller, _ in
            guard let self else { return }
            if let controller {
                // Apple's sign-in sheet; iOS shows it only when it decides to (not on every launch)
                self.presenter?.present(controller, animated: true)
            } else if GKLocalPlayer.local.isAuthenticated {
                self.loadAchievements()
            }
        }
    }

    private func loadAchievements() {
        GKAchievement.loadAchievements { [weak self] list, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                for a in list ?? [] where a.isCompleted { self.completed.insert(a.identifier) }
                self.loadedAchievements = true
                self.flush()
            }
        }
    }

    func submit(board: String, value: Int) {
        let id = Self.prefix + board
        pendingScores[id] = max(value, pendingScores[id] ?? 0)
        flush()
    }

    func achieve(_ name: String) {
        pendingAchievements.insert(Self.prefix + name)
        flush()
    }

    private func flush() {
        guard GKLocalPlayer.local.isAuthenticated else { return }
        for (id, value) in pendingScores where reportedScores[id] != value {
            reportedScores[id] = value
            GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { _ in }
        }
        pendingScores.removeAll()
        guard loadedAchievements else { return }
        let todo = pendingAchievements.subtracting(completed)
        pendingAchievements.removeAll()
        guard !todo.isEmpty else { return }
        let list = todo.map { id -> GKAchievement in
            let a = GKAchievement(identifier: id)
            a.percentComplete = 100
            a.showsCompletionBanner = true
            return a
        }
        completed.formUnion(todo)
        GKAchievement.report(list) { _ in }
    }

    /// The Game Center dashboard: leaderboards and achievements
    func showDashboard() {
        guard let presenter else { return }
        guard GKLocalPlayer.local.isAuthenticated else {
            let alert = UIAlertController(title: NSLocalizedString("Game Center", comment: ""),
                                          message: NSLocalizedString("Sign in to Game Center in the Settings app to see the leaderboards and your achievements.", comment: ""),
                                          preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: ""), style: .default))
            presenter.present(alert, animated: true)
            return
        }
        let controller = GKGameCenterViewController(state: .dashboard)
        controller.gameCenterDelegate = self
        presenter.present(controller, animated: true)
    }

    func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) {
        controller.dismiss(animated: true)
    }
}
