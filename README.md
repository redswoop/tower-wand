# Tower Wand

A Minecraft Bedrock behavior pack: use a **blaze rod** to build a 20×20 tower, one 10-block floor at a time.

## Install

On the device that **hosts** the world (iPad, phone, or Windows):

1. Download **[TowerWand.mcpack](https://github.com/redswoop/tower-wand/releases/latest/download/TowerWand.mcpack)** and open it. Minecraft imports it.
2. Edit the world → **Behavior Packs** → **Available** → **Tower Wand** → **Activate**.
3. Play. Anyone who joins downloads the pack automatically.

## Use

- **Use a blaze rod** with no tower nearby: starts a tower just in front of you, door facing you.
- **Use it again** within ~60 blocks of a tower: adds a floor on top.
- **Sneak + use**: menu (add 5 floors, new tower here, remove top floor, forget tower).
- Command blocks: `/execute as @p run scriptevent tower:floor` adds a floor for the nearest player.

Each floor: white walls with windows on all sides, deepslate corners and trim, ceiling lights, and a ladder in the corner up through every floor.
