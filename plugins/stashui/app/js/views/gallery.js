// A gallery: placard with details, all images below.

import { esc, icon, fmtDate, plural, starsHtml, errorToast, toast } from "../ui.js";
import { t } from "../i18n.js";
import { getGallery, setFavorite, favoriteTagId } from "../api.js";
import { mediaBrowser } from "./media.js";
import { openEditor } from "./edit.js";
import { app, go } from "../main.js";

import { mountSlots } from "../ext.js";

export async function render(main, params, query) {
  const g = await getGallery(params.id);
  if (!g) {
    main.innerHTML = `<div class="kb-empty"><b>${t("This gallery no longer exists")}</b><a class="kb-btn" href="#/galleries">${t("All galleries")}</a></div>`;
    return;
  }
  const path = (g.folder && g.folder.path) || ((g.files || [])[0] || {}).path || "";
  const name = g.title || path.split(/[\\/]/).filter(Boolean).pop() || t("Gallery {id}", { id: g.id });
  const fav = !!app.favId && g.tags.some((x) => x.id === app.favId);
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <nav class="kb-crumbs"><span><a href="#/galleries">${t("Galleries")}</a></span></nav>
        <h1 class="kb-h1">${esc(name)}${fav ? ` <span class="kb-dot-inline" title="${t("Favorite")}"></span>` : ""}</h1>
        <p class="kb-sub">${[plural(g.image_count, "image", "images"), g.date ? fmtDate(g.date) : "", g.rating100 ? starsHtml(g.rating100) : ""].filter(Boolean).join(t(", "))}</p>
        ${g.details ? `<p class="kb-lead">${esc(g.details)}</p>` : ""}
        <div class="kb-xhead" data-xhead></div>
        ${g.tags.filter((x) => x.id !== app.favId).length ? `<div class="kb-chips kb-head-chips">${g.tags.filter((x) => x.id !== app.favId).map((x) => `<a class="kb-chip" href="#/tag/${x.id}">${esc(x.name)}</a>`).join("")}</div>` : ""}
      </div>
      <div class="kb-head-tools">
        <button class="kb-btn" data-fav><span class="kb-dotmini"></span>${fav ? t("Remove favorite") : t("Favorite")}</button>
        <button class="kb-btn" data-edit>${icon("edit")}${t("Edit")}</button>
        <button class="kb-btn is-primary" data-slides>${icon("slides")}${t("Slideshow")}</button>
      </div>
    </header>
    <section data-browser></section>`;
  const xhead = mountSlots("gallery.header", main.querySelector("[data-xhead]"), { page: "gallery", id: g.id, item: g }, { reload: () => go(location.hash.replace(/^#\/?/, ""), true) });
  const b = mediaBrowser(main.querySelector("[data-browser]"), {
    kinds: ["image"],
    query,
    page: "gallery",
    params: { id: g.id },
    search: false,
    defaults: { image: { sort: "path", dir: "ASC" } },
    base: () => ({ filter: { galleries: { value: [g.id], modifier: "INCLUDES" } } }),
  });
  main.querySelector("[data-edit]").onclick = () => openEditor("gallery", [{ id: g.id }], { onSaved: () => go("gallery/" + g.id, true), onDeleted: () => go("galleries", true) });
  main.querySelector("[data-fav]").onclick = async () => {
    try {
      await setFavorite("gallery", [g.id], !fav);
      app.favId = await favoriteTagId(false);
      toast(fav ? t("Favorite removed") : t("Marked as favorite"), "ok");
      go("gallery/" + g.id, true);
    } catch (e) {
      errorToast(e, "Favorite");
    }
  };
  main.querySelector("[data-slides]").onclick = () => {
    const h = b.hang;
    if (!h || !h.pieces.length) return;
    app.context = { kind: "image", pieces: h.pieces, index: 0, hang: h, slideshow: true };
    go("image/" + h.pieces[0].id);
  };
  return () => {
    xhead.destroy();
    b.destroy();
  };
}
