#!/usr/bin/env python3
"""release.py against a pretend App Store Connect, through random sequences of what happens around a release.

Only the parts behind past bugs are modelled: TestFlight builds of several versions (uploads, processing, expiry) and a
version's review submission while its new screenshots are still processing. The real release.py runs; its `asc`
module is replaced by the pretend one below, which keeps state the way App Store Connect does and refuses what it
refuses. After every step:
  - every version's newest build is still there (not expired), so a version queued for the App Store always has a
    build to submit (05a1059: a TestFlight-only upload of 1.0.4 expired the queued 1.0.3 build)
  - a submission started while screenshots are processing gets through once they're done, rather than failing the run
    (78036b6: adding the version to the submission was refused with ASSET_IN_POST_PROCESSING and the run stopped)

  python3 ios/store/release_model.py [runs, default 300]          (seconds; parity.js runs it)
  python3 ios/store/release_model.py --code <dir>                 the release.py in another checkout (to show a past bug)

Stdlib only, so no new dependency: a seeded random walk, as testing/daily-model.js does for the game.
"""
import importlib.util, json, os, random, re, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))


class ApiError(Exception):
    def __init__(self, method, path, code, body):
        super().__init__(f'{method} {path} failed with {code}:\n{body}')
        self.code, self.body = code, body


class Store:
    """App Store Connect as far as the model needs it"""
    def __init__(self):
        self.builds, self.versions, self.subs, self.items = [], {}, {}, {}
        self.processing = 0          # sleeps until the screenshots just uploaded are processed
        self.clock, self.next_id = 0, 0

    def nid(self, kind):
        self.next_id += 1
        return f'{kind}{self.next_id}'

    def upload(self, version):
        self.clock += 1
        b = {'id': self.nid('b'), 'version': version, 'at': self.clock, 'expired': False}
        self.builds.append(b)
        return b

    def as_build(self, b):
        return {'type': 'builds', 'id': b['id'], 'attributes': {'version': str(b['at']), 'expired': b['expired'], 'processingState': 'VALID',
                'uploadedDate': f"2026-11-{10 + b['at'] // 24:02d}T{b['at'] % 24:02d}:00:00Z"},
                'relationships': {'preReleaseVersion': {'data': {'type': 'preReleaseVersions', 'id': 'pre' + b['version']}},
                                  'buildBetaDetail': {'data': None}}}

    def handle(self, method, path, body=None):
        p, _, q = path.partition('?')
        query = dict(kv.split('=', 1) for kv in q.split('&') if '=' in kv)
        if method == 'GET' and p == '/v1/builds':
            bs = sorted(self.builds, key=lambda b: -b['at'])
            if 'filter[preReleaseVersion.version]' in query: bs = [b for b in bs if b['version'] == query['filter[preReleaseVersion.version]']]
            bs = bs[:int(query.get('limit', 50))]
            return {'data': [self.as_build(b) for b in bs],
                    'included': [{'type': 'preReleaseVersions', 'id': 'pre' + v, 'attributes': {'version': v}} for v in {b['version'] for b in bs}]}
        if method == 'GET' and re.fullmatch(r'/v1/apps/[^/]+/appStoreVersions', p):
            return {'data': [{'type': 'appStoreVersions', 'id': vid, 'attributes': {'versionString': v['version'], 'appStoreState': v['state']},
                              'relationships': {'build': {'data': {'type': 'builds', 'id': v['build']} if v['build'] else None}}}
                             for vid, v in self.versions.items()]}
        m = re.fullmatch(r'/v1/builds/([^/]+)', p)
        if method == 'PATCH' and m:
            b = next(b for b in self.builds if b['id'] == m[1])
            b['expired'] = bool(body['data']['attributes'].get('expired'))
            return {'data': self.as_build(b)}
        if method == 'GET' and p == '/v1/reviewSubmissions':
            return {'data': [{'type': 'reviewSubmissions', 'id': sid, 'attributes': {'state': s}} for sid, s in self.subs.items()
                             if s in query.get('filter[state]', s).split(',')]}
        if method == 'POST' and p == '/v1/reviewSubmissions':
            sid = self.nid('s'); self.subs[sid] = 'READY_FOR_REVIEW'; self.items[sid] = []
            return {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'state': 'READY_FOR_REVIEW'}}}
        m = re.fullmatch(r'/v1/reviewSubmissions/([^/]+)/items', p)
        if method == 'GET' and m:
            return {'data': [{'type': 'reviewSubmissionItems', 'id': f'i{n}', 'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}
                             for n, vid in enumerate(self.items[m[1]])]}
        if method == 'POST' and p == '/v1/reviewSubmissionItems':
            if self.processing: raise ApiError(method, path, 409, '{"errors":[{"code":"ENTITY_ERROR","detail":"ASSET_IN_POST_PROCESSING"}]}')
            r = body['data']['relationships']
            self.items[r['reviewSubmission']['data']['id']].append(r['appStoreVersion']['data']['id'])
            return {'data': {'type': 'reviewSubmissionItems', 'id': self.nid('i')}}
        m = re.fullmatch(r'/v1/reviewSubmissions/([^/]+)', p)
        if method == 'PATCH' and m:
            if self.processing: raise ApiError(method, path, 409, 'Version is not ready to be submitted yet')
            if not self.items[m[1]]: raise ApiError(method, path, 409, 'nothing to submit')
            self.subs[m[1]] = 'WAITING_FOR_REVIEW'
            for vid in self.items[m[1]]: self.versions[vid]['state'] = 'WAITING_FOR_REVIEW'
            return {'data': {'type': 'reviewSubmissions', 'id': m[1]}}
        raise AssertionError(f'the model has no {method} {path}')


def load_release(code_dir, store):
    """the real release.py from code_dir, with the pretend App Store Connect in place of asc"""
    asc = types.ModuleType('asc')
    def request(method, path, body=None): return store.handle(method, path, body)
    def call(method, path, body=None):
        try: return store.handle(method, path, body)
        except ApiError as e: raise SystemExit(str(e))
    def all_pages(path, fail=call): return fail('GET', path)
    def create(kind, attributes=None, relationships=None):
        data = {'type': kind, **({'attributes': attributes} if attributes else {}), **({'relationships': relationships} if relationships else {})}
        return call('POST', f'/v1/{kind}', {'data': data})['data']
    asc.__dict__.update(ApiError=ApiError, request=request, call=call, all_pages=all_pages, all_pages_or_raise=lambda p: all_pages(p, request),
                        first_page=lambda p: call('GET', p), create=create, rel=lambda k, i: {'data': {'type': k, 'id': i}},
                        patch=lambda *a, **k: None, log=lambda *a: None, upload_parts=lambda *a, **k: None, app=lambda: {'id': 'app1'})
    sys.modules['asc'] = asc
    sys.path.insert(0, os.path.join(code_dir, 'ios', 'store'))
    try:
        spec = importlib.util.spec_from_file_location('release_under_test', os.path.join(code_dir, 'ios', 'store', 'release.py'))
        rel = importlib.util.module_from_spec(spec); spec.loader.exec_module(rel)
    finally:
        sys.path.pop(0)
    def sleep(_):          # a wait in release.py: time passes, processing gets on
        store.processing = max(0, store.processing - 1)
    rel.time = types.SimpleNamespace(sleep=sleep, time=lambda: 0)
    rel.stuck_screenshots = lambda v, fix=False: None
    return rel


def run(seed, code_dir):
    r, store = random.Random(seed), Store()
    rel, trail = load_release(code_dir, store), []
    versions = ['1.0.3', '1.0.4', '1.0.5']
    for step in range(25):
        a = r.choice(['upload', 'upload', 'upload', 'queue', 'screenshots', 'submit'])
        v = r.choice(versions)
        trail.append(f'{a} {v}')
        try:
            if a == 'upload':          # a build of v reaches TestFlight; the release step expires older ones (prune)
                rel.prune('app1', {'id': store.upload(v)['id']})
            elif a == 'queue':          # v waits for its App Store step behind another version, with no build attached yet
                if not any(x['version'] == v for x in store.versions.values()):
                    store.versions[store.nid('v')] = {'version': v, 'state': 'PREPARE_FOR_SUBMISSION', 'build': None}
            elif a == 'screenshots':          # the listing upload: new screenshots, processing for a few minutes
                store.processing = r.randint(1, 8)
            elif a == 'submit':          # v's App Store step: its newest build attached, then the submission
                vid = next((k for k, x in store.versions.items() if x['version'] == v and x['state'] == 'PREPARE_FOR_SUBMISSION'), None)
                if vid:
                    live = [b for b in store.builds if b['version'] == v and not b['expired']]
                    if not any(b['version'] == v for b in store.builds): continue          # no build yet: the step waits for one
                    if not live: return seed, f'{v} is queued for the App Store, but none of its builds is left to submit', trail
                    store.versions[vid]['build'] = max(live, key=lambda b: b['at'])['id']
                    try:
                        rel.submit_for_review('app1', {'id': vid, 'attributes': {'versionString': v}})
                    except (ApiError, SystemExit) as e:
                        return seed, f'the submission of {v} failed instead of waiting: {str(e).splitlines()[0]} {str(e)[-60:]}', trail
        except AssertionError:
            raise
        # every version's newest build is still there
        for ver in {b['version'] for b in store.builds}:
            newest = max((b for b in store.builds if b['version'] == ver), key=lambda b: b['at'])
            queued = any(x['version'] == ver and x['state'] == 'PREPARE_FOR_SUBMISSION' for x in store.versions.values())
            if newest['expired'] and queued:
                return seed, f'{ver} is queued for the App Store, but its newest build was expired', trail
    return None


def main():
    args = sys.argv[1:]
    code_dir = os.path.join(HERE, '..', '..')
    if '--code' in args:
        i = args.index('--code'); code_dir = args[i + 1]; del args[i:i + 2]
    runs = int(args[0]) if args else 300
    for seed in range(1, runs + 1):
        bad = run(seed, code_dir)
        if bad:
            seed, what, trail = bad
            print(f'FAIL {what} (seed {seed})\n  steps: ' + ', '.join(trail))
            print(f'{runs} runs: a rule broke'); sys.exit(1)
    print(f'{runs} runs of 25 steps: every rule held')


if __name__ == '__main__':
    main()
