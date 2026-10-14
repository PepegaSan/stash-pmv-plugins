// All tags as an index, with item counts.

import { getDef, defButton } from "../defsort.js";
import { esc, icon, debounce, errorToast, plural, promptDialog, store } from "../ui.js";
import { t } from "../i18n.js";
import { findTags, createTag, gql } from "../api.js";
import { previewsOn } from "../display.js";
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
        <span class="kb-seg" data-viewseg title="${esc(t("How tags are shown"))}"><button type="button" data-view="list">${t("List")}</button><button type="button" data-view="cards">${t("Cards")}</button></span>
        <button class="kb-btn" data-new>${icon("plus")}${t("New tag")}</button>
      </div>
    </header>
    <div class="kb-taglist" data-list><div class="kb-loading">${t("Loading …")}</div></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = query.sort || getDef("tags") || "name";
  defButton($("[data-sort]"), () => "tags", () => $("[data-sort]").value);

  // A random marker of the tag, fetched when the mouse rests on its card (once per tag) – plays as the card's preview
  const markerOf = new Map();
  const markerFor = (id) => {
    if (!markerOf.has(id))
      markerOf.set(
        id,
        gql(`query($f: FindFilterType, $m: SceneMarkerFilterType) { findSceneMarkers(filter: $f, scene_marker_filter: $m) { scene_markers { stream preview screenshot } } }`, { f: { per_page: 1, sort: "random_" + Math.floor(Math.random() * 1e8) }, m: { tags: { value: [id], modifier: "INCLUDES" } } })
          .then((d) => d.findSceneMarkers.scene_markers[0] || null)
          .catch(() => null)
      );
    return markerOf.get(id);
  };
  const paintView = () => {
    const cards = !!store.get("tagCards", false);
    main.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("is-on", (b.dataset.view === "cards") === cards));
    $("[data-list]").classList.toggle("kb-tagcards", cards);
    $("[data-list]").classList.toggle("kb-taglist", !cards);
  };
  const counts = (x) =>
    [x.scene_count ? plural(x.scene_count, "scene", "scenes") : "", x.image_count ? plural(x.image_count, "image", "images") : "", x.gallery_count ? plural(x.gallery_count, "gallery", "galleries") : ""].filter(Boolean).join(t(", ")) || t("empty");
  const cardHtml = (x) => {
    const pic = x.image_path && !/default=true/.test(x.image_path);
    return `<a class="kb-tagcard" href="#/tag/${x.id}" data-tid="${x.id}"><span class="kb-tagcard-pic">${pic ? `<img alt="" loading="lazy" decoding="async" src="${esc(x.image_path)}">` : `<i>${esc(Array.from(x.name)[0] || "#")}</i>`}</span><span class="kb-tagcard-info"><b>${esc(x.name)}</b><small>${esc(counts(x))}</small></span></a>`;
  };

  async function load() {
    paintView();
    try {
      const r = await findTags($("[data-q]").value.trim(), -1, $("[data-sort]").value);
      const list = r.tags.filter((x) => x.id !== app.favId);
      $("[data-sub]").textContent = plural(list.length, "tag", "tags");
      $("[data-list]").innerHTML = list.length
        ? store.get("tagCards", false)
          ? list.map(cardHtml).join("")
          : list
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
  main.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (!v) return;
    store.set("tagCards", v.dataset.view === "cards");
    load();
  });
  // Hover on a card: its marker plays over the picture (not on touch screens, and only while previews are on)
  let hoverEl = null;
  let hoverTimer = 0;
  const stopHover = () => {
    clearTimeout(hoverTimer);
    if (hoverEl) {
      const v = hoverEl.querySelector("video, .kb-tagcard-anim");
      if (v) v.remove();
      hoverEl.classList.remove("is-previewing");
    }
    hoverEl = null;
  };
  $("[data-list]").addEventListener("pointerover", (e) => {
    const c = e.target.closest(".kb-tagcard");
    if (!c || c === hoverEl || e.pointerType === "touch" || !previewsOn()) return;
    stopHover();
    hoverEl = c;
    hoverTimer = setTimeout(async () => {
      const m = await markerFor(c.dataset.tid);
      if (hoverEl !== c || !m || !(m.stream || m.preview)) return;
      const pic = c.querySelector(".kb-tagcard-pic");
      let el;
      if (m.stream) {
        el = document.createElement("video");
        el.muted = !store.get("previewSound", true);
        el.loop = el.playsInline = true;
        el.src = m.stream;
        el.addEventListener("playing", () => c.classList.add("is-previewing"), { once: true });
        el.play().catch(() => {
          el.muted = true;
          el.play().catch(() => {});
        });
      } else {
        el = document.createElement("img");
        el.className = "kb-tagcard-anim";
        el.alt = "";
        el.onload = () => c.classList.add("is-previewing");
        el.src = m.preview;
      }
      pic.appendChild(el);
    }, 300);
  });
  $("[data-list]").addEventListener("pointerout", (e) => {
    const c = e.target.closest(".kb-tagcard");
    if (c && !c.contains(e.relatedTarget)) stopHover();
  });
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
