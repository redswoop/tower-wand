import { system } from "@minecraft/server";
import { valid, pick, chance, rand } from "./blocks.js";

const AIR = "minecraft:air";
const FIRE = "minecraft:fire";
const m = (ids) => ids.map((s) => `minecraft:${s}`);

// Scorch palettes, hottest first.
const HEAVY = m(["blackstone", "coal_block", "basalt", "magma", "black_concrete"]);
const BURNED = m(["cobbled_deepslate", "tuff", "deepslate", "gray_concrete", "blackstone", "black_concrete"]);
const DAMAGED = m(["cobblestone", "andesite", "cracked_stone_bricks", "tuff", "cobbled_deepslate", "stone"]);
const RUBBLE = m(["cobblestone_slab", "cobbled_deepslate_slab", "blackstone_slab", "cobblestone", "gravel"]);

// Material-aware damage for the outer ring: same block, just beaten up.
const CRACKED = Object.fromEntries(
  [
    ["stone_bricks", "cracked_stone_bricks"],
    ["deepslate_bricks", "cracked_deepslate_bricks"],
    ["deepslate_tiles", "cracked_deepslate_tiles"],
    ["polished_blackstone_bricks", "cracked_polished_blackstone_bricks"],
    ["nether_brick", "cracked_nether_bricks"],
    ["white_concrete", "light_gray_concrete"],
    ["light_gray_concrete", "gray_concrete"],
    ["grass_block", "coarse_dirt"],
    ["dirt", "coarse_dirt"],
    ["stone", "cobblestone"],
    ["cobblestone", "mossy_cobblestone"],
  ].map(([a, b]) => [`minecraft:${a}`, `minecraft:${b}`])
);

// Shatters farther out than solid blocks.
const WEAK = /glass|pane|leaves|flower|short_grass|tall_grass|fern|sapling|torch|snow_layer|vine|web|carpet|bush|lantern|button|sign|ladder|rail|lever|dandelion|poppy|tulip|daisy|orchid|allium|bluet|cornflower|lily|azalea|mushroom|kelp|seagrass/;
// Never touched (and never recorded).
const PROTECTED = /bedrock|barrier|command_block|structure_block|structure_void|jigsaw|portal|light_block|border_block|^minecraft:allow$|^minecraft:deny$/;

function isProtected(block) {
  if (PROTECTED.test(block.typeId)) return true;
  try { if (block.getComponent("minecraft:inventory")) return true; } catch {}
  return false;
}

function damaged(id) {
  const c = CRACKED[id];
  return c && valid(c) && chance(0.75) ? c : pick(DAMAGED);
}

// d is distance / local radius (0 = center, 1 = edge of the hole). Returns the
// new block id, or null to leave the block alone.
function decide(id, d) {
  if (WEAK.test(id)) return d < 1.3 ? AIR : null;
  if (d < 0.62) return AIR;
  if (d < 0.8) return chance(0.45) ? AIR : pick(HEAVY);
  if (d < 0.95) return chance(0.15) ? AIR : chance(0.5) ? pick(HEAVY) : pick(BURNED);
  if (d < 1.1) return chance(0.6) ? pick(BURNED) : damaged(id);
  if (d < 1.3) return chance(((1.3 - d) / 0.2) * 0.7) ? damaged(id) : null;
  return null;
}

function randUnit() {
  const z = rand(-1, 1);
  const a = rand(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(a), y: r * Math.sin(a), z };
}

function effects(dim, c, R) {
  const at = (dx, dy, dz) => ({ x: c.x + 0.5 + dx, y: c.y + 0.5 + dy, z: c.z + 0.5 + dz });
  const spawn = (id, loc) => { try { dim.spawnParticle(id, loc); } catch {} };
  try { dim.playSound("random.explode", at(0, 0, 0), { volume: 4 + R / 2 }); } catch {}
  spawn("minecraft:huge_explosion_emitter", at(0, 0, 0));
  for (let i = 0; i < R * 2; i++) spawn("minecraft:large_explosion", at(rand(-R, R), rand(-R, R), rand(-R, R)));
  // Lingering smoke for a few seconds.
  for (let t = 0; t < 12; t++) {
    system.runTimeout(() => {
      for (let i = 0; i < 4; i++) spawn("minecraft:campfire_smoke_particle", at(rand(-R, R) * 0.7, rand(-1, R * 0.5), rand(-R, R) * 0.7));
    }, 5 + t * 6);
  }
}

/**
 * Blow a ragged, scorched hole centered on block location c.
 *   R       radius in blocks
 *   fx      sound + particles
 *   fire    short-lived fire on scorched surfaces
 *   record  array to push [location, originalPermutation] into (for undo)
 *   onDone  called when the (multi-tick) job finishes
 */
export function blast(dim, c, R, { fx = true, fire = true, record = null, onDone } = {}) {
  // A few random "lobes" make the hole lumpy instead of a perfect ball.
  const lobes = Array.from({ length: 3 }, () => ({ v: randUnit(), w: rand(0.15, 0.4) }));
  const shape = (dx, dy, dz, dist) => {
    if (dist < 0.001) return 1;
    let f = 0.85;
    for (const { v, w } of lobes) {
      const k = (dx * v.x + dy * v.y + dz * v.z) / dist;
      if (k > 0) f += w * k * k;
    }
    return Math.min(f, 1.3);
  };
  const reach = Math.ceil(R * 1.75);
  const scorched = [];

  const set = (block, id) => {
    if (record) record.push([block.location, block.permutation]);
    block.setType(id);
  };

  if (fx) effects(dim, c, R);

  system.runJob(
    (function* () {
      for (let dy = reach; dy >= -reach; dy--) {
        for (let dx = -reach; dx <= reach; dx++) {
          for (let dz = -reach; dz <= reach; dz++) {
            const dist = Math.hypot(dx, dy, dz);
            if (dist > reach) continue;
            const d = dist / (R * shape(dx, dy, dz, dist) + rand(-0.5, 0.5));
            if (d >= 1.3) continue;
            let block;
            try { block = dim.getBlock({ x: c.x + dx, y: c.y + dy, z: c.z + dz }); } catch { continue; }
            if (!block || block.isAir || block.isLiquid || isProtected(block)) continue;
            const id = decide(block.typeId, d);
            if (!id || id === block.typeId) continue;
            try { set(block, id); } catch { continue; }
            if (id !== AIR && d < 1.0) scorched.push(block);
          }
        }
        yield;
      }

      // Rubble and fire on top of freshly scorched surfaces.
      const fires = [];
      for (const b of scorched) {
        let above;
        try { above = b.above(); } catch { continue; }
        if (!above || !above.isAir) continue;
        if (chance(0.08)) { try { set(above, pick(RUBBLE)); } catch {} }
        else if (fire && fires.length < 20 && chance(0.2)) { try { set(above, FIRE); fires.push(above); } catch {} }
      }
      // Burn out on its own so it can't spread far.
      for (const f of fires) {
        system.runTimeout(() => {
          try { if (f.typeId === FIRE) f.setType(AIR); } catch {}
        }, Math.floor(rand(60, 140)));
      }
      onDone?.();
    })()
  );
}

/** Put back everything a blast recorded, newest change first. */
export function undoRecord(dim, record, onDone) {
  system.runJob(
    (function* () {
      for (let i = record.length - 1; i >= 0; i--) {
        const [loc, perm] = record[i];
        try { dim.getBlock(loc)?.setPermutation(perm); } catch {}
        if (i % 200 === 0) yield;
      }
      onDone?.();
    })()
  );
}
