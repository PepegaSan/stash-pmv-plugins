// Sharing: how this page talks to the receiver on your PC (sharing.py, through the admin port + token that Stash UI's backend
// hands out) and to the receivers of other people (their link: <address>/s/<token> → /api/hello, /api/send, /api/msg).
// Also: your name / picture, saved links (contacts), the menu badge.

import { store } from "./ui.js";
import { runBackend } from "./interactive.js";
import { t } from "./i18n.js";

// ---------- your own receiver ----------
const SS = "stashui.shareConn";
export const conn = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SS));
  } catch (e) {
    return null;
  }
};
const setConn = (c) => {
  try {
    if (c) sessionStorage.setItem(SS, JSON.stringify(c));
    else sessionStorage.removeItem(SS);
  } catch (e) { /* private window */ }
};

// ensure = start the receiver when it isn't running
export async function status(ensure = false) {
  const st = await runBackend({ mode: "share_status", ensure });
  setConn(st.running ? { host: location.hostname, port: st.adminPort, token: st.token } : null);
  if (st.running) store.set("shareUsed", true);
  return st;
}

const adminUrl = (path) => {
  const c = conn();
  if (!c) throw new Error(t("Sharing isn't running"));
  return `${location.protocol}//${c.host}:${c.port}${path}${path.includes("?") ? "&" : "?"}k=${encodeURIComponent(c.token)}`;
};
export const fileUrl = (id) => adminUrl("/admin/file?id=" + encodeURIComponent(id));

// Without a body: GET. With one: POST (text/plain so the browser sends no preflight request)
export async function adm(path, body) {
  const r = await fetch(adminUrl(path), body === undefined ? { cache: "no-store" } : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
  return d;
}

// ---------- you ----------
const rand = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
export const me = () => ({
  sid: store.get("shareSid", "") || (store.set("shareSid", rand()), store.get("shareSid", "")),
  name: store.get("shareName", ""),
  avatar: store.get("shareAvatar", ""),
  about: store.get("shareAbout", ""),
});
export const setMe = (p) => {
  if ("name" in p) store.set("shareName", String(p.name || "").slice(0, 40));
  if ("avatar" in p) store.set("shareAvatar", p.avatar || "");
  if ("about" in p) store.set("shareAbout", String(p.about || "").slice(0, 160));
};
// The link others can answer to: the first permanent one that is switched on (set when your links are loaded)
export const myReply = () => store.get("shareReply", "");
export const setMyReply = (u) => store.set("shareReply", u || "");

// A picture from a file → a small square JPEG as data address (kept below ~25 KB)
function squareFrom(src, size, revoke) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      if (revoke) URL.revokeObjectURL(src);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => (revoke && URL.revokeObjectURL(src), reject(new Error(t("That isn't a picture"))));
    img.src = src;
  });
}
export const avatarFromFile = (file, size = 128) => squareFrom(URL.createObjectURL(file), size, true);
// A cut-out from the library (a data address) → the same small square
export const avatarFromDataUrl = (url, size = 128) => squareFrom(url, size, false);
export const safeAvatar = (a) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a || "") ? a : "");

// ---------- links of others ----------
// "https://host[:port][/prefix]/s/<token>" → { base, token, url }
export function parseLink(text) {
  const m = String(text || "").trim().match(/^(https?:\/\/[^\s/?#]+(?:\/[^\s?#]*?)?)\/s\/([A-Za-z0-9_-]{8,64})\/?(?:[?#].*)?$/);
  return m ? { base: m[1], token: m[2], url: `${m[1]}/s/${m[2]}` } : null;
}
const norm = (u) => (parseLink(u) || {}).url || String(u || "");
export const sameLink = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();

export const contacts = () => store.get("shareContacts", []).filter((c) => c && parseLink(c.url));
export const saveContacts = (list) => store.set("shareContacts", list);
export function addContact(c) {
  const list = contacts();
  const i = list.findIndex((x) => sameLink(x.url, c.url));
  const e = Object.assign({ at: Date.now() }, i >= 0 ? list[i] : {}, c, { url: norm(c.url) });
  if (i >= 0) list[i] = e;
  else list.unshift(e);
  saveContacts(list);
  return e;
}
export const removeContact = (url) => saveContacts(contacts().filter((c) => !sameLink(c.url, url)));

// Asks a link who it belongs to: { name, avatar, about, likes, dislikes, requireLiked, maxFileMB, chat } or an Error with
// .code = "invalid" | "expired" | "paused" | "off" | "offline"
export async function hello(url) {
  const l = parseLink(url);
  if (!l) throw Object.assign(new Error(t("That isn't a sharing link")), { code: "invalid" });
  let r;
  try {
    r = await fetch(`${l.base}/api/hello?l=${encodeURIComponent(l.token)}`, { cache: "no-store" });
  } catch (e) {
    throw Object.assign(new Error(t("Couldn't reach them – their PC or sharing may be off")), { code: "offline" });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) {
    const code = d.error || "invalid";
    const msg = { invalid: t("This link isn't valid"), expired: t("This link has expired"), paused: t("This link is switched off"), off: t("They aren't receiving right now") }[code] || t("This link isn't valid");
    throw Object.assign(new Error(msg), { code });
  }
  d.avatar = safeAvatar(d.avatar);
  return d;
}

// What can't be sent to someone, by their rules → "" or the reason
export function tagProblem(h, tags) {
  const have = new Set((tags || []).map((x) => String(x).trim().toLowerCase()));
  const bad = (h.dislikes || []).filter((x) => have.has(String(x).trim().toLowerCase()));
  if (bad.length) return t("Has a tag they don't want: {tags}", { tags: bad.slice(0, 3).join(", ") });
  if (h.requireLiked && (h.likes || []).length && !(h.likes || []).some((x) => have.has(String(x).trim().toLowerCase()))) return t("Has none of the tags they like");
  return "";
}

const WHY = () => ({ 403: t("They blocked you"), 404: t("This link isn't valid"), 410: t("This link has expired"), 413: t("Too big for them"), 415: t("File type not accepted"), 423: t("They aren't receiving right now"), 429: t("Limit reached – try later"), 507: t("Their inbox is full") });

// One file → their inbox. `meta` = { name, tags, mtime }. Resolves when it arrived, rejects with a readable reason.
export function sendFile(url, blob, meta, onProgress) {
  const l = parseLink(url);
  const id = me();
  const q = new URLSearchParams({ l: l.token, name: meta.name, from: id.name || "", sid: id.sid, tags: JSON.stringify(meta.tags || []), m: String(meta.mtime || 0) });
  if (myReply()) q.set("reply", myReply());
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${l.base}/api/send?${q}`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      if (x.status === 200) return resolve();
      let d = {};
      try {
        d = JSON.parse(x.responseText);
      } catch (e) { /* not JSON */ }
      const why = WHY()[x.status];
      reject(new Error(x.status === 422 || x.status === 429 || x.status === 413 ? d.detail || why : why || d.detail || d.error || "HTTP " + x.status));
    };
    x.onerror = () => reject(new Error(t("Couldn't reach them – their PC or sharing may be off")));
    x.send(blob);
  });
}

export async function sendMessage(url, text) {
  const l = parseLink(url);
  const id = me();
  let r;
  try {
    r = await fetch(`${l.base}/api/msg?l=${encodeURIComponent(l.token)}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ from: id.name || "", sid: id.sid, reply: myReply(), text }) });
  } catch (e) {
    throw new Error(t("Couldn't reach them – their PC or sharing may be off"));
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error === "chat off" ? t("They switched the chat off") : WHY()[r.status] || d.error || "HTTP " + r.status);
}

// Sent messages are kept in this browser, per saved link: { "<link url>": [{ at, text }] }
export const sentChat = () => store.get("shareChat", {});
export function keepSent(url, text) {
  const all = sentChat();
  const k = norm(url);
  (all[k] = all[k] || []).push({ at: Date.now() / 1000, text });
  all[k] = all[k].slice(-300);
  store.set("shareChat", all);
}

// ---------- menu badge ----------
let badgeTimer = 0;
export async function startBadge() {
  if (!store.get("shareUsed", false) || badgeTimer) return;
  try {
    await status(store.get("shareAuto", true));
  } catch (e) { /* no backend */ }
  const tick = async () => {
    let n = 0;
    try {
      if (conn()) {
        const s = await adm("/admin/summary");
        n = (s.inbox || 0) + (s.unread || 0);
      }
    } catch (e) {
      setConn(null);
    }
    setBadge(n);
    badgeTimer = setTimeout(tick, 20000);
  };
  tick();
}
export function setBadge(n) {
  document.querySelectorAll('[data-count="share"]').forEach((c) => (c.textContent = n ? String(n) : ""));
  window.__shareBadge = n;
}
window.addEventListener("stash:rail-changed", () => setTimeout(() => window.__shareBadge != null && setBadge(window.__shareBadge), 50));
