// Stash's own saved filters (the ones saved in the classic interface): listed next to the playlists in the
// "Saved filters" menu of Scenes and Images. A saved filter's criteria are turned into the GraphQL filter
// they stand for and applied on top of whatever else is set here; criteria this can't turn are counted
// and mentioned, not guessed.

import { gql } from "./api.js";

const MODE = { scene: "SCENES", image: "IMAGES" };
const Q = `query($m: FilterMode) { findSavedFilters(mode: $m) { id name mode find_filter { q sort direction } object_filter } }`;
const cache = new Map(); // kind → Promise<SavedFilter[]>

export function loadStashFilters(kind) {
  if (!MODE[kind]) return Promise.resolve([]);
  if (!cache.has(kind)) {
    const p = gql(Q, { m: MODE[kind] }).then((d) => d.findSavedFilters || []);
    p.catch(() => cache.delete(kind)); // asked again next time
    cache.set(kind, p);
  }
  return cache.get(kind);
}
export const forgetStashFilters = () => cache.clear();

const ids = (list) => (Array.isArray(list) ? list : []).map((x) => String(x && typeof x === "object" ? x.id : x)).filter((x) => x && x !== "undefined");
const NULLISH = new Set(["IS_NULL", "NOT_NULL"]);
const BOOL = new Set(["organized", "interactive", "performer_favorite", "ignore_auto_tag", "favorite"]);
const FLAG_STRING = new Set(["has_markers", "is_missing"]); // asked as "true" / "false"
const INT = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Math.round(Number(v)));

// One saved criterion → the GraphQL criterion (undefined = can't be turned)
function criterion(key, c) {
  if (!c || typeof c !== "object") return undefined;
  const modifier = c.modifier || undefined;
  const v = c.value;
  if (BOOL.has(key)) {
    const b = typeof v === "boolean" ? v : String(v) === "true" ? true : String(v) === "false" ? false : null;
    return b == null ? undefined : b;
  }
  if (FLAG_STRING.has(key)) return typeof v === "boolean" || v === "true" || v === "false" ? String(v) : undefined;
  if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.items)) {
    // tags, performers, studios …: chosen items (+ excluded ones), tags and studios with the depth
    const out = { value: ids(v.items), modifier: modifier || "INCLUDES" };
    if (Array.isArray(v.excluded) && v.excluded.length) out.excludes = ids(v.excluded);
    if (v.depth != null) out.depth = Number(v.depth);
    if (NULLISH.has(out.modifier)) delete out.value;
    return out;
  }
  if (v && typeof v === "object" && !Array.isArray(v) && ("value" in v || "value2" in v)) {
    // a number or a date (or a range of them)
    const num = INT(v.value) != null && (v.value2 == null || INT(v.value2) != null) && !/[-:T]/.test(String(v.value)); // (a date has dashes)
    const out = { modifier: modifier || "EQUALS" };
    out.value = num ? INT(v.value) : String(v.value ?? "");
    if (v.value2 != null && v.value2 !== "") out.value2 = num ? INT(v.value2) : String(v.value2);
    return out;
  }
  if (Array.isArray(v)) {
    // a choice of fixed values (orientation …)
    return v.length && v.every((x) => typeof x === "string") ? { value: v } : undefined;
  }
  if (NULLISH.has(modifier)) return { modifier, value: typeof v === "number" ? 0 : "" };
  if (typeof v === "number") return { value: Math.round(v), modifier: modifier || "EQUALS" };
  if (typeof v === "string") return { value: v, modifier: modifier || (key === "resolution" ? "EQUALS" : "INCLUDES") };
  return undefined;
}

// object_filter → { filter, skipped: [criterion names] }
export function convert(obj) {
  const filter = {};
  const skipped = [];
  const src = obj && typeof obj === "object" ? obj : {};
  for (const [key, c] of Object.entries(src)) {
    let g;
    try {
      g = criterion(key, c);
    } catch (e) {
      g = undefined;
    }
    if (g === undefined || (typeof g === "object" && g.value === null)) skipped.push(key);
    else filter[key] = g;
  }
  return { filter, skipped };
}

// A saved filter by id, ready to apply: { id, name, kind, q, sort, dir, filter, skipped }
export async function stashFilter(kind, id) {
  const sf = (await loadStashFilters(kind)).find((x) => String(x.id) === String(id));
  if (!sf) return null;
  const { filter, skipped } = convert(sf.object_filter);
  const ff = sf.find_filter || {};
  return { id: String(sf.id), name: sf.name, kind, q: ff.q || "", sort: ff.sort || "", dir: ff.direction || "", filter, skipped };
}
