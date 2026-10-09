// Search everything: tags, folders, scenes, images, galleries.

import { esc, icon, debounce, plural, errorToast, folderMode } from "../ui.js";
import { t } from "../i18n.js";
import { findTags, loadFolders, findPerformers } from "../api.js";
import { mediaBrowser } from "./media.js";
import { setQuery, app } from "../main.js";

export function render(main, params, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Search")}</h1>
        <label class="kb-search kb-search-big">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Title, file name, tag or folder")}" value="${esc(query.q || "")}" autofocus></label>
      </div>
    </header>
    <div data-quick></div>
    <section data-browser></section>`;
  const $ = (s) => main.querySelector(s);
  let b = null;
  let alive = true;

  async function run() {
    // Ignore late searches after leaving the page
    if (!alive) return;
    const q = $("[data-q]").value.trim();
    setQuery({ q });
    if (b) b.destroy();
    $("[data-browser]").innerHTML = "";
    $("[data-quick]").innerHTML = "";
    if (q.length < 2) {
      $("[data-quick]").innerHTML = `<p class="kb-hint">${t("Enter at least two characters.")}</p>`;
      return;
    }
    // Tags and folders as quick jumps
    try {
      // (folders only when they're loaded on their own – on a big library counting them would hold up every search)
      const [tags, tree, perfs] = await Promise.all([findTags(q, 20), folderMode() === "all" ? loadFolders().catch(() => null) : Promise.resolve(null), findPerformers({ q, perPage: 12, sort: "scenes_count" }).catch(() => ({ performers: [] }))]);
      if (!alive) return;
      const low = q.toLowerCase();
      const folders = !tree ? [] : [...tree.nodes.values()].filter((n) => n.timg + n.tvid > 0 && n.name.toLowerCase().includes(low)).slice(0, 20);
      const tagList = tags.tags.filter((x) => x.id !== app.favId);
      $("[data-quick]").innerHTML =
        (perfs.performers.length ? `<h2 class="kb-h2">${t("Performers")}</h2><div class="kb-plc-perfs">${perfs.performers.map((p) => `<a class="kb-plc-perf" href="#/performer/${p.id}"><img alt="" loading="lazy" src="${esc(p.image_path || "")}"><span>${esc(p.name)}</span></a>`).join("")}</div>` : "") +
        (tagList.length ? `<h2 class="kb-h2">${t("Tags")}</h2><div class="kb-chips">${tagList.map((x) => `<a class="kb-chip" href="#/tag/${x.id}">${esc(x.name)}</a>`).join("")}</div>` : "") +
        (folders.length ? `<h2 class="kb-h2">${t("Folders")}</h2><div class="kb-chips">${folders.map((n) => `<a class="kb-chip" href="#/folder/${n.id}" title="${esc(n.path)}">${icon("folder")}${esc(n.name)}</a>`).join("")}</div>` : "") +
        `<h2 class="kb-h2">${t("Results")}</h2>`;
    } catch (e) {
      errorToast(e, "Search");
    }
    if (!alive) return;
    b = mediaBrowser($("[data-browser]"), { kinds: ["scene", "image", "gallery"], query: Object.assign({}, query, { q }), search: false, page: "search" });
  }
  const input = $("[data-q]");
  input.addEventListener("input", debounce(run, 350));
  if (query.q) run();
  else input.focus();
  return () => {
    alive = false;
    if (b) b.destroy();
  };
}
