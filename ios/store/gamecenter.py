#!/usr/bin/env python3
"""Sets up Game Center in App Store Connect from gamecenter.json: turns Game Center on for the app, creates the
leaderboards and achievements that aren't there yet (with their English names, descriptions and achievement images
from gamecenter/), and adds Game Center to the version being prepared. What's already there is left alone, except
that names and descriptions are brought up to date.

usage: python3 ios/store/gamecenter.py [--dry-run]
Credentials as in asc.py. The App Store listing workflow runs it when gamecenter.json or the images change.

Ids: the page reports short names (index.html: achieve() and reportProgress()); the app adds the prefix "kingwalk."
(ios/KingWalk/GameCenter.swift). Points can't be changed once an achievement is live, and an achievement or
leaderboard can't be deleted once live, so get them right before the first release.
If a step fails here (a new part of Apple's API), it says so; the same can be done by hand in App Store Connect →
the app → Features → Game Center (see listing.md, "Game Center").
"""
import hashlib, json, os, sys, urllib.request
from asc import ApiError, app as get_app, request

HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = 'kingwalk.'
DRY = '--dry-run' in sys.argv
problems = []


def log(*a):
    print(*a, flush=True)


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


def upload_image(kind, loc_id, rel_name, file):
    blob = open(file, 'rb').read()
    r = api('POST', f'/v1/{kind}', {'data': {'type': kind, 'attributes': {'fileName': os.path.basename(file), 'fileSize': len(blob)},
            'relationships': {rel_name: {'data': {'type': rel_name + 's', 'id': loc_id}}}}}, f'image {os.path.basename(file)}')
    if not r or DRY: return
    img = r['data']
    for op in img['attributes'].get('uploadOperations') or []:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'],
                                     headers={h['name']: h['value'] for h in op['requestHeaders']})
        urllib.request.urlopen(req, timeout=120).read()
    api('PATCH', f'/v1/{kind}/{img["id"]}', {'data': {'type': kind, 'id': img['id'], 'attributes': {'uploaded': True}}}, f'finish image {file}')
    log('  image uploaded:', os.path.basename(file))


def main():
    cfg = json.load(open(os.path.join(HERE, 'gamecenter.json')))
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
        loc_attrs = {'name': b['name'], 'formatterSuffix': b.get('suffix'), 'formatterSuffixSingular': b.get('suffix_singular')}
        locs = every(f"/v1/gameCenterLeaderboards/{lb['id']}/localizations") if lb['id'] != 'dry' else []
        en = next((l for l in locs if l['attributes']['locale'] == 'en-US'), None)
        if en:
            if any(en['attributes'].get(k) != v for k, v in loc_attrs.items()):
                api('PATCH', f"/v1/gameCenterLeaderboardLocalizations/{en['id']}", {'data': {'type': 'gameCenterLeaderboardLocalizations', 'id': en['id'], 'attributes': loc_attrs}}, f'{vid} English text')
        else:
            api('POST', '/v1/gameCenterLeaderboardLocalizations', {'data': {'type': 'gameCenterLeaderboardLocalizations', 'attributes': dict(loc_attrs, locale='en-US'),
                'relationships': {'gameCenterLeaderboard': {'data': {'type': 'gameCenterLeaderboards', 'id': lb['id']}}}}}, f'{vid} English text')
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
        loc_attrs = {'name': a['name'], 'beforeEarnedDescription': a['before'], 'afterEarnedDescription': a['earned']}
        locs = every(f"/v1/gameCenterAchievements/{ach['id']}/localizations") if ach['id'] != 'dry' else []
        en = next((l for l in locs if l['attributes']['locale'] == 'en-US'), None)
        if en:
            if any(en['attributes'].get(k) != v for k, v in loc_attrs.items()):
                api('PATCH', f"/v1/gameCenterAchievementLocalizations/{en['id']}", {'data': {'type': 'gameCenterAchievementLocalizations', 'id': en['id'], 'attributes': loc_attrs}}, f'{vid} English text')
        else:
            r = api('POST', '/v1/gameCenterAchievementLocalizations', {'data': {'type': 'gameCenterAchievementLocalizations', 'attributes': dict(loc_attrs, locale='en-US'),
                    'relationships': {'gameCenterAchievement': {'data': {'type': 'gameCenterAchievements', 'id': ach['id']}}}}}, f'{vid} English text')
            en = r and r['data']
        # the image: required for each achievement (512x512 or 1024x1024)
        if en and en['id'] != 'dry':
            img = api('GET', f"/v1/gameCenterAchievementLocalizations/{en['id']}/gameCenterAchievementImage")
            if not (img and img.get('data')):
                upload_image('gameCenterAchievementImages', en['id'], 'gameCenterAchievementLocalization', os.path.join(HERE, 'gamecenter', a['id'] + '.png'))
        elif DRY:
            log('  (dry run) image', a['id'] + '.png')
        log('Achievement ready:', vid, f"({a['points']} points)")

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
