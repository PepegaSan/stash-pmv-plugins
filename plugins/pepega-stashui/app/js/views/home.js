// Home page: figures, then sections – the built-in ones (continue watching, favorites, new arrivals,
// folders, random) and your own ("scenes tagged X, most watched first"). "Customize" switches to an
// edit mode: show/hide, drag or move up/down, add, edit and delete own sections. Kept in this browser.

import { esc, icon, fmtNum, store, seed, errorToast, folderMode, openDrawer, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import { gql, stats, findItems, loadFolders } from "../api.js";
import { toPiece, Hang } from "../pieces.js";
import { app, go } from "../main.js";
import { roomsHtml, fillRoomCovers } from "./folder.js";
import { tagPicker } from "./tagpicker.js";
import { perfPicker, hasPerformers } from "./perfpicker.js";
import { mountRailEditor } from "./homerail.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return t("Late night.");
  if (h < 11) return t("Good morning.");
  if (h < 18) return t("Good afternoon.");
  return t("Good evening.");
}

// Home sections: a section is only asked for when it comes into view (a long page asks for what you scroll to),
// two at a time (the queries are heavy on a big library), and the result is kept for five minutes (coming back
// to the home page doesn't ask again; "Shuffle" does).
const homeCache = new Map(); // section → { at, pieces }
const HOME_TTL = 5 * 60000;
let homeActive = 0;
const homeWait = [];
async function homeSlot(fn) {
  while (homeActive >= 2) await new Promise((r) => homeWait.push(r));
  homeActive++;
  try {
    return await fn();
  } finally {
    homeActive--;
    const w = homeWait.shift();
    if (w) w();
  }
}
const whenVisible = (el) =>
  new Promise((res) => {
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (io.disconnect(), res()), { rootMargin: "400px" });
    io.observe(el);
  });
window.addEventListener("stash:library-changed", () => homeCache.clear());

// A small wall with a fixed number of items (key: the section – its result is kept)
function wall(el, fetcher, rowHeight, key) {
  return new Hang(el, {
    rowHeight: rowHeight || 210,
    fetchPage: async (page) => {
      if (page > 1) return { count: 0, pieces: [] };
      const hit = key && homeCache.get(key);
      let pieces;
      if (hit && Date.now() - hit.at < HOME_TTL) pieces = hit.pieces;
      else {
        await whenVisible(el);
        pieces = await homeSlot(fetcher);
        if (key) homeCache.set(key, { at: Date.now(), pieces });
      }
      if (!pieces.length) el.closest("section").hidden = true;
      return { count: pieces.length, pieces };
    },
    onOpen: (p, i, h) => {
      app.context = { kind: p.kind, pieces: h.pieces, index: i, hang: h };
      go((p.kind === "scene" ? "scene/" : p.kind === "image" ? "image/" : "gallery/") + p.id);
    },
    onError: (e) => errorToast(e, "Home"),
  });
}

const BUILTIN = {
  resume: { title: "Continue watching", hint: "Started scenes, most recently watched first" },
  foryou: { title: "For you", hint: "Unwatched scenes with the tags you watched most this week" },
  rewatch: { title: "Long time no see", hint: "Favorites and top-rated scenes you haven't watched for a month" },
  fav: { title: "Favorites", hint: "Scenes and images with the heart, mixed" },
  new: { title: "Recently added", hint: "The newest scenes and images" },
  folders: { title: "Folders", hint: "Your biggest folders" },
  random: { title: "Random", hint: "Something random – shuffle for more" },
};
const DEFAULT_LAYOUT = Object.keys(BUILTIN).map((id) => ({ id }));
const SORTS = [
  ["created_at", "Recently added"],
  ["date", "Date"],
  ["last_played_at", "Last watched"],
  ["play_count", "Most watched"],
  ["o_counter", "O counter"],
  ["rating", "Rating"],
  ["duration", "Duration"],
  ["title", "Title"],
  ["random", "Random"],
];
const SCENE_ONLY = new Set(["last_played_at", "play_count", "duration"]);

const loadLayout = () => {
  const l = store.get("homeLayout", null);
  if (!(Array.isArray(l) && l.length)) return DEFAULT_LAYOUT.map((x) => ({ ...x }));
  // Built-in sections added in a newer version show up in a layout saved before (after "Continue watching")
  let at = l.findIndex((s) => s.id === "resume") + 1;
  Object.keys(BUILTIN).forEach((id) => {
    if (l.some((s) => s.id === id)) return;
    l.splice(at++, 0, { id });
  });
  return l;
};

// The tags you watched most in the last 7 days (plays in that time; the favorite tag doesn't count)
async function topTagsOfWeek() {
  const since = Date.now() - 7 * 864e5;
  const d = await gql(`query($f: FindFilterType, $s: SceneFilterType) { findScenes(filter: $f, scene_filter: $s) { scenes { play_history tags { id name } } } }`, {
    f: { per_page: -1 },
    s: { last_played_at: { value: new Date(since).toISOString(), modifier: "GREATER_THAN" } },
  });
  const m = new Map();
  for (const sc of d.findScenes.scenes) {
    const n = (sc.play_history || []).filter((x) => Date.parse(x) >= since).length || 1;
    for (const tg of sc.tags || []) {
      if (tg.id === app.favId) continue;
      const e = m.get(tg.id) || { tag: tg, n: 0 };
      e.n += n;
      m.set(tg.id, e);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 3).map((e) => e.tag);
}
const saveLayout = (l) => store.set("homeLayout", l);
const titleOf = (s) => (s.custom ? s.custom.title || t("My section") : t(BUILTIN[s.id].title));

// An own section → what Stash is asked for
function customQuery(c, kind) {
  const f = {};
  const tags = [...(c.tags || [])];
  if (c.fav && app.favId) tags.push(app.favId);
  if (tags.length) f.tags = { value: tags, modifier: "INCLUDES_ALL" };
  if ((c.perfs || []).length) f.performers = { value: c.perfs, modifier: "INCLUDES_ALL" };
  let sort = c.sort || "created_at";
  if (kind !== "scene" && SCENE_ONLY.has(sort)) sort = "created_at";
  return { filter: f, find: { sort: sort === "random" ? seed() : sort, direction: c.dir || (sort === "title" ? "ASC" : "DESC") } };
}
function customLink(c) {
  const kind = c.kind === "image" ? "images" : "scenes";
  const q = new URLSearchParams();
  if (c.sort && c.sort !== "random") q.set("sort", c.sort);
  if (c.dir) q.set("dir", c.dir);
  if ((c.tags || []).length) q.set("tags", c.tags.join(","));
  if ((c.perfs || []).length) q.set("perfs", c.perfs.join(","));
  if (c.fav) q.set("fav", "1");
  return `#/${kind}${q.toString() ? "?" + q : ""}`;
}

export async function render(main) {
  let layout = loadLayout();
  let editing = false;
  let editTab = "home"; // Customize: the home page or the menu on the left
  let hangs = [];
  let stopCovers = () => {};
  const cleanup = () => {
    hangs.forEach((h) => h.destroy());
    hangs = [];
    stopCovers();
    stopCovers = () => {};
  };

  main.innerHTML = `
    <header class="kb-head kb-home-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${greeting()}</h1>
        <div class="kb-figures" data-figures></div>
      </div>
      <div class="kb-head-tools"><button type="button" class="kb-btn is-ghost" data-mute title="${t("Sound in hover previews")}"></button><button type="button" class="kb-btn is-ghost" data-customize>${icon("edit")}<span>${t("Customize")}</span></button></div>
    </header>
    <div data-sections></div>`;
  const $ = (s) => main.querySelector(s);
  const box = $("[data-sections]");
  // Mute: the same switch as Settings → Player and previews → Sound in previews
  const paintMute = () => {
    const on = store.get("previewSound", true);
    $("[data-mute]").innerHTML = `${icon(on ? "volume" : "mute")}<span>${on ? t("Sound on") : t("Muted")}</span>`;
    $("[data-mute]").setAttribute("aria-pressed", !on);
  };
  paintMute();
  $("[data-mute]").onclick = () => {
    store.set("previewSound", !store.get("previewSound", true));
    paintMute();
  };

  stats()
    .then((s) => {
      $("[data-figures]").innerHTML =
        `<span><b>${fmtNum(s.scene_count)}</b> ${t("scenes")}</span>` +
        `<span><b>${fmtNum(s.image_count)}</b> ${t("images")}</span>` +
        `<span><b>${fmtNum(s.gallery_count)}</b> ${t("galleries")}</span>` +
        `<span><b>${fmtNum(Math.round(s.scenes_duration / 3600))}</b> ${t("hours of video")}</span>` +
        `<span><b>${fmtNum(s.total_play_count)}</b> ${t("plays")}</span>`;
    })
    .catch(() => {});

  // ---------- Showing the sections ----------
  function renderSections() {
    cleanup();
    box.className = "";
    box.innerHTML = layout
      .filter((s) => !s.hidden && (s.custom || BUILTIN[s.id]) && !(s.id === "folders" && folderMode() !== "all"))
      .map((s) => {
        const links =
          s.id === "resume" ? `<a href="#/history">${t("History")}</a>`
          : s.id === "foryou" ? `<span class="kb-home-why" data-why></span>`
          : s.id === "rewatch" ? `<a href="#/scenes?rating=4&sort=last_played_at&dir=ASC">${t("All")}</a>`
          : s.id === "fav" ? `<a href="#/scenes?fav=1">${t("All scenes")}</a> <a href="#/images?fav=1">${t("All images")}</a>`
          : s.id === "new" ? `<a href="#/scenes">${t("Scenes")}</a> <a href="#/images">${t("Images")}</a>`
          : s.id === "folders" ? `<a href="#/folders">${t("All folders")}</a>`
          : s.id === "random" ? `<button class="kb-btn is-ghost" data-reroll>${icon("shuffle")}${t("Shuffle")}</button>`
          : `<a href="${esc(customLink(s.custom))}">${t("All")}</a>`;
        return `<section data-home="${esc(s.id)}"><h2 class="kb-h2">${esc(titleOf(s))} ${links}</h2>${s.id === "folders" ? "<div data-rooms></div>" : '<div data-w></div>'}</section>`;
      })
      .join("");
    if (!box.children.length) box.innerHTML = `<div class="kb-empty"><b>${t("Nothing on the home page")}</b><p>${t("All sections are hidden – “Customize” shows them again.")}</p></div>`;
    layout.forEach((s) => {
      const sec = box.querySelector(`[data-home="${CSS.escape(s.id)}"]`);
      if (!sec) return;
      const el = sec.querySelector("[data-w]");
      if (s.id === "folders") return paintFolders(sec);
      if (s.id === "random") return paintRandom(sec, el);
      hangs.push(wall(el, fetcherFor(s), undefined, s.id));
    });
  }

  function fetcherFor(s) {
    const pieces = (kind, r) => r.items.map((x) => toPiece(kind, x, app.favId));
    if (s.id === "resume")
      return async () => {
        const r = await findItems("scene", { per_page: 12, sort: "last_played_at", direction: "DESC" }, { resume_time: { value: 5, modifier: "GREATER_THAN" } });
        return pieces("scene", r).filter((p) => p.resume < 0.97);
      };
    if (s.id === "foryou")
      return async () => {
        const tags = await topTagsOfWeek();
        if (!tags.length) return [];
        const why = box.querySelector('[data-home="foryou"] [data-why]');
        if (why) why.innerHTML = `${esc(t("because you watched"))} ${tags.map((tg) => `<a href="#/scenes?tags=${esc(tg.id)}&played=no">${esc(tg.name)}</a>`).join(", ")}`;
        const f = { tags: { value: tags.map((tg) => tg.id), modifier: "INCLUDES", depth: 0 } };
        const fresh = await findItems("scene", { per_page: 12, sort: seed() }, Object.assign({ play_count: { value: 0, modifier: "EQUALS" } }, f));
        let list = pieces("scene", fresh);
        if (list.length < 6) {
          // few unwatched ones left: also those not seen for two weeks
          const old = await findItems("scene", { per_page: 12 - list.length, sort: seed() }, Object.assign({ last_played_at: { value: new Date(Date.now() - 14 * 864e5).toISOString(), modifier: "LESS_THAN" } }, f));
          const have = new Set(list.map((p) => p.id));
          list = list.concat(pieces("scene", old).filter((p) => !have.has(p.id)));
        }
        return list;
      };
    if (s.id === "rewatch")
      return async () => {
        // favorites and 4 stars and up, watched before but not in the last 30 days
        const old = { play_count: { value: 0, modifier: "GREATER_THAN" }, last_played_at: { value: new Date(Date.now() - 30 * 864e5).toISOString(), modifier: "LESS_THAN" } };
        const [a, b] = await Promise.all([
          findItems("scene", { per_page: 8, sort: seed() }, Object.assign({ rating100: { value: 79, modifier: "GREATER_THAN" } }, old)),
          app.favId ? findItems("scene", { per_page: 8, sort: seed() }, Object.assign({ tags: { value: [app.favId], modifier: "INCLUDES_ALL" } }, old)) : { items: [] },
        ]);
        const seen = new Set();
        return [...pieces("scene", a), ...pieces("scene", b)].filter((p) => !seen.has(p.id) && seen.add(p.id)).sort(() => Math.random() - 0.5).slice(0, 12);
      };
    if (s.id === "fav")
      return async () => {
        if (!app.favId) return [];
        const f = { tags: { value: [app.favId], modifier: "INCLUDES_ALL" } };
        const [a, b] = await Promise.all([findItems("scene", { per_page: 8, sort: seed() }, f), findItems("image", { per_page: 10, sort: seed() }, f)]);
        return [...pieces("scene", a), ...pieces("image", b)].sort(() => Math.random() - 0.5);
      };
    if (s.id === "new")
      return async () => {
        const [a, b] = await Promise.all([findItems("scene", { per_page: 8, sort: "created_at", direction: "DESC" }), findItems("image", { per_page: 10, sort: "created_at", direction: "DESC" })]);
        return [...pieces("scene", a), ...pieces("image", b)].sort((x, y) => new Date(y.raw.created_at) - new Date(x.raw.created_at));
      };
    // Own section
    const c = s.custom;
    const n = Number(c.count) || 12;
    return async () => {
      const kinds = c.kind === "both" ? ["scene", "image"] : [c.kind || "scene"];
      const each = kinds.length === 2 ? Math.ceil(n / 2) : n;
      const res = await Promise.all(
        kinds.map((k) => {
          const q = customQuery(c, k);
          return findItems(k, Object.assign({ per_page: each }, q.find), q.filter).then((r) => pieces(k, r));
        })
      );
      if (res.length === 1) return res[0];
      // Both kinds: taking turns, so neither ends up all at the back
      const out = [];
      for (let i = 0; i < Math.max(res[0].length, res[1].length); i++) [res[0][i], res[1][i]].forEach((p) => p && out.push(p));
      return c.sort === "random" ? out.sort(() => Math.random() - 0.5) : out;
    };
  }

  function paintFolders(sec) {
    loadFolders()
      .then((tree) => {
        const top = (tree.roots.length === 1 && tree.roots[0].kids.length ? tree.roots[0].kids : tree.roots).slice().sort((a, b) => b.timg + b.tvid - (a.timg + a.tvid)).slice(0, 8);
        const el = sec.querySelector("[data-rooms]");
        el.innerHTML = roomsHtml(top);
        stopCovers = fillRoomCovers(el);
      })
      .catch(() => (sec.hidden = true));
  }

  function paintRandom(sec, el) {
    let h = null;
    const roll = () => {
      if (h) {
        h.destroy();
        hangs = hangs.filter((x) => x !== h);
      }
      h = wall(
        el,
        async () => {
          const [a, b] = await Promise.all([findItems("scene", { per_page: 8, sort: seed() }), findItems("image", { per_page: 22, sort: seed() })]);
          return [...a.items.map((x) => toPiece("scene", x, app.favId)), ...b.items.map((x) => toPiece("image", x, app.favId))].sort(() => Math.random() - 0.5);
        },
        store.get("rowHeight", 250)
      );
      hangs.push(h);
    };
    roll();
    sec.querySelector("[data-reroll]").onclick = roll;
  }

  // ---------- Edit mode ----------
  function renderEditor() {
    cleanup();
    box.className = "kb-home-edit";
    const tabs = `<div class="kb-seg kb-home-tabs" role="tablist"><button type="button" role="tab" data-edtab="home" class="${editTab === "home" ? "is-on" : ""}" aria-selected="${editTab === "home"}">${t("Home page")}</button><button type="button" role="tab" data-edtab="rail" class="${editTab === "rail" ? "is-on" : ""}" aria-selected="${editTab === "rail"}">${t("Sidebar")}</button></div>`;
    if (editTab === "rail") {
      box.innerHTML = `${tabs}<div data-railed></div>`;
      return mountRailEditor(box.querySelector("[data-railed]"));
    }
    box.innerHTML = `${tabs}
      <p class="kb-hint">${t("Show or hide sections, drag them (or use the arrows) into the order you like, and add your own. Saved in this browser.")}</p>
      <ol class="kb-home-list" data-list>${layout
        .map((s, i) => {
          const hint = s.custom ? customHint(s.custom) : t(BUILTIN[s.id].hint);
          return `<li class="kb-home-row${s.hidden ? " is-hidden" : ""}" data-i="${i}" draggable="true">
            <span class="kb-home-grip" title="${t("Drag to move")}">⋮⋮</span>
            <span class="kb-home-name"><b>${esc(titleOf(s))}</b><small>${esc(hint)}</small></span>
            <button type="button" class="kb-btn is-icon is-ghost" data-up title="${t("Move up")}"${i === 0 ? " disabled" : ""}>↑</button>
            <button type="button" class="kb-btn is-icon is-ghost" data-down title="${t("Move down")}"${i === layout.length - 1 ? " disabled" : ""}>↓</button>
            ${s.custom ? `<button type="button" class="kb-btn is-icon is-ghost" data-editsec title="${t("Edit")}">${icon("edit")}</button><button type="button" class="kb-btn is-icon is-ghost kb-pdanger" data-delsec title="${t("Delete")}">${icon("trash")}</button>` : ""}
            <label class="kb-switch" title="${t("Show on the home page")}"><input type="checkbox" data-show${s.hidden ? "" : " checked"}><i></i></label>
          </li>`;
        })
        .join("")}</ol>
      <div class="kb-home-acts">
        <button type="button" class="kb-btn" data-addsec>${icon("plus")}${t("Add a section")}</button>
        <button type="button" class="kb-btn is-ghost" data-resetsec>${t("Back to the default")}</button>
        <span class="kb-spacer"></span>
        <button type="button" class="kb-btn is-primary" data-donesec>${icon("check")}${t("Done")}</button>
      </div>`;
  }
  function customHint(c) {
    const what = { scene: t("Scenes"), image: t("Images"), both: t("Scenes + images") }[c.kind || "scene"];
    const sort = t((SORTS.find(([k]) => k === (c.sort || "created_at")) || SORTS[0])[1]);
    const bits = [what, sort];
    if ((c.tags || []).length) bits.push(t("{n} tags", { n: c.tags.length }));
    if ((c.perfs || []).length) bits.push(t("{n} performers", { n: c.perfs.length }));
    if (c.fav) bits.push(t("favorites only"));
    return bits.join(" · ");
  }
  const commit = () => {
    saveLayout(layout);
    renderEditor();
  };
  function setEditing(on) {
    editing = on;
    const b = $("[data-customize]");
    b.classList.toggle("is-on", on);
    b.hidden = on;
    on ? renderEditor() : renderSections();
  }
  $("[data-customize]").onclick = () => setEditing(true);

  box.addEventListener("click", async (e) => {
    if (!editing) return;
    const tab = e.target.closest("[data-edtab]");
    if (tab) {
      editTab = tab.dataset.edtab;
      return renderEditor();
    }
    if (e.target.closest("[data-donesec]")) return setEditing(false);
    if (e.target.closest("[data-addsec]")) return sectionForm(null);
    if (e.target.closest("[data-resetsec]")) {
      const r = await confirmDialog({ title: t("Back to the default home page?"), text: t("Your own sections are removed, the order and visibility are reset."), ok: t("Reset"), danger: true });
      if (!r.ok) return;
      layout = DEFAULT_LAYOUT.map((x) => ({ ...x }));
      return commit();
    }
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest("[data-up]") && i > 0) [layout[i - 1], layout[i]] = [layout[i], layout[i - 1]];
    else if (e.target.closest("[data-down]") && i < layout.length - 1) [layout[i + 1], layout[i]] = [layout[i], layout[i + 1]];
    else if (e.target.closest("[data-editsec]")) return sectionForm(i);
    else if (e.target.closest("[data-delsec]")) {
      const r = await confirmDialog({ title: t("Delete “{name}”?", { name: titleOf(layout[i]) }), text: t("Only the section on the home page – nothing in your library."), ok: t("Delete"), danger: true });
      if (!r.ok) return;
      layout.splice(i, 1);
    } else return;
    commit();
  });
  box.addEventListener("change", (e) => {
    const c = e.target.closest("[data-show]");
    if (!editing || !c) return;
    const i = Number(c.closest("[data-i]").dataset.i);
    layout[i].hidden = !c.checked;
    commit();
  });
  // Drag and drop to reorder
  let dragI = -1;
  box.addEventListener("dragstart", (e) => {
    const row = e.target.closest("[data-i]");
    if (!editing || !row) return;
    dragI = Number(row.dataset.i);
    row.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragI));
  });
  box.addEventListener("dragover", (e) => {
    if (dragI < 0) return;
    e.preventDefault();
    box.querySelectorAll(".is-drop-before, .is-drop-after").forEach((x) => x.classList.remove("is-drop-before", "is-drop-after"));
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? "is-drop-before" : "is-drop-after");
  });
  box.addEventListener("drop", (e) => {
    if (dragI < 0) return;
    e.preventDefault();
    const row = e.target.closest("[data-i]");
    if (row) {
      const r = row.getBoundingClientRect();
      let to = Number(row.dataset.i) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      const [moved] = layout.splice(dragI, 1);
      if (to > dragI) to--;
      layout.splice(to, 0, moved);
    }
    dragI = -1;
    commit();
  });
  box.addEventListener("dragend", () => {
    dragI = -1;
    box.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after").forEach((x) => x.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
  });

  // Add / edit an own section
  function sectionForm(index) {
    const c = Object.assign({ title: "", kind: "scene", sort: "created_at", dir: "", tags: [], perfs: [], fav: false, count: 12 }, index == null ? {} : layout[index].custom);
    const d = openDrawer({
      title: index == null ? t("New section") : t("Edit section"),
      body: `
        <label class="kb-form-row"><span>${t("Title")}</span><input class="kb-field" data-f="title" value="${esc(c.title)}" placeholder="${esc(t("e.g. Favorite PMVs"))}"></label>
        <div class="kb-form-row"><span>${t("What")}</span><div class="kb-seg" data-kind>${[["scene", "Scenes"], ["image", "Images"], ["both", "Scenes + images"]].map(([v, l]) => `<button type="button" data-v="${v}"${c.kind === v ? ' class="is-on"' : ""}>${t(l)}</button>`).join("")}</div></div>
        <div class="kb-pe-grid">
          <label class="kb-form-row"><span>${t("Sort by")}</span><select class="kb-field" data-f="sort">${SORTS.map(([v, l]) => `<option value="${v}"${c.sort === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
          <label class="kb-form-row"><span>${t("Order")}</span><select class="kb-field" data-f="dir"><option value="">${t("Automatic")}</option><option value="DESC"${c.dir === "DESC" ? " selected" : ""}>${t("Descending")}</option><option value="ASC"${c.dir === "ASC" ? " selected" : ""}>${t("Ascending")}</option></select></label>
          <label class="kb-form-row"><span>${t("How many")}</span><select class="kb-field" data-f="count">${[8, 12, 20, 30, 40].map((n) => `<option value="${n}"${Number(c.count) === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        </div>
        <div class="kb-form-row"><span>${t("Tags (all of them)")}</span><div class="kb-tagpick" data-tags></div></div>
        <div class="kb-form-row" data-perfrow hidden><span>${t("Performers (all of them)")}</span><div class="kb-tagpick" data-perfs></div></div>
        <label class="kb-switch"><input type="checkbox" data-f="fav"${c.fav ? " checked" : ""}><i></i><span>${t("Favorites only")}</span></label>`,
      foot: `<span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
    });
    const el = d.el;
    let kind = c.kind;
    el.querySelector("[data-kind]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      kind = b.dataset.v;
      el.querySelectorAll("[data-kind] [data-v]").forEach((x) => x.classList.toggle("is-on", x === b));
    });
    const tags = tagPicker(el.querySelector("[data-tags]"), { include: c.tags, placeholder: t("Search tag") });
    let perfs = null;
    hasPerformers().then((yes) => {
      if (!yes && !c.perfs.length) return;
      el.querySelector("[data-perfrow]").hidden = false;
      perfs = perfPicker(el.querySelector("[data-perfs]"), { include: c.perfs, modes: false, placeholder: t("Search performer") });
    });
    el.querySelector("[data-cancel]").onclick = d.close;
    el.querySelector("[data-save]").onclick = () => {
      const f = (k) => el.querySelector(`[data-f="${k}"]`);
      const custom = {
        title: f("title").value.trim(),
        kind,
        sort: f("sort").value,
        dir: f("dir").value,
        count: Number(f("count").value),
        tags: tags.include,
        perfs: perfs ? perfs.include : c.perfs,
        fav: f("fav").checked,
      };
      if (index == null) layout.push({ id: "c" + Date.now().toString(36), custom });
      else layout[index].custom = custom;
      d.close();
      commit();
    };
    setTimeout(() => el.querySelector('[data-f="title"]').focus(), 50);
  }

  renderSections();
  return cleanup;
}
