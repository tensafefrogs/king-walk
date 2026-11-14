#!/usr/bin/env python3
"""App Store creative assets through the App Store Connect Asset Library API (API 4.5): the product page header and
search results art (header/), and app previews (previews/), placed on the version being prepared.

usage: python3 ios/store/creative.py --discover   prints the asset library's reference data (placement types,
                                                  groups and image specs), to see what the API accepts
       python3 ios/store/creative.py              uploads and places what listing.json's "creative" lists
Credentials as in asc.py. See listing.md, "Header and search results" and "App previews".
"""
import json, os, sys, time
from asc import ApiError, app as get_app, call, upload_parts

HERE = os.path.dirname(os.path.abspath(__file__))


def short(o, depth=0):
    """The reference data, without the noise: enough to read placement types, groups and specs."""
    if depth > 6: return '…'
    if isinstance(o, dict): return {k: short(v, depth + 1) for k, v in o.items() if k not in ('links',)}
    if isinstance(o, list): return [short(v, depth + 1) for v in o[:40]] + (['…%d more' % (len(o) - 40)] if len(o) > 40 else [])
    return o


def discover(app_id):
    lib = call('GET', f'/v1/apps/{app_id}/assetLibrary')['data']
    print('Asset library:', lib['id'])
    ref = call('GET', '/v1/appAssetLibraryRefData')
    print(json.dumps(short(ref), indent=1)[:20000])
    # in full: the placement types for creative assets and previews, and what they reference
    want = ('PRODUCT_PAGE_HEADER', 'SEARCH_RESULTS', 'APP_PREVIEW')
    def walk(o, path=''):
        if isinstance(o, dict):
            tid = str(o.get('placementTypeId', '') or o.get('placementType', ''))
            if any(w in tid for w in want): print('FULL', path, json.dumps(o, indent=1))
            for k, v in o.items(): walk(v, path + '/' + k)
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, f'{path}[{i}]')
    walk(ref)
    print('KEYS', json.dumps({k: (list(v.keys()) if isinstance(v, dict) else type(v).__name__) for k, v in
                              (ref['data'][0]['attributes'] if isinstance(ref.get('data'), list) else ref.get('data', {}).get('attributes', {})).items()}))


def upload(lib_id, kind, path, category, name):
    """An image or video in the library with this reference name, uploading it first when it isn't there yet."""
    res = 'appAssetLibraryImages' if kind == 'image' else 'appAssetLibraryVideos'
    rel = 'images' if kind == 'image' else 'videos'
    for a in call('GET', f'/v1/appAssetLibraries/{lib_id}/{rel}?limit=200')['data']:
        if a['attributes'].get('referenceName') != name: continue
        if a['attributes']['state'] not in ('FAILED', 'AWAITING_UPLOAD'):
            print(f'{name}: already in the library ({a["attributes"]["state"]})')
            return a
    blob = open(os.path.join(HERE, path), 'rb').read()
    a = call('POST', f'/v1/{res}', {'data': {'type': res,
             'attributes': {'fileName': os.path.basename(path), 'fileSize': len(blob), 'category': category, 'referenceName': name},
             'relationships': {'assetLibrary': {'data': {'type': 'appAssetLibraries', 'id': lib_id}}}}})['data']
    upload_parts(blob, a['attributes']['uploadOperations'], timeout=300)
    call('PATCH', f'/v1/{res}/{a["id"]}', {'data': {'type': res, 'id': a['id'], 'attributes': {'uploaded': True}}})
    for _ in range(60):   # processing takes a little while
        a = call('GET', f'/v1/{res}/{a["id"]}')['data']
        if a['attributes']['state'] != 'UPLOAD_COMPLETE': break
        time.sleep(10)
    print(f'{name}: uploaded, {a["attributes"]["state"]}', a['attributes'].get('stateDetails') or '')
    return a


def place(loc_id, asset, kind, ptype, group):
    existing = call('GET', f'/v1/appStoreVersionLocalizations/{loc_id}/placements?filter[placementType]={ptype}'
                           f'&filter[placementGroup]={group}&include={kind}')
    for p in existing['data']:
        linked = (p['relationships'].get(kind, {}).get('data') or {}).get('id')
        if linked == asset['id']:
            print(f'{ptype} / {group}: already placed'); return
        call('DELETE', f'/v1/appAssetLibraryPlacements/{p["id"]}')   # one slot: replace what's there
    res = 'appAssetLibraryImages' if kind == 'image' else 'appAssetLibraryVideos'
    call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements',
         'attributes': {'placementType': ptype, 'placementGroup': group},
         'relationships': {kind: {'data': {'type': res, 'id': asset['id']}},
                           'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': loc_id}}}}})
    print(f'{ptype} / {group}: placed')


def main():
    app = get_app()
    if '--discover' in sys.argv:
        return discover(app['id'])
    creative = json.load(open(os.path.join(HERE, 'listing.json'))).get('creative', [])
    if not creative: return
    versions = call('GET', f"/v1/apps/{app['id']}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED")['data']
    if not versions:
        print('No version is being prepared, so the creative assets were left as they are.'); return
    loc = next(l for l in call('GET', f"/v1/appStoreVersions/{versions[0]['id']}/appStoreVersionLocalizations")['data']
               if l['attributes']['locale'] == 'en-US')
    lib = call('GET', f"/v1/apps/{app['id']}/assetLibrary")['data']['id']
    for c in creative:   # {"file", "kind": image|video, "category", "name", "placements": [[type, group], ...]}
        try:
            a = upload(lib, c['kind'], c['file'], c['category'], c['name'])
            for ptype, group in c['placements']:
                place(loc['id'], a, c['kind'], ptype, group)
        except (ApiError, SystemExit) as e:   # a new API: report and carry on rather than stop a release
            print(f"{c['name']}: not placed: {e}")


if __name__ == '__main__':
    main()
