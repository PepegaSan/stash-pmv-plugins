// Smart playlists: a saved filter (everything the scene and image lists can filter by) under a name.
// Always up to date – whatever matches now is in it. Kept in Stash (Stash UI's plugin settings), so
// they're the same in every browser, and the PMV Generator can take its clips from one.
// A playlist: { id, name, kind: "scene" | "image", query: { q, sort, dir, tags, … as in the list's URL }, labels: { id: name } }

import { ratingFilterMin } from "./ui.js";
import { advToFilter, andInto } from "./advfilter.js";
import { gql, pluginConfig, setPluginConfig } from "./api.js";

// The list's URL parameters that make up a playlist
export const QUERY_KEYS = ["q", "sort", "dir", "tags", "xtags", "perfs", "pany", "studios", "rating", "fav", "played", "ori", "res", "len", "ia", "tier", "crit", "adv"];

// URL parameters → filter state (as the lists keep it)
export function stateOf(q = {}) {
  const list = (v) => String(v || "").split(",").filter(Boolean);
  return {
    q: q.q || "",
    sort: q.sort || "created_at",
    dir: q.dir || (["title", "path"].includes(q.sort) ? "ASC" : "DESC"),
    tags: list(q.tags),
    xtags: list(q.xtags),
    perfs: list(q.perfs),
    pany: q.pany === "1" || q.pany === true,
    studios: list(q.studios), // only these studios (and their sub-studios)
    rating: Number(q.rating || 0),
    fav: q.fav === "1" || q.fav === true,
    played: q.played || "",
    ori: q.ori || "",
    res: q.res || "",
    len: q.len || "",
    ia: q.ia || "", // funscript: yes | no
    tier: list(q.tier), // only these tiers (S–F, from the Versus standings)
    crit: q.crit || "", // detailed rating: "Name:min,Name:min"
    adv: q.adv || "", // advanced filter: JSON list of [field, modifier, value, value2] (advfilter.js)
    seed: q.seed || "",
  };
}

// Filter state → Stash's filter. base: a page's own restriction ({ filter, tagId }).
export function filterOf(kind, st, favId, base) {
  const f = Object.assign({}, base && base.filter);
  const inc = [...st.tags];
  if (base && base.tagId) inc.unshift(base.tagId);
  if (st.fav && favId) inc.push(favId);
  if (inc.length || st.xtags.length) {
    f.tags = { value: [...new Set(inc)], modifier: "INCLUDES_ALL", depth: 0 };
    if (st.xtags.length) f.tags.excludes = st.xtags;
  }
  if (st.perfs.length) {
    // On a performer's page the page's own performer stays in: then all of them together
    const page = f.performers ? f.performers.value : [];
    f.performers = page.length
      ? { value: [...new Set([...page, ...st.perfs])], modifier: "INCLUDES_ALL" }
      : { value: st.perfs, modifier: st.pany ? "INCLUDES" : "INCLUDES_ALL" };
  }
  if (st.studios && st.studios.length && !f.studios) f.studios = { value: st.studios, modifier: "INCLUDES", depth: -1 };
  if (st.rating) f.rating100 = { value: ratingFilterMin(st.rating), modifier: "GREATER_THAN" };
  if (kind === "scene") {
    if (st.played === "yes") f.play_count = { value: 0, modifier: "GREATER_THAN" };
    if (st.played === "no") f.play_count = { value: 0, modifier: "EQUALS" };
    if (st.played === "resume") f.resume_time = { value: 5, modifier: "GREATER_THAN" };
    if (st.res) f.resolution = { value: st.res, modifier: "GREATER_THAN" };
    if (st.len === "short") f.duration = { value: 60, modifier: "LESS_THAN" };
    if (st.len === "mid") f.duration = { value: 60, value2: 600, modifier: "BETWEEN" };
    if (st.len === "long") f.duration = { value: 600, modifier: "GREATER_THAN" };
    if (st.ia) f.interactive = st.ia === "yes";
  }
  if (st.ori && kind !== "gallery") f.orientation = { value: [st.ori] };
  if (st.adv) andInto(f, advToFilter(kind, st.adv));
  return f;
}

// How Stash is asked for a playlist's items (sort; random gets a new order every time)
export function findOf(pl, extra) {
  const st = stateOf(pl.query);
  const sort = st.sort === "random" ? "random_" + Math.floor(Math.random() * 1e8) : st.sort;
  return Object.assign({ q: st.q || undefined, sort, direction: st.dir }, extra);
}

export async function loadPlaylists() {
  const cfg = await pluginConfig("stashui");
  try {
    const list = JSON.parse(cfg.playlists || "[]");
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.query) : [];
  } catch (e) {
    return [];
  }
}
export async function savePlaylists(list) {
  await setPluginConfig("stashui", { playlists: JSON.stringify(list) });
  window.dispatchEvent(new Event("stash:playlists-changed")); // the menu lists them
}

// Names of the tags and performers in a filter (kept with the playlist, for its description)
export async function labelsFor(st) {
  const labels = {};
  const one = (q, id, key) =>
    gql(q, { id })
      .then((d) => d[key] && (labels[id] = d[key].name))
      .catch(() => {});
  await Promise.all([
    ...[...st.tags, ...st.xtags].map((id) => one(`query($id: ID!) { findTag(id: $id) { id name } }`, id, "findTag")),
    ...st.perfs.map((id) => one(`query($id: ID!) { findPerformer(id: $id) { id name } }`, id, "findPerformer")),
    ...(st.studios || []).map((id) => one(`query($id: ID!) { findStudio(id: $id) { id name } }`, id, "findStudio")),
  ]);
  return labels;
}

// The list's link for a playlist (to look at or change it)
export function linkOf(pl) {
  const q = new URLSearchParams();
  QUERY_KEYS.forEach((k) => pl.query[k] && q.set(k, pl.query[k]));
  q.set("pl", pl.id);
  return `#/${pl.kind === "image" ? "images" : "scenes"}?${q}`;
}
