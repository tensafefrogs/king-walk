#!/usr/bin/env python3
"""The game's videos live outside main's history, so re-recording one doesn't add tens of MB to every clone for good.
They're kept on the branch `media`: one commit holding only the current files, replaced each time (old versions drop out).
media.json on main lists each file with its SHA-256, so main says which versions it goes with, and a change to a video
is a change to media.json (which starts the workflows that use it: the website's press kit, the App Store's app preview).

  python3 scripts/media.py publish    after re-recording (scripts/trailer.js, scripts/sizzle.js): puts the files on
                                      the media branch and updates media.json; then commit media.json and push main
  python3 scripts/media.py fetch      puts the files in place (the workflows do this after checking out; run it before
                                      working on the press kit or the App Store preview)

The files stay at their usual paths (FILES below); .gitignore keeps them out of main.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MANIFEST = os.path.join(ROOT, 'media.json')
BRANCH = 'media'
FILES = ['ios/store/previews/iphone-1.mp4', 'press/king-walk-trailer.mp4', 'press/king-walk-trailer-vertical.mp4',
         'press/king-walk-sizzle.mp4', 'press/king-walk-sizzle-vertical.mp4']


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def git(*args, cwd=ROOT):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def publish():
    missing = [f for f in FILES if not os.path.exists(os.path.join(ROOT, f))]
    if missing: sys.exit('Missing (record or fetch them first): ' + ', '.join(missing))
    remote = git('remote', 'get-url', 'origin')
    with tempfile.TemporaryDirectory() as tmp:
        git('init', '-q', '-b', BRANCH, cwd=tmp)
        for f in FILES:
            os.makedirs(os.path.dirname(os.path.join(tmp, f)), exist_ok=True)
            shutil.copy2(os.path.join(ROOT, f), os.path.join(tmp, f))
        git('add', '-A', cwd=tmp)
        git('-c', 'user.name=King Walk media', '-c', 'user.email=media@users.noreply.github.com', 'commit', '-qm', 'The current videos (scripts/media.py)', cwd=tmp)
        git('push', '-fq', remote, 'HEAD:' + BRANCH, cwd=tmp)
    json.dump({'branch': BRANCH, 'files': {f: sha(os.path.join(ROOT, f)) for f in FILES}}, open(MANIFEST, 'w'), indent=2)
    open(MANIFEST, 'a').write('\n')
    print('Published to the', BRANCH, 'branch; commit media.json and push main')


def fetch():
    want = json.load(open(MANIFEST))['files']
    if all(os.path.exists(os.path.join(ROOT, f)) and sha(os.path.join(ROOT, f)) == h for f, h in want.items()):
        print('media: already in place'); return
    git('fetch', '-q', '--depth', '1', 'origin', BRANCH)
    for f, h in want.items():
        data = subprocess.run(['git', 'show', 'FETCH_HEAD:' + f], cwd=ROOT, check=True, capture_output=True).stdout
        if hashlib.sha256(data).hexdigest() != h:
            sys.exit(f'::error::{f} on the {BRANCH} branch is not the version media.json names: publish again (scripts/media.py)')
        os.makedirs(os.path.dirname(os.path.join(ROOT, f)), exist_ok=True)
        open(os.path.join(ROOT, f), 'wb').write(data)
    print('media: fetched', len(want), 'files')


if __name__ == '__main__':
    {'publish': publish, 'fetch': fetch}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
