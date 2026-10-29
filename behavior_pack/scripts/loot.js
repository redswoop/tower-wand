import { system, ItemStack, ItemTypes } from "@minecraft/server";
import { randInt } from "./blocks.js";

// [item, min, max, weight]
const SUPPLIES = [
  // Ores and gems
  ["iron_ingot", 4, 16, 6], ["gold_ingot", 2, 8, 4], ["copper_ingot", 4, 16, 4],
  ["diamond", 1, 4, 3], ["emerald", 1, 4, 2], ["coal", 8, 32, 6],
  ["redstone", 4, 16, 4], ["lapis_lazuli", 4, 16, 3], ["quartz", 4, 16, 2],
  ["raw_iron", 4, 12, 3], ["raw_gold", 2, 6, 2], ["raw_copper", 4, 12, 2],
  ["iron_ore", 2, 8, 2], ["gold_ore", 1, 4, 1], ["diamond_ore", 1, 2, 1],
  ["iron_block", 1, 2, 1], ["gold_block", 1, 1, 1], ["diamond_block", 1, 1, 0.3],
  // Tools
  ["iron_pickaxe", 1, 1, 3], ["diamond_pickaxe", 1, 1, 1], ["iron_axe", 1, 1, 2],
  ["iron_shovel", 1, 1, 2], ["iron_sword", 1, 1, 2], ["diamond_sword", 1, 1, 1],
  ["shears", 1, 1, 1], ["bucket", 1, 2, 2], ["flint_and_steel", 1, 1, 1],
  ["compass", 1, 1, 1], ["clock", 1, 1, 1], ["spyglass", 1, 1, 1],
  ["fishing_rod", 1, 1, 1], ["bow", 1, 1, 1], ["arrow", 16, 32, 2],
  // Supplies
  ["torch", 16, 64, 5], ["lantern", 2, 8, 2], ["ladder", 8, 32, 2],
  ["rail", 16, 32, 2], ["powered_rail", 4, 8, 1], ["minecart", 1, 1, 1],
  ["tnt", 2, 6, 2], ["obsidian", 2, 8, 1], ["glass", 16, 32, 2],
];

const FOOD = [
  ["bread", 4, 12, 6], ["cooked_beef", 4, 12, 5], ["cooked_porkchop", 4, 12, 4],
  ["cooked_chicken", 4, 12, 4], ["cooked_mutton", 4, 12, 3], ["cooked_salmon", 4, 10, 3],
  ["cooked_cod", 4, 10, 3], ["baked_potato", 4, 12, 4], ["apple", 4, 12, 4],
  ["golden_carrot", 2, 8, 2], ["golden_apple", 1, 2, 1], ["pumpkin_pie", 2, 6, 3],
  ["cookie", 8, 16, 3], ["cake", 1, 1, 2], ["melon_slice", 8, 16, 3],
  ["sweet_berries", 8, 16, 2], ["glow_berries", 4, 12, 1], ["carrot", 4, 12, 2],
  ["honey_bottle", 2, 4, 2], ["mushroom_stew", 1, 1, 1], ["rabbit_stew", 1, 1, 1],
  ["beetroot_soup", 1, 1, 1], ["dried_kelp", 8, 16, 1],
];

export const LOOT = { supplies: SUPPLIES, food: FOOD };

const knownItem = new Map();
function exists(id) {
  if (!knownItem.has(id)) {
    let ok = false;
    try { ok = !!ItemTypes.get(id); } catch {}
    knownItem.set(id, ok);
  }
  return knownItem.get(id);
}

function roll(table) {
  const ok = table.filter(([id]) => exists(`minecraft:${id}`));
  let r = Math.random() * ok.reduce((s, e) => s + e[3], 0);
  for (const e of ok) {
    r -= e[3];
    if (r <= 0) return e;
  }
  return ok[ok.length - 1];
}

/** Put `stacks` random stacks from a loot table into random slots of a container block. */
export function stock(dim, loc, table, stacks) {
  // The block entity (and its inventory) appears a moment after the block is placed.
  system.runTimeout(() => {
    let inv;
    try { inv = dim.getBlock(loc)?.getComponent("minecraft:inventory")?.container; } catch {}
    if (!inv) return;
    const slots = [...Array(inv.size).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(stacks, slots.length); i++) {
      const e = roll(table);
      if (!e) return;
      const [id, lo, hi] = e;
      try { inv.setItem(slots[i], new ItemStack(`minecraft:${id}`, randInt(lo, hi))); } catch {}
    }
  }, 2);
}

