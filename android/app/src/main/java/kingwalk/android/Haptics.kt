package kingwalk.android

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.HapticFeedbackConstants
import android.view.View

/**
 * The page's haptic kinds (haptic() in index.html), as Android's own feedback where it has one (it follows the phone's
 * touch feedback setting), and short patterns for the celebrations. The page only sends them with Haptics on in Settings.
 */
object Haptics {
    fun play(view: View, kind: String) = view.post {
        val constant = when (kind) {
            "pick", "tick", "hint", "toggle", "opp" -> HapticFeedbackConstants.CLOCK_TICK
            "move" -> HapticFeedbackConstants.CONTEXT_CLICK
            "take" -> HapticFeedbackConstants.VIRTUAL_KEY
            "wrong" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
            "solve" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
            else -> null
        }
        if (constant != null) {
            view.performHapticFeedback(constant)
            return@post
        }
        // a rank up and the big celebrations: a short rhythm (the same as the website's vibration patterns)
        val pattern = when (kind) {
            "rank" -> longArrayOf(0, 20, 60, 20, 60, 70)
            "celebrate" -> longArrayOf(0, 12, 50, 12, 50, 12, 420, 60, 120, 18, 30, 18, 30, 18, 30, 18, 200, 30, 60, 50)
            else -> return@post
        }
        val vibrator = view.context.getSystemService(Vibrator::class.java) ?: return@post
        if (vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }
}
