// Scene player: custom controls, timeline with thumbnails, resume, history,
// queue/random/endless, keyboard, placard with all details.

import { esc, icon, fmtDuration, store, toast, errorToast, promptDialog, confirmDialog, openDrawer } from "../ui.js";
import { t } from "../i18n.js";
import { getScene, findItems, saveActivity, addPlay, gql, pluginConfig, setPluginConfig } from "../api.js";
import { toPiece } from "../pieces.js";
import { app, go, closeOverlay, setQueueCount } from "../main.js";
import { startMini, stopMini } from "../mini.js";
import { placardHtml, bindPlacard } from "./placard.js";
import { similarScenes } from "../similar.js";
import { bestMarkers, bestMarkersNow } from "../standings.js";
import { attachHandy, interactiveConfig, saveInteractiveConfig, handyPrefs, runBackend, runBackendCached, fsSources, rememberFs, variantChoices, rememberVariant, readVariant } from "../interactive.js";
import { stackHtml, activeOf, heatBg, duplicatesOf } from "../fsvariants.js";
import { logEvent } from "../eventlog.js";
import { tierNow, ensureTiers } from "../tiers.js";
import { tierBadge } from "../versusx.js";
import { createVR, guessVR } from "../vr.js";
import { videoGlow } from "../theme.js";
import { BINS, watchRecorder, watchBins, motionBins, combine, peaks } from "../heat.js";
import { mountScenePage, bootPluginHost, isScenePluginEnabled } from "../plugin-host.js";

// Read Stash's sprite VTT: time ranges → region in the sprite image
async function loadSprites(vttUrl, spriteUrl) {
  try {
    const txt = await (await fetch(vttUrl)).text();
    const cues = [];
    const re = /(\d+):(\d+):(\d+)\.(\d+)\s+-->\s+(\d+):(\d+):(\d+)\.(\d+)\s*\n([^\n]+)/g;
    let m;
    const secs = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
    while ((m = re.exec(txt))) {
      const xywh = (m[9].match(/#xywh=(\d+),(\d+),(\d+),(\d+)/) || []).slice(1).map(Number);
      if (xywh.length === 4) cues.push({ start: secs(m[1], m[2], m[3], m[4]), end: secs(m[5], m[6], m[7], m[8]), xywh });
    }
    return cues.length ? { cues, url: spriteUrl } : null;
  } catch (e) {
    return null;
  }
}

// How the player goes on at the end: [mode, icon, label] – the button cycles through them
const PLAY_MODES = [
  ["order", "next", "In order"],
  ["shuffle", "shuffle", "Random order"],
  ["one", "repeatone", "Repeat this video"],
  ["all", "repeat", "Repeat all"],
  ["stop", "stop", "Stop at the end"],
];

// ---------- Scene covers: shown at once, saved to Stash once ----------
// Stash on Windows can't replace a cover file it has just written for up to ~2 minutes (it keeps it
// open until its next memory clean-up – "being used by another process"). So trying frames and undoing
// happens only here; Stash gets the final cover after a quiet moment or when the scene is left.
// Scene id → { stack: [earlier states], cur, saved (what Stash has), open, timer, busy, onSaved }
// state = { url (to show), blob }
const covers = new Map();
const COVER_QUIET = 6000;
const isLocked = (e) => /used by another process|being used|sharing violation/i.test((e && e.message) || "");
function scheduleCover(id, ms = COVER_QUIET) {
  const c = covers.get(id);
  if (!c) return;
  clearTimeout(c.timer);
  c.timer = setTimeout(() => saveCover(id), ms);
}
async function saveCover(id) {
  const c = covers.get(id);
  if (!c || c.busy) return;
  clearTimeout(c.timer);
  if (c.cur !== c.saved) {
    c.busy = true;
    const want = c.cur;
    try {
      if (!want.blob) throw new Error(t("The earlier cover couldn't be loaded"));
      const data = await new Promise((ok, no) => {
        const fr = new FileReader();
        fr.onload = () => ok(fr.result);
        fr.onerror = no;
        fr.readAsDataURL(want.blob);
      });
      const start = Date.now();
      for (let i = 0; c.cur === want; i++) {
        try {
          const d = await gql(`mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id paths { screenshot } } }`, { i: { id, cover_image: data } });
          c.saved = want;
          if (c.onSaved && c.cur === want) c.onSaved(d.sceneUpdate.paths.screenshot);
          break;
        } catch (e) {
          // still locked by Stash: wait quietly – the picture is already shown everywhere
          if (!isLocked(e) || Date.now() - start > 180000) throw e;
          await new Promise((r) => setTimeout(r, i < 3 ? 1000 : 3000));
        }
      }
    } catch (e) {
      errorToast(e, "Cover");
      c.cur = c.saved; // show what Stash really has
      if (c.onSaved && c.saved) c.onSaved(c.saved.url);
    }
    c.busy = false;
    if (c.cur !== c.saved) return scheduleCover(id, 300); // changed again meanwhile
  }
  if (!c.open) covers.delete(id);
}
// Closing the tab with a cover not yet in Stash: send it and ask the browser to wait
window.addEventListener("beforeunload", (e) => {
  let pending = false;
  covers.forEach((c, id) => {
    if (c.cur !== c.saved) {
      pending = true;
      saveCover(id);
    }
  });
  if (pending) e.preventDefault();
});

export async function render(host, params, query = {}) {
  document.body.classList.add("kb-noscroll");
  // A mini player ends here; back from it = continue at its spot
  const stopped = stopMini();
  // where it starts: a link with a time (?t=, e.g. a moment from Versus), back from the mini player, or where it stopped
  const handoff = Number(query.t) > 0 ? Number(query.t) : app.miniResume && app.miniResume.id === params.id ? app.miniResume.at : stopped && stopped.id === params.id ? stopped.at : null;
  app.miniResume = null;
  let mini = false; // true = the video goes on in the mini player when this closes
  host.innerHTML = `<div class="kb-stage kb-player"><div class="kb-loading">${t("Loading …")}</div></div>`;
  let x = await getScene(params.id);
  if (!x) {
    host.innerHTML = `<div class="kb-stage"><div class="kb-empty"><b>${t("This scene no longer exists")}</b><button class="kb-btn" data-close>${t("Close")}</button></div></div>`;
    host.querySelector("[data-close]").onclick = closeOverlay;
    return;
  }
  const f = x.files[0] || {};
  const setShape = (w, h) => w && h && host.querySelector(".kb-stage") && host.querySelector(".kb-stage").style.setProperty("--ar", (w / h).toFixed(4));
  const prefs = Object.assign({ volume: 0.8, muted: false, auto: true, random: false, loop: false, panel: true, heat: true }, store.get("player", {}));
  // How it goes on – one button that cycles (was: three switches Random / Endless / Loop)
  if (!prefs.mode) prefs.mode = prefs.loop ? "one" : prefs.random ? "shuffle" : prefs.auto === false ? "stop" : "order";
  const ctx = app.context || {};
  const inQueue = !!ctx.queue;

  host.innerHTML = `
    <div class="kb-stage kb-player${prefs.panel ? " has-panel" : ""}" tabindex="-1">
      <div class="kb-screen">
        <video class="kb-video" playsinline preload="auto" poster="${esc(x.paths.screenshot || "")}"></video>
        <div class="kb-bigplay" data-bigplay hidden>${icon("play")}</div>
        <div class="kb-seekflash" data-seekflash aria-hidden="true"></div>
        <div class="kb-resume-hint" data-resume hidden></div>
        <div class="kb-topbar">
          <button class="kb-btn is-icon is-ghost" data-close aria-label="${t("Close (Esc)")}" title="${t("Close (Esc)")}">${icon("back")}</button>
          <span class="kb-topbar-title">${tierBadge(tierNow("scene", x.id))}${esc(x.title || f.basename || "")}</span>
          <button class="kb-btn is-icon is-ghost" data-panel aria-label="${t("Details on/off (I)")}" title="${t("Details on/off (I)")}">${icon("info")}</button>
        </div>
        <div class="kb-controls">
          ${x.interactive && x.paths.funscript ? '<div class="kb-handy-panel" data-hpanel hidden></div>' : ""}
          <div class="kb-timeline${prefs.heat ? " has-heat" : ""}" data-timeline>
            <canvas class="kb-tl-heat" data-heat width="800" height="40" hidden></canvas>
            ${x.interactive && x.paths.interactive_heatmap ? `<img class="kb-tl-fs" src="${esc(x.paths.interactive_heatmap)}" alt="" title="${t("Funscript – how intense it gets")}" onerror="this.remove()">` : ""}
            <div class="kb-tl-buf" data-buf></div>
            <div class="kb-tl-played" data-played></div>
            <div class="kb-tl-resume" data-resmark hidden></div>
            <div class="kb-tl-knob" data-knob></div>
            <div class="kb-tl-hls" data-hls></div>
            <div class="kb-tl-mks" data-mks></div>
            <div class="kb-tl-peek" data-peek hidden><div class="kb-tl-peek-img" data-peekimg></div><span data-peektime></span></div>
          </div>
          <div class="kb-ctrl-row">
            <button class="kb-btn is-icon is-ghost" data-prev aria-label="${t("Previous (P)")}" title="${t("Previous (P)")}">${icon("prev")}</button>
            <button class="kb-btn is-icon is-ghost kb-playbtn" data-play aria-label="${t("Play/pause (Space)")}">${icon("play")}</button>
            <button class="kb-btn is-icon is-ghost" data-next aria-label="${t("Next (N)")}" title="${t("Next (N)")}">${icon("next")}</button>
            <button class="kb-btn is-icon is-ghost kb-skip kb-skip-start" data-restart aria-label="${t("From the beginning (Home)")}" title="${t("From the beginning (Home)")}">${icon("replay")}</button>
            <button class="kb-btn is-icon is-ghost kb-skip" data-skip="-10" aria-label="${t("10 seconds back")}" title="${t("10 seconds back")}">${icon("back10")}</button>
            <button class="kb-btn is-icon is-ghost kb-skip" data-skip="10" aria-label="${t("10 seconds forward")}" title="${t("10 seconds forward")}">${icon("fwd10")}</button>
            <span class="kb-time"><span data-cur>0:00</span> / <span data-dur>${fmtDuration(f.duration)}</span></span>
            ${x.interactive && x.paths.funscript ? `<button class="kb-btn is-ghost kb-toggle kb-handy" data-handy hidden>${icon("plug")}<span data-handytxt>Handy</span></button>` : ""}
            <span class="kb-spacer"></span>
            <button class="kb-btn is-ghost kb-toggle${prefs.heat ? " is-on" : ""}" data-heatbtn title="${t("Highlights: heat curve and jump marks on the timeline (J jumps to the next one)")}">${icon("bolt")}<span>${t("Highlights")}</span></button>
            <button class="kb-btn is-ghost kb-toggle kb-playmode" data-pmode></button>
            <button class="kb-btn is-icon is-ghost" data-mute aria-label="${t("Sound on/off (M)")}" title="${t("Sound on/off (M)")}"></button>
            <input class="kb-vol" type="range" min="0" max="1" step="0.02" data-vol aria-label="${t("Volume")}">
            <span class="kb-pmenu-wrap"><button class="kb-btn is-icon is-ghost" data-menubtn aria-label="${t("Quality, subtitles, speed")}" title="${t("Quality, subtitles, speed")}">${icon("sliders")}</button><div class="kb-pmenu" data-menu hidden></div></span>
            <button class="kb-btn is-icon is-ghost" data-mini aria-label="${t("Mini player – keeps playing while you browse (X)")}" title="${t("Mini player – keeps playing while you browse (X)")}">${icon("pip")}</button>
            <button class="kb-btn is-icon is-ghost" data-fs aria-label="${t("Fullscreen (F)")}" title="${t("Fullscreen (F)")}">${icon("expand")}</button>
          </div>
        </div>
      </div>
      <aside class="kb-side" data-side>${placardHtml("scene", x)}<div class="kb-upnext kb-markers" data-markers></div><div class="kb-upnext kb-queuebox" data-queuebox></div><div class="kb-upnext" data-upnext></div><div class="kb-upnext kb-similar" data-similar></div></aside>
    </div>`;

  const stage = host.querySelector(".kb-stage");
  const $ = (s) => host.querySelector(s);
  const sceneHost = document.createElement("div");
  sceneHost.className = "kb-plugin-scene-host";
  // Inside the stage so the overlay stays visible in fullscreen and above the video.
  stage.appendChild(sceneHost);
  let scenePluginsGone = false;
  let unmountScenePlugins = () => {
    scenePluginsGone = true;
  };
  mountScenePage(sceneHost, x)
    .then((unmount) => {
      if (scenePluginsGone) unmount();
      else unmountScenePlugins = unmount;
    })
    .catch((err) => console.error("[Stash UI] scene plugins", err));
  const v = $("video");
  setShape(f.width, f.height);
  v.addEventListener("loadedmetadata", () => setShape(v.videoWidth, v.videoHeight));
  v.volume = prefs.volume;
  v.muted = prefs.muted;
  v.loop = prefs.mode === "one";
  const savePrefs = () => store.set("player", prefs);

  // ---------- Source: direct stream, otherwise transcode ----------
  const streams = (x.sceneStreams || []).filter((s) => /mp4|webm/.test(s.mime_type || s.url));
  const sources = [x.paths.stream, ...streams.map((s) => s.url)].filter(Boolean);
  const picked = prefs.quality && streams.find((s) => s.label === prefs.quality);
  let srcIdx = picked ? Math.max(0, sources.indexOf(picked.url)) : 0;
  // Subtitles from Stash (served as WebVTT); the last chosen language comes on by itself
  const caps = x.paths.caption ? x.captions || [] : [];
  caps.forEach((c) => {
    const tr = document.createElement("track");
    tr.kind = "subtitles";
    tr.srclang = c.language_code;
    tr.label = c.language_code.toUpperCase() + (caps.filter((o) => o.language_code === c.language_code).length > 1 ? " (" + c.caption_type + ")" : "");
    tr.src = `${x.paths.caption}?lang=${encodeURIComponent(c.language_code)}&type=${encodeURIComponent(c.caption_type)}`;
    // Lines sit a bit higher so the control bar doesn't cover them (Chrome/Edge: via CSS in stage.css)
    if (!CSS.supports("selector(::-webkit-media-text-track-container)")) tr.addEventListener("load", () => [...(tr.track.cues || [])].forEach((c) => (c.line = -4)));
    v.appendChild(tr);
  });
  const setSubs = (i) => [...v.textTracks].forEach((tt, k) => (tt.mode = k === i ? "showing" : "disabled"));
  const subsOn = () => [...v.textTracks].findIndex((tt) => tt.mode === "showing");
  if (caps.length) {
    const want = caps.findIndex((c) => c.language_code === prefs.subs);
    setTimeout(() => setSubs(want));
  }
  function switchSource(i) {
    if (i === srcIdx) return;
    const at = v.currentTime;
    const playing = !v.paused;
    srcIdx = i;
    v.src = sources[i];
    v.currentTime = at;
    if (playing) v.play().catch(() => {});
  }
  // Menu: quality, subtitles, speed (one button instead of three – the bar is full enough)
  function menuHtml() {
    const q = [[0, t("Original (direct)")], ...streams.map((s) => [sources.indexOf(s.url), s.label])];
    const on = subsOn();
    const row = (attr, val, label, active) => `<button type="button" class="kb-pmenu-opt${active ? " is-on" : ""}" ${attr}="${val}">${active ? icon("check") : "<i></i>"}${esc(label)}</button>`;
    return `<div class="kb-pmenu-sec"><b>${t("Quality")}</b>${q.map(([i, l]) => row("data-q", i, l, i === srcIdx)).join("")}</div>` +
      `<div class="kb-pmenu-sec"><b>${t("Subtitles")}</b>${caps.length ? row("data-sub", -1, t("Off"), on < 0) + [...v.textTracks].map((tt, k) => row("data-sub", k, tt.label, on === k)).join("") : `<span class="kb-pmenu-opt is-disabled"><i></i>${t("No subtitles for this video")}</span>`}</div>` +
      (vr ? `<div class="kb-pmenu-sec"><b>VR</b><div class="kb-pmenu-speeds">${[["", t("Off"), ""], ["180", "180°", ""], ["180sbs", "180° SBS", t("180° side by side")], ["360", "360°", ""], ["360tb", "360° TB", t("360° top/bottom")], ["360sbs", "360° SBS", t("360° side by side")]].map(([m, l, title]) => `<button type="button" class="kb-chip${vr.mode === m ? " is-on" : ""}" data-vr="${m}"${title ? ` title="${esc(title)}"` : ""}>${l}</button>`).join("")}</div></div>` : "") +
      `<div class="kb-pmenu-sec"><b>${t("Speed")}</b><div class="kb-pmenu-speeds">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => `<button type="button" class="kb-chip${v.playbackRate === s ? " is-on" : ""}" data-rate="${s}">${s}×</button>`).join("")}</div></div>` +
      `<div class="kb-pmenu-sec"><button type="button" class="kb-pmenu-opt${prefs.randomStart ? " is-on" : ""}" data-randstart title="${esc(t("Every scene starts somewhere in the middle – for browsing around. Your resume points in Stash stay as they are."))}">${prefs.randomStart ? icon("check") : "<i></i>"}${t("Start at a random spot")}</button>` +
      `<button type="button" class="kb-pmenu-opt" data-addmark>${icon("drop")}${t("Add a marker here (B)")}</button></div>` +
      (canCast ? `<div class="kb-pmenu-sec"><button type="button" class="kb-pmenu-opt${casting() ? " is-on" : ""}" data-cast>${icon("cast")}${casting() ? t("Casting – choose another device") : t("Cast to TV")}</button></div>` : "");
  }
  // Cast: the browser's own device picker – Chromecast / TVs in Chrome and Edge, AirPlay in Safari
  const canCast = !!((v.remote && v.remote.prompt) || v.webkitShowPlaybackTargetPicker);
  const casting = () => !!(v.remote && v.remote.state !== "disconnected");
  function cast() {
    closeMenu();
    if (!(v.remote && v.remote.prompt)) return v.webkitShowPlaybackTargetPicker();
    v.remote.prompt().catch((e) => {
      if (e.name === "NotAllowedError" || e.name === "AbortError") return; // picker closed
      toast(e.name === "NotFoundError" ? t("No TV or Chromecast found on your network") : e.name === "NotSupportedError" ? t("This video can't be cast from this browser") : e.message, "error");
    });
  }
  if (v.remote) {
    v.remote.addEventListener("connect", () => toast(t("Playing on your TV"), "ok"));
    v.remote.addEventListener("disconnect", () => toast(t("Casting stopped")));
  }
  // VR: remembered choice for this scene, otherwise guessed from file name and tags
  const vr = createVR($(".kb-screen"), v);
  const stopGlow = videoGlow(stage, v);
  const vrSaved = store.get("vrScenes", {});
  if (vr) vr.setMode(x.id in vrSaved ? vrSaved[x.id] : guessVR(f.basename, x.tags));
  const menu = $("[data-menu]");
  const closeMenu = () => (menu.hidden = true);
  const onDocDown = (e) => {
    if (!menu.hidden && !e.target.closest(".kb-pmenu-wrap")) closeMenu();
  };
  document.addEventListener("pointerdown", onDocDown, true);
  // After picking something, the menu closes by itself once the mouse leaves it
  let menuPicked = false;
  let leaveTimer = 0;
  const wrap = menu.closest(".kb-pmenu-wrap");
  wrap.addEventListener("pointerleave", (e) => {
    if (!menuPicked || menu.hidden || e.pointerType !== "mouse") return;
    leaveTimer = setTimeout(() => {
      closeMenu();
      menuPicked = false;
    }, 280);
  });
  wrap.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("button");
    if (!b) return;
    menuPicked = true;
    if (b.dataset.q != null) {
      const i = Number(b.dataset.q);
      prefs.quality = i === 0 ? null : (streams.find((s) => s.url === sources[i]) || {}).label;
      savePrefs();
      switchSource(i);
    } else if (b.dataset.sub != null) {
      const i = Number(b.dataset.sub);
      setSubs(i);
      prefs.subs = i < 0 ? null : v.textTracks[i].language;
      savePrefs();
    } else if (b.dataset.vr != null) {
      vr.setMode(b.dataset.vr);
      store.set("vrScenes", Object.assign(store.get("vrScenes", {}), { [x.id]: b.dataset.vr }));
    } else if (b.dataset.cast != null) return cast();
    else if (b.dataset.randstart != null) {
      prefs.randomStart = !prefs.randomStart;
      savePrefs();
      toast(prefs.randomStart ? t("From the next scene on: a random spot") : t("Scenes start normally again"), "ok");
    }
    else if (b.dataset.addmark != null) {
      closeMenu();
      return addMarker();
    } else if (b.dataset.rate) v.playbackRate = v.defaultPlaybackRate = Number(b.dataset.rate); // default: survives a quality switch
    menu.innerHTML = menuHtml();
  });
  v.addEventListener("error", () => {
    if (srcIdx < sources.length - 1) {
      const at = v.currentTime;
      v.src = sources[++srcIdx];
      v.currentTime = at;
      v.play().catch(() => {});
    } else toast(t("This video can't be played here"), "error");
  });
  v.src = sources[srcIdx];

  // Resume
  const dur = f.duration || 0;
  // Random start ("just looking around"): somewhere between 5 % and 85 % – and nothing of it goes to
  // Stash: while it's on for this scene, the resume point isn't saved (the play still counts)
  // (a best moment from Versus, if this scene has one)
  const bestHere = () => {
    const b = bestMarkersNow();
    return b ? (x.scene_markers || []).filter((m) => b.has(m.id)) : [];
  };
  const randomBest = bestHere();
  const randomAt =
    prefs.randomStart && handoff == null && (randomBest.length || dur > 20)
      ? randomBest.length ? Math.max(0.01, randomBest[Math.floor(Math.random() * randomBest.length)].seconds) : dur * (0.05 + Math.random() * 0.8)
      : 0;
  let keepResume = !!randomAt;
  const resumeAt = !randomAt && handoff == null && x.resume_time && dur && x.resume_time > 5 && x.resume_time < dur * 0.95 ? x.resume_time : 0;
  if (handoff != null) v.currentTime = handoff;
  if (randomAt) {
    v.currentTime = randomAt;
    const r = $("[data-resume]");
    const res = x.resume_time > 5 && x.resume_time < dur * 0.95 ? x.resume_time : 0;
    r.innerHTML = `${t("Random spot: {time}", { time: fmtDuration(randomAt) })} <button class="kb-btn" data-fromstart>${t("From the start")}</button>${res ? ` <button class="kb-btn" data-toresume>${t("Resume at {time}", { time: fmtDuration(res) })}</button>` : ""}`;
    r.hidden = false;
    setTimeout(() => (r.hidden = true), 6000);
    // Chose the normal way after all → progress is saved again
    r.querySelector("[data-fromstart]").onclick = () => {
      v.currentTime = 0;
      keepResume = false;
      r.hidden = true;
    };
    if (res)
      r.querySelector("[data-toresume]").onclick = () => {
        v.currentTime = res;
        keepResume = false;
        r.hidden = true;
      };
  }
  if (resumeAt) {
    v.currentTime = resumeAt;
    const r = $("[data-resume]");
    r.innerHTML = `${t("Resume at {time}", { time: fmtDuration(resumeAt) })} <button class="kb-btn" data-fromstart>${t("From the start")}</button>`;
    r.hidden = false;
    setTimeout(() => (r.hidden = true), 6000);
    r.querySelector("[data-fromstart]").onclick = () => {
      v.currentTime = 0;
      r.hidden = true;
    };
    const mark = $("[data-resmark]");
    mark.hidden = false;
    mark.style.left = (resumeAt / dur) * 100 + "%";
  }
  v.play().catch(() => ($("[data-bigplay]").hidden = false));

  // ---------- History ----------
  const watch = watchRecorder(x.id, dur);
  let playedSec = 0;
  let lastTick = null;
  let counted = false;
  let lastSave = 0;
  const flushActivity = (force) => {
    if (!playedSec && !force) return;
    const p = playedSec;
    playedSec = 0;
    lastSave = Date.now();
    watch.flush();
    saveActivity(x.id, keepResume ? null : v.currentTime >= dur * 0.98 ? 0 : v.currentTime, p).catch(() => {});
  };
  v.addEventListener("timeupdate", () => {
    const now = performance.now();
    if (!v.paused && lastTick != null) {
      const sec = Math.min(1, (now - lastTick) / 1000) * v.playbackRate;
      playedSec += sec;
      watch.played(v.currentTime, sec);
    }
    lastTick = now;
    if (!counted && (v.currentTime > Math.min(15, dur * 0.1) || playedSec > 10)) {
      counted = true;
      addPlay(x.id).catch(() => {});
    }
    if (Date.now() - lastSave > 10000) flushActivity();
    paintTime();
  });
  v.addEventListener("pause", () => {
    lastTick = null;
    flushActivity(true);
    syncPlay();
    wake(); // show the controls right away (on touch screens there's no mouse movement that would)
  });
  v.addEventListener("play", syncPlay);
  v.addEventListener("progress", paintBuffer);

  // ---------- Timeline ----------
  const tl = $("[data-timeline]");
  function paintTime() {
    const d = v.duration || dur || 1;
    $("[data-played]").style.width = (v.currentTime / d) * 100 + "%";
    $("[data-knob]").style.left = (v.currentTime / d) * 100 + "%";
    $("[data-cur]").textContent = fmtDuration(v.currentTime);
    if (v.duration) $("[data-dur]").textContent = fmtDuration(v.duration);
  }
  function paintBuffer() {
    if (!v.buffered.length || !v.duration) return;
    $("[data-buf]").style.width = (v.buffered.end(v.buffered.length - 1) / v.duration) * 100 + "%";
  }
  const posFrom = (e) => {
    const r = tl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  let sprites = null;
  const spritesReady = x.paths.vtt && x.paths.sprite ? loadSprites(x.paths.vtt, x.paths.sprite).then((s) => (sprites = s)) : Promise.resolve(null);

  // ---------- Highlights: heat curve + jump marks ----------
  let highlights = [];
  async function paintHeat() {
    const mot = await motionBins(await spritesReady, dur);
    const heat = combine(mot, watchBins(x.id));
    const cv = $("[data-heat]");
    if (!cv) return;
    if (!heat) {
      cv.hidden = true;
      return;
    }
    const g = cv.getContext("2d");
    const { width: W, height: H } = cv;
    g.clearRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(255, 62, 138, .95)");
    grad.addColorStop(1, "rgba(255, 62, 138, .15)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, H);
    heat.forEach((h, i) => {
      const xx = ((i + 0.5) / BINS) * W;
      g.lineTo(xx, H - 3 - h * (H - 5));
    });
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    cv.hidden = false;
    highlights = peaks(heat, v.duration || dur);
    $("[data-hls]").innerHTML = highlights
      .map((sec) => `<button type="button" class="kb-tl-hl" data-hl="${sec}" style="left:${(sec / (v.duration || dur)) * 100}%" title="${t("Highlight at {time} (J)", { time: fmtDuration(sec) })}" aria-label="${t("Highlight at {time}", { time: fmtDuration(sec) })}"></button>`)
      .join("");
  }
  paintHeat();
  $("[data-hls]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-hl]");
    if (!b) return;
    e.stopPropagation();
    v.currentTime = Number(b.dataset.hl);
    watch.seeked(v.currentTime);
    if (v.paused) v.play().catch(() => {});
  });
  function nextHighlight() {
    // the best moments (Versus) first, one after another
    const best = bestHere().map((m) => m.seconds).sort((a, b) => a - b);
    if (best.length) {
      const at = best.find((h) => h > v.currentTime + 2) ?? best[0];
      v.currentTime = at;
      watch.seeked(at);
      return toast(t("Best moment at {time}", { time: fmtDuration(at) }));
    }
    const all = [...highlights, ...(x.scene_markers || []).map((m) => m.seconds)].sort((a, b) => a - b);
    if (!all.length) return toast(t("No highlights for this scene yet"));
    const at = all.find((h) => h > v.currentTime + 2) ?? all[0];
    v.currentTime = at;
    watch.seeked(at);
    toast(t("Highlight at {time}", { time: fmtDuration(at) }));
  }
  tl.addEventListener("pointermove", (e) => {
    const p = posFrom(e);
    const at = p * (v.duration || dur);
    const peek = $("[data-peek]");
    peek.hidden = false;
    peek.style.left = p * 100 + "%";
    $("[data-peektime]").textContent = fmtDuration(at);
    const img = $("[data-peekimg]");
    const cue = sprites && sprites.cues.find((c) => at >= c.start && at < c.end);
    if (cue) {
      const [cx, cy, cw, ch] = cue.xywh;
      img.hidden = false;
      img.style.width = cw + "px";
      img.style.height = ch + "px";
      img.style.background = `url("${sprites.url}") -${cx}px -${cy}px`;
    } else img.hidden = true;
    if (scrubbing) v.currentTime = at;
  });
  tl.addEventListener("pointerleave", () => !scrubbing && ($("[data-peek]").hidden = true));
  let scrubbing = false;
  tl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-hl]")) return; // jump mark: handles its own click
    scrubbing = true;
    tl.setPointerCapture(e.pointerId);
    v.currentTime = posFrom(e) * (v.duration || dur);
  });
  tl.addEventListener("pointerup", () => watch.seeked(v.currentTime));
  tl.addEventListener("pointerup", () => {
    scrubbing = false;
    $("[data-peek]").hidden = true;
  });

  // ---------- Controls ----------
  function syncPlay() {
    $("[data-play]").innerHTML = icon(v.paused ? "play" : "pause");
    $("[data-bigplay]").hidden = !v.paused || v.currentTime > 0.5 ? true : false;
    stage.classList.toggle("is-paused", v.paused);
  }
  function syncVol() {
    $("[data-mute]").innerHTML = icon(v.muted || v.volume === 0 ? "mute" : "volume");
    $("[data-vol]").value = v.muted ? 0 : v.volume;
  }
  syncVol();
  syncPlay();
  const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());

  // Controls hide when idle
  let idle;
  const wake = () => {
    stage.classList.remove("is-idle");
    clearTimeout(idle);
    idle = setTimeout(() => !v.paused && stage.classList.add("is-idle"), 2600);
  };
  stage.addEventListener("pointermove", wake);
  wake();
  // Touch: the first tap on a player whose controls are hidden only brings them back (like other
  // video apps) – the next tap pauses. Mouse clicks pause right away as before.
  let tapWoke = false;
  let lastPointer = "mouse";
  stage.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    if (e.pointerType === "mouse") return;
    tapWoke = stage.classList.contains("is-idle");
    wake();
  });

  host.addEventListener("click", (e) => {
    const el = e.target;
    const woke = tapWoke;
    tapWoke = false;
    if (el.closest("[data-close]")) return closeOverlay();
    if (el.closest("[data-play]") || el.closest("[data-bigplay]")) return toggle();
    if (el === v) return woke ? undefined : toggle();
    if (el.closest(".kb-vr")) return woke || vr.dragged() ? undefined : toggle(); // a drag looks around, a click pauses
    if (el.closest("[data-next]")) return next(1);
    if (el.closest("[data-prev]")) return next(-1);
    if (el.closest("[data-restart]")) return seekTo(0, "↺ 0:00");
    if (el.closest("[data-handy]") && handy) return toggleHandyPanel();
    if (el.closest("[data-hpanel]")) return; // (clicks inside the menu don't pause the video)
    const sk = el.closest("[data-skip]");
    if (sk) return skipBy(Number(sk.dataset.skip));
    if (el.closest("[data-fs]")) return fullscreen();
    if (el.closest("[data-mini]")) return toMini();
    if (el.closest("[data-menubtn]")) {
      if (menu.hidden) {
        menu.innerHTML = menuHtml();
        menuPicked = false;
      }
      menu.hidden = !menu.hidden;
      if (!menu.hidden) stage.classList.remove("is-peek"); // the info panel would cover the menu in fullscreen
      return;
    }
    if (el.closest("[data-mute]")) {
      v.muted = !v.muted;
      prefs.muted = v.muted;
      savePrefs();
      return syncVol();
    }
    if (el.closest("[data-panel]")) {
      prefs.panel = !prefs.panel;
      savePrefs();
      return stage.classList.toggle("has-panel", prefs.panel);
    }
    if (el.closest("[data-heatbtn]")) {
      prefs.heat = !prefs.heat;
      savePrefs();
      el.closest("[data-heatbtn]").classList.toggle("is-on", prefs.heat);
      return tl.classList.toggle("has-heat", prefs.heat);
    }
    const sim = el.closest("[data-simgo]");
    if (sim) return openScene(sim.dataset.simgo);
    if (el.closest("[data-pmode]")) {
      prefs.mode = PLAY_MODES[(PLAY_MODES.findIndex((m) => m[0] === prefs.mode) + 1) % PLAY_MODES.length][0];
      savePrefs();
      v.loop = prefs.mode === "one";
      if (handy) handy.setLoop(prefs.mode === "one");
      paintMode();
      paintUpnext();
      return toast(modeOf()[2], "ok");
    }
    const up = el.closest("[data-upgo]");
    if (up) return jump(Number(up.dataset.upgo));
    const qg = el.closest("[data-qgo]");
    if (qg) {
      const q = store.get("queue", []);
      const i = Number(qg.dataset.qgo);
      if (!q[i]) return;
      store.set("queuePos", i);
      app.context = { queue: true };
      return go((q[i].kind === "image" ? "image/" : "scene/") + q[i].id, true);
    }
    const qd = el.closest("[data-qdel]");
    if (qd) {
      const q = store.get("queue", []);
      const i = Number(qd.dataset.qdel);
      q.splice(i, 1);
      store.set("queue", q);
      const pos = store.get("queuePos", 0);
      if (i < pos) store.set("queuePos", pos - 1);
      setQueueCount();
      paintQueue();
      return paintUpnext();
    }
  });
  // Double click = fullscreen with the mouse only: on touch screens two quick taps (show controls, pause)
  // would count as a double click
  v.addEventListener("dblclick", () => lastPointer === "mouse" && fullscreen());
  $("[data-vol]").addEventListener("input", (e) => {
    v.volume = Number(e.target.value);
    v.muted = v.volume === 0;
    prefs.volume = v.volume;
    prefs.muted = v.muted;
    savePrefs();
    syncVol();
  });

  // Fullscreen shows only the picture (the info bar steps aside via CSS). On phones a landscape video
  // turns the screen to landscape. iPhones only allow fullscreen for the video itself → native player.
  async function fullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
    if (stage.requestFullscreen) {
      try {
        await stage.requestFullscreen({ navigationUI: "hide" });
        if (v.videoWidth > v.videoHeight && screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
        return;
      } catch (e) { /* not allowed – try the video element below */ }
    }
    if (v.webkitEnterFullscreen) {
      try {
        return v.webkitEnterFullscreen();
      } catch (e) { /* not available either */ }
    }
    toast(t("Fullscreen not allowed"));
  }
  // Fullscreen: mouse at the right edge slides the info panel in (can be switched off in the settings)
  stage.addEventListener("pointermove", (e) => {
    if (document.fullscreenElement !== stage || e.pointerType !== "mouse" || prefs.fsPanel === false || !menu.hidden) return;
    const side = $("[data-side]");
    // Not over the control bar or the top bar – their buttons (fullscreen, info …) sit in that corner too
    const bars = e.target.closest(".kb-controls, .kb-topbar") || e.clientY >= $(".kb-controls").getBoundingClientRect().top - 8 || e.clientY <= 64;
    if (!bars && e.clientX >= innerWidth - Math.max(70, innerWidth * 0.05)) {
      stage.style.setProperty("--ctrl-h", $(".kb-controls").offsetHeight + "px"); // the panel ends above the control bar
      stage.classList.add("is-peek");
    }
    else if (stage.classList.contains("is-peek") && e.clientX < innerWidth - side.offsetWidth - 40) stage.classList.remove("is-peek");
  });
  const onFsChange = () => {
    stage.classList.remove("is-peek");
    if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (e) { /* not locked */ }
    }
  };
  document.addEventListener("fullscreenchange", onFsChange);

  // ---------- Next / previous ----------
  // Order: queue > list it was opened from > random from the library
  function upcoming() {
    if (inQueue) {
      const q = store.get("queue", []);
      const pos = store.get("queuePos", 0);
      return { list: q.map((it) => ({ kind: it.kind, id: it.id, title: it.title, thumb: it.thumb })), pos };
    }
    if (ctx.pieces) {
      const list = ctx.pieces.filter((p) => p.kind === "scene");
      return { list, pos: list.findIndex((p) => p.id === x.id) };
    }
    return { list: [], pos: -1 };
  }
  async function next(dir) {
    flushActivity(true);
    if (prefs.mode === "shuffle" && dir > 0) {
      try {
        const r = await findItems("scene", { per_page: 1, sort: "random_" + Math.floor(Math.random() * 1e8) });
        if (r.items[0]) return openScene(r.items[0].id);
      } catch (e) {
        return errorToast(e, "Random");
      }
    }
    const { list, pos } = upcoming();
    let i = pos + dir;
    if (prefs.mode === "all" && list.length) i = (i + list.length) % list.length; // repeat all: round and round
    if (i < 0 || i >= list.length) return toast(dir > 0 ? t("That was the last video") : t("This is the first video"));
    jump(i);
  }
  function jump(i) {
    const { list } = upcoming();
    const it = list[i];
    if (!it) return;
    if (inQueue) store.set("queuePos", i);
    if (ctx.index != null && !inQueue) ctx.index = i;
    if (it.kind === "image") return go("image/" + it.id, true);
    openScene(it.id);
  }
  function openScene(id) {
    go("scene/" + id, true);
  }
  v.addEventListener("ended", () => {
    flushActivity(true);
    if (prefs.mode !== "one" && prefs.mode !== "stop" && !mini) next(1); // the mini player just stops
  });

  // Sections in the info bar (queue, up next, similar): open by default, each one can be folded away
  // and stays that way
  const secHtml = (key, title, body) =>
    `<details class="kb-upsec" data-sec="${key}"${(prefs.closed || {})[key] ? "" : " open"}><summary><h3>${title}</h3></summary>${body}</details>`;
  const thumbImg = (src) => (src ? `<img alt="" loading="lazy" src="${esc(src)}">` : "");

  // The queue: every entry, the current one marked; click plays from there, × removes it
  function paintQueue() {
    const box = $("[data-queuebox]");
    if (!box) return;
    const q = store.get("queue", []);
    const pos = inQueue ? store.get("queuePos", 0) : -1;
    box.innerHTML = secHtml(
      "queue",
      `${t("Queue")}<small class="kb-upsec-n">${q.length || ""}</small>`,
      q.length
        ? q.map((it, i) => `<div class="kb-qrow${i === pos ? " is-now" : ""}"><button class="kb-upnext-item" data-qgo="${i}">${thumbImg(it.thumb)}<span>${esc(it.title || it.id)}</span></button><button class="kb-btn is-icon is-ghost kb-qdel" data-qdel="${i}" title="${t("Remove from the queue")}" aria-label="${t("Remove from the queue")}">${icon("close")}</button></div>`).join("") +
          `<a class="kb-qall" href="#/queue">${t("Open the queue")}</a>`
        : `<p class="kb-plc-meta">${t("Empty – add scenes with “Queue”.")}</p>`
    );
  }
  paintQueue();
  const onQueue = () => {
    paintQueue();
    paintUpnext();
  };
  window.addEventListener("stash:queue-changed", onQueue);

  // "Up next" in the placard (when playing from the queue, the queue section shows it)
  function paintUpnext() {
    const box = $("[data-upnext]");
    if (!box) return;
    const { list, pos } = upcoming();
    const rest = inQueue ? [] : list.slice(pos + 1, pos + 6);
    box.innerHTML = rest.length
      ? secHtml("upnext", t("Up next"), rest.map((it, k) => `<button class="kb-upnext-item" data-upgo="${pos + 1 + k}">${thumbImg(it.thumb)}<span>${esc(it.title || it.id)}</span></button>`).join(""))
      : prefs.mode === "shuffle"
      ? secHtml("upnext", t("Up next"), `<p class="kb-plc-meta">${t("Something random from the library.")}</p>`)
      : "";
  }
  paintUpnext();
  function modeOf() {
    return PLAY_MODES.find((m) => m[0] === prefs.mode) || PLAY_MODES[0];
  }
  function paintMode() {
    const b = $("[data-pmode]");
    if (!b) return;
    const [mode, ic, label] = modeOf();
    b.innerHTML = `${icon(ic)}<span>${esc(t(label))}</span>`;
    b.title = `${t(label)} – ${t("click: how it goes on at the end")}`;
    b.classList.toggle("is-on", mode !== "order");
  }
  paintMode();

  // "Similar" in the placard – loads in the background
  async function paintSimilar() {
    const box = $("[data-similar]");
    if (!box) return;
    box.innerHTML = secHtml("similar", t("Similar"), `<p class="kb-plc-meta">${t("Searching …")}</p>`);
    try {
      const list = await similarScenes(x.id, 8);
      if (!box.isConnected) return;
      box.innerHTML = list.length
        ? secHtml("similar", t("Similar"), list.map((it) => `<button class="kb-upnext-item" data-simgo="${esc(it.id)}">${thumbImg(it.thumb)}<span><b>${esc(it.title)}</b><small>${esc(it.why)}</small></span></button>`).join(""))
        : "";
    } catch (e) {
      box.innerHTML = "";
    }
  }
  paintSimilar();

  // ---------- Own markers (Stash scene markers) ----------
  // B or the gear menu sets one at the current spot – with the tag "Highlight" (Stash needs a tag);
  // they sit as pins on the timeline, J jumps through them too, the info bar lists them.
  let markTagId = null;
  async function markerTag() {
    if (markTagId) return markTagId;
    const d = await gql(`query { findTags(tag_filter: { name: { value: "Highlight", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`);
    if (d.findTags.tags[0]) return (markTagId = d.findTags.tags[0].id);
    const c = await gql(`mutation { tagCreate(input: { name: "Highlight" }) { id } }`);
    return (markTagId = c.tagCreate.id);
  }
  function markerTimeLabel(m) {
    const start = fmtDuration(m.seconds);
    if (m.end_seconds != null && m.end_seconds > m.seconds + 0.05) {
      return start + " – " + fmtDuration(m.end_seconds);
    }
    return start;
  }
  function paintMarks() {
    const box = $("[data-mks]");
    if (!box) return;
    const total = v.duration || dur || 1;
    const best = bestMarkersNow() || new Map();
    box.innerHTML = (x.scene_markers || [])
      .map((m) => {
        const left = (m.seconds / total) * 100;
        const endPct =
          m.end_seconds != null && m.end_seconds > m.seconds + 0.05
            ? ((m.end_seconds - m.seconds) / total) * 100
            : 0;
        const range =
          endPct > 0.3
            ? `<span class="kb-tl-mk-range" style="left:${left}%;width:${endPct}%"></span>`
            : "";
        return (
          range +
          `<button type="button" class="kb-tl-mk${best.has(m.id) ? " is-best" : ""}" data-mk="${m.seconds}" style="left:${left}%" title="${esc((best.has(m.id) ? "★ " + t("Best moment") + " · " : "") + (m.title || (m.primary_tag || {}).name || t("Marker")) + " · " + markerTimeLabel(m))}"></button>`
        );
      })
      .join("");
  }
  // the best moments arrive a moment later (standings from Stash) – then the marks again
  if ((x.scene_markers || []).length && !bestMarkersNow()) bestMarkers().then(() => host.isConnected && paintMarkers()).catch(() => {});
  let quickMarkersActive = false;
  bootPluginHost()
    .then(() => {
      quickMarkersActive = isScenePluginEnabled("quickMarkers");
      if (host.isConnected) {
        paintMarkers();
        if (quickMarkersActive) reloadSceneMarkers();
      }
    })
    .catch(() => {});
  function markerAddFooter() {
    if (quickMarkersActive) {
      return `<p class="kb-hint kb-mkqm">${t("Quick Markers is on — Shift+I/O for range, Shift+M instant. Key B is disabled here.")}</p>`;
    }
    return `<button type="button" class="kb-btn is-ghost kb-mkadd" data-mkadd>${icon("plus")}${t("Add a marker here (B)")}</button>`;
  }
  function paintMarkers() {
    const box = $("[data-markers]");
    if (!box) return;
    const list = (x.scene_markers || []).slice().sort((a, b) => a.seconds - b.seconds);
    box.innerHTML = secHtml(
      "markers",
      `${t("Markers")}<small class="kb-upsec-n">${list.length || ""}</small>`,
      list
        .map(
          (m) => `<div class="kb-mkrow${(bestMarkersNow() || new Map()).has(m.id) ? " is-best" : ""}"><button type="button" class="kb-mkgo" data-mkgo="${m.seconds}"><b>${markerTimeLabel(m)}</b><span>${esc(m.title || (m.primary_tag || {}).name || t("Marker"))}</span></button><button type="button" class="kb-btn is-icon is-ghost" data-mkren="${m.id}" title="${t("Rename")}">${icon("edit")}</button><button type="button" class="kb-btn is-icon is-ghost kb-qdel" data-mkdel="${m.id}" title="${t("Delete marker")}">${icon("close")}</button></div>`
        )
        .join("") + markerAddFooter()
    );
    paintMarks();
  }
  async function addMarker() {
    if (quickMarkersActive) {
      toast(t("Use Quick Markers: Shift+M instant, Shift+I then Shift+O for a range."), "info");
      return;
    }
    const at = Math.round(v.currentTime * 10) / 10;
    try {
      const tag = await markerTag();
      const d = await gql(`mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { id title seconds primary_tag { id name } } }`, { i: { scene_id: x.id, seconds: at, primary_tag_id: tag, title: "" } });
      x.scene_markers = [...(x.scene_markers || []), d.sceneMarkerCreate];
      paintMarkers();
      toast(t("Marker at {time}", { time: fmtDuration(at) }), "ok");
    } catch (e) {
      errorToast(e, "Marker");
    }
  }
  $("[data-side]").addEventListener("click", async (e) => {
    const go = e.target.closest("[data-mkgo]");
    if (go) {
      v.currentTime = Number(go.dataset.mkgo);
      watch.seeked(v.currentTime);
      return v.paused && v.play().catch(() => {});
    }
    if (e.target.closest("[data-mkadd]")) return addMarker();
    const ren = e.target.closest("[data-mkren]");
    if (ren) {
      const m = x.scene_markers.find((q) => q.id === ren.dataset.mkren);
      const title = await promptDialog({ title: t("Name of the marker"), label: t("Name"), value: m.title || "", ok: t("Save") });
      if (title == null) return;
      try {
        await gql(`mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { id } }`, { i: { id: m.id, title: title.trim(), scene_id: x.id, seconds: m.seconds, primary_tag_id: (m.primary_tag || {}).id || (await markerTag()) } });
        m.title = title.trim();
        paintMarkers();
      } catch (err) {
        errorToast(err, "Marker");
      }
      return;
    }
    const del = e.target.closest("[data-mkdel]");
    if (del) {
      try {
        await gql(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id: del.dataset.mkdel });
        x.scene_markers = x.scene_markers.filter((q) => q.id !== del.dataset.mkdel);
        paintMarkers();
        toast(t("Marker deleted"), "ok");
      } catch (err) {
        errorToast(err, "Marker");
      }
    }
  });

  let reloadMarkersT = 0;
  async function reloadSceneMarkers() {
    try {
      const d = await gql(
        `query($id: ID!) { findScene(id: $id) { scene_markers { id title seconds end_seconds primary_tag { id name } } } }`,
        { id: x.id }
      );
      x.scene_markers = (d.findScene && d.findScene.scene_markers) || [];
      if (host.isConnected) paintMarkers();
    } catch (err) {
      console.warn("[Stash UI] marker reload", err);
    }
  }
  function scheduleMarkerReload(ev) {
    const sid = ev && ev.detail ? ev.detail.sceneId : null;
    if (sid != null && String(sid) !== String(x.id)) return;
    clearTimeout(reloadMarkersT);
    reloadMarkersT = setTimeout(reloadSceneMarkers, 120);
  }
  function onMarkersChanged(ev) {
    scheduleMarkerReload(ev);
  }
  window.addEventListener("kb:scene-markers-changed", onMarkersChanged);
  paintMarkers();
  v.addEventListener("loadedmetadata", paintMarks);
  $("[data-mks]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mk]");
    if (!b) return;
    e.stopPropagation();
    v.currentTime = Number(b.dataset.mk);
    watch.seeked(v.currentTime);
  });

  // ---------- The frame you're looking at as the scene's cover ----------
  // Shown at once; Stash only gets the final one (see saveCover). Undo / "Old cover" step back.
  const showCover = (url) => {
    v.poster = url;
    if (ctx.hang) {
      const pc = ctx.hang.pieces.find((q) => q.kind === "scene" && q.id === x.id);
      if (pc) ctx.hang.update(Object.assign({}, pc, { thumb: url }));
    }
  };
  const coverEntry = () => {
    let c = covers.get(x.id);
    if (!c) covers.set(x.id, (c = { stack: [], cur: null, saved: null }));
    c.open = true;
    c.onSaved = (url) => {
      x.paths.screenshot = url;
      showCover(url);
    };
    return c;
  };
  // Opened again before the last change reached Stash: show that one
  {
    const c = covers.get(x.id);
    if (c && c.cur) {
      coverEntry();
      v.poster = c.cur.url;
    }
  }
  function paintCoverUndo() {
    const btn = side.querySelector("[data-cover]");
    let u = side.querySelector("[data-coverundo]");
    const c = covers.get(x.id);
    if (!btn || !c || !c.stack.length) return u && u.remove();
    if (!u) {
      u = document.createElement("button");
      u.className = "kb-plc-btn";
      u.dataset.coverundo = "";
      u.title = t("Put the cover back that the scene had before");
      u.innerHTML = `${icon("undo")}${esc(t("Old cover"))}`;
      btn.after(u);
    }
  }
  async function frameAsCover() {
    if (!v.videoWidth) return toast(t("No picture yet"), "error");
    try {
      // the frame first – the video may be gone a moment later (scene left)
      const cv = document.createElement("canvas");
      cv.width = v.videoWidth;
      cv.height = v.videoHeight;
      cv.getContext("2d").drawImage(v, 0, 0);
      const framed = new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));
      const c = coverEntry();
      if (!c.cur) {
        // what Stash has now – needed to go back to it once a new one was saved
        let blob = null;
        try {
          const r = await fetch(x.paths.screenshot, { credentials: "same-origin", cache: "no-store" });
          if (r.ok) blob = await r.blob();
          if (blob && !/^image\//.test(blob.type)) blob = null;
        } catch (e) { /* none yet */ }
        c.cur = c.saved = { url: x.paths.screenshot, blob };
      }
      const blob = await framed;
      if (!blob) throw new Error(t("No picture yet"));
      c.stack.push(c.cur);
      c.cur = { url: URL.createObjectURL(blob), blob };
      if (!covers.has(x.id)) covers.set(x.id, c); // the scene was left while loading – keep it
      showCover(c.cur.url);
      stage.classList.remove("is-flash");
      void stage.offsetWidth;
      stage.classList.add("is-flash");
      paintCoverUndo();
      toast(t("Cover set to this frame"), "ok", { label: t("Undo"), run: () => undoCover() });
      if (c.open) scheduleCover(x.id);
      else saveCover(x.id); // already left: save now
    } catch (e) {
      errorToast(e, "Cover");
    }
  }
  function undoCover() {
    const c = covers.get(x.id);
    if (!c || !c.stack.length) return;
    c.cur = c.stack.pop();
    showCover(c.cur.url);
    paintCoverUndo();
    toast(t("The old cover is back"), "ok");
    if (c.open) scheduleCover(x.id);
    else saveCover(x.id); // Undo in the message after leaving the scene
  }

  // ---------- Placard ----------
  const side = $("[data-side]");
  side.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.matches || !d.matches("[data-sec]")) return;
    prefs.closed = Object.assign({}, prefs.closed, { [d.dataset.sec]: !d.open });
    savePrefs();
  }, true); // "toggle" doesn't bubble – caught on the way down
  const plc = bindPlacard(side, "scene", () => x, {
    refresh: async () => {
      x = await getScene(x.id);
      side.innerHTML = placardHtml("scene", x) + '<div class="kb-upnext kb-markers" data-markers></div><div class="kb-upnext kb-queuebox" data-queuebox></div><div class="kb-upnext" data-upnext></div><div class="kb-upnext kb-similar" data-similar></div>';
      paintMarkers();
      paintQueue();
      paintUpnext();
      paintSimilar();
      paintCoverUndo();
    },
    onDeleted: () => {
      closeOverlay();
      if (ctx.hang) ctx.hang.remove(["scene:" + x.id]);
    },
    position: () => v.currentTime,
    goFolder: () => goToFolder(f.path),
    music: () => import("./music.js").then((m) => m.openMusic(x, v)),
    cover: () => frameAsCover(),
    funscript: () => addFunscript(),
  });
  side.addEventListener("click", (e) => {
    if (e.target.closest("[data-coverundo]")) undoCover();
  });
  paintCoverUndo();
  async function goToFolder(path) {
    const { loadFolders, folderIdForPath } = await import("../api.js");
    const dir = (path || "").split(/[\\/]/).slice(0, -1).join("\\");
    const id = await folderIdForPath(dir).catch(() => null);
    if (id) return go("folder/" + id);
    const tree = await loadFolders(false, { user: true });
    const n = [...tree.nodes.values()].find((n) => n.path === dir);
    if (n) go("folder/" + n.id);
  }

  // ---------- Keyboard ----------
  // ---------- A funscript for this scene ----------
  // Stash finds funscripts by name (video.mp4 → video.funscript next to it). The button shows every
  // .funscript in the library (Stash UI's backend looks), the best matches first; picking one puts it
  // next to the video – so it stays with the scene, after restarts and in classic Stash too – and has
  // Stash scan the video. Which file it came from is kept in Stash UI's settings (shown next time).
  const words = (str) => String(str || "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  // wait until Stash has scanned the video (interactive on – or off after removing), then reopen
  async function afterFunscript(msg, want = true) {
    toast(msg, "ok");
    for (let i = 0; i < 20 && host.isConnected; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await getScene(x.id).catch(() => null);
      if (s && !!s.interactive === want) {
        return go(`scene/${x.id}?t=${Math.floor(v.currentTime)}`, true); // the scene again, at the same spot (no new history entry – "back" leaves at once)
      }
    }
    if (host.isConnected) toast(t("Stash hasn't scanned the video yet – open the scene again in a moment."));
  }
  async function addFunscript() {
    const file = (f.path || "").split(/[\\/]/).pop();
    const mine = new Set([...words(file), ...words(x.title)]);
    const dr = openDrawer({
      title: t("Funscript for this scene"),
      body: `<p class="kb-hint">${t("Every .funscript in your Stash folders. The one you pick goes next to the video (as {name}) – it stays with this scene, also after a restart.", { name: esc(file.replace(/\.[^.]+$/, "") + ".funscript") })}</p>
        <div class="kb-fsp-cur" data-fscur></div>
        <div class="kb-fsv-box" data-fsvbox hidden><h3 class="kb-fsp-h">${t("Scripts for this video")}</h3><div data-fsvbody></div></div>
        <input class="kb-field" type="search" data-fsq placeholder="${t("Search funscripts …")}" autocomplete="off">
        <div class="kb-fsp-list" data-fslist><div class="kb-loading">${t("Looking through your library …")}</div></div>`,
      foot: `<button type="button" class="kb-btn is-ghost" data-fsremove hidden>${icon("trash")}${t("Remove")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-fsupload>${icon("plus")}${t("From this computer …")}</button>`,
    });
    const el = dr.el;
    el.classList.add("kb-fsp");
    let files = [];
    let current = null;
    const saved = (await fsSources())[x.id];
    const score = (fl) => {
      const w = words(fl.name);
      if (!w.length || !mine.size) return 0;
      const hit = w.filter((y) => mine.has(y)).length;
      return hit / Math.max(w.length, mine.size) + (fl.name.toLowerCase().replace(/\.funscript$/, "") === file.toLowerCase().replace(/\.[^.]+$/, "") ? 1 : 0);
    };
    const short = (dir) => dir.split(/[\\/]/).filter(Boolean).slice(-2).join(" / ");
    // "in use": the file you picked (kept in Stash) – not the copy next to the video, which is hidden
    let inUse = null;
    const same = (a, b) => !!a && !!b && a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
    const row = (fl) => `<button type="button" class="kb-fsp-row${same(fl.path, inUse) ? " is-on" : ""}" data-fspath="${esc(fl.path)}">
        ${icon("plug")}<span><b>${esc(fl.name.replace(/\.funscript$/i, ""))}</b><small>${esc(short(fl.dir))}${fl.paired ? ` · ${t("belongs to a video")}` : ""} · ${Math.max(1, Math.round(fl.size / 1024))} KB</small></span>
        ${same(fl.path, inUse) ? `<em>${t("in use")}</em>` : ""}</button>`;
    function paint() {
      const q = el.querySelector("[data-fsq]").value.trim().toLowerCase();
      const list = el.querySelector("[data-fslist]");
      if (!files.length) return (list.innerHTML = `<p class="kb-hint">${t("No .funscript files in your Stash folders. Put them in a library folder (or use “From this computer”).")}</p>`);
      const shown = q ? files.filter((fl) => (fl.name + " " + fl.dir).toLowerCase().includes(q)) : files;
      const best = q ? [] : shown.filter((fl) => fl.s > 0).slice(0, 8);
      const rest = shown.filter((fl) => !best.includes(fl)).slice(0, 300);
      list.innerHTML =
        (best.length ? `<h3 class="kb-fsp-h">${t("Matching this video")}</h3>${best.map(row).join("")}` : "") +
        (rest.length ? `<h3 class="kb-fsp-h">${q ? t("Found") : t("All funscripts")}</h3>${rest.map(row).join("")}` : `<p class="kb-hint">${t("Nothing found")}</p>`) +
        (shown.length - best.length > 300 ? `<p class="kb-hint">${t("… search to find more")}</p>` : "");
    }
    function paintCurrent() {
      const c = el.querySelector("[data-fscur]");
      el.querySelector("[data-fsremove]").hidden = !current;
      c.innerHTML = current
        ? `${icon("check")}<span>${t("In use: {name}", { name: `<b>${esc((saved && saved.name) || current.split(/[\\/]/).pop())}</b>` })}</span>`
        : `<span class="kb-hint">${t("This scene has no funscript yet.")}</span>`;
    }
    try {
      const r = await runBackendCached({ mode: "funscript_list", scene_id: x.id });
      current = r.current;
      // picked from the library before → that file is "in use", and the copy next to the video isn't listed;
      // otherwise (put there by hand, or “From this computer”) the copy itself is what's in use
      const src = saved && saved.path && current && (r.files || []).some((fl) => same(fl.path, saved.path)) ? saved.path : null;
      inUse = src || current;
      files = (r.files || [])
        .filter((fl) => !(src && same(fl.path, current)))
        .map((fl) => Object.assign(fl, { s: score(fl) }))
        .sort((p, q) => same(q.path, inUse) - same(p.path, inUse) || q.s - p.s || p.name.localeCompare(q.name));
      if (r.truncated) toast(t("Very many funscripts – only the first 20 000 are listed"));
      paintCurrent();
      paint();
    } catch (e) {
      el.querySelector("[data-fslist]").innerHTML = `<p class="kb-hint">${esc(e.message)}</p><p class="kb-hint">${t("Stash UI's backend needs Python (like the PMV Generator).")}</p>`;
    }
    el.querySelector("[data-fsq]").addEventListener("input", paint);
    pickerEl = el;
    paintVariants([el.querySelector("[data-fsvbox]")]);
    el.addEventListener("change", onFull);
    // a new main funscript (or none): the remembered variant doesn't fit any more
    const remember = (name, path) => (vpick = null, vdata = null, rememberVariant(x.id, null), rememberFs(x.id, name, path));
    el.addEventListener("click", async (e) => {
      const r = e.target.closest("[data-fspath]");
      const vr = e.target.closest("[data-fsvpath]");
      if (e.target.closest("[data-fsvedit]")) return editVariant().catch((er) => errorToast(er, "Funscript"));
      if (e.target.closest("[data-fsvdupes]")) return setAsideDuplicates().catch((er) => errorToast(er, "Funscript"));
      if (vr) return chooseVariant(vr.dataset.fsvpath).catch((er) => errorToast(er, "Funscript"));
      try {
        if (r) {
          const path = r.dataset.fspath;
          if (same(path, inUse)) return dr.close();
          if (current && !(await confirmDialog({ title: t("Use this funscript instead?"), text: t("The one in use now is kept next to the video as .funscript.bak."), ok: t("Use it") })).ok) return;
          r.classList.add("is-busy");
          await runBackend({ mode: "funscript_save", scene_id: x.id, source: path });
          await remember(path.split(/[\\/]/).pop(), path);
          dr.close();
          return afterFunscript(t("Funscript chosen – Stash is scanning the video …"));
        }
        if (e.target.closest("[data-fsremove]")) {
          if (!(await confirmDialog({ title: t("Remove the funscript?"), text: t("It's renamed to .funscript.bak next to the video – the scene isn't interactive any more."), ok: t("Remove"), danger: true })).ok) return;
          await runBackend({ mode: "funscript_remove", scene_id: x.id });
          await remember(null);
          dr.close();
          return afterFunscript(t("Funscript removed"), false);
        }
        if (e.target.closest("[data-fsupload]")) {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = ".funscript,.json,application/json";
          inp.onchange = async () => {
            const fl = inp.files[0];
            if (!fl) return;
            try {
              const text = await fl.text();
              let js;
              try {
                js = JSON.parse(text);
              } catch (er) {
                throw new Error(t("That's not a funscript"));
              }
              if (!js || !Array.isArray(js.actions) || !js.actions.length) throw new Error(t("That's not a funscript"));
              await runBackend({ mode: "funscript_save", scene_id: x.id, content: text });
              await remember(fl.name, null);
              dr.close();
              afterFunscript(t("Funscript saved – Stash is scanning the video …"));
            } catch (er) {
              errorToast(er, "Funscript");
            }
          };
          inp.click();
        }
      } catch (er) {
        if (r) r.classList.remove("is-busy");
        errorToast(er, "Funscript");
      }
    });
  }

  // ---------- Interactive: The Handy plays the scene's funscript (settings: Settings → Player) ----------
  const HANDY_TXT = { idle: "Handy", connecting: "Handy: connecting …", syncing: "Handy: matching the clock …", uploading: "Handy: loading the script …", ready: "Handy", error: "Handy: error" };
  function paintHandy(h) {
    const b = $("[data-handy]");
    if (!b) return;
    b.hidden = !h; // no connection key → nothing to show
    if (!h) return;
    b.querySelector("[data-handytxt]").textContent = t(HANDY_TXT[h.state] || "Handy");
    b.classList.toggle("is-on", h.state === "ready");
    b.classList.toggle("is-err", h.state === "error");
    b.classList.toggle("is-busy", ["connecting", "syncing", "uploading"].includes(h.state));
    b.title = h.state === "error" ? `${h.error} – ${t("click to try again")}` : h.state === "ready" ? t("The Handy follows this scene – click to connect again") : t("Connecting the Handy …");
  }
  // Variants: several funscripts for this video (see ../fsvariants.js). The one picked is remembered per scene.
  let vdata = null; // the backend's answer: { duration, variants: [...] }
  let vpick = null; // the remembered choice (a path) – null: the one with the video's name
  async function loadVariants(force) {
    if (vdata && !force) return vdata;
    const [d, ch] = await Promise.all([runBackend({ mode: "funscript_variants", scene_id: x.id }), variantChoices()]);
    vpick = ch[x.id] || null;
    return (vdata = d);
  }
  async function paintVariants(into) {
    for (const box of into) {
      try {
        const d = await loadVariants();
        box.hidden = !d.variants.length;
        if (box.hidden) continue;
        const dups = duplicatesOf(d).size;
        const full = store.get("fsvFull", false);
        box.querySelector("[data-fsvbody]").innerHTML = stackHtml(d, activeOf(d, vpick), { full }) +
          `<div class="kb-fsv-acts"><button type="button" class="kb-btn is-ghost" data-fsvedit>${icon("edit")}${t("Edit this script …")}</button>` +
          (dups ? `<button type="button" class="kb-btn is-ghost" data-fsvdupes>${t("Set aside the duplicates ({n})", { n: dups })}</button>` : "") +
          `<label class="kb-fsv-full"><input type="checkbox" data-fsvfull${full ? " checked" : ""}> ${t("Stretch each script to the full width")}</label></div>`;
        const hint = box.querySelector("[data-fsvhint]");
        if (hint) hint.hidden = d.variants.length < 2;
        paintTimelineHeat();
      } catch (e) {
        box.hidden = true; // no backend (needs Python) → just no variants
      }
    }
  }
  // The picture under the timeline follows the script in use (Stash's own heatmap is the one of the video's own script)
  function paintTimelineHeat() {
    const tl = host.querySelector("[data-timeline]");
    if (!tl || !x.interactive) return;
    const a = vdata && activeOf(vdata, vpick);
    let el = tl.querySelector(".kb-tl-fsv");
    const own = tl.querySelector("img.kb-tl-fs");
    if (!a || a.main || !a.speed || !a.speed.length) {
      if (el) el.remove();
      if (own) own.hidden = false;
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "kb-tl-fs kb-tl-fsv";
      el.title = t("Funscript – how intense it gets");
      tl.insertBefore(el, tl.querySelector("[data-buf]"));
    }
    if (own) own.hidden = true;
    el.style.background = heatBg(a, vdata.duration || dur);
  }
  let pickerEl = null; // the funscript picker while it's open
  const variantBoxes = () => [...host.querySelectorAll("[data-fsvbox]"), pickerEl && pickerEl.isConnected ? pickerEl.querySelector("[data-fsvbox]") : null].filter(Boolean); // the Handy menu and the picker (of this player)
  // the editor: the script in use is changed and saved as a new variant (the original stays)
  async function editVariant() {
    const d = await loadVariants();
    const src = activeOf(d, vpick);
    if (!src) return;
    const { openEditor } = await import("../fsedit.js");
    openEditor({
      sceneId: x.id,
      src,
      meta: d,
      onSaved: async (res) => {
        await loadVariants(true);
        paintVariants(variantBoxes());
        logEvent("funscript", "info", "Edited script saved as “{name}” for {r0}", { name: res.name }, [{ k: "scene", id: x.id, name: x.title || x.id }]);
        toast(t("Saved as “{name}”", { name: res.name }), "ok", { label: t("Use it"), run: () => chooseVariant(res.path).catch((er) => errorToast(er, "Funscript")) });
      },
    });
  }
  async function chooseVariant(path) {
    const d = await loadVariants();
    const cur = activeOf(d, vpick);
    const s = d.variants.find((y) => y.path === path);
    if (!s || (cur && cur.path === s.path)) return;
    const fs = await readVariant(path);
    vpick = s.main ? null : path;
    await rememberVariant(x.id, vpick);
    if (handy) await handy.setVariant(s.main ? null : fs);
    paintVariants(variantBoxes());
    paintTimelineHeat();
    logEvent("funscript", "info", "Script “{name}” chosen for {r0}", { name: s.label || t("Standard") }, [{ k: "scene", id: x.id, name: x.title || x.id }]);
    toast(t("Script “{name}” – the Handy follows it from here", { name: s.label || t("Standard") }), "ok");
  }
  // duplicates among this video's scripts → set aside (never the one with the video's name)
  async function setAsideDuplicates() {
    const d = await loadVariants();
    const list = [...duplicatesOf(d).keys()];
    if (!list.length) return;
    if (!(await confirmDialog({ title: t("Set these duplicates aside?"), text: t("{n} funscripts are renamed to .funscriptdupe next to where they are – nothing is deleted.", { n: list.length }), ok: t("Set aside") })).ok) return;
    const cur = activeOf(d, vpick);
    await runBackend({ mode: "funscript_dupe_aside", paths: list });
    if (cur && list.includes(cur.path)) {
      vpick = null;
      await rememberVariant(x.id, null);
      if (handy) await handy.setVariant(null);
    }
    await loadVariants(true);
    paintVariants(variantBoxes());
    paintTimelineHeat();
    logEvent("funscript", "warn", "{n} duplicate scripts set aside for {r0}", { n: list.length }, [{ k: "scene", id: x.id, name: x.title || x.id }]);
    toast(t("{n} set aside", { n: list.length }), "ok");
  }
  let handy = null;
  const startHandy = () => {
    if (handy) handy.stop();
    handy = x.interactive && x.paths.funscript ? attachHandy(v, x, {
      onState: (h) => (paintHandy(h), paintHandyPanel()),
      loop: () => prefs.mode === "one",
      getVariant: async () => {
        const p = (await variantChoices())[x.id];
        return p ? readVariant(p) : null; // gone (renamed, deleted) → the scene's own
      },
    }) : null;
  };
  startHandy();
  if (x.interactive && x.paths.funscript) loadVariants().then(paintTimelineHeat).catch(() => {}); // a remembered variant's picture under the timeline
  // "stretch to full width" (the stripes in the Handy menu and the picker)
  const onFull = (e) => {
    if (!e.target.matches("[data-fsvfull]")) return;
    store.set("fsvFull", e.target.checked);
    paintVariants(variantBoxes());
  };
  const handyAway = (e) => {
    const p = host.querySelector("[data-hpanel]");
    if (p && !p.hidden && !e.target.closest("[data-hpanel], [data-handy]")) p.hidden = true;
  };
  document.addEventListener("pointerdown", handyAway, true);

  // The Handy menu (button in the bar): sync, stroke, invert – and the device, the key, connect/disconnect
  const hp = $("[data-hpanel]");
  function toggleHandyPanel(force) {
    if (!hp) return;
    hp.hidden = force != null ? !force : !hp.hidden;
    if (hp.hidden) return;
    buildHandyPanel();
  }
  async function buildHandyPanel() {
    const c = await interactiveConfig();
    const p = handyPrefs();
    hp.innerHTML = `
      <div class="kb-hp-var" data-fsvbox hidden>
        <div class="kb-hp-row"><b>${t("Scripts for this video")}</b></div>
        <div data-fsvbody></div>
        <p class="kb-hp-hint" data-fsvhint>${t("Click one to switch – the Handy loads it and carries on from where the video is. Your choice is remembered for this scene.")}</p>
      </div>
      <div class="kb-hp-col">
        <div class="kb-hp-row"><b>${t("Sync")}</b><span class="kb-hp-val" data-hpoffv></span><span class="kb-spacer"></span><button type="button" class="kb-btn is-ghost kb-hp-mini" data-hpreset>${t("Reset")}</button></div>
        <input type="range" class="kb-hp-range" min="-250" max="250" step="5" data-hpoff value="${c.funscriptOffset || 0}">
        <div class="kb-hp-scale"><span>-250</span><span>-125</span><span>0</span><span>125</span><span>250</span></div>
        <p class="kb-hp-hint">${t("If the movement comes too early or too late, move this (milliseconds).")}</p>
        <div class="kb-hp-row"><b>${t("Stroke")}</b><span class="kb-hp-val" data-hpstrokev>0–100</span></div>
        <div class="kb-hp-dual" data-hpdual><i data-hpfill></i><input type="range" min="0" max="100" step="1" value="0" data-hpmin aria-label="${t("Stroke from")}"><input type="range" min="0" max="100" step="1" value="100" data-hpmax aria-label="${t("Stroke to")}"></div>
        <div class="kb-hp-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        <p class="kb-hp-hint">${t("How much of the slide is used – less is gentler.")}</p>
        <label class="kb-hp-row kb-hp-switch"><b>${t("Invert")}</b><span class="kb-spacer"></span><span class="kb-switch"><input type="checkbox" data-hpinv${p.invert ? " checked" : ""}><i></i></span></label>
        <p class="kb-hp-hint">${t("Up becomes down for every script – it's sent to the Handy again.")}</p>
      </div>
      <div class="kb-hp-col kb-hp-dev">
        <div class="kb-hp-name">${icon("plug")}<b>The Handy</b></div>
        <small class="kb-hp-hw" data-hphw></small>
        <span class="kb-hp-badge" data-hpbadge hidden></span>
        <p class="kb-hp-state" data-hpstate></p>
        <label class="kb-hp-key"><span>${t("Connection key")}</span><input class="kb-field" type="text" data-hpkey value="${esc(c.handyKey)}" autocomplete="off" spellcheck="false"></label>
        <div class="kb-hp-acts"><button type="button" class="kb-btn" data-hpconnect>${t("Connect again")}</button><button type="button" class="kb-btn is-ghost" data-hpoff2>${t("Disconnect")}</button></div>
      </div>`;
    paintOffset();
    paintHandyPanel();
    paintVariants([hp.querySelector("[data-fsvbox]")]);
    // the stroke as the device has it
    const h = handy && handy.device;
    if (h && h.state === "ready")
      h.getStroke()
        .then(({ min, max }) => {
          hp.querySelector("[data-hpmin]").value = min;
          hp.querySelector("[data-hpmax]").value = max;
          paintStroke();
        })
        .catch(() => {});
  }
  const paintOffset = () => {
    const o = Number(hp.querySelector("[data-hpoff]").value);
    hp.querySelector("[data-hpoffv]").textContent = `${o > 0 ? "+" : ""}${o} ms`;
  };
  const paintStroke = () => {
    const a = Number(hp.querySelector("[data-hpmin]").value);
    const b = Number(hp.querySelector("[data-hpmax]").value);
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    hp.querySelector("[data-hpstrokev]").textContent = `${lo}–${hi}`;
    const f = hp.querySelector("[data-hpfill]");
    f.style.left = lo + "%";
    f.style.right = 100 - hi + "%";
    return [lo, hi];
  };
  function paintHandyPanel() {
    if (!hp || hp.hidden || !hp.querySelector("[data-hpstate]")) return;
    const h = handy && handy.device;
    const st = hp.querySelector("[data-hpstate]");
    const info = h && h.info;
    hp.querySelector("[data-hphw]").textContent = info ? [info.model, info.hwVersion && `HW ${info.hwVersion}`, info.fwVersion && `FW ${info.fwVersion}`].filter(Boolean).join(" · ") : "";
    const badge = hp.querySelector("[data-hpbadge]");
    badge.hidden = !info;
    if (info) {
      badge.textContent = info.fwStatus === 1 ? t("Update required") : info.fwStatus === 2 ? t("Update available") : t("Supported");
      badge.className = "kb-hp-badge" + (info.fwStatus === 1 ? " is-err" : info.fwStatus === 2 ? " is-warn" : "");
    }
    const msg = !h ? [t("Enter the connection key to connect the Handy."), ""]
      : h.off ? [t("Disconnected – “Connect again” brings it back."), ""]
      : h.state === "ready" ? [t("Connected and ready for script playback."), "is-ok"]
      : h.state === "error" ? [h.error, "is-err"]
      : [t(HANDY_TXT[h.state] || "…"), ""];
    st.textContent = msg[0];
    st.className = "kb-hp-state " + msg[1];
    hp.querySelector("[data-hpoff2]").disabled = !h || h.off;
  }
  if (hp) {
    hp.addEventListener("click", (e) => {
      if (e.target.closest("[data-fsvedit]")) return editVariant().catch((err) => errorToast(err, "Funscript"));
      if (e.target.closest("[data-fsvdupes]")) return setAsideDuplicates().catch((err) => errorToast(err, "Funscript"));
      const r = e.target.closest("[data-fsvpath]");
      if (r) chooseVariant(r.dataset.fsvpath).catch((err) => errorToast(err, "Funscript"));
    });
    hp.addEventListener("input", (e) => {
      if (e.target.matches("[data-hpoff]")) paintOffset();
      if (e.target.matches("[data-hpmin], [data-hpmax]")) paintStroke();
    });
    hp.addEventListener("change", onFull);
    hp.addEventListener("change", async (e) => {
      const el = e.target;
      try {
        if (el.matches("[data-hpoff]")) handy && handy.setOffset(Number(el.value));
        if (el.matches("[data-hpmin], [data-hpmax]")) {
          const [lo, hi] = paintStroke();
          const h = handy && handy.device;
          if (h && h.state === "ready") await h.setStroke(lo, hi);
        }
        if (el.matches("[data-hpinv]")) {
          store.set("handyPrefs", Object.assign(handyPrefs(), { invert: el.checked }));
          if (handy) await handy.reload();
        }
        if (el.matches("[data-hpkey]")) {
          await saveInteractiveConfig({ handyKey: el.value.trim() });
          startHandy();
          toast(t("Saved"), "ok");
        }
      } catch (err) {
        errorToast(err, "The Handy");
      }
    });
    hp.addEventListener("click", async (e) => {
      if (e.target.closest("[data-hpreset]")) {
        hp.querySelector("[data-hpoff]").value = 0;
        paintOffset();
        if (handy) handy.setOffset(0);
      } else if (e.target.closest("[data-hpconnect]")) {
        toast(t("Connecting the Handy again …"));
        if (handy) await handy.retry();
        else startHandy();
        buildHandyPanel();
      } else if (e.target.closest("[data-hpoff2]")) {
        if (handy) await handy.disconnect();
        paintHandyPanel();
      }
    });
  }

  // Jumping: from the beginning, 10 s back / forward – with a short note on the picture
  let flashT = 0;
  function seekTo(at, note) {
    const end = (v.duration || dur || 0) - 0.5;
    v.currentTime = Math.max(0, end > 0 ? Math.min(at, end) : at);
    watch.seeked(v.currentTime);
    if (v.paused && at === 0) v.play().catch(() => {});
    const f = $("[data-seekflash]");
    if (!f) return;
    f.textContent = note;
    f.classList.remove("is-on");
    void f.offsetWidth;
    f.classList.add("is-on");
    clearTimeout(flashT);
    flashT = setTimeout(() => f.classList.remove("is-on"), 700);
  }
  const skipBy = (s) => seekTo(v.currentTime + s, s < 0 ? `−${-s} s` : `+${s} s`);

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // (the browser's own keys: Ctrl+R reloads, Ctrl+F searches …)
    if (e.target.closest && e.target.closest("input, textarea, select, .kb-drawer, .kb-dialog")) return;
    if (document.querySelector("#overlay-root .kb-drawer, #overlay-root .kb-dialog")) return;
    const k = e.key.toLowerCase();
    if (e.shiftKey && k !== "arrowright" && k !== "arrowleft") return;
    let handled = true;
    if (k === "escape") document.fullscreenElement ? document.exitFullscreen() : closeOverlay();
    else if (k === " " || k === "k") toggle();
    else if (k === "arrowright") (v.currentTime += e.shiftKey ? 30 : 5), watch.seeked(v.currentTime);
    else if (k === "arrowleft") (v.currentTime -= e.shiftKey ? 30 : 5), watch.seeked(v.currentTime);
    else if (k === "j") nextHighlight();
    else if (k === "home") seekTo(0, "↺ 0:00");
    else if (k === "arrowup") (v.volume = Math.min(1, v.volume + 0.05)), (prefs.volume = v.volume), syncVol();
    else if (k === "arrowdown") (v.volume = Math.max(0, v.volume - 0.05)), (prefs.volume = v.volume), syncVol();
    else if (k === "m") (v.muted = !v.muted), syncVol();
    else if (k === "f") fullscreen();
    else if (k === "x") toMini();
    else if (k === "b") {
      if (!quickMarkersActive) addMarker();
      else handled = false;
    }
    else if (k === "e") host.querySelector("[data-edit]") && host.querySelector("[data-edit]").click(); // edit
    else if (k === "r") host.querySelector("[data-advrate]") && host.querySelector("[data-advrate]").click(); // the detailed rating
    else if (k === "n") next(1);
    else if (k === "p") next(-1);
    else if (k === "i") $("[data-panel]").click();
    else if (k === "h") plc.fav().catch((err) => errorToast(err, "Favorite"));
    else if (k === "o") plc.o(1).catch((err) => errorToast(err, "O counter"));
    else if (/^[1-5]$/.test(k)) plc.rate(Number(k)).catch((err) => errorToast(err, "Rating"));
    else if (/^[0-9]$/.test(k)) v.currentTime = (Number(k) / 10) * (v.duration || dur);
    else handled = false;
    if (handled) {
      e.preventDefault();
      wake();
    }
  };
  document.addEventListener("keydown", onKey);
  stage.focus();

  // Mini player: close the player, the video moves into a corner and keeps running
  function toMini() {
    if (!sources.length) return;
    mini = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    closeOverlay();
  }

  return () => {
    if (handy) handy.stop(); // the Handy stops with the player
    if (handyAway) document.removeEventListener("pointerdown", handyAway, true);
    // a changed cover goes to Stash now (and keeps trying in the background if needed)
    const cv = covers.get(x.id);
    if (cv) {
      cv.open = false;
      saveCover(x.id);
    }
    document.removeEventListener("keydown", onKey);
    clearTimeout(reloadMarkersT);
    window.removeEventListener("kb:scene-markers-changed", onMarkersChanged);
    unmountScenePlugins();
    scenePluginsGone = true;
    sceneHost.remove();
    window.removeEventListener("stash:queue-changed", onQueue);
    document.removeEventListener("fullscreenchange", onFsChange);
    document.removeEventListener("pointerdown", onDocDown, true);
    if (vr) vr.destroy();
    stopGlow();
    flushActivity(true);
    const tEnd = v.currentTime;
    if (mini) startMini({ video: v, id: x.id, title: x.title || f.basename || "", onLeave: () => flushActivity(true) });
    else {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    savePrefs();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Update progress in the grid
    if (ctx.hang) {
      const p = ctx.hang.pieces.find((q) => q.kind === "scene" && q.id === x.id);
      if (p && dur && !keepResume) ctx.hang.update(Object.assign({}, p, { resume: tEnd && tEnd < dur * 0.98 ? tEnd / dur : 0 }));
    }
  };
}
