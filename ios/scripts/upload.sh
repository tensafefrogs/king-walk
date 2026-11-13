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
printf '%s\n' "$ASC_KEY_P8" > "$key"
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

# The archive is signed "to run locally" (ad hoc, no certificate needed), which still puts the entitlements (iCloud,
# Game Center, the app group the widget shares) into it. The export step then signs it for the App Store with a
# cloud-managed certificate and profiles that Xcode creates through the API key.
# ARCHIVE_SIGNING=automatic signs the archive with automatic signing instead (Xcode makes a development certificate).
if [ "${ARCHIVE_SIGNING:-adhoc}" = automatic ]; then
  signing=(CODE_SIGN_STYLE=Automatic "${auth[@]}")
else
  signing=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO PROVISIONING_PROFILE_SPECIFIER=)
fi
xcodebuild -project ios/KingWalk.xcodeproj -scheme KingWalk -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$tmp/KingWalk.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" KW_BUNDLE_ID="$BUNDLE_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS="\$(inherited) ${KINGWALK_SWIFT_FLAGS:-}" \
  ${MARKETING_VERSION:+MARKETING_VERSION="$MARKETING_VERSION"} \
  "${signing[@]}" archive
echo "--- entitlements in the archive"
codesign -d --entitlements :- "$tmp/KingWalk.xcarchive/Products/Applications/KingWalk.app" 2>/dev/null || true

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

xcodebuild -exportArchive -archivePath "$tmp/KingWalk.xcarchive" -exportOptionsPlist "$tmp/export.plist" \
  -exportPath "$tmp/export" "${auth[@]}"

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
