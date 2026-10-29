#!/bin/sh
# Build TowerWand.mcaddon (behavior pack + resource pack) and check that every
# version number agrees: both manifests, their names, their dependencies on each
# other, and the version announced in chat.
cd "$(dirname "$0")" || exit 1
python3 - <<'PY' || exit 1
import json, re, sys
bp = json.load(open("behavior_pack/manifest.json"))
rp = json.load(open("resource_pack/manifest.json"))
v = bp["header"]["version"]
s = ".".join(map(str, v))
js = re.search(r'^export const VERSION = "(.*)";', open("behavior_pack/scripts/main.js").read(), re.M).group(1)
checks = {
    "resource pack version": rp["header"]["version"] == v,
    "module versions": all(m["version"] == v for m in bp["modules"] + rp["modules"]),
    "behavior pack name": bp["header"]["name"] == f"Tower Wand {s}",
    "resource pack name": rp["header"]["name"] == f"Tower Wand {s} (art)",
    "behavior -> resource dependency": {"uuid": rp["header"]["uuid"], "version": v} in bp["dependencies"],
    "resource -> behavior dependency": {"uuid": bp["header"]["uuid"], "version": v} in rp["dependencies"],
    "VERSION in main.js": js == s,
}
bad = [k for k, ok in checks.items() if not ok]
if bad:
    sys.exit(f"version {s} mismatch: " + ", ".join(bad))
PY
rm -f TowerWand.mcaddon && zip -qrX TowerWand.mcaddon behavior_pack resource_pack -x '*.DS_Store' && echo "built TowerWand.mcaddon"
