// History: recently watched scenes.

import { mediaBrowser } from "./media.js";
import { t } from "../i18n.js";

export function render(main, params, query) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("History")}</h1>
        <p class="kb-sub">${t("Everything you've watched – most recent first. The red bar shows where you stopped.")}</p>
      </div>
    </header>
    <section data-browser></section>`;
  const b = mediaBrowser(main.querySelector("[data-browser]"), {
    kinds: ["scene"],
    query,
    page: "history",
    defaults: { scene: { sort: "last_played_at", dir: "DESC" } },
    base: () => ({ filter: { play_count: { value: 0, modifier: "GREATER_THAN" } } }),
  });
  return () => b.destroy();
}
