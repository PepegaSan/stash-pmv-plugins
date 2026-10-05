// "Fill in from the internet" for a scene: search a StashDB-style box or an installed scene scraper (by title or
// by link – or, with an empty search, by the scene's own fingerprint) and fill the edit form with what was found.
// Nothing is saved until you press Save. Which fields exist depends on the Stash version, so Stash is asked first.

import { esc, icon, toast } from "../ui.js";
import { t } from "../i18n.js";
import { gql, createPerformer, createTag } from "../api.js";
import { studiosCache } from "./studiopicker.js";
import { createStudio } from "./studioedit.js";

let schema = null;
async function loadSchema() {
  if (schema) return schema;
  const d = await gql(`query SceneScrapeSchema {
    u: __type(name: "SceneUpdateInput") { inputFields { name } }
    s: __type(name: "ScrapedScene") { fields { name } }
  }`);
  const names = (x, k) => new Set(((x && x[k]) || []).map((f) => f.name));
  schema = { input: names(d.u, "inputFields"), scraped: names(d.s, "fields") };
  return schema;
}

async function loadSources() {
  const d = await gql(`query SceneSources {
    listScrapers(types: [SCENE]) { id name scene { supported_scrapes } }
    configuration { general { stashBoxes { endpoint name } } }
  }`);
  const boxes = (d.configuration.general.stashBoxes || []).map((b, i) => ({ id: "box" + i, name: b.name || b.endpoint, box: b.endpoint }));
  const sup = (s) => (s.scene || {}).supported_scrapes || [];
  const scrapers = (d.listScrapers || []).filter((s) => sup(s).some((k) => k === "NAME" || k === "FRAGMENT")).map((s) => ({ id: s.id, name: s.name, scraper: s.id, byName: sup(s).includes("NAME"), byFragment: sup(s).includes("FRAGMENT") }));
  const byUrl = (d.listScrapers || []).some((s) => sup(s).includes("URL"));
  return { list: [...boxes, ...scrapers], byUrl };
}

const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");

// host: the section to fill. ctx: { id, title, el (the drawer), picker (tags), perfs, studio, setCover(dataUrl), setStashIds(list), stashIds }
export async function mountSceneScrape(host, ctx) {
  let sch, sources;
  try {
    sch = await loadSchema();
    sources = await loadSources();
  } catch (e) {
    host.hidden = true; // an older Stash without scene scraping in this form: no section
    return;
  }
  if (!sources.list.length && !sources.byUrl) {
    host.innerHTML = `<b>${t("Fill in from the internet")}</b><p class="kb-hint">${t("No scene scraper or StashDB set up yet. Add them in classic Stash → Settings → Metadata Providers.")}</p>`;
    return;
  }
  host.innerHTML = `
    <b>${t("Fill in from the internet")}</b>
    <div class="kb-pe-scrapebar">
      ${sources.list.length ? `<select class="kb-field" data-src>${sources.list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>` : ""}
      <input class="kb-field" data-sq value="${esc(ctx.title || "")}" placeholder="${esc(t("Title or link – empty = look the file up"))}">
      <button type="button" class="kb-btn is-primary" data-sgo>${icon("search")}${t("Search")}</button>
    </div>
    <label class="kb-check"><input type="checkbox" data-over> ${t("Also replace fields that already have a value")}</label>
    <label class="kb-check"><input type="checkbox" data-cv> ${t("Also use the found picture as the cover")}</label>
    <label class="kb-check"><input type="checkbox" data-mk checked> ${t("Create studios, performers and tags that don't exist yet")}</label>
    <div class="kb-pe-results" data-sres></div>`;
  const $ = (s) => host.querySelector(s);
  const SC = ["title", "details", "date", "urls", "url", "image", "remote_site_id", "code", "director"].filter((k) => sch.scraped.has(k)).join(" ");
  const SF = `${SC}${sch.scraped.has("studio") ? " studio { stored_id name }" : ""}${sch.scraped.has("tags") ? " tags { stored_id name }" : ""}${sch.scraped.has("performers") ? " performers { stored_id name }" : ""}`;
  const srcOf = () => sources.list.find((s) => s.id === ($("[data-src]") || {}).value);
  const sourceInput = (s) => (s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper });
  const linksOf = (x) => [...new Set([...(x.urls || []), x.url].filter(Boolean))];
  let results = [];

  async function search() {
    const q = $("[data-sq]").value.trim();
    const out = $("[data-sres]");
    out.innerHTML = `<p class="kb-hint">${t("Searching …")}</p>`;
    try {
      if (/^https?:\/\//i.test(q)) {
        const r = await gql(`query($u: String!) { scrapeSceneURL(url: $u) { ${SF} } }`, { u: q });
        if (!r.scrapeSceneURL) throw new Error(t("No scraper knows this link"));
        out.innerHTML = "";
        return apply(r.scrapeSceneURL, null);
      }
      const s = srcOf();
      if (!s) throw new Error(t("Choose a source, or paste a link"));
      // a name asks by text, an empty search by the scene itself (its fingerprints / what Stash knows about it)
      const input = q ? { query: q } : { scene_id: ctx.id };
      const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSingleSceneInput!) { scrapeSingleScene(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: input });
      results = r.scrapeSingleScene || [];
      out.innerHTML = results.length
        ? results
            .slice(0, 25)
            .map((x, i) => {
              const sub = [(x.studio || {}).name, day(x.date), (x.performers || []).map((p) => p.name).slice(0, 3).join(", ")].filter(Boolean).join(" · ");
              return `<button type="button" class="kb-pe-hit" data-hit="${i}">${x.image && /^(data:|https?:)/.test(x.image) ? `<img alt="" src="${esc(x.image)}">` : `<span class="kb-pe-noimg">${icon("film")}</span>`}<span><b>${esc(x.title || "?")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
            })
            .join("")
        : `<p class="kb-hint">${t("Nothing found. Try another spelling or another source.")}</p>`;
    } catch (e) {
      out.innerHTML = `<p class="kb-hint kb-pe-err">${esc(e.message)}</p>`;
    }
  }
  $("[data-sgo]").onclick = search;
  $("[data-sq]").addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), search()));
  $("[data-sres]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-hit]");
    if (!b) return;
    const s = srcOf();
    let x = results[Number(b.dataset.hit)];
    // A scraper answers a name search with a short hit – the chosen one is fetched in full from its link
    const link = linksOf(x)[0];
    if (s && !s.box && link) {
      b.classList.add("is-busy");
      try {
        const r = await gql(`query($u: String!) { scrapeSceneURL(url: $u) { ${SF} } }`, { u: link });
        x = r.scrapeSceneURL || x;
      } catch (err) {
        /* the search hit itself will do */
      }
    }
    $("[data-sres]").innerHTML = "";
    apply(x, s);
  });

  async function apply(x, s) {
    const over = $("[data-over]").checked;
    const make = $("[data-mk]").checked;
    const root = ctx.el;
    let n = 0;
    root.querySelectorAll(".is-scraped").forEach((r) => r.classList.remove("is-scraped"));
    const mark = (ctl) => ctl && ctl.closest(".kb-form-row") && ctl.closest(".kb-form-row").classList.add("is-scraped");
    const put = (k, v) => {
      const ctl = root.querySelector(`[data-e="${k}"]`);
      if (!v || !ctl || (ctl.value && !over) || ctl.value === v) return;
      ctl.value = v;
      mark(ctl);
      n++;
    };
    put("title", x.title);
    put("details", x.details);
    put("date", day(x.date));
    put("urls", linksOf(x).join("\n"));
    try {
      // Studio: the one Stash knows, else made (if wanted)
      if (x.studio && x.studio.name && (!ctx.studio.include.length || over)) {
        let id = x.studio.stored_id;
        if (!id) {
          const known = (await studiosCache()).find((st) => st.name.toLowerCase() === x.studio.name.toLowerCase() || (st.aliases || []).some((a) => a.toLowerCase() === x.studio.name.toLowerCase()));
          id = known ? known.id : make ? (await createStudio(x.studio.name)).id : null;
        }
        if (id) {
          ctx.studio.set([id], { [id]: x.studio.name });
          n++;
        }
      }
      // Performers and tags: added to the ones already there
      const perfIds = [...ctx.perfs.include];
      const perfNames = {};
      for (const p of x.performers || []) {
        let id = p.stored_id;
        if (!id && make && p.name) id = (await createPerformer(p.name)).id;
        if (id && !perfIds.includes(id)) {
          perfIds.push(id);
          perfNames[id] = p.name;
          n++;
        }
      }
      if (Object.keys(perfNames).length) ctx.perfs.set(perfIds, perfNames);
      const tagIds = [...ctx.picker.include];
      const made = [];
      for (const tg of x.tags || []) {
        let id = tg.stored_id;
        if (!id && make && tg.name) {
          const c = await createTag(tg.name);
          id = c.id;
          made.push(c);
        }
        if (id && !tagIds.includes(id)) {
          tagIds.push(id);
          n++;
        }
      }
      if (tagIds.length !== ctx.picker.include.length) ctx.picker.set(tagIds, made);
    } catch (err) {
      toast(err.message || String(err), "error");
    }
    // Cover: only when asked for
    if (x.image && /^(data:image\/|https?:)/.test(x.image) && $("[data-cv]").checked) {
      ctx.setCover(x.image);
      n++;
    }
    // A StashDB-style box: remember the link, so Stash knows which scene this is
    if (s && s.box && x.remote_site_id && sch.input.has("stash_ids")) ctx.addStashId(s.box, x.remote_site_id);
    toast(n ? t("{n} fields filled in – check them and save", { n }) : t("Nothing new – every field already has a value"), n ? "ok" : undefined);
  }
}
