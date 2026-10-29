import { world, system } from "@minecraft/server";
import { valid, pick, chance, rand, randInt } from "./blocks.js";
import { blast } from "./blast.js";

// ---- Tunables -------------------------------------------------------------
export const SIZE = 20;   // footprint (x and z)
const FLOOR_H = 10;       // slab-to-slab height
const GAP = 3;            // blocks between you and the near wall of a new tower
const NEAR = 64;          // "nearby tower" radius from tower center, for menu actions
const MAX_Y = 319;

const LADDER = 'minecraft:ladder ["facing_direction"=3]'; // on the north wall, facing south

// Each new tower picks one at random. Unknown ids fall back to STYLES[0].
const STYLES = [
  { wall: "white_concrete", frame: "polished_deepslate", glass: "glass", slab: "smooth_stone", light: "sea_lantern", parapet: "polished_deepslate_slab" },
  { wall: "light_gray_concrete", frame: "polished_blackstone", glass: "light_blue_stained_glass", slab: "polished_andesite", light: "sea_lantern", parapet: "polished_blackstone_slab" },
  { wall: "cyan_terracotta", frame: "quartz_block", glass: "glass", slab: "smooth_quartz", light: "glowstone", parapet: "quartz_slab" },
  { wall: "orange_terracotta", frame: "stone_bricks", glass: "glass", slab: "smooth_stone", light: "glowstone", parapet: "stone_brick_slab" },
  { wall: "mud_bricks", frame: "dark_oak_planks", glass: "glass", slab: "spruce_planks", light: "shroomlight", parapet: "mud_brick_slab" },
  { wall: "yellow_concrete", frame: "polished_blackstone", glass: "glass", slab: "polished_andesite", light: "sea_lantern", parapet: "polished_blackstone_slab" },
  { wall: "tuff_bricks", frame: "polished_tuff", glass: "glass", slab: "polished_tuff", light: "sea_lantern", parapet: "tuff_brick_slab" },
  { wall: "red_concrete", frame: "white_concrete", glass: "glass", slab: "smooth_stone", light: "glowstone", parapet: "smooth_stone_slab" },
  { wall: "blue_concrete", frame: "quartz_block", glass: "light_blue_stained_glass", slab: "smooth_quartz", light: "sea_lantern", parapet: "quartz_slab" },
  { wall: "deepslate_bricks", frame: "polished_deepslate", glass: "glass", slab: "polished_deepslate", light: "sea_lantern", parapet: "deepslate_brick_slab" },
];

function styleOf(t) {
  const s = STYLES[t.style ?? 0] ?? STYLES[0];
  const out = {};
  for (const k of Object.keys(STYLES[0])) {
    const id = `minecraft:${s[k]}`;
    out[k] = valid(id) ? id : `minecraft:${STYLES[0][k]}`;
  }
  return out;
}

// Wall columns 0..19: 0/19 corner pillars, 1/9/10/18 solid, rest are windows.
const WINDOW_RUNS = [[2, 8], [11, 17]];
const DOOR = [9, 10];

// ---- Persistence ------------------------------------------------------------
// towers: [{ id, dim, x0, z0, y0, floors, door: "n"|"s"|"e"|"w", style }]
export function loadTowers() {
  try {
    return JSON.parse(world.getDynamicProperty("tower_wand:towers") ?? "[]");
  } catch {
    return [];
  }
}
export function saveTowers(t) {
  world.setDynamicProperty("tower_wand:towers", JSON.stringify(t));
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

// ---- Building ---------------------------------------------------------------
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

// Fill columns [a..b] (0-based along the wall) on a given side.
function wallSpan(fill, t, side, a, b, y1, y2, block) {
  const { x0, z0 } = t;
  const x1 = x0 + SIZE - 1;
  const z1 = z0 + SIZE - 1;
  switch (side) {
    case "n": fill(x0 + a, y1, z0, x0 + b, y2, z0, block); break;
    case "s": fill(x0 + a, y1, z1, x0 + b, y2, z1, block); break;
    case "w": fill(x0, y1, z0 + a, x0, y2, z0 + b, block); break;
    case "e": fill(x1, y1, z0 + a, x1, y2, z0 + b, block); break;
  }
}

// A point on a random wall of floor slab y, `along` blocks from the corner.
function wallPoint(t, y) {
  const along = randInt(1, SIZE - 2);
  const up = randInt(2, FLOOR_H - 1);
  const far = SIZE - 1;
  const [dx, dz] = [[along, 0], [along, far], [0, along], [far, along]][randInt(0, 3)];
  return { x: t.x0 + dx, y: y + up, z: t.z0 + dz };
}

const WEATHER = ["cracked_stone_bricks", "mossy_cobblestone", "cobblestone", "andesite", "gravel", "tuff"].map((s) => `minecraft:${s}`);

// Beat up a freshly built floor: blown-out chunks, scattered weathering,
// smashed windows, a hole in the ceiling, cobwebs.
function ruin(dim, t, y) {
  for (let i = randInt(3, 5); i > 0; i--) blast(dim, wallPoint(t, y), rand(1.6, 3.2), { fx: false, fire: false });
  if (chance(0.6)) {
    const c = { x: t.x0 + randInt(4, SIZE - 5), y: y + FLOOR_H, z: t.z0 + randInt(4, SIZE - 5) };
    blast(dim, c, rand(2, 3.5), { fx: false, fire: false });
  }
  const web = valid("minecraft:web") ? "minecraft:web" : "minecraft:cobweb";
  system.runJob(
    (function* () {
      const far = SIZE - 1;
      for (let up = 1; up < FLOOR_H; up++) {
        for (let a = 0; a < SIZE; a++) {
          for (const [dx, dz] of [[a, 0], [a, far], [0, a], [far, a]]) {
            let b;
            try { b = dim.getBlock({ x: t.x0 + dx, y: y + up, z: t.z0 + dz }); } catch { continue; }
            if (!b || b.isAir) continue;
            try {
              if (b.typeId.includes("glass")) { if (chance(0.35)) b.setType("minecraft:air"); }
              else if (chance(0.12)) b.setType(pick(WEATHER));
            } catch {}
          }
        }
        yield;
      }
      if (valid(web)) {
        for (let i = randInt(3, 7); i > 0; i--) {
          const pos = { x: t.x0 + randInt(2, SIZE - 3), y: y + FLOOR_H - 1, z: t.z0 + randInt(2, SIZE - 3) };
          try { const b = dim.getBlock(pos); if (b?.isAir) b.setType(web); } catch {}
        }
      }
    })()
  );
}

export function buildFloor(t, { ruined = false } = {}) {
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
  const B = styleOf(t);
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
    fill(x0, y, z0, x1, y, z1, B.slab);
    ring(fill, t, y, y, B.frame);
  }

  // Clear the inside (also eats trees/terrain in the way).
  fill(x0 + 1, y + 1, z0 + 1, x1 - 1, top - 1, z1 - 1, "minecraft:air");

  // Walls, then punch windows.
  ring(fill, t, y + 1, top - 1, B.wall);
  for (const side of ["n", "s", "e", "w"]) {
    for (const [a, b] of WINDOW_RUNS) wallSpan(fill, t, side, a, b, y + 3, y + 7, B.glass);
  }

  // Corner pillars.
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    fill(cx, y, cz, cx, top, cz, B.frame);
  }

  // Ceiling with a band and some lights.
  fill(x0, top, z0, x1, top, z1, B.slab);
  ring(fill, t, top, top, B.frame);
  for (const [dx, dz] of [[5, 5], [5, 14], [14, 5], [14, 14]]) {
    fill(x0 + dx, top, z0 + dz, x0 + dx, top, z0 + dz, B.light);
  }

  // Ladder in the NW corner, running up through a hole in the ceiling.
  fill(x0 + 1, y + 1, z0 + 1, x0 + 1, top, z0 + 1, LADDER);

  // Roof parapet (the next floor's walls overwrite it).
  ring(fill, t, top + 1, top + 1, B.parapet);

  // Front door on the ground floor.
  if (k === 0) wallSpan(fill, t, t.door, DOOR[0], DOOR[1], y + 1, y + 3, "minecraft:air");

  if (ruined) ruin(dim, t, y);

  t.floors++;
  return { ok: true, msg: ruined ? `§6Floor ${t.floors} built... and wrecked.` : `§aFloor ${t.floors} done.` };
}

export function removeTopFloor(t) {
  if (t.floors <= 0) return "§cNothing to remove.";
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
  const k = t.floors - 1;
  const y = t.y0 + k * FLOOR_H;
  const { x0, z0 } = t;
  fill(x0, y + 1, z0, x0 + SIZE - 1, y + FLOOR_H + 1, z0 + SIZE - 1, "minecraft:air");
  if (k > 0) ring(fill, t, y + 1, y + 1, styleOf(t).parapet);
  t.floors--;
  return `§eRemoved floor ${k + 1}. ${t.floors} left.`;
}

// New tower in front of a position, door facing back toward it, random style.
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
  return { id: Date.now(), dim: dimId, x0, z0, y0: py - 1, floors: 0, door, style: randInt(0, STYLES.length - 1) };
}

