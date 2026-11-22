"""App Store Connect API helpers shared by the scripts in ios/store (listing, release, Game Center, creative assets, key check).

Credentials, from the environment: ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8 (the .p8 file's contents) or
ASC_KEY_PATH (its path). Needs PyJWT with cryptography (pip install pyjwt cryptography).
"""
import json, os, sys, time, urllib.error, urllib.request
import jwt

# the app's bundle ID, from the BUNDLE_ID Actions variable (README, "Your own copy")
BUNDLE_ID = os.environ.get('BUNDLE_ID', '').strip()
if not BUNDLE_ID:
    sys.exit('Set BUNDLE_ID (the app\'s bundle ID, a GitHub Actions variable). See ios/README.md.')
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


def all_pages(path, fail=call):
    """Every item of an App Store Connect list, as one response ({"data": [...], "included": [...]}): asks for 200 at a
    time and follows links.next. A list read with call() alone stops at its first page (50 items unless asked), and
    the scripts once missed what was past it (the header art past the library's first 200 images, uploaded again:
    409). testing/parity.js fails a list read that doesn't come through here (ios/store/check_pages.py).
    fail=request raises ApiError instead of exiting, as request() does."""
    url = path if 'limit=' in path else path + ('&' if '?' in path else '?') + 'limit=200'
    out = {'data': [], 'included': []}
    while url:
        page = fail('GET', url)
        d = page.get('data') or []
        out['data'] += d if isinstance(d, list) else [d]          # a to-one relationship answers with one item
        out['included'] += page.get('included') or []
        url = (page.get('links') or {}).get('next')
    return out


def first_page(path):
    """One page of a list, on purpose: a report showing a few recent items, where the rest doesn't matter"""
    return call('GET', path)


def all_pages_or_raise(path):
    """all_pages(), raising ApiError rather than exiting (as request() does)"""
    return all_pages(path, request)


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


def log(*a):
    print(*a, flush=True)


def upload_parts(blob, operations, timeout=120):
    """Send a file's bytes to the upload operations App Store Connect handed back for it"""
    for op in operations or []:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'],
                                     headers={h['name']: h['value'] for h in op['requestHeaders']})
        urllib.request.urlopen(req, timeout=timeout).read()


def app():
    return call('GET', f'/v1/apps?filter[bundleId]={BUNDLE_ID}')['data'][0]
