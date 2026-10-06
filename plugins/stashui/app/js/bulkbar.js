// The selection bar of the home page: the same buttons as on the Scenes page (favorite, edit, queue, delete),
// but across all the walls on the page and with mixed scenes and images.
// home.js hands every wall (a Hang) to track(); the bar shows while anything in any wall is selected.

import { icon, store, toast, errorToast, plural, confirmDialog } from "./ui.js";
import { t } from "./i18n.js";
import { setFavorite, destroyItems, favoriteTagId } from "./api.js";
import { app, setQueueCount } from "./main.js";

const UNIT = { scene: ["scene", "scenes"], image: ["image", "images"], gallery: ["gallery", "galleries"] };
const walls = new Set();
let bar = null;

export function track(h) {
  walls.add(h);
  const prev = h.opts.onSelect;
  h.opts.onSelect = (set, hh) => {
    prev && prev(set, hh);
    refresh();
  };
}

export function forget(h) {
  walls.delete(h);
  refresh();
}

export function closeBar() {
  walls.clear();
  if (bar) bar.remove();
  bar = null;
}

const picked = () => [...walls].flatMap((h) => h.selectedPieces().map((p) => ({ h, p })));

function clearAll() {
  walls.forEach((h) => h.clearSelection());
}

export function refresh() {
  const sel = picked();
  if (!sel.length) {
    if (bar) bar.remove();
    bar = null;
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "kb-bulk";
    document.body.appendChild(bar);
    bar.addEventListener("click", onClick);
  }
  const kinds = new Set(sel.map((x) => x.p.kind));
  const canQueue = [...kinds].some((k) => k !== "gallery");
  bar.innerHTML = `<b>${t("{what} selected", { what: plural(sel.length, "item", "items") })}</b>
    <button class="kb-btn" data-b="fav"><span class="kb-dotmini"></span>${t("Favorite")}</button>
    <button class="kb-btn" data-b="unfav">${t("Remove favorite")}</button>
    ${kinds.size === 1 ? `<button class="kb-btn" data-b="edit">${icon("edit")}${t("Edit")}</button>` : ""}
    ${canQueue ? `<button class="kb-btn" data-b="queue">${icon("queue")}${t("Add to queue")}</button>` : ""}
    <button class="kb-btn is-danger" data-b="delete">${icon("trash")}${t("Delete")}</button>
    <span class="kb-spacer"></span>
    <button class="kb-btn" data-b="none">${t("Done")}</button>`;
}

// ids per kind
const byKind = (sel) => {
  const m = {};
  sel.forEach(({ p }) => (m[p.kind] = m[p.kind] || []).push(p.id));
  return m;
};

async function onClick(e) {
  const b = e.target.closest("[data-b]");
  if (!b) return;
  const sel = picked();
  if (!sel.length) return;
  try {
    switch (b.dataset.b) {
      case "none":
        return clearAll();
      case "fav":
      case "unfav": {
        const on = b.dataset.b === "fav";
        const groups = byKind(sel);
        for (const k of Object.keys(groups)) await setFavorite(k, groups[k], on);
        app.favId = await favoriteTagId(false);
        sel.forEach(({ h, p }) => h.update(Object.assign({}, p, { fav: on })));
        toast(on ? t("{what} marked as favorite", { what: plural(sel.length, "item", "items") }) : t("Favorites removed"), "ok");
        return;
      }
      case "queue": {
        const q = store.get("queue", []);
        const add = sel.filter(({ p }) => p.kind !== "gallery");
        add.forEach(({ p }) => q.push({ kind: p.kind, id: p.id, title: p.title, thumb: p.thumb }));
        store.set("queue", q);
        setQueueCount();
        toast(t("{what} added to the queue", { what: plural(add.length, "item", "items") }), "ok");
        return clearAll();
      }
      case "edit": {
        const kind = sel[0].p.kind;
        const { openEditor } = await import("./views/edit.js");
        return openEditor(kind, sel.map((x) => x.p), { onSaved: () => window.dispatchEvent(new Event("stash:library-changed")) });
      }
      case "delete": {
        const groups = byKind(sel);
        const kinds = Object.keys(groups);
        const what = kinds.length === 1 ? plural(sel.length, UNIT[kinds[0]][0], UNIT[kinds[0]][1]) : plural(sel.length, "item", "items");
        const r = await confirmDialog({
          title: t("Delete {what}?", { what }),
          text: t("The items disappear from Stash. With the box ticked, the files on disk are deleted too – this can't be undone."),
          ok: t("Delete"),
          danger: true,
          checkbox: t("Also delete the files from disk"),
        });
        if (!r.ok) return;
        for (const k of kinds) await destroyItems(k, groups[k], r.checked);
        const gone = new Map();
        sel.forEach(({ h, p }) => (gone.get(h) || gone.set(h, []).get(h)).push(p.kind + ":" + p.id));
        gone.forEach((keys, h) => h.remove(keys));
        window.dispatchEvent(new Event("stash:library-changed")); // the home page forgets what it kept
        toast(t("{what} deleted", { what: plural(sel.length, "item", "items") }), "ok");
        return refresh();
      }
    }
  } catch (err) {
    errorToast(err, "Action failed");
  }
}
