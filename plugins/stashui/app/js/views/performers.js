// All performers as portrait cards: search, sort, gender, favorites only. Scrolling loads more.

import { getDef, defButton } from "../defsort.js";
import { esc, icon, debounce, errorToast, toast, plural, promptDialog, confirmDialog, starsHtml, pop, burst } from "../ui.js";
import { t, locale } from "../i18n.js";
import { findPerformers, updatePerformer, createPerformer, destroyPerformers, gql, routeSignal } from "../api.js";
import { go, setQuery } from "../main.js";
import { ensureTiers, hasTiers, tierNow } from "../tiers.js";
import { restrictIds, critInfo, parseCrit, critStr, critText, sortByCrit, openCritFilter } from "../ratingx.js";
import { findIds, lookTokens } from "../api.js";
import { TIERS, tierBadge } from "../versusx.js";
import { tagPicker } from "./tagpicker.js";

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
  ["local:fake_tits", "Natural / enhanced (A–Z)"],
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

export function performerCard(p, pick) {
  const age = ageOf(p.birthdate);
  const sub = [p.scene_count ? plural(p.scene_count, "scene", "scenes") : "", age ? t("{n} years", { n: age }) : ""].filter(Boolean).join(" · ");
  return `<a class="kb-perf" href="#/performer/${p.id}" data-pid="${p.id}">
    <span class="kb-perf-img"><img alt="" loading="lazy" src="${esc(p.image_path || "")}">
      <button type="button" class="kb-perf-fav${p.favorite ? " is-on" : ""}" data-pfav title="${p.favorite ? t("Remove from favorites") : t("Add to favorites")}">${icon("heart")}</button>
      ${tierNow("performer", p.id) ? `<span class="kb-tierpos">${tierBadge(tierNow("performer", p.id))}</span>` : ""}
      ${p.o_counter ? `<span class="kb-perf-o">${icon("drop")}${p.o_counter}</span>` : ""}
      ${pick === true ? `<span class="kb-pick kb-perf-pick" role="checkbox" aria-checked="false" aria-label="${t("Select")}">${icon("check")}</span>` : ""}</span>
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
    btn.title = on ? t("Remove from favorites") : t("Add to favorites");
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
        <button type="button" class="kb-btn" data-tagbtn aria-expanded="false" title="${esc(t("Filter by the performers' own tags"))}">${icon("tag")}<span>${t("Tags")}</span></button>
        <button type="button" class="kb-btn" data-attrbtn aria-expanded="false" title="${esc(t("Filter by eye color, hair color, ethnicity or country"))}">${icon("sliders")}<span>${t("Looks")}</span></button>
        <button type="button" class="kb-btn${query.fav === "1" ? " is-on" : ""}" data-favonly aria-pressed="${query.fav === "1"}">${icon("heart")}${t("Favorites")}</button>
        <button type="button" class="kb-btn" data-selmode aria-pressed="false" title="${esc(t("Tick performers to delete several at once"))}">${icon("select")}${t("Select")}</button>
        <button type="button" class="kb-btn" data-new>${icon("plus")}${t("New performer")}</button>
      </div>
    </header>
    <div class="kb-perf-attrs kb-perf-tagp" data-tagpanel hidden>
      <div class="kb-tagpick kb-perf-tagbox" data-tagbox></div>
      <span class="kb-seg" data-tagmode><button type="button" data-m="all">${t("Match all tags")}</button><button type="button" data-m="any">${t("Match any tag")}</button></span>
    </div>
    <div class="kb-perf-attrs" data-attrs hidden></div>
    <div class="kb-perfgrid" data-list><div class="kb-loading">${t("Loading …")}</div></div>
    <div class="kb-perf-more" data-more></div>`;
  const $ = (s) => main.querySelector(s);
  const dflt = getDef("performers").startsWith("crit:") ? "" : getDef("performers"); // (a detailed-rating sort is only known after the criteria are loaded)
  $("[data-sort]").value = query.sort || dflt || "name";
  defButton($("[data-sort]"), () => "performers", () => ($("[data-sort]").value.startsWith("crit:") ? "" : $("[data-sort]").value));
  $("[data-gender]").value = query.gender || "";
  let favOnly = query.fav === "1";
  // Looks: what the performers themselves say about eyes, hair, ethnicity and country (the "Blue Eyes" you search for may
  // be a tag of a scene – this is the performer's own field)
  const ATTRS = [
    ["eye_color", "eye", "Eye color"],
    ["hair_color", "hair", "Hair color"],
    ["ethnicity", "eth", "Ethnicity"],
    ["country", "country", "Country"],
    ["fake_tits", "body", "Natural or enhanced"],
  ];
  const looks = Object.fromEntries(ATTRS.map(([f, k]) => [f, query[k] || ""]));
  const looksOn = () => ATTRS.some(([f]) => looks[f]);
  let distinct = null; // field → [[value, count]] – asked once, when the panel is first opened
  const paintLooks = async () => {
    const box = $("[data-attrs]");
    if (!distinct) {
      box.innerHTML = `<span class="kb-hint">${t("Loading …")}</span>`;
      try {
        const d = await gql(`query PerfLooks { findPerformers(filter: { per_page: -1 }) { performers { eye_color hair_color ethnicity country fake_tits } } }`, {}, { heavy: true });
        distinct = {};
        for (const [f] of ATTRS) {
          const n = new Map();
          for (const p of d.findPerformers.performers) {
            for (const v of lookTokens(f, p[f])) n.set(v, (n.get(v) || 0) + 1);
          }
          distinct[f] = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        }
      } catch (e) {
        box.innerHTML = `<span class="kb-hint kb-pe-err">${esc(e.message)}</span>`;
        return;
      }
    }
    box.innerHTML =
      ATTRS.map(
        ([f, , label]) =>
          `<select class="kb-field" data-look="${f}" aria-label="${esc(t(label))}"><option value="">${t(label)}</option>${(distinct[f] || [])
            .map(([v, n]) => `<option value="${esc(v)}"${looks[f] === v ? " selected" : ""}>${esc(f === "country" ? countryOf(v) : v)} (${n})</option>`)
            .join("")}</select>`,
      ).join("") + (looksOn() ? `<button type="button" class="kb-btn is-ghost" data-looksclear>${t("Clear")}</button>` : "");
  };
  const showLooks = (on) => {
    const box = $("[data-attrs]");
    box.hidden = !on;
    $("[data-attrbtn]").setAttribute("aria-expanded", String(on));
    $("[data-attrbtn]").classList.toggle("is-on", on || looksOn());
    if (on) paintLooks();
  };
  if (looksOn()) showLooks(true);
  // Tags: the performer's own tags – several at once, right-click a chip = leave out, all of them or any of them
  let ptags = { inc: (query.ptags || "").split(",").filter(Boolean), exc: (query.ptagsx || "").split(",").filter(Boolean), any: query.ptany === "1" };
  const tagsOn = () => ptags.inc.length > 0 || ptags.exc.length > 0;
  let tagPick = null;
  const paintTagMode = () => $("[data-tagmode]").querySelectorAll("[data-m]").forEach((b) => b.classList.toggle("is-on", (b.dataset.m === "any") === ptags.any));
  const showTags = (on) => {
    $("[data-tagpanel]").hidden = !on;
    $("[data-tagbtn]").setAttribute("aria-expanded", String(on));
    $("[data-tagbtn]").classList.toggle("is-on", on || tagsOn());
    if (on && !tagPick) {
      tagPick = tagPicker($("[data-tagbox]"), {
        include: ptags.inc,
        exclude: ptags.exc,
        allowExclude: true,
        placeholder: t("Filter by tag"),
        onChange: (inc, exc) => {
          ptags.inc = inc;
          ptags.exc = exc;
          $("[data-tagbtn]").classList.toggle("is-on", tagsOn() || !$("[data-tagpanel]").hidden);
          reload();
        },
      });
    }
    paintTagMode();
  };
  if (tagsOn()) showTags(true);
  let tiers = (query.tier || "").split(",").filter(Boolean);
  let crit = query.crit || "";
  let critAll = null; // sorted by a criterion: everything that matches, fetched once and ordered here
  let localAll = null; // the same for a text field (country …)
  // the criteria of the detailed rating: filter button, and a sort entry for each
  critInfo("performer")
    .then((info) => {
      const names = info.names.filter((n) => info.have.has(n));
      const sel = $("[data-sort]");
      sel.insertAdjacentHTML("beforeend", names.map((n) => `<option value="${esc("crit:" + n)}">${t("Detailed")}: ${esc(t(n))}</option>`).join(""));
      if (query.sort && query.sort.startsWith("crit:") && !names.includes(query.sort.slice(5))) sel.insertAdjacentHTML("beforeend", `<option value="${esc(query.sort)}">${t("Detailed")}: ${esc(t(query.sort.slice(5)))}</option>`);
      sel.value = query.sort || dflt || "name";
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
    if (tagsOn()) {
      // (a tag page's own tag counts as one more that has to match)
      const withPage = tagF && tagF.key === "tag";
      f.tags = { value: withPage ? [tagF.id, ...ptags.inc] : ptags.inc, excludes: ptags.exc, modifier: ptags.any && !withPage ? "INCLUDES" : "INCLUDES_ALL" };
    }
    if (tagF && tagF.key === "scenetag") f.scenes_filter = { tags: { value: [tagF.id], modifier: "INCLUDES" } };
    if (favOnly) f.filter_favorites = true;
    for (const [fld] of ATTRS) if (looks[fld]) f[fld] = { value: looks[fld], modifier: fld === "ethnicity" ? "INCLUDES" : "EQUALS" }; // ethnicity: a performer may name several
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
        const filtered = q || favOnly || $("[data-gender]").value || looksOn() || tagsOn();
        $("[data-list]").innerHTML = filtered
          ? `<div class="kb-empty"><b>${t("No performer found")}</b><p>${t("Try another search or filter.")}</p></div>`
          : `<div class="kb-empty"><b>${t("No performers yet")}</b><p>${t("Stash can fill them in from StashDB: Tasks → Identify (or the scene tagger in classic Stash). Or add one yourself with “New performer”.")}</p></div>`;
      } else if (reset) $("[data-list]").innerHTML = list.map((p) => performerCard(p, true)).join("");
      else $("[data-list]").insertAdjacentHTML("beforeend", r.performers.map((p) => performerCard(p, true)).join(""));
      page++;
      paintSel();
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
    setQuery({ q: $("[data-q]").value.trim(), sort: $("[data-sort]").value === ((getDef("performers").startsWith("crit:") ? "" : getDef("performers")) || "name") ? "" : $("[data-sort]").value, gender: $("[data-gender]").value, fav: favOnly ? "1" : "", ptags: ptags.inc.join(","), ptagsx: ptags.exc.join(","), ptany: ptags.any && ptags.inc.length > 1 ? "1" : "", ...Object.fromEntries(ATTRS.map(([f, k]) => [k, looks[f]])) });
    load(true);
  };
  $("[data-q]").addEventListener("input", debounce(reload, 250));
  $("[data-sort]").onchange = reload;
  $("[data-gender]").onchange = reload;
  $("[data-tagbtn]").onclick = () => showTags($("[data-tagpanel]").hidden);
  $("[data-tagmode]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    ptags.any = b.dataset.m === "any";
    paintTagMode();
    if (tagsOn()) reload();
  });
  $("[data-attrbtn]").onclick = () => showLooks($("[data-attrs]").hidden);
  $("[data-attrs]").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-look]");
    if (!sel) return;
    looks[sel.dataset.look] = sel.value;
    $("[data-attrbtn]").classList.toggle("is-on", looksOn() || !$("[data-attrs]").hidden);
    paintLooks();
    reload();
  });
  $("[data-attrs]").addEventListener("click", (e) => {
    if (!e.target.closest("[data-looksclear]")) return;
    ATTRS.forEach(([f]) => (looks[f] = ""));
    paintLooks();
    $("[data-attrbtn]").classList.toggle("is-on", !$("[data-attrs]").hidden);
    reload();
  });
  $("[data-favonly]").onclick = (e) => {
    favOnly = !favOnly;
    e.currentTarget.classList.toggle("is-on", favOnly);
    e.currentTarget.setAttribute("aria-pressed", favOnly);
    reload();
  };
  // Selection: tick the box on a card (shift = a stretch, ctrl = one more); once something is ticked – or "Select" is on – a click
  // on a card ticks it instead of opening it. The bar at the bottom deletes what is ticked.
  const sel = new Set();
  let selMode = false;
  let lastPick = "";
  let bar = null;
  const selecting = () => selMode || sel.size > 0;
  function paintSel() {
    const grid = $("[data-list]");
    if (!grid) return;
    grid.classList.toggle("is-selecting", selecting());
    grid.querySelectorAll("[data-pid]").forEach((c) => {
      const on = sel.has(c.dataset.pid);
      c.classList.toggle("is-picked", on);
      const box = c.querySelector(".kb-perf-pick");
      if (box) box.setAttribute("aria-checked", String(on));
    });
    $("[data-selmode]").classList.toggle("is-on", selMode);
    $("[data-selmode]").setAttribute("aria-pressed", String(selMode));
    paintBar();
  }
  function paintBar() {
    if (!sel.size) {
      if (bar) bar.remove();
      bar = null;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "kb-bulk";
      document.body.appendChild(bar);
      bar.addEventListener("click", onBar);
    }
    const more = total > list.length && sel.size < total;
    bar.innerHTML = `<b>${t("{what} selected", { what: plural(sel.size, "performer", "performers") })}</b>
      <button class="kb-btn" data-b="all">${more ? t("Select all {n} found", { n: total }) : t("Select all")}</button>
      <button class="kb-btn is-danger" data-b="delete">${icon("trash")}${t("Delete")}</button>
      <span class="kb-spacer"></span>
      <button class="kb-btn" data-b="none">${t("Done")}</button>`;
  }
  async function onBar(e) {
    const b = e.target.closest("[data-b]");
    if (!b) return;
    try {
      if (b.dataset.b === "none") {
        sel.clear();
        selMode = false;
        return paintSel();
      }
      if (b.dataset.b === "all") {
        if (total > list.length) {
          b.disabled = true;
          const q = $("[data-q]").value.trim();
          const ids = await restrictIds("performer", { tier: tiers, crit, sort: $("[data-sort]").value });
          const all = await findIds("performer", { q: q || undefined, per_page: -1 }, filter(), ids);
          all.items.forEach((x) => sel.add(x.id));
        } else list.forEach((x) => sel.add(x.id));
        return paintSel();
      }
      if (b.dataset.b === "delete") {
        const ids = [...sel];
        const names = ids.map((id) => (list.find((x) => x.id === id) || {}).name).filter(Boolean);
        const r = await confirmDialog({
          title: t("Delete {what}?", { what: plural(ids.length, "performer", "performers") }),
          text: (names.length && names.length <= 6 ? names.join(", ") + ". " : "") + t("The performers disappear from Stash. Their scenes, images and galleries stay – only the link to the performer is removed. This can't be undone."),
          ok: t("Delete"),
          danger: true,
        });
        if (!r.ok) return;
        b.disabled = true;
        await destroyPerformers(ids);
        const gone = new Set(ids);
        list = list.filter((x) => !gone.has(x.id));
        total = Math.max(0, total - ids.length);
        main.querySelectorAll("[data-pid]").forEach((c) => gone.has(c.dataset.pid) && c.remove());
        sel.clear();
        selMode = false;
        $("[data-sub]").textContent = plural(total, "performer", "performers");
        toast(t("{what} deleted", { what: plural(ids.length, "performer", "performers") }), "ok");
        paintSel();
        if (!list.length && total) load(true);
        else requestAnimationFrame(fillMore);
      }
    } catch (err) {
      errorToast(err, "Action failed");
      b.disabled = false;
    }
  }
  function toggleSel(id, range) {
    const ids = list.map((x) => x.id);
    if (range && lastPick && ids.includes(lastPick) && ids.includes(id)) {
      const [a, z] = [ids.indexOf(lastPick), ids.indexOf(id)].sort((x, y) => x - y);
      const on = !sel.has(id);
      ids.slice(a, z + 1).forEach((i) => (on ? sel.add(i) : sel.delete(i)));
    } else sel.has(id) ? sel.delete(id) : sel.add(id);
    lastPick = id;
    paintSel();
  }
  $("[data-selmode]").onclick = () => {
    selMode = !selMode;
    paintSel();
  };
  $("[data-list]").addEventListener("click", (e) => {
    const card = e.target.closest("[data-pid]");
    const b = e.target.closest("[data-pfav]");
    if (card && !b && (e.target.closest(".kb-perf-pick") || selecting() || e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      return toggleSel(card.dataset.pid, e.shiftKey);
    }
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
  return () => {
    io.disconnect();
    if (bar) bar.remove();
  };
}
