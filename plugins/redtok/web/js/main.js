// RedTok – the frame: sidebar (wide screens), top tabs and bottom bar (phones), the main views (For You, Following,
// My Stash, Explore, Profile, Downloads), feeds opened from a grid, keys, and the start.

import { $, esc, t, tn, ic, toast, nav, on, emit, gql, store, closeLayers, closeTop, layerCount, topLayer, allLayers, pushLayer, closeLayer, isPhone, VERSION, initLang, modal, BLANK, isRgPic, useBackendPics, imgViaBackend } from "./core.js";
import { settings, saveSettings, makeSource, ORDERS, orderOf, following, tagFollows, niches, userPic, isFollowing, setFollow, imgData } from "./data.js";
import { restoredN } from "./boot.js";
import { createFeed, activeFeed, unlockSound, av, setMuted, muted, setFrame, cycleFrame } from "./feed.js";
import { jobs, activeJobs } from "./dl.js";
import {
  openProfile, openNiche, openSearch, openSettings, openShare, openDetails, openPerformer, openStashTag, openNicheBrowser, openKeys,
  mountExplore, mountMe, mountDownloads, actionSheet,
} from "./pages.js";

await initLang(settings.lang);

// ---------- Stash UI or classic Stash: where "Back to Stash" and "Open in Stash" lead ----------
let stashUi = false;
gql("query { plugins { id enabled } }").then((d) => { stashUi = (d.plugins || []).some((p) => p.id === "stashui" && p.enabled !== false); paintSide(); }).catch(() => {});
const stashHome = () => (stashUi ? "/plugin/stashui/assets/index.html" : "/");
nav.stashUrl = (kind, id) => (stashUi ? `${location.origin}/plugin/stashui/assets/index.html#/${kind}/${id}` : `${location.origin}/${kind}s/${id}`);
nav.openInStash = (g) => window.open(nav.stashUrl("scene", g.sceneId), "_blank");

// ---------- main views ----------
const FEEDS = {
  foryou: { src: () => makeSource({ t: "foryou", order: store.get("fyOrder", "foryou") }), sorts: ORDERS.foryou, key: "fyOrder",
    empty: () => store.get("fyOrder", "foryou") === "mine" && !niches.length && !tagFollows.length
      ? { icon: "tag", title: t("Follow niches to see them here"), text: t("Follow a niche on its page (or a #tag under a video), then “Only my niches” plays just those."), btn: t("Explore"), fn: () => showView("explore") }
      : ({ icon: "refresh", title: t("Nothing new right now"), text: t("You've seen everything that's trending. Turn off “Skip videos you've watched” in Settings, or explore niches."), btn: t("Explore"), fn: () => showView("explore") }) },
  following: { src: () => makeSource({ t: "following" }),
    empty: () => ({ icon: "users", title: following.length || (settings.followTags && tagFollows.length) ? t("No videos from the creators you follow") : t("Follow creators to see their newest videos here"), text: following.length || (settings.followTags && tagFollows.length) ? "" : t("Press the + under a creator's picture, or Follow on the page of a #tag."), btn: t("Find creators"), fn: () => showView("explore") }) },
  stash: { src: () => makeSource({ t: "stash", order: store.get("stashOrder", "random") }), sorts: ORDERS.stash, key: "stashOrder",
    empty: () => ({ icon: "film", title: t("No scenes in your Stash yet"), text: t("Once Stash has scanned videos, they play here.") }) },
};
const PAGES = { explore: mountExplore, me: mountMe, downloads: mountDownloads };
const views = {};
let curView = "";
const main = $("#main");

function viewEl(id) {
  if (views[id]) return views[id];
  const el = document.createElement("div");
  el.className = "view";
  el.dataset.view = id;
  el.hidden = true;
  main.appendChild(el);
  const v = { id, el };
  if (FEEDS[id]) {
    el.classList.add("is-feed");
    v.make = () => {
      if (v.F) v.F.destroy();
      el.innerHTML = "";
      const host = document.createElement("div");
      el.appendChild(host);
      v.F = createFeed(host, FEEDS[id].src(), { empty: FEEDS[id].empty() });
    };
    v.make();
  } else v.api = PAGES[id](el);
  views[id] = v;
  return v;
}
function showView(id, opts = {}) {
  if (layerCount()) closeLayers();
  const v = viewEl(id);
  if (id === curView && !opts.keep) {
    // the tab you're on, tapped again: start over (feeds) or go to the top (pages)
    if (v.make) { v.make(); toast(t("Refreshed")); } else v.api && v.api.top && v.api.top();
  }
  curView = id;
  Object.values(views).forEach((x) => {
    const show = x.id === id;
    x.el.hidden = !show;
    if (!show && x.F) x.F.deactivate(true);
  });
  if (v.api && v.api.shown && !opts.keep) v.api.shown();
  paintChrome();
  refreshActive();
}
nav.showView = showView;

// which feed plays: the one in the top page if that is a feed, otherwise the main view's (when it is a feed and no
// page covers it). Dialogs (share sheet …) don't stop it.
function refreshActive() {
  const pagesOnTop = allLayers().filter((L) => L.kind !== "modal");
  const top = pagesOnTop[pagesOnTop.length - 1];
  let want = null;
  if (top) want = top.kind === "feed" ? top.feed : null;
  else if (views[curView] && views[curView].F) want = views[curView].F;
  const cur = activeFeed();
  if (cur && cur !== want) cur.deactivate();
  if (want && want !== cur) want.activate();
  document.body.classList.toggle("has-page", !!top);
  document.body.classList.toggle("feed-on", !!want);
  paintUpDown();
}
on("layers", refreshActive);

// ---------- a list opened from a grid, as a feed of its own (Back returns to the grid) ----------
nav.openFeed = (S, index, title) => {
  const el = document.createElement("div");
  el.className = "flayer";
  el.innerHTML = `<header class="fl-top"><button class="ph-b" data-back aria-label="${esc(t("Back"))}">${ic("back")}</button><h2>${esc(title || "")}</h2><span class="ph-gap"></span></header><div></div>`;
  const F = createFeed(el.lastElementChild, S, { index });
  const L = pushLayer(el, { kind: "feed", feed: F, onClose: () => F.destroy() });
  el.querySelector("[data-back]").onclick = () => closeLayer(L);
};

Object.assign(nav, {
  openProfile, openNiche, openSettings, openShare, openDetails, openPerformer, openStashTag, openNicheBrowser,
  openSearch: (q, tab, exact) => openSearch(q || "", tab || "videos", !!exact),
  openDownloads: () => showView("downloads"),
  toast,
  emitSettings: () => emit("settings", {}),
  setClear,
  toggleFull,
  cycleFrame,
  toggleSide: () => { settings.side = settings.side === false; saveSettings(); applySide(); emit("settings", {}); },
});

// ---------- sidebar on / off (PC) and the player shape ----------
document.body.insertAdjacentHTML("beforeend", '<button id="sidetog" type="button"></button>');
function applySide() {
  const off = settings.side === false;
  document.documentElement.classList.toggle("no-side", off);
  const b = $("#sidetog");
  b.innerHTML = ic(off ? "menu" : "back");
  const l = off ? t("Show the sidebar") : t("Hide the sidebar");
  b.setAttribute("aria-label", l);
  b.title = l + " (B)";
}
$("#sidetog").addEventListener("click", () => nav.toggleSide());
applySide();
setFrame(settings.frame);
on("settings", () => { applySide(); document.documentElement.dataset.frame = isPhone() ? "auto" : settings.frame; });
addEventListener("resize", () => { document.documentElement.dataset.frame = isPhone() ? "auto" : settings.frame; });

// ---------- fullscreen (the whole page: the menu steps aside, the video gets all the room) ----------
function toggleFull() {
  const el = document.documentElement;
  if (document.fullscreenElement) return document.exitFullscreen();
  if (!el.requestFullscreen) return toast(t("Your browser can't go fullscreen here."), true);
  el.requestFullscreen().catch(() => toast(t("Your browser can't go fullscreen here."), true));
}
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  document.documentElement.classList.toggle("is-full", on);
  document.querySelectorAll(".cbtn.fs").forEach((b) => (b.innerHTML = ic(on ? "fullexit" : "full")));
});

// ---------- top bar (phones: tabs; wide screens: only the sort button) ----------
const TABS = [["stash", "My Stash"], ["following", "Following"], ["foryou", "For You"]];
function paintTop() {
  const f = FEEDS[curView];
  const top = $("#top");
  top.hidden = !f;
  if (!f) return;
  const ord = f.sorts ? store.get(f.key, f.sorts[0][0]) : "";
  const lab = f.sorts ? t((f.sorts.find((x) => x[0] === ord) || f.sorts[0])[1]) : "";
  top.innerHTML = `<div class="t-l">${f.sorts ? `<button class="t-btn is-round only-m" data-sort aria-label="${esc(t("Sort"))}">${ic("tune")}</button>` : '<span class="t-gap"></span>'}</div>
    <div class="tabs">${TABS.map(([id, l]) => `<button class="tab${id === curView ? " is-on" : ""}" data-v="${id}">${esc(t(l))}</button>`).join("")}</div>
    <div class="t-r">${f.sorts ? `<button class="t-btn only-w" data-sort>${ic("tune")}<span>${esc(lab)}</span></button>` : ""}<button class="t-btn is-round only-m" data-search aria-label="${esc(t("Search"))}">${ic("search")}</button></div>`;
}
$("#top").addEventListener("click", (e) => {
  const v = e.target.closest("[data-v]");
  if (v) return showView(v.dataset.v);
  if (e.target.closest("[data-search]")) return nav.openSearch();
  if (e.target.closest("[data-sort]")) return sortMenu();
});
function sortMenu() {
  const f = FEEDS[curView];
  if (!f || !f.sorts) return;
  const cur = store.get(f.key, f.sorts[0][0]);
  modal(`<h3>${esc(t("Sort by"))}</h3><div class="alist">${f.sorts.map(([v, l]) => `<button class="arow${v === cur ? " is-on" : ""}" data-o="${esc(v)}">${v === cur ? ic("check") : '<i class="blank"></i>'}<span>${esc(t(l))}</span></button>`).join("")}</div>${curView === "foryou" ? `<p class="faint">${esc(t("“For you” mixes what's trending with the niches of the videos you like, save and follow."))}</p>` : ""}<button class="btn is-ghost is-full" data-close>${esc(t("Cancel"))}</button>`, (m, close) => {
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-o]");
      if (!b) return;
      close();
      if (b.dataset.o === cur) return;
      store.set(f.key, b.dataset.o);
      const v = views[curView];
      v.make();
      paintTop();
      refreshActive();
    });
  }, { bottom: true });
}

// ---------- sidebar (wide screens) ----------
const NAV = [["foryou", "home", "For You"], ["explore", "compass", "Explore"], ["following", "users", "Following"], ["stash", "film", "My Stash"], ["me", "user", "Profile"], ["downloads", "down", "Downloads"]];
function paintSide() {
  const act = activeJobs();
  $("#side").innerHTML = `<a class="s-logo" href="#" data-v="foryou"><img src="icon.png" alt="" width="32" height="32"><b>RedTok</b></a>
    <button class="s-search" data-search>${ic("search")}<span>${esc(t("Search"))}</span></button>
    <nav>${NAV.map(([id, icon, l]) => `<button class="sn${id === curView ? " is-on" : ""}" data-v="${id}" title="${esc(t(l))}">${ic(icon)}<span>${esc(t(l))}</span>${id === "downloads" && act ? `<em class="badge">${act}</em>` : ""}</button>`).join("")}
      <button class="sn" data-settings title="${esc(t("Settings"))}">${ic("gear")}<span>${esc(t("Settings"))}</span></button>
      <a class="sn" href="${esc(stashHome())}" title="${esc(t("Back to Stash"))}">${ic("back")}<span>${esc(t("Back to Stash"))}</span></a></nav>
    ${following.length ? `<h4>${esc(t("Following accounts"))}</h4><div class="s-follow">${following.slice().reverse().slice(0, 40).map((f) => `<button class="sf" data-profile="${esc(f.name)}" title="@${esc(f.name)}">${av(userPic(f.name), f.name)}<b>${esc(f.name)}</b></button>`).join("")}</div>` : ""}
    <div class="s-foot">RedTok ${VERSION}</div>`;
}
$("#side").addEventListener("click", (e) => {
  const v = e.target.closest("[data-v]");
  if (v) { e.preventDefault(); return showView(v.dataset.v); }
  if (e.target.closest("[data-search]")) return nav.openSearch();
  if (e.target.closest("[data-settings]")) return openSettings();
  const p = e.target.closest("[data-profile]");
  if (p) { if (layerCount()) closeLayers(); return openProfile(p.dataset.profile); }
});

// ---------- bottom bar (phones) ----------
function paintBottom() {
  const act = activeJobs();
  const home = FEEDS[curView] ? " is-on" : "";
  const b = (id, icon, l, on = id === curView) => `<button class="bn${on ? " is-on" : ""}" data-v="${id}">${ic(icon)}<span>${esc(t(l))}</span>${id === "downloads" && act ? `<em class="badge">${act}</em>` : ""}</button>`;
  $("#bottom").innerHTML = `<button class="bn${home}" data-v="${FEEDS[curView] ? curView : "foryou"}" data-home>${ic("home")}<span>${esc(t("Home"))}</span></button>${b("explore", "compass", "Explore")}<button class="bn" data-search aria-label="${esc(t("Search"))}"><span class="bn-plus"><i>${ic("search")}</i></span></button>${b("downloads", "down", "Downloads")}${b("me", "user", "Profile")}`;
}
$("#bottom").addEventListener("click", (e) => {
  if (e.target.closest("[data-search]")) return nav.openSearch();
  const v = e.target.closest("[data-v]");
  if (v) showView(v.dataset.v);
});
function paintChrome() { paintTop(); paintSide(); paintBottom(); paintPill(); }

// ---------- downloads pill ----------
let pillIdle = false;
function paintPill() {
  const pill = $("#dlpill");
  const total = jobs.length, act = activeJobs();
  if (!total || (pillIdle && !act) || curView === "downloads") { pill.hidden = true; return; }
  const done = total - act, bad = jobs.filter((j) => j.state === "bad").length;
  pill.hidden = false;
  pill.innerHTML = `<button class="dl-head" data-dlopen>${act ? '<i class="mini-spin"></i>' : ic(bad ? "info" : "check")}<b>${esc(act ? t("Saving {a} of {b}", { a: Math.min(done + 1, total), b: total }) : bad ? t("{n} failed", { n: bad }) : t("Downloads finished"))}</b><span>${ic("up")}</span></button><div class="dl-bar"><i style="width:${(done / total) * 100}%"></i></div>`;
}
$("#dlpill").addEventListener("click", () => showView("downloads"));
let pillT = 0;
on("jobs", (d) => { pillIdle = !!(d && d.idle); clearTimeout(pillT); pillT = setTimeout(() => { paintPill(); paintSide(); paintBottom(); }, 60); });
on("job", () => { clearTimeout(pillT); pillT = setTimeout(() => { paintPill(); paintSide(); paintBottom(); }, 120); });
on("follow", () => paintSide());

// ---------- previous / next (wide screens) ----------
$("#updown").innerHTML = `<button data-go="-1" aria-label="${esc(t("Previous video"))}">${ic("up")}</button><button data-go="1" aria-label="${esc(t("Next video"))}">${ic("dn")}</button>`;
$("#updown").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); const F = activeFeed(); if (b && F) F.go(Number(b.dataset.go)); });
function paintUpDown() {
  const F = activeFeed();
  $("#updown").hidden = !F;
  const up = $("#updown [data-go='-1']");
  if (up) up.disabled = !F || F.cur <= 0;
}
on("current", ({ F, g }) => {
  paintUpDown();
  if (F !== activeFeed()) return;
  const a = $("#ambient");
  if (!settings.glow) return a.classList.remove("on");
  // The glow is a big blurred picture: a new one is made after the swipe has come to rest – blurring it in the middle of
  // the scrolling animation made the scrolling stutter
  const set = (u) => { if (u && activeFeed() === F && F.nodes[F.cur] && F.nodes[F.cur].g === g) { a.style.backgroundImage = `url("${u.replace(/"/g, "%22")}")`; a.classList.add("on"); } };
  if (!g.poster) return;
  clearTimeout(glowT);
  glowT = setTimeout(() => (isRgPic(g.poster) && imgViaBackend ? imgData(g.poster).then(set) : set(g.poster)), 450);
});
let glowT = 0;
on("settings", () => { if (!settings.glow) $("#ambient").classList.remove("on"); });

// ---------- clear display: only the video ----------
function setClear(on) {
  document.body.classList.toggle("is-clear", on);
  $("#unclear").hidden = !on;
  if (on) toast(t("Clear display – press C or the eye to bring the buttons back"));
}
$("#unclear").innerHTML = ic("eyeoff");
$("#unclear").setAttribute("aria-label", t("Show the buttons again"));
$("#unclear").addEventListener("click", () => setClear(false));

// ---------- keys ----------
addEventListener("keydown", (e) => {
  // Only fields you type into keep the keys (a volume slider or a switch that was clicked last must not swallow ↑ ↓ and the space bar)
  if (e.target.closest && e.target.closest("input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable]")) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if ((k === " " || k.startsWith("Arrow") || k === "PageDown" || k === "PageUp") && e.target.blur && e.target !== document.body && !(topLayer() && topLayer().kind === "modal")) e.target.blur(); // (a focused slider or button would also act on the key)
  if (k === "Escape") { if (layerCount()) closeTop(); else if (document.body.classList.contains("is-clear")) setClear(false); return; }
  const top = topLayer();
  if (top && top.kind === "modal") return;
  if (k === "?") return openKeys();
  if (k === "/") { e.preventDefault(); return nav.openSearch(); }
  const F = activeFeed();
  if (!F) return;
  const n = F.node();
  if (k === "ArrowDown" || k === "j" || k === "PageDown") { e.preventDefault(); F.go(1); }
  else if (k === "ArrowUp" || k === "k" || k === "PageUp") { e.preventDefault(); F.go(-1); }
  else if (k === " ") { e.preventDefault(); if (settings.space === "next") F.go(e.shiftKey ? -1 : 1); else F.togglePlay(); }
  else if (k === "m") setMuted(!muted);
  else if (k === "l") F.like();
  else if (k === "s" || k === "d") F.save();
  else if (k === "ArrowRight") { e.preventDefault(); F.seek(5); }
  else if (k === "ArrowLeft") { e.preventDefault(); F.seek(-5); }
  else if (k === "c") setClear(!document.body.classList.contains("is-clear"));
  else if (k === "z") toggleFull();
  else if (k === "a") cycleFrame();
  else if (k === "b" && !isPhone()) nav.toggleSide();
  else if (k === "f" && n && !n.g.stash) { const now = setFollow(n.g.user, !isFollowing(n.g.user)); toast(now ? t("Following @{u}", { u: n.g.user }) : t("Unfollowed @{u}", { u: n.g.user })); }
  else if (k === "p" && n) n.g.stash ? n.g.pid && openPerformer(n.g.pid, n.g.user, n.g.img) : openProfile(n.g.user);
  else if (k === "." && n) F.menu();
});
// the first touch or key gives the browser its "user activation": sound on
for (const ev of ["pointerdown", "touchend", "click", "keydown"]) addEventListener(ev, unlockSound, true);
// another tab or app in front: pause; back again: go on – but only if it was playing (a video you paused stays paused)
let resumeAfter = false;
document.addEventListener("visibilitychange", () => {
  const F = activeFeed();
  const v = F && F.node() && F.node().video;
  if (document.hidden) { resumeAfter = !!(v && !v.paused); if (v) v.pause(); }
  else if (v && resumeAfter) v.play().catch(() => {});
});

// RedGifs pictures: those marked data-pic come through the backend (Stash doesn't let the page load them itself);
// one that fails directly (data-fb) switches every later one to the backend too. A picture that can't load at all
// is hidden – never the browser's "broken picture" box.
const fillPic = (el) => {
  const u = el.dataset.pic;
  if (!u || el.dataset.picDone) return;
  el.dataset.picDone = "1";
  imgData(u).then((d) => { if (d) el.src = d; else el.style.visibility = "hidden"; });
};
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
  if (n.nodeType !== 1) return;
  if (n.tagName === "IMG") fillPic(n);
  else if (n.querySelectorAll) n.querySelectorAll("img[data-pic]").forEach(fillPic);
}))).observe(document.body, { childList: true, subtree: true });
document.addEventListener("error", (e) => {
  const el = e.target;
  if (!el || el.tagName !== "IMG") return;
  el.style.visibility = "hidden";
  const u = el.dataset.fb;
  if (!u || el.dataset.fbDone || !isRgPic(u)) return;
  el.dataset.fbDone = "1";
  useBackendPics();
  imgData(u).then((d) => { if (d) { el.src = d; el.style.visibility = ""; } });
}, true);
// a round picture: hide the letter once the picture is there
document.addEventListener("load", (e) => {
  const el = e.target;
  if (el && el.tagName === "IMG" && el.src !== BLANK && el.parentElement && el.parentElement.classList.contains("av")) el.parentElement.classList.add("has-img");
}, true);

addEventListener("resize", () => { const F = activeFeed(); if (F && F.cur >= 0) F.host.scrollTop = F.cur * F.host.clientHeight; });

// ---------- start ----------
showView("foryou", { keep: true });
if (restoredN) toast(t("Your likes and settings came back from the backup file"));
