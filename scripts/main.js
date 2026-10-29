import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
  loadTowers, saveTowers, towerUnder, nearestTower, overlaps,
  buildFloor, removeTopFloor, newTowerAt,
} from "./tower.js";
import { blast, undoRecord } from "./blast.js";
import { THEMES } from "./interior.js";
import "./elevator.js";

export const VERSION = "1.2.1"; // keep in sync with manifest.json (build.sh checks)
const TOWER_WAND = "minecraft:blaze_rod";
const BLAST_WAND = "minecraft:fire_charge";
const BLAST_SIZES = { normal: 4, big: 6, huge: 9 };
const UNDO_DEPTH = 5;

// ---- Towers -----------------------------------------------------------------
// The tower you're standing in (or on), else the closest one nearby.
function targetTower(towers, player) {
  return towerUnder(towers, player.dimension.id, player.location) ??
    nearestTower(towers, player.dimension.id, player.location);
}

function build(player, t, towers, n, opts) {
  let msg = "";
  for (let i = 0; i < n; i++) {
    const r = buildFloor(t, opts);
    msg = r.msg;
    if (!r.ok) break;
  }
  saveTowers(towers);
  player.sendMessage(msg);
}

// Plain tap: grow the tower you're in; anywhere else, start a new one in front
// of you (or grow the one that new tower would bump into).
function tap(player) {
  const towers = loadTowers();
  let t = towerUnder(towers, player.dimension.id, player.location);
  if (!t) {
    const candidate = newTowerAt(player.dimension.id, player.location, player.getRotation().y);
    t = towers.find((o) => o.dim === candidate.dim && overlaps(o, candidate));
    if (!t) {
      t = candidate;
      towers.push(t);
      player.sendMessage("§bNew building!");
    }
  }
  build(player, t, towers, 1);
}

// Sneak + blaze rod: pick what kind of floor to add (or other tower actions).
function towerMenu(player) {
  const themeKeys = Object.keys(THEMES);
  const actions = [
    ["Random floor", (t, towers) => build(player, t, towers, 1)],
    ...themeKeys.map((key) => [THEMES[key].name, (t, towers) => build(player, t, towers, 1, { theme: key })]),
    ["Wrecked floor (random)", (t, towers) => build(player, t, towers, 1, { ruined: true })],
    ["Add 5 random floors", (t, towers) => build(player, t, towers, 5)],
    ["New building in front of me", (_, towers) => build(player, fresh(player, towers), towers, 1)],
    ["Remove top floor", (t, towers) => {
      if (!t) { player.sendMessage("§cNo building nearby."); return; }
      player.sendMessage(removeTopFloor(t));
      saveTowers(t.floors > 0 ? towers : towers.filter((x) => x !== t));
    }],
    ["Undo last blast", () => undoBlast(player)],
  ];
  const form = new ActionFormData()
    .title("Tower Wand")
    .body("Pick the next floor for the building you're in (or the closest one). A plain tap adds a random floor.");
  for (const [label] of actions) form.button(label);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    const towers = loadTowers();
    const t = targetTower(towers, player);
    const [label, run] = actions[res.selection];
    // Floor-adding actions start a new building if there's none nearby.
    const needsTower = !["Remove top floor", "Undo last blast", "New building in front of me"].includes(label);
    run(t ?? (needsTower ? fresh(player, towers) : null), towers);
  });
}

function fresh(player, towers) {
  const n = newTowerAt(player.dimension.id, player.location, player.getRotation().y);
  towers.push(n);
  return n;
}

// ---- Blasts -----------------------------------------------------------------
const undoStacks = new Map(); // player.id -> [{ dim, record }]

function boom(player, loc, size) {
  const record = [];
  const stack = undoStacks.get(player.id) ?? [];
  stack.push({ dim: player.dimension.id, record });
  while (stack.length > UNDO_DEPTH) stack.shift();
  undoStacks.set(player.id, stack);
  blast(player.dimension, { x: loc.x, y: loc.y, z: loc.z }, BLAST_SIZES[size], { record });
}

function undoBlast(player) {
  const last = undoStacks.get(player.id)?.pop();
  if (!last) { player.sendMessage("§cNo blast to undo."); return; }
  undoRecord(world.getDimension(last.dim), last.record, () => player.sendMessage("§aBlast undone."));
}

function blastMenu(player, loc) {
  new ActionFormData()
    .title("Blast Wand")
    .body("Tap a block for a normal blast.")
    .button("Big blast")
    .button("HUGE blast")
    .button("Undo last blast")
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      if (res.selection === 2) undoBlast(player);
      else if (!loc) player.sendMessage("§cPoint at a block first.");
      else boom(player, loc, res.selection === 0 ? "big" : "huge");
    });
}

// ---- Events -----------------------------------------------------------------
const lastUse = new Map();

function debounced(player) {
  const now = Date.now();
  if (now - (lastUse.get(player.id) ?? 0) < 400) return false;
  lastUse.set(player.id, now);
  return true;
}

// loc: the block that was tapped, if any.
function onUse(player, itemStack, loc) {
  const id = itemStack?.typeId;
  if (id !== TOWER_WAND && id !== BLAST_WAND) return;
  if (!debounced(player)) return;
  if (id === TOWER_WAND) {
    if (player.isSneaking) towerMenu(player);
    else tap(player);
    return;
  }
  // Right-click in the air: blast whatever you're looking at.
  loc ??= player.getBlockFromViewDirection({ maxDistance: 96 })?.block.location;
  if (player.isSneaking) blastMenu(player, loc);
  else if (loc) boom(player, loc, "normal");
}

// Right-click in the air (mouse/controller). Touch screens don't send this for
// items with no use action, so also trigger on tapping a block. The before-event
// fires on every attempt (the after-event only when something happens), but is
// read-only, so the work is deferred to the next tick.
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => onUse(source, itemStack));
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  if (id !== TOWER_WAND && id !== BLAST_WAND) return;
  ev.cancel = true; // no opening doors/chests or lighting fires with the wands
  if (ev.isFirstEvent === false) return; // holding a tap repeats the event
  const { player, itemStack } = ev;
  const loc = ev.block.location;
  system.run(() => onUse(player, itemStack, loc));
});

// Say which version is running, so it's easy to tell after an update.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) player.sendMessage(`§7Tower Wand ${VERSION} loaded. Blaze rod = build, fire charge = blast.`);
});

// /scriptevent tower:floor|new|menu|undo   (works from command blocks via execute as @p)
system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: p }) => {
  if (!id.startsWith("tower:") || p?.typeId !== "minecraft:player") return;
  if (id === "tower:floor") tap(p);
  else if (id === "tower:menu") towerMenu(p);
  else if (id === "tower:undo") undoBlast(p);
});
