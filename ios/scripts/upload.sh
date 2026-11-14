#!/usr/bin/env bash
# Archives the app and uploads it to App Store Connect (it shows up in TestFlight after processing).
# Signing is automatic: Xcode uses the App Store Connect API key to create the profiles and a
# cloud-managed distribution certificate, so no certificate needs to be stored anywhere.
# Needs: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 file's contents), APPLE_TEAM_ID, BUNDLE_ID (the app's bundle ID,
# like com.example.kingwalk; the widget gets BUNDLE_ID.widget and the app group group.BUNDLE_ID), BUILD_NUMBER.
# Optional: MARKETING_VERSION (the app version, like 1.0.1; default: project.yml's).
# Run from the repo root after prepare-web.sh and xcodegen.
set -euo pipefail
for v in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID BUNDLE_ID BUILD_NUMBER; do
  [ -n "${!v:-}" ] || { echo "Missing $v. See ios/README.md."; exit 1; }
done
# Pasted secrets often carry a trailing newline or spaces; IDs must be exact
ASC_KEY_ID=$(printf '%s' "$ASC_KEY_ID" | tr -d '[:space:]')
ASC_ISSUER_ID=$(printf '%s' "$ASC_ISSUER_ID" | tr -d '[:space:]')
APPLE_TEAM_ID=$(printf '%s' "$APPLE_TEAM_ID" | tr -d '[:space:]')
BUNDLE_ID=$(printf '%s' "$BUNDLE_ID" | tr -d '[:space:]')
group="group.$BUNDLE_ID"
tmp=${RUNNER_TEMP:-$(mktemp -d)}
key="$tmp/AuthKey_$ASC_KEY_ID.p8"
# Write the key in the standard .p8 layout (64-character lines between the BEGIN and END lines): a key pasted into
# the secret can carry Windows line breaks, spaces or lost wrapping, which Xcode's sign-in rejects.
printf '%s' "$ASC_KEY_P8" | python3 -c '
import re, sys
t = sys.stdin.read()
body = re.sub(r"-----(BEGIN|END) PRIVATE KEY-----", "", t)
body = re.sub(r"[^A-Za-z0-9+/=]", "", body)
print("-----BEGIN PRIVATE KEY-----")
for i in range(0, len(body), 64): print(body[i:i + 64])
print("-----END PRIVATE KEY-----")' > "$key"
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

# The archive is built unsigned (as Spark's is), then its app and widget are signed "to run locally" (ad hoc) here
# with their entitlements: iCloud, Game Center and the app group the widget shares. Xcode's own ad hoc signing isn't
# allowed with the iOS 27.1 SDK, but codesign's is. The export step then signs it for the App Store with a
# cloud-managed certificate and profiles that Xcode creates through the API key, keeping those entitlements (the
# check after the export makes sure). ARCHIVE_SIGNING=automatic signs the archive with automatic signing instead.
if [ "${ARCHIVE_SIGNING:-adhoc}" = automatic ]; then
  signing=(CODE_SIGN_STYLE=Automatic "${auth[@]}")
else
  signing=(CODE_SIGNING_ALLOWED=NO)
fi
xcodebuild -project ios/KingWalk.xcodeproj -scheme KingWalk -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$tmp/KingWalk.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" KW_BUNDLE_ID="$BUNDLE_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS="\$(inherited) ${KINGWALK_SWIFT_FLAGS:-}" \
  ${MARKETING_VERSION:+MARKETING_VERSION="$MARKETING_VERSION"} \
  "${signing[@]}" archive

app_in_archive="$tmp/KingWalk.xcarchive/Products/Applications/KingWalk.app"
if [ "${ARCHIVE_SIGNING:-adhoc}" != automatic ]; then
  # the entitlements, as ios/project.yml lists them, with the team and bundle ID filled in
  cat > "$tmp/app.entitlements" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.developer.ubiquity-kvstore-identifier</key><string>$APPLE_TEAM_ID.$BUNDLE_ID</string>
  <key>com.apple.developer.game-center</key><true/>
  <key>com.apple.security.application-groups</key><array><string>$group</string></array>
</dict></plist>
PLIST
  cat > "$tmp/widget.entitlements" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.application-groups</key><array><string>$group</string></array>
</dict></plist>
PLIST
  # the widget first: the app's signature covers what's inside it
  codesign --force --sign - --entitlements "$tmp/widget.entitlements" "$app_in_archive/PlugIns/KingWalkWidget.appex"
  codesign --force --sign - --entitlements "$tmp/app.entitlements" "$app_in_archive"
fi
echo "--- entitlements in the archive"
codesign -d --entitlements :- "$app_in_archive" 2>/dev/null || true

cat > "$tmp/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

# On failure, show Xcode's own distribution log, which says why (the console only says "Authentication failed")
export_log() {
  for f in $(ls -dt "${TMPDIR:-/tmp}"/*.xcdistributionlogs 2>/dev/null | head -1); do
    echo "--- Xcode distribution log ($f)"
    grep -h -i -E 'error|fail|status|401|403|forbidden|unauthor|team|certificate|profile' "$f"/*.log 2>/dev/null | grep -v -i 'nserror *= *nil' | tail -80
  done
}
xcodebuild -exportArchive -archivePath "$tmp/KingWalk.xcarchive" -exportOptionsPlist "$tmp/export.plist" \
  -exportPath "$tmp/export" "${auth[@]}" || { export_log; exit 1; }

# Check the signed app has its capabilities before it goes to Apple: without them iCloud saves, Game Center and
# the widget's data silently don't work.
ipa=$(ls "$tmp"/export/*.ipa)
rm -rf "$tmp/ipa" && mkdir "$tmp/ipa" && (cd "$tmp/ipa" && unzip -q "$ipa")
app=$(ls -d "$tmp"/ipa/Payload/*.app)
ent=$(codesign -d --entitlements :- "$app" 2>/dev/null || true)
wext=$(codesign -d --entitlements :- "$app/PlugIns/KingWalkWidget.appex" 2>/dev/null || true)
echo "--- app entitlements"; echo "$ent"
missing=""
for e in com.apple.developer.game-center com.apple.developer.ubiquity-kvstore-identifier "$group"; do
  grep -q "$e" <<<"$ent" || missing="$missing $e"
done
grep -q "$group" <<<"$wext" || missing="$missing widget:$group"
if [ -n "$missing" ]; then
  echo "::error::The signed app is missing:$missing. See ios/README.md, One-time setup (App ID capabilities)."
  exit 1
fi

# Now the same export with upload as its destination (the way Xcode itself sends builds)
sed -i '' 's#<string>export</string>#<string>upload</string>#' "$tmp/export.plist"
xcodebuild -exportArchive -archivePath "$tmp/KingWalk.xcarchive" -exportOptionsPlist "$tmp/export.plist" \
  -exportPath "$tmp/upload" "${auth[@]}"
rm -f "$key"
echo "Uploaded build $BUILD_NUMBER. It appears in App Store Connect → TestFlight after processing (usually 5 to 15 minutes)."
