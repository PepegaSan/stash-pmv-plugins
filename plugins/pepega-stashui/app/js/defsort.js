// "Make default": keeps the sort order of a page (Scenes, Performers …) in this browser, so the page opens that way
// every time – like the old "default filter" of classic Stash. Stored as { "<page>": "<sort value>" } under "defSort".

import { store, toast } from "./ui.js";
import { t } from "./i18n.js";

export const getDef = (key) => String((store.get("defSort", {}) || {})[key] || "");
export function setDef(key, v) {
  const m = Object.assign({}, store.get("defSort", {}) || {});
  if (v) m[key] = v;
  else delete m[key];
  store.set("defSort", m);
}

// The button after a sort control; key() = which page, current() = the value that would be kept. Returns paint() for callers that change the sort themselves.
export function defButton(after, keyOf, current) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "kb-btn is-ghost kb-defsort";
  b.setAttribute("data-sortdef", "");
  after.insertAdjacentElement("afterend", b);
  const paint = () => {
    const on = !!current() && getDef(keyOf()) === current();
    b.classList.toggle("is-on", on);
    b.disabled = !current();
    b.textContent = on ? "✓ " + t("Default") : t("Make default");
    b.title = on ? t("This sort order opens with the page every time – click to switch it off") : t("Open this page with this sort order every time");
  };
  b.onclick = () => {
    const on = getDef(keyOf()) === current();
    setDef(keyOf(), on ? "" : current());
    paint();
    toast(on ? t("Default sort order removed") : t("Saved as the default sort order"), "ok");
  };
  after.addEventListener("change", () => setTimeout(paint)); // (the page's own handler for the sort control runs first)
  paint();
  return paint;
}
