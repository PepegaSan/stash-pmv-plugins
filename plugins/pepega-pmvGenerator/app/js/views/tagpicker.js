// Tag picker with suggestions. Click = include, right-click on a chip = exclude (optional),
// Enter on an unknown name creates a new tag (optional).

import { esc, fmtNum } from "../ui.js";
import { t } from "../i18n.js";
import { findTags, createTag } from "../api.js";

let allTags = null;
export function tagsCache(force) {
  if (!allTags || force) {
    const p = findTags("", -1).then((r) => r.tags);
    allTags = p;
    p.catch(() => allTags === p && (allTags = null));
  }
  return allTags;
}

// Best match first: the exact name, then an alias, a name that starts with it, a word that starts with it, then the rest –
// so Enter takes the tag that was typed, not the first one that merely contains it
const matchRank = (name, aliases, q) => {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if ((aliases || []).some((a) => a.toLowerCase() === q)) return 1;
  if (n.startsWith(q)) return 2;
  if (n.split(/[ _.-]+/).some((w) => w.startsWith(q))) return 3;
  return 4;
};

export function tagPicker(host, opts) {
  let inc = [...(opts.include || [])];
  let exc = [...(opts.exclude || [])];
  let tags = [];
  let active = -1;
  let shown = [];
  let state = "loading"; // loading | ok | remote (the whole list couldn't be loaded: ask Stash for matches while typing)
  let loadErr = "";
  let remoteTimer = 0;
  const known = new Map(); // id → name, so chips keep their names in "remote" mode

  host.innerHTML = `<div class="kb-chips" data-chips></div>
    <input class="kb-field" type="text" placeholder="${esc(opts.placeholder || t("Add tag …"))}" autocomplete="off" spellcheck="false" aria-label="${t("Add tag")}">
    <div class="kb-sugg" hidden role="listbox"></div>`;
  const chips = host.querySelector("[data-chips]");
  const input = host.querySelector("input");
  const sugg = host.querySelector(".kb-sugg");

  const learn = (list) => list.forEach((tg) => known.set(tg.id, tg.name));
  const name = (id) => known.get(id) || (tags.find((tg) => tg.id === id) || { name: "#" + id }).name;
  function renderChips() {
    chips.innerHTML =
      inc.map((id) => `<span class="kb-chip is-on" data-id="${id}" title="${opts.allowExclude ? t("Right-click: exclude") : ""}">${esc(name(id))}<button type="button" data-rm="${id}" aria-label="${t("Remove")}">×</button></span>`).join("") +
      exc.map((id) => `<span class="kb-chip is-not" data-id="${id}" title="${t("Excluded")}">${esc(name(id))}<button type="button" data-rm="${id}" aria-label="${t("Remove")}">×</button></span>`).join("");
    chips.hidden = !inc.length && !exc.length;
  }
  const emit = () => opts.onChange && opts.onChange([...inc], [...exc]);

  function showSugg() {
    try {
      paintSugg();
    } catch (e) {
      console.error("tag picker", e);
      sugg.innerHTML = `<button type="button" disabled>${esc(t("Couldn't show the tags: {msg}", { msg: e.message }))}</button>`;
      sugg.hidden = false;
    }
  }
  function paintSugg() {
    const q = input.value.trim().toLowerCase();
    if (!q && document.activeElement !== input) {
      sugg.hidden = true;
      return;
    }
    if (state === "loading") {
      sugg.innerHTML = `<button type="button" disabled>${t("Loading tags …")}</button>`;
      sugg.hidden = false;
      return;
    }
    shown = tags
      .filter((tg) => !inc.includes(tg.id) && !exc.includes(tg.id))
      .filter((tg) => !q || tg.name.toLowerCase().includes(q) || (tg.aliases || []).some((a) => a.toLowerCase().includes(q)));
    if (q) shown = shown.map((tg) => [matchRank(tg.name, tg.aliases, q), tg]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    shown = shown.slice(0, 30);
    const exact = tags.some((tg) => tg.name.toLowerCase() === q);
    const create = opts.allowCreate && q && !exact;
    sugg.innerHTML =
      shown.map((tg, i) => `<button type="button" role="option" data-i="${i}" class="${i === active ? "is-active" : ""}">${esc(tg.name)}<small>${fmtNum(tg.scene_count + tg.image_count + tg.gallery_count)}</small></button>`).join("") +
      (create ? `<button type="button" data-create class="${active === shown.length ? "is-active" : ""}">${esc(t("New tag “{name}”", { name: input.value.trim() }))}</button>` : "") +
      (!shown.length && !create ? `<button type="button" disabled>${loadErr ? esc(t("Couldn't search the tags: {msg}", { msg: loadErr })) : t("No matching tag")}</button>` : "");
    sugg.hidden = false;
  }

  async function add(tg) {
    if (!tg) return;
    if (!inc.includes(tg.id)) inc.push(tg.id);
    input.value = "";
    active = -1;
    renderChips();
    showSugg();
    emit();
  }
  async function createFromInput() {
    const n = input.value.trim();
    if (!n) return;
    const tg = await createTag(n);
    tags.push(Object.assign({ scene_count: 0, image_count: 0, gallery_count: 0 }, tg));
    tagsCache(true);
    add(tg);
  }

  input.addEventListener("focus", showSugg);
  input.addEventListener("input", () => {
    // Nothing is picked for you: click a suggestion, or ↑/↓ + Enter. Only a name typed exactly (or an alias) is highlighted, so Enter takes that one
    active = -1;
    if (state === "remote" && input.value.trim()) {
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(async () => {
        try {
          const r = await findTags(input.value.trim(), 40);
          tags = r.tags;
          learn(tags);
          loadErr = "";
        } catch (e) {
          tags = [];
          loadErr = e.message;
        }
        showSugg();
      }, 250);
    }
    showSugg();
    const qq = input.value.trim().toLowerCase();
    if (qq && shown.length && matchRank(shown[0].name, shown[0].aliases, qq) <= 1) {
      active = 0;
      showSugg();
    }
  });
  input.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 150));
  input.addEventListener("keydown", (e) => {
    const max = shown.length + (sugg.querySelector("[data-create]") ? 1 : 0);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = active < 0 ? (e.key === "ArrowDown" ? 0 : max - 1) : (active + (e.key === "ArrowDown" ? 1 : -1) + max) % Math.max(max, 1);
      showSugg();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < shown.length) add(shown[active]);
      else if (sugg.querySelector("[data-create]") && (active === shown.length || !shown.length)) createFromInput();
    } else if (e.key === "Backspace" && !input.value && inc.length) {
      inc.pop();
      renderChips();
      emit();
    }
  });
  sugg.addEventListener("mousedown", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.create != null) createFromInput();
    else if (b.dataset.i != null) add(shown[Number(b.dataset.i)]);
  });
  chips.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (!rm) return;
    inc = inc.filter((x) => x !== rm.dataset.rm);
    exc = exc.filter((x) => x !== rm.dataset.rm);
    renderChips();
    emit();
  });
  chips.addEventListener("contextmenu", (e) => {
    const c = e.target.closest(".kb-chip");
    if (!c || !opts.allowExclude) return;
    e.preventDefault();
    const id = c.dataset.id;
    if (inc.includes(id)) {
      inc = inc.filter((x) => x !== id);
      exc.push(id);
    } else {
      exc = exc.filter((x) => x !== id);
      inc.push(id);
    }
    renderChips();
    emit();
  });

  tagsCache()
    .then((tg) => {
      tags = tg;
      learn(tags);
      state = "ok";
      renderChips();
      if (document.activeElement === input) showSugg(); // typed while it was loading
    })
    .catch((e) => {
      state = "remote";
      loadErr = e.message;
      console.error("tag list", e);
      if (document.activeElement === input && input.value.trim()) input.dispatchEvent(new Event("input"));
    });
  renderChips();

  return {
    get include() {
      return [...inc];
    },
    set(ids, extra = []) {
      // (extra: tags just made, which the list doesn't know yet)
      extra.forEach((tg) => !tags.some((x) => x.id === tg.id) && tags.push(Object.assign({ scene_count: 0, image_count: 0, gallery_count: 0 }, tg)));
      learn(extra);
      inc = [...ids];
      renderChips();
    },
  };
}
