// RedTok – where the videos come from (RedGifs and your own Stash) and what the page remembers
// (likes, follows, history, downloads, settings). Everything you do stays in this browser and in a backup
// file next to Stash; RedGifs is only read, never written to – there is no login.

import "./boot.js"; // (first: it may fill the browser storage from the backup)
import { call, gql, store, setAfterSet, emit, t, wait } from "./core.js";

// ---------- settings ----------
export const settings = Object.assign({
  base: "", scan: true, quality: "hd", playq: "auto", fit: "auto", sound: true, volume: 1, autonext: false,
  skipSeen: true, speed: 1, lang: "auto",
}, store.get("settings", {}));
delete settings.subs; delete settings.sync; // (Reddit and the RedGifs login of the older local version)
export const saveSettings = () => store.set("settings", settings);

// ---------- RedGifs ----------
// The browser asks RedGifs itself when it may (RedGifs allows that from localhost); otherwise – Stash opened through
// a network address or a domain, an ad blocker in the way – the plugin's backend asks for it. Remembered per page view.
const API = "https://api.redgifs.com/v2";
let viaBackend = /[?&]via=backend(&|$)/.test(location.search), tokenP = null; // (?via=backend: always the detour – for testing)
const TOK = "redtok.token";
async function token(force) {
  if (!force) {
    try { const c = JSON.parse(localStorage.getItem(TOK) || "null"); if (c && c.token && c.exp > Date.now()) return c.token; } catch (e) { /* none */ }
  }
  if (!tokenP) {
    tokenP = (async () => {
      const r = await fetch(API + "/auth/temporary", { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      const j = await r.json();
      try { localStorage.setItem(TOK, JSON.stringify({ token: j.token, exp: Date.now() + 20 * 3600e3 })); } catch (e) { /* blocked */ }
      return j.token;
    })().finally(() => (tokenP = null));
  }
  return tokenP;
}
function apiError(status, j) {
  const er = (j && j.error) || {};
  let msg = er.message || "HTTP " + status;
  if (er.code === "UserNotFound") msg = t("This creator doesn't exist (any more)");
  else if (/NotFound/.test(er.code || "") || status === 404 || status === 410) msg = t("Not found – removed from RedGifs?");
  else if (status === 429) msg = t("RedGifs asks to slow down – try again in a minute");
  const e = new Error(msg);
  e.status = status;
  if (er.target) e.target = er.target;
  return e;
}
async function direct(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tk = await token(attempt > 0);
    const r = await fetch(API + path, { headers: { Authorization: "Bearer " + tk }, credentials: "omit", referrerPolicy: "no-referrer" });
    if (r.status === 401 || r.status === 403) continue; // the token ran out
    if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) { /* no body */ } throw apiError(r.status, j); }
    return r.json();
  }
  throw new Error(t("RedGifs didn't let us in"));
}
async function backend(path) {
  const o = await call({ mode: "api", path });
  if (!o) throw new Error(t("No answer from the plugin – press “Reload plugins” in Stash's settings"));
  if (o.status || o.error) throw apiError(o.status || 0, { error: { message: o.error, target: o.target } });
  return o.data;
}
const cache = new Map();
export async function rg(path, fresh) {
  const hit = !fresh && cache.get(path);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.data;
  let data;
  if (viaBackend) data = await backend(path);
  else {
    try { data = await direct(path); }
    catch (e) {
      if (e.status) throw e;
      // no answer at all ("Failed to fetch"): the browser can't reach RedGifs – go through the backend from now on
      console.warn("[RedTok] RedGifs not reachable from the browser – using the plugin backend", e);
      viaBackend = true;
      data = await backend(path);
    }
  }
  if (!data) throw new Error(t("RedGifs sent nothing back"));
  cache.set(path, { at: Date.now(), data });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return data;
}
export const usingBackend = () => viaBackend;

// pictures the page may not load itself: the backend fetches them, up to 24 per call, two calls at a time
const imgCache = new Map(), imgQ = [];
let imgBusy = 0, imgTimer = 0;
export function imgData(url) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res) => { imgQ.push({ url, res }); clearTimeout(imgTimer); imgTimer = setTimeout(pumpImg, 30); }));
    if (imgCache.size > 1500) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(url);
}
function pumpImg() {
  while (imgBusy < 2 && imgQ.length) {
    const batch = imgQ.splice(0, 24);
    imgBusy++;
    call({ mode: "images", urls: batch.map((j) => j.url) })
      .then((o) => { const d = (o && o.data) || {}; batch.forEach((j) => j.res(d[j.url] || "")); })
      .catch(() => batch.forEach((j) => { imgCache.delete(j.url); j.res(""); }))
      .finally(() => { imgBusy--; pumpImg(); });
  }
}

// creators seen in any answer (picture, followers, verified …)
export const users = new Map();
export const userOf = (n) => users.get(String(n || "").toLowerCase());
export function takeUsers(d) {
  (d && d.users || []).forEach((u) => u && (u.username || u.name) && users.set(String(u.username || u.name).toLowerCase(), Object.assign(userOf(u.username || u.name) || {}, u)));
}
export const userPic = (name) => { const u = userOf(name); return (u && u.profileImageUrl) || (following.find((f) => f.name.toLowerCase() === String(name).toLowerCase()) || {}).img || ""; };

export function norm(g) {
  const u = (g && g.urls) || {};
  if (!g || !g.userName || !(u.hd || u.sd) || g.promoted || g.type === 2) return null;
  return {
    id: g.id, user: g.userName, hd: u.hd || u.sd, sd: u.sd || u.hd, poster: u.poster || u.thumbnail || "", thumb: u.thumbnail || u.poster || "",
    dur: g.duration || 0, w: g.width || 0, h: g.height || 0, likes: g.likes || 0, views: g.views || 0, audio: !!g.hasAudio,
    tags: (g.tags || []).slice(0, 10), niches: (g.niches || []).slice(0, 12), desc: g.description || "", date: g.createDate || 0, verified: !!g.verified,
  };
}
export const watchUrl = (g) => (g.stash ? `${location.origin}/scenes/${g.sceneId}` : `https://www.redgifs.com/watch/${g.id}`);

// ---------- your own Stash (read only) ----------
const SCENES_Q = `query($filter: FindFilterType, $sf: SceneFilterType) { findScenes(filter: $filter, scene_filter: $sf) { count scenes {
  id title date rating100 o_counter play_count created_at paths { screenshot stream preview } files { duration width height }
  performers { id name image_path } studio { id name } tags { id name } } } }`;
export function normStash(sc) {
  const f = (sc.files && sc.files[0]) || {};
  const pf = (sc.performers && sc.performers[0]) || null;
  const stream = sc.paths && sc.paths.stream;
  if (!stream) return null;
  const dur = f.duration || 0;
  return {
    id: "stash-" + sc.id, stash: true, sceneId: sc.id, pid: pf && pf.id, img: (pf && pf.image_path) || "", user: (pf && pf.name) || (sc.studio && sc.studio.name) || "Stash",
    hd: stream, sd: stream, preview: (sc.paths && sc.paths.preview) || "", poster: sc.paths.screenshot || "", thumb: sc.paths.screenshot || "",
    dur, w: f.width || 0, h: f.height || 0, likes: sc.o_counter || 0, views: sc.play_count || 0, audio: true,
    tags: (sc.tags || []).map((x) => x.name).slice(0, 12), tagIds: (sc.tags || []).map((x) => x.id).slice(0, 12), niches: [],
    desc: sc.title || "", date: sc.created_at ? Math.floor(Date.parse(sc.created_at) / 1000) : 0, studio: sc.studio && sc.studio.name,
    rating: sc.rating100 || 0,
  };
}
// long scenes start somewhere in the first half, like a clip (fresh every time a scene is shown)
export const stashStart = (g) => (g.stash && g.dur > 120 ? Math.round(g.dur * (0.05 + Math.random() * 0.5)) : 0);
export async function stashPerformer(id) {
  const d = await gql(`query($id: ID!) { findPerformer(id: $id) { id name image_path scene_count favorite } }`, { id: String(id) });
  return d.findPerformer;
}

// ---------- what you do (kept in this browser, copied to the backup file) ----------
// (the older local version also kept Reddit pictures and v.redd.it clips – RedTok can't play those)
const playable = (l) => (Array.isArray(l) ? l.filter((g) => g && g.id && !g.hls && !g.image && (g.hd || g.sd)) : []);
export let liked = playable(store.get("liked", [])); // gifs, oldest first
export let following = store.get("following", []); // [{name, img}]
export let niches = store.get("niches", []); // followed niches [{id, name, img}]
export let hidden = store.get("hidden", []); // creators you never want to see
export let nope = store.get("nope", []); // single videos you're not interested in
export let history = playable(store.get("watched", [])); // newest first, gifs
export let saved = playable(store.get("saved", [])); // downloaded gifs, newest first
export let doneSet = new Set(store.get("done", [])); // ids of everything downloaded (also older downloads without details)
let seen = new Set(store.get("seen", []));
const nopeSet = () => new Set(nope);
const low = (s) => String(s || "").toLowerCase();

export const isLiked = (id) => liked.some((g) => g.id === id);
export function setLiked(g, on) {
  if (on === isLiked(g.id)) return on;
  liked = on ? [...liked, slim(g)] : liked.filter((x) => x.id !== g.id);
  store.set("liked", liked);
  emit("liked", { id: g.id, on });
  return on;
}
export function unlikeMany(ids) {
  const s = new Set(ids);
  liked = liked.filter((g) => !s.has(g.id));
  store.set("liked", liked);
  emit("liked", {});
}
export const isFollowing = (n) => following.some((f) => low(f.name) === low(n));
export function setFollow(name, on) {
  if (on === isFollowing(name)) return on;
  following = on ? [...following, { name, img: userPic(name) }] : following.filter((f) => low(f.name) !== low(name));
  store.set("following", following);
  emit("follow", { name, on });
  return on;
}
export const followsNiche = (id) => niches.some((n) => n.id === id);
export function setNiche(n, on) {
  if (on === followsNiche(n.id)) return on;
  niches = on ? [...niches, { id: n.id, name: n.name || n.id, img: n.img || "" }] : niches.filter((x) => x.id !== n.id);
  store.set("niches", niches);
  emit("niches", {});
  return on;
}
export const isHidden = (name) => hidden.some((h) => low(h) === low(name));
export function setHidden(name, on) {
  hidden = on ? [...new Set([...hidden, name])] : hidden.filter((h) => low(h) !== low(name));
  store.set("hidden", hidden);
  emit("hidden", { name, on });
}
export function setNope(id, on) {
  nope = on ? [...nope.filter((x) => x !== id), id].slice(-5000) : nope.filter((x) => x !== id);
  store.set("nope", nope);
}
// a video counts as watched after a couple of seconds on screen
let seenTimer = 0;
export function markWatched(g) {
  if (!g || g.stash) return;
  seen.add(g.id);
  history = [slim(g), ...history.filter((x) => x.id !== g.id)].slice(0, 500);
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => { store.set("seen", [...seen].slice(-20000)); store.set("watched", history); }, 1500);
}
export function clearHistory() { history = []; seen = new Set(); store.set("watched", []); store.set("seen", []); emit("data", {}); }
export function removeFromHistory(ids) { const s = new Set(ids); history = history.filter((g) => !s.has(g.id)); store.set("watched", history); emit("data", {}); }
export function addSaved(g) {
  doneSet.add(g.id);
  saved = [slim(g), ...saved.filter((x) => x.id !== g.id)].slice(0, 5000);
}
export function flushSaved() { store.set("saved", saved); store.set("done", [...doneSet].slice(-50000)); }
export function forgetDownloads() { doneSet = new Set(); saved = []; flushSaved(); emit("data", {}); }
// keep what a grid or a feed needs – not the whole answer
const slim = (g) => {
  const o = {};
  for (const k of ["id", "user", "hd", "sd", "poster", "thumb", "dur", "w", "h", "likes", "views", "audio", "tags", "niches", "desc", "date", "verified", "stash", "sceneId", "pid", "img", "preview", "tagIds", "studio"]) if (g[k] != null && g[k] !== "") o[k] = g[k];
  return o;
};

// what you like, as niches with a weight – For You leans towards them
export function taste() {
  const w = new Map();
  const add = (id, n) => id && w.set(id, (w.get(id) || 0) + n);
  niches.forEach((n) => add(n.id, 6));
  liked.slice(-300).forEach((g) => (g.niches || []).forEach((n) => add(n, 3)));
  saved.slice(0, 300).forEach((g) => (g.niches || []).forEach((n) => add(n, 2)));
  history.slice(0, 200).forEach((g) => (g.niches || []).forEach((n) => add(n, 0.5)));
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
}

// ---------- sources: one list of videos, filled page by page, shared by a feed and a grid ----------
export const ORDERS = {
  foryou: [["foryou", "For you"], ["trending", "Trending"], ["latest", "New"], ["top7", "Top this week"], ["top28", "Top this month"], ["top", "Top of all time"]],
  search: [["trending", "Trending"], ["latest", "New"], ["top7", "Top this week"], ["top", "Top of all time"]],
  niche: [["hot", "Hot"], ["latest", "New"], ["top", "Top"], ["best", "Best"]],
  user: [["recent", "Latest"], ["top", "Popular"], ["trending", "Trending"]],
  stash: [["random", "Random"], ["created", "Recently added"], ["date", "Newest"], ["oldest", "Oldest"], ["rating", "Highest rated"], ["plays", "Most played"], ["o", "Most O"]],
};
export const orderOf = (spec) => spec.order || (ORDERS[spec.t] ? ORDERS[spec.t][0][0] : "");
const enc = encodeURIComponent;

async function inPool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}

export function makeSource(spec) {
  const S = { spec, items: [], done: false, total: null, page: 0, pages: Infinity, ids: new Set(), subs: new Set(), busy: null, error: null };
  const gifPage = async (path) => {
    const d = await rg(path);
    takeUsers(d);
    if (d.pages) S.pages = d.pages;
    if (d.total != null) S.total = d.total;
    return { list: (d.gifs || []).map(norm).filter(Boolean), last: !(d.gifs || []).length || (d.pages && d.page >= d.pages) };
  };
  // search: query= finds the words in tags and descriptions, tags= only that tag (RedGifs ignores the older search_text=)
  const search = async (order, q) => {
    const r = await gifPage(`/gifs/search?${q ? (spec.exact ? "tags=" : "query=") + enc(q) + "&" : ""}order=${order}&count=40&page=${++S.page}&type=g`);
    if (r.last || S.page >= Math.min(S.pages, 200)) S.done = true;
    return r.list;
  };
  const nichePage = async (st, slug, order) => {
    // niches get renamed now and then – RedGifs names the new one
    for (let k = 0; k < 2; k++) {
      try {
        const d = await rg(`/niches/${enc(slug)}/gifs?order=${order}&count=40&page=${st.page + 1}`);
        st.page++;
        takeUsers(d);
        if (d.pages) st.pages = d.pages;
        if (d.total != null) st.total = d.total;
        st.done = !(d.gifs || []).length || st.page >= Math.min(st.pages || 1, 200);
        return (d.gifs || []).map(norm).filter(Boolean);
      } catch (e) { if (e.target && k === 0) { slug = e.target; st.slug = slug; continue; } throw e; }
    }
    return [];
  };
  const LOAD = {
    foryou: async () => {
      const o = orderOf(spec);
      const mix = o === "foryou" ? taste() : [];
      if (!mix.length) return search(o === "foryou" ? "trending" : o);
      // a page of what's trending, mixed with two pages of the niches you like (weighted, at random)
      S.np = S.np || {};
      const total = mix.reduce((a, [, w]) => a + w, 0);
      const pick = () => { let r = Math.random() * total; for (const [id, w] of mix) if ((r -= w) <= 0) return id; return mix[0][0]; };
      const picks = [...new Set([pick(), pick(), pick()])].filter((id) => !(S.np[id] && S.np[id].done)).slice(0, 2);
      const lists = await Promise.all([
        search("trending").catch(() => []),
        ...picks.map((id) => nichePage((S.np[id] = S.np[id] || { page: 0 }), id, "hot").catch(() => [])),
      ]);
      S.done = false; // trending alone ending doesn't end your feed
      const [a, ...b] = lists;
      const bb = b.flat().sort(() => Math.random() - 0.5);
      const out = [];
      while (a.length || bb.length) { if (a.length) out.push(a.shift()); if (bb.length) out.push(bb.shift()); }
      if (!out.length && S.page > 200) S.done = true;
      return out;
    },
    search: () => search(orderOf(spec), spec.q),
    niche: async () => { S.st = S.st || { page: 0 }; const l = await nichePage(S.st, S.st.slug || spec.slug, orderOf(spec)); S.total = S.st.total; if (S.st.done) S.done = true; return l; },
    user: async () => {
      const r = await gifPage(`/users/${enc(spec.name)}/search?order=${orderOf(spec)}&count=40&page=${++S.page}`);
      if (r.last || S.page >= Math.min(S.pages, 250)) S.done = true;
      return r.list;
    },
    // newest first across everyone you follow: a few videos per creator are kept ready, the newest one goes next
    following: async () => {
      if (!S.fx) S.fx = following.map((f) => ({ name: f.name, page: 0, buf: [], done: false }));
      if (!S.fx.length) { S.done = true; return []; }
      const out = [];
      while (out.length < 24) {
        const need = S.fx.filter((c) => !c.done && !c.buf.length);
        await inPool(need, 6, async (c) => {
          try {
            const d = await rg(`/users/${enc(c.name)}/search?order=recent&count=20&page=${++c.page}`);
            takeUsers(d);
            const l = (d.gifs || []).map(norm).filter(Boolean);
            c.buf.push(...l);
            if (!(d.gifs || []).length || c.page >= (d.pages || 1)) c.done = true;
          } catch (e) { c.done = true; }
        });
        const live = S.fx.filter((c) => c.buf.length);
        if (!live.length) { S.done = true; break; }
        live.sort((x, y) => y.buf[0].date - x.buf[0].date);
        out.push(live[0].buf.shift());
      }
      return out;
    },
    stash: async () => {
      const o = orderOf(spec);
      const sort = { random: "random_" + (S.seed = S.seed || Math.floor(Math.random() * 1e8)), created: "created_at", date: "date", oldest: "date", rating: "rating", plays: "play_count", o: "o_counter" }[o] || "random";
      const filter = { per_page: 40, page: S.page + 1, sort, direction: o === "oldest" ? "ASC" : "DESC" };
      if (spec.q) filter.q = spec.q;
      const sf = {};
      if (spec.performer) sf.performers = { value: [String(spec.performer)], modifier: "INCLUDES" };
      if (spec.tag) sf.tags = { value: [String(spec.tag)], modifier: "INCLUDES", depth: 0 };
      const d = (await gql(SCENES_Q, { filter, sf })).findScenes;
      S.page++;
      S.total = d.count;
      if (S.page * 40 >= d.count) S.done = true;
      return d.scenes.map(normStash).filter(Boolean);
    },
    list: async () => { S.done = true; return (spec.list || []).slice(); },
  };
  const keep = (g) => {
    if (S.ids.has(g.id)) return false;
    if (spec.t === "list" || spec.t === "stash") return true;
    if (spec.t !== "user" && isHidden(g.user)) return false;
    if (spec.t !== "user" && nopeSet().has(g.id)) return false;
    if (spec.t === "foryou" && settings.skipSeen && seen.has(g.id)) return false;
    return true;
  };
  // one more page; pages that came back empty after filtering are skipped (a few at most)
  S.more = () => {
    if (S.done) return Promise.resolve(0);
    if (S.busy) return S.busy;
    S.busy = (async () => {
      let added = [];
      try {
        for (let k = 0; k < (spec.t === "foryou" ? 8 : 4) && !added.length && !S.done; k++) {
          const got = await LOAD[spec.t]();
          added = got.filter(keep);
          added.forEach((g) => S.ids.add(g.id));
          if (!got.length && spec.t !== "foryou") S.done = true;
        }
        // several pages in a row with nothing new (only repeats or filtered out): that's the end
        if (!added.length) S.done = true;
        S.error = null;
      } catch (e) {
        S.error = e;
        throw e;
      } finally {
        S.busy = null;
      }
      if (added.length) {
        const from = S.items.length;
        S.items.push(...added);
        S.subs.forEach((fn) => { try { fn(added, from); } catch (e) { console.error(e); } });
      } else if (S.done) S.subs.forEach((fn) => { try { fn([], S.items.length); } catch (e) { console.error(e); } });
      return added.length;
    })();
    return S.busy;
  };
  S.on = (fn) => S.subs.add(fn);
  S.off = (fn) => S.subs.delete(fn);
  if (spec.t === "list") { S.items = (spec.list || []).slice(); S.items.forEach((g) => S.ids.add(g.id)); S.done = true; S.total = S.items.length; }
  return S;
}
export const listSource = (list, extra) => makeSource(Object.assign({ t: "list", list }, extra || {}));
// the same list again, from the start (a tab tapped twice, "refresh")
export const freshSource = (S) => makeSource(Object.assign({}, S.spec));

// one video, fresh from RedGifs (new links when the old ones stopped working)
export async function refetchGif(id) {
  const d = await rg(`/gifs/${enc(id)}`, true);
  takeUsers(d);
  return norm(d.gif);
}

// ---------- backup ----------
// Likes, follows, history and settings are copied to a file next to Stash a few seconds after every change
// (backend modes bk_save / bk_load); boot.js puts them back into a browser that has none.
const bkEntries = () => {
  const o = {};
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("rgf.")) o[k] = localStorage.getItem(k); } catch (e) { /* blocked */ }
  return o;
};
let bkTimer = 0, bkLast = "";
setAfterSet(() => { clearTimeout(bkTimer); bkTimer = setTimeout(bkSave, 6000); });
export async function bkSave() {
  const e = bkEntries();
  const body = JSON.stringify(e);
  if (body === bkLast || !Object.keys(e).length) return;
  try { await call({ mode: "bk_save", data: e }); bkLast = body; } catch (x) { /* the next change tries again */ }
}
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && bkSave());
// everything as one file to keep or to move to another browser
export function exportData() {
  return JSON.stringify({ app: "RedTok", at: new Date().toISOString(), data: bkEntries() }, null, 1);
}
export function importData(text) {
  const j = JSON.parse(text);
  const d = (j && j.data) || j;
  const e = Object.entries(d || {}).filter(([k, v]) => k.startsWith("rgf.") && typeof v === "string");
  if (!e.length) throw new Error(t("That isn't a RedTok file"));
  e.forEach(([k, v]) => localStorage.setItem(k, v));
  return e.length;
}
export { wait };
