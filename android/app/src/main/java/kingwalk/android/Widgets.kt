package kingwalk.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.edit
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

/**
 * The home screen widgets, as the iOS app's (ios/KingWalkWidget/KingWalkWidget.swift): the player's rank and rating
 * (ProgressWidget) and today's daily puzzle (DailyWidget). The page sends the progress after each puzzle and at launch
 * (op "widget"); it's kept here (shared_prefs/widget.xml) and the widgets are drawn from it. With the app closed they
 * change only at midnight, when a new daily puzzle starts: an alarm (inexact, so no special permission) redraws them.
 * The board and the chart are pictures (WidgetArt); the rest are the launcher's own views (res/layout/widget_*.xml,
 * where the gaps are empty FrameLayouts: a widget can't hold a Space or a plain View).
 */
object Widgets {
    private const val PREFS = "widget"
    private const val KEY = "progress"

    /** keeps what the page sent and redraws the widgets; the page also sends it at launch, so nothing is redrawn when
     *  only the time it was sent changed (as ios/KingWalk/WidgetData.swift) */
    fun save(context: Context, data: JSONObject) {
        if (Progress.parse(data) == null) return          // only what the widgets can read
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val old = prefs.getString(KEY, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (old != null && withoutTime(old) == withoutTime(data)) return
        prefs.edit { putString(KEY, data.toString()) }
        update(context)
    }

    private fun withoutTime(o: JSONObject) = JSONObject(o.toString()).apply { remove("at") }.toString()

    fun load(context: Context): Progress? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        ?.let { runCatching { Progress.parse(JSONObject(it)) }.getOrNull() }

    /** redraws every placed widget of both kinds, and sets the alarm for the next midnight */
    fun update(context: Context) {
        val manager = AppWidgetManager.getInstance(context) ?: return
        val progress = load(context)
        for (id in manager.getAppWidgetIds(ComponentName(context, ProgressWidget::class.java)))
            manager.updateAppWidget(id, progressViews(context, manager, id, progress))
        for (id in manager.getAppWidgetIds(ComponentName(context, DailyWidget::class.java)))
            manager.updateAppWidget(id, dailyViews(context, manager, id, progress))
        scheduleMidnight(context)
    }

    // MARK: Sizes

    /** the sizes each widget has a layout for, in dp: a 2 x 2 square, wider, and (the daily) wider and taller */
    enum class Size { SMALL, MEDIUM, LARGE }

    private val SIZES = linkedMapOf(Size.SMALL to SizeF(100f, 100f), Size.MEDIUM to SizeF(220f, 100f), Size.LARGE to SizeF(220f, 220f))

    /** Android 12 and later picks the layout for the widget's size itself, from all of them; before that, the app picks
     *  one from the size the launcher reports (portrait: its smallest width and largest height) */
    private fun sized(context: Context, manager: AppWidgetManager, id: Int, sizes: List<Size>, build: (Size) -> RemoteViews): RemoteViews {
        if (Build.VERSION.SDK_INT >= 31) return RemoteViews(sizes.associate { SIZES.getValue(it) to build(it) })
        val o: Bundle = manager.getAppWidgetOptions(id)
        val w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
        val fits = sizes.lastOrNull { SIZES.getValue(it).width <= w && SIZES.getValue(it).height <= h } ?: sizes.first()
        return build(fits)
    }

    // MARK: The progress widget

    fun progressViews(context: Context, manager: AppWidgetManager, id: Int, p: Progress?): RemoteViews {
        val open = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return sized(context, manager, id, listOf(Size.SMALL, Size.MEDIUM)) { size ->
            progressLayout(context, p, size, LocalDate.now()).apply { setOnClickPendingIntent(android.R.id.background, open) }
        }
    }

    /** one size of the progress widget, for the date given (the daily chip changes at midnight) */
    fun progressLayout(context: Context, p: Progress?, size: Size, today: LocalDate): RemoteViews {
        if (p == null) return RemoteViews(context.packageName, R.layout.widget_empty)
        val v = RemoteViews(context.packageName, if (size == Size.SMALL) R.layout.widget_progress_small else R.layout.widget_progress_medium)
        v.setImageViewResource(R.id.piece, WidgetArt.pieceRes("w" + p.piece).takeIf { it != 0 } ?: R.drawable.widget_piece_wp)
        val done = p.dailySolved(today)
        val streak = p.dailyStreakNow(today)
        v.setImageViewResource(R.id.chip_icon, if (done) R.drawable.widget_check else R.drawable.widget_calendar)
        v.setTextViewText(R.id.chip_count, if (streak > 0) "$streak" else "")
        v.setViewVisibility(R.id.chip_count, if (streak > 0) View.VISIBLE else View.GONE)
        v.setTextColor(R.id.chip_count, context.getColor(if (done) R.color.widget_solved else R.color.widget_gold))
        v.setViewVisibility(R.id.chip_dot, if (done) View.GONE else View.VISIBLE)
        v.setContentDescription(R.id.chip, if (done) p.dailyDoneText else p.dailyTodoText)
        v.setTextViewText(R.id.rank_line, p.rankLine ?: p.rank)
        v.setTextViewText(R.id.rating, p.ratingText)
        v.setProgressBar(R.id.bar, 1000, (p.rankFraction * 1000).toInt(), false)
        v.setTextViewText(R.id.next_line, p.nextText)
        if (size != Size.SMALL) {
            val chartLabel = p.label("chart", "Rating over time")
            val d = context.resources.displayMetrics.density
            v.setTextViewText(R.id.chart_label, chartLabel)
            v.setImageViewBitmap(R.id.chart, WidgetArt.chart(p.hist, (170 * d).toInt(), (64 * d).toInt(), d))
            v.setContentDescription(R.id.chart, "$chartLabel: ${p.ratingText}")
            v.setTextViewText(R.id.solved, "${p.solved}")
            v.setTextViewText(R.id.solved_label, p.label("solved", "solved"))
            v.setTextViewText(R.id.in_row, "${p.streak}")
            v.setTextViewText(R.id.in_row_label, p.label("inRow", "in a row"))
            v.setTextViewText(R.id.best, "${p.best}")
            v.setTextViewText(R.id.best_label, p.label("best", "best run"))
        }
        return v
    }

    // MARK: The daily widget

    fun dailyViews(context: Context, manager: AppWidgetManager, id: Int, p: Progress?): RemoteViews {
        val open = PendingIntent.getActivity(context, 2, MainActivity.openIntent(context, "daily"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return sized(context, manager, id, listOf(Size.SMALL, Size.MEDIUM, Size.LARGE)) { size ->
            dailyLayout(context, p, size, LocalDate.now()).apply { setOnClickPendingIntent(android.R.id.background, open) }
        }
    }

    /** one size of the daily widget for a date: today's board once the game has sent it, else its number and the day */
    fun dailyLayout(context: Context, p: Progress?, size: Size, today: LocalDate): RemoteViews {
        val done = p?.dailySolved(today) ?: false
        val streak = p?.dailyStreakNow(today) ?: 0
        // before the game has sent its own words, the app's: "Daily puzzle", "Today's puzzle"
        val status = if (p == null) context.getString(R.string.channel_daily) else if (done) p.dailyDoneText else p.dailyTodoText
        val label = p?.dailyLabel ?: context.getString(R.string.widget_daily_name)
        val board = p?.dailyBoard(today)
        val layout = when {
            board == null -> R.layout.widget_daily_plain
            size == Size.SMALL -> R.layout.widget_daily_small
            size == Size.MEDIUM -> R.layout.widget_daily_medium
            else -> R.layout.widget_daily_large
        }
        val v = RemoteViews(context.packageName, layout)
        // brighter while today's puzzle waits
        v.setInt(android.R.id.background, "setBackgroundResource", if (done) R.drawable.widget_bg else R.drawable.widget_bg_bright)
        v.setTextViewText(R.id.daily_label, label.uppercase(Locale.getDefault()))
        v.setViewVisibility(R.id.streak_box, if (streak > 0) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.daily_streak, "$streak")
        v.setContentDescription(R.id.streak_box, "$streak")
        v.setTextViewText(R.id.daily_number, "#${board?.n ?: Daily.number(today)}")
        if (layout != R.layout.widget_daily_small) {
            v.setViewVisibility(R.id.status_done, if (done) View.VISIBLE else View.GONE)
            v.setViewVisibility(R.id.status_todo, if (done) View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.status_done_text, status)
            v.setTextViewText(R.id.status_todo_text, status)
        }
        if (board == null) {
            v.setTextViewText(R.id.daily_weekday, today.dayOfWeek.getDisplayName(TextStyle.FULL_STANDALONE, Locale.getDefault()))
            return v
        }
        val d = context.resources.displayMetrics.density
        val boardText = "#${board.n}, ${board.toPlay}, ${board.goal}"
        when (size) {
            Size.SMALL -> {
                v.setImageViewBitmap(R.id.board, WidgetArt.board(context, board, (68 * d).toInt(), done, crop = 3))
                v.setViewVisibility(R.id.state_done, if (done) View.VISIBLE else View.GONE)
                v.setViewVisibility(R.id.state_todo, if (done) View.GONE else View.VISIBLE)
                v.setContentDescription(R.id.state_done, status)
                v.setContentDescription(R.id.state_todo, status)
            }
            // drawn at about the size it's shown (at most 640 pixels, which keeps the widget's pictures small to send)
            Size.MEDIUM -> v.setImageViewBitmap(R.id.board, WidgetArt.board(context, board, minOf(640, (180 * d).toInt()), done))
            Size.LARGE -> v.setImageViewBitmap(R.id.board, WidgetArt.board(context, board, minOf(640, (280 * d).toInt()), done))
        }
        v.setContentDescription(R.id.board, boardText)
        v.setTextViewText(R.id.daily_goal, board.goal)
        if (size != Size.SMALL) v.setTextViewText(R.id.daily_to_play, board.toPlay)
        return v
    }

    // MARK: Midnight

    /** At the next local midnight the widgets are drawn again: a new daily puzzle, and a skipped day ends the streak.
     *  Inexact and not waking the phone: it comes when the phone is next in use, and needs no permission. */
    private fun scheduleMidnight(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val pending = PendingIntent.getBroadcast(context, 0, Intent(context, Refresh::class.java).setAction(ACTION_MIDNIGHT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        if (!anyPlaced(context)) { alarms.cancel(pending); return }
        val midnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        alarms.set(AlarmManager.RTC, midnight + 1000, pending)
    }

    private fun anyPlaced(context: Context): Boolean {
        val manager = AppWidgetManager.getInstance(context) ?: return false
        return manager.getAppWidgetIds(ComponentName(context, ProgressWidget::class.java)).isNotEmpty() ||
            manager.getAppWidgetIds(ComponentName(context, DailyWidget::class.java)).isNotEmpty()
    }

    private const val ACTION_MIDNIGHT = "kingwalk.android.WIDGETS_MIDNIGHT"

    /** The midnight alarm, and the phone restarting (alarms are lost), its clock or time zone changing (midnight
     *  moves) or the app updating: draw the widgets again and set the next alarm */
    class Refresh : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action in ACTIONS) update(context)
        }

        private companion object {
            val ACTIONS = setOf(ACTION_MIDNIGHT, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
                Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED)
        }
    }
}

/** The rank, rating and progress to the next rank; tapping it opens the game */
class ProgressWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.update(context)

    /** before Android 12 the app picks the layout for the size, so a resize draws it again */
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        if (Build.VERSION.SDK_INT < 31) manager.updateAppWidget(id, Widgets.progressViews(context, manager, id, Widgets.load(context)))
    }

    override fun onDisabled(context: Context) = Widgets.update(context)          // the last one removed: no more midnight alarm, unless a daily is placed
}

/** Today's daily puzzle: its board, the daily streak, done or waiting; tapping it opens the puzzle */
class DailyWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.update(context)

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        if (Build.VERSION.SDK_INT < 31) manager.updateAppWidget(id, Widgets.dailyViews(context, manager, id, Widgets.load(context)))
    }

    override fun onDisabled(context: Context) = Widgets.update(context)
}
