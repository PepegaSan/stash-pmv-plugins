// Effects layer (see fx.css): button ripples, card tilt and light, the glow behind the mouse,
// the reading progress and the wipe on page changes. Everything is delegated – nothing is bound per card.
// Off with Settings → This interface → Effects, and automatically when the system asks for less motion.

import { store } from "./ui.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
export const fxOn = () => store.get("fx", true) !== false && !reduced.matches;

let started = false;
let glow, prog, wipe, raf = 0, mx = 0, my = 0, tiltEl = null;

export function applyFx() {
  const on = fxOn();
  document.documentElement.classList.toggle("kb-fx", on);
  if (on && !started) start();
}

function el(id) {
  const d = document.createElement("div");
  d.id = id;
  d.setAttribute("aria-hidden", "true");
  document.body.appendChild(d);
  return d;
}

function start() {
  started = true;
  glow = el("kb-glow");
  prog = el("kb-prog");
  wipe = el("kb-wipe");

  addEventListener("pointermove", (e) => {
    if (!fxOn() || e.pointerType === "touch") return;
    mx = e.clientX;
    my = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  // a ripple where a button is pressed
  addEventListener("pointerdown", (e) => {
    if (!fxOn() || e.button !== 0) return;
    const b = e.target.closest && e.target.closest(".kb-btn, .kb-chip, .kb-seg button, .kb-seg > a, .kb-nav a, .kb-nav button, .kb-nsfw-btn, .kb-railmode-btn");
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "kb-rip";
    s.style.left = e.clientX - r.left + "px";
    s.style.top = e.clientY - r.top + "px";
    s.style.setProperty("--rs", String(Math.ceil(Math.max(r.width, r.height) / 4)));
    b.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }, { passive: true });

  // the card under the mouse leans towards it
  document.documentElement.addEventListener("pointerleave", () => untilt());
  addEventListener("blur", () => untilt());

  let sraf = 0;
  addEventListener("scroll", () => {
    if (!fxOn() || sraf) return;
    sraf = requestAnimationFrame(() => { sraf = 0; progress(); });
  }, { passive: true });
  const progress = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${h > 80 ? Math.min(1, scrollY / h).toFixed(3) : 0})`; // (on the bar itself: a variable on <html> would restyle the whole page)
  };

  addEventListener("hashchange", () => {
    if (!fxOn()) return;
    wipe.classList.remove("is-go");
    void wipe.offsetWidth; // restart the animation
    wipe.classList.add("is-go");
  });
  reduced.addEventListener("change", applyFx);
}

function untilt() {
  if (!tiltEl) return;
  tiltEl.classList.remove("is-tilting");
  tiltEl.style.removeProperty("--rx");
  tiltEl.style.removeProperty("--ry");
  tiltEl = null;
}

function frame() {
  raf = 0;
  document.documentElement.classList.add("kb-fx-moved");
  glow.style.transform = `translate(${mx}px, ${my}px)`;
  const p = document.elementFromPoint(mx, my);
  const card = p && p.closest ? p.closest(".kb-piece") : null;
  if (card !== tiltEl) untilt();
  if (!card) return;
  const r = card.getBoundingClientRect();
  const x = (mx - r.left) / r.width;
  const y = (my - r.top) / r.height;
  tiltEl = card;
  card.classList.add("is-tilting");
  card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
  card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
  card.style.setProperty("--rx", ((0.5 - y) * 9).toFixed(2) + "deg");
  card.style.setProperty("--ry", ((x - 0.5) * 11).toFixed(2) + "deg");
}
