#!/bin/sh
# Build TowerWand.mcpack from the pack files.
cd "$(dirname "$0")" && rm -f TowerWand.mcpack && zip -rX TowerWand.mcpack manifest.json scripts
