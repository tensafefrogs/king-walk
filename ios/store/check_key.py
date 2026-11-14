#!/usr/bin/env python3
"""Checks the App Store Connect API key works, and that the app record for BUNDLE_ID exists, before a build.
Prints what's wrong in plain words. Credentials as in asc.py. The release workflow runs it first."""
import os, sys
from asc import ApiError, BUNDLE_ID, request

p8 = os.environ.get('ASC_KEY_P8', '')
if 'BEGIN PRIVATE KEY' not in p8 or 'END PRIVATE KEY' not in p8:
    sys.exit('::error::ASC_KEY_P8 should be the whole .p8 file, including the -----BEGIN PRIVATE KEY----- and '
             '-----END PRIVATE KEY----- lines.')
try:
    apps = request('GET', f'/v1/apps?filter[bundleId]={BUNDLE_ID}')['data']
except ApiError as e:
    if e.code == 401:
        sys.exit('::error::App Store Connect refused the API key (401). Check that ASC_KEY_ID is the Key ID of this '
                 '.p8 file (it is in the file name, AuthKey_<Key ID>.p8), that ASC_ISSUER_ID is the Issuer ID shown above '
                 'the Team Keys list, and that the key has not been revoked.')
    if e.code == 403:
        sys.exit('::error::The API key works but lacks permission (403). It needs the Admin role.')
    raise
except Exception as e:   # a malformed key can't even be used to sign the login token
    sys.exit(f'::error::Could not use ASC_KEY_P8 to sign in ({type(e).__name__}: {e}). Paste the whole .p8 file again.')
if not apps:
    sys.exit(f'::error::The key works, but there is no app with the bundle ID {BUNDLE_ID} in App Store Connect. '
             'Create the app record (ios/README.md, One-time setup), or check the BUNDLE_ID variable.')
print(f"App Store Connect key OK. App: {apps[0]['attributes']['name']} ({apps[0]['id']})")

# Signing needs the developer portal side too (App IDs, certificates, profiles): only Admin keys can create them
try:
    ids = request('GET', f'/v1/bundleIds?filter[identifier]={BUNDLE_ID},{BUNDLE_ID}.widget&include=bundleIdCapabilities')
except ApiError as e:
    sys.exit(f'::error::The key can read App Store Connect but not the developer portal ({e.code}), so Xcode cannot sign. '
             'Use a key with the Admin role (Users and Access → Integrations → Team Keys).')
found = {b['attributes']['identifier']: b for b in ids['data']}
caps = {}
for c in ids.get('included', []):
    caps.setdefault(c['relationships']['bundleId']['data']['id'] if 'relationships' in c and c['relationships'].get('bundleId', {}).get('data') else c['id'].split('_')[0], []).append(c['attributes'].get('capabilityType'))
for ident in (BUNDLE_ID, BUNDLE_ID + '.widget'):
    b = found.get(ident)
    if not b:
        print(f'::warning::No App ID {ident} in the developer portal yet. Automatic signing should register it; if the build fails, add it by hand (ios/README.md).')
    else:
        print(f"App ID {ident}: capabilities {', '.join(sorted(x for x in caps.get(b['id'], []) if x)) or 'none listed'}")
try:
    certs = request('GET', '/v1/certificates?limit=50')['data']
    print('Certificates on the team:', ', '.join(sorted({c['attributes']['certificateType'] for c in certs})) or 'none')
except ApiError as e:
    sys.exit(f'::error::The key cannot list signing certificates ({e.code}). Signing needs a key with the Admin role.')
