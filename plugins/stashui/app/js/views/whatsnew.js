// What's new: the patch notes of Stash UI, PMV Generator and Media Storm, newest first.
// Opening it marks everything as read (the dot in the menu goes away).

import { esc, store } from "../ui.js";
import { t, lang } from "../i18n.js";
import { CHANGES, LATEST } from "../changelog.js";
import { setNewsDot } from "../main.js";

const APPS = { ui: "Stash UI", pmv: "PMV Generator", storm: "Media Storm" };

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
      <p class="kb-sub">${t("What changed in Stash UI, the PMV Generator and Media Storm – newest first.")}</p>
    </div></header>
    <div class="kb-news">${CHANGES.map(
      (c, i) => `<section class="kb-card kb-news-v${isNew(i) ? " is-new" : ""}">
        <div class="kb-news-head"><h2>${esc(c.v)}</h2><span class="kb-hint">${esc(fmtDate(c.date))}</span>${isNew(i) ? `<em class="kb-news-badge">${t("new")}</em>` : ""}</div>
        <ul>${c.items.map(([app, en, zhText]) => `<li><span class="kb-news-app is-${app}">${esc(APPS[app] || app)}</span><span>${esc(zh && zhText ? zhText : en)}</span></li>`).join("")}</ul>
      </section>`
    ).join("")}</div>`;
  store.set("newsSeen", LATEST);
  setNewsDot();
}
