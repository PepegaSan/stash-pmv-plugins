// Advanced rating: rate a scene or performer by several criteria (0–5 each); Stash's own rating is the
// weighted result. The scores live in tags, so they show up everywhere in Stash and survive without this UI:
//   parent tag  "Advanced Rating System" (scenes) / "Advanced Performer Rating" (performers)
//   criterion   "<Name> ★"            (child of the parent)
//   score       "<Name> ★: 0" … "<Name> ★: 5"   (children of the criterion)
// The criteria, groups and weights are kept in Stash UI's plugin settings (advRating). Inspired by the
// "Advanced Rating" plugin on discourse.stashapp.cc – the tag names are the same, so ratings carry over.
//
// Rating = for each group the weighted mean of its rated criteria; then the weighted mean of the groups
// (groups without a rated criterion don't count); × 20, snapped to the rating precision chosen in Stash.

import { gql, pluginConfig, setPluginConfig, updateItem, updatePerformer } from "./api.js";
import { esc, icon, toast, errorToast, openDrawer, confirmDialog, ratingSystem, ratingText } from "./ui.js";
import { t } from "./i18n.js";
import { logEvent } from "./eventlog.js";

export const PARENT = { scene: "Advanced Rating System", performer: "Advanced Performer Rating" };
const crit = (name) => `${name} ★`;
const scoreName = (name, n) => `${name} ★: ${n}`;
const SCORE_RE = /^(.*) ★: ([0-5])$/;

const c = (name, weight = 1, desc = "") => ({ name, weight, enabled: true, desc });
export const defaults = (kind) =>
  kind === "performer"
    ? {
        groups: [
          { name: "Physical", weight: 1, criteria: [c("Face"), c("Breasts"), c("Ass"), c("Body"), c("Genitals")] },
          { name: "Performance", weight: 1, criteria: [c("Technique"), c("Energy"), c("Sluttiness")] },
        ],
      }
    : {
        groups: [{ name: "Overall", weight: 1, criteria: [c("Production Quality", 1, "Picture, sound, editing"), c("Chemistry"), c("Performance"), c("Creativity"), c("Rewatch Value")] }],
      };

// ---------- Settings ----------
export async function loadConfig(kind) {
  try {
    const all = JSON.parse((await pluginConfig("stashui")).advRating || "{}") || {};
    const g = all[kind] && Array.isArray(all[kind].groups) && all[kind].groups.length ? all[kind] : null;
    return g ? JSON.parse(JSON.stringify(g)) : defaults(kind);
  } catch (e) {
    return defaults(kind);
  }
}
export async function saveConfig(kind, cfg) {
  let all = {};
  try {
    all = JSON.parse((await pluginConfig("stashui")).advRating || "{}") || {};
  } catch (e) { /* none yet */ }
  all[kind] = cfg;
  await setPluginConfig("stashui", { advRating: JSON.stringify(all) });
}

// ---------- Calculation ----------
// scores: { "<criterion name>": 0–5 } → { rating (rating100 or null), groups: [{ name, weight, avg, items: [{ name, weight, score }] }], overall }
export function compute(cfg, scores) {
  const groups = [];
  for (const g of cfg.groups) {
    const items = g.criteria.filter((x) => x.enabled && scores[x.name] != null).map((x) => ({ name: x.name, weight: Number(x.weight) > 0 ? Number(x.weight) : 1, score: scores[x.name] }));
    if (!items.length) continue;
    const w = items.reduce((s, i) => s + i.weight, 0);
    groups.push({ name: g.name, weight: Number(g.weight) > 0 ? Number(g.weight) : 1, avg: items.reduce((s, i) => s + i.weight * i.score, 0) / w, items });
  }
  if (!groups.length) return { rating: null, groups, overall: null };
  const gw = groups.reduce((s, g) => s + g.weight, 0);
  const overall = groups.reduce((s, g) => s + g.weight * g.avg, 0) / gw;
  const rs = ratingSystem();
  const step = rs.type === "decimal" ? 1 : rs.step * 20; // in rating100 units
  const rating = Math.min(100, Math.max(1, Math.round((overall * 20) / step) * step));
  return { rating, groups, overall };
}
// the scores an item has: from its tags "<Name> ★: n"
export function scoresOf(item) {
  const out = {};
  for (const tg of item.tags || []) {
    const m = SCORE_RE.exec(tg.name);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

// ---------- Tags ----------
export async function tagIndex() {
  const d = await gql(`query AdvTags { s: findTags(tag_filter: { name: { value: "★", modifier: INCLUDES } }, filter: { per_page: -1 }) { tags { id name } } p: findTags(tag_filter: { name: { value: "Advanced", modifier: INCLUDES } }, filter: { per_page: -1 }) { tags { id name } } }`);
  const idx = new Map();
  [...d.s.tags, ...d.p.tags].forEach((x) => idx.set(x.name, x.id));
  return idx;
}
async function makeTag(idx, name, parent) {
  if (idx.has(name)) return idx.get(name);
  const d = await gql(`mutation AdvCreateTag($i: TagCreateInput!) { tagCreate(input: $i) { id name } }`, { i: Object.assign({ name }, parent ? { parent_ids: [parent] } : {}) });
  idx.set(name, d.tagCreate.id);
  return d.tagCreate.id;
}
// all tags the configuration needs (made when missing); returns the index name → id
export async function ensureTags(kind, cfg, idx) {
  idx = idx || (await tagIndex());
  const parent = await makeTag(idx, PARENT[kind]);
  for (const g of cfg.groups)
    for (const x of g.criteria) {
      if (!x.enabled) continue;
      const cid = await makeTag(idx, crit(x.name), parent);
      for (let n = 0; n <= 5; n++) await makeTag(idx, scoreName(x.name, n), cid);
    }
  return idx;
}

const update = (kind, input) => (kind === "performer" ? updatePerformer(input) : updateItem(kind, input));

// Give one criterion a score (null: take it away) – the tags change, and Stash's rating follows
export async function setScore(kind, item, cfg, name, n) {
  const idx = await ensureTags(kind, cfg);
  const keep = (item.tags || []).filter((tg) => {
    const m = SCORE_RE.exec(tg.name);
    return !(m && m[1] === name);
  });
  const tags = n == null ? keep : [...keep, { id: idx.get(scoreName(name, n)), name: scoreName(name, n) }];
  const res = compute(cfg, scoresOf({ tags }));
  const input = { id: item.id, tag_ids: tags.map((x) => x.id) };
  if (res.rating != null) input.rating100 = res.rating;
  await update(kind, input);
  item.tags = tags;
  if (res.rating != null) item.rating100 = res.rating;
  logEvent("rating", "info", n == null ? "{crit} cleared for {r0}" : "{crit}: {n} for {r0} – rating {rating}", { crit: name, n: n == null ? 0 : n, rating: res.rating == null ? "–" : res.rating }, [{ k: kind, id: item.id, name: item.title || item.name || item.id }]);
  return res;
}

// ---------- Rating drawer ----------
// the same stars as in the info bar (.kb-stars: hover lights up to the star, the new ones pop in after a click)
const stars = (score, name) =>
  `<span class="kb-stars" role="group" aria-label="${esc(name)}">` +
  [1, 2, 3, 4, 5].map((i) => `<button type="button" data-star="${i}" data-crit="${esc(name)}" class="${score != null && score >= i ? "is-on" : ""}" aria-label="${t("{n} stars", { n: i })}">★</button>`).join("") +
  "</span>";

export async function openAdvRating(kind, item, { onChange } = {}) {
  let cfg = await loadConfig(kind);
  const dr = openDrawer({ title: t("Detailed rating"), body: "", foot: `<button type="button" class="kb-btn is-ghost" data-custom>${t("Customize …")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-done>${t("Done")}</button>` });
  const el = dr.el;
  el.classList.add("kb-adv");
  const body = el.querySelector(".kb-drawer-body") || el;
  let curRow = 0; // keyboard: the row the number keys rate
  const paint = () => {
    const scores = scoresOf(item);
    const res = compute(cfg, scores);
    const rows = cfg.groups
      .map((g) => {
        const cs = g.criteria.filter((x) => x.enabled);
        if (!cs.length) return "";
        return `<section class="kb-adv-group"><h3 class="kb-fsp-h">${esc(g.name)}</h3>${cs
          .map((x) => {
            const s = scores[x.name];
            return `<div class="kb-adv-row${s == null ? " is-unrated" : ""}" data-row="${esc(x.name)}" ${x.desc ? `title="${esc(x.desc)}"` : ""}><b>${esc(x.name)}</b>
              ${stars(s, x.name)}
              <button type="button" class="kb-adv-zero${s === 0 ? " is-on" : ""}" data-zero data-crit="${esc(x.name)}" title="${t("Rate 0")}">0</button>
              <button type="button" class="kb-adv-clear" data-clear="${esc(x.name)}" title="${t("Not rated")}" ${s == null ? "hidden" : ""}>×</button></div>`;
          })
          .join("")}</section>`;
      })
      .join("");
    const unrated = cfg.groups.reduce((s, g) => s + g.criteria.filter((x) => x.enabled && scores[x.name] == null).length, 0);
    const detail = res.groups.length
      ? `<details class="kb-adv-detail"><summary>${t("Score breakdown")}</summary>${res.groups
          .map((g) => `<p><b>${esc(g.name)}</b> (× ${g.weight}): ${g.avg.toFixed(2)} / 5 <small>${g.items.map((i) => `${esc(i.name)} ${i.score}${i.weight !== 1 ? ` ×${i.weight}` : ""}`).join(" · ")}</small></p>`)
          .join("")}<p><b>${t("Overall")}:</b> ${res.overall.toFixed(2)} / 5 → ${esc(ratingText(res.rating))}</p></details>`
      : "";
    body.innerHTML = `<p class="kb-hint">${t("Rate each point from 1 to 5 (0 is allowed too). Stash's own rating follows – the weighted result of everything you rated.")}</p>
      <div class="kb-adv-top"><span>${t("Rating")}: <b>${item.rating100 ? esc(ratingText(item.rating100)) : "–"}</b></span>${unrated ? `<span class="kb-adv-badge">${t("{n} not rated", { n: unrated })}</span>` : ""}</div>
      ${rows}${detail}`;
    const rs = [...body.querySelectorAll(".kb-adv-row")];
    curRow = Math.min(curRow, Math.max(0, rs.length - 1));
    rs[curRow] && rs[curRow].classList.add("is-cur");
  };
  // ↑ ↓ choose the point, 0–5 rate it, Backspace takes the rating away
  const onKey = async (e) => {
    if (!el.isConnected) return document.removeEventListener("keydown", onKey, true);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const rs = [...body.querySelectorAll(".kb-adv-row")];
    if (!rs.length) return;
    let handled = true;
    if (e.key === "ArrowDown") curRow = (curRow + 1) % rs.length;
    else if (e.key === "ArrowUp") curRow = (curRow - 1 + rs.length) % rs.length;
    else if (/^[0-5]$/.test(e.key) || e.key === "Backspace" || e.key === "Delete") {
      const name = rs[curRow].dataset.row;
      const n = /^[0-5]$/.test(e.key) ? Number(e.key) : null;
      try {
        await setScore(kind, item, cfg, name, n === scoresOf(item)[name] ? null : n);
        onChange && onChange(item);
        if (n != null) curRow = (curRow + 1) % rs.length; // on to the next point
      } catch (er) {
        errorToast(er, "Rating");
      }
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    paint();
    body.querySelector(".kb-adv-row.is-cur")?.scrollIntoView({ block: "nearest" });
  };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-star], [data-zero], [data-clear]");
    try {
      if (b) {
        const name = b.dataset.crit || b.dataset.clear;
        const cur = scoresOf(item)[name];
        const n = b.dataset.clear != null ? null : b.dataset.zero != null ? 0 : Number(b.dataset.star);
        await setScore(kind, item, cfg, name, n === cur ? null : n); // the same score again takes it away
        paint();
        // the new stars light up one after the other (like in the info bar)
        body.querySelectorAll(`[data-star].is-on[data-crit="${CSS.escape(name)}"]`).forEach((s, i) =>
          s.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)", filter: "brightness(1.6)" }, { transform: "scale(1)" }], { duration: 380, delay: i * 55, easing: "cubic-bezier(.3,1.6,.5,1)" })
        );
        onChange && onChange(item);
      } else if (e.target.closest("[data-custom]")) {
        openAdvSettings(kind, async () => {
          cfg = await loadConfig(kind);
          paint();
        });
      } else if (e.target.closest("[data-done]")) dr.close();
    } catch (er) {
      errorToast(er, "Rating");
    }
  });
  paint();
}

// ---------- Settings drawer: criteria, groups, weights ----------
export function openAdvSettings(kind, onDone) {
  loadConfig(kind).then((cfg) => {
    const dr = openDrawer({
      title: kind === "performer" ? t("Rating criteria – performers") : t("Rating criteria – scenes"),
      body: "",
      foot: `<button type="button" class="kb-btn is-ghost" data-reset>${t("Reset to defaults")}</button><button type="button" class="kb-btn is-ghost" data-recalc>${t("Recalculate all")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-save>${t("Save and create tags")}</button>`,
    });
    const el = dr.el;
    el.classList.add("kb-adv", "kb-adv-set");
    const body = el.querySelector(".kb-drawer-body") || el;
    const row = (x, gi, ci) => `<div class="kb-adv-crit" data-g="${gi}" data-c="${ci}">
        <input type="checkbox" data-f="enabled" ${x.enabled ? "checked" : ""} title="${t("Use this criterion")}">
        <input class="kb-field" data-f="name" value="${esc(x.name)}" maxlength="40" aria-label="${t("Name")}">
        <input class="kb-field kb-adv-w" type="number" min="0.1" max="10" step="0.1" data-f="weight" value="${x.weight}" title="${t("Weight")}">
        <input class="kb-field kb-adv-d" data-f="desc" value="${esc(x.desc || "")}" placeholder="${t("Description (tooltip)")}" maxlength="120">
        <button type="button" class="kb-adv-mini" data-up title="${t("Up")}">↑</button><button type="button" class="kb-adv-mini" data-down title="${t("Down")}">↓</button><button type="button" class="kb-adv-mini" data-del title="${t("Remove")}">×</button></div>`;
    const paint = () => {
      body.innerHTML = `<p class="kb-hint">${t("Points are rated 0–5. Within a group the points count by their weight; the groups count by theirs. Renaming a point makes new tags – scores under the old name aren't carried over.")}</p>` +
        cfg.groups
          .map(
            (g, gi) => `<section class="kb-adv-group" data-gi="${gi}"><div class="kb-adv-ghead"><input class="kb-field" data-gf="name" value="${esc(g.name)}" maxlength="40" aria-label="${t("Group")}">
              <input class="kb-field kb-adv-w" type="number" min="0.1" max="10" step="0.1" data-gf="weight" value="${g.weight}" title="${t("Weight of the group")}">
              <button type="button" class="kb-adv-mini" data-gup>↑</button><button type="button" class="kb-adv-mini" data-gdown>↓</button><button type="button" class="kb-adv-mini" data-gdel title="${t("Remove")}">×</button></div>
              ${g.criteria.map((x, ci) => row(x, gi, ci)).join("")}
              <button type="button" class="kb-btn is-ghost" data-addc="${gi}">${icon("plus")}${t("Add a point")}</button></section>`
          )
          .join("") + `<button type="button" class="kb-btn is-ghost" data-addg>${icon("plus")}${t("Add a group")}</button>`;
    };
    const move = (arr, i, d) => {
      const j = i + d;
      if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
    };
    el.addEventListener("input", (e) => {
      const f = e.target.dataset.f;
      const gf = e.target.dataset.gf;
      if (f) {
        const r = e.target.closest("[data-c]");
        const x = cfg.groups[r.dataset.g].criteria[r.dataset.c];
        x[f] = e.target.type === "checkbox" ? e.target.checked : f === "weight" ? Number(e.target.value) || 1 : e.target.value;
      } else if (gf) cfg.groups[e.target.closest("[data-gi]").dataset.gi][gf] = gf === "weight" ? Number(e.target.value) || 1 : e.target.value;
    });
    const clean = () => {
      cfg.groups.forEach((g) => (g.criteria = g.criteria.filter((x) => String(x.name).trim()).map((x) => Object.assign(x, { name: String(x.name).trim() }))));
      cfg.groups = cfg.groups.filter((g) => String(g.name).trim() && g.criteria.length);
      const names = cfg.groups.flatMap((g) => g.criteria.map((x) => x.name.toLowerCase()));
      if (new Set(names).size !== names.length) throw new Error(t("Two points have the same name."));
      if (cfg.groups.some((g) => g.criteria.some((x) => /[★]/.test(x.name) || /:\s*[0-5]$/.test(x.name)))) throw new Error(t("A name can't contain ★."));
      if (!cfg.groups.length) throw new Error(t("At least one group with one point is needed."));
    };
    el.addEventListener("click", async (e) => {
      const r = e.target.closest("[data-c]");
      const g = e.target.closest("[data-gi]");
      try {
        if (r && e.target.closest("[data-up], [data-down], [data-del]")) {
          const arr = cfg.groups[r.dataset.g].criteria;
          const i = Number(r.dataset.c);
          if (e.target.closest("[data-del]")) arr.splice(i, 1);
          else move(arr, i, e.target.closest("[data-up]") ? -1 : 1);
          return paint();
        }
        if (g && e.target.closest("[data-gup], [data-gdown], [data-gdel]")) {
          const i = Number(g.dataset.gi);
          if (e.target.closest("[data-gdel]")) cfg.groups.splice(i, 1);
          else move(cfg.groups, i, e.target.closest("[data-gup]") ? -1 : 1);
          return paint();
        }
        const ac = e.target.closest("[data-addc]");
        if (ac) {
          cfg.groups[ac.dataset.addc].criteria.push(c(""));
          return paint();
        }
        if (e.target.closest("[data-addg]")) {
          cfg.groups.push({ name: "", weight: 1, criteria: [c("")] });
          return paint();
        }
        if (e.target.closest("[data-reset]")) {
          if (!(await confirmDialog({ title: t("Reset to defaults?"), text: t("The criteria and weights go back to the ready-made ones. Tags and ratings already given stay."), ok: t("Reset") })).ok) return;
          cfg = defaults(kind);
          return paint();
        }
        if (e.target.closest("[data-save]")) {
          clean();
          const b = e.target.closest("[data-save]");
          b.classList.add("is-busy");
          try {
            await saveConfig(kind, cfg);
            await ensureTags(kind, cfg);
          } finally {
            b.classList.remove("is-busy");
          }
          toast(t("Saved"), "ok");
          dr.close();
          onDone && onDone();
        }
        if (e.target.closest("[data-recalc]")) {
          clean();
          if (!(await confirmDialog({ title: t("Recalculate all?"), text: t("Every {what} with rating tags gets its rating calculated again from the current criteria and weights.", { what: kind === "performer" ? t("performer") : t("scene") }), ok: t("Recalculate") })).ok) return;
          await saveConfig(kind, cfg);
          const n = await recalcAll(kind, cfg);
          toast(t("{n} ratings updated", { n }), "ok");
          onDone && onDone();
        }
      } catch (er) {
        errorToast(er, "Rating");
      }
    });
    paint();
  });
}

// Every scene / performer that has rating tags: the rating is worked out again. Returns how many changed.
export async function recalcAll(kind, cfg) {
  const idx = await tagIndex();
  const parent = idx.get(PARENT[kind]);
  if (!parent) return 0;
  const tagsArg = `{ value: ["${parent}"], modifier: INCLUDES, depth: -1 }`;
  const d =
    kind === "performer"
      ? await gql(`query AdvItems { r: findPerformers(performer_filter: { tags: ${tagsArg} }, filter: { per_page: -1 }) { items: performers { id rating100 tags { id name } } } }`, undefined, { heavy: true })
      : await gql(`query AdvItems { r: findScenes(scene_filter: { tags: ${tagsArg} }, filter: { per_page: -1 }) { items: scenes { id rating100 tags { id name } } } }`, undefined, { heavy: true });
  let n = 0;
  for (const it of d.r.items) {
    const res = compute(cfg, scoresOf(it));
    if (res.rating != null && res.rating !== it.rating100) {
      await update(kind, { id: it.id, rating100: res.rating });
      n++;
    }
  }
  logEvent("rating", "info", "{n} ratings recalculated", { n });
  return n;
}
