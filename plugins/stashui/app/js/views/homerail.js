// Home → Customize → Sidebar: hide entries of the left menu, move them (also between groups, with the arrows
// or by dragging), make your own groups. Start and Settings can't be hidden. Kept in this browser (railcfg.js).

import { esc, icon, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import { LOCKED, catalog, loadRail, saveRail, resetRail, isCustomRail, navIcon } from "../railcfg.js";

export function mountRailEditor(root) {
  let layout = loadRail();
  let dragId = null;
  let focusKey = null;

  const listed = (e) => !!e;
  const nameOf = (e) => (e.nav ? t(e.nav.label) : e.ext ? e.ext.name : e.saved ? t("Saved filters") : t("Folders"));
  const iconOf = (e) => (e.nav ? navIcon(e.nav.icon) : e.ext ? (e.ext.icon ? `<img class="kb-ext-ic" alt="" src="${esc(e.ext.icon)}">` : icon("plug")) : e.saved ? icon("slides") : icon("folder"));
  const gname = (g) => (g.key === "" ? t("Top of the menu") : g.name != null ? g.name : t(g.key));

  function render() {
    const cat = catalog();
    const off = new Set(layout.hidden);
    const gs = layout.groups;
    root.innerHTML = `
      <p class="kb-hint">${t("Hide entries of the menu on the left, drag them (or use the arrows) into another place or group, and make your own groups. Start and Settings always stay. Saved in this browser.")}</p>
      <ol class="kb-home-list kb-rail-ed" data-rlist>${gs
        .map((g, gi) => {
          const head = `<li class="kb-home-row kb-rail-ghead" data-ghead="${gi}">
            ${g.name != null
              ? `<input class="kb-field" data-gname value="${esc(g.name)}" maxlength="40" placeholder="${esc(t("Group name"))}" aria-label="${esc(t("Group name"))}">`
              : `<span class="kb-home-name"><b>${esc(gname(g))}</b></span>`}
            ${gi > 0 ? `<button type="button" class="kb-btn is-icon is-ghost" data-gup title="${t("Move group up")}"${gi <= 1 ? " disabled" : ""}>↑</button><button type="button" class="kb-btn is-icon is-ghost" data-gdown title="${t("Move group down")}"${gi === gs.length - 1 ? " disabled" : ""}>↓</button>` : ""}
            ${g.name != null ? `<button type="button" class="kb-btn is-icon is-ghost kb-pdanger" data-gdel title="${t("Delete group")}">${icon("trash")}</button>` : ""}
          </li>`;
          const rows = g.items
            .filter((id) => listed(cat.get(id)))
            .map((id) => {
              const e = cat.get(id);
              const lock = LOCKED.has(id);
              return `<li class="kb-home-row kb-rail-irow${off.has(id) ? " is-hidden" : ""}" data-id="${esc(id)}" draggable="true">
                <span class="kb-home-grip" title="${t("Drag to move")}">⋮⋮</span>
                <span class="kb-rail-ic">${iconOf(e)}</span>
                <span class="kb-home-name"><b>${esc(nameOf(e))}</b></span>
                <button type="button" class="kb-btn is-icon is-ghost" data-up title="${t("Move up")}">↑</button>
                <button type="button" class="kb-btn is-icon is-ghost" data-down title="${t("Move down")}">↓</button>
                <label class="kb-switch" title="${esc(lock ? t("Always shown, so you can't lock yourself out") : t("Show in the menu"))}"><input type="checkbox" data-show${off.has(id) ? "" : " checked"}${lock ? " disabled" : ""}><i></i></label>
              </li>`;
            })
            .join("");
          return head + rows;
        })
        .join("")}</ol>
      <div class="kb-home-acts">
        <button type="button" class="kb-btn" data-gadd>${icon("plus")}${t("Add a group")}</button>
        <button type="button" class="kb-btn is-ghost" data-rreset${isCustomRail() ? "" : " disabled"}>${t("Back to the default")}</button>
        <span class="kb-spacer"></span>
        <button type="button" class="kb-btn is-primary" data-donesec>${icon("check")}${t("Done")}</button>
      </div>`;
    if (focusKey != null) {
      const el = root.querySelector(`[data-ghead="${focusKey}"] [data-gname]`);
      if (el) { el.focus(); el.select(); }
      focusKey = null;
    }
  }

  const commit = () => {
    saveRail(layout);
    layout = loadRail(); // (what was taken out of a deleted group is back in its place)
    render();
  };
  const locate = (id) => {
    const gi = layout.groups.findIndex((g) => g.items.includes(id));
    return { gi, i: gi < 0 ? -1 : layout.groups[gi].items.indexOf(id) };
  };
  const isListed = (id) => listed(catalog().get(id));

  // One step up/down in the flat list of the menu – over the edge of a group into the next one
  function step(id, dir) {
    const { gi, i } = locate(id);
    if (gi < 0) return;
    const items = layout.groups[gi].items;
    let j = i + dir;
    while (j >= 0 && j < items.length && !isListed(items[j])) j += dir;
    items.splice(i, 1);
    if (j >= 0 && j < items.length + 1) {
      items.splice(j, 0, id);
    } else {
      const to = layout.groups[gi + dir];
      if (!to) return items.splice(i, 0, id);
      dir < 0 ? to.items.push(id) : to.items.unshift(id);
    }
  }
  function place(id, gi, beforeId, after) {
    const from = locate(id);
    if (from.gi < 0) return;
    layout.groups[from.gi].items.splice(from.i, 1);
    const items = layout.groups[gi].items;
    if (beforeId == null) return items.unshift(id);
    const at = items.indexOf(beforeId);
    items.splice(at < 0 ? items.length : at + (after ? 1 : 0), 0, id);
  }

  root.addEventListener("click", async (e) => {
    const stop = () => e.stopPropagation();
    if (e.target.closest("[data-gadd]")) {
      stop();
      const key = "c:" + Date.now().toString(36);
      layout.groups.push({ key, name: t("New group"), items: [] });
      focusKey = layout.groups.length - 1;
      return commit();
    }
    if (e.target.closest("[data-rreset]")) {
      stop();
      const r = await confirmDialog({ title: t("Back to the default menu?"), text: t("Your own groups are removed, the order and visibility are reset."), ok: t("Reset"), danger: true });
      if (!r.ok) return;
      resetRail();
      layout = loadRail();
      return render();
    }
    const head = e.target.closest("[data-ghead]");
    if (head) {
      stop();
      const gi = Number(head.dataset.ghead);
      if (e.target.closest("[data-gup]") && gi > 1) [layout.groups[gi - 1], layout.groups[gi]] = [layout.groups[gi], layout.groups[gi - 1]];
      else if (e.target.closest("[data-gdown]") && gi < layout.groups.length - 1) [layout.groups[gi + 1], layout.groups[gi]] = [layout.groups[gi], layout.groups[gi + 1]];
      else if (e.target.closest("[data-gdel]")) {
        const r = await confirmDialog({ title: t("Delete “{name}”?", { name: layout.groups[gi].name }), text: t("Its entries go back to where they belong by default."), ok: t("Delete"), danger: true });
        if (!r.ok) return;
        layout.groups.splice(gi, 1);
      } else return;
      return commit();
    }
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest("[data-up]")) step(id, -1);
    else if (e.target.closest("[data-down]")) step(id, 1);
    else return;
    stop();
    commit();
  });
  root.addEventListener("change", (e) => {
    const n = e.target.closest("[data-gname]");
    if (n) {
      e.stopPropagation();
      layout.groups[Number(n.closest("[data-ghead]").dataset.ghead)].name = n.value.trim() || t("New group");
      return commit();
    }
    const c = e.target.closest("[data-show]");
    if (!c) return;
    e.stopPropagation();
    const id = c.closest("[data-id]").dataset.id;
    if (LOCKED.has(id)) return;
    const off = new Set(layout.hidden);
    c.checked ? off.delete(id) : off.add(id);
    layout.hidden = [...off];
    commit();
  });

  // Drag and drop: onto an entry = before/after it (also in another group), onto a group heading = to its start
  const clearMarks = () => root.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after").forEach((x) => x.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
  root.addEventListener("dragstart", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  root.addEventListener("dragover", (e) => {
    if (dragId == null) return;
    const row = e.target.closest("[data-id], [data-ghead]");
    if (!row) return;
    e.preventDefault();
    root.querySelectorAll(".is-drop-before, .is-drop-after").forEach((x) => x.classList.remove("is-drop-before", "is-drop-after"));
    const r = row.getBoundingClientRect();
    row.classList.add(row.dataset.ghead != null || e.clientY < r.top + r.height / 2 ? "is-drop-before" : "is-drop-after");
  });
  root.addEventListener("drop", (e) => {
    if (dragId == null) return;
    const row = e.target.closest("[data-id], [data-ghead]");
    const id = dragId;
    dragId = null;
    if (!row || row.dataset.id === id) return clearMarks();
    e.preventDefault();
    e.stopPropagation();
    if (row.dataset.ghead != null) place(id, Number(row.dataset.ghead), null);
    else {
      const to = locate(row.dataset.id);
      const r = row.getBoundingClientRect();
      place(id, to.gi, row.dataset.id, e.clientY >= r.top + r.height / 2);
    }
    commit();
  });
  root.addEventListener("dragend", () => {
    dragId = null;
    clearMarks();
  });

  render();
}
