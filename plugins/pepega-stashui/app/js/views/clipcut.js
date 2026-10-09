// "Cut clips" in the player: mark the parts you want (start / end from the video you're watching), collect them in a list
// and save them as new video files next to the original – separate or joined – which are then scanned into Stash.
// ffmpeg runs in the stashui backend (modes clip_cut / clip_status) as its own process.

import { esc, icon, toast, errorToast, openDrawer, store, fmtDuration } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { runBackend } from "../interactive.js";
import { parseTime } from "../audiox.js";

const fmt = (sec) => {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

export function openClipCut(x, video) {
  const dur = (x.files[0] || {}).duration || 0;
  const key = "clipDraft." + x.id;
  let clips = store.get(key, []); // [{ start, end, name }]
  const opts = Object.assign({ precise: true, join: false, folder: "same", meta: true }, store.get("clipOpts", {}));
  let stopAt = null;

  const d = openDrawer({
    title: t("Cut clips"),
    body: `
      <p class="kb-hint">${t("Play or scrub the video, press “Here” at the start and the end of a part, then “Add clip”. Save all clips as new videos – the original stays untouched.")}</p>
      <div class="kb-music-range">
        <label class="kb-form-row"><span>${t("Start")}</span><span class="kb-music-t"><input class="kb-field" data-from value="0:00.0"><button type="button" class="kb-btn is-ghost" data-here="from">${t("Here")}</button></span></label>
        <label class="kb-form-row"><span>${t("End")}</span><span class="kb-music-t"><input class="kb-field" data-to value="${fmt(Math.min(dur, 30))}"><button type="button" class="kb-btn is-ghost" data-here="to">${t("Here")}</button></span></label>
      </div>
      <div class="kb-cut-add"><button class="kb-btn is-primary" data-add>${icon("plus")}${t("Add clip")}</button><span class="kb-hint">${t("The whole video is {d}.", { d: esc(fmtDuration(dur)) })}</span></div>
      <div class="kb-cut-list" data-list></div>
      <div class="kb-cut-opts">
        <label class="kb-cut-opt"><input type="radio" name="kb-cut-q" value="fast" data-q${opts.precise ? "" : " checked"}><span><b>${t("Fast")}</b> ${t("– no re-encoding, same quality; the start snaps to the nearest earlier keyframe (can be a second or two off)")}</span></label>
        <label class="kb-cut-opt"><input type="radio" name="kb-cut-q" value="precise" data-q${opts.precise ? " checked" : ""}><span><b>${t("Exact")}</b> ${t("– re-encoded (H.264), frame-accurate, takes longer")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-join${opts.join ? " checked" : ""}><span>${t("Join all clips into one video")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-sub${opts.folder === "Clips" ? " checked" : ""}><span>${t("Put them in a subfolder “Clips” next to the original")}</span></label>
        <label class="kb-cut-opt"><input type="checkbox" data-meta${opts.meta ? " checked" : ""}><span>${t("Take over performers, tags and studio, and tag them “Clip”")}</span></label>
      </div>
      <div class="kb-job-bar" data-barwrap hidden><i data-bar style="width:0%"></i></div>
      <p class="kb-hint" data-note></p>`,
    onClose: () => video && video.removeEventListener("timeupdate", onTime),
    foot: `<button class="kb-btn is-ghost" data-clear>${t("Clear list")}</button><span class="kb-spacer"></span><button class="kb-btn is-primary" data-save>${icon("download")}${t("Save clips")}</button>`,
  });
  const el = d.el;
  const $ = (s) => el.querySelector(s);
  if (el.previousElementSibling) el.previousElementSibling.style.display = "none"; // (the scrim) the video stays usable
  el.classList.add("kb-cut");

  const now = () => (video ? video.currentTime : 0);
  el.querySelectorAll("[data-here]").forEach((b) => (b.onclick = () => ($(b.dataset.here === "from" ? "[data-from]" : "[data-to]").value = fmt(now()))));
  const keep = () => store.set(key, clips);

  function paintList() {
    const total = clips.reduce((n, c) => n + (c.end - c.start), 0);
    $("[data-list]").innerHTML = clips.length
      ? clips
          .map(
            (c, i) => `<div class="kb-cut-row" data-i="${i}">
              <b>${i + 1}</b><span class="kb-cut-time">${fmt(c.start)} – ${fmt(c.end)} <small>${fmt(c.end - c.start)}</small></span>
              <input class="kb-field" data-name placeholder="${esc(t("Name (optional)"))}" value="${esc(c.name || "")}">
              <button class="kb-btn is-icon is-ghost" data-play title="${esc(t("Play this clip"))}">${icon("play")}</button>
              <button class="kb-btn is-icon is-ghost" data-edit title="${esc(t("Back into the start/end fields to change"))}">${icon("edit")}</button>
              <button class="kb-btn is-icon is-ghost" data-rm title="${esc(t("Remove"))}">${icon("close")}</button>
            </div>`
          )
          .join("") + `<p class="kb-hint">${t("{n} clips, {d} in total", { n: clips.length, d: fmt(total) })}</p>`
      : `<p class="kb-hint">${t("No clips yet.")}</p>`;
    $("[data-save]").disabled = !clips.length;
  }
  paintList();

  $("[data-add]").onclick = () => {
    const a = parseTime($("[data-from]").value);
    const b = parseTime($("[data-to]").value);
    if (!(a >= 0) || !(b > a) || (dur && a >= dur)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    clips.push({ start: a, end: dur ? Math.min(b, dur) : b, name: "" });
    keep();
    paintList();
    // the next clip starts where this one ended
    $("[data-from]").value = fmt(b);
    $("[data-to]").value = fmt(dur ? Math.min(dur, b + 30) : b + 30);
  };
  $("[data-list]").addEventListener("click", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const i = Number(row.dataset.i);
    const c = clips[i];
    if (e.target.closest("[data-rm]")) {
      clips.splice(i, 1);
      keep();
      paintList();
    } else if (e.target.closest("[data-edit]")) {
      $("[data-from]").value = fmt(c.start);
      $("[data-to]").value = fmt(c.end);
      clips.splice(i, 1);
      keep();
      paintList();
    } else if (e.target.closest("[data-play]") && video) {
      video.currentTime = c.start;
      stopAt = c.end;
      video.play().catch(() => {});
    }
  });
  $("[data-list]").addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]");
    if (row && e.target.matches("[data-name]")) {
      clips[Number(row.dataset.i)].name = e.target.value;
      keep();
    }
  });
  const onTime = () => {
    if (stopAt != null && video.currentTime >= stopAt) {
      video.pause();
      stopAt = null;
    }
  };
  video && video.addEventListener("timeupdate", onTime);
  $("[data-clear]").onclick = () => {
    clips = [];
    keep();
    paintList();
  };

  async function save() {
    if (!clips.length) return;
    const o = { precise: $("[data-q][value=precise]").checked, join: $("[data-join]").checked, folder: $("[data-sub]").checked ? "Clips" : "same", meta: $("[data-meta]").checked };
    store.set("clipOpts", o);
    const btns = el.querySelectorAll(".kb-drawer-foot .kb-btn");
    btns.forEach((b) => (b.disabled = true));
    $("[data-barwrap]").hidden = false;
    $("[data-bar]").style.width = "3%";
    try {
      const r = await runBackend({ mode: "clip_cut", scene_id: x.id, clips, precise: o.precise, join: o.join, folder: o.folder });
      let st;
      for (;;) {
        await new Promise((res) => setTimeout(res, 1200));
        st = await runBackend({ mode: "clip_status", job: r.job });
        $("[data-bar]").style.width = Math.max(3, Math.round((100 * (st.i || 0)) / (st.n || 1))) + "%";
        $("[data-note]").textContent = st.state === "running" ? t("Cutting clip {i} of {n} …", { i: Math.min(st.n, (st.i || 0) + 1), n: st.n || clips.length }) : "";
        if (st.state !== "running") break;
      }
      if (st.state === "error") throw new Error(st.error || "ffmpeg failed");
      $("[data-note]").textContent = t("Saved – Stash is scanning the new video(s) …");
      await intoStash(x, st.files, o);
      toast(t("{n} new video(s) saved and added to Stash", { n: st.files.length }), "ok");
      clips = [];
      keep();
      paintList();
      $("[data-note]").textContent = st.files.map((f) => f.split(/[\\/]/).pop()).join(", ");
    } catch (err) {
      errorToast(err, t("Cut clips"));
      $("[data-note]").textContent = "";
    } finally {
      $("[data-barwrap]").hidden = true;
      btns.forEach((b) => (b.disabled = false));
      $("[data-save]").disabled = !clips.length;
    }
  }
  $("[data-save]").onclick = save;
}

// Scan the new files, then give the scenes the original's performers, tags and studio, plus the tag "Clip"
async function intoStash(x, files, o) {
  const job = (await gql(`mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }`, { i: { paths: files } })).metadataScan;
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const j = await gql(`query($i: FindJobInput!) { findJob(input: $i) { status } }`, { i: { id: job } }).catch(() => ({ findJob: null }));
    if (!j.findJob || ["FINISHED", "CANCELLED", "FAILED"].includes(j.findJob.status)) break;
  }
  let tagId = null;
  if (o.meta) {
    const f = await gql(`query { findTags(tag_filter: { name: { value: "Clip", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`);
    tagId = f.findTags.tags[0] ? f.findTags.tags[0].id : (await gql(`mutation { tagCreate(input: { name: "Clip" }) { id } }`)).tagCreate.id;
  }
  for (const f of files) {
    const base = f.split(/[\\/]/).pop();
    const s = await gql(`query($f: SceneFilterType) { findScenes(scene_filter: $f, filter: { per_page: 5 }) { scenes { id files { path } } } }`, { f: { path: { value: base, modifier: "INCLUDES" } } });
    const sc = s.findScenes.scenes.find((v) => v.files.some((fl) => fl.path.split(/[\\/]/).pop() === base));
    if (!sc || !o.meta) continue;
    const input = {
      id: sc.id,
      performer_ids: (x.performers || []).map((p) => p.id),
      tag_ids: [...new Set([...(x.tags || []).map((tg) => tg.id), tagId])],
      title: base.replace(/\.[^.]+$/, ""),
    };
    if (x.studio) input.studio_id = x.studio.id;
    await gql(`mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input });
  }
}
