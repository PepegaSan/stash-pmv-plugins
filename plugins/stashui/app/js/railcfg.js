// The menu on the left: what is in it and how this browser arranged it (Home → Customize → Sidebar).
// Layout = ordered groups with item ids, plus hidden ids. Items that appear later (a new menu entry in an
// update, a newly installed plugin) are put into their default group, so nothing is ever lost.

import { store, esc, icon, inlineSvg } from "./ui.js";
import { navItems, hasNav } from "./ext.js";

export const NAV = [
  { group: null, items: [
    { href: "", label: "Start", icon: "home", match: /^$/ },
    { href: "search", label: "Search", icon: "search", match: /^search/ },
  ] },
  { group: "Library", items: [
    { href: "scenes", label: "Scenes", icon: "film", match: /^scene/, count: "scene_count" },
    { href: "images", label: "Images", icon: "image", match: /^image/, count: "image_count" },
    { href: "galleries", label: "Galleries", icon: "book", match: /^galler/, count: "gallery_count" },
    { href: "video-folders", label: "Video folders", icon: "folder", match: /^video-folders/ },
    { href: "studios", label: "Studios", icon: "studio", match: /^studio/ },
    { href: "groups", label: "Groups", icon: "layers", match: /^group/ },
    { href: "performers", label: "Performers", icon: "person", match: /^performer/, count: "performer_count" },
    { href: "tags", label: "Tags", icon: "tag", match: /^tags?(\/|$)/, count: "tag_count" },
  ] },
  { group: "Watch", items: [
    { href: "queue", label: "Queue", icon: "queue", match: /^queue/, count: "queue" },
    { href: "playlists", label: "Playlists", icon: "slides", match: /^playlists/ },
    { href: "interactive", label: "Interactive", icon: "plug", match: /^interactive/ },
    { href: "markers", label: "Markers", icon: "play", match: /^markers/ },
    { href: "history", label: "History", icon: "history", match: /^history/ },
    { href: "versus", label: "Versus", icon: "trophy", match: /^versus/ },
    { action: "storm", label: "Media Storm", icon: "bolt", plugin: "mediaStorm" },
    { action: "pmv", label: "PMV Generator", icon: "music", plugin: "pmvGenerator" },
  ] },
  { group: "Manage", items: [
    { href: "tasks", label: "Tasks", icon: "tasks", match: /^tasks/, count: "jobs" },
    { href: "stats", label: "Statistics", icon: "chart", match: /^stats/ },
    { action: "log", label: "Log", icon: "logs" },
    { href: "duplicates", label: "Duplicates", icon: "copies", match: /^duplicates/ },
    { href: "tagger", label: "Scene tagger", icon: "tag", match: /^tagger/ },
    { href: "performer-tagger", label: "Performer tagger", icon: "person", match: /^performer-tagger/ },
    { href: "phone", label: "Phone upload", icon: "phone", match: /^phone/ },
    { href: "settings", label: "Settings", icon: "gear", match: /^settings/ },
    { href: "plugins", label: "Plugins", icon: "plug", match: /^plugins/ },
    { href: "whatsnew", label: "What's new", icon: "info", match: /^whatsnew/, count: "news" },
    { href: "extern/classic", label: "Classic Stash", icon: "door", match: /^extern\/classic/ },
  ] },
];

// A symbol: the name of one of ours, inline <svg>, or an image address (extension plugins)
export const navIcon = (v) => (/^\s*<svg/i.test(v || "") ? inlineSvg(v) : /^(https?:)?\/|^data:image\//.test(v || "") ? `<img class="kb-ext-ic" alt="" src="${esc(v)}">` : icon(v || "plug"));
// Menu entries of extension plugins (ext.js addNavItem): id → { entry, group }
const GROUPS = new Set(["Library", "Watch", "Manage", "Extensions"]);
const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function extNav() {
  const out = new Map();
  for (const n of navItems()) {
    const id = "n:" + n.plugin + ":" + n.id;
    const route = n.route != null ? String(n.route).replace(/^\/+/, "") : null;
    const href = route != null ? "#/p/" + encodeURIComponent(n.plugin) + "/" + route : /^(#|https?:|\/)/.test(n.href) ? n.href : "#/" + n.href;
    const path = href.startsWith("#/") ? href.slice(2).split("?")[0] : "";
    // lit while that page (or, for a route, anything below its first part) is open
    const re = route != null ? new RegExp("^p/" + reEsc(encodeURIComponent(n.plugin)) + "/" + reEsc(route.split("/")[0])) : path ? new RegExp("^" + reEsc(path) + "$") : /$^/;
    out.set(id, { id, group: GROUPS.has(n.group) ? n.group : "Extensions", place: n.place || null, nav: { label: n.label, icon: n.icon, match: re, xnav: { key: n.plugin + ":" + n.id, href, count: !!n.count } } });
  }
  return out;
}

const KEY = "railLayout";
const FOLDERS = "folders";
const SAVED = "savedfilters"; // Stash's saved filters and the playlists, under the folder tree
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
    if (key === "Library") ids.push(FOLDERS, SAVED);
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
  m.set(SAVED, { id: SAVED, saved: true });
  for (const [id, e] of extNav()) m.set(id, { id, nav: e.nav });
  const mode = store.get("extMode", "show");
  const off = new Set(store.get("extHidden", []));
  if (mode !== "hide") {
    for (const f of store.get("extFound", [])) {
      if (!f.href || off.has(f.id) || hasNav(f.id)) continue; // (a plugin with menu entries of its own isn't scanned)
      m.set("x:" + f.id, { id: "x:" + f.id, ext: f });
    }
  }
  return m;
}

// Where an extension's menu entry goes in its group: place = "start" | "end" | { after | before: anchor } | none.
// An anchor is a built-in entry's href ("galleries", "queue" …), an action ("log"), "folders", "saved" or "<pluginId>:<id>";
// one that isn't in the group (or doesn't exist) falls back to the default.
function placeAt(items, place) {
  const tail = new Set([FOLDERS, SAVED]);
  let last = -1;
  items.forEach((x, i) => !tail.has(x) && (last = i));
  const def = last + 1;
  if (place === "start") return 0;
  if (place === "end") return items.length;
  if (place && typeof place === "object") {
    const a = String(place.after != null ? place.after : place.before != null ? place.before : "");
    const ids = [a === "folders" ? FOLDERS : a === "saved" ? SAVED : "", "p:" + a, "a:" + a, "n:" + a].filter(Boolean);
    const i = items.findIndex((x) => ids.includes(x));
    if (i >= 0) return place.after != null ? i + 1 : i;
  }
  return def;
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
    const key = d.items.get(id) ?? (extNav().get(id) || {}).group ?? "Extensions";
    const g = groups.find((x) => x.key === key) || groups[groups.length - 1];
    const order = defOrder.get(key) || [];
    let at = g.items.length;
    for (let i = order.indexOf(id) - 1; i >= 0; i--) {
      const p = g.items.indexOf(order[i]);
      if (p >= 0) { at = p + 1; break; }
    }
    // An entry of an extension plugin: where its `place` says, otherwise behind the group's last regular entry (so
    // not below the folder tree and the saved filters). Only when it first appears – a saved layout always wins.
    const xe = id.startsWith("n:") ? extNav().get(id) : null;
    if (xe) at = placeAt(g.items, xe.place);
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
  return layout.groups
    .map((g) => ({
      key: g.key,
      name: g.name,
      custom: g.name != null,
      items: g.items.filter((id) => cat.has(id) && !off.has(id)).map((id) => cat.get(id)),
    }))
    .filter((g) => g.items.length);
}
