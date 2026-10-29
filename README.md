# Tower Wand

A Minecraft Bedrock behavior pack: use a **blaze rod** to build a 20×20 tower, one 10-block floor at a time.

## Install

On the device that **hosts** the world (iPad, phone, or Windows):

1. Download **[TowerWand.mcaddon](https://github.com/redswoop/tower-wand/releases/latest/download/TowerWand.mcaddon)** and open it. Minecraft imports it.
2. Edit the world → **Behavior Packs** → **Available** → **Tower Wand x.y.z** → **Activate** (its art pack, **Tower Wand x.y.z (art)**, comes along automatically; if not, activate it under **Resource Packs**).
3. Play. Anyone who joins downloads the pack automatically.

## Use

The pack adds two items of its own, the **Tower Wand** and the **Blast Wand** (with their own icons, in the creative Equipment tab). Everyone who joins a world with the pack gets both if they don't already carry them, and chat says which version is running (e.g. "Tower Wand 1.3.0 loaded"). The pack shows up as "Tower Wand 1.3.0" in Minecraft's pack lists.

**Tower Wand** (a plain blaze rod works too). On touch screens, tap a *block* (the ground), not the sky.
- Tap while standing **inside** a building: adds a random floor.
- Tap anywhere else: starts a **new building** in front of you.
- **Sneak + tap**: pick the next floor type (Lobby, Office, Dining hall, Lounge & bedrooms, Utility & workshop, Library, Garden, Party room, or a wrecked one), add 5 floors, start a new building, remove the top floor, or undo a blast.

Every building gets its own random exterior: 17 material schemes (marble with quartz pillars, mesa terracotta, gothic deepslate, prismarine, copper, purpur, mud & timber...) and one of 9 window shapes (bands, grid, ribbon, curtain wall, tall, arches, portholes, checker, slits). The ground floor is always a lobby; each floor above is a different furnished room.

Inside every floor: a staircase (switching sides each floor, up to the roof), a ladder in the back corner, and a glass **elevator** at the back: stand on the iron floor and **jump to go up, sneak to go down**.

**Blast Wand** (a plain fire charge works too). Tap a block to blow a ragged, scorched crater in it: blown-out center, blackstone/coal/basalt near the blast, fading out to cracked and dusty blocks, plus smoke, rubble, and short-lived fire.
- **Sneak + tap**: menu (big blast, HUGE blast, undo last blast).
- Undo remembers your last 5 blasts (until the world is closed). Chests, command blocks and bedrock are never touched.

Command blocks: `/execute as @p run scriptevent tower:floor` (also `tower:menu`, `tower:undo`, `tower:wands`).

## Layout

- `behavior_pack/`: manifest, `items/` (the two custom wands), `scripts/` (all the logic).
- `resource_pack/`: wand icons. Regenerate them with `python3 art/draw_icons.py resource_pack/textures/items`.
- `./build.sh` checks that every version number agrees and writes `TowerWand.mcaddon`.
