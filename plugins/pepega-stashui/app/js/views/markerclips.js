// Clips from markers: turns markers into new video files. A marker with a start and an end becomes a clip as it is; for markers
// without an end you choose how long they run ("the next 20 s", optionally up to the next marker) or type the end of each one.
// Opened from the Markers page (everything the search/tag filter shows) and from "Cut clips" in the player (this scene's markers).
// The cutting itself is the same backend job as "Cut clips" (clip_cut / clip_status), one job per scene.

import { esc, icon, toast, errorToast, openDrawer, store } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { runBackend } from "../interactive.js";
import { parseTime } from "../audiox.js";
import { fmt, intoStash } from "./clipcut.js";

const Q = `query($f: FindFilterType, $m: SceneMarkerFilterType) { findSceneMarkers(filter: $f, scene_marker_filter: $m) { count scene_markers {
  id title seconds end_seconds primary_tag { id name } tags { id }
  scene { id title files { basename duration width height } performers { id } tags { id } studio { id } } } } }`;
const MAX = 1500;

async function loadMarkers({ q, tags, sceneId }) {
  const m = {};
  if (tags && tags.length) m.tags = { value: tags, modifier: "INCLUDES_ALL" };
  if (sceneId) m.scenes = { value: [String(sceneId)], modifier: "INCLUDES" };
  const out = [];
  const seen = new Set();
  let count = 0;
  for (let page = 1; out.length < MAX; page++) {
    const d = (await gql(Q, { f: { q: q || undefined, page, per_page: 100, sort: "scene_id", direction: "ASC" }, m }, { heavy: true })).findSceneMarkers;
    count = d.count;
    const list = d.scene_markers;
    for (const mk of list) if (!seen.has(mk.id) && mk.scene && (!sceneId || String(mk.scene.id) === String(sceneId))) (seen.add(mk.id), out.push(mk));
    if (list.length < 100 || page * 100 >= count) break;
  }
  out.sort((a, b) => Number(a.scene.id) - Number(b.scene.id) || a.seconds - b.seconds);
  return { markers: out, capped: count > out.length && out.length >= MAX };
}

export async function openMarkerClips({ q = "", tags = [], sceneId = null } = {}) {
  const o = Object.assign({ mode: "len", len: 20, stop: false, mtags: true }, store.get("markerClipOpts", {}));
  const cut = Object.assign({ precise: true, join: false, folder: "same", meta: true }, store.get("clipOpts", {}));
  let rows = []; // { m, dur, end, real, off, manual }
  let busy = false;

  const d = openDrawer({
    title: t("Clips from markers"),
    body: `
      <p class="kb-hint">${t("Every marker becomes a video clip. A marker that has an end is cut from its start to its end; for markers without an end choose how long they run – or type the end of any marker in the list.")}</p>
      <div class="kb-mkc-sec">
        <label class="kb-cut-opt"><input type="radio" name="kb-mkc-mode" value="len" data-mode${o.mode === "len" ? " checked" : ""}><span><b>${t("Markers without an end: take the next")}</b>
          <input class="kb-field kb-mkc-len" type="number" min="1" max="3600" step="1" data-len value="${Number(o.len) || 20}"> ${t("seconds")}
          ${[5, 10, 20, 30, 60].map((n) => `<button type="button" class="kb-chip" data-quick="${n}">${n} s</button>`).join("")}</span></label>
        <label class="kb-cut-opt kb-mkc-sub"><input type="checkbox" data-stop${o.stop ? " checked" : ""}><span>${t("…but stop at the next marker of the same video")}</span></label>
        <label class="kb-cut-opt"><input type="radio" name="kb-mkc-mode" value="skip" data-mode${o.mode === "skip" ? " checked" : ""}><span>${t("Leave out markers without an end")}</span></label>
      </div>
      <div class="kb-mkc-pick"><span class="kb-hint" data-sum></span><span class="kb-spacer"></span>
        <button type="button" class="kb-btn is-ghost" data-sel="all">${t("Select all")}</button>
        <button type="button" class="kb-btn is-ghost" data-sel="end">${t("Only those with an end")}</button>
        <button type="button" class="kb-btn is-ghost" data-sel="none">${t("Select none")}</button></div>
      <div class="kb-mkc-list" data-list><div class="kb-loading">${t("Loading …")}</div></div>
      <div class="kb-cut-opts">
        <label class="kb-cut-opt"><input type="radio" name="kb-mkc-q" value="fast" data-q${cut.precise ? "" : " checked"}><span><b>${t("Fast")}</b> ${t("– no re-encoding, same quality; the start snaps to the nearest earlier keyframe (can be a second or two off)")}</span></label>
        <label class="kb-cut-opt"><input type="radio" name="kb-mkc-q" value="precise" data-q${cut.precise ? " checked" : ""}><span><b>${t("Exact")}</b> ${t("– re-encoded (H.264), frame-accurate, takes longer")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-join${cut.join ? " checked" : ""}><span>${t("Join the clips of each video into one")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-sub${cut.folder === "Clips" ? " checked" : ""}><span>${t("Put them in a subfolder “Clips” next to the original")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-meta${cut.meta ? " checked" : ""}><span>${t("Take over performers, tags and studio, and tag them “Clip”")}</span></label>
        <label class="kb-cut-opt kb-mkc-sub"><input type="checkbox" data-mtags${o.mtags ? " checked" : ""}><span>${t("Also give each clip the tags of its marker")}</span></label>
      </div>
      <div class="kb-job-bar" data-barwrap hidden><i data-bar style="width:0%"></i></div>
      <p class="kb-hint" data-note></p>`,
    foot: `<span class="kb-hint" data-total></span><span class="kb-spacer"></span><button class="kb-btn is-primary" data-save disabled>${icon("download")}${t("Save clips")}</button>`,
  });
  const el = d.el;
  el.classList.add("kb-mkc");
  const $ = (s) => el.querySelector(s);

  const nextStart = (i) => {
    for (let j = i + 1; j < rows.length && rows[j].m.scene.id === rows[i].m.scene.id; j++) if (rows[j].m.seconds > rows[i].m.seconds) return rows[j].m.seconds;
    return null;
  };
  // the end of every marker the user hasn't typed an end for
  function recompute() {
    rows.forEach((r, i) => {
      const m = r.m;
      r.real = m.end_seconds > m.seconds;
      if (r.manual) return;
      if (r.real) r.end = r.dur ? Math.min(m.end_seconds, r.dur) : m.end_seconds;
      else if (o.mode === "skip") r.end = null;
      else {
        let end = m.seconds + o.len;
        const nx = o.stop ? nextStart(i) : null;
        if (nx != null) end = Math.min(end, nx);
        if (r.dur) end = Math.min(end, r.dur);
        r.end = end > m.seconds + 0.3 ? end : null;
      }
    });
  }
  const used = (r) => r.end != null && r.end > r.m.seconds && !r.off;

  function paintVals() {
    recompute();
    let n = 0;
    let secs = 0;
    rows.forEach((r, i) => {
      const row = r.el;
      const on = used(r);
      if (on) (n++, (secs += r.end - r.m.seconds));
      row.classList.toggle("is-none", r.end == null);
      row.querySelector("[data-on]").checked = on;
      row.querySelector("[data-on]").disabled = r.end == null;
      const inp = row.querySelector("[data-end]");
      if (document.activeElement !== inp) inp.value = r.end == null ? "" : fmt(r.end);
      row.querySelector("[data-len]").textContent = r.end == null ? t("no end") : fmt(r.end - r.m.seconds);
      row.querySelector(".kb-mkc-badge").hidden = r.real || r.manual;
    });
    const ends = rows.filter((r) => r.real).length;
    $("[data-sum]").textContent = rows.length ? t("{n} markers, {e} with an end", { n: rows.length, e: ends }) : "";
    $("[data-total]").textContent = n ? t("{n} clips, {d} in total", { n, d: fmt(secs) }) : "";
    $("[data-save]").disabled = busy || !n;
  }

  function paintList(capped) {
    $("[data-list]").innerHTML = rows.length
      ? rows
          .map((r, i) => {
            const m = r.m;
            const name = m.title || (m.primary_tag && m.primary_tag.name) || t("Marker");
            return `<div class="kb-mkc-row" data-i="${i}">
              <input type="checkbox" data-on aria-label="${esc(t("Select"))}">
              <span class="kb-mkc-name"><b>${esc(name)}</b><small>${esc(m.scene.title || ((m.scene.files || [])[0] || {}).basename || "")}</small></span>
              <span class="kb-mkc-time"><span>${fmt(m.seconds)} –</span><input class="kb-field" data-end inputmode="decimal" title="${esc(t("End time (e.g. 1:25) – or +15 for 15 seconds after the start"))}"><small data-len></small><em class="kb-mkc-badge" hidden>${t("no end")}</em></span>
            </div>`;
          })
          .join("") + (capped ? `<p class="kb-hint">${t("Only the first {n} markers are shown – narrow the search to see the others.", { n: MAX })}</p>` : "")
      : `<div class="kb-empty"><b>${t("No markers found")}</b></div>`;
    el.querySelectorAll(".kb-mkc-row").forEach((row) => (rows[Number(row.dataset.i)].el = row));
    paintVals();
  }

  const keepOpts = () => store.set("markerClipOpts", { mode: o.mode, len: o.len, stop: o.stop, mtags: o.mtags });
  el.querySelectorAll("[data-mode]").forEach((r) => (r.onchange = () => ((o.mode = el.querySelector("[data-mode]:checked").value), keepOpts(), paintVals())));
  $("[data-len]").oninput = (e) => {
    const n = Number(e.target.value);
    if (n >= 1) ((o.len = n), keepOpts(), (el.querySelector("[data-mode][value=len]").checked = true), (o.mode = "len"), paintVals());
  };
  el.querySelectorAll("[data-quick]").forEach(
    (b) =>
      (b.onclick = () => {
        $("[data-len]").value = o.len = Number(b.dataset.quick);
        el.querySelector("[data-mode][value=len]").checked = true;
        o.mode = "len";
        rows.forEach((r) => !r.real && (r.manual = false)); // a general choice replaces typed ends
        keepOpts();
        paintVals();
      })
  );
  $("[data-stop]").onchange = (e) => ((o.stop = e.target.checked), keepOpts(), paintVals());
  $("[data-mtags]").onchange = (e) => ((o.mtags = e.target.checked), keepOpts());
  const metaBox = $("[data-meta]");
  const syncMeta = () => (($("[data-mtags]").disabled = !metaBox.checked), $("[data-mtags]").closest("label").classList.toggle("is-off", !metaBox.checked));
  metaBox.onchange = syncMeta;
  syncMeta();

  el.querySelectorAll("[data-sel]").forEach(
    (b) =>
      (b.onclick = () => {
        rows.forEach((r) => (r.off = b.dataset.sel === "none" || (b.dataset.sel === "end" && !r.real)));
        paintVals();
      })
  );
  $("[data-list]").addEventListener("change", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const r = rows[Number(row.dataset.i)];
    if (e.target.matches("[data-on]")) {
      r.off = !e.target.checked;
    } else if (e.target.matches("[data-end]")) {
      const raw = e.target.value.trim();
      const v = raw.startsWith("+") ? r.m.seconds + parseTime(raw.slice(1)) : parseTime(raw);
      if (!raw) r.manual = false;
      else if (!(v > r.m.seconds) || (r.dur && v > r.dur + 0.5)) {
        toast(t("Start/end don't fit – the end must be after the start"), "error");
        e.target.value = r.end == null ? "" : fmt(r.end);
        return;
      } else ((r.manual = true), (r.end = r.dur ? Math.min(v, r.dur) : v), (r.off = false));
    }
    paintVals();
  });

  // ---- save ----
  async function runCut(sceneId, clips, ox, x) {
    const f0 = (x.files || [])[0] || {};
    const r = await runBackend({ mode: "clip_cut", scene_id: sceneId, clips, precise: ox.precise, join: ox.join, folder: ox.folder, ref_w: f0.width || 0, ref_h: f0.height || 0 });
    for (;;) {
      await new Promise((res) => setTimeout(res, 1000));
      const st = await runBackend({ mode: "clip_status", job: r.job });
      if (st.state === "error") throw new Error(st.error || "ffmpeg failed");
      if (st.state !== "running") return st.files;
    }
  }

  async function save() {
    const picked = rows.filter(used);
    if (!picked.length || busy) return;
    const ox = { precise: $("[data-q][value=precise]").checked, join: $("[data-join]").checked, folder: $("[data-sub]").checked ? "Clips" : "same", meta: metaBox.checked };
    store.set("clipOpts", Object.assign(store.get("clipOpts", {}), ox));
    busy = true;
    const btns = el.querySelectorAll(".kb-drawer-foot .kb-btn, .kb-mkc-pick .kb-btn");
    btns.forEach((b) => (b.disabled = true));
    $("[data-barwrap]").hidden = false;
    $("[data-bar]").style.width = "3%";
    // one cutting job per scene (and per 100 clips – the backend's limit)
    const jobs = [];
    for (const r of picked) {
      let j = jobs[jobs.length - 1];
      if (!j || j.scene.id !== r.m.scene.id || j.rows.length >= 100) jobs.push((j = { scene: r.m.scene, rows: [] }));
      j.rows.push(r);
    }
    let done = 0;
    let made = 0;
    const failed = [];
    const when = (s) => {
      const m = Math.floor(s / 60);
      return `${m}-${String(Math.floor(s % 60)).padStart(2, "0")}`;
    };
    for (const j of jobs) {
      const label = j.scene.title || ((j.scene.files || [])[0] || {}).basename || "#" + j.scene.id;
      try {
        $("[data-note]").textContent = t("Cutting clip {i} of {n} …", { i: done + 1, n: picked.length }) + " " + label;
        const clips = j.rows.map((r) => {
          const nm = r.m.title || (r.m.primary_tag && r.m.primary_tag.name) || "";
          return { start: r.m.seconds, end: r.end, name: `${nm || t("Marker")} (${when(r.m.seconds)})` };
        });
        const files = await runCut(j.scene.id, clips, ox, j.scene);
        $("[data-note]").textContent = t("Saved – Stash is scanning the new video(s) …");
        const tagsOf = (rs) => (o.mtags ? [...new Set(rs.flatMap((r) => [r.m.primary_tag && r.m.primary_tag.id, ...(r.m.tags || []).map((g) => g.id)]).filter(Boolean))] : []);
        const extra = ox.join ? [{ tagIds: tagsOf(j.rows) }] : j.rows.map((r) => ({ tagIds: tagsOf([r]) }));
        await intoStash({ performers: j.scene.performers, tags: j.scene.tags, studio: j.scene.studio }, files, ox, extra);
        made += files.length;
      } catch (err) {
        failed.push(label + ": " + (err.message || err));
      }
      done += j.rows.length;
      $("[data-bar]").style.width = Math.max(3, Math.round((100 * done) / picked.length)) + "%";
    }
    busy = false;
    $("[data-barwrap]").hidden = true;
    btns.forEach((b) => (b.disabled = false));
    paintVals();
    if (made) toast(t("{n} new video(s) saved and added to Stash", { n: made }), "ok");
    $("[data-note]").textContent = "";
    if (failed.length) errorToast(new Error(failed.join("\n")), t("Clips from markers"));
  }
  $("[data-save]").onclick = save;

  try {
    const { markers, capped } = await loadMarkers({ q, tags, sceneId });
    rows = markers.map((m) => ({ m, dur: ((m.scene.files || [])[0] || {}).duration || 0, end: null, real: false, off: false, manual: false }));
    paintList(capped);
  } catch (err) {
    $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the markers")}</b><p>${esc(err.message)}</p></div>`;
  }
}
