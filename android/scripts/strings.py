#!/usr/bin/env python3
"""The Android app's own few words (res/values*/strings.xml), taken from the iOS app's translations
(ios/KingWalk/<lang>.lproj/*.strings and the widget's, ios/KingWalkWidget/<lang>.lproj) so both apps say the
same: the reminders' channel name in the phone's settings ("Today's puzzle"), and the home screen widgets'
names and descriptions in the widget picker and the words they show before the game has sent its own.
The game's own text comes from lang/<tag>.js, as on the website.

usage: python3 android/scripts/strings.py      (run after adding a language to the iOS app)
"""
import os, re
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
IOS = os.path.join(ROOT, 'ios', 'KingWalk')
WIDGET = os.path.join(ROOT, 'ios', 'KingWalkWidget')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
# Apple's language folders, as Android's resource folders
QUAL = {'en': '', 'pt-BR': 'pt', 'pt-PT': 'pt-rPT', 'zh-Hans': 'zh', 'zh-Hant': 'b+zh+Hant', 'he': 'iw', 'id': 'in', 'nb': 'nb'}


def strings(lang):
    out = {}
    for d in (os.path.join(IOS, lang + '.lproj'), os.path.join(WIDGET, lang + '.lproj')):
        for f in sorted(os.listdir(d)):
            if f.endswith('.strings'):
                out.update(re.findall(r'^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)";', open(os.path.join(d, f), encoding='utf-8').read(), re.M))
    return out


# the Android name of each string, and its English (the key in the iOS .strings files)
NAMES = [
    ('channel_daily', "Today's puzzle"),
    ('widget_progress_description', 'Your rank and puzzle rating.'),
    ('widget_daily_name', 'Daily puzzle'),
    ('widget_daily_description', "Today's puzzle and your daily streak."),
    ('widget_empty', 'Solve a puzzle to see your rank here.'),
]


def android(s):          # Android's strings.xml escapes apostrophes and quotes
    return escape(s.replace('\\"', '"')).replace("'", "\\'").replace('"', '\\"')


for d in sorted(os.listdir(IOS)):
    if not d.endswith('.lproj'): continue
    lang = d[:-6]
    t = strings(lang)
    q = QUAL.get(lang, lang)
    out = os.path.join(RES, 'values' + ('-' + q if q else ''))
    os.makedirs(out, exist_ok=True)
    rows = []
    if not q: rows.append('    <string name="app_name" translatable="false">King Walk</string>')
    rows += [f'    <string name="{name}">{android(t[english])}</string>' for name, english in NAMES]
    open(os.path.join(out, 'strings.xml'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<!-- made by android/scripts/strings.py from the iOS app\'s translations -->\n<resources>\n' + '\n'.join(rows) + '\n</resources>\n')
print('strings.xml for', len([d for d in os.listdir(IOS) if d.endswith('.lproj')]), 'languages')
