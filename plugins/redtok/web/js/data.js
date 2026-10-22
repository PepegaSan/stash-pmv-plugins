// RedTok – where the videos come from (RedGifs and your own Stash) and what the page remembers
// (likes, follows, history, downloads, settings). Everything you do stays in this browser and in a backup
// file next to Stash; RedGifs is only read, never written to – there is no login.

import "./boot.js"; // (first: it may fill the browser storage from the backup)
import { call, gql, store, setAfterSet, emit, t, wait } from "./core.js";
import { touch, push, syncOn } from "./sync.js";
import * as algo from "./algo.js";
export { algo };

// ---------- settings ----------
export const settings = Object.assign({
  algo: true, learn: true, explore: "mid", // (the For You algorithm: on, learns from what you watch, some surprises)
  base: "", bg: true, scan: true, meta: true, metaTags: false, metaPerf: false, quality: "hd", playq: "auto", fit: "auto", sound: true, volume: 1, autonext: false,
  skipSeen: true, skipSeenMore: false, syncDev: false, followTags: false, speed: 1, lang: "auto", glow: true, wide: true, space: "pause", frame: "auto", side: true,
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
// The tags a creator uses, counted over their newest videos (up to 6 pages) – the filter chips on their profile
const tagCache = new Map();
export async function creatorTags(name, force) {
  const k = String(name).toLowerCase();
  if (!force && tagCache.has(k)) return tagCache.get(k);
  const count = new Map();
  let seen = 0, total = null;
  try {
    for (let page = 1; page <= 6; page++) {
      const d = await rg(`/users/${enc(name)}/search?order=recent&count=40&page=${page}`);
      if (d.total != null) total = d.total;
      for (const g of d.gifs || []) { seen++; for (const tg of g.tags || []) count.set(tg, (count.get(tg) || 0) + 1); }
      if (!(d.gifs || []).length || page >= (d.pages || 1)) break;
    }
  } catch (e) { /* what we have so far */ }
  const res = { tags: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), seen, total };
  if (seen) tagCache.set(k, res);
  return res;
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
export let blocked = store.get("blocked", []); // tags and niches you never want to see
export let tagFollows = store.get("tagFollows", []); // #tags you follow: their videos come in For You and Following
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
  if (on) { algo.signal(g, 3); algo.rewardArm(g._src, true); } else algo.signal(g, -2.5);
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
  algo.addFeature("u:" + algo.key(name), on ? 4 : -2);
  emit("follow", { name, on });
  return on;
}
export const followsNiche = (id) => niches.some((n) => n.id === id);
export function setNiche(n, on) {
  if (on === followsNiche(n.id)) return on;
  niches = on ? [...niches, { id: n.id, name: n.name || n.id, img: n.img || "" }] : niches.filter((x) => x.id !== n.id);
  store.set("niches", niches);
  algo.addFeature("n:" + algo.key(n.id), on ? 5 : -2);
  emit("niches", {});
  return on;
}
const tagKey = (s) => String(s || "").replace(/^#/, "").trim();
export const followsTag = (tag) => tagFollows.some((x) => low(x) === low(tagKey(tag)));
export function setFollowTag(tag, on) {
  tag = tagKey(tag);
  if (!tag || on === followsTag(tag)) return on;
  tagFollows = on ? [...tagFollows, tag] : tagFollows.filter((x) => low(x) !== low(tag));
  store.set("tagFollows", tagFollows);
  algo.addFeature("t:" + algo.key(tag), on ? 5 : -2);
  emit("tagfollows", { tag, on });
  return on;
}
export const isHidden = (name) => hidden.some((h) => low(h) === low(name));
export function setHidden(name, on) {
  hidden = on ? [...new Set([...hidden, name])] : hidden.filter((h) => low(h) !== low(name));
  store.set("hidden", hidden);
  if (on) algo.forget("u:" + algo.key(name));
  emit("hidden", { name, on });
}
// g (when given) teaches the algorithm: "not interested" is a strong no for its tags and a mild one for the creator
export function setNope(id, on, g) {
  nope = on ? [...nope.filter((x) => x !== id), id].slice(-5000) : nope.filter((x) => x !== id);
  store.set("nope", nope);
  if (g && !g.stash) {
    algo.signal(g, on ? -3.5 : 3.5, { user: 0.4 });
    if (on) algo.rewardArm(g._src, false);
  }
}
// a video you saved on purpose (one or two at a time – not a whole creator) says a lot about your taste
export function savedSignal(g) {
  if (!g || g.stash) return;
  algo.signal(g, 3.5);
  algo.rewardArm(g._src, true);
}
// Read everything you already have – likes, saved videos, downloads, follows, followed niches and #tags – into a fresh profile.
// Older likes and downloads (and downloads known only by their id) often have no tags: RedGifs is asked for them (400 at most,
// five at a time) and the answers are kept. A few top videos of every creator you follow add their topics a little.
// progress(done, total) is called along the way. Returns { videos, creators, stopped } (stopped = RedGifs said "slow down").
export async function scanTaste(progress) {
  const bare = (g) => !(g.tags && g.tags.length) && !(g.niches && g.niches.length);
  const known = new Set([...liked, ...saved].map((g) => g.id));
  const jobs = [...liked.filter(bare), ...saved.filter(bare)].map((g) => ({ g }));
  [...doneSet].filter((id) => !known.has(id)).slice(-300).forEach((id) => jobs.push({ id }));
  jobs.length = Math.min(jobs.length, 400);
  const names = following.map((f) => f.name).slice(0, 40);
  const total = jobs.length + names.length;
  let n = 0, stopped = false;
  const extra = [], tick = () => progress && progress(++n, total);
  await inPool(jobs, 5, async (j) => {
    if (!stopped) {
      try {
        const f = norm((await rg(`/gifs/${enc(j.g ? j.g.id : j.id)}`)).gif);
        if (f) { if (j.g) { j.g.tags = f.tags; j.g.niches = f.niches; if (!j.g.dur) { j.g.dur = f.dur; j.g.w = f.w; j.g.h = f.h; } } else extra.push(f); }
      } catch (e) { if (e.status === 429) stopped = true; }
    }
    tick();
  });
  if (jobs.some((j) => j.g)) { store.set("liked", liked); store.set("saved", saved); }
  const creators = [];
  await inPool(names, 4, async (name) => {
    if (!stopped) {
      try {
        const d = await rg(`/users/${enc(name)}/search?order=top&count=20&page=1`);
        takeUsers(d);
        creators.push(...(d.gifs || []).map(norm).filter(Boolean));
      } catch (e) { if (e.status === 429) stopped = true; }
    }
    tick();
  });
  algo.reset();
  algo.bootstrap({ liked, saved, history, following, niches, tagFollows });
  extra.forEach((g) => algo.signal(g, 2));
  creators.forEach((g) => algo.signal(g, 0.3, { noUser: true }));
  return { videos: liked.length + saved.length + extra.length, creators: names.length, stopped };
}
// you stopped watching a video: played = seconds really played; neg = skipping may count against it (only in For You)
export function viewed(g, played, neg) {
  if (!settings.learn || !g || g.stash) return;
  algo.view(g, played, neg);
}
const norm1 = (s) => String(s || "").replace(/^#/, "").replace(/\s+/g, "").toLowerCase();
export const isBlockedTag = (tag) => blocked.some((b) => norm1(b) === norm1(tag));
export function setBlockedTag(tag, on) {
  tag = String(tag || "").replace(/^#/, "").trim();
  if (!tag) return;
  blocked = on ? [...new Set([...blocked.filter((b) => norm1(b) !== norm1(tag)), tag])] : blocked.filter((b) => norm1(b) !== norm1(tag));
  store.set("blocked", blocked);
  emit("blocked", { tag, on });
}
// a video with one of your blocked tags (or in a blocked niche)
export const hasBlocked = (g) => blocked.length > 0 && [...(g.tags || []), ...(g.niches || [])].some(isBlockedTag);
// Seen = it was on screen for a moment (also when you scrolled past it); watched (the list in your profile) = a couple of seconds.
// Skipping videos you've watched uses "seen", so fast scrolling doesn't bring them back.
let seenTimer = 0;
const flushSeen = () => { clearTimeout(seenTimer); seenTimer = 0; store.set("seen", [...seen].slice(-20000)); store.set("watched", history); };
export function markSeen(g) {
  if (!g || g.stash || seen.has(g.id)) return;
  seen.add(g.id);
  clearTimeout(seenTimer);
  seenTimer = setTimeout(flushSeen, 1500);
}
export function markWatched(g) {
  if (!g || g.stash) return;
  markSeen(g);
  history = [slim(g), ...history.filter((x) => x.id !== g.id)].slice(0, 500);
  clearTimeout(seenTimer);
  seenTimer = setTimeout(flushSeen, 1500);
}
addEventListener("pagehide", () => seenTimer && flushSeen());
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
  foryou: [["foryou", "For you"], ["mine", "Only my niches"], ["trending", "Trending"], ["latest", "New"], ["top7", "Top this week"], ["top28", "Top this month"], ["top", "Top of all time"]],
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
  // a page of one #tag (exact tag; newest or trending, at random so the same top videos don't come first every time)
  const tagPage = async (st, tag) => {
    const d = await rg(`/gifs/search?tags=${enc(tag)}&order=${Math.random() < 0.5 ? "latest" : "trending"}&count=40&page=${st.page + 1}&type=g`);
    st.page++;
    takeUsers(d);
    st.done = !(d.gifs || []).length || st.page >= Math.min(d.pages || 1, 100);
    return (d.gifs || []).map(norm).filter(Boolean);
  };
  // ---------- the For You algorithm (see algo.js): ask several sources, rank what comes back, hand out a few at a time ----------
  const LEVEL = { low: 0.1, mid: 0.2, high: 0.35 };
  const eligible = (g, ns) => !S.ids.has(g.id) && !isHidden(g.user) && !ns.has(g.id) && !hasBlocked(g) && !(settings.skipSeen && seen.has(g.id));
  // [[name, weight]] of what you like most, with what you follow always in
  const withFollows = (top, names, floor) => {
    const m = new Map(top);
    names.forEach((n) => m.set(n, Math.max(m.get(n) || 0, floor)));
    return [...m.entries()];
  };
  const ask = {
    // a page of trending or new videos
    async trend(st) { return askSearch(st, "trend", Math.random() < 0.25 ? "top7" : "trending"); },
    async fresh(st) { return askSearch(st, "fresh", "latest"); },
    async niche(st, w) {
      for (let k = 0; k < 3; k++) {
        const id = algo.draw(w.n)[0];
        const order = Math.random() < 0.25 ? "latest" : "hot";
        const c = (S.np[id + "|" + order] = S.np[id + "|" + order] || { page: 0 });
        if (!id || c.done) continue;
        return nichePage(c, id, order);
      }
      return [];
    },
    async tag(st, w) {
      for (let k = 0; k < 3; k++) {
        const tg = algo.draw(w.t)[0];
        const c = (S.tp[tg] = S.tp[tg] || { page: 0 });
        if (!tg || c.done) continue;
        return tagPage(c, algo.nameOf("t:" + tg));
      }
      return [];
    },
    async creator(st, w) {
      for (let k = 0; k < 3; k++) {
        const name = algo.draw(w.u)[0];
        const order = Math.random() < 0.5 ? "trending" : "recent";
        const c = (S.cp[name + "|" + order] = S.cp[name + "|" + order] || { page: 0 });
        if (!name || c.done) continue;
        const d = await rg(`/users/${enc(name)}/search?order=${order}&count=20&page=${c.page + 1}`);
        c.page++;
        takeUsers(d);
        c.done = !(d.gifs || []).length || c.page >= (d.pages || 1);
        return (d.gifs || []).map(norm).filter(Boolean);
      }
      return [];
    },
    // something next to your taste: a tag that shows up together with what you like, or a popular niche you haven't touched
    async explore(st) {
      const adj = new Map();
      [...liked.slice(-60), ...history.slice(0, 60), ...st.pool.slice(0, 80)].forEach((g) => {
        const fs = [...(g.tags || []).map((x) => "t:" + algo.key(x)), ...(g.niches || []).map((x) => "n:" + algo.key(x))];
        if (!fs.some((f) => algo.eff(f) > 1)) return;
        (g.tags || []).forEach((x) => { const k = "t:" + algo.key(x); if (!algo.known(k) && !isBlockedTag(x)) adj.set(x, (adj.get(x) || 0) + 1); });
      });
      if (adj.size && Math.random() < 0.55) {
        const tg = algo.draw([...adj.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15), 1)[0];
        const c = (S.tp["x:" + tg] = S.tp["x:" + tg] || { page: 0 });
        if (tg && !c.done) return tagPage(c, tg);
      }
      if (!st.uni) {
        const d = await rg(`/niches/search?query=&order=subscribers&count=40&page=${1 + Math.floor(Math.random() * 3)}`);
        st.uni = (d.niches || []).map((n) => n.id).filter(Boolean);
      }
      const fresh = st.uni.filter((id) => !algo.known("n:" + algo.key(id)) && !isBlockedTag(id) && !(S.np[id + "|hot"] || {}).done);
      if (!fresh.length) { st.uni = null; return []; }
      const id = fresh[Math.floor(Math.random() * fresh.length)];
      return nichePage((S.np[id + "|hot"] = S.np[id + "|hot"] || { page: 0 }), id, "hot");
    },
  };
  // (trending and new keep a page counter of their own; it starts somewhere in the first pages so the top isn't the same every time)
  async function askSearch(st, key, order) {
    if (st.cur[key] == null) st.cur[key] = Math.floor(Math.random() * 3);
    st.cur[key] = (st.cur[key] % 60) + 1;
    const r = await gifPage(`/gifs/search?order=${order}&count=40&page=${st.cur[key]}&type=g`);
    return r.list;
  }
  // fill the pool: five slots, given to the sources by the bandit
  async function refill(st) {
    algo.bootstrap({ liked, saved, history, following, niches, tagFollows });
    const w = {
      n: withFollows(algo.top("n:", 14), niches.map((n) => algo.key(n.id)), 3),
      t: withFollows(algo.top("t:", 24), tagFollows.map(algo.key), 3),
      u: algo.top("u:", 18, 1.5),
    };
    const have = { niche: w.n.length > 0, tag: w.t.length > 0, creator: w.u.length > 0, trend: true, fresh: true, explore: true };
    const arms = algo.pickArms(5, settings.explore, have);
    let err = null;
    const now = Date.now();
    const lists = await Promise.all(arms.map((a) => ask[a](st, w).then((l) => l.map((g) => Object.assign(g, { _src: a, __at: now }))).catch((e) => { err = e; return []; })));
    const ns = nopeSet(), inPool = new Set(st.pool.map((g) => g.id));
    let got = 0;
    lists.flat().forEach((g) => {
      if (inPool.has(g.id) || !eligible(g, ns)) return;
      inPool.add(g.id);
      st.pool.push(g);
      got++;
    });
    if (!got && !st.pool.length && err) throw err; // (RedGifs slowing down or offline: say so – don't end your feed)
    return got;
  }
  const smart = async () => {
    const st = (S.sm = S.sm || { pool: [], cur: {}, uni: null });
    S.np = S.np || {}; S.tp = S.tp || {}; S.cp = S.cp || {};
    const ns = nopeSet(), now = Date.now();
    st.pool = st.pool.filter((g) => now - g.__at < 20 * 60e3 && eligible(g, ns));
    if (st.pool.length < 45) await refill(st);
    S.done = false; // (a source ending doesn't end your feed)
    const batch = algo.sequence(st.pool, 10, S.items.slice(-8), { explore: LEVEL[settings.explore] || 0.2 });
    st.pool.sort((a, b) => (b.__b ? b.__b.s : 0) - (a.__b ? a.__b.s : 0));
    if (st.pool.length > 150) st.pool.length = 150;
    return batch;
  };

  const LOAD = {
    foryou: async () => {
      const o = orderOf(spec);
      if (o === "foryou" && settings.algo) return smart();
      // "My niches": only what you follow – the niches (and #tags), a few at a time, mixed; ends when all are through
      if (o === "mine") {
        S.np = S.np || {};
        S.tp = S.tp || {};
        const pool = [...niches.map((n) => ({ n: n.id })), ...tagFollows.map((tg) => ({ tg }))].filter((c) => !(c.n ? S.np[c.n] : S.tp[c.tg])?.done);
        if (!pool.length) { S.done = true; return []; }
        const take = pool.sort(() => Math.random() - 0.5).slice(0, 3);
        let err = null;
        const lists = (await Promise.all(take.map((c) => (c.n ? nichePage((S.np[c.n] = S.np[c.n] || { page: 0 }), c.n, "hot") : tagPage((S.tp[c.tg] = S.tp[c.tg] || { page: 0 }), c.tg)).catch((e) => { err = e; return null; })))).filter(Boolean);
        if (!lists.length && err) throw err; // (RedGifs slowing down or offline: say so – don't end your feed)
        const out = [];
        while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift());
        return out;
      }
      const mix = o === "foryou" ? taste() : [];
      const tf = o === "foryou" ? tagFollows.slice() : [];
      if (!mix.length && !tf.length) return search(o === "foryou" ? "trending" : o);
      // a page of what's trending, mixed with two pages of the niches you like (weighted, at random) and two of the #tags you follow
      S.np = S.np || {};
      S.tp = S.tp || {};
      const total = mix.reduce((a, [, w]) => a + w, 0);
      const pick = () => { let r = Math.random() * total; for (const [id, w] of mix) if ((r -= w) <= 0) return id; return mix[0][0]; };
      const picks = mix.length ? [...new Set([pick(), pick(), pick()])].filter((id) => !(S.np[id] && S.np[id].done)).slice(0, 2) : [];
      const tpicks = tf.sort(() => Math.random() - 0.5).filter((tg) => !(S.tp[tg] && S.tp[tg].done)).slice(0, 2);
      const lists = await Promise.all([
        search("trending").catch(() => []),
        ...picks.map((id) => nichePage((S.np[id] = S.np[id] || { page: 0 }), id, "hot").catch(() => [])),
        ...tpicks.map((tg) => tagPage((S.tp[tg] = S.tp[tg] || { page: 0 }), tg).catch(() => [])),
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
      const r = await gifPage(`/users/${enc(spec.name)}/search?order=${orderOf(spec)}&count=40&page=${++S.page}${spec.tag ? "&tags=" + enc(spec.tag) : ""}`);
      if (r.last || S.page >= Math.min(S.pages, 250)) S.done = true;
      return r.list;
    },
    // newest first across everyone you follow: a few videos per creator are kept ready, the newest one goes next
    following: async () => {
      if (!S.fx) S.fx = [...following.map((f) => ({ name: f.name, page: 0, buf: [], done: false })), ...(settings.followTags ? tagFollows : []).map((tg) => ({ tag: tg, page: 0, buf: [], done: false }))];
      if (!S.fx.length) { S.done = true; return []; }
      const out = [];
      while (out.length < 24) {
        const need = S.fx.filter((c) => !c.done && !c.buf.length);
        await inPool(need, 6, async (c) => {
          try {
            const d = await rg(c.tag ? `/gifs/search?tags=${enc(c.tag)}&order=latest&count=20&page=${++c.page}&type=g` : `/users/${enc(c.name)}/search?order=recent&count=20&page=${++c.page}`);
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
    if (spec.t === "list") return true;
    // scenes you marked for deletion stay out of My Stash (the tag's own page still shows them)
    if (spec.t === "stash") return spec.tag || !nopeSet().has(g.id);
    if (spec.t !== "user" && isHidden(g.user)) return false;
    if (spec.t !== "user" && nopeSet().has(g.id)) return false;
    if (spec.t !== "user" && hasBlocked(g)) return false;
    if (settings.skipSeen && seen.has(g.id) && (spec.t === "foryou" || (settings.skipSeenMore && ["following", "search", "niche"].includes(spec.t)))) return false;
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

// ---------- My Stash: mark a scene for deletion, delete it ----------
export const DELETE_TAG = "RedTok: delete";
export async function stashMark(g) {
  let id = ((await gql("query($n: String!) { findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }) { tags { id } } }", { n: DELETE_TAG })).findTags.tags[0] || {}).id;
  if (!id) id = (await gql("mutation($n: String!) { tagCreate(input: { name: $n }) { id } }", { n: DELETE_TAG })).tagCreate.id;
  await gql("mutation($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }", { i: { ids: [String(g.sceneId)], tag_ids: { ids: [String(id)], mode: "ADD" } } });
  setNope(g.id, true);
  return id;
}
export async function stashDelete(g, withFile) {
  await gql("mutation($i: SceneDestroyInput!) { sceneDestroy(input: $i) }", { i: { id: String(g.sceneId), delete_file: !!withFile, delete_generated: true } });
  setNope(g.id, true);
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
let syncTimer = 0;
setAfterSet((k) => {
  clearTimeout(bkTimer); bkTimer = setTimeout(bkSave, 6000);
  if (!syncOn()) return;
  touch(k);
  clearTimeout(syncTimer); syncTimer = setTimeout(() => push().catch(() => {}), 2500);
});
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
