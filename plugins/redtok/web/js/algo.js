// RedTok – the For You algorithm. Everything runs in this browser; nothing leaves it.
//
// 1. PROFILE  What you do teaches a profile of "features": #tags (t:), niches (n:), creators (u:) and the shape of a video
//             (o: tall/wide, d: short/medium/long). Every feature has a weight that fades with a half-life of a month, so
//             the profile follows your mood. Signals: watching to the end / twice (+), skipping at once (−), like, save, follow,
//             "not interested" (strong −). Likes and follows count far more than a view.
// 2. SOURCES  For You asks several sources for candidates: your niches, your #tags, creators you like, trending, new, and
//             "explore" (niches and tags next to your taste that you haven't seen). How many slots each source gets is decided
//             by a bandit (Thompson sampling): sources whose videos you keep watching get more, the ones you skip fewer.
// 3. RANKING  Each candidate gets a score: how much you like its tags/niches/creator, the shape, quality (likes ÷ views),
//             freshness, a bonus for unknown topics, minus a penalty for repeating the same creator or tag. The next videos are
//             then drawn one by one (softmax), so the order isn't a hard top list and always has some variety.
// This file has no network and no page code – data.js asks the sources, feed.js reports what you watch.

import { store } from "./core.js";

const HALF = 30 * 864e5; // an interest loses half of its weight in a month
const MAXF = 800; // features kept
const day = 864e5;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sq = (x) => 3 * Math.tanh(x / 3.5); // weights squeezed to ±3, so one huge habit can't swallow everything
const k1 = (s) => String(s || "").replace(/^#/, "").replace(/\s+/g, "").toLowerCase();
export const key = k1;

// ---------- the profile ----------
let P = (() => {
  const p = store.get("profile", null);
  return p && p.v === 1 && p.f ? p : { v: 1, f: {}, arms: {}, nm: {}, boot: 0, n: 0, at: 0 };
})();
let dirty = 0;
const save = () => {
  clearTimeout(dirty);
  dirty = setTimeout(() => {
    dirty = 0;
    const ks = Object.keys(P.f);
    if (ks.length > MAXF) {
      ks.map((k) => [k, Math.abs(eff(k))]).sort((a, b) => a[1] - b[1]).slice(0, ks.length - MAXF + 80).forEach(([k]) => { delete P.f[k]; if (P.nm) delete P.nm[k]; });
    }
    store.set("profile", P);
  }, 4000);
};
addEventListener("pagehide", () => { if (dirty) { clearTimeout(dirty); dirty = 0; store.set("profile", P); } });

const decay = (e, now = Date.now()) => Math.pow(0.5, (now - e[1]) / HALF);
export function eff(key) {
  const e = P.f[key];
  return e ? e[0] * decay(e) : 0;
}
export const known = (key) => !!P.f[key];
function add(key, d) {
  if (!key || !d) return;
  const now = Date.now();
  const e = P.f[key];
  P.f[key] = [clamp((e ? e[0] * decay(e, now) : 0) + d, -14, 30), now, (e ? e[2] : 0) + 1];
  P.at = now;
  save();
}
export const addFeature = add;
export function forget(key) {
  if (P.f[key]) { delete P.f[key]; if (P.nm) delete P.nm[key]; save(); }
}
// the name as RedGifs writes it (keys are lower case without spaces)
export const nameOf = (key) => (P.nm && P.nm[key]) || key.slice(2);
export function reset() {
  P = { v: 1, f: {}, arms: {}, nm: {}, boot: 0, n: 0, at: Date.now() };
  dirty = 0;
  store.set("profile", P);
}
export const size = () => Object.keys(P.f).length;
export const isEmpty = () => !Object.keys(P.f).some((k) => Math.abs(eff(k)) > 0.3);

// what the features of a video are
const tagsOf = (g) => [...new Set((g.tags || []).map(k1).filter(Boolean))].slice(0, 10);
const nichesOf = (g) => [...new Set((g.niches || []).map(k1).filter(Boolean))].slice(0, 12);
const shapeOf = (g) => {
  const out = [];
  if (g.w && g.h) out.push("o:" + (g.w >= g.h * 1.2 ? "wide" : g.h >= g.w * 1.2 ? "tall" : "sq"));
  if (g.dur) out.push("d:" + (g.dur < 8 ? "s" : g.dur < 25 ? "m" : "l"));
  return out;
};

// teach the profile: d is the strength (a like is about 3, a skip −0.6); it is shared between the video's tags and niches
export function signal(g, d, o = {}) {
  if (!g || g.stash || !d) return;
  const tg = tagsOf(g), ni = nichesOf(g);
  const share = 1 / Math.sqrt(Math.max(1, tg.length + ni.length));
  const raw = new Map();
  (g.tags || []).forEach((x) => raw.set(k1(x), String(x).replace(/^#/, "").trim()));
  tg.forEach((x) => {
    add("t:" + x, d * share);
    if (raw.get(x) && raw.get(x) !== x) (P.nm = P.nm || {})["t:" + x] = raw.get(x);
  });
  ni.forEach((x) => add("n:" + x, d * share * 1.3));
  if (g.user && !o.noUser) add("u:" + k1(g.user), d * (o.user != null ? o.user : 0.8));
  shapeOf(g).forEach((x) => add(x, d * 0.18));
  P.n++;
}

// how a view went: seconds really played against the length
export function judge(g, played, neg) {
  const dur = g.dur || 8;
  const r = clamp(played / dur, 0, 6);
  let d;
  if (played < Math.min(1.6, dur * 0.4)) d = neg ? -0.6 : 0; // gone at once
  else if (r >= 3) d = 1.3;
  else if (r >= 1.6) d = 0.9;
  else if (r >= 0.85) d = 0.5;
  else if (r >= 0.5) d = 0.2;
  else if (played >= 6) d = 0.25; // a long video, watched for a while
  else d = neg ? -0.2 : 0.05;
  return d;
}
// a finished view: learn from it and tell the source whether it paid off
export function view(g, played, neg) {
  if (!g || g.stash) return;
  const d = judge(g, played, neg);
  if (d) signal(g, d);
  reward(g._src, d > 0.15 ? true : d < 0 ? false : null);
}

// the profile of someone who already has likes, follows, saves … (first start of this version)
export function bootstrap(data) {
  if (P.boot) return;
  P.boot = 1;
  (data.liked || []).slice(-300).forEach((g) => signal(g, 2.5));
  (data.saved || []).slice(0, 300).forEach((g) => signal(g, 2.5));
  (data.history || []).slice(0, 200).forEach((g) => signal(g, 0.2));
  (data.following || []).forEach((f) => add("u:" + k1(f.name), 4));
  (data.niches || []).forEach((n) => add("n:" + k1(n.id), 5));
  (data.tagFollows || []).forEach((x) => add("t:" + k1(x), 5));
  save();
}

// ---------- sources and the bandit ----------
export const ARMS = ["niche", "tag", "creator", "trend", "fresh", "explore"];
const PRIOR = { niche: [4, 2], tag: [3, 2], creator: [3, 2], trend: [2, 3], fresh: [1.5, 3], explore: [1.5, 3] };
function reward(src, ok) {
  if (!src || ok == null || !PRIOR[src]) return;
  const a = (P.arms[src] = P.arms[src] || [0, 0]);
  a[ok ? 0 : 1]++;
  if (a[0] + a[1] > 80) { a[0] *= 0.85; a[1] *= 0.85; } // old results count less
  save();
}
export const rewardArm = reward;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
// a draw from Beta(a, b) (normal approximation – plenty for choosing between a few sources)
function beta(a, b) {
  const m = a / (a + b), sd = Math.sqrt((a * b) / ((a + b) * (a + b) * (a + b + 1)));
  return clamp(m + sd * gauss(), 0.001, 0.999);
}
// which sources get the next `slots` fetches. have = sources that have something to ask (a niche you like …)
export function pickArms(slots, explore, have) {
  const out = [];
  const lvl = explore === "high" ? 1.45 : explore === "low" ? 0.6 : 1;
  for (let i = 0; i < slots; i++) {
    let best = null, bs = -1;
    for (const a of ARMS) {
      if (!have[a]) continue;
      const [pa, pb] = PRIOR[a], r = P.arms[a] || [0, 0];
      let s = beta(pa + r[0], pb + r[1]);
      if (a === "explore") s *= lvl;
      if (out.filter((x) => x === a).length >= (a === "explore" ? 2 : 3)) s *= 0.5; // (not all slots for one source)
      if (s > bs) { bs = s; best = a; }
    }
    if (best) out.push(best);
  }
  // the sources that don't come from your taste never starve: at least one of them in every round (explore half of the time)
  if (out.length && !out.some((a) => a === "trend" || a === "fresh" || a === "explore")) {
    out[out.length - 1] = have.explore && Math.random() < 0.3 + 0.4 * lvl ? "explore" : Math.random() < 0.65 ? "trend" : "fresh";
  } else if (have.explore && !out.includes("explore") && Math.random() < 0.25 * lvl) out[out.length - 1] = "explore";
  return out;
}
export const armStats = () => ARMS.map((a) => [a, (P.arms[a] || [0, 0])[0], (P.arms[a] || [0, 0])[1]]);

// the strongest likes of a kind, for the sources to ask for: [[name, weight]]
export function top(prefix, n, min = 0.8) {
  return Object.keys(P.f).filter((k) => k.startsWith(prefix)).map((k) => [k.slice(prefix.length), eff(k)]).filter(([, w]) => w >= min).sort((a, b) => b[1] - a[1]).slice(0, n);
}
export function worst(prefix, n, max = -1.2) {
  return Object.keys(P.f).filter((k) => k.startsWith(prefix)).map((k) => [k.slice(prefix.length), eff(k)]).filter(([, w]) => w <= max).sort((a, b) => a[1] - b[1]).slice(0, n);
}
// weighted draw from [[name, weight]]
export function draw(list, n = 1) {
  const l = list.slice(), out = [];
  while (out.length < n && l.length) {
    let r = Math.random() * l.reduce((a, [, w]) => a + w, 0), i = 0;
    for (; i < l.length - 1; i++) if ((r -= l[i][1]) <= 0) break;
    out.push(l.splice(i, 1)[0][0]);
  }
  return out;
}

// ---------- ranking ----------
// score without the "just saw something like it" part (that depends on what is already chosen)
function base(g, o) {
  const aff = [];
  tagsOf(g).forEach((x) => { const w = eff("t:" + x); aff.push([sq(w), "t", x, w !== 0 || known("t:" + x)]); });
  nichesOf(g).forEach((x) => { const w = eff("n:" + x) * 1.2; aff.push([sq(w), "n", x, w !== 0 || known("n:" + x)]); });
  const pos = aff.filter((a) => a[0] > 0).sort((a, b) => b[0] - a[0]);
  let content = pos.slice(0, 3).reduce((s, a, i) => s + a[0] * [1, 0.55, 0.3][i], 0);
  const neg = clamp(aff.filter((a) => a[0] < 0).reduce((s, a) => s + a[0], 0), -6, 0);
  content += neg * 1.2;
  const cr = sq(eff("u:" + k1(g.user))) * 0.9;
  const fmt = shapeOf(g).reduce((s, k) => s + sq(eff(k)) * 0.25, 0);
  // quality: likes, and likes per view (a video with few views but many likes is a find)
  const likes = g.likes || 0, views = g.views || 0;
  const q = 0.42 * Math.log10(2 + likes) + (views >= 100 ? 3 * Math.min(0.12, likes / views) : 0);
  // freshness: a week-old video is still new, a year-old one gets nothing
  const age = g.date ? (Date.now() / 1000 - g.date) / 86400 : 90;
  const fresh = 0.6 * Math.exp(-Math.max(0, age) / 21);
  // topics you've never been near: a bit of curiosity
  const unk = aff.length ? aff.filter((a) => !a[3]).length / aff.length : 0.5;
  const curious = (o.explore || 0.2) * unk * 2;
  // the reason shown in "Why you see this": the biggest single push
  let why = null, wv = 0.9;
  if (cr > wv) { why = ["u", g.user]; wv = cr; }
  if (pos[0] && pos[0][0] > wv) why = [pos[0][1], pos[0][2]];
  if (!why) why = [g._src === "explore" ? "x" : g._src === "fresh" ? "f" : g._src === "trend" ? "r" : "p", ""];
  return { s: content + cr + fmt + q + fresh + curious, why };
}

// the chosen order: one video at a time, softmax over the scores with the repeat penalties of what's already out
export function sequence(pool, n, recent, o = {}) {
  const out = [];
  pool.forEach((c) => { c.__b = base(c, o); });
  const T = 0.75 + 2 * (o.explore || 0.2);
  while (out.length < n && pool.length) {
    const hist = recent.concat(out).slice(-8);
    // every so often (the "try new things" setting) the choice is only among videos that don't come from your taste –
    // otherwise a strong taste would close the circle and you'd never see anything else
    const open = Math.random() < (o.explore || 0.2) ? pool.map((c, k) => k).filter((k) => ["explore", "trend", "fresh"].includes(pool[k]._src)) : [];
    const idx = open.length ? open : pool.map((c, k) => k);
    const sc = idx.map((k) => pool[k].__b.s - repeat(pool[k], hist));
    const mx = Math.max(...sc);
    const w = sc.map((s) => Math.exp((s - mx) / T));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
    for (; i < w.length - 1; i++) if ((r -= w[i]) <= 0) break;
    const [c] = pool.splice(idx[i], 1);
    c.why = c.__b.why;
    delete c.__b;
    out.push(c);
  }
  return out;
}
function repeat(c, hist) {
  let p = 0;
  const u = k1(c.user);
  hist.forEach((h, i) => { if (k1(h.user) === u) p += i === hist.length - 1 ? 7 : 2.4; });
  // the same topic over and over
  const mine = new Set([...tagsOf(c), ...nichesOf(c)]);
  if (mine.size) {
    const cnt = new Map();
    hist.slice(-6).forEach((h) => new Set([...tagsOf(h), ...nichesOf(h)]).forEach((x) => mine.has(x) && cnt.set(x, (cnt.get(x) || 0) + 1)));
    const m = Math.max(0, ...cnt.values());
    if (m >= 3) p += 0.8 * (m - 2);
  }
  return p;
}
