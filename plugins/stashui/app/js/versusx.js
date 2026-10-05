// Versus, the extras: tiers (S–F by percentile), the ledger (last 10 matches of an item), snapshots of the
// standings (kept in Stash, export / import as a file), an event log, a small overview and the options
// of the matches. Idea: the Ascension plugin (a rating and tier system for Stash); this is our own take
// on Stash UI's Versus standings (see views/versus.js for how they're kept).

import { esc, icon, toast, errorToast, store, openDrawer, confirmDialog, fmtAgo } from "./ui.js";
import { t } from "./i18n.js";
import { pluginConfig, setPluginConfig } from "./api.js";
import { logEvent } from "./eventlog.js";

export const MIN_GAMES = 3; // a standing counts for tiers and stars from this many matches on

// ---------- Tiers ----------
// Percentile of those with 3+ matches, best first: S top 5 %, A next 15 %, B next 25 %, C next 30 %, D next 15 %, F last 10 %
export const TIERS = [
  { k: "S", to: 0.05, color: "#f0b84b" },
  { k: "A", to: 0.2, color: "var(--pink)" },
  { k: "B", to: 0.45, color: "#9b87f5" },
  { k: "C", to: 0.75, color: "#4fa8e8" },
  { k: "D", to: 0.9, color: "#8b95a3" },
  { k: "F", to: 1, color: "#d0566e" },
];
export const MIN_FOR_TIERS = 5; // fewer judged: no tiers yet
// rows: { id: [elo, wins, losses] } → { map: Map(id → tier letter), counts: {S: n, …}, judged }
export function tiersOf(rows) {
  const judged = Object.entries(rows || {}).filter(([, r]) => r[1] + r[2] >= MIN_GAMES).sort((a, b) => b[1][0] - a[1][0]);
  const map = new Map();
  const counts = Object.fromEntries(TIERS.map((x) => [x.k, 0]));
  if (judged.length >= MIN_FOR_TIERS)
    judged.forEach(([id], i) => {
      const q = i / judged.length;
      const tier = TIERS.find((x) => q < x.to).k;
      map.set(id, tier);
      counts[tier]++;
    });
  return { map, counts, judged: judged.length };
}
export const tierBadge = (k) => (k ? `<span class="kb-tier is-${k}" style="--tc:${TIERS.find((x) => x.k === k).color}" title="${t("Tier {tier}", { tier: k })}">${k}</span>` : "");

// ---------- Options of the matches (this browser) ----------
const DEF_OPTS = { kNew: 40, kOld: 24, newUntil: 10 };
export const matchOpts = () => Object.assign({}, DEF_OPTS, store.get("versusOpts", {}));

// ---------- Ledger: the last 10 matches of an item: [opponent id, 1 won / 0 lost, points, minutes since 1970] ----------
const LEDGER_MAX = 10;
export const blankLedger = () => ({ scene: {}, image: {}, performer: {}, marker: {} });
export function pushLedger(data, kind, winId, loseId, dw, dl) {
  const m = Math.floor(Date.now() / 60000);
  const led = ((data.ledger = data.ledger || blankLedger())[kind] = data.ledger[kind] || {});
  [[winId, loseId, 1, dw], [loseId, winId, 0, -dl]].forEach(([id, opp, won, d]) => {
    const l = (led[id] = led[id] || []);
    l.push([opp, won, Math.round(d), m]);
    if (l.length > LEDGER_MAX) l.shift();
  });
}
export function popLedger(data, kind, winId, loseId) {
  const led = (data.ledger || {})[kind] || {};
  [winId, loseId].forEach((id) => led[id] && (led[id].pop(), !led[id].length && delete led[id]));
}
// Two ledgers → one: per item the one that has the newer last match
export function mergeLedger(a, b) {
  const out = blankLedger();
  Object.keys(out).forEach((k) => {
    out[k] = Object.assign({}, (b || {})[k]);
    Object.entries((a || {})[k] || {}).forEach(([id, l]) => {
      const o = out[k][id];
      if (!o || (l[l.length - 1] || [])[3] > (o[o.length - 1] || [])[3]) out[k][id] = l;
    });
  });
  return out;
}
// The ledger of one item as HTML; titles: Map(id → text)
export function ledgerHtml(entries, titles) {
  if (!entries || !entries.length) return `<p class="kb-hint">${t("No matches recorded yet.")}</p>`;
  return `<ol class="kb-led">${[...entries]
    .reverse()
    .map(([opp, won, d, min]) => `<li class="${won ? "is-win" : "is-loss"}"><b>${won ? t("Won") : t("Lost")}</b><span>${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}</span><em>${t("against {name}", { name: esc(titles.get(opp) || "#" + opp) })}</em><small>${fmtAgo(new Date(min * 60000).toISOString())}</small></li>`)
    .join("")}</ol>`;
}

// ---------- Options ----------
export function openOptions() {
  const o = matchOpts();
  const dr = openDrawer({
    title: t("Match options"),
    body: `<p class="kb-hint">${t("How far a pick moves the points (Elo). New ones move faster so they find their place sooner. Kept in this browser.")}</p>
      <label class="kb-vx-row"><b>${t("Points per pick – new ones")}</b><input class="kb-field" type="number" min="4" max="80" step="1" data-o="kNew" value="${o.kNew}"></label>
      <label class="kb-vx-row"><b>${t("Points per pick – settled ones")}</b><input class="kb-field" type="number" min="4" max="80" step="1" data-o="kOld" value="${o.kOld}"></label>
      <label class="kb-vx-row"><b>${t("New until … matches")}</b><input class="kb-field" type="number" min="1" max="50" step="1" data-o="newUntil" value="${o.newUntil}"></label>`,
    foot: `<button type="button" class="kb-btn is-ghost" data-reset>${t("Defaults")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-done>${t("Done")}</button>`,
  });
  dr.el.classList.add("kb-vx");
  dr.el.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.o;
    if (!k) return;
    const v = Math.min(Number(e.target.max), Math.max(Number(e.target.min), Math.round(Number(e.target.value) || DEF_OPTS[k])));
    e.target.value = v;
    store.set("versusOpts", Object.assign(matchOpts(), { [k]: v }));
  });
  dr.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-reset]")) {
      store.set("versusOpts", {});
      dr.close();
      toast(t("Defaults restored"), "ok");
    } else if (e.target.closest("[data-done]")) dr.close();
  });
}

// ---------- Overview of one kind ----------
export function overviewHtml(rows) {
  const all = Object.values(rows || {}).filter((r) => r[1] + r[2] > 0);
  if (!all.length) return "";
  const { counts, judged } = tiersOf(rows);
  const picks = all.reduce((s, r) => s + r[1], 0);
  const elos = all.filter((r) => r[1] + r[2] >= MIN_GAMES).map((r) => r[0]);
  const avg = elos.length ? Math.round(elos.reduce((s, x) => s + x, 0) / elos.length) : null;
  const stat = (n, label) => `<div class="kb-vx-stat"><b>${n}</b><small>${label}</small></div>`;
  const bar = judged >= MIN_FOR_TIERS
    ? `<div class="kb-tierbar" role="img" aria-label="${t("Tiers")}">${TIERS.filter((x) => counts[x.k]).map((x) => `<span class="is-${x.k}" style="--tc:${x.color};flex:${counts[x.k]}" title="${t("Tier {tier}", { tier: x.k })}: ${counts[x.k]}">${x.k} <small>${counts[x.k]}</small></span>`).join("")}</div>`
    : `<p class="kb-hint">${t("Tiers appear once {n} have 3 matches or more.", { n: MIN_FOR_TIERS })}</p>`;
  return `<div class="kb-vx-over">${stat(all.length, t("compared"))}${stat(picks, t("picks"))}${stat(judged, t("with 3+ matches"))}${avg != null ? stat(avg, t("average points")) : ""}${elos.length ? stat(Math.round(Math.max(...elos)), t("highest points")) : ""}</div>${bar}`;
}

// ---------- Snapshots ----------
const SNAP_KEYS = ["scene", "image", "performer", "marker"];
const MAX_SNAPS = 5;
const LABEL = { scene: "Scenes", image: "Images", performer: "Performers", marker: "Moments" };
async function loadSnaps() {
  try {
    return JSON.parse((await pluginConfig("stashui")).versusSnaps || "[]") || [];
  } catch (e) {
    return [];
  }
}
const saveSnaps = (l) => setPluginConfig("stashui", { versusSnaps: JSON.stringify(l.slice(-MAX_SNAPS)) });
const snapOf = (data, name) => ({
  id: Math.random().toString(36).slice(2, 10),
  name,
  at: Date.now(),
  data: Object.assign({ votes: data.votes || 0, bestStreak: data.bestStreak || 0 }, Object.fromEntries(SNAP_KEYS.map((k) => [k, data[k] || {}]))),
});
const countsOf = (d) => SNAP_KEYS.map((k) => [k, Object.keys(d[k] || {}).length]).filter(([, n]) => n);
const validShape = (d) => d && typeof d === "object" && SNAP_KEYS.some((k) => d[k] && typeof d[k] === "object") && SNAP_KEYS.every((k) => !d[k] || Object.values(d[k]).every((r) => Array.isArray(r) && r.length >= 3 && r.slice(0, 3).every(Number.isFinite)));

// getData(): the live standings; apply(snapData): replace the standings with these (and save them)
export function openSnapshots({ getData, apply }) {
  const dr = openDrawer({
    title: t("Snapshots of the standings"),
    body: `<p class="kb-hint">${t("A snapshot is a copy of all standings – scenes, images, performers and moments. It's kept in Stash (the last 5). Restoring replaces the current standings; a snapshot of the current state is made first.")}</p><div data-list><div class="kb-loading">${t("Loading …")}</div></div>`,
    foot: `<button type="button" class="kb-btn is-ghost" data-export>${icon("download")}${t("Export file")}</button><button type="button" class="kb-btn is-ghost" data-import>${icon("plus")}${t("Import file …")}</button><span class="kb-spacer"></span><button type="button" class="kb-btn" data-snap>${t("Take a snapshot")}</button>`,
  });
  const el = dr.el;
  el.classList.add("kb-vx");
  let snaps = [];
  const paint = () => {
    el.querySelector("[data-list]").innerHTML = snaps.length
      ? `<ul class="kb-vx-snaps">${[...snaps]
          .reverse()
          .map((s) => `<li data-id="${esc(s.id)}"><span><b>${esc(s.name)}</b><small>${esc(new Date(s.at).toLocaleString())} · ${countsOf(s.data).map(([k, n]) => `${n} ${t(LABEL[k])}`).join(", ") || t("empty")}</small></span><button type="button" class="kb-btn is-ghost" data-restore>${t("Restore")}</button><button type="button" class="kb-btn is-ghost" data-del title="${t("Delete")}">×</button></li>`)
          .join("")}</ul>`
      : `<p class="kb-hint">${t("No snapshots yet.")}</p>`;
  };
  loadSnaps().then((l) => ((snaps = l), paint()));
  const take = async (name) => {
    snaps = await loadSnaps();
    snaps.push(snapOf(getData(), name));
    snaps = snaps.slice(-MAX_SNAPS);
    await saveSnaps(snaps);
    logEvent("versus", "info", "Snapshot taken: {name}", { name });
  };
  const restore = async (d, label) => {
    const ok = await confirmDialog({ title: t("Restore this state?"), text: t("The current standings are replaced by “{name}” (in every browser). A snapshot of the current state is taken first.", { name: label }), ok: t("Restore") });
    if (!ok.ok) return false;
    await take(t("Before restoring"));
    apply(d);
    logEvent("versus", "warn", "Standings restored: {name}", { name: label });
    toast(t("Standings restored"), "ok");
    return true;
  };
  el.addEventListener("click", async (e) => {
    try {
      const li = e.target.closest("[data-id]");
      if (e.target.closest("[data-snap]")) {
        await take(new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        paint();
        toast(t("Snapshot taken"), "ok");
      } else if (li && e.target.closest("[data-restore]")) {
        const s = snaps.find((x) => x.id === li.dataset.id);
        if (s && (await restore(s.data, s.name))) dr.close();
      } else if (li && e.target.closest("[data-del]")) {
        snaps = snaps.filter((x) => x.id !== li.dataset.id);
        await saveSnaps(snaps);
        paint();
      } else if (e.target.closest("[data-export]")) {
        const blob = new Blob([JSON.stringify(snapOf(getData(), "export").data)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `stash-ui-versus-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        logEvent("versus", "info", "Standings exported to a file");
      } else if (e.target.closest("[data-import]")) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".json,application/json";
        inp.onchange = async () => {
          try {
            const d = JSON.parse(await inp.files[0].text());
            if (!validShape(d)) throw new Error(t("That's not a file with Versus standings."));
            if (await restore(d, inp.files[0].name)) dr.close();
          } catch (er) {
            errorToast(er, t("Import"));
          }
        };
        inp.click();
      }
    } catch (er) {
      errorToast(er, t("Snapshots"));
    }
  });
}
