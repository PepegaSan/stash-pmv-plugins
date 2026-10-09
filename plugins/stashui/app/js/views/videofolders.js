// Video folders: the video counterpart of the Galleries page – every folder that holds videos as a card with pictures
// from its scenes, its name, how many videos it has. A click opens the folder at its videos.
// On a big library nothing is counted up front: the folders come in pieces and each piece is counted first
// (one cheap query per folder), folders without videos drop out.

import { esc, icon, debounce, errorToast, plural, store, folderMode } from "../ui.js";
import { t, locale } from "../i18n.js";
import { loadFolders, findItems, folderVideoCounts } from "../api.js";

const SORTS = [
  ["name", "Alphabetical"],
  ["name:DESC", "Alphabetical (Z–A)"],
  ["count", "Most videos"],
  ["count:ASC", "Fewest videos"],
  ["random", "Random"],
];
const STEP = 36;

// Up to three scene pictures for a folder card (a different pick per folder, stable between visits)
const coverCache = new Map();
window.addEventListener("stash:library-changed", () => coverCache.clear());
function videoCovers(id, deep) {
  const key = id + (deep ? "d" : "");
  if (!coverCache.has(key)) {
    const ff = { files_filter: { parent_folder: { value: [id], modifier: "INCLUDES", depth: deep ? -1 : 0 } } };
    coverCache.set(key, findItems("scene", { per_page: 3, sort: "random_" + id }, ff).then((r) => r.items.map((x) => x.paths.screenshot).filter(Boolean)).catch(() => []));
  }
  return coverCache.get(key);
}

export async function render(main, params, query) {
  if (folderMode() === "off" && !sessionStorage.getItem("stashui.foldersOnce")) {
    main.innerHTML = `<div class="kb-empty"><b>${t("Folder loading is switched off")}</b>
      <p>${t("Counting folders reads the whole library, which can take very long on big libraries. Switch it back on under Settings → General.")}</p>
      <p><button class="kb-btn is-primary" data-loadonce>${t("Load anyway")}</button> <a class="kb-btn" href="#/settings/this-ui?find=${encodeURIComponent(t("Folder loading"))}">${t("Settings")}</a></p></div>`;
    main.querySelector("[data-loadonce]").onclick = () => {
      sessionStorage.setItem("stashui.foldersOnce", "1");
      render(main, params, query);
    };
    return;
  }
  const opt = Object.assign({ deep: false, sort: "name" }, store.get("videoFolders", {}));
  if (!SORTS.some((s) => s[0] === opt.sort)) opt.sort = "name";
  const save = () => store.set("videoFolders", opt);

  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Video folders")}</h1>
        <p class="kb-sub" data-sub>${t("Loading …")}</p>
      </div>
      <div class="kb-head-tools">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search folders")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
        <label class="kb-switch" title="${t("Also show content from subfolders")}"><input type="checkbox" data-deep${opt.deep ? " checked" : ""}><i></i><span class="kb-lab-t">${t("Include subfolders")}</span></label>
      </div>
    </header>
    <div class="kb-rooms" data-list></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = opt.sort;

  let tree;
  try {
    tree = await loadFolders(false, { user: true });
  } catch (e) {
    errorToast(e, "Folders");
    $("[data-sub]").textContent = "";
    $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load folders")}</b><p>${esc(e.message || "")}</p></div>`;
    return;
  }
  // a big library has no counts yet: they are asked for per piece, and only a few sorts make sense
  if (tree.unc) {
    for (const o of [...$("[data-sort]").options]) if (o.value.startsWith("count")) o.remove();
    if (opt.sort.startsWith("count")) opt.sort = "name";
    $("[data-sort]").value = opt.sort;
  }

  const ctl = new AbortController();
  const known = new Map(); // id → video count (big library: filled while paging)
  const rank = new Map(); // random order, fixed per visit
  let q = "";
  let queue = [];
  let qi = 0;
  let shown = 0;
  let busy = false;
  let run = 0;
  const count = (n) => (tree.unc ? known.get(n.id) : opt.deep ? n.tvid : n.vid) || 0;
  const col = new Intl.Collator(locale(), { numeric: true, sensitivity: "base" });

  function plan() {
    const [key, dir] = opt.sort.split(":");
    let list = [...tree.nodes.values()].filter((n) => tree.unc || count(n) > 0);
    if (q) list = list.filter((n) => (n.name + " " + n.path).toLowerCase().includes(q));
    if (key === "random") list.sort((a, b) => (rank.get(a.id) ?? rank.set(a.id, Math.random()).get(a.id)) - (rank.get(b.id) ?? rank.set(b.id, Math.random()).get(b.id)));
    else if (key === "count") list.sort((a, b) => (dir === "ASC" ? 1 : -1) * (count(a) - count(b)) || col.compare(a.name, b.name));
    else list.sort((a, b) => (dir === "DESC" ? -1 : 1) * col.compare(a.name, b.name));
    return list;
  }

  const parentName = (n) => {
    const p = n.parent && tree.nodes.get(n.parent);
    return p ? p.name : "";
  };
  const cardHtml = (n) => `<a class="kb-room" href="#/folder/${esc(n.id)}?kind=scene${opt.deep ? "&deep=1" : ""}" data-room="${esc(n.id)}" title="${esc(n.path)}">
      <div class="kb-room-art"></div>
      <b>${esc(n.name)}</b>
      <small>${[plural(count(n), "video", "videos"), !opt.deep && n.kids.length ? plural(n.kids.length, "subfolder", "subfolders") : "", parentName(n)].filter(Boolean).join(t(", "))}</small>
    </a>`;

  function sub() {
    const more = qi < queue.length;
    $("[data-sub]").textContent = shown ? plural(shown, "folder", "folders") + (more && tree.unc ? " …" : "") : "";
  }

  // The next piece of folders (a big library: counted first, the empty ones dropped)
  async function more() {
    if (busy) return;
    busy = true;
    const my = run;
    let added = 0;
    const out = [];
    try {
      while (qi < queue.length && added < STEP && my === run) {
        let chunk = queue.slice(qi, qi + (tree.unc ? 12 : STEP));
        qi += chunk.length;
        if (tree.unc) {
          const m = await folderVideoCounts(chunk.map((n) => n.id), opt.deep ? -1 : 0, { signal: ctl.signal });
          if (my !== run) return;
          chunk.forEach((n) => known.set(n.id, m.get((opt.deep ? "d" : "o") + n.id) || 0));
          chunk = chunk.filter((n) => count(n) > 0);
        }
        out.push(...chunk);
        added += chunk.length;
      }
      if (my !== run) return;
      if (out.length) {
        $("[data-list]").insertAdjacentHTML("beforeend", out.map(cardHtml).join(""));
        shown += out.length;
        main.querySelectorAll("[data-room]:not([data-seen])").forEach((r) => {
          r.dataset.seen = "1";
          io2.observe(r);
        });
      }
      if (!shown && qi >= queue.length) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("No folders with videos")}</b><p>${q ? t("Try another search.") : t("Folders show up here as soon as they hold videos.")}</p></div>`;
      sub();
    } catch (e) {
      if (e && e.name !== "AbortError" && my === run) errorToast(e, "Folders");
    } finally {
      busy = false;
      if (my === run) requestAnimationFrame(fillMore);
    }
  }
  function fillMore() {
    const el = $("[data-more]");
    if (el && el.isConnected && !busy && qi < queue.length && el.getBoundingClientRect().top < innerHeight + 800) more();
  }

  // cover pictures when a card comes near
  const io2 = new IntersectionObserver(
    (es) =>
      es.forEach(async (e) => {
        if (!e.isIntersecting) return;
        io2.unobserve(e.target);
        const art = e.target.querySelector(".kb-room-art");
        const urls = await videoCovers(e.target.dataset.room, opt.deep);
        art.innerHTML = urls.map((u) => `<img alt="" loading="lazy" src="${esc(u)}">`).join("");
        if (urls.length === 1) art.style.gridTemplateColumns = "1fr";
      }),
    { rootMargin: "300px" }
  );
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: "800px" });
  io.observe($("[data-more]"));

  function restart() {
    run++;
    busy = false;
    qi = 0;
    shown = 0;
    queue = plan();
    $("[data-list]").innerHTML = "";
    sub();
    more();
  }
  $("[data-q]").addEventListener("input", debounce((e) => {
    q = e.target.value.trim().toLowerCase();
    restart();
  }, 250));
  $("[data-sort]").onchange = (e) => {
    opt.sort = e.target.value;
    save();
    restart();
  };
  $("[data-deep]").onchange = (e) => {
    opt.deep = e.target.checked;
    save();
    known.clear();
    restart();
  };
  restart();
  return () => {
    ctl.abort();
    io.disconnect();
    io2.disconnect();
  };
}
