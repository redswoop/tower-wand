import { world, system } from "@minecraft/server";
import { SIZE, FLOOR_H, ELEVATOR, toLocal } from "./interior.js";
import { KEY } from "./tower.js";

// Stand on the iron floor in the glass shaft at the back of any floor:
// jump = up one floor, sneak = down one floor. Hold to keep going.

const COOLDOWN = 12; // ticks between moves
const cooldown = new Map();

// Re-parse the tower list only when it changes.
let cachedRaw = null;
let cached = [];
function towers() {
  const raw = world.getDynamicProperty(KEY) ?? "[]";
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try { cached = JSON.parse(raw); } catch { cached = []; }
  }
  return cached;
}

// Add-ons can't reliably see a player's jump input or speed, so a jump is
// "your feet are clearly above the elevator floor".
function jumping(p, standY) {
  return p.isJumping === true || p.location.y - standY > 0.25;
}

function inCar(p) {
  const loc = p.location;
  const x = Math.floor(loc.x);
  const z = Math.floor(loc.z);
  for (const t of towers()) {
    if (!t.ext || t.dim !== p.dimension.id) continue;
    if (x < t.x0 || x >= t.x0 + SIZE || z < t.z0 || z >= t.z0 + SIZE) continue;
    const [u, v] = toLocal(t, x, z);
    if (u < ELEVATOR.u1 || u > ELEVATOR.u2 || v < ELEVATOR.v1 || v > ELEVATOR.v2) return null;
    const k = Math.round((loc.y - 1 - t.y0) / FLOOR_H);
    const lo = t.layoutFrom ?? 0;
    if (k < lo || k >= t.floors) return null;
    if (Math.abs(loc.y - (t.y0 + k * FLOOR_H + 1)) > 1.6) return null;
    return { t, k, lo, standY: t.y0 + k * FLOOR_H + 1 };
  }
  return null;
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const car = inCar(p);
    if (!car) continue;
    const { t, k, lo, standY } = car;
    const up = k + 1 < t.floors;
    const down = k > lo;
    const hint = up && down ? "§7Jump = up   Sneak = down" : up ? "§7Jump = up" : down ? "§7Top floor. Sneak = down" : "§7Add a floor to ride the elevator";
    try { p.onScreenDisplay.setActionBar(`§bElevator§r  floor ${k + 1} of ${t.floors}\n${hint}`); } catch {}
    if ((cooldown.get(p.id) ?? 0) > now) continue;
    let to = null;
    if (jumping(p, standY) && k + 1 < t.floors) to = k + 1;
    else if (p.isSneaking && k - 1 >= lo) to = k - 1;
    if (to === null) continue;
    cooldown.set(p.id, now + COOLDOWN);
    const dest = { x: p.location.x, y: t.y0 + to * FLOOR_H + 1, z: p.location.z };
    try {
      p.teleport(dest);
      p.dimension.playSound("random.orb", dest, { pitch: to > k ? 1.4 : 0.8 });
    } catch {}
  }
}, 2);
