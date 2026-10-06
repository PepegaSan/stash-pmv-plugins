// Edit drawer: one item in detail, several items together (add/remove tags, rating).

import { esc, icon, openDrawer, toast, errorToast, starsHtml, ratingClick, ratingFromInput, plural, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import { gql, getScene, getImage, getGallery, updateItem, bulkUpdate, destroyItems, favoriteTagId, setFavorite } from "../api.js";
import { tagPicker } from "./tagpicker.js";
import { perfPicker, knowPerformers } from "./perfpicker.js";
import { studioPicker } from "./studiopicker.js";
import { createStudio } from "./studioedit.js";
import { mountSceneScrape } from "./scenescrape.js";
import { app } from "../main.js";

const UNITS = { scene: ["scene", "scenes"], image: ["image", "images"], gallery: ["gallery", "galleries"] };
// Whole sentences per kind – other languages can't just insert the word
const TITLES = { scene: ["Edit scene", "Delete scene?"], image: ["Edit image", "Delete image?"], gallery: ["Edit gallery", "Delete gallery?"] };
const GET = { scene: getScene, image: getImage, gallery: getGallery };

// "2019", "2019-05", "2019-5-7", "2019.05.17" or "2019/05/17" → "2019-05-17" (a year alone → January 1st, a month alone → the 1st)
export function dateOf(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const m = /^(\d{4})(?:[-./ ](\d{1,2})(?:[-./ ](\d{1,2}))?)?$/.exec(s);
  if (!m) throw new Error(t("The date should start with the year – like 2019, 2019-05 or 2019-05-17."));
  const [y, mo, d] = [m[1], Number(m[2] || 1), Number(m[3] || 1)];
  const dt = new Date(Date.UTC(Number(y), mo - 1, d));
  if (mo < 1 || mo > 12 || d < 1 || dt.getUTCMonth() !== mo - 1) throw new Error(t("That date doesn't exist."));
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function openEditor(kind, pieces, { onSaved, onDeleted } = {}) {
  if (pieces.length === 1) return editOne(kind, pieces[0].id, { onSaved, onDeleted });
  return editMany(kind, pieces, { onSaved });
}

// The rating in the chosen system (stars, half stars … or 0–10); v = rating100, 0 = none
function starInput(host, value, onChange) {
  let v = value || 0;
  const paint = () => {
    host.innerHTML = starsHtml(v, true) + `<button type="button" class="kb-btn is-ghost" data-clear${v ? "" : " hidden"}>${t("None")}</button>`;
  };
  host.addEventListener("click", (e) => {
    const r = ratingClick(e, v);
    if (r !== undefined) v = r || 0;
    else if (e.target.closest("[data-clear]")) v = 0;
    else return;
    paint();
    onChange(v);
  });
  host.addEventListener("change", (e) => {
    const r = e.target.matches("[data-ratedec]") ? ratingFromInput(e.target) : undefined;
    if (r === undefined) return;
    v = r || 0;
    host.querySelector("[data-clear]").hidden = !v;
    onChange(v);
  });
  paint();
}

async function editOne(kind, id, { onSaved, onDeleted }) {
  let x;
  try {
    x = await GET[kind](id);
  } catch (e) {
    return errorToast(e, "Couldn't be loaded");
  }
  const favId = await favoriteTagId(false);
  const tagIds = x.tags.map((tg) => tg.id).filter((tg) => tg !== favId);
  const isFav = !!favId && x.tags.some((tg) => tg.id === favId);
  const path =
    kind === "scene" ? (x.files[0] || {}).path : kind === "image" ? (x.visual_files[0] || {}).path : (x.folder && x.folder.path) || ((x.files || [])[0] || {}).path;
  const state = { rating100: x.rating100 || 0, tags: tagIds, fav: isFav };

  const d = openDrawer({
    title: t(TITLES[kind][0]),
    body: `
      ${kind === "scene" ? '<section class="kb-pe-scrape" data-scrape></section>' : ""}
      <label class="kb-form-row"><span>${t("Title")}</span><input class="kb-field" data-e="title" value="${esc(x.title || "")}" placeholder="${esc(path ? path.split(/[\\/]/).pop() : "")}"></label>
      <div class="kb-form-row"><span>${t("Rating")}</span><div data-stars></div></div>
      <label class="kb-switch"><input type="checkbox" data-e="fav"${isFav ? " checked" : ""}><i></i><span>${t("Favorite (heart)")}</span></label>
      <div class="kb-form-row"><span>${t("Tags")}</span><div class="kb-tagpick" data-tags></div></div>
      <div class="kb-form-row"><span>${t("Performers")}</span><div class="kb-tagpick" data-perfs></div></div>
      <div class="kb-form-row"><span>${t("Studio")}</span><div class="kb-tagpick" data-studio></div></div>
      <div class="kb-form-row"><span>${t("Date")}</span><span class="kb-datefield"><input class="kb-field" type="text" inputmode="numeric" data-e="date" value="${esc(x.date || "")}" placeholder="${t("YYYY-MM-DD")}" autocomplete="off" title="${t("Year first: 2019, 2019-05 or 2019-05-17 – a year alone is saved as January 1st")}"><button type="button" class="kb-btn is-icon" data-datepick title="${t("Calendar")}" aria-label="${t("Calendar")}">${icon("slides")}</button><input type="date" class="kb-date-native" data-datenative tabindex="-1" aria-hidden="true"></span></div>
      <label class="kb-form-row"><span>${t("Description")}</span><textarea class="kb-field" data-e="details" rows="4">${esc(x.details || "")}</textarea></label>
      <label class="kb-form-row"><span>${t("Links (one per line)")}</span><textarea class="kb-field" data-e="urls" rows="2">${esc((x.urls || []).join("\n"))}</textarea></label>
      <label class="kb-switch"><input type="checkbox" data-e="organized"${x.organized ? " checked" : ""}><i></i><span>${t("Organized")}</span></label>
      ${path ? `<p class="kb-hint">${t("File:")} ${esc(path)}</p>` : ""}`,
    foot: `<button class="kb-btn is-danger" data-del>${t("Delete")}</button><span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
  });
  const el = d.el;
  let cover; // a picture found by the scraper (data: URL), saved as the cover
  const stashAdds = []; // StashDB-style links found by the scraper: { endpoint, stash_id }
  if (kind === "scene") el.classList.add("kb-pe");
  starInput(el.querySelector("[data-stars]"), state.rating100, (v) => (state.rating100 = v));
  const picker = tagPicker(el.querySelector("[data-tags]"), { include: tagIds, allowCreate: true, placeholder: t("Search or create a tag") });
  knowPerformers(x.performers);
  const perfs = perfPicker(el.querySelector("[data-perfs]"), { include: (x.performers || []).map((p) => p.id), modes: false, allowCreate: true, placeholder: t("Search or create a performer") });
  const studio = studioPicker(el.querySelector("[data-studio]"), { include: x.studio ? [x.studio.id] : [], names: x.studio ? { [x.studio.id]: x.studio.name } : {}, create: createStudio, placeholder: t("Search or create a studio") });
  el.querySelector("[data-cancel]").onclick = d.close;
  if (kind === "scene")
    mountSceneScrape(el.querySelector("[data-scrape]"), {
      id,
      title: x.title || ((x.files[0] || {}).basename || "").replace(/\.[^.]+$/, ""),
      el,
      picker,
      perfs,
      studio,
      setCover: (v) => (cover = v),
      addStashId: (endpoint, stash_id) => !stashAdds.some((a) => a.endpoint === endpoint) && stashAdds.push({ endpoint, stash_id }),
    });
  // the calendar (a hidden date field opens its picker; what you pick is written out in the field)
  const dtxt = el.querySelector('[data-e="date"]');
  const dnat = el.querySelector("[data-datenative]");
  if (dtxt && dnat) {
    el.querySelector("[data-datepick]").onclick = () => {
      try {
        dnat.value = dateOf(dtxt.value) || "";
      } catch (e) { /* not a date yet – the picker starts empty */ }
      dnat.showPicker ? dnat.showPicker() : dnat.click();
    };
    dnat.onchange = () => (dtxt.value = dnat.value);
  }
  el.querySelector("[data-save]").onclick = async () => {
    const v = (k) => el.querySelector(`[data-e="${k}"]`);
    let date = null;
    if (v("date")) {
      try {
        date = dateOf(v("date").value);
      } catch (e) {
        return errorToast(e, "Date");
      }
    }
    const fav = v("fav").checked;
    let tags = picker.include;
    const favTag = fav ? await favoriteTagId(true) : favId;
    if (favTag) tags = fav ? [...new Set([...tags, favTag])] : tags.filter((tg) => tg !== favTag);
    const input = {
      id,
      title: v("title").value.trim(),
      date,
      details: v("details").value,
      urls: v("urls").value.split(/\n+/).map((u) => u.trim()).filter(Boolean),
      rating100: state.rating100 || null,
      organized: v("organized").checked,
      tag_ids: tags,
      performer_ids: perfs.include,
      studio_id: studio.include[0] || null,
    };
    try {
      el.querySelector("[data-save]").disabled = true;
      if (cover) input.cover_image = cover;
      if (stashAdds.length) {
        // the links Stash already has stay, a new one for the same box replaces the old
        const cur = ((await gql(`query($id: ID!) { findScene(id: $id) { stash_ids { endpoint stash_id } } }`, { id })).findScene || {}).stash_ids || [];
        input.stash_ids = [...cur.filter((c) => !stashAdds.some((a) => a.endpoint === c.endpoint)).map((c) => ({ endpoint: c.endpoint, stash_id: c.stash_id })), ...stashAdds];
      }
      await updateItem(kind, input);
      app.favId = favTag || app.favId;
      toast(t("Saved"), "ok");
      d.close();
      onSaved && onSaved();
    } catch (e) {
      el.querySelector("[data-save]").disabled = false;
      errorToast(e, "Saving failed");
    }
  };
  el.querySelector("[data-del]").onclick = async () => {
    if (await deleteWithConfirm(kind, id, onDeleted || onSaved)) d.close();
  };
}

// Ask, delete, tell. True when the item is gone.
export async function deleteWithConfirm(kind, id, then) {
  const r = await confirmDialog({
    title: t(TITLES[kind][1]),
    text: t("The item disappears from Stash. With the box ticked, the file on disk is deleted too – this can't be undone."),
    ok: t("Delete"),
    danger: true,
    checkbox: t("Also delete the file from disk"),
  });
  if (!r.ok) return false;
  try {
    await destroyItems(kind, [id], r.checked);
    toast(t("Deleted"), "ok");
    then && then();
    return true;
  } catch (e) {
    errorToast(e, "Deleting failed");
    return false;
  }
}

function editMany(kind, pieces, { onSaved }) {
  const ids = pieces.map((p) => p.id);
  const state = { rating100: undefined, add: [], remove: [], organized: "" };
  const d = openDrawer({
    title: t("Edit {what}", { what: plural(ids.length, UNITS[kind][0], UNITS[kind][1]) }),
    body: `
      <p class="kb-hint">${t("Only what you change here is applied to all selected items. Everything else stays as it is.")}</p>
      <div class="kb-form-row"><span>${t("Add tags")}</span><div class="kb-tagpick" data-add></div></div>
      <div class="kb-form-row"><span>${t("Remove tags")}</span><div class="kb-tagpick" data-rm></div></div>
      <div class="kb-form-row"><span>${t("Add performers")}</span><div class="kb-tagpick" data-padd></div></div>
      <div class="kb-form-row"><span>${t("Remove performers")}</span><div class="kb-tagpick" data-prm></div></div>
      <div class="kb-form-row"><span>${t("Set studio")}</span><div class="kb-tagpick" data-studio></div></div>
      <div class="kb-form-row"><span>${t("Set rating")}</span><div data-stars></div></div>
      <label class="kb-form-row"><span>${t("Organized")}</span><select class="kb-field" data-org><option value="">${t("don't change")}</option><option value="1">${t("organized")}</option><option value="0">${t("not organized")}</option></select></label>`,
    foot: `<span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Apply to all")}</button>`,
  });
  const el = d.el;
  const addP = tagPicker(el.querySelector("[data-add]"), { allowCreate: true, placeholder: t("Search or create a tag") });
  const rmP = tagPicker(el.querySelector("[data-rm]"), { placeholder: t("Search tag") });
  const addPerf = perfPicker(el.querySelector("[data-padd]"), { modes: false, allowCreate: true, placeholder: t("Search or create a performer") });
  const rmPerf = perfPicker(el.querySelector("[data-prm]"), { modes: false, placeholder: t("Search performer") });
  const setStudio = studioPicker(el.querySelector("[data-studio]"), { create: createStudio, placeholder: t("Search or create a studio") });
  starInput(el.querySelector("[data-stars]"), 0, (v) => (state.rating100 = v));
  el.querySelector("[data-cancel]").onclick = d.close;
  el.querySelector("[data-save]").onclick = async () => {
    try {
      el.querySelector("[data-save]").disabled = true;
      const base = { ids };
      if (state.rating100 !== undefined) base.rating100 = state.rating100 || null;
      const org = el.querySelector("[data-org]").value;
      if (org) base.organized = org === "1";
      const jobs = [];
      if (addP.include.length) jobs.push(Object.assign({}, base, { tag_ids: { ids: addP.include, mode: "ADD" } }));
      if (rmP.include.length) jobs.push({ ids, tag_ids: { ids: rmP.include, mode: "REMOVE" } });
      if (addPerf.include.length) jobs.push({ ids, performer_ids: { ids: addPerf.include, mode: "ADD" } });
      if (rmPerf.include.length) jobs.push({ ids, performer_ids: { ids: rmPerf.include, mode: "REMOVE" } });
      if (setStudio.include.length) jobs.push({ ids, studio_id: setStudio.include[0] });
      if (!addP.include.length && Object.keys(base).length > 1) jobs.push(base); // rating/organized ride along with added tags, otherwise on their own
      for (const j of jobs) await bulkUpdate(kind, j);
      toast(jobs.length ? t("{what} updated", { what: plural(ids.length, "item", "items") }) : t("Nothing changed"), "ok");
      d.close();
      jobs.length && onSaved && onSaved();
    } catch (e) {
      el.querySelector("[data-save]").disabled = false;
      errorToast(e, "Saving failed");
    }
  };
}

export async function toggleFavorite(kind, piece) {
  await setFavorite(kind, [piece.id], !piece.fav);
  app.favId = await favoriteTagId(false);
  return !piece.fav;
}
