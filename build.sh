#!/usr/bin/env bash
# Writes dist/chrome, dist/firefox and dist/safari from the same sources and zips the first two.
# Firefox MV3 wants background.scripts, and AMO rejects new add-ons without data_collection_permissions.
# Safari only installs an extension wrapped in a macOS app, so dist/safari is the input of safari.sh, not a download.
set -euo pipefail
cd "$(dirname "$0")"

version=$(jq -r '.version' manifest.json)

rm -rf dist
for target in chrome firefox safari; do
    mkdir -p "dist/$target/icons"
    cp background.js content.js "dist/$target/"
    # Only the PNGs the manifest references; the SVG sources stay in the repository.
    cp icons/*.png "dist/$target/icons/"
done

# Release builds only run on production hosts; the local contapp.test entries stay in the source manifest for development.
production='.content_scripts[].matches |= map(select(test("\\.test/") | not))'

# The SPV replies the extension hands to the ContApp page carry the certificate holder's CNP, CUIs and tax
# documents, which ContApp then stores: Firefox shows that as data collection in its install prompt (Firefox 140+).
firefox='.background = {scripts: ["background.js"]} | del(.minimum_chrome_version)
    | .browser_specific_settings.gecko.data_collection_permissions = {required: ["personallyIdentifyingInfo", "financialAndPaymentInfo"]}'

jq "$production | del(.browser_specific_settings)" manifest.json > dist/chrome/manifest.json
jq "$production | $firefox" manifest.json > dist/firefox/manifest.json
# Safari has no load-unpacked: it always runs dist/safari, so SAFARI_DEV=1 keeps the contapp.test hosts there.
# Never ship a Safari app built that way.
safari_hosts=$production
[ "${SAFARI_DEV:-}" = 1 ] && safari_hosts='.'
# Safari runs each SPV request inside an ANAF tab (see fetchInAnafTab in background.js), which takes scripting, and
# closes the tab it opened for that with an alarm.
jq "$safari_hosts | del(.minimum_chrome_version) | .permissions += [\"scripting\", \"alarms\"] | .browser_specific_settings = {safari: {strict_min_version: \"18.0\"}}" \
    manifest.json > dist/safari/manifest.json

# Reproducible archives: the same commit gives byte-identical zips on any machine. Every entry gets the commit
# time (SOURCE_DATE_EPOCH outside a git checkout, else 1980-01-02, the earliest safe zip date), fixed modes,
# a sorted order, and no extra attributes (-X). zip stores local time, so everything runs in UTC.
export TZ=UTC
epoch=$(git log -1 --format=%ct 2>/dev/null || true)
epoch=${epoch:-${SOURCE_DATE_EPOCH:-315619200}}
# GNU date takes -d @epoch, BSD/macOS date takes -r epoch; touch -t reads the result the same way on both.
stamp=$(date -u -d "@$epoch" +%Y%m%d%H%M.%S 2>/dev/null || date -u -r "$epoch" +%Y%m%d%H%M.%S)

for target in chrome firefox; do
    archive="dist/contapp-spv-$target-$version.zip"
    (
        cd "dist/$target"
        find . -name .DS_Store -delete
        find . -type d -exec chmod 755 {} +
        find . -type f -exec chmod 644 {} +
        find . -exec touch -h -t "$stamp" {} +
        { find . -mindepth 1 -type d | sed 's|$|/|'; find . -type f; } \
            | sed 's|^\./||' | LC_ALL=C sort | zip -qX "../$(basename "$archive")" -@
    )
    echo "$archive"
done
