#!/usr/bin/env python3
"""Fails on an App Store Connect list read that stops at its first page.

A GET of a list (a path ending in a plural collection, such as /v1/apps/{id}/betaGroups) sent with call() or
request() returns one page: 50 items unless asked, 200 at most. The scripts here missed what was past it more than
once (creative.py, 644dd9f; the listing's languages, 9a4bf4c). Read lists with asc.all_pages(path), which follows
links.next, or sort them and take the newest few on purpose (a path with sort=).

testing/parity.js runs this. Reads found before the check that haven't moved yet are listed in check_pages.baseline
("file: collection"); the list can only shrink: a new one fails, and so does one that's listed but gone.

  python3 ios/store/check_pages.py
"""
import ast, glob, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE = os.path.join(HERE, 'check_pages.baseline')


def literal(node):
    """the path's text, with each {expression} as {}"""
    if isinstance(node, ast.Constant) and isinstance(node.value, str): return node.value
    if isinstance(node, ast.JoinedStr):
        return ''.join(v.value if isinstance(v, ast.Constant) else '{}' for v in node.values)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a, b = literal(node.left), literal(node.right)
        return None if a is None or b is None else a + b
    if isinstance(node, ast.IfExp): return literal(node.body)          # 'a' + ('?limit=200' if many else ''): the first
    return None


def collection(path):
    """the list a path reads, or None for one item (/v1/builds/{}), a to-one relationship (/buildBetaDetail) or a path
    that isn't known here"""
    segs = path.split('?')[0].rstrip('/').split('/')
    seg = segs[-1]
    if seg == '{}' and len(segs) > 3 and segs[-2] == '{}' and segs[-3] != 'v1': return '{relationship}'   # /kind/{id}/{name}: named at run time
    return seg if seg and seg[0].islower() and seg.endswith('s') and '{' not in seg else None


def problems():
    found = []
    for f in sorted(glob.glob(os.path.join(HERE, '*.py'))):
        name = os.path.basename(f)
        if name in ('asc.py', 'check_pages.py'): continue
        for node in ast.walk(ast.parse(open(f).read(), f)):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ('call', 'request')): continue
            if len(node.args) < 2 or not (isinstance(node.args[0], ast.Constant) and node.args[0].value == 'GET'): continue
            path = literal(node.args[1])
            if path is None or 'sort=' in path: continue
            c = collection(path)
            if c: found.append((f'{name}: {c}', node.lineno))
    return found


def main():
    found = problems()
    allowed = [l.strip() for l in open(BASELINE) if l.strip() and not l.startswith('#')] if os.path.exists(BASELINE) else []
    left = list(allowed)
    new = []
    for key, line in found:
        if key in left: left.remove(key)
        else: new.append(f'{key.split(":")[0]}:{line} reads the list {key.split(": ")[1]} with call() or request(), which stops at '
                         'its first page: use asc.all_pages(path), which follows links.next (or sort= and take the newest few on purpose)')
    stale = [f'{k}: listed in ios/store/check_pages.baseline but no longer read that way: take it out of the list' for k in left]
    for p in new + stale: print(p)
    sys.exit(1 if new or stale else 0)


if __name__ == '__main__':
    main()
