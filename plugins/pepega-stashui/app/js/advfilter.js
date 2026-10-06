// Advanced filter – like classic Stash's "Add filter": any number of criteria (field + modifier + value) on top of the
// quick filters. Kept in the list's address (adv=…, so playlists keep it too) as a short JSON list of rows
// [field, modifier, value, value2]; turned into Stash's filter here. Rows that aren't complete are left out.

import { esc, icon, openDrawer } from "./ui.js";
import { t } from "./i18n.js";

const TXT = ["INCLUDES", "EXCLUDES", "EQUALS", "NOT_EQUALS", "MATCHES_REGEX", "NOT_MATCHES_REGEX", "IS_NULL", "NOT_NULL"];
const NUM = ["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "BETWEEN", "NOT_BETWEEN", "IS_NULL", "NOT_NULL"];
const ENUM = ["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN"];
const IDS = ["INCLUDES", "INCLUDES_ALL", "EXCLUDES", "IS_NULL", "NOT_NULL"];
const STU = ["INCLUDES", "EXCLUDES", "IS_NULL", "NOT_NULL"];

const MODNAME = {
  INCLUDES: "contains", EXCLUDES: "doesn't contain", EQUALS: "is", NOT_EQUALS: "is not",
  MATCHES_REGEX: "matches regex", NOT_MATCHES_REGEX: "doesn't match regex", IS_NULL: "is empty", NOT_NULL: "is not empty",
  GREATER_THAN: "is greater than", LESS_THAN: "is less than", BETWEEN: "is between", NOT_BETWEEN: "is not between",
  INCLUDES_ALL: "includes all",
};
const IDMODNAME = { INCLUDES: "includes any", INCLUDES_ALL: "includes all", EXCLUDES: "excludes", IS_NULL: "has none", NOT_NULL: "has some" };

const RES = [["LOW", "240p"], ["R360P", "360p"], ["STANDARD", "480p"], ["WEB_HD", "540p"], ["STANDARD_HD", "720p"], ["FULL_HD", "1080p"], ["QUAD_HD", "1440p"], ["FOUR_K", "4K"], ["EIGHT_K", "8K"]];
const ORI = [["LANDSCAPE", "Landscape"], ["PORTRAIT", "Portrait"], ["SQUARE", "Square"]];
const YESNO = [["true", "Yes"], ["false", "No"]];

// type: text | num | date | time | bool | enum | ori | flag (a string "true"/"false") | missing | tags | perfs | studios
// mul: the field is kept in a smaller unit (seconds, bytes, …) than shown
const f = (k, label, type, extra) => Object.assign({ k, label, type }, extra);
const COMMON = [
  f("title", "Title", "text"), f("details", "Details", "text"), f("path", "Path", "text"),
  f("rating100", "Rating (0–100)", "num"), f("organized", "Organized", "bool"),
  f("tags", "Tags", "tags"), f("tag_count", "Number of tags", "num"),
  f("performers", "Performers", "perfs"), f("performer_count", "Number of performers", "num"),
  f("studios", "Studio", "studios"), f("performer_favorite", "Has a favorite performer", "bool"),
  f("date", "Date", "date"), f("created_at", "Added", "time"), f("updated_at", "Changed", "time"),
];
export const FIELDS = {
  scene: [
    ...COMMON,
    f("duration", "Duration (minutes)", "num", { mul: 60 }), f("play_count", "Times watched", "num"),
    f("play_duration", "Time watched (minutes)", "num", { mul: 60 }), f("resume_time", "Resume position (seconds)", "num"),
    f("last_played_at", "Last watched", "time"), f("o_counter", "O counter", "num"),
    f("filesize", "File size (MB)", "num", { mul: 1048576 }), f("resolution", "Resolution", "enum", { opts: RES }),
    f("orientation", "Format", "ori"), f("video_codec", "Video codec", "text"), f("audio_codec", "Audio codec", "text"),
    f("framerate", "Frame rate", "num"), f("bitrate", "Bit rate (kbit/s)", "num", { mul: 1000 }),
    f("interactive", "Has a funscript", "bool"), f("interactive_speed", "Funscript speed", "num"),
    f("has_markers", "Has markers", "flag"), f("url", "URL", "text"), f("code", "Code", "text"), f("director", "Director", "text"),
    f("captions", "Subtitles", "text"), f("file_count", "Number of files", "num"),
    f("is_missing", "Is missing", "missing", { opts: ["title", "details", "url", "date", "cover", "studio", "performers", "tags", "stash_id", "phash"] }),
  ],
  image: [
    ...COMMON,
    f("o_counter", "O counter", "num"), f("resolution", "Resolution", "enum", { opts: RES }), f("orientation", "Format", "ori"),
    f("photographer", "Photographer", "text"), f("file_count", "Number of files", "num"),
    f("is_missing", "Is missing", "missing", { opts: ["title", "studio", "performers", "tags", "galleries"] }),
  ],
  gallery: [
    ...COMMON,
    f("image_count", "Number of images", "num"), f("scene_count", "Number of scenes", "num"),
    f("photographer", "Photographer", "text"), f("url", "URL", "text"), f("code", "Code", "text"), f("file_count", "Number of files", "num"),
    f("is_missing", "Is missing", "missing", { opts: ["title", "details", "url", "date", "cover", "studio", "performers", "tags", "scenes"] }),
  ],
};
const fieldOf = (kind, k) => (FIELDS[kind] || []).find((x) => x.k === k);
const modsOf = (fd) => (fd.type === "text" ? TXT : fd.type === "num" || fd.type === "date" || fd.type === "time" ? NUM : fd.type === "enum" ? ENUM : fd.type === "tags" || fd.type === "perfs" ? IDS : fd.type === "studios" ? STU : null);
const nullish = (m) => m === "IS_NULL" || m === "NOT_NULL";
const ranged = (m) => m === "BETWEEN" || m === "NOT_BETWEEN";

// ---------- Address <-> rows ----------
export function parseAdv(s) {
  try {
    const a = JSON.parse(s || "[]");
    return Array.isArray(a) ? a.filter((r) => Array.isArray(r) && typeof r[0] === "string").map((r) => ({ k: r[0], m: r[1] || "", v: r[2] ?? "", v2: r[3] ?? "" })) : [];
  } catch (e) {
    return [];
  }
}
export const advStr = (rows) => (rows.length ? JSON.stringify(rows.map((r) => [r.k, r.m, r.v, r.v2])) : "");

// One row → [key, Stash's criterion], or null when it isn't complete
function criterionOf(kind, r) {
  const fd = fieldOf(kind, r.k);
  if (!fd) return null;
  const has = (x) => x !== "" && x != null && !(Array.isArray(x) && !x.length);
  const m = r.m;
  switch (fd.type) {
    case "bool":
      return r.v === "true" || r.v === "false" ? [fd.k, r.v === "true"] : null;
    case "flag":
      return r.v === "true" || r.v === "false" ? [fd.k, r.v] : null;
    case "missing":
      return has(r.v) ? [fd.k, String(r.v)] : null;
    case "ori":
      return has(r.v) ? [fd.k, { value: [r.v] }] : null;
    case "tags":
    case "perfs":
    case "studios": {
      const c = { modifier: m };
      if (nullish(m)) return [fd.k, c];
      if (!has(r.v)) return null;
      c.value = r.v;
      if (fd.type !== "perfs") c.depth = fd.type === "studios" ? -1 : 0;
      return [fd.k, c];
    }
    case "text":
      if (nullish(m)) return [fd.k, { modifier: m, value: "" }];
      return has(r.v) ? [fd.k, { modifier: m, value: String(r.v) }] : null;
    case "enum":
      return has(r.v) ? [fd.k, { modifier: m, value: String(r.v) }] : null;
    case "date":
    case "time": {
      if (nullish(m)) return [fd.k, { modifier: m, value: "" }];
      if (!has(r.v) || (ranged(m) && !has(r.v2))) return null;
      const s = (d) => (fd.type === "time" ? d + " 00:00" : d);
      const c = { modifier: m, value: s(r.v) };
      if (ranged(m)) c.value2 = s(r.v2);
      return [fd.k, c];
    }
    case "num": {
      if (nullish(m)) return [fd.k, { modifier: m, value: 0 }];
      if (!has(r.v) || (ranged(m) && !has(r.v2))) return null;
      const n = (x) => Math.round(Number(x) * (fd.mul || 1));
      if (isNaN(n(r.v)) || (ranged(m) && isNaN(n(r.v2)))) return null;
      const c = { modifier: m, value: n(r.v) };
      if (ranged(m)) c.value2 = n(r.v2);
      return [fd.k, c];
    }
  }
  return null;
}

// Hangs `extra` onto the end of a filter's AND chain (a filter has one AND, which holds the next filter)
export function andInto(filter, extra) {
  if (!extra || !Object.keys(extra).length) return filter;
  let at = filter;
  while (at.AND && typeof at.AND === "object" && !Array.isArray(at.AND)) at = at.AND;
  at.AND = extra;
  return filter;
}

// rows (or their text) → Stash filter ({} when there is nothing)
export function advToFilter(kind, src) {
  const rows = typeof src === "string" ? parseAdv(src) : src || [];
  let acc = null;
  for (const r of [...rows].reverse()) {
    const c = criterionOf(kind, r);
    if (!c) continue;
    acc = acc ? { [c[0]]: c[1], AND: acc } : { [c[0]]: c[1] };
  }
  return acc || {};
}

export const advCount = (kind, src) => (typeof src === "string" ? parseAdv(src) : src || []).filter((r) => criterionOf(kind, r)).length;

// ---------- The drawer ----------
export function openAdvFilter(kind, src, onApply) {
  let rows = parseAdv(src).filter((r) => fieldOf(kind, r.k));
  const fields = FIELDS[kind];
  const dr = openDrawer({
    title: t("Advanced filter"),
    body: "",
    foot: `<button type="button" class="kb-btn is-ghost" data-advclear>${t("Clear")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-advcancel>${t("Cancel")}</button><button type="button" class="kb-btn is-primary" data-advapply>${t("Apply")}</button>`,
  });
  const el = dr.el;
  el.classList.add("kb-advf");
  const body = el.querySelector(".kb-drawer-body");

  const fresh = (k) => {
    const fd = fieldOf(kind, k);
    const m = modsOf(fd);
    return { k, m: m ? m[0] : "", v: fd.type === "tags" || fd.type === "perfs" || fd.type === "studios" ? [] : "", v2: "" };
  };

  function valueHtml(r, i) {
    const fd = fieldOf(kind, r.k);
    if (nullish(r.m)) return "";
    const inp = (type, key, extra = "") => `<input class="kb-field" type="${type}" data-v="${key}" value="${esc(r[key])}" ${extra}>`;
    switch (fd.type) {
      case "bool":
        return `<select class="kb-field" data-v="v"><option value="">${t("choose …")}</option>${YESNO.map(([v, l]) => `<option value="${v}"${r.v === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select>`;
      case "flag":
        return `<select class="kb-field" data-v="v"><option value="">${t("choose …")}</option>${YESNO.map(([v, l]) => `<option value="${v}"${r.v === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select>`;
      case "ori":
        return `<select class="kb-field" data-v="v"><option value="">${t("choose …")}</option>${ORI.map(([v, l]) => `<option value="${v}"${r.v === v ? " selected" : ""}>${t(l)}</option>`).join("")}</select>`;
      case "enum":
        return `<select class="kb-field" data-v="v"><option value="">${t("choose …")}</option>${fd.opts.map(([v, l]) => `<option value="${v}"${r.v === v ? " selected" : ""}>${l}</option>`).join("")}</select>`;
      case "missing":
        return `<select class="kb-field" data-v="v"><option value="">${t("choose …")}</option>${fd.opts.map((v) => `<option value="${v}"${r.v === v ? " selected" : ""}>${t("missing: " + v)}</option>`).join("")}</select>`;
      case "tags":
      case "perfs":
      case "studios":
        return `<div class="kb-tagpick kb-advf-pick" data-pick="${i}"></div>`;
      case "date":
      case "time":
        return inp("date", "v") + (ranged(r.m) ? `<span class="kb-advf-and">${t("and")}</span>` + inp("date", "v2") : "");
      case "num":
        return inp("number", "v", 'step="any"') + (ranged(r.m) ? `<span class="kb-advf-and">${t("and")}</span>` + inp("number", "v2", 'step="any"') : "");
      default:
        return inp("text", "v", `placeholder="${t("text")}"`);
    }
  }

  function paint() {
    body.innerHTML =
      (rows.length ? "" : `<p class="kb-hint">${t("Add a criterion – every one has to match. The quick filters above stay as they are.")}</p>`) +
      rows
        .map((r, i) => {
          const fd = fieldOf(kind, r.k);
          const mods = modsOf(fd);
          const names = fd.type === "tags" || fd.type === "perfs" || fd.type === "studios" ? IDMODNAME : MODNAME;
          return `<div class="kb-advf-row" data-i="${i}">
            <select class="kb-field" data-k aria-label="${t("Field")}">${fields.map((x) => `<option value="${x.k}"${x.k === r.k ? " selected" : ""}>${t(x.label)}</option>`).join("")}</select>
            ${mods ? `<select class="kb-field" data-m aria-label="${t("Condition")}">${mods.map((m) => `<option value="${m}"${m === r.m ? " selected" : ""}>${t(names[m])}</option>`).join("")}</select>` : ""}
            <span class="kb-advf-val">${valueHtml(r, i)}</span>
            <button type="button" class="kb-btn is-icon is-ghost" data-rm title="${t("Remove")}" aria-label="${t("Remove")}">${icon("close")}</button>
          </div>`;
        })
        .join("") +
      `<button type="button" class="kb-btn" data-add>${icon("plus")}<span>${t("Add criterion")}</span></button>`;
    mountPickers();
  }

  async function mountPickers() {
    for (const host of body.querySelectorAll("[data-pick]")) {
      const r = rows[Number(host.dataset.pick)];
      const fd = fieldOf(kind, r.k);
      if (fd.type === "tags") (await import("./views/tagpicker.js")).tagPicker(host, { include: r.v, exclude: [], allowExclude: false, placeholder: t("Add tag"), onChange: (inc) => (r.v = inc) });
      else if (fd.type === "perfs") (await import("./views/perfpicker.js")).perfPicker(host, { include: r.v, modes: false, onChange: (ids) => (r.v = ids) });
      else (await import("./views/studiopicker.js")).studioPicker(host, { include: r.v, multi: true, placeholder: t("Add studio …"), onChange: (ids) => (r.v = ids) });
    }
  }

  body.addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row || !e.target.dataset.v) return;
    rows[Number(row.dataset.i)][e.target.dataset.v] = e.target.value;
  });
  body.addEventListener("change", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.matches("[data-k]")) {
      rows[i] = fresh(e.target.value);
      return paint();
    }
    if (e.target.matches("[data-m]")) {
      rows[i].m = e.target.value;
      return paint();
    }
    if (e.target.dataset.v) rows[i][e.target.dataset.v] = e.target.value;
  });
  body.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      rows.splice(Number(rm.closest("[data-i]").dataset.i), 1);
      return paint();
    }
    if (e.target.closest("[data-add]")) {
      const used = new Set(rows.map((r) => r.k));
      rows.push(fresh((fields.find((x) => !used.has(x.k)) || fields[0]).k));
      paint();
    }
  });
  el.querySelector("[data-advcancel]").onclick = () => dr.close();
  el.querySelector("[data-advclear]").onclick = () => {
    onApply([]);
    dr.close();
  };
  el.querySelector("[data-advapply]").onclick = () => {
    onApply(rows.filter((r) => criterionOf(kind, r)));
    dr.close();
  };
  if (!rows.length) rows.push(fresh(fields[0].k));
  paint();
}
