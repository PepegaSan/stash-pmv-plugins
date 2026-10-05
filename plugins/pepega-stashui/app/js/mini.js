// Mini player: the video keeps playing small while you browse. The player hands over its <video>
// element (moved, not copied – so it doesn't stop); history keeps counting through the player's own
// listeners. Move it anywhere, resize it at the corners; "Back to the player" continues at the same spot.

import { esc, icon, store } from "./ui.js";
import { t } from "./i18n.js";
import { app, go } from "./main.js";

let cur = null; // { el, v, id, onLeave }

export function startMini({ video, id, title, onLeave }) {
  stopMini();
  const wasPlaying = !video.paused;
  const el = document.createElement("div");
  el.className = "kb-mini";
  el.innerHTML = `
    <div class="kb-mini-in">
    <div class="kb-mini-screen" data-mscreen title="${t("Drag to move · pull an edge or corner, or use the mouse wheel, to resize")}"></div>
    <div class="kb-mini-bar">
      <button type="button" data-mplay aria-label="${t("Play/pause")}"></button>
      <button type="button" class="kb-mini-title" data-mopen title="${t("Back to the player")}">${esc(title)}</button>
      ${document.pictureInPictureEnabled ? `<button type="button" data-mpip title="${t("Picture in picture – floats above other windows")}">${icon("pip")}</button>` : ""}
      <button type="button" data-mopen title="${t("Back to the player")}">${icon("expand")}</button>
      <button type="button" data-mclose title="${t("Close")}">${icon("close")}</button>
    </div>
    <div class="kb-mini-prog"><i data-mprog></i></div>
    </div>
    ${["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((c) => `<span class="kb-mini-grip is-${c}" data-grip="${c}"></span>`).join("")}`;
  el.querySelector("[data-mscreen]").appendChild(video);
  document.body.appendChild(el);
  if (wasPlaying && video.paused) video.play().catch(() => {});
  video.controls = false;

  const playBtn = el.querySelector("[data-mplay]");
  const prog = el.querySelector("[data-mprog]");
  const paint = () => (playBtn.innerHTML = icon(video.paused ? "play" : "pause"));
  const tick = () => (prog.style.width = video.duration ? `${(video.currentTime / video.duration) * 100}%` : "0%");
  video.addEventListener("play", paint);
  video.addEventListener("pause", paint);
  video.addEventListener("timeupdate", tick);
  paint();
  tick();

  // Where and how big: free position (left/top) and a size – the longer side of the video in pixels.
  // The box takes the video's own shape, so portrait clips don't get black bars.
  const saved = store.get("miniBox", null);
  const box = { size: (saved && saved.size) || 380, x: saved ? saved.x : null, y: saved ? saved.y : null };
  const ratio = () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9);
  const dims = (size) => {
    const r = ratio();
    return r >= 1 ? { w: size, h: size / r } : { w: size * r, h: size };
  };
  const maxSize = () => Math.max(160, Math.min(innerWidth, innerHeight) * 0.9);
  function place() {
    box.size = Math.min(Math.max(box.size, 160), maxSize());
    const { w, h } = dims(box.size);
    if (box.x == null) {
      box.x = innerWidth - w - 18;
      box.y = innerHeight - h - 18;
    }
    // Always fully on screen
    box.x = Math.min(Math.max(box.x, 4), innerWidth - w - 4);
    box.y = Math.min(Math.max(box.y, 4), innerHeight - h - 4);
    Object.assign(el.style, { left: box.x + "px", top: box.y + "px", width: w + "px", height: h + "px" });
    el.classList.toggle("is-small", w < 260);
  }
  const save = () => store.set("miniBox", { x: Math.round(box.x), y: Math.round(box.y), size: Math.round(box.size) });
  place();
  video.addEventListener("loadedmetadata", place);
  const onWinResize = () => place();
  addEventListener("resize", onWinResize);

  // Move: drag the picture anywhere. Resize: pull an edge or a corner (the opposite side stays put),
  // or turn the mouse wheel over it.
  let drag = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const grip = e.target.closest("[data-grip]");
    if (!grip && !e.target.closest("[data-mscreen]")) return;
    const { w, h } = dims(box.size);
    drag = { grip: grip && grip.dataset.grip, sx: e.clientX, sy: e.clientY, x: box.x, y: box.y, w, h, moved: false };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    el.classList.add("is-dragging");
    if (!drag.grip) {
      box.x = drag.x + dx;
      box.y = drag.y + dy;
    } else {
      const g = drag.grip;
      // Wanted width/height from the pointer; whichever grows more decides (the shape stays the video's)
      const sw = g.includes("e") ? (drag.w + dx) / drag.w : g.includes("w") ? (drag.w - dx) / drag.w : 0;
      const sh = g.includes("s") ? (drag.h + dy) / drag.h : g.includes("n") ? (drag.h - dy) / drag.h : 0;
      const r = ratio();
      box.size = Math.min(Math.max((r >= 1 ? drag.w : drag.h) * Math.max(sw, sh), 160), maxSize());
      let n = dims(box.size);
      // The side opposite the grip stays put; along a single edge the box grows evenly to both sides
      const ax = g.includes("e") ? "l" : g.includes("w") ? "r" : "c";
      const ay = g.includes("s") ? "t" : g.includes("n") ? "b" : "c";
      const cx = drag.x + drag.w / 2;
      const cy = drag.y + drag.h / 2;
      const roomW = ax === "l" ? innerWidth - 4 - drag.x : ax === "r" ? drag.x + drag.w - 4 : 2 * Math.min(cx - 4, innerWidth - 4 - cx);
      const roomH = ay === "t" ? innerHeight - 4 - drag.y : ay === "b" ? drag.y + drag.h - 4 : 2 * Math.min(cy - 4, innerHeight - 4 - cy);
      box.size *= Math.min(1, roomW / n.w, roomH / n.h); // stops at the screen edge instead of pushing the box
      n = dims(box.size);
      box.x = ax === "l" ? drag.x : ax === "r" ? drag.x + drag.w - n.w : cx - n.w / 2;
      box.y = ay === "t" ? drag.y : ay === "b" ? drag.y + drag.h - n.h : cy - n.h / 2;
    }
    place();
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.classList.remove("is-dragging");
    if (d.moved) return save();
    if (!d.grip && e.type === "pointerup") video.paused ? video.play().catch(() => {}) : video.pause(); // a click on the picture
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  // Mouse wheel: bigger/smaller around its middle
  let wheelSave = 0;
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const o = dims(box.size);
      box.size = Math.min(Math.max(box.size * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 160), maxSize());
      const n = dims(box.size);
      box.x += (o.w - n.w) / 2;
      box.y += (o.h - n.h) / 2;
      place();
      clearTimeout(wheelSave);
      wheelSave = setTimeout(save, 300);
    },
    { passive: false }
  );

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-mplay]")) video.paused ? video.play().catch(() => {}) : video.pause();
    else if (e.target.closest("[data-mpip]")) video.requestPictureInPicture().catch(() => {});
    else if (e.target.closest("[data-mopen]")) {
      const at = video.currentTime;
      stopMini();
      app.miniResume = { id, at }; // the player starts right there
      go("scene/" + id);
    } else if (e.target.closest("[data-mclose]")) stopMini();
  });
  cur = { el, v: video, id, onLeave, off: () => removeEventListener("resize", onWinResize) };
}

// Ends the mini player (saves the watching progress through the player). Returns { id, at } or null.
export function stopMini() {
  if (!cur) return null;
  const { el, v, id, onLeave, off } = cur;
  cur = null;
  off();
  const at = v.currentTime;
  try {
    onLeave && onLeave();
  } catch (e) {}
  if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(() => {});
  v.pause();
  v.removeAttribute("src");
  v.load();
  el.remove();
  return { id, at };
}

export const miniActive = () => !!cur;
