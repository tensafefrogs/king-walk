#!/usr/bin/env python3
"""Sets up Game Center in App Store Connect from gamecenter.json: turns Game Center on for the app, creates the
leaderboards and achievements that aren't there yet (with their English names, descriptions and achievement images
from gamecenter/), and adds Game Center to the version being prepared. What's already there is left alone, except
that names and descriptions are brought up to date.

usage: python3 ios/store/gamecenter.py [--dry-run]
At the end it prints what App Store Connect holds for each challenge, including whether Apple accepted its image.
Credentials as in asc.py. The App Store listing workflow runs it when gamecenter.json or the images change.

Ids: the page reports short names (index.html: achieve() and reportProgress()); the app adds the prefix "kingwalk."
(ios/KingWalk/GameCenter.swift). Points can't be changed once an achievement is live, and an achievement or
leaderboard can't be deleted once live, so get them right before the first release.
If a step fails here (a new part of Apple's API), it says so; the same can be done by hand in App Store Connect →
the app → Features → Game Center (see listing.md, "Game Center").
"""
import json, os, sys
from asc import ApiError, app as get_app, log, request, upload_parts

HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = 'kingwalk.'
DRY = '--dry-run' in sys.argv
problems = []


def api(method, path, body=None, what=''):
    if DRY and method != 'GET':
        log('  (dry run)', method, path, json.dumps(body)[:200] if body else ''); return {'data': {'id': 'dry', 'attributes': {}}}
    try:
        return request(method, path, body)
    except ApiError as e:
        problems.append(f'{what or method + " " + path}: {e.code} {e.body[:400]}')
        log('  failed:', what or path, e.code, e.body[:400])
        return None


def every(path):
    out, url = [], path + ('&' if '?' in path else '?') + 'limit=200'
    while url:
        r = api('GET', url)
        if not r: break
        out += r['data']; url = r.get('links', {}).get('next')
    return out


def changed(image, file):
    """the uploaded image isn't this file (compared by size, which any new artwork changes), or Apple rejected it"""
    a = image.get('attributes') or {}
    return a.get('fileSize') not in (None, os.path.getsize(file)) or ((a.get('assetDeliveryState') or {}).get('state') == 'FAILED')


def post_with(kind, attrs, parent_kind, parent_id, rel_names, what):
    """POST a resource related to its parent, trying the relationship names Apple might use, in order"""
    for name in rel_names:
        body = {'data': {'type': kind, 'relationships': {name: {'data': {'type': parent_kind, 'id': parent_id}}}}}
        if attrs: body['data']['attributes'] = attrs
        try:
            if DRY: log('  (dry run) POST', kind, name); return {'id': 'dry', 'attributes': {}}
            return request('POST', f'/v1/{kind}', body)['data']
        except ApiError as e:
            if 'RELATIONSHIP.UNKNOWN' in e.body and name != rel_names[-1]: continue
            problems.append(f'{what}: {e.code} {e.body[:400]}'); log('  failed:', what, e.code, e.body[:400]); return None


def all_related(path, names, many=True):
    for name in names:
        try:
            r = request('GET', f'{path}/{name}' + ('?limit=200' if many else ''))
            return r['data'] if isinstance(r.get('data'), list) else ([r['data']] if r.get('data') else [])
        except ApiError as e:
            if e.code == 404: continue
            raise
    return []


def first_related(path, names):
    found = all_related(path, names, many=False)
    return found[0] if found else None


def upload_image(kind, parent_kind, parent_id, rel_names, file, what):
    blob = open(file, 'rb').read()
    img = post_with(kind, {'fileName': os.path.basename(file), 'fileSize': len(blob)}, parent_kind, parent_id, rel_names, what)
    if not img or DRY: return
    upload_parts(blob, img['attributes'].get('uploadOperations'))
    api('PATCH', f'/v1/{kind}/{img["id"]}', {'data': {'type': kind, 'id': img['id'], 'attributes': {'uploaded': True}}}, f'finish {what}')
    log('  image uploaded:', os.path.basename(file))


def languages():
    """[(locale, translations)] from l10n/<locale>.json; English comes from gamecenter.json itself"""
    import glob
    out = []
    for f in sorted(glob.glob(os.path.join(HERE, 'l10n', '*.json'))):
        t = json.load(open(f)); out.append((t['locale'], t.get('gamecenter', {})))
    return out


def report_challenges(did):
    """What App Store Connect holds for each challenge: its versions and their state, and each language's image.
    Printed every run, since this part of the API is new and its relationship names aren't all documented."""
    log('Leaderboard images (English):')
    for lb in every(f'/v1/gameCenterDetails/{did}/gameCenterLeaderboards'):
        for l in every(f"/v1/gameCenterLeaderboards/{lb['id']}/localizations"):
            if l['attributes'].get('locale') != 'en-US': continue
            r = api('GET', f"/v1/gameCenterLeaderboardLocalizations/{l['id']}/gameCenterLeaderboardImage")
            a = ((r or {}).get('data') or {}).get('attributes') or {}
            log(' ', lb['attributes'].get('vendorIdentifier'), json.dumps({'file': a.get('fileName'), 'state': (a.get('assetDeliveryState') or {}).get('state'),
                'errors': (a.get('assetDeliveryState') or {}).get('errors')}))
    log('Challenge report:')
    for c in every(f'/v1/gameCenterDetails/{did}/gameCenterChallenges'):
        vid = c['attributes'].get('vendorIdentifier')
        try:
            versions = request('GET', f"/v1/gameCenterChallenges/{c['id']}/versions?limit=50")['data']
        except ApiError as e:
            log(' ', vid, 'versions: error', e.code); continue
        for v in versions:
            try:
                locs = request('GET', f"/v1/gameCenterChallengeVersions/{v['id']}/localizations?limit=50")['data']
            except ApiError as e:
                locs = []; log('   localizations: error', e.code, e.body[:200])
            log(' ', vid, 'version', v['id'][:8], json.dumps(v.get('attributes')), f'{len(locs)} languages')
            for l in locs[:2] + [x for x in locs if x['attributes'].get('locale') == 'en-US'][:1]:
                for name in ('image', 'gameCenterChallengeImage'):
                    try:
                        r = request('GET', f"/v1/gameCenterChallengeLocalizations/{l['id']}/{name}")
                        d = r.get('data')
                        a = (d or {}).get('attributes') or {}
                        log('   ', l['attributes'].get('locale'), name + ':', 'none' if not d else
                            json.dumps({k: a.get(k) for k in ('fileName', 'fileSize', 'assetDeliveryState', 'imageAsset')})[:300])
                        break
                    except ApiError as e:
                        log('   ', l['attributes'].get('locale'), name + ':', e.code)


def main():
    cfg = json.load(open(os.path.join(HERE, 'gamecenter.json')))
    LANGS = languages()
    app = get_app()
    log('App:', app['attributes']['name'])

    # Game Center for the app
    r = api('GET', f"/v1/apps/{app['id']}/gameCenterDetail")
    detail = r and r.get('data')
    if not detail:
        r = api('POST', '/v1/gameCenterDetails', {'data': {'type': 'gameCenterDetails', 'relationships': {'app': {'data': {'type': 'apps', 'id': app['id']}}}}}, 'turn on Game Center')
        detail = r and r['data']
        log('Game Center turned on for the app')
    if not detail:
        sys.exit('Could not turn on Game Center:\n' + '\n'.join(problems))
    did = detail['id']

    # Leaderboards
    have = {l['attributes']['vendorIdentifier']: l for l in every(f'/v1/gameCenterDetails/{did}/gameCenterLeaderboards')}
    for b in cfg['leaderboards']:
        vid = PREFIX + b['id']
        lb = have.get(vid)
        if not lb:
            r = api('POST', '/v1/gameCenterLeaderboards', {'data': {'type': 'gameCenterLeaderboards', 'attributes': {
                'referenceName': b['name'], 'vendorIdentifier': vid, 'defaultFormatter': b['format'], 'submissionType': b['submission'],
                'scoreSortType': b['sort']}, 'relationships': {'gameCenterDetail': {'data': {'type': 'gameCenterDetails', 'id': did}}}}}, f'leaderboard {vid}')
            if not r: continue
            lb = r['data']; log('Leaderboard created:', vid)
        locs = {l['attributes']['locale']: l for l in every(f"/v1/gameCenterLeaderboards/{lb['id']}/localizations")} if lb['id'] != 'dry' else {}
        for locale, tr in [('en-US', b)] + [(lc, t.get('leaderboards', {}).get(b['id'])) for lc, t in LANGS]:
            if not tr: continue
            loc_attrs = {'name': tr['name'], 'formatterSuffix': tr.get('suffix'), 'formatterSuffixSingular': tr.get('suffix_singular')}
            old = locs.get(locale)          # (not `have`: that's the list of leaderboards)
            if old:
                if any(old['attributes'].get(k) != v for k, v in loc_attrs.items()):
                    api('PATCH', f"/v1/gameCenterLeaderboardLocalizations/{old['id']}", {'data': {'type': 'gameCenterLeaderboardLocalizations', 'id': old['id'], 'attributes': loc_attrs}}, f'{vid} {locale} text')
            else:
                r = api('POST', '/v1/gameCenterLeaderboardLocalizations', {'data': {'type': 'gameCenterLeaderboardLocalizations', 'attributes': dict(loc_attrs, locale=locale),
                    'relationships': {'gameCenterLeaderboard': {'data': {'type': 'gameCenterLeaderboards', 'id': lb['id']}}}}}, f'{vid} {locale} text')
                old = r and r['data']
            # its picture (gamecenter/leaderboard-<id>.png, 1024x1024), in each language, replaced when the file changes
            file = os.path.join(HERE, 'gamecenter', 'leaderboard-' + b['id'] + '.png')
            if old and old['id'] != 'dry' and os.path.exists(file):
                img = api('GET', f"/v1/gameCenterLeaderboardLocalizations/{old['id']}/gameCenterLeaderboardImage")
                if img and img.get('data') and changed(img['data'], file):
                    api('DELETE', f"/v1/gameCenterLeaderboardImages/{img['data']['id']}", what=f"replace image {b['id']} {locale}"); img = None
                if not (img and img.get('data')):
                    upload_image('gameCenterLeaderboardImages', 'gameCenterLeaderboardLocalizations', old['id'], ['gameCenterLeaderboardLocalization'], file, f"{b['id']} {locale} image")
        log('Leaderboard ready:', vid)

    # Achievements
    have = {a['attributes']['vendorIdentifier']: a for a in every(f'/v1/gameCenterDetails/{did}/gameCenterAchievements')}
    total = sum(a['points'] for a in cfg['achievements'])
    if total > 1000: sys.exit(f'Achievements add up to {total} points; Game Center allows 1000')
    for a in cfg['achievements']:
        vid = PREFIX + a['id']
        ach = have.get(vid)
        if not ach:
            r = api('POST', '/v1/gameCenterAchievements', {'data': {'type': 'gameCenterAchievements', 'attributes': {
                'referenceName': a['name'], 'vendorIdentifier': vid, 'points': a['points'], 'showBeforeEarned': True, 'repeatable': False},
                'relationships': {'gameCenterDetail': {'data': {'type': 'gameCenterDetails', 'id': did}}}}}, f'achievement {vid}')
            if not r: continue
            ach = r['data']; log('Achievement created:', vid)
        locs = {l['attributes']['locale']: l for l in every(f"/v1/gameCenterAchievements/{ach['id']}/localizations")} if ach['id'] != 'dry' else {}
        file = os.path.join(HERE, 'gamecenter', a['id'] + '.png')
        for locale, tr in [('en-US', a)] + [(lc, t.get('achievements', {}).get(a['id'])) for lc, t in LANGS]:
            if not tr: continue
            loc_attrs = {'name': tr['name'], 'beforeEarnedDescription': tr['before'], 'afterEarnedDescription': tr['earned']}
            en = locs.get(locale)
            if en:
                if any(en['attributes'].get(k) != v for k, v in loc_attrs.items()):
                    api('PATCH', f"/v1/gameCenterAchievementLocalizations/{en['id']}", {'data': {'type': 'gameCenterAchievementLocalizations', 'id': en['id'], 'attributes': loc_attrs}}, f'{vid} {locale} text')
            else:
                r = api('POST', '/v1/gameCenterAchievementLocalizations', {'data': {'type': 'gameCenterAchievementLocalizations', 'attributes': dict(loc_attrs, locale=locale),
                        'relationships': {'gameCenterAchievement': {'data': {'type': 'gameCenterAchievements', 'id': ach['id']}}}}}, f'{vid} {locale} text')
                en = r and r['data']
            # the image: required for each achievement in each language (512x512 or 1024x1024)
            if en and en['id'] != 'dry':
                img = api('GET', f"/v1/gameCenterAchievementLocalizations/{en['id']}/gameCenterAchievementImage")
                if img and img.get('data') and changed(img['data'], file):          # new artwork: replace it
                    api('DELETE', f"/v1/gameCenterAchievementImages/{img['data']['id']}", what=f"replace image {a['id']} {locale}"); img = None
                if not (img and img.get('data')):
                    upload_image('gameCenterAchievementImages', 'gameCenterAchievementLocalizations', en['id'], ['gameCenterAchievementLocalization'], file, f"{a['id']} {locale} image")
        log('Achievement ready:', vid, f"({a['points']} points)")

    # Challenges: friendly competitions on a leaderboard (iOS 26 and later). A newer part of the API.
    boards = {l['attributes']['vendorIdentifier']: l for l in every(f'/v1/gameCenterDetails/{did}/gameCenterLeaderboards')}
    have_ch = {}
    have_ch = {c['attributes'].get('vendorIdentifier'): c for c in every(f'/v1/gameCenterDetails/{did}/gameCenterChallenges')}
    for c in cfg.get('challenges', []):
        vid, lb = PREFIX + c['id'], boards.get(PREFIX + c['leaderboard'])
        if not lb: log('Challenge', vid, 'skipped: no leaderboard', PREFIX + c['leaderboard']); continue
        ch = have_ch.get(vid)
        if not ch:
            r = api('POST', '/v1/gameCenterChallenges', {'data': {'type': 'gameCenterChallenges', 'attributes': {
                'referenceName': c['name'], 'vendorIdentifier': vid, 'challengeType': 'LEADERBOARD'},
                'relationships': {'gameCenterDetail': {'data': {'type': 'gameCenterDetails', 'id': did}},
                                  'leaderboard': {'data': {'type': 'gameCenterLeaderboards', 'id': lb['id']}}}}}, f'challenge {vid}')
            if not r: continue
            ch = r['data']; log('Challenge created:', vid)
        if ch['id'] == 'dry': continue
        # The English name, description and image live on a version of the challenge: find or make one, then its text
        version = first_related(f"/v1/gameCenterChallenges/{ch['id']}", ['versions', 'gameCenterChallengeVersions'])
        if not version:
            version = post_with('gameCenterChallengeVersions', {}, 'gameCenterChallenges', ch['id'], ['challenge', 'gameCenterChallenge'], f'{vid} version')
        if not version: continue
        locs = {l['attributes'].get('locale'): l for l in all_related(f"/v1/gameCenterChallengeVersions/{version['id']}", ['localizations', 'gameCenterChallengeLocalizations'])}
        for locale, tr in [('en-US', c)] + [(lc, t.get('challenges', {}).get(c['id'])) for lc, t in LANGS]:
            if not tr: continue
            attrs = {'name': tr['name'], 'description': tr['description']}
            en = locs.get(locale)
            if en:
                if any(en['attributes'].get(k) != v for k, v in attrs.items()):
                    api('PATCH', f"/v1/gameCenterChallengeLocalizations/{en['id']}", {'data': {'type': 'gameCenterChallengeLocalizations', 'id': en['id'], 'attributes': attrs}}, f'{vid} {locale} text')
            else:
                en = post_with('gameCenterChallengeLocalizations', dict(attrs, locale=locale), 'gameCenterChallengeVersions', version['id'], ['version', 'gameCenterChallengeVersion'], f'{vid} {locale} text')
            if en and c.get('image'):
                file = os.path.join(HERE, 'gamecenter', c['image'])
                img = first_related(f"/v1/gameCenterChallengeLocalizations/{en['id']}", ['image', 'gameCenterChallengeImage'])
                if img and changed(img, file):          # new artwork: replace it
                    api('DELETE', f"/v1/gameCenterChallengeImages/{img['id']}", what=f'replace image {vid} {locale}'); img = None
                if not img:
                    upload_image('gameCenterChallengeImages', 'gameCenterChallengeLocalizations', en['id'], ['localization', 'gameCenterChallengeLocalization'], file, f'{vid} {locale} image')
        log('Challenge ready:', vid, 'on', PREFIX + c['leaderboard'])

    # (Their order can't be set through the API: Apple allows reading the list only.)
    report_challenges(did)

    # Challenges no longer in gamecenter.json: removed (only possible before they go live)
    wanted = {PREFIX + c['id'] for c in cfg.get('challenges', [])}
    for vid, c in have_ch.items():
        if vid and vid.startswith(PREFIX) and vid not in wanted and api('DELETE', f"/v1/gameCenterChallenges/{c['id']}", what=f'remove challenge {vid}') is not None:
            log('Challenge removed:', vid)

    # Game Center on the version being prepared, so App Review sees it with the build
    vers = api('GET', f"/v1/apps/{app['id']}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED")
    for v in (vers or {}).get('data', []):
        r = api('GET', f"/v1/appStoreVersions/{v['id']}/gameCenterAppVersion")
        if r and r.get('data'):
            log('Version', v['attributes']['versionString'], 'already includes Game Center')
        elif api('POST', '/v1/gameCenterAppVersions', {'data': {'type': 'gameCenterAppVersions', 'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': v['id']}}}}}, 'Game Center on the version'):
            log('Version', v['attributes']['versionString'], 'now includes Game Center')

    if problems:
        log('\nSome steps failed; finish them in App Store Connect → Features → Game Center:')
        for p in problems: log(' -', p)
        sys.exit(1)
    log('Game Center is set up.')


if __name__ == '__main__':
    main()
