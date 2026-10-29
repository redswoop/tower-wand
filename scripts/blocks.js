import { BlockTypes } from "@minecraft/server";

// Block ids drift between Bedrock versions, so every id we place is checked
// against the running game and silently dropped/replaced if unknown.
const known = new Map();

export function valid(id) {
  if (!known.has(id)) {
    let ok = false;
    try { ok = !!BlockTypes.get(id); } catch {}
    known.set(id, ok);
  }
  return known.get(id);
}

export function pick(ids, fallback = "minecraft:cobblestone") {
  const ok = ids.filter(valid);
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : fallback;
}

export const chance = (p) => Math.random() < p;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
