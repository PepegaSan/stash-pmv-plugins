// All tags as an index, with item counts.

import { esc, icon, debounce, errorToast, plural, promptDialog } from "../ui.js";
import { t } from "../i18n.js";
import { findTags, createTag } from "../api.js";
import { app, go } from "../main.js";
import { tagsCache } from "./tagpicker.js";

export async function render(main, params, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Tags")}</h1>
        <p class="kb-sub" data-sub></p>
      </div>
      <div class="kb-head-tools">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search tags")}" value="${esc(query.q || "")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">
          <option value="name">${t("Alphabetical")}</option>
          <option value="scenes_count">${t("Most scenes")}</option>
          <option value="images_count">${t("Most images")}</option>
          <option value="created_at">${t("Newest")}</option>
        </select>
        <button class="kb-btn" data-new>${icon("plus")}${t("New tag")}</button>
      </div>
    </header>
    <div class="kb-taglist" data-list><div class="kb-loading">${t("Loading …")}</div></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = query.sort || "name";

  async function load() {
    try {
      const r = await findTags($("[data-q]").value.trim(), -1, $("[data-sort]").value);
      const list = r.tags.filter((x) => x.id !== app.favId);
      $("[data-sub]").textContent = plural(list.length, "tag", "tags");
      $("[data-list]").innerHTML = list.length
        ? list
            .map(
              (x) => `<a class="kb-tagrow" href="#/tag/${x.id}"><b>${esc(x.name)}</b><small>${[
                x.scene_count ? plural(x.scene_count, "scene", "scenes") : "",
                x.image_count ? plural(x.image_count, "image", "images") : "",
                x.gallery_count ? plural(x.gallery_count, "gallery", "galleries") : "",
              ]
                .filter(Boolean)
                .join(t(", ")) || t("empty")}</small></a>`
            )
            .join("")
        : `<div class="kb-empty"><b>${t("No tag found")}</b><p>${t("Create one with “New tag”.")}</p></div>`;
    } catch (e) {
      errorToast(e, "Tags");
    }
  }
  $("[data-q]").addEventListener("input", debounce(load, 250));
  $("[data-sort]").onchange = load;
  $("[data-new]").onclick = async () => {
    const name = await promptDialog({ title: t("New tag"), label: t("Name"), ok: t("Create") });
    if (!name) return;
    try {
      const created = await createTag(name.trim());
      tagsCache(true);
      go("tag/" + created.id);
    } catch (e) {
      errorToast(e, "Create tag");
    }
  };
  load();
}
