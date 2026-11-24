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
import glob, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.join(HERE, '..', '..', 'ios', 'store')
GC = json.load(open(os.path.join(IOS, 'gamecenter.json')))
API = 'https://gamesconfiguration.googleapis.com/games/v1configuration'
UPLOAD = 'https://gamesconfiguration.googleapis.com/upload/games/v1configuration'
# App Store locales to Google Play's: the store listing's table (listing.py), which Google took for 44 languages; a
# language without a Play listing (Odia) is left out. apply() still tries each language once and drops any Play Games
# refuses ("Localized string has invalid locale code" stopped the first run on its first achievement, before anything
# was made)
sys.path.insert(0, HERE)
from listing import PLAY as PLAY_LOCALE          # noqa: E402
SKIP = set()          # languages Play Games refused (apply fills it)


def translations():
    out = []
    for f in sorted(glob.glob(os.path.join(IOS, 'l10n', '*.json'))):
        t = json.load(open(f))
        loc = PLAY_LOCALE.get(t['locale'])
        if loc and loc not in SKIP: out.append((loc, t.get('gamecenter', {})))
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
    SKIP.clear()          # a run starts by trying every language again
    creds = service_account.Credentials.from_service_account_info(json.loads(info), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    s = AuthorizedSession(creds)

    def call(method, url, what, fatal=True, **kw):
        for attempt in range(4):          # Google's busy answers (503 on the first image, Nov 2026) are tried again
            if kw.get('data') is not None and hasattr(kw['data'], 'seek'): kw['data'].seek(0)
            r = s.request(method, url, timeout=120, **kw)
            if r.status_code not in (429, 500, 502, 503, 504) or attempt == 3: break
            time.sleep(5 * (attempt + 1))
        if r.status_code >= 300:
            if fatal: sys.exit(f'::error::{what} failed ({r.status_code}): {r.text[:1500]}')
            return r
        return r.json() if r.content else {}

    def every(kind):
        items, token = [], None
        while True:
            r = call('GET', f'{API}/applications/{app}/{kind}', f'Listing {kind}', params={'maxResults': 200, **({'pageToken': token} if token else {})})
            items += r.get('items', []); token = r.get('nextPageToken')
            if not token: return items

    no_icon = []
    def icon(resource, image_type, name):
        """an item's image; one Google won't take after its retries is reported, and the next run tries it again"""
        path = os.path.join(IOS, 'gamecenter', name)
        if os.path.exists(path):
            with open(path, 'rb') as f:
                r = call('POST', f'{UPLOAD}/images/{resource}/imageType/{image_type}', f'Uploading {name}', fatal=False, params={'uploadType': 'media'},
                         data=f, headers={'Content-Type': 'image/png'})
            if not isinstance(r, dict): no_icon.append(name); print(f'::warning::{name} not uploaded ({r.status_code}); run this again to add it')

    def has_icon(item):
        return bool((item.get('draft') or {}).get('iconUrl') or (item.get('published') or {}).get('iconUrl'))

    def english(item):
        for t in ((item.get('draft') or item.get('published') or {}).get('name') or {}).get('translations', []):
            if t.get('locale', '').startswith('en'): return t.get('value')

    def achievement(i, a):
        return {'kind': 'gamesConfiguration#achievementConfiguration', 'token': 'kingwalk-' + a['id'], 'achievementType': 'STANDARD',
                'initialState': 'HIDDEN' if a.get('hidden') else 'REVEALED',
                'draft': {'kind': 'gamesConfiguration#achievementConfigurationDetail', 'pointValue': a['points'], 'sortRank': i + 1,
                          'name': bundle(a['name'], lambda t: t.get('achievements', {}).get(a['id'], {}).get('name')),
                          'description': bundle(a['before'], lambda t: t.get('achievements', {}).get(a['id'], {}).get('before'))}}

    ids = {'achievements': {}, 'leaderboards': {}}
    found = every('achievements')
    have = {english(a): a['id'] for a in found}
    for a in GC['achievements']:          # made by an earlier run whose image didn't go up
        it = next((x for x in found if english(x) == a['name']), None)
        if it and not has_icon(it): icon(it['id'], 'ACHIEVEMENT_ICON', a['id'] + '.png')
    # The languages Play Games takes: the first achievement, made (or found) in English, is saved once with English and
    # each other language; a language it refuses is left out of everything
    first = GC['achievements'][0]
    if first['name'] not in have:
        SKIP.update(loc for loc, _ in translations())
        made = call('POST', f'{API}/applications/{app}/achievements', f"Making achievement {first['id']}", json=achievement(0, first))
        have[first['name']] = made['id']; icon(made['id'], 'ACHIEVEMENT_ICON', first['id'] + '.png'); print('made achievement', first['id'])
        SKIP.clear()
    every_lang, refused = [loc for loc, _ in translations()], set()
    for loc in every_lang:          # English and this one language only
        SKIP.clear(); SKIP.update(set(every_lang) - {loc})
        r = call('PUT', f"{API}/achievements/{have[first['name']]}", f'Trying {loc}', fatal=False, json=achievement(0, first))
        if not isinstance(r, dict):
            if 'locale' not in r.text: sys.exit(f'::error::Trying {loc} failed ({r.status_code}): {r.text[:1500]}')
            refused.add(loc); print(f'::warning::Play Games takes no {loc} text; that language shows English')
    SKIP.clear(); SKIP.update(refused)
    call('PUT', f"{API}/achievements/{have[first['name']]}", f"Saving achievement {first['id']} in every language", json=achievement(0, first))
    for i, a in enumerate(GC['achievements']):
        if a['name'] in have:
            ids['achievements'][a['id']] = have[a['name']]; continue
        made = call('POST', f'{API}/applications/{app}/achievements', f"Making achievement {a['id']}", json=achievement(i, a))
        ids['achievements'][a['id']] = made['id']
        icon(made['id'], 'ACHIEVEMENT_ICON', a['id'] + '.png')
        print('made achievement', a['id'])
    found = every('leaderboards')
    have = {english(l): l['id'] for l in found}
    for l in GC['leaderboards']:
        it = next((x for x in found if english(x) == l['name']), None)
        if it and not has_icon(it): icon(it['id'], 'LEADERBOARD_ICON', 'leaderboard-' + l['id'] + '.png')
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
    if no_icon: print('::warning::Without their images for now:', ', '.join(no_icon))
    print('Set the repository variable ANDROID_PLAY_GAMES_IDS to:')
    print(json.dumps(ids, separators=(',', ':')))


if __name__ == '__main__':
    {'list': listing, 'apply': apply}.get(sys.argv[1] if len(sys.argv) > 1 else 'list', listing)()
