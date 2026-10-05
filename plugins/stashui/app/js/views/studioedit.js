// Make or edit a studio: logo (upload, link, paste, drop), name, aliases, links, details, parent studio, tags –
// and fill it in from StashDB-style boxes or the installed studio scrapers, by name or by link.
// Which fields exist depends on the Stash version, so the form asks Stash first.

import { esc, icon, errorToast, toast, confirmDialog, promptDialog, openDrawer } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { tagPicker } from "./tagpicker.js";
import { studioPicker, studiosCache } from "./studiopicker.js";

// What this Stash knows: fields of the studio, of its update, of a scraped studio
let schema = null;
async function loadSchema() {
  if (schema) return schema;
  const d = await gql(`query StudioSchema {
    u: __type(name: "StudioUpdateInput") { inputFields { name } }
    o: __type(name: "Studio") { fields { name } }
    s: __type(name: "ScrapedStudio") { fields { name } }
  }`);
  const names = (x, k) => new Set(((x && x[k]) || []).map((f) => f.name));
  schema = { input: names(d.u, "inputFields"), output: names(d.o, "fields"), scraped: names(d.s, "fields") };
  return schema;
}

async function loadSources() {
  const d = await gql(`query StudioSources {
    listScrapers(types: [STUDIO]) { id name studio { supported_scrapes } }
    configuration { general { stashBoxes { endpoint name } } }
  }`);
  const boxes = (d.configuration.general.stashBoxes || []).map((b, i) => ({ id: "box" + i, name: b.name || b.endpoint, box: b.endpoint }));
  const scrapers = (d.listScrapers || []).filter((s) => ((s.studio || {}).supported_scrapes || []).includes("NAME")).map((s) => ({ id: s.id, name: s.name, scraper: s.id }));
  const byUrl = (d.listScrapers || []).some((s) => ((s.studio || {}).supported_scrapes || []).includes("URL"));
  return { list: [...boxes, ...scrapers], byUrl };
}

const list = (v) => (Array.isArray(v) ? v : String(v || "").split(/\s*[,;]\s*/)).map((x) => String(x).trim()).filter(Boolean);

// id: an existing studio – or null to make a new one (opts.name = what the name field starts with).
// opts: { onSaved(id), onDeleted(), scrape: true = open with the search already running }
export async function openStudioEditor(id, opts = {}) {
  let sch, p, sources;
  try {
    sch = await loadSchema();
    sources = await loadSources().catch(() => ({ list: [], byUrl: false }));
    if (id) {
      const urlField = sch.output.has("urls") ? "urls" : "url";
      const d = await gql(`query($id: ID!) { findStudio(id: $id) { id name ${urlField} details aliases image_path parent_studio { id name } tags { id name }${sch.output.has("stash_ids") ? " stash_ids { endpoint stash_id }" : ""} } }`, { id });
      p = d.findStudio;
      if (p && !p.urls) p.urls = p.url ? [p.url] : [];
    } else {
      p = { id: null, name: opts.name || "", urls: [], details: "", aliases: [], image_path: "", parent_studio: null, tags: [] };
    }
    if (!p) throw new Error(t("Studio not found"));
  } catch (e) {
    errorToast(e, "Edit studio");
    return;
  }
  const hasLogo = !!p.image_path && !/default=true/.test(p.image_path);
  let image; // undefined = unchanged, null = remove, string = new (link or data: URL)
  let stashIds = (p.stash_ids || []).map((s) => ({ endpoint: s.endpoint, stash_id: s.stash_id }));

  const d = openDrawer({
    title: id ? t("Edit studio") : t("New studio"),
    body: `
      <section class="kb-pe-photo">
        <div class="kb-pe-img" data-drop title="${t("Drop or paste a picture here")}"><img alt="" data-img src="${hasLogo ? esc(p.image_path) : ""}"${hasLogo ? "" : ' class="is-empty"'}></div>
        <div class="kb-pe-photo-tools">
          <b>${t("Logo")}</b>
          <button type="button" class="kb-btn" data-upload>${icon("camera")}${t("Upload")}</button>
          <button type="button" class="kb-btn" data-imglink>${t("From a link")}</button>
          <button type="button" class="kb-btn is-ghost kb-pdanger" data-imgdel${hasLogo ? "" : " hidden"}>${icon("trash")}${t("Remove")}</button>
          <small class="kb-hint">${t("Or drop / paste a picture onto it.")}</small>
          <input type="file" accept="image/*" data-file hidden>
        </div>
        <div class="kb-pe-choices" data-choices hidden></div>
      </section>
      <section class="kb-pe-scrape">
        <b>${t("Fill in from the internet")}</b>
        ${
          sources.list.length || sources.byUrl
            ? `<div class="kb-pe-scrapebar">
                ${sources.list.length ? `<select class="kb-field" data-src>${sources.list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>` : ""}
                <input class="kb-field" data-sq value="${esc(p.name)}" placeholder="${esc(sources.list.length ? t("Name or link") : t("Link"))}">
                <button type="button" class="kb-btn is-primary" data-sgo>${icon("search")}${t("Search")}</button>
              </div>
              <label class="kb-check"><input type="checkbox" data-over> ${t("Also replace fields that already have a value")}</label>
              <div class="kb-pe-results" data-sres></div>`
            : `<p class="kb-hint">${t("No studio scraper or StashDB set up yet. Add them in classic Stash → Settings → Metadata Providers.")}</p>`
        }
      </section>
      <section><div class="kb-pe-grid">
        <label class="kb-form-row is-wide"><span>${t("Name")}</span><input class="kb-field" data-f="name" value="${esc(p.name)}"></label>
        <label class="kb-form-row is-wide"><span>${t("Aliases (comma separated)")}</span><input class="kb-field" data-f="aliases" value="${esc((p.aliases || []).join(", "))}"></label>
        <div class="kb-form-row is-wide"><span>${t("Parent studio")}</span><div class="kb-tagpick" data-parent></div></div>
        <label class="kb-form-row is-wide"><span>${t("Links (one per line)")}</span><textarea class="kb-field" data-f="urls" rows="3">${esc((p.urls || []).join("\n"))}</textarea></label>
        <label class="kb-form-row is-wide"><span>${t("Details")}</span><textarea class="kb-field" data-f="details" rows="5">${esc(p.details || "")}</textarea></label>
      </div></section>
      <section><h3 class="kb-pe-h">${t("Tags")}</h3><div data-tags></div></section>
      ${stashIds.length ? `<p class="kb-hint">${t("Linked to {list}", { list: stashIds.map((s) => esc(s.endpoint.replace(/^https?:\/\//, "").split("/")[0])).join(", ") })}</p>` : ""}`,
    foot: `${id ? `<button class="kb-btn is-danger" data-del>${t("Delete studio")}</button>` : ""}<span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
  });
  const el = d.el;
  el.classList.add("kb-pe", "kb-pe-studio");
  const $ = (s) => el.querySelector(s);
  const picker = tagPicker($("[data-tags]"), { include: p.tags.map((x) => x.id), allowCreate: true, placeholder: t("Search or create a tag") });
  const parent = studioPicker($("[data-parent]"), {
    include: p.parent_studio ? [p.parent_studio.id] : [],
    names: p.parent_studio ? { [p.parent_studio.id]: p.parent_studio.name } : {},
    placeholder: t("Search studio"),
    exclude: id ? [id] : [], // a studio can't be its own parent
  });

  // ---- Logo
  const setImage = (v) => {
    image = v;
    $("[data-img]").src = v === null ? "" : v;
    $("[data-img]").classList.toggle("is-empty", v === null);
    $("[data-imgdel]").hidden = v === null;
  };
  const readFile = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  const takeFile = async (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    setImage(await readFile(file));
  };
  $("[data-upload]").onclick = () => $("[data-file]").click();
  $("[data-file]").onchange = (e) => takeFile(e.target.files[0]);
  $("[data-imglink]").onclick = async () => {
    const u = await promptDialog({ title: t("Logo from a link"), label: t("Address of the picture"), ok: t("Use") });
    if (u && /^https?:\/\//i.test(u.trim())) setImage(u.trim());
  };
  $("[data-imgdel]").onclick = () => setImage(null);
  const drop = $("[data-drop]");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type));
    if (f) takeFile(f);
    else {
      const u = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (/^https?:\/\//i.test(u)) setImage(u.trim());
    }
  });
  el.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData.files || [])].find((x) => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    takeFile(f);
  });

  // ---- Scraping
  const SCRAPED = ["stored_id", "name", "url", "urls", "details", "aliases", "image", "remote_site_id"].filter((k) => sch.scraped.has(k)).join(" ");
  const SF = `${SCRAPED}${sch.scraped.has("parent") ? " parent { stored_id name }" : ""}${sch.scraped.has("tags") ? " tags { stored_id name }" : ""}`;
  const srcOf = () => sources.list.find((s) => s.id === ($("[data-src]") || {}).value);
  const sourceInput = (s) => (s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper });
  const linksOf = (x) => [...new Set([...(x.urls || []), x.url].filter(Boolean))];
  let results = [];

  async function search() {
    const q = $("[data-sq]").value.trim();
    const out = $("[data-sres]");
    if (!q) return;
    out.innerHTML = `<p class="kb-hint">${t("Searching …")}</p>`;
    try {
      if (/^https?:\/\//i.test(q)) {
        const r = await gql(`query($u: String!) { scrapeStudioURL(url: $u) { ${SF} } }`, { u: q });
        if (!r.scrapeStudioURL) throw new Error(t("No scraper knows this link"));
        out.innerHTML = "";
        return apply(r.scrapeStudioURL, null);
      }
      const s = srcOf();
      if (!s) throw new Error(t("Choose a source, or paste a link"));
      const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSingleStudioInput!) { scrapeSingleStudio(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: { query: q } });
      results = r.scrapeSingleStudio || [];
      out.innerHTML = results.length
        ? results
            .slice(0, 25)
            .map((x, i) => {
              const sub = (linksOf(x)[0] || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
              return `<button type="button" class="kb-pe-hit" data-hit="${i}">${x.image ? `<img alt="" src="${esc(x.image)}">` : `<span class="kb-pe-noimg">${icon("studio")}</span>`}<span><b>${esc(x.name || "?")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
            })
            .join("")
        : `<p class="kb-hint">${t("Nothing found. Try another spelling or another source.")}</p>`;
    } catch (e) {
      out.innerHTML = `<p class="kb-hint kb-pe-err">${esc(e.message)}</p>`;
    }
  }
  $("[data-sgo]") && ($("[data-sgo]").onclick = search);
  $("[data-sq]") && $("[data-sq]").addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), search()));
  $("[data-sres]") &&
    $("[data-sres]").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-hit]");
      if (!b) return;
      const s = srcOf();
      let x = results[Number(b.dataset.hit)];
      // A scraper answers a name search with names and links – the chosen one is fetched in full from its link
      const link = linksOf(x)[0];
      if (s && !s.box && link) {
        b.classList.add("is-busy");
        try {
          const r = await gql(`query($u: String!) { scrapeStudioURL(url: $u) { ${SF} } }`, { u: link });
          x = r.scrapeStudioURL || x;
        } catch (err) {
          /* the search hit itself will do */
        }
      }
      $("[data-sres]").innerHTML = "";
      apply(x, s);
    });

  function apply(x, s) {
    const over = $("[data-over]") && $("[data-over]").checked;
    let n = 0;
    el.querySelectorAll(".is-scraped").forEach((r) => r.classList.remove("is-scraped"));
    const put = (k, v) => {
      const ctl = el.querySelector(`[data-f="${k}"]`);
      if (!v || !ctl || (ctl.value && !over) || ctl.value === v) return;
      ctl.value = v;
      ctl.closest(".kb-form-row").classList.add("is-scraped");
      n++;
    };
    put("name", x.name);
    put("aliases", list(x.aliases).join(", "));
    put("urls", linksOf(x).join("\n"));
    put("details", x.details);
    // Parent and tags Stash already knows
    if (x.parent && x.parent.stored_id && (!parent.include.length || over)) {
      parent.set([x.parent.stored_id]);
      n++;
    }
    const known = (x.tags || []).filter((tg) => tg.stored_id).map((tg) => tg.stored_id);
    if (known.length) picker.set([...new Set([...picker.include, ...known])]);
    // The logo: taken when there's none yet (or replacing is on)
    if (x.image && ((!hasLogo && image === undefined) || over)) {
      setImage(x.image);
      n++;
    }
    // A StashDB-style box: remember the link, so Stash knows which studio this is
    if (s && s.box && x.remote_site_id && sch.input.has("stash_ids") && !stashIds.some((q) => q.endpoint === s.box)) stashIds.push({ endpoint: s.box, stash_id: x.remote_site_id });
    toast(n ? t("{n} fields filled in – check them and save", { n }) : t("Nothing new – every field already has a value"), n ? "ok" : undefined);
  }

  // ---- Save / delete
  $("[data-cancel]").onclick = d.close;
  $("[data-save]").onclick = async () => {
    const v = (k) => $(`[data-f="${k}"]`).value.trim();
    const input = { name: v("name"), details: v("details"), aliases: list(v("aliases")), parent_id: parent.include[0] || null, tag_ids: picker.include };
    if (!input.name) return toast(t("The name can't be empty"), "error");
    const links = v("urls").split(/\n+/).map((u) => u.trim()).filter(Boolean);
    if (sch.input.has("urls")) input.urls = links;
    else input.url = links[0] || "";
    if (image !== undefined) input.image = image;
    if (sch.input.has("stash_ids")) input.stash_ids = stashIds;
    if (id) input.id = id;
    const btn = $("[data-save]");
    btn.disabled = true;
    try {
      const m = id ? `mutation($i: StudioUpdateInput!) { studioUpdate(input: $i) { id } }` : `mutation($i: StudioCreateInput!) { studioCreate(input: $i) { id } }`;
      const r = await gql(m, { i: input });
      studiosCache(true);
      toast(id ? t("Studio saved") : t("Studio created"), "ok");
      d.close();
      opts.onSaved && opts.onSaved((r.studioUpdate || r.studioCreate || {}).id || id);
    } catch (e) {
      btn.disabled = false;
      errorToast(e, "Save");
    }
  };
  if ($("[data-del]"))
    $("[data-del]").onclick = async () => {
      const r = await confirmDialog({ title: t("Delete studio “{name}”?", { name: p.name }), text: t("The studio is removed from all scenes, images and galleries. The items themselves stay."), ok: t("Delete"), danger: true });
      if (!r.ok) return;
      try {
        await gql(`mutation($id: ID!) { studioDestroy(input: { id: $id }) }`, { id });
        studiosCache(true);
        d.close();
        toast(t("Studio deleted"), "ok");
        opts.onDeleted && opts.onDeleted();
      } catch (e) {
        errorToast(e, "Delete");
      }
    };
  if (opts.scrape && $("[data-sgo]")) search();
}

// Quick: just a name (from the studio picker) – the studio exists right away
export async function createStudio(name) {
  const d = await gql(`mutation($i: StudioCreateInput!) { studioCreate(input: $i) { id name } }`, { i: { name } });
  studiosCache(true);
  return d.studioCreate;
}
