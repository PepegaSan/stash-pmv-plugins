// Tiers (S–F) of scenes, images and performers from the Versus standings, for the places that show or filter by
// them: the badge on cards and in the placard, the tier filter in lists and playlists. (How a tier is worked
// out: versusx.js, tiersOf. The standings: standings.js.)

import { loadStandings } from "./standings.js";
import { tiersOf } from "./versusx.js";

let maps = null; // { scene: Map(id → "S"…"F"), image: …, performer: … }
let loading = null;

// Loads the standings (cached for a minute) and works the tiers out – call before showing anything with a tier
export function ensureTiers(force) {
  if (maps && !force) return Promise.resolve(maps);
  if (loading && !force) return loading;
  loading = loadStandings(force)
    .then((data) => {
      maps = {};
      ["scene", "image", "performer"].forEach((k) => (maps[k] = tiersOf((data || {})[k]).map));
      return maps;
    })
    .catch(() => (maps = maps || {}))
    .finally(() => (loading = null));
  return loading;
}
// What's known right now (nothing before ensureTiers has finished)
export const tierNow = (kind, id) => (maps && maps[kind] ? maps[kind].get(String(id)) : undefined);
export const hasTiers = (kind) => !!(maps && maps[kind] && maps[kind].size);
// The ids that have one of these tiers – for the "ids" argument of Stash's queries. Nothing matches → ["-1"] (an empty list would mean "all")
export function idsOfTiers(kind, tiers) {
  if (!tiers || !tiers.length) return null;
  const out = [];
  ((maps && maps[kind]) || new Map()).forEach((t, id) => tiers.includes(t) && out.push(id));
  return out.length ? out : ["-1"];
}
