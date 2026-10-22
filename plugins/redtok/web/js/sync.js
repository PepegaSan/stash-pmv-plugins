// RedTok – the same follows, niches, tags, likes … on every device that opens this Stash (Settings → Your data → Sync).
// Each list keeps the time of its last change; the plugin's backend keeps one copy next to Stash (sync_get / sync_put) and
// the newer copy of a list wins. A list this browser has never synced is joined with the one in Stash (nothing is lost
// when a second device is switched on). Watch history, hidden "seen" marks and settings stay on each device.

import { call } from "./core.js";

export const SYNC_KEYS = ["liked", "following", "niches", "tagFollows", "blocked", "hidden", "nope", "saved"];
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full or blocked */ } },
};
export const syncOn = () => { try { return JSON.parse(ls.get("rgf.settings") || "{}").syncDev === true; } catch (e) { return false; } };
const mtGet = () => { try { return JSON.parse(ls.get("rgf.mt") || "{}") || {}; } catch (e) { return {}; } };
const mtSet = (m) => ls.set("rgf.mt", JSON.stringify(m));
export const lastSync = () => Number(ls.get("rgf.syncAt") || 0);

// called by store.set: this list changed now
export function touch(key) {
  if (!SYNC_KEYS.includes(key)) return;
  const m = mtGet();
  m[key] = Date.now();
  mtSet(m);
}

// two copies of a list that were never synced together: everything in either
function join(a, b) {
  try {
    const x = JSON.parse(a);
    const y = JSON.parse(b);
    if (Array.isArray(x) && Array.isArray(y)) {
      const seen = new Set();
      return JSON.stringify([...y, ...x].filter((v) => { const s = JSON.stringify(v); return !seen.has(s) && seen.add(s); }));
    }
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) return JSON.stringify(Object.assign({}, y, x));
  } catch (e) { /* not JSON – the one in Stash */ }
  return b;
}

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

let pushed = {}; // list → time of the copy Stash has

// Stash → this browser. Returns how many lists changed here.
export async function pull() {
  if (!syncOn()) return 0;
  const r = await Promise.race([call({ mode: "sync_get" }), timeout(5000)]);
  const remote = (r && r.keys) || {};
  const mt = mtGet();
  const now = Date.now();
  let n = 0;
  for (const k of SYNC_KEYS) {
    const rem = remote[k];
    const loc = ls.get("rgf." + k);
    if (!rem || typeof rem.v !== "string") {
      if (mt[k] == null && loc != null) mt[k] = now; // (Stash has no copy yet → this one goes up)
      continue;
    }
    if (mt[k] == null) {
      const merged = loc == null ? rem.v : join(loc, rem.v);
      if (merged !== loc) { ls.set("rgf." + k, merged); n++; }
      mt[k] = now; // (newer than Stash now → goes up with the next push)
    } else if (rem.t > mt[k]) {
      if (rem.v !== loc) { ls.set("rgf." + k, rem.v); n++; }
      mt[k] = pushed[k] = rem.t;
    }
  }
  mtSet(mt);
  ls.set("rgf.syncAt", String(now));
  return n;
}

// this browser → Stash (only what changed since the last push)
export async function push() {
  if (!syncOn()) return;
  const mt = mtGet();
  const keys = {};
  for (const k of SYNC_KEYS) {
    const v = ls.get("rgf." + k);
    if (v == null || mt[k] == null || pushed[k] === mt[k]) continue;
    keys[k] = { v, t: mt[k] };
  }
  if (!Object.keys(keys).length) return;
  await call({ mode: "sync_put", keys });
  for (const k of Object.keys(keys)) pushed[k] = keys[k].t;
  ls.set("rgf.syncAt", String(Date.now()));
}

// Back in the tab after a while: take what other devices changed (the page reloads to show it)
let hiddenAt = 0;
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "hidden") return (hiddenAt = Date.now());
  if (!syncOn() || !hiddenAt || Date.now() - hiddenAt < 120000) return;
  hiddenAt = 0;
  try {
    if (await pull()) location.reload();
  } catch (e) { /* offline – the next time */ }
});
