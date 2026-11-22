#!/usr/bin/env python3
"""Where the app stands in App Store Connect (ios/store/status.md) lives on the branch `status`, not on main.

main takes only commits whose tests passed on another branch first, and the App Store release workflow rewrites the
status every 6 hours from GitHub Actions, which can't do that. So the workflow adds a commit to the status branch
instead (it holds only status.md, with its history), and main's .gitignore keeps the local copy out.

  python3 scripts/status.py fetch     puts the latest ios/store/status.md in place (to read it, or before the
                                      release workflow rewrites it, so an unchanged status isn't committed again)
  python3 scripts/status.py publish   adds ios/store/status.md to the status branch when it changed (the workflow)
"""
import os, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOCAL = os.path.join(ROOT, 'ios', 'store', 'status.md')
BRANCH, NAME = 'status', 'status.md'


def git(*args, input=None, check=True):
    r = subprocess.run(['git', *args], cwd=ROOT, input=input, capture_output=True, text=True)
    if check and r.returncode: sys.exit(f'git {args[0]} failed: {r.stderr.strip()}')
    return r


def latest():
    """the status branch's head and its status.md, or (None, None) before the first publish"""
    if git('fetch', '-q', '--depth', '1', 'origin', BRANCH, check=False).returncode: return None, None
    head = git('rev-parse', 'FETCH_HEAD').stdout.strip()
    return head, git('show', f'{head}:{NAME}').stdout


def fetch():
    head, text = latest()
    if head is None: print('status: no status branch yet'); return
    open(LOCAL, 'w').write(text)
    print('status: ios/store/status.md from the', BRANCH, 'branch')


def publish():
    if not os.path.exists(LOCAL): sys.exit('No ios/store/status.md to publish (python3 ios/store/release.py status writes it)')
    text = open(LOCAL).read()
    for attempt in range(3):
        head, old = latest()
        if old == text: print('status: unchanged'); return
        blob = git('hash-object', '-w', '--stdin', input=text).stdout.strip()
        tree = git('mktree', input=f'100644 blob {blob}\t{NAME}\n').stdout.strip()
        env = ['-c', 'user.name=App Store status', '-c', 'user.email=github-actions[bot]@users.noreply.github.com']
        commit = git(*env, 'commit-tree', tree, *(['-p', head] if head else []), '-m', 'App Store status').stdout.strip()
        if not git('push', '-q', 'origin', f'{commit}:refs/heads/{BRANCH}', check=False).returncode:
            print('status: published to the', BRANCH, 'branch'); return
    sys.exit(f'status: pushing to the {BRANCH} branch failed 3 times')


if __name__ == '__main__':
    {'fetch': fetch, 'publish': publish}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
