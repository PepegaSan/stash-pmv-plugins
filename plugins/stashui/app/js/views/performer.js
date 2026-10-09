// A performer: photo, facts, heart, rating, tags, links – and all their scenes, images and galleries.

import { tierNow } from "../tiers.js";
import { largeNow } from "../scale.js";
import { tierBadge } from "../versusx.js";
import { critOf } from "../ratingx.js";
import { esc, icon, errorToast, toast, plural, starsHtml, ratingClick, ratingFromInput, ratingToast, fmtDate, pop, burst, store } from "../ui.js";
import { t } from "../i18n.js";
import { getPerformer, updatePerformer, gql } from "../api.js";
import { openPerformerEditor } from "./perfedit.js";
import { mediaBrowser } from "./media.js";
import { go, setQuery } from "../main.js";
import { GENDERS, ageOf, countryOf } from "./performers.js";

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (e) {
    return u;
  }
};

import { mountSlots } from "../ext.js";

export async function render(main, params, query) {
  const p = await getPerformer(params.id);
  if (!p) {
    main.innerHTML = `<div class="kb-empty"><b>${t("This performer no longer exists")}</b><a class="kb-btn" href="#/performers">${t("All performers")}</a></div>`;
    return;
  }
  // All three always there (with their numbers) – you can look at images even when there are none yet;
  // it opens on the first kind that has something
  const kinds = ["scene", "image", "gallery"];
  const initialKind = kinds.find((k) => p[k + "_count"]) || "scene";

  const age = ageOf(p.birthdate, p.death_date);
  const gender = (GENDERS.find(([v]) => v === p.gender) || [])[1];
  const facts = [
    [t("Gender"), gender ? t(gender) : ""],
    [t("Born"), p.birthdate ? `${fmtDate(p.birthdate)}${age ? ` (${p.death_date ? t("died at {n}", { n: age }) : t("{n} years", { n: age })})` : ""}` : ""],
    [t("Died"), p.death_date ? fmtDate(p.death_date) : ""],
    [t("Country"), countryOf(p.country)],
    [t("Ethnicity"), p.ethnicity],
    [t("Height"), p.height_cm ? `${p.height_cm} cm` : ""],
    [t("Weight"), p.weight ? `${p.weight} kg` : ""],
    [t("Measurements"), p.measurements],
    [t("Hair"), p.hair_color],
    [t("Eyes"), p.eye_color],
    [t("Tattoos"), p.tattoos],
    [t("Piercings"), p.piercings],
  ].filter(([, v]) => v);

  main.innerHTML = `
    <header class="kb-perfhead">
      <button type="button" class="kb-perfhead-img" data-photo title="${t("Change photo")}"><img alt="" src="${esc(p.image_path || "")}"><span>${icon("camera")}${t("Change photo")}</span></button>
      <div class="kb-perfhead-body">
        <nav class="kb-crumbs"><span><a href="#/performers">${t("Performers")}</a></span></nav>
        <h1 class="kb-h1">${tierBadge(tierNow("performer", p.id))}${esc(p.name)}${p.disambiguation ? ` <small>(${esc(p.disambiguation)})</small>` : ""}</h1>
        ${p.alias_list && p.alias_list.length ? `<p class="kb-sub">${t("Also known as {names}", { names: p.alias_list.map(esc).join(", ") })}</p>` : ""}
        <p class="kb-sub">${[p.scene_count ? plural(p.scene_count, "scene", "scenes") : "", p.image_count ? plural(p.image_count, "image", "images") : "", p.gallery_count ? plural(p.gallery_count, "gallery", "galleries") : ""].filter(Boolean).join(t(", ")) || t("Nothing with this performer yet")}</p>
        <div class="kb-plc-acts">
          <div data-rate>${starsHtml(p.rating100, true)}</div>
          <button class="kb-plc-btn${p.favorite ? " is-on" : ""}" data-fav><span class="kb-dotmini"></span>${p.favorite ? t("Favorite") : t("Add to favorites")}</button>
          <button class="kb-plc-btn" data-advrate title="${t("Rate by several criteria – Stash's rating follows")}">★+ ${t("Detailed")}</button>
          ${p.o_counter ? `<span class="kb-plc-btn is-static" title="${t("O counter")}">${icon("drop")}${p.o_counter}</span>` : ""}
          <button class="kb-plc-btn" data-edit>${icon("edit")}${t("Edit")}</button>
          <button class="kb-plc-btn" data-addmedia title="${t("Link scenes, images and galleries to this performer")}">${icon("plus")}${t("Add scenes and images")}</button>
        </div>
        ${facts.length ? `<dl class="kb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${critOf("performer", p) ? `<div class="kb-critlist" title="${t("Detailed rating")}">${critOf("performer", p).map((c) => `<span class="kb-critchip"><b>${esc(c.name)}</b><i style="--v:${c.score * 20}%"></i><em>${c.score}</em></span>`).join("")}</div>` : ""}
        ${p.tags.length ? `<div class="kb-chips">${p.tags.map((tg) => `<a class="kb-chip" href="#/tag/${tg.id}">${esc(tg.name)}</a>`).join("")}</div>` : ""}
        ${p.urls && p.urls.length ? `<div class="kb-chips kb-perf-links">${p.urls.map((u) => `<a class="kb-chip" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(u))} ↗</a>`).join("")}</div>` : ""}
        <div class="kb-xhead" data-xhead></div>
        ${p.details ? `<p class="kb-lead kb-perf-details">${esc(p.details)}</p>` : ""}
      </div>
    </header>
    <div data-taglink></div>
    <section data-browser></section>`;
  const xhead = mountSlots("performer.header", main.querySelector("[data-xhead]"), { page: "performer", id: p.id, item: p }, { reload: () => go(location.hash.replace(/^#\/?/, ""), true) });
  const b = mediaBrowser(main.querySelector("[data-browser]"), { kinds, initialKind, query, page: "performer", params: { id: p.id }, base: () => ({ filter: { performers: { value: [p.id], modifier: "INCLUDES" } } }) });

  // A tag on a performer only describes them – it doesn't link anything. Items that carry one of the
  // performer's tags (e.g. a creator tag from a downloader), or lie in a folder named like the
  // performer (name, alias or one of their tags – e.g. "…\7sinns\"), but aren't linked get offered here.
  const KINDS = [
    ["scene", "findScenes", "scene_filter", "scenes", "bulkSceneUpdate", "BulkSceneUpdateInput"],
    ["image", "findImages", "image_filter", "images", "bulkImageUpdate", "BulkImageUpdateInput"],
    ["gallery", "findGalleries", "gallery_filter", "galleries", "bulkGalleryUpdate", "BulkGalleryUpdateInput"],
  ];
  const notLinked = `performers: { value: [${JSON.stringify(p.id)}], modifier: EXCLUDES }`;
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "Seven Sinns", "seven_sinns" and "seven-sinns" are the same folder name; at the end of a path too
  // (a folder gallery's path is the folder itself)
  const folderRe = (name) => "(?i)[\\\\/]" + name.trim().split(/[\s_.-]+/).map(reEsc).join("[ _.-]?") + "([\\\\/]|$)";
  const sources = () => {
    const out = p.tags.map((tg) => ({ key: tg.id, type: "tag", label: tg.name, filter: `{ tags: { value: [${JSON.stringify(tg.id)}], modifier: INCLUDES }, ${notLinked} }` }));
    const seen = new Set();
    for (const n of [p.name, ...(p.alias_list || []), ...p.tags.map((tg) => tg.name)]) {
      const k = String(n || "").trim().toLowerCase().replace(/[\s_.-]+/g, " ");
      if (k.length < 3 || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: "f:" + k, type: "folder", label: n.trim(), filter: `{ path: { value: ${JSON.stringify(folderRe(n))}, modifier: MATCHES_REGEX }, ${notLinked} }` });
    }
    return out;
  };
  const HIDE_KEY = "perfTagLinkHidden";
  async function offerLinks() {
    const box = main.querySelector("[data-taglink]");
    if (largeNow()) return (box.innerHTML = ""); // (a hint that counts the performer's scenes and images per tag – too much work on a big library)
    const hidden = new Set(store.get(HIDE_KEY, []));
    const list = sources().filter((s) => !hidden.has(p.id + ":" + s.key)).slice(0, 12);
    if (!list.length) return (box.innerHTML = "");
    try {
      const d = await gql(`query PerfTagLinks { ${list.map((s, i) => KINDS.map(([k, find, arg]) => `${k}${i}: ${find}(${arg}: ${s.filter}, filter: { per_page: 0 }) { count }`).join(" ")).join(" ")} }`);
      box.innerHTML = list
        .map((s, i) => {
          const n = KINDS.map(([k]) => [k, d[k + i].count]).filter(([, c]) => c);
          if (!n.length) return "";
          const what = n.map(([k, c]) => plural(c, k, { scene: "scenes", image: "images", gallery: "galleries" }[k])).join(t(", "));
          const text =
            s.type === "tag"
              ? t("{what} with the tag “{tag}” aren't linked to {name} yet – that's why they don't show here.", { what, tag: esc(s.label), name: esc(p.name) })
              : t("{what} in a folder named “{folder}” aren't linked to {name} yet – that's why they don't show here.", { what, folder: esc(s.label), name: esc(p.name) });
          return `<div class="kb-taglink" data-src="${i}">${icon(s.type === "tag" ? "tag" : "folder")}<span>${text}</span>
          <button type="button" class="kb-btn is-primary" data-linkall>${t("Link them")}</button><button type="button" class="kb-btn is-ghost" data-nolink>${s.type === "tag" ? t("Not this tag") : t("Not this folder")}</button></div>`;
        })
        .join("");
      box.sources = list;
    } catch (e) {
      box.innerHTML = ""; // only a hint – never in the way
    }
  }
  main.querySelector("[data-taglink]").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-src]");
    const box = e.currentTarget;
    if (!row || !box.sources) return;
    const src = box.sources[Number(row.dataset.src)];
    if (e.target.closest("[data-nolink]")) {
      store.set(HIDE_KEY, [...new Set([...store.get(HIDE_KEY, []), p.id + ":" + src.key])]);
      return row.remove();
    }
    const btn = e.target.closest("[data-linkall]");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = t("Linking …");
    try {
      let total = 0;
      for (const [, find, arg, list, bulk, type] of KINDS) {
        const r = await gql(`query PerfTagIds { ${find}(${arg}: ${src.filter}, filter: { per_page: -1 }) { ${list} { id } } }`, undefined, { heavy: true });
        const ids = r[find][list].map((x) => x.id);
        if (!ids.length) continue;
        await gql(`mutation($i: ${type}!) { ${bulk}(input: $i) { id } }`, { i: { ids, performer_ids: { ids: [p.id], mode: "ADD" } } });
        total += ids.length;
      }
      toast(t("{n} items linked to {name}", { n: total, name: p.name }), "ok");
      go("performer/" + p.id, true);
    } catch (err) {
      errorToast(err, "Link");
      btn.disabled = false;
      btn.textContent = t("Link them");
    }
  });
  offerLinks();

  // Rating: click a star, the same star again removes it
  const ratePerf = async (v) => {
    try {
      await updatePerformer({ id: p.id, rating100: v });
      p.rating100 = v;
      main.querySelector("[data-rate]").innerHTML = starsHtml(v, true);
      toast(ratingToast(v));
    } catch (err) {
      errorToast(err, "Rating");
    }
  };
  main.querySelector("[data-advrate]").addEventListener("click", async () => {
    const { openAdvRating } = await import("../advrating.js");
    openAdvRating("performer", p, { onChange: (it) => (main.querySelector("[data-rate]").innerHTML = starsHtml(it.rating100, true)) });
  });
  main.querySelector("[data-rate]").addEventListener("click", (e) => {
    const v = ratingClick(e, p.rating100);
    if (v !== undefined) ratePerf(v);
  });
  main.querySelector("[data-rate]").addEventListener("change", (e) => {
    const v = e.target.matches("[data-ratedec]") ? ratingFromInput(e.target) : undefined;
    if (v !== undefined) ratePerf(v);
  });

  main.querySelector("[data-fav]").onclick = async (e) => {
    const btn = e.currentTarget;
    const on = !p.favorite;
    try {
      await updatePerformer({ id: p.id, favorite: on });
      p.favorite = on;
      btn.classList.toggle("is-on", on);
      btn.innerHTML = `<span class="kb-dotmini"></span>${on ? t("Favorite") : t("Add to favorites")}`;
      const heart = btn.querySelector(".kb-dotmini");
      if (on) {
        pop(heart, 1.8);
        burst(heart, "heart", 7);
      }
      toast(on ? t("Marked as favorite") : t("Favorite removed"));
    } catch (err) {
      errorToast(err, "Favorite");
    }
  };

  // Edit everything, photo and scraping included
  const edit = (scrape) => openPerformerEditor(p.id, { scrape, onSaved: () => go("performer/" + p.id, true), onDeleted: () => go("performers", true) });
  main.querySelector("[data-edit]").onclick = () => edit(false);
  main.querySelector("[data-photo]").onclick = () => edit(false);
  main.querySelector("[data-addmedia]").onclick = async () => {
    const { openAddMedia } = await import("./perfadd.js");
    openAddMedia({ id: p.id, name: p.name }, () => go("performer/" + p.id, true));
  };
  if (query.edit === "1") {
    setQuery({ edit: "" });
    edit(true);
  }
  return () => {
    xhead.destroy();
    b.destroy();
  };
}
