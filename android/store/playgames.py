#!/usr/bin/env python3
"""Google Play Games: the game's achievements and leaderboards, the same as Game Center's (ios/store/gamecenter.json,
with the names in every language from ios/store/l10n/ and the 512 x 512 images from ios/store/gamecenter/).

Play gives each achievement and leaderboard its own id when it's made. The app needs the map from the page's ids to
those (the variable ANDROID_PLAY_GAMES_IDS, read by android/app/build.gradle.kts), and the game's project id
(ANDROID_PLAY_GAMES_APP_ID). This prints both.

  python3 android/store/playgames.py list        what to enter in Play Console by hand (English), no account needed
  python3 android/store/playgames.py apply       makes the missing ones through Google's Play Games Services
                                                  Publishing API, uploads their images, then prints the id map

apply needs PLAY_SERVICE_ACCOUNT_JSON (the same service account as play.py, with access to the game in Play Console)
and ANDROID_PLAY_GAMES_APP_ID. It has not been run against Google yet: check its first run's output in Play Console
(Grow users → Play Games Services → Setup and management) before publishing the Play Games project. Items stay drafts
until the project is published there.
"""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.join(HERE, '..', '..', 'ios', 'store')
GC = json.load(open(os.path.join(IOS, 'gamecenter.json')))
API = 'https://gamesconfiguration.googleapis.com/games/v1configuration'
UPLOAD = 'https://gamesconfiguration.googleapis.com/upload/games/v1configuration'
# App Store locales to Google Play's (Play uses language-REGION for most)
PLAY_LOCALE = {'ar-SA': 'ar', 'he': 'iw-IL', 'id': 'id', 'no': 'no-NO', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', 'es-MX': 'es-419',
               'ja': 'ja-JP', 'ko': 'ko-KR', 'ru': 'ru-RU', 'pl': 'pl-PL', 'tr': 'tr-TR', 'th': 'th', 'vi': 'vi', 'uk': 'uk', 'cs': 'cs-CZ',
               'sk': 'sk', 'hr': 'hr', 'hu': 'hu-HU', 'ro': 'ro', 'el': 'el-GR', 'ca': 'ca', 'sv': 'sv-SE', 'da': 'da-DK', 'fi': 'fi-FI',
               'it': 'it-IT', 'ms': 'ms', 'hi': 'hi-IN'}


def translations():
    out = []
    for f in sorted(glob.glob(os.path.join(IOS, 'l10n', '*.json'))):
        t = json.load(open(f))
        out.append((PLAY_LOCALE.get(t['locale'], t['locale']), t.get('gamecenter', {})))
    return out


def bundle(english, pick):
    """a LocalizedStringBundle: English, then every language that has the text"""
    items = [{'kind': 'gamesConfiguration#localizedString', 'locale': 'en-US', 'value': english}]
    for loc, t in translations():
        v = pick(t)
        if v: items.append({'kind': 'gamesConfiguration#localizedString', 'locale': loc, 'value': v})
    return {'kind': 'gamesConfiguration#localizedStringBundle', 'translations': items}


def listing():
    print('Achievements (Play Console → Play Games Services → Achievements → Add achievement; icon from ios/store/gamecenter/<id>.png):')
    for i, a in enumerate(GC['achievements']):
        print(f"  {a['id']}: {a['name']} | {a['before']} | {a['points']} points | {'hidden' if a.get('hidden') else 'revealed'} | order {i + 1}")
    print('Leaderboards (Add leaderboard; numeric, larger is better; icon ios/store/gamecenter/leaderboard-<id>.png):')
    for i, l in enumerate(GC['leaderboards']):
        print(f"  {l['id']}: {l['name']} | units '{l['suffix'].strip()}' | order {i + 1}")
    print('Then set ANDROID_PLAY_GAMES_IDS to {"achievements": {"first_solve": "<Play id>", ...}, "leaderboards": {"rating": "<Play id>", ...}}')


def apply():
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    app = os.environ.get('ANDROID_PLAY_GAMES_APP_ID', '').strip()
    info = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '').strip()
    if not app or not info: sys.exit('::error::Needs ANDROID_PLAY_GAMES_APP_ID and PLAY_SERVICE_ACCOUNT_JSON (android/README.md)')
    creds = service_account.Credentials.from_service_account_info(json.loads(info), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    s = AuthorizedSession(creds)

    def call(method, url, what, **kw):
        r = s.request(method, url, timeout=120, **kw)
        if r.status_code >= 300: sys.exit(f'::error::{what} failed ({r.status_code}): {r.text[:1500]}')
        return r.json() if r.content else {}

    def every(kind):
        items, token = [], None
        while True:
            r = call('GET', f'{API}/applications/{app}/{kind}', f'Listing {kind}', params={'maxResults': 200, **({'pageToken': token} if token else {})})
            items += r.get('items', []); token = r.get('nextPageToken')
            if not token: return items

    def icon(resource, image_type, name):
        path = os.path.join(IOS, 'gamecenter', name)
        if os.path.exists(path):
            with open(path, 'rb') as f:
                call('POST', f'{UPLOAD}/images/{resource}/imageType/{image_type}', f'Uploading {name}', params={'uploadType': 'media'},
                     data=f, headers={'Content-Type': 'image/png'})

    def english(item):
        for t in ((item.get('draft') or item.get('published') or {}).get('name') or {}).get('translations', []):
            if t.get('locale', '').startswith('en'): return t.get('value')

    ids = {'achievements': {}, 'leaderboards': {}}
    have = {english(a): a['id'] for a in every('achievements')}
    for i, a in enumerate(GC['achievements']):
        if a['name'] in have:
            ids['achievements'][a['id']] = have[a['name']]; continue
        body = {'kind': 'gamesConfiguration#achievementConfiguration', 'token': 'kingwalk-' + a['id'], 'achievementType': 'STANDARD',
                'initialState': 'HIDDEN' if a.get('hidden') else 'REVEALED',
                'draft': {'kind': 'gamesConfiguration#achievementConfigurationDetail', 'pointValue': a['points'], 'sortRank': i + 1,
                          'name': bundle(a['name'], lambda t: t.get('achievements', {}).get(a['id'], {}).get('name')),
                          'description': bundle(a['before'], lambda t: t.get('achievements', {}).get(a['id'], {}).get('before'))}}
        made = call('POST', f'{API}/applications/{app}/achievements', f"Making achievement {a['id']}", json=body)
        ids['achievements'][a['id']] = made['id']
        icon(made['id'], 'ACHIEVEMENT_ICON', a['id'] + '.png')
        print('made achievement', a['id'])
    have = {english(l): l['id'] for l in every('leaderboards')}
    for i, l in enumerate(GC['leaderboards']):
        if l['name'] in have:
            ids['leaderboards'][l['id']] = have[l['name']]; continue
        suffix = lambda field, english_text: bundle(english_text, lambda t: (t.get('leaderboards', {}).get(l['id'], {}).get(field) or '').strip() or None)
        body = {'kind': 'gamesConfiguration#leaderboardConfiguration', 'token': 'kingwalk-' + l['id'], 'scoreOrder': 'LARGER_IS_BETTER',
                'draft': {'kind': 'gamesConfiguration#leaderboardConfigurationDetail', 'sortRank': i + 1,
                          'name': bundle(l['name'], lambda t: t.get('leaderboards', {}).get(l['id'], {}).get('name')),
                          'scoreFormat': {'numberFormatStyle': 'NUMERIC', 'numDecimalPlaces': 0,
                                          'suffix': {'one': suffix('suffix_singular', l['suffix_singular'].strip()),
                                                     'other': suffix('suffix', l['suffix'].strip())}}}}
        made = call('POST', f'{API}/applications/{app}/leaderboards', f"Making leaderboard {l['id']}", json=body)
        ids['leaderboards'][l['id']] = made['id']
        icon(made['id'], 'LEADERBOARD_ICON', 'leaderboard-' + l['id'] + '.png')
        print('made leaderboard', l['id'])
    print('Set the repository variable ANDROID_PLAY_GAMES_IDS to:')
    print(json.dumps(ids, separators=(',', ':')))


if __name__ == '__main__':
    {'list': listing, 'apply': apply}.get(sys.argv[1] if len(sys.argv) > 1 else 'list', listing)()
