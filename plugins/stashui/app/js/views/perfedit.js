// Edit a performer completely: photo (upload, link, paste, drop), every field, tags – and fill it all in
// from StashDB-style boxes or the installed performer scrapers (FreeOnes …), by name or by profile link.
// Which fields exist depends on the Stash version, so the form asks Stash first.

import { esc, icon, errorToast, toast, confirmDialog, promptDialog, openDrawer } from "../ui.js";
import { t } from "../i18n.js";
import { gql, updatePerformer } from "../api.js";
import { tagPicker } from "./tagpicker.js";
import { GENDERS } from "./performers.js";

const FIELDS = [
  { k: "name", label: "Name", group: 1, wide: true },
  { k: "disambiguation", label: "Disambiguation", group: 1 },
  { k: "alias_list", label: "Aliases (comma separated)", group: 1, type: "list", from: "aliases" },
  { k: "gender", label: "Gender", group: 1, type: "gender" },
  { k: "country", label: "Country", group: 1, hint: "US, DE, JP …" },
  { k: "birthdate", label: "Birthdate", group: 1, type: "date" },
  { k: "death_date", label: "Death date", group: 1, type: "date" },
  { k: "ethnicity", label: "Ethnicity", group: 2 },
  { k: "hair_color", label: "Hair", group: 2 },
  { k: "eye_color", label: "Eyes", group: 2 },
  { k: "height_cm", label: "Height (cm)", group: 2, type: "int", from: "height" },
  { k: "weight", label: "Weight (kg)", group: 2, type: "int" },
  { k: "measurements", label: "Measurements", group: 2 },
  { k: "fake_tits", label: "Fake tits", group: 2 },
  { k: "penis_length", label: "Penis length (cm)", group: 2, type: "float" },
  { k: "circumcised", label: "Circumcised", group: 2, type: "circ" },
  { k: "tattoos", label: "Tattoos", group: 2, wide: true },
  { k: "piercings", label: "Piercings", group: 2, wide: true },
  { k: "career_start", label: "Career start", group: 3 },
  { k: "career_end", label: "Career end", group: 3 },
  { k: "career_length", label: "Career", group: 3 },
  { k: "urls", label: "Links (one per line)", group: 3, type: "lines", wide: true },
  { k: "details", label: "Details", group: 4, type: "text", wide: true },
];
const GROUPS = [
  [1, "Basics"],
  [2, "Looks"],
  [3, "Career and links"],
  [4, "About"],
];

// What this Stash knows: fields of the performer, of the update, of a scraped performer
let schema = null;
async function loadSchema() {
  if (schema) return schema;
  const d = await gql(`query PerfSchema {
    u: __type(name: "PerformerUpdateInput") { inputFields { name } }
    o: __type(name: "Performer") { fields { name } }
    s: __type(name: "ScrapedPerformer") { fields { name } }
    i: __type(name: "ScrapedPerformerInput") { inputFields { name } }
  }`);
  const names = (x, k) => new Set(((x && x[k]) || []).map((f) => f.name));
  schema = { input: names(d.u, "inputFields"), output: names(d.o, "fields"), scraped: names(d.s, "fields"), scrapedIn: names(d.i, "inputFields") };
  return schema;
}

async function loadSources() {
  const d = await gql(`query PerfSources {
    listScrapers(types: [PERFORMER]) { id name performer { supported_scrapes } }
    configuration { general { stashBoxes { endpoint name } } }
  }`);
  const boxes = (d.configuration.general.stashBoxes || []).map((b, i) => ({ id: "box" + i, name: b.name || b.endpoint, box: b.endpoint }));
  const scrapers = (d.listScrapers || []).filter((s) => (s.performer.supported_scrapes || []).includes("NAME")).map((s) => ({ id: s.id, name: s.name, scraper: s.id }));
  const byUrl = (d.listScrapers || []).some((s) => (s.performer.supported_scrapes || []).includes("URL"));
  return { list: [...boxes, ...scrapers], byUrl };
}

// Scraped values are plain text – turn them into what the form wants
const GENDER_WORDS = { female: "FEMALE", woman: "FEMALE", male: "MALE", man: "MALE", "transgender female": "TRANSGENDER_FEMALE", "trans female": "TRANSGENDER_FEMALE", "trans woman": "TRANSGENDER_FEMALE", "transgender male": "TRANSGENDER_MALE", "trans male": "TRANSGENDER_MALE", "trans man": "TRANSGENDER_MALE", "non-binary": "NON_BINARY", nonbinary: "NON_BINARY", "non binary": "NON_BINARY", intersex: "INTERSEX" };
function convert(f, v) {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) v = f.type === "lines" ? v.join("\n") : v.join(", ");
  v = String(v).trim();
  switch (f.type) {
    case "gender": {
      const g = v.toLowerCase().replace(/_/g, " ");
      return GENDER_WORDS[g] || (GENDERS.some(([x]) => x === v.toUpperCase()) ? v.toUpperCase() : "");
    }
    case "circ":
      return /^uncut/i.test(v) ? "UNCUT" : /^cut/i.test(v) ? "CUT" : "";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    case "int": {
      if (f.k === "height_cm") {
        const ft = v.match(/(\d)\s*(?:'|ft)\s*(\d{1,2})?/); // 5'7"
        if (ft) return String(Math.round((Number(ft[1]) * 12 + Number(ft[2] || 0)) * 2.54));
      }
      const n = parseFloat(v.replace(",", "."));
      if (!n) return "";
      return String(Math.round(/lb/i.test(v) ? n * 0.4536 : n));
    }
    case "float": {
      const n = parseFloat(v.replace(",", "."));
      return n ? String(n) : "";
    }
    case "list":
      return v.split(/\s*[,/;]\s*/).filter(Boolean).join(", ");
    default:
      return v;
  }
}

function fieldHtml(f, val) {
  const attrs = `class="kb-field" data-f="${f.k}"`;
  let ctl;
  if (f.type === "gender") ctl = `<select ${attrs}><option value="">–</option>${GENDERS.map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select>`;
  else if (f.type === "circ") ctl = `<select ${attrs}><option value="">–</option>${[["CUT", "Cut"], ["UNCUT", "Uncut"]].map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select>`;
  else if (f.type === "text" || f.type === "lines") ctl = `<textarea ${attrs} rows="${f.type === "text" ? 5 : 3}">${esc(val || "")}</textarea>`;
  else ctl = `<input ${attrs} type="${f.type === "date" ? "date" : f.type === "int" || f.type === "float" ? "number" : "text"}"${f.type === "float" ? ' step="0.1"' : ""} value="${esc(val || "")}"${f.hint ? ` placeholder="${esc(f.hint)}"` : ""}>`;
  return `<label class="kb-form-row${f.wide ? " is-wide" : ""}"><span>${t(f.label)}</span>${ctl}</label>`;
}

function valueOf(p, f) {
  const v = p[f.k];
  if (v == null) return "";
  if (f.type === "list") return v.join(", ");
  if (f.type === "lines") return v.join("\n");
  return String(v);
}

// opts: { onSaved(), onDeleted(), scrape: true = open with the search already running }
export async function openPerformerEditor(id, opts = {}) {
  let sch, p, sources;
  try {
    sch = await loadSchema();
    const fields = FIELDS.filter((f) => sch.output.has(f.k) && sch.input.has(f.k));
    const d = await gql(`query($id: ID!) { findPerformer(id: $id) { id image_path ${fields.map((f) => f.k).join(" ")} tags { id name }${sch.output.has("stash_ids") ? " stash_ids { endpoint stash_id }" : ""} } }`, { id });
    p = d.findPerformer;
    sources = await loadSources().catch(() => ({ list: [], byUrl: false }));
    sch.fields = fields;
  } catch (e) {
    errorToast(e, "Edit performer");
    return;
  }
  const fields = sch.fields;
  const hasPhoto = !/default=true/.test(p.image_path || "");
  let image; // undefined = unchanged, null = remove, string = new (link or data: URL)
  let stashIds = (p.stash_ids || []).map((s) => ({ endpoint: s.endpoint, stash_id: s.stash_id }));

  const d = openDrawer({
    title: t("Edit performer"),
    body: `
      <section class="kb-pe-photo">
        <div class="kb-pe-img" data-drop title="${t("Drop or paste a picture here")}"><img alt="" data-img src="${esc(p.image_path || "")}"></div>
        <div class="kb-pe-photo-tools">
          <b>${t("Photo")}</b>
          <button type="button" class="kb-btn" data-upload>${icon("camera")}${t("Upload")}</button>
          <button type="button" class="kb-btn" data-imglink>${t("From a link")}</button>
          <button type="button" class="kb-btn" data-cut>${icon("crop")}${t("Cut from a scene")}</button>
          <button type="button" class="kb-btn is-ghost kb-pdanger" data-imgdel${hasPhoto ? "" : " hidden"}>${icon("trash")}${t("Remove")}</button>
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
                ${sources.list.length ? `<select class="kb-field" data-src>${sources.list.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>` : ""}
                <input class="kb-field" data-sq value="${esc(p.name)}" placeholder="${esc(sources.list.length ? t("Name or profile link") : t("Profile link"))}">
                <button type="button" class="kb-btn is-primary" data-sgo>${icon("search")}${t("Search")}</button>
              </div>
              <label class="kb-check"><input type="checkbox" data-over> ${t("Also replace fields that already have a value")}</label>
              <div class="kb-pe-results" data-sres></div>`
            : `<p class="kb-hint">${t("No performer scraper or StashDB set up yet. Add them in classic Stash → Settings → Metadata Providers.")}</p>`
        }
      </section>
      ${GROUPS.map(([g, label]) => {
        const fs = fields.filter((f) => f.group === g);
        return fs.length ? `<section><h3 class="kb-pe-h">${t(label)}</h3><div class="kb-pe-grid">${fs.map((f) => fieldHtml(f, valueOf(p, f))).join("")}</div></section>` : "";
      }).join("")}
      <section><h3 class="kb-pe-h">${t("Tags")}</h3><div data-tags></div></section>
      ${stashIds.length ? `<p class="kb-hint" data-sids>${t("Linked to {list}", { list: stashIds.map((s) => esc(s.endpoint.replace(/^https?:\/\//, "").split("/")[0])).join(", ") })}</p>` : ""}`,
    foot: `<button class="kb-btn is-danger" data-del>${t("Delete performer")}</button><span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
  });
  const el = d.el;
  el.classList.add("kb-pe");
  const $ = (s) => el.querySelector(s);
  const picker = tagPicker($("[data-tags]"), { include: p.tags.map((x) => x.id), allowCreate: true, placeholder: t("Search or create a tag") });

  // ---- Photo
  const setImage = (v, preview) => {
    image = v;
    $("[data-img]").src = v === null ? "" : preview || v;
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
    const u = await promptDialog({ title: t("Photo from a link"), label: t("Address of the picture"), ok: t("Use") });
    if (u && /^https?:\/\//i.test(u.trim())) setImage(u.trim());
  };
  $("[data-imgdel]").onclick = () => setImage(null);
  $("[data-cut]").onclick = async () => {
    const { openPhotoCutter } = await import("../perfcut.js");
    openPhotoCutter({ id: p.id, name: p.name }, (url) => setImage(url));
  };
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
  const SCRAPED = ["stored_id", "name", "disambiguation", "gender", "urls", "birthdate", "ethnicity", "country", "eye_color", "height", "measurements", "fake_tits", "penis_length", "circumcised", "career_start", "career_end", "career_length", "tattoos", "piercings", "aliases", "details", "death_date", "hair_color", "weight", "remote_site_id", "images"]
    .filter((k) => sch.scraped.has(k))
    .join(" ");
  const SF = `${SCRAPED} tags { stored_id name }`;
  const srcOf = () => sources.list.find((s) => s.id === ($("[data-src]") || {}).value);
  const sourceInput = (s) => (s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper });
  let results = [];

  async function search() {
    const q = $("[data-sq]").value.trim();
    const out = $("[data-sres]");
    if (!q) return;
    out.innerHTML = `<p class="kb-hint">${t("Searching …")}</p>`;
    try {
      if (/^https?:\/\//i.test(q)) {
        const r = await gql(`query($u: String!) { scrapePerformerURL(url: $u) { ${SF} } }`, { u: q });
        if (!r.scrapePerformerURL) throw new Error(t("No scraper knows this link"));
        out.innerHTML = "";
        return apply(r.scrapePerformerURL, null);
      }
      const s = srcOf();
      if (!s) throw new Error(t("Choose a source, or paste a profile link"));
      const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSinglePerformerInput!) { scrapeSinglePerformer(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: { query: q } });
      results = r.scrapeSinglePerformer || [];
      out.innerHTML = results.length
        ? results
            .slice(0, 25)
            .map((x, i) => {
              const sub = [x.disambiguation, x.country, x.birthdate, (x.urls || [])[0] ? (x.urls[0].match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] : ""].filter(Boolean).join(" · ");
              return `<button type="button" class="kb-pe-hit" data-hit="${i}">${x.images && x.images[0] ? `<img alt="" src="${esc(x.images[0])}">` : `<span class="kb-pe-noimg">${icon("person")}</span>`}<span><b>${esc(x.name || "?")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
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
      // Scrapers answer a name search with just names and links – the chosen one is fetched in full
      if (s && !s.box) {
        b.classList.add("is-busy");
        try {
          const input = { name: x.name };
          if (x.urls && x.urls.length) {
            if (sch.scrapedIn.has("urls")) input.urls = x.urls;
            else input.url = x.urls[0]; // older Stash
          }
          if (x.disambiguation) input.disambiguation = x.disambiguation;
          if (x.remote_site_id) input.remote_site_id = x.remote_site_id;
          const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSinglePerformerInput!) { scrapeSinglePerformer(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: { performer_input: input } });
          x = (r.scrapeSinglePerformer || [])[0] || x;
        } catch (err) {
          errorToast(err, "Scrape");
          b.classList.remove("is-busy");
          return;
        }
      }
      $("[data-sres]").innerHTML = "";
      apply(x, s);
    });

  function apply(x, s) {
    const over = $("[data-over]") && $("[data-over]").checked;
    let n = 0;
    el.querySelectorAll(".is-scraped").forEach((r) => r.classList.remove("is-scraped"));
    for (const f of fields) {
      const v = convert(f, x[f.from || f.k]);
      const ctl = el.querySelector(`[data-f="${f.k}"]`);
      if (!v || !ctl || (ctl.value && !over) || ctl.value === v) continue;
      ctl.value = v;
      ctl.closest(".kb-form-row").classList.add("is-scraped");
      n++;
    }
    // Tags Stash already knows
    const known = (x.tags || []).filter((tg) => tg.stored_id).map((tg) => tg.stored_id);
    if (known.length) picker.set([...new Set([...picker.include, ...known])]);
    // Pictures: pick one; the first is taken when there's no photo yet (or replacing is on)
    const imgs = (x.images || []).filter(Boolean).slice(0, 8);
    const ch = $("[data-choices]");
    ch.hidden = !imgs.length;
    ch.innerHTML = imgs.length ? `<small class="kb-hint">${t("Found pictures – click one to use it")}</small><div>${imgs.map((u, i) => `<button type="button" data-pick="${i}"><img alt="" src="${esc(u)}"></button>`).join("")}</div>` : "";
    ch.onclick = (e) => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      setImage(imgs[Number(b.dataset.pick)]);
      ch.querySelectorAll("[data-pick]").forEach((q) => q.classList.toggle("is-on", q === b));
    };
    if (imgs.length && (!hasPhoto || over) && image === undefined) {
      setImage(imgs[0]);
      ch.querySelector("[data-pick]").classList.add("is-on");
    }
    // A StashDB-style box: remember the link, so Stash knows who this is
    if (s && s.box && x.remote_site_id && !stashIds.some((q) => q.endpoint === s.box)) stashIds.push({ endpoint: s.box, stash_id: x.remote_site_id });
    toast(n ? t("{n} fields filled in – check them and save", { n }) : t("Nothing new – every field already has a value"), n ? "ok" : undefined);
  }

  // ---- Save / delete
  $("[data-cancel]").onclick = d.close;
  $("[data-save]").onclick = async () => {
    const input = { id: p.id };
    for (const f of fields) {
      const v = el.querySelector(`[data-f="${f.k}"]`).value.trim();
      if (f.type === "list") input[f.k] = v.split(",").map((a) => a.trim()).filter(Boolean);
      else if (f.type === "lines") input[f.k] = v.split(/\n+/).map((u) => u.trim()).filter(Boolean);
      else if (f.type === "int") input[f.k] = v ? parseInt(v, 10) : null;
      else if (f.type === "float") input[f.k] = v ? parseFloat(v) : null;
      else if (["date", "gender", "circ"].includes(f.type)) input[f.k] = v || null;
      else input[f.k] = v;
    }
    if (!input.name) return toast(t("The name can't be empty"), "error");
    input.tag_ids = picker.include;
    if (image !== undefined) input.image = image;
    if (sch.input.has("stash_ids")) input.stash_ids = stashIds;
    const btn = $("[data-save]");
    btn.disabled = true;
    try {
      await updatePerformer(input);
      toast(t("Performer saved"), "ok");
      d.close();
      opts.onSaved && opts.onSaved();
    } catch (e) {
      btn.disabled = false;
      errorToast(e, "Save");
    }
  };
  $("[data-del]").onclick = async () => {
    const r = await confirmDialog({ title: t("Delete performer “{name}”?", { name: p.name }), text: t("The performer is removed from all scenes, images and galleries. The items themselves stay."), ok: t("Delete"), danger: true });
    if (!r.ok) return;
    try {
      await gql(`mutation($id: ID!) { performerDestroy(input: { id: $id }) }`, { id: p.id });
      d.close();
      toast(t("Performer deleted"), "ok");
      opts.onDeleted && opts.onDeleted();
    } catch (e) {
      errorToast(e, "Delete");
    }
  };
  if (opts.scrape && $("[data-sgo]")) search();
}
