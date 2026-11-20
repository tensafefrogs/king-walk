#!/usr/bin/env python3
"""Uploads the signed bundle (.aab) to Google Play and puts it on a testing track, as android/release.json says:

  version  the version players see (versionName); the build number is the build time (.github/workflows/android.yml)
  upload   false: build only (the bundle is kept with the workflow run, to upload by hand). The first bundle of a new
           app has to be uploaded by hand in Play Console anyway: Google's API only knows the app after that.
  track    internal (up to 100 testers, no review), alpha (closed testing), beta (open testing) or production
  status   draft (Play Console shows the release, a person starts it; the only status Google accepts until the app is
           set up and reviewed), or completed (out to the track's testers at once)
  notes    What's new, in English (Play Console can add other languages)

Needs PLAY_SERVICE_ACCOUNT_JSON (a Google Cloud service account's key, invited in Play Console with release
permissions) and ANDROID_APPLICATION_ID. Nothing here submits to production unless release.json says so.

usage: python3 android/store/play.py app-release.aab
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, '..', 'release.json')))
if not cfg.get('upload'):
    print('android/release.json: upload is false, so the bundle is only kept with this run (Artifacts)')
    sys.exit(0)

from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

pkg = os.environ['ANDROID_APPLICATION_ID'].strip()
info = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '').strip()
if not info: sys.exit('::error::The PLAY_SERVICE_ACCOUNT_JSON secret isn\'t set (android/README.md, Setting up)')
creds = service_account.Credentials.from_service_account_info(json.loads(info), scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)
API = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}'


def ok(r, what):
    if r.status_code >= 300:
        sys.exit(f'::error::{what} failed ({r.status_code}): {r.text[:1500]}')
    return r.json() if r.content else {}


edit = ok(s.post(f'{API}/edits'), 'Starting an edit')['id']
with open(sys.argv[1], 'rb') as f:
    bundle = ok(s.post(f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{pkg}/edits/{edit}/bundles',
                       params={'uploadType': 'media'}, data=f, headers={'Content-Type': 'application/octet-stream'}, timeout=600), 'Uploading the bundle')
code = bundle['versionCode']
release = {'name': f"{cfg['version']} ({code})", 'versionCodes': [str(code)], 'status': cfg.get('status', 'draft')}
if cfg.get('notes'): release['releaseNotes'] = [{'language': 'en-US', 'text': cfg['notes'][:500]}]
track = cfg.get('track', 'internal')
ok(s.put(f'{API}/edits/{edit}/tracks/{track}', json={'track': track, 'releases': [release]}), f'Putting it on the {track} track')
ok(s.post(f'{API}/edits/{edit}:commit'), 'Saving the edit')
print(f"Uploaded {cfg['version']} ({code}) to the {track} track as {release['status']}")
