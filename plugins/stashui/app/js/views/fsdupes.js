// Interactive → Duplicates: funscripts in the library with exactly the same movements (names and metadata
// don't matter), grouped. Duplicates are set aside as .funscriptdupe – nothing is deleted – and can be
// brought back below. The backend does the work (../../backend.py: funscript_dupes / _aside / _restore).

import { esc, icon, toast, errorToast, confirmDialog, fmtDuration, plural } from "../ui.js";
import { t } from "../i18n.js";
import { runBackend } from "../interactive.js";
import { logEvent } from "../eventlog.js";

const short = (dir) => dir.split(/[\\/]/).filter(Boolean).slice(-3).join(" / ");
const kb = (n) => Math.max(1, Math.round(n / 1024)) + " KB";

export function paintDupes(body, main, alive) {
  let data = null;
  let keep = new Map(); // group hash → the path that stays

  body.innerHTML = `<div class="kb-fsp-sec">
      <p class="kb-hint">${t("Finds funscripts whose movements are exactly the same, however they are named. You choose which one stays – the others are set aside as .funscriptdupe (nothing is deleted, you can bring them back).")}</p>
      <button type="button" class="kb-btn" data-find>${icon("search")}${t("Find duplicates")}</button></div>
    <div data-out></div>`;
  const out = body.querySelector("[data-out]");

  async function find() {
    out.innerHTML = `<div class="kb-loading">${t("Comparing every funscript …")}</div>`;
    try {
      data = await runBackend({ mode: "funscript_dupes" });
    } catch (e) {
      out.innerHTML = `<div class="kb-empty"><b>${t("Couldn't compare the funscripts")}</b><p>${esc(e.message)}</p><p>${t("Stash UI's backend needs Python (like the PMV Generator) – after updating, reload the plugins in Stash once.")}</p></div>`;
      return;
    }
    if (!alive()) return;
    keep = new Map(data.groups.map((g) => [g.hash, g.files[0].path])); // suggested: the one that belongs to a video, else the oldest
    paint();
  }

  const doomed = (g) => g.files.filter((f) => f.path !== keep.get(g.hash));
  function paint() {
    const n = data.groups.reduce((s, g) => s + doomed(g).length, 0);
    main.querySelector('[data-n="dupes"]').textContent = data.groups.length || "";
    const rowHtml = (g, f) => `<button type="button" class="kb-fsd-row${f.path === keep.get(g.hash) ? " is-keep" : ""}" data-keep="${esc(g.hash)}" data-path="${esc(f.path)}">
        <i class="kb-fsd-dot"></i><span><b>${esc(f.name.replace(/\.funscript$/i, ""))}</b><small>${esc(short(f.dir))} · ${kb(f.size)}${f.video ? ` · ${t("belongs to {video}", { video: esc(f.video) })}` : ""}</small></span>
        <em>${f.path === keep.get(g.hash) ? t("stays") : t("set aside")}</em></button>`;
    const groups = data.groups
      .map(
        (g) => `<section class="kb-fsd-group">
          <div class="kb-fsp-sechead"><h3 class="kb-fsp-h">${t("{n} identical", { n: g.files.length })} · ${fmtDuration(g.files[0].length)} · ${t("{n} movements", { n: g.files[0].actions })}</h3>
            <button type="button" class="kb-btn is-ghost" data-aside="${esc(g.hash)}">${t("Set aside the others")}</button></div>
          ${g.files.map((f) => rowHtml(g, f)).join("")}</section>`
      )
      .join("");
    const aside = data.aside
      .map((a) => `<div class="kb-fsl-row" data-path="${esc(a.path)}">${icon("plug")}<span><b>${esc(a.name.replace(/\.funscriptdupe$/i, ""))}</b><small>${esc(short(a.dir))}</small></span><button type="button" class="kb-btn is-ghost" data-restore>${icon("undo")}${t("Bring back")}</button></div>`)
      .join("");
    out.innerHTML = `
      <p class="kb-hint">${t("{n} funscripts compared.", { n: data.scanned })}${data.truncated ? " " + t("Very many funscripts – only the first 20 000 were compared") : ""}</p>
      ${
        data.groups.length
          ? `<div class="kb-fsp-sechead"><h3 class="kb-fsp-h">${plural(data.groups.length, "group of duplicates", "groups of duplicates")}</h3>
              <button type="button" class="kb-btn" data-asideall>${t("Set aside all duplicates ({n})", { n })}</button></div>
            <p class="kb-hint">${t("Click a script to make it the one that stays.")}</p>${groups}`
          : `<div class="kb-empty"><b>${t("No duplicates")}</b><p>${t("Every funscript has its own movements.")}</p></div>`
      }
      ${data.aside.length ? `<div class="kb-fsp-sechead"><h3 class="kb-fsp-h">${t("Set aside")} <span class="kb-hint">${data.aside.length}</span></h3><button type="button" class="kb-btn is-ghost" data-restoreall>${t("Bring all back")}</button></div><div class="kb-fsl">${aside}</div>` : ""}`;
  }

  async function aside(list) {
    const lost = list.filter((f) => f.video).length;
    const text = t("{n} funscripts are renamed to .funscriptdupe next to where they are – nothing is deleted.", { n: list.length }) + (lost ? " " + t("Scripts that belong to a video: {n} – those scenes lose their funscript until you bring them back.", { n: lost }) : "");
    if (!(await confirmDialog({ title: t("Set these duplicates aside?"), text, ok: t("Set aside") })).ok) return;
    const r = await runBackend({ mode: "funscript_dupe_aside", paths: list.map((f) => f.path) });
    logEvent("funscript", "warn", "{n} duplicate funscripts set aside", { n: r.done.length });
    toast(t("{n} set aside", { n: r.done.length }) + (r.skipped.length ? " · " + t("{n} skipped", { n: r.skipped.length }) : ""), "ok");
    await find();
  }
  async function restore(paths) {
    const r = await runBackend({ mode: "funscript_dupe_restore", paths });
    logEvent("funscript", "info", "{n} funscripts brought back", { n: r.done.length });
    toast(t("{n} brought back", { n: r.done.length }) + (r.skipped.length ? " · " + t("{n} skipped", { n: r.skipped.length }) : ""), "ok");
    await find();
  }

  body.addEventListener("click", async (e) => {
    try {
      if (e.target.closest("[data-find]")) return find();
      const k = e.target.closest("[data-keep]");
      if (k) {
        keep.set(k.dataset.keep, k.dataset.path);
        return paint();
      }
      const a = e.target.closest("[data-aside]");
      if (a) return aside(doomed(data.groups.find((g) => g.hash === a.dataset.aside)));
      if (e.target.closest("[data-asideall]")) return aside(data.groups.flatMap(doomed));
      const r = e.target.closest("[data-restore]");
      if (r) return restore([r.closest("[data-path]").dataset.path]);
      if (e.target.closest("[data-restoreall]")) return restore(data.aside.map((x) => x.path));
    } catch (er) {
      errorToast(er, "Funscript");
    }
  });
}
