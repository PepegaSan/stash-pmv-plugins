// Groups (Stash's collections of scenes – formerly "movies"): all groups as poster cards, and one group with its
// scenes (in the order of the group). Scrolling loads more.

import { esc, icon, debounce, errorToast, toast, confirmDialog, plural, fmtDate, starsHtml } from "../ui.js";
import { t } from "../i18n.js";
import { gql, routeSignal } from "../api.js";
import { setQuery } from "../main.js";
import { mediaBrowser } from "./media.js";
import { openGroupEditor } from "./groupedit.js";
import { openAddMedia } from "./perfadd.js";

const SORTS = [
  ["name", "Alphabetical"],
  ["date", "Date"],
  ["scenes_count", "Most scenes"],
  ["rating", "Rating"],
  ["created_at", "Recently added"],
  ["random", "Random"],
];
const PAGE = 60;

const card = (g) => `<a class="kb-perf kb-group" href="#/group/${esc(g.id)}">
    <span class="kb-perf-img">${g.front_image_path ? `<img alt="" loading="lazy" src="${esc(g.front_image_path)}">` : ""}</span>
    <b>${esc(g.name)}</b>
    <small>${[g.scene_count ? plural(g.scene_count, "scene", "scenes") : "", g.date ? String(g.date).slice(0, 4) : ""].filter(Boolean).join(" · ") || "&nbsp;"}</small>
    ${g.rating100 ? starsHtml(g.rating100) : ""}
  </a>`;

export async function render(main, params, query) {
  return params.id ? renderOne(main, params.id, query) : renderList(main, query);
}

async function renderList(main, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Groups")}</h1>
        <p class="kb-sub" data-sub></p>
      </div>
      <div class="kb-head-tools">
        <button type="button" class="kb-btn is-primary" data-new>${icon("plus")}${t("New group")}</button>
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search groups")}" value="${esc(query.q || "")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
      </div>
    </header>
    <div class="kb-perfgrid" data-list><div class="kb-loading">${t("Loading …")}</div></div>
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
        `query($f: FindFilterType) { findGroups(filter: $f) { count groups { id name date front_image_path scene_count rating100 } } }`,
        { f: { q: $("[data-q]").value.trim() || undefined, page, per_page: PAGE, sort: s === "random" ? "random_" + seed : s, direction: s === "name" ? "ASC" : "DESC" } },
        { signal: routeSignal() }
      );
      if (my !== run || !alive) return;
      total = d.findGroups.count;
      $("[data-sub]").textContent = plural(total, "group", "groups");
      const list = d.findGroups.groups;
      if (reset) $("[data-list]").innerHTML = "";
      if (!loaded && !list.length) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("No groups found")}</b><p>${$("[data-q]").value ? t("Try another search.") : t("Groups collect scenes that belong together – make your first one with “New group”.")}</p></div>`;
      else $("[data-list]").insertAdjacentHTML("beforeend", list.map(card).join(""));
      loaded += list.length;
      page++;
    } catch (e) {
      if (my === run) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the groups")}</b><p>${esc(e.message)}</p></div>`;
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
  $("[data-new]").onclick = () => openGroupEditor(null, { name: $("[data-q]").value.trim(), onSaved: (id) => (location.hash = "#/group/" + id) });
  $("[data-q]").addEventListener("input", debounce(reload, 300));
  $("[data-sort]").onchange = reload;
  load(true);
  return () => {
    alive = false;
    io.disconnect();
  };
}

async function renderOne(main, id, query) {
  let destroy = null;
  const redraw = async () => {
    if (destroy) destroy();
    destroy = (await drawOne(main, id, query, redraw)) || null;
  };
  await redraw();
  return () => destroy && destroy();
}

async function drawOne(main, id, query, redraw) {
  let g;
  try {
    g = (
      await gql(
        `query($id: ID!) { findGroup(id: $id) { id name date director synopsis rating100 front_image_path back_image_path scene_count studio { id name } tags { id name } } }`,
        { id },
        { signal: routeSignal() }
      )
    ).findGroup;
  } catch (e) {
    errorToast(e, "Group");
    main.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the group")}</b><p>${esc(e.message)}</p><a class="kb-btn" href="#/groups">${t("All groups")}</a></div>`;
    return;
  }
  if (!g) {
    main.innerHTML = `<div class="kb-empty"><b>${t("Group not found")}</b><a class="kb-btn" href="#/groups">${t("All groups")}</a></div>`;
    return;
  }
  const facts = [
    [t("Date"), g.date ? fmtDate(g.date) : ""],
    [t("Studio"), g.studio ? `<a href="#/studio/${esc(g.studio.id)}">${esc(g.studio.name)}</a>` : ""],
    [t("Director"), esc(g.director || "")],
  ].filter(([, v]) => v);
  main.innerHTML = `
    <header class="kb-perfhead">
      <span class="kb-perfhead-img kb-group-img">${g.front_image_path ? `<img alt="" src="${esc(g.front_image_path)}">` : ""}</span>
      <div class="kb-perfhead-body">
        <nav class="kb-crumbs"><span><a href="#/groups">${t("Groups")}</a></span></nav>
        <h1 class="kb-h1">${esc(g.name)}</h1>
        <p class="kb-sub">${plural(g.scene_count || 0, "scene", "scenes")}</p>
        <div class="kb-plc-acts">${g.rating100 ? starsHtml(g.rating100) : ""}<button type="button" class="kb-btn" data-add>${icon("plus")}${t("Add scenes")}</button><button type="button" class="kb-btn" data-edit>${icon("edit")}${t("Edit group")}</button><button type="button" class="kb-btn is-ghost kb-pdanger" data-del>${icon("trash")}${t("Delete group")}</button></div>
        ${facts.length ? `<dl class="kb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        ${(g.tags || []).length ? `<div class="kb-chips">${g.tags.map((tg) => `<a class="kb-chip" href="#/tag/${esc(tg.id)}">${esc(tg.name)}</a>`).join("")}</div>` : ""}
        ${g.synopsis ? `<p class="kb-lead kb-perf-details">${esc(g.synopsis)}</p>` : ""}
      </div>
    </header>
    <section data-browser></section>`;
  main.querySelector("[data-edit]").onclick = () => openGroupEditor(id, { onSaved: redraw });
  main.querySelector("[data-add]").onclick = () =>
    openAddMedia({ id: g.id, name: g.name }, redraw, {
      only: ["scene"],
      title: t("Add scenes to the group"),
      hint: t("Everything you tick is added to “{name}”. Scenes that are already in it aren't shown.", { name: g.name }),
      filter: (gid) => ({ groups: { value: [gid], modifier: "EXCLUDES" } }),
      link: (gid) => ({ group_ids: { ids: [gid], mode: "ADD" } }),
      done: (n) => t("{n} scenes added to the group", { n }),
    });
  main.querySelector("[data-del]").onclick = async () => {
    const r = await confirmDialog({
      title: t("Delete group “{name}”?", { name: g.name }),
      text: g.scene_count ? t("Only the group is deleted – its {n} scenes stay in your library.", { n: g.scene_count }) : t("The group is empty. It is deleted."),
      ok: t("Delete"),
      danger: true,
    });
    if (!r.ok) return;
    try {
      await gql(`mutation($i: GroupDestroyInput!) { groupDestroy(input: $i) }`, { i: { id: g.id } });
      toast(t("Group deleted"), "ok");
      location.hash = "#/groups";
    } catch (e) {
      errorToast(e, "Delete");
    }
  };
  const b = mediaBrowser(main.querySelector("[data-browser]"), {
    kinds: ["scene"],
    query,
    page: "group",
    params: { id },
    base: () => ({ filter: { groups: { value: [id], modifier: "INCLUDES" } } }),
    defaults: { scene: { sort: "group_scene_number", dir: "ASC" } },
    extraSorts: { scene: [["group_scene_number", "Order in the group"]] },
  });
  return () => b && b.destroy && b.destroy();
}
