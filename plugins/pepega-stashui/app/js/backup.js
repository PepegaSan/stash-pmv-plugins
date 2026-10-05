// Backup and restore of everything this interface remembers: the settings kept in this browser
// (localStorage "stashui." / Media Storm) and the shared ones kept in the plugin settings in Stash
// (ratings, playlists, Versus, funscript variants …). One JSON file; restoring writes the values in it
// over the current ones – anything not in the file stays as it is.

import { pluginConfig, setPluginConfig } from "./api.js";
import { toast, errorToast, confirmDialog } from "./ui.js";
import { t } from "./i18n.js";
import { CHANGES } from "./changelog.js";

const FORMAT = "stashui-backup";
const PLUGINS = ["pepega-stashui", "pmvGenerator", "mediaStorm"]; // whose settings in Stash are backed up
// What is only remembered to be quick (rebuilt by itself) is not worth keeping
const SKIP = /^stashui\.(statsCache|folderTree|extFound|extPlugins\d*|large|eventLog|foldersOnce)$/;
const mine = (k) => (k.startsWith("stashui.") || k.startsWith("mediaStorm.")) && !SKIP.test(k);

const localEntries = () => {
  const out = {};
  try {
    for (const k of Object.keys(localStorage)) if (mine(k)) out[k] = localStorage.getItem(k);
  } catch (e) { /* blocked */ }
  return out;
};

export async function exportBackup() {
  const plugin = {};
  for (const id of PLUGINS) {
    try {
      const c = await pluginConfig(id);
      if (c && Object.keys(c).length) plugin[id] = c;
    } catch (e) { /* plugin not installed */ }
  }
  const data = { format: FORMAT, version: 1, app: CHANGES[0].v, at: new Date().toISOString(), local: localEntries(), plugin };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  a.download = `stash-ui-backup-${data.at.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  const n = Object.keys(data.local).length + Object.values(plugin).reduce((s, c) => s + Object.keys(c).length, 0);
  toast(t("Backup saved ({n} values)", { n }), "ok");
}

export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    return toast(t("That isn't a backup file."), "err");
  }
  if (!data || data.format !== FORMAT || typeof data.local !== "object" || typeof data.plugin !== "object") return toast(t("That isn't a backup file."), "err");
  const local = Object.entries(data.local || {}).filter(([k, v]) => mine(k) && typeof v === "string");
  const plugins = Object.entries(data.plugin || {}).filter(([id, c]) => PLUGINS.includes(id) && c && typeof c === "object");
  const nPlugin = plugins.reduce((s, [, c]) => s + Object.keys(c).length, 0);
  const r = await confirmDialog({
    title: t("Restore this backup?"),
    text: t("{a} browser settings and {b} shared values from {d} are written over the current ones. Everything else stays as it is.", { a: local.length, b: nPlugin, d: String(data.at || "").slice(0, 10) || "?" }),
    ok: t("Restore"),
    danger: true,
  });
  if (!r.ok) return;
  try {
    for (const [id, c] of plugins) {
      try {
        await setPluginConfig(id, c);
      } catch (e) {
        if (id === "pepega-stashui") throw e; // the others may simply not be installed here
      }
    }
    for (const [k, v] of local) localStorage.setItem(k, v);
  } catch (e) {
    return errorToast(e, "Restore");
  }
  toast(t("Backup restored"), "ok");
  setTimeout(() => location.reload(), 600); // so every part starts from the restored values
}
