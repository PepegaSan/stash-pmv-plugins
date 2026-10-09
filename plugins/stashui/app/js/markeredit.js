// Parts of a scene with their own tags: a marker with a start, an optional end, a main tag and more tags.
// Opened from the marker list in the player ("Add a part …" / the edit button of a marker).

import { esc, icon, toast, errorToast, openDrawer } from "./ui.js";
import { t } from "./i18n.js";
import { gql } from "./api.js";
import { parseTime } from "./audiox.js";
import { tagPicker } from "./views/tagpicker.js";

const fmt = (sec) => {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const FIELDS = "id title seconds end_seconds primary_tag { id name } tags { id name }";

// scene: the scene object (x); marker: an existing marker or null for a new one; video: the <video> (for "Here");
// defaultTag(): the id of the fallback main tag ("Highlight"); done(marker, isNew): called after saving
export function openMarkerEdit({ scene, marker, video, defaultTag, done }) {
  const isNew = !marker;
  const dur = (scene.files && scene.files[0] && scene.files[0].duration) || 0;
  const now = () => Math.round((video ? video.currentTime : 0) * 10) / 10;
  const start0 = marker ? marker.seconds : now();
  let main = marker && marker.primary_tag ? [marker.primary_tag.id] : [];
  let more = marker ? (marker.tags || []).filter((x) => !marker.primary_tag || x.id !== marker.primary_tag.id).map((x) => x.id) : [];

  const d = openDrawer({
    title: isNew ? t("Add a part") : t("Edit the part"),
    body: `
      <p class="kb-hint">${t("A part of this video with its own tags: set the start and the end (“Here” takes the spot you're watching), give it a main tag and more tags. It shows up in the marker list and on the timeline.")}</p>
      <label class="kb-form-row"><span>${t("Name")}</span><input class="kb-field" data-title value="${esc((marker && marker.title) || "")}" placeholder="${esc(t("Name (optional)"))}"></label>
      <div class="kb-music-range">
        <label class="kb-form-row"><span>${t("Start")}</span><span class="kb-music-t"><input class="kb-field" data-from value="${fmt(start0)}"><button type="button" class="kb-btn is-ghost" data-here="from">${t("Here")}</button></span></label>
        <label class="kb-form-row"><span>${t("End")}</span><span class="kb-music-t"><input class="kb-field" data-to value="${marker && marker.end_seconds ? fmt(marker.end_seconds) : ""}" placeholder="${esc(t("(none)"))}"><button type="button" class="kb-btn is-ghost" data-here="to">${t("Here")}</button></span></label>
      </div>
      <span class="kb-lab-t">${t("Main tag")} <small>${t("– the tag this part is filed under (needed)")}</small></span>
      <div class="kb-tagpick" data-main></div>
      <span class="kb-lab-t">${t("More tags")}</span>
      <div class="kb-tagpick" data-more></div>`,
    foot: `${marker ? `<button class="kb-btn is-ghost kb-qdel" data-del>${icon("close")}${t("Delete")}</button>` : ""}<span class="kb-spacer"></span><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
  });
  const el = d.el;
  const $ = (s) => el.querySelector(s);
  if (el.previousElementSibling) el.previousElementSibling.style.display = "none"; // the video stays usable
  el.classList.add("kb-cut");

  el.querySelectorAll("[data-here]").forEach((b) => (b.onclick = () => ($(b.dataset.here === "from" ? "[data-from]" : "[data-to]").value = fmt(now()))));
  tagPicker($("[data-main]"), {
    include: main,
    allowCreate: true,
    placeholder: t("Main tag"),
    onChange: (inc) => {
      main = inc.slice(-1); // only one main tag – the newest pick replaces the old one
      if (inc.length > 1) setTimeout(() => repaint(), 0);
    },
  });
  tagPicker($("[data-more]"), { include: more, allowCreate: true, placeholder: t("Add tag …"), onChange: (inc) => (more = inc) });
  // (a second pick in the main tag picker swaps its chip: the picker is drawn again with just the newest tag)
  function repaint() {
    const host = $("[data-main]");
    host.innerHTML = "";
    tagPicker(host, { include: main, allowCreate: true, placeholder: t("Main tag"), onChange: (inc) => {
      main = inc.slice(-1);
      if (inc.length > 1) setTimeout(() => repaint(), 0);
    } });
  }

  $("[data-save]").onclick = async () => {
    const a = parseTime($("[data-from]").value);
    const bRaw = $("[data-to]").value.trim();
    const b = bRaw ? parseTime(bRaw) : null;
    if (!(a >= 0) || (dur && a > dur)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    if (b != null && !(b > a)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    try {
      const primary = main[0] || (marker && marker.primary_tag && marker.primary_tag.id) || (await defaultTag());
      const input = {
        scene_id: scene.id,
        title: $("[data-title]").value.trim(),
        seconds: a,
        end_seconds: b,
        primary_tag_id: primary,
        tag_ids: more.filter((id) => id !== primary),
      };
      let m;
      if (isNew) m = (await gql(`mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { ${FIELDS} } }`, { i: input })).sceneMarkerCreate;
      else m = (await gql(`mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { ${FIELDS} } }`, { i: Object.assign({ id: marker.id }, input) })).sceneMarkerUpdate;
      d.close();
      toast(t("Saved"), "ok");
      done(m, isNew);
    } catch (e) {
      errorToast(e, "Marker");
    }
  };
  const del = $("[data-del]");
  if (del)
    del.onclick = async () => {
      try {
        await gql(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id: marker.id });
        d.close();
        done(null, false, marker.id);
      } catch (e) {
        errorToast(e, "Marker");
      }
    };
}
