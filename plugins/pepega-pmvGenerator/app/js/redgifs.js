// RedGifs for the PMV Generator – the same source as in Media Storm: a share of the clips comes
// from RedGifs (trending, or chosen niches / tags / creators), and clips can be saved to Stash.
//
// - The API only answers browser requests from localhost. Opened via the network address, the
//   requests go through the plugin backend (mode "rg_api") instead.
// - media.redgifs.com allows cross-origin loading (crossOrigin = "anonymous"), so the canvas stays
//   readable: best moments, smart crop, match cuts and recording work with these clips too.
// - The video URLs refuse foreign referrers – the generator page sends none (meta referrer).

import { gql } from "./api.js";
import { store } from "./ui.js";

const API = "https://api.redgifs.com/v2";
const LS_TOKEN = "pmvgen.redgifs.token";
const PAGE = 80;
const MAX_PAGES = 50;
const PLUGIN = "pmvGenerator";

let direct = true; // false once the browser was blocked → backend detour
let tokenPromise = null;

async function token(force) {
  if (!force) {
    const c = store.get(LS_TOKEN, null);
    if (c && c.token && c.exp > Date.now()) return c.token;
  }
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await fetch(API + "/auth/temporary", { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error("token: HTTP " + res.status);
      const j = await res.json();
      store.set(LS_TOKEN, { token: j.token, exp: Date.now() + 20 * 3600 * 1000 });
      return j.token;
    })().finally(() => (tokenPromise = null));
  }
  return tokenPromise;
}

function apiError(status, message) {
  const e = new Error(message || "HTTP " + status);
  e.status = status;
  return e;
}

async function viaBackend(path) {
  const d = await gql(`mutation($a: Map) { runPluginOperation(plugin_id: "${PLUGIN}", args: $a) }`, { a: { mode: "rg_api", path } });
  const out = d && d.runPluginOperation;
  if (!out) throw new Error("no answer from the plugin backend – is Python in the PATH?");
  if (out.error && !out.status) throw new Error(out.error);
  if (out.status) throw apiError(out.status, out.error);
  return out.data;
}

export async function get(path) {
  if (direct) {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(API + path, { headers: { Authorization: "Bearer " + (await token(attempt > 0)) }, credentials: "omit", referrerPolicy: "no-referrer" });
        if (res.status === 401 || res.status === 403) continue; // token expired → a new one
        if (!res.ok) {
          let msg = "HTTP " + res.status;
          try {
            const j = await res.json();
            if (j.error) msg = j.error.code === "UserNotFound" ? "creator not found" : /NotFound/.test(j.error.code || "") ? "not found" : j.error.message || msg;
          } catch (e) { /* no JSON */ }
          throw apiError(res.status, msg);
        }
        return res.json();
      }
      throw new Error("authentication failed");
    } catch (e) {
      if (e.status) throw e; // a real answer from RedGifs
      direct = false; // blocked by the browser (CORS) or offline → try the backend
    }
  }
  return viaBackend(path);
}

// ---------- Suggestions: niches, tags, creators ----------

export async function suggest(query) {
  const q = encodeURIComponent(query);
  const safe = (p) => get(p).catch(() => null);
  const [n, sg, c] = await Promise.all([
    safe(`/niches/search?query=${q}&order=best_match&count=30`),
    safe(`/search/suggest?query=${q}`),
    safe(`/creators/search?query=${q}&count=20`),
  ]);
  const ql = query.toLowerCase();
  const score = (...names) => Math.max(...names.map((x) => { const t = String(x || "").toLowerCase(); return t.startsWith(ql) ? 2 : t.includes(ql) ? 1 : 0; }));
  const niches = ((n && n.niches) || [])
    .filter((x) => x && x.id)
    .map((x) => ({ type: "niche", id: x.id, name: x.name || x.id, count: x.gifs || 0, sub: x.subscribers || 0, s: score(x.name, x.id) }))
    .sort((a, b) => b.s - a.s || b.sub - a.sub)
    .slice(0, 6);
  const tags = (Array.isArray(sg) ? sg : [])
    .filter((x) => x && x.type === "tag" && x.text)
    .map((x) => ({ type: "tag", id: x.text, name: x.text, count: x.gifs || 0, s: score(x.text) }))
    .sort((a, b) => b.s - a.s || b.count - a.count)
    .slice(0, 6);
  const users = ((c && c.items) || [])
    .filter((x) => x && x.username)
    .map((x) => ({ type: "user", id: x.username, name: x.username, count: x.gifs || 0, sub: x.followers || 0, verified: x.verified, s: score(x.username, x.name) }))
    .filter((x) => x.s > 0) // the creator search is very fuzzy
    .sort((a, b) => b.s - a.s || b.sub - a.sub)
    .slice(0, 4);
  return { niches, tags, users };
}

export const pickLabel = (p) => (p.type === "user" ? "@" + p.name : p.type === "tag" ? "#" + p.name : p.name);

// ---------- Feed: clips for the show ----------

// Niche feeds know other sort orders ("trending" is broken there despite the docs)
const NICHE_ORDER = { trending: "hot", top7: "best", top28: "best", top: "best", latest: "latest" };

function sources(S) {
  const count = `count=${PAGE}`;
  if (!S.rgPicks.length) return [{ id: `t:${S.rgOrder}`, type: "trending", name: "Trending", label: "Trending", path: (p) => `/gifs/search?order=${S.rgOrder}&${count}&page=${p}` }];
  return S.rgPicks.map((pick) => {
    const v = encodeURIComponent(pick.id);
    if (pick.type === "niche") {
      const order = NICHE_ORDER[S.rgOrder] || "hot";
      return { id: `n:${pick.id}:${order}`, type: "niche", name: pick.name, label: pick.name, path: (p) => `/niches/${v}/gifs?order=${order}&${count}&page=${p}` };
    }
    if (pick.type === "user") {
      const order = S.rgOrder === "latest" ? "new" : "top";
      return { id: `u:${pick.id.toLowerCase()}:${order}`, type: "user", name: pick.name, label: "@" + pick.name, path: (p) => `/users/${v}/search?order=${order}&${count}&page=${p}` };
    }
    return { id: `s:${pick.id.toLowerCase()}:${S.rgOrder}`, type: "tag", name: pick.name, label: "#" + pick.name, path: (p) => `/gifs/search?search_text=${v}&order=${S.rgOrder}&${count}&page=${p}` };
  });
}

function norm(g, src, S) {
  const u = g.urls || {};
  const isImg = g.type === 2 || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.hd || u.sd || "");
  const ordered = (S.rgQuality === "hd" ? [u.hd, u.sd] : [u.sd, u.hd]).filter(Boolean);
  return {
    id: g.id,
    video: !isImg,
    w: g.width || 9,
    h: g.height || 16,
    dur: g.duration || 0,
    src: ordered[0],
    hd: u.hd || u.sd, // saving always in the best quality
    href: "https://www.redgifs.com/watch/" + g.id,
    user: g.userName || "",
    desc: g.description || "",
    source: { type: src.type, name: src.name },
  };
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export class Feed {
  constructor(S, onError) {
    this.S = S;
    this.onError = onError;
    this.srcs = sources(S);
    this.pools = {};
    this.seen = new Set();
    this.dead = false;
  }

  async refill(src, pool) {
    let page = 1;
    if (pool.pages) {
      const max = Math.min(pool.pages, MAX_PAGES);
      let free = [];
      for (let p = 1; p <= max; p++) if (!pool.tried.has(p)) free.push(p);
      if (!free.length) {
        // Went through everything once → start over, repeats allowed now
        pool.tried.clear();
        this.seen.clear();
        free = Array.from({ length: max }, (_, i) => i + 1);
      }
      page = free[Math.floor(Math.random() * free.length)];
    }
    pool.tried.add(page);
    const data = await get(src.path(page));
    const gifs = data.gifs || []; // "boosted_gifs" (ads) are ignored on purpose
    pool.pages = data.pages || 1;
    if (!gifs.length && page === 1) pool.dead = true;
    pool.items.push(...shuffle(gifs.filter((g) => g && g.urls && (g.urls.hd || g.urls.sd)).map((g) => norm(g, src, this.S))));
  }

  // Next clip that fits: fn(d) → true if its kind/shape is wanted
  // (at most a few pages per call, so filters that reject nearly everything don't flood the API)
  async next(fits) {
    let refills = 0;
    for (let guard = 0; guard < 400; guard++) {
      const live = this.srcs.filter((x) => !(this.pools[x.id] && this.pools[x.id].dead));
      if (!live.length) {
        this.dead = true;
        return null;
      }
      const src = live[Math.floor(Math.random() * live.length)];
      const pool = this.pools[src.id] || (this.pools[src.id] = { items: [], pages: 0, tried: new Set(), dead: false, loading: null });
      if (!pool.items.length) {
        if (++refills > 4) return null;
        if (!pool.loading) pool.loading = this.refill(src, pool).finally(() => (pool.loading = null));
        try {
          await pool.loading;
        } catch (e) {
          console.error("[PMV Generator] RedGifs", e);
          this.onError(`${src.label}: ${e.message}`);
          if (e.status === 400 || e.status === 404) {
            pool.dead = true; // e.g. the creator doesn't exist → drop this source
            continue;
          }
          this.dead = true; // unreachable – the show continues with Stash clips
          return null;
        }
        continue;
      }
      const d = pool.items.pop();
      if (this.seen.has(d.id) || !d.src || !fits(d)) continue;
      this.seen.add(d.id);
      return d;
    }
    return null;
  }
}

// ---------- Save to Stash ----------
// The backend downloads the file into the library; then Stash scans exactly this folder and the
// new scene gets the RedGifs link, title, description and the tag "RedGifs".

let libraryRoot = null;
async function defaultBase() {
  if (!libraryRoot) {
    const d = await gql(`query { configuration { general { stashes { path excludeVideo } } } }`);
    const stashes = d.configuration.general.stashes || [];
    const lib = stashes.find((x) => !x.excludeVideo) || stashes[0];
    if (!lib) throw new Error("no Stash library configured");
    libraryRoot = lib.path.replace(/[\\/]+$/, "");
  }
  return libraryRoot + (libraryRoot.includes("/") && !libraryRoot.includes("\\") ? "/" : "\\") + "RedGifs";
}

function folderFor(d, S) {
  if (S.rgDlLayout === "flat") return "";
  if (S.rgDlLayout === "creator") return d.user || "Unknown";
  return (d.source && d.source.name) || "Trending";
}

function titleFor(d) {
  const text = d.desc.replace(/\s+/g, " ").trim();
  const short = text.length > 120 ? text.slice(0, 117) + "…" : text;
  return short || `${d.user || "RedGifs"} – ${d.id}`;
}

const saved = new Map(); // clip id → promise (saved in this session)

export const isSaved = (d) => saved.has(d.id);

// Returns { existed, dir } once the file is in the library; the import into Stash continues in the background
export function save(d, S) {
  if (!saved.has(d.id)) {
    const p = (async () => {
      const base = String(S.rgDlDir || "").trim() || (await defaultBase());
      const res = await gql(`mutation($a: Map) { runPluginOperation(plugin_id: "${PLUGIN}", args: $a) }`, {
        a: { mode: "rg_download", url: d.hd, id: d.id, base, folder: folderFor(d, S), filename: `${d.user || "redgifs"}_${d.id}` },
      });
      const out = res && res.runPluginOperation;
      if (!out || !out.path) throw new Error((out && out.error) || "no answer from the plugin backend – is Python in the PATH?");
      importIntoStash(out, d).catch((e) => console.error("[PMV Generator] RedGifs import", e));
      return out;
    })();
    saved.set(d.id, p);
    p.catch(() => saved.delete(d.id)); // failed → can be tried again
  }
  return saved.get(d.id);
}

async function ensureTag(name) {
  const d = await gql(`query($n: String!) { findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`, { n: name });
  if (d.findTags.tags[0]) return d.findTags.tags[0].id;
  return (await gql(`mutation($n: String!) { tagCreate(input: { name: $n }) { id } }`, { n: name })).tagCreate.id;
}

async function importIntoStash(out, d) {
  const isImage = out.kind === "image";
  await gql(`mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }`, {
    i: { paths: [out.dir], scanGenerateCovers: true, scanGeneratePreviews: true, scanGenerateThumbnails: true, scanGeneratePhashes: true, scanGenerateImagePhashes: true },
  });
  const find = isImage
    ? `query($p: String!) { findImages(image_filter: { path: { value: $p, modifier: EQUALS } }) { images { id title urls tags { id } } } }`
    : `query($p: String!) { findScenes(scene_filter: { path: { value: $p, modifier: EQUALS } }) { scenes { id title urls tags { id } } } }`;
  let obj = null;
  for (let i = 0; i < 45 && !obj; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await gql(find, { p: out.path });
    obj = (isImage ? r.findImages.images : r.findScenes.scenes)[0] || null;
  }
  if (!obj) return;
  const tagId = await ensureTag("RedGifs");
  const input = {
    id: obj.id,
    title: obj.title || titleFor(d),
    urls: [...new Set([...(obj.urls || []), d.href])],
    tag_ids: [...new Set([...obj.tags.map((t) => t.id), tagId])],
  };
  if (d.desc) input.details = d.desc;
  await gql(isImage ? `mutation($i: ImageUpdateInput!) { imageUpdate(input: $i) { id } }` : `mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input });
}
