import { world } from "@minecraft/server";
import { valid, pick, first, perm, mc, chance, randInt, choice } from "./blocks.js";
import { stock, LOOT } from "./loot.js";

// Interior layout, in a local frame that's rotated so the front door is always
// at v = 0. u runs 0..19 across the building, v runs 0..19 front to back,
// h is height above the floor slab (0 = slab, 10 = ceiling).
//
//   v=19  back wall
//   v16-18  [ladder u1] [corner C u2-7] [glass|ELEVATOR u9-10|glass] [corner D u12-18]
//   v4-13   [stairs u1-2] [zone A u4-8] [aisle u9-10] [zone B u11-15] [stairs u17-18]
//   v0    front wall, door at u9-10 on the ground floor
//
// Stairs alternate sides each floor so the stairwell hole in one floor's
// ceiling never sits under the next floor's stairs.

export const SIZE = 20;
export const FLOOR_H = 10;
const L = SIZE - 1;

export const ELEVATOR = { u1: 9, u2: 10, v1: 17, v2: 18 };
const LADDER = { u: 1, v: 18 };
const STAIR_V0 = 4;                      // bottom step; top step is STAIR_V0 + 9
const HOLE = [STAIR_V0 + 5, STAIR_V0 + 8]; // headroom cut in the ceiling over the upper steps
const LIGHTS = [[5, 4], [14, 4], [5, 9], [14, 9], [5, 14], [14, 14]];

const stairCols = (side) => (side === "L" ? [1, 2] : [17, 18]);
export const stairSide = (k) => (k % 2 === 0 ? "L" : "R");

export function toWorld(t, u, v) {
  switch (t.door) {
    case "n": return [t.x0 + u, t.z0 + v];
    case "s": return [t.x0 + L - u, t.z0 + L - v];
    case "w": return [t.x0 + v, t.z0 + L - u];
    default: return [t.x0 + L - v, t.z0 + u]; // "e"
  }
}

export function toLocal(t, x, z) {
  const dx = x - t.x0;
  const dz = z - t.z0;
  switch (t.door) {
    case "n": return [dx, dz];
    case "s": return [L - dx, L - dz];
    case "w": return [L - dz, dx];
    default: return [dz, L - dx]; // "e"
  }
}

// ---- Directions -------------------------------------------------------------
// Local directions are "+u", "-u", "+v" (toward the back), "-v" (toward the door).
const AXES = { n: { u: "east", v: "south" }, s: { u: "west", v: "north" }, w: { u: "north", v: "east" }, e: { u: "south", v: "west" } };
const OPP = { north: "south", south: "north", east: "west", west: "east" };
const flip = (d) => (d[0] === "+" ? "-" : "+") + d[1];
const STEP = { "+u": [1, 0], "-u": [-1, 0], "+v": [0, 1], "-v": [0, -1] };

const WEIRDO = { east: 0, west: 1, south: 2, north: 3 };  // stairs: side the tall back is on
const FACING = { north: 2, south: 3, west: 4, east: 5 };  // ladders, barrels, ...
const DIR4 = { south: 0, west: 1, north: 2, east: 3 };    // beds, trapdoors

// ---- Room: place blocks by local coordinates ----------------------------------
function makeRoom(t, y, k) {
  const dim = world.getDimension(t.dim);
  const R = {
    t, k, y, dim,
    world(d) {
      const w = AXES[t.door][d[1]];
      return d[0] === "+" ? w : OPP[w];
    },
    loc(u, h, v) {
      const [x, z] = toWorld(t, u, v);
      return { x, y: y + h, z };
    },
    put(u, h, v, id, ...variants) {
      if (!id) return false;
      const p = perm(mc(id), ...variants);
      if (!p) return false;
      try { dim.getBlock(R.loc(u, h, v))?.setPermutation(p); return true; } catch { return false; }
    },
    box(u1, h1, v1, u2, h2, v2, id, ...variants) {
      for (let u = Math.min(u1, u2); u <= Math.max(u1, u2); u++)
        for (let h = Math.min(h1, h2); h <= Math.max(h1, h2); h++)
          for (let v = Math.min(v1, v2); v <= Math.max(v1, v2); v++) R.put(u, h, v, id, ...variants);
    },
    isAir(u, h, v) {
      try { return dim.getBlock(R.loc(u, h, v))?.isAir ?? false; } catch { return false; }
    },
    // Stairs whose tall back is toward local direction `back`.
    stairs(u, h, v, id, back, upside = false) {
      R.put(u, h, v, id, { weirdo_direction: WEIRDO[R.world(back)], upside_down_bit: upside });
    },
    // A chair you'd sit in facing `face`.
    chair(u, v, wood, face) { R.stairs(u, 1, v, `${wood}_stairs`, flip(face)); },
    topSlab(u, h, v, id) { R.put(u, h, v, id, { "minecraft:vertical_half": "top" }); },
    lantern(u, h, v, hanging = false, id = "lantern") { R.put(u, h, v, id, { hanging }); },
    // Blocks with a front (furnaces, chests, lecterns...) facing `face`.
    facing(u, h, v, id, face) {
      const w = R.world(face);
      R.put(u, h, v, id, { "minecraft:cardinal_direction": w }, { facing_direction: FACING[w] }, { direction: DIR4[w] });
    },
    bed(u, v, headDir) {
      const w = R.world(headDir);
      const [du, dv] = STEP[headDir];
      R.put(u, 1, v, "bed", { direction: DIR4[w], head_piece_bit: false });
      R.put(u + du, 1, v + dv, "bed", { direction: DIR4[w], head_piece_bit: true });
    },
    // A container block filled with `stacks` random stacks from a loot table.
    stocked(u, h, v, id, face, table, stacks) {
      R.facing(u, h, v, id, face);
      stock(dim, R.loc(u, h, v), LOOT[table], stacks);
    },
    planter(u, v) {
      R.put(u, 1, v, "moss_block");
      R.put(u, 2, v, pick(["minecraft:azalea", "minecraft:flowering_azalea"], "minecraft:azalea"));
    },
    floorLamp(u, v, wood) {
      R.put(u, 1, v, `${wood}_fence`);
      R.lantern(u, 2, v);
    },
  };
  return R;
}

// ---- Materials --------------------------------------------------------------
const WOODS = ["oak", "spruce", "birch", "dark_oak", "cherry", "mangrove", "acacia", "jungle", "pale_oak"];
const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const FLOWERS = ["poppy", "dandelion", "cornflower", "allium", "oxeye_daisy", "azure_bluet", "red_tulip", "orange_tulip", "pink_tulip", "white_tulip", "lily_of_the_valley", "blue_orchid"].map(mc);
const WORKSTATIONS = ["crafting_table", "smithing_table", "anvil", "grindstone", "stonecutter_block", "loom", "cartography_table", "fletching_table", "blast_furnace", "smoker", "furnace", "cauldron", "composter", "barrel"];

function pickWood() {
  const ok = WOODS.filter((w) => ["_planks", "_stairs", "_slab", "_fence"].every((s) => valid(mc(w + s))));
  return choice(ok.length ? ok : ["oak"]);
}

// ---- Shared layout ------------------------------------------------------------
function layFloor(R, tile, carFloor) {
  const prev = R.k - 1 >= (R.t.layoutFrom ?? 0) ? stairSide(R.k - 1) : null;
  const skip = new Set(LIGHTS.map(([u, v]) => `${u},${v}`));
  skip.add(`${LADDER.u},${LADDER.v}`);
  if (prev) for (const u of stairCols(prev)) for (let v = HOLE[0]; v <= STAIR_V0 + 9; v++) skip.add(`${u},${v}`);
  for (let u = 1; u < L; u++) {
    for (let v = 1; v < L; v++) {
      if (u >= ELEVATOR.u1 && u <= ELEVATOR.u2 && v >= ELEVATOR.v1 && v <= ELEVATOR.v2) R.put(u, 0, v, carFloor);
      else if (!skip.has(`${u},${v}`)) R.put(u, 0, v, tile(u, v));
    }
  }
}

function core(R, ext, light) {
  const { k, t } = R;
  // Ceiling lights (they become glowing tiles in the floor above, which skips them).
  for (const [u, v] of LIGHTS) R.put(u, 10, v, typeof light === "function" ? light() : light);

  // Ladder up the back-left corner, with a solid wall behind it.
  R.box(LADDER.u, 1, LADDER.v + 1, LADDER.u, 9, LADDER.v + 1, ext.wall);
  for (let h = 1; h <= 10; h++) R.put(LADDER.u, h, LADDER.v, "ladder", { facing_direction: FACING[R.world("-v")] });

  // Staircase: ten steps up toward the back, solid underneath, hole above.
  const side = stairSide(k);
  for (const u of stairCols(side)) {
    for (let n = 0; n < 10; n++) {
      const v = STAIR_V0 + n;
      if (n > 0) R.box(u, 1, v, u, n, v, ext.stairBase);
      R.stairs(u, n + 1, v, ext.stair, "+v");
    }
    for (let v = HOLE[0]; v <= HOLE[1]; v++) R.put(u, 10, v, "air");
  }

  // Railing around the stairwell coming up from the floor below.
  if (k - 1 >= (t.layoutFrom ?? 0)) {
    const prev = stairSide(k - 1);
    const [a, b] = stairCols(prev);
    const railU = prev === "L" ? 3 : 16;
    for (let v = HOLE[0] - 1; v <= HOLE[1]; v++) R.put(railU, 1, v, ext.rail);
    R.put(a, 1, HOLE[0] - 1, ext.rail);
    R.put(b, 1, HOLE[0] - 1, ext.rail);
  }

  // Elevator: glass shaft walls, light overhead.
  for (const u of [ELEVATOR.u1 - 1, ELEVATOR.u2 + 1]) R.box(u, 1, ELEVATOR.v1 - 1, u, 9, ELEVATOR.v2, ext.glass);
  R.lantern(ELEVATOR.u1, 9, ELEVATOR.v2, true);
  R.lantern(ELEVATOR.u2, 9, ELEVATOR.v2, true);
}

// ---- Themes -------------------------------------------------------------------
const checker = (a, b) => (u, v) => ((u + v) % 2 ? a : b);
const carpet = (c) => mc(`${c}_carpet`);

function lobby(R) {
  const pairs = [["smooth_quartz", "polished_deepslate"], ["calcite", "polished_tuff"], ["white_concrete", "black_concrete"], ["polished_diorite", "polished_andesite"], ["quartz_block", "polished_blackstone"]];
  const [a, b] = choice(pairs).map(mc);
  const wood = pickWood();
  return {
    floor: checker(a, b),
    light: "minecraft:sea_lantern",
    decorate() {
      // Red carpet from the door to the elevator.
      const rc = carpet(choice(["red", "blue", "purple", "green"]));
      R.box(9, 1, 1, 10, 1, 15, rc);
      for (const [u, v] of [[4, 3], [15, 3], [4, 13], [15, 13]]) R.planter(u, v);
      // Waiting area: two sofas around a coffee table on a rug.
      R.box(4, 1, 5, 8, 1, 11, carpet(choice(COLORS)));
      for (let u = 5; u <= 7; u++) {
        R.chair(u, 6, wood, "+v");
        R.chair(u, 10, wood, "-v");
        R.topSlab(u, 1, 8, `${wood}_slab`);
      }
      R.floorLamp(4, 6, wood);
      R.floorLamp(8, 10, wood);
      // Reception desk facing the aisle, with a bell to ring.
      const desk = pick(["minecraft:stripped_dark_oak_log", "minecraft:smooth_quartz", "minecraft:polished_andesite", mc(`${wood}_planks`)]);
      R.box(12, 1, 6, 12, 1, 10, desk);
      R.box(13, 1, 6, 13, 1, 6, desk);
      R.box(13, 1, 10, 13, 1, 10, desk);
      R.put(12, 2, 8, "bell", { attachment: "standing" });
      R.chair(14, 8, wood, "-u");
      R.box(15, 1, 6, 15, 2, 10, "bookshelf");
      // Chandeliers over the aisle.
      for (const v of [4, 9]) R.lantern(9, 9, v, true);
    },
  };
}

function office(R) {
  const wood = pickWood();
  return {
    floor: () => mc(choice(["light_gray_concrete", "light_gray_concrete", "gray_concrete"])),
    light: "minecraft:sea_lantern",
    decorate() {
      // Rows of desks, each with a chair and something on top.
      for (const v of [4, 8, 12]) {
        for (const u of [4, 5, 7, 8, 11, 12, 14, 15]) {
          R.put(u, 1, v, `${wood}_planks`);
          R.chair(u, v + 1, wood, "-v");
          const top = choice(["black_carpet", "black_carpet", "white_carpet", "lantern", null]);
          if (top) R.put(u, 2, v, top);
        }
      }
      // Water cooler, printer and filing in the back-left corner.
      R.put(3, 1, 17, "iron_block");
      R.put(3, 2, 17, "light_blue_stained_glass");
      R.facing(5, 1, 17, "dropper", "-v");
      R.box(2, 1, 18, 7, 2, 18, "bookshelf");
      // Meeting table in the back-right corner.
      for (let u = 13; u <= 17; u++) {
        R.topSlab(u, 1, 17, `${wood}_slab`);
        R.chair(u, 16, wood, "+v");
      }
      R.planter(12, 18);
      R.planter(18, 18);
      for (const [u, v] of [[6, 2], [13, 2]]) R.planter(u, v);
    },
  };
}

function dining(R) {
  const wood = pickWood();
  const fl = chance(0.5) ? () => mc(`${wood}_planks`) : checker("minecraft:white_concrete", "minecraft:black_concrete");
  return {
    floor: fl,
    light: "minecraft:glowstone",
    decorate() {
      // Two long banquet tables.
      for (const [a, b] of [[6, 7], [12, 13]]) {
        for (let v = 4; v <= 12; v++) {
          R.topSlab(a, 1, v, `${wood}_slab`);
          R.topSlab(b, 1, v, `${wood}_slab`);
          if (v % 2 === 0) {
            R.chair(a - 1, v, wood, "+u");
            R.chair(b + 1, v, wood, "-u");
          }
        }
        R.lantern(a, 2, 6);
        R.put(b, 2, 8, chance(0.6) ? "cake" : "lantern");
        R.lantern(a, 2, 11);
        for (const v of [5, 9, 12]) R.lantern(a, 9, v, true);
      }
      // Kitchen along the back-right wall.
      const kitchen = ["smoker", "chest", "furnace", "cauldron", "barrel", "chest", "smoker"];
      kitchen.forEach((id, i) => {
        if (id === "chest" || id === "barrel") R.stocked(12 + i, 1, 18, id, "-v", "food", randInt(6, 10));
        else R.facing(12 + i, 1, 18, id, "-v");
      });
      for (let u = 13; u <= 17; u++) R.topSlab(u, 1, 16, "smooth_stone_slab");
      // Pantry in the back-left corner, every barrel full of food.
      for (let u = 2; u <= 7; u++) {
        for (let h = 1, top = randInt(1, 3); h <= top; h++) R.stocked(u, h, 18, "barrel", "-v", "food", randInt(4, 8));
      }
      R.put(3, 1, 16, "composter");
    },
  };
}

function lounge(R) {
  const wood = pickWood();
  const soft = choice(["white", "light_gray", "pink", "light_blue", "brown", "lime"]);
  return {
    floor: () => mc(`${soft}_wool`),
    light: () => pick(["minecraft:shroomlight", "minecraft:glowstone"]),
    decorate() {
      // Living room: sofa, armchairs, coffee table, TV.
      R.box(4, 1, 4, 8, 1, 10, carpet(choice(COLORS.filter((c) => c !== soft))));
      for (let v = 5; v <= 9; v++) R.chair(4, v, wood, "+u");
      R.chair(6, 4, wood, "+v");
      R.chair(6, 10, wood, "-v");
      for (let v = 6; v <= 8; v++) R.topSlab(6, 1, v, `${wood}_slab`);
      R.put(6, 2, 7, chance(0.5) ? "lantern" : "cake");
      // TV on a cabinet (on a thin slab it looked like it was floating).
      for (let v = 6; v <= 8; v++) {
        R.put(8, 1, v, v === 7 ? "jukebox" : "bookshelf");
        R.put(8, 2, v, "black_concrete");
      }
      R.floorLamp(4, 4, wood);
      R.floorLamp(4, 10, wood);
      // Bedrooms: beds against the right side, nightstands with lamps.
      for (const v of [3, 6, 9, 12]) {
        R.bed(14, v, "+u");
        R.topSlab(15, 1, v + 1, `${wood}_slab`);
        R.lantern(15, 2, v + 1);
        R.put(13, 1, v, carpet(choice(COLORS)));
      }
      // Fireplace in the back-left corner.
      const brick = first("minecraft:brick_block", "minecraft:stone_bricks");
      R.box(3, 1, 18, 3, 3, 18, brick);
      R.box(6, 1, 18, 6, 3, 18, brick);
      R.box(4, 3, 18, 5, 3, 18, brick);
      R.facing(4, 1, 18, "campfire", "-v");
      R.facing(5, 1, 18, "campfire", "-v");
      R.chair(4, 16, wood, "+v");
      R.chair(5, 16, wood, "+v");
      // Reading nook in the back-right corner.
      R.box(12, 1, 18, 18, 3, 18, "bookshelf");
      R.chair(14, 17, wood, "-v");
      R.chair(16, 17, wood, "-v");
      R.planter(12, 16);
      for (const [u, v] of [[6, 13], [9, 2], [10, 2]]) R.lantern(u, 9, v, true);
    },
  };
}

function utility(R) {
  const base = mc(choice(["polished_andesite", "smooth_stone", "gray_concrete", "stone"]));
  return {
    floor: (u, v) => ((u === 8 || u === 11) && v < 16 ? (v % 2 ? "minecraft:yellow_concrete" : "minecraft:black_concrete") : base),
    light: () => pick(["minecraft:sea_lantern", "minecraft:pearlescent_froglight"]),
    decorate() {
      // Storage racks full of ores, tools and supplies. Nothing goes on top of
      // a chest: a chest with a solid block above it won't open.
      for (let v = 3; v <= 13; v++) {
        for (let h = 1; h <= 3; h++) R.stocked(4, h, v, "barrel", "+u", "supplies", randInt(3, 6));
        if (chance(0.5)) {
          R.stocked(7, 1, v, "chest", "-u", "supplies", randInt(6, 10));
        } else {
          R.stocked(7, 1, v, "barrel", "-u", "supplies", randInt(3, 6));
          if (chance(0.6)) R.stocked(7, 2, v, "barrel", "-u", "supplies", randInt(3, 6));
        }
      }
      // Workshop line on the right.
      for (let v = 3; v <= 13; v++) R.facing(15, 1, v, choice(WORKSTATIONS), "-u");
      // Two boilers with pipes to the ceiling.
      for (const v0 of [4, 9]) {
        R.box(12, 1, v0, 13, 3, v0 + 2, "iron_block");
        R.facing(12, 1, v0 + 1, "blast_furnace", "-u");
        R.box(12, 4, v0 + 1, 12, 9, v0 + 1, "chain");
        R.box(13, 4, v0 + 1, 13, 9, v0 + 1, "chain");
      }
      // Water tanks and lockers in the back corners.
      for (let u = 2; u <= 6; u += 2) { R.put(u, 1, 18, "cauldron"); R.box(u, 2, 18, u, 9, 18, "chain"); }
      R.box(12, 1, 18, 18, 3, 18, "iron_block");
      R.box(12, 1, 17, 18, 1, 17, "iron_bars");
    },
  };
}

function library(R) {
  const wood = pickWood();
  return {
    floor: () => mc(`${wood}_planks`),
    light: "minecraft:glowstone",
    decorate() {
      // Book stacks on the left.
      for (const v of [3, 6, 9, 12]) R.box(4, 1, v, 8, 3, v, "bookshelf");
      // Reading tables on the right.
      for (const v of [5, 10]) {
        for (let u = 12; u <= 14; u++) {
          R.topSlab(u, 1, v, `${wood}_slab`);
          R.chair(u, v - 1, wood, "+v");
          R.chair(u, v + 1, wood, "-v");
        }
        R.lantern(13, 2, v);
      }
      R.facing(15, 1, 8, "lectern", "-u");
      R.box(9, 1, 1, 10, 1, 15, carpet("red"));
      // Wall of books, and an enchanting nook.
      R.box(2, 1, 18, 7, 4, 18, "bookshelf");
      R.box(13, 1, 18, 17, 2, 18, "bookshelf");
      R.box(13, 1, 16, 13, 2, 17, "bookshelf");
      R.box(17, 1, 16, 17, 2, 17, "bookshelf");
      R.put(15, 1, 17, "enchanting_table");
      for (const v of [4, 9, 14]) R.lantern(9, 9, v, true);
    },
  };
}

function garden(R) {
  const path = first("minecraft:grass_path", "minecraft:dirt_path", "minecraft:coarse_dirt");
  const trees = [["oak_log", "oak_leaves"], ["birch_log", "birch_leaves"], ["cherry_log", "cherry_leaves"], ["oak_log", "azalea_leaves"], ["oak_log", "azalea_leaves_flowered"]];
  return {
    floor: (u, v) => (u === 9 || u === 10 || v === 15 ? path : "minecraft:grass_block"),
    light: () => pick(["minecraft:ochre_froglight", "minecraft:shroomlight", "minecraft:glowstone"]),
    decorate() {
      // Two little trees.
      for (const [cu, cv] of [[6, 7], [13, 11]]) {
        const [log, leaves] = choice(trees);
        for (let h = 5; h <= 7; h++) {
          const r = h === 7 ? 1 : 2;
          for (let du = -r; du <= r; du++)
            for (let dv = -r; dv <= r; dv++)
              if (Math.abs(du) + Math.abs(dv) <= r + 1) R.put(cu + du, h, cv + dv, leaves, { persistent_bit: true });
        }
        R.box(cu, 1, cv, cu, 6, cv, log);
      }
      // Pond with lily pads.
      R.box(11, 1, 3, 15, 1, 7, "mossy_stone_bricks");
      R.box(12, 1, 4, 14, 1, 6, "water");
      for (let i = 0; i < 2; i++) R.put(randInt(12, 14), 2, randInt(4, 6), "waterlily");
      R.chair(11, 2, "oak", "+v");
      R.chair(13, 2, "oak", "+v");
      // Flowers everywhere there's grass.
      for (let u = 2; u <= 17; u++) {
        for (let v = 1; v <= 18; v++) {
          if (u === 9 || u === 10 || v === 15 || !chance(0.25)) continue;
          if (R.isAir(u, 1, v)) R.put(u, 1, v, pick(FLOWERS, "minecraft:poppy"));
        }
      }
      for (const [u, v] of [[3, 17], [7, 17], [13, 17], [17, 17]]) R.planter(u, v);
    },
  };
}

function party(R) {
  const tiles = {};
  const lights = ["ochre_froglight", "verdant_froglight", "pearlescent_froglight", "glowstone", "sea_lantern"].map(mc);
  return {
    floor: (u, v) => {
      const key = `${u >> 1},${v >> 1}`;
      tiles[key] ??= chance(0.12) ? pick(lights) : mc(`${choice(COLORS)}_concrete`);
      return tiles[key];
    },
    light: () => pick(lights),
    decorate() {
      // Trampolines.
      R.box(5, 0, 6, 6, 0, 7, "slime");
      R.box(13, 0, 10, 14, 0, 11, "slime");
      // Ball pit.
      R.box(11, 1, 3, 15, 2, 7, "glass");
      for (let u = 12; u <= 14; u++)
        for (let v = 4; v <= 6; v++) {
          R.put(u, 1, v, mc(`${choice(COLORS)}_wool`));
          R.put(u, 2, v, "air");
        }
      // DJ booth and speakers.
      R.put(15, 1, 17, "jukebox");
      R.box(13, 1, 18, 17, 1, 18, "noteblock");
      R.box(12, 1, 18, 12, 3, 18, "noteblock");
      R.box(18, 1, 18, 18, 3, 18, "noteblock");
      // Snack bar with cake.
      for (let u = 2; u <= 6; u++) {
        R.topSlab(u, 1, 17, "smooth_quartz_slab");
        R.chair(u, 16, "oak", "+v");
      }
      R.put(3, 2, 17, "cake");
      R.put(5, 2, 17, "cake");
      for (const [u, v] of [[6, 3], [6, 12], [9, 8], [10, 8], [13, 14]]) R.lantern(u, 9, v, true, "soul_lantern");
    },
  };
}

export const THEMES = {
  lobby: { name: "Lobby", make: lobby },
  office: { name: "Office", make: office },
  dining: { name: "Dining hall", make: dining },
  lounge: { name: "Lounge & bedrooms", make: lounge },
  utility: { name: "Utility & workshop", make: utility },
  library: { name: "Library", make: library },
  garden: { name: "Garden", make: garden },
  party: { name: "Party room", make: party },
};
export const RANDOM_THEMES = Object.keys(THEMES).filter((k) => k !== "lobby");

export function randomTheme(t) {
  if (t.floors === 0) return "lobby";
  const options = RANDOM_THEMES.filter((k) => k !== t.lastTheme);
  return choice(options);
}

// Fill floor k (slab at y) of tower t with layout + theme decor.
export function furnish(t, k, y, ext, themeKey) {
  const R = makeRoom(t, y, k);
  const theme = (THEMES[themeKey] ?? THEMES.office).make(R);
  layFloor(R, theme.floor, ext.car);
  core(R, ext, theme.light);
  theme.decorate();
}
