// "Add scenes and images" on a performer page: browse (or search) what isn't linked to them yet, tick as many
// scenes, images and galleries as you like and link them all in one go.

import { esc, icon, toast, errorToast } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";

const PER = 48;
const ALL_KINDS = [
  { k: "scene", label: "Scenes", find: "findScenes", arg: "scene_filter", type: "SceneFilterType", list: "scenes", bulk: "bulkSceneUpdate", bulkType: "BulkSceneUpdateInput", fields: "id title files { basename } paths { screenshot }", thumb: (x) => x.paths.screenshot },
  { k: "image", label: "Images", find: "findImages", arg: "image_filter", type: "ImageFilterType", list: "images", bulk: "bulkImageUpdate", bulkType: "BulkImageUpdateInput", fields: "id title paths { thumbnail image }", thumb: (x) => x.paths.thumbnail || x.paths.image },
  { k: "gallery", label: "Galleries", find: "findGalleries", arg: "gallery_filter", type: "GalleryFilterType", list: "galleries", bulk: "bulkGalleryUpdate", bulkType: "BulkGalleryUpdateInput", fields: "id title folder { path } files { path } paths { cover }", thumb: (x) => x.paths.cover },
];
const nameOf = (x) => x.title || (x.files && x.files[0] && (x.files[0].basename || x.files[0].path.split(/[\\/]/).pop())) || (x.folder && x.folder.path.split(/[\\/]/).pop()) || "#" + x.id;

// perf: { id, name }; onDone() after something was linked.
// opts (to use it for something else than a performer – e.g. a group): only: ["scene"] (kinds), title, hint (already translated),
// filter(id): what is already linked (left out), link(id): the bulk-update fields that link it, done(n): the toast
export function openAddMedia(perf, onDone, opts = {}) {
  const KINDS = opts.only ? ALL_KINDS.filter((x) => opts.only.includes(x.k)) : ALL_KINDS;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="kb-scrim kb-dialog-scrim"></div>
    <div class="kb-dialog kb-add" role="dialog" aria-modal="true" aria-label="${esc(opts.title || t("Add scenes and images"))}">
      <h2>${esc(opts.title || t("Add scenes and images"))}</h2>
      <p class="kb-hint">${esc(opts.hint || t("Everything you tick is linked to {name}. Items already linked aren't shown.", { name: perf.name }))}</p>
      <div class="kb-cut-find">
        <span class="kb-cut-kinds" data-kinds${KINDS.length < 2 ? " style=\"display:none\"" : ""}>${KINDS.map((x, i) => `<button type="button" class="kb-btn is-ghost${i ? "" : " is-sel"}" data-k="${x.k}">${t(x.label)}<em data-n="${x.k}"></em></button>`).join("")}</span>
        <input class="kb-field" data-q placeholder="${esc(t("Search by title, path or tag"))}">
      </div>
      <div class="kb-add-grid" data-grid></div>
      <div class="kb-cut-bar">
        <button type="button" class="kb-btn" data-more hidden>${t("Show more")}</button>
        <button type="button" class="kb-btn is-ghost" data-all>${t("Tick all shown")}</button>
        <button type="button" class="kb-btn is-ghost" data-none hidden>${t("Clear ticks")}</button>
      </div>
      <div class="kb-actions"><button type="button" class="kb-btn" data-close>${t("Cancel")}</button><button type="button" class="kb-btn is-primary" data-add disabled>${t("Add")}</button></div>
    </div>`;
  document.getElementById("overlay-root").appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  $("[data-close]").onclick = close;
  wrap.querySelector(".kb-scrim").onclick = close;

  let kind = KINDS[0];
  let page = 1;
  let shown = []; // items of the current kind and query
  let total = 0;
  const picked = { scene: new Set(), image: new Set(), gallery: new Set() };
  let timer;
  let seq = 0;

  const sum = () => KINDS.reduce((n, x) => n + picked[x.k].size, 0);
  function counts() {
    KINDS.forEach((x) => {
      $(`[data-n="${x.k}"]`).textContent = picked[x.k].size ? ` · ${picked[x.k].size}` : "";
    });
    const n = sum();
    $("[data-add]").disabled = !n;
    $("[data-add]").textContent = n ? t("Add {n}", { n }) : t("Add");
    $("[data-none]").hidden = !n;
  }
  const cell = (x) => `<button type="button" class="kb-add-item${picked[kind.k].has(x.id) ? " is-on" : ""}${kind.k === "image" ? " is-image" : ""}" data-id="${x.id}" title="${esc(nameOf(x))}"><img alt="" loading="lazy" src="${esc(kind.thumb(x) || "")}"><span>${esc(nameOf(x))}</span><i>${icon("check")}</i></button>`;

  async function load(more) {
    const my = ++seq;
    const grid = $("[data-grid]");
    const q = $("[data-q]").value.trim();
    if (!more) {
      page = 1;
      shown = [];
      grid.innerHTML = `<span class="kb-hint">${t("Loading …")}</span>`;
    } else page++;
    try {
      const d = await gql(`query AddMedia($f: FindFilterType, $s: ${kind.type}) { ${kind.find}(filter: $f, ${kind.arg}: $s) { count ${kind.list} { ${kind.fields} } } }`, {
        f: q ? { q, per_page: PER, page } : { per_page: PER, page, sort: "created_at", direction: "DESC" }, // (no sort when searching – Stash has no "relevance" sort key)
        s: opts.filter ? opts.filter(perf.id) : { performers: { value: [perf.id], modifier: "EXCLUDES" } },
      });
      if (my !== seq) return; // a newer search is on its way
      const r = d[kind.find];
      shown = shown.concat(r[kind.list]);
      total = r.count;
      grid.innerHTML = shown.length ? shown.map(cell).join("") : `<span class="kb-hint">${q ? t("Nothing found.") : t("Nothing left to add here.")}</span>`;
      $("[data-more]").hidden = shown.length >= total;
      $("[data-more]").textContent = t("Show more ({n} left)", { n: total - shown.length });
    } catch (e) {
      if (my === seq) grid.innerHTML = `<span class="kb-hint">${esc(e.message)}</span>`;
    }
  }
  $("[data-q]").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(false), 300);
  });
  $("[data-kinds]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b || b.dataset.k === kind.k) return;
    kind = KINDS.find((x) => x.k === b.dataset.k);
    wrap.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("is-sel", x === b));
    load(false);
  });
  $("[data-more]").onclick = () => load(true);
  $("[data-grid]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    const set = picked[kind.k];
    set.has(b.dataset.id) ? set.delete(b.dataset.id) : set.add(b.dataset.id);
    b.classList.toggle("is-on", set.has(b.dataset.id));
    counts();
  });
  $("[data-all]").onclick = () => {
    shown.forEach((x) => picked[kind.k].add(x.id));
    wrap.querySelectorAll(".kb-add-item").forEach((b) => b.classList.add("is-on"));
    counts();
  };
  $("[data-none]").onclick = () => {
    KINDS.forEach((x) => picked[x.k].clear());
    wrap.querySelectorAll(".kb-add-item").forEach((b) => b.classList.remove("is-on"));
    counts();
  };
  $("[data-add]").onclick = async () => {
    const btn = $("[data-add]");
    btn.disabled = true;
    try {
      let n = 0;
      for (const x of KINDS) {
        const ids = [...picked[x.k]];
        if (!ids.length) continue;
        await gql(`mutation($i: ${x.bulkType}!) { ${x.bulk}(input: $i) { id } }`, { i: Object.assign({ ids }, opts.link ? opts.link(perf.id) : { performer_ids: { ids: [perf.id], mode: "ADD" } }) });
        n += ids.length;
      }
      toast(opts.done ? opts.done(n) : t("{n} items linked to {name}", { n, name: perf.name }), "ok");
      close();
      onDone && onDone();
    } catch (e) {
      btn.disabled = false;
      errorToast(e, "Link");
    }
  };
  counts();
  load(false);
}
