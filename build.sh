#!/bin/sh
# Build TowerWand.mcpack from the pack files.
cd "$(dirname "$0")" || exit 1
# The version shown in chat must match the manifest version.
m=$(python3 -c 'import json; print(".".join(map(str, json.load(open("manifest.json"))["header"]["version"])))')
s=$(sed -n 's/^export const VERSION = "\(.*\)";.*/\1/p' scripts/main.js)
[ "$m" = "$s" ] || { echo "version mismatch: manifest $m, main.js $s" >&2; exit 1; }
rm -f TowerWand.mcpack && zip -rX TowerWand.mcpack manifest.json scripts
