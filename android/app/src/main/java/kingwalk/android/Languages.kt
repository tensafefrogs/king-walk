package kingwalk.android

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList

/**
 * The game's language as the phone's own per-app language (Android 13 and later: Settings, Apps, King Walk, Language,
 * listing the languages in res/xml/locales_config.xml). The page's language picker sets it (op "lang"), and the page
 * reads it at start (kingWalkApp.lang), so the two always agree. Changing it opens the app again in the new language.
 * Before Android 13 the page keeps the choice itself, as on the website.
 */
object Languages {
    /** the page's tags that the phone names differently: the page's "es" is Latin American Spanish, "pt" Brazil's,
     *  "zh" Simplified Chinese */
    private val TO_PHONE = mapOf("es" to "es-419", "pt" to "pt-BR", "zh" to "zh-Hans")

    val supported get() = Build.VERSION.SDK_INT >= 33

    /** the language picked for the app ("" for the phone's own), or null where the phone has no per-app language */
    fun current(context: Context): String? {
        if (!supported) return null
        val locales = context.getSystemService(LocaleManager::class.java)?.applicationLocales ?: return null
        return if (locales.isEmpty) "" else locales[0].toLanguageTag()
    }

    /** the page's choice: a tag from its list (LANG_NAMES in index.html), or "" for the phone's language */
    fun set(context: Context, pageTag: String) {
        if (!supported) return
        val tag = pageTag.filter { it.isLetterOrDigit() || it == '-' }
        val list = if (tag.isEmpty()) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(TO_PHONE[tag] ?: tag)
        context.getSystemService(LocaleManager::class.java)?.applicationLocales = list
    }
}
