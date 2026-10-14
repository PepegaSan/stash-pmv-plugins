// Duplicates: scenes that look the same (Stash compares their perceptual hashes – "phashes"), side by side
// with resolution, size and bitrate. Keep the best, delete the rest – or mark a group as "not duplicates".
// Copies can also be ticked – by hand or with a rule for every group ("all but the highest resolution" …,
// like classic Stash) – and deleted at once.

import { esc, icon, toast, errorToast, confirmDialog, menu, fmtDuration, fmtBytes, fmtNum, plural, store, ratingText } from "../ui.js";
import { t } from "../i18n.js";
import { gql, destroyItems } from "../api.js";

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
const BATCH = 50; // scenes per delete request when deleting the ticked copies

const Q = `query($d: Int, $dd: Float) {
  findDuplicateScenes(distance: $d, duration_diff: $dd) {
    id title play_count o_counter rating100 created_at
    paths { screenshot }
    files { id path basename size duration width height bit_rate video_codec frame_rate mod_time }
  }
}`;

// The best copy: most pixels, then bitrate, then file size
const score = (s) => {
  const f = s.files[0] || {};
  return (f.width || 0) * (f.height || 0) * 1e6 + (f.bit_rate || 0) / 1e3 + (f.size || 0) / 1e9;
};
const keyOf = (g) => g.map((s) => s.id).sort((a, b) => a - b).join(",");
const sizeOf = (s) => (s.files[0] || {}).size || 0;
const ageOf = (s) => new Date((s.files[0] || {}).mod_time || s.created_at || 0).getTime();

// Rules for ticking copies in every group (the groups are sorted best first)
const RULES = [
  { label: "Select nothing", pick: () => [] },
  { label: "Select all but the highest resolution in each group", pick: (g) => g.slice(1) },
  { label: "Select all but the largest file in each group", pick: (g) => g.filter((s) => s !== g.reduce((a, b) => (sizeOf(b) > sizeOf(a) ? b : a))) },
  { label: "Select the oldest file in each group", pick: (g) => [g.reduce((a, b) => (ageOf(b) < ageOf(a) ? b : a))] },
  { label: "Select the newest file in each group", pick: (g) => [g.reduce((a, b) => (ageOf(b) > ageOf(a) ? b : a))] },
];

export async function render(main) {
  let distance = store.get("dupDistance", 0);
  let durDiff = store.get("dupDuration", 1);
  let groups = [];
  let shown = PAGE;
  const ignored = new Set(store.get("dupIgnore", []));
  const picked = new Set(); // ids of ticked scenes
  const failed = new Map(); // id → why it couldn't be deleted (shown on its card until the list is loaded again)
  let busy = false;

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
    <div class="kb-dupe-bulk" data-bulk hidden></div>
    <div data-list><div class="kb-loading">${t("Loading …")}</div></div>`;
  const list = main.querySelector("[data-list]");
  const bulk = main.querySelector("[data-bulk]");
  const visibleGroups = () => groups.filter((g) => !ignored.has(keyOf(g)));
  const pickedIn = (g) => g.filter((s) => picked.has(s.id));

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
    picked.clear();
    failed.clear();
    paint();
  }

  // The bar above the list: rules for ticking, and deleting what is ticked (in all groups, also those further down)
  function paintBulk(status) {
    const visible = visibleGroups();
    bulk.hidden = !visible.length;
    if (!visible.length) return (bulk.innerHTML = "");
    const n = visible.reduce((c, g) => c + pickedIn(g).length, 0);
    bulk.innerHTML = `
      <button type="button" class="kb-btn" data-rules${busy ? " disabled" : ""}>${t("Select …")}</button>
      <span class="kb-hint">${status ? esc(status) : n ? t("{n} selected", { n }) : ""}</span>
      <button type="button" class="kb-btn is-danger" data-bulkdel${!n || busy ? " disabled" : ""}>${icon("trash")}${t("Delete selected ({n})", { n })}</button>`;
  }

  const fileLine = (f) =>
    [f.width && f.height ? `${f.width}×${f.height}` : "", f.frame_rate ? Math.round(f.frame_rate) + " fps" : "", f.video_codec ? f.video_codec.toUpperCase() : "", f.bit_rate ? fmtNum(Math.round(f.bit_rate / 1000)) + " kbit/s" : ""]
      .filter(Boolean)
      .join(" · ");

  function paint() {
    const visible = visibleGroups();
    paintBulk();
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
                return `<article class="kb-dupe-item${i === 0 ? " is-best" : ""}${picked.has(s.id) ? " is-picked" : ""}" data-sid="${s.id}">
                  <a class="kb-dupe-thumb" href="#/scene/${s.id}">${s.paths.screenshot ? `<img alt="" loading="lazy" src="${esc(s.paths.screenshot)}">` : ""}${i === 0 ? `<span class="kb-dupe-badge">${t("Best")}</span>` : ""}${f.duration ? `<span class="kb-dupe-dur">${fmtDuration(f.duration)}</span>` : ""}</a>
                  <b title="${esc(s.title || f.basename || "")}">${esc(s.title || f.basename || "#" + s.id)}</b>
                  <small>${esc(fileLine(f))}</small>
                  <small><b>${esc(fmtBytes(f.size))}</b>${s.play_count ? " · " + plural(s.play_count, "play", "plays") : ""}${s.o_counter ? " · " + s.o_counter + " O" : ""}${s.rating100 ? " · " + ratingText(s.rating100) : ""}</small>
                  <small class="kb-dupe-path" title="${esc(f.path || "")}">${esc(f.path || "")}</small>
                  ${failed.has(s.id) ? `<small class="kb-dupe-fail" title="${esc(failed.get(s.id))}">${esc(failed.get(s.id))}</small>` : ""}
                  <div class="kb-dupe-itemacts">
                    <label class="kb-check"><input type="checkbox" data-pick="${s.id}"${picked.has(s.id) ? " checked" : ""}${busy ? " disabled" : ""}>${t("Select")}</label>
                    <button type="button" class="kb-btn is-ghost kb-pdanger" data-del="${s.id}">${icon("trash")}${t("Delete")}</button>
                  </div>
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

  const confirmDelete = (what, warning) =>
    confirmDialog({
      title: what,
      text: [warning, t("The scenes are removed from Stash. Without deleting the files, the next scan adds them again.")].filter(Boolean).join(" "),
      checkbox: t("Delete the files from disk too"),
      ok: t("Delete"),
      danger: true,
    });

  // Drop deleted scenes from the list; a group with one copy left isn't a duplicate any more
  const forget = (ids) => {
    const gone = new Set(ids);
    groups = groups.map((g) => g.filter((s) => !gone.has(s.id))).filter((g) => g.length > 1);
    ids.forEach((id) => {
      picked.delete(id);
      failed.delete(id);
    });
  };

  const failText = (msg) =>
    /file name too long/i.test(msg) ? t("The file name is too long for Stash to mark it for deletion – shorten the name or delete the file by hand.") : t("Couldn't delete: {msg}", { msg });

  // All ticked copies, group by group in batches. Stash undoes a whole batch when one file can't be deleted – then
  // that batch goes one by one, so the others still go; what fails stays ticked with the reason on its card.
  async function destroyPicked() {
    const sel = visibleGroups().map(pickedIn).filter((p) => p.length);
    const total = sel.reduce((c, p) => c + p.length, 0);
    if (!total) return;
    const whole = visibleGroups().filter((g) => pickedIn(g).length === g.length).length;
    const r = await confirmDelete(
      t("Delete {n} selected scenes?", { n: total }),
      whole ? t("In {n} groups every copy is selected – nothing of them will be left.", { n: whole }) : "",
    );
    if (!r.ok) return;
    busy = true;
    let done = 0;
    let bad = 0;
    const one = async (id) => {
      try {
        await destroyItems("scene", [id], r.checked);
        forget([id]);
      } catch (e) {
        failed.set(id, failText(e.message || String(e)));
        bad++;
      }
      done++;
      paintBulk(t("Deleting {i} of {n} …", { i: done, n: total }));
    };
    try {
      for (let i = 0; i < sel.length; ) {
        let ids = [];
        while (i < sel.length && (!ids.length || ids.length + sel[i].length <= BATCH)) ids = ids.concat(sel[i++].map((s) => s.id));
        paintBulk(t("Deleting {i} of {n} …", { i: done, n: total }));
        try {
          await destroyItems("scene", ids, r.checked);
          forget(ids);
          done += ids.length;
        } catch (e) {
          for (const id of ids) await one(id);
        }
      }
      if (bad) toast(t("{n} deleted, {m} couldn't be deleted – they stay selected", { n: total - bad, m: bad }), "error");
      else toast(r.checked ? t("Deleted, files included") : t("Removed from Stash"), "ok");
    } catch (e) {
      errorToast(e, "Delete");
    } finally {
      busy = false;
      paint();
    }
  }

  async function destroy(ids, what) {
    const r = await confirmDelete(what);
    if (!r.ok) return false;
    try {
      for (const id of ids) await gql(`mutation($i: SceneDestroyInput!) { sceneDestroy(input: $i) }`, { i: { id, delete_file: r.checked, delete_generated: true } });
      toast(r.checked ? t("Deleted, files included") : t("Removed from Stash"), "ok");
      return true;
    } catch (e) {
      if (/file name too long/i.test(e.message || "")) toast(failText(e.message), "error");
      else errorToast(e, "Delete");
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
    const rules = e.target.closest("[data-rules]");
    if (rules) {
      menu(
        rules,
        RULES.map(({ label, pick }) => ({
          label: t(label),
          run: () => {
            picked.clear();
            visibleGroups().forEach((g) => pick(g).forEach((s) => picked.add(s.id)));
            paint();
          },
        })),
      );
      return;
    }
    if (e.target.closest("[data-bulkdel]")) return destroyPicked();
    const card = e.target.closest("[data-key]");
    if (!card) return;
    const g = groups.find((x) => keyOf(x) === card.dataset.key);
    if (!g) return;
    if (e.target.closest("[data-ignore]")) {
      ignored.add(card.dataset.key);
      g.forEach((s) => picked.delete(s.id));
      store.set("dupIgnore", [...ignored]);
      return paint();
    }
    const kb = e.target.closest("[data-keepbest]");
    if (kb) {
      const rest = g.filter((s) => s.id !== kb.dataset.keepbest).map((s) => s.id);
      if (await destroy(rest, t("Keep the best copy and delete {n}?", { n: rest.length }))) {
        forget(rest);
        paint();
      }
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const s = g.find((x) => x.id === del.dataset.del);
      if (await destroy([s.id], t("Delete “{name}”?", { name: s.title || (s.files[0] || {}).basename || "#" + s.id }))) {
        forget([s.id]);
        paint();
      }
    }
  });

  main.addEventListener("change", (e) => {
    const box = e.target.closest("[data-pick]");
    if (!box) return;
    if (box.checked) picked.add(box.dataset.pick);
    else picked.delete(box.dataset.pick);
    box.closest("[data-sid]").classList.toggle("is-picked", box.checked);
    paintBulk();
  });

  load();
}
