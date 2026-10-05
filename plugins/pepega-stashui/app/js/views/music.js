// "Music" in the player: the sound of this video – straight into the PMV Generator, downloaded as a
// sound file, or kept next to the library. The PMV Generator's backend (ffmpeg) does the cutting.

import { esc, icon, toast, errorToast, openDrawer, fmtDuration } from "../ui.js";
import { t } from "../i18n.js";
import { app, PMV_PAGE } from "../main.js";
import { extractAudio, parseTime, fmtTime, downloadBlob } from "../audiox.js";

const LIMIT = 20 * 60; // more sound than that at once is no song any more – and heavy for the browser

export function openMusic(x, video) {
  const dur = (x.files[0] || {}).duration || 0;
  const now = video ? video.currentTime : 0;
  // Short video: all of it. Long one: 5 minutes from where you are
  const from = dur > LIMIT ? Math.floor(now) : 0;
  const to = dur > LIMIT ? Math.min(dur, from + 300) : dur;
  const d = openDrawer({
    title: t("Music from this video"),
    body: `
      <p class="kb-hint">${t("Take the sound of this video – straight into the PMV Generator as the song, or as a sound file (.m4a).")}</p>
      <div class="kb-music-range">
        <label class="kb-form-row"><span>${t("From")}</span><span class="kb-music-t"><input class="kb-field" data-from value="${fmtTime(from)}"><button type="button" class="kb-btn is-ghost" data-here="from">${t("Here")}</button></span></label>
        <label class="kb-form-row"><span>${t("To")}</span><span class="kb-music-t"><input class="kb-field" data-to value="${fmtTime(to)}"><button type="button" class="kb-btn is-ghost" data-here="to">${t("Here")}</button></span></label>
      </div>
      <p class="kb-hint">${t("“Here” takes the current position of the video. The whole video is {d}.", { d: esc(fmtDuration(dur)) })}${dur > LIMIT ? " " + t("At most 20 minutes at once.") : ""}</p>
      <div class="kb-job-bar" data-barwrap hidden><i data-bar style="width:0%"></i></div>`,
    foot: `<button class="kb-btn" data-dl>${icon("download")}${t("Download")}</button><button class="kb-btn" data-keep title="${esc(t("Saved into the library folder “PMV Generator/Songs”"))}">${icon("folder")}${t("Save to library")}</button><span class="kb-spacer"></span><button class="kb-btn is-primary" data-pmv>${icon("music")}${t("Open in PMV Generator")}</button>`,
  });
  const el = d.el;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll("[data-here]").forEach((b) => (b.onclick = () => ($(b.dataset.here === "from" ? "[data-from]" : "[data-to]").value = fmtTime(video ? video.currentTime : 0))));

  function range() {
    const a = parseTime($("[data-from]").value);
    const b = parseTime($("[data-to]").value);
    if (!(a >= 0) || !(b >= 0) || (b && b <= a) || (dur && a >= dur)) {
      toast(t("From/to don't fit – e.g. 0:45 to 3:30"), "error");
      return null;
    }
    const end = b && (!dur || b < dur - 0.5) ? b : 0;
    if ((end || dur) - a > LIMIT) {
      toast(t("At most 20 minutes at once."), "error");
      return null;
    }
    return { start: a, end };
  }

  async function extract(save) {
    const r = range();
    if (!r) return null;
    const btns = el.querySelectorAll(".kb-drawer-foot .kb-btn");
    btns.forEach((b) => (b.disabled = true));
    $("[data-barwrap]").hidden = false;
    try {
      return await extractAudio({
        sceneId: x.id,
        start: r.start,
        end: r.end,
        save,
        plugin: app.pmvPlugin || "pepega-pmvGenerator",
        onProgress: (p, step) => ($("[data-bar]").style.width = `${Math.round((step === "extract" ? 0.05 : 0.05 + 0.95 * p) * 100)}%`),
      });
    } catch (e) {
      errorToast(e, "Music");
      return null;
    } finally {
      btns.forEach((b) => (b.disabled = false));
      $("[data-barwrap]").hidden = true;
      $("[data-bar]").style.width = "0%";
    }
  }

  $("[data-dl]").onclick = async () => {
    const r = await extract(false);
    if (!r) return;
    downloadBlob(r.blob, r.name + ".m4a");
    toast(t("Sound file downloaded"), "ok");
  };
  $("[data-keep]").onclick = async () => {
    const r = await extract(true);
    if (r && r.saved) toast(t("Saved: {path}", { path: r.saved }), "ok");
  };
  // The PMV Generator does the cutting itself – it opens with this video and the range already filled in
  $("[data-pmv]").onclick = () => {
    const r = range();
    if (!r) return;
    location.href = `${PMV_PAGE}&song=${encodeURIComponent(x.id)}&t0=${r.start}${r.end ? `&t1=${r.end}` : ""}`;
  };
}
