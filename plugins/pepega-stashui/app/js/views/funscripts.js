// Interactive: the scenes that have a funscript (a normal list – search, sort, filter, play), and the
// .funscript files in the library that don't belong to a video yet – each can be given one.
// Assigning works like in the player: Stash UI's backend puts the file next to the video under the
// name Stash looks for and has Stash scan it (see ../../backend.py).

import { esc, icon, toast, errorToast, openDrawer, confirmDialog, fmtDuration, plural, debounce } from "../ui.js";
import { t } from "../i18n.js";
import { findItems, gql, pluginConfig, setPluginConfig } from "../api.js";
import { go } from "../main.js";
import { mediaBrowser } from "./media.js";
import { runBackend, runBackendCached, fsSources, rememberFs, samePath, nameWords } from "../interactive.js";
import { issueText } from "../fsvariants.js";
import { pokeJobs } from "../jobs.js";
import { logEvent } from "../eventlog.js";
import { gateHtml, againHtml } from "./fsgate.js";

let problemsCache = null; // { at, r } – the last check, kept for this visit

// Names of the tags (changeable on the Problems tab, kept in Stash UI's settings as fsTags)
const TAG_DEFAULTS = { problems: "Funscript problem", multi: "Several funscripts" };
async function tagNames() {
  try {
    const saved = JSON.parse((await pluginConfig("pepega-stashui")).fsTags || "{}") || {};
    return { problems: String(saved.problems || "").trim() || TAG_DEFAULTS.problems, multi: String(saved.multi || "").trim() || TAG_DEFAULTS.multi };
  } catch (e) {
    return Object.assign({}, TAG_DEFAULTS);
  }
}

// Put a tag on exactly these scenes: added where missing, taken off scenes that have it but aren't in the list
async function syncTag(name, ids) {
  let tag = (await gql(`query FsvFindTag($q: String!) { findTags(filter: { q: $q, per_page: -1 }) { tags { id name } } }`, { q: name })).findTags.tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!tag) tag = (await gql(`mutation FsvCreateTag($n: String!) { tagCreate(input: { name: $n }) { id name } }`, { n: name })).tagCreate;
  const have = (await gql(`query FsvTagged($t: [ID!]) { findScenes(scene_filter: { tags: { value: $t, modifier: INCLUDES } }, filter: { per_page: -1 }) { scenes { id } } }`, { t: [tag.id] })).findScenes.scenes.map((s) => s.id);
  const add = ids.filter((i) => !have.includes(i));
  const rem = have.filter((i) => !ids.includes(i));
  const bulk = (list, mode) => list.length && gql(`mutation FsvTagScenes($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }`, { i: { ids: list, tag_ids: { ids: [tag.id], mode } } });
  await bulk(add, "ADD");
  await bulk(rem, "REMOVE");
  logEvent("tags", "info", "Tag “{tag}”: {add} added, {rem} removed", { tag: name, add: add.length, rem: rem.length });
  return { added: add.length, removed: rem.length };
}

export function render(main, params, query) {
  const tab = ["files", "problems", "dupes", "overview"].includes(params.tab) ? params.tab : "scenes";
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Interactive")}</h1>
        <p class="kb-sub">${t("Scenes with a funscript – they play on The Handy – and funscripts that don't belong to a video yet.")}</p>
      </div>
      <div class="kb-head-tools">
        <div class="kb-seg">
          <a href="#/interactive" class="${tab === "scenes" ? "is-on" : ""}">${icon("film")}${t("With funscript")} <span data-n="scenes"></span></a>
          <a href="#/interactive/files" class="${tab === "files" ? "is-on" : ""}">${icon("plug")}${t("Funscripts without a video")} <span data-n="files"></span></a>
          <a href="#/interactive/problems" class="${tab === "problems" ? "is-on" : ""}">${icon("info")}${t("Problems")} <span data-n="problems"></span></a>
          <a href="#/interactive/dupes" class="${tab === "dupes" ? "is-on" : ""}">${icon("queue")}${t("Duplicates")} <span data-n="dupes"></span></a>
          <a href="#/interactive/overview" class="${tab === "overview" ? "is-on" : ""}">${icon("chart")}${t("Overview")}</a>
        </div>
      </div>
    </header>
    <section data-body></section>`;
  const body = main.querySelector("[data-body]");
  let alive = true;
  let browser = null;

  if (tab === "scenes") {
    browser = mediaBrowser(body, {
      kinds: ["scene"],
      query,
      base: () => ({ filter: { interactive: true } }),
      onCount: (k, n) => (main.querySelector('[data-n="scenes"]').textContent = n),
    });
  } else if (tab === "problems") paintProblems();
  else if (tab === "dupes") import("./fsdupes.js").then((m) => m.paintDupes(body, main, () => alive));
  else if (tab === "overview") import("./fsoverview.js").then((m) => m.paintOverview(body, () => alive));
  else paintFiles();

  // ---------- Speed and heatmap: interactive scenes Stash hasn't measured yet ----------
  // Stash's own task "Heatmaps for interactive videos" fills them in – here it's started for just those scenes.
  let noSpeed = [];
  async function paintSpeed() {
    const box = body.querySelector("[data-speed]");
    if (!box) return;
    try {
      const d = await gql(`query FsvNoSpeed { findScenes(scene_filter: { interactive: true, interactive_speed: { value: 0, modifier: IS_NULL }, OR: { interactive: true, interactive_speed: { value: 1, modifier: LESS_THAN } } }, filter: { per_page: -1 }) { count scenes { id } } }`);
      noSpeed = d.findScenes.scenes.map((s) => s.id);
    } catch (e) {
      return (box.innerHTML = `<h3 class="kb-fsp-h">${t("Speed and heatmap")}</h3><p class="kb-hint">${esc(e.message)}</p>`);
    }
    box.innerHTML = `<div class="kb-fsp-sechead"><h3 class="kb-fsp-h">${t("Speed and heatmap")} <span class="kb-hint">${noSpeed.length}</span></h3>
        <button type="button" class="kb-btn is-ghost" data-gen ${noSpeed.length ? "" : "disabled"}>${t("Generate for these scenes")}</button></div>
      <p class="kb-hint">${noSpeed.length ? t("{n} interactive scenes have no speed (or 0) – Stash needs it for the heatmap and the speed filter. Stash's own task “Heatmaps for interactive videos” measures them again.", { n: noSpeed.length }) : t("Every interactive scene has its speed and heatmap.")}</p>`;
  }
  async function generateSpeeds(b) {
    if (!noSpeed.length) return;
    if (!(await confirmDialog({ title: t("Generate heatmaps and speeds?"), text: t("Stash's task “Heatmaps for interactive videos” runs again for these {n} scenes only (their heatmap and speed – nothing else is generated). A script without any movement stays at 0. You can follow it on the Tasks page.", { n: noSpeed.length }), ok: t("Generate") })).ok) return;
    b.classList.add("is-busy");
    try {
      await gql(`mutation FsvGenerate($i: GenerateMetadataInput!) { metadataGenerate(input: $i) }`, { i: { interactiveHeatmapsSpeeds: true, overwrite: true, sceneIDs: noSpeed } });
      pokeJobs();
      logEvent("tasks", "info", "Heatmaps and speeds started for {n} scenes", { n: noSpeed.length });
      toast(t("Started – Stash is measuring {n} scenes", { n: noSpeed.length }), "ok", { label: t("Tasks"), run: () => go("tasks") });
    } catch (er) {
      errorToast(er, "Generate");
    } finally {
      b.classList.remove("is-busy");
    }
  }

  // ---------- Problems: broken scripts, scripts that don't fit the video, scenes with several scripts ----------
  async function paintProblems(scan) {
    // Reading every funscript takes long on a big library: on a click, not when the tab opens
    if (!scan && !problemsCache) {
      body.innerHTML = gateHtml(t("Check all funscripts"), t("Reads every funscript of every scene that has one: which are broken, much longer or shorter than their video, and which scenes have several."), t("Check now"));
      body.onclick = (e) => e.target.closest("[data-scan]") && paintProblems(true);
      return;
    }
    let r;
    try {
      if (scan) {
        body.innerHTML = `<div class="kb-loading">${t("Checking every funscript …")}</div>`;
        problemsCache = { at: Date.now(), r: await runBackend({ mode: "funscript_scan" }) };
      }
      r = problemsCache.r;
    } catch (e) {
      body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't check the funscripts")}</b><p>${esc(e.message)}</p><p>${t("Stash UI's backend needs Python (like the PMV Generator) – after updating, reload the plugins in Stash once.")}</p></div>`;
      return;
    }
    if (!alive) return;
    const names = await tagNames();
    main.querySelector('[data-n="problems"]').textContent = r.problems.length;
    const row = (s, info) => `<a class="kb-fsl-row kb-fsl-scene" href="#/scene/${esc(s.id)}">
        ${s.screenshot ? `<img alt="" loading="lazy" src="${esc(s.screenshot)}">` : icon("film")}
        <span><b>${esc(s.title)}</b><small>${info}</small></span></a>`;
    const why = (s) =>
      s.variants
        .map((v) => `${esc(v.label || t("Standard"))}: ${esc(issueText(v, s.duration))}`)
        .join(" · ");
    const section = (key, title, hint, list, line, tagName) => `
      <section class="kb-fsp-sec" data-sec="${key}">
        <div class="kb-fsp-sechead"><h3 class="kb-fsp-h">${title} <span class="kb-hint">${list.length}</span></h3>
          <span class="kb-fsp-tagbox"><input class="kb-field" type="text" data-tagname="${key}" value="${esc(tagName)}" maxlength="60" aria-label="${t("Tag name")}" title="${t("Tag name")}" autocomplete="off">
          <button type="button" class="kb-btn is-ghost" data-tag="${key}" ${list.length ? "" : "disabled"}>${icon("tag")}${t("Tag these scenes")}</button></span></div>
        <p class="kb-hint">${hint}</p>
        <div class="kb-fsl">${list.length ? list.map((s) => row(s, line(s))).join("") : `<p class="kb-hint">${t("Nothing found")}</p>`}</div>
      </section>`;
    body.innerHTML =
      againHtml(problemsCache.at) +
      `<p class="kb-hint">${t("{n} scenes checked.", { n: r.scanned })}${r.unreachable ? " " + t("{n} scenes skipped – their video can't be reached from here.", { n: r.unreachable }) : ""}</p>` +
      section("problems", t("Problems"), t("A script that can't be read or has no movements, or one that is much longer or shorter than its video."), r.problems, why, names.problems) +
      section("multi", t("Several scripts"), t("Scenes with more than one funscript next to the video – choose between them in the player."), r.multi, (s) => t("{n} scripts", { n: s.count }), names.multi) +
      `<section class="kb-fsp-sec" data-speed><div class="kb-loading">${t("Checking speeds …")}</div></section>`;
    paintSpeed();
    body.onchange = async (e) => {
      const i = e.target.closest("[data-tagname]");
      if (!i) return;
      names[i.dataset.tagname] = i.value.trim() || TAG_DEFAULTS[i.dataset.tagname];
      i.value = names[i.dataset.tagname];
      await setPluginConfig("pepega-stashui", { fsTags: JSON.stringify(names) }).catch(() => {});
    };
    body.onclick = async (e) => {
      if (e.target.closest("[data-rescan]")) return paintProblems(true);
      const g = e.target.closest("[data-gen]");
      if (g) return generateSpeeds(g);
      const b = e.target.closest("[data-tag]");
      if (!b) return;
      const key = b.dataset.tag;
      const [name, list] = key === "problems" ? [names.problems, r.problems] : [names.multi, r.multi];
      if (!(await confirmDialog({ title: t("Tag these scenes?"), text: t("The tag “{tag}” is put on these {n} scenes and taken off scenes that no longer qualify.", { tag: name, n: list.length }), ok: t("Tag") })).ok) return;
      b.classList.add("is-busy");
      try {
        const res = await syncTag(name, list.map((s) => s.id));
        toast(t("Tagged: {add} added, {rem} removed", { add: res.added, rem: res.removed }), "ok");
      } catch (er) {
        errorToast(er, "Tag");
      } finally {
        b.classList.remove("is-busy");
      }
    };
  }

  // ---------- Funscripts without a video ----------
  async function paintFiles() {
    body.innerHTML = `<div class="kb-loading">${t("Looking through your library …")}</div>`;
    let files;
    let sources;
    try {
      [files, sources] = await Promise.all([runBackendCached({ mode: "funscript_list" }), fsSources()]);
    } catch (e) {
      body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't look for funscripts")}</b><p>${esc(e.message)}</p><p>${t("Stash UI's backend needs Python (like the PMV Generator) – after updating, reload the plugins in Stash once.")}</p></div>`;
      return;
    }
    if (!alive) return;
    const used = Object.entries(sources); // [sceneId, { name, path }]
    const usedBy = (fl) => used.find(([, s]) => samePath(s.path, fl.path));
    // free: no video of the same name next to it, and not picked for a scene
    const free = (files.files || []).filter((fl) => !fl.paired && !usedBy(fl)).sort((a, b) => a.name.localeCompare(b.name));
    main.querySelector('[data-n="files"]').textContent = free.length;
    if (!free.length) {
      body.innerHTML = `<div class="kb-empty"><b>${t("Every funscript belongs to a video")}</b><p>${t("Funscripts that lie in your Stash folders without a video of the same name show up here.")}</p></div>`;
      return;
    }
    body.innerHTML = `
      <div class="kb-fsl-top"><input class="kb-field" type="search" data-q placeholder="${t("Search funscripts …")}" autocomplete="off"><span class="kb-hint" data-cnt></span></div>
      <div class="kb-fsl" data-list></div>`;
    const short = (dir) => dir.split(/[\\/]/).filter(Boolean).slice(-3).join(" / ");
    const paint = () => {
      const q = body.querySelector("[data-q]").value.trim().toLowerCase();
      const list = q ? free.filter((fl) => (fl.name + " " + fl.dir).toLowerCase().includes(q)) : free;
      body.querySelector("[data-cnt]").textContent = plural(free.length, "funscript", "funscripts");
      body.querySelector("[data-list]").innerHTML = list.length
        ? list
            .slice(0, 500)
            .map(
              (fl) => `<div class="kb-fsl-row" data-path="${esc(fl.path)}">
                ${icon("plug")}<span><b>${esc(fl.name.replace(/\.funscript$/i, ""))}</b><small>${esc(short(fl.dir))} · ${Math.max(1, Math.round(fl.size / 1024))} KB</small></span>
                <button type="button" class="kb-btn" data-assign>${icon("film")}${t("Choose video …")}</button></div>`
            )
            .join("")
        : `<p class="kb-hint">${t("Nothing found")}</p>`;
    };
    paint();
    body.querySelector("[data-q]").addEventListener("input", paint);
    body.querySelector("[data-list]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-assign]");
      if (!b) return;
      const fl = free.find((x) => x.path === b.closest("[data-path]").dataset.path);
      if (fl)
        pickScene(fl, () => {
          free.splice(free.indexOf(fl), 1);
          main.querySelector('[data-n="files"]').textContent = free.length;
          paint();
        });
    });
  }

  // ---------- Which video gets this funscript? ----------
  function pickScene(fl, done) {
    const words = nameWords(fl.name);
    const dr = openDrawer({
      title: t("Video for “{name}”", { name: fl.name.replace(/\.funscript$/i, "") }),
      body: `<p class="kb-hint">${t("The funscript goes next to the video you pick – it stays with that scene. Videos whose name looks alike come first.")}</p>
        <input class="kb-field" type="search" data-sq placeholder="${t("Search scenes …")}" autocomplete="off">
        <div class="kb-fsp-list" data-sl><div class="kb-loading">${t("Searching …")}</div></div>`,
    });
    const el = dr.el;
    el.classList.add("kb-fsp");
    let shown = [];
    const fname = (s) => ((s.files || [])[0] || {}).basename || "";
    const score = (s) => {
      const w = new Set([...nameWords(fname(s)), ...nameWords(s.title)]);
      return words.filter((x) => w.has(x)).length / Math.max(1, words.length);
    };
    const row = (s) => `<button type="button" class="kb-fsp-row kb-fsl-scene" data-sid="${esc(s.id)}">
        ${s.paths && s.paths.screenshot ? `<img alt="" loading="lazy" src="${esc(s.paths.screenshot)}">` : icon("film")}
        <span><b>${esc(s.title || fname(s) || "#" + s.id)}</b><small>${esc(fname(s))} · ${fmtDuration(((s.files || [])[0] || {}).duration || 0)}${s.interactive ? ` · ${t("has a funscript")}` : ""}</small></span></button>`;
    const show = (list, head) => {
      shown = list;
      el.querySelector("[data-sl]").innerHTML = list.length ? `<h3 class="kb-fsp-h">${head}</h3>` + list.map(row).join("") : `<p class="kb-hint">${t("No scene found – search by its name.")}</p>`;
    };
    // Suggestions: scenes found by the longest words of the funscript's name
    (async () => {
      const keys = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 3);
      const seen = new Map();
      for (const k of keys) {
        const r = await findItems("scene", { q: k, per_page: 25 }).catch(() => ({ items: [] }));
        r.items.forEach((s) => seen.set(s.id, s));
      }
      if (!alive || el.querySelector("[data-sq]").value) return;
      show([...seen.values()].map((s) => Object.assign(s, { sc: score(s) })).filter((s) => s.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 20), t("Looks alike"));
    })();
    el.querySelector("[data-sq]").addEventListener(
      "input",
      debounce(async (e) => {
        const q = e.target.value.trim();
        if (!q) return;
        const r = await findItems("scene", { q, per_page: 30 }).catch(() => ({ items: [] }));
        if (alive && e.target.value.trim() === q) show(r.items, t("Found"));
      }, 300)
    );
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-sid]");
      if (!b) return;
      const s = shown.find((x) => x.id === b.dataset.sid);
      if (!s) return;
      if (s.interactive && !(await confirmDialog({ title: t("Use this funscript instead?"), text: t("The scene's current funscript is kept next to the video as .funscript.bak."), ok: t("Use it") })).ok) return;
      b.classList.add("is-busy");
      try {
        await runBackend({ mode: "funscript_save", scene_id: s.id, source: fl.path });
        await rememberFs(s.id, fl.name, fl.path);
        dr.close();
        toast(t("“{name}” now belongs to {scene} – Stash is scanning it", { name: fl.name.replace(/\.funscript$/i, ""), scene: s.title || fname(s) }), "ok", { label: t("Open"), run: () => go("scene/" + s.id) });
        done();
      } catch (er) {
        b.classList.remove("is-busy");
        errorToast(er, "Funscript");
      }
    });
  }

  return () => {
    alive = false;
    browser && browser.destroy();
  };
}
