// A simple funscript editor: stroke range, speed limit, smoothing, reverse, offset – with a heatmap
// preview (before / after). The result is saved as a NEW variant next to the video; the original is never
// touched (backend mode "funscript_save_variant", see ../../backend.py). Own presets are kept in the settings.

import { esc, openDrawer, toast, errorToast, fmtDuration } from "./ui.js";
import { t } from "./i18n.js";
import { runBackend, readVariant, editorPresets, saveEditorPresets } from "./interactive.js";
import { stripe } from "./fsvariants.js";

export const DEFAULTS = { lo: 0, hi: 100, maxSpeed: 0, smooth: 0, invert: false, offset: 0 };
// Ready-made starting points (not deletable); your own are added to the list
const BUILTIN = {
  Gentle: { lo: 15, hi: 85, maxSpeed: 250, smooth: 40, invert: false, offset: 0 },
  "Calm and slow": { lo: 25, hi: 75, maxSpeed: 150, smooth: 60, invert: false, offset: 0 },
  Reversed: { lo: 0, hi: 100, maxSpeed: 0, smooth: 0, invert: true, offset: 0 },
};

// The script's movements as [{at (ms), pos 0–100}], in time order – "inverted" and "range" folded in
export function movements(fs) {
  const range = Number(fs && fs.range) > 0 ? Number(fs.range) : 100;
  const flip = !!(fs && fs.inverted);
  return ((fs && fs.actions) || [])
    .filter((a) => a && Number.isFinite(Number(a.at)) && Number.isFinite(Number(a.pos)) && Number(a.at) >= 0)
    .map((a) => {
      let pos = (Number(a.pos) * 100) / range;
      if (flip) pos = 100 - pos;
      return { at: Number(a.at), pos: Math.min(100, Math.max(0, pos)) };
    })
    .sort((a, b) => a.at - b.at);
}

// Order: reverse → smooth → stroke range → speed limit → offset. Returns a new funscript.
export function applyEdit(fs, o) {
  o = Object.assign({}, DEFAULTS, o);
  let acts = movements(fs);
  if (o.invert) acts = acts.map((a) => ({ at: a.at, pos: 100 - a.pos }));
  const w = Math.min(1, o.smooth / 100); // how far every point moves toward the average of its neighbours (2 rounds)
  for (let k = 0; k < 2 && w > 0; k++) {
    acts = acts.map((a, i) => {
      const prev = acts[Math.max(0, i - 1)].pos;
      const next = acts[Math.min(acts.length - 1, i + 1)].pos;
      return { at: a.at, pos: a.pos * (1 - w) + ((prev + a.pos + next) / 3) * w };
    });
  }
  const lo = Math.min(o.lo, o.hi);
  const hi = Math.max(o.lo, o.hi);
  acts = acts.map((a) => ({ at: a.at, pos: lo + (a.pos / 100) * (hi - lo) }));
  if (o.maxSpeed > 0) {
    // a stroke that would be faster than the limit stops short of its target
    for (let i = 1; i < acts.length; i++) {
      const dt = (acts[i].at - acts[i - 1].at) / 1000;
      const d = acts[i].pos - acts[i - 1].pos;
      const max = o.maxSpeed * dt;
      if (Math.abs(d) > max) acts[i].pos = acts[i - 1].pos + Math.sign(d) * max;
    }
  }
  acts = acts.map((a) => ({ at: Math.round(a.at + o.offset), pos: Math.round(Math.min(100, Math.max(0, a.pos))) })).filter((a) => a.at >= 0);
  const keep = ["metadata"].reduce((m, k) => (fs && fs[k] !== undefined ? Object.assign(m, { [k]: fs[k] }) : m), {});
  return Object.assign({ version: "1.0", inverted: false, range: 100 }, keep, { actions: acts });
}

// Speed stripes like the backend's (units per second, 160 stripes) – for the preview
export function speeds(fs, n = 160) {
  const acts = movements(fs);
  const length = acts.length ? acts[acts.length - 1].at / 1000 : 0;
  const sp = new Array(n).fill(0);
  const span = Math.max(acts.length ? acts[acts.length - 1].at : 1, 1);
  const w = span / n;
  for (let i = 1; i < acts.length; i++) {
    const [a0, a1] = [acts[i - 1].at, acts[i].at];
    if (a1 <= a0) continue;
    const d = Math.abs(acts[i].pos - acts[i - 1].pos) / (a1 - a0);
    for (let b = Math.floor(a0 / w); b <= Math.min(n - 1, Math.floor(a1 / w)); b++) {
      const ov = Math.min(a1, (b + 1) * w) - Math.max(a0, b * w);
      if (ov > 0) sp[b] += d * ov;
    }
  }
  const speed = sp.map((x) => Math.min(999, Math.round(x / (w / 1000))));
  return { speed, length, actions: acts.length, peak: Math.max(0, ...speed) };
}

// The editor for one script. src: { path, label } (the variant to start from), meta: { duration, video }
export async function openEditor({ sceneId, src, meta, onSaved }) {
  let fs;
  try {
    fs = await readVariant(src.path);
  } catch (e) {
    return errorToast(e, "Funscript");
  }
  if (!movements(fs).length) return toast(t("That script has no movements to edit."));
  const stem = String(meta.video || "video").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  let mine = await editorPresets();
  const o = Object.assign({}, DEFAULTS);
  const dr = openDrawer({
    title: t("Edit script – {name}", { name: src.label || t("Standard") }),
    body: `<p class="kb-hint">${t("Changes are saved as a new variant next to the video – the original stays as it is.")}</p>
      <div class="kb-fse-prev" data-prev></div>
      <div class="kb-fse-presets">
        <select class="kb-field" data-preset></select>
        <input class="kb-field" type="text" data-pname placeholder="${t("Name for a preset")}" maxlength="40" autocomplete="off">
        <button type="button" class="kb-btn is-ghost" data-psave>${t("Save preset")}</button>
        <button type="button" class="kb-btn is-ghost" data-pdel hidden>${t("Delete preset")}</button>
      </div>
      <label class="kb-fse-row"><b>${t("Stroke from")}</b><input type="range" min="0" max="100" step="1" data-k="lo"><output data-o="lo"></output></label>
      <label class="kb-fse-row"><b>${t("Stroke to")}</b><input type="range" min="0" max="100" step="1" data-k="hi"><output data-o="hi"></output></label>
      <label class="kb-fse-row"><b>${t("Speed limit")}</b><input type="range" min="0" max="600" step="10" data-k="maxSpeed"><output data-o="maxSpeed"></output></label>
      <label class="kb-fse-row"><b>${t("Smoothing")}</b><input type="range" min="0" max="100" step="5" data-k="smooth"><output data-o="smooth"></output></label>
      <label class="kb-fse-row"><b>${t("Shift in time")}</b><input type="range" min="-2000" max="2000" step="10" data-k="offset"><output data-o="offset"></output></label>
      <label class="kb-fse-row"><b>${t("Reverse")}</b><span class="kb-switch"><input type="checkbox" data-k="invert"><i></i></span><output></output></label>
      <p class="kb-hint">${t("Speed limit: strokes that would be faster stop short of their target (units per second; 0 = off). Smoothing evens out the peaks. Reverse turns up into down.")}</p>
      <label class="kb-fse-name"><b>${t("Name of the new variant")}</b><input class="kb-field" type="text" data-label maxlength="40" value="${esc(t("Edited"))}" autocomplete="off"></label>
      <p class="kb-hint" data-fname></p>`,
    foot: `<span class="kb-hint" data-stats></span><span class="kb-spacer"></span><button type="button" class="kb-btn" data-save>${t("Save as new variant")}</button>`,
  });
  const el = dr.el;
  el.classList.add("kb-fse");
  const $ = (s) => el.querySelector(s);
  const fmtOut = {
    lo: (v) => v,
    hi: (v) => v,
    maxSpeed: (v) => (v > 0 ? `${v}/s` : t("off")),
    smooth: (v) => (v > 0 ? v + " %" : t("off")),
    offset: (v) => `${v > 0 ? "+" : ""}${v} ms`,
  };
  const base = speeds(fs);
  const preview = () => {
    const out = applyEdit(fs, o);
    const r = speeds(out);
    $("[data-prev]").innerHTML =
      `<div class="kb-fse-line"><small>${t("Before")}</small>${stripe({ speed: base.speed, length: base.length, issues: [] }, meta.duration)}</div>` +
      `<div class="kb-fse-line"><small>${t("After")}</small>${stripe({ speed: r.speed, length: r.length, issues: [] }, meta.duration)}</div>`;
    $("[data-stats]").textContent = `${t("{n} movements", { n: r.actions })} · ${fmtDuration(r.length)} · ${t("top speed {n}/s", { n: r.peak })}`;
    for (const k of Object.keys(fmtOut)) $(`[data-o="${k}"]`).textContent = fmtOut[k](o[k]);
    const name = ($("[data-label]").value.trim() || "Edited");
    $("[data-fname]").textContent = `${stem} (${name}).funscript`;
  };
  const setAll = (p) => {
    Object.assign(o, DEFAULTS, p);
    el.querySelectorAll("[data-k]").forEach((i) => (i.type === "checkbox" ? (i.checked = !!o[i.dataset.k]) : (i.value = o[i.dataset.k])));
    preview();
  };
  const presetList = () => {
    const sel = $("[data-preset]");
    const cur = sel.value;
    sel.innerHTML =
      `<option value="">${t("Presets …")}</option>` +
      Object.keys(BUILTIN).map((n) => `<option value="b:${esc(n)}">${esc(t(n))}</option>`).join("") +
      Object.keys(mine).map((n) => `<option value="m:${esc(n)}">${esc(n)}</option>`).join("");
    sel.value = [...sel.options].some((x) => x.value === cur) ? cur : "";
    $("[data-pdel]").hidden = !sel.value.startsWith("m:");
  };
  el.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.k;
    if (k) {
      o[k] = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
      if (k === "lo" && o.lo > o.hi) o.hi = o.lo;
      if (k === "hi" && o.hi < o.lo) o.lo = o.hi;
      el.querySelector('[data-k="lo"]').value = o.lo;
      el.querySelector('[data-k="hi"]').value = o.hi;
    }
    preview();
  });
  el.addEventListener("change", (e) => {
    if (!e.target.matches("[data-preset]")) return;
    const v = e.target.value;
    if (v.startsWith("b:")) setAll(BUILTIN[v.slice(2)]);
    else if (v.startsWith("m:")) setAll(mine[v.slice(2)]);
    $("[data-pdel]").hidden = !v.startsWith("m:");
  });
  el.addEventListener("click", async (e) => {
    try {
      if (e.target.closest("[data-psave]")) {
        const name = $("[data-pname]").value.trim();
        if (!name) return toast(t("Type a name for the preset first."));
        mine[name] = { lo: o.lo, hi: o.hi, maxSpeed: o.maxSpeed, smooth: o.smooth, invert: o.invert, offset: o.offset };
        await saveEditorPresets(mine);
        presetList();
        $("[data-preset]").value = "m:" + name;
        $("[data-pdel]").hidden = false;
        $("[data-pname]").value = "";
        toast(t("Preset saved"), "ok");
      } else if (e.target.closest("[data-pdel]")) {
        const v = $("[data-preset]").value;
        if (!v.startsWith("m:")) return;
        delete mine[v.slice(2)];
        await saveEditorPresets(mine);
        presetList();
      } else if (e.target.closest("[data-save]")) {
        const b = $("[data-save]");
        b.classList.add("is-busy");
        const label = $("[data-label]").value.trim() || "Edited";
        const res = await runBackend({ mode: "funscript_save_variant", scene_id: sceneId, label, content: JSON.stringify(applyEdit(fs, o)) });
        dr.close();
        onSaved && onSaved(res);
      }
    } catch (er) {
      $("[data-save]") && $("[data-save]").classList.remove("is-busy");
      errorToast(er, "Funscript");
    }
  });
  presetList();
  setAll(DEFAULTS);
}
