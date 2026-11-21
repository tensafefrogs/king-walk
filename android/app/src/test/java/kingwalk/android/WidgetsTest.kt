package kingwalk.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import org.robolectric.RuntimeEnvironment
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate

/**
 * The widgets' rules (Progress.kt, ported from ios/Shared/Progress.swift) and their drawing. The drawing test saves
 * each size of both widgets as a PNG in app/build/widgets/, to look at (Robolectric draws with Android's own graphics).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetsTest {
    private val today: LocalDate = LocalDate.of(2026, 11, 20)

    /** what the page sends (reportProgress in index.html), with today's board */
    private fun sent(dailyDay: String = "2026-11-19", played: String = "", freezes: Int = 0, placing: Boolean = false) = JSONObject("""
        {"rating":1124,"placing":$placing,"rank":"Bishop","rankLine":"Bishop rank","nextLine":"176 to Rook",
         "labels":{"chart":"Rating over time","solved":"solved","inRow":"in a row","best":"best run"},"piece":"b","next":"Rook",
         "toNext":176,"solved":142,"streak":4,"best":11,"played":210,"hist":[1020,1031,1018,1044,1052,1047,1066,1071,1063,1080,1092,1088,1101,1097,1112,1124],
         "at":1795000000000,"dailyDay":"$dailyDay","dailyStreak":5,"dailyTodo":"Today's puzzle is ready","dailyDone":"Today's puzzle: done",
         "dailyLabel":"Daily","dailyFreezes":$freezes,"dailyPlayed":"$played",
         "dailyBoards":[{"n":8,"day":"2026-11-20","fen":"r1b2rk1/pp3ppp/2n5/3qp3/8/2PB1N2/P4PPP/R2Q1RK1","turn":"w","toPlay":"White to play",
           "goal":"Checkmate in 2","from":"e6","to":"d5","focus":"g8"},
          {"n":9,"day":"2026-11-21","fen":"6k1/5ppp/8/8/8/8/5PPP/3r2K1","turn":"b","toPlay":"Black to play","goal":"Find the best move","from":"d8","to":"d1"}]}
    """.trimIndent())

    @Test fun parses() {
        val p = Progress.parse(sent())!!
        assertEquals(1124, p.rating)
        assertEquals("1124", p.ratingText)
        assertEquals(16, p.hist.size)
        assertEquals("in a row", p.label("inRow", "?"))
        assertEquals(2, p.dailyBoards.size)
        assertEquals("176 to Rook", p.nextText)
        assertEquals("?", Progress.parse(sent(placing = true))!!.ratingText)
        // missing a field the widgets need: not kept
        assertNull(Progress.parse(JSONObject("""{"rating":900}""")))
        // a save from before the daily puzzle
        val old = Progress.parse(JSONObject("""{"rating":900,"rank":"Pawn","piece":"p","next":"Knight","toNext":0,"solved":1,"streak":1,"best":1,"played":1,"hist":[900],"at":0}"""))!!
        assertEquals(0, old.dailyStreakNow(today))
        assertFalse(old.dailySolved(today))
        assertNull(old.dailyBoard(today))
        assertEquals("0 → Knight", old.nextText)
    }

    @Test fun dailySolved() {
        assertFalse(Progress.parse(sent())!!.dailySolved(today))
        assertTrue(Progress.parse(sent(dailyDay = "2026-11-20"))!!.dailySolved(today))
        assertTrue("played today, not solved", Progress.parse(sent(played = "2026-11-20"))!!.dailySolved(today))
        assertFalse("played yesterday", Progress.parse(sent(played = "2026-11-19"))!!.dailySolved(today))
    }

    @Test fun streakWithFreezes() {
        assertEquals("solved yesterday: the streak stands", 5, Progress.parse(sent(dailyDay = "2026-11-19"))!!.dailyStreakNow(today))
        assertEquals("solved today", 5, Progress.parse(sent(dailyDay = "2026-11-20"))!!.dailyStreakNow(today))
        assertEquals("a skipped day ends it", 0, Progress.parse(sent(dailyDay = "2026-11-18"))!!.dailyStreakNow(today))
        assertEquals("unless a freeze covers it", 5, Progress.parse(sent(dailyDay = "2026-11-18", freezes = 1))!!.dailyStreakNow(today))
        assertEquals("one freeze per skipped day", 0, Progress.parse(sent(dailyDay = "2026-11-17", freezes = 1))!!.dailyStreakNow(today))
        assertEquals(5, Progress.parse(sent(dailyDay = "2026-11-17", freezes = 2))!!.dailyStreakNow(today))
        assertEquals("across a month's end", 5, Progress.parse(sent(dailyDay = "2026-11-30"))!!.dailyStreakNow(LocalDate.of(2026, 12, 1)))
    }

    @Test fun rankFraction() {
        val p = Progress.parse(sent())!!
        assertEquals((1124 - 1000) / 300.0, p.rankFraction, 1e-9)          // Bishop 1000 to Rook 1300
        assertEquals("at the top", 1.0, p.copy(next = "", piece = "k").rankFraction, 0.0)
        assertEquals("just in a rank: a sliver", 0.04, p.copy(rating = 1000, toNext = 300).rankFraction, 1e-9)
        assertEquals("unknown piece", 1.0, p.copy(piece = "x").rankFraction, 0.0)
    }

    @Test fun todaysBoard() {
        val p = Progress.parse(sent())!!
        assertEquals(8, p.dailyBoard(today)!!.n)
        assertEquals(9, p.dailyBoard(today.plusDays(1))!!.n)
        assertNull("a week on, nothing", p.dailyBoard(today.plusDays(7)))
        assertEquals(8, Daily.number(today))
        assertEquals(1, Daily.number(LocalDate.of(2026, 11, 13)))
        assertEquals("before Daily #1", 1, Daily.number(LocalDate.of(2026, 11, 1)))
        assertEquals(LocalDate.of(2026, 3, 5), Daily.date("2026-03-05"))
        assertEquals("2026-03-05", Daily.key(LocalDate.of(2026, 3, 5)))
        assertNull(Daily.date(""))
    }

    @Test fun fenToSquares() {
        val b = Progress.parse(sent())!!.dailyBoard(today)!!
        val sq = b.squares
        assertEquals(8, sq.size)
        assertTrue(sq.all { it.size == 8 })
        assertEquals("br", sq[0][0])          // a8
        assertEquals("bk", sq[0][6])          // g8
        assertEquals("bq", sq[3][3])          // d5
        assertEquals("wk", sq[7][6])          // g1
        assertNull(sq[4][4])
        assertEquals(0 to 6, b.focusSquare)          // g8
        assertEquals("no focus: the last move's square", 7 to 3, b.copy(focus = null, to = "d1").focusSquare)
        assertEquals("nonsense: the middle", 4 to 4, b.copy(focus = "z9").focusSquare)
    }

    @Test fun savesOnlyChanges() {
        val context = RuntimeEnvironment.getApplication()
        Widgets.save(context, sent())
        assertEquals(1124, Widgets.load(context)!!.rating)
        val prefs = context.getSharedPreferences("widget", Context.MODE_PRIVATE)
        val first = prefs.getString("progress", null)
        Widgets.save(context, sent().put("at", 1795000099999))
        assertEquals("only the time changed: kept as it was", first, prefs.getString("progress", null))
        Widgets.save(context, sent().put("rating", 1130))
        assertEquals(1130, Widgets.load(context)!!.rating)
        Widgets.save(context, JSONObject("""{"rating":5}"""))
        assertEquals("unreadable: ignored", 1130, Widgets.load(context)!!.rating)
    }

    /** every size of both widgets, waiting and done, drawn to PNGs (and the widget picker's previews) */
    @Test fun draws() {
        val context = RuntimeEnvironment.getApplication()
        val out = File("build/widgets").apply { mkdirs() }
        val waiting = Progress.parse(sent())!!
        val done = Progress.parse(sent(dailyDay = "2026-11-20"))!!
        val noBoard = waiting.copy(dailyBoards = emptyList())
        // sizes in dp, as a phone's launcher gives a 2 x 2, 4 x 2 and 4 x 4 widget
        val small = 170 to 170; val wide = 340 to 170; val large = 340 to 340
        fun save(name: String, views: android.widget.RemoteViews, size: Pair<Int, Int>) =
            render(context, views, size).compress(Bitmap.CompressFormat.PNG, 100, File(out, "$name.png").outputStream())
        save("progress-small", Widgets.progressLayout(context, waiting, Widgets.Size.SMALL, today), small)
        save("progress-medium", Widgets.progressLayout(context, done, Widgets.Size.MEDIUM, today), wide)
        save("progress-placing", Widgets.progressLayout(context, Progress.parse(sent(placing = true).put("rankLine", "Finding your level").put("nextLine", ""))!!, Widgets.Size.SMALL, today), small)
        save("progress-empty", Widgets.progressLayout(context, null, Widgets.Size.SMALL, today), small)
        save("daily-small", Widgets.dailyLayout(context, waiting, Widgets.Size.SMALL, today), small)
        save("daily-small-done", Widgets.dailyLayout(context, done, Widgets.Size.SMALL, today), small)
        save("daily-medium", Widgets.dailyLayout(context, waiting, Widgets.Size.MEDIUM, today), wide)
        save("daily-medium-done", Widgets.dailyLayout(context, done, Widgets.Size.MEDIUM, today), wide)
        save("daily-large", Widgets.dailyLayout(context, waiting, Widgets.Size.LARGE, today), large)
        save("daily-black", Widgets.dailyLayout(context, waiting, Widgets.Size.LARGE, today.plusDays(1)), large)
        save("daily-plain", Widgets.dailyLayout(context, noBoard, Widgets.Size.SMALL, today), small)
        save("daily-empty", Widgets.dailyLayout(context, null, Widgets.Size.MEDIUM, today), wide)
        // the widget picker's pictures (res/drawable-nodpi/widget_preview_*.png; copied there by hand when they change)
        save("preview-progress", Widgets.progressLayout(context, Progress.sample(today), Widgets.Size.MEDIUM, today), wide)
        save("preview-daily", Widgets.dailyLayout(context, Progress.sample(today), Widgets.Size.SMALL, today), small)
        val chart = WidgetArt.chart(waiting.hist, 340, 128, 2f)
        assertNotNull(chart)
        chart.compress(Bitmap.CompressFormat.PNG, 100, File(out, "chart.png").outputStream())
        WidgetArt.board(context, waiting.dailyBoard(today)!!, 512, false).compress(Bitmap.CompressFormat.PNG, 100, File(out, "board.png").outputStream())
        WidgetArt.board(context, waiting.dailyBoard(today)!!, 300, false, crop = 3).compress(Bitmap.CompressFormat.PNG, 100, File(out, "board-crop.png").outputStream())
    }

    /** a widget's views as the launcher would show them at this size in dp */
    private fun render(context: Context, views: android.widget.RemoteViews, size: Pair<Int, Int>): Bitmap {
        val d = context.resources.displayMetrics.density
        val w = (size.first * d).toInt(); val h = (size.second * d).toInt()
        val view = views.apply(context, FrameLayout(context))
        view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, w, h)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bmp))
        return bmp
    }
}
