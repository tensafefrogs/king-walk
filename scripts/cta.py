#!/usr/bin/env python3
"""cta.js: the "Play" card at the top of the support, privacy and terms pages, in the visitor's language.

Search engines send some people straight to these pages (a search for "king walk app" can land on the terms), so each
starts with a card that opens the game: in English as written in the page, and swapped by cta.js for the visitor's
language when the game has it, picked as the game picks it (the language chosen in Settings, else the device's), with
the link going to that language's page (kingwalk.app/de/). Its words already exist: the name and subtitle from that
language's App Store listing (ios/store/l10n), and the game's own "Play" button (lang/<tag>.js).

usage: python3 scripts/cta.py      (run after adding a language or changing a listing's name or subtitle; unit.js
                                    checks cta.js has every language)
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from langpages import STORE, VARIANTS, RTL   # the same listing for each language as its page uses


def table(tag):
    f = os.path.join(ROOT, 'lang', tag + '.js')
    if not os.path.exists(f): return {}
    s = open(f, encoding='utf-8').read()
    return json.loads(s[s.index('{', s.index('] = ')):s.rindex('}') + 1])


def listing(tag):
    f = os.path.join(ROOT, 'ios', 'store', 'l10n', STORE.get(tag, tag) + '.json')
    return json.load(open(f, encoding='utf-8'))['listing'] if os.path.exists(f) else None


def main():
    page = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    langs = json.loads(re.search(r'var LANGS = (\[[^\]]+\])', page).group(1))
    out = {}
    for tag in [t for t in langs if t != 'en'] + VARIANTS:
        l = listing(tag)
        play = table(tag).get('Play') or table(tag.split('-')[0]).get('Play')
        if not l or not play: sys.exit(f'cta.py: no listing or no "Play" for {tag}')
        out[tag] = [l['name'], l.get('subtitle', ''), play]
    js = ('/* The "Play" card on the support, privacy and terms pages, in the visitor\'s language (made by scripts/cta.py:\n'
          '   run it again after adding a language). Each entry: the App Store name, subtitle and the game\'s Play button. */\n'
          '(function () {\n'
          '  var C = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
          '  var RTL = ' + json.dumps(sorted(RTL)) + ', SAME = { iw: "he", no: "nb", nn: "nb", "in": "id" };\n'
          '  var VARIANTS = { "zh-Hant": /^zh-(hant|tw|hk|mo)\\b/i, "pt-PT": /^pt-(pt|ao|mz|cv|gw|st|tl)\\b/i, "es-ES": /^es-es\\b/i };\n'
          '  var base = function (t) { var c = String(t).toLowerCase().split(/[-_]/)[0]; return SAME[c] || c; };\n'
          '  var has = function (b) { return b === "en" || !!C[b]; };\n'
          '  var mine = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];\n'
          '  var chosen = ""; try { chosen = localStorage.getItem("kw-lang") || ""; } catch (e) {}\n'
          '  /* as the game picks: the language chosen in its Settings, else the first of the device\'s it has */\n'
          '  var lang = chosen && has(base(chosen)) ? base(chosen) : "", tag = chosen;\n'
          '  if (!lang) for (var i = 0; i < mine.length; i++) if (has(base(mine[i]))) { lang = base(mine[i]); tag = mine[i]; break; }\n'
          '  if (!lang || lang === "en") return;\n'
          '  for (var v in VARIANTS) if (v.slice(0, 2) === lang && (VARIANTS[v].test(tag) || String(tag).toLowerCase() === v.toLowerCase())) lang = v;\n'
          '  var c = C[lang], a = document.getElementById("play"); if (!c || !a) return;\n'
          '  a.href = "./" + lang + "/"; a.lang = lang; if (RTL.indexOf(lang.split("-")[0]) >= 0) a.dir = "rtl";\n'
          '  a.querySelector("b").textContent = c[0]; a.querySelector("small").textContent = c[1]; a.querySelector(".go").textContent = c[2];\n'
          '})();\n')
    open(os.path.join(ROOT, 'cta.js'), 'w', encoding='utf-8').write(js)
    print(f'cta.js: {len(out) + 1} languages')


if __name__ == '__main__':
    main()
