package kingwalk.android

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * Updates from Google Play while the game is open: when a new version has been out for a couple of days and the
 * phone hasn't installed it on its own, Play downloads it in the background (a "flexible" update, so play goes on),
 * and it's installed when the player next leaves the app, without a prompt. Only for copies installed from Google Play.
 */
class Updates(private val activity: Activity) {
    private val manager = AppUpdateManagerFactory.create(activity)
    private var downloaded = false

    /** on start: ask Play whether there's a version to download */
    fun check() {
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.installStatus() == InstallStatus.DOWNLOADED) { downloaded = true; return@addOnSuccessListener }
            val stale = (info.clientVersionStalenessDays() ?: 0) >= STALE_DAYS
            if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE && stale && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                manager.registerListener { state -> if (state.installStatus() == InstallStatus.DOWNLOADED) downloaded = true }
                runCatching { manager.startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE)) }
            }
        }
    }

    /** the player left the app: install a downloaded update now (Play does it quietly while the app is in the background) */
    fun installIfReady() {
        if (downloaded) manager.completeUpdate()
    }

    private companion object { const val STALE_DAYS = 2 }
}
