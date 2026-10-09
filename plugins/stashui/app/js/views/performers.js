// All performers as portrait cards: search, sort, gender, favorites only. Scrolling loads more.

import { esc, icon, debounce, errorToast, toast, plural, promptDialog, starsHtml, pop, burst } from "../ui.js";
import { t, locale } from "../i18n.js";
import { findPerformers, updatePerformer, createPerformer, gql, routeSignal } from "../api.js";
import { go, setQuery } from "../main.js";
import { ensureTiers, hasTiers, tierNow } from "../tiers.js";
import { restrictIds, critInfo, parseCrit, critStr, critText, sortByCrit, openCritFilter } from "../ratingx.js";
import { findIds } from "../api.js";
import { TIERS, tierBadge } from "../versusx.js";

// Value = "<Stash sort field>[:ASC|DESC]" (Stash does the sorting), or "local:<field>" for text fields Stash can't sort by:
// those are fetched once and ordered here (empty values always last)
const SORTS = [
  ["name", "Alphabetical"],
  ["name:DESC", "Alphabetical (Z–A)"],
  ["birthdate:DESC", "Youngest first"],
  ["birthdate:ASC", "Oldest first"],
  ["local:country", "Country (A–Z)"],
  ["local:ethnicity", "Ethnicity (A–Z)"],
  ["local:hair_color", "Hair color (A–Z)"],
  ["local:eye_color", "Eye color (A–Z)"],
  ["height:DESC", "Tallest first"],
  ["height:ASC", "Shortest first"],
  ["weight:DESC", "Heaviest first"],
  ["weight:ASC", "Lightest first"],
  ["scenes_count", "Most scenes"],
  ["scenes_count:ASC", "Fewest scenes"],
  ["images_count", "Most images"],
  ["tag_count", "Most tags"],
  ["o_counter", "O counter"],
  ["rating", "Rating"],
  ["play_count", "Most watched"],
  ["created_at", "Recently added"],
  ["created_at:ASC", "Oldest additions"],
  ["updated_at", "Recently changed"],
  ["random", "Random"],
];

// Everything that matches, ordered by a text field here (Stash can't sort by it): ids in order
async function localOrder(sortV, q, filter, ids) {
  const [, field, dir = "ASC"] = sortV.split(":");
  const d = await gql(`query PerfLocalSort($f: FindFilterType, $p: PerformerFilterType, $ids: [ID!]) { findPerformers(filter: $f, performer_filter: $p, ids: $ids) { performers { id name ${field} } } }`, { f: { q: q || undefined, per_page: -1 }, p: filter, ids: ids || null }, { signal: routeSignal(), heavy: true });
  const val = (p) => String(field === "country" ? countryOf(p[field]) : p[field] || "").trim();
  const col = new Intl.Collator(locale(), { numeric: true, sensitivity: "base" });
  const sign = dir === "DESC" ? -1 : 1;
  return d.findPerformers.performers
    .slice()
    .sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (!x !== !y) return x ? -1 : 1; // nothing filled in: last, whichever way
      return (x && y ? sign * col.compare(x, y) : 0) || col.compare(a.name, b.name);
    })
    .map((p) => p.id);
}
export const GENDERS = [
  ["FEMALE", "Female"],
  ["MALE", "Male"],
  ["TRANSGENDER_FEMALE", "Trans female"],
  ["TRANSGENDER_MALE", "Trans male"],
  ["NON_BINARY", "Non-binary"],
  ["INTERSEX", "Intersex"],
];
const PAGE = 60;

export function ageOf(birth, until) {
  if (!birth) return 0;
  const b = new Date(birth);
  const e = until ? new Date(until) : new Date();
  let a = e.getFullYear() - b.getFullYear();
  if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) a--;
  return a > 0 && a < 130 ? a : 0;
}

// "US" → "United States" in the interface language. Stash usually keeps the two-letter code; anything else stays as it is.
// (No flag emoji: Windows shows those as plain letters.)
export function countryOf(c) {
  if (!c) return "";
  if (!/^[A-Za-z]{2}$/.test(c)) return c;
  try {
    return new Intl.DisplayNames([locale()], { type: "region" }).of(c.toUpperCase()) || c;
  } catch (e) {
    return c;
  }
}

export function performerCard(p) {
  const age = ageOf(p.birthdate);
  const sub = [p.scene_count ? plural(p.scene_count, "scene", "scenes") : "", age ? t("{n} years", { n: age }) : ""].filter(Boolean).join(" · ");
  return `<a class="kb-perf" href="#/performer/${p.id}" data-pid="${p.id}">
    <span class="kb-perf-img"><img alt="" loading="lazy" src="${esc(p.image_path || "")}">
      <button type="button" class="kb-perf-fav${p.favorite ? " is-on" : ""}" data-pfav title="${t("Favorite")}">${icon("heart")}</button>
      ${tierNow("performer", p.id) ? `<span class="kb-tierpos">${tierBadge(tierNow("performer", p.id))}</span>` : ""}
      ${p.o_counter ? `<span class="kb-perf-o">${icon("drop")}${p.o_counter}</span>` : ""}</span>
    <b>${esc(p.name)}${p.disambiguation ? ` <small>(${esc(p.disambiguation)})</small>` : ""}</b>
    <small>${sub || "&nbsp;"}</small>
    ${p.rating100 ? starsHtml(p.rating100) : ""}
  </a>`;
}

// Heart on a card: favorite on/off without opening the performer
export async function toggleCardFav(btn, list) {
  const card = btn.closest("[data-pid]");
  const p = list.find((x) => x.id === card.dataset.pid);
  if (!p) return;
  const on = !p.favorite;
  try {
    await updatePerformer({ id: p.id, favorite: on });
    p.favorite = on;
    btn.classList.toggle("is-on", on);
    if (on) {
      pop(btn, 1.5);
      burst(btn, "heart", 6);
    }
    toast(on ? t("Marked as favorite") : t("Favorite removed"));
  } catch (e) {
    errorToast(e, "Favorite");
  }
}

export async function render(main, params, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Performers")}</h1>
        <p class="kb-sub" data-sub></p>
        <div class="kb-chips kb-head-chips" data-tagf hidden></div>
      </div>
      <div class="kb-head-tools">
        <label class="kb-search">${icon("search")}<input class="kb-field" type="search" data-q placeholder="${t("Search performers")}" value="${esc(query.q || "")}"></label>
        <select class="kb-field" data-sort aria-label="${t("Sort order")}">${SORTS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
        <select class="kb-field" data-gender aria-label="${t("Gender")}"><option value="">${t("Everyone")}</option>${GENDERS.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join("")}</select>
        <button type="button" class="kb-btn" data-critopen hidden>${icon("sliders")}<span data-crittext>${t("Criteria …")}</span></button>
        <span class="kb-seg kb-tierchips" data-tf hidden title="${t("Tier")}">${TIERS.map((x) => `<button type="button" data-tier="${x.k}" style="--tc:${x.color}">${x.k}</button>`).join("")}</span>
        <button type="button" class="kb-btn${query.fav === "1" ? " is-on" : ""}" data-favonly aria-pressed="${query.fav === "1"}">${icon("heart")}${t("Favorites")}</button>
        <button type="button" class="kb-btn" data-new>${icon("plus")}${t("New performer")}</button>
      </div>
    </header>
    <div class="kb-perfgrid" data-list><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  $("[data-sort]").value = query.sort || "name";
  $("[data-gender]").value = query.gender || "";
  let favOnly = query.fav === "1";
  let tiers = (query.tier || "").split(",").filter(Boolean);
  let crit = query.crit || "";
  let critAll = null; // sorted by a criterion: everything that matches, fetched once and ordered here
  let localAll = null; // the same for a text field (country …)
  // the criteria of the detailed rating: filter button, and a sort entry for each
  critInfo("performer")
    .then((info) => {
      const names = info.names.filter((n) => info.have.has(n));
      const sel = $("[data-sort]");
      sel.insertAdjacentHTML("beforeend", names.map((n) => `<option value="${esc("crit:" + n)}">${t("Detailed")}: ${esc(n)}</option>`).join(""));
      if (query.sort && query.sort.startsWith("crit:") && !names.includes(query.sort.slice(5))) sel.insertAdjacentHTML("beforeend", `<option value="${esc(query.sort)}">${t("Detailed")}: ${esc(query.sort.slice(5))}</option>`);
      sel.value = query.sort || "name";
      $("[data-critopen]").hidden = !names.length && !crit;
      if (crit) $("[data-crittext]").textContent = critText(parseCrit(crit));
    })
    .catch(() => {});
  main.addEventListener("click", (e) => {
    if (!e.target.closest("[data-critopen]")) return;
    openCritFilter("performer", parseCrit(crit), (l) => {
      crit = critStr(l);
      $("[data-crittext]").textContent = l.length ? critText(l) : t("Criteria …");
      setQuery({ crit });
      load(true);
    });
  });
  ensureTiers().then(() => {
    $("[data-tf]").hidden = !hasTiers("performer") && !tiers.length;
    main.querySelectorAll("[data-tf] [data-tier]").forEach((b) => b.classList.toggle("is-on", tiers.includes(b.dataset.tier)));
  });
  main.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tf] [data-tier]");
    if (!b) return;
    const k = b.dataset.tier;
    tiers = tiers.includes(k) ? tiers.filter((x) => x !== k) : [...tiers, k];
    b.classList.toggle("is-on", tiers.includes(k));
    setQuery({ tier: tiers.join(",") });
    load(true);
  });
  let list = [];
  let page = 1;
  let total = 0;
  let loading = false;
  let run = 0;

  // From a tag page: performers with that tag, or in scenes that have it
  let tagF = query.tag ? { key: "tag", id: query.tag } : query.scenetag ? { key: "scenetag", id: query.scenetag } : null;
  if (tagF)
    gql(`query($id: ID!) { findTag(id: $id) { name } }`, { id: tagF.id })
      .then((d) => {
        if (!tagF || !d.findTag) return;
        const box = $("[data-tagf]");
        box.hidden = false;
        box.innerHTML = `<span class="kb-chip is-on">${icon("tag")}${esc(tagF.key === "tag" ? t("Tagged “{name}”", { name: d.findTag.name }) : t("In scenes tagged “{name}”", { name: d.findTag.name }))}<button type="button" data-untag aria-label="${esc(t("Remove"))}">×</button></span>`;
      })
      .catch(() => {});
  main.addEventListener("click", (e) => {
    if (!e.target.closest("[data-untag]")) return;
    setQuery({ tag: "", scenetag: "" });
    tagF = null;
    $("[data-tagf]").hidden = true;
    load(true);
  });
  function filter() {
    const f = {};
    if (tagF && tagF.key === "tag") f.tags = { value: [tagF.id], modifier: "INCLUDES" };
    if (tagF && tagF.key === "scenetag") f.scenes_filter = { tags: { value: [tagF.id], modifier: "INCLUDES" } };
    if (favOnly) f.filter_favorites = true;
    const g = $("[data-gender]").value;
    if (g) f.gender = { value: g, modifier: "EQUALS" };
    return f;
  }

  async function load(reset) {
    if (loading && !reset) return;
    const my = ++run;
    loading = true;
    if (reset) {
      page = 1;
      list = [];
    }
    try {
      const q = $("[data-q]").value.trim();
      await ensureTiers();
      const sortV = $("[data-sort]").value;
      const ids = await restrictIds("performer", { tier: tiers, crit, sort: sortV });
      let r;
      if (sortV.startsWith("crit:") || sortV.startsWith("local:")) {
        let order;
        if (sortV.startsWith("local:")) {
          if (reset || !localAll) localAll = localOrder(sortV, q, filter(), ids);
          order = await localAll;
        } else {
          if (reset || !critAll) critAll = findIds("performer", { q: q || undefined, per_page: -1 }, filter(), ids).then((all) => sortByCrit("performer", sortV.slice(5), all.items, "DESC")).then((l) => l.map((x) => x.id));
          order = await critAll;
        }
        const pageIds = order.slice((page - 1) * PAGE, page * PAGE);
        const got = pageIds.length ? await findPerformers({ perPage: pageIds.length, ids: pageIds }) : { performers: [] };
        const byId = new Map(got.performers.map((x) => [x.id, x]));
        r = { count: order.length, performers: pageIds.map((id) => byId.get(id)).filter(Boolean) };
      } else {
        const [skey, sdir] = sortV.split(":");
        r = await findPerformers({ q, page, perPage: PAGE, sort: skey, dir: sdir, filter: filter(), ids });
      }
      if (my !== run) return;
      total = r.count;
      list = list.concat(r.performers);
      $("[data-sub]").textContent = plural(total, "performer", "performers");
      if (!list.length) {
        const filtered = q || favOnly || $("[data-gender]").value;
        $("[data-list]").innerHTML = filtered
          ? `<div class="kb-empty"><b>${t("No performer found")}</b><p>${t("Try another search or filter.")}</p></div>`
          : `<div class="kb-empty"><b>${t("No performers yet")}</b><p>${t("Stash can fill them in from StashDB: Tasks → Identify (or the scene tagger in classic Stash). Or add one yourself with “New performer”.")}</p></div>`;
      } else if (reset) $("[data-list]").innerHTML = list.map(performerCard).join("");
      else $("[data-list]").insertAdjacentHTML("beforeend", r.performers.map(performerCard).join(""));
      page++;
    } catch (e) {
      if (my === run) $("[data-list]").innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the performers")}</b><p>${esc(e.message)}</p></div>`;
    } finally {
      if (my === run) {
        loading = false;
        requestAnimationFrame(fillMore); // the end of the list may still be in view (big screen, small cards) – the observer only reports changes
      }
    }
  }

  // More when the end of the grid comes into view
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && list.length < total && load(false), { rootMargin: "800px" });
  // Still more and the end of the list already in view after a page came in? Then the next page right away (the observer
  // above only fires when the end comes into view – with a tall screen the first page may never push it out again)
  function fillMore() {
    const el = $("[data-more]");
    if (el && el.isConnected && !loading && list.length < total && el.getBoundingClientRect().top < innerHeight + 800) load(false);
  }
  io.observe($("[data-more]"));

  const reload = () => {
    setQuery({ q: $("[data-q]").value.trim(), sort: $("[data-sort]").value === "name" ? "" : $("[data-sort]").value, gender: $("[data-gender]").value, fav: favOnly ? "1" : "" });
    load(true);
  };
  $("[data-q]").addEventListener("input", debounce(reload, 250));
  $("[data-sort]").onchange = reload;
  $("[data-gender]").onchange = reload;
  $("[data-favonly]").onclick = (e) => {
    favOnly = !favOnly;
    e.currentTarget.classList.toggle("is-on", favOnly);
    e.currentTarget.setAttribute("aria-pressed", favOnly);
    reload();
  };
  $("[data-list]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pfav]");
    if (!b) return;
    e.preventDefault();
    toggleCardFav(b, list);
  });
  $("[data-new]").onclick = async () => {
    const name = await promptDialog({ title: t("New performer"), label: t("Name"), ok: t("Create") });
    if (!name || !name.trim()) return;
    try {
      const p = await createPerformer(name.trim());
      go("performer/" + p.id + "?edit=1"); // straight into the editor, already searching by the name
    } catch (e) {
      errorToast(e, "Create performer");
    }
  };
  load(true);
  return () => io.disconnect();
}
