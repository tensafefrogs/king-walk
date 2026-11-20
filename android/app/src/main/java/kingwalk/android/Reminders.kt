package kingwalk.android

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import org.json.JSONArray
import java.util.Calendar

/**
 * The daily puzzle reminder: one notification a day at the hour the player picked (Settings in the game). The page
 * sends the next week's worth with their text in the player's language (sendDaily in index.html), skipping today once
 * today's puzzle is done, and sends them again whenever that changes, so there's never a reminder for a puzzle already
 * solved. They're scheduled on the phone (AlarmManager): nothing goes through a server. The list is kept, so a restart
 * of the phone (Boot) schedules them again. The iOS app's is ios/KingWalk/Reminders.swift.
 */
object Reminders {
    private const val MAX = 14
    private const val CHANNEL = "daily"
    private const val WINDOW = 10 * 60 * 1000L          // Android may deliver up to 10 minutes late, to save battery

    /** items: [{date: "yyyy-MM-dd", title, body, hour?, id?}]: one notification each, at the item's own hour if it has
     *  one (the 9 pm streak saver), else at the reminder hour; hour -1 turns them all off */
    fun save(context: Context, hour: Int, items: JSONArray) {
        prefs(context).edit { putInt("hour", hour); putString("items", items.toString()) }
    }

    fun allowed(context: Context) = NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun reschedule(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        for (i in 0 until MAX) alarms.cancel(pending(context, i, null))
        val hour = prefs(context).getInt("hour", -1)
        if (hour < 0 || !allowed(context)) return
        val items = runCatching { JSONArray(prefs(context).getString("items", "[]")) }.getOrElse { JSONArray() }
        val now = System.currentTimeMillis()
        var slot = 0
        for (i in 0 until minOf(items.length(), MAX)) {
            val item = items.optJSONObject(i) ?: continue
            val parts = item.optString("date").split("-").mapNotNull { it.toIntOrNull() }
            if (parts.size != 3) continue
            val at = if (item.has("hour")) item.optInt("hour").coerceIn(0, 23) else hour
            val time = Calendar.getInstance().apply {
                clear(); set(parts[0], parts[1] - 1, parts[2], at, 0, 0)
            }.timeInMillis
            if (time <= now) continue
            val show = Intent(context, Alarm::class.java)
                .putExtra("title", item.optString("title"))
                .putExtra("body", item.optString("body"))
                .putExtra("tag", item.optString("date") + item.optString("id"))
            alarms.setWindow(AlarmManager.RTC_WAKEUP, time, WINDOW, pending(context, slot++, show))
        }
    }

    private fun pending(context: Context, slot: Int, intent: Intent?): PendingIntent =
        PendingIntent.getBroadcast(context, slot, intent ?: Intent(context, Alarm::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun prefs(context: Context) = context.getSharedPreferences("reminders", Context.MODE_PRIVATE)

    /** Shows one reminder; a tap opens the game on today's puzzle */
    class Alarm : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val title = intent.getStringExtra("title") ?: return
            if (!allowed(context)) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            // the channel's name, as the phone's settings show it: the app's "Today's puzzle", in the phone's language
            manager.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.channel_daily), NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(context, 0, MainActivity.openIntent(context, "daily"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val note = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(context.getColor(R.color.gold))
                .setContentTitle(title)
                .setContentText(intent.getStringExtra("body"))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                // one notification at a time: a new day's replaces yesterday's if it's still there
                manager.notify(CHANNEL, 1, note)
            } catch (_: SecurityException) {
            }
        }
    }

    /** After the phone restarts, the clock or time zone changes, or the app updates: schedule the kept list again */
    class Boot : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action in ACTIONS) reschedule(context)
        }

        private companion object {
            val ACTIONS = setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED)
        }
    }
}
