// A tag: details, parent/child tags, all items with this tag.

import { esc, icon, errorToast, toast, openDrawer, confirmDialog, plural } from "../ui.js";
import { t } from "../i18n.js";
import { getTag, gql } from "../api.js";
import { mediaBrowser } from "./media.js";
import { go } from "../main.js";
import { tagsCache } from "./tagpicker.js";
import { performerCard, toggleCardFav } from "./performers.js";

// Performers for a tag: those tagged with it, and those in scenes that have it (older Stash versions
// can't ask the second – then only the first). A row of cards; "All" opens the performers page filtered.
async function tagPerformers(box, tag) {
  const F = "count performers { id name disambiguation gender favorite rating100 scene_count image_count o_counter image_path birthdate country }";
  const ask = (p) => gql(`query($p: PerformerFilterType, $f: FindFilterType) { findPerformers(performer_filter: $p, filter: $f) { ${F} } }`, { p, f: { per_page: 20, sort: "scenes_count", direction: "DESC" } }).then((d) => d.findPerformers).catch(() => null);
  const [tagged, inScenes] = await Promise.all([ask({ tags: { value: [tag.id], modifier: "INCLUDES" } }), ask({ scenes_filter: { tags: { value: [tag.id], modifier: "INCLUDES" } } })]);
  const sets = [
    ["tag", t("With this tag"), tagged],
    ["scenetag", t("In these scenes"), inScenes],
  ].filter(([, , r]) => r && r.count);
  if (!sets.length) return;
  let cur = sets[0][0];
  const get = () => sets.find(([k]) => k === cur)[2];
  function paint() {
    const r = get();
    box.innerHTML = `
      <div class="kb-tagperfs-head">
        <h2 class="kb-h2">${t("Performers")}</h2>
        ${sets.length > 1 ? `<div class="kb-seg">${sets.map(([k, l, x]) => `<button type="button" data-ps="${k}"${k === cur ? ' class="is-on"' : ""}>${esc(l)} <span>${x.count}</span></button>`).join("")}</div>` : `<span class="kb-hint">${esc(sets[0][1])}</span>`}
        <span class="kb-spacer"></span>
        ${r.count > r.performers.length ? `<a class="kb-btn is-ghost" href="#/performers?${cur}=${tag.id}">${t("All {n}", { n: r.count })}</a>` : ""}
      </div>
      <div class="kb-perfrow">${r.performers.map(performerCard).join("")}</div>`;
  }
  box.hidden = false;
  paint();
  box.addEventListener("click", (e) => {
    const s = e.target.closest("[data-ps]");
    if (s) {
      cur = s.dataset.ps;
      return paint();
    }
    const f = e.target.closest("[data-pfav]");
    if (f) {
      e.preventDefault();
      toggleCardFav(f, get().performers);
    }
  });
}

import { mountSlots } from "../ext.js";

export async function render(main, params, query) {
  const tag = await getTag(params.id);
  if (!tag) {
    main.innerHTML = `<div class="kb-empty"><b>${t("This tag no longer exists")}</b><a class="kb-btn" href="#/tags">${t("All tags")}</a></div>`;
    return;
  }
  // All three always there (with their numbers) – you can look at images even when there are none yet;
  // it opens on the first kind that has something
  const kinds = ["scene", "image", "gallery"];
  const initialKind = kinds.find((k) => tag[k + "_count"]) || "scene";
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <nav class="kb-crumbs"><span><a href="#/tags">${t("Tags")}</a></span>${tag.parents.map((p) => `<span><a href="#/tag/${p.id}">${esc(p.name)}</a></span>`).join("")}</nav>
        <h1 class="kb-h1">${esc(tag.name)}</h1>
        <p class="kb-sub">${[tag.scene_count ? plural(tag.scene_count, "scene", "scenes") : "", tag.image_count ? plural(tag.image_count, "image", "images") : "", tag.gallery_count ? plural(tag.gallery_count, "gallery", "galleries") : ""].filter(Boolean).join(t(", ")) || t("Nothing tagged yet")}</p>
        ${tag.description ? `<p class="kb-lead">${esc(tag.description)}</p>` : ""}
        <div class="kb-xhead" data-xhead></div>
        ${tag.children.length ? `<div class="kb-chips kb-head-chips">${tag.children.map((c) => `<a class="kb-chip" href="#/tag/${c.id}">${esc(c.name)}</a>`).join("")}</div>` : ""}
      </div>
      <div class="kb-head-tools">
        <button class="kb-btn" data-edit>${icon("edit")}${t("Edit")}</button>
      </div>
    </header>
    <section class="kb-tagperfs" data-tperfs hidden></section>
    <section data-browser></section>`;
  tagPerformers(main.querySelector("[data-tperfs]"), tag);
  const xhead = mountSlots("tag.header", main.querySelector("[data-xhead]"), { page: "tag", id: tag.id, item: tag }, { reload: () => go(location.hash.replace(/^#\/?/, ""), true) });
  const b = mediaBrowser(main.querySelector("[data-browser]"), { kinds, initialKind, query, page: "tag", params: { id: tag.id }, base: () => ({ tagId: tag.id }) });

  main.querySelector("[data-edit]").onclick = () => {
    const d = openDrawer({
      title: t("Edit tag"),
      body: `
        <label class="kb-form-row"><span>${t("Name")}</span><input class="kb-field" data-e="name" value="${esc(tag.name)}"></label>
        <label class="kb-form-row"><span>${t("Aliases (comma separated)")}</span><input class="kb-field" data-e="aliases" value="${esc(tag.aliases.join(", "))}"></label>
        <label class="kb-form-row"><span>${t("Description")}</span><textarea class="kb-field" data-e="description">${esc(tag.description || "")}</textarea></label>`,
      foot: `<button class="kb-btn is-danger" data-del>${t("Delete tag")}</button><span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
    });
    const v = (k) => d.el.querySelector(`[data-e="${k}"]`).value;
    d.el.querySelector("[data-cancel]").onclick = d.close;
    d.el.querySelector("[data-save]").onclick = async () => {
      try {
        await gql(`mutation($i: TagUpdateInput!) { tagUpdate(input: $i) { id } }`, {
          i: { id: tag.id, name: v("name").trim(), description: v("description"), aliases: v("aliases").split(",").map((a) => a.trim()).filter(Boolean) },
        });
        tagsCache(true);
        toast(t("Tag saved"), "ok");
        d.close();
        go("tag/" + tag.id, true);
      } catch (e) {
        errorToast(e, "Save");
      }
    };
    d.el.querySelector("[data-del]").onclick = async () => {
      const r = await confirmDialog({ title: t("Delete tag “{name}”?", { name: tag.name }), text: t("The tag is removed from all items. The items themselves stay."), ok: t("Delete"), danger: true });
      if (!r.ok) return;
      try {
        await gql(`mutation($id: ID!) { tagDestroy(input: { id: $id }) }`, { id: tag.id });
        tagsCache(true);
        d.close();
        toast(t("Tag deleted"), "ok");
        go("tags", true);
      } catch (e) {
        errorToast(e, "Delete");
      }
    };
  };
  return () => {
    xhead.destroy();
    b.destroy();
  };
}
