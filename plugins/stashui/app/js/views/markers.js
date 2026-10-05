// Markers: every moment you marked in your scenes, as a grid – search, filter by tag, sort; a click opens the scene
// at that moment, and on hover a short preview plays.

import { esc, icon, debounce, errorToast, plural, fmtDuration } from "../ui.js";
import { t } from "../i18n.js";
import { gql, routeSignal } from "../api.js";
import { setQuery } from "../main.js";
import { tagPicker } from "./tagpicker.js";
import { previewsOn } from "../display.js";

const SORTS = [
  ["created_at", "Newest"],
  ["seconds", "Time in the scene"],
  ["title", "Title"],
  ["scene_id", "Scene"],
  ["random", "Random"],
];
const PAGE = 48;
const Q = `query($f: FindFilterType, $m: SceneMarkerFilterType) { findSceneMarkers(filter: $f, scene_marker_filter: $m) { count scene_markers {
  id title seconds end_seconds screenshot preview primary_tag { id name } tags { id name }
  scene { id title files { basename } } } } }`;

export async function render(main, params, query) {
  const S = { q: query.q || "", sort: query.sort || "created_at", tags: (query.tags || "").split(",").filter(Boolean), seed: Math.floor(Math.random() * 1e8) };
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Markers")}</h1>
        <p class="kb-sub" data-sub>${t("The moments you marked in your scenes.")}</p>
      </div>
      <div class="kb-head-tools">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search markers")}" value="${esc(S.q)}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
      </div>
    </header>
    <div class="kb-tagpick kb-mk-tags" data-tp></div>
    <div class="kb-mkgrid" data-grid><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = SORTS.some(([v]) => v === S.sort) ? S.sort : "created_at";
  S.sort = $("[data-sort]").value;

  let page = 1;
  let total = 0;
  let loaded = 0;
  let loading = false;
  let run = 0;
  let alive = true;

  const card = (m) => {
    const sc = m.scene || {};
    const title = m.title || (m.primary_tag && m.primary_tag.name) || t("Marker");
    const meta = [m.title && m.primary_tag ? m.primary_tag.name : "", sc.title || ((sc.files || [])[0] || {}).basename || ""].filter(Boolean).join(" · ");
    return `<a class="kb-mk" href="#/scene/${esc(sc.id)}?t=${Math.floor(m.seconds || 0)}" data-mk data-prev="${esc(m.preview || "")}">
      <span class="kb-mk-art">${m.screenshot ? `<img alt="" loading="lazy" src="${esc(m.screenshot)}">` : ""}<span class="kb-stamp">${fmtDuration(m.seconds || 0)}</span></span>
      <b>${esc(title)}</b><small>${esc(meta)}</small></a>`;
  };

  async function load(reset) {
    if (loading && !reset) return;
    const my = ++run;
    loading = true;
    if (reset) {
      page = 1;
      loaded = 0;
    }
    try {
      const sort = S.sort === "random" ? "random_" + S.seed : S.sort;
      const m = S.tags.length ? { tags: { value: S.tags, modifier: "INCLUDES_ALL" } } : {};
      const d = await gql(Q, { f: { q: S.q || undefined, page, per_page: PAGE, sort, direction: ["title", "scene_id", "seconds"].includes(S.sort) ? "ASC" : "DESC" }, m }, { signal: routeSignal() });
      if (my !== run || !alive) return;
      const list = d.findSceneMarkers.scene_markers;
      total = d.findSceneMarkers.count;
      $("[data-sub]").textContent = total ? plural(total, "marker", "markers") : t("The moments you marked in your scenes.");
      if (reset) $("[data-grid]").innerHTML = "";
      if (!loaded && !list.length) $("[data-grid]").innerHTML = `<div class="kb-empty"><b>${t("No markers found")}</b><p>${S.q || S.tags.length ? t("Try another search or filter.") : t("Press B in the player to mark a moment – it shows up here.")}</p></div>`;
      else $("[data-grid]").insertAdjacentHTML("beforeend", list.map(card).join(""));
      loaded += list.length;
      page++;
    } catch (e) {
      if (my === run) $("[data-grid]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the markers")}</b><p>${esc(e.message)}</p></div>`;
    } finally {
      if (my === run) loading = false;
    }
  }

  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loaded < total && load(false), { rootMargin: "800px" });
  io.observe($("[data-more]"));
  const reload = () => {
    setQuery({ q: S.q, sort: S.sort === "created_at" ? "" : S.sort, tags: S.tags.join(",") });
    load(true);
  };
  $("[data-q]").addEventListener("input", debounce(() => ((S.q = $("[data-q]").value.trim()), reload()), 300));
  $("[data-sort]").onchange = () => {
    S.sort = $("[data-sort]").value;
    S.seed = Math.floor(Math.random() * 1e8);
    reload();
  };
  tagPicker($("[data-tp]"), {
    include: S.tags,
    exclude: [],
    allowExclude: false,
    placeholder: t("Filter by tag"),
    onChange: (inc) => {
      S.tags = inc;
      reload();
    },
  });

  // A short preview while the mouse is on a card
  let prevEl = null;
  const stopPrev = () => {
    if (prevEl) {
      prevEl.pause();
      prevEl.remove();
      prevEl = null;
    }
  };
  $("[data-grid]").addEventListener("pointerover", (e) => {
    const c = e.target.closest("[data-mk]");
    if (!c || (prevEl && prevEl.parentNode === c.querySelector(".kb-mk-art")) || !c.dataset.prev || !previewsOn()) return;
    stopPrev();
    const v = document.createElement("video");
    v.src = c.dataset.prev;
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = "metadata";
    c.querySelector(".kb-mk-art").appendChild(v);
    prevEl = v;
  });
  $("[data-grid]").addEventListener("pointerleave", stopPrev);
  $("[data-grid]").addEventListener("pointerout", (e) => e.target.closest("[data-mk]") && !e.relatedTarget?.closest?.("[data-mk]") && stopPrev());

  load(true);
  return () => {
    alive = false;
    stopPrev();
    io.disconnect();
  };
}
