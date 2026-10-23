// Discover: search a stash-box (StashDB …) for scenes – not only what the library has. The results are cards like the local scenes
// (cover, title, studio, date, performers, length); the ones the library already has say so and open the local scene, the others
// open the stash-box page. Asked through Stash UI's backend, which uses the API key Stash has for the box (it never reaches the page).

import { esc, icon, fmtDuration, fmtDate, errorToast, store, debounce } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { runBackend } from "../interactive.js";
import { boxBase, localBoxIds, lazyCovers, localPerformers, sceneHasMine, daysAgo, openBoxScene } from "./perfstats.js";

const SORTS = [
  ["DATE", "Newest first"],
  ["TRENDING", "Trending"],
  ["TITLE", "Title A–Z"],
  ["CREATED_AT", "Recently added"],
];
const PER_PAGE = 40;
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export async function render(main) {
  const opt = Object.assign({ sort: "DATE", show: "all", q: "", days: 0, perf: "all" }, store.get("discover", {}));
  opt.days = Math.max(0, parseInt(opt.days, 10) || 0);
  if (opt.perf !== "mine" && opt.perf !== "women") opt.perf = "all";
  if (!SORTS.some((s) => s[0] === opt.sort)) opt.sort = "DATE";
  const save = () => store.set("discover", opt);

  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Discover")}</h1>
        <p class="kb-sub" data-sub>${t("Loading …")}</p>
      </div>
      <div class="kb-head-tools">
        <select class="kb-field" data-box aria-label="${t("Stash-box")}" hidden></select>
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q value="${esc(opt.q)}" placeholder="${t("Search title, performer, studio …")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}"${v === opt.sort ? " selected" : ""}>${t(l)}</option>`).join("")}</select>
        <select class="kb-field" data-show aria-label="${t("Show")}">${[["all", "All"], ["missing", "Only what's not in your library"], ["have", "Only what's in your library"]].map(([v, l]) => `<option value="${v}"${v === opt.show ? " selected" : ""}>${t(l)}</option>`).join("")}</select>
        <select class="kb-field" data-perf aria-label="${t("Performers")}">${[["all", "Any performers"], ["mine", "Performers from my library"], ["women", "Women from my library"]].map(([v, l]) => `<option value="${v}"${v === opt.perf ? " selected" : ""}>${t(l)}</option>`).join("")}</select>
        <label class="kb-lab kb-disc-days" title="${esc(t("Only scenes released in the last n days. 0 = off."))}">${t("Last (days)")} <input type="number" min="0" max="36500" class="kb-field kb-pst-days" data-days value="${opt.days || ""}" placeholder="0"></label>
      </div>
    </header>
    <div class="kb-disc-grid" data-grid></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  const sub = $("[data-sub]");
  const grid = $("[data-grid]");
  const boxSel = $("[data-box]");

  let boxes;
  try {
    const d = await gql(`query { configuration { general { stashBoxes { endpoint name } } } }`);
    boxes = (d.configuration.general.stashBoxes || []).filter((b) => b.endpoint);
  } catch (err) {
    sub.textContent = "";
    grid.innerHTML = `<p class="kb-pst-wait is-err">${esc(String(err.message || err))}</p>`;
    return;
  }
  if (!boxes.length) {
    sub.textContent = "";
    grid.innerHTML = `<div class="kb-empty"><b>${t("No stash-box is set up in Stash yet")}</b><p>${t("Add StashDB (or another stash-box) under Settings → Metadata Providers in classic Stash – then you can search it here.")}</p><p><a class="kb-btn" href="#/extern/classic-settings">${t("Open in classic Stash")}</a></p></div>`;
    return;
  }
  const want = store.get("discoverBox", "") || store.get("missingBox", "");
  let box = boxes.find((b) => b.endpoint === want) || boxes[0];
  if (boxes.length > 1) {
    boxSel.hidden = false;
    boxSel.innerHTML = boxes.map((b) => `<option value="${esc(b.endpoint)}"${b.endpoint === box.endpoint ? " selected" : ""}>${esc(b.name || b.endpoint)}</option>`).join("");
  }

  let gen = 0; // a newer search makes older answers obsolete
  let page = 0;
  let total = 0;
  let loaded = 0;
  let busy = false;
  let done = false;
  let have = new Map();
  let mineIdx = null; // the library's performers (for "Performers from my library")
  const byId = new Map(); // box scene id → scene (the window opens from a card)
  const seen = new Set();
  const mine = () => `${box.name || box.endpoint}`;

  const card = (x) => {
    const local = have.get(x.id) || "";
    const sub2 = [x.studio, x.performers.filter(Boolean).slice(0, 3).join(", "), x.duration ? fmtDuration(x.duration) : ""].filter(Boolean).join(" · ");
    const href = local ? `#/scene/${local}` : `${boxBase(box.endpoint)}/scenes/${encodeURIComponent(x.id)}`;
    return `<a class="kb-disc-card${local ? " is-have" : ""}" href="${esc(href)}"${local ? "" : ' target="_blank" rel="noopener noreferrer"'} data-id="${esc(x.id)}">
      <span class="kb-disc-cover">${x.image ? `<img alt="" data-cover="${esc(x.image)}">` : ""}<i class="kb-disc-badge">${local ? t("In your library") : t("Missing")}</i></span>
      <span class="kb-disc-body"><b>${esc(x.title || x.id)}</b>${sub2 ? `<small>${esc(sub2)}</small>` : ""}<small class="kb-disc-date">${x.date ? esc(fmtDate(x.date)) : "–"}</small></span></a>`;
  };

  const status = () => {
    sub.textContent = total ? t("{name}: {n} scenes found", { name: mine(), n: total }) : "";
  };

  async function more() {
    if (busy || done) return;
    busy = true;
    const run = gen;
    const mark = $("[data-more]");
    mark.innerHTML = `<span class="kb-hint">${t("Asking {name} …", { name: mine() })}</span>`;
    try {
      const r = await runBackend({ mode: "box_scenes", endpoint: box.endpoint, text: opt.q.trim(), sort: opt.sort, direction: opt.sort === "TITLE" ? "ASC" : "DESC", page: page + 1, per_page: PER_PAGE, browse: 1, since: opt.days ? daysAgo(opt.days + 1) : "", performers_in: opt.perf !== "all" && mineIdx ? [...(opt.perf === "women" ? mineIdx.women : mineIdx.ids).keys()] : [] });
      if (run !== gen) return;
      page++;
      total = r.count || 0;
      const list = (r.scenes || []).filter((x) => !seen.has(x.id));
      list.forEach((x) => (seen.add(x.id), byId.set(x.id, x)));
      loaded += (r.scenes || []).length;
      done = !(r.scenes || []).length || loaded >= total;
      // the window of days is also checked here (a box without a date criterion sends everything); newest first: once a page reaches back past it, the rest is older
      const from = opt.days ? daysAgo(opt.days) : "";
      if (from && opt.sort === "DATE") {
        const ds = (r.scenes || []).map((x) => x.date).filter(Boolean);
        if (ds.length && ds.reduce((a, b) => (a < b ? a : b)) < from) done = true;
      }
      const shown = list.filter((x) => (opt.show === "missing" ? !have.has(x.id) : opt.show === "have" ? have.has(x.id) : true) && (!from || (x.date && x.date >= from)) && (opt.perf === "all" || sceneHasMine(mineIdx, x, opt.perf === "women")));
      grid.insertAdjacentHTML("beforeend", shown.map(card).join(""));
      status();
      lazyCovers(grid, box.endpoint, null);
      if (!grid.children.length && done) {
        // say why: the box sent nothing although it counts scenes (some boxes only answer to a search word), or "Show" hides them all
        const filtered = opt.show !== "all" || opt.days || opt.perf !== "all";
        const why = !(r.scenes || []).length && total && !filtered ? t("{name} says it has {n} scenes but sent none. Try a search word – some stash-boxes can't be browsed without one.", { name: mine(), n: total }) : list.length && opt.show !== "all" && !opt.days && opt.perf === "all" ? t("{n} scenes found, but none matches “Show”. Set Show to All.", { n: list.length }) : filtered ? t("Nothing matches your filters (Show, Performers, Last days).") : t("Nothing found.");
        grid.innerHTML = `<p class="kb-pst-wait">${esc(why)}</p>${r.debug ? `<p class="kb-pst-wait"><small>${t("What the box answered:")} <code>${esc(r.debug)}</code></small></p>` : ""}`;
      }
    } catch (err) {
      if (run !== gen) return;
      done = true;
      mark.innerHTML = "";
      if (!grid.children.length) grid.innerHTML = `<p class="kb-pst-wait is-err">${esc(String(err.message || err).replace(/^\[Stash UI\]\s*/, ""))}</p>`;
      errorToast(err, "Discover");
    } finally {
      if (run === gen) {
        busy = false;
        mark.innerHTML = done ? "" : `<button type="button" class="kb-btn is-ghost" data-loadmore>${t("Load more")}</button>`;
        // a tall screen: keep asking while the end of the list is in view
        if (!done && mark.getBoundingClientRect().top < innerHeight + 200 && document.contains(mark)) setTimeout(() => run === gen && more(), 50);
      }
    }
  }

  async function start() {
    gen++;
    page = 0;
    total = 0;
    loaded = 0;
    done = false;
    busy = false;
    seen.clear();
    byId.clear();
    grid.innerHTML = "";
    $("[data-more]").innerHTML = "";
    sub.textContent = t("Loading …");
    const run = gen;
    try {
      have = await localBoxIds(box.endpoint);
    } catch (e) {
      have = new Map();
    }
    if (run !== gen) return;
    if (opt.perf !== "all" || !mineIdx) {
      try {
        mineIdx = await localPerformers(box.endpoint, true);
      } catch (e) {
        mineIdx = null;
      }
      if (run !== gen) return;
    }
    if (opt.perf !== "all" && mineIdx && !(opt.perf === "women" ? mineIdx.women : mineIdx.ids).size) {
      // nobody in the library is linked to this stash-box: asking for "their" scenes would page through the whole box
      sub.textContent = "";
      grid.innerHTML = `<p class="kb-pst-wait">${opt.perf === "women" && mineIdx.ids.size ? t("None of the women in your library is linked to this stash-box yet (their gender has to be set on the performer).") : t("None of your performers is linked to this stash-box yet. Open a performer → Edit → “Fill in from the internet” to link one.")}</p>`;
      return;
    }
    more();
  }

  const onQ = debounce(() => {
    opt.q = $("[data-q]").value;
    save();
    start();
  }, 450);
  $("[data-q]").addEventListener("input", onQ);
  $("[data-q]").addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), (opt.q = e.target.value), save(), start()));
  $("[data-sort]").onchange = (e) => ((opt.sort = e.target.value), save(), start());
  $("[data-show]").onchange = (e) => ((opt.show = e.target.value), save(), start());
  $("[data-perf]").onchange = (e) => ((opt.perf = e.target.value), save(), start());
  $("[data-days]").onchange = (e) => ((opt.days = Math.max(0, parseInt(e.target.value, 10) || 0)), (e.target.value = opt.days || ""), save(), start());
  boxSel.onchange = () => {
    box = boxes.find((b) => b.endpoint === boxSel.value) || box;
    store.set("discoverBox", box.endpoint);
    start();
  };
  main.addEventListener("click", (e) => e.target.closest("[data-loadmore]") && more());
  // a scene the library lacks opens in a window (bigger cover, details, performers) – the library's own ones go straight to the local scene
  grid.addEventListener("click", (e) => {
    const a = e.target.closest("a.kb-disc-card:not(.is-have)");
    const x = a && byId.get(a.dataset.id);
    if (!x || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    openBoxScene(x, { endpoint: box.endpoint, name: box.name });
  });
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: "400px" });
    io.observe($("[data-more]"));
  }
  start();
}
