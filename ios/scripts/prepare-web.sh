#!/usr/bin/env bash
# Copies the game into ios/KingWalk/web for the app bundle, with the app's changes:
# the analytics script loads over https and doesn't count a page view (the app sends its own events, under king-walk-ios/).
# The service worker isn't needed (the files are in the app) and isn't copied.
# Run before generating the Xcode project.
set -euo pipefail
ios=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$ios/.." && pwd)
web="$ios/KingWalk/web"
rm -rf "$web"
mkdir -p "$web"
cp "$root/index.html" "$root/chess.js" "$root/manifest.webmanifest" "$web/"
cp -R "$root/p" "$root/fonts" "$root/icons" "$web/"
f="$web/index.html"
# perl, not sed: the same command works on macOS and Linux
perl -pi -e 's#<script data-goatcounter="([^"]+)" async src="//gc\.zgo\.at/#<script data-goatcounter="$1" data-goatcounter-settings=\x27{"no_onload":true}\x27 async src="https://gc.zgo.at/#' "$f"
grep -q 'src="https://gc.zgo.at/' "$f" || { echo "Could not point analytics at https in $f"; exit 1; }
grep -q 'no_onload' "$f" || { echo "Could not turn off the page view count in $f"; exit 1; }
grep -q 'messageHandlers.kingwalk' "$f" || { echo "index.html has no app bridge (window.webkit.messageHandlers.kingwalk)"; exit 1; }
echo "Copied the game to $web ($(du -sh "$web" | cut -f1))"
