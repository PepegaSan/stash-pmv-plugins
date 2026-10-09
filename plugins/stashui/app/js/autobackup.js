// Settings that follow you: what this interface keeps in the browser (localStorage "stashui." / Media Storm) is copied
// to the plugin settings in Stash a little after it changes. A browser that has forgotten them (site data cleared,
// another address like 127.0.0.1 vs localhost vs the Tailscale name, a private window, a new device) gets them back
// at start – before anything reads them. The manual Save / Restore backup (Settings → General) stays as it is.

import { pluginConfig, setPluginConfig } from "./api.js";
import { store, toast } from "./ui.js";
import { t } from "./i18n.js";
import { mine, localEntries } from "./backup.js";

const KEY = "autoBackup"; // in the plugin settings of stashui: JSON { at, local }
const MAX_VALUE = 300000; // a single value bigger than this isn't copied
const on = () => store.get("autoBackup", true) !== false;
let saved = null; // what Stash has
let last = ""; // the snapshot that was written last

async function readSaved() {
  const c = await pluginConfig("stashui");
  try {
    return c[KEY] ? JSON.parse(c[KEY]) : null;
  } catch (e) {
    return null;
  }
}

// At the very start (before the settings are used): a browser with (almost) nothing of its own gets the copy from Stash.
// Returns true when the page is reloading to start from the restored values.
export async function restoreIfFresh() {
  if (!on() || sessionStorage.getItem("stashui.restored")) return false;
  const have = localEntries();
  if (Object.keys(have).length > 3) return false;
  let s;
  try {
    s = await readSaved();
  } catch (e) {
    return false;
  }
  saved = s;
  if (!s || !s.local) return false;
  const entries = Object.entries(s.local).filter(([k, v]) => mine(k) && typeof v === "string" && !(k in have));
  if (entries.length < 3) return false;
  for (const [k, v] of entries) {
    try {
      localStorage.setItem(k, v);
    } catch (e) { /* full or blocked */ }
  }
  sessionStorage.setItem("stashui.restored", String(entries.length));
  location.reload();
  return true;
}

let timer = 0;
const later = () => {
  if (!on()) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 20000);
};

async function flush() {
  clearTimeout(timer);
  if (!on()) return;
  const snap = {};
  for (const [k, v] of Object.entries(localEntries())) if (v.length <= MAX_VALUE) snap[k] = v;
  const body = JSON.stringify(snap);
  if (body === last) return;
  try {
    if (!saved) saved = await readSaved();
    const old = saved && saved.local ? Object.keys(saved.local).length : 0;
    // a browser that has just lost its settings must not overwrite the good copy
    if (old > 6 && Object.keys(snap).length < old / 2) return;
    const rec = { at: new Date().toISOString(), local: snap };
    await setPluginConfig("stashui", { [KEY]: JSON.stringify(rec) });
    saved = rec;
    last = body;
  } catch (e) { /* the next change tries again */ }
}

export function startAutoBackup() {
  const n = sessionStorage.getItem("stashui.restored");
  if (n && !sessionStorage.getItem("stashui.restoredShown")) {
    sessionStorage.setItem("stashui.restoredShown", "1");
    toast(t("This browser had forgotten its settings – {n} of them came back from Stash.", { n }), "ok");
  }
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    orig.call(this, k, v);
    if (this === localStorage && mine(String(k))) later();
  };
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  later(); // (settings that were never copied yet)
}
