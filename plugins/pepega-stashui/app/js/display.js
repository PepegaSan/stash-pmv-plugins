// How things look and behave on this browser (Settings → This interface): the width of the menu on the left,
// the studio logo on thumbnails (size, corner), the NSFW blur, the shape of the thumbnails (as the picture is,
// posters or scenes) and whether hover previews play. All kept in this browser; applyDisplay() puts them on the page.

import { store } from "./ui.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || a));
export const STUDIO_SIZES = { s: 18, m: 26, l: 38, xl: 52 }; // logo height in px
export const STUDIO_POS = ["bl", "br", "tl", "tr"]; // bottom left (as before), bottom right, top left, top right
export const CARD_FORMATS = ["auto", "poster", "scene"]; // as the picture is · 2:3 portrait · 16:9 landscape
export const RAIL_MODES = ["full", "mini", "hidden"]; // the menu on the left: as always · icons only · away until the menu button is pressed
export const PREVIEW_MODES = ["on", "off", "poster"]; // always · never · not while posters are shown

// Put the settings on the page: CSS variables and classes on <html>
export function applyDisplay() {
  const r = document.documentElement;
  import("./fx.js").then((m) => m.applyFx());
  const rail = RAIL_MODES.includes(store.get("railMode", "full")) ? store.get("railMode", "full") : "full";
  r.dataset.rail = rail;
  r.style.setProperty("--rail", (rail === "mini" ? 64 : rail === "hidden" ? 0 : clamp(store.get("railWidth", 236), 180, 360)) + "px");
  r.style.setProperty("--studio-h", (STUDIO_SIZES[store.get("studioSize", "m")] || 26) + "px");
  const pos = store.get("studioPos", "bl");
  r.dataset.studioPos = STUDIO_POS.includes(pos) ? pos : "bl";
  r.classList.toggle("kb-nsfw", !!store.get("nsfw", false));
  r.classList.toggle("kb-nsfw-all", store.get("nsfwScope", "cards") === "all"); // also the player and the viewer
  r.classList.toggle("kb-nsfw-hover", !!store.get("nsfwHover", false)); // a thumbnail shows clear while the mouse is on it
  r.style.setProperty("--nsfw-blur", clamp(store.get("nsfwBlur", 18), 6, 40) + "px");
  document.querySelectorAll("[data-nsfwbtn]").forEach((b) => {
    b.classList.toggle("is-on", !!store.get("nsfw", false));
    b.setAttribute("aria-pressed", !!store.get("nsfw", false));
  });
}
// full → icons only → hidden → full (the button at the top of the menu)
export function cycleRail() {
  const cur = store.get("railMode", "full");
  store.set("railMode", RAIL_MODES[(RAIL_MODES.indexOf(cur) + 1) % RAIL_MODES.length] || "mini");
  applyDisplay();
}
export const nsfwOn = () => !!store.get("nsfw", false);
export function toggleNsfw(force) {
  store.set("nsfw", force == null ? !nsfwOn() : !!force);
  applyDisplay();
  window.dispatchEvent(new Event("stash:display-changed"));
  return nsfwOn();
}

// Thumbnails: null = each as its picture is; else the width / height every thumbnail gets
export const cardFormat = () => (CARD_FORMATS.includes(store.get("cardFormat", "auto")) ? store.get("cardFormat", "auto") : "auto");
export const cardAspect = () => ({ poster: 2 / 3, scene: 16 / 9 }[cardFormat()] || null);
// Do hover previews play?
export function previewsOn() {
  const m = store.get("previewMode", "on");
  return m === "off" ? false : m === "poster" ? cardFormat() !== "poster" : true;
}
