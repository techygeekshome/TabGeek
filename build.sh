#!/usr/bin/env bash
# Builds the release packages into dist/.
#   TabGeek.zip          Chrome, Edge, Brave, Opera, Vivaldi (unzip, then Load unpacked)
#   TabGeek-chrome.zip   same files, named for Chrome users
#   TabGeek-edge.zip     same files, named for Edge users
#   TabGeek-firefox.zip  Firefox package (Firefox manifest, files at the root)
set -euo pipefail
cd "$(dirname "$0")"
FILES="background.js popup.html popup.js options.html options.js style.css icons"
OUT=dist; TMP=$(mktemp -d)
mkdir -p "$OUT"
rm -f "$OUT"/TabGeek*.zip

mkdir "$TMP/tabgeek"
cp -r $FILES manifest.json LICENSE "$TMP/tabgeek/"
(cd "$TMP" && zip -qr -X pkg.zip tabgeek)
for n in TabGeek TabGeek-chrome TabGeek-edge; do cp "$TMP/pkg.zip" "$OUT/$n.zip"; done

mkdir "$TMP/ff"
cp -r $FILES LICENSE "$TMP/ff/"
cp manifest.firefox.json "$TMP/ff/manifest.json"
(cd "$TMP/ff" && zip -qr -X ../ff.zip .)
cp "$TMP/ff.zip" "$OUT/TabGeek-firefox.zip"

rm -r "$TMP"
ls -l "$OUT"
