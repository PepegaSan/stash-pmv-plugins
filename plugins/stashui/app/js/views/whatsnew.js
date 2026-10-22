// What's new: the patch notes of Stash UI, PMV Generator and Media Storm, newest first.
// Opening it marks everything as read (the dot in the menu goes away).

import { esc, store, toast } from "../ui.js";
import { t, lang } from "../i18n.js";
import { CHANGES, LATEST, LINKS } from "../changelog.js";
import { setNewsDot, go } from "../main.js";
import { gql } from "../api.js";

const APPS = { ui: "Stash UI", pmv: "PMV Generator", storm: "Media Storm" };

// An element that is on the page and not hidden
const shown = (el) => !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0;

// Light up what was found: scroll it to the middle and let a ring pulse around it for a moment
function spot(els) {
  els[0].scrollIntoView({ block: "center", behavior: "smooth" });
  els.forEach((el) => el.classList.add("kb-spot"));
  setTimeout(() => els.forEach((el) => el.classList.remove("kb-spot")), 3000);
}

// "@performer" / "@scene": one of the user's own (the performer with the most scenes) – the page of a performer or scene is where those features are
async function firstOf(kind) {
  const q = kind === "performer" ? `query { findPerformers(filter: { per_page: 1, sort: "scenes_count", direction: DESC }) { performers { id } } }` : `query { findScenes(filter: { per_page: 1 }) { scenes { id } } }`;
  const d = await gql(q);
  const l = kind === "performer" ? d.findPerformers.performers : d.findScenes.scenes;
  return l[0] ? l[0].id : "";
}

async function openTarget(spec) {
  let [route, target = ""] = spec.split("::");
  for (const k of ["performer", "scene"]) {
    if (!route.includes("@" + k)) continue;
    let id = "";
    try {
      id = await firstOf(k);
    } catch (e) {
      /* handled below */
    }
    if (!id) return toast(t("There is nothing to show it on in your library yet."));
    route = route.replace("@" + k, id);
  }
  const isSel = /^[[.#]/.test(target);
  go(route + (target && !isSel ? (route.includes("?") ? "&" : "?") + "find=" + encodeURIComponent(t(target)) : "")); // a setting: the Settings page lights it up itself
  if (!isSel) return;
  for (let i = 0; i < 70; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const els = [...document.querySelectorAll(target)].filter(shown);
    if (els.length) return spot(els);
  }
}

export function render(main) {
  const seen = store.get("newsSeen", "");
  const zh = String(lang).startsWith("zh");
  const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString(zh ? "zh-CN" : undefined, { day: "numeric", month: "long", year: "numeric" });
  const isNew = (i) => {
    const at = CHANGES.findIndex((c) => c.v === seen);
    return at < 0 ? !!seen && i === 0 : i < at; // first visit: nothing is "new"
  };
  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <h1 class="kb-h1">${t("What's new")}</h1>
      <p class="kb-sub">${t("What changed in Stash UI, the PMV Generator and Media Storm – newest first.")} ${t("Entries with “Show me” take you to the feature and light it up for a moment.")}</p>
    </div></header>
    <div class="kb-news">${CHANGES.map(
      (c, i) => `<section class="kb-card kb-news-v${isNew(i) ? " is-new" : ""}">
        <div class="kb-news-head"><h2>${esc(c.v)}</h2><span class="kb-hint">${esc(fmtDate(c.date))}</span>${isNew(i) ? `<em class="kb-news-badge">${t("new")}</em>` : ""}</div>
        <ul>${c.items
          .map(([app, en, zhText, link], k) => {
            const go_ = link || LINKS[c.v + ":" + k];
            return `<li${go_ ? ` class="is-link" role="link" tabindex="0" data-go="${esc(go_)}"` : ""}><span class="kb-news-app is-${app}">${esc(APPS[app] || app)}</span><span>${esc(zh && zhText ? zhText : en)}</span>${go_ ? `<span class="kb-news-go">${t("Show me")} →</span>` : ""}</li>`;
          })
          .join("")}</ul>
      </section>`
    ).join("")}</div>`;
  const open = (e) => {
    const li = e.target.closest("[data-go]");
    if (li && (e.type === "click" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openTarget(li.dataset.go).catch((err) => toast(String(err.message || err)));
    }
  };
  const news = main.querySelector(".kb-news");
  news.addEventListener("click", open);
  news.addEventListener("keydown", open);
  store.set("newsSeen", LATEST);
  setNewsDot();
}
