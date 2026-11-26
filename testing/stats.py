#!/usr/bin/env python3
"""King Walk's player report from GoatCounter: who starts, how far they get, the daily puzzle, achievements and rank
streaks, hints and sharing. testing/STATS.md says what each event means.

usage: python3 testing/stats.py [--since 2026-11-10] [--until 2026-11-16] [--days 7] [--app | --testflight | --android | --web | --both]
  --since/--until  a date range (UTC days, inclusive); default: the last 7 days (--days to change)
  --web, --app, --testflight, --android  the website (king-walk/...), the iOS app from the App Store (king-walk-ios/...),
                   the iOS app from TestFlight (king-walk-testflight/..., from 1.0.5; before, in the app's counts) or the
                   Android app (king-walk-android/...); --both (the default) shows them side by side, TestFlight and
                   Android once they have any counts
Needs GOATCOUNTER_TOKEN (GoatCounter > Settings > API, "Read statistics" only) and GOATCOUNTER_URL, the same count address
the website uses (https://<site>.goatcounter.com/count), in the environment. After moving to a new GoatCounter site, list
both addresses (new then old, a space between): app versions built before the move keep sending to the old one, and
their counts are added together. Once the old site's history is imported into the new one, give the old address the first
day not imported (<old address>@2026-11-20), so the imported days aren't counted twice. In a cloud session the token can be the network secret for each host instead (set
GOATCOUNTER_TOKEN=proxy-injected).
The achievements are read from ios/store/gamecenter.json, so new ones show up by themselves.
"""
import argparse, datetime, json, os, re, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
PREFIX = {'web': 'king-walk/', 'app': 'king-walk-ios/', 'testflight': 'king-walk-testflight/', 'android': 'king-walk-android/'}


def fetch(start, end):
    """Every event's count over the days, added up over the GoatCounter sites in GOATCOUNTER_URL (spaces or commas
    between them): after a move to a new site, app versions already out still send to the old one. An address can end in
    @<date> (https://old.goatcounter.com/count@2026-11-20): that site is read only from that day, the first day not
    imported into the new site, so imported history isn't counted twice."""
    url = os.environ.get('GOATCOUNTER_URL', '').strip() or sys.exit('Set GOATCOUNTER_URL, e.g. https://example.goatcounter.com/count')
    counts = {}
    for one in re.split(r'[\s,]+', url):
        one, _, since = one.partition('@')
        lo = max(start, since) if since else start          # ISO dates compare as text
        if lo >= end: continue          # the whole range is before this site's first day
        for path, n in fetch_site(one, lo, end).items(): counts[path] = counts.get(path, 0) + n
    return counts


def fetch_site(url, start, end):
    tok = os.environ.get('GOATCOUNTER_TOKEN', '').strip() or sys.exit('Set GOATCOUNTER_TOKEN (see testing/STATS.md).')
    base = re.sub(r'/count/?$', '', url.rstrip('/')) + '/api/v0/stats/hits'
    counts, seen = {}, []
    while True:   # the API pages 100 paths at a time; exclude the ones already read
        q = f'{base}?start={start}&end={end}&limit=100' + ('&exclude_paths=' + ','.join(map(str, seen)) if seen else '')
        for attempt in range(4):   # GoatCounter limits how fast you can ask: wait and retry
            try:
                d = json.load(urllib.request.urlopen(urllib.request.Request(q, headers={'Authorization': 'Bearer ' + tok}), timeout=30)); break
            except (urllib.error.URLError, ConnectionError):
                if attempt == 3: raise
                time.sleep(2 * (attempt + 1))
        time.sleep(0.5)
        for h in d['hits']:
            counts[h['path']] = h['count']; seen.append(h['path_id'])
        if not d.get('more'):
            return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since'); ap.add_argument('--until'); ap.add_argument('--days', type=int, default=7)
    g = ap.add_mutually_exclusive_group(); g.add_argument('--web', action='store_true'); g.add_argument('--app', action='store_true'); g.add_argument('--android', action='store_true'); g.add_argument('--testflight', action='store_true'); g.add_argument('--both', action='store_true')
    a = ap.parse_args()
    today = datetime.datetime.now(datetime.timezone.utc).date()
    end = datetime.date.fromisoformat(a.until) if a.until else today
    start = datetime.date.fromisoformat(a.since) if a.since else end - datetime.timedelta(days=a.days - 1)
    raw = fetch(start.isoformat(), (end + datetime.timedelta(days=1)).isoformat())
    c = {k: {e[len(p):]: n for e, n in raw.items() if e.startswith(p)} for k, p in PREFIX.items()}
    cols = (['web'] if a.web else ['app'] if a.app else ['android'] if a.android else ['testflight'] if a.testflight
            else ['web', 'app'] + [k for k in ('testflight', 'android') if c[k]])
    gc = json.load(open(os.path.join(ROOT, 'ios', 'store', 'gamecenter.json')))
    print(f'King Walk, {start} to {end} (UTC)\n')
    print(f"  {'':<34}" + '  '.join(f'{k:>7}      ' for k in cols) + '\n')

    def row(label, ev, of=None):
        cells = []
        for k in cols:
            n = c[k].get(ev, 0)
            base = c[k].get(of, 0) if of else 0
            cells.append(f'{n:>7}' + (f' {n / base:>5.0%}' if of and base else '      ' if of else ''))
        print(f'  {label:<34}' + '  '.join(cells))

    def section(title, rows):
        print(f'{title}')
        for r in rows: row(*r)
        print()

    section('Players', [('new players', 'start')] + [(f'  on {p}', f'platform/{p}', 'start') for p in
        sorted({e.split('/', 1)[1] for k in cols for e in c[k] if e.startswith('platform/')})]
        + [(f'  in {l}', f'lang/{l}', 'start') for l in sorted({e.split('/', 1)[1] for k in cols for e in c[k] if e.startswith('lang/')})]
        + [(f'  wanted {l} (not in the game)', f'lang-wanted/{l}', 'start') for l in sorted({e.split('/', 1)[1] for k in cols for e in c[k] if e.startswith('lang-wanted/')})])
    section('Coming back (of new players)', [(f'after {d}', f'back/{d}', 'start') for d in ('1d', '7d', '30d')])
    section('How far they get (of new players)', [(f'played {n}', f'played/{n}', 'start') for n in (1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500)])
    section('Ranks reached (of new players)', [(r, f'rank/{r}', 'start') for r in ('knight', 'bishop', 'rook', 'queen', 'king')])
    section('Placed at (of new players)', [(r, f'placed/{r}', 'start') for r in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king')])
    section('Daily puzzle', [('started', 'daily/start'), ('solved', 'daily/solved', 'daily/start'), ('answer shown', 'daily/missed', 'daily/start'), ('  after a move or hint', 'daily/missed/tried', 'daily/missed'), ('  without trying', 'daily/missed/untried', 'daily/missed'), ('  started as a first puzzle', 'daily/start/new-player', 'daily/start'),
        ('left to finish later', 'daily/later', 'daily/start'), ('came back to it', 'daily/resume', 'daily/start'),
        ('done card seen', 'daily/done-card'), ('tried again (practice)', 'daily/practice'), ('shared', 'share/daily', 'daily/solved'),
        ('opened from a shared link', 'link/daily'), ('opened from widget/Siri/etc.', 'open/daily')]
        + [(f'streak reached {n}', f'daily/streak/{n}') for n in (3, 7, 14, 30, 50, 100, 365)]
        + [('freeze earned', 'daily/freeze-earned'), ('freeze used', 'daily/freeze-used')])
    section('Achievements (first time earned)', [(a_['name'], f"award/{a_['id']}") for a_ in gc['achievements']])
    section('Rank streaks', [x for r in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king')
        for x in ((f'{r}: started', f'run/start/{r}'), (f'{r}: cleared', f'run/cleared/{r}', f'run/start/{r}'), (f'{r}: quit', f'run/quit/{r}', f'run/start/{r}'))])
    section('Spaced repetition (reviews finished, by step: 0 is the 1-day review, 4 the 30-day one)',
            [(f'step {k}: {w}', f'review/{w}/{k}') for k in range(5) for w in ('up', 'same', 'reset', 'learned') if w != 'learned' or k == 4])
    section('Help (times used; the game counts milestones, not every puzzle, so compare these over time)', [('first hint', 'hint/1'), ('second hint', 'hint/2'), ('answer shown', 'answer')])
    section('Sharing', [('progress', 'share'), ('daily result', 'share/daily'), ('an achievement', 'share/award'), ('placement', 'share/placed')])
    section('Settings and other', [(e, e) for e in ('mode/easy', 'mode/normal', 'mode/hard', 'remind/8', 'remind/12', 'remind/18', 'remind/20', 'remind/off',
        'lefty-on', 'sound-off', 'haptics-off', 'gamecenter', 'rate-ask', 'fold/table', 'fold/book', 'save-code/copy', 'save-code/load', 'icloud/newer', 'reset', 'tip/closed', 'app-promo')])
    print('A % is of what the section title names (new players), or of the first row of its group.')


if __name__ == '__main__':
    main()
