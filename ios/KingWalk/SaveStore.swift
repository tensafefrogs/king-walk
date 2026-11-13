import Foundation

/// Keeps a copy of the page's localStorage in UserDefaults, and in iCloud so progress carries over between the
/// player's devices. iOS can clear a web view's storage when the device is low on space; the copy survives that.
/// On launch the newer of the two copies is written back into localStorage before the game's script runs.
final class SaveStore {
    private let itemsKey = "web.localStorage"
    private let timeKey = "web.localStorage.savedAt"
    private let cloud = NSUbiquitousKeyValueStore.default
    private var items: [String: String]
    /// The iCloud copy is newer than this device's: restore it even though this device has a save of its own
    private let cloudIsNewer: Bool

    init() {
        let defaults = UserDefaults.standard
        let local = defaults.dictionary(forKey: itemsKey) as? [String: String] ?? [:]
        let localAt = defaults.double(forKey: timeKey)
        cloud.synchronize()
        let remote = cloud.dictionary(forKey: itemsKey) as? [String: String] ?? [:]
        let remoteAt = cloud.double(forKey: timeKey)
        // another device saved more recently (more than a few seconds, to ignore this device's own echo)
        if !remote.isEmpty && remoteAt > localAt + 5 {
            items = remote
            cloudIsNewer = !local.isEmpty
            defaults.set(remote, forKey: itemsKey)
            defaults.set(remoteAt, forKey: timeKey)
        } else {
            items = local
            cloudIsNewer = false
        }
    }

    func set(_ key: String, _ value: String) { items[key] = value; persist() }
    func remove(_ key: String) { items.removeValue(forKey: key); persist() }
    func clear() { items.removeAll(); persist() }

    private func persist() {
        let now = Date().timeIntervalSince1970
        UserDefaults.standard.set(items, forKey: itemsKey)
        UserDefaults.standard.set(now, forKey: timeKey)
        // iCloud key-value storage holds up to 1 MB; a save is far smaller. iOS sends it when it's ready.
        cloud.set(items, forKey: itemsKey)
        cloud.set(now, forKey: timeKey)
    }

    /// Runs at document start: restores saved items if storage was emptied (or iCloud has newer progress from
    /// another device), then reports every localStorage change to the app.
    /// Also routes clipboard writes through the app, since the page's origin may not get clipboard access.
    func bootstrapScript() -> String {
        let data = (try? JSONSerialization.data(withJSONObject: items)) ?? Data("{}".utf8)
        let json = String(data: data, encoding: .utf8) ?? "{}"
        return """
        (function(){
          var post=function(m){try{window.webkit.messageHandlers.kingwalk.postMessage(m);}catch(e){}};
          var P=Storage.prototype,set=P.setItem,rem=P.removeItem,clr=P.clear;
          // Restore only when iOS has emptied storage (or iCloud is newer), and only once per launch: this snapshot is
          // from launch, so after the page reloads it would otherwise bring old progress back.
          try{if(!sessionStorage.getItem('kingwalk.restored')){set.call(sessionStorage,'kingwalk.restored','1');
            if(localStorage.length===0||\(cloudIsNewer ? "true" : "false")){var saved=\(json);
              if(localStorage.length)clr.call(localStorage);for(var k in saved)set.call(localStorage,k,saved[k]);}}}catch(e){}
          P.setItem=function(k,v){set.call(this,k,v);if(this===window.localStorage)post({op:'set',key:String(k),value:String(v)});};
          P.removeItem=function(k){rem.call(this,k);if(this===window.localStorage)post({op:'remove',key:String(k)});};
          P.clear=function(){clr.call(this);if(this===window.localStorage)post({op:'clear'});};
          try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(t){post({op:'copy',text:String(t)});return Promise.resolve();}}});}catch(e){}
        })();
        """
    }
}
