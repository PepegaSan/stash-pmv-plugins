// Playlists: saved filters ("never watched, 4 stars and up, under 10 minutes") – always up to date.
// Play, shuffle, add to the queue, open the list to change them. Kept in Stash (see ../playlists.js).

import { esc, icon, toast, errorToast, store, plural, fmtNum, promptDialog, confirmDialog, ratingText } from "../ui.js";
import { t } from "../i18n.js";
import { findItems } from "../api.js";
import { toPiece } from "../pieces.js";
import { app, go, setQueueCount } from "../main.js";
import { stateOf, filterOf, findOf, loadPlaylists, savePlaylists, linkOf } from "../playlists.js";
import { ensureTiers } from "../tiers.js";
import { restrictIds, parseCrit, critText } from "../ratingx.js";

const SORT_NAMES = { created_at: "Recently added", date: "Date", last_played_at: "Last watched", play_count: "Most watched", rating: "Rating", duration: "Duration", title: "Title", filesize: "File size", path: "Path", random: "Random", o_counter: "O counter" };
const UNIT = { scene: ["scene", "scenes"], image: ["image", "images"] };

// What a playlist holds, in words (chips)
function describe(pl) {
  const st = stateOf(pl.query);
  const L = pl.labels || {};
  const name = (id) => L[id] || "#" + id;
  const out = [];
  if (st.q) out.push(`“${st.q}”`);
  st.tags.forEach((id) => out.push(name(id)));
  st.xtags.forEach((id) => out.push(t("not {x}", { x: name(id) })));
  if (st.perfs.length) out.push(st.perfs.map(name).join(st.pany ? t(" or ") : " + "));
  if (st.studios.length) out.push(st.studios.map(name).join(t(" or ")));
  if (st.rating) out.push(t("from {r}", { r: ratingText(st.rating * 20) || st.rating }));
  if (st.fav) out.push(t("Favorites only"));
  if (st.tier.length) out.push(t("Tier {tier}", { tier: st.tier.join(" + ") }));
  if (st.crit) out.push(critText(parseCrit(st.crit)));
  if (st.played) out.push({ yes: t("watched"), no: t("never watched"), resume: t("started") }[st.played]);
  if (st.res) out.push({ WEB_HD: t("720p and up"), STANDARD_HD: t("1080p and up"), QUAD_HD: "4K" }[st.res] || st.res);
  if (st.len) out.push({ short: t("under 1 min"), mid: t("1–10 min"), long: t("over 10 min") }[st.len]);
  if (st.ia) out.push(st.ia === "yes" ? t("with funscript") : t("without funscript"));
  if (st.ori) out.push({ PORTRAIT: t("Portrait"), LANDSCAPE: t("Landscape"), SQUARE: t("Square") }[st.ori]);
  return { chips: out, sort: t(SORT_NAMES[st.sort] || st.sort) };
}

export async function render(main) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Playlists")}</h1>
        <p class="kb-sub">${t("Saved filters that keep themselves up to date – what matches them now is in them. Set filters in Scenes or Images and press “Save as playlist”.")}</p>
      </div>
      <div class="kb-head-tools">
        <a class="kb-btn" href="#/scenes">${icon("film")}${t("New from scenes")}</a>
        <a class="kb-btn" href="#/images">${icon("image")}${t("New from images")}</a>
      </div>
    </header>
    <div data-body><div class="kb-loading">${t("Loading …")}</div></div>`;
  const body = main.querySelector("[data-body]");
  let list = [];
  let alive = true;

  async function load() {
    try {
      list = await loadPlaylists();
    } catch (e) {
      body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the playlists")}</b><p>${esc(e.message)}</p></div>`;
      return;
    }
    paint();
  }

  function paint() {
    if (!list.length) {
      body.innerHTML = `<div class="kb-empty"><b>${t("No playlists yet")}</b><p>${t("Open Scenes or Images, set the filters you like (e.g. never watched, 4 stars and up, under 10 minutes) and press “Save as playlist”.")}</p>
        <a class="kb-btn is-primary" href="#/scenes?played=no">${t("Try: never watched scenes")}</a></div>`;
      return;
    }
    body.innerHTML = `<div class="kb-pl-grid">${list
      .map((pl) => {
        const d = describe(pl);
        return `<article class="kb-card kb-pl" data-id="${esc(pl.id)}">
          <a class="kb-pl-cover" href="${esc(linkOf(pl))}" data-cover><span></span><span></span><span></span><span></span></a>
          <div class="kb-pl-body">
            <div class="kb-pl-head"><h2>${esc(pl.name)}</h2><small data-count>${icon(pl.kind === "image" ? "image" : "film")}…</small></div>
            <div class="kb-pl-chips">${d.chips.length ? d.chips.map((c) => `<span class="kb-chip">${esc(c)}</span>`).join("") : `<span class="kb-hint">${t("Everything")}</span>`}<span class="kb-pl-sort">${icon("filter")}${esc(d.sort)}</span></div>
            <div class="kb-pl-acts">
              <button class="kb-btn is-primary" data-a="play">${icon("play")}${t("Play")}</button>
              <button class="kb-btn" data-a="shuffle" title="${esc(t("Play in random order"))}">${icon("shuffle")}</button>
              <button class="kb-btn" data-a="queue" title="${esc(t("Add to queue"))}">${icon("queue")}</button>
              <a class="kb-btn is-ghost" href="${esc(linkOf(pl))}" title="${esc(t("Open – change the filters there and save again"))}">${icon("edit")}</a>
              <span class="kb-spacer"></span>
              <button class="kb-btn is-ghost" data-a="rename" title="${esc(t("Rename"))}">${t("Rename")}</button>
              <button class="kb-btn is-ghost is-icon" data-a="delete" title="${esc(t("Delete"))}" aria-label="${esc(t("Delete"))}">${icon("trash")}</button>
            </div>
          </div>
        </article>`;
      })
      .join("")}</div>`;
    // Count and four pictures each
    list.forEach(async (pl) => {
      const card = body.querySelector(`[data-id="${CSS.escape(pl.id)}"]`);
      try {
        await ensureTiers();
        const r = await findItems(pl.kind, findOf(pl, { per_page: 4 }), filterOf(pl.kind, stateOf(pl.query), app.favId), await restrictIds(pl.kind, stateOf(pl.query)));
        if (!alive || !card) return;
        card.querySelector("[data-count]").innerHTML = `${icon(pl.kind === "image" ? "image" : "film")}${esc(plural(r.count, UNIT[pl.kind][0], UNIT[pl.kind][1]))}`;
        const thumbs = r.items.map((x) => toPiece(pl.kind, x, app.favId).thumb).filter(Boolean);
        card.querySelectorAll("[data-cover] span").forEach((sp, i) => thumbs[i] && (sp.style.backgroundImage = `url("${thumbs[i].replace(/"/g, "%22")}")`));
        card.classList.toggle("is-empty", !r.count);
      } catch (e) {
        if (card) card.querySelector("[data-count]").textContent = t("Couldn't load");
      }
    });
  }

  // Up to 200 items of a playlist (as pieces)
  async function items(pl, random) {
    const find = random ? Object.assign(findOf(pl, { per_page: 200 }), { sort: "random_" + Math.floor(Math.random() * 1e8) }) : findOf(pl, { per_page: 200 });
    await ensureTiers();
    const r = await findItems(pl.kind, find, filterOf(pl.kind, stateOf(pl.query), app.favId), await restrictIds(pl.kind, stateOf(pl.query)));
    return r.items.map((x) => toPiece(pl.kind, x, app.favId));
  }
  const asQueue = (pieces) => pieces.map((p) => ({ kind: p.kind, id: p.id, title: p.title, thumb: p.thumb }));

  body.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const pl = list.find((x) => x.id === b.closest("[data-id]").dataset.id);
    if (!pl) return;
    const a = b.dataset.a;
    try {
      if (a === "play" || a === "shuffle") {
        b.disabled = true;
        const pieces = await items(pl, a === "shuffle");
        b.disabled = false;
        if (!pieces.length) return toast(t("Nothing in this playlist right now"));
        store.set("queue", asQueue(pieces));
        store.set("queuePos", 0);
        setQueueCount();
        app.context = { kind: pl.kind, pieces, index: 0, queue: true };
        go((pl.kind === "image" ? "image/" : "scene/") + pieces[0].id);
      } else if (a === "queue") {
        const pieces = await items(pl);
        const q = store.get("queue", []);
        const have = new Set(q.map((x) => x.kind + ":" + x.id));
        const add = asQueue(pieces).filter((x) => !have.has(x.kind + ":" + x.id));
        store.set("queue", q.concat(add));
        setQueueCount();
        toast(t("{what} added to the queue", { what: plural(add.length, "item", "items") }), "ok");
      } else if (a === "rename") {
        const name = ((await promptDialog({ title: t("Rename"), label: t("Name"), value: pl.name, ok: t("Save") })) || "").trim();
        if (!name || name === pl.name) return;
        const fresh = await loadPlaylists();
        const x = fresh.find((y) => y.id === pl.id);
        if (x) x.name = name;
        await savePlaylists(fresh);
        list = fresh;
        paint();
      } else if (a === "delete") {
        if (!(await confirmDialog({ title: t("Delete “{name}”?", { name: pl.name }), text: t("Only the playlist – the scenes and images stay."), ok: t("Delete"), danger: true })).ok) return;
        const fresh = (await loadPlaylists()).filter((y) => y.id !== pl.id);
        await savePlaylists(fresh);
        list = fresh;
        paint();
      }
    } catch (err) {
      b.disabled = false;
      errorToast(err, "Playlist");
    }
  });

  load();
  return () => (alive = false);
}
