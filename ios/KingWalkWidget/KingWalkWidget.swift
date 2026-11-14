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
}

struct ProgressWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ProgressEntry

    var body: some View {
        content
            .widgetURL(entry.progress.map { $0.dailySolved(on: entry.date) } == false ? Daily.url : nil)
            .widgetBackground(family.isAccessory ? AnyView(Color.clear) : AnyView(LinearGradient(colors: [Palette.deepTeal, Palette.ink], startPoint: .top, endPoint: .bottom)))
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
            if streak > 0 { Text("\(streak)").font(.system(size: 13, weight: .bold, design: .rounded)) }
            if !done { Circle().fill(Palette.coral).frame(width: 6, height: 6) }
        }
        .foregroundColor(Palette.gold)
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
            Text("\(p.rating)").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundColor(Palette.cream)
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
            Text("\(value)").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundColor(Palette.cream)
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
                Text("King Walk").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundColor(Palette.cream)
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
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
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
            default:
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(label.uppercased()).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.75))
                        Spacer()
                        if streak > 0 {
                            Label("\(streak)", systemImage: "flame.fill").font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(Palette.gold)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("#\(n)").font(.system(size: 44, weight: .bold, design: .rounded)).foregroundColor(Palette.cream).minimumScaleFactor(0.6).lineLimit(1)
                    Text(entry.date, format: .dateTime.weekday(.wide)).font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundColor(Palette.cream.opacity(0.8))
                    Spacer(minLength: 4)
                    HStack(spacing: 5) {
                        Image(systemName: done ? "checkmark.circle.fill" : "play.circle.fill").font(.system(size: 15, weight: .bold))
                        Text(status).font(.system(size: 12, weight: .bold, design: .rounded)).lineLimit(2).minimumScaleFactor(0.8)
                    }
                    .foregroundColor(done ? Palette.mint : Palette.gold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .widgetURL(Daily.url)
        .widgetBackground(family.isAccessory ? AnyView(Color.clear)
                          : AnyView(LinearGradient(colors: [done ? Palette.deepTeal : Color(red: 0x1c / 255, green: 0x78 / 255, blue: 0x68 / 255), Palette.ink], startPoint: .top, endPoint: .bottom)))
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
