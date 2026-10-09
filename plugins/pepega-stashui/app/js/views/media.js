// Shared browsing building block: toolbar, filters, tabs (scenes/images/galleries),
// salon hanging, multi-select with actions. State lives in the URL.

import { esc, icon, store, debounce, seed, errorToast, toast, plural, fmtNum, confirmDialog, promptDialog, starsHtml, ratingFilterSteps } from "../ui.js";
import { filterOf, QUERY_KEYS, loadPlaylists, savePlaylists, labelsFor, linkOf } from "../playlists.js";
import { t } from "../i18n.js";
import { findItems, findIds, favoriteTagId, setFavorite, bulkUpdate, destroyItems } from "../api.js";
import { ensureTiers, hasTiers } from "../tiers.js";
import { restrictIds, critInfo, critKinds, parseCrit, critStr, critText, sortByCrit, openCritFilter } from "../ratingx.js";
import { TIERS } from "../versusx.js";
import { toPiece, Hang } from "../pieces.js";
import { app, setQuery, go, setQueueCount } from "../main.js";
import { tagPicker } from "./tagpicker.js";
import { perfPicker, hasPerformers } from "./perfpicker.js";
import { studioPicker, studiosCache } from "./studiopicker.js";
import { openEditor } from "./edit.js";
import { loadStashFilters, stashFilter } from "../stashfilters.js";
import { hasSources, extendPage, mountSlots, registerList } from "../ext.js";
import { openAdvFilter, parseAdv, advStr, advCount, andInto } from "../advfilter.js";

export const KIND_NAME = { scene: ["Scene", "Scenes"], image: ["Image", "Images"], gallery: ["Gallery", "Galleries"] };
// Unit words for counts ("12 scenes") – separate from the titles above, other languages need that
export const KIND_UNIT = { scene: ["scene", "scenes"], image: ["image", "images"], gallery: ["gallery", "galleries"] };

const SORTS = {
  scene: [["created_at", "Recently added"], ["date", "Date"], ["last_played_at", "Last watched"], ["play_count", "Most watched"], ["rating", "Rating"], ["duration", "Duration"], ["title", "Title"], ["filesize", "File size"], ["path", "Path"], ["random", "Random"]],
  image: [["created_at", "Recently added"], ["date", "Date"], ["rating", "Rating"], ["o_counter", "O counter"], ["title", "Title"], ["filesize", "File size"], ["path", "Path"], ["random", "Random"]],
  gallery: [["created_at", "Recently added"], ["date", "Date"], ["rating", "Rating"], ["images_count", "Image count"], ["title", "Title"], ["path", "Path"], ["random", "Random"]],
};

// Read the filter state from the URL
function readState(q, kind, defaults) {
  const d = defaults || {};
  return {
    q: q.q || "",
    sort: q.sort || d.sort || (SORTS[kind].some(([k]) => k === "created_at") ? "created_at" : "path"),
    dir: q.dir || d.dir || (["title", "path"].includes(q.sort || d.sort) ? "ASC" : "DESC"),
    tags: (q.tags || "").split(",").filter(Boolean),
    xtags: (q.xtags || "").split(",").filter(Boolean),
    perfs: (q.perfs || "").split(",").filter(Boolean),
    pany: q.pany === "1",
    studios: (q.studios || "").split(",").filter(Boolean),
    rating: Number(q.rating || 0),
    fav: q.fav === "1",
    played: q.played || "",
    ori: q.ori || "",
    res: q.res || "",
    len: q.len || "",
    ia: q.ia || "",
    tier: (q.tier || "").split(",").filter(Boolean),
    crit: q.crit || "",
    adv: q.adv || "",
    seed: q.seed || "",
  };
}

// Build the Stash filter. base: the page's restriction (folder, tag, gallery). (Shared with the playlists.)
const buildFilter = (kind, st, base) => filterOf(kind, st, app.favId, base);

export function mediaBrowser(host, opts) {
  // opts: { kinds, query, base(kind) → { filter, tagId }, defaults, counts: {kind: n}, onCount(kind, n), persist }
  const kinds = opts.kinds;
  let kind = kinds.includes(opts.query.kind) ? opts.query.kind : opts.initialKind || kinds[0];
  let st = readState(opts.query, kind, opts.defaults && opts.defaults[kind]);
  let hang = null;
  let sf = null; // a saved filter from Stash, applied on top: { id, name, kind, filter, skipped }
  let sfPending = null; // (being fetched)
  // The Stash filter is an AND on top of the filters set here
  const bf = (k, s, b) => {
    const f = buildFilter(k, s, b);
    if (sf && k === sf.kind && Object.keys(sf.filter).length) andInto(f, sf.filter);
    return f;
  };
  let filterOpen = !!(st.tags.length || st.xtags.length || st.perfs.length || st.studios.length || st.rating || st.fav || st.played || st.ori || st.res || st.len || st.ia || st.tier.length || st.crit || st.adv);
  const rowH = () => store.get("rowHeight", 250);

  host.innerHTML = `
    <div class="kb-browser">
      <div class="kb-toolbar">
        ${kinds.length > 1 ? `<div class="kb-seg kb-kinds" role="tablist">${kinds.map((k) => `<button role="tab" data-kind="${k}">${t(KIND_NAME[k][1])} <span data-kcount="${k}"></span></button>`).join("")}</div>` : ""}
        ${opts.search === false ? "" : `<label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search this view")}" value="${esc(st.q)}"></label>`}
        <select class="kb-field" data-sort aria-label="${t("Sort order")}"></select>
        <button class="kb-btn is-icon" data-dir title="${t("Reverse direction")}" aria-label="${t("Reverse direction")}"></button>
        <button class="kb-btn" data-filter>${icon("filter")}<span>${t("Filter")}</span></button>
        <span class="kb-xtool" data-xtool></span>
        <span class="kb-spacer"></span>
        ${kinds.includes("scene") ? `<button type="button" class="kb-btn is-ghost" data-mute title="${t("Sound in hover previews")}"></button>` : ""}
        <label class="kb-range" title="${t("Thumbnail size")}">${icon("image")}<input type="range" min="130" max="480" step="10" data-rowh value="${rowH()}" aria-label="${t("Size")}"></label>
        ${opts.playlist ? `<select class="kb-field kb-plpick" data-plpick hidden title="${t("Your saved filters – the playlists made from this list")}" aria-label="${t("Saved filters")}"></select>` : ""}
        ${opts.playlist ? `<button class="kb-btn" data-plsave title="${t("Keep these filters as a playlist – it always shows what matches them now")}">${icon("queue")}<span>${opts.query.pl ? t("Save playlist") : t("Save as playlist")}</span></button>` : ""}
        <button class="kb-btn" data-play title="${t("Play everything as a queue")}">${icon("play")}<span>${t("Play")}</span></button>
        <button class="kb-btn is-icon" data-select title="${t("Select")}" aria-label="${t("Select")}">${icon("select")}</button>
      </div>
      <div class="kb-filters" data-filters hidden></div>
      <p class="kb-hint kb-sfnote" data-sfnote hidden></p>
      <div class="kb-xbar" data-xbar></div>
      <p class="kb-resultline" data-result></p>
      <div data-empty></div>
      <div data-hang></div>
    </div>`;
  const $ = (s) => host.querySelector(s);

  // Places for extension plugins: a bar above the list, buttons in the toolbar (ctx follows kind, filters and count)
  let lastFilter = {};
  let lastSort = st.sort;
  let lastRestricted = false;
  let lastCount = null;
  const slotBase = () => ({ page: opts.page || "", params: opts.params || {}, kind, filter: lastFilter, sort: lastSort, dir: st.dir, q: st.q, restricted: lastRestricted, count: lastCount });
  const slotBar = mountSlots("list.bar", $("[data-xbar]"), slotBase(), { reload: () => load() });
  const slotTool = mountSlots("list.toolbar", $("[data-xtool]"), slotBase(), { reload: () => load() });
  const pushSlots = () => {
    slotBar.set(slotBase());
    slotTool.set(slotBase());
  };
  // Open list: an extension source that registers or calls invalidate() later is asked again for the pages already loaded
  let pageLog = [];
  const unregister = registerList({
    async reextend(prefix) {
      const h = hang;
      const log = pageLog;
      if (!h || !log.length) return;
      const all = [];
      for (const e of log) {
        const list = await extendPage(Object.assign({}, e.ctx), prefix);
        list.forEach((x) => all.push({ before: x.before == null ? null : e.ctx.kind + ":" + x.before, last: e.last, piece: x.piece }));
      }
      if (h !== hang) return;
      h.replaceExtras(prefix, all);
      h.opts.onLoaded && h.opts.onLoaded(h);
    },
  });

  // Sound in the hover previews: the same switch as on the home page and in Settings → Player and previews
  const paintMute = () => {
    const b = $("[data-mute]");
    if (!b) return;
    const on = store.get("previewSound", true);
    b.innerHTML = `${icon(on ? "volume" : "mute")}<span>${on ? t("Sound on") : t("Muted")}</span>`;
    b.setAttribute("aria-pressed", !on);
    b.hidden = kind !== "scene";
  };

  function renderTools() {
    host.querySelectorAll("[data-kind]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.kind === kind);
      b.setAttribute("aria-selected", b.dataset.kind === kind);
    });
    const sortSel = $("[data-sort]");
    const sorts = SORTS[kind].concat((opts.extraSorts && opts.extraSorts[kind]) || []);
    sortSel.innerHTML = sorts.map(([k, name]) => `<option value="${k}">${t(name)}</option>`).join("");
    sortSel.value = sorts.some(([k]) => k === st.sort) ? st.sort : sorts[0][0];
    // a sort by a criterion of the detailed rating (the entries are added when the criteria are known)
    if (String(st.sort).startsWith("crit:")) {
      sortSel.insertAdjacentHTML("beforeend", `<option value="${esc(st.sort)}">${t("Detailed")}: ${esc(st.sort.slice(5))}</option>`);
      sortSel.value = st.sort;
    }
    if (critKinds(kind))
      critInfo(kind).then((info) => {
        const names = info.names.filter((n) => info.have.has(n));
        if (!names.length || $("[data-sort]") !== sortSel || !sortSel.isConnected) return;
        sortSel.insertAdjacentHTML("beforeend", names.filter((n) => !sortSel.querySelector(`option[value="${CSS.escape("crit:" + n)}"]`)).map((n) => `<option value="${esc("crit:" + n)}">${t("Detailed")}: ${esc(n)}</option>`).join(""));
        sortSel.value = st.sort;
      }).catch(() => {});
    st.sort = sortSel.value;
    $("[data-dir]").innerHTML = st.dir === "ASC" ? "↑" : "↓";
    $("[data-dir]").hidden = st.sort === "random";
    $("[data-filter]").classList.toggle("is-on", filterOpen);
    $("[data-play]").hidden = kind === "gallery";
    paintMute();
    if ($("[data-plsave]")) $("[data-plsave]").hidden = kind === "gallery";
    renderFilters();
  }

  let picker = null;
  function renderFilters() {
    const box = $("[data-filters]");
    box.hidden = !filterOpen;
    if (!filterOpen) return;
    box.innerHTML = `
      <div class="kb-tagpick" data-tp></div>
      <div class="kb-tagpick kb-perfpick" data-pp hidden></div>
      <div class="kb-tagpick kb-studiopick" data-sp hidden></div>
      <label class="kb-lab">${t("Rating from")}
        <select class="kb-field" data-f="rating"><option value="0">${t("any")}</option>${ratingFilterSteps().map(([n, l]) => `<option value="${n}">${l}</option>`).join("")}</select></label>
      ${kind === "scene" ? `<label class="kb-lab">${t("Watched")}
        <select class="kb-field" data-f="played"><option value="">${t("any")}</option><option value="yes">${t("watched")}</option><option value="no">${t("never")}</option><option value="resume">${t("started")}</option></select></label>
      <label class="kb-lab">${t("Resolution")}
        <select class="kb-field" data-f="res"><option value="">${t("any")}</option><option value="WEB_HD">${t("720p and up")}</option><option value="STANDARD_HD">${t("1080p and up")}</option><option value="QUAD_HD">4K</option></select></label>
      <label class="kb-lab">${t("Funscript")}
        <select class="kb-field" data-f="ia"><option value="">${t("any")}</option><option value="yes">${t("with (The Handy)")}</option><option value="no">${t("without")}</option></select></label>
      <label class="kb-lab">${t("Duration")}
        <select class="kb-field" data-f="len"><option value="">${t("any")}</option><option value="short">${t("under 1 min")}</option><option value="mid">${t("1–10 min")}</option><option value="long">${t("over 10 min")}</option></select></label>` : ""}
      ${kind !== "gallery" ? `<label class="kb-lab">${t("Format")}
        <select class="kb-field" data-f="ori"><option value="">${t("any")}</option><option value="PORTRAIT">${t("Portrait")}</option><option value="LANDSCAPE">${t("Landscape")}</option><option value="SQUARE">${t("Square")}</option></select></label>` : ""}
      ${critKinds(kind) ? `<div class="kb-lab kb-critfilter" data-cf hidden><span>${t("Detailed")}</span><button type="button" class="kb-btn" data-critopen>${icon("sliders")}<span data-crittext>${st.crit ? esc(critText(parseCrit(st.crit))) : t("Criteria …")}</span></button></div>` : ""}
      ${kind !== "gallery" ? `<div class="kb-lab kb-tierfilter" data-tf hidden><span>${t("Tier")}</span><span class="kb-seg kb-tierchips">${TIERS.map((x) => `<button type="button" data-tier="${x.k}" class="${st.tier.includes(x.k) ? "is-on" : ""}" style="--tc:${x.color}">${x.k}</button>`).join("")}</span></div>` : ""}
      <label class="kb-check"><input type="checkbox" data-f="fav"${st.fav ? " checked" : ""}>${t("Favorites only")}</label>
      <button type="button" class="kb-btn${st.adv ? " is-on" : ""}" data-advopen title="${t('Any field of Stash: title, path, dates, counts, codec …')}">${icon("sliders")}<span>${st.adv ? t("Advanced ({n})", { n: advCount(kind, st.adv) }) : t("Advanced …")}</span></button>
      <button class="kb-btn is-ghost" data-clear>${t("Reset")}</button>`;
    box.querySelectorAll("select[data-f]").forEach((s) => (s.value = st[s.dataset.f] || (s.dataset.f === "rating" ? "0" : "")));
    // the tier filter only shows when there are tiers (Versus has been played)
    if (critKinds(kind))
      critInfo(kind).then((info) => {
        const cf = box.querySelector("[data-cf]");
        if (cf) cf.hidden = !info.have.size && !st.crit;
      }).catch(() => {});
    ensureTiers().then(() => {
      const tf = box.querySelector("[data-tf]");
      if (tf) tf.hidden = !hasTiers(kind) && !st.tier.length;
    });
    picker = tagPicker(box.querySelector("[data-tp]"), {
      include: st.tags,
      exclude: st.xtags,
      allowExclude: true,
      placeholder: t("Add tag (right-click a tag to exclude it)"),
      onChange: (inc, exc) => {
        st.tags = inc;
        st.xtags = exc;
        apply();
      },
    });
    // Performers – only when the library has any
    const pp = box.querySelector("[data-pp]");
    hasPerformers().then((yes) => {
      if (!yes && !st.perfs.length) return;
      pp.hidden = false;
      perfPicker(pp, {
        include: st.perfs,
        any: st.pany,
        onChange: (ids, any) => {
          st.perfs = ids;
          st.pany = any;
          apply();
        },
      });
    });

    // Studios – only when the library has any (a studio's own page already is that filter)
    const sp = box.querySelector("[data-sp]");
    studiosCache().then((all) => {
      if ((!all.length && !st.studios.length) || (opts.base && (opts.base(kind) || {}).filter && opts.base(kind).filter.studios)) return;
      sp.hidden = false;
      studioPicker(sp, {
        include: st.studios,
        multi: true,
        placeholder: t("Add studio …"),
        onChange: (ids) => {
          st.studios = ids;
          apply();
        },
      });
    }).catch(() => {});
  }

  // The filters as URL parameters (also what a playlist keeps)
  const queryOf = () => ({
    q: st.q,
    sort: st.sort,
    dir: st.dir,
    tags: st.tags.join(","),
    xtags: st.xtags.join(","),
    perfs: st.perfs.join(","),
    pany: st.pany && st.perfs.length > 1 ? "1" : "",
    studios: st.studios.join(","),
    rating: st.rating || "",
    fav: st.fav ? "1" : "",
    played: st.played,
    ori: st.ori,
    res: st.res,
    len: st.len,
    ia: st.ia,
    tier: st.tier.join(","),
    crit: st.crit,
    adv: st.adv,
  });
  // Saved filters: the playlists of this kind and Stash's own saved filters – one click applies it here
  function paintSfNote() {
    const n = $("[data-sfnote]");
    if (!n) return;
    n.hidden = !sf;
    if (!sf) return;
    n.innerHTML = `${esc(t("Stash filter “{name}” is applied on top.", { name: sf.name }))}${sf.skipped.length ? " " + esc(t("Not supported, left out: {list}", { list: sf.skipped.join(", ") })) : ""} <button type="button" class="kb-btn is-ghost" data-sfoff>${t("Remove it")}</button>`;
  }
  if (opts.playlist) {
    Promise.all([loadPlaylists().catch(() => []), loadStashFilters(kind).catch(() => [])])
      .then(([list, stash]) => {
        const pick = $("[data-plpick]");
        const mine = list.filter((p) => (p.kind === "image" ? "image" : "scene") === kind);
        if (!pick || (!mine.length && !stash.length)) return;
        pick.innerHTML =
          `<option value="">${t("Saved filters")}</option>` +
          mine.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") +
          (stash.length ? `<optgroup label="${esc(t("Saved in Stash"))}">${stash.map((x) => `<option value="sf:${esc(x.id)}">${esc(x.name)}</option>`).join("")}</optgroup>` : "");
        pick.value = opts.query.sf && stash.some((x) => String(x.id) === String(opts.query.sf)) ? "sf:" + opts.query.sf : mine.some((p) => p.id === opts.query.pl) ? opts.query.pl : "";
        pick.hidden = false;
        pick.onchange = () => {
          if (pick.value.startsWith("sf:")) return go(`${kind === "image" ? "images" : "scenes"}?sf=${encodeURIComponent(pick.value.slice(3))}`);
          const pl = mine.find((p) => p.id === pick.value);
          if (pl) go(linkOf(pl).slice(2));
          else if (sf) go(kind === "image" ? "images" : "scenes"); // "Saved filters" again: back to the plain list
        };
      })
      .catch(() => {});
  }
  let plId = opts.query.pl || ""; // opened from a playlist: "Save playlist" changes that one
  function persistQuery() {
    setQuery(Object.assign({ kind: kinds.length > 1 ? kind : "" }, queryOf(), { seed: st.sort === "random" ? st.seed : "", pl: plId, sf: sf ? sf.id : "" }));
  }

  // ---------- Keep the filters as a playlist ----------
  async function savePlaylist() {
    if (sf) return toast(t("A Stash filter can't be kept as a playlist – remove it first, or set the filters here."), "error");
    try {
      const list = await loadPlaylists();
      const cur = list.find((p) => p.id === plId);
      const name = ((await promptDialog({ title: cur ? t("Save playlist") : t("Save as playlist"), label: cur ? t("Name – a new name renames the playlist") : t("Name – the playlist keeps these filters and always shows what matches them now"), value: cur ? cur.name : "", ok: t("Save") })) || "").trim();
      if (!name) return;
      const query = {};
      const all = queryOf();
      QUERY_KEYS.forEach((k) => all[k] && (query[k] = String(all[k])));
      const labels = await labelsFor(st);
      // the same name → that one is replaced; a playlist opened here with a new name → renamed
      let pl = list.find((p) => p.name.toLowerCase() === name.toLowerCase()) || cur || null;
      if (pl) Object.assign(pl, { name, kind, query, labels, changed: Date.now() });
      else list.push((pl = { id: Date.now().toString(36), name, kind, query, labels, created: Date.now() }));
      await savePlaylists(list);
      plId = pl.id;
      persistQuery();
      const b = $("[data-plsave] span");
      if (b) b.textContent = t("Save playlist");
      toast(t("Playlist “{name}” saved", { name }), "ok", { label: t("Playlists"), run: () => go("playlists") });
    } catch (e) {
      errorToast(e, "Playlist");
    }
  }

  function apply() {
    persistQuery();
    load();
  }

  function load() {
    if (sfPending) {
      const p = sfPending;
      sfPending = null;
      return p.then(load);
    }
    if (hang) hang.destroy();
    exitSelect();
    const base = opts.base ? opts.base(kind) : null;
    if (st.sort === "random" && !st.seed) st.seed = seed().replace("random_", "");
    const filter = bf(kind, st, base);
    const sort = st.sort === "random" ? "random_" + st.seed : st.sort;
    $("[data-result]").textContent = "";
    $("[data-empty]").innerHTML = "";
    lastFilter = filter;
    lastSort = sort;
    lastCount = null;
    pageLog = [];
    const box = $("[data-hang]");
    let critAll = null;
    let prevRaw = null; // the last raw item of the previous page (for extensions)
    // Cards of extension plugins for this page (ext.js) – none when no plugin has registered a source.
    // Every page is kept (pageLog): invalidate() asks the sources again for them.
    const extras = async (page, count, items, restricted) => {
      const prev = prevRaw;
      prevRaw = items.length ? items[items.length - 1] : prev;
      lastRestricted = restricted;
      const ctx = { page: opts.page || "", params: opts.params || {}, kind, sort, dir: st.dir, q: st.q, filter, restricted, pageNumber: page, perPage: 60, count, items, prev };
      pageLog.push({ ctx, last: items.length ? kind + ":" + items[items.length - 1].id : null });
      if (!hasSources()) return undefined;
      const list = await extendPage(ctx);
      return list.map((x) => ({ before: x.before == null ? null : kind + ":" + x.before, piece: x.piece })); // (the card list keys items as kind:id)
    };
    hang = new Hang(box, {
      rowHeight: rowH(),
      fetchPage: async (page) => {
        await ensureTiers(); // (the badge on the cards, and the tier filter)
        const ids = await restrictIds(kind, st); // tier and detailed-rating filters (and "sorted by a criterion": those that have it)
        if (String(st.sort).startsWith("crit:")) {
          // Stash can't sort by a criterion: the ids of everything that matches come once (just ids), are ordered here,
          // and only the page you look at is fetched in full
          if (!critAll) critAll = findIds(kind, { q: st.q || undefined, per_page: -1 }, filter, ids).then((r) => sortByCrit(kind, st.sort.slice(5), r.items, st.dir)).then((l) => l.map((x) => x.id));
          const order = await critAll;
          const pageIds = order.slice((page - 1) * 60, page * 60);
          const got = pageIds.length ? await findItems(kind, { per_page: pageIds.length }, {}, pageIds) : { items: [] };
          const byId = new Map(got.items.map((x) => [x.id, x]));
          const raws = pageIds.map((id) => byId.get(id)).filter(Boolean);
          return { count: order.length, pieces: raws.map((x) => toPiece(kind, x, app.favId)), extras: await extras(page, order.length, raws, !!ids) };
        }
        const r = await findItems(kind, { q: st.q || undefined, page, per_page: 60, sort, direction: st.dir }, filter, ids);
        return { count: r.count, pieces: r.items.map((x) => toPiece(kind, x, app.favId)), extras: await extras(page, r.count, r.items, !!ids) };
      },
      onLoaded: (h) => {
        $("[data-result]").textContent = h.count ? plural(h.count, KIND_UNIT[kind][0], KIND_UNIT[kind][1]) : "";
        const kc = host.querySelector(`[data-kcount="${kind}"]`);
        if (kc) kc.textContent = fmtNum(h.count);
        // (above the list, not instead of it: cards from extension plugins may still be there)
        $("[data-empty]").innerHTML = h.count
          ? ""
          : `<div class="kb-empty${h.extras.length ? " is-slim" : ""}"><b>${t("Nothing found")}</b><p>${
              filterOpen || st.q ? t("Nothing matches this search and these filters. Loosen the filters or reset them.") : t("Nothing here yet.")
            }</p>${filterOpen || st.q ? `<button class="kb-btn" data-clearall>${t("Reset filters")}</button>` : ""}</div>`;
        lastCount = h.count;
        pushSlots();
        opts.onCount && opts.onCount(kind, h.count);
      },
      onError: (e) => errorToast(e, "Couldn't load"),
      onOpen: (p, i, h) => openPiece(p, i, h),
      onSelect: (set, h) => renderBulk(set, h),
    });
  }

  // Load the counts of the other tabs once
  if (kinds.length > 1) {
    kinds.forEach(async (k) => {
      try {
        const base = opts.base ? opts.base(k) : null;
        const r = await findItems(k, { per_page: 0 }, buildFilter(k, readState({}, k), base));
        const kc = host.querySelector(`[data-kcount="${k}"]`);
        if (kc && k !== kind) kc.textContent = fmtNum(r.count);
        opts.onCount && opts.onCount(k, r.count);
      } catch (e) { /* count only */ }
    });
  }

  function openPiece(p, i, h) {
    app.context = { kind: p.kind, pieces: h.pieces, index: i, hang: h };
    if (p.kind === "scene") go("scene/" + p.id);
    else if (p.kind === "image") go("image/" + p.id);
    else go("gallery/" + p.id);
  }

  // ---------- Selection & actions ----------

  let bulkEl = null;
  let bulkSlots = null;
  function exitSelect() {
    if (hang) hang.clearSelection();
    if (bulkSlots) bulkSlots.destroy();
    bulkSlots = null;
    if (bulkEl) bulkEl.remove();
    bulkEl = null;
  }
  function renderBulk(set, h) {
    if (!set.size) {
      if (bulkSlots) bulkSlots.destroy();
      bulkSlots = null;
      if (bulkEl) bulkEl.remove();
      bulkEl = null;
      return;
    }
    if (!bulkEl) {
      bulkEl = document.createElement("div");
      bulkEl.className = "kb-bulk";
      bulkEl.innerHTML = `<span class="kb-dc" data-bm1></span><span class="kb-xbulk" data-xbulk></span><span class="kb-dc" data-bm2></span>`;
      document.body.appendChild(bulkEl);
      bulkEl.addEventListener("click", onBulk);
      // buttons of extension plugins: ctx.ids() is the selection as it is now
      bulkSlots = mountSlots("bulk.actions", bulkEl.querySelector("[data-xbulk]"), { page: opts.page || "", params: opts.params || {}, kind, ids: () => (hang ? hang.selectedPieces().map((p) => p.id) : []), pieces: () => (hang ? hang.selectedPieces() : []) }, { reload: () => load() });
    }
    bulkEl.querySelector("[data-bm1]").innerHTML = `<b>${t("{what} selected", { what: plural(set.size, "item", "items") })}</b>
      <button class="kb-btn" data-b="all">${h.done ? t("Select all") : h.count ? t("Select all {n} results", { n: fmtNum(h.count) }) : t("Select all loaded")}</button>
      <button class="kb-btn" data-b="fav"><span class="kb-dotmini"></span>${t("Favorite")}</button>
      <button class="kb-btn" data-b="unfav">${t("Remove favorite")}</button>
      <button class="kb-btn" data-b="edit">${icon("edit")}${t("Edit")}</button>
      ${kind !== "gallery" ? `<button class="kb-btn" data-b="queue">${icon("queue")}${t("Add to queue")}</button>` : ""}
      <button class="kb-btn is-danger" data-b="delete">${icon("trash")}${t("Delete")}</button>`;
    bulkEl.querySelector("[data-bm2]").innerHTML = `<span class="kb-spacer"></span><button class="kb-btn" data-b="none">${t("Done")}</button>`;
    if (bulkSlots) bulkSlots.set({ kind, count: set.size });
  }
  // After editing several items: only their cards are drawn again – the list stays where it is (a full reload would start
  // again at the top with the first page)
  async function refreshItems(ids) {
    const h = hang;
    try {
      const r = await findItems(kind, { per_page: Math.max(1, ids.length) }, {}, ids);
      if (h !== hang) return;
      r.items.forEach((x) => h.update(toPiece(kind, x, app.favId)));
      exitSelect();
    } catch (err) {
      load();
    }
  }
  async function onBulk(e) {
    const b = e.target.closest("[data-b]");
    if (!b || !hang) return;
    const pieces = hang.selectedPieces();
    const ids = pieces.map((p) => p.id);
    try {
      switch (b.dataset.b) {
        case "all": {
          if (hang.done || !hang.count) return hang.selectAll();
          // not everything is loaded: the ids of everything that matches come in one go (just ids), so the selection covers all of it
          b.disabled = true;
          try {
            const base = opts.base ? opts.base(kind) : null;
            const r = await findIds(kind, { q: st.q || undefined, per_page: -1 }, bf(kind, st, base), await restrictIds(kind, st));
            hang.selectKeys(r.items.map((x) => kind + ":" + x.id));
            toast(t("{n} selected", { n: fmtNum(r.items.length) }), "ok");
          } finally {
            b.disabled = false;
          }
          return;
        }
        case "none": return exitSelect();
        case "fav":
        case "unfav": {
          const on = b.dataset.b === "fav";
          await setFavorite(kind, ids, on);
          app.favId = await favoriteTagId(false);
          pieces.forEach((p) => hang.update(Object.assign({}, p, { fav: on })));
          toast(on ? t("{what} marked as favorite", { what: plural(ids.length, "item", "items") }) : t("Favorites removed"), "ok");
          return;
        }
        case "queue": {
          const q = store.get("queue", []);
          pieces.forEach((p) => q.push({ kind: p.kind, id: p.id, title: p.title, thumb: p.thumb }));
          store.set("queue", q);
          setQueueCount();
          toast(t("{what} added to the queue", { what: plural(ids.length, "item", "items") }), "ok");
          return exitSelect();
        }
        case "edit":
          return openEditor(kind, pieces, {
            onSaved: () => refreshItems(ids),
          });
        case "delete": {
          const r = await confirmDialog({
            title: t("Delete {what}?", { what: plural(ids.length, KIND_UNIT[kind][0], KIND_UNIT[kind][1]) }),
            text: t("The items disappear from Stash. With the box ticked, the files on disk are deleted too – this can't be undone."),
            ok: t("Delete"),
            danger: true,
            checkbox: t("Also delete the files from disk"),
          });
          if (!r.ok) return;
          await destroyItems(kind, ids, r.checked);
          hang.remove(pieces.map((p) => p.kind + ":" + p.id));
          toast(t("{what} deleted", { what: plural(ids.length, "item", "items") }), "ok");
          return exitSelect();
        }
      }
    } catch (err) {
      errorToast(err, "Action failed");
    }
  }

  // ---------- Events ----------

  host.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kind]");
    if (k && k.dataset.kind !== kind) {
      kind = k.dataset.kind;
      sf = null;
      paintSfNote();
      st = readState({}, kind, opts.defaults && opts.defaults[kind]);
      renderTools();
      pushSlots();
      return apply();
    }
    if (e.target.closest("[data-mute]")) {
      store.set("previewSound", !store.get("previewSound", true));
      return paintMute();
    }
    if (e.target.closest("[data-sfoff]")) {
      sf = null;
      paintSfNote();
      return apply();
    }
    if (e.target.closest("[data-dir]")) {
      st.dir = st.dir === "ASC" ? "DESC" : "ASC";
      renderTools();
      return apply();
    }
    if (e.target.closest("[data-filter]")) {
      filterOpen = !filterOpen;
      return renderTools();
    }
    if (e.target.closest("[data-clear]") || e.target.closest("[data-clearall]")) {
      Object.assign(st, { q: "", tags: [], xtags: [], perfs: [], pany: false, studios: [], rating: 0, fav: false, played: "", ori: "", res: "", len: "", ia: "", tier: [], crit: "", adv: "" });
      const qi = $("[data-q]");
      if (qi) qi.value = "";
      renderTools();
      return apply();
    }
    if (e.target.closest("[data-advopen]")) {
      return openAdvFilter(kind, st.adv, (rows) => {
        st.adv = advStr(rows);
        renderFilters();
        apply();
      });
    }
    if (e.target.closest("[data-critopen]")) {
      return openCritFilter(kind, parseCrit(st.crit), (list) => {
        st.crit = critStr(list);
        const tx = $("[data-crittext]");
        if (tx) tx.textContent = list.length ? critText(list) : t("Criteria …");
        apply();
      });
    }
    const tb = e.target.closest("[data-tf] [data-tier]");
    if (tb) {
      const k2 = tb.dataset.tier;
      st.tier = st.tier.includes(k2) ? st.tier.filter((x) => x !== k2) : [...st.tier, k2];
      tb.classList.toggle("is-on", st.tier.includes(k2));
      return apply();
    }
    if (e.target.closest("[data-select]")) {
      if (hang && hang.selected.size) exitSelect();
      else if (hang && hang.pieces[0]) hang.toggle(hang.pieces[0].kind + ":" + hang.pieces[0].id);
      return;
    }
    if (e.target.closest("[data-play]")) return playAll();
    if (e.target.closest("[data-plsave]")) return savePlaylist();
  });
  host.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches("[data-sort]")) {
      st.sort = el.value;
      st.dir = ["title", "path"].includes(st.sort) ? "ASC" : "DESC";
      st.seed = "";
      renderTools();
      return apply();
    }
    if (el.dataset && el.dataset.f) {
      const f = el.dataset.f;
      st[f] = el.type === "checkbox" ? el.checked : f === "rating" ? Number(el.value) : el.value;
      return apply();
    }
  });
  host.addEventListener("input", (e) => {
    if (e.target.matches("[data-rowh]")) {
      store.set("rowHeight", Number(e.target.value));
      hang && hang.setRowHeight(Number(e.target.value));
    }
  });
  const qInput = $("[data-q]");
  if (qInput)
    qInput.addEventListener(
      "input",
      debounce(() => {
        st.q = qInput.value.trim();
        apply();
      }, 300)
    );

  // Play everything (or the first 200 results) as a queue
  async function playAll() {
    try {
      const base = opts.base ? opts.base(kind) : null;
      const sort = st.sort === "random" ? "random_" + (st.seed || seed().replace("random_", "")) : st.sort;
      await ensureTiers();
      const crit = String(st.sort).startsWith("crit:");
      const r = await findItems(kind, { q: st.q || undefined, per_page: crit ? -1 : 200, sort: crit ? "rating" : sort, direction: crit ? "DESC" : st.dir }, bf(kind, st, base), await restrictIds(kind, st));
      if (crit) r.items = (await sortByCrit(kind, st.sort.slice(5), r.items, st.dir)).slice(0, 200);
      if (!r.items.length) return toast(t("Nothing to play"));
      const list = r.items.map((x) => toPiece(kind, x, app.favId));
      store.set("queue", list.map((p) => ({ kind: p.kind, id: p.id, title: p.title, thumb: p.thumb })));
      store.set("queuePos", 0);
      setQueueCount();
      app.context = { kind, pieces: list, index: 0, queue: true };
      go((kind === "scene" ? "scene/" : "image/") + list[0].id);
    } catch (e) {
      errorToast(e, "Play");
    }
  }

  renderTools();
  if (opts.query.sf && opts.playlist) {
    sfPending = stashFilter(kind, opts.query.sf)
      .then((r) => {
        if (!r) return toast(t("That saved filter is gone from Stash."), "error");
        sf = r;
        // its search and sort count unless the link already says otherwise
        if (!opts.query.q && r.q) {
          st.q = r.q;
          const qi = $("[data-q]");
          if (qi) qi.value = r.q;
        }
        if (!opts.query.sort && r.sort) {
          st.sort = r.sort;
          st.dir = r.dir === "ASC" ? "ASC" : "DESC";
        }
        renderTools();
        paintSfNote();
      })
      .catch((e) => errorToast(e, "Saved filter"));
  }
  load();

  return {
    destroy() {
      hang && hang.destroy();
      exitSelect();
      unregister();
      slotBar.destroy();
      slotTool.destroy();
    },
    reload: load,
    get hang() {
      return hang;
    },
  };
}
