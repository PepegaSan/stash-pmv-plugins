// Colors: presets and a color wheel per color token. The theme lives in the browser (store "theme")
// and is applied through CSS variables – every page and the PMV Generator build on them.

import { esc, icon, store, toast, promptDialog, seed } from "./ui.js";
import { t } from "./i18n.js";
import { gql } from "./api.js";

// [CSS variable, label, hint]
export const TOKENS = [
  ["--pink", "Accent", "Buttons, active entries, timeline"],
  ["--bg", "Background", "The page itself"],
  ["--bg-2", "Surfaces", "Cards, panels, fields"],
  ["--bg-3", "Borders and hover", "Outlines and raised parts"],
  ["--base", "Deep background", "Navigation, inputs, lists"],
  ["--text", "Text", "Headings and main text"],
  ["--text-2", "Secondary text", "Descriptions"],
  ["--faint", "Faint text", "Hints and small labels"],
  ["--ok", "Success", "Confirmations"],
  ["--danger", "Error", "Errors and deleting"],
];

const base = { "--ok": "#5ee39a", "--danger": "#ff5a5a" };
export const PRESETS = [
  ["Plum", { "--pink": "#ff3e8a", "--bg": "#230f1f", "--bg-2": "#34172e", "--bg-3": "#4a2342", "--base": "#1a0a17", "--text": "#fbeff4", "--text-2": "#d6bccd", "--faint": "#a07a96" }],
  ["Midnight", { "--pink": "#4f9dff", "--bg": "#0f1626", "--bg-2": "#18233a", "--bg-3": "#26375a", "--base": "#0a0f1b", "--text": "#eef3ff", "--text-2": "#b9c6e4", "--faint": "#7c8db5" }],
  ["OLED black", { "--pink": "#ff3e8a", "--bg": "#000000", "--bg-2": "#111111", "--bg-3": "#262626", "--base": "#000000", "--text": "#f5f5f5", "--text-2": "#c4c4c4", "--faint": "#8a8a8a" }],
  ["Forest", { "--pink": "#4ade80", "--bg": "#0f1d17", "--bg-2": "#172a21", "--bg-3": "#24402f", "--base": "#0a140f", "--text": "#eef7f1", "--text-2": "#bcd6c6", "--faint": "#7fa08c", "--ok": "#a3e635" }],
  ["Ember", { "--pink": "#ff7a2e", "--bg": "#1f130d", "--bg-2": "#2e1b12", "--bg-3": "#47291a", "--base": "#170d08", "--text": "#fff3ea", "--text-2": "#e0c3ad", "--faint": "#a8836b" }],
  ["Ocean", { "--pink": "#22d3ee", "--bg": "#0b1c20", "--bg-2": "#12292f", "--bg-3": "#1d3f47", "--base": "#071417", "--text": "#ecfbfd", "--text-2": "#b5d9df", "--faint": "#74a3ab" }],
  ["Violet", { "--pink": "#a78bfa", "--bg": "#16112a", "--bg-2": "#221a3d", "--bg-3": "#35295c", "--base": "#0f0b1f", "--text": "#f3efff", "--text-2": "#cbc0ec", "--faint": "#8f82b8" }],
  ["Classic Stash", { "--pink": "#137cbd", "--bg": "#202b33", "--bg-2": "#293742", "--bg-3": "#394b59", "--base": "#182026", "--text": "#f5f8fa", "--text-2": "#bfccd6", "--faint": "#8a9ba8" }],
].map(([name, c]) => [name, Object.assign({}, base, c)]);

export const themeColors = () => Object.assign({}, PRESETS[0][1], (store.get("theme") || {}).colors);

// Sets the variables, plus the ones derived from them (lighter/darker accent, lines, text on accent)
export function applyTheme(theme = store.get("theme")) {
  document.documentElement.classList.toggle("kb-glass", !!store.get("glass"));
  document.documentElement.classList.toggle("kb-noblur", store.get("glassBlur", true) === false);
  // Glass transparency: the slider says how see-through, the CSS needs how much color
  document.documentElement.style.setProperty("--glass-mix", 100 - store.get("glassClear", 58) + "%");
  applyWallpaper();
  const s = document.documentElement.style;
  if (!theme || !theme.colors) {
    TOKENS.forEach(([v]) => s.removeProperty(v));
    ["--pink-2", "--pink-deep", "--fav", "--line", "--ink", "--paper", "--tone"].forEach((v) => s.removeProperty(v));
    return;
  }
  const c = Object.assign({}, PRESETS[0][1], theme.colors);
  TOKENS.forEach(([v]) => s.setProperty(v, c[v]));
  s.setProperty("--pink-2", `color-mix(in srgb, ${c["--pink"]}, #fff 25%)`);
  s.setProperty("--pink-deep", `color-mix(in srgb, ${c["--pink"]}, #000 55%)`);
  s.setProperty("--fav", c["--pink"]);
  s.setProperty("--line", `color-mix(in srgb, ${c["--bg-3"]} 85%, ${c["--bg"]})`);
  s.setProperty("--ink", c["--bg"]);
  s.setProperty("--paper", c["--text"]);
  s.setProperty("--tone", `radial-gradient(circle, color-mix(in srgb, ${c["--pink"]} 22%, transparent) 1.1px, transparent 1.7px)`);
}

// ---------- Background image ----------
// Either a random image with the tag "background" (the same images the Random Backgrounds plugin uses
// in classic Stash) – on every start or on every page – or one image chosen for good. A veil in the
// background color darkens it so text stays readable; changes fade over.

let wall = null;
let wallSrc = "";
let pool = null; // image URLs with the tag, loaded once
let front = 0;

export async function bgImages() {
  if (pool) return pool;
  const tag = (await gql(`query { findTags(tag_filter: { name: { value: "background", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id } } }`)).findTags.tags[0];
  if (!tag) return (pool = []);
  const d = await gql(`query($x: ImageFilterType, $f: FindFilterType) { findImages(image_filter: $x, filter: $f) { images { id paths { image thumbnail } } } }`, {
    x: { tags: { value: [tag.id], modifier: "INCLUDES" } },
    f: { per_page: 300, sort: seed() },
  });
  return (pool = d.findImages.images.map((i) => ({ id: i.id, image: i.paths.image, thumb: i.paths.thumbnail || i.paths.image })));
}

function showWall(src) {
  if (!src || src === wallSrc) return;
  wallSrc = src;
  const pre = new Image();
  pre.onload = () => {
    if (wallSrc !== src) return;
    const layers = wall.children;
    const next = layers[1 - front];
    next.style.backgroundImage = `url("${src}")`;
    next.classList.add("is-on");
    layers[front].classList.remove("is-on");
    front = 1 - front;
  };
  pre.src = src;
}

export async function applyWallpaper(shuffle) {
  const on = store.get("wallpaper", false);
  if (!on) {
    if (wall) wall.hidden = true;
    return;
  }
  if (!wall) {
    wall = document.createElement("div");
    wall.id = "kb-wall";
    wall.innerHTML = "<i></i><i></i>";
    document.body.prepend(wall);
    // New random image when the page changes (if switched on)
    window.addEventListener("hashchange", () => {
      if (store.get("wallpaper") && store.get("wallMode", "random") === "random" && store.get("wallPerPage", false)) applyWallpaper(true);
    });
  }
  wall.hidden = false;
  wall.style.setProperty("--wall-dim", store.get("wallDim", 60) / 100);
  if (store.get("wallMode", "random") === "fixed" && store.get("wallFixed")) return showWall(store.get("wallFixed"));
  if (wallSrc && !shuffle) return;
  try {
    const list = await bgImages();
    if (!list.length) return toast(t("No tag “background” found – tag the images you want as background with it."), "error");
    const others = list.filter((x) => x.image !== wallSrc);
    showWall((others.length ? others : list)[Math.floor(Math.random() * (others.length || list.length))].image);
  } catch (e) { /* no Stash (standalone) or no images */ }
}

// ---------- Own presets ----------

const ownPresets = () => store.get("themePresets", []);

// ---------- Ambient light (liquid glass) ----------
// The glass should show what's around it: the thumbnail under the mouse fades in blurred behind the
// page, and the player lets the running video glow behind its panel and into the black bars.

let ambient = null;
export function initAmbient() {
  if (ambient) return;
  ambient = document.createElement("div");
  ambient.id = "kb-ambient";
  ambient.innerHTML = "<img alt=''><img alt=''>";
  document.body.prepend(ambient);
  let front = 0;
  let timer = 0;
  let last = "";
  document.addEventListener("pointerover", (e) => {
    if (!document.documentElement.classList.contains("kb-glass")) return;
    const img = e.target.closest && e.target.closest(".kb-piece, .kb-tile, [data-amb]");
    const src = img && ((img.querySelector("img") || {}).currentSrc || (img.querySelector("img") || {}).src);
    if (!src || src === last) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      last = src;
      const imgs = ambient.querySelectorAll("img");
      const next = imgs[1 - front];
      next.onload = () => {
        next.classList.add("is-on");
        imgs[front].classList.remove("is-on");
        front = 1 - front;
      };
      next.src = src;
    }, 160);
  });
  // Leaving the photos/videos: after a moment the tint fades back to the theme colors
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest && e.target.closest(".kb-piece, .kb-tile, [data-amb]");
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".kb-piece, .kb-tile, [data-amb]");
    if (!from || to) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      last = "";
      ambient.querySelectorAll("img").forEach((i) => i.classList.remove("is-on"));
    }, 450);
  });
}

// Draws the video small and often into a canvas behind the player; CSS blurs it. Returns stop().
export function videoGlow(host, video) {
  if (!document.documentElement.classList.contains("kb-glass")) return () => {};
  const cv = document.createElement("canvas");
  cv.className = "kb-amb";
  // Blur off: a sharp copy of the video behind the clear glass (bigger, no blending – blending would smear
  // the motion); blur on: tiny and blended, the CSS blur turns it into a soft glow
  const sharp = document.documentElement.classList.contains("kb-noblur");
  const W = sharp ? 480 : 48;
  const H = sharp ? 270 : 27;
  cv.width = W;
  cv.height = H;
  host.prepend(cv);
  const ctx = cv.getContext("2d");
  // Every frame, but each new frame only blends in a little – colors glide instead of jumping.
  // After pausing it keeps blending for a moment until it has caught up, then rests.
  let raf = 0;
  let settle = 0;
  let first = true;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2) return;
    if (!video.paused || video.seeking) settle = 45;
    else if (settle-- <= 0) return;
    try {
      ctx.globalAlpha = first || sharp ? 1 : 0.1;
      ctx.drawImage(video, 0, 0, W, H);
      first = false;
    } catch (e) { /* not drawable */ }
  };
  const wake = () => (settle = 45);
  video.addEventListener("seeked", wake);
  loop();
  return () => {
    cancelAnimationFrame(raf);
    video.removeEventListener("seeked", wake);
    cv.remove();
  };
}

// ---------- Color math ----------

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
function hsv2rgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}
function rgb2hsv(r, g, b) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}

// ---------- Color wheel ----------
// Angle = hue, distance from the middle = saturation, slider = brightness. onChange(hex) while dragging.
export function openWheel(anchor, hex, onChange) {
  document.querySelectorAll(".kb-wheel-pop").forEach((p) => p.remove());
  const S = 200;
  let [h, s, v] = rgb2hsv(...hex2rgb(hex));
  const pop = document.createElement("div");
  pop.className = "kb-wheel-pop";
  pop.innerHTML = `<canvas width="${S}" height="${S}"></canvas><i class="kb-wheel-dot"></i>
    <input type="range" min="0" max="100" class="kb-wheel-v" aria-label="${t("Brightness")}">
    <div class="kb-wheel-row"><span class="kb-wheel-sw"></span><input class="kb-field" maxlength="7" spellcheck="false" aria-label="Hex"></div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + "px";
  pop.style.top = (r.bottom + pop.offsetHeight + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)) + "px";
  const cv = pop.querySelector("canvas");
  const ctx = cv.getContext("2d");
  const dot = pop.querySelector(".kb-wheel-dot");
  const vIn = pop.querySelector(".kb-wheel-v");
  const hexIn = pop.querySelector(".kb-field");
  const sw = pop.querySelector(".kb-wheel-sw");

  function paintDisc() {
    const img = ctx.createImageData(S, S);
    const R = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - R + 0.5;
        const dy = y - R + 0.5;
        const d = Math.hypot(dx, dy) / R;
        if (d > 1) continue;
        const [cr, cg, cb] = hsv2rgb((Math.atan2(dy, dx) * 180) / Math.PI + 360, d, v);
        const i = (y * S + x) * 4;
        img.data[i] = cr;
        img.data[i + 1] = cg;
        img.data[i + 2] = cb;
        img.data[i + 3] = d > 0.985 ? (1 - d) * 255 * 66 : 255; // soft edge
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function sync(fromHex) {
    const out = rgb2hex(...hsv2rgb(h, s, v));
    const a = (h * Math.PI) / 180;
    dot.style.left = S / 2 + Math.cos(a) * s * (S / 2) + 12 + "px";
    dot.style.top = S / 2 + Math.sin(a) * s * (S / 2) + 12 + "px";
    dot.style.background = out;
    sw.style.background = out;
    vIn.value = Math.round(v * 100);
    vIn.style.setProperty("--full", rgb2hex(...hsv2rgb(h, s, 1)));
    if (!fromHex) hexIn.value = out;
    onChange(out);
  }
  const pick = (e) => {
    const b = cv.getBoundingClientRect();
    const dx = e.clientX - b.left - b.width / 2;
    const dy = e.clientY - b.top - b.height / 2;
    h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    s = Math.min(1, Math.hypot(dx, dy) / (b.width / 2));
    sync();
  };
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    pick(e);
    cv.onpointermove = pick;
  });
  cv.addEventListener("pointerup", () => (cv.onpointermove = null));
  vIn.addEventListener("input", () => {
    v = vIn.value / 100;
    paintDisc();
    sync();
  });
  hexIn.addEventListener("input", () => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hexIn.value.trim());
    if (!m) return;
    [h, s, v] = rgb2hsv(...hex2rgb("#" + m[1]));
    paintDisc();
    sync(true);
  });
  const close = (e) => {
    if (e && (pop.contains(e.target) || anchor.contains(e.target))) return;
    pop.remove();
    document.removeEventListener("pointerdown", close, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("pointerdown", close, true);
  document.addEventListener("keydown", onKey, true);
  paintDisc();
  hexIn.value = hex;
  sync(true);
  return close;
}

// ---------- Settings block ----------

export function themeHtml() {
  const cur = store.get("theme") || {};
  const c = themeColors();
  return `<div class="kb-set kb-theme" data-theme>
    <div class="kb-set-label"><b>${t("Colors")}</b><small>${t("Pick a preset or set each color with the wheel. Saved in this browser.")}</small></div>
    <div class="kb-theme-body">
      <div class="kb-theme-presets">${PRESETS.map(([name, pc]) => presetBtn(name, pc, t(name), (cur.preset || "Plum") === name && !cur.custom)).join("")}${ownPresets()
        .map(([name, pc], i) => presetBtn("own:" + i, pc, name, cur.preset === "own:" + i && !cur.custom, i))
        .join("")}<button type="button" class="kb-theme-preset kb-theme-save" data-savepreset>${icon("plus")}<span>${t("Save current colors")}</span></button></div>
      <div class="kb-theme-tokens">${TOKENS.map(([v, label, hint]) => `<button type="button" class="kb-theme-token" data-token="${v}"><i style="background:${c[v]}"></i><span><b>${t(label)}</b><small>${t(hint)}</small></span><code>${c[v]}</code></button>`).join("")}</div>
      <label class="kb-theme-glass"><span class="kb-switch"><input type="checkbox" data-glass${store.get("glass") ? " checked" : ""}><i></i></span><span><b>${t("Liquid glass")}</b><small>${t("See-through, blurred panels with a light edge. Needs a bit more graphics power.")}</small></span></label>
      <div class="kb-theme-wall"${store.get("glass") ? "" : " hidden"} data-glassrow>
        <label class="kb-theme-range"><span>${t("Glass transparency")}</span><input type="range" min="0" max="100" step="1" data-glassclear value="${store.get("glassClear", 58)}"><output>${store.get("glassClear", 58)} %</output></label>
        <label class="kb-theme-inline"><span class="kb-switch"><input type="checkbox" data-glassblur${store.get("glassBlur", true) === false ? "" : " checked"}><i></i></span>${t("Blur behind the glass")}</label>
      </div>
      <label class="kb-theme-glass"><span class="kb-switch"><input type="checkbox" data-wall${store.get("wallpaper") ? " checked" : ""}><i></i></span><span><b>${t("Background image")}</b><small>${t("A random image with the tag “background” – the same ones the Random Backgrounds plugin shows in classic Stash. A new one on every start.")}</small></span></label>
      <div class="kb-theme-wall"${store.get("wallpaper") ? "" : " hidden"} data-wallrow>
        <div class="kb-seg" role="tablist"><button type="button" data-wallmode="random"${store.get("wallMode", "random") === "random" ? ' class="is-on"' : ""}>${t("Random")}</button><button type="button" data-wallmode="fixed"${store.get("wallMode", "random") === "fixed" ? ' class="is-on"' : ""}>${t("Chosen image")}</button></div>
        <div data-wallrandom${store.get("wallMode", "random") === "random" ? "" : " hidden"}>
          <label class="kb-theme-inline"><span class="kb-switch"><input type="checkbox" data-wallperpage${store.get("wallPerPage", false) ? " checked" : ""}><i></i></span>${t("New image on every page")}</label>
          <button type="button" class="kb-btn is-ghost" data-wallnext>${icon("shuffle")}${t("Another image")}</button>
        </div>
        <div data-wallfixed${store.get("wallMode", "random") === "fixed" ? "" : " hidden"}>
          <div class="kb-wall-grid" data-wallgrid><div class="kb-loading">${t("Loading …")}</div></div>
          <label class="kb-theme-inline kb-wall-url"><span>${t("Or an image URL")}</span><input class="kb-field" data-wallurl placeholder="https://…" value="${esc(store.get("wallMode") === "fixed" && !String(store.get("wallFixed") || "").startsWith("/") ? store.get("wallFixed") || "" : "")}" spellcheck="false"></label>
        </div>
        <div class="kb-theme-range"><span>${t("Darken")}</span><input type="range" min="0" max="90" step="1" data-walldim value="${store.get("wallDim", 60)}"><output>${store.get("wallDim", 60)} %</output></div>
      </div>
      <button type="button" class="kb-btn is-ghost" data-themereset>${t("Back to default colors")}</button>
    </div>
  </div>`;
}

function presetBtn(id, pc, label, on, own) {
  return `<button type="button" class="kb-theme-preset${on ? " is-on" : ""}" data-preset="${esc(id)}" style="--p-bg:${pc["--bg"]};--p-2:${pc["--bg-2"]};--p-acc:${pc["--pink"]};--p-text:${pc["--text"]}"><i></i><span>${esc(label)}</span>${own != null ? `<b class="kb-theme-del" data-delpreset="${own}" title="${t("Delete")}">×</b>` : ""}</button>`;
}

export function bindTheme(root) {
  const box = root.querySelector("[data-theme]");
  const rerender = () => {
    box.outerHTML = themeHtml();
    bindTheme(root);
  };
  box.querySelector("[data-glass]").addEventListener("change", (e) => {
    store.set("glass", e.target.checked);
    box.querySelector("[data-glassrow]").hidden = !e.target.checked;
    applyTheme();
  });
  box.querySelector("[data-glassblur]").addEventListener("change", (e) => {
    store.set("glassBlur", e.target.checked);
    applyTheme();
  });
  box.querySelector("[data-glassclear]").addEventListener("input", (e) => {
    store.set("glassClear", Number(e.target.value));
    e.target.nextElementSibling.textContent = e.target.value + " %";
    applyTheme();
  });
  box.querySelector("[data-wall]").addEventListener("change", (e) => {
    store.set("wallpaper", e.target.checked);
    box.querySelector("[data-wallrow]").hidden = !e.target.checked;
    applyWallpaper();
  });
  box.querySelector("[data-walldim]").addEventListener("input", (e) => {
    store.set("wallDim", Number(e.target.value));
    e.target.nextElementSibling.textContent = e.target.value + " %";
    applyWallpaper();
  });
  box.querySelector("[data-wallnext]").addEventListener("click", () => applyWallpaper(true));
  box.querySelector("[data-wallperpage]").addEventListener("change", (e) => store.set("wallPerPage", e.target.checked));
  // Chosen image: the images with the tag "background" to pick from, or any URL
  const fillGrid = async () => {
    const grid = box.querySelector("[data-wallgrid]");
    try {
      const list = await bgImages();
      grid.innerHTML = list.length
        ? list.slice(0, 120).map((x) => `<button type="button" data-wallpick="${esc(x.image)}" class="${store.get("wallFixed") === x.image ? "is-on" : ""}"><img alt="" loading="lazy" src="${esc(x.thumb)}"></button>`).join("")
        : `<p class="kb-hint">${t("No tag “background” found – tag the images you want as background with it.")}</p>`;
    } catch (e) {
      grid.innerHTML = `<p class="kb-hint">${esc(e.message)}</p>`;
    }
  };
  if (store.get("wallMode", "random") === "fixed") fillGrid();
  box.querySelectorAll("[data-wallmode]").forEach((b) =>
    b.addEventListener("click", () => {
      const mode = b.dataset.wallmode;
      store.set("wallMode", mode);
      box.querySelectorAll("[data-wallmode]").forEach((x) => x.classList.toggle("is-on", x === b));
      box.querySelector("[data-wallrandom]").hidden = mode !== "random";
      box.querySelector("[data-wallfixed]").hidden = mode !== "fixed";
      if (mode === "fixed") fillGrid();
      applyWallpaper(mode === "random");
    })
  );
  box.querySelector("[data-wallgrid]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wallpick]");
    if (!b) return;
    store.set("wallFixed", b.dataset.wallpick);
    box.querySelectorAll("[data-wallpick]").forEach((x) => x.classList.toggle("is-on", x === b));
    applyWallpaper();
  });
  box.querySelector("[data-wallurl]").addEventListener("change", (e) => {
    const url = e.target.value.trim();
    if (!/^(https?:\/\/|\/)/.test(url)) return;
    store.set("wallFixed", url);
    box.querySelectorAll("[data-wallpick]").forEach((x) => x.classList.remove("is-on"));
    applyWallpaper();
  });
  box.addEventListener("click", (e) => {
    const del = e.target.closest("[data-delpreset]");
    if (del) {
      const list = ownPresets();
      list.splice(Number(del.dataset.delpreset), 1);
      store.set("themePresets", list);
      const cur = store.get("theme");
      if (cur && String(cur.preset).startsWith("own:")) store.set("theme", Object.assign(cur, { custom: true }));
      return rerender();
    }
    if (e.target.closest("[data-savepreset]")) {
      return promptDialog({ title: t("Save current colors"), label: t("Name of the preset"), value: t("My colors"), ok: t("Save") }).then((name) => {
        if (!name) return;
        const list = ownPresets();
        list.push([name.trim().slice(0, 40), themeColors()]);
        store.set("themePresets", list);
        store.set("theme", { preset: "own:" + (list.length - 1), colors: themeColors() });
        rerender();
      });
    }
    const p = e.target.closest("[data-preset]");
    if (p) {
      const id = p.dataset.preset;
      const preset = id.startsWith("own:") ? ownPresets()[Number(id.slice(4))] : PRESETS.find(([n]) => n === id);
      if (!preset) return;
      store.set("theme", { preset: id, colors: Object.assign({}, PRESETS[0][1], preset[1]) });
      applyTheme();
      return rerender();
    }
    if (e.target.closest("[data-themereset]")) {
      store.set("theme", null);
      applyTheme();
      return rerender();
    }
    const tok = e.target.closest("[data-token]");
    if (tok) {
      const v = tok.dataset.token;
      openWheel(tok, themeColors()[v], (hex) => {
        const th = store.get("theme") || { preset: "Plum" };
        th.colors = Object.assign(themeColors(), { [v]: hex });
        th.custom = true;
        store.set("theme", th);
        applyTheme();
        tok.querySelector("i").style.background = hex;
        tok.querySelector("code").textContent = hex;
        box.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("is-on"));
      });
    }
  });
}
