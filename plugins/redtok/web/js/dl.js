// RedTok – downloads into a folder of your Stash library (one folder per creator), then a scan so Stash finds them.

import { call, gql, t, tn, toast, emit, wait, nav } from "./core.js";
import { settings, saveSettings, doneSet, addSaved, flushSaved } from "./data.js";

export const jobs = [];
const byId = new Map();
let running = 0, scanTimer = 0, hideTimer = 0;
const dirs = new Set();

export const jobOf = (id) => byId.get(id) || null;
export const isSaved = (id) => doneSet.has(id);
const pickUrl = (g) => (settings.quality === "sd" ? g.sd : g.hd);
export const activeJobs = () => jobs.filter((j) => j.state === "queued" || j.state === "run").length;

export async function ensureBase(quiet) {
  if (settings.base) return settings.base;
  try {
    const c = await call({ mode: "conf" });
    if (c && c.base) { settings.base = c.base; saveSettings(); toast(t("Downloads go to {p}", { p: c.base })); return c.base; }
  } catch (e) { /* ask below */ }
  if (!quiet) { toast(t("Choose a download folder first"), true); nav.openSettings && nav.openSettings("base"); }
  return "";
}

// gifs → queue. What is on disk already (any file below the download folder whose name ends in the id) is left out.
export async function enqueue(gifs, opts = {}) {
  gifs = gifs.filter((g) => g && !g.stash);
  if (!gifs.length) { toast(t("Videos from your own Stash are already on your disk")); return 0; }
  const base = await ensureBase();
  if (!base) return 0;
  let skipped = 0;
  try {
    const r = await call({ mode: "have", base, ids: gifs.map((g) => g.id) });
    const have = new Set(((r && r.have) || []).map((x) => String(x).toLowerCase()));
    if (have.size) {
      gifs.forEach((g) => { if (have.has(String(g.id).toLowerCase())) { addSaved(g); emit("job", { id: g.id }); } });
      flushSaved();
      const keep = gifs.filter((g) => !have.has(String(g.id).toLowerCase()));
      skipped = gifs.length - keep.length;
      gifs = keep;
    }
  } catch (e) { /* the download itself skips what exists */ }
  if (!gifs.length) { toast(skipped === 1 ? t("Already saved") : tn(skipped, "{n} video was already there", "{n} videos were already there")); return 0; }
  let n = 0;
  for (const g of gifs) {
    const old = byId.get(g.id);
    if (old && (old.state === "queued" || old.state === "run")) continue;
    const j = { g, state: "queued", note: "", at: Date.now() };
    if (old) jobs.splice(jobs.indexOf(old), 1);
    jobs.push(j);
    byId.set(g.id, j);
    emit("job", { id: g.id });
    n++;
  }
  if (!n) { toast(t("Already downloading")); return 0; }
  if (!opts.quiet) toast(n === 1 && !skipped ? t("Saving to your library…") : tn(n, "Downloading {n} video…", "Downloading {n} videos…") + (skipped ? " " + tn(skipped, "({n} already there)", "({n} already there)") : ""));
  clearTimeout(hideTimer);
  emit("jobs", {});
  pump();
  return n;
}

function pump() {
  while (running < 3) {
    const j = jobs.find((x) => x.state === "queued");
    if (!j) break;
    j.state = "run";
    running++;
    emit("job", { id: j.g.id });
    run(j).finally(() => { running--; emit("job", { id: j.g.id }); emit("jobs", {}); pump(); finished(); });
  }
}

async function run(j) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (j.state === "cancel") return;
    try {
      const o = await call({ mode: "download", url: pickUrl(j.g), base: settings.base, folder: j.g.user, filename: `${j.g.user} - ${j.g.id}` });
      j.state = "ok";
      j.note = o.existed ? "there" : "saved";
      j.size = o.size || 0;
      if (o.dir && !o.existed) dirs.add(o.dir);
      addSaved(j.g);
      return;
    } catch (e) {
      j.note = String(e.message || e).slice(0, 120);
      await wait(800);
    }
  }
  j.state = "bad";
}

function finished() {
  if (jobs.some((j) => j.state === "queued" || j.state === "run")) return;
  flushSaved();
  emit("data", {});
  const ok = jobs.filter((j) => j.state === "ok" && !j.told), bad = jobs.filter((j) => j.state === "bad" && !j.told);
  [...ok, ...bad].forEach((j) => (j.told = true));
  const n = ok.filter((j) => j.note === "saved").length;
  if (ok.length === 1 && !bad.length && n === 1) toast(t("Saved to your library"), false, { label: t("Downloads"), fn: () => nav.openDownloads && nav.openDownloads() });
  else if (ok.length + bad.length > 1 || bad.length) {
    toast(bad.length ? t("{a} saved, {b} failed", { a: n, b: bad.length }) : tn(n, "{n} video saved", "{n} videos saved"), !!bad.length,
      bad.length ? { label: t("Show"), fn: () => nav.openDownloads && nav.openDownloads() } : null);
  }
  if (settings.scan && dirs.size) { clearTimeout(scanTimer); scanTimer = setTimeout(scanNow, 1500); }
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => emit("jobs", { idle: true }), 6000);
}

async function scanNow() {
  const paths = [...dirs];
  dirs.clear();
  if (!paths.length) return;
  try {
    await gql("mutation($p: [String!]) { metadataScan(input: { paths: $p }) }", { p: paths });
    toast(t("Stash is scanning the new videos"));
  } catch (e) { /* only a courtesy – Stash finds the files at its next scan */ }
}

export function cancelQueued() {
  jobs.forEach((j) => { if (j.state === "queued") { j.state = "cancel"; emit("job", { id: j.g.id }); } });
  emit("jobs", {});
}
export function retryFailed() {
  const bad = jobs.filter((j) => j.state === "bad");
  bad.forEach((j) => { j.state = "queued"; j.note = ""; j.told = false; emit("job", { id: j.g.id }); });
  emit("jobs", {});
  pump();
}
export function clearFinished() {
  for (let i = jobs.length - 1; i >= 0; i--) if (!["queued", "run"].includes(jobs[i].state)) { byId.delete(jobs[i].g.id); jobs.splice(i, 1); }
  emit("jobs", {});
}
