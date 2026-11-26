#!/usr/bin/env python3
"""App Store numbers for King Walk: how many people saw the app on the App Store, opened its page, downloaded it, used it,
and bought it, day by day. Writes ios/store/appstats.md, which the App Store release workflow adds to the `status` branch
beside status.md every 6 hours (python3 scripts/status.py fetch puts both in place).

Two sources, both read with the App Store Connect API key (credentials as in asc.py; the key has the Admin role):
- Analytics Reports: impressions, product page views, downloads by kind, sessions. Apple makes these only for an app
  that has asked for them, so the first run asks (an ONGOING report request, kept from then on); Apple then fills them a
  day or two later, and each day's numbers arrive about a day after it ends. They count only people who share analytics
  with developers, and Apple leaves out very small numbers, so they run lower than the sales report.
- Sales and Trends: units (purchases of the paid app, all of them) and proceeds, from the daily summary sales report.
  Needs the vendor number (App Store Connect > Payments and Financial Reports, top left) in the ASC_VENDOR_NUMBER
  Actions variable; without it this part is skipped with a note.

  python3 ios/store/appstats.py [--days 14]
testing/appstats-fake.py runs it against a fake API (testing/parity.js runs that).
"""
import argparse, csv, datetime, gzip, io, os, sys, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc import API, ApiError, BUNDLE_ID, all_pages_or_raise, request, token

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'appstats.md')
# Apple's report names, and what the table calls each count
REPORTS = {'App Store Discovery and Engagement Standard': 'discovery', 'App Downloads Standard': 'downloads',
           'App Sessions Standard': 'sessions'}
DOWNLOAD_UNITS = {'1', '1F', '1T', 'F1'}          # sales report product types that are the app itself (not updates)


def download(url, auth=False, accept=None):
    """a report file's bytes, unzipped. Apple's segment links are pre-signed (no key); the sales report needs the key.
    None when there's no report for that day (404)."""
    headers = {'Authorization': 'Bearer ' + token()} if auth else {}
    if accept: headers['Accept'] = accept
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404: return None
        raise ApiError('GET', url.split('?')[0], e.code, e.read().decode(errors='replace')) from None
    return gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data


def rows(tsv):
    return list(csv.DictReader(io.StringIO(tsv.decode('utf-8-sig')), delimiter='\t'))


def app_id():
    apps = all_pages_or_raise(f'/v1/apps?filter[bundleId]={BUNDLE_ID}')['data']
    if not apps: sys.exit(f'No app with the bundle ID {BUNDLE_ID} in App Store Connect')
    return apps[0]['id']


def report_request(app):
    """the app's ONGOING analytics report request, made on the first run; (id, made now)"""
    for r in all_pages_or_raise(f'/v1/apps/{app}/analyticsReportRequests')['data']:
        if r['attributes'].get('accessType') == 'ONGOING' and not r['attributes'].get('stoppedDueToInactivity'):
            return r['id'], False
    made = request('POST', '/v1/analyticsReportRequests', {'data': {
        'type': 'analyticsReportRequests', 'attributes': {'accessType': 'ONGOING'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})
    return made['data']['id'], True


def analytics(app, first, last):
    """{date: {key: count}} from the analytics reports, and notes"""
    req, made = report_request(app)
    if made: return {}, ['Asked Apple for the analytics reports just now: they start in a day or two.']
    days, notes = {}, []
    for rep in all_pages_or_raise(f'/v1/analyticsReportRequests/{req}/reports')['data']:
        kind = REPORTS.get(rep['attributes'].get('name'))
        if not kind: continue
        instances = all_pages_or_raise(f'/v1/analyticsReports/{rep["id"]}/instances?filter[granularity]=DAILY')['data']
        instances = [i for i in instances if first <= i['attributes'].get('processingDate', '') <= last]
        if not instances: notes.append(f'No {rep["attributes"]["name"]} days yet.')
        for inst in instances:
            for seg in all_pages_or_raise(f'/v1/analyticsReportInstances/{inst["id"]}/segments')['data']:
                data = download(seg['attributes']['url'])
                for r in rows(data or b''):
                    d = r.get('Date', '')
                    if not first <= d <= last: continue
                    day = days.setdefault(d, {})
                    if kind == 'sessions':
                        day['sessions'] = day.get('sessions', 0) + int(float(r.get('Sessions') or 0))
                        continue
                    n = int(float(r.get('Counts') or 0))
                    what = (r.get('Event') if kind == 'discovery' else r.get('Download Type')) or ''
                    key = {'impression': 'impressions', 'page view': 'page views', 'first-time download': 'downloads',
                           'redownload': 'redownloads'}.get(what.strip().lower())
                    if key: day[key] = day.get(key, 0) + n
    return days, notes


def sales(first, last):
    """{date: {'units': n, 'proceeds': {currency: amount}}} from the daily sales reports, and notes"""
    vendor = os.environ.get('ASC_VENDOR_NUMBER', '').strip()
    if not vendor:
        return {}, ['Sales and Trends skipped: set the ASC_VENDOR_NUMBER Actions variable (App Store Connect > Payments '
                    'and Financial Reports, the number at the top left).']
    days, d = {}, datetime.date.fromisoformat(first)
    while d.isoformat() <= last:
        q = (f'{API}/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY'
             f'&filter[version]=1_1&filter[vendorNumber]={vendor}&filter[reportDate]={d.isoformat()}')
        data = download(q, auth=True, accept='application/a-gzip')
        day = days.setdefault(d.isoformat(), {'units': 0, 'proceeds': {}})
        if data is None: day['none'] = True          # no sales that day, or not ready yet
        for r in rows(data or b''):
            if r.get('Product Type Identifier', '').strip() not in DOWNLOAD_UNITS: continue
            units = int(float(r.get('Units') or 0)); day['units'] += units
            cur = r.get('Currency of Proceeds', '').strip() or '?'
            day['proceeds'][cur] = round(day['proceeds'].get(cur, 0) + units * float(r.get('Developer Proceeds') or 0), 2)
        d += datetime.timedelta(days=1)
    return days, []


def write(first, last, an, sa, notes, now):
    cols = [('impressions', 'Impressions'), ('page views', 'Page views'), ('downloads', 'First downloads'),
            ('redownloads', 'Redownloads'), ('sessions', 'Sessions')]
    lines = ['# App Store numbers: King Walk', '',
             f'Updated {now} by `ios/store/appstats.py` (the App Store release workflow, every 6 hours). Not edited by hand.',
             '', 'Analytics counts only people who share analytics with developers, so they run low; Units are every '
             'purchase (Sales and Trends). Recent days fill in a day or two late.', '',
             '| Day | ' + ' | '.join(c[1] for c in cols) + ' | Units | Proceeds |',
             '| --- |' + ' ---: |' * (len(cols) + 2)]
    total = {k: 0 for k, _ in cols}; units = 0; money = {}
    d = datetime.date.fromisoformat(last)
    while d.isoformat() >= first:
        k = d.isoformat(); a = an.get(k, {}); s = sa.get(k)
        for c, _ in cols: total[c] += a.get(c, 0)
        cells = [str(a[c]) if c in a else '' for c, _ in cols]
        if s:
            units += s['units']
            for cur, v in s['proceeds'].items(): money[cur] = round(money.get(cur, 0) + v, 2)
        u = '' if not s else str(s['units'])
        p = '' if not s else ', '.join(f'{v:.2f} {cur}' for cur, v in sorted(s['proceeds'].items()))
        lines.append(f'| {k} {d.strftime("%a")} | ' + ' | '.join(cells) + f' | {u} | {p} |')
        d -= datetime.timedelta(days=1)
    lines.append('| **Total** | ' + ' | '.join(f'**{total[c]}**' for c, _ in cols) + f' | {f"**{units}**" if sa else ""} | '
                 + ', '.join(f'**{v:.2f} {cur}**' for cur, v in sorted(money.items())) + ' |')
    if notes: lines += [''] + [f'- {n}' for n in notes]
    text = '\n'.join(lines) + '\n'
    try: was = open(OUT).read()          # the last one (scripts/status.py fetch): unchanged but the time, keep it
    except OSError: was = ''
    same = lambda t: [l for l in t.splitlines() if not l.startswith('Updated ')]
    if same(was) != same(text): open(OUT, 'w').write(text)
    print(text)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--days', type=int, default=14); a = ap.parse_args()
    today = datetime.datetime.now(datetime.timezone.utc).date()
    last = (today - datetime.timedelta(days=1)).isoformat(); first = (today - datetime.timedelta(days=a.days)).isoformat()
    app = app_id()
    notes = []
    try: an, n = analytics(app, first, last); notes += n
    except ApiError as e: an = {}; notes.append(f'Analytics reports failed: {str(e).splitlines()[0]}')
    try: sa, n = sales(first, last); notes += n
    except ApiError as e: sa = {}; notes.append(f'Sales and Trends failed: {str(e).splitlines()[0]}')
    write(first, last, an, sa, notes, datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))


if __name__ == '__main__':
    main()
