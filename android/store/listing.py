#!/usr/bin/env python3
"""Uploads King Walk's Google Play store listing: the text in every language, the icon, the feature graphic and the phone
screenshots. GitHub runs it when they change on main (.github/workflows/play-listing.yml), as store.yml does for the App
Store, so the store matches the repo.

English is android/store/listing.json. The other languages come from the iOS app's translations (ios/store/l10n/<locale>.json):
its name, subtitle (Play's short description) and description, without the two lines about iPhone-only features (Game
Center challenges, Lock Screen and StandBy widgets), and with TalkBack for VoiceOver. A language whose description doesn't
have the same lines as the English one is left out and named, rather than guessed at.

  python3 android/store/listing.py --dry-run     what would be sent (no account needed)
  python3 android/store/listing.py               needs PLAY_SERVICE_ACCOUNT_JSON and ANDROID_APPLICATION_ID, as play.py

Only the store listing changes: no release, nothing sent for review beyond what Play Console does for listing edits.
"""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
IOS = os.path.join(ROOT, 'ios', 'store')
EN = json.load(open(os.path.join(HERE, 'listing.json')))
IOS_EN = json.load(open(os.path.join(IOS, 'listing.json')))['version']['description']
# the App Store's locale names as Google Play's. Not Odia (or-IN): Google Play has no Odia listing ("The requested language
# is not currently supported: or", November 2026); its players see the English one
PLAY = {'ar-SA': 'ar', 'bn-BD': 'bn-BD', 'ca': 'ca', 'cs': 'cs-CZ', 'da': 'da-DK', 'de-DE': 'de-DE', 'el': 'el-GR', 'es-ES': 'es-ES',
        'es-MX': 'es-419', 'fi': 'fi-FI', 'fr-FR': 'fr-FR', 'gu-IN': 'gu', 'he': 'iw-IL', 'hi': 'hi-IN', 'hr': 'hr', 'hu': 'hu-HU',
        'id': 'id', 'it': 'it-IT', 'ja': 'ja-JP', 'kn-IN': 'kn-IN', 'ko': 'ko-KR', 'ml-IN': 'ml-IN', 'mr-IN': 'mr-IN', 'ms': 'ms',
        'nl-NL': 'nl-NL', 'no': 'no-NO', 'pa-IN': 'pa', 'pl': 'pl-PL', 'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT', 'ro': 'ro',
        'ru': 'ru-RU', 'sk': 'sk', 'sl-SI': 'sl', 'sv': 'sv-SE', 'ta-IN': 'ta-IN', 'te-IN': 'te-IN', 'th': 'th', 'tr': 'tr-TR',
        'uk': 'uk', 'ur-PK': 'ur', 'vi': 'vi', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW'}
IPHONE_ONLY = ('Game Center', 'StandBy')          # English lines to leave out; the same lines go in each translation


def drop_lines(text):
    """the lines to keep, by position: the English description's lines, less the iPhone-only ones"""
    lines = IOS_EN.split('\n')
    return [i for i, l in enumerate(lines) if not any(w in l for w in IPHONE_ONLY)], len(lines)


def listings():
    out = {'en-US': {'title': EN['title'], 'shortDescription': EN['short_description'], 'fullDescription': EN['full_description']}}
    keep, n = drop_lines(IOS_EN)
    for f in sorted(glob.glob(os.path.join(IOS, 'l10n', '*.json'))):
        t = json.load(open(f)); loc = t['locale']; l = t.get('listing', {})
        if loc not in PLAY or not l.get('description'): continue
        lines = l['description'].split('\n')
        if len(lines) != n:
            print(f'{loc}: its description has {len(lines)} lines, the English one {n}: left out'); continue
        desc = '\n'.join(lines[i] for i in keep).replace('VoiceOver', 'TalkBack')
        out[PLAY[loc]] = {'title': l.get('name', EN['title'])[:30], 'shortDescription': (l.get('subtitle') or '')[:80], 'fullDescription': desc[:4000]}
    return out


def main():
    data = listings()
    shots = sorted(glob.glob(os.path.join(HERE, 'screenshots', 'android-*.png')))
    images = {'icon': [os.path.join(HERE, 'icon-512.png')], 'featureGraphic': [os.path.join(HERE, 'feature-1024x500.png')], 'phoneScreenshots': shots}
    if '--dry-run' in sys.argv:
        for lang, d in data.items(): print(lang, {k: len(v) for k, v in d.items()})
        for k, v in images.items(): print(k, [os.path.basename(x) for x in v])
        return
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    pkg = os.environ.get('ANDROID_APPLICATION_ID', '').strip()
    info = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '').strip()
    if not pkg or not info: sys.exit('::error::Needs ANDROID_APPLICATION_ID and PLAY_SERVICE_ACCOUNT_JSON (android/README.md)')
    s = AuthorizedSession(service_account.Credentials.from_service_account_info(json.loads(info), scopes=['https://www.googleapis.com/auth/androidpublisher']))
    api = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}'

    def ok(r, what, fatal=True):
        if r.status_code >= 300:
            msg = f'{what} failed ({r.status_code}): {r.text[:800]}'
            if fatal: sys.exit('::error::' + msg)
            print('::warning::' + msg); return None
        return r.json() if r.content else {}

    r = s.post(f'{api}/edits')
    if r.status_code in (403, 404):          # before the app is in Play Console, or before the service account is invited there
        print(f'::notice::Google Play doesn\'t know this app for this account yet ({r.status_code}): create the app in Play Console and invite '
              'the service account (android/README.md, Setting up Google Play). Nothing uploaded.')
        return
    edit = ok(r, 'Starting an edit')['id']
    for lang, d in data.items():
        if ok(s.put(f'{api}/edits/{edit}/listings/{lang}', json={'language': lang, **d}), f'The {lang} listing', fatal=lang == 'en-US') is not None:
            print('listing:', lang)
    for kind, files in images.items():          # English's pictures, which Play shows for every language without its own
        ok(s.delete(f'{api}/edits/{edit}/listings/en-US/{kind}'), f'Clearing {kind}')
        for f in files:
            with open(f, 'rb') as fh:
                ok(s.post(f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{pkg}/edits/{edit}/listings/en-US/{kind}',
                          params={'uploadType': 'media'}, data=fh, headers={'Content-Type': 'image/png'}), f'Uploading {os.path.basename(f)}')
        print('images:', kind, len(files))
    ok(s.post(f'{api}/edits/{edit}:commit'), 'Saving the listing')
    print('Google Play listing updated')


if __name__ == '__main__':
    main()
