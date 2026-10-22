// Cut a performer photo out of a scene or an image: pick one (the performer's own first, or search all), find the
// frame (scenes), take it, drag/zoom a portrait frame over it and use the cut-out as the photo. Everything stays in the browser –
// the result goes back to the editor as a data: URL, like an uploaded picture.

import { esc, icon, toast, errorToast } from "./ui.js";
import { t } from "./i18n.js";
import { gql } from "./api.js";

const RATIOS = [
  ["2:3", 2 / 3],
  ["3:4", 3 / 4],
  ["1:1", 1],
];
const MAX_H = 1200; // longest side of the finished photo – no bigger than the picture itself

const IMAGES_Q = `query CutImages($f: FindFilterType, $s: ImageFilterType) { findImages(filter: $f, image_filter: $s) { images { id title paths { thumbnail image } } } }`;
const SCENES_Q = `query CutScenes($f: FindFilterType, $s: SceneFilterType) { findScenes(filter: $f, scene_filter: $s) { scenes { id title files { basename duration } paths { screenshot stream } } } }`;
const nameOf = (s) => s.title || (s.files && s.files[0] && s.files[0].basename) || "#" + s.id;

// perf: { id, name }; onUse(dataUrl) is called with the finished JPEG.
// opts.canvas: cut out of this picture right away (e.g. the frame of a live cam) – no scene or image to pick
// opts.square / opts.kind ("image" opens on the images) / opts.title / opts.maxSide: for a profile picture (perf = null: no performer to start from)
export function openPhotoCutter(perf, onUse, opts = {}) {
  perf = perf || { id: null, name: "" };
  const RS = opts.square ? [RATIOS[2]] : RATIOS;
  const MAXH = opts.maxSide || MAX_H;
  const kind0 = opts.kind === "image" ? "image" : "scene";
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="kb-scrim kb-dialog-scrim"></div>
    <div class="kb-dialog kb-cut" role="dialog" aria-modal="true" aria-label="${esc(t("Cut a photo from a scene"))}">
      <h2>${esc(opts.title || (opts.canvas ? t("Cut a photo from the cam") : t("Cut a photo from a scene")))}</h2>
      <div class="kb-cut-find">
        <span class="kb-cut-kinds" data-kinds><button type="button" class="kb-btn is-ghost${kind0 === "scene" ? " is-sel" : ""}" data-kind="scene">${t("Scenes")}</button><button type="button" class="kb-btn is-ghost${kind0 === "image" ? " is-sel" : ""}" data-kind="image">${t("Images")}</button></span>
        <input class="kb-field" data-q placeholder="${esc(perf.id ? t("Search all (empty = those with {name})", { name: perf.name }) : t("Search your library"))}">
      </div>
      <div class="kb-cut-scenes" data-scenes><span class="kb-hint">${t("Loading …")}</span></div>
      <div class="kb-cut-stage" data-stage>
        <p class="kb-hint kb-cut-empty" data-empty>${t("Choose a scene above, then find the frame you want.")}</p>
        <video data-video controls playsinline preload="auto" hidden></video>
        <div class="kb-cut-still" data-still hidden>
          <canvas data-canvas></canvas>
          <div class="kb-cut-box" data-box><i data-grip></i></div>
        </div>
      </div>
      <div class="kb-cut-bar" data-vbar hidden>
        <button type="button" class="kb-btn" data-step="-1" title="${esc(t("One frame back"))}">${icon("prev")}</button>
        <button type="button" class="kb-btn" data-step="1" title="${esc(t("One frame forward"))}">${icon("next")}</button>
        <button type="button" class="kb-btn is-primary" data-take>${icon("camera")}${t("Take this frame")}</button>
      </div>
      <div class="kb-cut-bar" data-sbar hidden>
        <button type="button" class="kb-btn" data-back>${t("Other frame")}</button>
        <label class="kb-cut-zoom">${t("Size")}<input type="range" min="10" max="100" value="80" data-zoom></label>
        <span class="kb-cut-rot"><button type="button" class="kb-btn" data-rot="-1" title="${esc(t("Rotate left"))}" aria-label="${esc(t("Rotate left"))}">↺</button><button type="button" class="kb-btn" data-rot="1" title="${esc(t("Rotate right"))}" aria-label="${esc(t("Rotate right"))}">↻</button></span>
        <label class="kb-cut-zoom">${t("Brightness")}<input type="range" min="50" max="150" value="100" data-bri></label>
        <label class="kb-cut-zoom">${t("Contrast")}<input type="range" min="50" max="150" value="100" data-con></label>
        <span class="kb-cut-ratios" data-ratios${RS.length < 2 ? " hidden" : ""}>${RS.map(([l], i) => `<button type="button" class="kb-btn is-ghost${i === 0 ? " is-sel" : ""}" data-ratio="${i}">${l}</button>`).join("")}</span>
        <canvas class="kb-cut-prev" data-prev></canvas>
        <button type="button" class="kb-btn is-primary" data-use>${t("Use as photo")}</button>
      </div>
      <div class="kb-actions"><button type="button" class="kb-btn" data-close>${t("Cancel")}</button></div>
    </div>`;
  document.getElementById("overlay-root").appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const video = $("[data-video]");
  const canvas = $("[data-canvas]");
  const box = $("[data-box]");
  const prev = $("[data-prev]");

  const close = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    wrap.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  $("[data-close]").onclick = close;
  wrap.querySelector(".kb-scrim").onclick = close;

  // ---- Scenes and images
  let kind = kind0;
  let scenes = []; // the list on show: scenes or images
  let timer;
  async function loadScenes() {
    const q = $("[data-q]").value.trim();
    const box2 = $("[data-scenes]");
    const img = kind === "image";
    try {
      const f = { per_page: q ? 30 : 40, sort: "created_at", direction: "DESC" };
      if (q) f.q = q;
      const d = await gql(img ? IMAGES_Q : SCENES_Q, { f, s: q || !perf.id ? undefined : { performers: { value: [perf.id], modifier: "INCLUDES" } } });
      scenes = img ? d.findImages.images : d.findScenes.scenes;
      box2.innerHTML = scenes.length
        ? scenes.map((s, i) => `<button type="button" class="kb-cut-scene${img ? " is-image" : ""}" data-i="${i}" title="${esc(nameOf(s))}"><img alt="" loading="lazy" src="${esc(img ? s.paths.thumbnail || s.paths.image : s.paths.screenshot || "")}"><span>${esc(nameOf(s))}</span></button>`).join("")
        : `<span class="kb-hint">${q || !perf.id ? t("Nothing found.") : img ? t("No images with {name} yet – search for one above.", { name: perf.name }) : t("No scenes with {name} yet – search for one above.", { name: perf.name })}</span>`;
    } catch (e) {
      box2.innerHTML = `<span class="kb-hint">${esc(e.message)}</span>`;
    }
  }
  $("[data-q]").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadScenes, 300);
  });
  $("[data-kinds]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind;
    wrap.querySelectorAll("[data-kind]").forEach((x) => x.classList.toggle("is-sel", x === b));
    loadScenes();
  });
  if (!opts.canvas) loadScenes();

  // ---- Video
  let streams = [];
  async function pick(s) {
    wrap.querySelectorAll(".kb-cut-scene").forEach((b) => b.classList.toggle("is-on", scenes[Number(b.dataset.i)] === s));
    if (kind === "image") return pickImage(s);
    showVideo();
    $("[data-empty]").hidden = true;
    video.hidden = false;
    $("[data-vbar]").hidden = false;
    streams = [s.paths.stream];
    video.src = s.paths.stream;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(video.duration * 0.4 || 0, 600);
    };
    video.onerror = async () => {
      // Direct stream not playable here (mkv …): the transcoded ones Stash offers
      if (streams.length === 1) {
        try {
          const d = await gql(`query($id: ID!) { findScene(id: $id) { sceneStreams { url } } }`, { id: s.id });
          streams = [streams[0], ...d.findScene.sceneStreams.map((x) => x.url).filter((u) => u !== streams[0])];
        } catch (e) {}
      }
      streams.shift();
      if (streams.length) video.src = streams[0];
      else toast(t("This video can't be played here"), "error");
    };
  }
  // An image: straight to the cut, no frame to find
  function pickImage(s) {
    video.pause();
    video.hidden = true;
    $("[data-empty]").hidden = true;
    $("[data-vbar]").hidden = true;
    const im = new Image();
    im.onload = () => {
      canvas.width = im.naturalWidth;
      canvas.height = im.naturalHeight;
      canvas.getContext("2d").drawImage(im, 0, 0);
      startCut(false);
    };
    im.onerror = () => toast(t("This picture can't be loaded"), "error");
    im.src = s.paths.image;
  }
  $("[data-scenes]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) pick(scenes[Number(b.dataset.i)]);
  });
  wrap.querySelectorAll("[data-step]").forEach((b) => {
    b.onclick = () => {
      video.pause();
      video.currentTime = Math.max(0, video.currentTime + Number(b.dataset.step) / 25);
    };
  });

  // ---- The frame and the cut
  let ratio = RS[0][1];
  let c = { x: 0, y: 0, w: 0, h: 0 }; // in picture pixels
  const showVideo = () => {
    $("[data-still]").hidden = true;
    $("[data-sbar]").hidden = true;
    if (video.getAttribute("src")) {
      video.hidden = false;
      $("[data-vbar]").hidden = false;
    }
  };
  $("[data-back]").onclick = () => {
    if (kind === "image") {
      $("[data-still]").hidden = true;
      $("[data-sbar]").hidden = true;
      $("[data-empty]").hidden = false;
    } else showVideo();
  };

  $("[data-take]").onclick = () => {
    if (!video.videoWidth) return toast(t("The video isn't ready yet"), "error");
    video.pause();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const g = canvas.getContext("2d");
    g.drawImage(video, 0, 0);
    startCut(true);
  };
  // The picture is on the canvas: show it with the frame over it
  function startCut(fromVideo) {
    try {
      canvas.getContext("2d").getImageData(0, 0, 1, 1); // tainted by another origin? then there's no way to cut
    } catch (e) {
      return errorToast(e, "Cut");
    }
    video.hidden = true;
    $("[data-vbar]").hidden = true;
    $("[data-still]").hidden = false;
    $("[data-sbar]").hidden = false;
    $("[data-back]").textContent = fromVideo ? t("Other frame") : t("Other picture");
    $("[data-bri]").value = $("[data-con]").value = 100;
    setLook();
    c = { x: 0, y: 0, w: 0, h: 0 };
    fit(Number($("[data-zoom]").value) / 100, true);
  }
  // Brightness / contrast: shown with a CSS filter, and drawn with the same filter into the preview and the finished photo
  // (a browser without canvas filters – Safari – saves it unchanged)
  const look = () => {
    const b = Number($("[data-bri]").value);
    const k = Number($("[data-con]").value);
    return b === 100 && k === 100 ? "none" : `brightness(${b}%) contrast(${k}%)`;
  };
  function setLook() {
    canvas.style.filter = look();
    if (c.w) draw();
  }
  $("[data-bri]").oninput = $("[data-con]").oninput = setLook;
  // Turn the picture itself by a quarter (a vertical picture lying on its side)
  wrap.querySelectorAll("[data-rot]").forEach((b) => {
    b.onclick = () => {
      const dir = Number(b.dataset.rot);
      const src = document.createElement("canvas");
      src.width = canvas.width;
      src.height = canvas.height;
      src.getContext("2d").drawImage(canvas, 0, 0);
      canvas.width = src.height;
      canvas.height = src.width;
      const g = canvas.getContext("2d");
      g.translate(canvas.width / 2, canvas.height / 2);
      g.rotate((dir * Math.PI) / 2);
      g.drawImage(src, -src.width / 2, -src.height / 2);
      g.setTransform(1, 0, 0, 1, 0, 0);
      c = { x: 0, y: 0, w: 0, h: 0 };
      fit(Number($("[data-zoom]").value) / 100, true);
    };
  });

  // Largest frame of this ratio inside the picture, scaled by k; centred on first use, else kept around its middle
  function fit(k, center) {
    const W = canvas.width;
    const H = canvas.height;
    const maxW = Math.min(W, H * ratio);
    const w = Math.max(16, maxW * k);
    const h = w / ratio;
    const mx = center || !c.w ? W / 2 : c.x + c.w / 2;
    const my = center || !c.h ? H / 2 : c.y + c.h / 2;
    c = { w, h, x: Math.min(W - w, Math.max(0, mx - w / 2)), y: Math.min(H - h, Math.max(0, my - h / 2)) };
    draw();
  }
  function draw() {
    box.style.cssText = `left:${(c.x / canvas.width) * 100}%;top:${(c.y / canvas.height) * 100}%;width:${(c.w / canvas.width) * 100}%;height:${(c.h / canvas.height) * 100}%`;
    const oh = Math.min(MAXH, Math.round(c.h));
    prev.height = Math.min(120, oh);
    prev.width = Math.round(prev.height * ratio);
    const pg = prev.getContext("2d");
    pg.filter = look();
    pg.drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, prev.width, prev.height);
  }
  $("[data-zoom]").oninput = (e) => fit(Number(e.target.value) / 100, false);
  $("[data-ratios]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ratio]");
    if (!b) return;
    ratio = RS[Number(b.dataset.ratio)][1];
    wrap.querySelectorAll("[data-ratio]").forEach((x) => x.classList.toggle("is-sel", x === b));
    fit(Number($("[data-zoom]").value) / 100, false);
  });
  $("[data-still]").addEventListener("wheel", (e) => {
    e.preventDefault();
    const z = $("[data-zoom]");
    z.value = Math.min(100, Math.max(10, Number(z.value) - Math.sign(e.deltaY) * 4));
    fit(Number(z.value) / 100, false);
  }, { passive: false });

  // Drag the frame; the corner grip resizes it (the ratio stays)
  let drag = null;
  box.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    drag = { grip: !!e.target.closest("[data-grip]"), px: e.clientX, py: e.clientY, c: { ...c } };
  });
  box.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const s = canvas.width / canvas.getBoundingClientRect().width;
    const dx = (e.clientX - drag.px) * s;
    const dy = (e.clientY - drag.py) * s;
    const W = canvas.width;
    const H = canvas.height;
    if (drag.grip) {
      const w = Math.max(16, Math.min(drag.c.w + Math.max(dx, dy * ratio), W - drag.c.x, (H - drag.c.y) * ratio));
      c = { ...drag.c, w, h: w / ratio };
      $("[data-zoom]").value = Math.round((w / Math.min(W, H * ratio)) * 100);
    } else {
      c = { ...drag.c, x: Math.min(W - c.w, Math.max(0, drag.c.x + dx)), y: Math.min(H - c.h, Math.max(0, drag.c.y + dy)) };
    }
    draw();
  });
  const end = () => (drag = null);
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);

  $("[data-use]").onclick = () => {
    const h = Math.min(MAXH, Math.round(c.h));
    const out = document.createElement("canvas");
    out.height = h;
    out.width = Math.round(h * ratio);
    const og = out.getContext("2d");
    og.filter = look();
    og.drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, out.width, out.height);
    onUse(out.toDataURL("image/jpeg", 0.92));
    close();
  };

  if (opts.canvas) {
    wrap.querySelector(".kb-cut-find").hidden = true;
    $("[data-scenes]").hidden = true;
    $("[data-empty]").hidden = true;
    $("[data-back]").hidden = true;
    canvas.width = opts.canvas.width;
    canvas.height = opts.canvas.height;
    canvas.getContext("2d").drawImage(opts.canvas, 0, 0);
    startCut(false);
  }
}
