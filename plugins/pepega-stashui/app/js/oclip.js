// O moments + O clips. While you watch, "O" (or Shift+O) marks the moment of the O in the video you're watching.
// From that moment on a second, chosen clip (a marker or a part of any scene) plays in a small window over the picture –
// you see the main video and the O clip side by side, in step with each other (pause, jump and speed carry over).
// The moments and the chosen clips are kept in the stashui plugin settings (key oClips), so they are shared with every device.

import { esc, icon, toast, errorToast, openDrawer, store, fmtDuration } from "./ui.js";
import { t } from "./i18n.js";
import { gql, getScene, findItems, pluginConfig, setPluginConfig } from "./api.js";
import { parseTime } from "./audiox.js";

const KEY = "oClips";
const DEF_LEN = 8; // seconds, for a marker without an end

// ---------- Data: { scenes: { "<id>": { points: [seconds], clips: [ref] } }, clips: [ref] }, ref = { scene, start, end, title } ----------
let data = null;
let loading = null;
let timer = 0;
export function oData() {
  if (data) return Promise.resolve(data);
  if (!loading)
    loading = pluginConfig("stashui")
      .then((c) => {
        let d = {};
        try {
          d = JSON.parse(c[KEY] || "{}") || {};
        } catch (e) {
          d = {};
        }
        data = { scenes: d.scenes || {}, clips: d.clips || [] };
        return data;
      })
      .catch(() => {
        loading = null;
        return (data = { scenes: {}, clips: [] });
      });
  return loading;
}
function saveSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (data) setPluginConfig("stashui", { [KEY]: JSON.stringify(data) }).catch(() => {});
  }, 600);
}
const rec = (id) => data.scenes[id] || (data.scenes[id] = { points: [], clips: [] });
// An O video that runs along with the whole video: { scene, offset, len, title } – O time = main time − offset
export const syncOf = (id) => (data && data.scenes[id] && data.scenes[id].sync) || null;
export function setSync(id, sync) {
  const r = rec(id);
  if (sync) r.sync = sync;
  else delete r.sync;
  if (!r.points.length && !r.clips.length && !r.sync) delete data.scenes[id];
  saveSoon();
}
export const pointsOf = (id) => (data && data.scenes[id] ? data.scenes[id].points.slice().sort((a, b) => a - b) : []);
export const ownClips = (id) => (data && data.scenes[id] ? data.scenes[id].clips : []);
export const clipsFor = (id) => (ownClips(id).length ? ownClips(id) : (data && data.clips) || []);
export function addPoint(id, sec) {
  const r = rec(id);
  if (r.points.some((p) => Math.abs(p - sec) < 3)) return false; // (the same O pressed twice)
  r.points.push(+sec.toFixed(2));
  saveSoon();
  return true;
}
export function setPoint(id, i, sec) {
  const r = rec(id);
  const sorted = r.points.slice().sort((a, b) => a - b);
  sorted[i] = +sec.toFixed(2);
  r.points = sorted;
  saveSoon();
}
export function removePoint(id, i) {
  const r = rec(id);
  const sorted = r.points.slice().sort((a, b) => a - b);
  sorted.splice(i, 1);
  r.points = sorted;
  if (!r.points.length && !r.clips.length && !r.sync) delete data.scenes[id];
  saveSoon();
}
export function setClips(id, list) {
  if (id == null) data.clips = list;
  else {
    rec(id).clips = list;
    const r = rec(id);
    if (!r.points.length && !r.clips.length && !r.sync) delete data.scenes[id];
  }
  saveSoon();
}

// ---------- Settings kept in this browser ----------
export const oPrefs = () => Object.assign({ show: true, mark: true, pos: "br", size: 32, sound: false }, store.get("oPrefs", {}));
export const setOPrefs = (patch) => store.set("oPrefs", Object.assign(oPrefs(), patch));

export const refLen = (r) => Math.max(1, (r.end || 0) - (r.start || 0));
const refKey = (r) => r.scene + "@" + r.start;

// ---------- The window over the picture ----------
const urlCache = new Map();
const streamOf = (id, own) => {
  if (own) return Promise.resolve(own);
  if (!urlCache.has(id)) urlCache.set(id, getScene(id).then((s) => (s && s.paths && s.paths.stream) || ""));
  return urlCache.get(id);
};

export function createOPlayer({ screen, video, scene }) {
  const el = document.createElement("div");
  el.className = "kb-oclip";
  el.hidden = true;
  el.innerHTML = `<video muted playsinline preload="auto"></video><span class="kb-oclip-tag">${icon("drop")}<b data-otitle></b></span><button type="button" class="kb-oclip-snd" data-osnd></button>`;
  screen.appendChild(el);
  const ov = el.querySelector("video");
  const snd = el.querySelector("[data-osnd]");
  let pts = [];
  let sync = null; // an O video that runs along with the whole video (see osync.js)
  let raf = 0;
  let loadedKey = "";
  let ready = false;
  const chosen = new Map(); // moment → which clip (random once, then the same)

  function layout() {
    const p = oPrefs();
    el.dataset.pos = p.pos;
    el.style.setProperty("--ow", Math.max(12, Math.min(60, p.size)) + "%");
    ov.muted = !p.sound;
    snd.innerHTML = icon(p.sound ? "volume" : "mute");
    snd.title = p.sound ? t("Sound of the O clip is on") : t("Sound of the O clip is off");
    snd.classList.toggle("is-on", !!p.sound);
  }
  snd.onclick = (e) => {
    e.stopPropagation();
    setOPrefs({ sound: !oPrefs().sound });
    layout();
    if (!ov.muted) ov.play().catch(() => {});
  };

  const pick = (p) => {
    if (sync) return { scene: sync.scene, start: sync.start || 0, end: sync.end || (sync.start || 0) + (sync.len || 1), title: sync.title || "" };
    const list = clipsFor(scene.id);
    if (!list.length) return null;
    if (!chosen.has(p)) chosen.set(p, Math.floor(Math.random() * list.length));
    return list[chosen.get(p) % list.length];
  };
  const hide = () => {
    if (!el.hidden) {
      el.hidden = true;
      ov.pause();
    }
  };

  // Load a clip into the window (once; nothing else is shown until it is ready)
  function load(r) {
    const k = refKey(r);
    if (loadedKey === k) return;
    loadedKey = k;
    ready = false;
    streamOf(r.scene).then((u) => {
      if (loadedKey !== k || !u) return;
      ov.src = u;
      ov.addEventListener(
        "loadedmetadata",
        () => {
          if (loadedKey !== k) return;
          // the window takes the clip's own shape (a 9:16 clip gets no black bars; it is made narrower so it doesn't grow tall)
          if (ov.videoWidth && ov.videoHeight) el.style.setProperty("--oa", (ov.videoWidth / ov.videoHeight).toFixed(4));
          ready = true;
          tick();
        },
        { once: true }
      );
    });
  }

  function tick() {
    if (!oPrefs().show || !pts.length) return hide();
    const now = video.currentTime;
    // a matched O video only shows where this video's bar reaches (the trimmed part)
    if (sync && (now < (sync.from || 0) || (sync.to && now >= sync.to))) return hide();
    let hit = null;
    let ahead = null; // the next moment within a few seconds: load its clip before it is due
    for (const p of pts) {
      const r = pick(p);
      if (!r) continue;
      if (now >= p && now < p + refLen(r)) {
        hit = { p, r };
        break;
      }
      if (p > now && p - now < 8 && !ahead) ahead = r;
    }
    if (!hit) {
      if (ahead) {
        load(ahead);
        // sitting at the start of the clip, so it appears the moment the O comes
        if (ready && loadedKey === refKey(ahead) && Math.abs(ov.currentTime - ahead.start) > 0.3) {
          try {
            ov.currentTime = ahead.start;
          } catch (e) {
            /* (not seekable yet) */
          }
        }
      }
      return hide();
    }
    const { p, r } = hit;
    load(r);
    if (!ready || loadedKey !== refKey(r)) return;
    el.querySelector("[data-otitle]").textContent = r.title || "";
    const want = r.start + (now - p);
    if (el.hidden || Math.abs(ov.currentTime - want) > (sync ? 0.2 : 0.45)) {
      try {
        ov.currentTime = want;
      } catch (e) {
        /* (not seekable yet) */
      }
    }
    el.hidden = false;
    ov.playbackRate = video.playbackRate || 1;
    if (video.paused) !ov.paused && ov.pause();
    else if (ov.paused) ov.play().catch(() => {});
  }
  const loop = () => {
    tick();
    raf = video.paused ? 0 : requestAnimationFrame(loop);
  };
  const onPlay = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };
  const onOther = () => tick();
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onOther);
  video.addEventListener("seeked", onOther);
  video.addEventListener("timeupdate", onOther);
  video.addEventListener("ratechange", onOther);

  function refresh() {
    sync = syncOf(scene.id);
    pts = sync ? [sync.offset + (sync.start || 0)] : pointsOf(scene.id);
    chosen.clear();
    loadedKey = "";
    ready = false;
    layout();
    // warm up the first clip so the window shows up without a gap
    const r = sync ? { scene: sync.scene } : clipsFor(scene.id)[0];
    if (r && pts.length) streamOf(r.scene).catch(() => {});
    tick();
    if (!video.paused) onPlay();
  }
  oData().then(refresh);
  layout();

  return {
    refresh,
    layout,
    destroy() {
      cancelAnimationFrame(raf);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onOther);
      video.removeEventListener("seeked", onOther);
      video.removeEventListener("timeupdate", onOther);
      video.removeEventListener("ratechange", onOther);
      ov.pause();
      ov.removeAttribute("src");
      ov.load();
      el.remove();
    },
  };
}

// ---------- Choosing the O clip ----------
export function openOPicker({ scene, onDone }) {
  let target = ownClips(scene.id).length || !(data.clips || []).length ? scene.id : null; // null = for every scene
  let tab = "markers";
  let reqId = 0;
  let pickedScene = null;
  let markers = [];
  let scenes = [];

  const d = openDrawer({
    title: t("O clip"),
    body: `
      <p class="kb-hint">${t("Choose the clip that plays in a small window when the O moment of this video comes. Pick a marker, or a part of any scene.")}</p>
      <div class="kb-oc-target">
        <label class="kb-cut-opt"><input type="radio" name="kb-oc-t" value="scene" data-target${target != null ? " checked" : ""}><span>${t("Only for this scene")}</span></label>
        <label class="kb-cut-opt"><input type="radio" name="kb-oc-t" value="all" data-target${target == null ? " checked" : ""}><span>${t("For every scene that has no clip of its own")}</span></label>
      </div>
      <div class="kb-oc-chosen" data-chosen></div>
      <div class="kb-seg kb-oc-tabs"><button type="button" class="kb-btn is-ghost is-on" data-tab="markers">${t("Markers")}</button><button type="button" class="kb-btn is-ghost" data-tab="scene">${t("Part of a scene")}</button></div>
      <div class="kb-cut-find"><input class="kb-field" data-q placeholder="${esc(t("Search …"))}" autocomplete="off"></div>
      <div class="kb-oc-grid" data-grid></div>
      <div class="kb-oc-part" data-part hidden>
        <video class="kb-oc-vid" data-vid controls playsinline preload="metadata"></video>
        <div class="kb-music-range">
          <label class="kb-form-row"><span>${t("Start time")}</span><span class="kb-music-t"><input class="kb-field" data-from value="0:00.0"><button type="button" class="kb-btn is-ghost" data-here="from">${t("Here")}</button></span></label>
          <label class="kb-form-row"><span>${t("End")}</span><span class="kb-music-t"><input class="kb-field" data-to value="0:08.0"><button type="button" class="kb-btn is-ghost" data-here="to">${t("Here")}</button></span></label>
        </div>
        <button type="button" class="kb-btn is-primary" data-usepart>${icon("plus")}${t("Use this part")}</button>
      </div>`,
    foot: `<span class="kb-spacer"></span><button class="kb-btn is-primary" data-done>${t("Done")}</button>`,
  });
  const el = d.el;
  el.classList.add("kb-oc");
  const $ = (s) => el.querySelector(s);
  const mmss = (n) => {
    n = Math.max(0, n || 0);
    return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, "0")}`;
  };

  const list = () => (target == null ? data.clips : ownClips(scene.id));
  const put = (l) => {
    setClips(target, l);
    paintChosen();
    onDone && onDone();
  };
  function paintChosen() {
    const l = list();
    $("[data-chosen]").innerHTML = l.length
      ? l.map((r, i) => `<span class="kb-chip" title="${esc(r.title || "")}">${esc(r.title || t("Clip"))} <small>${fmtDuration(refLen(r))}</small><button type="button" data-rm="${i}" aria-label="${esc(t("Remove"))}">×</button></span>`).join("")
      : `<span class="kb-hint">${target == null ? t("No clip chosen for all scenes yet.") : (data.clips || []).length ? t("None of its own – the clips for all scenes play.") : t("No clip chosen yet.")}</span>`;
  }
  $("[data-chosen]").onclick = (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    const l = list().slice();
    l.splice(Number(b.dataset.rm), 1);
    put(l);
  };
  el.querySelectorAll("[data-target]").forEach(
    (r) =>
      (r.onchange = () => {
        target = r.value === "all" ? null : scene.id;
        paintChosen();
      })
  );
  paintChosen();

  const card = (img, title, sub, attrs) => `<button type="button" class="kb-cut-scene" ${attrs} title="${esc(title)}">${img ? `<img loading="lazy" alt="" src="${esc(img)}">` : `<img alt="">`}<span>${esc(title)}</span><span class="kb-oc-sub">${esc(sub)}</span></button>`;
  async function search() {
    const id = ++reqId;
    const q = $("[data-q]").value.trim();
    const grid = $("[data-grid]");
    grid.innerHTML = `<p class="kb-hint">${t("Loading …")}</p>`;
    try {
      if (tab === "markers") {
        const r = await gql(`query($f: FindFilterType) { findSceneMarkers(filter: $f) { scene_markers { id title seconds end_seconds screenshot primary_tag { name } scene { id title } } } }`, { f: { q, per_page: 36, sort: "created_at", direction: "DESC" } });
        if (id !== reqId) return;
        const ms = r.findSceneMarkers.scene_markers;
        markers = ms;
        grid.innerHTML = ms.length
          ? ms
              .map((m, i) => card(m.screenshot, m.title || (m.primary_tag || {}).name || t("Marker"), `${(m.scene || {}).title || ""} · ${fmtDuration(m.seconds)}`, `data-mi="${i}"`))
              .join("")
          : `<p class="kb-hint">${t("No markers found")}</p>`;
      } else {
        const r = await findItems("scene", { q, per_page: 24, sort: "created_at", direction: "DESC" }, {}, null, { signal: undefined });
        if (id !== reqId) return;
        const ss = r.items;
        scenes = ss;
        grid.innerHTML = ss.length
          ? ss.map((s, i) => card(s.paths.screenshot, s.title || (s.files[0] || {}).basename || "", fmtDuration((s.files[0] || {}).duration || 0), `data-si="${i}"`)).join("")
          : `<p class="kb-hint">${t("Nothing found.")}</p>`;
      }
    } catch (e) {
      grid.innerHTML = "";
      errorToast(e, "O clip");
    }
  }
  let qt = 0;
  $("[data-q]").oninput = () => {
    clearTimeout(qt);
    qt = setTimeout(search, 350);
  };
  el.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        el.querySelectorAll("[data-tab]").forEach((q) => q.classList.toggle("is-on", q === b));
        $("[data-part]").hidden = true;
        const v = $("[data-vid]");
        v.pause();
        search();
      })
  );
  $("[data-grid]").onclick = async (e) => {
    const mi = e.target.closest("[data-mi]");
    const si = e.target.closest("[data-si]");
    if (mi) {
      const m = markers[Number(mi.dataset.mi)];
      const end = m.end_seconds && m.end_seconds > m.seconds ? m.end_seconds : m.seconds + DEF_LEN;
      put([...list(), { scene: m.scene.id, start: m.seconds, end, title: m.title || (m.primary_tag || {}).name || (m.scene || {}).title || "" }]);
      toast(t("O clip added"), "ok");
    } else if (si) {
      pickedScene = scenes[Number(si.dataset.si)];
      const u = await streamOf(pickedScene.id).catch(() => "");
      const v = $("[data-vid]");
      v.src = u;
      $("[data-part]").hidden = false;
      $("[data-from]").value = mmss(0);
      $("[data-to]").value = mmss(Math.min(DEF_LEN, (pickedScene.files[0] || {}).duration || DEF_LEN));
      $("[data-part]").scrollIntoView({ block: "nearest" });
    }
  };
  el.querySelectorAll("[data-here]").forEach((b) => (b.onclick = () => ($(b.dataset.here === "from" ? "[data-from]" : "[data-to]").value = mmss($("[data-vid]").currentTime))));
  $("[data-usepart]").onclick = () => {
    const a = parseTime($("[data-from]").value);
    const b = parseTime($("[data-to]").value);
    if (!pickedScene || !(a >= 0) || !(b > a)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    put([...list(), { scene: pickedScene.id, start: a, end: b, title: pickedScene.title || (pickedScene.files[0] || {}).basename || "" }]);
    toast(t("O clip added"), "ok");
  };
  $("[data-done]").onclick = () => {
    $("[data-vid]").pause();
    d.close && d.close();
  };
  search();
}
