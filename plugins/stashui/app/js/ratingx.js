// The detailed rating (advrating.js) in lists: filter by criteria ("Chemistry ≥ 4"), sort by one, and the
// small bars on cards. The scores are tags ("<Name> ★: n"); to filter, Stash is asked for the ids that carry
// the tags of one criterion and the lists are restricted to them (Stash's "ids" argument) – the same way
// the tier filter works (tiers.js). A filter is kept in the URL as crit=Name:min,Name:min; a sort as crit:Name.

import { gql } from "./api.js";
import { loadConfig, scoresOf, tagIndex } from "./advrating.js";
import { idsOfTiers } from "./tiers.js";
import { esc, openDrawer } from "./ui.js";
import { t } from "./i18n.js";

const KINDS = { scene: ["findScenes", "scene_filter", "scenes"], performer: ["findPerformers", "performer_filter", "performers"] };
export const critKinds = (kind) => !!KINDS[kind];

// ---------- Which criteria there are (settings) and which have tags ----------
const cfgs = {}; // kind → { at, names: [..enabled names in order], have: Set(names that have score tags) }
export async function critInfo(kind, force) {
  if (!KINDS[kind]) return { names: [], have: new Set() };
  if (!force && cfgs[kind] && Date.now() - cfgs[kind].at < 60000) return cfgs[kind];
  const cfg = await loadConfig(kind);
  const idx = await tagIndex().catch(() => new Map());
  const names = cfg.groups.flatMap((g) => g.criteria.filter((x) => x.enabled).map((x) => x.name));
  const have = new Set(names.filter((n) => idx.has(`${n} ★: 5`) || idx.has(`${n} ★: 0`) || idx.has(`${n} ★: 3`)));
  return (cfgs[kind] = { at: Date.now(), names, have, idx });
}
// Known so far (for the cards, which can't wait)
export const critOrder = (kind) => (cfgs[kind] ? cfgs[kind].names : []);

export const parseCrit = (s) =>
  String(s || "")
    .split(",")
    .filter(Boolean)
    .map((x) => ({ name: x.slice(0, x.lastIndexOf(":")), min: Number(x.slice(x.lastIndexOf(":") + 1)) }))
    .filter((c) => c.name && c.min >= 0 && c.min <= 5);
export const critStr = (list) => list.map((c) => `${c.name}:${c.min}`).join(",");
export const critText = (list) => list.map((c) => `${c.name} ≥ ${c.min}`).join(", ");

// ---------- Scores of one criterion: Map(id → 0–5) ----------
const maps = {}; // "kind|name" → { at, map }
export async function scoreMap(kind, name) {
  const key = kind + "|" + name;
  if (maps[key] && Date.now() - maps[key].at < 30000) return maps[key].map;
  const [fn, arg, list] = KINDS[kind];
  const info = await critInfo(kind);
  const idx = info.idx || (await tagIndex());
  const vars = {};
  const parts = [];
  for (let n = 0; n <= 5; n++) {
    const id = idx.get(`${name} ★: ${n}`);
    if (!id) continue;
    vars["t" + n] = [id];
    parts.push(`s${n}: ${fn}(${arg}: { tags: { value: $t${n}, modifier: INCLUDES } }, filter: { per_page: -1 }) { ${list} { id } }`);
  }
  const map = new Map();
  if (parts.length) {
    const d = await gql(`query AdvScores(${Object.keys(vars).map((k) => `$${k}: [ID!]`).join(", ")}) { ${parts.join(" ")} }`, vars, { heavy: true });
    for (let n = 0; n <= 5; n++) ((d["s" + n] || {})[list] || []).forEach((x) => map.set(x.id, n));
  }
  maps[key] = { at: Date.now(), map };
  return map;
}
export const forgetScores = () => Object.keys(maps).forEach((k) => delete maps[k]);

// ---------- The ids a list is restricted to (tiers and criteria together) – null: no restriction ----------
export async function restrictIds(kind, st) {
  const sets = [];
  const tiers = idsOfTiers(kind, st.tier);
  if (tiers) sets.push(new Set(tiers));
  for (const c of parseCrit(st.crit)) {
    const map = await scoreMap(kind, c.name);
    sets.push(new Set([...map].filter(([, v]) => v >= c.min).map(([id]) => id)));
  }
  if (String(st.sort || "").startsWith("crit:")) {
    const map = await scoreMap(kind, st.sort.slice(5)); // sorted by a criterion: only those that have it
    sets.push(new Set(map.keys()));
  }
  if (!sets.length) return null;
  const ids = [...sets[0]].filter((id) => sets.every((s) => s.has(id)));
  return ids.length ? ids : ["-1"]; // nothing: an empty list would mean "everything"
}
// Items in the order of a criterion (best first; ties by the overall rating); dir: "ASC" reverses
export async function sortByCrit(kind, name, items, dir) {
  const map = await scoreMap(kind, name);
  const sgn = dir === "ASC" ? -1 : 1;
  return items.slice().sort((a, b) => sgn * ((map.get(b.id) ?? -1) - (map.get(a.id) ?? -1)) || sgn * ((b.rating100 || 0) - (a.rating100 || 0)));
}

// ---------- Small bars of an item's scores (cards, panel) ----------
export function critOf(kind, item) {
  const s = scoresOf(item);
  const names = Object.keys(s);
  if (!names.length) return null;
  const order = critOrder(kind);
  names.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  return names.map((name) => ({ name, score: s[name] }));
}

// ---------- The filter dialog: per criterion "any" or at least 1–5 ----------
export async function openCritFilter(kind, value, onChange) {
  const info = await critInfo(kind, true);
  let cur = parseCrit(critStr(value));
  const dr = openDrawer({
    title: t("Detailed rating – filter"),
    body: "",
    foot: `<button type="button" class="kb-btn is-ghost" data-reset>${t("Reset")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-done>${t("Done")}</button>`,
  });
  const el = dr.el;
  el.classList.add("kb-adv", "kb-critf");
  const body = el.querySelector(".kb-drawer-body") || el;
  const names = info.names.filter((n) => info.have.has(n) || cur.some((c) => c.name === n));
  const paint = () => {
    body.innerHTML = names.length
      ? `<p class="kb-hint">${t("Only items rated at least this high in each point you choose.")}</p>` +
        names
          .map((n) => {
            const m = (cur.find((c) => c.name === n) || {}).min;
            return `<div class="kb-adv-row"><b>${esc(n)}</b><span class="kb-seg kb-critseg" data-n="${esc(n)}"><button type="button" data-min="" class="${m == null ? "is-on" : ""}">${t("any")}</button>${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-min="${i}" class="${m === i ? "is-on" : ""}">≥ ${i}</button>`).join("")}</span></div>`;
          })
          .join("")
      : `<p class="kb-hint">${t("Nothing rated in detail yet – use “★+ Detailed” on a scene or performer first.")}</p>`;
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-min]");
    if (b) {
      const n = b.closest("[data-n]").dataset.n;
      cur = cur.filter((c) => c.name !== n);
      if (b.dataset.min !== "") cur.push({ name: n, min: Number(b.dataset.min) });
      onChange(cur);
      return paint();
    }
    if (e.target.closest("[data-reset]")) {
      cur = [];
      onChange(cur);
      return paint();
    }
    if (e.target.closest("[data-done]")) dr.close();
  });
  paint();
}
