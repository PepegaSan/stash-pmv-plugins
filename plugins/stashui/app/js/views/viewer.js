// Image viewer: next/previous through the list, zoom & pan, slideshow, placard with details.

import { esc, icon, store, toast, errorToast } from "../ui.js";
import { isGif } from "../pieces.js";
import { t } from "../i18n.js";
import { getImage } from "../api.js";
import { app, go, closeOverlay } from "../main.js";
import { placardHtml, bindPlacard } from "./placard.js";

export async function render(host, params) {
  document.body.classList.add("kb-noscroll");
  const ctx = app.context || {};
  const prefs = store.get("viewer", { panel: false, interval: 5 });
  let x = await getImage(params.id);
  // The new picture is loaded before it is drawn: the old one stays until then – no blank flash between two images
  if (x && x.paths && x.paths.image && !(x.visual_files[0] && x.visual_files[0].__typename === "VideoFile")) {
    await new Promise((res) => {
      const pre = new Image();
      pre.onload = pre.onerror = () => res();
      pre.src = x.paths.image;
      setTimeout(res, 2500);
    });
  }
  // How the picture comes in (Settings → Player): fade, slide in from the side you are going to, zoom or none
  const anim = prefs.anim || "fade";
  const dirIn = app.viewerDir || 0;
  app.viewerDir = 0;
  if (!x) {
    host.innerHTML = `<div class="kb-stage"><div class="kb-empty"><b>${t("This image no longer exists")}</b><button class="kb-btn" data-close>${t("Close")}</button></div></div>`;
    host.querySelector("[data-close]").onclick = closeOverlay;
    return;
  }
  const inQueue = !!ctx.queue;
  const list = () => {
    if (inQueue) return store.get("queue", []);
    return (ctx.pieces || []).filter((p) => p.kind === "image");
  };
  const posNow = () => (inQueue ? store.get("queuePos", 0) : list().findIndex((p) => p.id === x.id));
  const vf = x.visual_files[0] || {};
  const isVid = vf.__typename === "VideoFile" && !isGif(vf); // a GIF is an image (it moves by itself)

  host.innerHTML = `
    <div class="kb-stage kb-viewer${prefs.panel ? " has-panel" : ""}" tabindex="-1">
      <div class="kb-screen" data-screen>
        <div class="kb-canvas" data-canvas>
          ${isVid
            ? `<video class="kb-img" src="${esc(x.paths.image)}" autoplay loop muted playsinline></video>`
            : `<img class="kb-img" alt="${esc(x.title || "")}" src="${esc(x.paths.image)}" draggable="false">`}
        </div>
        <button class="kb-nav-arrow is-prev" data-prev aria-label="${t("Previous image (←)")}">${icon("back")}</button>
        <button class="kb-nav-arrow is-next" data-next aria-label="${t("Next image (→)")}">${icon("fwd")}</button>
        <div class="kb-topbar">
          <button class="kb-btn is-icon is-ghost" data-close aria-label="${t("Close (Esc)")}" title="${t("Close (Esc)")}">${icon("back")}</button>
          <span class="kb-topbar-title">${esc(x.title || vf.basename || "")}</span>
          <span class="kb-counter" data-counter></span>
          <button class="kb-btn is-ghost kb-toggle" data-slides title="${t("Slideshow (S)")}">${icon("slides")}<span>${t("Slideshow")}</span></button>
          <select class="kb-field kb-speed" data-interval aria-label="${t("Slideshow speed")}">${[2, 3, 5, 8, 12].map((s) => `<option value="${s}"${s === prefs.interval ? " selected" : ""}>${s} s</option>`).join("")}</select>
          <button class="kb-btn is-icon is-ghost" data-zoom aria-label="${t("Zoom (Z)")}" title="${t("Original size (Z)")}">${icon("zoomin")}</button>
          <button class="kb-btn is-icon is-ghost" data-fs aria-label="${t("Fullscreen (F)")}" title="${t("Fullscreen (F)")}">${icon("expand")}</button>
          <button class="kb-btn is-icon is-ghost" data-panel aria-label="${t("Details on/off (I)")}" title="${t("Details on/off (I)")}">${icon("info")}</button>
        </div>
      </div>
      <aside class="kb-side" data-side>${placardHtml("image", x)}</aside>
    </div>`;

  const stage = host.querySelector(".kb-stage");
  const $ = (s) => host.querySelector(s);
  const img = $(".kb-img");
  const canvas = $("[data-canvas]");
  // Stepping from one picture to the next: the frame (bars, panel) just stays – it must not fade in again, and the
  // controls keep their state (hidden stays hidden). A plain fade of the already loaded picture would only dip to dark.
  const stepping = !!dirIn;
  if (stepping) {
    stage.classList.add("is-stepping");
    if (app.viewerIdle) stage.classList.add("is-idle");
  }
  if (anim !== "none" && !(stepping && anim === "fade")) {
    img.style.setProperty("--dir", dirIn || 1);
    img.classList.add("kb-in-" + (anim === "slide" && !dirIn ? "fade" : anim)); // (opened from a list: no side to come from)
  }

  const L = list();
  const pos = posNow();
  $("[data-counter]").textContent = L.length > 1 && pos >= 0 ? `${pos + 1} / ${L.length}${ctx.hang && !ctx.hang.done ? "+" : ""}` : "";
  $("[data-prev]").hidden = !(pos > 0);
  $("[data-next]").hidden = !(pos >= 0 && (pos < L.length - 1 || (ctx.hang && !ctx.hang.done)));
  // Preload neighbors
  [L[pos + 1], L[pos - 1]].forEach((p) => {
    if (p && p.raw && p.raw.paths && !p.isVid) new Image().src = p.raw.paths.image;
  });

  // ---------- Zoom & pan ----------
  let zoom = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    stage.classList.toggle("is-zoomed", zoom > 1);
  };
  const setZoom = (z, cx, cy) => {
    const r = canvas.getBoundingClientRect();
    const px = (cx == null ? r.width / 2 : cx - r.left) - r.width / 2;
    const py = (cy == null ? r.height / 2 : cy - r.top) - r.height / 2;
    const nz = Math.max(1, Math.min(8, z));
    tx = px - ((px - tx) * nz) / zoom;
    ty = py - ((py - ty) * nz) / zoom;
    zoom = nz;
    if (zoom === 1) tx = ty = 0;
    apply();
  };
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
  }, { passive: false });
  canvas.addEventListener("dblclick", (e) => setZoom(zoom > 1 ? 1 : 2.5, e.clientX, e.clientY));
  let drag = null;
  let swipe = null; // a mouse / pen drag with the picture not zoomed: turns the page like a swipe
  canvas.addEventListener("pointerdown", (e) => {
    if (zoom <= 1) {
      if (e.pointerType === "touch" || e.button !== 0 || list().length < 2) return; // (touch: see below)
      swipe = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    drag = { x: e.clientX, y: e.clientY, tx, ty };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (swipe) {
      const dx = e.clientX - swipe.x;
      if (Math.abs(dx) > 8) swipe.moved = true;
      if (swipe.moved) {
        img.style.transition = "none";
        img.style.transform = `translateX(${dx * 0.6}px)`;
        img.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 900));
      }
      return;
    }
    if (!drag) return;
    tx = drag.tx + e.clientX - drag.x;
    ty = drag.ty + e.clientY - drag.y;
    apply();
  });
  const endSwipe = (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const was = swipe;
    swipe = null;
    img.style.transition = "";
    img.style.opacity = "";
    apply();
    if (was.moved && Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };
  canvas.addEventListener("pointerup", (e) => {
    drag = null;
    endSwipe(e);
  });
  canvas.addEventListener("pointercancel", (e) => {
    drag = null;
    endSwipe(e);
  });

  // Swipe on touch devices
  let touch = null;
  canvas.addEventListener("touchstart", (e) => zoom === 1 && (touch = e.touches[0].clientX), { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (touch == null) return;
    const dx = e.changedTouches[0].clientX - touch;
    touch = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  });

  // ---------- Navigation ----------
  async function step(dir) {
    let L2 = list();
    let i = posNow() + dir;
    // At the end of the loaded list: load more
    if (dir > 0 && i >= L2.length && ctx.hang && !ctx.hang.done) {
      await ctx.hang.more();
      L2 = list();
    }
    const it = L2[i];
    if (!it) {
      if (slideTimer) stopSlides();
      return toast(dir > 0 ? t("That was the last image") : t("This is the first image"));
    }
    if (inQueue) store.set("queuePos", i);
    if (it.kind === "scene") return go("scene/" + it.id, true);
    slideKeep = !!slideTimer;
    app.viewerDir = dir;
    go("image/" + it.id, true);
  }

  // ---------- Slideshow ----------
  let slideTimer = null;
  let slideKeep = false;
  const startSlides = () => {
    slideTimer = setInterval(() => step(1), prefs.interval * 1000);
    $("[data-slides]").classList.add("is-on");
    stage.classList.add("is-sliding");
  };
  const stopSlides = () => {
    clearInterval(slideTimer);
    slideTimer = null;
    $("[data-slides]").classList.remove("is-on");
    stage.classList.remove("is-sliding");
  };
  if (ctx.slideshow || app.slideshowRunning) startSlides();
  ctx.slideshow = false;
  app.slideshowRunning = false;

  host.addEventListener("click", (e) => {
    const el = e.target;
    if (el.closest("[data-close]")) return closeOverlay();
    if (el.closest("[data-next]")) return step(1);
    if (el.closest("[data-prev]")) return step(-1);
    if (el.closest("[data-zoom]")) return setZoom(zoom > 1 ? 1 : 2.5);
    if (el.closest("[data-fs]")) return fullscreen();
    if (el.closest("[data-slides]")) return slideTimer ? stopSlides() : startSlides();
    if (el.closest("[data-panel]")) {
      prefs.panel = !prefs.panel;
      store.set("viewer", prefs);
      return stage.classList.toggle("has-panel", prefs.panel);
    }
  });
  $("[data-interval]").onchange = (e) => {
    prefs.interval = Number(e.target.value);
    store.set("viewer", prefs);
    if (slideTimer) {
      stopSlides();
      startSlides();
    }
  };
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stage.requestFullscreen().catch(() => toast(t("Fullscreen not allowed")));
  }

  // Controls hide when idle
  let idle;
  const wake = () => {
    stage.classList.remove("is-idle");
    clearTimeout(idle);
    idle = setTimeout(() => stage.classList.add("is-idle"), 2400);
  };
  stage.addEventListener("pointermove", wake);
  if (!(stepping && app.viewerIdle)) wake();

  // ---------- Placard ----------
  const side = $("[data-side]");
  const plc = bindPlacard(side, "image", () => x, {
    refresh: async () => {
      x = await getImage(x.id);
      side.innerHTML = placardHtml("image", x);
    },
    onDeleted: () => {
      const i = posNow();
      if (ctx.hang) ctx.hang.remove(["image:" + x.id]);
      const L2 = list().filter((p) => p.id !== x.id);
      const it = L2[Math.min(Math.max(i, 0), L2.length - 1)];
      if (it && !inQueue) go("image/" + it.id, true);
      else closeOverlay();
    },
    goFolder: async () => {
      const { loadFolders, folderIdForPath } = await import("../api.js");
      const dir = (vf.path || "").split(/[\\/]/).slice(0, -1).join("\\");
      const fid = await folderIdForPath(dir).catch(() => null);
      if (fid) return go("folder/" + fid);
      const tree = await loadFolders(false, { user: true });
      const n = [...tree.nodes.values()].find((n) => n.path === dir);
      if (n) go("folder/" + n.id);
    },
  });

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (document.querySelector(".kb-drawer, .kb-dialog")) return;
    const k = e.key.toLowerCase();
    let handled = true;
    if (k === "escape") document.fullscreenElement ? document.exitFullscreen() : zoom > 1 ? setZoom(1) : closeOverlay();
    else if (k === "arrowright" || k === "d") step(1);
    else if (k === "arrowleft" || k === "a") step(-1);
    else if (k === " " || k === "s") slideTimer ? stopSlides() : startSlides();
    else if (k === "z") setZoom(zoom > 1 ? 1 : 2.5);
    else if (k === "f") fullscreen();
    else if (k === "i") $("[data-panel]").click();
    else if (k === "e") $("[data-edit]") && $("[data-edit]").click(); // edit
    else if (k === "delete") $("[data-delete]") && $("[data-delete]").click(); // asks first
    else if (k === "h") plc.fav().catch((err) => errorToast(err, "Favorite"));
    else if (k === "o") plc.o(1).catch((err) => errorToast(err, "O counter"));
    else if (/^[1-5]$/.test(k)) plc.rate(Number(k)).catch((err) => errorToast(err, "Rating"));
    else handled = false;
    if (handled) {
      e.preventDefault();
      wake();
    }
  };
  document.addEventListener("keydown", onKey);
  stage.focus();

  return () => {
    document.removeEventListener("keydown", onKey);
    clearTimeout(idle);
    app.viewerIdle = stage.classList.contains("is-idle"); // (the next picture keeps it)
    app.slideshowRunning = slideKeep && !!slideTimer;
    clearInterval(slideTimer);
    if (isVid) {
      img.pause();
      img.removeAttribute("src");
    }
  };
}
