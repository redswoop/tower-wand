import { world, system } from "@minecraft/server";
import { pick, first, mc, choice, chance, rand, randInt } from "./blocks.js";
import { blast } from "./blast.js";
import { SIZE, FLOOR_H, furnish, randomTheme, THEMES } from "./interior.js";

export { SIZE, FLOOR_H };

const GAP = 3;            // blocks between you and the near wall of a new tower
const NEAR = 64;          // "nearby tower" radius from tower center, for menu actions
const MAX_Y = 319;
export const KEY = "tower_wand:towers";

// ---- Exteriors --------------------------------------------------------------
// wall: main surface, pillar: corner columns, trim: floor bands and edges,
// stair/stairBase: the inside staircase. Arrays mean "pick one per building".
const EXTERIORS = [
  { name: "Marble", wall: "quartz_block", pillar: "quartz_pillar", trim: "smooth_quartz", glass: "light_blue_stained_glass", parapet: "smooth_quartz_slab", stair: "quartz_stairs", stairBase: "smooth_quartz" },
  { name: "Mesa", wall: ["orange_terracotta", "red_terracotta", "hardened_clay", "brown_terracotta"], pillar: "cut_red_sandstone", trim: "smooth_red_sandstone", glass: "glass", parapet: "smooth_red_sandstone_slab", stair: "smooth_red_sandstone_stairs", stairBase: "smooth_red_sandstone" },
  { name: "Brick", wall: "brick_block", pillar: "chiseled_stone_bricks", trim: "smooth_stone", glass: "glass", parapet: "smooth_stone_slab", stair: "brick_stairs", stairBase: "brick_block" },
  { name: "Gothic", wall: "deepslate_bricks", pillar: "chiseled_deepslate", trim: "polished_deepslate", glass: ["purple_stained_glass", "gray_stained_glass"], parapet: "deepslate_brick_slab", stair: "polished_deepslate_stairs", stairBase: "polished_deepslate" },
  { name: "Ocean", wall: "prismarine_bricks", pillar: "dark_prismarine", trim: "dark_prismarine", glass: "cyan_stained_glass", parapet: "dark_prismarine_slab", stair: "prismarine_bricks_stairs", stairBase: "prismarine_bricks" },
  { name: "Palace", wall: "cut_sandstone", pillar: "chiseled_sandstone", trim: "smooth_sandstone", glass: "glass", parapet: "smooth_sandstone_slab", stair: "smooth_sandstone_stairs", stairBase: "smooth_sandstone" },
  { name: "Verdigris", wall: "waxed_oxidized_cut_copper", pillar: "polished_deepslate", trim: "waxed_oxidized_copper", glass: "glass", parapet: "waxed_oxidized_cut_copper_slab", stair: "waxed_oxidized_cut_copper_stairs", stairBase: "waxed_oxidized_copper" },
  { name: "Fortress", wall: "polished_blackstone_bricks", pillar: "chiseled_polished_blackstone", trim: "polished_blackstone", glass: "orange_stained_glass", parapet: "polished_blackstone_brick_slab", stair: "polished_blackstone_brick_stairs", stairBase: "polished_blackstone" },
  { name: "Nether", wall: "nether_brick", pillar: "red_nether_brick", trim: "chiseled_nether_bricks", glass: "magenta_stained_glass", parapet: "nether_brick_slab", stair: "nether_brick_stairs", stairBase: "nether_brick" },
  { name: "End", wall: "purpur_block", pillar: "purpur_pillar", trim: "end_bricks", glass: "magenta_stained_glass", parapet: "purpur_slab", stair: "purpur_stairs", stairBase: "purpur_block" },
  { name: "Calcite", wall: "calcite", pillar: "chiseled_tuff", trim: "tuff_bricks", glass: "glass", parapet: "tuff_brick_slab", stair: "tuff_brick_stairs", stairBase: "tuff_bricks" },
  { name: "Timber", wall: "mud_bricks", pillar: "stripped_dark_oak_log", trim: "dark_oak_planks", glass: "glass", parapet: "mud_brick_slab", stair: "dark_oak_stairs", stairBase: "dark_oak_planks" },
  { name: "Resin", wall: "resin_bricks", pillar: "chiseled_resin_bricks", trim: "cut_red_sandstone", glass: "orange_stained_glass", parapet: "resin_brick_slab", stair: "resin_brick_stairs", stairBase: "resin_bricks" },
  { name: "Bank", wall: "stone_bricks", pillar: "quartz_pillar", trim: "polished_andesite", glass: "gray_stained_glass", parapet: "stone_brick_slab", stair: "stone_brick_stairs", stairBase: "stone_bricks" },
  { name: "Villa", wall: "polished_diorite", pillar: "quartz_pillar", trim: "polished_granite", glass: "light_blue_stained_glass", parapet: "polished_granite_slab", stair: "polished_granite_stairs", stairBase: "polished_granite" },
  { name: "Basalt", wall: ["light_gray_terracotta", "white_terracotta"], pillar: "polished_basalt", trim: "polished_blackstone", glass: "tinted_glass", parapet: "polished_blackstone_slab", stair: "polished_blackstone_brick_stairs", stairBase: "polished_blackstone" },
  { name: "Pastel", wall: ["white_terracotta", "pink_terracotta", "light_blue_terracotta", "yellow_terracotta", "lime_terracotta", "cyan_terracotta"], pillar: "quartz_pillar", trim: "smooth_quartz", glass: "glass", parapet: "smooth_quartz_slab", stair: "quartz_stairs", stairBase: "smooth_quartz" },
];

// Fallbacks for any id this version of the game doesn't know.
const DEFAULT_EXT = { wall: "white_concrete", pillar: "polished_deepslate", trim: "polished_deepslate", glass: "glass", parapet: "polished_deepslate_slab", stair: "stone_brick_stairs", stairBase: "stone_bricks" };
const RAILS = ["dark_oak_fence", "spruce_fence", "oak_fence", "iron_bars"];

function resolveExt(src) {
  const ext = { name: src.name };
  for (const k of Object.keys(DEFAULT_EXT)) {
    ext[k] = pick([].concat(src[k]).map(mc), mc(DEFAULT_EXT[k]));
  }
  ext.ceiling = first("minecraft:smooth_stone", "minecraft:stone");
  ext.rail = pick(RAILS.map(mc), "minecraft:iron_bars");
  ext.car = first("minecraft:iron_block");
  return ext;
}

// Towers from v1.1 had a numbered colour style and no interiors.
const LEGACY = [
  ["white_concrete", "polished_deepslate", "glass", "polished_deepslate_slab"],
  ["light_gray_concrete", "polished_blackstone", "light_blue_stained_glass", "polished_blackstone_slab"],
  ["cyan_terracotta", "quartz_block", "glass", "quartz_slab"],
  ["orange_terracotta", "stone_bricks", "glass", "stone_brick_slab"],
  ["mud_bricks", "dark_oak_planks", "glass", "mud_brick_slab"],
  ["yellow_concrete", "polished_blackstone", "glass", "polished_blackstone_slab"],
  ["tuff_bricks", "polished_tuff", "glass", "tuff_brick_slab"],
  ["red_concrete", "white_concrete", "glass", "smooth_stone_slab"],
  ["blue_concrete", "quartz_block", "light_blue_stained_glass", "quartz_slab"],
  ["deepslate_bricks", "polished_deepslate", "glass", "deepslate_brick_slab"],
];

function upgradeLegacy(t) {
  if (t.ext) return;
  const [wall, frame, glass, parapet] = LEGACY[t.style ?? 0] ?? LEGACY[0];
  t.ext = resolveExt({ name: "Classic", wall, pillar: frame, trim: frame, glass, parapet, stair: "stone_brick_stairs", stairBase: frame });
  t.win = "bands";
  t.layoutFrom = t.floors; // older floors have no stairs/elevator
}

// ---- Window shapes ----------------------------------------------------------
// (a, r): column 0..19 along a wall (0/19 are corners), row 1..9 above the slab.
const WINDOWS = {
  bands: (a, r) => r >= 3 && r <= 7 && ((a >= 2 && a <= 8) || (a >= 11 && a <= 17)),
  grid: (a, r) => r >= 3 && r <= 7 && a >= 2 && a <= 17 && (a - 2) % 4 < 2,
  ribbon: (a, r) => r >= 4 && r <= 6 && a >= 2 && a <= 17,
  curtain: (a, r) => r >= 1 && r <= 8 && a >= 1 && a <= 18 && a % 5 !== 0,
  tall: (a, r) => r >= 2 && r <= 8 && a >= 2 && a <= 17 && a % 3 === 2,
  arches: (a, r) => {
    for (const c of [3, 7, 12, 16]) {
      const d = Math.abs(a - c);
      if (r >= 3 && r <= 6 && d <= 1) return true;
      if (r === 7 && d === 0) return true;
    }
    return false;
  },
  portholes: (a, r) => [3, 7, 12, 16].some((c) => {
    const du = Math.abs(a - c);
    const dr = Math.abs(r - 5);
    return du <= 1 && dr <= 1 && du + dr < 2;
  }),
  checker: (a, r) => r >= 2 && r <= 8 && a >= 1 && a <= 18 && (a + r) % 2 === 0,
  slits: (a, r) => r >= 2 && r <= 8 && r !== 5 && a >= 2 && a <= 17 && a % 2 === 0,
};
export const WINDOW_NAMES = Object.keys(WINDOWS);

// ---- Persistence ------------------------------------------------------------
// towers: [{ id, dim, x0, z0, y0, floors, door: "n"|"s"|"e"|"w", ext, win, layoutFrom, lastTheme }]
export function loadTowers() {
  try {
    return JSON.parse(world.getDynamicProperty(KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function saveTowers(t) {
  world.setDynamicProperty(KEY, JSON.stringify(t));
}

const inside = (t, x, z) => x >= t.x0 && x < t.x0 + SIZE && z >= t.z0 && z < t.z0 + SIZE;
export const overlaps = (a, b) =>
  a.x0 < b.x0 + SIZE && b.x0 < a.x0 + SIZE && a.z0 < b.z0 + SIZE && b.z0 < a.z0 + SIZE;

export function towerUnder(towers, dimId, loc) {
  const x = Math.floor(loc.x);
  const z = Math.floor(loc.z);
  return towers.find((t) => t.dim === dimId && inside(t, x, z)) ?? null;
}

export function nearestTower(towers, dimId, loc) {
  let best = null;
  let bestD = Infinity;
  for (const t of towers) {
    if (t.dim !== dimId) continue;
    const d = Math.hypot(t.x0 + SIZE / 2 - loc.x, t.z0 + SIZE / 2 - loc.z);
    if (d < bestD) { best = t; bestD = d; }
  }
  return bestD <= NEAR ? best : null;
}

// ---- Shell ------------------------------------------------------------------
function makeFiller(dim) {
  // A fill that changes nothing also throws, so failures are only logged.
  return (x1, y1, z1, x2, y2, z2, block) => {
    try {
      dim.runCommand(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`);
    } catch (e) {
      console.warn(`[TowerWand] fill failed: ${e}`);
    }
  };
}

// Fill the outer ring of the footprint over a y range.
function ring(fill, t, y1, y2, block) {
  const { x0, z0 } = t;
  const x1 = x0 + SIZE - 1;
  const z1 = z0 + SIZE - 1;
  fill(x0, y1, z0, x1, y2, z0, block); // north
  fill(x0, y1, z1, x1, y2, z1, block); // south
  fill(x0, y1, z0, x0, y2, z1, block); // west
  fill(x1, y1, z0, x1, y2, z1, block); // east
}

// World x,z of column a on a side.
function wallCell(t, side, a) {
  const far = SIZE - 1;
  switch (side) {
    case "n": return [t.x0 + a, t.z0];
    case "s": return [t.x0 + a, t.z0 + far];
    case "w": return [t.x0, t.z0 + a];
    default: return [t.x0 + far, t.z0 + a];
  }
}

function windows(fill, t, y) {
  const shape = WINDOWS[t.win] ?? WINDOWS.bands;
  for (const side of ["n", "s", "e", "w"]) {
    for (let a = 1; a < SIZE - 1; a++) {
      const [x, z] = wallCell(t, side, a);
      let start = null;
      for (let r = 1; r <= FLOOR_H; r++) {
        const on = r < FLOOR_H && shape(a, r);
        if (on && start === null) start = r;
        if (!on && start !== null) {
          fill(x, y + start, z, x, y + r - 1, z, t.ext.glass);
          start = null;
        }
      }
    }
  }
}

function door(fill, t, y) {
  const [ax, az] = wallCell(t, t.door, 9);
  const [bx, bz] = wallCell(t, t.door, 10);
  fill(ax, y + 1, az, bx, y + 3, bz, "minecraft:air");
}

// A point on a random wall of floor slab y.
function wallPoint(t, y) {
  const along = randInt(1, SIZE - 2);
  const side = choice(["n", "s", "e", "w"]);
  const [x, z] = wallCell(t, side, along);
  return { x, y: y + randInt(2, FLOOR_H - 1), z };
}

// Beat up a freshly built floor: blown-out chunks, scorch marks, smashed
// windows, sometimes a hole in the ceiling, cobwebs.
function ruin(dim, t, y) {
  for (let i = randInt(3, 5); i > 0; i--) blast(dim, wallPoint(t, y), rand(1.6, 3.2), { fx: false, fire: false });
  if (chance(0.6)) {
    const c = { x: t.x0 + randInt(4, SIZE - 5), y: y + FLOOR_H, z: t.z0 + randInt(4, SIZE - 5) };
    blast(dim, c, rand(2, 3.5), { fx: false, fire: false });
  }
  const web = first("minecraft:web", "minecraft:cobweb");
  system.runJob(
    (function* () {
      for (let r = 1; r < FLOOR_H; r++) {
        for (const side of ["n", "s", "e", "w"]) {
          for (let a = 0; a < SIZE; a++) {
            const [x, z] = wallCell(t, side, a);
            let b;
            try { b = dim.getBlock({ x, y: y + r, z }); } catch { continue; }
            if (!b || b.isAir) continue;
            try {
              if (b.typeId.includes("glass")) { if (chance(0.35)) b.setType("minecraft:air"); }
              else if (chance(0.12)) b.setType(pick(["cracked_stone_bricks", "mossy_cobblestone", "cobblestone", "andesite", "gravel", "tuff"].map(mc)));
            } catch {}
          }
        }
        yield;
      }
      for (let i = randInt(4, 8); web && i > 0; i--) {
        const pos = { x: t.x0 + randInt(2, SIZE - 3), y: y + FLOOR_H - 1, z: t.z0 + randInt(2, SIZE - 3) };
        try { const b = dim.getBlock(pos); if (b?.isAir) b.setType(web); } catch {}
      }
    })()
  );
}

/**
 * Build the next floor of tower t.
 *   theme   key from THEMES, or undefined for random (lobby on the ground floor)
 *   ruined  wreck it afterwards
 */
export function buildFloor(t, { theme, ruined = false } = {}) {
  upgradeLegacy(t);
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
  const E = t.ext;
  const k = t.floors;
  const y = t.y0 + k * FLOOR_H; // this floor's slab
  const top = y + FLOOR_H;      // this floor's ceiling / next floor's slab
  if (top + 1 > MAX_Y) return { ok: false, msg: "§cThat would hit the build height limit." };

  const { x0, z0 } = t;
  const x1 = x0 + SIZE - 1;
  const z1 = z0 + SIZE - 1;

  // getBlock() returns undefined (or throws) for unloaded chunks.
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    let blk;
    try { blk = dim.getBlock({ x: cx, y, z: cz }); } catch {}
    if (!blk) return { ok: false, msg: "§cPart of the tower isn't loaded. Walk closer and try again." };
  }

  // Ground slab only for the first floor; upper floors stand on the previous roof.
  if (k === 0) {
    fill(x0, y, z0, x1, y, z1, E.ceiling);
    ring(fill, t, y, y, E.trim);
  }

  // Clear the inside (also eats trees/terrain in the way), walls, windows.
  fill(x0 + 1, y + 1, z0 + 1, x1 - 1, top - 1, z1 - 1, "minecraft:air");
  ring(fill, t, y + 1, top - 1, E.wall);
  windows(fill, t, y);

  // Corner columns, ceiling with a trim band, parapet (overwritten by the next floor).
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) fill(cx, y, cz, cx, top, cz, E.pillar);
  fill(x0, top, z0, x1, top, z1, E.ceiling);
  ring(fill, t, top, top, E.trim);
  ring(fill, t, top + 1, top + 1, E.parapet);
  if (k === 0) door(fill, t, y);

  const key = theme && THEMES[theme] ? theme : randomTheme(t);
  try {
    furnish(t, k, y, E, key);
  } catch (e) {
    console.warn(`[TowerWand] furnish failed: ${e}`);
  }
  if (ruined) ruin(dim, t, y);

  t.floors++;
  t.lastTheme = key;
  const label = THEMES[key].name;
  return { ok: true, msg: ruined ? `§6Floor ${t.floors}: ${label}... wrecked!` : `§aFloor ${t.floors}: ${label}` };
}

export function removeTopFloor(t) {
  if (t.floors <= 0) return "§cNothing to remove.";
  upgradeLegacy(t);
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
  const k = t.floors - 1;
  const y = t.y0 + k * FLOOR_H;
  const { x0, z0 } = t;
  fill(x0, y + 1, z0, x0 + SIZE - 1, y + FLOOR_H + 1, z0 + SIZE - 1, "minecraft:air");
  if (k > 0) ring(fill, t, y + 1, y + 1, t.ext.parapet);
  t.floors--;
  if (t.layoutFrom > t.floors) t.layoutFrom = t.floors;
  return `§eRemoved floor ${k + 1}. ${t.floors} left.`;
}

// New tower in front of a position, door facing back toward it, random look.
export function newTowerAt(dimId, loc, yaw) {
  const px = Math.floor(loc.x);
  const py = Math.floor(loc.y);
  const pz = Math.floor(loc.z);
  // yaw: 0 = south(+z), 90 = west(-x), 180 = north(-z), -90 = east(+x)
  const a = ((yaw % 360) + 360) % 360;
  const half = SIZE / 2;
  let x0, z0, door;
  if (a >= 315 || a < 45) { x0 = px - half; z0 = pz + GAP; door = "n"; }            // facing south
  else if (a < 135) { x0 = px - GAP - SIZE + 1; z0 = pz - half; door = "e"; }       // facing west
  else if (a < 225) { x0 = px - half; z0 = pz - GAP - SIZE + 1; door = "s"; }       // facing north
  else { x0 = px + GAP; z0 = pz - half; door = "w"; }                               // facing east
  return {
    id: Date.now(), dim: dimId, x0, z0, y0: py - 1, floors: 0, door,
    ext: resolveExt(choice(EXTERIORS)), win: choice(WINDOW_NAMES), layoutFrom: 0,
  };
}
