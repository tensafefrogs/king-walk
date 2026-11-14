#!/usr/bin/env bash
# Copies the game into ios/KingWalk/web for the app bundle, and writes its config.js from these environment
# variables (GitHub Actions variables in the workflows; all optional):
#   GOATCOUNTER_URL  the GoatCounter count URL for the stats (none sent without it)
#   SITE_URL         the website, for Share and the Support/Privacy/Terms links
#   APP_STORE_ID     the app's Apple ID in App Store Connect, so Share links to the App Store page
# The service worker isn't needed (the files are in the app) and isn't copied.
# Run before generating the Xcode project.
set -euo pipefail
ios=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$ios/.." && pwd)
web="$ios/KingWalk/web"
rm -rf "$web"
mkdir -p "$web"
cp "$root/index.html" "$root/chess.js" "$root/lang.js" "$root/manifest.webmanifest" "$web/"
cp -R "$root/p" "$root/fonts" "$root/icons" "$web/"
f="$web/index.html"
grep -q 'messageHandlers.kingwalk' "$f" || { echo "index.html has no app bridge (window.webkit.messageHandlers.kingwalk)"; exit 1; }
python3 - "$web/config.js" <<'PY'
import json, os, sys
cfg = {'goatcounter': os.environ.get('GOATCOUNTER_URL', '').strip(), 'site': os.environ.get('SITE_URL', '').strip(),
       'appStoreId': os.environ.get('APP_STORE_ID', '').strip()}
if cfg['site'] and not cfg['site'].endswith('/'): cfg['site'] += '/'
open(sys.argv[1], 'w').write('/* written by ios/scripts/prepare-web.sh */\nwindow.KING_WALK_CONFIG = ' + json.dumps(cfg) + ';\n')
print('config.js:', ', '.join(f"{k}={'set' if v else 'empty'}" for k, v in cfg.items()))
PY
echo "Copied the game to $web ($(du -sh "$web" | cut -f1))"
