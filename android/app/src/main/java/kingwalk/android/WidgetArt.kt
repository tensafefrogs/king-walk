package kingwalk.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import androidx.core.graphics.createBitmap
import androidx.core.graphics.withSave

/**
 * The widgets' pictures, drawn into bitmaps (a widget can only show views the launcher knows, so the board and the chart
 * are images): the daily puzzle's board and the rating chart, drawn as the iOS widgets draw them (BoardView and
 * Sparkline in ios/KingWalkWidget/KingWalkWidget.swift).
 */
object WidgetArt {
    // the iOS widgets' Palette
    const val GOLD = 0xfff2c230.toInt()
    const val MINT = 0xff56c2ad.toInt()
    const val CORAL = 0xffe2704f.toInt()
    const val NIGHT = 0xff0d2925.toInt()
    private const val LIGHT = 0xffeceed8.toInt()          // the game's board squares
    private const val DARK = 0xff7c9d70.toInt()
    private const val LAST = 0x94f4cd46.toInt()           // the last move, gold at 58%

    private val pieces = HashMap<String, Bitmap>()

    /** a piece's picture ("wk", "bp"…), the same images as the iOS widget's */
    fun pieceRes(name: String): Int = when (name) {
        "wk" -> R.drawable.widget_piece_wk; "wq" -> R.drawable.widget_piece_wq; "wr" -> R.drawable.widget_piece_wr
        "wb" -> R.drawable.widget_piece_wb; "wn" -> R.drawable.widget_piece_wn; "wp" -> R.drawable.widget_piece_wp
        "bk" -> R.drawable.widget_piece_bk; "bq" -> R.drawable.widget_piece_bq; "br" -> R.drawable.widget_piece_br
        "bb" -> R.drawable.widget_piece_bb; "bn" -> R.drawable.widget_piece_bn; "bp" -> R.drawable.widget_piece_bp
        else -> 0
    }

    private fun piece(context: Context, name: String): Bitmap? {
        pieces[name]?.let { return it }
        val res = pieceRes(name)
        if (res == 0) return null
        return BitmapFactory.decodeResource(context.resources, res)?.also { pieces[name] = it }
    }

    /** The position as the game shows it: seen from the side to play, the opponent's last move in gold, in the daily's
     *  coral frame; dimmed once played. `crop` under 8 is a close-up that many squares across, around the focus square. */
    fun board(context: Context, board: DailyBoard, side: Int, done: Boolean, crop: Int = 8): Bitmap {
        val bmp = createBitmap(side, side)
        val c = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val s = side.toFloat()
        val n = crop.coerceIn(1, 8)
        val frame = maxOf(3f, s * 0.03f)
        val cell = (s - frame * 2) / n
        val rows = board.squares
        val flip = board.turn == "b"
        // the window's first drawn row and column: the focus square in the middle (with an even size, the half toward
        // the board's middle), kept on the board
        val (fRow, fFile) = board.focusSquare
        val r0 = start(if (flip) 7 - fRow else fRow, n)
        val c0 = start(if (flip) 7 - fFile else fFile, n)

        paint.color = CORAL
        c.drawRoundRect(RectF(0f, 0f, s, s), s * 0.06f, s * 0.06f, paint)
        val inner = RectF(frame, frame, s - frame, s - frame)
        val dst = RectF()
        c.withSave {
            c.clipPath(Path().apply { addRoundRect(inner, s * 0.035f, s * 0.035f, Path.Direction.CW) })
            for (r in 0 until n) for (col in 0 until n) {
                val row = if (flip) 7 - (r0 + r) else r0 + r
                val file = if (flip) 7 - (c0 + col) else c0 + col
                val name = "abcdefgh"[file] + (8 - row).toString()
                // the cells' edges rounded to whole pixels, so no seams show between them
                dst.set(Math.round(frame + col * cell).toFloat(), Math.round(frame + r * cell).toFloat(),
                    Math.round(frame + (col + 1) * cell).toFloat(), Math.round(frame + (r + 1) * cell).toFloat())
                paint.color = if ((file + 8 - row) % 2 == 1) DARK else LIGHT
                c.drawRect(dst, paint)
                if (name == board.from || name == board.to) { paint.color = LAST; c.drawRect(dst, paint) }
                val img = rows.getOrNull(row)?.getOrNull(file)?.let { piece(context, it) }
                if (img != null) {
                    val pad = cell * 0.04f
                    paint.color = Color.BLACK
                    c.drawBitmap(img, Rect(0, 0, img.width, img.height), RectF(dst.left + pad, dst.top + pad, dst.right - pad, dst.bottom - pad), paint)
                }
            }
        }
        if (done) {
            // played: dimmed (the check is shown beside the board)
            paint.color = Color.argb(102, Color.red(NIGHT), Color.green(NIGHT), Color.blue(NIGHT))
            c.drawRoundRect(RectF(0f, 0f, s, s), s * 0.06f, s * 0.06f, paint)
        }
        return bmp
    }

    private fun start(at: Int, n: Int): Int {
        val before = if (n % 2 == 1) n / 2 else if (at >= 4) n / 2 else n / 2 - 1
        return (at - before).coerceIn(0, 8 - n)
    }

    /** The rating over the last puzzles: a mint line over a fading fill, the latest rating a gold dot. `density` is
     *  pixels per dp, for the line's and dot's sizes. */
    fun chart(values: List<Int>, width: Int, height: Int, density: Float): Bitmap {
        val bmp = createBitmap(width, height)
        if (values.isEmpty()) return bmp
        val c = Canvas(bmp)
        val v = if (values.size == 1) listOf(values[0], values[0]) else values
        val lo = v.min().toDouble()
        val span = maxOf(30.0, v.max() - lo)
        val dot = 3.5f * density
        // inset by the dot's size, so the line's ends and the dot aren't cut off at the edges
        val left = dot
        val w = width - dot * 2
        val top = 4f * density
        val h = height - 8f * density
        val pts = v.mapIndexed { i, r -> (left + w * i / (v.size - 1)) to (top + h * (1 - (r - lo) / span)).toFloat() }
        val line = Path().apply { moveTo(pts[0].first, pts[0].second); pts.drop(1).forEach { lineTo(it.first, it.second) } }
        val fill = Path(line).apply { lineTo(pts.last().first, height.toFloat()); lineTo(pts[0].first, height.toFloat()); close() }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, 0f, height.toFloat(), withAlpha(MINT, 0.35f), withAlpha(MINT, 0f), Shader.TileMode.CLAMP)
        c.drawPath(fill, paint)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2.2f * density
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = MINT
        c.drawPath(line, paint)
        paint.style = Paint.Style.FILL
        paint.color = GOLD
        c.drawCircle(pts.last().first, pts.last().second, dot, paint)
        return bmp
    }

    private fun withAlpha(color: Int, a: Float) = Color.argb((a * 255).toInt(), Color.red(color), Color.green(color), Color.blue(color))
}
