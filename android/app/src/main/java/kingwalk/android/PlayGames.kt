package kingwalk.android

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import com.google.android.gms.games.PlayGames
import com.google.android.gms.games.PlayGamesSdk
import org.json.JSONObject

/**
 * Google Play Games: the game's achievements and leaderboards, as Game Center has them on iOS (ios/store/gamecenter.json,
 * the ids the page sends). Play gives each its own id when it's created (android/store/playgames.py makes them), so
 * the build carries a map from the page's ids to Play's, and the game's Play Games project id, from the GitHub
 * variables ANDROID_PLAY_GAMES_APP_ID and ANDROID_PLAY_GAMES_IDS. Without them Play Games is off and the page hides
 * its row. Play Games signs the player in on its own (version 2 of its library); a player who isn't signed in
 * simply isn't sent anything.
 */
object PlayGames {
    private val ids: JSONObject = runCatching { JSONObject(BuildConfig.PLAY_GAMES_IDS) }.getOrElse { JSONObject() }
    private fun idFor(kind: String, id: String) = ids.optJSONObject(kind)?.optString(id).orEmpty()

    val enabled = BuildConfig.PLAY_GAMES_APP_ID.isNotEmpty() && ids.length() > 0

    fun init(context: Context) { if (enabled) PlayGamesSdk.initialize(context) }

    /** whether the player is signed in to Play Games (it signs them in itself when the game starts, if it can) */
    fun signedIn(activity: Activity, then: (Boolean) -> Unit) {
        if (!enabled) return then(false)
        PlayGames.getGamesSignInClient(activity).isAuthenticated.addOnCompleteListener { t ->
            then(t.isSuccessful && t.result?.isAuthenticated == true)
        }
    }

    /** an achievement earned (the page's id, like "first_solve"); Play ignores ones already unlocked */
    fun achieve(activity: Activity, id: String) {
        val play = idFor("achievements", id)
        if (enabled && play.isNotEmpty()) PlayGames.getAchievementsClient(activity).unlock(play)
    }

    /** a score for a leaderboard (the page's id, like "rating"); Play keeps the best */
    fun score(activity: Activity, board: String, value: Long) {
        val play = idFor("leaderboards", board)
        if (enabled && play.isNotEmpty() && value > 0) PlayGames.getLeaderboardsClient(activity).submitScore(play, value)
    }

    /** the page's Play Games button: achievements or leaderboards, named by the page in the player's language */
    fun show(activity: Activity, labels: List<String>) {
        if (!enabled) return
        val names = if (labels.size == 2) labels.toTypedArray() else arrayOf("Achievements", "Leaderboards")
        AlertDialog.Builder(activity).setTitle("Google Play Games").setItems(names) { _, which ->
            val intent = if (which == 0) PlayGames.getAchievementsClient(activity).achievementsIntent
            else PlayGames.getLeaderboardsClient(activity).allLeaderboardsIntent
            intent.addOnSuccessListener { activity.startActivity(it) }
        }.show()
    }
}
