// The big placard next to the player and image viewer: details, rating, red dot, O counter, tags, actions.

import { esc, icon, fmtDuration, fmtRes, fmtBytes, fmtDate, fmtAgo, invNo, starsHtml, ratingClick, ratingFromInput, ratingToast, toast, errorToast, store, plural, burst, pop } from "../ui.js";
import { t } from "../i18n.js";
import { updateItem, setFavorite, favoriteTagId, addO, removeO } from "../api.js";
import { app, setQueueCount } from "../main.js";
import { openEditor } from "./edit.js";
import { perfPicker } from "./perfpicker.js";
import { tierNow } from "../tiers.js";
import { tierBadge } from "../versusx.js";
import { critOf } from "../ratingx.js";
import { GENDERS, countryOf } from "./performers.js";

function fileInfo(kind, x) {
  if (kind === "scene") {
    const f = x.files[0] || {};
    return {
      path: f.path,
      lines: [
        [fmtDuration(f.duration), fmtRes(f.width, f.height), f.width ? `${f.width} × ${f.height}` : ""].filter(Boolean).join(", "),
        [f.video_codec ? f.video_codec.toUpperCase() : "", f.frame_rate ? Math.round(f.frame_rate) + " fps" : "", fmtBytes(f.size)].filter(Boolean).join(", "),
      ],
    };
  }
  const f = x.visual_files[0] || {};
  return {
    path: f.path,
    lines: [[f.width ? `${f.width} × ${f.height}` : "", f.duration ? fmtDuration(f.duration) : "", fmtBytes(f.size)].filter(Boolean).join(", ")],
  };
}

// Age on a day, from the two dates as Stash keeps them ("YYYY-MM-DD", older entries may lack month and day); 0 = unknown
function ageAt(birth, on) {
  const re = /^(\d{4})(?:-(\d\d))?(?:-(\d\d))?/;
  const b = re.exec(birth || "");
  const d = re.exec(on || "");
  if (!b || !d) return 0;
  let a = d[1] - b[1];
  if (+(d[2] || 1) < +(b[2] || 1) || (+(d[2] || 1) === +(b[2] || 1) && +(d[3] || 1) < +(b[3] || 1))) a--;
  return a > 0 && a < 130 ? a : 0;
}

// The numbers of a performer in this scene (the player loads them with getScene; elsewhere there are none)
function perfFacts(p, x) {
  if (p.scene_count === undefined) return null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    scenes: p.scene_count || 0,
    atScene: ageAt(p.birthdate, x.date),
    now: ageAt(p.birthdate, p.death_date || today),
  };
}

export function placardHtml(kind, x) {
  const fav = !!app.favId && x.tags.some((tg) => tg.id === app.favId);
  const info = fileInfo(kind, x);
  const title = x.title || (info.path || "").split(/[\\/]/).pop();
  const tags = x.tags.filter((tg) => tg.id !== app.favId);
  const folder = (info.path || "").split(/[\\/]/).slice(0, -1).join("\\");
  return `
    <div class="kb-plc">
      <p class="kb-plc-inv">${t({ scene: "Scene", image: "Image", gallery: "Gallery" }[kind])} #${x.id}${x.date ? `${t(", ")}${fmtDate(x.date)}` : ""}</p>
      <h2 class="kb-plc-title">${tierBadge(tierNow(kind, x.id))}${esc(title)}</h2>
      ${info.lines.filter(Boolean).map((l) => `<p class="kb-plc-meta">${esc(l)}</p>`).join("")}
      <div class="kb-plc-acts">
        <div data-rate>${starsHtml(x.rating100, true)}</div>
        <button class="kb-plc-btn${fav ? " is-on" : ""}" data-fav title="${t("Favorite (H)")}"><span class="kb-dotmini"></span>${fav ? t("Favorite") : t("Add to favorites")}</button>
        ${kind === "scene" ? `<button class="kb-plc-btn" data-advrate title="${t("Rate by several criteria – Stash's rating follows")}">★+ ${t("Detailed")}</button>` : ""}
        <button class="kb-plc-btn" data-o title="${t("O counter (O), right-click subtracts one")}">${icon("drop")}<span data-ocount>${x.o_counter || 0}</span></button>
      </div>
      ${kind === "scene" && critOf("scene", x) ? `<div class="kb-critlist" title="${t("Detailed rating")}">${critOf("scene", x).map((c) => `<span class="kb-critchip"><b>${esc(c.name)}</b><i style="--v:${c.score * 20}%"></i><em>${c.score}</em></span>`).join("")}</div>` : ""}
      ${kind === "scene" ? `<p class="kb-plc-meta">${x.play_count ? t("Watched {what}, last {when}", { what: plural(x.play_count, "time", "times"), when: fmtAgo(x.last_played_at) }) : t("Never watched to the end")}</p>` : ""}
      ${
        kind !== "gallery"
          ? `<div class="kb-plc-perfs">${(x.performers || [])
              .map((p) => {
                const age = kind === "scene" && (perfFacts(p, x) || {}).atScene;
                return `<span class="kb-plc-perfwrap"><a class="kb-plc-perf" href="#/performer/${p.id}" data-perfcard="${p.id}"><img alt="" loading="lazy" src="${esc(p.image_path || "")}"><span>${esc(p.name)}</span>${age ? `<em class="kb-plc-perfage">${age}</em>` : ""}</a><button type="button" class="kb-plc-perfx" data-perfrm="${p.id}" title="${t("Remove from this {what}", { what: t(kind) })}" aria-label="${t("Remove")}">×</button></span>`;
              })
              .join("")}<button type="button" class="kb-plc-perf kb-plc-perfadd" data-perfadd title="${t("Add a performer")}">${icon("plus")}${(x.performers || []).length ? "" : `<span>${t("Performer")}</span>`}</button><div class="kb-tagpick kb-plc-perfpick" data-perfpick hidden></div></div>`
          : ""
      }
      ${tags.length ? `<div class="kb-chips kb-plc-tags">${tags.map((tg) => `<a class="kb-chip" href="#/tag/${tg.id}">${esc(tg.name)}</a>`).join("")}</div>` : ""}
      ${x.details ? `<p class="kb-plc-text">${esc(x.details)}</p>` : ""}
      ${kind === "image" && x.galleries && x.galleries.length ? `<p class="kb-plc-meta">${t("From")} ${x.galleries.map((g) => `<a href="#/gallery/${g.id}">${esc(g.title || ((g.folder && g.folder.path) || ((g.files || [])[0] || {}).path || "").split(/[\\/]/).filter(Boolean).pop() || t("Gallery {id}", { id: g.id }))}</a>`).join(t(", "))}</p>` : ""}
      <div class="kb-plc-row">
        <button class="kb-plc-btn" data-edit>${icon("edit")}${t("Edit")}</button>
        <button class="kb-plc-btn" data-queue>${icon("queue")}${t("Queue")}</button>
        <button class="kb-plc-btn is-danger" data-delete title="${t("Delete this item (asks first)")}">${icon("close")}${t("Delete")}</button>
        ${folder ? `<button class="kb-plc-btn" data-folder title="${esc(folder)}">${icon("folder")}${t("Folder")}</button>` : ""}
        ${kind === "scene" ? `<button class="kb-plc-btn" data-extplay title="${t("Play this scene in an external player (mpv, VLC …) – for formats the browser can't play")}">${icon("tv")}${t("External player")}</button>` : ""}
        ${kind === "scene" ? `<button class="kb-plc-btn" data-cover title="${t("Use the frame you're looking at as the scene's cover")}">${icon("image")}${t("Cover")}</button>` : ""}
        ${kind === "scene" ? `<button class="kb-plc-btn" data-funscript title="${esc(x.interactive ? t("This scene has a funscript – choose another one to replace it") : t("Give this scene a funscript (for The Handy) – it's put next to the video"))}">${icon("plug")}${x.interactive ? t("Funscript ✓") : t("Funscript")}</button>` : ""}
        ${kind === "scene" ? `<button class="kb-plc-btn" data-cut title="${t("Cut parts out of this video and save them as new videos")}">${icon("scissors")}${t("Cut clips")}</button>` : ""}
        ${kind === "scene" && app.pmvPlugin !== null ? `<button class="kb-plc-btn" data-music title="${t("Use the music in the PMV Generator, or save it as a sound file")}">${icon("music")}${t("Music")}</button>` : ""}
      </div>
      ${info.path ? `<p class="kb-plc-path">${esc(info.path)}</p>` : ""}
    </div>`;
}

// ---------- Performer card: hovering (or focusing) a performer in the info panel ----------

let cardEl = null;
let cardTimer = 0;
let cardAnchor = null;

function cardHtml(p, x) {
  const f = perfFacts(p, x);
  const gender = (GENDERS.find((g) => g[0] === p.gender) || [])[1];
  const sub = [gender && t(gender), countryOf(p.country)].filter(Boolean).join(" · ");
  const stat = (n, label) => `<div class="kb-pcard-stat${n ? "" : " is-none"}"><b>${n || "–"}</b><span>${esc(label)}</span></div>`;
  const died = !!p.death_date;
  return `
    <div class="kb-pcard-head">
      <img alt="" src="${esc(p.image_path || "")}">
      <div>
        <p class="kb-pcard-name">${esc(p.name)}${p.favorite ? '<span class="kb-dotmini"></span>' : ""}</p>
        ${p.disambiguation ? `<p class="kb-pcard-sub">${esc(p.disambiguation)}</p>` : ""}
        ${sub ? `<p class="kb-pcard-sub">${esc(sub)}</p>` : ""}
      </div>
    </div>
    <div class="kb-pcard-stats">
      ${stat(f.scenes, t("Scenes"))}
      ${stat(f.atScene, t("Age at scene date"))}
      ${stat(f.now, died ? t("Age at death") : t("Age now"))}
    </div>
    <p class="kb-pcard-born">${p.birthdate ? `${t("Born")} ${esc(fmtDate(p.birthdate))}${died ? ` · ${t("Died")} ${esc(fmtDate(p.death_date))}` : ""}` : t("No birthdate")}</p>
    ${p.birthdate && !x.date ? `<p class="kb-pcard-born">${t("Scene has no date")}</p>` : ""}`;
}

function hideCard() {
  clearTimeout(cardTimer);
  cardAnchor = null;
  if (cardEl) cardEl.classList.remove("is-on");
}

function showCard(a, p, x) {
  if (!cardEl) {
    cardEl = document.createElement("div");
    cardEl.className = "kb-pcard";
    cardEl.setAttribute("role", "tooltip");
    window.addEventListener("hashchange", hideCard);
    document.addEventListener("fullscreenchange", hideCard);
    window.addEventListener("scroll", hideCard, true);
    window.addEventListener("pointerdown", hideCard, true);
  }
  cardAnchor = a;
  const root = document.fullscreenElement || document.body; // in fullscreen only that element is visible
  if (cardEl.parentNode !== root) root.appendChild(cardEl);
  cardEl.innerHTML = cardHtml(p, x);
  // Below the pill, left-aligned with it; above when the screen ends there; never outside the window
  const r = a.getBoundingClientRect();
  const w = cardEl.offsetWidth;
  const h = cardEl.offsetHeight;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const top = r.bottom + 8 + h <= innerHeight ? r.bottom + 8 : Math.max(8, r.top - 8 - h);
  cardEl.style.left = left + "px";
  cardEl.style.top = top + "px";
  cardEl.classList.add("is-on");
}

function bindPerfCards(host, getItem) {
  if (matchMedia("(hover: none)").matches) return; // touch: tapping opens the performer, no hover card
  const anchorOf = (el) => (el && el.closest ? el.closest("[data-perfcard]") : null);
  const enter = (e) => {
    const a = anchorOf(e.target);
    const x = getItem();
    if (!a || a === cardAnchor || !x) return;
    const p = (x.performers || []).find((q) => q.id === a.dataset.perfcard);
    if (!p || !perfFacts(p, x)) return;
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => a.isConnected && showCard(a, p, x), 250);
  };
  const leave = (e) => {
    const a = anchorOf(e.target);
    if (a && anchorOf(e.relatedTarget) !== a) hideCard();
  };
  host.addEventListener("mouseover", enter);
  host.addEventListener("focusin", enter);
  host.addEventListener("mouseout", leave);
  host.addEventListener("focusout", leave);
}

// Binds the buttons; refresh() reloads the details and redraws the placard.
export function bindPlacard(host, kind, getItem, { refresh, onDeleted, goFolder, music, cover, funscript, position, cut }) {
  bindPerfCards(host, getItem);
  host.addEventListener("click", async (e) => {
    const x = getItem();
    if (!x) return;
    try {
      const r = ratingClick(e, x.rating100);
      if (r !== undefined) return rate(r);
      const ext = e.target.closest("[data-extplay]");
      if (ext) {
        const { openPlayerMenu } = await import("../extplayer.js");
        return openPlayerMenu(ext, x, position);
      }
      if (e.target.closest("[data-advrate]")) {
        const { openAdvRating } = await import("../advrating.js");
        return openAdvRating(kind, x, {
          onChange: (it) => {
            host.querySelector("[data-rate]").innerHTML = starsHtml(it.rating100, true);
            refresh && refresh();
          },
        });
      }
      if (e.target.closest("[data-fav]")) return fav();
      if (e.target.closest("[data-o]")) return o(1);
      if (e.target.closest("[data-edit]")) return openEditor(kind, [{ id: x.id }], { onSaved: refresh, onDeleted });
      if (e.target.closest("[data-delete]")) {
        const { deleteWithConfirm } = await import("./edit.js");
        return void (await deleteWithConfirm(kind, x.id, onDeleted || refresh));
      }
      if (e.target.closest("[data-queue]")) {
        const q = store.get("queue", []);
        q.push({ kind, id: x.id, title: x.title || x.id, thumb: kind === "scene" ? x.paths.screenshot : x.paths.thumbnail });
        store.set("queue", q);
        window.dispatchEvent(new Event("stash:queue-changed")); // the info bar shows the queue
        setQueueCount();
        return toast(t("Added to the queue"), "ok");
      }
      if (e.target.closest("[data-folder]")) return goFolder && goFolder();
      // Performers right here: × takes one off, + adds one (or creates it)
      const rm = e.target.closest("[data-perfrm]");
      if (rm) {
        e.preventDefault();
        const keep = (x.performers || []).filter((p) => p.id !== rm.dataset.perfrm);
        await updateItem(kind, { id: x.id, performer_ids: keep.map((p) => p.id) });
        toast(t("Removed"), "ok");
        return refresh && refresh();
      }
      if (e.target.closest("[data-perfadd]")) {
        const box = host.querySelector("[data-perfpick]");
        box.hidden = !box.hidden;
        if (box.hidden) return;
        const pk = perfPicker(box, {
          modes: false,
          allowCreate: true,
          placeholder: t("Search or create a performer"),
          onChange: async (ids) => {
            const add = ids[ids.length - 1];
            if (!add) return;
            try {
              await updateItem(kind, { id: x.id, performer_ids: [...new Set([...(x.performers || []).map((p) => p.id), add])] });
              toast(t("Added"), "ok");
              refresh && refresh();
            } catch (err) {
              errorToast(err, "Performer");
            }
          },
        });
        box.querySelector("[data-pchips]").hidden = true;
        return pk.focus();
      }
      if (e.target.closest("[data-cut]")) return cut && cut();
      if (e.target.closest("[data-music]")) return music && music();
      if (e.target.closest("[data-cover]")) return cover && cover();
      if (e.target.closest("[data-funscript]")) return funscript && funscript();
    } catch (err) {
      errorToast(err, "Action failed");
    }
  });
  host.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("[data-o]")) return;
    e.preventDefault();
    o(-1).catch((err) => errorToast(err, "O counter"));
  });

  // the decimal field (rating system 0–10)
  host.addEventListener("change", (e) => {
    const v = e.target.matches("[data-ratedec]") && getItem() ? ratingFromInput(e.target) : undefined;
    if (v !== undefined) rate(v).catch((err) => errorToast(err, "Rating"));
  });
  async function rate(v) {
    const x = getItem();
    await updateItem(kind, { id: x.id, rating100: v });
    x.rating100 = v;
    host.querySelector("[data-rate]").innerHTML = starsHtml(v, true);
    // The new stars light up one after the other
    host.querySelectorAll("[data-rate] [data-star].is-on").forEach((s, i) =>
      s.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)", filter: "brightness(1.6)" }, { transform: "scale(1)" }], { duration: 380, delay: i * 55, easing: "cubic-bezier(.3,1.6,.5,1)" })
    );
    toast(ratingToast(v));
  }
  async function fav() {
    const x = getItem();
    const on = !(app.favId && x.tags.some((tg) => tg.id === app.favId));
    await setFavorite(kind, [x.id], on);
    app.favId = await favoriteTagId(false);
    if (on) x.tags.push({ id: app.favId, name: "Favorite" });
    else x.tags = x.tags.filter((tg) => tg.id !== app.favId);
    const b = host.querySelector("[data-fav]");
    b.classList.toggle("is-on", on);
    b.innerHTML = `<span class="kb-dotmini"></span>${on ? t("Favorite") : t("Add to favorites")}`;
    const heart = b.querySelector(".kb-dotmini");
    if (on) {
      pop(heart, 1.8);
      burst(heart, "heart", 7);
    } else pop(heart, 0.7);
    toast(on ? t("Marked as favorite") : t("Favorite removed"));
    if (app.context && app.context.hang) {
      const p = app.context.hang.pieces.find((q) => q.kind === kind && q.id === x.id);
      if (p) app.context.hang.update(Object.assign({}, p, { fav: on }));
    }
  }
  async function o(delta) {
    const x = getItem();
    const btn = host.querySelector("[data-o]");
    if (delta > 0 && btn) {
      // Right away – the counter follows when Stash has answered
      pop(btn, 1.18);
      burst(btn.querySelector(".kb-ic") || btn, "drop");
    }
    const n = delta > 0 ? await addO(kind, x.id) : await removeO(kind, x.id);
    x.o_counter = n;
    host.querySelector("[data-ocount]").textContent = n;
  }
  // keys 1–5: whole stars (= 2, 4 … 10 in the 0–10 system); the same key again removes it
  const rateKey = (n) => rate((getItem().rating100 || 0) === n * 20 ? null : n * 20);
  return { rate: rateKey, fav, o };
}
