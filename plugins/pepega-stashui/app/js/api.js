// Stash GraphQL – all queries and mutations in one place.

import { t, locale } from "./i18n.js";
import { LARGE_SCENES, LARGE_IMAGES, largeNow } from "./scale.js";

// Requests of the page you're on stop when you leave it (a long query for a page nobody looks at any more
// only keeps Stash busy): routeSignal() is the signal of the current page, abortRoute() ends it (main.js, on navigating).
let routeCtl = new AbortController();
export const routeSignal = () => routeCtl.signal;
export function abortRoute() {
  routeCtl.abort();
  routeCtl = new AbortController();
}

// Heavy queries (everything with per_page: -1, the folder counting) run at most two at a time: on a big library
// Stash answers them slowly, and a pile of them at once keeps its disks busy for minutes. A cancelled one leaves the queue.
const HEAVY_MAX = 2;
let heavyRun = 0;
const heavyWait = [];
function heavySlot(signal) {
  if (heavyRun < HEAVY_MAX) {
    heavyRun++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const w = { resolve };
    const gone = () => {
      const i = heavyWait.indexOf(w);
      if (i >= 0) heavyWait.splice(i, 1);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", gone, { once: true });
    w.resolve = () => {
      if (signal) signal.removeEventListener("abort", gone);
      resolve();
    };
    heavyWait.push(w);
  });
}
function heavyDone() {
  const next = heavyWait.shift();
  if (next) next.resolve();
  else heavyRun--;
}

// opts.signal: an AbortSignal that cancels the request; opts.heavy: goes through the queue above
export async function gql(query, variables, opts) {
  if (opts && opts.heavy) {
    await heavySlot(opts.signal);
    try {
      return await gql(query, variables, { signal: opts.signal });
    } finally {
      heavyDone();
    }
  }
  const res = await fetch("/graphql", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: opts && opts.signal,
  });
  if (!res.ok) throw new Error(t("Stash answers with {status}", { status: res.status }));
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  const data = json.data;
  if (data && /sceneMarker(Create|Update|Destroy)/i.test(query)) {
    const input = (variables && (variables.input || variables.i)) || {};
    window.dispatchEvent(
      new CustomEvent("kb:scene-markers-changed", {
        detail: {
          sceneId: input.scene_id != null ? input.scene_id : null,
          marker: data.sceneMarkerCreate || data.sceneMarkerUpdate || null,
        },
      })
    );
  }

  return data;
}

// ---------- Fragments ----------

export const F_SCENE = `id title details date rating100 o_counter play_count play_duration resume_time last_played_at organized created_at urls interactive interactive_speed
  files { id width height duration size path basename video_codec frame_rate bit_rate }
  paths { screenshot preview webp stream sprite vtt funscript interactive_heatmap }
  tags { id name }
  performers { id name image_path }
  studio { id name image_path }
  galleries { id title }`;

export const F_IMAGE = `id title details date rating100 o_counter organized created_at urls
  visual_files { __typename ... on ImageFile { id width height size path basename } ... on VideoFile { id width height size path basename duration format video_codec } }
  paths { thumbnail image preview }
  tags { id name }
  performers { id name image_path }
  studio { id name image_path }
  galleries { id title folder { path } files { path } }`;

export const F_GALLERY = `id title details date rating100 organized created_at image_count urls
  folder { id path }
  files { path }
  paths { cover preview }
  performers { id name image_path }
  cover { id visual_files { ... on ImageFile { width height } ... on VideoFile { width height } } }
  studio { id name image_path }
  tags { id name }`;

export const F_TAG = `id name description favorite image_path scene_count image_count gallery_count aliases
  parents { id name } children { id name }`;

// ---------- Lists ----------

const KIND = {
  scene: { query: "findScenes", filterArg: "scene_filter", filterType: "SceneFilterType", list: "scenes", frag: F_SCENE },
  image: { query: "findImages", filterArg: "image_filter", filterType: "ImageFilterType", list: "images", frag: F_IMAGE },
  gallery: { query: "findGalleries", filterArg: "gallery_filter", filterType: "GalleryFilterType", list: "galleries", frag: F_GALLERY },
};

// ids: only these (e.g. the scenes of some tiers) – null: no restriction
export async function findItems(kind, find, filter, ids, opts) {
  const k = KIND[kind];
  const d = await gql(
    `query($f: FindFilterType, $x: ${k.filterType}, $ids: [ID!]) { r: ${k.query}(filter: $f, ${k.filterArg}: $x, ids: $ids) { count ${k.list} { ${k.frag} } } }`,
    { f: find, x: filter || {}, ids: ids || null },
    { signal: (opts && opts.signal) || routeSignal() }
  );
  return { count: d.r.count, items: d.r[k.list] };
}

// Only the ids (and the rating) of everything that matches – light even when there are many (to sort or count here)
const IDKIND = { scene: ["findScenes", "scene_filter", "SceneFilterType", "scenes"], image: ["findImages", "image_filter", "ImageFilterType", "images"], performer: ["findPerformers", "performer_filter", "PerformerFilterType", "performers"] };
export async function findIds(kind, find, filter, ids) {
  const [fn, arg, type, list] = IDKIND[kind];
  const d = await gql(`query($f: FindFilterType, $x: ${type}, $ids: [ID!]) { r: ${fn}(filter: $f, ${arg}: $x, ids: $ids) { count ${list} { id rating100 } } }`, { f: find, x: filter || {}, ids: ids || null }, { signal: routeSignal(), heavy: find && find.per_page === -1 });
  return { count: d.r.count, items: d.r[list] };
}

export async function countItems(kind, filter) {
  const k = KIND[kind];
  const d = await gql(`query($x: ${k.filterType}) { r: ${k.query}(filter: { per_page: 0 }, ${k.filterArg}: $x) { count } }`, { x: filter || {} });
  return d.r.count;
}

// What the performer cards in the player's info panel show (born, died, country, how many scenes …)
const PERF_CARD = "id disambiguation gender birthdate death_date country favorite scene_count";

export async function getScene(id) {
  // performers a second time: GraphQL merges the selections – only the player needs the details for the hover cards
  const d = await gql(`query($id: ID!) { findScene(id: $id) { ${F_SCENE} performers { ${PERF_CARD} } scene_markers { id title seconds end_seconds primary_tag { id name } tags { id name } } sceneStreams { url mime_type label } captions { language_code caption_type } paths { caption } } }`, { id });
  return d.findScene;
}
export async function getImage(id) {
  const d = await gql(`query($id: ID!) { findImage(id: $id) { ${F_IMAGE} } }`, { id });
  return d.findImage;
}
export async function getGallery(id) {
  const d = await gql(`query($id: ID!) { findGallery(id: $id) { ${F_GALLERY} } }`, { id });
  return d.findGallery;
}
export async function getTag(id) {
  const d = await gql(`query($id: ID!) { findTag(id: $id) { ${F_TAG} } }`, { id });
  return d.findTag;
}

export async function findTags(q, perPage, sort) {
  const d = await gql(
    `query($f: FindFilterType) { findTags(filter: $f) { count tags { ${F_TAG} } } }`,
    { f: { q: q || undefined, per_page: perPage || -1, sort: sort || "name", direction: sort && sort !== "name" ? "DESC" : "ASC" } }
  );
  return d.findTags;
}

// Performers. Career fields are left out: Stash 0.31 has career_start/career_end, older versions career_length.
export const F_PERFORMER = `id name disambiguation alias_list gender birthdate death_date country ethnicity eye_color hair_color height_cm weight
  measurements tattoos piercings details urls favorite rating100 o_counter scene_count image_count gallery_count image_path created_at
  tags { id name }`;

export async function findPerformers({ q, page = 1, perPage = 60, sort = "name", dir, filter, ids } = {}) {
  const d = await gql(`query($f: FindFilterType, $p: PerformerFilterType, $ids: [ID!]) { findPerformers(filter: $f, performer_filter: $p, ids: $ids) { count performers { id name disambiguation gender favorite rating100 scene_count image_count o_counter image_path birthdate country } } }`, {
    f: { q: q || undefined, page, per_page: perPage, sort, direction: dir || (sort === "name" ? "ASC" : "DESC") },
    p: filter || {},
    ids: ids || null,
  }, { signal: routeSignal() });
  return d.findPerformers;
}

export async function getPerformer(id) {
  const d = await gql(`query($id: ID!) { findPerformer(id: $id) { ${F_PERFORMER} } }`, { id });
  return d.findPerformer;
}

export async function updatePerformer(input) {
  const d = await gql(`mutation($i: PerformerUpdateInput!) { performerUpdate(input: $i) { id } }`, { i: input });
  return d.performerUpdate;
}

export async function createPerformer(name) {
  const d = await gql(`mutation($i: PerformerCreateInput!) { performerCreate(input: $i) { id } }`, { i: { name } });
  return d.performerCreate;
}

// Stash's totals. Stash works out all of them whichever fields are asked for (on a big library that took 20 s cold),
// so this is asked once and shared: several parts of the page ask at the same time. A big library keeps the last answer
// in the browser for a quarter of an hour; a small one asks again after a minute.
const STATS_Q = `query { stats { scene_count image_count gallery_count tag_count performer_count scenes_duration scenes_size images_size total_play_count total_play_duration scenes_played total_o_count } }`;
const STATS_KEY = "stashui.statsCache";
let statsP = null;
let statsAt = 0;
export function stats(force) {
  if (!force && statsP && Date.now() - statsAt < (statsBig ? 15 * 60000 : 60000)) return statsP;
  if (!force && !statsP) {
    try {
      const c = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
      if (c && c.data && Date.now() - c.at < 15 * 60000 && (c.data.scene_count >= LARGE_SCENES || c.data.image_count >= LARGE_IMAGES)) {
        statsBig = true;
        statsAt = c.at;
        return (statsP = Promise.resolve(c.data));
      }
    } catch (e) { /* none stored */ }
  }
  statsAt = Date.now();
  statsP = gql(STATS_Q)
    .then((d) => {
      statsBig = d.stats.scene_count >= LARGE_SCENES || d.stats.image_count >= LARGE_IMAGES;
      try {
        statsBig ? localStorage.setItem(STATS_KEY, JSON.stringify({ at: Date.now(), data: d.stats })) : localStorage.removeItem(STATS_KEY);
      } catch (e) { /* blocked */ }
      return d.stats;
    })
    .catch((e) => {
      statsP = null;
      throw e;
    });
  return statsP;
}
let statsBig = false;

// ---------- Folders ----------

let folderCache = null;
// All folders with their number of images/videos (including subfolders); empty ones are hidden.
// Scenes and images are counted, not files: Stash keeps folder and file entries even after
// deleting (without "delete file" the file stays, with it the folder stays) – such folders should disappear.
//
// On a big library (large library mode) nothing is counted at all: counting means reading every scene and image,
// which ran for minutes there. The tree then shows all folders without numbers (data.unc).
//
// Counting needs every scene and image once – heavy on big libraries. So the counted result is kept in
// the browser and reused as long as the number of scenes and images hasn't changed; scans, cleans and
// deletions (libraryChanged) throw it away.
const TREE_KEY = "stashui.folderTree";
async function folderData(opts) {
  let key = null;
  try {
    const s = await stats();
    key = s.scene_count + "/" + s.image_count + (largeNow() ? "u" : "");
    const cached = JSON.parse(localStorage.getItem(TREE_KEY) || "null");
    if (cached && cached.v === 1 && cached.key === key) return cached;
  } catch (e) { /* no stats or no stored tree – count below */ }
  if (largeNow()) {
    const f = await gql(`query { findFolders(filter: { per_page: -1 }) { folders { id path basename parent_folder { id } } } }`, undefined, { signal: opts && opts.signal, heavy: true });
    const data = { v: 1, unc: true, key, folders: f.findFolders.folders.map((x) => [x.id, x.path, x.basename || x.path, x.parent_folder ? x.parent_folder.id : null]), counts: {} };
    if (key) {
      try {
        localStorage.setItem(TREE_KEY, JSON.stringify(data));
      } catch (e) { /* too big or blocked */ }
    }
    return data;
  }
  const d = await gql(`query {
    findFolders(filter: { per_page: -1 }) { folders { id path basename parent_folder { id } } }
    findScenes(filter: { per_page: -1 }) { scenes { files { parent_folder { id } } } }
    findImages(filter: { per_page: -1 }) { images { visual_files { ... on ImageFile { parent_folder { id } } ... on VideoFile { parent_folder { id } } } } }
  }`, undefined, { signal: opts && opts.signal, heavy: true });
  const counts = {}; // folder id → [videos, images]
  const add = (file, i) => {
    const id = file && file.parent_folder && file.parent_folder.id;
    if (id) (counts[id] = counts[id] || [0, 0])[i]++;
  };
  d.findScenes.scenes.forEach((x) => add(x.files[0], 0));
  d.findImages.images.forEach((x) => add(x.visual_files[0], 1));
  const data = { v: 1, key, folders: d.findFolders.folders.map((f) => [f.id, f.path, f.basename || f.path, f.parent_folder ? f.parent_folder.id : null]), counts };
  if (key) {
    try {
      localStorage.setItem(TREE_KEY, JSON.stringify(data));
    } catch (e) { /* too big or blocked – counted again next time */ }
  }
  return data;
}

// Big library (nothing counted up front): the numbers of just the folders on screen, counted per level with two cheap
// `per_page: 0` queries per folder (video and image count including subfolders) instead of reading every scene and image.
// Returns a Map id → [videos, images]; kept until the library changes.
const levelCounts = new Map();
window.addEventListener("stash:library-changed", () => levelCounts.clear());
export async function folderLevelCounts(ids, opts = {}) {
  const todo = [...new Set(ids)].filter((id) => !levelCounts.has(id));
  for (let i = 0; i < todo.length; i += 6) {
    if (opts.signal && opts.signal.aborted) break;
    const part = todo.slice(i, i + 6);
    const q = part
      .map((id, n) => {
        const ff = `{ files_filter: { parent_folder: { value: [${JSON.stringify(String(id))}], modifier: INCLUDES, depth: -1 } } }`;
        return `v${n}: findScenes(filter: { per_page: 0 }, scene_filter: ${ff}) { count } i${n}: findImages(filter: { per_page: 0 }, image_filter: ${ff}) { count }`;
      })
      .join(" ");
    const d = await gql(`query FolderLevel { ${q} }`, undefined, { signal: opts.signal });
    part.forEach((id, n) => levelCounts.set(id, [d["v" + n].count, d["i" + n].count]));
  }
  return levelCounts;
}

// Big library: the number of videos of some folders – direct (depth 0) or with everything below (depth -1) – one cheap
// `per_page: 0` query per folder. Returns a Map "o<id>" / "d<id>" → count; kept until the library changes.
const videoCounts = new Map();
window.addEventListener("stash:library-changed", () => videoCounts.clear());
export async function folderVideoCounts(ids, depth, opts = {}) {
  const tag = depth === 0 ? "o" : "d";
  const todo = [...new Set(ids)].filter((id) => !videoCounts.has(tag + id));
  for (let i = 0; i < todo.length; i += 8) {
    if (opts.signal && opts.signal.aborted) break;
    const part = todo.slice(i, i + 8);
    const q = part.map((id, n) => `v${n}: findScenes(filter: { per_page: 0 }, scene_filter: { files_filter: { parent_folder: { value: [${JSON.stringify(String(id))}], modifier: INCLUDES, depth: ${depth === 0 ? 0 : -1} } } }) { count }`).join(" ");
    const d = await gql(`query FolderLevel { ${q} }`, undefined, { signal: opts.signal });
    part.forEach((id, n) => videoCounts.set(tag + id, d["v" + n].count));
  }
  return videoCounts;
}

// opts.user: asked for by the person (the Folders page, "Folder" in the player) – otherwise a try that failed or was
// cancelled isn't repeated for half an hour (it would hang on every page load); opts.signal cancels the counting.
const FAIL_KEY = "stashui.folderFail";
export function loadFolders(force, opts = {}) {
  if (folderCache && !force) return folderCache;
  if (!opts.user) {
    const f = Number(sessionStorage.getItem(FAIL_KEY) || 0);
    if (f && Date.now() - f < 30 * 60000) return Promise.reject(Object.assign(new Error("The folders weren't loaded – the last try didn't finish. Open the Folders page to try again."), { skipped: true }));
  }
  folderCache = (async () => {
    const data = await folderData(opts);
    const nodes = new Map();
    for (const [id, path, name, parent] of data.folders) {
      const c = data.counts[id] || [0, 0];
      nodes.set(id, { id, path, name, parent, kids: [], vid: c[0], img: c[1] });
    }
    for (const n of nodes.values()) {
      const p = n.parent && nodes.get(n.parent);
      if (p) p.kids.push(n);
    }
    const total = (n) => {
      n.timg = n.img;
      n.tvid = n.vid;
      n.kids.forEach((k) => {
        total(k);
        n.timg += k.timg;
        n.tvid += k.tvid;
      });
    };
    let roots = [...nodes.values()].filter((n) => !n.parent || !nodes.has(n.parent));
    roots.forEach(total);
    const keep = (list) => (data.unc ? list : list.filter((n) => n.timg + n.tvid > 0)); // (uncounted: every folder stays)
    roots = keep(roots);
    // Skip empty intermediate levels like a bare drive root
    while (roots.length === 1 && !roots[0].img && !roots[0].vid && keep(roots[0].kids).length === 1) roots = keep(roots[0].kids);
    const sortRec = (n) => {
      n.kids = keep(n.kids).sort((a, b) => a.name.localeCompare(b.name, locale(), { numeric: true, sensitivity: "base" }));
      n.kids.forEach(sortRec);
    };
    roots.forEach(sortRec);
    roots.sort((a, b) => a.name.localeCompare(b.name, locale(), { numeric: true }));
    sessionStorage.removeItem(FAIL_KEY);
    return { nodes, roots, unc: !!data.unc };
  })().catch((e) => {
    folderCache = null;
    sessionStorage.setItem(FAIL_KEY, String(Date.now()));
    throw e;
  });
  return folderCache;
}

// The folder with this exact path (one small query – no need for the whole tree); null if Stash doesn't know it
export async function folderIdForPath(path) {
  const d = await gql(`query($p: String!) { findFolders(folder_filter: { path: { value: $p, modifier: EQUALS } }, filter: { per_page: 1 }) { folders { id } } }`, { p: path });
  return d.findFolders.folders[0] ? d.findFolders.folders[0].id : null;
}

// After deleting, scanning, cleaning …: recount folders and refresh all displays (navigation, counts)
export function libraryChanged() {
  folderCache = null;
  statsP = null; // the totals changed too
  try {
    localStorage.removeItem(TREE_KEY);
  } catch (e) { /* blocked */ }
  window.dispatchEvent(new Event("stash:library-changed"));
}

// ---------- Favorites (tag "Favorite") ----------

let favTag = null;
export async function favoriteTagId(create) {
  if (favTag) return favTag;
  const d = await gql(`query { findTags(tag_filter: { name: { value: "Favorite", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`);
  const t = d.findTags.tags[0];
  if (t) return (favTag = t.id);
  if (!create) return null;
  const c = await gql(`mutation { tagCreate(input: { name: "Favorite", description: "Favorites (the heart in Stash UI)" }) { id } }`);
  return (favTag = c.tagCreate.id);
}

export async function setFavorite(kind, ids, on) {
  const tagId = await favoriteTagId(true);
  const m = { scene: "bulkSceneUpdate", image: "bulkImageUpdate", gallery: "bulkGalleryUpdate" }[kind];
  const t = { scene: "BulkSceneUpdateInput", image: "BulkImageUpdateInput", gallery: "BulkGalleryUpdateInput" }[kind];
  await gql(`mutation($i: ${t}!) { ${m}(input: $i) { id } }`, { i: { ids, tag_ids: { ids: [tagId], mode: on ? "ADD" : "REMOVE" } } });
}

// ---------- Changes ----------

const UPDATE = {
  scene: ["sceneUpdate", "SceneUpdateInput"],
  image: ["imageUpdate", "ImageUpdateInput"],
  gallery: ["galleryUpdate", "GalleryUpdateInput"],
};
export async function updateItem(kind, input) {
  const [m, t] = UPDATE[kind];
  await gql(`mutation($i: ${t}!) { ${m}(input: $i) { id } }`, { i: input });
}

const BULK = {
  scene: ["bulkSceneUpdate", "BulkSceneUpdateInput"],
  image: ["bulkImageUpdate", "BulkImageUpdateInput"],
  gallery: ["bulkGalleryUpdate", "BulkGalleryUpdateInput"],
};
export async function bulkUpdate(kind, input) {
  const [m, t] = BULK[kind];
  await gql(`mutation($i: ${t}!) { ${m}(input: $i) { id } }`, { i: input });
}

export async function destroyItems(kind, ids, deleteFile) {
  const map = {
    scene: ["scenesDestroy", "ScenesDestroyInput"],
    image: ["imagesDestroy", "ImagesDestroyInput"],
    gallery: ["galleryDestroy", "GalleryDestroyInput"],
  };
  const [m, t] = map[kind];
  await gql(`mutation($i: ${t}!) { ${m}(input: $i) }`, { i: { ids, delete_file: !!deleteFile, delete_generated: true } });
  libraryChanged();
}

export async function createTag(name) {
  const d = await gql(`mutation($n: String!) { tagCreate(input: { name: $n }) { id name } }`, { n: name });
  return d.tagCreate;
}

export async function addO(kind, id) {
  if (kind === "scene") {
    const d = await gql(`mutation($id: ID!) { sceneAddO(id: $id) { count } }`, { id });
    return d.sceneAddO.count;
  }
  const d = await gql(`mutation($id: ID!) { imageIncrementO(id: $id) }`, { id });
  return d.imageIncrementO;
}
export async function removeO(kind, id) {
  if (kind === "scene") {
    const d = await gql(`mutation($id: ID!) { sceneDeleteO(id: $id) { count } }`, { id });
    return d.sceneDeleteO.count;
  }
  const d = await gql(`mutation($id: ID!) { imageDecrementO(id: $id) }`, { id });
  return d.imageDecrementO;
}

// resumeTime null: only the play time counts, Stash's resume point stays as it is
export async function saveActivity(id, resumeTime, playDuration) {
  await gql(`mutation($id: ID!, $r: Float, $p: Float) { sceneSaveActivity(id: $id, resume_time: $r, playDuration: $p) }`, { id, r: resumeTime, p: playDuration });
}
export async function addPlay(id) {
  await gql(`mutation($id: ID!) { sceneAddPlay(id: $id) { count } }`, { id });
}

// ---------- A plugin's settings in Stash ----------
// Stash replaces a plugin's settings as a whole on every save – so always read them fresh, change
// only the given keys (undefined = remove) and write everything back. Things kept there by these
// plugins (PMV presets, Versus standings) survive that way.
export async function pluginConfig(id) {
  const d = await gql(`query($i: [ID!]) { configuration { plugins(include: $i) } }`, { i: [id] });
  const c = (d.configuration.plugins || {})[id] || {};
  if (Object.keys(c).length) cfgSeen.set(id, true);
  return c;
}
// Stash replaces the whole settings map of a plugin, so a write is "read everything, change a bit, write everything".
// Two things went wrong with that: writes that overlapped (each read the old map, the later one wiped the other's change) –
// they now run one after the other –, and a read that came back empty by mistake (Stash busy or just starting) –
// writing on top of it would have wiped every shared setting; that is retried once and then refused.
const cfgChain = new Map();
const cfgSeen = new Map(); // plugin id → had values when last read
export function setPluginConfig(id, patch) {
  const run = (cfgChain.get(id) || Promise.resolve()).catch(() => {}).then(() => writePluginConfig(id, patch));
  cfgChain.set(id, run);
  return run;
}
async function writePluginConfig(id, patch) {
  let cur = await pluginConfig(id);
  if (!Object.keys(cur).length && cfgSeen.get(id)) {
    await new Promise((r) => setTimeout(r, 1500));
    cur = await pluginConfig(id);
    if (!Object.keys(cur).length) throw new Error(`Stash answered with empty settings for “${id}” – nothing was saved, so the existing ones aren't overwritten. Try again in a moment.`);
  }
  const next = Object.assign({}, cur, patch);
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete next[k]);
  await gql(`mutation($id: ID!, $i: Map!) { configurePlugin(plugin_id: $id, input: $i) }`, { id, i: next });
  cfgSeen.set(id, Object.keys(next).length > 0);
  return next;
}
