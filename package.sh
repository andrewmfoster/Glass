#!/usr/bin/env bash
# package.sh — assemble the GLASS deliverable (dist/GLASS.zip) with a hard guard
# against leaking absolute home paths from the Ableton rack preset.
#
# The master GLASS.adg (gzipped XML) embeds absolute <Path Value="/Users/.../..."/>
# values pointing at the author's machine. They are harmless to the buyer (Ableton
# falls back to the sibling <RelativePath>), but they leak a username + home layout.
# This script blanks every absolute Path before packaging and ABORTS if any survive,
# so the scrub can never be forgotten on a refresh.
#
# usage:  ./package.sh
#   GLASS_ADG_MASTER=/path/to/GLASS.adg ./package.sh   # override the master location
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="$HERE/dist/GLASS"
ZIP="$HERE/dist/GLASS.zip"
MASTER="${GLASS_ADG_MASTER:-$HOME/Music/Ableton/User Library/My Presets/GLASS.adg}"

[ -f "$MASTER" ] || { echo "ERROR: master preset not found: $MASTER" >&2; exit 1; }
[ -d "$STAGE" ]  || { echo "ERROR: staging dir missing: $STAGE" >&2; exit 1; }

# 1. scrub: gunzip -> blank absolute Path values -> re-gzip into the staging dir
echo "scrubbing $MASTER -> $STAGE/GLASS.adg"
gunzip -c "$MASTER" \
  | sed -E 's|<Path Value="/[^"]*"|<Path Value=""|g' \
  | gzip -c > "$STAGE/GLASS.adg"

# 2. hard guard: refuse to package if any absolute /Users path survived the scrub
if gunzip -c "$STAGE/GLASS.adg" | grep -q 'Value="/Users/'; then
  echo "ABORT: absolute home path still present in scrubbed GLASS.adg" >&2
  exit 1
fi
echo "scrub OK — no absolute paths remain"

# 3. sanity: the other shipped artifacts must already be staged (build outputs)
for f in Glass.amxd GLASS.png README.txt; do
  [ -f "$STAGE/$f" ] || { echo "ERROR: missing staged artifact: $STAGE/$f" >&2; exit 1; }
done

# 4. re-zip the bundle (flat, no parent dir, no macOS cruft)
echo "zipping -> $ZIP"
rm -f "$ZIP"
( cd "$HERE/dist" && zip -rq "$(basename "$ZIP")" "$(basename "$STAGE")" -x '*.DS_Store' )

echo "done: $ZIP"
unzip -l "$ZIP"
