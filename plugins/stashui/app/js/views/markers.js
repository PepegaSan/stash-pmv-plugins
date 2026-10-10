// Markers: every moment you marked in your scenes, as a grid – search, filter by tag, sort; a click opens the scene
// at that moment, and on hover a short preview plays.

import { esc, icon, debounce, errorToast, plural, fmtDuration, store } from "../ui.js";
import { t } from "../i18n.js";
import { gql, routeSignal } from "../api.js";
import { setQuery } from "../main.js";
import { tagPicker } from "./tagpicker.js";
import { generatePreviews } from "../genprev.js";
import { previewsOn } from "../display.js";

const SIZE = "markerWidth"; // width of a card in px (the slider in the bar)

const SORTS = [
  ["created_at", "Newest"],
  ["seconds", "Time in the scene"],
  ["title", "Title"],
  ["scene_id", "Scene"],
  ["random", "Random"],
];
const PAGE = 48;
const Q = `query($f: FindFilterType, $m: SceneMarkerFilterType) { findSceneMarkers(filter: $f, scene_marker_filter: $m) { count scene_markers {
  id title seconds end_seconds screenshot stream preview primary_tag { id name } tags { id name }
  scene { id title files { basename width height } } } } }`;

export async function render(main, params, query) {
  const S = { q: query.q || "", sort: query.sort || "created_at", dir: query.dir || "", tags: (query.tags || "").split(",").filter(Boolean), seed: Math.floor(Math.random() * 1e8) };
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Markers")}</h1>
        <p class="kb-sub" data-sub>${t("The moments you marked in your scenes.")}</p>
      </div>
    </header>
    <div class="kb-toolbar">
      <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search markers")}" value="${esc(S.q)}"></label>
      <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
      <button class="kb-btn is-icon" data-dir title="${t("Reverse direction")}" aria-label="${t("Reverse direction")}"></button>
      <span class="kb-spacer"></span>
      <button type="button" class="kb-btn is-ghost" data-pvon title="${t("Hover previews on or off")}"></button>
      <button type="button" class="kb-btn is-ghost" data-mute title="${t("Sound in hover previews")}"></button>
      <label class="kb-range" title="${t("Thumbnail size")}">${icon("image")}<input type="range" min="160" max="520" step="10" data-size value="${store.get(SIZE, 260)}" aria-label="${t("Size")}"></label>
      <button type="button" class="kb-btn" data-genprev title="${t("Makes the video previews and pictures of all markers that don't have them yet (see Tasks)")}">${t("Generate missing previews")}</button>
    </div>
    <div class="kb-tagpick kb-mk-tags" data-tp></div>
    <div class="kb-mkgrid" data-grid><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = SORTS.some(([v]) => v === S.sort) ? S.sort : "created_at";
  S.sort = $("[data-sort]").value;
  const dirOf = () => S.dir || (["title", "scene_id", "seconds"].includes(S.sort) ? "ASC" : "DESC");
  const paintBar = () => {
    $("[data-dir]").innerHTML = dirOf() === "ASC" ? "↑" : "↓";
    $("[data-dir]").hidden = S.sort === "random";
    const on = store.get("previewMode", "on") !== "off";
    $("[data-pvon]").innerHTML = `${icon("play")}<span>${on ? t("Previews on") : t("Previews off")}</span>`;
    $("[data-pvon]").setAttribute("aria-pressed", !on);
    const snd = store.get("previewSound", true);
    $("[data-mute]").innerHTML = `${icon(snd ? "volume" : "mute")}<span>${snd ? t("Sound on") : t("Muted")}</span>`;
    $("[data-mute]").setAttribute("aria-pressed", !snd);
    $("[data-mute]").hidden = !on;
    $("[data-grid]").style.gridTemplateColumns = `repeat(auto-fill, minmax(${store.get(SIZE, 260)}px, 1fr))`;
  };
  paintBar();

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
    const f0 = (sc.files || [])[0] || {};
    const portrait = f0.width && f0.height && f0.height > f0.width * 1.05; // an upright video gets an upright tile
    const ar = portrait ? Math.max(0.5, f0.width / f0.height).toFixed(4) : "";
    return `<a class="kb-mk${portrait ? " is-portrait" : ""}"${ar ? ` style="--ar:${ar}"` : ""} href="#/scene/${esc(sc.id)}?t=${Math.floor(m.seconds || 0)}" data-mk data-prev="${esc(m.stream || m.preview || "")}">
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
      const d = await gql(Q, { f: { q: S.q || undefined, page, per_page: PAGE, sort, direction: dirOf() }, m }, { signal: routeSignal() });
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
      if (my === run) {
        loading = false;
        requestAnimationFrame(fillMore); // the end of the list may still be in view (big screen, small cards) – the observer only reports changes
      }
    }
  }

  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loaded < total && load(false), { rootMargin: "800px" });
  // Still more and the end of the list already in view after a page came in? Then the next page right away (the observer
  // above only fires when the end comes into view – with a tall screen the first page may never push it out again)
  function fillMore() {
    const el = $("[data-more]");
    if (el && el.isConnected && !loading && loaded < total && el.getBoundingClientRect().top < innerHeight + 800) load(false);
  }
  io.observe($("[data-more]"));
  const reload = () => {
    setQuery({ q: S.q, sort: S.sort === "created_at" ? "" : S.sort, dir: S.dir, tags: S.tags.join(",") });
    load(true);
  };
  $("[data-q]").addEventListener("input", debounce(() => ((S.q = $("[data-q]").value.trim()), reload()), 300));
  $("[data-genprev]").onclick = async (e) => {
    e.currentTarget.disabled = true;
    await generatePreviews("marker", null);
    e.currentTarget.disabled = false;
  };
  $("[data-dir]").onclick = () => {
    S.dir = dirOf() === "ASC" ? "DESC" : "ASC";
    paintBar();
    reload();
  };
  $("[data-pvon]").onclick = () => {
    store.set("previewMode", store.get("previewMode", "on") === "off" ? "on" : "off");
    stopPrev();
    paintBar();
  };
  $("[data-mute]").onclick = () => {
    store.set("previewSound", !store.get("previewSound", true));
    paintBar();
  };
  $("[data-size]").oninput = (e) => {
    store.set(SIZE, Number(e.target.value));
    paintBar();
  };
  $("[data-sort]").onchange = () => {
    S.sort = $("[data-sort]").value;
    S.dir = "";
    S.seed = Math.floor(Math.random() * 1e8);
    paintBar();
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
    v.muted = !store.get("previewSound", true) || store.get("player", {}).muted === true; // (the same switch as on the other pages)
    v.volume = store.get("player", {}).volume ?? 0.8;
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
