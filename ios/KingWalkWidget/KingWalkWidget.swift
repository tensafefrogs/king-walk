import SwiftUI
import WidgetKit

/// The home screen, lock screen and StandBy widgets: the player's rank, puzzle rating and progress to the next rank,
/// and the daily puzzle. They read what the app last saved (Shared/Progress.swift); the app asks for a refresh after
/// each puzzle, and each widget refreshes itself at midnight, when a new daily puzzle starts.
/// On iOS 18 and later there is also a Control Center button that opens today's puzzle.
@main
struct KingWalkWidgets: WidgetBundle {
    var body: some Widget {
        ProgressWidget()
        DailyWidget()
        if #available(iOSApplicationExtension 18.0, *) { DailyControl() }
    }
}

struct ProgressEntry: TimelineEntry {
    let date: Date
    let progress: Progress?
}

struct ProgressProvider: TimelineProvider {
    func placeholder(in context: Context) -> ProgressEntry { ProgressEntry(date: Date(), progress: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (ProgressEntry) -> Void) {
        completion(ProgressEntry(date: Date(), progress: Progress.load() ?? (context.isPreview ? .sample : nil)))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ProgressEntry>) -> Void) {
        // The app reloads the widgets when the player finishes a puzzle; on their own, they only change at midnight,
        // when today's puzzle is new again (and a skipped day ends the daily streak)
        let now = Date(), progress = Progress.load()
        completion(Timeline(entries: [ProgressEntry(date: now, progress: progress), ProgressEntry(date: Daily.nextMidnight(after: now), progress: progress)],
                            policy: .atEnd))
    }
}

struct ProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Progress.widgetKind, provider: ProgressProvider()) { entry in
            ProgressWidgetView(entry: entry)
        }
        .configurationDisplayName("King Walk")
        .description("Your rank and puzzle rating.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

enum Palette {
    static let gold = Color(red: 0xf2 / 255, green: 0xc2 / 255, blue: 0x30 / 255)
    static let ink = Color(red: 0x16 / 255, green: 0x30 / 255, blue: 0x2c / 255)
    static let cream = Color(red: 0xfd / 255, green: 0xfb / 255, blue: 0xf2 / 255)
    static let deepTeal = Color(red: 0x14 / 255, green: 0x3f / 255, blue: 0x38 / 255)
    static let mint = Color(red: 0x56 / 255, green: 0xc2 / 255, blue: 0xad / 255)
    static let coral = Color(red: 0xe2 / 255, green: 0x70 / 255, blue: 0x4f / 255)
    static let teal = Color(red: 0x1c / 255, green: 0x78 / 255, blue: 0x68 / 255)
    static let night = Color(red: 0x0d / 255, green: 0x29 / 255, blue: 0x25 / 255)
    static let solved = Color(red: 0x22 / 255, green: 0xa0 / 255, blue: 0x6b / 255)   // the game's check for a solved daily
    /// the store art's backdrop: lighter teal at the top into deep ink
    static func backdrop(bright: Bool = false) -> LinearGradient {
        LinearGradient(colors: [bright ? teal : deepTeal, night], startPoint: .top, endPoint: .bottom)
    }
}

/// The game's display face, Fredoka (Fonts/), for numbers and the name: what reads at a glance looks like the game.
/// Words stay in the system's rounded font, which has every script the game is in.
enum Brand {
    static func number(_ size: CGFloat, bold: Bool = true) -> Font { .custom(bold ? "FredokaLight-Bold" : "FredokaLight-SemiBold", fixedSize: size) }
}

/// the King Walk icon, small, beside a widget's title
struct Mark: View {
    var size: CGFloat = 16
    var body: some View {
        Image("mark").resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
    }
}

struct ProgressWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ProgressEntry

    var body: some View {
        content
            .widgetURL(entry.progress.map { $0.dailySolved(on: entry.date) } == false ? Daily.url : nil)
            .widgetBackground(family.isAccessory ? AnyView(Color.clear) : AnyView(Palette.backdrop()))
    }

    @ViewBuilder private var content: some View {
        if let p = entry.progress {
            switch family {
            case .accessoryCircular: CircularView(p: p)
            case .accessoryRectangular: RectangularView(p: p)
            case .accessoryInline: Text("\(p.rank) · \(p.rating)")
            case .systemMedium: MediumView(p: p, date: entry.date)
            default: SmallView(p: p, date: entry.date)
            }
        } else {
            EmptyStateView(compact: family.isAccessory)
        }
    }
}

private extension WidgetFamily {
    var isAccessory: Bool { self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline }
}

/// iOS 17 wants widgets to give their background this way; iOS 16 draws it behind the view
private extension View {
    @ViewBuilder func widgetBackground(_ background: AnyView) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { background }
        } else {
            ZStack { background; self.padding() }
        }
    }
}

struct PieceBadge: View {
    let piece: String
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.26, style: .continuous).fill(Palette.gold)
                .shadow(color: Palette.night.opacity(0.6), radius: 0, x: 2, y: 2)   // the game's cards sit on a hard shadow
            Image("piece-w" + piece).resizable().scaledToFit().padding(size * 0.12)
        }
        .frame(width: size, height: size)
    }
}

struct RankBar: View {
    let fraction: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18))
                Capsule().fill(Palette.gold).frame(width: max(6, g.size.width * fraction))
            }
        }
        .frame(height: 6)
    }
}

/// today's daily puzzle at a glance: a check and the daily streak when it's done, a gold dot when it's waiting
struct DailyChip: View {
    let p: Progress
    let date: Date
    var body: some View {
        let done = p.dailySolved(on: date), streak = p.dailyStreakNow(on: date)
        HStack(spacing: 3) {
            Image(systemName: done ? "checkmark.circle.fill" : "calendar").font(.system(size: 12, weight: .bold))
            if streak > 0 { Text("\(streak)").font(Brand.number(14)) }
            if !done { Circle().fill(Palette.coral).frame(width: 6, height: 6) }
        }
        .foregroundColor(done ? Palette.solved : Palette.gold)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(done ? p.dailyDoneText : p.dailyTodoText)
    }
}

struct SmallView: View {
    let p: Progress
    var date = Date()
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                PieceBadge(piece: p.piece)
                Spacer()
                DailyChip(p: p, date: date)
            }
            Spacer(minLength: 2)
            Text(p.rankLine ?? "\(p.rank)").font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.8))
            Text("\(p.rating)").font(Brand.number(36)).foregroundColor(Palette.cream)
                .minimumScaleFactor(0.7).lineLimit(1)
            RankBar(fraction: p.rankFraction)
            Text(p.nextText).font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(Palette.cream.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
        }
    }
}

struct MediumView: View {
    let p: Progress
    var date = Date()
    var body: some View {
        HStack(spacing: 14) {
            SmallView(p: p, date: date).frame(maxWidth: 130)
            VStack(alignment: .leading, spacing: 6) {
                Text(p.label("chart", "Rating over time")).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.7))
                Sparkline(values: p.hist).frame(maxHeight: .infinity)
                HStack(spacing: 14) {
                    Stat(value: p.solved, label: p.label("solved", "solved"))
                    Stat(value: p.streak, label: p.label("inRow", "in a row"))
                    Stat(value: p.best, label: p.label("best", "best run"))
                }
            }
        }
    }
}

struct Stat: View {
    let value: Int
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(value)").font(Brand.number(18)).foregroundColor(Palette.cream)
            Text(label).font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.65))
        }
    }
}

struct Sparkline: View {
    let values: [Int]
    var body: some View {
        GeometryReader { g in
            let pts = points(in: g.size)
            ZStack {
                if pts.count > 1 {
                    Path { path in
                        path.move(to: CGPoint(x: pts[0].x, y: g.size.height))
                        pts.forEach { path.addLine(to: $0) }
                        path.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: g.size.height))
                        path.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [Palette.mint.opacity(0.35), Palette.mint.opacity(0)], startPoint: .top, endPoint: .bottom))
                    Path { path in path.addLines(pts) }
                        .stroke(Palette.mint, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                }
                if let last = pts.last {
                    Circle().fill(Palette.gold).frame(width: 7, height: 7).position(last)
                }
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard !values.isEmpty else { return [] }
        let v = values.count == 1 ? [values[0], values[0]] : values
        let lo = Double(v.min()!), hi = Double(v.max()!), span = max(30, hi - lo)
        return v.enumerated().map { i, r in
            CGPoint(x: size.width * CGFloat(i) / CGFloat(v.count - 1),
                    y: 4 + (size.height - 8) * CGFloat(1 - (Double(r) - lo) / span))
        }
    }
}

struct CircularView: View {
    let p: Progress
    var body: some View {
        Gauge(value: p.rankFraction) {
            Image("piece-w" + p.piece).resizable().scaledToFit()
        } currentValueLabel: {
            Text("\(p.rating)").font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .gaugeStyle(.accessoryCircular)
    }
}

struct RectangularView: View {
    let p: Progress
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("King Walk").font(.system(size: 12, weight: .semibold, design: .rounded)).widgetAccentable()
            Text("\(p.rank) · \(p.rating)").font(.system(size: 17, weight: .bold, design: .rounded))
            Text(p.nextText).font(.system(size: 12, weight: .medium, design: .rounded))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EmptyStateView: View {
    let compact: Bool
    var body: some View {
        if compact {
            Text("King Walk").font(.system(size: 13, weight: .semibold, design: .rounded))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                PieceBadge(piece: "p")
                Spacer()
                Text("King Walk").font(Brand.number(19)).foregroundColor(Palette.cream)
                Text("Solve a puzzle to see your rank here.").font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(Palette.cream.opacity(0.75))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: The daily puzzle widget

/// Today's puzzle: its number and day, done or waiting, and the daily streak. Big and plain, so it reads from across
/// the room in StandBy. Tapping it opens the puzzle.
struct DailyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Progress.dailyKind, provider: ProgressProvider()) { entry in
            DailyWidgetView(entry: entry)
        }
        .configurationDisplayName("Daily puzzle")
        .description("Today's puzzle and your daily streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DailyWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ProgressEntry

    var body: some View {
        let p = entry.progress, n = Daily.number(entry.date)
        let done = p?.dailySolved(on: entry.date) ?? false, streak = p?.dailyStreakNow(on: entry.date) ?? 0
        let status = done ? (p?.dailyDoneText ?? "Today's puzzle: done") : (p?.dailyTodoText ?? "Today's puzzle is ready")
        let label = p?.dailyLabelText ?? "Daily"
        let count: String = streak > 0 ? "\(streak)" : "#\(n)"
        let inline: String = done ? "\(label) #\(n) ✓" : "\(label) #\(n)"
        let board = p?.dailyBoard(on: entry.date)          // the position, once the app has sent it (medium and large)
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Image(systemName: done ? "checkmark" : "calendar").font(.system(size: 14, weight: .bold))
                        Text(count).font(.system(size: 15, weight: .bold, design: .rounded)).minimumScaleFactor(0.6)
                    }
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text("King Walk \(label) #\(n)").font(.system(size: 13, weight: .semibold, design: .rounded)).widgetAccentable()
                    Text(status).font(.system(size: 15, weight: .bold, design: .rounded)).lineLimit(2).minimumScaleFactor(0.8)
                    if streak > 0 { Label("\(streak)", systemImage: "flame.fill").font(.system(size: 12, weight: .semibold, design: .rounded)) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .accessoryInline:
                Label(inline, systemImage: done ? "checkmark.circle" : "calendar")
            case .systemMedium where board != nil, .systemLarge where board != nil:   // each size its own condition: a where binds to one pattern
                DailyBoardLayout(board: board!, size: family == .systemLarge ? .large : .medium, label: label, streak: streak, done: done, status: status)
            case .systemSmall where board != nil:
                // a close-up of the board on the Home Screen; StandBy (no container background) keeps the big number below
                StandByAware(standBy: AnyView(plainDaily(n: n, label: label, streak: streak, done: done, status: status)),
                             home: AnyView(DailyBoardLayout(board: board!, size: .small, label: label, streak: streak, done: done, status: status)))
            default:
                plainDaily(n: n, label: label, streak: streak, done: done, status: status)
            }
        }
        .widgetURL(Daily.url)
        .widgetBackground(family.isAccessory ? AnyView(Color.clear) : AnyView(Palette.backdrop(bright: !done)))   // brighter while today's waits
    }

    /// the daily without the board: the number and the day, big enough to read across a room in StandBy
    private func plainDaily(n: Int, label: String, streak: Int, done: Bool, status: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Mark(size: 16)
                Text(label.uppercased()).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.75))
                Spacer()
                if streak > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill").font(.system(size: 13, weight: .bold))
                        Text("\(streak)").font(Brand.number(16))
                    }
                    .foregroundColor(Palette.gold)
                }
            }
            Spacer(minLength: 0)
            Text("#\(n)").font(Brand.number(46)).foregroundColor(Palette.cream).minimumScaleFactor(0.6).lineLimit(1)
            Text(entry.date, format: .dateTime.weekday(.wide)).font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.8))
            Spacer(minLength: 4)
            if done {
                // solved: the game's green check
                HStack(spacing: 5) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 15, weight: .bold)).foregroundColor(Palette.solved)
                    Text(status).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.9)).lineLimit(2).minimumScaleFactor(0.8)
                }
            } else {
                // waiting: the game's gold button, ink on gold
                HStack(spacing: 5) {
                    Image(systemName: "play.fill").font(.system(size: 11, weight: .bold))
                    Text(status).font(.system(size: 12, weight: .bold, design: .rounded)).lineLimit(2).minimumScaleFactor(0.75)
                }
                .foregroundColor(Palette.ink)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Palette.gold)
                                .shadow(color: Palette.night.opacity(0.6), radius: 0, x: 2, y: 2))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Shows `standBy` where the widget has no container background (StandBy, iOS 17 and later), else `home`
struct StandByAware: View {
    let standBy: AnyView
    let home: AnyView
    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) { Picker17(standBy: standBy, home: home) } else { home }
    }
    @available(iOSApplicationExtension 17.0, *)
    private struct Picker17: View {
        @Environment(\.showsWidgetContainerBackground) private var background
        let standBy: AnyView
        let home: AnyView
        var body: some View { if background { home } else { standBy } }
    }
}

// MARK: Today's puzzle on the board

/// The daily widget's medium and large sizes: the position itself, as the player first sees it (the opponent's move
/// highlighted, seen from the side to play, in the daily's coral frame), with the number, whose turn, the goal, the
/// streak and done or waiting. Solved, the board dims under the game's green check.
struct DailyBoardLayout: View {
    enum Size { case small, medium, large }
    let board: DailyBoard
    let size: Size
    let label: String
    let streak: Int
    let done: Bool
    let status: String

    var body: some View {
        if size == .small {
            // a 3 × 3 close-up around the focus square and the number, done or waiting, with the goal under them. No
            // status sentence: in many languages it doesn't fit this size (the board's check and the gold play button say it)
            VStack(alignment: .leading, spacing: 6) {
                header
                Spacer(minLength: 0)
                HStack(alignment: .center, spacing: 10) {
                    BoardView(board: board, done: done, crop: 3).frame(width: 64, height: 64)
                    numberBadge
                }
                Text(board.goal).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.85))
                    .lineLimit(2).minimumScaleFactor(0.75).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if size == .large {
            VStack(alignment: .leading, spacing: 8) {
                header
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("#\(board.n)").font(Brand.number(26)).foregroundColor(Palette.cream)
                    Text(board.toPlay).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.7)
                    Text(board.goal).font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
                }
                BoardView(board: board, done: done).frame(maxWidth: .infinity, maxHeight: .infinity)
                statusLine
            }
        } else {
            HStack(spacing: 14) {
                BoardView(board: board, done: done).aspectRatio(1, contentMode: .fit)
                VStack(alignment: .leading, spacing: 3) {
                    header
                    Spacer(minLength: 0)
                    Text("#\(board.n)").font(Brand.number(30)).foregroundColor(Palette.cream).lineLimit(1)
                    Text(board.toPlay).font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.8)
                    Text(board.goal).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.7)).lineLimit(2).minimumScaleFactor(0.8)
                    Spacer(minLength: 4)
                    statusLine
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// the small size's number: the game's gold play button while today's puzzle waits, with the green check once done
    @ViewBuilder private var numberBadge: some View {
        if done {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 16, weight: .bold)).foregroundColor(Palette.solved)
                Text("#\(board.n)").font(Brand.number(22)).foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.6)
            }
            .accessibilityElement(children: .ignore).accessibilityLabel(status)
        } else {
            HStack(spacing: 4) {
                Image(systemName: "play.fill").font(.system(size: 11, weight: .bold))
                Text("#\(board.n)").font(Brand.number(20)).lineLimit(1).minimumScaleFactor(0.6)
            }
            .foregroundColor(Palette.ink)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Palette.gold)
                            .shadow(color: Palette.night.opacity(0.6), radius: 0, x: 2, y: 2))
            .accessibilityElement(children: .ignore).accessibilityLabel(status)
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Mark(size: 16)
            Text(label.uppercased()).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.75))
            Spacer(minLength: 4)
            if streak > 0 {
                HStack(spacing: 3) {
                    Image(systemName: "flame.fill").font(.system(size: 13, weight: .bold))
                    Text("\(streak)").font(Brand.number(16))
                }
                .foregroundColor(Palette.gold)
            }
        }
    }

    @ViewBuilder private var statusLine: some View {
        if done {
            HStack(spacing: 5) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 15, weight: .bold)).foregroundColor(Palette.solved)
                Text(status).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.9)).lineLimit(1).minimumScaleFactor(0.65)
            }
        } else {
            HStack(spacing: 5) {
                Image(systemName: "play.fill").font(.system(size: 11, weight: .bold))
                Text(status).font(.system(size: 12, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.65)
            }
            .foregroundColor(Palette.ink)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Palette.gold)
                            .shadow(color: Palette.night.opacity(0.6), radius: 0, x: 2, y: 2))
        }
    }
}

/// A chess position drawn as the game draws it: its square colors, the last move in gold, the board's pieces
struct BoardView: View {
    let board: DailyBoard
    var done = false
    var crop = 8   // squares across: under 8, a close-up around the board's focus square
    private static let light = Color(red: 0xec / 255, green: 0xee / 255, blue: 0xd8 / 255)
    private static let dark = Color(red: 0x7c / 255, green: 0x9d / 255, blue: 0x70 / 255)
    private static let last = Color(red: 0xf4 / 255, green: 0xcd / 255, blue: 0x46 / 255).opacity(0.58)
    private static let files = Array("abcdefgh")

    var body: some View {
        GeometryReader { g in
            let n = min(max(crop, 1), 8)
            let side = min(g.size.width, g.size.height), frame = max(3, side * 0.03), cell = (side - frame * 2) / CGFloat(n)
            let rows = board.squares, flip = board.turn == "b"
            // the window's first drawn row and column: the focus square in the middle (with an even size, the half
            // toward the board's middle), kept on the board
            let fs = board.focusSquare, fr = flip ? 7 - fs.row : fs.row, fc = flip ? 7 - fs.file : fs.file
            let r0 = Self.start(fr, n), c0 = Self.start(fc, n)
            ZStack {
                RoundedRectangle(cornerRadius: side * 0.06, style: .continuous).fill(Palette.coral)
                VStack(spacing: 0) {
                    ForEach(0..<n, id: \.self) { r in
                        HStack(spacing: 0) {
                            ForEach(0..<n, id: \.self) { c in
                                let row = flip ? 7 - (r0 + r) : r0 + r, file = flip ? 7 - (c0 + c) : c0 + c
                                let name = String(Self.files[file]) + String(8 - row)
                                ZStack {
                                    ((file + 8 - row) % 2 == 1 ? Self.dark : Self.light)
                                    if name == board.from || name == board.to { Self.last }
                                    if let piece = rows.indices.contains(row) ? rows[row][file] : nil {
                                        Image("piece-" + piece).resizable().scaledToFit().padding(cell * 0.04)
                                    }
                                }
                                .frame(width: cell, height: cell)
                            }
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: side * 0.035, style: .continuous))
                .environment(\.layoutDirection, .leftToRight)   // a chess board reads a to h in every language, as in the game
                .padding(frame)
                if done {
                    RoundedRectangle(cornerRadius: side * 0.06, style: .continuous).fill(Palette.night.opacity(0.45))
                    Image(systemName: "checkmark.circle.fill").font(.system(size: side * 0.28, weight: .bold))
                        .foregroundStyle(.white, Palette.solved)
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(board.toPlay). \(board.goal).")
    }

    private static func start(_ at: Int, _ n: Int) -> Int {
        let before = n % 2 == 1 ? n / 2 : (at >= 4 ? n / 2 : n / 2 - 1)
        return min(max(at - before, 0), 8 - n)
    }
}

// MARK: Control Center

/// A Control Center (and Lock Screen, and Action button) control that opens today's puzzle
@available(iOSApplicationExtension 18.0, *)
struct DailyControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "KingWalkDailyControl") {
            ControlWidgetButton(action: OpenDailyIntent()) {
                Label("Daily puzzle", systemImage: "calendar")
            }
        }
        .displayName("Daily puzzle")
        .description("Opens today's puzzle.")
    }
}
