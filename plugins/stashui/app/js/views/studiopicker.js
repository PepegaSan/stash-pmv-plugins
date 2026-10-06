// Studio picker with suggestions. multi: several studios (filters); otherwise one (editing – picking replaces).

import { esc, fmtNum, errorToast } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";

let all = null;
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

export function studiosCache(force) {
  if (!all || force) {
    all = gql(`query { findStudios(filter: { per_page: -1, sort: "name", direction: ASC }) { studios { id name image_path scene_count aliases } } }`).then((d) => d.findStudios.studios);
  }
  return all;
}

// opts: { include: [id], names: { id: name } (for studios the cache doesn't know yet), multi, exclude: [id] (not offered),
//         create(name) → { id, name } (a typed-in new name makes a studio), placeholder, onChange(ids) }
export function studioPicker(host, opts) {
  let inc = [...(opts.include || [])];
  let studios = [];
  let active = -1;
  let shown = [];
  const known = Object.assign({}, opts.names || {});

  host.innerHTML = `<div class="kb-chips" data-chips></div>
    <input class="kb-field" type="text" placeholder="${esc(opts.placeholder || t("Add studio …"))}" autocomplete="off" spellcheck="false" aria-label="${t("Studio")}">
    <div class="kb-sugg" hidden role="listbox"></div>`;
  const chips = host.querySelector("[data-chips]");
  const input = host.querySelector("input");
  const sugg = host.querySelector(".kb-sugg");

  const name = (id) => (studios.find((s) => s.id === id) || {}).name || known[id] || "#" + id;
  function renderChips() {
    chips.innerHTML = inc.map((id) => `<span class="kb-chip is-on" data-id="${esc(id)}">${esc(name(id))}<button type="button" data-rm="${esc(id)}" aria-label="${t("Remove")}">×</button></span>`).join("");
    chips.hidden = !inc.length;
    input.hidden = !opts.multi && inc.length > 0; // one studio: the chip is the whole field
  }
  const emit = () => opts.onChange && opts.onChange([...inc]);

  function showSugg() {
    const q = input.value.trim().toLowerCase();
    if (!q && document.activeElement !== input) {
      sugg.hidden = true;
      return;
    }
    shown = studios
      .filter((s) => !inc.includes(s.id) && !(opts.exclude || []).includes(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.aliases || []).some((a) => a.toLowerCase().includes(q)));
    if (q) shown = shown.map((s) => [matchRank(s.name, s.aliases, q), s]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    shown = shown.slice(0, 30);
    const create = opts.create && q && !studios.some((s) => s.name.toLowerCase() === q);
    sugg.innerHTML =
      shown.map((s, i) => `<button type="button" role="option" data-i="${i}" class="${i === active ? "is-active" : ""}">${esc(s.name)}<small>${fmtNum(s.scene_count || 0)}</small></button>`).join("") +
      (create ? `<button type="button" data-create class="${active === shown.length ? "is-active" : ""}">${esc(t("New studio “{name}”", { name: input.value.trim() }))}</button>` : "") +
      (!shown.length && !create ? `<button type="button" disabled>${t("No matching studio")}</button>` : "");
    sugg.hidden = false;
  }
  function add(s) {
    if (!s) return;
    known[s.id] = s.name;
    inc = opts.multi ? [...inc, s.id] : [s.id];
    input.value = "";
    active = -1;
    sugg.hidden = true;
    renderChips();
    emit();
  }

  async function createFromInput() {
    const n = input.value.trim();
    if (!n) return;
    try {
      const s = await opts.create(n);
      studios = [...studios, Object.assign({ scene_count: 0, aliases: [] }, s)];
      add(s);
    } catch (e) {
      errorToast(e, "Studio");
    }
  }

  input.addEventListener("focus", showSugg);
  input.addEventListener("input", () => {
    // Nothing is picked for you: click a suggestion, or ↑/↓ + Enter. Only a name typed exactly (or an alias) is highlighted, so Enter takes that one
    active = -1;
    showSugg();
    const qq = input.value.trim().toLowerCase();
    if (qq && shown.length && matchRank(shown[0].name, shown[0].aliases, qq) <= 1) {
      active = 0;
      showSugg();
    }
  });
  input.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const max = shown.length + (sugg.querySelector("[data-create]") ? 1 : 0);
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
    renderChips();
    emit();
    if (!opts.multi) input.focus();
  });

  studiosCache()
    .then((s) => {
      studios = s;
      renderChips();
    })
    .catch(() => {});
  renderChips();

  return {
    get include() {
      return [...inc];
    },
    set(ids, names = {}) {
      Object.assign(known, names); // (studios just made, which the list doesn't know yet)
      inc = [...ids];
      renderChips();
    },
  };
}
