import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// ---- Tunables -------------------------------------------------------------
const WAND = "minecraft:blaze_rod";
const SIZE = 20;          // footprint (x and z)
const FLOOR_H = 10;       // slab-to-slab height
const GAP = 3;            // blocks between you and the near wall of a new tower
const NEAR = 64;          // "nearby tower" radius from tower center
const MAX_Y = 319;

const B = {
  slab: "minecraft:smooth_stone",
  frame: "minecraft:polished_deepslate",
  wall: "minecraft:white_concrete",
  glass: "minecraft:glass",
  light: "minecraft:sea_lantern",
  parapet: "minecraft:polished_deepslate_slab",
  ladder: 'minecraft:ladder ["facing_direction"=3]', // on the north wall, facing south
};

// Wall columns 0..19: 0/19 corner pillars, 1/9/10/18 solid, rest are windows.
const WINDOW_RUNS = [[2, 8], [11, 17]];
const DOOR = [9, 10];

// ---- Persistence ------------------------------------------------------------
// towers: [{ id, dim, x0, z0, y0, floors, door: "n"|"s"|"e"|"w" }]
function loadTowers() {
  try {
    return JSON.parse(world.getDynamicProperty("tower_wand:towers") ?? "[]");
  } catch {
    return [];
  }
}
function saveTowers(t) {
  world.setDynamicProperty("tower_wand:towers", JSON.stringify(t));
}

function nearestTower(towers, dimId, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const t of towers) {
    if (t.dim !== dimId) continue;
    const cx = t.x0 + SIZE / 2;
    const cz = t.z0 + SIZE / 2;
    const d = Math.hypot(cx - x, cz - z);
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

function buildFloor(t) {
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
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

  // Ceiling with a dark band and some lights.
  fill(x0, top, z0, x1, top, z1, B.slab);
  ring(fill, t, top, top, B.frame);
  for (const [dx, dz] of [[5, 5], [5, 14], [14, 5], [14, 14]]) {
    fill(x0 + dx, top, z0 + dz, x0 + dx, top, z0 + dz, B.light);
  }

  // Ladder in the NW corner, running up through a hole in the ceiling.
  fill(x0 + 1, y + 1, z0 + 1, x0 + 1, top, z0 + 1, B.ladder);

  // Roof parapet (the next floor's walls overwrite it).
  ring(fill, t, top + 1, top + 1, B.parapet);

  // Front door on the ground floor.
  if (k === 0) wallSpan(fill, t, t.door, DOOR[0], DOOR[1], y + 1, y + 3, "minecraft:air");

  t.floors++;
  return { ok: true, msg: `§aFloor ${t.floors} done.` };
}

function removeTopFloor(t) {
  if (t.floors <= 0) return "§cNothing to remove.";
  const dim = world.getDimension(t.dim);
  const fill = makeFiller(dim);
  const k = t.floors - 1;
  const y = t.y0 + k * FLOOR_H;
  const { x0, z0 } = t;
  fill(x0, y + 1, z0, x0 + SIZE - 1, y + FLOOR_H + 1, z0 + SIZE - 1, "minecraft:air");
  if (k > 0) ring(fill, t, y + 1, y + 1, B.parapet);
  t.floors--;
  return `§eRemoved floor ${k + 1}. ${t.floors} left.`;
}

// New tower in front of a position, door facing back toward it.
function newTowerAt(dimId, loc, yaw) {
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
  return { id: Date.now(), dim: dimId, x0, z0, y0: py - 1, floors: 0, door };
}

// ---- Actions ----------------------------------------------------------------
function addFloors(player, n, forceNew = false) {
  const towers = loadTowers();
  const loc = player.location;
  let t = forceNew ? null : nearestTower(towers, player.dimension.id, loc.x, loc.z);
  if (!t) {
    t = newTowerAt(player.dimension.id, loc, player.getRotation().y);
    towers.push(t);
    player.sendMessage(`§bNew tower at ${t.x0} ${t.y0} ${t.z0}.`);
  }
  let msg = "";
  for (let i = 0; i < n; i++) {
    const r = buildFloor(t);
    msg = r.msg;
    if (!r.ok) break;
  }
  saveTowers(towers);
  player.sendMessage(msg);
}

function menu(player) {
  const form = new ActionFormData()
    .title("Tower Wand")
    .body("Plain use adds a floor to the nearest tower.")
    .button("Add 1 floor")
    .button("Add 5 floors")
    .button("New tower in front of me")
    .button("Remove top floor")
    .button("Forget nearest tower");
  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: addFloors(player, 1); break;
      case 1: addFloors(player, 5); break;
      case 2: addFloors(player, 1, true); break;
      case 3: {
        const towers = loadTowers();
        const t = nearestTower(towers, player.dimension.id, player.location.x, player.location.z);
        if (!t) { player.sendMessage("§cNo tower nearby."); return; }
        player.sendMessage(removeTopFloor(t));
        saveTowers(t.floors > 0 ? towers : towers.filter((x) => x !== t));
        break;
      }
      case 4: {
        const towers = loadTowers();
        const t = nearestTower(towers, player.dimension.id, player.location.x, player.location.z);
        if (!t) { player.sendMessage("§cNo tower nearby."); return; }
        saveTowers(towers.filter((x) => x !== t));
        player.sendMessage("§eForgot that tower (blocks left in place).");
        break;
      }
    }
  });
}

// ---- Events -----------------------------------------------------------------
const lastUse = new Map();

function onWand(player, itemStack) {
  if (itemStack?.typeId !== WAND) return;
  const now = Date.now();
  if (now - (lastUse.get(player.id) ?? 0) < 400) return;
  lastUse.set(player.id, now);
  if (player.isSneaking) menu(player);
  else addFloors(player, 1);
}

// Right-click in the air (mouse/controller). Touch screens don't send this for
// items with no use action, so also trigger on tapping a block.
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => onWand(source, itemStack));
world.afterEvents.playerInteractWithBlock.subscribe(({ player, itemStack }) => onWand(player, itemStack));

// /scriptevent tower:floor | tower:new | tower:menu   (works from command blocks too)
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!id.startsWith("tower:") || !sourceEntity || sourceEntity.typeId !== "minecraft:player") return;
  const n = Math.max(1, parseInt(message) || 1);
  if (id === "tower:floor") addFloors(sourceEntity, n);
  else if (id === "tower:new") addFloors(sourceEntity, n, true);
  else if (id === "tower:menu") menu(sourceEntity);
});
