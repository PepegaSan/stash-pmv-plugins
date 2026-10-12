// RedTok – the pages around the feed: grids of videos (profiles, niches, search, your likes …), lists, settings and
// the sheets that open from a video (share/options, details).

import { $, esc, t, tn, fmt, ago, mmss, ic, toast, nav, on, modal, pushLayer, closeLayer, closeLayers, copyText, hasHover, isPhone, store, LANGS, VERSION, img } from "./core.js";
import {
  settings, saveSettings, makeSource, listSource, ORDERS, orderOf, rg, takeUsers, userOf, userPic, users,
  liked, following, niches, hidden, nope, history, saved, doneSet, isFollowing, setFollow, followsNiche, setNiche, isHidden, setHidden, setNope,
  unlikeMany, clearHistory, removeFromHistory, forgetDownloads, exportData, importData, stashPerformer, usingBackend,
} from "./data.js";
import { av, tick, setSpeed, setAutoNext, setFit, setMuted } from "./feed.js";
import { enqueue, jobs, jobOf, isSaved, cancelQueued, retryFailed, clearFinished, activeJobs, ensureBase } from "./dl.js";
import { call } from "./core.js";

const enc = encodeURIComponent;
export const nicheName = (slug) => String(slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const ORDER_LABEL = (o) => t(o);

// ---------- a page: header (back, title, buttons) and a scrolling body ----------
export function pageShell(el, title, o = {}) {
  el.classList.add("page");
  el.innerHTML = `<header class="ph">${o.back !== false ? `<button class="ph-b" data-back aria-label="${esc(t("Back"))}">${ic("back")}</button>` : '<span class="ph-gap"></span>'}<h2>${title}</h2><div class="ph-r">${o.right || ""}</div></header><div class="pbody"></div>`;
  return { el, body: el.querySelector(".pbody"), head: el.querySelector(".ph") };
}
export function openPage(title, o = {}) {
  const el = document.createElement("div");
  const p = pageShell(el, title, o);
  const cleanups = [];
  p.cleanup = (fn) => cleanups.push(fn);
  p.L = pushLayer(el, { kind: "page", onClose: () => cleanups.forEach((f) => { try { f(); } catch (e) { console.error(e); } }) });
  p.close = () => closeLayer(p.L);
  el.querySelector("[data-back]")?.addEventListener("click", p.close);
  return p;
}
// tabs with a line under the chosen one (TikTok's profile tabs)
export function tabsHtml(list, active) {
  return `<div class="ptabs" role="tablist">${list.map((x) => `<button class="ptab${x.id === active ? " is-on" : ""}" data-tab="${esc(x.id)}" role="tab" aria-selected="${x.id === active}">${x.icon ? ic(x.icon) : ""}<span>${esc(x.label)}</span></button>`).join("")}</div>`;
}

// ---------- a grid of videos ----------
export function mountGrid(box, S0, o = {}) {
  let S = S0;
  const st = { sel: new Set(), select: false, last: -1 };
  const canSelect = o.selectable !== false;
  const sortChips = () => (o.sorts ? o.sorts.map(([v, l]) => `<button class="chipb${orderOf(S.spec) === v ? " is-on" : ""}" data-sort="${esc(v)}">${esc(ORDER_LABEL(l))}</button>`).join("") : "");
  box.innerHTML = `${o.sorts || canSelect || o.extra ? `<div class="gbar">${sortChips()}<span class="sp"></span>${o.extra || ""}${canSelect ? `<button class="chipb" data-gsel>${ic("select")}<span>${esc(t("Select"))}</span></button>` : ""}</div>` : ""}<div class="grid${o.cls ? " " + o.cls : ""}"></div><div class="gend"></div>`;
  const grid = box.querySelector(".grid"), end = box.querySelector(".gend");
  const bar = document.createElement("div");
  bar.className = "selbar";
  bar.hidden = true;
  (o.barHost || box).appendChild(bar);
  const tile = (g, i) => `<button class="tile${st.sel.has(g.id) ? " is-sel" : ""}" data-i="${i}">${img(g.thumb || g.poster, "", ' loading="lazy"')}<span class="tick">${ic("check")}</span>${!g.stash && isSaved(g.id) ? `<span class="badge">${ic("down")}</span>` : ""}<span class="views">${ic("play")}${fmt(g.views)}</span>${g.dur ? `<span class="dur">${mmss(g.dur)}</span>` : ""}</button>`;
  const paintEnd = () => {
    if (S.error && !S.busy) end.innerHTML = `<button class="btn" data-gretry>${ic("refresh")}${esc(t("Try again"))}</button><small>${esc(S.error.message || S.error)}</small>`;
    else if (S.done && !S.items.length) { const e = o.empty || {}; end.innerHTML = `<div class="gempty">${ic(e.icon || "grid")}<b>${esc(e.title || t("No videos yet"))}</b>${e.text ? `<span>${esc(e.text)}</span>` : ""}</div>`; }
    else end.innerHTML = S.done ? "" : '<div class="spin"></div>';
  };
  const onItems = (list, from) => {
    if (list.length) grid.insertAdjacentHTML("beforeend", list.map((g, k) => tile(g, from + k)).join(""));
    paintEnd();
    o.onCount && o.onCount(S);
  };
  const near = () => {
    const root = o.root || box.closest(".pbody");
    if (!root || !box.isConnected) return false;
    return end.getBoundingClientRect().top < root.getBoundingClientRect().bottom + 900;
  };
  async function more() {
    if (S.done || S.busy || !box.isConnected) return;
    const mine = S;
    paintEnd();
    try { await S.more(); } catch (e) { /* shown by paintEnd */ }
    if (mine !== S) return;
    paintEnd();
    if (!S.done && !S.error && near()) setTimeout(more, 50);
  }
  const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && more(), { root: o.root || null, rootMargin: "900px" });
  io.observe(end);
  function attach(nS) {
    S.off(onItems);
    S = nS;
    st.sel.clear();
    grid.innerHTML = "";
    S.on(onItems);
    if (S.items.length) onItems(S.items, 0); else paintEnd();
    more();
    paintBar();
  }
  const refreshTile = (i) => { const el = grid.children[i]; if (el) el.classList.toggle("is-sel", st.sel.has(S.items[i].id)); };
  function paintBar() {
    bar.hidden = !st.select;
    box.classList.toggle("selecting", st.select);
    box.querySelector("[data-gsel]")?.classList.toggle("is-on", st.select);
    if (!st.select) return;
    const n = st.sel.size;
    const dlable = S.items.some((g) => st.sel.has(g.id) && !g.stash);
    bar.innerHTML = `<b>${esc(tn(n, "{n} selected", "{n} selected"))}</b><button class="chipb" data-s="all">${esc(t("Select all"))}</button>${n ? `<button class="chipb" data-s="none">${esc(t("Clear"))}</button>` : ""}${dlable || !n ? `<button class="btn is-red" data-s="dl"${n ? "" : " disabled"}>${ic("down")}${esc(t("Download"))}</button>` : ""}${o.remove ? `<button class="btn" data-s="rm"${n ? "" : " disabled"}>${ic("trash")}${esc(o.remove.label)}</button>` : ""}<button class="chipb" data-s="done" aria-label="${esc(t("Done"))}">${ic("close")}</button>`;
  }
  const click = async (e) => {
    const tl = e.target.closest(".tile");
    if (tl && box.contains(tl)) {
      const i = Number(tl.dataset.i);
      if (st.select) {
        if (e.shiftKey && st.last >= 0) {
          const [a, b] = [Math.min(st.last, i), Math.max(st.last, i)];
          for (let k = a; k <= b; k++) { st.sel.add(S.items[k].id); refreshTile(k); }
        } else {
          const id = S.items[i].id;
          st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id);
          refreshTile(i);
        }
        st.last = i;
        return paintBar();
      }
      return nav.openFeed(S, i, o.feedTitle || "");
    }
    const sb = e.target.closest("[data-sort]");
    if (sb && box.contains(sb)) {
      box.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("is-on", b === sb));
      return attach(o.makeS(sb.dataset.sort));
    }
    if (e.target.closest("[data-gsel]")) { st.select = !st.select; st.sel.clear(); grid.querySelectorAll(".is-sel").forEach((x) => x.classList.remove("is-sel")); return paintBar(); }
    if (e.target.closest("[data-gretry]")) { S.error = null; return more(); }
  };
  box.addEventListener("click", click);
  bar.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    const a = b.dataset.s;
    if (a === "all") { S.items.forEach((g) => st.sel.add(g.id)); S.items.forEach((_, i) => refreshTile(i)); }
    if (a === "none") { st.sel.clear(); S.items.forEach((_, i) => refreshTile(i)); }
    if (a === "done") { st.select = false; st.sel.clear(); grid.querySelectorAll(".is-sel").forEach((x) => x.classList.remove("is-sel")); }
    if (a === "dl") {
      const chosen = S.items.filter((g) => st.sel.has(g.id));
      if (!chosen.length) return;
      await enqueue(chosen);
      st.select = false;
      st.sel.clear();
      grid.querySelectorAll(".is-sel").forEach((x) => x.classList.remove("is-sel"));
    }
    if (a === "rm") {
      const ids = [...st.sel];
      if (!ids.length) return;
      o.remove.fn(ids);
      st.select = false;
      return attach(o.makeS ? o.makeS(orderOf(S.spec)) : S);
    }
    paintBar();
  });
  // hover: the video plays muted in its tile (mouse only)
  let hov = null, hovT = 0;
  const unhover = () => { clearTimeout(hovT); if (hov) { hov.v.pause(); hov.v.removeAttribute("src"); hov.v.remove(); hov = null; } };
  if (hasHover()) {
    grid.addEventListener("mouseover", (e) => {
      const tl = e.target.closest(".tile");
      if (!tl || (hov && hov.tl === tl)) return;
      unhover();
      hovT = setTimeout(() => {
        const g = S.items[Number(tl.dataset.i)];
        const src = g && (g.stash ? g.preview : g.sd);
        if (!src) return;
        const v = document.createElement("video");
        v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
        v.src = src;
        v.oncanplay = () => v.classList.add("on");
        tl.appendChild(v);
        hov = { tl, v };
      }, 260);
    });
    grid.addEventListener("mouseleave", unhover);
    grid.addEventListener("mouseout", (e) => { if (hov && !hov.tl.contains(e.relatedTarget)) unhover(); });
  }
  const offJob = on("job", ({ id }) => {
    const i = S.items.findIndex((g) => g.id === id);
    const el = grid.children[i];
    if (el && isSaved(id) && !el.querySelector(".badge")) el.insertAdjacentHTML("beforeend", `<span class="badge">${ic("down")}</span>`);
  });
  S.on(onItems);
  if (S.items.length) onItems(S.items, 0); else paintEnd();
  more();
  return {
    get S() { return S; },
    attach,
    destroy() { S.off(onItems); io.disconnect(); unhover(); bar.remove(); offJob(); },
  };
}

// a page with tabs that each mount something (a grid, a list …) – only the visible one lives
function tabbed(p, host, list, active, mountTab) {
  let cur = null, curId = active;
  host.insertAdjacentHTML("beforeend", tabsHtml(list, active) + '<div class="tabbox"></div>');
  const box = host.querySelector(".tabbox");
  const show = (id) => {
    curId = id;
    if (cur && cur.destroy) cur.destroy();
    box.innerHTML = "";
    host.querySelectorAll(".ptab").forEach((b) => { b.classList.toggle("is-on", b.dataset.tab === id); b.setAttribute("aria-selected", b.dataset.tab === id); });
    cur = mountTab(id, box) || null;
  };
  host.querySelector(".ptabs").addEventListener("click", (e) => { const b = e.target.closest(".ptab"); if (b && b.dataset.tab !== curId) show(b.dataset.tab); });
  show(active);
  p && p.cleanup && p.cleanup(() => cur && cur.destroy && cur.destroy());
  return { show, get id() { return curId; }, reload: () => show(curId), destroy: () => cur && cur.destroy && cur.destroy() };
}

// ---------- a creator ----------
export function openProfile(name) {
  const p = openPage(`@${esc(name)}`, { right: `<button class="ph-b" data-pmore aria-label="${esc(t("More options"))}">${ic("more")}</button>` });
  p.body.innerHTML = `<div class="phead is-center" data-user="${esc(String(name).toLowerCase())}"></div><div class="gbox"></div>`;
  const head = p.body.querySelector(".phead");
  let S = makeSource({ t: "user", name, order: "recent" });
  const paint = () => {
    const u = userOf(name) || {};
    const total = S.total != null ? S.total : u.gifs;
    const fol = isFollowing(name), hid = isHidden(name);
    head.innerHTML = `${av(u.profileImageUrl || userPic(name), name, "av-xl")}
      <h1>@${esc(name)}${u.verified ? tick() : ""}</h1>${u.name && u.name !== name ? `<div class="pname">${esc(u.name)}</div>` : ""}
      <div class="stats">${u.followers != null ? `<span><b>${fmt(u.followers)}</b>${esc(t("Followers"))}</span>` : ""}${total != null ? `<span><b>${fmt(total)}</b>${esc(t("Videos"))}</span>` : ""}${u.views != null ? `<span><b>${fmt(u.views)}</b>${esc(t("Views"))}</span>` : ""}</div>
      ${hid ? `<div class="hidnote">${ic("eyeoff")}${esc(t("You hid this creator – their videos don't show up in your feeds."))} <button class="chipb" data-unhide>${esc(t("Show again"))}</button></div>` : ""}
      <div class="pbtns"><button class="btn ${fol ? "" : "is-red"} is-wide" data-pf>${esc(fol ? t("Following") : t("Follow"))}</button><button class="btn" data-pall title="${esc(t("Download videos of this creator"))}">${ic("down")}<span>${esc(t("Download"))}</span></button><button class="btn is-icon" data-pplay aria-label="${esc(t("Play"))}">${ic("play")}</button></div>
      ${u.description ? `<p class="bio">${esc(u.description)}</p>` : ""}`;
  };
  paint();
  const grid = mountGrid(p.body.querySelector(".gbox"), S, { root: p.body, barHost: p.el, sorts: ORDERS.user, makeS: (o) => (S = makeSource({ t: "user", name, order: o })), feedTitle: "@" + name, onCount: paint, empty: { title: t("No videos"), icon: "film" } });
  p.cleanup(() => grid.destroy());
  p.cleanup(on("follow", ({ name: n }) => String(n).toLowerCase() === String(name).toLowerCase() && paint()));
  p.cleanup(on("hidden", paint));
  p.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-pf]")) {
      const now = setFollow(name, !isFollowing(name));
      return toast(now ? t("Following @{u}", { u: name }) : t("Unfollowed @{u}", { u: name }));
    }
    if (e.target.closest("[data-pall]")) return downloadProfile(name);
    if (e.target.closest("[data-pplay]")) return grid.S.items.length && nav.openFeed(grid.S, 0, "@" + name);
    if (e.target.closest("[data-unhide]")) { setHidden(name, false); return toast(t("@{u} shows up again", { u: name })); }
    if (e.target.closest("[data-pmore]")) return actionSheet([
      { icon: "copy", label: t("Copy link"), fn: () => copyText(`https://www.redgifs.com/users/${name}`) },
      { icon: "open", label: t("Open on RedGifs"), fn: () => window.open(`https://www.redgifs.com/users/${enc(name)}`, "_blank", "noopener,noreferrer") },
      isHidden(name) ? { icon: "eyeoff", label: t("Show this creator again"), fn: () => setHidden(name, false) }
        : { icon: "block", label: t("Hide this creator"), bad: true, fn: () => { setHidden(name, true); toast(t("You won't see @{u} any more", { u: name }), false, { label: t("Undo"), fn: () => setHidden(name, false) }); } },
    ]);
  });
}

// a short list of actions from the bottom
export function actionSheet(items, title) {
  modal(`${title ? `<h3>${esc(title)}</h3>` : ""}<div class="alist">${items.filter(Boolean).map((x, i) => `<button class="arow${x.bad ? " is-bad" : ""}" data-i="${i}">${ic(x.icon)}<span>${esc(x.label)}</span></button>`).join("")}</div><button class="btn is-ghost is-full" data-close>${esc(t("Cancel"))}</button>`, (m, close) => {
    const list = items.filter(Boolean);
    m.addEventListener("click", (e) => { const b = e.target.closest(".arow"); if (b) { close(); list[Number(b.dataset.i)].fn(); } });
  }, { bottom: true });
}

// ---------- a niche ----------
export function openNiche(id, label) {
  const p = openPage(`#${esc(label || nicheName(id))}`);
  p.body.innerHTML = `<div class="phead"></div><div class="gbox"></div>`;
  const head = p.body.querySelector(".phead");
  let info = { id, name: label || nicheName(id) };
  let S = makeSource({ t: "niche", slug: id, order: "hot" });
  const paint = () => {
    const f = followsNiche(id);
    const pic = info.thumbnail || info.cover || "";
    head.innerHTML = `<span class="nthumb">${pic ? img(pic) : ic("tag")}</span>
      <div class="pinfo"><h1>#${esc(info.name)}</h1><div class="stats">${(info.gifs ?? S.total) != null ? `<span><b>${fmt(info.gifs ?? S.total)}</b>${esc(t("Videos"))}</span>` : ""}${info.subscribers != null ? `<span><b>${fmt(info.subscribers)}</b>${esc(t("Followers"))}</span>` : ""}</div>
      ${info.description ? `<p class="bio">${esc(info.description)}</p>` : ""}
      <div class="pbtns"><button class="btn ${f ? "" : "is-red"}" data-nf>${ic(f ? "check" : "plus")}${esc(f ? t("Following") : t("Follow niche"))}</button><button class="btn" data-nplay>${ic("play")}${esc(t("Play"))}</button></div></div>`;
  };
  paint();
  rg(`/niches/${enc(id)}`).then((d) => { const n = (d && (d.niche || d)) || {}; if (n.name || n.id) { info = Object.assign(info, n); paint(); } }).catch(() => {});
  const grid = mountGrid(p.body.querySelector(".gbox"), S, { root: p.body, barHost: p.el, sorts: ORDERS.niche, makeS: (o) => (S = makeSource({ t: "niche", slug: id, order: o })), feedTitle: "#" + info.name, onCount: paint });
  p.cleanup(() => grid.destroy());
  p.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-nf]")) {
      const now = setNiche({ id, name: info.name, img: info.thumbnail || "" }, !followsNiche(id));
      paint();
      return toast(now ? t("For You will show more of #{n}", { n: info.name }) : t("Unfollowed #{n}", { n: info.name }));
    }
    if (e.target.closest("[data-nplay]")) return grid.S.items.length && nav.openFeed(grid.S, 0, "#" + info.name);
  });
}
const nicheTile = (x) => {
  const id = x.id || x.name;
  const pic = x.thumbnail || x.img || "";
  return `<button class="ntile" data-n="${esc(id)}" data-q="${esc(x.name || nicheName(id))}">${img(pic, "", ' loading="lazy"')}<b>${esc(x.name || nicheName(id))}</b><small>${x.gifs != null ? esc(tn(x.gifs, "{n} video", "{n} videos")) : ""}</small></button>`;
};

// all niches, with a filter
export function openNicheBrowser() {
  const p = openPage(esc(t("Niches")));
  const st = { page: 0, pages: 1, order: "subscribers", q: "", busy: false, seq: 0 };
  p.body.innerHTML = `<div class="wrap"><div class="gbar is-sticky"><label class="searchbox">${ic("search")}<input type="search" placeholder="${esc(t("Filter niches"))}" data-q autocomplete="off"></label></div>
    <div class="gbar">${[["subscribers", "Popular"], ["posts", "Most videos"], ["alphabetical_asc", "A–Z"]].map(([v, l]) => `<button class="chipb${v === st.order ? " is-on" : ""}" data-o="${v}">${esc(t(l))}</button>`).join("")}</div>
    <div class="ngrid" data-grid></div><div class="gend" data-end></div></div>`;
  const grid = p.body.querySelector("[data-grid]"), end = p.body.querySelector("[data-end]");
  const load = async (fresh) => {
    if (fresh) { st.page = 0; st.pages = 1; st.seq++; grid.innerHTML = ""; st.busy = false; }
    if (st.busy || st.page >= st.pages) { if (st.page >= st.pages) end.innerHTML = ""; return; }
    st.busy = true;
    const my = st.seq;
    end.innerHTML = '<div class="spin"></div>';
    try {
      const d = await rg(`/niches/search?query=${enc(st.q)}&order=${st.order}&count=40&page=${st.page + 1}`);
      if (my !== st.seq) return;
      st.page++;
      st.pages = d.pages || 1;
      grid.insertAdjacentHTML("beforeend", (d.niches || []).map(nicheTile).join(""));
      end.innerHTML = st.page === 1 && !(d.niches || []).length ? `<div class="gempty">${ic("tag")}<b>${esc(t("No niches found"))}</b></div>` : "";
    } catch (e) { end.innerHTML = `<button class="btn" data-retry>${ic("refresh")}${esc(t("Try again"))}</button><small>${esc(e.message || e)}</small>`; }
    finally { if (my === st.seq) st.busy = false; }
  };
  const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && load(), { root: p.body, rootMargin: "700px" });
  io.observe(end);
  p.cleanup(() => io.disconnect());
  let timer = 0;
  p.body.querySelector("[data-q]").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { st.q = e.target.value.trim(); load(true); }, 300); });
  p.body.addEventListener("click", (e) => {
    const o = e.target.closest("[data-o]");
    if (o) { st.order = o.dataset.o; p.body.querySelectorAll("[data-o]").forEach((b) => b.classList.toggle("is-on", b === o)); return load(true); }
    if (e.target.closest("[data-retry]")) return load();
    const n = e.target.closest(".ntile");
    if (n) openNiche(n.dataset.n, n.dataset.q);
  });
}

// ---------- search ----------
const recent = () => store.get("history", []).filter((x) => typeof x === "string");
const remember = (q) => store.set("history", [q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12));
export function openSearch(q0 = "", tab0 = "videos", exact0 = false) {
  const p = openPage("");
  p.head.querySelector("h2").outerHTML = `<form class="searchbox is-head" role="search">${ic("search")}<input type="search" enterkeyhint="search" placeholder="${esc(t("Search"))}" autocomplete="off" spellcheck="false" value="${esc(q0)}"><button type="submit" class="sb-go">${esc(t("Search"))}</button></form>`;
  const form = p.head.querySelector("form"), inp = form.querySelector("input");
  p.body.innerHTML = `<div class="sugg" data-sugg></div><div class="results" data-res hidden></div>`;
  const sugg = p.body.querySelector("[data-sugg]"), res = p.body.querySelector("[data-res]");
  let seq = 0, timer = 0, tabs = null, query = "";
  p.cleanup(() => tabs && tabs.destroy());
  const showStart = async () => {
    const h = recent();
    sugg.innerHTML = `${h.length ? `<div class="shead"><h3>${esc(t("Recent"))}</h3><button class="linkb" data-clearh>${esc(t("Clear all"))}</button></div>${h.map((x) => `<div class="srow"><button class="srow-main" data-q="${esc(x)}"><span class="sa">${ic("history")}</span><span>${esc(x)}</span></button><button class="srow-x" data-delh="${esc(x)}" aria-label="${esc(t("Remove"))}">${ic("close")}</button></div>`).join("")}` : ""}
      ${niches.length ? `<h3>${esc(t("Your niches"))}</h3><div class="chips">${niches.map((n) => `<button class="chipb" data-n="${esc(n.id)}" data-nq="${esc(n.name)}">#${esc(n.name)}</button>`).join("")}</div>` : ""}
      <h3>${esc(t("Popular niches"))}</h3><div class="ngrid" data-pop><div class="spin"></div></div><button class="btn is-full" data-allniches>${ic("tag")}${esc(t("Browse all niches"))}</button>`;
    try {
      const d = await rg("/niches/search?query=&order=subscribers&count=12&page=1");
      const box = sugg.querySelector("[data-pop]");
      if (box) box.innerHTML = (d.niches || []).map(nicheTile).join("");
    } catch (e) { const box = sugg.querySelector("[data-pop]"); if (box) box.innerHTML = ""; }
  };
  const suggest = async () => {
    const q = inp.value.trim();
    if (!q) return showStart();
    const my = ++seq;
    const top = `<button class="srow-main is-first" data-q="${esc(q)}"><span class="sa">${ic("search")}</span><span>${esc(t("Search “{q}”", { q }))}</span></button>`;
    sugg.innerHTML = top + '<div class="spin"></div>';
    const safe = (path) => rg(path).catch(() => null);
    const [cr, ni, sg] = await Promise.all([safe(`/creators/search?query=${enc(q)}&count=8`), safe(`/niches/search?query=${enc(q)}&order=best_match&count=12`), safe(`/search/suggest?query=${enc(q)}`)]);
    if (my !== seq) return;
    const creators = ((cr && cr.items) || []).slice(0, 6);
    creators.forEach((c) => { const n = c.username || c.name; if (n) users.set(String(n).toLowerCase(), Object.assign(userOf(n) || {}, c)); });
    const nl = ((ni && ni.niches) || []).slice(0, 12);
    const tags = (Array.isArray(sg) ? sg : []).map((x) => (typeof x === "string" ? x : x.text || x.name || "")).filter(Boolean).slice(0, 8);
    sugg.innerHTML = top + `${tags.map((x) => `<button class="srow-main" data-q="${esc(x)}" data-tag="1"><span class="sa">#</span><span>${esc(x)}</span></button>`).join("")}
      ${creators.length ? `<h3>${esc(t("Creators"))}</h3>${creators.map(userRow).join("")}` : ""}
      ${nl.length ? `<h3>${esc(t("Niches"))}</h3><div class="ngrid">${nl.map(nicheTile).join("")}</div>` : ""}`;
  };
  const results = (q, tab, exact) => {
    query = q;
    remember(q);
    inp.value = q;
    inp.blur();
    sugg.hidden = true;
    res.hidden = false;
    res.innerHTML = "";
    if (tabs) tabs.destroy();
    tabs = tabbed(p, res, [{ id: "videos", label: t("Videos") }, { id: "creators", label: t("Creators") }, { id: "niches", label: t("Niches") }, { id: "stash", label: t("My Stash") }], tab || "videos", (id, box) => {
      if (id === "videos") return mountGrid(box, makeSource({ t: "search", q, exact, order: "trending" }), { root: p.body, barHost: p.el, sorts: ORDERS.search, makeS: (o) => makeSource({ t: "search", q, exact, order: o }), feedTitle: exact ? "#" + q : q, empty: { icon: "search", title: t("No results"), text: t("Try another word.") } });
      if (id === "stash") return mountGrid(box, makeSource({ t: "stash", q, order: "random" }), { root: p.body, barHost: p.el, sorts: ORDERS.stash, makeS: (o) => makeSource({ t: "stash", q, order: o }), feedTitle: q, selectable: false, empty: { icon: "film", title: t("Nothing in your Stash"), text: t("No scene matches “{q}”.", { q }) } });
      if (id === "creators") return pagedList(box, p.body, (page) => `/creators/search?query=${enc(q)}&count=30&page=${page}`, (d) => d.items || [], userRow, t("No creators found"));
      if (id === "niches") return pagedList(box, p.body, (page) => `/niches/search?query=${enc(q)}&order=best_match&count=40&page=${page}`, (d) => d.niches || [], nicheTile, t("No niches found"), "ngrid");
    });
  };
  inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(suggest, 250); });
  inp.addEventListener("focus", () => { if (!res.hidden) { res.hidden = true; sugg.hidden = false; suggest(); } });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = inp.value.trim(); if (q) results(q, "videos"); });
  p.body.addEventListener("click", (e) => {
    const x = e.target.closest("[data-delh]");
    if (x) { store.set("history", recent().filter((h) => h !== x.dataset.delh)); return showStart(); }
    if (e.target.closest("[data-clearh]")) { store.set("history", []); return showStart(); }
    if (e.target.closest("[data-allniches]")) return openNicheBrowser();
    const u = e.target.closest("[data-u]");
    if (u && !e.target.closest("[data-uf]")) return openProfile(u.dataset.u);
    const n = e.target.closest("[data-n]");
    if (n) return openNiche(n.dataset.n, n.dataset.nq || n.dataset.q);
    const s = e.target.closest("[data-q]");
    if (s && sugg.contains(s)) return results(s.dataset.q, "videos", s.dataset.tag === "1");
  });
  if (q0) results(q0, tab0, exact0); else { showStart(); setTimeout(() => inp.focus(), 60); }
}
// a creator in a list, with a Follow button
const userRow = (c) => {
  const n = c.username || c.name;
  if (!n) return "";
  const f = isFollowing(n);
  return `<div class="urow" data-u="${esc(n)}">${av(c.profileImageUrl || userPic(n), n)}<span class="ut"><b>@${esc(n)}${c.verified ? tick() : ""}</b><small>${[c.followers != null ? tn(c.followers, "{n} follower", "{n} followers") : "", c.gifs != null ? tn(c.gifs, "{n} video", "{n} videos") : ""].filter(Boolean).map(esc).join(" · ")}</small></span><button class="btn ${f ? "" : "is-red"} is-sm" data-uf="${esc(n)}">${esc(f ? t("Following") : t("Follow"))}</button></div>`;
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-uf]");
  if (!b) return;
  e.stopPropagation();
  const n = b.dataset.uf;
  const now = setFollow(n, !isFollowing(n));
  document.querySelectorAll(`[data-uf="${CSS.escape(n)}"]`).forEach((x) => { x.textContent = now ? t("Following") : t("Follow"); x.classList.toggle("is-red", !now); });
}, true);
// rows from a paged RedGifs list, more while you scroll
function pagedList(box, root, pathOf, pick, row, emptyText, cls) {
  let page = 0, done = false, busy = false;
  box.innerHTML = `<div class="${cls || "ulist"}"></div><div class="gend"></div>`;
  const list = box.firstElementChild, end = box.lastElementChild;
  const more = async () => {
    if (busy || done) return;
    busy = true;
    end.innerHTML = '<div class="spin"></div>';
    try {
      const d = await rg(pathOf(page + 1));
      takeUsers(d);
      page++;
      const items = pick(d);
      if (!items.length || page >= (d.pages || 1)) done = true;
      (items || []).forEach((c) => { const n = c.username; if (n) users.set(String(n).toLowerCase(), Object.assign(userOf(n) || {}, c)); });
      list.insertAdjacentHTML("beforeend", items.map(row).join(""));
      end.innerHTML = done && !list.children.length ? `<div class="gempty">${ic("search")}<b>${esc(emptyText)}</b></div>` : "";
    } catch (e) { end.innerHTML = `<small>${esc(e.message || e)}</small>`; done = true; }
    busy = false;
  };
  const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && more(), { root, rootMargin: "600px" });
  io.observe(end);
  more();
  return { destroy: () => io.disconnect() };
}

// ---------- Explore (main view) ----------
export function mountExplore(view) {
  const p = pageShell(view, esc(t("Explore")), { back: false });
  p.body.innerHTML = `<button class="searchbox is-fake" data-xsearch>${ic("search")}<span>${esc(t("Search creators, niches and tags"))}</span></button><div class="xchips" data-chips></div><div class="gbox"></div>`;
  const chipsBox = p.body.querySelector("[data-chips]");
  let pop = [], grid = null, cur = "trending";
  const base = [["trending", "Trending"], ["latest", "New"], ["top7", "Top this week"], ["top28", "Top this month"], ["top", "Top of all time"]];
  const paintChips = () => {
    const mine = niches.map((n) => ["n:" + n.id, "#" + n.name]);
    const others = pop.filter((n) => !followsNiche(n.id)).map((n) => ["n:" + n.id, "#" + (n.name || nicheName(n.id))]);
    chipsBox.innerHTML = [...base.map(([v, l]) => [v, t(l)]), ...mine, ...others].map(([v, l]) => `<button class="chipb${v === cur ? " is-on" : ""}" data-x="${esc(v)}">${esc(l)}</button>`).join("") + `<button class="chipb is-more" data-allniches>${esc(t("All niches"))} ›</button>`;
  };
  const show = (v) => {
    cur = v;
    paintChips();
    if (grid) grid.destroy();
    const label = v.startsWith("n:") ? "#" + ((niches.find((n) => n.id === v.slice(2)) || pop.find((n) => n.id === v.slice(2)) || {}).name || nicheName(v.slice(2))) : t((base.find((b) => b[0] === v) || [, ""])[1]);
    const S = v.startsWith("n:") ? makeSource({ t: "niche", slug: v.slice(2), order: "hot" }) : makeSource({ t: "search", order: v });
    grid = mountGrid(p.body.querySelector(".gbox"), S, { root: p.body, barHost: view, feedTitle: label, selectable: false });
  };
  paintChips();
  show("trending");
  rg("/niches/search?query=&order=subscribers&count=20&page=1").then((d) => { pop = (d.niches || []).map((n) => ({ id: n.id, name: n.name })); paintChips(); }).catch(() => {});
  view.addEventListener("click", (e) => {
    if (e.target.closest("[data-xsearch]")) return openSearch();
    if (e.target.closest("[data-allniches]")) return openNicheBrowser();
    const c = e.target.closest("[data-x]");
    if (c && c.dataset.x !== cur) { show(c.dataset.x); c.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
  });
  on("niches", paintChips);
  return { top: () => p.body.scrollTo({ top: 0, behavior: "smooth" }) };
}

// ---------- your profile (main view): liked, saved, watched, following, niches ----------
export function mountMe(view) {
  const p = pageShell(view, esc(t("Profile")), { back: false, right: `<button class="ph-b" data-set aria-label="${esc(t("Settings"))}">${ic("gear")}</button>` });
  p.body.innerHTML = `<div class="phead is-center"></div><div class="mtabs"></div>`;
  const head = p.body.querySelector(".phead");
  const paint = () => {
    head.innerHTML = `<span class="av av-xl is-me">${ic("user")}</span><h1>${esc(t("You"))}</h1><div class="pname">${esc(t("Kept in this browser – and in a backup file next to Stash"))}</div>
      <div class="stats is-tap"><button data-go="following"><b>${fmt(following.length)}</b>${esc(t("Following"))}</button><button data-go="liked"><b>${fmt(liked.length)}</b>${esc(t("Liked"))}</button><button data-go="saved"><b>${fmt(Math.max(saved.length, doneSet.size))}</b>${esc(t("Saved"))}</button></div>
      <div class="pbtns"><button class="btn is-red" data-playliked${liked.length ? "" : " disabled"}>${ic("play")}${esc(t("Play liked"))}</button><button class="btn" data-set>${ic("gear")}${esc(t("Settings"))}</button></div>`;
  };
  paint();
  const tabs = tabbed(null, p.body.querySelector(".mtabs"), [
    { id: "liked", icon: "heart", label: t("Liked") }, { id: "saved", icon: "down", label: t("Saved") }, { id: "history", icon: "history", label: t("Watched") },
    { id: "following", icon: "users", label: t("Following") }, { id: "niches", icon: "tag", label: t("Niches") },
  ], "liked", (id, box) => {
    if (id === "liked") return mountGrid(box, listSource(liked.slice().reverse()), { root: p.body, barHost: view, feedTitle: t("Liked"), makeS: () => listSource(liked.slice().reverse()), remove: { label: t("Unlike"), fn: (ids) => unlikeMany(ids) }, empty: { icon: "heart", title: t("No liked videos yet"), text: t("Double-tap a video or press the heart.") } });
    if (id === "saved") return mountGrid(box, listSource(saved.slice()), { root: p.body, barHost: view, feedTitle: t("Saved"), selectable: false, empty: { icon: "down", title: t("Nothing saved yet"), text: t("Press Save on a video – it goes into your Stash library.") } });
    if (id === "history") return mountGrid(box, listSource(history.slice()), { root: p.body, barHost: view, feedTitle: t("Watched"), makeS: () => listSource(history.slice()), extra: history.length ? `<button class="chipb" data-clearw>${ic("trash")}<span>${esc(t("Clear"))}</span></button>` : "", remove: { label: t("Remove"), fn: (ids) => removeFromHistory(ids) }, empty: { icon: "history", title: t("Nothing watched yet"), text: t("Videos you watch show up here.") } });
    if (id === "following") {
      box.innerHTML = following.length ? `<div class="gbar"><button class="btn is-red" data-playfol>${ic("play")}${esc(t("Play newest"))}</button></div><div class="ulist">${following.slice().reverse().map((f) => userRow(Object.assign({ username: f.name }, userOf(f.name) || {}, { profileImageUrl: userPic(f.name) }))).join("")}</div>` : `<div class="gempty">${ic("users")}<b>${esc(t("You don't follow anybody yet"))}</b><span>${esc(t("Press the + under a creator's picture."))}</span></div>`;
      return null;
    }
    if (id === "niches") {
      box.innerHTML = `<div class="gbar"><button class="btn" data-allniches>${ic("search")}${esc(t("Find niches"))}</button></div>${niches.length ? `<div class="ngrid">${niches.map((n) => nicheTile({ id: n.id, name: n.name, thumbnail: n.img })).join("")}</div>` : `<div class="gempty">${ic("tag")}<b>${esc(t("No niches followed"))}</b><span>${esc(t("Follow niches and For You shows more of them."))}</span></div>`}`;
      return null;
    }
  });
  view.addEventListener("click", (e) => {
    if (e.target.closest("[data-set]")) return nav.openSettings();
    const g = e.target.closest("[data-go]");
    if (g) return tabs.show(g.dataset.go);
    if (e.target.closest("[data-playliked]")) return liked.length && nav.openFeed(listSource(liked.slice().reverse()), 0, t("Liked"));
    if (e.target.closest("[data-playfol]")) return nav.showView("following");
    if (e.target.closest("[data-allniches]")) return openNicheBrowser();
    if (e.target.closest("[data-clearw]")) return modalConfirm(t("Clear your watch history?"), t("For You will show videos you've seen again."), t("Clear"), () => { clearHistory(); tabs.show("history"); });
    const n = e.target.closest(".ntile");
    if (n) return openNiche(n.dataset.n, n.dataset.q);
    const u = e.target.closest("[data-u]");
    if (u && !e.target.closest("[data-uf]")) return openProfile(u.dataset.u);
  });
  return {
    shown: () => { paint(); tabs.reload(); },
    top: () => p.body.scrollTo({ top: 0, behavior: "smooth" }),
  };
}
export function modalConfirm(title, text, ok, fn) {
  modal(`<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}<div class="row"><button class="btn is-ghost" data-close>${esc(t("Cancel"))}</button><button class="btn is-red" data-ok>${esc(ok)}</button></div>`, (m, close) => {
    m.querySelector("[data-ok]").onclick = () => { close(); fn(); };
  });
}

// ---------- downloads (main view) ----------
export function mountDownloads(view) {
  const p = pageShell(view, esc(t("Downloads")), { back: false });
  p.body.innerHTML = `<div class="wrap"><div class="dlfolder"></div><div class="dljobs"></div><h3 class="sh">${esc(t("Saved videos"))}</h3><div class="gbox"></div></div>`;
  const folder = p.body.querySelector(".dlfolder"), list = p.body.querySelector(".dljobs");
  let grid = null;
  const paintFolder = () => {
    folder.innerHTML = `<span class="fic">${ic("folder")}</span><span class="ft"><b>${esc(settings.base || t("No download folder yet"))}</b><small>${esc(settings.base ? (settings.scan ? t("One folder per creator · Stash scans new videos") : t("One folder per creator · no scan")) : t("Choose a folder inside your Stash library"))}</small></span><button class="btn is-sm" data-chg>${esc(settings.base ? t("Change") : t("Choose"))}</button>`;
  };
  const stateText = (j) => (j.state === "ok" ? (j.note === "there" ? t("Already there") : t("Saved")) : j.state === "bad" ? t("Failed") : j.state === "run" ? t("Downloading…") : j.state === "cancel" ? t("Canceled") : t("Waiting"));
  const paintJobs = () => {
    if (!jobs.length) { list.innerHTML = ""; return; }
    const done = jobs.filter((j) => !["queued", "run"].includes(j.state)).length, act = jobs.length - done, bad = jobs.filter((j) => j.state === "bad").length;
    list.innerHTML = `<div class="jhead"><b>${esc(act ? t("Downloading {a} of {b}", { a: done + 1 > jobs.length ? jobs.length : done + 1, b: jobs.length }) : t("Done"))}</b><span class="sp"></span>${act ? `<button class="chipb" data-cancel>${esc(t("Cancel the rest"))}</button>` : ""}${bad ? `<button class="chipb" data-retry>${esc(t("Try failed again"))}</button>` : ""}${done ? `<button class="chipb" data-clear>${esc(t("Clear list"))}</button>` : ""}</div>
      <div class="jbar"><i style="width:${(done / jobs.length) * 100}%"></i></div>
      <div class="jlist">${jobs.slice().reverse().slice(0, 200).map((j) => `<div class="jrow is-${j.state}">${img(j.g.thumb, "", ' loading="lazy"') || "<i></i>"}<span class="jt"><b>@${esc(j.g.user)}</b><small>${esc(j.state === "bad" ? j.note || t("Failed") : j.g.desc || j.g.id)}</small></span><em>${j.state === "run" ? '<i class="mini-spin"></i>' : ""}${esc(stateText(j))}</em></div>`).join("")}</div>`;
  };
  const paintGrid = () => { if (grid) grid.destroy(); grid = mountGrid(p.body.querySelector(".gbox"), listSource(saved.slice()), { root: p.body, barHost: view, feedTitle: t("Saved"), selectable: false, empty: { icon: "down", title: t("Nothing saved yet"), text: t("Press Save on a video – it goes into your Stash library.") } }); };
  paintFolder(); paintJobs(); paintGrid();
  let tm = 0;
  on("job", () => { clearTimeout(tm); tm = setTimeout(paintJobs, 120); });
  on("jobs", () => { clearTimeout(tm); tm = setTimeout(paintJobs, 60); });
  on("data", () => { if (view.isConnected && !view.hidden) paintGrid(); });
  on("settings", paintFolder);
  view.addEventListener("click", (e) => {
    if (e.target.closest("[data-chg]")) return nav.openSettings("base");
    if (e.target.closest("[data-cancel]")) return cancelQueued();
    if (e.target.closest("[data-retry]")) return retryFailed();
    if (e.target.closest("[data-clear]")) return clearFinished();
  });
  return { shown: () => { paintFolder(); paintJobs(); paintGrid(); }, top: () => p.body.scrollTo({ top: 0, behavior: "smooth" }) };
}

// ---------- download a whole profile ----------
export async function downloadProfile(name) {
  const S = makeSource({ t: "user", name, order: "recent" });
  const tt = toast(t("Reading @{u}…", { u: name }));
  try { await S.more(); } catch (e) { tt.remove(); return toast(t("Couldn't read the profile: {e}", { e: e.message || e }), true); }
  tt.remove();
  const total = S.total != null ? S.total : S.items.length;
  if (!total) return toast(t("Nothing to download"));
  const have = S.items.filter((g) => isSaved(g.id)).length;
  modal(`<h3>${esc(t("Download @{u}", { u: name }))}</h3><p>${esc(tn(total, "{n} video", "{n} videos"))}${total > 500 ? " – " + esc(t("that can take a long time and a lot of space")) : ""}. ${esc(t("They go into the folder “{u}” in your download folder; what is already there is skipped.", { u: name }))}</p>
    ${have ? `<p class="faint">${esc(tn(have, "{n} of the newest is already saved", "{n} of the newest are already saved"))}</p>` : ""}
    <label class="numrow">${esc(t("The newest"))} <input type="number" min="1" max="${total}" value="${Math.min(total, 100)}" data-n> ${esc(t("of {n}", { n: total }))}</label>
    <div class="row"><button class="btn is-ghost" data-close>${esc(t("Cancel"))}</button><button class="btn" data-newest>${esc(t("Download the newest"))}</button><button class="btn is-red" data-all>${esc(t("Download all {n}", { n: fmt(total) }))}</button></div>`, (m, close) => {
    const go = async (limit) => {
      close();
      const live = toast("");
      live.classList.add("is-live");
      try {
        while (S.items.length < limit && !S.done) {
          live.querySelector("span").textContent = t("Reading @{u} … {a} / {b}", { u: name, a: S.items.length, b: Math.min(total, limit) });
          await S.more();
        }
      } catch (e) { toast(t("Stopped reading: {e}", { e: e.message || e }), true); }
      live.remove();
      await enqueue(S.items.slice(0, limit));
    };
    m.querySelector("[data-all]").onclick = () => go(total);
    m.querySelector("[data-newest]").onclick = () => go(Math.max(1, Math.min(total, Number(m.querySelector("[data-n]").value) || 1)));
  });
}

// ---------- your Stash: a performer, a tag ----------
export async function openPerformer(id, name, img) {
  const p = openPage(esc(name || t("Performer")));
  p.body.innerHTML = `<div class="phead is-center"></div><div class="gbox"></div>`;
  const head = p.body.querySelector(".phead");
  let info = { name, image_path: img };
  let S = makeSource({ t: "stash", performer: id, order: "random" });
  const paint = () => {
    head.innerHTML = `${av(info.image_path, info.name || "?", "av-xl")}<h1>${esc(info.name || "")}</h1><div class="pname">${esc(t("In your Stash"))}</div>
      <div class="stats">${(info.scene_count ?? S.total) != null ? `<span><b>${fmt(info.scene_count ?? S.total)}</b>${esc(t("Scenes"))}</span>` : ""}</div>
      <div class="pbtns"><button class="btn is-red" data-pplay>${ic("play")}${esc(t("Play"))}</button><button class="btn" data-popen>${ic("open")}${esc(t("Open in Stash"))}</button></div>`;
  };
  paint();
  stashPerformer(id).then((x) => { if (x) { info = x; paint(); } }).catch(() => {});
  const grid = mountGrid(p.body.querySelector(".gbox"), S, { root: p.body, barHost: p.el, sorts: ORDERS.stash, makeS: (o) => (S = makeSource({ t: "stash", performer: id, order: o })), feedTitle: info.name, selectable: false, onCount: paint, empty: { icon: "film", title: t("No scenes") } });
  p.cleanup(() => grid.destroy());
  p.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-pplay]")) return grid.S.items.length && nav.openFeed(grid.S, 0, info.name);
    if (e.target.closest("[data-popen]")) return window.open(nav.stashUrl("performer", id), "_blank");
  });
}
export function openStashTag(id, name) {
  const p = openPage(`#${esc(name)}`);
  p.body.innerHTML = `<div class="phead"><span class="nthumb">${ic("tag")}</span><div class="pinfo"><h1>#${esc(name)}</h1><div class="stats" data-n></div><div class="pbtns"><button class="btn is-red" data-tplay>${ic("play")}${esc(t("Play"))}</button></div></div></div><div class="gbox"></div>`;
  let S = makeSource({ t: "stash", tag: id, order: "random" });
  const grid = mountGrid(p.body.querySelector(".gbox"), S, { root: p.body, barHost: p.el, sorts: ORDERS.stash, makeS: (o) => (S = makeSource({ t: "stash", tag: id, order: o })), feedTitle: "#" + name, selectable: false, onCount: (s) => { p.body.querySelector("[data-n]").innerHTML = s.total != null ? `<span><b>${fmt(s.total)}</b>${esc(t("Scenes"))}</span>` : ""; } });
  p.cleanup(() => grid.destroy());
  p.el.addEventListener("click", (e) => { if (e.target.closest("[data-tplay]")) grid.S.items.length && nav.openFeed(grid.S, 0, "#" + name); });
}

// ---------- the share / options sheet of a video (also: long press, "…") ----------
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FITS = ["auto", "fill", "fit"];
const fitLabel = (f) => ({ auto: t("Auto"), fill: t("Fill"), fit: t("Whole") }[f]);
export function openShare(g, F) {
  const round = (act, icon, label, cls = "") => `<button class="sbtn ${cls}" data-sh="${act}"><span class="sic">${ic(icon)}</span><span class="sl">${label}</span></button>`;
  const saved = !g.stash && isSaved(g.id);
  const j = jobOf(g.id), running = j && (j.state === "queued" || j.state === "run");
  const row1 = g.stash
    ? round("copy", "copy", esc(t("Copy link")), "is-blue") + round("stash", "open", esc(t("Open in Stash")), "is-dark")
    : round("copy", "copy", esc(t("Copy link")), "is-blue") + round("rg", "open", esc(t("Open on RedGifs")), "is-red") + round("dl", saved ? "check" : "down", esc(saved ? t("Saved") : running ? t("Saving") : t("Save video")), saved ? "is-teal" : "is-green");
  const row2 = () => (g.stash ? "" : round("nope", "eyeoff", esc(t("Not interested"))) + round("hide", "block", esc(t("Hide creator")))) +
    round("speed", "speed", `${esc(t("Speed"))} <b>${settings.speed}×</b>`) +
    round("auto", "autoscroll", `${esc(t("Auto scroll"))} <b>${esc(settings.autonext ? t("On") : t("Off"))}</b>`) +
    round("clear", "clear", esc(t("Clear display"))) +
    round("fit", "fit", `${esc(t("Picture"))} <b>${esc(fitLabel(settings.fit))}</b>`) +
    round("info", "info", esc(t("Details")));
  modal(`<h3 class="sh-t">${esc(t("Share to"))}</h3><div class="srowx">${row1}</div><div class="srowx is-2" data-r2>${row2()}</div><button class="btn is-ghost is-full" data-close>${esc(t("Cancel"))}</button>`, (m, close) => {
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sh]");
      if (!b) return;
      const a = b.dataset.sh;
      const redraw = () => (m.querySelector("[data-r2]").innerHTML = row2());
      if (a === "copy") { close(); return copyText(g.stash ? nav.stashUrl("scene", g.sceneId) : `https://www.redgifs.com/watch/${g.id}`); }
      if (a === "rg") { close(); return window.open(`https://www.redgifs.com/watch/${enc(g.id)}`, "_blank", "noopener,noreferrer"); }
      if (a === "stash") { close(); return nav.openInStash(g); }
      if (a === "dl") { close(); return saved ? toast(t("Already saved")) : running ? toast(t("Already downloading")) : enqueue([g]); }
      if (a === "nope") {
        close();
        setNope(g.id, true);
        F && F.go(1);
        return toast(t("You'll see fewer videos like this"), false, { label: t("Undo"), fn: () => setNope(g.id, false) });
      }
      if (a === "hide") {
        close();
        setHidden(g.user, true);
        return toast(t("You won't see @{u} any more", { u: g.user }), false, { label: t("Undo"), fn: () => setHidden(g.user, false) });
      }
      if (a === "speed") { setSpeed(SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length] || 1); return redraw(); }
      if (a === "auto") { setAutoNext(!settings.autonext); return redraw(); }
      if (a === "fit") { setFit(FITS[(FITS.indexOf(settings.fit) + 1) % FITS.length]); return redraw(); }
      if (a === "clear") { close(); return nav.setClear(true); }
      if (a === "info") { close(); return openDetails(g); }
    });
  }, { bottom: true, cls: "share" });
}

// ---------- about one video: who, when, niches and tags ----------
export function openDetails(g) {
  const facts = [
    g.views ? [g.stash ? t("Plays") : t("Views"), fmt(g.views)] : null,
    [g.stash ? t("O count") : t("Likes"), fmt(g.likes || 0)],
    g.date ? [g.stash ? t("Added") : t("Posted"), ago(g.date)] : null,
    g.dur ? [t("Length"), mmss(g.dur)] : null,
    g.w && g.h ? [t("Size"), `${g.w}×${g.h}`] : null,
    g.stash ? null : [t("Sound"), g.audio ? t("Yes") : t("No")],
  ].filter(Boolean);
  const pic = g.stash ? g.img : userPic(g.user);
  modal(`<div class="dhead" data-who>${av(pic, g.user)}<span><b>${g.stash ? "" : "@"}${esc(g.user)}${g.verified ? tick() : ""}</b><small>${esc(g.stash ? g.studio || t("My Stash") : t("Creator"))}</small></span>${g.stash ? "" : `<button class="btn ${isFollowing(g.user) ? "" : "is-red"} is-sm" data-uf="${esc(g.user)}">${esc(isFollowing(g.user) ? t("Following") : t("Follow"))}</button>`}</div>
    ${g.desc ? `<p class="ddesc">${esc(g.desc)}</p>` : ""}
    <div class="facts">${facts.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join("")}</div>
    ${g.niches && g.niches.length ? `<h4 class="mh">${esc(t("Niches"))}</h4><div class="chips">${g.niches.map((n) => `<button class="chipb" data-dn="${esc(n)}">#${esc(nicheName(n))}</button>`).join("")}</div>` : ""}
    ${g.tags && g.tags.length ? `<h4 class="mh">${esc(t("Tags"))}</h4><div class="chips">${g.tags.map((x, k) => `<button class="chipb" data-dt="${esc(x)}"${g.tagIds ? ` data-tid="${esc(g.tagIds[k])}"` : ""}>#${esc(x)}</button>`).join("")}</div>` : ""}
    <button class="btn is-ghost is-full" data-close>${esc(t("Close"))}</button>`, (m, close) => {
    m.addEventListener("click", (e) => {
      if (e.target.closest("[data-uf]")) return;
      if (e.target.closest("[data-who]")) { close(); return g.stash ? g.pid && openPerformer(g.pid, g.user, g.img) : openProfile(g.user); }
      const n = e.target.closest("[data-dn]");
      if (n) { close(); return openNiche(n.dataset.dn, nicheName(n.dataset.dn)); }
      const tg = e.target.closest("[data-dt]");
      if (tg) { close(); return g.stash ? tg.dataset.tid && openStashTag(tg.dataset.tid, tg.dataset.dt) : openSearch(tg.dataset.dt, "videos", true); }
    });
  }, { bottom: true, cls: "details" });
}

// ---------- settings ----------
export function openSettings(focus) {
  const p = openPage(esc(t("Settings")));
  const sw = (k, label, hint) => `<label class="set"><span class="st"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ""}</span><span class="sw"><input type="checkbox" data-k="${k}"${settings[k] ? " checked" : ""}><i></i></span></label>`;
  const sel = (k, label, hint, opts) => `<label class="set"><span class="st"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ""}</span><select data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(settings[k]) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const paint = () => {
    p.body.innerHTML = `<div class="wrap sets">
    <h3 class="sh">${esc(t("Playback"))}</h3>
    ${sw("sound", t("Sound on"), t("Videos start with sound (your browser may want one tap first)."))}
    ${sw("autonext", t("Auto scroll"), t("Go to the next video when one ends. Off: videos loop."))}
    ${sw("skipSeen", t("Skip videos you've watched"), t("For You leaves out what you have already seen."))}
    ${sel("playq", t("Playback quality"), t("Auto plays the smaller file on phones – it starts much faster."), [["auto", t("Auto")], ["sd", t("Always SD")], ["hd", t("Always HD")]])}
    ${sel("fit", t("Picture"), t("Auto fills the screen with tall videos and shows wide ones whole."), [["auto", t("Auto")], ["fill", t("Fill the screen")], ["fit", t("Always whole")]])}
    ${sel("speed", t("Speed"), "", SPEEDS.map((x) => [x, x + "×"]))}
    <h3 class="sh">${esc(t("Downloads"))}</h3>
    <div class="set is-col" data-focus="base"><span class="st"><b>${esc(t("Download folder"))}</b><small>${esc(t("Videos go into a folder per creator in here. Put it inside your Stash library, then Stash finds them."))}</small></span>
      <span class="setrow"><input type="text" data-k="base" value="${esc(settings.base)}" placeholder="${esc(t("e.g. D:\\Videos\\RedGifs"))}" spellcheck="false"><button class="btn" data-detect>${esc(t("Suggest"))}</button></span></div>
    ${sel("quality", t("Download quality"), "", [["hd", t("HD (original)")], ["sd", t("SD (smaller)")]])}
    ${sw("scan", t("Scan into Stash"), t("After downloading, Stash scans the folders that got new videos."))}
    <h3 class="sh">${esc(t("Your feed"))}</h3>
    <div class="set is-col"><span class="st"><b>${esc(t("Hidden creators"))}</b><small>${esc(hidden.length ? t("Their videos never show up. Tap one to show it again.") : t("None. Hide a creator from a video's share menu."))}</small></span>${hidden.length ? `<div class="chips">${hidden.map((h) => `<button class="chipb is-x" data-unhide="${esc(h)}">@${esc(h)} ${ic("close")}</button>`).join("")}</div>` : ""}</div>
    <div class="set"><span class="st"><b>${esc(t("Not interested"))}</b><small>${esc(tn(nope.length, "{n} video left out", "{n} videos left out"))}</small></span>${nope.length ? `<button class="btn is-ghost is-sm" data-resetnope>${esc(t("Reset"))}</button>` : ""}</div>
    <h3 class="sh">${esc(t("Language"))}</h3>
    ${sel("lang", t("Language"), t("Automatic follows Stash UI or Stash."), LANGS.map(([c, l]) => [c, c === "auto" ? t("Automatic") : l]))}
    <h3 class="sh">${esc(t("Your data"))}</h3>
    <div class="set is-col"><span class="st"><b>${esc(t("{a} liked · {b} followed · {c} watched · {d} saved", { a: liked.length, b: following.length, c: history.length, d: Math.max(saved.length, doneSet.size) }))}</b><small>${esc(t("All of it stays in this browser. A copy goes to a backup file next to Stash, so another browser or device gets it back by itself."))}</small></span>
      <span class="setrow"><button class="btn" data-export>${ic("down")}${esc(t("Export"))}</button><label class="btn">${ic("backup")}${esc(t("Import"))}<input type="file" accept=".json,application/json" data-import hidden></label><button class="btn is-ghost" data-clearw>${esc(t("Clear watch history"))}</button><button class="btn is-ghost" data-forget>${esc(t("Forget downloads list"))}</button></span></div>
    <h3 class="sh">${esc(t("Keyboard"))}</h3>
    <div class="keys">${KEYS().map(([k, v]) => `<span><kbd>${esc(k)}</kbd>${esc(v)}</span>`).join("")}</div>
    <h3 class="sh">${esc(t("About"))}</h3>
    <p class="about">RedTok ${VERSION} · ${esc(t("Watches RedGifs' public videos without an account and saves the ones you want into your Stash library. Not made by or connected to RedGifs or TikTok."))}${usingBackend() ? " " + esc(t("Your browser can't reach RedGifs directly here, so the plugin's backend asks for it (a little slower).")) : ""}<br><a href="https://github.com/anonym88312/stash-pmv-plugins" target="_blank" rel="noopener noreferrer">github.com/anonym88312/stash-pmv-plugins</a></p>
    </div>`;
    if (focus) { const f = p.body.querySelector(`[data-focus="${focus}"]`); if (f) { f.classList.add("is-flash"); setTimeout(() => f.scrollIntoView({ block: "center" }), 60); f.querySelector("input")?.focus(); } focus = null; }
  };
  paint();
  p.body.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.matches("[data-import]")) {
      const f = el.files && el.files[0];
      if (!f) return;
      try { const n = importData(await f.text()); toast(t("Imported – reloading")); setTimeout(() => location.reload(), 700); void n; } catch (x) { toast(String(x.message || x), true); }
      return;
    }
    const k = el.dataset.k;
    if (!k) return;
    let v = el.type === "checkbox" ? el.checked : el.value.trim();
    if (k === "speed") v = Number(v);
    if (k === "sound") return setMuted(!v);
    if (k === "autonext") return setAutoNext(v);
    if (k === "speed") return setSpeed(v);
    if (k === "fit") return setFit(v);
    settings[k] = v;
    saveSettings();
    nav.emitSettings();
    if (k === "lang") { toast(t("Reloading…")); setTimeout(() => location.reload(), 500); }
    else toast(t("Saved"));
  });
  p.body.addEventListener("click", async (e) => {
    if (e.target.closest("[data-detect]")) {
      try {
        const c = await call({ mode: "conf" });
        if (c && c.base) { settings.base = c.base; saveSettings(); nav.emitSettings(); p.body.querySelector('[data-k="base"]').value = c.base; toast(t("Folder suggested – change it if you like")); }
        else toast(t("Couldn't find a library – type the folder"), true);
      } catch (x) { toast(String(x.message || x), true); }
      return;
    }
    const u = e.target.closest("[data-unhide]");
    if (u) { setHidden(u.dataset.unhide, false); return paint(); }
    if (e.target.closest("[data-resetnope]")) { nope.splice(0); store.set("nope", []); return paint(); }
    if (e.target.closest("[data-export]")) {
      const blob = new Blob([exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `redtok-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return;
    }
    if (e.target.closest("[data-clearw]")) return modalConfirm(t("Clear your watch history?"), t("For You will show videos you've seen again."), t("Clear"), () => { clearHistory(); paint(); toast(t("Cleared")); });
    if (e.target.closest("[data-forget]")) return modalConfirm(t("Forget the downloads list?"), t("The files stay on your disk. RedTok just forgets which ones it saved."), t("Forget"), () => { forgetDownloads(); paint(); toast(t("Forgotten")); });
  });
  const off = on("hidden", paint);
  p.cleanup(off);
}
export const KEYS = () => [["↑ ↓ / J K", t("Previous / next video")], [t("Space"), t("Pause")], ["M", t("Sound")], ["L", t("Like")], ["S", t("Save")], ["← →", t("Back / forward 5 s")], ["F", t("Follow")], ["P", t("Profile")], ["C", t("Clear display")], ["/", t("Search")], ["?", t("Shortcuts")]];
export function openKeys() {
  modal(`<h3>${esc(t("Keyboard shortcuts"))}</h3><div class="keys">${KEYS().map(([k, v]) => `<span><kbd>${esc(k)}</kbd>${esc(v)}</span>`).join("")}</div><div class="row"><button class="btn" data-close>${esc(t("Close"))}</button></div>`);
}
export { ensureBase, activeJobs, isPhone };
