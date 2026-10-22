// RedTok – runs before anything reads the browser storage: a browser without any RedTok data (site data cleared,
// Stash opened under another address, a new device) gets it back from the backup file next to Stash.

import { call } from "./core.js";
import { pull } from "./sync.js";

export let restoredN = 0;
const have = {};
try { for (const k of Object.keys(localStorage)) if (k.startsWith("rgf.")) have[k] = localStorage.getItem(k); } catch (e) { /* blocked */ }
const real = (k) => have[k] && have[k] !== "[]" && have[k] !== "{}" && have[k] !== "null";
if (!["rgf.liked", "rgf.following", "rgf.watched", "rgf.history", "rgf.done", "rgf.settings"].some(real)) {
  try {
    const o = await call({ mode: "bk_load" });
    const e = Object.entries((o && o.data) || {}).filter(([k, v]) => k.startsWith("rgf.") && typeof v === "string" && !(k in have));
    e.forEach(([k, v]) => localStorage.setItem(k, v));
    restoredN = e.length;
  } catch (x) { /* no backup (yet), or no backend */ }
}
// Sync between devices (Settings → Your data): the newer copy of each list from Stash, before the page reads them
try { await pull(); } catch (x) { /* no backend, offline – the next time */ }
