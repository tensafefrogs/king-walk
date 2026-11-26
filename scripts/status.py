#!/usr/bin/env python3
"""Where the app stands in App Store Connect (ios/store/status.md) and its App Store numbers (ios/store/appstats.md)
live on the branch `status`, not on main.

main takes only commits whose tests passed on another branch first, and the App Store release workflow rewrites the
status every 6 hours from GitHub Actions, which can't do that. So the workflow adds a commit to the status branch
instead (it holds only those files, with their history), and main's .gitignore keeps the local copies out.

  python3 scripts/status.py fetch     puts the latest ios/store/status.md and appstats.md in place (to read them, or
                                      before the workflow rewrites them, so unchanged ones aren't committed again)
  python3 scripts/status.py publish   adds them to the status branch when one changed (the workflow); a file not
                                      written this run keeps the branch's copy
"""
import os, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.path.join(ROOT, 'ios', 'store')
BRANCH, NAMES = 'status', ('status.md', 'appstats.md')


def git(*args, input=None, check=True):
    r = subprocess.run(['git', *args], cwd=ROOT, input=input, capture_output=True, text=True)
    if check and r.returncode: sys.exit(f'git {args[0]} failed: {r.stderr.strip()}')
    return r


def latest():
    """the status branch's head and its files ({name: text}), or (None, {}) before the first publish"""
    if git('fetch', '-q', '--depth', '1', 'origin', BRANCH, check=False).returncode: return None, {}
    head = git('rev-parse', 'FETCH_HEAD').stdout.strip()
    out = {}
    for name in NAMES:
        r = git('show', f'{head}:{name}', check=False)
        if not r.returncode: out[name] = r.stdout
    return head, out


def fetch():
    head, files = latest()
    if head is None: print('status: no status branch yet'); return
    for name, text in files.items():
        open(os.path.join(DIR, name), 'w').write(text)
        print(f'status: ios/store/{name} from the', BRANCH, 'branch')


def publish():
    local = {n: open(os.path.join(DIR, n)).read() for n in NAMES if os.path.exists(os.path.join(DIR, n))}
    if not local: sys.exit('Nothing to publish (python3 ios/store/release.py status writes ios/store/status.md)')
    for attempt in range(3):
        head, old = latest()
        files = dict(old, **local)
        if files == old: print('status: unchanged'); return
        blobs = {n: git('hash-object', '-w', '--stdin', input=t).stdout.strip() for n, t in files.items()}
        tree = git('mktree', input=''.join(f'100644 blob {b}\t{n}\n' for n, b in sorted(blobs.items()))).stdout.strip()
        env = ['-c', 'user.name=App Store status', '-c', 'user.email=github-actions[bot]@users.noreply.github.com']
        commit = git(*env, 'commit-tree', tree, *(['-p', head] if head else []), '-m', 'App Store status').stdout.strip()
        if not git('push', '-q', 'origin', f'{commit}:refs/heads/{BRANCH}', check=False).returncode:
            print('status: published to the', BRANCH, 'branch'); return
    sys.exit(f'status: pushing to the {BRANCH} branch failed 3 times')


if __name__ == '__main__':
    {'fetch': fetch, 'publish': publish}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
