// Interactive → Overview: numbers about all funscripts – how many scenes have one, with several variants, with
// problems; how intense they are (histogram, the most intense and the calmest); pauses in the movements and how
// much of the video the script covers. The backend reads every script (../../backend.py: funscript_overview).

import { esc, icon, fmtDuration } from "../ui.js";
import { t } from "../i18n.js";
import { runBackend } from "../interactive.js";
import { gateHtml, againHtml } from "./fsgate.js";

let cache = null; // { at, r } – the last overview, kept for this visit

const sceneRow = (s, info) => `<a class="kb-fsl-row kb-fsl-scene" href="#/scene/${esc(s.id)}">
    ${s.screenshot ? `<img alt="" loading="lazy" src="${esc(s.screenshot)}">` : icon("film")}
    <span><b>${esc(s.title)}</b><small>${info}</small></span></a>`;

export async function paintOverview(body, alive, scan) {
  // Reading every funscript takes long on a big library: on a click, not when the tab opens
  if (!scan && !cache) {
    body.innerHTML = gateHtml(t("Overview of all funscripts"), t("Reads every funscript of every scene that has one: how intense they are, where the pauses are and how much of each video they cover."), t("Read the funscripts"));
    body.onclick = (e) => e.target.closest("[data-scan]") && paintOverview(body, alive, true);
    return;
  }
  let r;
  try {
    if (scan) {
      body.innerHTML = `<div class="kb-loading">${t("Reading every funscript …")}</div>`;
      cache = { at: Date.now(), r: await runBackend({ mode: "funscript_overview" }) };
    }
    r = cache.r;
  } catch (e) {
    body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't read the funscripts")}</b><p>${esc(e.message)}</p><p>${t("Stash UI's backend needs Python (like the PMV Generator) – after updating, reload the plugins in Stash once.")}</p></div>`;
    return;
  }
  if (!alive()) return;
  const stat = (n, label, href) => `<${href ? `a href="${href}"` : "div"} class="kb-vx-stat"><b>${n}</b><small>${label}</small></${href ? "a" : "div"}>`;
  const pct = (n) => Math.round(n * 100) + " %";
  const max = Math.max(1, ...r.hist);
  const labels = r.edges.map((e, i) => (i === r.edges.length - 1 ? `${e}+` : `${e}–${r.edges[i + 1]}`));
  const list = (title, items, info, empty) => `<section class="kb-fsp-sec"><h3 class="kb-fsp-h">${title}</h3><div class="kb-fsl">${items.length ? items.map((s) => sceneRow(s, info(s))).join("") : `<p class="kb-hint">${empty}</p>`}</div></section>`;
  body.onclick = (e) => e.target.closest("[data-rescan]") && paintOverview(body, alive, true);
  body.innerHTML = `${againHtml(cache.at)}
    <div class="kb-vx-over">
      ${stat(`${r.scanned}<small> / ${r.total}</small>`, t("scenes with a funscript"))}
      ${stat(r.with_variants, t("with several scripts"), "#/interactive/problems")}
      ${stat(r.with_problems, t("with problems"), "#/interactive/problems")}
      ${stat(r.read ? r.avg_speed + "/s" : "–", t("average intensity"))}
      ${stat(r.gap_scenes, t("with long pauses"))}
      ${stat(r.read ? pct(r.avg_cover) : "–", t("of the video covered"))}
    </div>
    ${r.unreachable ? `<p class="kb-hint">${t("{n} scenes skipped – their video can't be reached from here.", { n: r.unreachable })}</p>` : ""}
    <section class="kb-fsp-sec">
      <h3 class="kb-fsp-h">${t("Intensity")}</h3>
      <p class="kb-hint">${t("How many scripts per intensity range (units moved per second on average).")}</p>
      <div class="kb-hist" role="img" aria-label="${t("Intensity")}">${r.hist.map((n, i) => `<div><i style="height:${Math.round((n / max) * 100)}%" title="${labels[i]}: ${n}"></i><b>${n}</b><small>${labels[i]}</small></div>`).join("")}</div>
    </section>
    ${list(t("Most intense"), r.intense, (s) => t("{n} units per second", { n: s.speed }), t("Nothing to show yet."))}
    ${list(t("Calmest"), r.calm, (s) => t("{n} units per second", { n: s.speed }), t("Nothing to show yet."))}
    ${list(t("Longest pauses"), r.longest_gaps, (s) => t("{gap} without a movement, at {at}", { gap: fmtDuration(s.gap), at: fmtDuration(s.gap_at) }) + (s.gaps > 1 ? ` · ${t("{n} pauses", { n: s.gaps })}` : ""), t("No pauses longer than 20 seconds."))}`;
}
