// RedTok – the vertical feed: one video per screen, swipe or scroll to the next, like TikTok.
// A feed shows one source (see data.js). Several feeds can exist at once (For You, Following, a list opened from a
// grid …) – only the one on top plays, and only that one holds video elements beyond a few.

import { $, esc, t, fmt, ago, mmss, ic, isPhone, nav, on, emit, img } from "./core.js";
import { settings, saveSettings, isLiked, setLiked, isFollowing, setFollow, userPic, markWatched, markSeen, refetchGif, stashStart, isHidden, viewed } from "./data.js";
import { enqueue, jobOf, isSaved } from "./dl.js";

const feeds = new Set();
let current = null;
export const activeFeed = () => current;
// the tab goes to the background: what you watched so far counts
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && current && current.flush) current.flush(); });
export let muted = !settings.sound;

// ---------- small shared pieces ----------
// a round picture with the first letter underneath (shown until the picture is there, or when it can't load)
export function av(url, name, cls = "") {
  return `<span class="av ${cls}"><b>${esc(String(name || "?").replace(/^@/, "")[0] || "?")}</b>${img(url, "", ' loading="lazy"')}</span>`;
}
export const tick = () => `<i class="vtick" title="${esc(t("Verified"))}">${ic("verified")}</i>`;
// The shape of the player on a PC (Settings → Player shape): auto = tall frame, wide videos grow; portrait; landscape (16:9); window (all the room)
export const FRAMES = ["auto", "portrait", "landscape", "window"];
const frameOf = () => (isPhone() ? "auto" : FRAMES.includes(settings.frame) ? settings.frame : "auto");
const fillOf = (g) => settings.fit === "fill" || (settings.fit === "auto" && g.h > g.w * 1.15 && ["auto", "portrait"].includes(frameOf()));
// A wide video (16:9 …) grows to its own shape when you scroll to it – on a PC, where there is room for it (Settings → Enlarge wide videos)
const wideOf = (g) => frameOf() === "auto" && settings.wide !== false && !isPhone() && g.w >= g.h * 1.2 && g.h > 0;

// ---------- video elements ----------
// Phones allow sound only for a <video> that a tap has started: the first tap "blesses" a few elements, and the
// feeds re-use exactly those (new src, same element) instead of making new ones.
const pool = [];
let blessed = false;
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
function newVideo() {
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.disableRemotePlayback = true;
  return v;
}
export function bless() {
  if (blessed) return;
  blessed = true;
  for (let i = 0; i < 6; i++) {
    const v = newVideo();
    v.muted = false;
    v.src = SILENT;
    v.play().catch(() => {});
    pool.push(v);
  }
}
const playUrl = (g) => (g.stash ? g.hd : settings.playq === "sd" || (settings.playq !== "hd" && isPhone()) ? g.sd : g.hd);

// ---------- one item ----------
function itemHtml(g) {
  const lk = isLiked(g.id);
  const pic = g.stash ? g.img : userPic(g.user);
  const tags = (g.tags || []).map((x, k) => `<a href="#" data-act="tag" data-tag="${esc(x)}"${g.tagIds ? ` data-tid="${esc(g.tagIds[k])}"` : ""}>#${esc(String(x).replace(/\s+/g, ""))}</a>`).join(" ");
  const long = (g.desc || "").length + (g.tags || []).join(" ").length > 80;
  const fol = !g.stash && isFollowing(g.user);
  const snd = g.stash ? (g.studio || g.desc || t("My Stash")) : g.audio ? t("Original sound – {u}", { u: g.user }) : t("No sound");
  const save = g.stash
    ? `<button class="act" data-act="openstash" aria-label="${esc(t("Open in Stash"))}"><span class="ic">${ic("open")}</span><span class="n">${esc(t("Open"))}</span></button>`
    : `<button class="act save" data-act="dl" aria-label="${esc(t("Save to your library"))}"><span class="ic">${ic("down")}<i class="ring"></i></span><span class="n">${esc(t("Save"))}</span></button>`;
  return `<div class="col"><div class="card${fillOf(g) ? " is-fill" : ""}"${g.h > 0 && g.w >= g.h * 1.2 ? ` style="--ar:${(g.w / g.h).toFixed(4)}"` : ""}>
      ${img(g.poster || g.thumb, "bg")}
      ${img(g.poster || g.thumb, "poster") || '<img class="poster" alt="">'}
      <div class="shade"></div>
      <div class="hit" data-act="tap"></div>
      <div class="playbig">${ic("play")}</div>
      <div class="loading"><i></i></div>
      <div class="flash"></div>
      <div class="ctl ctl-l"><button class="cbtn vol" data-act="mute" aria-label="${esc(t("Sound"))}">${ic(muted ? "mute" : "vol")}</button><input class="volr" type="range" min="0" max="1" step="0.05" value="${settings.volume}" aria-label="${esc(t("Volume"))}"><span class="unmute" data-act="mute">${esc(t("Tap to unmute"))}</span></div>
      <div class="ctl ctl-r"><button class="cbtn frm" data-act="frame" aria-label="${esc(t("Player shape"))}" title="${esc(t("Player shape"))} (A)">${ic("fit")}</button><button class="cbtn fs" data-act="full" aria-label="${esc(t("Fullscreen"))}" title="${esc(t("Fullscreen"))} (Z)">${ic("full")}</button><span class="spd"${settings.speed === 1 ? " hidden" : ""}>${settings.speed}×</span><button class="cbtn" data-act="menu" aria-label="${esc(t("More options"))}">${ic("more")}</button></div>
      <div class="info">
        <div class="who"><a href="#" data-act="profile">${g.stash ? "" : "@"}${esc(g.user)}</a>${g.verified ? tick() : ""}${g.date ? `<span class="when"> · ${esc(ago(g.date))}</span>` : ""}</div>
        <div class="desc">${g.desc ? `<span>${esc(g.desc)}</span> ` : ""}${tags}</div>
        ${long ? `<button class="moretxt" data-act="moretxt">${esc(t("more"))}</button>` : ""}
        <button class="sndrow" data-act="details">${ic("music")}<span class="marq"><span>${esc(snd)}</span></span></button>
      </div>
      <span class="time"></span>
      <div class="prog" data-act="seek"><i></i><b></b></div>
    </div>
    <div class="rail">
      <div class="avatar"><a href="#" data-act="profile" aria-label="${esc(t("Profile"))}">${av(pic, g.user)}</a>${g.stash ? "" : `<button class="plus${fol ? " is-on" : ""}" data-act="follow" aria-label="${esc(t("Follow"))}">${ic(fol ? "check" : "plus")}</button>`}</div>
      <button class="act like${lk ? " is-on" : ""}" data-act="like" aria-label="${esc(t("Like"))}"><span class="ic">${ic("heart")}</span><span class="n">${fmt((g.likes || 0) + (lk ? 1 : 0))}</span></button>
      ${save}
      <button class="act" data-act="share" aria-label="${esc(t("Share"))}"><span class="ic">${ic("share")}</span><span class="n">${esc(t("Share"))}</span></button>
      <button class="disc" data-act="details" aria-label="${esc(t("About this video"))}"><span class="disc-in">${av(pic, g.user)}</span></button>
    </div></div>`;
}
function paintSave(el, g) {
  const b = el.querySelector(".act.save");
  if (!b) return;
  const j = jobOf(g.id);
  const run = j && (j.state === "queued" || j.state === "run");
  const done = isSaved(g.id);
  b.classList.toggle("is-run", !!run);
  b.classList.toggle("is-done", !run && done);
  b.classList.toggle("is-bad", !run && !done && !!j && j.state === "bad");
  b.querySelector(".ic").firstElementChild.outerHTML = ic(done && !run ? "check" : "down");
  b.querySelector(".n").textContent = run ? t("Saving") : done ? t("Saved") : t("Save");
}

// ---------- the feed ----------
export function createFeed(host, S, opts = {}) {
  const F = { host, S, nodes: [], cur: -1, active: false, loading: false, opts };
  feeds.add(F);
  host.classList.add("feed");
  host.tabIndex = -1;
  host.innerHTML = "";
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && F.active) setCurrent(Number(e.target.dataset.i)); }), { root: host, threshold: 0.6 });

  function add(list) {
    const frag = document.createDocumentFragment();
    list.forEach((g) => {
      const el = document.createElement("section");
      el.className = "item";
      el.dataset.i = F.nodes.length;
      el.dataset.gid = g.id;
      el.dataset.user = String(g.user).toLowerCase();
      el.innerHTML = itemHtml(g);
      paintSave(el, g);
      F.nodes.push({ g, el, video: null });
      frag.appendChild(el);
      io.observe(el);
    });
    const tail = host.querySelector(".more, .endcard, .feed-msg");
    tail ? host.insertBefore(frag, tail) : host.appendChild(frag);
  }
  function msg(html) {
    host.querySelector(".feed-msg")?.remove();
    host.insertAdjacentHTML("beforeend", `<div class="feed-msg">${html}</div>`);
  }
  function tail() {
    host.querySelectorAll(".more, .endcard, .feed-msg").forEach((x) => x.remove());
    if (!F.nodes.length) {
      if (S.done) {
        const e = opts.empty || {};
        msg(`<div class="em-ic">${ic(e.icon || "film")}</div><b>${esc(e.title || t("Nothing here"))}</b><span>${esc(e.text || "")}</span>${e.btn ? `<button class="btn is-red" data-act="emptybtn">${esc(e.btn)}</button>` : ""}`);
      }
      return;
    }
    const m = document.createElement("div");
    if (S.done) {
      m.className = "endcard";
      m.innerHTML = `<div class="em-ic">${ic("check")}</div><b>${esc(t("You're all caught up"))}</b><span>${esc(t("That was everything here."))}</span><button class="btn" data-act="totop">${ic("up")}${esc(t("Back to the top"))}</button>`;
    } else {
      m.className = "more";
      m.innerHTML = '<div class="spin"></div>';
    }
    host.appendChild(m);
  }
  async function loadMore(first) {
    if (F.loading || S.done) return;
    F.loading = true;
    if (first && !F.nodes.length) msg('<div class="spin"></div>');
    try {
      await S.more();
    } catch (e) {
      if (!F.nodes.length) msg(`<div class="em-ic">${ic("refresh")}</div><b>${esc(t("Couldn't load"))}</b><span>${esc(e.message || e)}</span><button class="btn is-red" data-act="retry">${esc(t("Try again"))}</button>`);
      else nav.toast && nav.toast(t("Couldn't load more: {e}", { e: e.message || e }), true);
      F.loading = false;
      return;
    }
    F.loading = false;
    tail();
    // a short first page on a tall screen: keep going
    if (F.active && F.cur >= F.nodes.length - 3) loadMore();
  }
  const onItems = (list) => { if (list.length) add(list); tail(); if (F.active && F.cur < 0 && F.nodes.length) setCurrent(Math.round(host.scrollTop / (host.clientHeight || 1)), true); };
  S.on(onItems);
  if (S.items.length) { add(S.items); tail(); } else loadMore(true);

  // ---------- which video plays ----------
  function setCurrent(i, force) {
    if (!F.nodes[i] || (i === F.cur && !force)) return;
    const prev = F.cur;
    if (prev !== i && F.nodes[prev]) report(F.nodes[prev]);
    F.cur = i;
    F.nodes.forEach((n, k) => n.el.querySelector(".card").classList.toggle("is-wide", k === i && wideOf(n.g)));
    F.nodes.forEach((n, k) => { if (k < i - 1 || k > i + 2) release(n); });
    if (prev !== i && F.nodes[prev]) pause(F.nodes[prev]);
    const n = F.nodes[i];
    if (F.active) {
      n.pt = 0; n.since = performance.now();
      ensure(n);
      play(n);
      // The next two are warmed up (one only when the phone asks to save data) – but only once the swipe has come to
      // rest: starting two more decoders while the page is still scrolling made the scrolling stutter on a PC
      clearTimeout(F.settleT);
      clearTimeout(F.settleT2);
      F.settleT = setTimeout(() => {
        if (!F.active || F.cur !== i) return;
        prime(F.nodes[i + 1]);
        if (!(navigator.connection && navigator.connection.saveData)) F.settleT2 = setTimeout(() => F.active && F.cur === i && prime(F.nodes[i + 2]), 300);
      }, 380);
      clearTimeout(F.st);
      F.st = setTimeout(() => F.nodes[F.cur] === n && F.active && markSeen(n.g), 700);
      clearTimeout(F.wt);
      F.wt = setTimeout(() => F.nodes[F.cur] === n && F.active && markWatched(n.g), 2500);
      emit("current", { F, g: n.g, i });
    }
    if (i >= F.nodes.length - 5) loadMore();
  }
  // Warm up a video before you get to it, so the swipe only has to press play – like TikTok. "preload" alone isn't
  // enough on phones: Safari loads nothing and Chrome on Android often only the first bytes until play() is called.
  // A muted play, stopped on the first frame, decodes that frame and keeps the browser filling the buffer.
  function prime(n) {
    if (!n || n.warm) return;
    const v = ensure(n, true);
    n.warm = true;
    v.preload = "auto";
    if (F.nodes[F.cur] === n) return;
    v.muted = true;
    const stop = () => {
      if (F.nodes[F.cur] === n && F.active) { v.muted = muted; return; }
      v.pause();
      if (v.currentTime > 0.3) try { v.currentTime = n.start || 0; } catch (e) { /* not ready */ }
    };
    let done = false;
    const once = () => { if (!done) { done = true; stop(); } };
    const p = v.play();
    // stop on the first shown frame – or a moment later (videos off screen may never report a frame)
    if (p && p.then) p.then(() => { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(once); setTimeout(once, 150); }).catch(() => {});
  }
  function ensure(n, preloadOnly) {
    if (n.video) return n.video;
    const v = pool.pop() || newVideo();
    const card = n.el.querySelector(".card");
    v.className = "";
    v.loop = !settings.autonext;
    v.muted = muted;
    v.volume = settings.volume;
    v.preload = preloadOnly ? "metadata" : "auto";
    if (n.start == null) n.start = stashStart(n.g);
    v.src = playUrl(n.g) + (n.start ? "#t=" + n.start : "");
    v.playbackRate = v.defaultPlaybackRate = settings.speed || 1;
    v.onplaying = () => { v.classList.add("on"); card.classList.remove("is-wait", "is-paused"); };
    // the first frame replaces the poster as soon as it is decoded (no fade while you swipe onto it)
    v.onloadeddata = () => v.classList.add("on");
    v.onwaiting = () => card.classList.add("is-wait");
    v.oncanplay = () => card.classList.remove("is-wait");
    v.ontimeupdate = () => {
      // played time for the algorithm: only while this is the video on screen (a warmed-up next video doesn't count)
      if (n.lt != null && F.active && F.nodes[F.cur] === n && !v.paused) { const dt = v.currentTime - n.lt; if (dt > 0 && dt < 1.5) n.pt = (n.pt || 0) + dt; }
      n.lt = v.currentTime;
      if (!v.duration) return;
      n.el.querySelector(".prog b").style.width = (v.currentTime / v.duration) * 100 + "%";
      n.el.querySelector(".time").textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
    };
    v.onended = () => { if (settings.autonext && F.nodes[F.cur] === n && F.active) go(1); };
    v.onerror = () => failed(n);
    n.el.querySelector(".poster").after(v);
    n.video = v;
    return v;
  }
  function release(n) {
    const v = n.video;
    if (!v) return;
    v.pause();
    v.onplaying = v.onloadeddata = v.onwaiting = v.oncanplay = v.ontimeupdate = v.onended = v.onerror = null;
    n.warm = false;
    v.removeAttribute("src");
    try { v.load(); } catch (e) { /* fine */ }
    v.remove();
    n.video = null;
    if (pool.length < 8) pool.push(v);
  }
  // you left this video: tell the algorithm how long you really watched (a flick past on the way somewhere doesn't count)
  function report(n) {
    if (!n || n.since == null) return;
    const seen = performance.now() - n.since, pt = n.pt || 0;
    n.since = null; n.pt = 0;
    if (seen < 450 && pt < 0.4) return;
    viewed(n.g, pt, S.spec.t === "foryou");
  }
  F.flush = () => { const n = F.nodes[F.cur]; if (n && n.since != null) { report(n); n.since = performance.now(); } };
  function pause(n) { if (n.video) n.video.pause(); }
  function play(n) {
    const v = n.video;
    if (!v) return;
    const card = n.el.querySelector(".card");
    v.muted = muted;
    v.volume = settings.volume;
    v.loop = !settings.autonext;
    v.playbackRate = settings.speed || 1;
    v.preload = "auto";
    card.classList.remove("is-paused");
    const p = v.play();
    if (p && p.catch) p.catch((e) => {
      if (e && e.name === "AbortError") return;
      // the browser wants a click before sound: play muted and say so
      if (!v.muted) { v.muted = true; card.classList.add("needs-tap"); v.play().catch(() => card.classList.add("is-paused")); }
      else card.classList.add("is-paused");
    });
  }
  async function failed(n) {
    if (!n.video || !n.video.getAttribute("src")) return;
    // links of RedGifs can move: ask for the video again once
    if (!n.g.stash && !n.refetched) {
      n.refetched = true;
      try {
        const f = await refetchGif(n.g.id);
        if (f && (f.hd !== n.g.hd || f.sd !== n.g.sd)) {
          Object.assign(n.g, { hd: f.hd, sd: f.sd, poster: f.poster || n.g.poster });
          release(n);
          if (F.nodes[F.cur] === n && F.active) { ensure(n); play(n); }
          return;
        }
      } catch (e) { n.why = e.message; }
    }
    const card = n.el.querySelector(".card");
    if (card.querySelector(".err")) return;
    card.insertAdjacentHTML("beforeend", `<div class="err"><b>${esc(t("Couldn't play this video"))}</b>${n.why ? `<span>${esc(n.why)}</span>` : ""}<div><button class="btn" data-act="reload">${esc(t("Try again"))}</button><button class="btn is-red" data-act="skip">${esc(t("Next video"))}</button></div></div>`);
  }
  function go(d) {
    const i = Math.max(0, Math.min(F.nodes.length - 1 + (S.done ? 1 : 0), (F.cur < 0 ? 0 : F.cur) + d));
    host.scrollTo({ top: i * host.clientHeight, behavior: "smooth" });
  }
  function togglePlay(n = F.nodes[F.cur]) {
    const v = n && n.video;
    if (!v) return;
    const card = n.el.querySelector(".card");
    const f = n.el.querySelector(".flash");
    if (v.paused) { v.play().catch(() => {}); card.classList.remove("is-paused"); f.innerHTML = ic("play"); }
    else { v.pause(); card.classList.add("is-paused"); f.innerHTML = ic("pause"); }
    f.classList.remove("go");
    void f.offsetWidth;
    f.classList.add("go");
  }
  function like(n = F.nodes[F.cur], onlyAdd, e) {
    if (!n) return;
    if (e) {
      const card = n.el.querySelector(".card");
      const r = card.getBoundingClientRect();
      const b = document.createElement("div");
      b.className = "burst";
      b.innerHTML = ic("heart");
      b.style.left = e.clientX - r.left + "px";
      b.style.top = e.clientY - r.top + "px";
      b.style.setProperty("--rot", Math.round(Math.random() * 40 - 20) + "deg");
      card.appendChild(b);
      setTimeout(() => b.remove(), 1000);
    }
    const has = isLiked(n.g.id);
    if (has && onlyAdd) return;
    setLiked(n.g, !has);
  }
  function save(n = F.nodes[F.cur]) {
    if (!n || n.g.stash) return;
    if (isSaved(n.g.id)) return nav.toast(t("Already saved"), false, { label: t("Downloads"), fn: () => nav.openDownloads() });
    const j = jobOf(n.g.id);
    if (j && (j.state === "queued" || j.state === "run")) return nav.toast(t("Already downloading"));
    enqueue([n.g]);
  }
  function seek(d) {
    const v = F.nodes[F.cur] && F.nodes[F.cur].video;
    if (v && v.duration) v.currentTime = Math.max(0, Math.min(v.duration - 0.1, v.currentTime + d));
  }

  // ---------- taps, buttons ----------
  let tapTimer = 0, swallow = false;
  host.addEventListener("click", (e) => {
    if (swallow) { swallow = false; e.preventDefault(); return; }
    const a = e.target.closest("[data-act]");
    if (!a || a.matches("input")) return;
    e.preventDefault();
    const act = a.dataset.act;
    if (act === "retry") return loadMore(true);
    if (act === "emptybtn") return opts.empty && opts.empty.fn && opts.empty.fn();
    if (act === "totop") return host.scrollTo({ top: 0, behavior: "smooth" });
    const item = a.closest(".item");
    const n = item && F.nodes[Number(item.dataset.i)];
    if (!n) return;
    const g = n.g;
    // the first click also unlocks sound that the browser held back
    if (!muted && n.video && n.video.muted && act !== "mute") { n.video.muted = false; n.el.querySelector(".card").classList.remove("needs-tap"); }
    switch (act) {
      case "tap":
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; return like(n, true, e); }
        tapTimer = setTimeout(() => { tapTimer = 0; togglePlay(n); }, 230);
        return;
      case "mute": return setMuted(!muted);
      case "full": return nav.toggleFull && nav.toggleFull();
      case "like": return like(n);
      case "dl": return save(n);
      case "openstash": return nav.openInStash(g);
      case "share": case "menu": return nav.openShare(g, F);
      case "frame": return nav.cycleFrame();
      case "details": return nav.openDetails(g);
      case "follow": {
        if (isFollowing(g.user)) return nav.openProfile(g.user);
        setFollow(g.user, true);
        return nav.toast(t("Following @{u}", { u: g.user }));
      }
      case "profile":
        if (g.stash) return g.pid ? nav.openPerformer(g.pid, g.user, g.img) : nav.toast(t("No performer on this scene"));
        return nav.openProfile(g.user);
      case "tag":
        if (g.stash) return a.dataset.tid ? nav.openStashTag(a.dataset.tid, a.dataset.tag) : null;
        return nav.openSearch(a.dataset.tag, "videos", true);
      case "moretxt": {
        const info = a.closest(".info");
        const open = info.classList.toggle("is-open");
        a.textContent = open ? t("less") : t("more");
        return;
      }
      case "reload": { a.closest(".err").remove(); n.refetched = false; release(n); ensure(n); play(n); return; }
      case "skip": return go(1);
    }
  });
  host.addEventListener("input", (e) => {
    if (e.target.matches(".volr")) setVolume(Number(e.target.value));
  });

  // long press: the options sheet; a swipe to the left: the creator's profile (phones)
  let press = null;
  host.addEventListener("pointerdown", (e) => {
    const bar = e.target.closest(".prog");
    if (bar) return seekDrag(e, bar);
    if (!e.target.closest(".hit")) return;
    const item = e.target.closest(".item");
    const n = item && F.nodes[Number(item.dataset.i)];
    if (!n) return;
    press = { x: e.clientX, y: e.clientY, n, id: e.pointerId, touch: e.pointerType !== "mouse" };
    press.timer = setTimeout(() => {
      if (!press) return;
      press.long = true;
      swallow = true;
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* no */ }
      nav.openShare(n.g, F);
    }, 520);
  });
  host.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.abs(e.clientX - press.x) > 12 || Math.abs(e.clientY - press.y) > 12) clearTimeout(press.timer);
  });
  const endPress = (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.long && press.touch && dx < -70 && Math.abs(dy) < 60 && e.type === "pointerup") {
      swallow = true;
      setTimeout(() => (swallow = false), 400);
      const g = press.n.g;
      g.stash ? g.pid && nav.openPerformer(g.pid, g.user, g.img) : nav.openProfile(g.user);
    }
    if (press.long) setTimeout(() => (swallow = false), 400);
    press = null;
  };
  host.addEventListener("pointerup", endPress);
  host.addEventListener("pointercancel", endPress);
  host.addEventListener("contextmenu", (e) => { if (e.target.closest(".card")) e.preventDefault(); });

  // press and drag anywhere on the progress bar
  function seekDrag(e, bar) {
    const n = F.nodes[Number(bar.closest(".item").dataset.i)];
    if (!n || !n.video) return;
    const v = n.video, card = bar.closest(".card");
    const to = (ev) => {
      const r = bar.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      if (v.duration) {
        v.currentTime = f * v.duration;
        bar.querySelector("b").style.width = f * 100 + "%";
        card.querySelector(".time").textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
      }
    };
    e.preventDefault();
    e.stopPropagation();
    try { bar.setPointerCapture(e.pointerId); } catch (x) { /* window listeners below */ }
    card.classList.add("is-drag");
    to(e);
    const mv = (ev) => to(ev);
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      card.classList.remove("is-drag");
      swallow = true;
      setTimeout(() => (swallow = false), 50);
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  }

  // one wheel notch = one video
  let wheelAt = 0;
  host.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;
    const desc = e.target.closest(".info.is-open");
    if (desc && desc.scrollHeight > desc.clientHeight) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 450 || Math.abs(e.deltaY) < 6) return;
    wheelAt = now;
    go(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // ---------- life ----------
  F.startAt = opts.index != null ? opts.index : null;
  F.activate = () => {
    if (current && current !== F) current.deactivate();
    F.active = true;
    current = F;
    host.hidden = false;
    let i;
    if (F.startAt != null) {
      i = F.startAt;
      F.startAt = null;
      host.style.scrollBehavior = "auto";
      host.scrollTop = i * host.clientHeight;
      requestAnimationFrame(() => (host.style.scrollBehavior = ""));
    } else i = F.cur >= 0 ? F.cur : Math.round(host.scrollTop / (host.clientHeight || 1));
    if (F.nodes.length) setCurrent(Math.min(i, F.nodes.length - 1), true);
  };
  F.deactivate = (sleep) => {
    F.active = false;
    if (current === F) current = null;
    if (F.nodes[F.cur]) { report(F.nodes[F.cur]); pause(F.nodes[F.cur]); }
    clearTimeout(F.wt);
    if (sleep) F.nodes.forEach(release);
  };
  F.destroy = () => {
    F.deactivate(true);
    S.off(onItems);
    io.disconnect();
    feeds.delete(F);
  };
  F.go = go;
  F.togglePlay = () => togglePlay();
  F.like = () => like();
  F.save = () => save();
  F.seek = seek;
  F.node = () => F.nodes[F.cur] || null;
  F.menu = () => F.nodes[F.cur] && nav.openShare(F.nodes[F.cur].g, F);
  F.refresh = () => { F.nodes.forEach((n, k) => { const c = n.el.querySelector(".card"); c.classList.toggle("is-fill", fillOf(n.g)); c.classList.toggle("is-wide", k === F.cur && wideOf(n.g)); }); };
  return F;
}

// ---------- settings that change every feed at once ----------
export function setMuted(m) {
  muted = m;
  settings.sound = !m;
  if (!m && settings.volume < 0.05) settings.volume = 0.6;
  saveSettings();
  feeds.forEach((F) => F.nodes.forEach((n) => {
    if (n.video) { n.video.muted = m; n.video.volume = settings.volume; }
    const card = n.el.querySelector(".card");
    card.classList.remove("needs-tap");
    const b = card.querySelector(".vol");
    if (b) b.innerHTML = ic(m ? "mute" : "vol");
    const r = card.querySelector(".volr");
    if (r) r.value = m ? 0 : settings.volume;
  }));
}
export function setVolume(v) {
  settings.volume = v;
  const m = v < 0.02;
  if (m !== muted) setMuted(m);
  else saveSettings();
  feeds.forEach((F) => F.nodes.forEach((n) => { if (n.video) n.video.volume = v; }));
}
export function setSpeed(x) {
  settings.speed = x;
  saveSettings();
  feeds.forEach((F) => F.nodes.forEach((n) => {
    if (n.video) n.video.playbackRate = n.video.defaultPlaybackRate = x;
    const s = n.el.querySelector(".spd");
    s.hidden = x === 1;
    s.textContent = x + "×";
  }));
}
export function setAutoNext(on) {
  settings.autonext = on;
  saveSettings();
  feeds.forEach((F) => F.nodes.forEach((n) => { if (n.video) n.video.loop = !on; }));
}
export function setFit(mode) {
  settings.fit = mode;
  saveSettings();
  feeds.forEach((F) => F.refresh());
}
export const fitOf = fillOf;
export function setFrame(mode) {
  settings.frame = FRAMES.includes(mode) ? mode : "auto";
  saveSettings();
  document.documentElement.dataset.frame = frameOf();
  feeds.forEach((F) => F.refresh());
}
export const frameName = (m) => ({ auto: t("Auto"), portrait: t("Portrait"), landscape: t("Landscape"), window: t("Window") }[m] || m);
export function cycleFrame() {
  if (isPhone()) return;
  setFrame(FRAMES[(FRAMES.indexOf(settings.frame) + 1) % FRAMES.length]);
  nav.toast && nav.toast(t("Player shape: {s}", { s: frameName(settings.frame) }));
}
// the first touch or key anywhere gives the browser its "user activation": sound on
export function unlockSound() {
  bless();
  const F = current;
  const n = F && F.node();
  if (!muted && n && n.video && n.video.muted) { n.video.muted = false; n.el.querySelector(".card").classList.remove("needs-tap"); }
}

// ---------- keep buttons in step with what changed elsewhere ----------
const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
on("liked", ({ id }) => {
  feeds.forEach((F) => F.nodes.forEach((n) => {
    if (id && n.g.id !== id) return;
    const has = isLiked(n.g.id);
    const b = n.el.querySelector(".act.like");
    if (!b || b.classList.contains("is-on") === has) return;
    b.classList.toggle("is-on", has);
    b.querySelector(".n").textContent = fmt((n.g.likes || 0) + (has ? 1 : 0));
    if (id) { b.classList.remove("is-pop"); void b.offsetWidth; b.classList.add("is-pop"); }
  }));
});
on("follow", ({ name }) => {
  const key = String(name || "").toLowerCase();
  each(`.item[data-user="${CSS.escape(key)}"] .plus`, (b) => {
    const has = isFollowing(name);
    b.classList.toggle("is-on", has);
    b.innerHTML = ic(has ? "check" : "plus");
  });
});
on("job", ({ id }) => feeds.forEach((F) => F.nodes.forEach((n) => n.g.id === id && paintSave(n.el, n.g))));
on("data", () => feeds.forEach((F) => F.nodes.forEach((n) => paintSave(n.el, n.g))));
on("hidden", ({ name, on: hid }) => {
  const F = current, n = F && F.node();
  if (hid && n && String(n.g.user).toLowerCase() === String(name).toLowerCase()) F.go(1);
  feeds.forEach((G) => G.nodes.forEach((m) => m.el.classList.toggle("is-hidden", isHidden(m.g.user) && G.S.spec.t !== "user")));
});
