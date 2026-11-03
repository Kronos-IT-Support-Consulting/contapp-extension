#!/usr/bin/env bash
# Generated the Xcode project in safari/ that wraps dist/safari in the macOS app Safari installs extensions from.
# The project is committed and edited since (App Store settings, icons from safari/app-icon.swift, the Romanian app
# window), so this only runs where it does not exist yet; regenerating it would throw those edits away. Needs the full
# Xcode, not only the command line tools. The project points at dist/safari, so ./build.sh picks up source changes.
set -euo pipefail
cd "$(dirname "$0")"

if [ -e "safari/ContApp SPV/ContApp SPV.xcodeproj" ]; then
    echo "safari/ContApp SPV already exists; run ./build.sh and rebuild in Xcode instead." >&2
    exit 1
fi

./build.sh > /dev/null
xcrun safari-web-extension-converter dist/safari \
    --project-location safari \
    --app-name "ContApp SPV" \
    --bundle-identifier ro.contapp.spv \
    --macos-only --swift --no-open --no-prompt --force

team=JGKF87DT24

# The converter names the app's bundle id after the app name (ro.contapp.ContApp-SPV), which the extension's id
# (ro.contapp.spv.Extension) must start with, and targets the macOS it runs on. Safari 18 runs on macOS 13 and later.
project="safari/ContApp SPV/ContApp SPV.xcodeproj/project.pbxproj"
sed -i '' \
    -e 's/PRODUCT_BUNDLE_IDENTIFIER = "ro\.contapp\.ContApp-SPV";/PRODUCT_BUNDLE_IDENTIFIER = ro.contapp.spv;/' \
    -e 's/MACOSX_DEPLOYMENT_TARGET = [0-9.]*;/MACOSX_DEPLOYMENT_TARGET = 13.0;/' \
    "$project"
# Signs with the Apple Developer team (a public id, printed in every signed app) instead of asking in Xcode.
grep -q DEVELOPMENT_TEAM "$project" \
    || sed -i '' "s/\(\([[:space:]]*\)CODE_SIGN_STYLE = Automatic;\)/\1\\
\2DEVELOPMENT_TEAM = $team;/" "$project"
