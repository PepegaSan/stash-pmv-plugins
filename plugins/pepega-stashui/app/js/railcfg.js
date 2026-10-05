// The menu on the left: what is in it and how this browser arranged it (Home → Customize → Sidebar).
// Layout = ordered groups with item ids, plus hidden ids. Items that appear later (a new menu entry in an
// update, a newly installed plugin) are put into their default group, so nothing is ever lost.

import { store, folderMode } from "./ui.js";

export const NAV = [
  { group: null, items: [
    { href: "", label: "Start", icon: "home", match: /^$/ },
    { href: "search", label: "Search", icon: "search", match: /^search/ },
  ] },
  { group: "Library", items: [
    { href: "scenes", label: "Scenes", icon: "film", match: /^scene/, count: "scene_count" },
    { href: "images", label: "Images", icon: "image", match: /^image/, count: "image_count" },
    { href: "galleries", label: "Galleries", icon: "book", match: /^galler/, count: "gallery_count" },
    { href: "studios", label: "Studios", icon: "studio", match: /^studio/ },
    { href: "groups", label: "Groups", icon: "layers", match: /^group/ },
    { href: "performers", label: "Performers", icon: "person", match: /^performer/, count: "performer_count" },
    { href: "tags", label: "Tags", icon: "tag", match: /^tag/, count: "tag_count" },
  ] },
  { group: "Watch", items: [
    { href: "queue", label: "Queue", icon: "queue", match: /^queue/, count: "queue" },
    { href: "playlists", label: "Playlists", icon: "slides", match: /^playlists/ },
    { href: "interactive", label: "Interactive", icon: "plug", match: /^interactive/ },
    { href: "markers", label: "Markers", icon: "play", match: /^markers/ },
    { href: "history", label: "History", icon: "history", match: /^history/ },
    { href: "versus", label: "Versus", icon: "trophy", match: /^versus/ },
    { action: "storm", label: "Media Storm", icon: "bolt", plugin: "mediaStorm" },
    { action: "pmv", label: "PMV Generator Pepega", icon: "music", plugin: "pepega-pmvGenerator" },
  ] },
  { group: "Manage", items: [
    { href: "tasks", label: "Tasks", icon: "tasks", match: /^tasks/, count: "jobs" },
    { href: "stats", label: "Statistics", icon: "chart", match: /^stats/ },
    { action: "log", label: "Log", icon: "logs" },
    { href: "duplicates", label: "Duplicates", icon: "copies", match: /^duplicates/ },
    { href: "settings", label: "Settings", icon: "gear", match: /^settings/ },
    { href: "plugins", label: "Plugins", icon: "plug", match: /^plugins/ },
    { href: "whatsnew", label: "What's new", icon: "info", match: /^whatsnew/, count: "news" },
    { href: "extern/classic", label: "Classic Stash", icon: "door", match: /^extern\/classic/ },
  ] },
];

const KEY = "railLayout";
const FOLDERS = "folders";
// Never hideable (you could lock yourself out of the way back): Start and Settings
export const LOCKED = new Set(["p:", "p:settings"]);
export const navId = (it) => (it.action ? "a:" + it.action : "p:" + it.href);

// Default: the groups above; Extensions after Watch; the folder tree at the end of Library
function defaults() {
  const groups = [];
  const items = new Map(); // id → default group key
  for (const g of NAV) {
    const key = g.group || "";
    const ids = g.items.map(navId);
    if (key === "Library") ids.push(FOLDERS);
    groups.push({ key, items: ids });
    ids.forEach((id) => items.set(id, key));
    if (key === "Watch") groups.push({ key: "Extensions", items: [] });
  }
  return { groups, items };
}

// Everything that exists right now (id → entry)
export function catalog() {
  const m = new Map();
  for (const g of NAV) for (const it of g.items) m.set(navId(it), { id: navId(it), nav: it });
  m.set(FOLDERS, { id: FOLDERS, folders: true });
  const mode = store.get("extMode", "show");
  const off = new Set(store.get("extHidden", []));
  if (mode !== "hide") {
    for (const f of store.get("extFound", [])) {
      if (!f.href || off.has(f.id)) continue;
      m.set("x:" + f.id, { id: "x:" + f.id, ext: f });
    }
  }
  return m;
}

// Saved layout (or the default) + everything known that isn't in it yet
export function loadRail() {
  const d = defaults();
  const raw = store.get(KEY, null);
  const groups = [];
  const seen = new Set();
  for (const g of (raw && Array.isArray(raw.groups) ? raw.groups : [])) {
    if (!g || typeof g.key !== "string" || groups.some((x) => x.key === g.key)) continue;
    const items = (Array.isArray(g.items) ? g.items : []).filter((id) => typeof id === "string" && !seen.has(id) && seen.add(id));
    groups.push(g.name != null ? { key: g.key, name: String(g.name), items } : { key: g.key, items });
  }
  // The group without a heading comes first; the built-in groups always exist
  if (!groups.length || groups[0].key !== "") {
    const i = groups.findIndex((g) => g.key === "");
    groups.unshift(i < 0 ? { key: "", items: [] } : groups.splice(i, 1)[0]);
  }
  d.groups.forEach((dg, di) => {
    if (groups.some((g) => g.key === dg.key)) return;
    groups.splice(Math.min(di, groups.length), 0, { key: dg.key, items: [] });
  });
  // Known but missing → its default group, behind its default predecessor
  const defOrder = new Map(d.groups.map((g) => [g.key, g.items]));
  for (const id of catalog().keys()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const key = d.items.get(id) ?? "Extensions";
    const g = groups.find((x) => x.key === key) || groups[groups.length - 1];
    const order = defOrder.get(key) || [];
    let at = g.items.length;
    for (let i = order.indexOf(id) - 1; i >= 0; i--) {
      const p = g.items.indexOf(order[i]);
      if (p >= 0) { at = p + 1; break; }
    }
    g.items.splice(at, 0, id);
  }
  const hidden = (raw && Array.isArray(raw.hidden) ? raw.hidden : []).filter((id) => !LOCKED.has(id));
  return { groups, hidden };
}

export function saveRail(layout) {
  store.set(KEY, layout);
  window.dispatchEvent(new Event("stash:rail-changed"));
}
export function resetRail() {
  store.set(KEY, null);
  window.dispatchEvent(new Event("stash:rail-changed"));
}
export const isCustomRail = () => store.get(KEY, null) != null;

// What the menu shows: groups with their visible entries (empty groups drop out)
export function visibleRail() {
  const layout = loadRail();
  const cat = catalog();
  const off = new Set(layout.hidden);
  const mode = folderMode();
  return layout.groups
    .map((g) => ({
      key: g.key,
      name: g.name,
      custom: g.name != null,
      items: g.items.filter((id) => cat.has(id) && !off.has(id) && (id !== FOLDERS || mode === "all")).map((id) => cat.get(id)),
    }))
    .filter((g) => g.items.length);
}
