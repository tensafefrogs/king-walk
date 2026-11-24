#!/usr/bin/env python3
"""android/store/playgames.py apply against a fake Google Play Games Services Publishing API that refuses two languages'
text (as Google refused one on the first real run): every achievement and leaderboard is made, the refused languages
are dropped with a warning and never sent again, the first achievement is made in English alone before the languages
are tried, and the id map is complete. No account or network. testing/parity.js runs it; prints ok or FAIL."""
import sys, types, json, io, contextlib, os
# a fake Google: refuses some languages' text, is busy (503) the first time an image is sent, never takes one image,
# and lists what was made, as Google does, so a second run can find it
BAD = {'pa', 'ur', 'pa-IN', 'ur-PK'}; made = {}; puts = []; icons = {}; busy = [1]
NEVER = 'leaderboard-rating.png'
class R:
    def __init__(self, code, body): self.status_code = code; self._b = body; self.text = json.dumps(body); self.content = b'x'
    def json(self): return self._b
class S:
    def __init__(self, c): pass
    def request(self, method, url, timeout=0, json=None, params=None, data=None, headers=None):
        kind = 'achievements' if '/achievements' in url else 'leaderboards'
        if method == 'GET':
            return R(200, {'items': [{'id': i, 'draft': dict(m['draft'], **({'iconUrl': 'x'} if i in icons else {}))}
                                     for i, m in made.items() if m['_kind'] == kind]})
        if '/images/' in url:
            if busy: busy.pop(); return R(503, {'error': 'Service Unavailable'})
            if getattr(data, 'name', '').endswith(NEVER): return R(503, {'error': 'Service Unavailable'})
            icons[url.split('/images/')[1].split('/')[0]] = 1; return R(200, {})
        for f in ('name', 'description'):
            b = json['draft'].get(f)
            if b and any(t['locale'] in BAD for t in b['translations']):
                return R(400, {'error': {'message': 'Invalid name with value . Reason: Localized string has invalid locale code.'}})
        if method == 'POST':
            i = f'id{len(made)}'; made[i] = dict(json, _kind=kind); return R(200, {'id': i})
        puts.append(url); return R(200, {})
g = types.ModuleType('google'); oa = types.ModuleType('google.oauth2'); sa = types.ModuleType('google.oauth2.service_account')
sa.Credentials = types.SimpleNamespace(from_service_account_info=lambda *a, **k: None)
tr = types.ModuleType('google.auth.transport.requests'); tr.AuthorizedSession = S
for n, m in {'google': g, 'google.oauth2': oa, 'google.oauth2.service_account': sa, 'google.auth': types.ModuleType('google.auth'),
             'google.auth.transport': types.ModuleType('google.auth.transport'), 'google.auth.transport.requests': tr}.items(): sys.modules[n] = m
os.environ.update(ANDROID_PLAY_GAMES_APP_ID='123', PLAY_SERVICE_ACCOUNT_JSON='{}')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'store')); import playgames
playgames.time.sleep = lambda s: None          # no waiting between tries here

def run():
    out = io.StringIO()
    with contextlib.redirect_stdout(out): playgames.apply()
    return out.getvalue()
o = run()
locs = {t['locale'] for m in made.values() for t in m['draft']['name']['translations']}
ids = json.loads(o.strip().splitlines()[-1])
n = len(playgames.GC['achievements']) + len(playgames.GC['leaderboards'])
problems = []
if len(made) != n: problems.append(f'made {len(made)} of {n}')
if BAD & locs: problems.append(f'used refused {BAD & locs}')
if len(ids['achievements']) != len(playgames.GC['achievements']) or len(ids['leaderboards']) != len(playgames.GC['leaderboards']): problems.append('id map incomplete')
if not all(('no ' + b + ' text') in o for b in BAD & {l for l, _ in playgames.translations()} | {'pa', 'ur'}): problems.append('no warning for a refused language')
if len(made['id0']['draft']['name']['translations']) != 1: problems.append('first achievement not made in English alone')
if len(locs) < 30: problems.append(f'only {len(locs)} languages')
if len(icons) != n - 1: problems.append(f'{len(icons)} images up (a busy answer should be tried again; one never taken)')
if NEVER not in o: problems.append('the image Google never took is not reported')
# a second run (to add what's missing): finds everything, makes nothing again, same ids
o2 = run(); ids2 = json.loads(o2.strip().splitlines()[-1])
if len(made) != n: problems.append(f'the second run made more ({len(made)})')
if ids2 != ids: problems.append('the second run printed other ids')
print('ok' if not problems else 'FAIL ' + '; '.join(problems))
