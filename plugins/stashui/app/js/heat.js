// Highlight heatmap for the player's timeline.
// - Motion: from Stash's preview sprites (one frame every few seconds) – how much the image
//   changes from the previous one, plus the skin share. No video has to be loaded for this.
// - Your watching: which parts you actually watch and where you seek to (stored locally in the browser).
// From that: a heat curve (BINS segments) and the top spots as jump marks.

import { store } from "./ui.js";
import { analyze, motion } from "./pmvsmart.js";

export const BINS = 80;
const LS = "heat"; // { [sceneId]: { b: [..BINS], at } } – only the last 400 scenes

// ---------- Your watching ----------

function readAll() {
  return store.get(LS, {});
}
export function watchBins(id) {
  const e = readAll()[id];
  return e && Array.isArray(e.b) && e.b.length === BINS ? e.b : null;
}

// Spread watched seconds (or weighted seek targets) over the segments – batched, saved rarely
export function watchRecorder(id, duration) {
  const add = new Float32Array(BINS);
  let dirty = false;
  const bin = (t) => Math.max(0, Math.min(BINS - 1, Math.floor((t / duration) * BINS)));
  return {
    played(t, sec) {
      if (!duration || !(sec > 0)) return;
      add[bin(t)] += sec;
      dirty = true;
    },
    seeked(t) {
      if (!duration) return;
      add[bin(t)] += 6; // seeking to a spot counts like a few seconds of watching
      dirty = true;
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      const all = readAll();
      const e = all[id] && all[id].b && all[id].b.length === BINS ? all[id] : { b: new Array(BINS).fill(0) };
      e.b = e.b.map((v, i) => Math.round((v + add[i]) * 10) / 10);
      e.at = Date.now();
      add.fill(0);
      all[id] = e;
      const keys = Object.keys(all);
      if (keys.length > 400) keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - 400).forEach((k) => delete all[k]);
      store.set(LS, all);
    },
  };
}

// ---------- Motion from the sprites ----------

const motionCache = new Map();
export function motionBins(sprites, duration) {
  if (!sprites || !duration) return Promise.resolve(null);
  if (motionCache.has(sprites.url)) return motionCache.get(sprites.url);
  const p = new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        const [, , cw, ch] = sprites.cues[0].xywh;
        c.width = cw;
        c.height = ch;
        const g = c.getContext("2d", { willReadFrequently: true });
        const bins = new Float32Array(BINS);
        const hits = new Float32Array(BINS);
        let prev = null;
        for (const cue of sprites.cues) {
          const [x, y, w, h] = cue.xywh;
          g.drawImage(img, x, y, w, h, 0, 0, cw, ch);
          const a = analyze(c, cw, ch);
          const score = (prev ? 2.2 * motion(prev, a) : 0) + 0.8 * Math.min(1, a.skin * 2.5) + 0.3 * Math.min(1, a.contrast * 3);
          prev = a;
          const b = Math.min(BINS - 1, Math.floor((((cue.start + cue.end) / 2) / duration) * BINS));
          bins[b] += score;
          hits[b]++;
        }
        // Fill gaps (long intervals between sprites) from neighbors
        const out = Array.from(bins, (v, i) => (hits[i] ? v / hits[i] : null));
        for (let i = 0; i < BINS; i++) if (out[i] == null) out[i] = out[i - 1] != null ? out[i - 1] : 0;
        res(out);
      } catch (e) {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = sprites.url;
  });
  motionCache.set(sprites.url, p);
  return p;
}

// ---------- Combine ----------

// Values 0–1 per segment; motion counts fully, your own watching a bit more (you know what's good)
export function combine(mot, watch) {
  const norm = (arr) => {
    if (!arr) return null;
    const sm = arr.map((v, i) => 0.25 * (arr[i - 1] ?? v) + 0.5 * v + 0.25 * (arr[i + 1] ?? v)); // smooth
    const lo = Math.min(...sm);
    const hi = Math.max(...sm);
    return hi - lo > 1e-6 ? sm.map((v) => (v - lo) / (hi - lo)) : null;
  };
  const m = norm(mot);
  const w = norm(watch && watch.some((v) => v > 0) ? watch : null);
  if (!m && !w) return null;
  return Array.from({ length: BINS }, (_, i) => (m && w ? 0.45 * m[i] + 0.55 * w[i] : (m || w)[i]));
}

// The hottest spots (segment center in seconds), spaced apart
export function peaks(heat, duration, n = 4) {
  if (!heat) return [];
  const idx = heat.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const out = [];
  const gap = Math.max(2, Math.round(BINS * 0.08));
  for (const [v, i] of idx) {
    if (v < 0.55 || out.length >= n) break;
    if (out.every((j) => Math.abs(j - i) >= gap)) out.push(i);
  }
  // Start a little before the peak
  return out.map((i) => Math.max(0, ((i + 0.2) / BINS) * duration)).sort((a, b) => a - b);
}
