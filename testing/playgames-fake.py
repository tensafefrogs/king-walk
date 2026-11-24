#!/usr/bin/env python3
"""android/store/playgames.py apply against a fake Google Play Games Services Publishing API that refuses two languages'
text (as Google refused one on the first real run): every achievement and leaderboard is made, the refused languages
are dropped with a warning and never sent again, the first achievement is made in English alone before the languages
are tried, and the id map is complete. No account or network. testing/parity.js runs it; prints ok or FAIL."""
import sys, types, json, io, contextlib, os
import copy
# a fake Google: refuses some languages' text, is busy (503) the first time an image is sent, never takes one image,
# and lists what was made, as Google does, so a second run can find it
BAD = {'pa', 'ur', 'pa-IN', 'ur-PK'}; made = {}; puts = []; icons = {}; busy = [1]; sizes = set(); created = {}; UPDATES = [True]; limited = [1]; tries_of = {}          # UPDATES[0] False: every update refused, as a 410
NEVER = 'leaderboard-rating.png'
class R:
    def __init__(self, code, body): self.status_code = code; self._b = body; self.text = json.dumps(body); self.content = b'x'
    def json(self): return self._b
class S:
    def __init__(self, c): pass
    def request(self, method, url, timeout=0, json=None, params=None, data=None, headers=None):
        kind = 'achievements' if '/achievements' in url else 'leaderboards'
        if method == 'GET':
            return R(200, {'items': [{'id': i, 'token': m['token'], 'draft': dict(m['draft'], **({'iconUrl': 'x'} if i in icons else {}))}
                                     for i, m in made.items() if m['_kind'] == kind]})
        if '/images/' in url:          # only the www.googleapis.com media upload works here; it is busy once
            if not url.startswith('https://www.googleapis.com/') or (params or {}).get('uploadType') != 'media':
                return R(503, {'error': 'Service Unavailable'})
            if busy: busy.pop(); return R(503, {'error': 'Service Unavailable'})
            rid = url.split('/images/')[1].split('/')[0]
            if made.get(rid, {}).get('_made') == 'kingwalk-' + NEVER[len('leaderboard-'):-4]: return R(503, {'error': 'Service Unavailable'})
            try:
                from PIL import Image
                sizes.add(Image.open(io.BytesIO(data)).size)
            except ImportError:
                pass
            icons[rid] = 1; return R(200, {})
        if json['draft'].get('scoreFormat') and not json['draft']['scoreFormat'].get('numberFormatType'):
            return R(400, {'error': {'message': 'Invalid numberFormatType with value . Reason: No leaderboard score format type specified.'}})
        sfx = (json['draft'].get('scoreFormat') or {}).get('suffix')
        if sfx is not None and set(sfx) != {'zero', 'one', 'two', 'few', 'many', 'other'}:          # Google wants every plural form
            return R(400, {'error': {'message': 'Invalid suffix with value . Reason: Localized string field is missing.'}})
        if method == 'PUT' and limited: limited.pop(); return R(403, {'error': {'message': 'Rate Limit Exceeded', 'errors': [{'reason': 'rateLimitExceeded'}]}})
        for t in json['draft']['name']['translations']: tries_of[t['locale']] = tries_of.get(t['locale'], 0) + 1
        if any(t['locale'].split('-')[0].split('_')[0] == 'ar' for t in json['draft']['name']['translations']):          # not one of the game's languages
            return R(400, {'error': {'message': 'The locale ar in the name field is not supported by the application.', 'errors': [{'reason': 'UnsupportedLocale'}]}})
        for f in ('name', 'description'):          # like the real one: a regional code (de-DE) is refused, the language (de) taken
            b = json['draft'].get(f)
            if b and any(t['locale'] in BAD or ('-' in t['locale'] and t['locale'] != 'en-US') for t in b['translations']):
                return R(400, {'error': {'message': 'Invalid name with value . Reason: Localized string has invalid locale code.'}})
        if method == 'POST':
            i = f'id{len(made)}'; t = f'srv-{i}-0'; created[i] = copy.deepcopy(json); made[i] = dict(json, _kind=kind, _made=json.get('token'), token=t); return R(200, {'id': i, 'token': t})
        if (json or {}).get('id') != url.rstrip('/').split('/')[-1]:          # Google reads an update's id from its body
            return R(404, {'error': {'message': 'The requested achievement definition with ID  was not found.'}})
        item = made[json['id']]
        if not UPDATES[0] or json.get('token') != item['token']:          # an update sends the item's token from Google
            return R(410, {'error': {'message': 'The passed token does not match the arguments of the request.'}})
        item['token'] = item['token'].rsplit('-', 1)[0] + '-' + str(int(item['token'].rsplit('-', 1)[1]) + 1)
        item['draft'] = json['draft']
        puts.append(url); return R(200, {'id': json['id'], 'token': item['token']})
g = types.ModuleType('google'); oa = types.ModuleType('google.oauth2'); sa = types.ModuleType('google.oauth2.service_account')
sa.Credentials = types.SimpleNamespace(from_service_account_info=lambda *a, **k: None)
tr = types.ModuleType('google.auth.transport.requests'); tr.AuthorizedSession = S
for n, m in {'google': g, 'google.oauth2': oa, 'google.oauth2.service_account': sa, 'google.auth': types.ModuleType('google.auth'),
             'google.auth.transport': types.ModuleType('google.auth.transport'), 'google.auth.transport.requests': tr}.items(): sys.modules[n] = m
os.environ.update(ANDROID_PLAY_GAMES_APP_ID='123', PLAY_SERVICE_ACCOUNT_JSON='{}', PLAYGAMES_UPLOAD_IMAGES='1')          # the upload path, as if Google took images again
import tempfile; os.chdir(tempfile.mkdtemp())          # playgames-images/ lands here
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'store')); import playgames
playgames.time.sleep = lambda s: None          # no waiting between tries here

def run():
    out = io.StringIO()
    with contextlib.redirect_stdout(out): playgames.apply()
    return out.getvalue()
o = run()
ar_tries = sum(v for k, v in tries_of.items() if k.split('-')[0].split('_')[0] == 'ar')          # in this first run
locs = {t['locale'] for m in made.values() for t in m['draft']['name']['translations']}
ids = json.loads(o.strip().splitlines()[-1])
n = len(playgames.GC['achievements']) + len(playgames.GC['leaderboards'])
problems = []
if len(made) != n: problems.append(f'made {len(made)} of {n}')
if BAD & locs: problems.append(f'used refused {BAD & locs}')
if len(ids['achievements']) != len(playgames.GC['achievements']) or len(ids['leaderboards']) != len(playgames.GC['leaderboards']): problems.append('id map incomplete')
if not all(('no ' + b + ' text') in o for b in BAD & {l for l, _ in playgames.translations()} | {'pa', 'ur'}): problems.append('no warning for a refused language')
if len(created['id0']['draft']['name']['translations']) != 1: problems.append('first achievement not made in English alone')
if len(locs) < 30: problems.append(f'only {len(locs)} languages')
if len(icons) != n - 1: problems.append(f'{len(icons)} images up (a busy answer should be tried again; one never taken)')
if NEVER not in o: problems.append('the image Google never took is not reported')
if not os.path.exists(os.path.join('playgames-images', NEVER)): problems.append('the image Google never took is not saved for Play Console')
if 'Images go up as media uploads to https://www.googleapis.com' not in o: problems.append('the way that works was not found')
if sizes and sizes != {(512, 512)}: problems.append(f'images sent at {sizes}, not 512 x 512')
# a second run (to add what's missing): finds everything, makes nothing again, same ids
o2 = run(); ids2 = json.loads(o2.strip().splitlines()[-1])
if len(made) != n: problems.append(f'the second run made more ({len(made)})')
if ids2 != ids: problems.append('the second run printed other ids')
# Google lists an achievement with an empty id (as the real second and third runs saw): stop, make nothing
before = len(made); made[''] = dict(made['id0'])
try: run(); problems.append('went on with an achievement listed without an id')
except SystemExit: pass
if len(made) != before + 1: problems.append('made something after an empty id')
# Google refuses every update (as the real fifth and sixth runs did): the rest are still made, with every language,
# and any refused for a language code is made again in English
made.clear(); icons.clear(); UPDATES[0] = False
o3 = run()
locs3 = {t['locale'] for m in made.values() for t in m['draft']['name']['translations']}
if len(made) != n: problems.append(f'with updates refused, made {len(made)} of {n}')
if BAD & locs3: problems.append('with updates refused, a refused language was kept')
if 'refused an update' not in o3: problems.append('a refused update is not reported')
if 'de' not in locs or 'de-DE' in locs: problems.append('German not found in the form Google takes (de)')
if 'ar' in locs: problems.append('Arabic sent although the game has no Arabic')
if 'add the game' not in o: problems.append('no word on adding languages to the game in Play Console')
if ar_tries > 1: problems.append(f'Arabic tried {ar_tries} times after UnsupportedLocale')
# an earlier run left the achievements in English only (as the seventh real run did): their languages are added
made.clear(); icons.clear(); UPDATES[0] = True
for i, a in enumerate(playgames.GC['achievements']):
    playgames.SKIP.update(l for l, _ in playgames.translations())
    body = {'draft': {'name': playgames.bundle(a['name'], lambda t: None), 'description': playgames.bundle(a['before'], lambda t: None)}, 'token': 'kingwalk-' + a['id']}
    playgames.SKIP.clear()
    made[f'id{i}'] = dict(body, _kind='achievements', _made=body['token'], token=f'srv-id{i}-0')
o4 = run()
short = [i for i, m in made.items() if m['_kind'] == 'achievements' and len(m['draft']['name']['translations']) < 20]
if short: problems.append(f'{len(short)} achievements still in English only')
# as it runs for real (no image uploads: Google's image API is deprecated): nothing sent, every image saved
made.clear(); icons.clear(); os.environ.pop('PLAYGAMES_UPLOAD_IMAGES'); import shutil; shutil.rmtree('playgames-images', ignore_errors=True)
o5 = run()
if icons: problems.append('an image was sent with uploads off')
if len(os.listdir('playgames-images')) != n: problems.append(f"{len(os.listdir('playgames-images'))} of {n} images saved for Play Console")
print('ok' if not problems else 'FAIL ' + '; '.join(problems))
