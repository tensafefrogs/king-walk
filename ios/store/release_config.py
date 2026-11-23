#!/usr/bin/env python3
"""ios/release.json and ios/beta.json, read and checked in one place.

release.py reads them only through load(), and testing/parity.js runs this file on every push, so a file App Store
Connect would turn down fails the Test workflow in seconds rather than the release after a 10-minute build. Three
release runs failed that way (emoji in the notes: 🧊 twice, ♟️ once). Release notes also never name other apps (the
owner). Every problem is named with its fix.

  python3 ios/store/release_config.py          checks both files (exit 1 and the problems if any)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
NOTES_MAX = 4000          # App Store Connect's limit for What's New and What to Test
# other apps and sites, never named in release notes (the owner): King Walk's notes speak for themselves
OTHER_APPS = ('Duolingo', 'Wordle', 'Lichess', 'Chess.com', 'Chessable', 'ChessKid', 'Chesscom')


class ConfigError(Exception):
    pass


def refused(c):
    """a character App Store Connect turns down in release notes (INVALID_TEXT): emoji beyond the Basic Multilingual
    Plane (🧊, 🔥), the older symbols inside it drawn as emoji (♟️, ⏱, ✅, U+2600-27BF) and the emoji variation selector.
    Not the zero-width joiner (U+200D): Bengali and other Indian scripts need it to join letters, and the emoji it joins
    are refused on their own (the filter this replaced dropped it, splitting Bengali letters in 1.0.3's What's New)"""
    o = ord(c)
    return o > 0xFFFF or 0x2600 <= o <= 0x27BF or 0x2B00 <= o <= 0x2BFF or o in (0xFE0F, 0x231A, 0x231B, 0x23F0, 0x23F1, 0x23F2, 0x23F3)


def _notes(where, text, problems):
    if not isinstance(text, str):
        problems.append(f'{where}: should be text'); return
    named = [a for a in OTHER_APPS if a.lower() in text.lower()]
    if named:
        problems.append(f'{where}: names {", ".join(named)}; release notes never mention other apps or sites (describe the change itself)')
    bad = sorted({c for c in text if refused(c)})
    if bad:
        problems.append(f'{where}: ' + ', '.join(f"'{c}' (U+{ord(c):04X})" for c in bad)
                        + ' refused by App Store Connect as INVALID_TEXT; write the notes without emoji')
    if len(text) > NOTES_MAX:
        problems.append(f'{where}: {len(text)} characters; App Store Connect takes at most {NOTES_MAX}')


def _keys(where, d, allowed, problems):
    if not isinstance(d, dict):
        problems.append(f'{where}: should be an object'); return False
    for k in d:
        if k not in allowed:
            problems.append(f'{where}.{k}: not a setting release.py knows ({", ".join(sorted(allowed))}); '
                            'see ios/README.md, "Releasing from the repo"')
    return True


def _bool(where, d, keys, problems):
    for k in keys:
        if k in d and not isinstance(d[k], bool):
            problems.append(f'{where}.{k}: should be true or false')


def _testflight(where, tf, problems):
    if not _keys(where, tf, {'groups', 'whats_new', 'keep_current_and_next'}, problems): return
    for i, g in enumerate(tf.get('groups', [])):
        if isinstance(g, dict):
            _keys(f'{where}.groups[{i}]', g, {'name', 'public_link'}, problems)
            if not isinstance(g.get('name'), str): problems.append(f'{where}.groups[{i}]: needs a "name"')
        elif not isinstance(g, str):
            problems.append(f'{where}.groups[{i}]: a group\'s name, or {{"name": ..., "public_link": true}}')
    _notes(f'{where}.whats_new', tf.get('whats_new', ''), problems)
    _bool(where, tf, ['keep_current_and_next'], problems)


def store_locales():
    """the App Store languages: English and each translated listing (ios/store/l10n)"""
    out = ['en-US']
    for f in sorted(os.listdir(os.path.join(HERE, 'l10n'))):
        if f.endswith('.json'): out.append(json.load(open(os.path.join(HERE, 'l10n', f)))['locale'])
    return out


def notes_for(wn, lang):
    """What's New for one App Store language: its own, else its language's without the region (never Simplified
    Chinese for Traditional), else English's"""
    wn = wn if isinstance(wn, dict) else ({'en-US': wn} if wn else {})
    return wn.get(lang) or (lang != 'zh-Hant' and wn.get(lang.split('-')[0])) or wn.get('en-US', '')


def _app_store(where, st, problems):
    if not _keys(where, st, {'submit', 'release', 'replace_in_review', 'listing', 'whats_new'}, problems): return
    _bool(where, st, ['submit', 'replace_in_review', 'listing'], problems)
    if st.get('release', 'manual') not in ('after_approval', 'manual'):
        problems.append(f'{where}.release: "after_approval" or "manual"')
    wn = st.get('whats_new', '')
    if isinstance(wn, dict):
        for lang, text in wn.items(): _notes(f'{where}.whats_new.{lang}', text, problems)
        if st.get('submit') and wn:
            empty = [l for l in store_locales() if not notes_for(wn, l).strip()]
            if empty: problems.append(f'{where}.whats_new: no text for {", ".join(empty)} (give "en-US" one, which the others fall back to)')
    else:
        _notes(f'{where}.whats_new', wn, problems)


def check(cfg, kind):
    """the problems with a release.json ("release") or beta.json ("beta"), as sentences; empty when it's fine"""
    problems = []
    if not isinstance(cfg, dict): return [f'{kind}.json: should be an object']
    if not re.fullmatch(r'\d+\.\d+(\.\d+)?', str(cfg.get('version', ''))):
        problems.append(f'version: "{cfg.get("version")}" should look like 1.0.5')
    if kind == 'beta':
        _keys('beta.json', cfg, {'version', 'xcode27', 'testflight', 'note'}, problems)
        if not isinstance(cfg.get('testflight'), dict): problems.append('testflight: beta.json needs its TestFlight groups')
    else:
        # a renamed "app_store" (app_store_next, app_store_held...) holds a version back: kept, not read
        known = {'version', 'xcode27', 'build', 'testflight', 'app_store', 'release_now', 'note'}
        _keys('release.json', {k: v for k, v in cfg.items() if not k.startswith('app_store_')}, known, problems)
        _bool('release.json', cfg, ['xcode27', 'build', 'release_now'], problems)
        if cfg.get('app_store') is not None: _app_store('app_store', cfg['app_store'], problems)
    _bool(f'{kind}.json', cfg, ['xcode27'], problems)
    if cfg.get('testflight') is not None: _testflight('testflight', cfg['testflight'], problems)
    return problems


def load(kind='release'):
    """ios/release.json (or beta.json), checked: raises ConfigError naming every problem"""
    path = os.path.join(ROOT, 'ios', f'{kind}.json')
    try:
        cfg = json.load(open(path))
    except ValueError as e:
        raise ConfigError(f'ios/{kind}.json is not valid JSON: {e}')
    problems = check(cfg, kind)
    if problems: raise ConfigError(f'ios/{kind}.json:\n  ' + '\n  '.join(problems))
    return cfg


if __name__ == '__main__':
    bad = False
    for kind in ('release', 'beta'):
        if not os.path.exists(os.path.join(ROOT, 'ios', f'{kind}.json')): continue
        try: load(kind)
        except ConfigError as e: print(e); bad = True
    sys.exit(1 if bad else 0)
