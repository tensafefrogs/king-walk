#!/usr/bin/env python3
"""King Walk's player report from GoatCounter: who starts, how far they get, the daily puzzle, achievements and rank
streaks, hints and sharing. testing/STATS.md says what each event means.

usage: python3 testing/stats.py [--since 2026-11-10] [--until 2026-11-16] [--days 7] [--app | --web | --both]
  --since/--until  a date range (UTC days, inclusive); default: the last 7 days (--days to change)
  --web, --app     the website (king-walk/...) or the iOS app (king-walk-ios/...); --both (the default) shows them side by side
Needs GOATCOUNTER_TOKEN (GoatCounter > Settings > API, "Read statistics" only) and GOATCOUNTER_URL, the same count address
the website uses (https://<site>.goatcounter.com/count), in the environment.
The achievements are read from ios/store/gamecenter.json, so new ones show up by themselves.
"""
import argparse, datetime, json, os, re, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
PREFIX = {'web': 'king-walk/', 'app': 'king-walk-ios/'}


def fetch(start, end):
    tok = os.environ.get('GOATCOUNTER_TOKEN', '').strip() or sys.exit('Set GOATCOUNTER_TOKEN (see testing/STATS.md).')
    url = os.environ.get('GOATCOUNTER_URL', '').strip() or sys.exit('Set GOATCOUNTER_URL, e.g. https://example.goatcounter.com/count')
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
    g = ap.add_mutually_exclusive_group(); g.add_argument('--web', action='store_true'); g.add_argument('--app', action='store_true'); g.add_argument('--both', action='store_true')
    a = ap.parse_args()
    today = datetime.datetime.now(datetime.timezone.utc).date()
    end = datetime.date.fromisoformat(a.until) if a.until else today
    start = datetime.date.fromisoformat(a.since) if a.since else end - datetime.timedelta(days=a.days - 1)
    cols = ['web'] if a.web else ['app'] if a.app else ['web', 'app']
    raw = fetch(start.isoformat(), (end + datetime.timedelta(days=1)).isoformat())
    c = {k: {e[len(p):]: n for e, n in raw.items() if e.startswith(p)} for k, p in PREFIX.items()}
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
    section('Daily puzzle', [('started', 'daily/start'), ('solved', 'daily/solved', 'daily/start'), ('answer shown', 'daily/missed', 'daily/start'),
        ('left to finish later', 'daily/later', 'daily/start'), ('came back to it', 'daily/resume', 'daily/start'),
        ('done card seen', 'daily/done-card'), ('tried again (practice)', 'daily/practice'), ('shared', 'share/daily', 'daily/solved'),
        ('opened from a shared link', 'link/daily'), ('opened from widget/Siri/etc.', 'open/daily')]
        + [(f'streak reached {n}', f'daily/streak/{n}') for n in (3, 7, 14, 30, 50, 100, 365)]
        + [('freeze earned', 'daily/freeze-earned'), ('freeze used', 'daily/freeze-used')])
    section('Achievements (first time earned)', [(a_['name'], f"award/{a_['id']}") for a_ in gc['achievements']])
    section('Rank streaks', [x for r in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king')
        for x in ((f'{r}: started', f'run/start/{r}'), (f'{r}: cleared', f'run/cleared/{r}', f'run/start/{r}'), (f'{r}: quit', f'run/quit/{r}', f'run/start/{r}'))])
    section('Help (times used; the game counts milestones, not every puzzle, so compare these over time)', [('first hint', 'hint/1'), ('second hint', 'hint/2'), ('answer shown', 'answer')])
    section('Sharing', [('progress', 'share'), ('daily result', 'share/daily'), ('an achievement', 'share/award'), ('placement', 'share/placed')])
    section('Settings and other', [(e, e) for e in ('mode/easy', 'mode/normal', 'mode/hard', 'remind/8', 'remind/12', 'remind/18', 'remind/20', 'remind/off',
        'lefty-on', 'sound-off', 'haptics-off', 'gamecenter', 'rate-ask', 'fold/table', 'fold/book', 'save-code/copy', 'save-code/load', 'icloud/newer', 'reset', 'tip/closed', 'app-promo')])
    print('A % is of what the section title names (new players), or of the first row of its group.')


if __name__ == '__main__':
    main()
