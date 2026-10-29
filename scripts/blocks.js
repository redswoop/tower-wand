import { BlockTypes, BlockPermutation } from "@minecraft/server";

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

// First valid id in the list (for "use X, or Y if this version lacks X").
export function first(...ids) {
  return ids.find(valid) ?? null;
}

// Resolve a permutation, trying each state set in turn (state names differ
// between blocks and versions), then the default state. null if the block
// doesn't exist at all.
const perms = new Map();
export function perm(id, ...variants) {
  const key = id + JSON.stringify(variants);
  if (perms.has(key)) return perms.get(key);
  let p = null;
  if (valid(id)) {
    for (const st of [...variants, null]) {
      try { p = st ? BlockPermutation.resolve(id, st) : BlockPermutation.resolve(id); break; } catch {}
    }
  }
  perms.set(key, p);
  return p;
}

export const mc = (s) => (s.includes(":") ? s : `minecraft:${s}`);
export const chance = (p) => Math.random() < p;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
