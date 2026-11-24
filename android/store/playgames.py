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
CODE = {}          # a language's code in the form Play Games takes, where it isn't the listing's (apply finds it)


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
        if v: items.append({'kind': 'gamesConfiguration#localizedString', 'locale': CODE.get(loc, loc), 'value': v})
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
    SKIP.clear(); CODE.clear()          # a run starts by trying every language again
    creds = service_account.Credentials.from_service_account_info(json.loads(info), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    s = AuthorizedSession(creds)

    def call(method, url, what, fatal=True, tries=4, **kw):
        for attempt in range(tries):          # Google's busy answers (429, 5xx) are tried again
            if kw.get('data') is not None and hasattr(kw['data'], 'seek'): kw['data'].seek(0)
            r = s.request(method, url, timeout=120, **kw)
            if r.status_code not in (429, 500, 502, 503, 504) or attempt == tries - 1: break
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

    # Images. Every real run's first upload got 503 four times over (media upload on gamesconfiguration.googleapis.com),
    # while the calls around it worked; so each way Google documents is tried in turn on the first image and the one
    # that works is kept. If none does, no more are tried this run, and each image is saved at 512 x 512 under
    # playgames-images/ (named for its item) to add by hand in Play Console; the workflow keeps that folder.
    no_icon, way = [], []
    # Google marks this API's image upload "deprecated and being removed... attempting to use this API causes errors"
    # (developer.android.com, ImageConfigurations: upload), and every real try got 503: so images aren't sent unless
    # PLAYGAMES_UPLOAD_IMAGES=1, and each is saved for Play Console instead
    broken = [] if os.environ.get('PLAYGAMES_UPLOAD_IMAGES') == '1' else [1]
    WAYS = [('media', UPLOAD), ('media', 'https://www.googleapis.com/upload/games/v1configuration'), ('multipart', UPLOAD)]
    SAVE = os.path.join(os.getcwd(), 'playgames-images')

    def png(path):
        """the image as Play Games takes it: 512 x 512 PNG (the leaderboards' are drawn at 1024 for Game Center)"""
        data = open(path, 'rb').read()
        try:
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(data))
            if im.size != (512, 512):
                out = io.BytesIO(); im.convert('RGB').resize((512, 512), Image.LANCZOS).save(out, 'PNG'); data = out.getvalue()
        except ImportError:
            pass
        return data

    def send(how, base, resource, image_type, data):
        url = f'{base}/images/{resource}/imageType/{image_type}'
        if how == 'media':
            return call('POST', url, 'Uploading an image', fatal=False, tries=2, params={'uploadType': 'media'}, data=data, headers={'Content-Type': 'image/png'})
        b = 'kingwalk' + 'x' * 12
        body = (f'--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{{}}\r\n--{b}\r\nContent-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
        return call('POST', url, 'Uploading an image', fatal=False, tries=2, params={'uploadType': 'multipart'}, data=body,
                    headers={'Content-Type': f'multipart/related; boundary={b}'})

    def icon(resource, image_type, name):
        """an item's image, the way Google last took one; one it won't take is saved for Play Console"""
        path = os.path.join(IOS, 'gamecenter', name)
        if not os.path.exists(path): return
        data = png(path)
        if not broken:
            for how, base in (way or WAYS):
                r = send(how, base, resource, image_type, data)
                if isinstance(r, dict):
                    if not way: way.append((how, base)); print(f'Images go up as {how} uploads to {base}')
                    return
                print(f'::warning::{name}: {how} upload to {base} answered {r.status_code}')
            if not way: broken.append(1); print('::warning::No way of uploading images worked: the rest are saved for Play Console')
        no_icon.append(name)
        os.makedirs(SAVE, exist_ok=True)
        open(os.path.join(SAVE, name), 'wb').write(data)

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

    token_of = {}          # the token Play Games gives each item (listed with it); an update sends it back
    def update(body, item_id):
        """a body for an update: the item's id (Google reads it from here, not the address) and the item's own token from
        Google (the one it was made with, or a new one, was refused: 410 UpdateTokenInvalid)"""
        return dict(body, id=item_id, token=token_of.get(item_id) or body.get('token'))

    def make(kind, body, what):
        """POST a new item; one Google refuses for a language code is made again in English, with a warning"""
        r = call('POST', f'{API}/applications/{app}/{kind}', what, fatal=False, json=body)
        if not isinstance(r, dict) and r.status_code == 400 and 'locale' in r.text:
            print(f'::warning::{what}: Google refused a language code; made in English only (add its translations in Play Console)')
            english_only = json.loads(json.dumps(body))
            for f in ('name', 'description'):
                b = english_only['draft'].get(f)
                if b: b['translations'] = b['translations'][:1]
            sfx = english_only['draft'].get('scoreFormat', {}).get('suffix', {})
            for k in sfx: sfx[k]['translations'] = sfx[k]['translations'][:1]
            r = call('POST', f'{API}/applications/{app}/{kind}', what, fatal=False, json=english_only)
        if not isinstance(r, dict): sys.exit(f'::error::{what} failed ({r.status_code}): {r.text[:1500]}')
        if not r.get('id'): sys.exit(f"::error::{what}: Google sent back no id (fields: {sorted(r)}); nothing more made")
        token_of[r['id']] = r.get('token')
        return r

    ids = {'achievements': {}, 'leaderboards': {}}
    found = every('achievements')
    # what Play Games has already: shown, and nothing more made if an id is missing or a name is there twice (the second
    # and third real runs got an achievement back with an empty id; this run says what Google returns before going on)
    for x in found: print('Play Games has achievement:', repr(english(x)), 'id', repr(x.get('id')), 'token', repr(x.get('token')), 'fields', sorted(x))
    names = [english(x) for x in found]
    if any(not x.get('id') for x in found) or len(set(names)) < len(names):
        sys.exit('::error::Play Games lists an achievement without an id, or one name twice (above): check Play Console → Play Games '
                 'Services → Achievements and delete the extra drafts before running this again')
    have = {english(a): a['id'] for a in found}
    token_of.update({x['id']: x.get('token') for x in found})
    for a in GC['achievements']:          # made by an earlier run whose image didn't go up
        it = next((x for x in found if english(x) == a['name']), None)
        if it and not has_icon(it): icon(it['id'], 'ACHIEVEMENT_ICON', a['id'] + '.png')
    # The languages Play Games takes: the first achievement, made (or found) in English, is saved once with English and
    # each other language; a language it refuses is left out of everything
    first = GC['achievements'][0]
    if first['name'] not in have:
        SKIP.update(loc for loc, _ in translations())
        made = make('achievements', achievement(0, first), f"Making achievement {first['id']}")
        have[first['name']] = made['id']; icon(made['id'], 'ACHIEVEMENT_ICON', first['id'] + '.png'); print('made achievement', first['id'])
        SKIP.clear()
    # Each language in the forms its code might take (the seventh real run had every listing code, de-DE and fr-FR
    # included, refused as "invalid locale code" while en-US was taken): the first form Google takes is kept
    every_lang, refused, updates, said = [loc for loc, _ in translations()], set(), True, []
    def forms(loc):
        base = loc.split('-')[0]
        out = [loc, base, loc.replace('-', '_')]
        return [f for i, f in enumerate(out) if f not in out[:i] and f not in CODE.values()]
    for loc in every_lang:          # English and this one language only
        SKIP.clear(); SKIP.update(set(every_lang) - {loc})
        for form in forms(loc):
            CODE[loc] = form
            r = call('PUT', f"{API}/achievements/{have[first['name']]}", f'Trying {loc} as {form}', fatal=False, json=update(achievement(0, first), have[first['name']]))
            if isinstance(r, dict):
                if r.get('token'): token_of[have[first['name']]] = r['token']          # a new token for the next update
                if form != loc: print(f'Play Games takes {loc} as {form}')
                break
            if r.status_code == 410 or 'token' in r.text.lower():          # Google won't take updates from here: go on without them
                updates = False; break
            if 'locale' not in r.text: sys.exit(f'::error::Trying {loc} as {form} failed ({r.status_code}): {r.text[:1500]}')
            if not said: said.append(1); print(f'Google, refusing {loc} as {form}: {r.text[:600]}')
        else:
            CODE.pop(loc, None); refused.add(loc); print(f'::warning::Play Games takes no {loc} text in any form tried; that language shows English')
        if not updates:
            CODE.pop(loc, None)
            print(f"::warning::Play Games refused an update ({r.status_code}: {r.text[:200]}); {first['id']} stays in English "
                  'for now (add its translations in Play Console), and the rest are made with every language, any refused one in English')
            break
    SKIP.clear(); SKIP.update(refused)
    if updates:          # an update names its achievement in the body too: Google reads the id from there
        r = call('PUT', f"{API}/achievements/{have[first['name']]}", f"Saving achievement {first['id']} in every language", json=update(achievement(0, first), have[first['name']]))
    if updates:          # achievements an earlier run made with fewer languages (the seventh made them all in English)
        expected = lambda i, a: len(achievement(i, a)['draft']['name']['translations'])
        for i, a in enumerate(GC['achievements']):
            it = next((x for x in found if english(x) == a['name']), None)
            if i and it and len(((it.get('draft') or {}).get('name') or {}).get('translations', [])) < expected(i, a):
                r = call('PUT', f"{API}/achievements/{it['id']}", f"Adding the languages to {a['id']}", json=update(achievement(i, a), it['id']))
                if r.get('token'): token_of[it['id']] = r['token']
                print('added the languages to', a['id'])
    for i, a in enumerate(GC['achievements']):
        if a['name'] in have:
            ids['achievements'][a['id']] = have[a['name']]; continue
        made = make('achievements', achievement(i, a), f"Making achievement {a['id']}")
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
                          'scoreFormat': {'numberFormatType': 'NUMERIC', 'numDecimalPlaces': 0,
                                          'suffix': {'one': suffix('suffix_singular', l['suffix_singular'].strip()),
                                                     'other': suffix('suffix', l['suffix'].strip())}}}}
        made = make('leaderboards', body, f"Making leaderboard {l['id']}")
        ids['leaderboards'][l['id']] = made['id']
        icon(made['id'], 'LEADERBOARD_ICON', 'leaderboard-' + l['id'] + '.png')
        print('made leaderboard', l['id'])
    if no_icon: print(f'::notice::{len(no_icon)} images to add in Play Console (Play Games Services → each achievement and leaderboard → Icon), saved in playgames-images/ (the run\'s artifact):', ', '.join(no_icon))
    print('Set the repository variable ANDROID_PLAY_GAMES_IDS to:')
    print(json.dumps(ids, separators=(',', ':')))


if __name__ == '__main__':
    {'list': listing, 'apply': apply}.get(sys.argv[1] if len(sys.argv) > 1 else 'list', listing)()
