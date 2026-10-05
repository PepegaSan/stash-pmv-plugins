// Tasks: running jobs with progress, plus scan, generate, clean and auto tag.
// The checkboxes start with Stash's defaults and can be saved there as defaults too.

import { esc, icon, toast, errorToast, fmtAgo, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { typeInfo, fieldHtml, readFields, selection } from "../forms.js";
import { onJobs, pokeJobs } from "../jobs.js";

const TASKS = [
  { id: "scan", title: "Scan for new files", text: "Looks for new, changed and moved files in the library folders.", input: "ScanMetadataInput", mutation: "metadataScan", defaults: "scan", primary: true },
  { id: "generate", title: "Generate previews", text: "Generates missing covers, hover previews, timeline images and more.", input: "GenerateMetadataInput", mutation: "metadataGenerate", defaults: "generate",
    hide: ["sceneIDs", "markerIDs", "imageIDs", "galleryIDs", "previewOptions"] },
  { id: "autotag", title: "Auto tag", text: "Assigns tags whose name appears in the file path (e.g. folder “Outdoor” → tag “Outdoor”).", input: "AutoTagMetadataInput", mutation: "metadataAutoTag", defaults: "autoTag", custom: "autotag" },
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
  const stop = onJobs((jobs) => paintJobs(main.querySelector("[data-jobs]"), jobs));
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
  const cards = await Promise.all(TASKS.map((task) => cardHtml(task, defaults[task.defaults] || FALLBACK[task.defaults] || {})));
  const box = main.querySelector("[data-cards]");
  box.innerHTML = cards.join("");
  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    const task = TASKS.find((x) => x.id === e.target.dataset.task);
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
    <div class="kb-card-acts"><button type="submit" class="kb-btn ${task.primary ? "is-primary" : ""}">${icon("play")}${t("Start")}</button>
    ${task.defaults ? `<button type="button" class="kb-btn is-ghost" data-savedef="${task.id}">${t("Save options as default")}</button>` : ""}</div>
  </form>`;
}

function paintJobs(box, jobs) {
  if (!box) return;
  if (!jobs.length) {
    box.innerHTML = `<p class="kb-hint">${t("Nothing is running right now.")}</p>`;
    return;
  }
  box.innerHTML =
    `<div class="kb-jobs-head"><h2 class="kb-h2">${t("Running now")}</h2><button class="kb-btn is-ghost" data-stopall>${icon("stop")}${t("Stop all")}</button></div>` +
    jobs
      .map((j) => {
        const p = j.progress != null && j.progress >= 0 ? Math.round(j.progress * 100) : null;
        const state = { READY: t("waiting"), RUNNING: p != null ? p + " %" : t("running"), STOPPING: t("stopping …"), FINISHED: t("done"), CANCELLED: t("cancelled"), FAILED: t("failed") }[j.status];
        return `<div class="kb-job is-${j.status.toLowerCase()}">
          <div class="kb-job-top"><b>${esc(j.description)}</b><span>${state}</span>
          ${j.status === "RUNNING" || j.status === "READY" ? `<button class="kb-btn is-icon is-ghost" data-stop="${j.id}" aria-label="${t("Stop")}">${icon("stop")}</button>` : ""}</div>
          <div class="kb-job-bar"><i style="width:${p != null ? p : j.status === "RUNNING" ? 100 : 0}%"${p == null && j.status === "RUNNING" ? ' class="is-indet"' : ""}></i></div>
          ${(j.subTasks || []).length ? `<small>${esc(j.subTasks.slice(-2).join(" · "))}</small>` : j.startTime ? `<small>${esc(t("started {when}", { when: fmtAgo(j.startTime) }))}</small>` : ""}
        </div>`;
      })
      .join("");
}
