// Big libraries: what Stash UI does differently when there are very many scenes and images. A library counts as
// large from LARGE_SCENES scenes or LARGE_IMAGES images (Settings → This interface → "Large library mode":
// automatic / on / off). Large means: no folder counting unless asked for, fewer and lighter queries (home page
// sections load when they come into view, Versus plays the preview clips), scans of all funscripts only on a
// click. The counts come from Stash's own totals, which are kept for a while so they're not asked for again.

import { stats } from "./api.js";
import { store } from "./ui.js";

export const LARGE_SCENES = 20000;
export const LARGE_IMAGES = 100000;

let known = (() => {
  try {
    return localStorage.getItem("stashui.large") === "1" ? true : null; // remembered from last time: known at once
  } catch (e) {
    return null;
  }
})(); // true / false once the totals are known
let asked = null;
export const largeMode = () => store.get("largeMode", "auto"); // auto | on | off

// Is this a large library? (asks for the totals once; they're cached in api.js)
export function isLarge() {
  const m = largeMode();
  if (m === "on") return Promise.resolve((known = true));
  if (m === "off") return Promise.resolve((known = false));
  if (asked) return asked;
  asked = stats()
    .then((s) => {
      known = s.scene_count >= LARGE_SCENES || s.image_count >= LARGE_IMAGES;
      try {
        known ? localStorage.setItem("stashui.large", "1") : localStorage.removeItem("stashui.large");
      } catch (e) { /* blocked */ }
      return known;
    })
    .catch(() => (known = false));
  return asked;
}
// What's known right now (false until the totals are in)
export const largeNow = () => {
  const m = largeMode();
  return m === "on" ? true : m === "off" ? false : !!known;
};
export const forgetLarge = () => ((known = null), (asked = null));
