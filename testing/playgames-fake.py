#!/usr/bin/env python3
"""android/store/playgames.py apply against a fake Google Play Games Services Publishing API that refuses two languages'
text (as Google refused one on the first real run): every achievement and leaderboard is made, the refused languages
are dropped with a warning and never sent again, the first achievement is made in English alone before the languages
are tried, and the id map is complete. No account or network. testing/parity.js runs it; prints ok or FAIL."""
import sys, types, json, io, contextlib, os
# a fake Google: refuses Punjabi and Urdu text, remembers what's made
BAD = {'pa', 'ur', 'pa-IN', 'ur-PK'}; made = {}; puts = []
class R:
    def __init__(self, code, body): self.status_code = code; self._b = body; self.text = json.dumps(body); self.content = b'x'
    def json(self): return self._b
class S:
    def __init__(self, c): pass
    def request(self, method, url, timeout=0, json=None, params=None, data=None, headers=None):
        if method == 'GET': return R(200, {'items': []})
        if json is not None:
            for f in ('name', 'description'):
                b = json['draft'].get(f)
                if b and any(t['locale'] in BAD for t in b['translations']):
                    return R(400, {'error': {'message': 'Invalid name with value . Reason: Localized string has invalid locale code.'}})
        if method == 'POST' and '/images/' not in url:
            i = f'id{len(made)}'; made[i] = json; return R(200, {'id': i})
        if method == 'PUT': puts.append(url)
        return R(200, {})
g = types.ModuleType('google'); oa = types.ModuleType('google.oauth2'); sa = types.ModuleType('google.oauth2.service_account')
sa.Credentials = types.SimpleNamespace(from_service_account_info=lambda *a, **k: None)
tr = types.ModuleType('google.auth.transport.requests'); tr.AuthorizedSession = S
for n, m in {'google': g, 'google.oauth2': oa, 'google.oauth2.service_account': sa, 'google.auth': types.ModuleType('google.auth'),
             'google.auth.transport': types.ModuleType('google.auth.transport'), 'google.auth.transport.requests': tr}.items(): sys.modules[n] = m
os.environ.update(ANDROID_PLAY_GAMES_APP_ID='123', PLAY_SERVICE_ACCOUNT_JSON='{}')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'store')); import playgames
out = io.StringIO()
with contextlib.redirect_stdout(out): playgames.apply()
o = out.getvalue()
locs = {t['locale'] for m in made.values() for t in m['draft']['name']['translations']}
ids = json.loads(o.strip().splitlines()[-1])
problems = []
if len(made) != len(playgames.GC['achievements']) + len(playgames.GC['leaderboards']): problems.append(f'made {len(made)}')
if BAD & locs: problems.append(f'used refused {BAD & locs}')
if len(ids['achievements']) != len(playgames.GC['achievements']) or len(ids['leaderboards']) != len(playgames.GC['leaderboards']): problems.append('id map incomplete')
if not all(('no ' + b + ' text') in o for b in BAD & {l for l, _ in playgames.translations()} | {'pa', 'ur'}): problems.append('no warning for a refused language')
if len(made['id0']['draft']['name']['translations']) != 1: problems.append('first achievement not made in English alone')
if len(locs) < 30: problems.append(f'only {len(locs)} languages')
print('ok' if not problems else 'FAIL ' + '; '.join(problems))
