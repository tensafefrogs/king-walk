#!/usr/bin/env bash
# Copies the game into android/app/src/main/assets/web for the app, and writes its config.js from these environment
# variables (GitHub Actions variables in the workflows; all optional):
#   GOATCOUNTER_URL         the GoatCounter count URL for the stats (none sent without it)
#   SITE_URL                the website, for the Support/Privacy/Terms links and the daily's share link
#   ANDROID_APPLICATION_ID  the app's package name, so Share links to its Google Play page
# The service worker isn't needed (the files are in the app) and isn't copied. Run before building.
set -euo pipefail
android=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$android/.." && pwd)
web="$android/app/src/main/assets/web"
rm -rf "$web"
mkdir -p "$web"
cp "$root/index.html" "$root/chess.js" "$root/manifest.webmanifest" "$web/"
cp -R "$root/p" "$root/fonts" "$root/icons" "$root/lang" "$web/"
grep -q 'KingWalkAndroid' "$web/index.html" || { echo "index.html has no Android bridge (window.KingWalkAndroid)"; exit 1; }
python3 - "$web/config.js" <<'PY'
import json, os, sys
cfg = {'goatcounter': os.environ.get('GOATCOUNTER_URL', '').strip(), 'site': os.environ.get('SITE_URL', '').strip(),
       'playId': os.environ.get('ANDROID_APPLICATION_ID', '').strip()}
if cfg['site'] and not cfg['site'].endswith('/'): cfg['site'] += '/'
open(sys.argv[1], 'w').write('/* written by android/scripts/prepare-web.sh */\nwindow.KING_WALK_CONFIG = ' + json.dumps(cfg) + ';\n')
print('config.js:', ', '.join(f"{k}={'set' if v else 'empty'}" for k, v in cfg.items()))
PY
echo "Copied the game to $web ($(du -sh "$web" | cut -f1))"
