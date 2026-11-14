import StoreKit
import UIKit
import WebKit

/// Shows the game in a web view. The page is served from the app bundle (see BundleSchemeHandler), so it plays
/// offline. Links to the web open in Safari. The page talks to the app through window.webkit.messageHandlers.kingwalk.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let saves = SaveStore()
    private let startURL = URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let content = config.userContentController
        installScripts(content)
        content.add(WeakMessageHandler(self), name: "kingwalk")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsLinkPreview = false
        let background = UIColor(named: "LaunchBackground") ?? .systemBackground
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view = webView
    }

    /// The scripts that run as the page loads: the save (from the current items, so a reload never brings back an
    /// older copy), what the app offers, and app-like touches
    private func installScripts(_ content: WKUserContentController) {
        content.removeAllUserScripts()
        content.addUserScript(WKUserScript(source: saves.bootstrapScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // what the app offers the page, read by APP in index.html. platform is for the analytics event platform/<name>
        // (an iPad app on a Mac reports an iPad otherwise)
        let platform = ProcessInfo.processInfo.isiOSAppOnMac ? "mac" : UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        content.addUserScript(WKUserScript(source: "window.kingWalkApp={platform:'\(platform)',gameCenter:true,widget:true,reminders:true};",
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // feel like an app: no pinch zoom, no text selection or long-press callouts (except in the save code box)
        content.addUserScript(WKUserScript(source: """
            (function(){var m=document.querySelector('meta[name=viewport]');if(m)m.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
            var s=document.createElement('style');s.textContent='body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}textarea{-webkit-user-select:text;user-select:text}';document.head.appendChild(s);})();
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        applyTextSize()
        NotificationCenter.default.addObserver(self, selector: #selector(textSizeChanged),
                                               name: UIContentSizeCategory.didChangeNotification, object: nil)
        webView.load(URLRequest(url: startURL))
        GameCenter.shared.presenter = self
        GameCenter.shared.signIn()
        NotificationCenter.default.addObserver(self, selector: #selector(openRequested), name: Launch.notification, object: nil)
        // another device's progress: when iCloud changes, and when the player comes back to the app
        saves.onCloudSave = { [weak self] save in self?.sendCloudSave(save) }
        NotificationCenter.default.addObserver(self, selector: #selector(cameBack), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func cameBack() { saves.offerCloud() }

    /// the iCloud copy, for the page to keep if it has more progress (kingWalkCloud in index.html)
    private func sendCloudSave(_ save: String) {
        guard pageReady, let literal = SaveStore.jsonLiteral([save]) else { return }
        webView.evaluateJavaScript("window.kingWalkCloud&&kingWalkCloud(\(literal)[0])")
    }

    // MARK: Opening a part of the game (Launch, in Shared/Progress.swift)

    private var pageReady = false

    /// pass a request on to the page once it has started (it posts "ready"); until then it waits in Launch.pending
    @objc private func openRequested() {
        guard pageReady, let what = Launch.pending else { return }
        Launch.pending = nil
        let safe = what.filter { $0.isLetter }   // "daily"
        webView.evaluateJavaScript("window.kingWalkOpen&&kingWalkOpen('\(safe)')")
    }

    // MARK: Larger text

    /// The page follows the text size in Settings → Accessibility → Display & Text Size → Larger Text: the whole page
    /// is zoomed, the way a browser zooms, so the layout reflows around bigger text (the page has layouts down to
    /// 195 CSS pixels wide, which is a 390-point iPhone at 2x).
    private static let textScale: [UIContentSizeCategory: CGFloat] = [
        .extraSmall: 0.85, .small: 0.9, .medium: 0.95, .large: 1, .extraLarge: 1.1, .extraExtraLarge: 1.2,
        .extraExtraExtraLarge: 1.3, .accessibilityMedium: 1.45, .accessibilityLarge: 1.6, .accessibilityExtraLarge: 1.75,
        .accessibilityExtraExtraLarge: 1.9, .accessibilityExtraExtraExtraLarge: 2,
    ]

    private func applyTextSize() {
        webView.pageZoom = Self.textScale[UIApplication.shared.preferredContentSizeCategory] ?? 1
    }

    @objc private func textSizeChanged() { applyTextSize() }

    // MARK: iPhone Duo fold

    #if KINGWALK_SDK_27_1   // set by the build when Xcode 27.1 or later is used (see .github/workflows/ios.yml)
    // Half open, the fold divides the inner screen. Tell the page where it is, so it can lay out each half on its own
    // (window.kingWalkFold in index.html): held like a book, the board on one page and progress on the other; propped
    // up like a laptop, the board on the flat half and progress on the upright half. Coordinates are the web view's
    // points, which are the page's CSS pixels.
    private var lastFold = ""

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        sendFold()
    }

    private func sendFold(force: Bool = false) {
        let js: String
        var fold: CGRect?
        if #available(iOS 27.1, *) { fold = view.reservedRegions(kind: .division).first?.frame }   // the app still runs on iOS 16
        if let f = fold {
            js = String(format: "window.kingWalkFold&&kingWalkFold({x:%.1f,y:%.1f,w:%.1f,h:%.1f})", f.minX, f.minY, f.width, f.height)
        } else {
            js = "window.kingWalkFold&&kingWalkFold(null)"
        }
        guard force || js != lastFold else { return }
        lastFold = js
        webView.evaluateJavaScript(js)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        sendFold(force: true)
    }
    #endif

    // MARK: Messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return }
        switch op {
        case "set":
            if let key = body["key"] as? String, let value = body["value"] as? String { saves.set(key, value) }
        case "remove":
            if let key = body["key"] as? String { saves.remove(key) }
        case "clear":
            saves.clear()
        case "copy":
            if let text = body["text"] as? String { UIPasteboard.general.string = text }
        case "haptic":
            if let kind = body["kind"] as? String { Haptics.play(kind) }
        case "share":
            // the daily puzzle's result also comes as a picture (a PNG data URL), shared with the text
            var image: UIImage?
            if let url = body["image"] as? String, let comma = url.firstIndex(of: ","),
               let data = Data(base64Encoded: String(url[url.index(after: comma)...])) { image = UIImage(data: data) }
            if let text = body["text"] as? String { share(text, image: image) }
        case "review":
            // The page decides when (after a clean solve, once the player has solved 20); iOS decides whether to show it
            if let scene = view.window?.windowScene { AppStore.requestReview(in: scene) }
        case "score":
            if let board = body["board"] as? String, let value = body["value"] as? Int { GameCenter.shared.submit(board: board, value: value) }
        case "achieve":
            if let id = body["id"] as? String { GameCenter.shared.achieve(id) }
        case "gamecenter":
            GameCenter.shared.showDashboard()
        case "ready":
            pageReady = true
            openRequested()
            saves.offerCloud()          // iCloud may have changed while the page loaded
        case "reminders":
            let hour = body["hour"] as? Int ?? -1
            Reminders.schedule(hour: hour, items: body["items"] as? [[String: Any]] ?? []) { [weak self] allowed in
                self?.webView.evaluateJavaScript("window.kingWalkReminders&&kingWalkReminders(\(allowed))")
            }
        case "widget":
            if let data = body["data"] as? [String: Any] { WidgetData.save(data) }
        default:
            break
        }
    }

    /// The iOS share sheet for "Share"
    private func share(_ text: String, image: UIImage? = nil) {
        let sheet = UIActivityViewController(activityItems: image.map { [$0, text] } ?? [text], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {   // iPad: anchored near the top right, where the menu is
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.maxX - 40, y: view.safeAreaInsets.top + 40, width: 1, height: 1)
            popover.permittedArrowDirections = .up
        }
        (presentedViewController ?? self).present(sheet, animated: true)
    }

    // MARK: Links

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        if scheme == BundleSchemeHandler.scheme || scheme == "about" { return decisionHandler(.allow) }
        // Anything else (Lichess puzzle pages, the policy pages, credits) opens in Safari
        if action.targetFrame?.isMainFrame ?? true { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    // target=_blank links and window.open: open in Safari instead of a new web view
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // If iOS stops the web content process (memory pressure), bring the game back
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        pageReady = false
        installScripts(webView.configuration.userContentController)          // today's save, not the one from launch
        webView.load(URLRequest(url: startURL))
    }

    // MARK: JavaScript dialogs (alert, confirm and prompt do nothing in a web view unless the app shows them)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: ""), style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: NSLocalizedString("Cancel", comment: ""), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: ""), style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: NSLocalizedString("Cancel", comment: ""), style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: ""), style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }
}

/// The user content controller keeps a strong reference to its handlers; this breaks the cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
