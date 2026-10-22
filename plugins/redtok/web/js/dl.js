// RedTok – downloads into a folder of your Stash library (one folder per creator), then a scan so Stash finds them.

import { call, gql, t, tn, toast, emit, wait, nav } from "./core.js";
import { settings, saveSettings, doneSet, addSaved, flushSaved, savedSignal } from "./data.js";

export const jobs = [];
const byId = new Map();
let running = 0, scanTimer = 0, hideTimer = 0;
const dirs = new Set();
const metaQ = []; // saved videos whose scene in Stash gets its date / creator once the scan has found it

export const jobOf = (id) => byId.get(id) || null;
export const isSaved = (id) => doneSet.has(id);
const pickUrl = (g) => (settings.quality === "sd" ? g.sd : g.hd);
export const activeJobs = () => jobs.filter((j) => j.state === "queued" || j.state === "run").length;

// ---------- downloads in the background ----------
// The plugin's backend has a worker of its own: the page hands the list over ("dl_add") and shows what the worker reports
// ("dl_status"). Closing the page doesn't stop it – the worker also has Stash scan the folders and fills in the scenes.
// An older backend (plugin not reloaded yet) doesn't know the modes: then this page downloads itself, as before.
let bgOk = null; // null = not tried, false = this backend doesn't know it
const bgOn = () => settings.bg !== false && bgOk !== false;
let pollT = 0, bgRev = 0;
const packOf = (g) => ({ id: g.id, user: g.user, url: pickUrl(g), thumb: g.thumb || g.poster || "", date: g.date || 0, desc: (g.desc || "").slice(0, 300), tags: (g.tags || []).slice(0, 10) });
const gOf = (r) => ({ id: r.id, user: r.user, thumb: r.thumb, poster: r.thumb, hd: r.url, sd: r.url, date: r.date, desc: r.desc, tags: r.tags || [] });
const noMode = (e) => /unknown mode/i.test(String((e && e.message) || e));

function applyBg(list) {
  let changed = false;
  for (const r of list) {
    let j = byId.get(r.id);
    const fresh = !j;
    if (fresh) {
      // one the worker has (started before this page was opened): a finished one from long ago isn't announced again
      j = { g: gOf(r), state: "queued", note: "", at: (r.at || 0) * 1000, bg: true, told: ["ok", "bad", "cancel"].includes(r.state) && Date.now() - (r.at || 0) * 1000 > 30 * 60e3 };
      jobs.push(j);
      byId.set(r.id, j);
    } else if (!j.bg) continue; // (one this page downloads itself)
    if (fresh || j.state !== r.state || j.note !== r.note) {
      j.state = r.state;
      j.note = r.note || "";
      j.size = r.size || 0;
      if (r.state === "ok") addSaved(j.g);
      emit("job", { id: r.id });
      changed = true;
    }
  }
  if (changed) {
    emit("jobs", {});
    if (!jobs.some((j) => j.state === "queued" || j.state === "run")) finished();
  }
}

export async function pollBg(force) {
  clearTimeout(pollT);
  let r = null;
  try {
    r = await call({ mode: "dl_status", rev: force ? 0 : bgRev });
    bgOk = true;
  } catch (e) {
    if (noMode(e)) bgOk = false;
  }
  if (r && !r.same) { bgRev = r.rev; applyBg(r.jobs || []); }
  const active = jobs.some((j) => j.bg && (j.state === "queued" || j.state === "run"));
  if (r && (active || r.alive)) pollT = setTimeout(pollBg, 1500);
  else if (!r && active && bgOk !== false) pollT = setTimeout(pollBg, 5000);
}
setTimeout(() => pollBg(true).catch(() => {}), 1500); // (what the worker did while this page was closed)

// hands the new jobs to the worker; false = this backend can't (the page downloads them itself)
async function handOver(fresh, base) {
  if (!bgOn() || !fresh.length) return false;
  try {
    await call({ mode: "dl_add", base, items: fresh.map((j) => packOf(j.g)), opts: { scan: settings.scan, meta: settings.meta, metaTags: settings.metaTags, metaPerf: settings.metaPerf } });
  } catch (e) {
    if (noMode(e)) { bgOk = false; return false; }
    fresh.forEach((j) => { j.state = "bad"; j.note = String(e.message || e).slice(0, 120); emit("job", { id: j.g.id }); });
    return true;
  }
  bgOk = true;
  fresh.forEach((j) => (j.bg = true));
  pollBg(true);
  return true;
}

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
  if (gifs.length <= 2) gifs.forEach(savedSignal); // (saving one on purpose tells the algorithm; a whole creator doesn't)
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
  const fresh = [];
  for (const g of gifs) {
    const old = byId.get(g.id);
    if (old && (old.state === "queued" || old.state === "run")) continue;
    const j = { g, state: "queued", note: "", at: Date.now() };
    if (old) jobs.splice(jobs.indexOf(old), 1);
    jobs.push(j);
    byId.set(g.id, j);
    fresh.push(j);
    emit("job", { id: g.id });
    n++;
  }
  if (!n) { toast(t("Already downloading")); return 0; }
  await handOver(fresh, base);
  if (!opts.quiet) toast(n === 1 && !skipped ? t("Saving to your library…") : tn(n, "Downloading {n} video…", "Downloading {n} videos…") + (skipped ? " " + tn(skipped, "({n} already there)", "({n} already there)") : ""));
  clearTimeout(hideTimer);
  emit("jobs", {});
  pump();
  return n;
}

function pump() {
  while (running < 3) {
    const j = jobs.find((x) => x.state === "queued" && !x.bg);
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
      if (o.dir && !o.existed) { dirs.add(o.dir); metaQ.push(j.g); }
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
  const q = metaQ.splice(0);
  if ((settings.meta || settings.metaTags || settings.metaPerf) && q.length) fillMeta(q).catch(() => {});
}

// The scene of a saved video gets what RedGifs knows: date, creator (as the studio) and the link. The scan runs on its own,
// so the scene is looked up (by its file name "<creator> - <id>") for up to ~2 minutes.
const SCENE_Q = "query($f: SceneFilterType) { findScenes(scene_filter: $f, filter: { per_page: 1 }) { scenes { id tags { id } performers { id } } } }";
const studioIds = new Map();
async function studioFor(name) {
  if (studioIds.has(name)) return studioIds.get(name);
  const d = await gql("query($f: StudioFilterType) { findStudios(studio_filter: $f, filter: { per_page: 1 }) { studios { id } } }", { f: { name: { value: name, modifier: "EQUALS" } } });
  let id = d.findStudios.studios[0] && d.findStudios.studios[0].id;
  if (!id) id = (await gql("mutation($i: StudioCreateInput!) { studioCreate(input: $i) { id } }", { i: { name, url: `https://www.redgifs.com/users/${name}` } })).studioCreate.id;
  studioIds.set(name, id);
  return id;
}
// Tags and performers (only when switched on): found by name, made when missing. Failures leave that one out.
const tagIds = new Map(), perfIds = new Map();
async function tagFor(name) {
  const key = name.toLowerCase();
  if (tagIds.has(key)) return tagIds.get(key);
  const d = await gql("query($q: String!) { findTags(filter: { q: $q, per_page: 20 }) { tags { id name aliases } } }", { q: name });
  const hit = d.findTags.tags.find((x) => x.name.toLowerCase() === key || (x.aliases || []).some((a) => a.toLowerCase() === key));
  const id = hit ? hit.id : (await gql("mutation($i: TagCreateInput!) { tagCreate(input: $i) { id } }", { i: { name } })).tagCreate.id;
  tagIds.set(key, id);
  return id;
}
async function performerFor(name) {
  const key = name.toLowerCase();
  if (perfIds.has(key)) return perfIds.get(key);
  const d = await gql("query($q: String!) { findPerformers(filter: { q: $q, per_page: 20 }) { performers { id name } } }", { q: name });
  const hit = d.findPerformers.performers.find((x) => x.name.toLowerCase() === key);
  let id = hit && hit.id;
  if (!id) {
    const url = `https://www.redgifs.com/users/${name}`;
    for (const extra of [{ urls: [url] }, { url }, {}]) {
      try { id = (await gql("mutation($i: PerformerCreateInput!) { performerCreate(input: $i) { id } }", { i: { name, ...extra } })).performerCreate.id; break; } catch (e) { /* older / newer field name – next form */ }
    }
    if (!id) throw new Error("performer not created");
  }
  perfIds.set(key, id);
  return id;
}
async function fillMeta(list) {
  const todo = list.map((g) => ({ g, left: 40 }));
  while (todo.length) {
    await wait(3000);
    for (const it of todo.slice()) {
      const { g } = it;
      let sid = "";
      try {
        const d = await gql(SCENE_Q, { f: { path: { value: `${g.user} - ${g.id}`, modifier: "INCLUDES" } } });
        sid = d.findScenes.scenes[0] ? d.findScenes.scenes[0].id : "";
        it.sc = d.findScenes.scenes[0] || null;
      } catch (e) { /* try again */ }
      if (!sid && --it.left > 0) continue;
      todo.splice(todo.indexOf(it), 1);
      if (!sid) continue;
      const input = { id: sid };
      if (settings.meta) {
        if (g.date) input.date = new Date(g.date * 1000).toISOString().slice(0, 10);
        if (g.desc && g.desc.length < 200) input.details = g.desc;
        try { input.studio_id = await studioFor(g.user); } catch (e) { /* the rest still goes in */ }
      }
      const have = it.sc || { tags: [], performers: [] };
      if (settings.metaTags && g.tags && g.tags.length) {
        const ids = new Set((have.tags || []).map((x) => x.id));
        for (const name of g.tags.slice(0, 10)) { try { ids.add(await tagFor(String(name))); } catch (e) { /* skip this tag */ } }
        input.tag_ids = [...ids];
      }
      if (settings.metaPerf && g.user) {
        const ids = new Set((have.performers || []).map((x) => x.id));
        try { ids.add(await performerFor(g.user)); input.performer_ids = [...ids]; } catch (e) { /* no performer */ }
      }
      if (Object.keys(input).length < 2 && !settings.meta) continue; // nothing to set
      const link = `https://www.redgifs.com/watch/${g.id}`;
      for (const extra of settings.meta ? [{ urls: [link] }, { url: link }, {}] : [{}]) {
        try { await gql("mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }", { i: { ...input, ...extra } }); break; } catch (e) { /* older / newer field name – next form */ }
      }
    }
  }
}

export function cancelQueued() {
  const bg = jobs.some((j) => j.bg && j.state === "queued");
  jobs.forEach((j) => { if (j.state === "queued" && !j.bg) { j.state = "cancel"; emit("job", { id: j.g.id }); } });
  emit("jobs", {});
  if (bg) call({ mode: "dl_ctl", action: "cancel" }).then(() => pollBg(true)).catch(() => {});
}
export function retryFailed() {
  const bad = jobs.filter((j) => j.state === "bad");
  bad.forEach((j) => { j.state = "queued"; j.note = ""; j.told = false; emit("job", { id: j.g.id }); });
  emit("jobs", {});
  const bg = bad.filter((j) => j.bg).map((j) => j.g.id);
  if (bg.length) call({ mode: "dl_ctl", action: "retry", ids: bg }).then(() => pollBg(true)).catch(() => {});
  pump();
}
export function clearFinished() {
  const bg = jobs.some((j) => j.bg && !["queued", "run"].includes(j.state));
  for (let i = jobs.length - 1; i >= 0; i--) if (!["queued", "run"].includes(jobs[i].state)) { byId.delete(jobs[i].g.id); jobs.splice(i, 1); }
  emit("jobs", {});
  if (bg) call({ mode: "dl_ctl", action: "clear" }).catch(() => {});
}
