// The event log: a floating panel (drag it by the header, resize it at the corner) that can stay open
// while you play or browse. Everything Stash UI does on its own is written here – Versus picks (names as
// links, tiers colour-coded, wins green and losses red), funscript changes, ratings, tags, generate tasks.
// Entries are kept in this browser (the last 300). Export writes a text file; names are left out of it
// unless you untick "Hide names in the export" – so it can be shared when something looks wrong.
// Idea: the event log of the Ascension plugin.

import { esc, icon, toast, store } from "./ui.js";
import { t } from "./i18n.js";
import { tierBadge } from "./versusx.js";

const MAX = 300;
const AREAS = ["versus", "funscript", "rating", "tags", "tasks"];
const AREA_LABEL = { versus: "Versus", funscript: "Funscript", rating: "Rating", tags: "Tags", tasks: "Tasks" };
const OPEN = { scene: "scene", image: "image", gallery: "gallery", performer: "performer", marker: "scene", tag: "tag" };
const listeners = new Set();
let entries = store.get("eventLog", []);

// area, level (info | win | loss | warn | error), tpl: an English text with {placeholders} (it's translated when shown),
// p: plain values for it, refs: things with a name that link to their page: { k: kind, id, name, tier? } → {r0}, {r1} …
export function logEvent(area, level, tpl, p = {}, refs = []) {
  entries.push({ at: Date.now(), area, level, tpl, p, refs });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  store.set("eventLog", entries);
  listeners.forEach((f) => f());
}

const num = (v) => `<span class="kb-log-num">${esc(String(v))}</span>`;
const refHtml = (r) => {
  const to = OPEN[r.k];
  const name = esc(r.name || `#${r.id}`);
  return `${r.tier ? tierBadge(r.tier) + " " : ""}${to ? `<a class="kb-log-ref" href="#/${to}/${esc(r.id)}">${name}</a>` : `<span class="kb-log-ref">${name}</span>`}`;
};
const textOf = (e, hideNames) => {
  const params = {};
  Object.entries(e.p || {}).forEach(([k, v]) => (params[k] = typeof v === "number" ? num(v) : esc(String(v))));
  (e.refs || []).forEach((r, i) => (params["r" + i] = hideNames ? esc(`${t(r.k)} #${r.id}`) : refHtml(r)));
  return t(e.tpl, params);
};
const plain = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent;
};

let panel = null;
const geo = () => Object.assign({ w: 460, h: 340, x: null, y: null, filter: "", hide: true, min: false }, store.get("logPanel", {}));
const saveGeo = (patch) => store.set("logPanel", Object.assign(geo(), patch));

export const logOpen = () => !!panel;
export function toggleLog(filter) {
  if (panel) return closeLog();
  openLog(filter);
}
export function closeLog() {
  if (!panel) return;
  listeners.delete(panel._paint);
  panel.remove();
  panel = null;
}
export function openLog(filter) {
  if (panel) return;
  const g = geo();
  if (filter !== undefined) g.filter = filter;
  panel = document.createElement("section");
  panel.id = "kb-log";
  panel.className = "kb-evlog" + (g.min ? " is-min" : "");
  panel.setAttribute("role", "log");
  panel.innerHTML = `
    <header class="kb-log-head" data-drag>
      <b>${icon("logs")}${t("Event log")}</b>
      <span class="kb-log-filter" data-filters>${["", ...AREAS].map((a) => `<button type="button" data-area="${a}">${a ? t(AREA_LABEL[a]) : t("All")}</button>`).join("")}</span>
      <span class="kb-spacer"></span>
      <button type="button" class="kb-log-btn" data-export title="${t("Export as a text file")}" aria-label="${t("Export as a text file")}">${icon("download")}</button>
      <button type="button" class="kb-log-btn" data-clear title="${t("Clear the log")}" aria-label="${t("Clear the log")}">${icon("trash")}</button>
      <button type="button" class="kb-log-btn" data-min title="${t("Fold away")}" aria-label="${t("Fold away")}">–</button>
      <button type="button" class="kb-log-btn" data-close title="${t("Close")}" aria-label="${t("Close")}">${icon("close")}</button>
    </header>
    <ol class="kb-log-list" data-list></ol>
    <footer class="kb-log-foot"><label><input type="checkbox" data-hide ${g.hide ? "checked" : ""}> ${t("Hide names in the export")}</label></footer>`;
  document.body.appendChild(panel);
  const place = () => {
    const w = Math.min(geo().w, innerWidth - 16);
    const h = Math.min(geo().h, innerHeight - 16);
    const x = geo().x == null ? innerWidth - w - 16 : Math.min(Math.max(0, geo().x), innerWidth - 80);
    const y = geo().y == null ? innerHeight - h - 16 : Math.min(Math.max(0, geo().y), innerHeight - 40);
    Object.assign(panel.style, { width: w + "px", height: panel.classList.contains("is-min") ? "" : h + "px", left: x + "px", top: y + "px" });
  };
  place();
  const $ = (s) => panel.querySelector(s);
  const paint = () => {
    const f = geo().filter;
    panel.querySelectorAll("[data-area]").forEach((b) => b.classList.toggle("is-on", b.dataset.area === f));
    const list = entries.filter((e) => !f || e.area === f).slice().reverse();
    $("[data-list]").innerHTML = list.length
      ? list.map((e) => `<li class="is-${e.level}"><small>${esc(new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}</small><em>${esc(t(AREA_LABEL[e.area] || e.area))}</em><span>${textOf(e, false)}</span></li>`).join("")
      : `<li class="kb-log-empty">${t("Nothing yet.")}</li>`;
  };
  panel._paint = paint;
  listeners.add(paint);
  paint();

  // drag by the header, resize at the corner (remembered)
  let drag = null;
  $("[data-drag]").addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  $("[data-drag]").addEventListener("pointermove", (e) => {
    if (!drag) return;
    panel.style.left = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 80) + "px";
    panel.style.top = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 40) + "px";
  });
  $("[data-drag]").addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null;
    saveGeo({ x: parseInt(panel.style.left, 10), y: parseInt(panel.style.top, 10) });
  });
  new ResizeObserver(() => {
    if (!panel || panel.classList.contains("is-min")) return;
    const r = panel.getBoundingClientRect();
    if (r.width > 100 && r.height > 80) saveGeo({ w: Math.round(r.width), h: Math.round(r.height) });
  }).observe(panel);

  panel.addEventListener("click", (e) => {
    const a = e.target.closest("[data-area]");
    if (a) {
      saveGeo({ filter: a.dataset.area });
      return paint();
    }
    if (e.target.closest("[data-close]")) return closeLog();
    if (e.target.closest("[data-min]")) {
      const m = panel.classList.toggle("is-min");
      saveGeo({ min: m });
      return place();
    }
    if (e.target.closest("[data-clear]")) {
      entries = [];
      store.set("eventLog", entries);
      return paint();
    }
    if (e.target.closest("[data-export]")) {
      const f = geo().filter;
      const hide = $("[data-hide]").checked;
      const text = entries
        .filter((x) => !f || x.area === f)
        .map((x) => `[${new Date(x.at).toISOString()}] [${AREA_LABEL[x.area] || x.area}] ${plain(textOf(x, hide))}`)
        .join("\n");
      if (!text) return toast(t("Nothing to export."));
      const a2 = document.createElement("a");
      a2.href = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
      a2.download = `stash-ui-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
      a2.click();
      setTimeout(() => URL.revokeObjectURL(a2.href), 4000);
    }
  });
  panel.addEventListener("change", (e) => e.target.matches("[data-hide]") && saveGeo({ hide: e.target.checked }));
}
