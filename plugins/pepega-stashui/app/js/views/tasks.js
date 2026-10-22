// Tasks: running jobs with progress, plus scan, generate, clean and auto tag.
// The checkboxes start with Stash's defaults and can be saved there as defaults too.

import { esc, icon, toast, errorToast, fmtAgo, fmtDuration, confirmDialog, store } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { typeInfo, fieldHtml, readFields, selection } from "../forms.js";
import { onJobs, pokeJobs } from "../jobs.js";
import { loadSources, canByFile } from "./scenescrape.js";

const TASKS = [
  { id: "scan", title: "Scan for new files", text: "Looks for new, changed and moved files in the library folders.", input: "ScanMetadataInput", mutation: "metadataScan", defaults: "scan", primary: true },
  { id: "generate", title: "Generate previews", text: "Generates missing covers, hover previews, timeline images and more.", input: "GenerateMetadataInput", mutation: "metadataGenerate", defaults: "generate",
    hide: ["sceneIDs", "markerIDs", "imageIDs", "galleryIDs", "previewOptions"] },
  { id: "autotag", title: "Auto tag", text: "Assigns tags whose name appears in the file path (e.g. folder “Outdoor” → tag “Outdoor”).", input: "AutoTagMetadataInput", mutation: "metadataAutoTag", defaults: "autoTag", custom: "autotag" },
  { id: "identify", title: "Identify", text: "Looks your scenes up by their fingerprints in StashDB-style boxes and scrapers and fills in title, date, studio, performers and tags.", custom: "identify" },
  { id: "clean", title: "Clean", text: "Removes items whose files no longer exist. Start as a dry run first and check the log.", input: "CleanMetadataInput", mutation: "metadataClean", danger: true },
];

export async function render(main) {
  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <h1 class="kb-h1">${t("Tasks")}</h1>
      <p class="kb-sub">${t("Scan, generate previews, clean up. Tasks keep running in the background, even when you leave the page.")}</p>
    </div></header>
    <section class="kb-jobs" data-jobs></section>
    <div class="kb-cards" data-cards><div class="kb-loading">${t("Loading …")}</div></div>`;
  const stop = onJobs((jobs, done) => paintJobs(main.querySelector("[data-jobs]"), jobs, done));
  main.querySelector("[data-jobs]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-stop]");
    const all = e.target.closest("[data-stopall]");
    try {
      if (b) await gql(`mutation($id: ID!) { stopJob(job_id: $id) }`, { id: b.dataset.stop });
      if (all) await gql(`mutation { stopAllJobs }`);
      if (b || all) pokeJobs();
    } catch (err) {
      errorToast(err, "Stop");
    }
  });

  let defaults = {};
  try {
    const sel = await selection("ConfigDefaultSettingsResult", 2);
    defaults = (await gql(`query { configuration { defaults { ${sel} } } }`)).configuration.defaults || {};
  } catch (e) { /* without defaults */ }

  // Without saved defaults: the same presets as the Stash interface
  const FALLBACK = {
    scan: { scanGenerateCovers: true, scanGeneratePreviews: true, scanGenerateSprites: true, scanGeneratePhashes: true, scanGenerateThumbnails: true },
    generate: { covers: true, previews: true, sprites: true, phashes: true, imageThumbnails: true, markers: true, markerScreenshots: true },
  };
  const cards = await Promise.all(TASKS.map((task) => (task.custom === "identify" ? identifyCard(task) : cardHtml(task, defaults[task.defaults] || FALLBACK[task.defaults] || {}))));
  const box = main.querySelector("[data-cards]");
  box.innerHTML = cards.join("");
  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    const task = TASKS.find((x) => x.id === e.target.dataset.task);
    if (task.custom === "identify") return startIdentify(e.target, task);
    const input = readFields(e.target);
    if (task.custom === "autotag") {
      input.tags = e.target.querySelector("[data-at-tags]").checked ? ["*"] : [];
      input.performers = e.target.querySelector("[data-at-perf]").checked ? ["*"] : [];
      input.studios = e.target.querySelector("[data-at-stud]").checked ? ["*"] : [];
    }
    if (task.danger && input.dryRun === false) {
      const r = await confirmDialog({ title: t("Really clean up?"), text: t("Items without a file are removed from Stash. This can't be undone."), ok: t("Clean up"), danger: true });
      if (!r.ok) return;
    }
    try {
      await gql(`mutation($i: ${task.input}!) { ${task.mutation}(input: $i) }`, { i: input });
      toast(t("{what}: started", { what: t(task.title) }), "ok");
      pokeJobs();
    } catch (err) {
      errorToast(err, task.title);
    }
  });
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-savedef]");
    if (!b) return;
    const task = TASKS.find((x) => x.id === b.dataset.savedef);
    const form = b.closest("form");
    try {
      await gql(`mutation($i: ConfigDefaultSettingsInput!) { configureDefaults(input: $i) { __typename } }`, { i: { [task.defaults]: readFields(form) } });
      toast(t("Saved as default"), "ok");
    } catch (err) {
      errorToast(err, "Save default");
    }
  });
  return stop;
}

// ---------- Identify (bulk) ----------
// The sources that can look a scene up by its file (a StashDB-style box, or a scraper that supports "fragment" scrapes), what to fill in,
// and an optional list of folders. Stash does the work as a job; the choices are kept in this browser.
const ID_FIELDS = [["title", "Title"], ["date", "Date"], ["details", "Details"], ["url", "Link"], ["studio", "Studio"], ["performers", "Performers"], ["tags", "Tags"]];
const idOpts = () => Object.assign({ fields: ["title", "date", "details", "url", "studio", "performers", "tags"], mode: "MERGE", create: true, male: true, skipMulti: true, skipSingle: false, cover: true, organized: false, folders: "", sources: null }, store.get("identifyOpts", {}) || {});
let idSources = [];

async function identifyCard(task) {
  const o = idOpts();
  let list = [];
  let hasType = true;
  try {
    hasType = !!(await typeInfo("IdentifyMetadataInput"));
    list = (await loadSources()).list.filter(canByFile);
  } catch (e) { /* no sources known */ }
  idSources = list;
  if (!hasType) return "";
  const sw = (attr, on, label) => `<label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${esc(t(label))}</b></span><span class="kb-switch"><input type="checkbox" ${attr}${on ? " checked" : ""}><i></i></span></label>`;
  const chosen = o.sources || list.filter((s) => s.box).map((s) => s.id);
  return `<form class="kb-card" data-task="${task.id}">
    <h2>${esc(t(task.title))}</h2><p>${esc(t(task.text))}</p>
    ${list.length ? "" : `<p class="kb-hint">${t("No source can look scenes up yet. Add a StashDB-style box or a scraper in classic Stash → Settings → Metadata Providers.")}</p>`}
    <details class="kb-card-opts"><summary>${t("Options")}</summary>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Sources")}</b><small>${t("Tried from the top; the first one that finds the scene wins.")}</small></div></div>
      <div class="kb-idsrc">${list.map((s) => `<label class="kb-chk"><input type="checkbox" data-idsrc="${esc(s.id)}"${chosen.includes(s.id) ? " checked" : ""}> ${esc(s.name)}${s.box ? "" : ` <small>(${t("scraper")})</small>`}</label>`).join("")}</div>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Fill in")}</b></div></div>
      <div class="kb-idsrc">${ID_FIELDS.map(([k, l]) => `<label class="kb-chk"><input type="checkbox" data-idfield="${k}"${o.fields.includes(k) ? " checked" : ""}> ${esc(t(l))}</label>`).join("")}</div>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Fields that already have a value")}</b></span>
        <select class="kb-field" data-idmode><option value="MERGE"${o.mode === "MERGE" ? " selected" : ""}>${t("Keep them, only add")}</option><option value="OVERWRITE"${o.mode === "OVERWRITE" ? " selected" : ""}>${t("Overwrite")}</option></select></label>
      ${sw("data-idcreate", o.create, "Create performers, studios and tags that are missing")}
      ${sw("data-idmale", o.male, "Include male performers")}
      ${sw("data-idmulti", o.skipMulti, "Skip scenes with several matches")}
      ${sw("data-idsingle", o.skipSingle, "Skip performers with a single name")}
      ${sw("data-idcover", o.cover, "Set the cover image")}
      ${sw("data-idorg", o.organized, "Mark identified scenes as organized")}
      <label class="kb-set"><span class="kb-set-label"><b>${t("Only these folders")}</b><small>${t("One path per line. Empty = all scenes.")}</small></span>
        <textarea class="kb-field" rows="3" data-idpaths>${esc(o.folders)}</textarea></label>
    </details>
    <div class="kb-card-acts"><button type="submit" class="kb-btn"${list.length ? "" : " disabled"}>${icon("play")}${t("Start now")}</button></div>
  </form>`;
}

async function startIdentify(form, task) {
  const q = (s) => [...form.querySelectorAll(s)];
  const picked = q("[data-idsrc]").filter((c) => c.checked).map((c) => idSources.find((s) => s.id === c.dataset.idsrc)).filter(Boolean);
  if (!picked.length) return toast(t("Choose at least one source."), "error");
  const fields = q("[data-idfield]").filter((c) => c.checked).map((c) => c.dataset.idfield);
  if (!fields.length) return toast(t("Choose what to fill in."), "error");
  const on = (a) => form.querySelector(`[${a}]`).checked;
  const o = { fields, mode: form.querySelector("[data-idmode]").value, create: on("data-idcreate"), male: on("data-idmale"), skipMulti: on("data-idmulti"), skipSingle: on("data-idsingle"), cover: on("data-idcover"), organized: on("data-idorg"), folders: form.querySelector("[data-idpaths]").value, sources: picked.map((s) => s.id) };
  store.set("identifyOpts", o);
  const r = await confirmDialog({ title: t("Identify scenes?"), text: t("Scenes that are found get new details from the sources. This can't be undone – back up first if unsure."), ok: t("Identify") });
  if (!r.ok) return;
  const paths = o.folders.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const input = {
    sources: picked.map((s) => ({ source: s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper } })),
    options: {
      fieldOptions: ID_FIELDS.map(([k]) => ({ field: k, strategy: fields.includes(k) ? o.mode : "IGNORE", ...(o.create && ["studio", "performers", "tags"].includes(k) ? { createMissing: true } : {}) })),
      setCoverImage: o.cover,
      setOrganized: o.organized,
      includeMalePerformers: o.male,
      skipMultipleMatches: o.skipMulti,
      skipSingleNamePerformers: o.skipSingle,
    },
  };
  if (paths.length) input.paths = paths;
  try {
    await gql(`mutation($i: IdentifyMetadataInput!) { metadataIdentify(input: $i) }`, { i: input });
    toast(t("{what}: started", { what: t(task.title) }), "ok");
    pokeJobs();
  } catch (err) {
    errorToast(err, task.title);
  }
}

async function cardHtml(task, def) {
  const ti = await typeInfo(task.input);
  const hide = new Set([...(task.hide || []), "filter", ...(task.custom === "autotag" ? ["tags", "performers", "studios"] : [])]);
  const fields = await Promise.all(
    ti.inputFields
      .filter((f) => !hide.has(f.name))
      .map((f) => fieldHtml(f.name, f.type, def[f.name] != null ? def[f.name] : f.name === "dryRun" ? true : undefined))
  );
  const extra =
    task.custom === "autotag"
      ? `<label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Tags")}</b></span><span class="kb-switch"><input type="checkbox" data-at-tags checked><i></i></span></label>
         <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Performers")}</b></span><span class="kb-switch"><input type="checkbox" data-at-perf><i></i></span></label>
         <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Studios")}</b></span><span class="kb-switch"><input type="checkbox" data-at-stud><i></i></span></label>`
      : "";
  return `<form class="kb-card" data-task="${task.id}">
    <h2>${esc(t(task.title))}</h2><p>${esc(t(task.text))}</p>
    <details class="kb-card-opts"><summary>${t("Options")}</summary>${extra}${fields.join("")}</details>
    <div class="kb-card-acts"><button type="submit" class="kb-btn ${task.primary ? "is-primary" : ""}">${icon("play")}${t("Start now")}</button>
    ${task.defaults ? `<button type="button" class="kb-btn is-ghost" data-savedef="${task.id}">${t("Save options as default")}</button>` : ""}</div>
  </form>`;
}

// "Running now": sticks to the top while you scroll through the task cards, so the progress stays in view after you press Start.
// Jobs that Stash doesn't report a percentage for show a moving bar plus what they are doing right now; what ended during this visit
// stays listed for a while (done / cancelled).
function paintJobs(box, jobs, done = []) {
  if (!box) return;
  const recent = done.filter((d) => Date.now() - d.at < 15 * 60000);
  if (!jobs.length && !recent.length) {
    box.classList.remove("is-live");
    box.innerHTML = `<p class="kb-hint">${t("Nothing is running right now.")}</p>`;
    return;
  }
  box.classList.toggle("is-live", jobs.length > 0);
  const running = jobs.map((j) => {
    const p = j.progress != null && j.progress >= 0 ? Math.round(j.progress * 100) : null;
    const state = { READY: t("waiting"), RUNNING: p != null ? p + " %" : t("running"), STOPPING: t("stopping …"), FINISHED: t("done"), CANCELLED: t("cancelled"), FAILED: t("failed") }[j.status];
    const subs = (j.subTasks || []).slice(-2).join(" · ");
    const since = j.startTime ? Math.max(0, Math.round((Date.now() - new Date(j.startTime).getTime()) / 1000)) : 0;
    const info = [subs, j.startTime && j.status === "RUNNING" ? t("running for {time}", { time: fmtDuration(since) }) : j.startTime ? t("started {when}", { when: fmtAgo(j.startTime) }) : ""].filter(Boolean).join(" – ");
    return `<div class="kb-job is-${j.status.toLowerCase()}">
          <div class="kb-job-top"><b>${esc(j.description)}</b><span>${state}</span>
          ${j.status === "RUNNING" || j.status === "READY" ? `<button class="kb-btn is-icon is-ghost" data-stop="${j.id}" aria-label="${t("Stop")}">${icon("stop")}</button>` : ""}</div>
          <div class="kb-job-bar"><i style="width:${p != null ? p : j.status === "RUNNING" ? 100 : 0}%"${p == null && j.status === "RUNNING" ? ' class="is-indet"' : ""}></i></div>
          ${info ? `<small>${esc(info)}</small>` : ""}
        </div>`;
  });
  const ended = recent.map((d) => `<div class="kb-job is-${d.state === "done" ? "finished" : "cancelled"} is-ended"><div class="kb-job-top"><b>${esc(d.description)}</b><span>${d.state === "done" ? t("done") : t("cancelled")}</span></div><small>${esc(fmtAgo(new Date(d.at).toISOString()))}</small></div>`);
  box.innerHTML =
    (jobs.length ? `<div class="kb-jobs-head"><h2 class="kb-h2">${t("Running now")}</h2><button class="kb-btn is-ghost" data-stopall>${icon("stop")}${t("Stop all")}</button></div>` + running.join("") : `<div class="kb-jobs-head"><h2 class="kb-h2">${t("Nothing is running right now.")}</h2></div>`) +
    (ended.length ? `<h3 class="kb-jobs-sub">${t("Finished")}</h3>` + ended.join("") : "");
}
