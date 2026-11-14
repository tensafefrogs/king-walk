#!/usr/bin/env python3
"""Releases the iOS app from ios/release.json, and reports where the app stands in App Store Connect.

usage: python3 ios/store/release.py status
       python3 ios/store/release.py release [--build-number N]
       python3 ios/store/release.py pending
  status   writes ios/store/status.md: versions, App Review, recent builds and TestFlight groups
  release  does what ios/release.json asks (see ios/README.md, "Releasing from the repo"):
           waits for the build to finish processing, gives it to the TestFlight groups (submitting it for beta
           review when a group is external), attaches it to the App Store version (creating the version if needed),
           uploads the listing (upload_listing.py), submits the version for review, and releases it when asked.
           --build-number is the build just uploaded; without it, the newest processed build for the version.
           While another version is in review (or approved and not yet out), the App Store step waits.
  pending  the App Store step that waited, once the other version is out (the workflow runs it every 6 hours)
Credentials as in asc.py. The release workflow (.github/workflows/release.yml) runs both.

Not covered by the API: App Review's messages (Resolution Center) and replies to them, App Privacy answers.
"""
import datetime, json, os, sys, time
from asc import ApiError, app as get_app, call, create, log, patch, rel, request, upload_parts

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
EDITABLE = {'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'}
IN_REVIEW = {'WAITING_FOR_REVIEW', 'IN_REVIEW'}
# on its way through review or release: while one version is here, another can't be created or submitted
BUSY = IN_REVIEW | {'READY_FOR_REVIEW', 'WAITING_FOR_EXPORT_COMPLIANCE', 'ACCEPTED', 'PENDING_APPLE_RELEASE',
                    'PENDING_DEVELOPER_RELEASE', 'PROCESSING_FOR_DISTRIBUTION'}
REJECTED = {'REJECTED', 'METADATA_REJECTED'}


def vstate(v):
    a = v['attributes']
    return a.get('appVersionState') or a.get('appStoreState')


def versions(app_id):
    return call('GET', f'/v1/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=20&include=build')


def builds(app_id, version=None, number=None, limit=10):
    q = f'/v1/builds?filter[app]={app_id}&sort=-uploadedDate&limit={limit}&include=preReleaseVersion,buildBetaDetail'
    if version: q += f'&filter[preReleaseVersion.version]={version}'
    if number: q += f'&filter[version]={number}'
    return call('GET', q)


def included(resp, kind, id_):
    return next((i for i in resp.get('included', []) if i['type'] == kind and i['id'] == id_), None)


# ---------- the build ----------

def wait_for_build(app_id, version, number, minutes=45):
    """The build with this number (or the newest for the version), once Apple has finished processing it."""
    deadline = time.time() + minutes * 60
    while True:
        resp = builds(app_id, version=version, number=number, limit=5)
        b = next(iter(resp['data']), None)
        state = b and b['attributes']['processingState']
        if b and state == 'VALID':
            log(f"Build {b['attributes']['version']} is processed")
            return b
        if b and state in ('FAILED', 'INVALID'):
            sys.exit(f"Build {b['attributes']['version']} failed processing ({state}); check the email from App Store Connect")
        if time.time() > deadline:
            sys.exit(f'Build {number or "(newest)"} for {version} is still not processed after {minutes} minutes')
        log(f'Waiting for build {number or "(newest)"} to process ({state or "not visible yet"})')
        time.sleep(60)


# ---------- TestFlight ----------

def testflight(app_id, build, cfg):
    groups = {g['attributes']['name']: g for g in call('GET', f'/v1/apps/{app_id}/betaGroups?limit=50')['data']}
    notes = cfg.get('whats_new', '').strip()
    if notes:   # "What to Test", shown to testers
        locs = call('GET', f"/v1/builds/{build['id']}/betaBuildLocalizations")['data']
        en = next((l for l in locs if l['attributes']['locale'] == 'en-US'), None)
        if en: patch('betaBuildLocalizations', en['id'], {'whatsNew': notes})
        else: create('betaBuildLocalizations', {'locale': 'en-US', 'whatsNew': notes}, {'build': rel('builds', build['id'])})
        log('TestFlight: What to Test set')
    external = False
    for name in cfg.get('groups', []):
        g = groups.get(name)
        if not g:
            log(f"TestFlight: no group called {name!r} (groups: {', '.join(groups) or 'none'})"); continue
        try:
            request('POST', f"/v1/betaGroups/{g['id']}/relationships/builds", {'data': [{'type': 'builds', 'id': build['id']}]})
            log(f'TestFlight: build added to {name}')
        except ApiError as e:
            if 'internal group' in e.body:
                log(f'TestFlight: {name} gets every build automatically')
            else:
                log(f'TestFlight: could not add the build to {name}: {e.code} {e.body[:300]}')
        external |= not g['attributes'].get('isInternalGroup', False)
    if cfg.get('keep_current_and_next', True):
        prune(app_id, build)
    detail = call('GET', f"/v1/builds/{build['id']}/buildBetaDetail")['data']['attributes'].get('externalBuildState', '')
    if external and detail in ('IN_BETA_TESTING', 'BETA_APPROVED', 'WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW'):
        log(f"TestFlight: beta review not needed ({detail.replace('_', ' ').lower()})")
    elif external:   # external testers need Apple's beta review first (quick, and usually once per version)
        try:
            create('betaAppReviewSubmissions', relationships={'build': rel('builds', build['id'])})
            log('TestFlight: submitted for beta review')
        except SystemExit as e:
            log(f'TestFlight: beta review not submitted (often because it is already submitted or approved): {str(e)[:300]}')


def prune(app_id, build):
    """Expire older TestFlight builds so testers see two: the current one (attached to an App Store version: live,
    in review or being prepared) and this new one. Builds attached to a version are never touched."""
    vr = versions(app_id)
    keep = {build['id']} | {v['relationships']['build']['data']['id'] for v in vr['data']
                            if (v['relationships'].get('build') or {}).get('data')}
    for b in builds(app_id, limit=50)['data']:
        if b['id'] in keep or b['attributes'].get('expired'): continue
        try:
            request('PATCH', f"/v1/builds/{b['id']}", {'data': {'type': 'builds', 'id': b['id'], 'attributes': {'expired': True}}})
            log(f"TestFlight: build {b['attributes']['version']} expired (testers keep current and next)")
        except ApiError as e:
            log(f"TestFlight: could not expire build {b['attributes']['version']}: {e.code}")


# ---------- the App Store ----------

def app_store_version(app_id, version, release_type):
    """The version to submit: the one with this number, else an editable one renamed to it, else a new one."""
    vs = versions(app_id)['data']
    v = next((x for x in vs if x['attributes']['versionString'] == version), None)
    if v: return v
    editable = next((x for x in vs if vstate(x) in EDITABLE), None)
    if editable:
        log(f"App Store: renaming version {editable['attributes']['versionString']} to {version}")
        return patch('appStoreVersions', editable['id'], {'versionString': version})['data']
    log(f'App Store: creating version {version}')
    return create('appStoreVersions', {'platform': 'IOS', 'versionString': version, 'releaseType': release_type},
                  {'app': rel('apps', app_id)})


def open_submission(app_id):
    subs = call('GET', f'/v1/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS'
                       '&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=10')['data']
    return next(iter(subs), None)


def cancel_review(app_id, v):
    s = open_submission(app_id)
    if not s or s['attributes']['state'] not in IN_REVIEW: return
    log('App Store: taking the version out of review to change it')
    patch('reviewSubmissions', s['id'], {'canceled': True})
    for _ in range(20):   # it takes a moment to become editable again
        time.sleep(15)
        if vstate(call('GET', f"/v1/appStoreVersions/{v['id']}")['data']) in EDITABLE: return
    sys.exit('The version did not become editable after leaving review')


def stuck_screenshots(v, fix=False):
    """Name the screenshots App Store Connect hasn't finished processing. With fix, upload each one again: an upload
    can stay at UPLOAD_COMPLETE for good, and deleting it and uploading the same file again is the usual cure."""
    import hashlib
    files = {os.path.basename(p): p for ps in json.load(open(os.path.join(HERE, 'listing.json')))['screenshots'].values() for p in ps}
    for loc in call('GET', f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations")['data']:
        for st in call('GET', f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")['data']:
            shots = call('GET', f"/v1/appScreenshotSets/{st['id']}/appScreenshots")['data']
            order, changed = [x['id'] for x in shots], False
            for sh in shots:
                state = (sh['attributes'].get('assetDeliveryState') or {}).get('state')
                if state == 'COMPLETE': continue
                name = sh['attributes'].get('fileName')
                log(f"  {st['attributes']['screenshotDisplayType']} {name}: {state}",
                    (sh['attributes'].get('assetDeliveryState') or {}).get('errors') or '')
                if not fix or name not in files: continue
                call('DELETE', f"/v1/appScreenshots/{sh['id']}")
                blob = open(os.path.join(HERE, files[name]), 'rb').read()
                new = create('appScreenshots', {'fileName': name, 'fileSize': len(blob)}, {'appScreenshotSet': rel('appScreenshotSets', st['id'])})
                upload_parts(blob, new['attributes']['uploadOperations'])
                patch('appScreenshots', new['id'], {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()})
                order[order.index(sh['id'])] = new['id']; changed = True
                log(f"  {name}: uploaded again")
            if changed:   # back in its place
                call('PATCH', f"/v1/appScreenshotSets/{st['id']}/relationships/appScreenshots",
                     {'data': [{'type': 'appScreenshots', 'id': i} for i in order]})


def submit_for_review(app_id, v):
    s = open_submission(app_id)
    if s and s['attributes']['state'] in IN_REVIEW:
        log(f"App Store: already {s['attributes']['state'].replace('_', ' ').lower()}"); return
    if not s:
        s = create('reviewSubmissions', {'platform': 'IOS'}, {'app': rel('apps', app_id)})
    items = call('GET', f"/v1/reviewSubmissions/{s['id']}/items?include=appStoreVersion")['data']
    if not any((i['relationships'].get('appStoreVersion', {}).get('data') or {}).get('id') == v['id'] for i in items):
        create('reviewSubmissionItems', relationships={'reviewSubmission': rel('reviewSubmissions', s['id']),
                                                      'appStoreVersion': rel('appStoreVersions', v['id'])})
    # screenshots and previews just uploaded are still being processed for a few minutes, and the submission is
    # refused until they're done ("Asset is being processed", "Version is not ready to be submitted yet"): wait and retry
    for attempt in range(30):
        try:
            request('PATCH', f"/v1/reviewSubmissions/{s['id']}",
                    {'data': {'type': 'reviewSubmissions', 'id': s['id'], 'attributes': {'submitted': True}}})
            break
        except ApiError as e:
            if e.code == 409 and ('IN_POST_PROCESSING' in str(e) or 'not ready to be submitted' in str(e)) and attempt < 29:
                if attempt % 6 == 5: stuck_screenshots(v, fix=attempt == 5)   # after 3 minutes, upload a stuck one again
                log('App Store: waiting for uploaded screenshots and previews to finish processing')
                time.sleep(30); continue
            raise
    log(f"App Store: version {v['attributes']['versionString']} submitted for review")


def other_version(app_id, version, states):
    return next((x for x in versions(app_id)['data']
                 if x['attributes']['versionString'] != version and vstate(x) in states), None)


def app_store(app_id, build, cfg):
    version = cfg['version']
    busy = other_version(app_id, version, BUSY)
    if busy:   # the 6-hourly run (pending) carries on once it's through
        log(f"App Store: version {busy['attributes']['versionString']} is {vstate(busy)}, so {version} waits; "
            'it goes ahead on the first 6-hourly run after that version is out of review and released')
        return
    release_type = 'AFTER_APPROVAL' if cfg.get('release') == 'after_approval' else 'MANUAL'
    v = app_store_version(app_id, version, release_type)
    state = vstate(v)
    if state in IN_REVIEW and cfg.get('replace_in_review'):
        cancel_review(app_id, v); state = vstate(call('GET', f"/v1/appStoreVersions/{v['id']}")['data'])
    if state in EDITABLE:
        call('PATCH', f"/v1/appStoreVersions/{v['id']}/relationships/build", {'data': {'type': 'builds', 'id': build['id']}})
        patch('appStoreVersions', v['id'], {'releaseType': release_type})
        log(f"App Store: build {build['attributes']['version']} attached to {version}, release {release_type.lower().replace('_', ' ')}")
        notes = cfg.get('whats_new', '').strip()
        if notes:
            loc = next(l for l in call('GET', f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations")['data']
                       if l['attributes']['locale'] == 'en-US')
            try:
                request('PATCH', f"/v1/appStoreVersionLocalizations/{loc['id']}",
                        {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id'], 'attributes': {'whatsNew': notes}}})
                log("App Store: What's New set")
            except ApiError as e:   # the first version of an app has no What's New
                log(f"App Store: What's New not set ({e.code})")
        if cfg.get('listing', True):   # "listing": false submits without uploading it again (screenshots restart processing)
            import upload_listing
            upload_listing.main()   # text, URLs, age rating, screenshots
        if cfg.get('submit'): submit_for_review(app_id, v)
    else:
        log(f'App Store: version {version} is {state}; left as it is'
            + (' (set "replace_in_review": true to take it out of review and change it)' if state in IN_REVIEW else ''))


def release_now(app_id, version):
    v = next((x for x in versions(app_id)['data'] if x['attributes']['versionString'] == version), None)
    if v and vstate(v) == 'PENDING_DEVELOPER_RELEASE':
        create('appStoreVersionReleaseRequests', relationships={'appStoreVersion': rel('appStoreVersions', v['id'])})
        log(f'App Store: version {version} released')
    elif v:
        log(f'App Store: version {version} is {vstate(v)}, not waiting for release; nothing to release')


# ---------- status ----------

def fmt_time(s):
    if not s: return ''
    t = datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))   # Apple sends some times in Pacific time
    return t.astimezone(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')


def status():
    a = get_app(); app_id = a['id']
    lines = [f"# App Store status: {a['attributes']['name']}", '',
             f"Updated {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `ios/store/release.py status` "
             '(the App Store release workflow, after each release and every 6 hours). Not edited by hand.', '',
             f'App Store page: https://apps.apple.com/app/id{app_id}', '',
             '## Versions', '', '| Version | State | Release | Build |', '| --- | --- | --- | --- |']
    vr = versions(app_id)
    for v in vr['data'][:6]:
        b = (v['relationships'].get('build', {}) or {}).get('data')
        bn = (included(vr, 'builds', b['id']) or {}).get('attributes', {}).get('version', '') if b else ''
        lines.append(f"| {v['attributes']['versionString']} | {vstate(v)} | {v['attributes'].get('releaseType', '')} | {bn} |")
    lines += ['', '## App Review', '']
    subs = call('GET', f'/v1/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS&limit=5')['data']
    if subs:
        lines += ['| State | Submitted |', '| --- | --- |']
        for s in subs:
            lines.append(f"| {s['attributes']['state']} | {fmt_time(s['attributes'].get('submittedDate'))} |")
    else:
        lines.append('No submissions.')
    lines += ['', '## Recent builds', '', '| Build | Version | Processing | Uploaded | TestFlight (external) | Groups |', '| --- | --- | --- | --- | --- | --- |']
    br = builds(app_id, limit=6)
    in_group = {}   # build id -> group names (Apple only lists a group's builds, not a build's groups)
    for g in call('GET', f'/v1/apps/{app_id}/betaGroups?limit=50')['data']:
        try:
            for b in request('GET', f"/v1/betaGroups/{g['id']}/builds?limit=50")['data']:
                in_group.setdefault(b['id'], []).append(g['attributes']['name'])
        except ApiError as e:   # the status shouldn't fail over a column
            log(f"Couldn't list the builds in {g['attributes']['name']}: {e.code}")
    for b in br['data']:
        at = b['attributes']
        pv = (b['relationships'].get('preReleaseVersion', {}) or {}).get('data')
        ver = (included(br, 'preReleaseVersions', pv['id']) or {}).get('attributes', {}).get('version', '') if pv else ''
        bd = (b['relationships'].get('buildBetaDetail', {}) or {}).get('data')
        ext = (included(br, 'buildBetaDetails', bd['id']) or {}).get('attributes', {}).get('externalBuildState', '') if bd else ''
        groups = '' if at.get('expired') else ', '.join(in_group.get(b['id'], []))
        lines.append(f"| {at['version']} | {ver} | {at['processingState']}{' (expired)' if at.get('expired') else ''} | {fmt_time(at.get('uploadedDate'))} | {ext} | {groups} |")
    lines += ['', '## TestFlight groups', '']
    for g in call('GET', f'/v1/apps/{app_id}/betaGroups?limit=50')['data']:
        ga = g['attributes']
        lines.append(f"- {ga['name']}: {'internal' if ga.get('isInternalGroup') else 'external'}"
                     + (', public link on' if ga.get('publicLinkEnabled') else ''))
    out = os.path.join(HERE, 'status.md')
    new = '\n'.join(lines) + '\n'
    same = lambda t: [l for l in t.splitlines() if not l.startswith('Updated ')]
    old = open(out).read() if os.path.exists(out) else ''
    if same(old) != same(new):   # rewrite only when something changed, so the 6-hourly check doesn't commit noise
        open(out, 'w').write(new)
    log(new)


def pending():
    """The 6-hourly run: an App Store step that waited for another version to get through review and release.
    Acts only while this version doesn't exist yet or is still being prepared, so it never resubmits a rejection."""
    cfg = json.load(open(os.path.join(ROOT, 'ios', 'release.json')))
    store = cfg.get('app_store')
    if not store: return
    app_id = get_app()['id']; version = cfg['version']
    v = next((x for x in versions(app_id)['data'] if x['attributes']['versionString'] == version), None)
    if v and vstate(v) != 'PREPARE_FOR_SUBMISSION': return
    if other_version(app_id, version, BUSY): return
    rejected = other_version(app_id, version, REJECTED)
    if rejected:
        log(f"App Store: version {rejected['attributes']['versionString']} was rejected; read App Review's message in "
            f'App Store Connect before {version} goes ahead (then change "note" in ios/release.json to run it)')
        return
    log(f'App Store: the way is clear for {version}')
    app_store(app_id, wait_for_build(app_id, version, None), {'version': version, **store})


def release(build_number):
    cfg = json.load(open(os.path.join(ROOT, 'ios', 'release.json')))
    a = get_app(); app_id = a['id']
    log(f"Release: {json.dumps(cfg)}")
    if cfg.get('release_now'):
        release_now(app_id, cfg['version'])
    if cfg.get('testflight') or cfg.get('app_store'):
        build = wait_for_build(app_id, cfg['version'], build_number)
        if cfg.get('testflight'): testflight(app_id, build, cfg['testflight'])
        if cfg.get('app_store'): app_store(app_id, build, {'version': cfg['version'], **cfg['app_store']})


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['status']:
        status()
    elif args[:1] == ['pending']:
        pending()
    elif args[:1] == ['release']:
        n = args[args.index('--build-number') + 1] if '--build-number' in args else None
        release(n or None)
    else:
        sys.exit(__doc__)
