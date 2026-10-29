# Tower Wand

A Minecraft Bedrock behavior pack: use a **blaze rod** to build a 20×20 tower, one 10-block floor at a time.

## Install

On the device that **hosts** the world (iPad, phone, or Windows):

1. Download **[TowerWand.mcpack](https://github.com/redswoop/tower-wand/releases/latest/download/TowerWand.mcpack)** and open it. Minecraft imports it.
2. Edit the world → **Behavior Packs** → **Available** → **Tower Wand** → **Activate**.
3. Play. Anyone who joins downloads the pack automatically.

## Use

**Tower Wand: blaze rod.** On touch screens, tap a *block* (the ground), not the sky.
- Tap while standing **inside** a building: adds a floor.
- Tap anywhere else: starts a **new building** in front of you, in a random color scheme.
- **Sneak + tap**: menu (add 5 floors, add a wrecked floor, new building, remove top floor, undo last blast).

**Blast Wand: fire charge.** Tap a block to blow a ragged, scorched crater in it: blown-out center, blackstone/coal/basalt near the blast, fading out to cracked and dusty blocks, plus smoke, rubble, and short-lived fire.
- **Sneak + tap**: menu (big blast, HUGE blast, undo last blast).
- Undo remembers your last 5 blasts (until the world is closed). Chests, command blocks and bedrock are never touched.

Each floor: walls with windows on all sides, corner pillars and trim, ceiling lights, and a ladder in the corner up through every floor.

Command blocks: `/execute as @p run scriptevent tower:floor` (also `tower:menu`, `tower:undo`).
