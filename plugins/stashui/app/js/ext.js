// Extension modules: other plugins can bring /plugin/<id>/assets/stashui.js (default export = setup(stashui)).
// Opt-in – a plugin without that file costs one cached lookup per plugin version, nothing else.
//
//   export default function setup(stashui) {            // stashui.version === 2; stashui.has("slot:scene.info") …
//     stashui.addListSource({ id, match({ page, kind }) → bool, async extend(ctx) → [{ before, piece }] });
//     stashui.invalidate(sourceId);                      // run `extend` again for the pages already loaded
//     stashui.addRoute({ path: "library/*", title, overlay, render(el, { params, rest, query, signal }) → cleanup });
//     stashui.addNavItem({ id, label, icon, route | href, group, place, count });
//     stashui.addSlot("scene.info", { id, title, match(ctx), mount(el, ctx) → cleanup });
//     stashui.ui / t / addStrings / gql / store / on / go
//   }
//
// List ctx = { page, params, kind, sort, dir, q, filter, restricted, pageNumber, perPage, count, items, prev }; before = id of a raw
// item of this page to insert in front of (null = after the page); piece = { key, title, thumb, w, h, meta, stamp, href,
// className, dim, badges: [{ text, title }], actions: [{ icon, title, run(cardEl) → undefined | [{ label, detail, run }] }],
// mount(cardEl) → cleanup }.
// Everything is isolated: errors are caught and listed per plugin (Plugins page), waits have timeouts, and an
// AbortSignal (ctx.signal) fires when what the plugin drew is removed.

import * as UI from "./ui.js";
import { store } from "./ui.js";
import { t, addStrings } from "./i18n.js";
import { gql } from "./api.js";

export const VERSION = 2;
const MOD_KEY = "extMods1"; // "<id>@<version>" → true (has a module) / false
const OFF_KEY = "extOff"; // plugin ids whose module is switched off (Plugins page)
const TIMEOUT = 3000;
const SETUP_TIMEOUT = 6000;

// Where a slot can sit (ctx fields are listed in the README, "For plugin authors")
export const SLOT_NAMES = [
  "list.bar", "list.toolbar", "bulk.actions", "scene.info", "scene.menu",
  "performer.header", "studio.header", "tag.header", "gallery.header", "home.section", "settings.section",
];
const FEATURES = new Set([
  "list.source", "list.invalidate", "list.restricted", "list.emptyCards", "piece.actions", "piece.dim",
  "route", "navItem", "ui", "strings", "gql", "store", "on", "go", "diagnostics",
  ...SLOT_NAMES.map((n) => "slot:" + n),
]);

const plugins = new Map(); // id → { id, name, version, sources, routes, nav, slots, errors }
const loaded = new Set();
const handles = new Set(); // mounted slot hosts (they pick up slots that register late)
const lists = new Set(); // open lists ({ reextend(prefix) })
let host = { go: (p) => (location.hash = "#/" + p) };
export const setHost = (h) => Object.assign(host, h);

let readyRes;
const ready = new Promise((r) => (readyRes = r));
setTimeout(() => readyRes(), 12000); // (a slow lookup never blocks a page of a plugin for long)
export const extensionsReady = () => ready;

const changed = () => window.dispatchEvent(new Event("stash:ext-changed"));
export const offList = () => store.get(OFF_KEY, []);
export const setOff = (id, off) => {
  const l = new Set(offList());
  off ? l.add(id) : l.delete(id);
  store.set(OFF_KEY, [...l]);
};

export const hasSources = () => [...plugins.values()].some((p) => p.sources.length);
export const diagnostics = () => [...plugins.values()];

function rec(id) {
  let p = plugins.get(id);
  if (!p) plugins.set(id, (p = { id, name: id, version: "", sources: [], routes: [], nav: [], slots: [], errors: [] }));
  return p;
}
function note(pluginId, where, e) {
  console.warn(`[Stash UI] extension ${pluginId}: ${where}`, e);
  const p = rec(pluginId);
  p.errors.push({ at: Date.now(), where, message: String((e && e.message) || e) });
  if (p.errors.length > 6) p.errors.shift();
  changed();
}
const put = (list, entry) => {
  const i = list.findIndex((x) => x.id === entry.id && x.name === entry.name); // (a slot id only has to be unique within its place)
  if (i >= 0) list[i] = entry;
  else list.push(entry);
};

// ---------- Routes ----------
// path: "library" · "library/:id" · "library/*" (the rest of the path in `rest`)
function compile(path) {
  const segs = String(path || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return segs.map((s) => (s === "*" ? { rest: true } : s[0] === ":" ? { param: s.slice(1) } : { lit: s }));
}
function matchRoute(segs, rest) {
  const parts = String(rest || "").split("/").filter(Boolean);
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.rest) return { params, rest: parts.slice(i).map(decodeURIComponent).join("/") };
    if (i >= parts.length) return null;
    if (s.lit != null) {
      if (s.lit !== parts[i]) return null;
    } else params[s.param] = decodeURIComponent(parts[i]);
  }
  return parts.length === segs.length ? { params, rest: "" } : null;
}
// → { route, params, rest } | null
export function routeInfo(pluginId, rest) {
  const p = plugins.get(pluginId);
  if (!p) return null;
  for (const r of p.routes) {
    const m = matchRoute(r.segs, rest);
    if (m) return { route: r, params: m.params, rest: m.rest };
  }
  return null;
}

// ---------- Menu entries ----------
export const hasNav = (pluginId) => !!(plugins.get(pluginId) && plugins.get(pluginId).nav.length);
export function navItems() {
  const out = [];
  for (const p of plugins.values()) for (const n of p.nav) out.push(Object.assign({ plugin: p.id }, n));
  return out;
}

// ---------- Slots ----------
const slotsOf = (name) => [...plugins.values()].flatMap((p) => p.slots.filter((s) => s.name === name));

// Mount the slots of one place into `hostEl`. base = the fields of its ctx; the returned handle keeps them live:
// set(patch) changes fields, re-checks `match` and tells ctx.onChange listeners. opts: { wrap: true → every slot is a folded
// section with its title (the player's info bar), reload() → ctx.reload, lazy(el) → promise: mount when it resolves }.
export function mountSlots(name, hostEl, base, opts = {}) {
  const ctx = Object.assign({}, base);
  const live = new Map(); // slot → { el, done, ac, off: [] }
  const listeners = new Set();
  let dead = false;
  const h = { name, ctx, refresh, set, destroy };

  function mountOne(s) {
    const ac = new AbortController();
    const inst = { ac, off: [], done: null, el: null };
    live.set(s, inst);
    let body;
    if (opts.wrap === "section") {
      const d = document.createElement("section");
      d.className = "kb-xslot kb-xhomesec";
      d.dataset.xslot = name;
      d.dataset.plugin = s.plugin;
      d.innerHTML = `<h2 class="kb-h2"></h2><div class="kb-xslot-body"></div>`;
      d.querySelector("h2").textContent = s.title || plugins.get(s.plugin).name;
      inst.el = d;
      body = d.querySelector(".kb-xslot-body");
    } else if (opts.wrap) {
      const d = document.createElement("details");
      d.className = "kb-upsec kb-xslot";
      d.open = true;
      d.dataset.xslot = name;
      d.dataset.plugin = s.plugin;
      d.innerHTML = `<summary><h3></h3></summary><div class="kb-xslot-body"></div>`;
      d.querySelector("h3").textContent = s.title || plugins.get(s.plugin).name;
      inst.el = d;
      body = d.querySelector(".kb-xslot-body");
    } else {
      body = inst.el = document.createElement("div");
      body.className = "kb-xslot";
      body.dataset.xslot = name;
      body.dataset.plugin = s.plugin;
    }
    hostEl.appendChild(inst.el);
    const sctx = Object.create(ctx);
    Object.assign(sctx, {
      signal: ac.signal,
      reload: opts.reload || (() => {}),
      onChange(fn) {
        listeners.add(fn);
        const off = () => listeners.delete(fn);
        inst.off.push(off);
        return off;
      },
    });
    const go = () => {
      if (dead || live.get(s) !== inst) return;
      try {
        const r = s.mount(body, sctx);
        Promise.resolve(r).then((fn) => {
          if (typeof fn !== "function") return;
          if (live.get(s) === inst) inst.done = fn;
          else try { fn(); } catch (e) { /* its own cleanup */ }
        }).catch((e) => note(s.plugin, `slot ${name}/${s.id}`, e));
      } catch (e) {
        note(s.plugin, `slot ${name}/${s.id}`, e);
      }
    };
    opts.lazy ? opts.lazy(inst.el).then(go) : go();
  }
  function unmountOne(s) {
    const inst = live.get(s);
    if (!inst) return;
    live.delete(s);
    inst.ac.abort();
    inst.off.forEach((f) => f());
    try {
      inst.done && inst.done();
    } catch (e) { /* its own cleanup */ }
    inst.el.remove();
  }
  function refresh() {
    if (dead) return;
    for (const s of slotsOf(name)) {
      if (opts.only && !opts.only(s)) continue;
      let ok = true;
      try {
        ok = !s.match || !!s.match(ctx);
      } catch (e) {
        note(s.plugin, `slot ${name}/${s.id} match`, e);
        ok = false;
      }
      if (ok && !live.has(s)) mountOne(s);
      else if (!ok && live.has(s)) unmountOne(s);
    }
    for (const s of [...live.keys()]) if (!slotsOf(name).includes(s)) unmountOne(s);
  }
  function set(patch) {
    if (dead) return;
    Object.assign(ctx, patch);
    refresh();
    listeners.forEach((fn) => {
      try {
        fn(ctx);
      } catch (e) {
        console.warn("[Stash UI] slot listener", e);
      }
    });
  }
  function destroy() {
    dead = true;
    [...live.keys()].forEach(unmountOne);
    listeners.clear();
    handles.delete(h);
  }
  handles.add(h);
  refresh();
  return h;
}
export const hasSlot = (name) => slotsOf(name).length > 0;
// All slots of one place, for pages that draw them one by one (settings sections, home sections)
export const slotList = (name) => slotsOf(name);

// ---------- Lists ----------
export const registerList = (l) => (lists.add(l), () => lists.delete(l));

const withTimeout = (p, ms = TIMEOUT) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// Ask every source that matches this list; broken or slow ones are skipped. only: "<plugin>:<source>:" to ask one source
// (invalidate). → [{ before, piece }]
export async function extendPage(ctx, only) {
  const out = [];
  await Promise.all(
    [...plugins.values()].flatMap((p) => p.sources).map(async (s) => {
      if (only && !(s.plugin + ":" + s.id + ":").startsWith(only)) return;
      try {
        if (s.match && !s.match({ page: ctx.page, params: ctx.params, kind: ctx.kind, restricted: ctx.restricted })) return;
        const r = await withTimeout(Promise.resolve(s.extend(ctx)));
        for (const e of Array.isArray(r) ? r : []) {
          const p = e && e.piece;
          if (!p || p.key == null) continue;
          const key = s.plugin + ":" + s.id + ":" + p.key;
          out.push({ before: e.before == null ? null : String(e.before), piece: Object.assign({}, p, { key, foreign: true, kind: "ext", id: key }) });
        }
      } catch (e) {
        note(s.plugin, `list source ${s.id}`, e);
      }
    })
  );
  return out;
}

// ---------- The object a module gets ----------
const UI_API = ["esc", "icon", "toast", "errorToast", "confirmDialog", "promptDialog", "openDrawer", "fmtDuration", "fmtDate", "fmtAgo", "fmtBytes", "fmtNum", "plural", "debounce", "menu"];

function makeApi(pluginId) {
  const p = rec(pluginId);
  const guard = (fn, where) => (...a) => {
    try {
      return fn(...a);
    } catch (e) {
      note(pluginId, where, e);
    }
  };
  const ui = {};
  UI_API.forEach((k) => (ui[k] = UI[k]));
  const api = {
    version: VERSION,
    has: (f) => FEATURES.has(String(f)),
    ui: Object.freeze(ui),
    t,
    addStrings,
    gql: (q, v, o) => gql(q, v, o),
    store: {
      get: (k, fb) => store.get(`ext.${pluginId}.${k}`, fb),
      set: (k, v) => store.set(`ext.${pluginId}.${k}`, v),
    },
    on(event, fn) {
      const ev = String(event).includes(":") ? String(event) : "stash:" + event;
      const wrap = guard((e) => fn(e.detail), "event " + event);
      window.addEventListener(ev, wrap);
      return () => window.removeEventListener(ev, wrap);
    },
    go: (path) => host.go(String(path).replace(/^#?\/?/, "")),

    addListSource(src) {
      if (!src || typeof src.extend !== "function") return;
      const entry = { id: String(src.id || "source"), plugin: pluginId, match: typeof src.match === "function" ? src.match : null, extend: src.extend };
      put(p.sources, entry);
      lists.forEach((l) => l.reextend(pluginId + ":" + entry.id + ":")); // (lists that are already open pick it up)
      changed();
    },
    // run `extend` again for the pages already loaded; the new cards come in place without rebuilding the list
    invalidate(sourceId) {
      lists.forEach((l) => l.reextend(pluginId + ":" + String(sourceId) + ":"));
    },
    addRoute(def) {
      if (!def || typeof def.render !== "function") return;
      put(p.routes, { id: String(def.path || ""), path: String(def.path || ""), segs: compile(def.path), title: String(def.title || p.name), overlay: !!def.overlay, render: def.render });
      changed();
    },
    addNavItem(def) {
      if (!def || !def.id || !(def.route != null || def.href)) return;
      put(p.nav, {
        id: String(def.id),
        label: String(def.label || def.id),
        icon: def.icon || "plug",
        route: def.route != null ? String(def.route) : null,
        href: def.href ? String(def.href) : null,
        group: def.group || "Extensions",
        place: def.place === "start" || def.place === "end" || (def.place && typeof def.place === "object") ? def.place : null,
        count: typeof def.count === "function" ? def.count : null,
      });
      changed();
      window.dispatchEvent(new Event("stash:rail-changed"));
    },
    addSlot(name, def) {
      if (!SLOT_NAMES.includes(name) || !def || typeof def.mount !== "function") return;
      put(p.slots, { id: String(def.id || name), name, plugin: pluginId, title: def.title ? String(def.title) : "", match: typeof def.match === "function" ? def.match : null, mount: def.mount, render: def.render });
      handles.forEach((h) => h.name === name && h.refresh());
      changed();
    },
  };
  return api;
}

async function hasModule(url) {
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    // Stash answers unknown paths in assets with a page or an error – only real JavaScript counts
    return r.ok && /javascript|ecmascript/.test(r.headers.get("content-type") || "");
  } catch (e) {
    return false;
  }
}

// plugins: the enabled plugins of other people ({ id, name, version })
export async function loadExtensions(list) {
  const cache = store.get(MOD_KEY, {});
  const keep = new Set();
  const off = new Set(offList());
  for (const p of list) {
    const key = p.id + "@" + (p.version || "");
    keep.add(key);
    const url = `/plugin/${encodeURIComponent(p.id)}/assets/stashui.js`;
    if (cache[key] === undefined) cache[key] = await hasModule(url);
    if (!cache[key]) continue;
    const r = rec(p.id);
    r.name = p.name || p.id;
    r.version = p.version || "";
    r.hasModule = true;
    r.off = off.has(p.id);
    if (r.off || loaded.has(key)) continue;
    loaded.add(key);
    try {
      const mod = await withTimeout(import(`${url}?v=${encodeURIComponent(p.version || "0")}`), SETUP_TIMEOUT);
      if (typeof mod.default === "function") await withTimeout(Promise.resolve(mod.default(makeApi(p.id))), SETUP_TIMEOUT);
    } catch (e) {
      note(p.id, "setup", e);
    }
  }
  Object.keys(cache).forEach((k) => keep.has(k) || delete cache[k]);
  store.set(MOD_KEY, cache);
  readyRes();
  changed();
}
