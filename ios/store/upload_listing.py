#!/usr/bin/env python3
"""Uploads the App Store listing in listing.json to App Store Connect: app name, subtitle, privacy URL,
category, age rating, the editable version's text and URLs, and the screenshots (replacing any already there).

usage: python3 ios/store/upload_listing.py [--no-screenshots]
Credentials, from the environment: ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8 (the .p8 file's contents)
or ASC_KEY_PATH (its path). Needs PyJWT with cryptography (pip install pyjwt cryptography).

While the app is in review, or live with no new version, App Store Connect locks the listing; the script then
uploads nothing and says so. Run it again (or re-run the workflow) once the version is editable.

Not covered by the API, so done in App Store Connect: App Privacy answers, App Review contact details, and
submitting for review. See listing.md.
"""
import hashlib, json, os, sys, urllib.request
from asc import API, BUNDLE_ID, ApiError, call, patch, request

HERE = os.path.dirname(os.path.abspath(__file__))
REQUIRED = {'APP_IPHONE_67', 'APP_IPAD_PRO_3GEN_129'}


def main():
    listing = json.load(open(os.path.join(HERE, 'listing.json')))
    app = call('GET', f'/v1/apps?filter[bundleId]={BUNDLE_ID}')['data'][0]
    print('App:', app['attributes']['name'], app['id'])

    # App information: the parts that apply to every version
    infos = call('GET', f"/v1/apps/{app['id']}/appInfos")['data']   # the one not yet live, if there are two
    info = next((i for i in infos if i['attributes'].get('appStoreState') != 'READY_FOR_SALE'), infos[0])
    state = info['attributes'].get('appStoreState') or info['attributes'].get('state')
    if state not in (None, 'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'):
        # in review, waiting for release, or live with no new version: App Store Connect locks the listing until
        # the next version is created, so there's nothing to update now. Not an error; run again later.
        print(f'The listing is locked ({state}); nothing uploaded. Run this again once the next version is created.')
        return
    loc = next(l for l in call('GET', f"/v1/appInfos/{info['id']}/appInfoLocalizations")['data'] if l['attributes']['locale'] == 'en-US')
    a = listing['app_info']
    patch('appInfoLocalizations', loc['id'], {'name': a['name'], 'subtitle': a['subtitle'], 'privacyPolicyUrl': a['privacy_policy_url']})
    rel = {'primaryCategory': {'data': {'type': 'appCategories', 'id': a['category']}}}
    for key, sub in zip(['primarySubcategoryOne', 'primarySubcategoryTwo'], a['subcategories']):
        rel[key] = {'data': {'type': 'appCategories', 'id': sub}}
    if a.get('secondary_category'):
        rel['secondaryCategory'] = {'data': {'type': 'appCategories', 'id': a['secondary_category']}}
    patch('appInfos', info['id'], relationships=rel)
    print('App information: name, subtitle, privacy URL, category')

    # Age rating: every question None (or No), except the ones listed in listing.json
    decl = call('GET', f"/v1/appInfos/{info['id']}/ageRatingDeclaration")['data']
    yes_no = {'advertising', 'gambling', 'lootBox', 'messagingAndChat', 'parentalControls', 'ageAssurance', 'unrestrictedWebAccess',
              'userGeneratedContent', 'healthOrWellnessTopics', 'socialMedia', 'socialMediaAgeRestricted'}
    skip = {'kidsAgeBand', 'ageRatingOverride', 'ageRatingOverrideV2', 'koreaAgeRatingOverride', 'gracRatingClassificationNumber',
            'developerAgeRatingInfoUrl'}
    answers = {k: (False if k in yes_no else 'NONE') for k in decl['attributes'] if k not in skip}
    answers.update(listing['age_rating'])
    patch('ageRatingDeclarations', decl['id'], answers)
    print('Age rating: answered', len(answers), 'questions')

    # The version being prepared
    versions = call('GET', f"/v1/apps/{app['id']}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED")['data']
    if not versions:   # nothing to update until the next version is created in App Store Connect; not an error
        print('No version is being prepared, so the version text and screenshots were left as they are.')
        return
    ver = versions[0]
    v = listing['version']
    patch('appStoreVersions', ver['id'], {'copyright': v['copyright']})
    vloc = next(l for l in call('GET', f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data'] if l['attributes']['locale'] == 'en-US')
    patch('appStoreVersionLocalizations', vloc['id'], {'description': v['description'], 'keywords': v['keywords'],
          'promotionalText': v['promotional_text'], 'supportUrl': v['support_url'], 'marketingUrl': v['marketing_url']})
    print('Version', ver['attributes']['versionString'] + ': description, keywords, promotional text, URLs, copyright')
    # App Review notes (App Review Information > Notes); the contact details there are set by hand
    if listing.get('review_notes'):
        try:
            detail = request('GET', f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail")['data']
            request('PATCH', f"/v1/appStoreReviewDetails/{detail['id']}",
                    {'data': {'type': 'appStoreReviewDetails', 'id': detail['id'], 'attributes': {'notes': listing['review_notes']}}})
            print('App Review notes set')
        except ApiError as e:
            print('App Review notes not set:', e)

    if '--no-screenshots' in sys.argv:
        return
    # Screenshots: replace each set with the current files
    sets = {s['attributes']['screenshotDisplayType']: s for s in call('GET', f"/v1/appStoreVersionLocalizations/{vloc['id']}/appScreenshotSets")['data']}
    for display, files in listing['screenshots'].items():
        try:
            if display in sets:
                for shot in call('GET', f"/v1/appScreenshotSets/{sets[display]['id']}/appScreenshots")['data']:
                    call('DELETE', f"/v1/appScreenshots/{shot['id']}")
                set_id = sets[display]['id']
            else:
                set_id = call('POST', '/v1/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': display},
                              'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': vloc['id']}}}}})['data']['id']
            for f in files:
                blob = open(os.path.join(HERE, f), 'rb').read()
                shot = call('POST', '/v1/appScreenshots', {'data': {'type': 'appScreenshots',
                            'attributes': {'fileName': os.path.basename(f), 'fileSize': len(blob)},
                            'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})['data']
                for op in shot['attributes']['uploadOperations']:
                    part = blob[op['offset']:op['offset'] + op['length']]
                    req = urllib.request.Request(op['url'], data=part, method=op['method'],
                                                 headers={h['name']: h['value'] for h in op['requestHeaders']})
                    urllib.request.urlopen(req, timeout=120).read()
                patch('appScreenshots', shot['id'], {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()})
            print('Screenshots:', display, len(files), 'uploaded')
        except Exception as e:
            # the iPhone and iPad sets are required; any others are skipped with a note rather than stopping the release
            if display in REQUIRED: raise
            print('Screenshots:', display, 'skipped:', e)


if __name__ == '__main__':
    main()
