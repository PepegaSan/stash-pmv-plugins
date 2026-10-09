// Scene tagger: the scenes that aren't organized yet, one row each – look each one up (by its fingerprint or by a
// name) in a StashDB-style box or an installed scraper, check what was found and save it. Same scraping as the
// edit form's "Fill in from the internet" (scenescrape.js); nothing is written until you press Save.

import { esc, icon, toast, errorToast, store, plural } from "../ui.js";
import { t } from "../i18n.js";
import { gql, createPerformer, createTag, updateItem, libraryChanged } from "../api.js";
import { loadSchema, loadSources, scrapedFields, linksOf, day, sourceLabel, canByName, canByFile, scrapeErr } from "./scenescrape.js";
import { studiosCache } from "./studiopicker.js";
import { createStudio } from "./studioedit.js";

const PAGE = 20;
const Q = `query TaggerScenes($f: FindFilterType, $x: SceneFilterType) { findScenes(filter: $f, scene_filter: $x) { count scenes {
  id title details date urls organized files { basename path } paths { screenshot }
  studio { id name } performers { id name } tags { id name } stash_ids { endpoint stash_id } } } }`;

// A search text from what the scene is called: the title, else the file name without its ending, dots and underscores as spaces
const guessOf = (s) => String(s.title || ((s.files[0] || {}).basename || "").replace(/\.[A-Za-z0-9]{2,4}$/, "")).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();

export async function render(main) {
  const opt = Object.assign({ only: true, make: true, cover: false, organize: true, src: "" }, store.get("tagger", {}));
  const save = () => store.set("tagger", opt);
  let sch;
  let sources;
  try {
    sch = await loadSchema();
    sources = await loadSources();
  } catch (e) {
    main.innerHTML = `<div class="kb-empty"><b>${t("Scene tagger")}</b><p>${t("This Stash can't scrape scenes from here.")}</p></div>`;
    return;
  }
  const head = `<header class="kb-head"><div class="kb-head-title"><h1 class="kb-h1">${t("Scene tagger")}</h1>
    <p class="kb-sub">${t("Look scenes up on StashDB or with a scraper and fill in title, date, studio, performers and tags – check what was found, then save.")}</p></div></header>`;
  if (!sources.list.length) {
    main.innerHTML = head + `<div class="kb-empty"><b>${t("No scene scraper or StashDB set up yet.")}</b><p>${t("Add them in classic Stash → Settings → Metadata Providers.")}</p></div>`;
    return;
  }
  if (!sources.list.some((s) => s.id === opt.src)) opt.src = sources.list[0].id;

  main.innerHTML = `${head}
    <div class="kb-ptools kb-tg-tools">
      <select class="kb-field" data-src aria-label="${t("Source")}">${sources.list.map((s) => `<option value="${esc(s.id)}"${s.id === opt.src ? " selected" : ""}>${esc(sourceLabel(s))}</option>`).join("")}</select>
      <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search the list")}"></label>
      <label class="kb-check"><input type="checkbox" data-o="only"${opt.only ? " checked" : ""}> ${t("Only scenes that aren't organized")}</label>
      <label class="kb-check"><input type="checkbox" data-o="make"${opt.make ? " checked" : ""}> ${t("Create studios, performers and tags that don't exist yet")}</label>
      <label class="kb-check"><input type="checkbox" data-o="cover"${opt.cover ? " checked" : ""}> ${t("Use the found picture as the cover")}</label>
      <label class="kb-check"><input type="checkbox" data-o="organize"${opt.organize ? " checked" : ""}> ${t("Mark as organized when saved")}</label>
      <span class="kb-spacer"></span>
      <button type="button" class="kb-btn" data-all>${icon("search")}<span>${t("Look up this page")}</span></button>
    </div>
    <p class="kb-resultline" data-count></p>
    <div data-list><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-pager" data-pager></div>`;
  const $ = (s) => main.querySelector(s);
  let page = 1;
  let q = "";
  let scenes = [];
  let total = 0;
  const rows = new Map(); // id → { results, hit }
  const SF = scrapedFields(sch);
  const srcOf = () => sources.list.find((s) => s.id === opt.src);
  const sourceInput = (s) => (s.box ? { stash_box_endpoint: s.box } : { scraper_id: s.scraper });

  async function load() {
    $("[data-list]").innerHTML = `<div class="kb-loading">${t("Loading …")}</div>`;
    try {
      const d = await gql(Q, { f: { q: q || undefined, page, per_page: PAGE, sort: "created_at", direction: "DESC" }, x: opt.only ? { organized: false } : {} });
      scenes = d.findScenes.scenes;
      total = d.findScenes.count;
    } catch (e) {
      $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the scenes")}</b><p>${esc(e.message)}</p></div>`;
      return;
    }
    paint();
  }

  function paint() {
    $("[data-count]").textContent = total ? plural(total, "scene", "scenes") : "";
    $("[data-list]").innerHTML = scenes.length
      ? scenes.map(rowHtml).join("")
      : `<div class="kb-empty"><b>${opt.only ? t("Every scene is organized.") : t("Nothing found")}</b></div>`;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    $("[data-pager]").innerHTML = pages > 1 ? `<button type="button" class="kb-btn" data-pg="-1"${page <= 1 ? " disabled" : ""}>${icon("back")}</button><span>${page} / ${pages}</span><button type="button" class="kb-btn" data-pg="1"${page >= pages ? " disabled" : ""}>${icon("fwd")}</button>` : "";
    scenes.forEach((s) => rows.get(s.id) && paintResults(s.id));
  }

  const chips = (list, n = 4) => (list.length ? list.slice(0, n).map((x) => esc(x.name)).join(", ") + (list.length > n ? ` +${list.length - n}` : "") : "–");
  function rowHtml(s) {
    const f = s.files[0] || {};
    return `<article class="kb-tg-row" data-id="${esc(s.id)}">
      <a class="kb-tg-thumb" href="#/scene/${esc(s.id)}" title="${t("Open the scene")}">${s.paths.screenshot ? `<img alt="" loading="lazy" src="${esc(s.paths.screenshot)}">` : icon("film")}</a>
      <div class="kb-tg-main">
        <b class="kb-tg-title">${esc(s.title || f.basename || "?")}</b>
        <small class="kb-tg-path" title="${esc(f.path || "")}">${esc(f.basename || "")}</small>
        <small class="kb-tg-have">${t("Studio")}: ${esc((s.studio || {}).name || "–")} · ${t("Performers")}: ${chips(s.performers)} · ${t("Tags")}: ${chips(s.tags, 3)}${s.date ? " · " + esc(s.date) : ""}</small>
        <div class="kb-pe-scrapebar">
          <input class="kb-field" data-sq value="${esc(guessOf(s))}" placeholder="${esc(t("Title or link"))}">
          <button type="button" class="kb-btn is-primary" data-find="name">${icon("search")}${t("Search")}</button>
          <button type="button" class="kb-btn" data-find="file" title="${t("Look the file up by its fingerprint")}">${t("By file")}</button>
        </div>
        <div class="kb-tg-res" data-res></div>
      </div>
    </article>`;
  }

  const rowEl = (id) => main.querySelector(`.kb-tg-row[data-id="${CSS.escape(String(id))}"]`);
  const sceneOf = (id) => scenes.find((s) => String(s.id) === String(id));

  async function find(id, by) {
    const s = srcOf();
    const el = rowEl(id);
    if (!el) return;
    const res = el.querySelector("[data-res]");
    const text = el.querySelector("[data-sq]").value.trim();
    res.innerHTML = `<p class="kb-hint">${t("Searching …")}</p>`;
    try {
      let list;
      if (/^https?:\/\//i.test(text)) {
        const r = await gql(`query($u: String!) { scrapeSceneURL(url: $u) { ${SF} } }`, { u: text });
        if (!r.scrapeSceneURL) throw new Error(t("No scraper knows this link"));
        list = [r.scrapeSceneURL];
      } else {
        if (by === "name" && !text) throw new Error(t("Type a title first, or use “By file”."));
        if (by === "name" && !canByName(s)) throw new Error(t("This source can't search by name – it only looks up the file. Use “By file”, or choose another source."));
        if (by === "file" && !canByFile(s)) throw new Error(t("This source can't look up a file – use “Search” with a title, or choose another source."));
        const input = by === "file" ? { scene_id: id } : { query: text };
        const r = await gql(`query($s: ScraperSourceInput!, $i: ScrapeSingleSceneInput!) { scrapeSingleScene(source: $s, input: $i) { ${SF} } }`, { s: sourceInput(s), i: input });
        list = r.scrapeSingleScene || [];
      }
      rows.set(id, { results: list.slice(0, 12), hit: null, by });
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
            const sub = [(x.studio || {}).name, day(x.date), (x.performers || []).map((p) => p.name).slice(0, 3).join(", ")].filter(Boolean).join(" · ");
            return `<button type="button" class="kb-pe-hit" data-hit="${i}">${x.image && /^(data:|https?:)/.test(x.image) ? `<img alt="" src="${esc(x.image)}">` : `<span class="kb-pe-noimg">${icon("film")}</span>`}<span><b>${esc(x.title || "?")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
          })
          .join("")
      : `<p class="kb-hint">${r.by === "file" ? t("Nothing found for this file. Try a title.") : t("Nothing found. Try another spelling or another source.")}</p>`;
  }

  // What would change: one checkbox per field that the hit has something new for
  function review(s, x) {
    const out = [];
    const add = (k, label, now, nu, extra = {}) => nu && String(nu) !== String(now || "") && out.push(Object.assign({ k, label, now: now || "", nu }, extra));
    add("title", t("Title"), s.title, x.title);
    add("details", t("Details"), s.details, x.details);
    add("date", t("Date"), s.date, day(x.date));
    const links = linksOf(x).filter((u) => !(s.urls || []).includes(u));
    if (links.length) out.push({ k: "urls", label: t("Links"), now: (s.urls || []).join(", "), nu: links.join(", "), links });
    if (x.studio && x.studio.name && (!s.studio || s.studio.name.toLowerCase() !== x.studio.name.toLowerCase())) out.push({ k: "studio", label: t("Studio"), now: (s.studio || {}).name || "", nu: x.studio.name });
    const have = new Set(s.performers.map((p) => String(p.id)));
    const newP = (x.performers || []).filter((p) => p.name && !(p.stored_id && have.has(String(p.stored_id))));
    if (newP.length) out.push({ k: "performers", label: t("Performers"), now: "", nu: newP.map((p) => p.name + (p.stored_id ? "" : " ✦")).join(", "), list: newP });
    const haveT = new Set(s.tags.map((tg) => String(tg.id)));
    const newT = (x.tags || []).filter((tg) => tg.name && !(tg.stored_id && haveT.has(String(tg.stored_id))));
    if (newT.length) out.push({ k: "tags", label: t("Tags"), now: "", nu: newT.map((tg) => tg.name + (tg.stored_id ? "" : " ✦")).join(", "), list: newT });
    if (x.image && /^(data:image\/|https?:)/.test(x.image)) out.push({ k: "cover", label: t("Cover"), now: "", nu: t("the found picture"), off: !opt.cover });
    return out;
  }

  function paintReview(id) {
    const el = rowEl(id);
    const r = rows.get(id);
    const s = sceneOf(id);
    const res = el.querySelector("[data-res]");
    const x = r.hit;
    const fields = review(s, x);
    r.fields = fields;
    res.innerHTML = `<div class="kb-tg-review">
      <p class="kb-tg-found"><b>${esc(x.title || "?")}</b> <button type="button" class="kb-btn is-ghost" data-back>${t("Other results")}</button></p>
      ${fields.length ? fields.map((f, i) => `<label class="kb-tg-field"><input type="checkbox" data-fld="${i}"${f.off ? "" : " checked"}><span class="kb-tg-lab">${esc(f.label)}</span><span class="kb-tg-val">${f.now ? `<s>${esc(f.now)}</s> → ` : ""}${esc(String(f.nu).slice(0, 300))}</span></label>`).join("") : `<p class="kb-hint">${t("Nothing new – every field already has a value")}</p>`}
      ${fields.some((f) => /✦/.test(String(f.nu))) ? `<p class="kb-hint">${t("✦ = doesn't exist in Stash yet")}</p>` : ""}
      <div class="kb-tg-act"><button type="button" class="kb-btn is-primary" data-save>${icon("check")}${t("Save")}</button><button type="button" class="kb-btn" data-skip>${t("Skip")}</button></div>
    </div>`;
  }

  async function saveRow(id) {
    const el = rowEl(id);
    const r = rows.get(id);
    const s = sceneOf(id);
    const x = r.hit;
    const btn = el.querySelector("[data-save]");
    btn.disabled = true;
    const on = new Set([...el.querySelectorAll("[data-fld]")].filter((c) => c.checked).map((c) => r.fields[Number(c.dataset.fld)].k));
    const input = { id };
    try {
      if (on.has("title")) input.title = x.title;
      if (on.has("details")) input.details = x.details;
      if (on.has("date")) input.date = day(x.date);
      if (on.has("urls")) input.urls = [...new Set([...(s.urls || []), ...linksOf(x)])];
      if (on.has("studio")) {
        let sid = x.studio.stored_id;
        if (!sid) {
          const known = (await studiosCache()).find((st) => st.name.toLowerCase() === x.studio.name.toLowerCase() || (st.aliases || []).some((a) => a.toLowerCase() === x.studio.name.toLowerCase()));
          sid = known ? known.id : opt.make ? (await createStudio(x.studio.name)).id : null;
        }
        if (sid) input.studio_id = sid;
      }
      if (on.has("performers")) {
        const ids = s.performers.map((p) => p.id);
        for (const p of r.fields.find((f) => f.k === "performers").list) {
          let pid = p.stored_id;
          if (!pid && opt.make) pid = (await createPerformer(p.name)).id;
          if (pid && !ids.includes(pid)) ids.push(pid);
        }
        input.performer_ids = ids;
      }
      if (on.has("tags")) {
        const ids = s.tags.map((tg) => tg.id);
        for (const tg of r.fields.find((f) => f.k === "tags").list) {
          let tid = tg.stored_id;
          if (!tid && opt.make) tid = (await createTag(tg.name)).id;
          if (tid && !ids.includes(tid)) ids.push(tid);
        }
        input.tag_ids = ids;
      }
      if (on.has("cover")) input.cover_image = x.image;
      const src = srcOf();
      if (src && src.box && x.remote_site_id && sch.input.has("stash_ids")) {
        const cur = (s.stash_ids || []).filter((c) => c.endpoint !== src.box).map((c) => ({ endpoint: c.endpoint, stash_id: c.stash_id }));
        input.stash_ids = [...cur, { endpoint: src.box, stash_id: x.remote_site_id }];
      }
      if (opt.organize) input.organized = true;
      await updateItem("scene", input);
      libraryChanged();
      toast(t("Saved"), "ok");
      rows.delete(id);
      if (opt.only && opt.organize) {
        el.classList.add("is-done");
        setTimeout(() => {
          el.remove();
          total = Math.max(0, total - 1);
          $("[data-count]").textContent = total ? plural(total, "scene", "scenes") : "";
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
    const fd = e.target.closest("[data-find]");
    if (fd && id) return find(id, fd.dataset.find);
    const hit = e.target.closest("[data-hit]");
    if (hit && id) {
      const r = rows.get(id);
      let x = r.results[Number(hit.dataset.hit)];
      const s = srcOf();
      const link = linksOf(x)[0];
      // a scraper answers a name search with a short hit – the chosen one is fetched in full from its link
      if (s && !s.box && link) {
        hit.classList.add("is-busy");
        try {
          x = (await gql(`query($u: String!) { scrapeSceneURL(url: $u) { ${SF} } }`, { u: link })).scrapeSceneURL || x;
        } catch (err) { /* the hit itself will do */ }
      }
      r.hit = x;
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
    if (e.target.closest("[data-all]")) {
      const b = e.target.closest("[data-all]");
      if (!canByFile(srcOf())) return toast(t("This source can't look up a file – use “Search” with a title, or choose another source."), "error");
      b.disabled = true;
      for (const s of scenes) {
        if (!rowEl(s.id) || rows.has(s.id)) continue;
        await find(String(s.id), "file");
      }
      b.disabled = false;
    }
  });
  main.addEventListener("change", (e) => {
    const o = e.target.dataset && e.target.dataset.o;
    if (o) {
      opt[o] = e.target.checked;
      save();
      if (o === "only") {
        page = 1;
        rows.clear();
        load();
      }
    }
    if (e.target.matches("[data-src]")) {
      opt.src = e.target.value;
      save();
      rows.clear();
      scenes.forEach((s) => {
        const el = rowEl(s.id);
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
      find(e.target.closest(".kb-tg-row").dataset.id, "name");
    }
  });
  load();
}
