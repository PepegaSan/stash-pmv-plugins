// Duplicates: scenes that look the same (Stash compares their perceptual hashes – "phashes"), side by side
// with resolution, size and bitrate. Keep the best, delete the rest – or mark a group as "not duplicates".

import { esc, icon, toast, errorToast, confirmDialog, fmtDuration, fmtBytes, fmtNum, plural, store, ratingText } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";

const ACCURACY = [
  [0, "Exact"],
  [4, "High"],
  [8, "Medium"],
  [10, "Low"],
];
const DURATION = [
  [-1, "Any length"],
  [1, "±1 s"],
  [5, "±5 s"],
  [10, "±10 s"],
];
const PAGE = 30;

const Q = `query($d: Int, $dd: Float) {
  findDuplicateScenes(distance: $d, duration_diff: $dd) {
    id title play_count o_counter rating100
    paths { screenshot }
    files { id path basename size duration width height bit_rate video_codec frame_rate }
  }
}`;

// The best copy: most pixels, then bitrate, then file size
const score = (s) => {
  const f = s.files[0] || {};
  return (f.width || 0) * (f.height || 0) * 1e6 + (f.bit_rate || 0) / 1e3 + (f.size || 0) / 1e9;
};
const keyOf = (g) => g.map((s) => s.id).sort((a, b) => a - b).join(",");

export async function render(main) {
  let distance = store.get("dupDistance", 0);
  let durDiff = store.get("dupDuration", 1);
  let groups = [];
  let shown = PAGE;
  const ignored = new Set(store.get("dupIgnore", []));

  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <h1 class="kb-h1">${t("Duplicates")}</h1>
      <p class="kb-sub">${t("Scenes that look the same, side by side. Keep the best copy and delete the rest.")}</p>
    </div></header>
    <div class="kb-ptools">
      <span class="kb-hint">${t("Accuracy")}</span>
      <div class="kb-seg" data-acc>${ACCURACY.map(([v, l]) => `<button type="button" data-v="${v}"${v === distance ? ' class="is-on"' : ""}>${t(l)}</button>`).join("")}</div>
      <span class="kb-hint">${t("Length")}</span>
      <div class="kb-seg" data-dur>${DURATION.map(([v, l]) => `<button type="button" data-v="${v}"${v === durDiff ? ' class="is-on"' : ""}>${t(l)}</button>`).join("")}</div>
    </div>
    <div data-list><div class="kb-loading">${t("Loading …")}</div></div>`;
  const list = main.querySelector("[data-list]");

  async function load() {
    list.innerHTML = `<div class="kb-loading">${t("Comparing scenes …")}</div>`;
    try {
      const d = await gql(Q, { d: distance, dd: durDiff });
      groups = (d.findDuplicateScenes || []).filter((g) => g.length > 1).map((g) => g.slice().sort((a, b) => score(b) - score(a)));
    } catch (e) {
      list.innerHTML = `<div class="kb-empty"><b>${t("Couldn't search for duplicates")}</b><p>${esc(e.message)}</p></div>`;
      return;
    }
    shown = PAGE;
    paint();
  }

  const fileLine = (f) =>
    [f.width && f.height ? `${f.width}×${f.height}` : "", f.frame_rate ? Math.round(f.frame_rate) + " fps" : "", f.video_codec ? f.video_codec.toUpperCase() : "", f.bit_rate ? fmtNum(Math.round(f.bit_rate / 1000)) + " kbit/s" : ""]
      .filter(Boolean)
      .join(" · ");

  function paint() {
    const visible = groups.filter((g) => !ignored.has(keyOf(g)));
    if (!visible.length) {
      list.innerHTML = `<div class="kb-empty"><b>${t("No duplicates found")}</b><p>${t("Stash finds duplicates through perceptual hashes. If there are none yet: Tasks → Generate → Phashes. A lower accuracy finds more (and more false matches).")}</p></div>`;
      return;
    }
    list.innerHTML =
      `<p class="kb-hint">${plural(visible.length, "group", "groups")}${ignored.size ? ` · <button type="button" class="kb-linkbtn" data-unignore>${t("Show {n} hidden groups again", { n: ignored.size })}</button>` : ""}</p>` +
      visible
        .slice(0, shown)
        .map((g) => {
          const best = g[0];
          return `<section class="kb-card kb-dupe" data-key="${esc(keyOf(g))}">
            <div class="kb-dupe-row">${g
              .map((s, i) => {
                const f = s.files[0] || {};
                return `<article class="kb-dupe-item${i === 0 ? " is-best" : ""}" data-sid="${s.id}">
                  <a class="kb-dupe-thumb" href="#/scene/${s.id}">${s.paths.screenshot ? `<img alt="" loading="lazy" src="${esc(s.paths.screenshot)}">` : ""}${i === 0 ? `<span class="kb-dupe-badge">${t("Best")}</span>` : ""}${f.duration ? `<span class="kb-dupe-dur">${fmtDuration(f.duration)}</span>` : ""}</a>
                  <b title="${esc(s.title || f.basename || "")}">${esc(s.title || f.basename || "#" + s.id)}</b>
                  <small>${esc(fileLine(f))}</small>
                  <small><b>${esc(fmtBytes(f.size))}</b>${s.play_count ? " · " + plural(s.play_count, "play", "plays") : ""}${s.o_counter ? " · " + s.o_counter + " O" : ""}${s.rating100 ? " · " + ratingText(s.rating100) : ""}</small>
                  <small class="kb-dupe-path" title="${esc(f.path || "")}">${esc(f.path || "")}</small>
                  <button type="button" class="kb-btn is-ghost kb-pdanger" data-del="${s.id}">${icon("trash")}${t("Delete")}</button>
                </article>`;
              })
              .join("")}</div>
            <div class="kb-dupe-actions">
              <button type="button" class="kb-btn is-ghost" data-ignore>${t("Not duplicates")}</button>
              <button type="button" class="kb-btn is-danger" data-keepbest="${best.id}">${icon("trash")}${t("Keep the best, delete {n}", { n: g.length - 1 })}</button>
            </div>
          </section>`;
        })
        .join("") +
      (visible.length > shown ? `<div class="kb-more-wrap"><button type="button" class="kb-btn" data-more>${t("Show more")}</button></div>` : "");
  }

  async function destroy(ids, what) {
    const r = await confirmDialog({
      title: what,
      text: t("The scenes are removed from Stash. Without deleting the files, the next scan adds them again."),
      checkbox: t("Delete the files from disk too"),
      ok: t("Delete"),
      danger: true,
    });
    if (!r.ok) return false;
    try {
      for (const id of ids) await gql(`mutation($i: SceneDestroyInput!) { sceneDestroy(input: $i) }`, { i: { id, delete_file: r.checked, delete_generated: true } });
      toast(r.checked ? t("Deleted, files included") : t("Removed from Stash"), "ok");
      return true;
    } catch (e) {
      errorToast(e, "Delete");
      return false;
    }
  }

  main.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-acc] [data-v], [data-dur] [data-v]");
    if (seg) {
      const acc = !!seg.closest("[data-acc]");
      if (acc) store.set("dupDistance", (distance = Number(seg.dataset.v)));
      else store.set("dupDuration", (durDiff = Number(seg.dataset.v)));
      seg.parentElement.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("is-on", b === seg));
      return load();
    }
    if (e.target.closest("[data-more]")) {
      shown += PAGE;
      return paint();
    }
    if (e.target.closest("[data-unignore]")) {
      ignored.clear();
      store.set("dupIgnore", []);
      return paint();
    }
    const card = e.target.closest("[data-key]");
    if (!card) return;
    const g = groups.find((x) => keyOf(x) === card.dataset.key);
    if (!g) return;
    if (e.target.closest("[data-ignore]")) {
      ignored.add(card.dataset.key);
      store.set("dupIgnore", [...ignored]);
      return paint();
    }
    const kb = e.target.closest("[data-keepbest]");
    if (kb) {
      const rest = g.filter((s) => s.id !== kb.dataset.keepbest).map((s) => s.id);
      if (await destroy(rest, t("Keep the best copy and delete {n}?", { n: rest.length }))) {
        groups = groups.filter((x) => x !== g);
        paint();
      }
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const s = g.find((x) => x.id === del.dataset.del);
      if (await destroy([s.id], t("Delete “{name}”?", { name: s.title || (s.files[0] || {}).basename || "#" + s.id }))) {
        const rest = g.filter((x) => x !== s);
        groups = groups.map((x) => (x === g ? rest : x)).filter((x) => x.length > 1);
        paint();
      }
    }
  });

  load();
}
