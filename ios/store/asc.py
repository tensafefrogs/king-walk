"""App Store Connect API helpers shared by upload_listing.py and release.py.

Credentials, from the environment: ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8 (the .p8 file's contents) or
ASC_KEY_PATH (its path). Needs PyJWT with cryptography (pip install pyjwt cryptography).
"""
import json, os, sys, time, urllib.error, urllib.request
import jwt

BUNDLE_ID = 'com.geoffstearns.kingwalk'
API = 'https://api.appstoreconnect.apple.com'


class ApiError(Exception):
    def __init__(self, method, path, code, body):
        super().__init__(f'{method} {path} failed with {code}:\n{body[:2000]}')
        self.code, self.body = code, body


def token():
    key = os.environ.get('ASC_KEY_P8') or open(os.environ['ASC_KEY_PATH']).read()
    now = int(time.time())
    return jwt.encode({'iss': os.environ['ASC_ISSUER_ID'].strip(), 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                      key, algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'].strip(), 'typ': 'JWT'})


def request(method, path, body=None):
    """Like call(), but raises ApiError instead of exiting, for callers that handle failures.
    Reads (GET) are retried when Apple's servers are slow or briefly failing (timeouts, dropped connections, 429, 5xx);
    changes are sent once, since repeating one that did go through could create something twice."""
    tries = 4 if method == 'GET' else 1
    for attempt in range(tries):
        req = urllib.request.Request(path if path.startswith('http') else API + path, method=method,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                text = r.read()
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as e:
            if attempt + 1 < tries and (e.code == 429 or e.code >= 500):
                time.sleep(15 * (attempt + 1)); continue
            raise ApiError(method, path, e.code, e.read().decode()) from None
        except (TimeoutError, ConnectionError, urllib.error.URLError) as e:
            if attempt + 1 < tries:
                print(f'Apple did not answer ({e}); trying again', flush=True)
                time.sleep(15 * (attempt + 1)); continue
            raise


def call(method, path, body=None):
    try:
        return request(method, path, body)
    except ApiError as e:
        sys.exit(str(e))


def patch(kind, id_, attributes=None, relationships=None):
    data = {'type': kind, 'id': id_}
    if attributes: data['attributes'] = attributes
    if relationships: data['relationships'] = relationships
    return call('PATCH', f'/v1/{kind}/{id_}', {'data': data})


def create(kind, attributes=None, relationships=None):
    data = {'type': kind}
    if attributes: data['attributes'] = attributes
    if relationships: data['relationships'] = relationships
    return call('POST', f'/v1/{kind}', {'data': data})['data']


def rel(kind, id_):
    """A to-one relationship value"""
    return {'data': {'type': kind, 'id': id_}}


def app():
    return call('GET', f'/v1/apps?filter[bundleId]={BUNDLE_ID}')['data'][0]
