"""stats.py adds GoatCounter sites up, and reads an address ending in @<date> only from that day: after a move, the new
site holds an imported copy of the old site's history, which the old site must not add again. A fake fetch_site stands
in for the API. Prints "ok" (testing/parity.js runs it)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats

asked = []
def fake(url, start, end):
    asked.append((url.split('//')[1].split('.')[0], start, end))
    return {'king-walk/start': 5}
stats.fetch_site = fake
os.environ['GOATCOUNTER_URL'] = 'https://new.goatcounter.com/count https://old.goatcounter.com/count@2026-11-20'
problems = []
c = stats.fetch('2026-11-13', '2026-11-27')          # a range across the move: the old site from its day
if asked != [('new', '2026-11-13', '2026-11-27'), ('old', '2026-11-20', '2026-11-27')] or c['king-walk/start'] != 10: problems.append(('across', asked, c))
asked.clear(); c = stats.fetch('2026-11-06', '2026-11-13')          # before the move: the new site alone (it has the copy)
if asked != [('new', '2026-11-06', '2026-11-13')] or c['king-walk/start'] != 5: problems.append(('before', asked, c))
asked.clear(); os.environ['GOATCOUNTER_URL'] = 'https://new.goatcounter.com/count,https://old.goatcounter.com/count'
c = stats.fetch('2026-11-13', '2026-11-20')          # no date: both read whole, as before
if [a[1] for a in asked] != ['2026-11-13', '2026-11-13'] or c['king-walk/start'] != 10: problems.append(('no date', asked, c))
print('ok' if not problems else problems)
