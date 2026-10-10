// Settings: all Stash options, sorted into understandable sections. Titles and intros below are
// translated when shown (the English text is the key).
// Fields and types come live from Stash; unknown options end up under "More options".

import { applyDisplay } from "../display.js";
import { forgetLarge, largeNow } from "../scale.js";
import { esc, icon, toast, errorToast, store, confirmDialog, fmtDate, folderMode, ratingSystem, setRatingSystem } from "../ui.js";
import { t, locale, LANGS, chosen, choose } from "../i18n.js";
import { gql, setPluginConfig } from "../api.js";
import { typeInfo, selection, fieldHtml, readFields, unwrap, labelOf, LABELS } from "../forms.js";
import { go } from "../main.js";
import { exportBackup, importBackup } from "../backup.js";
import { pokeJobs } from "../jobs.js";
import { themeHtml, bindTheme } from "../theme.js";
import { interactiveConfig, saveInteractiveConfig, testHandy } from "../interactive.js";
import { mountSlots, slotList, extensionsReady } from "../ext.js";

const AREAS = {
  general: { result: "ConfigGeneralResult", input: "ConfigGeneralInput", mutation: "configureGeneral" },
  interface: { result: "ConfigInterfaceResult", input: "ConfigInterfaceInput", mutation: "configureInterface" },
  dlna: { result: "ConfigDLNAResult", input: "ConfigDLNAInput", mutation: "configureDLNA" },
  scraping: { result: "ConfigScrapingResult", input: "ConfigScrapingInput", mutation: "configureScraping" },
};

const SECTIONS = [
  { id: "look", group: "This interface", title: "Appearance", intro: "Colors, presets and liquid glass.", custom: "look" },
  { id: "player-ui", group: "This interface", title: "Player and previews", intro: "How videos and hover previews play.", custom: "player" },
  { id: "this-ui", group: "This interface", title: "General", intro: "Language, navigation, home page, thumbnail size.", custom: "app" },
  { id: "library", group: "Stash", title: "Library", intro: "Which folders Stash scans and which files belong to the library.", area: "general",
    fields: ["stashes", "createGalleriesFromFolders", "galleryCoverRegex", "writeImageThumbnails", "createImageClipsFromVideos", "videoExtensions", "imageExtensions", "galleryExtensions", "excludes", "imageExcludes", "calculateMD5", "videoFileNamingAlgorithm"] },
  { id: "previews", title: "Previews", intro: "How hover previews and timeline images are generated.", area: "general",
    fields: ["parallelTasks", "previewSegments", "previewSegmentDuration", "previewExcludeStart", "previewExcludeEnd", "previewPreset", "previewAudio", "useCustomSpriteInterval", "spriteInterval", "minimumSprites", "maximumSprites", "spriteScreenshotSize"] },
  { id: "playback", title: "Playback", intro: "Transcoding videos the browser can't play directly.", area: "general",
    fields: ["maxStreamingTranscodeSize", "maxTranscodeSize", "transcodeHardwareAcceleration", "ffmpegPath", "ffprobePath", "transcodeInputArgs", "transcodeOutputArgs", "liveTranscodeInputArgs", "liveTranscodeOutputArgs", "drawFunscriptHeatmapRange"] },
  { id: "paths", title: "Paths", intro: "Where Stash keeps its database, backups and generated files. Changes here usually take effect after restarting Stash.", area: "general",
    fields: ["databasePath", "backupDirectoryPath", "deleteTrashPath", "generatedPath", "metadataPath", "cachePath", "blobsStorage", "blobsPath", "scrapersPath", "pluginsPath", "customPerformerImageLocation", "pythonPath"] },
  { id: "login", title: "Login", intro: "With a username and password, Stash asks for a login when opened.", area: "general", fields: ["username", "password", "maxSessionAge"], apiKey: true },
  { id: "log", title: "Log", intro: "What Stash logs – and the latest entries.", area: "general", fields: ["logLevel", "logFile", "logOut", "logAccess", "logFileMaxSize"], logs: true },
  { id: "classic-ui", group: "More", title: "Classic interface", intro: "Applies to classic Stash, not to this interface.", area: "interface", fields: "*" },
  { id: "dlna", title: "DLNA", intro: "Makes the library visible to TVs and other devices on your home network.", area: "dlna", fields: "*" },
  { id: "scraper", title: "Scraper", intro: "Connection settings for scrapers. Manage the scrapers themselves and Stash-Box logins in classic Stash.", area: "scraping", fields: "*", classic: "/settings?tab=metadata-providers" },
  { id: "more", title: "More options", intro: "Everything that isn't sorted in anywhere else.", area: "general", fields: "rest" },
  { id: "database", title: "Database", intro: "Back up, optimize, clean up.", custom: "system" },
];
// Sections without a group belong to the one before them
SECTIONS.reduce((g, sec) => (sec.group = sec.group || g), "");
const DB = SECTIONS.find((x) => x.id === "database");
SECTIONS.splice(SECTIONS.indexOf(DB), 1);
SECTIONS.splice(SECTIONS.findIndex((x) => x.id === "classic-ui"), 0, Object.assign(DB, { group: "Stash" }));

// Search: what the custom pages contain (their labels, as shown)
const CUSTOM_ENTRIES = {
  look: ["Colors", "Liquid glass", "Effects and animations"],
  "player-ui": ["At the end of a video", "Start at a random spot", "Mouse wheel on the video", "Info panel in fullscreen", "Sound in previews", "The Handy", "Connection key", "Script offset"],
  "this-ui": ["Language", "Folder loading", "This interface as home page", "Install as app", "Studio on scenes", "Other plugins in the menu", "Rating system", "Thumbnail size", "Favorites", "Backup and restore", "Reset interface settings"],
  database: ["Back up database", "Optimize database", "Clean up generated files"],
  login: ["API key"],
};

// Fields never edited here (own tools or read-only)
const SKIP = new Set(["stashBoxes", "scraperPackageSources", "pluginPackageSources", "apiKey", "configFilePath"]);

// Settings screens of extension plugins (slot settings.section) – under their own group "Plugins"
const extSections = () =>
  slotList("settings.section").map((s) => ({ id: "x:" + s.plugin + ":" + s.id, group: "Plugins", title: s.title || s.plugin, intro: "", custom: "ext", slot: s }));
const allSections = () => {
  const x = extSections();
  if (!x.length) return SECTIONS;
  const i = SECTIONS.findIndex((s) => s.group === "More");
  return SECTIONS.slice(0, i < 0 ? SECTIONS.length : i).concat(x, i < 0 ? [] : SECTIONS.slice(i));
};

export async function render(main, params, query = {}) {
  if (String(params.section || "").startsWith("x:")) await Promise.race([extensionsReady(), new Promise((r) => setTimeout(r, 1500))]);
  const ALL = allSections();
  const sec = ALL.find((s) => s.id === params.section) || ALL.find((s) => s.id === "library");
  let group = "";
  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <nav class="kb-crumbs"><span><a href="#/settings">${t("Settings")}</a></span></nav>
      <h1 class="kb-h1">${esc(t(sec.title))}</h1>
      <p class="kb-sub">${esc(t(sec.intro))}</p>
    </div></header>
    <div class="kb-settings">
      <nav class="kb-set-nav" aria-label="${t("Sections")}">
        <label class="kb-search kb-set-search">${icon("search")}<input class="kb-field" type="search" data-setq placeholder="${t("Search settings")}" autocomplete="off"></label>
        <div class="kb-set-results" data-setres hidden></div>
        ${ALL.map((s) => (s.group !== group ? `<div class="kb-set-navgroup">${t((group = s.group))}</div>` : "") + `<a href="#/settings/${s.id}" class="${s === sec ? "is-active" : ""}">${esc(t(s.title))}</a>`).join("")}
        <a href="#/extern/classic-settings">${t("Open in classic Stash")}</a></nav>
      <div class="kb-set-body" data-body><div class="kb-loading">${t("Loading …")}</div></div>
    </div>`;
  const body = main.querySelector("[data-body]");
  let extHandle = null;
  bindSearch(main);
  try {
    if (sec.custom === "system") await renderSystem(body);
    else if (sec.custom === "app") await renderApp(body);
    else if (sec.custom === "look") renderLook(body);
    else if (sec.custom === "player") renderPlayerUi(body);
    else if (sec.custom === "ext") {
      body.innerHTML = "";
      extHandle = mountSlots("settings.section", body, { page: "settings" }, { only: (s) => s === sec.slot });
    }
    else await renderArea(body, sec);
    if (query.find) showFound(body, query.find);
  } catch (e) {
    body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load settings")}</b><p>${esc(e.message)}</p></div>`;
  }
  return () => extHandle && extHandle.destroy();
}

// ---------- Search across all sections ----------

let searchIndex = null;
async function buildIndex() {
  const out = [];
  const add = (sec, label, hint) => out.push({ sec, label, hay: (label + " " + (hint || "")).toLowerCase() });
  for (const sec of allSections()) {
    add(sec, t(sec.title), t(sec.intro)); // the section itself
    (CUSTOM_ENTRIES[sec.id] || []).forEach((l) => add(sec, t(l)));
    if (!sec.area) continue;
    let names = sec.fields;
    if (!Array.isArray(names)) {
      try {
        const all = (await typeInfo(AREAS[sec.area].input)).inputFields.map((f) => f.name);
        const used = new Set(SECTIONS.filter((x) => x.area === "general" && Array.isArray(x.fields)).flatMap((x) => x.fields));
        names = sec.fields === "rest" ? all.filter((n) => !used.has(n)) : all;
      } catch (e) {
        names = [];
      }
    }
    names.filter((n) => !SKIP.has(n)).forEach((n) => add(sec, n === "stashes" ? t("Library folders") : labelOf(n), LABELS[n] ? t(LABELS[n][1] || "") : ""));
  }
  return out;
}

function bindSearch(main) {
  const q = main.querySelector("[data-setq]");
  const box = main.querySelector("[data-setres]");
  let seq = 0;
  q.addEventListener("input", async () => {
    const my = ++seq;
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return (box.hidden = true);
    searchIndex = searchIndex || (await buildIndex());
    if (my !== seq) return;
    const hits = searchIndex.filter((e) => words.every((w) => e.hay.includes(w))).slice(0, 14);
    box.hidden = false;
    box.innerHTML = hits.length
      ? hits.map((h) => `<a href="#/settings/${h.sec.id}?find=${encodeURIComponent(h.label)}"><b>${esc(h.label)}</b><small>${esc(t(h.sec.title))}</small></a>`).join("")
      : `<p class="kb-hint">${t("Nothing found")}</p>`;
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const a = box.querySelector("a");
      if (a) location.hash = a.getAttribute("href");
    } else if (e.key === "Escape") {
      q.value = "";
      box.hidden = true;
    }
  });
}

// Scroll to the setting that was picked in the search and let it light up
function showFound(body, label) {
  const el = [...body.querySelectorAll("b, h2")].find((x) => x.textContent.trim() === label);
  const row = el && (el.closest(".kb-set, .kb-card, .kb-theme-glass") || el);
  if (!row) return;
  row.scrollIntoView({ block: "center" });
  row.classList.add("is-found");
  setTimeout(() => row.classList.remove("is-found"), 2400);
}

async function renderArea(body, sec) {
  const a = AREAS[sec.area];
  const [inputT, sel] = await Promise.all([typeInfo(a.input), selection(a.result)]);
  const d = await gql(`query { configuration { ${sec.area} { ${sel} } } }`);
  const cur = d.configuration[sec.area];
  const inputFields = new Map(inputT.inputFields.map((f) => [f.name, f]));

  let names;
  if (sec.fields === "*") names = inputT.inputFields.map((f) => f.name);
  else if (sec.fields === "rest") {
    const used = new Set(SECTIONS.filter((s) => s.area === "general" && Array.isArray(s.fields)).flatMap((s) => s.fields));
    names = inputT.inputFields.map((f) => f.name).filter((n) => !used.has(n));
  } else names = sec.fields;
  names = names.filter((n) => inputFields.has(n) && !SKIP.has(n));

  const parts = [];
  for (const n of names) {
    if (n === "stashes") parts.push(stashesHtml(cur.stashes || []));
    else parts.push(await fieldHtml(n, inputFields.get(n).type, cur[n]));
  }
  body.innerHTML = `
    <form class="kb-set-form" data-form>${parts.join("") || `<p class="kb-hint">${t("Nothing else to set here.")}</p>`}
      ${sec.apiKey ? apiKeyHtml(cur.apiKey) : ""}
      ${sec.classic ? `<p><a class="kb-btn" href="#/extern/classic-settings?path=${encodeURIComponent(sec.classic)}">${icon("door")}${t("Open in classic Stash")}</a></p>` : ""}
      <div class="kb-set-save" data-save hidden><span>${t("Unsaved changes")}</span><button type="button" class="kb-btn" data-reset>${t("Discard")}</button><button type="submit" class="kb-btn is-primary">${t("Save")}</button></div>
    </form>
    ${sec.logs ? '<section class="kb-logs" data-logs></section>' : ""}`;
  const form = body.querySelector("[data-form]");
  const saveBar = body.querySelector("[data-save]");
  const dirty = () => (saveBar.hidden = false);
  form.addEventListener("input", dirty);
  form.addEventListener("change", dirty);
  bindStashes(form, dirty);
  body.querySelector("[data-reset]").onclick = () => renderArea(body, sec);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = readFields(form);
    if (names.includes("stashes")) input.stashes = readStashes(form);
    try {
      await gql(`mutation($i: ${a.input}!) { ${a.mutation}(input: $i) { __typename } }`, { i: input });
      toast(sec.id === "paths" ? t("Saved – takes effect after restarting Stash") : t("Saved"), "ok");
      saveBar.hidden = true;
    } catch (err) {
      errorToast(err, "Saving failed");
    }
  };
  if (sec.apiKey) bindApiKey(body);
  if (sec.logs) renderLogs(body.querySelector("[data-logs]"));
}

// ---------- Library folders ----------

function stashRow(s) {
  return `<div class="kb-stash-row" data-stash>
    <input class="kb-field" data-spath value="${esc(s.path || "")}" placeholder="${t("Folder path")}" spellcheck="false">
    <label class="kb-check"><input type="checkbox" data-snovid${s.excludeVideo ? " checked" : ""}>${t("no videos")}</label>
    <label class="kb-check"><input type="checkbox" data-snoimg${s.excludeImage ? " checked" : ""}>${t("no images")}</label>
    <button type="button" class="kb-btn is-icon is-ghost" data-srm aria-label="${t("Remove folder")}">${icon("close")}</button>
  </div>`;
}
function stashesHtml(list) {
  return `<div class="kb-set"><div class="kb-set-label"><b>${t("Library folders")}</b><small>${t("Folders Stash scans. “no videos/images” ignores that kind of media in the folder.")}</small></div>
    <div class="kb-stashes" data-stashes>${list.map(stashRow).join("")}</div>
    <button type="button" class="kb-btn" data-sadd>${icon("plus")}${t("Add folder")}</button></div>`;
}
function bindStashes(form, dirty) {
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-sadd]")) {
      form.querySelector("[data-stashes]").insertAdjacentHTML("beforeend", stashRow({}));
      dirty();
    }
    const rm = e.target.closest("[data-srm]");
    if (rm) {
      rm.closest("[data-stash]").remove();
      dirty();
    }
  });
}
function readStashes(form) {
  return [...form.querySelectorAll("[data-stash]")]
    .map((r) => ({ path: r.querySelector("[data-spath]").value.trim(), excludeVideo: r.querySelector("[data-snovid]").checked, excludeImage: r.querySelector("[data-snoimg]").checked }))
    .filter((s) => s.path);
}

// ---------- API key ----------

function apiKeyHtml(key) {
  return `<div class="kb-set"><div class="kb-set-label"><b>${t("API key")}</b><small>${t("For external programs. Generating a new one invalidates the old one.")}</small></div>
    <div class="kb-apikey"><code data-key>${key ? esc(key) : t("no key")}</code>
    <button type="button" class="kb-btn" data-genkey>${t("Generate new")}</button>${key ? `<button type="button" class="kb-btn is-ghost" data-clearkey>${t("Remove")}</button>` : ""}</div></div>`;
}
function bindApiKey(body) {
  body.addEventListener("click", async (e) => {
    const gen = e.target.closest("[data-genkey]");
    const clr = e.target.closest("[data-clearkey]");
    if (!gen && !clr) return;
    const r = await confirmDialog({ title: gen ? t("Generate a new API key?") : t("Remove the API key?"), text: t("Programs using the old key lose access."), ok: gen ? t("Generate") : t("Remove"), danger: !!clr });
    if (!r.ok) return;
    try {
      const d = await gql(`mutation($c: Boolean) { generateAPIKey(input: { clear: $c }) }`, { c: !!clr });
      body.querySelector("[data-key]").textContent = d.generateAPIKey || t("no key");
      toast(t("API key changed"), "ok");
    } catch (err) {
      errorToast(err, "API key");
    }
  });
}

// ---------- Log ----------

async function renderLogs(box) {
  const level = store.get("logLevel", "Info");
  box.innerHTML = `<h2 class="kb-h2">${t("Latest entries")}
    <select class="kb-field" data-lvl>${["Debug", "Info", "Warning", "Error"].map((l) => `<option value="${l}"${l === level ? " selected" : ""}>${t(l)}</option>`).join("")}</select>
    <button class="kb-btn is-ghost" data-refresh>${t("Refresh")}</button></h2><div class="kb-loglist" data-list>${t("Loading …")}</div>`;
  const order = { Trace: 0, Debug: 1, Info: 2, Progress: 2, Warning: 3, Error: 4 };
  const load = async () => {
    try {
      const d = await gql(`query { logs { time level message } }`);
      const min = order[box.querySelector("[data-lvl]").value];
      const rows = d.logs.filter((l) => (order[l.level] ?? 2) >= min).slice(-400).reverse();
      box.querySelector("[data-list]").innerHTML = rows.length
        ? rows.map((l) => `<div class="kb-log is-${l.level.toLowerCase()}"><time>${esc(new Date(l.time).toLocaleTimeString(locale()))}</time><b>${esc(l.level)}</b><span>${esc(l.message)}</span></div>`).join("")
        : `<p class="kb-hint">${t("No entries at this level.")}</p>`;
    } catch (e) {
      box.querySelector("[data-list]").textContent = t("Couldn't load the log:") + " " + e.message;
    }
  };
  box.querySelector("[data-lvl]").onchange = (e) => {
    store.set("logLevel", e.target.value);
    load();
  };
  box.querySelector("[data-refresh]").onclick = load;
  load();
}

// ---------- Database & system ----------

async function renderSystem(body) {
  const cg = await typeInfo("CleanGeneratedInput");
  body.innerHTML = `
    <div class="kb-cards">
      <section class="kb-card"><h2>${t("Back up database")}</h2><p>${t("Stores a copy of the database in the backup folder.")}</p>
        <label class="kb-check"><input type="checkbox" data-blobs>${t("Include image data")}</label>
        <button class="kb-btn is-primary" data-backup>${t("Back up now")}</button></section>
      <section class="kb-card"><h2>${t("Optimize database")}</h2><p>${t("Tidies up the database internally and makes it smaller. Runs as a background task.")}</p>
        <button class="kb-btn" data-optimise>${t("Optimize")}</button></section>
      <section class="kb-card"><h2>${t("Clean up generated files")}</h2><p>${t("Removes previews, sprites and other generated files that no longer belong to a scene or image.")}</p>
        <form data-cleangen>${(await Promise.all(cg.inputFields.map((f) => fieldHtml(f.name, f.type, f.name === "dryRun")))).join("")}
        <button class="kb-btn" type="submit">${t("Start clean-up")}</button></form></section>
    </div>`;
  body.querySelector("[data-backup]").onclick = async () => {
    try {
      const d = await gql(`mutation($b: Boolean) { backupDatabase(input: { download: false, includeBlobs: $b }) }`, { b: body.querySelector("[data-blobs]").checked });
      toast(t("Backed up") + (d.backupDatabase ? ": " + d.backupDatabase : ""), "ok");
    } catch (e) {
      errorToast(e, "Backup failed");
    }
  };
  body.querySelector("[data-optimise]").onclick = async () => {
    try {
      await gql(`mutation { optimiseDatabase }`);
      pokeJobs();
      toast(t("Optimizing – see Tasks"), "ok");
    } catch (e) {
      errorToast(e, "Optimize");
    }
  };
  body.querySelector("[data-cleangen]").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await gql(`mutation($i: CleanGeneratedInput!) { metadataCleanGenerated(input: $i) }`, { i: readFields(e.target) });
      pokeJobs();
      toast(t("Cleaning up – see Tasks"), "ok");
    } catch (err) {
      errorToast(err, "Clean-up");
    }
  };
}

// ---------- This interface ----------

function renderLook(body) {
  body.innerHTML = `<form class="kb-set-form" data-form>${themeHtml()}
    <div class="kb-set kb-theme"><div class="kb-theme-body"><label class="kb-theme-glass"><span class="kb-switch"><input type="checkbox" data-fx${store.get("fx", true) !== false ? " checked" : ""}><i></i></span><span><b>${t("Effects and animations")}</b><small>${t("Button shine and ripples, tilting cards with a moving light, a wipe on page changes and a glow behind the mouse. Off by itself when your system asks for less motion.")}</small></span></label></div></div></form>`;
  bindTheme(body);
  body.querySelector("[data-fx]").addEventListener("change", (e) => {
    store.set("fx", e.target.checked);
    applyDisplay();
    toast(t("Saved"), "ok");
  });
}

const RATE_SYS = [["stars:full", "Stars (whole)"], ["stars:half", "Stars (half)"], ["stars:quarter", "Stars (quarter)"], ["stars:tenth", "Stars (tenth)"], ["decimal:", "Decimal (0.0–10.0)"]];
const rateSysNow = () => {
  const r = ratingSystem();
  return r.type === "decimal" ? "decimal:" : "stars:" + ({ 0.5: "half", 0.25: "quarter", 0.1: "tenth" }[r.step] || "full");
};
const setPlayer = (patch) => store.set("player", Object.assign(store.get("player", {}), patch));
function renderPlayerUi(body) {
  const player = store.get("player", {});
  const mode = player.mode || (player.loop ? "one" : player.random ? "shuffle" : player.auto === false ? "stop" : "order");
  const sw = (attr, on, title, hint) => `<label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t(title)}</b><small>${t(hint)}</small></span>
        <span class="kb-switch"><input type="checkbox" ${attr}${on ? " checked" : ""}><i></i></span></label>`;
  body.innerHTML = `<form class="kb-set-form" data-form>
      <label class="kb-set"><span class="kb-set-label"><b>${t("At the end of a video")}</b><small>${t("The same as the button in the player bar – a click there cycles through these.")}</small></span>
        <select class="kb-field" data-pmode>${[["order", "In order"], ["shuffle", "Random order"], ["one", "Repeat this video"], ["all", "Repeat all"], ["stop", "Stop at the end"]].map(([v, l]) => `<option value="${v}"${mode === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      ${sw("data-randstart", !!player.randomStart, "Start at a random spot", "Every scene starts somewhere in the middle – for browsing around. Your resume points in Stash stay as they are.")}
      <label class="kb-set"><span class="kb-set-label"><b>${t("Mouse wheel on the video")}</b><small>${t("Turn the wheel over the picture to change the volume or to jump (5 s per notch); hold Shift for the other one.")}</small></span>
        <select class="kb-field" data-wheel>${[["volume", "Volume"], ["seek", "Jump forward / back"], ["off", "Off"]].map(([v, l]) => `<option value="${v}"${(player.wheel || "volume") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      ${sw("data-fspanel", player.fsPanel !== false, "Info panel in fullscreen", "Move the mouse to the right edge in fullscreen to slide in the info panel.")}
      <div class="kb-set"><div class="kb-set-label"><b>${t("External players")}</b><small>${t("The “External player” button in a scene's info panel hands the video to a player on this device – for formats the browser can't play. Choose the ones to offer; some need a small helper installed (see below each).")}</small></div></div>
      <div class="kb-extpick" data-extpick></div>
      ${sw("data-psound", store.get("previewSound", true), "Sound in previews", "Hover previews play with sound (at the player's volume). Stash only puts sound into previews when “Preview audio” is on under Previews – regenerate them after switching it on.")}
    </form>`;
  // External players: which ones the "External player" button offers (kept in Stash: the same on every device)
  (async () => {
    const { PLAYERS, playersHere, loadExtPlayers, saveExtPlayers, offeredPlayers } = await import("../extplayer.js");
    const box = body.querySelector("[data-extpick]");
    if (!box) return;
    const on = new Set((await offeredPlayers()).map((p) => p.id));
    box.innerHTML = playersHere()
      .map((p) => `<label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${esc(p.name)}</b>${p.hint ? `<small>${esc(t(p.hint))}</small>` : ""}</span><span class="kb-switch"><input type="checkbox" data-xp="${p.id}"${on.has(p.id) ? " checked" : ""}><i></i></span></label>`)
      .join("");
    box.onchange = async (e) => {
      const c = e.target.closest("[data-xp]");
      if (!c) return;
      c.checked ? on.add(c.dataset.xp) : on.delete(c.dataset.xp);
      await saveExtPlayers({ enabled: [...on] });
      toast(t("Saved"), "ok");
    };
  })().catch(() => {});
  body.querySelector("[data-pmode]").onchange = (e) => setPlayer({ mode: e.target.value });
  body.querySelector("[data-wheel]").onchange = (e) => setPlayer({ wheel: e.target.value });
  body.querySelector("[data-fspanel]").onchange = (e) => setPlayer({ fsPanel: e.target.checked });
  body.querySelector("[data-randstart]").onchange = (e) => setPlayer({ randomStart: e.target.checked });
  body.querySelector("[data-psound]").onchange = (e) => store.set("previewSound", e.target.checked);

  // Interactive: The Handy (Stash's own settings – classic Stash uses the same)
  const box = document.createElement("form");
  box.className = "kb-set-form kb-set-handy";
  box.innerHTML = `<h3 class="kb-set-sub">${icon("plug")}${t("The Handy")}</h3>
    <p class="kb-hint">${t("Scenes with a funscript play on The Handy: it follows play, pause and jumps. Saved in Stash – classic Stash uses the same settings.")}</p>
    <label class="kb-set"><span class="kb-set-label"><b>${t("Connection key")}</b><small>${t("From the Handy app or handyfeeling.com. Empty = off.")}</small></span>
      <input class="kb-field" type="text" data-hkey autocomplete="off" spellcheck="false" placeholder="${t("e.g. abc123XYZ")}"></label>
    <label class="kb-set"><span class="kb-set-label"><b>${t("Script offset")}</b><small>${t("Milliseconds – if the movement comes too early (negative) or too late (positive).")}</small></span>
      <input class="kb-field" type="number" step="10" data-hoff style="max-width:120px"></label>
    <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("The Handy fetches the script from Stash")}</b><small>${t("Only when Stash can be reached from the internet. Otherwise the script goes to the Handy's own server for playback.")}</small></span>
      <span class="kb-switch"><input type="checkbox" data-hhost><i></i></span></label>
    <div class="kb-set"><span class="kb-set-label"><b>${t("Test the connection")}</b><small data-hres>${t("Is the Handy online, and how far off is its clock?")}</small></span>
      <button type="button" class="kb-btn" data-htest>${t("Test")}</button></div>`;
  body.appendChild(box);
  interactiveConfig(true).then((c) => {
    box.querySelector("[data-hkey]").value = c.handyKey;
    box.querySelector("[data-hoff]").value = c.funscriptOffset;
    box.querySelector("[data-hhost]").checked = c.useStashHostedFunscript;
  });
  const saveH = async (patch) => {
    try {
      await saveInteractiveConfig(patch);
      toast(t("Saved"), "ok");
    } catch (err) {
      errorToast(err, "The Handy");
    }
  };
  box.querySelector("[data-hkey]").onchange = (e) => saveH({ handyKey: e.target.value.trim() });
  box.querySelector("[data-hoff]").onchange = (e) => saveH({ funscriptOffset: Math.round(Number(e.target.value) || 0) });
  box.querySelector("[data-hhost]").onchange = (e) => saveH({ useStashHostedFunscript: e.target.checked });
  box.querySelector("[data-htest]").onclick = async (e) => {
    const res = box.querySelector("[data-hres]");
    e.target.disabled = true;
    res.textContent = t("Testing …");
    try {
      const off = await testHandy();
      res.textContent = t("Online and ready – clock difference {n} ms", { n: off });
      res.className = "is-ok";
    } catch (err) {
      res.textContent = err.message;
      res.className = "is-err";
    }
    e.target.disabled = false;
  };
}

async function renderApp(body) {
  const d = await gql(`query { configuration { plugins(include: ["stashui"]) } }`);
  const cfg = (d.configuration.plugins && d.configuration.plugins.stashui) || {};
  body.innerHTML = `
    <form class="kb-set-form" data-form>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Language")}</b><small>${t("“Automatic” follows the language set in Stash (classic Stash → Settings → Interface).")}</small></span>
        <select class="kb-field" data-lang><option value="auto">${t("Automatic")}</option>${LANGS.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Folder loading")}</b><small>${t("Counting the folders reads the whole library once (then it's remembered) – on very big libraries that can take very long. “Off” loads no folders at all.")}</small></span>
        <select class="kb-field" data-foldermode>${[["all", "Everywhere"], ["page", "Only on the Folders page"], ["off", "Off"]].map(([v, l]) => `<option value="${v}"${folderMode() === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Large library mode")}</b><small>${t("For libraries with very many files (from 20 000 scenes or 100 000 images): folders aren't counted on their own, the home page loads what you scroll to, Versus plays preview clips, scans of all funscripts wait for a click. Takes effect after reloading the page.")}${largeNow() ? " " + t("Right now: on.") : ""}</small></span>
        <select class="kb-field" data-dsp="largeMode">${[["auto", "Automatic"], ["on", "On"], ["off", "Off"]].map(([v, l]) => `<option value="${v}"${store.get("largeMode", "auto") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Versus: scenes")}</b><small>${t("What a scene shows in Versus: the whole video (jumping through it) or only the preview clip – lighter on slow disks. Automatic follows the large library mode.")}</small></span>
        <select class="kb-field" data-dsp="vsMedia">${[["auto", "Automatic"], ["preview", "Preview clips"], ["full", "Whole video"]].map(([v, l]) => `<option value="${v}"${store.get("vsMedia", "auto") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("This interface as home page")}</b><small>${t("Opening Stash goes straight to this interface. Off = classic Stash stays the home page.")}</small></span>
        <span class="kb-switch"><input type="checkbox" data-home${cfg.keepClassicHome ? "" : " checked"}><i></i></span></label>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Install as app")}</b><small data-installhint></small></div><button type="button" class="kb-btn" data-install hidden>${icon("phone")}${t("Install")}</button></div>
      <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Studio on scenes")}</b><small>${t("Shows the studio's logo (or its name) in the corner of scene thumbnails.")}</small></span>
        <span class="kb-switch"><input type="checkbox" data-studiologo${store.get("studioLogos", false) ? " checked" : ""}><i></i></span></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Studio logo: corner")}</b><small>${t("Where the logo sits on a thumbnail.")}</small></span>
        <select class="kb-field" data-dsp="studioPos">${[["bl", "Bottom left"], ["br", "Bottom right"], ["tl", "Top left"], ["tr", "Top right"]].map(([v, l]) => `<option value="${v}"${store.get("studioPos", "bl") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Studio logo: size")}</b><small>${t("How big the logo is.")}</small></span>
        <select class="kb-field" data-dsp="studioSize">${[["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]].map(([v, l]) => `<option value="${v}"${store.get("studioSize", "m") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("NSFW mode")}</b><small>${t("Blurs all pictures and hover previews – also with the eye button at the top of the menu on the left.")}</small></span>
        <span class="kb-switch"><input type="checkbox" data-dsp="nsfw"${store.get("nsfw", false) ? " checked" : ""}><i></i></span></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("NSFW mode: what is blurred")}</b><small>${t("Thumbnails and previews – or also the player and the image viewer.")}</small></span>
        <select class="kb-field" data-dsp="nsfwScope">${[["cards", "Thumbnails and previews"], ["all", "Everything, also player and viewer"]].map(([v, l]) => `<option value="${v}"${store.get("nsfwScope", "cards") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("NSFW mode: blur strength")}</b></span>
        <input type="range" min="6" max="40" step="2" data-dsp="nsfwBlur" value="${store.get("nsfwBlur", 18)}"></label>
      <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("NSFW mode: clear while the mouse is on it")}</b><small>${t("A thumbnail shows sharp as long as you point at it.")}</small></span>
        <span class="kb-switch"><input type="checkbox" data-dsp="nsfwHover"${store.get("nsfwHover", false) ? " checked" : ""}><i></i></span></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Menu on the left")}</b><small>${t("Full, icons only, or hidden until you press the menu button in the top left corner. The button at the top of the menu switches between them too.")}</small></span>
        <select class="kb-field" data-dsp="railMode">${[["full", "Full"], ["mini", "Icons only"], ["hidden", "Hidden"]].map(([v, l]) => `<option value="${v}"${store.get("railMode", "full") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Menu width")}</b><small>${t("How wide the menu on the left is (on a computer).")}</small></span>
        <input type="range" min="180" max="360" step="4" data-dsp="railWidth" value="${store.get("railWidth", 236)}"></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Thumbnail shape")}</b><small>${t("Each as its picture is – or all as posters (portrait) or all as scenes (landscape).")}</small></span>
        <select class="kb-field" data-dsp="cardFormat">${[["auto", "As the picture is"], ["poster", "Posters (portrait)"], ["scene", "Scenes (landscape)"]].map(([v, l]) => `<option value="${v}"${store.get("cardFormat", "auto") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Hover previews")}</b><small>${t("Whether a thumbnail plays a short clip when you point at it.")}</small></span>
        <select class="kb-field" data-dsp="previewMode">${[["on", "Always"], ["off", "Never"], ["poster", "Not with posters"]].map(([v, l]) => `<option value="${v}"${store.get("previewMode", "on") === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <div class="kb-set kb-set-ext"><div class="kb-set-label"><b>${t("Other plugins in the menu")}</b><small>${t("Plugins with their own page get an entry under “Extensions” on the left. Fold the group with a click on its heading, or hide it here – all of it or single plugins.")}</small></div>
        <select class="kb-field" data-extmode><option value="show">${t("Show")}</option><option value="hide">${t("Hide")}</option></select>
        <div class="kb-extpick" data-extpick></div></div>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Rating system")}</b><small>${t("How ratings are shown and set. Saved in Stash – classic Stash uses the same setting.")}</small></span>
        <select class="kb-field" data-ratesys>${RATE_SYS.map(([v, l]) => `<option value="${v}"${rateSysNow() === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>
      <label class="kb-set"><span class="kb-set-label"><b>${t("Thumbnail size")}</b><small>${t("How tall a row in the lists is.")}</small></span>
        <input type="range" min="130" max="480" step="10" data-rowh value="${store.get("rowHeight", 250)}"></label>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Favorites")}</b><small>${t("The heart is the Stash tag “Favorite”. You'll find it in classic Stash too.")}</small></div></div>
      <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Automatic backup in Stash")}</b><small>${t("Copies the settings of this browser to Stash a little after they change. A browser that forgot them (site data cleared, another address, a new device) gets them back by itself.")}</small></span><span class="kb-switch"><input type="checkbox" data-autobk${store.get("autoBackup", true) !== false ? " checked" : ""}><i></i></span></label>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Backup and restore")}</b><small>${t("Saves everything this interface remembers – settings of this browser, home page and menu, ratings, playlists, Versus, funscript variants – in one file, and puts it back (also in another browser). It may contain your Handy connection key, so keep the file private.")}</small></div>
        <span class="kb-set-btns"><button type="button" class="kb-btn" data-bkexport>${t("Save backup")}</button><button type="button" class="kb-btn" data-bkimport>${t("Restore backup")}</button><input type="file" accept=".json,application/json" data-bkfile hidden></span></div>
      <div class="kb-set"><div class="kb-set-label"><b>${t("Reset interface settings")}</b><small>${t("Everything this interface remembers in this browser – player and viewer settings, thumbnail size, expanded folders, the home page and more. Not the queue, the colors or the glass look.")}</small></div>
        <button type="button" class="kb-btn" data-resetlocal>${t("Reset")}</button></div>
    </form>`;
  // Install as an app
  const instBtn = body.querySelector("[data-install]");
  const instHint = body.querySelector("[data-installhint]");
  const paintInstall = () => {
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    instBtn.hidden = !window.kbInstall || standalone;
    instHint.textContent = standalone
      ? t("You're using the app right now.")
      : window.kbInstall
        ? t("Its own window and a home screen icon, without the browser bar.")
        : ios
          ? t("In Safari: Share → Add to Home Screen.")
          : !window.isSecureContext
            ? t("Browsers only install apps from https or on the computer Stash runs on (localhost). On other devices: browser menu → Add to Home screen – that adds a shortcut.")
            : t("Use the install icon in the address bar, or the browser menu → Install app. Firefox can't install web apps.");
  };
  paintInstall();
  window.addEventListener("kb-installable", paintInstall);
  instBtn.onclick = async () => {
    const e = window.kbInstall;
    if (!e) return;
    e.prompt();
    const r = await e.userChoice;
    if (r.outcome === "accepted") {
      window.kbInstall = null;
      toast(t("Installed"), "ok");
    }
    paintInstall();
  };

  // Extensions in the menu: all of them or none, and single ones off
  const extMode = body.querySelector("[data-extmode]");
  extMode.value = store.get("extMode", "show");
  const paintExtPick = () => {
    const found = store.get("extFound", []);
    const off = new Set(store.get("extHidden", []));
    const box = body.querySelector("[data-extpick]");
    box.hidden = extMode.value === "hide" || !found.length;
    box.innerHTML = found.map((f) => `<label class="kb-check"><input type="checkbox" data-extid="${esc(f.id)}"${off.has(f.id) ? "" : " checked"}>${esc(f.name)}</label>`).join("");
  };
  paintExtPick();
  const extChanged = () => window.dispatchEvent(new Event("stash:plugins-changed"));
  extMode.onchange = () => {
    store.set("extMode", extMode.value);
    paintExtPick();
    extChanged();
  };
  body.querySelector("[data-extpick]").addEventListener("change", (e) => {
    const c = e.target.closest("[data-extid]");
    if (!c) return;
    const off = new Set(store.get("extHidden", []));
    c.checked ? off.delete(c.dataset.extid) : off.add(c.dataset.extid);
    store.set("extHidden", [...off]);
    extChanged();
  });

  // display options of this browser (display.js puts them on the page)
  body.querySelectorAll("[data-dsp]").forEach((el) => {
    const apply = () => {
      const k = el.dataset.dsp;
      store.set(k, el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value);
      if (k === "largeMode") forgetLarge();
      applyDisplay();
      window.dispatchEvent(new Event("stash:display-changed"));
    };
    el.addEventListener(el.type === "range" ? "input" : "change", apply);
    if (el.type === "range") el.addEventListener("change", () => toast(t("Saved"), "ok"));
    else el.addEventListener("change", () => toast(t("Saved"), "ok"));
  });
  body.querySelector("[data-studiologo]").onchange = (e) => {
    store.set("studioLogos", e.target.checked);
    toast(t("Saved"), "ok");
  };

  // Language: applies after reloading, so the menu and every page switch at once
  const langSel = body.querySelector("[data-lang]");
  langSel.value = chosen();
  langSel.onchange = () => {
    choose(langSel.value);
    location.reload();
  };
  body.querySelector("[data-home]").onchange = async (e) => {
    try {
      await setPluginConfig("stashui", { keepClassicHome: !e.target.checked });
      localStorage.setItem("stashui.keepClassicHome", String(!e.target.checked));
      toast(t("Saved"), "ok");
    } catch (err) {
      errorToast(err, "Save");
    }
  };
  // Stash's own setting (configuration.ui.ratingSystemOptions) – only this one key is changed
  body.querySelector("[data-ratesys]").onchange = async (e) => {
    const [type, starPrecision] = e.target.value.split(":");
    const opts = type === "decimal" ? { type: "decimal", starPrecision: "full" } : { type: "stars", starPrecision };
    try {
      await gql(`mutation($p: Map) { configureUI(partial: $p) }`, { p: { ratingSystemOptions: opts } });
      setRatingSystem(opts);
      toast(t("Rating system saved"), "ok");
    } catch (err) {
      e.target.value = rateSysNow();
      errorToast(err, "Rating system");
    }
  };
  body.querySelector("[data-foldermode]").onchange = (e) => {
    store.set("folderMode", e.target.value);
    sessionStorage.removeItem("stashui.foldersOnce");
    location.reload(); // the navigation is built once – rebuild it with or without folders
  };
  body.querySelector("[data-autobk]").onchange = (e) => store.set("autoBackup", e.target.checked);
  body.querySelector("[data-bkexport]").onclick = () => exportBackup().catch((e) => errorToast(e, "Backup"));
  body.querySelector("[data-bkimport]").onclick = () => body.querySelector("[data-bkfile]").click();
  body.querySelector("[data-bkfile]").onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) importBackup(f);
  };
  body.querySelector("[data-rowh]").onchange = (e) => store.set("rowHeight", Number(e.target.value));
  body.querySelector("[data-resetlocal]").onclick = async () => {
    const r = await confirmDialog({ title: t("Reset interface settings?"), text: t("Everything this interface remembers in this browser goes back to the defaults. Your library stays as it is."), ok: t("Reset"), danger: true });
    if (!r.ok) return;
    Object.keys(localStorage).filter((k) => k.startsWith("stashui.") && k !== "stashui.queue" && k !== "stashui.theme" && k !== "stashui.glass").forEach((k) => localStorage.removeItem(k));
    toast(t("Reset"), "ok");
    go("settings/this-ui", true);
  };
}
