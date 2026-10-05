// Play a scene in an external player (mpv, VLC, IINA, Infuse, MPC-HC, PotPlayer, nPlayer, MX Player …): browsers
// only play a few video formats, and a media player on the computer or phone plays almost everything. The button
// hands the scene's stream address to the player through the player's own link type (a "protocol handler" the
// player or a small helper registers: for mpv the "mpv-handler", for VLC on Windows / Linux "vlc-protocol" –
// on iPhone, iPad, Mac and Android the apps bring theirs). Which players are offered is a setting (kept in Stash,
// so it's the same on every device); the link types are the players' public ones. Inspired by the "External Player
// Launcher" plugin for classic Stash.

import { esc, icon, toast, errorToast, store } from "./ui.js";
import { t } from "./i18n.js";
import { gql, pluginConfig, setPluginConfig } from "./api.js";

// OS: windows | mac | ios | android | linux – from the browser
export function platform() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Mac/i.test(navigator.platform || ua)) return "mac";
  if (/Win/i.test(navigator.platform || ua)) return "windows";
  return "linux";
}

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(String(s || "")))).replace(/\//g, "_").replace(/\+/g, "-").replace(/=/g, "");
const enc = encodeURIComponent;
const uri = encodeURI;
const clock = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
// intent://host/path#Intent;scheme=https;package=…;action=android.intent.action.VIEW;type=video/*;S.title=…;i.position=ms;end
const intent = (info, pkg) => {
  const m = /^(https?):\/\/(.*)$/.exec(info.stream) || [];
  return `intent://${uri(m[2] || info.stream)}#Intent;scheme=${m[1] || "http"};package=${pkg};action=android.intent.action.VIEW;type=video/*;S.title=${uri(info.title)};i.position=${Math.round(info.position * 1000)};end`;
};

// id, name, the systems it's offered on, and how its link is made from info { stream, caption, title, position (s) }
export const PLAYERS = [
  { id: "mpv", name: "mpv", on: ["windows", "linux"], url: (i) => `mpv-handler://play/${b64(i.stream)}/?subfile=${b64(i.caption)}&v_title=${b64(i.title)}&startat=${Math.floor(i.position)}`, hint: "Needs mpv-handler (github.com/akiirui/mpv-handler)" },
  { id: "mpvmac", name: "mpv", on: ["mac"], url: (i) => `mpvplay://${uri(i.stream)}`, hint: "Needs the mpv-handler for macOS (mpvplay://)" },
  { id: "mpvios", name: "mpv", on: ["ios"], url: (i) => `mpv://${uri(i.stream)}` },
  { id: "vlc", name: "VLC", on: ["windows", "linux", "mac"], url: (i) => `vlc://${i.stream}`, hint: "Needs vlc-protocol on Windows and Linux (github.com/stefansundin/vlc-protocol)" },
  { id: "vlcios", name: "VLC", on: ["ios"], url: (i) => `vlc-x-callback://x-callback-url/stream?url=${enc(i.stream)}&sub=${enc(i.caption)}` },
  { id: "vlcand", name: "VLC", on: ["android"], url: (i) => intent(i, "org.videolan.vlc") },
  { id: "iina", name: "IINA", on: ["mac"], url: (i) => `iina://weblink?url=${enc(i.stream)}&new_window=1` },
  { id: "infuse", name: "Infuse", on: ["mac", "ios"], url: (i) => `infuse://x-callback-url/play?url=${enc(i.stream)}&sub=${enc(i.caption)}` },
  { id: "npmac", name: "nPlayer", on: ["mac"], url: (i) => `nplayer-mac://weblink?url=${enc(i.stream)}&new_window=1` },
  { id: "nplayer", name: "nPlayer", on: ["ios"], url: (i) => `nplayer-${uri(i.stream)}` },
  { id: "mpchc", name: "MPC-HC", on: ["windows"], url: (i) => `mpc-hc://${i.stream}`, hint: "Needs a protocol handler for mpc-hc://" },
  { id: "potplayer", name: "PotPlayer", on: ["windows"], url: (i) => `potplayer://${uri(i.stream)} /seek=${clock(i.position)} /title="${i.title}"`, hint: "Needs the PotPlayer protocol handler" },
  { id: "mx", name: "MX Player", on: ["android"], url: (i) => intent(i, "com.mxtech.videoplayer.ad") },
  { id: "mxpro", name: "MX Player Pro", on: ["android"], url: (i) => intent(i, "com.mxtech.videoplayer.pro") },
];
export const playersHere = () => PLAYERS.filter((p) => p.on.includes(platform()));

// ---------- Which players are offered (kept in Stash: the same on every device) ----------
let cfg = null; // { enabled: [ids] | null (= the first two of this system) }
export async function loadExtPlayers(force) {
  if (cfg && !force) return cfg;
  try {
    cfg = JSON.parse((await pluginConfig("pepega-stashui")).extPlayers || "{}") || {};
  } catch (e) {
    cfg = {};
  }
  return cfg;
}
export const saveExtPlayers = async (patch) => {
  cfg = Object.assign(await loadExtPlayers(), patch);
  await setPluginConfig("pepega-stashui", { extPlayers: JSON.stringify(cfg) });
};
// The ones shown: the chosen, else the first two this system has (e.g. mpv and VLC)
export async function offeredPlayers() {
  const c = await loadExtPlayers();
  const here = playersHere();
  const pick = Array.isArray(c.enabled) ? here.filter((p) => c.enabled.includes(p.id)) : here.slice(0, 2);
  return pick;
}

// ---------- The link for a scene ----------
let apiKey; // undefined: not asked yet
async function key() {
  if (apiKey === undefined) apiKey = await gql(`query { configuration { general { apiKey } } }`).then((d) => d.configuration.general.apiKey || "").catch(() => "");
  return apiKey;
}
const absolute = (path, k) => {
  const u = new URL(path, location.href);
  if (k) u.searchParams.set("apikey", k); // the player can't log in – the key lets it in
  return u.toString();
};

export async function infoOf(scene, position) {
  const k = await key();
  const f = (scene.files || [])[0] || {};
  const cap = scene.captions && scene.captions[0] && scene.paths && scene.paths.caption ? absolute(scene.paths.caption + "?lang=" + scene.captions[0].language_code + "&type=" + scene.captions[0].caption_type, k) : "";
  return { stream: absolute(scene.paths.stream, k), caption: cap, title: scene.title || f.basename || `Scene ${scene.id}`, position: position || 0 };
}
export async function linkFor(playerId, scene, position) {
  const p = PLAYERS.find((x) => x.id === playerId);
  return p ? p.url(await infoOf(scene, position)) : null;
}
export async function launch(playerId, scene, position) {
  const link = await linkFor(playerId, scene, position);
  if (!link) return;
  // (a link type the system doesn't know does nothing – the browser may ask first)
  window.dispatchEvent(new CustomEvent("stash:extplayer", { detail: { playerId, link } }));
  const a = document.createElement("a");
  a.href = link;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// A small menu next to a button: one entry per offered player (pos(): the position in seconds, if there is one)
export async function openPlayerMenu(anchor, scene, pos) {
  document.querySelectorAll(".kb-extmenu").forEach((m) => m.remove());
  const list = await offeredPlayers();
  const menu = document.createElement("div");
  menu.className = "kb-extmenu";
  menu.innerHTML = list.length
    ? `<b>${t("Play in …")}</b>` + list.map((p) => `<button type="button" data-ext="${p.id}">${icon("play")}<span>${esc(p.name)}</span></button>`).join("") + `<small>${t("Needs the player (and for some a small helper) on this device – see Settings → Player and previews.")}</small>`
    : `<p class="kb-hint">${t("No external player chosen – pick some under Settings → Player and previews.")}</p>`;
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + "px";
  menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + "px";
  const close = (e) => {
    if (e && (menu.contains(e.target) || anchor.contains(e.target))) return;
    menu.remove();
    document.removeEventListener("pointerdown", close, true);
  };
  document.addEventListener("pointerdown", close, true);
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ext]");
    if (!b) return;
    menu.remove();
    try {
      await launch(b.dataset.ext, scene, pos ? pos() : 0);
      toast(t("Sent to {player} …", { player: PLAYERS.find((p) => p.id === b.dataset.ext).name }), "ok");
    } catch (er) {
      errorToast(er, "External player");
    }
  });
}
