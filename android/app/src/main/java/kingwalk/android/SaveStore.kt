package kingwalk.android

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject

/**
 * Keeps a copy of the page's localStorage in SharedPreferences (save.xml). Android's Google backup takes that file
 * (res/xml/data_extraction_rules.xml), so a new phone, or the app installed again, starts with the player's progress:
 * the page's storage is rebuilt from the copy when it's empty. The iOS app does the same with iCloud
 * (ios/KingWalk/SaveStore.swift); there, the copy also moves between devices while they're in use.
 */
class SaveStore(context: Context) {
    private val prefs = context.getSharedPreferences("save", Context.MODE_PRIVATE)
    private val items: MutableMap<String, String> = run {
        val json = prefs.getString(ITEMS, null)
        val map = mutableMapOf<String, String>()
        runCatching { JSONObject(json ?: "{}").let { o -> o.keys().forEach { k -> map[k] = o.getString(k) } } }
        map
    }

    @Synchronized fun set(key: String, value: String) { items[key] = value; persist() }
    @Synchronized fun remove(key: String) { items.remove(key); persist() }
    @Synchronized fun clear() { items.clear(); persist() }

    /** the page's save, as it wrote it (for the widget, later) */
    @Synchronized fun save(): String? = items[SAVE_KEY]

    private fun persist() {
        prefs.edit { putString(ITEMS, JSONObject(items as Map<*, *>).toString()); putLong(SAVED_AT, System.currentTimeMillis()) }
    }

    /** Runs at document start: restores the saved items if the page's storage is empty (a new install from a backup),
     *  then reports every localStorage change to the app. Also routes clipboard writes through the app. */
    @Synchronized fun bootstrapScript(): String {
        val saved = JSONObject(items as Map<*, *>).toString()
        return """
            (function(){
              var post=function(m){try{window.KingWalkAndroid.postMessage(JSON.stringify(m));}catch(e){}};
              var P=Storage.prototype,set=P.setItem,rem=P.removeItem,clr=P.clear;
              try{if(localStorage.length===0){var saved=$saved;for(var k in saved)set.call(localStorage,k,saved[k]);}}catch(e){}
              P.setItem=function(k,v){set.call(this,k,v);if(this===window.localStorage)post({op:'set',key:String(k),value:String(v)});};
              P.removeItem=function(k){rem.call(this,k);if(this===window.localStorage)post({op:'remove',key:String(k)});};
              P.clear=function(){clr.call(this);if(this===window.localStorage)post({op:'clear'});};
              try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(t){post({op:'copy',text:String(t)});return Promise.resolve();}}});}catch(e){}
            })();
        """.trimIndent()
    }

    companion object {
        /** the page's save, in localStorage */
        const val SAVE_KEY = "chess-climb-v1"
        private const val ITEMS = "web.localStorage"
        private const val SAVED_AT = "web.localStorage.savedAt"
    }
}
