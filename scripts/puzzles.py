#!/usr/bin/env python3
"""Splits the puzzles into small files the game downloads one at a time, and writes their list into index.html.

The puzzles come in rating bands of 100 points (p/400 ... p/2400, the band's puzzles in a fixed order: saves, second
tries and the daily puzzle find a puzzle by its band and its place in that order, so the order must never change).
Each band is cut into chunks of CHUNK puzzles, p/<band>/<k>.txt (one tab-separated puzzle per line: id, position,
moves, rating, themes), so a new player downloads about 13 KB (compressed) before the first puzzle rather than a whole
band. Every chunk spans the band's whole rating range, so one chunk is enough to pick from.

index.html gets the line `const PUZZLES = {...};`: each band's puzzle count and a short hash of each chunk. The page
asks for p/<band>/<k>.txt?v=<hash>, and the service worker keeps a chunk until its hash changes: new puzzles reach
players, and nothing else is downloaded again.

Adding puzzles: only at a band's end. A band's first puzzles (as many as testing/puzzles.lock.json says) are what saves,
second tries and the daily puzzle point at, and the app versions already out have their own copy, so they never change
(id, position, moves and rating) or move; parity.js checks. Puzzles after them, and fields after the rating, are free
(the daily only picks from the locked ones: DAILY_SIZES in index.html). --add does it safely.

usage: python3 scripts/puzzles.py                  (reads p/<band>.txt if there, else the chunks already in p/<band>/)
       python3 scripts/puzzles.py --add <file>     also appends the puzzles in <file> (the same tab-separated lines:
                                                   id, position, moves, rating, themes) to the end of the band their
                                                   rating falls in, leaving out ids already in any band
"""
import glob, hashlib, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = os.path.join(ROOT, 'p')
CHUNK = 300

bands = {}
for f in glob.glob(os.path.join(P, '*.txt')):                       # a band as one file: the source
    bands[int(os.path.basename(f)[:-4])] = open(f, encoding='utf-8').read().splitlines()
for d in glob.glob(os.path.join(P, '*/')):                          # or the chunks already made
    b = int(os.path.basename(d.rstrip('/')))
    if b in bands: continue
    files = sorted(glob.glob(os.path.join(d, '*.txt')), key=lambda f: int(os.path.basename(f)[:-4]))
    bands[b] = [l for f in files for l in open(f, encoding='utf-8').read().splitlines()]

if '--add' in sys.argv:
    have = {l.split('\t', 1)[0] for lines in bands.values() for l in lines if l.strip()}
    lo, hi = min(bands), max(bands); added = 0
    for l in open(sys.argv[sys.argv.index('--add') + 1], encoding='utf-8').read().splitlines():
        f = l.split('\t')
        if len(f) < 4 or f[0] in have or not f[3].strip().isdigit(): continue
        b = min(hi, max(lo, int(f[3]) // 100 * 100))
        bands[b].append(l); have.add(f[0]); added += 1
    print(f'added {added} puzzles at the ends of their bands')

listing = {}
for b in sorted(bands):
    lines = [l for l in bands[b] if l.strip()]
    d = os.path.join(P, str(b)); os.makedirs(d, exist_ok=True)
    for old in glob.glob(os.path.join(d, '*.txt')): os.remove(old)
    hashes = []
    for k in range(0, len(lines), CHUNK):
        text = '\n'.join(lines[k:k + CHUNK]) + '\n'
        open(os.path.join(d, f'{k // CHUNK}.txt'), 'w', encoding='utf-8').write(text)
        hashes.append(hashlib.sha256(text.encode()).hexdigest()[:8])
    listing[str(b)] = {'n': len(lines), 'v': hashes}
    single = os.path.join(P, f'{b}.txt')
    if os.path.exists(single): os.remove(single)

page = os.path.join(ROOT, 'index.html')
html = open(page, encoding='utf-8').read()
line = 'const PUZZLES = ' + json.dumps(listing, separators=(',', ':')) + ';'
html, n = re.subn(r'^const PUZZLES = .*;$', lambda m: line, html, count=1, flags=re.M)
assert n == 1, 'index.html has no "const PUZZLES = ...;" line'
open(page, 'w', encoding='utf-8').write(html)
print(f'{sum(v["n"] for v in listing.values())} puzzles in {sum(len(v["v"]) for v in listing.values())} chunks of up to {CHUNK}; index.html updated')
