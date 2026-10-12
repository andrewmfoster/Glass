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
#   GLASS_STAGE=/path/to/GLASS ./package.sh            # override the staging dir; the zip lands beside it
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="${GLASS_STAGE:-$HERE/dist/GLASS}"
ZIP="$(dirname "$STAGE")/GLASS.zip"
MASTER="${GLASS_ADG_MASTER:-$HOME/Music/Ableton/User Library/My Presets/GLASS.adg}"

[ -f "$MASTER" ] || { echo "ERROR: master preset not found: $MASTER" >&2; exit 1; }
[ -d "$STAGE" ]  || { echo "ERROR: staging dir missing: $STAGE" >&2; exit 1; }

# 0. sanity: the other shipped artifacts must already be staged (build outputs)
for f in Glass.amxd GLASS.png README.txt; do
  [ -f "$STAGE/$f" ] || { echo "ERROR: missing staged artifact: $STAGE/$f" >&2; exit 1; }
done

# 0b. the staged device must be the script's build: the amxd is binary, the script inside is text
WANT="$(grep -o -m1 'BUILD = "[^"]*"' "$HERE/glass.jsui.js" || true)"
HAVE="$(grep -a -o -m1 'BUILD = "[^"]*"' "$STAGE/Glass.amxd" || true)"
if [ -z "$WANT" ] || [ "$WANT" != "$HAVE" ]; then
  echo "ABORT: staged Glass.amxd is not the script's build" >&2
  echo "  glass.jsui.js: ${WANT:-no BUILD found}" >&2
  echo "  Glass.amxd:    ${HAVE:-no BUILD found}" >&2
  exit 1
fi
# same BUILD is not proof: the amxd must hold this exact script, byte for byte
python3 -c 'import sys; sys.exit(open(sys.argv[1],"rb").read() not in open(sys.argv[2],"rb").read())' \
  "$HERE/glass.jsui.js" "$STAGE/Glass.amxd" \
  || { echo "ABORT: staged Glass.amxd does not hold this glass.jsui.js (re-freeze the device)" >&2; exit 1; }
echo "build OK: $WANT"

# 1. scrub: gunzip -> blank absolute Path values -> re-gzip into the staging dir
echo "scrubbing $MASTER -> $STAGE/GLASS.adg"
gunzip -c "$MASTER" \
  | sed -E 's|<Path Value="/[^"]*"|<Path Value=""|g' \
  | gzip -c > "$STAGE/GLASS.adg"

# 2. hard guard: refuse to package if any absolute /Users path survived the scrub.
# found PATTERN FILE: true on a hit, false on none; a grep error aborts, so a failed scan never passes.
found() {
  local rc=0
  grep -a -q "$1" "$2" || rc=$?
  [ "$rc" -le 1 ] || { echo "ABORT: could not scan $2" >&2; exit 1; }
  return "$rc"
}
# The adg is unpacked to a file first: grep -q closing a gunzip pipe early fails the pipe
# under pipefail, which read as "no match" and let a real hit through.
XML="$(mktemp)"
trap 'rm -f "$XML"' EXIT
gunzip -c "$STAGE/GLASS.adg" > "$XML"
if found 'Value="/Users/' "$XML"; then
  echo "ABORT: absolute home path still present in scrubbed GLASS.adg" >&2
  exit 1
fi
for f in Glass.amxd README.txt GLASS.png; do
  if found '/Users/' "$STAGE/$f"; then
    echo "ABORT: absolute home path present in staged $f" >&2
    exit 1
  fi
done
echo "scrub OK, no absolute paths remain"

# 3. re-zip the bundle: one GLASS/ folder holding the four scanned files by name, nothing else
echo "zipping -> $ZIP"
rm -f "$ZIP"
D="$(basename "$STAGE")"
( cd "$(dirname "$STAGE")" && zip -q "$(basename "$ZIP")" "$D/Glass.amxd" "$D/GLASS.adg" "$D/README.txt" "$D/GLASS.png" )

echo "done: $ZIP"
unzip -l "$ZIP"
