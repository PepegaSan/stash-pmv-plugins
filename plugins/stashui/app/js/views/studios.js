// Studios: all studios as logo cards (search, sorting), and one studio with its scenes, images and galleries
// (including those of its sub-studios). Scrolling loads more.

import { esc, icon, debounce, errorToast, plural, starsHtml } from "../ui.js";
import { t } from "../i18n.js";
import { gql, routeSignal } from "../api.js";
import { mediaBrowser } from "./media.js";
import { openStudioEditor } from "./studioedit.js";
import { go } from "../main.js";

const SORTS = [
  ["name", "Alphabetical"],
  ["scenes_count", "Most scenes"],
  ["rating", "Rating"],
  ["created_at", "Recently added"],
  ["random", "Random"],
];
const PAGE = 60;

// Stash serves a placeholder when a studio has no logo – then the name takes its place
const hasLogo = (s) => s.image_path && !/default=true/.test(s.image_path);

const card = (s) => `<a class="kb-perf kb-studiocard" href="#/studio/${esc(s.id)}">
    <span class="kb-perf-img">${hasLogo(s) ? `<img alt="" loading="lazy" src="${esc(s.image_path)}">` : `<em>${esc(s.name)}</em>`}</span>
    <b>${esc(s.name)}</b>
    <small>${[s.scene_count ? plural(s.scene_count, "scene", "scenes") : "", s.parent_studio ? s.parent_studio.name : ""].filter(Boolean).join(" · ") || "&nbsp;"}</small>
    ${s.rating100 ? starsHtml(s.rating100) : ""}
  </a>`;

export async function render(main, params, query) {
  return params.id ? renderOne(main, params.id, query) : renderList(main, query);
}

async function renderList(main, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Studios")}</h1>
        <p class="kb-sub" data-sub></p>
      </div>
      <div class="kb-head-tools">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search studios")}" value="${esc(query.q || "")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
        <button class="kb-btn is-primary" data-new>${icon("plus")}<span>${t("New studio")}</span></button>
      </div>
    </header>
    <div class="kb-perfgrid kb-studiogrid" data-list><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = query.sort || "name";
  let page = 1;
  let total = 0;
  let loaded = 0;
  let loading = false;
  let run = 0;
  let alive = true;
  const seed = Math.floor(Math.random() * 1e8);
  async function load(reset) {
    if (loading && !reset) return;
    const my = ++run;
    loading = true;
    if (reset) {
      page = 1;
      loaded = 0;
    }
    try {
      const s = $("[data-sort]").value;
      const d = await gql(
        `query($f: FindFilterType) { findStudios(filter: $f) { count studios { id name image_path scene_count rating100 parent_studio { id name } } } }`,
        { f: { q: $("[data-q]").value.trim() || undefined, page, per_page: PAGE, sort: s === "random" ? "random_" + seed : s, direction: s === "name" ? "ASC" : "DESC" } },
        { signal: routeSignal() }
      );
      if (my !== run || !alive) return;
      total = d.findStudios.count;
      $("[data-sub]").textContent = plural(total, "studio", "studios");
      const list = d.findStudios.studios;
      if (reset) $("[data-list]").innerHTML = "";
      if (!loaded && !list.length) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("No studios found")}</b><p>${$("[data-q]").value ? t("Try another search.") : t("Make one with “New studio” – or let a scraper fill it in.")}</p></div>`;
      else $("[data-list]").insertAdjacentHTML("beforeend", list.map(card).join(""));
      loaded += list.length;
      page++;
    } catch (e) {
      if (my === run) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the studios")}</b><p>${esc(e.message)}</p></div>`;
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
    setQuery({ q: $("[data-q]").value.trim(), sort: $("[data-sort]").value === "name" ? "" : $("[data-sort]").value });
    load(true);
  };
  $("[data-q]").addEventListener("input", debounce(reload, 300));
  $("[data-sort]").onchange = reload;
  $("[data-new]").onclick = () => openStudioEditor(null, { name: $("[data-q]").value.trim(), onSaved: (id) => go("studio/" + id) });
  load(true);
  return () => {
    alive = false;
    io.disconnect();
  };
}

import { mountSlots } from "../ext.js";

async function renderOne(main, id, query) {
  let s;
  try {
    s = (
      await gql(
        `query($id: ID!) { findStudio(id: $id) { id name urls details image_path rating100 favorite aliases scene_count image_count gallery_count parent_studio { id name } child_studios { id name } tags { id name } } }`,
        { id },
        { signal: routeSignal() }
      )
    ).findStudio;
  } catch (e) {
    errorToast(e, "Studio");
    main.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the studio")}</b><p>${esc(e.message)}</p><a class="kb-btn" href="#/studios">${t("All studios")}</a></div>`;
    return;
  }
  if (!s) {
    main.innerHTML = `<div class="kb-empty"><b>${t("Studio not found")}</b><a class="kb-btn" href="#/studios">${t("All studios")}</a></div>`;
    return;
  }
  const facts = [
    [t("Part of"), s.parent_studio ? `<a href="#/studio/${esc(s.parent_studio.id)}">${esc(s.parent_studio.name)}</a>` : ""],
    [t("Sub-studios"), (s.child_studios || []).map((c) => `<a href="#/studio/${esc(c.id)}">${esc(c.name)}</a>`).join(", ")],
    [t("Also known as"), esc((s.aliases || []).join(", "))],
    [t("Links"), (s.urls || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`).join(", ")],
  ].filter(([, v]) => v);
  const counts = [
    s.scene_count ? plural(s.scene_count, "scene", "scenes") : "",
    s.image_count ? plural(s.image_count, "image", "images") : "",
    s.gallery_count ? plural(s.gallery_count, "gallery", "galleries") : "",
  ].filter(Boolean);
  main.innerHTML = `
    <header class="kb-perfhead">
      <span class="kb-perfhead-img kb-group-img kb-studio-img">${hasLogo(s) ? `<img alt="" src="${esc(s.image_path)}">` : `<em>${esc(s.name)}</em>`}</span>
      <div class="kb-perfhead-body">
        <nav class="kb-crumbs"><span><a href="#/studios">${t("Studios")}</a></span>${s.parent_studio ? `<span><a href="#/studio/${esc(s.parent_studio.id)}">${esc(s.parent_studio.name)}</a></span>` : ""}</nav>
        <h1 class="kb-h1">${esc(s.name)}</h1>
        <p class="kb-sub">${counts.join(" · ") || "&nbsp;"}</p>
        <div class="kb-plc-acts">${s.rating100 ? starsHtml(s.rating100) : ""}<button class="kb-plc-btn" data-edit>${icon("edit")}${t("Edit")}</button><button class="kb-plc-btn" data-scrape>${icon("search")}${t("Fill in from the internet")}</button></div>
        ${facts.length ? `<dl class="kb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        ${(s.tags || []).length ? `<div class="kb-chips">${s.tags.map((tg) => `<a class="kb-chip" href="#/tag/${esc(tg.id)}">${esc(tg.name)}</a>`).join("")}</div>` : ""}
        <div class="kb-xhead" data-xhead></div>
        ${s.details ? `<p class="kb-lead kb-perf-details">${esc(s.details)}</p>` : ""}
      </div>
    </header>
    <section data-browser></section>`;
  const xhead = mountSlots("studio.header", main.querySelector("[data-xhead]"), { page: "studio", id, item: s }, { reload: () => go(location.hash.replace(/^#\/?/, ""), true) });
  const edit = (scrape) => openStudioEditor(id, { scrape, onSaved: () => go("studio/" + id, true), onDeleted: () => go("studios", true) });
  main.querySelector("[data-edit]").onclick = () => edit(false);
  main.querySelector("[data-scrape]").onclick = () => edit(true);
  const kinds = ["scene", "image", "gallery"].filter((k) => (k === "scene" ? s.scene_count : k === "image" ? s.image_count : s.gallery_count));
  const b = mediaBrowser(main.querySelector("[data-browser]"), {
    kinds: kinds.length ? kinds : ["scene"],
    query,
    page: "studio",
    params: { id },
    // the studio and all studios below it
    base: () => ({ filter: { studios: { value: [id], modifier: "INCLUDES", depth: -1 } } }),
    playlist: false,
  });
  return () => {
    xhead.destroy();
    b && b.destroy && b.destroy();
  };
}
