package kingwalk.android

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The player's progress as the home screen widgets show it. The page sends it after each puzzle and at launch
 * (reportProgress in index.html, op "widget"); Widgets.save keeps it. The same fields and rules as the iOS app's
 * (ios/Shared/Progress.swift); the parts that only some saves have are null when missing.
 */
data class Progress(
    val rating: Int,
    val rank: String,           // Pawn, Knight, Bishop, Rook, Queen, King (in the player's language)
    val piece: String,          // p, n, b, r, q, k
    val next: String,           // the next rank's name, or "" at the top
    val toNext: Int,            // rating points to the next rank
    val solved: Int,
    val streak: Int,
    val best: Int,
    val played: Int,
    val hist: List<Int>,        // the last 30 ratings, oldest first
    val at: Double,             // when, in milliseconds since 1970
    val rankLine: String? = null,   // "Bishop rank"
    val nextLine: String? = null,   // "176 to Rook", or "Top rank"
    val labels: Map<String, String> = emptyMap(),   // chart, solved, inRow, best
    val placing: Boolean = false,   // a new player's first puzzles, still finding their level: the rating is hidden
    val dailyDay: String? = null,   // the local date of the last daily solved, yyyy-MM-dd, or ""
    val dailyStreak: Int? = null,   // days in a row, as of that day
    val dailyTodo: String? = null,  // "Today's puzzle is ready", in the player's language
    val dailyDone: String? = null,  // "Today's puzzle: done"
    val dailyLabel: String? = null, // "Daily"
    val dailyFreezes: Int = 0,      // streak freezes held: each covers one skipped day
    val dailyPlayed: String? = null, // the local date today's daily was played (solved or not), or ""
    val dailyBoards: List<DailyBoard> = emptyList(),   // today's daily puzzle and the next six
) {
    /** the rating as the widgets show it: "?" while the level is still being found */
    val ratingText: String get() = if (placing) "?" else "$rating"

    /** whether today's daily puzzle was played (solved or not) */
    fun dailySolved(on: LocalDate = LocalDate.now()): Boolean = dailyDay == Daily.key(on) || dailyPlayed == Daily.key(on)

    /** the daily streak as it stands on this date: a skipped day ends it, unless a freeze covers it */
    fun dailyStreakNow(on: LocalDate = LocalDate.now()): Int {
        val last = dailyDay?.let { Daily.date(it) } ?: return 0
        val streak = dailyStreak ?: return 0
        val skipped = ChronoUnit.DAYS.between(last, on) - 1
        return if (skipped <= dailyFreezes) streak else 0
    }

    val dailyTodoText: String get() = dailyTodo ?: "Today's puzzle is ready"
    val dailyDoneText: String get() = dailyDone ?: "Today's puzzle: done"
    val dailyLabelText: String get() = dailyLabel ?: "Daily"

    /** the daily puzzle's board for this date, if the page has sent it */
    fun dailyBoard(on: LocalDate = LocalDate.now()): DailyBoard? = dailyBoards.firstOrNull { it.day == Daily.key(on) }

    /** How far from this rank to the next, 0 to 1 (the bar under the rating) */
    val rankFraction: Double
        get() {
            val lo = RANK_FLOORS[piece]
            if (next.isEmpty() || lo == null) return 1.0
            val hi = rating + toNext
            return ((rating - lo).toDouble() / maxOf(1, hi - lo)).coerceIn(0.04, 1.0)
        }

    /** "176 to Rook" as the page wrote it, or built here for saves from before the game was translated */
    val nextText: String get() = nextLine ?: if (next.isEmpty()) "Top rank" else "$toNext → $next"

    /** a label the page sent, or the English one */
    fun label(key: String, english: String): String = labels[key] ?: english

    companion object {
        /** The rating each rank starts at, by its piece letter (rank names come translated) */
        val RANK_FLOORS = mapOf("p" to 400, "n" to 700, "b" to 1000, "r" to 1300, "q" to 1600, "k" to 1900)

        /** what the page sent, or null if it's missing a field the widgets need */
        fun parse(o: JSONObject): Progress? = runCatching {
            fun str(k: String) = if (o.has(k) && !o.isNull(k)) o.getString(k) else null
            fun int(k: String) = if (o.has(k) && !o.isNull(k)) o.getInt(k) else null
            val hist = o.getJSONArray("hist")
            val labels = o.optJSONObject("labels")
            val boards = o.optJSONArray("dailyBoards") ?: JSONArray()
            Progress(
                rating = o.getInt("rating"), rank = o.getString("rank"), piece = o.getString("piece"), next = o.getString("next"),
                toNext = o.getInt("toNext"), solved = o.getInt("solved"), streak = o.getInt("streak"), best = o.getInt("best"),
                played = o.getInt("played"), hist = (0 until hist.length()).map { hist.getInt(it) }, at = o.getDouble("at"),
                rankLine = str("rankLine"), nextLine = str("nextLine"),
                labels = labels?.keys()?.asSequence()?.associateWith { labels.getString(it) } ?: emptyMap(),
                placing = o.optBoolean("placing", false),
                dailyDay = str("dailyDay"), dailyStreak = int("dailyStreak"), dailyTodo = str("dailyTodo"), dailyDone = str("dailyDone"),
                dailyLabel = str("dailyLabel"), dailyFreezes = int("dailyFreezes") ?: 0, dailyPlayed = str("dailyPlayed"),
                dailyBoards = (0 until boards.length()).mapNotNull { boards.optJSONObject(it)?.let(DailyBoard::parse) },
            )
        }.getOrNull()

        /** the widget picker's and the tests' example */
        fun sample(today: LocalDate = LocalDate.now()) = Progress(
            rating = 1124, rank = "Bishop", piece = "b", next = "Rook", toNext = 176, solved = 142, streak = 4, best = 11, played = 210,
            hist = listOf(1020, 1031, 1018, 1044, 1052, 1047, 1066, 1071, 1063, 1080, 1092, 1088, 1101, 1097, 1112, 1124),
            at = System.currentTimeMillis().toDouble(), rankLine = "Bishop rank", nextLine = "176 to Rook", dailyDay = Daily.key(today.minusDays(1)), dailyStreak = 5, dailyFreezes = 1,
            dailyBoards = listOf(DailyBoard(Daily.number(today), Daily.key(today), "r1b2rk1/pp3ppp/2n5/3qp3/8/2PB1N2/P4PPP/R2Q1RK1",
                "w", "White to play", "Checkmate in 2", "e6", "d5", "g8")),
        )
    }
}

/**
 * One day's daily puzzle as the player first sees it (dailyBoards in index.html): the pieces (a FEN's board part, rank 8
 * first), whose turn ("w" or "b", which is also the side the board is seen from), the turn and goal in the player's
 * language, and the opponent's move that led here (squares like "e6").
 */
data class DailyBoard(
    val n: Int,
    val day: String,
    val fen: String,
    val turn: String,
    val toPlay: String,
    val goal: String,
    val from: String,
    val to: String,
    val focus: String? = null,  // where the small widget's close-up looks: the king to be mated, else the opponent's last move
) {
    /** the focus square as (row, file): row 0 is rank 8, file 0 is a */
    val focusSquare: Pair<Int, Int>
        get() {
            val sq = focus ?: to
            val f = if (sq.length == 2) "abcdefgh".indexOf(sq[0]) else -1
            val rank = if (sq.length == 2) sq[1].digitToIntOrNull() ?: 0 else 0
            return if (f < 0 || rank !in 1..8) 4 to 4 else (8 - rank) to f
        }

    /** the piece on each square, rank 8 to rank 1 and file a to h: "wk", "bp"… or null */
    val squares: List<List<String?>>
        get() = fen.split("/").map { row ->
            val out = mutableListOf<String?>()
            for (ch in row) {
                val gap = ch.digitToIntOrNull()
                if (gap != null) repeat(gap) { out.add(null) }
                else out.add((if (ch.isUpperCase()) "w" else "b") + ch.lowercaseChar())
            }
            (out + List(8) { null }).take(8)
        }

    companion object {
        fun parse(o: JSONObject): DailyBoard? = runCatching {
            DailyBoard(o.getInt("n"), o.getString("day"), o.getString("fen"), o.getString("turn"), o.getString("toPlay"),
                o.getString("goal"), o.getString("from"), o.getString("to"), if (o.has("focus") && !o.isNull("focus")) o.getString("focus") else null)
        }.getOrNull()
    }
}

/** The daily puzzle's calendar, as the page counts it (dayNumber in index.html): Daily #1 is 13 November 2026, and a
 *  new one starts at midnight, local time. */
object Daily {
    private val FIRST: LocalDate = LocalDate.of(2026, 11, 13)

    fun key(date: LocalDate): String = "%04d-%02d-%02d".format(java.util.Locale.US, date.year, date.monthValue, date.dayOfMonth)

    fun date(key: String): LocalDate? {
        val p = key.split("-").mapNotNull { it.toIntOrNull() }
        return if (p.size == 3) runCatching { LocalDate.of(p[0], p[1], p[2]) }.getOrNull() else null
    }

    fun number(date: LocalDate = LocalDate.now()): Int = maxOf(1, ChronoUnit.DAYS.between(FIRST, date).toInt() + 1)
}
