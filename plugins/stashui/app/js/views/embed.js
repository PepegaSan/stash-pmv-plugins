// Embedded tools: the classic Stash interface inside this UI.
// Classic Stash detects the embedding and hides its own navigation.

import { esc, icon } from "../ui.js";
import { t } from "../i18n.js";

const TOOLS = {
  // title/text are translated when shown
  classic: { title: "Classic Stash", text: "The original interface – for everything that isn't built in here directly: studios, groups, scrapers, tagger.", src: "/" },
  "classic-settings": { title: "Classic Stash: settings", text: "The settings in classic Stash.", src: "/settings" },
};

// Quick picks inside the workshop (the classic navigation is hidden when embedded)
const WORKSHOP = [
  ["/", "Overview"],
  ["/performers", "Performers"],
  ["/studios", "Studios"],
  ["/groups", "Groups"],
  ["/scenes/markers", "Markers"],
  ["/scenes?disp=3", "Scene Tagger"],
  ["/sceneDuplicateChecker", "Duplicates"],
  ["/settings?tab=metadata-providers", "Scrapers"],
  ["/settings?tab=tools", "Tools"],
  ["/settings", "Settings"],
];

export function render(main, params, query) {
  const tool = TOOLS[params.name];
  if (!tool) {
    main.innerHTML = `<div class="kb-empty"><b>${t("Unknown tool")}</b><a class="kb-btn" href="#/">${t("Go to the home page")}</a></div>`;
    return;
  }
  // Only allow paths inside Stash
  const path = query.path && /^\/[^/]/.test(query.path) ? query.path : tool.src;
  // Pages that only exist inside the classic interface (registered by plugins)
  // are loaded through the home page with a jump marker.
  const frameSrc = (p) => (/^\/plugin\/(?![^/]+\/assets\/)/.test(p) ? "/?kbroute=" + encodeURIComponent(p) : p);
  document.body.classList.add("kb-embedded");
  main.innerHTML = `
    <div class="kb-embed">
      <header class="kb-embed-head">
        <div><h1>${esc(t(tool.title))}</h1><p>${esc(t(tool.text))}</p></div>
        <a class="kb-btn is-ghost" href="${esc(path === "/" ? "/?classic=1" : frameSrc(path).replace("/?kbroute", "/?classic=1&kbroute"))}" target="_blank" rel="noopener">${icon("expand")}${t("In a new tab")}</a>
      </header>
      ${params.name.startsWith("classic") ? `<nav class="kb-chips kb-embed-nav">${WORKSHOP.map(([p, l]) => `<button class="kb-chip${p === path ? " is-on" : ""}" data-src="${esc(p)}">${esc(t(l))}</button>`).join("")}</nav>` : ""}
      <iframe class="kb-embed-frame" src="${esc(frameSrc(path))}" title="${esc(t(tool.title))}"></iframe>
    </div>`;
  const frame = main.querySelector("iframe");
  main.querySelectorAll("[data-src]").forEach((b) =>
    b.addEventListener("click", () => {
      frame.src = frameSrc(b.dataset.src);
      main.querySelectorAll("[data-src]").forEach((x) => x.classList.toggle("is-on", x === b));
    })
  );
  return () => document.body.classList.remove("kb-embedded");
}
