// A crop rectangle drawn over the player's picture (for "Cut clips" → "Crop / zoom in").
// The area is kept as fractions of the picture ({x, y, w, h}, 0–1), so it fits any size the video is shown at.
// "Zoom preview" scales the video with CSS so the chosen area fills the screen – that is what the saved video will show.

const MIN = 0.04; // smallest side as a fraction of the picture

export function createCropper(video, initial) {
  const screen = video.closest(".kb-screen") || video.parentElement;
  const root = document.createElement("div");
  root.className = "kb-crop";
  root.hidden = true;
  root.innerHTML = `<div class="kb-crop-box" data-box>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<i class="kb-crop-h kb-crop-${h}" data-h="${h}"></i>`).join("")}<span class="kb-crop-size" data-size></span></div>`;
  screen.appendChild(root);
  const box = root.querySelector("[data-box]");
  const sizeEl = root.querySelector("[data-size]");

  let r = Object.assign({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, initial || {});
  let aspect = 0; // width / height in PICTURE pixels; 0 = free
  let zoomed = false;
  let onChange = () => {};
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // Where the picture really is inside the (letterboxed) video element, in px relative to the screen
  function content() {
    const s = screen.getBoundingClientRect();
    const b = video.getBoundingClientRect();
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const k = Math.min(b.width / vw, b.height / vh) || 1;
    const w = vw * k;
    const h = vh * k;
    return { x: b.left - s.left + (b.width - w) / 2, y: b.top - s.top + (b.height - h) / 2, w, h, sw: s.width, sh: s.height, vw, vh, bx: b.left - s.left, by: b.top - s.top, bw: b.width, bh: b.height };
  }
  // ratio of the rectangle's fractions that gives the aspect in pixels
  const fracAspect = () => (aspect ? (aspect * (video.videoHeight || 9)) / (video.videoWidth || 16) : 0);

  function paint() {
    const c = content();
    box.style.left = c.x + r.x * c.w + "px";
    box.style.top = c.y + r.y * c.h + "px";
    box.style.width = r.w * c.w + "px";
    box.style.height = r.h * c.h + "px";
    sizeEl.textContent = `${Math.round(r.w * c.vw)} × ${Math.round(r.h * c.vh)}`;
    if (zoomed) applyZoom(c);
  }
  function applyZoom(c) {
    c = c || content();
    const W = r.w * c.w;
    const H = r.h * c.h;
    const s = Math.min(c.bw / W, c.bh / H);
    const X = c.x + r.x * c.w - c.bx;
    const Y = c.y + r.y * c.h - c.by;
    video.style.transformOrigin = "0 0";
    video.style.transform = `translate(${c.bw / 2 - s * (X + W / 2)}px, ${c.bh / 2 - s * (Y + H / 2)}px) scale(${s})`;
  }

  // Make the rectangle fit the aspect and the picture
  function fit(keepCenter = true) {
    const A = fracAspect();
    if (A) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      let w = r.w;
      let h = w / A;
      if (h > 1) (h = 1), (w = h * A);
      if (w > 1) (w = 1), (h = w / A);
      r = { x: keepCenter ? cx - w / 2 : r.x, y: keepCenter ? cy - h / 2 : r.y, w, h };
    }
    r.x = clamp(r.x, 0, 1 - r.w);
    r.y = clamp(r.y, 0, 1 - r.h);
  }

  // ---- dragging ----
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    if (zoomed || e.button > 0) return;
    const c = content();
    const h = e.target.closest && e.target.closest("[data-h]");
    const inBox = e.target.closest && e.target.closest("[data-box]");
    const px = (e.clientX - screen.getBoundingClientRect().left - c.x) / c.w;
    const py = (e.clientY - screen.getBoundingClientRect().top - c.y) / c.h;
    if (h) drag = { mode: h.dataset.h, r0: { ...r }, c };
    else if (inBox) drag = { mode: "move", r0: { ...r }, c };
    else drag = { mode: "new", r0: { x: clamp(px, 0, 1), y: clamp(py, 0, 1), w: 0, h: 0 }, c, fixed: true };
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    try {
      root.setPointerCapture(e.pointerId);
    } catch (err) {
      /* (no such pointer) */
    }
    e.preventDefault();
    e.stopPropagation();
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { c, r0, mode } = drag;
    const dx = (e.clientX - drag.sx) / c.w;
    const dy = (e.clientY - drag.sy) / c.h;
    const A = fracAspect();
    if (mode === "move") {
      r = { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) };
    } else if (mode === "new") {
      let x2 = clamp(r0.x + dx, 0, 1);
      let y2 = clamp(r0.y + dy, 0, 1);
      let w = Math.abs(x2 - r0.x);
      let h = Math.abs(y2 - r0.y);
      if (A) {
        h = w / A;
        if (h > (y2 < r0.y ? r0.y : 1 - r0.y)) (h = y2 < r0.y ? r0.y : 1 - r0.y), (w = h * A);
      }
      r = { x: x2 < r0.x ? r0.x - w : r0.x, y: y2 < r0.y ? r0.y - h : r0.y, w: Math.max(w, MIN), h: Math.max(h, MIN) };
    } else {
      let l = r0.x;
      let t = r0.y;
      let rt = r0.x + r0.w;
      let b = r0.y + r0.h;
      if (mode.includes("w")) l = clamp(r0.x + dx, 0, rt - MIN);
      if (mode.includes("e")) rt = clamp(rt + dx, l + MIN, 1);
      if (mode.includes("n")) t = clamp(r0.y + dy, 0, b - MIN);
      if (mode.includes("s")) b = clamp(b + dy, t + MIN, 1);
      if (A) {
        if (mode.length === 2) {
          // a corner: the opposite corner stays, the shape follows the aspect
          let w = rt - l;
          let h = w / A;
          const room = mode.includes("n") ? b : 1 - t;
          if (h > room) (h = room), (w = h * A);
          if (mode.includes("w")) l = rt - w;
          else rt = l + w;
          if (mode.includes("n")) t = b - h;
          else b = t + h;
        } else if (mode === "e" || mode === "w") {
          let w = rt - l;
          let h = w / A;
          const cy = r0.y + r0.h / 2;
          const maxH = 2 * Math.min(cy, 1 - cy);
          if (h > maxH) (h = maxH), (w = h * A);
          if (mode === "w") l = rt - w;
          else rt = l + w;
          t = cy - h / 2;
          b = t + h;
        } else {
          let h = b - t;
          let w = h * A;
          const cx = r0.x + r0.w / 2;
          const maxW = 2 * Math.min(cx, 1 - cx);
          if (w > maxW) (w = maxW), (h = w / A);
          if (mode === "n") t = b - h;
          else b = t + h;
          l = cx - w / 2;
          rt = l + w;
        }
      }
      r = { x: l, y: t, w: rt - l, h: b - t };
    }
    r.w = clamp(r.w, MIN, 1);
    r.h = clamp(r.h, MIN, 1);
    r.x = clamp(r.x, 0, 1 - r.w);
    r.y = clamp(r.y, 0, 1 - r.h);
    paint();
    onChange(get());
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* (already gone) */
    }
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => paint()) : null;
  ro && ro.observe(screen);
  video.addEventListener("loadedmetadata", paint);
  window.addEventListener("resize", paint);

  const get = () => ({ x: +r.x.toFixed(5), y: +r.y.toFixed(5), w: +r.w.toFixed(5), h: +r.h.toFixed(5) });
  return {
    get,
    set(n, silent) {
      r = Object.assign({}, r, n);
      fit(true);
      paint();
      !silent && onChange(get());
    },
    onChange(fn) {
      onChange = fn;
    },
    // aspect in picture pixels: 0 = free, "video" = same as the video
    setAspect(a) {
      aspect = a === "video" ? (video.videoWidth || 16) / (video.videoHeight || 9) : Number(a) || 0;
      fit(true);
      paint();
      onChange(get());
    },
    show(on = true) {
      root.hidden = !on;
      if (on) paint();
    },
    zoom(on) {
      zoomed = !!on;
      root.classList.toggle("is-zoomed", zoomed);
      video.classList.toggle("kb-cropzoom", zoomed);
      if (zoomed) applyZoom();
      else {
        video.style.transform = "";
        video.style.transformOrigin = "";
      }
    },
    get zoomed() {
      return zoomed;
    },
    destroy() {
      ro && ro.disconnect();
      video.removeEventListener("loadedmetadata", paint);
      window.removeEventListener("resize", paint);
      video.style.transform = "";
      video.style.transformOrigin = "";
      video.classList.remove("kb-cropzoom");
      root.remove();
    },
  };
}
