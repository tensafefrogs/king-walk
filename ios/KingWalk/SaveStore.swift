import Foundation

/// Keeps a copy of the page's localStorage in UserDefaults, and in iCloud so progress carries over between the
/// player's devices. iOS can clear a web view's storage when the device is low on space; the copy survives that.
///
/// Which copy wins when two devices disagree is decided by progress, not by when it was written: every launch
/// saves, so the device opened last would always look newest. The page makes that choice (betterSave in index.html):
/// the app hands it the iCloud copy at launch (window.kingWalkCloudSave), whenever iCloud changes or the app comes
/// back (onCloudSave → kingWalkCloud), and instead of overwriting an iCloud copy that has more progress.
/// SaveRank (SaveRank.swift) is the same rule, so the app knows when not to overwrite.
final class SaveStore {
    /// the page's save, in localStorage
    static let saveKey = "chess-climb-v1"
    private let itemsKey = "web.localStorage"
    private let timeKey = "web.localStorage.savedAt"
    private let cloud = NSUbiquitousKeyValueStore.default
    private(set) var items: [String: String]
    /// The iCloud copy has a save the page should look at (called on the main thread)
    var onCloudSave: ((String) -> Void)?

    init() {
        let defaults = UserDefaults.standard
        cloud.synchronize()
        let local = defaults.dictionary(forKey: itemsKey) as? [String: String] ?? [:]
        // a new install (or a device whose copy was lost) starts from the iCloud copy
        items = local.isEmpty ? (cloud.dictionary(forKey: itemsKey) as? [String: String] ?? [:]) : local
        NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
                                               object: cloud, queue: .main) { [weak self] _ in self?.offerCloud() }
    }

    /// the save in iCloud, as the page wrote it
    var cloudSave: String? { (cloud.dictionary(forKey: itemsKey) as? [String: String])?[Self.saveKey] }

    /// Hand the iCloud copy to the page when it differs from this device's (the page keeps the one with more progress)
    func offerCloud() {
        cloud.synchronize()
        if let remote = cloudSave, remote != items[Self.saveKey] { onCloudSave?(remote) }
    }

    func set(_ key: String, _ value: String) { items[key] = value; persist() }
    func remove(_ key: String) { items.removeValue(forKey: key); persist() }
    func clear() { items.removeAll(); persist() }

    private func persist() {
        let now = Date().timeIntervalSince1970
        UserDefaults.standard.set(items, forKey: itemsKey)
        UserDefaults.standard.set(now, forKey: timeKey)
        // iCloud has more progress (another device played since this one last heard): keep it, and give it to the page
        if let remote = cloudSave, let mine = items[Self.saveKey], SaveRank.better(remote, than: mine) {
            onCloudSave?(remote)
            return
        }
        // iCloud key-value storage holds up to 1 MB; a save is far smaller. iOS sends it when it's ready.
        cloud.set(items, forKey: itemsKey)
        cloud.set(now, forKey: timeKey)
    }

    /// Runs at document start: restores saved items if iOS emptied storage, gives the page the iCloud copy to compare,
    /// then reports every localStorage change to the app. Built from the current items each time the page loads.
    /// Also routes clipboard writes through the app, since the page's origin may not get clipboard access.
    func bootstrapScript() -> String {
        let json = Self.jsonLiteral(items) ?? "{}"
        let cloudLiteral = cloudSave.flatMap { Self.jsonLiteral([$0]) }.map { "\($0)[0]" } ?? "null"
        return """
        (function(){
          var post=function(m){try{window.webkit.messageHandlers.kingwalk.postMessage(m);}catch(e){}};
          var P=Storage.prototype,set=P.setItem,rem=P.removeItem,clr=P.clear;
          try{if(localStorage.length===0){var saved=\(json);for(var k in saved)set.call(localStorage,k,saved[k]);}}catch(e){}
          window.kingWalkCloudSave=\(cloudLiteral);
          P.setItem=function(k,v){set.call(this,k,v);if(this===window.localStorage)post({op:'set',key:String(k),value:String(v)});};
          P.removeItem=function(k){rem.call(this,k);if(this===window.localStorage)post({op:'remove',key:String(k)});};
          P.clear=function(){clr.call(this);if(this===window.localStorage)post({op:'clear'});};
          try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(t){post({op:'copy',text:String(t)});return Promise.resolve();}}});}catch(e){}
        })();
        """
    }

    static func jsonLiteral(_ object: Any) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
