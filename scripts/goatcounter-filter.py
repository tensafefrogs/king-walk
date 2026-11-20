#!/usr/bin/env python3
"""King Walk's rows from a GoatCounter site export, to import into King Walk's own site (kingwalk.goatcounter.com).

King Walk's stats were on a GoatCounter site shared with other things (geoffstearns.goatcounter.com) until 20 November
2026, and app builds made before then keep sending there until players update. This takes that site's export (Settings
> Export: a zip of JSON-lines tables) and keeps only King Walk's rows: events under king-walk/ (the website) and
king-walk-ios/ (the app), and pages titled "King Walk...". Every stats table is cut to those paths, and the lookup
tables to what they use. Import the result in the kingwalk site (Settings > Export and import) once.

usage: python3 -I scripts/goatcounter-filter.py <export.zip> <out.zip> [--since 2026-11-20]
  --since  only days from then on (UTC): for a later export, so the history already imported isn't added twice
           (the first import, on 20 November 2026, took everything up to then)
Run it with -I: the export is downloaded data, kept out of the script's own folder.
"""
import argparse, collections, json, os, shutil, sys, tempfile, zipfile


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--since', default='')
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='gc-filter-')
    try:
        with zipfile.ZipFile(a.src) as z:
            for m in z.namelist():   # nothing outside the folder it unpacks into
                if m.startswith('/') or '..' in m.split('/'): sys.exit(f'refusing {m!r} in the zip')
            z.extractall(os.path.join(tmp, 'in'))
        src = next(os.path.join(dp) for dp, dn, fn in os.walk(os.path.join(tmp, 'in')) if 'paths.jsonl' in fn)
        name = os.path.basename(src.rstrip('/')).replace('geoffstearns', 'kingwalk-from-geoffstearns')
        out = os.path.join(tmp, 'out', name); os.makedirs(out)
        rd = lambda f: [json.loads(l) for l in open(os.path.join(src, f), encoding='utf-8') if l.strip()]

        def wr(f, rows):
            with open(os.path.join(out, f), 'w', encoding='utf-8') as o:
                for r in rows: o.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')

        def recent(r):   # the stats rows carry a day ("2026-11-20") or an hour ("2026-11-20T05:00:00Z")
            return not a.since or (r.get('day') or r.get('hour') or '')[:10] >= a.since

        paths = rd('paths.jsonl')
        mine = {p['id'] for p in paths if p['path'].startswith(('king-walk/', 'king-walk-ios/')) or (p.get('title') or '').startswith('King Walk')}
        used, kept_paths, counts = collections.defaultdict(set), set(), 0
        for f in sorted(os.listdir(src)):
            if not f.endswith('_stats.jsonl'): continue
            rows = [r for r in rd(f) if r.get('path_id') in mine and recent(r)]
            wr(f, rows)
            for r in rows:
                kept_paths.add(r['path_id'])
                for k, v in r.items():
                    if k.endswith('_id') and k != 'path_id': used[k].add(v)
            if f == 'hit_stats.jsonl': counts = sum(r['count'] for r in rows)
        wr('paths.jsonl', [p for p in paths if p['id'] in kept_paths])
        for f, key in (('refs.jsonl', 'ref_id'), ('browsers.jsonl', 'browser_id'), ('systems.jsonl', 'system_id')):
            wr(f, [r for r in rd(f) if r['id'] in used[key]])
        for f in ('languages.jsonl', 'locations.jsonl', 'info.json'):   # GoatCounter's lists of codes, and the export's details
            if os.path.exists(os.path.join(src, f)): shutil.copy(os.path.join(src, f), os.path.join(out, f))
        with zipfile.ZipFile(a.out, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in sorted(os.listdir(out)): z.write(os.path.join(out, f), os.path.join(name, f))
        print(f'{a.out}: {len(kept_paths)} King Walk paths, {counts} counts' + (f' from {a.since}' if a.since else ''))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
