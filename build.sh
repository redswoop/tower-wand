#!/bin/sh
# Build TowerWand.mcpack from the pack files.
cd "$(dirname "$0")" || exit 1
# The version in chat, in the pack name and in the manifest must all match.
m=$(python3 -c 'import json; print(".".join(map(str, json.load(open("manifest.json"))["header"]["version"])))')
s=$(sed -n 's/^export const VERSION = "\(.*\)";.*/\1/p' scripts/main.js)
n=$(python3 -c 'import json; print(json.load(open("manifest.json"))["header"]["name"])')
[ "$m" = "$s" ] || { echo "version mismatch: manifest $m, main.js $s" >&2; exit 1; }
[ "$n" = "Tower Wand $m" ] || { echo "manifest name should be \"Tower Wand $m\", is \"$n\"" >&2; exit 1; }
rm -f TowerWand.mcpack && zip -rX TowerWand.mcpack manifest.json scripts
