// Performer tagger: the performers that are missing something (a photo, details, a StashDB link), one row each –
// look each one up by name in a StashDB-style box or an installed performer scraper, check what was found field by
// field and save it. Same scraping as the performer editor's "Fill in from the internet"; nothing is written until
// you press Save.

import { esc, icon, toast, errorToast, store, plural } from "../ui.js";
import { t } from "../i18n.js";
import { gql, updatePerformer } from "../api.js";
import { FIELDS, loadSchema, loadSources, convert, valueOf } from "./perfedit.js";
import { scrapeErr } from "./scenescrape.js";

const PAGE = 20;
// What to list: the filters Stash can do itself (is_missing / IS_NULL)
const FILTERS = [
  ["image", "Without a photo", { is_missing: "image" }],
  ["stash_id", "Not linked to StashDB yet", { is_missing: "stash_id" }],
  ["country", "Without a country", { country: { value: "", modifier: "IS_NULL" } }],
  ["birthdate", "Without a birthdate", { birthdate: { value: "", modifier: "IS_NULL" } }],
  ["all", "All performers", {}],
];

export async function render(main) {
  const opt = Object.assign({ filter: "image", over: false, src: "" }, store.get("perfTagger", {}));
  const save = () => store.set("perfTagger", opt);
  const head = `<header class="kb-head"><div class="kb-head-title"><h1 class="kb-h1">${t("Performer tagger")}</h1>
    <p class="kb-sub">${t("Look performers up on StashDB or with a scraper and fill in photo, birthdate, country, looks and links – check what was found, then save.")}</p></div></header>`;
  let sch;
  let sources;
  try {
    sch = await loadSchema();
    sources = await loadSources();
  } catch (e) {
    main.innerHTML = head + `<div class="kb-empty"><b>${t("This Stash can't scrape performers from here.")}</b></div>`;
    return;
  }
  if (!sources.list.length) {
    main.innerHTML = head + `<div class="kb-empty"><b>${t("No performer scraper or StashDB set up yet.")}</b><p>${t("Add them in classic Stash → Settings → Metadata Providers.")}</p></div>`;
    return;
  }
  if (!sources.list.some((s) => s.id === opt.src)) opt.src = sources.list[0].id;
  if (!FILTERS.some((f) => f[0] === opt.filter)) opt.filter = "image";
  const fields = FIELDS.filter((f) => sch.output.has(f.k) && sch.input.has(f.k));
  const SCRAPED = ["stored_id", "name", "disambiguation", "gender", "urls", "birthdate", "ethnicity", "country", "eye_color", "height", "measurements", "fake_tits", "penis_length", "circumcised", "career_start", "career_end", "career_length", "tattoos", "piercings", "aliases", "details", "death_date", "hair_color", "weight", "remote_site_id", "images"]
    .filter((k) => sch.scraped.has(k))
    .join(" ");
  const SF = `${SCRAPED} tags { stored_id name }`;
  const Q = `query PerfTagger($f: FindFilterType, $x: PerformerFilterType) { findPerformers(filter: $f, performer_filter: $x) { count performers {
    id name disambiguation image_path scene_count ${fields.map((f) => f.k).join(" ")} tags { id name }${sch.output.has("stash_ids") ? " stash_ids { endpoint stash_id }" : ""} } } }`;

  main.innerHTML = `${head}
    <div class="kb-ptools kb-tg-tools">
      <select class="kb-field" data-src aria-label="${t("Source")}">${sources.list.map((s) => `<option value="${esc(s.id)}"${s.id === opt.src ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      <select class="kb-field" data-filter aria-label="${t("Which performers")}">${FILTERS.map(([k, l]) => `<option value="${k}"${k === opt.filter ? " selected" : ""}>${t(l)}</option>`).join("")}</select>
      <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search the list")}"></label>
      <label class="kb-check"><input type="checkbox" data-over${opt.over ? " checked" : ""}> ${t("Also replace fields that already have a value")}</label>
      <span class="kb-spacer"></span>
      <button type="button" class="kb-btn" data-all>${icon("search")}<span>${t("Look up this page")}</span></button>
    </div>
    <p class="kb-resultline" data-count></p>
    <div data-list><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-pager" data-pager></div>`;
  const $ = (s) => main.querySelector(s);
  let page = 1;
  let q = "";
  let people = [];
  let total = 0;
  const rows = new Map(); // id → { results, hit, fields, error }
  const srcOf = () => sources.list.find((s) => s.id === opt.src);
  const sourceInput = (s) => (s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper });
  const filterOf = () => (FILTERS.find((f) => f[0] === opt.filter) || FILTERS[0])[2];
  const hasPhoto = (p) => !/default=true/.test(p.image_path || "");

  async function load() {
    $("[data-list]").innerHTML = `<div class="kb-loading">${t("Loading …")}</div>`;
    try {
      const d = await gql(Q, { f: { q: q || undefined, page, per_page: PAGE, sort: "name", direction: "ASC" }, x: filterOf() });
      people = d.findPerformers.performers;
      total = d.findPerformers.count;
    } catch (e) {
      $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the performers")}</b><p>${esc(e.message)}</p></div>`;
      return;
    }
    paint();
  }

  function paint() {
    $("[data-count]").textContent = total ? plural(total, "performer", "performers") : "";
    $("[data-list]").innerHTML = people.length ? people.map(rowHtml).join("") : `<div class="kb-empty"><b>${opt.filter === "all" ? t("Nothing found") : t("Nobody is missing this.")}</b></div>`;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    $("[data-pager]").innerHTML = pages > 1 ? `<button type="button" class="kb-btn" data-pg="-1"${page <= 1 ? " disabled" : ""}>${icon("back")}</button><span>${page} / ${pages}</span><button type="button" class="kb-btn" data-pg="1"${page >= pages ? " disabled" : ""}>${icon("fwd")}</button>` : "";
    people.forEach((p) => rows.get(String(p.id)) && paintResults(String(p.id)));
  }

  function rowHtml(p) {
    const have = [p.country, p.birthdate, p.height_cm ? p.height_cm + " cm" : "", p.scene_count ? plural(p.scene_count, "scene", "scenes") : "", (p.stash_ids || []).length ? t("linked") : ""].filter(Boolean).join(" · ");
    return `<article class="kb-tg-row" data-id="${esc(p.id)}">
      <a class="kb-tg-thumb kb-ptg-thumb" href="#/performer/${esc(p.id)}" title="${t("Open the performer")}">${hasPhoto(p) ? `<img alt="" loading="lazy" src="${esc(p.image_path)}">` : icon("person")}</a>
      <div class="kb-tg-main">
        <b class="kb-tg-title">${esc(p.name)}${p.disambiguation ? ` <small>(${esc(p.disambiguation)})</small>` : ""}</b>
        <small class="kb-tg-have">${have ? esc(have) : t("Nothing filled in yet")}</small>
        <div class="kb-pe-scrapebar">
          <input class="kb-field" data-sq value="${esc(p.name)}" placeholder="${esc(sources.byUrl ? t("Name or profile link") : t("Name"))}">
          <button type="button" class="kb-btn is-primary" data-find>${icon("search")}${t("Search")}</button>
        </div>
        <div class="kb-tg-res" data-res></div>
      </div>
    </article>`;
  }

  const rowEl = (id) => main.querySelector(`.kb-tg-row[data-id="${CSS.escape(String(id))}"]`);
  const personOf = (id) => people.find((p) => String(p.id) === String(id));

  // a scraper answers a name search with just names and links – the chosen one is fetched in full
  async function full(x, s) {
    if (!s || s.box) return x;
    try {
      const input = { name: x.name };
      if (x.urls && x.urls.length) {
        if (sch.scrapedIn.has("urls")) input.urls = x.urls;
        else input.url = x.urls[0];
      }
      if (x.disambiguation) input.disambiguation = x.disambiguation;
      if (x.remote_site_id) input.remote_site_id = x.remote_site_id;
      const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSinglePerformerInput!) { scrapeSinglePerformer(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: { performer_input: input } });
      return (r.scrapeSinglePerformer || [])[0] || x;
    } catch (e) {
      return x;
    }
  }

  // auto: a single result, or exactly one with this very name, is taken right away (still nothing is saved)
  async function find(id, auto) {
    const s = srcOf();
    const el = rowEl(id);
    if (!el) return;
    const res = el.querySelector("[data-res]");
    const text = el.querySelector("[data-sq]").value.trim();
    if (!text) return;
    res.innerHTML = `<p class="kb-hint">${t("Searching …")}</p>`;
    try {
      let list;
      if (/^https?:\/\//i.test(text)) {
        const r = await gql(`query($u: String!) { scrapePerformerURL(url: $u) { ${SF} } }`, { u: text });
        if (!r.scrapePerformerURL) throw new Error(t("No scraper knows this link"));
        list = [r.scrapePerformerURL];
      } else {
        const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSinglePerformerInput!) { scrapeSinglePerformer(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: { query: text } });
        list = r.scrapeSinglePerformer || [];
      }
      const row = { results: list.slice(0, 12), hit: null };
      rows.set(id, row);
      if (auto) {
        const same = row.results.filter((x) => String(x.name || "").toLowerCase() === text.toLowerCase());
        const one = row.results.length === 1 ? row.results[0] : same.length === 1 ? same[0] : null;
        if (one) row.hit = await full(one, s);
      }
    } catch (e) {
      rows.set(id, { error: scrapeErr(e), results: [] });
    }
    paintResults(id);
  }

  function paintResults(id) {
    const el = rowEl(id);
    const r = rows.get(id);
    if (!el || !r) return;
    const res = el.querySelector("[data-res]");
    if (r.error) return (res.innerHTML = `<p class="kb-hint kb-pe-err">${esc(r.error)}</p>`);
    if (r.hit) return paintReview(id);
    res.innerHTML = r.results.length
      ? r.results
          .map((x, i) => {
            const sub = [x.disambiguation, x.country, x.birthdate, (x.urls || [])[0] ? (x.urls[0].match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] : ""].filter(Boolean).join(" · ");
            return `<button type="button" class="kb-pe-hit" data-hit="${i}">${x.images && x.images[0] ? `<img alt="" src="${esc(x.images[0])}">` : `<span class="kb-pe-noimg">${icon("person")}</span>`}<span><b>${esc(x.name || "?")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
          })
          .join("")
      : `<p class="kb-hint">${t("Nothing found. Try another spelling or another source.")}</p>`;
  }

  // What would change: one checkbox per field the hit has something for (new, or – with the switch – different)
  function review(p, x) {
    const out = [];
    for (const f of fields) {
      const nu = convert(f, x[f.from || f.k]);
      const now = valueOf(p, f);
      if (!nu || nu === now) continue;
      if (now && !opt.over) continue;
      out.push({ f, now, nu });
    }
    const imgs = (x.images || []).filter(Boolean);
    if (imgs.length && (!hasPhoto(p) || opt.over)) out.push({ k: "image", label: t("Photo"), now: "", nu: imgs[0], img: imgs[0] });
    const haveT = new Set((p.tags || []).map((tg) => String(tg.id)));
    const newT = (x.tags || []).filter((tg) => tg.stored_id && !haveT.has(String(tg.stored_id)));
    if (newT.length) out.push({ k: "tags", label: t("Tags"), now: "", nu: newT.map((tg) => tg.name).join(", "), list: newT });
    return out;
  }

  function paintReview(id) {
    const el = rowEl(id);
    const r = rows.get(id);
    const p = personOf(id);
    const x = r.hit;
    const list = review(p, x);
    r.fields = list;
    el.querySelector("[data-res]").innerHTML = `<div class="kb-tg-review">
      <p class="kb-tg-found"><b>${esc(x.name || "?")}</b> <button type="button" class="kb-btn is-ghost" data-back>${t("Other results")}</button></p>
      ${list.length ? list.map((c, i) => `<label class="kb-tg-field"><input type="checkbox" data-fld="${i}" checked><span class="kb-tg-lab">${esc(c.f ? t(c.f.label) : c.label)}</span><span class="kb-tg-val">${c.img ? `<img class="kb-ptg-found" alt="" src="${esc(c.img)}">` : `${c.now ? `<s>${esc(c.now)}</s> → ` : ""}${esc(String(c.nu).slice(0, 300))}`}</span></label>`).join("") : `<p class="kb-hint">${t("Nothing new – every field already has a value")}</p>`}
      <div class="kb-tg-act"><button type="button" class="kb-btn is-primary" data-save${list.length || (srcOf().box && x.remote_site_id) ? "" : " disabled"}>${icon("check")}${t("Save")}</button><button type="button" class="kb-btn" data-skip>${t("Skip")}</button></div>
    </div>`;
  }

  async function saveRow(id) {
    const el = rowEl(id);
    const r = rows.get(id);
    const p = personOf(id);
    const x = r.hit;
    const btn = el.querySelector("[data-save]");
    btn.disabled = true;
    const on = new Set([...el.querySelectorAll("[data-fld]")].filter((c) => c.checked).map((c) => Number(c.dataset.fld)));
    const input = { id };
    r.fields.forEach((c, i) => {
      if (!on.has(i)) return;
      if (c.k === "image") return (input.image = c.img);
      if (c.k === "tags") return (input.tag_ids = [...new Set([...(p.tags || []).map((tg) => tg.id), ...c.list.map((tg) => tg.stored_id)])]);
      const f = c.f;
      const v = c.nu;
      if (f.type === "list") input[f.k] = v.split(",").map((a) => a.trim()).filter(Boolean);
      else if (f.type === "lines") input[f.k] = v.split(/\n+/).map((u) => u.trim()).filter(Boolean);
      else if (f.type === "int") input[f.k] = v ? parseInt(v, 10) : null;
      else if (f.type === "float") input[f.k] = v ? parseFloat(v) : null;
      else if (["date", "gender", "circ"].includes(f.type)) input[f.k] = v || null;
      else input[f.k] = v;
    });
    const src = srcOf();
    if (src && src.box && x.remote_site_id && sch.input.has("stash_ids")) {
      const cur = (p.stash_ids || []).filter((c) => c.endpoint !== src.box).map((c) => ({ endpoint: c.endpoint, stash_id: c.stash_id }));
      input.stash_ids = [...cur, { endpoint: src.box, stash_id: x.remote_site_id }];
    }
    try {
      await updatePerformer(input);
      toast(t("Saved"), "ok");
      rows.delete(id);
      if (opt.filter !== "all") {
        // it may not belong to this list any more – the list is asked again after the fade
        el.classList.add("is-done");
        setTimeout(() => {
          el.remove();
          total = Math.max(0, total - 1);
          $("[data-count]").textContent = total ? plural(total, "performer", "performers") : "";
        }, 500);
      } else await load();
    } catch (e) {
      btn.disabled = false;
      errorToast(e, "Saving failed");
    }
  }

  main.addEventListener("click", async (e) => {
    const row = e.target.closest(".kb-tg-row");
    const id = row && row.dataset.id;
    if (e.target.closest("[data-find]") && id) return find(id, false);
    const hit = e.target.closest("[data-hit]");
    if (hit && id) {
      const r = rows.get(id);
      hit.classList.add("is-busy");
      r.hit = await full(r.results[Number(hit.dataset.hit)], srcOf());
      return paintResults(id);
    }
    if (e.target.closest("[data-back]") && id) {
      rows.get(id).hit = null;
      return paintResults(id);
    }
    if (e.target.closest("[data-skip]") && id) {
      rows.delete(id);
      row.querySelector("[data-res]").innerHTML = "";
      return;
    }
    if (e.target.closest("[data-save]") && id) return saveRow(id);
    const pg = e.target.closest("[data-pg]");
    if (pg) {
      page = Math.max(1, page + Number(pg.dataset.pg));
      rows.clear();
      window.scrollTo({ top: 0 });
      return load();
    }
    const all = e.target.closest("[data-all]");
    if (all) {
      all.disabled = true;
      for (const p of people) {
        if (!rowEl(p.id) || rows.has(String(p.id))) continue;
        await find(String(p.id), true);
      }
      all.disabled = false;
    }
  });
  main.addEventListener("change", (e) => {
    if (e.target.matches("[data-over]")) {
      opt.over = e.target.checked;
      save();
      rows.forEach((r, id) => r.hit && paintReview(id)); // the open reviews are worked out again
    } else if (e.target.matches("[data-filter]")) {
      opt.filter = e.target.value;
      save();
      page = 1;
      rows.clear();
      load();
    } else if (e.target.matches("[data-src]")) {
      opt.src = e.target.value;
      save();
      rows.clear();
      people.forEach((p) => {
        const el = rowEl(p.id);
        if (el) el.querySelector("[data-res]").innerHTML = "";
      });
    }
  });
  let timer = 0;
  $("[data-q]").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = e.target.value.trim();
      page = 1;
      rows.clear();
      load();
    }, 300);
  });
  main.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-sq]")) {
      e.preventDefault();
      find(e.target.closest(".kb-tg-row").dataset.id, false);
    }
  });
  load();
}
