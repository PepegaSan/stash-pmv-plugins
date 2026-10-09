// Plugins: everything classic Stash does, in three tabs –
// Installed: on/off, settings, tasks, check for updates, update, uninstall.
// Browse: the plugins of a source, install / update.
// Sources: add, edit and remove plugin sources.
// Install, update and uninstall run as Stash jobs; Stash reloads its plugins when they're done.

import { esc, icon, toast, errorToast, confirmDialog, fmtDate, fmtAgo } from "../ui.js";
import { t } from "../i18n.js";
import { gql, setPluginConfig } from "../api.js";
import { pokeJobs, onJobs } from "../jobs.js";
import { setQuery } from "../main.js";
import { diagnostics, offList, setOff } from "../ext.js";
import { bootPluginHost, renderPluginSettings, unmountPluginHost } from "../plugin-host.js";

const TABS = ["installed", "browse", "sources"];
const PKG = "package_id name version date sourceURL metadata requires { package_id name }";
// Suggested sources: Stash's community plugins and the source these plugins come from
const SUGGESTED = [
  { name: "Community (stashapp)", url: "https://stashapp.github.io/CommunityScripts/stable/index.yml" },
  { name: "Pepega test version", url: "https://pepegasan.github.io/stash-pmv-plugins/index.yml" },
];

// Resolves when the job has left Stash's job queue (done, failed or stopped)
function whenJobDone(id) {
  return new Promise((resolve) => {
    const started = Date.now();
    let seen = false;
    let stop = null;
    let done = false;
    stop = onJobs((jobs) => {
      if (done) return;
      const job = jobs.find((j) => String(j.id) === String(id));
      const running = job && !/FINISHED|FAILED|CANCELLED/.test(job.status);
      if (job) seen = true;
      // Very quick jobs can be over before the first look – then give up waiting after a few seconds
      if (!running && (seen || Date.now() - started > 4000)) {
        done = true;
        setTimeout(() => stop && stop());
        resolve();
      }
    });
    pokeJobs();
  });
}

export async function render(main, params, query) {
  let tab = TABS.includes(query.tab) ? query.tab : "installed";
  let alive = true;
  let busy = false;
  const state = { plugins: [], cfg: {}, packages: [], sources: [], updates: null, source: query.source || "", avail: {}, q: "", open: new Set(), sel: new Set(), srcq: {} }; // open: sources unfolded on the Sources tab; sel: "url|id" ticked there

  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Plugins")}</h1>
        <p class="kb-sub">${t("Extensions for Stash: switch them on and off, set them up, install new ones and keep them up to date.")}</p>
      </div>
      <div class="kb-head-tools"><button class="kb-btn" data-reload>${t("Reload")}</button></div>
    </header>
    <div class="kb-seg kb-ptabs" role="tablist">
      <button type="button" role="tab" data-tab="installed">${t("Installed")}</button>
      <button type="button" role="tab" data-tab="browse">${t("Browse")}</button>
      <button type="button" role="tab" data-tab="sources">${t("Sources")}</button>
    </div>
    <div class="kb-pbusy" data-busy hidden><span class="kb-spin"></span><span data-busytext></span></div>
    <section data-pane><div class="kb-loading">${t("Loading …")}</div></section>`;
  const $ = (s) => main.querySelector(s);
  const pane = $("[data-pane]");

  // ---------- Data ----------

  async function loadInstalled(withUpdates) {
    const d = await gql(`query {
      plugins { id name description version url enabled settings { name display_name description type } tasks { name description } }
      configuration { plugins general { pluginPackageSources { name url local_path } } }
      installedPackages(type: Plugin) { ${PKG}${withUpdates ? ` source_package { ${PKG} }` : ""} }
    }`);
    state.plugins = d.plugins.slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
    state.cfg = d.configuration.plugins || {};
    state.sources = d.configuration.general.pluginPackageSources || [];
    state.packages = d.installedPackages || [];
    if (withUpdates) state.updates = state.packages.filter((p) => p.source_package && p.source_package.version && p.source_package.version !== p.version);
    if (!state.source || !state.sources.some((s) => s.url === state.source)) state.source = state.sources[0] ? state.sources[0].url : "";
  }
  const pkgOf = (plugin) => state.packages.find((p) => p.package_id === plugin.id) || state.packages.find((p) => p.name === plugin.name);
  const sourceName = (url) => (state.sources.find((s) => s.url === url) || {}).name || url;
  const spec = (p) => ({ id: p.package_id, sourceURL: p.sourceURL });
  // A plugin copied into the plugins folder by hand has no package – match it by ID or name so it isn't installed twice
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const manualCopy = (pk) => state.plugins.some((p) => !pkgOf(p) && (norm(p.id) === norm(pk.package_id) || norm(p.name) === norm(pk.name)));

  // ---------- Tabs ----------

  function paint() {
    if (!alive) return;
    main.querySelectorAll("[data-tab]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.tab === tab);
      b.setAttribute("aria-selected", b.dataset.tab === tab);
    });
    if (tab === "installed") paintInstalled();
    else if (tab === "browse") paintBrowse();
    else paintSources();
  }

  function paintInstalled() {
    pane.querySelectorAll("[data-ps-mount]").forEach((el) => unmountPluginHost(el));
    const n = state.updates ? state.updates.length : 0;
    const bar = `<div class="kb-ptools">
        <button class="kb-btn" data-check${busy ? " disabled" : ""}>${icon("repeat")}${t("Check for updates")}</button>
        ${state.updates ? (n ? `<button class="kb-btn is-primary" data-updateall${busy ? " disabled" : ""}>${icon("download")}${t("Update all ({n})", { n })}</button>` : `<span class="kb-hint">${t("Everything is up to date.")}</span>`) : ""}
      </div>`;
    // Plugins with an update come first
    const hasUp = (p) => { const pk = pkgOf(p); return Boolean(pk && state.updates && state.updates.some((u) => u.package_id === pk.package_id)); };
    const cards = state.plugins.slice().sort((a, b) => Number(hasUp(b)) - Number(hasUp(a))).map((p) => pluginCard(p)).join("");
    // Packages that are installed but didn't load as a plugin (broken or incompatible)
    const loose = state.packages.filter((pk) => !state.plugins.some((p) => p.id === pk.package_id || p.name === pk.name));
    pane.innerHTML =
      bar +
      `<div class="kb-plugins" data-list>${cards}${loose.map(looseCard).join("")}</div>` +
      (!state.plugins.length && !loose.length ? `<div class="kb-empty"><b>${t("No plugins yet")}</b><p>${t("Find some under “Browse”.")}</p></div>` : "");
    mountAllSettings();
  }

  async function mountAllSettings() {
    try {
      await bootPluginHost();
    } catch (err) {
      console.error("[Stash UI] plugin host", err);
      pane.querySelectorAll("[data-ps-mount]").forEach((mount) => {
        mount.textContent = err.message || String(err);
      });
      return;
    }
    const mounts = [...pane.querySelectorAll("[data-ps-mount]")];
    await Promise.all(
      mounts.map(async (mount) => {
        if (mount.dataset.psLoading === "1" && mount._kbUnmount) return;
        mount.dataset.psLoading = "1";
        const card = mount.closest("[data-id]");
        if (!card) return;
        const id = card.dataset.id;
        const plugin = state.plugins.find((p) => p.id === id);
        try {
          await renderPluginSettings(mount, { pluginID: id, settings: (plugin && plugin.settings) || [] });
        } catch (err) {
          console.error("[Stash UI] plugin settings", err);
          mount.textContent = err.message || String(err);
        } finally {
          delete mount.dataset.psLoading;
        }
      })
    );
  }

  // What the plugin's extension module (assets/stashui.js) added to Stash UI, its last errors, and a switch for it
  function extBlock(p) {
    const d = diagnostics().find((x) => x.id === p.id);
    if (!d || !d.hasModule) return "";
    const off = offList().includes(p.id);
    const parts = [
      d.sources.length ? t("{n} list sources", { n: d.sources.length }) : "",
      d.routes.length ? t("{n} pages", { n: d.routes.length }) : "",
      d.nav.length ? t("{n} menu entries", { n: d.nav.length }) : "",
      d.slots.length ? t("{n} slots", { n: d.slots.length }) : "",
    ].filter(Boolean);
    const list = [
      ...d.sources.map((x) => [t("List source"), x.id]),
      ...d.routes.map((x) => [t("Page"), "#/p/" + p.id + "/" + x.path]),
      ...d.nav.map((x) => [t("Menu entry"), x.label]),
      ...d.slots.map((x) => [t("Slot"), x.name + (x.id !== x.name ? " · " + x.id : "")]),
    ];
    return `<details class="kb-xdiag" data-xdiag="${esc(p.id)}"${d.errors.length ? " open" : ""}><summary>${t("Stash UI extension")}${d.errors.length ? ` <span class="kb-xdiag-err">${d.errors.length}</span>` : ""}</summary>
      <div class="kb-xdiag-body">
        <label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${t("Use this extension")}</b><small>${off ? t("Switched off – takes effect after reloading the page.") : t("It adds {what} to Stash UI.", { what: parts.join(t(", ")) || t("nothing yet") })}</small></span><span class="kb-switch"><input type="checkbox" data-xon="${esc(p.id)}"${off ? "" : " checked"}><i></i></span></label>
        ${list.length ? `<ul class="kb-xdiag-list">${list.map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join("")}</ul>` : ""}
        ${d.errors.length ? `<ul class="kb-xdiag-errors">${d.errors.map((e) => `<li><b>${esc(e.where)}</b> ${esc(e.message)} <small>${esc(fmtAgo(new Date(e.at).toISOString()))}</small></li>`).join("")}</ul>` : ""}
      </div></details>`;
  }

  function pluginCard(p) {
    const pk = pkgOf(p);
    const up = pk && state.updates && state.updates.find((u) => u.package_id === pk.package_id);
    const meta = [p.version ? t("Version {v}", { v: p.version }) : "", p.id, pk ? t("from {source}", { source: sourceName(pk.sourceURL) }) : t("installed manually")].filter(Boolean).join(t(", "));
    return `<article class="kb-plugin${p.enabled ? "" : " is-off"}" data-id="${esc(p.id)}">
      <header>
        <div><h2>${esc(p.name)}</h2><small>${esc(meta)}</small></div>
        <label class="kb-switch" title="${p.enabled ? t("Turn off") : t("Turn on")}"><input type="checkbox" data-enable${p.enabled ? " checked" : ""}><i></i></label>
      </header>
      ${up ? `<div class="kb-pupdate">${icon("download")}<span>${t("Update available: {v}", { v: up.source_package.version })}</span><button class="kb-btn is-primary" data-update="${esc(pk.package_id)}"${busy ? " disabled" : ""}>${t("Update")}</button></div>` : ""}
      ${p.description ? `<p>${esc(p.description)}</p>` : ""}
      ${extBlock(p)}
      ${p.settings && p.settings.length ? `<details class="kb-plugin-set" data-ps-details open><summary>${t("Settings")}</summary><div class="kb-plugin-settings" data-ps-mount>${t("Loading …")}</div></details>` : ""}
      ${p.tasks && p.tasks.length && p.enabled ? `<details><summary>${t("Tasks")}</summary><div class="kb-ptasks">${p.tasks
        .map((x) => `<div class="kb-ptask"><div><b>${esc(x.name)}</b>${x.description ? `<small>${esc(x.description)}</small>` : ""}</div><button class="kb-btn" data-run="${esc(x.name)}">${icon("play")}${t("Run")}</button></div>`)
        .join("")}</div></details>` : ""}
      <div class="kb-pfoot">
        ${p.url ? `<a class="kb-plugin-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${t("Project page")}</a>` : ""}
        <span class="kb-spacer"></span>
        ${pk ? `<button class="kb-btn is-ghost kb-pdanger" data-uninstall="${esc(pk.package_id)}"${busy ? " disabled" : ""}>${icon("trash")}${t("Uninstall")}</button>` : ""}
      </div>
    </article>`;
  }

  function looseCard(pk) {
    return `<article class="kb-plugin is-off">
      <header><div><h2>${esc(pk.name)}</h2><small>${esc([pk.version ? t("Version {v}", { v: pk.version }) : "", pk.package_id].filter(Boolean).join(t(", ")))}</small></div></header>
      <p>${t("Installed, but Stash couldn't load it – try “Reload”, an update, or uninstall it.")}</p>
      <div class="kb-pfoot"><span class="kb-spacer"></span><button class="kb-btn is-ghost kb-pdanger" data-uninstall="${esc(pk.package_id)}"${busy ? " disabled" : ""}>${icon("trash")}${t("Uninstall")}</button></div>
    </article>`;
  }

  async function paintBrowse() {
    if (!state.sources.length) {
      pane.innerHTML = `<div class="kb-empty"><b>${t("No plugin sources yet")}</b><p>${t("Add a source first – a source is an index of plugins, like an app store.")}</p><button class="kb-btn is-primary" data-go-sources>${t("Add a source")}</button></div>`;
      return;
    }
    pane.innerHTML = `
      <div class="kb-ptools">
        <select class="kb-field" data-source aria-label="${t("Source")}">${state.sources.map((s) => `<option value="${esc(s.url)}"${s.url === state.source ? " selected" : ""}>${esc(s.name || s.url)}</option>`).join("")}</select>
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-pq placeholder="${t("Search plugins")}" value="${esc(state.q)}"></label>
      </div>
      <div data-avail><div class="kb-loading">${t("Loading …")}</div></div>`;
    const url = state.source;
    try {
      if (!state.avail[url]) state.avail[url] = (await gql(`query($s: String!) { availablePackages(type: Plugin, source: $s) { ${PKG} } }`, { s: url })).availablePackages || [];
    } catch (e) {
      if (tab === "browse" && state.source === url) pane.querySelector("[data-avail]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load this source")}</b><p>${esc(e.message)}</p></div>`;
      return;
    }
    if (tab === "browse" && state.source === url) paintAvail();
  }

  function paintAvail() {
    const box = pane.querySelector("[data-avail]");
    if (!box) return;
    const q = state.q.toLowerCase();
    const list = (state.avail[state.source] || [])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String((p.metadata || {}).description || "").toLowerCase().includes(q) || p.package_id.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = list.length
      ? `<div class="kb-plugins">${list.map(availCard).join("")}</div>`
      : `<div class="kb-empty"><b>${t("Nothing found")}</b></div>`;
  }

  function availCard(p) {
    const mine = state.packages.find((x) => x.package_id === p.package_id);
    const desc = (p.metadata || {}).description || "";
    const needs = (p.requires || []).map((r) => r.name || r.package_id);
    let action;
    if (!mine && manualCopy(p)) action = `<span class="kb-pinstalled" title="${t("Remove the manual copy from the plugins folder first to install it from here.")}">${icon("check")}${t("Installed manually")}</span>`;
    else if (!mine) action = `<button class="kb-btn is-primary" data-install="${esc(p.package_id)}"${busy ? " disabled" : ""}>${icon("download")}${t("Install")}</button>`;
    else if (mine.version !== p.version) action = `<button class="kb-btn is-primary" data-update="${esc(p.package_id)}"${busy ? " disabled" : ""}>${icon("download")}${t("Update to {v}", { v: p.version })}</button>`;
    else action = `<span class="kb-pinstalled">${icon("check")}${t("Installed")}</span>`;
    return `<article class="kb-plugin kb-pkg" data-pkg="${esc(p.package_id)}">
      <header><div><h2>${esc(p.name)}</h2><small>${esc([p.version ? t("Version {v}", { v: p.version }) : "", p.date ? fmtDate(p.date) : "", p.package_id].filter(Boolean).join(t(", ")))}</small></div></header>
      ${desc ? `<p>${esc(desc)}</p>` : ""}
      ${needs.length ? `<p class="kb-hint">${esc(t("Needs: {list}", { list: needs.join(t(", ")) }))}</p>` : ""}
      <div class="kb-pfoot"><span class="kb-spacer"></span>${action}</div>
    </article>`;
  }

  function paintSources() {
    const missing = SUGGESTED.filter((s) => !state.sources.some((x) => x.url === s.url));
    pane.innerHTML = `
      <div class="kb-card kb-psources">
        <h2>${t("Plugin sources")}</h2>
        <p>${t("A source is an index of plugins (an index.yml URL). Plugins from all sources show up under “Browse”.")}</p>
        <div class="kb-srclist">${
          state.sources.length
            ? state.sources
                .map((s, i) => `<div class="kb-srcitem${state.open.has(s.url) ? " is-open" : ""}" data-i="${i}">
                <div class="kb-srcrow">
                  <button type="button" class="kb-srccaret" data-srcopen="${i}" aria-expanded="${state.open.has(s.url)}" title="${t("Show the plugins in this source")}"><i></i></button>
                  <div data-srcopen="${i}" class="kb-srcname"><b>${esc(s.name || s.url)}</b><small>${esc(s.url)}${s.local_path ? " · " + esc(s.local_path) : ""}</small></div>
                  <button class="kb-btn is-ghost" data-srcedit="${i}">${icon("edit")}${t("Edit")}</button>
                  <button class="kb-btn is-ghost kb-pdanger" data-srcdel="${i}">${icon("trash")}${t("Remove")}</button>
                </div>
                <div class="kb-srcpkgs" data-srcpkgs="${i}"${state.open.has(s.url) ? "" : " hidden"}></div></div>`)
                .join("")
            : `<p class="kb-hint">${t("No sources yet.")}</p>`
        }</div>
        <form class="kb-srcform" data-srcform>
          <h3 data-formtitle>${t("Add a source")}</h3>
          <label class="kb-form-row"><span>${t("Name")}</span><input class="kb-field" name="name" placeholder="${t("e.g. Community")}" spellcheck="false"></label>
          <label class="kb-form-row"><span>${t("URL of the index.yml")}</span><input class="kb-field" name="url" type="url" required placeholder="https://…/index.yml" spellcheck="false"></label>
          <label class="kb-form-row"><span>${t("Subfolder (optional)")}</span><input class="kb-field" name="local_path" placeholder="${t("Folder inside the plugins folder – empty = automatic")}" spellcheck="false"></label>
          <input type="hidden" name="index" value="">
          <div class="kb-actions"><button type="button" class="kb-btn" data-srccancel hidden>${t("Cancel")}</button><button type="submit" class="kb-btn is-primary" data-srcsave>${t("Add")}</button></div>
        </form>
        ${missing.length ? `<div class="kb-srcsuggest"><span class="kb-hint">${t("Suggested:")}</span>${missing.map((s) => `<button class="kb-chip" data-suggest="${esc(s.url)}">${icon("plus")}${esc(s.name)}</button>`).join("")}</div>` : ""}
      </div>`;
    state.sources.forEach((s) => state.open.has(s.url) && fillSourcePkgs(s));
  }

  // The plugins inside one source (unfolded on the Sources tab): tick several and install them together, or one by one
  async function fillSourcePkgs(s) {
    const box = pane.querySelector(`[data-srcpkgs="${state.sources.indexOf(s)}"]`);
    if (!box) return;
    if (!state.avail[s.url]) {
      box.innerHTML = `<div class="kb-loading">${t("Loading …")}</div>`;
      try {
        state.avail[s.url] = (await gql(`query($s: String!) { availablePackages(type: Plugin, source: $s) { ${PKG} } }`, { s: s.url })).availablePackages || [];
      } catch (e) {
        if (tab === "sources" && box.isConnected) box.innerHTML = `<p class="kb-hint">${t("Couldn't load this source")}: ${esc(e.message)}</p>`;
        return;
      }
    }
    if (tab !== "sources" || !box.isConnected) return;
    const q = (state.srcq[s.url] || "").toLowerCase();
    const all = state.avail[s.url].slice().sort((a, b) => a.name.localeCompare(b.name));
    const list = all.filter((p) => !q || p.name.toLowerCase().includes(q) || String((p.metadata || {}).description || "").toLowerCase().includes(q) || p.package_id.toLowerCase().includes(q));
    const free = (p) => !state.packages.some((x) => x.package_id === p.package_id) && !manualCopy(p); // can be installed
    const key = (p) => s.url + "|" + p.package_id;
    const ticked = all.filter((p) => state.sel.has(key(p)) && free(p));
    box.innerHTML = `<div class="kb-srcpkgs-bar">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-srcq="${esc(s.url)}" placeholder="${t("Search plugins")}" value="${esc(state.srcq[s.url] || "")}"></label>
        <span class="kb-hint">${t("{n} plugins", { n: all.length })}</span><span class="kb-spacer"></span>
        <button class="kb-btn is-ghost" data-selall="${esc(s.url)}"${all.some(free) ? "" : " disabled"}>${t("Select all not installed")}</button>
        <button class="kb-btn is-primary" data-installsel="${esc(s.url)}"${ticked.length && !busy ? "" : " disabled"}>${icon("download")}${t("Install selected ({n})", { n: ticked.length })}</button>
      </div>
      ${list.length ? list.map((p) => srcPkgRow(s, p, free(p), key(p))).join("") : `<p class="kb-hint">${t("Nothing found")}</p>`}`;
  }
  function srcPkgRow(s, p, free, key) {
    const mine = state.packages.find((x) => x.package_id === p.package_id);
    const desc = (p.metadata || {}).description || "";
    const needs = (p.requires || []).map((r) => r.name || r.package_id);
    let action;
    if (!mine && manualCopy(p)) action = `<span class="kb-pinstalled" title="${t("Remove the manual copy from the plugins folder first to install it from here.")}">${icon("check")}${t("Installed manually")}</span>`;
    else if (!mine) action = `<button class="kb-btn" data-install="${esc(p.package_id)}" data-src="${esc(s.url)}"${busy ? " disabled" : ""}>${icon("download")}${t("Install")}</button>`;
    else if (mine.version !== p.version) action = `<button class="kb-btn is-primary" data-update="${esc(p.package_id)}"${busy ? " disabled" : ""}>${t("Update to {v}", { v: p.version })}</button>`;
    else action = `<span class="kb-pinstalled">${icon("check")}${t("Installed")}</span>`;
    return `<div class="kb-srcpkg${free ? "" : " is-have"}">
      <input type="checkbox" data-pkgsel="${esc(key)}" ${free ? "" : "disabled"}${state.sel.has(key) && free ? " checked" : ""} aria-label="${esc(p.name)}">
      <span><b>${esc(p.name)}</b><small>${esc([p.version ? t("Version {v}", { v: p.version }) : "", p.date ? fmtDate(p.date) : "", p.package_id].filter(Boolean).join(t(", ")))}</small>${desc ? `<em>${esc(desc)}</em>` : ""}${needs.length ? `<small>${esc(t("Needs: {list}", { list: needs.join(t(", ")) }))}</small>` : ""}</span>
      ${action}</div>`;
  }

  // ---------- Actions ----------

  function setBusy(text) {
    busy = !!text;
    $("[data-busy]").hidden = !busy;
    $("[data-busytext]").textContent = text || "";
    paint();
  }

  async function runJob(kind, specs, names) {
    if (busy || !specs.length) return;
    const call = {
      install: ["installPackages", "[PackageSpecInput!]!", t("Installing {what} …")],
      update: ["updatePackages", "[PackageSpecInput!]", t("Updating {what} …")],
      uninstall: ["uninstallPackages", "[PackageSpecInput!]!", t("Uninstalling {what} …")],
    }[kind];
    const what = names.length === 1 ? names[0] : t("{n} plugins", { n: names.length });
    try {
      const d = await gql(`mutation($p: ${call[1]}) { job: ${call[0]}(type: Plugin, packages: $p) }`, { p: specs });
      setBusy(call[2].replace("{what}", what));
      await whenJobDone(d.job);
      state.avail = {}; // versions may have changed
      await loadInstalled(!!state.updates);
      window.dispatchEvent(new Event("stash:plugins-changed")); // menu entries (Media Storm, PMV Generator)
      // The job list already says "Done" – only Stash UI itself needs a hint
      if (kind !== "uninstall" && specs.some((s) => s.id === "pepega-stashui")) toast(t("Stash UI was updated – reload the page to use the new version."), "ok");
    } catch (e) {
      errorToast(e, "Plugin");
    } finally {
      if (alive) setBusy("");
    }
  }

  async function saveSources(list) {
    await gql(`mutation($i: ConfigGeneralInput!) { configureGeneral(input: $i) { pluginPackageSources { url } } }`, {
      i: { pluginPackageSources: list.map((s) => ({ name: s.name || null, url: s.url, local_path: s.local_path || null })) },
    });
    state.sources = list;
    state.avail = {};
    if (!list.some((s) => s.url === state.source)) state.source = list[0] ? list[0].url : "";
  }

  main.addEventListener("click", async (e) => {
    const tb = e.target.closest("[data-tab]");
    if (tb) {
      tab = tb.dataset.tab;
      setQuery({ tab: tab === "installed" ? "" : tab });
      return paint();
    }
    if (e.target.closest("[data-go-sources]")) {
      tab = "sources";
      setQuery({ tab });
      return paint();
    }
    if (e.target.closest("[data-reload]")) {
      try {
        await gql(`mutation { reloadPlugins }`);
        await loadInstalled(!!state.updates);
        window.dispatchEvent(new Event("stash:plugins-changed"));
        toast(t("Plugins reloaded"), "ok");
        paint();
      } catch (err) {
        errorToast(err, "Reload");
      }
      return;
    }
    const so = e.target.closest("[data-srcopen]");
    if (so) {
      const s = state.sources[Number(so.dataset.srcopen)];
      state.open.has(s.url) ? state.open.delete(s.url) : state.open.add(s.url);
      const item = so.closest(".kb-srcitem");
      item.classList.toggle("is-open", state.open.has(s.url));
      item.querySelector(".kb-srccaret").setAttribute("aria-expanded", state.open.has(s.url));
      item.querySelector("[data-srcpkgs]").hidden = !state.open.has(s.url);
      if (state.open.has(s.url)) fillSourcePkgs(s);
      return;
    }
    if (busy) return;
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.matches("[data-check]")) {
        b.disabled = true;
        b.innerHTML = `<span class="kb-spin"></span>${t("Checking …")}`;
        await loadInstalled(true);
        const n = state.updates.length;
        toast(n === 1 ? t("1 update available") : n ? t("{n} updates available", { n }) : t("Everything is up to date."), "ok");
        return paint();
      }
      if (b.matches("[data-updateall]")) return runJob("update", state.updates.map(spec), state.updates.map((p) => p.name));
      if (b.dataset.update) {
        const pk = state.packages.find((p) => p.package_id === b.dataset.update);
        return pk && runJob("update", [spec(pk)], [pk.name]);
      }
      if (b.dataset.install) {
        const url = b.dataset.src || state.source; // (from a source unfolded on the Sources tab, or from Browse)
        const pk = (state.avail[url] || []).find((p) => p.package_id === b.dataset.install);
        return pk && runJob("install", [{ id: pk.package_id, sourceURL: url }], [pk.name]);
      }
      if (b.dataset.installsel) {
        const url = b.dataset.installsel;
        const picked = (state.avail[url] || []).filter((p) => state.sel.has(url + "|" + p.package_id) && !state.packages.some((x) => x.package_id === p.package_id) && !manualCopy(p));
        picked.forEach((p) => state.sel.delete(url + "|" + p.package_id));
        return runJob("install", picked.map((p) => ({ id: p.package_id, sourceURL: url })), picked.map((p) => p.name));
      }
      if (b.dataset.selall) {
        const url = b.dataset.selall;
        (state.avail[url] || []).filter((p) => !state.packages.some((x) => x.package_id === p.package_id) && !manualCopy(p)).forEach((p) => state.sel.add(url + "|" + p.package_id));
        return fillSourcePkgs(state.sources.find((s) => s.url === url));
      }
      if (b.dataset.uninstall) {
        const pk = state.packages.find((p) => p.package_id === b.dataset.uninstall);
        if (!pk) return;
        const r = await confirmDialog({ title: t("Uninstall “{name}”?", { name: pk.name }), text: t("The plugin is removed from Stash. You can install it again from its source at any time."), ok: t("Uninstall"), danger: true });
        if (r.ok) runJob("uninstall", [spec(pk)], [pk.name]);
        return;
      }
      // Sources
      if (b.dataset.suggest) {
        const s = SUGGESTED.find((x) => x.url === b.dataset.suggest);
        await saveSources([...state.sources, { name: s.name, url: s.url }]);
        toast(t("Source added"), "ok");
        return paint();
      }
      if (b.dataset.srcdel != null) {
        const s = state.sources[Number(b.dataset.srcdel)];
        const r = await confirmDialog({ title: t("Remove the source “{name}”?", { name: s.name || s.url }), text: t("Plugins you installed from it stay installed."), ok: t("Remove"), danger: true });
        if (!r.ok) return;
        await saveSources(state.sources.filter((x) => x !== s));
        toast(t("Source removed"), "ok");
        return paint();
      }
      if (b.dataset.srcedit != null) {
        const s = state.sources[Number(b.dataset.srcedit)];
        const f = pane.querySelector("[data-srcform]");
        f.name.value = s.name || "";
        f.url.value = s.url;
        f.local_path.value = s.local_path || "";
        f.index.value = b.dataset.srcedit;
        pane.querySelector("[data-formtitle]").textContent = t("Edit source");
        pane.querySelector("[data-srcsave]").textContent = t("Save");
        pane.querySelector("[data-srccancel]").hidden = false;
        f.name.focus();
        return;
      }
      if (b.matches("[data-srccancel]")) return paintSources();
    } catch (err) {
      errorToast(err, "Plugin");
      paint();
    }
  });

  main.addEventListener("toggle", (e) => {
    const details = e.target.closest && e.target.closest("[data-ps-details]");
    if (!details || !details.open) return;
    const mount = details.querySelector("[data-ps-mount]");
    if (!mount || mount._kbUnmount || mount.childElementCount > 0) return;
    mountAllSettings();
  });

  main.addEventListener("submit", async (e) => {
    const f = e.target.closest("form");
    if (!f || f.closest("[data-ps-mount]")) return;
    e.preventDefault();
    if (f.matches("[data-srcform]")) {
      const entry = { name: f.name.value.trim(), url: f.url.value.trim(), local_path: f.local_path.value.trim() };
      const i = f.index.value === "" ? -1 : Number(f.index.value);
      if (state.sources.some((s, k) => s.url === entry.url && k !== i)) return toast(t("This source is already there"), "error");
      try {
        await saveSources(i < 0 ? [...state.sources, entry] : state.sources.map((s, k) => (k === i ? entry : s)));
        toast(i < 0 ? t("Source added") : t("Source saved"), "ok");
        paintSources();
      } catch (err) {
        errorToast(err, "Save");
      }
      return;
    }
    // Plugin settings
    const id = f.closest("[data-id]").dataset.id;
    const input = {};
    f.querySelectorAll("[data-ps]").forEach((el) => {
      const type = el.dataset.pt;
      if (type === "b") input[el.dataset.ps] = el.checked;
      else if (type === "n") {
        if (el.value !== "") input[el.dataset.ps] = Number(el.value);
      } else if (el.value !== "") input[el.dataset.ps] = el.value;
    });
    try {
      // only the settings on this form – whatever else the plugin keeps there stays
      const cleared = {};
      f.querySelectorAll("[data-ps]").forEach((el) => !(el.dataset.ps in input) && (cleared[el.dataset.ps] = undefined));
      state.cfg[id] = await setPluginConfig(id, Object.assign(cleared, input));
      toast(t("Plugin settings saved"), "ok");
    } catch (err) {
      errorToast(err, "Save");
    }
  });

  main.addEventListener("input", (e) => {
    const q = e.target.closest("[data-srcq]");
    if (!q) return;
    state.srcq[q.dataset.srcq] = q.value;
    clearTimeout(q._t);
    q._t = setTimeout(() => {
      const s = state.sources.find((x) => x.url === q.dataset.srcq);
      if (s) fillSourcePkgs(s).then(() => pane.querySelector(`[data-srcq="${CSS.escape(s.url)}"]`)?.focus());
    }, 180);
  });
  main.addEventListener("change", async (e) => {
    const pk = e.target.closest("[data-pkgsel]");
    if (pk) {
      pk.checked ? state.sel.add(pk.dataset.pkgsel) : state.sel.delete(pk.dataset.pkgsel);
      const s = state.sources.find((x) => pk.dataset.pkgsel.startsWith(x.url + "|"));
      return s && fillSourcePkgs(s);
    }
    const src = e.target.closest("[data-source]");
    if (src) {
      state.source = src.value;
      setQuery({ source: state.source });
      return paintBrowse();
    }
    const en = e.target.closest("[data-enable]");
    if (!en) return;
    const id = en.closest("[data-id]").dataset.id;
    try {
      await gql(`mutation($m: BoolMap!) { setPluginsEnabled(enabledMap: $m) }`, { m: { [id]: en.checked } });
      const p = state.plugins.find((x) => x.id === id);
      if (p) p.enabled = en.checked;
      window.dispatchEvent(new Event("stash:plugins-changed"));
      toast(en.checked ? t("Turned on – takes effect after reloading the page") : t("Turned off – takes effect after reloading the page"), "ok");
      en.closest("[data-id]").classList.toggle("is-off", !en.checked);
    } catch (err) {
      en.checked = !en.checked;
      errorToast(err, "Plugin");
    }
  });

  main.addEventListener("input", (e) => {
    if (!e.target.matches("[data-pq]")) return;
    state.q = e.target.value.trim();
    paintAvail();
  });

  main.addEventListener("change", (e) => {
    const x = e.target.closest("[data-xon]");
    if (!x) return;
    setOff(x.dataset.xon, !x.checked);
    toast(x.checked ? t("The extension is on again after reloading the page.") : t("The extension is off after reloading the page."), "ok");
    repaintExt();
  });
  // (the lists, pages and errors a module registered can arrive after the page was drawn)
  function repaintExt() {
    if (!alive) return;
    main.querySelectorAll("[data-id]").forEach((card) => {
      const p = state.plugins.find((x) => x.id === card.dataset.id);
      const old = card.querySelector("[data-xdiag]");
      if (!p) return;
      const open = old ? old.open : false;
      const tpl = document.createElement("template");
      tpl.innerHTML = extBlock(p);
      const fresh = tpl.content.firstElementChild;
      if (fresh && open) fresh.open = true;
      if (old && fresh) old.replaceWith(fresh);
      else if (old && !fresh) old.remove();
      else if (fresh) card.querySelector("header").insertAdjacentElement("afterend", fresh);
    });
  }
  window.addEventListener("stash:ext-changed", repaintExt);
  main.addEventListener("click", async (e) => {
    const r = e.target.closest("[data-run]");
    if (!r) return;
    const id = r.closest("[data-id]").dataset.id;
    try {
      await gql(`mutation($id: ID!, $t: String!) { runPluginTask(plugin_id: $id, task_name: $t) }`, { id, t: r.dataset.run });
      toast(t("“{name}” started", { name: r.dataset.run }), "ok");
      pokeJobs();
    } catch (err) {
      errorToast(err, "Plugin task");
    }
  });

  try {
    await loadInstalled(false);
  } catch (e) {
    pane.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the plugins")}</b><p>${esc(e.message)}</p></div>`;
    return () => (alive = false);
  }
  paint();
  // Opened from the menu (Extensions): show that plugin's card unfolded – settings and tasks
  if (query.focus && tab === "installed") {
    const card = [...main.querySelectorAll("[data-id]")].find((c) => c.dataset.id === query.focus);
    if (card) {
      card.querySelectorAll("details").forEach((d) => (d.open = true));
      card.scrollIntoView({ block: "center" });
      card.classList.add("is-found");
      setTimeout(() => card.classList.remove("is-found"), 2400);
    }
  }
  return () => {
    alive = false;
    window.removeEventListener("stash:ext-changed", repaintExt);
  };
}
