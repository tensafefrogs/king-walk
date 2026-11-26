"""ios/store/appstats.py against a fake App Store Connect: the first run asks for the analytics reports (once); later runs
add up impressions, page views, first downloads, redownloads and sessions by day from the reports' files (other reports,
other kinds of download and days outside the range left out); the sales reports' units and proceeds count the app itself,
not updates, and a day without a report is empty; without a vendor number the sales part is a note; a report unchanged
but for its time isn't rewritten. Prints "ok" (testing/parity.js runs it)."""
import gzip, os, sys, tempfile, types
sys.modules.setdefault('jwt', types.SimpleNamespace(encode=lambda *a, **k: 'token'))          # no key needed here
os.environ.update(BUNDLE_ID='app.example', ASC_KEY_ID='k', ASC_ISSUER_ID='i', ASC_KEY_P8='p')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ios', 'store'))
import appstats

T = lambda *rows: gzip.compress(('\n'.join('\t'.join(r) for r in rows) + '\n').encode())
state = {'requests': [], 'posts': 0}
FILES = {
    'u-disc': T(['Date', 'Event', 'Counts'], ['2026-11-20', 'Impression', '40'], ['2026-11-20', 'Page view', '9'], ['2026-11-20', 'Tap', '3'],
                ['2026-11-21', 'Impression', '12'], ['2026-11-05', 'Impression', '999']),
    'u-dl': T(['Date', 'Download Type', 'Counts'], ['2026-11-20', 'First-time download', '4'], ['2026-11-20', 'Redownload', '1'],
              ['2026-11-20', 'Auto-update', '50'], ['2026-11-21', 'First-time download', '2']),
    'u-ses': T(['Date', 'Sessions', 'Unique Devices'], ['2026-11-20', '30', '5'], ['2026-11-21', '7', '2']),
    'u-other': T(['Date', 'Counts'], ['2026-11-20', '1000']),
}
def pages(path):
    if path.startswith('/v1/apps?'): return {'data': [{'id': 'app1'}]}
    if path.endswith('/analyticsReportRequests'): return {'data': state['requests']}
    if path.endswith('/reports'):
        return {'data': [{'id': r, 'attributes': {'name': n}} for r, n in [('r-disc', 'App Store Discovery and Engagement Standard'),
                ('r-dl', 'App Downloads Standard'), ('r-ses', 'App Sessions Standard'), ('r-other', 'App Crashes Expanded')]]}
    if '/instances' in path:
        r = path.split('/analyticsReports/')[1].split('/')[0]
        return {'data': [{'id': r + '-1', 'attributes': {'processingDate': '2026-11-20'}}, {'id': r + '-old', 'attributes': {'processingDate': '2026-10-01'}}]}
    if path.endswith('/segments'):
        inst = path.split('/analyticsReportInstances/')[1].split('/')[0]
        if inst.endswith('-old'): raise AssertionError('read an instance outside the range')
        return {'data': [{'attributes': {'url': 'https://files/' + {'r-disc': 'u-disc', 'r-dl': 'u-dl', 'r-ses': 'u-ses', 'r-other': 'u-other'}[inst[:-2]]}}]}
    raise AssertionError(path)
def post(method, path, body):
    assert method == 'POST' and path == '/v1/analyticsReportRequests' and body['data']['attributes']['accessType'] == 'ONGOING'
    state['posts'] += 1; state['requests'] = [{'id': 'req1', 'attributes': {'accessType': 'ONGOING'}}]
    return {'data': {'id': 'req1'}}
SALES = {'2026-11-20': T(['Product Type Identifier', 'Units', 'Developer Proceeds', 'Currency of Proceeds'],
                         ['1', '3', '0.70', 'USD'], ['1F', '1', '0.60', 'EUR'], ['7', '20', '0', 'USD'])}
def download(url, auth=False, accept=None):
    if url.startswith('https://files/'): return gzip.decompress(FILES[url[14:]])
    assert auth and 'salesReports' in url and 'filter[vendorNumber]=V1' in url
    d = url.split('filter[reportDate]=')[1]
    return gzip.decompress(SALES[d]) if d in SALES else None
appstats.all_pages_or_raise, appstats.request, appstats.download = pages, post, download
appstats.OUT = os.path.join(tempfile.mkdtemp(), 'appstats.md')

problems = []
an, notes = appstats.analytics('app1', '2026-11-20', '2026-11-21')          # first run: asks once, nothing yet
if state['posts'] != 1 or an or 'Asked Apple' not in notes[0]: problems.append(('first run', state, an, notes))
an, notes = appstats.analytics('app1', '2026-11-20', '2026-11-21')          # then: the numbers, no second request
want = {'2026-11-20': {'impressions': 40, 'page views': 9, 'downloads': 4, 'redownloads': 1, 'sessions': 30},
        '2026-11-21': {'impressions': 12, 'downloads': 2, 'sessions': 7}}
if state['posts'] != 1 or an != want: problems.append(('analytics', an))
os.environ.pop('ASC_VENDOR_NUMBER', None)
sa, notes = appstats.sales('2026-11-20', '2026-11-21')
if sa or 'ASC_VENDOR_NUMBER' not in notes[0]: problems.append(('no vendor', sa, notes))
os.environ['ASC_VENDOR_NUMBER'] = 'V1'
sa, notes = appstats.sales('2026-11-20', '2026-11-21')
if sa != {'2026-11-20': {'units': 4, 'proceeds': {'USD': 2.1, 'EUR': 0.6}}, '2026-11-21': {'units': 0, 'proceeds': {}, 'none': True}}: problems.append(('sales', sa))
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    appstats.write('2026-11-20', '2026-11-21', an, sa, [], '2026-11-22 00:00 UTC'); first = open(appstats.OUT).read()
    appstats.write('2026-11-20', '2026-11-21', an, sa, [], '2026-11-22 06:00 UTC'); again = open(appstats.OUT).read()
    appstats.write('2026-11-20', '2026-11-21', an, {}, [], '2026-11-22 12:00 UTC'); changed = open(appstats.OUT).read()
if '| 2026-11-20 Fri | 40 | 9 | 4 | 1 | 30 | 4 | 0.60 EUR, 2.10 USD |' not in first or '**52**' not in first: problems.append(('table', first))
if '****' in changed: problems.append(('empty total in bold', changed))
if again != first or changed == first or '12:00' not in changed: problems.append(('rewrite only on change', again == first, changed == first))
print('ok' if not problems else problems)
